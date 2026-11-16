import { processActivitiesWithRenameRules, applyRenameRulesToActivities } from './activityRenameRules.ts';

export interface StravaActivity {
  id: number | string;
  name: string;
  description?: string;
  distance: number; // in meters
  moving_time: number; // in seconds
  elapsed_time: number; // in seconds
  total_elevation_gain?: number;
  type: string;
  sport_type?: string;
  trainer?: boolean;
  gear_id?: string | null;
  start_date: string;
  start_date_local: string;
  timezone?: string;
  kudos_count?: number;
  achievement_count?: number;
  pr_count?: number;
  average_speed?: number; // m/s
  max_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  weighted_average_watts?: number;
  max_watts?: number;
  average_cadence?: number;
  calories?: number;
  suffer_score?: number;
  isDeleted?: boolean;
  hide_from_home?: boolean;
  muted?: boolean;
  laps?: any[];
  splits_metric?: any[];
}

export interface CalibratedSwimLap {
  lapIndex: number;
  originalLapIndex?: number; // 1-based index of the raw Strava lap for per-lap HR/cadence stitching
  distanceM: number;
  movingTimeSec: number;
  pacePer100mFormatted: string;
  strokeRateSpm?: number; // Average stroke rate (strokes/min) from Strava lap or cadence stream
  totalStrokes?: number;  // Total strokes (cycles) in the lap
  avgHr?: number;         // Average heart rate (bpm) for this lap
  maxHr?: number;         // Max heart rate (bpm) for this lap
  swolf?: number;         // Average SWOLF per 25m length
  isIgnored?: boolean;
  isRest?: boolean;
}

export interface CalibratedRunSection {
  id: string;
  name: string;
  originalLapIndex?: number;
  durationSec: number;
  speedKph: number;
  paceMinSec?: string;
  distanceM?: number;
}

export interface OriginalLapStreamSlice {
  lapIndex: number; // 1-based
  origDurationSec: number;
  hrSeries: number[];      // 1-second HR samples for this lap
  cadenceSeries: number[]; // 1-second cadence/stroke-rate samples for this lap
  avgHr?: number;
  maxHr?: number;
  avgCadence?: number;
  maxCadence?: number;
  totalCycles?: number;
}

/**
 * Extracts 1-second resampled Heart Rate and Cadence/Stroke-Rate slices for each original Strava lap.
 * Ensures each lap owns its exact original physiological data window so editing one lap's duration
 * never shifts or corrupts the HR/cadence of subsequent laps.
 */
export function extractOriginalLapStreamSlices(
  rawLaps: unknown,
  streams?: Record<string, { data?: any[] }>,
  fallbackActivityAvgCadence?: number
): OriginalLapStreamSlice[] {
  if (!Array.isArray(rawLaps) || rawLaps.length === 0) return [];

  const timeData = Array.isArray(streams?.time?.data) ? (streams!.time!.data as number[]) : undefined;
  const hrData = Array.isArray(streams?.heartrate?.data) ? (streams!.heartrate!.data as number[]) : undefined;
  const cadData = Array.isArray(streams?.cadence?.data) ? (streams!.cadence!.data as number[]) : undefined;

  let cumElapsedSec = 0;

  return rawLaps.map((rawLap, idx) => {
    const lap = (rawLap && typeof rawLap === 'object' ? rawLap : {}) as Record<string, any>;
    const origDurSec = Math.max(1, Math.round(Number(lap.elapsed_time) || Number(lap.moving_time) || 1));
    const distM = Number(lap.distance) || 0;
    const isRest = distM <= 0;

    const lapStartSec = cumElapsedSec;
    const lapEndSec = cumElapsedSec + origDurSec;
    cumElapsedSec = lapEndSec;

    // Determine index window in streams
    let startIdx = -1;
    let endIdx = -1;
    if (
      timeData &&
      timeData.length > 0 &&
      typeof lap.start_index === 'number' &&
      typeof lap.end_index === 'number' &&
      lap.start_index >= 0 &&
      lap.end_index < timeData.length &&
      lap.end_index >= lap.start_index &&
      Math.abs((Number(timeData[lap.end_index]) || 0) - (Number(timeData[lap.start_index]) || 0) - origDurSec) <=
        Math.max(30, origDurSec * 0.35)
    ) {
      startIdx = lap.start_index;
      endIdx = lap.end_index;
    } else if (timeData && timeData.length > 0) {
      startIdx = timeData.findIndex((t) => t >= lapStartSec);
      if (startIdx === -1) startIdx = 0;
      endIdx = timeData.findIndex((t) => t >= lapEndSec);
      if (endIdx === -1) endIdx = timeData.length - 1;
    }

    // Build 1-second HR series for this lap
    const hrSeries: number[] = [];
    const cadSeries: number[] = [];

    if (timeData && startIdx >= 0 && endIdx >= startIdx) {
      const t0 = timeData[startIdx];
      let ptr = startIdx;

      for (let s = 0; s < origDurSec; s++) {
        const targetT = t0 + s;
        while (ptr < endIdx && timeData[ptr + 1] !== undefined && timeData[ptr + 1] <= targetT) {
          ptr++;
        }
        const nextPtr = Math.min(endIdx, ptr + 1);
        const tA = timeData[ptr];
        const tB = timeData[nextPtr];
        const ratio = tB > tA ? Math.max(0, Math.min(1, (targetT - tA) / (tB - tA))) : 0;

        if (hrData && hrData[ptr] !== undefined) {
          const hA = Number(hrData[ptr]) || 0;
          const hB = Number(hrData[nextPtr] ?? hA) || hA;
          if (hA > 30 && hB > 30) {
            hrSeries.push(Math.round(hA + (hB - hA) * ratio));
          } else if (hA > 30) {
            hrSeries.push(Math.round(hA));
          } else if (hB > 30) {
            hrSeries.push(Math.round(hB));
          }
        }

        if (!isRest && cadData && cadData[ptr] !== undefined) {
          const cA = Number(cadData[ptr]) || 0;
          const cB = Number(cadData[nextPtr] ?? cA) || cA;
          if (cA > 0 && cB > 0) {
            cadSeries.push(Math.round(cA + (cB - cA) * ratio));
          } else if (cA > 0) {
            cadSeries.push(Math.round(cA));
          } else if (cB > 0) {
            cadSeries.push(Math.round(cB));
          }
        }
      }
    }

    const rawAvgHr = Number(lap.average_heartrate) > 30 ? Math.round(Number(lap.average_heartrate)) : undefined;
    const rawMaxHr = Number(lap.max_heartrate) > 30 ? Math.round(Number(lap.max_heartrate)) : undefined;

    if (hrSeries.length === 0 && rawAvgHr) {
      for (let s = 0; s < origDurSec; s++) {
        hrSeries.push(rawAvgHr);
      }
    }

    const computedAvgHr =
      hrSeries.length > 0
        ? Math.round(hrSeries.reduce((a, b) => a + b, 0) / hrSeries.length)
        : rawAvgHr;
    const computedMaxHr =
      hrSeries.length > 0 ? Math.max(...hrSeries, rawMaxHr || 0) : rawMaxHr;

    const rawLapCadence =
      !isRest && Number(lap.average_cadence) > 0
        ? Math.round(Number(lap.average_cadence))
        : undefined;
    const streamAvgCadence =
      !isRest && cadSeries.length > 0
        ? Math.round(cadSeries.reduce((a, b) => a + b, 0) / cadSeries.length)
        : undefined;
    const effectiveAvgCadence = isRest
      ? 0
      : rawLapCadence ??
        streamAvgCadence ??
        (fallbackActivityAvgCadence && fallbackActivityAvgCadence > 0
          ? Math.round(fallbackActivityAvgCadence)
          : undefined);

    if (!isRest && cadSeries.length === 0 && effectiveAvgCadence && effectiveAvgCadence > 0) {
      for (let s = 0; s < origDurSec; s++) {
        cadSeries.push(effectiveAvgCadence);
      }
    } else if (isRest) {
      for (let s = 0; s < origDurSec; s++) {
        cadSeries.push(0);
      }
    }

    const computedMaxCadence =
      !isRest && cadSeries.length > 0
        ? Math.max(...cadSeries, effectiveAvgCadence || 0)
        : effectiveAvgCadence;

    const rawCycles = Number(lap.total_cycles) > 0 ? Math.round(Number(lap.total_cycles)) : undefined;

    return {
      lapIndex: idx + 1,
      origDurationSec: origDurSec,
      hrSeries,
      cadenceSeries: cadSeries,
      avgHr: computedAvgHr,
      maxHr: computedMaxHr,
      avgCadence: effectiveAvgCadence,
      maxCadence: computedMaxCadence,
      totalCycles: rawCycles,
    };
  });
}

/**
 * Adjusts a lap's 1-second physiological stream (Heart Rate or Cadence) to match a calibrated duration:
 * - If unchanged: returns the exact original lap stream untouched.
 * - If shortened: trims to the calibrated duration without affecting subsequent laps.
 * - If extended: repeats heart rate / cadence data from the start of the lap (after any initial post-rest ramp)
 *   so the lap's physiological profile fills the extended duration while all other laps keep their exact original data.
 */
export function stitchLapSeriesForDuration(
  origSeries: number[],
  targetDurationSec: number,
  fallbackValue?: number
): number[] {
  const targetLen = Math.max(1, Math.round(targetDurationSec));
  if (!origSeries || origSeries.length === 0) {
    if (fallbackValue !== undefined && fallbackValue >= 0) {
      return Array(targetLen).fill(Math.round(fallbackValue));
    }
    return [];
  }

  if (targetLen === origSeries.length) {
    return [...origSeries];
  }

  if (targetLen < origSeries.length) {
    return origSeries.slice(0, targetLen);
  }

  // Extended lap: repeat data from the start of the lap
  const extraSec = targetLen - origSeries.length;
  const checkIdx = Math.min(15, origSeries.length - 1);
  const hasInitialRamp = origSeries.length > 20 && Math.abs(origSeries[checkIdx] - origSeries[0]) > 6;
  const repeatStartIdx = hasInitialRamp ? Math.min(15, Math.floor(origSeries.length * 0.2)) : 0;

  const repeatPool = origSeries.slice(repeatStartIdx);
  const repeatedSegment: number[] = [];
  for (let i = 0; i < extraSec; i++) {
    repeatedSegment.push(repeatPool[i % repeatPool.length]);
  }

  return [
    ...origSeries.slice(0, repeatStartIdx),
    ...repeatedSegment,
    ...origSeries.slice(repeatStartIdx),
  ];
}

export function mapStravaRunLapsToSections(rawLaps: unknown): CalibratedRunSection[] {
  if (!Array.isArray(rawLaps)) return [];

  return rawLaps.flatMap((rawLap, index) => {
    if (!rawLap || typeof rawLap !== 'object') return [];
    const lap = rawLap as Record<string, unknown>;
    const movingTimeSec = Number(lap.moving_time) || 0;
    const durationSec = Math.round(Number(lap.elapsed_time) || movingTimeSec);
    if (durationSec <= 0) return [];

    const distanceM = Number(lap.distance) || 0;
    const averageSpeedMps = Number(lap.average_speed) || 0;
    const speedKph = averageSpeedMps > 0
      ? averageSpeedMps * 3.6
      : distanceM > 0 && movingTimeSec > 0
        ? (distanceM / movingTimeSec) * 3.6
        : 0;
    const lapNumber = Number(lap.lap_index) || index + 1;

    return [{
      id: String(lap.id ?? `strava-lap-${lapNumber}`),
      name: typeof lap.name === 'string' && lap.name.trim() ? lap.name : `Lap ${lapNumber}`,
      originalLapIndex: index + 1,
      durationSec,
      speedKph: Number(speedKph.toFixed(2)),
    }];
  });
}

export interface ActivityCalibration {
  isIgnoredFromTrainingStatus?: boolean; // Exclude from TSS & training load calculations
  calibratedDistanceM?: number; // Overrides total distance (treadmill calibration)
  calibratedMovingTimeSec?: number; // Overrides moving time
  calibratedMaxHeartRate?: number; // Fixes inaccurate sensor spikes
  calibratedAvgHeartRate?: number;
  calibratedAvgWatts?: number;
  calibratedNormalizedPower?: number;
  calibratedLaps?: CalibratedSwimLap[]; // Fix inaccurate swim watch laps
  calibratedRunSections?: CalibratedRunSection[]; // Indoor / treadmill simulated run sections
  calibratedAt?: string;
  calibrationNotes?: string;
  manualTss?: number;
  preferredTssModel?: 'auto' | 'hrTSS' | 'rTSS' | 'sTSS' | 'powerTSS';
  replacesActivityId?: string; // Original Strava activity ID replaced when republished
  replacedByActivityId?: string; // New Strava activity ID that superseded this activity
}

export interface ActivityEffortFeedback {
  preWorkoutFeeling?: 1 | 2 | 3 | 4 | 5; // 1: Drained, 2: Tired, 3: Normal, 4: Good, 5: Primed
  rpe?: number; // 1 to 10 Borg CR-10 scale
  sRpeLoad?: number; // rpe * (durationMinutes)
  feedbackNotes?: string;
  recordedAt?: string;
}

export interface StravaActivityDetailsRecord {
  id: string;
  activity?: Record<string, unknown>;
  streams?: Record<string, unknown>;
  streamsError?: string;
  lapsError?: string;
  noStreamsAvailable?: boolean;
  isHydratedFromSheet?: boolean;
  calibration?: ActivityCalibration;
  effortFeedback?: ActivityEffortFeedback;
  fetchedAt?: string;
  lapsFetchedAt?: string;
  analysedAt?: string;
  googleDrivePublishedAt?: string;
}

import type { AthleteProfile } from '../types/athlete.ts';
import {
  formatSecondsToMinSec,
  getAthletePowerZones,
  getAthleteHeartRateZones,
  DEFAULT_ATHLETE_PROFILE,
} from '../types/athlete.ts';

export interface StravaActivityDetailsResponse {
  activity: Record<string, unknown>;
  streams?: Record<string, unknown>;
  streamsError?: string;
  lapsError?: string;
}

export const STRAVA_ACTIVITIES_CACHE_KEY = 'gymfit_strava_activities_cache';
export const STRAVA_NEW_ACTIVITY_IDS_KEY = 'gymfit_strava_new_activity_ids';
export const STRAVA_LAST_REFRESH_KEY = 'gymfit_strava_last_refresh_timestamp';
export const STRAVA_DELETED_ACTIVITY_IDS_KEY = 'gymfit_strava_deleted_activity_ids';

export function getDeletedActivityIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STRAVA_DELETED_ACTIVITY_IDS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

export function markActivityAsDeleted(activityId: string | number): void {
  const idStr = String(activityId);
  const current = getDeletedActivityIds();
  current.add(idStr);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STRAVA_DELETED_ACTIVITY_IDS_KEY, JSON.stringify(Array.from(current)));
    } catch {}
  }
  const cached = getCachedStravaActivitiesSnapshot() || [];
  const updated = cached.map((act) =>
    String(act.id) === idStr
      ? {
          ...act,
          isDeleted: true,
          distance: 0,
          moving_time: 0,
          elapsed_time: 0,
          average_speed: 0,
          max_speed: 0,
          average_heartrate: undefined,
          max_heartrate: undefined,
          average_watts: undefined,
          weighted_average_watts: undefined,
          max_watts: undefined,
          average_cadence: undefined,
          calories: undefined,
          suffer_score: undefined,
          laps: undefined,
          splits_metric: undefined,
        }
      : act
  );
  saveCachedStravaActivities(updated);
  void deleteCachedStravaActivityRecords([idStr]);
}

export function unmarkActivityAsDeleted(activityId: string | number): void {
  const idStr = String(activityId);
  const current = getDeletedActivityIds();
  current.delete(idStr);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STRAVA_DELETED_ACTIVITY_IDS_KEY, JSON.stringify(Array.from(current)));
    } catch {}
  }
  const cached = getCachedStravaActivitiesSnapshot() || [];
  const updated = cached.map((act) =>
    String(act.id) === idStr ? { ...act, isDeleted: false } : act
  );
  saveCachedStravaActivities(updated);
}

export function isStravaAuthorizationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /authorization|unauthorized|access token|401/i.test(error.message)
  );
}

const STRAVA_ACTIVITY_DB_NAME = 'gymfit_strava_activity_data';
const STRAVA_ACTIVITY_DB_VERSION = 1;
const STRAVA_ACTIVITY_STORE_NAME = 'activities';

export function getCachedStravaActivitiesSnapshot(): StravaActivity[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STRAVA_ACTIVITIES_CACHE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StravaActivity[]) : null;
  } catch {
    return null;
  }
}

export function getCachedStravaActivities(): StravaActivity[] {
  const list = getCachedStravaActivitiesSnapshot() || [];
  const deletedIds = getDeletedActivityIds();
  const withRules = applyRenameRulesToActivities(list);
  return withRules.map((act) => {
    const isDel = deletedIds.has(String(act.id)) || Boolean(act.isDeleted);
    if (!isDel) return act;
    return {
      ...act,
      isDeleted: true,
      distance: 0,
      moving_time: 0,
      elapsed_time: 0,
      average_speed: 0,
      max_speed: 0,
      average_heartrate: undefined,
      max_heartrate: undefined,
      average_watts: undefined,
      weighted_average_watts: undefined,
      max_watts: undefined,
      average_cadence: undefined,
      calories: undefined,
      suffer_score: undefined,
      laps: undefined,
      splits_metric: undefined,
    };
  });
}

export function saveCachedStravaActivities(activities: StravaActivity[]): void {
  if (typeof window === 'undefined') return;
  try {
    const cleaned = applyRenameRulesToActivities(activities);
    localStorage.setItem(STRAVA_ACTIVITIES_CACHE_KEY, JSON.stringify(cleaned));
  } catch (err) {
    console.warn('[Strava Cache] localStorage quota warning:', err);
  }
}

export const STRAVA_LAST_APP_OPEN_KEY = 'fittrack_last_app_open_ms';

export function getLastAppOpenTime(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const val = localStorage.getItem(STRAVA_LAST_APP_OPEN_KEY);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

export function setLastAppOpenTime(timestamp = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STRAVA_LAST_APP_OPEN_KEY, String(timestamp));
  } catch {}
}

export function getMostRecentStravaActivityStartEpoch(
  activities: StravaActivity[] = getCachedStravaActivities()
): number | null {
  let maxEpochSec = 0;
  for (const act of activities) {
    if (!act || act.isDeleted || !act.start_date) continue;
    const idStr = String(act.id);
    if (idStr.startsWith('demo-') || idStr.startsWith('local-')) continue;
    const ms = new Date(act.start_date).getTime();
    if (Number.isFinite(ms) && ms > 0) {
      const sec = Math.floor(ms / 1000);
      if (sec > maxEpochSec) {
        maxEpochSec = sec;
      }
    }
  }
  return maxEpochSec > 0 ? maxEpochSec : null;
}

export function getLastStravaRefreshTime(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const val = localStorage.getItem(STRAVA_LAST_REFRESH_KEY);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

export function setLastStravaRefreshTime(timestamp = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STRAVA_LAST_REFRESH_KEY, String(timestamp));
  } catch {}
}

export function getCachedStravaNewActivityIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STRAVA_NEW_ACTIVITY_IDS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === 'string')
      ? (parsed as string[])
      : [];
  } catch {
    return [];
  }
}

export function saveCachedStravaNewActivityIds(activityIds: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STRAVA_NEW_ACTIVITY_IDS_KEY, JSON.stringify(activityIds));
  } catch {}
}

/**
 * Activity is considered "New" if its start date is within the last 24 hours.
 * Rule: "New should stay on activities for 24 hours, even if the activity has been published."
 */
export function isActivityNew(activity: StravaActivity): boolean {
  try {
    const startTime = new Date(activity.start_date).getTime();
    if (isNaN(startTime)) return false;
    const ageMs = Date.now() - startTime;
    return ageMs >= 0 && ageMs < 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * Activity is "Unpublished" if it has not yet been exported to Google Sheets.
 */
export function isActivityUnpublished(record?: StravaActivityDetailsRecord): boolean {
  return !record?.googleDrivePublishedAt;
}

// --------------------------------------------------------------------------
// Activity Classification & Metrics
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// Activity Classification & Metrics (8 Specific Subtypes, 5 Filter Tabs)
// --------------------------------------------------------------------------

export type ActivityFilterCategory = 'All' | 'Swim' | 'Bike' | 'Run' | 'Gym';

export type ActivityCategory = 'Swim' | 'Bike' | 'Run' | 'Gym' | 'Other';

export type ActivitySubtype =
  | 'Swim'
  | 'Open Water Swim'
  | 'Bike'
  | 'Turbo Trainer'
  | 'Run'
  | 'Treadmill Run'
  | 'Strength'
  | 'Other';

export interface ActivityClassification {
  category: ActivityCategory;
  subType: ActivitySubtype;
  isOutdoor: boolean;
}

/**
 * Strict 8-subtype classification:
 * 1. Swim (Swim or Pool Swims)
 * 2. Open Water Swim
 * 3. Bike (Outdoors)
 * 4. Turbo Trainer (Virtual ride or ride with trainer=true)
 * 5. Run (Outdoors)
 * 6. Treadmill Run (Virtual run or run with trainer=true)
 * 7. Strength (Only Weight Training in Strava)
 * 8. Other (Any other activity or exercise classes)
 */
export function classifyActivity(activity: StravaActivity): ActivityClassification {
  const rawType = (activity.type || '').trim().toLowerCase();
  const rawSportType = (activity.sport_type || '').trim().toLowerCase();
  const isTrainer = Boolean(activity.trainer);

  const matches = (name: string) =>
    rawType === name.toLowerCase() || rawSportType === name.toLowerCase();

  // 1. Swim Family: Distinguish Pool Swim vs Open Water Swim
  const swimTitle = (activity.name || '').toLowerCase();
  const hasPoolKeyword = /\bpool\b|indoor\s+swim|25m|50m\s+pool/i.test(swimTitle);
  const hasOpenWaterKeyword = /open\s*water|\bow\s+swim\b|outdoor\s+swim|lake\s+swim|sea\s+swim|ocean\s+swim|river\s+swim|triathlon\s+swim/i.test(swimTitle);
  const hasStartGps = Array.isArray((activity as any).start_latlng) && (activity as any).start_latlng.length === 2 && !isTrainer && !hasPoolKeyword;

  if (matches('OpenWaterSwim') || (matches('Swim') && (hasOpenWaterKeyword || hasStartGps))) {
    return { category: 'Swim', subType: 'Open Water Swim', isOutdoor: true };
  }
  if (matches('Swim')) {
    return { category: 'Swim', subType: 'Swim', isOutdoor: false };
  }

  // 2. Strength Family (Strictly ONLY Weight Training in Strava!)
  if (matches('WeightTraining')) {
    return { category: 'Gym', subType: 'Strength', isOutdoor: false };
  }

  // 3. Run Family (Strictly match Run or TrailRun)
  const isRunBase = matches('Run') || matches('TrailRun');
  const isVirtualRun = matches('VirtualRun');
  const hasTreadmillName = /treadmill|indoor run/i.test(activity.name || '');
  if (isVirtualRun || (isRunBase && (isTrainer || hasTreadmillName))) {
    return { category: 'Run', subType: 'Treadmill Run', isOutdoor: false };
  }
  if (isRunBase) {
    return { category: 'Run', subType: 'Run', isOutdoor: true };
  }

  // 4. Bike Family (Strictly match Ride, GravelRide, MountainBikeRide, EBikeRide)
  const isRideBase =
    matches('Ride') ||
    matches('GravelRide') ||
    matches('MountainBikeRide') ||
    matches('EBikeRide');
  const isVirtualRide = matches('VirtualRide');
  if (isVirtualRide || (isRideBase && isTrainer)) {
    return { category: 'Bike', subType: 'Turbo Trainer', isOutdoor: false };
  }
  if (isRideBase) {
    return { category: 'Bike', subType: 'Bike', isOutdoor: true };
  }

  // 5. Other (Any other activity: Yoga, Walk, Hike, Rowing, Workout, Crossfit, etc.)
  return { category: 'Other', subType: 'Other', isOutdoor: false };
}

export interface SportMetricsFormatted {
  primaryMetricLabel: string;
  secondaryMetricLabel?: string;
  elevationLabel?: string;
}

/**
 * Format sport-specific metrics:
 * - Swimming: Pace per 100m, distance in meters
 * - Bike & Turbo Trainer: Avg speed in kph, distance in km, elevation (and watts ONLY for bike/turbo)
 * - Run & Treadmill Run: Avg pace in min/km, distance in km (NO power metrics!)
 * - Strength: Workout duration, effort (NO power metrics!)
 */
export function formatSportMetrics(
  activity: StravaActivity,
  details?: StravaActivityDetailsRecord
): SportMetricsFormatted {
  const { category, subType } = classifyActivity(activity);
  const distanceM = details?.calibration?.calibratedDistanceM ?? activity.distance ?? 0;
  const movingTimeSec = details?.calibration?.calibratedMovingTimeSec ?? activity.moving_time ?? activity.elapsed_time ?? 0;
  const elevationM =
    activity.total_elevation_gain && activity.total_elevation_gain > 0
      ? Math.round(activity.total_elevation_gain)
      : null;

  const elevationLabel = elevationM !== null ? `↑ ${elevationM}m` : undefined;

  switch (category) {
    case 'Swim': {
      // Swimming: Pace per 100m
      if (distanceM > 0 && movingTimeSec > 0) {
        const secPer100m = (movingTimeSec / distanceM) * 100;
        const mins = Math.floor(secPer100m / 60);
        const secs = Math.round(secPer100m % 60);
        const paceStr = `${mins}:${secs.toString().padStart(2, '0')}/100m`;
        return {
          primaryMetricLabel: `${Math.round(distanceM)}m`,
          secondaryMetricLabel: paceStr,
        };
      }
      return { primaryMetricLabel: `${Math.round(distanceM)}m` };
    }

    case 'Bike': {
      // Cycling (Bike or Turbo Trainer): Average speed in km/h (kph) and max speed for outdoor
      const effectiveWatts = details?.calibration?.calibratedAvgWatts ?? activity.average_watts;
      const maxSpeedKph = activity.max_speed ? (activity.max_speed * 3.6).toFixed(1) : undefined;

      if (distanceM > 0 && movingTimeSec > 0) {
        const avgKph = ((distanceM / 1000) / (movingTimeSec / 3600)).toFixed(1);
        const distanceKm = (distanceM / 1000).toFixed(1);

        let secondaryParts: string[] = [];
        if (subType === 'Bike') {
          // Outdoor bike: report both avg speed and max speed
          if (maxSpeedKph) {
            secondaryParts.push(`${avgKph} kph avg · max ${maxSpeedKph} kph`);
          } else {
            secondaryParts.push(`${avgKph} kph avg`);
          }
          if (effectiveWatts && effectiveWatts > 0) {
            secondaryParts.push(`${Math.round(effectiveWatts)}W avg`);
          }
        } else {
          // Turbo Trainer: don't show speed if we have average power
          if (effectiveWatts && effectiveWatts > 0) {
            secondaryParts.push(`${Math.round(effectiveWatts)}W avg`);
          } else {
            secondaryParts.push(`${avgKph} kph`);
          }
        }

        return {
          primaryMetricLabel: `${distanceKm} km`,
          secondaryMetricLabel: secondaryParts.join(' · '),
          elevationLabel: subType === 'Turbo Trainer' ? undefined : elevationLabel,
        };
      }
      return {
        primaryMetricLabel: distanceM > 0 ? `${(distanceM / 1000).toFixed(1)} km` : `${Math.round(movingTimeSec / 60)} min`,
        elevationLabel: subType === 'Turbo Trainer' ? undefined : elevationLabel,
      };
    }

    case 'Run': {
      // Running (Run or Treadmill Run): Average pace in min/km (STRICTLY NO POWER)
      if (distanceM > 0 && movingTimeSec > 0) {
        const secPerKm = movingTimeSec / (distanceM / 1000);
        const mins = Math.floor(secPerKm / 60);
        const secs = Math.round(secPerKm % 60);
        const paceStr = `${mins}:${secs.toString().padStart(2, '0')}/km`;
        const distanceKm = (distanceM / 1000).toFixed(2);
        return {
          primaryMetricLabel: `${distanceKm} km`,
          secondaryMetricLabel: paceStr,
          elevationLabel: subType === 'Treadmill Run' ? undefined : elevationLabel,
        };
      }
      return {
        primaryMetricLabel: `${(distanceM / 1000).toFixed(2)} km`,
        elevationLabel: subType === 'Treadmill Run' ? undefined : elevationLabel,
      };
    }

    case 'Gym': {
      // Strength (Weight Training): Duration & sets/effort (STRICTLY NO POWER)
      const mins = Math.round(movingTimeSec / 60);
      return {
        primaryMetricLabel: `${mins} min workout`,
        secondaryMetricLabel: activity.average_heartrate
          ? `${Math.round(activity.average_heartrate)} bpm avg`
          : undefined,
      };
    }

    default: {
      const distanceKm = distanceM > 0 ? `${(distanceM / 1000).toFixed(1)} km` : null;
      return {
        primaryMetricLabel: distanceKm || `${Math.round(movingTimeSec / 60)} min`,
        secondaryMetricLabel: activity.average_heartrate
          ? `${Math.round(activity.average_heartrate)} bpm`
          : undefined,
        elevationLabel,
      };
    }
  }
}

export interface SwimPaceDetails {
  pacePer100mFormatted: string;
  paceSecondsPer100m: number;
  totalDistanceM: number;
  movingTimeSec: number;
  avgStrokeRateSpm?: number;
  totalStrokes?: number;
  avgSwolf?: number;
  isAutoCreatedSplits?: boolean;
  laps?: Array<{
    lapIndex: number;
    originalLapIndex?: number;
    distanceM: number;
    movingTimeSec: number;
    pacePer100mFormatted: string;
    strokeRateSpm?: number;
    totalStrokes?: number;
    avgHr?: number;
    maxHr?: number;
    swolf?: number;
    isIgnored?: boolean;
    isRest?: boolean;
  }>;
}

export interface AutoCreatedSplitChunk {
  splitIndex: number;
  distanceM: number;
  movingTimeSec: number;
  elapsedTimeSec: number;
  avgSpeedMps: number;
  avgSpeedKph: string;
  paceSecPerKm: number;
  paceFormatted: string;
  swimPaceSecPer100m: number;
  swimPaceFormatted: string;
  avgHr?: number;
  maxHr?: number;
  avgWatts?: number;
  avgCadence?: number;
  elevationDiffM?: number;
  elevationGainM?: number;
}

/**
 * Returns true if the activity has no laps or only 1 lap from start to finish
 * (and no multi-lap user calibration has been applied).
 */
export function hasSingleOrNoLaps(
  activity: StravaActivity,
  details?: StravaActivityDetailsRecord
): boolean {
  const calibratedLaps = details?.calibration?.calibratedLaps;
  if (Array.isArray(calibratedLaps) && calibratedLaps.length > 1) return false;

  const calibratedRunSections = details?.calibration?.calibratedRunSections;
  if (Array.isArray(calibratedRunSections) && calibratedRunSections.length > 1) return false;

  const rawLaps =
    Array.isArray(details?.activity?.laps) && (details!.activity!.laps as any[]).length > 0
      ? (details!.activity!.laps as any[])
      : Array.isArray(activity.laps)
        ? activity.laps
        : [];

  return rawLaps.length <= 1;
}

/**
 * Automatically creates fixed-distance splits (1000m for Run, 2000m for Bike, 100m for Swim)
 * from activity streams, splits_metric, or total distance/time when an activity has 0 or 1 lap.
 */
export function generateAutoSplitsFromStreamsOrActivity(
  activity: StravaActivity,
  details: StravaActivityDetailsRecord | undefined,
  splitDistanceM: number
): AutoCreatedSplitChunk[] {
  const safeSplitM = Math.max(25, splitDistanceM);
  const totalDistM =
    details?.calibration?.calibratedDistanceM ??
    activity.distance ??
    ((details?.activity as any)?.distance as number) ??
    0;
  const totalMovingSec =
    details?.calibration?.calibratedMovingTimeSec ??
    activity.moving_time ??
    activity.elapsed_time ??
    ((details?.activity as any)?.moving_time as number) ??
    0;

  if (totalDistM <= 0 || totalMovingSec <= 0) return [];

  const minRemainderM = Math.max(10, safeSplitM * 0.05);
  const streams = details?.streams as Record<string, { data?: any[] }> | undefined;
  const distStream = Array.isArray(streams?.distance?.data) ? (streams!.distance!.data as number[]) : undefined;
  const timeStream = Array.isArray(streams?.time?.data) ? (streams!.time!.data as number[]) : undefined;
  const hrStream = Array.isArray(streams?.heartrate?.data) ? (streams!.heartrate!.data as number[]) : undefined;
  const wattsStream = Array.isArray(streams?.watts?.data) ? (streams!.watts!.data as number[]) : undefined;
  const cadStream = Array.isArray(streams?.cadence?.data) ? (streams!.cadence!.data as number[]) : undefined;
  const altStream = Array.isArray(streams?.altitude?.data) ? (streams!.altitude!.data as number[]) : undefined;

  const formatChunkMetrics = (
    splitIndex: number,
    distM: number,
    movingSec: number,
    opts?: {
      avgHr?: number;
      maxHr?: number;
      avgWatts?: number;
      avgCadence?: number;
      elevationDiffM?: number;
      elevationGainM?: number;
    }
  ): AutoCreatedSplitChunk => {
    const cleanDistM = Math.max(1, Math.round(distM));
    const cleanTimeSec = Math.max(1, Math.round(movingSec));
    const avgSpeedMps = cleanDistM / cleanTimeSec;
    const avgSpeedKph = (avgSpeedMps * 3.6).toFixed(1);

    const paceSecPerKm = cleanTimeSec / (cleanDistM / 1000);
    const pMin = Math.floor(paceSecPerKm / 60);
    const pSec = Math.round(paceSecPerKm % 60);
    const paceFormatted = `${pMin}:${pSec.toString().padStart(2, '0')}/km`;

    const swimPaceSecPer100m = (cleanTimeSec / cleanDistM) * 100;
    const sMin = Math.floor(swimPaceSecPer100m / 60);
    const sSec = Math.round(swimPaceSecPer100m % 60);
    const swimPaceFormatted = `${sMin}:${sSec.toString().padStart(2, '0')}/100m`;

    return {
      splitIndex,
      distanceM: cleanDistM,
      movingTimeSec: cleanTimeSec,
      elapsedTimeSec: cleanTimeSec,
      avgSpeedMps,
      avgSpeedKph,
      paceSecPerKm,
      paceFormatted,
      swimPaceSecPer100m,
      swimPaceFormatted,
      avgHr: opts?.avgHr,
      maxHr: opts?.maxHr,
      avgWatts: opts?.avgWatts,
      avgCadence: opts?.avgCadence,
      elevationDiffM: opts?.elevationDiffM,
      elevationGainM: opts?.elevationGainM,
    };
  };

  // 1. Slice directly from distance + time streams if present
  if (
    distStream &&
    timeStream &&
    distStream.length >= 2 &&
    timeStream.length === distStream.length &&
    (distStream[distStream.length - 1] || 0) > 20
  ) {
    const maxStreamDist = distStream[distStream.length - 1] || totalDistM;
    const distScale = maxStreamDist > 0 ? totalDistM / maxStreamDist : 1;

    // Build cumulative active moving time array so stops/pauses don't distort split times
    const cumMovingSec = new Array<number>(distStream.length).fill(0);
    for (let i = 1; i < distStream.length; i++) {
      const dt = Math.max(0, (Number(timeStream[i]) || 0) - (Number(timeStream[i - 1]) || 0));
      const dd = Math.max(0, (Number(distStream[i]) || 0) - (Number(distStream[i - 1]) || 0)) * distScale;
      // Treat gaps > 15s with < 1m progress as stopped time
      const activeDt = dt > 15 && dd < 1 ? 0 : dt;
      cumMovingSec[i] = cumMovingSec[i - 1] + activeDt;
    }
    const rawTotalMoving = cumMovingSec[cumMovingSec.length - 1] || 1;
    const timeScale = rawTotalMoving > 0 ? totalMovingSec / rawTotalMoving : 1;

    const boundaries: Array<{ startDist: number; endDist: number }> = [];
    if (totalDistM <= safeSplitM) {
      boundaries.push({ startDist: 0, endDist: totalDistM });
    } else {
      let d = 0;
      while (d + safeSplitM <= totalDistM + 0.01) {
        boundaries.push({ startDist: d, endDist: d + safeSplitM });
        d += safeSplitM;
      }
      const rem = totalDistM - d;
      if (rem >= minRemainderM) {
        boundaries.push({ startDist: d, endDist: totalDistM });
      }
    }

    const interpolateTimeAtDist = (targetDistM: number): { timeSec: number; index: number } => {
      const unscaledTarget = distScale > 0 ? targetDistM / distScale : targetDistM;
      if (unscaledTarget <= (distStream[0] || 0)) {
        return { timeSec: 0, index: 0 };
      }
      const lastIdx = distStream.length - 1;
      if (unscaledTarget >= (distStream[lastIdx] || 0)) {
        return { timeSec: cumMovingSec[lastIdx] * timeScale, index: lastIdx };
      }
      let lo = 0;
      let hi = lastIdx;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((distStream[mid] || 0) < unscaledTarget) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
      }
      const prevIdx = Math.max(0, lo - 1);
      const d0 = distStream[prevIdx] || 0;
      const d1 = distStream[lo] || d0;
      const frac = d1 > d0 ? Math.max(0, Math.min(1, (unscaledTarget - d0) / (d1 - d0))) : 0;
      const t0 = cumMovingSec[prevIdx] * timeScale;
      const t1 = cumMovingSec[lo] * timeScale;
      return { timeSec: t0 + (t1 - t0) * frac, index: lo };
    };

    const { category } = classifyActivity(activity);

    return boundaries.map((b, idx) => {
      const startPt = interpolateTimeAtDist(b.startDist);
      const endPt = interpolateTimeAtDist(b.endDist);
      const iStart = Math.max(0, Math.min(distStream.length - 1, startPt.index));
      const iEnd = Math.max(iStart, Math.min(distStream.length - 1, endPt.index));

      const chunkDistM = Math.max(1, b.endDist - b.startDist);
      const chunkTimeSec = Math.max(1, endPt.timeSec - startPt.timeSec);

      let avgHr: number | undefined;
      let maxHr: number | undefined;
      if (hrStream && hrStream.length > iStart) {
        const slice = hrStream
          .slice(iStart, iEnd + 1)
          .map(Number)
          .filter((v) => Number.isFinite(v) && v > 35);
        if (slice.length > 0) {
          avgHr = Math.round(slice.reduce((a, c) => a + c, 0) / slice.length);
          maxHr = Math.round(Math.max(...slice));
        }
      }
      if (!avgHr && activity.average_heartrate && activity.average_heartrate > 35) {
        avgHr = Math.round(activity.average_heartrate);
      }

      let avgWatts: number | undefined;
      if (wattsStream && wattsStream.length > iStart) {
        const slice = wattsStream
          .slice(iStart, iEnd + 1)
          .map(Number)
          .filter((v) => Number.isFinite(v) && v >= 0);
        if (slice.length > 0) {
          avgWatts = Math.round(slice.reduce((a, c) => a + c, 0) / slice.length);
        }
      }
      if (avgWatts === undefined && (details?.calibration?.calibratedAvgWatts || activity.average_watts)) {
        avgWatts = Math.round((details?.calibration?.calibratedAvgWatts ?? activity.average_watts) || 0);
      }

      let avgCadence: number | undefined;
      if (cadStream && cadStream.length > iStart) {
        const slice = cadStream
          .slice(iStart, iEnd + 1)
          .map(Number)
          .filter((v) => Number.isFinite(v) && v > 0);
        if (slice.length > 0) {
          const rawCad = slice.reduce((a, c) => a + c, 0) / slice.length;
          avgCadence = category === 'Run' && rawCad < 110 ? Math.round(rawCad * 2) : Math.round(rawCad);
        }
      }
      const actRawCad = (details?.activity?.average_cadence as number) || activity.average_cadence;
      if (!avgCadence && actRawCad && actRawCad > 0) {
        avgCadence = category === 'Run' && actRawCad < 110 ? Math.round(actRawCad * 2) : Math.round(actRawCad);
      }

      let elevationDiffM: number | undefined;
      let elevationGainM: number | undefined;
      if (altStream && altStream.length > iEnd) {
        const aStart = Number(altStream[iStart]);
        const aEnd = Number(altStream[iEnd]);
        if (Number.isFinite(aStart) && Number.isFinite(aEnd)) {
          elevationDiffM = Math.round(aEnd - aStart);
        }
        let gain = 0;
        for (let k = iStart + 1; k <= iEnd; k++) {
          const da = (Number(altStream[k]) || 0) - (Number(altStream[k - 1]) || 0);
          if (da > 0) gain += da;
        }
        elevationGainM = Math.round(gain);
      }

      return formatChunkMetrics(idx + 1, chunkDistM, chunkTimeSec, {
        avgHr,
        maxHr,
        avgWatts,
        avgCadence,
        elevationDiffM,
        elevationGainM,
      });
    });
  }

  // 2. If streams are not present, check Strava's 1km splits_metric
  const rawSplitsMetric =
    Array.isArray((details?.activity as any)?.splits_metric) &&
    ((details!.activity as any).splits_metric as any[]).length > 0
      ? ((details!.activity as any).splits_metric as any[])
      : Array.isArray(activity.splits_metric)
        ? activity.splits_metric
        : [];

  const rawSplitsDistSum = rawSplitsMetric.reduce((acc: number, s: any) => acc + (Number(s?.distance) || 0), 0);
  const rawSplitsTimeSum = rawSplitsMetric.reduce(
    (acc: number, s: any) => acc + (Number(s?.moving_time || s?.elapsed_time) || 0),
    0
  );
  const rawSplitsMatchTotals =
    rawSplitsMetric.length > 1 &&
    Math.abs(rawSplitsDistSum - totalDistM) <= 25 &&
    Math.abs(rawSplitsTimeSum - totalMovingSec) <= 10;

  if (rawSplitsMatchTotals) {
    const { category } = classifyActivity(activity);
    const actRawCad = (details?.activity?.average_cadence as number) || activity.average_cadence;
    const defaultActCad =
      actRawCad && actRawCad > 0
        ? category === 'Run' && actRawCad < 110
          ? Math.round(actRawCad * 2)
          : Math.round(actRawCad)
        : undefined;

    if (safeSplitM === 1000) {
      return rawSplitsMetric.map((s: any, idx: number) => {
        const sDist = Number(s.distance) || 1000;
        const sTime = Number(s.moving_time || s.elapsed_time) || Math.round((sDist / totalDistM) * totalMovingSec);
        const elevDiff = s.elevation_difference !== undefined ? Math.round(Number(s.elevation_difference)) : undefined;
        const rawSplitCad = Number(s.average_cadence) || 0;
        const splitCad =
          rawSplitCad > 0
            ? category === 'Run' && rawSplitCad < 110
              ? Math.round(rawSplitCad * 2)
              : Math.round(rawSplitCad)
            : defaultActCad;
        return formatChunkMetrics(s.split || idx + 1, sDist, sTime, {
          avgHr: s.average_heartrate ? Math.round(Number(s.average_heartrate)) : undefined,
          avgWatts: s.average_watts ? Math.round(Number(s.average_watts)) : undefined,
          avgCadence: splitCad,
          elevationDiffM: elevDiff,
          elevationGainM: elevDiff !== undefined && elevDiff > 0 ? elevDiff : undefined,
        });
      });
    }

    if (safeSplitM === 2000) {
      // Group consecutive 1km splits into 2km splits
      const grouped: AutoCreatedSplitChunk[] = [];
      let splitIdx = 1;
      for (let i = 0; i < rawSplitsMetric.length; i += 2) {
        const s1 = rawSplitsMetric[i];
        const s2 = rawSplitsMetric[i + 1];
        const d1 = Number(s1?.distance) || 0;
        const d2 = s2 ? Number(s2.distance) || 0 : 0;
        const combDist = d1 + d2;
        if (!s2 && grouped.length > 0 && combDist < minRemainderM) {
          break;
        }
        const t1 = Number(s1?.moving_time || s1?.elapsed_time) || 0;
        const t2 = s2 ? Number(s2.moving_time || s2.elapsed_time) || 0 : 0;
        const combTime = Math.max(1, t1 + t2);

        const hr1 = Number(s1?.average_heartrate) || 0;
        const hr2 = s2 ? Number(s2.average_heartrate) || 0 : 0;
        const avgHr =
          hr1 > 0 && hr2 > 0
            ? Math.round((hr1 * t1 + hr2 * t2) / Math.max(1, t1 + t2))
            : hr1 > 0
              ? Math.round(hr1)
              : hr2 > 0
                ? Math.round(hr2)
                : activity.average_heartrate
                  ? Math.round(activity.average_heartrate)
                  : undefined;

        const w1 = Number(s1?.average_watts) || 0;
        const w2 = s2 ? Number(s2.average_watts) || 0 : 0;
        const avgWatts =
          w1 > 0 && w2 > 0
            ? Math.round((w1 * t1 + w2 * t2) / Math.max(1, t1 + t2))
            : w1 > 0
              ? Math.round(w1)
              : w2 > 0
                ? Math.round(w2)
                : details?.calibration?.calibratedAvgWatts ?? activity.average_watts
                  ? Math.round((details?.calibration?.calibratedAvgWatts ?? activity.average_watts) || 0)
                  : undefined;

        const c1 = Number(s1?.average_cadence) || 0;
        const c2 = s2 ? Number(s2.average_cadence) || 0 : 0;
        const avgCad =
          c1 > 0 && c2 > 0
            ? Math.round((c1 * t1 + c2 * t2) / Math.max(1, t1 + t2))
            : c1 > 0
              ? Math.round(c1)
              : c2 > 0
                ? Math.round(c2)
                : defaultActCad;

        const e1 = Number(s1?.elevation_difference) || 0;
        const e2 = s2 ? Number(s2.elevation_difference) || 0 : 0;
        const elevDiff = Math.round(e1 + e2);
        const elevGain = Math.round(Math.max(0, e1) + Math.max(0, e2));

        grouped.push(
          formatChunkMetrics(splitIdx++, combDist, combTime, {
            avgHr,
            avgWatts,
            avgCadence: avgCad,
            elevationDiffM: elevDiff,
            elevationGainM: elevGain > 0 ? elevGain : undefined,
          })
        );
      }
      if (grouped.length > 0) return grouped;
    }
  }

  // 3. Fallback: Subdivide total distance and moving time into splitDistanceM chunks
  const { category } = classifyActivity(activity);
  const rawCad = (details?.activity?.average_cadence as number) || activity.average_cadence;
  const fallbackCad =
    rawCad && rawCad > 0
      ? category === 'Run' && rawCad < 110
        ? Math.round(rawCad * 2)
        : Math.round(rawCad)
      : undefined;
  const fallbackHr = activity.average_heartrate ? Math.round(activity.average_heartrate) : undefined;
  const fallbackWatts =
    details?.calibration?.calibratedAvgWatts ?? activity.average_watts
      ? Math.round((details?.calibration?.calibratedAvgWatts ?? activity.average_watts) || 0)
      : undefined;

  const chunks: AutoCreatedSplitChunk[] = [];
  if (totalDistM <= safeSplitM) {
    chunks.push(
      formatChunkMetrics(1, totalDistM, totalMovingSec, {
        avgHr: fallbackHr,
        avgWatts: fallbackWatts,
        avgCadence: fallbackCad,
      })
    );
    return chunks;
  }

  const fullCount = Math.floor(totalDistM / safeSplitM);
  const remainderM = totalDistM - fullCount * safeSplitM;
  const secPerMeter = totalMovingSec / totalDistM;

  for (let k = 1; k <= fullCount; k++) {
    chunks.push(
      formatChunkMetrics(k, safeSplitM, safeSplitM * secPerMeter, {
        avgHr: fallbackHr,
        avgWatts: fallbackWatts,
        avgCadence: fallbackCad,
      })
    );
  }

  if (remainderM >= minRemainderM) {
    chunks.push(
      formatChunkMetrics(fullCount + 1, remainderM, remainderM * secPerMeter, {
        avgHr: fallbackHr,
        avgWatts: fallbackWatts,
        avgCadence: fallbackCad,
      })
    );
  }

  return chunks;
}

export function calculateNormalizedPower(
  activity: StravaActivity,
  details?: StravaActivityDetailsRecord
): number | null {
  const { subType } = classifyActivity(activity);
  if (subType !== 'Turbo Trainer' && subType !== 'Bike') return null;

  // 1. Check calibration override
  if (typeof details?.calibration?.calibratedNormalizedPower === 'number' && details.calibration.calibratedNormalizedPower > 0) {
    return Math.round(details.calibration.calibratedNormalizedPower);
  }

  // 2. Check Strava native weighted average watts
  const stravaWeightedWatts = (details?.activity?.weighted_average_watts as number) || (activity as any).weighted_average_watts;
  if (typeof stravaWeightedWatts === 'number' && stravaWeightedWatts > 0) {
    return Math.round(stravaWeightedWatts);
  }

  // 3. Compute 30s rolling 4th-power algorithm if watts stream is available
  const streams = details?.streams as Record<string, { data?: any[] }> | undefined;
  if (streams?.watts?.data && streams.watts.data.length >= 30) {
    const rawWatts = streams.watts.data.map((w: any) =>
      typeof w === 'number' && w > 0 ? w : 0
    );
    const rolling30: number[] = [];
    let windowSum = 0;
    for (let i = 0; i < rawWatts.length; i++) {
      windowSum += rawWatts[i];
      if (i >= 30) {
        windowSum -= rawWatts[i - 30];
        rolling30.push(windowSum / 30);
      }
    }
    if (rolling30.length > 0) {
      const sum4th = rolling30.reduce((acc, val) => acc + Math.pow(val, 4), 0);
      const np = Math.pow(sum4th / rolling30.length, 0.25);
      if (np > 0) return Math.round(np);
    }
  }

  // 4. Fallback based on calibrated or raw average watts
  const avgWatts = details?.calibration?.calibratedAvgWatts || activity.average_watts;
  if (typeof avgWatts === 'number' && avgWatts > 0) {
    return Math.round(avgWatts * 1.05);
  }

  return null;
}

/**
 * Calculates Swim pace per 100m, stroke rate (spm), total strokes, and SWOLF using moving laps if available,
 * falling back to 100m auto-created splits when an activity has 0 or 1 lap.
 * Fully supports user-calibrated laps and ignored laps from inaccurate watches.
 */
export function getSwimPaceDetails(
  activity: StravaActivity,
  details?: StravaActivityDetailsRecord
): SwimPaceDetails | null {
  const { category } = classifyActivity(activity);
  if (category !== 'Swim') return null;

  const rawLaps =
    Array.isArray(details?.activity?.laps) && (details!.activity!.laps as any[]).length > 0
      ? (details!.activity!.laps as any[])
      : Array.isArray(activity.laps)
        ? activity.laps
        : [];
  const origSlices = extractOriginalLapStreamSlices(
    rawLaps,
    details?.streams as Record<string, { data?: any[] }> | undefined,
    activity.average_cadence
  );

  // 1. If user calibrated laps exist, prioritize them!
  const calibratedLaps = details?.calibration?.calibratedLaps;
  if (calibratedLaps && calibratedLaps.length > 0) {
    const enrichedCalibratedLaps = calibratedLaps.map((lap, idx) => {
      const isRest = Boolean(lap.isRest || lap.distanceM <= 0);
      const origIdx = (lap.originalLapIndex ?? idx + 1) - 1;
      const origSlice = origSlices[origIdx];
      const strokeRateSpm = isRest
        ? 0
        : lap.strokeRateSpm ?? origSlice?.avgCadence ?? (activity.average_cadence ? Math.round(activity.average_cadence) : undefined);
      const totalStrokes = isRest
        ? 0
        : lap.totalStrokes ??
          (strokeRateSpm && strokeRateSpm > 0 && lap.movingTimeSec > 0
            ? Math.round((strokeRateSpm * lap.movingTimeSec) / 60)
            : undefined);
      const avgHr = lap.avgHr ?? origSlice?.avgHr;
      const maxHr = lap.maxHr ?? origSlice?.maxHr;
      const numLengths = !isRest && lap.distanceM > 0 ? Math.max(1, lap.distanceM / 25) : 0;
      const swolf =
        !isRest && numLengths > 0 && totalStrokes && totalStrokes > 0
          ? Math.round(lap.movingTimeSec / numLengths + totalStrokes / numLengths)
          : undefined;

      return {
        lapIndex: lap.lapIndex,
        originalLapIndex: lap.originalLapIndex ?? idx + 1,
        distanceM: lap.distanceM,
        movingTimeSec: lap.movingTimeSec,
        pacePer100mFormatted: isRest ? '' : lap.pacePer100mFormatted,
        strokeRateSpm,
        totalStrokes,
        avgHr,
        maxHr,
        swolf,
        isIgnored: Boolean(lap.isIgnored),
        isRest,
      };
    });

    const activeLaps = enrichedCalibratedLaps.filter(
      (l) => !l.isIgnored && !l.isRest && l.distanceM > 0
    );
    const sumLapTime = activeLaps.reduce((acc, l) => acc + (l.movingTimeSec || 0), 0);
    const sumLapDist = activeLaps.reduce((acc, l) => acc + (l.distanceM || 0), 0);

    const totalDist = sumLapDist > 0 ? sumLapDist : (details?.calibration?.calibratedDistanceM ?? activity.distance ?? 0);
    const totalMovingTime = sumLapTime > 0 ? sumLapTime : (details?.calibration?.calibratedMovingTimeSec ?? activity.moving_time ?? 0);

    if (totalDist <= 0 || totalMovingTime <= 0) return null;

    const secPer100m = (totalMovingTime / totalDist) * 100;
    const mins = Math.floor(secPer100m / 60);
    const secs = Math.round(secPer100m % 60);
    const paceFormatted = `${mins}:${secs.toString().padStart(2, '0')}/100m`;

    const lapsWithCad = activeLaps.filter((l) => l.strokeRateSpm && l.strokeRateSpm > 0);
    const weightedCadSum = lapsWithCad.reduce((acc, l) => acc + (l.strokeRateSpm || 0) * l.movingTimeSec, 0);
    const weightedCadTime = lapsWithCad.reduce((acc, l) => acc + l.movingTimeSec, 0);
    const avgStrokeRateSpm =
      weightedCadTime > 0
        ? Math.round(weightedCadSum / weightedCadTime)
        : activity.average_cadence
          ? Math.round(activity.average_cadence)
          : undefined;

    const sumStrokes = activeLaps.reduce((acc, l) => acc + (l.totalStrokes || 0), 0);
    const swolfLaps = activeLaps.filter((l) => l.swolf && l.swolf > 0);
    const avgSwolf =
      swolfLaps.length > 0
        ? Math.round(swolfLaps.reduce((acc, l) => acc + (l.swolf || 0), 0) / swolfLaps.length)
        : undefined;

    return {
      pacePer100mFormatted: paceFormatted,
      paceSecondsPer100m: secPer100m,
      totalDistanceM: Math.round(totalDist),
      movingTimeSec: Math.round(totalMovingTime),
      avgStrokeRateSpm,
      totalStrokes: sumStrokes > 0 ? sumStrokes : undefined,
      avgSwolf,
      isAutoCreatedSplits: false,
      laps: enrichedCalibratedLaps,
    };
  }

  // 2. If native multi-lap swim data exists (more than 1 lap), use native Strava laps
  if (rawLaps.length > 1) {
    const processedLaps = rawLaps.map((lap, idx) => {
      const dist = Math.round(lap.distance || 0);
      const time = Math.round(lap.moving_time || lap.elapsed_time || 0);
      const isRest = dist <= 0;
      let paceFormatted = '';
      if (!isRest && dist > 0 && time > 0) {
        const lapSecPer100m = (time / dist) * 100;
        const lMins = Math.floor(lapSecPer100m / 60);
        const lSecs = Math.round(lapSecPer100m % 60);
        paceFormatted = `${lMins}:${lSecs.toString().padStart(2, '0')}/100m`;
      }

      const slice = origSlices[idx];
      const strokeRateSpm = isRest ? 0 : slice?.avgCadence;
      const totalStrokes = isRest
        ? 0
        : slice?.totalCycles ??
          (strokeRateSpm && strokeRateSpm > 0 && time > 0
            ? Math.round((strokeRateSpm * time) / 60)
            : undefined);
      const numLengths = !isRest && dist > 0 ? Math.max(1, dist / 25) : 0;
      const swolf =
        !isRest && numLengths > 0 && totalStrokes && totalStrokes > 0
          ? Math.round(time / numLengths + totalStrokes / numLengths)
          : undefined;

      return {
        lapIndex: idx + 1,
        originalLapIndex: idx + 1,
        distanceM: dist,
        movingTimeSec: time,
        pacePer100mFormatted: paceFormatted,
        strokeRateSpm,
        totalStrokes,
        avgHr: slice?.avgHr,
        maxHr: slice?.maxHr,
        swolf,
        isIgnored: false,
        isRest,
      };
    });

    // Only count active swimming laps (> 0m distance) towards moving time and overall pace
    const activeLaps = processedLaps.filter((l) => !l.isRest && l.distanceM > 0);
    const sumLapTime = activeLaps.reduce((acc, l) => acc + l.movingTimeSec, 0);
    const sumLapDist = activeLaps.reduce((acc, l) => acc + l.distanceM, 0);

    const totalDist = details?.calibration?.calibratedDistanceM ?? (sumLapDist > 0 ? sumLapDist : activity.distance ?? 0);
    const totalMovingTime = details?.calibration?.calibratedMovingTimeSec ?? (sumLapTime > 0 ? sumLapTime : activity.moving_time ?? 0);

    if (totalDist > 0 && totalMovingTime > 0) {
      const secPer100m = (totalMovingTime / totalDist) * 100;
      const mins = Math.floor(secPer100m / 60);
      const secs = Math.round(secPer100m % 60);
      const paceFormatted = `${mins}:${secs.toString().padStart(2, '0')}/100m`;

      const lapsWithCad = activeLaps.filter((l) => l.strokeRateSpm && l.strokeRateSpm > 0);
      const weightedCadSum = lapsWithCad.reduce((acc, l) => acc + (l.strokeRateSpm || 0) * l.movingTimeSec, 0);
      const weightedCadTime = lapsWithCad.reduce((acc, l) => acc + l.movingTimeSec, 0);
      const avgStrokeRateSpm =
        weightedCadTime > 0
          ? Math.round(weightedCadSum / weightedCadTime)
          : activity.average_cadence
            ? Math.round(activity.average_cadence)
            : undefined;

      const sumStrokes = activeLaps.reduce((acc, l) => acc + (l.totalStrokes || 0), 0);
      const swolfLaps = activeLaps.filter((l) => l.swolf && l.swolf > 0);
      const avgSwolf =
        swolfLaps.length > 0
          ? Math.round(swolfLaps.reduce((acc, l) => acc + (l.swolf || 0), 0) / swolfLaps.length)
          : undefined;

      return {
        pacePer100mFormatted: paceFormatted,
        paceSecondsPer100m: secPer100m,
        totalDistanceM: Math.round(totalDist),
        movingTimeSec: Math.round(totalMovingTime),
        avgStrokeRateSpm,
        totalStrokes: sumStrokes > 0 ? sumStrokes : undefined,
        avgSwolf,
        isAutoCreatedSplits: false,
        laps: processedLaps,
      };
    }
  }

  // 3. Swim has 0 laps or 1 lap from start to finish -> Auto-create 100m splits!
  const fallbackDist = details?.calibration?.calibratedDistanceM ?? activity.distance ?? 0;
  const fallbackTime = details?.calibration?.calibratedMovingTimeSec ?? activity.moving_time ?? activity.elapsed_time ?? 0;
  if (fallbackDist <= 0 || fallbackTime <= 0) return null;

  const autoChunks = generateAutoSplitsFromStreamsOrActivity(activity, details, 100);
  const autoSwimLaps = autoChunks.map((chunk) => {
    const strokeRateSpm = chunk.avgCadence;
    const totalStrokes =
      strokeRateSpm && strokeRateSpm > 0 && chunk.movingTimeSec > 0
        ? Math.round((strokeRateSpm * chunk.movingTimeSec) / 60)
        : undefined;
    const numLengths = chunk.distanceM > 0 ? Math.max(1, chunk.distanceM / 25) : 0;
    const swolf =
      numLengths > 0 && totalStrokes && totalStrokes > 0
        ? Math.round(chunk.movingTimeSec / numLengths + totalStrokes / numLengths)
        : undefined;

    return {
      lapIndex: chunk.splitIndex,
      originalLapIndex: 1,
      distanceM: chunk.distanceM,
      movingTimeSec: chunk.movingTimeSec,
      pacePer100mFormatted: chunk.swimPaceFormatted,
      strokeRateSpm,
      totalStrokes,
      avgHr: chunk.avgHr,
      maxHr: chunk.maxHr,
      swolf,
      isIgnored: false,
      isRest: false,
    };
  });

  const secPer100m = (fallbackTime / fallbackDist) * 100;
  const mins = Math.floor(secPer100m / 60);
  const secs = Math.round(secPer100m % 60);
  const autoLapsWithCad = autoSwimLaps.filter((l) => l.strokeRateSpm && l.strokeRateSpm > 0);
  const fallbackCad = activity.average_cadence
    ? Math.round(activity.average_cadence)
    : (details?.activity?.average_cadence as number)
      ? Math.round(details!.activity!.average_cadence as number)
      : autoLapsWithCad.length > 0
        ? Math.round(autoLapsWithCad.reduce((acc, l) => acc + (l.strokeRateSpm || 0), 0) / autoLapsWithCad.length)
        : undefined;
  const sumAutoStrokes = autoSwimLaps.reduce((acc, l) => acc + (l.totalStrokes || 0), 0);
  const swolfAutoLaps = autoSwimLaps.filter((l) => l.swolf && l.swolf > 0);
  const avgAutoSwolf =
    swolfAutoLaps.length > 0
      ? Math.round(swolfAutoLaps.reduce((acc, l) => acc + (l.swolf || 0), 0) / swolfAutoLaps.length)
      : undefined;

  return {
    pacePer100mFormatted: `${mins}:${secs.toString().padStart(2, '0')}/100m`,
    paceSecondsPer100m: secPer100m,
    totalDistanceM: Math.round(fallbackDist),
    movingTimeSec: Math.round(fallbackTime),
    avgStrokeRateSpm: fallbackCad,
    totalStrokes: sumAutoStrokes > 0 ? sumAutoStrokes : undefined,
    avgSwolf: avgAutoSwolf,
    isAutoCreatedSplits: true,
    laps: autoSwimLaps.length > 0 ? autoSwimLaps : undefined,
  };
}

/**
 * Calculates the longest lap distance in meters for an activity.
 * Inspects user-calibrated laps, detailed Strava laps, and splits.
 * If no lap breakdown exists, defaults to the total activity distance (as a single unbroken effort).
 */
export function getLongestLapDistanceM(
  activity: StravaActivity,
  details?: StravaActivityDetailsRecord
): number {
  if (!activity) return 0;

  // 1. User calibrated laps if available
  const calibratedLaps = details?.calibration?.calibratedLaps;
  if (Array.isArray(calibratedLaps) && calibratedLaps.length > 0) {
    const validCalib = calibratedLaps
      .filter((l) => !l.isIgnored && !l.isRest && typeof l.distanceM === 'number' && l.distanceM > 0)
      .map((l) => l.distanceM);
    if (validCalib.length > 0) {
      return Math.round(Math.max(...validCalib));
    }
  }

  // 2. Strava detailed laps from record activity, summary activity, or splits
  const rawLaps =
    (details?.activity?.laps as any[]) ||
    (activity as any).laps ||
    ((details?.activity as any)?.splits_metric as any[]) ||
    (activity as any).splits_metric;

  if (Array.isArray(rawLaps) && rawLaps.length > 0) {
    const validDists = rawLaps
      .map((l) => (typeof l?.distance === 'number' ? l.distance : Number(l?.distance || 0)))
      .filter((d) => !isNaN(d) && d > 0);
    if (validDists.length > 0) {
      return Math.round(Math.max(...validDists));
    }
  }

  // 3. Fallback: If no explicit laps are recorded, the entire activity is 1 single lap
  const totalDist =
    details?.calibration?.calibratedDistanceM ??
    activity.distance ??
    ((details?.activity as any)?.distance as number) ??
    0;

  return totalDist > 0 ? Math.round(totalDist) : 0;
}

export interface RunSplitItem {
  splitIndex: number;
  distanceKm: string;
  movingTimeSec: number;
  paceFormatted: string;
  paceSecPerKm?: number;
  gapSecPerKm?: number;
  gapFormatted?: string;
  avgHr?: number;
  avgCadence?: number;
  elevationDiffM?: number;
  isFasterThanAvg?: boolean;
}

export interface ZoneDistributionItem {
  zone: number;
  name: string;
  pct: number;
  seconds: number;
  color: string;
}

export interface RunActivityDetails {
  splits: RunSplitItem[];
  isAutoCreatedSplits?: boolean;
  avgPaceFormatted: string;
  avgCadence?: number;
  maxHr?: number;
  avgHr?: number;
  totalElevationGainM?: number;
  totalElevationLossM?: number;
  gradeAdjustedPaceFormatted?: string;
  consistencySummary?: string;
  hrZones: ZoneDistributionItem[];
}

export interface BikeLapItem {
  lapIndex: number;
  name: string;
  distanceKm: string;
  movingTimeSec: number;
  avgSpeedKph: string;
  avgWatts?: number;
  avgHr?: number;
  avgCadence?: number;
  elevationGainM?: number;
}

export interface BikeActivityDetails {
  laps: BikeLapItem[];
  isAutoCreatedSplits?: boolean;
  avgSpeedKph: string;
  maxSpeedKph?: string;
  avgWatts?: number;
  normalizedPower?: number;
  intensityFactor?: number;
  variabilityIndex?: number;
  workKj?: number;
  avgCadence?: number;
  maxCadence?: number;
  avgHr?: number;
  maxHr?: number;
  totalElevationGainM?: number;
  powerZones: ZoneDistributionItem[];
  hrZones: ZoneDistributionItem[];
}

export function computeSplitGapSec(paceSecPerKm: number, distanceM: number, elevationDiffM?: number): number {
  if (!elevationDiffM || elevationDiffM === 0 || distanceM <= 0) return Math.round(paceSecPerKm);
  const grade = elevationDiffM / distanceM;
  const clampedGrade = Math.max(-0.30, Math.min(0.30, grade));
  let costRatio = 1;
  if (clampedGrade >= 0) {
    // Uphill: costs more energy, flat equivalent pace is faster (lower seconds)
    costRatio = 1 + 3.3 * clampedGrade + 4.0 * Math.pow(clampedGrade, 2);
  } else {
    // Downhill: runs faster, flat equivalent pace is slower (higher seconds)
    const absG = Math.abs(clampedGrade);
    costRatio = Math.max(0.75, 1 - 1.8 * absG + 3.5 * Math.pow(clampedGrade, 2));
  }
  return Math.max(90, Math.round(paceSecPerKm / costRatio));
}

export function formatPaceFromSeconds(secPerKm: number): string {
  if (!secPerKm || secPerKm <= 0 || !Number.isFinite(secPerKm)) return '--:--/km';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}/km`;
}

export function getRunActivityDetails(
  activity: StravaActivity,
  details?: StravaActivityDetailsRecord,
  athleteProfile?: AthleteProfile
): RunActivityDetails | null {
  const { category } = classifyActivity(activity);
  if (category !== 'Run') return null;

  const distanceM = details?.calibration?.calibratedDistanceM ?? activity.distance ?? 0;
  const movingTimeSec = details?.calibration?.calibratedMovingTimeSec ?? activity.moving_time ?? 0;
  if (distanceM <= 0 || movingTimeSec <= 0) return null;

  const secPerKm = movingTimeSec / (distanceM / 1000);
  const avgMins = Math.floor(secPerKm / 60);
  const avgSecs = Math.round(secPerKm % 60);
  const avgPaceFormatted = `${avgMins}:${avgSecs.toString().padStart(2, '0')}/km`;

  const streams = details?.streams as Record<string, { data?: any[] }> | undefined;
  const cadStream = Array.isArray(streams?.cadence?.data) ? (streams!.cadence!.data as number[]) : undefined;
  const distStream = Array.isArray(streams?.distance?.data) ? (streams!.distance!.data as number[]) : undefined;

  let avgCadence = (details?.activity?.average_cadence as number) || activity.average_cadence;
  if (!avgCadence && cadStream && cadStream.length > 0) {
    const validCad = cadStream.map(Number).filter((v) => Number.isFinite(v) && v > 0);
    if (validCad.length > 0) {
      avgCadence = validCad.reduce((a, b) => a + b, 0) / validCad.length;
    }
  }
  if (avgCadence && avgCadence < 110) {
    avgCadence = Math.round(avgCadence * 2);
  } else if (avgCadence) {
    avgCadence = Math.round(avgCadence);
  }

  const { subType } = classifyActivity(activity);
  const isTreadmill =
    subType === 'Treadmill Run' ||
    Boolean(activity.trainer) ||
    /treadmill|indoor run/i.test(activity.name || '') ||
    Boolean(details?.calibration?.calibratedRunSections?.length);

  let isAutoCreatedSplits = hasSingleOrNoLaps(activity, details);
  const rawSplits = (details?.activity?.splits_metric as any[]) || activity.splits_metric || [];
  const rawSplitsDistSum = rawSplits.reduce((acc: number, s: any) => acc + (Number(s?.distance) || 0), 0);
  const rawSplitsTimeSum = rawSplits.reduce(
    (acc: number, s: any) => acc + (Number(s?.moving_time || s?.elapsed_time) || 0),
    0
  );
  const hasCalibratedDistOrTimeMismatch =
    Boolean(details?.calibration?.calibratedDistanceM || details?.calibration?.calibratedMovingTimeSec) &&
    (Math.abs(rawSplitsDistSum - distanceM) > 20 || Math.abs(rawSplitsTimeSum - movingTimeSec) > 10);

  const splits: RunSplitItem[] = [];

  if (rawSplits.length > 1 && !hasCalibratedDistOrTimeMismatch) {
    let cumDistM = 0;
    for (let i = 0; i < rawSplits.length; i++) {
      const s = rawSplits[i];
      const sDist = s.distance || 1000;
      const startDistM = cumDistM;
      const endDistM = cumDistM + sDist;
      cumDistM = endDistM;

      const sTime = s.moving_time || s.elapsed_time || 0;
      const sSecPerKm = sDist > 0 ? sTime / (sDist / 1000) : secPerKm;
      const sm = Math.floor(sSecPerKm / 60);
      const ss = Math.round(sSecPerKm % 60);
      const elevDiff = !isTreadmill && s.elevation_difference !== undefined ? Math.round(s.elevation_difference) : undefined;
      const sGapSec = !isTreadmill ? computeSplitGapSec(sSecPerKm, sDist, elevDiff) : undefined;
      const gm = sGapSec !== undefined ? Math.floor(sGapSec / 60) : 0;
      const gs = sGapSec !== undefined ? Math.round(sGapSec % 60) : 0;

      // Extract per-split cadence from cadence stream or split object or activity fallback
      let splitCadence: number | undefined;
      if (s.average_cadence && Number(s.average_cadence) > 0) {
        const rawC = Number(s.average_cadence);
        splitCadence = rawC < 110 ? Math.round(rawC * 2) : Math.round(rawC);
      } else if (cadStream && distStream && cadStream.length === distStream.length && distStream.length > 1) {
        const slice: number[] = [];
        for (let k = 0; k < distStream.length; k++) {
          const d = Number(distStream[k]) || 0;
          if (d >= startDistM && d <= endDistM) {
            const c = Number(cadStream[k]);
            if (Number.isFinite(c) && c > 0) slice.push(c);
          } else if (d > endDistM) {
            break;
          }
        }
        if (slice.length > 0) {
          const avgC = slice.reduce((a, b) => a + b, 0) / slice.length;
          splitCadence = avgC < 110 ? Math.round(avgC * 2) : Math.round(avgC);
        }
      }
      if (!splitCadence && avgCadence) {
        splitCadence = avgCadence;
      }

      splits.push({
        splitIndex: s.split || i + 1,
        distanceKm: (sDist / 1000).toFixed(2),
        movingTimeSec: sTime,
        paceFormatted: `${sm}:${ss.toString().padStart(2, '0')}/km`,
        paceSecPerKm: Math.round(sSecPerKm),
        gapSecPerKm: sGapSec,
        gapFormatted: sGapSec !== undefined ? `${gm}:${gs.toString().padStart(2, '0')}/km` : undefined,
        avgHr: s.average_heartrate ? Math.round(s.average_heartrate) : undefined,
        avgCadence: splitCadence,
        elevationDiffM: elevDiff,
        isFasterThanAvg: sSecPerKm < secPerKm,
      });
    }
  } else {
    // Auto-create 1km (1,000m) splits from streams or total distance/time
    isAutoCreatedSplits = true;
    const autoChunks = generateAutoSplitsFromStreamsOrActivity(activity, details, 1000);
    for (const chunk of autoChunks) {
      const elevDiff = !isTreadmill ? chunk.elevationDiffM : undefined;
      const sGapSec = !isTreadmill ? computeSplitGapSec(chunk.paceSecPerKm, chunk.distanceM, elevDiff) : undefined;
      const gm = sGapSec !== undefined ? Math.floor(sGapSec / 60) : 0;
      const gs = sGapSec !== undefined ? Math.round(sGapSec % 60) : 0;
      splits.push({
        splitIndex: chunk.splitIndex,
        distanceKm: (chunk.distanceM / 1000).toFixed(2),
        movingTimeSec: chunk.movingTimeSec,
        paceFormatted: chunk.paceFormatted,
        paceSecPerKm: Math.round(chunk.paceSecPerKm),
        gapSecPerKm: sGapSec,
        gapFormatted: sGapSec !== undefined ? `${gm}:${gs.toString().padStart(2, '0')}/km` : undefined,
        avgHr: chunk.avgHr,
        avgCadence: chunk.avgCadence ?? avgCadence,
        elevationDiffM: elevDiff,
        isFasterThanAvg: chunk.paceSecPerKm < secPerKm,
      });
    }
  }

  let consistencySummary = 'Even metronomic pacing';
  if (splits.length >= 2) {
    const half = Math.floor(splits.length / 2);
    const firstHalfPace = splits.slice(0, half).reduce((acc, s) => acc + s.movingTimeSec, 0) / half;
    const secondHalfPace = splits.slice(half).reduce((acc, s) => acc + s.movingTimeSec, 0) / (splits.length - half);
    const diffSec = Math.round(firstHalfPace - secondHalfPace);
    if (diffSec >= 3) {
      consistencySummary = `Negative Split (Finished ~${diffSec}s faster in 2nd half)`;
    } else if (diffSec <= -3) {
      consistencySummary = `Positive Split (Started ~${Math.abs(diffSec)}s faster in 1st half)`;
    } else {
      consistencySummary = 'Steady pacing within ±2s across splits';
    }
  }

  const hrMax = athleteProfile?.maxHeartRate || (athleteProfile?.restingHeartRate ? 190 : 185);
  const hrData = streams?.heartrate?.data as number[] | undefined;

  const hrZones: ZoneDistributionItem[] = [
    { zone: 1, name: 'Z1 Active Recovery (<68%)', pct: 0, seconds: 0, color: '#38bdf8' },
    { zone: 2, name: 'Z2 Aerobic Base (69-83%)', pct: 0, seconds: 0, color: '#34d399' },
    { zone: 3, name: 'Z3 Tempo (84-90%)', pct: 0, seconds: 0, color: '#fbbf24' },
    { zone: 4, name: 'Z4 Threshold (91-95%)', pct: 0, seconds: 0, color: '#fb923c' },
    { zone: 5, name: 'Z5 VO2 Max (>95%)', pct: 0, seconds: 0, color: '#f87171' },
  ];

  if (hrData && hrData.length > 0) {
    const counts = [0, 0, 0, 0, 0];
    for (const hr of hrData) {
      const pctMax = (hr / hrMax) * 100;
      if (pctMax < 69) counts[0]++;
      else if (pctMax < 84) counts[1]++;
      else if (pctMax < 91) counts[2]++;
      else if (pctMax <= 95) counts[3]++;
      else counts[4]++;
    }
    const totalSamples = hrData.length;
    hrZones.forEach((z, idx) => {
      z.pct = Math.round((counts[idx] / totalSamples) * 100);
      z.seconds = Math.round((counts[idx] / totalSamples) * movingTimeSec);
    });
  } else if (activity.average_heartrate) {
    const avgPct = (activity.average_heartrate / hrMax) * 100;
    if (avgPct < 75) {
      hrZones[0].pct = 20; hrZones[1].pct = 70; hrZones[2].pct = 10;
    } else if (avgPct < 85) {
      hrZones[1].pct = 25; hrZones[2].pct = 55; hrZones[3].pct = 20;
    } else if (avgPct < 92) {
      hrZones[1].pct = 10; hrZones[2].pct = 30; hrZones[3].pct = 45; hrZones[4].pct = 15;
    } else {
      hrZones[2].pct = 15; hrZones[3].pct = 35; hrZones[4].pct = 50;
    }
    hrZones.forEach((z) => {
      z.seconds = Math.round((z.pct / 100) * movingTimeSec);
    });
  }

  const elevGain = !isTreadmill && activity.total_elevation_gain ? Math.round(activity.total_elevation_gain) : 0;
  let gapFormatted: string | undefined;

  if (!isTreadmill) {
    const splitsWithElev = splits.filter((s) => s.gapSecPerKm !== undefined && s.elevationDiffM !== undefined && s.elevationDiffM !== 0);
    if (splitsWithElev.length > 0) {
      const totalDist = splits.reduce((acc, s) => acc + (parseFloat(s.distanceKm) || 1), 0);
      const weightedGapSec = splits.reduce((acc, s) => acc + (s.gapSecPerKm || secPerKm) * (parseFloat(s.distanceKm) || 1), 0) / Math.max(0.1, totalDist);
      const gm = Math.floor(weightedGapSec / 60);
      const gs = Math.round(weightedGapSec % 60);
      gapFormatted = `${gm}:${gs.toString().padStart(2, '0')}/km`;
    } else if (elevGain > 10 && distanceM > 0) {
      const grade = (elevGain / distanceM) * 100;
      const gapSec = Math.max(120, secPerKm * (1 - grade * 0.035));
      const gm = Math.floor(gapSec / 60);
      const gs = Math.round(gapSec % 60);
      gapFormatted = `${gm}:${gs.toString().padStart(2, '0')}/km`;
    }
  }

  return {
    splits,
    isAutoCreatedSplits,
    avgPaceFormatted,
    avgCadence: avgCadence || undefined,
    avgHr: activity.average_heartrate ? Math.round(activity.average_heartrate) : undefined,
    maxHr: activity.max_heartrate ? Math.round(activity.max_heartrate) : undefined,
    totalElevationGainM: elevGain || undefined,
    gradeAdjustedPaceFormatted: gapFormatted,
    consistencySummary,
    hrZones,
  };
}

export function getBikeActivityDetails(
  activity: StravaActivity,
  details?: StravaActivityDetailsRecord,
  athleteProfile?: AthleteProfile
): BikeActivityDetails | null {
  const { category, subType } = classifyActivity(activity);
  if (category !== 'Bike' && subType !== 'Turbo Trainer' && subType !== 'Bike') return null;

  const distanceM = details?.calibration?.calibratedDistanceM ?? activity.distance ?? 0;
  const movingTimeSec = details?.calibration?.calibratedMovingTimeSec ?? activity.moving_time ?? 0;
  if (movingTimeSec <= 0) return null;

  const avgSpeedKph = (distanceM > 0 && movingTimeSec > 0)
    ? ((distanceM / 1000) / (movingTimeSec / 3600)).toFixed(1)
    : (activity.average_speed ? (activity.average_speed * 3.6).toFixed(1) : '0.0');
  const maxSpeedKph = activity.max_speed ? (activity.max_speed * 3.6).toFixed(1) : undefined;

  const avgWatts = details?.calibration?.calibratedAvgWatts ?? activity.average_watts ?? undefined;
  const normalizedPower = calculateNormalizedPower(activity, details || undefined) ?? (avgWatts ? Math.round(avgWatts * 1.05) : undefined);

  const ftp = athleteProfile?.bikeFtp || 250;
  const intensityFactor = normalizedPower ? Number((normalizedPower / ftp).toFixed(2)) : undefined;
  const variabilityIndex = (normalizedPower && avgWatts && avgWatts > 0) ? Number((normalizedPower / avgWatts).toFixed(2)) : undefined;
  const workKj = (avgWatts && movingTimeSec > 0) ? Math.round((avgWatts * movingTimeSec) / 1000) : undefined;

  const streams = details?.streams as Record<string, { data?: any[] }> | undefined;
  const cadStream = Array.isArray(streams?.cadence?.data) ? (streams!.cadence!.data as number[]) : undefined;
  let avgCadence = (details?.activity?.average_cadence as number) || activity.average_cadence;
  if (!avgCadence && cadStream && cadStream.length > 0) {
    const validCad = cadStream.map(Number).filter((v) => Number.isFinite(v) && v > 0);
    if (validCad.length > 0) {
      avgCadence = Math.round(validCad.reduce((a, b) => a + b, 0) / validCad.length);
    }
  } else if (avgCadence) {
    avgCadence = Math.round(avgCadence);
  }
  const maxCadence = (details?.activity?.max_cadence as number) || (activity as any).max_cadence;

  const rawLaps =
    Array.isArray(details?.activity?.laps) && (details!.activity!.laps as any[]).length > 0
      ? (details!.activity!.laps as any[])
      : Array.isArray(activity.laps)
        ? activity.laps
        : [];
  const rawLapsDistSum = rawLaps.reduce((acc: number, l: any) => acc + (Number(l?.distance) || 0), 0);
  const rawLapsTimeSum = rawLaps.reduce(
    (acc: number, l: any) => acc + (Number(l?.moving_time || l?.elapsed_time) || 0),
    0
  );
  const hasCalibratedBikeMismatch =
    Boolean(details?.calibration?.calibratedDistanceM || details?.calibration?.calibratedMovingTimeSec) &&
    (Math.abs(rawLapsDistSum - distanceM) > 20 || Math.abs(rawLapsTimeSum - movingTimeSec) > 10);
  const areLapsAutoGeneratedSplits = rawLaps.some((l: any) => Boolean(l?.isAutoGeneratedSplit));

  const laps: BikeLapItem[] = [];
  let isAutoCreatedSplits = areLapsAutoGeneratedSplits;

  if (rawLaps.length > 1 && !hasCalibratedBikeMismatch) {
    for (let i = 0; i < rawLaps.length; i++) {
      const lap = rawLaps[i];
      const lDistM = lap.distance || 0;
      const lTimeS = lap.moving_time || lap.elapsed_time || 0;
      const lSpeedKph = lap.average_speed ? (lap.average_speed * 3.6).toFixed(1) : (lDistM > 0 && lTimeS > 0 ? ((lDistM / 1000) / (lTimeS / 3600)).toFixed(1) : '0.0');
      let lapCadence = lap.average_cadence ? Math.round(lap.average_cadence) : undefined;
      if (
        !lapCadence &&
        cadStream &&
        typeof lap.start_index === 'number' &&
        typeof lap.end_index === 'number' &&
        cadStream.length > lap.start_index
      ) {
        const slice = cadStream
          .slice(lap.start_index, lap.end_index + 1)
          .map(Number)
          .filter((c) => Number.isFinite(c) && c > 0);
        if (slice.length > 0) {
          lapCadence = Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
        }
      }
      if (!lapCadence && avgCadence) {
        lapCadence = avgCadence;
      }
      laps.push({
        lapIndex: lap.lap_index || i + 1,
        name: lap.name || `Lap ${i + 1}`,
        distanceKm: (lDistM / 1000).toFixed(2),
        movingTimeSec: lTimeS,
        avgSpeedKph: lSpeedKph,
        avgWatts: lap.average_watts ? Math.round(lap.average_watts) : undefined,
        avgHr: lap.average_heartrate ? Math.round(lap.average_heartrate) : undefined,
        avgCadence: lapCadence,
        elevationGainM: lap.total_elevation_gain !== undefined ? Math.round(lap.total_elevation_gain) : undefined,
      });
    }
  } else {
    // Activity has 0 laps or 1 lap from start to finish -> Auto-create 2km (2,000m) splits!
    isAutoCreatedSplits = true;
    const autoChunks = generateAutoSplitsFromStreamsOrActivity(activity, details, 2000);
    for (const chunk of autoChunks) {
      laps.push({
        lapIndex: chunk.splitIndex,
        name: `Split ${chunk.splitIndex}`,
        distanceKm: (chunk.distanceM / 1000).toFixed(2),
        movingTimeSec: chunk.movingTimeSec,
        avgSpeedKph: chunk.avgSpeedKph,
        avgWatts: chunk.avgWatts,
        avgHr: chunk.avgHr,
        avgCadence: chunk.avgCadence ?? avgCadence,
        elevationGainM: chunk.elevationGainM,
      });
    }
  }

  const prof = athleteProfile || DEFAULT_ATHLETE_PROFILE;
  const powerZonesConfig = getAthletePowerZones(prof);
  const hrZonesConfig = getAthleteHeartRateZones(prof, 'bike');

  const wattsData = streams?.watts?.data as number[] | undefined;
  const hrData = streams?.heartrate?.data as number[] | undefined;

  let powerZones: ZoneDistributionItem[] = powerZonesConfig.map((z) => ({
    zone: z.zone,
    name: `Z${z.zone} ${z.name} (${z.rangeFormatted})`,
    pct: 0,
    seconds: 0,
    color: z.color,
  }));

  if (wattsData && wattsData.length > 0) {
    const counts = new Array(powerZonesConfig.length).fill(0);
    let validCount = 0;
    for (const w of wattsData) {
      if (typeof w !== 'number' || w < 0 || w > 2000) continue;
      validCount++;
      let placed = false;
      for (let i = 0; i < powerZonesConfig.length; i++) {
        if (w <= powerZonesConfig[i].maxWatts) {
          counts[i]++;
          placed = true;
          break;
        }
      }
      if (!placed) {
        counts[powerZonesConfig.length - 1]++;
      }
    }
    if (validCount > 0) {
      powerZones = powerZonesConfig.map((z, idx) => ({
        zone: z.zone,
        name: `Z${z.zone} ${z.name} (${z.rangeFormatted})`,
        pct: Math.round((counts[idx] / validCount) * 100),
        seconds: Math.round((counts[idx] / validCount) * movingTimeSec),
        color: z.color,
      }));
    }
  } else if (avgWatts && avgWatts > 0) {
    let primaryZoneIdx = 0;
    for (let i = 0; i < powerZonesConfig.length; i++) {
      if (avgWatts <= powerZonesConfig[i].maxWatts) {
        primaryZoneIdx = i;
        break;
      }
      if (i === powerZonesConfig.length - 1) primaryZoneIdx = i;
    }
    powerZones = powerZonesConfig.map((z, idx) => {
      const isPrimary = idx === primaryZoneIdx;
      const pct = isPrimary ? 70 : idx === primaryZoneIdx - 1 ? 20 : idx === primaryZoneIdx + 1 ? 10 : 0;
      return {
        zone: z.zone,
        name: `Z${z.zone} ${z.name} (${z.rangeFormatted})`,
        pct,
        seconds: Math.round((pct / 100) * movingTimeSec),
        color: z.color,
      };
    });
  }

  let hrZones: ZoneDistributionItem[] = hrZonesConfig.map((z) => ({
    zone: z.zone,
    name: `Z${z.zone} ${z.name} (${z.minHr}-${z.maxHr} bpm)`,
    pct: 0,
    seconds: 0,
    color: z.color,
  }));

  const minAllowedHr = prof.restingHeartRate || 40;
  const maxAllowedHr = Math.round((prof.maxHeartRate || 185) * 1.05);

  if (hrData && hrData.length > 0) {
    const counts = new Array(hrZonesConfig.length).fill(0);
    let validCount = 0;
    for (const hr of hrData) {
      if (typeof hr !== 'number' || hr < minAllowedHr || hr > maxAllowedHr) continue;
      validCount++;
      let placed = false;
      for (let i = 0; i < hrZonesConfig.length; i++) {
        if (hr <= hrZonesConfig[i].maxHr) {
          counts[i]++;
          placed = true;
          break;
        }
      }
      if (!placed) {
        counts[hrZonesConfig.length - 1]++;
      }
    }
    if (validCount > 0) {
      hrZones = hrZonesConfig.map((z, idx) => ({
        zone: z.zone,
        name: `Z${z.zone} ${z.name} (${z.minHr}-${z.maxHr} bpm)`,
        pct: Math.round((counts[idx] / validCount) * 100),
        seconds: Math.round((counts[idx] / validCount) * movingTimeSec),
        color: z.color,
      }));
    }
  } else if (activity.average_heartrate && activity.average_heartrate > minAllowedHr) {
    const avgHr = Math.round(activity.average_heartrate);
    let primaryZoneIdx = 0;
    for (let i = 0; i < hrZonesConfig.length; i++) {
      if (avgHr <= hrZonesConfig[i].maxHr) {
        primaryZoneIdx = i;
        break;
      }
      if (i === hrZonesConfig.length - 1) primaryZoneIdx = i;
    }
    hrZones = hrZonesConfig.map((z, idx) => {
      const isPrimary = idx === primaryZoneIdx;
      const pct = isPrimary ? 70 : idx === primaryZoneIdx - 1 ? 20 : idx === primaryZoneIdx + 1 ? 10 : 0;
      return {
        zone: z.zone,
        name: `Z${z.zone} ${z.name} (${z.minHr}-${z.maxHr} bpm)`,
        pct,
        seconds: Math.round((pct / 100) * movingTimeSec),
        color: z.color,
      };
    });
  }

  return {
    laps,
    isAutoCreatedSplits,
    avgSpeedKph,
    maxSpeedKph,
    avgWatts: avgWatts ? Math.round(avgWatts) : undefined,
    normalizedPower,
    intensityFactor,
    variabilityIndex,
    workKj,
    avgCadence: avgCadence ? Math.round(avgCadence) : undefined,
    maxCadence: maxCadence ? Math.round(maxCadence) : undefined,
    avgHr: activity.average_heartrate ? Math.round(activity.average_heartrate) : undefined,
    maxHr: activity.max_heartrate ? Math.round(activity.max_heartrate) : undefined,
    totalElevationGainM: activity.total_elevation_gain ? Math.round(activity.total_elevation_gain) : undefined,
    powerZones,
    hrZones,
  };
}

export interface TSSCalculationResult {
  tss: number;
  type:
    | 'Power TSS'
    | 'rTSS (Outdoor)'
    | 'rTSS (Treadmill)'
    | 'sTSS (Pool)'
    | 'sTSS (Open Water)'
    | 'hrTSS'
    | 'hrTSS (Run)'
    | 'hrTSS (Bike)'
    | 'hrTSS (Swim)'
    | 'sTSS'
    | 'Relative Effort'
    | 'Manual TSS'
    | 'Ignored';
  description: string;
}

/**
 * Calculate Training Stress Score (TSS) customized with the athlete's profile and user calibration:
 * - Respects calibration `isIgnoredFromTrainingStatus` (returns TSS 0)
 * - Uses calibrated distance, moving time, heart rate, and power if set
 * - Turbo Trainer & Bike: Power TSS (Normalized Power / FTP)
 * - Run (Outdoor): rTSS using outdoor threshold pace
 * - Treadmill Run: rTSS using treadmill threshold pace
 * - Swim (Pool): sTSS using pool threshold pace / CSS
 * - Open Water Swim: sTSS using open water threshold pace
 * - Heart rate fallback: hrTSS based on LTHR / Heart Rate Reserve
 * - Suffer score fallback
 */
export function calculateActivityTSS(
  activity: StravaActivity,
  details?: StravaActivityDetailsRecord,
  athleteProfile?: AthleteProfile,
  fallbackUserFtp = 310,
  fallbackUserLthrRun = 168,
  fallbackUserLthrBike = 162
): TSSCalculationResult | null {
  // If activity is marked as deleted, completely exclude from TSS calculations:
  if (activity?.isDeleted) {
    return {
      tss: 0,
      type: 'Ignored',
      description: 'Activity deleted',
    };
  }

  // If user flagged this activity as ignored from training status/TSS:
  if (details?.calibration?.isIgnoredFromTrainingStatus) {
    return {
      tss: 0,
      type: 'Ignored',
      description: 'Activity excluded from training status and TSS calculations',
    };
  }

  // 0. Manual TSS Override
  if (details?.calibration?.manualTss !== undefined && details?.calibration?.manualTss !== null && !isNaN(details.calibration.manualTss)) {
    return {
      tss: Math.max(0, Math.round(details.calibration.manualTss)),
      type: 'Manual TSS',
      description: `Manual override (${details.calibration.manualTss} TSS)`,
    };
  }

  const preferredModel = details?.calibration?.preferredTssModel || 'auto';

  const { category, subType } = classifyActivity(activity);
  const effectiveMovingTimeSec = details?.calibration?.calibratedMovingTimeSec ?? activity.moving_time ?? activity.elapsed_time ?? 0;
  if (effectiveMovingTimeSec <= 60) return null;

  const effectiveDistanceM = details?.calibration?.calibratedDistanceM ?? activity.distance ?? 0;
  const effectiveAvgHr = details?.calibration?.calibratedAvgHeartRate ?? activity.average_heartrate;

  const userFtp = athleteProfile?.bikeFtp || fallbackUserFtp;
  const userLthrRun = athleteProfile?.thresholdHeartRateRun || fallbackUserLthrRun;
  const userLthrBike = athleteProfile?.thresholdHeartRateBike || fallbackUserLthrBike;

  // 1. Explicit hrTSS override if selected
  if (preferredModel === 'hrTSS' && effectiveAvgHr && effectiveAvgHr > 40) {
    const lthr = category === 'Swim' 
      ? (athleteProfile?.thresholdHeartRateRun ? Math.round(athleteProfile.thresholdHeartRateRun * 0.95) : 160)
      : category === 'Run' ? userLthrRun : userLthrBike;
    const ifHr = effectiveAvgHr / lthr;
    const hrTss = ((effectiveMovingTimeSec * effectiveAvgHr * ifHr) / (lthr * 3600)) * 100;
    return {
      tss: Math.round(hrTss),
      type: category === 'Swim' ? 'hrTSS (Swim)' : category === 'Run' ? 'hrTSS (Run)' : 'hrTSS (Bike)',
      description: `hrTSS based on avg HR ${Math.round(effectiveAvgHr)} bpm (LTHR ${lthr}, IF ${ifHr.toFixed(2)})`,
    };
  }

  // 1. Cycling Power TSS (STRICTLY for Turbo Trainer or Bike only!)
  if (subType === 'Turbo Trainer' || subType === 'Bike') {
    const np = calculateNormalizedPower(activity, details);

    if (np && np > 0 && userFtp > 0) {
      const ifFactor = np / userFtp;
      const tss = ((effectiveMovingTimeSec * np * ifFactor) / (userFtp * 3600)) * 100;
      return {
        tss: Math.round(tss),
        type: 'Power TSS',
        description: `Normalized Power ${Math.round(np)}W (FTP ${userFtp}W, IF ${ifFactor.toFixed(2)})`,
      };
    }
  }

  // 2. Running Pace-based TSS (rTSS) differentiating Outdoor vs Treadmill!
  if (category === 'Run' && effectiveDistanceM > 200 && effectiveMovingTimeSec > 60) {
    const isTreadmill = subType === 'Treadmill Run';
    const thresholdPaceSec = isTreadmill
      ? (athleteProfile?.thresholdPaceRunTreadmillSec || 228)
      : (athleteProfile?.thresholdPaceRunOutdoorSec || 228);

    const avgPaceSec = effectiveMovingTimeSec / (effectiveDistanceM / 1000);
    if (avgPaceSec > 120 && avgPaceSec < 1200) {
      const ifPace = thresholdPaceSec / avgPaceSec;
      const rTss = ((effectiveMovingTimeSec * Math.pow(ifPace, 2)) / 3600) * 100;
      const paceLabel = formatSecondsToMinSec(avgPaceSec);
      const threshLabel = formatSecondsToMinSec(thresholdPaceSec);
      return {
        tss: Math.round(rTss),
        type: isTreadmill ? 'rTSS (Treadmill)' : 'rTSS (Outdoor)',
        description: `${isTreadmill ? 'Treadmill' : 'Outdoor'} Pace ${paceLabel}/km (Threshold ${threshLabel}/km, IF ${ifPace.toFixed(2)})`,
      };
    }
  }

  // 3. Swimming TSS: sTSS (CSS/Pace based) or hrTSS (Heart Rate based)
  if (category === 'Swim') {
    const prefersHr = athleteProfile?.swimTssMode === 'hrTSS';
    if (prefersHr && effectiveAvgHr && effectiveAvgHr > 40) {
      // hrTSS based on swim lactate threshold HR (typically 5-10 bpm lower than run LTHR)
      const swimLthr = athleteProfile?.thresholdHeartRateRun ? Math.round(athleteProfile.thresholdHeartRateRun * 0.95) : 160;
      const ifHr = effectiveAvgHr / swimLthr;
      const hrTss = ((effectiveMovingTimeSec * effectiveAvgHr * ifHr) / (swimLthr * 3600)) * 100;
      return {
        tss: Math.round(hrTss),
        type: 'hrTSS (Swim)',
        description: `hrTSS based on avg HR ${Math.round(effectiveAvgHr)} bpm (Swim LTHR ${swimLthr}, IF ${ifHr.toFixed(2)})`,
      };
    }

    if (effectiveDistanceM > 50 && effectiveMovingTimeSec > 30) {
      const isOpenWater = subType === 'Open Water Swim';
      const thresholdSwimPaceSec = isOpenWater
        ? (athleteProfile?.swimOpenWaterPace100mSec || 105) // 1:45/100m OW CSS default
        : (athleteProfile?.swimPoolPace100mSec || 96); // 1:36/100m Regular Pool CSS default

      const avgPace100m = effectiveMovingTimeSec / (effectiveDistanceM / 100);
      if (avgPace100m > 30 && avgPace100m < 600) {
        const ifSwim = thresholdSwimPaceSec / avgPace100m;
        const sTss = ((effectiveMovingTimeSec * Math.pow(ifSwim, 3)) / 3600) * 100;
        const paceLabel = formatSecondsToMinSec(avgPace100m);
        const threshLabel = formatSecondsToMinSec(thresholdSwimPaceSec);
        return {
          tss: Math.round(sTss),
          type: isOpenWater ? 'sTSS (Open Water)' : 'sTSS (Pool)',
          description: `${isOpenWater ? 'Open water' : 'Pool'} pace ${paceLabel}/100m (${isOpenWater ? 'OW CSS' : 'Regular CSS'} ${threshLabel}/100m, IF ${ifSwim.toFixed(2)})`,
        };
      }
    }
  }

  // 4. Heart Rate TSS (hrTSS) for any activity with heart rate data
  if (effectiveAvgHr && effectiveAvgHr > 40) {
    const lthr = category === 'Run' ? userLthrRun : userLthrBike;
    const ifHr = effectiveAvgHr / lthr;
    const hrTss = ((effectiveMovingTimeSec * effectiveAvgHr * ifHr) / (lthr * 3600)) * 100;
    return {
      tss: Math.round(hrTss),
      type: 'hrTSS',
      description: `hrTSS based on avg HR ${Math.round(effectiveAvgHr)} bpm (LTHR ${lthr})`,
    };
  }

  // 5. Strava Suffer Score fallback
  if (activity.suffer_score && activity.suffer_score > 0) {
    return {
      tss: activity.suffer_score,
      type: 'Relative Effort',
      description: 'Strava Relative Effort score',
    };
  }

  return null;
}

// --------------------------------------------------------------------------
// IndexedDB Detailed Storage
// --------------------------------------------------------------------------

function openStravaActivityDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Activity details storage is unavailable in this browser'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STRAVA_ACTIVITY_DB_NAME, STRAVA_ACTIVITY_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STRAVA_ACTIVITY_STORE_NAME)) {
        database.createObjectStore(STRAVA_ACTIVITY_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open activity details storage'));
  });
}

export async function updateStravaActivityRecord(
  activityId: number | string,
  update: (record: StravaActivityDetailsRecord) => StravaActivityDetailsRecord
): Promise<StravaActivityDetailsRecord> {
  const id = String(activityId);
  const database = await openStravaActivityDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STRAVA_ACTIVITY_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STRAVA_ACTIVITY_STORE_NAME);
    let updatedRecord: StravaActivityDetailsRecord | undefined;
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const existing = getRequest.result as StravaActivityDetailsRecord | undefined;
      updatedRecord = update(existing || { id });
      store.put(updatedRecord);
    };
    getRequest.onerror = () => transaction.abort();
    transaction.oncomplete = () => {
      database.close();
      if (updatedRecord) resolve(updatedRecord);
      else reject(new Error('Could not update activity details'));
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('Could not update activity details'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || getRequest.error || new Error('Could not update activity details'));
    };
  });
}

export async function getCachedStravaActivityRecord(
  activityId: number | string
): Promise<StravaActivityDetailsRecord | undefined> {
  const database = await openStravaActivityDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STRAVA_ACTIVITY_STORE_NAME, 'readonly');
    const request = transaction.objectStore(STRAVA_ACTIVITY_STORE_NAME).get(String(activityId));
    request.onsuccess = () => resolve(request.result as StravaActivityDetailsRecord | undefined);
    request.onerror = () => reject(request.error || new Error('Could not read activity details'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('Could not read activity details'));
    };
  });
}

export async function getAllCachedStravaActivityRecords(): Promise<Record<string, StravaActivityDetailsRecord>> {
  if (typeof indexedDB === 'undefined') return {};
  try {
    const database = await openStravaActivityDatabase();
    return new Promise((resolve) => {
      const transaction = database.transaction(STRAVA_ACTIVITY_STORE_NAME, 'readonly');
      const store = transaction.objectStore(STRAVA_ACTIVITY_STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const records = (request.result || []) as StravaActivityDetailsRecord[];
        const map: Record<string, StravaActivityDetailsRecord> = {};
        for (const r of records) {
          if (r && r.id) map[String(r.id)] = r;
        }
        resolve(map);
      };
      request.onerror = () => resolve({});
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => {
        database.close();
        resolve({});
      };
    });
  } catch {
    return {};
  }
}

export async function batchSaveStravaActivityRecords(
  records: StravaActivityDetailsRecord[],
  deleteIds: string[] = []
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  if (records.length === 0 && deleteIds.length === 0) return;
  try {
    const database = await openStravaActivityDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STRAVA_ACTIVITY_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STRAVA_ACTIVITY_STORE_NAME);
      for (const delId of deleteIds) {
        if (delId) store.delete(String(delId));
      }
      for (const rec of records) {
        if (rec && rec.id) store.put(rec);
      }
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error || new Error('Could not batch save activity records'));
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error || new Error('Batch save aborted'));
      };
    });
  } catch (err) {
    console.warn('[IndexedDB] batchSaveStravaActivityRecords error:', err);
  }
}

export async function deleteCachedStravaActivityRecords(deleteIds: string[]): Promise<void> {
  return batchSaveStravaActivityRecords([], deleteIds);
}

export function ensureStravaActivityRecord(activityId: number | string): Promise<StravaActivityDetailsRecord> {
  return updateStravaActivityRecord(activityId, (record) => record);
}

export function saveStravaActivityDetails(
  activityId: number | string,
  details: StravaActivityDetailsResponse
): Promise<StravaActivityDetailsRecord> {
  const hasValidStreams = Boolean(
    details.streams &&
    typeof details.streams === 'object' &&
    Object.keys(details.streams).length > 0
  );

  // Sync mute status (hide_from_home / muted) from DetailedActivity back to the summary cache
  const detAct = details.activity as Record<string, any> | undefined;
  if (detAct && (typeof detAct.hide_from_home === 'boolean' || typeof detAct.muted === 'boolean')) {
    const isMuted = Boolean(detAct.hide_from_home || detAct.muted);
    const idStr = String(activityId);
    const snap = getCachedStravaActivitiesSnapshot();
    if (snap && snap.some((a) => String(a.id) === idStr && (Boolean(a.hide_from_home) !== isMuted || Boolean(a.muted) !== isMuted))) {
      const updatedList = snap.map((a) =>
        String(a.id) === idStr
          ? { ...a, hide_from_home: isMuted, muted: isMuted }
          : a
      );
      saveCachedStravaActivities(updatedList);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('fit_track_activities_updated', {
            detail: { activities: getCachedStravaActivities() },
          })
        );
      }
    }
  }

  return updateStravaActivityRecord(activityId, (record) => ({
    ...record,
    activity: details.activity,
    lapsError: details.lapsError,
    lapsFetchedAt: new Date().toISOString(),
    ...(hasValidStreams
      ? { streams: details.streams, streamsError: undefined, noStreamsAvailable: false }
      : {
          streams: undefined,
          streamsError: details.streamsError || 'No streams available for this activity',
          noStreamsAvailable: true,
        }),
    fetchedAt: new Date().toISOString(),
  }));
}

export function markStravaActivityPublishedToGoogleSheets(
  activityId: number | string,
  publishedAt = new Date().toISOString()
): Promise<StravaActivityDetailsRecord> {
  return updateStravaActivityRecord(activityId, (record) => ({
    ...record,
    googleDrivePublishedAt: publishedAt,
  }));
}

export function saveActivityCalibration(
  activityId: number | string,
  calibration: ActivityCalibration
): Promise<StravaActivityDetailsRecord> {
  return updateStravaActivityRecord(activityId, (record) => ({
    ...record,
    calibration: {
      ...calibration,
      calibratedAt: new Date().toISOString(),
    },
  }));
}

/**
 * Crops all streams in a stream map when `targetDurationSec` is shorter than the existing
 * stream duration (or original activity duration), and optionally rescales the distance & velocity
 * streams so that total distance matches `targetDistanceM` over `targetDurationSec`.
 */
export function cropStreamsAndScaleDistance(
  streamsInput: Record<string, any> | undefined,
  targetDurationSec: number,
  targetDistanceM: number,
  originalMovingSec?: number,
  forceCrop?: boolean
): Record<string, any> | undefined {
  if (!streamsInput || typeof streamsInput !== 'object') return streamsInput;

  const nextStreams: Record<string, any> = {};
  for (const [k, v] of Object.entries(streamsInput)) {
    if (v && typeof v === 'object') {
      nextStreams[k] = {
        ...v,
        ...(Array.isArray(v.data) ? { data: [...v.data] } : {}),
      };
    } else {
      nextStreams[k] = v;
    }
  }

  const timeData = Array.isArray(nextStreams.time?.data) ? (nextStreams.time.data as number[]) : undefined;
  let cutoffLen: number | null = null;

  if (timeData && timeData.length >= 2 && targetDurationSec > 0) {
    const t0 = Number(timeData[0]) || 0;
    const streamDur = (Number(timeData[timeData.length - 1]) || 0) - t0;
    if (targetDurationSec < streamDur || forceCrop) {
      let count = 0;
      for (let i = 0; i < timeData.length; i++) {
        if ((Number(timeData[i]) || 0) - t0 <= targetDurationSec) {
          count = i + 1;
        } else {
          break;
        }
      }
      cutoffLen = Math.max(2, Math.min(timeData.length, count));
    }
  } else if (
    targetDurationSec > 0 &&
    originalMovingSec &&
    originalMovingSec > 0 &&
    targetDurationSec < originalMovingSec
  ) {
    const sampleArr = Object.values(nextStreams).find((v: any) => Array.isArray(v?.data) && v.data.length >= 2) as
      | { data: any[] }
      | undefined;
    if (sampleArr) {
      cutoffLen = Math.max(
        2,
        Math.min(sampleArr.data.length, Math.round(sampleArr.data.length * (targetDurationSec / originalMovingSec)))
      );
    }
  }

  // Crop every stream array to cutoffLen
  if (cutoffLen !== null) {
    for (const key of Object.keys(nextStreams)) {
      const streamObj = nextStreams[key];
      if (streamObj && Array.isArray(streamObj.data) && streamObj.data.length > cutoffLen) {
        const sliced = streamObj.data.slice(0, cutoffLen);
        nextStreams[key] = {
          ...streamObj,
          data: sliced,
          original_size: sliced.length,
        };
      }
    }
    if (Array.isArray(nextStreams.time?.data) && nextStreams.time.data.length >= 2) {
      const tArr = nextStreams.time.data as number[];
      const t0 = Number(tArr[0]) || 0;
      if ((Number(tArr[tArr.length - 1]) || 0) - t0 > targetDurationSec) {
        tArr[tArr.length - 1] = t0 + Math.round(targetDurationSec);
      }
    }
  }

  // Scale or rebuild distance and velocity_smooth streams to match targetDistanceM
  if (targetDistanceM > 0 && targetDurationSec > 0) {
    const distArr = Array.isArray(nextStreams.distance?.data) ? (nextStreams.distance.data as number[]) : undefined;
    const tArr = Array.isArray(nextStreams.time?.data) ? (nextStreams.time.data as number[]) : undefined;

    if (distArr && distArr.length >= 2) {
      const d0 = Number(distArr[0]) || 0;
      const dSpan = (Number(distArr[distArr.length - 1]) || 0) - d0;
      let scaledDist: number[];
      if (dSpan > 1) {
        const scale = targetDistanceM / dSpan;
        scaledDist = distArr.map((d) => Number((Math.max(0, (Number(d) || 0) - d0) * scale).toFixed(1)));
        scaledDist[scaledDist.length - 1] = Number(targetDistanceM.toFixed(1));
      } else {
        scaledDist = distArr.map((_, idx) =>
          Number(((targetDistanceM * idx) / Math.max(1, distArr.length - 1)).toFixed(1))
        );
      }
      nextStreams.distance = {
        ...(nextStreams.distance || { series_type: 'distance', resolution: 'high' }),
        data: scaledDist,
        original_size: scaledDist.length,
      };

      const speedArr = scaledDist.map((d, idx) => {
        if (idx === 0) {
          const dt = tArr && tArr.length >= 2 ? Math.max(1, (Number(tArr[1]) || 1) - (Number(tArr[0]) || 0)) : 1;
          const dd = Math.max(0, (scaledDist[1] || 0) - d);
          return Number((dd / dt).toFixed(3));
        }
        const dt =
          tArr && tArr.length > idx
            ? Math.max(1, (Number(tArr[idx]) || idx) - (Number(tArr[idx - 1]) || idx - 1))
            : 1;
        const dd = Math.max(0, d - (scaledDist[idx - 1] || 0));
        return Number((dd / dt).toFixed(3));
      });
      nextStreams.velocity_smooth = {
        ...(nextStreams.velocity_smooth || { series_type: 'distance', resolution: 'high' }),
        data: speedArr,
        original_size: speedArr.length,
      };
    }
  }

  return nextStreams;
}

/**
 * Applies calibrated distance and/or cropped duration to an activity's IndexedDB record and summary cache:
 * - Crops all streams if `finalMovingSec` is shorter than the existing duration.
 * - Rescales distance & velocity streams to match `finalDistM`.
 * - Regenerates 1km splits for Run or 2km splits for Bike when distance or duration is calibrated.
 */
export async function applyCalibratedDistanceAndDurationToRecord(params: {
  activity: StravaActivity;
  targetActivityId: number | string;
  finalDistM: number;
  finalMovingSec: number;
  isDurationShorter: boolean;
  isDistanceChanged: boolean;
  preserveCustomRunLaps?: boolean;
}): Promise<StravaActivityDetailsRecord> {
  const {
    activity,
    targetActivityId,
    finalDistM,
    finalMovingSec,
    isDurationShorter,
    isDistanceChanged,
    preserveCustomRunLaps = false,
  } = params;

  const { category } = classifyActivity(activity);
  const origMovingSec = Number(activity.moving_time) || 0;

  const updatedRecord = await updateStravaActivityRecord(targetActivityId, (record) => {
    const currentActivity = (record.activity || {}) as Record<string, any>;
    const currentStreams = record.streams as Record<string, any> | undefined;

    const processedStreams = cropStreamsAndScaleDistance(
      currentStreams,
      finalMovingSec,
      finalDistM,
      origMovingSec || Number(currentActivity.moving_time) || 0,
      isDurationShorter
    );

    const nextElapsedSec = isDurationShorter
      ? Math.round(finalMovingSec)
      : Math.max(
          Math.round(finalMovingSec),
          Number(currentActivity.elapsed_time) || Number(activity.elapsed_time) || Math.round(finalMovingSec)
        );
    const nextAvgSpeed =
      finalMovingSec > 0 && finalDistM > 0
        ? Number((finalDistM / finalMovingSec).toFixed(3))
        : currentActivity.average_speed ?? activity.average_speed;

    const tempActivity: StravaActivity = {
      ...activity,
      distance: finalDistM > 0 ? finalDistM : activity.distance,
      moving_time: finalMovingSec > 0 ? Math.round(finalMovingSec) : activity.moving_time,
      elapsed_time: nextElapsedSec,
      average_speed: nextAvgSpeed,
    };

    const tempRecord: StravaActivityDetailsRecord = {
      ...record,
      streams: processedStreams,
      calibration: {
        ...(record.calibration || { isIgnoredFromTrainingStatus: false }),
        calibratedDistanceM: finalDistM > 0 ? finalDistM : undefined,
        calibratedMovingTimeSec: finalMovingSec > 0 ? Math.round(finalMovingSec) : undefined,
      },
      activity: {
        ...currentActivity,
        distance: tempActivity.distance,
        moving_time: tempActivity.moving_time,
        elapsed_time: nextElapsedSec,
        average_speed: nextAvgSpeed,
        // Clear stale splits_metric before regenerating so generateAutoSplitsFromStreamsOrActivity uses streams/totals
        splits_metric: undefined,
      },
    };

    let nextSplitsMetric = currentActivity.splits_metric;
    let nextLaps = currentActivity.laps;

    if ((category === 'Run' || category === 'Bike') && (isDistanceChanged || isDurationShorter) && finalDistM > 0 && finalMovingSec > 0) {
      const chunks1km = generateAutoSplitsFromStreamsOrActivity(tempActivity, tempRecord, 1000);
      if (chunks1km.length > 0) {
        nextSplitsMetric = chunks1km.map((chunk) => ({
          distance: chunk.distanceM,
          elapsed_time: chunk.movingTimeSec,
          moving_time: chunk.movingTimeSec,
          elevation_difference: chunk.elevationDiffM ?? 0,
          split: chunk.splitIndex,
          average_speed: Number(chunk.avgSpeedMps.toFixed(3)),
          average_heartrate: chunk.avgHr,
          average_cadence: chunk.avgCadence,
          pace_zone: 0,
        }));
      }

      if (category === 'Run' && !preserveCustomRunLaps && chunks1km.length > 0) {
        let cumIdx = 0;
        nextLaps = chunks1km.map((chunk, idx) => {
          const startIdx = cumIdx;
          const endIdx = cumIdx + Math.max(1, chunk.movingTimeSec) - 1;
          cumIdx = endIdx + 1;
          return {
            id: Number(activity.id) * 100 + (idx + 1),
            resource_state: 2,
            name: `Split ${chunk.splitIndex}`,
            activity: { id: activity.id },
            athlete: (activity as any).athlete || { id: 0 },
            elapsed_time: chunk.movingTimeSec,
            moving_time: chunk.movingTimeSec,
            start_date: activity.start_date,
            start_date_local: activity.start_date_local,
            distance: chunk.distanceM,
            start_index: startIdx,
            end_index: endIdx,
            total_elevation_gain: chunk.elevationGainM ?? 0,
            average_speed: Number(chunk.avgSpeedMps.toFixed(3)),
            max_speed: Number(chunk.avgSpeedMps.toFixed(3)),
            average_heartrate: chunk.avgHr,
            max_heartrate: chunk.maxHr,
            average_cadence: chunk.avgCadence,
            lap_index: chunk.splitIndex,
            split: chunk.splitIndex,
            isAutoGeneratedSplit: true,
          };
        });
      } else if (category === 'Bike') {
        const chunks2km = generateAutoSplitsFromStreamsOrActivity(tempActivity, tempRecord, 2000);
        if (chunks2km.length > 0) {
          let cumIdx = 0;
          nextLaps = chunks2km.map((chunk, idx) => {
            const startIdx = cumIdx;
            const endIdx = cumIdx + Math.max(1, chunk.movingTimeSec) - 1;
            cumIdx = endIdx + 1;
            return {
              id: Number(activity.id) * 100 + (idx + 1),
              resource_state: 2,
              name: `Split ${chunk.splitIndex}`,
              activity: { id: activity.id },
              athlete: (activity as any).athlete || { id: 0 },
              elapsed_time: chunk.movingTimeSec,
              moving_time: chunk.movingTimeSec,
              start_date: activity.start_date,
              start_date_local: activity.start_date_local,
              distance: chunk.distanceM,
              start_index: startIdx,
              end_index: endIdx,
              total_elevation_gain: chunk.elevationGainM ?? 0,
              average_speed: Number(chunk.avgSpeedMps.toFixed(3)),
              max_speed: Number(chunk.avgSpeedMps.toFixed(3)),
              average_watts: chunk.avgWatts,
              average_heartrate: chunk.avgHr,
              max_heartrate: chunk.maxHr,
              average_cadence: chunk.avgCadence,
              lap_index: chunk.splitIndex,
              split: chunk.splitIndex,
              isAutoGeneratedSplit: true,
            };
          });
        }
      }
    } else if (isDurationShorter && Array.isArray(currentActivity.laps) && currentActivity.laps.length > 0) {
      // Crop existing laps if duration was shortened
      const croppedLaps: any[] = [];
      let accSec = 0;
      for (let i = 0; i < currentActivity.laps.length; i++) {
        const lap = currentActivity.laps[i];
        const lSec = Number(lap?.moving_time || lap?.elapsed_time) || 0;
        if (accSec >= finalMovingSec) break;
        if (accSec + lSec <= finalMovingSec) {
          croppedLaps.push(lap);
          accSec += lSec;
        } else {
          const remSec = Math.max(1, Math.round(finalMovingSec - accSec));
          const ratio = lSec > 0 ? remSec / lSec : 1;
          const remDist = Math.round((Number(lap?.distance) || 0) * ratio);
          croppedLaps.push({
            ...lap,
            moving_time: remSec,
            elapsed_time: remSec,
            distance: remDist,
          });
          accSec += remSec;
          break;
        }
      }
      if (croppedLaps.length > 0) {
        nextLaps = croppedLaps;
      }
    }

    return {
      ...record,
      streams: processedStreams,
      activity: {
        ...currentActivity,
        distance: finalDistM > 0 ? finalDistM : currentActivity.distance,
        moving_time: finalMovingSec > 0 ? Math.round(finalMovingSec) : currentActivity.moving_time,
        elapsed_time: nextElapsedSec,
        average_speed: nextAvgSpeed,
        ...(nextSplitsMetric !== undefined ? { splits_metric: nextSplitsMetric } : {}),
        ...(nextLaps !== undefined ? { laps: nextLaps } : {}),
      },
    };
  });

  // Also update the summary StravaActivity in the cached snapshot so header/cards reflect cropped elapsed_time/moving_time/distance
  const idStr = String(targetActivityId);
  const snap = getCachedStravaActivitiesSnapshot();
  if (snap && snap.some((a) => String(a.id) === idStr)) {
    const updatedList = snap.map((a) => {
      if (String(a.id) !== idStr) return a;
      const nextEl = isDurationShorter
        ? Math.round(finalMovingSec)
        : Math.max(Math.round(finalMovingSec), Number(a.elapsed_time) || Math.round(finalMovingSec));
      return {
        ...a,
        distance: finalDistM > 0 ? finalDistM : a.distance,
        moving_time: finalMovingSec > 0 ? Math.round(finalMovingSec) : a.moving_time,
        elapsed_time: nextEl,
        average_speed:
          finalMovingSec > 0 && finalDistM > 0
            ? Number((finalDistM / finalMovingSec).toFixed(3))
            : a.average_speed,
      };
    });
    saveCachedStravaActivities(updatedList);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('fit_track_activities_updated', {
          detail: { activities: getCachedStravaActivities() },
        })
      );
    }
  }

  return updatedRecord;
}

export function clearActivityCalibration(
  activityId: number | string
): Promise<StravaActivityDetailsRecord> {
  return updateStravaActivityRecord(activityId, (record) => {
    const next = { ...record };
    delete next.calibration;
    return next;
  });
}

export interface ReplaceRepublishedActivityParams {
  oldActivity: StravaActivity;
  newActivityId: number | string;
  calibratedName?: string;
  calibratedDistanceM: number;
  calibratedMovingTimeSec: number;
  maxSpeedMps?: number;
  calibration: ActivityCalibration;
  newLaps?: any[];
  simulatedStreams?: {
    timeStream: number[];
    speedStream: number[];
    distanceStream: number[];
    heartrateStream?: number[];
    cadenceStream?: number[];
  };
  existingDetails?: StravaActivityDetailsRecord | null;
}

/**
 * When a user fixes/calibrates an activity and uploads the corrected .FIT file to Strava:
 * 1. Flags the old Strava activity ID as deleted (`markActivityAsDeleted`) so it is immediately hidden from all views & charts.
 * 2. Inserts/updates the activity under the new Strava ID (`newActivityId`) in the local activities cache.
 * 3. Migrates the calibrated streams, laps, and calibration metadata to the new Strava ID in IndexedDB.
 * 4. Broadcasts `fit_track_activities_updated` so React state updates immediately across the app.
 */
export async function replaceRepublishedStravaActivity(
  params: ReplaceRepublishedActivityParams
): Promise<{
  newActivity: StravaActivity;
  newDetailsRecord: StravaActivityDetailsRecord;
  updatedActivities: StravaActivity[];
}> {
  const {
    oldActivity,
    newActivityId,
    calibratedName,
    calibratedDistanceM,
    calibratedMovingTimeSec,
    maxSpeedMps,
    calibration,
    newLaps,
    simulatedStreams,
    existingDetails,
  } = params;

  const oldIdStr = String(oldActivity.id);
  const newIdStr = String(newActivityId);
  const numericNewId = !isNaN(Number(newActivityId)) ? Number(newActivityId) : newActivityId;

  // 1. Flag the old Strava ID as deleted & ignored so it never double-counts or shows in the UI
  markActivityAsDeleted(oldIdStr);
  await updateStravaActivityRecord(oldIdStr, (oldRec) => ({
    ...oldRec,
    calibration: {
      ...(oldRec.calibration || {}),
      ...calibration,
      isIgnoredFromTrainingStatus: true,
      replacedByActivityId: newIdStr,
      calibratedAt: new Date().toISOString(),
    },
  }));

  // 2. Construct the new StravaActivity summary with the new Strava ID
  const finalDistM = calibratedDistanceM > 0 ? calibratedDistanceM : oldActivity.distance;
  const finalMovingSec = calibratedMovingTimeSec > 0 ? calibratedMovingTimeSec : oldActivity.moving_time;
  const avgSpeedMps = finalMovingSec > 0 ? Number((finalDistM / finalMovingSec).toFixed(3)) : oldActivity.average_speed;

  const newActivity: StravaActivity = {
    ...oldActivity,
    id: numericNewId as number,
    name: calibratedName?.trim() || oldActivity.name,
    distance: finalDistM,
    moving_time: finalMovingSec,
    elapsed_time: Math.max(oldActivity.elapsed_time || 0, finalMovingSec),
    average_speed: avgSpeedMps,
    max_speed: maxSpeedMps && maxSpeedMps > 0 ? Number(maxSpeedMps.toFixed(3)) : oldActivity.max_speed,
    average_heartrate: calibration.calibratedAvgHeartRate ?? oldActivity.average_heartrate,
    max_heartrate: calibration.calibratedMaxHeartRate ?? oldActivity.max_heartrate,
    average_watts: calibration.calibratedAvgWatts ?? oldActivity.average_watts,
    isDeleted: false,
  };

  // 3. Migrate and save the full details + streams record under the new Strava ID in IndexedDB
  const baseDetails = existingDetails || (await getCachedStravaActivityRecord(oldIdStr)) || { id: oldIdStr };
  const currentStreams = (baseDetails.streams || {}) as Record<string, any>;
  const currentActivityObj = (baseDetails.activity || {}) as Record<string, any>;

  const migratedCalibration: ActivityCalibration = {
    ...calibration,
    isIgnoredFromTrainingStatus: false,
    replacesActivityId: oldIdStr,
    calibratedAt: new Date().toISOString(),
  };

  const newDetailsRecord = await updateStravaActivityRecord(newIdStr, () => ({
    ...baseDetails,
    id: newIdStr,
    calibration: migratedCalibration,
    activity: {
      ...currentActivityObj,
      ...newActivity,
      id: numericNewId,
      distance: finalDistM,
      moving_time: finalMovingSec,
      laps: newLaps || currentActivityObj.laps,
    },
    streams: simulatedStreams
      ? {
          ...currentStreams,
          time: {
            data: simulatedStreams.timeStream,
            series_type: 'time',
            original_size: simulatedStreams.timeStream.length,
            resolution: 'high',
          },
          velocity_smooth: {
            data: simulatedStreams.speedStream,
            series_type: 'distance',
            original_size: simulatedStreams.speedStream.length,
            resolution: 'high',
          },
          distance: {
            data: simulatedStreams.distanceStream,
            series_type: 'distance',
            original_size: simulatedStreams.distanceStream.length,
            resolution: 'high',
          },
          ...(simulatedStreams.heartrateStream && simulatedStreams.heartrateStream.length > 0
            ? {
                heartrate: {
                  data: simulatedStreams.heartrateStream,
                  series_type: 'distance',
                  original_size: simulatedStreams.heartrateStream.length,
                  resolution: 'high',
                },
              }
            : {}),
          ...(simulatedStreams.cadenceStream && simulatedStreams.cadenceStream.length > 0
            ? {
                cadence: {
                  data: simulatedStreams.cadenceStream,
                  series_type: 'distance',
                  original_size: simulatedStreams.cadenceStream.length,
                  resolution: 'high',
                },
              }
            : {}),
        }
      : currentStreams,
  }));

  // 4. Update cached Strava activities list (old ID flagged isDeleted: true, new ID inserted)
  const currentList = getCachedStravaActivities();
  const withoutDuplicateNew = currentList.filter((a) => String(a.id) !== newIdStr);
  const withOldDeleted = withoutDuplicateNew.map((a) =>
    String(a.id) === oldIdStr ? { ...a, isDeleted: true } : a
  );
  const mergedList = [newActivity, ...withOldDeleted].sort((a, b) => {
    const tA = new Date(a.start_date).getTime();
    const tB = new Date(b.start_date).getTime();
    return tB - tA;
  });
  saveCachedStravaActivities(mergedList);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('fit_track_activities_updated', {
        detail: {
          activities: mergedList,
          newActivity,
          newDetailsRecord,
          oldActivityId: oldIdStr,
          newActivityId: newIdStr,
        },
      })
    );
  }

  return {
    newActivity,
    newDetailsRecord,
    updatedActivities: mergedList,
  };
}

/**
 * Recreates a run workout using calibrated run sections (Fix Data > +Add Lap).
 * Generates synthetic velocity_smooth and distance streams and calibrated laps
 * matching the exact durations and speeds of the sections.
 */
export async function applyRunSectionsCalibration(
  activityId: number | string,
  sections: CalibratedRunSection[],
  notes?: string,
  activityFallback?: any
): Promise<StravaActivityDetailsRecord> {
  const totalDurationSec = sections.reduce((acc, s) => acc + (s.durationSec || 0), 0);
  let totalDistanceM = 0;
  sections.forEach((s) => {
    totalDistanceM += ((s.speedKph || 0) / 3.6) * (s.durationSec || 0);
  });
  totalDistanceM = Math.round(totalDistanceM * 10) / 10;

  return updateStravaActivityRecord(activityId, (record) => {
    const existing = record || { id: String(activityId) };
    const rawStreams = (existing.streams || {}) as Record<string, any>;
    const act = (existing.activity || activityFallback || {}) as Record<string, any>;

    const originalTimeStream = rawStreams.time?.data as number[] | undefined;
    const timeStream = originalTimeStream && originalTimeStream.length > 0
      ? [...originalTimeStream]
      : Array.from({ length: Math.ceil(totalDurationSec) + 1 }, (_, i) => i);

    const boundaries: { endTime: number; speedMps: number; section: CalibratedRunSection }[] = [];
    let currentEnd = 0;
    sections.forEach((s) => {
      currentEnd += s.durationSec;
      boundaries.push({
        endTime: currentEnd,
        speedMps: (s.speedKph || 0) / 3.6,
        section: s,
      });
    });

    const speedStream: number[] = [];
    const distanceStream: number[] = [];
    let cumDist = 0;

    for (let i = 0; i < timeStream.length; i++) {
      const t = timeStream[i];
      let activeSpeedMps = boundaries.length > 0 ? boundaries[0].speedMps : 0;
      for (const b of boundaries) {
        if (t <= b.endTime) {
          activeSpeedMps = b.speedMps;
          break;
        }
        activeSpeedMps = b.speedMps;
      }

      if (i > 0) {
        const dt = Math.max(0, timeStream[i] - timeStream[i - 1]);
        cumDist += activeSpeedMps * dt;
      }

      speedStream.push(Number(activeSpeedMps.toFixed(3)));
      distanceStream.push(Number(cumDist.toFixed(1)));
    }

    let lapStartSec = 0;
    const newLaps = sections.map((s, idx) => {
      const lapEndSec = lapStartSec + s.durationSec;
      const startIdx = timeStream.findIndex((t) => t >= lapStartSec);
      let endIdx = timeStream.findIndex((t) => t >= lapEndSec);
      if (endIdx === -1) endIdx = timeStream.length - 1;

      const lapDistanceM = Math.round(((s.speedKph || 0) / 3.6) * s.durationSec * 10) / 10;
      const lapObj = {
        id: Number(activityId) * 100 + (idx + 1),
        resource_state: 2,
        name: s.name || `Lap ${idx + 1}`,
        activity: { id: activityId },
        athlete: act.athlete || { id: 0 },
        elapsed_time: Math.round(s.durationSec),
        moving_time: Math.round(s.durationSec),
        start_date: act.start_date,
        start_date_local: act.start_date_local,
        distance: lapDistanceM,
        start_index: Math.max(0, startIdx),
        end_index: Math.max(startIdx, endIdx),
        total_elevation_gain: 0,
        average_speed: Number(((s.speedKph || 0) / 3.6).toFixed(2)),
        max_speed: Number(((s.speedKph || 0) / 3.6).toFixed(2)),
        lap_index: idx + 1,
        split: idx + 1,
      };
      lapStartSec = lapEndSec;
      return lapObj;
    });

    const prevCalib = existing.calibration || {};
    const updatedCalibration: ActivityCalibration = {
      ...prevCalib,
      calibratedDistanceM: totalDistanceM,
      calibratedMovingTimeSec: Math.round(totalDurationSec),
      calibratedRunSections: sections,
      calibrationNotes: notes || prevCalib.calibrationNotes || 'Recreated workout with calibrated intervals via AI Coach',
      calibratedAt: new Date().toISOString(),
    };

    return {
      ...existing,
      activity: {
        ...act,
        distance: totalDistanceM,
        moving_time: Math.round(totalDurationSec),
        laps: newLaps,
      },
      calibration: updatedCalibration,
      streams: {
        ...rawStreams,
        time: rawStreams.time || {
          data: timeStream,
          series_type: 'time',
          original_size: timeStream.length,
          resolution: 'high',
        },
        velocity_smooth: {
          data: speedStream,
          series_type: 'distance',
          original_size: speedStream.length,
          resolution: 'high',
        },
        distance: {
          data: distanceStream,
          series_type: 'distance',
          original_size: distanceStream.length,
          resolution: 'high',
        },
      },
    };
  });
}

export function saveActivityEffortFeedback(
  activityId: number | string,
  feedback: ActivityEffortFeedback
): Promise<StravaActivityDetailsRecord> {
  return updateStravaActivityRecord(activityId, (record) => ({
    ...record,
    effortFeedback: {
      ...feedback,
      recordedAt: new Date().toISOString(),
    },
  }));
}

export function clearActivityEffortFeedback(
  activityId: number | string
): Promise<StravaActivityDetailsRecord> {
  return updateStravaActivityRecord(activityId, (record) => {
    const next = { ...record };
    delete next.effortFeedback;
    return next;
  });
}

export async function saveActivityCommentAndDescription(
  activityId: number | string,
  options: {
    commentOrDescription: string;
    newTitle?: string;
    rpe?: number;
    appendToExisting?: boolean;
    stravaAccessToken?: string | null;
  }
): Promise<{
  record: StravaActivityDetailsRecord;
  syncedToStrava: boolean;
}> {
  const idStr = String(activityId);
  const { commentOrDescription, newTitle, rpe, appendToExisting = false, stravaAccessToken } = options;

  // 1. Update IndexedDB activity details record (both activity.description and effortFeedback.feedbackNotes)
  const updatedRecord = await updateStravaActivityRecord(activityId, (existing) => {
    const act = (existing.activity || {}) as Record<string, any>;
    const prevDesc = String(act.description || existing.effortFeedback?.feedbackNotes || '').trim();
    const finalText =
      appendToExisting && prevDesc && !prevDesc.includes(commentOrDescription.trim())
        ? `${prevDesc}\n\n${commentOrDescription.trim()}`
        : commentOrDescription.trim();

    const movingTimeMin = Math.round(((Number(act.moving_time) || 2400) / 60));
    const nextRpe = typeof rpe === 'number' && rpe >= 1 && rpe <= 10 ? rpe : existing.effortFeedback?.rpe;

    return {
      ...existing,
      activity: {
        ...act,
        ...(newTitle?.trim() ? { name: newTitle.trim() } : {}),
        description: finalText,
      },
      effortFeedback: {
        ...(existing.effortFeedback || {}),
        ...(nextRpe ? { rpe: nextRpe, sRpeLoad: Math.round(nextRpe * movingTimeMin) } : {}),
        feedbackNotes: finalText,
        recordedAt: new Date().toISOString(),
      },
    };
  });

  // 2. Update cached StravaActivity list in localStorage so UI reflects description/title immediately
  const cachedList = getCachedStravaActivitiesSnapshot() || [];
  if (cachedList.length > 0) {
    const finalDesc = String(
      (updatedRecord.activity as any)?.description ||
      updatedRecord.effortFeedback?.feedbackNotes ||
      commentOrDescription
    );
    const updatedList = cachedList.map((item) => {
      if (String(item.id) !== idStr) return item;
      return {
        ...item,
        ...(newTitle?.trim() ? { name: newTitle.trim() } : {}),
        description: finalDesc,
      };
    });
    saveCachedStravaActivities(updatedList);
  }

  // 3. Optionally sync to Strava if a live token is available and this is a real Strava activity ID
  let syncedToStrava = false;
  if (
    stravaAccessToken &&
    !idStr.startsWith('demo-') &&
    !idStr.startsWith('local-') &&
    /^\d+$/.test(idStr)
  ) {
    try {
      const finalDesc = String(
        (updatedRecord.activity as any)?.description ||
        updatedRecord.effortFeedback?.feedbackNotes ||
        commentOrDescription
      );
      const bodyPayload: Record<string, string> = { description: finalDesc };
      if (newTitle?.trim()) {
        bodyPayload.name = newTitle.trim();
      }
      const res = await fetch(`/api/strava/activities/${encodeURIComponent(idStr)}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${stravaAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyPayload),
      });
      if (res.ok) {
        syncedToStrava = true;
      }
    } catch (err) {
      console.warn('[Coach Skill] Could not sync workout description to Strava:', err);
    }
  }

  return { record: updatedRecord, syncedToStrava };
}

// --------------------------------------------------------------------------
// Strava API Rate Limit Tracking
// Standard Strava limits:
// Read: 200 requests / 15 minutes, 2,000 requests / day
// Overall: 400 requests / 15 minutes, 4,000 requests / day
// --------------------------------------------------------------------------

export interface StravaRateLimits {
  read15MinUsage: number;
  read15MinLimit: number;
  readDailyUsage: number;
  readDailyLimit: number;
  overall15MinUsage: number;
  overall15MinLimit: number;
  overallDailyUsage: number;
  overallDailyLimit: number;
  remaining15MinReads: number;
  remainingDailyReads: number;
  remaining15MinOverall: number;
  remainingDailyOverall: number;
  lastUpdated: number;
  secondsUntil15MinReset: number;
}

export const STRAVA_RATE_LIMITS_STORAGE_KEY = 'fit_track_strava_rate_limits';

export function getSecondsUntilNext15MinWindow(): number {
  const now = new Date();
  const minutes = now.getUTCMinutes();
  const seconds = now.getUTCSeconds();
  const minutesUntilNext = 15 - (minutes % 15);
  const remainingSeconds = minutesUntilNext * 60 - seconds;
  return Math.max(5, remainingSeconds);
}

let inMemoryRateLimits: StravaRateLimits | null = null;
const rateLimitListeners = new Set<(limits: StravaRateLimits) => void>();

function parseHeaderPair(val: string | null): [number, number] | null {
  if (!val) return null;
  const parts = val.split(',').map((p) => parseInt(p.trim(), 10));
  if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
    return [parts[0], parts[1]];
  }
  return null;
}

export function getCachedStravaRateLimits(): StravaRateLimits | null {
  if (inMemoryRateLimits) {
    return {
      ...inMemoryRateLimits,
      secondsUntil15MinReset: getSecondsUntilNext15MinWindow(),
    };
  }
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STRAVA_RATE_LIMITS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        inMemoryRateLimits = parsed;
        return {
          ...parsed,
          secondsUntil15MinReset: getSecondsUntilNext15MinWindow(),
        };
      }
    } catch {}
  }
  return null;
}

export function subscribeToStravaRateLimits(
  listener: (limits: StravaRateLimits) => void
): () => void {
  rateLimitListeners.add(listener);
  const current = getCachedStravaRateLimits();
  if (current) {
    listener(current);
  }
  return () => {
    rateLimitListeners.delete(listener);
  };
}

export function updateStravaRateLimitsFromHeaders(headers?: Headers): StravaRateLimits | null {
  if (!headers) return null;

  const readUsage = parseHeaderPair(
    headers.get('x-readratelimit-usage') || headers.get('X-ReadRateLimit-Usage')
  );
  const readLimit = parseHeaderPair(
    headers.get('x-readratelimit-limit') || headers.get('X-ReadRateLimit-Limit')
  );
  const overallUsage = parseHeaderPair(
    headers.get('x-ratelimit-usage') || headers.get('X-RateLimit-Usage')
  );
  const overallLimit = parseHeaderPair(
    headers.get('x-ratelimit-limit') || headers.get('X-RateLimit-Limit')
  );

  // If no rate limit headers are present, do not overwrite
  if (!readUsage && !overallUsage) {
    return inMemoryRateLimits;
  }

  const existing = getCachedStravaRateLimits();

  const r15Usage = readUsage ? readUsage[0] : (existing?.read15MinUsage ?? 0);
  const rDayUsage = readUsage ? readUsage[1] : (existing?.readDailyUsage ?? 0);
  const r15Limit = readLimit ? readLimit[0] : (existing?.read15MinLimit ?? 200);
  const rDayLimit = readLimit ? readLimit[1] : (existing?.readDailyLimit ?? 2000);

  const o15Usage = overallUsage ? overallUsage[0] : (existing?.overall15MinUsage ?? 0);
  const oDayUsage = overallUsage ? overallUsage[1] : (existing?.overallDailyUsage ?? 0);
  const o15Limit = overallLimit ? overallLimit[0] : (existing?.overall15MinLimit ?? 400);
  const oDayLimit = overallLimit ? overallLimit[1] : (existing?.overallDailyLimit ?? 4000);

  const status: StravaRateLimits = {
    read15MinUsage: r15Usage,
    read15MinLimit: r15Limit,
    readDailyUsage: rDayUsage,
    readDailyLimit: rDayLimit,
    overall15MinUsage: o15Usage,
    overall15MinLimit: o15Limit,
    overallDailyUsage: oDayUsage,
    overallDailyLimit: oDayLimit,
    remaining15MinReads: Math.max(0, r15Limit - r15Usage),
    remainingDailyReads: Math.max(0, rDayLimit - rDayUsage),
    remaining15MinOverall: Math.max(0, o15Limit - o15Usage),
    remainingDailyOverall: Math.max(0, oDayLimit - oDayUsage),
    lastUpdated: Date.now(),
    secondsUntil15MinReset: getSecondsUntilNext15MinWindow(),
  };

  inMemoryRateLimits = status;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STRAVA_RATE_LIMITS_STORAGE_KEY, JSON.stringify(status));
      window.dispatchEvent(new CustomEvent('fit_track_strava_rate_limits', { detail: status }));
    } catch {}
  }

  rateLimitListeners.forEach((fn) => fn(status));
  return status;
}

// --------------------------------------------------------------------------
// API Fetching & Pagination
// --------------------------------------------------------------------------

async function readStravaResponse(response: Response, requestName: string): Promise<unknown> {
  if (response.headers) {
    updateStravaRateLimitsFromHeaders(response.headers);
  }
  const data: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorData = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    throw new Error(
      String(errorData.message || errorData.error || `${requestName} failed (${response.status})`)
    );
  }
  return data;
}

async function fetchStravaApiJson(
  accessToken: string,
  proxyPath: string,
  apiPath: string,
  requestName: string
): Promise<unknown> {
  const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.includes('github.io');
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };

  if (!isGitHubPages) {
    const proxyResponse = await fetch(proxyPath, { method: 'GET', headers }).catch(() => null);
    if (proxyResponse) return readStravaResponse(proxyResponse, requestName);
  }

  const response = await fetch(`https://www.strava.com/api/v3${apiPath}`, {
    method: 'GET',
    headers,
  });
  return readStravaResponse(response, requestName);
}

export async function fetchStravaActivityDetails(
  accessToken: string,
  activityId: number | string
): Promise<StravaActivityDetailsResponse> {
  const id = encodeURIComponent(String(activityId));
  const activity = await fetchStravaApiJson(
    accessToken,
    `/api/strava/activities/${id}`,
    `/activities/${id}`,
    'Strava activity details request'
  );
  if (!activity || typeof activity !== 'object' || Array.isArray(activity)) {
    throw new Error('Invalid activity details response from Strava');
  }

  const result: StravaActivityDetailsResponse = {
    activity: activity as Record<string, unknown>,
  };
  const activityHasLaps =
    Array.isArray(result.activity.laps) && result.activity.laps.length > 0;

  const [streamsResult, lapsResult] = await Promise.allSettled([
    fetchStravaApiJson(
      accessToken,
      `/api/strava/activities/${id}/streams`,
      `/activities/${id}/streams?keys=time,distance,latlng,altitude,velocity_smooth,heartrate,cadence,watts,temp,moving,grade_smooth&key_by_type=true`,
      'Strava activity streams request'
    ),
    activityHasLaps
      ? Promise.resolve(result.activity.laps)
      : fetchStravaApiJson(
          accessToken,
          `/api/strava/activities/${id}/laps`,
          `/activities/${id}/laps`,
          'Strava activity laps request'
        ),
  ]);

  if (streamsResult.status === 'fulfilled') {
    const streams = streamsResult.value;
    if (streams && typeof streams === 'object' && !Array.isArray(streams)) {
      result.streams = streams as Record<string, unknown>;
    } else {
      result.streamsError = 'Invalid activity streams response from Strava';
    }
  } else {
    result.streamsError =
      streamsResult.reason instanceof Error
        ? streamsResult.reason.message
        : 'Could not fetch activity streams';
  }

  if (lapsResult.status === 'fulfilled') {
    const laps = lapsResult.value;
    if (Array.isArray(laps)) {
      result.activity = {
        ...result.activity,
        laps: laps.length > 0 ? laps : result.activity.laps,
      };
    } else {
      result.lapsError = 'Invalid activity laps response from Strava';
    }
  } else if (!Array.isArray(result.activity.laps)) {
    result.lapsError =
      lapsResult.reason instanceof Error
        ? lapsResult.reason.message
        : 'Could not fetch activity laps';
  }

  return result;
}

/**
 * Merge new activities into existing cached list without duplicates, maintaining reverse chronological order
 */
export function mergeStravaActivities(existing: StravaActivity[], incoming: StravaActivity[]): StravaActivity[] {
  const deletedIds = getDeletedActivityIds();
  const map = new Map<string, StravaActivity>();

  // Existing loaded first
  for (const act of existing) {
    const isDel = deletedIds.has(String(act.id)) || Boolean(act.isDeleted);
    map.set(String(act.id), {
      ...act,
      isDeleted: isDel,
      gear_id: act.gear_id ?? (act as any).gear?.id ?? null,
      hide_from_home: act.hide_from_home ?? (act as any).muted ?? false,
      muted: act.muted ?? act.hide_from_home ?? false,
    });
  }

  // Incoming merged (updates existing or adds new)
  for (const act of incoming) {
    const prev = map.get(String(act.id));
    const isDel = deletedIds.has(String(act.id)) || Boolean(prev?.isDeleted);
    const hasExplicitIncomingMute =
      typeof act.hide_from_home === 'boolean' || typeof act.muted === 'boolean';
    const resolvedMuted = hasExplicitIncomingMute
      ? Boolean(act.hide_from_home || act.muted)
      : Boolean(prev?.hide_from_home || prev?.muted);

    map.set(String(act.id), {
      ...prev,
      ...act,
      isDeleted: isDel,
      gear_id: act.gear_id ?? (act as any).gear?.id ?? prev?.gear_id ?? null,
      hide_from_home: resolvedMuted,
      muted: resolvedMuted,
    });
  }
  // Sort descending by date
  return Array.from(map.values()).sort((a, b) => {
    const timeA = new Date(a.start_date).getTime();
    const timeB = new Date(b.start_date).getTime();
    return timeB - timeA;
  });
}

let isRecheckingMuteStatus = false;

/**
 * Background check for `hide_from_home` (Muted) & deleted status on recent activities.
 * Strava's `GET /athlete/activities` (SummaryActivity) often omits `hide_from_home` and only
 * includes `hide_from_home: boolean` on `GET /activities/{id}` (DetailedActivity).
 * When re-syncing, this checks recent activities via `GET /activities/{id}` (1 read call each,
 * respecting rate limits) so activities muted on Strava after being imported are updated.
 */
export async function recheckRecentActivitiesMuteStatus(
  accessToken: string,
  activities: StravaActivity[],
  maxCheck = 20
): Promise<void> {
  if (isRecheckingMuteStatus || !accessToken) return;
  isRecheckingMuteStatus = true;

  try {
    const candidates = activities
      .filter((a) => {
        if (!a || a.isDeleted) return false;
        const idStr = String(a.id);
        return !idStr.startsWith('demo-') && !idStr.startsWith('local-');
      })
      .slice(0, maxCheck);

    let anyChanged = false;

    for (const act of candidates) {
      const limits = getCachedStravaRateLimits();
      if (limits && limits.read15MinLimit > 0 && limits.read15MinUsage >= limits.read15MinLimit - 35) {
        break;
      }

      const idStr = String(act.id);
      try {
        const detailed = (await fetchStravaApiJson(
          accessToken,
          `/api/strava/activities/${encodeURIComponent(idStr)}`,
          `/activities/${encodeURIComponent(idStr)}`,
          'Strava activity mute check'
        )) as Record<string, any>;

        if (detailed && typeof detailed === 'object' && !Array.isArray(detailed)) {
          const isMuted = Boolean(detailed.hide_from_home || detailed.muted);
          const newKudos =
            typeof detailed.kudos_count === 'number' ? detailed.kudos_count : act.kudos_count;

          // Update IndexedDB details record if present
          const existingRec = await getCachedStravaActivityRecord(idStr);
          if (existingRec) {
            const prevRecMuted = Boolean(
              (existingRec.activity as any)?.hide_from_home ||
                (existingRec.activity as any)?.muted
            );
            if (prevRecMuted !== isMuted) {
              await updateStravaActivityRecord(idStr, (rec) => ({
                ...rec,
                activity: {
                  ...(rec.activity || {}),
                  ...detailed,
                  hide_from_home: isMuted,
                  muted: isMuted,
                  laps: (rec.activity as any)?.laps || detailed.laps,
                },
              }));
            }
          }

          if (Boolean(act.hide_from_home || act.muted) !== isMuted || act.kudos_count !== newKudos) {
            anyChanged = true;
            const currentSnap = getCachedStravaActivitiesSnapshot() || [];
            const updatedSnap = currentSnap.map((item) =>
              String(item.id) === idStr
                ? {
                    ...item,
                    hide_from_home: isMuted,
                    muted: isMuted,
                    kudos_count: newKudos,
                  }
                : item
            );
            saveCachedStravaActivities(updatedSnap);
          }
        }
      } catch (err: any) {
        const msg = String(err?.message || err);
        if (/\b404\b|not found/i.test(msg)) {
          markActivityAsDeleted(idStr);
          anyChanged = true;
        } else if (/\b429\b|rate limit|401/i.test(msg)) {
          break;
        }
      }

      await new Promise((r) => setTimeout(r, 650));
    }

    if (anyChanged && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('fit_track_activities_updated', {
          detail: { activities: getCachedStravaActivities() },
        })
      );
    }
  } finally {
    isRecheckingMuteStatus = false;
  }
}

function mapSummaryActivityItem(item: any): StravaActivity {
  const hasExplicitMute =
    typeof item?.hide_from_home === 'boolean' || typeof item?.muted === 'boolean';
  const isMuted = hasExplicitMute ? Boolean(item.hide_from_home || item.muted) : undefined;
  return {
    ...item,
    gear_id: item.gear_id || item.gear?.id || null,
    ...(isMuted !== undefined ? { hide_from_home: isMuted, muted: isMuted } : {}),
  };
}

/**
 * Smart Delta Sync:
 * - When `options.useAfterMostRecent` is true (automatic 1-hour reopen check), uses
 *   `GET /athlete/activities?after=<mostRecentActivityStartEpoch>` to only check for new activities.
 * - When `options.useAfterMostRecent` is false/omitted (manual Sync button), fetches the latest 200
 *   activities so muted status, kudos, renames, and deleted activities are refreshed across existing items.
 */
export async function syncStravaActivitiesDelta(
  accessToken: string,
  customPerPage?: number,
  options?: { useAfterMostRecent?: boolean }
): Promise<StravaActivity[]> {
  const existingActivities = getCachedStravaActivities();
  const useAfter = Boolean(options?.useAfterMostRecent);
  const afterEpochSec = useAfter
    ? getMostRecentStravaActivityStartEpoch(existingActivities)
    : null;

  const perPage =
    customPerPage !== undefined
      ? customPerPage
      : 200;

  const queryParams = new URLSearchParams({
    page: '1',
    per_page: String(perPage),
  });
  if (afterEpochSec && afterEpochSec > 0) {
    queryParams.set('after', String(afterEpochSec));
  }

  const isGitHubPages =
    typeof window !== 'undefined' && window.location.hostname.includes('github.io');

  let incoming: StravaActivity[] = [];
  let fetchedSuccessfully = false;

  if (!isGitHubPages) {
    try {
      const res = await fetch(`/api/strava/activities?${queryParams.toString()}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });

      if (res.headers) {
        updateStravaRateLimitsFromHeaders(res.headers);
      }

      if (res.status === 401) {
        throw new Error('Strava Authorization Error (401): access token expired');
      }

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          fetchedSuccessfully = true;
          incoming = data.map(mapSummaryActivityItem);
        }
      }
    } catch (err) {
      if (err instanceof Error && /401|authorization|unauthorized/i.test(err.message)) {
        throw err;
      }
      // Fall through to direct Strava call
    }
  }

  if (!fetchedSuccessfully) {
    const stravaRes = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?${queryParams.toString()}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    if (stravaRes.headers) {
      updateStravaRateLimitsFromHeaders(stravaRes.headers);
    }

    const data = await stravaRes.json();
    if (!stravaRes.ok) {
      throw new Error(
        data.message || data.error || `Strava activities request failed (${stravaRes.status})`
      );
    }
    if (Array.isArray(data)) {
      fetchedSuccessfully = true;
      incoming = data.map(mapSummaryActivityItem);
    }
  }

  // Detect brand-new activities that weren't previously in our local cache
  const existingIdSet = new Set(existingActivities.map((a) => String(a.id)));
  const newlyDiscovered = incoming.filter((a) => !existingIdSet.has(String(a.id)));
  if (newlyDiscovered.length > 0) {
    const existingNewIds = getCachedStravaNewActivityIds();
    const combinedNewIds = Array.from(
      new Set([...newlyDiscovered.map((a) => String(a.id)), ...existingNewIds])
    );
    saveCachedStravaNewActivityIds(combinedNewIds);
  }

  // Auto-apply configured activity rename rules and sync corrected names to Strava
  if (incoming.length > 0) {
    try {
      const renameRes = await processActivitiesWithRenameRules(incoming, accessToken, {
        syncToStrava: true,
      });
      incoming = renameRes.updatedActivities;
    } catch (e) {
      console.warn('Could not auto-rename incoming Strava activities:', e);
    }
  }

  // Only run contiguous-page missing/deleted detection when `after` was NOT used
  if (!afterEpochSec && incoming.length > 0) {
    const incomingIdSet = new Set(incoming.map((a) => String(a.id)));
    const twoWeeksAgoMs = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const incomingTimestamps = incoming
      .map((a) => (a.start_date ? new Date(a.start_date).getTime() : NaN))
      .filter((t) => !isNaN(t));
    const oldestIncomingMs =
      incomingTimestamps.length > 0 ? Math.min(...incomingTimestamps) : twoWeeksAgoMs;

    const deletedIds = getDeletedActivityIds();
    let foundMissing = false;

    for (const prevAct of existingActivities) {
      if (!prevAct.start_date) continue;
      const prevIdStr = String(prevAct.id);
      if (prevIdStr.startsWith('demo-') || prevIdStr.startsWith('local-')) continue;
      const t = new Date(prevAct.start_date).getTime();
      if (!isNaN(t) && t >= oldestIncomingMs) {
        if (!incomingIdSet.has(prevIdStr)) {
          prevAct.isDeleted = true;
          deletedIds.add(prevIdStr);
          foundMissing = true;
        }
      }
    }

    if (foundMissing && typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          STRAVA_DELETED_ACTIVITY_IDS_KEY,
          JSON.stringify(Array.from(deletedIds))
        );
      } catch {}
    }
  }

  const merged = mergeStravaActivities(existingActivities, incoming);
  const finalCleaned = applyRenameRulesToActivities(merged);
  saveCachedStravaActivities(finalCleaned);
  setLastStravaRefreshTime(Date.now());

  // On manual re-sync (or when re-checking recent activities), inspect recent activities'
  // DetailedActivity endpoint in background so any activity muted on Strava after import is updated
  if (!useAfter && finalCleaned.length > 0) {
    void recheckRecentActivitiesMuteStatus(accessToken, finalCleaned, 20);
  }

  return finalCleaned;
}

/**
 * Fetch Older Historical Activities using Strava's `before` epoch parameter:
 * - Queries activities strictly prior to the earliest date currently in cache.
 * - Requests 200 activities per batch.
 * - Appends to the bottom of the list and saves to cache.
 */
export async function fetchOlderStravaActivities(
  accessToken: string,
  oldestEpochSeconds: number,
  perPage = 200
): Promise<{ activities: StravaActivity[]; hasMore: boolean; newCount: number }> {
  const existingActivities = getCachedStravaActivities();
  const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.includes('github.io');

  let olderData: StravaActivity[] = [];

  if (!isGitHubPages) {
    try {
      const res = await fetch(`/api/strava/activities?before=${oldestEpochSeconds}&per_page=${perPage}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });

      if (res.headers) {
        updateStravaRateLimitsFromHeaders(res.headers);
      }

      if (res.status === 401) {
        throw new Error('Strava Authorization Error (401): access token expired');
      }

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          olderData = data.map(mapSummaryActivityItem);
        }
      }
    } catch (err) {
      if (err instanceof Error && /401|authorization|unauthorized/i.test(err.message)) {
        throw err;
      }
      // Fall through
    }
  }

  if (olderData.length === 0) {
    const stravaRes = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?before=${oldestEpochSeconds}&per_page=${perPage}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    );

    if (stravaRes.headers) {
      updateStravaRateLimitsFromHeaders(stravaRes.headers);
    }

    const data = await stravaRes.json();
    if (!stravaRes.ok) {
      throw new Error(data.message || data.error || `Failed to fetch older activities (${stravaRes.status})`);
    }
    if (Array.isArray(data)) {
      olderData = data.map(mapSummaryActivityItem);
    }
  }

  if (olderData.length > 0) {
    try {
      const renameRes = await processActivitiesWithRenameRules(olderData, accessToken, { syncToStrava: false });
      olderData = renameRes.updatedActivities;
    } catch (e) {
      console.warn('Could not auto-rename older Strava activities:', e);
    }
  }

  const merged = mergeStravaActivities(existingActivities, olderData);
  const finalCleaned = applyRenameRulesToActivities(merged);
  saveCachedStravaActivities(finalCleaned);

  return {
    activities: finalCleaned,
    hasMore: olderData.length >= perPage,
    newCount: olderData.length,
  };
}

export async function fetchStravaAthleteActivities(
  accessToken: string,
  page = 1,
  perPage = 50
): Promise<StravaActivity[]> {
  return syncStravaActivitiesDelta(accessToken);
}

export interface StravaStreamDefinition {
  key: string;
  label: string;
  unit: string;
  description: string;
}

export const STRAVA_STREAM_DEFINITIONS: StravaStreamDefinition[] = [
  { key: 'cadence', label: 'Cadence', unit: 'spm / rpm', description: 'Run step rate, bike pedaling cadence, or swim stroke rate' },
  { key: 'heartrate', label: 'Heart Rate', unit: 'bpm', description: 'Optical or chest-strap heart rate telemetry' },
  { key: 'velocity_smooth', label: 'Pace / Speed', unit: 'm/s', description: 'Smoothed velocity stream used for pace & speed charts' },
  { key: 'distance', label: 'Distance', unit: 'm', description: 'Cumulative distance progression stream' },
  { key: 'time', label: 'Time', unit: 's', description: 'Elapsed timestamp offsets from activity start' },
  { key: 'altitude', label: 'Elevation', unit: 'm', description: 'Barometric or GPS altitude profile' },
  { key: 'watts', label: 'Power', unit: 'W', description: 'Cycling or running power meter output' },
  { key: 'grade_smooth', label: 'Grade', unit: '%', description: 'Smoothed terrain gradient for GAP calculations' },
  { key: 'latlng', label: 'GPS Route', unit: 'lat/lng', description: 'Latitude & longitude coordinate pairs' },
  { key: 'temp', label: 'Temperature', unit: '°C', description: 'Ambient device temperature stream' },
  { key: 'moving', label: 'Moving Flag', unit: 'bool', description: 'Active movement vs paused/stopped state' },
];

/**
 * Detects whether a numeric stream (such as `cadence`) has been corrupted by a repeating
 * lap-slice artifact (where the first lap's series `[0..P-1]` was repeated identically across multiple laps).
 */
export function hasRepeatingStreamArtifact(series: unknown): boolean {
  if (!Array.isArray(series) || series.length < 300) return false;
  const nums = series.map((v) => Number(v) || 0);
  const windowSize = 35;
  const firstWindow = nums.slice(0, windowSize);
  const minVal = Math.min(...firstWindow);
  const maxVal = Math.max(...firstWindow);
  // If flat/constant, it is not a sawtooth artifact
  if (maxVal - minVal < 2) return false;

  const maxPeriod = Math.min(900, Math.floor(nums.length / 3));
  for (let p = 60; p <= maxPeriod; p++) {
    let matches = true;
    for (let k = 0; k < windowSize; k++) {
      if (nums[k] !== nums[p + k] || nums[k] !== nums[2 * p + k]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

/**
 * Builds a clean, realistic cadence series aligned to `targetTimeData` (or 120 points)
 * without artificial repeating sawtooth jumps.
 */
export function buildSmoothCadenceStreamForActivity(
  activity: StravaActivity,
  targetTimeData?: number[],
  existingCadenceData?: number[]
): number[] {
  const { category, subType } = classifyActivity(activity);
  const isRun = category === 'Run';
  const isTreadmill =
    subType === 'Treadmill Run' ||
    Boolean(activity.trainer) ||
    /treadmill|indoor run/i.test(activity.name || '');

  let baseCad = Number(activity.average_cadence) || 0;
  if (baseCad <= 0 && Array.isArray(existingCadenceData) && existingCadenceData.length > 0) {
    const valid = existingCadenceData.map(Number).filter((v) => Number.isFinite(v) && v > 0);
    if (valid.length > 0) {
      baseCad = valid.reduce((a, b) => a + b, 0) / valid.length;
    }
  }
  if (baseCad <= 0) {
    baseCad = isRun ? 166 : category === 'Swim' ? 28 : 85;
  }
  if (isRun && baseCad < 110) {
    baseCad = baseCad * 2;
  }

  const len = Array.isArray(targetTimeData) && targetTimeData.length >= 2 ? targetTimeData.length : 120;
  const totalTimeSec =
    Array.isArray(targetTimeData) && targetTimeData.length >= 2
      ? Math.max(1, (Number(targetTimeData[targetTimeData.length - 1]) || len) - (Number(targetTimeData[0]) || 0))
      : Math.max(60, activity.moving_time || 1800);

  const idStr = String(activity.id);
  let seed = 0;
  for (let i = 0; i < idStr.length; i++) {
    seed = (seed * 31 + idStr.charCodeAt(i)) | 0;
  }
  const phase = (Math.abs(seed % 1000) / 1000) * Math.PI * 2;

  const out = new Array<number>(len);
  for (let i = 0; i < len; i++) {
    const tSec =
      Array.isArray(targetTimeData) && targetTimeData.length === len
        ? Math.max(0, (Number(targetTimeData[i]) || 0) - (Number(targetTimeData[0]) || 0))
        : (i / Math.max(1, len - 1)) * totalTimeSec;
    const fraction = Math.max(0, Math.min(1, tSec / totalTimeSec));

    if (isTreadmill) {
      const warmupOffset = fraction < 0.05 ? -2 * (1 - fraction / 0.05) : 0;
      const gentleDrift = Math.sin(fraction * Math.PI * 1.5 + phase) * 0.8 + Math.cos(fraction * Math.PI * 3 + phase) * 0.4;
      out[i] = Math.max(120, Math.round(baseCad + warmupOffset + gentleDrift));
    } else if (isRun) {
      const warmupOffset = fraction < 0.05 ? -2 * (1 - fraction / 0.05) : 0;
      const gentleWave = Math.sin(fraction * Math.PI * 2.5 + phase) * 1.4 + Math.cos(fraction * Math.PI * 5 + phase) * 0.6;
      out[i] = Math.max(120, Math.round(baseCad + warmupOffset + gentleWave));
    } else if (category === 'Swim') {
      const gentleWave = Math.sin(fraction * Math.PI * 2 + phase) * 1.0;
      out[i] = Math.max(15, Math.round(baseCad + gentleWave));
    } else {
      const gentleWave = Math.sin(fraction * Math.PI * 3 + phase) * 2.5 + Math.cos(fraction * Math.PI * 6 + phase) * 1.2;
      out[i] = Math.max(45, Math.round(baseCad + gentleWave));
    }
  }
  return out;
}

/**
 * Resamples a numeric or tuple stream from `sourceTime` onto `targetTime` so re-fetched Strava streams
 * align seamlessly with existing calibrated time/distance streams.
 */
function resampleStreamToTargetTime(
  sourceData: any[],
  sourceTime: number[] | undefined,
  targetTime: number[]
): any[] {
  if (!Array.isArray(sourceData) || sourceData.length === 0) return sourceData;
  if (sourceData.length === targetTime.length) return sourceData;

  const tTarget0 = Number(targetTime[0]) || 0;
  const tTargetMax = Math.max(1, (Number(targetTime[targetTime.length - 1]) || targetTime.length) - tTarget0);

  if (Array.isArray(sourceTime) && sourceTime.length === sourceData.length && sourceTime.length >= 2) {
    const tSource0 = Number(sourceTime[0]) || 0;
    const result = new Array(targetTime.length);
    let ptr = 0;
    const lastIdx = sourceTime.length - 1;

    for (let i = 0; i < targetTime.length; i++) {
      const relT = (Number(targetTime[i]) || 0) - tTarget0;
      const targetAbs = tSource0 + relT;
      while (ptr < lastIdx && (Number(sourceTime[ptr + 1]) || 0) <= targetAbs) {
        ptr++;
      }
      const nextPtr = Math.min(lastIdx, ptr + 1);
      const vA = sourceData[ptr];
      const vB = sourceData[nextPtr];
      if (typeof vA === 'number' && typeof vB === 'number') {
        const tA = Number(sourceTime[ptr]) || 0;
        const tB = Number(sourceTime[nextPtr]) || tA;
        const frac = tB > tA ? Math.max(0, Math.min(1, (targetAbs - tA) / (tB - tA))) : 0;
        result[i] = Math.round((vA + (vB - vA) * frac) * 100) / 100;
      } else {
        result[i] = vA;
      }
    }
    return result;
  }

  // Fallback index-proportional mapping
  return targetTime.map((t, idx) => {
    const rel = tTargetMax > 0 ? ((Number(t) || idx) - tTarget0) / tTargetMax : idx / Math.max(1, targetTime.length - 1);
    const srcIdx = Math.max(0, Math.min(sourceData.length - 1, Math.round(rel * (sourceData.length - 1))));
    return sourceData[srcIdx];
  });
}

/**
 * Re-fetches specific stream keys (e.g. `['cadence']`) from the Strava API for an activity,
 * merges them into the cached IndexedDB record without losing calibrated distance/speed,
 * and updates split/lap cadence & heart rate metrics.
 */
export async function fetchSpecificStravaActivityStreams(options: {
  accessToken?: string | null;
  activity: StravaActivity;
  existingRecord?: StravaActivityDetailsRecord | null;
  streamKeys: string[];
}): Promise<{
  record: StravaActivityDetailsRecord;
  updatedKeys: string[];
  source: 'strava' | 'local';
}> {
  const { accessToken, activity, existingRecord, streamKeys } = options;
  const cleanKeys = Array.from(new Set(streamKeys.map((k) => k.trim()).filter(Boolean)));
  if (cleanKeys.length === 0) {
    const fallbackRec = existingRecord || (await ensureStravaActivityRecord(activity.id));
    return { record: fallbackRec, updatedKeys: [], source: 'local' };
  }

  const idStr = String(activity.id);
  const isDemoOrLocal = idStr.startsWith('demo-') || idStr.startsWith('local-');
  const candidateStravaIds: string[] = [];
  if (!isDemoOrLocal && /^\d+$/.test(idStr)) {
    candidateStravaIds.push(idStr);
  }
  const replacesId = existingRecord?.calibration?.replacesActivityId;
  if (replacesId && /^\d+$/.test(String(replacesId)) && !candidateStravaIds.includes(String(replacesId))) {
    candidateStravaIds.push(String(replacesId));
  }

  let fetchedFromStrava: Record<string, any> | null = null;
  if (accessToken && candidateStravaIds.length > 0) {
    const queryKeys = Array.from(new Set([...cleanKeys, 'time'])).join(',');
    for (const candidateId of candidateStravaIds) {
      try {
        const encodedId = encodeURIComponent(candidateId);
        const rawStreams = await fetchStravaApiJson(
          accessToken,
          `/api/strava/activities/${encodedId}/streams?keys=${encodeURIComponent(queryKeys)}`,
          `/activities/${encodedId}/streams?keys=${encodeURIComponent(queryKeys)}&key_by_type=true`,
          'Strava specific streams request'
        );
        if (rawStreams && typeof rawStreams === 'object' && !Array.isArray(rawStreams)) {
          const obj = rawStreams as Record<string, any>;
          const hasRequestedKey = cleanKeys.some((k) => Array.isArray(obj[k]?.data) && obj[k].data.length > 0);
          if (hasRequestedKey) {
            fetchedFromStrava = obj;
            break;
          }
        }
      } catch (err) {
        console.warn(`[Strava Streams] Could not fetch keys (${queryKeys}) from activity ${candidateId}:`, err);
      }
    }
  }

  const updatedKeys: string[] = [];
  let source: 'strava' | 'local' = fetchedFromStrava ? 'strava' : 'local';

  const updatedRecord = await updateStravaActivityRecord(activity.id, (record) => {
    const currentStreams = { ...((record.streams || {}) as Record<string, any>) };
    const currentActivity = { ...((record.activity || {}) as Record<string, any>) };
    const localTimeData = Array.isArray(currentStreams.time?.data)
      ? (currentStreams.time.data as number[])
      : undefined;
    const calibratedDurSec =
      record.calibration?.calibratedMovingTimeSec ??
      Number(currentActivity.moving_time) ??
      activity.moving_time ??
      0;

    if (fetchedFromStrava) {
      let sourceTimeData = Array.isArray(fetchedFromStrava.time?.data)
        ? (fetchedFromStrava.time.data as number[])
        : undefined;

      // If activity was cropped to a shorter calibratedMovingTimeSec, crop fetched streams to calibratedDurSec first
      let cutoffCount: number | null = null;
      if (sourceTimeData && sourceTimeData.length >= 2 && calibratedDurSec > 0) {
        const t0 = Number(sourceTimeData[0]) || 0;
        const maxT = (Number(sourceTimeData[sourceTimeData.length - 1]) || 0) - t0;
        if (calibratedDurSec < maxT) {
          let count = 0;
          for (let i = 0; i < sourceTimeData.length; i++) {
            if ((Number(sourceTimeData[i]) || 0) - t0 <= calibratedDurSec) {
              count = i + 1;
            } else {
              break;
            }
          }
          cutoffCount = Math.max(2, count);
          sourceTimeData = sourceTimeData.slice(0, cutoffCount);
        }
      }

      const replacingTime = cleanKeys.includes('time') && Array.isArray(fetchedFromStrava.time?.data);
      const effectiveTargetTime = replacingTime
        ? sourceTimeData
        : localTimeData && localTimeData.length >= 2
          ? localTimeData
          : sourceTimeData;

      for (const key of cleanKeys) {
        const incomingStream = fetchedFromStrava[key];
        if (incomingStream && Array.isArray(incomingStream.data) && incomingStream.data.length > 0) {
          let rawArr = cutoffCount !== null ? incomingStream.data.slice(0, cutoffCount) : [...incomingStream.data];
          if (
            key !== 'time' &&
            effectiveTargetTime &&
            effectiveTargetTime.length >= 2 &&
            rawArr.length !== effectiveTargetTime.length
          ) {
            rawArr = resampleStreamToTargetTime(rawArr, sourceTimeData, effectiveTargetTime);
          }
          currentStreams[key] = {
            ...incomingStream,
            data: rawArr,
            original_size: rawArr.length,
          };
          updatedKeys.push(key);
        } else if (key === 'cadence' && hasRepeatingStreamArtifact(currentStreams.cadence?.data)) {
          // If Strava didn't return a separate cadence stream (e.g. overwritten FIT), repair the repeating artifact
          const repaired = buildSmoothCadenceStreamForActivity(activity, localTimeData, currentStreams.cadence?.data);
          currentStreams.cadence = {
            ...(currentStreams.cadence || { series_type: 'distance', resolution: 'high' }),
            data: repaired,
            original_size: repaired.length,
          };
          updatedKeys.push('cadence');
          source = 'local';
        }
      }

      if (!currentStreams.time && sourceTimeData && sourceTimeData.length > 0) {
        currentStreams.time = {
          data: sourceTimeData,
          series_type: 'time',
          original_size: sourceTimeData.length,
          resolution: 'high',
        };
      }
    } else {
      // Demo mode or offline fallback: regenerate requested stream(s) cleanly
      for (const key of cleanKeys) {
        if (key === 'cadence') {
          const smoothCad = buildSmoothCadenceStreamForActivity(activity, localTimeData, currentStreams.cadence?.data);
          currentStreams.cadence = {
            ...(currentStreams.cadence || { series_type: 'distance', resolution: 'high' }),
            data: smoothCad,
            original_size: smoothCad.length,
          };
          updatedKeys.push('cadence');
        }
      }
    }

    // Recompute split and lap cadence / HR if cadence or heartrate stream was updated
    if (updatedKeys.includes('cadence') || updatedKeys.includes('heartrate')) {
      const { category } = classifyActivity(activity);
      const effDistM =
        record.calibration?.calibratedDistanceM ?? Number(currentActivity.distance) ?? activity.distance ?? 0;
      const effMovSec =
        record.calibration?.calibratedMovingTimeSec ?? Number(currentActivity.moving_time) ?? activity.moving_time ?? 0;

      if (effDistM > 0 && effMovSec > 0 && (category === 'Run' || category === 'Bike')) {
        const tempAct: StravaActivity = {
          ...activity,
          distance: effDistM,
          moving_time: effMovSec,
        };
        const tempRec: StravaActivityDetailsRecord = {
          ...record,
          streams: currentStreams,
          activity: {
            ...currentActivity,
            splits_metric: undefined,
          },
        };
        const chunks1km = generateAutoSplitsFromStreamsOrActivity(tempAct, tempRec, 1000);
        if (chunks1km.length > 0) {
          currentActivity.splits_metric = chunks1km.map((chunk) => ({
            distance: chunk.distanceM,
            elapsed_time: chunk.movingTimeSec,
            moving_time: chunk.movingTimeSec,
            elevation_difference: chunk.elevationDiffM ?? 0,
            split: chunk.splitIndex,
            average_speed: Number(chunk.avgSpeedMps.toFixed(3)),
            average_heartrate: chunk.avgHr,
            average_cadence: chunk.avgCadence,
            pace_zone: 0,
          }));
        }

        // Also update average_cadence on existing laps
        if (Array.isArray(currentActivity.laps) && currentActivity.laps.length > 0) {
          const cadData = Array.isArray(currentStreams.cadence?.data)
            ? (currentStreams.cadence.data as number[])
            : undefined;
          const timeData = Array.isArray(currentStreams.time?.data)
            ? (currentStreams.time.data as number[])
            : undefined;
          if (cadData && cadData.length > 0) {
            let cumSec = 0;
            currentActivity.laps = currentActivity.laps.map((lap: any) => {
              const lDur = Math.max(1, Number(lap?.moving_time || lap?.elapsed_time) || 1);
              const startSec = cumSec;
              const endSec = cumSec + lDur;
              cumSec = endSec;

              let slice: number[] = [];
              if (timeData && timeData.length === cadData.length) {
                const t0 = Number(timeData[0]) || 0;
                for (let i = 0; i < timeData.length; i++) {
                  const relT = (Number(timeData[i]) || 0) - t0;
                  if (relT >= startSec && relT <= endSec) {
                    const c = Number(cadData[i]);
                    if (Number.isFinite(c) && c > 0) slice.push(c);
                  }
                }
              } else {
                const i0 = Math.floor((startSec / Math.max(1, effMovSec)) * cadData.length);
                const i1 = Math.max(i0 + 1, Math.ceil((endSec / Math.max(1, effMovSec)) * cadData.length));
                slice = cadData
                  .slice(i0, i1)
                  .map(Number)
                  .filter((c) => Number.isFinite(c) && c > 0);
              }
              if (slice.length > 0) {
                const avgC = slice.reduce((a, b) => a + b, 0) / slice.length;
                return {
                  ...lap,
                  average_cadence: Math.round(avgC),
                };
              }
              return lap;
            });
          }
        }
      }
    }

    return {
      ...record,
      streams: currentStreams,
      activity: currentActivity,
      streamsError: undefined,
      noStreamsAvailable: Object.keys(currentStreams).length === 0,
    };
  });

  return {
    record: updatedRecord,
    updatedKeys,
    source,
  };
}

