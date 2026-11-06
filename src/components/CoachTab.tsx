import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Volume2,
  VolumeX,
  ThumbsUp,
  ThumbsDown,
  Mic,
  MicOff,
  Plus,
  Square,
  ArrowDown,
  X,
  Sliders,
  Wrench,
  RotateCcw,
} from 'lucide-react';
import type { AthleteProfile, DayOfWeek } from '../types/athlete';
import { formatSecondsToMinSec } from '../types/athlete';
import type { TrainingGoal } from '../types/goals';
import { saveAthleteGoals } from '../utils/goalsStorage';
import type { DailyRecoveryLog } from '../types/recovery';
import type { StravaActivity, StravaActivityDetailsRecord } from '../utils/stravaActivities';
import { applyRunSectionsCalibration } from '../utils/stravaActivities';
import { ActivityCalibrationModal } from './ActivityCalibrationModal';
import type {
  RecommendedWorkout,
  PeriodizedPlan,
  CoachSport,
  CoachChatMessage,
  CoachGoalAction,
  CoachWorkoutCalibrationAction,
  CoachAction,
  CalibratedLapProposal,
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

function formatPaceSec(seconds?: number): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return '';
  const mins = Math.floor(seconds / 60);
  const remSec = Math.round(seconds % 60);
  return `${mins}:${remSec.toString().padStart(2, '0')}/km`;
}
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
  stravaToken?: string | null;
  onOpenSettings: (tab?: ProfileTab) => void;
  onGoalsUpdated?: (goals: TrainingGoal[]) => void;
  onProfileUpdated?: (profile: AthleteProfile) => void;
  onActivityDetailsUpdated?: (updatedRecord: StravaActivityDetailsRecord) => void;
}

export const CoachTab: React.FC<CoachTabProps> = ({
  theme,
  athleteProfile,
  athleteGoals,
  stravaActivities,
  stravaActivityDetails,
  recoveryLogs,
  stravaToken,
  onOpenSettings,
  onGoalsUpdated,
  onProfileUpdated,
  onActivityDetailsUpdated,
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

  // Runvia-Grade Chat State
  const [chatMessages, setChatMessages] = useState<CoachChatMessage[]>(() => loadCoachChatHistory());
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Fix Data Run Calibration State
  const [selectedCalibrationActivity, setSelectedCalibrationActivity] = useState<StravaActivity | null>(null);
  const [isFixDataModalOpen, setIsFixDataModalOpen] = useState(false);
  const [isApplyingCalibration, setIsApplyingCalibration] = useState<string | null>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const speechRecognitionRef = useRef<any>(null);

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

  // Runvia Chat Handlers
  const scrollToBottom = (smooth = true) => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  };

  const handleChatScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    setShowScrollBottom(distanceToBottom > 80);
  };

  const handleToggleSpeak = (msgId: string, text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (speakingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const cleanText = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/[#*_`]/g, '')
      .trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.05;
    utterance.onend = () => setSpeakingMsgId(null);
    utterance.onerror = () => setSpeakingMsgId(null);
    setSpeakingMsgId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const handleToggleListen = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice dictation is not supported in this browser. You can type directly.');
      return;
    }

    if (isListening) {
      speechRecognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          setChatInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      speechRecognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const handleCopyMessage = async (msgId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMsgId(msgId);
      setTimeout(() => setCopiedMsgId(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleMessageFeedback = (msgId: string, feedback: 'like' | 'dislike') => {
    const updated = chatMessages.map((msg) =>
      msg.id === msgId ? { ...msg, feedback: msg.feedback === feedback ? undefined : feedback } : msg
    );
    setChatMessages(updated);
    saveCoachChatHistory(updated);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || chatInput).trim();
    if (!query || isSendingChat) return;

    setShowQuickActions(false);
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

    setTimeout(() => scrollToBottom(true), 50);

    try {
      const payload = prepareCoachPayload(
        athleteProfile,
        athleteGoals,
        stravaActivities,
        stravaActivityDetails,
        recoveryLogs
      );
      const res = await sendCoachChatMessage(query, payload, chatMessages);

      // Execute goal mutations if returned by the coach
      if (res.executedAction) {
        const action = res.executedAction;
        if (action.type === 'add_goal' && action.goal) {
          const rawGoal = action.goal;
          const goalName = rawGoal.name || 'Goal Race';
          const existingIdx = athleteGoals.findIndex(
            (g) =>
              (rawGoal.id && g.id === rawGoal.id) ||
              (g.name.toLowerCase() === goalName.toLowerCase() && g.eventDate === rawGoal.eventDate)
          );

          const completeGoal: TrainingGoal = {
            id: rawGoal.id || (existingIdx >= 0 ? athleteGoals[existingIdx].id : `goal_${Date.now()}`),
            name: goalName,
            priority: (rawGoal.priority as 'A' | 'B' | 'C') || 'C',
            eventType: rawGoal.eventType || 'run',
            status: rawGoal.status || 'upcoming',
            targetType: rawGoal.targetType || (rawGoal.totalTargetTimeSec ? 'time' : 'finish'),
            eventDate: rawGoal.eventDate || new Date().toISOString().split('T')[0],
            distancePreset: rawGoal.distancePreset || (rawGoal.totalDistanceKm ? `${rawGoal.totalDistanceKm}km` : 'Custom'),
            totalDistanceKm: rawGoal.totalDistanceKm ?? 10,
            totalTargetTimeSec: rawGoal.totalTargetTimeSec ?? 3600,
            runCourseType: rawGoal.runCourseType || 'road',
            runElevationGainMeters: rawGoal.runElevationGainMeters,
            runTargetPaceSec: rawGoal.runTargetPaceSec,
            triathlonSplits: rawGoal.triathlonSplits,
            milestones: rawGoal.milestones || [],
            location: rawGoal.location,
            notes: rawGoal.notes,
            createdAt: rawGoal.createdAt || new Date().toISOString(),
          };

          let updated: TrainingGoal[];
          if (existingIdx >= 0) {
            updated = [...athleteGoals];
            updated[existingIdx] = completeGoal;
          } else {
            updated = [...athleteGoals, completeGoal];
          }
          saveAthleteGoals(updated);
          onGoalsUpdated?.(updated);
        } else if (action.type === 'update_goal') {
          const matchIdx = athleteGoals.findIndex(
            (g) =>
              (action.goalId && g.id === action.goalId) ||
              (action.goalName && g.name.toLowerCase().includes(action.goalName.toLowerCase()))
          );
          if (matchIdx >= 0 && action.updates) {
            const updated = [...athleteGoals];
            updated[matchIdx] = {
              ...updated[matchIdx],
              ...action.updates,
            };
            saveAthleteGoals(updated);
            onGoalsUpdated?.(updated);
          }
        } else if (action.type === 'delete_goal') {
          const updated = athleteGoals.filter(
            (g) =>
              (action.goalId ? g.id !== action.goalId : true) &&
              (action.goalName ? !g.name.toLowerCase().includes(action.goalName.toLowerCase()) : true)
          );
          if (updated.length !== athleteGoals.length) {
            saveAthleteGoals(updated);
            onGoalsUpdated?.(updated);
          }
        }
      }

      const coachMsg: CoachChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'model',
        content: res.answer,
        executedAction: res.executedAction,
        confidenceRating: res.confidenceRating,
        groundingSources: res.groundingSources,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      const finalMessages = [...nextMessages, coachMsg];
      setChatMessages(finalMessages);
      saveCoachChatHistory(finalMessages);
    } catch {
      const errorMsg: CoachChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'model',
        content:
          'I had trouble analyzing your latest metrics right now. Please check your network or try again shortly.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setChatMessages([...nextMessages, errorMsg]);
    } finally {
      setIsSendingChat(false);
      setTimeout(() => scrollToBottom(true), 100);
    }
  };

  const handleAskAboutReview = (rev: WorkoutReviewItem) => {
    const prompt = `Coach Gemini, review my workout "${rev.name}" (${rev.sport}) on ${rev.dayOfWeek} ${rev.startDate}: was it too hard, too short, or not hard enough for my current ${rev.periodizationContext}? How did it help my goal or sub-goals?`;
    setActiveSubTab('chat');
    handleSendMessage(prompt);
  };

  const handleConfirmGoalProposal = (msgId: string, action: CoachGoalAction, selectedPriority: 'A' | 'B' | 'C') => {
    if (!action.goal) return;
    const rawGoal = action.goal;
    const goalName = rawGoal.name || 'Chippenham Spring 10 Mile';

    const completeGoal: TrainingGoal = {
      id: rawGoal.id || `goal_${Date.now()}`,
      name: goalName,
      priority: selectedPriority,
      eventType: rawGoal.eventType || 'run',
      status: rawGoal.status || 'upcoming',
      targetType: rawGoal.targetType || (rawGoal.totalTargetTimeSec ? 'time' : 'finish'),
      eventDate: rawGoal.eventDate || '2027-03-07',
      distancePreset: rawGoal.distancePreset || '10 Mile',
      totalDistanceKm: rawGoal.totalDistanceKm ?? 16.093,
      totalTargetTimeSec: rawGoal.totalTargetTimeSec ?? 3600,
      runCourseType: rawGoal.runCourseType || 'road',
      runElevationGainMeters: rawGoal.runElevationGainMeters || 45,
      runTargetPaceSec:
        rawGoal.runTargetPaceSec ||
        (rawGoal.totalTargetTimeSec && rawGoal.totalDistanceKm
          ? Math.round(rawGoal.totalTargetTimeSec / rawGoal.totalDistanceKm)
          : undefined),
      location: rawGoal.location || 'Chippenham, Wiltshire, UK',
      notes: rawGoal.notes || `Target: sub-1 hour (5:59/mile or 3:43/km threshold pace). Priority ${selectedPriority}-Race.`,
      milestones: rawGoal.milestones || [],
      createdAt: new Date().toISOString(),
    };

    const updatedGoals = [...athleteGoals.filter((g) => g.id !== completeGoal.id && g.name.toLowerCase() !== completeGoal.name.toLowerCase()), completeGoal];
    saveAthleteGoals(updatedGoals);
    onGoalsUpdated?.(updatedGoals);

    // Update message action state to confirmed
    const updatedMessages = chatMessages.map((m) => {
      if (m.id === msgId && m.executedAction) {
        return {
          ...m,
          executedAction: {
            ...m.executedAction,
            type: 'add_goal' as const,
            status: 'confirmed' as const,
            goal: completeGoal,
            description: `${completeGoal.name} confirmed as Priority ${selectedPriority} Goal for ${completeGoal.eventDate}.`,
          },
        };
      }
      return m;
    });

    setChatMessages(updatedMessages);
    saveCoachChatHistory(updatedMessages);
  };

  const handleDeleteGoalFromCard = (msgId: string, goalId?: string, goalName?: string) => {
    const goalToDelete = athleteGoals.find(
      (g) => (goalId && g.id === goalId) || (goalName && g.name.toLowerCase().includes(goalName.toLowerCase()))
    );
    if (!goalToDelete) return;

    const updated = athleteGoals.filter((g) => g.id !== goalToDelete.id);
    saveAthleteGoals(updated);
    onGoalsUpdated?.(updated);

    const updatedMessages = chatMessages.map((m) => {
      if (m.id === msgId) {
        return {
          ...m,
          executedAction: {
            type: 'delete_goal' as const,
            goalId: goalToDelete.id,
            goalName: goalToDelete.name,
            goal: goalToDelete,
            status: 'confirmed' as const,
            description: `Deleted "${goalToDelete.name}".`,
          },
        };
      }
      return m;
    });
    setChatMessages(updatedMessages);
    saveCoachChatHistory(updatedMessages);
  };

  const handleUndoDeleteGoal = (msgId: string, goalToRestore?: Partial<TrainingGoal>) => {
    if (!goalToRestore || !goalToRestore.name) return;
    const restored = goalToRestore as TrainingGoal;
    const updated = [...athleteGoals.filter((g) => g.id !== restored.id), restored];
    saveAthleteGoals(updated);
    onGoalsUpdated?.(updated);

    const updatedMessages = chatMessages.map((m) => {
      if (m.id === msgId) {
        return {
          ...m,
          executedAction: {
            type: 'add_goal' as const,
            goal: restored,
            status: 'confirmed' as const,
            description: `Restored "${restored.name}".`,
          },
        };
      }
      return m;
    });
    setChatMessages(updatedMessages);
    saveCoachChatHistory(updatedMessages);
  };

  const handleApplyRunCalibration = async (msgId: string, action: CoachWorkoutCalibrationAction) => {
    setIsApplyingCalibration(msgId);
    try {
      const targetActivity = stravaActivities.find((a) => String(a.id) === String(action.activityId)) || ({
        id: action.activityId,
        name: action.activityName,
        start_date: action.activityDate,
        distance: action.originalDistanceM,
        moving_time: action.recordedDurationSec,
        sport_type: 'Run',
      } as any);

      // Convert CalibratedLapProposal to CalibratedRunSection
      const calibratedSections = action.sections.map((s) => ({
        id: s.id,
        name: s.name,
        durationSec: s.durationSec,
        speedKph: s.speedKph,
        paceMinSec: s.paceMinSec,
        distanceM: s.distanceM,
      }));

      const updatedRecord = await applyRunSectionsCalibration(
        action.activityId,
        calibratedSections,
        action.description || 'Recreated workout with intervals @ 3:30/km via AI Coach',
        targetActivity
      );

      onActivityDetailsUpdated?.(updatedRecord);

      const updatedMessages = chatMessages.map((m) => {
        if (m.id === msgId && m.executedAction && m.executedAction.type === 'recreate_run_workout') {
          return {
            ...m,
            executedAction: {
              ...m.executedAction,
              status: 'applied' as const,
              description: `✓ Applied workout calibration to "${action.activityName}". Laps recreated with 3:30/km intervals.`,
            },
          };
        }
        return m;
      });

      setChatMessages(updatedMessages);
      saveCoachChatHistory(updatedMessages);
    } catch (err) {
      console.error('[Apply Run Calibration Error]', err);
    } finally {
      setIsApplyingCalibration(null);
    }
  };

  const handleOpenCalibrationModal = (action: CoachWorkoutCalibrationAction) => {
    const act = stravaActivities.find((a) => String(a.id) === String(action.activityId)) || ({
      id: action.activityId,
      name: action.activityName,
      start_date: action.activityDate,
      distance: action.originalDistanceM,
      moving_time: action.recordedDurationSec,
      sport_type: 'Run',
    } as any);
    setSelectedCalibrationActivity(act);
    setIsFixDataModalOpen(true);
  };

  const handleSelectClarificationPreset = (preset: {
    label: string;
    description: string;
    activeSec: number;
    recoverySec: number;
    repeats: number;
    recoveryPace?: string;
  }) => {
    const activeFormatted = preset.activeSec === 210 ? '3m 30s (1km)' : formatSecondsToMinSec(preset.activeSec);
    const recFormatted = formatSecondsToMinSec(preset.recoverySec);
    const prompt = `Recreate today's workout with ${preset.repeats} intervals of ${activeFormatted} at 3:30/km and ${recFormatted} recovery at ${preset.recoveryPace || '6:00/km'}`;
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

  const coachModelName =
    coachStatus.model === 'sports-science-engine'
      ? 'Sports Science Physiological Model'
      : `${coachStatus.model
          .replace(/^gemini-/i, 'Gemini ')
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (letter) => letter.toUpperCase())} model`;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Coach Navigation Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="w-full rounded-[12px] border-[0.8px] border-[#324158] bg-white">
          <div className="flex min-h-[40px]">
            {([
              { id: 'chat', label: 'Ask Coach', icon: MessageSquare, iconColor: 'text-indigo-500' },
              { id: 'today', label: "Today's Workout", icon: Flame, iconColor: 'text-orange-500' },
              { id: 'reviews', label: 'Review Workouts', icon: FileText, iconColor: 'text-sky-500' },
              { id: 'benchmarks', label: 'Benchmarks & Sub-Goals', icon: Award, iconColor: 'text-amber-500' },
              { id: 'plan', label: 'Adaptive Plan', icon: Calendar, iconColor: 'text-emerald-500' },
            ] as const).map(({ id, label, icon: Icon, iconColor }, index) => (
              <button
                key={id}
                type="button"
                aria-pressed={activeSubTab === id}
                onClick={() => setActiveSubTab(id)}
                className={`flex-1 min-w-0 px-1.5 sm:px-2 py-2 text-[10px] sm:text-xs font-bold flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 transition-all cursor-pointer ${
                  index > 0 ? 'border-l-[0.8px] border-l-[#0f172b]' : ''
                } ${
                  activeSubTab === id
                    ? 'bg-[#eeeeee] text-slate-900 font-extrabold shadow-[inset_0_2px_4px_rgba(0,0,0,0.18)]'
                    : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} />
                <span className="text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

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
                            <span className={`text-xs font-black ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>{step.phase}</span>
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
              <div className={`flex items-center gap-1 p-1 rounded-xl border text-xs ${
                theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-slate-950/60 border-slate-800'
              }`}>
                <button
                  type="button"
                  onClick={() => setReviewFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    reviewFilter === 'all'
                      ? theme === 'light'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'bg-slate-800 text-white'
                      : theme === 'light'
                        ? 'text-slate-600 hover:text-slate-900'
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
                      ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                      : theme === 'light'
                        ? 'text-slate-600 hover:text-emerald-700'
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
                      ? 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
                      : theme === 'light'
                        ? 'text-slate-600 hover:text-amber-800'
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
                className={`px-3 py-1.5 text-xs font-bold rounded-xl border flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 ${
                  theme === 'light'
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
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
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg border flex items-center gap-1 cursor-pointer transition-colors ${
                          theme === 'light'
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                        }`}
                        title="Ask Coach Gemini to analyze this workout in chat"
                      >
                        <MessageSquare className="w-3 h-3 text-emerald-400" />
                        <span>Discuss with Coach</span>
                      </button>
                    </div>
                  </div>

                  {/* Metrics Summary Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 py-3 text-xs">
                    <div className={`p-2.5 rounded-xl border ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Volume</div>
                      <div className={`text-sm font-black mt-0.5 ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                        {rev.distanceKm > 0 ? `${rev.distanceKm} km` : `${rev.movingTimeMin} min`}
                        <span className="text-[11px] text-slate-400 font-normal ml-1">
                          ({rev.movingTimeMin}m)
                        </span>
                      </div>
                    </div>

                    <div className={`p-2.5 rounded-xl border ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Pace / Speed</div>
                      <div className="text-sm font-black mt-0.5 text-amber-400">
                        {rev.paceFormatted || (rev.speedKmh ? `${rev.speedKmh} km/h` : 'Steady')}
                      </div>
                    </div>

                    <div className={`p-2.5 rounded-xl border ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Power / Watts</div>
                      <div className="text-sm font-black mt-0.5 text-amber-300">
                        {rev.avgWatts ? `${rev.avgWatts}W avg` : 'N/A'}
                      </div>
                    </div>

                    <div className={`p-2.5 rounded-xl border ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
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

                    <div className={`p-2.5 rounded-xl border ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'}`}>
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Training Stress</div>
                      <div className="text-sm font-black mt-0.5 text-orange-400">
                        {rev.tss ? `${rev.tss} TSS` : 'Light'}
                      </div>
                    </div>
                  </div>

                  {/* Streams & Physiological Analysis Strip */}
                  <div className={`mt-1 p-3 rounded-xl border space-y-2 text-xs ${
                    theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                  }`}>
                    <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] font-bold pb-1.5 border-b border-slate-800/80">
                      <div className={`flex items-center gap-1.5 ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>
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
                    <div className={`space-y-1 leading-relaxed text-[11px] ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>
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
                    <div className={`p-3 rounded-xl border ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'}`}>
                      <span className="text-[10px] uppercase font-bold text-sky-400 block mb-1">
                        📊 Periodization Fit ({rev.periodizationContext}):
                      </span>
                      <p className={`leading-relaxed text-[11px] ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>
                        {rev.periodizationFit}
                      </p>
                    </div>

                    <div className={`p-3 rounded-xl border ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'}`}>
                      <span className="text-[10px] uppercase font-bold text-indigo-400 block mb-1">
                        🎯 Goal & Sub-Goal Contribution:
                      </span>
                      <p className={`leading-relaxed text-[11px] ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>
                        {rev.goalContribution}
                        {rev.subGoalContribution ? ` • ${rev.subGoalContribution}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Coach Takeaway & Actionable Adjustment */}
                  <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className={`space-y-0.5 ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>
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
              <h3 className={`text-xs font-black uppercase tracking-wider ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>
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
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
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
                              : theme === 'light'
                                ? 'bg-slate-100 text-slate-600'
                                : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {b.status === 'achieved' ? 'Achieved' : `${b.progressPct}%`}
                        </span>
                      </div>

                      <h4 className={`text-sm font-black mt-2 ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>{b.title}</h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">{b.description}</p>

                      {/* Progress Bar */}
                      <div className="mt-3 space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <span className="text-slate-400">Current Best:</span>
                          <span className={theme === 'light' ? 'text-slate-900' : 'text-white'}>
                            {b.currentValue} / {b.targetValue} {b.unit}
                          </span>
                        </div>
                        <div className={`w-full h-2 rounded-full overflow-hidden ${theme === 'light' ? 'bg-slate-200' : 'bg-slate-800'}`}>
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${b.progressPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Best Recorded Workout */}
                      {b.bestEffortActivity && (
                        <div className={`mt-3 p-2 rounded-xl border text-[11px] ${
                          theme === 'light'
                            ? 'bg-slate-50 border-slate-200 text-slate-700'
                            : 'bg-slate-950/60 border-slate-800 text-slate-300'
                        }`}>
                          <span className={`block text-[10px] uppercase font-bold ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                            Logged in Activities:
                          </span>
                          <span className="font-extrabold text-emerald-400">
                            {b.bestEffortActivity.name}
                          </span>{' '}
                          ({b.bestEffortActivity.metricValue} on {b.bestEffortActivity.date})
                        </div>
                      )}
                    </div>

                    <div className={`mt-3 pt-2 border-t text-[11px] italic ${
                      theme === 'light' ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'
                    }`}>
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
              <h3 className={`text-xs font-black uppercase tracking-wider ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>
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
                      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-800">
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
                              : 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30'
                          }`}
                        >
                          {b.status === 'achieved' ? 'Target Reached' : `Progress: ${b.progressPct}%`}
                        </span>
                      </div>

                      <h4 className={`text-sm sm:text-base font-black mt-2 ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>{b.title}</h4>
                      <p className={`text-xs mt-1 leading-relaxed ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>{b.description}</p>

                      {/* Progress Bar */}
                      <div className="mt-3.5 space-y-1">
                        <div className={`w-full h-2 rounded-full overflow-hidden ${theme === 'light' ? 'bg-slate-200' : 'bg-slate-800'}`}>
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-indigo-500 rounded-full transition-all duration-500"
                            style={{ width: `${b.progressPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Sports Science Rationale Callout */}
                      <div className={`mt-3 p-3 rounded-xl border text-xs space-y-1 ${
                        theme === 'light'
                          ? 'bg-slate-50 border-slate-200 text-slate-700'
                          : 'bg-slate-950/80 border-slate-800 text-slate-300'
                      }`}>
                        <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px]">
                          <Zap className="w-3.5 h-3.5 shrink-0" />
                          <span>Sports Science ROI (Why this gains the most time):</span>
                        </div>
                        <p className={`text-[11px] leading-relaxed ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>
                          {b.whyItMatters}
                        </p>
                      </div>
                    </div>

                    {b.bestEffortActivity && (
                      <div className={`mt-3 pt-2 border-t text-[11px] flex items-center justify-between ${
                        theme === 'light' ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'
                      }`}>
                        <span>Latest Best Effort:</span>
                        <span className={`font-extrabold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
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
                    <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                      {savedPlan.periodizationPhase}
                    </span>
                    <p className={`text-xs pt-1 leading-relaxed ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>
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
                  <div className={`mt-3 pt-3 border-t flex flex-wrap gap-2 text-xs ${
                    theme === 'light' ? 'border-slate-200' : 'border-slate-800'
                  }`}>
                    {savedPlan.keyFocusAreas.map((area, i) => (
                      <span
                        key={i}
                        className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${
                          theme === 'light'
                            ? 'bg-white text-slate-700 border-slate-200'
                            : 'bg-slate-950 text-slate-300 border-slate-800'
                        }`}
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
                      <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-slate-200 dark:border-slate-800/60">
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

                    <div className={`mt-3 pt-2 border-t flex items-center justify-between text-[10px] font-bold ${
                      theme === 'light' ? 'border-slate-200 text-slate-500' : 'border-slate-800/60 text-slate-400'
                    }`}>
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
      {/* 6. SUB-TAB: ASK COACH GEMINI (RUNVIA-GRADE ADVISORY) */}
      {/* ========================================================= */}
      {activeSubTab === 'chat' && (
        <div className="relative space-y-4">
          {/* Runvia Pill Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2 p-1.5 pl-3 bg-white border border-slate-300 rounded-full shadow-sm transition-all focus-within:border-amber-400"
          >
            <button
              type="button"
              onClick={() => setShowQuickActions(!showQuickActions)}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors cursor-pointer shrink-0"
              title="Quick actions"
            >
              <Plus className="w-4 h-4" />
            </button>

            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask your coach..."
              disabled={isSendingChat}
              className="flex-1 bg-transparent text-xs sm:text-sm text-slate-900 placeholder-slate-500 outline-none px-2"
            />

            <button
              type="button"
              onClick={handleToggleListen}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                isListening
                  ? 'bg-red-500/20 text-red-500 animate-pulse'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
              title={isListening ? 'Listening... click to stop' : 'Voice input'}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <button
              type="submit"
              disabled={!chatInput.trim() || isSendingChat}
              className="w-9 h-9 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center transition-transform active:scale-95 disabled:opacity-40 cursor-pointer shrink-0 shadow-md"
              title="Send to Coach"
            >
              <Send className="w-4 h-4 fill-slate-950" />
            </button>
          </form>

          {/* Quick Actions Popover (when + is clicked) */}
          {showQuickActions && (
            <div
              className={`p-3 rounded-2xl border shadow-2xl space-y-1.5 z-20 ${
                theme === 'light'
                  ? 'bg-white border-slate-200 text-slate-700'
                  : 'bg-zinc-900 border-zinc-700/80 text-zinc-300'
              }`}
            >
              <div
                className={`flex items-center justify-between pb-1.5 border-b text-[11px] font-bold ${
                  theme === 'light' ? 'border-slate-200 text-slate-500' : 'border-zinc-800 text-zinc-400'
                }`}
              >
                <span>Runvia Endurance Coaching Actions</span>
                <button
                  type="button"
                  onClick={() => setShowQuickActions(false)}
                  className={`p-1 cursor-pointer ${
                    theme === 'light' ? 'hover:text-slate-900' : 'hover:text-white'
                  }`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              {[
                {
                  title: '🏊 Frame Swim vs Flat Ironman 2028',
                  desc: 'Weigh short speed intervals vs 3.8km continuous endurance',
                  query:
                    'in the future, when we look at activities can we frame the analysis in the context of the week and hitting long term goals. For example my swimming is often short intervals with long 30-45 second rest periods 50m/100m/200m, where i am stronger conpared to 4x400m with 20 seconds rest which would suit a 1.9km or 3.8km swim better.',
                },
                {
                  title: '⭐ Rate Last 10 Days of Swimming',
                  desc: 'Session volume, speed/efficiency, and 2028 Ironman confidence rating',
                  query:
                    'Could you rate my last 10 days of swimming relative to my new 2028 Ironman objective?',
                },
                {
                  title: '🎯 Add Goal: Flat Ironman June 18, 2028',
                  desc: 'Persists Priority C full-distance objective to athlete profile',
                  query: 'Add new long-term goal Flat Ironman June 18, 2028 Priority C',
                },
                {
                  title: '⏱️ Deep Lap & Stream Heart Rate Drift',
                  desc: 'Zone distribution, 200m push, and cardiac recovery drop',
                  query:
                    "Can you analyze yesterday's swim session in detail: lap paces, TSS, interval heart rate drift, and zone distribution?",
                },
                {
                  title: '🏃 Progress Thursday Run Workouts',
                  desc: 'Review past 2 Thursdays and adapt threshold pacing',
                  query: 'How should i progress my run workouts from the last 2 thursdays.',
                },
                {
                  title: '⚡ 4h 30m Half Ironman: Run vs TT Aero Gain',
                  desc: 'Comparative aerodynamic vs run threshold ROI',
                  query:
                    'For a goal time of 4hrs 30min for a half IronMan would I gain most by working on my run distance or time spent in the TT position on the bike?',
                },
              ].map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(item.query)}
                  className={`w-full text-left p-2 rounded-xl transition-colors flex flex-col cursor-pointer ${
                    theme === 'light' ? 'hover:bg-slate-100' : 'hover:bg-zinc-800'
                  }`}
                >
                  <span className={`text-xs font-bold ${theme === 'light' ? 'text-slate-800' : 'text-zinc-100'}`}>{item.title}</span>
                  <span className={`text-[10px] ${theme === 'light' ? 'text-slate-500' : 'text-zinc-400'}`}>{item.desc}</span>
                </button>
              ))}
            </div>
          )}

          {/* Quick Prompt Chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Quick prompts:</span>
            {[
              {
                label: "⚡ I did today's run at 3:30/km",
                query: 'I did todays run at 3:30/km',
              },
              {
                label: '🏃 Chippenham 10 Mile Under 1h',
                query: 'I want to run under 1 hour a Chippenham Spring 10 mile',
              },
              {
                label: '✏️ Edit Chippenham to 58m',
                query: 'Change the Chippenham Spring 10 Mile target time to 58 minutes',
              },
              {
                label: '🗑️ Delete Chippenham Goal',
                query: 'Delete the Chippenham Spring 10 Mile race goal',
              },
              {
                label: '🏊 Frame Swim vs 2028 Ironman',
                query:
                  'in the future, when we look at activities can we frame the analysis in the context of the week and hitting long term goals. For example my swimming is often short intervals with long 30-45 second rest periods 50m/100m/200m, where i am stronger conpared to 4x400m with 20 seconds rest which would suit a 1.9km or 3.8km swim better.',
              },
              {
                label: '⭐ Rate Last 10 Days Swimming',
                query: 'Could you rate my last 10 days of swimming relative to my new 2028 Ironman objective?',
              },
              {
                label: '🎯 Add Goal: Flat Ironman June 2028',
                query: 'Add new long-term goal Flat Ironman June 18, 2028 Priority C',
              },
              {
                label: '⏱️ Deep Lap & HR Drift Analysis',
                query: "Can you analyze yesterday's swim session in detail: lap paces, TSS, interval heart rate drift, and zone distribution?",
              },
              {
                label: '🏃 Progress Thursday Run Workouts',
                query: 'How should i progress my run workouts from the last 2 thursdays.',
              },
              {
                label: '⚡ 4h 30m 70.3: Run vs TT Aero Gains',
                query: 'For a goal time of 4hrs 30min for a half IronMan would I gain most by working on my run distance or time spent in the TT position on the bike?',
              },
              {
                label: '📋 Check Coach Athlete Profile Access',
                query: 'Does Coach Gemini have access to my details in the Athlete tab, periodization cycle, current injuries & limitations, training availability & work schedule?',
              },
            ].map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSendMessage(p.query)}
                disabled={isSendingChat}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all text-left cursor-pointer disabled:opacity-50 font-medium ${
                  theme === 'light'
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    : 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 border-zinc-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Chat Messages Container */}
          <div
            ref={chatContainerRef}
            onScroll={handleChatScroll}
            className={`p-4 md:p-6 rounded-2xl border min-h-[460px] max-h-[620px] overflow-y-auto space-y-4 transition-colors ${
              theme === 'light'
                ? 'bg-white border-slate-200 shadow-sm'
                : 'bg-[#101012] border-zinc-800/80 shadow-2xl'
            }`}
          >
            {chatMessages.length === 0 ? (
              <div className={`h-64 flex flex-col items-center justify-center text-center text-xs px-4 ${
                theme === 'light' ? 'text-slate-500' : 'text-zinc-400'
              }`}>
                <div className="w-12 h-12 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mb-3">
                  <Sparkles className="w-6 h-6 text-amber-400" />
                </div>
                <p className={`text-base font-bold ${theme === 'light' ? 'text-slate-800' : 'text-zinc-200'}`}>
                  Runvia-Grade AI Endurance Coach
                </p>
                <p className={`text-xs mt-1 max-w-lg leading-relaxed ${theme === 'light' ? 'text-slate-500' : 'text-zinc-400'}`}>
                  Ask anything about multi-year Ironman progressions, stream heart rate drift, swim rest interval specificity, Thursday tempo workouts, or add goals directly via conversation.
                </p>
              </div>
            ) : (
              chatMessages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} w-full`}
                  >
                    {isUser ? (
                      <div className="max-w-[85%] sm:max-w-[75%] p-3.5 rounded-2xl bg-[#feefc3] text-slate-900 border border-[#eadba5] text-xs sm:text-sm leading-relaxed rounded-br-xs shadow-md">
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                        <div className="text-[10px] text-slate-600 text-right mt-1.5 opacity-80">
                          {msg.timestamp}
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`w-full max-w-[95%] p-4 sm:p-5 rounded-2xl border text-xs sm:text-sm leading-relaxed space-y-3 rounded-bl-xs shadow-md ${
                          theme === 'light'
                            ? 'bg-slate-50 border-slate-200 text-slate-800'
                            : 'bg-zinc-950/80 border-zinc-800 text-zinc-200'
                        }`}
                      >
                        {/* Confidence Rating Badge if present */}
                        {(msg.confidenceRating || msg.content.includes('High Confidence')) && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400/15 border border-amber-400/30 text-amber-300">
                            <span>★</span>
                            <span>{msg.confidenceRating || 'High Confidence 8.5/10'}</span>
                          </div>
                        )}

                        {/* Executed Action Cards for Goal Races */}
                        {msg.executedAction?.type === 'propose_goal' && msg.executedAction.goal && (
                          <div className={`p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs space-y-3 shadow-md animate-in fade-in duration-200 ${
                            theme === 'light' ? 'text-slate-800' : 'text-zinc-200'
                          }`}>
                            <div className="flex items-center justify-between gap-2 pb-2 border-b border-amber-500/20">
                              <div className="flex items-center gap-2">
                                <span className="p-1 rounded bg-amber-400/20 text-amber-300 font-bold">
                                  <Target className="w-4 h-4" />
                                </span>
                                <div>
                                  <span className="font-bold text-amber-300">Goal Race Found via Web Search</span>
                                  <div className={`text-[10px] ${theme === 'light' ? 'text-slate-600' : 'text-zinc-400'}`}>Action Required: Select Race Priority</div>
                                </div>
                              </div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/40 animate-pulse">
                                Priority Needed
                              </span>
                            </div>

                            <div>
                              <div className={`font-black text-sm sm:text-base ${theme === 'light' ? 'text-slate-900' : 'text-zinc-100'}`}>
                                {msg.executedAction.goal.name}
                              </div>
                              <div className={`text-[11px] mt-1.5 flex flex-wrap gap-x-4 gap-y-1 ${theme === 'light' ? 'text-slate-700' : 'text-zinc-300'}`}>
                                <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                                  <Calendar className="w-3.5 h-3.5" />
                                  {msg.executedAction.goal.eventDate || 'March 2027'}
                                </span>
                                <span className={`flex items-center gap-1 ${theme === 'light' ? 'text-slate-700' : 'text-zinc-300'}`}>
                                  <Clock className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-slate-500' : 'text-zinc-400'}`} />
                                  {msg.executedAction.goal.distancePreset || `${msg.executedAction.goal.totalDistanceKm} km`}
                                </span>
                                <span className="flex items-center gap-1 text-amber-400 font-bold">
                                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                                  Target: {msg.executedAction.goal.totalTargetTimeSec ? `${Math.floor(msg.executedAction.goal.totalTargetTimeSec / 3600)}h ${Math.floor((msg.executedAction.goal.totalTargetTimeSec % 3600) / 60).toString().padStart(2, '0')}m (${formatPaceSec(msg.executedAction.goal.runTargetPaceSec)})` : 'Finish'}
                                </span>
                              </div>
                              {msg.executedAction.goal.location && (
                                <div className={`text-[11px] mt-1 flex items-center gap-1 ${theme === 'light' ? 'text-slate-600' : 'text-zinc-400'}`}>
                                  <Compass className={`w-3.5 h-3.5 shrink-0 ${theme === 'light' ? 'text-slate-500' : 'text-zinc-500'}`} />
                                  <span>{msg.executedAction.goal.location}</span>
                                </div>
                              )}
                            </div>

                            {/* Priority Selection Buttons */}
                            <div className="pt-2 border-t border-amber-500/20 space-y-1.5">
                              <span className={`text-[11px] font-bold block ${theme === 'light' ? 'text-slate-700' : 'text-zinc-300'}`}>
                                What priority would you like to set for this race?
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleConfirmGoalProposal(msg.id, msg.executedAction as CoachGoalAction, 'A')}
                                  className="px-3 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border border-emerald-500/40 text-left font-bold transition-all cursor-pointer flex flex-col group"
                                >
                                  <span className="text-xs flex items-center gap-1 font-extrabold">
                                    ★ Priority A-Race
                                  </span>
                                  <span className="text-[10px] opacity-75 group-hover:opacity-95 font-normal">
                                    Primary Peak Goal
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleConfirmGoalProposal(msg.id, msg.executedAction as CoachGoalAction, 'B')}
                                  className="px-3 py-2 rounded-lg bg-indigo-500/20 hover:bg-indigo-500 text-indigo-300 hover:text-white border border-indigo-500/40 text-left font-bold transition-all cursor-pointer flex flex-col group"
                                >
                                  <span className="text-xs flex items-center gap-1 font-extrabold">
                                    ✦ Priority B-Race
                                  </span>
                                  <span className="text-[10px] opacity-75 group-hover:opacity-95 font-normal">
                                    Major Tune-Up
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleConfirmGoalProposal(msg.id, msg.executedAction as CoachGoalAction, 'C')}
                                  className={`px-3 py-2 rounded-lg border text-left font-bold transition-all cursor-pointer flex flex-col group ${
                                    theme === 'light'
                                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border-zinc-700'
                                  }`}
                                >
                                  <span className="text-xs flex items-center gap-1 font-extrabold">
                                    ○ Priority C-Race
                                  </span>
                                  <span className="text-[10px] opacity-75 group-hover:opacity-95 font-normal">
                                    Training Effort
                                  </span>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Executed Action Card: Goal Added */}
                        {msg.executedAction?.type === 'add_goal' && (
                          <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs space-y-2 animate-in fade-in duration-200">
                            <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-emerald-500/20">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold">
                                  ✓
                                </span>
                                <span className="font-bold text-emerald-300">Goal Race Saved to Profile</span>
                              </div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                Priority {msg.executedAction.goal?.priority || 'A'}
                              </span>
                            </div>

                            <div className={`font-black text-sm ${theme === 'light' ? 'text-slate-900' : 'text-zinc-100'}`}>
                              {msg.executedAction.goal?.name}
                            </div>

                            <div className={`text-[11px] flex flex-wrap gap-x-4 gap-y-0.5 ${theme === 'light' ? 'text-slate-700' : 'text-zinc-300'}`}>
                              <span>📅 Date: {msg.executedAction.goal?.eventDate}</span>
                              <span>
                                🎯 Target:{' '}
                                {msg.executedAction.goal?.totalTargetTimeSec
                                  ? `${Math.floor(msg.executedAction.goal.totalTargetTimeSec / 3600)}h ${Math.floor((msg.executedAction.goal.totalTargetTimeSec % 3600) / 60).toString().padStart(2, '0')}m`
                                  : msg.executedAction.goal?.eventType === 'triathlon'
                                  ? '3.8k Swim · 180k Bike · 42.2k Run'
                                  : 'Finish'}
                              </span>
                              {msg.executedAction.goal?.runTargetPaceSec && (
                                <span className="text-amber-400 font-bold">
                                  Pace: {formatPaceSec(msg.executedAction.goal.runTargetPaceSec)}
                                </span>
                              )}
                            </div>

                            <div className="mt-2 pt-2 border-t border-emerald-500/20 flex items-center justify-between gap-2">
                              <span className="text-[10px] text-emerald-400 font-medium">
                                ✓ Synced with Athlete Goals & Periodization
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => onOpenSettings('goals')}
                                  className={`text-[10px] font-bold px-2 py-1 rounded border cursor-pointer transition-colors ${
                                    theme === 'light'
                                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                                  }`}
                                >
                                  View in Goals
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const ga = msg.executedAction as CoachGoalAction;
                                    handleDeleteGoalFromCard(
                                      msg.id,
                                      ga?.goal?.id,
                                      ga?.goal?.name
                                    );
                                  }}
                                  className="text-[10px] font-bold px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 cursor-pointer transition-colors"
                                  title="Remove this goal"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Executed Action Card: Goal Updated */}
                        {msg.executedAction?.type === 'update_goal' && (
                          <div className="p-3.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-xs space-y-2 animate-in fade-in duration-200">
                            <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-indigo-500/20">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">
                                  ✎
                                </span>
                                <span className="font-bold text-indigo-300">Goal Race Updated</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => onOpenSettings('goals')}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded border cursor-pointer ${
                                  theme === 'light'
                                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                                }`}
                              >
                                View in Goals
                              </button>
                            </div>
                            <div className={`font-bold text-sm ${theme === 'light' ? 'text-slate-900' : 'text-zinc-100'}`}>
                              {msg.executedAction.goalName}
                            </div>
                            <div className={`text-[11px] ${theme === 'light' ? 'text-slate-700' : 'text-zinc-300'}`}>
                              {msg.executedAction.description}
                            </div>
                          </div>
                        )}

                        {/* Executed Action Card: Goal Deleted */}
                        {msg.executedAction?.type === 'delete_goal' && (
                          <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs space-y-2 animate-in fade-in duration-200">
                            <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-rose-500/20">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-xs font-bold">
                                  ✕
                                </span>
                                <span className="font-bold text-rose-300">Goal Race Removed</span>
                              </div>
                              {(msg.executedAction as CoachGoalAction).goal && (
                                <button
                                  type="button"
                                  onClick={() => handleUndoDeleteGoal(msg.id, (msg.executedAction as CoachGoalAction)?.goal)}
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded border cursor-pointer ${
                                    theme === 'light'
                                      ? 'bg-slate-100 hover:bg-slate-200 text-emerald-700 border-slate-300'
                                      : 'bg-zinc-800 hover:bg-zinc-700 text-emerald-400 border-zinc-700'
                                  }`}
                                >
                                  Undo
                                </button>
                              )}
                            </div>
                            <div className={`font-bold text-sm ${theme === 'light' ? 'text-slate-900' : 'text-zinc-100'}`}>
                              {msg.executedAction.goalName}
                            </div>
                            <div className={`text-[11px] ${theme === 'light' ? 'text-slate-600' : 'text-zinc-400'}`}>
                              {msg.executedAction.description || 'Removed from athlete profile.'}
                            </div>
                          </div>
                        )}

                        {/* Executed Action Card: Recreate Run Workout via Fix Data (+Add Lap) */}
                        {msg.executedAction?.type === 'recreate_run_workout' && (
                          <div className={`p-4 rounded-xl border border-cyan-500/40 border-l-4 border-l-cyan-400 text-xs space-y-3.5 shadow-xl animate-in fade-in duration-200 ${
                            theme === 'light'
                              ? 'bg-gradient-to-br from-cyan-50 via-white to-slate-50 text-slate-800'
                              : 'bg-gradient-to-br from-cyan-950/40 via-zinc-900/60 to-zinc-900 text-zinc-200'
                          }`}>
                            {/* Header */}
                            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-cyan-500/20">
                              <div className="flex items-center gap-2">
                                <span className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                                  <Sliders className="w-4 h-4" />
                                </span>
                                <div>
                                  <div className={`font-bold flex items-center gap-1.5 ${theme === 'light' ? 'text-cyan-800' : 'text-cyan-200'}`}>
                                    <span>Fix Data &rsaquo; +Add Lap Pace Recreation</span>
                                  </div>
                                  <div className={`text-[10px] ${theme === 'light' ? 'text-slate-500' : 'text-zinc-400'}`}>
                                    Reconstructing intervals at {msg.executedAction.targetIntervalPace} ({(msg.executedAction.targetIntervalSpeedKph || 17.14).toFixed(1)} km/h)
                                  </div>
                                </div>
                              </div>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                                msg.executedAction.status === 'applied'
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 animate-pulse'
                              }`}>
                                {msg.executedAction.status === 'applied' ? '✓ Calibration Applied' : 'Laps Ready To Apply'}
                              </span>
                            </div>

                            {/* Activity Meta & Time Discrepancy Overview */}
                            <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] p-2.5 rounded-lg border ${
                              theme === 'light'
                                ? 'bg-white/80 border-slate-200'
                                : 'bg-black/40 border-zinc-800'
                            }`}>
                              <div>
                                <span className={`text-[10px] block font-medium ${theme === 'light' ? 'text-slate-500' : 'text-zinc-400'}`}>Activity</span>
                                <span className={`font-bold truncate block ${theme === 'light' ? 'text-slate-900' : 'text-zinc-100'}`}>{msg.executedAction.activityName}</span>
                              </div>
                              <div>
                                <span className={`text-[10px] block font-medium ${theme === 'light' ? 'text-slate-500' : 'text-zinc-400'}`}>Recorded Time</span>
                                <span className="font-bold text-cyan-300">
                                  {Math.floor(msg.executedAction.recordedDurationSec / 60)}m {Math.round(msg.executedAction.recordedDurationSec % 60)}s
                                </span>
                              </div>
                              <div>
                                <span className={`text-[10px] block font-medium ${theme === 'light' ? 'text-slate-500' : 'text-zinc-400'}`}>Recreated Distance</span>
                                <span className="font-bold text-emerald-400">
                                  {(msg.executedAction.recalculatedDistanceM / 1000).toFixed(2)} km
                                </span>
                              </div>
                              <div>
                                <span className={`text-[10px] block font-medium ${theme === 'light' ? 'text-slate-500' : 'text-zinc-400'}`}>Time Discrepancy</span>
                                <span className="font-bold text-emerald-300 flex items-center gap-1">
                                  <Check className="w-3 h-3 text-emerald-400 inline" />
                                  <span>0s (Stream Matched)</span>
                                </span>
                              </div>
                            </div>

                            {/* Core Interval Assumption Callout */}
                            <div className={`text-[11px] p-2.5 rounded-lg border leading-relaxed ${
                              theme === 'light'
                                ? 'bg-amber-50 border-amber-200 text-amber-900'
                                : 'bg-amber-500/10 border-amber-500/25 text-amber-200/90'
                            }`}>
                              <span className={`font-bold block mb-0.5 ${theme === 'light' ? 'text-amber-800' : 'text-amber-300'}`}>🧠 Coach Interval Assumption:</span>
                              We assume your <strong className={theme === 'light' ? 'text-amber-900' : 'text-amber-200'}>{msg.executedAction.targetIntervalPace}</strong> pace was executed on the <strong>active interval bouts</strong> of the workout, with recovery jogged at <strong>{msg.executedAction.recoveryPace || '6:00/km'}</strong> and cool-down auto-extended so there is <strong>zero time discrepancy</strong> with the original stream.
                            </div>

                            {/* Follow-up Questions for Time Discrepancy Avoidance */}
                            {msg.executedAction.status !== 'applied' && (
                              <div className="space-y-2 pt-1 border-t border-cyan-500/20">
                                <span className={`text-[11px] font-bold block ${theme === 'light' ? 'text-slate-800' : 'text-zinc-200'}`}>
                                  Follow-up Questions to Verify Exact Interval Breakdown:
                                </span>
                                <div className={`space-y-1 text-[11px] p-2.5 rounded-lg border ${
                                  theme === 'light'
                                    ? 'text-slate-700 bg-white border-slate-200'
                                    : 'text-zinc-300 bg-zinc-900/70 border-zinc-800'
                                }`}>
                                  <div className="flex items-start gap-1.5">
                                    <span className="text-amber-400 font-bold">1.</span>
                                    <span><strong>Active & Recovery Times:</strong> What active interval and recovery duration did you run? (e.g. 4 x 1km @ 3:30, 5 x 3 min)</span>
                                  </div>
                                  <div className="flex items-start gap-1.5">
                                    <span className="text-amber-400 font-bold">2.</span>
                                    <span><strong>Recovery Pace:</strong> What pace was the recovery done at? (e.g. 6:00/km jog, 10 km/h, or walk)</span>
                                  </div>
                                  <div className="flex items-start gap-1.5">
                                    <span className="text-amber-400 font-bold">3.</span>
                                    <span><strong>Warm-up & Cool-down:</strong> How long were the warm-up and cool-down portions?</span>
                                  </div>
                                </div>

                                {/* Clickable Clarification Option Chips */}
                                {msg.executedAction.clarificationOptions && msg.executedAction.clarificationOptions.length > 0 && (
                                  <div className="pt-1 space-y-1.5">
                                    <span className={`text-[10px] font-bold uppercase tracking-wider block ${theme === 'light' ? 'text-slate-500' : 'text-zinc-400'}`}>
                                      Select Preset Configuration:
                                    </span>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                                      {msg.executedAction.clarificationOptions.map((opt, oIdx) => (
                                        <button
                                          key={oIdx}
                                          type="button"
                                          onClick={() => handleSelectClarificationPreset(opt)}
                                          className={`p-2 rounded-lg border hover:border-cyan-500/50 text-left transition-all cursor-pointer group ${
                                            theme === 'light'
                                              ? 'bg-white hover:bg-cyan-50 border-slate-200'
                                              : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700/80'
                                          }`}
                                        >
                                          <div className="font-bold text-cyan-300 text-xs group-hover:text-cyan-200">
                                            {opt.label}
                                          </div>
                                          <div className={`text-[10px] line-clamp-1 ${
                                            theme === 'light'
                                              ? 'text-slate-500 group-hover:text-slate-700'
                                              : 'text-zinc-400 group-hover:text-zinc-300'
                                          }`}>
                                            {opt.description}
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Lap Breakdown Table (+Add Lap Style) */}
                            <div className="space-y-1.5 pt-1">
                              <span className={`text-[11px] font-bold flex items-center justify-between ${theme === 'light' ? 'text-slate-700' : 'text-zinc-300'}`}>
                                <span>Recreated Laps Breakdown (+Add Lap format):</span>
                                <span className={`text-[10px] font-normal ${theme === 'light' ? 'text-slate-500' : 'text-zinc-400'}`}>
                                  {msg.executedAction.sections.length} Laps &middot; {msg.executedAction.recalculatedAvgPace} avg pace
                                </span>
                              </span>
                              <div className={`max-h-48 overflow-y-auto rounded-lg border divide-y text-[11px] ${
                                theme === 'light'
                                  ? 'border-slate-200 bg-white divide-slate-200'
                                  : 'border-zinc-800 bg-black/60 divide-zinc-800'
                              }`}>
                                {msg.executedAction.sections.map((sec, sIdx) => {
                                  const isInterval = sec.isInterval || sec.name.toLowerCase().includes('interval') || sec.name.toLowerCase().includes('active');
                                  const isRecovery = sec.isRecovery || sec.name.toLowerCase().includes('recovery');
                                  const isCool = sec.name.toLowerCase().includes('cool-down');
                                  return (
                                    <div
                                      key={sec.id || sIdx}
                                      className={`px-3 py-1.5 flex items-center justify-between gap-2 ${
                                        isInterval
                                        ? `bg-cyan-500/10 ${theme === 'light' ? 'text-cyan-800' : 'text-cyan-200'} font-medium`
                                          : isRecovery
                                          ? theme === 'light'
                                            ? 'bg-slate-50 text-slate-500'
                                            : 'bg-zinc-900/50 text-zinc-400'
                                          : isCool
                                          ? `bg-emerald-500/10 ${theme === 'light' ? 'text-emerald-800' : 'text-emerald-300'}`
                                          : theme === 'light'
                                          ? 'text-slate-700'
                                          : 'text-zinc-300'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className={`text-[10px] font-mono opacity-60 w-4 ${theme === 'light' ? 'text-slate-500' : ''}`}>{sIdx + 1}.</span>
                                        <span className="truncate font-semibold">{sec.name}</span>
                                        {isInterval && (
                                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-cyan-400/20 border border-cyan-400/30 ${theme === 'light' ? 'text-cyan-800' : 'text-cyan-300'}`}>
                                            Active
                                          </span>
                                        )}
                                        {isRecovery && (
                                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-medium border ${
                                            theme === 'light'
                                              ? 'bg-slate-100 text-slate-600 border-slate-300'
                                              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                                          }`}>
                                            Rest
                                          </span>
                                        )}
                                        {isCool && (
                                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-medium bg-emerald-500/20 border border-emerald-500/30 ${theme === 'light' ? 'text-emerald-800' : 'text-emerald-300'}`}>
                                            0s disc
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-3 shrink-0 font-mono text-[10px]">
                                        <span>{Math.floor(sec.durationSec / 60)}m {(sec.durationSec % 60).toString().padStart(2, '0')}s</span>
                                        <span className={`font-bold ${theme === 'light' ? 'text-slate-800' : 'text-zinc-200'}`}>{sec.paceMinSec || `${(3600 / sec.speedKph).toFixed(0)}s`}</span>
                                        <span className={theme === 'light' ? 'text-slate-500' : 'text-zinc-400'}>{sec.speedKph.toFixed(1)} km/h</span>
                                        <span className={`w-12 text-right ${theme === 'light' ? 'text-slate-600' : 'text-zinc-300'}`}>{sec.distanceM ? `${(sec.distanceM / 1000).toFixed(2)}km` : '-'}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="pt-2 border-t border-cyan-500/20 flex flex-wrap items-center justify-between gap-2">
                              {msg.executedAction.status === 'applied' ? (
                                <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                  <span>Recreated workout successfully applied and saved!</span>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleApplyRunCalibration(msg.id, msg.executedAction as CoachWorkoutCalibrationAction)}
                                  disabled={isApplyingCalibration === msg.id}
                                  className="px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs transition-all cursor-pointer shadow-md flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                                >
                                  {isApplyingCalibration === msg.id ? (
                                    <>
                                      <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                                      <span>Applying Calibration...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Zap className="w-3.5 h-3.5 fill-slate-950" />
                                      <span>Apply Recreated Workout to Run</span>
                                    </>
                                  )}
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleOpenCalibrationModal(msg.executedAction as CoachWorkoutCalibrationAction)}
                                className={`px-3 py-1.5 rounded-lg border font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 ${
                                  theme === 'light'
                                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                                }`}
                              >
                                <Sliders className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-slate-500' : 'text-zinc-400'}`} />
                                <span>Open in Fix Data Modal</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Message Formatted Body */}
                        <div className="space-y-2.5">
                          {msg.content
                            .replace(/```action[\s\S]*?```/g, '')
                            .split('\n\n')
                            .map((para, pIdx) => {
                              const lines = para.split('\n');
                              return (
                                <div key={pIdx} className="space-y-1.5">
                                  {lines.map((line, lIdx) => {
                                    const trimmed = line.trim();
                                    if (!trimmed) return null;

                                    // Numbered list item: "1. Energy System Transition: ..."
                                    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
                                    if (numMatch) {
                                      const num = numMatch[1];
                                      const rest = numMatch[2];
                                      return (
                                        <div key={lIdx} className="flex items-start gap-2 pt-1">
                                          <span className="text-amber-400 font-bold text-xs shrink-0 mt-0.5">
                                            {num}.
                                          </span>
                                          <div className="leading-relaxed">
                                            {rest.split(/(\*\*.*?\*\*)/g).map((part, i) =>
                                              part.startsWith('**') && part.endsWith('**') ? (
                                                <strong
                                                  key={i}
                                                  className={`font-bold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}
                                                >
                                                  {part.slice(2, -2)}
                                                </strong>
                                              ) : (
                                                <span key={i}>{part}</span>
                                              )
                                            )}
                                          </div>
                                        </div>
                                      );
                                    }

                                    // Bullet item: "- " or "• "
                                    if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
                                      const bulletText = trimmed.replace(/^[-•]\s*/, '');
                                      return (
                                        <div key={lIdx} className="flex items-start gap-2 pl-1">
                                          <span className="text-amber-400 font-bold shrink-0 mt-0.5">•</span>
                                          <div className="leading-relaxed">
                                            {bulletText.split(/(\*\*.*?\*\*)/g).map((part, i) =>
                                              part.startsWith('**') && part.endsWith('**') ? (
                                                <strong
                                                  key={i}
                                                  className={`font-bold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}
                                                >
                                                  {part.slice(2, -2)}
                                                </strong>
                                              ) : (
                                                <span key={i}>{part}</span>
                                              )
                                            )}
                                          </div>
                                        </div>
                                      );
                                    }

                                    // Standard text
                                    return (
                                      <p key={lIdx} className="leading-relaxed">
                                        {line.split(/(\*\*.*?\*\*)/g).map((part, i) =>
                                          part.startsWith('**') && part.endsWith('**') ? (
                                            <strong
                                              key={i}
                                              className={`font-bold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}
                                            >
                                              {part.slice(2, -2)}
                                            </strong>
                                          ) : (
                                            <span key={i}>{part}</span>
                                          )
                                        )}
                                      </p>
                                    );
                                  })}
                                </div>
                              );
                            })}
                        </div>

                        {/* Grounding Web Search Sources */}
                        {msg.groundingSources && msg.groundingSources.length > 0 && (
                          <div className={`pt-2 border-t text-[10px] space-y-1 ${
                            theme === 'light'
                              ? 'border-slate-200 text-slate-500'
                              : 'border-zinc-800/60 text-zinc-400'
                          }`}>
                            <div className={`flex items-center gap-1 font-bold ${theme === 'light' ? 'text-slate-700' : 'text-zinc-300'}`}>
                              <span>🔍 Web Search Citations:</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {msg.groundingSources.map((source, sIdx) => (
                                <a
                                  key={sIdx}
                                  href={source.uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`px-2 py-0.5 rounded border transition-colors truncate max-w-xs flex items-center gap-1 ${
                                    theme === 'light'
                                      ? 'bg-sky-50 border-sky-200 text-sky-700 hover:text-sky-800 hover:border-sky-400'
                                      : 'bg-zinc-900 border-zinc-800 text-sky-400 hover:text-sky-300 hover:border-sky-500/40'
                                  }`}
                                >
                                  <span>🌐</span>
                                  <span className="truncate">{source.title || source.uri}</span>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Runvia Action Toolbar */}
                        <div className={`pt-2.5 mt-2 border-t flex items-center justify-between text-[11px] ${
                          theme === 'light' ? 'border-slate-200 text-slate-500' : 'border-zinc-800/70 text-zinc-400'
                        }`}>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] mr-1.5 ${theme === 'light' ? 'text-slate-500' : 'text-zinc-400'}`}>{msg.timestamp}</span>

                            {/* Copy button */}
                            <button
                              type="button"
                              onClick={() => handleCopyMessage(msg.id, msg.content)}
                              className={`p-1 rounded transition-colors cursor-pointer ${
                                theme === 'light'
                                  ? 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                                  : 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                              }`}
                              title="Copy response"
                            >
                              {copiedMsgId === msg.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>

                            {/* Speaker TTS button */}
                            <button
                              type="button"
                              onClick={() => handleToggleSpeak(msg.id, msg.content)}
                              className={`p-1 rounded hover:bg-zinc-800 transition-colors cursor-pointer ${
                                speakingMsgId === msg.id
                                  ? 'text-amber-400 animate-pulse'
                                  : 'text-zinc-400 hover:text-zinc-200'
                              }`}
                              title={speakingMsgId === msg.id ? 'Stop reading' : 'Read aloud'}
                            >
                              {speakingMsgId === msg.id ? (
                                <VolumeX className="w-3.5 h-3.5" />
                              ) : (
                                <Volume2 className="w-3.5 h-3.5" />
                              )}
                            </button>

                            {/* Thumbs Up */}
                            <button
                              type="button"
                              onClick={() => handleMessageFeedback(msg.id, 'like')}
                              className={`p-1 rounded hover:bg-zinc-800 transition-colors cursor-pointer ${
                                msg.feedback === 'like'
                                  ? 'text-emerald-400'
                                  : 'text-zinc-400 hover:text-zinc-200'
                              }`}
                              title="Helpful advice"
                            >
                              <ThumbsUp className="w-3.5 h-3.5" />
                            </button>

                            {/* Thumbs Down */}
                            <button
                              type="button"
                              onClick={() => handleMessageFeedback(msg.id, 'dislike')}
                              className={`p-1 rounded hover:bg-zinc-800 transition-colors cursor-pointer ${
                                msg.feedback === 'dislike'
                                  ? 'text-red-400'
                                  : 'text-zinc-400 hover:text-zinc-200'
                              }`}
                              title="Needs adjustment"
                            >
                              <ThumbsDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Runvia Disclaimer */}
                        <div className={`text-[10px] italic ${theme === 'light' ? 'text-slate-500' : 'text-zinc-400'}`}>
                          {coachModelName}, personalized using your data.
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* "Drafting the reply..." loading indicator with Stop button */}
            {isSendingChat && (
              <div className={`flex items-center justify-between p-3.5 rounded-2xl border text-xs shadow-lg animate-pulse ${
                theme === 'light'
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-zinc-900/90 border-zinc-800 text-amber-300'
              }`}>
                <div className="flex items-center gap-2">
                  <RotateCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  <span>Drafting the reply... analyzing your training history & multi-year goals</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSendingChat(false)}
                  className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                    theme === 'light'
                      ? 'bg-amber-100 hover:bg-amber-200 text-amber-900'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                  }`}
                  title="Stop generating"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                  <span>Stop</span>
                </button>
              </div>
            )}
          </div>

          {/* Floating Scroll-to-Bottom yellow circular button (Runvia Screenshot 2) */}
          {showScrollBottom && (
            <button
              type="button"
              onClick={() => scrollToBottom(true)}
              className="absolute bottom-20 right-6 w-9 h-9 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-2xl flex items-center justify-center transition-transform hover:scale-110 active:scale-95 cursor-pointer z-30"
              title="Scroll to bottom"
            >
              <ArrowDown className="w-4 h-4 stroke-[2.5]" />
            </button>
          )}

        </div>
      )}

      {/* Activity Fix Data / Calibration Modal */}
      {isFixDataModalOpen && selectedCalibrationActivity && (
        <ActivityCalibrationModal
          isOpen={isFixDataModalOpen}
          activity={selectedCalibrationActivity}
          detailsRecord={stravaActivityDetails[String(selectedCalibrationActivity.id)] || null}
          stravaToken={stravaToken}
          onClose={() => {
            setIsFixDataModalOpen(false);
            setSelectedCalibrationActivity(null);
          }}
          onCalibrationSaved={(updatedRecord) => {
            onActivityDetailsUpdated?.(updatedRecord);
            setIsFixDataModalOpen(false);
            setSelectedCalibrationActivity(null);
          }}
        />
      )}
    </div>
  );
};
