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
  RotateCw,
} from 'lucide-react';
import type { DailyRecoveryLog, ReadinessScoreResult } from '../types/recovery';
import type { AthleteProfile } from '../types/athlete';
import type { StravaActivity } from '../utils/stravaActivities';
import { computeDailyReadiness, computeCrossCorrelations } from '../utils/readinessEngine';
import { RecoveryLogModal } from './RecoveryLogModal';
import { RecoveryCsvModal } from './RecoveryCsvModal';
import { GarminSyncModal } from './GarminSyncModal';

interface RecoveryViewProps {
  logs: DailyRecoveryLog[];
  athleteProfile: AthleteProfile;
  stravaActivities?: StravaActivity[];
  onUpsertLog: (log: DailyRecoveryLog) => void;
  onDeleteLog: (id: string) => void;
  onImportLogs: (logs: DailyRecoveryLog[]) => void;
  onResetDefaults: () => void;
  onOpenAthleteSettings?: () => void;
  theme?: 'light' | 'dark';
  isGarminConnected?: boolean;
  garminEmail?: string | null;
  onOpenGarminSync?: () => void;
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
  theme = 'dark',
  isGarminConnected = false,
  garminEmail = null,
  onOpenGarminSync,
}) => {
  const [selectedChartMode, setSelectedChartMode] = useState<ChartViewMode>('sleep_rhr');
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<DailyRecoveryLog | null>(null);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isGarminModalOpen, setIsGarminModalOpen] = useState(false);
  const [hoveredDataIndex, setHoveredDataIndex] = useState<number | null>(null);

  const isLight = theme === 'light';
  const baselineRhr = athleteProfile.restingHeartRate || 41;

  // Determine if Garmin is actively connected
  const isGarminActive = Boolean(
    isGarminConnected ||
    (typeof window !== 'undefined' &&
      (localStorage.getItem('fit_track_garmin_email') ||
        localStorage.getItem('fit_track_garmin_token') ||
        localStorage.getItem('fit_track_garmin_connected')))
  );

  // Chronologically sorted logs
  const sortedLogs = useMemo(() => {
    return [...logs].sort((a, b) => a.date.localeCompare(b.date));
  }, [logs]);

  // Today / Most Recent Log
  const latestLog = useMemo(() => {
    if (sortedLogs.length === 0 || !isGarminActive) return null;
    return sortedLogs[sortedLogs.length - 1];
  }, [sortedLogs, isGarminActive]);

  // Flag determining whether we have authentic Garmin telemetry to display
  const hasGarminData = Boolean(isGarminActive && latestLog);

  // Compute readiness for latest log
  const todayReadiness: ReadinessScoreResult = useMemo(() => {
    if (!hasGarminData || !latestLog) {
      return {
        score: 0,
        status: 'optimal',
        label: isGarminActive ? 'No Garmin Logs' : 'Garmin Not Connected',
        accentColor: '#64748b',
        badgeBg: isLight ? 'bg-slate-100' : 'bg-slate-800',
        badgeText: isLight ? 'text-slate-500' : 'text-slate-400',
        hrvStatus: 'balanced',
        hrvBaseline7d: 0,
        hrvStdDev7d: 0,
        hrvDelta: 0,
        rhrDelta: 0,
        rhr7dAvg: 0,
        sleepQualityRating: 'optimal',
        sleepAvg7dMinutes: 0,
        sleepScoreAvg7d: 0,
        trainingRecommendation: isGarminActive
          ? 'Connected to Garmin. Run Garmin Sync to download recent morning recovery telemetry.'
          : 'Garmin is not connected. Connect your Garmin account to pull overnight HRV, resting heart rate, sleep duration, and daily training readiness.',
        recommendedIntensity: 'Rest / Active Recovery',
        subscores: { hrvScore: 0, sleepScore: 0, rhrScore: 0, loadModifier: 0 },
        insights: [],
      };
    }
    return computeDailyReadiness(latestLog, sortedLogs, athleteProfile);
  }, [hasGarminData, latestLog, sortedLogs, athleteProfile, isGarminActive, isLight]);

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
        return d.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'numeric',
          day: 'numeric',
        });
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
              Readiness &amp; Recovery
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/10 border border-sky-500/20 text-sky-500">
              Garmin &amp; TrainingPeaks
            </span>
          </div>
          <p className={`text-xs sm:text-sm mt-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Cross-correlate Sleep duration, Sleep stages (REM/Deep), Morning RHR (baseline:{' '}
            {baselineRhr} bpm), and HRV.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Garmin Connect Automated Multi-Week Sync Button */}
          <button
            type="button"
            onClick={() => setIsGarminModalOpen(true)}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md ${
              isGarminActive
                ? 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-sky-500/20'
                : 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-600/25 ring-2 ring-sky-400/30'
            }`}
            title="Connect Garmin Connect & automatically pull weeks of recovery metrics"
          >
            {isGarminActive ? (
              <>
                <RotateCw className="w-3.5 h-3.5 text-slate-950" />
                <span>Garmin Sync</span>
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5 text-white" />
                <span>Connect Garmin</span>
              </>
            )}
          </button>

          {/* 28-Day Demo Recovery Data */}
          <button
            type="button"
            onClick={onResetDefaults}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border ${
              isLight
                ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30'
            }`}
            title="Load 28-day sample recovery telemetry (HRV, Sleep stages, Resting HR)"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>28d Demo Data</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCsvModalOpen(true)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700/80'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-sky-500" />
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
            <Plus className="w-4 h-4 text-slate-950" />
            <span>Log Morning Stats</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. TODAY'S READINESS HERO & PILLARS */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Main Readiness Score Card (Daily Training Readiness) */}
        <div
          className={`lg:col-span-5 rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden transition-colors border ${
            isLight
              ? 'bg-white border-slate-200 text-slate-900 shadow-sm'
              : 'bg-gradient-to-br from-[#0f121d] to-[#090b12] border-slate-800 text-white shadow-xl'
          }`}
        >
          {/* Subtle background glow */}
          <div
            className="absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl opacity-20 pointer-events-none"
            style={{ backgroundColor: todayReadiness.accentColor }}
          />

          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                isLight ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              <Zap className="w-4 h-4 text-amber-500" />
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
                  className={isLight ? 'text-slate-100' : 'text-slate-800'}
                />
                {/* Progress Circle */}
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  stroke={hasGarminData ? todayReadiness.accentColor : 'currentColor'}
                  strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 42}`}
                  strokeDashoffset={hasGarminData ? `${2 * Math.PI * 42 * (1 - todayReadiness.score / 100)}` : `${2 * Math.PI * 42}`}
                  strokeLinecap="round"
                  fill="transparent"
                  className={hasGarminData ? 'transition-all duration-1000 ease-out' : 'text-slate-800 opacity-20'}
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span
                  className={`text-3xl font-extrabold tracking-tight ${
                    hasGarminData
                      ? isLight ? 'text-slate-900' : 'text-white'
                      : 'text-slate-400 font-mono'
                  }`}
                >
                  {hasGarminData ? todayReadiness.score : '--'}
                </span>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-widest ${
                    isLight ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  {hasGarminData ? '/ 100' : 'no data'}
                </span>
              </div>
            </div>

            <div className="space-y-1.5 max-w-[160px]">
              <span
                className={`text-xs font-semibold block ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                Recommended Focus:
              </span>
              <span
                className={`text-sm font-bold leading-tight block ${
                  hasGarminData
                    ? isLight ? 'text-slate-900' : 'text-white'
                    : 'text-slate-400'
                }`}
              >
                {hasGarminData ? todayReadiness.recommendedIntensity : 'Connect Garmin'}
              </span>
              <span className={`text-[11px] block ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Date:{' '}
                <strong className={isLight ? 'text-slate-800' : 'text-slate-200'}>
                  {hasGarminData ? (latestLog?.date || 'Today') : '--'}
                </strong>
              </span>
            </div>
          </div>

          {/* Actionable Training Prescription Banner */}
          <div
            className={`p-3 rounded-xl border text-xs leading-relaxed flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
              isLight
                ? 'bg-slate-50 border-slate-200 text-slate-700'
                : 'bg-slate-950/60 border-slate-800/80 text-slate-300'
            }`}
          >
            <span>{todayReadiness.trainingRecommendation}</span>
            {!hasGarminData && (
              <button
                type="button"
                onClick={() => setIsGarminModalOpen(true)}
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-xs"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Connect Garmin</span>
              </button>
            )}
          </div>
        </div>

        {/* 4 Diagnostic Health & Sleep Pillar Cards */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Card 1: Morning Resting HR */}
          <div
            className={`border rounded-2xl p-4 flex flex-col justify-between transition-colors ${
              isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                <Heart className="w-4 h-4 text-rose-500" />
                Resting Heart Rate
              </span>
              <span className="text-[11px] text-slate-400">Baseline: {baselineRhr} bpm</span>
            </div>

            <div className="my-2 flex items-baseline gap-2">
              <span
                className={`text-2xl font-extrabold ${
                  hasGarminData && latestLog
                    ? isLight ? 'text-slate-900' : 'text-white'
                    : 'text-slate-400 font-mono'
                }`}
              >
                {hasGarminData && latestLog ? latestLog.restingHr : '--'}
              </span>
              <span className="text-xs text-slate-400 font-semibold">{hasGarminData && latestLog ? 'bpm' : ''}</span>
              <span
                className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-md ${
                  !hasGarminData
                    ? isLight ? 'bg-slate-100 text-slate-500 border border-slate-200' : 'bg-slate-800 text-slate-400 border border-slate-700/80'
                    : todayReadiness.rhrDelta <= 0
                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                    : todayReadiness.rhrDelta <= 2
                    ? 'bg-sky-500/10 text-sky-500 border border-sky-500/20'
                    : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                }`}
              >
                {!hasGarminData
                  ? 'No Garmin data'
                  : todayReadiness.rhrDelta > 0
                  ? `+${todayReadiness.rhrDelta} bpm`
                  : todayReadiness.rhrDelta === 0
                  ? 'At Baseline'
                  : `${todayReadiness.rhrDelta} bpm`}
              </span>
            </div>

            <div
              className={`text-[11px] border-t pt-2 flex items-center justify-between ${
                isLight ? 'border-slate-100 text-slate-500' : 'border-slate-800/60 text-slate-400'
              }`}
            >
              <span>
                7-Day Average:{' '}
                <strong className={isLight ? 'text-slate-800' : 'text-slate-200'}>
                  {hasGarminData && todayReadiness.rhr7dAvg > 0 ? `${todayReadiness.rhr7dAvg} bpm` : '--'}
                </strong>
              </span>
              <span className="text-slate-400">
                {!hasGarminData ? 'Awaiting sync' : todayReadiness.rhrDelta <= 2 ? 'Calm tone' : 'Elevated strain'}
              </span>
            </div>
          </div>

          {/* Card 2: Overnight HRV (rMSSD) */}
          <div
            className={`border rounded-2xl p-4 flex flex-col justify-between transition-colors ${
              isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                <Activity className="w-4 h-4 text-purple-500" />
                Overnight HRV (rMSSD)
              </span>
              <span className="text-[11px] text-slate-400">Autonomic Balance</span>
            </div>

            <div className="my-2 flex items-baseline gap-2">
              <span
                className={`text-2xl font-extrabold ${
                  hasGarminData && latestLog
                    ? isLight ? 'text-purple-600' : 'text-purple-400'
                    : 'text-slate-400 font-mono'
                }`}
              >
                {hasGarminData && latestLog ? latestLog.hrvRmssd : '--'}
              </span>
              <span className="text-xs text-slate-400 font-semibold">{hasGarminData && latestLog ? 'ms' : ''}</span>
              <span
                className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-md capitalize ${
                  !hasGarminData
                    ? isLight ? 'bg-slate-100 text-slate-500 border border-slate-200' : 'bg-slate-800 text-slate-400 border border-slate-700/80'
                    : todayReadiness.hrvStatus === 'balanced'
                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                    : todayReadiness.hrvStatus === 'low'
                    ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                    : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                }`}
              >
                {!hasGarminData ? 'No Garmin data' : todayReadiness.hrvStatus}
              </span>
            </div>

            <div
              className={`text-[11px] border-t pt-2 flex items-center justify-between ${
                isLight ? 'border-slate-100 text-slate-500' : 'border-slate-800/60 text-slate-400'
              }`}
            >
              <span>
                7d Baseline:{' '}
                <strong className={isLight ? 'text-slate-800' : 'text-slate-200'}>
                  {hasGarminData && todayReadiness.hrvBaseline7d > 0 ? `${todayReadiness.hrvBaseline7d} ms` : '--'}
                </strong>{' '}
                {hasGarminData && todayReadiness.hrvStdDev7d > 0 ? `(±${todayReadiness.hrvStdDev7d})` : ''}
              </span>
              <span
                className={
                  hasGarminData && todayReadiness.hrvDelta >= 0 ? 'text-emerald-500 font-semibold' : 'text-slate-400'
                }
              >
                {!hasGarminData ? '--' : todayReadiness.hrvDelta >= 0 ? `+${todayReadiness.hrvDelta} ms` : `${todayReadiness.hrvDelta} ms`}
              </span>
            </div>
          </div>

          {/* Card 3: Sleep Duration & Score */}
          <div
            className={`border rounded-2xl p-4 flex flex-col justify-between transition-colors ${
              isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                <Moon className="w-4 h-4 text-sky-500" />
                Sleep Duration &amp; Score
              </span>
              <span className="text-[11px] text-sky-500 font-semibold">
                Score: {hasGarminData && latestLog?.sleepScore ? `${latestLog.sleepScore}/100` : '--/100'}
              </span>
            </div>

            <div className="my-2 flex items-baseline gap-2">
              <span
                className={`text-2xl font-extrabold ${
                  hasGarminData && latestLog
                    ? isLight ? 'text-slate-900' : 'text-white'
                    : 'text-slate-400 font-mono'
                }`}
              >
                {hasGarminData && latestLog ? formatMinutesToHhMm(latestLog.sleepDurationMinutes) : '--'}
              </span>
              <span
                className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-md border capitalize ${
                  !hasGarminData
                    ? isLight ? 'bg-slate-100 text-slate-500 border border-slate-200' : 'bg-slate-800 text-slate-400 border border-slate-700/80'
                    : 'text-sky-500 bg-sky-500/10 border-sky-500/20'
                }`}
              >
                {!hasGarminData ? 'No Garmin data' : todayReadiness.sleepQualityRating}
              </span>
            </div>

            <div
              className={`text-[11px] border-t pt-2 flex items-center justify-between ${
                isLight ? 'border-slate-100 text-slate-500' : 'border-slate-800/60 text-slate-400'
              }`}
            >
              <span>
                7d Avg:{' '}
                <strong className={isLight ? 'text-slate-800' : 'text-slate-200'}>
                  {hasGarminData && todayReadiness.sleepAvg7dMinutes > 0 ? formatMinutesToHhMm(todayReadiness.sleepAvg7dMinutes) : '--'}
                </strong>
              </span>
              <span>
                Avg Score:{' '}
                <strong className={isLight ? 'text-slate-800' : 'text-slate-200'}>
                  {hasGarminData && todayReadiness.sleepScoreAvg7d > 0 ? todayReadiness.sleepScoreAvg7d : '--'}
                </strong>
              </span>
            </div>
          </div>

          {/* Card 4: Sleep Architecture (Deep & REM) */}
          <div
            className={`border rounded-2xl p-4 flex flex-col justify-between transition-colors ${
              isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                <Brain className="w-4 h-4 text-indigo-500" />
                Deep &amp; REM Architecture
              </span>
              <span className="text-[11px] text-indigo-500 font-semibold">
                {hasGarminData && latestLog ? `${latestLog.deepSleepMinutes}m Deep` : '-- Deep'}
              </span>
            </div>

            {/* Visual stage bar */}
            {hasGarminData && latestLog ? (
              <div className="my-2">
                <div
                  className={`w-full h-3 rounded-full overflow-hidden flex ${
                    isLight ? 'bg-slate-100' : 'bg-slate-950'
                  }`}
                >
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
                    className="bg-slate-400 dark:bg-slate-600 h-full"
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
                  <span className="text-indigo-500 font-bold">Deep {latestLog.deepSleepMinutes}m</span>
                  <span className="text-cyan-500 font-bold">REM {latestLog.remSleepMinutes}m</span>
                  <span className="text-slate-400">Light {latestLog.lightSleepMinutes}m</span>
                  <span className="text-rose-500">{latestLog.awakeMinutes}m awake</span>
                </div>
              </div>
            ) : (
              <div className="my-4 py-1 text-center text-xs text-slate-400 font-mono">
                --
              </div>
            )}

            <div
              className={`text-[11px] border-t pt-2 flex items-center justify-between ${
                isLight ? 'border-slate-100 text-slate-500' : 'border-slate-800/60 text-slate-400'
              }`}
            >
              <span>
                Deep %:{' '}
                <strong className={isLight ? 'text-slate-800' : 'text-slate-200'}>
                  {hasGarminData && latestLog
                    ? `${Math.round((latestLog.deepSleepMinutes / latestLog.sleepDurationMinutes) * 100)}%`
                    : '--'}
                </strong>
              </span>
              <span className="text-slate-400">
                {hasGarminData ? 'Tissue Recovery' : 'Awaiting sync'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. INTERACTIVE CROSS-CORRELATION CHARTS */}
      {/* ========================================================= */}
      <div
        className={`border rounded-2xl p-4 sm:p-5 space-y-4 transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        {/* Chart Mode Controls */}
        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b ${
            isLight ? 'border-slate-200' : 'border-slate-800'
          }`}
        >
          <div>
            <h2
              className={`text-base font-bold flex items-center gap-2 ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}
            >
              <TrendingUp className="w-4 h-4 text-sky-500" />
              Cross-Correlation &amp; Physiological Trends
            </h2>
            <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Correlating sleep stages and volume with morning resting HR (baseline {baselineRhr} bpm)
              and overnight HRV
            </p>
          </div>

          <div
            className={`flex items-center gap-1 p-1 rounded-xl border self-start sm:self-auto ${
              isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}
          >
            <button
              type="button"
              onClick={() => setSelectedChartMode('sleep_rhr')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedChartMode === 'sleep_rhr'
                  ? isLight
                    ? 'bg-white text-sky-600 shadow-xs border border-slate-200'
                    : 'bg-slate-800 text-sky-400 shadow-sm'
                  : isLight
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sleep &amp; Morning RHR
            </button>
            <button
              type="button"
              onClick={() => setSelectedChartMode('readiness_hrv')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedChartMode === 'readiness_hrv'
                  ? isLight
                    ? 'bg-white text-purple-600 shadow-xs border border-slate-200'
                    : 'bg-slate-800 text-purple-400 shadow-sm'
                  : isLight
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Readiness &amp; HRV
            </button>
            <button
              type="button"
              onClick={() => setSelectedChartMode('training_stress')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedChartMode === 'training_stress'
                  ? isLight
                    ? 'bg-white text-orange-600 shadow-xs border border-slate-200'
                    : 'bg-slate-800 text-orange-400 shadow-sm'
                  : isLight
                  ? 'text-slate-500 hover:text-slate-900'
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
              <div className="flex items-center gap-1.5 text-indigo-500 font-medium">
                <span className="w-3 h-3 rounded bg-indigo-500 inline-block" />
                <span>Deep Sleep (Physical)</span>
              </div>
              <div className="flex items-center gap-1.5 text-cyan-500 font-medium">
                <span className="w-3 h-3 rounded bg-cyan-400 inline-block" />
                <span>REM Sleep (Neural)</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                <span className="w-3 h-3 rounded bg-slate-400 dark:bg-slate-600 inline-block" />
                <span>Light Sleep</span>
              </div>
              <div className="flex items-center gap-1.5 text-rose-500 font-bold">
                <span className="w-3 h-0.5 bg-rose-500 inline-block" />
                <span>Morning RHR (bpm)</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                <span className="w-3 h-0.5 border-t border-dashed border-slate-400 inline-block" />
                <span>{baselineRhr} bpm Baseline</span>
              </div>
            </>
          )}

          {selectedChartMode === 'readiness_hrv' && (
            <>
              <div className="flex items-center gap-1.5 text-emerald-500 font-bold">
                <span className="w-3 h-0.5 bg-emerald-500 inline-block" />
                <span>Readiness Score (0-100)</span>
              </div>
              <div className="flex items-center gap-1.5 text-purple-500 font-bold">
                <span className="w-3 h-0.5 bg-purple-500 inline-block" />
                <span>Overnight HRV rMSSD (ms)</span>
              </div>
              <div className="flex items-center gap-1.5 text-purple-400">
                <span className="w-3 h-3 rounded bg-purple-500/20 inline-block border border-purple-500/30" />
                <span>7-Day HRV Baseline Corridor</span>
              </div>
            </>
          )}

          {selectedChartMode === 'training_stress' && (
            <>
              <div className="flex items-center gap-1.5 text-orange-500 font-semibold">
                <span className="w-3 h-3 rounded bg-orange-500 inline-block" />
                <span>Strava Activity TSS</span>
              </div>
              <div className="flex items-center gap-1.5 text-rose-500 font-semibold">
                <span className="w-3 h-0.5 bg-rose-500 inline-block" />
                <span>Next-Day Morning RHR</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-500 font-semibold">
                <span className="w-3 h-0.5 bg-emerald-500 inline-block" />
                <span>Readiness</span>
              </div>
            </>
          )}
        </div>

        {/* SVG Chart Canvas */}
        <div
          className={`relative rounded-xl p-3 sm:p-4 overflow-hidden border ${
            isLight
              ? 'bg-slate-50/70 border-slate-200'
              : 'bg-slate-950/60 border-slate-800/80'
          }`}
        >
          {!hasGarminData || chartDays.length === 0 ? (
            <div className="py-16 text-center flex flex-col items-center justify-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                <TrendingUp className="w-5 h-5" />
              </div>
              <p className={`text-sm font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                {isGarminActive ? 'No Garmin Logs Available' : 'Garmin Connect Required'}
              </p>
              <p className="text-xs text-slate-400 max-w-sm">
                {isGarminActive
                  ? 'Click "Garmin Sync" to download historical sleep stages, resting HR, and HRV data.'
                  : 'Connect your Garmin account to view cross-correlations and physiological trends.'}
              </p>
              <button
                type="button"
                onClick={() => setIsGarminModalOpen(true)}
                className="mt-1 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{isGarminActive ? 'Sync Garmin Recovery Data' : 'Connect Garmin'}</span>
              </button>
            </div>
          ) : (
            <div className="w-full h-64 sm:h-72">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 800 240">
                {/* Grid Lines */}
                <line
                  x1="40"
                  y1="30"
                  x2="760"
                  y2="30"
                  stroke={isLight ? '#e2e8f0' : '#1e293b'}
                  strokeDasharray="3 3"
                />
                <line
                  x1="40"
                  y1="80"
                  x2="760"
                  y2="80"
                  stroke={isLight ? '#e2e8f0' : '#1e293b'}
                  strokeDasharray="3 3"
                />
                <line
                  x1="40"
                  y1="130"
                  x2="760"
                  y2="130"
                  stroke={isLight ? '#e2e8f0' : '#1e293b'}
                  strokeDasharray="3 3"
                />
                <line
                  x1="40"
                  y1="180"
                  x2="760"
                  y2="180"
                  stroke={isLight ? '#e2e8f0' : '#1e293b'}
                  strokeDasharray="3 3"
                />

                {/* 41 bpm Baseline Reference Line (when mode is sleep_rhr) */}
                {selectedChartMode === 'sleep_rhr' && (
                  <>
                    <line
                      x1="40"
                      y1="140"
                      x2="760"
                      y2="140"
                      stroke={isLight ? '#94a3b8' : '#475569'}
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />
                    <text
                      x="765"
                      y="144"
                      fill={isLight ? '#475569' : '#64748b'}
                      fontSize="10"
                      fontWeight="bold"
                    >
                      {baselineRhr} bpm
                    </text>
                  </>
                )}

                {/* Render Chart Mode 1: Sleep Stages Stacked Bars + Morning RHR Line */}
                {selectedChartMode === 'sleep_rhr' && (
                  <>
                    {/* Sleep Bars */}
                    {chartDays.map((item, idx) => {
                      const step = 720 / Math.max(1, chartDays.length);
                      const x = 50 + idx * step;
                      const barWidth = Math.min(26, step * 0.6);

                      const totalMin = Math.max(180, item.log.sleepDurationMinutes);
                      const maxChartMin = 600; // 10 hrs
                      const totalBarHeight = (totalMin / maxChartMin) * 150;

                      const deepH = (item.log.deepSleepMinutes / totalMin) * totalBarHeight;
                      const remH = (item.log.remSleepMinutes / totalMin) * totalBarHeight;
                      const lightH = (item.log.lightSleepMinutes / totalMin) * totalBarHeight;

                      const baseY = 200;
                      const deepY = baseY - deepH;
                      const remY = deepY - remH;
                      const lightY = remY - lightH;

                      return (
                        <g
                          key={`bar-${idx}`}
                          onMouseEnter={() => setHoveredDataIndex(idx)}
                          onMouseLeave={() => setHoveredDataIndex(null)}
                          className="cursor-pointer"
                        >
                          {/* Deep sleep bottom segment */}
                          <rect
                            x={x - barWidth / 2}
                            y={deepY}
                            width={barWidth}
                            height={deepH}
                            fill="#6366f1"
                            rx="1"
                          />
                          {/* REM sleep middle segment */}
                          <rect
                            x={x - barWidth / 2}
                            y={remY}
                            width={barWidth}
                            height={remH}
                            fill="#22d3ee"
                          />
                          {/* Light sleep top segment */}
                          <rect
                            x={x - barWidth / 2}
                            y={lightY}
                            width={barWidth}
                            height={lightH}
                            fill={isLight ? '#94a3b8' : '#475569'}
                            rx="2"
                          />
                          {/* Date label at bottom */}
                          <text
                            x={x}
                            y="220"
                            fill={isLight ? '#64748b' : '#64748b'}
                            fontSize="9"
                            textAnchor="middle"
                          >
                            {formatDateLabel(item.log.date).split(' ')[0]}
                          </text>
                        </g>
                      );
                    })}

                    {/* Resting HR Polyline */}
                    {(() => {
                      const step = 720 / Math.max(1, chartDays.length);
                      const points = chartDays.map((item, idx) => {
                        const x = 50 + idx * step;
                        // RHR mapped between 37 and 48 bpm to y 180 to 50
                        const y = 180 - ((item.log.restingHr - 37) / 12) * 130;
                        return `${x},${y}`;
                      });

                      return (
                        <g>
                          <polyline
                            fill="none"
                            stroke="#f43f5e"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={points.join(' ')}
                          />
                          {chartDays.map((item, idx) => {
                            const x = 50 + idx * step;
                            const y = 180 - ((item.log.restingHr - 37) / 12) * 130;
                            return (
                              <g
                                key={`rhr-pt-${idx}`}
                                onMouseEnter={() => setHoveredDataIndex(idx)}
                                onMouseLeave={() => setHoveredDataIndex(null)}
                                className="cursor-pointer"
                              >
                                <circle
                                  cx={x}
                                  cy={y}
                                  r="4"
                                  fill="#f43f5e"
                                  stroke={isLight ? '#ffffff' : '#090a0f'}
                                  strokeWidth="2"
                                />
                                <text
                                  x={x}
                                  y={y - 8}
                                  fill="#f43f5e"
                                  fontSize="9"
                                  fontWeight="bold"
                                  textAnchor="middle"
                                >
                                  {item.log.restingHr}
                                </text>
                              </g>
                            );
                          })}
                        </g>
                      );
                    })()}
                  </>
                )}

                {/* Render Chart Mode 2: Readiness & Overnight HRV */}
                {selectedChartMode === 'readiness_hrv' && (
                  <>
                    {(() => {
                      const step = 720 / Math.max(1, chartDays.length);

                      // HRV line points
                      const hrvPoints = chartDays.map((item, idx) => {
                        const x = 50 + idx * step;
                        const y = 200 - ((item.log.hrvRmssd - 50) / 60) * 150;
                        return `${x},${y}`;
                      });

                      // Readiness line points
                      const readPoints = chartDays.map((item, idx) => {
                        const x = 50 + idx * step;
                        const y = 200 - (item.readiness.score / 100) * 150;
                        return `${x},${y}`;
                      });

                      return (
                        <g>
                          <polyline
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={readPoints.join(' ')}
                          />
                          <polyline
                            fill="none"
                            stroke="#c084fc"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={hrvPoints.join(' ')}
                          />

                          {chartDays.map((item, idx) => {
                            const x = 50 + idx * step;
                            const yHrv = 200 - ((item.log.hrvRmssd - 50) / 60) * 150;
                            const yRead = 200 - (item.readiness.score / 100) * 150;

                            return (
                              <g
                                key={`read-pt-${idx}`}
                                onMouseEnter={() => setHoveredDataIndex(idx)}
                                onMouseLeave={() => setHoveredDataIndex(null)}
                                className="cursor-pointer"
                              >
                                <circle
                                  cx={x}
                                  cy={yRead}
                                  r="4"
                                  fill="#10b981"
                                  stroke={isLight ? '#ffffff' : '#090a0f'}
                                  strokeWidth="1.5"
                                />
                                <circle
                                  cx={x}
                                  cy={yHrv}
                                  r="3.5"
                                  fill="#c084fc"
                                  stroke={isLight ? '#ffffff' : '#090a0f'}
                                  strokeWidth="1.5"
                                />
                              </g>
                            );
                          })}

                          {chartDays.map((item, idx) => (
                            <text
                              key={`date-${idx}`}
                              x={50 + idx * step}
                              y="222"
                              fill={isLight ? '#64748b' : '#64748b'}
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
                                  fill="#f97316"
                                  fontSize="9"
                                  fontWeight="bold"
                                  textAnchor="middle"
                                >
                                  {item.tss > 0 ? item.tss : ''}
                                </text>
                                <text
                                  x={x}
                                  y="222"
                                  fill={isLight ? '#64748b' : '#64748b'}
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
            <div
              className={`mt-2 p-2.5 rounded-lg border flex flex-wrap items-center justify-between text-xs gap-3 ${
                isLight
                  ? 'bg-white border-slate-200 text-slate-800 shadow-md'
                  : 'bg-slate-900 border-slate-700/80 text-white'
              }`}
            >
              <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {chartDays[hoveredDataIndex].log.date}
              </span>
              <span className="text-rose-500 font-semibold">
                Morning RHR: <strong>{chartDays[hoveredDataIndex].log.restingHr} bpm</strong> (
                {chartDays[hoveredDataIndex].log.restingHr - baselineRhr > 0
                  ? `+${chartDays[hoveredDataIndex].log.restingHr - baselineRhr}`
                  : chartDays[hoveredDataIndex].log.restingHr - baselineRhr}{' '}
                vs {baselineRhr} bpm baseline)
              </span>
              <span className="text-purple-500 font-semibold">
                HRV: <strong>{chartDays[hoveredDataIndex].log.hrvRmssd} ms</strong>
              </span>
              <span className="text-sky-500 font-semibold">
                Total Sleep:{' '}
                <strong>
                  {formatMinutesToHhMm(chartDays[hoveredDataIndex].log.sleepDurationMinutes)}
                </strong>{' '}
                (Deep: {chartDays[hoveredDataIndex].log.deepSleepMinutes}m, REM:{' '}
                {chartDays[hoveredDataIndex].log.remSleepMinutes}m)
              </span>
              <span className="text-emerald-500 font-bold">
                Readiness: {chartDays[hoveredDataIndex].readiness.score}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* 4. CROSS-CORRELATION SCIENTIFIC INSIGHTS */}
      {/* ========================================================= */}
      <div
        className={`border rounded-2xl p-5 space-y-3 transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-500">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Garmin &amp; TrainingPeaks Cross-Correlation Insights
            </h3>
            <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Statistical patterns linking your overnight sleep architecture to resting HR and HRV
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          <div
            className={`p-3 rounded-xl border space-y-1 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-xs font-semibold ${
                  isLight ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                Sleep Duration vs Next-Day HRV
              </span>
              <span className="text-xs font-bold text-sky-500">
                r ={' '}
                {correlations.sleepVsHrvCorrelation > 0
                  ? `+${correlations.sleepVsHrvCorrelation.toFixed(2)}`
                  : correlations.sleepVsHrvCorrelation.toFixed(2)}
              </span>
            </div>
            <p className={`text-xs leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Longer overnight sleep consistently expands your autonomic reserve and elevates HRV
              above baseline.
            </p>
          </div>

          <div
            className={`p-3 rounded-xl border space-y-1 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-xs font-semibold ${
                  isLight ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                Deep Sleep vs Morning RHR
              </span>
              <span className="text-xs font-bold text-indigo-500">
                r ={' '}
                {correlations.deepSleepVsRhrCorrelation > 0
                  ? `+${correlations.deepSleepVsRhrCorrelation.toFixed(2)}`
                  : correlations.deepSleepVsRhrCorrelation.toFixed(2)}
              </span>
            </div>
            <p className={`text-xs leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Nights with 75+ minutes of Deep Sleep show lower next-morning resting HR, stabilizing
              tightly at your {baselineRhr} bpm baseline.
            </p>
          </div>
        </div>

        {/* Dynamic takeaways */}
        {correlations.keyTakeaways.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {correlations.keyTakeaways.map((tip, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 text-xs ${
                  isLight ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>{tip}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* 5. LOG HISTORY & TABLE */}
      {/* ========================================================= */}
      <div
        className={`border rounded-2xl p-4 sm:p-5 space-y-4 transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Logged Recovery History
            </h3>
            <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {sortedLogs.length} total days tracked in FIT Track
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsGarminModalOpen(true)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                isLight
                  ? 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100'
                  : 'bg-sky-500/10 text-sky-400 border-sky-500/20 hover:bg-sky-500/20'
              }`}
            >
              <RotateCw className="w-3.5 h-3.5 text-sky-500" />
              <span>Garmin Multi-Week</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingLog(null);
                setIsLogModalOpen(true);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              Add Entry
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr
                className={`border-b uppercase tracking-wider text-[10px] ${
                  isLight ? 'bg-slate-50/80 border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'
                }`}
              >
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
            <tbody
              className={
                isLight ? 'divide-y divide-slate-100' : 'divide-y divide-slate-800/60'
              }
            >
              {!hasGarminData || sortedLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Moon className="w-8 h-8 text-slate-400/40 stroke-1" />
                      <p className={`text-sm font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                        No Garmin recovery data recorded
                      </p>
                      <p className="text-xs text-slate-500 max-w-sm">
                        {isGarminActive
                          ? 'Click "Garmin Sync" to download historical days, or click "Log Morning Stats" to log manually.'
                          : 'Connect your Garmin account to automatically record and correlate daily recovery data.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                [...sortedLogs].reverse().map((log) => {
                const read = computeDailyReadiness(log, sortedLogs, athleteProfile);
                const rhrDiff = log.restingHr - baselineRhr;

                return (
                  <tr
                    key={log.id}
                    className={`transition-colors ${
                      isLight ? 'hover:bg-slate-50/80' : 'hover:bg-slate-800/30'
                    }`}
                  >
                    <td
                      className={`py-2.5 px-3 font-semibold whitespace-nowrap ${
                        isLight ? 'text-slate-800' : 'text-slate-200'
                      }`}
                    >
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
                      <span
                        className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}
                      >
                        {log.restingHr} bpm
                      </span>
                      <span
                        className={`ml-1.5 text-[10px] ${
                          rhrDiff <= 0
                            ? 'text-emerald-500 font-semibold'
                            : rhrDiff <= 2
                            ? 'text-sky-500 font-semibold'
                            : 'text-amber-500 font-semibold'
                        }`}
                      >
                        ({rhrDiff > 0 ? `+${rhrDiff}` : rhrDiff})
                      </span>
                    </td>

                    <td
                      className={`py-2.5 px-3 whitespace-nowrap font-semibold ${
                        isLight ? 'text-purple-600' : 'text-purple-400'
                      }`}
                    >
                      {log.hrvRmssd} ms
                    </td>

                    <td
                      className={`py-2.5 px-3 whitespace-nowrap ${
                        isLight ? 'text-slate-700' : 'text-slate-300'
                      }`}
                    >
                      {formatMinutesToHhMm(log.sleepDurationMinutes)}
                      <span className="text-slate-400 ml-1.5">({log.sleepScore}/100)</span>
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-400">
                      <span className="text-indigo-500 font-medium">{log.deepSleepMinutes}m</span> /{' '}
                      <span className="text-cyan-500 font-medium">{log.remSleepMinutes}m</span>
                    </td>

                    <td
                      className={`py-2.5 px-3 whitespace-nowrap ${
                        isLight ? 'text-slate-700' : 'text-slate-300'
                      }`}
                    >
                      {log.subjectiveFeel ? `${log.subjectiveFeel}/5` : '—'}
                    </td>

                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingLog(log);
                          setIsLogModalOpen(true);
                        }}
                        className={`p-1 rounded-lg transition-colors mr-1 ${
                          isLight
                            ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                        title="Edit log"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteLog(log.id)}
                        className={`p-1 rounded-lg transition-colors ${
                          isLight
                            ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                            : 'text-slate-500 hover:text-rose-400 hover:bg-slate-800'
                        }`}
                        title="Delete log"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
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
        theme={theme}
      />

      <RecoveryCsvModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        logs={sortedLogs}
        onImportLogs={onImportLogs}
        onResetDefaults={onResetDefaults}
        theme={theme}
      />

      <GarminSyncModal
        isOpen={isGarminModalOpen}
        onClose={() => setIsGarminModalOpen(false)}
        existingLogs={sortedLogs}
        onSyncComplete={(merged) => {
          onImportLogs(merged);
        }}
        baselineRhr={baselineRhr}
        theme={theme}
      />
    </div>
  );
};
