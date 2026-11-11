import { StravaActivity, StravaActivityDetailsRecord, calculateActivityTSS, classifyActivity } from './stravaActivities';
import { AthleteProfile } from '../types/athlete';
import { TrainingGoal } from '../types/goals';

export interface DailyFitnessRecord {
  date: string; // YYYY-MM-DD
  swimTss: number;
  bikeTss: number;
  runTss: number;
  otherTss: number;
  totalTriTss: number;
  totalAllTss: number;
  
  // Chronic Training Load (42-day rolling)
  swimCtl: number;
  bikeCtl: number;
  runCtl: number;
  triCtl: number;

  // Acute Training Load (7-day rolling)
  swimAtl: number;
  bikeAtl: number;
  runAtl: number;
  triAtl: number;

  // Training Stress Balance (Form = CTL - ATL)
  swimTsb: number;
  bikeTsb: number;
  runTsb: number;
  triTsb: number;
}

export type TriathlonDistanceModel = 'sprint' | 'olympic' | 'middle_70_3' | 'ironman' | 'custom_goal';

export interface TriathlonTargetWeights {
  swimWeight: number; // e.g. 0.123
  bikeWeight: number; // e.g. 0.526
  runWeight: number;  // e.g. 0.351
  targetSwimCtl: number; // e.g. 24
  targetBikeCtl: number; // e.g. 52
  targetRunCtl: number;  // e.g. 34
  targetTriCtl: number;  // e.g. 110
  targetCtlRange?: [number, number]; // [CTL_low, CTL_high]
  raceDayCtlRange?: [number, number]; // [CTL_peak * 0.85, CTL_peak * 0.90]
  weeklyHoursTarget?: number; // H_total
  label: string;
}

export interface TriathlonFitnessIndexResult {
  tfi: number; // e.g. 93.9 -> 94
  swimRatio: number; // e.g. 0.80 (80%)
  bikeRatio: number; // e.g. 1.00 (100%)
  runRatio: number;  // e.g. 0.90 (90%)
  currentSwimCtl: number;
  currentBikeCtl: number;
  currentRunCtl: number;
  currentTriCtl: number;
  currentTriAtl: number;
  currentTriTsb: number;
  weights: TriathlonTargetWeights;
  limitingFactor: {
    discipline: 'swim' | 'bike' | 'run';
    name: string;
    ratio: number;
    gapToTarget: number;
  };
}

/**
 * Age-Group Calibrated Triathlon Profiles
 * Derived from first principles: CTL_target = (1/7) * sum_d [ H_d * IF_d^p_d * 100 ]
 * using priors IF_bike = 0.70 (p=2), IF_run = 0.78 (p=2), IF_swim = 0.80 (p=3).
 */
export const DISTANCE_MODEL_PROFILES: Record<Exclude<TriathlonDistanceModel, 'custom_goal'>, TriathlonTargetWeights> = {
  sprint: {
    label: 'Sprint',
    swimWeight: 0.20,
    bikeWeight: 0.48,
    runWeight: 0.32,
    targetSwimCtl: 12,
    targetBikeCtl: 22,
    targetRunCtl: 18,
    targetTriCtl: 52,
    targetCtlRange: [42, 64],
    raceDayCtlRange: [45, 48],
    weeklyHoursTarget: 6.9,
  },
  olympic: {
    label: 'Olympic',
    swimWeight: 0.16,
    bikeWeight: 0.51,
    runWeight: 0.33,
    targetSwimCtl: 17,
    targetBikeCtl: 35,
    targetRunCtl: 26,
    targetTriCtl: 78,
    targetCtlRange: [66, 92],
    raceDayCtlRange: [67, 72],
    weeklyHoursTarget: 10.3,
  },
  middle_70_3: {
    label: '70.3',
    swimWeight: 0.123,
    bikeWeight: 0.526,
    runWeight: 0.351,
    targetSwimCtl: 24,
    targetBikeCtl: 52,
    targetRunCtl: 34,
    targetTriCtl: 110,
    targetCtlRange: [95, 126],
    raceDayCtlRange: [94, 100],
    weeklyHoursTarget: 14.7,
  },
  ironman: {
    label: 'Full IRONMAN',
    swimWeight: 0.118,
    bikeWeight: 0.529,
    runWeight: 0.353,
    targetSwimCtl: 29,
    targetBikeCtl: 70,
    targetRunCtl: 44,
    targetTriCtl: 143,
    targetCtlRange: [122, 162],
    raceDayCtlRange: [122, 130],
    weeklyHoursTarget: 19.0,
  },
};

// -------------------------------------------------------------
// Running Performance Readiness Models (26.2M down to 5K)
// -------------------------------------------------------------
export type RunningDistanceModel = 'marathon_26_2' | 'half_13_1' | 'ten_miler_10' | 'ten_k_10' | 'five_k_5';

export interface RunningTargetProfile {
  id: RunningDistanceModel;
  label: string;
  shortLabel: string;
  targetRunCtl: number;
  targetCtlRange: [number, number];
  raceDayCtlRange: [number, number];
  weeklyHoursTarget: number;
  longRunHours: number;
  description: string;
}

export const RUNNING_MODEL_PROFILES: Record<RunningDistanceModel, RunningTargetProfile> = {
  marathon_26_2: {
    id: 'marathon_26_2',
    label: '26.2M (Marathon)',
    shortLabel: '26.2M',
    targetRunCtl: 56,
    targetCtlRange: [46, 68],
    raceDayCtlRange: [48, 51],
    weeklyHoursTarget: 6.5,
    longRunHours: 2.35,
    description: 'Full 26.2-mile marathon age-group readiness (~2.25–2.5h long run, ~6.5h / 45–55 mi/wk peak)',
  },
  half_13_1: {
    id: 'half_13_1',
    label: '13.1M (Half Marathon)',
    shortLabel: '13.1M',
    targetRunCtl: 43,
    targetCtlRange: [35, 52],
    raceDayCtlRange: [37, 40],
    weeklyHoursTarget: 4.9,
    longRunHours: 1.75,
    description: 'Half marathon 13.1-mile road race readiness (~1.75h long run, ~4.9h / 35–42 mi/wk peak)',
  },
  ten_miler_10: {
    id: 'ten_miler_10',
    label: '10M (10 Miler)',
    shortLabel: '10M',
    targetRunCtl: 36,
    targetCtlRange: [29, 44],
    raceDayCtlRange: [31, 33],
    weeklyHoursTarget: 4.1,
    longRunHours: 1.45,
    description: '10.0-mile road race readiness (e.g. Chippenham / Oldbury 10M, ~1.45h long run, ~4.1h/wk)',
  },
  ten_k_10: {
    id: 'ten_k_10',
    label: '10K Road Race',
    shortLabel: '10K',
    targetRunCtl: 31,
    targetCtlRange: [25, 38],
    raceDayCtlRange: [27, 29],
    weeklyHoursTarget: 3.5,
    longRunHours: 1.2,
    description: '10km (6.2-mile) threshold speed endurance road race readiness (~1.2h long run, ~3.5h/wk)',
  },
  five_k_5: {
    id: 'five_k_5',
    label: '5K Road Race',
    shortLabel: '5K',
    targetRunCtl: 26,
    targetCtlRange: [20, 32],
    raceDayCtlRange: [23, 25],
    weeklyHoursTarget: 2.9,
    longRunHours: 1.0,
    description: '5km (3.1-mile) VO2 max sharpness and aerobic support readiness (~1.0h long run, ~2.9h/wk)',
  },
};

// -------------------------------------------------------------
// Cycling Performance Readiness Models (Century down to 10M TT)
// -------------------------------------------------------------
export type CyclingDistanceModel = 'century_100' | 'fifty_m_50' | 'twenty_five_m_25' | 'ten_m_tt_10';

export interface CyclingTargetProfile {
  id: CyclingDistanceModel;
  label: string;
  shortLabel: string;
  targetBikeCtl: number;
  targetCtlRange: [number, number];
  raceDayCtlRange: [number, number];
  weeklyHoursTarget: number;
  longRideHours: number;
  description: string;
}

export const CYCLING_MODEL_PROFILES: Record<CyclingDistanceModel, CyclingTargetProfile> = {
  century_100: {
    id: 'century_100',
    label: 'Century (100M)',
    shortLabel: 'Century',
    targetBikeCtl: 70,
    targetCtlRange: [58, 84],
    raceDayCtlRange: [60, 64],
    weeklyHoursTarget: 10.0,
    longRideHours: 4.5,
    description: '100-mile road sportive endurance readiness (~4.5h long ride, ~10h/wk peak volume)',
  },
  fifty_m_50: {
    id: 'fifty_m_50',
    label: '50M TT / Road',
    shortLabel: '50M',
    targetBikeCtl: 50,
    targetCtlRange: [41, 60],
    raceDayCtlRange: [43, 46],
    weeklyHoursTarget: 7.1,
    longRideHours: 3.0,
    description: '50-mile time trial and road aerobic power readiness (~3.0h long ride, ~7.1h/wk)',
  },
  twenty_five_m_25: {
    id: 'twenty_five_m_25',
    label: '25M TT',
    shortLabel: '25M',
    targetBikeCtl: 40,
    targetCtlRange: [33, 48],
    raceDayCtlRange: [35, 37],
    weeklyHoursTarget: 5.5,
    longRideHours: 2.2,
    description: '25-mile time trial sustainable threshold power readiness (~2.2h long ride, ~5.5h/wk)',
  },
  ten_m_tt_10: {
    id: 'ten_m_tt_10',
    label: '10M TT',
    shortLabel: '10M TT',
    targetBikeCtl: 32,
    targetCtlRange: [26, 39],
    raceDayCtlRange: [28, 30],
    weeklyHoursTarget: 4.2,
    longRideHours: 1.6,
    description: '10-mile time trial maximal threshold power and aerodynamic readiness (~1.6h long ride, ~4.2h/wk)',
  },
};

// -------------------------------------------------------------
// Swimming Performance Readiness Models (50m to 10k)
// -------------------------------------------------------------
export type SwimmingDistanceModel =
  | 'swim_50m'
  | 'swim_100m'
  | 'swim_400m'
  | 'swim_1_9k'
  | 'swim_3_8k'
  | 'swim_5k'
  | 'swim_10k';

export interface SwimmingTargetProfile {
  id: SwimmingDistanceModel;
  label: string;
  shortLabel: string;
  targetSwimCtl: number;
  targetCtlRange: [number, number];
  raceDayCtlRange: [number, number];
  weeklyHoursTarget: number;
  longSwimHours: number;
  description: string;
}

export const SWIMMING_MODEL_PROFILES: Record<SwimmingDistanceModel, SwimmingTargetProfile> = {
  swim_50m: {
    id: 'swim_50m',
    label: '50m Sprint',
    shortLabel: '50m',
    targetSwimCtl: 13,
    targetCtlRange: [10, 16],
    raceDayCtlRange: [11, 12],
    weeklyHoursTarget: 1.8,
    longSwimHours: 0.6,
    description: '50m explosive sprint sharpness and anaerobic swim power (~1.8h/wk pool volume)',
  },
  swim_100m: {
    id: 'swim_100m',
    label: '100m Freestyle',
    shortLabel: '100m',
    targetSwimCtl: 17,
    targetCtlRange: [13, 21],
    raceDayCtlRange: [15, 16],
    weeklyHoursTarget: 2.3,
    longSwimHours: 0.75,
    description: '100m all-out sprint endurance and CSS sharpness (~2.3h/wk pool volume)',
  },
  swim_400m: {
    id: 'swim_400m',
    label: '400m / CSS Test',
    shortLabel: '400m',
    targetSwimCtl: 21,
    targetCtlRange: [17, 26],
    raceDayCtlRange: [18, 20],
    weeklyHoursTarget: 2.8,
    longSwimHours: 0.9,
    description: '400m middle-distance threshold speed endurance (~2.8h/wk pool volume)',
  },
  swim_1_9k: {
    id: 'swim_1_9k',
    label: '1.9k (70.3 Swim)',
    shortLabel: '1.9k',
    targetSwimCtl: 24,
    targetCtlRange: [19, 30],
    raceDayCtlRange: [21, 22],
    weeklyHoursTarget: 3.3,
    longSwimHours: 1.0,
    description: '1.9km Half IRONMAN / 70.3 open water endurance (~1.0h long swim, ~3.3h/wk)',
  },
  swim_3_8k: {
    id: 'swim_3_8k',
    label: '3.8k (Ironman Swim)',
    shortLabel: '3.8k',
    targetSwimCtl: 29,
    targetCtlRange: [24, 36],
    raceDayCtlRange: [25, 27],
    weeklyHoursTarget: 4.0,
    longSwimHours: 1.2,
    description: '3.8km Full IRONMAN endurance swim preparation (~1.2h long swim, ~4.0h/wk)',
  },
  swim_5k: {
    id: 'swim_5k',
    label: '5k Marathon Swim',
    shortLabel: '5k',
    targetSwimCtl: 35,
    targetCtlRange: [28, 42],
    raceDayCtlRange: [30, 32],
    weeklyHoursTarget: 4.7,
    longSwimHours: 1.5,
    description: '5km open water marathon swim volume and aerobic stamina (~1.5h long swim, ~4.7h/wk)',
  },
  swim_10k: {
    id: 'swim_10k',
    label: '10k Marathon Swim',
    shortLabel: '10k',
    targetSwimCtl: 45,
    targetCtlRange: [37, 54],
    raceDayCtlRange: [39, 41],
    weeklyHoursTarget: 6.1,
    longSwimHours: 2.2,
    description: '10km ultra-marathon open water swim volume (~2.2h long swim, ~6.1h/wk)',
  },
};

/**
 * Computes daily TSS records and 42d CTL / 7d ATL / TSB running logs across Swim, Bike, Run and Combined.
 */
export function computeFitnessTimeline(
  activities: StravaActivity[],
  activityDetails: Record<string, StravaActivityDetailsRecord>,
  athleteProfile: AthleteProfile,
  daysLookback: number = 90
): DailyFitnessRecord[] {
  // 1. Map daily TSS by date and discipline
  const dailyTssMap = new Map<string, { swim: number; bike: number; run: number; other: number }>();

  // Extract date range from activities
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  activities.forEach((act) => {
    if (!act.start_date || act.isDeleted) return;
    const dateStr = act.start_date.split('T')[0];

    // Check calibration or manual TSS override
    const details = activityDetails[String(act.id)];
    let tss = 0;

    if (details?.calibration?.isIgnoredFromTrainingStatus) {
      tss = 0;
    } else if (details?.calibration?.manualTss !== undefined && details.calibration.manualTss >= 0) {
      tss = details.calibration.manualTss;
    } else {
      const res = calculateActivityTSS(act, details, athleteProfile);
      tss = res?.tss ?? act.suffer_score ?? Math.round(((act.moving_time || 0) / 3600) * 55);
    }

    const { category } = classifyActivity(act);
    const current = dailyTssMap.get(dateStr) || { swim: 0, bike: 0, run: 0, other: 0 };

    if (category === 'Swim') {
      current.swim += tss;
    } else if (category === 'Bike') {
      current.bike += tss;
    } else if (category === 'Run') {
      current.run += tss;
    } else {
      current.other += tss;
    }

    dailyTssMap.set(dateStr, current);
  });

  // Determine timeline start date (at least daysLookback days ago)
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - daysLookback);

  // If we have earlier activities, allow extending back to build authentic CTL warmup
  let earliestDate = startDate;
  dailyTssMap.forEach((_, dateKey) => {
    const d = new Date(dateKey);
    if (!isNaN(d.getTime()) && d < earliestDate) {
      earliestDate = d;
    }
  });

  // Cap max warmup to 180 days for performance
  const maxWarmup = new Date(now);
  maxWarmup.setDate(maxWarmup.getDate() - 180);
  if (earliestDate < maxWarmup) {
    earliestDate = maxWarmup;
  }

  // Iterate chronologically through each calendar day
  const records: DailyFitnessRecord[] = [];
  let swimCtl = 0;
  let bikeCtl = 0;
  let runCtl = 0;

  let swimAtl = 0;
  let bikeAtl = 0;
  let runAtl = 0;

  const cur = new Date(earliestDate);
  const end = new Date(now);

  while (cur <= end) {
    const dateStr = cur.toISOString().split('T')[0];
    const tssData = dailyTssMap.get(dateStr) || { swim: 0, bike: 0, run: 0, other: 0 };

    // Standard exponentially weighted moving average formulas from FITNESS.md
    // CTL: 42-day time constant
    swimCtl = swimCtl + (tssData.swim - swimCtl) / 42;
    bikeCtl = bikeCtl + (tssData.bike - bikeCtl) / 42;
    runCtl = runCtl + (tssData.run - runCtl) / 42;

    // ATL: 7-day time constant
    swimAtl = swimAtl + (tssData.swim - swimAtl) / 7;
    bikeAtl = bikeAtl + (tssData.bike - bikeAtl) / 7;
    runAtl = runAtl + (tssData.run - runAtl) / 7;

    const triCtl = swimCtl + bikeCtl + runCtl;
    const triAtl = swimAtl + bikeAtl + runAtl;
    const triTsb = triCtl - triAtl;

    records.push({
      date: dateStr,
      swimTss: tssData.swim,
      bikeTss: tssData.bike,
      runTss: tssData.run,
      otherTss: tssData.other,
      totalTriTss: tssData.swim + tssData.bike + tssData.run,
      totalAllTss: tssData.swim + tssData.bike + tssData.run + tssData.other,

      swimCtl: Math.round(swimCtl * 10) / 10,
      bikeCtl: Math.round(bikeCtl * 10) / 10,
      runCtl: Math.round(runCtl * 10) / 10,
      triCtl: Math.round(triCtl * 10) / 10,

      swimAtl: Math.round(swimAtl * 10) / 10,
      bikeAtl: Math.round(bikeAtl * 10) / 10,
      runAtl: Math.round(runAtl * 10) / 10,
      triAtl: Math.round(triAtl * 10) / 10,

      swimTsb: Math.round((swimCtl - swimAtl) * 10) / 10,
      bikeTsb: Math.round((bikeCtl - bikeAtl) * 10) / 10,
      runTsb: Math.round((runCtl - runAtl) * 10) / 10,
      triTsb: Math.round(triTsb * 10) / 10,
    });

    cur.setDate(cur.getDate() + 1);
  }

  // Filter to the requested lookback window for display
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - daysLookback);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  return records.filter((r) => r.date >= cutoffStr);
}

/**
 * Computes the event-specific Triathlon Fitness Index (TFI) based on FITNESS.md:
 * TFI = 100 * (S^ws * B^wb * R^wr)
 * Where S, B, R are discipline CTLs normalized against target CTLs.
 */
export function calculateTriathlonFitnessIndex(
  currentSwimCtl: number,
  currentBikeCtl: number,
  currentRunCtl: number,
  model: TriathlonDistanceModel = 'middle_70_3',
  goals?: TrainingGoal[]
): TriathlonFitnessIndexResult {
  let weights: TriathlonTargetWeights;

  if (model === 'custom_goal' && goals && goals.length > 0) {
    const aGoal = goals.find((g) => g.priority === 'A' && g.eventType === 'triathlon') || goals[0];
    if (aGoal && aGoal.triathlonSplits) {
      const sSec = aGoal.triathlonSplits.swimTargetTimeSec || 2100;
      const bSec = aGoal.triathlonSplits.bikeTargetTimeSec || 9000;
      const rSec = aGoal.triathlonSplits.runTargetTimeSec || 5700;
      const totalSec = sSec + bSec + rSec;

      const sw = totalSec > 0 ? sSec / totalSec : 0.12;
      const bw = totalSec > 0 ? bSec / totalSec : 0.53;
      const rw = totalSec > 0 ? rSec / totalSec : 0.35;

      weights = {
        label: `${aGoal.name} Target Profile`,
        swimWeight: Math.round(sw * 1000) / 1000,
        bikeWeight: Math.round(bw * 1000) / 1000,
        runWeight: Math.round(rw * 1000) / 1000,
        targetSwimCtl: 24,
        targetBikeCtl: 52,
        targetRunCtl: 34,
        targetTriCtl: 110,
        targetCtlRange: [95, 126],
        raceDayCtlRange: [94, 100],
        weeklyHoursTarget: 14.7,
      };
    } else {
      weights = DISTANCE_MODEL_PROFILES.middle_70_3;
    }
  } else {
    weights = DISTANCE_MODEL_PROFILES[model === 'custom_goal' ? 'middle_70_3' : model];
  }

  // Ensure minimum baseline ratio to prevent zero-penalty in geometric mean
  const safeSwimCtl = Math.max(1, currentSwimCtl);
  const safeBikeCtl = Math.max(1, currentBikeCtl);
  const safeRunCtl = Math.max(1, currentRunCtl);

  const rawSwimRatio = safeSwimCtl / weights.targetSwimCtl;
  const rawBikeRatio = safeBikeCtl / weights.targetBikeCtl;
  const rawRunRatio = safeRunCtl / weights.targetRunCtl;

  // Clamped ratio for realistic logarithmic scoring (5% to 150%)
  const s = Math.min(1.5, Math.max(0.05, rawSwimRatio));
  const b = Math.min(1.5, Math.max(0.05, rawBikeRatio));
  const r = Math.min(1.5, Math.max(0.05, rawRunRatio));

  // Geometric mean: 100 * (S^ws * B^wb * R^wr)
  const tfi = 100 * Math.pow(s, weights.swimWeight) * Math.pow(b, weights.bikeWeight) * Math.pow(r, weights.runWeight);

  // Identify limiting factor
  const disciplines = [
    { discipline: 'swim' as const, name: 'Swimming', ratio: rawSwimRatio, gapToTarget: Math.max(0, weights.targetSwimCtl - currentSwimCtl) },
    { discipline: 'bike' as const, name: 'Cycling', ratio: rawBikeRatio, gapToTarget: Math.max(0, weights.targetBikeCtl - currentBikeCtl) },
    { discipline: 'run' as const, name: 'Running', ratio: rawRunRatio, gapToTarget: Math.max(0, weights.targetRunCtl - currentRunCtl) },
  ];

  disciplines.sort((x, y) => x.ratio - y.ratio);
  const limiting = disciplines[0];

  const currentTriCtl = currentSwimCtl + currentBikeCtl + currentRunCtl;

  return {
    tfi: Math.round(tfi * 10) / 10,
    swimRatio: Math.round(rawSwimRatio * 1000) / 1000,
    bikeRatio: Math.round(rawBikeRatio * 1000) / 1000,
    runRatio: Math.round(rawRunRatio * 1000) / 1000,
    currentSwimCtl: Math.round(currentSwimCtl * 10) / 10,
    currentBikeCtl: Math.round(currentBikeCtl * 10) / 10,
    currentRunCtl: Math.round(currentRunCtl * 10) / 10,
    currentTriCtl: Math.round(currentTriCtl * 10) / 10,
    currentTriAtl: 0,
    currentTriTsb: 0,
    weights,
    limitingFactor: limiting,
  };
}

// ============================================================================
// FIRST-PRINCIPLES AGE-GROUP CTL TARGET, RAMP RATE & PERIODIZATION ENGINE
// ============================================================================

export interface DisciplineIfStats {
  discipline: 'swim' | 'bike' | 'run';
  medianIf: number;
  sdIf: number;
  priorIf: number;
  exponent: 2 | 3; // p_d: 2 for bike/run, 3 for swim sTSS
  tssPerHour: number; // IF^p * 100
  sessionCount: number;
  source: 'empirical' | 'prior';
}

export interface DisciplineCtlDerivation {
  discipline: 'swim' | 'bike' | 'run';
  label: string;
  expectedRaceHours: number; // T_d
  longSessionMultiplier: number; // f_d
  longSessionCapHours: number; // cap_d
  longSessionHours: number; // L_d = min(f_d * T_d, cap_d)
  weeklyShare: number; // s_d
  weeklyHours: number; // H_d = L_d / s_d
  weeklyHoursRange: [number, number];
  ifStats: DisciplineIfStats;
  weeklyTss: number; // H_d * IF_d^p_d * 100
  targetPeakCtl: number; // weeklyTss / 7
  targetCtlRange: [number, number]; // [CTL_low, CTL_high]
  targetRaceDayCtl: number; // ~0.875 * targetPeakCtl
  currentCtl: number;
  maxSafeRampPerWeek: number; // r_d (pts/wk)
  ctlGainPerExtraHour: number; // (IF_d^p_d * 100) / 7
}

export interface EventCtlDerivationResult {
  sport: 'triathlon' | 'run' | 'bike' | 'swim';
  eventLabel: string;
  matchedGoalName?: string;
  matchedGoalDate?: string;

  // 1. Core Identity & Range Outputs
  targetPeakCtl: number;
  targetCtlRange: [number, number]; // [CTL_low, CTL_high]
  targetRaceDayCtlRange: [number, number]; // [CTL_peak * 0.85, CTL_peak * 0.90]
  totalWeeklyHours: number; // H_total = sum H_d
  totalWeeklyHoursRange: [number, number];
  totalWeeklyTssAtPeak: number;
  currentCtl: number;
  currentAtl: number;
  currentTsb: number;

  // 2. Per-Discipline Breakdown
  disciplines: DisciplineCtlDerivation[];

  // 3. Periodization & Block Mechanics
  periodizationModel: '0' | '3weeks' | '4weeks';
  periodizationLabel: string; // e.g. "3:1 Block (3 Build + 1 Recovery @ 65%)"
  taperWeeks: number; // 2 for 70.3/HM, 3 for Ironman/Marathon, 1 for Sprint/5K/10K
  recoveryWeekLoadRatio: number; // 0.65
  netToBuildRampRatio: number; // e.g. ~0.58 for 3:1, ~0.50 for 2:1, 0.85 for continuous

  // 4. Ramp Rate & Guardrails
  headlineMaxBuildRamp: number; // e.g. 5.5 pts/wk (from CTL tier + history + sport constraint)
  effectiveMaxNetRamp: number; // e.g. 3.2 pts/wk after recovery weeks
  historicalMax4WkRamp: number; // athlete's empirical max 4w ramp from timeline
  nextBuildWeekTssTarget: number; // 7 * (CTL_now + 6 * recommendedBuildRamp)
  recommendedBuildRamp: number;
  tsbWarning: boolean;
  projectedBuildTsb: number;

  // 5. Back-Scheduling & Feasibility
  weeksToRace: number;
  weeksToPeak: number; // weeksToRace - taperWeeks
  buildWeeksAvailable: number;
  recoveryWeeksCount: number;
  availableWeeklyHours: number;
  steadyStateWeeksToTarget: number | null; // 6 * ln((CTL_ss - CTL_now) / (CTL_ss - CTL_target))
  requiredNetRampPerWeek: number; // (CTL_target - CTL_now) / weeksToPeak
  requiredBuildRampPerWeek: number; // accounting for recovery weeks
  isHoursFeasible: boolean; // H_total <= H_available
  isRampFeasible: boolean; // requiredBuildRampPerWeek <= headlineMaxBuildRamp
  isOverallFeasible: boolean;

  // 6. Nearest Feasible Alternatives (when check fails or for planning comparison)
  alternatives: {
    reachablePeakCtlByRace: number;
    reachableRaceDayCtl: number;
    earliestFeasibleWeeksToRace: number;
    earliestFeasibleDateStr: string;
    highestLeverageDiscipline: {
      discipline: 'swim' | 'bike' | 'run';
      label: string;
      ctlPerExtraHour: number;
    };
  };
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeStdDev(values: number[], meanOrMedian: number): number {
  if (values.length < 2) return 0.04;
  const variance = values.reduce((acc, v) => acc + Math.pow(v - meanOrMedian, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Extracts empirical per-session Intensity Factor (IF) over the last 8–12 weeks (84 days)
 * on the exact same threshold basis used for CTL, falling back to Bayesian priors when < 4 sessions exist.
 */
export function computeEmpiricalDisciplineIf(
  activities: StravaActivity[],
  activityDetails: Record<string, StravaActivityDetailsRecord>,
  athleteProfile: AthleteProfile,
  lookbackDays: number = 84
): Record<'swim' | 'bike' | 'run', DisciplineIfStats> {
  const cutoffMs = Date.now() - lookbackDays * 86400 * 1000;
  const samples: Record<'swim' | 'bike' | 'run', number[]> = {
    swim: [],
    bike: [],
    run: [],
  };

  activities.forEach((act) => {
    if (!act.start_date || act.isDeleted) return;
    const tMs = new Date(act.start_date).getTime();
    if (isNaN(tMs) || tMs < cutoffMs) return;

    const movingSec = act.moving_time || 0;
    if (movingSec < 15 * 60) return; // ignore micro warmups < 15 min

    const details = activityDetails[String(act.id)];
    if (details?.calibration?.isIgnoredFromTrainingStatus) return;

    const hours = movingSec / 3600;
    const res = calculateActivityTSS(act, details, athleteProfile);
    const tss = details?.calibration?.manualTss ?? res?.tss ?? act.suffer_score ?? 0;
    if (tss <= 0 || hours <= 0) return;

    const { category } = classifyActivity(act);
    const tssPerHour = tss / hours;

    if (category === 'Swim') {
      // sTSS = hours * IF^3 * 100 => IF = cbrt(tssPerHour / 100)
      const rawIf = Math.cbrt(tssPerHour / 100);
      if (rawIf >= 0.45 && rawIf <= 1.15) {
        samples.swim.push(rawIf);
      }
    } else if (category === 'Bike') {
      // TSS = hours * IF^2 * 100 => IF = sqrt(tssPerHour / 100)
      const rawIf = Math.sqrt(tssPerHour / 100);
      if (rawIf >= 0.45 && rawIf <= 1.15) {
        samples.bike.push(rawIf);
      }
    } else if (category === 'Run') {
      // rTSS = hours * IF^2 * 100 => IF = sqrt(tssPerHour / 100)
      const rawIf = Math.sqrt(tssPerHour / 100);
      if (rawIf >= 0.45 && rawIf <= 1.15) {
        samples.run.push(rawIf);
      }
    }
  });

  const priors: Record<'swim' | 'bike' | 'run', { prior: number; exp: 2 | 3; minClamp: number; maxClamp: number }> = {
    swim: { prior: 0.80, exp: 3, minClamp: 0.68, maxClamp: 0.90 },
    bike: { prior: 0.70, exp: 2, minClamp: 0.62, maxClamp: 0.82 },
    run: { prior: 0.78, exp: 2, minClamp: 0.68, maxClamp: 0.86 },
  };

  const result = {} as Record<'swim' | 'bike' | 'run', DisciplineIfStats>;

  (['swim', 'bike', 'run'] as const).forEach((d) => {
    const arr = samples[d];
    const cfg = priors[d];
    const hasEnoughData = arr.length >= 4;
    const rawMedian = hasEnoughData ? computeMedian(arr) : cfg.prior;
    const medianIf = Math.round(Math.min(cfg.maxClamp, Math.max(cfg.minClamp, rawMedian)) * 100) / 100;
    const rawSd = hasEnoughData ? computeStdDev(arr, medianIf) : 0.04;
    const sdIf = Math.round(Math.min(0.07, Math.max(0.03, rawSd)) * 100) / 100;
    const tssPerHour = Math.round(Math.pow(medianIf, cfg.exp) * 100 * 10) / 10;

    result[d] = {
      discipline: d,
      medianIf,
      sdIf,
      priorIf: cfg.prior,
      exponent: cfg.exp,
      tssPerHour,
      sessionCount: arr.length,
      source: hasEnoughData ? 'empirical' : 'prior',
    };
  });

  return result;
}

/**
 * Estimates athlete's weekly available training hours from their weeklyAvailability profile.
 */
export function estimateAvailableWeeklyHours(athleteProfile: AthleteProfile, defaultHours: number = 14): number {
  const avail = athleteProfile.weeklyAvailability;
  if (!avail || Object.keys(avail).length === 0) return defaultHours;

  let totalHours = 0;
  for (const dayCfg of Object.values(avail)) {
    if (!dayCfg) continue;
    const windows = dayCfg.availableWindows || [];
    if (windows.length === 0) continue;
    if (dayCfg.isWorkday) {
      totalHours += windows.length >= 2 ? 1.75 : 1.15;
    } else {
      totalHours += 3.5;
    }
  }
  return Math.max(4, Math.round(totalHours * 10) / 10);
}

/**
 * Computes the athlete's highest historical 4-week rolling CTL ramp rate (points/week) from their timeline.
 */
export function computeHistoricalMaxRampRate(
  timeline: DailyFitnessRecord[],
  sport: 'triathlon' | 'run' | 'bike' | 'swim'
): number {
  if (timeline.length < 29) return 0;
  let maxRampPerWeek = 0;

  for (let i = 28; i < timeline.length; i++) {
    const cur = timeline[i];
    const prev = timeline[i - 28];
    const curCtl =
      sport === 'run' ? cur.runCtl : sport === 'bike' ? cur.bikeCtl : sport === 'swim' ? cur.swimCtl : cur.triCtl;
    const prevCtl =
      sport === 'run' ? prev.runCtl : sport === 'bike' ? prev.bikeCtl : sport === 'swim' ? prev.swimCtl : prev.triCtl;
    const rampPerWk = (curCtl - prevCtl) / 4;
    // Ignore extreme TSB crash weeks (< -35)
    const curTsb =
      sport === 'run' ? cur.runTsb : sport === 'bike' ? cur.bikeTsb : sport === 'swim' ? cur.swimTsb : cur.triTsb;
    if (curTsb >= -32 && rampPerWk > maxRampPerWeek) {
      maxRampPerWeek = rampPerWk;
    }
  }

  return Math.round(maxRampPerWeek * 10) / 10;
}

/**
 * Derives realistic Age-Group CTL targets, weekly hours, per-discipline loads, ramp rate guardrails,
 * and periodized back-scheduling feasibility for any selected discipline & distance preset.
 */
export function deriveEventCtlTargetAndFeasibility(params: {
  sport: 'triathlon' | 'run' | 'bike' | 'swim';
  triModel?: TriathlonDistanceModel;
  runModel?: RunningDistanceModel;
  bikeModel?: CyclingDistanceModel;
  swimModel?: SwimmingDistanceModel;
  activities: StravaActivity[];
  activityDetails: Record<string, StravaActivityDetailsRecord>;
  athleteProfile: AthleteProfile;
  goals?: TrainingGoal[];
  fitnessTimeline: DailyFitnessRecord[];
  customAvailableWeeklyHours?: number;
  customWeeksToRace?: number;
}): EventCtlDerivationResult {
  const {
    sport,
    triModel = 'middle_70_3',
    runModel = 'ten_miler_10',
    bikeModel = 'fifty_m_50',
    swimModel = 'swim_1_9k',
    activities,
    activityDetails,
    athleteProfile,
    goals = [],
    fitnessTimeline,
    customAvailableWeeklyHours,
    customWeeksToRace,
  } = params;

  const latest = fitnessTimeline[fitnessTimeline.length - 1] || {
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
  };

  const ifMap = computeEmpiricalDisciplineIf(activities, activityDetails, athleteProfile, 84);

  // Athlete physiological pace/speed helpers for expected race duration T_d
  const runThresholdSecPerKm = athleteProfile.thresholdPaceRunOutdoorSec || 232; // ~3:52/km
  const swimCssSecPer100m = athleteProfile.swimOpenWaterPace100mSec || athleteProfile.swimPoolPace100mSec || 95;
  const bikeFtp = athleteProfile.bikeFtp || 280;
  // Approximate flat road speed in km/h from watts
  const estimateBikeSpeedKmh = (ifFactor: number) => {
    const watts = bikeFtp * ifFactor;
    return Math.max(25, Math.min(44, 20 + Math.pow(watts, 0.5) * 1.15));
  };

  interface RawLegSpec {
    discipline: 'swim' | 'bike' | 'run';
    label: string;
    expectedRaceHours: number; // T_d
    fLow: number;
    fMid: number;
    fHigh: number;
    capHours: number; // cap_d
    sLow: number; // higher share = fewer weekly hours
    sMid: number;
    sHigh: number; // lower share = more weekly hours
    maxSafeRamp: number;
  }

  let eventLabel = '';
  let taperWeeks = 2;
  let matchedGoal: TrainingGoal | undefined;
  const legSpecs: RawLegSpec[] = [];

  if (sport === 'triathlon') {
    const effModel = triModel === 'custom_goal' ? 'middle_70_3' : triModel;
    matchedGoal = goals.find((g) => g.eventType === 'triathlon' && g.status === 'upcoming');

    if (effModel === 'sprint') {
      eventLabel = 'Sprint Triathlon (750m / 20km / 5km)';
      taperWeeks = 1;
      const tSwim = (7.5 * swimCssSecPer100m * 1.03) / 3600;
      const tBike = 20 / estimateBikeSpeedKmh(0.90);
      const tRun = (5 * runThresholdSecPerKm * 1.02) / 3600;
      legSpecs.push(
        { discipline: 'swim', label: 'Swimming', expectedRaceHours: Math.max(0.2, tSwim), fLow: 2.2, fMid: 2.6, fHigh: 3.0, capHours: 0.75, sLow: 0.38, sMid: 0.35, sHigh: 0.32, maxSafeRamp: 3.5 },
        { discipline: 'bike', label: 'Cycling', expectedRaceHours: Math.max(0.5, tBike), fLow: 2.0, fMid: 2.3, fHigh: 2.6, capHours: 1.6, sLow: 0.48, sMid: 0.44, sHigh: 0.40, maxSafeRamp: 5.5 },
        { discipline: 'run', label: 'Running', expectedRaceHours: Math.max(0.3, tRun), fLow: 2.0, fMid: 2.4, fHigh: 2.7, capHours: 1.0, sLow: 0.46, sMid: 0.42, sHigh: 0.38, maxSafeRamp: 3.0 }
      );
    } else if (effModel === 'olympic') {
      eventLabel = 'Olympic Triathlon (1.5km / 40km / 10km)';
      taperWeeks = 2;
      const tSwim = (15 * swimCssSecPer100m * 1.05) / 3600;
      const tBike = 40 / estimateBikeSpeedKmh(0.84);
      const tRun = (10 * runThresholdSecPerKm * 1.06) / 3600;
      legSpecs.push(
        { discipline: 'swim', label: 'Swimming', expectedRaceHours: Math.max(0.38, tSwim), fLow: 1.6, fMid: 1.85, fHigh: 2.1, capHours: 0.9, sLow: 0.35, sMid: 0.32, sHigh: 0.29, maxSafeRamp: 3.5 },
        { discipline: 'bike', label: 'Cycling', expectedRaceHours: Math.max(1.0, tBike), fLow: 1.6, fMid: 1.8, fHigh: 2.0, capHours: 2.3, sLow: 0.44, sMid: 0.40, sHigh: 0.37, maxSafeRamp: 6.0 },
        { discipline: 'run', label: 'Running', expectedRaceHours: Math.max(0.6, tRun), fLow: 1.5, fMid: 1.7, fHigh: 1.9, capHours: 1.35, sLow: 0.42, sMid: 0.38, sHigh: 0.35, maxSafeRamp: 3.5 }
      );
    } else if (effModel === 'middle_70_3') {
      eventLabel = 'Half IRONMAN 70.3 (1.9km / 90km / 21.1km)';
      taperWeeks = 2;
      const splitSwimSec = matchedGoal?.triathlonSplits?.swimTargetTimeSec;
      const splitBikeSec = matchedGoal?.triathlonSplits?.bikeTargetTimeSec;
      const splitRunSec = matchedGoal?.triathlonSplits?.runTargetTimeSec;

      const tSwim = splitSwimSec ? splitSwimSec / 3600 : Math.max(0.5, (19 * swimCssSecPer100m * 1.07) / 3600);
      const tBike = splitBikeSec ? splitBikeSec / 3600 : Math.max(2.3, 90 / estimateBikeSpeedKmh(0.78));
      const tRun = splitRunSec ? splitRunSec / 3600 : Math.max(1.35, (21.0975 * runThresholdSecPerKm * 1.10) / 3600);

      // Matches Claude's worked 70.3 parameters: ~1.0h long swim (s=0.30 -> 3.3h), ~3.0h long ride (s=0.40 -> 7.5h), ~1.5h long run (s=0.38 -> 3.9h)
      legSpecs.push(
        { discipline: 'swim', label: 'Swimming', expectedRaceHours: tSwim, fLow: 1.55, fMid: 1.75, fHigh: 1.95, capHours: 1.05, sLow: 0.33, sMid: 0.30, sHigh: 0.28, maxSafeRamp: 4.0 },
        { discipline: 'bike', label: 'Cycling', expectedRaceHours: tBike, fLow: 1.10, fMid: 1.22, fHigh: 1.35, capHours: 3.2, sLow: 0.43, sMid: 0.40, sHigh: 0.37, maxSafeRamp: 6.0 },
        { discipline: 'run', label: 'Running', expectedRaceHours: tRun, fLow: 0.95, fMid: 1.05, fHigh: 1.15, capHours: 1.65, sLow: 0.41, sMid: 0.38, sHigh: 0.35, maxSafeRamp: 3.5 }
      );
    } else {
      // Full Ironman
      eventLabel = 'Full IRONMAN 140.6 (3.8km / 180km / 42.2km)';
      taperWeeks = 3;
      const splitSwimSec = matchedGoal?.triathlonSplits?.swimTargetTimeSec;
      const splitBikeSec = matchedGoal?.triathlonSplits?.bikeTargetTimeSec;
      const splitRunSec = matchedGoal?.triathlonSplits?.runTargetTimeSec;

      const tSwim = splitSwimSec ? splitSwimSec / 3600 : Math.max(1.05, (38 * swimCssSecPer100m * 1.10) / 3600);
      const tBike = splitBikeSec ? splitBikeSec / 3600 : Math.max(5.0, 180 / estimateBikeSpeedKmh(0.70));
      const tRun = splitRunSec ? splitRunSec / 3600 : Math.max(3.2, (42.195 * runThresholdSecPerKm * 1.18) / 3600);

      // Matches Claude's worked Ironman parameters: ~1.2h long swim (s=0.30 -> 4.0h), ~5.0h long ride (s=0.50 -> 10.0h), ~2.25h long run (s=0.45 -> 5.0h)
      legSpecs.push(
        { discipline: 'swim', label: 'Swimming', expectedRaceHours: tSwim, fLow: 0.95, fMid: 1.05, fHigh: 1.15, capHours: 1.25, sLow: 0.33, sMid: 0.30, sHigh: 0.28, maxSafeRamp: 4.0 },
        { discipline: 'bike', label: 'Cycling', expectedRaceHours: tBike, fLow: 0.82, fMid: 0.92, fHigh: 1.00, capHours: 5.2, sLow: 0.53, sMid: 0.50, sHigh: 0.46, maxSafeRamp: 6.5 },
        { discipline: 'run', label: 'Running', expectedRaceHours: tRun, fLow: 0.52, fMid: 0.60, fHigh: 0.66, capHours: 2.25, sLow: 0.48, sMid: 0.45, sHigh: 0.42, maxSafeRamp: 3.5 }
      );
    }
  } else if (sport === 'run') {
    const runProf = RUNNING_MODEL_PROFILES[runModel];
    eventLabel = runProf.label;
    matchedGoal = goals.find((g) => g.eventType === 'run' && g.status === 'upcoming');
    const distKmMap: Record<RunningDistanceModel, number> = {
      marathon_26_2: 42.195,
      half_13_1: 21.0975,
      ten_miler_10: 16.0934,
      ten_k_10: 10.0,
      five_k_5: 5.0,
    };
    const paceMultMap: Record<RunningDistanceModel, number> = {
      marathon_26_2: 1.12,
      half_13_1: 1.05,
      ten_miler_10: 1.02,
      ten_k_10: 1.00,
      five_k_5: 0.95,
    };
    taperWeeks = runModel === 'marathon_26_2' ? 3 : runModel === 'half_13_1' || runModel === 'ten_miler_10' ? 2 : 1;
    const distKm = distKmMap[runModel];
    const tRun = Math.max(0.28, (distKm * runThresholdSecPerKm * paceMultMap[runModel]) / 3600);

    const fMid = runProf.longRunHours / tRun;
    const sMid = runProf.longRunHours / runProf.weeklyHoursTarget;
    legSpecs.push({
      discipline: 'run',
      label: 'Running',
      expectedRaceHours: tRun,
      fLow: fMid * 0.92,
      fMid,
      fHigh: fMid * 1.08,
      capHours: runModel === 'marathon_26_2' ? 2.5 : 2.1,
      sLow: sMid * 1.08,
      sMid,
      sHigh: sMid * 0.92,
      maxSafeRamp: 3.5, // Running bone/tendon ramp cap (3–4 pts/wk)
    });
  } else if (sport === 'bike') {
    const bikeProf = CYCLING_MODEL_PROFILES[bikeModel];
    eventLabel = bikeProf.label;
    matchedGoal = goals.find((g) => g.eventType === 'bike' && g.status === 'upcoming');
    const distKmMap: Record<CyclingDistanceModel, number> = {
      century_100: 160.9,
      fifty_m_50: 80.5,
      twenty_five_m_25: 40.2,
      ten_m_tt_10: 16.1,
    };
    taperWeeks = bikeModel === 'century_100' ? 2 : 1;
    const tBike = Math.max(0.35, distKmMap[bikeModel] / estimateBikeSpeedKmh(0.82));
    const fMid = bikeProf.longRideHours / tBike;
    const sMid = bikeProf.longRideHours / bikeProf.weeklyHoursTarget;
    legSpecs.push({
      discipline: 'bike',
      label: 'Cycling',
      expectedRaceHours: tBike,
      fLow: fMid * 0.90,
      fMid,
      fHigh: fMid * 1.10,
      capHours: 5.5,
      sLow: sMid * 1.08,
      sMid,
      sHigh: sMid * 0.92,
      maxSafeRamp: 6.0, // Cycling ramp cap (5–7 pts/wk)
    });
  } else {
    const swimProf = SWIMMING_MODEL_PROFILES[swimModel];
    eventLabel = swimProf.label;
    matchedGoal = goals.find((g) => g.eventType === 'swim' && g.status === 'upcoming');
    taperWeeks = swimModel === 'swim_10k' || swimModel === 'swim_5k' || swimModel === 'swim_3_8k' ? 2 : 1;
    const distMMap: Record<SwimmingDistanceModel, number> = {
      swim_50m: 50,
      swim_100m: 100,
      swim_400m: 400,
      swim_1_9k: 1900,
      swim_3_8k: 3800,
      swim_5k: 5000,
      swim_10k: 10000,
    };
    const tSwim = Math.max(0.1, ((distMMap[swimModel] / 100) * swimCssSecPer100m) / 3600);
    const fMid = swimProf.longSwimHours / tSwim;
    const sMid = swimProf.longSwimHours / swimProf.weeklyHoursTarget;
    legSpecs.push({
      discipline: 'swim',
      label: 'Swimming',
      expectedRaceHours: tSwim,
      fLow: fMid * 0.90,
      fMid,
      fHigh: fMid * 1.10,
      capHours: 2.5,
      sLow: sMid * 1.08,
      sMid,
      sHigh: sMid * 0.92,
      maxSafeRamp: 4.0,
    });
  }

  // Compute per-discipline derivations
  const disciplines: DisciplineCtlDerivation[] = legSpecs.map((spec) => {
    const ifStats = ifMap[spec.discipline];
    const p = ifStats.exponent;

    const lLow = Math.min(spec.fLow * spec.expectedRaceHours, spec.capHours * 0.92);
    const lMid = Math.min(spec.fMid * spec.expectedRaceHours, spec.capHours);
    const lHigh = Math.min(spec.fHigh * spec.expectedRaceHours, spec.capHours * 1.06);

    const hLow = Math.round((lLow / spec.sLow) * 10) / 10;
    const hMid = Math.round((lMid / spec.sMid) * 10) / 10;
    const hHigh = Math.round((lHigh / spec.sHigh) * 10) / 10;

    const ifLow = Math.max(0.55, ifStats.medianIf - ifStats.sdIf * 0.5);
    const ifMid = ifStats.medianIf;
    const ifHigh = Math.min(0.92, ifStats.medianIf + ifStats.sdIf * 0.5);

    const tssLow = hLow * Math.pow(ifLow, p) * 100;
    const tssMid = hMid * Math.pow(ifMid, p) * 100;
    const tssHigh = hHigh * Math.pow(ifHigh, p) * 100;

    const ctlLow = Math.round(tssLow / 7);
    const ctlMid = Math.round(tssMid / 7);
    const ctlHigh = Math.round(tssHigh / 7);

    const currentCtl =
      spec.discipline === 'swim'
        ? latest.swimCtl
        : spec.discipline === 'bike'
        ? latest.bikeCtl
        : latest.runCtl;

    const ctlGainPerExtraHour = Math.round(((Math.pow(ifMid, p) * 100) / 7) * 10) / 10;

    return {
      discipline: spec.discipline,
      label: spec.label,
      expectedRaceHours: Math.round(spec.expectedRaceHours * 100) / 100,
      longSessionMultiplier: Math.round(spec.fMid * 100) / 100,
      longSessionCapHours: spec.capHours,
      longSessionHours: Math.round(lMid * 100) / 100,
      weeklyShare: Math.round(spec.sMid * 100) / 100,
      weeklyHours: hMid,
      weeklyHoursRange: [hLow, hHigh],
      ifStats,
      weeklyTss: Math.round(tssMid),
      targetPeakCtl: ctlMid,
      targetCtlRange: [ctlLow, ctlHigh],
      targetRaceDayCtl: Math.round(ctlMid * 0.875),
      currentCtl,
      maxSafeRampPerWeek: spec.maxSafeRamp,
      ctlGainPerExtraHour,
    };
  });

  const targetPeakCtl = disciplines.reduce((acc, d) => acc + d.targetPeakCtl, 0);
  const targetCtlLow = disciplines.reduce((acc, d) => acc + d.targetCtlRange[0], 0);
  const targetCtlHigh = disciplines.reduce((acc, d) => acc + d.targetCtlRange[1], 0);
  const totalWeeklyHours = Math.round(disciplines.reduce((acc, d) => acc + d.weeklyHours, 0) * 10) / 10;
  const totalHoursLow = Math.round(disciplines.reduce((acc, d) => acc + d.weeklyHoursRange[0], 0) * 10) / 10;
  const totalHoursHigh = Math.round(disciplines.reduce((acc, d) => acc + d.weeklyHoursRange[1], 0) * 10) / 10;
  const totalWeeklyTssAtPeak = disciplines.reduce((acc, d) => acc + d.weeklyTss, 0);

  const currentCtl =
    sport === 'run'
      ? latest.runCtl
      : sport === 'bike'
      ? latest.bikeCtl
      : sport === 'swim'
      ? latest.swimCtl
      : latest.triCtl;
  const currentAtl =
    sport === 'run'
      ? latest.runAtl
      : sport === 'bike'
      ? latest.bikeAtl
      : sport === 'swim'
      ? latest.swimAtl
      : latest.triAtl;
  const currentTsb =
    sport === 'run'
      ? latest.runTsb
      : sport === 'bike'
      ? latest.bikeTsb
      : sport === 'swim'
      ? latest.swimTsb
      : latest.triTsb;

  // 3. Periodization block mechanics
  const periodizationModel = athleteProfile.periodization || '4weeks';
  let periodizationLabel = '3:1 Block (3 Build Wks + 1 Recovery Wk @ 65% load)';
  // In a 3:1 block: 3 build weeks at +6 and 1 recovery week at -3.5 nets ~14.5 pts over 4 weeks (~0.60 of headline build ramp)
  let netToBuildRampRatio = 0.60;
  if (periodizationModel === '3weeks') {
    periodizationLabel = '2:1 Block (2 Build Wks + 1 Recovery Wk @ 65% load)';
    netToBuildRampRatio = 0.52;
  } else if (periodizationModel === '0') {
    periodizationLabel = 'Continuous Progressive (Linear Ramp)';
    netToBuildRampRatio = 0.85;
  }

  // 4. Ramp Rate Limits (by CTL tier + Sport + Athlete History)
  // Base tier rule: CTL < 50 => 5.0, 50–100 => 5.5, > 100 => 4.2
  const tierCap = currentCtl < 50 ? 5.2 : currentCtl <= 100 ? 5.8 : 4.2;
  // Sport tissue cap: Running is rougher on bones/tendons (3.5 pts/wk) than Triathlon (6.0 pts/wk) or Cycling (6.0 pts/wk)
  const sportCap = sport === 'run' ? 3.5 : sport === 'swim' ? 4.0 : 6.0;
  const historicalMax4WkRamp = computeHistoricalMaxRampRate(fitnessTimeline, sport);
  const baseHeadlineMax = Math.min(tierCap, sportCap);
  const headlineMaxBuildRamp =
    historicalMax4WkRamp > 2.5
      ? Math.round(Math.min(sportCap + 0.5, Math.max(baseHeadlineMax * 0.85, historicalMax4WkRamp * 0.95)) * 10) / 10
      : Math.round(baseHeadlineMax * 10) / 10;

  const effectiveMaxNetRamp = Math.round(headlineMaxBuildRamp * netToBuildRampRatio * 10) / 10;

  // 5. Back-scheduling from race date
  let defaultWeeks = 16;
  if (matchedGoal?.eventDate) {
    const diffDays = (new Date(matchedGoal.eventDate).getTime() - Date.now()) / (86400 * 1000);
    if (diffDays > 14 && diffDays < 104 * 7) {
      defaultWeeks = Math.round(diffDays / 7);
    }
  }
  const weeksToRace = customWeeksToRace ?? defaultWeeks;
  const weeksToPeak = Math.max(1, weeksToRace - taperWeeks);

  const cycleLen = periodizationModel === '4weeks' ? 4 : periodizationModel === '3weeks' ? 3 : 0;
  const recoveryWeeksCount = cycleLen > 0 ? Math.floor(weeksToPeak / cycleLen) : 0;
  const buildWeeksAvailable = Math.max(1, weeksToPeak - recoveryWeeksCount);

  const ctlGap = Math.max(0, targetPeakCtl - currentCtl);
  const requiredNetRampPerWeek = Math.round((ctlGap / weeksToPeak) * 10) / 10;
  const requiredBuildRampPerWeek =
    ctlGap <= 0 ? 0 : Math.round((ctlGap / (weeksToPeak * netToBuildRampRatio)) * 10) / 10;

  const recommendedBuildRamp = Math.min(headlineMaxBuildRamp, Math.max(1.5, requiredBuildRampPerWeek || 3.0));
  // Weekly TSS target formula: weekly TSS = 7 * (CTL_now + 6 * ramp)
  const nextBuildWeekTssTarget = Math.round(7 * (currentCtl + 6 * recommendedBuildRamp));
  const projectedDailyTss = nextBuildWeekTssTarget / 7;
  const projectedAtlAfterWeek = currentAtl + (projectedDailyTss - currentAtl) * (1 - Math.exp(-7 / 7));
  const projectedCtlAfterWeek = currentCtl + recommendedBuildRamp;
  const projectedBuildTsb = Math.round((projectedCtlAfterWeek - projectedAtlAfterWeek) * 10) / 10;
  const tsbWarning = projectedBuildTsb < -30;

  const availableWeeklyHours = customAvailableWeeklyHours ?? estimateAvailableWeeklyHours(athleteProfile, sport === 'triathlon' ? 15 : 6.5);

  // Steady-state CTL at athlete's available hours
  const avgTssPerHour = totalWeeklyHours > 0 ? totalWeeklyTssAtPeak / totalWeeklyHours : 55;
  const ctlSteadyStateAtAvailable = (availableWeeklyHours * avgTssPerHour) / 7;
  // weeks_to_target = 6 * ln((CTL_ss - CTL_now) / (CTL_ss - CTL_target))
  let steadyStateWeeksToTarget: number | null = null;
  const ctlSsForFormula = Math.max(ctlSteadyStateAtAvailable, targetPeakCtl * 1.12);
  if (ctlGap <= 0) {
    steadyStateWeeksToTarget = 0;
  } else if (ctlSsForFormula > targetPeakCtl && ctlSsForFormula > currentCtl) {
    const rawWeeks = 6 * Math.log((ctlSsForFormula - currentCtl) / (ctlSsForFormula - targetPeakCtl));
    steadyStateWeeksToTarget = Math.round((rawWeeks / netToBuildRampRatio) * 10) / 10;
  }

  const isHoursFeasible = totalWeeklyHours <= availableWeeklyHours + 0.3;
  const isRampFeasible = requiredBuildRampPerWeek <= headlineMaxBuildRamp + 0.2;
  const isOverallFeasible = isHoursFeasible && isRampFeasible && !tsbWarning;

  // 6. Nearest Feasible Alternatives
  const reachablePeakCtlByRace = Math.round(currentCtl + weeksToPeak * effectiveMaxNetRamp);
  const reachableRaceDayCtl = Math.round(reachablePeakCtlByRace * 0.875);
  const earliestFeasibleWeeksToPeak = ctlGap <= 0 ? 0 : Math.ceil(ctlGap / Math.max(0.5, effectiveMaxNetRamp));
  const earliestFeasibleWeeksToRace = earliestFeasibleWeeksToPeak + taperWeeks;
  const earliestDateObj = new Date(Date.now() + earliestFeasibleWeeksToRace * 7 * 86400 * 1000);
  const earliestFeasibleDateStr = earliestDateObj.toISOString().split('T')[0];

  const sortedByLeverage = [...disciplines].sort((a, b) => b.ctlGainPerExtraHour - a.ctlGainPerExtraHour);
  const topLev = sortedByLeverage[0] || { discipline: 'bike' as const, label: 'Cycling', ctlGainPerExtraHour: 7.0 };

  return {
    sport,
    eventLabel,
    matchedGoalName: matchedGoal?.name,
    matchedGoalDate: matchedGoal?.eventDate,
    targetPeakCtl,
    targetCtlRange: [targetCtlLow, targetCtlHigh],
    targetRaceDayCtlRange: [Math.round(targetPeakCtl * 0.85), Math.round(targetPeakCtl * 0.90)],
    totalWeeklyHours,
    totalWeeklyHoursRange: [totalHoursLow, totalHoursHigh],
    totalWeeklyTssAtPeak,
    currentCtl,
    currentAtl,
    currentTsb,
    disciplines,
    periodizationModel,
    periodizationLabel,
    taperWeeks,
    recoveryWeekLoadRatio: 0.65,
    netToBuildRampRatio,
    headlineMaxBuildRamp,
    effectiveMaxNetRamp,
    historicalMax4WkRamp,
    nextBuildWeekTssTarget,
    recommendedBuildRamp,
    tsbWarning,
    projectedBuildTsb,
    weeksToRace,
    weeksToPeak,
    buildWeeksAvailable,
    recoveryWeeksCount,
    availableWeeklyHours,
    steadyStateWeeksToTarget,
    requiredNetRampPerWeek,
    requiredBuildRampPerWeek,
    isHoursFeasible,
    isRampFeasible,
    isOverallFeasible,
    alternatives: {
      reachablePeakCtlByRace,
      reachableRaceDayCtl,
      earliestFeasibleWeeksToRace,
      earliestFeasibleDateStr,
      highestLeverageDiscipline: {
        discipline: topLev.discipline,
        label: topLev.label,
        ctlPerExtraHour: topLev.ctlGainPerExtraHour,
      },
    },
  };
}

