import React, { useState } from 'react';
import {
  X,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Shield,
  Zap,
  Info,
  Key,
  Lock,
  Upload,
  FileText,
  AlertTriangle,
  Sparkles,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Terminal,
  Calendar,
} from 'lucide-react';
import type { DailyRecoveryLog, GarminApiDebugTrace } from '../types/recovery';
import {
  syncGarminMultiWeek,
  mergeRecoveryLogs,
  parseGarminOrTpCsv,
  type GarminMetricCheck,
} from '../utils/recoveryStorage';

interface GarminSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingLogs: DailyRecoveryLog[];
  onSyncComplete: (mergedLogs: DailyRecoveryLog[]) => void;
  baselineRhr?: number;
  theme?: 'light' | 'dark';
}

type SyncTab = 'token' | 'auto' | 'csv';

export const GarminSyncModal: React.FC<GarminSyncModalProps> = ({
  isOpen,
  onClose,
  existingLogs,
  onSyncComplete,
  baselineRhr = 41,
  theme = 'dark',
}) => {
  const [activeTab, setActiveTab] = useState<SyncTab>('token');
  const [weeks, setWeeks] = useState<number>(4);
  const [selectedDate, setSelectedDate] = useState<string>('2026-10-28');
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem('fit_track_garmin_email') || '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [sessionToken, setSessionToken] = useState(() => {
    try {
      return localStorage.getItem('fit_track_garmin_token') || '';
    } catch {
      return '';
    }
  });
  const [saveCredentials, setSaveCredentials] = useState(true);

  const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.includes('github.io');
  const [proxyUrl, setProxyUrl] = useState(() => {
    try {
      return localStorage.getItem('fit_track_garmin_proxy_url') || '';
    } catch {
      return '';
    }
  });
  const [showProxyConfig, setShowProxyConfig] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [metricChecks, setMetricChecks] = useState<GarminMetricCheck[] | null>(null);
  const [checkedDate, setCheckedDate] = useState<string | null>(null);
  const [debugTraces, setDebugTraces] = useState<GarminApiDebugTrace[] | null>(null);
  const [expandedTraceIds, setExpandedTraceIds] = useState<Set<string>>(new Set());
  const [copiedTraceId, setCopiedTraceId] = useState<string | null>(null);
  const [allCopied, setAllCopied] = useState(false);
  const [showStravaExplanation, setShowStravaExplanation] = useState(false);

  if (!isOpen) return null;

  const isLight = theme === 'light';

  // Validation rules
  const isAutoValid = email.trim().length > 0 && password.trim().length > 0;
  const isTokenValid = sessionToken.trim().length > 0;

  const handleSync = async () => {
    setError(null);
    setSuccess(null);
    setMetricChecks(null);
    setCheckedDate(selectedDate);

    if (activeTab === 'auto' && !isAutoValid) {
      setError('Both Garmin email and password are required to sync.');
      return;
    }

    if (activeTab === 'token' && !isTokenValid) {
      setError('Please provide a Garmin session token or Personal API key.');
      return;
    }

    const queryDate = activeTab === 'token' ? selectedDate : undefined;

    const configuredProxy = proxyUrl.trim();
    const targetEndpoint = configuredProxy
      ? `${configuredProxy.replace(/\/+$/, '')}/api/garmin/sync-multiweek`
      : '/api/garmin/sync-multiweek';

    // Immediately create an in-flight trace so the user sees live request progress
    const inFlightTrace: GarminApiDebugTrace = {
      id: `trace_client_${Date.now()}`,
      timestamp: new Date().toISOString(),
      label: `Local Client Request Dispatched -> ${targetEndpoint} (${queryDate || `${weeks}w`} UTC)`,
      request: {
        method: 'POST',
        url: targetEndpoint,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': sessionToken.trim()
            ? (sessionToken.trim().startsWith('GCDC_') ? 'ApiKey GCDC_...***' : 'Bearer ***')
            : '(none)',
        },
        body: JSON.stringify(
          {
            activeTab,
            targetDate: queryDate,
            weeks,
            hasSessionToken: Boolean(sessionToken.trim()),
          },
          null,
          2
        ),
      },
      response: {
        status: 0,
        statusText: 'Connecting to Garmin proxy...',
        contentType: 'application/json',
        body: 'Connecting to Garmin Connect endpoints: API Key Exchange, Sleep, Daily Summary, and HRV...',
        durationMs: 0,
      },
    };

    setDebugTraces([inFlightTrace]);
    setExpandedTraceIds(new Set([inFlightTrace.id]));
    setIsLoading(true);

    try {
      if (saveCredentials) {
        try {
          if (email.trim()) {
            localStorage.setItem('fit_track_garmin_email', email.trim());
          }
          if (sessionToken.trim()) {
            localStorage.setItem('fit_track_garmin_token', sessionToken.trim());
          }
        } catch {}
      }

      setProgressMsg('Connecting to Garmin Connect service...');
      await new Promise((r) => setTimeout(r, 200));

      setProgressMsg(
        activeTab === 'token'
          ? `Querying Garmin Connect live API endpoints for ${selectedDate} (UTC)...`
          : `Requesting ${weeks} weeks of recovery data from Garmin Connect...`
      );

      const result = await syncGarminMultiWeek({
        email: activeTab === 'auto' ? email.trim() : undefined,
        password: activeTab === 'auto' ? password.trim() : undefined,
        sessionToken: activeTab === 'token' ? sessionToken.trim() : undefined,
        weeks,
        debugDate: queryDate,
        baselineRhr,
      });

      const finalTraces = result.traces && result.traces.length > 0 ? result.traces : [inFlightTrace];
      setMetricChecks(result.checks || null);
      setDebugTraces(finalTraces);
      setExpandedTraceIds(new Set(finalTraces.map((t) => t.id)));

      if (!result.success) {
        if (result.mfaRequired) {
          setError(
            result.error ||
              'Garmin Connect requires Two-Factor Authentication (2FA) verification. Please switch to the "Personal API Key / Token" tab to connect securely.'
          );
        } else {
          setError(result.error || 'Garmin authentication or sync failed.');
        }
        setIsLoading(false);
        return;
      }

      if (result.logs.length === 0) {
        setSuccess(
          result.checks
            ? `Telemetry check completed for ${selectedDate} (UTC). No full recovery record was parsed.`
            : 'Connected to Garmin Connect. No new recovery records were returned for this range.'
        );
        setIsLoading(false);
        return;
      }

      setProgressMsg('Integrating physiological baselines and merging recovery logs...');
      await new Promise((r) => setTimeout(r, 200));

      const merged = mergeRecoveryLogs(existingLogs, result.logs);
      onSyncComplete(merged);
      setSuccess(
        result.checks
          ? `Successfully imported ${result.syncedDays} day of Garmin Connect recovery data for ${selectedDate} (UTC).`
          : `Successfully imported ${result.syncedDays} days (${weeks} weeks) of Garmin Connect recovery data!`
      );
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during Garmin synchronization.');
      const errTrace: GarminApiDebugTrace = {
        id: `trace_err_${Date.now()}`,
        timestamp: new Date().toISOString(),
        label: `Synchronization Exception`,
        request: {
          method: 'POST',
          url: '/api/garmin/sync-multiweek',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queryDate, activeTab }, null, 2),
        },
        response: {
          status: 0,
          statusText: 'Client Exception',
          contentType: 'text/plain',
          body: err.message || 'Client Exception during fetch',
          durationMs: 0,
        },
        error: err.message,
      };
      setDebugTraces([errTrace]);
      setExpandedTraceIds(new Set([errTrace.id]));
    } finally {
      setIsLoading(false);
      setProgressMsg('');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccess(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const { imported, error: parseErr } = parseGarminOrTpCsv(content);
        if (parseErr || imported.length === 0) {
          setError(parseErr || 'No valid entries found in uploaded Garmin file.');
          return;
        }
        const merged = mergeRecoveryLogs(existingLogs, imported);
        onSyncComplete(merged);
        setSuccess(`Successfully imported ${imported.length} days of Garmin logs from CSV!`);
      }
    };
    reader.onerror = () => {
      setError('Could not read uploaded file from disk.');
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`rounded-2xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border ${
          isLight
            ? 'bg-white border-slate-200 text-slate-900 shadow-xl'
            : 'bg-[#0f111a] border-slate-800 text-slate-100'
        }`}
      >
        {/* Header */}
        <div
          className={`px-5 py-4 border-b flex items-center justify-between ${
            isLight ? 'bg-slate-50/90 border-slate-200' : 'bg-slate-900/70 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 font-extrabold text-sm">
              <Zap className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Garmin Connect Wellness Sync
                </h2>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30 font-mono">
                  Live Connect
                </span>
              </div>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Garmin health and recovery data sync
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isLight
                ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Strava Explanation Callout Banner */}
          <div
            className={`p-3.5 rounded-xl border transition-all text-xs ${
              isLight
                ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                : 'bg-amber-500/10 border-amber-500/25 text-amber-200'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold">Why Garmin Connect instead of Strava?</span>
                  <button
                    type="button"
                    onClick={() => setShowStravaExplanation((prev) => !prev)}
                    className="text-[11px] font-semibold underline cursor-pointer ml-2 hover:opacity-80"
                  >
                    {showStravaExplanation ? 'Hide info' : 'Learn why'}
                  </button>
                </div>
                {showStravaExplanation ? (
                  <p className="mt-1.5 leading-relaxed text-[11px] opacity-90">
                    <strong>Strava API Scope:</strong> Strava&apos;s developer API is strictly
                    restricted to physical activity workouts (GPS traces, pace, power, and activity
                    HR). Strava does <em>not</em> store or expose 24/7 background biometric telemetry
                    such as sleep stages (Deep/REM), overnight HRV rMSSD, or waking resting heart
                    rate. Garmin Connect is the authentic source of your overnight recovery telemetry.
                  </p>
                ) : (
                  <p className="mt-0.5 leading-snug text-[11px] opacity-80">
                    Strava&apos;s API only contains workout activities, not sleep or overnight HRV.
                    Garmin Connect records continuous recovery data directly from your watch.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Alerts */}
          {error && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                isLight
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <div className="space-y-1">
                <span className="font-bold block">Garmin Connection Notice</span>
                <span className="leading-relaxed block">{error}</span>
              </div>
            </div>
          )}

          {success && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                isLight
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
              <span className="leading-relaxed">{success}</span>
            </div>
          )}

          {metricChecks && (
            <div
              className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                isLight
                  ? 'bg-slate-50 border-slate-200 text-slate-700'
                  : 'bg-slate-950/60 border-slate-800 text-slate-300'
              }`}
              aria-live="polite"
            >
              <span className="font-bold block">
                Garmin response checks{checkedDate ? ` for ${checkedDate} (UTC)` : ''}
              </span>
              {metricChecks.map((check) => (
                <div key={check.metric} className="flex items-start justify-between gap-3">
                  <span>{check.metric}</span>
                  <span className="text-right">
                    {check.received ? String(check.value) : check.message}
                    {check.status !== undefined ? ` (HTTP ${check.status})` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ========================================================= */}
          {/* LIVE REQUEST & RESPONSE DEBUG INSPECTOR */}
          {/* ========================================================= */}
          {(!debugTraces || debugTraces.length === 0) && activeTab === 'token' && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-900/40 border-slate-800 text-slate-400'
              }`}
            >
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-sky-400 shrink-0" />
                <span>
                  <strong className={isLight ? 'text-slate-800' : 'text-slate-200'}>Garmin API Request & Response Inspector: </strong>
                  Ready. Tap &quot;Sync with Token&quot; below to send live requests and inspect each response in real time.
                </span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0">
                Ready
              </span>
            </div>
          )}

          {debugTraces && debugTraces.length > 0 && (
            <div
              className={`rounded-2xl border overflow-hidden text-xs shadow-sm ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/80 border-slate-800'
              }`}
            >
              {/* Toolbar */}
              <div
                className={`p-3 border-b flex items-center justify-between gap-2 ${
                  isLight ? 'bg-slate-100/80 border-slate-200' : 'bg-slate-900/80 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-sky-400" />
                  <span className="font-extrabold">
                    Garmin API Request & Response Inspector
                  </span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      isLight ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {debugTraces.length} captured
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (expandedTraceIds.size === debugTraces.length) {
                        setExpandedTraceIds(new Set());
                      } else {
                        setExpandedTraceIds(new Set(debugTraces.map((t) => t.id)));
                      }
                    }}
                    className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                      isLight
                        ? 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                        : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    {expandedTraceIds.size === debugTraces.length ? 'Collapse All' : 'Expand All'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      try {
                        navigator.clipboard.writeText(JSON.stringify(debugTraces, null, 2));
                        setAllCopied(true);
                        setTimeout(() => setAllCopied(false), 2000);
                      } catch {}
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 border transition-colors cursor-pointer ${
                      allCopied
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        : isLight
                        ? 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                        : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200'
                    }`}
                    title="Copy all requests and responses as JSON"
                  >
                    {allCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{allCopied ? 'Copied JSON' : 'Copy All Logs'}</span>
                  </button>
                </div>
              </div>

              {/* Traces List */}
              <div className="p-2 space-y-2">
                {debugTraces.map((trace) => {
                  const isExpanded = expandedTraceIds.has(trace.id);
                  const isSuccess = trace.response && trace.response.status >= 200 && trace.response.status < 300;
                  const is404 = trace.response && trace.response.status === 404;
                  const isAuthError = trace.response && (trace.response.status === 401 || trace.response.status === 403);
                  const isPost = trace.request.method === 'POST';

                  return (
                    <div
                      key={trace.id}
                      className={`rounded-xl border transition-all ${
                        isLight
                          ? 'bg-white border-slate-200'
                          : 'bg-slate-900/60 border-slate-800/80'
                      }`}
                    >
                      {/* Trace Header / Toggle */}
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedTraceIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(trace.id)) {
                              next.delete(trace.id);
                            } else {
                              next.add(trace.id);
                            }
                            return next;
                          });
                        }}
                        className="w-full p-2.5 flex items-center justify-between text-left gap-2 cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-black font-mono uppercase shrink-0 ${
                              isPost
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                            }`}
                          >
                            {trace.request.method}
                          </span>
                          <span className="font-bold text-xs truncate">
                            {trace.label}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {trace.response ? (
                            <span
                              className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-black border ${
                                isSuccess
                                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                                  : isAuthError
                                  ? 'bg-rose-500/20 border-rose-500/35 text-rose-400'
                                  : is404
                                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                                  : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                              }`}
                            >
                              HTTP {trace.response.status} {trace.response.statusText || (isSuccess ? 'OK' : '')}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full font-mono text-[10px] font-black bg-rose-500/15 border border-rose-500/30 text-rose-400">
                              Error
                            </span>
                          )}

                          {trace.response?.durationMs !== undefined && (
                            <span className="text-[10px] font-mono text-slate-400">
                              {trace.response.durationMs}ms
                            </span>
                          )}

                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                      </button>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div
                          className={`p-3 border-t space-y-3 font-mono text-[11px] ${
                            isLight
                              ? 'bg-slate-50/70 border-slate-200'
                              : 'bg-slate-950/70 border-slate-800'
                          }`}
                        >
                          {/* OUTBOUND REQUEST */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase font-sans font-bold">
                              <span>Outbound Request Sent</span>
                              <button
                                type="button"
                                onClick={() => {
                                  try {
                                    navigator.clipboard.writeText(trace.request.url);
                                    setCopiedTraceId(`url_${trace.id}`);
                                    setTimeout(() => setCopiedTraceId(null), 1500);
                                  } catch {}
                                }}
                                className="text-sky-400 hover:underline flex items-center gap-1 cursor-pointer"
                              >
                                {copiedTraceId === `url_${trace.id}` ? 'Copied URL!' : 'Copy URL'}
                              </button>
                            </div>
                            <div className="p-2 rounded-lg bg-black/40 border border-slate-800 text-sky-300 break-all">
                              {trace.request.method} {trace.request.url}
                            </div>
                            <div className="text-[10px] text-slate-400 pt-1">Request Headers:</div>
                            <pre className="p-2 rounded-lg bg-black/40 border border-slate-800 text-slate-300 text-[10px] overflow-x-auto">
                              {JSON.stringify(trace.request.headers, null, 2)}
                            </pre>
                            {trace.request.body && (
                              <>
                                <div className="text-[10px] text-slate-400 pt-1">Request Payload:</div>
                                <pre className="p-2 rounded-lg bg-black/40 border border-slate-800 text-slate-300 text-[10px] overflow-x-auto">
                                  {trace.request.body}
                                </pre>
                              </>
                            )}
                          </div>

                          {/* INBOUND RESPONSE */}
                          <div className="space-y-1 pt-1 border-t border-slate-800/80">
                            <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase font-sans font-bold">
                              <span>Inbound Response Received Back</span>
                              <button
                                type="button"
                                onClick={() => {
                                  try {
                                    navigator.clipboard.writeText(trace.response?.body || '');
                                    setCopiedTraceId(`res_${trace.id}`);
                                    setTimeout(() => setCopiedTraceId(null), 1500);
                                  } catch {}
                                }}
                                className="text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                              >
                                {copiedTraceId === `res_${trace.id}` ? 'Copied Body!' : 'Copy Response Body'}
                              </button>
                            </div>

                            <div className="flex items-center gap-2 text-[10px]">
                              <span className="text-slate-400">Content-Type:</span>
                              <span className="text-slate-300">{trace.response?.contentType || 'unknown'}</span>
                            </div>

                            <pre className="p-2.5 rounded-lg bg-black/60 border border-slate-800 text-slate-200 text-[11px] overflow-x-auto max-h-56 leading-relaxed select-all">
                              {(() => {
                                const body = trace.response?.body;
                                if (!body || !body.trim()) return '(empty response body)';
                                try {
                                  return JSON.stringify(JSON.parse(body), null, 2);
                                } catch {
                                  return body;
                                }
                              })()}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Duration Selector: 2, 4, 8, 12 weeks */}
          {activeTab !== 'token' && (
            <div>
              <label
                className={`block text-xs font-bold uppercase tracking-wider mb-2 ${
                  isLight ? 'text-slate-600' : 'text-slate-400'
                }`}
              >
                Sync Duration (Historical Range)
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { w: 2, label: '2 Weeks', days: '14 Days' },
                  { w: 4, label: '4 Weeks', days: '28 Days', rec: true },
                  { w: 8, label: '8 Weeks', days: '56 Days' },
                  { w: 12, label: '12 Weeks', days: '84 Days' },
                ].map((opt) => (
                  <button
                    key={opt.w}
                    type="button"
                    onClick={() => setWeeks(opt.w)}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      weeks === opt.w
                        ? isLight
                          ? 'bg-sky-50 border-sky-500 text-sky-900 ring-2 ring-sky-500/20 shadow-xs'
                          : 'bg-sky-500/15 border-sky-500 text-white shadow-sm ring-1 ring-sky-500/30'
                        : isLight
                        ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800/80'
                    }`}
                  >
                    <div className="font-extrabold text-xs flex items-center justify-center gap-1">
                      <span>{opt.label}</span>
                      {opt.rec && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-sky-500 text-white font-black">
                          ★
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{opt.days}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'token' && (
            <div
              className={`p-3 rounded-xl border text-xs ${
                isLight
                  ? 'bg-sky-50 border-sky-200 text-sky-800'
                  : 'bg-sky-500/10 border-sky-500/25 text-sky-200'
              }`}
            >
              Token sync checks one UTC day: two days ago. Steps, calories, and heart rate are read
              from the daily summary; sleep is requested after that response.
            </div>
          )}

          {/* Sync Method Tabs */}
          <div
            className={`p-1 rounded-xl border flex items-center gap-1 ${
              isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                setActiveTab('token');
                setError(null);
                setMetricChecks(null);
                setCheckedDate(null);
              }}
              className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                activeTab === 'token'
                  ? isLight
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'bg-slate-800 text-white shadow-sm'
                  : isLight
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Personal API Key / Token
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('csv');
                setError(null);
                setMetricChecks(null);
                setCheckedDate(null);
              }}
              className={`flex-1 py-2 px-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                activeTab === 'csv'
                  ? isLight
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'bg-slate-800 text-white shadow-sm'
                  : isLight
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              CSV Export (Instant)
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('auto');
                setError(null);
                setMetricChecks(null);
                setCheckedDate(null);
              }}
              className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                activeTab === 'auto'
                  ? isLight
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'bg-slate-800 text-white shadow-sm'
                  : isLight
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Direct Login (Email/Pass)
            </button>
          </div>

          {/* TAB 1: DIRECT LOGIN SYNC */}
          {activeTab === 'auto' && (
            <div
              className={`p-4 rounded-xl border space-y-3.5 ${
                isLight ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-950/40 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-semibold ${
                    isLight ? 'text-slate-700' : 'text-slate-300'
                  }`}
                >
                  Garmin Connect Credentials
                </span>
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  Credentials required
                </span>
              </div>

              <div className="space-y-2.5">
                <div>
                  <label
                    className={`block text-[11px] font-medium mb-1 ${
                      isLight ? 'text-slate-600' : 'text-slate-400'
                    }`}
                  >
                    Garmin Email Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="athlete@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`w-full rounded-xl px-3 py-2 text-xs outline-none transition-colors border ${
                      isLight
                        ? 'bg-white border-slate-200 text-slate-900 focus:border-sky-500'
                        : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-sky-500'
                    }`}
                  />
                </div>

                <div>
                  <label
                    className={`block text-[11px] font-medium mb-1 ${
                      isLight ? 'text-slate-600' : 'text-slate-400'
                    }`}
                  >
                    Garmin Password <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`w-full rounded-xl px-3 py-2 text-xs outline-none transition-colors border ${
                      isLight
                        ? 'bg-white border-slate-200 text-slate-900 focus:border-sky-500'
                        : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-sky-500'
                    }`}
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="save_garmin_creds"
                    checked={saveCredentials}
                    onChange={(e) => setSaveCredentials(e.target.checked)}
                    className="accent-sky-500 rounded"
                  />
                  <label
                    htmlFor="save_garmin_creds"
                    className={`text-xs select-none ${
                      isLight ? 'text-slate-600' : 'text-slate-400'
                    }`}
                  >
                    Remember email on this device
                  </label>
                </div>
              </div>

              {!isAutoValid && (
                <div
                  className={`p-2.5 rounded-lg border text-[11px] flex items-center gap-2 ${
                    isLight
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                  <span>Enter both your Garmin email and password to enable synchronization.</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleSync}
                disabled={isLoading || !isAutoValid}
                className={`w-full mt-2 py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  isAutoValid && !isLoading
                    ? 'bg-sky-500 hover:bg-sky-400 text-slate-950 cursor-pointer shadow-lg shadow-sky-500/20'
                    : 'bg-slate-800/60 text-slate-500 cursor-not-allowed border border-slate-700/40'
                }`}
              >
                <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                <span>
                  {isLoading
                    ? progressMsg || 'Connecting...'
                    : `Sync ${weeks} Weeks from Garmin Connect`}
                </span>
              </button>
            </div>
          )}

          {/* TAB 2: PERSONAL API KEY / SESSION TOKEN */}
          {activeTab === 'token' && (
            <div
              className={`p-4 rounded-xl border space-y-3.5 ${
                isLight ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-950/40 border-slate-800'
              }`}
            >
              <div className="space-y-1">
                <span
                  className={`text-xs font-semibold ${
                    isLight ? 'text-slate-700' : 'text-slate-300'
                  }`}
                >
                  Garmin Personal API Key or Session Token
                </span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Garmin Connect Personal API keys or session cookies (`GARMIN-SSO-GUID` / Bearer token)
                  enable direct live access without two-factor authentication roadblocks.
                </p>
              </div>

              {/* GitHub Pages Host Warning & Recommendations */}
              {isGitHubPages && !proxyUrl && (
                <div
                  className={`p-3 rounded-xl border text-xs space-y-2.5 ${
                    isLight
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="font-bold block">Running on GitHub Pages (Static Hosting)</span>
                      <p className="text-[11px] leading-relaxed">
                        GitHub Pages is a static file host without a Node.js backend. POST requests to <code>/api/garmin</code> return <strong>HTTP 405 Method Not Allowed</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap pt-0.5">
                    <button
                      type="button"
                      onClick={() => setActiveTab('csv')}
                      className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-[11px] cursor-pointer shadow-xs"
                    >
                      Use CSV Export (Instant Browser Import)
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowProxyConfig((prev) => !prev)}
                      className={`px-3 py-1.5 rounded-lg border font-semibold text-[11px] cursor-pointer ${
                        isLight
                          ? 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                          : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200'
                      }`}
                    >
                      {showProxyConfig ? 'Hide Proxy Settings' : 'Configure Proxy URL'}
                    </button>
                  </div>
                </div>
              )}

              {/* Optional Proxy URL Setting */}
              {(showProxyConfig || proxyUrl) && (
                <div
                  className={`p-3 rounded-xl border space-y-2 ${
                    isLight ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <label
                      className={`text-[11px] font-bold ${
                        isLight ? 'text-slate-700' : 'text-slate-300'
                      }`}
                    >
                      Garmin API Proxy URL (Optional for GitHub Pages)
                    </label>
                    {proxyUrl && (
                      <span className="text-[10px] text-emerald-400 font-mono">Custom Proxy Active</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="url"
                      placeholder="e.g. https://my-garmin-proxy.workers.dev"
                      value={proxyUrl}
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        setProxyUrl(val);
                        try {
                          if (val) {
                            localStorage.setItem('fit_track_garmin_proxy_url', val);
                          } else {
                            localStorage.removeItem('fit_track_garmin_proxy_url');
                          }
                        } catch {}
                      }}
                      className={`flex-1 rounded-xl px-3 py-1.5 text-xs font-mono outline-none border ${
                        isLight
                          ? 'bg-white border-slate-300 text-slate-900'
                          : 'bg-slate-950 border-slate-700 text-white'
                      }`}
                    />
                    {proxyUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setProxyUrl('');
                          try {
                            localStorage.removeItem('fit_track_garmin_proxy_url');
                          } catch {}
                        }}
                        className="text-[11px] text-rose-400 hover:underline cursor-pointer px-1"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Set a CORS proxy or Cloud Run / Worker URL if you want live API calls from a static host. Leave empty when using the local Node server.
                  </p>
                </div>
              )}

              <div>
                <label
                  className={`block text-[11px] font-medium mb-1 ${
                    isLight ? 'text-slate-600' : 'text-slate-400'
                  }`}
                >
                  Personal API Key / Session Token <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Paste Garmin Personal API Key or GARMIN-SSO-GUID token..."
                  value={sessionToken}
                  onChange={(e) => setSessionToken(e.target.value)}
                  className={`w-full rounded-xl px-3 py-2 text-xs outline-none transition-colors font-mono border ${
                    isLight
                      ? 'bg-white border-slate-200 text-slate-900 focus:border-sky-500'
                      : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-sky-500'
                  }`}
                />
              </div>

              {/* Target Telemetry Date (UTC) Selector */}
              <div
                className={`p-3 rounded-xl border space-y-2 ${
                  isLight ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-900/60 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <label
                    className={`text-[11px] font-bold flex items-center gap-1.5 ${
                      isLight ? 'text-slate-700' : 'text-slate-300'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5 text-sky-400" />
                    <span>Target Telemetry Date (UTC)</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">1 Day Endpoint Query</span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono outline-none border focus:ring-1 focus:ring-sky-500 ${
                      isLight
                        ? 'bg-white border-slate-300 text-slate-900'
                        : 'bg-slate-950 border-slate-700 text-white'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedDate('2026-10-28')}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
                      selectedDate === '2026-10-28'
                        ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                        : isLight
                        ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    28 Oct 2026 (Target)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
                      setSelectedDate(d);
                    }}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
                      isLight
                        ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    Yesterday
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date().toISOString().slice(0, 10);
                      setSelectedDate(d);
                    }}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
                      isLight
                        ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    Today
                  </button>
                </div>
              </div>

              {!isTokenValid && (
                <div
                  className={`p-2.5 rounded-lg border text-[11px] flex items-center gap-2 ${
                    isLight
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                  <span>Paste your token or Personal API key to enable synchronization.</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleSync}
                disabled={isLoading || !isTokenValid}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  isTokenValid && !isLoading
                    ? 'bg-sky-500 hover:bg-sky-400 text-slate-950 cursor-pointer shadow-lg shadow-sky-500/20'
                    : 'bg-slate-800/60 text-slate-500 cursor-not-allowed border border-slate-700/40'
                }`}
              >
                <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                <span>
                  {isLoading
                    ? progressMsg || 'Syncing...'
                    : 'Sync with Token (1 Day)'}
                </span>
              </button>
            </div>
          )}

          {/* TAB 3: CSV FILE EXPORT */}
          {activeTab === 'csv' && (
            <div
              className={`p-4 rounded-xl border space-y-3.5 ${
                isLight ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-950/40 border-slate-800'
              }`}
            >
              <div className="space-y-1">
                <span
                  className={`text-xs font-semibold ${
                    isLight ? 'text-slate-700' : 'text-slate-300'
                  }`}
                >
                  Direct Garmin / TrainingPeaks CSV Import
                </span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Export your wellness or sleep CSV file directly from Garmin Connect Web or
                  TrainingPeaks and upload it here to import genuine physiological metrics without
                  entering login credentials.
                </p>
              </div>

              <label
                className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors group ${
                  isLight
                    ? 'border-slate-200 bg-white hover:border-sky-500'
                    : 'border-slate-800 bg-slate-950/60 hover:border-sky-500/60'
                }`}
              >
                <Upload className="w-7 h-7 text-slate-400 group-hover:text-sky-400" />
                <span
                  className={`text-xs font-bold ${
                    isLight ? 'text-slate-700 group-hover:text-slate-900' : 'text-slate-300'
                  }`}
                >
                  Click to select Garmin Sleep / HRV CSV export
                </span>
                <span className="text-[11px] text-slate-400">
                  Accepts Garmin Connect Sleep reports &amp; TrainingPeaks Wellness exports (.csv)
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`px-5 py-3 border-t flex items-center justify-between ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          <span className="text-[11px] text-slate-400">
            Current logs: <strong>{existingLogs.length} days</strong> tracked
          </span>
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              isLight
                ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
