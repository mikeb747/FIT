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
}

export interface CalibratedSwimLap {
  lapIndex: number;
  distanceM: number;
  movingTimeSec: number;
  pacePer100mFormatted: string;
  isIgnored?: boolean;
  isRest?: boolean;
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
  calibratedAt?: string;
  calibrationNotes?: string;
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

export function isStravaAuthorizationError(error: unknown): boolean {
  return error instanceof Error &&
    /authorization|unauthorized|access token|401/i.test(error.message);
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
  return getCachedStravaActivitiesSnapshot() || [];
}

export function saveCachedStravaActivities(activities: StravaActivity[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STRAVA_ACTIVITIES_CACHE_KEY, JSON.stringify(activities));
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
        } else {
          // Turbo Trainer
          secondaryParts.push(`${avgKph} kph`);
        }

        if (effectiveWatts && effectiveWatts > 0) {
          secondaryParts.push(`${Math.round(effectiveWatts)}W avg`);
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

export interface TSSCalculationResult {
  tss: number;
  type:
    | 'Power TSS'
    | 'rTSS (Outdoor)'
    | 'rTSS (Treadmill)'
    | 'sTSS (Pool)'
    | 'sTSS (Open Water)'
    | 'hrTSS'
    | 'sTSS'
    | 'Relative Effort'
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

  const { category, subType } = classifyActivity(activity);
  const effectiveMovingTimeSec = details?.calibration?.calibratedMovingTimeSec ?? activity.moving_time ?? activity.elapsed_time ?? 0;
  if (effectiveMovingTimeSec <= 60) return null;

  const effectiveDistanceM = details?.calibration?.calibratedDistanceM ?? activity.distance ?? 0;
  const effectiveAvgHr = details?.calibration?.calibratedAvgHeartRate ?? activity.average_heartrate;

  const userFtp = athleteProfile?.bikeFtp || fallbackUserFtp;
  const userLthrRun = athleteProfile?.thresholdHeartRateRun || fallbackUserLthrRun;
  const userLthrBike = athleteProfile?.thresholdHeartRateBike || fallbackUserLthrBike;

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

  // 3. Swimming TSS (sTSS) differentiating Pool vs Open Water
  if (category === 'Swim' && effectiveDistanceM > 50 && effectiveMovingTimeSec > 30) {
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

async function updateStravaActivityRecord(
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
// API Fetching & Pagination
// --------------------------------------------------------------------------

async function readStravaResponse(response: Response, requestName: string): Promise<unknown> {
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
  const map = new Map<string, StravaActivity>();
  // Existing loaded first
  for (const act of existing) {
    map.set(String(act.id), {
      ...act,
      gear_id: act.gear_id ?? (act as any).gear?.id ?? null,
    });
  }
  // Incoming merged (updates existing or adds new)
  for (const act of incoming) {
    const prev = map.get(String(act.id));
    map.set(String(act.id), {
      ...prev,
      ...act,
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
 * - If last checked within the past 24 hours: fetch only the latest 5 activities (per_page=5).
 * - If > 24 hours or initial clean fetch: fetch latest 50 activities (per_page=50).
 * - Prepend and merge into existing cache; never lose previously fetched historical items!
 */
export async function syncStravaActivitiesDelta(accessToken: string): Promise<StravaActivity[]> {
  const existingActivities = getCachedStravaActivities();
  const lastRefresh = getLastStravaRefreshTime();
  const timeSinceLastRefresh = Date.now() - lastRefresh;
  const isRecent = lastRefresh > 0 && timeSinceLastRefresh < 24 * 60 * 60 * 1000 && existingActivities.length > 0;

  const perPage = isRecent ? 5 : 50;

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

  const merged = mergeStravaActivities(existingActivities, incoming);
  saveCachedStravaActivities(merged);
  setLastStravaRefreshTime(Date.now());
  return merged;
}

/**
 * Fetch Older Historical Activities using Strava's `before` epoch parameter:
 * - Queries activities strictly prior to the earliest date currently in cache.
 * - Requests 50 activities per batch to minimize API rate limits.
 * - Appends to the bottom of the list and saves to cache.
 */
export async function fetchOlderStravaActivities(
  accessToken: string,
  oldestEpochSeconds: number,
  perPage = 50
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

  const merged = mergeStravaActivities(existingActivities, olderData);
  saveCachedStravaActivities(merged);

  return {
    activities: merged,
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
