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
import { StravaActivity } from '../utils/stravaActivities';
import {
  computeWeeklyRunningMileage,
  WeeklyMileageBucket,
} from '../utils/mileageEngine';

interface WeeklyMileageChartProps {
  activities: StravaActivity[];
  theme?: 'dark' | 'light';
  onSelectActivity?: (activityId: string | number) => void;
}

export const WeeklyMileageChart: React.FC<WeeklyMileageChartProps> = ({
  activities,
  theme = 'dark',
  onSelectActivity,
}) => {
  const isLight = theme === 'light';
  const [numWeeks, setNumWeeks] = useState<number>(12); // 4, 8, 12, 24
  const [unit, setUnit] = useState<'miles' | 'km'>('miles');
  const [selectedWeek, setSelectedWeek] = useState<WeeklyMileageBucket | null>(null);

  // Compute Monday-to-Sunday weekly mileage data
  const { weeks, stats } = useMemo(() => {
    return computeWeeklyRunningMileage(activities, numWeeks);
  }, [activities, numWeeks]);

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
      {/* Header with Title & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
            <Footprints className="w-5 h-5" />
          </div>
          <div>
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
        </div>

        {/* Lookback & Unit Selectors */}
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {/* Unit Toggle: Miles vs KM */}
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

          {/* Week Range Filter */}
          <div className="flex items-center p-0.5 rounded-lg bg-slate-950/40 border border-slate-800 text-[11px] font-bold">
            {[
              { label: '4W', value: 4 },
              { label: '8W', value: 8 },
              { label: '12W', value: 12 },
              { label: '24W', value: 24 },
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

        <div className="overflow-x-auto scrollbar-thin pb-2">
          <div className="relative pt-6 pb-2 min-w-[520px]">
            {/* Average Reference Line */}
            {stats.averageWeeklyMiles > 0 && (
              <div
                className="absolute left-0 right-0 border-b border-dashed border-sky-400/40 z-0 pointer-events-none"
                style={{
                  bottom: `${Math.min(
                    90,
                    ((unit === 'miles' ? stats.averageWeeklyMiles : stats.averageWeeklyKm) /
                      maxWeeklyDist) *
                      100
                  )}%`,
                }}
              >
                <span className="absolute right-1 -top-4 text-[9px] font-mono text-sky-400/80 bg-slate-950/80 px-1 rounded">
                  Avg: {unit === 'miles' ? stats.averageWeeklyMiles : stats.averageWeeklyKm} {unit}
                </span>
              </div>
            )}

            {/* Bar Chart Grid */}
            <div className="h-44 sm:h-52 w-full flex items-end gap-1.5 sm:gap-2.5 px-1 relative z-10">
              {weeks.map((w) => {
                const val = unit === 'miles' ? w.distanceMiles : w.distanceKm;
                const heightPct = Math.min(100, Math.max(val > 0 ? 6 : 2, (val / maxWeeklyDist) * 100));
                const isSelected = activeWeek?.weekKey === w.weekKey;

                return (
                  <div
                    key={w.weekKey}
                    onClick={() => setSelectedWeek(w)}
                    className="flex-1 flex flex-col items-center h-full justify-end cursor-pointer group min-w-[28px]"
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
                      }`}
                    >
                      {val > 0 ? val : ''}
                    </div>

                    {/* Bar */}
                    <div
                      className="w-full relative rounded-t-md transition-all duration-300"
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
                    <div className="mt-2 text-center w-full">
                      <span
                        className={`text-[9px] font-mono block truncate ${
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
                        {w.shortLabel.replace(/^[A-Za-z]+ /, '')}
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
    </div>
  );
};
