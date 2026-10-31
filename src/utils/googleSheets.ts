import { getGoogleAccessToken } from './googleAuth';
import type { StravaActivity, StravaActivityDetailsRecord } from './stravaActivities';
import {
  classifyActivity,
  formatSportMetrics,
  calculateActivityTSS,
  calculateNormalizedPower,
} from './stravaActivities';
import type { AthleteProfile } from '../types/athlete';
import { calculateWorkKj } from '../types/athlete';

export const GOOGLE_SHEETS_CONFIG = {
  STORAGE_KEYS: {
    SPREADSHEET_ID: 'gymfit_google_sheets_spreadsheet_id',
    SPREADSHEET_NAME: 'gymfit_google_sheets_spreadsheet_name',
    LAST_CHECKED: 'gymfit_google_sheets_last_checked',
  },
  DEFAULT_SPREADSHEET_NAME: 'GymFIT Training Log',
};

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
 * Append a Strava activity with enhanced analysis and stream telemetry to Google Sheets
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
    return {
      success: true,
      alreadyExists: true,
      spreadsheetId,
      spreadsheetUrl,
    };
  }

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
  const nowIso = new Date().toISOString();

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

  const rowValues = [
    activity.start_date_local || activity.start_date,
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
    nowIso,
  ];

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

  return {
    success: true,
    alreadyExists: false,
    spreadsheetId,
    spreadsheetUrl,
  };
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

export function formatHealthLogRow(log: DailyRecoveryLog): (string | number)[] {
  const sleepHours = log.sleepDurationMinutes ? (log.sleepDurationMinutes / 60).toFixed(1) : '';
  const notesStr = [log.notes, ...(log.tags || [])].filter(Boolean).join(' · ');
  const nowIso = new Date().toISOString();

  return [
    log.date,
    '', // readiness score (computed dynamically)
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
    nowIso,
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
      // Update header row to ensure all 21 columns exist
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
    }
  } catch (err) {
    console.warn('[Google Sheets] Failed to create or verify Health sheet:', err);
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
      `https://sheets.googleapis.com/v4/spreadsheets/${targetId}/values/Health!A2:U3000`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!res.ok) return [];
    const data = await res.json();
    const rows = data.values || [];
    const logs: DailyRecoveryLog[] = [];

    for (const row of rows) {
      const date = String(row[0] || '').trim();
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
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  error?: string;
}

/**
 * Batch upload multiple recovery logs to the "Health" tab in Google Sheets safely
 * (Deduplicates by date, prevents 429 rate limits, writes all 21 metric columns)
 */
export async function batchUploadHealthDataToGoogleSheet(
  logs: DailyRecoveryLog[],
  spreadsheetId?: string
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

    // Read existing dates from column A (Health!A2:A5000)
    const checkRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${targetId}/values/Health!A2:A5000`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const dateToRowIndex = new Map<string, number>();
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      const rows = checkData.values || [];
      for (let i = 0; i < rows.length; i++) {
        const d = String(rows[i][0] || '').trim();
        if (d) dateToRowIndex.set(d, i + 2); // 1-indexed, row 1 is header
      }
    }

    const rowsToAppend: (string | number)[][] = [];
    const updates: { range: string; values: (string | number)[][] }[] = [];

    // Sort logs chronologically
    const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));

    for (const log of sorted) {
      const row = formatHealthLogRow(log);
      const existingRowIndex = dateToRowIndex.get(log.date);

      if (existingRowIndex) {
        updates.push({
          range: `Health!A${existingRowIndex}:U${existingRowIndex}`,
          values: [row],
        });
      } else {
        rowsToAppend.push(row);
      }
    }

    // Append new rows in one single request
    if (rowsToAppend.length > 0) {
      const appendRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${targetId}/values/Health!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
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

    // Batch update existing rows
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

    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${targetId}/edit`;
    return {
      success: true,
      totalLogs: logs.length,
      appendedCount: rowsToAppend.length,
      updatedCount: updates.length,
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

