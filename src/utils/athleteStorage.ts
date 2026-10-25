import { AthleteProfile, DEFAULT_ATHLETE_PROFILE } from '../types/athlete';

export const ATHLETE_PROFILE_STORAGE_KEY = 'gymfit_athlete_profile_v1';

export function loadAthleteProfile(): AthleteProfile {
  if (typeof window === 'undefined') return DEFAULT_ATHLETE_PROFILE;
  try {
    const raw = localStorage.getItem(ATHLETE_PROFILE_STORAGE_KEY);
    if (!raw) return DEFAULT_ATHLETE_PROFILE;
    const parsed = JSON.parse(raw);
    const profile: AthleteProfile = {
      ...DEFAULT_ATHLETE_PROFILE,
      ...parsed,
    };
    // Migrate legacy defaults if they matched the previous hardcoded values
    if (profile.bikeFtp === 250 || !profile.bikeFtp) {
      profile.bikeFtp = 310;
    }
    if (profile.thresholdPaceRunOutdoorSec === 228 || profile.thresholdPaceRunOutdoorSec === 270 || !profile.thresholdPaceRunOutdoorSec) {
      profile.thresholdPaceRunOutdoorSec = 232; // 3:52/km
    }
    if (!profile.injuries) {
      profile.injuries = DEFAULT_ATHLETE_PROFILE.injuries;
    }
    if (!profile.weeklyAvailability) {
      profile.weeklyAvailability = DEFAULT_ATHLETE_PROFILE.weeklyAvailability;
    }
    if (profile.thresholdPaceRunTreadmillSec === 285 || !profile.thresholdPaceRunTreadmillSec) {
      profile.thresholdPaceRunTreadmillSec = 228; // 3:48/km
    }
    if (profile.swim100mTimeSec === 95 || !profile.swim100mTimeSec) {
      profile.swim100mTimeSec = 84; // 1:24
    }
    if (profile.swim400mTimeSec === 415 || !profile.swim400mTimeSec) {
      profile.swim400mTimeSec = 355; // 5:55
      profile.swimPoolPace100mSec = 90;
      profile.swimOpenWaterPace100mSec = 98;
    }
    if (!profile.periodization) {
      profile.periodization = '4weeks';
    }
    return profile;
  } catch (err) {
    console.warn('[Athlete Storage] Failed to load profile, using defaults:', err);
    return DEFAULT_ATHLETE_PROFILE;
  }
}

export function saveAthleteProfile(profile: AthleteProfile): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ATHLETE_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch (err) {
    console.error('[Athlete Storage] Failed to save profile:', err);
  }
}

export function resetAthleteProfile(): AthleteProfile {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(ATHLETE_PROFILE_STORAGE_KEY);
    } catch {}
  }
  return DEFAULT_ATHLETE_PROFILE;
}
