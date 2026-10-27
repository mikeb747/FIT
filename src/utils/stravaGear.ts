/**
 * Utility for persisting and on-demand resolving of Strava Bike Gear Names.
 * Caches bike names permanently in localStorage ('fit_track_bike_names') so that
 * network lookups occur strictly when the user opens bike settings and a name is missing.
 */

const BIKE_NAMES_STORAGE_KEY = 'fit_track_bike_names';

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
    const updated = { ...current, [gearId]: name.trim() };
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
    const updated = { ...current, ...names };
    localStorage.setItem(BIKE_NAMES_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save bike names:', err);
  }
}

/**
 * Resolves missing bike names on-demand from Strava.
 * Only queries Strava for gearIds that DO NOT already have a name in cache.
 */
export async function resolveMissingBikeNames(
  gearIds: string[]
): Promise<Record<string, string>> {
  const currentCache = getCachedBikeNames();
  const missing = gearIds.filter((id) => !currentCache[id] || currentCache[id].trim() === '');

  // If none are missing, return current cache immediately with 0 network calls
  if (missing.length === 0) {
    return currentCache;
  }

  const token = typeof window !== 'undefined'
    ? localStorage.getItem('ironfit_strava_token')
    : null;

  if (!token) {
    return currentCache;
  }

  const newlyResolved: Record<string, string> = {};

  try {
    // 1. Try fetching the athlete profile first - it contains all bikes in a single call
    const athleteRes = await fetch('/api/strava/athlete', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }).catch(() => null);

    if (athleteRes && athleteRes.ok) {
      const athleteData = await athleteRes.json().catch(() => null);
      if (athleteData && Array.isArray(athleteData.bikes)) {
        for (const bike of athleteData.bikes) {
          if (bike && bike.id && bike.name) {
            newlyResolved[bike.id] = bike.name;
          }
        }
      }
    }
  } catch (err) {
    console.warn('Could not retrieve athlete bikes:', err);
  }

  // 2. For any remaining missing gear IDs, query individual gear endpoint
  const stillMissing = missing.filter((id) => !newlyResolved[id]);
  if (stillMissing.length > 0) {
    await Promise.all(
      stillMissing.map(async (gearId) => {
        try {
          const gearRes = await fetch(`/api/strava/gear/${encodeURIComponent(gearId)}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }).catch(() => null);

          if (gearRes && gearRes.ok) {
            const gearData = await gearRes.json().catch(() => null);
            if (gearData && gearData.name) {
              newlyResolved[gearId] = gearData.name;
            }
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
