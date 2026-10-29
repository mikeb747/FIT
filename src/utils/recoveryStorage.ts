import type { DailyRecoveryLog, SubjectiveFeel, GarminApiDebugTrace } from '../types/recovery';

export interface GarminMetricCheck {
  metric: string;
  received: boolean;
  status?: number;
  value?: string | number;
  message: string;
}

const RECOVERY_STORAGE_KEY = 'fit_track_recovery_logs_v1';
const LEGACY_STORAGE_KEY = 'ironfit_recovery_logs_v1';

/**
 * Returns true if the user has authenticated with Garmin Connect or saved Garmin credentials.
 */
export function isGarminConnected(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(
      localStorage.getItem('fit_track_garmin_email') ||
      localStorage.getItem('fit_track_garmin_token') ||
      localStorage.getItem('fit_track_garmin_connected')
    );
  } catch {
    return false;
  }
}

/**
 * Detects whether a stored recovery log is part of the legacy synthetic/demo dataset.
 */
function isSyntheticDemoLog(log: DailyRecoveryLog): boolean {
  if (!log) return true;
  const notes = (log.notes || '').toLowerCase();
  if (
    notes.includes('calibrated') ||
    notes.includes('autonomic balance') ||
    notes.includes('felt well-rested') ||
    notes.includes('deep restorative sleep') ||
    notes.includes('full 4-week recovery baseline start') ||
    notes.includes('post-interval load detected') ||
    notes.includes('supercompensation recorded') ||
    notes.includes('steady cardiovascular baseline') ||
    notes.includes('authenticated recovery telemetry') ||
    notes.includes('rebounding from hard block') ||
    notes.includes('steady sleep after bike tempo')
  ) {
    return true;
  }
  return false;
}

/**
 * Loads authentic recovery logs from LocalStorage.
 * Completely strips any legacy 28-day demo data and returns an empty array if no genuine logs exist.
 */
export function loadRecoveryLogs(): DailyRecoveryLog[] {
  try {
    const raw =
      localStorage.getItem(RECOVERY_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_STORAGE_KEY);

    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Strip out any synthetic demo records
        const genuine = parsed.filter((l) => !isSyntheticDemoLog(l));
        if (genuine.length !== parsed.length) {
          // Clean storage to purge legacy mock items
          saveRecoveryLogs(genuine);
        }
        return genuine.sort((a, b) => a.date.localeCompare(b.date));
      }
    }
  } catch (err) {
    console.warn('Failed to parse saved recovery logs:', err);
  }

  // Strictly return empty array — do NOT seed demo data
  return [];
}

/**
 * Persists recovery logs to LocalStorage
 */
export function saveRecoveryLogs(logs: DailyRecoveryLog[]): void {
  try {
    const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
    localStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(sorted));
  } catch (err) {
    console.error('Failed to save recovery logs:', err);
  }
}

/**
 * Upserts a single daily log (keyed by date)
 */
export function upsertRecoveryLog(log: DailyRecoveryLog): DailyRecoveryLog[] {
  const current = loadRecoveryLogs();
  const index = current.findIndex((l) => l.date === log.date);

  let updated: DailyRecoveryLog[];
  if (index >= 0) {
    updated = [...current];
    updated[index] = { ...log, id: current[index].id || log.id };
  } else {
    updated = [...current, log];
  }

  saveRecoveryLogs(updated);
  return updated;
}

/**
 * Deletes a recovery log by ID
 */
export function deleteRecoveryLog(id: string): DailyRecoveryLog[] {
  const current = loadRecoveryLogs();
  const updated = current.filter((l) => l.id !== id);
  saveRecoveryLogs(updated);
  return updated;
}

/**
 * Clears all stored recovery logs from LocalStorage
 */
export function clearRecoveryLogs(): void {
  try {
    localStorage.removeItem(RECOVERY_STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {}
}

/**
 * Resets recovery logs to empty state
 */
export function resetRecoveryLogsToDefaults(): DailyRecoveryLog[] {
  clearRecoveryLogs();
  return [];
}

/**
 * Parses CSV export from Garmin Connect or TrainingPeaks
 * Supports columns: Date, Resting_HR / RHR, HRV / rMSSD, Sleep_Hours / Sleep_Minutes, Sleep_Score, Deep, REM
 */
export function parseGarminOrTpCsv(csvText: string): { imported: DailyRecoveryLog[]; error?: string } {
  try {
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      return { imported: [], error: 'CSV file is empty or missing data rows.' };
    }

    const header = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));

    const dateCol = header.findIndex((h) => h.includes('date') || h.includes('timestamp'));
    const rhrCol = header.findIndex((h) => h.includes('rhr') || h.includes('resting') || h.includes('heart'));
    const hrvCol = header.findIndex((h) => h.includes('hrv') || h.includes('rmssd') || h.includes('variability'));
    const sleepCol = header.findIndex((h) => h.includes('sleep') && (h.includes('min') || h.includes('hour') || h.includes('duration') || h.includes('total')));
    const scoreCol = header.findIndex((h) => h.includes('score') || h.includes('quality'));
    const deepCol = header.findIndex((h) => h.includes('deep'));
    const remCol = header.findIndex((h) => h.includes('rem'));

    if (dateCol === -1) {
      return { imported: [], error: 'Could not find a "Date" column in the uploaded CSV header.' };
    }

    const imported: DailyRecoveryLog[] = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
      const rawDate = parts[dateCol];
      if (!rawDate) continue;

      // Normalize date to YYYY-MM-DD
      let dateObj = new Date(rawDate);
      if (isNaN(dateObj.getTime())) {
        const splitDate = rawDate.split(/[-/]/);
        if (splitDate.length === 3) {
          if (splitDate[0].length === 4) {
            dateObj = new Date(`${splitDate[0]}-${splitDate[1]}-${splitDate[2]}`);
          } else {
            dateObj = new Date(`${splitDate[2]}-${splitDate[1]}-${splitDate[0]}`);
          }
        }
      }

      if (isNaN(dateObj.getTime())) continue;
      const dateStr = dateObj.toISOString().split('T')[0];

      // Parse Resting HR (default 41)
      let rhr = rhrCol >= 0 ? parseFloat(parts[rhrCol]) : 41;
      if (isNaN(rhr) || rhr <= 20 || rhr > 140) rhr = 41;

      // Parse HRV rMSSD
      let hrv = hrvCol >= 0 ? parseFloat(parts[hrvCol]) : 75;
      if (isNaN(hrv) || hrv <= 0) hrv = 75;

      // Parse Sleep duration in minutes
      let sleepMinutes = 480;
      if (sleepCol >= 0) {
        const val = parseFloat(parts[sleepCol]);
        if (!isNaN(val)) {
          sleepMinutes = val <= 24 ? Math.round(val * 60) : Math.round(val);
        }
      }

      // Parse sleep score
      let score = scoreCol >= 0 ? parseInt(parts[scoreCol], 10) : 80;
      if (isNaN(score) || score <= 0) score = 80;

      // Parse deep & rem
      let deep = deepCol >= 0 ? parseFloat(parts[deepCol]) : Math.round(sleepMinutes * 0.18);
      if (deep <= 10 && deep > 0) deep = Math.round(deep * 60);
      if (isNaN(deep)) deep = Math.round(sleepMinutes * 0.18);

      let rem = remCol >= 0 ? parseFloat(parts[remCol]) : Math.round(sleepMinutes * 0.22);
      if (rem <= 10 && rem > 0) rem = Math.round(rem * 60);
      if (isNaN(rem)) rem = Math.round(sleepMinutes * 0.22);

      const awake = Math.max(15, Math.round(sleepMinutes * 0.06));
      const light = Math.max(60, sleepMinutes - deep - rem);

      imported.push({
        id: `import_${dateStr}`,
        date: dateStr,
        restingHr: Math.round(rhr),
        hrvRmssd: Math.round(hrv),
        sleepDurationMinutes: sleepMinutes,
        sleepScore: Math.min(100, Math.max(1, score)),
        deepSleepMinutes: Math.round(deep),
        remSleepMinutes: Math.round(rem),
        lightSleepMinutes: Math.round(light),
        awakeMinutes: awake,
        source: 'csv',
        notes: 'Imported from Garmin CSV',
      });
    }

    if (imported.length === 0) {
      return { imported: [], error: 'No valid recovery date rows could be extracted from the file.' };
    }

    return { imported };
  } catch (err: any) {
    return { imported: [], error: `Failed to parse CSV file: ${err.message || 'Unknown error'}` };
  }
}

/**
 * Generates CSV string for export
 */
export function exportRecoveryLogsToCsv(logs: DailyRecoveryLog[]): string {
  const header = [
    'Date',
    'Resting_HR_bpm',
    'HRV_rMSSD_ms',
    'Sleep_Duration_Minutes',
    'Sleep_Hours_Formatted',
    'Sleep_Score',
    'Deep_Sleep_Minutes',
    'REM_Sleep_Minutes',
    'Light_Sleep_Minutes',
    'Awake_Minutes',
    'Subjective_Feel',
    'Source',
    'Notes',
  ].join(',');

  const rows = logs.map((l) => {
    const hours = (l.sleepDurationMinutes / 60).toFixed(2);
    const cleanNotes = (l.notes || '').replace(/"/g, '""');
    return [
      l.date,
      l.restingHr,
      l.hrvRmssd,
      l.sleepDurationMinutes,
      hours,
      l.sleepScore,
      l.deepSleepMinutes,
      l.remSleepMinutes,
      l.lightSleepMinutes,
      l.awakeMinutes,
      l.subjectiveFeel || '',
      l.source,
      `"${cleanNotes}"`,
    ].join(',');
  });

  return [header, ...rows].join('\n');
}

/**
 * Merges incoming logs with existing logs by date (incoming overwrites matching dates)
 */
export function mergeRecoveryLogs(
  existing: DailyRecoveryLog[],
  incoming: DailyRecoveryLog[]
): DailyRecoveryLog[] {
  const map = new Map<string, DailyRecoveryLog>();
  for (const log of existing) {
    map.set(log.date, log);
  }
  for (const log of incoming) {
    map.set(log.date, log);
  }
  const result = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  saveRecoveryLogs(result);
  return result;
}

/**
 * Triggers multi-week Garmin sync via backend server endpoint /api/garmin/sync-multiweek.
 * Strictly communicates with live endpoints without synthetic demo fallbacks.
 */
export async function syncGarminMultiWeek(options: {
  email?: string;
  password?: string;
  sessionToken?: string;
  weeks: number;
  debugDate?: string;
  baselineRhr?: number;
}): Promise<{
  success: boolean;
  syncedDays: number;
  weeks: number;
  logs: DailyRecoveryLog[];
  checks?: GarminMetricCheck[];
  traces?: GarminApiDebugTrace[];
  message: string;
  error?: string;
  mfaRequired?: boolean;
}> {
  const baseline = options.baselineRhr || 41;
  const email = options.email?.trim();
  const password = options.password?.trim();
  const sessionToken = options.sessionToken?.trim();

  if (!sessionToken && (!email || !password)) {
    return {
      success: false,
      syncedDays: 0,
      weeks: options.weeks,
      logs: [],
      message: 'Garmin credentials required. Please provide your Garmin email and password, or an active session token.',
      error: 'Missing Garmin credentials',
    };
  }

  const queryDate = options.debugDate || '2026-10-28';
  const startTime = Date.now();

  const clientTrace: GarminApiDebugTrace = {
    id: `trace_client_${Date.now()}`,
    timestamp: new Date().toISOString(),
    label: `Local Client -> /api/garmin/sync-multiweek (${queryDate} UTC)`,
    request: {
      method: 'POST',
      url: '/api/garmin/sync-multiweek',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hasSessionToken: Boolean(sessionToken),
        hasApiKey: Boolean(sessionToken && sessionToken.startsWith('GCDC_')),
        weeks: options.weeks,
        debugDate: queryDate,
      }, null, 2),
    },
    response: {
      status: 0,
      statusText: 'Connecting',
      contentType: '',
      body: '',
      durationMs: 0,
    },
  };

  try {
    const res = await fetch('/api/garmin/sync-multiweek', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        sessionToken,
        weeks: options.weeks,
        debugDate: queryDate,
        baselineRhr: baseline,
      }),
    });

    const durationMs = Date.now() - startTime;
    const responseText = await res.text();
    const contentType = res.headers.get('content-type') || 'unknown';

    clientTrace.response = {
      status: res.status,
      statusText: res.statusText || (res.ok ? 'OK' : 'Error'),
      contentType,
      body: responseText,
      durationMs,
    };

    let data: any = {};
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      data = {};
    }

    const serverTraces: GarminApiDebugTrace[] = Array.isArray(data.traces) ? data.traces : [];
    // If the server provided its own traces from Garmin endpoints, use those; if empty or if server had a non-200, ensure clientTrace is preserved
    const traces: GarminApiDebugTrace[] = serverTraces.length > 0
      ? serverTraces
      : [clientTrace];

    const checks: GarminMetricCheck[] | undefined = Array.isArray(data.checks) ? data.checks : undefined;

    if (res.ok && data.success && Array.isArray(data.logs) && data.logs.length > 0) {
      try {
        localStorage.setItem('fit_track_garmin_connected', 'true');
        localStorage.removeItem('fit_track_garmin_disconnected');
        if (sessionToken) {
          localStorage.setItem('fit_track_garmin_token', sessionToken);
        }
        if (email) {
          localStorage.setItem('fit_track_garmin_email', email);
        }
      } catch {}

      return {
        success: true,
        syncedDays: data.syncedDays || data.logs.length,
        weeks: options.weeks,
        logs: data.logs,
        checks,
        traces,
        message: data.message || `Synchronized ${data.logs.length} day(s) of recovery data for ${queryDate} (UTC).`,
      };
    }

    if (checks && checks.length > 0) {
      return {
        success: Boolean(data.success),
        syncedDays: Array.isArray(data.logs) ? data.logs.length : 0,
        weeks: options.weeks,
        logs: Array.isArray(data.logs) ? data.logs : [],
        checks,
        traces,
        message: data.message || `Garmin daily check completed for ${queryDate} (UTC).`,
        error: data.error || (data.success ? undefined : `Garmin Connect did not return full recovery metrics for ${queryDate} (UTC).`),
        mfaRequired: data.mfaRequired,
      };
    }

    const errorDetails = data.error || data.message || (!res.ok ? `Server returned HTTP ${res.status} ${res.statusText}` : `Garmin Connect did not return recovery metrics for ${queryDate} (UTC).`);

    return {
      success: false,
      syncedDays: 0,
      weeks: options.weeks,
      logs: [],
      checks,
      traces,
      message: errorDetails,
      error: errorDetails,
      mfaRequired: data.mfaRequired,
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    clientTrace.error = err.message;
    clientTrace.response = {
      status: 0,
      statusText: 'Network / Client Error',
      contentType: 'text/plain',
      body: err.message || 'Network fetch failure',
      durationMs,
    };

    return {
      success: false,
      syncedDays: 0,
      weeks: options.weeks,
      logs: [],
      traces: [clientTrace],
      message:
        err.message ||
        'Network error contacting Garmin sync server. Please check your connection or inspect the trace logs below.',
      error:
        err.message ||
        'Network error contacting Garmin sync server. Please check your connection or inspect the trace logs below.',
    };
  }
}
