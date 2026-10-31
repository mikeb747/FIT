import type { StravaActivity, StravaActivityDetailsRecord } from './stravaActivities';
import {
  fetchStravaActivityDetails,
  saveStravaActivityDetails,
  getCachedStravaActivityRecord,
} from './stravaActivities';

export interface StreamDownloaderProgress {
  isDownloading: boolean;
  total: number;
  completed: number;
  currentActivityName?: string;
  isPaused: boolean;
  isRateLimited: boolean;
  rateLimitedUntil?: number;
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
};

const listeners = new Set<(p: StreamDownloaderProgress) => void>();

function notifyListeners() {
  const snapshot = { ...currentProgress };
  listeners.forEach((fn) => fn(snapshot));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('fit_track_stream_downloader_progress', { detail: snapshot })
    );
  }
}

export function subscribeToStreamDownloader(
  listener: (p: StreamDownloaderProgress) => void
): () => void {
  listeners.add(listener);
  listener({ ...currentProgress });
  return () => {
    listeners.delete(listener);
  };
}

export function getStreamDownloaderStatus(): StreamDownloaderProgress {
  return { ...currentProgress };
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
  };
  notifyListeners();
}

/**
 * Starts background queue to fetch detailed streams for all activities that lack cached streams.
 * Downloads from newest to oldest so recent training blocks (4W/12W/24W) populate first.
 */
export async function startBackgroundStreamDownload({
  activities,
  stravaToken,
  cachedDetails = {},
  onActivityDownloaded,
  throttleDelayMs = 1200,
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

  // Identify activities missing cached streams
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
      // Double check IndexedDB in case it's in DB but not yet in memory state
      const dbRecord = await getCachedStravaActivityRecord(actId);
      const dbHasStreams =
        dbRecord?.streams &&
        typeof dbRecord.streams === 'object' &&
        !dbRecord.streamsError &&
        Object.keys(dbRecord.streams).length > 0;

      if (!dbHasStreams) {
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
  };
  notifyListeners();

  for (let i = 0; i < queue.length; i++) {
    if (signal.aborted) break;

    // Handle user pause
    while (isPaused && !signal.aborted) {
      await new Promise((r) => setTimeout(r, 500));
    }
    if (signal.aborted) break;

    const activity = queue[i];
    currentProgress.currentActivityName = activity.name;
    notifyListeners();

    try {
      const details = await fetchStravaActivityDetails(stravaToken, activity.id);
      if (signal.aborted) break;

      const savedRecord = await saveStravaActivityDetails(activity.id, details);
      if (onActivityDownloaded) {
        onActivityDownloaded(savedRecord);
      }

      currentProgress.completed = i + 1;
      notifyListeners();

      // Respectful throttle delay between calls to preserve Strava rate limits
      if (i < queue.length - 1) {
        await new Promise((r) => setTimeout(r, throttleDelayMs));
      }
    } catch (err: any) {
      console.warn(`[Stream Downloader] Failed for activity ${activity.id}:`, err);
      const msg = String(err?.message || err);

      // Handle Strava rate limit (429)
      if (msg.includes('429') || /rate limit/i.test(msg)) {
        const cooldownMs = 15 * 60 * 1000; // 15 minutes
        currentProgress.isRateLimited = true;
        currentProgress.rateLimitedUntil = Date.now() + cooldownMs;
        currentProgress.lastError = 'Strava rate limit reached (pausing for 15 mins)';
        notifyListeners();

        // Wait out the cooldown or break on abort
        const targetResume = Date.now() + cooldownMs;
        while (Date.now() < targetResume && !signal.aborted) {
          await new Promise((r) => setTimeout(r, 2000));
        }
        currentProgress.isRateLimited = false;
        currentProgress.rateLimitedUntil = undefined;
        notifyListeners();
      } else {
        // Individual error; wait a short bit then continue with next
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  isRunning = false;
  activeAbortController = null;
  currentProgress.isDownloading = false;
  currentProgress.currentActivityName = undefined;
  notifyListeners();
}
