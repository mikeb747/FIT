import { StravaActivity, StravaActivityDetailsRecord, classifyActivity } from './stravaActivities';
import { AthleteProfile, formatSecondsToMinSec } from '../types/athlete';

export interface PeakDurationInterval {
  minutes: number;
  label: string;
  seconds: number;
}

export const PEAK_DURATIONS: PeakDurationInterval[] = [
  { minutes: 3, label: '3 min', seconds: 180 },
  { minutes: 5, label: '5 min', seconds: 300 },
  { minutes: 8, label: '8 min', seconds: 480 },
  { minutes: 12, label: '12 min', seconds: 720 },
  { minutes: 20, label: '20 min', seconds: 1200 },
  { minutes: 30, label: '30 min', seconds: 1800 },
  { minutes: 45, label: '45 min', seconds: 2700 },
  { minutes: 60, label: '60 min', seconds: 3600 },
  { minutes: 90, label: '90 min', seconds: 5400 },
  { minutes: 120, label: '120 min', seconds: 7200 },
];

export interface PeakPerformanceMetric {
  durationMin: number;
  durationLabel: string;
  actualValue: number; // Watts for bike, Pace (sec/km) for run
  formattedValue: string; // e.g. "365 W" or "3:42/km"
  secondaryFormatted?: string; // e.g. "4.68 W/kg" or "5:57/mi"
  modeledValue?: number; // CP model watts or CS model pace
  modeledFormatted?: string;
  effortType: 'continuous_steady' | 'interval_session' | 'bayesian_prior';
  variabilityIndex?: number; // NP / Avg Watts for bike
  activityId?: string | number;
  activityName?: string;
  activityDate?: string;
  isContinuousReliable: boolean; // False if high variability interval session
  confidenceScore: number; // 0 - 100%
  priorWeight: number; // 0 (pure empirical) to 1.0 (pure Bayesian prior)
}

export interface CriticalParameters {
  // Cycling
  ftpWatts: number;
  ftpWattsPerKg: number;
  criticalPowerWatts: number;
  wPrimeJoules: number;
  wPrimeKj: number;
  bikeLthr: number;

  // Running
  lactateThresholdPaceSec: number;
  lactateThresholdPaceFormatted: string;
  lactateThresholdPaceMiFormatted: string;
  criticalSpeedMps: number;
  criticalSpeedPaceFormatted: string;
  dPrimeMeters: number;
  runLthr: number;
  hrMax: number;

  // Swimming
  cssSecPer100m: number;
  cssFormatted: string;
  swim100mSec: number;
  swim100mFormatted: string;
  swim400mSec: number;
  swim400mFormatted: string;
  swim1000mSec: number;
  swim1000mFormatted: string;
  swim1500mSec: number;
  swim1500mFormatted: string;
  hasDirectLongSwimPace: boolean;
}

export type PerformanceEventCategory = 'triathlon' | 'running' | 'cycling';
export type TriathlonEventDistance = 'sprint_400m' | 'sprint' | 'olympic' | 'middle_70_3' | 'ironman';
export type RunningEventDistance = 'five_k' | 'ten_k' | 'ten_miler' | 'half_marathon' | 'marathon';
export type CyclingEventDistance = 'ten_m_tt' | 'twenty_five_m_tt' | 'fifty_m_tt' | 'century';

export type BikeCourseElevationProfile = 'flat' | 'rolling_800m' | 'hilly';
export type RunCourseWeatherProfile = 'flat_optimal' | 'hilly_uk' | 'warm_humid';

export interface DisciplineOpportunity {
  discipline: 'swim' | 'bike' | 'run';
  name: string;
  distanceLabel: string;
  athleteTimeSec: number;
  athleteTimeFormatted: string;
  benchmarkTimeSec: number;
  benchmarkTimeFormatted: string;
  timeGainSec: number;
  timeGainFormatted: string;
  opportunityRank: number; // 1 = biggest time opportunity
  ageGroupPercentile: number; // e.g. 74th percentile
  currentPaceOrPower: string;
  targetPaceOrPower: string;
  coachingInsight: string;
}

export interface RaceWeaknessAnalysis {
  eventName: string;
  eventDistanceId: string;
  category: PerformanceEventCategory;
  ageGroup: string; // e.g. "M40–44"
  athleteAge: number;
  athleteWeightKg: number;
  courseProfile: {
    bikeElevation: BikeCourseElevationProfile;
    runProfile: RunCourseWeatherProfile;
    riegelExponent: number;
  };
  projectedTotalTimeSec: number;
  projectedTotalTimeFormatted: string;
  benchmarkTotalTimeSec: number;
  benchmarkTotalTimeFormatted: string;
  totalTimeOpportunitySec: number;
  totalTimeOpportunityFormatted: string;
  primaryLimiter: 'swim' | 'bike' | 'run';
  primaryLimiterName: string;
  disciplines: DisciplineOpportunity[];
  strategicDirective: string;
}

export type SwimConfidenceLevel = 'high' | 'moderate' | 'extrapolated';

export interface SwimRacePredictionItem {
  distanceId: TriathlonEventDistance;
  name: string;
  distanceM: number;
  modelingBasis: string;
  predictedTimeSec: number;
  predictedTimeFormatted: string;
  pacePer100mFormatted: string;
  targetAgeGroupTop20TimeSec: number;
  targetAgeGroupTop20TimeFormatted: string;
  confidenceLevel: SwimConfidenceLevel;
  confidenceScore: number; // 0-100%
  confidenceExplanation: string;
  dataAnchorsUsed: string[];
}

export interface SwimRacePredictions {
  cssBasisPaceFormatted: string;
  swim100mFormatted: string;
  swim400mFormatted: string;
  benchmark1000mFormatted: string;
  benchmark1500mFormatted: string;
  hasDirectLongSwimPace: boolean;
  overallSwimConfidence: number;
  swimDataSummary: string;
  races: SwimRacePredictionItem[];
}

/**
 * Structured interval & steady benchmark efforts
 */
export interface BenchmarkSession {
  id: string;
  durationMin: number;
  durationLabel: string;
  sessionDescription: string;
  repPaceSec: number;
  repPaceFormatted: string;
  repSpeedMps: number;
  repAvgHr: number;
  hrDescription: string;
  sessionType: 'interval_reps' | 'continuous_steady';
  physioTarget: string; // e.g. "VO2 Max / Aerobic Capacity"
  notes: string;
}

/**
 * Running race predictions anchored from Lactate Threshold Pace
 */
export interface RunningRacePrediction {
  distanceId: RunningEventDistance;
  name: string;
  distanceM: number;
  distanceKm: number;
  ltSpeedPercentageMin: number;
  ltSpeedPercentageMax: number;
  ltSpeedPercentageUsed: number;
  predictedPaceSec: number;
  predictedPaceFormatted: string;
  predictedTimeSec: number;
  predictedTimeFormatted: string;
  loggedPeakTimeSec?: number;
  loggedPeakTimeFormatted?: string;
  loggedPeakPaceFormatted?: string;
  confidenceScore: number; // 0 - 100%
  confidenceLabel: 'High (Aligned)' | 'Medium (Model Guided)' | 'Low (Soft Peak / Discordance)';
  isDiscordant: boolean;
  discordanceReason?: string;
  hrRegressionPaceFormatted?: string;
  hrRegressionConcordancePercent?: number;
  durabilityAdjustedNotes?: string;
}

/**
 * Unified Discipline Ability on a 0-100% Percentile scale
 * to compare Bike W/kg, Run LT Pace, and Swim CSS on one normalized scale
 */
export interface UnifiedDisciplinePercentile {
  discipline: 'bike' | 'run' | 'swim';
  label: string;
  metricName: string;
  athleteValue: string;
  percentile: number; // 0 to 100
  tierLabel: string; // e.g. "Exceptional (Cat 1)", "National Class", "Top 25% AG"
  referenceStandard: string;
  timeSensitivity: 'Critical (~50% race time)' | 'High (~35% race time)' | 'Modest (~15% race time)';
  roiRecommendation: string;
}

/**
 * Format seconds to HH:MM:SS or MM:SS
 */
export function formatDurationHMS(totalSeconds: number): string {
  if (!totalSeconds || isNaN(totalSeconds) || totalSeconds <= 0) return '0:00';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.round(totalSeconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatPaceKm(secPerKm: number): string {
  if (!secPerKm || isNaN(secPerKm) || secPerKm <= 0) return '--/km';
  const mins = Math.floor(secPerKm / 60);
  const secs = Math.round(secPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}/km`;
}

export function formatPaceMiles(secPerKm: number): string {
  if (!secPerKm || isNaN(secPerKm) || secPerKm <= 0) return '--/mi';
  const secPerMi = secPerKm * 1.609344;
  const mins = Math.floor(secPerMi / 60);
  const secs = Math.round(secPerMi % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}/mi`;
}

export function formatSwimPace(secPer100m: number): string {
  if (!secPer100m || isNaN(secPer100m) || secPer100m <= 0) return '--/100m';
  const mins = Math.floor(secPer100m / 60);
  const secs = Math.round(secPer100m % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}/100m`;
}

export function formatSwimPaceYards(secPer100m: number): string {
  if (!secPer100m || isNaN(secPer100m) || secPer100m <= 0) return '--/100yd';
  const secPer100yd = secPer100m * 0.9144;
  const mins = Math.floor(secPer100yd / 60);
  const secs = Math.round(secPer100yd % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}/100yd`;
}

/**
 * Determine age group bracket label from age
 */
export function getAgeGroupBracket(age: number = 41): string {
  if (age < 20) return 'Under 20';
  if (age <= 24) return '20–24';
  if (age <= 29) return '25–29';
  if (age <= 34) return '30–34';
  if (age <= 39) return '35–39';
  if (age <= 44) return '40–44';
  if (age <= 49) return '45–49';
  if (age <= 54) return '50–54';
  if (age <= 59) return '55–59';
  if (age <= 64) return '60–64';
  return '65+';
}

/**
 * Computes Critical Parameters from athlete profile and activity history:
 * FTP, CP, W', LT Pace, CS, D', CSS, 100m, 400m, 1000m & 1500m Benchmarks
 */
export function computeCriticalParameters(
  athleteProfile?: AthleteProfile,
  activities: StravaActivity[] = []
): CriticalParameters {
  const weightKg = Number(athleteProfile?.weightKg) || 77;
  const ftp = Number(athleteProfile?.bikeFtp) || 315;
  const bikeLthr = Number(athleteProfile?.thresholdHeartRateBike) || 162;
  const runLthr = Number(athleteProfile?.thresholdHeartRateRun) || 168;
  const hrMax = Number(athleteProfile?.maxHeartRate) || 188;
  const runLtPaceSec = Number(athleteProfile?.thresholdPaceRunOutdoorSec) || 232; // 3:52/km

  // Critical Power (CP) is typically ~97-98% of 60m FTP, W' is ~19-20 kJ for trained cyclists
  const cpWatts = Math.round(ftp * 0.98);
  const wPrimeKj = 19.5;
  const wPrimeJoules = wPrimeKj * 1000;

  // Critical Speed (CS) in m/s: 1000m / (LT pace * 1.02)
  const csMps = Number((1000 / (runLtPaceSec * 1.02)).toFixed(3));
  const csPaceSec = Math.round(1000 / csMps);
  const dPrimeMeters = 230; // standard anaerobic running distance reserve (meters)

  // Swimming: CSS Pace per 100m
  let t100 = Number(athleteProfile?.swim100mTimeSec) || 84; // 1:24
  let t400 = Number(athleteProfile?.swim400mTimeSec) || 372; // 6:12
  let cssSec = Number(athleteProfile?.swimPoolPace100mSec) || 96; // 1:36/100m

  if (t400 && t100 && t400 > t100) {
    const derivedCssSpeed = (400 - 100) / (t400 - t100);
    if (derivedCssSpeed > 0.5 && derivedCssSpeed < 2.5) {
      cssSec = Math.round(100 / derivedCssSpeed);
    }
  }

  // Check if activities have any dedicated 1000m or 1500m swim records
  let hasDirectLongSwim = false;
  let detectedLongSwimPaceSec = 0;
  for (const act of activities) {
    if (act.isDeleted) continue;
    const cls = classifyActivity(act);
    if (cls.category === 'Swim' || act.type === 'Swim') {
      if ((act.distance || 0) >= 1400 && (act.moving_time || 0) > 600) {
        hasDirectLongSwim = true;
        const avgSpeed = (act.distance || 0) / (act.moving_time || 1);
        detectedLongSwimPaceSec = Math.round(100 / avgSpeed);
        break;
      }
    }
  }

  // 1000m swim benchmark: slightly slower than CSS due to distance (~2.5% degradation)
  const swim1000mSec = hasDirectLongSwim && detectedLongSwimPaceSec > 0
    ? Math.round(detectedLongSwimPaceSec * 10)
    : Math.round(cssSec * 10 * 1.025);

  // 1500m swim benchmark: ~4.5% degradation over CSS if modeled, or empirical pace
  const swim1500mSec = hasDirectLongSwim && detectedLongSwimPaceSec > 0
    ? Math.round(detectedLongSwimPaceSec * 15)
    : Math.round(cssSec * 15 * 1.045);

  return {
    ftpWatts: ftp,
    ftpWattsPerKg: Number((ftp / weightKg).toFixed(2)),
    criticalPowerWatts: cpWatts,
    wPrimeJoules,
    wPrimeKj,
    bikeLthr,
    lactateThresholdPaceSec: runLtPaceSec,
    lactateThresholdPaceFormatted: formatPaceKm(runLtPaceSec),
    lactateThresholdPaceMiFormatted: formatPaceMiles(runLtPaceSec),
    criticalSpeedMps: csMps,
    criticalSpeedPaceFormatted: formatPaceKm(csPaceSec),
    dPrimeMeters,
    runLthr,
    hrMax,
    cssSecPer100m: cssSec,
    cssFormatted: formatSwimPace(cssSec),
    swim100mSec: t100,
    swim100mFormatted: formatDurationHMS(t100),
    swim400mSec: t400,
    swim400mFormatted: formatDurationHMS(t400),
    swim1000mSec,
    swim1000mFormatted: formatDurationHMS(swim1000mSec),
    swim1500mSec,
    swim1500mFormatted: formatDurationHMS(swim1500mSec),
    hasDirectLongSwimPace: hasDirectLongSwim,
  };
}

/**
 * Standard structured sessions provided by athlete (e.g. 8x3m, 8x4m, 4x9m, 30m continuous)
 */
export const ATHLETE_BENCHMARK_SESSIONS: BenchmarkSession[] = [
  {
    id: 'rep_3m',
    durationMin: 3,
    durationLabel: '3 min Rep',
    sessionDescription: '8×3 min, 70 s rest',
    repPaceSec: 212, // 3:32/km
    repPaceFormatted: '3:32/km',
    repSpeedMps: 4.717,
    repAvgHr: 147,
    hrDescription: '~147 bpm',
    sessionType: 'interval_reps',
    physioTarget: 'VO2 Max / Aerobic Capacity (110% LT Pace)',
    notes: '8 high-intensity reps with incomplete recovery (70s). Excellent aerobic power indicator.',
  },
  {
    id: 'rep_4m',
    durationMin: 4,
    durationLabel: '4 min Rep',
    sessionDescription: '8×4 min, 90 s rest',
    repPaceSec: 218, // 3:38/km
    repPaceFormatted: '3:38/km',
    repSpeedMps: 4.587,
    repAvgHr: 146,
    hrDescription: '139 rising to 152 bpm',
    sessionType: 'interval_reps',
    physioTarget: 'VO2 Max Sustained Stamina',
    notes: 'Longer VO2 reps showing controlled cardiovascular drift from 139 to 152 bpm.',
  },
  {
    id: 'rep_9m',
    durationMin: 9,
    durationLabel: '9 min Rep',
    sessionDescription: '4×9 min, 2 min rest',
    repPaceSec: 222, // 3:42/km
    repPaceFormatted: '3:42/km',
    repSpeedMps: 4.505,
    repAvgHr: 153,
    hrDescription: '151–155 bpm',
    sessionType: 'interval_reps',
    physioTarget: 'Lactate Threshold Over-Under / Extended Reps',
    notes: '4 large 9-minute blocks held precisely at 3:42/km near 153 bpm.',
  },
  {
    id: 'cont_30m',
    durationMin: 30,
    durationLabel: '30 min Continuous',
    sessionDescription: 'Continuous, "not quite max" (8.14 km in 30:09)',
    repPaceSec: 222, // 3:42/km
    repPaceFormatted: '3:42/km',
    repSpeedMps: 4.505,
    repAvgHr: 153,
    hrDescription: '148 ending at 157 bpm',
    sessionType: 'continuous_steady',
    physioTarget: 'Threshold Continuous Aerobic Anchor',
    notes: 'Sub-maximal continuous 8.14km test. Key anchor for 10-mile race speed (holds ~96–98% of this pace).',
  },
];

/**
 * Helper: Computes the maximum rolling average (Mean Maximal Power / Speed)
 * for a target window `windowSec` from Strava `time` and `data` streams.
 */
function computeStreamRollingBest(
  timeStream: number[] | undefined,
  valueStream: number[] | undefined,
  windowSec: number
): number | null {
  if (!timeStream || !valueStream || timeStream.length < 10 || timeStream.length !== valueStream.length) {
    return null;
  }
  const totalStreamDuration = timeStream[timeStream.length - 1] - timeStream[0];
  if (totalStreamDuration < windowSec) {
    return null;
  }

  let bestAvg = 0;
  let left = 0;
  let weightedSum = 0;

  for (let right = 1; right < timeStream.length; right++) {
    const dt = Math.max(0, timeStream[right] - timeStream[right - 1]);
    // Cap gaps (e.g. paused timer > 15s) to 1s so pauses don't credit high watts over rest time
    const effectiveDt = dt > 15 ? 1 : dt;
    weightedSum += valueStream[right] * effectiveDt;

    while (left < right && timeStream[right] - timeStream[left] >= windowSec) {
      const span = timeStream[right] - timeStream[left];
      if (span >= windowSec && span <= windowSec * 1.25) {
        const avg = weightedSum / span;
        if (avg > bestAvg) {
          bestAvg = avg;
        }
      }
      const leftDt = Math.max(0, timeStream[left + 1] - timeStream[left]);
      const effectiveLeftDt = leftDt > 15 ? 1 : leftDt;
      weightedSum -= valueStream[left + 1] * effectiveLeftDt;
      left++;
    }
  }

  return bestAvg > 0 ? bestAvg : null;
}

/**
 * Extracts and models Peak Performance across 10 distinct durations:
 * 3, 5, 8, 12, 20, 30, 45, 60, 90, 120 minutes.
 * Incorporates second-by-second stream MMP when available, summary power/pace with
 * continuous steady-state vs interval session filtering, and Bayesian population priors
 * for sparse data points.
 */
export function computePeakPerformanceCurve(
  activities: StravaActivity[],
  activityDetails: Record<string, StravaActivityDetailsRecord> = {},
  params: CriticalParameters,
  athleteProfile?: AthleteProfile,
  lookbackDays: number = 365,
  continuousOnly: boolean = false
): {
  bikePeaks: PeakPerformanceMetric[];
  runPeaks: PeakPerformanceMetric[];
} {
  const weightKg = Number(athleteProfile?.weightKg) || 77;
  const now = Date.now();
  const cutoffTime = now - lookbackDays * 86400000;

  // Filter activities
  const bikeActivities = activities.filter((act) => {
    if (act.isDeleted) return false;
    const cls = classifyActivity(act);
    const inWindow = new Date(act.start_date).getTime() >= cutoffTime;
    return inWindow && (cls.category === 'Bike' || act.type === 'Ride' || act.type === 'VirtualRide');
  });

  const runActivities = activities.filter((act) => {
    if (act.isDeleted) return false;
    const cls = classifyActivity(act);
    const inWindow = new Date(act.start_date).getTime() >= cutoffTime;
    return inWindow && (cls.category === 'Run' || act.type === 'Run' || act.type === 'TrailRun');
  });

  // 1. BIKE PEAK POWER (CP + W'/t hyperbolic model + empirical peaks with interval filtering)
  const rawBikePeaks: PeakPerformanceMetric[] = PEAK_DURATIONS.map((dur) => {
    const sec = dur.seconds;
    // Theoretical model: P = CP + W'/t
    const modeledWatts = Math.round(params.criticalPowerWatts + params.wPrimeJoules / sec);

    let bestWatts = 0;
    let bestAct: StravaActivity | null = null;
    let bestVi = 1.0;
    let isInterval = false;

    for (const act of bikeActivities) {
      const actDet = activityDetails[String(act.id)];
      if (actDet?.calibration?.isIgnoredFromTrainingStatus) continue;

      const actTime = actDet?.calibration?.calibratedMovingTimeSec || act.moving_time || 0;
      // An activity must be at least 90% of the target duration to estimate that duration's power
      if (actTime < sec * 0.9) continue;

      const avgW = actDet?.calibration?.calibratedAvgWatts || act.average_watts || 0;
      const npW = actDet?.calibration?.calibratedNormalizedPower || act.weighted_average_watts || avgW;
      if (avgW <= 0 && npW <= 0) continue;

      const vi = avgW > 0 ? Number((npW / avgW).toFixed(2)) : 1.0;

      // Point 7: If a 20min block came from 30s/30s at 115% of FTP, VI is high (>1.06)
      const actIsInterval = vi > 1.06;
      if (continuousOnly && actIsInterval && dur.minutes >= 12) {
        // Skip intermittent sessions when continuous steady state is requested
        continue;
      }

      // A. First check if high-resolution second-by-second power streams are cached
      const streamsObj = actDet?.streams as
        | { time?: { data?: number[] }; watts?: { data?: number[] } }
        | undefined;
      const streamBestWatts = computeStreamRollingBest(
        streamsObj?.time?.data,
        streamsObj?.watts?.data,
        sec
      );

      let estDurationWatts = 0;
      if (streamBestWatts !== null && streamBestWatts > 0) {
        estDurationWatts = Math.round(
          actIsInterval && dur.minutes >= 20 ? streamBestWatts * 0.95 : streamBestWatts
        );
      } else if (actTime >= sec) {
        // Estimate best sub-segment of length `sec` from whole-ride average/NP using Riegel/power decay (~0.05)
        // Cap the sub-segment multiplier so a long easy ride never inflates unreasonably
        const durationRatio = Math.min(3.5, actTime / sec);
        const subSegmentBoost = Math.pow(durationRatio, 0.055);
        const powerBasis = actIsInterval
          ? avgW
          : avgW * 0.7 + Math.min(npW, avgW * 1.06) * 0.3;
        estDurationWatts = Math.round(powerBasis * subSegmentBoost);
      } else {
        // Ride is between 90% and 100% of `sec`: prorate average power across full `sec` window
        // (never use 1-second sprint max_watts!)
        estDurationWatts = Math.round(avgW * (actTime / sec));
      }

      if (estDurationWatts > bestWatts) {
        bestWatts = estDurationWatts;
        bestAct = act;
        bestVi = vi;
        isInterval = actIsInterval;
      }
    }

    const empiricalAvailable = bestWatts > 0;
    let finalWatts = modeledWatts;
    let priorWeight = 0;
    let confidenceScore = 95;

    if (empiricalAvailable) {
      if (isInterval && dur.minutes >= 20) {
        confidenceScore = 76;
        finalWatts = bestWatts;
        priorWeight = 0.05;
      } else {
        confidenceScore = 94;
        finalWatts = bestWatts;
        priorWeight = 0.0;
      }
    } else {
      // Bayesian prior fills the sparse gap when no ride of this duration exists
      priorWeight = 1.0;
      confidenceScore = 65;
      finalWatts = modeledWatts;
    }

    const wPerKg = Number((finalWatts / weightKg).toFixed(2));

    return {
      durationMin: dur.minutes,
      durationLabel: dur.label,
      actualValue: finalWatts,
      formattedValue: `${finalWatts} W`,
      secondaryFormatted: `${wPerKg} W/kg`,
      modeledValue: modeledWatts,
      modeledFormatted: `${modeledWatts} W`,
      effortType: priorWeight > 0.5 ? 'bayesian_prior' : isInterval ? 'interval_session' : 'continuous_steady',
      variabilityIndex: bestVi,
      activityId: bestAct?.id,
      activityName: bestAct?.name,
      activityDate: bestAct?.start_date ? new Date(bestAct.start_date).toLocaleDateString() : undefined,
      isContinuousReliable: !isInterval || dur.minutes < 12,
      confidenceScore,
      priorWeight,
    };
  });

  // Enforce physiological monotonicity on Bike Peak Power:
  // Peak power for a shorter duration t1 must be >= peak power for any longer duration t2 (t1 < t2),
  // and a longer duration cannot exceed a shorter empirical duration.
  const bikePeaks: PeakPerformanceMetric[] = [...rawBikePeaks];
  for (let i = 1; i < bikePeaks.length; i++) {
    if (bikePeaks[i].actualValue > bikePeaks[i - 1].actualValue) {
      // Cap longer duration to not exceed the preceding shorter duration
      const cappedWatts = bikePeaks[i - 1].actualValue;
      const wPerKg = Number((cappedWatts / weightKg).toFixed(2));
      bikePeaks[i] = {
        ...bikePeaks[i],
        actualValue: cappedWatts,
        formattedValue: `${cappedWatts} W`,
        secondaryFormatted: `${wPerKg} W/kg`,
      };
    }
  }

  // 2. RUN PEAK PACE (incorporates user benchmark sessions: 3m, 4m, 9m, 30m continuous)
  const rawRunPeaks: PeakPerformanceMetric[] = PEAK_DURATIONS.map((dur) => {
    const sec = dur.seconds;
    // Theoretical model: Speed = CS + D'/t
    const modeledSpeedMps = params.criticalSpeedMps + params.dPrimeMeters / sec;
    const modeledPaceSec = Math.round(1000 / modeledSpeedMps);

    // Check user benchmark sessions first (e.g. 3m @ 3:32, 4m @ 3:38, 9m @ 3:42, 30m @ 3:42)
    const matchingBenchmark = ATHLETE_BENCHMARK_SESSIONS.find((b) => b.durationMin === dur.minutes);

    let fastestPaceSec = matchingBenchmark ? matchingBenchmark.repPaceSec : 9999;
    let bestActId: string | number | undefined = undefined;
    let bestActName = matchingBenchmark ? matchingBenchmark.sessionDescription : undefined;
    let bestActDate: string | undefined = undefined;
    let bestEffortType: 'continuous_steady' | 'interval_session' | 'bayesian_prior' = matchingBenchmark
      ? (matchingBenchmark.sessionType === 'interval_reps' ? 'interval_session' : 'continuous_steady')
      : 'continuous_steady';

    for (const act of runActivities) {
      const actDet = activityDetails[String(act.id)];
      if (actDet?.calibration?.isIgnoredFromTrainingStatus) continue;

      const actTime = actDet?.calibration?.calibratedMovingTimeSec || act.moving_time || 0;
      const actDist = actDet?.calibration?.calibratedDistanceM || act.distance || 0;
      if (actTime < sec * 0.9 || actDist <= 0) continue;

      const streamsObj = actDet?.streams as
        | { time?: { data?: number[] }; velocity_smooth?: { data?: number[] } }
        | undefined;
      const streamBestSpeed = computeStreamRollingBest(
        streamsObj?.time?.data,
        streamsObj?.velocity_smooth?.data,
        sec
      );

      let estPaceSec = 9999;
      if (streamBestSpeed !== null && streamBestSpeed > 1.5) {
        estPaceSec = 1000 / streamBestSpeed;
      } else {
        const actAvgSpeed = actDist / actTime;
        const actPace = 1000 / actAvgSpeed;
        if (actTime >= sec) {
          const durationRatio = Math.min(3.0, actTime / sec);
          const fatigueFactor = Math.pow(1 / durationRatio, 0.045);
          estPaceSec = actPace * fatigueFactor;
        } else {
          estPaceSec = actPace * (sec / actTime);
        }
      }

      if (estPaceSec < fastestPaceSec && estPaceSec > 130) {
        fastestPaceSec = Math.round(estPaceSec);
        bestActId = act.id;
        bestActName = act.name;
        bestActDate = act.start_date ? new Date(act.start_date).toLocaleDateString() : undefined;
        bestEffortType = 'continuous_steady';
      }
    }

    const empiricalAvailable = fastestPaceSec < 9000;
    const finalPaceSec = empiricalAvailable ? fastestPaceSec : modeledPaceSec;

    const priorWeight = empiricalAvailable ? 0.0 : 0.85;
    const confidenceScore = matchingBenchmark
      ? 96
      : empiricalAvailable
      ? 90
      : 68;

    return {
      durationMin: dur.minutes,
      durationLabel: dur.label,
      actualValue: finalPaceSec,
      formattedValue: formatPaceKm(finalPaceSec),
      secondaryFormatted: formatPaceMiles(finalPaceSec),
      modeledValue: modeledPaceSec,
      modeledFormatted: formatPaceKm(modeledPaceSec),
      effortType: empiricalAvailable ? bestEffortType : 'bayesian_prior',
      activityId: bestActId,
      activityName: bestActName,
      activityDate: bestActDate,
      isContinuousReliable: true,
      confidenceScore,
      priorWeight,
    };
  });

  // Enforce physiological monotonicity on Run Peak Pace (pace in sec/km must be non-decreasing with duration)
  const runPeaks: PeakPerformanceMetric[] = [...rawRunPeaks];
  for (let i = 1; i < runPeaks.length; i++) {
    if (runPeaks[i].actualValue < runPeaks[i - 1].actualValue) {
      const cappedPaceSec = runPeaks[i - 1].actualValue;
      runPeaks[i] = {
        ...runPeaks[i],
        actualValue: cappedPaceSec,
        formattedValue: formatPaceKm(cappedPaceSec),
        secondaryFormatted: formatPaceMiles(cappedPaceSec),
      };
    }
  }

  return { bikePeaks, runPeaks };
}

/**
 * Models swim race times across distances:
 * Sprint (750m) uses CSS directly;
 * Olympic (1500m), 70.3 (1900m), and Ironman (3800m) with Confidence Scoring
 * and fallback explanation if no continuous 1000m/1500m test exists.
 */
export function computeSwimRacePredictions(params: CriticalParameters): SwimRacePredictions {
  const css = params.cssSecPer100m;
  const p1500 = params.swim1500mSec;
  const pace1500Per100 = p1500 / 15;
  const hasDirectLong = params.hasDirectLongSwimPace;

  // 1. Sprint (400m Pool Swim): CSS pace + tactical pacing reserve (+2.5% over CSS)
  // Not quite as fast as an all-out standalone 400m swim (which produces heavy lactate before T1),
  // but tracks very closely with CSS time!
  const sprint400mPace = Math.round(css * 1.025);
  const sprint400mSec = Math.round(4 * sprint400mPace);

  // 2. Sprint (750m Open Water): Pure CSS pace
  const sprintSec = Math.round(css * 7.5);

  // 3. Olympic (1500m): Based on 1500m benchmark
  const olympicSec = p1500;

  // 4. Middle / 70.3 (1900m): 1500m pace + 2% open water endurance factor
  const halfSec = Math.round(pace1500Per100 * 1.025 * 19);

  // 5. Ironman (3800m): 1500m pace + 5.5% aerobic degradation
  const fullSec = Math.round(pace1500Per100 * 1.060 * 38);

  const races: SwimRacePredictionItem[] = [
    {
      distanceId: 'sprint_400m',
      name: 'Sprint Triathlon (400m Pool Swim)',
      distanceM: 400,
      modelingBasis: 'CSS Pace + Tactical Triathlon Reserve (+2.5% over CSS)',
      predictedTimeSec: sprint400mSec,
      predictedTimeFormatted: formatDurationHMS(sprint400mSec),
      pacePer100mFormatted: formatSwimPace(sprint400mPace),
      targetAgeGroupTop20TimeSec: 6 * 60 + 40, // 6:40 (1:40/100m)
      targetAgeGroupTop20TimeFormatted: '6:40',
      confidenceLevel: 'high',
      confidenceScore: 95,
      confidenceExplanation:
        'Highest confidence (95%). CSS is anchored directly on your 400m pool TT (6:12) and 100m pool TT (1:24). The swim leg tracks closely with CSS time (6:24–6:35), slightly slower than a standalone 400m swim to manage lactate accumulation before the bike.',
      dataAnchorsUsed: ['400m Pool TT (6:12)', '100m Pool TT (1:24)', 'Derived CSS (1:36/100m)'],
    },
    {
      distanceId: 'sprint',
      name: 'Sprint Triathlon (750m Open Water)',
      distanceM: 750,
      modelingBasis: 'Direct CSS Pace + Open Water Sighting',
      predictedTimeSec: sprintSec,
      predictedTimeFormatted: formatDurationHMS(sprintSec),
      pacePer100mFormatted: formatSwimPace(css),
      targetAgeGroupTop20TimeSec: 12 * 60 + 30, // 12:30
      targetAgeGroupTop20TimeFormatted: '12:30',
      confidenceLevel: 'high',
      confidenceScore: 92,
      confidenceExplanation: 'High confidence. CSS is physiologically calibrated for ~750m open water race distance.',
      dataAnchorsUsed: ['100m TT (1:24)', '400m TT (6:12)', 'Derived CSS (1:36/100m)'],
    },
    {
      distanceId: 'olympic',
      name: 'Olympic Triathlon (1,500m)',
      distanceM: 1500,
      modelingBasis: hasDirectLong
        ? 'Empirical 1,500m Continuous Swim Test'
        : 'CSS Baseline + 4.5% Continuous Degradation Model',
      predictedTimeSec: olympicSec,
      predictedTimeFormatted: formatDurationHMS(olympicSec),
      pacePer100mFormatted: formatSwimPace(pace1500Per100),
      targetAgeGroupTop20TimeSec: 25 * 60, // 25:00
      targetAgeGroupTop20TimeFormatted: '25:00',
      confidenceLevel: hasDirectLong ? 'high' : 'moderate',
      confidenceScore: hasDirectLong ? 94 : 76,
      confidenceExplanation: hasDirectLong
        ? 'High confidence supported by continuous 1,500m effort.'
        : 'Moderate confidence. Extrapolated from 400m test. Log a continuous 1,500m steady pace test to boost accuracy.',
      dataAnchorsUsed: hasDirectLong
        ? ['Continuous 1,500m Telemetry', 'CSS Threshold']
        : ['100m TT', '400m TT', 'CSS Aerobic Decay Model'],
    },
    {
      distanceId: 'middle_70_3',
      name: 'Middle Distance 70.3 (1,900m)',
      distanceM: 1900,
      modelingBasis: '1,500m Stamina + Open Water Sighting (+2.5%)',
      predictedTimeSec: halfSec,
      predictedTimeFormatted: formatDurationHMS(halfSec),
      pacePer100mFormatted: formatSwimPace(halfSec / 19),
      targetAgeGroupTop20TimeSec: 32 * 60, // 32:00
      targetAgeGroupTop20TimeFormatted: '32:00',
      confidenceLevel: hasDirectLong ? 'high' : 'moderate',
      confidenceScore: hasDirectLong ? 88 : 68,
      confidenceExplanation: hasDirectLong
        ? 'Good confidence anchored on 1,500m sustained speed with open-water sighting adjustment.'
        : 'Moderate confidence. Models 1,900m endurance curve from CSS. Steady 1,000m/1,500m pool reps would refine open-water drop-off.',
      dataAnchorsUsed: hasDirectLong ? ['1,500m Continuous Data'] : ['400m TT Scale', 'CSS Decay'],
    },
    {
      distanceId: 'ironman',
      name: 'Full IRONMAN (3,800m)',
      distanceM: 3800,
      modelingBasis: 'Extended Aerobic Durability (+6.0% vs 1,500m pace)',
      predictedTimeSec: fullSec,
      predictedTimeFormatted: formatDurationHMS(fullSec),
      pacePer100mFormatted: formatSwimPace(fullSec / 38),
      targetAgeGroupTop20TimeSec: 64 * 60, // 1:04:00
      targetAgeGroupTop20TimeFormatted: '1:04:00',
      confidenceLevel: hasDirectLong ? 'moderate' : 'extrapolated',
      confidenceScore: hasDirectLong ? 78 : 58,
      confidenceExplanation: hasDirectLong
        ? 'Moderate confidence. 3.8km swim introduces non-linear fatigue, pack drafting, and sighting variance.'
        : 'Extrapolated. Without logged 1,000m+ swim efforts, stamina decay is modeled via physiological curve. Treat as directional estimate.',
      dataAnchorsUsed: hasDirectLong ? ['1,500m Base Pace', 'Aerobic Fatigue Model'] : ['CSS Base', 'Decay Multiplier'],
    },
  ];

  return {
    cssBasisPaceFormatted: formatSwimPace(css),
    swim100mFormatted: params.swim100mFormatted,
    swim400mFormatted: params.swim400mFormatted,
    benchmark1000mFormatted: params.swim1000mFormatted,
    benchmark1500mFormatted: params.swim1500mFormatted,
    hasDirectLongSwimPace: hasDirectLong,
    overallSwimConfidence: hasDirectLong ? 88 : 72,
    swimDataSummary: hasDirectLong
      ? 'Supported by 100m, 400m tests and long swim telemetry.'
      : 'Supported by 100m (1:24) & 400m (6:12) test anchors. Long endurance is modeled via CSS decay.',
    races,
  };
}

/**
 * Running race predictions anchored from Lactate Threshold pace.
 * Includes confidence scoring, soft-peak / training effort anomaly detection,
 * and HR-pace regression cross checks.
 */
export function computeRunningRacePredictions(
  params: CriticalParameters,
  activities: StravaActivity[] = [],
  courseProfile: RunCourseWeatherProfile = 'flat_optimal',
  riegelExponent: number = 1.055
): RunningRacePrediction[] {
  const ltPaceSec = params.lactateThresholdPaceSec; // e.g. 232 sec/km (3:52/km)
  const ltSpeedMps = 1000 / ltPaceSec; // ~4.31 m/s

  // Course & Weather adjustment factor
  let courseFactor = 1.0;
  if (courseProfile === 'hilly_uk') courseFactor = 1.022; // +2.2% time penalty on UK rolling course
  if (courseProfile === 'warm_humid') courseFactor = 1.028; // +2.8% cardiac drift penalty

  // Race distance configurations with user-specified speed fraction table
  const racesConfig = [
    {
      id: 'five_k' as RunningEventDistance,
      name: '5 km Road Race',
      distanceM: 5000,
      distanceKm: 5.0,
      speedFractionMin: 1.04,
      speedFractionMax: 1.07,
      speedFractionDefault: 1.055, // 105.5% of LT speed
      targetHrPercentMax: 0.96, // 96% of HRmax
    },
    {
      id: 'ten_k' as RunningEventDistance,
      name: '10 km Road Race',
      distanceM: 10000,
      distanceKm: 10.0,
      speedFractionMin: 1.01,
      speedFractionMax: 1.03,
      speedFractionDefault: 1.020, // 102% of LT speed
      targetHrPercentMax: 0.93,
    },
    {
      id: 'ten_miler' as RunningEventDistance,
      name: '10 Miles (16.09 km)',
      distanceM: 16093.44,
      distanceKm: 16.09344,
      speedFractionMin: 0.95,
      speedFractionMax: 0.98,
      speedFractionDefault: 0.965, // 96.5% of LT speed (~96-98% of best 30m continuous speed)
      targetHrPercentMax: 0.90,
    },
    {
      id: 'half_marathon' as RunningEventDistance,
      name: 'Half Marathon (21.1 km)',
      distanceM: 21097.5,
      distanceKm: 21.0975,
      speedFractionMin: 0.95,
      speedFractionMax: 0.98,
      speedFractionDefault: 0.960, // 96% of LT speed
      targetHrPercentMax: 0.89,
    },
    {
      id: 'marathon' as RunningEventDistance,
      name: 'Marathon (42.2 km)',
      distanceM: 42195,
      distanceKm: 42.195,
      speedFractionMin: 0.88,
      speedFractionMax: 0.93,
      speedFractionDefault: 0.905, // 90.5% of LT speed
      targetHrPercentMax: 0.85,
    },
  ];

  // Scan logged activities for logged peak times at these distances
  const runActivities = activities.filter((act) => {
    if (act.isDeleted) return false;
    const cls = classifyActivity(act);
    return cls.category === 'Run' || act.type === 'Run';
  });

  return racesConfig.map((cfg) => {
    // 1. Race speed as fraction of LT speed
    const raceSpeedMps = ltSpeedMps * cfg.speedFractionDefault * (1 / courseFactor);
    const predictedPaceSec = Math.round(1000 / raceSpeedMps);
    const predictedTimeSec = Math.round(cfg.distanceKm * predictedPaceSec);

    // 2. Scan logged activities for closest peak effort
    let loggedBestSec: number | undefined;
    let loggedBestAct: StravaActivity | null = null;

    for (const act of runActivities) {
      const dist = act.distance || 0;
      const time = act.moving_time || 0;
      if (dist <= 0 || time <= 0) continue;

      // Activity distance close to target (within 10%)
      if (Math.abs(dist - cfg.distanceM) / cfg.distanceM <= 0.12) {
        const paceSec = time / (dist / 1000);
        const normalizedTimeSec = Math.round(cfg.distanceKm * paceSec);
        if (!loggedBestSec || normalizedTimeSec < loggedBestSec) {
          loggedBestSec = normalizedTimeSec;
          loggedBestAct = act;
        }
      }
    }

    // 3. Confidence scoring and discordance detection (Point 3)
    let isDiscordant = false;
    let discordanceReason: string | undefined;
    let confidenceScore = 92;
    let confidenceLabel: 'High (Aligned)' | 'Medium (Model Guided)' | 'Low (Soft Peak / Discordance)' = 'High (Aligned)';

    if (loggedBestSec) {
      const paceRatio = loggedBestSec / predictedTimeSec;
      if (paceRatio > 1.12) {
        // Logged time is >12% slower than LT model
        isDiscordant = true;
        confidenceScore = 40;
        confidenceLabel = 'Low (Soft Peak / Discordance)';
        discordanceReason = `Logged best (${formatDurationHMS(loggedBestSec)}) was an easy/training run. Your 3:52/km LT pace indicates an achievable potential of ${formatDurationHMS(predictedTimeSec)} (${formatPaceKm(predictedPaceSec)}).`;
      } else if (paceRatio < 0.95) {
        // Faster than model (all-out peak race)
        confidenceScore = 96;
        confidenceLabel = 'High (Aligned)';
      } else {
        confidenceScore = 90;
        confidenceLabel = 'High (Aligned)';
      }
    } else {
      confidenceScore = 80;
      confidenceLabel = 'Medium (Model Guided)';
      discordanceReason = 'No standalone race logged at this exact distance; estimated with high reliability from LT pace anchor.';
    }

    // 4. HR-Pace Regression Cross Check (Point 4)
    // Distance-typical target HR evaluated against athlete's LTHR/HRmax
    const targetHr = Math.round(params.hrMax * cfg.targetHrPercentMax);
    // Steady pace regression: near LT (168 bpm = 232 sec/km; ~3.5 sec per bpm slope)
    const hrDelta = targetHr - params.runLthr;
    const hrRegressionPaceSec = Math.max(180, Math.round(ltPaceSec - hrDelta * 3.2));
    const hrConcordance = Math.min(100, Math.round(100 - (Math.abs(predictedPaceSec - hrRegressionPaceSec) / predictedPaceSec) * 100));

    return {
      distanceId: cfg.id,
      name: cfg.name,
      distanceM: cfg.distanceM,
      distanceKm: cfg.distanceKm,
      ltSpeedPercentageMin: cfg.speedFractionMin * 100,
      ltSpeedPercentageMax: cfg.speedFractionMax * 100,
      ltSpeedPercentageUsed: Number((cfg.speedFractionDefault * 100).toFixed(1)),
      predictedPaceSec,
      predictedPaceFormatted: formatPaceKm(predictedPaceSec),
      predictedTimeSec,
      predictedTimeFormatted: formatDurationHMS(predictedTimeSec),
      loggedPeakTimeSec: loggedBestSec,
      loggedPeakTimeFormatted: loggedBestSec ? formatDurationHMS(loggedBestSec) : undefined,
      loggedPeakPaceFormatted: loggedBestSec ? formatPaceKm(loggedBestSec / cfg.distanceKm) : undefined,
      confidenceScore,
      confidenceLabel,
      isDiscordant,
      discordanceReason,
      hrRegressionPaceFormatted: formatPaceKm(hrRegressionPaceSec),
      hrRegressionConcordancePercent: hrConcordance,
      durabilityAdjustedNotes:
        cfg.id === 'ten_miler'
          ? 'Race speed for 10 miles is ~96.5% of your best 30-min continuous speed (3:42/km -> ~3:50/km). With <5% HR drift, holds the upper fraction.'
          : undefined,
    };
  });
}

/**
 * Computes unified discipline ability on a normalized 0-100% scale
 * based on Coggan power profile, WMA running standards, and swim distributions.
 */
export function computeUnifiedDisciplinePercentiles(
  params: CriticalParameters,
  athleteProfile?: AthleteProfile
): UnifiedDisciplinePercentile[] {
  const age = Number(athleteProfile?.age) || 41;
  const weightKg = Number(athleteProfile?.weightKg) || 77;
  const ftp = params.ftpWatts;
  const wKg = params.ftpWattsPerKg; // e.g. 4.09 W/kg
  const ltPaceSec = params.lactateThresholdPaceSec; // e.g. 232 sec/km (3:52/km)
  const cssSec = params.cssSecPer100m; // e.g. 96 sec/100m (1:36/100m)

  // 1. Cycling Ability Percentile (Coggan W/kg for 40-44 male)
  // 2.5 W/kg = 30%, 3.5 W/kg = 60%, 4.0 W/kg = 80%, 4.5 W/kg = 92%, 5.0 W/kg = 98%
  let bikePercentile = Math.round(30 + ((wKg - 2.5) / 2.5) * 65);
  bikePercentile = Math.max(15, Math.min(99, bikePercentile));
  const bikeTier =
    wKg >= 4.5 ? 'Cat 1 / Excellent' : wKg >= 3.9 ? 'Cat 2 / Very Good' : wKg >= 3.3 ? 'Cat 3 / Competitive' : 'Cat 4 / Moderate';

  // 2. Running Ability Percentile (WMA 2023 Age-Graded 41yo male standard)
  // LT pace 3:52/km equates to ~16:45 5k / 34:40 10k -> ~84% age-graded
  let runPercentile = Math.round(100 - ((ltPaceSec - 190) / (320 - 190)) * 60);
  runPercentile = Math.max(20, Math.min(99, runPercentile));
  const runTier =
    runPercentile >= 85 ? 'National Class' : runPercentile >= 75 ? 'Regional Competitive' : 'Local Competitive';

  // 3. Swimming Ability Percentile (Triathlon & Masters Age Group)
  // 1:20 = 95%, 1:30 = 84%, 1:36 = 74%, 1:45 = 55%, 2:00 = 35%
  let swimPercentile = Math.round(100 - ((cssSec - 80) / (120 - 80)) * 60);
  swimPercentile = Math.max(15, Math.min(99, swimPercentile));
  const swimTier =
    cssSec <= 90 ? 'Top 15% Age Group' : cssSec <= 98 ? 'Top 25% Age Group' : 'Mid Pack';

  return [
    {
      discipline: 'bike',
      label: 'Cycling (FTP)',
      metricName: 'Power-to-Weight (FTP)',
      athleteValue: `${ftp}W (${wKg} W/kg)`,
      percentile: bikePercentile,
      tierLabel: bikeTier,
      referenceStandard: 'Coggan Power-to-Weight Tables (M40–44)',
      timeSensitivity: 'Critical (~50% race time)',
      roiRecommendation: 'Aerodynamic optimization & high wattage stability yields the highest absolute minutes saved.',
    },
    {
      discipline: 'run',
      label: 'Running (LT Pace)',
      metricName: 'Lactate Threshold Pace',
      athleteValue: `${formatPaceKm(ltPaceSec)} (${formatPaceMiles(ltPaceSec)})`,
      percentile: runPercentile,
      tierLabel: runTier,
      referenceStandard: 'WMA Age-Graded Running Standards (Age 41)',
      timeSensitivity: 'High (~35% race time)',
      roiRecommendation: 'Fatigue resistance off the bike is the decisive factor separating the podium.',
    },
    {
      discipline: 'swim',
      label: 'Swimming (CSS)',
      metricName: 'Critical Swim Speed',
      athleteValue: formatSwimPace(cssSec),
      percentile: swimPercentile,
      tierLabel: swimTier,
      referenceStandard: 'Triathlon Age-Group Finishers Distribution',
      timeSensitivity: 'Modest (~15% race time)',
      roiRecommendation: 'Lowest absolute time sensitivity; focus on energy conservation rather than chasing minor seconds.',
    },
  ];
}

/**
 * Evaluates Race-Specific Weaknesses and Time-Gain Potential relative to Age-Group Benchmarks.
 * Supports course profile adjustment (Flat vs Rolling 800m elevation for Ironman; Flat vs Hilly for 10M/HM).
 */
export function computeRaceWeaknessAnalysis(
  category: PerformanceEventCategory,
  distanceId: string,
  params: CriticalParameters,
  athleteProfile?: AthleteProfile,
  bikeCourseProfile: BikeCourseElevationProfile = 'rolling_800m',
  runCourseProfile: RunCourseWeatherProfile = 'flat_optimal',
  riegelExponent: number = 1.055
): RaceWeaknessAnalysis {
  const age = Number(athleteProfile?.age) || 41;
  const ageGroup = `M ${getAgeGroupBracket(age)}`;
  const weightKg = Number(athleteProfile?.weightKg) || 77;

  if (category === 'triathlon') {
    const triDistance = (distanceId as TriathlonEventDistance) || 'middle_70_3';
    let eventName = 'Middle Distance (70.3)';
    let swimDistM = 1900;
    let bikeDistKm = 90;
    let runDistKm = 21.1;

    // Benchmark times for Competitive Age-Grouper (Top 20%) in M40-44
    let benchSwimSec = 32 * 60; // 32:00
    let benchBikeSec = 2 * 3600 + 32 * 60; // 2:32:00
    let benchRunSec = 1 * 3600 + 34 * 60; // 1:34:00

    if (triDistance === 'sprint_400m') {
      eventName = 'Sprint Triathlon (400m Pool / 20k / 5k)';
      swimDistM = 400;
      bikeDistKm = 20;
      runDistKm = 5;
      benchSwimSec = 6 * 60 + 40; // 6:40 (1:40/100m)
      benchBikeSec = 33 * 60; // 33:00 (36.4 km/h)
      benchRunSec = 20 * 60; // 20:00 (4:00/km)
    } else if (triDistance === 'sprint') {
      eventName = 'Sprint Triathlon (750m / 20k / 5k)';
      swimDistM = 750;
      bikeDistKm = 20;
      runDistKm = 5;
      benchSwimSec = 12 * 60 + 30;
      benchBikeSec = 33 * 60;
      benchRunSec = 20 * 60;
    } else if (triDistance === 'olympic') {
      eventName = 'Olympic Triathlon (1.5k / 40k / 10k)';
      swimDistM = 1500;
      bikeDistKm = 40;
      runDistKm = 10;
      benchSwimSec = 25 * 60;
      benchBikeSec = 1 * 3600 + 6 * 60;
      benchRunSec = 42 * 60;
    } else if (triDistance === 'ironman') {
      eventName = 'Full IRONMAN (3.8k / 180k / 42.2k)';
      swimDistM = 3800;
      bikeDistKm = 180;
      runDistKm = 42.2;
      benchSwimSec = 1 * 3600 + 4 * 60; // 1:04:00
      benchBikeSec = 5 * 3600 + 15 * 60; // 5:15:00
      benchRunSec = 3 * 3600 + 30 * 60; // 3:30:00
    }

    // Course adjustments for Bike
    let bikeElevationAdjustment = 1.0;
    if (bikeCourseProfile === 'flat') {
      bikeElevationAdjustment = 0.965; // ~3.5% faster on dead flat course
    } else if (bikeCourseProfile === 'rolling_800m') {
      bikeElevationAdjustment = 1.0; // Baseline rolling 800m course
    } else if (bikeCourseProfile === 'hilly') {
      bikeElevationAdjustment = 1.065; // +6.5% penalty for steep elevation
    }

    // 1. Swim: based on CSS + distance pacing
    const swimPace100m =
      params.cssSecPer100m *
      (triDistance === 'sprint_400m'
        ? 1.025
        : triDistance === 'sprint'
        ? 1.0
        : triDistance === 'olympic'
        ? 1.03
        : triDistance === 'middle_70_3'
        ? 1.05
        : 1.085);
    const athleteSwimSec = Math.round((swimDistM / 100) * swimPace100m);

    // 2. Bike: pacing at ~78-84% FTP for 70.3, ~88-92% for Olympic, ~72-74% for Ironman
    const bikeIntensity =
      (triDistance === 'sprint_400m' || triDistance === 'sprint')
        ? 0.95
        : triDistance === 'olympic'
        ? 0.90
        : triDistance === 'middle_70_3'
        ? 0.82
        : 0.73;
    const raceWatts = params.ftpWatts * bikeIntensity;
    const raceWkg = raceWatts / weightKg;
    // Speed estimation from Watts/kg adjusted for course elevation
    const baseSpeedKph = Math.max(24, Math.min(46, 17.2 + raceWkg * 5.4));
    const effectiveSpeedKph = baseSpeedKph / bikeElevationAdjustment;
    const athleteBikeSec = Math.round((bikeDistKm / effectiveSpeedKph) * 3600);

    // 3. Run: running off the bike with Riegel durability decay
    const runPacingFactor =
      (triDistance === 'sprint_400m' || triDistance === 'sprint')
        ? 1.03
        : triDistance === 'olympic'
        ? 1.06
        : triDistance === 'middle_70_3'
        ? 1.11
        : 1.20 * Math.pow(riegelExponent / 1.055, 1.2);
    const racePaceSecPerKm = params.lactateThresholdPaceSec * runPacingFactor;
    const athleteRunSec = Math.round(runDistKm * racePaceSecPerKm);

    // Time gain opportunity vs benchmark
    const swimOpportunitySec = Math.max(0, athleteSwimSec - benchSwimSec);
    const bikeOpportunitySec = Math.max(0, athleteBikeSec - benchBikeSec);
    const runOpportunitySec = Math.max(0, athleteRunSec - benchRunSec);

    const disciplinesList: DisciplineOpportunity[] = [
      {
        discipline: 'swim',
        name: 'Swim Leg',
        distanceLabel: `${swimDistM}m (${triDistance === 'sprint_400m' ? 'Pool' : 'Open Water'})`,
        athleteTimeSec: athleteSwimSec,
        athleteTimeFormatted: formatDurationHMS(athleteSwimSec),
        benchmarkTimeSec: benchSwimSec,
        benchmarkTimeFormatted: formatDurationHMS(benchSwimSec),
        timeGainSec: swimOpportunitySec,
        timeGainFormatted: `+${formatDurationHMS(swimOpportunitySec)}`,
        opportunityRank: 3,
        ageGroupPercentile: Math.min(96, Math.max(20, Math.round(100 - (athleteSwimSec / benchSwimSec - 0.85) * 60))),
        currentPaceOrPower: formatSwimPace(swimPace100m),
        targetPaceOrPower: formatSwimPace(benchSwimSec / (swimDistM / 100)),
        coachingInsight:
          triDistance === 'sprint_400m'
            ? 'In a 400m pool sprint, the swim is ~10% of total race duration (~6.5m). Squeezing an extra 5 seconds by sprinting causes severe lactate penalty in T1. Swim controlled at CSS.'
            : 'Lowest time sensitivity (~12% of race time). Focus on drafting efficiency and arriving fresh in T1.',
      },
      {
        discipline: 'bike',
        name: 'Bike Leg',
        distanceLabel: `${bikeDistKm} km (${bikeCourseProfile === 'flat' ? 'Flat' : bikeCourseProfile === 'rolling_800m' ? '~800m Elev' : 'Hilly'})`,
        athleteTimeSec: athleteBikeSec,
        athleteTimeFormatted: formatDurationHMS(athleteBikeSec),
        benchmarkTimeSec: benchBikeSec,
        benchmarkTimeFormatted: formatDurationHMS(benchBikeSec),
        timeGainSec: bikeOpportunitySec,
        timeGainFormatted: `+${formatDurationHMS(bikeOpportunitySec)}`,
        opportunityRank: 2,
        ageGroupPercentile: Math.min(98, Math.max(25, Math.round(100 - (athleteBikeSec / benchBikeSec - 0.85) * 80))),
        currentPaceOrPower: `${Math.round(raceWatts)}W (${raceWkg.toFixed(2)} W/kg, ${effectiveSpeedKph.toFixed(1)} km/h)`,
        targetPaceOrPower: `${Math.round(params.ftpWatts * 0.85)}W (Benchmark)`,
        coachingInsight:
          bikeCourseProfile === 'flat'
            ? 'On a flatter course, speeds are higher for all athletes, which slightly compresses bike time variance and elevates run durability importance.'
            : 'Major time determinant (~50% of race). Aerodynamic efficiency (CdA) and steady pacing up the 800m climbs prevent running blowouts.',
      },
      {
        discipline: 'run',
        name: 'Run Leg',
        distanceLabel: `${runDistKm} km`,
        athleteTimeSec: athleteRunSec,
        athleteTimeFormatted: formatDurationHMS(athleteRunSec),
        benchmarkTimeSec: benchRunSec,
        benchmarkTimeFormatted: formatDurationHMS(benchRunSec),
        timeGainSec: runOpportunitySec,
        timeGainFormatted: `+${formatDurationHMS(runOpportunitySec)}`,
        opportunityRank: 1,
        ageGroupPercentile: Math.min(95, Math.max(15, Math.round(100 - (athleteRunSec / benchRunSec - 0.85) * 80))),
        currentPaceOrPower: formatPaceKm(racePaceSecPerKm),
        targetPaceOrPower: formatPaceKm(benchRunSec / runDistKm),
        coachingInsight:
          'Highest race-day time variance. Managing nutrition and preserving glycogen ensures holding target marathon pace off the bike.',
      },
    ];

    disciplinesList.sort((a, b) => b.timeGainSec - a.timeGainSec);
    disciplinesList.forEach((d, idx) => {
      d.opportunityRank = idx + 1;
    });

    const primary = disciplinesList[0];
    const totalProj = athleteSwimSec + athleteBikeSec + athleteRunSec;
    const totalBench = benchSwimSec + benchBikeSec + benchRunSec;
    const totalOpp = Math.max(0, totalProj - totalBench);

    return {
      eventName,
      eventDistanceId: triDistance,
      category: 'triathlon',
      ageGroup,
      athleteAge: age,
      athleteWeightKg: weightKg,
      courseProfile: {
        bikeElevation: bikeCourseProfile,
        runProfile: runCourseProfile,
        riegelExponent,
      },
      projectedTotalTimeSec: totalProj,
      projectedTotalTimeFormatted: formatDurationHMS(totalProj),
      benchmarkTotalTimeSec: totalBench,
      benchmarkTotalTimeFormatted: formatDurationHMS(totalBench),
      totalTimeOpportunitySec: totalOpp,
      totalTimeOpportunityFormatted: formatDurationHMS(totalOpp),
      primaryLimiter: primary.discipline,
      primaryLimiterName: primary.name,
      disciplines: disciplinesList,
      strategicDirective: `Your highest time-gain potential is in the ${primary.name} (${primary.timeGainFormatted} potential gain). On a ${bikeCourseProfile === 'flat' ? 'flat' : '~800m elevation'} course, allocating focused threshold blocks here delivers the greatest net reduction in your overall race time.`,
    };
  }

  // Standalone Running Benchmark
  return {
    eventName: 'Running Race Predictions',
    eventDistanceId: 'running',
    category: 'running',
    ageGroup,
    athleteAge: age,
    athleteWeightKg: weightKg,
    courseProfile: {
      bikeElevation: bikeCourseProfile,
      runProfile: runCourseProfile,
      riegelExponent,
    },
    projectedTotalTimeSec: 0,
    projectedTotalTimeFormatted: '0:00',
    benchmarkTotalTimeSec: 0,
    benchmarkTotalTimeFormatted: '0:00',
    totalTimeOpportunitySec: 0,
    totalTimeOpportunityFormatted: '0:00',
    primaryLimiter: 'run',
    primaryLimiterName: 'Run Leg',
    disciplines: [],
    strategicDirective: 'Running race performance model active.',
  };
}
