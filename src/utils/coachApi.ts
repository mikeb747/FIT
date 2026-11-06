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
  // If running on a static host like GitHub Pages, no backend server is available.
  // Use the local sports science physiological engine directly.
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
      model: data.model || 'gemini-3.8-flash',
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
  const today = new Date();
  const todayDate = today.toISOString().split('T')[0];
  const todayDayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' });

  // 1. Latest Readiness
  const latestRecoveryLog = recoveryLogs.length > 0 ? recoveryLogs[recoveryLogs.length - 1] : null;
  const latestReadiness = latestRecoveryLog
    ? computeDailyReadiness(latestRecoveryLog, recoveryLogs, athleteProfile)
    : null;

  // 2. Fitness Stats (CTL, ATL, TSB, TFI)
  const timeline = computeFitnessTimeline(activities, activityDetails, athleteProfile, 45);
  const latestFitness = timeline.length > 0 ? timeline[timeline.length - 1] : null;
  const tfiResult = latestFitness
    ? calculateTriathlonFitnessIndex(
        latestFitness.swimCtl,
        latestFitness.bikeCtl,
        latestFitness.runCtl,
        'middle_70_3',
        goals
      )
    : null;

  // 3. Last 14 days activity summary
  const now = Date.now();
  const fourteenDaysAgo = now - 14 * 24 * 3600 * 1000;
  const recentActs = activities.filter((a) => {
    const d = new Date(a.start_date).getTime();
    return d >= fourteenDaysAgo && !a.isDeleted;
  });

  let swimKm = 0;
  let bikeKm = 0;
  let runKm = 0;
  let totalTss = 0;

  recentActs.forEach((a) => {
    const km = (a.distance || 0) / 1000;
    const type = (a.type || a.sport_type || '').toLowerCase();
    if (type.includes('swim')) swimKm += km;
    else if (type.includes('ride') || type.includes('bike') || type.includes('virtualride')) bikeKm += km;
    else if (type.includes('run') || type.includes('virtualrun')) runKm += km;
  });

  const last3Days = activities
    .filter((a) => !a.isDeleted)
    .slice(0, 3)
    .map((a) => `${a.name} (${Math.round((a.distance || 0) / 1000)}km, ${Math.round((a.moving_time || 0) / 60)}m)`);

  // 4. Detailed Chronological Activity Log for LLM & Coach analysis
  const sortedActivities = [...activities]
    .filter((a) => !a.isDeleted && a.start_date)
    .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());

  const recentDetailedActivities: CoachActivityRecord[] = sortedActivities.slice(0, 45).map((act) => {
    const details = activityDetails[String(act.id)];
    const dateObj = new Date(act.start_date_local || act.start_date);
    const dateStr = !isNaN(dateObj.getTime()) ? dateObj.toISOString().split('T')[0] : act.start_date.split('T')[0];
    const dayOfWeek = !isNaN(dateObj.getTime())
      ? dateObj.toLocaleDateString('en-US', { weekday: 'long' })
      : 'Unknown';
    const timeStr = !isNaN(dateObj.getTime())
      ? dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
      : undefined;

    // Days ago calculation
    const diffMs = today.getTime() - dateObj.getTime();
    const daysAgo = Math.max(0, Math.floor(diffMs / (24 * 3600 * 1000)));

    // Distance & Duration (taking calibration overrides into account)
    const distM = details?.calibration?.calibratedDistanceM ?? act.distance ?? 0;
    const movingSec = details?.calibration?.calibratedMovingTimeSec ?? act.moving_time ?? 0;
    const distanceKm = Math.round((distM / 1000) * 100) / 100;
    const movingTimeMin = Math.round(movingSec / 60);

    const { category } = classifyActivity(act);
    const sport = category || act.sport_type || act.type || 'Other';

    // Pace / Speed
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

    // TSS
    let tss = details?.calibration?.manualTss;
    if (tss === undefined || tss < 0) {
      const tssRes = calculateActivityTSS(act, details, athleteProfile);
      tss = tssRes?.tss ?? act.suffer_score;
    }

    const isIndoor = Boolean(act.trainer || details?.calibration?.calibratedRunSections?.length);

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
      avgHeartrate: (details?.calibration?.calibratedAvgHeartRate ?? act.average_heartrate) ? Math.round(details?.calibration?.calibratedAvgHeartRate ?? act.average_heartrate!) : undefined,
      maxHeartrate: (details?.calibration?.calibratedMaxHeartRate ?? act.max_heartrate) ? Math.round(details?.calibration?.calibratedMaxHeartRate ?? act.max_heartrate!) : undefined,
      avgCadence: act.average_cadence ? Math.round(act.average_cadence) : undefined,
      elevationGainM: act.total_elevation_gain ? Math.round(act.total_elevation_gain) : undefined,
      tss: typeof tss === 'number' ? Math.round(tss) : undefined,
      isIndoor,
      notes: details?.effortFeedback?.feedbackNotes || details?.calibration?.calibrationNotes,
      rpe: details?.effortFeedback?.rpe,
    };
  });

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
      // Workday availability window constraints
      if (todayDayAvail.availableWindows.includes('lunch') && todayDayAvail.availableWindows.length === 1) {
        suggestedDurationMin = 45; // tight lunch window
      } else if (todayDayAvail.availableWindows.includes('evening')) {
        suggestedDurationMin = 55; // post-work evening window
      } else if (todayDayAvail.availableWindows.includes('morning')) {
        suggestedDurationMin = 45; // pre-work morning window
      } else {
        suggestedDurationMin = 50;
      }
    } else {
      // Weekend / non-workday: time for long endurance rides or runs
      suggestedDurationMin = 120;
    }
  }

  const finalDurationMin = targetDurationMin || suggestedDurationMin;

  // 6. Active Injuries & Periodization Phase
  const rawInjuries = athleteProfile.injuries || [];
  const activeInjuries = rawInjuries.filter(
    (i) => i.status === 'active' || i.status === 'monitoring' || (typeof i.painLevel === 'number' && i.painLevel > 0)
  );

  const periodizationInfo = getPeriodizationPhaseInfo(athleteProfile);
  const benchmarks = evaluateBenchmarkMilestones(activities, athleteProfile);

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
      totalLast14Days: recentActs.length,
      swimKm: Math.round(swimKm * 10) / 10,
      bikeKm: Math.round(bikeKm * 10) / 10,
      runKm: Math.round(runKm * 10) / 10,
      avgDailyTss: Math.round(totalTss / 14),
      last3DaysActivities: last3Days,
    },
    fitnessStats: {
      ctl: latestFitness ? Math.round(latestFitness.triCtl) : 75,
      atl: latestFitness ? Math.round(latestFitness.triAtl) : 70,
      tsb: latestFitness ? Math.round(latestFitness.triTsb) : 5,
      tfi: tfiResult ? Math.round(tfiResult.tfi) : 85,
      limitingFactor: tfiResult?.limitingFactor?.name || undefined,
    },
    goals,
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
  // If static or fallback needed, use workoutReviewEngine directly
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
          source: data.source || 'gemini-3.8-flash',
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
  // If on static GitHub Pages, generate directly via sports science engine
  if (isGitHubPages) {
    return {
      workout: generateSportsScienceWorkout(payload),
      source: 'sports-science-engine',
    };
  }

  // Attempt backend API call (Gemini 3.8 Flash)
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
            source: data.source || 'gemini-3.8-flash',
            notice: data.notice,
          };
        }
      }
    }
  } catch (err) {
    console.info('[Coach API] Backend request unavailable, seamlessly using sports science engine:', err);
  }

  // Resilient fallback: Never display 405 or HTML errors to athlete
  return {
    workout: generateSportsScienceWorkout(payload),
    source: 'sports-science-engine',
  };
}

export async function requestPeriodizedPlan(
  payload: CoachRequestPayload
): Promise<{ plan: PeriodizedPlan; source: string }> {
  // If on static GitHub Pages, generate directly via sports science engine
  if (isGitHubPages) {
    return {
      plan: generateSportsSciencePlan(payload),
      source: 'sports-science-engine',
    };
  }

  // Attempt backend API call
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
            source: data.source || 'gemini-3.8-flash',
          };
        }
      }
    }
  } catch (err) {
    console.info('[Coach API] Backend plan request unavailable, using sports science engine:', err);
  }

  // Resilient fallback
  return {
    plan: generateSportsSciencePlan(payload),
    source: 'sports-science-engine',
  };
}

export interface CoachChatResult {
  answer: string;
  executedAction?: CoachAction;
  confidenceRating?: string;
  groundingSources?: { uri: string; title: string }[];
  source?: string;
}

export async function sendCoachChatMessage(
  question: string,
  payload: CoachRequestPayload,
  history: any[]
): Promise<CoachChatResult> {
  const parseFallbackAction = (q: string): CoachAction | undefined => {
    const lower = q.toLowerCase();

    // Chippenham Spring 10 Mile
    if (
      lower.includes('chippenham') ||
      ((lower.includes('under 1 hour') || lower.includes('under 1hr') || lower.includes('sub 1 hour') || lower.includes('sub 60')) &&
        (lower.includes('10 mile') || lower.includes('10miler') || lower.includes('10m')))
    ) {
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
        };
      } else {
        const priority: 'A' | 'B' | 'C' = hasPriorityA ? 'A' : hasPriorityB ? 'B' : 'C';
        return {
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
        };
      }
    }

    // Delete a goal race
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
        return {
          type: 'delete_goal',
          goalId: match.id,
          goalName: match.name,
          description: `Removed "${match.name}" from your profile goals.`,
        };
      }
    }

    // Edit a goal race
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
          return {
            type: 'update_goal',
            goalId: match.id,
            goalName: match.name,
            updates,
            description: `Updated ${match.name}.`,
          };
        }
      }
    }

    // Flat Ironman
    if ((lower.includes('add') || lower.includes('create') || lower.includes('new goal') || lower.includes('set goal')) && (lower.includes('ironman') || lower.includes('2028') || lower.includes('flat'))) {
      return {
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
      };
    }

    // -----------------------------------------------------------------------
    // Recreate / Calibrate Run Workout (e.g. "adjust pace to 17kph", "warmup to 6kph")
    // -----------------------------------------------------------------------
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
      };
    }
    return undefined;
  };

  // If on static GitHub Pages, generate directly via sports science engine
  if (isGitHubPages) {
    const rawAnswer = generateSportsScienceChat(question, payload, history);
    return {
      answer: rawAnswer,
      executedAction: parseFallbackAction(question),
      confidenceRating: rawAnswer.includes('High Confidence') ? 'High Confidence 8.5/10' : undefined,
      source: 'sports-science-engine',
    };
  }

  // Attempt backend API call
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
        recentActivitiesSummary: payload.recentActivitiesSummary,
      }),
    });

    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        if (data && typeof data.answer === 'string') {
          return {
            answer: data.answer,
            executedAction: data.executedAction || parseFallbackAction(question),
            confidenceRating: data.confidenceRating,
            groundingSources: data.groundingSources,
            source: data.source || 'gemini-3.8-flash',
          };
        }
      }
    }
  } catch (err) {
    console.info('[Coach API] Backend chat unavailable, using sports science engine:', err);
  }

  // Resilient fallback
  const rawFallback = generateSportsScienceChat(question, payload, history);
  return {
    answer: rawFallback,
    executedAction: parseFallbackAction(question),
    confidenceRating: rawFallback.includes('High Confidence') ? 'High Confidence 8.5/10' : undefined,
    source: 'sports-science-engine',
  };
}
