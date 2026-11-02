import type { RecommendedWorkout, PeriodizedPlan, CoachChatMessage } from '../types/coach';

const STORAGE_KEYS = {
  TODAY_WORKOUT: 'fit_track_coach_today_workout_v1',
  SAVED_PLAN: 'fit_track_coach_saved_plan_v1',
  CHAT_HISTORY: 'fit_track_coach_chat_history_v1',
};

export function loadTodayRecommendedWorkout(): RecommendedWorkout | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TODAY_WORKOUT);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    return null;
  }
}

export function saveTodayRecommendedWorkout(workout: RecommendedWorkout | null): void {
  try {
    if (workout) {
      localStorage.setItem(STORAGE_KEYS.TODAY_WORKOUT, JSON.stringify(workout));
    } else {
      localStorage.removeItem(STORAGE_KEYS.TODAY_WORKOUT);
    }
  } catch {}
}

export function loadSavedCoachingPlan(): PeriodizedPlan | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SAVED_PLAN);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveCoachingPlan(plan: PeriodizedPlan | null): void {
  try {
    if (plan) {
      localStorage.setItem(STORAGE_KEYS.SAVED_PLAN, JSON.stringify(plan));
    } else {
      localStorage.removeItem(STORAGE_KEYS.SAVED_PLAN);
    }
  } catch {}
}

export function loadCoachChatHistory(): CoachChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveCoachChatHistory(messages: CoachChatMessage[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(messages.slice(-30)));
  } catch {}
}
