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

export interface CoachChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
}

export interface CoachRequestPayload {
  athleteProfile: any;
  latestReadiness?: any;
  latestRecoveryLog?: any;
  recentActivitiesSummary?: {
    totalLast14Days: number;
    swimKm: number;
    bikeKm: number;
    runKm: number;
    avgDailyTss: number;
    last3DaysActivities: string[];
  };
  fitnessStats?: {
    ctl: number;
    atl: number;
    tsb: number;
    tfi: number;
    limitingFactor?: string;
  };
  goals?: any[];
  preferredSport?: CoachSport | 'auto';
  targetDurationMin?: number;
  customNotes?: string;
}
