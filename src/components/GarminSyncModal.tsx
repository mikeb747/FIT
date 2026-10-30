import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Zap,
  Key,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Terminal,
  Calendar,
  Globe,
  Download,
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

type SyncTab = 'token' | 'csv';

export const GarminSyncModal: React.FC<GarminSyncModalProps> = ({
  isOpen,
  onClose,
  existingLogs,
  onSyncComplete,
  baselineRhr = 41,
  theme = 'dark',
}) => {
  const [activeTab, setActiveTab] = useState<SyncTab>('token');

  // Today UTC date helper
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Date range state (default to today)
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);

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
  const [showProxyConfig, setShowProxyConfig] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.location.hostname.includes('github.io')) {
        return true;
      }
      return Boolean(localStorage.getItem('fit_track_garmin_proxy_url'));
    } catch {
      return false;
    }
  });

  const [isLoading, setIsLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [metricChecks, setMetricChecks] = useState<GarminMetricCheck[] | null>(null);
  const [checkedRange, setCheckedRange] = useState<string | null>(null);
  const [debugTraces, setDebugTraces] = useState<GarminApiDebugTrace[] | null>(null);

  // Default state: collapsed whenever this modal is opened
  const [expandedTraceIds, setExpandedTraceIds] = useState<Set<string>>(new Set());
  const [copiedTraceId, setCopiedTraceId] = useState<string | null>(null);
  const [allCopied, setAllCopied] = useState(false);

  // Reset to collapsed state whenever the modal is opened
  useEffect(() => {
    if (isOpen) {
      setExpandedTraceIds(new Set());
      setError(null);
      setSuccess(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isLight = theme === 'light';
  const isTokenValid = sessionToken.trim().length > 0;

  // Preset date helpers
  const handleSetPreset = (preset: 'today' | '7days' | '30days') => {
    const today = new Date().toISOString().slice(0, 10);
    setEndDate(today);
    if (preset === 'today') {
      setStartDate(today);
    } else if (preset === '7days') {
      const d = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
      setStartDate(d);
    } else if (preset === '30days') {
      const d = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
      setStartDate(d);
    }
  };

  const isPresetActive = (preset: 'today' | '7days' | '30days'): boolean => {
    const today = new Date().toISOString().slice(0, 10);
    if (preset === 'today') {
      return startDate === today && endDate === today;
    }
    if (preset === '7days') {
      const d = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
      return startDate === d && endDate === today;
    }
    if (preset === '30days') {
      const d = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
      return startDate === d && endDate === today;
    }
    return false;
  };

  const handleSync = async () => {
    setError(null);
    setSuccess(null);
    setMetricChecks(null);

    if (!isTokenValid) {
      setError('Please provide a Garmin session token or Personal API key.');
      return;
    }

    const rangeLabel = startDate === endDate ? `${startDate} (UTC)` : `${startDate} to ${endDate} (UTC)`;
    setCheckedRange(rangeLabel);

    const configuredProxy = proxyUrl.trim();
    const isApiKey = sessionToken.trim().startsWith('GCDC_');
    const targetEndpoint = configuredProxy
      ? `${configuredProxy.replace(/\/+$/, '')}${isApiKey ? '/personalapitoken-service/personal-api/personal-api-key/token' : '/sleep-service/sleep/dailySleep'}`
      : '/api/garmin/sync-multiweek';

    // In-flight trace indicating request start
    const inFlightTrace: GarminApiDebugTrace = {
      id: `trace_client_${Date.now()}`,
      timestamp: new Date().toISOString(),
      label: `Local Client Request Dispatched -> ${targetEndpoint} (${rangeLabel})`,
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
            startDate,
            endDate,
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
        body: `Connecting to Garmin Connect endpoints for ${rangeLabel}...`,
        durationMs: 0,
      },
    };

    setDebugTraces([inFlightTrace]);
    // Keep traces collapsed by default
    setExpandedTraceIds(new Set());
    setIsLoading(true);

    try {
      if (saveCredentials && sessionToken.trim()) {
        try {
          localStorage.setItem('fit_track_garmin_token', sessionToken.trim());
        } catch {}
      }

      setProgressMsg('Connecting to Garmin Connect service...');
      await new Promise((r) => setTimeout(r, 200));

      setProgressMsg(`Querying Garmin Connect endpoints for ${rangeLabel}...`);

      const result = await syncGarminMultiWeek({
        sessionToken: sessionToken.trim(),
        startDate,
        endDate,
        baselineRhr,
      });

      const finalTraces = result.traces && result.traces.length > 0 ? result.traces : [inFlightTrace];
      setMetricChecks(result.checks || null);
      setDebugTraces(finalTraces);
      // Keep collapsed by default
      setExpandedTraceIds(new Set());

      if (!result.success) {
        setError(result.error || 'Garmin authentication or sync failed.');
        setIsLoading(false);
        return;
      }

      if (result.logs.length === 0) {
        setSuccess(
          result.checks
            ? `Telemetry check completed for ${rangeLabel}. No full recovery record was parsed.`
            : `Connected to Garmin Connect. No new recovery records were found for ${rangeLabel}.`
        );
        setIsLoading(false);
        return;
      }

      setProgressMsg('Integrating physiological baselines and merging recovery logs...');
      await new Promise((r) => setTimeout(r, 200));

      const merged = mergeRecoveryLogs(existingLogs, result.logs);
      onSyncComplete(merged);
      setSuccess(
        `Successfully imported ${result.syncedDays} day(s) of Garmin recovery data for ${rangeLabel}!`
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
          body: JSON.stringify({ startDate, endDate, activeTab }, null, 2),
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
      setExpandedTraceIds(new Set());
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
          setError(parseErr || 'No valid entries found in uploaded file.');
          return;
        }
        const merged = mergeRecoveryLogs(existingLogs, imported);
        onSyncComplete(merged);
        setSuccess(`Successfully imported ${imported.length} days of recovery logs from CSV!`);
      }
    };
    reader.onerror = () => {
      setError('Could not read uploaded file from disk.');
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const sample = [
      'Date,Resting_HR,HRV,Sleep_Hours,Sleep_Score,Deep_Sleep_Min,REM_Sleep_Min',
      `${todayStr},41,78,8.2,88,85,100`,
      `${new Date(Date.now() - 86400000).toISOString().slice(0, 10)},42,74,7.8,82,78,95`,
      `${new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)},44,66,7.0,71,60,80`,
    ].join('\n');
    const blob = new Blob([sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fit_track_recovery_template.csv';
    a.click();
    URL.revokeObjectURL(url);
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
                  Garmin Health Data
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
          {/* Sync Method Tabs at the Top */}
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
                setCheckedRange(null);
              }}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                activeTab === 'token'
                  ? isLight
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'bg-slate-800 text-white shadow-sm'
                  : isLight
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Personal API Key
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('csv');
                setError(null);
                setMetricChecks(null);
                setCheckedRange(null);
              }}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                activeTab === 'csv'
                  ? isLight
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'bg-slate-800 text-white shadow-sm'
                  : isLight
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              CSV Import
            </button>
          </div>

          {/* TAB 1: PERSONAL API KEY */}
          {activeTab === 'token' && (
            <div className="space-y-3.5">
              {/* Target Telemetry Date (UTC) Range Selector */}
              <div
                className={`p-3.5 rounded-xl border space-y-2.5 ${
                  isLight ? 'bg-slate-50/90 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <label
                    className={`text-xs font-bold flex items-center gap-1.5 ${
                      isLight ? 'text-slate-700' : 'text-slate-300'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5 text-sky-400" />
                    <span>Target Telemetry Date (UTC)</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {startDate === endDate ? '1 Day Query' : `${startDate} → ${endDate}`}
                  </span>
                </div>

                {/* Calendar Range Inputs & Presets */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400 font-medium">From:</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-mono outline-none border focus:ring-1 focus:ring-sky-500 ${
                        isLight
                          ? 'bg-white border-slate-300 text-slate-900'
                          : 'bg-slate-900 border-slate-700 text-white'
                      }`}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400 font-medium">To:</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-mono outline-none border focus:ring-1 focus:ring-sky-500 ${
                        isLight
                          ? 'bg-white border-slate-300 text-slate-900'
                          : 'bg-slate-900 border-slate-700 text-white'
                      }`}
                    />
                  </div>

                  {/* Presets: Today, 7 days, 30 days */}
                  <div className="flex items-center gap-1.5 ml-auto">
                    <button
                      type="button"
                      onClick={() => handleSetPreset('today')}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
                        isPresetActive('today')
                          ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                          : isLight
                          ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetPreset('7days')}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
                        isPresetActive('7days')
                          ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                          : isLight
                          ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      7 days
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetPreset('30days')}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
                        isPresetActive('30days')
                          ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                          : isLight
                          ? 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      30 days
                    </button>
                  </div>
                </div>
              </div>

              {/* Just Below the Date Picker: Sync Button */}
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
                <span>{isLoading ? (progressMsg || 'Syncing...') : 'Sync'}</span>
              </button>

              {/* Personal API Key & Proxy Configuration Card */}
              <div
                className={`p-4 rounded-xl border space-y-3.5 ${
                  isLight ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-950/40 border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <span
                      className={`text-xs font-semibold ${
                        isLight ? 'text-slate-700' : 'text-slate-300'
                      }`}
                    >
                      Garmin Personal API Key or Session Token
                    </span>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Garmin Connect Personal API keys or Bearer tokens enable direct live access without two-factor authentication roadblocks.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowProxyConfig((prev) => !prev)}
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
                      proxyUrl
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                        : isLight
                        ? 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700 shadow-xs'
                        : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
                    }`}
                    title="Configure Cloudflare Worker or external proxy URL for GitHub Pages"
                  >
                    <Globe className="w-3.5 h-3.5 text-sky-400" />
                    <span>{showProxyConfig ? 'Hide Proxy URL' : 'Configure Proxy URL'}</span>
                    {proxyUrl && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>}
                  </button>
                </div>

                {/* Proxy URL Setting */}
                {(showProxyConfig || proxyUrl || isGitHubPages) && (
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
                        <Globe className="w-3.5 h-3.5 text-sky-400" />
                        <span>Garmin API Proxy URL (Cloudflare Worker / GitHub Pages)</span>
                      </label>
                      {proxyUrl && (
                        <span className="text-[10px] text-emerald-400 font-mono font-bold">✓ Custom Proxy Active</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="url"
                        placeholder="https://my-garmin-proxy.yourname.workers.dev"
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
                            ? 'bg-white border-slate-300 text-slate-900 focus:border-sky-500'
                            : 'bg-slate-950 border-slate-700 text-white focus:border-sky-500'
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
                          className="text-[11px] text-rose-400 hover:underline cursor-pointer px-1 font-semibold"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Routes live Garmin Personal API requests through your Cloudflare Worker proxy so GitHub Pages static hosting works seamlessly.
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
                    placeholder="Paste Garmin Personal API Key (GCDC_...) or Bearer token..."
                    value={sessionToken}
                    onChange={(e) => setSessionToken(e.target.value)}
                    className={`w-full rounded-xl px-3 py-2 text-xs outline-none transition-colors font-mono border ${
                      isLight
                        ? 'bg-white border-slate-200 text-slate-900 focus:border-sky-500'
                        : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-sky-500'
                    }`}
                  />
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
              </div>
            </div>
          )}

          {/* TAB 2: CSV IMPORT */}
          {activeTab === 'csv' && (
            <div
              className={`p-4 rounded-xl border space-y-4 ${
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

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400">
                  Need a template format?
                </span>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                      : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200'
                  }`}
                >
                  <Download className="w-3.5 h-3.5 text-sky-400" />
                  <span>Download Sample CSV Template</span>
                </button>
              </div>
            </div>
          )}

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
                Garmin response checks{checkedRange ? ` for ${checkedRange}` : ''}
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
                  Ready. Tap &quot;Sync&quot; above to send live requests and inspect each response in real time.
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
                  {/* Expand / Collapse button */}
                  <button
                    type="button"
                    onClick={() => {
                      if (expandedTraceIds.size > 0) {
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
                    {expandedTraceIds.size > 0 ? 'Collapse' : 'Expand'}
                  </button>

                  {/* Copy Log button */}
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
                    <span>{allCopied ? 'Copied JSON' : 'Copy Log'}</span>
                  </button>
                </div>
              </div>

              {/* Traces List - Collapsed by default */}
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
                          {trace.response && (
                            <div className="space-y-1 pt-2 border-t border-slate-800/80">
                              <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase font-sans font-bold">
                                <span>Inbound Response Received Back</span>
                                {trace.response.body && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      try {
                                        navigator.clipboard.writeText(trace.response?.body || '');
                                        setCopiedTraceId(`resp_${trace.id}`);
                                        setTimeout(() => setCopiedTraceId(null), 1500);
                                      } catch {}
                                    }}
                                    className="text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                                  >
                                    {copiedTraceId === `resp_${trace.id}` ? 'Copied Body!' : 'Copy Response Body'}
                                  </button>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Content-Type: <span className="text-slate-200">{trace.response.contentType || 'unknown'}</span>
                              </div>
                              <pre className="p-2.5 rounded-lg bg-black/60 border border-slate-800 text-slate-200 text-[10px] overflow-x-auto max-h-60 leading-relaxed">
                                {trace.response.body || '(empty body)'}
                              </pre>
                            </div>
                          )}

                          {trace.error && (
                            <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[10px]">
                              Error: {trace.error}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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
