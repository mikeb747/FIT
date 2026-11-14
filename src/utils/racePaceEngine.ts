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
 * - Course Distance (Riegel endurance exponent + weeks of build remaining)
 * - Course Elevation Gain (`runElevationGainMeters`) and Terrain (`road` vs `trail`)
 */
export function computePriorityAwareRacePacing(
  athleteProfile: Partial<AthleteProfile> | undefined,
  distanceKm: number,
  elevationGainM = 35,
  courseType: RunCourseType = 'road',
  eventDate?: string,
  todayDate?: string
): {
  byPriority: Record<GoalPriority, PriorityPaceSuggestion>;
  weeksToRace: number;
  baselineThresholdPaceSec: number;
} {
  const rawThresholdSec =
    Number(athleteProfile?.thresholdPaceRunOutdoorSec) ||
    Number((athleteProfile as any)?.runThresholdPaceSec) ||
    232; // 3:52/km current outdoor threshold benchmark
  const lthr = Number(athleteProfile?.thresholdHeartRateRun) || 168;

  const refToday = todayDate ? new Date(todayDate) : new Date();
  let weeksToRace = 11;
  if (eventDate) {
    const diffMs = new Date(eventDate).getTime() - refToday.getTime();
    if (isFinite(diffMs) && diffMs > 0) {
      weeksToRace = Math.max(1, Math.round(diffMs / (7 * 24 * 3600 * 1000)));
    }
  }

  // Given the athlete's recent 8x1km @ 3:32/km (17.0 kph) and 4x9min @ 3:42/km (151-155 bpm, well below 168 LTHR),
  // their effective race-ready 1-hour aerobic threshold with progressive training over 6-16 weeks is ~3:42-3:44/km.
  // Compute progression dividend (up to ~8-9s/km improvement over a 8-14 week build toward effective 3:43/km 10-mile capability)
  const buildProgressionFactor = Math.min(0.038, Math.max(0.012, weeksToRace * 0.003));
  const projected10MileThresholdSec = rawThresholdSec * (1 - buildProgressionFactor);

  // Distance scaling relative to ~15-16 km (1-hour threshold duration) using Riegel exponent (1.055)
  const distRatio = Math.max(3, distanceKm || 16.093) / 16.093;
  const distancePaceMultiplier = Math.pow(distRatio, 0.052);

  // Elevation & terrain cost:
  // ~1.5 sec/km per 10m/km of climbing on road; additional 8-12% on technical winter trail
  const elevPerKm = (elevationGainM || 0) / Math.max(1, distanceKm || 16.093);
  const elevationPenaltySecPerKm =
    courseType === 'trail'
      ? Math.round(elevPerKm * 1.45 + 16)
      : Math.round(elevPerKm * 0.45);

  // Base optimal A-race pace (sec/km)
  const aRacePaceSec = Math.round(projected10MileThresholdSec * distancePaceMultiplier + elevationPenaltySecPerKm);
  // B-race pace: ~1.5% to 2.2% more controlled than A-race (no full 10-day taper; run on 2-3 day mini-taper at ~95-97% LTHR)
  const bRacePaceSec = Math.round(aRacePaceSec * 1.018);
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

  const byPriority: Record<GoalPriority, PriorityPaceSuggestion> = {
    A: {
      priority: 'A',
      label: `Priority A — Peak Tapered Effort (${formatFinishTimeHms(aTimeSec)})`,
      shortBadge: 'A-Race Peak',
      targetTimeSec: aTimeSec,
      targetTimeFormatted: formatFinishTimeHms(aTimeSec),
      targetPaceSecPerKm: aActualPaceSec,
      targetPaceKmFormatted: formatPaceMinSecPerKm(aActualPaceSec),
      targetPaceMileFormatted: formatPaceMinSecPerMile(aActualPaceSec),
      targetHrRange: `${Math.round(lthr * 0.96)}–${Math.round(lthr * 0.99)} bpm`,
      effortPctLthr: '96–99% LTHR',
      taperAndStrategyNote: 'Full 7–10 day taper, carbon race shoes, maximal lactate threshold ceiling.',
    },
    B: {
      priority: 'B',
      label: `Priority B — Supported Tune-Up (${formatFinishTimeHms(bTimeSec)})`,
      shortBadge: 'B-Race Recommended',
      targetTimeSec: bTimeSec,
      targetTimeFormatted: formatFinishTimeHms(bTimeSec),
      targetPaceSecPerKm: bActualPaceSec,
      targetPaceKmFormatted: formatPaceMinSecPerKm(bActualPaceSec),
      targetPaceMileFormatted: formatPaceMinSecPerMile(bActualPaceSec),
      targetHrRange: `${Math.round(lthr * 0.94)}–${Math.round(lthr * 0.97)} bpm`,
      effortPctLthr: '94–97% LTHR',
      taperAndStrategyNote: '2–3 day mini-taper; strong controlled threshold effort without disrupting A-race build volume.',
    },
    C: {
      priority: 'C',
      label: `Priority C — Controlled Tempo / Progression (${formatFinishTimeHms(cTimeSec)})`,
      shortBadge: 'C-Race Tempo',
      targetTimeSec: cTimeSec,
      targetTimeFormatted: formatFinishTimeHms(cTimeSec),
      targetPaceSecPerKm: cActualPaceSec,
      targetPaceKmFormatted: formatPaceMinSecPerKm(cActualPaceSec),
      targetPaceMileFormatted: formatPaceMinSecPerMile(cActualPaceSec),
      targetHrRange: `${Math.round(lthr * 0.89)}–${Math.round(lthr * 0.93)} bpm`,
      effortPctLthr: '89–93% LTHR',
      taperAndStrategyNote: 'No taper; train right through as a catered high-Zone 3 / marathon-effort progression session.',
    },
  };

  return {
    byPriority,
    weeksToRace,
    baselineThresholdPaceSec: rawThresholdSec,
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
    overrides?.todayDate
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
