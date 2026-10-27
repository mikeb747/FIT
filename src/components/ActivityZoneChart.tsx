import React, { useState, useMemo } from 'react';
import {
  Heart,
  Zap,
  Gauge,
  Clock,
  PieChart,
  Sliders,
  CheckCircle2,
  Info,
  Flame,
  Activity,
} from 'lucide-react';
import { StravaActivity } from '../utils/stravaActivities';
import { AthleteProfile } from '../types/athlete';
import {
  calculateActivityZonesTime,
  ActivityZoneAnalysis,
  CalculatedZoneBucket,
} from '../utils/trainingZones';

interface ActivityZoneChartProps {
  activity: StravaActivity;
  streams?: Record<string, any>;
  athleteProfile: AthleteProfile;
  theme?: 'dark' | 'light';
  title?: string;
}

export const ActivityZoneChart: React.FC<ActivityZoneChartProps> = ({
  activity,
  streams,
  athleteProfile,
  theme = 'dark',
  title,
}) => {
  const isLight = theme === 'light';

  const analysis: ActivityZoneAnalysis = useMemo(() => {
    return calculateActivityZonesTime(activity, streams, athleteProfile);
  }, [activity, streams, athleteProfile]);

  // Determine available zone types
  const availableTabs = useMemo(() => {
    const list: Array<{ id: 'hr' | 'pace' | 'power'; label: string; icon: React.ReactNode; color: string }> = [];
    if (analysis.hrZones && analysis.hrZones.length > 0) {
      list.push({
        id: 'hr',
        label: 'Heart Rate Zones',
        icon: <Heart className="w-3.5 h-3.5 text-rose-400" />,
        color: '#f43f5e',
      });
    }
    if (analysis.paceZones && analysis.paceZones.length > 0) {
      list.push({
        id: 'pace',
        label: 'Pace Zones',
        icon: <Gauge className="w-3.5 h-3.5 text-sky-400" />,
        color: '#38bdf8',
      });
    }
    if (analysis.powerZones && analysis.powerZones.length > 0) {
      list.push({
        id: 'power',
        label: 'Power Zones',
        icon: <Zap className="w-3.5 h-3.5 text-amber-400" />,
        color: '#f59e0b',
      });
    }
    return list;
  }, [analysis]);

  const [activeTab, setActiveTab] = useState<'hr' | 'pace' | 'power'>(() => {
    return availableTabs[0]?.id || 'hr';
  });

  // Ensure selected tab is valid
  React.useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.some((t) => t.id === activeTab)) {
      setActiveTab(availableTabs[0].id);
    }
  }, [availableTabs, activeTab]);

  const activeBuckets: CalculatedZoneBucket[] | null = useMemo(() => {
    if (activeTab === 'hr') return analysis.hrZones;
    if (activeTab === 'pace') return analysis.paceZones;
    if (activeTab === 'power') return analysis.powerZones;
    return null;
  }, [activeTab, analysis]);

  if (availableTabs.length === 0 || !activeBuckets || activeBuckets.length === 0) {
    return (
      <div
        className={`p-4 rounded-xl border text-center text-xs ${
          isLight
            ? 'bg-slate-50 border-slate-200 text-slate-500'
            : 'bg-slate-950/40 border-slate-800 text-slate-400'
        }`}
      >
        No heart rate, pace, or power telemetry available to compute training zones for this workout.
      </div>
    );
  }

  // Max percentage to scale bars
  const maxPct = Math.max(...activeBuckets.map((b) => b.pct), 15);

  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 transition-colors ${
        isLight
          ? 'bg-white border-slate-200 shadow-xs'
          : 'bg-slate-900/60 border-slate-800'
      }`}
    >
      {/* Header & Metric Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-200 dark:border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h4
              className={`text-sm sm:text-base font-extrabold tracking-tight ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}
            >
              {title || 'Time in Training Zones'}
            </h4>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                analysis.hasStreams
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : 'bg-slate-500/10 text-slate-500 border-slate-500/20'
              }`}
            >
              {analysis.hasStreams ? '1-sec streams' : 'Session average'}
            </span>
          </div>
          <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Duration and percentage of moving time spent in each physiological zone
          </p>
        </div>

        {/* Tab Switcher if multiple zone metrics exist (e.g. HR and Pace, or HR and Power) */}
        {availableTabs.length > 1 && (
          <div className="flex items-center p-0.5 rounded-xl bg-slate-950/40 border border-slate-800 text-xs font-bold self-start sm:self-auto">
            {availableTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  activeTab === t.id
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Zone Breakdown Graph (Horizontal Bars) */}
      <div className="mt-4 space-y-3">
        {activeBuckets.map((bucket) => {
          const barWidthPct = Math.min(100, Math.max(bucket.pct > 0 ? 3 : 0, (bucket.pct / maxPct) * 100));

          return (
            <div key={bucket.zone} className="space-y-1 group">
              {/* Row Header: Zone label, name, range, duration, pct */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="font-mono font-bold text-[11px] px-1.5 py-0.5 rounded text-slate-950 shrink-0"
                    style={{ backgroundColor: bucket.color }}
                  >
                    Z{bucket.zone}
                  </span>
                  <span
                    className={`font-semibold truncate ${
                      isLight ? 'text-slate-800' : 'text-slate-200'
                    }`}
                  >
                    {bucket.name}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 hidden sm:inline truncate">
                    ({bucket.rangeFormatted})
                  </span>
                </div>

                <div className="flex items-center gap-2 font-mono shrink-0">
                  <span
                    className={`font-extrabold text-xs ${
                      bucket.pct > 0
                        ? isLight
                          ? 'text-slate-900'
                          : 'text-white'
                        : 'text-slate-400'
                    }`}
                  >
                    {bucket.durationFormatted}
                  </span>
                  <span
                    className="font-black text-xs min-w-[38px] text-right"
                    style={{ color: bucket.pct > 0 ? bucket.color : undefined }}
                  >
                    {bucket.pct}%
                  </span>
                </div>
              </div>

              {/* Progress Track */}
              <div
                className={`h-3 w-full rounded-full overflow-hidden flex relative ${
                  isLight ? 'bg-slate-100' : 'bg-slate-950/80 shadow-inner'
                }`}
              >
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${barWidthPct}%`,
                    backgroundColor: bucket.color,
                    opacity: bucket.pct > 0 ? 1 : 0.2,
                  }}
                />
              </div>

              {/* Mobile range display if hidden above */}
              <div className="flex sm:hidden items-center justify-between text-[10px] text-slate-400 px-0.5">
                <span>{bucket.rangeFormatted}</span>
                <span className="truncate">{bucket.description}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Polarized 80/20 Training Distribution Summary */}
      <div
        className={`mt-5 pt-3.5 border-t rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          isLight
            ? 'bg-slate-50 border-slate-200'
            : 'bg-slate-950/50 border-slate-800/70'
        }`}
      >
        <div className="flex items-center gap-2">
          <PieChart className="w-4 h-4 text-amber-500 shrink-0" />
          <div>
            <span className="text-xs font-bold block text-slate-800 dark:text-slate-200">
              Training Intensity Distribution
            </span>
            <span className="text-[11px] text-slate-500">
              {analysis.intensityDistribution.trainingStyle} Profile
            </span>
          </div>
        </div>

        {/* Intensity Ratio Badges */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <div className="px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Low (Z1-2): {analysis.intensityDistribution.lowIntensityPct}%</span>
          </div>
          <div className="px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>Mid (Z3): {analysis.intensityDistribution.tempoPct}%</span>
          </div>
          <div className="px-2 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            <span>High (Z4+): {analysis.intensityDistribution.highIntensityPct}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};
