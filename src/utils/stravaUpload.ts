import { CompletedWorkout } from '../types/workout';
import { generateFitFile, workoutToFitBase64, getFitFileName } from './fitGenerator';
import { getDefaultActivityName } from './activityName';

export interface StravaUploadStatusResponse {
  id: number | string;
  id_str: string;
  external_id: string | null;
  error: string | null;
  status: string;
  activity_id: number | null;
}

export interface StravaUploadResult {
  success: boolean;
  uploadId?: number | string;
  activityId?: number | string;
  status?: string;
  error?: string;
  isStaticHost?: boolean;
}

export function buildStravaWorkoutDescription(workout: CompletedWorkout): string {
  const lines: string[] = [];
  lines.push(`Logged with GymFIT • Total Volume: ${workout.totalVolumeKg.toLocaleString()} kg across ${workout.totalSets} sets.`);
  lines.push('');
  lines.push('Workout Exercises:');

  workout.exercises.forEach((ex) => {
    const validSets = ex.sets.filter(
      (s) => s.completed !== false && (s.mode === 'duration' ? (s.durationSec || 0) > 0 : (s.reps > 0 || s.weightKg > 0))
    );
    if (validSets.length > 0) {
      const setSummaries = validSets.map((s) => {
        if (s.mode === 'duration') {
          const wt = s.weightKg > 0 ? ` @ ${s.weightKg.toFixed(1)}kg` : '';
          return `${s.durationSec || 60}s${wt}`;
        }
        const wt = s.weightKg > 0 ? `${s.weightKg.toFixed(1)}kg × ` : 'BW × ';
        return `${wt}${s.reps} reps`;
      });
      lines.push(`• ${ex.name}: ${validSets.length} sets (${setSummaries.join(', ')})`);
    }
  });

  return lines.join('\n');
}

/**
 * Check the status of an ongoing Strava upload by ID.
 * GET https://www.strava.com/api/v3/uploads/{uploadId}
 */
export async function checkStravaUploadStatus(
  uploadId: number | string,
  accessToken: string
): Promise<StravaUploadStatusResponse> {
  const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.includes('github.io');

  // Try local Express server proxy first if not on GitHub Pages
  if (!isGitHubPages) {
    try {
      const res = await fetch(`/api/strava/uploads/${uploadId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (res.ok) {
          return {
            id: data.id,
            id_str: data.id_str || String(data.id),
            external_id: data.external_id ?? null,
            error: data.error ?? null,
            status: data.status || '',
            activity_id: data.activity_id ?? null,
          };
        }
      }
    } catch {
      // Fall through to direct fetch
    }
  }

  // Direct fetch to Strava API v3
  const stravaRes = await fetch(`https://www.strava.com/api/v3/uploads/${uploadId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await stravaRes.json();
  return {
    id: data.id,
    id_str: data.id_str || String(data.id),
    external_id: data.external_id ?? null,
    error: data.error ?? null,
    status: data.status || '',
    activity_id: data.activity_id ?? null,
  };
}

/**
 * Poll Strava upload status starting 4 seconds after upload,
 * and rechecking every 4 seconds until a terminal response is received.
 */
export async function pollStravaUploadStatus(
  uploadId: number | string,
  accessToken: string,
  onStatusUpdate?: (statusText: string, uploadId: number | string) => void,
  maxAttempts = 15 // Up to 60 seconds of polling (15 * 4s)
): Promise<StravaUploadResult> {
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;

    // Wait 4 seconds before checking
    onStatusUpdate?.(
      attempt === 1
        ? `Upload ID ${uploadId} received. Checking status in 4s...`
        : `Rechecking upload status in 4s (attempt ${attempt})...`,
      uploadId
    );

    await new Promise((resolve) => setTimeout(resolve, 4000));

    try {
      const response = await checkStravaUploadStatus(uploadId, accessToken);

      // 1. Check for processing error
      if (response.error) {
        return {
          success: false,
          uploadId: response.id_str || response.id || uploadId,
          status: response.status,
          error: response.error,
        };
      }

      // 2. Check if ready and activity_id is returned
      if (response.activity_id) {
        return {
          success: true,
          uploadId: response.id_str || response.id || uploadId,
          activityId: response.activity_id,
          status: response.status || 'Your activity is ready.',
        };
      }

      // 3. Check if deleted
      if (response.status && response.status.toLowerCase().includes('deleted')) {
        return {
          success: false,
          uploadId: response.id_str || response.id || uploadId,
          status: response.status,
          error: response.status,
        };
      }

      // 4. Still processing ('Your activity is still being processed.')
      onStatusUpdate?.(
        response.status || 'Your activity is still being processed.',
        uploadId
      );
    } catch (err: any) {
      console.warn('Strava status poll error:', err);
      onStatusUpdate?.(
        'Still waiting for Strava to complete processing...',
        uploadId
      );
    }
  }

  // If maximum polling attempts reached
  return {
    success: true,
    uploadId,
    status: 'Workout received by Strava and queued for processing.',
  };
}

/**
 * Upload workout to Strava with 4-second status polling:
 * 1. Uploads FIT file to Strava uploads endpoint.
 * 2. Receives upload ID.
 * 3. 4 seconds later checks upload status.
 * 4. Rechecks every 4 seconds until a response (activity_id or error) is received.
 */
export async function uploadWorkoutToStrava(
  workout: CompletedWorkout,
  accessToken: string,
  onStatusUpdate?: (statusText: string, uploadId?: number | string) => void
): Promise<StravaUploadResult> {
  const title = workout.title?.trim() || getDefaultActivityName(workout.startTime);
  const description = buildStravaWorkoutDescription(workout);

  const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.includes('github.io');

  let initialUploadId: string | number | null = null;

  // Step 1: If NOT strictly GitHub Pages, attempt local server proxy (/api/strava/upload)
  if (!isGitHubPages) {
    try {
      const fitBase64 = workoutToFitBase64(workout);
      const fitFileName = getFitFileName(workout);
      onStatusUpdate?.('Sending workout to Strava...');

      const res = await fetch('/api/strava/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fitBase64,
          name: title,
          fileName: fitFileName,
          description,
          sport_type: 'WeightTraining',
          activity_type: 'weight_training',
          accessToken,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (res.ok && data.success) {
          if (data.activityId) {
            return {
              success: true,
              uploadId: data.uploadId,
              activityId: data.activityId,
              status: data.status,
            };
          }
          initialUploadId = data.uploadId;
        } else if (data.error) {
          return {
            success: false,
            error: data.error,
          };
        }
      }
    } catch {
      // Fall through to direct upload attempt
    }
  }

  // Step 2: If server proxy didn't get an uploadId, attempt direct browser upload to Strava API v3
  if (!initialUploadId) {
    try {
      const bytes = generateFitFile(workout);
      const fitBlob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
      const fitFileName = getFitFileName(workout);

      const formData = new FormData();
      formData.append('file', fitBlob, fitFileName);
      formData.append('name', title);
      formData.append('description', description);
      formData.append('data_type', 'fit');
      formData.append('sport_type', 'WeightTraining');
      formData.append('activity_type', 'weight_training');

      onStatusUpdate?.('Sending workout to Strava API...');

      const stravaRes = await fetch('https://www.strava.com/api/v3/uploads', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      const contentType = stravaRes.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await stravaRes.json();
        if (stravaRes.ok) {
          if (data.activity_id) {
            return {
              success: true,
              uploadId: data.id_str || data.id,
              activityId: data.activity_id,
              status: data.status,
            };
          }
          initialUploadId = data.id_str || data.id;
        } else {
          return {
            success: false,
            error: data.message || data.error || `Strava rejected upload (${stravaRes.status})`,
          };
        }
      } else {
        const text = await stravaRes.text();
        return {
          success: false,
          error: `Strava upload failed (${stravaRes.status}): ${text.slice(0, 120)}`,
        };
      }
    } catch (err: any) {
      const msg = err.message || '';
      const isNetworkOrCors = msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('CORS');

      return {
        success: false,
        isStaticHost: isGitHubPages || isNetworkOrCors,
        error: isNetworkOrCors
          ? 'Direct browser upload was blocked by Strava CORS policy on static GitHub Pages.'
          : msg || 'Network error communicating with Strava API',
      };
    }
  }

  if (!initialUploadId) {
    return {
      success: false,
      error: 'Did not receive an upload ID from Strava.',
    };
  }

  // Step 3: Now that we have received the upload ID, wait 4 seconds and recheck every 4 seconds until complete
  return pollStravaUploadStatus(initialUploadId, accessToken, onStatusUpdate);
}
