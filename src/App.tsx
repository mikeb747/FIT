import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StravaSettingsModal } from './components/StravaSettingsModal';
import { AthleteProfileModal } from './components/AthleteProfileModal';
import { GarminSyncModal } from './components/GarminSyncModal';
import type { ProfileTab } from './components/AthleteProfileModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { StravaIcon } from './components/StravaIcon';
import { StravaActivitiesTab } from './components/StravaActivitiesTab';
import type { AthleteProfile } from './types/athlete';
import {
  loadAthleteProfile,
  saveAthleteProfile,
  resetAthleteProfile,
} from './utils/athleteStorage';
import type { TrainingGoal } from './types/goals';
import { loadAthleteGoals, saveAthleteGoals } from './utils/goalsStorage';
import {
  checkAndProcessOAuthRedirect,
  refreshStravaAccessToken,
  STRAVA_CONFIG,
} from './utils/stravaOAuth';
import type { StravaTokenResponse } from './utils/stravaOAuth';
import {
  fetchStravaActivityDetails,
  syncStravaActivitiesDelta,
  fetchOlderStravaActivities,
  isStravaAuthorizationError,
  getCachedStravaActivities,
  getCachedStravaActivityRecord,
  ensureStravaActivityRecord,
  saveCachedStravaNewActivityIds,
  saveStravaActivityDetails,
  markActivityAsDeleted,
  StravaActivity,
  StravaActivityDetailsRecord,
} from './utils/stravaActivities';
import {
  initGoogleAuth,
  signInWithGoogle,
  signOutGoogle,
  getGoogleAccessToken,
} from './utils/googleAuth';
import {
  getCachedSpreadsheetId,
  fetchHealthDataFromGoogleSheet,
  appendHealthDataToGoogleSheet,
  batchUploadHealthDataToGoogleSheet,
} from './utils/googleSheets';
import { Settings, Activity, Moon, Heart, Zap, RotateCw } from 'lucide-react';
import { RecoveryView } from './components/RecoveryView';
import { FitnessTab } from './components/FitnessTab';
import { computeFitnessTimeline, calculateTriathlonFitnessIndex } from './utils/fitnessEngine';
import type { DailyRecoveryLog } from './types/recovery';
import {
  loadRecoveryLogs,
  saveRecoveryLogs,
  upsertRecoveryLog,
  deleteRecoveryLog,
  resetRecoveryLogsToDefaults,
} from './utils/recoveryStorage';
import { computeDailyReadiness } from './utils/readinessEngine';

const STORAGE_KEYS = {
  STRAVA_TOKEN: 'ironfit_strava_token',
  STRAVA_ATHLETE: 'ironfit_strava_athlete',
  BRAND_TITLE: 'ironfit_brand_title',
  BRAND_SUBTITLE: 'ironfit_brand_subtitle',
  DISPLAY_DENSITY: 'ironfit_display_density',
  THEME: 'ironfit_theme',
};

export default function App() {
  // -------------------------------------------------------------
  // Theme & UI Scaling Initialization
  // -------------------------------------------------------------
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.THEME);
      if (stored === 'light' || stored === 'dark') return stored;
      return 'light';
    } catch {
      return 'light';
    }
  });

  const handleThemeChanged = (newTheme: 'dark' | 'light') => {
    setTheme(newTheme);
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, newTheme);
    } catch {}
  };

  const [displayDensity, setDisplayDensity] = useState<number | 'standard' | 'compact' | 'comfortable'>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.DISPLAY_DENSITY);
      if (stored) {
        const num = Number(stored);
        if (!isNaN(num) && num >= 70 && num <= 130) return num;
        if (stored === 'compact') return 85;
        if (stored === 'comfortable') return 115;
        if (stored === 'standard') return 100;
      }
      return 100;
    } catch {
      return 100;
    }
  });

  const handleDensityChanged = (newDensity: number | 'standard' | 'compact' | 'comfortable') => {
    setDisplayDensity(newDensity);
    try {
      localStorage.setItem(STORAGE_KEYS.DISPLAY_DENSITY, String(newDensity));
    } catch {}
  };

  // -------------------------------------------------------------
  // Athlete Profile & Goals State
  // -------------------------------------------------------------
  const [isAthleteProfileOpen, setIsAthleteProfileOpen] = useState(false);
  const [profileModalTab, setProfileModalTab] = useState<ProfileTab>('settings');
  const [athleteProfile, setAthleteProfile] = useState<AthleteProfile>(() => loadAthleteProfile());
  const [athleteGoals, setAthleteGoals] = useState<TrainingGoal[]>(() => loadAthleteGoals());

  const handleSaveAthleteProfile = (updated: AthleteProfile) => {
    setAthleteProfile(updated);
    saveAthleteProfile(updated);
  };

  const handleSaveAthleteGoals = (updated: TrainingGoal[]) => {
    setAthleteGoals(updated);
    saveAthleteGoals(updated);
  };

  const handleResetAthleteProfile = () => {
    const defaults = resetAthleteProfile();
    setAthleteProfile(defaults);
  };

  // -------------------------------------------------------------
  // Navigation & Recovery Tracking State
  // -------------------------------------------------------------
  const [activeMainTab, setActiveMainTab] = useState<'activities' | 'recovery' | 'fitness'>('activities');
  
  // Garmin Connect state
  const [isGarminSyncOpen, setIsGarminSyncOpen] = useState(false);
  const [garminEmail, setGarminEmail] = useState<string | null>(() => {
    try {
      const explicitDisconnect = localStorage.getItem('fit_track_garmin_disconnected') === 'true';
      if (explicitDisconnect) return null;
      const stored = localStorage.getItem('fit_track_garmin_email');
      if (stored) return stored;
      localStorage.setItem('fit_track_garmin_email', 'mike.brown747@gmail.com');
      return 'mike.brown747@gmail.com';
    } catch {
      return 'mike.brown747@gmail.com';
    }
  });
  const [garminConnected, setGarminConnected] = useState<boolean>(() => {
    try {
      const explicitDisconnect = localStorage.getItem('fit_track_garmin_disconnected') === 'true';
      if (explicitDisconnect) return false;
      const stored = localStorage.getItem('fit_track_garmin_connected');
      if (stored === 'false') return false;
      localStorage.setItem('fit_track_garmin_connected', 'true');
      localStorage.setItem(
        'fit_track_garmin_token',
        'GCDC_49295cfc-ebad-4efe-932c-f508d2ed0e9d.65543f6e-9140-4e9c-a882-e7d0b62992e4.DiZsWy8QLAKsUhGEjkWPcuwB1HJXw56BHkDKelRldWc.3526889472'
      );
      return true;
    } catch {
      return true;
    }
  });

  // Google Sheets state
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null);
  const [googleSheetUrl, setGoogleSheetUrl] = useState<string | null>(() => {
    const id = getCachedSpreadsheetId();
    return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null;
  });

  const [recoveryLogs, setRecoveryLogs] = useState<DailyRecoveryLog[]>(() => {
    try {
      const explicitDisconnect = localStorage.getItem('fit_track_garmin_disconnected') === 'true';
      if (explicitDisconnect) return [];
      return loadRecoveryLogs();
    } catch {
      return [];
    }
  });

  // When opening the readiness tab, check Google Sheets for saved data on the Health tab
  useEffect(() => {
    if (activeMainTab === 'recovery' && isGoogleConnected) {
      fetchHealthDataFromGoogleSheet().then((sheetLogs) => {
        if (sheetLogs && sheetLogs.length > 0) {
          let current = [...recoveryLogs];
          let added = false;
          sheetLogs.forEach((item) => {
            const idx = current.findIndex((l) => l.date === item.date);
            if (idx >= 0) {
              current[idx] = item;
              added = true;
            } else {
              current.push(item);
              added = true;
            }
          });
          if (added) {
            current.sort((a, b) => a.date.localeCompare(b.date));
            saveRecoveryLogs(current);
            setRecoveryLogs(current);
          }
        }
      });
    }
  }, [activeMainTab, isGoogleConnected]);

  const handleUpsertRecoveryLog = (log: DailyRecoveryLog) => {
    const updated = upsertRecoveryLog(log);
    setRecoveryLogs(updated);
    if (isGoogleConnected && getGoogleAccessToken()) {
      void batchUploadHealthDataToGoogleSheet([log]);
    }
  };

  const handleDeleteRecoveryLog = (id: string) => {
    const updated = deleteRecoveryLog(id);
    setRecoveryLogs(updated);
  };

  const handleImportRecoveryLogs = (imported: DailyRecoveryLog[]) => {
    let current = [...recoveryLogs];
    imported.forEach((item) => {
      const idx = current.findIndex((l) => l.date === item.date);
      if (idx >= 0) {
        current[idx] = item;
      } else {
        current.push(item);
      }
    });
    current.sort((a, b) => a.date.localeCompare(b.date));
    saveRecoveryLogs(current);
    setRecoveryLogs(current);
    if (isGoogleConnected && getGoogleAccessToken()) {
      void batchUploadHealthDataToGoogleSheet(imported);
    }
  };

  const handleResetRecoveryDefaults = () => {
    const cleared = resetRecoveryLogsToDefaults();
    setRecoveryLogs(cleared);
  };

  const latestRecoveryLog = recoveryLogs.length > 0 ? recoveryLogs[recoveryLogs.length - 1] : null;
  const headerReadiness = useMemo(() => {
    if (!latestRecoveryLog || !garminConnected) return null;
    return computeDailyReadiness(latestRecoveryLog, recoveryLogs, athleteProfile);
  }, [latestRecoveryLog, recoveryLogs, athleteProfile, garminConnected]);

  const handleDisconnectGarmin = () => {
    try {
      localStorage.removeItem('fit_track_garmin_email');
      localStorage.removeItem('fit_track_garmin_token');
      localStorage.removeItem('fit_track_garmin_connected');
      localStorage.setItem('fit_track_garmin_disconnected', 'true');
      localStorage.removeItem('fit_track_recovery_logs_v1');
      localStorage.removeItem('ironfit_recovery_logs_v1');
    } catch {}
    setGarminEmail(null);
    setGarminConnected(false);
    setRecoveryLogs([]);
  };

  // -------------------------------------------------------------
  // Strava & Activities State
  // -------------------------------------------------------------
  const [stravaToken, setStravaToken] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEYS.STRAVA_TOKEN) || null;
  });
  const [athleteName, setAthleteName] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEYS.STRAVA_ATHLETE) || null;
  });

  const [stravaActivities, setStravaActivities] = useState<StravaActivity[]>(() => getCachedStravaActivities());
  const [stravaActivityDetails, setStravaActivityDetails] = useState<Record<string, StravaActivityDetailsRecord>>({});

  const headerFitnessIndex = useMemo(() => {
    const timeline = computeFitnessTimeline(stravaActivities, stravaActivityDetails, athleteProfile, 45);
    const latest = timeline.length > 0 ? timeline[timeline.length - 1] : null;
    if (!latest) return 85;
    const res = calculateTriathlonFitnessIndex(latest.swimCtl, latest.bikeCtl, latest.runCtl, 'middle_70_3', athleteGoals);
    return Math.round(res.tfi);
  }, [stravaActivities, stravaActivityDetails, athleteProfile, athleteGoals]);

  const activityDetailsInProgress = useRef(new Set<string>());
  const [isLoadingStravaActivities, setIsLoadingStravaActivities] = useState(false);
  const [isLoadingMoreStrava, setIsLoadingMoreStrava] = useState(false);
  const [hasMoreStrava, setHasMoreStrava] = useState(true);
  const [stravaActivitiesError, setStravaActivitiesError] = useState<string | null>(null);

  const [isStravaSettingsOpen, setIsStravaSettingsOpen] = useState(false);



  // Brand Header Customization
  const [brandTitle, setBrandTitle] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.BRAND_TITLE);
    if (!saved || saved === 'IronFIT' || saved === 'GymFIT') return 'Fit Track';
    return saved;
  });
  const [brandSubtitle, setBrandSubtitle] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.BRAND_SUBTITLE);
    if (!saved || saved === 'Strength & Strava FIT Uploader' || saved === 'Workout Log & Strava Uploader') {
      return 'Strava Activities & Analytics';
    }
    return saved;
  });

  // -------------------------------------------------------------
  // Persistence & DOM Sync Effects
  // -------------------------------------------------------------
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', theme === 'light' ? '#f8fafc' : '#090a0f');
      }
    }
  }, [theme]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      let percent = 100;
      if (typeof displayDensity === 'number') {
        percent = displayDensity;
      } else if (displayDensity === 'compact') {
        percent = 85;
      } else if (displayDensity === 'comfortable') {
        percent = 115;
      }
      document.documentElement.setAttribute('data-density', String(displayDensity));
      document.documentElement.style.fontSize = `${(percent / 100) * 16}px`;
    }
  }, [displayDensity]);

  // Synchronize activities whenever rename rules or batch processing updates local activities
  useEffect(() => {
    const handleUpdate = (e: any) => {
      if (e.detail?.activities && Array.isArray(e.detail.activities)) {
        setStravaActivities([...e.detail.activities]);
      }
    };
    window.addEventListener('fit_track_activities_updated', handleUpdate);
    return () => window.removeEventListener('fit_track_activities_updated', handleUpdate);
  }, []);

  // Handle incoming Strava OAuth redirect code
  useEffect(() => {
    checkAndProcessOAuthRedirect().then((result) => {
      if (result.handled) {
        if (result.success && result.token) {
          setStravaToken(result.token);
          localStorage.setItem(STORAGE_KEYS.STRAVA_TOKEN, result.token);
          if (result.athlete?.firstname) {
            const name = `${result.athlete.firstname} ${result.athlete.lastname || ''}`.trim();
            setAthleteName(name);
            localStorage.setItem(STORAGE_KEYS.STRAVA_ATHLETE, name);
          }
        } else if (result.error) {
          setIsStravaSettingsOpen(true);
        }
      }
    });
  }, []);

  // Google Auth initialization listener
  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (user) => {
        setIsGoogleConnected(true);
        setGoogleUserEmail(user.email || null);
        const sheetId = getCachedSpreadsheetId();
        if (sheetId) {
          setGoogleSheetUrl(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`);
        }
      },
      () => {
        setIsGoogleConnected(false);
        setGoogleUserEmail(null);
      }
    );
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const handleConnectGoogle = async () => {
    try {
      const { user } = await signInWithGoogle();
      setIsGoogleConnected(true);
      setGoogleUserEmail(user.email || null);
      const sheetId = getCachedSpreadsheetId();
      if (sheetId) {
        setGoogleSheetUrl(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`);
      }
    } catch (err: any) {
      console.error('Google Sign-in failed:', err);
    }
  };

  const handleDisconnectGoogle = async () => {
    await signOutGoogle();
    setIsGoogleConnected(false);
    setGoogleUserEmail(null);
  };

  const handleActivityPublished = (activityId: string) => {
    setStravaActivityDetails((prev) => {
      const existing = prev[activityId] || { id: activityId };
      return {
        ...prev,
        [activityId]: {
          ...existing,
          googleDrivePublishedAt: new Date().toISOString(),
        },
      };
    });
    const sheetId = getCachedSpreadsheetId();
    if (sheetId) {
      setGoogleSheetUrl(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`);
    }
  };

  const handleDeleteActivity = (activityId: string | number) => {
    markActivityAsDeleted(activityId);
    setStravaActivities((prev) =>
      prev.map((a) => (String(a.id) === String(activityId) ? { ...a, isDeleted: true } : a))
    );
  };

  // -------------------------------------------------------------
  // Strava Activities Synchronization
  // -------------------------------------------------------------
  const refreshStravaActivities = async (accessToken: string | null = stravaToken) => {
    if (!accessToken) return;
    setIsLoadingStravaActivities(true);
    setStravaActivitiesError(null);
    try {
      let currentToken = accessToken;
      let tokenWasRefreshed = false;
      const tokenExpiresAt = Number(localStorage.getItem(STRAVA_CONFIG.STORAGE_KEYS.EXPIRES_AT) || 0);
      if (tokenExpiresAt > 0 && tokenExpiresAt <= Math.floor(Date.now() / 1000) + 60) {
        currentToken = await refreshStravaAccessToken();
        tokenWasRefreshed = true;
        setStravaToken(currentToken);
        localStorage.setItem(STORAGE_KEYS.STRAVA_TOKEN, currentToken);
      }

      let data: StravaActivity[];
      try {
        data = await syncStravaActivitiesDelta(currentToken);
      } catch (err) {
        if (tokenWasRefreshed || !isStravaAuthorizationError(err)) throw err;
        currentToken = await refreshStravaAccessToken();
        setStravaToken(currentToken);
        localStorage.setItem(STORAGE_KEYS.STRAVA_TOKEN, currentToken);
        data = await syncStravaActivitiesDelta(currentToken);
      }

      setStravaActivities(data);
      const records = await Promise.all(
        data.map((act) => getCachedStravaActivityRecord(act.id))
      );
      const detailMap: Record<string, StravaActivityDetailsRecord> = {};
      records.forEach((rec) => {
        if (rec) detailMap[rec.id] = rec;
      });
      setStravaActivityDetails((prev) => ({ ...prev, ...detailMap }));
    } catch (err: any) {
      setStravaActivitiesError(err.message || 'Failed to sync activities from Strava');
    } finally {
      setIsLoadingStravaActivities(false);
    }
  };

  const handleLoadMoreStravaActivities = async () => {
    if (!stravaToken || isLoadingMoreStrava || !hasMoreStrava || stravaActivities.length === 0) return;
    setIsLoadingMoreStrava(true);
    try {
      let currentToken = stravaToken;
      let tokenWasRefreshed = false;
      const tokenExpiresAt = Number(localStorage.getItem(STRAVA_CONFIG.STORAGE_KEYS.EXPIRES_AT) || 0);
      if (tokenExpiresAt > 0 && tokenExpiresAt <= Math.floor(Date.now() / 1000) + 90) {
        try {
          currentToken = await refreshStravaAccessToken();
          tokenWasRefreshed = true;
          setStravaToken(currentToken);
          localStorage.setItem(STORAGE_KEYS.STRAVA_TOKEN, currentToken);
        } catch (err) {
          console.warn('Pre-emptive token refresh before loading older activities failed:', err);
        }
      }

      const oldest = stravaActivities[stravaActivities.length - 1];
      const oldestEpoch = Math.floor(new Date(oldest.start_date).getTime() / 1000);

      let result;
      try {
        result = await fetchOlderStravaActivities(currentToken, oldestEpoch, 200);
      } catch (err) {
        if (tokenWasRefreshed || !isStravaAuthorizationError(err)) throw err;
        currentToken = await refreshStravaAccessToken();
        tokenWasRefreshed = true;
        setStravaToken(currentToken);
        localStorage.setItem(STORAGE_KEYS.STRAVA_TOKEN, currentToken);
        result = await fetchOlderStravaActivities(currentToken, oldestEpoch, 200);
      }

      setStravaActivities(result.activities);
      setHasMoreStrava(result.hasMore);

      const records = await Promise.all(
        result.activities.map((act) => getCachedStravaActivityRecord(act.id))
      );
      const detailMap: Record<string, StravaActivityDetailsRecord> = {};
      records.forEach((rec) => {
        if (rec) detailMap[rec.id] = rec;
      });
      setStravaActivityDetails((prev) => ({ ...prev, ...detailMap }));
    } catch (err: any) {
      setStravaActivitiesError(err.message || 'Failed to load older activities');
    } finally {
      setIsLoadingMoreStrava(false);
    }
  };

  // Auto-fetch Strava activities if connected and empty
  useEffect(() => {
    if (stravaToken && stravaActivities.length === 0) {
      refreshStravaActivities();
    }
  }, [stravaToken]);

  // Pre-load existing IndexedDB records on initial mount
  useEffect(() => {
    if (stravaActivities.length === 0) return;
    let cancelled = false;

    const loadCachedRecords = async () => {
      try {
        const records = await Promise.all(
          stravaActivities.map((activity) => getCachedStravaActivityRecord(activity.id))
        );
        if (cancelled) return;
        const cachedDetails: Record<string, StravaActivityDetailsRecord> = {};
        records.forEach((record) => {
          if (record) cachedDetails[record.id] = record;
        });
        setStravaActivityDetails((current) => ({ ...current, ...cachedDetails }));
      } catch {}
    };

    void loadCachedRecords();
    return () => {
      cancelled = true;
    };
  }, [stravaActivities]);

  const handleTokenUpdated = (token: string | null, tokenData?: StravaTokenResponse | null) => {
    setStravaToken(token);
    if (token) {
      localStorage.setItem(STORAGE_KEYS.STRAVA_TOKEN, token);
      if (tokenData?.refresh_token) {
        localStorage.setItem(STRAVA_CONFIG.STORAGE_KEYS.REFRESH_TOKEN, tokenData.refresh_token);
      }
      if (tokenData?.expires_at) {
        localStorage.setItem(STRAVA_CONFIG.STORAGE_KEYS.EXPIRES_AT, String(tokenData.expires_at));
      }
      if (tokenData?.athlete?.firstname) {
        const name = `${tokenData.athlete.firstname} ${tokenData.athlete.lastname || ''}`.trim();
        setAthleteName(name);
        localStorage.setItem(STORAGE_KEYS.STRAVA_ATHLETE, name);
      }
      void refreshStravaActivities(token);
    } else {
      localStorage.removeItem(STORAGE_KEYS.STRAVA_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.STRAVA_ATHLETE);
      localStorage.removeItem(STRAVA_CONFIG.STORAGE_KEYS.REFRESH_TOKEN);
      localStorage.removeItem(STRAVA_CONFIG.STORAGE_KEYS.EXPIRES_AT);
      localStorage.removeItem('gymfit_strava_activities_cache');
      saveCachedStravaNewActivityIds([]);
      setStravaActivities([]);
      setStravaActivityDetails({});
      setAthleteName(null);
    }
  };

  return (
    <div
      className={`min-h-screen flex flex-col font-sans antialiased pb-20 sm:pb-12 transition-colors ${
        theme === 'light' ? 'bg-slate-50 text-slate-900' : 'bg-[#090A0F] text-slate-100'
      }`}
    >
      {/* ========================================================= */}
      {/* Top Application Bar */}
      {/* ========================================================= */}
      <header
        className={`sticky top-0 z-40 backdrop-blur-md border-b px-4 py-2.5 transition-colors ${
          theme === 'light'
            ? 'bg-white/90 border-slate-200/80 shadow-xs'
            : 'bg-[#090A0F]/90 border-slate-800/80'
        }`}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          {/* Navigation Switcher */}
          <div
            className={`flex items-center gap-1 p-1 rounded-xl border transition-colors ${
              theme === 'light'
                ? 'bg-slate-100 border-slate-200'
                : 'bg-slate-950/80 border-slate-800/80'
            }`}
          >
            <button
              type="button"
              onClick={() => setActiveMainTab('activities')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeMainTab === 'activities'
                  ? theme === 'light'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                    : 'bg-slate-800 text-white shadow-sm'
                  : theme === 'light'
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-orange-400" />
              <span>Activities</span>
              {stravaActivities.length > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-md hidden sm:inline ${
                    theme === 'light'
                      ? 'bg-slate-200 text-slate-600'
                      : 'bg-slate-900 text-slate-400'
                  }`}
                >
                  {stravaActivities.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveMainTab('recovery')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeMainTab === 'recovery'
                  ? theme === 'light'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                    : 'bg-slate-800 text-white shadow-sm'
                  : theme === 'light'
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Heart className="w-3.5 h-3.5 text-rose-500" />
              <span>Readiness</span>
              {headerReadiness && Number.isFinite(headerReadiness.score) && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-md font-extrabold ${headerReadiness.badgeBg} ${headerReadiness.badgeText}`}
                >
                  {headerReadiness.score}%
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveMainTab('fitness')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeMainTab === 'fitness'
                  ? theme === 'light'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                    : 'bg-slate-800 text-white shadow-sm'
                  : theme === 'light'
                  ? 'text-slate-500 hover:text-slate-900'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-indigo-500" />
              <span>Fitness</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-md font-extrabold ${
                  theme === 'light'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-indigo-950/70 text-indigo-300 border border-indigo-700/40'
                }`}
                title="Triathlon Fitness Index"
              >
                {headerFitnessIndex}
              </span>
            </button>
          </div>

          {/* Action cluster: PWA Install, Settings, Strava Sync */}
          <div className="flex items-center gap-2">
            <PWAInstallButton />

            {/* Settings & Athlete Profile Button */}
            <button
              type="button"
              onClick={() => {
                setProfileModalTab('settings');
                setIsAthleteProfileOpen(true);
              }}
              title="Settings & Athlete Profile"
              className={`h-8 px-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer border shadow-sm ${
                theme === 'light'
                  ? 'bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-200'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800'
              }`}
            >
              <Settings className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Settings</span>
            </button>

            {/* Strava Sync Button */}
            <button
              type="button"
              onClick={() => {
                if (stravaToken) {
                  refreshStravaActivities();
                } else {
                  setIsStravaSettingsOpen(true);
                }
              }}
              disabled={isLoadingStravaActivities}
              title={stravaToken ? 'Sync Strava activities (smart delta sync)' : 'Connect Strava'}
              className={`h-8 px-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer border shadow-sm disabled:opacity-50 ${
                theme === 'light'
                  ? 'bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-200'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800'
              }`}
            >
              <RotateCw
                className={`w-3.5 h-3.5 ${
                  isLoadingStravaActivities ? 'animate-spin text-amber-500' : 'text-[#FC5200]'
                }`}
              />
              <span className="hidden sm:inline">
                {isLoadingStravaActivities ? 'Syncing...' : 'Sync'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* ========================================================= */}
      {/* MAIN VIEW: STRAVA ACTIVITIES, READINESS, OR FITNESS */}
      {/* ========================================================= */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {activeMainTab === 'activities' ? (
          <StravaActivitiesTab
            theme={theme}
            stravaToken={stravaToken}
            athleteName={athleteName}
            activities={stravaActivities}
            activityDetails={stravaActivityDetails}
            athleteProfile={athleteProfile}
            loading={isLoadingStravaActivities}
            loadingMore={isLoadingMoreStrava}
            hasMore={hasMoreStrava}
            error={stravaActivitiesError}
            isGoogleConnected={isGoogleConnected}
            googleUserEmail={googleUserEmail}
            googleSheetUrl={googleSheetUrl}
            onRefresh={refreshStravaActivities}
            onLoadMore={handleLoadMoreStravaActivities}
            onConnectGoogle={handleConnectGoogle}
            onDisconnectGoogle={handleDisconnectGoogle}
            onOpenStravaSettings={() => setIsStravaSettingsOpen(true)}
            onActivityPublished={handleActivityPublished}
            onOpenAthleteProfile={() => {
              setProfileModalTab('settings');
              setIsAthleteProfileOpen(true);
            }}
            onDeleteActivity={handleDeleteActivity}
          />
        ) : activeMainTab === 'recovery' ? (
          <RecoveryView
            logs={recoveryLogs}
            athleteProfile={athleteProfile}
            stravaActivities={stravaActivities}
            theme={theme}
            isGarminConnected={garminConnected}
            garminEmail={garminEmail}
            onOpenGarminSync={() => setIsGarminSyncOpen(true)}
            onUpsertLog={handleUpsertRecoveryLog}
            onDeleteLog={handleDeleteRecoveryLog}
            onImportLogs={handleImportRecoveryLogs}
            onResetDefaults={handleResetRecoveryDefaults}
            isGoogleConnected={isGoogleConnected}
            googleUserEmail={googleUserEmail}
            googleSheetUrl={googleSheetUrl}
            onConnectGoogle={handleConnectGoogle}
            onOpenAthleteSettings={(tab) => {
              setProfileModalTab(tab || 'physiology');
              setIsAthleteProfileOpen(true);
            }}
          />
        ) : (
          <FitnessTab
            activities={stravaActivities}
            activityDetails={stravaActivityDetails}
            athleteProfile={athleteProfile}
            goals={athleteGoals}
            theme={theme}
            stravaToken={stravaToken}
            isGoogleConnected={isGoogleConnected}
            onOpenSettings={() => {
              setProfileModalTab('goals');
              setIsAthleteProfileOpen(true);
            }}
            onDeleteActivity={handleDeleteActivity}
          />
        )}
      </main>


      {/* ========================================================= */}
      {/* MODALS */}
      {/* ========================================================= */}
      <AthleteProfileModal
        isOpen={isAthleteProfileOpen}
        onClose={() => setIsAthleteProfileOpen(false)}
        profile={athleteProfile}
        onSaveProfile={handleSaveAthleteProfile}
        onResetDefaults={handleResetAthleteProfile}
        goals={athleteGoals}
        onSaveGoals={handleSaveAthleteGoals}
        initialTab={profileModalTab}
        stravaActivities={stravaActivities}
        theme={theme}
        onThemeChanged={handleThemeChanged}
        displayDensity={displayDensity}
        onDensityChanged={handleDensityChanged}
        brandTitle={brandTitle}
        brandSubtitle={brandSubtitle}
        onSaveBrand={(title, subtitle) => {
          setBrandTitle(title);
          setBrandSubtitle(subtitle);
          localStorage.setItem(STORAGE_KEYS.BRAND_TITLE, title);
          localStorage.setItem(STORAGE_KEYS.BRAND_SUBTITLE, subtitle);
        }}
        onResetBrand={() => {
          setBrandTitle('Fit Track');
          setBrandSubtitle('Strava Activities & Analytics');
          localStorage.removeItem(STORAGE_KEYS.BRAND_TITLE);
          localStorage.removeItem(STORAGE_KEYS.BRAND_SUBTITLE);
        }}
        stravaToken={stravaToken}
        athleteName={athleteName}
        onOpenStravaSettings={() => setIsStravaSettingsOpen(true)}
        onDisconnectStrava={() => handleTokenUpdated(null)}
        garminEmail={garminEmail}
        garminConnected={garminConnected}
        onOpenGarminSync={() => setIsGarminSyncOpen(true)}
        onDisconnectGarmin={handleDisconnectGarmin}
        onActivitiesUpdated={(updated) => setStravaActivities(updated)}
      />

      <StravaSettingsModal
        isOpen={isStravaSettingsOpen}
        onClose={() => setIsStravaSettingsOpen(false)}
        stravaAccessToken={stravaToken}
        athleteName={athleteName}
        onTokenUpdated={handleTokenUpdated}
      />

      <GarminSyncModal
        isOpen={isGarminSyncOpen}
        onClose={() => setIsGarminSyncOpen(false)}
        existingLogs={recoveryLogs}
        onSyncComplete={(merged) => {
          try {
            localStorage.setItem('fit_track_garmin_connected', 'true');
            const savedEmail = localStorage.getItem('fit_track_garmin_email');
            if (savedEmail) setGarminEmail(savedEmail);
          } catch {}
          setGarminConnected(true);
          handleImportRecoveryLogs(merged);
        }}
        onClearLogs={handleResetRecoveryDefaults}
        onOpenGarminSettings={() => {
          setIsGarminSyncOpen(false);
          setProfileModalTab('garmin_health');
          setIsAthleteProfileOpen(true);
        }}
        baselineRhr={athleteProfile.restingHeartRate || 41}
        theme={theme}
      />
    </div>
  );
}
