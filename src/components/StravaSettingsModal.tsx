import React, { useState, useEffect } from 'react';
import { X, ExternalLink, Unplug, ShieldAlert, RefreshCw } from 'lucide-react';
import { StravaIcon } from './StravaIcon';
import {
  buildStravaAuthUrl,
  getEffectiveClientId,
} from '../utils/stravaOAuth';
import type { StravaTokenResponse } from '../utils/stravaOAuth';

interface StravaSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stravaAccessToken: string | null;
  athleteName: string | null;
  onTokenUpdated: (token: string | null, tokenData?: StravaTokenResponse | null) => void;
  autoRefreshOnOpen?: boolean;
  onToggleAutoRefresh?: (enabled: boolean) => void;
}

export const StravaSettingsModal: React.FC<StravaSettingsModalProps> = ({
  isOpen,
  onClose,
  stravaAccessToken,
  athleteName,
  onTokenUpdated,
  autoRefreshOnOpen,
  onToggleAutoRefresh,
}) => {
  const [internalAutoRefresh, setInternalAutoRefresh] = useState(() => {
    try {
      return localStorage.getItem('ironfit_strava_auto_refresh_on_open') === 'true';
    } catch {
      return false;
    }
  });

  const isAutoRefresh = autoRefreshOnOpen !== undefined ? autoRefreshOnOpen : internalAutoRefresh;

  const handleToggleAutoRefresh = (val: boolean) => {
    setInternalAutoRefresh(val);
    try {
      localStorage.setItem('ironfit_strava_auto_refresh_on_open', String(val));
    } catch {}
    onToggleAutoRefresh?.(val);
  };
  const [isConnecting, setIsConnecting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAuthError(null);
    }
  }, [isOpen]);

  // Listen for OAuth message from the popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Validate origin
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost') && !origin.includes('github.io')) {
        return;
      }

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        const payload = event.data.payload;
        if (payload?.access_token) {
          onTokenUpdated(payload.access_token, payload);
        }
        setIsConnecting(false);
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        setAuthError(event.data.error || 'Authorization failed');
        setIsConnecting(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onTokenUpdated]);

  if (!isOpen) return null;

  const effectiveId = getEffectiveClientId();

  const handleConnectPopup = () => {
    setIsConnecting(true);
    setAuthError(null);

    try {
      const targetAuthUrl = buildStravaAuthUrl(effectiveId);
      // Open OAuth provider URL directly in popup
      const authWindow = window.open(
        targetAuthUrl,
        'strava_oauth_popup',
        'width=600,height=750,menubar=no,toolbar=no'
      );

      if (!authWindow) {
        setAuthError('Popup was blocked by your browser. Please allow popups for this site and try again.');
        setIsConnecting(false);
      }
    } catch (err: any) {
      setAuthError(err.message || 'Could not start Strava authentication');
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    onTokenUpdated(null, null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col gap-4 text-slate-100 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <StravaIcon className="w-9 h-9" />
            <div>
              <h3 className="text-base font-bold text-white">Strava Integration</h3>
              <p className="text-xs text-slate-400">Direct cloud sync for weight training activities</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Connection Status */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase font-bold tracking-wider text-slate-400">Status</div>
            <div className="text-sm font-bold text-white flex items-center gap-2 mt-0.5">
              {stravaAccessToken ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="text-emerald-400">Connected as {athleteName || 'Strava Athlete'}</span>
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                  <span className="text-slate-400">Not Connected</span>
                </>
              )}
            </div>
          </div>

          {stravaAccessToken && (
            <button
              type="button"
              onClick={handleDisconnect}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-red-950/40 text-slate-400 hover:text-red-400 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Unplug className="w-3.5 h-3.5" />
              <span>Disconnect</span>
            </button>
          )}
        </div>

        {/* Auto-refresh on open toggle */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
          <div className="flex-1 pr-2">
            <div className="flex items-center gap-1.5 text-xs uppercase font-bold tracking-wider text-slate-400">
              <RefreshCw className="w-3.5 h-3.5 text-[#FC5200]" />
              <span>Sync Behavior</span>
            </div>
            <div className="text-sm font-bold text-white mt-1">Auto-refresh on open</div>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              Automatically trigger a delta sync whenever navigating to the Activities tab.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={isAutoRefresh}
            onClick={() => handleToggleAutoRefresh(!isAutoRefresh)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#FC5200] focus:ring-offset-2 focus:ring-offset-slate-950 ${
              isAutoRefresh ? 'bg-[#FC5200]' : 'bg-slate-700'
            }`}
            title={isAutoRefresh ? 'Disable auto-refresh on open' : 'Enable auto-refresh on open'}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                isAutoRefresh ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Activity details and available workout data streams require Strava&apos;s
          private-activity permission. If you are already connected, disconnect and
          authorize again to grant the updated access.
        </p>

        {/* Error Alert */}
        {authError && (
          <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs flex items-start gap-2.5 leading-relaxed">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <div className="flex-1">
              <div className="font-bold text-rose-200">Strava Authorization Note</div>
              <div>{authError}</div>
            </div>
          </div>
        )}

        {/* OAuth Connect Action */}
        {!stravaAccessToken && (
          <div className="pt-1">
            <button
              type="button"
              disabled={isConnecting}
              onClick={handleConnectPopup}
              className="w-full py-3.5 px-4 rounded-xl bg-[#FC5200] hover:bg-[#e04900] active:scale-[0.99] text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#FC5200]/25 transition-all disabled:opacity-50 cursor-pointer"
            >
              <span>{isConnecting ? 'Waiting for Strava authorization...' : 'Authorize with Strava'}</span>
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
