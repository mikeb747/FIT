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

export interface ZoneDiffRow {
  zone: number;
  name: string;
  beforeMin: number;
  beforeMax: number;
  afterMin: number;
  afterMax: number;
  beforeRange: string;
  afterRange: string;
  changed: boolean;
  deltaSummary?: string; // e.g. "+3 bpm ceiling" or "-2s/km faster"
  confidence: 'high' | 'medium' | 'low';
  confidenceLabel: string; // e.g. "High (6 Steady Runs <5% Drift)" or "Low (Leave Unchanged)"
  confidenceReason?: string;
  recommendedSelect: boolean; // True when evidence is high enough to recommend applying this zone's upper bound
}

export interface CoachUpdateZonesAction {
  type: 'update_training_zones';
  status?: 'proposed' | 'applied' | 'rejected';
  zoneDomain: 'hr_run' | 'hr_bike' | 'hr_swim' | 'pace_run_outdoor' | 'pace_run_treadmill' | 'pace_swim' | 'power_bike';
  domainLabel: string; // e.g. "Running Heart Rate Zones (Z1–Z5)"
  evidenceSummary: string; // e.g. "Based on 6 steady runs (≥40 min, GAP-adjusted) and 4 structured interval workouts"
  confidenceLabel: string; // e.g. "High Confidence on Z2 Ceiling · Selective Per-Zone Controls Enabled"
  monthlyGuardrailNote: string; // e.g. "+3 bpm Z2 ceiling adjustment (within ±5 bpm/month cap; never altered on a single run)"
  selectedZonesToApply?: number[]; // e.g. [2] when raising only Zone 2 upper bound and leaving Z3-Z5 ceilings alone
  appliedSelectionSummary?: string; // e.g. "Applied Z2 upper bound only (135 -> 138 bpm); left Z1, Z3, Z4, Z5 ceilings untouched"
  anchorUpdates?: {
    thresholdHeartRateRun?: number;
    thresholdHeartRateBike?: number;
    thresholdHeartRateSwim?: number;
    maxHeartRate?: number;
    restingHeartRate?: number;
    thresholdPaceRunOutdoorSec?: number;
    thresholdPaceRunTreadmillSec?: number;
    swimPoolPace100mSec?: number;
    bikeFtp?: number;
  };
  customHrZones?: Record<number, { minHr: number; maxHr: number; rangeFormatted?: string }>;
  customPaceZones?: Record<number, { minPaceSec: number; maxPaceSec: number; rangeFormatted?: string }>;
  customPowerZones?: Record<number, { minWatts: number; maxWatts: number; rangeFormatted?: string }>;
  zoneDiffs: ZoneDiffRow[];
  description: string;
}

export interface SteadyRunDriftAuditRow {
  activityId: string | number;
  date: string;
  name: string;
  durationMin: number;
  distanceKm: number;
  settledPaceFormatted: string; // Raw settled pace (excludes first 10 min warmup)
  gapPaceFormatted: string; // Grade Adjusted Pace (GAP) using Minetti / Strava slope cost model
  elevationGainM: number;
  avgGradePct: number;
  usesGapForDrift: boolean; // True for outdoor undulating runs and inclined treadmill runs
  avgHrFirstHalf: number;
  avgHrSecondHalf: number;
  overallSteadyHr: number;
  efFirstHalf: number; // GAP Speed (m/min) / HR
  efSecondHalf: number;
  rawPaHrDecouplingPct: number; // Unadjusted raw Pace:HR drift
  paHrDecouplingPct: number; // GAP:HR decoupling (< 5.0% is aerobically coupled)
  cadenceFirstHalfSpm: number;
  cadenceSecondHalfSpm: number;
  strideLengthM: number;
  isIndoorTreadmill: boolean;
  dataQualityFlag?: string; // e.g. "Outdoor GAP applied (+112m elev: 5:03/km raw -> 4:56/km GAP)"
  z2Verdict: 'coupled_below_5pct' | 'borderline_5pct' | 'drifting_above_5pct';
}

export interface RepDriftTelemetryRow {
  repIndex: number;
  durationSec: number;
  settledWorkPace: string; // Excludes first 20-30s ramp-up
  gapWorkPace?: string; // Grade Adjusted Pace (e.g. 3:39/km GAP at 0.5% gradient)
  repStartHr: number;
  lateRepPlateauHr: number; // Last 30-60s plateau HR
  actualRestSec: number; // Stream-measured rest vs planned rest
  plannedRestSec?: number;
  hrr30Bpm?: number; // HR drop 30s into rest
  hrr60Bpm?: number; // HR drop 60s into rest
  cadenceSpm: number;
  strideLengthM: number;
}

export interface IntervalSessionAuditRow {
  activityId: string | number;
  date: string;
  name: string;
  formatSummary: string; // e.g. "4 x 9 min @ 3:42/km (0.5% gradient)"
  repDurationSec: number;
  settledWorkPace: string;
  gapWorkPace?: string; // e.g. "3:39/km GAP (0.5% incline)"
  gradientPct?: number;
  wholeRepAvgHr: number; // Shown to contrast how HR lag underreads short reps
  lateRepPlateauHrRange: string; // e.g. "151 -> 155 bpm (last 45s)"
  hrSlopeBpmPerRep: number; // e.g. +0.8 bpm/rep (flat/sustainable) vs +1.8 bpm/rep (rising)
  hrLagSec: number; // 60-90s kinetics lag
  isRepLongEnoughForHr: boolean; // >= 4 min (240s) reliable; <= 3 min underreads due to lag
  plannedRestSec: number;
  actualStreamRestSec: number;
  workToRestRatio: string;
  meanCadenceSpm: number;
  cadenceDropSpm: number; // First rep to last rep
  strideLengthM: number;
  p99SmoothedMaxHr: number;
  rawMaxHrSpike?: number;
  zoneInformed: 'Z4_Threshold' | 'Z5_VO2max' | 'Z3_Tempo';
  sustainabilityVerdict: string;
  repsBreakdown?: RepDriftTelemetryRow[];
}

export interface CoachDriftAndZoneAnalysisAction {
  type: 'analyze_workout_drift_and_zones';
  targetSessionTitle?: string;
  targetSessionDate?: string;
  currentZ2CeilingBpm: number;
  recommendedZ2CeilingBpm: number;
  z2RuleVerdict: string; // e.g. "Raise Z2 ceiling by +3 bpm (135 -> 138 bpm): 6 steady runs ≥40m show <5% GAP:HR decoupling"
  sustainableThresholdBoundary: string; // e.g. "3:38–3:42/km (3:39/km GAP) | Plateau HR 151–155 bpm"
  p99MaxHrEstimate: number;
  steadyRunAudits: SteadyRunDriftAuditRow[];
  intervalSessionAudits: IntervalSessionAuditRow[];
  controlsAndCautions: string[];
  proposedZoneAction?: CoachUpdateZonesAction;
  description: string;
}

export type CoachAction =
  | CoachGoalAction
  | CoachWorkoutCalibrationAction
  | CoachWorkoutCommentAction
  | CoachPrescribeWorkoutAction
  | CoachTrainingEvaluationAction
  | CoachProfileUpdateAction
  | CoachUpdateZonesAction
  | CoachDriftAndZoneAnalysisAction;

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



