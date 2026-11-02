import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Zap,
  Heart,
  Activity,
  Calendar,
  Flame,
  CheckCircle2,
  RotateCw,
  Send,
  MessageSquare,
  Dumbbell,
  Timer,
  Info,
  ShieldAlert,
  Copy,
  Check,
  Target,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import type { AthleteProfile } from '../types/athlete';
import type { TrainingGoal } from '../types/goals';
import type { DailyRecoveryLog } from '../types/recovery';
import type { StravaActivity, StravaActivityDetailsRecord } from '../utils/stravaActivities';
import type {
  RecommendedWorkout,
  PeriodizedPlan,
  CoachSport,
  CoachChatMessage,
} from '../types/coach';
import {
  fetchCoachStatus,
  prepareCoachPayload,
  requestRecommendedWorkout,
  requestPeriodizedPlan,
  sendCoachChatMessage,
} from '../utils/coachApi';
import {
  loadTodayRecommendedWorkout,
  saveTodayRecommendedWorkout,
  loadSavedCoachingPlan,
  saveCoachingPlan,
  loadCoachChatHistory,
  saveCoachChatHistory,
} from '../utils/coachStorage';
import { computeFitnessTimeline, calculateTriathlonFitnessIndex } from '../utils/fitnessEngine';
import { computeDailyReadiness } from '../utils/readinessEngine';
import type { ProfileTab } from './AthleteProfileModal';

interface CoachTabProps {
  theme: 'light' | 'dark';
  athleteProfile: AthleteProfile;
  athleteGoals: TrainingGoal[];
  stravaActivities: StravaActivity[];
  stravaActivityDetails: Record<string, StravaActivityDetailsRecord>;
  recoveryLogs: DailyRecoveryLog[];
  onOpenSettings: (tab?: ProfileTab) => void;
}

export const CoachTab: React.FC<CoachTabProps> = ({
  theme,
  athleteProfile,
  athleteGoals,
  stravaActivities,
  stravaActivityDetails,
  recoveryLogs,
  onOpenSettings,
}) => {
  // Navigation within Coach
  const [activeSubTab, setActiveSubTab] = useState<'today' | 'plan' | 'chat'>('today');

  // Coach System State
  const [coachStatus, setCoachStatus] = useState<{ available: boolean; model: string }>({
    available: true,
    model: 'gemini-3.8-flash',
  });

  // Recommended Workout State
  const [todayWorkout, setTodayWorkout] = useState<RecommendedWorkout | null>(() =>
    loadTodayRecommendedWorkout()
  );
  const [isGeneratingWorkout, setIsGeneratingWorkout] = useState(false);
  const [workoutError, setWorkoutError] = useState<string | null>(null);
  const [selectedSportPref, setSelectedSportPref] = useState<CoachSport | 'auto'>('auto');
  const [selectedDurationPref, setSelectedDurationPref] = useState<number | undefined>(undefined);
  const [customWorkoutNotes, setCustomWorkoutNotes] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  // Periodized Plan State
  const [savedPlan, setSavedPlan] = useState<PeriodizedPlan | null>(() => loadSavedCoachingPlan());
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // Chat State
  const [chatMessages, setChatMessages] = useState<CoachChatMessage[]>(() => loadCoachChatHistory());
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);

  // Check Coach API status
  useEffect(() => {
    fetchCoachStatus().then((s) => {
      setCoachStatus(s);
    });
  }, []);

  // Compute live physiological context
  const latestRecoveryLog = recoveryLogs.length > 0 ? recoveryLogs[recoveryLogs.length - 1] : null;
  const latestReadiness = useMemo(() => {
    if (!latestRecoveryLog) return null;
    return computeDailyReadiness(latestRecoveryLog, recoveryLogs, athleteProfile);
  }, [latestRecoveryLog, recoveryLogs, athleteProfile]);

  const timeline = useMemo(
    () => computeFitnessTimeline(stravaActivities, stravaActivityDetails, athleteProfile, 45),
    [stravaActivities, stravaActivityDetails, athleteProfile]
  );
  const latestFitness = timeline.length > 0 ? timeline[timeline.length - 1] : null;

  const tfiResult = useMemo(() => {
    if (!latestFitness) return null;
    return calculateTriathlonFitnessIndex(
      latestFitness.swimCtl,
      latestFitness.bikeCtl,
      latestFitness.runCtl,
      'middle_70_3',
      athleteGoals
    );
  }, [latestFitness, athleteGoals]);

  const primaryGoal = useMemo(() => {
    return athleteGoals.find((g) => g.priority === 'A') || athleteGoals[0] || null;
  }, [athleteGoals]);

  const daysToPrimaryGoal = useMemo(() => {
    if (!primaryGoal?.eventDate) return null;
    const target = new Date(primaryGoal.eventDate).getTime();
    const today = Date.now();
    const diff = Math.ceil((target - today) / (1000 * 3600 * 24));
    return diff > 0 ? diff : null;
  }, [primaryGoal]);

  // Handle generating / regenerating today's workout
  const handleGenerateTodayWorkout = async () => {
    setIsGeneratingWorkout(true);
    setWorkoutError(null);
    try {
      const payload = prepareCoachPayload(
        athleteProfile,
        athleteGoals,
        stravaActivities,
        stravaActivityDetails,
        recoveryLogs,
        selectedSportPref,
        selectedDurationPref,
        customWorkoutNotes
      );
      const res = await requestRecommendedWorkout(payload);
      setTodayWorkout(res.workout);
      saveTodayRecommendedWorkout(res.workout);
    } catch (err: any) {
      setWorkoutError(err.message || 'Failed to generate workout');
    } finally {
      setIsGeneratingWorkout(false);
    }
  };

  // Automatically request today's workout if none exists
  useEffect(() => {
    if (!todayWorkout && !isGeneratingWorkout && stravaActivities.length > 0) {
      handleGenerateTodayWorkout();
    }
  }, []);

  // Handle generating periodized plan
  const handleGeneratePlan = async () => {
    setIsGeneratingPlan(true);
    setPlanError(null);
    try {
      const payload = prepareCoachPayload(
        athleteProfile,
        athleteGoals,
        stravaActivities,
        stravaActivityDetails,
        recoveryLogs
      );
      const res = await requestPeriodizedPlan(payload);
      setSavedPlan(res.plan);
      saveCoachingPlan(res.plan);
    } catch (err: any) {
      setPlanError(err.message || 'Failed to generate training plan');
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  // Handle Coach Chat
  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || chatInput).trim();
    if (!query || isSendingChat) return;

    const userMsg: CoachChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const nextMessages = [...chatMessages, userMsg];
    setChatMessages(nextMessages);
    setChatInput('');
    setIsSendingChat(true);

    try {
      const payload = prepareCoachPayload(
        athleteProfile,
        athleteGoals,
        stravaActivities,
        stravaActivityDetails,
        recoveryLogs
      );
      const answer = await sendCoachChatMessage(query, payload, chatMessages);

      const coachMsg: CoachChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'model',
        content: answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      const finalMessages = [...nextMessages, coachMsg];
      setChatMessages(finalMessages);
      saveCoachChatHistory(finalMessages);
    } catch (err) {
      const errorMsg: CoachChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'model',
        content: 'I had trouble analyzing your latest metrics right now. Please try again shortly.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setChatMessages([...nextMessages, errorMsg]);
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleCopyWorkout = () => {
    if (!todayWorkout) return;
    const text = `🎯 ${todayWorkout.title} (${todayWorkout.sport.toUpperCase()})
⏱️ Duration: ${todayWorkout.durationMin} mins | Est TSS: ${todayWorkout.estimatedTss}
⚡ Targets: Watts: ${todayWorkout.targetZones.watts || 'N/A'} | HR: ${todayWorkout.targetZones.heartRate || 'N/A'} | Pace: ${todayWorkout.targetZones.pace || 'N/A'}

🧠 Rationale: ${todayWorkout.coachRationale}

📋 Intervals:
${todayWorkout.structure.map((s) => `• [${s.phase}] (${s.duration}): ${s.description} -> Target: ${s.target || 'Steady'}`).join('\n')}

🍎 Fueling: ${todayWorkout.nutritionTips || 'Stay hydrated'}`;

    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  const sportColor = (sport: CoachSport) => {
    switch (sport) {
      case 'bike':
        return 'text-amber-500 bg-amber-500/10 border-amber-500/30';
      case 'run':
        return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30';
      case 'swim':
        return 'text-cyan-500 bg-cyan-500/10 border-cyan-500/30';
      case 'brick':
        return 'text-orange-500 bg-orange-500/10 border-orange-500/30';
      case 'strength':
        return 'text-purple-500 bg-purple-500/10 border-purple-500/30';
      default:
        return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ========================================================= */}
      {/* 1. Athlete Real-Time Biological State & Coach Header */}
      {/* ========================================================= */}
      <div
        className={`p-4 sm:p-5 rounded-2xl border transition-all ${
          theme === 'light'
            ? 'bg-gradient-to-r from-emerald-50/70 via-white to-indigo-50/70 border-slate-200 shadow-xs'
            : 'bg-gradient-to-r from-emerald-950/20 via-slate-900/60 to-indigo-950/20 border-slate-800'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg sm:text-xl font-black tracking-tight">Coach Gemini</h1>
                  <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                    AI Endurance Engine
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Adaptive triathlon coaching synchronized with your physiology, training stress, and race goals.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Physiology Snapshot Pills */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Readiness */}
            <div
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 ${
                latestReadiness
                  ? `${latestReadiness.badgeBg} ${latestReadiness.badgeText} border-emerald-500/30`
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              <Heart className="w-3.5 h-3.5 shrink-0 text-rose-500" />
              <span>
                Readiness:{' '}
                <strong className="font-extrabold">
                  {latestReadiness?.score ? `${latestReadiness.score}%` : '85%'}
                </strong>
              </span>
            </div>

            {/* Form (TSB) */}
            <div
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 ${
                theme === 'light'
                  ? 'bg-white border-slate-200 text-slate-700'
                  : 'bg-slate-900 border-slate-800 text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>
                Form (TSB):{' '}
                <strong
                  className={
                    (latestFitness?.triTsb || 0) >= 0 ? 'text-emerald-400' : 'text-amber-400'
                  }
                >
                  {(latestFitness?.triTsb || 0) > 0 ? `+${Math.round(latestFitness?.triTsb || 0)}` : Math.round(latestFitness?.triTsb || 0)}
                </strong>
              </span>
            </div>

            {/* FTP */}
            <div
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 cursor-pointer hover:border-slate-500 transition-colors ${
                theme === 'light'
                  ? 'bg-white border-slate-200 text-slate-700'
                  : 'bg-slate-900 border-slate-800 text-slate-200'
              }`}
              onClick={() => onOpenSettings('physiology')}
              title="Click to view or edit bike FTP and running LTHR"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                FTP: <strong>{athleteProfile.bikeFtp || 315}W</strong> • LTHR:{' '}
                <strong>{athleteProfile.thresholdHeartRateRun || 168}</strong>
              </span>
            </div>

            {/* Primary Goal Badge */}
            {primaryGoal && (
              <div
                className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 cursor-pointer hover:border-slate-500 transition-colors ${
                  theme === 'light'
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : 'bg-indigo-950/60 text-indigo-300 border-indigo-700/40'
                }`}
                onClick={() => onOpenSettings('goals')}
                title="Primary A-Goal"
              >
                <Target className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>
                  <strong>{primaryGoal.name}</strong>
                  {daysToPrimaryGoal !== null && (
                    <span className="opacity-80"> ({daysToPrimaryGoal}d)</span>
                  )}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Coach Navigation Switcher */}
        <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-slate-800/80 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-900/60 rounded-xl border border-slate-700/60">
            <button
              type="button"
              onClick={() => setActiveSubTab('today')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeSubTab === 'today'
                  ? 'bg-emerald-500 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Flame className="w-3.5 h-3.5 shrink-0" />
              <span>Today's Prescribed Workout</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('plan')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeSubTab === 'plan'
                  ? 'bg-emerald-500 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>Adaptive Training Plan</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('chat')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeSubTab === 'chat'
                  ? 'bg-emerald-500 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              <span>Ask Coach Gemini</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Model: {coachStatus.model}</span>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. SUB-TAB: TODAY'S PRESCRIBED WORKOUT */}
      {/* ========================================================= */}
      {activeSubTab === 'today' && (
        <div className="space-y-4">
          {/* Controls & Filter Bar */}
          <div
            className={`p-3.5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
              theme === 'light'
                ? 'bg-white border-slate-200 shadow-xs'
                : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-500">Discipline:</span>
              {(['auto', 'bike', 'run', 'swim', 'strength', 'rest'] as const).map((sport) => (
                <button
                  key={sport}
                  type="button"
                  onClick={() => setSelectedSportPref(sport)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer capitalize ${
                    selectedSportPref === sport
                      ? 'bg-emerald-500 text-slate-950 font-black'
                      : theme === 'light'
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  {sport === 'auto' ? '⚡ Coach Pick' : sport}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto">
              <select
                value={selectedDurationPref || ''}
                onChange={(e) =>
                  setSelectedDurationPref(e.target.value ? Number(e.target.value) : undefined)
                }
                className={`text-xs px-2.5 py-1 rounded-lg border cursor-pointer font-bold ${
                  theme === 'light'
                    ? 'bg-slate-50 border-slate-300 text-slate-800'
                    : 'bg-slate-800 border-slate-700 text-slate-200'
                }`}
              >
                <option value="">Any Duration</option>
                <option value="30">30 mins</option>
                <option value="45">45 mins</option>
                <option value="60">60 mins</option>
                <option value="75">75 mins</option>
                <option value="90">90 mins</option>
                <option value="120">2 hours</option>
              </select>

              <button
                type="button"
                onClick={handleGenerateTodayWorkout}
                disabled={isGeneratingWorkout}
                className="px-3.5 py-1 text-xs font-bold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-xs"
              >
                <RotateCw
                  className={`w-3.5 h-3.5 ${isGeneratingWorkout ? 'animate-spin' : ''}`}
                />
                <span>{isGeneratingWorkout ? 'Analyzing...' : 'Adapt Workout'}</span>
              </button>
            </div>
          </div>

          {workoutError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs rounded-xl flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{workoutError}</span>
            </div>
          )}

          {/* Workout Recommendation Card */}
          {todayWorkout ? (
            <div
              className={`p-5 sm:p-6 rounded-2xl border transition-all ${
                theme === 'light'
                  ? 'bg-white border-slate-200 shadow-sm'
                  : 'bg-slate-900/80 border-slate-800'
              }`}
            >
              {/* Header section of workout */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-xs uppercase tracking-wider font-extrabold px-2.5 py-0.5 rounded-md border ${sportColor(
                        todayWorkout.sport
                      )}`}
                    >
                      {todayWorkout.sport}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 font-bold capitalize">
                      {todayWorkout.intensity.replace('_', ' ')}
                    </span>
                    {todayWorkout.isCompleted && (
                      <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Completed
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight pt-1">
                    {todayWorkout.title}
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyWorkout}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border flex items-center gap-1.5 cursor-pointer transition-colors ${
                      theme === 'light'
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                    }`}
                  >
                    {isCopied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{isCopied ? 'Copied' : 'Copy'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const updated = { ...todayWorkout, isCompleted: !todayWorkout.isCompleted };
                      setTodayWorkout(updated);
                      saveTodayRecommendedWorkout(updated);
                    }}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border flex items-center gap-1.5 cursor-pointer transition-colors ${
                      todayWorkout.isCompleted
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-400'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{todayWorkout.isCompleted ? 'Mark Incomplete' : 'Complete Workout'}</span>
                  </button>
                </div>
              </div>

              {/* Workout Key Metrics Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4">
                <div
                  className={`p-3 rounded-xl border ${
                    theme === 'light'
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Duration</div>
                  <div className="text-lg font-black mt-0.5 flex items-center gap-1">
                    <Timer className="w-4 h-4 text-emerald-400" />
                    <span>{todayWorkout.durationMin} min</span>
                  </div>
                </div>

                <div
                  className={`p-3 rounded-xl border ${
                    theme === 'light'
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Est. Stress (TSS)</div>
                  <div className="text-lg font-black mt-0.5 flex items-center gap-1">
                    <Flame className="w-4 h-4 text-orange-400" />
                    <span>{todayWorkout.estimatedTss} TSS</span>
                  </div>
                </div>

                <div
                  className={`p-3 rounded-xl border ${
                    theme === 'light'
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Target Watts / Pace</div>
                  <div className="text-sm font-black mt-1 text-amber-400 truncate">
                    {todayWorkout.targetZones.watts || todayWorkout.targetZones.pace || 'Zone 2 Steady'}
                  </div>
                </div>

                <div
                  className={`p-3 rounded-xl border ${
                    theme === 'light'
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Target Heart Rate</div>
                  <div className="text-sm font-black mt-1 text-rose-400 truncate">
                    {todayWorkout.targetZones.heartRate || 'Aerobic Zone 2'}
                  </div>
                </div>
              </div>

              {/* Coach Rationale Callout */}
              <div
                className={`p-4 rounded-xl border mb-5 ${
                  theme === 'light'
                    ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                    : 'bg-emerald-950/20 border-emerald-900/40 text-emerald-200'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs">
                    <strong className="font-extrabold text-emerald-400">Coach Rationale:</strong>
                    <p className="leading-relaxed opacity-90">{todayWorkout.coachRationale}</p>
                    {todayWorkout.readinessAnalysis && (
                      <p className="text-[11px] opacity-75 pt-1">
                        🔬 <em>{todayWorkout.readinessAnalysis}</em>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Step-by-Step Interval Breakdown */}
              <div className="space-y-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Step-by-Step Interval Protocol
                </h3>
                <div className="space-y-2">
                  {todayWorkout.structure.map((step, idx) => (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        theme === 'light'
                          ? 'bg-slate-50/80 border-slate-200'
                          : 'bg-slate-950/70 border-slate-800/80'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-xs font-black shrink-0">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-white">{step.phase}</span>
                            <span className="text-[11px] font-bold text-slate-400">
                              ({step.duration})
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                            {step.description}
                          </p>
                        </div>
                      </div>

                      {step.target && (
                        <div className="sm:text-right shrink-0">
                          <span className="inline-block text-[11px] font-mono font-bold px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/30">
                            {step.target}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Fueling & Injury Advisory */}
              <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {todayWorkout.nutritionTips && (
                  <div
                    className={`p-3 rounded-xl border ${
                      theme === 'light'
                        ? 'bg-slate-50 border-slate-200 text-slate-700'
                        : 'bg-slate-950/50 border-slate-800 text-slate-300'
                    }`}
                  >
                    <strong className="text-amber-400 block mb-1">🍎 Fueling & Hydration:</strong>
                    <p className="opacity-90">{todayWorkout.nutritionTips}</p>
                  </div>
                )}

                {todayWorkout.injuryWarning && (
                  <div className="p-3 rounded-xl border bg-rose-500/10 border-rose-500/30 text-rose-300">
                    <strong className="text-rose-400 block mb-1">⚠️ Biomechanical Advisory:</strong>
                    <p className="opacity-90">{todayWorkout.injuryWarning}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center border rounded-2xl border-dashed border-slate-700 text-slate-400">
              <Sparkles className="w-8 h-8 text-emerald-400 mx-auto mb-2 animate-bounce" />
              <p className="text-sm font-bold">No workout generated yet for today.</p>
              <button
                type="button"
                onClick={handleGenerateTodayWorkout}
                className="mt-3 px-4 py-2 bg-emerald-500 text-slate-950 rounded-xl font-bold text-xs cursor-pointer hover:bg-emerald-400 transition-colors"
              >
                Generate Recommended Workout
              </button>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. SUB-TAB: ADAPTIVE TRAINING PLAN */}
      {/* ========================================================= */}
      {activeSubTab === 'plan' && (
        <div className="space-y-4">
          <div
            className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              theme === 'light'
                ? 'bg-white border-slate-200 shadow-xs'
                : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div>
              <h2 className="text-base font-black">
                {primaryGoal ? `Periodized Plan: ${primaryGoal.name}` : '7-Day Training Microcycle'}
              </h2>
              <p className="text-xs text-slate-400">
                Balances your weekly availability, current CTL ({latestFitness?.triCtl ? Math.round(latestFitness.triCtl) : 75}), and race event timeline.
              </p>
            </div>

            <button
              type="button"
              onClick={handleGeneratePlan}
              disabled={isGeneratingPlan}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shrink-0 shadow-xs"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isGeneratingPlan ? 'animate-spin' : ''}`} />
              <span>{isGeneratingPlan ? 'Building Plan...' : 'Generate 7-Day Microcycle'}</span>
            </button>
          </div>

          {planError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs rounded-xl flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{planError}</span>
            </div>
          )}

          {savedPlan ? (
            <div className="space-y-4">
              {/* Plan Overview Banner */}
              <div
                className={`p-4 rounded-2xl border ${
                  theme === 'light'
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-slate-900/40 border-slate-800'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                      {savedPlan.periodizationPhase}
                    </span>
                    <p className="text-xs text-slate-300 pt-1 leading-relaxed">
                      {savedPlan.summary}
                    </p>
                  </div>
                  {savedPlan.weeks[0] && (
                    <div className="text-right shrink-0">
                      <div className="text-xs text-slate-400 font-bold">Planned Volume</div>
                      <div className="text-base font-black text-emerald-400">
                        {savedPlan.weeks[0].totalHours} hrs • {savedPlan.weeks[0].totalTss} TSS
                      </div>
                    </div>
                  )}
                </div>

                {savedPlan.keyFocusAreas && savedPlan.keyFocusAreas.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-800 flex flex-wrap gap-2 text-xs">
                    {savedPlan.keyFocusAreas.map((area, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-lg bg-slate-950 text-slate-300 border border-slate-800 flex items-center gap-1.5"
                      >
                        <TrendingUp className="w-3 h-3 text-emerald-400" />
                        <span>{area}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 7-Day Microcycle Table / Cards */}
              <div className="grid grid-cols-1 md:grid-cols-7 gap-2.5">
                {savedPlan.weeks[0]?.days.map((day, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
                      day.isKeySession
                        ? 'border-emerald-500/40 bg-emerald-950/10'
                        : theme === 'light'
                        ? 'bg-white border-slate-200'
                        : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-slate-800/60">
                        <span className="text-xs font-black">{day.dayName.slice(0, 3)}</span>
                        <span
                          className={`text-[9px] uppercase font-extrabold px-1.5 py-0.2 rounded border ${sportColor(
                            day.sport
                          )}`}
                        >
                          {day.sport}
                        </span>
                      </div>

                      <div className="pt-2">
                        <h4 className="text-xs font-extrabold line-clamp-2 leading-tight">
                          {day.title}
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-3 leading-relaxed">
                          {day.description}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400 font-bold">
                      <span>{day.durationMin > 0 ? `${day.durationMin}m` : 'Rest'}</span>
                      {day.targetTss > 0 && <span className="text-amber-400">{day.targetTss} TSS</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center border rounded-2xl border-dashed border-slate-700 text-slate-400">
              <Calendar className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm font-bold">No plan generated yet.</p>
              <button
                type="button"
                onClick={handleGeneratePlan}
                className="mt-3 px-4 py-2 bg-emerald-500 text-slate-950 rounded-xl font-bold text-xs cursor-pointer hover:bg-emerald-400 transition-colors"
              >
                Generate 7-Day Microcycle
              </button>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. SUB-TAB: ASK COACH GEMINI (CHAT & ADVISORY) */}
      {/* ========================================================= */}
      {activeSubTab === 'chat' && (
        <div className="space-y-4">
          {/* Quick Prompt Chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Quick questions:</span>
            {[
              'Should I do intervals or endurance today based on my HRV?',
              `How should I pace my 70.3 bike leg with FTP ${athleteProfile.bikeFtp || 315}W?`,
              'I only have 45 minutes today — what should I do?',
              'How should I adjust my plan: my calves feel tight?',
            ].map((q, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSendMessage(q)}
                disabled={isSendingChat}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-all text-left cursor-pointer disabled:opacity-50 ${
                  theme === 'light'
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
              >
                {q}
              </button>
            ))}
          </div>

          {/* Chat Messages Log */}
          <div
            className={`p-4 rounded-2xl border min-h-[350px] max-h-[500px] overflow-y-auto space-y-3 ${
              theme === 'light'
                ? 'bg-white border-slate-200 shadow-inner'
                : 'bg-slate-950/80 border-slate-800 shadow-inner'
            }`}
          >
            {chatMessages.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-center text-slate-500 text-xs">
                <MessageSquare className="w-8 h-8 mb-2 opacity-40 text-emerald-400" />
                <p className="font-bold">Ask Coach Gemini anything about your training.</p>
                <p className="text-[11px] opacity-75 mt-1">
                  Answers are grounded in your actual FTP ({athleteProfile.bikeFtp}W), LTHR ({athleteProfile.thresholdHeartRateRun} bpm), and readiness score.
                </p>
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[85%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-emerald-500 text-slate-950 font-medium rounded-br-xs'
                        : theme === 'light'
                        ? 'bg-slate-100 text-slate-800 border border-slate-200 rounded-bl-xs'
                        : 'bg-slate-900 text-slate-100 border border-slate-800 rounded-bl-xs'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 px-1">{msg.timestamp}</span>
                </div>
              ))
            )}

            {isSendingChat && (
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
                <span>Coach Gemini is analyzing your training data...</span>
              </div>
            )}
          </div>

          {/* Chat Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about pacing, interval design, nutrition, or recovery adjustments..."
              disabled={isSendingChat}
              className={`flex-1 px-4 py-2.5 rounded-xl border text-xs outline-none transition-colors ${
                theme === 'light'
                  ? 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                  : 'bg-slate-900 border-slate-700 text-white focus:border-emerald-400'
              }`}
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || isSendingChat}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
