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
} from 'lucide-react';
import type { DailyRecoveryLog } from '../types/recovery';
import { syncGarminMultiWeek, mergeRecoveryLogs, parseGarminOrTpCsv, generateMultiWeekGarminLogs } from '../utils/recoveryStorage';

interface GarminSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingLogs: DailyRecoveryLog[];
  onSyncComplete: (mergedLogs: DailyRecoveryLog[]) => void;
  baselineRhr?: number;
  theme?: 'light' | 'dark';
}

type SyncTab = 'auto' | 'token' | 'csv' | 'demo';

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
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem('fit_track_garmin_email') || 'mike.brown747@gmail.com';
    } catch {
      return 'mike.brown747@gmail.com';
    }
  });
  const [password, setPassword] = useState('gt550MABgarmin');
  const [sessionToken, setSessionToken] = useState(() => {
    try {
      return (
        localStorage.getItem('fit_track_garmin_token') ||
        'GCDC_49295cfc-ebad-4efe-932c-f508d2ed0e9d.65543f6e-9140-4e9c-a882-e7d0b62992e4.DiZsWy8QLAKsUhGEjkWPcuwB1HJXw56BHkDKelRldWc.3526889472'
      );
    } catch {
      return 'GCDC_49295cfc-ebad-4efe-932c-f508d2ed0e9d.65543f6e-9140-4e9c-a882-e7d0b62992e4.DiZsWy8QLAKsUhGEjkWPcuwB1HJXw56BHkDKelRldWc.3526889472';
    }
  });
  const [saveCredentials, setSaveCredentials] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showStravaExplanation, setShowStravaExplanation] = useState(false);

  if (!isOpen) return null;

  const isLight = theme === 'light';

  // Validation rules
  const isAutoValid = email.trim().length > 0 && password.trim().length > 0;
  const isTokenValid = sessionToken.trim().length > 0;

  const handleSync = async () => {
    setError(null);
    setSuccess(null);

    if (activeTab === 'auto' && !isAutoValid) {
      setError('Both Garmin email and password are required to sync.');
      return;
    }

    if (activeTab === 'token' && !isTokenValid) {
      setError('Please provide a Garmin session token or Personal API key.');
      return;
    }

    setIsLoading(true);

    try {
      if (saveCredentials && email) {
        try {
          localStorage.setItem('fit_track_garmin_email', email.trim());
          if (sessionToken.trim()) {
            localStorage.setItem('fit_track_garmin_token', sessionToken.trim());
          }
        } catch {}
      }

      setProgressMsg('Connecting to Garmin Connect service...');
      await new Promise((r) => setTimeout(r, 300));

      setProgressMsg(`Requesting ${weeks} weeks of recovery data from Garmin Connect...`);
      const result = await syncGarminMultiWeek({
        email: activeTab === 'auto' ? email.trim() : undefined,
        password: activeTab === 'auto' ? password.trim() : undefined,
        sessionToken: activeTab === 'token' ? sessionToken.trim() : undefined,
        weeks,
        baselineRhr,
      });

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
        setSuccess('Connected to Garmin Connect. No new recovery records were returned for this range.');
        setIsLoading(false);
        return;
      }

      setProgressMsg('Integrating physiological baselines and merging recovery logs...');
      await new Promise((r) => setTimeout(r, 200));

      const merged = mergeRecoveryLogs(existingLogs, result.logs);
      onSyncComplete(merged);
      setSuccess(
        `Successfully imported ${result.syncedDays} days (${weeks} weeks) of Garmin Connect recovery data!`
      );
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during Garmin synchronization.');
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
                Automated Sleep, Resting HR &amp; overnight HRV sync
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

          {/* Duration Selector: 2, 4, 8, 12 weeks */}
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

          {/* Sync Method Tabs */}
          <div
            className={`p-1 rounded-xl border flex items-center gap-1 ${
              isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                setActiveTab('auto');
                setError(null);
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
            <button
              type="button"
              onClick={() => {
                setActiveTab('token');
                setError(null);
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
              CSV Export
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('demo');
                setError(null);
              }}
              className={`flex-1 py-2 px-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                activeTab === 'demo'
                  ? isLight
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'bg-slate-800 text-white shadow-sm'
                  : isLight
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Demo Data
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
                    : `Sync with Token (${weeks} Weeks)`}
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

          {/* TAB 4: SAMPLE / DEMO RECOVERY DATA */}
          {activeTab === 'demo' && (
            <div
              className={`p-4 rounded-xl border space-y-3.5 ${
                isLight ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-950/40 border-slate-800'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-semibold ${
                      isLight ? 'text-slate-700' : 'text-slate-300'
                    }`}
                  >
                    Garmin Connect Sample Telemetry
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30">
                    Instant Demo
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Populate <strong>{weeks} weeks ({weeks * 7} days)</strong> of realistic Garmin Connect telemetry calibrated to your <strong>{baselineRhr} bpm baseline RHR</strong>. Includes overnight HRV rMSSD fluctuations, sleep architecture (Deep / REM / Light / Awake), daily Sleep Scores (70–93), and training strain tags.
                </p>
              </div>

              <div className={`p-3 rounded-xl border text-xs space-y-2 ${
                isLight ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
              }`}>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className={`p-2 rounded-lg ${isLight ? 'bg-slate-50' : 'bg-slate-950/60'}`}>
                    <div className="text-[10px] text-slate-400 uppercase font-bold">RHR Range</div>
                    <div className={`text-xs font-black mt-0.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>39 - 45 bpm</div>
                  </div>
                  <div className={`p-2 rounded-lg ${isLight ? 'bg-slate-50' : 'bg-slate-950/60'}`}>
                    <div className="text-[10px] text-slate-400 uppercase font-bold">HRV Range</div>
                    <div className={`text-xs font-black mt-0.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>63 - 88 ms</div>
                  </div>
                  <div className={`p-2 rounded-lg ${isLight ? 'bg-slate-50' : 'bg-slate-950/60'}`}>
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Sleep Quality</div>
                    <div className={`text-xs font-black mt-0.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>7.2h - 8.6h / 85 avg</div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setError(null);
                  const demoLogs = generateMultiWeekGarminLogs(weeks * 7, baselineRhr);
                  const merged = mergeRecoveryLogs(existingLogs, demoLogs);
                  onSyncComplete(merged);
                  setSuccess(`Successfully loaded ${demoLogs.length} days (${weeks} weeks) of Garmin Connect recovery demo data!`);
                }}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-sky-500 hover:from-amber-400 hover:to-sky-400 text-slate-950 cursor-pointer shadow-lg shadow-sky-500/20 transition-all active:scale-[0.99]"
              >
                <Sparkles className="w-4 h-4 text-slate-950" />
                <span>Load {weeks} Weeks Demo Data ({weeks * 7} Days)</span>
              </button>
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
