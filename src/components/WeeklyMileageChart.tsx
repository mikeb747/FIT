import React, { useState, useMemo } from 'react';
import {
  Calendar,
  ChevronRight,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  BarChart2,
} from 'lucide-react';
import { StravaActivity, StravaActivityDetailsRecord } from '../utils/stravaActivities';
import { AthleteProfile } from '../types/athlete';
import { TrainingGoal } from '../types/goals';
import { loadAthleteGoals } from '../utils/goalsStorage';
import {
  computeWeeklyRunningMileage,
  computeWeeklySwimDistance,
  computeWeeklyBikeHours,
  computeWeeklyTss,
  WeeklyMileageBucket,
  WeeklySwimBucket,
  WeeklyBikeBucket,
  WeeklyTssBucket,
  TimeGranularity,
  getSameDayAccumulatedInPeriod,
} from '../utils/mileageEngine';
import { FitnessZoneCharts } from './FitnessZoneCharts';

export type ChartDatasetTab =
  | 'tss'
  | 'mileage'
  | 'swim_distance'
  | 'bike_hours'
  | 'cycling_power'
  | 'running_pace'
  | 'running_hr';

/**
 * Format a Monday date into a compact short code for 24W & 52W:
 * Day of month + first letter of month (e.g. 26/10/2026 -> 26O, 09/11/2026 -> 9N)
 */
export function formatWeekShortCode(mondayDate: Date | string): string {
  const d = new Date(mondayDate);
  if (isNaN(d.getTime())) return '';
  const day = d.getDate();
  const monthLetters = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const monthInitial = monthLetters[d.getMonth()] || '';
  return `${day}${monthInitial}`;
}

/**
 * Format month label for 24M & 36M:
 * Shows month initial (e.g. O, N, D), and adds 2-digit year on January (e.g. J'26)
 */
export function formatMonthShortCode(date: Date | string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const monthLetters = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const m = d.getMonth();
  const mInitial = monthLetters[m] || '';
  if (m === 0) {
    return `J'${String(d.getFullYear()).slice(-2)}`;
  }
  return mInitial;
}

interface WeeklyMileageChartProps {
  activities: StravaActivity[];
  activityDetails?: Record<string, StravaActivityDetailsRecord>;
  athleteProfile?: AthleteProfile;
  goals?: TrainingGoal[];
  theme?: 'dark' | 'light';
  onSelectActivity?: (activityId: string | number) => void;
  initialTab?: ChartDatasetTab;
}

export const WeeklyMileageChart: React.FC<WeeklyMileageChartProps> = ({
  activities,
  activityDetails,
  athleteProfile,
  goals,
  theme = 'dark',
  onSelectActivity,
  initialTab = 'tss',
}) => {
  const isLight = theme === 'light';
  const [activeTab, setActiveTab] = useState<ChartDatasetTab>(initialTab);
  const [granularity, setGranularity] = useState<TimeGranularity>('week');
  const [numWeeks, setNumWeeks] = useState<number>(12); // 8, 12, 24, 52 (4W removed)
  const [numMonths, setNumMonths] = useState<number>(12); // 12, 24, 36 (2, 3, 6 removed, 24, 36 added)
  const [unit, setUnit] = useState<'miles' | 'km'>('miles');
  const [metricType, setMetricType] = useState<'distance' | 'time'>('distance');
  const [tssDisciplineFilter, setTssDisciplineFilter] = useState<'all' | 'run' | 'bike' | 'swim'>('all');

  const [selectedTssWeek, setSelectedTssWeek] = useState<WeeklyTssBucket | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<WeeklyMileageBucket | null>(null);
  const [selectedSwimWeek, setSelectedSwimWeek] = useState<WeeklySwimBucket | null>(null);
  const [selectedBikeWeek, setSelectedBikeWeek] = useState<WeeklyBikeBucket | null>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const WEEK_FLAGS_STORAGE_KEY = 'fit_track_week_flags_v1';
  const [weekFlags, setWeekFlags] = useState<Record<string, 'normal' | 'deload' | 'race'>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(WEEK_FLAGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {}
    return {};
  });

  // Map Monday weekKey (YYYY-MM-DD) -> Goal Race occurring in that week
  const goalRaceByWeekKey = useMemo(() => {
    const map: Record<string, { name: string; priority: string; eventDate: string }> = {};
    const effectiveGoals = goals && goals.length > 0 ? goals : loadAthleteGoals();
    effectiveGoals.forEach((g) => {
      if (!g.eventDate || g.status === 'abandoned') return;
      const m = g.eventDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return;
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (isNaN(d.getTime())) return;
      const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon...
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const mon = new Date(d);
      mon.setDate(d.getDate() + diffToMonday);
      const yStr = mon.getFullYear();
      const mStr = String(mon.getMonth() + 1).padStart(2, '0');
      const dStr = String(mon.getDate()).padStart(2, '0');
      const weekKey = `${yStr}-${mStr}-${dStr}`;
      if (!map[weekKey] || g.priority === 'A') {
        map[weekKey] = {
          name: g.name,
          priority: g.priority || 'B',
          eventDate: g.eventDate,
        };
      }
    });
    return map;
  }, [goals]);

  // Effective week flag: explicit user choice ('normal' | 'deload' | 'race') overrides auto-detected Goal Race week
  const getEffectiveWeekFlag = (weekKey: string): 'deload' | 'race' | undefined => {
    if (granularity !== 'week' || !weekKey) return undefined;
    const explicit = weekFlags[weekKey];
    if (explicit === 'normal') return undefined;
    if (explicit === 'deload' || explicit === 'race') return explicit;
    if (goalRaceByWeekKey[weekKey]) return 'race';
    return undefined;
  };

  const handleSetWeekFlag = (weekKey: string, flag: 'normal' | 'deload' | 'race') => {
    if (!weekKey) return;
    setWeekFlags((prev) => {
      const next = { ...prev };
      if (flag === 'normal') {
        if (goalRaceByWeekKey[weekKey]) {
          // Store explicit 'normal' override when the week has a scheduled Goal Race
          next[weekKey] = 'normal';
        } else {
          delete next[weekKey];
        }
      } else {
        next[weekKey] = flag;
      }
      try {
        localStorage.setItem(WEEK_FLAGS_STORAGE_KEY, JSON.stringify(next));
        window.dispatchEvent(
          new CustomEvent('fittrack_local_storage_updated', { detail: { domains: ['week_flags'] } })
        );
      } catch {}
      return next;
    });
  };

  const renderWeekFlagSelector = (weekKey: string, weekShortLabel: string) => {
    if (granularity !== 'week' || !weekKey) return null;
    const effective = getEffectiveWeekFlag(weekKey);
    const currentFlag: 'normal' | 'deload' | 'race' = effective || 'normal';
    const autoGoal = goalRaceByWeekKey[weekKey];
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
          {weekShortLabel}:
        </span>
        <div
          className={`flex items-center p-0.5 rounded-lg border text-[10px] font-bold ${
            isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}
        >
          {(
            [
              { id: 'normal', label: 'Normal' },
              { id: 'deload', label: 'Deload Week' },
              { id: 'race', label: 'Race Week' },
            ] as const
          ).map((opt) => {
            const isActive = currentFlag === opt.id;
            const activeClass =
              opt.id === 'deload'
                ? 'bg-teal-500 text-slate-950 shadow-xs'
                : opt.id === 'race'
                ? 'bg-purple-500 text-white shadow-xs'
                : 'bg-[#FE9A00] text-slate-950 shadow-xs';
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSetWeekFlag(weekKey, opt.id)}
                className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                  isActive
                    ? activeClass
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-400 hover:text-white'
                }`}
                title={
                  opt.id === 'normal'
                    ? 'Include this week in normal baseline & ramp calculations'
                    : `Mark ${weekShortLabel} as a ${opt.label} to ignore it from baseline & ramp calculations`
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {autoGoal && currentFlag === 'race' && !weekFlags[weekKey] && (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-500/30"
            title={`Auto-detected from Goals (${autoGoal.eventDate})`}
          >
            Auto: {autoGoal.name}
          </span>
        )}
      </div>
    );
  };

  const computeMedian = (vals: number[]): number => {
    if (vals.length === 0) return 0;
    const sorted = [...vals].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const med = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    return Math.round(med * 10) / 10;
  };

  const getGenericPrior4NormalWeeks = <T extends { weekKey: string }>(
    sourceList: T[],
    targetWeekKey: string,
    getVal: (item: T) => number
  ) => {
    const targetIdx = sourceList.findIndex((w) => w.weekKey === targetWeekKey);
    if (targetIdx <= 0) return { baseline: 0, normalWeeks: [] as T[] };
    const collected: T[] = [];
    for (let j = targetIdx - 1; j >= 0 && collected.length < 4; j--) {
      const candidate = sourceList[j];
      const flag = getEffectiveWeekFlag(candidate.weekKey);
      if (flag === 'deload' || flag === 'race') continue;
      if (getVal(candidate) <= 0) continue;
      collected.push(candidate);
    }
    const vals = collected.map(getVal);
    return {
      baseline: computeMedian(vals),
      normalWeeks: collected,
    };
  };

  const currentPeriodCount = granularity === 'month' ? numMonths : numWeeks;

  // Compute TSS volume from activities
  const { weeks: tssWeeks, stats: tssStats } = useMemo(() => {
    return computeWeeklyTss(
      activities,
      activityDetails,
      athleteProfile,
      currentPeriodCount,
      granularity,
      tssDisciplineFilter
    );
  }, [activities, activityDetails, athleteProfile, currentPeriodCount, granularity, tssDisciplineFilter]);

  const extendedTssWeeks = useMemo(() => {
    if (granularity !== 'week') return [];
    return computeWeeklyTss(
      activities,
      activityDetails,
      athleteProfile,
      Math.max(currentPeriodCount + 8, 24),
      'week',
      tssDisciplineFilter
    ).weeks;
  }, [activities, activityDetails, athleteProfile, currentPeriodCount, granularity, tssDisciplineFilter]);

  // Compute Running volume
  const { weeks, stats } = useMemo(() => {
    return computeWeeklyRunningMileage(activities, currentPeriodCount, granularity);
  }, [activities, currentPeriodCount, granularity]);

  // Extended weekly running lookback so every visible week can find up to 4 prior normal weeks
  const extendedRunWeeks = useMemo(() => {
    if (granularity !== 'week') return [];
    return computeWeeklyRunningMileage(activities, Math.max(currentPeriodCount + 8, 24), 'week').weeks;
  }, [activities, currentPeriodCount, granularity]);

  // Compute Swim volume
  const { weeks: swimWeeks, stats: swimStats } = useMemo(() => {
    return computeWeeklySwimDistance(activities, currentPeriodCount, granularity);
  }, [activities, currentPeriodCount, granularity]);

  const extendedSwimWeeks = useMemo(() => {
    if (granularity !== 'week') return [];
    return computeWeeklySwimDistance(activities, Math.max(currentPeriodCount + 8, 24), 'week').weeks;
  }, [activities, currentPeriodCount, granularity]);

  // Compute Bike volume
  const { weeks: bikeWeeks, stats: bikeStats } = useMemo(() => {
    return computeWeeklyBikeHours(activities, currentPeriodCount, granularity);
  }, [activities, currentPeriodCount, granularity]);

  const extendedBikeWeeks = useMemo(() => {
    if (granularity !== 'week') return [];
    return computeWeeklyBikeHours(activities, Math.max(currentPeriodCount + 8, 24), 'week').weeks;
  }, [activities, currentPeriodCount, granularity]);

  // Reset selected period bucket whenever granularity or lookback range changes
  React.useEffect(() => {
    setSelectedTssWeek(null);
    setSelectedWeek(null);
    setSelectedSwimWeek(null);
    setSelectedBikeWeek(null);
  }, [granularity, numWeeks, numMonths, tssDisciplineFilter]);

  // Scroll to the right (current period) by default when data loads or lookback changes
  React.useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
    }
  }, [tssWeeks, weeks, swimWeeks, bikeWeeks, currentPeriodCount, granularity, activeTab]);

  // Active selected period or default to the most recent period
  const activeTssIdx = useMemo(() => {
    if (!tssWeeks.length) return -1;
    if (selectedTssWeek) {
      const found = tssWeeks.findIndex((w) => w.weekKey === selectedTssWeek.weekKey);
      if (found !== -1) return found;
    }
    return tssWeeks.length - 1;
  }, [tssWeeks, selectedTssWeek]);

  const activeRunIdx = useMemo(() => {
    if (!weeks.length) return -1;
    if (selectedWeek) {
      const found = weeks.findIndex((w) => w.weekKey === selectedWeek.weekKey);
      if (found !== -1) return found;
    }
    return weeks.length - 1;
  }, [weeks, selectedWeek]);

  const activeSwimIdx = useMemo(() => {
    if (!swimWeeks.length) return -1;
    if (selectedSwimWeek) {
      const found = swimWeeks.findIndex((w) => w.weekKey === selectedSwimWeek.weekKey);
      if (found !== -1) return found;
    }
    return swimWeeks.length - 1;
  }, [swimWeeks, selectedSwimWeek]);

  const activeBikeIdx = useMemo(() => {
    if (!bikeWeeks.length) return -1;
    if (selectedBikeWeek) {
      const found = bikeWeeks.findIndex((w) => w.weekKey === selectedBikeWeek.weekKey);
      if (found !== -1) return found;
    }
    return bikeWeeks.length - 1;
  }, [bikeWeeks, selectedBikeWeek]);

  const activeTssWeek = activeTssIdx >= 0 ? tssWeeks[activeTssIdx] : null;
  const activeWeek = activeRunIdx >= 0 ? weeks[activeRunIdx] : null;
  const activeSwimWeek = activeSwimIdx >= 0 ? swimWeeks[activeSwimIdx] : null;
  const activeBikeWeek = activeBikeIdx >= 0 ? bikeWeeks[activeBikeIdx] : null;

  // Peak Scale calculations
  const maxTssScale = useMemo(() => {
    const values = tssWeeks.map((w) => w.totalTss);
    const highest = Math.max(...values, 100);
    return Math.ceil(highest * 1.15);
  }, [tssWeeks]);

  const maxWeeklyRun = useMemo(() => {
    const values = weeks.map((w) =>
      metricType === 'distance' ? (unit === 'miles' ? w.distanceMiles : w.distanceKm) : w.movingHours
    );
    const highest = Math.max(...values, metricType === 'distance' ? 10 : 2);
    return Math.ceil(highest * 1.15);
  }, [weeks, unit, metricType]);

  const maxSwimScale = useMemo(() => {
    const values = swimWeeks.map((w) =>
      metricType === 'distance' ? (unit === 'miles' ? w.distanceMiles : w.distanceKm) : w.movingHours
    );
    const highest = Math.max(...values, metricType === 'distance' ? 2 : 1);
    return Math.ceil(highest * 1.15);
  }, [swimWeeks, unit, metricType]);

  const maxBikeScale = useMemo(() => {
    const values = bikeWeeks.map((w) =>
      metricType === 'distance' ? (unit === 'miles' ? w.distanceMiles : w.distanceKm) : w.movingHours
    );
    const highest = Math.max(...values, metricType === 'distance' ? 15 : 3);
    return Math.ceil(highest * 1.15);
  }, [bikeWeeks, unit, metricType]);

  // Same-day accumulated values for every period bar (TSS, Run, Swim, Bike)
  const tssSameDayByBar = useMemo(() => {
    return tssWeeks.map((w) => getSameDayAccumulatedInPeriod(w.items, granularity));
  }, [tssWeeks, granularity]);

  const runSameDayByBar = useMemo(() => {
    return weeks.map((w) => getSameDayAccumulatedInPeriod(w.runs, granularity));
  }, [weeks, granularity]);

  const swimSameDayByBar = useMemo(() => {
    return swimWeeks.map((w) => getSameDayAccumulatedInPeriod(w.swims, granularity));
  }, [swimWeeks, granularity]);

  const bikeSameDayByBar = useMemo(() => {
    return bikeWeeks.map((w) => getSameDayAccumulatedInPeriod(w.rides, granularity));
  }, [bikeWeeks, granularity]);

  // Previous period reference relative to active selected period (or current period by default)
  const prevTssPeriod = activeTssIdx > 0 ? tssWeeks[activeTssIdx - 1] : null;
  const prevSameDayTss = activeTssIdx > 0 ? tssSameDayByBar[activeTssIdx - 1] : null;

  const prevRunPeriod = activeRunIdx > 0 ? weeks[activeRunIdx - 1] : null;
  const prevSameDayRun = activeRunIdx > 0 ? runSameDayByBar[activeRunIdx - 1] : null;

  const prevSwimPeriod = activeSwimIdx > 0 ? swimWeeks[activeSwimIdx - 1] : null;
  const prevSameDaySwim = activeSwimIdx > 0 ? swimSameDayByBar[activeSwimIdx - 1] : null;

  const prevBikePeriod = activeBikeIdx > 0 ? bikeWeeks[activeBikeIdx - 1] : null;
  const prevSameDayBike = activeBikeIdx > 0 ? bikeSameDayByBar[activeBikeIdx - 1] : null;

  // Helper renderer for inside-activity Controls (Distance/Time FIRST, Miles/KM SECOND)
  const renderActivityControls = () => (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* 1. Metric Toggle: Distance / Time */}
      <div className="flex items-center p-0.5 rounded-lg bg-slate-950/40 border border-slate-800 text-[11px] font-bold">
        <button
          type="button"
          onClick={() => setMetricType('distance')}
          className={`px-2 py-0.5 sm:py-1 rounded-md transition-colors cursor-pointer ${
            metricType === 'distance'
              ? 'bg-amber-500 text-slate-950 shadow-xs'
              : isLight
              ? 'text-slate-600 hover:text-slate-900'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Distance
        </button>
        <button
          type="button"
          onClick={() => setMetricType('time')}
          className={`px-2 py-0.5 sm:py-1 rounded-md transition-colors cursor-pointer ${
            metricType === 'time'
              ? 'bg-amber-500 text-slate-950 shadow-xs'
              : isLight
              ? 'text-slate-600 hover:text-slate-900'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Time
        </button>
      </div>

      {/* 2. Unit Toggle: Miles / KM (Greyed out when Time is selected) */}
      <div
        className={`flex items-center p-0.5 rounded-lg border text-[11px] font-bold transition-all ${
          metricType === 'time'
            ? 'opacity-35 pointer-events-none cursor-not-allowed bg-slate-950/20 border-slate-800/40 select-none'
            : 'bg-slate-950/40 border-slate-800'
        }`}
        title={metricType === 'time' ? 'Distance units inactive when Time is selected' : 'Choose distance unit'}
      >
        <button
          type="button"
          disabled={metricType === 'time'}
          onClick={() => setUnit('miles')}
          className={`px-2 py-0.5 sm:py-1 rounded-md transition-colors ${
            metricType === 'time'
              ? 'text-slate-500 cursor-not-allowed'
              : unit === 'miles'
              ? 'bg-amber-500 text-slate-950 shadow-xs cursor-pointer'
              : isLight
              ? 'text-slate-600 hover:text-slate-900 cursor-pointer'
              : 'text-slate-400 hover:text-white cursor-pointer'
          }`}
        >
          Miles
        </button>
        <button
          type="button"
          disabled={metricType === 'time'}
          onClick={() => setUnit('km')}
          className={`px-2 py-0.5 sm:py-1 rounded-md transition-colors ${
            metricType === 'time'
              ? 'text-slate-500 cursor-not-allowed'
              : unit === 'km'
              ? 'bg-amber-500 text-slate-950 shadow-xs cursor-pointer'
              : isLight
              ? 'text-slate-600 hover:text-slate-900 cursor-pointer'
              : 'text-slate-400 hover:text-white cursor-pointer'
          }`}
        >
          KM
        </button>
      </div>
    </div>
  );

  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 transition-colors ${
        isLight
          ? 'bg-white border-slate-200 shadow-xs'
          : 'bg-slate-900/60 border-slate-800'
      }`}
    >
      {/* Top Section: Charts Heading, Tabs, and Range Selectors */}
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800/80 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <BarChart2 className="w-5 h-5" />
            </div>
            <div>
              <h2
                className={`text-base sm:text-lg font-black tracking-tight ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}
              >
                Charts
              </h2>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Visual analytics for multidimensional training volume and zones
              </p>
            </div>
          </div>

          {/* Granularity (Week / Month) & Range Selectors */}
          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            {/* Week / Month Toggle */}
            <div className="flex items-center p-0.5 rounded-lg bg-slate-950/40 border border-slate-800 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setGranularity('week')}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  granularity === 'week'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Week
              </button>
              <button
                type="button"
                onClick={() => setGranularity('month')}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  granularity === 'month'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Month
              </button>
            </div>

            {/* Range Filter: 8W, 12W, 24W, 52W OR 12M, 24M, 36M (2, 3, 6 removed) */}
            <div className="flex items-center p-0.5 rounded-lg bg-slate-950/40 border border-slate-800 text-[11px] font-bold">
              {granularity === 'week'
                ? [
                    { label: '8W', value: 8 },
                    { label: '12W', value: 12 },
                    { label: '24W', value: 24 },
                    { label: '52W', value: 52 },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setNumWeeks(option.value)}
                      className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                        numWeeks === option.value
                          ? 'bg-amber-500 text-slate-950 shadow-xs'
                          : isLight
                          ? 'text-slate-600 hover:text-slate-900'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))
                : [
                    { label: '12M', value: 12 },
                    { label: '24M', value: 24 },
                    { label: '36M', value: 36 },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setNumMonths(option.value)}
                      className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                        numMonths === option.value
                          ? 'bg-amber-500 text-slate-950 shadow-xs'
                          : isLight
                          ? 'text-slate-600 hover:text-slate-900'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
            </div>
          </div>
        </div>

        {/* Dataset Switch Tabs */}
        <div className="overflow-x-auto scrollbar-none pt-1">
          <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-950/40 border border-slate-800 text-[11px] font-bold">
            {[
              { id: 'tss', label: 'TSS' },
              { id: 'mileage', label: 'Run' },
              { id: 'swim_distance', label: 'Swim' },
              { id: 'bike_hours', label: 'Bike' },
              { id: 'cycling_power', label: 'Cycling Power Zones' },
              { id: 'running_pace', label: 'Running Pace Zones' },
              { id: 'running_hr', label: 'Running Heart Rate Zones' },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              const isSwimTab = tab.id === 'swim_distance';
              const isBikeTab = tab.id === 'bike_hours' || tab.id === 'cycling_power';
              const isRunTab = tab.id === 'mileage' || tab.id === 'running_pace' || tab.id === 'running_hr';

              const activeClass = isSwimTab
                ? 'bg-sky-500 text-slate-950 shadow-xs'
                : isBikeTab
                ? 'bg-orange-500 text-slate-950 shadow-xs'
                : isRunTab
                ? 'bg-rose-500 text-white shadow-xs'
                : 'bg-amber-500 text-slate-950 shadow-xs';

              const inactiveClass = isSwimTab
                ? isLight
                  ? 'text-sky-700 hover:text-sky-900'
                  : 'text-sky-400 hover:text-sky-300'
                : isBikeTab
                ? isLight
                  ? 'text-orange-700 hover:text-orange-900'
                  : 'text-orange-400 hover:text-orange-300'
                : isRunTab
                ? isLight
                  ? 'text-rose-700 hover:text-rose-900'
                  : 'text-rose-400 hover:text-rose-300'
                : isLight
                ? 'text-slate-600 hover:text-slate-900'
                : 'text-slate-400 hover:text-white';

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as ChartDatasetTab)}
                  className={`px-2 py-1 rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                    isActive ? activeClass : inactiveClass
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* TSS SECTION */}
      {activeTab === 'tss' && (() => {
        const currentVal = activeTssWeek?.totalTss || 0;
        const activeSameDay = activeTssIdx >= 0 ? tssSameDayByBar[activeTssIdx] : null;
        const activeSameDayVal = activeSameDay ? activeSameDay.tss : currentVal;

        const normalTssWeeks =
          granularity === 'week'
            ? tssWeeks.filter((w) => !getEffectiveWeekFlag(w.weekKey))
            : tssWeeks;

        const avgVal =
          granularity === 'week' && normalTssWeeks.length > 0
            ? Math.round(
                normalTssWeeks.reduce((acc, w) => acc + w.totalTss, 0) / normalTssWeeks.length
              )
            : tssStats.averageWeeklyTss;

        const activeTssBaselineInfo =
          granularity === 'week' && activeTssWeek
            ? getGenericPrior4NormalWeeks(
                extendedTssWeeks.length > 0 ? extendedTssWeeks : tssWeeks,
                activeTssWeek.weekKey,
                (w) => w.totalTss
              )
            : { baseline: 0, normalWeeks: [] as WeeklyTssBucket[] };

        const tssBaselineVal =
          granularity === 'week'
            ? activeTssBaselineInfo.baseline > 0
              ? Math.round(activeTssBaselineInfo.baseline)
              : Math.round(
                  computeMedian(
                    normalTssWeeks
                      .filter((w) => w.totalTss > 0)
                      .slice(-4)
                      .map((w) => w.totalTss)
                  )
                )
            : avgVal;

        const peakVal = tssStats.peakWeekTss;
        const totalVal = tssStats.totalTss;

        const metricUnitLabel = 'TSS';
        const rateUnitLabel = `TSS/${granularity === 'month' ? 'mo' : 'wk'}`;
        const periodShortLabel = granularity === 'month' ? 'mo' : 'wk';

        const prevSameDayVal = prevSameDayTss ? prevSameDayTss.tss : 0;
        const prevFullVal = prevTssPeriod ? prevTssPeriod.totalTss : 0;

        const compareBaseVal = activeTssWeek?.isCurrentWeek ? currentVal : activeSameDayVal;
        let sameDayChangePct: number | null = null;
        if (prevSameDayVal > 0) {
          sameDayChangePct = Math.round(((compareBaseVal - prevSameDayVal) / prevSameDayVal) * 100);
        } else if (prevFullVal > 0) {
          sameDayChangePct = Math.round(((currentVal - prevFullVal) / prevFullVal) * 100);
        } else if (compareBaseVal > 0 && prevTssPeriod) {
          sameDayChangePct = 100;
        }

        const avgPerActivity =
          tssStats.totalActivities > 0 ? Math.round(tssStats.totalTss / tssStats.totalActivities) : 0;
        const activeTssFlag = activeTssWeek ? getEffectiveWeekFlag(activeTssWeek.weekKey) : undefined;

        return (
          <div className="pt-2">
            {/* Subheader: TSS + Badge + Discipline Filter */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 pb-2">
              <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                <h3 className={`text-sm sm:text-base font-extrabold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Training Stress Score (TSS)
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/20">
                  {granularity === 'month' ? 'Monthly' : 'Mon – Sun'}
                </span>

                {/* Discipline Filter for TSS */}
                <div className="flex items-center p-0.5 rounded-lg bg-slate-950/40 border border-slate-800 text-[11px] font-bold">
                  {[
                    { id: 'all' as const, label: 'All' },
                    { id: 'run' as const, label: 'Run' },
                    { id: 'bike' as const, label: 'Bike' },
                    { id: 'swim' as const, label: 'Swim' },
                  ].map((opt) => {
                    const isActive = tssDisciplineFilter === opt.id;
                    const activeCls =
                      opt.id === 'swim'
                        ? 'bg-sky-500 text-slate-950 shadow-xs'
                        : opt.id === 'bike'
                        ? 'bg-orange-500 text-slate-950 shadow-xs'
                        : opt.id === 'run'
                        ? 'bg-rose-500 text-white shadow-xs'
                        : 'bg-amber-500 text-slate-950 shadow-xs';
                    const inactiveCls =
                      opt.id === 'swim'
                        ? isLight
                          ? 'text-sky-700 hover:text-sky-900'
                          : 'text-sky-400 hover:text-sky-300'
                        : opt.id === 'bike'
                        ? isLight
                          ? 'text-orange-700 hover:text-orange-900'
                          : 'text-orange-400 hover:text-orange-300'
                        : opt.id === 'run'
                        ? isLight
                          ? 'text-rose-700 hover:text-rose-900'
                          : 'text-rose-400 hover:text-rose-300'
                        : isLight
                        ? 'text-slate-600 hover:text-slate-900'
                        : 'text-slate-400 hover:text-white';
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setTssDisciplineFilter(opt.id)}
                        className={`px-2 py-0.5 sm:py-1 rounded-md transition-colors cursor-pointer ${
                          isActive ? activeCls : inactiveCls
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 my-4">
              <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    {activeTssWeek && !activeTssWeek.isCurrentWeek
                      ? activeTssWeek.shortLabel
                      : granularity === 'month'
                      ? 'This Month'
                      : 'This Week'}
                  </span>
                  {granularity === 'week' && activeTssFlag && (
                    <span
                      className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        activeTssFlag === 'deload'
                          ? 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/30'
                          : 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30'
                      }`}
                    >
                      {activeTssFlag === 'deload' ? 'Deload' : 'Race Week'}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-amber-500">{currentVal}</span>
                  <span className="text-xs text-slate-500 font-bold">{metricUnitLabel}</span>
                </div>
                {prevSameDayVal > 0 ? (
                  <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold">
                    {sameDayChangePct !== null && sameDayChangePct >= 0 ? (
                      <span className="text-emerald-500 flex items-center gap-0.5">
                        <ArrowUpRight className="w-3 h-3 shrink-0" />
                        {prevSameDayVal} TSS by same day last {periodShortLabel} (+{sameDayChangePct}%)
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center gap-0.5">
                        <ArrowDownRight className="w-3 h-3 shrink-0" />
                        {prevSameDayVal} TSS by same day last {periodShortLabel} ({sameDayChangePct}%)
                      </span>
                    )}
                  </div>
                ) : prevFullVal > 0 ? (
                  <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold">
                    {sameDayChangePct !== null && sameDayChangePct >= 0 ? (
                      <span className="text-emerald-500 flex items-center gap-0.5">
                        <ArrowUpRight className="w-3 h-3 shrink-0" />
                        0 TSS by same day ({prevFullVal} TSS last {periodShortLabel})
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center gap-0.5">
                        <ArrowDownRight className="w-3 h-3 shrink-0" />
                        0 TSS by same day ({prevFullVal} TSS last {periodShortLabel})
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="mt-1 text-[10px] text-slate-500 font-semibold">
                    0 TSS by same day last {periodShortLabel}
                  </div>
                )}
              </div>

              <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  {granularity === 'month' ? 'Monthly Average' : '4W Normal Baseline (Median)'}
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-sky-400">
                    {granularity === 'week' ? tssBaselineVal : avgVal}
                  </span>
                  <span className="text-xs text-slate-500 font-bold">{rateUnitLabel}</span>
                </div>
                <span className="text-[10px] text-slate-500">
                  {granularity === 'week'
                    ? `Avg: ${avgVal} ${rateUnitLabel}${avgPerActivity > 0 ? ` • ${avgPerActivity} TSS/workout` : ''}`
                    : avgPerActivity > 0
                    ? `${avgPerActivity} TSS average per workout`
                    : `Over ${currentPeriodCount} months`}
                </span>
              </div>

              <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  {granularity === 'month' ? 'Peak Month' : 'Peak Week'}
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-emerald-400">{peakVal}</span>
                  <span className="text-xs text-slate-500 font-bold">{metricUnitLabel}</span>
                </div>
                <span className="text-[10px] text-slate-500 truncate block">{tssStats.peakWeekLabel || 'None'}</span>
              </div>

              <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Total Load</span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-purple-400">{totalVal}</span>
                  <span className="text-xs text-slate-500 font-bold">{metricUnitLabel}</span>
                </div>
                <span className="text-[10px] text-slate-500">
                  {tssStats.totalActivities} workouts ({tssStats.totalRunTss}R / {tssStats.totalBikeTss}B / {tssStats.totalSwimTss}S)
                </span>
              </div>
            </div>

            {/* Chart Area */}
            <div className="space-y-2 mt-4">
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span className="flex items-center gap-1.5 font-medium">
                  <Flame className="w-3.5 h-3.5 text-rose-500" />
                  Training Stress Score (TSS) per {granularity}
                </span>
                <span className="font-mono text-[11px]">Peak Scale: {maxTssScale} TSS</span>
              </div>

              <div className="-mx-4 sm:-mx-5 overflow-x-auto scrollbar-thin pb-2" ref={scrollContainerRef}>
                <div className={`relative pt-6 pb-1 ${currentPeriodCount >= 36 ? 'min-w-[620px] sm:min-w-full' : currentPeriodCount === 52 ? 'min-w-[560px] sm:min-w-full' : 'w-full'}`}>
                  {/* Dedicated 0-100% Bar Plot Area */}
                  <div className="relative h-44 sm:h-52 w-full">
                    {(granularity === 'week' ? tssBaselineVal : avgVal) > 0 && (
                      <div
                        className="absolute left-0 right-0 border-b-2 border-dotted border-red-500 z-20 pointer-events-none"
                        style={{
                          bottom: `${Math.min(
                            92,
                            ((granularity === 'week' ? tssBaselineVal : avgVal) / maxTssScale) * 100
                          )}%`,
                        }}
                      >
                        <span className="absolute right-2 -top-4 text-[10px] font-mono font-bold text-black bg-white/95 border border-slate-300 px-1.5 py-0.5 rounded shadow-sm">
                          {granularity === 'week' ? `Baseline (4w Med): ${tssBaselineVal} TSS` : `Avg: ${avgVal} TSS`}
                        </span>
                      </div>
                    )}

                    <div className={`h-full w-full flex items-end ${currentPeriodCount >= 36 ? 'gap-[1px] sm:gap-[1.5px]' : currentPeriodCount === 52 ? 'gap-[1.5px]' : 'gap-[3px]'} px-0 relative z-10`}>
                      {tssWeeks.map((w, idx) => {
                        const val = w.totalTss;
                        const wFlag = getEffectiveWeekFlag(w.weekKey);
                        const heightPct = Math.min(100, Math.max(val > 0 ? 6 : 2, (val / maxTssScale) * 100));
                        const isSelected = activeTssWeek?.weekKey === w.weekKey;

                        const barSameDay = tssSameDayByBar[idx];
                        const barSameDayVal = barSameDay ? barSameDay.tss : 0;
                        const lineVal = w.isCurrentWeek ? prevSameDayVal : barSameDayVal;
                        const rawLinePct = val > 0 && !w.isCurrentWeek
                          ? heightPct * Math.min(1, lineVal / val)
                          : Math.min(100, Math.max(0, (lineVal / maxTssScale) * 100));
                        const showBlueLine = lineVal > 0 || (!w.isCurrentWeek && val > 0);
                        const clampedLineStyle =
                          !w.isCurrentWeek && val > 0 && lineVal >= val
                            ? `calc(${heightPct}% - 2px)`
                            : `${Math.max(val > 0 && lineVal === 0 ? 2 : 0, rawLinePct)}%`;

                        return (
                          <div
                            key={w.weekKey}
                            onClick={() => setSelectedTssWeek(w)}
                            className="flex-1 min-w-0 h-full flex items-end cursor-pointer group relative"
                          >
                            {val > 0 && (
                              <div
                                style={{ bottom: `${heightPct}%` }}
                                className={`absolute left-1/2 -translate-x-1/2 mb-1 z-20 text-[10px] font-mono font-bold transition-all whitespace-nowrap pointer-events-none flex flex-col items-center ${
                                  isSelected
                                    ? 'text-amber-400 scale-110'
                                    : isLight
                                    ? 'text-slate-700 group-hover:text-amber-600'
                                    : 'text-slate-400 group-hover:text-amber-400'
                                } ${currentPeriodCount >= 24 && !isSelected ? 'hidden sm:block opacity-0 group-hover:opacity-100' : ''}`}
                              >
                                {wFlag && (
                                  <span
                                    className={`text-[8px] px-1 rounded uppercase tracking-tighter mb-0.5 ${
                                      wFlag === 'deload'
                                        ? 'bg-teal-500/20 text-teal-600 dark:text-teal-300 border border-teal-500/40'
                                        : 'bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/40'
                                    }`}
                                  >
                                    {wFlag === 'deload' ? 'Deload' : 'Race'}
                                  </span>
                                )}
                                <span>{val}</span>
                              </div>
                            )}

                            {showBlueLine && (
                              <div
                                className="absolute left-0 right-0 z-30 pointer-events-none"
                                style={{ bottom: clampedLineStyle }}
                                title={
                                  w.isCurrentWeek
                                    ? `By same day last ${granularity === 'month' ? 'month' : 'week'}: ${lineVal} TSS`
                                    : `By same day in ${w.shortLabel}: ${lineVal} TSS (Total: ${val} TSS)`
                                }
                              >
                                <div className="w-full border-b-2 border-dotted border-blue-950 dark:border-blue-300 shadow-[0_0_2px_rgba(255,255,255,0.7)]" />
                              </div>
                            )}

                            <div
                              className="w-full relative rounded-t-sm transition-all duration-300 border border-black box-border"
                              style={{
                                height: `${heightPct}%`,
                                backgroundColor:
                                  val === 0
                                    ? isLight
                                      ? '#e2e8f0'
                                      : '#1e293b'
                                    : isSelected
                                    ? '#f59e0b'
                                    : wFlag === 'deload'
                                    ? isLight
                                      ? '#5eead4'
                                      : '#0d9488'
                                    : wFlag === 'race'
                                    ? isLight
                                      ? '#c084fc'
                                      : '#9333ea'
                                    : w.isCurrentWeek
                                    ? '#fbbf24'
                                    : isLight
                                    ? '#38bdf8'
                                    : '#0284c7',
                                opacity: val === 0 ? 0.35 : isSelected ? 1 : wFlag ? 0.72 : 0.85,
                                boxShadow: isSelected ? '0 0 12px rgba(245, 158, 11, 0.45)' : undefined,
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Date labels row below the 0-100% bar plot area */}
                  <div className={`mt-2 w-full flex items-center ${currentPeriodCount >= 36 ? 'gap-[1px] sm:gap-[1.5px]' : currentPeriodCount === 52 ? 'gap-[1.5px]' : 'gap-[3px]'}`}>
                    {tssWeeks.map((w) => {
                      const isSelected = activeTssWeek?.weekKey === w.weekKey;
                      const wFlag = getEffectiveWeekFlag(w.weekKey);
                      return (
                        <div
                          key={`lbl-${w.weekKey}`}
                          onClick={() => setSelectedTssWeek(w)}
                          className="flex-1 min-w-0 text-center px-0.5 cursor-pointer"
                        >
                          <span
                            className={`text-[9px] ${currentPeriodCount >= 24 ? 'text-[8px] sm:text-[9px]' : ''} font-mono block truncate ${
                              isSelected
                                ? 'text-amber-500 font-bold'
                                : wFlag === 'deload'
                                ? 'text-teal-500 font-semibold'
                                : wFlag === 'race'
                                ? 'text-purple-500 font-semibold'
                                : w.isCurrentWeek
                                ? 'text-amber-400 font-semibold'
                                : isLight
                                ? 'text-slate-500'
                                : 'text-slate-400'
                            }`}
                            title={w.weekLabel}
                          >
                            {granularity === 'month'
                              ? currentPeriodCount > 12
                                ? formatMonthShortCode(w.mondayDate)
                                : w.shortLabel
                              : currentPeriodCount >= 24
                              ? formatWeekShortCode(w.mondayDate)
                              : w.shortLabel.replace(/^[A-Za-z]+ /, '')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Selected Period TSS Breakdown */}
            {activeTssWeek && (
              <div className={`mt-4 p-3.5 rounded-xl border ${isLight ? 'bg-rose-50/40 border-rose-200 text-slate-900' : 'bg-slate-950/70 border-slate-800 text-slate-200'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Calendar className="w-4 h-4 text-rose-500" />
                    <span className="text-xs font-bold">
                      {activeTssWeek.weekLabel} {activeTssWeek.isCurrentWeek ? '(Current)' : ''}
                    </span>
                    {renderWeekFlagSelector(activeTssWeek.weekKey, 'Week Type')}
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono flex-wrap">
                    <span className="font-bold text-rose-500">
                      {activeTssWeek.totalTss} TSS ({activeTssWeek.movingHours} hrs)
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Run {activeTssWeek.runTss} • Bike {activeTssWeek.bikeTss} • Swim {activeTssWeek.swimTss}
                      {activeTssWeek.otherTss > 0 ? ` • Other ${activeTssWeek.otherTss}` : ''}
                    </span>
                    <span className="text-slate-400">{activeTssWeek.activitiesCount} workouts</span>
                  </div>
                </div>

                {activeTssWeek.items.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">No workouts with TSS logged in this period.</p>
                ) : (
                  <div className="mt-2.5 divide-y divide-slate-200/60 dark:divide-slate-800/60">
                    {activeTssWeek.items.map((item) => {
                      const catColor =
                        item.category === 'Run'
                          ? 'text-rose-500'
                          : item.category === 'Bike'
                          ? 'text-orange-500'
                          : item.category === 'Swim'
                          ? 'text-sky-500'
                          : 'text-purple-400';
                      return (
                        <div
                          key={item.id}
                          onClick={() => onSelectActivity && onSelectActivity(item.id)}
                          className={`py-2 flex items-center justify-between text-xs transition-colors rounded-lg px-2 -mx-2 ${
                            onSelectActivity ? 'hover:bg-rose-500/10 cursor-pointer' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[11px] font-mono font-bold text-slate-400 shrink-0 w-8">{item.dayOfWeek}</span>
                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-800/60 ${catColor} shrink-0`}>
                              {item.category}
                            </span>
                            <span className="font-medium truncate">{item.name}</span>
                          </div>
                          <div className="flex items-center gap-2.5 font-mono shrink-0 text-[11px]">
                            <span className="text-slate-400 hidden sm:inline">{item.movingHours}h</span>
                            <span className="text-[10px] text-slate-500 hidden md:inline">{item.tssType}</span>
                            <span className="font-bold text-rose-400 flex items-center gap-0.5">
                              <Flame className="w-3 h-3" />
                              {item.tss} TSS
                            </span>
                            {onSelectActivity && <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* SWIM SECTION */}
      {activeTab === 'swim_distance' && (() => {
        const getSwimVal = (b: WeeklySwimBucket) =>
          metricType === 'distance'
            ? unit === 'miles'
              ? b.distanceMiles
              : b.distanceKm
            : b.movingHours;

        const currentVal = activeSwimWeek ? getSwimVal(activeSwimWeek) : 0;

        const activeSameDay = activeSwimIdx >= 0 ? swimSameDayByBar[activeSwimIdx] : null;
        const activeSameDayVal = activeSameDay
          ? metricType === 'distance'
            ? (unit === 'miles' ? activeSameDay.distanceMiles : activeSameDay.distanceKm)
            : activeSameDay.movingHours
          : currentVal;

        const normalSwimWeeks =
          granularity === 'week'
            ? swimWeeks.filter((w) => !getEffectiveWeekFlag(w.weekKey))
            : swimWeeks;

        const rawSwimAvg =
          metricType === 'distance'
            ? unit === 'miles'
              ? swimStats.averageWeeklyMiles
              : swimStats.averageWeeklyKm
            : swimStats.averageWeeklyHours;

        const avgVal =
          granularity === 'week' && normalSwimWeeks.length > 0
            ? Math.round(
                (normalSwimWeeks.reduce((acc, w) => acc + getSwimVal(w), 0) /
                  normalSwimWeeks.length) *
                  10
              ) / 10
            : rawSwimAvg;

        const activeSwimBaselineInfo =
          granularity === 'week' && activeSwimWeek
            ? getGenericPrior4NormalWeeks(
                extendedSwimWeeks.length > 0 ? extendedSwimWeeks : swimWeeks,
                activeSwimWeek.weekKey,
                getSwimVal
              )
            : { baseline: 0, normalWeeks: [] as WeeklySwimBucket[] };

        const swimBaselineVal =
          granularity === 'week'
            ? activeSwimBaselineInfo.baseline > 0
              ? activeSwimBaselineInfo.baseline
              : computeMedian(
                  normalSwimWeeks
                    .filter((w) => getSwimVal(w) > 0)
                    .slice(-4)
                    .map(getSwimVal)
                )
            : avgVal;

        const peakVal =
          metricType === 'distance'
            ? unit === 'miles'
              ? swimStats.peakWeekMiles
              : swimStats.peakWeekKm
            : swimStats.peakWeekHours;

        const totalVal =
          metricType === 'distance'
            ? unit === 'miles'
              ? swimStats.totalMiles
              : swimStats.totalKm
            : swimStats.totalHours;

        const metricUnitLabel = metricType === 'distance' ? unit : 'hrs';
        const rateUnitLabel =
          metricType === 'distance'
            ? `${unit}/${granularity === 'month' ? 'mo' : 'wk'}`
            : `hrs/${granularity === 'month' ? 'mo' : 'wk'}`;

        // Same-day previous period calculation
        const prevSameDayVal = prevSameDaySwim
          ? metricType === 'distance'
            ? (unit === 'miles' ? prevSameDaySwim.distanceMiles : prevSameDaySwim.distanceKm)
            : prevSameDaySwim.movingHours
          : 0;

        const prevFullVal = prevSwimPeriod
          ? metricType === 'distance'
            ? (unit === 'miles' ? prevSwimPeriod.distanceMiles : prevSwimPeriod.distanceKm)
            : prevSwimPeriod.movingHours
          : 0;

        const compareBaseVal = activeSwimWeek?.isCurrentWeek ? currentVal : activeSameDayVal;
        let sameDayChangePct: number | null = null;
        if (prevSameDayVal > 0) {
          sameDayChangePct = Math.round(((compareBaseVal - prevSameDayVal) / prevSameDayVal) * 100);
        } else if (prevFullVal > 0) {
          sameDayChangePct = Math.round(((currentVal - prevFullVal) / prevFullVal) * 100);
        } else if (compareBaseVal > 0 && prevSwimPeriod) {
          sameDayChangePct = 100;
        }

        const shortUnitLabel = metricType === 'distance' ? (unit === 'miles' ? 'Mi' : 'KM') : 'h';
        const periodShortLabel = granularity === 'month' ? 'mo' : 'wk';
        const avgPerSwim = swimStats.totalSwims > 0
          ? (metricType === 'distance'
              ? (unit === 'miles' ? swimStats.totalMiles / swimStats.totalSwims : swimStats.totalKm / swimStats.totalSwims)
              : swimStats.totalHours / swimStats.totalSwims)
          : 0;

        const activeSwimFlag = activeSwimWeek ? getEffectiveWeekFlag(activeSwimWeek.weekKey) : undefined;

        return (
          <div className="pt-2">
            {/* Subheader: Swim + Badge + Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 pb-2">
              <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                <h3 className={`text-sm sm:text-base font-extrabold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Swim
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/20">
                  {granularity === 'month' ? 'Monthly' : 'Mon – Sun'}
                </span>
                {renderActivityControls()}
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 my-4">
              <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    {activeSwimWeek && !activeSwimWeek.isCurrentWeek
                      ? activeSwimWeek.shortLabel
                      : granularity === 'month'
                      ? 'This Month'
                      : 'This Week'}
                  </span>
                  {granularity === 'week' && activeSwimFlag && (
                    <span
                      className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        activeSwimFlag === 'deload'
                          ? 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/30'
                          : 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30'
                      }`}
                    >
                      {activeSwimFlag === 'deload' ? 'Deload' : 'Race Week'}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-amber-500">{currentVal}</span>
                  <span className="text-xs text-slate-500 font-bold">{metricUnitLabel}</span>
                </div>
                {prevSameDayVal > 0 ? (
                  <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold">
                    {sameDayChangePct !== null && sameDayChangePct >= 0 ? (
                      <span className="text-emerald-500 flex items-center gap-0.5">
                        <ArrowUpRight className="w-3 h-3 shrink-0" />
                        {prevSameDayVal}{shortUnitLabel} by same day last {periodShortLabel} (+{sameDayChangePct}%)
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center gap-0.5">
                        <ArrowDownRight className="w-3 h-3 shrink-0" />
                        {prevSameDayVal}{shortUnitLabel} by same day last {periodShortLabel} ({sameDayChangePct}%)
                      </span>
                    )}
                  </div>
                ) : prevFullVal > 0 ? (
                  <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold">
                    {sameDayChangePct !== null && sameDayChangePct >= 0 ? (
                      <span className="text-emerald-500 flex items-center gap-0.5">
                        <ArrowUpRight className="w-3 h-3 shrink-0" />
                        0{shortUnitLabel} by same day ({prevFullVal}{shortUnitLabel} last {periodShortLabel})
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center gap-0.5">
                        <ArrowDownRight className="w-3 h-3 shrink-0" />
                        0{shortUnitLabel} by same day ({prevFullVal}{shortUnitLabel} last {periodShortLabel})
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="mt-1 text-[10px] text-slate-500 font-semibold">
                    0{shortUnitLabel} by same day last {periodShortLabel}
                  </div>
                )}
              </div>

              <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  {granularity === 'month' ? 'Monthly Average' : '4W Normal Baseline (Median)'}
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-sky-400">
                    {granularity === 'week' ? swimBaselineVal : avgVal}
                  </span>
                  <span className="text-xs text-slate-500 font-bold">{rateUnitLabel}</span>
                </div>
                <span className="text-[10px] text-slate-500">
                  {granularity === 'week'
                    ? `Avg: ${avgVal} ${rateUnitLabel}${avgPerSwim > 0 ? ` • ${avgPerSwim.toFixed(2)}${shortUnitLabel}/swim` : ''}`
                    : avgPerSwim > 0
                    ? `${avgPerSwim.toFixed(2)}${shortUnitLabel} average per swim`
                    : `Over ${currentPeriodCount} months`}
                </span>
              </div>

              <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  {granularity === 'month' ? 'Peak Month' : 'Peak Week'}
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-emerald-400">{peakVal}</span>
                  <span className="text-xs text-slate-500 font-bold">{metricUnitLabel}</span>
                </div>
                <span className="text-[10px] text-slate-500 truncate block">{swimStats.peakWeekLabel || 'None'}</span>
              </div>

              <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Total Volume</span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-purple-400">{totalVal}</span>
                  <span className="text-xs text-slate-500 font-bold">{metricUnitLabel}</span>
                </div>
                <span className="text-[10px] text-slate-500">{swimStats.totalSwims} total swims</span>
              </div>
            </div>

            {/* Chart Area */}
            <div className="space-y-2 mt-4">
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span className="flex items-center gap-1.5 font-medium">
                  <BarChart2 className="w-3.5 h-3.5 text-sky-500" />
                  Swim {metricType === 'distance' ? `distance (${unit})` : 'moving time (hours)'} per {granularity}
                </span>
                <span className="font-mono text-[11px]">Peak Scale: {maxSwimScale} {metricUnitLabel}</span>
              </div>

              <div className="-mx-4 sm:-mx-5 overflow-x-auto scrollbar-thin pb-2" ref={scrollContainerRef}>
                <div className={`relative pt-6 pb-1 ${currentPeriodCount >= 36 ? 'min-w-[620px] sm:min-w-full' : currentPeriodCount === 52 ? 'min-w-[560px] sm:min-w-full' : 'w-full'}`}>
                  {/* Dedicated 0-100% Bar Plot Area */}
                  <div className="relative h-44 sm:h-52 w-full">
                    {(granularity === 'week' ? swimBaselineVal : avgVal) > 0 && (
                      <div
                        className="absolute left-0 right-0 border-b-2 border-dotted border-red-500 z-20 pointer-events-none"
                        style={{
                          bottom: `${Math.min(
                            92,
                            ((granularity === 'week' ? swimBaselineVal : avgVal) / maxSwimScale) * 100
                          )}%`,
                        }}
                      >
                        <span className="absolute right-2 -top-4 text-[10px] font-mono font-bold text-black bg-white/95 border border-slate-300 px-1.5 py-0.5 rounded shadow-sm">
                          {granularity === 'week'
                            ? `Baseline (4w Med): ${swimBaselineVal} ${metricUnitLabel}`
                            : `Avg: ${avgVal} ${metricUnitLabel}`}
                        </span>
                      </div>
                    )}

                    <div className={`h-full w-full flex items-end ${currentPeriodCount >= 36 ? 'gap-[1px] sm:gap-[1.5px]' : currentPeriodCount === 52 ? 'gap-[1.5px]' : 'gap-[3px]'} px-0 relative z-10`}>
                      {swimWeeks.map((w, idx) => {
                        const val = getSwimVal(w);
                        const wFlag = getEffectiveWeekFlag(w.weekKey);
                        const heightPct = Math.min(100, Math.max(val > 0 ? 6 : 2, (val / maxSwimScale) * 100));
                        const isSelected = activeSwimWeek?.weekKey === w.weekKey;

                        // Same-day accumulated value in this period bar (or previous period comparison on current bar)
                        const barSameDay = swimSameDayByBar[idx];
                        const barSameDayVal = barSameDay
                          ? metricType === 'distance'
                            ? (unit === 'miles' ? barSameDay.distanceMiles : barSameDay.distanceKm)
                            : barSameDay.movingHours
                          : 0;
                        const lineVal = w.isCurrentWeek ? prevSameDayVal : barSameDayVal;
                        const rawLinePct = val > 0 && !w.isCurrentWeek
                          ? heightPct * Math.min(1, lineVal / val)
                          : Math.min(100, Math.max(0, (lineVal / maxSwimScale) * 100));
                        const showBlueLine = lineVal > 0 || (!w.isCurrentWeek && val > 0);
                        const clampedLineStyle =
                          !w.isCurrentWeek && val > 0 && lineVal >= val
                            ? `calc(${heightPct}% - 2px)`
                            : `${Math.max(val > 0 && lineVal === 0 ? 2 : 0, rawLinePct)}%`;

                        return (
                          <div
                            key={w.weekKey}
                            onClick={() => setSelectedSwimWeek(w)}
                            className="flex-1 min-w-0 h-full flex items-end cursor-pointer group relative"
                          >
                            {/* Value on hover / select positioned directly above the bar */}
                            {val > 0 && (
                              <div
                                style={{ bottom: `${heightPct}%` }}
                                className={`absolute left-1/2 -translate-x-1/2 mb-1 z-20 text-[10px] font-mono font-bold transition-all whitespace-nowrap pointer-events-none flex flex-col items-center ${
                                  isSelected
                                    ? 'text-amber-400 scale-110'
                                    : isLight
                                    ? 'text-slate-700 group-hover:text-amber-600'
                                    : 'text-slate-400 group-hover:text-amber-400'
                                } ${currentPeriodCount >= 24 && !isSelected ? 'hidden sm:block opacity-0 group-hover:opacity-100' : ''}`}
                              >
                                {wFlag && (
                                  <span
                                    className={`text-[8px] px-1 rounded uppercase tracking-tighter mb-0.5 ${
                                      wFlag === 'deload'
                                        ? 'bg-teal-500/20 text-teal-600 dark:text-teal-300 border border-teal-500/40'
                                        : 'bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/40'
                                    }`}
                                  >
                                    {wFlag === 'deload' ? 'Deload' : 'Race'}
                                  </span>
                                )}
                                <span>{val}</span>
                              </div>
                            )}

                            {/* Blue dotted comparison line across period bar */}
                            {showBlueLine && (
                              <div
                                className="absolute left-0 right-0 z-30 pointer-events-none"
                                style={{ bottom: clampedLineStyle }}
                                title={
                                  w.isCurrentWeek
                                    ? `By same day last ${granularity === 'month' ? 'month' : 'week'}: ${lineVal} ${metricUnitLabel}`
                                    : `By same day in ${w.shortLabel}: ${lineVal} ${metricUnitLabel} (Total: ${val} ${metricUnitLabel})`
                                }
                              >
                                <div className="w-full border-b-2 border-dotted border-blue-950 dark:border-blue-300 shadow-[0_0_2px_rgba(255,255,255,0.7)]" />
                              </div>
                            )}

                            {/* Bar */}
                            <div
                              className="w-full relative rounded-t-sm transition-all duration-300 border border-black box-border"
                              style={{
                                height: `${heightPct}%`,
                                backgroundColor:
                                  val === 0
                                    ? isLight
                                      ? '#e2e8f0'
                                      : '#1e293b'
                                    : isSelected
                                    ? '#f59e0b'
                                    : wFlag === 'deload'
                                    ? isLight
                                      ? '#5eead4'
                                      : '#0d9488'
                                    : wFlag === 'race'
                                    ? isLight
                                      ? '#c084fc'
                                      : '#9333ea'
                                    : w.isCurrentWeek
                                    ? '#fbbf24'
                                    : isLight
                                    ? '#38bdf8'
                                    : '#0284c7',
                                opacity: val === 0 ? 0.35 : isSelected ? 1 : wFlag ? 0.72 : 0.85,
                                boxShadow: isSelected ? '0 0 12px rgba(245, 158, 11, 0.45)' : undefined,
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Date labels row below the 0-100% bar plot area */}
                  <div className={`mt-2 w-full flex items-center ${currentPeriodCount >= 36 ? 'gap-[1px] sm:gap-[1.5px]' : currentPeriodCount === 52 ? 'gap-[1.5px]' : 'gap-[3px]'}`}>
                    {swimWeeks.map((w) => {
                      const isSelected = activeSwimWeek?.weekKey === w.weekKey;
                      const wFlag = getEffectiveWeekFlag(w.weekKey);
                      return (
                        <div
                          key={`lbl-${w.weekKey}`}
                          onClick={() => setSelectedSwimWeek(w)}
                          className="flex-1 min-w-0 text-center px-0.5 cursor-pointer"
                        >
                          <span
                            className={`text-[9px] ${currentPeriodCount >= 24 ? 'text-[8px] sm:text-[9px]' : ''} font-mono block truncate ${
                              isSelected
                                ? 'text-amber-500 font-bold'
                                : wFlag === 'deload'
                                ? 'text-teal-500 font-semibold'
                                : wFlag === 'race'
                                ? 'text-purple-500 font-semibold'
                                : w.isCurrentWeek
                                ? 'text-amber-400 font-semibold'
                                : isLight
                                ? 'text-slate-500'
                                : 'text-slate-400'
                            }`}
                            title={w.weekLabel}
                          >
                            {granularity === 'month'
                              ? currentPeriodCount > 12
                                ? formatMonthShortCode(w.mondayDate)
                                : w.shortLabel
                              : currentPeriodCount >= 24
                              ? formatWeekShortCode(w.mondayDate)
                              : w.shortLabel.replace(/^[A-Za-z]+ /, '')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Selected Period Breakdown */}
            {activeSwimWeek && (
              <div className={`mt-4 p-3.5 rounded-xl border ${isLight ? 'bg-sky-50/50 border-sky-200 text-slate-900' : 'bg-slate-950/70 border-slate-800 text-slate-200'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Calendar className="w-4 h-4 text-sky-500" />
                    <span className="text-xs font-bold">{activeSwimWeek.weekLabel}</span>
                    {renderWeekFlagSelector(activeSwimWeek.weekKey, 'Week Type')}
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="font-bold text-sky-500">
                      {unit === 'miles' ? `${activeSwimWeek.distanceMiles} mi` : `${activeSwimWeek.distanceKm} km`} ({activeSwimWeek.movingHours} hrs)
                    </span>
                    <span className="text-slate-400">{activeSwimWeek.swimsCount} swims</span>
                  </div>
                </div>
                {activeSwimWeek.swims.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">No swim activities logged in this period.</p>
                ) : (
                  <div className="mt-2.5 divide-y divide-slate-200/60 dark:divide-slate-800/60">
                    {activeSwimWeek.swims.map((sw) => (
                      <div
                        key={sw.id}
                        onClick={() => onSelectActivity && onSelectActivity(sw.id)}
                        className={`py-2 flex items-center justify-between text-xs transition-colors rounded-lg px-2 -mx-2 ${onSelectActivity ? 'hover:bg-sky-500/10 cursor-pointer' : ''}`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-[11px] font-mono font-bold text-sky-500 shrink-0 w-8">{sw.dayOfWeek}</span>
                          <span className="font-medium truncate">{sw.name}</span>
                        </div>
                        <div className="flex items-center gap-3 font-mono shrink-0 text-[11px]">
                          <span className="font-bold">
                            {unit === 'miles' ? `${sw.distanceMiles} mi` : `${sw.distanceMeters}m`}
                          </span>
                          <span className="text-slate-400">{sw.avgPaceFormatted}</span>
                          {onSelectActivity && <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* BIKE SECTION */}
      {activeTab === 'bike_hours' && (() => {
        const getBikeVal = (b: WeeklyBikeBucket) =>
          metricType === 'distance'
            ? unit === 'miles'
              ? b.distanceMiles
              : b.distanceKm
            : b.movingHours;

        const currentVal = activeBikeWeek ? getBikeVal(activeBikeWeek) : 0;

        const activeSameDay = activeBikeIdx >= 0 ? bikeSameDayByBar[activeBikeIdx] : null;
        const activeSameDayVal = activeSameDay
          ? metricType === 'distance'
            ? (unit === 'miles' ? activeSameDay.distanceMiles : activeSameDay.distanceKm)
            : activeSameDay.movingHours
          : currentVal;

        const normalBikeWeeks =
          granularity === 'week'
            ? bikeWeeks.filter((w) => !getEffectiveWeekFlag(w.weekKey))
            : bikeWeeks;

        const rawBikeAvg =
          metricType === 'distance'
            ? unit === 'miles'
              ? bikeStats.averageWeeklyMiles
              : bikeStats.averageWeeklyKm
            : bikeStats.averageWeeklyHours;

        const avgVal =
          granularity === 'week' && normalBikeWeeks.length > 0
            ? Math.round(
                (normalBikeWeeks.reduce((acc, w) => acc + getBikeVal(w), 0) /
                  normalBikeWeeks.length) *
                  10
              ) / 10
            : rawBikeAvg;

        const activeBikeBaselineInfo =
          granularity === 'week' && activeBikeWeek
            ? getGenericPrior4NormalWeeks(
                extendedBikeWeeks.length > 0 ? extendedBikeWeeks : bikeWeeks,
                activeBikeWeek.weekKey,
                getBikeVal
              )
            : { baseline: 0, normalWeeks: [] as WeeklyBikeBucket[] };

        const bikeBaselineVal =
          granularity === 'week'
            ? activeBikeBaselineInfo.baseline > 0
              ? activeBikeBaselineInfo.baseline
              : computeMedian(
                  normalBikeWeeks
                    .filter((w) => getBikeVal(w) > 0)
                    .slice(-4)
                    .map(getBikeVal)
                )
            : avgVal;

        const peakVal =
          metricType === 'distance'
            ? unit === 'miles'
              ? bikeStats.peakWeekMiles
              : bikeStats.peakWeekKm
            : bikeStats.peakWeekHours;

        const totalVal =
          metricType === 'distance'
            ? unit === 'miles'
              ? bikeStats.totalMiles
              : bikeStats.totalKm
            : bikeStats.totalHours;

        const metricUnitLabel = metricType === 'distance' ? unit : 'hrs';
        const rateUnitLabel =
          metricType === 'distance'
            ? `${unit}/${granularity === 'month' ? 'mo' : 'wk'}`
            : `hrs/${granularity === 'month' ? 'mo' : 'wk'}`;

        // Same-day previous period calculation
        const prevSameDayVal = prevSameDayBike
          ? metricType === 'distance'
            ? (unit === 'miles' ? prevSameDayBike.distanceMiles : prevSameDayBike.distanceKm)
            : prevSameDayBike.movingHours
          : 0;

        const prevFullVal = prevBikePeriod
          ? metricType === 'distance'
            ? (unit === 'miles' ? prevBikePeriod.distanceMiles : prevBikePeriod.distanceKm)
            : prevBikePeriod.movingHours
          : 0;

        const compareBaseVal = activeBikeWeek?.isCurrentWeek ? currentVal : activeSameDayVal;
        let sameDayChangePct: number | null = null;
        if (prevSameDayVal > 0) {
          sameDayChangePct = Math.round(((compareBaseVal - prevSameDayVal) / prevSameDayVal) * 100);
        } else if (prevFullVal > 0) {
          sameDayChangePct = Math.round(((currentVal - prevFullVal) / prevFullVal) * 100);
        } else if (compareBaseVal > 0 && prevBikePeriod) {
          sameDayChangePct = 100;
        }

        const shortUnitLabel = metricType === 'distance' ? (unit === 'miles' ? 'Mi' : 'KM') : 'h';
        const periodShortLabel = granularity === 'month' ? 'mo' : 'wk';
        const avgPerRide = bikeStats.totalRides > 0
          ? (metricType === 'distance'
              ? (unit === 'miles' ? bikeStats.totalMiles / bikeStats.totalRides : bikeStats.totalKm / bikeStats.totalRides)
              : bikeStats.totalHours / bikeStats.totalRides)
          : 0;

        const activeBikeFlag = activeBikeWeek ? getEffectiveWeekFlag(activeBikeWeek.weekKey) : undefined;

        return (
          <div className="pt-2">
            {/* Subheader: Bike + Badge + Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 pb-2">
              <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                <h3 className={`text-sm sm:text-base font-extrabold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Bike
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-500/20">
                  {granularity === 'month' ? 'Monthly' : 'Mon – Sun'}
                </span>
                {renderActivityControls()}
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 my-4">
              <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    {activeBikeWeek && !activeBikeWeek.isCurrentWeek
                      ? activeBikeWeek.shortLabel
                      : granularity === 'month'
                      ? 'This Month'
                      : 'This Week'}
                  </span>
                  {granularity === 'week' && activeBikeFlag && (
                    <span
                      className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        activeBikeFlag === 'deload'
                          ? 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/30'
                          : 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30'
                      }`}
                    >
                      {activeBikeFlag === 'deload' ? 'Deload' : 'Race Week'}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-amber-500">{currentVal}</span>
                  <span className="text-xs text-slate-500 font-bold">{metricUnitLabel}</span>
                </div>
                {prevSameDayVal > 0 ? (
                  <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold">
                    {sameDayChangePct !== null && sameDayChangePct >= 0 ? (
                      <span className="text-emerald-500 flex items-center gap-0.5">
                        <ArrowUpRight className="w-3 h-3 shrink-0" />
                        {prevSameDayVal}{shortUnitLabel} by same day last {periodShortLabel} (+{sameDayChangePct}%)
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center gap-0.5">
                        <ArrowDownRight className="w-3 h-3 shrink-0" />
                        {prevSameDayVal}{shortUnitLabel} by same day last {periodShortLabel} ({sameDayChangePct}%)
                      </span>
                    )}
                  </div>
                ) : prevFullVal > 0 ? (
                  <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold">
                    {sameDayChangePct !== null && sameDayChangePct >= 0 ? (
                      <span className="text-emerald-500 flex items-center gap-0.5">
                        <ArrowUpRight className="w-3 h-3 shrink-0" />
                        0{shortUnitLabel} by same day ({prevFullVal}{shortUnitLabel} last {periodShortLabel})
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center gap-0.5">
                        <ArrowDownRight className="w-3 h-3 shrink-0" />
                        0{shortUnitLabel} by same day ({prevFullVal}{shortUnitLabel} last {periodShortLabel})
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="mt-1 text-[10px] text-slate-500 font-semibold">
                    0{shortUnitLabel} by same day last {periodShortLabel}
                  </div>
                )}
              </div>

              <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  {granularity === 'month' ? 'Monthly Average' : '4W Normal Baseline (Median)'}
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-orange-400">
                    {granularity === 'week' ? bikeBaselineVal : avgVal}
                  </span>
                  <span className="text-xs text-slate-500 font-bold">{rateUnitLabel}</span>
                </div>
                <span className="text-[10px] text-slate-500">
                  {granularity === 'week'
                    ? `Avg: ${avgVal} ${rateUnitLabel}${avgPerRide > 0 ? ` • ${avgPerRide.toFixed(2)}${shortUnitLabel}/ride` : ''}`
                    : avgPerRide > 0
                    ? `${avgPerRide.toFixed(2)}${shortUnitLabel} average per ride`
                    : `Over ${currentPeriodCount} months`}
                </span>
              </div>

              <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  {granularity === 'month' ? 'Peak Month' : 'Peak Week'}
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-emerald-400">{peakVal}</span>
                  <span className="text-xs text-slate-500 font-bold">{metricUnitLabel}</span>
                </div>
                <span className="text-[10px] text-slate-500 truncate block">{bikeStats.peakWeekLabel || 'None'}</span>
              </div>

              <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Total Volume</span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-purple-400">{totalVal}</span>
                  <span className="text-xs text-slate-500 font-bold">{metricUnitLabel}</span>
                </div>
                <span className="text-[10px] text-slate-500">{bikeStats.totalRides} total rides</span>
              </div>
            </div>

            {/* Chart Area */}
            <div className="space-y-2 mt-4">
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span className="flex items-center gap-1.5 font-medium">
                  <BarChart2 className="w-3.5 h-3.5 text-orange-500" />
                  Bike {metricType === 'distance' ? `distance (${unit})` : 'moving time (hours)'} per {granularity}
                </span>
                <span className="font-mono text-[11px]">Peak Scale: {maxBikeScale} {metricUnitLabel}</span>
              </div>

              <div className="-mx-4 sm:-mx-5 overflow-x-auto scrollbar-thin pb-2" ref={scrollContainerRef}>
                <div className={`relative pt-6 pb-1 ${currentPeriodCount >= 36 ? 'min-w-[620px] sm:min-w-full' : currentPeriodCount === 52 ? 'min-w-[560px] sm:min-w-full' : 'w-full'}`}>
                  {/* Dedicated 0-100% Bar Plot Area */}
                  <div className="relative h-44 sm:h-52 w-full">
                    {(granularity === 'week' ? bikeBaselineVal : avgVal) > 0 && (
                      <div
                        className="absolute left-0 right-0 border-b-2 border-dotted border-red-500 z-20 pointer-events-none"
                        style={{
                          bottom: `${Math.min(
                            92,
                            ((granularity === 'week' ? bikeBaselineVal : avgVal) / maxBikeScale) * 100
                          )}%`,
                        }}
                      >
                        <span className="absolute right-2 -top-4 text-[10px] font-mono font-bold text-black bg-white/95 border border-slate-300 px-1.5 py-0.5 rounded shadow-sm">
                          {granularity === 'week'
                            ? `Baseline (4w Med): ${bikeBaselineVal} ${metricUnitLabel}`
                            : `Avg: ${avgVal} ${metricUnitLabel}`}
                        </span>
                      </div>
                    )}

                    <div className={`h-full w-full flex items-end ${currentPeriodCount >= 36 ? 'gap-[1px] sm:gap-[1.5px]' : currentPeriodCount === 52 ? 'gap-[1.5px]' : 'gap-[3px]'} px-0 relative z-10`}>
                      {bikeWeeks.map((w, idx) => {
                        const val = getBikeVal(w);
                        const wFlag = getEffectiveWeekFlag(w.weekKey);
                        const heightPct = Math.min(100, Math.max(val > 0 ? 6 : 2, (val / maxBikeScale) * 100));
                        const isSelected = activeBikeWeek?.weekKey === w.weekKey;

                        // Same-day accumulated value in this period bar (or previous period comparison on current bar)
                        const barSameDay = bikeSameDayByBar[idx];
                        const barSameDayVal = barSameDay
                          ? metricType === 'distance'
                            ? (unit === 'miles' ? barSameDay.distanceMiles : barSameDay.distanceKm)
                            : barSameDay.movingHours
                          : 0;
                        const lineVal = w.isCurrentWeek ? prevSameDayVal : barSameDayVal;
                        const rawLinePct = val > 0 && !w.isCurrentWeek
                          ? heightPct * Math.min(1, lineVal / val)
                          : Math.min(100, Math.max(0, (lineVal / maxBikeScale) * 100));
                        const showBlueLine = lineVal > 0 || (!w.isCurrentWeek && val > 0);
                        const clampedLineStyle =
                          !w.isCurrentWeek && val > 0 && lineVal >= val
                            ? `calc(${heightPct}% - 2px)`
                            : `${Math.max(val > 0 && lineVal === 0 ? 2 : 0, rawLinePct)}%`;

                        return (
                          <div
                            key={w.weekKey}
                            onClick={() => setSelectedBikeWeek(w)}
                            className="flex-1 min-w-0 h-full flex items-end cursor-pointer group relative"
                          >
                            {/* Value on hover / select positioned directly above the bar */}
                            {val > 0 && (
                              <div
                                style={{ bottom: `${heightPct}%` }}
                                className={`absolute left-1/2 -translate-x-1/2 mb-1 z-20 text-[10px] font-mono font-bold transition-all whitespace-nowrap pointer-events-none flex flex-col items-center ${
                                  isSelected
                                    ? 'text-amber-400 scale-110'
                                    : isLight
                                    ? 'text-slate-700 group-hover:text-amber-600'
                                    : 'text-slate-400 group-hover:text-amber-400'
                                } ${currentPeriodCount >= 24 && !isSelected ? 'hidden sm:block opacity-0 group-hover:opacity-100' : ''}`}
                              >
                                {wFlag && (
                                  <span
                                    className={`text-[8px] px-1 rounded uppercase tracking-tighter mb-0.5 ${
                                      wFlag === 'deload'
                                        ? 'bg-teal-500/20 text-teal-600 dark:text-teal-300 border border-teal-500/40'
                                        : 'bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/40'
                                    }`}
                                  >
                                    {wFlag === 'deload' ? 'Deload' : 'Race'}
                                  </span>
                                )}
                                <span>{val}</span>
                              </div>
                            )}

                            {/* Blue dotted comparison line across period bar */}
                            {showBlueLine && (
                              <div
                                className="absolute left-0 right-0 z-30 pointer-events-none"
                                style={{ bottom: clampedLineStyle }}
                                title={
                                  w.isCurrentWeek
                                    ? `By same day last ${granularity === 'month' ? 'month' : 'week'}: ${lineVal} ${metricUnitLabel}`
                                    : `By same day in ${w.shortLabel}: ${lineVal} ${metricUnitLabel} (Total: ${val} ${metricUnitLabel})`
                                }
                              >
                                <div className="w-full border-b-2 border-dotted border-blue-950 dark:border-blue-300 shadow-[0_0_2px_rgba(255,255,255,0.7)]" />
                              </div>
                            )}

                            {/* Bar */}
                            <div
                              className="w-full relative rounded-t-sm transition-all duration-300 border border-black box-border"
                              style={{
                                height: `${heightPct}%`,
                                backgroundColor:
                                  val === 0
                                    ? isLight
                                      ? '#e2e8f0'
                                      : '#1e293b'
                                    : isSelected
                                    ? '#f59e0b'
                                    : wFlag === 'deload'
                                    ? isLight
                                      ? '#5eead4'
                                      : '#0d9488'
                                    : wFlag === 'race'
                                    ? isLight
                                      ? '#c084fc'
                                      : '#9333ea'
                                    : w.isCurrentWeek
                                    ? '#fbbf24'
                                    : isLight
                                    ? '#38bdf8'
                                    : '#0284c7',
                                opacity: val === 0 ? 0.35 : isSelected ? 1 : wFlag ? 0.72 : 0.85,
                                boxShadow: isSelected ? '0 0 12px rgba(245, 158, 11, 0.45)' : undefined,
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Date labels row below the 0-100% bar plot area */}
                  <div className={`mt-2 w-full flex items-center ${currentPeriodCount >= 36 ? 'gap-[1px] sm:gap-[1.5px]' : currentPeriodCount === 52 ? 'gap-[1.5px]' : 'gap-[3px]'}`}>
                    {bikeWeeks.map((w) => {
                      const isSelected = activeBikeWeek?.weekKey === w.weekKey;
                      const wFlag = getEffectiveWeekFlag(w.weekKey);
                      return (
                        <div
                          key={`lbl-${w.weekKey}`}
                          onClick={() => setSelectedBikeWeek(w)}
                          className="flex-1 min-w-0 text-center px-0.5 cursor-pointer"
                        >
                          <span
                            className={`text-[9px] ${currentPeriodCount >= 24 ? 'text-[8px] sm:text-[9px]' : ''} font-mono block truncate ${
                              isSelected
                                ? 'text-amber-500 font-bold'
                                : wFlag === 'deload'
                                ? 'text-teal-500 font-semibold'
                                : wFlag === 'race'
                                ? 'text-purple-500 font-semibold'
                                : w.isCurrentWeek
                                ? 'text-amber-400 font-semibold'
                                : isLight
                                ? 'text-slate-500'
                                : 'text-slate-400'
                            }`}
                            title={w.weekLabel}
                          >
                            {granularity === 'month'
                              ? currentPeriodCount > 12
                                ? formatMonthShortCode(w.mondayDate)
                                : w.shortLabel
                              : currentPeriodCount >= 24
                              ? formatWeekShortCode(w.mondayDate)
                              : w.shortLabel.replace(/^[A-Za-z]+ /, '')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Selected Period Breakdown */}
            {activeBikeWeek && (
              <div className={`mt-4 p-3.5 rounded-xl border ${isLight ? 'bg-orange-50/50 border-orange-200 text-slate-900' : 'bg-slate-950/70 border-slate-800 text-slate-200'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Calendar className="w-4 h-4 text-orange-500" />
                    <span className="text-xs font-bold">{activeBikeWeek.weekLabel}</span>
                    {renderWeekFlagSelector(activeBikeWeek.weekKey, 'Week Type')}
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="font-bold text-orange-500">
                      {activeBikeWeek.movingHours} hrs ({unit === 'miles' ? `${activeBikeWeek.distanceMiles} mi` : `${activeBikeWeek.distanceKm} km`})
                    </span>
                    <span className="text-slate-400">{activeBikeWeek.ridesCount} rides</span>
                  </div>
                </div>
                {activeBikeWeek.rides.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">No cycling activities logged in this period.</p>
                ) : (
                  <div className="mt-2.5 divide-y divide-slate-200/60 dark:divide-slate-800/60">
                    {activeBikeWeek.rides.map((rd) => (
                      <div
                        key={rd.id}
                        onClick={() => onSelectActivity && onSelectActivity(rd.id)}
                        className={`py-2 flex items-center justify-between text-xs transition-colors rounded-lg px-2 -mx-2 ${onSelectActivity ? 'hover:bg-orange-500/10 cursor-pointer' : ''}`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-[11px] font-mono font-bold text-orange-500 shrink-0 w-8">{rd.dayOfWeek}</span>
                          <span className="font-medium truncate">{rd.name}</span>
                        </div>
                        <div className="flex items-center gap-3 font-mono shrink-0 text-[11px]">
                          <span className="font-bold">{rd.movingHours} hrs</span>
                          <span className="text-slate-400">
                            {unit === 'miles' ? `${rd.distanceMiles} mi` : `${rd.distanceKm} km`}
                          </span>
                          {rd.averageWatts ? <span className="text-amber-400">{rd.averageWatts}W</span> : null}
                          {onSelectActivity && <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ZONE CHARTS */}
      {activeTab === 'cycling_power' && (
        <div className="pt-2">
          <FitnessZoneCharts
            mode="cycling_power"
            activities={activities}
            activityDetails={activityDetails}
            athleteProfile={athleteProfile}
            numWeeks={granularity === 'month' ? Math.round(numMonths * 4.33) : numWeeks}
            theme={theme}
            onSelectActivity={onSelectActivity}
          />
        </div>
      )}

      {activeTab === 'running_pace' && (
        <div className="pt-2">
          <FitnessZoneCharts
            mode="running_pace"
            activities={activities}
            activityDetails={activityDetails}
            athleteProfile={athleteProfile}
            numWeeks={granularity === 'month' ? Math.round(numMonths * 4.33) : numWeeks}
            theme={theme}
            onSelectActivity={onSelectActivity}
          />
        </div>
      )}

      {activeTab === 'running_hr' && (
        <div className="pt-2">
          <FitnessZoneCharts
            mode="running_hr"
            activities={activities}
            activityDetails={activityDetails}
            athleteProfile={athleteProfile}
            numWeeks={granularity === 'month' ? Math.round(numMonths * 4.33) : numWeeks}
            theme={theme}
            onSelectActivity={onSelectActivity}
          />
        </div>
      )}

      {/* RUN SECTION */}
      {activeTab === 'mileage' && (() => {
        const getBucketVal = (b: WeeklyMileageBucket) =>
          metricType === 'distance'
            ? unit === 'miles'
              ? b.distanceMiles
              : b.distanceKm
            : b.movingHours;

        // Helper: get the last up to 4 normal weeks strictly prior to targetWeekKey
        const getPrior4NormalWeeks = (targetWeekKey: string) =>
          getGenericPrior4NormalWeeks(
            extendedRunWeeks.length > 0 ? extendedRunWeeks : weeks,
            targetWeekKey,
            getBucketVal
          );

        const currentVal = activeWeek ? getBucketVal(activeWeek) : 0;

        const activeSameDay = activeRunIdx >= 0 ? runSameDayByBar[activeRunIdx] : null;
        const activeSameDayVal = activeSameDay
          ? metricType === 'distance'
            ? (unit === 'miles' ? activeSameDay.distanceMiles : activeSameDay.distanceKm)
            : activeSameDay.movingHours
          : currentVal;

        // Ignore weeks flagged as Deload or Race when computing Weekly Average
        const normalVisibleWeeks =
          granularity === 'week'
            ? weeks.filter((w) => !getEffectiveWeekFlag(w.weekKey))
            : weeks;

        const rawAvgVal =
          metricType === 'distance'
            ? unit === 'miles'
              ? stats.averageWeeklyMiles
              : stats.averageWeeklyKm
            : stats.averageWeeklyHours;

        const avgVal =
          granularity === 'week' && normalVisibleWeeks.length > 0
            ? Math.round(
                (normalVisibleWeeks.reduce((acc, w) => acc + getBucketVal(w), 0) /
                  normalVisibleWeeks.length) *
                  10
              ) / 10
            : rawAvgVal;

        // Baseline for the active/current week = median of the last 4 normal weeks prior to activeWeek
        const activeBaselineInfo =
          granularity === 'week' && activeWeek
            ? getPrior4NormalWeeks(activeWeek.weekKey)
            : { baseline: 0, normalWeeks: [] as WeeklyMileageBucket[] };

        // Fallback if the active week is at the very beginning of history: take median of last 4 normal weeks in view
        const baselineVal =
          granularity === 'week'
            ? activeBaselineInfo.baseline > 0
              ? activeBaselineInfo.baseline
              : computeMedian(
                  normalVisibleWeeks
                    .filter((w) => getBucketVal(w) > 0)
                    .slice(-4)
                    .map(getBucketVal)
                )
            : avgVal;

        const minBase = metricType === 'distance' ? (unit === 'miles' ? 5 : 8) : 0.75;
        const minDelta = metricType === 'distance' ? (unit === 'miles' ? 2.5 : 4.0) : 0.35;
        const chartSafeRampCap =
          granularity === 'week' && baselineVal > 0
            ? Math.round(Math.max(baselineVal * 1.15, baselineVal + minDelta) * 10) / 10
            : 0;

        const peakVal =
          metricType === 'distance'
            ? unit === 'miles'
              ? stats.peakWeekMiles
              : stats.peakWeekKm
            : stats.peakWeekHours;

        const totalVal =
          metricType === 'distance'
            ? unit === 'miles'
              ? stats.totalMiles
              : stats.totalKm
            : stats.totalHours;

        const metricUnitLabel = metricType === 'distance' ? unit : 'hrs';
        const rateUnitLabel =
          metricType === 'distance'
            ? `${unit}/${granularity === 'month' ? 'mo' : 'wk'}`
            : `hrs/${granularity === 'month' ? 'mo' : 'wk'}`;

        // Same-day previous period calculation
        const prevSameDayVal = prevSameDayRun
          ? metricType === 'distance'
            ? (unit === 'miles' ? prevSameDayRun.distanceMiles : prevSameDayRun.distanceKm)
            : prevSameDayRun.movingHours
          : 0;

        const prevFullVal = prevRunPeriod
          ? metricType === 'distance'
            ? (unit === 'miles' ? prevRunPeriod.distanceMiles : prevRunPeriod.distanceKm)
            : prevRunPeriod.movingHours
          : 0;

        const compareBaseVal = activeWeek?.isCurrentWeek ? currentVal : activeSameDayVal;
        let sameDayChangePct: number | null = null;
        if (prevSameDayVal > 0) {
          sameDayChangePct = Math.round(((compareBaseVal - prevSameDayVal) / prevSameDayVal) * 100);
        } else if (prevFullVal > 0) {
          sameDayChangePct = Math.round(((currentVal - prevFullVal) / prevFullVal) * 100);
        } else if (compareBaseVal > 0 && prevRunPeriod) {
          sameDayChangePct = 100;
        }

        const shortUnitLabel = metricType === 'distance' ? (unit === 'miles' ? 'Mi' : 'KM') : 'h';
        const periodShortLabel = granularity === 'month' ? 'mo' : 'wk';
        const avgPerRun = stats.totalRuns > 0
          ? (metricType === 'distance'
              ? (unit === 'miles' ? stats.totalMiles / stats.totalRuns : stats.totalKm / stats.totalRuns)
              : stats.totalHours / stats.totalRuns)
          : 0;

        const activeWeekFlag = activeWeek ? getEffectiveWeekFlag(activeWeek.weekKey) : undefined;

        // Longest Run & Long-Run Proportion Cap (<= 30-35% of weekly mileage)
        const longestRunInActiveWeek =
          activeWeek && activeWeek.runs.length > 0
            ? activeWeek.runs.reduce((best, r) => (r.distanceKm > best.distanceKm ? r : best), activeWeek.runs[0])
            : null;
        const longestRunSharePct =
          activeWeek && activeWeek.distanceKm > 0 && longestRunInActiveWeek
            ? Math.round((longestRunInActiveWeek.distanceKm / activeWeek.distanceKm) * 100)
            : 0;

        return (
          <>
            {/* Subheader: Run + Badge + Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 pb-2">
              <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                <h3
                  className={`text-sm sm:text-base font-extrabold tracking-tight ${
                    isLight ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  Run
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/20">
                  {granularity === 'month' ? 'Monthly' : 'Mon – Sun'}
                </span>
                {renderActivityControls()}
              </div>
            </div>

            {/* KPI Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 my-4">
              <div
                className={`p-3 rounded-xl border ${
                  isLight
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-slate-950/40 border-slate-800/80'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    {activeWeek && !activeWeek.isCurrentWeek
                      ? activeWeek.shortLabel
                      : granularity === 'month'
                      ? 'This Month'
                      : 'This Week'}
                  </span>
                  {granularity === 'week' && activeWeekFlag && (
                    <span
                      className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        activeWeekFlag === 'deload'
                          ? 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/30'
                          : 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30'
                      }`}
                    >
                      {activeWeekFlag === 'deload' ? 'Deload' : 'Race Week'}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-amber-500">
                    {currentVal}
                  </span>
                  <span className="text-xs text-slate-500 font-bold">{metricUnitLabel}</span>
                </div>
                {prevSameDayVal > 0 ? (
                  <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold">
                    {sameDayChangePct !== null && sameDayChangePct >= 0 ? (
                      <span className="text-emerald-500 flex items-center gap-0.5">
                        <ArrowUpRight className="w-3 h-3 shrink-0" />
                        {prevSameDayVal}{shortUnitLabel} by same day last {periodShortLabel} (+{sameDayChangePct}%)
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center gap-0.5">
                        <ArrowDownRight className="w-3 h-3 shrink-0" />
                        {prevSameDayVal}{shortUnitLabel} by same day last {periodShortLabel} ({sameDayChangePct}%)
                      </span>
                    )}
                  </div>
                ) : prevFullVal > 0 ? (
                  <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold">
                    {sameDayChangePct !== null && sameDayChangePct >= 0 ? (
                      <span className="text-emerald-500 flex items-center gap-0.5">
                        <ArrowUpRight className="w-3 h-3 shrink-0" />
                        0{shortUnitLabel} by same day ({prevFullVal}{shortUnitLabel} last {periodShortLabel})
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center gap-0.5">
                        <ArrowDownRight className="w-3 h-3 shrink-0" />
                        0{shortUnitLabel} by same day ({prevFullVal}{shortUnitLabel} last {periodShortLabel})
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="mt-1 text-[10px] text-slate-500 font-semibold">
                    0{shortUnitLabel} by same day last {periodShortLabel}
                  </div>
                )}
              </div>

              <div
                className={`p-3 rounded-xl border ${
                  isLight
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-slate-950/40 border-slate-800/80'
                }`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  {granularity === 'month' ? 'Monthly Average' : '4W Normal Baseline (Median)'}
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-sky-400">
                    {granularity === 'week' ? baselineVal : avgVal}
                  </span>
                  <span className="text-xs text-slate-500 font-bold">{rateUnitLabel}</span>
                </div>
                <span className="text-[10px] text-slate-500">
                  {granularity === 'week'
                    ? `Avg: ${avgVal} ${rateUnitLabel}${
                        avgPerRun > 0 ? ` • ${avgPerRun.toFixed(2)}${shortUnitLabel}/run` : ''
                      }`
                    : avgPerRun > 0
                    ? `${avgPerRun.toFixed(2)}${shortUnitLabel} average per run`
                    : `Over ${currentPeriodCount} months`}
                </span>
              </div>

              <div
                className={`p-3 rounded-xl border ${
                  isLight
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-slate-950/40 border-slate-800/80'
                }`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  {granularity === 'month' ? 'Peak Month' : 'Peak Week'}
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-emerald-400">
                    {peakVal}
                  </span>
                  <span className="text-xs text-slate-500 font-bold">{metricUnitLabel}</span>
                </div>
                <span className="text-[10px] text-slate-500 truncate block">
                  {stats.peakWeekLabel || 'None'}
                </span>
              </div>

              <div
                className={`p-3 rounded-xl border ${
                  isLight
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-slate-950/40 border-slate-800/80'
                }`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Total Volume
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-purple-400">
                    {totalVal}
                  </span>
                  <span className="text-xs text-slate-500 font-bold">{metricUnitLabel}</span>
                </div>
                <span className="text-[10px] text-slate-500">{stats.totalRuns} total runs</span>
              </div>
            </div>

            {/* SVG / Flex Bar Chart */}
            <div className="space-y-2 mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 px-1">
                <span className="flex items-center gap-1.5 font-medium">
                  <BarChart2 className="w-3.5 h-3.5 text-rose-500" />
                  Run {metricType === 'distance' ? `distance (${unit})` : 'moving time (hours)'} per {granularity}
                </span>
                <div className="flex items-center gap-3 flex-wrap text-[11px] font-mono">
                  {granularity === 'week' && baselineVal > 0 && (
                    <span className="inline-flex items-center gap-1 text-emerald-500 dark:text-emerald-400 font-bold">
                      <span className="w-2.5 h-2 rounded-xs bg-emerald-500/25 border border-emerald-500/60 inline-block" />
                      Safe Ramp Band (4w Normal Median +15% / +3.5 rCTL/wk)
                    </span>
                  )}
                  <span>
                    Peak Scale: {maxWeeklyRun} {metricUnitLabel}
                  </span>
                </div>
              </div>

              {(() => {
                // Identify weekly ramp-cap breaches against the median of the last 4 normal weeks
                // Weeks flagged as 'deload' or 'race' are ignored from ramp calculations
                const rampBreaches: {
                  weekKey: string;
                  weekLabel: string;
                  baselineVal: number;
                  val: number;
                  capVal: number;
                  pctJump: number;
                  normalCount: number;
                }[] = [];
                if (granularity === 'week') {
                  weeks.forEach((w) => {
                    const flag = getEffectiveWeekFlag(w.weekKey);
                    if (flag === 'deload' || flag === 'race') return;
                    const { baseline: wBase, normalWeeks: wNormals } = getPrior4NormalWeeks(w.weekKey);
                    const curV = getBucketVal(w);
                    if (wNormals.length === 0 || wBase < minBase) return;
                    const safeCap = Math.round(Math.max(wBase * 1.15, wBase + minDelta) * 10) / 10;
                    if (curV > safeCap) {
                      rampBreaches.push({
                        weekKey: w.weekKey,
                        weekLabel: w.shortLabel,
                        baselineVal: wBase,
                        val: curV,
                        capVal: safeCap,
                        pctJump: Math.round(((curV - wBase) / wBase) * 100),
                        normalCount: wNormals.length,
                      });
                    }
                  });
                }
                // Prioritize showing the breach for the currently selected week if it has one; otherwise the most recent breach
                const activeBreach =
                  (activeWeek && rampBreaches.find((b) => b.weekKey === activeWeek.weekKey)) ||
                  rampBreaches[rampBreaches.length - 1];
                return activeBreach ? (
                  <div
                    className={`px-3 py-1.5 rounded-lg border text-[11px] flex items-center justify-between gap-2 ${
                      isLight
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    <span>
                      <strong>Ramp-Limit Breach ({activeBreach.weekLabel}):</strong> Run volume reached{' '}
                      <span className="font-mono font-bold">
                        {activeBreach.val} {metricUnitLabel} (+{activeBreach.pctJump}%)
                      </span>{' '}
                      above the {activeBreach.normalCount}-week normal median baseline of{' '}
                      <span className="font-mono font-bold">
                        {activeBreach.baselineVal} {metricUnitLabel}
                      </span>
                      , exceeding the safe ≤+15% / +3.5 rCTL/wk cap (safe ceiling:{' '}
                      <span className="font-mono font-bold">
                        {activeBreach.capVal} {metricUnitLabel}
                      </span>
                      ).
                    </span>
                  </div>
                ) : null;
              })()}

              <div className="-mx-4 sm:-mx-5 overflow-x-auto scrollbar-thin pb-2" ref={scrollContainerRef}>
                <div className={`relative pt-6 pb-1 ${currentPeriodCount >= 36 ? 'min-w-[620px] sm:min-w-full' : currentPeriodCount === 52 ? 'min-w-[560px] sm:min-w-full' : 'w-full'}`}>
                  {/* Dedicated 0-100% Bar Plot Area */}
                  <div className="relative h-44 sm:h-52 w-full">
                    {/* Safe Weekly Ramp-Limit Band (4w Normal Median Baseline to +15% Safe Ramp Ceiling) */}
                    {granularity === 'week' && baselineVal > 0 && (
                      <div
                        className="absolute left-0 right-0 bg-emerald-500/12 border-t border-dashed border-emerald-500/70 z-10 pointer-events-none"
                        style={{
                          bottom: `${Math.min(88, (baselineVal / maxWeeklyRun) * 100)}%`,
                          height: `${Math.max(
                            4,
                            Math.min(95, (chartSafeRampCap / maxWeeklyRun) * 100) -
                              Math.min(88, (baselineVal / maxWeeklyRun) * 100)
                          )}%`,
                        }}
                      >
                        <span className="absolute left-2 -top-4 text-[9px] font-mono font-bold text-emerald-700 dark:text-emerald-300 bg-white/90 dark:bg-slate-900/90 border border-emerald-500/40 px-1.5 py-0.2 rounded">
                          Safe Ramp Cap (~{chartSafeRampCap} {metricUnitLabel})
                        </span>
                      </div>
                    )}

                    {/* Baseline / Average Reference Line */}
                    {(granularity === 'week' ? baselineVal : avgVal) > 0 && (
                      <div
                        className="absolute left-0 right-0 border-b-2 border-dotted border-red-500 z-20 pointer-events-none"
                        style={{
                          bottom: `${Math.min(
                            92,
                            ((granularity === 'week' ? baselineVal : avgVal) / maxWeeklyRun) * 100
                          )}%`,
                        }}
                      >
                        <span className="absolute right-2 -top-4 text-[10px] font-mono font-bold text-black bg-white/95 border border-slate-300 px-1.5 py-0.5 rounded shadow-sm">
                          {granularity === 'week'
                            ? `Baseline (4w Med): ${baselineVal} ${metricUnitLabel}`
                            : `Avg: ${avgVal} ${metricUnitLabel}`}
                        </span>
                      </div>
                    )}

                    {/* Bar Chart Grid */}
                    <div className={`h-full w-full flex items-end ${currentPeriodCount >= 36 ? 'gap-[1px] sm:gap-[1.5px]' : currentPeriodCount === 52 ? 'gap-[1.5px]' : 'gap-[3px]'} px-0 relative z-10`}>
                      {weeks.map((w, idx) => {
                        const val = getBucketVal(w);
                        const wFlag = getEffectiveWeekFlag(w.weekKey);
                        const { baseline: wBaseline } =
                          granularity === 'week'
                            ? getPrior4NormalWeeks(w.weekKey)
                            : { baseline: 0 };
                        const safeRampCapVal =
                          granularity === 'week' && !wFlag && wBaseline >= minBase
                            ? Math.round(Math.max(wBaseline * 1.15, wBaseline + minDelta) * 10) / 10
                            : null;
                        const isRampBreach = !wFlag && safeRampCapVal !== null && val > safeRampCapVal;
                        const safeCapHeightPct =
                          safeRampCapVal !== null
                            ? Math.min(100, Math.max(4, (safeRampCapVal / maxWeeklyRun) * 100))
                            : null;

                        const heightPct = Math.min(100, Math.max(val > 0 ? 6 : 2, (val / maxWeeklyRun) * 100));
                        const isSelected = activeWeek?.weekKey === w.weekKey;

                        // Same-day accumulated value in this period bar (or previous period comparison on current bar)
                        const barSameDay = runSameDayByBar[idx];
                        const barSameDayVal = barSameDay
                          ? metricType === 'distance'
                            ? (unit === 'miles' ? barSameDay.distanceMiles : barSameDay.distanceKm)
                            : barSameDay.movingHours
                          : 0;
                        const lineVal = w.isCurrentWeek ? prevSameDayVal : barSameDayVal;
                        const rawLinePct = val > 0 && !w.isCurrentWeek
                          ? heightPct * Math.min(1, lineVal / val)
                          : Math.min(100, Math.max(0, (lineVal / maxWeeklyRun) * 100));
                        const showBlueLine = lineVal > 0 || (!w.isCurrentWeek && val > 0);
                        const clampedLineStyle =
                          !w.isCurrentWeek && val > 0 && lineVal >= val
                            ? `calc(${heightPct}% - 2px)`
                            : `${Math.max(val > 0 && lineVal === 0 ? 2 : 0, rawLinePct)}%`;

                        return (
                          <div
                            key={w.weekKey}
                            onClick={() => setSelectedWeek(w)}
                            className="flex-1 min-w-0 h-full flex items-end cursor-pointer group relative"
                          >
                            {/* Value on hover / select positioned directly above the bar */}
                            {val > 0 && (
                              <div
                                style={{ bottom: `${heightPct}%` }}
                                className={`absolute left-1/2 -translate-x-1/2 mb-1 z-20 text-[10px] font-mono font-bold transition-all whitespace-nowrap pointer-events-none flex flex-col items-center ${
                                  isSelected
                                    ? 'text-amber-400 scale-110'
                                    : isLight
                                    ? 'text-slate-700 group-hover:text-amber-600'
                                    : 'text-slate-400 group-hover:text-amber-400'
                                } ${currentPeriodCount >= 24 && !isSelected ? 'hidden sm:block opacity-0 group-hover:opacity-100' : ''}`}
                              >
                                {wFlag && (
                                  <span
                                    className={`text-[8px] px-1 rounded uppercase tracking-tighter mb-0.5 ${
                                      wFlag === 'deload'
                                        ? 'bg-teal-500/20 text-teal-600 dark:text-teal-300 border border-teal-500/40'
                                        : 'bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/40'
                                    }`}
                                  >
                                    {wFlag === 'deload' ? 'Deload' : 'Race'}
                                  </span>
                                )}
                                <span>{val}</span>
                              </div>
                            )}

                            {/* Per-bar Safe Ramp Cap Marker when a weekly spike breaches the +15% cap */}
                            {isRampBreach && safeCapHeightPct !== null && (
                              <div
                                className="absolute left-0 right-0 z-30 pointer-events-none"
                                style={{ bottom: `${safeCapHeightPct}%` }}
                                title={`Safe weekly ramp cap: ${safeRampCapVal} ${metricUnitLabel} (+15% from 4w normal median baseline ${wBaseline} ${metricUnitLabel})`}
                              >
                                <div className="w-full border-b-2 border-dashed border-emerald-400" />
                              </div>
                            )}

                            {/* Blue dotted comparison line across period bar */}
                            {showBlueLine && (
                              <div
                                className="absolute left-0 right-0 z-30 pointer-events-none"
                                style={{ bottom: clampedLineStyle }}
                                title={
                                  w.isCurrentWeek
                                    ? `By same day last ${granularity === 'month' ? 'month' : 'week'}: ${lineVal} ${metricUnitLabel}`
                                    : `By same day in ${w.shortLabel}: ${lineVal} ${metricUnitLabel} (Total: ${val} ${metricUnitLabel})`
                                }
                              >
                                <div className="w-full border-b-2 border-dotted border-blue-950 dark:border-blue-300 shadow-[0_0_2px_rgba(255,255,255,0.7)]" />
                              </div>
                            )}

                            {/* Bar */}
                            <div
                              className="w-full relative rounded-t-sm transition-all duration-300 border border-black box-border"
                              style={{
                                height: `${heightPct}%`,
                                backgroundColor:
                                  val === 0
                                    ? isLight
                                      ? '#e2e8f0'
                                      : '#1e293b'
                                    : isSelected
                                    ? '#f59e0b'
                                    : wFlag === 'deload'
                                    ? isLight
                                      ? '#5eead4'
                                      : '#0d9488'
                                    : wFlag === 'race'
                                    ? isLight
                                      ? '#c084fc'
                                      : '#9333ea'
                                    : w.isCurrentWeek
                                    ? '#fbbf24'
                                    : isLight
                                    ? '#38bdf8'
                                    : '#0284c7',
                                opacity: val === 0 ? 0.35 : isSelected ? 1 : wFlag ? 0.72 : 0.85,
                                boxShadow: isSelected ? '0 0 12px rgba(245, 158, 11, 0.45)' : undefined,
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Date labels row below the 0-100% bar plot area */}
                  <div className={`mt-2 w-full flex items-center ${currentPeriodCount >= 36 ? 'gap-[1px] sm:gap-[1.5px]' : currentPeriodCount === 52 ? 'gap-[1.5px]' : 'gap-[3px]'}`}>
                    {weeks.map((w) => {
                      const isSelected = activeWeek?.weekKey === w.weekKey;
                      const wFlag = getEffectiveWeekFlag(w.weekKey);
                      return (
                        <div
                          key={`lbl-${w.weekKey}`}
                          onClick={() => setSelectedWeek(w)}
                          className="flex-1 min-w-0 text-center px-0.5 cursor-pointer"
                        >
                          <span
                            className={`text-[9px] ${currentPeriodCount >= 24 ? 'text-[8px] sm:text-[9px]' : ''} font-mono block truncate ${
                              isSelected
                                ? 'text-amber-500 font-bold'
                                : wFlag === 'deload'
                                ? 'text-teal-500 font-semibold'
                                : wFlag === 'race'
                                ? 'text-purple-500 font-semibold'
                                : w.isCurrentWeek
                                ? 'text-amber-400 font-semibold'
                                : isLight
                                ? 'text-slate-500'
                                : 'text-slate-400'
                            }`}
                            title={
                              wFlag
                                ? `${w.weekLabel} (${wFlag === 'deload' ? 'Deload Week' : 'Race Week'} - ignored from ramp baseline)`
                                : w.weekLabel
                            }
                          >
                            {granularity === 'month'
                              ? currentPeriodCount > 12
                                ? formatMonthShortCode(w.mondayDate)
                                : w.shortLabel
                              : currentPeriodCount >= 24
                              ? formatWeekShortCode(w.mondayDate)
                              : w.shortLabel.replace(/^[A-Za-z]+ /, '')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Selected Period Detailed Run Breakdown */}
            {activeWeek && (
              <div
                className={`mt-4 p-3.5 rounded-xl border transition-colors ${
                  isLight
                    ? 'bg-rose-50/50 border-rose-200 text-slate-900'
                    : 'bg-slate-950/70 border-slate-800 text-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Calendar className="w-4 h-4 text-rose-500" />
                    <span className="text-xs font-bold">
                      {activeWeek.weekLabel} {activeWeek.isCurrentWeek ? '(Current)' : ''}
                    </span>
                    {renderWeekFlagSelector(activeWeek.weekKey, 'Week Type')}
                  </div>
                  <div className="flex items-center gap-2.5 text-xs font-mono flex-wrap">
                    <span className="font-bold text-rose-500">
                      {unit === 'miles' ? `${activeWeek.distanceMiles} mi` : `${activeWeek.distanceKm} km`} ({activeWeek.movingHours} hrs)
                    </span>
                    <span className="text-slate-400">
                      {activeWeek.runsCount} {activeWeek.runsCount === 1 ? 'run' : 'runs'}
                    </span>
                    {activeWeek.avgPaceFormatted !== '--' && (
                      <span className="text-sky-400 hidden sm:inline">
                        Avg {activeWeek.avgPaceFormatted}
                      </span>
                    )}
                    {granularity === 'week' && longestRunInActiveWeek && activeWeek.runsCount >= 2 && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                          longestRunSharePct <= 35
                            ? isLight
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : isLight
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}
                        title="Recommended single long-run cap is ≤30–35% of weekly running mileage"
                      >
                        Long Run:{' '}
                        {unit === 'miles'
                          ? `${longestRunInActiveWeek.distanceMiles} mi`
                          : `${longestRunInActiveWeek.distanceKm} km`}{' '}
                        ({longestRunSharePct}% of wk {longestRunSharePct <= 35 ? '≤35% Cap' : '>35% Cap'})
                      </span>
                    )}
                  </div>
                </div>

                {activeWeek.runs.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">
                    No running activities logged in this period.
                  </p>
                ) : (
                  <div className="mt-2.5 divide-y divide-slate-200/60 dark:divide-slate-800/60">
                    {activeWeek.runs.map((run) => {
                      const isLongestRun =
                        granularity === 'week' &&
                        activeWeek.runs.length >= 2 &&
                        longestRunInActiveWeek?.id === run.id;
                      return (
                        <div
                          key={run.id}
                          onClick={() => onSelectActivity && onSelectActivity(run.id)}
                          className={`py-2 flex items-center justify-between text-xs transition-colors rounded-lg px-2 -mx-2 ${
                            onSelectActivity ? 'hover:bg-rose-500/10 cursor-pointer' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-[11px] font-mono font-bold text-rose-500 shrink-0 w-8">
                              {run.dayOfWeek}
                            </span>
                            <span className="font-medium truncate text-slate-800 dark:text-slate-200">
                              {run.name}
                            </span>
                            {isLongestRun && (
                              <span
                                className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                  longestRunSharePct <= 35
                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                }`}
                              >
                                Longest • {longestRunSharePct}%
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 font-mono shrink-0 text-[11px]">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {unit === 'miles' ? `${run.distanceMiles} mi` : `${run.distanceKm} km`}
                            </span>
                            <span className="text-slate-400 hidden sm:inline">
                              {run.avgPaceFormatted}
                            </span>
                            {run.sufferScore ? (
                              <span className="text-rose-400 flex items-center gap-0.5">
                                <Flame className="w-3 h-3" />
                                {run.sufferScore}
                              </span>
                            ) : null}
                            {onSelectActivity && (
                              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
};
