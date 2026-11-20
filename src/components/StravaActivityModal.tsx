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
  hasActualActivityCalibration,
  formatEfBadgeLabel,
  getActivityEfBadgeLabel,
  computeActivityEfAndDecoupling,
  createActivityThresholdSnapshot,
  STRAVA_STREAM_DEFINITIONS,
  hasRepeatingStreamArtifact,
  fetchSpecificStravaActivityStreams,
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
      return <Bike className={`${className} ${isLight ? 'text-orange-500' : 'text-orange-400'}`} />;
    case 'Run':
      return <Footprints className={`${className} ${isLight ? 'text-rose-600' : 'text-rose-400'}`} />;
    case 'Gym':
    case 'Strength':
      return <Dumbbell className={`${className} ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />;
    default:
      return <Activity className={`${className} ${isLight ? 'text-purple-600' : 'text-purple-400'}`} />;
  }
}

export const StravaActivityModal: React.FC<StravaActivityModalProps> = ({
  isOpen,
  activity: propActivity,
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
  const [replacedActivity, setReplacedActivity] = useState<StravaActivity | null>(null);
  const activity = replacedActivity || propActivity;

  useEffect(() => {
    setReplacedActivity(null);
  }, [propActivity?.id]);

  useEffect(() => {
    const handleRepublishUpdate = (e: any) => {
      const detail = e.detail;
      if (
        detail?.oldActivityId &&
        detail?.newActivity &&
        String(detail.oldActivityId) === String(propActivity?.id)
      ) {
        setReplacedActivity(detail.newActivity);
        if (detail.newDetailsRecord) {
          setDetailsRecord(detail.newDetailsRecord);
        }
      }
    };
    window.addEventListener('fit_track_activities_updated', handleRepublishUpdate);
    return () => window.removeEventListener('fit_track_activities_updated', handleRepublishUpdate);
  }, [propActivity?.id]);

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

  // Running 1km splits display mode: pace bar chart, GAP bar chart, HR bar chart, cadence bar chart, or cards grid
  const [splitsDisplayMode, setSplitsDisplayMode] = useState<'pace' | 'gap' | 'hr' | 'cadence' | 'cards'>('pace');
  const [efWarmupTrimMin, setEfWarmupTrimMin] = useState<0 | 10 | 15 | 'custom'>(0);
  const [isEfLapSelectorOpen, setIsEfLapSelectorOpen] = useState(false);
  const [customEfLapIndices, setCustomEfLapIndices] = useState<number[]>([]);

  // Specific Strava Stream Re-fetch Box state
  const [isStreamFetcherOpen, setIsStreamFetcherOpen] = useState(false);
  const [selectedStreamKeys, setSelectedStreamKeys] = useState<string[]>(['laps', 'cadence']);
  const [refetchingStreamKeys, setRefetchingStreamKeys] = useState<string[]>([]);
  const [streamFetchFeedback, setStreamFetchFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const toggleStreamKeySelection = (key: string) => {
    setSelectedStreamKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleRefetchSpecificStreams = async (keysToFetch: string[]) => {
    if (!activity || keysToFetch.length === 0) return;
    setRefetchingStreamKeys(keysToFetch);
    setStreamFetchFeedback(null);
    try {
      const res = await fetchSpecificStravaActivityStreams({
        accessToken: stravaToken,
        activity,
        existingRecord: detailsRecord,
        streamKeys: keysToFetch,
      });
      setDetailsRecord(res.record);
      if (res.updatedKeys.length > 0) {
        setStreamFetchFeedback({
          type: 'success',
          message:
            res.source === 'strava'
              ? `Re-fetched ${res.updatedKeys.join(', ')} from Strava API.`
              : `Refreshed ${res.updatedKeys.join(', ')} stream.`,
        });
      } else {
        setStreamFetchFeedback({
          type: 'error',
          message: `Strava did not return data for: ${keysToFetch.join(', ')}.`,
        });
      }
    } catch (err: any) {
      setStreamFetchFeedback({
        type: 'error',
        message: err?.message || 'Failed to re-fetch selected streams from Strava.',
      });
    } finally {
      setRefetchingStreamKeys([]);
    }
  };

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
    setEfWarmupTrimMin(0);
    setIsEfLapSelectorOpen(false);
    setCustomEfLapIndices([]);
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
    if (stravaToken && !isDemoActivityId(activity.id)) {
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
      setEfWarmupTrimMin(detailsRecord.calibration.efWarmupTrimMin ?? activity?.efWarmupTrimMin ?? 0);
      setCustomEfLapIndices(detailsRecord.calibration.customEfLapIndices ?? activity?.customEfLapIndices ?? []);
    } else {
      setManualTssInput('');
      setSelectedTssModel('auto');
      setEfWarmupTrimMin(activity?.efWarmupTrimMin ?? 0);
      setCustomEfLapIndices(activity?.customEfLapIndices ?? []);
    }
  }, [detailsRecord, activity?.id]);

  // Automatically persist calculated EF & Decoupling + badge and locked TSS snapshot if not yet stored on the record
  useEffect(() => {
    if (!activity || !detailsRecord) return;
    const existingCalib = detailsRecord.calibration || {};
    const hasSavedEf = Boolean(existingCalib.customEfBadgeLabel || activity.efBadgeLabel);
    const hasLockedTss =
      (typeof existingCalib.lockedTss === 'number' && existingCalib.lockedTss >= 0) ||
      (typeof activity.lockedTss === 'number' && activity.lockedTss >= 0);

    if (hasSavedEf && hasLockedTss) return;

    const efComputed = !hasSavedEf
      ? computeActivityEfAndDecoupling(activity, detailsRecord)
      : null;
    const snapshot = createActivityThresholdSnapshot(
      athleteProfile,
      existingCalib.thresholdSnapshot ?? activity.thresholdSnapshot
    );
    const tssComputed = !hasLockedTss
      ? calculateActivityTSS(activity, detailsRecord, athleteProfile, { forceRecalculate: true })
      : null;

    if (!efComputed && !tssComputed) return;

    let cancelled = false;
    void saveActivityCalibration(activity.id, {
      ...existingCalib,
      thresholdSnapshot: snapshot,
      ...(tssComputed
        ? {
            lockedTss: tssComputed.tss,
            lockedTssType: tssComputed.type,
            lockedTssDescription: tssComputed.description,
          }
        : {}),
      ...(efComputed
        ? {
            efValue: Number(efComputed.overallEf.toFixed(2)),
            decouplingPct:
              efComputed.decouplingPct !== null ? Number(efComputed.decouplingPct.toFixed(1)) : null,
            customEfBadgeLabel: efComputed.badgeLabel || undefined,
          }
        : {}),
    }).then((updated) => {
      if (!cancelled) {
        setDetailsRecord(updated);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activity?.id, Boolean(detailsRecord?.streams), Boolean(detailsRecord?.activity?.laps)]);

  const handleSaveEfConfig = async (
    nextMode: 0 | 10 | 15 | 'custom',
    nextIndices?: number[],
    nextEfOverride?: {
      overallEf: number;
      decouplingPct: number | null;
      badgeLabel: string | null;
    } | null
  ) => {
    setEfWarmupTrimMin(nextMode);
    if (nextIndices !== undefined) {
      setCustomEfLapIndices(nextIndices);
    }
    if (!activity) return;
    try {
      const existingCalib = detailsRecord?.calibration || {};
      const resolvedIndices = nextIndices !== undefined ? nextIndices : customEfLapIndices;
      const computedEf =
        nextEfOverride !== undefined
          ? nextEfOverride
          : computeActivityEfAndDecoupling(
              activity,
              detailsRecord || undefined,
              nextMode,
              resolvedIndices
            );
      const updatedRecord = await saveActivityCalibration(activity.id, {
        ...existingCalib,
        efWarmupTrimMin: nextMode,
        customEfLapIndices: resolvedIndices,
        efValue: computedEf ? Number(computedEf.overallEf.toFixed(2)) : undefined,
        decouplingPct:
          computedEf && computedEf.decouplingPct !== null
            ? Number(computedEf.decouplingPct.toFixed(1))
            : null,
        customEfBadgeLabel: computedEf?.badgeLabel || undefined,
      });
      setDetailsRecord(updatedRecord);
    } catch (err) {
      console.error('Failed to save EF lap configuration:', err);
    }
  };

  const handleSaveTssConfig = async () => {
    if (!activity) return;
    setIsSavingTss(true);
    setTssSaveSuccess(false);

    try {
      const existingCalib = detailsRecord?.calibration || {};
      const numTss = manualTssInput.trim() !== '' ? Number(manualTssInput) : undefined;
      const thresholdSnapshot = createActivityThresholdSnapshot(
        athleteProfile,
        existingCalib.thresholdSnapshot ?? activity.thresholdSnapshot
      );
      const draftCalib = {
        ...existingCalib,
        thresholdSnapshot,
        manualTss: numTss !== undefined && !isNaN(numTss) ? Math.max(0, Math.round(numTss)) : undefined,
        preferredTssModel: selectedTssModel,
      };
      const recalcTss = calculateActivityTSS(
        activity,
        {
          id: detailsRecord?.id || String(activity.id),
          activity: detailsRecord?.activity || (activity as unknown as Record<string, unknown>),
          streams: detailsRecord?.streams,
          calibration: draftCalib,
        },
        athleteProfile,
        { forceRecalculate: true }
      );
      const updatedCalib = {
        ...draftCalib,
        lockedTss: recalcTss?.tss,
        lockedTssType: recalcTss?.type,
        lockedTssDescription: recalcTss?.description,
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
      const thresholdSnapshot = createActivityThresholdSnapshot(
        athleteProfile,
        existingCalib.thresholdSnapshot ?? activity.thresholdSnapshot
      );
      existingCalib.thresholdSnapshot = thresholdSnapshot;
      const recalcTss = calculateActivityTSS(
        activity,
        {
          id: detailsRecord?.id || String(activity.id),
          activity: detailsRecord?.activity || (activity as unknown as Record<string, unknown>),
          streams: detailsRecord?.streams,
          calibration: existingCalib,
        },
        athleteProfile,
        { forceRecalculate: true }
      );
      existingCalib.lockedTss = recalcTss?.tss;
      existingCalib.lockedTssType = recalcTss?.type;
      existingCalib.lockedTssDescription = recalcTss?.description;

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
      setIsStreamFetcherOpen(false);
      setStreamFetchFeedback(null);
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

        // Automatically detect and repair any cadence stream that has a repeating lap-slice sawtooth artifact
        // or legacy noisy treadmill demo cadence
        if (cached?.streams) {
          const cadData = (cached.streams as any)?.cadence?.data as number[] | undefined;
          const isTreadmillAct =
            Boolean(currentAct.trainer) || /treadmill|indoor run/i.test(currentAct.name || '');
          const hasLegacyDemoJump =
            isDemoActivityId(activityId) &&
            isTreadmillAct &&
            Array.isArray(cadData) &&
            cadData.length > 10 &&
            Math.max(...cadData) - Math.min(...cadData) >= 5;

          if (hasRepeatingStreamArtifact(cadData) || hasLegacyDemoJump) {
            const repairedRes = await fetchSpecificStravaActivityStreams({
              accessToken: stravaToken,
              activity: currentAct,
              existingRecord: cached,
              streamKeys: ['cadence'],
            });
            cached = repairedRes.record;
          }
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
  const hasCalibration = hasActualActivityCalibration(detailsRecord?.calibration);
  const isIgnored = Boolean(detailsRecord?.calibration?.isIgnoredFromTrainingStatus);
  const efBadgeLabel = !isIgnored
    ? getActivityEfBadgeLabel(activity, detailsRecord || undefined)
    : null;

  const durationMoving =
    detailsRecord?.calibration?.calibratedMovingTimeSec ??
    (detailsRecord?.activity?.moving_time as number) ??
    activity.moving_time ??
    0;
  const rawElapsed = (detailsRecord?.activity?.elapsed_time as number) ?? activity.elapsed_time ?? 0;
  const durationElapsed =
    detailsRecord?.calibration?.calibratedMovingTimeSec &&
    detailsRecord.calibration.calibratedMovingTimeSec < rawElapsed
      ? detailsRecord.calibration.calibratedMovingTimeSec
      : rawElapsed;
  const effectiveDistanceM =
    detailsRecord?.calibration?.calibratedDistanceM ??
    (detailsRecord?.activity?.distance as number) ??
    activity.distance ??
    0;
  const effectiveActivity: StravaActivity = {
    ...activity,
    distance: effectiveDistanceM,
    moving_time: durationMoving,
    elapsed_time: durationElapsed,
  };
  const metrics = formatSportMetrics(effectiveActivity, detailsRecord || undefined);
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
  const tssResult = calculateActivityTSS(
    activity,
    effectiveDetailsRecordForTss,
    athleteProfile,
    isEditingTss ? { forceRecalculate: true } : undefined
  );
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
            <div className="min-w-0 flex-1 min-h-11 flex flex-col justify-between gap-0.5">
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
                  href={`https://www.strava.com/activities/${String(activity.id).replace(/^demo-/, '')}`}
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

            {/* Selected EF & Decoupling Laps Green Badge */}
            {!isIgnored && efBadgeLabel && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-black font-mono normal-case tracking-tight">
                <span>{efBadgeLabel}</span>
              </span>
            )}

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
              <span>Fix Data</span>
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
              {classification.category === 'Swim' && swimPace?.avgStrokeRateSpm ? (
                <span className="text-[10px] text-sky-400 font-mono">
                  {swimPace.avgStrokeRateSpm} spm{swimPace.totalStrokes ? ` · ${swimPace.totalStrokes} strokes` : ''}
                </span>
              ) : isBikeOrTurbo && (outdoorMaxSpeedKph || activity.max_speed) ? (
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

          {/* Aerobic Efficiency Factor (EF) & First/Second-Half Decoupling (Pa:Hr / Pw:Hr) */}
          {(() => {
            const actCategory =
              classification.category === 'Run'
                ? 'run'
                : classification.category === 'Bike'
                ? 'bike'
                : 'other';
            if (actCategory !== 'run' && actCategory !== 'bike') return null;

            const hrStream = streams?.heartrate?.data as number[] | undefined;
            const velStream = streams?.velocity_smooth?.data as number[] | undefined;
            const wattsStream = streams?.watts?.data as number[] | undefined;
            const timeStream = streams?.time?.data as number[] | undefined;

            const formatMetersPerMinToPace = (mPerMin: number) => {
              if (!mPerMin || mPerMin <= 0) return '—';
              const secPerKm = Math.round((1000 / mPerMin) * 60);
              const mins = Math.floor(secPerKm / 60);
              const secs = secPerKm % 60;
              return `${mins}:${secs.toString().padStart(2, '0')}/km`;
            };

            // Build candidate laps for Custom Lap Selection
            interface EfCandidateLap {
              lapIndex: number;
              name: string;
              movingTimeSec: number;
              distanceM: number;
              speedMPerMin: number;
              paceFormatted: string;
              avgWatts: number;
              avgHr: number;
              startSec: number;
              endSec: number;
              isWorkLap: boolean;
            }

            const candidateLaps: EfCandidateLap[] = [];
            const rawActLaps = (detailsRecord?.activity?.laps as any[]) || (activity as any)?.laps;
            const calibRunSecs = detailsRecord?.calibration?.calibratedRunSections;

            const sliceStreamAvgHr = (startS: number, endS: number, fallbackHr?: number): number => {
              if (Array.isArray(hrStream) && hrStream.length > 0) {
                let sIdx = Math.max(0, Math.floor(startS));
                let eIdx = Math.min(hrStream.length - 1, Math.ceil(endS));
                if (Array.isArray(timeStream) && timeStream.length === hrStream.length) {
                  const t0 = timeStream[0] || 0;
                  const foundS = timeStream.findIndex((t) => t - t0 >= startS);
                  const foundE = timeStream.findIndex((t) => t - t0 >= endS);
                  if (foundS >= 0) sIdx = foundS;
                  if (foundE >= sIdx) eIdx = foundE;
                  else eIdx = hrStream.length - 1;
                }
                const slice = hrStream.slice(sIdx, eIdx + 1).filter((h) => Number.isFinite(h) && h > 60);
                if (slice.length > 0) {
                  return Math.round(slice.reduce((a, b) => a + b, 0) / slice.length);
                }
              }
              return fallbackHr && fallbackHr > 60
                ? Math.round(fallbackHr)
                : Math.round(Number(activity.average_heartrate || 0));
            };

            const hasRealCalibRunSecs =
              actCategory === 'run' &&
              Array.isArray(calibRunSecs) &&
              calibRunSecs.length > 1 &&
              !calibRunSecs.every((s) => String(s.id || '').startsWith('split-1km-'));
            const areRawActLapsAutoSplits =
              Array.isArray(rawActLaps) &&
              rawActLaps.length > 0 &&
              rawActLaps.every((l: any) => Boolean(l?.isAutoGeneratedSplit));
            const hasRealRawActLaps =
              Array.isArray(rawActLaps) &&
              !areRawActLapsAutoSplits &&
              (rawActLaps.length > 1 || (rawActLaps.length >= 1 && Boolean(detailsRecord?.lapsRefetchedManually)));

            if (hasRealCalibRunSecs && calibRunSecs) {
              let cumSec = 0;
              const speeds = calibRunSecs.map((s) => s.speedKph || 0).filter((v) => v > 0);
              const maxSpd = speeds.length > 0 ? Math.max(...speeds) : 12;
              calibRunSecs.forEach((sec, idx) => {
                const durSec = Math.max(1, Math.round(sec.durationSec || 60));
                const startS = cumSec;
                const endS = cumSec + durSec;
                cumSec = endS;
                const spdKph = sec.speedKph || 0;
                const distM = Math.round((spdKph / 3.6) * durSec);
                const mPerMin = (spdKph * 1000) / 60;
                const lapHr = sliceStreamAvgHr(startS, endS);
                const isWork = spdKph >= maxSpd * 0.85 && idx > 0;
                candidateLaps.push({
                  lapIndex: idx + 1,
                  name: sec.name || `Lap ${idx + 1}`,
                  movingTimeSec: durSec,
                  distanceM: distM,
                  speedMPerMin: mPerMin,
                  paceFormatted: formatMetersPerMinToPace(mPerMin),
                  avgWatts: 0,
                  avgHr: lapHr,
                  startSec: startS,
                  endSec: endS,
                  isWorkLap: isWork,
                });
              });
            } else if (hasRealRawActLaps && Array.isArray(rawActLaps)) {
              let cumSec = 0;
              const vals = rawActLaps.map((l: any) =>
                actCategory === 'run'
                  ? Number(l.average_speed || 0) * 60
                  : Number(l.average_watts || 0)
              );
              const maxVal = vals.length > 0 ? Math.max(...vals) : 0;
              rawActLaps.forEach((lap: any, idx: number) => {
                const durSec = Math.max(1, Math.round(lap.moving_time || lap.elapsed_time || 60));
                const startS = cumSec;
                const endS = cumSec + durSec;
                cumSec = endS;
                const distM = Math.round(lap.distance || 0);
                const mPerMin =
                  durSec > 0 && distM > 0
                    ? distM / (durSec / 60)
                    : Number(lap.average_speed || 0) * 60;
                const w = Math.round(Number(lap.average_watts || 0));
                const lapHr = sliceStreamAvgHr(startS, endS, Number(lap.average_heartrate || 0));
                const metricVal = actCategory === 'run' ? mPerMin : w;
                const isWork = maxVal > 0 ? metricVal >= maxVal * 0.82 && idx > 0 : idx > 0 && idx < rawActLaps.length - 1;
                candidateLaps.push({
                  lapIndex: lap.lap_index || idx + 1,
                  name: lap.name || `Lap ${idx + 1}`,
                  movingTimeSec: durSec,
                  distanceM: distM,
                  speedMPerMin: mPerMin,
                  paceFormatted: formatMetersPerMinToPace(mPerMin),
                  avgWatts: w,
                  avgHr: lapHr,
                  startSec: startS,
                  endSec: endS,
                  isWorkLap: isWork,
                });
              });
            } else if (!detailsRecord?.lapsRefetchedManually && actCategory === 'run' && runDetails && runDetails.splits.length > 1) {
              let cumSec = 0;
              runDetails.splits.forEach((s, idx) => {
                const durSec = Math.max(1, Math.round(s.movingTimeSec || 60));
                const startS = cumSec;
                const endS = cumSec + durSec;
                cumSec = endS;
                const distM = Math.round(Number(s.distanceKm || 1) * 1000);
                const mPerMin = s.paceSecPerKm && s.paceSecPerKm > 0 ? 1000 / (s.paceSecPerKm / 60) : distM / (durSec / 60);
                const lapHr = s.avgHr && s.avgHr > 60 ? Math.round(s.avgHr) : sliceStreamAvgHr(startS, endS);
                candidateLaps.push({
                  lapIndex: s.splitIndex || idx + 1,
                  name: `Km ${s.splitIndex || idx + 1}`,
                  movingTimeSec: durSec,
                  distanceM: distM,
                  speedMPerMin: mPerMin,
                  paceFormatted: s.paceFormatted || formatMetersPerMinToPace(mPerMin),
                  avgWatts: 0,
                  avgHr: lapHr,
                  startSec: startS,
                  endSec: endS,
                  isWorkLap: idx > 0 && idx < runDetails.splits.length - 1,
                });
              });
            } else if (actCategory === 'bike' && bikeDetails && bikeDetails.laps.length > 1) {
              let cumSec = 0;
              bikeDetails.laps.forEach((l, idx) => {
                const durSec = Math.max(1, Math.round(l.movingTimeSec || 60));
                const startS = cumSec;
                const endS = cumSec + durSec;
                cumSec = endS;
                const distM = Math.round(Number(l.distanceKm || 1) * 1000);
                const w = Math.round(Number(l.avgWatts || effectiveAvgWatts || 0));
                const lapHr = l.avgHr && l.avgHr > 60 ? Math.round(l.avgHr) : sliceStreamAvgHr(startS, endS);
                candidateLaps.push({
                  lapIndex: l.lapIndex || idx + 1,
                  name: l.name || `Lap ${l.lapIndex || idx + 1}`,
                  movingTimeSec: durSec,
                  distanceM: distM,
                  speedMPerMin: 0,
                  paceFormatted: '',
                  avgWatts: w,
                  avgHr: lapHr,
                  startSec: startS,
                  endSec: endS,
                  isWorkLap: idx > 0 && idx < bikeDetails.laps.length - 1,
                });
              });
            }

            const activeCustomIndices =
              customEfLapIndices.length > 0
                ? customEfLapIndices
                : candidateLaps.map((l) => l.lapIndex);

            const computeCustomLapsEf = (indices: number[]) => {
              const chosen = candidateLaps.filter(
                (l) =>
                  indices.includes(l.lapIndex) &&
                  l.movingTimeSec > 0 &&
                  l.avgHr > 60 &&
                  (actCategory === 'run' ? l.speedMPerMin > 0 : l.avgWatts > 0)
              );
              if (chosen.length === 0) return null;

              const totalSec = chosen.reduce((acc, l) => acc + l.movingTimeSec, 0);
              if (totalSec <= 0) return null;

              const halfSec = totalSec / 2;
              let h1WeightedVal = 0;
              let h1WeightedHr = 0;
              let h1Sec = 0;
              let h2WeightedVal = 0;
              let h2WeightedHr = 0;
              let h2Sec = 0;

              let accSec = 0;
              for (const lap of chosen) {
                const val = actCategory === 'run' ? lap.speedMPerMin : lap.avgWatts;
                const start = accSec;
                const end = accSec + lap.movingTimeSec;
                accSec = end;

                if (end <= halfSec) {
                  h1WeightedVal += val * lap.movingTimeSec;
                  h1WeightedHr += lap.avgHr * lap.movingTimeSec;
                  h1Sec += lap.movingTimeSec;
                } else if (start >= halfSec) {
                  h2WeightedVal += val * lap.movingTimeSec;
                  h2WeightedHr += lap.avgHr * lap.movingTimeSec;
                  h2Sec += lap.movingTimeSec;
                } else {
                  const s1 = halfSec - start;
                  const s2 = end - halfSec;
                  h1WeightedVal += val * s1;
                  h1WeightedHr += lap.avgHr * s1;
                  h1Sec += s1;
                  h2WeightedVal += val * s2;
                  h2WeightedHr += lap.avgHr * s2;
                  h2Sec += s2;
                }
              }

              const fVal = h1Sec > 0 ? h1WeightedVal / h1Sec : 0;
              const fHr = h1Sec > 0 ? h1WeightedHr / h1Sec : 0;
              const sVal = h2Sec > 0 ? h2WeightedVal / h2Sec : 0;
              const sHr = h2Sec > 0 ? h2WeightedHr / h2Sec : 0;
              const totalVal = (h1WeightedVal + h2WeightedVal) / totalSec;
              const totalHr = (h1WeightedHr + h2WeightedHr) / totalSec;
              const cEf = totalHr > 0 ? totalVal / totalHr : 0;
              const cEf1 = fHr > 0 ? fVal / fHr : cEf;
              const cEf2 = sHr > 0 ? sVal / sHr : cEf;
              const cDecoupling = cEf1 > 0 ? ((cEf1 - cEf2) / cEf1) * 100 : null;

              return {
                chosenCount: chosen.length,
                firstHalfSpeedOrWatts: fVal,
                firstHalfHr: fHr,
                secondHalfSpeedOrWatts: sVal,
                secondHalfHr: sHr,
                overallEf: cEf,
                ef1: cEf1,
                ef2: cEf2,
                decouplingPct: cDecoupling,
              };
            };

            let firstHalfSpeedOrWatts = 0;
            let secondHalfSpeedOrWatts = 0;
            let firstHalfHr = 0;
            let secondHalfHr = 0;
            let hasHalfSplitComparison = false;
            let sourceLabel = 'Splits';
            let customEfResult: ReturnType<typeof computeCustomLapsEf> = null;

            if (efWarmupTrimMin === 'custom' && candidateLaps.length > 0) {
              customEfResult = computeCustomLapsEf(activeCustomIndices);
              if (customEfResult) {
                firstHalfSpeedOrWatts = customEfResult.firstHalfSpeedOrWatts;
                firstHalfHr = customEfResult.firstHalfHr;
                secondHalfSpeedOrWatts = customEfResult.secondHalfSpeedOrWatts;
                secondHalfHr = customEfResult.secondHalfHr;
                hasHalfSplitComparison = firstHalfHr > 0 && secondHalfHr > 0;
                sourceLabel = `Custom (${customEfResult.chosenCount}/${candidateLaps.length} Laps)`;
              }
            } else {
              const numericTrimMin = typeof efWarmupTrimMin === 'number' ? efWarmupTrimMin : 0;
              if (actCategory === 'run' && Array.isArray(hrStream) && Array.isArray(velStream)) {
                const len = Math.min(hrStream.length, velStream.length);
                if (len >= 120) {
                  const endTrim = Math.floor(len * 0.05);
                  let startIdx = Math.floor(len * 0.05);
                  if (numericTrimMin > 0) {
                    const targetSec = numericTrimMin * 60;
                    if (Array.isArray(timeStream) && timeStream.length >= len) {
                      const t0 = timeStream[0] || 0;
                      const foundIdx = timeStream.findIndex((t) => t - t0 >= targetSec);
                      startIdx = foundIdx > 0 ? foundIdx : Math.min(len - 60, targetSec);
                    } else {
                      startIdx = Math.min(len - 60, targetSec);
                    }
                  }
                  const validPairs: { v: number; hr: number }[] = [];
                  for (let i = startIdx; i < len - endTrim; i++) {
                    const v = velStream[i];
                    const h = hrStream[i];
                    if (v > 1.2 && h > 85) {
                      validPairs.push({ v: v * 60, hr: h }); // m/min
                    }
                  }
                  if (validPairs.length >= 60) {
                    const mid = Math.floor(validPairs.length / 2);
                    const h1 = validPairs.slice(0, mid);
                    const h2 = validPairs.slice(mid);
                    firstHalfSpeedOrWatts = h1.reduce((acc, p) => acc + p.v, 0) / h1.length;
                    firstHalfHr = h1.reduce((acc, p) => acc + p.hr, 0) / h1.length;
                    secondHalfSpeedOrWatts = h2.reduce((acc, p) => acc + p.v, 0) / h2.length;
                    secondHalfHr = h2.reduce((acc, p) => acc + p.hr, 0) / h2.length;
                    hasHalfSplitComparison = firstHalfHr > 0 && secondHalfHr > 0;
                    sourceLabel =
                      numericTrimMin > 0
                        ? `Streams (Excl. ${numericTrimMin}m Warmup)`
                        : '1-sec Streams (Middle 90%)';
                  }
                }
              } else if (actCategory === 'bike' && Array.isArray(hrStream) && Array.isArray(wattsStream)) {
                const len = Math.min(hrStream.length, wattsStream.length);
                if (len >= 120) {
                  const endTrim = Math.floor(len * 0.05);
                  let startIdx = Math.floor(len * 0.05);
                  if (numericTrimMin > 0) {
                    const targetSec = numericTrimMin * 60;
                    if (Array.isArray(timeStream) && timeStream.length >= len) {
                      const t0 = timeStream[0] || 0;
                      const foundIdx = timeStream.findIndex((t) => t - t0 >= targetSec);
                      startIdx = foundIdx > 0 ? foundIdx : Math.min(len - 60, targetSec);
                    } else {
                      startIdx = Math.min(len - 60, targetSec);
                    }
                  }
                  const validPairs: { w: number; hr: number }[] = [];
                  for (let i = startIdx; i < len - endTrim; i++) {
                    const w = wattsStream[i];
                    const h = hrStream[i];
                    if (w > 20 && h > 80) {
                      validPairs.push({ w, hr: h });
                    }
                  }
                  if (validPairs.length >= 60) {
                    const mid = Math.floor(validPairs.length / 2);
                    const h1 = validPairs.slice(0, mid);
                    const h2 = validPairs.slice(mid);
                    firstHalfSpeedOrWatts = h1.reduce((acc, p) => acc + p.w, 0) / h1.length;
                    firstHalfHr = h1.reduce((acc, p) => acc + p.hr, 0) / h1.length;
                    secondHalfSpeedOrWatts = h2.reduce((acc, p) => acc + p.w, 0) / h2.length;
                    secondHalfHr = h2.reduce((acc, p) => acc + p.hr, 0) / h2.length;
                    hasHalfSplitComparison = firstHalfHr > 0 && secondHalfHr > 0;
                    sourceLabel =
                      numericTrimMin > 0
                        ? `Streams (Excl. ${numericTrimMin}m Warmup)`
                        : '1-sec Streams (Middle 90%)';
                  }
                }
              }

              // Fallback to Run splits if stream arrays weren't available
              if (!hasHalfSplitComparison && actCategory === 'run' && runDetails && runDetails.splits.length >= 2) {
                const allValidSplits = runDetails.splits.filter(
                  (s) => (s.paceSecPerKm ?? 0) > 0 && s.avgHr && s.avgHr > 85 && Number(s.distanceKm || 0) >= 0.4
                );
                let validSplits = allValidSplits;
                if (numericTrimMin > 0 && allValidSplits.length > 2) {
                  let accSec = 0;
                  const targetSec = numericTrimMin * 60;
                  const trimmed = allValidSplits.filter((s) => {
                    accSec += s.movingTimeSec || s.paceSecPerKm || 300;
                    return accSec > targetSec;
                  });
                  if (trimmed.length >= 2) validSplits = trimmed;
                }
                if (validSplits.length >= 2) {
                  const mid = Math.floor(validSplits.length / 2);
                  const h1 = validSplits.slice(0, mid);
                  const h2 = validSplits.slice(mid);
                  firstHalfSpeedOrWatts =
                    h1.reduce((acc, s) => acc + 1000 / ((s.paceSecPerKm || 300) / 60), 0) / h1.length;
                  firstHalfHr = h1.reduce((acc, s) => acc + (s.avgHr || 0), 0) / h1.length;
                  secondHalfSpeedOrWatts =
                    h2.reduce((acc, s) => acc + 1000 / ((s.paceSecPerKm || 300) / 60), 0) / h2.length;
                  secondHalfHr = h2.reduce((acc, s) => acc + (s.avgHr || 0), 0) / h2.length;
                  hasHalfSplitComparison = firstHalfHr > 0 && secondHalfHr > 0;
                  sourceLabel =
                    numericTrimMin > 0
                      ? `${validSplits.length} Splits (Excl. ${numericTrimMin}m Warmup)`
                      : `${validSplits.length} Splits`;
                }
              }
            }

            const avgHr = Number(activity.average_heartrate || 0);
            const overallSpeedMetersPerMin =
              actCategory === 'run' && durationMoving > 0 && effectiveDistanceM > 0
                ? effectiveDistanceM / (durationMoving / 60)
                : 0;
            const overallWatts =
              actCategory === 'bike'
                ? Number(normalizedPower || effectiveAvgWatts || activity.weighted_average_watts || activity.average_watts || 0)
                : 0;

            const overallEf = customEfResult
              ? customEfResult.overallEf
              : hasHalfSplitComparison && firstHalfHr + secondHalfHr > 0
              ? (firstHalfSpeedOrWatts + secondHalfSpeedOrWatts) / (firstHalfHr + secondHalfHr)
              : avgHr > 80
              ? actCategory === 'run'
                ? overallSpeedMetersPerMin > 0
                  ? overallSpeedMetersPerMin / avgHr
                  : 0
                : overallWatts > 0
                ? overallWatts / avgHr
                : 0
              : 0;

            if (overallEf <= 0 && !hasHalfSplitComparison && candidateLaps.length === 0) return null;

            const ef1 = customEfResult
              ? customEfResult.ef1
              : hasHalfSplitComparison
              ? firstHalfSpeedOrWatts / firstHalfHr
              : overallEf;
            const ef2 = customEfResult
              ? customEfResult.ef2
              : hasHalfSplitComparison
              ? secondHalfSpeedOrWatts / secondHalfHr
              : overallEf;
            // Positive decoupling % means efficiency dropped in the second half (HR rose relative to pace/power)
            const decouplingPct = customEfResult
              ? customEfResult.decouplingPct
              : hasHalfSplitComparison && ef1 > 0
              ? ((ef1 - ef2) / ef1) * 100
              : null;

            const isCoupled = decouplingPct !== null && decouplingPct <= 3.5;
            const isModerateDrift = decouplingPct !== null && decouplingPct > 3.5 && decouplingPct <= 5.0;

            return (
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <div>
                      <h4 className="text-xs font-black text-white uppercase tracking-wider">
                        Aerobic Efficiency (EF) &amp; Decoupling (<span className="normal-case">{actCategory === 'run' ? 'Pa:HR' : 'Pw:HR'}</span>)
                      </h4>
                      <span className="text-[11px] text-slate-400">
                        {actCategory === 'run'
                          ? 'Speed-to-Heart-Rate ratio (m/min/bpm) & 1st vs. 2nd half cardiac drift'
                          : 'Power-to-Heart-Rate ratio (W/bpm) & 1st vs. 2nd half cardiac drift'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="inline-flex items-center rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-[10px]">
                      {(
                        [
                          { min: 0 as const, label: 'Mid 90%' },
                          { min: 10 as const, label: '-10m Warmup' },
                          { min: 15 as const, label: '-15m Warmup' },
                        ]
                      ).map((opt) => (
                        <button
                          key={opt.min}
                          type="button"
                          onClick={() => handleSaveEfConfig(opt.min)}
                          className={`px-1.5 py-0.5 rounded-md font-bold transition-colors cursor-pointer ${
                            efWarmupTrimMin === opt.min
                              ? 'bg-[#FE9A00] text-slate-950'
                              : 'text-slate-400 hover:text-white'
                          }`}
                          title={
                            opt.min === 0
                              ? 'Default: trims first 5% and last 5% of recording'
                              : `Excludes first ${opt.min} minutes of warmup so 1st Half vs 2nd Half compares the main set`
                          }
                        >
                          {opt.label}
                        </button>
                      ))}
                      {candidateLaps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const initialIndices =
                              customEfLapIndices.length === 0
                                ? candidateLaps.map((l) => l.lapIndex)
                                : customEfLapIndices;
                            setCustomEfLapIndices(initialIndices);
                            setEfWarmupTrimMin('custom');
                            setIsEfLapSelectorOpen(true);
                          }}
                          className={`px-1.5 py-0.5 rounded-md font-bold transition-colors cursor-pointer ${
                            efWarmupTrimMin === 'custom'
                              ? 'bg-[#FE9A00] text-slate-950'
                              : 'text-slate-400 hover:text-white'
                          }`}
                          title="Manually select which laps to include in the Aerobic Efficiency & Decoupling calculation"
                        >
                          Custom
                        </button>
                      )}
                    </div>
                    <span
                      onClick={() => {
                        if (candidateLaps.length > 1) {
                          if (customEfLapIndices.length === 0) {
                            setCustomEfLapIndices(candidateLaps.map((l) => l.lapIndex));
                          }
                          setEfWarmupTrimMin('custom');
                          setIsEfLapSelectorOpen(true);
                        }
                      }}
                      className={`text-[10px] font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-md ${
                        candidateLaps.length > 1 ? 'cursor-pointer hover:border-amber-500/40 hover:text-amber-300' : ''
                      }`}
                      title={candidateLaps.length > 1 ? 'Click to customize included laps' : undefined}
                    >
                      {sourceLabel}
                    </span>
                    {decouplingPct !== null && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                          isCoupled
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : isModerateDrift
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                        }`}
                      >
                        {isCoupled
                          ? 'Strong Durability (≤3.5%)'
                          : isModerateDrift
                          ? 'Moderate Drift (3.5–5%)'
                          : 'High Cardiac Drift (>5%)'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Efficiency Factor (EF)
                    </div>
                    <div className="text-base font-black font-mono text-emerald-400 mt-0.5">
                      {overallEf.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {actCategory === 'run' ? 'm/min per bpm' : 'Watts per bpm'}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <span className="normal-case">{actCategory === 'run' ? 'Pa:HR' : 'Pw:HR'}</span> Decoupling
                    </div>
                    <div
                      className={`text-base font-black font-mono mt-0.5 ${
                        decouplingPct === null
                          ? 'text-slate-400'
                          : decouplingPct <= 3.5
                          ? 'text-emerald-400'
                          : decouplingPct <= 5.0
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {decouplingPct !== null
                        ? `${decouplingPct > 0 ? '+' : ''}${decouplingPct.toFixed(1)}%`
                        : '—'}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {decouplingPct !== null
                        ? decouplingPct <= 0
                          ? 'Negative split efficiency'
                          : '2nd-half efficiency drift'
                        : 'Requires split HR'}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      1st Half Effort
                    </div>
                    <div className="text-xs font-bold font-mono text-white mt-1">
                      {hasHalfSplitComparison
                        ? actCategory === 'run'
                          ? `${formatMetersPerMinToPace(firstHalfSpeedOrWatts)} @ ${Math.round(firstHalfHr)} bpm`
                          : `${Math.round(firstHalfSpeedOrWatts)}W @ ${Math.round(firstHalfHr)} bpm`
                        : avgHr > 0
                        ? `Avg ${Math.round(avgHr)} bpm`
                        : '—'}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      EF₁: {ef1 > 0 ? ef1.toFixed(2) : '—'}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      2nd Half Effort
                    </div>
                    <div className="text-xs font-bold font-mono text-white mt-1">
                      {hasHalfSplitComparison
                        ? actCategory === 'run'
                          ? `${formatMetersPerMinToPace(secondHalfSpeedOrWatts)} @ ${Math.round(secondHalfHr)} bpm`
                          : `${Math.round(secondHalfSpeedOrWatts)}W @ ${Math.round(secondHalfHr)} bpm`
                        : '—'}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      EF₂: {ef2 > 0 ? ef2.toFixed(2) : '—'}
                    </div>
                  </div>
                </div>

                {/* Custom Lap Selection Modal / Page */}
                {isEfLapSelectorOpen && candidateLaps.length > 0 && (
                  <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
                    <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
                      {/* Header */}
                      <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/80 shrink-0">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                            <TrendingUp className="w-4 h-4 text-emerald-400" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm sm:text-base font-black text-white leading-tight">
                              Select Laps for Aerobic Efficiency &amp; Decoupling
                            </h3>
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              Checked laps are split 50/50 by time into 1st Half Effort and 2nd Half Effort
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsEfLapSelectorOpen(false)}
                          className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      {/* Quick Presets & Live Calculation Preview */}
                      <div className="p-3.5 sm:px-5 bg-slate-950/60 border-b border-slate-800 space-y-3 shrink-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-slate-300">
                            Quick Select ({activeCustomIndices.length} of {candidateLaps.length} laps):
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setCustomEfLapIndices(candidateLaps.map((l) => l.lapIndex))}
                              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold cursor-pointer border border-slate-700"
                            >
                              Select All
                            </button>
                            {candidateLaps.length > 2 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setCustomEfLapIndices(
                                    candidateLaps.slice(1, candidateLaps.length - 1).map((l) => l.lapIndex)
                                  )
                                }
                                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] font-bold cursor-pointer border border-slate-700"
                              >
                                Excl. 1st &amp; Last
                              </button>
                            )}
                            {candidateLaps.some((l) => l.isWorkLap) && (
                              <button
                                type="button"
                                onClick={() =>
                                  setCustomEfLapIndices(
                                    candidateLaps.filter((l) => l.isWorkLap).map((l) => l.lapIndex)
                                  )
                                }
                                className="px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-[10px] font-bold cursor-pointer border border-emerald-500/30"
                              >
                                Work Laps Only
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setCustomEfLapIndices([])}
                              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 text-[10px] font-bold cursor-pointer border border-slate-700"
                            >
                              Clear
                            </button>
                          </div>
                        </div>

                        {/* Live Preview Row */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                            <span className="text-[9px] uppercase font-bold text-slate-400 block">Selected EF</span>
                            <span className="text-sm font-black font-mono text-emerald-400">
                              {customEfResult ? customEfResult.overallEf.toFixed(2) : '—'}
                            </span>
                          </div>
                          <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                            <span className="text-[9px] uppercase font-bold text-slate-400 block">Decoupling</span>
                            <span className="text-sm font-black font-mono text-amber-400">
                              {customEfResult && customEfResult.decouplingPct !== null
                                ? `${customEfResult.decouplingPct > 0 ? '+' : ''}${customEfResult.decouplingPct.toFixed(1)}%`
                                : '—'}
                            </span>
                          </div>
                          <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                            <span className="text-[9px] uppercase font-bold text-slate-400 block">1st Half Effort</span>
                            <span className="text-[11px] font-bold font-mono text-white">
                              {customEfResult
                                ? actCategory === 'run'
                                  ? `${formatMetersPerMinToPace(customEfResult.firstHalfSpeedOrWatts)} @ ${Math.round(customEfResult.firstHalfHr)}bpm`
                                  : `${Math.round(customEfResult.firstHalfSpeedOrWatts)}W @ ${Math.round(customEfResult.firstHalfHr)}bpm`
                                : '—'}
                            </span>
                          </div>
                          <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                            <span className="text-[9px] uppercase font-bold text-slate-400 block">2nd Half Effort</span>
                            <span className="text-[11px] font-bold font-mono text-white">
                              {customEfResult
                                ? actCategory === 'run'
                                  ? `${formatMetersPerMinToPace(customEfResult.secondHalfSpeedOrWatts)} @ ${Math.round(customEfResult.secondHalfHr)}bpm`
                                  : `${Math.round(customEfResult.secondHalfSpeedOrWatts)}W @ ${Math.round(customEfResult.secondHalfHr)}bpm`
                                : '—'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Scrollable Laps Table */}
                      <div className="overflow-y-auto flex-1 divide-y divide-slate-800/70">
                        {candidateLaps.map((lap) => {
                          const isChecked = activeCustomIndices.includes(lap.lapIndex);
                          const lapEf =
                            lap.avgHr > 60
                              ? actCategory === 'run'
                                ? lap.speedMPerMin / lap.avgHr
                                : lap.avgWatts / lap.avgHr
                              : 0;
                          return (
                            <label
                              key={lap.lapIndex}
                              className={`px-4 py-2.5 flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors ${
                                isChecked
                                  ? 'bg-emerald-950/20 hover:bg-emerald-950/30 text-white'
                                  : 'bg-slate-900/40 hover:bg-slate-800/40 text-slate-400 opacity-65'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    setCustomEfLapIndices((prev) => {
                                      const base = prev.length > 0 ? prev : candidateLaps.map((l) => l.lapIndex);
                                      return base.includes(lap.lapIndex)
                                        ? base.filter((i) => i !== lap.lapIndex)
                                        : [...base, lap.lapIndex].sort((a, b) => a - b);
                                    });
                                  }}
                                  className="w-4 h-4 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-950 cursor-pointer shrink-0"
                                />
                                <span className="font-mono font-bold text-white w-14 shrink-0">
                                  {lap.name}
                                </span>
                                <span className="font-mono text-slate-300">
                                  {formatDuration(lap.movingTimeSec)}
                                </span>
                                <span className="font-mono text-slate-400 text-[11px]">
                                  {(lap.distanceM / 1000).toFixed(2)} km
                                </span>
                              </div>

                              <div className="flex items-center gap-3 font-mono shrink-0">
                                <span className="font-bold text-amber-300">
                                  {actCategory === 'run' ? lap.paceFormatted : `${lap.avgWatts} W`}
                                </span>
                                <span className="text-rose-400 w-16 text-right">
                                  {lap.avgHr > 0 ? `${lap.avgHr} bpm` : '—'}
                                </span>
                                <span className="text-emerald-400 font-bold w-14 text-right">
                                  EF {lapEf > 0 ? lapEf.toFixed(2) : '—'}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>

                      {/* Footer */}
                      <div className="p-3.5 sm:px-5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3 shrink-0">
                        <span className="text-xs text-slate-400 font-mono">
                          {activeCustomIndices.length} lap{activeCustomIndices.length === 1 ? '' : 's'} included
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const selectedRes = computeCustomLapsEf(activeCustomIndices);
                            const badgeLabel = selectedRes
                              ? formatEfBadgeLabel(
                                  selectedRes.overallEf,
                                  selectedRes.decouplingPct,
                                  actCategory === 'bike'
                                )
                              : null;
                            handleSaveEfConfig(
                              'custom',
                              activeCustomIndices,
                              selectedRes
                                ? {
                                    overallEf: selectedRes.overallEf,
                                    decouplingPct: selectedRes.decouplingPct,
                                    badgeLabel,
                                  }
                                : null
                            );
                            setIsEfLapSelectorOpen(false);
                          }}
                          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer transition-all shadow-md"
                        >
                          Apply Selected Laps
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

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
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="text-xs font-bold text-sky-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Waves className="w-3.5 h-3.5 text-sky-400" />
                  <span>
                    {swimPace.isAutoCreatedSplits
                      ? 'Splits (Auto-Created)'
                      : `Moving Laps (${swimPace.laps.length} Laps)`}
                  </span>
                </h4>
                <div className="flex items-center gap-2 text-xs font-mono font-bold">
                  <span className="text-sky-400">Avg {swimPace.pacePer100mFormatted}</span>
                  {swimPace.avgStrokeRateSpm ? (
                    <span className="text-slate-300 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-[10px]">
                      {swimPace.avgStrokeRateSpm} spm
                    </span>
                  ) : null}
                  {swimPace.avgSwolf ? (
                    <span className="text-emerald-300 bg-emerald-950/40 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[10px]">
                      SWOLF {swimPace.avgSwolf}
                    </span>
                  ) : null}
                </div>
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
                          {isRestLap
                            ? `Rest ${lap.lapIndex}`
                            : swimPace.isAutoCreatedSplits
                              ? `Split ${lap.lapIndex}`
                              : `Lap ${lap.lapIndex}`}
                        </span>
                        {!isRestLap && <span>{lap.distanceM}m</span>}
                      </div>
                      <div className="flex items-center justify-between font-mono font-bold text-white mt-1">
                        <span>{formatDuration(lap.movingTimeSec)}</span>
                        {!isRestLap && (
                          <span className="text-sky-300">{lap.pacePer100mFormatted}</span>
                        )}
                      </div>
                      {(lap.strokeRateSpm || lap.avgHr || lap.swolf) ? (
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-1 pt-1 border-t border-slate-800/60">
                          <span>
                            {!isRestLap && lap.strokeRateSpm
                              ? `${lap.strokeRateSpm} spm${lap.totalStrokes ? ` (${lap.totalStrokes} str)` : ''}`
                              : isRestLap
                              ? 'Rest'
                              : ''}
                          </span>
                          <span className="flex items-center gap-1.5">
                            {!isRestLap && lap.swolf ? (
                              <span className="text-emerald-400/90">SW {lap.swolf}</span>
                            ) : null}
                            {lap.avgHr ? (
                              <span className="text-rose-400">{lap.avgHr} bpm</span>
                            ) : null}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Running Splits Breakdown */}
          {classification.category === 'Run' && runDetails && (() => {
            const isTreadmill =
              classification.subType === 'Treadmill Run' ||
              Boolean(activity.trainer) ||
              /treadmill|indoor run/i.test(currentActivityName || activity.name || '') ||
              Boolean(detailsRecord?.calibration?.calibratedRunSections?.length);
            const effectiveSplitsMode = isTreadmill && splitsDisplayMode === 'gap' ? 'pace' : splitsDisplayMode;

            return (
              <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3 overflow-hidden">
                <div className="flex items-center justify-start flex-wrap gap-2.5">
                  {/* Title */}
                  <div className="flex items-center gap-2 mr-0.5">
                    <div className="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                      <Footprints className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-rose-300 uppercase tracking-wider">
                        {runDetails.isAutoCreatedSplits
                          ? 'Splits (Auto-Created)'
                          : `Splits (${runDetails.splits.length} Splits)`}
                      </h4>
                      <span className="text-[10px] text-slate-400">
                        {runDetails.consistencySummary}
                      </span>
                    </div>
                  </div>

                  {/* Left-Aligned Summary Metric Badges (Avg Pace, Cadence, GAP) */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-mono font-bold text-rose-400 flex items-center gap-1">
                      <Gauge className="w-3 h-3 text-rose-400/80 inline" />
                      <span>Avg {runDetails.avgPaceFormatted}</span>
                    </div>
                    {runDetails.avgCadence && (
                      <div className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300 flex items-center gap-1">
                        <Activity className="w-3 h-3 text-slate-400 inline" />
                        <span>{runDetails.avgCadence} spm</span>
                      </div>
                    )}
                    {!isTreadmill && runDetails.gradeAdjustedPaceFormatted && (
                      <div className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-mono text-emerald-400 flex items-center gap-1" title="Grade Adjusted Pace">
                        <TrendingUp className="w-3 h-3 text-emerald-400 inline" />
                        <span>GAP {runDetails.gradeAdjustedPaceFormatted}</span>
                      </div>
                    )}
                  </div>

                  {/* Left-Aligned View Mode Toggle Tabs (Pace, GAP, HR, Cards) */}
                  <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-[11px] font-bold max-w-full overflow-x-auto scrollbar-none">
                    <button
                      type="button"
                      onClick={() => setSplitsDisplayMode('pace')}
                      className={`px-2 sm:px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 ${
                        effectiveSplitsMode === 'pace'
                          ? 'bg-amber-500 text-slate-950 font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                      title="Display 1km splits as Pace bar chart"
                    >
                      <Gauge className="w-3 h-3 shrink-0" />
                      <span>Pace</span>
                    </button>
                    {!isTreadmill && (
                      <button
                        type="button"
                        onClick={() => setSplitsDisplayMode('gap')}
                        className={`px-2 sm:px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 ${
                          effectiveSplitsMode === 'gap'
                            ? 'bg-emerald-500 text-slate-950 font-black'
                            : 'text-slate-400 hover:text-white'
                        }`}
                        title="Display 1km splits as Grade Adjusted Pace (GAP) bar chart"
                      >
                        <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span className="sm:hidden">GAP</span>
                        <span className="hidden sm:inline">GAP Bar Chart</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSplitsDisplayMode('hr')}
                      className={`px-2 sm:px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 ${
                        effectiveSplitsMode === 'hr'
                          ? 'bg-amber-500 text-slate-950 font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                      title="Display 1km splits as Heart rate bar chart"
                    >
                      <Heart className="w-3 h-3 text-rose-400 shrink-0" />
                      <span>Heart rate</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSplitsDisplayMode('cadence')}
                      className={`px-2 sm:px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 ${
                        effectiveSplitsMode === 'cadence'
                          ? 'bg-sky-500 text-slate-950 font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                      title="Display 1km splits as Cadence (spm) bar chart"
                    >
                      <Activity className="w-3 h-3 text-sky-400 shrink-0" />
                      <span>Cadence</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSplitsDisplayMode('cards')}
                      className={`px-2 sm:px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 ${
                        effectiveSplitsMode === 'cards'
                          ? 'bg-amber-500 text-slate-950 font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                      title="Display 1km splits as Cards"
                    >
                      <LayoutGrid className="w-3 h-3 shrink-0" />
                      <span>Cards</span>
                    </button>
                  </div>
                </div>

                {/* Pace Bar Chart View (Extra box removed, starts right out splits box) */}
                {effectiveSplitsMode === 'pace' && (() => {
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
                              title={`Km ${split.splitIndex}: ${split.paceFormatted} • ${split.distanceKm} km in ${formatDuration(split.movingTimeSec)}${split.avgHr ? ` • ${split.avgHr} bpm` : ''}${split.avgCadence ? ` • ${split.avgCadence} spm` : ''}${split.elevationDiffM ? ` • ${split.elevationDiffM > 0 ? '+' : ''}${split.elevationDiffM}m elev` : ''}`}
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
                                    {split.avgHr} bpm
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-mono text-slate-500 mt-0.5 leading-none">
                                    {split.distanceKm}k
                                  </span>
                                )}
                                {split.avgCadence ? (
                                  <span className="text-[9px] font-mono text-sky-400 mt-0.5 leading-none">
                                    {split.avgCadence} spm
                                  </span>
                                ) : null}
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
              {!isTreadmill && effectiveSplitsMode === 'gap' && (() => {
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
                              title={`Km ${split.splitIndex}: GAP ${split.gapFormatted || split.paceFormatted} (Actual ${split.paceFormatted}) • ${split.distanceKm} km in ${formatDuration(split.movingTimeSec)}${split.elevationDiffM !== undefined ? ` • ${split.elevationDiffM > 0 ? `+${split.elevationDiffM}m climb` : `${split.elevationDiffM}m descent`}` : ''}${split.avgHr ? ` • ${split.avgHr} bpm` : ''}${split.avgCadence ? ` • ${split.avgCadence} spm` : ''}`}
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
                                {split.avgCadence ? (
                                  <span className="text-[9px] font-mono text-sky-400 mt-0.5 leading-none">
                                    {split.avgCadence} spm
                                  </span>
                                ) : null}
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
              {effectiveSplitsMode === 'hr' && (() => {
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
                                title={`Km ${split.splitIndex}: ${hr ? `${hr} bpm` : 'No HR'} • Pace ${split.paceFormatted}${split.avgCadence ? ` • ${split.avgCadence} spm` : ''} • ${split.distanceKm} km in ${formatDuration(split.movingTimeSec)}`}
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
                                  {split.avgCadence ? (
                                    <span className="text-[9px] font-mono text-sky-400 mt-0.5 leading-none">
                                      {split.avgCadence} spm
                                    </span>
                                  ) : null}
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

              {/* Cadence Bar Chart View */}
              {effectiveSplitsMode === 'cadence' && (() => {
                const cadValues = runDetails.splits
                  .map((s) => s.avgCadence)
                  .filter((c): c is number => typeof c === 'number' && c > 0);
                const hasCadence = cadValues.length > 0;
                const minCad = hasCadence ? Math.min(...cadValues) : 150;
                const maxCad = hasCadence ? Math.max(...cadValues) : 190;
                const cadRange = Math.max(1, maxCad - minCad);

                return (
                  <div className="space-y-1.5 pt-1 border-t border-slate-800/60">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pb-0.5">
                      <span className="font-semibold text-slate-300 flex items-center gap-1">
                        <Activity className="w-3 h-3 text-sky-400" />
                        Kilometer Average Cadence (spm)
                      </span>
                      {hasCadence && (
                        <span className="font-mono text-sky-400 text-[10px]">
                          Avg {Math.round(cadValues.reduce((a, b) => a + b, 0) / cadValues.length)} spm
                        </span>
                      )}
                    </div>

                    {!hasCadence ? (
                      <div className="py-8 text-center text-xs text-slate-400">
                        No cadence stream recorded for these 1km splits.
                      </div>
                    ) : (
                      <div className="w-full overflow-x-auto pb-1 scrollbar-thin -mx-3.5 px-3.5">
                        <div className="flex items-end gap-1.5 min-w-fit h-44 pt-4 px-0.5">
                          {runDetails.splits.map((split) => {
                            const cad = split.avgCadence || 0;
                            const heightPct = cadRange === 0 || !cad ? 65 : 30 + ((cad - minCad) / cadRange) * 60;
                            return (
                              <div
                                key={split.splitIndex}
                                className="flex flex-col items-center justify-end h-full min-w-[50px] sm:min-w-[56px] flex-1 group"
                                title={`Km ${split.splitIndex}: ${cad ? `${cad} spm` : 'No Cadence'} • Pace ${split.paceFormatted}${split.avgHr ? ` • ${split.avgHr} bpm` : ''} • ${split.distanceKm} km in ${formatDuration(split.movingTimeSec)}`}
                              >
                                <span className="text-[10px] font-mono font-bold text-sky-300 whitespace-nowrap mb-1">
                                  {cad ? `${cad}` : '--'}
                                </span>

                                <div
                                  style={{ height: `${Math.max(15, Math.min(100, heightPct))}%` }}
                                  className="w-full rounded-t-lg transition-all group-hover:brightness-125 bg-gradient-to-t from-sky-600 to-sky-400 border-t border-x border-sky-300/40 shadow-xs shadow-sky-500/20"
                                />

                                <div className="mt-1.5 flex flex-col items-center text-center">
                                  <span className="text-[11px] font-bold text-slate-200 font-mono leading-none">
                                    Km {split.splitIndex}
                                  </span>
                                  <span className="text-[9px] font-mono text-slate-400 mt-0.5 leading-none">
                                    {split.paceFormatted.replace('/km', '')}
                                  </span>
                                  {split.avgHr ? (
                                    <span className="text-[9px] font-mono text-rose-400 mt-0.5 leading-none">
                                      {split.avgHr} bpm
                                    </span>
                                  ) : null}
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
              {effectiveSplitsMode === 'cards' && (
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
                      {(split.avgCadence || split.elevationDiffM !== undefined) && (
                        <div className="text-[10px] font-mono text-slate-400 mt-1 flex items-center justify-between pt-1 border-t border-slate-800/60">
                          <span>
                            {split.avgCadence ? (
                              <span className="text-sky-400 font-semibold">{split.avgCadence} spm</span>
                            ) : (
                              <span>{formatDuration(split.movingTimeSec)}</span>
                            )}
                          </span>
                          <span>
                            {split.elevationDiffM !== undefined ? (
                              <span className={split.elevationDiffM > 0 ? 'text-amber-300' : 'text-slate-400'}>
                                {split.elevationDiffM > 0 ? `+${split.elevationDiffM}m` : `${split.elevationDiffM}m`}
                              </span>
                            ) : (
                              <span>{formatDuration(split.movingTimeSec)}</span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

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
                      {bikeDetails.isAutoCreatedSplits
                        ? 'Splits (Auto-Created)'
                        : `Splits (${bikeDetails.laps.length} Laps)`}
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
                    <div className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-mono text-sky-400 font-semibold">
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
                      <span className="flex items-center gap-1.5">
                        {lap.avgWatts ? (
                          <span className="text-amber-300 text-[11px]">{lap.avgWatts}W</span>
                        ) : null}
                        {lap.avgHr ? (
                          <span className="text-rose-400 text-[11px] flex items-center gap-0.5">
                            <Heart className="w-2.5 h-2.5 inline" /> {lap.avgHr}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 mt-1 flex items-center justify-between pt-1 border-t border-slate-800/60">
                      <span>{formatDuration(lap.movingTimeSec)}</span>
                      <span className="flex items-center gap-1.5">
                        {lap.avgCadence ? <span className="text-sky-400 font-semibold">{lap.avgCadence} rpm</span> : null}
                        {lap.elevationGainM ? <span className="text-amber-300/90">+{lap.elevationGainM}m</span> : null}
                      </span>
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
            activity={effectiveActivity}
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
                  Data Streams
                </h4>
              </div>

              {loadingDetails ? (
                <span className="text-[11px] text-amber-400 flex items-center gap-1 font-mono">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Fetching streams...
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsStreamFetcherOpen((prev) => !prev);
                    setStreamFetchFeedback(null);
                  }}
                  title="Click to inspect cached streams or re-fetch specific streams (e.g. Cadence) from the Strava API"
                  className={`text-[10px] font-mono px-2.5 py-1 rounded-full border transition-all cursor-pointer flex items-center gap-1.5 ${
                    isStreamFetcherOpen
                      ? 'text-slate-950 bg-emerald-400 border-emerald-300 font-bold shadow-xs'
                      : 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/25 hover:border-emerald-400/50'
                  }`}
                >
                  <span>{availableStreamsList.length} streams cached</span>
                  <ChevronDown
                    className={`w-3 h-3 transition-transform ${isStreamFetcherOpen ? 'rotate-180' : ''}`}
                  />
                </button>
              )}
            </div>

            {/* Interactive Specific Stream Re-fetch Box */}
            {isStreamFetcherOpen && (
              <div className="p-3 rounded-xl bg-slate-900/95 border border-emerald-500/30 space-y-2.5 animate-in fade-in duration-150">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-2 border-b border-slate-800">
                  <div>
                    <h5 className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Re-fetch Specific Streams from Strava API</span>
                    </h5>
                    <p className="text-[11px] text-slate-400">
                      Select individual telemetry streams (such as Cadence) to re-fetch from Strava without overwriting your calibrated distance or speed.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedStreamKeys(
                          STRAVA_STREAM_DEFINITIONS.filter((d) => {
                            if (classification.subType === 'Turbo Trainer' && (d.key === 'velocity_smooth' || d.key === 'altitude')) return false;
                            if (classification.category === 'Swim' && d.key === 'altitude') return false;
                            return true;
                          }).map((d) => d.key)
                        )
                      }
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold cursor-pointer border border-slate-700"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedStreamKeys([])}
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 text-[10px] font-bold cursor-pointer border border-slate-700"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto pr-0.5">
                  {STRAVA_STREAM_DEFINITIONS.filter((d) => {
                    if (classification.subType === 'Turbo Trainer' && (d.key === 'velocity_smooth' || d.key === 'altitude')) return false;
                    if (classification.category === 'Swim' && d.key === 'altitude') return false;
                    return true;
                  }).map((def) => {
                    const isLapsKey = def.key === 'laps';
                    const lapsArr = (detailsRecord?.activity as any)?.laps || (activity as any)?.laps;
                    const streamArr = streams?.[def.key]?.data;
                    const ptsCount = isLapsKey
                      ? Array.isArray(lapsArr)
                        ? lapsArr.length
                        : 0
                      : Array.isArray(streamArr)
                      ? streamArr.length
                      : 0;
                    const isCached = ptsCount > 0;
                    const isChecked = selectedStreamKeys.includes(def.key);
                    const isFetchingThis = refetchingStreamKeys.includes(def.key);

                    return (
                      <div
                        key={def.key}
                        className={`px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-2 text-xs transition-colors ${
                          isChecked
                            ? 'bg-emerald-950/30 border-emerald-500/40 text-white'
                            : 'bg-slate-950/70 border-slate-800/80 text-slate-300'
                        }`}
                      >
                        <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleStreamKeySelection(def.key)}
                            className="w-3.5 h-3.5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900 cursor-pointer shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold truncate">{def.label}</span>
                              <span className="text-[10px] font-mono text-slate-500">({def.unit})</span>
                            </div>
                            <span
                              className={`text-[10px] font-mono block ${
                                isCached ? 'text-emerald-400' : 'text-slate-500'
                              }`}
                            >
                              {isCached
                                ? `Cached • ${ptsCount.toLocaleString()} ${isLapsKey ? (ptsCount === 1 ? 'lap' : 'laps') : 'pts'}`
                                : 'Not cached'}
                            </span>
                          </div>
                        </label>

                        <button
                          type="button"
                          disabled={refetchingStreamKeys.length > 0}
                          onClick={() => handleRefetchSpecificStreams([def.key])}
                          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-emerald-300 font-bold text-[10px] cursor-pointer transition-colors border border-slate-700 hover:border-emerald-400 flex items-center gap-1 shrink-0 disabled:opacity-50"
                          title={`Re-fetch only ${def.label} (${def.key}) stream`}
                        >
                          <RefreshCw className={`w-2.5 h-2.5 ${isFetchingThis ? 'animate-spin' : ''}`} />
                          <span>Re-fetch</span>
                        </button>
                      </div>
                    );
                  })}
                </div>

                {streamFetchFeedback && (
                  <div
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] flex items-center gap-1.5 ${
                      streamFetchFeedback.type === 'success'
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                        : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    {streamFetchFeedback.type === 'success' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    )}
                    <span>{streamFetchFeedback.message}</span>
                  </div>
                )}

                <div className="pt-1 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-400 font-mono">
                    {selectedStreamKeys.length} stream{selectedStreamKeys.length === 1 ? '' : 's'} selected
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsStreamFetcherOpen(false)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      disabled={selectedStreamKeys.length === 0 || refetchingStreamKeys.length > 0}
                      onClick={() => handleRefetchSpecificStreams(selectedStreamKeys)}
                      className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black cursor-pointer transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
                    >
                      {refetchingStreamKeys.length > 0 ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Re-fetching...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Re-fetch Selected ({selectedStreamKeys.length})</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Interactive Stream Plot Component */}
            {streams ? (
              <StravaStreamPlot
                streams={streams}
                activity={effectiveActivity}
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
              activity={effectiveActivity}
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
