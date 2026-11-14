import { AthleteProfile, DEFAULT_ATHLETE_PROFILE } from '../types/athlete';

export const ATHLETE_PROFILE_STORAGE_KEY = 'fittrack_athlete_profile_v1';
const LEGACY_STORAGE_KEYS = ['gymfit_athlete_profile_v1', 'ironfit_athlete_profile_v1'];

export function loadAthleteProfile(): AthleteProfile {
  if (typeof window === 'undefined') return DEFAULT_ATHLETE_PROFILE;
  try {
    let raw = localStorage.getItem(ATHLETE_PROFILE_STORAGE_KEY);
    if (!raw) {
      for (const legacyKey of LEGACY_STORAGE_KEYS) {
        const legacyVal = localStorage.getItem(legacyKey);
        if (legacyVal) {
          raw = legacyVal;
          break;
        }
      }
    }
    if (!raw) return DEFAULT_ATHLETE_PROFILE;
    const parsed = JSON.parse(raw);
    const profile: AthleteProfile = {
      ...DEFAULT_ATHLETE_PROFILE,
      ...parsed,
    };
    if (!profile.bikeFtp) {
      profile.bikeFtp = DEFAULT_ATHLETE_PROFILE.bikeFtp;
    }
    if (!profile.restingHeartRate) {
      profile.restingHeartRate = DEFAULT_ATHLETE_PROFILE.restingHeartRate;
    }
    if (!profile.heightCm) {
      profile.heightCm = DEFAULT_ATHLETE_PROFILE.heightCm;
    }
    if (!profile.weightKg) {
      profile.weightKg = DEFAULT_ATHLETE_PROFILE.weightKg;
    }
    if (!profile.birthDate) {
      profile.birthDate = DEFAULT_ATHLETE_PROFILE.birthDate;
      profile.age = DEFAULT_ATHLETE_PROFILE.age;
    }
    if (!profile.swimTssMode) {
      profile.swimTssMode = 'sTSS';
    }
    if (!profile.thresholdPaceRunOutdoorSec) {
      profile.thresholdPaceRunOutdoorSec = DEFAULT_ATHLETE_PROFILE.thresholdPaceRunOutdoorSec;
    }
    if (!profile.injuries) {
      profile.injuries = DEFAULT_ATHLETE_PROFILE.injuries;
    }
    if (!profile.weeklyAvailability) {
      profile.weeklyAvailability = DEFAULT_ATHLETE_PROFILE.weeklyAvailability;
    }
    if (!profile.thresholdPaceRunTreadmillSec) {
      profile.thresholdPaceRunTreadmillSec = DEFAULT_ATHLETE_PROFILE.thresholdPaceRunTreadmillSec;
    }
    if (!profile.swim100mTimeSec) {
      profile.swim100mTimeSec = DEFAULT_ATHLETE_PROFILE.swim100mTimeSec;
    }
    if (!profile.swim400mTimeSec) {
      profile.swim400mTimeSec = DEFAULT_ATHLETE_PROFILE.swim400mTimeSec;
    }
    if (!profile.swimPoolPace100mSec) {
      profile.swimPoolPace100mSec = DEFAULT_ATHLETE_PROFILE.swimPoolPace100mSec;
    }
    if (!profile.swimOpenWaterPace100mSec) {
      profile.swimOpenWaterPace100mSec = DEFAULT_ATHLETE_PROFILE.swimOpenWaterPace100mSec;
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
    window.dispatchEvent(
      new CustomEvent('fittrack_local_storage_updated', { detail: { domains: ['profile'] } })
    );
  } catch (err) {
    console.error('[Athlete Storage] Failed to save profile:', err);
  }
}

export function resetAthleteProfile(): AthleteProfile {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(ATHLETE_PROFILE_STORAGE_KEY);
      window.dispatchEvent(
        new CustomEvent('fittrack_local_storage_updated', { detail: { domains: ['profile'] } })
      );
    } catch {}
  }
  return DEFAULT_ATHLETE_PROFILE;
}
