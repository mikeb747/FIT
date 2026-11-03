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
  Timer,
  Info,
  ShieldAlert,
  Copy,
  Check,
  Target,
  TrendingUp,
  Briefcase,
  AlertTriangle,
  Award,
  Layers,
  HelpCircle,
  Clock,
  Compass,
  FileText,
  ChevronRight,
} from 'lucide-react';
import type { AthleteProfile, DayOfWeek } from '../types/athlete';
import type { TrainingGoal } from '../types/goals';
import type { DailyRecoveryLog } from '../types/recovery';
import type { StravaActivity, StravaActivityDetailsRecord } from '../utils/stravaActivities';
import type {
  RecommendedWorkout,
  PeriodizedPlan,
  CoachSport,
  CoachChatMessage,
  WorkoutReviewItem,
  BenchmarkMilestone,
} from '../types/coach';
import {
  fetchCoachStatus,
  prepareCoachPayload,
  requestRecommendedWorkout,
  requestPeriodizedPlan,
  sendCoachChatMessage,
  requestWorkoutReviews,
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
import {
  getPeriodizationPhaseInfo,
  evaluateBenchmarkMilestones,
  generateWorkoutReviews,
} from '../utils/workoutReviewEngine';
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
  // Navigation within Coach: today | reviews | benchmarks | plan | chat
  const [activeSubTab, setActiveSubTab] = useState<'today' | 'reviews' | 'benchmarks' | 'plan' | 'chat'>('today');

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

  // Workout Reviews State
  const [workoutReviews, setWorkoutReviews] = useState<WorkoutReviewItem[]>([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'optimal' | 'needs_adjustment'>('all');

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

  // Daily Work Availability & Periodization
  const todayDayName = useMemo(() => {
    return new Date().toLocaleDateString('en-US', { weekday: 'long' });
  }, []);

  const currentDayKey = useMemo<DayOfWeek>(() => {
    const map: Record<string, DayOfWeek> = {
      monday: 'mon',
      tuesday: 'tue',
      wednesday: 'wed',
      thursday: 'thu',
      friday: 'fri',
      saturday: 'sat',
      sunday: 'sun',
    };
    return map[todayDayName.toLowerCase()] || 'mon';
  }, [todayDayName]);

  const todayAvailability = useMemo(() => {
    return athleteProfile.weeklyAvailability?.[currentDayKey];
  }, [athleteProfile, currentDayKey]);

  const periodizationInfo = useMemo(() => {
    return getPeriodizationPhaseInfo(athleteProfile);
  }, [athleteProfile]);

  const activeInjuries = useMemo(() => {
    return (athleteProfile.injuries || []).filter(
      (inj) => inj.status === 'active' || inj.status === 'monitoring' || (typeof inj.painLevel === 'number' && inj.painLevel > 0)
    );
  }, [athleteProfile]);

  // Benchmarks & Sub-Goals computation
  const benchmarks = useMemo(() => {
    return evaluateBenchmarkMilestones(stravaActivities, athleteProfile);
  }, [stravaActivities, athleteProfile]);

  // Initial load of workout reviews
  useEffect(() => {
    if (stravaActivities.length > 0) {
      const initialReviews = generateWorkoutReviews(stravaActivities, stravaActivityDetails, athleteProfile, athleteGoals);
      setWorkoutReviews(initialReviews);
    }
  }, [stravaActivities, stravaActivityDetails, athleteProfile, athleteGoals]);

  const handleRefreshReviews = async () => {
    setIsLoadingReviews(true);
    try {
      const payload = prepareCoachPayload(
        athleteProfile,
        athleteGoals,
        stravaActivities,
        stravaActivityDetails,
        recoveryLogs
      );
      const res = await requestWorkoutReviews(payload, stravaActivities, stravaActivityDetails, athleteProfile, athleteGoals);
      setWorkoutReviews(res.reviews);
    } catch {
      const fallback = generateWorkoutReviews(stravaActivities, stravaActivityDetails, athleteProfile, athleteGoals);
      setWorkoutReviews(fallback);
    } finally {
      setIsLoadingReviews(false);
    }
  };

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
    } catch {
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

  const handleAskAboutReview = (rev: WorkoutReviewItem) => {
    const prompt = `Coach Gemini, review my workout "${rev.name}" (${rev.sport}) on ${rev.dayOfWeek} ${rev.startDate}: was it too hard, too short, or not hard enough for my current ${rev.periodizationContext}? How did it help my goal or sub-goals?`;
    setActiveSubTab('chat');
    handleSendMessage(prompt);
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

  const sportColor = (sport: CoachSport | string) => {
    const s = String(sport).toLowerCase();
    if (s.includes('bike') || s.includes('ride')) {
      return 'text-amber-500 bg-amber-500/10 border-amber-500/30';
    }
    if (s.includes('run')) {
      return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30';
    }
    if (s.includes('swim')) {
      return 'text-cyan-500 bg-cyan-500/10 border-cyan-500/30';
    }
    if (s.includes('brick')) {
      return 'text-orange-500 bg-orange-500/10 border-orange-500/30';
    }
    if (s.includes('strength') || s.includes('weight')) {
      return 'text-purple-500 bg-purple-500/10 border-purple-500/30';
    }
    return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
  };

  // Filtered Reviews
  const filteredReviews = useMemo(() => {
    if (reviewFilter === 'optimal') {
      return workoutReviews.filter((r) => r.assessment === 'optimal');
    }
    if (reviewFilter === 'needs_adjustment') {
      return workoutReviews.filter((r) => r.assessment !== 'optimal');
    }
    return workoutReviews;
  }, [workoutReviews, reviewFilter]);

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
                  Adaptive triathlon coaching synchronized with your physiology, periodization cycle, and work schedule.
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

            {/* Periodization Phase Badge */}
            <div
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 cursor-pointer hover:border-slate-500 transition-colors ${
                theme === 'light'
                  ? 'bg-white border-slate-200 text-slate-700'
                  : 'bg-slate-900 border-slate-800 text-slate-200'
              }`}
              onClick={() => onOpenSettings('physiology')}
              title="Periodization Cycle Strategy"
            >
              <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>
                Phase: <strong className="text-sky-400">{periodizationInfo.model} ({periodizationInfo.currentWeekInCycle}/{periodizationInfo.totalCycleWeeks})</strong>
              </span>
            </div>

            {/* FTP / LTHR */}
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

        {/* Coach Navigation Switcher (5 Sub-Tabs) */}
        <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-slate-800/80 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-900/60 rounded-xl border border-slate-700/60 flex-wrap">
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
              <span>Today's Workout</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('reviews')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeSubTab === 'reviews'
                  ? 'bg-emerald-500 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span>Review Workouts</span>
              {workoutReviews.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 font-extrabold">
                  {workoutReviews.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('benchmarks')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeSubTab === 'benchmarks'
                  ? 'bg-emerald-500 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Award className="w-3.5 h-3.5 shrink-0" />
              <span>Benchmarks & Sub-Goals</span>
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
              <span>Adaptive Plan</span>
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
            <span>
              {coachStatus.model === 'gemini-3.8-flash'
                ? 'Engine: Gemini 3.8 Flash'
                : 'Engine: Sports Science Physiological Model'}
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. SUB-TAB: TODAY'S PRESCRIBED WORKOUT */}
      {/* ========================================================= */}
      {activeSubTab === 'today' && (
        <div className="space-y-4">
          {/* Work Schedule & Availability Constraint Banner */}
          <div
            className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
              theme === 'light'
                ? 'bg-sky-50/80 border-sky-200 text-sky-950'
                : 'bg-sky-950/20 border-sky-900/40 text-sky-200'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <Briefcase className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-bold flex items-center gap-2">
                  <span>
                    Today's Training Availability ({todayDayName}):{' '}
                    <strong>
                      {todayAvailability?.isWorkday
                        ? `Workday (${todayAvailability.shiftStart || '08:30'} - ${todayAvailability.shiftEnd || '17:00'})`
                        : 'Off-Day / Weekend'}
                    </strong>
                  </span>
                  <span className="px-2 py-0.2 rounded-full bg-sky-500/20 text-sky-300 font-black uppercase text-[10px]">
                    {todayAvailability?.availableWindows?.join(' & ') || 'Anytime'} Window
                  </span>
                </div>
                <p className="text-[11px] opacity-80">
                  Prescription automatically calibrated to fit your available window (~45-60 min on workdays) without conflicting with work hours.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onOpenSettings('physiology')}
              className="text-sky-400 hover:underline font-bold text-[11px] shrink-0 self-end sm:self-auto cursor-pointer"
            >
              Adjust Schedule
            </button>
          </div>

          {/* Active Injury Advisory Banner */}
          {activeInjuries.length > 0 && (
            <div className="p-3.5 rounded-2xl border bg-rose-500/10 border-rose-500/30 text-rose-300 text-xs flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-bold text-rose-300">
                    Active Injury Guard Active: {activeInjuries.map((i) => `${i.name} (${i.bodyArea})`).join(', ')}
                  </div>
                  <p className="text-[11px] opacity-90 text-rose-200">
                    {activeInjuries[0].sportModifications || 'Restricted impact and low torque enforced.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenSettings('physiology')}
                className="text-rose-400 hover:underline font-bold text-[11px] shrink-0 cursor-pointer"
              >
                View Protocol
              </button>
            </div>
          )}

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
                <option value="">Workday Default ({todayAvailability?.isWorkday ? '45-60m' : '120m'})</option>
                <option value="30">30 mins (Tight Window)</option>
                <option value="45">45 mins (Lunch/Evening)</option>
                <option value="60">60 mins (Standard Quality)</option>
                <option value="75">75 mins (Sweet Spot)</option>
                <option value="90">90 mins</option>
                <option value="120">2 hours (Weekend Volume)</option>
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
      {/* 3. SUB-TAB: REVIEW WORKOUTS (DETAILS & STREAMS ANALYSIS) */}
      {/* ========================================================= */}
      {activeSubTab === 'reviews' && (
        <div className="space-y-4">
          <div
            className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              theme === 'light'
                ? 'bg-white border-slate-200 shadow-xs'
                : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black">Workout Reviews & Stream Analysis</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-extrabold uppercase">
                  {workoutReviews.length} Evaluated
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Detailed assessment of overall stats, activity streams (HR, power, cardiac drift, rest periods), periodization phase fit, and goal contributions.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setReviewFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    reviewFilter === 'all'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All ({workoutReviews.length})
                </button>
                <button
                  type="button"
                  onClick={() => setReviewFilter('optimal')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    reviewFilter === 'optimal'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'text-slate-400 hover:text-emerald-300'
                  }`}
                >
                  Optimal ({workoutReviews.filter((r) => r.assessment === 'optimal').length})
                </button>
                <button
                  type="button"
                  onClick={() => setReviewFilter('needs_adjustment')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    reviewFilter === 'needs_adjustment'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'text-slate-400 hover:text-amber-300'
                  }`}
                >
                  Needs Attention ({workoutReviews.filter((r) => r.assessment !== 'optimal').length})
                </button>
              </div>

              <button
                type="button"
                onClick={handleRefreshReviews}
                disabled={isLoadingReviews}
                className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isLoadingReviews ? 'animate-spin' : ''}`} />
                <span>Re-Analyze</span>
              </button>
            </div>
          </div>

          {/* List of Evaluated Workouts */}
          <div className="space-y-3">
            {filteredReviews.length === 0 ? (
              <div className="p-12 text-center border rounded-2xl border-dashed border-slate-700 text-slate-400 text-xs">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-500" />
                <p className="font-bold">No workout reviews match this filter.</p>
              </div>
            ) : (
              filteredReviews.map((rev) => (
                <div
                  key={rev.id}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                    theme === 'light'
                      ? 'bg-white border-slate-200 shadow-xs'
                      : 'bg-slate-900/70 border-slate-800'
                  }`}
                >
                  {/* Top Bar of Workout Card */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-md border ${sportColor(
                          rev.sport
                        )}`}
                      >
                        {rev.sport}
                      </span>
                      <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                        {rev.name}
                      </h3>
                      <span className="text-xs text-slate-400 font-bold">
                        • {rev.dayOfWeek}, {rev.startDate} ({rev.daysAgo === 0 ? 'Today' : `${rev.daysAgo}d ago`})
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Assessment Badge: Too Hard | Too Short | Not Hard Enough | Optimal */}
                      <span
                        className={`text-xs px-2.5 py-1 rounded-lg border font-black uppercase tracking-wider flex items-center gap-1.5 ${rev.assessmentBadge.bgClass} ${rev.assessmentBadge.textClass} ${rev.assessmentBadge.borderClass}`}
                      >
                        {rev.assessment === 'optimal' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : rev.assessment === 'too_hard' ? (
                          <ShieldAlert className="w-3.5 h-3.5" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5" />
                        )}
                        <span>{rev.assessmentBadge.label}</span>
                      </span>

                      <button
                        type="button"
                        onClick={() => handleAskAboutReview(rev)}
                        className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 cursor-pointer transition-colors"
                        title="Ask Coach Gemini to analyze this workout in chat"
                      >
                        <MessageSquare className="w-3 h-3 text-emerald-400" />
                        <span>Discuss with Coach</span>
                      </button>
                    </div>
                  </div>

                  {/* Metrics Summary Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 py-3 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/80">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Volume</div>
                      <div className="text-sm font-black mt-0.5 text-white">
                        {rev.distanceKm > 0 ? `${rev.distanceKm} km` : `${rev.movingTimeMin} min`}
                        <span className="text-[11px] text-slate-400 font-normal ml-1">
                          ({rev.movingTimeMin}m)
                        </span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/80">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Pace / Speed</div>
                      <div className="text-sm font-black mt-0.5 text-amber-400">
                        {rev.paceFormatted || (rev.speedKmh ? `${rev.speedKmh} km/h` : 'Steady')}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/80">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Power / Watts</div>
                      <div className="text-sm font-black mt-0.5 text-amber-300">
                        {rev.avgWatts ? `${rev.avgWatts}W avg` : 'N/A'}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/80">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Heart Rate</div>
                      <div className="text-sm font-black mt-0.5 text-rose-400">
                        {rev.avgHeartrate ? `${rev.avgHeartrate} bpm` : 'N/A'}
                        {rev.maxHeartrate ? (
                          <span className="text-[10px] opacity-75 font-normal ml-1">
                            (max {rev.maxHeartrate})
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/80">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Training Stress</div>
                      <div className="text-sm font-black mt-0.5 text-orange-400">
                        {rev.tss ? `${rev.tss} TSS` : 'Light'}
                      </div>
                    </div>
                  </div>

                  {/* Streams & Physiological Analysis Strip */}
                  <div className="mt-1 p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] font-bold pb-1.5 border-b border-slate-800/80">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Activity className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Streams Telemetry Analysis</span>
                      </div>

                      {rev.streamInsights.cardiacDriftPct !== undefined && (
                        <span
                          className={`px-2 py-0.5 rounded-md font-mono ${
                            rev.streamInsights.cardiacDriftPct <= 5
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          Decoupling (Drift): {rev.streamInsights.cardiacDriftPct > 0 ? `+${rev.streamInsights.cardiacDriftPct}%` : `${rev.streamInsights.cardiacDriftPct}%`}
                        </span>
                      )}
                    </div>

                    {/* Specific Stream Observations */}
                    <div className="space-y-1 text-slate-300 leading-relaxed text-[11px]">
                      {rev.streamInsights.swimIntervalSummary && (
                        <div className="flex items-start gap-1.5 text-cyan-300">
                          <span>🏊</span>
                          <span>{rev.streamInsights.swimIntervalSummary}</span>
                        </div>
                      )}

                      {rev.streamInsights.bikeTtAeroSummary && (
                        <div className="flex items-start gap-1.5 text-amber-300">
                          <span>🚴</span>
                          <span>{rev.streamInsights.bikeTtAeroSummary}</span>
                        </div>
                      )}

                      {rev.streamInsights.runLtpPaceSummary && (
                        <div className="flex items-start gap-1.5 text-emerald-300">
                          <span>🏃</span>
                          <span>{rev.streamInsights.runLtpPaceSummary}</span>
                        </div>
                      )}

                      {!rev.streamInsights.swimIntervalSummary &&
                        !rev.streamInsights.bikeTtAeroSummary &&
                        !rev.streamInsights.runLtpPaceSummary && (
                          <div className="text-slate-400">
                            Heart rate and intensity distributions remained within expected bounds.
                          </div>
                        )}
                    </div>
                  </div>

                  {/* Periodization & Goal Contribution Row */}
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800">
                      <span className="text-[10px] uppercase font-bold text-sky-400 block mb-1">
                        📊 Periodization Fit ({rev.periodizationContext}):
                      </span>
                      <p className="text-slate-300 leading-relaxed text-[11px]">
                        {rev.periodizationFit}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800">
                      <span className="text-[10px] uppercase font-bold text-indigo-400 block mb-1">
                        🎯 Goal & Sub-Goal Contribution:
                      </span>
                      <p className="text-slate-300 leading-relaxed text-[11px]">
                        {rev.goalContribution}
                        {rev.subGoalContribution ? ` • ${rev.subGoalContribution}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Coach Takeaway & Actionable Adjustment */}
                  <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="space-y-0.5 text-slate-300">
                      <strong className="text-emerald-400 font-extrabold mr-1">Coach Takeaway:</strong>
                      <span>{rev.coachTakeaway}</span>
                      {rev.suggestedAdjustment && (
                        <div className="text-slate-400 text-[11px] pt-0.5">
                          💡 <em>Next step: {rev.suggestedAdjustment}</em>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. SUB-TAB: BENCHMARKS & TRIATHLON SUB-GOALS */}
      {/* ========================================================= */}
      {activeSubTab === 'benchmarks' && (
        <div className="space-y-5">
          <div
            className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              theme === 'light'
                ? 'bg-white border-slate-200 shadow-xs'
                : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div>
              <h2 className="text-base font-black">Ironman & 70.3 Benchmark Goals & Sub-Goals</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Separates overarching volume milestones from high-yield physiological sub-goals needed for a sub-4h30m Half Ironman.
              </p>
            </div>

            <div className="text-right text-xs shrink-0">
              <span className="text-emerald-400 font-black">
                {benchmarks.filter((b) => b.status === 'achieved').length} of {benchmarks.length} Completed
              </span>
            </div>
          </div>

          {/* Section A: Macro Volume Milestones */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-300">
                1. Macro Volume Milestones (Mechanical Durability)
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {benchmarks
                .filter((b) => b.category === 'macro_goal')
                .map((b) => (
                  <div
                    key={b.id}
                    className={`p-4 rounded-2xl border flex flex-col justify-between transition-all ${
                      theme === 'light'
                        ? 'bg-white border-slate-200 shadow-xs'
                        : 'bg-slate-900/70 border-slate-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
                        <span
                          className={`text-[9px] uppercase font-black px-2 py-0.5 rounded border ${sportColor(
                            b.discipline
                          )}`}
                        >
                          {b.discipline}
                        </span>

                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                            b.status === 'achieved'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {b.status === 'achieved' ? 'Achieved' : `${b.progressPct}%`}
                        </span>
                      </div>

                      <h4 className="text-sm font-black mt-2 text-white">{b.title}</h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">{b.description}</p>

                      {/* Progress Bar */}
                      <div className="mt-3 space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <span className="text-slate-400">Current Best:</span>
                          <span className="text-white">
                            {b.currentValue} / {b.targetValue} {b.unit}
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${b.progressPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Best Recorded Workout */}
                      {b.bestEffortActivity && (
                        <div className="mt-3 p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-300">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">
                            Logged in Activities:
                          </span>
                          <span className="font-extrabold text-emerald-400">
                            {b.bestEffortActivity.name}
                          </span>{' '}
                          ({b.bestEffortActivity.metricValue} on {b.bestEffortActivity.date})
                        </div>
                      )}
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-800 text-[11px] text-slate-400 italic">
                      💡 {b.whyItMatters}
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Section B: Precision High-Yield Sub-Goals */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-300">
                2. High-Yield Precision Sub-Goals (Physiological & Aero Benchmarks)
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {benchmarks
                .filter((b) => b.category === 'sub_goal')
                .map((b) => (
                  <div
                    key={b.id}
                    className={`p-4 sm:p-5 rounded-2xl border flex flex-col justify-between transition-all ${
                      theme === 'light'
                        ? 'bg-white border-slate-200 shadow-xs'
                        : 'bg-slate-900/70 border-slate-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[9px] uppercase font-black px-2 py-0.5 rounded border ${sportColor(
                              b.discipline
                            )}`}
                          >
                            {b.discipline}
                          </span>
                          <span className="text-xs font-black text-amber-400">{b.targetMetric}</span>
                        </div>

                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                            b.status === 'achieved'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          }`}
                        >
                          {b.status === 'achieved' ? 'Target Reached' : `Progress: ${b.progressPct}%`}
                        </span>
                      </div>

                      <h4 className="text-sm sm:text-base font-black mt-2 text-white">{b.title}</h4>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">{b.description}</p>

                      {/* Progress Bar */}
                      <div className="mt-3.5 space-y-1">
                        <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-indigo-500 rounded-full transition-all duration-500"
                            style={{ width: `${b.progressPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Sports Science Rationale Callout */}
                      <div className="mt-3 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 space-y-1">
                        <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px]">
                          <Zap className="w-3.5 h-3.5 shrink-0" />
                          <span>Sports Science ROI (Why this gains the most time):</span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          {b.whyItMatters}
                        </p>
                      </div>
                    </div>

                    {b.bestEffortActivity && (
                      <div className="mt-3 pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                        <span>Latest Best Effort:</span>
                        <span className="font-extrabold text-white">
                          {b.bestEffortActivity.name} ({b.bestEffortActivity.metricValue})
                        </span>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. SUB-TAB: ADAPTIVE TRAINING PLAN */}
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
                Balances your weekly work schedule, current CTL ({latestFitness?.triCtl ? Math.round(latestFitness.triCtl) : 75}), and race event timeline.
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
      {/* 6. SUB-TAB: ASK COACH GEMINI (CHAT & ADVISORY) */}
      {/* ========================================================= */}
      {activeSubTab === 'chat' && (
        <div className="space-y-4">
          {/* Quick Prompt Chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Quick questions:</span>
            {[
              'Does Coach Gemini have access to my details in the Athlete tab, periodization cycle, injuries, and work schedule?',
              'Why do I need to reduce rest periods on my swim sessions instead of doing fast short intervals?',
              'For a 4h 30m Half Ironman, would I gain more from running distance or time in the TT position?',
              'What did you think of my training today?',
              'What did you think of my training this weekend?',
              'How should I progress my run workouts from the last 2 Thursdays?',
              'What are my Ironman triathlon macro goals vs precision sub-goals?',
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
            className={`p-4 rounded-2xl border min-h-[380px] max-h-[550px] overflow-y-auto space-y-3 ${
              theme === 'light'
                ? 'bg-white border-slate-200 shadow-inner'
                : 'bg-slate-950/80 border-slate-800 shadow-inner'
            }`}
          >
            {chatMessages.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-center text-slate-500 text-xs">
                <MessageSquare className="w-8 h-8 mb-2 opacity-40 text-emerald-400" />
                <p className="font-bold">Ask Coach Gemini anything about your training.</p>
                <p className="text-[11px] opacity-75 mt-1 max-w-md">
                  Fully grounded in your real Strava activities, swim distance & rest periods, bike FTP & TT aero posture, run LTP threshold stamina, periodization phase, and work schedule.
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
                <span>Coach Gemini is analyzing your training data and history...</span>
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
              placeholder="Ask about swim rest intervals, 4h 30m 70.3 aero gains, or your work schedule..."
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
