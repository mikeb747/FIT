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
  runsCount: number;
  elevationGainMeters: number;
  avgPaceSecPerKm: number;
  avgPaceFormatted: string;
  runs: WeeklyRunRecord[];
}

export interface MileageSummaryStats {
  totalMiles: number;
  totalKm: number;
  totalRuns: number;
  averageWeeklyMiles: number;
  averageWeeklyKm: number;
  peakWeekMiles: number;
  peakWeekLabel: string;
  currentWeekMiles: number;
  previousWeekMiles: number;
  weekOverWeekChangePct: number | null;
}

/**
 * Returns the Monday Date (00:00:00 local) for a given date.
 */
export function getMondayOfWeek(dateInput: Date | string): Date {
  const d = new Date(dateInput);
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
 * Computes weekly running mileage strictly Monday to Sunday for the specified lookback weeks.
 */
export function computeWeeklyRunningMileage(
  activities: StravaActivity[],
  numWeeks: number = 12
): {
  weeks: WeeklyMileageBucket[];
  stats: MileageSummaryStats;
} {
  // 1. Filter running activities only
  const runningActivities = activities.filter((act) => {
    const cls = classifyActivity(act);
    return (
      cls.category === 'Run' ||
      act.type === 'Run' ||
      act.type === 'TrailRun' ||
      act.type === 'VirtualRun'
    );
  });

  // 2. Determine target weeks range (Monday to Sunday)
  const now = new Date();
  const currentMonday = getMondayOfWeek(now);

  // Build the complete list of consecutive weeks
  const weeksMap = new Map<string, WeeklyMileageBucket>();
  const weekMondays: Date[] = [];

  for (let i = numWeeks - 1; i >= 0; i--) {
    const mon = new Date(currentMonday);
    mon.setDate(currentMonday.getDate() - i * 7);
    mon.setHours(0, 0, 0, 0);
    const key = mon.toISOString().split('T')[0];
    const sunday = new Date(mon);
    sunday.setDate(mon.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const { weekLabel, shortLabel } = formatWeekRange(mon);
    const isCurrentWeek = key === currentMonday.toISOString().split('T')[0];

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
      runsCount: 0,
      elevationGainMeters: 0,
      avgPaceSecPerKm: 0,
      avgPaceFormatted: '--',
      runs: [],
    });
    weekMondays.push(mon);
  }

  // 3. Bucket running activities into their Monday week
  runningActivities.forEach((act) => {
    if (!act.start_date) return;
    const actDate = new Date(act.start_date);
    if (isNaN(actDate.getTime())) return;

    const actMonday = getMondayOfWeek(actDate);
    const key = actMonday.toISOString().split('T')[0];

    const bucket = weeksMap.get(key);
    if (!bucket) {
      // Activity is outside our current lookback window
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
      startDate: act.start_date,
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
  let totalPeriodRuns = 0;
  let peakWeekMiles = 0;
  let peakWeekLabel = '';

  for (const mon of weekMondays) {
    const key = mon.toISOString().split('T')[0];
    const b = weeksMap.get(key)!;

    b.distanceMiles = Math.round(b.distanceMiles * 10) / 10;
    b.distanceKm = Math.round(b.distanceKm * 10) / 10;

    if (b.distanceKm > 0 && b.movingTimeSec > 0) {
      b.avgPaceSecPerKm = Math.round(b.movingTimeSec / b.distanceKm);
      b.avgPaceFormatted = `${formatSecondsToMinSec(b.avgPaceSecPerKm)}/km`;
    }

    // Sort runs chronologically within week
    b.runs.sort((a, bRun) => new Date(a.startDate).getTime() - new Date(bRun.startDate).getTime());

    totalPeriodMiles += b.distanceMiles;
    totalPeriodKm += b.distanceKm;
    totalPeriodRuns += b.runsCount;

    if (b.distanceMiles > peakWeekMiles) {
      peakWeekMiles = b.distanceMiles;
      peakWeekLabel = b.shortLabel;
    }

    resultWeeks.push(b);
  }

  // Current week & previous week
  const currentWeek = resultWeeks[resultWeeks.length - 1];
  const prevWeek = resultWeeks.length >= 2 ? resultWeeks[resultWeeks.length - 2] : null;

  const currentWeekMiles = currentWeek?.distanceMiles || 0;
  const previousWeekMiles = prevWeek?.distanceMiles || 0;

  let weekOverWeekChangePct: number | null = null;
  if (previousWeekMiles > 0) {
    weekOverWeekChangePct = Math.round(((currentWeekMiles - previousWeekMiles) / previousWeekMiles) * 100);
  }

  const averageWeeklyMiles = Math.round((totalPeriodMiles / (resultWeeks.length || 1)) * 10) / 10;
  const averageWeeklyKm = Math.round((totalPeriodKm / (resultWeeks.length || 1)) * 10) / 10;

  return {
    weeks: resultWeeks,
    stats: {
      totalMiles: Math.round(totalPeriodMiles * 10) / 10,
      totalKm: Math.round(totalPeriodKm * 10) / 10,
      totalRuns: totalPeriodRuns,
      averageWeeklyMiles,
      averageWeeklyKm,
      peakWeekMiles,
      peakWeekLabel,
      currentWeekMiles,
      previousWeekMiles,
      weekOverWeekChangePct,
    },
  };
}
