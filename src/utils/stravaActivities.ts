import { processActivitiesWithRenameRules, applyRenameRulesToActivities } from './activityRenameRules';

export interface StravaActivity {
  id: number | string;
  name: string;
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
  average_cadence?: number;
  calories?: number;
  suffer_score?: number;
  isDeleted?: boolean;
}

export interface CalibratedSwimLap {
  lapIndex: number;
  distanceM: number;
  movingTimeSec: number;
  pacePer100mFormatted: string;
  isIgnored?: boolean;
  isRest?: boolean;
}

export interface CalibratedRunSection {
  id: string;
  name: string;
  durationSec: number;
  speedKph: number;
  paceMinSec?: string;
  distanceM?: number;
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
  calibration?: ActivityCalibration;
  effortFeedback?: ActivityEffortFeedback;
  fetchedAt?: string;
  analysedAt?: string;
  googleDrivePublishedAt?: string;
}

import type { AthleteProfile } from '../types/athlete';
import { formatSecondsToMinSec } from '../types/athlete';

export interface StravaActivityDetailsResponse {
  activity: Record<string, unknown>;
  streams?: Record<string, unknown>;
  streamsError?: string;
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
    String(act.id) === idStr ? { ...act, isDeleted: true } : act
  );
  saveCachedStravaActivities(updated);
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
  if (deletedIds.size === 0) return withRules;
  return withRules.map((act) => ({
    ...act,
    isDeleted: deletedIds.has(String(act.id)) || Boolean(act.isDeleted),
  }));
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

  // 1. Swim Family
  if (matches('OpenWaterSwim')) {
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
  if (isVirtualRun || (isRunBase && isTrainer)) {
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
  laps?: Array<{
    lapIndex: number;
    distanceM: number;
    movingTimeSec: number;
    pacePer100mFormatted: string;
    isIgnored?: boolean;
    isRest?: boolean;
  }>;
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
 * Calculates Swim pace per 100m using moving laps if available, falling back to overall moving time / distance.
 * Fully supports user-calibrated laps and ignored laps from inaccurate watches.
 */
export function getSwimPaceDetails(
  activity: StravaActivity,
  details?: StravaActivityDetailsRecord
): SwimPaceDetails | null {
  const { category } = classifyActivity(activity);
  if (category !== 'Swim') return null;

  // 1. If user calibrated laps exist, prioritize them!
  const calibratedLaps = details?.calibration?.calibratedLaps;
  if (calibratedLaps && calibratedLaps.length > 0) {
    const activeLaps = calibratedLaps.filter(
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

    return {
      pacePer100mFormatted: paceFormatted,
      paceSecondsPer100m: secPer100m,
      totalDistanceM: Math.round(totalDist),
      movingTimeSec: Math.round(totalMovingTime),
      laps: calibratedLaps.map((lap) => {
        const isRest = Boolean(lap.isRest || lap.distanceM <= 0);
        return {
          lapIndex: lap.lapIndex,
          distanceM: lap.distanceM,
          movingTimeSec: lap.movingTimeSec,
          pacePer100mFormatted: isRest ? '' : lap.pacePer100mFormatted,
          isIgnored: Boolean(lap.isIgnored),
          isRest,
        };
      }),
    };
  }

  // 2. Otherwise extract raw laps from Strava activity
  const rawLaps = (details?.activity?.laps as any[]) || [];
  if (rawLaps.length > 0) {
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
      return {
        lapIndex: idx + 1,
        distanceM: dist,
        movingTimeSec: time,
        pacePer100mFormatted: paceFormatted,
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

      return {
        pacePer100mFormatted: paceFormatted,
        paceSecondsPer100m: secPer100m,
        totalDistanceM: Math.round(totalDist),
        movingTimeSec: Math.round(totalMovingTime),
        laps: processedLaps,
      };
    }
  }

  // Fallback to total activity metrics if no lap breakdown
  const fallbackDist = details?.calibration?.calibratedDistanceM ?? activity.distance ?? 0;
  const fallbackTime = details?.calibration?.calibratedMovingTimeSec ?? activity.moving_time ?? activity.elapsed_time ?? 0;
  if (fallbackDist <= 0 || fallbackTime <= 0) return null;

  const secPer100m = (fallbackTime / fallbackDist) * 100;
  const mins = Math.floor(secPer100m / 60);
  const secs = Math.round(secPer100m % 60);
  return {
    pacePer100mFormatted: `${mins}:${secs.toString().padStart(2, '0')}/100m`,
    paceSecondsPer100m: secPer100m,
    totalDistanceM: Math.round(fallbackDist),
    movingTimeSec: Math.round(fallbackTime),
  };
}

export interface RunSplitItem {
  splitIndex: number;
  distanceKm: string;
  movingTimeSec: number;
  paceFormatted: string;
  avgHr?: number;
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

  let avgCadence = (details?.activity?.average_cadence as number) || activity.average_cadence;
  if (avgCadence && avgCadence < 110) {
    avgCadence = Math.round(avgCadence * 2);
  } else if (avgCadence) {
    avgCadence = Math.round(avgCadence);
  }

  const rawSplits = (details?.activity?.splits_metric as any[]) || [];
  const splits: RunSplitItem[] = [];

  if (rawSplits.length > 0) {
    for (let i = 0; i < rawSplits.length; i++) {
      const s = rawSplits[i];
      const sDist = s.distance || 1000;
      const sTime = s.moving_time || s.elapsed_time || 0;
      const sSecPerKm = sDist > 0 ? sTime / (sDist / 1000) : secPerKm;
      const sm = Math.floor(sSecPerKm / 60);
      const ss = Math.round(sSecPerKm % 60);
      splits.push({
        splitIndex: s.split || i + 1,
        distanceKm: (sDist / 1000).toFixed(2),
        movingTimeSec: sTime,
        paceFormatted: `${sm}:${ss.toString().padStart(2, '0')}/km`,
        avgHr: s.average_heartrate ? Math.round(s.average_heartrate) : undefined,
        elevationDiffM: s.elevation_difference !== undefined ? Math.round(s.elevation_difference) : undefined,
        isFasterThanAvg: sSecPerKm < secPerKm,
      });
    }
  } else {
    const totalKm = distanceM / 1000;
    const fullKmCount = Math.floor(totalKm);
    const remainderKm = totalKm - fullKmCount;
    const avgSecPerSplit = movingTimeSec / totalKm;

    for (let k = 1; k <= fullKmCount; k++) {
      const sm = Math.floor(avgSecPerSplit / 60);
      const ss = Math.round(avgSecPerSplit % 60);
      splits.push({
        splitIndex: k,
        distanceKm: '1.00',
        movingTimeSec: Math.round(avgSecPerSplit),
        paceFormatted: `${sm}:${ss.toString().padStart(2, '0')}/km`,
        avgHr: activity.average_heartrate ? Math.round(activity.average_heartrate) : undefined,
        isFasterThanAvg: false,
      });
    }
    if (remainderKm >= 0.05) {
      const remTime = Math.round(remainderKm * avgSecPerSplit);
      const sm = Math.floor(avgSecPerSplit / 60);
      const ss = Math.round(avgSecPerSplit % 60);
      splits.push({
        splitIndex: fullKmCount + 1,
        distanceKm: remainderKm.toFixed(2),
        movingTimeSec: remTime,
        paceFormatted: `${sm}:${ss.toString().padStart(2, '0')}/km`,
        avgHr: activity.average_heartrate ? Math.round(activity.average_heartrate) : undefined,
        isFasterThanAvg: false,
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
  const streams = details?.streams as Record<string, { data?: any[] }> | undefined;
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

  const elevGain = activity.total_elevation_gain ? Math.round(activity.total_elevation_gain) : 0;
  let gapFormatted: string | undefined;
  if (elevGain > 10 && distanceM > 0) {
    const grade = (elevGain / distanceM) * 100;
    const gapSec = Math.max(120, secPerKm * (1 - grade * 0.035));
    const gm = Math.floor(gapSec / 60);
    const gs = Math.round(gapSec % 60);
    gapFormatted = `${gm}:${gs.toString().padStart(2, '0')}/km`;
  }

  return {
    splits,
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

  const avgCadence = (details?.activity?.average_cadence as number) || activity.average_cadence;
  const maxCadence = (details?.activity?.max_cadence as number) || (activity as any).max_cadence;

  const rawLaps = (details?.activity?.laps as any[]) || [];
  const rawSplits = (details?.activity?.splits_metric as any[]) || [];
  const laps: BikeLapItem[] = [];

  if (rawLaps.length > 0) {
    for (let i = 0; i < rawLaps.length; i++) {
      const lap = rawLaps[i];
      const lDistM = lap.distance || 0;
      const lTimeS = lap.moving_time || lap.elapsed_time || 0;
      const lSpeedKph = lap.average_speed ? (lap.average_speed * 3.6).toFixed(1) : (lDistM > 0 && lTimeS > 0 ? ((lDistM / 1000) / (lTimeS / 3600)).toFixed(1) : '0.0');
      laps.push({
        lapIndex: lap.lap_index || i + 1,
        name: lap.name || `Lap ${i + 1}`,
        distanceKm: (lDistM / 1000).toFixed(2),
        movingTimeSec: lTimeS,
        avgSpeedKph: lSpeedKph,
        avgWatts: lap.average_watts ? Math.round(lap.average_watts) : undefined,
        avgHr: lap.average_heartrate ? Math.round(lap.average_heartrate) : undefined,
        avgCadence: lap.average_cadence ? Math.round(lap.average_cadence) : undefined,
        elevationGainM: lap.total_elevation_gain !== undefined ? Math.round(lap.total_elevation_gain) : undefined,
      });
    }
  } else if (rawSplits.length > 0) {
    for (let i = 0; i < rawSplits.length; i++) {
      const s = rawSplits[i];
      const sDistM = s.distance || 1000;
      const sTimeS = s.moving_time || s.elapsed_time || 0;
      const sSpeedKph = (sDistM > 0 && sTimeS > 0) ? ((sDistM / 1000) / (sTimeS / 3600)).toFixed(1) : '0.0';
      laps.push({
        lapIndex: s.split || i + 1,
        name: `Split ${i + 1}`,
        distanceKm: (sDistM / 1000).toFixed(2),
        movingTimeSec: sTimeS,
        avgSpeedKph: sSpeedKph,
        avgWatts: s.average_watts ? Math.round(s.average_watts) : undefined,
        avgHr: s.average_heartrate ? Math.round(s.average_heartrate) : undefined,
        elevationGainM: s.elevation_difference !== undefined && s.elevation_difference > 0 ? Math.round(s.elevation_difference) : undefined,
      });
    }
  } else {
    const totalDistKm = distanceM / 1000;
    const intervalSize = totalDistKm > 30 ? 10 : totalDistKm > 15 ? 5 : totalDistKm;
    const lapCount = Math.max(1, Math.floor(totalDistKm / (intervalSize || 1)));
    const lapTime = Math.round(movingTimeSec / lapCount);
    for (let k = 1; k <= lapCount; k++) {
      laps.push({
        lapIndex: k,
        name: lapCount === 1 ? 'Full Ride' : `Interval ${k}`,
        distanceKm: (intervalSize).toFixed(2),
        movingTimeSec: lapTime,
        avgSpeedKph,
        avgWatts: avgWatts ? Math.round(avgWatts) : undefined,
        avgHr: activity.average_heartrate ? Math.round(activity.average_heartrate) : undefined,
        avgCadence: avgCadence ? Math.round(avgCadence) : undefined,
      });
    }
  }

  const streams = details?.streams as Record<string, { data?: any[] }> | undefined;
  const wattsData = streams?.watts?.data as number[] | undefined;

  const powerZones: ZoneDistributionItem[] = [
    { zone: 1, name: 'Z1 Active Recovery (<55%)', pct: 0, seconds: 0, color: '#38bdf8' },
    { zone: 2, name: 'Z2 Endurance (56-75%)', pct: 0, seconds: 0, color: '#34d399' },
    { zone: 3, name: 'Z3 Tempo (76-90%)', pct: 0, seconds: 0, color: '#a3e635' },
    { zone: 4, name: 'Z4 Threshold (91-105%)', pct: 0, seconds: 0, color: '#facc15' },
    { zone: 5, name: 'Z5 VO2 Max (106-120%)', pct: 0, seconds: 0, color: '#fb923c' },
    { zone: 6, name: 'Z6 Anaerobic (121-150%)', pct: 0, seconds: 0, color: '#f87171' },
    { zone: 7, name: 'Z7 Neuromuscular (>150%)', pct: 0, seconds: 0, color: '#c084fc' },
  ];

  if (wattsData && wattsData.length > 0) {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (const w of wattsData) {
      const pctFtp = (w / ftp) * 100;
      if (pctFtp < 56) counts[0]++;
      else if (pctFtp < 76) counts[1]++;
      else if (pctFtp < 91) counts[2]++;
      else if (pctFtp < 106) counts[3]++;
      else if (pctFtp < 121) counts[4]++;
      else if (pctFtp < 151) counts[5]++;
      else counts[6]++;
    }
    const total = wattsData.length;
    powerZones.forEach((z, idx) => {
      z.pct = Math.round((counts[idx] / total) * 100);
      z.seconds = Math.round((counts[idx] / total) * movingTimeSec);
    });
  } else if (avgWatts) {
    const ratio = (avgWatts / ftp) * 100;
    if (ratio < 65) {
      powerZones[0].pct = 25; powerZones[1].pct = 65; powerZones[2].pct = 10;
    } else if (ratio < 80) {
      powerZones[0].pct = 15; powerZones[1].pct = 50; powerZones[2].pct = 30; powerZones[3].pct = 5;
    } else if (ratio < 95) {
      powerZones[1].pct = 20; powerZones[2].pct = 40; powerZones[3].pct = 35; powerZones[4].pct = 5;
    } else {
      powerZones[1].pct = 10; powerZones[2].pct = 25; powerZones[3].pct = 40; powerZones[4].pct = 20; powerZones[5].pct = 5;
    }
    powerZones.forEach((z) => {
      z.seconds = Math.round((z.pct / 100) * movingTimeSec);
    });
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
      hrZones[0].pct = 25; hrZones[1].pct = 65; hrZones[2].pct = 10;
    } else if (avgPct < 85) {
      hrZones[1].pct = 25; hrZones[2].pct = 50; hrZones[3].pct = 25;
    } else {
      hrZones[1].pct = 10; hrZones[2].pct = 35; hrZones[3].pct = 40; hrZones[4].pct = 15;
    }
    hrZones.forEach((z) => {
      z.seconds = Math.round((z.pct / 100) * movingTimeSec);
    });
  }

  return {
    laps,
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
        ? (athleteProfile?.swimOpenWaterPace100mSec || 98)
        : (athleteProfile?.swimPoolPace100mSec || 90);

      const avgPace100m = effectiveMovingTimeSec / (effectiveDistanceM / 100);
      if (avgPace100m > 30 && avgPace100m < 600) {
        const ifSwim = thresholdSwimPaceSec / avgPace100m;
        const sTss = ((effectiveMovingTimeSec * Math.pow(ifSwim, 3)) / 3600) * 100;
        const paceLabel = formatSecondsToMinSec(avgPace100m);
        const threshLabel = formatSecondsToMinSec(thresholdSwimPaceSec);
        return {
          tss: Math.round(sTss),
          type: isOpenWater ? 'sTSS (Open Water)' : 'sTSS (Pool)',
          description: `${isOpenWater ? 'Open water' : 'Pool'} pace ${paceLabel}/100m (Threshold ${threshLabel}/100m, IF ${ifSwim.toFixed(2)})`,
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

export function ensureStravaActivityRecord(activityId: number | string): Promise<StravaActivityDetailsRecord> {
  return updateStravaActivityRecord(activityId, (record) => record);
}

export function saveStravaActivityDetails(
  activityId: number | string,
  details: StravaActivityDetailsResponse
): Promise<StravaActivityDetailsRecord> {
  return updateStravaActivityRecord(activityId, (record) => ({
    ...record,
    activity: details.activity,
    ...(details.streams
      ? { streams: details.streams, streamsError: undefined }
      : details.streamsError
        ? { streamsError: details.streamsError }
        : {}),
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

export function clearActivityCalibration(
  activityId: number | string
): Promise<StravaActivityDetailsRecord> {
  return updateStravaActivityRecord(activityId, (record) => {
    const next = { ...record };
    delete next.calibration;
    return next;
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

  try {
    const streams = await fetchStravaApiJson(
      accessToken,
      `/api/strava/activities/${id}/streams`,
      `/activities/${id}/streams?keys=time,distance,latlng,altitude,velocity_smooth,heartrate,cadence,watts,temp,moving,grade_smooth&key_by_type=true`,
      'Strava activity streams request'
    );
    if (!streams || typeof streams !== 'object' || Array.isArray(streams)) {
      throw new Error('Invalid activity streams response from Strava');
    }
    return { activity: activity as Record<string, unknown>, streams: streams as Record<string, unknown> };
  } catch (error) {
    return {
      activity: activity as Record<string, unknown>,
      streamsError: error instanceof Error ? error.message : 'Could not fetch activity streams',
    };
  }
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
    });
  }

  // Incoming merged (updates existing or adds new)
  for (const act of incoming) {
    const prev = map.get(String(act.id));
    const isDel = deletedIds.has(String(act.id)) || Boolean(prev?.isDeleted);
    map.set(String(act.id), {
      ...prev,
      ...act,
      isDeleted: isDel,
      gear_id: act.gear_id ?? (act as any).gear?.id ?? prev?.gear_id ?? null,
    });
  }
  // Sort descending by date
  return Array.from(map.values()).sort((a, b) => {
    const timeA = new Date(a.start_date).getTime();
    const timeB = new Date(b.start_date).getTime();
    return timeB - timeA;
  });
}

/**
 * Smart Delta Sync:
 * - Load up to 200 activities at a time from Strava
 * - Prepend and merge into existing cache; never lose previously fetched historical items!
 */
export async function syncStravaActivitiesDelta(accessToken: string): Promise<StravaActivity[]> {
  const existingActivities = getCachedStravaActivities();
  const perPage = 200;

  const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.includes('github.io');

  let incoming: StravaActivity[] = [];

  if (!isGitHubPages) {
    try {
      const res = await fetch(`/api/strava/activities?page=1&per_page=${perPage}`, {
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
          incoming = data.map((item: any) => ({
            ...item,
            gear_id: item.gear_id || item.gear?.id || null,
          }));
        }
      }
    } catch (err) {
      if (err instanceof Error && /401|authorization|unauthorized/i.test(err.message)) {
        throw err;
      }
      // Fall through
    }
  }

  if (incoming.length === 0) {
    const stravaRes = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?page=1&per_page=${perPage}`,
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
      throw new Error(data.message || data.error || `Strava activities request failed (${stravaRes.status})`);
    }
    if (Array.isArray(data)) {
      incoming = data.map((item: any) => ({
        ...item,
        gear_id: item.gear_id || item.gear?.id || null,
      }));
    }
  }

  // Auto-apply configured activity rename rules and sync corrected names to Strava
  if (incoming.length > 0) {
    try {
      const renameRes = await processActivitiesWithRenameRules(incoming, accessToken, { syncToStrava: true });
      incoming = renameRes.updatedActivities;
    } catch (e) {
      console.warn('Could not auto-rename incoming Strava activities:', e);
    }
  }

  // Check if recent activities (within the last 2 weeks) still exist on Strava.
  // If a previously cached activity from the last 2 weeks is not in the fetched 200 activities,
  // mark it as isDeleted = true to display a red "Deleted" badge without deleting the activity.
  if (incoming.length > 0) {
    const incomingIdSet = new Set(incoming.map((a) => String(a.id)));
    const twoWeeksAgoMs = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const deletedIds = getDeletedActivityIds();
    let foundMissing = false;

    for (const prevAct of existingActivities) {
      if (!prevAct.start_date) continue;
      const t = new Date(prevAct.start_date).getTime();
      if (!isNaN(t) && t >= twoWeeksAgoMs) {
        if (!incomingIdSet.has(String(prevAct.id))) {
          prevAct.isDeleted = true;
          deletedIds.add(String(prevAct.id));
          foundMissing = true;
        }
      }
    }

    if (foundMissing && typeof window !== 'undefined') {
      try {
        localStorage.setItem(STRAVA_DELETED_ACTIVITY_IDS_KEY, JSON.stringify(Array.from(deletedIds)));
      } catch {}
    }
  }

  const merged = mergeStravaActivities(existingActivities, incoming);
  const finalCleaned = applyRenameRulesToActivities(merged);
  saveCachedStravaActivities(finalCleaned);
  setLastStravaRefreshTime(Date.now());
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
          olderData = data.map((item: any) => ({
            ...item,
            gear_id: item.gear_id || item.gear?.id || null,
          }));
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
      olderData = data.map((item: any) => ({
        ...item,
        gear_id: item.gear_id || item.gear?.id || null,
      }));
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
