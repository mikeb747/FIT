import type { AthleteProfile } from '../types/athlete';
import type { TrainingGoal } from '../types/goals';
import type { DailyRecoveryLog, ReadinessScoreResult } from '../types/recovery';
import type { StravaActivity, StravaActivityDetailsRecord } from './stravaActivities';
import type {
  RecommendedWorkout,
  PeriodizedPlan,
  CoachSport,
  CoachRequestPayload,
} from '../types/coach';
import { computeFitnessTimeline, calculateTriathlonFitnessIndex } from './fitnessEngine';
import { computeDailyReadiness } from './readinessEngine';

export async function fetchCoachStatus(): Promise<{
  available: boolean;
  model: string;
  features: string[];
}> {
  try {
    const res = await fetch('/api/coach/status');
    if (!res.ok) throw new Error('Status failed');
    return await res.json();
  } catch {
    return {
      available: false,
      model: 'fallback-sports-science',
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
    ? calculateTriathlonFitnessIndex(latestFitness.swimCtl, latestFitness.bikeCtl, latestFitness.runCtl, 'middle_70_3', goals)
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
  const response = await fetch('/api/coach/recommend-workout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to generate workout: ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  return {
    workout: data.workout,
    source: data.source,
    notice: data.notice,
  };
}

export async function requestPeriodizedPlan(
  payload: CoachRequestPayload
): Promise<{ plan: PeriodizedPlan; source: string }> {
  const response = await fetch('/api/coach/generate-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Failed to generate training plan');
  }

  const data = await response.json();
  return {
    plan: data.plan,
    source: data.source,
  };
}

export async function sendCoachChatMessage(
  question: string,
  payload: CoachRequestPayload,
  history: any[]
): Promise<string> {
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

  if (!response.ok) {
    throw new Error('Coach chat request failed');
  }

  const data = await response.json();
  return data.answer;
}
