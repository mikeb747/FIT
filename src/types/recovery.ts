/**
 * Recovery, Sleep, Resting Heart Rate, and HRV Types for FIT Track
 * Compatible with Garmin Connect & TrainingPeaks metrics import
 */

export type RecoverySource = 'garmin' | 'trainingpeaks' | 'manual' | 'csv';

export type SubjectiveFeel = 1 | 2 | 3 | 4 | 5; // 1 = Exhausted, 2 = Heavy, 3 = Moderate, 4 = Good, 5 = Peak

export interface DailyRecoveryLog {
  id: string;
  date: string; // YYYY-MM-DD
  restingHr: number; // Morning RHR in bpm (e.g. 41)
  hrvRmssd: number; // Overnight HRV rMSSD in milliseconds (e.g. 74)
  sleepDurationMinutes: number; // Total sleep in minutes (e.g. 475 = 7h 55m)
  sleepScore: number; // Garmin / TP Sleep Score (0-100)
  deepSleepMinutes: number; // Restorative deep sleep (e.g. 80 min)
  remSleepMinutes: number; // REM sleep (e.g. 95 min)
  lightSleepMinutes: number; // Light sleep (e.g. 265 min)
  awakeMinutes: number; // Awake / tossing time (e.g. 35 min)
  subjectiveFeel?: SubjectiveFeel;
  notes?: string;
  source: RecoverySource;
  tags?: string[]; // e.g. ['late meal', 'travel', 'hard race', 'alcohol free']
}

export type ReadinessStatus = 'optimal' | 'good' | 'moderate' | 'low';

export interface ReadinessScoreResult {
  score: number; // 0 - 100
  status: ReadinessStatus;
  label: string; // 'Primed / Optimal', 'Good / Productive', 'Moderate / Strained', 'Low / Compromised'
  accentColor: string;
  badgeBg: string;
  badgeText: string;
  hrvStatus: 'balanced' | 'low' | 'elevated' | 'insufficient_data';
  hrvBaseline7d: number;
  hrvStdDev7d: number;
  hrvDelta: number; // today - baseline
  rhrDelta: number; // today - athlete baseline (41)
  rhr7dAvg: number;
  sleepQualityRating: 'optimal' | 'good' | 'fair' | 'poor';
  sleepAvg7dMinutes: number;
  sleepScoreAvg7d: number;
  trainingRecommendation: string;
  recommendedIntensity:
    | 'High / Threshold & Intervals'
    | 'Moderate / Tempo & Aerobic'
    | 'Low / Easy Z2 & Endurance'
    | 'Rest / Active Recovery';
  subscores: {
    hrvScore: number; // 0-100
    sleepScore: number; // 0-100
    rhrScore: number; // 0-100
    loadModifier: number; // e.g. -5 to +5 adjustment
  };
  insights: string[];
}

export interface CrossCorrelationSummary {
  sleepVsHrvCorrelation: number; // Pearson r
  deepSleepVsRhrCorrelation: number; // Pearson r
  trainingLoadVsNextRhrCorrelation?: number; // Pearson r
  keyTakeaways: string[];
}

export interface GarminSyncOptions {
  email?: string;
  password?: string;
  sessionToken?: string;
  weeks: number; // e.g. 2, 4, 8, 12
  baselineRhr?: number; // defaults to 41
  isDemo?: boolean;
}

export interface GarminSyncResponse {
  success: boolean;
  syncedDays: number;
  weeks: number;
  logs: DailyRecoveryLog[];
  message: string;
  error?: string;
  mfaRequired?: boolean;
}

