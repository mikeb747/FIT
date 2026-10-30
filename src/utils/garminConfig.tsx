import React from 'react';

export const GarminTriangleIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <polygon points="12,2 22,21 2,21" fill="#007cc3" />
    <polygon points="12,9 18,20 6,20" fill="white" />
  </svg>
);

export const DEFAULT_GARMIN_PERSONAL_KEY =
  'GCDC_49295cfc-ebad-4efe-932c-f508d2ed0e9d.65543f6e-9140-4e9c-a882-e7d0b62992e4.DiZsWy8QLAKsUhGEjkWPcuwB1HJXw56BHkDKelRldWc.3526889472';

export const DEFAULT_GARMIN_PROXY_URL =
  'https://green-base-05b3.mike-brown747.workers.dev/';

export interface GarminApiRequestTypes {
  sleep: boolean;
  heartRate: boolean;
  hrv: boolean;
  steps: boolean;
  calories: boolean;
  bodyBattery: boolean;
  stress: boolean;
  respiration: boolean;
  pulseOx: boolean;
  vo2MaxRun: boolean;
  vo2MaxBike: boolean;
}

export const DEFAULT_GARMIN_REQUEST_TYPES: GarminApiRequestTypes = {
  sleep: true,
  heartRate: true,
  hrv: true,
  steps: true,
  calories: false, // unticked by default
  bodyBattery: true,
  stress: true,
  respiration: true,
  pulseOx: true,
  vo2MaxRun: true,
  vo2MaxBike: true,
};

export const GARMIN_STORAGE_KEYS = {
  TOKEN: 'fit_track_garmin_token',
  PROXY_URL: 'fit_track_garmin_proxy_url',
  REQUEST_TYPES: 'fit_track_garmin_request_types',
  CONNECTED: 'fit_track_garmin_connected',
  DISCONNECTED: 'fit_track_garmin_disconnected',
  EMAIL: 'fit_track_garmin_email',
};

export function getStoredGarminToken(): string {
  try {
    const stored = localStorage.getItem(GARMIN_STORAGE_KEYS.TOKEN);
    if (stored && stored.trim().length > 0) return stored.trim();
    // Default to the official personal key
    localStorage.setItem(GARMIN_STORAGE_KEYS.TOKEN, DEFAULT_GARMIN_PERSONAL_KEY);
    return DEFAULT_GARMIN_PERSONAL_KEY;
  } catch {
    return DEFAULT_GARMIN_PERSONAL_KEY;
  }
}

export function saveStoredGarminToken(token: string): void {
  try {
    if (token && token.trim().length > 0) {
      localStorage.setItem(GARMIN_STORAGE_KEYS.TOKEN, token.trim());
    } else {
      localStorage.removeItem(GARMIN_STORAGE_KEYS.TOKEN);
    }
  } catch {}
}

export function getStoredGarminProxyUrl(): string {
  try {
    const stored = localStorage.getItem(GARMIN_STORAGE_KEYS.PROXY_URL);
    if (stored && stored.trim().length > 0) return stored.trim();
    // Default to the official worker proxy
    localStorage.setItem(GARMIN_STORAGE_KEYS.PROXY_URL, DEFAULT_GARMIN_PROXY_URL);
    return DEFAULT_GARMIN_PROXY_URL;
  } catch {
    return DEFAULT_GARMIN_PROXY_URL;
  }
}

export function saveStoredGarminProxyUrl(url: string): void {
  try {
    if (url && url.trim().length > 0) {
      localStorage.setItem(GARMIN_STORAGE_KEYS.PROXY_URL, url.trim());
    } else {
      localStorage.removeItem(GARMIN_STORAGE_KEYS.PROXY_URL);
    }
  } catch {}
}

export function getStoredGarminRequestTypes(): GarminApiRequestTypes {
  try {
    const stored = localStorage.getItem(GARMIN_STORAGE_KEYS.REQUEST_TYPES);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        sleep: parsed.sleep !== false,
        heartRate: parsed.heartRate !== false,
        hrv: parsed.hrv !== false,
        steps: parsed.steps !== false,
        calories: Boolean(parsed.calories), // unticked by default unless explicitly true
        bodyBattery: parsed.bodyBattery !== false,
        stress: parsed.stress !== false,
        respiration: parsed.respiration !== false,
        pulseOx: parsed.pulseOx !== false,
        vo2MaxRun: parsed.vo2MaxRun !== false,
        vo2MaxBike: parsed.vo2MaxBike !== false,
      };
    }
  } catch {}
  return { ...DEFAULT_GARMIN_REQUEST_TYPES };
}

export function saveStoredGarminRequestTypes(types: GarminApiRequestTypes): void {
  try {
    localStorage.setItem(GARMIN_STORAGE_KEYS.REQUEST_TYPES, JSON.stringify(types));
  } catch {}
}
