import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StravaSettingsModal } from './components/StravaSettingsModal';
import { AthleteProfileModal } from './components/AthleteProfileModal';
import { GarminSyncModal } from './components/GarminSyncModal';
import type { ProfileTab } from './components/AthleteProfileModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { StravaIcon } from './components/StravaIcon';
import { StravaActivitiesTab } from './components/StravaActivitiesTab';
import { ErrorBoundary } from './components/ErrorBoundary';
import type { AthleteProfile } from './types/athlete';
import {
  loadAthleteProfile,
  saveAthleteProfile,
  resetAthleteProfile,
} from './utils/athleteStorage';
import type { TrainingGoal } from './types/goals';
import { loadAthleteGoals, saveAthleteGoals, DEFAULT_GOALS } from './utils/goalsStorage';
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
  saveCachedStravaActivities,
  getCachedStravaActivityRecord,
  getAllCachedStravaActivityRecords,
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
  batchBackupActivitiesToGoogleSheet,
  getLastGoogleSheetsSyncTime,
  formatTimeAgo,
} from './utils/googleSheets';
import {
  startBackgroundStreamDownload,
  pauseStreamDownloader,
  resumeStreamDownloader,
  subscribeToStreamDownloader,
  getStreamDownloaderStatus,
  StreamDownloaderProgress,
} from './utils/activityStreamDownloader';
import { Settings, Activity, Moon, Heart, Zap, Sparkles, RotateCw, FileSpreadsheet, Loader2, CloudCheck, CheckCircle2 } from 'lucide-react';
import { RecoveryView } from './components/RecoveryView';
import { FitnessTab } from './components/FitnessTab';
import { CoachTab } from './components/CoachTab';
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
import {
  isAIStudioEnvironment,
  isDemoModeActive,
  setDemoModeActive,
  generateDemoActivities,
  generateDemoRecoveryLogs,
} from './utils/demoData';

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
  const [athleteGoals, setAthleteGoals] = useState<TrainingGoal[]>(() => {
    const loaded = loadAthleteGoals();
    if (loaded.length === 0 && isDemoModeActive()) {
      return DEFAULT_GOALS;
    }
    return loaded;
  });

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
  const [activeMainTab, setActiveMainTab] = useState<'activities' | 'recovery' | 'fitness' | 'coach'>('activities');
  
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

  const [sheetsLastSynced, setSheetsLastSynced] = useState<number | null>(() => getLastGoogleSheetsSyncTime());
  const [isSheetsSyncing, setIsSheetsSyncing] = useState(false);

  useEffect(() => {
    const handleSyncUpdate = (e: any) => {
      if (e.detail?.timestamp) {
        setSheetsLastSynced(e.detail.timestamp);
      }
    };
    window.addEventListener('gymfit_sheets_sync_updated', handleSyncUpdate);
    return () => window.removeEventListener('gymfit_sheets_sync_updated', handleSyncUpdate);
  }, []);

  // When opening the readiness tab, check Google Sheets for saved data on the Health tab
  useEffect(() => {
    if (activeMainTab === 'recovery' && isGoogleConnected) {
      setIsSheetsSyncing(true);
      fetchHealthDataFromGoogleSheet()
        .then((sheetLogs) => {
          if (sheetLogs && sheetLogs.length > 0) {
            let current = [...recoveryLogs];
            let added = false;
            sheetLogs.forEach((item) => {
              const idx = current.findIndex((l) => l.date === item.date);
              if (idx >= 0) {
                current[idx] = { ...current[idx], ...item };
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
          setSheetsLastSynced(Date.now());
        })
        .finally(() => {
          setIsSheetsSyncing(false);
        });
    }
  }, [activeMainTab, isGoogleConnected]);

  const handleUpsertRecoveryLog = (log: DailyRecoveryLog) => {
    const updated = upsertRecoveryLog(log);
    setRecoveryLogs(updated);
    if (isGoogleConnected && getGoogleAccessToken()) {
      void batchUploadHealthDataToGoogleSheet([log], undefined, athleteProfile);
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
      void batchUploadHealthDataToGoogleSheet(imported, undefined, athleteProfile);
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

  // AI Studio Preview Demo Mode
  const isAIStudioEnv = useMemo(() => isAIStudioEnvironment(), []);
  const [isDemoActive, setIsDemoActive] = useState<boolean>(() => isDemoModeActive());

  const handleLoadDemoData = useCallback(() => {
    if (!isAIStudioEnvironment()) return;
    const demoActs = generateDemoActivities();
    const demoLogs = generateDemoRecoveryLogs();
    saveCachedStravaActivities(demoActs);
    setStravaActivities(demoActs);
    saveRecoveryLogs(demoLogs);
    setRecoveryLogs(demoLogs);
    saveAthleteGoals(DEFAULT_GOALS);
    setAthleteGoals(DEFAULT_GOALS);
    setDemoModeActive(true);
    setIsDemoActive(true);
    setGarminConnected(true);
  }, []);

  const handleClearDemoData = useCallback(() => {
    setDemoModeActive(false);
    setIsDemoActive(false);
    saveCachedStravaActivities([]);
    setStravaActivities([]);
    saveRecoveryLogs([]);
    setRecoveryLogs([]);
    saveAthleteGoals([]);
    setAthleteGoals([]);
  }, []);



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

      // Requirement: Auto-backup to Google Sheets as soon as activity data arrives
      if (getGoogleAccessToken()) {
        batchBackupActivitiesToGoogleSheet(data, detailMap, athleteProfile).then((res) => {
          if (res.success && res.backedUpCount > 0) {
            console.log(`[Google Sheets] Auto-backed up ${res.backedUpCount} activities!`);
          }
        }).catch((e) => {
          console.warn('[Google Sheets] Auto-backup error:', e);
        });
      }
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

      // Auto-backup newly loaded older activities as soon as data arrives
      if (getGoogleAccessToken()) {
        batchBackupActivitiesToGoogleSheet(result.activities, detailMap, athleteProfile).then((res) => {
          if (res.success && res.backedUpCount > 0) {
            console.log(`[Google Sheets] Auto-backed up ${res.backedUpCount} older activities!`);
          }
        }).catch((e) => {
          console.warn('[Google Sheets] Auto-backup error:', e);
        });
      }
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

  // Pre-load all existing IndexedDB activity records on startup
  useEffect(() => {
    let cancelled = false;

    const loadCachedRecords = async () => {
      try {
        const allCached = await getAllCachedStravaActivityRecords();
        if (cancelled) return;
        if (allCached && Object.keys(allCached).length > 0) {
          setStravaActivityDetails((current) => ({ ...allCached, ...current }));
        }
      } catch {}
    };

    void loadCachedRecords();
    return () => {
      cancelled = true;
    };
  }, []);

  // Background stream downloader state & live progress subscription
  const [streamProgress, setStreamProgress] = useState<StreamDownloaderProgress>(() => getStreamDownloaderStatus());

  useEffect(() => {
    const unsub = subscribeToStreamDownloader((prog) => {
      setStreamProgress(prog);
    });
    return unsub;
  }, []);

  // Automatically start background downloading detailed streams for activities
  useEffect(() => {
    if (!stravaToken || stravaActivities.length === 0) return;

    void startBackgroundStreamDownload({
      activities: stravaActivities,
      stravaToken,
      cachedDetails: stravaActivityDetails,
      onActivityDownloaded: (record) => {
        setStravaActivityDetails((current) => ({
          ...current,
          [String(record.id)]: record,
        }));
      },
    });
  }, [stravaToken, stravaActivities]);

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

  // -------------------------------------------------------------
  // Header Navigation Responsive Adaptation Controller
  // -------------------------------------------------------------
  const headerNavRef = useRef<HTMLDivElement>(null);
  const [navLayoutLevel, setNavLayoutLevel] = useState<number>(0);

  useEffect(() => {
    const container = headerNavRef.current;
    if (!container) return;

    const evaluateFit = () => {
      if (!container) return;
      const width = Math.min(container.clientWidth, typeof window !== 'undefined' ? window.innerWidth : container.clientWidth);
      let targetLevel = 0;
      if (width < 540) {
        targetLevel = 3;
      } else if (width < 640) {
        targetLevel = 2;
      } else if (width < 760) {
        targetLevel = 1;
      }

      setNavLayoutLevel((prev) => {
        // If overflowing beyond available viewport width, increase layout level
        const maxAvail = Math.min(container.clientWidth, typeof window !== 'undefined' ? window.innerWidth : container.clientWidth);
        if (container.scrollWidth > maxAvail + 2 && prev < 3) {
          return Math.min(3, Math.max(prev + 1, targetLevel));
        }
        return targetLevel;
      });
    };

    evaluateFit();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => evaluateFit());
      ro.observe(container);
    }

    window.addEventListener('resize', evaluateFit);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', evaluateFit);
    };
  }, [displayDensity, stravaActivities.length]);

  useEffect(() => {
    const container = headerNavRef.current;
    if (!container) return;
    const maxAvail = Math.min(container.clientWidth, typeof window !== 'undefined' ? window.innerWidth : container.clientWidth);
    if (container.scrollWidth > maxAvail + 2 && navLayoutLevel < 3) {
      setNavLayoutLevel((l) => Math.min(3, l + 1));
    }
  }, [navLayoutLevel]);

  const showSettingsSyncText = navLayoutLevel === 0;
  const showActivityCount = navLayoutLevel < 2;
  const showTabIcons = navLayoutLevel < 3;
  const buttonPaddingClass =
    navLayoutLevel >= 3
      ? 'px-2 py-1.5'
      : navLayoutLevel >= 2
      ? 'px-2.5 py-1.5'
      : navLayoutLevel >= 1
      ? 'px-3 py-1.5'
      : 'px-3.5 py-1.5';

  return (
    <div
      style={{
        zoom: typeof displayDensity === 'number' && displayDensity !== 100 ? `${displayDensity}%` : undefined,
      }}
      className={`min-h-screen flex flex-col font-sans antialiased pb-20 sm:pb-12 transition-colors ${
        theme === 'light' ? 'bg-slate-50 text-slate-900' : 'bg-[#090A0F] text-slate-100'
      }`}
    >
      {/* AI Studio Environment Banner: Strictly isolated to AI Studio preview */}
      {isAIStudioEnv && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 text-xs flex items-center justify-between text-amber-500 shrink-0 z-50">
          <div className="flex items-center gap-1.5 font-bold">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>AI Studio Sandbox</span>
            <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400 hidden sm:inline">
              (Demo data is strictly isolated to Google AI Studio and never appears in your published app)
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isDemoActive ? (
              <button
                type="button"
                onClick={handleClearDemoData}
                className="px-2.5 py-0.5 rounded-md bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-bold border border-rose-500/30 cursor-pointer transition-colors"
              >
                Clear Demo Data
              </button>
            ) : (
              <button
                type="button"
                onClick={handleLoadDemoData}
                className="px-2.5 py-0.5 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer transition-colors shadow-xs"
              >
                Load Demo Triathlon Data
              </button>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* Top Application Bar */}
      {/* ========================================================= */}
      <header
        className={`sticky top-0 z-40 backdrop-blur-md border-b px-2 sm:px-4 py-2 transition-colors overflow-x-auto scrollbar-none ${
          theme === 'light'
            ? 'bg-white/90 border-slate-200/80 shadow-xs'
            : 'bg-[#090A0F]/90 border-slate-800/80'
        }`}
      >
        <div
          ref={headerNavRef}
          className="max-w-5xl xl:max-w-6xl mx-auto flex items-center justify-between gap-1.5 sm:gap-2 whitespace-nowrap"
        >
          {/* Navigation Switcher */}
          <div
            className="flex items-center h-[34px] rounded-[12px] border-[0.8px] border-[#324158] overflow-hidden grow shrink-0"
            style={{ flexGrow: 1, flexShrink: 0 }}
          >
            <button
              type="button"
              onClick={() => setActiveMainTab('activities')}
              style={{ flexGrow: 1, flexShrink: 0 }}
              className={`split-pill-item ${buttonPaddingClass} h-full grow shrink-0 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer rounded-none outline-none focus:outline-none focus:ring-0 ${
                activeMainTab === 'activities'
                  ? 'bg-[#eeeeee] text-slate-900 font-extrabold shadow-[inset_0_2px_4px_rgba(0,0,0,0.18)]'
                  : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-bold'
              }`}
            >
              {showTabIcons && <Activity className="w-3.5 h-3.5 text-orange-400 shrink-0" />}
              <span className="leading-none">Activities</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMainTab('recovery')}
              style={{ flexGrow: 1, flexShrink: 0 }}
              className={`split-pill-item ${buttonPaddingClass} h-full grow shrink-0 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer rounded-none outline-none focus:outline-none focus:ring-0 ${
                activeMainTab === 'recovery'
                  ? 'bg-[#eeeeee] text-slate-900 font-extrabold shadow-[inset_0_2px_4px_rgba(0,0,0,0.18)]'
                  : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-bold'
              }`}
            >
              {showTabIcons && <Heart className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
              <span className="leading-none">Readiness</span>
              {headerReadiness && Number.isFinite(headerReadiness.score) && (
                <span
                  className="inline-flex items-center justify-center h-[22px] px-2 rounded-[6px] border-[0.8px] border-[#9d5454] bg-[#ffcfc3] text-[#492929] text-xs font-extrabold leading-none"
                >
                  {headerReadiness.score}%
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveMainTab('fitness')}
              style={{ flexGrow: 1, flexShrink: 0 }}
              className={`split-pill-item ${buttonPaddingClass} h-full grow shrink-0 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer rounded-none outline-none focus:outline-none focus:ring-0 ${
                activeMainTab === 'fitness'
                  ? 'bg-[#eeeeee] text-slate-900 font-extrabold shadow-[inset_0_2px_4px_rgba(0,0,0,0.18)]'
                  : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-bold'
              }`}
            >
              {showTabIcons && <Zap className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
              <span className="leading-none">Fitness</span>
              <span
                className="inline-flex items-center justify-center h-[22px] px-2 rounded-[6px] border-[0.8px] border-[#1a7ec1] bg-[#defffc] text-[#051e98] text-xs font-extrabold leading-none"
                title="Triathlon Fitness Index"
              >
                {headerFitnessIndex}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMainTab('coach')}
              style={{ flexGrow: 1, flexShrink: 0 }}
              className={`split-pill-item-last ${buttonPaddingClass} h-full grow shrink-0 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer rounded-none outline-none focus:outline-none focus:ring-0 ${
                activeMainTab === 'coach'
                  ? 'bg-[#eeeeee] text-slate-900 font-extrabold shadow-[inset_0_2px_4px_rgba(0,0,0,0.18)]'
                  : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-bold'
              }`}
            >
              {showTabIcons && <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
              <span className="leading-none">Coach</span>
            </button>
          </div>

          {/* Action cluster: Settings, Strava Sync */}
          <div className="flex items-center h-[34px] rounded-[12px] border-[0.8px] border-[#324158] overflow-hidden shrink-0">
            {/* Settings & Athlete Profile Button */}
            <button
              type="button"
              onClick={() => {
                setProfileModalTab('settings');
                setIsAthleteProfileOpen(true);
              }}
              title="Settings & Athlete Profile"
              className={`split-pill-item ${buttonPaddingClass} h-full text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer outline-none focus:outline-none focus:ring-0 shrink-0 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900`}
            >
              <Settings className="w-4 h-4 text-amber-400 shrink-0" />
              {showSettingsSyncText && <span className="-ml-px">Settings</span>}
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
              className={`split-pill-item-last ${buttonPaddingClass} h-full text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50 shrink-0 outline-none focus:outline-none focus:ring-0 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900`}
            >
              <RotateCw
                className={`w-3.5 h-3.5 shrink-0 ${
                  isLoadingStravaActivities ? 'animate-spin text-amber-500' : 'text-[#FC5200]'
                }`}
              />
              {showSettingsSyncText && (
                <span className="-ml-px">
                  {isLoadingStravaActivities ? 'Syncing...' : 'Sync'}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Stream Downloader Progress Banner & Live Strava Rate Limits */}
      {streamProgress.isDownloading && (
        <div className="bg-slate-950/95 border-b border-indigo-500/30 px-4 py-2 text-xs text-slate-300 animate-in fade-in">
          <div className="max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0" />
              <span className="truncate">
                Pre-fetching activity streams for Fitness analysis:{' '}
                <strong className="text-white">
                  {streamProgress.completed} / {streamProgress.total}
                </strong>
                {streamProgress.currentActivityName ? (
                  <span className="text-slate-400"> • {streamProgress.currentActivityName}</span>
                ) : null}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
              {streamProgress.rateLimits && (
                <span
                  className="hidden md:inline-flex items-center gap-1 text-[11px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800"
                  title="Live Strava Read API usage vs Limits"
                >
                  <span className="text-emerald-400">⚡ Reads:</span>
                  <span>
                    {streamProgress.rateLimits.read15MinUsage}/{streamProgress.rateLimits.read15MinLimit} (15m)
                  </span>
                  <span className="text-slate-600">•</span>
                  <span>
                    {streamProgress.rateLimits.readDailyUsage}/{streamProgress.rateLimits.readDailyLimit} (day)
                  </span>
                </span>
              )}
              <div className="w-20 sm:w-28 bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
                <div
                  className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.round(
                      (streamProgress.completed / Math.max(1, streamProgress.total)) * 100
                    )}%`,
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  streamProgress.isPaused ? resumeStreamDownloader() : pauseStreamDownloader()
                }
                className="text-[11px] font-bold text-indigo-300 hover:text-white underline cursor-pointer"
              >
                {streamProgress.isPaused ? 'Resume' : 'Pause'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stream Downloader Rate Limit Proactive Pause Banner */}
      {streamProgress.isRateLimited && (
        <div className="bg-amber-950/80 border-b border-amber-500/40 px-4 py-2 text-xs text-amber-200">
          <div className="max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span className="font-medium">
                {streamProgress.rateLimitReason || 'Pausing background downloader to respect Strava API rate limits.'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-amber-300 font-mono text-[11px] shrink-0">
              {streamProgress.rateLimitSecondsLeft !== undefined && (
                <span>
                  Resumes in:{' '}
                  <strong className="text-white">
                    {Math.floor(streamProgress.rateLimitSecondsLeft / 60)}m{' '}
                    {(streamProgress.rateLimitSecondsLeft % 60).toString().padStart(2, '0')}s
                  </strong>
                </span>
              )}
              {streamProgress.rateLimits && (
                <span className="hidden sm:inline text-amber-400/80">
                  ({streamProgress.rateLimits.read15MinUsage}/{streamProgress.rateLimits.read15MinLimit} reads used)
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MAIN VIEW: STRAVA ACTIVITIES, READINESS, OR FITNESS */}
      {/* ========================================================= */}
      <main className="flex-1 max-w-5xl xl:max-w-6xl 2xl:max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        <ErrorBoundary fallbackTitle="Error loading view">
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
        ) : activeMainTab === 'fitness' ? (
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
        ) : (
          <CoachTab
            theme={theme}
            athleteProfile={athleteProfile}
            athleteGoals={athleteGoals}
            stravaActivities={stravaActivities}
            stravaActivityDetails={stravaActivityDetails}
            recoveryLogs={recoveryLogs}
            onOpenSettings={(tab) => {
              setProfileModalTab(tab || 'physiology');
              setIsAthleteProfileOpen(true);
            }}
            onGoalsUpdated={handleSaveAthleteGoals}
            onProfileUpdated={handleSaveAthleteProfile}
          />
        )}
        </ErrorBoundary>
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
        isAIStudioEnv={isAIStudioEnv}
        isDemoActive={isDemoActive}
        onLoadDemoData={handleLoadDemoData}
        onClearDemoData={handleClearDemoData}
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
