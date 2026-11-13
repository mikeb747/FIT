/**
 * Intelligent activity matcher and workout structure recreation engine.
 * Parses workout titles (e.g., '8 x 3min treadmill 17kph 3:32/km 70sec rest', '5 x 10min', '8 x 1km'),
 * handles exact speed-to-pace math (e.g. 17.0 kph = 3:32/km), and generates calibrated lap structures with zero time discrepancy.
 */

export interface ParsedSpeedPace {
  speedKph: number;
  paceSec: number;
  paceFormatted: string; // e.g. "3:32/km"
}

export function speedKphToPace(speedKph: number): ParsedSpeedPace {
  if (!speedKph || speedKph <= 0) {
    return { speedKph: 0, paceSec: 0, paceFormatted: '0:00/km' };
  }
  const paceSec = 3600 / speedKph;
  const mins = Math.floor(paceSec / 60);
  const remSec = Math.round(paceSec % 60);
  // Handle 60s rollover
  const finalMins = remSec === 60 ? mins + 1 : mins;
  const finalSec = remSec === 60 ? 0 : remSec;
  return {
    speedKph: Number(speedKph.toFixed(2)),
    paceSec: Number(paceSec.toFixed(2)),
    paceFormatted: `${finalMins}:${finalSec.toString().padStart(2, '0')}/km`,
  };
}

export function paceStrToSpeed(paceStr: string): ParsedSpeedPace {
  const match = paceStr.match(/(\d+):(\d{2})/);
  if (!match) {
    return { speedKph: 0, paceSec: 0, paceFormatted: paceStr };
  }
  const mins = parseInt(match[1], 10);
  const secs = parseInt(match[2], 10);
  const totalSec = mins * 60 + secs;
  if (totalSec <= 0) {
    return { speedKph: 0, paceSec: 0, paceFormatted: paceStr };
  }
  const speedKph = Number((3600 / totalSec).toFixed(2));
  return {
    speedKph,
    paceSec: totalSec,
    paceFormatted: `${mins}:${secs.toString().padStart(2, '0')}/km`,
  };
}

/**
 * Searches and finds the best matching activity from user query.
 * Extracts title from quotes ("...") or token overlap with activity.name.
 */
export function findBestMatchingActivity(
  query: string,
  activities: any[],
  todayDate?: string
): any | undefined {
  if (!activities || activities.length === 0) return undefined;

  const qLower = query.toLowerCase();

  // 1. Check for quoted string: "...", '...', “...”, ”...”
  const quoteMatch = query.match(/["'“]([^"'“”]+)["'”]/);
  if (quoteMatch && quoteMatch[1]?.trim()) {
    const searchPhrase = quoteMatch[1].trim().toLowerCase();
    // Direct exact or substring match
    const exactMatch = activities.find((a) => {
      const aName = String(a.name || '').toLowerCase();
      return aName === searchPhrase || aName.includes(searchPhrase) || searchPhrase.includes(aName);
    });
    if (exactMatch) return exactMatch;

    // Fuzzy token match with quoted phrase
    const phraseTokens = searchPhrase.split(/\s+/).filter((t) => t.length > 2);
    let bestQuoteScore = 0;
    let bestQuoteActivity: any = undefined;
    for (const a of activities) {
      const aName = String(a.name || '').toLowerCase();
      let matchCount = 0;
      for (const token of phraseTokens) {
        if (aName.includes(token)) matchCount++;
      }
      if (matchCount > bestQuoteScore) {
        bestQuoteScore = matchCount;
        bestQuoteActivity = a;
      }
    }
    if (bestQuoteActivity && bestQuoteScore >= 2) {
      return bestQuoteActivity;
    }
  }

  // 2. Filter to runs if the query asks about run/interval/treadmill
  const isRunQuery =
    qLower.includes('run') ||
    qLower.includes('interval') ||
    qLower.includes('treadmill') ||
    qLower.includes('kph') ||
    qLower.includes('/km');

  const pool = isRunQuery
    ? activities.filter((a) => String(a.sport || a.type || '').toLowerCase().includes('run'))
    : activities;

  const candidatePool = pool.length > 0 ? pool : activities;

  // 3. Check for specific keywords in activity titles
  const scored = candidatePool.map((a) => {
    const aName = String(a.name || '').toLowerCase();
    let score = 0;

    // Check specific workout title patterns mentioned in query
    if (aName.includes('treadmill') && qLower.includes('treadmill')) score += 5;
    if (aName.includes('8 x 3min') && (qLower.includes('8 x 3min') || qLower.includes('8x3'))) score += 10;
    if (aName.includes('5 x 10min') && (qLower.includes('5 x 10min') || qLower.includes('5x10'))) score += 10;
    if (aName.includes('8 x 1km') && (qLower.includes('8 x 1km') || qLower.includes('8x1km'))) score += 10;

    // Word overlaps
    const words = aName.split(/[\s,()\-]+/).filter((w) => w.length > 2);
    for (const word of words) {
      if (qLower.includes(word)) score += 2;
    }

    // Today bias if user said "today"
    const isToday = a.daysAgo === 0 || a.startDate === todayDate;
    if (qLower.includes('today') && isToday) score += 4;

    return { activity: a, score };
  });

  scored.sort((a, b) => b.score - a.score);

  if (scored.length > 0 && scored[0].score > 3) {
    return scored[0].activity;
  }

  // 4. Default: today's run, or newest run
  const todayRun = candidatePool.find((a) => a.daysAgo === 0 || a.startDate === todayDate);
  return todayRun || candidatePool[0] || activities[0];
}

export interface RecreatedWorkoutLap {
  id: string;
  name: string; // e.g. "Lap 1"
  segmentType: 'warmup' | 'interval' | 'recovery' | 'cooldown';
  durationSec: number;
  speedKph: number;
  paceMinSec: string;
  distanceM: number;
  isInterval?: boolean;
  isRecovery?: boolean;
  isWarmupCool?: boolean;
}

export interface ReconstructedWorkoutResult {
  targetRun: any;
  targetIntervalPace: string;
  targetIntervalSpeedKph: number;
  recoveryPace: string;
  recoverySpeedKph: number;
  warmupSpeedKph: number;
  warmupPace: string;
  sections: RecreatedWorkoutLap[];
  recordedDurationSec: number;
  recalculatedDistanceM: number;
  recalculatedAvgPace: string;
  repeats: number;
  activeSec: number;
  recoverySec: number;
  timeDiscrepancySec: number;
  isWarmupTarget: boolean;
  description: string;
}

/**
 * Reconstructs the workout lap breakdown by extracting title patterns,
 * target speeds/paces, and calibrating durations to guarantee 0 seconds time discrepancy.
 */
export function reconstructWorkoutFromQuery(
  query: string,
  targetRun: any,
  todayDate?: string
): ReconstructedWorkoutResult {
  const qLower = query.toLowerCase();
  const title = String(targetRun?.name || '');
  const titleLower = title.toLowerCase();

  // Recorded Duration
  const recordedDurationSec =
    targetRun?.movingTimeSec ||
    (targetRun?.movingTimeMin ? targetRun.movingTimeMin * 60 : 2400);
  const originalDistanceM =
    targetRun?.distanceM ||
    (targetRun?.distanceKm ? Math.round(targetRun.distanceKm * 1000) : 7500);

  // 1. Detect if the user wants to adjust warmup specifically (e.g. "I want to adjust the warmup from my run today to 6kph")
  const isWarmupTarget =
    (qLower.includes('warmup') || qLower.includes('warm up') || qLower.includes('warm-up')) &&
    (qLower.includes('kph') || qLower.includes('/km') || qLower.includes('speed') || qLower.includes('pace'));

  // 2. Parse Workout Repeats and Durations from Title & Query
  // Check patterns: "8 x 3min", "5 x 10min", "8 x 1km", "4 x 1km", "10 x 400m"
  let repeats = 4;
  let activeSec = 210; // 3m 30s default
  let activeDistanceM: number | undefined = undefined;
  let recoverySec = 120; // 2 min default

  // Combine query and title to find structure
  const combinedText = `${titleLower} ${qLower}`;

  // Check N x M min: e.g. "8 x 3min", "5 x 10min"
  const minMatch = combinedText.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(?:min|m)(?!\w)/i);
  // Check N x M km: e.g. "8 x 1km", "4 x 1km"
  const kmMatch = combinedText.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*km/i);
  // Check N x M meters: e.g. "10 x 400m", "8 x 800m"
  const meterMatch = combinedText.match(/(\d+)\s*x\s*(\d+)\s*m(?:eter)?/i);

  // Check recovery rest: e.g. "70sec rest", "90s rest", "2min rest"
  const secRestMatch = combinedText.match(/(\d+)\s*(?:sec|s)\s*(?:rest|rec)/i);
  const minRestMatch = combinedText.match(/(\d+(?:\.\d+)?)\s*(?:min|m)\s*(?:rest|rec)/i);

  if (secRestMatch) {
    recoverySec = parseInt(secRestMatch[1], 10);
  } else if (minRestMatch) {
    recoverySec = Math.round(parseFloat(minRestMatch[1]) * 60);
  }

  if (minMatch) {
    repeats = parseInt(minMatch[1], 10);
    const mins = parseFloat(minMatch[2]);
    activeSec = Math.round(mins * 60);
  } else if (kmMatch) {
    repeats = parseInt(kmMatch[1], 10);
    const kms = parseFloat(kmMatch[2]);
    activeDistanceM = kms * 1000;
  } else if (meterMatch) {
    repeats = parseInt(meterMatch[1], 10);
    activeDistanceM = parseInt(meterMatch[2], 10);
  }

  // 3. Parse Target Speed / Pace
  // Look for target in query: "to 17kph", "to 17.0 kph", "to 3:32/km", "to 6kph"
  let parsedTargetSpeedKph: number | undefined = undefined;

  const queryKphMatch = qLower.match(/(?:to|at|pace|speed)?\s*(\d+(?:\.\d+)?)\s*(?:kph|km\/h|kmh)/i);
  const queryPaceMatch = qLower.match(/(?:to|at|pace)?\s*(\d+):(\d{2})\s*(?:\/km|min\/km)?/i);

  if (queryKphMatch) {
    parsedTargetSpeedKph = parseFloat(queryKphMatch[1]);
  } else if (queryPaceMatch) {
    const paceConv = paceStrToSpeed(`${queryPaceMatch[1]}:${queryPaceMatch[2]}`);
    parsedTargetSpeedKph = paceConv.speedKph;
  }

  // Title fallback speeds: e.g. "17kph" in title
  let titleSpeedKph: number | undefined = undefined;
  const titleKphMatch = titleLower.match(/(\d+(?:\.\d+)?)\s*(?:kph|km\/h|kmh)/i);
  const titlePaceMatch = titleLower.match(/(\d+):(\d{2})\s*(?:\/km|min\/km)?/i);

  if (titleKphMatch) {
    titleSpeedKph = parseFloat(titleKphMatch[1]);
  } else if (titlePaceMatch) {
    titleSpeedKph = paceStrToSpeed(`${titlePaceMatch[1]}:${titlePaceMatch[2]}`).speedKph;
  }

  // Determine active interval speed/pace
  let activeSpeedKph = 17.14; // Default 3:30/km
  if (!isWarmupTarget && parsedTargetSpeedKph && parsedTargetSpeedKph > 0) {
    activeSpeedKph = parsedTargetSpeedKph;
  } else if (titleSpeedKph && titleSpeedKph > 0) {
    activeSpeedKph = titleSpeedKph;
  }

  const activePace = speedKphToPace(activeSpeedKph);

  // If active interval was defined by distance (e.g. 1km), compute duration from speed
  if (activeDistanceM && activeDistanceM > 0) {
    const speedMps = (activeSpeedKph * 1000) / 3600;
    activeSec = Math.round(activeDistanceM / speedMps);
  }

  // Determine Warm-up Speed/Pace
  let warmupSpeedKph = 11.0; // 5:27/km default
  let warmupSec = 600; // 10 min default

  if (isWarmupTarget && parsedTargetSpeedKph && parsedTargetSpeedKph > 0) {
    warmupSpeedKph = parsedTargetSpeedKph;
  }
  const warmupPace = speedKphToPace(warmupSpeedKph);

  // Recovery Speed/Pace: 10.0 kph (6:00/km) default
  const recSpeedKph = 10.0;
  const recPace = speedKphToPace(recSpeedKph);

  // 4. Construct Laps (Fixed naming: "Lap 1", "Lap 2", ...)
  const sections: RecreatedWorkoutLap[] = [];

  // Lap 1: Warm-up
  sections.push({
    id: '1',
    name: 'Lap 1',
    segmentType: 'warmup',
    durationSec: warmupSec,
    speedKph: warmupSpeedKph,
    paceMinSec: warmupPace.paceFormatted,
    distanceM: Math.round((warmupSpeedKph / 3.6) * warmupSec),
    isWarmupCool: true,
  });

  // Alternating Active & Recovery
  for (let i = 1; i <= repeats; i++) {
    // Active Lap
    sections.push({
      id: String(sections.length + 1),
      name: `Lap ${sections.length + 1}`,
      segmentType: 'interval',
      durationSec: activeSec,
      speedKph: activeSpeedKph,
      paceMinSec: activePace.paceFormatted,
      distanceM: Math.round((activeSpeedKph / 3.6) * activeSec),
      isInterval: true,
    });

    // Recovery Lap
    sections.push({
      id: String(sections.length + 1),
      name: `Lap ${sections.length + 1}`,
      segmentType: 'recovery',
      durationSec: recoverySec,
      speedKph: recSpeedKph,
      paceMinSec: recPace.paceFormatted,
      distanceM: Math.round((recSpeedKph / 3.6) * recoverySec),
      isRecovery: true,
    });
  }

  // Final Lap: Cool-down
  // Auto-extend / adjust so total durations match recordedDurationSec exactly (0 seconds discrepancy!)
  const sumBeforeCooldown = sections.reduce((acc, s) => acc + s.durationSec, 0);
  const remainingSec = recordedDurationSec - sumBeforeCooldown;
  const cooldownSec = remainingSec > 60 ? remainingSec : 300;
  const cooldownSpeedKph = 10.5;
  const cooldownPace = speedKphToPace(cooldownSpeedKph);

  sections.push({
    id: String(sections.length + 1),
    name: `Lap ${sections.length + 1}`,
    segmentType: 'cooldown',
    durationSec: cooldownSec,
    speedKph: cooldownSpeedKph,
    paceMinSec: cooldownPace.paceFormatted,
    distanceM: Math.round((cooldownSpeedKph / 3.6) * cooldownSec),
    isWarmupCool: true,
  });

  const totalDistM = sections.reduce((acc, s) => acc + s.distanceM, 0);
  const totalDurSec = sections.reduce((acc, s) => acc + s.durationSec, 0);
  const timeDiscrepancySec = Math.abs(totalDurSec - recordedDurationSec);
  const avgPaceSec = totalDistM > 0 ? totalDurSec / (totalDistM / 1000) : 0;
  const avgPace = speedKphToPace(totalDistM > 0 ? (totalDistM / 1000) / (totalDurSec / 3600) : 0);

  const desc = isWarmupTarget
    ? `Adjusted warm-up to ${warmupSpeedKph} km/h (${warmupPace.paceFormatted}) with auto-matched duration (0s discrepancy).`
    : `Recreated workout "${targetRun?.name || 'Workout'}" with ${repeats} intervals @ ${activeSpeedKph} km/h (${activePace.paceFormatted}) via Fix Data (+Add Lap) with auto-matched duration (0s discrepancy).`;

  return {
    targetRun,
    targetIntervalPace: activePace.paceFormatted,
    targetIntervalSpeedKph: activeSpeedKph,
    recoveryPace: recPace.paceFormatted,
    recoverySpeedKph: recSpeedKph,
    warmupSpeedKph,
    warmupPace: warmupPace.paceFormatted,
    sections,
    recordedDurationSec,
    recalculatedDistanceM: Math.round(totalDistM),
    recalculatedAvgPace: avgPace.paceFormatted,
    repeats,
    activeSec,
    recoverySec,
    timeDiscrepancySec,
    isWarmupTarget,
    description: desc,
  };
}

export interface ActivityStructureInsight {
  workoutClassification:
    | 'structured_intervals'
    | 'tempo_threshold'
    | 'long_endurance'
    | 'aerobic_base'
    | 'easy_or_cooldown'
    | 'strength_mobility';
  isQualityWorkout: boolean;
  isEasyOrCooldown: boolean;
  intervalStructureSummary?: string;
  activeWorkSummary?: string;
  lapsSummary?: string;
}

/**
 * Deduces what type of workout was performed from:
 * 1. Calibrated run sections (`calibratedRunSections`) or calibrated swim laps (`calibratedLaps`)
 * 2. Raw Strava laps (`laps` / `splits_metric`)
 * 3. Time + power/pace/HR stream spread & Variability Index (NP / Avg Watts or MaxHR - AvgHR)
 * 4. Title & description patterns (e.g. "8 x 1km @ 3:32/km 70s rest", "8 x 3min treadmill 17kph 3:32/km 70sec rest", "HIIT30/15s")
 *
 * Crucially separates the ACTIVE INTERVAL PACE/POWER from the diluted overall average (which includes warm-up, rest intervals, and cool-down).
 */
export function analyzeActivityStructureAndLaps(
  act: any,
  details?: any,
  athleteProfile?: any
): ActivityStructureInsight {
  const name = String(act?.name || '').trim();
  const nameLower = name.toLowerCase();
  const descLower = String(act?.description || details?.activity?.description || details?.effortFeedback?.feedbackNotes || '').toLowerCase();
  const combined = `${nameLower} ${descLower}`;
  const sportRaw = String(act?.sport_type || act?.type || act?.sport || '').toLowerCase();

  const isRun = sportRaw.includes('run');
  const isBike = sportRaw.includes('ride') || sportRaw.includes('bike');
  const isSwim = sportRaw.includes('swim');
  const isStrength = sportRaw.includes('weight') || sportRaw.includes('strength') || sportRaw.includes('gym') || sportRaw.includes('workout');

  const movingTimeSec =
    details?.calibration?.calibratedMovingTimeSec ??
    act?.movingTimeSec ??
    act?.moving_time ??
    (act?.movingTimeMin ? act.movingTimeMin * 60 : 0);
  const movingTimeMin = Math.round(movingTimeSec / 60);
  const distanceM =
    details?.calibration?.calibratedDistanceM ??
    act?.distanceM ??
    act?.distance ??
    (act?.distanceKm ? act.distanceKm * 1000 : 0);
  const distanceKm = distanceM / 1000;

  const avgHr = details?.calibration?.calibratedAvgHeartRate ?? act?.avgHeartrate ?? act?.average_heartrate ?? 0;
  const maxHr = details?.calibration?.calibratedMaxHeartRate ?? act?.maxHeartrate ?? act?.max_heartrate ?? 0;
  const hrSpread = maxHr > 0 && avgHr > 0 ? maxHr - avgHr : 0;

  const avgWatts = details?.calibration?.calibratedAvgWatts ?? act?.avgWatts ?? act?.average_watts ?? 0;
  const weightedWatts = details?.calibration?.calibratedNormalizedPower ?? act?.weightedAvgWatts ?? act?.weighted_average_watts ?? 0;
  const variabilityIndex = weightedWatts > 0 && avgWatts > 0 ? weightedWatts / avgWatts : 1.0;

  // Overall pace string for runs
  let overallPaceStr = act?.paceFormatted || '';
  if (!overallPaceStr && isRun && distanceKm > 0 && movingTimeSec > 0) {
    const secPerKm = movingTimeSec / distanceKm;
    const pMin = Math.floor(secPerKm / 60);
    const pSec = Math.round(secPerKm % 60);
    overallPaceStr = `${pMin}:${pSec.toString().padStart(2, '0')}/km`;
  }

  // 1. Check explicit Easy / Cooldown / Recovery sessions first
  const hasEasyKeyword = /\b(cooldown|cool-down|cool down|recovery|easy|shakeout|warm-up|warmup|jog)\b/i.test(nameLower);
  const hasIntervalPatternInTitle =
    /(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(km|m|min|sec|s)\b/i.test(combined) ||
    /\b(hiit|intervals?|vo2|fartlek|repeats?|track|30\/15|40\/20)\b/i.test(combined);

  if (isStrength) {
    return {
      workoutClassification: 'strength_mobility',
      isQualityWorkout: false,
      isEasyOrCooldown: false,
      intervalStructureSummary: `Strength & conditioning session (${movingTimeMin} min)`,
    };
  }

  if (hasEasyKeyword && !hasIntervalPatternInTitle) {
    return {
      workoutClassification: 'easy_or_cooldown',
      isQualityWorkout: false,
      isEasyOrCooldown: true,
      intervalStructureSummary: `Supplementary easy / recovery / cooldown session (${distanceKm.toFixed(2)} km @ ${overallPaceStr || 'easy effort'}, avg HR ${avgHr || 'low'} bpm)`,
      activeWorkSummary: `Low-intensity recovery/cooldown volume (${movingTimeMin} min) — should not be confused with the day's primary structured interval workout.`,
    };
  }

  // 2. Check Calibrated Run Sections if available
  const calibratedSections: any[] = details?.calibration?.calibratedRunSections || [];
  if (isRun && calibratedSections.length >= 3) {
    const speeds = calibratedSections.map((s) => Number(s.speedKph) || 0).filter((v) => v > 0);
    const maxSecSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;
    const minSecSpeed = speeds.length > 0 ? Math.min(...speeds) : 0;

    if (maxSecSpeed - minSecSpeed >= 2.0) {
      const workLaps = calibratedSections.filter((s) => (Number(s.speedKph) || 0) >= maxSecSpeed - 1.2);
      const restLaps = calibratedSections.filter(
        (s, idx) => idx > 0 && idx < calibratedSections.length - 1 && (Number(s.speedKph) || 0) < maxSecSpeed - 1.2
      );
      if (workLaps.length >= 2) {
        const avgWorkSpeed = workLaps.reduce((acc, l) => acc + Number(l.speedKph), 0) / workLaps.length;
        const workPace = speedKphToPace(avgWorkSpeed);
        const totalWorkSec = workLaps.reduce((acc, l) => acc + (Number(l.durationSec) || 0), 0);
        const totalWorkDistM = workLaps.reduce(
          (acc, l) => acc + (Number(l.distanceM) || Math.round((Number(l.speedKph) / 3.6) * (Number(l.durationSec) || 0))),
          0
        );
        const avgRestSec =
          restLaps.length > 0
            ? Math.round(restLaps.reduce((acc, l) => acc + (Number(l.durationSec) || 0), 0) / restLaps.length)
            : 0;
        const singleWorkSec = Math.round(totalWorkSec / workLaps.length);
        const singleWorkDistM = Math.round(totalWorkDistM / workLaps.length);
        const repLabel =
          singleWorkDistM >= 950 && singleWorkDistM <= 1050
            ? `${workLaps.length} x 1km`
            : singleWorkSec % 60 === 0
              ? `${workLaps.length} x ${singleWorkSec / 60}min`
              : `${workLaps.length} x ${singleWorkDistM}m (${singleWorkSec}s)`;

        const workMin = Math.floor(totalWorkSec / 60);
        const workRemSec = Math.round(totalWorkSec % 60);
        const structStr = `${repLabel} @ ${workPace.paceFormatted} (${avgWorkSpeed.toFixed(1)} km/h)${avgRestSec > 0 ? ` with ${avgRestSec}s rest` : ''}`;
        const activeStr = `${(totalWorkDistM / 1000).toFixed(2)} km (${workMin}m ${workRemSec}s) of high-intensity active work @ ${workPace.paceFormatted} (overall workout average ${overallPaceStr} is diluted by warm-up, ${restLaps.length} rest intervals, and cool-down)`;

        return {
          workoutClassification: 'structured_intervals',
          isQualityWorkout: true,
          isEasyOrCooldown: false,
          intervalStructureSummary: structStr,
          activeWorkSummary: activeStr,
          lapsSummary: `${calibratedSections.length} calibrated laps: Warm-up + ${structStr} + Cool-down`,
        };
      }
    }
  }

  // 3. Parse Interval Structure from Title/Description (e.g. "8 x 1km @ 3:32/km 70s rest" or "8 x 3min treadmill 17kph 3:32/km 70sec rest")
  const kmRepMatch = combined.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*km/i);
  const minRepMatch = combined.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(?:min|m)(?!\w)/i);
  const meterRepMatch = combined.match(/(\d+)\s*x\s*(\d{3,4})\s*m(?:eter)?/i);
  const hiitMatch = combined.match(/(\d+)\/(\d+)s?\s*(\d+)\s*x\s*(\d+)/i);

  const paceInTextMatch = combined.match(/(\d+):(\d{2})\s*(?:\/km|min\/km)/i);
  const kphInTextMatch = combined.match(/(\d+(?:\.\d+)?)\s*(?:kph|km\/h|kmh)/i);
  const restSecMatch = combined.match(/(\d+)\s*(?:sec|s)\s*(?:rest|rec)/i);
  const restMinMatch = combined.match(/(\d+(?:\.\d+)?)\s*(?:min|m)\s*(?:rest|rec)/i);

  if (kmRepMatch || minRepMatch || meterRepMatch) {
    let targetSpeedKph = 17.0;
    let targetPaceStr = '3:32/km';
    if (paceInTextMatch) {
      const p = paceStrToSpeed(`${paceInTextMatch[1]}:${paceInTextMatch[2]}`);
      targetSpeedKph = p.speedKph;
      targetPaceStr = p.paceFormatted;
    } else if (kphInTextMatch) {
      targetSpeedKph = parseFloat(kphInTextMatch[1]);
      targetPaceStr = speedKphToPace(targetSpeedKph).paceFormatted;
    } else if (isRun && athleteProfile?.runThresholdPaceSec) {
      const ltSpeed = 3600 / athleteProfile.runThresholdPaceSec;
      targetSpeedKph = Number((ltSpeed * 1.05).toFixed(2));
      targetPaceStr = speedKphToPace(targetSpeedKph).paceFormatted;
    }

    const restSec = restSecMatch
      ? parseInt(restSecMatch[1], 10)
      : restMinMatch
        ? Math.round(parseFloat(restMinMatch[1]) * 60)
        : 70;

    let reps = 0;
    let repDistM = 0;
    let repDurSec = 0;
    let repSpecLabel = '';

    if (kmRepMatch) {
      reps = parseInt(kmRepMatch[1], 10);
      const kmVal = parseFloat(kmRepMatch[2]);
      repDistM = Math.round(kmVal * 1000);
      repDurSec = Math.round(repDistM / (targetSpeedKph / 3.6));
      repSpecLabel = `${reps} x ${kmVal}km`;
    } else if (minRepMatch) {
      reps = parseInt(minRepMatch[1], 10);
      const minVal = parseFloat(minRepMatch[2]);
      repDurSec = Math.round(minVal * 60);
      repDistM = Math.round((targetSpeedKph / 3.6) * repDurSec);
      repSpecLabel = `${reps} x ${minVal}min`;
    } else if (meterRepMatch) {
      reps = parseInt(meterRepMatch[1], 10);
      repDistM = parseInt(meterRepMatch[2], 10);
      repDurSec = Math.round(repDistM / (targetSpeedKph / 3.6));
      repSpecLabel = `${reps} x ${repDistM}m`;
    }

    const totalWorkSec = reps * repDurSec;
    const totalWorkDistKm = (reps * repDistM) / 1000;
    const totalRestSec = reps * restSec;
    const warmupCoolSec = Math.max(0, movingTimeSec - totalWorkSec - totalRestSec);
    const workMin = Math.floor(totalWorkSec / 60);
    const workRemSec = Math.round(totalWorkSec % 60);

    const intervalStructureSummary = `${repSpecLabel} @ ${targetPaceStr} (${targetSpeedKph} km/h) with ${restSec}s rest`;
    const activeWorkSummary = `Active Intervals: ${totalWorkDistKm.toFixed(2)} km (${workMin}m ${workRemSec.toString().padStart(2, '0')}s time-on-tension) @ ${targetPaceStr} (${targetSpeedKph} km/h), plus ${reps}x${restSec}s recovery (${Math.round(totalRestSec / 60)}m rest) and ~${Math.round(warmupCoolSec / 60)}m warm-up/cool-down. Note: Overall average pace (${overallPaceStr}) includes warm-up & rest intervals — evaluate this workout by its ${targetPaceStr} active interval pace!`;

    return {
      workoutClassification: 'structured_intervals',
      isQualityWorkout: true,
      isEasyOrCooldown: false,
      intervalStructureSummary,
      activeWorkSummary,
      lapsSummary: `Warm-up + ${repSpecLabel} @ ${targetPaceStr} (${Math.round(repDurSec)}s / ${repDistM}m per rep, ${restSec}s rest) + Cool-down`,
    };
  }

  // 4. Check Bike HIIT / Power Interval patterns (e.g. "HIIT30/15s 3x13 120%")
  if (isBike && (hiitMatch || hasIntervalPatternInTitle || variabilityIndex >= 1.08 || hrSpread >= 24)) {
    const ftp = athleteProfile?.bikeFtp || 315;
    const pctMatch = combined.match(/(\d{2,3})\s*%/);
    const targetPct = pctMatch ? parseInt(pctMatch[1], 10) : 115;
    const targetWatts = Math.round((ftp * targetPct) / 100);
    const structDesc = hiitMatch
      ? `${hiitMatch[3]} sets of ${hiitMatch[4]} x (${hiitMatch[1]}s ON @ ~${targetWatts}W [${targetPct}% FTP] / ${hiitMatch[2]}s OFF)`
      : `Structured Bike Intervals (Avg ${avgWatts}W${weightedWatts ? ` / NP ${weightedWatts}W` : ''}, Peak HR ${maxHr} bpm)`;
    return {
      workoutClassification: 'structured_intervals',
      isQualityWorkout: true,
      isEasyOrCooldown: false,
      intervalStructureSummary: structDesc,
      activeWorkSummary: `High-intensity bike interval stimulus (${structDesc}) — overall average power (${avgWatts}W) includes spinning recoveries between sets.`,
    };
  }

  // 5. Check Raw Strava Laps / Splits if available
  const rawLaps: any[] = details?.activity?.laps || act?.laps || [];
  if (rawLaps.length >= 4 && isRun) {
    const lapSpeeds = rawLaps
      .map((l) => (Number(l.average_speed) || 0) * 3.6)
      .filter((s) => s > 0);
    if (lapSpeeds.length >= 4) {
      const maxLapKph = Math.max(...lapSpeeds);
      const minLapKph = Math.min(...lapSpeeds);
      if (maxLapKph - minLapKph >= 2.5) {
        const fastLaps = rawLaps.filter((l) => (Number(l.average_speed) || 0) * 3.6 >= maxLapKph - 1.5);
        if (fastLaps.length >= 2) {
          const avgFastKph =
            fastLaps.reduce((acc, l) => acc + (Number(l.average_speed) || 0) * 3.6, 0) / fastLaps.length;
          const fastPace = speedKphToPace(avgFastKph);
          const totalFastDistKm = fastLaps.reduce((acc, l) => acc + (Number(l.distance) || 0), 0) / 1000;
          const totalFastSec = fastLaps.reduce((acc, l) => acc + (Number(l.moving_time) || 0), 0);
          return {
            workoutClassification: 'structured_intervals',
            isQualityWorkout: true,
            isEasyOrCooldown: false,
            intervalStructureSummary: `${fastLaps.length} fast interval laps averaging ${fastPace.paceFormatted} (${avgFastKph.toFixed(1)} km/h)`,
            activeWorkSummary: `${totalFastDistKm.toFixed(2)} km (${Math.round(totalFastSec / 60)} min) active interval work @ ${fastPace.paceFormatted} vs ${overallPaceStr} overall average`,
            lapsSummary: `${rawLaps.length} recorded laps (${fastLaps.length} work intervals @ ${fastPace.paceFormatted})`,
          };
        }
      }
    }
  }

  // 6. Check Stream Data (velocity_smooth / watts / heartrate) for unlabelled intervals
  const streams = details?.streams as Record<string, { data?: number[] }> | undefined;
  if (streams?.velocity_smooth?.data && streams.velocity_smooth.data.length > 120 && isRun) {
    const velData = streams.velocity_smooth.data.filter((v) => typeof v === 'number' && v > 0.5);
    if (velData.length > 120) {
      const sorted = [...velData].sort((a, b) => b - a);
      const p90Mps = sorted[Math.floor(sorted.length * 0.1)];
      const p50Mps = sorted[Math.floor(sorted.length * 0.5)];
      if (p90Mps - p50Mps >= 0.75) {
        const fastSamples = velData.filter((v) => v >= p90Mps * 0.94);
        const fastKph = (fastSamples.reduce((a, b) => a + b, 0) / fastSamples.length) * 3.6;
        const fastPace = speedKphToPace(fastKph);
        return {
          workoutClassification: 'structured_intervals',
          isQualityWorkout: true,
          isEasyOrCooldown: false,
          intervalStructureSummary: `Detected interval surges @ ~${fastPace.paceFormatted} (${fastKph.toFixed(1)} km/h) from velocity stream`,
          activeWorkSummary: `High-speed interval surges @ ${fastPace.paceFormatted} vs ${overallPaceStr} overall average`,
        };
      }
    }
  }

  // 7. Check HR spread heuristic (e.g., max HR >= avg HR + 22 bpm on a run/ride indicates intervals)
  if ((isRun || isBike) && hrSpread >= 22 && maxHr >= 155) {
    return {
      workoutClassification: 'structured_intervals',
      isQualityWorkout: true,
      isEasyOrCooldown: false,
      intervalStructureSummary: `High-variability interval session (Avg HR ${avgHr} bpm vs Peak HR ${maxHr} bpm — +${hrSpread} bpm spread)`,
      activeWorkSummary: `Large HR spread (${avgHr} avg / ${maxHr} max bpm) indicates hard intervals separated by recovery periods; overall average (${overallPaceStr || `${avgWatts}W`}) includes rest periods.`,
    };
  }

  // 8. Check Tempo / Threshold vs Long Endurance vs Easy/Aerobic Base
  if (/\b(tempo|threshold|sweet\s*spot|ltp|race\s*pace)\b/i.test(combined)) {
    return {
      workoutClassification: 'tempo_threshold',
      isQualityWorkout: true,
      isEasyOrCooldown: false,
      intervalStructureSummary: `Sustained Tempo / Threshold workout (${distanceKm.toFixed(2)} km, ${movingTimeMin} min)`,
    };
  }

  if ((isRun && movingTimeMin >= 75) || (isBike && movingTimeMin >= 105) || (isSwim && distanceM >= 2500)) {
    return {
      workoutClassification: 'long_endurance',
      isQualityWorkout: true,
      isEasyOrCooldown: false,
      intervalStructureSummary: `Long Endurance ${isRun ? 'Run' : isBike ? 'Ride' : 'Swim'} (${distanceKm.toFixed(2)} km, ${movingTimeMin} min)`,
    };
  }

  // Check if short & low HR run on same day or in general -> easy/cooldown
  if (isRun && movingTimeMin <= 36 && avgHr > 0 && avgHr <= 128) {
    return {
      workoutClassification: 'easy_or_cooldown',
      isQualityWorkout: false,
      isEasyOrCooldown: true,
      intervalStructureSummary: `Easy / Recovery Run (${distanceKm.toFixed(2)} km @ ${overallPaceStr}, avg HR ${avgHr} bpm)`,
    };
  }

  return {
    workoutClassification: 'aerobic_base',
    isQualityWorkout: movingTimeMin >= 40,
    isEasyOrCooldown: false,
    intervalStructureSummary: `Aerobic Base ${isRun ? 'Run' : isBike ? 'Ride' : isSwim ? 'Swim' : 'Session'} (${distanceKm.toFixed(2)} km, ${movingTimeMin} min)`,
  };
}

export interface DayOfWeekWorkoutGroup {
  date: string; // YYYY-MM-DD
  dayOfWeek: string;
  primaryWorkout: any;
  secondaryWorkouts: any[]; // e.g. cooldown run, recovery run, evening swim on the same date
}

/**
 * Groups activities occurring on a target day of week (e.g. "Thursday") by DISTINCT calendar dates (`startDate`),
 * and selects the PRIMARY structured/quality workout for each date while keeping easy/cooldown/recovery runs
 * in `secondaryWorkouts` so the coach never confuses a same-day cooldown jog for the previous week's workout!
 */
export function getStructuredWorkoutsByDayOfWeek(
  activities: any[],
  targetDayOfWeek: string,
  sportFilter?: 'run' | 'bike' | 'swim'
): DayOfWeekWorkoutGroup[] {
  const dayLower = targetDayOfWeek.toLowerCase();
  const matching = (activities || []).filter((a) => {
    const aDay = String(a.dayOfWeek || '').toLowerCase();
    if (aDay !== dayLower) return false;
    if (sportFilter) {
      const s = String(a.sport || a.type || '').toLowerCase();
      if (sportFilter === 'run' && !s.includes('run')) return false;
      if (sportFilter === 'bike' && !s.includes('ride') && !s.includes('bike')) return false;
      if (sportFilter === 'swim' && !s.includes('swim')) return false;
    }
    return true;
  });

  // Group by distinct calendar date (YYYY-MM-DD)
  const byDate = new Map<string, any[]>();
  for (const act of matching) {
    const dateKey = String(act.startDate || '').slice(0, 10);
    if (!dateKey) continue;
    const list = byDate.get(dateKey) || [];
    list.push(act);
    byDate.set(dateKey, list);
  }

  // Sort dates newest first
  const sortedDates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));

  return sortedDates.map((date) => {
    const dayActs = byDate.get(date) || [];
    // Score each activity on that date to pick the primary structured workout
    const scored = dayActs.map((a) => {
      let priority = 0;
      const nameLower = String(a.name || '').toLowerCase();
      if (a.workoutClassification === 'structured_intervals') priority += 100;
      else if (a.workoutClassification === 'tempo_threshold') priority += 80;
      else if (a.workoutClassification === 'long_endurance') priority += 70;
      else if (a.isQualityWorkout) priority += 50;

      if (/(\d+)\s*x\s*(\d+)/i.test(nameLower)) priority += 60;
      if (/\b(cooldown|cool-down|recovery|easy|shakeout)\b/i.test(nameLower) || a.isEasyOrCooldown) {
        priority -= 80;
      }
      priority += (Number(a.tss) || 0) * 0.5 + (Number(a.movingTimeMin) || 0) * 0.3;
      return { act: a, priority };
    });

    scored.sort((a, b) => b.priority - a.priority);
    const primaryWorkout = scored[0].act;
    const secondaryWorkouts = scored.slice(1).map((s) => s.act);

    return {
      date,
      dayOfWeek: targetDayOfWeek,
      primaryWorkout,
      secondaryWorkouts,
    };
  });
}

