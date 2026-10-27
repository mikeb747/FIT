import React, { useState, useMemo } from 'react';
import {
  Zap,
  TrendingUp,
  Activity,
  Award,
  Waves,
  Bike,
  Footprints,
  Calendar,
  AlertTriangle,
  Info,
  CheckCircle2,
  Sliders,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import { StravaActivity, StravaActivityDetailsRecord } from '../utils/stravaActivities';
import { AthleteProfile } from '../types/athlete';
import { TrainingGoal } from '../types/goals';
import {
  computeFitnessTimeline,
  calculateTriathlonFitnessIndex,
  TriathlonDistanceModel,
  DISTANCE_MODEL_PROFILES,
  DailyFitnessRecord,
} from '../utils/fitnessEngine';

interface FitnessTabProps {
  activities: StravaActivity[];
  activityDetails: Record<string, StravaActivityDetailsRecord>;
  athleteProfile: AthleteProfile;
  goals: TrainingGoal[];
  theme?: 'dark' | 'light';
  onOpenSettings?: () => void;
}

export const FitnessTab: React.FC<FitnessTabProps> = ({
  activities,
  activityDetails,
  athleteProfile,
  goals,
  theme = 'dark',
  onOpenSettings,
}) => {
  const isLight = theme === 'light';
  const [selectedModel, setSelectedModel] = useState<TriathlonDistanceModel>('middle_70_3');
  const [timelineLookback, setTimelineLookback] = useState<number>(60); // 30, 60, 90 days
  const [selectedChartDiscipline, setSelectedChartDiscipline] = useState<'combined' | 'swim' | 'bike' | 'run'>('combined');
  const [hoveredRecord, setHoveredRecord] = useState<DailyFitnessRecord | null>(null);

  // Compute daily fitness timeline across all historical activities
  const fitnessTimeline = useMemo(() => {
    return computeFitnessTimeline(activities, activityDetails, athleteProfile, timelineLookback);
  }, [activities, activityDetails, athleteProfile, timelineLookback]);

  // Today / latest record
  const latestRecord = useMemo(() => {
    if (fitnessTimeline.length === 0) {
      return {
        date: new Date().toISOString().split('T')[0],
        swimTss: 0,
        bikeTss: 0,
        runTss: 0,
        otherTss: 0,
        totalTriTss: 0,
        totalAllTss: 0,
        swimCtl: 0,
        bikeCtl: 0,
        runCtl: 0,
        triCtl: 0,
        swimAtl: 0,
        bikeAtl: 0,
        runAtl: 0,
        triAtl: 0,
        swimTsb: 0,
        bikeTsb: 0,
        runTsb: 0,
        triTsb: 0,
      } as DailyFitnessRecord;
    }
    return fitnessTimeline[fitnessTimeline.length - 1];
  }, [fitnessTimeline]);

  // Compute Triathlon Fitness Index using FITNESS.md model
  const fitnessIndexResult = useMemo(() => {
    return calculateTriathlonFitnessIndex(
      latestRecord.swimCtl,
      latestRecord.bikeCtl,
      latestRecord.runCtl,
      selectedModel,
      goals
    );
  }, [latestRecord, selectedModel, goals]);

  // Active A-Goal Triathlon for custom display
  const activeTriGoal = useMemo(() => {
    return goals.find((g) => g.priority === 'A' && g.eventType === 'triathlon') || goals[0];
  }, [goals]);

  // Max CTL in timeline for responsive chart scaling
  const maxChartCtl = useMemo(() => {
    if (fitnessTimeline.length === 0) return 100;
    const maxVal = Math.max(
      ...fitnessTimeline.map((r) => {
        if (selectedChartDiscipline === 'swim') return Math.max(r.swimCtl, r.swimAtl);
        if (selectedChartDiscipline === 'bike') return Math.max(r.bikeCtl, r.bikeAtl);
        if (selectedChartDiscipline === 'run') return Math.max(r.runCtl, r.runAtl);
        return Math.max(r.triCtl, r.triAtl);
      })
    );
    return Math.max(80, Math.ceil(maxVal * 1.15));
  }, [fitnessTimeline, selectedChartDiscipline]);

  // Form label helper
  const getFormLabel = (tsb: number) => {
    if (tsb > 15) return { label: 'Fresh / Taper Peak', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' };
    if (tsb >= 5) return { label: 'Race Ready / Fresh', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' };
    if (tsb >= -10) return { label: 'Neutral / Optimal', color: 'text-sky-400', bg: 'bg-sky-500/15 border-sky-500/30' };
    if (tsb >= -30) return { label: 'Productive Training', color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/30' };
    return { label: 'High Fatigue / Overreaching', color: 'text-rose-400', bg: 'bg-rose-500/15 border-rose-500/30' };
  };

  const formStatus = getFormLabel(latestRecord.triTsb);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ========================================================= */}
      {/* 1. TOP HEADER & MODEL SELECTOR */}
      {/* ========================================================= */}
      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl p-4 sm:p-5 border transition-colors ${
          isLight
            ? 'bg-white border-slate-200 shadow-xs'
            : 'bg-slate-900/50 border-slate-800/80'
        }`}
      >
        <div>
          <div className="flex items-center gap-2">
            <h1
              className={`text-xl sm:text-2xl font-extrabold tracking-tight ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}
            >
              Triathlon Fitness &amp; Training Load
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 border border-amber-500/20 text-amber-500">
              FITNESS.md Model
            </span>
          </div>
          <p className={`text-xs sm:text-sm mt-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Running 42d CTL, 7d ATL, and Form (TSB) split between Swim, Bike, and Run with race-weighted geometric preparation index.
          </p>
        </div>

        {/* Distance Target Preset Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
            {[
              { id: 'middle_70_3' as const, label: '70.3 (Cotswold)' },
              { id: 'ironman' as const, label: 'Full IRONMAN' },
              { id: 'olympic' as const, label: 'Olympic' },
              { id: 'sprint' as const, label: 'Sprint' },
              { id: 'custom_goal' as const, label: 'Active Goal Race' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedModel(m.id)}
                className={`px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer text-xs whitespace-nowrap ${
                  selectedModel === m.id
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. HERO METRICS CLUSTER: TFI + COMBINED CTL + FORM */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* Triathlon Fitness Index (TFI) Main Card */}
        <div
          className={`md:col-span-5 rounded-2xl p-5 border relative overflow-hidden flex flex-col justify-between ${
            isLight
              ? 'bg-gradient-to-br from-amber-50/90 to-emerald-50/70 border-amber-300 shadow-sm text-slate-900'
              : 'bg-gradient-to-br from-[#121624] via-[#0d101a] to-[#07090f] border-amber-500/30 text-white shadow-xl'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-500" />
              Triathlon Fitness Index
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
              {fitnessIndexResult.weights.label}
            </span>
          </div>

          <div className="my-4 flex items-baseline gap-3">
            <span className="text-5xl sm:text-6xl font-black font-mono text-amber-500 tracking-tight">
              {Math.round(fitnessIndexResult.tfi)}
            </span>
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-500 uppercase block">Fitness Index</span>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {Math.round(fitnessIndexResult.tfi)}% of target preparation
              </span>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 text-[11px]">
              <span>Formula: Weighted Geometric Mean</span>
              <span className="font-mono font-bold text-amber-500">
                S^{fitnessIndexResult.weights.swimWeight} · B^{fitnessIndexResult.weights.bikeWeight} · R^{fitnessIndexResult.weights.runWeight}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Geometric weighting prevents superior fitness in one discipline from completely masking weakness in another.
            </p>
          </div>
        </div>

        {/* Combined Triathlon CTL (Chronic Training Load) */}
        <div
          className={`md:col-span-4 rounded-2xl p-5 border flex flex-col justify-between ${
            isLight
              ? 'bg-white border-slate-200 shadow-sm text-slate-900'
              : 'bg-slate-900/60 border-slate-800 text-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-sky-400" />
              Triathlon CTL (Combined)
            </span>
            <span className="text-[10px] font-mono text-slate-400">42-Day Rolling Avg</span>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl sm:text-5xl font-black font-mono text-sky-400">
                {latestRecord.triCtl}
              </span>
              <span className="text-xs text-slate-400 font-mono">TSS/day</span>
            </div>
            <div className="flex items-center gap-3 text-xs mt-2 text-slate-500">
              <span>Target: <strong>{fitnessIndexResult.weights.targetTriCtl}</strong></span>
              <span>•</span>
              <span>{Math.round((latestRecord.triCtl / fitnessIndexResult.weights.targetTriCtl) * 100)}% of target</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-slate-500">7-Day Fatigue (ATL):</span>
            <span className="font-mono font-bold text-purple-400">{latestRecord.triAtl}</span>
          </div>
        </div>

        {/* Current Form (Triathlon TSB) */}
        <div
          className={`md:col-span-3 rounded-2xl p-5 border flex flex-col justify-between ${
            isLight
              ? 'bg-white border-slate-200 shadow-sm text-slate-900'
              : 'bg-slate-900/60 border-slate-800 text-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Current Form (TSB)
            </span>
            <span className="text-[10px] font-mono text-slate-400">CTL - ATL</span>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span
                className={`text-4xl sm:text-5xl font-black font-mono ${
                  latestRecord.triTsb >= 0 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {latestRecord.triTsb > 0 ? `+${latestRecord.triTsb}` : latestRecord.triTsb}
              </span>
            </div>
            <div className="mt-2">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${formStatus.bg} ${formStatus.color}`}>
                {formStatus.label}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 text-[11px] text-slate-500 leading-snug">
            {latestRecord.triTsb > 5
              ? 'Optimal freshness for race performance.'
              : latestRecord.triTsb < -20
              ? 'High acute load. Plan recovery soon.'
              : 'Healthy, sustainable training load balance.'}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. DISCIPLINE BREAKDOWN CARDS (SWIM, BIKE, RUN) */}
      {/* ========================================================= */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-sm font-bold uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>
            Discipline Breakdown &amp; Target Ratios
          </h3>
          <span className="text-xs text-amber-500 font-bold flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            Limiting factor: {fitnessIndexResult.limitingFactor.name} ({fitnessIndexResult.limitingFactor.ratio > 0 ? Math.round(fitnessIndexResult.limitingFactor.ratio * 100) : 0}%)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Swim Card */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              fitnessIndexResult.limitingFactor.discipline === 'swim'
                ? isLight
                  ? 'bg-rose-50/70 border-rose-300'
                  : 'bg-rose-950/20 border-rose-500/40'
                : isLight
                ? 'bg-white border-slate-200'
                : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
                  <Waves className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-sky-400 uppercase">Swim CTL (sTSS)</h4>
                  <span className="text-[10px] text-slate-500">
                    Weight: {(fitnessIndexResult.weights.swimWeight * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xl font-black font-mono text-white">{latestRecord.swimCtl}</span>
                <span className="text-[10px] text-slate-500 block">/ {fitnessIndexResult.weights.targetSwimCtl} target</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Preparation Ratio:</span>
                <span className="font-mono font-bold text-sky-400">{fitnessIndexResult.swimRatio}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-sky-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, fitnessIndexResult.swimRatio)}%` }}
                />
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>ATL: {latestRecord.swimAtl}</span>
              <span>TSB: {latestRecord.swimTsb > 0 ? `+${latestRecord.swimTsb}` : latestRecord.swimTsb}</span>
            </div>
          </div>

          {/* Bike Card */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              fitnessIndexResult.limitingFactor.discipline === 'bike'
                ? isLight
                  ? 'bg-rose-50/70 border-rose-300'
                  : 'bg-rose-950/20 border-rose-500/40'
                : isLight
                ? 'bg-white border-slate-200'
                : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400">
                  <Bike className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-orange-400 uppercase">Bike CTL (Power TSS)</h4>
                  <span className="text-[10px] text-slate-500">
                    Weight: {(fitnessIndexResult.weights.bikeWeight * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xl font-black font-mono text-white">{latestRecord.bikeCtl}</span>
                <span className="text-[10px] text-slate-500 block">/ {fitnessIndexResult.weights.targetBikeCtl} target</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Preparation Ratio:</span>
                <span className="font-mono font-bold text-orange-400">{fitnessIndexResult.bikeRatio}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-orange-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, fitnessIndexResult.bikeRatio)}%` }}
                />
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>ATL: {latestRecord.bikeAtl}</span>
              <span>TSB: {latestRecord.bikeTsb > 0 ? `+${latestRecord.bikeTsb}` : latestRecord.bikeTsb}</span>
            </div>
          </div>

          {/* Run Card */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              fitnessIndexResult.limitingFactor.discipline === 'run'
                ? isLight
                  ? 'bg-rose-50/70 border-rose-300'
                  : 'bg-rose-950/20 border-rose-500/40'
                : isLight
                ? 'bg-white border-slate-200'
                : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Footprints className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-amber-400 uppercase">Run CTL (rTSS)</h4>
                  <span className="text-[10px] text-slate-500">
                    Weight: {(fitnessIndexResult.weights.runWeight * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xl font-black font-mono text-white">{latestRecord.runCtl}</span>
                <span className="text-[10px] text-slate-500 block">/ {fitnessIndexResult.weights.targetRunCtl} target</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Preparation Ratio:</span>
                <span className="font-mono font-bold text-amber-400">{fitnessIndexResult.runRatio}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-amber-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, fitnessIndexResult.runRatio)}%` }}
                />
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>ATL: {latestRecord.runAtl}</span>
              <span>TSB: {latestRecord.runTsb > 0 ? `+${latestRecord.runTsb}` : latestRecord.runTsb}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 4. RUNNING LOG CHART & TIMELINE (CTL / ATL / TSB) */}
      {/* ========================================================= */}
      <div
        className={`p-4 sm:p-5 rounded-2xl border space-y-4 ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className={`text-sm font-bold uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
              Fitness, Fatigue &amp; Form Timeline
            </h3>
            <p className="text-xs text-slate-400">
              Interactive 42-day CTL (Fitness) and 7-day ATL (Fatigue) running progression
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Discipline selector */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-950/80 border border-slate-800 text-xs">
              {[
                { id: 'combined' as const, label: 'Combined Tri' },
                { id: 'swim' as const, label: 'Swim' },
                { id: 'bike' as const, label: 'Bike' },
                { id: 'run' as const, label: 'Run' },
              ].map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedChartDiscipline(d.id)}
                  className={`px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                    selectedChartDiscipline === d.id
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {/* Lookback window */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-950/80 border border-slate-800 text-xs">
              {[30, 60, 90].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setTimelineLookback(days)}
                  className={`px-2 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                    timelineLookback === days
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {days}d
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* SVG Running Log Chart */}
        <div className="h-48 sm:h-64 w-full relative pt-2">
          {fitnessTimeline.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              No training activity data available to render timeline.
            </div>
          ) : (
            <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
              {/* Neutral zero line for TSB */}
              <line x1="0" y1="70" x2="100" y2="70" stroke="rgba(148, 163, 184, 0.15)" strokeWidth="0.5" strokeDasharray="1,1" />

              {/* Render CTL curve (Fitness) */}
              <polyline
                fill="none"
                stroke="#38bdf8"
                strokeWidth="1.8"
                points={fitnessTimeline
                  .map((r, i) => {
                    const x = (i / (fitnessTimeline.length - 1 || 1)) * 100;
                    const ctl = selectedChartDiscipline === 'swim' ? r.swimCtl : selectedChartDiscipline === 'bike' ? r.bikeCtl : selectedChartDiscipline === 'run' ? r.runCtl : r.triCtl;
                    const y = Math.max(5, 95 - (ctl / maxChartCtl) * 90);
                    return `${x},${y}`;
                  })
                  .join(' ')}
              />

              {/* Render ATL curve (Fatigue) */}
              <polyline
                fill="none"
                stroke="#c084fc"
                strokeWidth="1.2"
                strokeDasharray="2,1"
                points={fitnessTimeline
                  .map((r, i) => {
                    const x = (i / (fitnessTimeline.length - 1 || 1)) * 100;
                    const atl = selectedChartDiscipline === 'swim' ? r.swimAtl : selectedChartDiscipline === 'bike' ? r.bikeAtl : selectedChartDiscipline === 'run' ? r.runAtl : r.triAtl;
                    const y = Math.max(5, 95 - (atl / maxChartCtl) * 90);
                    return `${x},${y}`;
                  })
                  .join(' ')}
              />
            </svg>
          )}

          {/* Chart Legend */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 px-1">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
                CTL (Fitness 42d)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400 inline-block" />
                ATL (Fatigue 7d)
              </span>
            </div>
            <span>Scale: 0 - {maxChartCtl} TSS/day</span>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 5. RUNNING LOG TABLE */}
      {/* ========================================================= */}
      <div
        className={`rounded-2xl border overflow-hidden ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <h3 className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
            Daily Running Log (Recent {Math.min(14, fitnessTimeline.length)} Days)
          </h3>
          <span className="text-[11px] text-slate-500 font-mono">
            {fitnessTimeline.length} total days analyzed
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className={`border-b text-[10px] uppercase font-bold tracking-wider ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-950/80 border-slate-800 text-slate-400'
            }`}>
              <tr>
                <th className="py-2.5 px-4 font-sans">Date</th>
                <th className="py-2.5 px-3 text-sky-400">Swim TSS</th>
                <th className="py-2.5 px-3 text-orange-400">Bike TSS</th>
                <th className="py-2.5 px-3 text-amber-400">Run TSS</th>
                <th className="py-2.5 px-3 text-white">Daily Tri TSS</th>
                <th className="py-2.5 px-3 text-sky-400">Tri CTL</th>
                <th className="py-2.5 px-3 text-purple-400">Tri ATL</th>
                <th className="py-2.5 px-4 text-emerald-400">Form (TSB)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {fitnessTimeline.slice(-14).reverse().map((r) => (
                <tr key={r.date} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-2.5 px-4 font-sans font-medium text-slate-300">{r.date}</td>
                  <td className="py-2.5 px-3 text-slate-300">{r.swimTss > 0 ? r.swimTss : '—'}</td>
                  <td className="py-2.5 px-3 text-slate-300">{r.bikeTss > 0 ? r.bikeTss : '—'}</td>
                  <td className="py-2.5 px-3 text-slate-300">{r.runTss > 0 ? r.runTss : '—'}</td>
                  <td className="py-2.5 px-3 font-bold text-white">{r.totalTriTss > 0 ? r.totalTriTss : '0'}</td>
                  <td className="py-2.5 px-3 font-bold text-sky-400">{r.triCtl}</td>
                  <td className="py-2.5 px-3 font-bold text-purple-400">{r.triAtl}</td>
                  <td className={`py-2.5 px-4 font-bold ${r.triTsb >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {r.triTsb > 0 ? `+${r.triTsb}` : r.triTsb}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
