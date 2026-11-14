import React, { useState, useEffect } from 'react';
import {
  Cloud,
  CheckCircle2,
  RefreshCw,
  LogOut,
  ShieldCheck,
  Loader2,
  AlertCircle,
  UserCheck,
} from 'lucide-react';
import {
  subscribeToCloudSyncStatus,
  signInToCloudVault,
  signOutFromCloudVault,
  syncAllSettingsToCloud,
  CloudSyncStatus,
} from '../utils/firebaseCloudSync';

interface CloudVaultSectionProps {
  theme?: 'dark' | 'light';
}

export const CloudVaultSection: React.FC<CloudVaultSectionProps> = ({ theme = 'dark' }) => {
  const [status, setStatus] = useState<CloudSyncStatus | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    return subscribeToCloudSyncStatus((s) => {
      setStatus(s);
    });
  }, []);

  const isLight = theme === 'light';

  const handleSignIn = async () => {
    setActionBusy(true);
    setStatusMessage(null);
    try {
      await signInToCloudVault();
      await syncAllSettingsToCloud();
      setStatusMessage('All settings, zones, integrations, goals, and Garmin health data synced to cloud!');
    } catch (err: any) {
      console.warn('[CloudVault] Sign-in canceled or failed:', err);
    } finally {
      setActionBusy(false);
    }
  };

  const handleManualSync = async () => {
    setActionBusy(true);
    setStatusMessage(null);
    try {
      await syncAllSettingsToCloud();
      setStatusMessage('Cloud vault updated with all current settings & logs.');
    } catch (err: any) {
      console.warn('[CloudVault] Manual sync error:', err);
    } finally {
      setActionBusy(false);
    }
  };

  const handleSignOut = async () => {
    setActionBusy(true);
    setStatusMessage(null);
    try {
      await signOutFromCloudVault();
    } finally {
      setActionBusy(false);
    }
  };

  const formatSyncTime = (ts?: number | null) => {
    if (!ts) return 'Ready to sync';
    const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diffSec < 15) return 'Synced just now';
    if (diffSec < 60) return `Synced ${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Synced ${diffMin}m ago`;
    return `Synced at ${new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const isConnected = Boolean(status?.isAuthenticated);
  const isBusy = Boolean(status?.isSyncing || actionBusy);

  return (
    <div
      className={`rounded-2xl border p-4 transition-all ${
        isLight
          ? isConnected
            ? 'bg-emerald-50/70 border-emerald-200 text-slate-900'
            : 'bg-indigo-50/60 border-indigo-200 text-slate-900'
          : isConnected
          ? 'bg-emerald-950/20 border-emerald-500/30 text-slate-100'
          : 'bg-indigo-950/25 border-indigo-500/30 text-slate-100'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              isConnected
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-500'
                : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
            }`}
          >
            {isBusy ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isConnected ? (
              <Cloud className="w-5 h-5" />
            ) : (
              <ShieldCheck className="w-5 h-5" />
            )}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold tracking-tight">
                Firebase Cloud Vault (Auto-Preserve All Settings)
              </h4>
              {isConnected ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3" />
                  Auto-Sync Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30">
                  Local Only — Sign In to Persist Across Sessions
                </span>
              )}
            </div>

            <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              {isConnected ? (
                <>
                  Signed in as{' '}
                  <strong className={isLight ? 'text-slate-900' : 'text-white'}>
                    {status?.userEmail || status?.userDisplayName}
                  </strong>{' '}
                  • <span className="font-mono text-[11px]">{formatSyncTime(status?.lastSyncedAt)}</span>
                </>
              ) : (
                'Sign in once with Google so your Strava, Garmin, Google Sheets connections, Athlete thresholds, custom HR/Pace/Power zones, availability, injuries, Goal races, and Garmin health logs are automatically restored whenever the app opens.'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isConnected ? (
            <>
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isBusy}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                <span>{isBusy ? 'Syncing...' : 'Sync Now'}</span>
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={isBusy}
                title="Disconnect Cloud Vault"
                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors flex items-center gap-1 cursor-pointer ${
                  isLight
                    ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleSignIn}
              disabled={isBusy}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-500 hover:bg-indigo-400 text-white shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UserCheck className="w-4 h-4" />
              )}
              <span>Sign in with Google to Save All Settings</span>
            </button>
          )}
        </div>
      </div>

      {/* Preserved Data Domains Checklist */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-500/15 text-[11px]">
        <div className="flex items-center gap-1.5">
          <CheckCircle2
            className={`w-3.5 h-3.5 shrink-0 ${
              isConnected ? 'text-emerald-500' : 'text-indigo-400'
            }`}
          />
          <span>Strava, Garmin & Google Sheets Connections</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle2
            className={`w-3.5 h-3.5 shrink-0 ${
              isConnected ? 'text-emerald-500' : 'text-indigo-400'
            }`}
          />
          <span>Athlete Data, LTHR, FTP & Custom Zones</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle2
            className={`w-3.5 h-3.5 shrink-0 ${
              isConnected ? 'text-emerald-500' : 'text-indigo-400'
            }`}
          />
          <span>Training Availability & Injury History</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle2
            className={`w-3.5 h-3.5 shrink-0 ${
              isConnected ? 'text-emerald-500' : 'text-indigo-400'
            }`}
          />
          <span>Goal Races & Precision Sub-Goals</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle2
            className={`w-3.5 h-3.5 shrink-0 ${
              isConnected ? 'text-emerald-500' : 'text-indigo-400'
            }`}
          />
          <span>Garmin Daily Health & Readiness Logs</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle2
            className={`w-3.5 h-3.5 shrink-0 ${
              isConnected ? 'text-emerald-500' : 'text-indigo-400'
            }`}
          />
          <span>AI Coach Plans, Workouts & Rename Rules</span>
        </div>
      </div>

      {statusMessage && (
        <div className="mt-2.5 text-xs font-medium text-emerald-500 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {status?.error && (
        <div className="mt-2.5 text-xs font-medium text-rose-400 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Cloud sync note: {status.error}</span>
        </div>
      )}
    </div>
  );
};
