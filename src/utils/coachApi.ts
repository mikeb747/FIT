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
      movingTimeMin,
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
  executedAction?: CoachGoalAction;
  confidenceRating?: string;
  source?: string;
}

export async function sendCoachChatMessage(
  question: string,
  payload: CoachRequestPayload,
  history: any[]
): Promise<CoachChatResult> {
  const parseFallbackAction = (q: string): CoachGoalAction | undefined => {
    const lower = q.toLowerCase();
    if ((lower.includes('add') || lower.includes('create') || lower.includes('new goal') || lower.includes('set goal')) && (lower.includes('ironman') || lower.includes('2028') || lower.includes('flat'))) {
      return {
        type: 'add_goal',
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
