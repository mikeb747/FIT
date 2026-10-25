import React, { useState, useMemo } from 'react';
import {
  Heart,
  Moon,
  Activity,
  Sparkles,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Calendar,
  Clock,
  Plus,
  FileSpreadsheet,
  Download,
  Trash2,
  Edit2,
  Info,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Flame,
  Brain,
  Zap,
} from 'lucide-react';
import type { DailyRecoveryLog, ReadinessScoreResult } from '../types/recovery';
import type { AthleteProfile } from '../types/athlete';
import type { StravaActivity } from '../utils/stravaActivities';
import { computeDailyReadiness, computeCrossCorrelations } from '../utils/readinessEngine';
import { RecoveryLogModal } from './RecoveryLogModal';
import { RecoveryCsvModal } from './RecoveryCsvModal';

interface RecoveryViewProps {
  logs: DailyRecoveryLog[];
  athleteProfile: AthleteProfile;
  stravaActivities?: StravaActivity[];
  onUpsertLog: (log: DailyRecoveryLog) => void;
  onDeleteLog: (id: string) => void;
  onImportLogs: (logs: DailyRecoveryLog[]) => void;
  onResetDefaults: () => void;
  onOpenAthleteSettings?: () => void;
}

type ChartViewMode = 'sleep_rhr' | 'readiness_hrv' | 'training_stress';

export const RecoveryView: React.FC<RecoveryViewProps> = ({
  logs,
  athleteProfile,
  stravaActivities = [],
  onUpsertLog,
  onDeleteLog,
  onImportLogs,
  onResetDefaults,
  onOpenAthleteSettings,
}) => {
  const [selectedChartMode, setSelectedChartMode] = useState<ChartViewMode>('sleep_rhr');
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<DailyRecoveryLog | null>(null);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [hoveredDataIndex, setHoveredDataIndex] = useState<number | null>(null);

  const baselineRhr = athleteProfile.restingHeartRate || 41;

  // Chronologically sorted logs
  const sortedLogs = useMemo(() => {
    return [...logs].sort((a, b) => a.date.localeCompare(b.date));
  }, [logs]);

  // Today / Most Recent Log
  const latestLog = useMemo(() => {
    if (sortedLogs.length === 0) return null;
    return sortedLogs[sortedLogs.length - 1];
  }, [sortedLogs]);

  // Compute readiness for latest log
  const todayReadiness: ReadinessScoreResult = useMemo(() => {
    if (!latestLog) {
      return {
        score: 85,
        status: 'optimal',
        label: 'Primed / Optimal',
        accentColor: '#10b981',
        badgeBg: 'bg-emerald-500/15',
        badgeText: 'text-emerald-400',
        hrvStatus: 'balanced',
        hrvBaseline7d: 78,
        hrvStdDev7d: 6,
        hrvDelta: 0,
        rhrDelta: 0,
        rhr7dAvg: baselineRhr,
        sleepQualityRating: 'optimal',
        sleepAvg7dMinutes: 480,
        sleepScoreAvg7d: 88,
        trainingRecommendation: 'No logs yet. Please log your morning metrics.',
        recommendedIntensity: 'High / Threshold & Intervals',
        subscores: { hrvScore: 85, sleepScore: 85, rhrScore: 90, loadModifier: 0 },
        insights: [],
      };
    }
    return computeDailyReadiness(latestLog, sortedLogs, athleteProfile);
  }, [latestLog, sortedLogs, athleteProfile, baselineRhr]);

  // Cross-correlation analysis
  const correlations = useMemo(() => {
    return computeCrossCorrelations(sortedLogs);
  }, [sortedLogs]);

  // Map Strava TSS per date for training stress cross-correlation
  const tssByDate = useMemo(() => {
    const map: Record<string, number> = {};
    stravaActivities.forEach((act) => {
      if (act.start_date) {
        const d = act.start_date.split('T')[0];
        // estimate TSS if not explicit (rough 50 TSS/hr)
        const tss = act.suffer_score || Math.round((act.moving_time / 3600) * 55);
        map[d] = (map[d] || 0) + tss;
      }
    });
    return map;
  }, [stravaActivities]);

  // Prepare chart series (last 14 days or available logs)
  const chartDays = useMemo(() => {
    const slice = sortedLogs.slice(-14);
    return slice.map((l) => {
      const read = computeDailyReadiness(l, sortedLogs, athleteProfile);
      const tss = tssByDate[l.date] || 0;
      return {
        log: l,
        readiness: read,
        tss,
      };
    });
  }, [sortedLogs, athleteProfile, tssByDate]);

  // Helpers
  const formatMinutesToHhMm = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m < 10 ? '0' : ''}${m}m`;
  };

  const formatDateLabel = (dateStr: string) => {
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ========================================================= */}
      {/* 1. TOP HEADER & ACTION BAR */}
      {/* ========================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/50 border border-slate-800/80 rounded-2xl p-4 sm:p-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Readiness & Recovery
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/10 border border-sky-500/20 text-sky-400">
              Garmin & TrainingPeaks
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Cross-correlate Sleep duration, Sleep stages (REM/Deep), Morning RHR (baseline: {baselineRhr} bpm), and HRV.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsCsvModalOpen(true)}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-sky-400" />
            <span>Import / CSV</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingLog(null);
              setIsLogModalOpen(true);
            }}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-emerald-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Log Morning Stats</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. TODAY'S READINESS HERO & PILLARS */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Main Readiness Score Card */}
        <div className="lg:col-span-5 bg-gradient-to-br from-[#0f121d] to-[#090b12] border border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-xl relative overflow-hidden">
          {/* Subtle background glow */}
          <div
            className="absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl opacity-20 pointer-events-none"
            style={{ backgroundColor: todayReadiness.accentColor }}
          />

          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" />
              Daily Training Readiness
            </span>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-bold ${todayReadiness.badgeBg} ${todayReadiness.badgeText} border border-current/20`}
            >
              {todayReadiness.label}
            </span>
          </div>

          {/* Big Circular Dial & Number */}
          <div className="my-5 flex items-center justify-center gap-6">
            <div className="relative w-32 h-32 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                {/* Background Track */}
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  className="text-slate-800"
                />
                {/* Progress Circle */}
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  stroke={todayReadiness.accentColor}
                  strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 42}`}
                  strokeDashoffset={`${2 * Math.PI * 42 * (1 - todayReadiness.score / 100)}`}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-extrabold text-white tracking-tight">
                  {todayReadiness.score}
                </span>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                  / 100
                </span>
              </div>
            </div>

            <div className="space-y-1.5 max-w-[160px]">
              <span className="text-xs font-semibold text-slate-400 block">Recommended Focus:</span>
              <span className="text-sm font-bold text-white leading-tight block">
                {todayReadiness.recommendedIntensity}
              </span>
              <span className="text-[11px] text-slate-400 block">
                Date: <strong className="text-slate-200">{latestLog?.date || 'Today'}</strong>
              </span>
            </div>
          </div>

          {/* Actionable Training Prescription Banner */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 leading-relaxed">
            {todayReadiness.trainingRecommendation}
          </div>
        </div>

        {/* 4 Diagnostic Health & Sleep Pillar Cards */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Card 1: Morning Resting HR */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Heart className="w-4 h-4 text-rose-400" />
                Resting Heart Rate
              </span>
              <span className="text-[11px] text-slate-500">Baseline: {baselineRhr} bpm</span>
            </div>

            <div className="my-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-white">
                {latestLog ? latestLog.restingHr : baselineRhr}
              </span>
              <span className="text-xs text-slate-400 font-semibold">bpm</span>
              <span
                className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-md ${
                  todayReadiness.rhrDelta <= 0
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : todayReadiness.rhrDelta <= 2
                    ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}
              >
                {todayReadiness.rhrDelta > 0
                  ? `+${todayReadiness.rhrDelta} bpm`
                  : todayReadiness.rhrDelta === 0
                  ? 'At Baseline'
                  : `${todayReadiness.rhrDelta} bpm`}
              </span>
            </div>

            <div className="text-[11px] text-slate-400 border-t border-slate-800/60 pt-2 flex items-center justify-between">
              <span>7-Day Average: <strong className="text-slate-200">{todayReadiness.rhr7dAvg} bpm</strong></span>
              <span className="text-slate-500">{todayReadiness.rhrDelta <= 2 ? 'Calm tone' : 'Elevated strain'}</span>
            </div>
          </div>

          {/* Card 2: Overnight HRV (rMSSD) */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-purple-400" />
                Overnight HRV (rMSSD)
              </span>
              <span className="text-[11px] text-slate-500">Autonomic Balance</span>
            </div>

            <div className="my-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-purple-400">
                {latestLog ? latestLog.hrvRmssd : 78}
              </span>
              <span className="text-xs text-slate-400 font-semibold">ms</span>
              <span
                className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-md capitalize ${
                  todayReadiness.hrvStatus === 'balanced'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : todayReadiness.hrvStatus === 'low'
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}
              >
                {todayReadiness.hrvStatus}
              </span>
            </div>

            <div className="text-[11px] text-slate-400 border-t border-slate-800/60 pt-2 flex items-center justify-between">
              <span>
                7d Baseline: <strong className="text-slate-200">{todayReadiness.hrvBaseline7d} ms</strong> (±{todayReadiness.hrvStdDev7d})
              </span>
              <span className={todayReadiness.hrvDelta >= 0 ? 'text-emerald-400' : 'text-slate-400'}>
                {todayReadiness.hrvDelta >= 0 ? `+${todayReadiness.hrvDelta} ms` : `${todayReadiness.hrvDelta} ms`}
              </span>
            </div>
          </div>

          {/* Card 3: Sleep Duration & Score */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Moon className="w-4 h-4 text-sky-400" />
                Sleep Duration & Score
              </span>
              <span className="text-[11px] text-sky-400 font-semibold">
                Score: {latestLog ? latestLog.sleepScore : 88}/100
              </span>
            </div>

            <div className="my-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-white">
                {latestLog ? formatMinutesToHhMm(latestLog.sleepDurationMinutes) : '8h 00m'}
              </span>
              <span className="ml-auto text-xs font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20 capitalize">
                {todayReadiness.sleepQualityRating}
              </span>
            </div>

            <div className="text-[11px] text-slate-400 border-t border-slate-800/60 pt-2 flex items-center justify-between">
              <span>7d Avg: <strong className="text-slate-200">{formatMinutesToHhMm(todayReadiness.sleepAvg7dMinutes)}</strong></span>
              <span>Avg Score: <strong className="text-slate-200">{todayReadiness.sleepScoreAvg7d}</strong></span>
            </div>
          </div>

          {/* Card 4: Sleep Architecture (Deep & REM) */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Brain className="w-4 h-4 text-indigo-400" />
                Deep & REM Architecture
              </span>
              <span className="text-[11px] text-indigo-400 font-semibold">
                {latestLog ? `${latestLog.deepSleepMinutes}m Deep` : '85m Deep'}
              </span>
            </div>

            {/* Visual stage bar */}
            {latestLog && (
              <div className="my-2">
                <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden flex">
                  <div
                    style={{
                      width: `${(latestLog.deepSleepMinutes / latestLog.sleepDurationMinutes) * 100}%`,
                    }}
                    className="bg-indigo-500 h-full"
                    title={`Deep: ${latestLog.deepSleepMinutes}m`}
                  />
                  <div
                    style={{
                      width: `${(latestLog.remSleepMinutes / latestLog.sleepDurationMinutes) * 100}%`,
                    }}
                    className="bg-cyan-400 h-full"
                    title={`REM: ${latestLog.remSleepMinutes}m`}
                  />
                  <div
                    style={{
                      width: `${(latestLog.lightSleepMinutes / latestLog.sleepDurationMinutes) * 100}%`,
                    }}
                    className="bg-slate-600 h-full"
                    title={`Light: ${latestLog.lightSleepMinutes}m`}
                  />
                  <div
                    style={{
                      width: `${(latestLog.awakeMinutes / latestLog.sleepDurationMinutes) * 100}%`,
                    }}
                    className="bg-rose-500/80 h-full"
                    title={`Awake: ${latestLog.awakeMinutes}m`}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                  <span className="text-indigo-400 font-bold">Deep {latestLog.deepSleepMinutes}m</span>
                  <span className="text-cyan-400 font-bold">REM {latestLog.remSleepMinutes}m</span>
                  <span className="text-slate-400">Light {latestLog.lightSleepMinutes}m</span>
                  <span className="text-rose-400">{latestLog.awakeMinutes}m awake</span>
                </div>
              </div>
            )}

            <div className="text-[11px] text-slate-400 border-t border-slate-800/60 pt-2 flex items-center justify-between">
              <span>Deep %: <strong className="text-slate-200">
                {latestLog ? Math.round((latestLog.deepSleepMinutes / latestLog.sleepDurationMinutes) * 100) : 18}%
              </strong></span>
              <span className="text-emerald-400 font-semibold">Tissue Recovery</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. INTERACTIVE CROSS-CORRELATION CHARTS */}
      {/* ========================================================= */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        {/* Chart Mode Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-sky-400" />
              Cross-Correlation & Physiological Trends
            </h2>
            <p className="text-xs text-slate-400">
              Correlating sleep stages and volume with morning resting HR (baseline 41 bpm) and overnight HRV
            </p>
          </div>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setSelectedChartMode('sleep_rhr')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedChartMode === 'sleep_rhr'
                  ? 'bg-slate-800 text-sky-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sleep & Morning RHR
            </button>
            <button
              type="button"
              onClick={() => setSelectedChartMode('readiness_hrv')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedChartMode === 'readiness_hrv'
                  ? 'bg-slate-800 text-purple-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Readiness & HRV
            </button>
            <button
              type="button"
              onClick={() => setSelectedChartMode('training_stress')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedChartMode === 'training_stress'
                  ? 'bg-slate-800 text-orange-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Training Load vs Recovery
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {selectedChartMode === 'sleep_rhr' && (
            <>
              <div className="flex items-center gap-1.5 text-indigo-400">
                <span className="w-3 h-3 rounded bg-indigo-500 inline-block" />
                <span>Deep Sleep (Physical)</span>
              </div>
              <div className="flex items-center gap-1.5 text-cyan-400">
                <span className="w-3 h-3 rounded bg-cyan-400 inline-block" />
                <span>REM Sleep (Neural)</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <span className="w-3 h-3 rounded bg-slate-600 inline-block" />
                <span>Light Sleep</span>
              </div>
              <div className="flex items-center gap-1.5 text-rose-400">
                <span className="w-3 h-0.5 bg-rose-400 inline-block" />
                <span className="font-bold">Morning RHR (bpm)</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                <span className="w-3 h-0.5 border-t border-dashed border-slate-500 inline-block" />
                <span>41 bpm Baseline</span>
              </div>
            </>
          )}

          {selectedChartMode === 'readiness_hrv' && (
            <>
              <div className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-3 h-0.5 bg-emerald-400 inline-block" />
                <span className="font-bold">Readiness Score (0-100)</span>
              </div>
              <div className="flex items-center gap-1.5 text-purple-400">
                <span className="w-3 h-0.5 bg-purple-400 inline-block" />
                <span className="font-bold">Overnight HRV rMSSD (ms)</span>
              </div>
              <div className="flex items-center gap-1.5 text-purple-400/60">
                <span className="w-3 h-3 rounded bg-purple-500/20 inline-block" />
                <span>7-Day HRV Baseline Corridor</span>
              </div>
            </>
          )}

          {selectedChartMode === 'training_stress' && (
            <>
              <div className="flex items-center gap-1.5 text-orange-400">
                <span className="w-3 h-3 rounded bg-orange-500 inline-block" />
                <span>Strava Activity TSS</span>
              </div>
              <div className="flex items-center gap-1.5 text-rose-400">
                <span className="w-3 h-0.5 bg-rose-400 inline-block" />
                <span>Next-Day Morning RHR</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-3 h-0.5 bg-emerald-400 inline-block" />
                <span>Readiness</span>
              </div>
            </>
          )}
        </div>

        {/* SVG Chart Canvas */}
        <div className="relative bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 sm:p-4 overflow-hidden">
          {chartDays.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">
              No historical data available. Please log or import daily entries.
            </div>
          ) : (
            <div className="w-full h-64 sm:h-72">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 800 240">
                {/* Grid Lines */}
                <line x1="40" y1="30" x2="760" y2="30" stroke="#1e293b" strokeDasharray="3 3" />
                <line x1="40" y1="80" x2="760" y2="80" stroke="#1e293b" strokeDasharray="3 3" />
                <line x1="40" y1="130" x2="760" y2="130" stroke="#1e293b" strokeDasharray="3 3" />
                <line x1="40" y1="180" x2="760" y2="180" stroke="#1e293b" strokeDasharray="3 3" />

                {/* 41 bpm Baseline Reference Line (when mode is sleep_rhr) */}
                {selectedChartMode === 'sleep_rhr' && (
                  <>
                    {/* Maps 41 bpm: e.g. RHR scale 38 to 48 -> y coordinate */}
                    <line
                      x1="40"
                      y1="140"
                      x2="760"
                      y2="140"
                      stroke="#475569"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />
                    <text x="765" y="144" fill="#64748b" fontSize="10" fontWeight="bold">
                      41 bpm
                    </text>
                  </>
                )}

                {/* Render Chart Mode 1: Sleep Stages Stacked Bars + Morning RHR Line */}
                {selectedChartMode === 'sleep_rhr' && (
                  <>
                    {/* Sleep Bars */}
                    {chartDays.map((item, idx) => {
                      const totalBars = chartDays.length;
                      const step = (720 / Math.max(1, totalBars));
                      const barWidth = Math.min(32, step * 0.65);
                      const x = 50 + idx * step;

                      // Sleep scale: 0 to 600 min (10 hours) mapped to 180 height
                      const scale = 180 / 580;
                      const deepH = item.log.deepSleepMinutes * scale;
                      const remH = item.log.remSleepMinutes * scale;
                      const lightH = item.log.lightSleepMinutes * scale;

                      const baseFloor = 200;
                      const yDeep = baseFloor - deepH;
                      const yRem = yDeep - remH;
                      const yLight = yRem - lightH;

                      return (
                        <g
                          key={item.log.id}
                          className="cursor-pointer group"
                          onMouseEnter={() => setHoveredDataIndex(idx)}
                          onMouseLeave={() => setHoveredDataIndex(null)}
                        >
                          {/* Light */}
                          <rect
                            x={x - barWidth / 2}
                            y={yLight}
                            width={barWidth}
                            height={lightH}
                            fill="#475569"
                            opacity={hoveredDataIndex === idx ? 0.9 : 0.7}
                            rx="2"
                          />
                          {/* REM */}
                          <rect
                            x={x - barWidth / 2}
                            y={yRem}
                            width={barWidth}
                            height={remH}
                            fill="#22d3ee"
                            opacity={hoveredDataIndex === idx ? 1 : 0.85}
                          />
                          {/* Deep */}
                          <rect
                            x={x - barWidth / 2}
                            y={yDeep}
                            width={barWidth}
                            height={deepH}
                            fill="#6366f1"
                            opacity={hoveredDataIndex === idx ? 1 : 0.9}
                            rx="2"
                          />
                          {/* Date Label */}
                          <text
                            x={x}
                            y="222"
                            fill="#64748b"
                            fontSize="9"
                            textAnchor="middle"
                            fontWeight={hoveredDataIndex === idx ? 'bold' : 'normal'}
                          >
                            {formatDateLabel(item.log.date).split(' ')[0]}
                          </text>
                        </g>
                      );
                    })}

                    {/* Morning RHR Line Overlay */}
                    {(() => {
                      // Scale RHR from 38 to 48 bpm into y: 190 to 40
                      const getRhrY = (bpm: number) => {
                        const minBpm = 38;
                        const maxBpm = 48;
                        const clamped = Math.max(minBpm, Math.min(maxBpm, bpm));
                        return 190 - ((clamped - minBpm) / (maxBpm - minBpm)) * 140;
                      };

                      const points = chartDays.map((item, idx) => {
                        const step = 720 / Math.max(1, chartDays.length);
                        const x = 50 + idx * step;
                        const y = getRhrY(item.log.restingHr);
                        return { x, y, bpm: item.log.restingHr };
                      });

                      const pathD = points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`, '');

                      return (
                        <g>
                          <path
                            d={pathD}
                            fill="none"
                            stroke="#f43f5e"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          {points.map((p, idx) => (
                            <circle
                              key={idx}
                              cx={p.x}
                              cy={p.y}
                              r={hoveredDataIndex === idx ? 6 : 4}
                              fill="#f43f5e"
                              stroke="#090a0f"
                              strokeWidth="2"
                              className="transition-all"
                            />
                          ))}
                        </g>
                      );
                    })()}
                  </>
                )}

                {/* Render Chart Mode 2: Readiness & HRV Corridor */}
                {selectedChartMode === 'readiness_hrv' && (
                  <>
                    {/* HRV Corridor Area */}
                    {(() => {
                      const step = 720 / Math.max(1, chartDays.length);
                      // HRV scale: 50 to 95 ms mapped to y: 190 to 30
                      const getHrvY = (ms: number) => {
                        const minMs = 50;
                        const maxMs = 95;
                        const clamped = Math.max(minMs, Math.min(maxMs, ms));
                        return 190 - ((clamped - minMs) / (maxMs - minMs)) * 150;
                      };

                      const getReadinessY = (score: number) => {
                        return 190 - (score / 100) * 150;
                      };

                      const hrvPoints = chartDays.map((item, idx) => ({
                        x: 50 + idx * step,
                        y: getHrvY(item.log.hrvRmssd),
                        ms: item.log.hrvRmssd,
                      }));

                      const readinessPoints = chartDays.map((item, idx) => ({
                        x: 50 + idx * step,
                        y: getReadinessY(item.readiness.score),
                        score: item.readiness.score,
                      }));

                      const hrvPath = hrvPoints.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`, '');
                      const readinessPath = readinessPoints.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`, '');

                      return (
                        <g>
                          {/* Readiness Line */}
                          <path
                            d={readinessPath}
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          />
                          {/* HRV Line */}
                          <path
                            d={hrvPath}
                            fill="none"
                            stroke="#c084fc"
                            strokeWidth="2"
                            strokeDasharray="4 2"
                            strokeLinecap="round"
                          />

                          {/* Data points */}
                          {readinessPoints.map((p, idx) => (
                            <circle
                              key={`r_${idx}`}
                              cx={p.x}
                              cy={p.y}
                              r={hoveredDataIndex === idx ? 6 : 4}
                              fill="#10b981"
                              stroke="#090a0f"
                              strokeWidth="2"
                            />
                          ))}

                          {hrvPoints.map((p, idx) => (
                            <circle
                              key={`h_${idx}`}
                              cx={p.x}
                              cy={p.y}
                              r={hoveredDataIndex === idx ? 5 : 3.5}
                              fill="#c084fc"
                              stroke="#090a0f"
                              strokeWidth="1.5"
                            />
                          ))}

                          {/* Date labels */}
                          {chartDays.map((item, idx) => (
                            <text
                              key={idx}
                              x={50 + idx * step}
                              y="222"
                              fill="#64748b"
                              fontSize="9"
                              textAnchor="middle"
                            >
                              {formatDateLabel(item.log.date).split(' ')[0]}
                            </text>
                          ))}
                        </g>
                      );
                    })()}
                  </>
                )}

                {/* Render Chart Mode 3: Strava TSS vs Recovery */}
                {selectedChartMode === 'training_stress' && (
                  <>
                    {(() => {
                      const step = 720 / Math.max(1, chartDays.length);
                      const barWidth = Math.min(28, step * 0.6);

                      return (
                        <g>
                          {chartDays.map((item, idx) => {
                            const x = 50 + idx * step;
                            // TSS scale 0 to 250 mapped to 130 height
                            const tssHeight = Math.min(140, (item.tss / 200) * 140);
                            const y = 200 - tssHeight;

                            return (
                              <g key={idx}>
                                <rect
                                  x={x - barWidth / 2}
                                  y={y}
                                  width={barWidth}
                                  height={tssHeight}
                                  fill="#f97316"
                                  opacity="0.85"
                                  rx="2"
                                />
                                <text
                                  x={x}
                                  y={y - 4}
                                  fill="#fb923c"
                                  fontSize="9"
                                  fontWeight="bold"
                                  textAnchor="middle"
                                >
                                  {item.tss > 0 ? item.tss : ''}
                                </text>
                                <text
                                  x={x}
                                  y="222"
                                  fill="#64748b"
                                  fontSize="9"
                                  textAnchor="middle"
                                >
                                  {formatDateLabel(item.log.date).split(' ')[0]}
                                </text>
                              </g>
                            );
                          })}
                        </g>
                      );
                    })()}
                  </>
                )}
              </svg>
            </div>
          )}

          {/* Hover Details Ribbon */}
          {hoveredDataIndex !== null && chartDays[hoveredDataIndex] && (
            <div className="mt-2 p-2.5 rounded-lg bg-slate-900 border border-slate-700/80 flex flex-wrap items-center justify-between text-xs gap-3">
              <span className="font-bold text-white">
                {chartDays[hoveredDataIndex].log.date}
              </span>
              <span className="text-rose-400 font-semibold">
                Morning RHR: <strong>{chartDays[hoveredDataIndex].log.restingHr} bpm</strong> (
                {chartDays[hoveredDataIndex].log.restingHr - baselineRhr > 0
                  ? `+${chartDays[hoveredDataIndex].log.restingHr - baselineRhr}`
                  : chartDays[hoveredDataIndex].log.restingHr - baselineRhr}{' '}
                vs 41 bpm baseline)
              </span>
              <span className="text-purple-400 font-semibold">
                HRV: <strong>{chartDays[hoveredDataIndex].log.hrvRmssd} ms</strong>
              </span>
              <span className="text-sky-400 font-semibold">
                Total Sleep: <strong>{formatMinutesToHhMm(chartDays[hoveredDataIndex].log.sleepDurationMinutes)}</strong> (Deep:{' '}
                {chartDays[hoveredDataIndex].log.deepSleepMinutes}m, REM:{' '}
                {chartDays[hoveredDataIndex].log.remSleepMinutes}m)
              </span>
              <span className="text-emerald-400 font-bold">
                Readiness: {chartDays[hoveredDataIndex].readiness.score}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* 4. CROSS-CORRELATION SCIENTIFIC INSIGHTS */}
      {/* ========================================================= */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Garmin & TrainingPeaks Cross-Correlation Insights</h3>
            <p className="text-xs text-slate-400">
              Statistical patterns linking your overnight sleep architecture to resting HR and HRV
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">Sleep Duration vs Next-Day HRV</span>
              <span className="text-xs font-bold text-sky-400">
                r = {correlations.sleepVsHrvCorrelation > 0 ? `+${correlations.sleepVsHrvCorrelation.toFixed(2)}` : correlations.sleepVsHrvCorrelation.toFixed(2)}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Longer overnight sleep consistently expands your autonomic reserve and elevates HRV above baseline.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">Deep Sleep vs Morning RHR</span>
              <span className="text-xs font-bold text-indigo-400">
                r = {correlations.deepSleepVsRhrCorrelation > 0 ? `+${correlations.deepSleepVsRhrCorrelation.toFixed(2)}` : correlations.deepSleepVsRhrCorrelation.toFixed(2)}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Nights with 75+ minutes of Deep Sleep show lower next-morning resting HR, stabilizing tightly at your 41 bpm baseline.
            </p>
          </div>
        </div>

        {/* Dynamic takeaways */}
        {correlations.keyTakeaways.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {correlations.keyTakeaways.map((tip, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{tip}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* 5. LOG HISTORY & TABLE */}
      {/* ========================================================= */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">Logged Recovery History</h3>
            <p className="text-xs text-slate-400">{sortedLogs.length} total days tracked in FIT Track</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingLog(null);
              setIsLogModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Entry
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Readiness</th>
                <th className="py-2.5 px-3">Morning RHR</th>
                <th className="py-2.5 px-3">Overnight HRV</th>
                <th className="py-2.5 px-3">Total Sleep</th>
                <th className="py-2.5 px-3">Stages (Deep / REM)</th>
                <th className="py-2.5 px-3">Feel</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {[...sortedLogs].reverse().map((log) => {
                const read = computeDailyReadiness(log, sortedLogs, athleteProfile);
                const rhrDiff = log.restingHr - baselineRhr;

                return (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-200 whitespace-nowrap">
                      {log.date}
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${read.badgeBg} ${read.badgeText}`}
                      >
                        {read.score}% • {read.status}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="font-bold text-white">{log.restingHr} bpm</span>
                      <span
                        className={`ml-1.5 text-[10px] ${
                          rhrDiff <= 0 ? 'text-emerald-400' : rhrDiff <= 2 ? 'text-sky-400' : 'text-amber-400'
                        }`}
                      >
                        ({rhrDiff > 0 ? `+${rhrDiff}` : rhrDiff})
                      </span>
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap text-purple-400 font-semibold">
                      {log.hrvRmssd} ms
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-300">
                      {formatMinutesToHhMm(log.sleepDurationMinutes)}
                      <span className="text-slate-500 ml-1.5">({log.sleepScore}/100)</span>
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-400">
                      <span className="text-indigo-400 font-medium">{log.deepSleepMinutes}m</span> /{' '}
                      <span className="text-cyan-400 font-medium">{log.remSleepMinutes}m</span>
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-300">
                      {log.subjectiveFeel ? `${log.subjectiveFeel}/5` : '—'}
                    </td>

                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingLog(log);
                          setIsLogModalOpen(true);
                        }}
                        className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors mr-1"
                        title="Edit log"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteLog(log.id)}
                        className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                        title="Delete log"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <RecoveryLogModal
        isOpen={isLogModalOpen}
        onClose={() => {
          setIsLogModalOpen(false);
          setEditingLog(null);
        }}
        onSave={onUpsertLog}
        initialLog={editingLog}
        baselineRhr={baselineRhr}
      />

      <RecoveryCsvModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        logs={sortedLogs}
        onImportLogs={onImportLogs}
        onResetDefaults={onResetDefaults}
      />
    </div>
  );
};
