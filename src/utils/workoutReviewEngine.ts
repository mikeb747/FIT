import type { AthleteProfile } from '../types/athlete';
import type { TrainingGoal } from '../types/goals';
import type {
  WorkoutReviewItem,
  WorkoutAssessmentType,
  BenchmarkMilestone,
} from '../types/coach';
import {
  StravaActivity,
  StravaActivityDetailsRecord,
  classifyActivity,
  calculateActivityTSS,
} from './stravaActivities';

function formatPaceSec(seconds?: number): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return 'N/A';
  const mins = Math.floor(seconds / 60);
  const remSec = Math.round(seconds % 60);
  return `${mins}:${remSec.toString().padStart(2, '0')}/km`;
}

/**
 * Calculates cardiac drift (aerobic decoupling) between first half and second half of session.
 * For bike: (Pwr_1 / HR_1) vs (Pwr_2 / HR_2)
 * For run: (Speed_1 / HR_1) vs (Speed_2 / HR_2)
 * Returns positive drift percentage (e.g. +4.2% or +8.5%).
 */
export function calculateCardiacDrift(
  streams?: Record<string, { data?: any[] }>,
  sport: string = 'Run'
): number | undefined {
  if (!streams) return undefined;
  const hrData: number[] = streams.heartrate?.data || [];
  if (hrData.length < 30) return undefined;

  const half = Math.floor(hrData.length / 2);
  const hr1 = hrData.slice(0, half);
  const hr2 = hrData.slice(half);

  const avgHr1 = hr1.reduce((a, b) => a + b, 0) / hr1.length;
  const avgHr2 = hr2.reduce((a, b) => a + b, 0) / hr2.length;
  if (avgHr1 <= 0 || avgHr2 <= 0) return undefined;

  const isBike = sport.toLowerCase().includes('ride') || sport.toLowerCase().includes('bike');
  const pwrData: number[] = streams.watts?.data || [];

  if (isBike && pwrData.length >= 30) {
    const pwr1 = pwrData.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const pwr2 = pwrData.slice(half).reduce((a, b) => a + b, 0) / (pwrData.length - half);

    if (pwr1 > 50 && pwr2 > 50) {
      const ef1 = pwr1 / avgHr1;
      const ef2 = pwr2 / avgHr2;
      const drift = ((ef1 - ef2) / ef1) * 100;
      return Math.round(drift * 10) / 10;
    }
  }

  // Speed-based decoupling for runs
  const speedData: number[] = streams.velocity_smooth?.data || [];
  if (speedData.length >= 30) {
    const spd1 = speedData.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const spd2 = speedData.slice(half).reduce((a, b) => a + b, 0) / (speedData.length - half);

    if (spd1 > 1.5 && spd2 > 1.5) {
      const ef1 = spd1 / avgHr1;
      const ef2 = spd2 / avgHr2;
      const drift = ((ef1 - ef2) / ef1) * 100;
      return Math.round(drift * 10) / 10;
    }
  }

  // Fallback simple HR rise
  const hrRise = ((avgHr2 - avgHr1) / avgHr1) * 100;
  return Math.round(hrRise * 10) / 10;
}

/**
 * Calculates current periodization phase and cycle week from athlete profile.
 */
export function getPeriodizationPhaseInfo(profile: AthleteProfile): {
  model: '0' | '3weeks' | '4weeks';
  phaseName: string;
  currentWeekInCycle: number;
  totalCycleWeeks: number;
  isRecoveryWeek: boolean;
} {
  const model = profile.periodization || '4weeks';
  if (model === '0') {
    return {
      model: '0',
      phaseName: 'Continuous Linear Progression',
      currentWeekInCycle: 1,
      totalCycleWeeks: 1,
      isRecoveryWeek: false,
    };
  }

  // Determine week in year to establish consistent cycle
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (7 * 24 * 3600 * 1000)) + 1;

  if (model === '3weeks') {
    const cycleWeek = ((weekOfYear - 1) % 3) + 1; // 1, 2, or 3
    const isRecovery = cycleWeek === 3;
    return {
      model: '3weeks',
      phaseName: isRecovery ? 'Week 3: Recovery & Adaptation Cutback' : `Week ${cycleWeek}: Progressive Build Block`,
      currentWeekInCycle: cycleWeek,
      totalCycleWeeks: 3,
      isRecoveryWeek: isRecovery,
    };
  } else {
    // 4weeks (3 progressive + 1 easy)
    const cycleWeek = ((weekOfYear - 1) % 4) + 1; // 1, 2, 3, or 4
    const isRecovery = cycleWeek === 4;
    return {
      model: '4weeks',
      phaseName: isRecovery ? 'Week 4: Scheduled Recovery & Regeneration Cutback' : `Week ${cycleWeek} of 4: Progressive Overload Build`,
      currentWeekInCycle: cycleWeek,
      totalCycleWeeks: 4,
      isRecoveryWeek: isRecovery,
    };
  }
}

/**
 * Evaluates athlete's progress on Ironman / 70.3 Benchmark Goals & Sub-Goals.
 */
export function evaluateBenchmarkMilestones(
  activities: StravaActivity[],
  profile: AthleteProfile
): BenchmarkMilestone[] {
  const validActs = activities.filter((a) => !a.isDeleted);

  // 1. Max Swim Distance
  let maxSwimM = 0;
  let bestSwimAct: StravaActivity | null = null;
  // 2. Max Bike Distance
  let maxBikeKm = 0;
  let bestBikeAct: StravaActivity | null = null;
  // 3. Max Run Distance
  let maxRunKm = 0;
  let bestRunAct: StravaActivity | null = null;
  // 4. Best 1.9km+ swim pace
  let best1900mPaceSec = Infinity;
  let best1900mAct: StravaActivity | null = null;
  // 5. Longest TT / Aero ride (steady cadence >75 rpm, >= 60 min)
  let maxTtRimMin = 0;
  let bestTtAct: StravaActivity | null = null;
  // 6. 3-hour 225W bike workout
  let best3hrWatts = 0;
  let best3hrAct: StravaActivity | null = null;
  // 7. 10-mile (16.1km) tempo run
  let best10miSecPerKm = Infinity;
  let best10miAct: StravaActivity | null = null;

  validActs.forEach((act) => {
    const { category, subType } = classifyActivity(act);
    const distM = act.distance || 0;
    const distKm = distM / 1000;
    const movingMin = (act.moving_time || 0) / 60;
    const dateStr = (act.start_date_local || act.start_date || '').split('T')[0];

    // Swim checks
    if (category === 'Swim') {
      if (distM > maxSwimM) {
        maxSwimM = distM;
        bestSwimAct = act;
      }
      if (distM >= 1800 && act.moving_time > 0) {
        const pace100mSec = (act.moving_time / distM) * 100;
        if (pace100mSec < best1900mPaceSec) {
          best1900mPaceSec = pace100mSec;
          best1900mAct = act;
        }
      }
    }

    // Bike checks
    if (category === 'Bike') {
      if (distKm > maxBikeKm) {
        maxBikeKm = distKm;
        bestBikeAct = act;
      }

      // TT aero posture duration check (trainer rides or outdoor flat rides > 60m)
      if (movingMin > maxTtRimMin) {
        maxTtRimMin = movingMin;
        bestTtAct = act;
      }

      // 3-hour ~225W check
      if (movingMin >= 140 && act.average_watts) {
        if (act.average_watts > best3hrWatts) {
          best3hrWatts = Math.round(act.average_watts);
          best3hrAct = act;
        }
      }
    }

    // Run checks
    if (category === 'Run') {
      if (distKm > maxRunKm) {
        maxRunKm = distKm;
        bestRunAct = act;
      }
      // 10 mile / 16km tempo run
      if (distKm >= 14 && act.moving_time > 0) {
        const secPerKm = act.moving_time / distKm;
        if (secPerKm < best10miSecPerKm) {
          best10miSecPerKm = secPerKm;
          best10miAct = act;
        }
      }
    }
  });

  const swimAct = bestSwimAct as StravaActivity | null;
  const bikeAct = bestBikeAct as StravaActivity | null;
  const runAct = bestRunAct as StravaActivity | null;
  const act1900m = best1900mAct as StravaActivity | null;
  const ttAct = bestTtAct as StravaActivity | null;
  const act3hr = best3hrAct as StravaActivity | null;
  const act10mi = best10miAct as StravaActivity | null;

  const milestones: BenchmarkMilestone[] = [
    // -----------------------------------------------------------------
    // Macro Goals
    // -----------------------------------------------------------------
    {
      id: 'macro_swim_3800m',
      category: 'macro_goal',
      discipline: 'swim',
      title: 'Swim 3.8 km in Training',
      targetMetric: '3.8 km continuous',
      targetValue: 3.8,
      currentValue: Math.round((maxSwimM / 1000) * 10) / 10,
      unit: 'km',
      progressPct: Math.min(100, Math.round((maxSwimM / 3800) * 100)),
      status: maxSwimM >= 3800 ? 'achieved' : maxSwimM >= 2500 ? 'in_progress' : 'planned',
      description: 'Full Ironman distance swim rehearsal in continuous open water or pool conditioning.',
      whyItMatters: 'Completing 3.8km in training proves shoulder durability, sighting mechanics, and bilateral breathing resilience with zero cramps before race morning.',
      bestEffortActivity: swimAct
        ? {
            name: swimAct.name,
            date: (swimAct.start_date_local || swimAct.start_date).split('T')[0],
            metricValue: `${(swimAct.distance / 1000).toFixed(2)} km`,
          }
        : undefined,
    },
    {
      id: 'macro_bike_80mi',
      category: 'macro_goal',
      discipline: 'bike',
      title: 'Ride 80 Miles (128.7 km)',
      targetMetric: '128.7 km (80 mi)',
      targetValue: 128.7,
      currentValue: Math.round(maxBikeKm * 10) / 10,
      unit: 'km',
      progressPct: Math.min(100, Math.round((maxBikeKm / 128.7) * 100)),
      status: maxBikeKm >= 128.7 ? 'achieved' : maxBikeKm >= 80 ? 'in_progress' : 'planned',
      description: 'Over-distance landmark for 70.3 and key base foundation for the 112-mile Ironman bike.',
      whyItMatters: 'Trains gastrointestinal gut tolerance to ingest 60–90g carbs/hr for 4+ hours without GI distress, while anchoring muscular endurance at sub-threshold wattage.',
      bestEffortActivity: bikeAct
        ? {
            name: bikeAct.name,
            date: (bikeAct.start_date_local || bikeAct.start_date).split('T')[0],
            metricValue: `${(bikeAct.distance / 1000).toFixed(1)} km`,
          }
        : undefined,
    },
    {
      id: 'macro_run_16mi',
      category: 'macro_goal',
      discipline: 'run',
      title: 'Run 16 Miles (25.75 km)',
      targetMetric: '25.75 km (16 mi)',
      targetValue: 25.75,
      currentValue: Math.round(maxRunKm * 10) / 10,
      unit: 'km',
      progressPct: Math.min(100, Math.round((maxRunKm / 25.75) * 100)),
      status: maxRunKm >= 25.75 ? 'achieved' : maxRunKm >= 18 ? 'in_progress' : 'planned',
      description: 'Over-distance 70.3 run volume and crucial endurance benchmark for marathon durability.',
      whyItMatters: 'Builds musculoskeletal resilience in tendons and joints to resist late-race biomechanical breakdown and severe pace decay in the final 5km.',
      bestEffortActivity: runAct
        ? {
            name: runAct.name,
            date: (runAct.start_date_local || runAct.start_date).split('T')[0],
            metricValue: `${(runAct.distance / 1000).toFixed(1)} km`,
          }
        : undefined,
    },

    // -----------------------------------------------------------------
    // Precision Sub-Goals
    // -----------------------------------------------------------------
    {
      id: 'sub_swim_1900m_speed',
      category: 'sub_goal',
      discipline: 'swim',
      title: 'Speed Up Your 1.9 km Swim (Sub-32 min)',
      targetMetric: 'Sub-32 min (<1:41/100m)',
      targetValue: 101, // 1:41/100m in seconds
      currentValue: isFinite(best1900mPaceSec) ? Math.round(best1900mPaceSec) : 115,
      unit: 'sec/100m',
      progressPct: isFinite(best1900mPaceSec)
        ? Math.min(100, Math.max(20, Math.round((120 / best1900mPaceSec) * 90)))
        : 65,
      status: best1900mPaceSec <= 101 ? 'achieved' : best1900mPaceSec <= 112 ? 'in_progress' : 'planned',
      description: 'Sustain continuous aerobic CSS pace across 1.9km with minimal rest interval dependence.',
      whyItMatters: 'Triathlon swimming requires sustained continuous pacing. Doing fast 50m/100m sprints with long 45s rest trains the wrong energy system (anaerobic glycolytic). Reducing rest to 10–15s builds the aerobic durability needed to exit the water fresh.',
      bestEffortActivity: act1900m
        ? {
            name: act1900m.name,
            date: (act1900m.start_date_local || act1900m.start_date).split('T')[0],
            metricValue: `${Math.floor(best1900mPaceSec / 60)}:${Math.round(best1900mPaceSec % 60).toString().padStart(2, '0')}/100m`,
          }
        : undefined,
    },
    {
      id: 'sub_bike_2hr_tt',
      category: 'sub_goal',
      discipline: 'bike',
      title: 'Spend 2 Hours in the Time Trial (TT) Position',
      targetMetric: '120 min aero position',
      targetValue: 120,
      currentValue: Math.min(120, Math.round(maxTtRimMin)),
      unit: 'min',
      progressPct: Math.min(100, Math.round((maxTtRimMin / 120) * 100)),
      status: maxTtRimMin >= 120 ? 'achieved' : maxTtRimMin >= 75 ? 'in_progress' : 'planned',
      description: 'Lock into the aerodynamic cockpit on extensions with stable pelvic tilt and steady cadence.',
      whyItMatters: 'For a 4h 30m Half Ironman (target ~2h 15m bike), aerodynamic drag accounts for ~80% of total resistance. Riding 2 hours in the aero TT position saves 10–15+ minutes over 90km—far more than a 15W power increase ridden upright on the brake hoods.',
      bestEffortActivity: ttAct
        ? {
            name: ttAct.name,
            date: (ttAct.start_date_local || ttAct.start_date).split('T')[0],
            metricValue: `${Math.round(ttAct.moving_time / 60)} min ride`,
          }
        : undefined,
    },
    {
      id: 'sub_bike_3hr_225w',
      category: 'sub_goal',
      discipline: 'bike',
      title: '3-Hour 225 Watt Workout',
      targetMetric: '180 min @ 225W steady',
      targetValue: 225,
      currentValue: best3hrWatts || Math.round((profile.bikeFtp || 315) * 0.71),
      unit: 'Watts',
      progressPct: Math.min(100, Math.round(((best3hrWatts || 180) / 225) * 100)),
      status: best3hrWatts >= 225 ? 'achieved' : best3hrWatts >= 200 ? 'in_progress' : 'planned',
      description: 'Sustained endurance power at ~71% of FTP (315W) with flat power distribution and minimal variability.',
      whyItMatters: 'Holding 225W for 3 hours with under 5% cardiac drift proves mitochondrial density and preserves muscle glycogen for an explosive off-the-bike half marathon run.',
      bestEffortActivity: act3hr
        ? {
            name: act3hr.name,
            date: (act3hr.start_date_local || act3hr.start_date).split('T')[0],
            metricValue: `${best3hrWatts}W avg (${Math.round(act3hr.moving_time / 60)} min)`,
          }
        : undefined,
    },
    {
      id: 'sub_run_10mi_tempo',
      category: 'sub_goal',
      discipline: 'run',
      title: '1-Hour 10-Mile (16.1 km) Threshold Tempo Run',
      targetMetric: '16.1 km in 60-65 min (~3:45-4:05/km)',
      targetValue: 228, // 3:48/km
      currentValue: isFinite(best10miSecPerKm) ? Math.round(best10miSecPerKm) : 260,
      unit: 'sec/km',
      progressPct: isFinite(best10miSecPerKm)
        ? Math.min(100, Math.max(30, Math.round((270 / best10miSecPerKm) * 88)))
        : 70,
      status: best10miSecPerKm <= 245 ? 'achieved' : best10miSecPerKm <= 270 ? 'in_progress' : 'planned',
      description: 'Lactate Threshold Pace (LTP) sustained across double-digit mileage.',
      whyItMatters: 'To hit a 4h 30m Half Ironman, you need a ~1h 24m to 1h 28m run (~4:00-4:10/km). Having a fast 5k is meaningless without sustained distance at pace. Working on run distance at LTP threshold delivers the single biggest time dividend on race day.',
      bestEffortActivity: act10mi
        ? {
            name: act10mi.name,
            date: (act10mi.start_date_local || act10mi.start_date).split('T')[0],
            metricValue: `${formatPaceSec(best10miSecPerKm)} (${(act10mi.distance / 1000).toFixed(1)} km)`,
          }
        : undefined,
    },
  ];

  return milestones;
}

/**
 * Reviews recent workouts looking at overall stats and streams to determine
 * whether each session was too hard, too short, not hard enough, or optimal.
 */
export function generateWorkoutReviews(
  activities: StravaActivity[],
  activityDetails: Record<string, StravaActivityDetailsRecord>,
  athleteProfile: AthleteProfile,
  goals: TrainingGoal[]
): WorkoutReviewItem[] {
  const sorted = [...activities]
    .filter((a) => !a.isDeleted && a.start_date)
    .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
    .slice(0, 15);

  const now = new Date();
  const ftp = athleteProfile.bikeFtp || 315;
  const lthr = athleteProfile.thresholdHeartRateRun || 168;
  const outdoorPaceSec = athleteProfile.thresholdPaceRunOutdoorSec || 232;
  const periodization = getPeriodizationPhaseInfo(athleteProfile);

  return sorted.map((act) => {
    const details = activityDetails[String(act.id)];
    const streams = details?.streams as Record<string, { data?: any[] }> | undefined;
    const dateObj = new Date(act.start_date_local || act.start_date);
    const dateStr = !isNaN(dateObj.getTime()) ? dateObj.toISOString().split('T')[0] : act.start_date.split('T')[0];
    const dayOfWeek = !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString('en-US', { weekday: 'long' }) : 'Unknown';
    const daysAgo = Math.max(0, Math.floor((now.getTime() - dateObj.getTime()) / (24 * 3600 * 1000)));

    const { category, subType } = classifyActivity(act);
    const distM = details?.calibration?.calibratedDistanceM ?? act.distance ?? 0;
    const movingSec = details?.calibration?.calibratedMovingTimeSec ?? act.moving_time ?? 0;
    const distanceKm = Math.round((distM / 1000) * 100) / 100;
    const movingTimeMin = Math.round(movingSec / 60);

    const avgWatts = details?.calibration?.calibratedAvgWatts ?? act.average_watts;
    const avgHr = (details?.calibration?.calibratedAvgHeartRate ?? act.average_heartrate) ? Math.round(details?.calibration?.calibratedAvgHeartRate ?? act.average_heartrate!) : undefined;
    const maxHr = (details?.calibration?.calibratedMaxHeartRate ?? act.max_heartrate) ? Math.round(details?.calibration?.calibratedMaxHeartRate ?? act.max_heartrate!) : undefined;

    let tss = details?.calibration?.manualTss;
    if (tss === undefined || tss < 0) {
      const calc = calculateActivityTSS(act, details, athleteProfile);
      tss = calc?.tss ?? act.suffer_score;
    }
    const finalTss = typeof tss === 'number' ? Math.round(tss) : undefined;

    // Pace or Speed
    let paceFormatted: string | undefined;
    let speedKmh: number | undefined;
    if (category === 'Run' || (category as string) === 'Walk') {
      if (distM > 100 && movingSec > 30) {
        paceFormatted = formatPaceSec(movingSec / (distM / 1000));
      }
    } else if (category === 'Swim') {
      if (distM > 50 && movingSec > 20) {
        const sec100m = (movingSec / distM) * 100;
        paceFormatted = `${Math.floor(sec100m / 60)}:${Math.round(sec100m % 60).toString().padStart(2, '0')}/100m`;
      }
    } else if (category === 'Bike') {
      if (distM > 500 && movingSec > 60) {
        speedKmh = Math.round(((distM / 1000) / (movingSec / 3600)) * 10) / 10;
      }
    }

    // Stream Insights
    const hasStreams = Boolean(streams && Object.keys(streams).length > 0);
    const cardiacDriftPct = calculateCardiacDrift(streams, category);

    // Stream-based zone distributions
    let timeInZone2Pct: number | undefined;
    let timeInZone45Pct: number | undefined;
    let swimIntervalSummary: string | undefined;
    let bikeTtAeroSummary: string | undefined;
    let runLtpPaceSummary: string | undefined;

    if (category === 'Swim') {
      // Analyze swim interval density: did they swim continuous or short sprints with long rest?
      if (movingTimeMin > 0 && distanceKm > 0) {
        const avgPace = (movingSec / distM) * 100;
        if (movingTimeMin >= 35 && distanceKm < 1.5) {
          swimIntervalSummary = 'High rest intervals (work-to-rest ratio ~1:1). Lots of short sprint repeats with extended pool-deck recovery.';
        } else if (distanceKm >= 2.0 && movingTimeMin <= 45) {
          swimIntervalSummary = 'Continuous high-density aerobic endurance with minimal wall rest. Excellent simulation of 1.9km/3.8km open water pacing.';
        } else {
          swimIntervalSummary = 'Mixed aerobic sets with moderate rest intervals (15-20s). Good stroke mechanics control.';
        }
      }
    } else if (category === 'Bike') {
      if (subType === 'Turbo Trainer' || act.trainer) {
        bikeTtAeroSummary = 'Indoor turbo trainer session: Cadence was steady with zero coasting, maintaining sustained aero posture on extensions.';
      } else if (speedKmh && speedKmh >= 32) {
        bikeTtAeroSummary = `High speed (${speedKmh} km/h) at ${avgWatts ? avgWatts + 'W' : 'moderate power'} indicates effective aerodynamic TT position adherence.`;
      }
    } else if (category === 'Run') {
      if (distM > 0 && movingSec > 0) {
        const actPaceSec = movingSec / (distM / 1000);
        if (actPaceSec <= outdoorPaceSec * 1.05 && distanceKm >= 8) {
          runLtpPaceSummary = `Sustained threshold stamina: Maintained within 5% of Lactate Threshold Pace (${formatPaceSec(outdoorPaceSec)}) for ${distanceKm} km.`;
        } else if (actPaceSec >= outdoorPaceSec * 1.15) {
          runLtpPaceSummary = 'Pure Zone 2 aerobic base volume. Kept ground contact forces light and aerobic fat-burning active.';
        }
      }
    }

    // Assess: too_hard | too_short | not_hard_enough | optimal
    let assessment: WorkoutAssessmentType = 'optimal';
    let assessmentTitle = 'Optimal Execution';
    let coachTakeaway = '';
    let suggestedAdjustment = '';
    let goalContribution = 'Contributes to baseline aerobic conditioning.';
    let subGoalContribution: string | undefined;

    if (category === 'Swim') {
      if (distanceKm < 1.0 && movingTimeMin < 25) {
        assessment = 'too_short';
        assessmentTitle = 'Too Short for Endurance Adaptation';
        coachTakeaway = 'Under 1000m total volume does not trigger the upper-body mitochondrial adaptations needed for triathlon distance.';
        suggestedAdjustment = 'Extend main sets with 3 x 400m continuous pull buoy sets to reach at least 1800m–2200m per session.';
        goalContribution = 'Partial warm-up volume toward 3.8km Ironman swim milestone.';
      } else if (swimIntervalSummary?.includes('High rest')) {
        assessment = 'not_hard_enough';
        assessmentTitle = 'Excessive Rest for Triathlon Endurance';
        coachTakeaway = 'You executed fast short intervals but with excessive rest periods. In an open water race (1.9km or 3.8km), there are zero walls or rest intervals.';
        suggestedAdjustment = 'Cut rest between 100m repeats to 10–15s max, or switch to 400m–800m continuous CSS threshold blocks.';
        goalContribution = 'Builds anaerobic speed, but needs shorter rest to support 1.9km swim benchmark.';
        subGoalContribution = 'Needs reduced rest interval to speed up 1.9km continuous swim benchmark.';
      } else {
        assessment = 'optimal';
        assessmentTitle = 'Aerobically Sound Swim Conditioning';
        coachTakeaway = 'Disciplined pacing and sustained stroke volume with controlled rest periods.';
        suggestedAdjustment = 'Progress by adding 2 x 200m at CSS threshold pace next week.';
        goalContribution = 'Directly builds toward 3.8km continuous swim milestone.';
      }
    } else if (category === 'Bike') {
      if (periodization.isRecoveryWeek && (finalTss || 0) > 85) {
        assessment = 'too_hard';
        assessmentTitle = 'Too Hard for Scheduled Recovery Week';
        coachTakeaway = `During ${periodization.phaseName}, sessions should not exceed 45-50 TSS. A load of ${finalTss} TSS blunts parasympathetic adaptation.`;
        suggestedAdjustment = 'Cap future recovery spins at sub-55% FTP (<175W) for 40-45 minutes.';
        goalContribution = 'High stress, but delays supercompensation for upcoming build block.';
      } else if (cardiacDriftPct && cardiacDriftPct > 8.0 && movingTimeMin >= 60) {
        assessment = 'too_hard';
        assessmentTitle = 'High Aerobic Decoupling (Cardiac Drift)';
        coachTakeaway = `Your heart rate drifted +${cardiacDriftPct}% in the second half relative to power, indicating aerobic fatigue, muscle glycogen depletion, or dehydration.`;
        suggestedAdjustment = 'Drop target power by 10-15W or increase fluid/electrolyte intake (750ml/hr with 500mg sodium).';
        goalContribution = 'Highlights need for pacing discipline on long rides.';
      } else if (movingTimeMin < 40 && (finalTss || 0) < 30) {
        assessment = 'too_short';
        assessmentTitle = 'Too Short for Meaningful Aerobic Overload';
        coachTakeaway = 'The session ended before stimulating long-chain fatty acid oxidation.';
        suggestedAdjustment = 'Extend endurance rides to at least 75-90 minutes, or add sweet spot intervals to increase density.';
        goalContribution = 'Minor recovery stimulus.';
      } else if (avgWatts && avgWatts >= 210 && movingTimeMin >= 90) {
        assessment = 'optimal';
        assessmentTitle = 'High-Yield Steady State Power Endurance';
        coachTakeaway = `Superb pacing at ${avgWatts}W across ${movingTimeMin} minutes with disciplined cadence.`;
        suggestedAdjustment = 'Reinforce this with a 15-minute brick run transition off the bike next weekend.';
        goalContribution = 'Directly advances 80-mile ride benchmark and 3-hour 225W sub-goal.';
        subGoalContribution = 'Major progress toward 3-hour 225W target workout.';
      } else {
        assessment = 'optimal';
        assessmentTitle = 'Solid Aerobic Base Volume';
        coachTakeaway = `Consistent power and heart rate response throughout ${distanceKm} km.`;
        suggestedAdjustment = 'Maintain weekly long ride consistency.';
        goalContribution = 'Contributes to 80-mile bike volume benchmark.';
      }
    } else if (category === 'Run') {
      if (periodization.isRecoveryWeek && (finalTss || 0) > 70) {
        assessment = 'too_hard';
        assessmentTitle = 'Excessive Stress for Recovery Week';
        coachTakeaway = `Running generates high eccentric muscle damage. A load of ${finalTss} TSS during a cutback week impairs soft-tissue remodeling.`;
        suggestedAdjustment = 'Keep cutback runs strictly under 35 minutes on soft grass or trails.';
        goalContribution = 'Adds unnecessary fatigue during recovery microcycle.';
      } else if (distanceKm < 4 && movingTimeMin < 25 && !act.name.toLowerCase().includes('warm')) {
        assessment = 'too_short';
        assessmentTitle = 'Too Short for Aerobic Adaptation';
        coachTakeaway = 'Under 4 km does not provide sufficient cardiovascular stimulus.';
        suggestedAdjustment = 'Aim for at least 35-45 minutes (6-8 km) for standard aerobic runs.';
        goalContribution = 'Active recovery jog.';
      } else if (avgHr && avgHr > lthr && movingTimeMin >= 45) {
        assessment = 'too_hard';
        assessmentTitle = 'Overcooked: Exceeded Lactate Threshold';
        coachTakeaway = `Average heart rate was ${avgHr} bpm (above your LTHR of ${lthr} bpm). Pushing into Zone 5 creates heavy autonomic fatigue without building aerobic endurance.`;
        suggestedAdjustment = 'Enforce strict HR governor: keep heart rate below 85% LTHR (<143 bpm) on endurance runs.';
        goalContribution = 'Accrued high fatigue; ensure tomorrow is an easy active recovery spin.';
      } else if (distanceKm >= 12) {
        assessment = 'optimal';
        assessmentTitle = 'High-Value Threshold & Distance Stamina';
        coachTakeaway = `Held ${distanceKm} km with controlled cadence and steady pacing. This builds the exact fatigue resistance needed for Half Ironman running.`;
        suggestedAdjustment = 'Add 2 km next week if legs feel fresh, or maintain pace for 14 km.';
        goalContribution = 'Directly advances 16-mile long run milestone.';
        subGoalContribution = 'Directly builds towards 1-hour 10-mile threshold tempo sub-goal.';
      } else {
        assessment = 'optimal';
        assessmentTitle = 'Controlled Aerobic Pacing';
        coachTakeaway = `Solid session keeping within your aerobic envelope (${paceFormatted || 'steady pace'}).`;
        suggestedAdjustment = 'Keep up the consistent weekly rhythm.';
        goalContribution = 'Reinforces weekly running volume.';
      }
    }

    // Badge styling
    let bgClass = 'bg-emerald-500/10';
    let textClass = 'text-emerald-400';
    let borderClass = 'border-emerald-500/30';
    let label = 'Optimal';

    if (assessment === 'too_hard') {
      bgClass = 'bg-rose-500/10';
      textClass = 'text-rose-400';
      borderClass = 'border-rose-500/30';
      label = 'Too Hard';
    } else if (assessment === 'too_short') {
      bgClass = 'bg-amber-500/10';
      textClass = 'text-amber-400';
      borderClass = 'border-amber-500/30';
      label = 'Too Short';
    } else if (assessment === 'not_hard_enough') {
      bgClass = 'bg-sky-500/10';
      textClass = 'text-sky-400';
      borderClass = 'border-sky-500/30';
      label = 'Not Hard Enough';
    }

    const periodizationFit = periodization.isRecoveryWeek
      ? assessment === 'too_hard'
        ? 'Contradicts recovery week regeneration requirements.'
        : 'Appropriately light for recovery microcycle.'
      : assessment === 'too_short'
      ? 'Under target volume for progressive build phase.'
      : 'Appropriate overload stimulus for build phase.';

    return {
      id: `rev_${act.id}`,
      activityId: act.id,
      name: act.name,
      sport: category || act.sport_type || act.type || 'Other',
      startDate: dateStr,
      dayOfWeek,
      daysAgo,
      distanceKm,
      movingTimeMin,
      paceFormatted,
      speedKmh,
      avgWatts,
      avgHeartrate: avgHr,
      maxHeartrate: maxHr,
      avgCadence: act.average_cadence ? Math.round(act.average_cadence) : undefined,
      elevationGainM: act.total_elevation_gain ? Math.round(act.total_elevation_gain) : undefined,
      tss: finalTss,
      assessment,
      assessmentBadge: {
        label,
        bgClass,
        textClass,
        borderClass,
      },
      periodizationContext: `${periodization.phaseName}`,
      periodizationFit,
      goalContribution,
      subGoalContribution,
      streamInsights: {
        hasStreams,
        cardiacDriftPct,
        timeInZone2Pct,
        timeInZone45Pct,
        swimIntervalSummary,
        bikeTtAeroSummary,
        runLtpPaceSummary,
      },
      coachTakeaway,
      suggestedAdjustment,
    };
  });
}
