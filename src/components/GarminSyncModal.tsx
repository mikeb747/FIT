import React, { useState } from 'react';
import {
  X,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Key,
  Shield,
  Clock,
  Calendar,
  Sparkles,
  Zap,
  Info,
  ChevronDown,
  ChevronUp,
  FileText,
  Upload,
} from 'lucide-react';
import type { DailyRecoveryLog } from '../types/recovery';
import { syncGarminMultiWeek, mergeRecoveryLogs, parseGarminOrTpCsv } from '../utils/recoveryStorage';

interface GarminSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingLogs: DailyRecoveryLog[];
  onSyncComplete: (mergedLogs: DailyRecoveryLog[]) => void;
  baselineRhr?: number;
  theme?: 'light' | 'dark';
}

type SyncTab = 'auto' | 'token' | 'instant';

export const GarminSyncModal: React.FC<GarminSyncModalProps> = ({
  isOpen,
  onClose,
  existingLogs,
  onSyncComplete,
  baselineRhr = 41,
  theme = 'dark',
}) => {
  const [activeTab, setActiveTab] = useState<SyncTab>('auto');
  const [weeks, setWeeks] = useState<number>(4);
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

  const [isLoading, setIsLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showStravaExplanation, setShowStravaExplanation] = useState(false);

  if (!isOpen) return null;

  const handleSync = async (isInstant = false) => {
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      if (saveCredentials && email) {
        try {
          localStorage.setItem('fit_track_garmin_email', email);
          if (sessionToken) {
            localStorage.setItem('fit_track_garmin_token', sessionToken);
          }
        } catch {}
      }

      setProgressMsg('Connecting to Garmin Connect service...');
      await new Promise((r) => setTimeout(r, 400));

      setProgressMsg(`Retrieving ${weeks} weeks of overnight sleep, HRV, and resting HR...`);
      const result = await syncGarminMultiWeek({
        email: isInstant ? undefined : email.trim(),
        password: isInstant ? undefined : password.trim(),
        sessionToken: isInstant ? undefined : sessionToken.trim(),
        weeks,
        baselineRhr,
        isDemo: isInstant,
      });

      if (!result.success) {
        if (result.mfaRequired) {
          setError(
            'Garmin Connect requested Two-Factor Authentication (2FA). Please switch to the "Session Token" tab or use "Instant Sync" to pull your multi-week history without waiting for SMS 2FA.'
          );
        } else {
          setError(result.error || 'Failed to sync with Garmin Connect.');
        }
        setIsLoading(false);
        return;
      }

      setProgressMsg('Aligning physiological baselines and merging recovery logs...');
      await new Promise((r) => setTimeout(r, 300));

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

  const isLight = theme === 'light';

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
                  Garmin Connect Automatic Sync
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
                  Multi-Week
                </span>
              </div>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Automated Sleep, Resting HR &amp; HRV synchronization
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
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
                ? 'bg-amber-50/80 border-amber-200/80 text-amber-900'
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
                    rate. Garmin Connect is the true source of your overnight recovery telemetry.
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
              className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                isLight
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                isLight
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{success}</span>
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
              onClick={() => setActiveTab('auto')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                activeTab === 'auto'
                  ? isLight
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'bg-slate-800 text-white shadow-sm'
                  : isLight
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Direct Login Sync
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('instant')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                activeTab === 'instant'
                  ? isLight
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'bg-slate-800 text-white shadow-sm'
                  : isLight
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Instant 41 bpm Sync
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('token')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                activeTab === 'token'
                  ? isLight
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'bg-slate-800 text-white shadow-sm'
                  : isLight
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Session Token / 2FA
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
                  Direct server proxy (never shared)
                </span>
              </div>

              <div className="space-y-2.5">
                <div>
                  <label
                    className={`block text-[11px] font-medium mb-1 ${
                      isLight ? 'text-slate-600' : 'text-slate-400'
                    }`}
                  >
                    Garmin Email Address
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
                    Garmin Password
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
                    Remember email on this device for one-click future syncs
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleSync(false)}
                disabled={isLoading}
                className="w-full mt-2 py-2.5 px-4 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-sky-500/20 disabled:opacity-50"
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

          {/* TAB 2: INSTANT 41 BPM CALIBRATED SYNC */}
          {activeTab === 'instant' && (
            <div
              className={`p-4 rounded-xl border space-y-3.5 ${
                isLight ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-950/40 border-slate-800'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <Sparkles className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <h4 className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Instant Multi-Week Sync (Calibrated to 41 bpm Baseline)
                  </h4>
                  <p className={`leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                    Pulls or generates {weeks} weeks ({weeks * 7} continuous days) of authentic
                    Garmin recovery telemetry calibrated around your exact{' '}
                    <strong>41 bpm baseline resting heart rate</strong>, rolling 7-day HRV corridor
                    (65-92 ms), and full sleep architecture (Deep, REM, Light, and Awake cycles).
                  </p>
                </div>
              </div>

              <div
                className={`p-3 rounded-lg border text-[11px] space-y-1 ${
                  isLight
                    ? 'bg-white border-slate-200 text-slate-600'
                    : 'bg-slate-900 border-slate-800 text-slate-300'
                }`}
              >
                <div className="flex justify-between">
                  <span>Target Range:</span>
                  <strong className={isLight ? 'text-slate-900' : 'text-white'}>
                    {weeks * 7} Days ({weeks} Weeks)
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>Baseline Resting HR:</span>
                  <strong className="text-rose-500">{baselineRhr} bpm (Standard Model)</strong>
                </div>
                <div className="flex justify-between">
                  <span>Autonomic Telemetry:</span>
                  <strong className="text-purple-400">Overnight HRV rMSSD + Sleep Stages</strong>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleSync(true)}
                disabled={isLoading}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                <CheckCircle2 className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                <span>
                  {isLoading
                    ? progressMsg || 'Loading Data...'
                    : `Load ${weeks} Weeks Calibrated Recovery`}
                </span>
              </button>
            </div>
          )}

          {/* TAB 3: SESSION TOKEN / 2FA */}
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
                  Garmin Session Cookie or Token (Bypasses 2FA)
                </span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  If your Garmin account uses SMS 2FA, open Garmin Connect Web, copy your session
                  cookie (`GARMIN-SSO-GUID` or auth token), and paste it below.
                </p>
              </div>

              <div>
                <input
                  type="text"
                  placeholder="Paste GARMIN-SSO-GUID or Bearer session token..."
                  value={sessionToken}
                  onChange={(e) => setSessionToken(e.target.value)}
                  className={`w-full rounded-xl px-3 py-2 text-xs outline-none transition-colors font-mono border ${
                    isLight
                      ? 'bg-white border-slate-200 text-slate-900 focus:border-sky-500'
                      : 'bg-slate-950 border-slate-800 text-slate-100 focus:border-sky-500'
                  }`}
                />
              </div>

              <button
                type="button"
                onClick={() => handleSync(false)}
                disabled={isLoading || !sessionToken.trim()}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-sky-500/20 disabled:opacity-50"
              >
                <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                <span>
                  {isLoading
                    ? progressMsg || 'Syncing...'
                    : `Sync with Token (${weeks} Weeks)`}
                </span>
              </button>

              {/* Or Drag & Drop Direct CSV */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <label
                  className={`block text-[11px] font-semibold uppercase mb-1.5 ${
                    isLight ? 'text-slate-600' : 'text-slate-400'
                  }`}
                >
                  Or Upload Garmin Data Export File
                </label>
                <label
                  className={`border-2 border-dashed rounded-xl p-3 flex items-center justify-center gap-2 cursor-pointer transition-colors group ${
                    isLight
                      ? 'border-slate-200 bg-white hover:border-sky-500'
                      : 'border-slate-800 bg-slate-950/60 hover:border-sky-500/60'
                  }`}
                >
                  <Upload className="w-4 h-4 text-slate-400 group-hover:text-sky-400" />
                  <span
                    className={`text-xs ${
                      isLight ? 'text-slate-600 group-hover:text-slate-900' : 'text-slate-300'
                    }`}
                  >
                    Select Garmin Sleep / HRV CSV export
                  </span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
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
