/**
 * Utility for persisting and on-demand resolving of Strava Bike Gear Names.
 * Caches bike names permanently in localStorage ('fit_track_bike_names') so that
 * network lookups occur strictly when the user opens bike settings and a name is missing.
 */

import { STRAVA_CONFIG, refreshStravaAccessToken } from './stravaOAuth';

const BIKE_NAMES_STORAGE_KEY = 'fit_track_bike_names';

// In-memory set of gear IDs that have already been queried during this session.
// Prevents continuous re-fetching or infinite loops when Strava returns 404/empty for an ID (e.g. demo data or deleted gear).
const attemptedSessionGearIds = new Set<string>();

/**
 * Loads all locally cached bike names (gearId -> bikeName)
 */
export function getCachedBikeNames(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(BIKE_NAMES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Failed to parse cached bike names:', err);
  }
  return {};
}

/**
 * Persists a bike name override/cache for a specific gearId
 */
export function setCachedBikeName(gearId: string, name: string): void {
  if (typeof window === 'undefined' || !gearId) return;
  try {
    const current = getCachedBikeNames();
    const trimmed = name.trim();
    const updated = { ...current, [gearId]: trimmed || gearId };
    localStorage.setItem(BIKE_NAMES_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save bike name:', err);
  }
}

/**
 * Persists multiple bike names at once
 */
export function setCachedBikeNames(names: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getCachedBikeNames();
    const cleanNames: Record<string, string> = {};
    for (const [k, v] of Object.entries(names)) {
      if (k && v && v.trim()) {
        cleanNames[k] = v.trim();
      }
    }
    const updated = { ...current, ...cleanNames };
    localStorage.setItem(BIKE_NAMES_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save bike names:', err);
  }
}

/**
 * Helper to retrieve an active, valid Strava token, attempting refresh if expired.
 */
async function getEffectiveStravaToken(providedToken?: string | null): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  let token = (providedToken && providedToken.trim()) || localStorage.getItem(STRAVA_CONFIG.STORAGE_KEYS.TOKEN);
  if (!token) return null;

  // Check if token is expired or close to expiry
  try {
    const expiresAtRaw = localStorage.getItem(STRAVA_CONFIG.STORAGE_KEYS.EXPIRES_AT);
    if (expiresAtRaw) {
      const expiresAt = parseInt(expiresAtRaw, 10);
      const nowSec = Math.floor(Date.now() / 1000);
      if (!isNaN(expiresAt) && expiresAt <= nowSec + 60) {
        // Attempt refresh
        const refreshed = await refreshStravaAccessToken().catch(() => null);
        if (refreshed) {
          token = refreshed;
        }
      }
    }
  } catch (err) {
    console.warn('Could not check Strava token expiration:', err);
  }

  return token;
}

/**
 * Resolves missing bike names on-demand from Strava.
 * Only queries Strava for gearIds that DO NOT already have a name in cache and haven't already been attempted this session.
 *
 * @param gearIds List of gear IDs to resolve
 * @param stravaToken Optional access token override
 * @param force If true, bypasses session cache and forces a re-query from Strava
 */
export async function resolveMissingBikeNames(
  gearIds: string[],
  stravaToken?: string | null,
  force = false
): Promise<Record<string, string>> {
  const currentCache = getCachedBikeNames();

  if (force) {
    attemptedSessionGearIds.clear();
  }

  // Filter for IDs that need resolution
  const missing = gearIds.filter((id) => {
    if (!id || typeof id !== 'string') return false;
    const hasCached = currentCache[id] && currentCache[id].trim() !== '';
    if (force) return true;
    if (hasCached) return false;
    // If already queried and not found in this session, don't spam network
    return !attemptedSessionGearIds.has(id);
  });

  // If none are missing or all already attempted, return current cache immediately
  if (missing.length === 0) {
    return currentCache;
  }

  // Mark all target IDs as attempted so we never loop repeatedly
  missing.forEach((id) => attemptedSessionGearIds.add(id));

  const activeToken = await getEffectiveStravaToken(stravaToken);
  if (!activeToken) {
    return currentCache;
  }

  const newlyResolved: Record<string, string> = {};

  try {
    // 1. Try fetching the athlete profile first - it contains all bikes in a single call
    let athleteData: any = null;

    // Try server proxy first
    const proxyRes = await fetch('/api/strava/athlete', {
      headers: {
        Authorization: `Bearer ${activeToken}`,
        Accept: 'application/json',
      },
    }).catch(() => null);

    if (proxyRes && proxyRes.ok) {
      athleteData = await proxyRes.json().catch(() => null);
    } else {
      // Fallback to direct Strava endpoint if proxy 404s or is unavailable
      const directRes = await fetch('https://www.strava.com/api/v3/athlete', {
        headers: {
          Authorization: `Bearer ${activeToken}`,
          Accept: 'application/json',
        },
      }).catch(() => null);

      if (directRes && directRes.ok) {
        athleteData = await directRes.json().catch(() => null);
      }
    }

    if (athleteData && Array.isArray(athleteData.bikes)) {
      for (const bike of athleteData.bikes) {
        if (bike && bike.id && bike.name) {
          newlyResolved[bike.id] = bike.name;
        }
      }
    }
  } catch (err) {
    console.warn('Could not retrieve athlete bikes from Strava:', err);
  }

  // 2. For any targeted gear IDs not found in athlete profile, query individual gear endpoint
  const stillMissing = missing.filter((id) => !newlyResolved[id]);
  if (stillMissing.length > 0) {
    await Promise.all(
      stillMissing.map(async (gearId) => {
        try {
          let gearData: any = null;

          // Try server proxy first
          const proxyRes = await fetch(`/api/strava/gear/${encodeURIComponent(gearId)}`, {
            headers: {
              Authorization: `Bearer ${activeToken}`,
              Accept: 'application/json',
            },
          }).catch(() => null);

          if (proxyRes && proxyRes.ok) {
            gearData = await proxyRes.json().catch(() => null);
          } else {
            // Direct Strava API fallback
            const directRes = await fetch(`https://www.strava.com/api/v3/gear/${encodeURIComponent(gearId)}`, {
              headers: {
                Authorization: `Bearer ${activeToken}`,
                Accept: 'application/json',
              },
            }).catch(() => null);

            if (directRes && directRes.ok) {
              gearData = await directRes.json().catch(() => null);
            }
          }

          if (gearData && gearData.name) {
            newlyResolved[gearId] = gearData.name;
          }
        } catch {
          // Ignore individual lookup errors
        }
      })
    );
  }

  if (Object.keys(newlyResolved).length > 0) {
    setCachedBikeNames(newlyResolved);
  }

  return { ...currentCache, ...newlyResolved };
}
