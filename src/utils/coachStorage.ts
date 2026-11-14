import type { RecommendedWorkout, PeriodizedPlan, CoachChatMessage } from '../types/coach';
import { buildEnrichedGoalFromQuery } from './racePaceEngine';

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
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('fittrack_local_storage_updated', { detail: { domains: ['coach'] } })
      );
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
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('fittrack_local_storage_updated', { detail: { domains: ['coach'] } })
      );
    }
  } catch {}
}

export function loadCoachChatHistory(): CoachChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY);
    if (!raw) return [];
    const parsed: CoachChatMessage[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    let changed = false;
    const upgraded = parsed.map((msg) => {
      if (
        msg.role === 'model' &&
        msg.executedAction &&
        (msg.executedAction.type === 'add_goal' || msg.executedAction.type === 'propose_goal') &&
        msg.executedAction.goal &&
        /boddington/i.test(msg.executedAction.goal.name || '')
      ) {
        const g = msg.executedAction.goal;
        if (
          g.eventDate === '2027-04-18' ||
          g.distancePreset === 'Custom' ||
          !g.runElevationGainMeters ||
          !msg.executedAction.paceSuggestions
        ) {
          changed = true;
          const prio = (g.priority as 'A' | 'B' | 'C') || 'B';
          const enriched = buildEnrichedGoalFromQuery('Boddington 10 Mile', prio);
          const rec = enriched.recommendedSuggestion;
          const aSug = enriched.pacing.byPriority.A;
          const cSug = enriched.pacing.byPriority.C;
          return {
            ...msg,
            content: `### ✓ Goal Race Saved: Boddington 10 Mile (Priority ${prio}-Race)

I have added the **Boddington 10 Mile** to your Goals using the **10 Mile** distance preset (**16.093 km**):

• **Event Date & Venue:** **Sunday, 31 January 2027** at **The Gloucester Old Spot, Boddington / Piffs Elm, Cheltenham, Gloucestershire, UK** *(Gloucestershire AAA Road Race Series)*
• **Course & Elevation:** **10 Mile (16.093 km)** pan-flat 4-lap country lane circuit with **~35m (115 ft) total elevation gain**
• **Priority ${prio} Achievable Target Pace Recommendation:**
  - **⭐ Priority ${prio} Recommended (${rec.targetTimeFormatted} · ${rec.targetPaceKmFormatted} / ${rec.targetPaceMileFormatted}):** ${rec.taperAndStrategyNote} Target HR: **${rec.targetHrRange}**.
  - **Priority A Stretch / Peak Taper (${aSug.targetTimeFormatted} · ${aSug.targetPaceKmFormatted} / ${aSug.targetPaceMileFormatted}):** Sub-60 breakthrough pace if run with a full 7–10 day taper.
  - **Priority C Controlled Tempo (${cSug.targetTimeFormatted} · ${cSug.targetPaceKmFormatted} / ${cSug.targetPaceMileFormatted}):** High-Zone 3 progression effort run through normal weekly volume.

*Use the **Target Pace & Time Selector** on the card above to switch between these Priority pace targets or set your own custom goal time!*`,
            executedAction: {
              ...msg.executedAction,
              goal: enriched.goal,
              paceSuggestions: enriched.prioritySuggestions,
              recommendedPaceSuggestion: enriched.recommendedSuggestion,
              description: `Added "Boddington 10 Mile" (2027-01-31, 10 Mile preset, +35m elev) as a Priority ${prio} Goal with suggested target ${rec.targetTimeFormatted} (${rec.targetPaceKmFormatted}).`,
            },
          };
        }
      }
      return msg;
    });

    if (changed) {
      localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(upgraded.slice(-30)));
    }
    return upgraded;
  } catch {
    return [];
  }
}

export function saveCoachChatHistory(messages: CoachChatMessage[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(messages.slice(-30)));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('fittrack_local_storage_updated', { detail: { domains: ['coach'] } })
      );
    }
  } catch {}
}
