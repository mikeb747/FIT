import type { StravaActivity, StravaActivityDetailsRecord, StravaRateLimits } from './stravaActivities';
import {
  fetchStravaActivityDetails,
  saveStravaActivityDetails,
  getCachedStravaActivityRecord,
  getCachedStravaRateLimits,
  getSecondsUntilNext15MinWindow,
  subscribeToStravaRateLimits,
} from './stravaActivities';
import { getGoogleAccessToken } from './googleAuth';
import { hydrateActivitiesFromGoogleSheet, appendActivityToTrainingLog } from './googleSheets';

export interface StreamDownloaderProgress {
  isDownloading: boolean;
  total: number;
  completed: number;
  currentActivityName?: string;
  isPaused: boolean;
  isRateLimited: boolean;
  rateLimitedUntil?: number;
  rateLimitSecondsLeft?: number;
  rateLimitReason?: string;
  rateLimits?: StravaRateLimits | null;
  lastError?: string;
}

let activeAbortController: AbortController | null = null;
let isRunning = false;
let isPaused = false;
let currentProgress: StreamDownloaderProgress = {
  isDownloading: false,
  total: 0,
  completed: 0,
  isPaused: false,
  isRateLimited: false,
  rateLimits: getCachedStravaRateLimits(),
};

const listeners = new Set<(p: StreamDownloaderProgress) => void>();

function notifyListeners() {
  const snapshot = {
    ...currentProgress,
    rateLimits: getCachedStravaRateLimits(),
  };
  listeners.forEach((fn) => fn(snapshot));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('fit_track_stream_downloader_progress', { detail: snapshot })
    );
  }
}

// Subscribe to rate limit updates from stravaActivities
if (typeof window !== 'undefined') {
  subscribeToStravaRateLimits((limits) => {
    currentProgress.rateLimits = limits;
    notifyListeners();
  });
}

export function subscribeToStreamDownloader(
  listener: (p: StreamDownloaderProgress) => void
): () => void {
  listeners.add(listener);
  listener({
    ...currentProgress,
    rateLimits: getCachedStravaRateLimits(),
  });
  return () => {
    listeners.delete(listener);
  };
}

export function getStreamDownloaderStatus(): StreamDownloaderProgress {
  return {
    ...currentProgress,
    rateLimits: getCachedStravaRateLimits(),
  };
}

export function pauseStreamDownloader(): void {
  isPaused = true;
  currentProgress.isPaused = true;
  notifyListeners();
}

export function resumeStreamDownloader(): void {
  isPaused = false;
  currentProgress.isPaused = false;
  notifyListeners();
}

export function stopStreamDownloader(): void {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
  isRunning = false;
  isPaused = false;
  currentProgress = {
    isDownloading: false,
    total: 0,
    completed: 0,
    isPaused: false,
    isRateLimited: false,
    rateLimits: getCachedStravaRateLimits(),
  };
  notifyListeners();
}

/**
 * Calculates adaptive throttle delay based on current 15-minute Strava read rate usage:
 * - Read limit: 200 requests per 15 minutes.
 * - Each activity requires 2 read requests (details + streams).
 * - Under 80 reads: 4.0s delay
 * - 80 to 130 reads: 5.5s delay
 * - 130 to 170 reads: 8.0s delay
 */
function getAdaptiveThrottleDelay(baseDelayMs: number): number {
  const limits = getCachedStravaRateLimits();
  if (!limits) return Math.max(baseDelayMs, 4500);

  const usage = limits.read15MinUsage;
  if (usage >= 140) return 8500;
  if (usage >= 100) return 6500;
  if (usage >= 60) return 5000;
  return Math.max(baseDelayMs, 4000);
}

/**
 * Checks if we are close to hitting Strava API limits.
 * We reserve a buffer of at least 24 read requests (12% of 200) for user actions
 * like clicking into an activity, manual sync, or viewing gear.
 */
function isApproachingRateLimit(): { nearLimit: boolean; reason?: string } {
  const limits = getCachedStravaRateLimits();
  if (!limits) return { nearLimit: false };

  // 15-minute read limit (200 requests): stop if used >= 176 (reserve 24 requests)
  if (limits.read15MinLimit > 0 && limits.read15MinUsage >= limits.read15MinLimit - 24) {
    return {
      nearLimit: true,
      reason: `Approaching 15-minute read limit (${limits.read15MinUsage}/${limits.read15MinLimit} reads used). 24 requests reserved for browsing.`,
    };
  }

  // Daily read limit (2,000 requests): stop if used >= 1,930 (reserve 70 requests)
  if (limits.readDailyLimit > 0 && limits.readDailyUsage >= limits.readDailyLimit - 70) {
    return {
      nearLimit: true,
      reason: `Approaching daily read limit (${limits.readDailyUsage}/${limits.readDailyLimit} reads used today). Pausing until midnight UTC.`,
    };
  }

  // Overall 15-minute limit (400 requests)
  if (limits.overall15MinLimit > 0 && limits.overall15MinUsage >= limits.overall15MinLimit - 30) {
    return {
      nearLimit: true,
      reason: `Approaching overall 15-minute limit (${limits.overall15MinUsage}/${limits.overall15MinLimit} requests used).`,
    };
  }

  return { nearLimit: false };
}

/**
 * Starts background queue to fetch detailed streams for all activities that lack cached streams.
 * Downloads from newest to oldest so recent training blocks (4W/12W/24W) populate first.
 * Strictly respects Strava rate limits:
 * - Read limits: 200 req / 15 min & 2,000 req / day
 * - Overall limits: 400 req / 15 min & 4,000 req / day
 * - Proactively pauses before hitting limits with a live countdown timer until window resets.
 */
export async function startBackgroundStreamDownload({
  activities,
  stravaToken,
  cachedDetails = {},
  onActivityDownloaded,
  throttleDelayMs = 4500,
}: {
  activities: StravaActivity[];
  stravaToken: string;
  cachedDetails?: Record<string, StravaActivityDetailsRecord>;
  onActivityDownloaded?: (record: StravaActivityDetailsRecord) => void;
  throttleDelayMs?: number;
}): Promise<void> {
  if (isRunning) {
    return;
  }

  // Filter out deleted activities
  const validActivities = activities.filter((a) => !a.isDeleted);
  if (validActivities.length === 0 || !stravaToken) {
    return;
  }

  // Sort newest first
  const sorted = [...validActivities].sort((a, b) => {
    const timeA = new Date(a.start_date).getTime();
    const timeB = new Date(b.start_date).getTime();
    return timeB - timeA;
  });

  // Pre-check Google Sheets for existing activity data to conserve Strava API rate limits
  if (getGoogleAccessToken()) {
    try {
      currentProgress.currentActivityName = 'Checking Google Sheets for existing activity telemetry...';
      notifyListeners();
      const hydrated = await hydrateActivitiesFromGoogleSheet(sorted);
      if (hydrated > 0) {
        console.log(`[Stream Downloader] Hydrated ${hydrated} activities directly from Google Sheets!`);
      }
    } catch (e) {
      console.warn('[Stream Downloader] Could not pre-check Google Sheets:', e);
    }
  }

  // Identify activities missing cached streams or sheet hydration
  const queue: StravaActivity[] = [];
  for (const act of sorted) {
    const actId = String(act.id);
    const existing = cachedDetails[actId];
    // Check if streams data exists with actual records
    const hasStreams =
      existing?.streams &&
      typeof existing.streams === 'object' &&
      !existing.streamsError &&
      Object.keys(existing.streams).length > 0;

    if (!hasStreams) {
      // Double check IndexedDB in case it's in DB or was hydrated from Google Sheets
      const dbRecord = await getCachedStravaActivityRecord(actId);
      const dbHasStreams =
        dbRecord?.streams &&
        typeof dbRecord.streams === 'object' &&
        !dbRecord.streamsError &&
        Object.keys(dbRecord.streams).length > 0;
      const isHydratedFromSheet = dbRecord?.calibration?.manualTss !== undefined;

      if (!dbHasStreams && !isHydratedFromSheet) {
        queue.push(act);
      } else if (dbRecord && onActivityDownloaded) {
        onActivityDownloaded(dbRecord);
      }
    }
  }

  if (queue.length === 0) {
    currentProgress = {
      isDownloading: false,
      total: 0,
      completed: 0,
      isPaused: false,
      isRateLimited: false,
      rateLimits: getCachedStravaRateLimits(),
    };
    notifyListeners();
    return;
  }

  isRunning = true;
  isPaused = false;
  activeAbortController = new AbortController();
  const signal = activeAbortController.signal;

  currentProgress = {
    isDownloading: true,
    total: queue.length,
    completed: 0,
    currentActivityName: queue[0]?.name,
    isPaused: false,
    isRateLimited: false,
    rateLimits: getCachedStravaRateLimits(),
  };
  notifyListeners();

  for (let i = 0; i < queue.length; i++) {
    if (signal.aborted) break;

    // 1. Handle user manual pause
    while (isPaused && !signal.aborted) {
      await new Promise((r) => setTimeout(r, 500));
    }
    if (signal.aborted) break;

    // 2. Proactive Rate Limit Protection:
    // Check if we are near the 15-minute or daily quota BEFORE making requests
    const limitCheck = isApproachingRateLimit();
    if (limitCheck.nearLimit) {
      const waitSeconds = getSecondsUntilNext15MinWindow() + 5; // Add 5s buffer to allow Strava backend roll
      const resumeAt = Date.now() + waitSeconds * 1000;

      currentProgress.isRateLimited = true;
      currentProgress.rateLimitedUntil = resumeAt;
      currentProgress.rateLimitReason = limitCheck.reason;
      currentProgress.rateLimitSecondsLeft = waitSeconds;
      notifyListeners();

      while (Date.now() < resumeAt && !signal.aborted) {
        const remainingSec = Math.max(0, Math.ceil((resumeAt - Date.now()) / 1000));
        currentProgress.rateLimitSecondsLeft = remainingSec;
        notifyListeners();
        await new Promise((r) => setTimeout(r, 1000));
      }

      currentProgress.isRateLimited = false;
      currentProgress.rateLimitedUntil = undefined;
      currentProgress.rateLimitSecondsLeft = undefined;
      currentProgress.rateLimitReason = undefined;
      notifyListeners();
    }

    if (signal.aborted) break;

    const activity = queue[i];
    currentProgress.currentActivityName = activity.name;
    currentProgress.rateLimits = getCachedStravaRateLimits();
    notifyListeners();

    try {
      // fetchStravaActivityDetails performs 2 read calls:
      // 1. /api/strava/activities/:id
      // 2. /api/strava/activities/:id/streams
      const details = await fetchStravaActivityDetails(stravaToken, activity.id);
      if (signal.aborted) break;

      const savedRecord = await saveStravaActivityDetails(activity.id, details);
      if (onActivityDownloaded) {
        onActivityDownloaded(savedRecord);
      }

      // Requirement: Auto-backup to Google Sheets as soon as we got the data
      if (getGoogleAccessToken()) {
        appendActivityToTrainingLog(activity, savedRecord).catch((e) => {
          console.warn(`[Auto-Backup] Failed to auto-backup activity ${activity.id}:`, e);
        });
      }

      currentProgress.completed = i + 1;
      currentProgress.rateLimits = getCachedStravaRateLimits();
      notifyListeners();

      // Respectful adaptive pacing between activities
      if (i < queue.length - 1) {
        const adaptiveDelay = getAdaptiveThrottleDelay(throttleDelayMs);
        await new Promise((r) => setTimeout(r, adaptiveDelay));
      }
    } catch (err: any) {
      console.warn(`[Stream Downloader] Failed for activity ${activity.id}:`, err);
      const msg = String(err?.message || err);

      // Reactive 429 rate limit backoff (if Strava returns 429 despite proactive guard)
      if (msg.includes('429') || /rate limit/i.test(msg)) {
        const waitSeconds = getSecondsUntilNext15MinWindow() + 10;
        const targetResume = Date.now() + waitSeconds * 1000;

        currentProgress.isRateLimited = true;
        currentProgress.rateLimitedUntil = targetResume;
        currentProgress.rateLimitSecondsLeft = waitSeconds;
        currentProgress.rateLimitReason = 'Strava rate limit 429 received. Pausing until next 15-minute window.';
        notifyListeners();

        while (Date.now() < targetResume && !signal.aborted) {
          const remainingSec = Math.max(0, Math.ceil((targetResume - Date.now()) / 1000));
          currentProgress.rateLimitSecondsLeft = remainingSec;
          notifyListeners();
          await new Promise((r) => setTimeout(r, 1000));
        }

        currentProgress.isRateLimited = false;
        currentProgress.rateLimitedUntil = undefined;
        currentProgress.rateLimitSecondsLeft = undefined;
        currentProgress.rateLimitReason = undefined;
        notifyListeners();
      } else {
        // Non-rate-limit individual activity failure; wait 2.5s and proceed with queue
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
  }

  isRunning = false;
  activeAbortController = null;
  currentProgress.isDownloading = false;
  currentProgress.currentActivityName = undefined;
  notifyListeners();
}
