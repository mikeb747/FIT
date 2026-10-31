import type { DailyRecoveryLog, SubjectiveFeel, GarminApiDebugTrace } from '../types/recovery';
import {
  getStoredGarminToken,
  getStoredGarminProxyUrl,
  getStoredGarminRequestTypes,
} from './garminConfig';

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
    const prev = map.get(log.date);
    if (prev) {
      map.set(log.date, {
        ...prev,
        ...log,
        bodyBattery: log.bodyBattery ?? prev.bodyBattery,
        stress: log.stress ?? prev.stress,
        respiration: log.respiration ?? prev.respiration,
        pulseOx: log.pulseOx ?? prev.pulseOx,
        vo2MaxRun: log.vo2MaxRun ?? prev.vo2MaxRun,
        vo2MaxBike: log.vo2MaxBike ?? prev.vo2MaxBike,
        steps: log.steps ?? prev.steps,
        calories: log.calories ?? prev.calories,
      });
    } else {
      map.set(log.date, log);
    }
  }
  const result = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  saveRecoveryLogs(result);
  return result;
}

export function getDatesInRange(startStr?: string, endStr?: string, fallbackDate?: string): string[] {
  if (!startStr && !endStr) {
    return [fallbackDate || new Date().toISOString().slice(0, 10)];
  }
  const sStr = startStr || endStr!;
  const eStr = endStr || startStr!;
  let start = new Date(sStr);
  let end = new Date(eStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return [fallbackDate || new Date().toISOString().slice(0, 10)];
  }
  if (start > end) {
    const tmp = start;
    start = end;
    end = tmp;
  }
  const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 30) {
    start = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
  }

  const dates: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates.reverse();
}

/**
 * Determines if a recovery log record already has all complete recovery metrics
 * (Resting HR, Sleep, and HRV)
 */
export function hasCompleteRecoveryData(log?: DailyRecoveryLog): boolean {
  if (!log) return false;
  const hasRhr = typeof log.restingHr === 'number' && log.restingHr > 0;
  const hasSleep = (typeof log.sleepDurationMinutes === 'number' && log.sleepDurationMinutes > 0) ||
                   (typeof log.sleepScore === 'number' && log.sleepScore > 0);
  const hasHrv = typeof log.hrvRmssd === 'number' && log.hrvRmssd > 0;
  return hasRhr && hasSleep && hasHrv;
}

/**
 * Triggers multi-week Garmin sync via backend server endpoint /api/garmin/sync-multiweek.
 * Strictly communicates with live endpoints without synthetic demo fallbacks.
 */
export async function syncGarminMultiWeek(options: {
  email?: string;
  password?: string;
  sessionToken?: string;
  weeks?: number;
  debugDate?: string;
  startDate?: string;
  endDate?: string;
  dates?: string[];
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
  const sessionToken = options.sessionToken?.trim() || getStoredGarminToken();

  if (!sessionToken && (!email || !password)) {
    return {
      success: false,
      syncedDays: 0,
      weeks: options.weeks || 4,
      logs: [],
      message: 'Garmin credentials required. Please provide your Garmin email and password, or an active session token.',
      error: 'Missing Garmin credentials',
    };
  }

  const targetDates = Array.isArray(options.dates) && options.dates.length > 0
    ? options.dates
    : getDatesInRange(options.startDate, options.endDate, options.debugDate);
  const queryDate = targetDates[0] || '2026-10-28';

  let configuredProxyUrl = '';
  try {
    configuredProxyUrl = localStorage.getItem('fit_track_garmin_proxy_url') || '';
  } catch {}
  if (!configuredProxyUrl) {
    configuredProxyUrl = getStoredGarminProxyUrl();
  }

  // If a custom proxy (e.g. Cloudflare Worker) is configured and sessionToken is provided,
  // query Garmin Personal API endpoints directly through the CORS proxy!
  if (configuredProxyUrl && sessionToken) {
    return syncGarminViaProxy(
      configuredProxyUrl,
      sessionToken,
      targetDates,
      baseline,
      options.weeks || 4
    );
  }

  const startTime = Date.now();
  const targetApiUrl = '/api/garmin/sync-multiweek';
  const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.includes('github.io');

  const clientTrace: GarminApiDebugTrace = {
    id: `trace_client_${Date.now()}`,
    timestamp: new Date().toISOString(),
    label: `Local Client -> ${targetApiUrl} (${queryDate} UTC, ${targetDates.length} day(s))`,
    request: {
      method: 'POST',
      url: targetApiUrl,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hasSessionToken: Boolean(sessionToken),
        hasApiKey: Boolean(sessionToken && sessionToken.startsWith('GCDC_')),
        weeks: options.weeks,
        debugDate: queryDate,
        dates: targetDates,
        isGitHubPages,
        proxyConfigured: Boolean(configuredProxyUrl),
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
    const res = await fetch(targetApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        sessionToken,
        weeks: options.weeks,
        debugDate: queryDate,
        dates: targetDates,
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
        weeks: options.weeks || 4,
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
        weeks: options.weeks || 4,
        logs: Array.isArray(data.logs) ? data.logs : [],
        checks,
        traces,
        message: data.message || `Garmin daily check completed for ${queryDate} (UTC).`,
        error: data.error || (data.success ? undefined : `Garmin Connect did not return full recovery metrics for ${queryDate} (UTC).`),
        mfaRequired: data.mfaRequired,
      };
    }

    let errorDetails = data.error || data.message;
    if (!errorDetails) {
      if (res.status === 405 || (isGitHubPages && !configuredProxyUrl)) {
        errorDetails = 'GitHub Pages is a static file host without a Node.js backend (HTTP 405 Method Not Allowed). To sync Garmin data on GitHub Pages, use the "CSV Export (Instant)" tab, or enter a Garmin Proxy URL.';
      } else if (!res.ok) {
        errorDetails = `Server returned HTTP ${res.status} ${res.statusText || ''}`.trim();
      } else {
        errorDetails = `Garmin Connect did not return recovery metrics for ${queryDate} (UTC).`;
      }
    }

    return {
      success: false,
      syncedDays: 0,
      weeks: options.weeks || 4,
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
      weeks: options.weeks || 4,
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

/**
 * Direct Client-Side Garmin Personal API Sync via CORS Proxy (e.g. Cloudflare Worker)
 * Directly calls:
 * 1. POST /personalapitoken-service/personal-api/personal-api-key/token (if GCDC_ key)
 * 2. GET /sleep-service/sleep/dailySleep?date=...
 * 3. GET /usersummary-service/usersummary/daily?calendarDate=...
 * 4. GET /hrv-service/hrv/...
 * 5. GET /hrv-service/hrv/daily/...
 */
async function syncGarminViaProxy(
  proxyUrl: string,
  sessionToken: string,
  queryDates: string[] | string,
  baselineRhr: number,
  weeks: number
): Promise<{
  success: boolean;
  syncedDays: number;
  weeks: number;
  logs: DailyRecoveryLog[];
  checks?: GarminMetricCheck[];
  traces: GarminApiDebugTrace[];
  message: string;
  error?: string;
}> {
  const traces: GarminApiDebugTrace[] = [];
  const cleanProxy = proxyUrl.trim().replace(/\/+$/, '');
  const cleanToken = sessionToken.trim();
  const isPersonalApiKey = cleanToken.startsWith('GCDC_') || (!cleanToken.includes('=') && cleanToken.length > 20);

  const fetchWithTrace = async (
    label: string,
    pathAndQuery: string,
    reqHeaders: Record<string, string>,
    method: string = 'GET',
    bodyPayload?: string | null
  ) => {
    const startTime = Date.now();
    const fullUrl = `${cleanProxy}${pathAndQuery}`;
    const safeHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(reqHeaders)) {
      if (k.toLowerCase() === 'authorization') {
        const parts = String(v).split(' ');
        const scheme = parts[0] || '';
        const secret = parts[1] || '';
        safeHeaders[k] = secret.length > 8 ? `${scheme} ${secret.slice(0, 8)}...***` : `${scheme} ***`;
      } else {
        safeHeaders[k] = String(v);
      }
    }

    const trace: GarminApiDebugTrace = {
      id: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      label,
      request: {
        method,
        url: fullUrl,
        headers: safeHeaders,
        body: bodyPayload || null,
      },
    };

    try {
      const response = await fetch(fullUrl, {
        method,
        headers: reqHeaders,
        body: bodyPayload || undefined,
      });

      const durationMs = Date.now() - startTime;
      const responseText = await response.text();
      const contentType = response.headers.get('content-type') || '';
      let parsedJson: any = null;
      if (responseText) {
        try {
          parsedJson = JSON.parse(responseText);
        } catch {}
      }

      trace.response = {
        status: response.status,
        statusText: response.statusText,
        contentType,
        body: responseText,
        durationMs,
      };

      traces.push(trace);
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        text: responseText,
        payload: parsedJson,
        contentType,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      trace.error = err.message || 'Network fetch failed';
      trace.response = {
        status: 0,
        statusText: 'Network / CORS Error',
        contentType: 'text/plain',
        body: err.message || 'Network fetch failure',
        durationMs,
      };
      traces.push(trace);
      return {
        ok: false,
        status: 0,
        statusText: 'Network Error',
        text: err.message || '',
        payload: null,
        contentType: '',
      };
    }
  };

  let bearerToken = cleanToken;

  // Step 1: Exchange API Key for Bearer Access Token if needed
  if (isPersonalApiKey) {
    const tokenRes = await fetchWithTrace(
      '1. Garmin API Key Exchange (POST /personal-api/personal-api-key/token)',
      '/personalapitoken-service/personal-api/personal-api-key/token',
      {
        'Authorization': `ApiKey ${cleanToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
      },
      'POST'
    );

    if (!tokenRes.ok) {
      return {
        success: false,
        syncedDays: 0,
        weeks,
        logs: [],
        traces,
        message: `Garmin API Key exchange failed (HTTP ${tokenRes.status} ${tokenRes.statusText}). Inspect request & response below.`,
        error: `Garmin API Key exchange failed (HTTP ${tokenRes.status} ${tokenRes.statusText}).`,
      };
    }

    const payload = tokenRes.payload;
    let extracted: string | undefined = [
      payload?.access_token,
      payload?.accessToken,
      payload?.token,
      payload?.bearer_token,
      payload?.data?.access_token,
      payload?.data?.token,
    ].find((c): c is string => typeof c === 'string' && c.trim().length > 0);

    if (!extracted && typeof payload === 'string' && payload.trim().length > 0) {
      extracted = payload.trim();
    }
    if (!extracted && tokenRes.text.trim()) {
      const kvMatch = tokenRes.text.match(/(?:access_token|accessToken|bearer_token|token)\s*[:=]\s*["']?([A-Za-z0-9_\-\.~]+)["']?/i);
      if (kvMatch && kvMatch[1]) extracted = kvMatch[1].trim();
    }
    if (!extracted && tokenRes.text.trim() && !/<html/i.test(tokenRes.text) && tokenRes.text.length >= 10 && !/\s/.test(tokenRes.text)) {
      extracted = tokenRes.text.trim();
    }

    if (!extracted) {
      return {
        success: false,
        syncedDays: 0,
        weeks,
        logs: [],
        traces,
        message: `Garmin returned HTTP ${tokenRes.status} without a recognized access token. Inspect response body below.`,
        error: `Garmin returned HTTP ${tokenRes.status} without a recognized access token.`,
      };
    }

    bearerToken = extracted;
  }

  const authHeaders: Record<string, string> = {
    'Authorization': `Bearer ${bearerToken}`,
    'Accept': 'application/json, text/plain, */*',
  };

  const reqTypes = getStoredGarminRequestTypes();
  const dates = Array.isArray(queryDates) ? queryDates : [queryDates];
  const collectedLogs: DailyRecoveryLog[] = [];
  let latestChecks: GarminMetricCheck[] | undefined;

  for (let idx = 0; idx < dates.length; idx++) {
    const queryDate = dates[idx];
    const prefix = dates.length > 1 ? `[${queryDate}] ` : '';

    // Step 2: Sleep endpoint (only if requested)
    let sleepRes: any = { ok: false, status: 0, statusText: 'Skipped', payload: null, text: '' };
    if (reqTypes.sleep) {
      sleepRes = await fetchWithTrace(
        `${prefix}2. Sleep Data (GET /sleep-service/sleep/dailySleep?date=${queryDate})`,
        `/sleep-service/sleep/dailySleep?date=${encodeURIComponent(queryDate)}`,
        authHeaders
      );
      if (!sleepRes.ok && sleepRes.status === 404) {
        const altSleep = await fetchWithTrace(
          `${prefix}2b. Sleep Data Alternative (GET /sleep-service/sleep/${queryDate})`,
          `/sleep-service/sleep/${encodeURIComponent(queryDate)}`,
          authHeaders
        );
        if (altSleep.ok || altSleep.payload) {
          sleepRes = altSleep;
        }
      }
    }

    // Step 3: Daily Summary (heart rate, steps, calories, stress, body battery, etc.)
    let summaryRes: any = { ok: false, status: 0, statusText: 'Skipped', payload: null, text: '' };
    if (
      reqTypes.heartRate ||
      reqTypes.steps ||
      reqTypes.calories ||
      reqTypes.bodyBattery ||
      reqTypes.stress ||
      reqTypes.respiration ||
      reqTypes.pulseOx ||
      reqTypes.vo2MaxRun ||
      reqTypes.vo2MaxBike
    ) {
      summaryRes = await fetchWithTrace(
        `${prefix}3. Daily Summary (GET /usersummary-service/usersummary/daily?calendarDate=${queryDate})`,
        `/usersummary-service/usersummary/daily?calendarDate=${encodeURIComponent(queryDate)}`,
        authHeaders
      );
      if (!summaryRes.ok && summaryRes.status === 404) {
        const altSummary = await fetchWithTrace(
          `${prefix}3b. Daily Summary Alternative (GET /usersummary-service/usersummary/daily/${queryDate})`,
          `/usersummary-service/usersummary/daily/${encodeURIComponent(queryDate)}`,
          authHeaders
        );
        if (altSummary.ok || altSummary.payload) {
          summaryRes = altSummary;
        }
      }
    }

    // Step 4 & 5: HRV Daily & Range (only if requested)
    let hrvRes: any = { ok: false, status: 0, statusText: 'Skipped', payload: null, text: '' };
    let hrvRangeRes: any = { ok: false, status: 0, statusText: 'Skipped', payload: null, text: '' };
    if (reqTypes.hrv) {
      hrvRes = await fetchWithTrace(
        `${prefix}4. HRV Daily (GET /hrv-service/hrv/${queryDate})`,
        `/hrv-service/hrv/${encodeURIComponent(queryDate)}`,
        authHeaders
      );

      hrvRangeRes = await fetchWithTrace(
        `${prefix}5. HRV Range (GET /hrv-service/hrv/daily/${queryDate}/${queryDate})`,
        `/hrv-service/hrv/daily/${encodeURIComponent(queryDate)}/${encodeURIComponent(queryDate)}`,
        authHeaders
      );
    }

    // Parse sleep
    const sleepRoot = sleepRes.payload && typeof sleepRes.payload === 'object' ? sleepRes.payload : {};
    const sleepData = sleepRoot.dailySleepDTO || sleepRoot;
    const sleepSeconds = Number(sleepData.sleepTimeSeconds ?? sleepData.durationInSeconds);
    const sleepScore = Number(sleepData.sleepScores?.overall?.value ?? sleepData.sleepScore);
    const hasSleepDuration = reqTypes.sleep && Number.isFinite(sleepSeconds) && sleepSeconds > 0;

    // Parse summary
    const summaryRoot = summaryRes.payload && typeof summaryRes.payload === 'object' ? summaryRes.payload : {};
    const summary = summaryRoot.userDailySummary || summaryRoot.dailySummary || summaryRoot.data || summaryRoot;
    const readNumber = (...keys: string[]): number | undefined => {
      for (const key of keys) {
        const value = summary[key];
        const num = typeof value === 'number' ? value : Number(value);
        if (value !== undefined && value !== null && value !== '' && Number.isFinite(num)) {
          return num;
        }
      }
      return undefined;
    };

    const steps = reqTypes.steps ? readNumber('totalSteps', 'steps', 'stepCount') : undefined;
    const activeCalories = reqTypes.calories ? readNumber('activeCalories') : undefined;
    const totalCalories = reqTypes.calories ? readNumber('totalCalories') : undefined;
    const calories = reqTypes.calories ? (readNumber('calories') ?? activeCalories ?? totalCalories) : undefined;
    const restingHeartRate = reqTypes.heartRate
      ? readNumber('restingHeartRate', 'restingHeartRateInBeatsPerMinute', 'restingHr')
      : undefined;
    const heartRate = reqTypes.heartRate ? (readNumber('heartRate', 'averageHeartRate') ?? restingHeartRate) : undefined;

    // Additional biometric metrics requested
    const bodyBattery = reqTypes.bodyBattery
      ? (readNumber('bodyBatteryMostRecentValue', 'bodyBatteryHighestValue', 'bodyBatteryLowestValue') ??
         readNumber('bodyBatteryChargedValue') ??
         (sleepData.bodyBatteryChange !== undefined ? Number(sleepData.bodyBatteryChange) : undefined))
      : undefined;

    const stress = reqTypes.stress
      ? (readNumber('averageStressLevel', 'avgSleepStress', 'maxStressLevel') ??
         (sleepData.avgSleepStress !== undefined ? Number(sleepData.avgSleepStress) : undefined))
      : undefined;

    const respiration = reqTypes.respiration
      ? (readNumber('avgWakingRespirationValue', 'averageRespirationValue', 'lowestRespirationValue') ??
         (sleepData.averageRespirationValue !== undefined ? Number(sleepData.averageRespirationValue) : undefined))
      : undefined;

    const pulseOx = reqTypes.pulseOx
      ? (readNumber('averageSpO2Value', 'lowestSpO2Value', 'highestSpO2Value', 'averageSpo2') ??
         (sleepData.averageSpO2Value !== undefined ? Number(sleepData.averageSpO2Value) : undefined))
      : undefined;

    const vo2MaxRun = reqTypes.vo2MaxRun
      ? readNumber('vo2MaxRunning', 'vo2MaxPreciseValue', 'userVo2Max', 'vo2Max')
      : undefined;

    const vo2MaxBike = reqTypes.vo2MaxBike
      ? readNumber('vo2MaxCycling', 'vo2MaxBike', 'cyclingVo2Max')
      : undefined;

    // Parse HRV
    let hrvRmssd = 0;
    if (reqTypes.hrv) {
      const hrvRoot = hrvRes.payload && typeof hrvRes.payload === 'object' ? hrvRes.payload : {};
      const hrvSummary = hrvRoot.hrvSummary || hrvRoot;
      hrvRmssd = Number(
        hrvSummary.lastNightAvg ??
        hrvSummary.averageHRV ??
        hrvSummary.hrvWeeklyAvg ??
        readNumber('lastNightAvg', 'averageHRV', 'hrvRmssd', 'overnightHrv')
      );
      if (!Number.isFinite(hrvRmssd) || hrvRmssd <= 0) {
        const rangeArr = Array.isArray(hrvRangeRes.payload)
          ? hrvRangeRes.payload
          : hrvRangeRes.payload?.hrvSummaries;
        if (Array.isArray(rangeArr) && rangeArr.length > 0) {
          const item = rangeArr[0];
          const val = Number(item?.lastNightAvg ?? item?.weeklyAvg ?? item?.averageHRV);
          if (Number.isFinite(val) && val > 0) {
            hrvRmssd = val;
          }
        }
      }
    }

    const checks: GarminMetricCheck[] = [];
    if (reqTypes.sleep) {
      checks.push({
        metric: 'Sleep Duration & Score',
        received: sleepRes.ok && hasSleepDuration,
        status: sleepRes.status,
        value: hasSleepDuration
          ? `${Math.round(sleepSeconds / 60)} min${Number.isFinite(sleepScore) && sleepScore > 0 ? `; score ${sleepScore}` : ''}`
          : undefined,
        message: sleepRes.ok
          ? (hasSleepDuration ? 'Sleep duration received' : 'Response OK, but sleep duration was not found in response.')
          : `Garmin HTTP ${sleepRes.status} ${sleepRes.statusText}`,
      });
    }

    if (reqTypes.heartRate) {
      checks.push({
        metric: 'Heart Rate / RHR',
        received: summaryRes.ok && heartRate !== undefined,
        status: summaryRes.status,
        value: heartRate !== undefined ? `${heartRate} bpm` : undefined,
        message: summaryRes.ok
          ? (heartRate !== undefined ? 'Heart rate received' : 'Response OK, but heart rate was not found in summary.')
          : `Garmin HTTP ${summaryRes.status} ${summaryRes.statusText}`,
      });
    }

    if (reqTypes.hrv) {
      checks.push({
        metric: 'HRV (rMSSD)',
        received: (hrvRes.ok || hrvRangeRes.ok) && Number.isFinite(hrvRmssd) && hrvRmssd > 0,
        status: hrvRes.status || hrvRangeRes.status,
        value: Number.isFinite(hrvRmssd) && hrvRmssd > 0 ? `${Math.round(hrvRmssd)} ms` : undefined,
        message: (hrvRes.ok || hrvRangeRes.ok)
          ? (Number.isFinite(hrvRmssd) && hrvRmssd > 0 ? 'HRV received' : 'Response OK, but overnight HRV was not found.')
          : `Garmin HTTP ${hrvRes.status} ${hrvRes.statusText}`,
      });
    }

    if (reqTypes.steps) {
      checks.push({
        metric: 'Steps',
        received: summaryRes.ok && steps !== undefined,
        status: summaryRes.status,
        value: steps !== undefined ? `${steps} steps` : undefined,
        message: summaryRes.ok ? (steps !== undefined ? 'Steps received' : 'Steps not found.') : `Garmin HTTP ${summaryRes.status}`,
      });
    }

    if (reqTypes.calories) {
      checks.push({
        metric: 'Calories',
        received: summaryRes.ok && calories !== undefined,
        status: summaryRes.status,
        value: calories !== undefined ? `${calories} kcal` : undefined,
        message: summaryRes.ok ? (calories !== undefined ? 'Calories received' : 'Calories not found.') : `Garmin HTTP ${summaryRes.status}`,
      });
    }

    if (reqTypes.bodyBattery) {
      checks.push({
        metric: 'Body Battery',
        received: (summaryRes.ok || sleepRes.ok) && bodyBattery !== undefined,
        status: summaryRes.status || sleepRes.status,
        value: bodyBattery !== undefined ? `${bodyBattery}` : undefined,
        message: bodyBattery !== undefined ? 'Body Battery received' : 'Body Battery level not found.',
      });
    }

    if (reqTypes.stress) {
      checks.push({
        metric: 'Stress',
        received: (summaryRes.ok || sleepRes.ok) && stress !== undefined,
        status: summaryRes.status || sleepRes.status,
        value: stress !== undefined ? `${stress}` : undefined,
        message: stress !== undefined ? 'Stress score received' : 'Stress level not found.',
      });
    }

    if (reqTypes.respiration) {
      checks.push({
        metric: 'Respiration',
        received: (summaryRes.ok || sleepRes.ok) && respiration !== undefined,
        status: summaryRes.status || sleepRes.status,
        value: respiration !== undefined ? `${respiration} brpm` : undefined,
        message: respiration !== undefined ? 'Respiration received' : 'Respiration rate not found.',
      });
    }

    if (reqTypes.pulseOx) {
      checks.push({
        metric: 'Pulse Ox (SpO2)',
        received: (summaryRes.ok || sleepRes.ok) && pulseOx !== undefined,
        status: summaryRes.status || sleepRes.status,
        value: pulseOx !== undefined ? `${pulseOx}%` : undefined,
        message: pulseOx !== undefined ? 'Pulse Ox (SpO2) received' : 'SpO2 not found.',
      });
    }

    if (reqTypes.vo2MaxRun) {
      checks.push({
        metric: 'VO2 Max (Run)',
        received: summaryRes.ok && vo2MaxRun !== undefined,
        status: summaryRes.status,
        value: vo2MaxRun !== undefined ? `${vo2MaxRun} ml/kg/min` : undefined,
        message: vo2MaxRun !== undefined ? 'Running VO2 Max received' : 'VO2 Max (Run) not found.',
      });
    }

    if (reqTypes.vo2MaxBike) {
      checks.push({
        metric: 'VO2 Max (Bike)',
        received: summaryRes.ok && vo2MaxBike !== undefined,
        status: summaryRes.status,
        value: vo2MaxBike !== undefined ? `${vo2MaxBike} ml/kg/min` : undefined,
        message: vo2MaxBike !== undefined ? 'Cycling VO2 Max received' : 'VO2 Max (Bike) not found.',
      });
    }

    if (!latestChecks) {
      latestChecks = checks;
    }

    const sleepMinutes = hasSleepDuration ? Math.round(sleepSeconds / 60) : 0;
    const finalRhr = (restingHeartRate && restingHeartRate > 0) ? restingHeartRate : (heartRate && heartRate > 0 ? heartRate : baselineRhr);

    const hasAnyValidMetric =
      sleepMinutes > 0 ||
      (restingHeartRate && restingHeartRate > 0) ||
      (hrvRmssd && hrvRmssd > 0) ||
      (steps !== undefined && steps > 0) ||
      (bodyBattery !== undefined && bodyBattery > 0) ||
      (stress !== undefined && stress > 0);

    if (hasAnyValidMetric) {
      collectedLogs.push({
        id: `rec_garmin_${queryDate}`,
        date: queryDate,
        restingHr: finalRhr,
        hrvRmssd: Number.isFinite(hrvRmssd) && hrvRmssd > 0 ? Math.round(hrvRmssd) : 60,
        sleepDurationMinutes: sleepMinutes,
        sleepScore: Number.isFinite(sleepScore) && sleepScore > 0 ? sleepScore : 0,
        deepSleepMinutes: Math.round(Number(sleepData.deepSleepSeconds || 0) / 60),
        remSleepMinutes: Math.round(Number(sleepData.remSleepSeconds || 0) / 60),
        lightSleepMinutes: Math.round(Number(sleepData.lightSleepSeconds || 0) / 60),
        awakeMinutes: Math.round(Number(sleepData.awakeSleepSeconds || 0) / 60),
        source: 'garmin' as const,
        notes: `Garmin sync via Cloudflare Worker for ${queryDate} UTC`,
        bodyBattery,
        stress,
        respiration,
        pulseOx,
        vo2MaxRun,
        vo2MaxBike,
        steps,
        calories,
      });
    }
  }

  if (collectedLogs.length > 0) {
    try {
      localStorage.setItem('fit_track_garmin_connected', 'true');
      localStorage.removeItem('fit_track_garmin_disconnected');
      localStorage.setItem('fit_track_garmin_token', sessionToken);
    } catch {}
  }

  const primaryDate = dates[0] || 'target date';
  const anyMetricReceived = latestChecks ? latestChecks.some((c) => c.received) : false;
  const rangeDescription = dates.length > 1
    ? `${dates[dates.length - 1]} to ${dates[0]} (${dates.length} days)`
    : `${primaryDate} (UTC)`;

  return {
    success: collectedLogs.length > 0,
    syncedDays: collectedLogs.length,
    weeks,
    logs: collectedLogs,
    checks: latestChecks,
    traces,
    message: collectedLogs.length > 0
      ? `Successfully synchronized ${collectedLogs.length} day(s) of Garmin recovery data for ${rangeDescription}.`
      : anyMetricReceived
        ? `Garmin responded for ${rangeDescription}, but some recovery metrics were missing in the telemetry payload.`
        : `Garmin Connect returned no telemetry for ${rangeDescription}. Inspect request and response logs below.`,
    error: collectedLogs.length > 0
      ? undefined
      : `Garmin Connect did not return recovery metrics for ${rangeDescription}. See request and response logs below.`,
  };
}
