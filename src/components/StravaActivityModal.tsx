import React, { useState, useEffect } from 'react';
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
import { ActivityCalibrationModal } from './ActivityCalibrationModal';
import { appendActivityToTrainingLog } from '../utils/googleSheets';

interface StravaActivityModalProps {
  isOpen: boolean;
  activity: StravaActivity | null;
  stravaToken: string | null;
  athleteProfile: AthleteProfile;
  isGoogleConnected: boolean;
  onConnectGoogle: () => void;
  onClose: () => void;
  onActivityPublished?: (activityId: string) => void;
  onOpenAthleteProfile?: () => void;
  onDeleteActivity?: (activityId: string | number) => void;
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

function getCategoryIcon(category: string, className = 'w-5 h-5') {
  switch (category) {
    case 'Swim':
      return <Waves className={`${className} text-sky-400`} />;
    case 'Bike':
      return <Bike className={`${className} text-orange-400`} />;
    case 'Run':
      return <Footprints className={`${className} text-amber-400`} />;
    case 'Gym':
    case 'Strength':
      return <Dumbbell className={`${className} text-emerald-400`} />;
    default:
      return <Activity className={`${className} text-purple-400`} />;
  }
}

export const StravaActivityModal: React.FC<StravaActivityModalProps> = ({
  isOpen,
  activity,
  stravaToken,
  athleteProfile,
  isGoogleConnected,
  onConnectGoogle,
  onClose,
  onActivityPublished,
  onOpenAthleteProfile,
  onDeleteActivity,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletedLocally, setIsDeletedLocally] = useState(false);
  const [detailsRecord, setDetailsRecord] = useState<StravaActivityDetailsRecord | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);

  const [isExportingToSheets, setIsExportingToSheets] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<{ url: string; alreadyExists: boolean } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Manual TSS & Model Override State
  const [isEditingTss, setIsEditingTss] = useState(false);
  const [manualTssInput, setManualTssInput] = useState<string>('');
  const [selectedTssModel, setSelectedTssModel] = useState<'auto' | 'hrTSS' | 'rTSS' | 'sTSS' | 'powerTSS'>('auto');
  const [isSavingTss, setIsSavingTss] = useState(false);
  const [tssSaveSuccess, setTssSaveSuccess] = useState(false);

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
      return;
    }

    const activityId = String(activity.id);

    // 1. Check if details already cached in IndexedDB
    let isCancelled = false;
    async function loadData() {
      try {
        const cached = await getCachedStravaActivityRecord(activityId);
        if (cached && (cached.activity || cached.streams)) {
          if (!isCancelled) setDetailsRecord(cached);
          return;
        }

        // 2. If not cached and we have strava token, fetch on-demand
        if (stravaToken) {
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

  // Calculate TSS customized with athlete physiological profile & calibration
  const tssResult = calculateActivityTSS(activity, detailsRecord || undefined, athleteProfile);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-start justify-between gap-3 bg-slate-950/60 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 mt-0.5">
              {getCategoryIcon(classification.category, 'w-6 h-6')}
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-black text-white leading-tight truncate">
                {activity.name}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {formatActivityDate(activity.start_date_local || activity.start_date)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsCalibrationOpen(true)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 transition-colors cursor-pointer border border-slate-700"
              title="Calibrate / Fix Inaccurate Data"
            >
              <Wrench className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/50 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer border border-slate-700 hover:border-rose-500/30"
              title="Delete Activity"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Badges strip */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold flex items-center gap-1.5">
              {getCategoryIcon(classification.category, 'w-3.5 h-3.5')}
              <span>{classification.subType}</span>
            </span>

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

            {/* "New" badge stays for 24 hours even if published */}
            {isNew && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[11px] font-black uppercase tracking-wide">
                <Sparkles className="w-3.5 h-3.5" />
                New (last 24h)
              </span>
            )}

            {/* "Unpublished" badge until sent to Google Sheets */}
            {isUnpublished ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[11px] font-black uppercase tracking-wide">
                <UploadCloud className="w-3.5 h-3.5" />
                Unpublished
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[11px] font-bold">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                Saved to Google Sheets
              </span>
            )}

            {/* Calibrate Data quick link button */}
            <button
              type="button"
              onClick={() => setIsCalibrationOpen(true)}
              className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 font-bold hover:underline cursor-pointer"
            >
              <Wrench className="w-3 h-3" />
              <span>{hasCalibration ? 'Edit Calibration' : 'Fix Data'}</span>
            </button>

            <a
              href={`https://www.strava.com/activities/${activity.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-xs text-[#FC5200] hover:underline font-bold"
            >
              <span>Strava.com</span>
              <ExternalLink className="w-3 h-3" />
            </a>
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
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
                {classification.category === 'Swim' ? 'Distance' : 'Distance / Effort'}
              </span>
              <span className="text-sm sm:text-base font-bold font-mono text-white mt-1">
                {metrics.primaryMetricLabel}
              </span>
              {metrics.secondaryMetricLabel && (
                <span className="text-[10px] text-amber-400 font-mono">
                  {metrics.secondaryMetricLabel}
                </span>
              )}
            </div>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col">
              <span className="text-[11px] font-medium text-slate-400">
                {classification.category === 'Swim'
                  ? 'Avg Pace / 100m'
                  : classification.subType === 'Bike'
                  ? 'Avg Speed'
                  : 'Elevation'}
              </span>
              <span className="text-sm sm:text-base font-bold font-mono text-white mt-1">
                {classification.category === 'Swim'
                  ? (swimPace?.pacePer100mFormatted || '0:00/100m')
                  : classification.subType === 'Bike'
                  ? `${outdoorAvgSpeedKph || '--'} kph`
                  : (activity.total_elevation_gain ? `↑ ${Math.round(activity.total_elevation_gain)}m` : 'Flat / Indoor')}
              </span>
              {classification.subType === 'Bike' && outdoorMaxSpeedKph ? (
                <span className="text-[10px] text-slate-400 font-mono">
                  max {outdoorMaxSpeedKph} kph
                </span>
              ) : classification.category !== 'Swim' && activity.max_speed ? (
                <span className="text-[10px] text-slate-500 font-mono">
                  max {(activity.max_speed * 3.6).toFixed(1)} kph
                </span>
              ) : null}
            </div>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col">
              <span className="text-[11px] font-medium text-slate-400">
                {workResult ? 'Energy / Work' : 'Energy / HR'}
              </span>
              <span className="text-sm sm:text-base font-bold font-mono text-white mt-1">
                {workResult ? workResult.formattedKj : calories ? `${Math.round(calories)} kcal` : activity.average_heartrate ? `${Math.round(activity.average_heartrate)} bpm` : '--'}
              </span>
              {workResult ? (
                <span className="text-[10px] text-amber-400 font-mono">
                  ~{workResult.kcal} kcal
                </span>
              ) : activity.suffer_score ? (
                <span className="text-[10px] text-rose-400 font-mono">
                  suffer score: {activity.suffer_score}
                </span>
              ) : null}
            </div>
          </div>

          {/* Dedicated Cycling Power & Normalized Power & Energy (kJ) Card */}
          {isBikeOrTurbo && (effectiveAvgWatts || normalizedPower) && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-slate-950 to-slate-900 border border-amber-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <h4 className="text-xs font-black text-amber-300 uppercase tracking-wider">
                    Cycling Power & Mechanical Work
                  </h4>
                </div>
                {classification.subType === 'Bike' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    Outdoor Ride
                  </span>
                )}
                {classification.subType === 'Turbo Trainer' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    Turbo Trainer
                  </span>
                )}
              </div>

              {/* Power Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col">
                  <span className="text-[10px] text-slate-400">Average Power</span>
                  <span className="text-base sm:text-lg font-black font-mono text-white mt-0.5">
                    {effectiveAvgWatts ? `${Math.round(effectiveAvgWatts)}W` : '--'}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col">
                  <span className="text-[10px] text-slate-400">Normalized Power (NP)</span>
                  <span className="text-base sm:text-lg font-black font-mono text-amber-400 mt-0.5">
                    {normalizedPower ? `${Math.round(normalizedPower)}W` : '--'}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col">
                  <span className="text-[10px] text-slate-400">Mechanical Work</span>
                  <span className="text-base sm:text-lg font-black font-mono text-emerald-400 mt-0.5">
                    {workResult ? workResult.formattedKj : '--'}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col">
                  <span className="text-[10px] text-slate-400">Est. Energy Burn</span>
                  <span className="text-base sm:text-lg font-black font-mono text-amber-300 mt-0.5">
                    {workResult ? `~${workResult.kcal} kcal` : calories ? `${Math.round(calories)} kcal` : '--'}
                  </span>
                </div>
              </div>

              {/* Work Formula Callout */}
              {workResult && effectiveAvgWatts && (
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 space-y-1">
                  <div className="font-bold text-amber-300 flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                    <span>Energy / Work Calculation:</span>
                  </div>
                  <div className="text-slate-400 font-mono space-y-0.5 pl-5">
                    <div>• {(durationMoving / 3600).toFixed(1)}-Hour Ride at {Math.round(effectiveAvgWatts)} Watts</div>
                    <div>• Hours = {(durationMoving / 3600).toFixed(2)} h ({durationMoving.toLocaleString()} seconds)</div>
                    <div>
                      • kJ = {Math.round(effectiveAvgWatts)} W × {(durationMoving / 3600).toFixed(2)} h × 3.6 = <strong className="text-white">{workResult.formattedKj}</strong> (roughly {workResult.kcal} kcal)
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Outdoor Ride Speed Telemetry (Average & Max Speed) */}
          {classification.subType === 'Bike' && (
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Gauge className="w-4 h-4 text-orange-400 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-white block">
                    Outdoor Cycling Speeds
                  </span>
                  <span className="text-[11px] text-slate-400">
                    GPS-measured outdoor velocity
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4 text-right">
                <div>
                  <span className="text-[10px] text-slate-500 block">Avg Speed</span>
                  <span className="text-sm font-bold font-mono text-white">
                    {outdoorAvgSpeedKph || '--'} kph
                  </span>
                </div>
                <div className="border-l border-slate-800 pl-4">
                  <span className="text-[10px] text-slate-500 block">Max Speed</span>
                  <span className="text-sm font-bold font-mono text-orange-400">
                    {outdoorMaxSpeedKph ? `${outdoorMaxSpeedKph} kph` : '--'}
                  </span>
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
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200">
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
                        onClick={() => setSelectedTssModel('auto')}
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
                            onClick={() => setSelectedTssModel('rTSS')}
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
                            onClick={() => setSelectedTssModel('hrTSS')}
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
                            onClick={() => setSelectedTssModel('sTSS')}
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
                            onClick={() => setSelectedTssModel('hrTSS')}
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
                            onClick={() => setSelectedTssModel('powerTSS')}
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
                            onClick={() => setSelectedTssModel('hrTSS')}
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
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
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

                <div className="flex items-center gap-2 text-right">
                  <div className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-mono font-bold text-amber-400">
                    Avg {runDetails.avgPaceFormatted}
                  </div>
                  {runDetails.avgCadence && (
                    <div className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300">
                      {runDetails.avgCadence} spm
                    </div>
                  )}
                  {runDetails.gradeAdjustedPaceFormatted && (
                    <div className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-mono text-emerald-400" title="Grade Adjusted Pace">
                      GAP {runDetails.gradeAdjustedPaceFormatted}
                    </div>
                  )}
                </div>
              </div>

              {/* Splits Grid */}
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

              {/* Running Heart Rate Zone Distribution */}
              {runDetails.hrZones.some((z) => z.pct > 0) && (
                <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-300 flex items-center gap-1">
                      <Heart className="w-3 h-3 text-rose-400" />
                      Running HR Zones
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Max HR {runDetails?.maxHr || athleteProfile.maxHeartRate || 185} bpm
                    </span>
                  </div>

                  {/* Horizontal stacked zone bar */}
                  <div className="w-full bg-slate-900 rounded-full h-2.5 flex overflow-hidden">
                    {runDetails.hrZones.map((z) => (
                      z.pct > 0 ? (
                        <div
                          key={z.zone}
                          className="h-full transition-all"
                          style={{ width: `${z.pct}%`, backgroundColor: z.color }}
                          title={`${z.name}: ${z.pct}% (${formatDuration(z.seconds)})`}
                        />
                      ) : null
                    ))}
                  </div>

                  {/* Zone Legend */}
                  <div className="grid grid-cols-5 gap-1 pt-1 text-[10px] font-mono text-center">
                    {runDetails.hrZones.map((z) => (
                      <div key={z.zone} className="flex flex-col items-center">
                        <span className="font-bold" style={{ color: z.color }}>Z{z.zone}</span>
                        <span className="text-slate-400">{z.pct}%</span>
                      </div>
                    ))}
                  </div>
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

              {/* Cycling Power Zones Distribution (Coggan 7 Zones) */}
              {bikeDetails.powerZones.some((z) => z.pct > 0) && (
                <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-300 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-400" />
                      Cycling Power Zones (Coggan 7-Zone)
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      FTP {athleteProfile.bikeFtp || 250}W
                    </span>
                  </div>

                  {/* Horizontal stacked zone bar */}
                  <div className="w-full bg-slate-900 rounded-full h-2.5 flex overflow-hidden">
                    {bikeDetails.powerZones.map((z) => (
                      z.pct > 0 ? (
                        <div
                          key={z.zone}
                          className="h-full transition-all"
                          style={{ width: `${z.pct}%`, backgroundColor: z.color }}
                          title={`${z.name}: ${z.pct}% (${formatDuration(z.seconds)})`}
                        />
                      ) : null
                    ))}
                  </div>

                  {/* Zone Legend */}
                  <div className="grid grid-cols-7 gap-1 pt-1 text-[9px] font-mono text-center">
                    {bikeDetails.powerZones.map((z) => (
                      <div key={z.zone} className="flex flex-col items-center">
                        <span className="font-bold" style={{ color: z.color }}>Z{z.zone}</span>
                        <span className="text-slate-400">{z.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cycling Heart Rate Zones */}
              {bikeDetails.hrZones.some((z) => z.pct > 0) && (
                <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-300 flex items-center gap-1">
                      <Heart className="w-3 h-3 text-rose-400" />
                      Cycling HR Zones
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Max HR {bikeDetails?.maxHr || athleteProfile.maxHeartRate || 185} bpm
                    </span>
                  </div>

                  <div className="w-full bg-slate-900 rounded-full h-2.5 flex overflow-hidden">
                    {bikeDetails.hrZones.map((z) => (
                      z.pct > 0 ? (
                        <div
                          key={z.zone}
                          className="h-full transition-all"
                          style={{ width: `${z.pct}%`, backgroundColor: z.color }}
                          title={`${z.name}: ${z.pct}% (${formatDuration(z.seconds)})`}
                        />
                      ) : null
                    ))}
                  </div>

                  <div className="grid grid-cols-5 gap-1 pt-1 text-[10px] font-mono text-center">
                    {bikeDetails.hrZones.map((z) => (
                      <div key={z.zone} className="flex flex-col items-center">
                        <span className="font-bold" style={{ color: z.color }}>Z{z.zone}</span>
                        <span className="text-slate-400">{z.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================================================= */}
          {/* CACHED STREAMS INTERACTIVE PLOT & TELEMETRY             */}
          {/* ======================================================= */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
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
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                {detailsError}
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-400">
                No streams recorded for this workout.
              </div>
            )}
          </div>

          {/* Time Spent in Training Zones Graph */}
          {activity && (
            <ActivityZoneChart
              activity={activity}
              streams={streams}
              athleteProfile={athleteProfile}
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
        </div>

        {/* Modal Footer / Action CTA */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-colors cursor-pointer"
            >
              Close
            </button>

            <button
              type="button"
              onClick={() => setIsCalibrationOpen(true)}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-amber-400 hover:text-amber-300 text-xs font-bold transition-colors cursor-pointer border border-slate-700 flex items-center gap-1.5"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>{hasCalibration ? 'Edit Calibration' : 'Fix Inaccurate Data'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportToSheets}
            disabled={isExportingToSheets}
            className={`px-5 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 shadow-lg transition-all cursor-pointer active:scale-95 disabled:opacity-50 ${
              isGoogleConnected
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20'
            }`}
          >
            {isExportingToSheets ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Exporting to Sheet...</span>
              </>
            ) : isGoogleConnected ? (
              <>
                <FileSpreadsheet className="w-4 h-4 stroke-[2.5]" />
                <span>{detailsRecord?.googleDrivePublishedAt ? 'Re-export to Google Sheets' : 'Send to Google Sheets'}</span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4 stroke-[2.5]" />
                <span>Connect Google to Export</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Interactive Calibration Modal */}
      {isCalibrationOpen && (
        <ActivityCalibrationModal
          isOpen={isCalibrationOpen}
          activity={activity}
          detailsRecord={detailsRecord}
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
