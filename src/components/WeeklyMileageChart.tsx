import React, { useState, useMemo } from 'react';
import {
  Footprints,
  Calendar,
  TrendingUp,
  Award,
  ChevronRight,
  Flame,
  Clock,
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
} from '../utils/mileageEngine';
import { FitnessZoneCharts, ZoneChartMode } from './FitnessZoneCharts';

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

/**
 * Responsive & proportional bar width for 4W, 8W, 12W, 24W, and 52W
 */
export function getBarWidthClass(weeksCount: number): string {
  if (weeksCount <= 4) return 'w-6 sm:w-9 max-w-[26px] sm:max-w-[36px]';
  if (weeksCount <= 8) return 'w-4 sm:w-6 max-w-[18px] sm:max-w-[26px]';
  if (weeksCount <= 12) return 'w-3 sm:w-4.5 max-w-[13px] sm:max-w-[18px]';
  if (weeksCount <= 24) return 'w-full max-w-[9px] sm:max-w-[13px]';
  return 'w-full min-w-[2px]';
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
  const [numWeeks, setNumWeeks] = useState<number>(12); // 4, 8, 12, 24, 52
  const [unit, setUnit] = useState<'miles' | 'km'>('miles');
  const [selectedWeek, setSelectedWeek] = useState<WeeklyMileageBucket | null>(null);
  const [selectedSwimWeek, setSelectedSwimWeek] = useState<WeeklySwimBucket | null>(null);
  const [selectedBikeWeek, setSelectedBikeWeek] = useState<WeeklyBikeBucket | null>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // Compute Monday-to-Sunday weekly running mileage
  const { weeks, stats } = useMemo(() => {
    return computeWeeklyRunningMileage(activities, numWeeks);
  }, [activities, numWeeks]);

  // Compute Monday-to-Sunday weekly swim distance
  const { weeks: swimWeeks, stats: swimStats } = useMemo(() => {
    return computeWeeklySwimDistance(activities, numWeeks);
  }, [activities, numWeeks]);

  // Compute Monday-to-Sunday weekly bike hours
  const { weeks: bikeWeeks, stats: bikeStats } = useMemo(() => {
    return computeWeeklyBikeHours(activities, numWeeks);
  }, [activities, numWeeks]);

  // Scroll to the right (current week) by default when weeks load or lookback changes
  React.useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
    }
  }, [weeks, numWeeks]);

  // Max value for scaling SVG bars
  const maxWeeklyDist = useMemo(() => {
    const values = weeks.map((w) => (unit === 'miles' ? w.distanceMiles : w.distanceKm));
    const highest = Math.max(...values, 10);
    return Math.ceil(highest * 1.15);
  }, [weeks, unit]);

  const activeWeek = selectedWeek || (weeks.length > 0 ? weeks[weeks.length - 1] : null);

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
                Visual analytics for running volume and multidimensional training zones
              </p>
            </div>
          </div>

          {/* Lookback & Unit Selectors */}
          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            {/* Unit Toggle: Miles vs KM (Shown when on Weekly Running Mileage) */}
            {activeTab === 'mileage' && (
              <div className="flex items-center p-0.5 rounded-lg bg-slate-950/40 border border-slate-800 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setUnit('miles')}
                  className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
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
                  className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
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
            )}

            {/* Week Range Filter: 4W, 8W, 12W, 24W, 52W */}
            <div className="flex items-center p-0.5 rounded-lg bg-slate-950/40 border border-slate-800 text-[11px] font-bold">
              {[
                { label: '4W', value: 4 },
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
              ))}
            </div>
          </div>
        </div>

        {/* Dataset Switch Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-1">
          {[
            { id: 'mileage', label: 'Weekly Running Mileage' },
            { id: 'swim_distance', label: 'Swim Distance' },
            { id: 'bike_hours', label: 'Hours on the Bike' },
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

      {/* Conditional Rendering of Selected Dataset */}
      {activeTab === 'swim_distance' && (() => {
        const activeSwimWeek = selectedSwimWeek || (swimWeeks.length > 0 ? swimWeeks[swimWeeks.length - 1] : null);
        const maxSwimDist = Math.ceil(Math.max(...swimWeeks.map((w) => w.distanceKm), 2) * 1.15);

        return (
          <div className="pt-2">
            <div className="flex items-center justify-between gap-3 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <h3 className={`text-sm sm:text-base font-extrabold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Swim Distance
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/20">
                  Mon – Sun
                </span>
              </div>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Weekly aggregated swim distance in kilometers
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 my-4">
              <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">This Week</span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-sky-500">{activeSwimWeek?.distanceKm || 0}</span>
                  <span className="text-xs text-slate-500 font-bold">km</span>
                </div>
                {swimStats.weekOverWeekChangePct !== null && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold">
                    {swimStats.weekOverWeekChangePct >= 0 ? (
                      <span className="text-emerald-500 flex items-center"><ArrowUpRight className="w-3 h-3" />+{swimStats.weekOverWeekChangePct}% vs last wk</span>
                    ) : (
                      <span className="text-rose-400 flex items-center"><ArrowDownRight className="w-3 h-3" />{swimStats.weekOverWeekChangePct}% vs last wk</span>
                    )}
                  </div>
                )}
              </div>
              <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Weekly Average</span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-sky-400">{swimStats.averageWeeklyKm}</span>
                  <span className="text-xs text-slate-500 font-bold">km/wk</span>
                </div>
                <span className="text-[10px] text-slate-500">Over {numWeeks} weeks</span>
              </div>
              <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Peak Week</span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-emerald-400">{swimStats.peakWeekKm}</span>
                  <span className="text-xs text-slate-500 font-bold">km</span>
                </div>
                <span className="text-[10px] text-slate-500 truncate block">{swimStats.peakWeekLabel || 'None'}</span>
              </div>
              <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Total Volume</span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-purple-400">{swimStats.totalKm}</span>
                  <span className="text-xs text-slate-500 font-bold">km</span>
                </div>
                <span className="text-[10px] text-slate-500">{swimStats.totalSwims} total swims</span>
              </div>
            </div>

            <div className="space-y-2 mt-4">
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span className="flex items-center gap-1.5 font-medium">
                  <BarChart2 className="w-3.5 h-3.5 text-sky-500" />
                  Swim distance per week (km)
                </span>
                <span className="font-mono text-[11px]">Peak Scale: {maxSwimDist} km</span>
              </div>

              <div className="-mx-4 sm:-mx-5 overflow-x-auto scrollbar-thin pb-2" ref={scrollContainerRef}>
                <div className={`relative pt-6 pb-2 ${numWeeks === 52 ? 'min-w-[560px] sm:min-w-full' : 'w-full'}`}>
                  {swimStats.averageWeeklyKm > 0 && (
                    <div
                      className="absolute left-0 right-0 border-b-2 border-dotted border-red-500 z-20 pointer-events-none"
                      style={{ bottom: `${Math.min(90, (swimStats.averageWeeklyKm / maxSwimDist) * 100)}%` }}
                    >
                      <span className="absolute right-2 -top-4 text-[10px] font-mono font-bold text-black bg-white/95 border border-slate-300 px-1.5 py-0.5 rounded shadow-sm">
                        Avg: {swimStats.averageWeeklyKm} km
                      </span>
                    </div>
                  )}

                  <div className={`h-44 sm:h-52 w-full flex items-end ${numWeeks === 52 ? 'gap-[1px] sm:gap-0.5' : 'gap-0.5 sm:gap-[3px]'} px-0 relative z-10`}>
                    {swimWeeks.map((w) => {
                      const val = w.distanceKm;
                      const heightPct = Math.min(100, Math.max(val > 0 ? 6 : 2, (val / maxSwimDist) * 100));
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
                            } ${numWeeks >= 24 && !isSelected ? 'hidden sm:block opacity-0 group-hover:opacity-100' : ''}`}
                          >
                            {val > 0 ? val : ''}
                          </div>
                          <div
                            className={`${getBarWidthClass(numWeeks)} relative rounded-t-md transition-all duration-300 border border-black box-border`}
                            style={{
                              height: `${heightPct}%`,
                              backgroundColor: val === 0 ? (isLight ? '#e2e8f0' : '#1e293b') : isSelected ? '#0ea5e9' : w.isCurrentWeek ? '#38bdf8' : '#0284c7',
                              opacity: val === 0 ? 0.35 : isSelected ? 1 : 0.85,
                            }}
                          />
                          <div className="mt-2 text-center w-full px-0.5">
                            <span
                              className={`text-[9px] ${numWeeks >= 24 ? 'text-[8px] sm:text-[9px]' : ''} font-mono block truncate ${
                                isSelected ? 'text-sky-500 font-bold' : 'text-slate-400'
                              }`}
                              title={w.weekLabel}
                            >
                              {numWeeks >= 24
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

            {activeSwimWeek && (
              <div className={`mt-4 p-3.5 rounded-xl border ${isLight ? 'bg-sky-50/50 border-sky-200 text-slate-900' : 'bg-slate-950/70 border-slate-800 text-slate-200'}`}>
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-sky-500" />
                    <span className="text-xs font-bold">{activeSwimWeek.weekLabel}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="font-bold text-sky-500">{activeSwimWeek.distanceKm} km ({activeSwimWeek.distanceMeters}m)</span>
                    <span className="text-slate-400">{activeSwimWeek.swimsCount} swims</span>
                  </div>
                </div>
                {activeSwimWeek.swims.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">No swim activities logged in this week.</p>
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
                          <span className="font-bold">{sw.distanceMeters}m</span>
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

      {activeTab === 'bike_hours' && (() => {
        const activeBikeWeek = selectedBikeWeek || (bikeWeeks.length > 0 ? bikeWeeks[bikeWeeks.length - 1] : null);
        const maxBikeHrs = Math.ceil(Math.max(...bikeWeeks.map((w) => w.movingHours), 5) * 1.15);

        return (
          <div className="pt-2">
            <div className="flex items-center justify-between gap-3 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <h3 className={`text-sm sm:text-base font-extrabold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Hours on the Bike
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-500/20">
                  Mon – Sun
                </span>
              </div>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Weekly aggregated cycling moving hours
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 my-4">
              <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">This Week</span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-orange-500">{activeBikeWeek?.movingHours || 0}</span>
                  <span className="text-xs text-slate-500 font-bold">hrs</span>
                </div>
                {bikeStats.weekOverWeekChangePct !== null && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold">
                    {bikeStats.weekOverWeekChangePct >= 0 ? (
                      <span className="text-emerald-500 flex items-center"><ArrowUpRight className="w-3 h-3" />+{bikeStats.weekOverWeekChangePct}% vs last wk</span>
                    ) : (
                      <span className="text-rose-400 flex items-center"><ArrowDownRight className="w-3 h-3" />{bikeStats.weekOverWeekChangePct}% vs last wk</span>
                    )}
                  </div>
                )}
              </div>
              <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Weekly Average</span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-orange-400">{bikeStats.averageWeeklyHours}</span>
                  <span className="text-xs text-slate-500 font-bold">hrs/wk</span>
                </div>
                <span className="text-[10px] text-slate-500">Over {numWeeks} weeks</span>
              </div>
              <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Peak Week</span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-emerald-400">{bikeStats.peakWeekHours}</span>
                  <span className="text-xs text-slate-500 font-bold">hrs</span>
                </div>
                <span className="text-[10px] text-slate-500 truncate block">{bikeStats.peakWeekLabel || 'None'}</span>
              </div>
              <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Total Volume</span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-black font-mono text-purple-400">{bikeStats.totalHours}</span>
                  <span className="text-xs text-slate-500 font-bold">hrs</span>
                </div>
                <span className="text-[10px] text-slate-500">{bikeStats.totalRides} total rides</span>
              </div>
            </div>

            <div className="space-y-2 mt-4">
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span className="flex items-center gap-1.5 font-medium">
                  <Clock className="w-3.5 h-3.5 text-orange-500" />
                  Cycling hours per week
                </span>
                <span className="font-mono text-[11px]">Peak Scale: {maxBikeHrs} hrs</span>
              </div>

              <div className="-mx-4 sm:-mx-5 overflow-x-auto scrollbar-thin pb-2" ref={scrollContainerRef}>
                <div className={`relative pt-6 pb-2 ${numWeeks === 52 ? 'min-w-[560px] sm:min-w-full' : 'w-full'}`}>
                  {bikeStats.averageWeeklyHours > 0 && (
                    <div
                      className="absolute left-0 right-0 border-b-2 border-dotted border-red-500 z-20 pointer-events-none"
                      style={{ bottom: `${Math.min(90, (bikeStats.averageWeeklyHours / maxBikeHrs) * 100)}%` }}
                    >
                      <span className="absolute right-2 -top-4 text-[10px] font-mono font-bold text-black bg-white/95 border border-slate-300 px-1.5 py-0.5 rounded shadow-sm">
                        Avg: {bikeStats.averageWeeklyHours} hrs
                      </span>
                    </div>
                  )}

                  <div className={`h-44 sm:h-52 w-full flex items-end ${numWeeks === 52 ? 'gap-[1px] sm:gap-0.5' : 'gap-0.5 sm:gap-[3px]'} px-0 relative z-10`}>
                    {bikeWeeks.map((w) => {
                      const val = w.movingHours;
                      const heightPct = Math.min(100, Math.max(val > 0 ? 6 : 2, (val / maxBikeHrs) * 100));
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
                            } ${numWeeks >= 24 && !isSelected ? 'hidden sm:block opacity-0 group-hover:opacity-100' : ''}`}
                          >
                            {val > 0 ? val : ''}
                          </div>
                          <div
                            className={`${getBarWidthClass(numWeeks)} relative rounded-t-md transition-all duration-300 border border-black box-border`}
                            style={{
                              height: `${heightPct}%`,
                              backgroundColor: val === 0 ? (isLight ? '#e2e8f0' : '#1e293b') : isSelected ? '#f97316' : w.isCurrentWeek ? '#fb923c' : '#ea580c',
                              opacity: val === 0 ? 0.35 : isSelected ? 1 : 0.85,
                            }}
                          />
                          <div className="mt-2 text-center w-full px-0.5">
                            <span
                              className={`text-[9px] ${numWeeks >= 24 ? 'text-[8px] sm:text-[9px]' : ''} font-mono block truncate ${
                                isSelected ? 'text-orange-500 font-bold' : 'text-slate-400'
                              }`}
                              title={w.weekLabel}
                            >
                              {numWeeks >= 24
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

            {activeBikeWeek && (
              <div className={`mt-4 p-3.5 rounded-xl border ${isLight ? 'bg-orange-50/50 border-orange-200 text-slate-900' : 'bg-slate-950/70 border-slate-800 text-slate-200'}`}>
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-orange-500" />
                    <span className="text-xs font-bold">{activeBikeWeek.weekLabel}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="font-bold text-orange-500">{activeBikeWeek.movingHours} hrs ({activeBikeWeek.distanceKm} km)</span>
                    <span className="text-slate-400">{activeBikeWeek.ridesCount} rides</span>
                  </div>
                </div>
                {activeBikeWeek.rides.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3 text-center">No cycling activities logged in this week.</p>
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
                          <span className="text-slate-400">{rd.distanceKm} km</span>
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

      {activeTab === 'cycling_power' && (
        <div className="pt-4">
          <FitnessZoneCharts
            mode="cycling_power"
            activities={activities}
            activityDetails={activityDetails}
            athleteProfile={athleteProfile}
            numWeeks={numWeeks}
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
            numWeeks={numWeeks}
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
            numWeeks={numWeeks}
            theme={theme}
            onSelectActivity={onSelectActivity}
          />
        </div>
      )}

      {activeTab === 'mileage' && (
        <>
          {/* Subheader: Weekly Running Mileage */}
          <div className="flex items-center justify-between gap-3 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <h3
                className={`text-sm sm:text-base font-extrabold tracking-tight ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}
              >
                Weekly Running Mileage
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                Mon – Sun
              </span>
            </div>
            <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Weekly aggregated distance strictly Monday through Sunday
            </p>
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
            This Week (Mon–Sun)
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black font-mono text-amber-500">
              {unit === 'miles' ? stats.currentWeekMiles : Math.round(stats.currentWeekMiles * 1.60934 * 10) / 10}
            </span>
            <span className="text-xs text-slate-500 font-bold">{unit}</span>
          </div>
          {stats.weekOverWeekChangePct !== null && (
            <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold">
              {stats.weekOverWeekChangePct >= 0 ? (
                <span className="text-emerald-500 flex items-center">
                  <ArrowUpRight className="w-3 h-3" />+{stats.weekOverWeekChangePct}% vs last wk
                </span>
              ) : (
                <span className="text-rose-400 flex items-center">
                  <ArrowDownRight className="w-3 h-3" />
                  {stats.weekOverWeekChangePct}% vs last wk
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
            Weekly Average
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black font-mono text-sky-400">
              {unit === 'miles' ? stats.averageWeeklyMiles : stats.averageWeeklyKm}
            </span>
            <span className="text-xs text-slate-500 font-bold">{unit}/wk</span>
          </div>
          <span className="text-[10px] text-slate-500">Over {numWeeks} weeks</span>
        </div>

        <div
          className={`p-3 rounded-xl border ${
            isLight
              ? 'bg-slate-50 border-slate-200'
              : 'bg-slate-950/40 border-slate-800/80'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
            Peak Week
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black font-mono text-emerald-400">
              {unit === 'miles' ? stats.peakWeekMiles : Math.round(stats.peakWeekMiles * 1.60934 * 10) / 10}
            </span>
            <span className="text-xs text-slate-500 font-bold">{unit}</span>
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
              {unit === 'miles' ? stats.totalMiles : stats.totalKm}
            </span>
            <span className="text-xs text-slate-500 font-bold">{unit}</span>
          </div>
          <span className="text-[10px] text-slate-500">{stats.totalRuns} total runs</span>
        </div>
      </div>

      {/* SVG Bar Chart */}
      <div className="space-y-2 mt-4">
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span className="flex items-center gap-1.5 font-medium">
            <BarChart2 className="w-3.5 h-3.5 text-amber-500" />
            Distance per week (Mon to Sun)
          </span>
          <span className="font-mono text-[11px]">
            Peak Scale: {maxWeeklyDist} {unit}
          </span>
        </div>

        <div className="-mx-4 sm:-mx-5 overflow-x-auto scrollbar-thin pb-2" ref={scrollContainerRef}>
          <div className={`relative pt-6 pb-2 ${numWeeks === 52 ? 'min-w-[560px] sm:min-w-full' : 'w-full'}`}>
            {/* Average Reference Line */}
            {stats.averageWeeklyMiles > 0 && (
              <div
                className="absolute left-0 right-0 border-b-2 border-dotted border-red-500 z-20 pointer-events-none"
                style={{
                  bottom: `${Math.min(
                    90,
                    ((unit === 'miles' ? stats.averageWeeklyMiles : stats.averageWeeklyKm) /
                      maxWeeklyDist) *
                      100
                  )}%`,
                }}
              >
                <span className="absolute right-2 -top-4 text-[10px] font-mono font-bold text-black bg-white/95 border border-slate-300 px-1.5 py-0.5 rounded shadow-sm">
                  Avg: {unit === 'miles' ? stats.averageWeeklyMiles : stats.averageWeeklyKm} {unit}
                </span>
              </div>
            )}

            {/* Bar Chart Grid */}
            <div className={`h-44 sm:h-52 w-full flex items-end ${numWeeks === 52 ? 'gap-[1px] sm:gap-0.5' : 'gap-0.5 sm:gap-[3px]'} px-0 relative z-10`}>
              {weeks.map((w) => {
                const val = unit === 'miles' ? w.distanceMiles : w.distanceKm;
                const heightPct = Math.min(100, Math.max(val > 0 ? 6 : 2, (val / maxWeeklyDist) * 100));
                const isSelected = activeWeek?.weekKey === w.weekKey;

                return (
                  <div
                    key={w.weekKey}
                    onClick={() => setSelectedWeek(w)}
                    className="flex-1 min-w-0 flex flex-col items-center h-full justify-end cursor-pointer group"
                  >
                    {/* Tooltip value on hover / select */}
                    <div
                      className={`text-[10px] font-mono font-bold mb-1 transition-all whitespace-nowrap ${
                        val > 0
                          ? isSelected
                            ? 'text-amber-400 scale-110'
                            : isLight
                            ? 'text-slate-700 group-hover:text-amber-600'
                            : 'text-slate-400 group-hover:text-amber-400'
                          : 'opacity-0'
                      } ${numWeeks >= 24 && !isSelected ? 'hidden sm:block opacity-0 group-hover:opacity-100' : ''}`}
                    >
                      {val > 0 ? val : ''}
                    </div>

                    {/* Bar */}
                    <div
                      className={`${getBarWidthClass(numWeeks)} relative rounded-t-md transition-all duration-300 border border-black box-border`}
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
                        className={`text-[9px] ${numWeeks >= 24 ? 'text-[8px] sm:text-[9px]' : ''} font-mono block truncate ${
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
                        {numWeeks >= 24
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

      {/* Selected Week Detailed Run Breakdown */}
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
                {activeWeek.weekLabel} {activeWeek.isCurrentWeek ? '(Current Week)' : ''}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="font-bold text-amber-500">
                {unit === 'miles' ? activeWeek.distanceMiles : activeWeek.distanceKm} {unit}
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
              No running activities logged in this week.
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
                      {unit === 'miles' ? run.distanceMiles : run.distanceKm} {unit}
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
      )}
    </div>
  );
};
