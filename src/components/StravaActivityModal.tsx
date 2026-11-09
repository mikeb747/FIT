import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ExternalLink,
  Dumbbell,
  Bike,
  Footprints,
  Waves,
  Activity,
  Heart,
  Zap,
  Clock,
  TrendingUp,
  FileSpreadsheet,
  Check,
  AlertCircle,
  Loader2,
  Sparkles,
  UploadCloud,
  Award,
  BatteryCharging,
  Sliders,
  Wrench,
  Gauge,
  Flame,
  HeartHandshake,
  Trash2,
  Watch,
  ChevronDown,
  Pencil,
  RefreshCw,
  BarChart2,
  LayoutGrid,
} from 'lucide-react';
import type {
  StravaActivity,
  StravaActivityDetailsRecord,
  ActivityEffortFeedback,
} from '../utils/stravaActivities';
import {
  classifyActivity,
  formatSportMetrics,
  isActivityNew,
  isActivityUnpublished,
  fetchStravaActivityDetails,
  saveStravaActivityDetails,
  getCachedStravaActivityRecord,
  markActivityAsDeleted,
  unmarkActivityAsDeleted,
  markStravaActivityPublishedToGoogleSheets,
  calculateActivityTSS,
  calculateNormalizedPower,
  getSwimPaceDetails,
  getRunActivityDetails,
  getBikeActivityDetails,
  saveActivityEffortFeedback,
  saveActivityCalibration,
} from '../utils/stravaActivities';
import type { AthleteProfile } from '../types/athlete';
import { calculateRecoveryEstimate, calculateWorkKj, formatDuration } from '../types/athlete';
import { StravaStreamPlot } from './StravaStreamPlot';
import { ActivityZoneChart } from './ActivityZoneChart';
import { WorkoutAnalysis } from './WorkoutAnalysis';
import { MuteBadgeIcon } from './MuteBadgeIcon';
import { ActivityCalibrationModal } from './ActivityCalibrationModal';
import { appendActivityToTrainingLog } from '../utils/googleSheets';
import { applyRenameRulesToName, updateStravaActivityName } from '../utils/activityRenameRules';
import { isDemoActivityId, generateDemoActivityDetails } from '../utils/demoData';
import { ErrorBoundary } from './ErrorBoundary';

interface StravaActivityModalProps {
  isOpen: boolean;
  activity: StravaActivity | null;
  stravaToken: string | null;
  athleteProfile: AthleteProfile;
  isGoogleConnected: boolean;
  theme?: 'dark' | 'light';
  onConnectGoogle: () => void;
  onClose: () => void;
  onActivityPublished?: (activityId: string) => void;
  onOpenAthleteProfile?: () => void;
  onDeleteActivity?: (activityId: string | number) => void;
  onRenameActivity?: (activityId: string | number, newName: string) => void;
}

function formatActivityDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

function getCategoryIcon(category: string, className = 'w-5 h-5', isLight = false) {
  switch (category) {
    case 'Swim':
      return <Waves className={`${className} ${isLight ? 'text-sky-600' : 'text-sky-400'}`} />;
    case 'Bike':
      return <Bike className={`${className} ${isLight ? 'text-amber-600' : 'text-orange-400'}`} />;
    case 'Run':
      return <Footprints className={`${className} ${isLight ? 'text-amber-700' : 'text-amber-400'}`} />;
    case 'Gym':
    case 'Strength':
      return <Dumbbell className={`${className} ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />;
    default:
      return <Activity className={`${className} ${isLight ? 'text-purple-600' : 'text-purple-400'}`} />;
  }
}

export const StravaActivityModal: React.FC<StravaActivityModalProps> = ({
  isOpen,
  activity,
  stravaToken,
  athleteProfile,
  isGoogleConnected,
  theme = 'dark',
  onConnectGoogle,
  onClose,
  onActivityPublished,
  onOpenAthleteProfile,
  onDeleteActivity,
  onRenameActivity,
}) => {
  const isLight = theme === 'light';
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletedLocally, setIsDeletedLocally] = useState(false);
  const [detailsRecord, setDetailsRecord] = useState<StravaActivityDetailsRecord | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);

  // Activity Rename State
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [localName, setLocalName] = useState<string | null>(null);
  const [stravaSyncStatus, setStravaSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');

  const [isExportingToSheets, setIsExportingToSheets] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<{ url: string; alreadyExists: boolean } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Manual TSS & Model Override State
  const [isEditingTss, setIsEditingTss] = useState(false);
  const [manualTssInput, setManualTssInput] = useState<string>('');
  const [selectedTssModel, setSelectedTssModel] = useState<'auto' | 'hrTSS' | 'rTSS' | 'sTSS' | 'powerTSS'>('auto');
  const [isSavingTss, setIsSavingTss] = useState(false);
  const [tssSaveSuccess, setTssSaveSuccess] = useState(false);
  const [showWorkCalc, setShowWorkCalc] = useState(false);

  // Running 1km splits display mode: pace bar chart, GAP bar chart, HR bar chart, or cards grid
  const [splitsDisplayMode, setSplitsDisplayMode] = useState<'pace' | 'gap' | 'hr' | 'cards'>('pace');

  const handleRecheckStreams = async () => {
    if (!activity) return;
    setLoadingDetails(true);
    setDetailsError(null);
    try {
      if (isDemoActivityId(activity.id)) {
        const fresh = generateDemoActivityDetails(activity);
        const saved = await saveStravaActivityDetails(activity.id, {
          activity: fresh.activity || (activity as any),
          streams: fresh.streams,
        });
        setDetailsRecord(saved);
        return;
      }
      if (!stravaToken) return;
      const fresh = await fetchStravaActivityDetails(stravaToken, String(activity.id));
      const saved = await saveStravaActivityDetails(String(activity.id), fresh);
      setDetailsRecord(saved);
    } catch (err: any) {
      console.error('[Recheck Streams Error]', err);
      setDetailsError(err.message || 'Could not fetch detailed streams from Strava');
    } finally {
      setLoadingDetails(false);
    }
  };

  const currentActivityName = localName ?? (activity ? applyRenameRulesToName(activity.name).newName : '');

  useEffect(() => {
    setLocalName(null);
    setIsEditingName(false);
    setStravaSyncStatus('idle');
    setNameInput(activity?.name ? applyRenameRulesToName(activity.name).newName : '');
  }, [activity?.id]);

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || !activity) {
      setIsEditingName(false);
      return;
    }
    setIsEditingName(false);
    if (trimmed === currentActivityName) return;

    setLocalName(trimmed);
    onRenameActivity?.(activity.id, trimmed);

    // In background immediately try and update the name in Strava
    if (stravaToken) {
      setStravaSyncStatus('syncing');
      try {
        const res = await updateStravaActivityName(activity.id, trimmed, stravaToken);
        if (res.success) {
          setStravaSyncStatus('synced');
          setTimeout(() => setStravaSyncStatus('idle'), 3500);
        } else {
          console.warn('[Strava Rename Warning]', res.error);
          setStravaSyncStatus('error');
          setTimeout(() => setStravaSyncStatus('idle'), 3500);
        }
      } catch (err) {
        console.warn('[Strava Rename Error]', err);
        setStravaSyncStatus('error');
        setTimeout(() => setStravaSyncStatus('idle'), 3500);
      }
    }
  };

  useEffect(() => {
    if (detailsRecord?.calibration) {
      if (detailsRecord.calibration.manualTss !== undefined && detailsRecord.calibration.manualTss !== null) {
        setManualTssInput(String(detailsRecord.calibration.manualTss));
      } else {
        setManualTssInput('');
      }
      setSelectedTssModel(detailsRecord.calibration.preferredTssModel || 'auto');
    } else {
      setManualTssInput('');
      setSelectedTssModel('auto');
    }
  }, [detailsRecord]);

  const handleSaveTssConfig = async () => {
    if (!activity) return;
    setIsSavingTss(true);
    setTssSaveSuccess(false);

    try {
      const existingCalib = detailsRecord?.calibration || {};
      const numTss = manualTssInput.trim() !== '' ? Number(manualTssInput) : undefined;
      const updatedCalib = {
        ...existingCalib,
        manualTss: numTss !== undefined && !isNaN(numTss) ? Math.max(0, Math.round(numTss)) : undefined,
        preferredTssModel: selectedTssModel,
      };

      const updatedRecord = await saveActivityCalibration(activity.id, updatedCalib);
      setDetailsRecord(updatedRecord);
      setTssSaveSuccess(true);
      setTimeout(() => {
        setTssSaveSuccess(false);
        setIsEditingTss(false);
      }, 800);
    } catch (err) {
      console.error('Failed to save TSS customization:', err);
    } finally {
      setIsSavingTss(false);
    }
  };

  const handleRestoreDefaultTss = async () => {
    if (!activity) return;
    setIsSavingTss(true);
    try {
      const existingCalib = { ...(detailsRecord?.calibration || {}) };
      delete existingCalib.manualTss;
      existingCalib.preferredTssModel = 'auto';

      const updatedRecord = await saveActivityCalibration(activity.id, existingCalib);
      setDetailsRecord(updatedRecord);
      setManualTssInput('');
      setSelectedTssModel('auto');
      setTssSaveSuccess(true);
      setTimeout(() => {
        setTssSaveSuccess(false);
        setIsEditingTss(false);
      }, 800);
    } catch (err) {
      console.error('Failed to reset TSS model:', err);
    } finally {
      setIsSavingTss(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !activity) {
      setDetailsRecord(null);
      setExportSuccess(null);
      setExportError(null);
      setIsCalibrationOpen(false);
      setIsEditingTss(false);
      setShowWorkCalc(false);
      return;
    }

    const currentAct = activity;
    const activityId = String(currentAct.id);

    // 1. Check if details already cached in IndexedDB
    let isCancelled = false;
    async function loadData() {
      try {
        let cached = await getCachedStravaActivityRecord(activityId);

        // If demo activity without cached streams, generate and cache realistic streams immediately
        if (isDemoActivityId(activityId) && (!cached || !cached.streams)) {
          const demoDetails = generateDemoActivityDetails(currentAct);
          const savedDemo = await saveStravaActivityDetails(activityId, {
            activity: demoDetails.activity || (currentAct as any),
            streams: demoDetails.streams,
          });
          cached = savedDemo;
        }

        if (cached && (cached.activity || cached.streams)) {
          if (!isCancelled) setDetailsRecord(cached);
          const cachedLaps = cached.activity?.laps;
          const hasCachedLaps = Array.isArray(cachedLaps) && cachedLaps.length > 0;
          if (cached.lapsFetchedAt || hasCachedLaps || !stravaToken || isDemoActivityId(activityId)) return;
        }

        // Fetch missing lap button presses as well as detailed streams.
        if (stravaToken && !isDemoActivityId(activityId)) {
          if (!isCancelled) setLoadingDetails(true);
          const fresh = await fetchStravaActivityDetails(stravaToken, activityId);
          const saved = await saveStravaActivityDetails(activityId, fresh);
          if (!isCancelled) setDetailsRecord(saved);
        }
      } catch (err: any) {
        if (!isCancelled) setDetailsError(err.message || 'Could not fetch detailed streams');
      } finally {
        if (!isCancelled) setLoadingDetails(false);
      }
    }

    loadData();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, activity, stravaToken]);

  if (!isOpen || !activity) return null;

  const classification = classifyActivity(activity);
  const hasCalibration = Boolean(detailsRecord?.calibration);
  const isIgnored = Boolean(detailsRecord?.calibration?.isIgnoredFromTrainingStatus);

  const durationMoving = detailsRecord?.calibration?.calibratedMovingTimeSec ?? activity.moving_time ?? 0;
  const durationElapsed = activity.elapsed_time || 0;
  const effectiveDistanceM = detailsRecord?.calibration?.calibratedDistanceM ?? activity.distance ?? 0;
  const metrics = formatSportMetrics(activity, detailsRecord || undefined);
  const isNew = isActivityNew(activity);
  const isUnpublished = isActivityUnpublished(detailsRecord || undefined);

  const calories = (detailsRecord?.activity?.calories as number) || activity.calories;
  const description = (detailsRecord?.activity?.description as string) || '';
  const deviceName = ((detailsRecord?.activity?.device_name as string) || ((activity as unknown as Record<string, unknown>)?.device_name as string) || '').trim();

  const streams = detailsRecord?.streams as Record<string, { data?: any[] }> | undefined;
  const availableStreamsList = streams ? Object.keys(streams).filter((k) => streams[k]?.data?.length) : [];

  // Strict power metric rule: ONLY for Turbo Trainer or Bike!
  const isBikeOrTurbo = classification.subType === 'Turbo Trainer' || classification.subType === 'Bike';
  const effectiveAvgWatts = isBikeOrTurbo
    ? (detailsRecord?.calibration?.calibratedAvgWatts ?? activity.average_watts ?? null)
    : null;
  const normalizedPower = isBikeOrTurbo
    ? calculateNormalizedPower(activity, detailsRecord || undefined)
    : null;

  // Mechanical work in kJ: kJ = Watts * Hours * 3.6
  const workResult = (isBikeOrTurbo && effectiveAvgWatts && effectiveAvgWatts > 0 && durationMoving > 0)
    ? calculateWorkKj(effectiveAvgWatts, durationMoving)
    : null;

  // Outdoor ride speeds
  const outdoorAvgSpeedKph = (durationMoving > 0 && effectiveDistanceM > 0)
    ? (((effectiveDistanceM / 1000) / (durationMoving / 3600)).toFixed(1))
    : (activity.average_speed ? (activity.average_speed * 3.6).toFixed(1) : null);
  const outdoorMaxSpeedKph = activity.max_speed ? (activity.max_speed * 3.6).toFixed(1) : null;

  // Live in-progress TSS calculation incorporating immediate edit inputs (selectedTssModel and manualTssInput)
  const effectiveDetailsRecordForTss: StravaActivityDetailsRecord | undefined = isEditingTss
    ? {
        id: detailsRecord?.id || String(activity.id),
        activity: detailsRecord?.activity || (activity as unknown as Record<string, unknown>),
        streams: detailsRecord?.streams,
        calibration: {
          ...(detailsRecord?.calibration || {}),
          manualTss:
            manualTssInput.trim() !== '' && !isNaN(Number(manualTssInput))
              ? Math.max(0, Math.round(Number(manualTssInput)))
              : undefined,
          preferredTssModel: selectedTssModel,
        },
        effortFeedback: detailsRecord?.effortFeedback,
        googleDrivePublishedAt: detailsRecord?.googleDrivePublishedAt,
      }
    : detailsRecord || undefined;

  // Calculate TSS customized with athlete physiological profile & calibration
  const tssResult = calculateActivityTSS(activity, effectiveDetailsRecordForTss, athleteProfile);
  const recoveryEstimate = tssResult && tssResult.type !== 'Ignored'
    ? calculateRecoveryEstimate(tssResult.tss, athleteProfile)
    : null;

  // Swim Pace Details & Laps (calibrated)
  const swimPace = getSwimPaceDetails(activity, detailsRecord || undefined);

  // Run Activity Details & Splits
  const runDetails = getRunActivityDetails(activity, detailsRecord || undefined, athleteProfile);

  // Bike Activity Details & Laps
  const bikeDetails = getBikeActivityDetails(activity, detailsRecord || undefined, athleteProfile);

  // Perceived Exertion (RPE) & Pre-Workout Feeling
  const effortFeedback = detailsRecord?.effortFeedback;

  const handleSaveFeeling = async (score: 1 | 2 | 3 | 4 | 5) => {
    const nextFeedback: ActivityEffortFeedback = {
      ...effortFeedback,
      preWorkoutFeeling: effortFeedback?.preWorkoutFeeling === score ? undefined : score,
    };
    try {
      const updated = await saveActivityEffortFeedback(activity.id, nextFeedback);
      setDetailsRecord(updated);
    } catch (err) {
      console.error('[Save Feeling Error]', err);
    }
  };

  const handleSaveRpe = async (rpeVal: number) => {
    const isDeselect = effortFeedback?.rpe === rpeVal;
    const finalRpe = isDeselect ? undefined : rpeVal;
    const sRpeLoad = finalRpe ? Math.round(finalRpe * (durationMoving / 60)) : undefined;

    const nextFeedback: ActivityEffortFeedback = {
      ...effortFeedback,
      rpe: finalRpe,
      sRpeLoad,
    };
    try {
      const updated = await saveActivityEffortFeedback(activity.id, nextFeedback);
      setDetailsRecord(updated);
    } catch (err) {
      console.error('[Save RPE Error]', err);
    }
  };

  const handleExportToSheets = async () => {
    if (!isGoogleConnected) {
      onConnectGoogle();
      return;
    }

    setIsExportingToSheets(true);
    setExportError(null);
    setExportSuccess(null);

    try {
      const result = await appendActivityToTrainingLog(activity, detailsRecord || undefined, athleteProfile);
      // Mark as published in IndexedDB
      const updated = await markStravaActivityPublishedToGoogleSheets(activity.id);
      setDetailsRecord(updated);
      setExportSuccess({ url: result.spreadsheetUrl, alreadyExists: result.alreadyExists });

      if (onActivityPublished) {
        onActivityPublished(String(activity.id));
      }
    } catch (err: any) {
      console.error('[Google Sheets Export Error]', err);
      setExportError(err.message || 'Failed to export to Google Sheets');
    } finally {
      setIsExportingToSheets(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-1 sm:px-1.5 py-3 sm:py-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div
        className={`rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border ${
          isLight
            ? 'bg-white border-slate-200 text-slate-900 shadow-xl'
            : 'bg-slate-900 border-slate-800 text-white'
        }`}
      >
        {/* Modal Header */}
        <div
          className={`px-3.5 sm:px-4 py-2.5 sm:py-3 border-b flex items-start justify-between gap-3 shrink-0 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}
        >
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-800 border-slate-700'
              }`}
            >
              {getCategoryIcon(classification.category, 'w-6 h-6', isLight)}
            </div>
            <div className="min-w-0 flex-1 h-11 flex flex-col justify-between">
              {isEditingName ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSaveName();
                  }}
                  className="flex items-center gap-1.5 min-w-0"
                >
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsEditingName(false);
                        setNameInput(currentActivityName);
                      }
                    }}
                    autoFocus
                    className={`px-2 py-0.5 text-xs sm:text-sm font-bold rounded-lg border outline-none min-w-0 flex-1 ${
                      isLight
                        ? 'bg-white border-amber-500 text-slate-900 focus:ring-1 focus:ring-amber-500/20'
                        : 'bg-slate-900 border-amber-500 text-white focus:ring-1 focus:ring-amber-500/30'
                    }`}
                    placeholder="Activity name..."
                  />
                  <button
                    type="submit"
                    disabled={!nameInput.trim()}
                    className="p-1 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer disabled:opacity-40 shrink-0"
                    title="Save name"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingName(false);
                      setNameInput(currentActivityName);
                    }}
                    className={`p-1 rounded-md cursor-pointer shrink-0 ${
                      isLight ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-slate-800 text-slate-400'
                    }`}
                    title="Cancel"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-1.5 min-w-0">
                  <h3
                    className={`text-base sm:text-lg font-black leading-tight truncate cursor-pointer hover:underline ${
                      isLight ? 'text-slate-900' : 'text-white'
                    }`}
                    onClick={() => {
                      setNameInput(currentActivityName);
                      setIsEditingName(true);
                    }}
                    title="Click to rename activity"
                  >
                    {currentActivityName}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setNameInput(currentActivityName);
                      setIsEditingName(true);
                    }}
                    className={`p-1 rounded-md opacity-60 hover:opacity-100 transition-opacity cursor-pointer shrink-0 ${
                      isLight ? 'hover:bg-slate-200/70 text-slate-600' : 'hover:bg-slate-800 text-slate-300'
                    }`}
                    title="Rename activity"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {stravaSyncStatus === 'syncing' && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-medium shrink-0 animate-pulse">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      <span>Strava...</span>
                    </span>
                  )}
                  {stravaSyncStatus === 'synced' && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-400 font-semibold shrink-0">
                      <Check className="w-2.5 h-2.5" />
                      <span>Strava updated</span>
                    </span>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <p className={`text-xs leading-none ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {formatActivityDate(activity.start_date_local || activity.start_date)}
                </p>
                <a
                  href={`https://www.strava.com/activities/${activity.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-[#FC5200] hover:underline font-bold shrink-0 leading-none"
                >
                  <span>Strava.com</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start">
            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                isLight
                  ? 'text-slate-400 hover:text-slate-800 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="pt-2 sm:pt-2.5 px-3 sm:px-4 pb-4 sm:pb-5 overflow-y-auto space-y-2.5">
          <ErrorBoundary fallbackTitle="Unable to display this workout's details" onReset={onClose}>
          {/* Badges strip */}
          <div className="pt-0.5 pb-0.5 flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* Device Model Badge (e.g. Garmin Forerunner 255) */}
            {deviceName && (
              <span
                className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
                  isLight
                    ? 'bg-slate-100 text-slate-700 border-slate-200'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
                title={`Recorded with ${deviceName}`}
              >
                <Watch className="w-3.5 h-3.5 text-slate-400" />
                <span>{deviceName}</span>
              </span>
            )}

            {/* Muted Badge */}
            {Boolean(activity.hide_from_home || activity.muted || (detailsRecord?.activity as any)?.hide_from_home || (detailsRecord?.activity as any)?.muted) && (
              <span
                className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
                  isLight
                    ? 'bg-slate-100 text-slate-700 border-slate-200'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
                title="This activity is muted on Strava (hidden from home feed)"
              >
                <MuteBadgeIcon isLight={isLight} />
                <span>Muted</span>
              </span>
            )}

            {/* Deleted Badge */}
            {(activity.isDeleted || isDeletedLocally) && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[11px] font-black uppercase tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                <span>Deleted</span>
              </span>
            )}

            {/* Ignored or Calibrated Badge */}
            {isIgnored ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] font-black uppercase tracking-wide">
                <AlertCircle className="w-3.5 h-3.5" />
                Ignored from Training Load
              </span>
            ) : hasCalibration ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-black uppercase tracking-wide">
                <Sliders className="w-3.5 h-3.5" />
                Calibrated Data
              </span>
            ) : null}

            {/* Saved to Google Sheets badge (shown only when published, Unpublished badge removed per user request) */}
            {!isUnpublished && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[11px] font-bold">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                Saved to Google Sheets
              </span>
            )}

            {/* Calibrate / Fix Data quick button with border */}
            <button
              type="button"
              onClick={() => setIsCalibrationOpen(true)}
              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-xl border-2 transition-all cursor-pointer font-bold ${
                isLight
                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-500/50 hover:border-amber-600 shadow-xs'
                  : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/50 hover:border-amber-400 shadow-xs'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>{hasCalibration ? 'Edit Calibration' : 'Fix Data'}</span>
            </button>

            {/* Delete button placed next to Fix Data */}
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-xl border-2 transition-all cursor-pointer font-bold ${
                isLight
                  ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300 hover:border-rose-400 shadow-xs'
                  : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/50 hover:border-rose-400 shadow-xs'
              }`}
              title="Delete Activity"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>

            {/* Quick Export to Google Sheets when Google is connected */}
            {isGoogleConnected && (
              <button
                type="button"
                onClick={handleExportToSheets}
                disabled={isExportingToSheets}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-xl border transition-all cursor-pointer font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-400 shadow-xs disabled:opacity-50"
                title={detailsRecord?.googleDrivePublishedAt ? 'Re-export to Google Sheets' : 'Send to Google Sheets'}
              >
                {isExportingToSheets ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                )}
                <span>Sheet</span>
              </button>
            )}
          </div>

          {/* Description / Notes if available - at the top of Activity Details */}
          {description && (
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 block">Description / Notes</span>
              <p className="text-xs text-slate-200 whitespace-pre-wrap bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80 leading-relaxed">
                {description}
              </p>
            </div>
          )}

          {/* Core Metrics Grid */}
          <div
            className={`grid gap-2.5 ${
              isBikeOrTurbo
                ? 'grid-cols-2 sm:grid-cols-3'
                : 'grid-cols-2 sm:grid-cols-4'
            }`}
          >
            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col">
              <span className="text-[11px] font-medium text-slate-400">Duration</span>
              <span className="text-sm sm:text-base font-bold font-mono text-white mt-1">
                {formatDuration(durationMoving)}
              </span>
              {durationElapsed > durationMoving && (
                <span className="text-[10px] text-slate-500 font-mono">
                  {formatDuration(durationElapsed)} elapsed
                </span>
              )}
            </div>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col">
              <span className="text-[11px] font-medium text-slate-400">
                Distance
              </span>
              <span className="text-sm sm:text-base font-bold font-mono text-white mt-1">
                {metrics.primaryMetricLabel}
              </span>
              {/* For swim: show average Heart Rate instead of average pace/100m */}
              {classification.category === 'Swim' ? (
                activity.average_heartrate ? (
                  <span className="text-[10px] text-rose-400 font-mono flex items-center gap-1">
                    <Heart className="w-2.5 h-2.5" />
                    <span>{Math.round(activity.average_heartrate)} bpm avg HR</span>
                  </span>
                ) : null
              ) : (
                /* Only show secondary metric if not Bike or Turbo Trainer, omitting speed/watts duplicate */
                metrics.secondaryMetricLabel && !isBikeOrTurbo && (
                  <span className="text-[10px] text-amber-400 font-mono">
                    {metrics.secondaryMetricLabel}
                  </span>
                )
              )}
            </div>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col">
              <span className="text-[11px] font-medium text-slate-400">
                {classification.category === 'Swim'
                  ? 'Avg Pace / 100m'
                  : isBikeOrTurbo
                  ? 'Avg Speed'
                  : 'Elevation'}
              </span>
              <span className="text-sm sm:text-base font-bold font-mono text-white mt-1">
                {classification.category === 'Swim'
                  ? (swimPace?.pacePer100mFormatted || '0:00/100m')
                  : isBikeOrTurbo
                  ? `${outdoorAvgSpeedKph || (activity.average_speed ? (activity.average_speed * 3.6).toFixed(1) : '--')} kph`
                  : (activity.total_elevation_gain ? `↑ ${Math.round(activity.total_elevation_gain)}m` : 'Flat / Indoor')}
              </span>
              {isBikeOrTurbo && (outdoorMaxSpeedKph || activity.max_speed) ? (
                <span className="text-[10px] text-slate-400 font-mono">
                  max {outdoorMaxSpeedKph || (activity.max_speed ? (activity.max_speed * 3.6).toFixed(1) : '')} kph
                </span>
              ) : classification.category !== 'Swim' && activity.max_speed ? (
                <span className="text-[10px] text-slate-500 font-mono">
                  max {(activity.max_speed * 3.6).toFixed(1)} kph
                </span>
              ) : null}
            </div>

            {/* Average Power & Normalised Power moved up for Outdoor & Indoor / Turbo Trainer Cycling */}
            {isBikeOrTurbo && (
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col">
                <span className="text-[11px] font-medium text-slate-400">Average Power</span>
                <span className="text-sm sm:text-base font-bold font-mono text-white mt-1">
                  {effectiveAvgWatts ? `${Math.round(effectiveAvgWatts)}W` : '--'}
                </span>
                {athleteProfile.bikeFtp && effectiveAvgWatts ? (
                  <span className="text-[10px] text-amber-400 font-mono">
                    {Math.round((effectiveAvgWatts / athleteProfile.bikeFtp) * 100)}% FTP
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500 font-mono">Watts</span>
                )}
              </div>
            )}

            {isBikeOrTurbo && (
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col">
                <span className="text-[11px] font-medium text-slate-400">Normalised Power</span>
                <span className="text-sm sm:text-base font-bold font-mono text-amber-400 mt-1">
                  {normalizedPower ? `${Math.round(normalizedPower)}W` : effectiveAvgWatts ? `${Math.round(effectiveAvgWatts)}W` : '--'}
                </span>
                {athleteProfile.bikeFtp && (normalizedPower || effectiveAvgWatts) ? (
                  <span className="text-[10px] text-slate-400 font-mono">
                    IF {(((normalizedPower || effectiveAvgWatts || 0)) / athleteProfile.bikeFtp).toFixed(2)}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500 font-mono">NP</span>
                )}
              </div>
            )}

            {/* Energy / Work: kcal bold on top, kJ yellow underneath; click to toggle calculation formula */}
            <div
              onClick={() => {
                if (workResult && effectiveAvgWatts) {
                  setShowWorkCalc((prev) => !prev);
                }
              }}
              className={`p-3 rounded-2xl bg-slate-950 border flex flex-col transition select-none ${
                workResult && effectiveAvgWatts
                  ? 'border-slate-800 hover:border-amber-500/60 hover:bg-slate-900/60 cursor-pointer group'
                  : 'border-slate-800'
              }`}
              title={workResult && effectiveAvgWatts ? 'Click to view / hide Energy & Work calculation formula' : undefined}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-400 group-hover:text-amber-300 transition">
                  {workResult ? 'Energy / Work' : 'Energy / HR'}
                </span>
                {workResult && effectiveAvgWatts && (
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-amber-400/80 transition-transform duration-200 ${
                      showWorkCalc ? 'rotate-180 text-amber-300' : ''
                    }`}
                  />
                )}
              </div>
              <span className="text-sm sm:text-base font-black font-mono text-white mt-1">
                {workResult
                  ? `${workResult.kcal} kcal`
                  : calories
                  ? `${Math.round(calories)} kcal`
                  : activity.average_heartrate
                  ? `${Math.round(activity.average_heartrate)} bpm`
                  : '--'}
              </span>
              <div className="flex items-center justify-between mt-0.5">
                {workResult ? (
                  <span className="text-[10px] text-amber-400 font-mono font-bold">
                    {workResult.formattedKj}
                  </span>
                ) : activity.suffer_score ? (
                  <span className="text-[10px] text-rose-400 font-mono">
                    suffer score: {activity.suffer_score}
                  </span>
                ) : null}
                {workResult && effectiveAvgWatts && (
                  <span className="text-[9px] text-slate-500 group-hover:text-amber-400/80 transition">
                    {showWorkCalc ? 'Hide calc' : 'Calc'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Collapsible Energy / Work Calculation Formula */}
          {showWorkCalc && workResult && effectiveAvgWatts && (
            <div
              className={`p-3.5 rounded-2xl border text-xs space-y-2 transition-all duration-200 ${
                isLight
                  ? 'bg-amber-50/80 border-amber-300/80 text-slate-800'
                  : 'bg-slate-950 border-amber-500/30 text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div
                  className={`font-bold flex items-center gap-1.5 text-xs ${
                    isLight ? 'text-amber-700' : 'text-amber-300'
                  }`}
                >
                  <Flame className="w-4 h-4 text-amber-500" />
                  <span>Energy / Work Calculation:</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowWorkCalc(false);
                  }}
                  className="text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded-md hover:bg-slate-800 transition"
                >
                  Close
                </button>
              </div>
              <div className={`font-mono text-[11px] space-y-1 pl-5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                <div>• {(durationMoving / 3600).toFixed(1)}-Hour Ride at {Math.round(effectiveAvgWatts)} Watts</div>
                <div>• Hours = {(durationMoving / 3600).toFixed(2)} h ({durationMoving.toLocaleString()} seconds)</div>
                <div>
                  • kJ = {Math.round(effectiveAvgWatts)} W × {(durationMoving / 3600).toFixed(2)} h × 3.6 ={' '}
                  <strong className={isLight ? 'text-slate-900 font-bold' : 'text-amber-300 font-bold'}>
                    {workResult.formattedKj}
                  </strong>{' '}
                  (roughly {workResult.kcal} kcal)
                </div>
              </div>
            </div>
          )}


          {/* TSS (Training Stress Score) & Recovery Estimation Card */}
          {tssResult && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-slate-900 to-slate-950 border border-amber-500/30 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Award className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black text-amber-300 uppercase tracking-wider">
                        Training Stress Score
                      </span>
                      <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-200/90 text-[#78350F] border border-amber-600/30">
                        {tssResult.type}
                      </span>
                      {detailsRecord?.calibration?.manualTss !== undefined && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          Custom
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {tssResult.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <span className="text-2xl sm:text-3xl font-black font-mono text-amber-400">
                      {tssResult.tss}
                    </span>
                    <span className="text-[10px] text-slate-500 block font-sans font-bold">TSS</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsEditingTss((prev) => !prev)}
                    className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 border border-slate-700 transition-all cursor-pointer shadow-xs"
                    title="Edit TSS value or change calculation model"
                  >
                    <Sliders className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Collapsible TSS Editing Drawer */}
              {isEditingTss && (
                <div className="p-3.5 rounded-xl bg-slate-950/95 border border-amber-500/40 space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                      Customize Activity TSS &amp; Calculation Model
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Per-activity override
                    </span>
                  </div>

                  {/* Manual TSS Value Input */}
                  <div>
                    <label className="text-[11px] font-medium text-slate-300 block mb-1">
                      Manual TSS Value (overrides all automatic formulas)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="800"
                        placeholder={String(tssResult.tss)}
                        value={manualTssInput}
                        onChange={(e) => setManualTssInput(e.target.value)}
                        className="w-28 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold font-mono text-amber-400 focus:outline-none focus:border-amber-400"
                      />
                      <span className="text-[11px] text-slate-400 font-mono">TSS points</span>
                    </div>
                  </div>

                  {/* Calculation Model Selector */}
                  <div>
                    <label className="text-[11px] font-medium text-slate-300 block mb-1.5">
                      Or Select Calculation Model:
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTssModel('auto');
                          setManualTssInput('');
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          selectedTssModel === 'auto'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        Auto Default
                      </button>

                      {/* Sport-specific options */}
                      {classification.category === 'Run' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTssModel('rTSS');
                              setManualTssInput('');
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                              selectedTssModel === 'rTSS'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs'
                                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                            }`}
                          >
                            Pace (rTSS)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTssModel('hrTSS');
                              setManualTssInput('');
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                              selectedTssModel === 'hrTSS'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs'
                                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                            }`}
                          >
                            Heart Rate (hrTSS)
                          </button>
                        </>
                      )}

                      {classification.category === 'Swim' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTssModel('sTSS');
                              setManualTssInput('');
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                              selectedTssModel === 'sTSS'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs'
                                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                            }`}
                          >
                            Pace / CSS (sTSS)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTssModel('hrTSS');
                              setManualTssInput('');
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                              selectedTssModel === 'hrTSS'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs'
                                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                            }`}
                          >
                            Heart Rate (hrTSS)
                          </button>
                        </>
                      )}

                      {(classification.category === 'Bike' || classification.subType === 'Turbo Trainer' || classification.subType === 'Bike') && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTssModel('powerTSS');
                              setManualTssInput('');
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                              selectedTssModel === 'powerTSS'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs'
                                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                            }`}
                          >
                            Power (TSS)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTssModel('hrTSS');
                              setManualTssInput('');
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                              selectedTssModel === 'hrTSS'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs'
                                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                            }`}
                          >
                            Heart Rate (hrTSS)
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={handleRestoreDefaultTss}
                      disabled={isSavingTss}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      Restore Default / Auto
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveTssConfig}
                      disabled={isSavingTss}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                    >
                      {tssSaveSuccess ? (
                        <>
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          <span>Saved!</span>
                        </>
                      ) : (
                        <span>Save TSS</span>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Recovery Guidance */}
              {recoveryEstimate && (
                <div className="pt-2.5 border-t border-slate-800/80 flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
                  <div className="flex items-center gap-2">
                    <BatteryCharging className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="text-xs">
                      <span className="font-bold text-white mr-1.5">
                        ~{recoveryEstimate.recoveryHours}h Recovery
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${recoveryEstimate.statusColor}`}>
                        {recoveryEstimate.fatigueLevel} Fatigue
                      </span>
                    </div>
                  </div>

                  {onOpenAthleteProfile && (
                    <button
                      type="button"
                      onClick={onOpenAthleteProfile}
                      className="text-[11px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 hover:underline ml-auto cursor-pointer"
                    >
                      <Sliders className="w-3 h-3" />
                      <span>Adjust Zones & Paces</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Athlete Perceived Exertion (sRPE) & Pre-Workout Readiness */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HeartHandshake className="w-4 h-4 text-amber-400" />
                <div>
                  <h4 className="text-xs font-black text-white uppercase tracking-wider">
                    Internal Load & Readiness
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Pre-Workout Feeling & Post-Workout RPE
                  </span>
                </div>
              </div>
              {effortFeedback?.sRpeLoad ? (
                <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg">
                  {effortFeedback.sRpeLoad} sRPE
                </span>
              ) : null}
            </div>

            {/* Pre-Workout Feeling (1 to 5) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300 font-semibold">How were you feeling before this workout?</span>
                <span className="text-slate-500 font-mono text-[10px]">Readiness</span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { score: 1 as const, emoji: '🪫', label: 'Drained' },
                  { score: 2 as const, emoji: '🥱', label: 'Low' },
                  { score: 3 as const, emoji: '😐', label: 'Normal' },
                  { score: 4 as const, emoji: '🙂', label: 'Good' },
                  { score: 5 as const, emoji: '⚡', label: 'Primed' },
                ].map((item) => {
                  const isSelected = effortFeedback?.preWorkoutFeeling === item.score;
                  return (
                    <button
                      key={item.score}
                      type="button"
                      onClick={() => handleSaveFeeling(item.score)}
                      className={`p-2 rounded-xl border flex flex-col items-center text-center transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-sm">{item.emoji}</span>
                      <span className="text-[10px] mt-0.5 font-bold leading-tight">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Post-Workout RPE (1 to 10 Borg CR-10 scale) */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-300 font-semibold">Perceived Exertion of the Workout (RPE)</span>
                <span className="text-slate-500 font-mono text-[10px]">Borg CR-10</span>
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-1">
                {[
                  { rpe: 1, label: 'Very Light' },
                  { rpe: 2, label: 'Easy' },
                  { rpe: 3, label: 'Moderate' },
                  { rpe: 4, label: 'Somewhat Hard' },
                  { rpe: 5, label: 'Hard' },
                  { rpe: 6, label: 'Hard+' },
                  { rpe: 7, label: 'Very Hard' },
                  { rpe: 8, label: 'Very Hard+' },
                  { rpe: 9, label: 'Near Max' },
                  { rpe: 10, label: 'Maximal' },
                ].map((item) => {
                  const isSelected = effortFeedback?.rpe === item.rpe;
                  return (
                    <button
                      key={item.rpe}
                      type="button"
                      onClick={() => handleSaveRpe(item.rpe)}
                      title={`${item.rpe}/10: ${item.label}`}
                      className={`py-1.5 px-1 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center ${
                        isSelected
                          ? 'bg-amber-500 border-amber-400 text-slate-950 font-black shadow-md'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 hover:border-slate-700 font-bold'
                      }`}
                    >
                      <span className="text-xs font-mono font-black">{item.rpe}</span>
                      <span className="text-[8px] truncate max-w-full opacity-80">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* sRPE load summary & discrepancy insight */}
            {effortFeedback?.rpe && (
              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs flex flex-col gap-1">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span className="text-slate-400">
                    Foster's Session-RPE Load:
                  </span>
                  <span className="font-mono font-bold text-amber-300">
                    {effortFeedback.rpe} RPE × {Math.max(1, Math.round(durationMoving / 60))} min = {effortFeedback.sRpeLoad} load units
                  </span>
                </div>
                {/* Decoupling / Overtraining detection insight */}
                {effortFeedback.preWorkoutFeeling && effortFeedback.preWorkoutFeeling <= 2 && effortFeedback.rpe >= 7 && (
                  <p className="text-[11px] text-amber-300/90 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20 mt-1">
                    ⚠️ <strong>Under-Recovery Flag:</strong> You felt drained/low pre-workout and reported a very high RPE ({effortFeedback.rpe}/10). Consider prioritizing hydration, sleep, and an active recovery or rest day.
                  </p>
                )}
                {effortFeedback.preWorkoutFeeling && effortFeedback.preWorkoutFeeling >= 4 && effortFeedback.rpe <= 4 && (
                  <p className="text-[11px] text-emerald-300/90 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20 mt-1">
                    ✨ <strong>High Efficiency:</strong> High readiness and low perceived exertion. Body is adapting well to current training block.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Swim Moving Laps Breakdown if Swim activity and laps are present */}
          {classification.category === 'Swim' && swimPace?.laps && swimPace.laps.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-sky-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Waves className="w-3.5 h-3.5 text-sky-400" />
                  <span>Moving Laps ({swimPace.laps.length} Laps)</span>
                </h4>
                <span className="text-xs font-mono font-bold text-sky-400">
                  Avg {swimPace.pacePer100mFormatted}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pt-1">
                {swimPace.laps.map((lap) => {
                  const isRestLap = Boolean(lap.isRest || lap.distanceM <= 0);
                  return (
                    <div
                      key={lap.lapIndex}
                      className={`p-2 rounded-xl border flex flex-col text-xs transition-colors ${
                        isRestLap || lap.isIgnored
                          ? 'bg-slate-950/40 border-slate-800/40 opacity-55'
                          : 'bg-slate-900 border-slate-800/80'
                      }`}
                    >
                      <div className="flex items-center justify-between text-slate-400 text-[10px]">
                        <span className={isRestLap ? 'text-slate-500 font-semibold' : ''}>
                          {isRestLap ? `Rest ${lap.lapIndex}` : `Lap ${lap.lapIndex}`}
                        </span>
                        {!isRestLap && <span>{lap.distanceM}m</span>}
                      </div>
                      <div className="flex items-center justify-between font-mono font-bold text-white mt-1">
                        <span>{formatDuration(lap.movingTimeSec)}</span>
                        {!isRestLap && (
                          <span className="text-sky-300">{lap.pacePer100mFormatted}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Running Kilometer Splits & Pacing Dynamics Breakdown */}
          {classification.category === 'Run' && runDetails && (
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3 overflow-hidden">
              <div className="flex items-center justify-start flex-wrap gap-2.5">
                {/* Title */}
                <div className="flex items-center gap-2 mr-0.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                    <Footprints className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                      Kilometer Splits ({runDetails.splits.length} Splits)
                    </h4>
                    <span className="text-[10px] text-slate-400">
                      {runDetails.consistencySummary}
                    </span>
                  </div>
                </div>

                {/* Left-Aligned Summary Metric Badges (Avg Pace, Cadence, GAP) */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-mono font-bold text-amber-400 flex items-center gap-1">
                    <Gauge className="w-3 h-3 text-amber-400/80 inline" />
                    <span>Avg {runDetails.avgPaceFormatted}</span>
                  </div>
                  {runDetails.avgCadence && (
                    <div className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300 flex items-center gap-1">
                      <Activity className="w-3 h-3 text-slate-400 inline" />
                      <span>{runDetails.avgCadence} spm</span>
                    </div>
                  )}
                  {runDetails.gradeAdjustedPaceFormatted && (
                    <div className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-mono text-emerald-400 flex items-center gap-1" title="Grade Adjusted Pace">
                      <TrendingUp className="w-3 h-3 text-emerald-400 inline" />
                      <span>GAP {runDetails.gradeAdjustedPaceFormatted}</span>
                    </div>
                  )}
                </div>

                {/* Left-Aligned View Mode Toggle Tabs (Pace, GAP, HR, Cards) */}
                <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setSplitsDisplayMode('pace')}
                    className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                      splitsDisplayMode === 'pace'
                        ? 'bg-amber-500 text-slate-950 font-black'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Display 1km splits as Pace bar chart"
                  >
                    <Gauge className="w-3 h-3" />
                    <span>Pace Bar Chart</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitsDisplayMode('gap')}
                    className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                      splitsDisplayMode === 'gap'
                        ? 'bg-emerald-500 text-slate-950 font-black'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Display 1km splits as Grade Adjusted Pace (GAP) bar chart"
                  >
                    <TrendingUp className="w-3 h-3 text-emerald-400" />
                    <span>GAP Bar Chart</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitsDisplayMode('hr')}
                    className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                      splitsDisplayMode === 'hr'
                        ? 'bg-amber-500 text-slate-950 font-black'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Display 1km splits as HR bar chart"
                  >
                    <Heart className="w-3 h-3 text-rose-400" />
                    <span>HR Bar Chart</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitsDisplayMode('cards')}
                    className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                      splitsDisplayMode === 'cards'
                        ? 'bg-amber-500 text-slate-950 font-black'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Display 1km splits as Cards"
                  >
                    <LayoutGrid className="w-3 h-3" />
                    <span>Cards</span>
                  </button>
                </div>
              </div>

              {/* Pace Bar Chart View (Extra box removed, starts right out splits box) */}
              {splitsDisplayMode === 'pace' && (() => {
                const splitsWithPace = runDetails.splits.map((s) => ({
                  ...s,
                  paceSec: s.paceSecPerKm || (s.movingTimeSec / Math.max(0.01, Number(s.distanceKm))),
                }));
                const minSec = Math.min(...splitsWithPace.map((s) => s.paceSec));
                const maxSec = Math.max(...splitsWithPace.map((s) => s.paceSec));
                const secRange = Math.max(1, maxSec - minSec);

                return (
                  <div className="space-y-1.5 pt-1 border-t border-slate-800/60">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pb-0.5">
                      <span className="font-semibold text-slate-300">Kilometer Pace Progression (/km)</span>
                      <span className="font-mono text-amber-400 text-[10px]">Faster splits = Taller bars</span>
                    </div>

                    <div className="w-full overflow-x-auto pb-1 scrollbar-thin -mx-3.5 px-3.5">
                      <div className="flex items-end gap-1.5 min-w-fit h-44 pt-4 px-0.5">
                        {splitsWithPace.map((split) => {
                          const heightPct = secRange === 0 ? 70 : 30 + ((maxSec - split.paceSec) / secRange) * 60;
                          return (
                            <div
                              key={split.splitIndex}
                              className="flex flex-col items-center justify-end h-full min-w-[50px] sm:min-w-[56px] flex-1 group"
                              title={`Km ${split.splitIndex}: ${split.paceFormatted} • ${split.distanceKm} km in ${formatDuration(split.movingTimeSec)}${split.avgHr ? ` • ${split.avgHr} bpm` : ''}${split.elevationDiffM ? ` • ${split.elevationDiffM > 0 ? '+' : ''}${split.elevationDiffM}m elev` : ''}`}
                            >
                              <span className="text-[10px] font-mono font-bold text-amber-300 whitespace-nowrap mb-1">
                                {split.paceFormatted.replace('/km', '')}
                              </span>

                              <div
                                style={{ height: `${Math.max(15, Math.min(100, heightPct))}%` }}
                                className={`w-full rounded-t-lg transition-all group-hover:brightness-125 ${
                                  split.isFasterThanAvg
                                    ? 'bg-gradient-to-t from-amber-600 to-amber-400 border-t border-x border-amber-300/40 shadow-xs shadow-amber-500/20'
                                    : 'bg-gradient-to-t from-sky-600/70 to-sky-400/80 border-t border-x border-sky-300/30'
                                }`}
                              />

                              <div className="mt-1.5 flex flex-col items-center text-center">
                                <span className="text-[11px] font-bold text-slate-200 font-mono leading-none">
                                  Km {split.splitIndex}
                                </span>
                                {split.avgHr ? (
                                  <span className="text-[9px] font-mono text-rose-400 mt-0.5 leading-none">
                                    {split.avgHr}
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-mono text-slate-500 mt-0.5 leading-none">
                                    {split.distanceKm}k
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* GAP (Grade Adjusted Pace) Bar Chart View */}
              {splitsDisplayMode === 'gap' && (() => {
                const splitsWithGap = runDetails.splits.map((s) => ({
                  ...s,
                  gapSec: s.gapSecPerKm || s.paceSecPerKm || (s.movingTimeSec / Math.max(0.01, Number(s.distanceKm))),
                }));
                const minSec = Math.min(...splitsWithGap.map((s) => s.gapSec));
                const maxSec = Math.max(...splitsWithGap.map((s) => s.gapSec));
                const secRange = Math.max(1, maxSec - minSec);
                const avgGapSec = splitsWithGap.reduce((acc, s) => acc + s.gapSec, 0) / Math.max(1, splitsWithGap.length);

                return (
                  <div className="space-y-1.5 pt-1 border-t border-slate-800/60">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pb-0.5">
                      <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                        Kilometer Grade Adjusted Pace (GAP /km)
                      </span>
                      <span className="font-mono text-emerald-400 text-[10px]">
                        Flat-ground equivalent • Faster = Taller
                      </span>
                    </div>

                    <div className="w-full overflow-x-auto pb-1 scrollbar-thin -mx-3.5 px-3.5">
                      <div className="flex items-end gap-1.5 min-w-fit h-44 pt-4 px-0.5">
                        {splitsWithGap.map((split) => {
                          const heightPct = secRange === 0 ? 70 : 30 + ((maxSec - split.gapSec) / secRange) * 60;
                          const isFasterThanAvgGap = split.gapSec < avgGapSec;
                          return (
                            <div
                              key={split.splitIndex}
                              className="flex flex-col items-center justify-end h-full min-w-[50px] sm:min-w-[56px] flex-1 group"
                              title={`Km ${split.splitIndex}: GAP ${split.gapFormatted || split.paceFormatted} (Actual ${split.paceFormatted}) • ${split.distanceKm} km in ${formatDuration(split.movingTimeSec)}${split.elevationDiffM !== undefined ? ` • ${split.elevationDiffM > 0 ? `+${split.elevationDiffM}m climb` : `${split.elevationDiffM}m descent`}` : ''}${split.avgHr ? ` • ${split.avgHr} bpm` : ''}`}
                            >
                              <span className="text-[10px] font-mono font-bold text-emerald-300 whitespace-nowrap mb-1">
                                {(split.gapFormatted || split.paceFormatted).replace('/km', '')}
                              </span>

                              <div
                                style={{ height: `${Math.max(15, Math.min(100, heightPct))}%` }}
                                className={`w-full rounded-t-lg transition-all group-hover:brightness-125 ${
                                  isFasterThanAvgGap
                                    ? 'bg-gradient-to-t from-emerald-600 to-emerald-400 border-t border-x border-emerald-300/40 shadow-xs shadow-emerald-500/20'
                                    : 'bg-gradient-to-t from-teal-700/70 to-teal-400/80 border-t border-x border-teal-300/30'
                                }`}
                              />

                              <div className="mt-1.5 flex flex-col items-center text-center">
                                <span className="text-[11px] font-bold text-slate-200 font-mono leading-none">
                                  Km {split.splitIndex}
                                </span>
                                {split.elevationDiffM !== undefined ? (
                                  <span className={`text-[9px] font-mono mt-0.5 leading-none ${split.elevationDiffM > 0 ? 'text-amber-300' : 'text-sky-300'}`}>
                                    {split.elevationDiffM > 0 ? `+${split.elevationDiffM}m` : `${split.elevationDiffM}m`}
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-mono text-slate-500 mt-0.5 leading-none">
                                    {split.distanceKm}k
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Heart Rate Bar Chart View (Extra box removed, starts right out splits box) */}
              {splitsDisplayMode === 'hr' && (() => {
                const hrValues = runDetails.splits
                  .map((s) => s.avgHr)
                  .filter((h): h is number => typeof h === 'number' && h > 0);
                const hasHr = hrValues.length > 0;
                const minHr = hasHr ? Math.min(...hrValues) : 100;
                const maxHr = hasHr ? Math.max(...hrValues) : 180;
                const hrRange = Math.max(1, maxHr - minHr);

                return (
                  <div className="space-y-1.5 pt-1 border-t border-slate-800/60">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pb-0.5">
                      <span className="font-semibold text-slate-300 flex items-center gap-1">
                        <Heart className="w-3 h-3 text-rose-400" />
                        Kilometer Average Heart Rate (bpm)
                      </span>
                      {hasHr && (
                        <span className="font-mono text-rose-400 text-[10px]">
                          Avg {Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length)} bpm
                        </span>
                      )}
                    </div>

                    {!hasHr ? (
                      <div className="py-8 text-center text-xs text-slate-400">
                        No heart rate stream recorded for these 1km splits.
                      </div>
                    ) : (
                      <div className="w-full overflow-x-auto pb-1 scrollbar-thin -mx-3.5 px-3.5">
                        <div className="flex items-end gap-1.5 min-w-fit h-44 pt-4 px-0.5">
                          {runDetails.splits.map((split) => {
                            const hr = split.avgHr || 0;
                            const heightPct = hrRange === 0 || !hr ? 50 : 30 + ((hr - minHr) / hrRange) * 60;
                            return (
                              <div
                                key={split.splitIndex}
                                className="flex flex-col items-center justify-end h-full min-w-[50px] sm:min-w-[56px] flex-1 group"
                                title={`Km ${split.splitIndex}: ${hr ? `${hr} bpm` : 'No HR'} • Pace ${split.paceFormatted} • ${split.distanceKm} km in ${formatDuration(split.movingTimeSec)}`}
                              >
                                <span className="text-[10px] font-mono font-bold text-rose-300 whitespace-nowrap mb-1">
                                  {hr ? `${hr}` : '--'}
                                </span>

                                <div
                                  style={{ height: `${Math.max(15, Math.min(100, heightPct))}%` }}
                                  className="w-full rounded-t-lg transition-all group-hover:brightness-125 bg-gradient-to-t from-rose-600 to-rose-400 border-t border-x border-rose-300/40 shadow-xs shadow-rose-500/20"
                                />

                                <div className="mt-1.5 flex flex-col items-center text-center">
                                  <span className="text-[11px] font-bold text-slate-200 font-mono leading-none">
                                    Km {split.splitIndex}
                                  </span>
                                  <span className="text-[9px] font-mono text-slate-400 mt-0.5 leading-none">
                                    {split.paceFormatted.replace('/km', '')}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Splits Grid (Cards View) */}
              {splitsDisplayMode === 'cards' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-52 overflow-y-auto pt-1">
                  {runDetails.splits.map((split) => (
                    <div
                      key={split.splitIndex}
                      className="p-2.5 rounded-xl bg-slate-900 border border-slate-800/80 flex flex-col text-xs transition-colors hover:border-amber-500/30"
                    >
                      <div className="flex items-center justify-between text-slate-400 text-[10px]">
                        <span className="font-semibold text-slate-300">Km {split.splitIndex}</span>
                        <span>{split.distanceKm} km</span>
                      </div>
                      <div className="flex items-center justify-between font-mono font-bold text-white mt-1">
                        <span className={split.isFasterThanAvg ? 'text-amber-400' : 'text-slate-200'}>
                          {split.paceFormatted}
                        </span>
                        {split.avgHr ? (
                          <span className="text-rose-400 text-[11px] flex items-center gap-0.5">
                            <Heart className="w-2.5 h-2.5 inline" /> {split.avgHr}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[10px]">
                            {formatDuration(split.movingTimeSec)}
                          </span>
                        )}
                      </div>
                      {split.elevationDiffM !== undefined && (
                        <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-between pt-1 border-t border-slate-800/60">
                          <span>Elevation:</span>
                          <span className={split.elevationDiffM > 0 ? 'text-amber-300' : 'text-slate-400'}>
                            {split.elevationDiffM > 0 ? `+${split.elevationDiffM}m` : `${split.elevationDiffM}m`}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cycling Laps & Power Dynamics Breakdown */}
          {classification.category === 'Bike' && bikeDetails && (
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400">
                    <Bike className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-orange-300 uppercase tracking-wider">
                      Laps &amp; Power Intervals ({bikeDetails.laps.length} Laps)
                    </h4>
                    <span className="text-[10px] text-slate-400">
                      {bikeDetails.intensityFactor ? `Intensity Factor: ${bikeDetails.intensityFactor}` : ''}
                      {bikeDetails.variabilityIndex ? ` • VI: ${bikeDetails.variabilityIndex}` : ''}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-right">
                  <div className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-mono font-bold text-orange-400">
                    Avg {bikeDetails.avgSpeedKph} kph
                  </div>
                  {bikeDetails.avgWatts && (
                    <div className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-mono font-bold text-amber-300">
                      {bikeDetails.avgWatts}W
                    </div>
                  )}
                  {bikeDetails.avgCadence && (
                    <div className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-300">
                      {bikeDetails.avgCadence} rpm
                    </div>
                  )}
                </div>
              </div>

              {/* Laps Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-52 overflow-y-auto pt-1">
                {bikeDetails.laps.map((lap) => (
                  <div
                    key={lap.lapIndex}
                    className="p-2.5 rounded-xl bg-slate-900 border border-slate-800/80 flex flex-col text-xs transition-colors hover:border-orange-500/30"
                  >
                    <div className="flex items-center justify-between text-slate-400 text-[10px]">
                      <span className="font-semibold text-slate-300">{lap.name}</span>
                      <span>{lap.distanceKm} km</span>
                    </div>
                    <div className="flex items-center justify-between font-mono font-bold text-white mt-1">
                      <span className="text-orange-400">{lap.avgSpeedKph} kph</span>
                      {lap.avgWatts ? (
                        <span className="text-amber-300 text-[11px]">{lap.avgWatts}W</span>
                      ) : lap.avgHr ? (
                        <span className="text-rose-400 text-[11px] flex items-center gap-0.5">
                          <Heart className="w-2.5 h-2.5 inline" /> {lap.avgHr}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-between pt-1 border-t border-slate-800/60">
                      <span>{formatDuration(lap.movingTimeSec)}</span>
                      {lap.avgCadence ? <span>{lap.avgCadence} rpm</span> : lap.elevationGainM ? <span>+{lap.elevationGainM}m</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ======================================================= */}
          {/* WORKOUT ANALYSIS (INTERACTIVE LAPS CHART & SYNCED TABLE) */}
          {/* ======================================================= */}
          <WorkoutAnalysis
            activity={activity}
            details={detailsRecord}
            athleteProfile={athleteProfile}
            theme={theme}
          />

          {/* ======================================================= */}
          {/* CACHED STREAMS INTERACTIVE PLOT & TELEMETRY             */}
          {/* ======================================================= */}
          <div className="p-2.5 sm:p-3 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Interactive Streams & Plot
                </h4>
              </div>

              {loadingDetails ? (
                <span className="text-[11px] text-amber-400 flex items-center gap-1 font-mono">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Fetching streams...
                </span>
              ) : availableStreamsList.length > 0 ? (
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  {availableStreamsList.length} streams cached
                </span>
              ) : null}
            </div>

            {/* Interactive Stream Plot Component */}
            {streams ? (
              <StravaStreamPlot
                streams={streams}
                activity={activity}
                athleteProfile={athleteProfile}
              />
            ) : loadingDetails ? (
              <div className="p-8 rounded-2xl bg-slate-950/60 border border-slate-800 text-center flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                <p className="text-xs text-slate-400">Loading heart rate, pace, elevation, and sensor streams...</p>
              </div>
            ) : detailsError ? (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex flex-col sm:flex-row items-center justify-between gap-2.5">
                <span>{detailsError}</span>
                <button
                  type="button"
                  onClick={handleRecheckStreams}
                  disabled={loadingDetails}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingDetails ? 'animate-spin' : ''}`} />
                  <span>Recheck</span>
                </button>
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 text-center flex flex-col items-center justify-center gap-2.5">
                <p className="text-xs text-slate-400">No streams recorded for this workout.</p>
                <button
                  type="button"
                  onClick={handleRecheckStreams}
                  disabled={loadingDetails}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
                  title="Query Strava API again to fetch stream telemetry"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingDetails ? 'animate-spin' : ''}`} />
                  <span>Recheck</span>
                </button>
              </div>
            )}
          </div>

          {/* Time Spent in Training Zones Graph */}
          {activity && (
            <ActivityZoneChart
              activity={activity}
              streams={streams}
              athleteProfile={athleteProfile}
              theme={theme}
              title="Time in Training Zones"
            />
          )}
          {exportError && (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{exportError}</span>
            </div>
          )}

          {exportSuccess && (
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 stroke-[3]" />
                <span className="truncate">
                  {exportSuccess.alreadyExists
                    ? 'Activity already in Google Sheets (no duplicate written).'
                    : 'Successfully synced to FIT Track Training Log!'}
                </span>
              </div>
              <a
                href={exportSuccess.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-bold text-white hover:text-emerald-200 shrink-0 flex items-center gap-1"
              >
                <span>Open Sheet</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
          </ErrorBoundary>
        </div>
      </div>

      {/* Interactive Calibration Modal */}
      {isCalibrationOpen && (
        <ActivityCalibrationModal
          isOpen={isCalibrationOpen}
          activity={activity}
          detailsRecord={detailsRecord}
          stravaToken={stravaToken}
          onClose={() => setIsCalibrationOpen(false)}
          onCalibrationSaved={(updatedRecord) => {
            setDetailsRecord(updatedRecord);
          }}
        />
      )}

      {/* Delete Activity Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="max-w-md w-full rounded-2xl bg-slate-900 border border-rose-500/40 p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Activity</h3>
                <p className="text-xs text-slate-400">Are you sure you want to delete this activity?</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 bg-slate-950/60 p-3 rounded-xl border border-slate-800 leading-relaxed">
              &ldquo;{activity.name}&rdquo; will be marked as deleted and excluded from your training stress balance, weekly mileage, and fitness calculations.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (activity) {
                    markActivityAsDeleted(activity.id);
                    setIsDeletedLocally(true);
                    onDeleteActivity?.(activity.id);
                    setShowDeleteConfirm(false);
                    onClose();
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 cursor-pointer transition-colors flex items-center gap-1.5 shadow-md shadow-rose-900/30"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Yes, Delete Activity</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
