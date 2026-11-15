import type { AthleteProfile } from '../types/athlete';
import type { GoalEventType, GoalPriority, RunCourseType, TrainingGoal } from '../types/goals';

export interface PriorityPaceSuggestion {
  priority: GoalPriority;
  label: string; // e.g. "Priority A — Peak Taper (Sub-60)"
  shortBadge: string; // e.g. "A-Race Peak"
  targetTimeSec: number;
  targetTimeFormatted: string; // e.g. "59:30" or "1:00:30"
  targetPaceSecPerKm: number;
  targetPaceKmFormatted: string; // e.g. "3:42/km"
  targetPaceMileFormatted: string; // e.g. "5:57/mi"
  targetHrRange: string; // e.g. "162–166 bpm (96–99% LTHR)"
  effortPctLthr: string; // e.g. "96–99% LTHR"
  taperAndStrategyNote: string;
  // Age-grade, FTP & Fitness enrichments
  ageGradePct?: number;
  ageGradeClass?: string;
  ageGradedEquivalentFormatted?: string;
  wmaFactor?: number;
  ftpWattsPerKg?: number;
  ctlUsed?: number;
  fiveKmSplitFormatted?: string;
  fiveMileSplitFormatted?: string;
  tenKmSplitFormatted?: string;
  pacingStrategy?: {
    phase: string;
    distanceRange: string;
    targetPaceKm: string;
    targetPaceMile: string;
    targetHr: string;
    cue: string;
  }[];
}

export interface TenMileAgeGradeMetrics {
  age: number;
  wmaFactor: number;
  openWorldStandardSec: number;
  ageStandardSec: number;
  ageStandardFormatted: string;
  ageGradedTimeSec: number;
  ageGradedTimeFormatted: string;
  ageGradePct: number;
  ageGradeClass: 'World Class' | 'National Class' | 'Regional Class' | 'Local Class' | 'Fitness Standard';
  nationalClass80TargetSec: number;
  nationalClass80TargetFormatted: string;
  regionalClass75TargetSec: number;
  regionalClass75TargetFormatted: string;
}

export interface RacePacingFitnessContext {
  ctl?: number;
  runCtl?: number;
  atl?: number;
  tsb?: number;
  ctlRampRate7d?: number;
}

export interface ResolvedRaceMetadata {
  name: string;
  eventType: GoalEventType;
  eventDate: string;
  distancePreset: string; // Matches RUN_DISTANCE_PRESETS ('5km', '10km', '10 Mile', 'Half Marathon', 'Marathon', 'Custom') or TRIATHLON_DISTANCE_PRESETS
  totalDistanceKm: number;
  runCourseType: RunCourseType;
  runElevationGainMeters: number;
  bikeElevationGainMeters?: number;
  location: string;
  notes: string;
  sourceTitle?: string;
  sourceUri?: string;
}

export function formatPaceMinSecPerKm(secPerKm: number): string {
  if (!secPerKm || secPerKm <= 0 || !isFinite(secPerKm)) return 'N/A';
  const mins = Math.floor(secPerKm / 60);
  const secs = Math.round(secPerKm % 60);
  if (secs === 60) {
    return `${mins + 1}:00/km`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}/km`;
}

export function formatPaceMinSecPerMile(secPerKm: number): string {
  if (!secPerKm || secPerKm <= 0 || !isFinite(secPerKm)) return 'N/A';
  const secPerMile = secPerKm * 1.609344;
  const mins = Math.floor(secPerMile / 60);
  const secs = Math.round(secPerMile % 60);
  if (secs === 60) {
    return `${mins + 1}:00/mi`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}/mi`;
}

export function formatFinishTimeHms(totalSec: number): string {
  if (!totalSec || totalSec <= 0 || !isFinite(totalSec)) return '0:00';
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = Math.round(totalSec % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Computes World Masters Athletics (WMA) road 10-mile age-grading metrics.
 * Open Men 10-mile road world standard ~ 44:24 (2664s).
 * Age-grading factor smoothly models the WMA Masters road table (e.g. Age 41 = 0.9585).
 */
export function computeTenMileAgeGrade(
  ageInput: number | undefined,
  finishTimeSec: number,
  distanceKm = 16.0934
): TenMileAgeGradeMetrics {
  const age = Math.max(18, Math.min(90, Math.round(ageInput || 41)));
  const distRatio = Math.max(0.2, distanceKm / 16.0934);
  const openWorldStandardSec = Math.round(2664 * Math.pow(distRatio, 1.06));

  let wmaFactor = 1.0;
  if (age > 30 && age <= 35) {
    wmaFactor = 1.0 - (age - 30) * 0.00222;
  } else if (age > 35 && age <= 40) {
    wmaFactor = 0.9889 - (age - 35) * 0.00474;
  } else if (age > 40 && age <= 45) {
    wmaFactor = 0.9652 - (age - 40) * 0.007;
  } else if (age > 45 && age <= 50) {
    wmaFactor = 0.9302 - (age - 45) * 0.00762;
  } else if (age > 50 && age <= 60) {
    wmaFactor = 0.8921 - (age - 50) * 0.00796;
  } else if (age > 60) {
    wmaFactor = Math.max(0.45, 0.8125 - (age - 60) * 0.0092);
  }
  wmaFactor = Number(wmaFactor.toFixed(4));

  const ageStandardSec = Math.round(openWorldStandardSec / wmaFactor);
  const ageGradedTimeSec = Math.round(finishTimeSec * wmaFactor);
  const ageGradePct = Number(((ageStandardSec / Math.max(1, finishTimeSec)) * 100).toFixed(1));

  let ageGradeClass: TenMileAgeGradeMetrics['ageGradeClass'] = 'Fitness Standard';
  if (ageGradePct >= 90) ageGradeClass = 'World Class';
  else if (ageGradePct >= 80) ageGradeClass = 'National Class';
  else if (ageGradePct >= 70) ageGradeClass = 'Regional Class';
  else if (ageGradePct >= 60) ageGradeClass = 'Local Class';

  const nationalClass80TargetSec = Math.round(ageStandardSec / 0.8);
  const regionalClass75TargetSec = Math.round(ageStandardSec / 0.75);

  return {
    age,
    wmaFactor,
    openWorldStandardSec,
    ageStandardSec,
    ageStandardFormatted: formatFinishTimeHms(ageStandardSec),
    ageGradedTimeSec,
    ageGradedTimeFormatted: formatFinishTimeHms(ageGradedTimeSec),
    ageGradePct,
    ageGradeClass,
    nationalClass80TargetSec,
    nationalClass80TargetFormatted: formatFinishTimeHms(nationalClass80TargetSec),
    regionalClass75TargetSec,
    regionalClass75TargetFormatted: formatFinishTimeHms(regionalClass75TargetSec),
  };
}

/**
 * Normalizes any race distance or preset string to match the exact presets in `RUN_DISTANCE_PRESETS`
 * ('5km', '10km', '10 Mile', 'Half Marathon', 'Marathon', 'Custom') or `TRIATHLON_DISTANCE_PRESETS`
 * ('Sprint', 'Olympic', '70.3', 'IRONMAN', 'Custom').
 */
export function normalizeDistancePresetAndKm(
  rawTextOrName: string,
  rawPreset?: string,
  rawDistKm?: number,
  eventType: GoalEventType = 'run'
): { distancePreset: string; totalDistanceKm: number } {
  const combined = `${rawTextOrName || ''} ${rawPreset || ''}`.toLowerCase();

  if (eventType === 'triathlon') {
    if (combined.includes('ironman') && !combined.includes('70.3') && !combined.includes('half')) {
      return { distancePreset: 'IRONMAN', totalDistanceKm: 226.3 };
    }
    if (combined.includes('70.3') || combined.includes('middle') || combined.includes('half iron') || combined.includes('cotswold classic')) {
      return { distancePreset: '70.3', totalDistanceKm: 113.0 };
    }
    if (combined.includes('olympic') || combined.includes('standard')) {
      return { distancePreset: 'Olympic', totalDistanceKm: 51.5 };
    }
    if (combined.includes('sprint')) {
      return { distancePreset: 'Sprint', totalDistanceKm: 25.75 };
    }
    return {
      distancePreset: rawPreset && ['Sprint', 'Olympic', '70.3', 'IRONMAN'].includes(rawPreset) ? rawPreset : 'Custom',
      totalDistanceKm: rawDistKm && rawDistKm > 0 ? rawDistKm : 113.0,
    };
  }

  // Check explicit 10 Mile match first so it NEVER falls back to 'Custom' (16.09km)
  const isTenMile =
    /\b10\s*-?\s*miles?\b/i.test(combined) ||
    /\b10\s*miler\b/i.test(combined) ||
    /\b10m\b/i.test(combined) ||
    (rawDistKm !== undefined && Math.abs(rawDistKm - 16.093) <= 0.25);

  if (isTenMile) {
    return { distancePreset: '10 Mile', totalDistanceKm: 16.093 };
  }

  const isHalfMarathon =
    combined.includes('half marathon') ||
    combined.includes('half-marathon') ||
    /\b13\.1\b/.test(combined) ||
    (rawDistKm !== undefined && Math.abs(rawDistKm - 21.0975) <= 0.3);

  if (isHalfMarathon) {
    return { distancePreset: 'Half Marathon', totalDistanceKm: 21.0975 };
  }

  const isFullMarathon =
    (/\bmarathon\b/i.test(combined) && !combined.includes('half') && !combined.includes('ultra')) ||
    /\b26\.2\b/.test(combined) ||
    (rawDistKm !== undefined && Math.abs(rawDistKm - 42.195) <= 0.4);

  if (isFullMarathon) {
    return { distancePreset: 'Marathon', totalDistanceKm: 42.195 };
  }

  const is10km =
    /\b10\s*k(?:m)?\b/i.test(combined) ||
    (rawDistKm !== undefined && Math.abs(rawDistKm - 10.0) <= 0.15);

  if (is10km) {
    return { distancePreset: '10km', totalDistanceKm: 10.0 };
  }

  const is5km =
    /\b5\s*k(?:m)?\b/i.test(combined) ||
    combined.includes('parkrun') ||
    (rawDistKm !== undefined && Math.abs(rawDistKm - 5.0) <= 0.15);

  if (is5km) {
    return { distancePreset: '5km', totalDistanceKm: 5.0 };
  }

  return {
    distancePreset: 'Custom',
    totalDistanceKm: rawDistKm && rawDistKm > 0 ? rawDistKm : 10.0,
  };
}

/**
 * Calculates Priority-dependent (A, B, C) achievable race pace and target time
 * anchored to the athlete's physiological profile:
 * - Outdoor Run Threshold Pace (`thresholdPaceRunOutdoorSec`, default 232s = 3:52/km)
 * - Recent Structured Interval Velocity (e.g., 8x1km @ 3:32/km, 4x9min @ 3:42/km)
 * - Running LTHR (`thresholdHeartRateRun`, default 168 bpm)
 * - Cycling FTP (`bikeFtp`, default 315W at 77kg = 4.09 W/kg aerobic ceiling cross-transfer)
 * - Current Fitness (`ctl`, default 91, plus 7d ramp rate & TSB)
 * - WMA Age-Grade Performance Metrics (`age`, default 41, WMA factor 0.9585)
 * - Course Distance (Riegel endurance exponent + weeks of build remaining)
 * - Course Elevation Gain (`runElevationGainMeters`) and Terrain (`road` vs `trail`)
 */
export function computePriorityAwareRacePacing(
  athleteProfile: Partial<AthleteProfile> | undefined,
  distanceKm: number,
  elevationGainM = 35,
  courseType: RunCourseType = 'road',
  eventDate?: string,
  todayDate?: string,
  fitnessContext?: RacePacingFitnessContext
): {
  byPriority: Record<GoalPriority, PriorityPaceSuggestion>;
  weeksToRace: number;
  baselineThresholdPaceSec: number;
  ftpWattsPerKg: number;
  estimatedVo2MaxFromFtp: number;
  ctlUsed: number;
  ageUsed: number;
  ageGradeForB: TenMileAgeGradeMetrics;
} {
  const rawThresholdSec =
    Number(athleteProfile?.thresholdPaceRunOutdoorSec) ||
    Number((athleteProfile as any)?.runThresholdPaceSec) ||
    232; // 3:52/km current outdoor threshold benchmark
  const lthr = Number(athleteProfile?.thresholdHeartRateRun) || 168;
  const ftpWatts = Number(athleteProfile?.bikeFtp) || 315;
  const weightKg = Number(athleteProfile?.weightKg) || 77;
  const ftpWattsPerKg = Number((ftpWatts / Math.max(40, weightKg)).toFixed(2));
  // Storer / Coggan cycling-to-aerobic-ceiling estimate (MAP ~ FTP / 0.82)
  const estimatedVo2MaxFromFtp = Number((((10.8 * (ftpWatts / 0.82)) / Math.max(40, weightKg)) + 7).toFixed(1));

  let ageUsed = Number(athleteProfile?.age) || 41;
  if (!athleteProfile?.age && athleteProfile?.birthDate) {
    const birthYear = Number(String(athleteProfile.birthDate).slice(0, 4));
    if (birthYear > 1930 && birthYear < 2020) {
      ageUsed = 2026 - birthYear;
    }
  }
  const ctlUsed = Math.round(Number(fitnessContext?.ctl ?? 91));

  const refToday = todayDate ? new Date(todayDate) : new Date();
  let weeksToRace = 11;
  if (eventDate) {
    const diffMs = new Date(eventDate).getTime() - refToday.getTime();
    if (isFinite(diffMs) && diffMs > 0) {
      weeksToRace = Math.max(1, Math.round(diffMs / (7 * 24 * 3600 * 1000)));
    }
  }

  // Factor in FTP W/kg aerobic ceiling (>=4.0 W/kg provides strong 60-min fatigue resistance) and CTL readiness (>=85 CTL)
  const ftpDurabilityBonus = ftpWattsPerKg >= 4.0 ? 0.008 : ftpWattsPerKg >= 3.5 ? 0.004 : 0;
  const ctlDurabilityBonus = ctlUsed >= 85 ? 0.007 : ctlUsed >= 70 ? 0.003 : 0;

  // Given the athlete's recent 8x1km @ 3:32/km (17.0 kph) and 4x9min @ 3:42/km (151-155 bpm, well below 168 LTHR),
  // plus 4.09 W/kg FTP and CTL 91, their effective race-ready 1-hour aerobic threshold over 6-16 weeks is ~3:41-3:44/km.
  const buildProgressionFactor = Math.min(0.045, Math.max(0.015, weeksToRace * 0.0028 + ftpDurabilityBonus + ctlDurabilityBonus));
  const projected10MileThresholdSec = rawThresholdSec * (1 - buildProgressionFactor);

  // Distance scaling relative to ~15-16 km (1-hour threshold duration) using Riegel exponent (1.055)
  const distRatio = Math.max(3, distanceKm || 16.093) / 16.093;
  const distancePaceMultiplier = Math.pow(distRatio, 0.052);

  // Elevation & terrain cost:
  const elevPerKm = (elevationGainM || 0) / Math.max(1, distanceKm || 16.093);
  const elevationPenaltySecPerKm =
    courseType === 'trail'
      ? Math.round(elevPerKm * 1.45 + 16)
      : Math.round(elevPerKm * 0.45);

  // Base optimal A-race pace (sec/km)
  const aRacePaceSec = Math.round(projected10MileThresholdSec * distancePaceMultiplier + elevationPenaltySecPerKm);
  // B-race pace: ~1.4% to 1.8% more controlled than A-race (no full 10-day taper; run on 2-3 day mini-taper at ~94-97% LTHR)
  const bRacePaceSec = Math.round(aRacePaceSec * 1.015);
  // C-race pace: ~5.5% slower than A-race (controlled high-Z3 / marathon-to-tempo effort run through normal training volume)
  const cRacePaceSec = Math.round(aRacePaceSec * 1.058);

  const dist = distanceKm > 0 ? distanceKm : 16.093;

  // Round target times to clean 5-second or 10-second intervals
  const aTimeSec = Math.round((aRacePaceSec * dist) / 5) * 5;
  const bTimeSec = Math.round((bRacePaceSec * dist) / 5) * 5;
  const cTimeSec = Math.round((cRacePaceSec * dist) / 10) * 10;

  const aActualPaceSec = Math.round(aTimeSec / dist);
  const bActualPaceSec = Math.round(bTimeSec / dist);
  const cActualPaceSec = Math.round(cTimeSec / dist);

  const buildDetailedSuggestion = (
    priority: GoalPriority,
    timeSec: number,
    paceSec: number,
    shortBadge: string,
    hrLowPct: number,
    hrHighPct: number,
    taperNote: string
  ): PriorityPaceSuggestion => {
    const ag = computeTenMileAgeGrade(ageUsed, timeSec, dist);
    const startPaceSec = paceSec + (priority === 'B' ? 2 : 1);
    const cruisePaceSec = paceSec;
    const finishPushPaceSec = Math.max(180, paceSec - (priority === 'C' ? 1 : 2));

    const fiveKmSplitSec = Math.round(startPaceSec * 3.2 + cruisePaceSec * 1.8);
    const fiveMileSplitSec = Math.round(startPaceSec * 3.2 + cruisePaceSec * 4.8467);
    const tenKmSplitSec = Math.round(startPaceSec * 3.2 + cruisePaceSec * 6.8);

    const hrLow = Math.round(lthr * hrLowPct);
    const hrHigh = Math.round(lthr * hrHighPct);

    return {
      priority,
      label:
        priority === 'A'
          ? `Priority A — Peak Tapered Effort (${formatFinishTimeHms(timeSec)})`
          : priority === 'B'
            ? `Priority B — Supported Tune-Up (${formatFinishTimeHms(timeSec)})`
            : `Priority C — Controlled Tempo / Progression (${formatFinishTimeHms(timeSec)})`,
      shortBadge,
      targetTimeSec: timeSec,
      targetTimeFormatted: formatFinishTimeHms(timeSec),
      targetPaceSecPerKm: paceSec,
      targetPaceKmFormatted: formatPaceMinSecPerKm(paceSec),
      targetPaceMileFormatted: formatPaceMinSecPerMile(paceSec),
      targetHrRange: `${hrLow}–${hrHigh} bpm`,
      effortPctLthr: `${Math.round(hrLowPct * 100)}–${Math.round(hrHighPct * 100)}% LTHR`,
      taperAndStrategyNote: `${taperNote} Age-Grade: ${ag.ageGradePct}% (${ag.ageGradeClass} M${ageUsed}), backed by CTL ${ctlUsed} & ${ftpWatts}W (${ftpWattsPerKg} W/kg) FTP.`,
      ageGradePct: ag.ageGradePct,
      ageGradeClass: ag.ageGradeClass,
      ageGradedEquivalentFormatted: ag.ageGradedTimeFormatted,
      wmaFactor: ag.wmaFactor,
      ftpWattsPerKg,
      ctlUsed,
      fiveKmSplitFormatted: formatFinishTimeHms(fiveKmSplitSec),
      fiveMileSplitFormatted: formatFinishTimeHms(fiveMileSplitSec),
      tenKmSplitFormatted: formatFinishTimeHms(tenKmSplitSec),
      pacingStrategy: [
        {
          phase: 'Miles 1–2 (0–3.2 km) · Controlled Settle-In',
          distanceRange: '0.0 – 3.2 km',
          targetPaceKm: formatPaceMinSecPerKm(startPaceSec),
          targetPaceMile: formatPaceMinSecPerMile(startPaceSec),
          targetHr: `${Math.round(lthr * (hrLowPct - 0.03))}–${hrLow} bpm`,
          cue: 'Bank rhythm & economy on Lap 1; let HR rise smoothly over the first 8 minutes.',
        },
        {
          phase: 'Miles 3–7 (3.2–11.3 km) · Locked Threshold Cruise',
          distanceRange: '3.2 – 11.3 km',
          targetPaceKm: formatPaceMinSecPerKm(cruisePaceSec),
          targetPaceMile: formatPaceMinSecPerMile(cruisePaceSec),
          targetHr: `${hrLow}–${hrHigh} bpm`,
          cue: `Leverage your ${ftpWatts}W (${ftpWattsPerKg} W/kg) aerobic ceiling & ~178 spm cadence at steady ${Math.round(hrLowPct * 100)}–${Math.round(hrHighPct * 100)}% LTHR.`,
        },
        {
          phase: 'Miles 8–10 (11.3–16.09 km) · Progressive Negative Split',
          distanceRange: '11.3 – 16.09 km',
          targetPaceKm: formatPaceMinSecPerKm(finishPushPaceSec),
          targetPaceMile: formatPaceMinSecPerMile(finishPushPaceSec),
          targetHr: `${hrHigh}–${Math.min(lthr + 2, hrHigh + 4)} bpm`,
          cue: 'Squeeze pace down by 2–3s/km over the final 5 km to close strong without muscular blow-up.',
        },
      ],
    };
  };

  const byPriority: Record<GoalPriority, PriorityPaceSuggestion> = {
    A: buildDetailedSuggestion(
      'A',
      aTimeSec,
      aActualPaceSec,
      'A-Race Peak',
      0.96,
      0.99,
      'Full 7–10 day taper, carbon race shoes, maximal lactate threshold ceiling.'
    ),
    B: buildDetailedSuggestion(
      'B',
      bTimeSec,
      bActualPaceSec,
      'B-Race Recommended',
      0.94,
      0.97,
      '2–3 day mini-taper; strong controlled threshold effort without disrupting A-race build volume.'
    ),
    C: buildDetailedSuggestion(
      'C',
      cTimeSec,
      cActualPaceSec,
      'C-Race Tempo',
      0.89,
      0.93,
      'No taper; train right through as a catered high-Zone 3 / marathon-effort progression session.'
    ),
  };

  const ageGradeForB = computeTenMileAgeGrade(ageUsed, bTimeSec, dist);

  return {
    byPriority,
    weeksToRace,
    baselineThresholdPaceSec: rawThresholdSec,
    ftpWattsPerKg,
    estimatedVo2MaxFromFtp,
    ctlUsed,
    ageUsed,
    ageGradeForB,
  };
}

/**
 * Resolves known UK & international endurance races (including Boddington 10 Mile,
 * Chippenham Spring 10 Mile, Oldbury 10 Miler, Seven Sins Trail Run, Cotswold Classic, etc.)
 * or enriches arbitrary user race queries with accurate distance presets, dates, locations, and elevation.
 */
export function resolveRaceMetadata(
  queryOrRaceName: string,
  overrides?: {
    eventType?: GoalEventType;
    eventDate?: string;
    distanceKm?: number;
    distancePreset?: string;
    elevationGainM?: number;
    courseType?: RunCourseType;
    location?: string;
    notes?: string;
  }
): ResolvedRaceMetadata {
  const lower = (queryOrRaceName || '').toLowerCase();

  // 1. Boddington 10 Mile (Gloucestershire AAA Road Race Series, late January at The Gloucester Old Spot, Piffs Elm / Boddington, Cheltenham)
  if (lower.includes('boddington')) {
    const norm = normalizeDistancePresetAndKm('Boddington 10 Mile', overrides?.distancePreset, overrides?.distanceKm, 'run');
    return {
      name: 'Boddington 10 Mile',
      eventType: 'run',
      eventDate: overrides?.eventDate && overrides.eventDate !== '2027-04-18' && overrides.eventDate !== '2027-03-07'
        ? overrides.eventDate
        : '2027-01-31',
      distancePreset: norm.distancePreset, // '10 Mile'
      totalDistanceKm: norm.totalDistanceKm, // 16.093
      runCourseType: 'road',
      runElevationGainMeters: overrides?.elevationGainM && overrides.elevationGainM > 0 ? overrides.elevationGainM : 35,
      location:
        overrides?.location && overrides.location !== 'UK Race Circuit'
          ? overrides.location
          : 'The Gloucester Old Spot, Boddington, Cheltenham, Gloucestershire, UK',
      notes:
        overrides?.notes ||
        'Organised by Beyond the Limitations (Gloucestershire AAA Road Race Series, UKA Permit). Fast, pan-flat 4-lap country lane circuit (~2.5 miles per lap, ~35m / 115 ft total elevation gain) around Boddington Barrow and Piffs Elm starting near The Gloucester Old Spot (GL51 9SY), Cheltenham. Ideal flat winter benchmark for metronomic threshold pacing.',
      sourceTitle: 'Boddington 10 Mile — Gloucestershire AAA Road Race Series (Cheltenham)',
      sourceUri: 'https://www.runbritainrankings.com',
    };
  }

  // 2. Chippenham Spring 10 Mile
  if (lower.includes('chippenham')) {
    return {
      name: 'Chippenham Spring 10 Mile',
      eventType: 'run',
      eventDate: overrides?.eventDate || '2027-03-07',
      distancePreset: '10 Mile',
      totalDistanceKm: 16.093,
      runCourseType: 'road',
      runElevationGainMeters: overrides?.elevationGainM || 45,
      location: overrides?.location || 'Chippenham Sports Club, Hardenhuish Park, Chippenham, Wiltshire, UK',
      notes:
        overrides?.notes ||
        'Organised by Chippenham Harriers. Fast, gently undulating 10.0-mile (16.093 km) Wiltshire country road loop (~45m elevation gain) starting at Chippenham Sports Club.',
      sourceTitle: 'Chippenham Spring 10 Mile — Chippenham Harriers',
    };
  }

  // 3. Oldbury 10 Miler
  if (lower.includes('oldbury')) {
    return {
      name: 'Oldbury 10 Miler',
      eventType: 'run',
      eventDate: overrides?.eventDate || '2027-09-19',
      distancePreset: '10 Mile',
      totalDistanceKm: 16.093,
      runCourseType: 'road',
      runElevationGainMeters: overrides?.elevationGainM || 30,
      location: overrides?.location || 'Oldbury Power Station, Oldbury Naite, BS35 1RQ, UK',
      notes:
        overrides?.notes ||
        'Organised by Thornbury Running Club. Pan-flat 10.0-mile (16.093 km) rural tarmac course beside the Severn Estuary (~30m total elevation gain).',
      sourceTitle: 'Oldbury 10 Mile Road Race — Thornbury Running Club',
    };
  }

  // 4. Seven Sins Trail Run
  if (lower.includes('seven sins') || lower.includes('7 sins')) {
    return {
      name: 'Seven Sins Trail Run (Forest of Dean)',
      eventType: 'run',
      eventDate: overrides?.eventDate || '2027-01-02',
      distancePreset: 'Custom',
      totalDistanceKm: 11.6,
      runCourseType: 'trail',
      runElevationGainMeters: overrides?.elevationGainM || 430,
      location: overrides?.location || 'Wenchford Picnic Area, Blakeney, Forest of Dean, Gloucestershire, UK',
      notes:
        overrides?.notes ||
        '~7.2 miles (11.6 km) off-road winter woodland trail run with ~430m elevation gain across 7 steep climbs ("Pride, Greed, Sloth, Lust, Gluttony, Wrath, Envy") and water/mud crossings.',
      sourceTitle: 'The Seven Sins Run — Forest of Dean',
    };
  }

  // 5. Bourton 10K
  if (lower.includes('bourton')) {
    return {
      name: 'Bourton 10km Road Race',
      eventType: 'run',
      eventDate: overrides?.eventDate || '2027-02-21',
      distancePreset: '10km',
      totalDistanceKm: 10.0,
      runCourseType: 'road',
      runElevationGainMeters: overrides?.elevationGainM || 28,
      location: overrides?.location || 'Bourton-on-the-Water, Cotswolds, Gloucestershire, UK',
      notes:
        overrides?.notes ||
        'Fast, flat PB-potential 10km road race in Bourton-on-the-Water organised by Bourton Roadrunners (~28m elevation gain).',
      sourceTitle: 'Bourton 10K — Bourton Roadrunners',
    };
  }

  // 6. Stroud Half Marathon
  if (lower.includes('stroud')) {
    return {
      name: 'Stroud Half Marathon',
      eventType: 'run',
      eventDate: overrides?.eventDate || '2027-10-24',
      distancePreset: 'Half Marathon',
      totalDistanceKm: 21.0975,
      runCourseType: 'road',
      runElevationGainMeters: overrides?.elevationGainM || 85,
      location: overrides?.location || 'Cainscross Road / Marling School, Stroud, Gloucestershire, UK',
      notes:
        overrides?.notes ||
        'Classic fast Gloucestershire road half marathon starting and finishing near Marling School in Stroud (~85m total elevation gain).',
      sourceTitle: 'Stroud Half Marathon — Stroud & District AC',
    };
  }

  // 7. Generic extraction with standard preset normalization
  const isTri =
    overrides?.eventType === 'triathlon' ||
    lower.includes('70.3') ||
    lower.includes('ironman') ||
    lower.includes('triathlon');
  const eventType: GoalEventType = isTri ? 'triathlon' : overrides?.eventType || 'run';
  const norm = normalizeDistancePresetAndKm(queryOrRaceName, overrides?.distancePreset, overrides?.distanceKm, eventType);

  const defaultElev =
    overrides?.elevationGainM && overrides.elevationGainM > 0
      ? overrides.elevationGainM
      : norm.distancePreset === '10 Mile'
        ? 45
        : norm.distancePreset === 'Half Marathon'
          ? 75
          : norm.distancePreset === 'Marathon'
            ? 140
            : norm.distancePreset === '10km'
              ? 35
              : norm.distancePreset === '5km'
                ? 15
                : 50;

  return {
    name: queryOrRaceName.trim() || 'Goal Race',
    eventType,
    eventDate: overrides?.eventDate || '2027-03-07',
    distancePreset: norm.distancePreset,
    totalDistanceKm: norm.totalDistanceKm,
    runCourseType: overrides?.courseType || (lower.includes('trail') ? 'trail' : 'road'),
    runElevationGainMeters: defaultElev,
    location: overrides?.location && overrides.location !== 'UK Race Circuit' ? overrides.location : 'Gloucestershire / South West UK',
    notes:
      overrides?.notes ||
      `${norm.distancePreset} (${norm.totalDistanceKm} km) ${overrides?.courseType || 'road'} race (~${defaultElev}m elevation gain).`,
  };
}

/**
 * Builds a complete, priority-aware `TrainingGoal` and `PriorityPaceSuggestion` set.
 */
export function buildEnrichedGoalFromQuery(
  rawRaceName: string,
  priority: GoalPriority | undefined,
  athleteProfile?: Partial<AthleteProfile>,
  overrides?: {
    eventType?: GoalEventType;
    eventDate?: string;
    distanceKm?: number;
    distancePreset?: string;
    targetTimeSec?: number;
    elevationGainM?: number;
    courseType?: RunCourseType;
    location?: string;
    notes?: string;
    todayDate?: string;
    fitnessContext?: RacePacingFitnessContext;
  }
): {
  goal: Partial<TrainingGoal>;
  resolvedMeta: ResolvedRaceMetadata;
  pacing: ReturnType<typeof computePriorityAwareRacePacing>;
  recommendedSuggestion: PriorityPaceSuggestion;
  prioritySuggestions: PriorityPaceSuggestion[];
} {
  const resolvedMeta = resolveRaceMetadata(rawRaceName, overrides);
  const effectivePriority: GoalPriority = priority || 'B';

  const pacing = computePriorityAwareRacePacing(
    athleteProfile,
    resolvedMeta.totalDistanceKm,
    resolvedMeta.runElevationGainMeters,
    resolvedMeta.runCourseType,
    resolvedMeta.eventDate,
    overrides?.todayDate,
    overrides?.fitnessContext
  );

  const recommendedSuggestion = pacing.byPriority[effectivePriority];
  const prioritySuggestions: PriorityPaceSuggestion[] = [
    pacing.byPriority.A,
    pacing.byPriority.B,
    pacing.byPriority.C,
  ];

  const finalTargetTimeSec =
    overrides?.targetTimeSec && overrides.targetTimeSec > 0
      ? overrides.targetTimeSec
      : recommendedSuggestion.targetTimeSec;

  const finalTargetPaceSec =
    resolvedMeta.totalDistanceKm > 0
      ? Math.round(finalTargetTimeSec / resolvedMeta.totalDistanceKm)
      : recommendedSuggestion.targetPaceSecPerKm;

  const goal: Partial<TrainingGoal> = {
    id: `goal-${resolvedMeta.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${resolvedMeta.eventDate.slice(0, 4)}`,
    name: resolvedMeta.name,
    priority: effectivePriority,
    eventType: resolvedMeta.eventType,
    status: 'upcoming',
    targetType: 'time',
    eventDate: resolvedMeta.eventDate,
    distancePreset: resolvedMeta.distancePreset,
    totalDistanceKm: resolvedMeta.totalDistanceKm,
    totalTargetTimeSec: finalTargetTimeSec,
    runCourseType: resolvedMeta.runCourseType,
    runElevationGainMeters: resolvedMeta.runElevationGainMeters,
    runTargetPaceSec: finalTargetPaceSec,
    location: resolvedMeta.location,
    notes: `${resolvedMeta.notes}\n\n• Priority ${effectivePriority} Target Pace: ${formatFinishTimeHms(finalTargetTimeSec)} (${formatPaceMinSecPerKm(finalTargetPaceSec)} · ${formatPaceMinSecPerMile(finalTargetPaceSec)}, ${recommendedSuggestion.targetHrRange}). ${recommendedSuggestion.taperAndStrategyNote}`,
  };

  return {
    goal,
    resolvedMeta,
    pacing,
    recommendedSuggestion,
    prioritySuggestions,
  };
}

