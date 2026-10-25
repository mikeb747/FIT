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

  // Search Drive for an existing "GymFIT Training Log" file
  try {
    const query = encodeURIComponent("name = 'GymFIT Training Log' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
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

  // Create new Spreadsheet with headers
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
                    { userEnteredValue: { stringValue: 'GymFIT Breakdown / Notes' } },
                    { userEnteredValue: { stringValue: 'Strava URL' } },
                    { userEnteredValue: { stringValue: 'Synced At' } },
                  ],
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
