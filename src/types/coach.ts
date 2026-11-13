/**
 * AI Coach & Adaptive Training Planner Types
 * Grounded in the athlete's physiological thresholds, training stress (CTL/ATL/TSB),
 * daily recovery metrics, and target race goals.
 */

export type CoachSport = 'swim' | 'bike' | 'run' | 'strength' | 'rest' | 'brick';

export type WorkoutIntensityLevel = 'recovery' | 'aerobic_z2' | 'tempo_z3' | 'threshold_z4' | 'vo2max_z5';

export interface CoachWorkoutStep {
  phase: string; // e.g. "Warm-up", "Main Set 1", "Recovery", "Cool-down"
  duration: string; // e.g. "15 min", "4 x 6 min"
  description: string;
  target?: string; // e.g. "220-235W", "155-162 bpm", "4:15/km"
}

export interface RecommendedWorkout {
  id: string;
  title: string;
  sport: CoachSport;
  durationMin: number;
  estimatedTss: number;
  intensity: WorkoutIntensityLevel;
  targetZones: {
    watts?: string;
    heartRate?: string;
    pace?: string;
  };
  coachRationale: string;
  readinessAnalysis: string;
  structure: CoachWorkoutStep[];
  nutritionTips?: string;
  injuryWarning?: string;
  createdAt: string;
  isCompleted?: boolean;
}

export interface TrainingPlanDay {
  dayName: string; // "Monday", "Tuesday", etc.
  date?: string; // YYYY-MM-DD
  sport: CoachSport;
  title: string;
  durationMin: number;
  targetTss: number;
  description: string;
  isKeySession: boolean;
  targetMetric?: string; // e.g. "Zone 2 210W" or "4:30/km tempo"
}

export interface TrainingPlanWeek {
  weekNumber: number;
  title: string;
  focus: string; // e.g. "Aerobic Capacity & Bike Sweetspot"
  totalHours: number;
  totalTss: number;
  days: TrainingPlanDay[];
}

export interface PeriodizedPlan {
  id: string;
  goalName: string;
  targetRaceDate?: string;
  weeksToGoal: number;
  summary: string;
  periodizationPhase: string; // e.g. "Base 2", "Build 1", "Peak", "Taper"
  athleteStrengths: string;
  keyFocusAreas: string[];
  weeks: TrainingPlanWeek[];
  createdAt: string;
}

import type { TrainingGoal } from './goals';

export interface CoachGoalAction {
  type: 'add_goal' | 'update_goal' | 'delete_goal' | 'propose_goal' | 'update_benchmark';
  status?: 'pending_confirmation' | 'pending_priority' | 'confirmed' | 'cancelled';
  goal?: Partial<TrainingGoal>;
  goalId?: string;
  goalName?: string;
  updates?: Partial<TrainingGoal>;
  missingFields?: string[];
  suggestedPriorities?: ('A' | 'B' | 'C')[];
  searchResult?: {
    eventName?: string;
    foundDate?: string;
    sourceUri?: string;
    sourceTitle?: string;
  };
  benchmark?: Record<string, unknown>;
  description: string;
}

export interface CalibratedLapProposal {
  id: string;
  name: string; // e.g. "Warm-up", "Interval 1", "Recovery 1", "Cool-down"
  durationSec: number;
  speedKph: number;
  paceMinSec?: string; // e.g. "3:30/km", "6:00/km"
  distanceM?: number;
  isInterval?: boolean; // true if this is an active interval
  isRecovery?: boolean; // true if this is rest/recovery
  isWarmupCool?: boolean;
}

export interface CoachWorkoutCalibrationAction {
  type: 'recreate_run_workout' | 'apply_run_calibration';
  status?: 'pending_answers' | 'ready_to_apply' | 'applied';
  activityId: string | number;
  activityName: string;
  activityDate: string;
  recordedDurationSec: number;
  originalDistanceM: number;
  originalPace?: string;
  targetIntervalPace: string; // e.g. "3:30/km"
  targetIntervalSpeedKph: number; // e.g. 17.14
  recoveryPace?: string; // e.g. "6:00/km"
  recoverySpeedKph?: number; // e.g. 10.0
  activeDurationSec?: number;
  recoveryDurationSec?: number;
  intervalsCount?: number;
  timeDiscrepancySec: number;
  sections: CalibratedLapProposal[];
  recalculatedDistanceM: number;
  recalculatedAvgPace: string;
  followUpQuestions?: string[];
  clarificationOptions?: {
    label: string;
    description: string;
    activeSec: number;
    recoverySec: number;
    repeats: number;
    recoveryPace?: string;
  }[];
  description: string;
}

export interface CoachWorkoutCommentAction {
  type: 'update_workout_comment';
  status?: 'applied' | 'pending';
  activityId: string | number;
  activityName: string;
  activityDate: string;
  commentOrDescription: string;
  newTitle?: string;
  rpe?: number;
  appendToExisting?: boolean;
  syncedToStrava?: boolean;
  description: string;
}

export interface CoachPrescribeWorkoutAction {
  type: 'prescribe_workout';
  status?: 'proposed' | 'saved_to_today';
  workout: RecommendedWorkout;
  scheduledFor?: string; // e.g. "Next Thursday (2026-11-19)" or "Today"
  progressionContext?: string;
  description: string;
}

export interface CoachTrainingEvaluationAction {
  type: 'evaluate_training';
  periodLabel: string; // e.g. "Current Week", "Last Week", "Today's Session", "Last 2 Thursdays"
  ratingScore: number; // 1 to 10
  verdict: 'on_track' | 'overreaching' | 'under_stimulating' | 'optimal_progression' | 'recovery_needed';
  verdictLabel: string;
  totalDurationMin: number;
  totalTss: number;
  ctlRampRatePtsPerWeek?: number;
  weeksToPrimaryGoal?: number;
  primaryGoalName?: string;
  goalAlignmentSummary: string;
  highlights: string[];
  nextStepRecommendation: string;
  description: string;
}

export interface CoachProfileUpdateAction {
  type: 'update_athlete_profile';
  status?: 'applied';
  updates?: Record<string, any>;
  injuryAddedOrUpdated?: {
    area: string;
    severity: 'mild' | 'moderate' | 'severe';
    status: 'active' | 'recovering' | 'resolved';
    notes?: string;
  };
  scheduleUpdated?: string;
  description: string;
}

export type CoachAction =
  | CoachGoalAction
  | CoachWorkoutCalibrationAction
  | CoachWorkoutCommentAction
  | CoachPrescribeWorkoutAction
  | CoachTrainingEvaluationAction
  | CoachProfileUpdateAction;

export interface CoachChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
  feedback?: 'like' | 'dislike' | null;
  executedAction?: CoachAction;
  additionalActions?: CoachAction[];
  skillsUsed?: string[];
  confidenceRating?: string;
  groundingSources?: { uri: string; title: string }[];
}

export interface CoachActivityRecord {
  id: string | number;
  name: string;
  sport: string; // e.g. "Run", "Ride", "Swim", "WeightTraining", etc.
  startDate: string; // YYYY-MM-DD
  startTime?: string; // HH:MM
  dayOfWeek: string; // e.g. "Thursday", "Saturday"
  daysAgo: number; // 0 = today, 1 = yesterday, etc.
  distanceKm: number;
  distanceM?: number;
  movingTimeMin: number;
  movingTimeSec?: number;
  paceFormatted?: string; // e.g. "4:38/km" for runs
  speedKmh?: number; // e.g. 31.4 km/h for bike
  avgWatts?: number;
  weightedAvgWatts?: number;
  avgHeartrate?: number;
  maxHeartrate?: number;
  avgCadence?: number;
  elevationGainM?: number;
  tss?: number;
  isIndoor?: boolean;
  notes?: string;
  description?: string;
  rpe?: number;
  workoutClassification?: 'structured_intervals' | 'tempo_threshold' | 'long_endurance' | 'aerobic_base' | 'easy_or_cooldown' | 'strength_mobility';
  isQualityWorkout?: boolean;
  isEasyOrCooldown?: boolean;
  intervalStructureSummary?: string; // e.g. "8 x 1km @ 3:32/km (17.0 km/h) with 70s rest"
  activeWorkSummary?: string; // e.g. "8.0 km (28m 16s) active work @ 3:32/km vs 4:29/km overall w/ warmup & rests"
  lapsSummary?: string;
}

export type WorkoutAssessmentType = 'optimal' | 'too_hard' | 'too_short' | 'not_hard_enough';

export interface WorkoutReviewStreamInsights {
  hasStreams: boolean;
  cardiacDriftPct?: number; // Aerobic decoupling (Pw:HR or Pace:HR drift from 1st to 2nd half)
  timeInZone2Pct?: number;
  timeInZone45Pct?: number;
  swimIntervalSummary?: string; // e.g. "Work-to-rest ratio 1:1.5 - high rest sprints vs continuous endurance"
  bikeTtAeroSummary?: string; // e.g. "Cadence & speed stability indicative of sustained TT aero bars"
  runLtpPaceSummary?: string; // e.g. "LTP threshold pace endurance sustained across distance"
}

export interface WorkoutReviewItem {
  id: string | number;
  activityId: string | number;
  name: string;
  sport: string; // "Swim", "Bike", "Run", "Gym", etc.
  startDate: string;
  dayOfWeek: string;
  daysAgo: number;
  distanceKm: number;
  movingTimeMin: number;
  paceFormatted?: string;
  speedKmh?: number;
  avgWatts?: number;
  avgHeartrate?: number;
  maxHeartrate?: number;
  avgCadence?: number;
  elevationGainM?: number;
  tss?: number;
  assessment: WorkoutAssessmentType;
  assessmentBadge: {
    label: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
  };
  periodizationContext: string; // e.g. "Build Week 2 (Aerobic Overload)" or "Recovery Cutback"
  periodizationFit: string; // "Appropriate load for build phase", "Too intense for recovery week", etc.
  goalContribution: string; // "Contributes to 80-mile ride benchmark (current max: 74km)"
  subGoalContribution?: string; // "Reinforces 2-hour aero TT posture sub-goal"
  streamInsights: WorkoutReviewStreamInsights;
  coachTakeaway: string;
  suggestedAdjustment: string;
}

export type BenchmarkCategory = 'macro_goal' | 'sub_goal';

export interface BenchmarkMilestone {
  id: string;
  category: BenchmarkCategory;
  discipline: 'swim' | 'bike' | 'run' | 'triathlon';
  title: string;
  targetMetric: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  progressPct: number; // 0 to 100
  status: 'achieved' | 'in_progress' | 'planned';
  description: string;
  whyItMatters: string; // Sports science rationale (e.g. 70.3 4h30m time gain)
  bestEffortActivity?: {
    name: string;
    date: string;
    metricValue: string;
  };
}

export interface CoachRequestPayload {
  athleteProfile: any;
  latestReadiness?: any;
  latestRecoveryLog?: any;
  recentActivities?: CoachActivityRecord[];
  todayDate?: string;
  todayDayOfWeek?: string;
  todayAvailability?: {
    isWorkday: boolean;
    shiftStart?: string;
    shiftEnd?: string;
    availableWindows: string[];
    preferredActivities?: string[];
    suggestedDurationMin?: number;
  };
  activeInjuries?: any[];
  periodizationInfo?: {
    model: '0' | '3weeks' | '4weeks';
    phaseName: string;
    currentWeekInCycle: number;
    isRecoveryWeek: boolean;
  };
  benchmarks?: BenchmarkMilestone[];
  recentActivitiesSummary?: {
    totalLast14Days: number;
    swimKm: number;
    bikeKm: number;
    runKm: number;
    avgDailyTss: number;
    last3DaysActivities: string[];
    currentWeekTss?: number;
    currentWeekHours?: number;
    currentWeekSessions?: number;
    lastWeekTss?: number;
    lastWeekHours?: number;
    lastWeekSessions?: number;
  };
  fitnessStats?: {
    ctl: number;
    atl: number;
    tsb: number;
    tfi: number;
    limitingFactor?: string;
    ctlRampRate7d?: number; // pts/week change over last 7 days
    ctlRampRate28dAvg?: number; // avg pts/week change over last 28 days
    rampRateAssessment?: string; // e.g. "Optimal Build (+4.2 CTL/wk)"
    swimCtl?: number;
    bikeCtl?: number;
    runCtl?: number;
  };
  goals?: any[];
  preferredSport?: CoachSport | 'auto';
  targetDurationMin?: number;
  customNotes?: string;
}



