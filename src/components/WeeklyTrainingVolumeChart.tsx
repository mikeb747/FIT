import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  Clock,
  TrendingUp,
  Waves,
  Bike,
  Footprints,
  Calendar,
  Layers,
  Award,
  Zap,
} from 'lucide-react';
import {
  StravaActivity,
  StravaActivityDetailsRecord,
  classifyActivity,
} from '../utils/stravaActivities';
import { AthleteProfile } from '../types/athlete';
import { getMondayOfWeek } from '../utils/mileageEngine';

interface WeeklyTrainingVolumeChartProps {
  activities: StravaActivity[];
  activityDetails?: Record<string, StravaActivityDetailsRecord>;
  athleteProfile?: AthleteProfile;
  theme?: 'dark' | 'light';
}

export type VolumeChartMetric = 'dual' | 'hours' | 'distance';
export type LookbackWeeksOption = 8 | 12 | 16 | 26 | 52;

export interface WeekVolumeData {
  weekKey: string;
  shortLabel: string;
  weekLabel: string;
  isCurrentWeek: boolean;
  // Hours
  swimHours: number;
  bikeHours: number;
  runHours: number;
  otherHours: number;
  totalHours: number;
  // Distance in KM
  swimKm: number;
  bikeKm: number;
  runKm: number;
  otherKm: number;
  totalKm: number;
  // Counts
  activityCount: number;
  swimCount: number;
  bikeCount: number;
  runCount: number;
}

export const WeeklyTrainingVolumeChart: React.FC<WeeklyTrainingVolumeChartProps> = ({
  activities,
  activityDetails = {},
  theme = 'dark',
}) => {
  const isLight = theme === 'light';

  const [metricMode, setMetricMode] = useState<VolumeChartMetric>('dual');
  const [numWeeks, setNumWeeks] = useState<LookbackWeeksOption>(12);
  const [selectedSportFilter, setSelectedSportFilter] = useState<'all' | 'swim' | 'bike' | 'run'>('all');

  // Colors matching the app design system
  const colors = {
    swim: '#38bdf8', // sky-400 (Blue)
    bike: '#fb923c', // orange-400 (Orange)
    run: '#f43f5e', // rose-500 (Red)
    other: '#a78bfa', // purple-400
    totalHours: '#34d399', // emerald-400
    totalDistance: '#10b981', // emerald-500
    grid: isLight ? '#e2e8f0' : '#1e293b',
    text: isLight ? '#64748b' : '#94a3b8',
    tooltipBg: isLight ? '#ffffff' : '#090d16',
    tooltipBorder: isLight ? '#cbd5e1' : '#334155',
  };

  // Group activities into Monday-start weekly buckets
  const weeklyData = useMemo<WeekVolumeData[]>(() => {
    const today = new Date();
    const currentMonday = getMondayOfWeek(today);

    // Build the N week buckets ending with current week
    const buckets: WeekVolumeData[] = [];
    for (let i = numWeeks - 1; i >= 0; i--) {
      const mon = new Date(currentMonday);
      mon.setDate(currentMonday.getDate() - i * 7);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);

      const monYear = mon.getFullYear();
      const monMonth = String(mon.getMonth() + 1).padStart(2, '0');
      const monDay = String(mon.getDate()).padStart(2, '0');
      const weekKey = `${monYear}-${monMonth}-${monDay}`;

      const shortLabel = mon.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
      });

      const weekLabel = `${shortLabel} – ${sun.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
      })}`;

      buckets.push({
        weekKey,
        shortLabel,
        weekLabel,
        isCurrentWeek: i === 0,
        swimHours: 0,
        bikeHours: 0,
        runHours: 0,
        otherHours: 0,
        totalHours: 0,
        swimKm: 0,
        bikeKm: 0,
        runKm: 0,
        otherKm: 0,
        totalKm: 0,
        activityCount: 0,
        swimCount: 0,
        bikeCount: 0,
        runCount: 0,
      });
    }

    const bucketMap = new Map<string, WeekVolumeData>();
    buckets.forEach((b) => bucketMap.set(b.weekKey, b));

    // Aggregate each valid activity
    activities.forEach((act) => {
      if (act.isDeleted || !act.start_date) return;

      const actDate = new Date(act.start_date_local || act.start_date);
      if (isNaN(actDate.getTime())) return;

      const mon = getMondayOfWeek(actDate);
      const key = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(
        mon.getDate()
      ).padStart(2, '0')}`;

      const bucket = bucketMap.get(key);
      if (!bucket) return;

      const details = activityDetails[String(act.id)];
      const distM = details?.calibration?.calibratedDistanceM ?? act.distance ?? 0;
      const movingSec = details?.calibration?.calibratedMovingTimeSec ?? act.moving_time ?? 0;

      const hours = movingSec / 3600;
      const km = distM / 1000;

      const { category } = classifyActivity(act);

      bucket.activityCount += 1;

      if (category === 'Swim') {
        bucket.swimHours += hours;
        bucket.swimKm += km;
        bucket.swimCount += 1;
      } else if (category === 'Bike') {
        bucket.bikeHours += hours;
        bucket.bikeKm += km;
        bucket.bikeCount += 1;
      } else if (category === 'Run') {
        bucket.runHours += hours;
        bucket.runKm += km;
        bucket.runCount += 1;
      } else {
        bucket.otherHours += hours;
        bucket.otherKm += km;
      }
    });

    // Round values to 1 decimal place
    return buckets.map((b) => {
      const sHours = Math.round(b.swimHours * 10) / 10;
      const bHours = Math.round(b.bikeHours * 10) / 10;
      const rHours = Math.round(b.runHours * 10) / 10;
      const oHours = Math.round(b.otherHours * 10) / 10;
      const totHours = Math.round((sHours + bHours + rHours + oHours) * 10) / 10;

      const sKm = Math.round(b.swimKm * 10) / 10;
      const bKm = Math.round(b.bikeKm * 10) / 10;
      const rKm = Math.round(b.runKm * 10) / 10;
      const oKm = Math.round(b.otherKm * 10) / 10;
      const totKm = Math.round((sKm + bKm + rKm + oKm) * 10) / 10;

      return {
        ...b,
        swimHours: sHours,
        bikeHours: bHours,
        runHours: rHours,
        otherHours: oHours,
        totalHours: totHours,
        swimKm: sKm,
        bikeKm: bKm,
        runKm: rKm,
        otherKm: oKm,
        totalKm: totKm,
      };
    });
  }, [activities, activityDetails, numWeeks]);

  // Aggregate summary stats for the period
  const stats = useMemo(() => {
    let sumHours = 0;
    let sumKm = 0;
    let sumSwimHours = 0;
    let sumBikeHours = 0;
    let sumRunHours = 0;
    let totalActs = 0;
    let peakHours = 0;
    let peakWeekLabel = '';

    weeklyData.forEach((w) => {
      sumHours += w.totalHours;
      sumKm += w.totalKm;
      sumSwimHours += w.swimHours;
      sumBikeHours += w.bikeHours;
      sumRunHours += w.runHours;
      totalActs += w.activityCount;

      if (w.totalHours > peakHours) {
        peakHours = w.totalHours;
        peakWeekLabel = w.weekLabel;
      }
    });

    const weeksCount = weeklyData.length || 1;
    const avgWeeklyHours = Math.round((sumHours / weeksCount) * 10) / 10;
    const avgWeeklyKm = Math.round((sumKm / weeksCount) * 10) / 10;

    const swimPct = sumHours > 0 ? Math.round((sumSwimHours / sumHours) * 100) : 0;
    const bikePct = sumHours > 0 ? Math.round((sumBikeHours / sumHours) * 100) : 0;
    const runPct = sumHours > 0 ? Math.round((sumRunHours / sumHours) * 100) : 0;

    return {
      totalHours: Math.round(sumHours * 10) / 10,
      totalKm: Math.round(sumKm * 10) / 10,
      avgWeeklyHours,
      avgWeeklyKm,
      peakHours,
      peakWeekLabel,
      totalActs,
      swimPct,
      bikePct,
      runPct,
    };
  }, [weeklyData]);

  // Custom Recharts Tooltip
  const renderCustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    const data: WeekVolumeData = payload[0].payload;
    if (!data) return null;

    return (
      <div
        className="p-3.5 rounded-xl border shadow-xl text-xs space-y-2 min-w-[200px]"
        style={{
          backgroundColor: colors.tooltipBg,
          borderColor: colors.tooltipBorder,
          color: isLight ? '#1e293b' : '#f8fafc',
        }}
      >
        <div className="pb-1.5 border-b border-slate-700/40 flex items-center justify-between gap-2">
          <span className="font-bold">{data.weekLabel}</span>
          {data.isCurrentWeek && (
            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400">
              Current
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px] font-medium pb-1">
          <div>
            <span className="text-slate-400 text-[10px] block">Total Duration</span>
            <span className="text-emerald-400 font-bold font-mono text-sm">
              {data.totalHours} hrs
            </span>
          </div>
          <div>
            <span className="text-slate-400 text-[10px] block">Total Distance</span>
            <span className="text-emerald-400 font-bold font-mono text-sm">
              {data.totalKm} km
            </span>
          </div>
        </div>

        {/* Breakdown by Discipline */}
        <div className="space-y-1 pt-1 border-t border-slate-800 text-[11px]">
          <div className="flex items-center justify-between text-sky-400">
            <span className="flex items-center gap-1.5">
              <Waves className="w-3 h-3" /> Swim ({data.swimCount})
            </span>
            <span className="font-mono font-semibold">
              {data.swimHours}h · {data.swimKm}km
            </span>
          </div>
          <div className="flex items-center justify-between text-orange-400">
            <span className="flex items-center gap-1.5">
              <Bike className="w-3 h-3" /> Bike ({data.bikeCount})
            </span>
            <span className="font-mono font-semibold">
              {data.bikeHours}h · {data.bikeKm}km
            </span>
          </div>
          <div className="flex items-center justify-between text-rose-400">
            <span className="flex items-center gap-1.5">
              <Footprints className="w-3 h-3" /> Run ({data.runCount})
            </span>
            <span className="font-mono font-semibold">
              {data.runHours}h · {data.runKm}km
            </span>
          </div>
          {data.otherHours > 0 && (
            <div className="flex items-center justify-between text-purple-400">
              <span className="flex items-center gap-1.5">
                <Zap className="w-3 h-3" /> Other
              </span>
              <span className="font-mono font-semibold">
                {data.otherHours}h
              </span>
            </div>
          )}
        </div>

        <div className="pt-1 border-t border-slate-800/60 text-[10px] text-slate-400 text-right">
          {data.activityCount} {data.activityCount === 1 ? 'activity' : 'activities'} logged
        </div>
      </div>
    );
  };

  return (
    <div
      className={`rounded-2xl border px-2.5 py-3.5 sm:p-5 transition-colors ${
        isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
      }`}
    >
      {/* Header and Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 px-1 sm:px-0 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
            <h3
              className={`text-sm font-bold uppercase tracking-wider ${
                isLight ? 'text-slate-800' : 'text-slate-200'
              }`}
            >
              Weekly Training Volume
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-400/10 border border-emerald-400/20 text-emerald-400">
              Recharts
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Weekly multi-sport volume aggregated from your synced Strava activities
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Metric View Mode Toggle */}
          <div className="flex items-center p-0.5 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setMetricMode('dual')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                metricMode === 'dual'
                  ? 'bg-emerald-500 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Dual (Hours + KM)
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('hours')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                metricMode === 'hours'
                  ? 'bg-emerald-500 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Hours Only
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('distance')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                metricMode === 'distance'
                  ? 'bg-emerald-500 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Distance (KM)
            </button>
          </div>

          {/* Lookback Weeks Filter (8, 12, 16, 26, 52) */}
          <div className="flex items-center p-0.5 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] font-bold">
            {([8, 12, 16, 26, 52] as LookbackWeeksOption[]).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setNumWeeks(w)}
                className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  numWeeks === w
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {w}w
              </button>
            ))}
          </div>

          {/* Sport Focus Filter */}
          <div className="flex items-center p-0.5 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] font-bold">
            {[
              { id: 'all' as const, label: 'All' },
              { id: 'swim' as const, label: 'Swim' },
              { id: 'bike' as const, label: 'Bike' },
              { id: 'run' as const, label: 'Run' },
            ].map((s) => {
              const isActive = selectedSportFilter === s.id;
              const activeCls =
                s.id === 'swim'
                  ? 'bg-sky-500 text-slate-950'
                  : s.id === 'bike'
                  ? 'bg-orange-500 text-slate-950'
                  : s.id === 'run'
                  ? 'bg-rose-500 text-white'
                  : 'bg-amber-500 text-slate-950';
              const inactiveCls =
                s.id === 'swim'
                  ? 'text-sky-400 hover:text-sky-300'
                  : s.id === 'bike'
                  ? 'text-orange-400 hover:text-orange-300'
                  : s.id === 'run'
                  ? 'text-rose-400 hover:text-rose-300'
                  : 'text-slate-400 hover:text-white';
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedSportFilter(s.id)}
                  className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                    isActive ? activeCls : inactiveCls
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 my-4 px-0.5 sm:px-0">
        <div
          className={`p-3 rounded-xl border ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'
          }`}
        >
          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium">
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Avg Weekly Hours</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-emerald-400">
              {stats.avgWeeklyHours}
            </span>
            <span className="text-xs text-slate-400">hrs/wk</span>
          </div>
          <span className="text-[10px] text-slate-500">
            {stats.totalHours} total hours in {numWeeks}w
          </span>
        </div>

        <div
          className={`p-3 rounded-xl border ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'
          }`}
        >
          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium">
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            <span>Avg Weekly Distance</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-sky-400">
              {stats.avgWeeklyKm}
            </span>
            <span className="text-xs text-slate-400">km/wk</span>
          </div>
          <span className="text-[10px] text-slate-500">
            {stats.totalKm} total km logged
          </span>
        </div>

        <div
          className={`p-3 rounded-xl border ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'
          }`}
        >
          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium">
            <Award className="w-3.5 h-3.5 text-amber-400" />
            <span>Peak Volume Week</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-amber-400">
              {stats.peakHours}
            </span>
            <span className="text-xs text-slate-400">hrs</span>
          </div>
          <span className="text-[10px] text-slate-500 truncate block">
            {stats.peakWeekLabel || '—'}
          </span>
        </div>

        <div
          className={`p-3 rounded-xl border ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'
          }`}
        >
          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium">
            <Zap className="w-3.5 h-3.5 text-orange-400" />
            <span>Triathlon Split</span>
          </div>
          <div className="mt-1 flex items-center gap-2 font-mono text-xs font-bold">
            <span className="text-sky-400">S {stats.swimPct}%</span>
            <span className="text-orange-400">B {stats.bikePct}%</span>
            <span className="text-rose-400">R {stats.runPct}%</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-800 flex overflow-hidden">
            <div style={{ width: `${stats.swimPct}%` }} className="bg-sky-400 h-full" />
            <div style={{ width: `${stats.bikePct}%` }} className="bg-orange-400 h-full" />
            <div style={{ width: `${stats.runPct}%` }} className="bg-rose-500 h-full" />
          </div>
        </div>
      </div>

      {/* Recharts Volume Chart */}
      <div className="w-full h-72 sm:h-80 mt-2">
        <ResponsiveContainer width="100%" height="100%">
          {metricMode === 'dual' ? (
            <ComposedChart
              data={weeklyData}
              margin={{ top: 8, right: 0, left: -4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
              <XAxis
                dataKey="shortLabel"
                stroke={colors.text}
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: colors.grid }}
              />
              <YAxis
                yAxisId="left"
                width={30}
                stroke={colors.text}
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: colors.grid }}
                tickFormatter={(v) => `${v}h`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                width={34}
                stroke={colors.text}
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: colors.grid }}
                tickFormatter={(v) => `${v}k`}
              />
              <Tooltip content={renderCustomTooltip} />

              {/* Stacked Discipline Bars for Hours */}
              {(selectedSportFilter === 'all' || selectedSportFilter === 'swim') && (
                <Bar
                  yAxisId="left"
                  dataKey="swimHours"
                  name="Swim Hours"
                  stackId="hours"
                  fill={colors.swim}
                  radius={[0, 0, 0, 0]}
                />
              )}
              {(selectedSportFilter === 'all' || selectedSportFilter === 'bike') && (
                <Bar
                  yAxisId="left"
                  dataKey="bikeHours"
                  name="Bike Hours"
                  stackId="hours"
                  fill={colors.bike}
                  radius={[0, 0, 0, 0]}
                />
              )}
              {(selectedSportFilter === 'all' || selectedSportFilter === 'run') && (
                <Bar
                  yAxisId="left"
                  dataKey="runHours"
                  name="Run Hours"
                  stackId="hours"
                  fill={colors.run}
                  radius={selectedSportFilter === 'run' ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              )}
              {selectedSportFilter === 'all' && (
                <Bar
                  yAxisId="left"
                  dataKey="otherHours"
                  name="Other Hours"
                  stackId="hours"
                  fill={colors.other}
                  radius={[4, 4, 0, 0]}
                />
              )}

              {/* Total Distance (km) overlaid line */}
              <Line
                yAxisId="right"
                type="monotone"
                dataKey={
                  selectedSportFilter === 'swim'
                    ? 'swimKm'
                    : selectedSportFilter === 'bike'
                    ? 'bikeKm'
                    : selectedSportFilter === 'run'
                    ? 'runKm'
                    : 'totalKm'
                }
                name={
                  selectedSportFilter === 'all'
                    ? 'Total Distance (km)'
                    : `${selectedSportFilter.toUpperCase()} Distance (km)`
                }
                stroke={colors.totalDistance}
                strokeWidth={2.5}
                dot={{ r: 3, fill: colors.totalDistance }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          ) : metricMode === 'hours' ? (
            <BarChart
              data={weeklyData}
              margin={{ top: 8, right: 4, left: -4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
              <XAxis
                dataKey="shortLabel"
                stroke={colors.text}
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: colors.grid }}
              />
              <YAxis
                width={30}
                stroke={colors.text}
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: colors.grid }}
                tickFormatter={(v) => `${v}h`}
              />
              <Tooltip content={renderCustomTooltip} />

              {(selectedSportFilter === 'all' || selectedSportFilter === 'swim') && (
                <Bar
                  dataKey="swimHours"
                  name="Swim Hours"
                  stackId="hours"
                  fill={colors.swim}
                />
              )}
              {(selectedSportFilter === 'all' || selectedSportFilter === 'bike') && (
                <Bar
                  dataKey="bikeHours"
                  name="Bike Hours"
                  stackId="hours"
                  fill={colors.bike}
                />
              )}
              {(selectedSportFilter === 'all' || selectedSportFilter === 'run') && (
                <Bar
                  dataKey="runHours"
                  name="Run Hours"
                  stackId="hours"
                  fill={colors.run}
                />
              )}
              {selectedSportFilter === 'all' && (
                <Bar
                  dataKey="otherHours"
                  name="Other Hours"
                  stackId="hours"
                  fill={colors.other}
                  radius={[4, 4, 0, 0]}
                />
              )}
            </BarChart>
          ) : (
            <BarChart
              data={weeklyData}
              margin={{ top: 8, right: 4, left: -4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
              <XAxis
                dataKey="shortLabel"
                stroke={colors.text}
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: colors.grid }}
              />
              <YAxis
                width={34}
                stroke={colors.text}
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: colors.grid }}
                tickFormatter={(v) => `${v}k`}
              />
              <Tooltip content={renderCustomTooltip} />

              {(selectedSportFilter === 'all' || selectedSportFilter === 'swim') && (
                <Bar
                  dataKey="swimKm"
                  name="Swim (km)"
                  stackId="km"
                  fill={colors.swim}
                />
              )}
              {(selectedSportFilter === 'all' || selectedSportFilter === 'bike') && (
                <Bar
                  dataKey="bikeKm"
                  name="Bike (km)"
                  stackId="km"
                  fill={colors.bike}
                />
              )}
              {(selectedSportFilter === 'all' || selectedSportFilter === 'run') && (
                <Bar
                  dataKey="runKm"
                  name="Run (km)"
                  stackId="km"
                  fill={colors.run}
                  radius={[4, 4, 0, 0]}
                />
              )}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Legend & Insight Note */}
      <div className="mt-3 pt-3 border-t border-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-400">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-sky-400" />
            <span>Swim</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-orange-400" />
            <span>Bike</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
            <span>Run</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-purple-400" />
            <span>Other/Strength</span>
          </span>
          {metricMode === 'dual' && (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-emerald-400 rounded-full" />
              <span className="text-emerald-400 font-medium">Distance (km)</span>
            </span>
          )}
        </div>

        <span className="italic text-[10px] text-slate-500">
          Showing {numWeeks} Monday-to-Sunday training cycles
        </span>
      </div>
    </div>
  );
};
