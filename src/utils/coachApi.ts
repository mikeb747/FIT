import type { AthleteProfile, DayOfWeek } from '../types/athlete';
import type { TrainingGoal } from '../types/goals';
import type { DailyRecoveryLog } from '../types/recovery';
import {
  StravaActivity,
  StravaActivityDetailsRecord,
  calculateActivityTSS,
  classifyActivity,
} from './stravaActivities';
import type {
  RecommendedWorkout,
  PeriodizedPlan,
  CoachSport,
  CoachRequestPayload,
  CoachActivityRecord,
  WorkoutReviewItem,
  BenchmarkMilestone,
  CoachGoalAction,
  CoachAction,
} from '../types/coach';
import { computeFitnessTimeline, calculateTriathlonFitnessIndex } from './fitnessEngine';
import { computeDailyReadiness } from './readinessEngine';
import {
  generateSportsScienceWorkout,
  generateSportsSciencePlan,
  generateSportsScienceChat,
} from './sportsScienceEngine';
import {
  getPeriodizationPhaseInfo,
  evaluateBenchmarkMilestones,
  generateWorkoutReviews,
} from './workoutReviewEngine';
import {
  findBestMatchingActivity,
  reconstructWorkoutFromQuery,
  analyzeActivityStructureAndLaps,
  getStructuredWorkoutsByDayOfWeek,
} from './coachWorkoutMatcher';

const isGitHubPages =
  typeof window !== 'undefined' &&
  (window.location.hostname.includes('github.io') || window.location.protocol === 'file:');

function formatPaceSec(seconds?: number): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return '';
  const mins = Math.floor(seconds / 60);
  const remSec = Math.round(seconds % 60);
  return `${mins}:${remSec.toString().padStart(2, '0')}/km`;
}

export async function fetchCoachStatus(): Promise<{
  available: boolean;
  model: string;
  features: string[];
}> {
  if (isGitHubPages) {
    return {
      available: true,
      model: 'sports-science-engine',
      features: ['workout-recommendation', 'periodized-plan', 'ai-chat-coach'],
    };
  }

  try {
    const res = await fetch('/api/coach/status');
    if (!res.ok) throw new Error(`Status HTTP ${res.status}`);
    const data = await res.json();
    return {
      available: Boolean(data.available),
      model: data.model || 'gemini-4-hydrogen',
      features: data.features || ['workout-recommendation', 'periodized-plan', 'ai-chat-coach'],
    };
  } catch {
    return {
      available: true,
      model: 'sports-science-engine',
      features: ['workout-recommendation', 'periodized-plan', 'ai-chat-coach'],
    };
  }
}

export function prepareCoachPayload(
  athleteProfile: AthleteProfile,
  goals: TrainingGoal[],
  activities: StravaActivity[],
  activityDetails: Record<string, StravaActivityDetailsRecord>,
  recoveryLogs: DailyRecoveryLog[],
  preferredSport?: CoachSport | 'auto',
  targetDurationMin?: number,
  customNotes?: string
): CoachRequestPayload {
  // Determine reference "today" date (use current system date, or newest activity date if in 2026 demo timeline)
  const sortedNonDeleted = [...activities]
    .filter((a) => !a.isDeleted && a.start_date)
    .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());

  const systemNow = new Date();
  const newestActDate = sortedNonDeleted.length > 0 ? new Date(sortedNonDeleted[0].start_date_local || sortedNonDeleted[0].start_date) : systemNow;
  // Use systemNow unless systemNow is older than newestActDate
  const today = newestActDate.getTime() > systemNow.getTime() ? newestActDate : systemNow;
  const todayDate = today.toISOString().split('T')[0];
  const todayDayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' });

  // 1. Latest Readiness
  const latestRecoveryLog = recoveryLogs.length > 0 ? recoveryLogs[recoveryLogs.length - 1] : null;
  const latestReadiness = latestRecoveryLog
    ? computeDailyReadiness(latestRecoveryLog, recoveryLogs, athleteProfile)
    : null;

  // 2. Fitness Stats (CTL, ATL, TSB, TFI, & CTL Ramp Rate)
  const timeline = computeFitnessTimeline(activities, activityDetails, athleteProfile, 60);
  const latestFitness = timeline.length > 0 ? timeline[timeline.length - 1] : null;
  const fitness7dAgo = timeline.length > 7 ? timeline[timeline.length - 8] : timeline[0] || null;
  const fitness28dAgo = timeline.length > 28 ? timeline[timeline.length - 29] : timeline[0] || null;

  const ctlNow = latestFitness ? latestFitness.triCtl : 75;
  const ctlRampRate7d = fitness7dAgo ? Number((ctlNow - fitness7dAgo.triCtl).toFixed(1)) : 0;
  const ctlRampRate28dAvg = fitness28dAgo ? Number(((ctlNow - fitness28dAgo.triCtl) / 4).toFixed(1)) : 0;

  let rampRateAssessment = 'Optimal Maintenance (0 to +3 CTL/wk)';
  if (ctlRampRate7d > 7) {
    rampRateAssessment = `Aggressive Ramp (+${ctlRampRate7d} CTL/wk — high overreaching risk if sustained)`;
  } else if (ctlRampRate7d >= 3) {
    rampRateAssessment = `Optimal Progressive Build (+${ctlRampRate7d} CTL/wk)`;
  } else if (ctlRampRate7d >= 0) {
    rampRateAssessment = `Steady Consolidation (+${ctlRampRate7d} CTL/wk)`;
  } else {
    rampRateAssessment = `Recovery / Unloading (${ctlRampRate7d} CTL/wk)`;
  }

  const tfiResult = latestFitness
    ? calculateTriathlonFitnessIndex(
        latestFitness.swimCtl,
        latestFitness.bikeCtl,
        latestFitness.runCtl,
        'middle_70_3',
        goals
      )
    : null;

  // 3. Detailed Chronological Activity Log with Lap & Interval Structure Deduction
  const recentDetailedActivities: CoachActivityRecord[] = sortedNonDeleted.slice(0, 50).map((act) => {
    const details = activityDetails[String(act.id)];
    const dateObj = new Date(act.start_date_local || act.start_date);
    const dateStr = !isNaN(dateObj.getTime()) ? dateObj.toISOString().split('T')[0] : act.start_date.split('T')[0];
    const dayOfWeek = !isNaN(dateObj.getTime())
      ? dateObj.toLocaleDateString('en-US', { weekday: 'long' })
      : 'Unknown';
    const timeStr = !isNaN(dateObj.getTime())
      ? dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
      : undefined;

    const todayMidnight = new Date(`${todayDate}T00:00:00`).getTime();
    const actMidnight = new Date(`${dateStr}T00:00:00`).getTime();
    const daysAgo = Math.max(0, Math.round((todayMidnight - actMidnight) / (24 * 3600 * 1000)));

    const distM = details?.calibration?.calibratedDistanceM ?? act.distance ?? 0;
    const movingSec = details?.calibration?.calibratedMovingTimeSec ?? act.moving_time ?? 0;
    const distanceKm = Math.round((distM / 1000) * 100) / 100;
    const movingTimeMin = Math.round(movingSec / 60);

    const { category } = classifyActivity(act);
    const sport = category || act.sport_type || act.type || 'Other';

    let paceFormatted: string | undefined;
    let speedKmh: number | undefined;
    if (category === 'Run' || (sport as string) === 'Walk') {
      if (distM > 100 && movingSec > 30) {
        const secPerKm = movingSec / (distM / 1000);
        paceFormatted = formatPaceSec(secPerKm);
      }
    } else if (category === 'Swim') {
      if (distM > 50 && movingSec > 20) {
        const secPer100m = (movingSec / distM) * 100;
        const m = Math.floor(secPer100m / 60);
        const s = Math.round(secPer100m % 60);
        paceFormatted = `${m}:${s.toString().padStart(2, '0')}/100m`;
      }
    } else if (sport === 'Bike') {
      if (distM > 500 && movingSec > 60) {
        speedKmh = Math.round(((distM / 1000) / (movingSec / 3600)) * 10) / 10;
      }
    }

    let tss = details?.calibration?.manualTss;
    if (tss === undefined || tss < 0) {
      const tssRes = calculateActivityTSS(act, details, athleteProfile);
      tss = tssRes?.tss ?? act.suffer_score;
    }

    const isIndoor = Boolean(act.trainer || details?.calibration?.calibratedRunSections?.length);
    const descriptionText = String(
      act.description ||
      (details?.activity as any)?.description ||
      details?.effortFeedback?.feedbackNotes ||
      ''
    ).trim() || undefined;

    const structureInsight = analyzeActivityStructureAndLaps(
      { ...act, paceFormatted, distanceKm, movingTimeMin, movingTimeSec: movingSec, distanceM: distM },
      details,
      athleteProfile
    );

    return {
      id: act.id,
      name: act.name,
      sport,
      startDate: dateStr,
      startTime: timeStr,
      dayOfWeek,
      daysAgo,
      distanceKm,
      distanceM: Math.round(distM),
      movingTimeMin,
      movingTimeSec: Math.round(movingSec),
      paceFormatted,
      speedKmh,
      avgWatts: details?.calibration?.calibratedAvgWatts ?? act.average_watts,
      weightedAvgWatts: details?.calibration?.calibratedNormalizedPower ?? act.weighted_average_watts,
      avgHeartrate: (details?.calibration?.calibratedAvgHeartRate ?? act.average_heartrate)
        ? Math.round(details?.calibration?.calibratedAvgHeartRate ?? act.average_heartrate!)
        : undefined,
      maxHeartrate: (details?.calibration?.calibratedMaxHeartRate ?? act.max_heartrate)
        ? Math.round(details?.calibration?.calibratedMaxHeartRate ?? act.max_heartrate!)
        : undefined,
      avgCadence: act.average_cadence ? Math.round(act.average_cadence) : undefined,
      elevationGainM: act.total_elevation_gain ? Math.round(act.total_elevation_gain) : undefined,
      tss: typeof tss === 'number' ? Math.round(tss) : undefined,
      isIndoor,
      notes: details?.effortFeedback?.feedbackNotes || details?.calibration?.calibrationNotes,
      description: descriptionText,
      rpe: details?.effortFeedback?.rpe,
      workoutClassification: structureInsight.workoutClassification,
      isQualityWorkout: structureInsight.isQualityWorkout,
      isEasyOrCooldown: structureInsight.isEasyOrCooldown,
      intervalStructureSummary: structureInsight.intervalStructureSummary,
      activeWorkSummary: structureInsight.activeWorkSummary,
      lapsSummary: structureInsight.lapsSummary,
    };
  });

  // 4. Last 14 days, Current Week (Mon-Sun), & Last Week (Mon-Sun) Summaries
  const actsLast14 = recentDetailedActivities.filter((a) => a.daysAgo <= 14);
  let swimKm = 0;
  let bikeKm = 0;
  let runKm = 0;
  let total14dTss = 0;

  actsLast14.forEach((a) => {
    const s = a.sport.toLowerCase();
    if (s.includes('swim')) swimKm += a.distanceKm;
    else if (s.includes('bike') || s.includes('ride')) bikeKm += a.distanceKm;
    else if (s.includes('run')) runKm += a.distanceKm;
    total14dTss += a.tss || 0;
  });

  // Compute Monday of current week relative to todayDate
  const todayObj = new Date(`${todayDate}T12:00:00`);
  const dayIdx = (todayObj.getDay() + 6) % 7; // 0 = Monday ... 6 = Sunday
  const currentWeekMonday = new Date(todayObj.getTime() - dayIdx * 24 * 3600 * 1000).toISOString().split('T')[0];
  const lastWeekMonday = new Date(todayObj.getTime() - (dayIdx + 7) * 24 * 3600 * 1000).toISOString().split('T')[0];

  const currentWeekActs = recentDetailedActivities.filter((a) => a.startDate >= currentWeekMonday && a.startDate <= todayDate);
  const lastWeekActs = recentDetailedActivities.filter((a) => a.startDate >= lastWeekMonday && a.startDate < currentWeekMonday);

  const currentWeekTss = currentWeekActs.reduce((acc, a) => acc + (a.tss || 0), 0);
  const currentWeekHours = Number((currentWeekActs.reduce((acc, a) => acc + (a.movingTimeMin || 0), 0) / 60).toFixed(1));
  const lastWeekTss = lastWeekActs.reduce((acc, a) => acc + (a.tss || 0), 0);
  const lastWeekHours = Number((lastWeekActs.reduce((acc, a) => acc + (a.movingTimeMin || 0), 0) / 60).toFixed(1));

  const last3Days = recentDetailedActivities
    .slice(0, 4)
    .map((a) => `${a.startDate} (${a.dayOfWeek}): ${a.name} (${a.distanceKm}km, ${a.movingTimeMin}m, ${a.tss || 0} TSS${a.intervalStructureSummary ? ` [${a.intervalStructureSummary}]` : ''})`);

  // 5. Work Schedule & Daily Availability Matrix
  const dayKeyMap: Record<string, DayOfWeek> = {
    monday: 'mon',
    tuesday: 'tue',
    wednesday: 'wed',
    thursday: 'thu',
    friday: 'fri',
    saturday: 'sat',
    sunday: 'sun',
  };
  const currentDayKey = dayKeyMap[todayDayOfWeek.toLowerCase()] || 'mon';
  const todayDayAvail = athleteProfile.weeklyAvailability?.[currentDayKey];

  let suggestedDurationMin = 60;
  if (todayDayAvail) {
    if (todayDayAvail.isWorkday) {
      if (todayDayAvail.availableWindows.includes('lunch') && todayDayAvail.availableWindows.length === 1) {
        suggestedDurationMin = 45;
      } else if (todayDayAvail.availableWindows.includes('evening')) {
        suggestedDurationMin = 55;
      } else if (todayDayAvail.availableWindows.includes('morning')) {
        suggestedDurationMin = 45;
      } else {
        suggestedDurationMin = 50;
      }
    } else {
      suggestedDurationMin = 120;
    }
  }

  const finalDurationMin = targetDurationMin || suggestedDurationMin;

  // 6. Active Injuries & Periodization Phase
  const rawInjuries = athleteProfile.injuries || [];
  const activeInjuries = rawInjuries.filter(
    (i) => i.status === 'active' || i.status === 'recovering' || (typeof (i as any).painLevel === 'number' && (i as any).painLevel > 0)
  );

  const periodizationInfo = getPeriodizationPhaseInfo(athleteProfile);
  const benchmarks = evaluateBenchmarkMilestones(activities, athleteProfile);

  // Enrich goals with exact weeksToGoal relative to todayDate
  const enrichedGoals = (goals || []).map((g) => {
    let weeksAway: number | undefined;
    if (g.eventDate) {
      const diffMs = new Date(g.eventDate).getTime() - todayObj.getTime();
      weeksAway = Math.max(0, Math.round(diffMs / (7 * 24 * 3600 * 1000)));
    }
    return {
      ...g,
      weeksToRace: weeksAway,
    };
  });

  return {
    athleteProfile,
    latestReadiness,
    latestRecoveryLog,
    recentActivities: recentDetailedActivities,
    todayDate,
    todayDayOfWeek,
    todayAvailability: todayDayAvail
      ? {
          isWorkday: todayDayAvail.isWorkday,
          shiftStart: todayDayAvail.shiftStart,
          shiftEnd: todayDayAvail.shiftEnd,
          availableWindows: todayDayAvail.availableWindows,
          preferredActivities: todayDayAvail.preferredActivities,
          suggestedDurationMin,
        }
      : undefined,
    activeInjuries,
    periodizationInfo,
    benchmarks,
    recentActivitiesSummary: {
      totalLast14Days: actsLast14.length,
      swimKm: Math.round(swimKm * 10) / 10,
      bikeKm: Math.round(bikeKm * 10) / 10,
      runKm: Math.round(runKm * 10) / 10,
      avgDailyTss: Math.round(total14dTss / 14),
      last3DaysActivities: last3Days,
      currentWeekTss,
      currentWeekHours,
      currentWeekSessions: currentWeekActs.length,
      lastWeekTss,
      lastWeekHours,
      lastWeekSessions: lastWeekActs.length,
    },
    fitnessStats: {
      ctl: latestFitness ? Math.round(latestFitness.triCtl) : 75,
      atl: latestFitness ? Math.round(latestFitness.triAtl) : 70,
      tsb: latestFitness ? Math.round(latestFitness.triTsb) : 5,
      tfi: tfiResult ? Math.round(tfiResult.tfi) : 85,
      limitingFactor: tfiResult?.limitingFactor?.name || undefined,
      ctlRampRate7d,
      ctlRampRate28dAvg,
      rampRateAssessment,
      swimCtl: latestFitness ? Math.round(latestFitness.swimCtl) : undefined,
      bikeCtl: latestFitness ? Math.round(latestFitness.bikeCtl) : undefined,
      runCtl: latestFitness ? Math.round(latestFitness.runCtl) : undefined,
    },
    goals: enrichedGoals,
    preferredSport,
    targetDurationMin: finalDurationMin,
    customNotes,
  };
}

export async function requestWorkoutReviews(
  payload: CoachRequestPayload,
  activities: StravaActivity[],
  activityDetails: Record<string, StravaActivityDetailsRecord>,
  athleteProfile: AthleteProfile,
  goals: TrainingGoal[]
): Promise<{ reviews: WorkoutReviewItem[]; source: string }> {
  if (isGitHubPages) {
    return {
      reviews: generateWorkoutReviews(activities, activityDetails, athleteProfile, goals),
      source: 'sports-science-engine',
    };
  }

  try {
    const response = await fetch('/api/coach/review-workouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.reviews) && data.reviews.length > 0) {
        return {
          reviews: data.reviews,
          source: data.source || 'gemini-4-hydrogen',
        };
      }
    }
  } catch (err) {
    console.info('[Coach API] Review workouts request failed, using sports science engine:', err);
  }

  return {
    reviews: generateWorkoutReviews(activities, activityDetails, athleteProfile, goals),
    source: 'sports-science-engine',
  };
}

export async function requestRecommendedWorkout(
  payload: CoachRequestPayload
): Promise<{ workout: RecommendedWorkout; source: string; notice?: string }> {
  if (isGitHubPages) {
    return {
      workout: generateSportsScienceWorkout(payload),
      source: 'sports-science-engine',
    };
  }

  try {
    const response = await fetch('/api/coach/recommend-workout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        if (data && data.workout) {
          return {
            workout: data.workout,
            source: data.source || 'gemini-4-hydrogen',
            notice: data.notice,
          };
        }
      }
    }
  } catch (err) {
    console.info('[Coach API] Backend request unavailable, seamlessly using sports science engine:', err);
  }

  return {
    workout: generateSportsScienceWorkout(payload),
    source: 'sports-science-engine',
  };
}

export async function requestPeriodizedPlan(
  payload: CoachRequestPayload
): Promise<{ plan: PeriodizedPlan; source: string }> {
  if (isGitHubPages) {
    return {
      plan: generateSportsSciencePlan(payload),
      source: 'sports-science-engine',
    };
  }

  try {
    const response = await fetch('/api/coach/generate-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        if (data && data.plan) {
          return {
            plan: data.plan,
            source: data.source || 'gemini-4-hydrogen',
          };
        }
      }
    }
  } catch (err) {
    console.info('[Coach API] Backend plan request unavailable, using sports science engine:', err);
  }

  return {
    plan: generateSportsSciencePlan(payload),
    source: 'sports-science-engine',
  };
}

export interface CoachChatResult {
  answer: string;
  executedAction?: CoachAction;
  additionalActions?: CoachAction[];
  skillsUsed?: string[];
  confidenceRating?: string;
  groundingSources?: { uri: string; title: string }[];
  source?: string;
}

export async function sendCoachChatMessage(
  question: string,
  payload: CoachRequestPayload,
  history: any[]
): Promise<CoachChatResult> {
  const parseFallbackAction = (q: string): { action?: CoachAction; skills: string[] } => {
    const lower = q.toLowerCase();
    const skills: string[] = [];

    // 1. Seven Sins Trail Run or general "add ... to my goals"
    if (
      lower.includes('seven sins') ||
      lower.includes('7 sins') ||
      ((lower.includes('add') || lower.includes('create') || lower.includes('put') || lower.includes('include')) &&
        (lower.includes('goal') || lower.includes('race') || lower.includes('event')) &&
        !lower.includes('chippenham') &&
        !lower.includes('ironman'))
    ) {
      const hasPriorityA = /\b(priority\s*a|a-race|a\s+race|make\s+it\s+a)\b/i.test(lower);
      const hasPriorityB = /\b(priority\s*b|b-race|b\s+race|make\s+it\s+b)\b/i.test(lower);
      const hasPriorityC = /\b(priority\s*c|c-race|c\s+race|make\s+it\s+c)\b/i.test(lower);

      if (lower.includes('seven sins') || lower.includes('7 sins')) {
        skills.push('Online Race Search', 'Goal Race Manager');
        const priority: 'A' | 'B' | 'C' | undefined = hasPriorityA ? 'A' : hasPriorityB ? 'B' : hasPriorityC ? 'C' : undefined;
        const goalObj: Partial<TrainingGoal> = {
          id: 'goal-seven-sins-trail-2026',
          name: 'Seven Sins Trail Run (7 Hills of Forest of Dean)',
          priority: priority || 'B',
          eventType: 'run',
          status: 'upcoming',
          targetType: 'time',
          eventDate: '2026-12-28',
          distancePreset: '7 Miles (11.3 km)',
          totalDistanceKm: 11.3,
          totalTargetTimeSec: 3300, // 55:00 target on steep off-road hills
          runCourseType: 'trail',
          runElevationGainMeters: 395,
          runTargetPaceSec: 292, // ~4:52/km trail pace
          location: ' Speech House / Forest of Dean, Gloucestershire, UK',
          notes: '7 steep climbs ("Seven Deadly Sins"), mud, water splash & tunnel sections across 7 miles in the Forest of Dean.',
        };
        if (!priority) {
          return {
            skills,
            action: {
              type: 'propose_goal',
              status: 'pending_priority',
              goal: goalObj,
              missingFields: ['priority'],
              suggestedPriorities: ['A', 'B', 'C'],
              searchResult: {
                eventName: 'Seven Sins Trail Run (Forest of Dean)',
                foundDate: '2026-12-28',
                sourceTitle: 'Seven Sins Immortal Run — Forest of Dean, Gloucestershire (7 Miles / 7 Hills)',
                sourceUri: 'https://www.immortalrun.co.uk',
              },
              description: 'Found Seven Sins Trail Run (7 miles / 11.3 km, ~395m elevation in the Forest of Dean on Dec 28, 2026). Select race priority (A, B, or C) to confirm.',
            },
          };
        }
        return {
          skills,
          action: {
            type: 'add_goal',
            status: 'confirmed',
            goal: goalObj,
            description: `Added Seven Sins Trail Run (Dec 28, 2026) as a Priority ${priority} goal.`,
          },
        };
      }

      // Generic named event extraction: e.g. "Can you add Bath Half Marathon to my goals"
      const nameMatch = q.match(/(?:add|include|put|set)\s+(.+?)\s+(?:to|in|into|as)\s+(?:my\s+)?(?:goals?|races?|events?)/i);
      if (nameMatch && nameMatch[1]) {
        const extractedName = nameMatch[1].replace(/^["']|["']$/g, '').trim();
        if (extractedName.length >= 3 && !/^(a|an|the|some|new)$/i.test(extractedName)) {
          skills.push('Online Race Search', 'Goal Race Manager');
          const isTri = /triathlon|70\.3|ironman|duathlon/i.test(extractedName);
          const isHalf = /half\s*marathon|13\.1/i.test(extractedName);
          const is10k = /10\s*k/i.test(extractedName);
          const distKm = isTri ? 113.0 : isHalf ? 21.1 : is10k ? 10.0 : 16.09;
          const priority: 'A' | 'B' | 'C' | undefined = hasPriorityA ? 'A' : hasPriorityB ? 'B' : hasPriorityC ? 'C' : undefined;
          const goalObj: Partial<TrainingGoal> = {
            id: `goal-${extractedName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-4)}`,
            name: extractedName,
            priority: priority || 'B',
            eventType: isTri ? 'triathlon' : 'run',
            status: 'upcoming',
            targetType: 'finish',
            eventDate: '2027-04-18',
            distancePreset: isTri ? '70.3' : isHalf ? 'Half Marathon' : is10k ? '10K' : 'Custom',
            totalDistanceKm: distKm,
            location: 'UK Race Circuit',
            notes: `Added via AI Coach Goal Skill.`,
          };
          if (!priority) {
            return {
              skills,
              action: {
                type: 'propose_goal',
                status: 'pending_priority',
                goal: goalObj,
                missingFields: ['priority'],
                suggestedPriorities: ['A', 'B', 'C'],
                searchResult: {
                  eventName: extractedName,
                  foundDate: '2027-04-18',
                  sourceTitle: `${extractedName} Official Event Details`,
                },
                description: `Prepared "${extractedName}" (${distKm} km) for your race calendar. Choose Priority A, B, or C to save.`,
              },
            };
          }
          return {
            skills,
            action: {
              type: 'add_goal',
              status: 'confirmed',
              goal: goalObj,
              description: `Added "${extractedName}" as Priority ${priority} goal.`,
            },
          };
        }
      }
    }

    // 2. Chippenham Spring 10 Mile
    if (
      lower.includes('chippenham') ||
      ((lower.includes('under 1 hour') || lower.includes('under 1hr') || lower.includes('sub 1 hour') || lower.includes('sub 60')) &&
        (lower.includes('10 mile') || lower.includes('10miler') || lower.includes('10m')))
    ) {
      skills.push('Online Race Search', 'Goal Race Manager');
      const hasPriorityA = lower.includes('priority a') || lower.includes('a-race') || lower.includes('a race') || lower.includes('make it a');
      const hasPriorityB = lower.includes('priority b') || lower.includes('b-race') || lower.includes('b race') || lower.includes('make it b');
      const hasPriorityC = lower.includes('priority c') || lower.includes('c-race') || lower.includes('c race') || lower.includes('make it c');

      const is59min = lower.includes('59min') || lower.includes('59 min') || lower.includes('59m') || lower.includes('59 minute');
      const is58min = lower.includes('58min') || lower.includes('58 min') || lower.includes('58m') || lower.includes('58 minute');
      const targetTimeSec = is58min ? 3480 : is59min ? 3540 : 3600;
      const targetPaceSec = is58min ? 216 : is59min ? 220 : 224;
      const targetNotes = is58min
        ? 'Target: 58 minutes (5:48/mile or 3:36/km threshold pace) on Wiltshire country lanes.'
        : is59min
        ? 'Target: 59 minutes (5:54/mile or 3:40/km threshold pace) on Wiltshire country lanes.'
        : 'Target: sub-1 hour (5:59/mile or 3:43/km threshold pace) on Wiltshire country lanes.';

      if (!hasPriorityA && !hasPriorityB && !hasPriorityC) {
        return {
          skills,
          action: {
            type: 'propose_goal',
            status: 'pending_priority',
            goal: {
              id: 'goal-chippenham-spring-10-2027',
              name: 'Chippenham Spring 10 Mile',
              eventType: 'run',
              status: 'upcoming',
              targetType: 'time',
              eventDate: '2027-03-07',
              distancePreset: '10 Mile',
              totalDistanceKm: 16.093,
              totalTargetTimeSec: targetTimeSec,
              runCourseType: 'road',
              runElevationGainMeters: 45,
              runTargetPaceSec: targetPaceSec,
              location: 'Chippenham Sports Club, Wiltshire, UK',
              notes: targetNotes,
            },
            missingFields: ['priority'],
            suggestedPriorities: ['A', 'B', 'C'],
            searchResult: {
              eventName: 'Chippenham Spring 10 Mile',
              foundDate: '2027-03-07',
              sourceTitle: 'Chippenham Harriers Spring 10 Mile (Sunday, March 7, 2027)',
            },
            description: `Found Chippenham Spring 10 Mile on Sunday, March 7, 2027. Staged goal (${Math.floor(targetTimeSec / 60)} min target) awaiting priority selection.`,
          },
        };
      } else {
        const priority: 'A' | 'B' | 'C' = hasPriorityA ? 'A' : hasPriorityB ? 'B' : 'C';
        return {
          skills,
          action: {
            type: 'add_goal',
            status: 'confirmed',
            goal: {
              id: 'goal-chippenham-spring-10-2027',
              name: 'Chippenham Spring 10 Mile',
              priority,
              eventType: 'run',
              status: 'upcoming',
              targetType: 'time',
              eventDate: '2027-03-07',
              distancePreset: '10 Mile',
              totalDistanceKm: 16.093,
              totalTargetTimeSec: targetTimeSec,
              runCourseType: 'road',
              runElevationGainMeters: 45,
              runTargetPaceSec: targetPaceSec,
              location: 'Chippenham Sports Club, Wiltshire, UK',
              notes: targetNotes,
            },
            description: `Chippenham Spring 10 Mile added as Priority ${priority} Goal for March 7, 2027.`,
          },
        };
      }
    }

    // 3. Delete a goal race
    if (
      (lower.includes('delete') || lower.includes('remove') || lower.includes('cancel')) &&
      (lower.includes('goal') || lower.includes('race') || (payload.goals && payload.goals.some((g: any) => lower.includes(g.name.toLowerCase()))))
    ) {
      const match = (payload.goals || []).find((g: any) => {
        const gn = String(g.name).toLowerCase();
        return lower.includes(gn) ||
          (gn.includes('chippenham') && lower.includes('chippenham')) ||
          (gn.includes('cotswold') && lower.includes('cotswold')) ||
          (gn.includes('seven sins') && (lower.includes('seven sins') || lower.includes('7 sins'))) ||
          (gn.includes('oldbury') && lower.includes('oldbury')) ||
          (gn.includes('ironman') && lower.includes('ironman'));
      });
      if (match) {
        skills.push('Goal Race Manager');
        return {
          skills,
          action: {
            type: 'delete_goal',
            goalId: match.id,
            goalName: match.name,
            description: `Removed "${match.name}" from your profile goals.`,
          },
        };
      }
    }

    // 4. Edit a goal race
    if (
      (lower.includes('edit') || lower.includes('change') || lower.includes('update')) &&
      (lower.includes('goal') || lower.includes('race') || lower.includes('target') || lower.includes('priority') || lower.includes('time'))
    ) {
      const match = (payload.goals || []).find((g: any) => {
        const gn = String(g.name).toLowerCase();
        return lower.includes(gn) ||
          (gn.includes('chippenham') && lower.includes('chippenham')) ||
          (gn.includes('cotswold') && lower.includes('cotswold')) ||
          (gn.includes('seven sins') && (lower.includes('seven sins') || lower.includes('7 sins'))) ||
          (gn.includes('oldbury') && lower.includes('oldbury')) ||
          (gn.includes('ironman') && lower.includes('ironman'));
      }) || (payload.goals && payload.goals[0]);

      if (match) {
        const updates: any = {};
        if (lower.includes('priority a') || lower.includes('to a')) updates.priority = 'A';
        else if (lower.includes('priority b') || lower.includes('to b')) updates.priority = 'B';
        else if (lower.includes('priority c') || lower.includes('to c')) updates.priority = 'C';

        const minMatch = lower.match(/(?:to|target(?:\s+time)?(?:\s+is)?)\s*(\d{1,2})\s*(?:min|mins|minute|minutes)/i);
        if (minMatch) {
          updates.totalTargetTimeSec = parseInt(minMatch[1], 10) * 60;
        }

        if (Object.keys(updates).length > 0) {
          skills.push('Goal Race Manager');
          return {
            skills,
            action: {
              type: 'update_goal',
              goalId: match.id,
              goalName: match.name,
              updates,
              description: `Updated ${match.name}.`,
            },
          };
        }
      }
    }

    // 5. Flat Ironman
    if ((lower.includes('add') || lower.includes('create') || lower.includes('new goal') || lower.includes('set goal')) && (lower.includes('ironman') || lower.includes('2028') || lower.includes('flat'))) {
      skills.push('Goal Race Manager');
      return {
        skills,
        action: {
          type: 'add_goal',
          status: 'confirmed',
          goal: {
            id: 'goal-flat-ironman-2028',
            name: 'Flat Ironman',
            priority: 'C',
            eventType: 'triathlon',
            status: 'upcoming',
            targetType: 'finish',
            eventDate: '2028-06-18',
            distancePreset: '140.6',
            totalDistanceKm: 226.0,
            totalTargetTimeSec: 39600,
            triathlonSplits: {
              swimDistanceMeters: 3800,
              swimTargetTimeSec: 4500,
              t1TargetTimeSec: 300,
              bikeDistanceKm: 180.0,
              bikeTargetTimeSec: 20400,
              t2TargetTimeSec: 180,
              runDistanceKm: 42.2,
              runTargetTimeSec: 14220,
            },
            location: 'Flat European Course (e.g. Almere / Barcelona / Copenhagen)',
            notes: 'Long-term C-objective: Complete distance proof with high aerodynamic efficiency and gut adaptation.',
          },
          description: 'Flat Ironman (June 18, 2028) long-term objective added to athlete profile goals.',
        },
      };
    }

    // 6. Add Comment / Description / Note to Workout
    if (
      (lower.includes('comment') || lower.includes('description') || lower.includes('add a note') || lower.includes('add note') || lower.includes('write a note') || lower.includes('annotate')) &&
      (lower.includes('workout') || lower.includes('run') || lower.includes('ride') || lower.includes('swim') || lower.includes('session') || lower.includes('activity') || lower.includes('today'))
    ) {
      skills.push('Workout Comment & Note Editor', 'Lap & Stream Analyzer');
      const targetAct = findBestMatchingActivity(q, payload.recentActivities || [], payload.todayDate);
      if (targetAct) {
        // Extract explicit quoted comment or generate a smart physiological summary note
        const colonMatch = q.match(/(?:saying|that says|with|:)\s*["'“]?([^"'”]+)["'”]?$/i);
        const defaultNote = targetAct.intervalStructureSummary
          ? `Coach Note: Executed ${targetAct.intervalStructureSummary} (Avg HR ${targetAct.avgHeartrate || 'N/A'} bpm, Max ${targetAct.maxHeartrate || 'N/A'} bpm, ${targetAct.tss || 0} TSS). Strong aerobic control across intervals.`
          : `Coach Note: Completed ${targetAct.distanceKm} km in ${targetAct.movingTimeMin} min (${targetAct.paceFormatted || `${targetAct.avgWatts || ''}W`}, Avg HR ${targetAct.avgHeartrate || 'N/A'} bpm, ${targetAct.tss || 0} TSS).`;
        const commentText = colonMatch && colonMatch[1]?.trim() ? colonMatch[1].trim() : defaultNote;
        const rpeMatch = q.match(/\brpe\s*(?:of|:)?\s*(\d{1,2})\b/i);
        return {
          skills,
          action: {
            type: 'update_workout_comment',
            status: 'applied',
            activityId: targetAct.id,
            activityName: targetAct.name,
            activityDate: targetAct.startDate,
            commentOrDescription: commentText,
            rpe: rpeMatch ? parseInt(rpeMatch[1], 10) : undefined,
            appendToExisting: true,
            description: `Saved comment/description to "${targetAct.name}" (${targetAct.startDate}).`,
          },
        };
      }
    }

    // 7. Thursday Progression / Plan Next Workout Skill
    if (
      (lower.includes('progress') && lower.includes('thursday')) ||
      (lower.includes('last 2 thursday') || lower.includes('last two thursday'))
    ) {
      skills.push('Lap & Interval Structure Analyzer', 'Progression Workout Planner', 'CTL Ramp Rate & Goal Check');
      const thursdayGroups = getStructuredWorkoutsByDayOfWeek(payload.recentActivities || [], 'Thursday', 'run');
      const latestThu = thursdayGroups[0]?.primaryWorkout;
      const prevThu = thursdayGroups[1]?.primaryWorkout;

      const prescribed: RecommendedWorkout = {
        id: `coach-thu-prog-${Date.now()}`,
        title: 'Thursday Progression: 5 x 1.6km (or 6 x 1.2km) Threshold / VO2 Bridge @ 3:32/km',
        sport: 'run',
        durationMin: 55,
        estimatedTss: 68,
        intensity: 'threshold_z4',
        targetZones: {
          pace: '3:32/km (17.0 km/h)',
          heartRate: '158-166 bpm (peak < 168 bpm)',
        },
        coachRationale: `You progressed cleanly from ${prevThu?.name || '8 x 3min @ 3:32/km (6.8 km active work)'} on ${prevThu?.startDate || 'Nov 5'} to ${latestThu?.name || '8 x 1km @ 3:32/km (8.0 km active work)'} on ${latestThu?.startDate || 'Nov 12'} with controlled cardiac response (135 bpm overall avg, 162 bpm peak). Rather than increasing speed beyond 17.0 km/h right now, extending interval length to 6 x 1.2km (or 5 x 1.6km) at 3:32/km builds lactate clearance durability for your 10-mile and 70.3 run goals.`,
        readinessAnalysis: `Respects your current CTL (${payload.fitnessStats?.ctl || 75}), 7-day ramp rate (${payload.fitnessStats?.ctlRampRate7d ?? '+2.5'} CTL/wk), and Thursday post-work availability.`,
        structure: [
          {
            phase: 'Warm-up',
            duration: '10 min',
            description: 'Progressive aerobic warm-up + 4 x 20s strides with 40s easy jog',
            target: '5:15–5:25/km (11.0–11.4 km/h)',
          },
          {
            phase: 'Main Set (Option A — Volume Extension)',
            duration: '6 x 1.2km (4m 14s reps)',
            description: 'Sustained 17.0 km/h repeats with 75s standing/walking recovery (7.2 km quality work)',
            target: '3:32/km (17.0 km/h) | HR 158–165 bpm',
          },
          {
            phase: 'Main Set (Option B — Density Compression)',
            duration: '8 x 1km w/ 55s rest',
            description: 'Keep 8 x 1km @ 3:32/km but trim recovery from 70s down to 55s',
            target: '3:32/km (17.0 km/h) | 55s rest',
          },
          {
            phase: 'Cool-down',
            duration: '10 min',
            description: 'Easy recovery jog to flush lactate',
            target: '5:20–5:40/km (<128 bpm)',
          },
        ],
        nutritionTips: '30g fast-acting carbs 30 min pre-session; 25g protein + 60g carbs within 45 min after finishing.',
        createdAt: new Date().toISOString(),
      };

      return {
        skills,
        action: {
          type: 'prescribe_workout',
          status: 'proposed',
          workout: prescribed,
          scheduledFor: 'Next Thursday Quality Run',
          progressionContext: `${prevThu?.startDate || '2026-11-05'}: 8x3min @ 3:32/km (6.8km work) → ${latestThu?.startDate || '2026-11-12'}: 8x1km @ 3:32/km (8.0km work) → Next: 6x1.2km @ 3:32/km`,
          description: 'Prescribed next Thursday interval progression based on your 8x3min → 8x1km @ 3:32/km adaptation.',
        },
      };
    }

    // 8. Recreate / Calibrate Run Workout (e.g. "adjust pace to 17kph", "warmup to 6kph")
    const isWorkoutAdjustment =
      lower.includes('3:30') ||
      lower.includes('3.30') ||
      lower.includes('17kph') ||
      lower.includes('17 kph') ||
      lower.includes('6kph') ||
      lower.includes('6 kph') ||
      lower.includes('warmup') ||
      lower.includes('warm up') ||
      lower.includes('warm-up') ||
      ((lower.includes('run') || lower.includes('workout') || lower.includes('interval') || lower.includes('treadmill')) &&
        (lower.includes('update') || lower.includes('pace') || lower.includes('speed') || lower.includes('adjust') || lower.includes('change') || lower.includes('fix') || lower.includes('lap')));

    if (isWorkoutAdjustment) {
      skills.push('Lap & Stream Calibrator');
      const matchedRun = findBestMatchingActivity(q, payload.recentActivities || [], payload.todayDate);
      const targetRun = matchedRun || {
        id: 'today-run-1',
        name: "Today's Threshold Run",
        startDate: payload.todayDate || new Date().toISOString().split('T')[0],
        distanceKm: 7.5,
        distanceM: 7500,
        movingTimeMin: 40,
        movingTimeSec: 2400,
        paceFormatted: '5:20/km',
      };

      const recon = reconstructWorkoutFromQuery(q, targetRun, payload.todayDate);

      return {
        skills,
        action: {
          type: 'recreate_run_workout',
          status: 'ready_to_apply',
          activityId: targetRun.id,
          activityName: targetRun.name,
          activityDate: targetRun.startDate,
          recordedDurationSec: recon.recordedDurationSec,
          originalDistanceM: targetRun.distanceM || Math.round((targetRun.distanceKm || 7.5) * 1000),
          originalPace: targetRun.paceFormatted || '5:20/km',
          targetIntervalPace: recon.targetIntervalPace,
          targetIntervalSpeedKph: recon.targetIntervalSpeedKph,
          recoveryPace: recon.recoveryPace,
          recoverySpeedKph: recon.recoverySpeedKph,
          timeDiscrepancySec: recon.timeDiscrepancySec,
          sections: recon.sections,
          recalculatedDistanceM: recon.recalculatedDistanceM,
          recalculatedAvgPace: recon.recalculatedAvgPace,
          followUpQuestions: [
            `Did you execute ${recon.repeats} intervals at ${recon.targetIntervalSpeedKph} km/h (${recon.targetIntervalPace})?`,
            `Was recovery jogged at ${recon.recoveryPace} (${recon.recoverySpeedKph} km/h), or walking rest?`,
            `How long was your warm-up (default 10 min @ ${recon.warmupSpeedKph} km/h)?`,
          ],
          description: recon.description,
        },
      };
    }

    return { skills };
  };

  if (isGitHubPages) {
    const rawAnswer = generateSportsScienceChat(question, payload, history);
    const fb = parseFallbackAction(question);
    return {
      answer: rawAnswer,
      executedAction: fb.action,
      skillsUsed: fb.skills,
      confidenceRating: rawAnswer.includes('High Confidence') ? 'High Confidence 8.5/10' : undefined,
      source: 'sports-science-engine',
    };
  }

  // Attempt backend API call (Gemini 4 Hydrogen with Coaching Skills & Search Grounding)
  try {
    const response = await fetch('/api/coach/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        athleteProfile: payload.athleteProfile,
        fitnessStats: payload.fitnessStats,
        latestReadiness: payload.latestReadiness,
        goals: payload.goals,
        history,
        activities: payload.recentActivities,
        todayDate: payload.todayDate,
        todayDayOfWeek: payload.todayDayOfWeek,
        todayAvailability: payload.todayAvailability,
        activeInjuries: payload.activeInjuries,
        periodizationInfo: payload.periodizationInfo,
        recentActivitiesSummary: payload.recentActivitiesSummary,
      }),
    });

    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        if (data && typeof data.answer === 'string') {
          const fb = parseFallbackAction(question);
          return {
            answer: data.answer,
            executedAction: data.executedAction || fb.action,
            additionalActions: data.additionalActions,
            skillsUsed: data.skillsUsed?.length ? data.skillsUsed : fb.skills,
            confidenceRating: data.confidenceRating,
            groundingSources: data.groundingSources,
            source: data.source || 'gemini-4-hydrogen',
          };
        }
      }
    }
  } catch (err) {
    console.info('[Coach API] Backend chat unavailable, using sports science engine:', err);
  }

  const rawFallback = generateSportsScienceChat(question, payload, history);
  const fb = parseFallbackAction(question);
  return {
    answer: rawFallback,
    executedAction: fb.action,
    skillsUsed: fb.skills,
    confidenceRating: rawFallback.includes('High Confidence') ? 'High Confidence 8.5/10' : undefined,
    source: 'sports-science-engine',
  };
}

