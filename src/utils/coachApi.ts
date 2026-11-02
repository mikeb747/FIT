import type { AthleteProfile } from '../types/athlete';
import type { TrainingGoal } from '../types/goals';
import type { DailyRecoveryLog } from '../types/recovery';
import type { StravaActivity, StravaActivityDetailsRecord } from './stravaActivities';
import type {
  RecommendedWorkout,
  PeriodizedPlan,
  CoachSport,
  CoachRequestPayload,
} from '../types/coach';
import { computeFitnessTimeline, calculateTriathlonFitnessIndex } from './fitnessEngine';
import { computeDailyReadiness } from './readinessEngine';
import {
  generateSportsScienceWorkout,
  generateSportsSciencePlan,
  generateSportsScienceChat,
} from './sportsScienceEngine';

const isGitHubPages =
  typeof window !== 'undefined' &&
  (window.location.hostname.includes('github.io') || window.location.protocol === 'file:');

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

  return {
    athleteProfile,
    latestReadiness,
    latestRecoveryLog,
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
    targetDurationMin,
    customNotes,
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

export async function sendCoachChatMessage(
  question: string,
  payload: CoachRequestPayload,
  history: any[]
): Promise<string> {
  // If on static GitHub Pages, generate directly via sports science engine
  if (isGitHubPages) {
    return generateSportsScienceChat(question, payload, history);
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
      }),
    });

    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        if (data && typeof data.answer === 'string') {
          return data.answer;
        }
      }
    }
  } catch (err) {
    console.info('[Coach API] Backend chat unavailable, using sports science engine:', err);
  }

  // Resilient fallback
  return generateSportsScienceChat(question, payload, history);
}
