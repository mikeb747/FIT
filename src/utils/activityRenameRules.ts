import type { StravaActivity } from './stravaActivities';

export interface ActivityRenameRule {
  id: string;
  label?: string;
  findPattern: string;
  replacement: string;
  isEnabled: boolean;
  isRegex?: boolean;
  autoUploadToStrava?: boolean;
}

export const STORAGE_KEY_RENAME_RULES = 'fit_track_activity_rename_rules_v1';
export const STORAGE_KEY_RENAMED_IDS = 'fit_track_synced_renamed_activity_ids';

export const DEFAULT_ACTIVITY_RENAME_RULES: ActivityRenameRule[] = [
  {
    id: 'tp_virtual_dash',
    label: 'Remove "TrainingPeaks Virtual - "',
    findPattern: 'TrainingPeaks Virtual - ',
    replacement: '',
    isEnabled: true,
    isRegex: false,
    autoUploadToStrava: true,
  },
  {
    id: 'tp_virtual_shorten',
    label: 'Shorten "TrainingPeaks Virtual" to "Virtual"',
    findPattern: 'TrainingPeaks Virtual',
    replacement: 'Virtual',
    isEnabled: false,
    isRegex: false,
    autoUploadToStrava: true,
  },
  {
    id: 'zwift_dash',
    label: 'Remove "Zwift - "',
    findPattern: 'Zwift - ',
    replacement: '',
    isEnabled: true,
    isRegex: false,
    autoUploadToStrava: true,
  },
];

/**
 * Loads configured activity rename rules from localStorage or defaults.
 */
export function getActivityRenameRules(): ActivityRenameRule[] {
  if (typeof window === 'undefined') return DEFAULT_ACTIVITY_RENAME_RULES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RENAME_RULES);
    if (!raw) return DEFAULT_ACTIVITY_RENAME_RULES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (e) {
    console.error('Failed to parse activity rename rules:', e);
  }
  return DEFAULT_ACTIVITY_RENAME_RULES;
}

/**
 * Saves activity rename rules to localStorage.
 */
export function saveActivityRenameRules(rules: ActivityRenameRule[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_RENAME_RULES, JSON.stringify(rules));
  } catch (e) {
    console.error('Failed to save activity rename rules:', e);
  }
}

/**
 * Retrieves the set of activity IDs whose renamed title has already been successfully synced to Strava.
 */
export function getSyncedRenamedActivityIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RENAMED_IDS);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr.map(String));
    }
  } catch {}
  return new Set();
}

/**
 * Marks an activity ID as having had its renamed title synced to Strava.
 */
export function markActivityRenamedSynced(activityId: string | number): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getSyncedRenamedActivityIds();
    current.add(String(activityId));
    localStorage.setItem(STORAGE_KEY_RENAMED_IDS, JSON.stringify(Array.from(current)));
  } catch {}
}

/**
 * Applies enabled rename rules to an activity title string.
 * Cleans up leading punctuation (e.g. "- ", ": ") or multiple spaces left behind.
 */
export function applyRenameRulesToName(
  originalName: string,
  rules: ActivityRenameRule[] = getActivityRenameRules()
): { newName: string; changed: boolean; matchedRules: ActivityRenameRule[] } {
  if (!originalName || typeof originalName !== 'string') {
    return { newName: originalName || '', changed: false, matchedRules: [] };
  }

  let result = originalName;
  const matchedRules: ActivityRenameRule[] = [];

  for (const rule of rules) {
    if (!rule.isEnabled || !rule.findPattern) continue;

    let matched = false;
    if (rule.isRegex) {
      try {
        const regex = new RegExp(rule.findPattern, 'gi');
        if (regex.test(result)) {
          matched = true;
          result = result.replace(regex, rule.replacement);
        }
      } catch (err) {
        console.warn('Invalid regex in rename rule:', rule.findPattern, err);
      }
    } else {
      // Case-insensitive literal replace
      const lowerPat = rule.findPattern.toLowerCase();
      let lowerRes = result.toLowerCase();
      let startIdx = lowerRes.indexOf(lowerPat);

      if (startIdx >= 0) {
        matched = true;
        while (startIdx >= 0) {
          result =
            result.substring(0, startIdx) +
            rule.replacement +
            result.substring(startIdx + rule.findPattern.length);
          lowerRes = result.toLowerCase();
          startIdx = lowerRes.indexOf(lowerPat);
        }
      }
    }

    if (matched) {
      matchedRules.push(rule);
    }
  }

  // Clean up any awkward leftover punctuation at start of title or double spaces
  result = result
    .replace(/^[\s\-–—:;]+/, '') // Remove leading dashes, colons, or spaces
    .replace(/\s{2,}/g, ' ')     // Normalize multiple spaces into a single space
    .trim();

  // If the result ended up empty, fallback to original
  if (!result) result = originalName;

  return {
    newName: result,
    changed: result !== originalName,
    matchedRules,
  };
}

/**
 * Updates an activity name on Strava via PUT /api/v3/activities/:id.
 */
export async function updateStravaActivityName(
  activityId: string | number,
  newName: string,
  accessToken: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.includes('github.io');
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const body = JSON.stringify({ name: newName });

  try {
    // 1. Try server proxy route first
    if (!isGitHubPages) {
      const proxyRes = await fetch(`/api/strava/activities/${activityId}`, {
        method: 'PUT',
        headers,
        body,
      }).catch(() => null);

      if (proxyRes && proxyRes.ok) {
        const data = await proxyRes.json();
        markActivityRenamedSynced(activityId);
        return { success: true, data };
      }
    }

    // 2. Direct Strava V3 call fallback
    const directRes = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
      method: 'PUT',
      headers,
      body,
    });

    const data = await directRes.json();
    if (!directRes.ok) {
      const errMsg = data?.message || data?.error || `Strava update failed (${directRes.status})`;
      return { success: false, error: errMsg };
    }

    markActivityRenamedSynced(activityId);
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error updating Strava activity' };
  }
}

/**
 * Processes incoming or existing activities through enabled rename rules.
 * Automatically updates names locally and syncs to Strava if autoUploadToStrava is enabled.
 */
export async function processActivitiesWithRenameRules(
  activities: StravaActivity[],
  accessToken?: string | null,
  options: { syncToStrava?: boolean; forceAll?: boolean } = {}
): Promise<{
  updatedActivities: StravaActivity[];
  renamedCount: number;
  syncedToStravaCount: number;
  changes: Array<{ id: string | number; oldName: string; newName: string; syncedToStrava: boolean; error?: string }>;
}> {
  const rules = getActivityRenameRules();
  const hasActiveRules = rules.some((r) => r.isEnabled);
  if (!hasActiveRules && !options.forceAll) {
    return {
      updatedActivities: activities,
      renamedCount: 0,
      syncedToStravaCount: 0,
      changes: [],
    };
  }

  const syncedSet = getSyncedRenamedActivityIds();
  const shouldSync = options.syncToStrava ?? true;
  let renamedCount = 0;
  let syncedToStravaCount = 0;
  const changes: Array<{ id: string | number; oldName: string; newName: string; syncedToStrava: boolean; error?: string }> = [];

  const updatedActivities = [...activities];

  for (let i = 0; i < updatedActivities.length; i++) {
    const act = updatedActivities[i];
    const { newName, changed, matchedRules } = applyRenameRulesToName(act.name, rules);

    if (changed) {
      renamedCount++;
      const oldName = act.name;
      updatedActivities[i] = {
        ...act,
        name: newName,
      };

      const wantsStravaUpload = matchedRules.some((r) => r.autoUploadToStrava !== false);
      const alreadySynced = syncedSet.has(String(act.id));

      let synced = false;
      let syncError: string | undefined;

      if (shouldSync && wantsStravaUpload && accessToken && (!alreadySynced || options.forceAll)) {
        try {
          const res = await updateStravaActivityName(act.id, newName, accessToken);
          if (res.success) {
            synced = true;
            syncedToStravaCount++;
          } else {
            syncError = res.error;
          }
        } catch (e: any) {
          syncError = e.message;
        }
      }

      changes.push({
        id: act.id,
        oldName,
        newName,
        syncedToStrava: synced,
        error: syncError,
      });
    }
  }

  return {
    updatedActivities,
    renamedCount,
    syncedToStravaCount,
    changes,
  };
}
