import type {
  StravaActivity,
  StravaActivityDetailsRecord,
  ActivityCalibration,
  ActivityEffortFeedback,
} from './stravaActivities';
import {
  calculateActivityTSS,
  getCachedStravaActivities,
  saveCachedStravaActivities,
  getAllCachedStravaActivityRecords,
  batchSaveStravaActivityRecords,
  mergeStravaActivities,
} from './stravaActivities';
import { isDemoActivityId, isLegacyDemoActivityId } from './demoData';
import { loadAthleteProfile } from './athleteStorage';

/**
 * 30-column Google Sheets "Workouts" tab schema:
 * - Columns A–V (0–21): 100% backward-compatible with legacy 22-column GymFIT / FIT Track sheets
 * - Columns W–AD (22–29): Lossless Strava + FIT Track telemetry & metadata snapshot
 */
export const WORKOUTS_SHEET_HEADERS = [
  'Date / Time',
  'Strava Activity ID',
  'Activity Name',
  'Category',
  'Sub-Type',
  'Moving Time (min)',
  'Elapsed Time (min)',
  'Distance (km)',
  'Elevation Gain (m)',
  'Pace / Speed',
  'Avg HR (bpm)',
  'Max HR (bpm)',
  'Avg Watts (W)',
  'Avg Cadence (rpm)',
  'TSS (Training Stress Score)',
  'Pre-Workout Feeling (1-5)',
  'RPE (1-10)',
  'sRPE Load',
  'Calories (kcal)',
  'FIT Track Breakdown / Notes',
  'Strava URL',
  'Synced At',
  'Sport Type',
  'Moving Time (sec)',
  'Elapsed Time (sec)',
  'Distance (m)',
  'Max Speed (m/s)',
  'Max Watts (W)',
  'Gear ID',
  'Activity Metadata (JSON)',
] as const;

export const LEGACY_WORKOUTS_COLUMN_COUNT = 22;

export interface ActivityBackupMetadataV1 {
  v: 1;
  start_date?: string;
  start_date_local?: string;
  timezone?: string;
  type?: string;
  sport_type?: string;
  trainer?: boolean;
  commute?: boolean;
  gear_id?: string | null;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  total_elevation_gain?: number;
  average_speed?: number;
  max_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  weighted_average_watts?: number;
  max_watts?: number;
  kilojoules?: number;
  device_watts?: boolean;
  average_cadence?: number;
  calories?: number;
  suffer_score?: number;
  kudos_count?: number;
  achievement_count?: number;
  pr_count?: number;
  hide_from_home?: boolean;
  muted?: boolean;
  description?: string;
  noStreamsAvailable?: boolean;
  calibration?: ActivityCalibration;
  effortFeedback?: ActivityEffortFeedback;
  laps?: unknown[];
  splits_metric?: unknown[];
}

export interface ParsedBackupResult {
  format: 'google_sheets' | 'strava_export';
  activities: StravaActivity[];
  detailsMap: Record<string, StravaActivityDetailsRecord>;
  duplicatesMerged: number;
}

export interface AppliedRestoreResult {
  activities: StravaActivity[];
  detailsMap: Record<string, StravaActivityDetailsRecord>;
  addedCount: number;
  updatedCount: number;
  totalCount: number;
  duplicatesMerged: number;
}

/**
 * Converts a 0-based column index to Google Sheets A1 column letters (0 -> A, 25 -> Z, 26 -> AA, 29 -> AD).
 */
export function columnIndexToLetter(zeroBasedIndex: number): string {
  let idx = Math.max(0, Math.floor(zeroBasedIndex));
  let letters = '';
  while (idx >= 0) {
    letters = String.fromCharCode((idx % 26) + 65) + letters;
    idx = Math.floor(idx / 26) - 1;
  }
  return letters;
}

/**
 * Serializes full lossless StravaActivity + StravaActivityDetailsRecord metadata into a compact JSON string
 * guaranteed to stay comfortably under Google Sheets' 50,000-character cell limit.
 */
export function serializeActivityBackupMetadata(
  activity: StravaActivity,
  details?: StravaActivityDetailsRecord
): string {
  const detailAct = (details?.activity || {}) as Record<string, unknown>;
  const rawDesc =
    (typeof activity.description === 'string' && activity.description.trim()
      ? activity.description
      : typeof detailAct.description === 'string'
      ? detailAct.description
      : '') || undefined;

  const rawLaps = Array.isArray(activity.laps)
    ? activity.laps
    : Array.isArray(detailAct.laps)
    ? (detailAct.laps as unknown[])
    : undefined;

  const rawSplits = Array.isArray(activity.splits_metric)
    ? activity.splits_metric
    : Array.isArray(detailAct.splits_metric)
    ? (detailAct.splits_metric as unknown[])
    : undefined;

  const compactLaps = rawLaps?.slice(0, 80).map((l: any) => {
    if (!l || typeof l !== 'object') return l;
    return stripUndefined({
      id: l.id,
      name: l.name,
      lap_index: l.lap_index,
      distance: l.distance,
      moving_time: l.moving_time,
      elapsed_time: l.elapsed_time,
      average_speed: l.average_speed,
      max_speed: l.max_speed,
      average_heartrate: l.average_heartrate,
      max_heartrate: l.max_heartrate,
      average_watts: l.average_watts,
      average_cadence: l.average_cadence,
      total_elevation_gain: l.total_elevation_gain,
    });
  });

  const compactSplits = rawSplits?.slice(0, 80).map((s: any) => {
    if (!s || typeof s !== 'object') return s;
    return stripUndefined({
      split: s.split,
      distance: s.distance,
      moving_time: s.moving_time,
      elapsed_time: s.elapsed_time,
      elevation_difference: s.elevation_difference,
      average_speed: s.average_speed,
      average_grade_adjusted_speed: s.average_grade_adjusted_speed,
      average_heartrate: s.average_heartrate,
      pace_zone: s.pace_zone,
    });
  });

  const kilojoules =
    typeof (activity as any).kilojoules === 'number'
      ? (activity as any).kilojoules
      : typeof detailAct.kilojoules === 'number'
      ? (detailAct.kilojoules as number)
      : undefined;

  const deviceWatts =
    typeof (activity as any).device_watts === 'boolean'
      ? (activity as any).device_watts
      : typeof detailAct.device_watts === 'boolean'
      ? (detailAct.device_watts as boolean)
      : undefined;

  const commute =
    typeof (activity as any).commute === 'boolean'
      ? (activity as any).commute
      : typeof detailAct.commute === 'boolean'
      ? (detailAct.commute as boolean)
      : undefined;

  const payload: ActivityBackupMetadataV1 = stripUndefined({
    v: 1 as const,
    start_date: activity.start_date,
    start_date_local: activity.start_date_local,
    timezone: activity.timezone || (detailAct.timezone as string | undefined),
    type: activity.type,
    sport_type: activity.sport_type,
    trainer: activity.trainer,
    commute,
    gear_id: activity.gear_id ?? (detailAct.gear_id as string | undefined) ?? undefined,
    distance: activity.distance,
    moving_time: activity.moving_time,
    elapsed_time: activity.elapsed_time,
    total_elevation_gain: activity.total_elevation_gain,
    average_speed: activity.average_speed,
    max_speed: activity.max_speed,
    average_heartrate: activity.average_heartrate,
    max_heartrate: activity.max_heartrate,
    average_watts: activity.average_watts,
    weighted_average_watts: activity.weighted_average_watts,
    max_watts: activity.max_watts,
    kilojoules,
    device_watts: deviceWatts,
    average_cadence: activity.average_cadence,
    calories: activity.calories ?? (detailAct.calories as number | undefined),
    suffer_score: activity.suffer_score ?? (detailAct.suffer_score as number | undefined),
    kudos_count: activity.kudos_count,
    achievement_count: activity.achievement_count,
    pr_count: activity.pr_count,
    hide_from_home: activity.hide_from_home || undefined,
    muted: activity.muted || undefined,
    description: rawDesc ? rawDesc.slice(0, 4000) : undefined,
    noStreamsAvailable: details?.noStreamsAvailable || undefined,
    calibration: details?.calibration,
    effortFeedback: details?.effortFeedback,
    laps: compactLaps && compactLaps.length > 0 ? compactLaps : undefined,
    splits_metric: compactSplits && compactSplits.length > 0 ? compactSplits : undefined,
  });

  let json = JSON.stringify(payload);
  if (json.length > 42000) {
    // Drop verbose lap/split arrays first if unusually large so core telemetry & calibration always fit
    const slimmed = { ...payload };
    delete slimmed.splits_metric;
    json = JSON.stringify(slimmed);
    if (json.length > 42000) {
      delete slimmed.laps;
      json = JSON.stringify(slimmed);
    }
  }
  return json;
}

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') {
      out[k] = v;
    }
  }
  return out as T;
}

/**
 * RFC-4180 compliant character-by-character CSV parser.
 * Properly handles BOM (\uFEFF), CRLF/LF, escaped double-quotes (""), commas inside quotes,
 * and multiline fields with embedded newlines inside quotes.
 */
export function parseCsvRecords(csvText: string): string[][] {
  if (!csvText) return [];
  const text = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText;

  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(current);
        current = '';
      } else if (ch === '\r') {
        if (text[i + 1] === '\n') i++;
        row.push(current);
        if (row.some((cell) => cell.trim() !== '')) {
          rows.push(row);
        }
        row = [];
        current = '';
      } else if (ch === '\n') {
        row.push(current);
        if (row.some((cell) => cell.trim() !== '')) {
          rows.push(row);
        }
        row = [];
        current = '';
      } else {
        current += ch;
      }
    }
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some((cell) => cell.trim() !== '')) {
      rows.push(row);
    }
  }

  return rows;
}

function normalizeHeaderName(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function parsePositiveNumber(val: unknown): number | undefined {
  if (val === null || val === undefined || val === '') return undefined;
  const cleaned = String(val).replace(/,/g, '').trim();
  if (!cleaned) return undefined;
  const num = Number(cleaned);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

function parseNonNegativeNumber(val: unknown): number | undefined {
  if (val === null || val === undefined || val === '') return undefined;
  const cleaned = String(val).replace(/,/g, '').trim();
  if (!cleaned) return undefined;
  const num = Number(cleaned);
  return Number.isFinite(num) && num >= 0 ? num : undefined;
}

/**
 * Parses a Google Sheets wall-clock date/time string ("2026-11-11 18:00:40", ISO, DD/MM/YYYY HH:MM:SS, or serial)
 * into { start_date_local, start_date } matching Strava's ISO timestamp conventions.
 */
export function parseSheetDateTimeToStravaIso(raw: unknown): {
  start_date_local: string;
  start_date: string;
} | null {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim();
  if (!str) return null;

  // 1. Standard "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DDTHH:MM:SS..."
  const ymdTime = str.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (ymdTime) {
    const yyyy = ymdTime[1];
    const mm = ymdTime[2].padStart(2, '0');
    const dd = ymdTime[3].padStart(2, '0');
    const hh = (ymdTime[4] || '08').padStart(2, '0');
    const min = (ymdTime[5] || '00').padStart(2, '0');
    const ss = (ymdTime[6] || '00').padStart(2, '0');
    const localIso = `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}Z`;
    const localDate = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(min),
      Number(ss)
    );
    const utcIso = !isNaN(localDate.getTime())
      ? localDate.toISOString().replace(/\.\d{3}Z$/, 'Z')
      : localIso;
    return { start_date_local: localIso, start_date: utcIso };
  }

  // 2. UK / European "DD/MM/YYYY HH:MM:SS" or US "MM/DD/YYYY HH:MM:SS"
  const dmyTime = str.match(
    /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (dmyTime) {
    const p1 = parseInt(dmyTime[1], 10);
    const p2 = parseInt(dmyTime[2], 10);
    const yyyy = dmyTime[3];
    const day = p1 > 12 ? p1 : p2 > 12 ? p2 : p1;
    const month = p1 > 12 ? p2 : p2 > 12 ? p1 : p2;
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const hh = (dmyTime[4] || '08').padStart(2, '0');
    const min = (dmyTime[5] || '00').padStart(2, '0');
    const ss = (dmyTime[6] || '00').padStart(2, '0');
    const localIso = `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}Z`;
    const localDate = new Date(
      Number(yyyy),
      month - 1,
      day,
      Number(hh),
      Number(min),
      Number(ss)
    );
    const utcIso = !isNaN(localDate.getTime())
      ? localDate.toISOString().replace(/\.\d{3}Z$/, 'Z')
      : localIso;
    return { start_date_local: localIso, start_date: utcIso };
  }

  // 3. Google Sheets / Excel numeric serial date-time
  const serial = Number(str);
  if (Number.isFinite(serial) && serial > 30000 && serial < 75000) {
    const epochMs = Math.round((serial - 25569) * 86400 * 1000);
    const dt = new Date(epochMs);
    if (!isNaN(dt.getTime())) {
      const iso = dt.toISOString().replace(/\.\d{3}Z$/, 'Z');
      return { start_date_local: iso, start_date: iso };
    }
  }

  // 4. Fallback native Date parse (e.g. "Oct 22, 2026, 7:33:31 PM")
  const fallback = new Date(str);
  if (!isNaN(fallback.getTime())) {
    const iso = fallback.toISOString().replace(/\.\d{3}Z$/, 'Z');
    return { start_date_local: iso, start_date: iso };
  }

  return null;
}

/**
 * Strips auto-generated breakdown prefixes ("Pre: 4/5 · RPE: 3/10 (248 sRPE)", "[Calibrated]", "210W NP · 1,051 kJ")
 * from Column T ("FIT Track Breakdown / Notes" / "GymFIT Breakdown / Notes") to recover the clean Strava description,
 * work kJ, NP watts, and calibration status.
 */
function parseBreakdownNotesColumn(rawNotes: string): {
  cleanDescription?: string;
  npWatts?: number;
  workKj?: number;
  wasCalibrated: boolean;
} {
  if (!rawNotes || !rawNotes.trim()) {
    return { wasCalibrated: false };
  }

  let text = rawNotes.trim();
  let wasCalibrated = false;
  let npWatts: number | undefined;
  let workKj: number | undefined;

  if (/\[Calibrated\]/i.test(text) || /^Calibrated treadmill run\b/i.test(text)) {
    wasCalibrated = true;
  }

  // Extract NP and Work kJ if present anywhere in the auto-generated power summary
  const npMatch = text.match(/\b(\d+(?:\.\d+)?)W\s*NP\b/i);
  if (npMatch) {
    const v = parseFloat(npMatch[1]);
    if (v > 0) npWatts = Math.round(v);
  }
  const kjMatch = text.match(/\b([\d,]+(?:\.\d+)?)\s*kJ\b/i);
  if (kjMatch) {
    const v = parseFloat(kjMatch[1].replace(/,/g, ''));
    if (v > 0) workKj = Math.round(v);
  }

  // Remove "[Calibrated]" marker
  text = text.replace(/\[Calibrated\]\s*/gi, '');

  // Split by pipe " | " segments prepended by buildActivitySheetRow
  const segments = text.split(/\s*\|\s*/);
  const keptSegments: string[] = [];

  for (const seg of segments) {
    const s = seg.trim();
    if (!s) continue;

    // Skip pure Pre-Workout / RPE summary segment: "Pre: 3/5 · RPE: 4/10 (116 sRPE)" or "Pre: 4/5" or "RPE: 3/10..."
    if (
      /^(?:Pre:\s*\d+\/5)?(?:\s*·\s*)?(?:RPE:\s*\d+(?:\.\d+)?\/10(?:\s*\(\d+(?:\.\d+)?\s*sRPE\))?)?$/i.test(
        s
      ) &&
      (/Pre:/i.test(s) || /RPE:/i.test(s))
    ) {
      continue;
    }

    // Skip pure Power NP / kJ summary segment: "210W NP · 1,051 kJ" or "210W NP" or "1,051 kJ"
    if (/^(?:\d+(?:\.\d+)?W\s*NP)?(?:\s*·\s*)?(?:[\d,]+(?:\.\d+)?\s*kJ)?$/i.test(s) && (/NP/i.test(s) || /kJ/i.test(s))) {
      continue;
    }

    keptSegments.push(s);
  }

  const joined = keptSegments.join(' | ').trim();
  return {
    cleanDescription: joined || undefined,
    npWatts,
    workKj,
    wasCalibrated,
  };
}

/**
 * Maps Sheet Category + Sub-Type + optional Sport Type + Activity Name to Strava { type, sport_type, trainer }
 */
function resolveStravaSportTypes(
  categoryRaw: string,
  subTypeRaw: string,
  sportTypeColRaw: string,
  name: string
): { type: string; sport_type: string; trainer: boolean } {
  const cat = categoryRaw.trim().toLowerCase();
  const sub = subTypeRaw.trim().toLowerCase();
  const explicitSport = sportTypeColRaw.trim();

  if (explicitSport) {
    const lower = explicitSport.toLowerCase();
    if (lower === 'virtualride') {
      return { type: 'VirtualRide', sport_type: 'VirtualRide', trainer: true };
    }
    if (lower === 'virtualrun') {
      return { type: 'VirtualRun', sport_type: 'VirtualRun', trainer: true };
    }
    if (lower === 'openwaterswim') {
      return { type: 'Swim', sport_type: 'OpenWaterSwim', trainer: false };
    }
    if (lower === 'weighttraining') {
      return { type: 'WeightTraining', sport_type: 'WeightTraining', trainer: false };
    }
    const isTrainerFromSub = sub === 'turbo trainer' || sub === 'treadmill run';
    return { type: explicitSport, sport_type: explicitSport, trainer: isTrainerFromSub };
  }

  if (sub === 'turbo trainer' || (cat === 'bike' && /virtual|zwift|trainer|turbo/i.test(sub))) {
    return { type: 'VirtualRide', sport_type: 'VirtualRide', trainer: true };
  }
  if (cat === 'bike' || sub === 'bike') {
    return { type: 'Ride', sport_type: 'Ride', trainer: false };
  }
  if (sub === 'treadmill run') {
    return { type: 'Run', sport_type: 'Run', trainer: true };
  }
  if (cat === 'run' || sub === 'run') {
    return { type: 'Run', sport_type: 'Run', trainer: false };
  }
  if (sub === 'open water swim') {
    return { type: 'Swim', sport_type: 'OpenWaterSwim', trainer: false };
  }
  if (cat === 'swim' || sub === 'swim') {
    return { type: 'Swim', sport_type: 'Swim', trainer: false };
  }
  if (cat === 'gym' || sub === 'strength') {
    return { type: 'WeightTraining', sport_type: 'WeightTraining', trainer: false };
  }

  // Other category refinement from title
  if (/\bhike\b/i.test(name)) {
    return { type: 'Hike', sport_type: 'Hike', trainer: false };
  }
  if (/\bwalk\b/i.test(name)) {
    return { type: 'Walk', sport_type: 'Walk', trainer: false };
  }
  if (/\byoga\b/i.test(name)) {
    return { type: 'Yoga', sport_type: 'Yoga', trainer: false };
  }
  if (/\brow(?:ing)?\b/i.test(name)) {
    return { type: 'Rowing', sport_type: 'Rowing', trainer: false };
  }
  return { type: 'Workout', sport_type: 'Workout', trainer: false };
}

function parseNumericOrStringId(idStr: string): number | string {
  const trimmed = idStr.trim();
  if (/^\d+$/.test(trimmed)) {
    const asNum = Number(trimmed);
    if (Number.isSafeInteger(asNum)) return asNum;
  }
  return trimmed;
}

/**
 * Reconstructs full StravaActivity[] + StravaActivityDetailsRecord map from Google Sheets "Workouts" rows
 * (supports both legacy 22-column backups and enriched 30-column lossless backups).
 */
export function reconstructWorkoutsFromSheetRows(
  rows: unknown[][],
  headerRow?: unknown[]
): {
  activities: StravaActivity[];
  detailsMap: Record<string, StravaActivityDetailsRecord>;
  duplicatesMerged: number;
} {
  if (!rows || rows.length === 0) {
    return { activities: [], detailsMap: {}, duplicatesMerged: 0 };
  }

  // Build flexible column index lookup supporting header variations ("Date /  Time", "GymFIT Breakdown / Notes", etc.)
  const colIdx = {
    dateTime: 0,
    activityId: 1,
    name: 2,
    category: 3,
    subType: 4,
    movingMin: 5,
    elapsedMin: 6,
    distanceKm: 7,
    elevationM: 8,
    paceSpeed: 9,
    avgHr: 10,
    maxHr: 11,
    avgWatts: 12,
    avgCadence: 13,
    tss: 14,
    preFeeling: 15,
    rpe: 16,
    sRpeLoad: 17,
    calories: 18,
    notes: 19,
    stravaUrl: 20,
    syncedAt: 21,
    sportType: 22,
    movingSec: 23,
    elapsedSec: 24,
    distanceM: 25,
    maxSpeedMps: 26,
    maxWatts: 27,
    gearId: 28,
    metadataJson: 29,
  };

  if (headerRow && headerRow.length > 0) {
    headerRow.forEach((rawH, i) => {
      const h = normalizeHeaderName(rawH);
      if (h === 'date / time' || h === 'date/time') colIdx.dateTime = i;
      else if (h === 'strava activity id' || h === 'activity id') colIdx.activityId = i;
      else if (h === 'activity name' || h === 'name') colIdx.name = i;
      else if (h === 'category') colIdx.category = i;
      else if (h === 'sub-type' || h === 'subtype') colIdx.subType = i;
      else if (h.startsWith('moving time (min')) colIdx.movingMin = i;
      else if (h.startsWith('elapsed time (min')) colIdx.elapsedMin = i;
      else if (h.startsWith('distance (km')) colIdx.distanceKm = i;
      else if (h.startsWith('elevation gain')) colIdx.elevationM = i;
      else if (h === 'pace / speed' || h === 'pace/speed') colIdx.paceSpeed = i;
      else if (h.startsWith('avg hr')) colIdx.avgHr = i;
      else if (h.startsWith('max hr')) colIdx.maxHr = i;
      else if (h.startsWith('avg watts')) colIdx.avgWatts = i;
      else if (h.startsWith('avg cadence')) colIdx.avgCadence = i;
      else if (h.startsWith('tss')) colIdx.tss = i;
      else if (h.startsWith('pre-workout feeling')) colIdx.preFeeling = i;
      else if (h.startsWith('rpe')) colIdx.rpe = i;
      else if (h.startsWith('srpe')) colIdx.sRpeLoad = i;
      else if (h.startsWith('calories')) colIdx.calories = i;
      else if (h.includes('breakdown') || h.endsWith('/ notes') || h === 'notes') colIdx.notes = i;
      else if (h === 'strava url') colIdx.stravaUrl = i;
      else if (h === 'synced at') colIdx.syncedAt = i;
      else if (h === 'sport type') colIdx.sportType = i;
      else if (h.startsWith('moving time (sec')) colIdx.movingSec = i;
      else if (h.startsWith('elapsed time (sec')) colIdx.elapsedSec = i;
      else if (h.startsWith('distance (m)')) colIdx.distanceM = i;
      else if (h.startsWith('max speed')) colIdx.maxSpeedMps = i;
      else if (h.startsWith('max watts')) colIdx.maxWatts = i;
      else if (h === 'gear id') colIdx.gearId = i;
      else if (h.startsWith('activity metadata')) colIdx.metadataJson = i;
    });
  }

  // Step 1: Deduplicate rows by Strava Activity ID, preferring the row with the latest "Synced At"
  // while backfilling any non-empty cells from earlier duplicate rows.
  const dedupedRows = new Map<string, { row: string[]; syncedEpoch: number }>();
  let duplicatesMerged = 0;

  for (const rawRow of rows) {
    if (!Array.isArray(rawRow)) continue;
    const row = rawRow.map((c) => (c === null || c === undefined ? '' : String(c)));
    let idStr = (row[colIdx.activityId] || '').trim();
    if (!idStr && row[colIdx.stravaUrl]) {
      const urlMatch = row[colIdx.stravaUrl].match(/\/activities\/([a-zA-Z0-9_-]+)/);
      if (urlMatch) idStr = urlMatch[1];
    }
    if (!idStr || idStr.toLowerCase() === 'strava activity id') continue;

    const parsedSync = parseSheetDateTimeToStravaIso(row[colIdx.syncedAt]);
    const syncedEpoch = parsedSync ? new Date(parsedSync.start_date).getTime() : 0;

    const existing = dedupedRows.get(idStr);
    if (!existing) {
      dedupedRows.set(idStr, { row, syncedEpoch });
    } else {
      duplicatesMerged++;
      const primary = syncedEpoch >= existing.syncedEpoch ? row : existing.row;
      const secondary = syncedEpoch >= existing.syncedEpoch ? existing.row : row;
      const maxLen = Math.max(primary.length, secondary.length);
      const merged: string[] = [];
      for (let k = 0; k < maxLen; k++) {
        const pVal = (primary[k] || '').trim();
        merged[k] = pVal !== '' ? primary[k] : secondary[k] || '';
      }
      dedupedRows.set(idStr, {
        row: merged,
        syncedEpoch: Math.max(syncedEpoch, existing.syncedEpoch),
      });
    }
  }

  const athleteProfile = loadAthleteProfile();
  const activities: StravaActivity[] = [];
  const detailsMap: Record<string, StravaActivityDetailsRecord> = {};

  for (const [idStr, { row }] of dedupedRows.entries()) {
    // Unpack optional lossless metadata JSON from Column AD (if present)
    let meta: ActivityBackupMetadataV1 | null = null;
    const rawMetaCell = (row[colIdx.metadataJson] || '').trim();
    if (rawMetaCell && rawMetaCell.startsWith('{')) {
      try {
        const parsed = JSON.parse(rawMetaCell);
        if (parsed && typeof parsed === 'object') {
          meta = parsed as ActivityBackupMetadataV1;
        }
      } catch {
        meta = null;
      }
    }

    const parsedDate = parseSheetDateTimeToStravaIso(row[colIdx.dateTime]);
    const start_date_local =
      meta?.start_date_local || parsedDate?.start_date_local || '';
    const start_date =
      meta?.start_date || parsedDate?.start_date || start_date_local;

    if (!start_date) continue;

    const name = (row[colIdx.name] || '').trim() || 'Workout';
    const categoryRaw = (row[colIdx.category] || '').trim();
    const subTypeRaw = (row[colIdx.subType] || '').trim();
    const sportTypeColRaw = (row[colIdx.sportType] || '').trim();
    const paceSpeedStr = (row[colIdx.paceSpeed] || '').trim();

    const resolvedSport = resolveStravaSportTypes(
      categoryRaw,
      subTypeRaw,
      sportTypeColRaw || meta?.sport_type || meta?.type || '',
      name
    );

    const type = meta?.type || resolvedSport.type;
    const sport_type = meta?.sport_type || resolvedSport.sport_type;
    const trainer = meta?.trainer !== undefined ? Boolean(meta.trainer) : resolvedSport.trainer;

    // Distance in meters:
    // 1. Exact JSON metadata or Column Z "Distance (m)"
    // 2. Swim exact meter recovery from Column J ("1625m · 1:33/100m" -> 1625m instead of rounded 1.63km!)
    // 3. Column H "Distance (km)" * 1000
    let distanceM =
      (typeof meta?.distance === 'number' ? meta.distance : undefined) ??
      parseNonNegativeNumber(row[colIdx.distanceM]);

    if (distanceM === undefined) {
      if (categoryRaw.toLowerCase() === 'swim' || type === 'Swim') {
        const swimMetersMatch = paceSpeedStr.match(/^(\d+(?:\.\d+)?)\s*m\b/i);
        if (swimMetersMatch) {
          distanceM = parseFloat(swimMetersMatch[1]);
        }
      }
      if (distanceM === undefined) {
        const distKm = parseNonNegativeNumber(row[colIdx.distanceKm]);
        distanceM = distKm !== undefined ? Math.round(distKm * 1000 * 10) / 10 : 0;
      }
    }

    // Moving & Elapsed time in integer seconds
    const movingSecCol = parsePositiveNumber(row[colIdx.movingSec]);
    const movingMinCol = parseNonNegativeNumber(row[colIdx.movingMin]);
    const moving_time =
      movingSecCol !== undefined
        ? Math.round(movingSecCol)
        : typeof meta?.moving_time === 'number' && meta.moving_time > 0
        ? Math.round(meta.moving_time)
        : movingMinCol !== undefined
        ? Math.round(movingMinCol * 60)
        : 0;

    const elapsedSecCol = parsePositiveNumber(row[colIdx.elapsedSec]);
    const elapsedMinCol = parseNonNegativeNumber(row[colIdx.elapsedMin]);
    const rawElapsed =
      elapsedSecCol !== undefined
        ? Math.round(elapsedSecCol)
        : typeof meta?.elapsed_time === 'number' && meta.elapsed_time > 0
        ? Math.round(meta.elapsed_time)
        : elapsedMinCol !== undefined
        ? Math.round(elapsedMinCol * 60)
        : moving_time;
    const elapsed_time = Math.max(moving_time, rawElapsed);

    // Elevation gain in meters
    const total_elevation_gain =
      parseNonNegativeNumber(row[colIdx.elevationM]) ??
      meta?.total_elevation_gain ??
      0;

    // Speeds (m/s)
    const average_speed =
      meta?.average_speed !== undefined && meta.average_speed > 0
        ? meta.average_speed
        : distanceM > 0 && moving_time > 0
        ? Number((distanceM / moving_time).toFixed(4))
        : 0;

    let max_speed =
      parsePositiveNumber(row[colIdx.maxSpeedMps]) ?? meta?.max_speed;
    if (max_speed === undefined && paceSpeedStr) {
      const maxKphMatch = paceSpeedStr.match(/max\s+(\d+(?:\.\d+)?)\s*kph/i);
      if (maxKphMatch) {
        max_speed = Number((parseFloat(maxKphMatch[1]) / 3.6).toFixed(3));
      }
    }

    // Heart rate & Cadence (strictly > 0 to filter sensor 0s)
    const average_heartrate =
      parsePositiveNumber(row[colIdx.avgHr]) ?? meta?.average_heartrate;
    const max_heartrate =
      parsePositiveNumber(row[colIdx.maxHr]) ?? meta?.max_heartrate;
    const average_cadence =
      parsePositiveNumber(row[colIdx.avgCadence]) ?? meta?.average_cadence;

    // Notes, NP, Work kJ, Description
    const parsedNotes = parseBreakdownNotesColumn(row[colIdx.notes] || '');
    const description = meta?.description ?? parsedNotes.cleanDescription;

    // Power metrics (strictly for Cycling / VirtualRide)
    const isCycling =
      categoryRaw.toLowerCase() === 'bike' ||
      type === 'Ride' ||
      type === 'VirtualRide' ||
      type === 'GravelRide' ||
      type === 'MountainBikeRide' ||
      type === 'EBikeRide';

    let average_watts: number | undefined;
    let weighted_average_watts: number | undefined;
    let max_watts: number | undefined;
    let kilojoules: number | undefined;
    let device_watts: boolean | undefined;

    if (isCycling) {
      const wattsCell = (row[colIdx.avgWatts] || '').trim();
      if (wattsCell) {
        const avgMatch = wattsCell.match(/^(\d+(?:\.\d+)?)/);
        if (avgMatch) {
          const w = parseFloat(avgMatch[1]);
          if (w > 0) average_watts = Math.round(w);
        }
        const npInCell = wattsCell.match(/\((\d+(?:\.\d+)?)W?\s*NP\)/i);
        if (npInCell) {
          const npVal = parseFloat(npInCell[1]);
          if (npVal > 0) weighted_average_watts = Math.round(npVal);
        }
      }
      if (average_watts === undefined && meta?.average_watts) {
        average_watts = meta.average_watts;
      }
      if (weighted_average_watts === undefined) {
        weighted_average_watts = meta?.weighted_average_watts ?? parsedNotes.npWatts;
      }
      max_watts = parsePositiveNumber(row[colIdx.maxWatts]) ?? meta?.max_watts;
      kilojoules =
        meta?.kilojoules ??
        parsedNotes.workKj ??
        (average_watts && moving_time > 0
          ? Math.round((average_watts * moving_time) / 1000)
          : undefined);
      if (average_watts && average_watts > 0) {
        device_watts = meta?.device_watts ?? true;
      }
    }

    const calories = parsePositiveNumber(row[colIdx.calories]) ?? meta?.calories;
    const gear_id =
      (row[colIdx.gearId] || '').trim() || meta?.gear_id || undefined;

    const activity: StravaActivity = stripUndefined({
      id: parseNumericOrStringId(idStr),
      name,
      description,
      type,
      sport_type,
      trainer: trainer || undefined,
      gear_id,
      start_date,
      start_date_local,
      timezone: meta?.timezone,
      distance: distanceM,
      moving_time,
      elapsed_time,
      total_elevation_gain,
      average_speed: average_speed > 0 ? average_speed : undefined,
      max_speed,
      average_heartrate,
      max_heartrate,
      average_watts,
      weighted_average_watts,
      max_watts,
      average_cadence,
      calories,
      suffer_score: meta?.suffer_score,
      kudos_count: meta?.kudos_count,
      achievement_count: meta?.achievement_count,
      pr_count: meta?.pr_count,
      hide_from_home: meta?.hide_from_home,
      muted: meta?.muted,
      laps: meta?.laps as any[] | undefined,
      splits_metric: meta?.splits_metric as any[] | undefined,
    });

    if (kilojoules !== undefined) {
      (activity as any).kilojoules = kilojoules;
    }
    if (device_watts !== undefined) {
      (activity as any).device_watts = device_watts;
    }
    if (meta?.commute !== undefined) {
      (activity as any).commute = meta.commute;
    }

    // Reconstruct Effort Feedback (Columns P, Q, R)
    let effortFeedback: ActivityEffortFeedback | undefined = meta?.effortFeedback
      ? { ...meta.effortFeedback }
      : undefined;

    const preCell = (row[colIdx.preFeeling] || '').trim();
    const rpeCell = (row[colIdx.rpe] || '').trim();
    const sRpeCell = (row[colIdx.sRpeLoad] || '').trim();

    if (preCell || rpeCell || sRpeCell) {
      const preMatch = preCell.match(/^([1-5])(?:\s*\/\s*5)?$/);
      const rpeMatch = rpeCell.match(/^(\d+(?:\.\d+)?)(?:\s*\/\s*10)?$/);
      const sRpeVal = parsePositiveNumber(sRpeCell);

      const preWorkoutFeeling = preMatch
        ? (parseInt(preMatch[1], 10) as 1 | 2 | 3 | 4 | 5)
        : effortFeedback?.preWorkoutFeeling;
      const rpe = rpeMatch ? parseFloat(rpeMatch[1]) : effortFeedback?.rpe;
      const sRpeLoad =
        sRpeVal ??
        effortFeedback?.sRpeLoad ??
        (rpe && moving_time > 0 ? Math.round(rpe * (moving_time / 60)) : undefined);

      if (preWorkoutFeeling !== undefined || rpe !== undefined || sRpeLoad !== undefined) {
        effortFeedback = stripUndefined({
          ...effortFeedback,
          preWorkoutFeeling,
          rpe,
          sRpeLoad,
        });
      }
    }

    // Reconstruct Calibration:
    // Only set manualTss when explicitly calibrated/manual OR when sensor-derived TSS cannot be calculated
    let calibration: ActivityCalibration | undefined = meta?.calibration
      ? { ...meta.calibration }
      : undefined;

    const tssCell = (row[colIdx.tss] || '').trim();
    const tssMatch = tssCell.match(/^(\d+(?:\.\d+)?)\s*(?:\((.+)\))?$/);
    const sheetTssVal = tssMatch ? parseFloat(tssMatch[1]) : undefined;
    const sheetTssLabel = tssMatch?.[2] || '';

    if (!calibration) {
      const computedTss = calculateActivityTSS(activity, undefined, athleteProfile);
      const isExplicitManualTss = /manual/i.test(sheetTssLabel);
      const needsFallbackTss =
        sheetTssVal !== undefined &&
        sheetTssVal > 0 &&
        (!computedTss || computedTss.tss <= 0);

      if (isExplicitManualTss || needsFallbackTss) {
        calibration = {
          manualTss: Math.round(sheetTssVal!),
        };
      } else if (parsedNotes.wasCalibrated) {
        calibration = {
          calibratedDistanceM: distanceM > 0 ? distanceM : undefined,
          calibratedMovingTimeSec: moving_time > 0 ? moving_time : undefined,
        };
      }
    }

    const parsedSyncedAt = parseSheetDateTimeToStravaIso(row[colIdx.syncedAt]);
    const publishedIso = parsedSyncedAt?.start_date || new Date().toISOString();

    detailsMap[idStr] = stripUndefined({
      id: idStr,
      activity: {
        ...activity,
        description,
        kilojoules,
        device_watts,
      },
      calibration,
      effortFeedback,
      noStreamsAvailable: meta?.noStreamsAvailable,
      isHydratedFromSheet: true,
      googleDrivePublishedAt: publishedIso,
    });

    activities.push(activity);
  }

  activities.sort(
    (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
  );

  return { activities, detailsMap, duplicatesMerged };
}

/**
 * Reconstructs StravaActivity[] + StravaActivityDetailsRecord map from a standard Strava Bulk Export "activities.csv" file
 * (same format as the 420-activity Strava export).
 */
export function reconstructWorkoutsFromStravaExportCsv(
  rows: string[][],
  headerRow: string[]
): {
  activities: StravaActivity[];
  detailsMap: Record<string, StravaActivityDetailsRecord>;
  duplicatesMerged: number;
} {
  // Note: Strava export CSV has duplicate header names ("Distance", "Elapsed Time", "Moving Time", etc. — summary first, raw meters/seconds later).
  // Capture ALL indices for each normalized header name so we use raw exact seconds/meters columns!
  const headerOccurrences = new Map<string, number[]>();
  headerRow.forEach((rawH, idx) => {
    const h = normalizeHeaderName(rawH);
    const list = headerOccurrences.get(h) || [];
    list.push(idx);
    headerOccurrences.set(h, list);
  });

  const firstIdx = (name: string): number => headerOccurrences.get(name)?.[0] ?? -1;
  const lastIdx = (name: string): number => {
    const arr = headerOccurrences.get(name);
    return arr && arr.length > 0 ? arr[arr.length - 1] : -1;
  };

  const cId = firstIdx('activity id');
  const cDate = firstIdx('activity date');
  const cName = firstIdx('activity name');
  const cType = firstIdx('activity type');
  const cDesc = firstIdx('activity description');
  const cElapsedSec = lastIdx('elapsed time');
  const cMovingSec = lastIdx('moving time');
  const cDistanceRaw = lastIdx('distance');
  const cDistanceSummary = firstIdx('distance');
  const cMaxSpeed = firstIdx('max speed');
  const cAvgSpeed = firstIdx('average speed');
  const cElevGain = firstIdx('elevation gain');
  const cMaxHr = lastIdx('max heart rate');
  const cAvgHr = firstIdx('average heart rate');
  const cMaxWatts = firstIdx('max watts');
  const cAvgWatts = firstIdx('average watts');
  const cWeightedWatts = firstIdx('weighted average power');
  const cTotalWork = firstIdx('total work');
  const cAvgCadence = lastIdx('average cadence');
  const cCalories = firstIdx('calories');
  const cRelativeEffort = lastIdx('relative effort');
  const cCommute = lastIdx('commute');
  const cGear = firstIdx('activity gear');
  const cPerceivedExertion = firstIdx('perceived exertion');

  const seenIds = new Set<string>();
  let duplicatesMerged = 0;
  const activities: StravaActivity[] = [];
  const detailsMap: Record<string, StravaActivityDetailsRecord> = {};

  const getCell = (r: string[], idx: number): string =>
    idx >= 0 && idx < r.length ? (r[idx] || '').trim() : '';

  for (const row of rows) {
    const idStr = getCell(row, cId);
    if (!idStr) continue;
    if (seenIds.has(idStr)) {
      duplicatesMerged++;
      continue;
    }
    seenIds.add(idStr);

    const rawDateStr = getCell(row, cDate);
    const dt = new Date(rawDateStr ? `${rawDateStr} UTC` : '');
    const validDt = !isNaN(dt.getTime()) ? dt : new Date(rawDateStr);
    if (isNaN(validDt.getTime())) continue;
    const start_date = validDt.toISOString().replace(/\.\d{3}Z$/, 'Z');

    // Approximate UK/local wall-clock offset if UTC
    const start_date_local = start_date;

    const rawType = getCell(row, cType) || 'Workout';
    const name = getCell(row, cName) || rawType;
    const description = getCell(row, cDesc) || undefined;

    let type = rawType.replace(/\s+/g, '');
    let sport_type = type;
    let trainer = false;

    if (/virtual\s*ride/i.test(rawType)) {
      type = 'VirtualRide';
      sport_type = 'VirtualRide';
      trainer = true;
    } else if (/virtual\s*run/i.test(rawType)) {
      type = 'VirtualRun';
      sport_type = 'VirtualRun';
      trainer = true;
    } else if (/weight\s*training/i.test(rawType)) {
      type = 'WeightTraining';
      sport_type = 'WeightTraining';
    } else if (type === 'Run' && /treadmill|indoor/i.test(`${name} ${description || ''}`)) {
      trainer = true;
    }

    // Distance: raw column in Strava export is meters; if only 1 Distance column exists it may be km
    let distance = parseNonNegativeNumber(getCell(row, cDistanceRaw));
    if (distance === undefined && cDistanceSummary >= 0) {
      const dSummary = parseNonNegativeNumber(getCell(row, cDistanceSummary));
      if (dSummary !== undefined) {
        distance = cDistanceRaw === cDistanceSummary ? dSummary * 1000 : dSummary;
      }
    }
    distance = distance ?? 0;

    const moving_time = Math.round(parseNonNegativeNumber(getCell(row, cMovingSec)) ?? 0);
    const elapsed_time = Math.max(
      moving_time,
      Math.round(parseNonNegativeNumber(getCell(row, cElapsedSec)) ?? moving_time)
    );
    const total_elevation_gain = parseNonNegativeNumber(getCell(row, cElevGain)) ?? 0;
    const average_speed =
      parsePositiveNumber(getCell(row, cAvgSpeed)) ??
      (distance > 0 && moving_time > 0 ? Number((distance / moving_time).toFixed(4)) : undefined);
    const max_speed = parsePositiveNumber(getCell(row, cMaxSpeed));
    const average_heartrate = parsePositiveNumber(getCell(row, cAvgHr));
    const max_heartrate = parsePositiveNumber(getCell(row, cMaxHr));
    const average_cadence = parsePositiveNumber(getCell(row, cAvgCadence));

    const isBike = type === 'Ride' || type === 'VirtualRide';
    const average_watts = isBike ? parsePositiveNumber(getCell(row, cAvgWatts)) : undefined;
    const weighted_average_watts = isBike
      ? parsePositiveNumber(getCell(row, cWeightedWatts))
      : undefined;
    const max_watts = isBike ? parsePositiveNumber(getCell(row, cMaxWatts)) : undefined;
    const rawTotalWorkJ = isBike ? parsePositiveNumber(getCell(row, cTotalWork)) : undefined;
    const kilojoules = rawTotalWorkJ ? Math.round(rawTotalWorkJ / 1000) : undefined;

    const calories = parsePositiveNumber(getCell(row, cCalories));
    const suffer_score = parsePositiveNumber(getCell(row, cRelativeEffort));
    const gearName = getCell(row, cGear) || undefined;
    const rpe = parsePositiveNumber(getCell(row, cPerceivedExertion));
    const commuteVal = getCell(row, cCommute).toLowerCase();
    const commute = commuteVal === 'true' || commuteVal === '1';

    const activity: StravaActivity = stripUndefined({
      id: parseNumericOrStringId(idStr),
      name,
      description,
      type,
      sport_type,
      trainer: trainer || undefined,
      gear_id: gearName,
      start_date,
      start_date_local,
      distance,
      moving_time,
      elapsed_time,
      total_elevation_gain,
      average_speed,
      max_speed,
      average_heartrate,
      max_heartrate,
      average_watts: average_watts ? Math.round(average_watts) : undefined,
      weighted_average_watts: weighted_average_watts
        ? Math.round(weighted_average_watts)
        : undefined,
      max_watts: max_watts ? Math.round(max_watts) : undefined,
      average_cadence: average_cadence ? Math.round(average_cadence) : undefined,
      calories: calories ? Math.round(calories) : undefined,
      suffer_score: suffer_score ? Math.round(suffer_score) : undefined,
    });

    if (kilojoules !== undefined) (activity as any).kilojoules = kilojoules;
    if (average_watts) (activity as any).device_watts = true;
    if (commute) (activity as any).commute = true;

    const effortFeedback: ActivityEffortFeedback | undefined =
      rpe && rpe >= 1 && rpe <= 10
        ? {
            rpe,
            sRpeLoad: moving_time > 0 ? Math.round(rpe * (moving_time / 60)) : undefined,
          }
        : undefined;

    detailsMap[idStr] = stripUndefined({
      id: idStr,
      activity: {
        ...activity,
        description,
        kilojoules,
      },
      effortFeedback,
      isHydratedFromSheet: true,
    });

    activities.push(activity);
  }

  activities.sort(
    (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
  );

  return { activities, detailsMap, duplicatesMerged };
}

/**
 * Universal CSV backup parser: automatically detects Google Sheets "Workouts" CSV backups
 * (both legacy 22-column and enriched 30-column) as well as standard Strava "activities.csv" exports.
 */
export function parseWorkoutBackupCsv(csvText: string): ParsedBackupResult {
  const allRows = parseCsvRecords(csvText);
  if (allRows.length < 2) {
    throw new Error('CSV file is empty or contains no workout rows.');
  }

  const headerRow = allRows[0];
  const dataRows = allRows.slice(1);
  const normalizedHeaders = headerRow.map(normalizeHeaderName);

  const isStravaBulkExport =
    normalizedHeaders.includes('activity id') &&
    normalizedHeaders.includes('activity date') &&
    normalizedHeaders.includes('activity type');

  const isGoogleSheetsWorkouts =
    normalizedHeaders.includes('strava activity id') ||
    (normalizedHeaders.includes('category') && normalizedHeaders.includes('sub-type'));

  if (isStravaBulkExport && !isGoogleSheetsWorkouts) {
    const res = reconstructWorkoutsFromStravaExportCsv(dataRows, headerRow);
    return { format: 'strava_export', ...res };
  }

  const res = reconstructWorkoutsFromSheetRows(dataRows, headerRow);
  if (res.activities.length === 0) {
    throw new Error(
      'No valid workout rows found in CSV. Ensure you exported the "Workouts" tab from Google Sheets or Strava activities.csv.'
    );
  }
  return { format: 'google_sheets', ...res };
}

/**
 * Merges restored workouts & details into localStorage and IndexedDB non-destructively:
 * - Preserves any existing local 1-second telemetry streams, laps, or user calibrations already in IndexedDB
 * - Removes sandbox demo-* activities if real workouts are being restored
 */
export async function applyRestoredWorkoutsToStorage(
  incomingActivities: StravaActivity[],
  incomingDetailsMap: Record<string, StravaActivityDetailsRecord>,
  duplicatesMerged = 0
): Promise<AppliedRestoreResult> {
  const existingActivities = getCachedStravaActivities().filter(
    (a) => !isDemoActivityId(a.id) && !isLegacyDemoActivityId(a.id)
  );
  const existingIds = new Set(existingActivities.map((a) => String(a.id)));

  let addedCount = 0;
  let updatedCount = 0;
  for (const act of incomingActivities) {
    if (existingIds.has(String(act.id))) {
      updatedCount++;
    } else {
      addedCount++;
    }
  }

  // Merge activities (incoming enriches/adds without losing rich fields on existing local Strava items)
  const mergedActivities = mergeStravaActivities(incomingActivities, existingActivities);
  // Ensure any newer user-edited names/RPE/descriptions from incoming are filled if missing on existing
  const incomingById = new Map(incomingActivities.map((a) => [String(a.id), a]));
  const finalActivities = mergedActivities.map((act) => {
    const inc = incomingById.get(String(act.id));
    if (!inc) return act;
    return {
      ...inc,
      ...act,
      description: act.description || inc.description,
      gear_id: act.gear_id || inc.gear_id,
      weighted_average_watts: act.weighted_average_watts ?? inc.weighted_average_watts,
      max_speed: act.max_speed ?? inc.max_speed,
      calories: act.calories ?? inc.calories,
    };
  });

  saveCachedStravaActivities(finalActivities);

  // Clear demo flag if real workouts were restored
  if (typeof window !== 'undefined' && incomingActivities.length > 0) {
    try {
      localStorage.removeItem('fit_track_demo_mode_active');
    } catch {}
  }

  // Merge details records in IndexedDB (preserving any existing local streams!)
  const existingRecords = await getAllCachedStravaActivityRecords();
  const mergedDetailsMap: Record<string, StravaActivityDetailsRecord> = { ...existingRecords };
  const recordsToSave: StravaActivityDetailsRecord[] = [];

  for (const [idStr, incRec] of Object.entries(incomingDetailsMap)) {
    const prev = existingRecords[idStr];
    const mergedRec: StravaActivityDetailsRecord = {
      ...incRec,
      ...prev,
      id: idStr,
      activity: {
        ...(incRec.activity || {}),
        ...(prev?.activity || {}),
      },
      calibration: prev?.calibration || incRec.calibration,
      effortFeedback: prev?.effortFeedback || incRec.effortFeedback,
      streams: prev?.streams || incRec.streams,
      googleDrivePublishedAt: prev?.googleDrivePublishedAt || incRec.googleDrivePublishedAt,
      isHydratedFromSheet: prev?.streams ? prev.isHydratedFromSheet : true,
    };
    mergedDetailsMap[idStr] = mergedRec;
    recordsToSave.push(mergedRec);
  }

  if (recordsToSave.length > 0) {
    await batchSaveStravaActivityRecords(recordsToSave);
  }

  return {
    activities: finalActivities,
    detailsMap: mergedDetailsMap,
    addedCount,
    updatedCount,
    totalCount: finalActivities.filter((a) => !a.isDeleted).length,
    duplicatesMerged,
  };
}
