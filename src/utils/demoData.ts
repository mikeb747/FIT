import type { StravaActivity, StravaActivityDetailsRecord, ActivityEffortFeedback } from './stravaActivities';
import { batchSaveStravaActivityRecords, deleteCachedStravaActivityRecords } from './stravaActivities';
import { setCachedBikeNames } from './stravaGear';
import type { DailyRecoveryLog } from '../types/recovery';
import demoActivitiesRaw from '../data/demoActivities2026.json';
import demoHealthLogsRaw from '../data/demoHealthLogs2026.json';
import demoTpEffortFeedbackRaw from '../data/demoTpEffortFeedback.json';

const DEMO_MODE_STORAGE_KEY = 'fit_track_ai_studio_demo_mode_active';

export const LEGACY_DEMO_ACTIVITY_IDS = Array.from(
  { length: 12 },
  (_, idx) => `demo-act-${idx + 1}`
);

export const DEMO_BIKE_NAMES: Record<string, string> = {
  b4962521: 'Blue Bike',
  b9126101: 'Black TT',
  b3612643: 'Spin Bike',
};

/**
 * Returns true strictly when running within the Google AI Studio preview sandbox
 * (Cloud Run environment or local dev server).
 *
 * When the app is published (e.g., to GitHub Pages at *.github.io or a custom domain),
 * this returns false, ensuring demo data NEVER appears in the published application.
 */
export function isAIStudioEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname.toLowerCase();
  return (
    hostname.includes('run.app') ||
    hostname.includes('aistudio') ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1'
  );
}

/**
 * Checks whether demo data is currently active in localStorage.
 * Only returns true if also running in an AI Studio / dev environment.
 */
export function isDemoModeActive(): boolean {
  if (!isAIStudioEnvironment()) return false;
  try {
    return localStorage.getItem(DEMO_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Set the demo mode flag in localStorage.
 */
export function setDemoModeActive(active: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (active) {
      localStorage.setItem(DEMO_MODE_STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
    }
  } catch {}
}

/**
 * Checks if an activity ID belongs to the removed legacy 12-activity demo dataset.
 */
export function isLegacyDemoActivityId(id: string | number): boolean {
  return String(id).startsWith('demo-act-');
}

/**
 * Checks if a given activity ID belongs to the current AI Studio demo dataset.
 */
export function isDemoActivityId(id: string | number): boolean {
  const s = String(id);
  return s.startsWith('demo-') && !s.startsWith('demo-act-');
}

/**
 * Checks if a recovery log ID belongs to the removed synthetic 20-day demo dataset.
 */
export function isLegacyDemoRecoveryLogId(id: string | number): boolean {
  return String(id).startsWith('demo-rec-');
}

/**
 * Checks if a recovery log ID belongs to the AI Studio Sandbox Health tab demo dataset.
 */
export function isDemoRecoveryLogId(id: string | number): boolean {
  return String(id).startsWith('demo-health-');
}

/**
 * Seeds the bike gear names from the CSV export so Bike settings and charts display
 * human-readable bike names ('Blue Bike', 'Black TT', 'Spin Bike').
 */
export function seedDemoBikeNames(): void {
  if (!isAIStudioEnvironment()) return;
  setCachedBikeNames(DEMO_BIKE_NAMES);
}

/**
 * Returns the 2026 Strava + TrainingPeaks demo activities (457 activities from Jan 1 – Nov 12, 2026).
 */
export function generateDemoActivities(): StravaActivity[] {
  seedDemoBikeNames();
  return (demoActivitiesRaw as StravaActivity[]).map((act) => ({ ...act }));
}

/**
 * Ensures any newly added demo activities in `demoActivities2026.json` are merged into
 * existing cached activities when Demo Mode is active in the AI Studio Sandbox,
 * while preserving user edits/calibrations on already-cached activities.
 */
export function ensureSandboxDemoActivities(existingActivities: StravaActivity[]): StravaActivity[] {
  if (!isAIStudioEnvironment()) {
    return (existingActivities || []).filter((a) => !isDemoActivityId(a.id) && !isLegacyDemoActivityId(a.id));
  }
  seedDemoBikeNames();
  const byId = new Map<string, StravaActivity>();
  for (const demoAct of generateDemoActivities()) {
    byId.set(String(demoAct.id), demoAct);
  }
  for (const cachedAct of existingActivities || []) {
    if (!cachedAct || isLegacyDemoActivityId(cachedAct.id)) continue;
    byId.set(String(cachedAct.id), cachedAct);
  }
  return Array.from(byId.values()).sort((a, b) =>
    (b.start_date || '').localeCompare(a.start_date || '')
  );
}

/**
 * Removes all demo activity records (both current and legacy) from IndexedDB.
 */
export async function clearAllDemoActivityRecordsFromDb(): Promise<void> {
  const currentIds = (demoActivitiesRaw as StravaActivity[]).map((a) => String(a.id));
  await deleteCachedStravaActivityRecords([...LEGACY_DEMO_ACTIVITY_IDS, ...currentIds]);
}

const SANDBOX_READINESS_CLEARED_KEY = 'fit_track_sandbox_readiness_cleared';

export function isSandboxReadinessCleared(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(SANDBOX_READINESS_CLEARED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setSandboxReadinessCleared(cleared: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (cleared) {
      localStorage.setItem(SANDBOX_READINESS_CLEARED_KEY, 'true');
    } else {
      localStorage.removeItem(SANDBOX_READINESS_CLEARED_KEY);
    }
  } catch {}
}

/**
 * Returns the 87 days of Garmin Health tab telemetry (Aug 17 – Nov 12, 2026)
 * for the Readiness tab when running in the AI Studio Sandbox.
 */
export function generateDemoRecoveryLogs(): DailyRecoveryLog[] {
  return (demoHealthLogsRaw as DailyRecoveryLog[]).map((log) => ({ ...log }));
}

/**
 * Ensures all 87 days of Garmin Health tab data are present when running in the AI Studio Sandbox.
 * Strips any legacy synthetic `demo-rec-*` logs and preserves genuine user-logged or synced entries.
 */
export function ensureSandboxGarminReadinessLogs(
  existingLogs: DailyRecoveryLog[],
  forceSeed = false
): DailyRecoveryLog[] {
  const withoutLegacySynthetic = (existingLogs || []).filter(
    (l) => l && !isLegacyDemoRecoveryLogId(l.id)
  );

  if (!isAIStudioEnvironment()) {
    return withoutLegacySynthetic.filter((l) => !isDemoRecoveryLogId(l.id));
  }

  if (!forceSeed && isSandboxReadinessCleared()) {
    return withoutLegacySynthetic.filter((l) => !isDemoRecoveryLogId(l.id));
  }

  const sandboxHealthLogs = generateDemoRecoveryLogs();
  const genuineLogs = withoutLegacySynthetic.filter((l) => !isDemoRecoveryLogId(l.id));

  const byDate = new Map<string, DailyRecoveryLog>();
  for (const demoLog of sandboxHealthLogs) {
    byDate.set(demoLog.date, demoLog);
  }
  for (const realLog of genuineLogs) {
    byDate.set(realLog.date, realLog);
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export interface DemoStreamMetric {
  data: number[];
  series_type: string;
  original_size: number;
  resolution: string;
}

export type DemoStreamsMap = Record<string, DemoStreamMetric>;

function hashActivitySeed(id: string | number): number {
  const s = String(id);
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h % 1000) / 1000;
}

/**
 * Generates realistic, sensor-faithful Strava streams for any demo activity from the 2026 CSV export.
 * Only emits heartrate or power streams when those sensors were actually recorded on the activity.
 */
export function generateDemoStreamsForActivity(activity: StravaActivity): DemoStreamsMap {
  const isSwim = activity.type === 'Swim' || activity.sport_type === 'Swim' || activity.sport_type === 'OpenWaterSwim';
  const isRide = activity.type === 'Ride' || activity.type === 'VirtualRide' || activity.sport_type === 'Ride' || activity.sport_type === 'VirtualRide';
  const isRun = activity.type === 'Run' || activity.sport_type === 'Run';
  const isStationaryWorkout = (!activity.distance || activity.distance <= 0) && !isSwim && !isRide && !isRun;

  const hasHr = Boolean(activity.average_heartrate && activity.average_heartrate > 0);
  const hasWatts = Boolean(isRide && activity.average_watts && activity.average_watts > 0);
  const hasCadence = Boolean(activity.average_cadence && activity.average_cadence > 0);
  const elevGain = activity.total_elevation_gain || 0;
  const hasAltitude = !isSwim && !isStationaryWorkout && (elevGain > 0 || (!activity.trainer && (isRide || isRun)));

  if (isStationaryWorkout && !hasHr) {
    return {};
  }

  const numPoints = 100;
  const totalTimeSec = Math.max(60, activity.moving_time || activity.elapsed_time || 1800);
  const totalDistanceM = Math.max(0, activity.distance || 0);
  const avgHr = activity.average_heartrate || 130;
  const maxHr = Math.max(avgHr + 6, activity.max_heartrate || avgHr + 18);
  const avgSpeed =
    activity.average_speed ||
    (totalDistanceM > 0 && totalTimeSec > 0 ? totalDistanceM / totalTimeSec : 0);
  const avgWatts = activity.average_watts || 0;
  const npWatts = activity.weighted_average_watts || avgWatts;
  const avgCadence = activity.average_cadence || 0;
  const phase = hashActivitySeed(activity.id) * Math.PI * 2;

  const nameLower = (activity.name || '').toLowerCase();
  const is3030Bike = isRide && (/30\/30|30\/15|hiit|anaerobic/i.test(nameLower));
  const isSweetSpotBike = isRide && (/sweet\s*spot/i.test(nameLower));
  const intervalMatch = isRun ? nameLower.match(/(\d+)\s*x\s*(\d+)/i) : null;
  const runIntervalsCount = intervalMatch ? Math.min(12, Math.max(2, parseInt(intervalMatch[1], 10))) : 0;

  const timeData: number[] = new Array(numPoints);
  const distData: number[] = new Array(numPoints);
  const hrData: number[] | null = hasHr ? new Array(numPoints) : null;
  const velocityData: number[] | null = totalDistanceM > 0 ? new Array(numPoints) : null;
  const cadenceData: number[] | null = hasCadence ? new Array(numPoints) : null;
  const altData: number[] | null = hasAltitude ? new Array(numPoints) : null;
  const wattsData: number[] | null = hasWatts ? new Array(numPoints) : null;

  const baseAlt = isRide && activity.type === 'VirtualRide' ? 42 : 35;

  for (let i = 0; i < numPoints; i++) {
    const fraction = i / (numPoints - 1);
    timeData[i] = Math.round(fraction * totalTimeSec);
    distData[i] = Math.round(fraction * totalDistanceM);

    const wave1 = Math.sin(fraction * Math.PI * 4 + phase);
    const wave2 = Math.cos(fraction * Math.PI * 9 + phase * 1.7);
    const noise = wave1 * 0.55 + wave2 * 0.35;

    if (altData) {
      const climbShape =
        Math.sin(fraction * Math.PI * 2 + phase * 0.5) * 0.35 +
        Math.sin(fraction * Math.PI * 5 + phase) * 0.18 +
        0.42;
      const scale = Math.min(450, elevGain * 0.32);
      altData[i] = Math.max(5, Math.round(baseAlt + scale * climbShape));
    }

    if (is3030Bike) {
      // Warmup (0-18%), micro-intervals (18%-86%), cooldown (86%-100%)
      if (fraction < 0.18 || fraction > 0.86) {
        const easyFactor = fraction < 0.18 ? 0.65 + (fraction / 0.18) * 0.2 : 0.78 - ((fraction - 0.86) / 0.14) * 0.2;
        if (wattsData) wattsData[i] = Math.max(70, Math.round(avgWatts * easyFactor + noise * 10));
        if (hrData) hrData[i] = Math.min(maxHr, Math.max(85, Math.round(avgHr - 10 + easyFactor * 8 + noise * 3)));
        if (velocityData) velocityData[i] = Number(Math.max(2, avgSpeed * (0.88 + easyFactor * 0.12)).toFixed(2));
        if (cadenceData) cadenceData[i] = Math.max(60, Math.round(avgCadence - 4 + noise * 3));
      } else {
        const cycle = ((fraction - 0.18) / 0.68) * 14;
        const onBout = cycle - Math.floor(cycle) < 0.5;
        const peakW = Math.max(avgWatts * 1.48, npWatts * 1.32);
        const restW = Math.max(85, avgWatts * 0.58);
        if (wattsData) wattsData[i] = Math.round((onBout ? peakW : restW) + noise * 12);
        if (hrData) {
          const drift = ((fraction - 0.18) / 0.68) * (maxHr - avgHr) * 0.65;
          hrData[i] = Math.min(maxHr, Math.round(avgHr + (onBout ? 9 : -3) + drift + noise * 2));
        }
        if (velocityData) velocityData[i] = Number(Math.max(2, avgSpeed * (onBout ? 1.12 : 0.91)).toFixed(2));
        if (cadenceData) cadenceData[i] = Math.max(65, Math.round(avgCadence + (onBout ? 8 : -5) + noise * 2));
      }
    } else if (isSweetSpotBike) {
      if (fraction < 0.15 || fraction > 0.87) {
        if (wattsData) wattsData[i] = Math.max(80, Math.round(avgWatts * 0.72 + noise * 10));
        if (hrData) hrData[i] = Math.min(maxHr, Math.round(avgHr - 10 + noise * 3));
        if (velocityData) velocityData[i] = Number(Math.max(2, avgSpeed * 0.9).toFixed(2));
        if (cadenceData) cadenceData[i] = Math.max(65, Math.round(avgCadence - 3 + noise * 2));
      } else {
        const block = ((fraction - 0.15) / 0.72) * 3;
        const inWork = block - Math.floor(block) < 0.76;
        if (wattsData) wattsData[i] = Math.round((inWork ? avgWatts * 1.16 : avgWatts * 0.62) + noise * 8);
        if (hrData) hrData[i] = Math.min(maxHr, Math.round(avgHr + (inWork ? 8 : -8) + noise * 2));
        if (velocityData) velocityData[i] = Number(Math.max(2, avgSpeed * (inWork ? 1.07 : 0.88)).toFixed(2));
        if (cadenceData) cadenceData[i] = Math.max(65, Math.round(avgCadence + (inWork ? 4 : -4) + noise * 2));
      }
    } else if (runIntervalsCount >= 2) {
      if (fraction < 0.15 || fraction > 0.88) {
        if (velocityData) velocityData[i] = Number(Math.max(1.8, avgSpeed * 0.86 + noise * 0.08).toFixed(2));
        if (hrData) hrData[i] = Math.min(maxHr, Math.max(90, Math.round(avgHr - 12 + noise * 3)));
        if (cadenceData) cadenceData[i] = Math.max(68, Math.round(avgCadence - 3 + noise * 1.5));
      } else {
        const cycle = ((fraction - 0.15) / 0.73) * runIntervalsCount;
        const inRep = cycle - Math.floor(cycle) < 0.68;
        if (velocityData) velocityData[i] = Number(Math.max(1.8, avgSpeed * (inRep ? 1.12 : 0.82) + noise * 0.06).toFixed(2));
        if (hrData) {
          const repDrift = ((fraction - 0.15) / 0.73) * (maxHr - avgHr) * 0.6;
          hrData[i] = Math.min(maxHr, Math.round(avgHr + (inRep ? 9 : -7) + repDrift + noise * 2));
        }
        if (cadenceData) cadenceData[i] = Math.max(70, Math.round(avgCadence + (inRep ? 3 : -3) + noise));
      }
    } else if (isSwim) {
      if (hrData) {
        const warmup = Math.min(1, fraction * 5);
        const drift = fraction * Math.min(14, maxHr - avgHr) * 0.5;
        hrData[i] = Math.min(maxHr, Math.max(75, Math.round(avgHr - 8 + warmup * 8 + drift + noise * 4)));
      }
      if (velocityData) {
        velocityData[i] = Number(Math.max(0.4, avgSpeed + noise * 0.06).toFixed(2));
      }
      if (cadenceData) {
        cadenceData[i] = Math.max(18, Math.round(avgCadence + noise * 2));
      }
    } else {
      // Steady aerobic / hilly endurance ride, run, walk, or strength HR trace
      const warmup = Math.min(1, fraction * 6);
      const drift = fraction * Math.min(18, maxHr - avgHr) * 0.45;
      const terrainEffect = Math.sin(fraction * Math.PI * 5 + phase);

      if (hrData) {
        hrData[i] = Math.min(
          maxHr,
          Math.max(65, Math.round(avgHr - 9 + warmup * 9 + drift + terrainEffect * 4 + noise * 3))
        );
      }
      if (velocityData) {
        const speedSpread = isRide ? avgSpeed * 0.14 : avgSpeed * 0.06;
        velocityData[i] = Number(Math.max(0.5, avgSpeed - terrainEffect * speedSpread * 0.5 + noise * speedSpread * 0.4).toFixed(2));
      }
      if (cadenceData) {
        cadenceData[i] = Math.max(45, Math.round(avgCadence + noise * (isRide ? 5 : 2)));
      }
      if (wattsData) {
        const variability = Math.max(16, (npWatts - avgWatts) * 2.2 + avgWatts * 0.14);
        wattsData[i] = Math.max(
          45,
          Math.round(avgWatts + terrainEffect * variability * 0.65 + noise * variability * 0.45)
        );
      }
    }
  }

  const streamMetric = (data: number[]): DemoStreamMetric => ({
    data,
    series_type: totalDistanceM > 0 ? 'distance' : 'time',
    original_size: data.length,
    resolution: 'high',
  });

  const streams: DemoStreamsMap = {
    time: streamMetric(timeData),
  };

  if (totalDistanceM > 0) {
    streams.distance = streamMetric(distData);
  }
  if (hrData) {
    streams.heartrate = streamMetric(hrData);
  }
  if (velocityData) {
    streams.velocity_smooth = streamMetric(velocityData);
  }
  if (cadenceData) {
    streams.cadence = streamMetric(cadenceData);
  }
  if (altData) {
    streams.altitude = streamMetric(altData);
  }
  if (wattsData) {
    streams.watts = streamMetric(wattsData);
  }

  return streams;
}

/**
 * Builds full Strava activity details (splits_metric, laps, and telemetry streams)
 * for any demo activity so analysis, zone charts, and splits bar charts render seamlessly.
 */
export function generateDemoActivityDetails(activity: StravaActivity): StravaActivityDetailsRecord {
  const streams = generateDemoStreamsForActivity(activity);
  const hasStreams = Object.keys(streams).length > 0;
  const isRun = activity.type === 'Run' || activity.sport_type === 'Run';
  const isSwim = activity.type === 'Swim' || activity.sport_type === 'Swim' || activity.sport_type === 'OpenWaterSwim';
  const seed = hashActivitySeed(activity.id);

  // Generate 1km splits_metric for Run activities
  const splits_metric: any[] = [];
  if (isRun && (activity.distance || 0) >= 400 && (activity.moving_time || 0) > 0) {
    const totalKm = activity.distance / 1000;
    const fullKm = Math.floor(totalKm);
    const remainder = totalKm - fullKm;
    const avgSplitSec = activity.moving_time / totalKm;
    const elevPerKm = (activity.total_elevation_gain || 0) / Math.max(1, totalKm);

    for (let k = 1; k <= fullKm; k++) {
      const variation = Math.sin(k * 0.85 + seed * 5) * Math.min(9, avgSplitSec * 0.03);
      const sec = Math.max(120, Math.round(avgSplitSec + variation));
      const splitObj: Record<string, unknown> = {
        split: k,
        distance: 1000,
        moving_time: sec,
        elapsed_time: sec,
        average_speed: Number((1000 / sec).toFixed(2)),
        elevation_difference: elevPerKm > 0 ? Math.round(Math.sin(k * 1.1 + seed) * elevPerKm) : 0,
      };
      if (activity.average_heartrate && activity.average_heartrate > 0) {
        splitObj.average_heartrate = Math.round(
          activity.average_heartrate + (k / Math.max(1, fullKm) - 0.5) * 8 + Math.sin(k * 0.7) * 2
        );
      }
      splits_metric.push(splitObj);
    }

    if (remainder >= 0.05) {
      const remDist = Math.round(remainder * 1000);
      const sec = Math.max(10, Math.round(remainder * avgSplitSec));
      const splitObj: Record<string, unknown> = {
        split: fullKm + 1,
        distance: remDist,
        moving_time: sec,
        elapsed_time: sec,
        average_speed: Number((remDist / sec).toFixed(2)),
        elevation_difference: 0,
      };
      if (activity.average_heartrate && activity.average_heartrate > 0) {
        splitObj.average_heartrate = Math.round(activity.average_heartrate + 3);
      }
      splits_metric.push(splitObj);
    }
  }

  // Generate 100m (or open water segment) laps for Swim activities if not present
  let laps: any[] = Array.isArray(activity.laps) ? [...activity.laps] : [];
  if (isSwim && laps.length === 0 && (activity.distance || 0) >= 100 && (activity.moving_time || 0) > 0) {
    const lapUnit = activity.sport_type === 'OpenWaterSwim' ? 500 : 100;
    const fullLaps = Math.floor(activity.distance / lapUnit);
    const remM = Math.round(activity.distance - fullLaps * lapUnit);
    const pacePerM = activity.moving_time / activity.distance;

    for (let l = 1; l <= fullLaps; l++) {
      const lapMov = Math.max(20, Math.round(lapUnit * pacePerM + Math.sin(l * 0.7 + seed * 4) * (lapUnit === 500 ? 6 : 2)));
      const lapObj: Record<string, unknown> = {
        id: `${activity.id}-lap-${l}`,
        lap_index: l,
        name: `Lap ${l}`,
        distance: lapUnit,
        moving_time: lapMov,
        elapsed_time: lapMov,
        average_speed: Number((lapUnit / lapMov).toFixed(2)),
      };
      if (activity.average_heartrate && activity.average_heartrate > 0) {
        lapObj.average_heartrate = Math.round(activity.average_heartrate + Math.sin(l * 0.5) * 4);
      }
      if (activity.average_cadence && activity.average_cadence > 0) {
        lapObj.average_cadence = Math.round(activity.average_cadence + (l % 3) - 1);
      }
      laps.push(lapObj);
    }

    if (remM >= 25) {
      const lapMov = Math.max(15, Math.round(remM * pacePerM));
      laps.push({
        id: `${activity.id}-lap-${fullLaps + 1}`,
        lap_index: fullLaps + 1,
        name: `Lap ${fullLaps + 1}`,
        distance: remM,
        moving_time: lapMov,
        elapsed_time: lapMov,
        average_speed: Number((remM / lapMov).toFixed(2)),
        ...(activity.average_heartrate ? { average_heartrate: Math.round(activity.average_heartrate) } : {}),
      });
    }
  }

  const nowIso = new Date().toISOString();
  const enhancedActivity: Record<string, unknown> = {
    ...activity,
    ...(splits_metric.length > 0 ? { splits_metric } : {}),
    ...(laps.length > 0 ? { laps } : {}),
  };

  const tpFeedbackMap = demoTpEffortFeedbackRaw as Record<string, ActivityEffortFeedback>;
  const effortFeedback = tpFeedbackMap[String(activity.id)]
    ? { ...tpFeedbackMap[String(activity.id)] }
    : undefined;

  return {
    id: String(activity.id),
    activity: enhancedActivity,
    streams: hasStreams ? (streams as unknown as Record<string, unknown>) : undefined,
    ...(effortFeedback ? { effortFeedback } : {}),
    fetchedAt: nowIso,
    lapsFetchedAt: nowIso,
    noStreamsAvailable: !hasStreams,
  };
}

/**
 * Generates all 457 demo activity detail records in memory, removes any legacy demo-act-* records,
 * persists them in a single fast IndexedDB transaction, and returns the record map.
 */
export async function seedDemoActivityDetails(): Promise<Record<string, StravaActivityDetailsRecord>> {
  const activities = generateDemoActivities();
  const detailMap: Record<string, StravaActivityDetailsRecord> = {};
  const recordsList: StravaActivityDetailsRecord[] = [];

  for (const act of activities) {
    const record = generateDemoActivityDetails(act);
    detailMap[record.id] = record;
    recordsList.push(record);
  }

  await batchSaveStravaActivityRecords(recordsList, LEGACY_DEMO_ACTIVITY_IDS);
  return detailMap;
}
