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
  targetSwimCtl: number; // e.g. 35
  targetBikeCtl: number; // e.g. 70
  targetRunCtl: number;  // e.g. 50
  targetTriCtl: number;  // 155
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

export const DISTANCE_MODEL_PROFILES: Record<Exclude<TriathlonDistanceModel, 'custom_goal'>, TriathlonTargetWeights> = {
  sprint: {
    label: 'Sprint (750m / 20km / 5km)',
    swimWeight: 0.20,
    bikeWeight: 0.48,
    runWeight: 0.32,
    targetSwimCtl: 25,
    targetBikeCtl: 45,
    targetRunCtl: 35,
    targetTriCtl: 105,
  },
  olympic: {
    label: 'Olympic (1.5km / 40km / 10km)',
    swimWeight: 0.16,
    bikeWeight: 0.51,
    runWeight: 0.33,
    targetSwimCtl: 30,
    targetBikeCtl: 60,
    targetRunCtl: 45,
    targetTriCtl: 135,
  },
  middle_70_3: {
    label: 'Middle Distance / 70.3 (Cotswold Classic V2)',
    swimWeight: 0.123,
    bikeWeight: 0.526,
    runWeight: 0.351,
    targetSwimCtl: 35,
    targetBikeCtl: 75,
    targetRunCtl: 50,
    targetTriCtl: 160,
  },
  ironman: {
    label: 'Full IRONMAN (3.8km / 180km / 42.2km)',
    swimWeight: 0.118,
    bikeWeight: 0.529,
    runWeight: 0.353,
    targetSwimCtl: 45,
    targetBikeCtl: 95,
    targetRunCtl: 65,
    targetTriCtl: 205,
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
    if (!act.start_date) return;
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
        targetSwimCtl: 35,
        targetBikeCtl: 75,
        targetRunCtl: 50,
        targetTriCtl: 160,
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
    swimRatio: Math.round(rawSwimRatio * 100),
    bikeRatio: Math.round(rawBikeRatio * 100),
    runRatio: Math.round(rawRunRatio * 100),
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
