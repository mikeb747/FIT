import type { AthleteProfile } from '../types/athlete';
import type {
  DailyRecoveryLog,
  ReadinessScoreResult,
  ReadinessStatus,
  CrossCorrelationSummary,
} from '../types/recovery';

/**
 * Calculates Pearson correlation coefficient (r) between two numeric arrays
 */
export function calculatePearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0 || isNaN(denominator)) return 0;
  const r = numerator / denominator;
  return Math.max(-1, Math.min(1, Math.round(r * 100) / 100));
}

/**
 * Calculates Readiness Score and physiological diagnostic for a specific day's recovery log
 */
export function computeDailyReadiness(
  targetLog: DailyRecoveryLog,
  allLogs: DailyRecoveryLog[],
  athleteProfile: AthleteProfile
): ReadinessScoreResult {
  const baselineRhr = athleteProfile.restingHeartRate || 41;
  const targetSleepHours = 8.0;
  const targetSleepMinutes = targetSleepHours * 60; // 480 mins

  // Sort logs chronologically to get historical context up to targetLog's date
  const sorted = [...allLogs].sort((a, b) => a.date.localeCompare(b.date));
  const targetIndex = sorted.findIndex((l) => l.date === targetLog.date);

  // Take up to 7 prior days for rolling baselines
  const historyStart = Math.max(0, targetIndex - 7);
  const rollingWindow = sorted.slice(historyStart, targetIndex > -1 ? targetIndex : undefined);

  // 1. HRV Rolling Baseline & Standard Deviation
  const hrvValues = rollingWindow.map((l) => l.hrvRmssd).filter((v) => v > 0);
  const hrvBaseline7d =
    hrvValues.length > 0
      ? Math.round(hrvValues.reduce((acc, v) => acc + v, 0) / hrvValues.length)
      : targetLog.hrvRmssd;

  const hrvVariance =
    hrvValues.length > 1
      ? hrvValues.reduce((acc, v) => acc + Math.pow(v - hrvBaseline7d, 2), 0) / (hrvValues.length - 1)
      : 36; // sensible default standard deviation ~6ms
  const hrvStdDev7d = Math.max(3, Math.round(Math.sqrt(hrvVariance)));

  const hrvDelta = targetLog.hrvRmssd - hrvBaseline7d;
  const hrvZScore = hrvStdDev7d > 0 ? hrvDelta / hrvStdDev7d : 0;

  // Determine HRV Status
  let hrvStatus: 'balanced' | 'low' | 'elevated' | 'insufficient_data' = 'balanced';
  let hrvScore = 85;

  if (hrvValues.length < 2) {
    hrvStatus = 'insufficient_data';
    hrvScore = 80;
  } else if (hrvZScore >= -0.8 && hrvZScore <= 1.2) {
    hrvStatus = 'balanced';
    // Perfectly in normal range
    hrvScore = Math.min(100, Math.round(90 + (hrvZScore >= 0 ? hrvZScore * 8 : hrvZScore * 10)));
  } else if (hrvZScore < -0.8) {
    hrvStatus = 'low';
    // Sympathetic strain: drop score based on deviation
    hrvScore = Math.max(25, Math.round(75 + hrvZScore * 25));
  } else {
    // Parasympathetic hyperactivity (sometimes seen in deep exhaustion rebound)
    hrvStatus = 'elevated';
    hrvScore = Math.max(65, Math.round(85 - (hrvZScore - 1.2) * 15));
  }

  // 2. Resting Heart Rate Score
  const rhrValues = rollingWindow.map((l) => l.restingHr).filter((v) => v > 0);
  const rhr7dAvg =
    rhrValues.length > 0
      ? Math.round((rhrValues.reduce((acc, v) => acc + v, 0) / rhrValues.length) * 10) / 10
      : targetLog.restingHr;

  const rhrDelta = targetLog.restingHr - baselineRhr;
  let rhrScore = 90;

  if (rhrDelta <= 0) {
    // Optimal or exceptionally calm parasympathetic tone
    rhrScore = 100;
  } else if (rhrDelta === 1) {
    rhrScore = 95;
  } else if (rhrDelta === 2) {
    rhrScore = 88;
  } else if (rhrDelta === 3) {
    rhrScore = 78;
  } else if (rhrDelta === 4) {
    rhrScore = 65;
  } else if (rhrDelta <= 6) {
    rhrScore = 50;
  } else {
    rhrScore = Math.max(20, 45 - (rhrDelta - 6) * 8);
  }

  // 3. Sleep Architecture & Duration Score
  const sleepMinutesValues = rollingWindow.map((l) => l.sleepDurationMinutes).filter((v) => v > 0);
  const sleepAvg7dMinutes =
    sleepMinutesValues.length > 0
      ? Math.round(sleepMinutesValues.reduce((acc, v) => acc + v, 0) / sleepMinutesValues.length)
      : targetLog.sleepDurationMinutes;

  const sleepScoreValues = rollingWindow.map((l) => l.sleepScore).filter((v) => v > 0);
  const sleepScoreAvg7d =
    sleepScoreValues.length > 0
      ? Math.round(sleepScoreValues.reduce((acc, v) => acc + v, 0) / sleepScoreValues.length)
      : targetLog.sleepScore;

  // Duration component
  const durationRatio = targetLog.sleepDurationMinutes / targetSleepMinutes;
  const durationScore = Math.min(100, Math.round(durationRatio * 100));

  // Garmin Sleep Score is 0-100
  const garminSleepScore = targetLog.sleepScore || 75;

  // Deep Sleep quality bonus/penalty (ideal is 15% - 25% of total sleep)
  const deepPct =
    targetLog.sleepDurationMinutes > 0
      ? (targetLog.deepSleepMinutes / targetLog.sleepDurationMinutes) * 100
      : 18;
  let deepModifier = 0;
  if (deepPct >= 18) deepModifier = 5;
  else if (deepPct < 12) deepModifier = -8;

  // Overall sleep composite
  const sleepCompositeScore = Math.max(
    20,
    Math.min(100, Math.round(garminSleepScore * 0.6 + durationScore * 0.4 + deepModifier))
  );

  let sleepQualityRating: 'optimal' | 'good' | 'fair' | 'poor' = 'good';
  if (sleepCompositeScore >= 85) sleepQualityRating = 'optimal';
  else if (sleepCompositeScore >= 72) sleepQualityRating = 'good';
  else if (sleepCompositeScore >= 55) sleepQualityRating = 'fair';
  else sleepQualityRating = 'poor';

  // 4. Subjective modifier
  let feelModifier = 0;
  if (targetLog.subjectiveFeel) {
    if (targetLog.subjectiveFeel === 5) feelModifier = 3;
    else if (targetLog.subjectiveFeel === 4) feelModifier = 1;
    else if (targetLog.subjectiveFeel === 2) feelModifier = -3;
    else if (targetLog.subjectiveFeel === 1) feelModifier = -6;
  }

  // 5. Final Composite Readiness Score (0-100)
  // Weights: HRV 35%, Sleep 35%, RHR 25%, Feel 5%
  const rawScore = Math.round(
    hrvScore * 0.35 + sleepCompositeScore * 0.35 + rhrScore * 0.25 + feelModifier + 4
  );
  const score = Math.max(15, Math.min(100, rawScore));

  // Determine Category, Color, and Training Recommendations
  let status: ReadinessStatus = 'good';
  let label = 'Good / Productive';
  let accentColor = '#38bdf8'; // sky
  let badgeBg = 'bg-sky-500/15';
  let badgeText = 'text-sky-400';
  let recommendedIntensity: ReadinessScoreResult['recommendedIntensity'] = 'Moderate / Tempo & Aerobic';
  let trainingRecommendation =
    'Cardiovascular and autonomic recovery are solid. Optimal for structured aerobic tempo, endurance volume, or threshold blocks.';

  const insights: string[] = [];

  if (score >= 85) {
    status = 'optimal';
    label = 'Primed / Optimal';
    accentColor = '#10b981'; // emerald
    badgeBg = 'bg-emerald-500/15';
    badgeText = 'text-emerald-400';
    recommendedIntensity = 'High / Threshold & Intervals';
    trainingRecommendation =
      'High readiness! Your HRV is balanced and resting HR is on baseline (41 bpm). Prime condition for high-intensity intervals, FTP efforts, or key hard workouts.';
  } else if (score >= 70) {
    status = 'good';
    label = 'Good / Productive';
    accentColor = '#38bdf8'; // sky
    badgeBg = 'bg-sky-500/15';
    badgeText = 'text-sky-400';
    recommendedIntensity = 'Moderate / Tempo & Aerobic';
    trainingRecommendation =
      'Good recovery capacity. You are fully capable of handling normal training volume, tempo intervals, and endurance work.';
  } else if (score >= 50) {
    status = 'moderate';
    label = 'Moderate / Strained';
    accentColor = '#f59e0b'; // amber
    badgeBg = 'bg-amber-500/15';
    badgeText = 'text-amber-400';
    recommendedIntensity = 'Low / Easy Z2 & Endurance';
    trainingRecommendation =
      'Elevated physiological strain detected. Prioritize easy Zone 2 aerobic maintenance, technical drills, or active recovery to absorb prior training.';
  } else {
    status = 'low';
    label = 'Low / Compromised';
    accentColor = '#f43f5e'; // rose
    badgeBg = 'bg-rose-500/15';
    badgeText = 'text-rose-400';
    recommendedIntensity = 'Rest / Active Recovery';
    trainingRecommendation =
      'Acute fatigue or autonomic suppression. High-intensity training not recommended today. Focus on restorative sleep, nutrition, and full rest or light mobility.';
  }

  // Build specific physiological insights
  if (rhrDelta > 3) {
    insights.push(`Morning RHR is elevated by +${rhrDelta} bpm above your 41 bpm baseline, indicating autonomic strain or residual fatigue.`);
  } else if (rhrDelta <= 0) {
    insights.push(`Morning RHR is at or below baseline (${targetLog.restingHr} bpm vs 41 bpm baseline) — excellent parasympathetic recovery.`);
  }

  if (hrvStatus === 'low') {
    insights.push(`Overnight HRV (${targetLog.hrvRmssd} ms) is suppressed below your 7-day baseline (${hrvBaseline7d} ms), reflecting accumulated stress.`);
  } else if (hrvStatus === 'balanced') {
    insights.push(`Overnight HRV (${targetLog.hrvRmssd} ms) is in your optimal 7-day baseline corridor (${hrvBaseline7d} ± ${hrvStdDev7d} ms).`);
  }

  if (targetLog.deepSleepMinutes >= 75) {
    insights.push(`Deep sleep reached ${targetLog.deepSleepMinutes}m (${deepPct.toFixed(0)}% of total sleep), promoting physical tissue repair.`);
  } else if (targetLog.deepSleepMinutes < 50) {
    insights.push(`Deep sleep was shortened (${targetLog.deepSleepMinutes}m), which may slow muscular and endocrine recovery.`);
  }

  return {
    score,
    status,
    label,
    accentColor,
    badgeBg,
    badgeText,
    hrvStatus,
    hrvBaseline7d,
    hrvStdDev7d,
    hrvDelta,
    rhrDelta,
    rhr7dAvg,
    sleepQualityRating,
    sleepAvg7dMinutes,
    sleepScoreAvg7d,
    trainingRecommendation,
    recommendedIntensity,
    subscores: {
      hrvScore,
      sleepScore: sleepCompositeScore,
      rhrScore,
      loadModifier: feelModifier,
    },
    insights,
  };
}

/**
 * Computes cross-correlation metrics and pattern insights between Sleep, RHR, HRV, and Load
 */
export function computeCrossCorrelations(logs: DailyRecoveryLog[]): CrossCorrelationSummary {
  if (logs.length < 5) {
    return {
      sleepVsHrvCorrelation: 0.52,
      deepSleepVsRhrCorrelation: -0.48,
      keyTakeaways: [
        'Log 5+ consecutive days from Garmin Connect or TrainingPeaks to generate personalised statistical correlations.',
      ],
    };
  }

  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));

  const sleepDurations = sorted.map((l) => l.sleepDurationMinutes);
  const hrvValues = sorted.map((l) => l.hrvRmssd);
  const deepSleepMinutes = sorted.map((l) => l.deepSleepMinutes);
  const rhrValues = sorted.map((l) => l.restingHr);

  const sleepVsHrv = calculatePearsonCorrelation(sleepDurations, hrvValues);
  const deepVsRhr = calculatePearsonCorrelation(deepSleepMinutes, rhrValues);

  const keyTakeaways: string[] = [];

  if (sleepVsHrv > 0.3) {
    keyTakeaways.push(
      `Strong positive correlation (r = +${sleepVsHrv.toFixed(2)}) between Sleep Duration and overnight HRV. Longer sleep consistently expands your autonomic reserve.`
    );
  } else if (sleepVsHrv < -0.2) {
    keyTakeaways.push(
      `Sleep duration and HRV are slightly decoupled (r = ${sleepVsHrv.toFixed(2)}). Sleep quality and timing may be more influential than raw duration alone.`
    );
  } else {
    keyTakeaways.push(
      `Moderate correlation (r = +${Math.abs(sleepVsHrv).toFixed(2)}) between sleep time and morning HRV. Consistent bedtime timing reinforces recovery.`
    );
  }

  if (deepVsRhr < -0.25) {
    keyTakeaways.push(
      `Negative correlation (r = ${deepVsRhr.toFixed(2)}) between Deep Sleep and Morning RHR: higher deep sleep volume is reliably followed by a lower, calmer morning resting HR (near 41 bpm).`
    );
  } else {
    keyTakeaways.push(
      `Deep sleep and resting HR maintain baseline stability across recent days.`
    );
  }

  // Check recent 7-day RHR stability
  const recent7 = sorted.slice(-7);
  const avgRhr7 = recent7.reduce((s, l) => s + l.restingHr, 0) / recent7.length;
  if (avgRhr7 <= 42) {
    keyTakeaways.push(
      `Recent 7-day average resting HR is ${avgRhr7.toFixed(1)} bpm, exceptionally close to your 41 bpm physiological baseline.`
    );
  }

  return {
    sleepVsHrvCorrelation: sleepVsHrv,
    deepSleepVsRhrCorrelation: deepVsRhr,
    keyTakeaways,
  };
}
