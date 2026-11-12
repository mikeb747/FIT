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
  theme?: 'dark' | 'light';
  onSelectActivity?: (activityId: string | number) => void;
  initialTab?: ChartDatasetTab;
}

export const WeeklyMileageChart: React.FC<WeeklyMileageChartProps> = ({
  activities,
  activityDetails,
  athleteProfile,
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

  // Compute Running volume
  const { weeks, stats } = useMemo(() => {
    return computeWeeklyRunningMileage(activities, currentPeriodCount, granularity);
  }, [activities, currentPeriodCount, granularity]);

  // Compute Swim volume
  const { weeks: swimWeeks, stats: swimStats } = useMemo(() => {
    return computeWeeklySwimDistance(activities, currentPeriodCount, granularity);
  }, [activities, currentPeriodCount, granularity]);

  // Compute Bike volume
  const { weeks: bikeWeeks, stats: bikeStats } = useMemo(() => {
    return computeWeeklyBikeHours(activities, currentPeriodCount, granularity);
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

        const avgVal = tssStats.averageWeeklyTss;
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
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  {activeTssWeek && !activeTssWeek.isCurrentWeek
                    ? activeTssWeek.shortLabel
                    : granularity === 'month'
                    ? 'This Month'
                    : 'This Week'}
                </span>
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
                  {granularity === 'month' ? 'Monthly Average' : 'Weekly Average'}
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-sky-400">{avgVal}</span>
                  <span className="text-xs text-slate-500 font-bold">{rateUnitLabel}</span>
                </div>
                <span className="text-[10px] text-slate-500">
                  {avgPerActivity > 0
                    ? `${avgPerActivity} TSS average per workout`
                    : `Over ${currentPeriodCount} ${granularity === 'month' ? 'months' : 'weeks'}`}
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
                    {avgVal > 0 && (
                      <div
                        className="absolute left-0 right-0 border-b-2 border-dotted border-red-500 z-20 pointer-events-none"
                        style={{ bottom: `${Math.min(92, (avgVal / maxTssScale) * 100)}%` }}
                      >
                        <span className="absolute right-2 -top-4 text-[10px] font-mono font-bold text-black bg-white/95 border border-slate-300 px-1.5 py-0.5 rounded shadow-sm">
                          Avg: {avgVal} TSS
                        </span>
                      </div>
                    )}

                    <div className={`h-full w-full flex items-end ${currentPeriodCount >= 36 ? 'gap-[1px] sm:gap-[1.5px]' : currentPeriodCount === 52 ? 'gap-[1.5px]' : 'gap-[3px]'} px-0 relative z-10`}>
                      {tssWeeks.map((w, idx) => {
                        const val = w.totalTss;
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
                                className={`absolute left-1/2 -translate-x-1/2 mb-1 z-20 text-[10px] font-mono font-bold transition-all whitespace-nowrap pointer-events-none ${
                                  isSelected
                                    ? 'text-amber-400 scale-110'
                                    : isLight
                                    ? 'text-slate-700 group-hover:text-amber-600'
                                    : 'text-slate-400 group-hover:text-amber-400'
                                } ${currentPeriodCount >= 24 && !isSelected ? 'hidden sm:block opacity-0 group-hover:opacity-100' : ''}`}
                              >
                                {val}
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
                                    : w.isCurrentWeek
                                    ? '#fbbf24'
                                    : isLight
                                    ? '#38bdf8'
                                    : '#0284c7',
                                opacity: val === 0 ? 0.35 : isSelected ? 1 : 0.85,
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
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-rose-500" />
                    <span className="text-xs font-bold">
                      {activeTssWeek.weekLabel} {activeTssWeek.isCurrentWeek ? '(Current)' : ''}
                    </span>
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
        const currentVal =
          metricType === 'distance'
            ? (unit === 'miles' ? activeSwimWeek?.distanceMiles : activeSwimWeek?.distanceKm) || 0
            : activeSwimWeek?.movingHours || 0;

        const activeSameDay = activeSwimIdx >= 0 ? swimSameDayByBar[activeSwimIdx] : null;
        const activeSameDayVal = activeSameDay
          ? metricType === 'distance'
            ? (unit === 'miles' ? activeSameDay.distanceMiles : activeSameDay.distanceKm)
            : activeSameDay.movingHours
          : currentVal;

        const avgVal =
          metricType === 'distance'
            ? unit === 'miles'
              ? swimStats.averageWeeklyMiles
              : swimStats.averageWeeklyKm
            : swimStats.averageWeeklyHours;

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
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  {activeSwimWeek && !activeSwimWeek.isCurrentWeek
                    ? activeSwimWeek.shortLabel
                    : granularity === 'month'
                    ? 'This Month'
                    : 'This Week'}
                </span>
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
                  {granularity === 'month' ? 'Monthly Average' : 'Weekly Average'}
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-sky-400">{avgVal}</span>
                  <span className="text-xs text-slate-500 font-bold">{rateUnitLabel}</span>
                </div>
                <span className="text-[10px] text-slate-500">
                  {avgPerSwim > 0
                    ? `${avgPerSwim.toFixed(2)}${shortUnitLabel} average per swim`
                    : `Over ${currentPeriodCount} ${granularity === 'month' ? 'months' : 'weeks'}`}
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
                    {avgVal > 0 && (
                      <div
                        className="absolute left-0 right-0 border-b-2 border-dotted border-red-500 z-20 pointer-events-none"
                        style={{ bottom: `${Math.min(92, (avgVal / maxSwimScale) * 100)}%` }}
                      >
                        <span className="absolute right-2 -top-4 text-[10px] font-mono font-bold text-black bg-white/95 border border-slate-300 px-1.5 py-0.5 rounded shadow-sm">
                          Avg: {avgVal} {metricUnitLabel}
                        </span>
                      </div>
                    )}

                    <div className={`h-full w-full flex items-end ${currentPeriodCount >= 36 ? 'gap-[1px] sm:gap-[1.5px]' : currentPeriodCount === 52 ? 'gap-[1.5px]' : 'gap-[3px]'} px-0 relative z-10`}>
                      {swimWeeks.map((w, idx) => {
                        const val =
                          metricType === 'distance'
                            ? (unit === 'miles' ? w.distanceMiles : w.distanceKm)
                            : w.movingHours;
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
                                className={`absolute left-1/2 -translate-x-1/2 mb-1 z-20 text-[10px] font-mono font-bold transition-all whitespace-nowrap pointer-events-none ${
                                  isSelected
                                    ? 'text-amber-400 scale-110'
                                    : isLight
                                    ? 'text-slate-700 group-hover:text-amber-600'
                                    : 'text-slate-400 group-hover:text-amber-400'
                                } ${currentPeriodCount >= 24 && !isSelected ? 'hidden sm:block opacity-0 group-hover:opacity-100' : ''}`}
                              >
                                {val}
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
                                    : w.isCurrentWeek
                                    ? '#fbbf24'
                                    : isLight
                                    ? '#38bdf8'
                                    : '#0284c7',
                                opacity: val === 0 ? 0.35 : isSelected ? 1 : 0.85,
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
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-sky-500" />
                    <span className="text-xs font-bold">{activeSwimWeek.weekLabel}</span>
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
        const currentVal =
          metricType === 'distance'
            ? (unit === 'miles' ? activeBikeWeek?.distanceMiles : activeBikeWeek?.distanceKm) || 0
            : activeBikeWeek?.movingHours || 0;

        const activeSameDay = activeBikeIdx >= 0 ? bikeSameDayByBar[activeBikeIdx] : null;
        const activeSameDayVal = activeSameDay
          ? metricType === 'distance'
            ? (unit === 'miles' ? activeSameDay.distanceMiles : activeSameDay.distanceKm)
            : activeSameDay.movingHours
          : currentVal;

        const avgVal =
          metricType === 'distance'
            ? unit === 'miles'
              ? bikeStats.averageWeeklyMiles
              : bikeStats.averageWeeklyKm
            : bikeStats.averageWeeklyHours;

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
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  {activeBikeWeek && !activeBikeWeek.isCurrentWeek
                    ? activeBikeWeek.shortLabel
                    : granularity === 'month'
                    ? 'This Month'
                    : 'This Week'}
                </span>
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
                  {granularity === 'month' ? 'Monthly Average' : 'Weekly Average'}
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-orange-400">{avgVal}</span>
                  <span className="text-xs text-slate-500 font-bold">{rateUnitLabel}</span>
                </div>
                <span className="text-[10px] text-slate-500">
                  {avgPerRide > 0
                    ? `${avgPerRide.toFixed(2)}${shortUnitLabel} average per ride`
                    : `Over ${currentPeriodCount} ${granularity === 'month' ? 'months' : 'weeks'}`}
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
                    {avgVal > 0 && (
                      <div
                        className="absolute left-0 right-0 border-b-2 border-dotted border-red-500 z-20 pointer-events-none"
                        style={{ bottom: `${Math.min(92, (avgVal / maxBikeScale) * 100)}%` }}
                      >
                        <span className="absolute right-2 -top-4 text-[10px] font-mono font-bold text-black bg-white/95 border border-slate-300 px-1.5 py-0.5 rounded shadow-sm">
                          Avg: {avgVal} {metricUnitLabel}
                        </span>
                      </div>
                    )}

                    <div className={`h-full w-full flex items-end ${currentPeriodCount >= 36 ? 'gap-[1px] sm:gap-[1.5px]' : currentPeriodCount === 52 ? 'gap-[1.5px]' : 'gap-[3px]'} px-0 relative z-10`}>
                      {bikeWeeks.map((w, idx) => {
                        const val =
                          metricType === 'distance'
                            ? (unit === 'miles' ? w.distanceMiles : w.distanceKm)
                            : w.movingHours;
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
                                className={`absolute left-1/2 -translate-x-1/2 mb-1 z-20 text-[10px] font-mono font-bold transition-all whitespace-nowrap pointer-events-none ${
                                  isSelected
                                    ? 'text-amber-400 scale-110'
                                    : isLight
                                    ? 'text-slate-700 group-hover:text-amber-600'
                                    : 'text-slate-400 group-hover:text-amber-400'
                                } ${currentPeriodCount >= 24 && !isSelected ? 'hidden sm:block opacity-0 group-hover:opacity-100' : ''}`}
                              >
                                {val}
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
                                    ? '#ea580c'
                                    : w.isCurrentWeek
                                    ? '#fb923c'
                                    : isLight
                                    ? '#fb923c'
                                    : '#f97316',
                                opacity: val === 0 ? 0.35 : isSelected ? 1 : 0.88,
                                boxShadow: isSelected ? '0 0 12px rgba(249, 115, 22, 0.45)' : undefined,
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
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-orange-500" />
                    <span className="text-xs font-bold">{activeBikeWeek.weekLabel}</span>
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
        const currentVal =
          metricType === 'distance'
            ? (unit === 'miles' ? activeWeek?.distanceMiles : activeWeek?.distanceKm) || 0
            : activeWeek?.movingHours || 0;

        const activeSameDay = activeRunIdx >= 0 ? runSameDayByBar[activeRunIdx] : null;
        const activeSameDayVal = activeSameDay
          ? metricType === 'distance'
            ? (unit === 'miles' ? activeSameDay.distanceMiles : activeSameDay.distanceKm)
            : activeSameDay.movingHours
          : currentVal;

        const avgVal =
          metricType === 'distance'
            ? unit === 'miles'
              ? stats.averageWeeklyMiles
              : stats.averageWeeklyKm
            : stats.averageWeeklyHours;

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
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  {activeWeek && !activeWeek.isCurrentWeek
                    ? activeWeek.shortLabel
                    : granularity === 'month'
                    ? 'This Month'
                    : 'This Week'}
                </span>
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
                  {granularity === 'month' ? 'Monthly Average' : 'Weekly Average'}
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-sky-400">
                    {avgVal}
                  </span>
                  <span className="text-xs text-slate-500 font-bold">{rateUnitLabel}</span>
                </div>
                <span className="text-[10px] text-slate-500">
                  {avgPerRun > 0
                    ? `${avgPerRun.toFixed(2)}${shortUnitLabel} average per run`
                    : `Over ${currentPeriodCount} ${granularity === 'month' ? 'months' : 'weeks'}`}
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
                  {granularity === 'week' && avgVal > 0 && (
                    <span className="inline-flex items-center gap-1 text-emerald-500 dark:text-emerald-400 font-bold">
                      <span className="w-2.5 h-2 rounded-xs bg-emerald-500/25 border border-emerald-500/60 inline-block" />
                      Safe Ramp Band (≤ +15% / +3.5 rCTL/wk)
                    </span>
                  )}
                  <span>
                    Peak Scale: {maxWeeklyRun} {metricUnitLabel}
                  </span>
                </div>
              </div>

              {(() => {
                // Identify weekly ramp-cap breaches (> +15% and significant volume jump over prior week)
                const minBase = metricType === 'distance' ? (unit === 'miles' ? 5 : 8) : 0.75;
                const minDelta = metricType === 'distance' ? (unit === 'miles' ? 2.5 : 4.0) : 0.35;
                const rampBreaches: { weekLabel: string; prevVal: number; val: number; capVal: number; pctJump: number }[] = [];
                if (granularity === 'week') {
                  weeks.forEach((w, idx) => {
                    if (idx === 0) return;
                    const prevW = weeks[idx - 1];
                    const prevV =
                      metricType === 'distance'
                        ? unit === 'miles'
                          ? prevW.distanceMiles
                          : prevW.distanceKm
                        : prevW.movingHours;
                    const curV =
                      metricType === 'distance'
                        ? unit === 'miles'
                          ? w.distanceMiles
                          : w.distanceKm
                        : w.movingHours;
                    const safeCap = Math.round(Math.max(prevV * 1.15, prevV + minDelta) * 10) / 10;
                    if (prevV >= minBase && curV > safeCap) {
                      rampBreaches.push({
                        weekLabel: w.shortLabel,
                        prevVal: prevV,
                        val: curV,
                        capVal: safeCap,
                        pctJump: Math.round(((curV - prevV) / prevV) * 100),
                      });
                    }
                  });
                }
                const worstBreach = rampBreaches.sort((a, b) => b.val - b.prevVal - (a.val - a.prevVal))[0];
                return worstBreach ? (
                  <div
                    className={`px-3 py-1.5 rounded-lg border text-[11px] flex items-center justify-between gap-2 ${
                      isLight
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    <span>
                      <strong>Ramp-Limit Breach ({worstBreach.weekLabel}):</strong> Run volume jumped from{' '}
                      <span className="font-mono font-bold">
                        {worstBreach.prevVal} → {worstBreach.val} {metricUnitLabel} (+{worstBreach.pctJump}%)
                      </span>
                      , exceeding the safe ≤+15% / +3.5 rCTL/wk (+10–15 min) bone &amp; tendon cap (safe ceiling:{' '}
                      <span className="font-mono font-bold">
                        {worstBreach.capVal} {metricUnitLabel}
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
                    {/* Safe Weekly Ramp-Limit Band (Avg to +15% Safe Ramp Ceiling) */}
                    {granularity === 'week' && avgVal > 0 && (
                      <div
                        className="absolute left-0 right-0 bg-emerald-500/12 border-t border-dashed border-emerald-500/70 z-10 pointer-events-none"
                        style={{
                          bottom: `${Math.min(88, (avgVal * 0.85 / maxWeeklyRun) * 100)}%`,
                          height: `${Math.max(6, Math.min(95, (avgVal * 1.15 / maxWeeklyRun) * 100) - Math.min(88, (avgVal * 0.85 / maxWeeklyRun) * 100))}%`,
                        }}
                      >
                        <span className="absolute left-2 -top-4 text-[9px] font-mono font-bold text-emerald-700 dark:text-emerald-300 bg-white/90 dark:bg-slate-900/90 border border-emerald-500/40 px-1.5 py-0.2 rounded">
                          Safe Ramp Cap (~{Math.round(avgVal * 1.15 * 10) / 10} {metricUnitLabel})
                        </span>
                      </div>
                    )}

                    {/* Average Reference Line */}
                    {avgVal > 0 && (
                      <div
                        className="absolute left-0 right-0 border-b-2 border-dotted border-red-500 z-20 pointer-events-none"
                        style={{
                          bottom: `${Math.min(92, (avgVal / maxWeeklyRun) * 100)}%`,
                        }}
                      >
                        <span className="absolute right-2 -top-4 text-[10px] font-mono font-bold text-black bg-white/95 border border-slate-300 px-1.5 py-0.5 rounded shadow-sm">
                          Avg: {avgVal} {metricUnitLabel}
                        </span>
                      </div>
                    )}

                    {/* Bar Chart Grid */}
                    <div className={`h-full w-full flex items-end ${currentPeriodCount >= 36 ? 'gap-[1px] sm:gap-[1.5px]' : currentPeriodCount === 52 ? 'gap-[1.5px]' : 'gap-[3px]'} px-0 relative z-10`}>
                      {weeks.map((w, idx) => {
                        const val =
                          metricType === 'distance'
                            ? (unit === 'miles' ? w.distanceMiles : w.distanceKm)
                            : w.movingHours;
                        const prevVal =
                          idx > 0
                            ? metricType === 'distance'
                              ? unit === 'miles'
                                ? weeks[idx - 1].distanceMiles
                                : weeks[idx - 1].distanceKm
                              : weeks[idx - 1].movingHours
                            : 0;
                        const minBase = metricType === 'distance' ? (unit === 'miles' ? 5 : 8) : 0.75;
                        const minDelta = metricType === 'distance' ? (unit === 'miles' ? 2.5 : 4.0) : 0.35;
                        const safeRampCapVal =
                          granularity === 'week' && prevVal >= minBase
                            ? Math.round(Math.max(prevVal * 1.15, prevVal + minDelta) * 10) / 10
                            : null;
                        const isRampBreach = safeRampCapVal !== null && val > safeRampCapVal;
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
                                className={`absolute left-1/2 -translate-x-1/2 mb-1 z-20 text-[10px] font-mono font-bold transition-all whitespace-nowrap pointer-events-none ${
                                  isRampBreach
                                    ? 'text-rose-500 dark:text-rose-400 font-black'
                                    : isSelected
                                    ? 'text-amber-400 scale-110'
                                    : isLight
                                    ? 'text-slate-700 group-hover:text-amber-600'
                                    : 'text-slate-400 group-hover:text-amber-400'
                                } ${currentPeriodCount >= 24 && !isSelected && !isRampBreach ? 'hidden sm:block opacity-0 group-hover:opacity-100' : ''}`}
                              >
                                {val}{isRampBreach ? '!' : ''}
                              </div>
                            )}

                            {/* Per-bar Safe Ramp Cap Marker when a weekly spike breaches the +15% cap */}
                            {isRampBreach && safeCapHeightPct !== null && (
                              <div
                                className="absolute left-0 right-0 z-30 pointer-events-none"
                                style={{ bottom: `${safeCapHeightPct}%` }}
                                title={`Safe weekly ramp cap: ${safeRampCapVal} ${metricUnitLabel} (+15% from prior week ${prevVal} ${metricUnitLabel})`}
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
                              className={`w-full relative rounded-t-sm transition-all duration-300 box-border ${
                                isRampBreach ? 'border-2 border-amber-400' : 'border border-black'
                              }`}
                              style={{
                                height: `${heightPct}%`,
                                backgroundColor:
                                  val === 0
                                    ? isLight
                                      ? '#e2e8f0'
                                      : '#1e293b'
                                    : isRampBreach
                                    ? '#be123c'
                                    : isSelected
                                    ? '#e11d48'
                                    : w.isCurrentWeek
                                    ? '#fb7185'
                                    : isLight
                                    ? '#f43f5e'
                                    : '#e11d48',
                                opacity: val === 0 ? 0.35 : isSelected || isRampBreach ? 0.98 : 0.85,
                                boxShadow: isSelected
                                  ? '0 0 12px rgba(244, 63, 94, 0.45)'
                                  : isRampBreach
                                  ? '0 0 10px rgba(244, 63, 94, 0.4)'
                                  : undefined,
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
                      return (
                        <div
                          key={`lbl-${w.weekKey}`}
                          onClick={() => setSelectedWeek(w)}
                          className="flex-1 min-w-0 text-center px-0.5 cursor-pointer"
                        >
                          <span
                            className={`text-[9px] ${currentPeriodCount >= 24 ? 'text-[8px] sm:text-[9px]' : ''} font-mono block truncate ${
                              isSelected
                                ? 'text-rose-500 font-bold'
                                : w.isCurrentWeek
                                ? 'text-rose-400 font-semibold'
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

            {/* Selected Period Detailed Run Breakdown */}
            {activeWeek && (
              <div
                className={`mt-4 p-3.5 rounded-xl border transition-colors ${
                  isLight
                    ? 'bg-rose-50/50 border-rose-200 text-slate-900'
                    : 'bg-slate-950/70 border-slate-800 text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-rose-500" />
                    <span className="text-xs font-bold">
                      {activeWeek.weekLabel} {activeWeek.isCurrentWeek ? '(Current)' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
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
                  </div>
                </div>

                {activeWeek.runs.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">
                    No running activities logged in this period.
                  </p>
                ) : (
                  <div className="mt-2.5 divide-y divide-slate-200/60 dark:divide-slate-800/60">
                    {activeWeek.runs.map((run) => (
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
                    ))}
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
