import { StravaActivity } from './stravaActivities';
import { classifyActivity } from './stravaActivities';
import { formatSecondsToMinSec } from '../types/athlete';

export interface WeeklyRunRecord {
  id: string | number;
  name: string;
  startDate: string;
  dayOfWeek: string; // e.g. "Wed"
  distanceMiles: number;
  distanceKm: number;
  movingTimeSec: number;
  avgPaceFormatted: string;
  elevationGainMeters: number;
  sufferScore?: number;
}

export interface WeeklyMileageBucket {
  weekKey: string; // "YYYY-MM-DD" of Monday
  mondayDate: Date;
  sundayDate: Date;
  weekLabel: string; // "Mon 20 Oct – Sun 26 Oct"
  shortLabel: string; // "Mon 20 Oct"
  isCurrentWeek: boolean;
  distanceMiles: number;
  distanceKm: number;
  movingTimeSec: number;
  movingHours: number;
  runsCount: number;
  elevationGainMeters: number;
  avgPaceSecPerKm: number;
  avgPaceFormatted: string;
  runs: WeeklyRunRecord[];
}

export type TimeGranularity = 'week' | 'month';

export interface MileageSummaryStats {
  totalMiles: number;
  totalKm: number;
  totalHours: number;
  totalRuns: number;
  averageWeeklyMiles: number;
  averageWeeklyKm: number;
  averageWeeklyHours: number;
  peakWeekMiles: number;
  peakWeekKm: number;
  peakWeekHours: number;
  peakWeekLabel: string;
  currentWeekMiles: number;
  currentWeekKm: number;
  currentWeekHours: number;
  previousWeekMiles: number;
  previousWeekKm: number;
  previousWeekHours: number;
  weekOverWeekChangePct: number | null;
}

/**
 * Formats a Date into local "YYYY-MM-DD" without UTC timezone shift.
 */
export function formatLocalDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses an activity date string (preferring start_date_local without trailing Z shift)
 * so weekday (Mon-Sun) and day-of-month calculations stay in the athlete's local time.
 */
export function parseActivityLocalDate(dateInput: Date | string): Date {
  if (dateInput instanceof Date) return new Date(dateInput.getTime());
  if (typeof dateInput === 'string') {
    // Strip trailing Z if ISO local timestamp so JS parses in local calendar time
    const normalized = dateInput.endsWith('Z') && dateInput.includes('T')
      ? dateInput.slice(0, -1)
      : dateInput;
    const parsed = new Date(normalized);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date(dateInput);
}

/**
 * Rounds a metric to 1 decimal place, or 2 decimal places when between 0 and 1
 * so small values (such as swim miles) never round down to 0.
 */
function roundMetricVal(val: number): number {
  if (val <= 0) return 0;
  if (val < 1) {
    return Math.round(val * 100) / 100;
  }
  return Math.round(val * 10) / 10;
}

/**
 * Returns the Monday Date (00:00:00 local) for a given date.
 */
export function getMondayOfWeek(dateInput: Date | string): Date {
  const d = parseActivityLocalDate(dateInput);
  const day = d.getDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
  // If day is 0 (Sunday), diff is -6 days; otherwise diff is 1 - day
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Formats a Monday date into "Mon 20 Oct – Sun 26 Oct".
 */
export function formatWeekRange(monday: Date): { weekLabel: string; shortLabel: string } {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const monStr = monday.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const sunStr = sunday.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return {
    weekLabel: `${monStr} – ${sunStr}`,
    shortLabel: monStr,
  };
}

/**
 * Computes running mileage and volume for the specified lookback weeks or months.
 */
export function computeWeeklyRunningMileage(
  activities: StravaActivity[],
  numPeriods: number = 12,
  granularity: TimeGranularity = 'week'
): {
  weeks: WeeklyMileageBucket[];
  stats: MileageSummaryStats;
} {
  // 1. Filter running activities only (exclude deleted)
  const runningActivities = activities.filter((act) => {
    if (act.isDeleted) return false;
    const cls = classifyActivity(act);
    return (
      cls.category === 'Run' ||
      act.type === 'Run' ||
      act.type === 'TrailRun' ||
      act.type === 'VirtualRun'
    );
  });

  const now = new Date();
  const weeksMap = new Map<string, WeeklyMileageBucket>();
  const bucketKeys: string[] = [];

  if (granularity === 'month') {
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    for (let i = numPeriods - 1; i >= 0; i--) {
      const d = new Date(curYear, curMonth - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const firstDay = new Date(year, month, 1, 0, 0, 0, 0);
      const lastDay = new Date(year, month + 1, 0, 23, 59, 59, 999);
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;
      const shortLabel = firstDay.toLocaleDateString(undefined, { month: 'short' });
      const weekLabel = firstDay.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      const isCurrentWeek = year === curYear && month === curMonth;

      weeksMap.set(key, {
        weekKey: key,
        mondayDate: firstDay,
        sundayDate: lastDay,
        weekLabel,
        shortLabel,
        isCurrentWeek,
        distanceMiles: 0,
        distanceKm: 0,
        movingTimeSec: 0,
        movingHours: 0,
        runsCount: 0,
        elevationGainMeters: 0,
        avgPaceSecPerKm: 0,
        avgPaceFormatted: '--',
        runs: [],
      });
      bucketKeys.push(key);
    }
  } else {
    const currentMonday = getMondayOfWeek(now);
    const currentMondayKey = formatLocalDateKey(currentMonday);
    for (let i = numPeriods - 1; i >= 0; i--) {
      const mon = new Date(currentMonday);
      mon.setDate(currentMonday.getDate() - i * 7);
      mon.setHours(0, 0, 0, 0);
      const key = formatLocalDateKey(mon);
      const sunday = new Date(mon);
      sunday.setDate(mon.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      const { weekLabel, shortLabel } = formatWeekRange(mon);
      const isCurrentWeek = key === currentMondayKey;

      weeksMap.set(key, {
        weekKey: key,
        mondayDate: mon,
        sundayDate: sunday,
        weekLabel,
        shortLabel,
        isCurrentWeek,
        distanceMiles: 0,
        distanceKm: 0,
        movingTimeSec: 0,
        movingHours: 0,
        runsCount: 0,
        elevationGainMeters: 0,
        avgPaceSecPerKm: 0,
        avgPaceFormatted: '--',
        runs: [],
      });
      bucketKeys.push(key);
    }
  }

  // 3. Bucket running activities into their period
  runningActivities.forEach((act) => {
    const rawDateStr = act.start_date_local || act.start_date;
    if (!rawDateStr) return;
    const actDate = parseActivityLocalDate(rawDateStr);
    if (isNaN(actDate.getTime())) return;

    let key: string;
    if (granularity === 'month') {
      key = `${actDate.getFullYear()}-${String(actDate.getMonth() + 1).padStart(2, '0')}`;
    } else {
      const actMonday = getMondayOfWeek(actDate);
      key = formatLocalDateKey(actMonday);
    }

    const bucket = weeksMap.get(key);
    if (!bucket) {
      return;
    }

    const distMeters = act.distance || 0;
    const distMiles = distMeters / 1609.344;
    const distKm = distMeters / 1000;
    const movingSec = act.moving_time || 0;
    const elevM = act.total_elevation_gain || 0;

    bucket.distanceMiles += distMiles;
    bucket.distanceKm += distKm;
    bucket.movingTimeSec += movingSec;
    bucket.elevationGainMeters += elevM;
    bucket.runsCount += 1;

    const dayName = actDate.toLocaleDateString(undefined, { weekday: 'short' });
    const runAvgPaceSec = distKm > 0 ? movingSec / distKm : 0;

    bucket.runs.push({
      id: act.id,
      name: act.name || 'Running Activity',
      startDate: rawDateStr,
      dayOfWeek: dayName,
      distanceMiles: Math.round(distMiles * 100) / 100,
      distanceKm: Math.round(distKm * 100) / 100,
      movingTimeSec: movingSec,
      avgPaceFormatted: runAvgPaceSec > 0 ? `${formatSecondsToMinSec(runAvgPaceSec)}/km` : '--',
      elevationGainMeters: Math.round(elevM),
      sufferScore: act.suffer_score,
    });
  });

  // 4. Finalize averages and sorting
  const resultWeeks: WeeklyMileageBucket[] = [];
  let totalPeriodMiles = 0;
  let totalPeriodKm = 0;
  let totalPeriodTimeSec = 0;
  let totalPeriodRuns = 0;
  let peakWeekMiles = 0;
  let peakWeekKm = 0;
  let peakWeekHours = 0;
  let peakWeekLabel = '';

  for (const key of bucketKeys) {
    const b = weeksMap.get(key)!;

    b.distanceMiles = roundMetricVal(b.distanceMiles);
    b.distanceKm = roundMetricVal(b.distanceKm);
    b.movingHours = roundMetricVal(b.movingTimeSec / 3600);

    if (b.distanceKm > 0 && b.movingTimeSec > 0) {
      b.avgPaceSecPerKm = Math.round(b.movingTimeSec / b.distanceKm);
      b.avgPaceFormatted = `${formatSecondsToMinSec(b.avgPaceSecPerKm)}/km`;
    }

    b.runs.sort((a, bRun) => parseActivityLocalDate(a.startDate).getTime() - parseActivityLocalDate(bRun.startDate).getTime());

    totalPeriodMiles += b.distanceMiles;
    totalPeriodKm += b.distanceKm;
    totalPeriodTimeSec += b.movingTimeSec;
    totalPeriodRuns += b.runsCount;

    const bHours = b.movingHours;
    if (b.distanceMiles > peakWeekMiles) {
      peakWeekMiles = b.distanceMiles;
      peakWeekKm = b.distanceKm;
      peakWeekHours = bHours;
      peakWeekLabel = b.shortLabel;
    }

    resultWeeks.push(b);
  }

  // Current period & previous period
  const currentWeek = resultWeeks[resultWeeks.length - 1];
  const prevWeek = resultWeeks.length >= 2 ? resultWeeks[resultWeeks.length - 2] : null;

  const currentWeekMiles = currentWeek?.distanceMiles || 0;
  const currentWeekKm = currentWeek?.distanceKm || 0;
  const currentWeekHours = currentWeek?.movingHours || 0;

  const previousWeekMiles = prevWeek?.distanceMiles || 0;
  const previousWeekKm = prevWeek?.distanceKm || 0;
  const previousWeekHours = prevWeek?.movingHours || 0;

  let weekOverWeekChangePct: number | null = null;
  if (previousWeekMiles > 0) {
    weekOverWeekChangePct = Math.round(((currentWeekMiles - previousWeekMiles) / previousWeekMiles) * 100);
  }

  const count = resultWeeks.length || 1;
  const averageWeeklyMiles = roundMetricVal(totalPeriodMiles / count);
  const averageWeeklyKm = roundMetricVal(totalPeriodKm / count);
  const totalHours = roundMetricVal(totalPeriodTimeSec / 3600);
  const averageWeeklyHours = roundMetricVal(totalHours / count);

  return {
    weeks: resultWeeks,
    stats: {
      totalMiles: roundMetricVal(totalPeriodMiles),
      totalKm: roundMetricVal(totalPeriodKm),
      totalHours,
      totalRuns: totalPeriodRuns,
      averageWeeklyMiles,
      averageWeeklyKm,
      averageWeeklyHours,
      peakWeekMiles,
      peakWeekKm,
      peakWeekHours,
      peakWeekLabel,
      currentWeekMiles,
      currentWeekKm,
      currentWeekHours,
      previousWeekMiles,
      previousWeekKm,
      previousWeekHours,
      weekOverWeekChangePct,
    },
  };
}

export interface WeeklySwimBucket {
  weekKey: string;
  mondayDate: Date;
  sundayDate: Date;
  weekLabel: string;
  shortLabel: string;
  isCurrentWeek: boolean;
  distanceMeters: number;
  distanceKm: number;
  distanceMiles: number;
  movingTimeSec: number;
  movingHours: number;
  swimsCount: number;
  swims: {
    id: string | number;
    name: string;
    startDate: string;
    dayOfWeek: string;
    distanceMeters: number;
    distanceKm: number;
    distanceMiles: number;
    movingTimeSec: number;
    movingHours: number;
    avgPaceFormatted: string;
  }[];
}

export interface SwimSummaryStats {
  totalKm: number;
  totalMiles: number;
  totalHours: number;
  totalMeters: number;
  totalSwims: number;
  averageWeeklyKm: number;
  averageWeeklyMiles: number;
  averageWeeklyHours: number;
  peakWeekKm: number;
  peakWeekMiles: number;
  peakWeekHours: number;
  peakWeekLabel: string;
  currentWeekKm: number;
  currentWeekMiles: number;
  currentWeekHours: number;
  previousWeekKm: number;
  previousWeekMiles: number;
  previousWeekHours: number;
  weekOverWeekChangePct: number | null;
}

export function computeWeeklySwimDistance(
  activities: StravaActivity[],
  numPeriods: number = 12,
  granularity: TimeGranularity = 'week'
): { weeks: WeeklySwimBucket[]; stats: SwimSummaryStats } {
  const swimActivities = activities.filter((act) => {
    if (act.isDeleted) return false;
    const cls = classifyActivity(act);
    return cls.category === 'Swim' || act.type === 'Swim';
  });

  const now = new Date();
  const weeksMap = new Map<string, WeeklySwimBucket>();
  const bucketKeys: string[] = [];

  if (granularity === 'month') {
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    for (let i = numPeriods - 1; i >= 0; i--) {
      const d = new Date(curYear, curMonth - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const firstDay = new Date(year, month, 1, 0, 0, 0, 0);
      const lastDay = new Date(year, month + 1, 0, 23, 59, 59, 999);
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;
      const shortLabel = firstDay.toLocaleDateString(undefined, { month: 'short' });
      const weekLabel = firstDay.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      const isCurrentWeek = year === curYear && month === curMonth;

      weeksMap.set(key, {
        weekKey: key,
        mondayDate: firstDay,
        sundayDate: lastDay,
        weekLabel,
        shortLabel,
        isCurrentWeek,
        distanceMeters: 0,
        distanceKm: 0,
        distanceMiles: 0,
        movingTimeSec: 0,
        movingHours: 0,
        swimsCount: 0,
        swims: [],
      });
      bucketKeys.push(key);
    }
  } else {
    const currentMonday = getMondayOfWeek(now);
    const currentMondayKey = formatLocalDateKey(currentMonday);
    for (let i = numPeriods - 1; i >= 0; i--) {
      const mon = new Date(currentMonday);
      mon.setDate(currentMonday.getDate() - i * 7);
      mon.setHours(0, 0, 0, 0);
      const key = formatLocalDateKey(mon);
      const sunday = new Date(mon);
      sunday.setDate(mon.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      const { weekLabel, shortLabel } = formatWeekRange(mon);
      const isCurrentWeek = key === currentMondayKey;

      weeksMap.set(key, {
        weekKey: key,
        mondayDate: mon,
        sundayDate: sunday,
        weekLabel,
        shortLabel,
        isCurrentWeek,
        distanceMeters: 0,
        distanceKm: 0,
        distanceMiles: 0,
        movingTimeSec: 0,
        movingHours: 0,
        swimsCount: 0,
        swims: [],
      });
      bucketKeys.push(key);
    }
  }

  swimActivities.forEach((act) => {
    const rawDateStr = act.start_date_local || act.start_date;
    if (!rawDateStr) return;
    const actDate = parseActivityLocalDate(rawDateStr);
    if (isNaN(actDate.getTime())) return;

    let key: string;
    if (granularity === 'month') {
      key = `${actDate.getFullYear()}-${String(actDate.getMonth() + 1).padStart(2, '0')}`;
    } else {
      const actMonday = getMondayOfWeek(actDate);
      key = formatLocalDateKey(actMonday);
    }

    const bucket = weeksMap.get(key);
    if (!bucket) return;

    const distMeters = act.distance || 0;
    const distKm = distMeters / 1000;
    const distMiles = distMeters / 1609.344;
    const movingSec = act.moving_time || 0;
    const movingHrs = movingSec / 3600;

    bucket.distanceMeters += distMeters;
    bucket.distanceKm += distKm;
    bucket.distanceMiles += distMiles;
    bucket.movingTimeSec += movingSec;
    bucket.swimsCount += 1;

    const dayName = actDate.toLocaleDateString(undefined, { weekday: 'short' });
    const pace100mSec = distMeters > 10 ? (movingSec / (distMeters / 100)) : 0;

    bucket.swims.push({
      id: act.id,
      name: act.name || 'Swim Activity',
      startDate: rawDateStr,
      dayOfWeek: dayName,
      distanceMeters: Math.round(distMeters),
      distanceKm: Math.round(distKm * 100) / 100,
      distanceMiles: Math.round(distMiles * 100) / 100,
      movingTimeSec: movingSec,
      movingHours: Math.round(movingHrs * 100) / 100,
      avgPaceFormatted: pace100mSec > 0 ? `${formatSecondsToMinSec(pace100mSec)}/100m` : '--',
    });
  });

  const resultWeeks: WeeklySwimBucket[] = [];
  let totalPeriodKm = 0;
  let totalPeriodMiles = 0;
  let totalPeriodMeters = 0;
  let totalPeriodTimeSec = 0;
  let totalPeriodSwims = 0;
  let peakWeekKm = 0;
  let peakWeekMiles = 0;
  let peakWeekHours = 0;
  let peakWeekLabel = '';

  for (const key of bucketKeys) {
    const b = weeksMap.get(key)!;

    b.distanceKm = roundMetricVal(b.distanceKm);
    b.distanceMiles = roundMetricVal(b.distanceMiles);
    b.movingHours = roundMetricVal(b.movingTimeSec / 3600);
    b.distanceMeters = Math.round(b.distanceMeters);
    b.swims.sort((a, bSwim) => parseActivityLocalDate(a.startDate).getTime() - parseActivityLocalDate(bSwim.startDate).getTime());

    totalPeriodKm += b.distanceKm;
    totalPeriodMiles += b.distanceMiles;
    totalPeriodMeters += b.distanceMeters;
    totalPeriodTimeSec += b.movingTimeSec;
    totalPeriodSwims += b.swimsCount;

    const bHours = b.movingHours;
    if (b.distanceKm > peakWeekKm) {
      peakWeekKm = b.distanceKm;
      peakWeekMiles = b.distanceMiles;
      peakWeekHours = bHours;
      peakWeekLabel = b.shortLabel;
    }

    resultWeeks.push(b);
  }

  const currentWeek = resultWeeks[resultWeeks.length - 1];
  const prevWeek = resultWeeks.length >= 2 ? resultWeeks[resultWeeks.length - 2] : null;

  const currentWeekKm = currentWeek?.distanceKm || 0;
  const currentWeekMiles = currentWeek?.distanceMiles || 0;
  const currentWeekHours = currentWeek?.movingHours || 0;

  const previousWeekKm = prevWeek?.distanceKm || 0;
  const previousWeekMiles = prevWeek?.distanceMiles || 0;
  const previousWeekHours = prevWeek?.movingHours || 0;

  let weekOverWeekChangePct: number | null = null;
  if (previousWeekKm > 0) {
    weekOverWeekChangePct = Math.round(((currentWeekKm - previousWeekKm) / previousWeekKm) * 100);
  }

  const count = resultWeeks.length || 1;
  const averageWeeklyKm = roundMetricVal(totalPeriodKm / count);
  const totalMiles = roundMetricVal(totalPeriodMiles);
  const averageWeeklyMiles = roundMetricVal(totalPeriodMiles / count);
  const totalHours = roundMetricVal(totalPeriodTimeSec / 3600);
  const averageWeeklyHours = roundMetricVal(totalHours / count);

  return {
    weeks: resultWeeks,
    stats: {
      totalKm: roundMetricVal(totalPeriodKm),
      totalMiles,
      totalHours,
      totalMeters: Math.round(totalPeriodMeters),
      totalSwims: totalPeriodSwims,
      averageWeeklyKm,
      averageWeeklyMiles,
      averageWeeklyHours,
      peakWeekKm,
      peakWeekMiles,
      peakWeekHours,
      peakWeekLabel,
      currentWeekKm,
      currentWeekMiles,
      currentWeekHours,
      previousWeekKm,
      previousWeekMiles,
      previousWeekHours,
      weekOverWeekChangePct,
    },
  };
}

export interface WeeklyBikeBucket {
  weekKey: string;
  mondayDate: Date;
  sundayDate: Date;
  weekLabel: string;
  shortLabel: string;
  isCurrentWeek: boolean;
  movingHours: number;
  movingTimeSec: number;
  distanceKm: number;
  distanceMiles: number;
  elevationGainMeters: number;
  ridesCount: number;
  rides: {
    id: string | number;
    name: string;
    startDate: string;
    dayOfWeek: string;
    movingHours: number;
    movingTimeSec: number;
    distanceKm: number;
    distanceMiles: number;
    elevationGainMeters: number;
    averageWatts?: number;
  }[];
}

export interface BikeSummaryStats {
  totalHours: number;
  totalKm: number;
  totalMiles: number;
  totalRides: number;
  averageWeeklyHours: number;
  averageWeeklyKm: number;
  averageWeeklyMiles: number;
  peakWeekHours: number;
  peakWeekKm: number;
  peakWeekMiles: number;
  peakWeekLabel: string;
  currentWeekHours: number;
  currentWeekKm: number;
  currentWeekMiles: number;
  previousWeekHours: number;
  previousWeekKm: number;
  previousWeekMiles: number;
  weekOverWeekChangePct: number | null;
}

export function computeWeeklyBikeHours(
  activities: StravaActivity[],
  numPeriods: number = 12,
  granularity: TimeGranularity = 'week'
): { weeks: WeeklyBikeBucket[]; stats: BikeSummaryStats } {
  const bikeActivities = activities.filter((act) => {
    if (act.isDeleted) return false;
    const cls = classifyActivity(act);
    return cls.category === 'Bike' || act.type === 'Ride' || act.type === 'VirtualRide' || act.type === 'EBikeRide';
  });

  const now = new Date();
  const weeksMap = new Map<string, WeeklyBikeBucket>();
  const bucketKeys: string[] = [];

  if (granularity === 'month') {
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    for (let i = numPeriods - 1; i >= 0; i--) {
      const d = new Date(curYear, curMonth - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const firstDay = new Date(year, month, 1, 0, 0, 0, 0);
      const lastDay = new Date(year, month + 1, 0, 23, 59, 59, 999);
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;
      const shortLabel = firstDay.toLocaleDateString(undefined, { month: 'short' });
      const weekLabel = firstDay.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      const isCurrentWeek = year === curYear && month === curMonth;

      weeksMap.set(key, {
        weekKey: key,
        mondayDate: firstDay,
        sundayDate: lastDay,
        weekLabel,
        shortLabel,
        isCurrentWeek,
        movingHours: 0,
        movingTimeSec: 0,
        distanceKm: 0,
        distanceMiles: 0,
        elevationGainMeters: 0,
        ridesCount: 0,
        rides: [],
      });
      bucketKeys.push(key);
    }
  } else {
    const currentMonday = getMondayOfWeek(now);
    const currentMondayKey = formatLocalDateKey(currentMonday);
    for (let i = numPeriods - 1; i >= 0; i--) {
      const mon = new Date(currentMonday);
      mon.setDate(currentMonday.getDate() - i * 7);
      mon.setHours(0, 0, 0, 0);
      const key = formatLocalDateKey(mon);
      const sunday = new Date(mon);
      sunday.setDate(mon.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      const { weekLabel, shortLabel } = formatWeekRange(mon);
      const isCurrentWeek = key === currentMondayKey;

      weeksMap.set(key, {
        weekKey: key,
        mondayDate: mon,
        sundayDate: sunday,
        weekLabel,
        shortLabel,
        isCurrentWeek,
        movingHours: 0,
        movingTimeSec: 0,
        distanceKm: 0,
        distanceMiles: 0,
        elevationGainMeters: 0,
        ridesCount: 0,
        rides: [],
      });
      bucketKeys.push(key);
    }
  }

  bikeActivities.forEach((act) => {
    const rawDateStr = act.start_date_local || act.start_date;
    if (!rawDateStr) return;
    const actDate = parseActivityLocalDate(rawDateStr);
    if (isNaN(actDate.getTime())) return;

    let key: string;
    if (granularity === 'month') {
      key = `${actDate.getFullYear()}-${String(actDate.getMonth() + 1).padStart(2, '0')}`;
    } else {
      const actMonday = getMondayOfWeek(actDate);
      key = formatLocalDateKey(actMonday);
    }

    const bucket = weeksMap.get(key);
    if (!bucket) return;

    const movingSec = act.moving_time || 0;
    const movingHrs = movingSec / 3600;
    const distMeters = act.distance || 0;
    const distKm = distMeters / 1000;
    const distMiles = distMeters / 1609.344;
    const elevM = act.total_elevation_gain || 0;

    bucket.movingTimeSec += movingSec;
    bucket.movingHours += movingHrs;
    bucket.distanceKm += distKm;
    bucket.distanceMiles += distMiles;
    bucket.elevationGainMeters += elevM;
    bucket.ridesCount += 1;

    const dayName = actDate.toLocaleDateString(undefined, { weekday: 'short' });

    bucket.rides.push({
      id: act.id,
      name: act.name || 'Cycling Activity',
      startDate: rawDateStr,
      dayOfWeek: dayName,
      movingHours: Math.round(movingHrs * 100) / 100,
      movingTimeSec: movingSec,
      distanceKm: Math.round(distKm * 100) / 100,
      distanceMiles: Math.round(distMiles * 100) / 100,
      elevationGainMeters: Math.round(elevM),
      averageWatts: act.average_watts,
    });
  });

  const resultWeeks: WeeklyBikeBucket[] = [];
  let totalPeriodSec = 0;
  let totalPeriodKm = 0;
  let totalPeriodMiles = 0;
  let totalPeriodRides = 0;
  let peakWeekSec = 0;
  let peakWeekKm = 0;
  let peakWeekMiles = 0;
  let peakWeekLabel = '';

  for (const key of bucketKeys) {
    const b = weeksMap.get(key)!;

    b.movingHours = roundMetricVal(b.movingTimeSec / 3600);
    b.distanceKm = roundMetricVal(b.distanceKm);
    b.distanceMiles = roundMetricVal(b.distanceMiles);
    b.rides.sort((a, bRide) => parseActivityLocalDate(a.startDate).getTime() - parseActivityLocalDate(bRide.startDate).getTime());

    totalPeriodSec += b.movingTimeSec;
    totalPeriodKm += b.distanceKm;
    totalPeriodMiles += b.distanceMiles;
    totalPeriodRides += b.ridesCount;

    if (b.movingTimeSec > peakWeekSec) {
      peakWeekSec = b.movingTimeSec;
      peakWeekKm = b.distanceKm;
      peakWeekMiles = b.distanceMiles;
      peakWeekLabel = b.shortLabel;
    }

    resultWeeks.push(b);
  }

  const currentWeek = resultWeeks[resultWeeks.length - 1];
  const prevWeek = resultWeeks.length >= 2 ? resultWeeks[resultWeeks.length - 2] : null;

  const currentWeekHours = currentWeek?.movingHours || 0;
  const currentWeekKm = currentWeek?.distanceKm || 0;
  const currentWeekMiles = currentWeek?.distanceMiles || 0;

  const previousWeekHours = prevWeek?.movingHours || 0;
  const previousWeekKm = prevWeek?.distanceKm || 0;
  const previousWeekMiles = prevWeek?.distanceMiles || 0;

  let weekOverWeekChangePct: number | null = null;
  if (previousWeekHours > 0) {
    weekOverWeekChangePct = Math.round(((currentWeekHours - previousWeekHours) / previousWeekHours) * 100);
  }

  const count = resultWeeks.length || 1;
  const totalHours = roundMetricVal(totalPeriodSec / 3600);
  const averageWeeklyHours = roundMetricVal(totalHours / count);
  const peakWeekHours = roundMetricVal(peakWeekSec / 3600);

  const roundedTotalKm = roundMetricVal(totalPeriodKm);
  const totalMiles = roundMetricVal(totalPeriodMiles);
  const averageWeeklyKm = roundMetricVal(totalPeriodKm / count);
  const averageWeeklyMiles = roundMetricVal(totalPeriodMiles / count);

  return {
    weeks: resultWeeks,
    stats: {
      totalHours,
      totalKm: roundedTotalKm,
      totalMiles,
      totalRides: totalPeriodRides,
      averageWeeklyHours,
      averageWeeklyKm,
      averageWeeklyMiles,
      peakWeekHours,
      peakWeekKm,
      peakWeekMiles,
      peakWeekLabel,
      currentWeekHours,
      currentWeekKm,
      currentWeekMiles,
      previousWeekHours,
      previousWeekKm,
      previousWeekMiles,
      weekOverWeekChangePct,
    },
  };
}

/**
 * Computes accumulated metrics in a period (e.g. previous week or month)
 * up to the exact same day of the week or month relative to a reference date.
 */
export function getSameDayAccumulatedInPeriod(
  items: { startDate: string; distanceMiles?: number; distanceKm?: number; movingTimeSec?: number; movingHours?: number }[],
  granularity: TimeGranularity,
  referenceDate: Date = new Date()
): {
  distanceMiles: number;
  distanceKm: number;
  movingHours: number;
} {
  let miles = 0;
  let km = 0;
  let sec = 0;

  if (granularity === 'month') {
    const curDayOfMonth = referenceDate.getDate(); // 1..31
    for (const item of items) {
      if (!item.startDate) continue;
      const d = parseActivityLocalDate(item.startDate);
      if (isNaN(d.getTime())) continue;
      if (d.getDate() <= curDayOfMonth) {
        const itemKm = item.distanceKm !== undefined ? item.distanceKm : (item.distanceMiles || 0) / 0.621371;
        const itemMiles = item.distanceMiles !== undefined ? item.distanceMiles : itemKm * 0.621371;
        const itemSec = item.movingTimeSec !== undefined ? item.movingTimeSec : (item.movingHours || 0) * 3600;
        miles += itemMiles;
        km += itemKm;
        sec += itemSec;
      }
    }
  } else {
    // Week: Monday is 1, Tuesday 2, ..., Sunday 7
    const curDay = referenceDate.getDay();
    const curDayOfWeek = curDay === 0 ? 7 : curDay;
    for (const item of items) {
      if (!item.startDate) continue;
      const d = parseActivityLocalDate(item.startDate);
      if (isNaN(d.getTime())) continue;
      const itemDay = d.getDay() === 0 ? 7 : d.getDay();
      if (itemDay <= curDayOfWeek) {
        const itemKm = item.distanceKm !== undefined ? item.distanceKm : (item.distanceMiles || 0) / 0.621371;
        const itemMiles = item.distanceMiles !== undefined ? item.distanceMiles : itemKm * 0.621371;
        const itemSec = item.movingTimeSec !== undefined ? item.movingTimeSec : (item.movingHours || 0) * 3600;
        miles += itemMiles;
        km += itemKm;
        sec += itemSec;
      }
    }
  }

  return {
    distanceMiles: roundMetricVal(miles),
    distanceKm: roundMetricVal(km),
    movingHours: roundMetricVal(sec / 3600),
  };
}


