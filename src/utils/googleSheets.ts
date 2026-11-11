import { getGoogleAccessToken } from './googleAuth';
import type { StravaActivity, StravaActivityDetailsRecord } from './stravaActivities';
import {
  classifyActivity,
  formatSportMetrics,
  calculateActivityTSS,
  calculateNormalizedPower,
  markStravaActivityPublishedToGoogleSheets,
  saveStravaActivityDetails,
  getCachedStravaActivityRecord,
  getAllCachedStravaActivityRecords,
  updateStravaActivityRecord,
} from './stravaActivities';
import type { AthleteProfile } from '../types/athlete';
import { calculateWorkKj } from '../types/athlete';
import { computeDailyReadiness } from './readinessEngine';
import { loadAthleteProfile } from './athleteStorage';

export const GOOGLE_SHEETS_CONFIG = {
  STORAGE_KEYS: {
    SPREADSHEET_ID: 'gymfit_google_sheets_spreadsheet_id',
    SPREADSHEET_NAME: 'gymfit_google_sheets_spreadsheet_name',
    LAST_CHECKED: 'gymfit_google_sheets_last_checked',
  },
  DEFAULT_SPREADSHEET_NAME: 'GymFIT Training Log',
};

/**
 * Formats an ISO timestamp, Date, or epoch ms as "YYYY-MM-DD HH:MM:SS" (no "T", fractional ms, or "Z")
 * so Google Sheets USER_ENTERED parses it natively as a sortable Date-Time value.
 */
export function formatSheetDateTime(value?: string | Date | number | null): string {
  if (value === null || value === undefined || value === '') return '';

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 19).replace('T', ' ');
  }

  if (typeof value === 'number') {
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }

  const trimmed = String(value).trim();
  if (!trimmed) return '';

  // Preserve wall-clock date & time from ISO strings (e.g. Strava start_date_local "2026-11-10T19:38:28Z")
  const isoMatch = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/i
  );
  if (isoMatch) {
    return `${isoMatch[1]} ${isoMatch[2]}`;
  }

  const isoShortMatch = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?:Z|[+-]\d{2}:?\d{2})?$/i
  );
  if (isoShortMatch) {
    return `${isoShortMatch[1]} ${isoShortMatch[2]}:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 19).replace('T', ' ');
  }

  return trimmed;
}

/**
 * Extracts a Google Spreadsheet ID from either a raw ID or a full Google Sheets URL
 */
export function parseSpreadsheetId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];
  if (/^[a-zA-Z0-9-_]{20,80}$/.test(trimmed)) return trimmed;
  return null;
}

export function setCustomSpreadsheetId(idOrUrl: string, name = 'GymFIT Training Log'): string | null {
  const parsed = parseSpreadsheetId(idOrUrl);
  if (parsed) {
    saveCachedSpreadsheetId(parsed, name);
    return parsed;
  }
  return null;
}

export interface SheetExportResult {
  success: boolean;
  alreadyExists: boolean;
  spreadsheetId: string;
  spreadsheetUrl: string;
  error?: string;
}

export function getCachedSpreadsheetId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(GOOGLE_SHEETS_CONFIG.STORAGE_KEYS.SPREADSHEET_ID);
}

export function saveCachedSpreadsheetId(id: string, name?: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(GOOGLE_SHEETS_CONFIG.STORAGE_KEYS.SPREADSHEET_ID, id);
  if (name) {
    localStorage.setItem(GOOGLE_SHEETS_CONFIG.STORAGE_KEYS.SPREADSHEET_NAME, name);
  }
}

/**
 * Check if the Google Sheet is reachable and accessible
 */
export async function checkGoogleSheetsReachability(): Promise<{ reachable: boolean; spreadsheetId?: string; error?: string }> {
  const token = getGoogleAccessToken();
  if (!token) {
    return { reachable: false, error: 'Not authenticated with Google' };
  }

  const spreadsheetId = getCachedSpreadsheetId();
  if (!spreadsheetId) {
    return { reachable: false, error: 'No spreadsheet linked yet' };
  }

  try {
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      return { reachable: true, spreadsheetId };
    }
    return { reachable: false, error: `Spreadsheet check failed (${res.status})` };
  } catch (err: any) {
    return { reachable: false, error: err.message || 'Network error reaching Google Sheets' };
  }
}

export const STREAMS_SHEET_TITLE = 'Streams';
export const STREAMS_SHEET_HEADERS = [
  'Strava Activity ID',
  'Date / Time',
  'Activity Name',
  'Category',
  'Stream Keys',
  'Data Points',
  'Streams Payload (JSON)',
  'Backed Up At',
];

/**
 * Find or create the dedicated "GymFIT Training Log" spreadsheet in the user's Google Drive
 */
export async function getOrCreateTrainingLogSheet(): Promise<string> {
  const token = getGoogleAccessToken();
  if (!token) {
    throw new Error('Google authorization token is required. Please connect your Google account.');
  }

  const existingId = getCachedSpreadsheetId();
  if (existingId) {
    // Validate that it still exists
    try {
      const verifyRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${existingId}?fields=spreadsheetId,properties.title`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (verifyRes.ok) {
        return existingId;
      }
    } catch {
      // If error, fall through to search or create
    }
  }

  // Search Drive for an existing "GymFIT Training Log" or legacy "FIT Track Training Log" file
  try {
    const query = encodeURIComponent("(name = 'GymFIT Training Log' or name = 'FIT Track Training Log') and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        const foundId = searchData.files[0].id;
        saveCachedSpreadsheetId(foundId, searchData.files[0].name);
        return foundId;
      }
    }
  } catch {
    // Search failed, fall through to creation
  }

  // Create new Spreadsheet with Workouts and Health tabs
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: GOOGLE_SHEETS_CONFIG.DEFAULT_SPREADSHEET_NAME,
      },
      sheets: [
        {
          properties: {
            title: 'Workouts',
            gridProperties: {
              frozenRowCount: 1,
            },
          },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: [
                    { userEnteredValue: { stringValue: 'Date / Time' } },
                    { userEnteredValue: { stringValue: 'Strava Activity ID' } },
                    { userEnteredValue: { stringValue: 'Activity Name' } },
                    { userEnteredValue: { stringValue: 'Category' } },
                    { userEnteredValue: { stringValue: 'Sub-Type' } },
                    { userEnteredValue: { stringValue: 'Moving Time (min)' } },
                    { userEnteredValue: { stringValue: 'Elapsed Time (min)' } },
                    { userEnteredValue: { stringValue: 'Distance (km)' } },
                    { userEnteredValue: { stringValue: 'Elevation Gain (m)' } },
                    { userEnteredValue: { stringValue: 'Pace / Speed' } },
                    { userEnteredValue: { stringValue: 'Avg HR (bpm)' } },
                    { userEnteredValue: { stringValue: 'Max HR (bpm)' } },
                    { userEnteredValue: { stringValue: 'Avg Watts (W)' } },
                    { userEnteredValue: { stringValue: 'Avg Cadence (rpm)' } },
                    { userEnteredValue: { stringValue: 'TSS (Training Stress Score)' } },
                    { userEnteredValue: { stringValue: 'Pre-Workout Feeling (1-5)' } },
                    { userEnteredValue: { stringValue: 'RPE (1-10)' } },
                    { userEnteredValue: { stringValue: 'sRPE Load' } },
                    { userEnteredValue: { stringValue: 'Calories (kcal)' } },
                    { userEnteredValue: { stringValue: 'FIT Track Breakdown / Notes' } },
                    { userEnteredValue: { stringValue: 'Strava URL' } },
                    { userEnteredValue: { stringValue: 'Synced At' } },
                  ],
                },
              ],
            },
          ],
        },
        {
          properties: {
            title: 'Health',
            gridProperties: {
              frozenRowCount: 1,
            },
          },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: HEALTH_SHEET_HEADERS.map((h) => ({ userEnteredValue: { stringValue: h } })),
                },
              ],
            },
          ],
        },
        {
          properties: {
            title: STREAMS_SHEET_TITLE,
            gridProperties: {
              frozenRowCount: 1,
            },
          },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: STREAMS_SHEET_HEADERS.map((h) => ({ userEnteredValue: { stringValue: h } })),
                },
              ],
            },
          ],
        },
      ],
    }),
  });

  if (!createRes.ok) {
    const errorData = await createRes.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to create Google Spreadsheet (${createRes.status})`);
  }

  const createdData = await createRes.json();
  const newId = createdData.spreadsheetId;
  saveCachedSpreadsheetId(newId, GOOGLE_SHEETS_CONFIG.DEFAULT_SPREADSHEET_NAME);
  return newId;
}

/**
 * Check existing Strava Activity IDs in the sheet to prevent any duplicate insertion
 */
export async function getExistingActivityIdsInSheet(spreadsheetId: string): Promise<Set<string>> {
  const token = getGoogleAccessToken();
  if (!token) return new Set();

  try {
    // Read column B (Strava Activity ID)
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Workouts!B2:B5000`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!res.ok) {
      // Try fallback to Sheet1!B2:B if renamed or initial sheet
      const fallbackRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/B2:B5000`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!fallbackRes.ok) return new Set();
      const fallbackData = await fallbackRes.json();
      const rows = fallbackData.values || [];
      return new Set(rows.map((row: any[]) => String(row[0]).trim()).filter(Boolean));
    }

    const data = await res.json();
    const rows = data.values || [];
    return new Set(rows.map((row: any[]) => String(row[0]).trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

/**
 * Check existing Strava Activity IDs in the Streams tab to prevent duplicate stream rows
 */
export async function getExistingStreamActivityIdsInSheet(spreadsheetId: string, token: string): Promise<Set<string>> {
  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        STREAMS_SHEET_TITLE + '!A2:A'
      )}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return new Set();
    const data = await res.json();
    const rows = data.values || [];
    return new Set(rows.map((row: any[]) => String(row[0]).trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

/**
 * Formats a Strava activity with all its analysis, streams, and calibration metrics into a 22-column Google Sheet row
 */
export function buildActivitySheetRow(
  activity: StravaActivity,
  details?: StravaActivityDetailsRecord,
  athleteProfile?: AthleteProfile
): string[] {
  const actIdStr = String(activity.id);
  const classification = classifyActivity(activity);
  const metrics = formatSportMetrics(activity, details);

  const effectiveMovingSec = details?.calibration?.calibratedMovingTimeSec ?? activity.moving_time ?? 0;
  const effectiveDistanceM = details?.calibration?.calibratedDistanceM ?? activity.distance ?? 0;

  const durationMovingMin = effectiveMovingSec ? (effectiveMovingSec / 60).toFixed(1) : '0';
  const durationElapsedMin = activity.elapsed_time ? (activity.elapsed_time / 60).toFixed(1) : durationMovingMin;
  const distanceKm = effectiveDistanceM > 0 ? (effectiveDistanceM / 1000).toFixed(2) : '';
  const elevationM = activity.total_elevation_gain && activity.total_elevation_gain > 0
    ? Math.round(activity.total_elevation_gain).toString()
    : '';

  // Calculate stream aggregates if available
  const streams = details?.streams as Record<string, { data?: any[] }> | undefined;

  // Power metrics strictly for Turbo Trainer or Bike only!
  const isBikeOrTurbo = classification.subType === 'Turbo Trainer' || classification.subType === 'Bike';
  let avgWatts = '';
  let normalizedPowerStr = '';
  let workKjStr = '';

  if (isBikeOrTurbo) {
    const rawWatts = details?.calibration?.calibratedAvgWatts ?? activity.average_watts;
    if (rawWatts) {
      avgWatts = Math.round(rawWatts).toString();
    } else if (streams?.watts?.data && streams.watts.data.length > 0) {
      const watts = streams.watts.data.filter((n: any) => typeof n === 'number' && n > 0);
      if (watts.length > 0) {
        avgWatts = Math.round(watts.reduce((a: number, b: number) => a + b, 0) / watts.length).toString();
      }
    }

    const np = calculateNormalizedPower(activity, details);
    if (np && np > 0) {
      normalizedPowerStr = `${Math.round(np)}W NP`;
    }

    if (avgWatts && effectiveMovingSec > 0) {
      const work = calculateWorkKj(Number(avgWatts), effectiveMovingSec);
      workKjStr = work.formattedKj;
    }
  }

  let avgCadence = activity.average_cadence ? Math.round(activity.average_cadence).toString() : '';
  let avgHr = details?.calibration?.calibratedAvgHeartRate
    ? String(details.calibration.calibratedAvgHeartRate)
    : activity.average_heartrate ? Math.round(activity.average_heartrate).toString() : '';
  let maxHr = details?.calibration?.calibratedMaxHeartRate
    ? String(details.calibration.calibratedMaxHeartRate)
    : activity.max_heartrate ? Math.round(activity.max_heartrate).toString() : '';

  if (streams) {
    if (!avgHr && streams.heartrate?.data && streams.heartrate.data.length > 0) {
      const hrs = streams.heartrate.data.filter((n: any) => typeof n === 'number' && n > 0);
      if (hrs.length > 0) {
        avgHr = Math.round(hrs.reduce((a: number, b: number) => a + b, 0) / hrs.length).toString();
        maxHr = Math.max(...hrs).toString();
      }
    }
    if (!avgCadence && streams.cadence?.data && streams.cadence.data.length > 0) {
      const cadences = streams.cadence.data.filter((n: any) => typeof n === 'number' && n > 0);
      if (cadences.length > 0) {
        avgCadence = Math.round(cadences.reduce((a: number, b: number) => a + b, 0) / cadences.length).toString();
      }
    }
  }

  // Calculate TSS customized with athlete profile & calibration
  const tssResult = calculateActivityTSS(activity, details, athleteProfile);
  const tssValue = tssResult ? `${tssResult.tss} (${tssResult.type})` : '';

  const rawDescription = (details?.activity?.description as string) || '';
  const calories = (details?.activity?.calories as number) || (activity as any).calories || '';
  const stravaUrl = `https://www.strava.com/activities/${activity.id}`;
  const syncedAtFormatted = formatSheetDateTime(new Date());

  // Combine power notes if present
  let breakdownNotes = rawDescription;
  if (normalizedPowerStr || workKjStr) {
    const powerNote = [normalizedPowerStr, workKjStr].filter(Boolean).join(' · ');
    breakdownNotes = breakdownNotes ? `${powerNote} | ${breakdownNotes}` : powerNote;
  }
  if (details?.calibration) {
    breakdownNotes = `[Calibrated] ${breakdownNotes}`;
  }

  const effortFeedback = details?.effortFeedback;
  const preFeelingStr = effortFeedback?.preWorkoutFeeling
    ? `${effortFeedback.preWorkoutFeeling}/5`
    : '';
  const rpeStr = effortFeedback?.rpe
    ? `${effortFeedback.rpe}/10`
    : '';
  const sRpeLoadStr = effortFeedback?.sRpeLoad
    ? String(effortFeedback.sRpeLoad)
    : '';

  if (rpeStr || preFeelingStr) {
    const feedbackNote = [preFeelingStr ? `Pre: ${preFeelingStr}` : '', rpeStr ? `RPE: ${rpeStr} (${sRpeLoadStr} sRPE)` : ''].filter(Boolean).join(' · ');
    breakdownNotes = breakdownNotes ? `${feedbackNote} | ${breakdownNotes}` : feedbackNote;
  }

  return [
    formatSheetDateTime(activity.start_date_local || activity.start_date),
    actIdStr,
    activity.name,
    classification.category,
    classification.subType,
    durationMovingMin,
    durationElapsedMin,
    distanceKm,
    elevationM,
    metrics.primaryMetricLabel + (metrics.secondaryMetricLabel ? ` · ${metrics.secondaryMetricLabel}` : ''),
    avgHr,
    maxHr,
    avgWatts ? (normalizedPowerStr ? `${avgWatts}W (${normalizedPowerStr})` : avgWatts) : '',
    avgCadence,
    tssValue,
    preFeelingStr,
    rpeStr,
    sRpeLoadStr,
    calories ? Math.round(Number(calories)).toString() : '',
    breakdownNotes.slice(0, 500),
    stravaUrl,
    syncedAtFormatted,
  ];
}

/**
 * Append a single Strava activity with enhanced analysis and stream telemetry to Google Sheets
 */
export async function appendActivityToTrainingLog(
  activity: StravaActivity,
  details?: StravaActivityDetailsRecord,
  athleteProfile?: AthleteProfile
): Promise<SheetExportResult> {
  const token = getGoogleAccessToken();
  if (!token) {
    throw new Error('Google authorization token is required. Please connect your Google account.');
  }

  const spreadsheetId = await getOrCreateTrainingLogSheet();
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // Anti-duplication check: check if this activity ID is already in the sheet
  const existingIds = await getExistingActivityIdsInSheet(spreadsheetId);
  const actIdStr = String(activity.id);

  if (existingIds.has(actIdStr)) {
    if (details?.streams) {
      backupActivityStreamsToGoogleSheet(activity, details.streams, spreadsheetId).catch((err) => {
        console.warn('[Google Sheets] Stream backup notice:', err);
      });
    }
    return {
      success: true,
      alreadyExists: true,
      spreadsheetId,
      spreadsheetUrl,
    };
  }

  const rowValues = buildActivitySheetRow(activity, details, athleteProfile);

  // Append row to sheet
  const appendRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Workouts!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [rowValues],
      }),
    }
  );

  if (!appendRes.ok) {
    // Retry with Sheet1
    const fallbackRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [rowValues],
        }),
      }
    );

    if (!fallbackRes.ok) {
      const errData = await fallbackRes.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Failed to append workout to Google Sheet (${fallbackRes.status})`);
    }
  }

  await markStravaActivityPublishedToGoogleSheets(activity.id);

  if (details?.streams) {
    backupActivityStreamsToGoogleSheet(activity, details.streams, spreadsheetId).catch((err) => {
      console.warn('[Google Sheets] Stream backup notice:', err);
    });
  }

  return {
    success: true,
    alreadyExists: false,
    spreadsheetId,
    spreadsheetUrl,
  };
}

export interface BatchBackupProgress {
  stage: 'checking' | 'workouts' | 'streams';
  current: number;
  total: number;
  message: string;
}

export interface BatchBackupResult {
  success: boolean;
  backedUpCount: number;
  alreadyCount: number;
  streamsBackedUpCount: number;
  streamsAlreadyCount: number;
  error?: string;
}

/**
 * Batch backup multiple Strava activities and their telemetry streams to Google Sheets at once
 * - Runs automatically or via "Backup to Sheets" button
 * - Avoids duplication in both Workouts tab (Column B ID) and Streams tab (Column A ID)
 * - Safely batches streams in chunks of 20 to strictly respect Google Sheets API quotas
 */
export async function batchBackupActivitiesToGoogleSheet(
  activities: StravaActivity[],
  detailsMap: Record<string, StravaActivityDetailsRecord> = {},
  athleteProfile?: AthleteProfile,
  spreadsheetIdParam?: string,
  onProgress?: (progress: BatchBackupProgress) => void
): Promise<BatchBackupResult> {
  const token = getGoogleAccessToken();
  if (!token) {
    return {
      success: false,
      backedUpCount: 0,
      alreadyCount: 0,
      streamsBackedUpCount: 0,
      streamsAlreadyCount: 0,
      error: 'Google authorization token required',
    };
  }

  const validActivities = activities.filter((a) => !a.isDeleted);
  if (validActivities.length === 0) {
    return {
      success: true,
      backedUpCount: 0,
      alreadyCount: 0,
      streamsBackedUpCount: 0,
      streamsAlreadyCount: 0,
    };
  }

  try {
    const spreadsheetId = spreadsheetIdParam || (await getOrCreateTrainingLogSheet());

    // Merge in-memory detailsMap with all IndexedDB records to guarantee all downloaded streams are available
    let mergedDetails: Record<string, StravaActivityDetailsRecord> = { ...detailsMap };
    try {
      const allCached = await getAllCachedStravaActivityRecords();
      if (allCached && Object.keys(allCached).length > 0) {
        mergedDetails = { ...allCached, ...mergedDetails };
      }
    } catch (cacheErr) {
      console.warn('[Google Sheets] Notice loading IndexedDB records for backup:', cacheErr);
    }

    // ==========================================
    // 1. WORKOUTS TAB BACKUP
    // ==========================================
    onProgress?.({
      stage: 'checking',
      current: 0,
      total: validActivities.length,
      message: 'Checking existing workouts in Google Sheets...',
    });

    const existingIds = await getExistingActivityIdsInSheet(spreadsheetId);
    const toAppend = validActivities.filter((act) => !existingIds.has(String(act.id)));

    if (toAppend.length > 0) {
      const rows = toAppend.map((act) => {
        const details = mergedDetails[String(act.id)];
        return buildActivitySheetRow(act, details, athleteProfile);
      });

      const CHUNK_SIZE = 100;
      for (let c = 0; c < rows.length; c += CHUNK_SIZE) {
        const chunk = rows.slice(c, c + CHUNK_SIZE);
        onProgress?.({
          stage: 'workouts',
          current: Math.min(c + chunk.length, rows.length),
          total: rows.length,
          message: `Backing up workouts: ${Math.min(c + chunk.length, rows.length)} / ${rows.length}...`,
        });

        let res = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Workouts!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ values: chunk }),
          }
        );

        if (!res.ok) {
          res = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ values: chunk }),
            }
          );
        }

        if (c + CHUNK_SIZE < rows.length) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      await Promise.all(toAppend.map((act) => markStravaActivityPublishedToGoogleSheets(act.id)));
    }

    // ==========================================
    // 2. STREAMS TAB BACKUP (NEVER SKIPPED!)
    // ==========================================
    onProgress?.({
      stage: 'checking',
      current: 0,
      total: validActivities.length,
      message: 'Checking Streams tab in Google Sheets...',
    });

    await ensureStreamsSheetExists(spreadsheetId, token);
    const existingStreamIds = await getExistingStreamActivityIdsInSheet(spreadsheetId, token);

    // Identify all activities that have streams locally but are missing from the Streams tab
    const streamRowsToAppend: (string | number)[][] = [];
    for (const act of validActivities) {
      const actIdStr = String(act.id);
      if (existingStreamIds.has(actIdStr)) continue; // already backed up in Streams tab

      const details = mergedDetails[actIdStr];
      const streams = details?.streams as Record<string, any> | undefined;
      if (!streams || typeof streams !== 'object' || Object.keys(streams).length === 0) continue;

      const { compactJson, keys, pointsCount } = compressStreamsForStorage(streams);
      if (keys.length === 0 || !compactJson || compactJson === '{}') continue;

      const { category } = classifyActivity(act);
      streamRowsToAppend.push([
        actIdStr,
        formatSheetDateTime(act.start_date_local || act.start_date),
        act.name || '',
        category || act.type || '',
        keys.join(', '),
        pointsCount,
        compactJson,
        formatSheetDateTime(new Date()),
      ]);
    }

    let streamsAppendedCount = 0;
    if (streamRowsToAppend.length > 0) {
      // Chunk in batches of 20 rows to keep payloads small (~400KB-800KB) and respect Google Sheets quotas
      const STREAM_CHUNK_SIZE = 20;
      for (let s = 0; s < streamRowsToAppend.length; s += STREAM_CHUNK_SIZE) {
        const chunk = streamRowsToAppend.slice(s, s + STREAM_CHUNK_SIZE);
        const currentCount = Math.min(s + chunk.length, streamRowsToAppend.length);
        onProgress?.({
          stage: 'streams',
          current: currentCount,
          total: streamRowsToAppend.length,
          message: `Backing up streams: ${currentCount} / ${streamRowsToAppend.length}...`,
        });

        const appendRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
            STREAMS_SHEET_TITLE + '!A1:H1'
          )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ values: chunk }),
          }
        );

        if (appendRes.ok) {
          streamsAppendedCount += chunk.length;
        } else {
          const errText = await appendRes.text().catch(() => '');
          console.warn(`[Google Sheets] Stream batch append warning (${appendRes.status}):`, errText);
        }

        // 250ms delay between batch chunks to avoid hitting Google's 60 writes/min limit
        if (s + STREAM_CHUNK_SIZE < streamRowsToAppend.length) {
          await new Promise((r) => setTimeout(r, 250));
        }
      }
    }

    return {
      success: true,
      backedUpCount: toAppend.length,
      alreadyCount: existingIds.size,
      streamsBackedUpCount: streamsAppendedCount,
      streamsAlreadyCount: existingStreamIds.size,
    };
  } catch (err: any) {
    console.error('[Google Sheets] batchBackupActivitiesToGoogleSheet failed:', err);
    return {
      success: false,
      backedUpCount: 0,
      alreadyCount: 0,
      streamsBackedUpCount: 0,
      streamsAlreadyCount: 0,
      error: err.message || 'Failed to backup activities to Google Sheets',
    };
  }
}

export interface SheetWorkoutSummary {
  activityId: string;
  tss?: number;
  avgHr?: number;
  maxHr?: number;
  avgWatts?: number;
  rpe?: number;
  date?: string;
  name?: string;
}

/**
 * Reads existing workout rows from Google Sheets to retrieve historical metrics
 */
export async function fetchWorkoutsFromGoogleSheet(
  spreadsheetIdParam?: string
): Promise<Map<string, SheetWorkoutSummary>> {
  const token = getGoogleAccessToken();
  const result = new Map<string, SheetWorkoutSummary>();
  if (!token) return result;

  try {
    const spreadsheetId = spreadsheetIdParam || (await getOrCreateTrainingLogSheet());
    let res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Workouts!A2:V5000`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A2:V5000`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
    }
    if (!res.ok) return result;

    const data = await res.json();
    const rows: any[][] = data.values || [];
    for (const row of rows) {
      const actId = String(row[1] || '').trim();
      if (!actId) continue;

      let tss: number | undefined;
      if (row[14]) {
        const match = String(row[14]).match(/^(\d+(?:\.\d+)?)/);
        if (match) tss = parseFloat(match[1]);
      }
      const avgHr = row[10] ? parseFloat(row[10]) : undefined;
      const maxHr = row[11] ? parseFloat(row[11]) : undefined;
      let avgWatts: number | undefined;
      if (row[12]) {
        const match = String(row[12]).match(/^(\d+(?:\.\d+)?)/);
        if (match) avgWatts = parseFloat(match[1]);
      }
      const rpe = row[16] ? parseFloat(row[16]) : undefined;

      result.set(actId, {
        activityId: actId,
        date: row[0],
        name: row[2],
        tss,
        avgHr,
        maxHr,
        avgWatts,
        rpe,
      });
    }
    return result;
  } catch (err) {
    console.warn('[Google Sheets] fetchWorkoutsFromGoogleSheet error:', err);
    return result;
  }
}

/**
 * Hydrates local activity details from existing Google Sheets data
 * Saves Strava read API calls by pulling already-calculated metrics from Google Sheets
 */
export async function hydrateActivitiesFromGoogleSheet(
  activities: StravaActivity[]
): Promise<number> {
  const token = getGoogleAccessToken();
  if (!token) return 0;

  try {
    const sheetData = await fetchWorkoutsFromGoogleSheet();
    if (sheetData.size === 0) return 0;

    let hydratedCount = 0;
    for (const act of activities) {
      const actId = String(act.id);
      const metrics = sheetData.get(actId);
      if (!metrics) continue;

      const existing = await getCachedStravaActivityRecord(actId);
      const hasStreams = Boolean(existing?.streams && Object.keys(existing.streams).length > 0);
      const hasTss = existing?.calibration?.manualTss !== undefined;

      // If local cache lacks streams or details, hydrate what we have from Google Sheets
      if (!hasStreams && !hasTss && (metrics.tss !== undefined || metrics.avgHr !== undefined)) {
        await saveStravaActivityDetails(actId, {
          activity: {
            id: act.id,
            name: act.name,
            type: act.type,
            sport_type: act.sport_type,
          },
          calibration: {
            manualTss: metrics.tss,
            calibratedAvgHeartRate: metrics.avgHr,
            calibratedMaxHeartRate: metrics.maxHr,
            calibratedAvgWatts: metrics.avgWatts,
          },
          effortFeedback: {
            rpe: metrics.rpe,
          },
          googleDrivePublishedAt: new Date().toISOString(),
          fetchedAt: new Date().toISOString(),
          isHydratedFromSheet: true,
        } as any);
        hydratedCount++;
      } else if (!existing?.googleDrivePublishedAt) {
        await markStravaActivityPublishedToGoogleSheets(actId);
      }
    }

    // Also attempt restoring any raw streams stored in the Google Sheets Streams tab
    try {
      const streamRestoreRes = await restoreStreamsFromGoogleSheet();
      if (streamRestoreRes.restoredCount > 0) {
        hydratedCount += streamRestoreRes.restoredCount;
      }
    } catch (streamErr) {
      console.warn('[Google Sheets] Stream restoration notice:', streamErr);
    }

    return hydratedCount;
  } catch (e) {
    console.warn('[Google Sheets] hydrateActivitiesFromGoogleSheet failed:', e);
    return 0;
  }
}

/**
 * Ensures the 'Streams' tab exists in the user's Google Spreadsheet.
 * If the sheet is older and doesn't have the tab yet, creates it and appends the header row.
 */
export async function ensureStreamsSheetExists(spreadsheetId: string, token: string): Promise<void> {
  try {
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!metaRes.ok) return;
    const meta = await metaRes.json();
    const sheetTitles = (meta.sheets || []).map((s: any) => s.properties?.title);
    if (sheetTitles.includes(STREAMS_SHEET_TITLE)) {
      return;
    }

    // Tab does not exist yet -> create it
    const addRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: STREAMS_SHEET_TITLE,
                  gridProperties: { frozenRowCount: 1 },
                },
              },
            },
          ],
        }),
      }
    );

    if (addRes.ok) {
      // Write header row
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
          STREAMS_SHEET_TITLE + '!A1:H1'
        )}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: [STREAMS_SHEET_HEADERS] }),
        }
      );
    }
  } catch (err) {
    console.warn('[Google Sheets] Failed to verify/create Streams tab:', err);
  }
}

/**
 * Compresses/formats activity streams into an optimized compact JSON payload.
 * Guarantees staying within Google Sheets' 50,000 character-per-cell limit.
 */
export function compressStreamsForStorage(streams: Record<string, any>): {
  compactJson: string;
  keys: string[];
  pointsCount: number;
} {
  const allowedKeys = [
    'time',
    'distance',
    'heartrate',
    'watts',
    'cadence',
    'velocity_smooth',
    'altitude',
    'temp',
    'moving',
    'grade_smooth',
    'latlng',
  ];
  const compact: Record<string, any[]> = {};
  const presentKeys: string[] = [];
  let maxPoints = 0;

  for (const k of allowedKeys) {
    const arr = streams[k]?.data || (Array.isArray(streams[k]) ? streams[k] : null);
    if (Array.isArray(arr) && arr.length > 0) {
      compact[k] = arr;
      presentKeys.push(k);
      if (arr.length > maxPoints) maxPoints = arr.length;
    }
  }

  let serialized = JSON.stringify(compact);

  // If serialized string exceeds 48,000 characters (Sheets max is 50,000),
  // adaptively sample points while keeping start and end points intact.
  if (serialized.length > 48000 && maxPoints > 0) {
    const targetLength = 40000;
    const ratio = serialized.length / targetLength;
    const step = Math.max(2, Math.ceil(ratio));

    const downsampled: Record<string, any[]> = {};
    for (const [key, arr] of Object.entries(compact)) {
      const sampledArr: any[] = [];
      for (let i = 0; i < arr.length; i += step) {
        sampledArr.push(arr[i]);
      }
      if ((arr.length - 1) % step !== 0) {
        sampledArr.push(arr[arr.length - 1]);
      }
      downsampled[key] = sampledArr;
    }
    serialized = JSON.stringify(downsampled);
  }

  return {
    compactJson: serialized,
    keys: presentKeys,
    pointsCount: maxPoints,
  };
}

/**
 * Reconstructs standard Strava stream objects from the compact JSON stored in Google Sheets.
 */
export function unpackStreamsFromStorage(
  compactJson: string
): Record<string, { data: any[] }> | null {
  try {
    if (!compactJson || typeof compactJson !== 'string') return null;
    const parsed = JSON.parse(compactJson);
    if (!parsed || typeof parsed !== 'object') return null;

    const unpacked: Record<string, { data: any[] }> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v)) {
        unpacked[k] = { data: v };
      }
    }
    return Object.keys(unpacked).length > 0 ? unpacked : null;
  } catch {
    return null;
  }
}

/**
 * Backs up an activity's raw streams to the 'Streams' tab in Google Sheets.
 * Deduplicates by Activity ID: updates existing row if present, otherwise appends.
 */
export async function backupActivityStreamsToGoogleSheet(
  activity: StravaActivity,
  streams: Record<string, any>,
  spreadsheetIdParam?: string
): Promise<{ success: boolean; error?: string }> {
  const token = getGoogleAccessToken();
  if (!token) return { success: false, error: 'Google authentication required' };

  try {
    const spreadsheetId = spreadsheetIdParam || (await getOrCreateTrainingLogSheet());
    await ensureStreamsSheetExists(spreadsheetId, token);

    const actIdStr = String(activity.id);
    const { compactJson, keys, pointsCount } = compressStreamsForStorage(streams);

    if (keys.length === 0 || !compactJson || compactJson === '{}') {
      return { success: true };
    }

    // Read column A of Streams tab to check if row already exists
    const checkRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        STREAMS_SHEET_TITLE + '!A2:A5000'
      )}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    let existingRowIndex = -1;
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      const rows = checkData.values || [];
      for (let r = 0; r < rows.length; r++) {
        if (rows[r] && String(rows[r][0]) === actIdStr) {
          existingRowIndex = r + 2; // 1-indexed, accounting for header row
          break;
        }
      }
    }

    const { category } = classifyActivity(activity);
    const rowValues = [
      actIdStr,
      formatSheetDateTime(activity.start_date_local || activity.start_date),
      activity.name || '',
      category || activity.type || '',
      keys.join(', '),
      pointsCount,
      compactJson,
      formatSheetDateTime(new Date()),
    ];

    if (existingRowIndex > 0) {
      // Update existing row
      const updateRange = `${STREAMS_SHEET_TITLE}!A${existingRowIndex}:H${existingRowIndex}`;
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
          updateRange
        )}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: [rowValues] }),
        }
      );
    } else {
      // Append new row
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
          STREAMS_SHEET_TITLE + '!A1:H1'
        )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: [rowValues] }),
        }
      );
    }

    return { success: true };
  } catch (err: any) {
    console.warn(`[Google Sheets] Failed to backup streams for ${activity.id}:`, err);
    return { success: false, error: err.message || 'Stream backup failed' };
  }
}

/**
 * Restores activity streams from Google Sheets into local IndexedDB.
 * Reads the 'Streams' tab and re-hydrates any activities that are missing streams locally.
 */
export async function restoreStreamsFromGoogleSheet(
  spreadsheetIdParam?: string
): Promise<{ success: boolean; restoredCount: number; error?: string }> {
  const token = getGoogleAccessToken();
  if (!token) return { success: false, restoredCount: 0, error: 'Not authenticated with Google' };

  try {
    const spreadsheetId = spreadsheetIdParam || (await getOrCreateTrainingLogSheet());
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        STREAMS_SHEET_TITLE + '!A2:H5000'
      )}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) return { success: true, restoredCount: 0 };
    const data = await res.json();
    const rows: string[][] = data.values || [];
    if (rows.length === 0) return { success: true, restoredCount: 0 };

    let restoredCount = 0;
    for (const row of rows) {
      const actId = row[0];
      const payload = row[6];
      if (!actId || !payload) continue;

      const existing = await getCachedStravaActivityRecord(actId);
      const hasLocalStreams = Boolean(existing?.streams && Object.keys(existing.streams).length > 0);

      if (!hasLocalStreams) {
        const unpacked = unpackStreamsFromStorage(payload);
        if (unpacked) {
          await updateStravaActivityRecord(actId, (record) => ({
            ...record,
            streams: unpacked,
            fetchedAt: record.fetchedAt || row[7] || new Date().toISOString(),
            googleDrivePublishedAt: record.googleDrivePublishedAt || row[7] || new Date().toISOString(),
          }));
          restoredCount++;
        }
      }
    }

    return { success: true, restoredCount };
  } catch (err: any) {
    return { success: false, restoredCount: 0, error: err.message || 'Failed to restore streams' };
  }
}

import type { DailyRecoveryLog } from '../types/recovery';

export const HEALTH_SHEET_HEADERS = [
  'Date',
  'Readiness Score',
  'Sleep Score',
  'Sleep Duration (hrs)',
  'HRV (rMSSD)',
  'Resting HR (bpm)',
  'Body Battery',
  'Stress',
  'Respiration (brpm)',
  'Pulse Ox / SpO2 (%)',
  'VO2 Max Run',
  'VO2 Max Bike',
  'Steps',
  'Calories (kcal)',
  'Deep Sleep (min)',
  'REM Sleep (min)',
  'Light Sleep (min)',
  'Awake (min)',
  'Source',
  'Notes / Tags',
  'Synced At',
];

export function formatHealthLogRow(
  log: DailyRecoveryLog,
  allLogs?: DailyRecoveryLog[],
  profile?: AthleteProfile
): (string | number)[] {
  const sleepHours = log.sleepDurationMinutes ? (log.sleepDurationMinutes / 60).toFixed(1) : '';
  const notesStr = [log.notes, ...(log.tags || [])].filter(Boolean).join(' · ');
  const syncedAtFormatted = formatSheetDateTime(new Date());

  // Compute Readiness Score (0-100%) dynamically if not stored statically
  let readinessScore: number | string = '';
  try {
    const athleteProf = profile || loadAthleteProfile();
    const logsContext = allLogs && allLogs.length > 0 ? allLogs : [log];
    const res = computeDailyReadiness(log, logsContext, athleteProf);
    if (res && Number.isFinite(res.score) && res.score > 0) {
      readinessScore = Math.round(res.score);
    }
  } catch {
    readinessScore = '';
  }

  return [
    normalizeDateToYyyyMmDd(log.date) || log.date,
    readinessScore,
    log.sleepScore ?? '',
    sleepHours,
    log.hrvRmssd ?? '',
    log.restingHr ?? '',
    log.bodyBattery ?? '',
    log.stress ?? '',
    log.respiration ?? '',
    log.pulseOx !== undefined ? `${log.pulseOx}%` : '',
    log.vo2MaxRun ?? '',
    log.vo2MaxBike ?? '',
    log.steps ?? '',
    log.calories ?? '',
    log.deepSleepMinutes ?? '',
    log.remSleepMinutes ?? '',
    log.lightSleepMinutes ?? '',
    log.awakeMinutes ?? '',
    log.source ?? 'garmin',
    notesStr,
    syncedAtFormatted,
  ];
}

/**
 * Ensure the "Health" sheet tab exists in the Google Spreadsheet with full 21 columns
 */
export async function getOrCreateHealthSheet(spreadsheetId: string): Promise<void> {
  const token = getGoogleAccessToken();
  if (!token) return;

  try {
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    const sheets = data.sheets || [];
    const hasHealth = sheets.some((s: any) => s.properties?.title === 'Health');

    if (!hasHealth) {
      // Add "Health" sheet
      const batchRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: 'Health',
                  gridProperties: { frozenRowCount: 1 },
                },
              },
            },
          ],
        }),
      });

      if (batchRes.ok) {
        // Populate header row A1:U1
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Health!A1:U1?valueInputOption=USER_ENTERED`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              values: [HEALTH_SHEET_HEADERS],
            }),
          }
        );
      }
    } else {
      // Check existing row 1 headers to preserve any user-customized labels or formatting
      const headerRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Health!1:1`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (headerRes.ok) {
        const headerData = await headerRes.json();
        const existingHeaders: string[] = headerData.values?.[0] || [];
        // If row 1 is completely empty, populate default headers
        if (existingHeaders.length === 0) {
          await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Health!A1:U1?valueInputOption=USER_ENTERED`,
            {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                values: [HEALTH_SHEET_HEADERS],
              }),
            }
          ).catch(() => {});
        } else if (existingHeaders.length < HEALTH_SHEET_HEADERS.length) {
          // If the sheet had fewer columns, append only the missing columns to the right without modifying existing headers
          const missingHeaders = HEALTH_SHEET_HEADERS.slice(existingHeaders.length);
          const startColLetter = String.fromCharCode(65 + existingHeaders.length);
          const endColLetter = String.fromCharCode(65 + HEALTH_SHEET_HEADERS.length - 1);
          await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Health!${startColLetter}1:${endColLetter}1?valueInputOption=USER_ENTERED`,
            {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                values: [missingHeaders],
              }),
            }
          ).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.warn('[Google Sheets] Failed to create or verify Health sheet:', err);
  }
}

/**
 * Normalizes various Google Sheets date representations (ISO, DD/MM/YYYY, MM/DD/YYYY, Excel serial numbers)
 * into standard YYYY-MM-DD
 */
export function normalizeDateToYyyyMmDd(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  if (!str) return '';

  // 1. Direct YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // 2. ISO or space-separated timestamp: 2026-10-31T... or 2026-10-31 19:38:28
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(str)) return str.slice(0, 10);

  // 3. YYYY/MM/DD
  const ymdMatch = str.match(/^(\d{4})[\/\.](\d{1,2})[\/\.](\d{1,2})$/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
  }

  // 4. DD/MM/YYYY or MM/DD/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyMatch) {
    const p1 = parseInt(dmyMatch[1], 10);
    const p2 = parseInt(dmyMatch[2], 10);
    const y = dmyMatch[3];
    if (p1 > 12) {
      // First part > 12 must be DD
      return `${y}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
    }
    if (p2 > 12) {
      // Second part > 12 must be DD
      return `${y}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
    }
    // Default to European/UK standard DD/MM/YYYY
    return `${y}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
  }

  // 5. Excel / Google Sheets serial date number
  const num = Number(str);
  if (Number.isFinite(num) && num > 30000 && num < 70000) {
    const dateFromSerial = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(dateFromSerial.getTime())) {
      return dateFromSerial.toISOString().slice(0, 10);
    }
  }

  // 6. Native JS Date parse fallback
  const dt = new Date(str);
  if (!isNaN(dt.getTime())) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return str;
}

/**
 * Retrieve the numerical sheetId of the "Health" tab
 */
export async function getHealthSheetId(spreadsheetId: string, token: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const healthSheet = (data.sheets || []).find((s: any) => s.properties?.title === 'Health');
    return healthSheet?.properties?.sheetId ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch health & recovery logs from the "Health" tab in Google Sheets
 */
export async function fetchHealthDataFromGoogleSheet(spreadsheetId?: string): Promise<DailyRecoveryLog[]> {
  const token = getGoogleAccessToken();
  if (!token) return [];

  const targetId = spreadsheetId || getCachedSpreadsheetId();
  if (!targetId) return [];

  try {
    await getOrCreateHealthSheet(targetId);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${targetId}/values/${encodeURIComponent('Health!A2:U3000')}?valueRenderOption=FORMATTED_VALUE`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!res.ok) return [];
    const data = await res.json();
    const rows = data.values || [];
    const logs: DailyRecoveryLog[] = [];

    for (const row of rows) {
      const date = normalizeDateToYyyyMmDd(row[0]);
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

      const sleepScore = Number(row[2]) || 0;
      const sleepHours = Number(row[3]) || 0;
      const sleepDurationMinutes = Math.round(sleepHours * 60);
      const hrvRmssd = Number(row[4]) || 0;
      const restingHr = Number(row[5]) || 41;

      // Extended Garmin biometrics
      const rawBattery = Number(row[6]);
      const bodyBattery = Number.isFinite(rawBattery) && rawBattery >= 0 ? rawBattery : undefined;

      const rawStress = Number(row[7]);
      const stress = Number.isFinite(rawStress) && rawStress >= 0 ? rawStress : undefined;

      const rawResp = Number(row[8]);
      const respiration = Number.isFinite(rawResp) && rawResp >= 0 ? rawResp : undefined;

      const rawPulseOxStr = String(row[9] || '').replace('%', '').trim();
      const rawPulseOx = Number(rawPulseOxStr);
      const pulseOx = Number.isFinite(rawPulseOx) && rawPulseOx >= 0 ? rawPulseOx : undefined;

      const rawVo2Run = Number(row[10]);
      const vo2MaxRun = Number.isFinite(rawVo2Run) && rawVo2Run > 0 ? rawVo2Run : undefined;

      const rawVo2Bike = Number(row[11]);
      const vo2MaxBike = Number.isFinite(rawVo2Bike) && rawVo2Bike > 0 ? rawVo2Bike : undefined;

      const rawSteps = Number(row[12]);
      const steps = Number.isFinite(rawSteps) && rawSteps >= 0 ? rawSteps : undefined;

      const rawCal = Number(row[13]);
      const calories = Number.isFinite(rawCal) && rawCal >= 0 ? rawCal : undefined;

      const deepSleepMinutes = Number(row[14]) || 0;
      const remSleepMinutes = Number(row[15]) || 0;
      const lightSleepMinutes = Number(row[16]) || 0;
      const awakeMinutes = Number(row[17]) || 0;
      const source = (row[18] as any) || 'garmin';
      const notes = String(row[19] || '').trim();

      logs.push({
        id: `sheets-health-${date}`,
        date,
        restingHr,
        hrvRmssd,
        sleepDurationMinutes: sleepDurationMinutes > 0 ? sleepDurationMinutes : 480,
        sleepScore: sleepScore > 0 ? sleepScore : 75,
        bodyBattery,
        stress,
        respiration,
        pulseOx,
        vo2MaxRun,
        vo2MaxBike,
        steps,
        calories,
        deepSleepMinutes,
        remSleepMinutes,
        lightSleepMinutes,
        awakeMinutes,
        source: source === 'trainingpeaks' || source === 'manual' || source === 'csv' ? source : 'garmin',
        notes: notes || undefined,
      });
    }

    setLastGoogleSheetsSyncTime();
    return logs;
  } catch (err) {
    console.warn('[Google Sheets] Failed to fetch health data:', err);
    return [];
  }
}

export interface BatchHealthUploadResult {
  success: boolean;
  totalLogs: number;
  appendedCount: number;
  updatedCount: number;
  prunedDuplicatesCount?: number;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  error?: string;
}

/**
 * Batch upload recovery logs to the "Health" tab in Google Sheets
 * - Reads existing dates from Column A (with date format normalization)
 * - If a row for that date already exists, updates it in-place in Column A–U
 * - Automatically detects and cleans up any duplicate rows for the same date
 * - Appends truly new dates without duplication
 */
export async function batchUploadHealthDataToGoogleSheet(
  logs: DailyRecoveryLog[],
  spreadsheetId?: string,
  profile?: AthleteProfile
): Promise<BatchHealthUploadResult> {
  const token = getGoogleAccessToken();
  if (!token) {
    return {
      success: false,
      totalLogs: logs.length,
      appendedCount: 0,
      updatedCount: 0,
      error: 'Google account is not connected or session expired. Please click "Connect Google Account".',
    };
  }

  if (!logs || logs.length === 0) {
    return {
      success: true,
      totalLogs: 0,
      appendedCount: 0,
      updatedCount: 0,
    };
  }

  try {
    const targetId = spreadsheetId || (await getOrCreateTrainingLogSheet());
    await getOrCreateHealthSheet(targetId);

    // Read existing dates from Column A (Health!A2:A5000)
    const checkRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${targetId}/values/${encodeURIComponent('Health!A2:A5000')}?valueRenderOption=FORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!checkRes.ok) {
      const errText = await checkRes.text().catch(() => '');
      throw new Error(`Failed to check existing Health rows in Google Sheets (${checkRes.status}): ${errText}`);
    }

    const checkData = await checkRes.json();
    const existingRows = checkData.values || [];

    // Map each normalized date to all row indices where it appears
    const dateToRowIndices = new Map<string, number[]>();
    for (let i = 0; i < existingRows.length; i++) {
      const rawDate = existingRows[i]?.[0];
      const normDate = normalizeDateToYyyyMmDd(rawDate);
      if (normDate) {
        const rowIdx = i + 2; // 1-indexed, row 1 is header
        const list = dateToRowIndices.get(normDate);
        if (list) {
          list.push(rowIdx);
        } else {
          dateToRowIndices.set(normDate, [rowIdx]);
        }
      }
    }

    const updates: { range: string; values: (string | number)[][] }[] = [];
    const rowsToAppend: (string | number)[][] = [];
    const duplicateRowIndicesToDelete: number[] = [];

    // Sort logs chronologically
    const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
    const athleteProf = profile || loadAthleteProfile();

    for (const log of sorted) {
      const row = formatHealthLogRow(log, sorted, athleteProf);
      const normLogDate = normalizeDateToYyyyMmDd(log.date);
      const existingIndices = dateToRowIndices.get(normLogDate);

      if (existingIndices && existingIndices.length > 0) {
        // Row already exists in Column A: ALWAYS update in-place!
        const primaryRowIndex = existingIndices[0];
        updates.push({
          range: `Health!A${primaryRowIndex}:U${primaryRowIndex}`,
          values: [row],
        });

        // Any secondary rows for the same date are historical duplicates — queue for pruning
        if (existingIndices.length > 1) {
          duplicateRowIndicesToDelete.push(...existingIndices.slice(1));
        }
      } else {
        // Genuinely new date: append
        rowsToAppend.push(row);
        // Reserve an index so subsequent occurrences within the batch don't duplicate
        const virtualRowIndex = existingRows.length + 2 + rowsToAppend.length - 1;
        dateToRowIndices.set(normLogDate, [virtualRowIndex]);
      }
    }

    // 1. Batch update existing rows (in-place modification of Column A-U)
    if (updates.length > 0) {
      const updateRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${targetId}/values:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            valueInputOption: 'USER_ENTERED',
            data: updates,
          }),
        }
      );
      if (!updateRes.ok) {
        const errJson = await updateRes.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Batch update failed (${updateRes.status})`);
      }
    }

    // 2. Automatically delete pre-existing duplicate rows in Google Sheets
    if (duplicateRowIndicesToDelete.length > 0) {
      try {
        const healthSheetId = await getHealthSheetId(targetId, token);
        if (healthSheetId !== null) {
          // Sort row indices descending so deleting earlier rows doesn't shift later indices
          const uniqueSortedDesc = Array.from(new Set(duplicateRowIndicesToDelete)).sort((a, b) => b - a);
          const deleteRequests = uniqueSortedDesc.map((rowIdx) => ({
            deleteDimension: {
              range: {
                sheetId: healthSheetId,
                dimension: 'ROWS',
                startIndex: rowIdx - 1, // 0-indexed inclusive
                endIndex: rowIdx,       // 0-indexed exclusive
              },
            },
          }));

          await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${targetId}:batchUpdate`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ requests: deleteRequests }),
          });
        }
      } catch (pruneErr) {
        console.warn('[Google Sheets] Could not prune duplicate rows:', pruneErr);
      }
    }

    // 3. Append genuinely new dates
    if (rowsToAppend.length > 0) {
      const appendRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${targetId}/values/${encodeURIComponent('Health!A1:U')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: rowsToAppend }),
        }
      );
      if (!appendRes.ok) {
        const errJson = await appendRes.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Append failed (${appendRes.status})`);
      }
    }

    setLastGoogleSheetsSyncTime();
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${targetId}/edit`;
    return {
      success: true,
      totalLogs: logs.length,
      appendedCount: rowsToAppend.length,
      updatedCount: updates.length,
      prunedDuplicatesCount: duplicateRowIndicesToDelete.length,
      spreadsheetId: targetId,
      spreadsheetUrl,
    };
  } catch (err: any) {
    console.error('[Google Sheets] batchUploadHealthDataToGoogleSheet failed:', err);
    return {
      success: false,
      totalLogs: logs.length,
      appendedCount: 0,
      updatedCount: 0,
      error: err.message || 'Failed to save health data to Google Sheets',
    };
  }
}

/**
 * Append or update a single daily recovery log to the "Health" tab in Google Sheets
 */
export async function appendHealthDataToGoogleSheet(log: DailyRecoveryLog, spreadsheetId?: string): Promise<void> {
  await batchUploadHealthDataToGoogleSheet([log], spreadsheetId);
}

const GOOGLE_SHEETS_LAST_SYNC_KEY = 'gymfit_google_sheets_last_sync_timestamp';

export function getLastGoogleSheetsSyncTime(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const val = localStorage.getItem(GOOGLE_SHEETS_LAST_SYNC_KEY);
    return val ? parseInt(val, 10) : null;
  } catch {
    return null;
  }
}

export function setLastGoogleSheetsSyncTime(timestamp = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GOOGLE_SHEETS_LAST_SYNC_KEY, String(timestamp));
    window.dispatchEvent(new CustomEvent('gymfit_sheets_sync_updated', { detail: { timestamp } }));
  } catch {}
}

export function formatTimeAgo(timestampMs: number | null): string {
  if (!timestampMs) return 'Never';
  const sec = Math.floor((Date.now() - timestampMs) / 1000);
  if (sec < 30) return 'Just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

