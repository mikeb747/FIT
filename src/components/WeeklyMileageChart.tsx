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
  WeeklyMileageBucket,
  WeeklySwimBucket,
  WeeklyBikeBucket,
  TimeGranularity,
} from '../utils/mileageEngine';
import { FitnessZoneCharts } from './FitnessZoneCharts';

export type ChartDatasetTab = 'mileage' | 'swim_distance' | 'bike_hours' | 'cycling_power' | 'running_pace' | 'running_hr';

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
  initialTab = 'mileage',
}) => {
  const isLight = theme === 'light';
  const [activeTab, setActiveTab] = useState<ChartDatasetTab>(initialTab);
  const [granularity, setGranularity] = useState<TimeGranularity>('week');
  const [numWeeks, setNumWeeks] = useState<number>(12); // 8, 12, 24, 52 (4W removed)
  const [numMonths, setNumMonths] = useState<number>(3); // 2, 3, 6, 12
  const [unit, setUnit] = useState<'miles' | 'km'>('miles');
  const [metricType, setMetricType] = useState<'distance' | 'time'>('distance');

  const [selectedWeek, setSelectedWeek] = useState<WeeklyMileageBucket | null>(null);
  const [selectedSwimWeek, setSelectedSwimWeek] = useState<WeeklySwimBucket | null>(null);
  const [selectedBikeWeek, setSelectedBikeWeek] = useState<WeeklyBikeBucket | null>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const currentPeriodCount = granularity === 'month' ? numMonths : numWeeks;

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

  // Scroll to the right (current period) by default when data loads or lookback changes
  React.useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
    }
  }, [weeks, swimWeeks, bikeWeeks, currentPeriodCount, granularity]);

  // Active selected period or default to the most recent period
  const activeWeek = selectedWeek || (weeks.length > 0 ? weeks[weeks.length - 1] : null);
  const activeSwimWeek = selectedSwimWeek || (swimWeeks.length > 0 ? swimWeeks[swimWeeks.length - 1] : null);
  const activeBikeWeek = selectedBikeWeek || (bikeWeeks.length > 0 ? bikeWeeks[bikeWeeks.length - 1] : null);

  // Peak Scale calculations
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

  // Helper renderer for inside-activity Controls (Miles/KM and Distance/Time)
  const renderActivityControls = () => (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Unit Toggle: Miles / KM */}
      <div className="flex items-center p-0.5 rounded-lg bg-slate-950/40 border border-slate-800 text-[11px] font-bold">
        <button
          type="button"
          onClick={() => setUnit('miles')}
          className={`px-2 py-0.5 sm:py-1 rounded-md transition-colors cursor-pointer ${
            unit === 'miles'
              ? 'bg-amber-500 text-slate-950 shadow-xs'
              : isLight
              ? 'text-slate-600 hover:text-slate-900'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Miles
        </button>
        <button
          type="button"
          onClick={() => setUnit('km')}
          className={`px-2 py-0.5 sm:py-1 rounded-md transition-colors cursor-pointer ${
            unit === 'km'
              ? 'bg-amber-500 text-slate-950 shadow-xs'
              : isLight
              ? 'text-slate-600 hover:text-slate-900'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          KM
        </button>
      </div>

      {/* Metric Toggle: Distance / Time */}
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

            {/* Range Filter: 8W, 12W, 24W, 52W OR 2M, 3M, 6M, 12M */}
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
                    { label: '2M', value: 2 },
                    { label: '3M', value: 3 },
                    { label: '6M', value: 6 },
                    { label: '12M', value: 12 },
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
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-1">
          {[
            { id: 'mileage', label: 'Run' },
            { id: 'swim_distance', label: 'Swim' },
            { id: 'bike_hours', label: 'Bike' },
            { id: 'cycling_power', label: 'Cycling Power Zones' },
            { id: 'running_pace', label: 'Running Pace Zones' },
            { id: 'running_hr', label: 'Running Heart Rate Zones' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as ChartDatasetTab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/20'
                  : isLight
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* SWIM SECTION */}
      {activeTab === 'swim_distance' && (() => {
        const currentVal =
          metricType === 'distance'
            ? (unit === 'miles' ? activeSwimWeek?.distanceMiles : activeSwimWeek?.distanceKm) || 0
            : activeSwimWeek?.movingHours || 0;

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
                  {granularity === 'month' ? 'This Month' : 'This Week'}
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-sky-500">{currentVal}</span>
                  <span className="text-xs text-slate-500 font-bold">{metricUnitLabel}</span>
                </div>
                {swimStats.weekOverWeekChangePct !== null && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold">
                    {swimStats.weekOverWeekChangePct >= 0 ? (
                      <span className="text-emerald-500 flex items-center">
                        <ArrowUpRight className="w-3 h-3" />+{swimStats.weekOverWeekChangePct}% vs last {granularity === 'month' ? 'mo' : 'wk'}
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center">
                        <ArrowDownRight className="w-3 h-3" />{swimStats.weekOverWeekChangePct}% vs last {granularity === 'month' ? 'mo' : 'wk'}
                      </span>
                    )}
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
                  Over {currentPeriodCount} {granularity === 'month' ? (currentPeriodCount === 1 ? 'month' : 'months') : 'weeks'}
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
                <div className={`relative pt-6 pb-2 ${currentPeriodCount === 52 ? 'min-w-[560px] sm:min-w-full' : 'w-full'}`}>
                  {avgVal > 0 && (
                    <div
                      className="absolute left-0 right-0 border-b-2 border-dotted border-red-500 z-20 pointer-events-none"
                      style={{ bottom: `${Math.min(90, (avgVal / maxSwimScale) * 100)}%` }}
                    >
                      <span className="absolute right-2 -top-4 text-[10px] font-mono font-bold text-black bg-white/95 border border-slate-300 px-1.5 py-0.5 rounded shadow-sm">
                        Avg: {avgVal} {metricUnitLabel}
                      </span>
                    </div>
                  )}

                  <div className={`h-44 sm:h-52 w-full flex items-end ${currentPeriodCount === 52 ? 'gap-[1.5px]' : 'gap-[3px]'} px-0 relative z-10`}>
                    {swimWeeks.map((w) => {
                      const val =
                        metricType === 'distance'
                          ? (unit === 'miles' ? w.distanceMiles : w.distanceKm)
                          : w.movingHours;
                      const heightPct = Math.min(100, Math.max(val > 0 ? 6 : 2, (val / maxSwimScale) * 100));
                      const isSelected = activeSwimWeek?.weekKey === w.weekKey;

                      return (
                        <div
                          key={w.weekKey}
                          onClick={() => setSelectedSwimWeek(w)}
                          className="flex-1 min-w-0 flex flex-col items-center h-full justify-end cursor-pointer group"
                        >
                          <div
                            className={`text-[10px] font-mono font-bold mb-1 transition-all whitespace-nowrap ${
                              val > 0
                                ? isSelected
                                  ? 'text-sky-400 scale-110'
                                  : 'text-slate-400 group-hover:text-sky-300'
                                : 'opacity-0'
                            } ${currentPeriodCount >= 24 && !isSelected ? 'hidden sm:block opacity-0 group-hover:opacity-100' : ''}`}
                          >
                            {val > 0 ? val : ''}
                          </div>
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
                                  ? '#0ea5e9'
                                  : w.isCurrentWeek
                                  ? '#38bdf8'
                                  : '#0284c7',
                              opacity: val === 0 ? 0.35 : isSelected ? 1 : 0.85,
                              boxShadow: isSelected ? '0 0 12px rgba(14, 165, 233, 0.45)' : undefined,
                            }}
                          />
                          <div className="mt-2 text-center w-full px-0.5">
                            <span
                              className={`text-[9px] ${currentPeriodCount >= 24 ? 'text-[8px] sm:text-[9px]' : ''} font-mono block truncate ${
                                isSelected ? 'text-sky-500 font-bold' : 'text-slate-400'
                              }`}
                              title={w.weekLabel}
                            >
                              {granularity === 'month'
                                ? w.shortLabel
                                : currentPeriodCount >= 24
                                ? formatWeekShortCode(w.mondayDate)
                                : w.shortLabel.replace(/^[A-Za-z]+ /, '')}
                            </span>
                          </div>
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
                            {unit === 'miles' ? `${Math.round(sw.distanceKm * 0.621371 * 10) / 10} mi` : `${sw.distanceMeters}m`}
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
                  {granularity === 'month' ? 'This Month' : 'This Week'}
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-orange-500">{currentVal}</span>
                  <span className="text-xs text-slate-500 font-bold">{metricUnitLabel}</span>
                </div>
                {bikeStats.weekOverWeekChangePct !== null && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold">
                    {bikeStats.weekOverWeekChangePct >= 0 ? (
                      <span className="text-emerald-500 flex items-center">
                        <ArrowUpRight className="w-3 h-3" />+{bikeStats.weekOverWeekChangePct}% vs last {granularity === 'month' ? 'mo' : 'wk'}
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center">
                        <ArrowDownRight className="w-3 h-3" />{bikeStats.weekOverWeekChangePct}% vs last {granularity === 'month' ? 'mo' : 'wk'}
                      </span>
                    )}
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
                  Over {currentPeriodCount} {granularity === 'month' ? (currentPeriodCount === 1 ? 'month' : 'months') : 'weeks'}
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
                <div className={`relative pt-6 pb-2 ${currentPeriodCount === 52 ? 'min-w-[560px] sm:min-w-full' : 'w-full'}`}>
                  {avgVal > 0 && (
                    <div
                      className="absolute left-0 right-0 border-b-2 border-dotted border-red-500 z-20 pointer-events-none"
                      style={{ bottom: `${Math.min(90, (avgVal / maxBikeScale) * 100)}%` }}
                    >
                      <span className="absolute right-2 -top-4 text-[10px] font-mono font-bold text-black bg-white/95 border border-slate-300 px-1.5 py-0.5 rounded shadow-sm">
                        Avg: {avgVal} {metricUnitLabel}
                      </span>
                    </div>
                  )}

                  <div className={`h-44 sm:h-52 w-full flex items-end ${currentPeriodCount === 52 ? 'gap-[1.5px]' : 'gap-[3px]'} px-0 relative z-10`}>
                    {bikeWeeks.map((w) => {
                      const val =
                        metricType === 'distance'
                          ? (unit === 'miles' ? w.distanceMiles : w.distanceKm)
                          : w.movingHours;
                      const heightPct = Math.min(100, Math.max(val > 0 ? 6 : 2, (val / maxBikeScale) * 100));
                      const isSelected = activeBikeWeek?.weekKey === w.weekKey;

                      return (
                        <div
                          key={w.weekKey}
                          onClick={() => setSelectedBikeWeek(w)}
                          className="flex-1 min-w-0 flex flex-col items-center h-full justify-end cursor-pointer group"
                        >
                          <div
                            className={`text-[10px] font-mono font-bold mb-1 transition-all whitespace-nowrap ${
                              val > 0
                                ? isSelected
                                  ? 'text-orange-400 scale-110'
                                  : 'text-slate-400 group-hover:text-orange-300'
                                : 'opacity-0'
                            } ${currentPeriodCount >= 24 && !isSelected ? 'hidden sm:block opacity-0 group-hover:opacity-100' : ''}`}
                          >
                            {val > 0 ? val : ''}
                          </div>
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
                                  ? '#f97316'
                                  : w.isCurrentWeek
                                  ? '#fb923c'
                                  : '#ea580c',
                              opacity: val === 0 ? 0.35 : isSelected ? 1 : 0.85,
                              boxShadow: isSelected ? '0 0 12px rgba(249, 115, 22, 0.45)' : undefined,
                            }}
                          />
                          <div className="mt-2 text-center w-full px-0.5">
                            <span
                              className={`text-[9px] ${currentPeriodCount >= 24 ? 'text-[8px] sm:text-[9px]' : ''} font-mono block truncate ${
                                isSelected ? 'text-orange-500 font-bold' : 'text-slate-400'
                              }`}
                              title={w.weekLabel}
                            >
                              {granularity === 'month'
                                ? w.shortLabel
                                : currentPeriodCount >= 24
                                ? formatWeekShortCode(w.mondayDate)
                                : w.shortLabel.replace(/^[A-Za-z]+ /, '')}
                            </span>
                          </div>
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
                            {unit === 'miles' ? `${Math.round(rd.distanceKm * 0.621371 * 10) / 10} mi` : `${rd.distanceKm} km`}
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
        <div className="pt-4">
          <FitnessZoneCharts
            mode="cycling_power"
            activities={activities}
            activityDetails={activityDetails}
            athleteProfile={athleteProfile}
            numWeeks={granularity === 'month' ? numMonths * 4 : numWeeks}
            theme={theme}
            onSelectActivity={onSelectActivity}
          />
        </div>
      )}

      {activeTab === 'running_pace' && (
        <div className="pt-4">
          <FitnessZoneCharts
            mode="running_pace"
            activities={activities}
            activityDetails={activityDetails}
            athleteProfile={athleteProfile}
            numWeeks={granularity === 'month' ? numMonths * 4 : numWeeks}
            theme={theme}
            onSelectActivity={onSelectActivity}
          />
        </div>
      )}

      {activeTab === 'running_hr' && (
        <div className="pt-4">
          <FitnessZoneCharts
            mode="running_hr"
            activities={activities}
            activityDetails={activityDetails}
            athleteProfile={athleteProfile}
            numWeeks={granularity === 'month' ? numMonths * 4 : numWeeks}
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
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20">
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
                  {granularity === 'month' ? 'This Month' : 'This Week'}
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-amber-500">
                    {currentVal}
                  </span>
                  <span className="text-xs text-slate-500 font-bold">{metricUnitLabel}</span>
                </div>
                {stats.weekOverWeekChangePct !== null && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold">
                    {stats.weekOverWeekChangePct >= 0 ? (
                      <span className="text-emerald-500 flex items-center">
                        <ArrowUpRight className="w-3 h-3" />+{stats.weekOverWeekChangePct}% vs last {granularity === 'month' ? 'mo' : 'wk'}
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center">
                        <ArrowDownRight className="w-3 h-3" />
                        {stats.weekOverWeekChangePct}% vs last {granularity === 'month' ? 'mo' : 'wk'}
                      </span>
                    )}
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
                  Over {currentPeriodCount} {granularity === 'month' ? (currentPeriodCount === 1 ? 'month' : 'months') : 'weeks'}
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
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span className="flex items-center gap-1.5 font-medium">
                  <BarChart2 className="w-3.5 h-3.5 text-amber-500" />
                  Run {metricType === 'distance' ? `distance (${unit})` : 'moving time (hours)'} per {granularity}
                </span>
                <span className="font-mono text-[11px]">
                  Peak Scale: {maxWeeklyRun} {metricUnitLabel}
                </span>
              </div>

              <div className="-mx-4 sm:-mx-5 overflow-x-auto scrollbar-thin pb-2" ref={scrollContainerRef}>
                <div className={`relative pt-6 pb-2 ${currentPeriodCount === 52 ? 'min-w-[560px] sm:min-w-full' : 'w-full'}`}>
                  {/* Average Reference Line */}
                  {avgVal > 0 && (
                    <div
                      className="absolute left-0 right-0 border-b-2 border-dotted border-red-500 z-20 pointer-events-none"
                      style={{
                        bottom: `${Math.min(90, (avgVal / maxWeeklyRun) * 100)}%`,
                      }}
                    >
                      <span className="absolute right-2 -top-4 text-[10px] font-mono font-bold text-black bg-white/95 border border-slate-300 px-1.5 py-0.5 rounded shadow-sm">
                        Avg: {avgVal} {metricUnitLabel}
                      </span>
                    </div>
                  )}

                  {/* Bar Chart Grid: 3px gap, bars expand to fill available column width */}
                  <div className={`h-44 sm:h-52 w-full flex items-end ${currentPeriodCount === 52 ? 'gap-[1.5px]' : 'gap-[3px]'} px-0 relative z-10`}>
                    {weeks.map((w) => {
                      const val =
                        metricType === 'distance'
                          ? (unit === 'miles' ? w.distanceMiles : w.distanceKm)
                          : w.movingHours;
                      const heightPct = Math.min(100, Math.max(val > 0 ? 6 : 2, (val / maxWeeklyRun) * 100));
                      const isSelected = activeWeek?.weekKey === w.weekKey;

                      return (
                        <div
                          key={w.weekKey}
                          onClick={() => setSelectedWeek(w)}
                          className="flex-1 min-w-0 flex flex-col items-center h-full justify-end cursor-pointer group"
                        >
                          {/* Value on hover / select */}
                          <div
                            className={`text-[10px] font-mono font-bold mb-1 transition-all whitespace-nowrap ${
                              val > 0
                                ? isSelected
                                  ? 'text-amber-400 scale-110'
                                  : isLight
                                  ? 'text-slate-700 group-hover:text-amber-600'
                                  : 'text-slate-400 group-hover:text-amber-400'
                                : 'opacity-0'
                            } ${currentPeriodCount >= 24 && !isSelected ? 'hidden sm:block opacity-0 group-hover:opacity-100' : ''}`}
                          >
                            {val > 0 ? val : ''}
                          </div>

                          {/* Bar: w-full fills the flex-1 column, gap-[3px] between bars */}
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

                          {/* Date label at bottom */}
                          <div className="mt-2 text-center w-full px-0.5">
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
                                ? w.shortLabel
                                : currentPeriodCount >= 24
                                ? formatWeekShortCode(w.mondayDate)
                                : w.shortLabel.replace(/^[A-Za-z]+ /, '')}
                            </span>
                          </div>
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
                    ? 'bg-amber-50/50 border-amber-200 text-slate-900'
                    : 'bg-slate-950/70 border-slate-800 text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-bold">
                      {activeWeek.weekLabel} {activeWeek.isCurrentWeek ? '(Current)' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="font-bold text-amber-500">
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
                          onSelectActivity ? 'hover:bg-amber-500/10 cursor-pointer' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-[11px] font-mono font-bold text-amber-500 shrink-0 w-8">
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
