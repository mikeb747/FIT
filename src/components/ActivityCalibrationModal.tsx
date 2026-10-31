import React, { useState } from 'react';
import {
  X,
  Sliders,
  RotateCcw,
  Save,
  AlertTriangle,
  Waves,
  Heart,
  Zap,
  Clock,
  EyeOff,
  Check,
  CheckCircle2,
  Trash2,
  Plus,
  Download,
  Upload,
  ExternalLink,
  Loader2,
  Layers,
  Sparkles,
  Play,
} from 'lucide-react';
import type {
  StravaActivity,
  StravaActivityDetailsRecord,
  ActivityCalibration,
  CalibratedSwimLap,
  CalibratedRunSection,
} from '../utils/stravaActivities';
import {
  classifyActivity,
  saveActivityCalibration,
  clearActivityCalibration,
  updateStravaActivityRecord,
} from '../utils/stravaActivities';
import {
  formatSecondsToMinSec,
  parseMinSecToSeconds,
  calculateWorkKj,
} from '../types/athlete';
import {
  generateRunFitFile,
  downloadRunFitFile,
  uploadRunFitToStrava,
} from '../utils/runFitGenerator';

interface ActivityCalibrationModalProps {
  isOpen: boolean;
  activity: StravaActivity;
  detailsRecord: StravaActivityDetailsRecord | null;
  stravaToken?: string | null;
  onClose: () => void;
  onCalibrationSaved: (updatedRecord: StravaActivityDetailsRecord) => void;
}

// 7-Stage Treadmill Workout Template from user specification
const DEFAULT_7_SECTION_TEMPLATE: CalibratedRunSection[] = [
  { id: '1', name: 'Warm-up', durationSec: 8 * 60, speedKph: 11.0 },
  { id: '2', name: 'Recovery', durationSec: 2 * 60, speedKph: 6.0 },
  { id: '3', name: 'Main effort', durationSec: 20 * 60, speedKph: 16.1 },
  { id: '4', name: 'Progression 1', durationSec: 2.5 * 60, speedKph: 16.2 },
  { id: '5', name: 'Progression 2', durationSec: 2.5 * 60, speedKph: 16.3 },
  { id: '6', name: 'Progression 3', durationSec: 2.5 * 60, speedKph: 16.4 },
  { id: '7', name: 'Progression 4', durationSec: 2.5 * 60, speedKph: 16.5 },
];

function speedKphToPaceStr(speedKph: number): string {
  if (!speedKph || speedKph <= 0) return '-';
  const secPerKm = 3600 / speedKph;
  return formatSecondsToMinSec(secPerKm);
}

function paceStrToSpeedKph(paceStr: string): number {
  const sec = parseMinSecToSeconds(paceStr, 0);
  if (sec <= 0) return 0;
  return Number((3600 / sec).toFixed(2));
}

function parseDurationInput(raw: string, defaultSec: number): number {
  if (!raw || !raw.trim()) return defaultSec;
  const str = raw.trim();
  if (str.includes(':')) {
    return parseMinSecToSeconds(str, defaultSec);
  }
  const num = parseFloat(str);
  if (isNaN(num) || num <= 0) return defaultSec;
  // If user entered e.g. 2.5 or 8, interpret as decimal minutes
  return Math.round(num * 60);
}

export const ActivityCalibrationModal: React.FC<ActivityCalibrationModalProps> = ({
  isOpen,
  activity,
  detailsRecord,
  stravaToken,
  onClose,
  onCalibrationSaved,
}) => {
  const classification = classifyActivity(activity);
  const existingCalib = detailsRecord?.calibration;

  // Form State
  const [isIgnored, setIsIgnored] = useState<boolean>(
    existingCalib?.isIgnoredFromTrainingStatus ?? false
  );

  // Distance: stored in meters internally
  const originalDistanceM = activity.distance || 0;
  const isKm = classification.category !== 'Swim';
  const initialDistDisplay = existingCalib?.calibratedDistanceM !== undefined
    ? isKm
      ? (existingCalib.calibratedDistanceM / 1000).toFixed(2)
      : Math.round(existingCalib.calibratedDistanceM).toString()
    : isKm && originalDistanceM > 0
      ? (originalDistanceM / 1000).toFixed(2)
      : Math.round(originalDistanceM).toString();
  const [distanceInput, setDistanceInput] = useState<string>(initialDistDisplay);

  // Moving Time: in seconds internally
  const originalMovingSec = activity.moving_time || activity.elapsed_time || 0;
  const [movingTimeInput, setMovingTimeInput] = useState<string>(
    formatSecondsToMinSec(existingCalib?.calibratedMovingTimeSec ?? originalMovingSec)
  );

  // Heart Rate
  const originalMaxHr = activity.max_heartrate ? Math.round(activity.max_heartrate) : '';
  const [maxHrInput, setMaxHrInput] = useState<string>(
    existingCalib?.calibratedMaxHeartRate !== undefined
      ? String(existingCalib.calibratedMaxHeartRate)
      : String(originalMaxHr)
  );

  const originalAvgHr = activity.average_heartrate ? Math.round(activity.average_heartrate) : '';
  const [avgHrInput, setAvgHrInput] = useState<string>(
    existingCalib?.calibratedAvgHeartRate !== undefined
      ? String(existingCalib.calibratedAvgHeartRate)
      : String(originalAvgHr)
  );

  // Cycling Power
  const isBikeOrTurbo = classification.subType === 'Turbo Trainer' || classification.subType === 'Bike';
  const originalAvgWatts = activity.average_watts ? Math.round(activity.average_watts) : '';
  const [avgWattsInput, setAvgWattsInput] = useState<string>(
    existingCalib?.calibratedAvgWatts !== undefined
      ? String(existingCalib.calibratedAvgWatts)
      : String(originalAvgWatts)
  );

  const [npWattsInput, setNpWattsInput] = useState<string>(
    existingCalib?.calibratedNormalizedPower !== undefined
      ? String(existingCalib.calibratedNormalizedPower)
      : ''
  );

  // Swim Laps
  const rawLaps = (detailsRecord?.activity?.laps as any[]) || [];
  const initialLaps: CalibratedSwimLap[] = existingCalib?.calibratedLaps && existingCalib.calibratedLaps.length > 0
    ? existingCalib.calibratedLaps.map((lap) => ({
        ...lap,
        isRest: Boolean(lap.isRest || lap.distanceM <= 0),
      }))
    : rawLaps.map((lap, idx) => {
        const dist = Math.round(lap.distance || 0);
        const time = Math.round(lap.moving_time || lap.elapsed_time || 0);
        const isRest = dist <= 0;
        const paceSec = dist > 0 && time > 0 ? (time / dist) * 100 : 0;
        return {
          lapIndex: idx + 1,
          distanceM: dist,
          movingTimeSec: time,
          pacePer100mFormatted: isRest ? '' : formatSecondsToMinSec(paceSec) + '/100m',
          isIgnored: false,
          isRest,
        };
      });

  const [swimLaps, setSwimLaps] = useState<CalibratedSwimLap[]>(initialLaps);

  // Indoor Run Simulated Laps / Sections
  const isRun = classification.category === 'Run';
  const [runSections, setRunSections] = useState<CalibratedRunSection[]>(() => {
    if (existingCalib?.calibratedRunSections && existingCalib.calibratedRunSections.length > 0) {
      return existingCalib.calibratedRunSections;
    }
    return [];
  });

  const [notes, setNotes] = useState<string>(existingCalib?.calibrationNotes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  // Strava FIT Upload / Download State
  const [isUploadingToStrava, setIsUploadingToStrava] = useState(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState('');
  const [stravaUploadSuccess, setStravaUploadSuccess] = useState<{
    activityId?: number | string;
    uploadId: number | string;
  } | null>(null);
  const [stravaUploadError, setStravaUploadError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Real-time computed values
  const parsedDistM = isKm
    ? (parseFloat(distanceInput) || 0) * 1000
    : parseFloat(distanceInput) || 0;
  const parsedMovingSec = parseMinSecToSeconds(movingTimeInput, originalMovingSec);

  // Recorded Duration from stream timestamps or activity moving_time
  const streamTimeData = (detailsRecord?.streams as any)?.time?.data as number[] | undefined;
  const recordedDurationSec = streamTimeData && streamTimeData.length > 0
    ? streamTimeData[streamTimeData.length - 1] - streamTimeData[0]
    : originalMovingSec > 0
      ? originalMovingSec
      : 2400;

  // Run Section Calculations: Auto-extend the final section for time discrepancies
  const sumSectionSec = runSections.reduce((acc, s) => acc + (s.durationSec || 0), 0);
  const timeDiscrepancySec = runSections.length > 0 ? recordedDurationSec - sumSectionSec : 0;

  const computedRunSections = runSections.map((sec, idx) => {
    const isLast = idx === runSections.length - 1;
    // Rule: "To start with, if theres any slight time discrepancy, extend the final lap/section to match the exact time stream."
    const effectiveSec = isLast && timeDiscrepancySec > 0
      ? sec.durationSec + timeDiscrepancySec
      : sec.durationSec;
    const speedMps = (sec.speedKph || 0) / 3.6;
    const distanceM = speedMps * effectiveSec;
    return {
      ...sec,
      effectiveDurationSec: effectiveSec,
      distanceM,
      paceFormatted: speedKphToPaceStr(sec.speedKph),
    };
  });

  const totalSimulatedDistanceM = computedRunSections.reduce((acc, s) => acc + s.distanceM, 0);
  const totalSimulatedDurationSec = computedRunSections.reduce((acc, s) => acc + s.effectiveDurationSec, 0);
  const avgRunPaceSec = totalSimulatedDistanceM > 0
    ? totalSimulatedDurationSec / (totalSimulatedDistanceM / 1000)
    : 0;
  const avgRunPaceFormatted = avgRunPaceSec > 0 ? formatSecondsToMinSec(avgRunPaceSec) + '/km' : '-';
  const maxSimulatedSpeedKph = runSections.length > 0
    ? Math.max(...runSections.map((s) => s.speedKph || 0))
    : 0;

  // Swim Laps Recalculate
  const recalculateSwimTotals = (updatedLaps: CalibratedSwimLap[]) => {
    if (classification.category !== 'Swim') return;
    const activeLaps = updatedLaps.filter((l) => !l.isIgnored && !l.isRest && l.distanceM > 0);
    const sumDist = activeLaps.reduce((acc, l) => acc + l.distanceM, 0);
    const sumTime = activeLaps.reduce((acc, l) => acc + l.movingTimeSec, 0);

    setDistanceInput(sumDist > 0 ? sumDist.toString() : '0');
    setMovingTimeInput(formatSecondsToMinSec(sumTime));
  };

  // Work calculation preview for power
  const parsedWatts = parseFloat(avgWattsInput) || 0;
  const workPreview = isBikeOrTurbo && parsedWatts > 0
    ? calculateWorkKj(parsedWatts, parsedMovingSec)
    : null;

  // Run Section Handlers
  const handleLoad7SectionTemplate = () => {
    setRunSections(DEFAULT_7_SECTION_TEMPLATE);
    // Calculate total distance for the template with auto-extension
    const tempSum = DEFAULT_7_SECTION_TEMPLATE.reduce((acc, s) => acc + s.durationSec, 0);
    const disc = recordedDurationSec - tempSum;
    let dist = 0;
    DEFAULT_7_SECTION_TEMPLATE.forEach((s, idx) => {
      const isLast = idx === DEFAULT_7_SECTION_TEMPLATE.length - 1;
      const sec = isLast && disc > 0 ? s.durationSec + disc : s.durationSec;
      dist += (s.speedKph / 3.6) * sec;
    });
    setDistanceInput((dist / 1000).toFixed(3));
    setMovingTimeInput(formatSecondsToMinSec(Math.round(recordedDurationSec)));
  };

  const handleAddRunSection = () => {
    const nextIdx = runSections.length + 1;
    const lastSpeed = runSections.length > 0 ? runSections[runSections.length - 1].speedKph : 12.0;
    const newSection: CalibratedRunSection = {
      id: String(Date.now()),
      name: `Progression ${nextIdx}`,
      durationSec: 150, // 2m 30s
      speedKph: lastSpeed,
    };
    const updated = [...runSections, newSection];
    setRunSections(updated);
  };

  const handleRemoveRunSection = (index: number) => {
    const updated = runSections.filter((_, i) => i !== index);
    setRunSections(updated);
  };

  const handleUpdateRunSection = (
    index: number,
    field: keyof CalibratedRunSection,
    value: any
  ) => {
    const updated = runSections.map((sec, i) => {
      if (i !== index) return sec;
      return { ...sec, [field]: value };
    });
    setRunSections(updated);
  };

  // Helper: Build the simulated speed & distance streams and new laps array
  const buildSimulatedStreamsAndLaps = () => {
    const rawStreams = detailsRecord?.streams as Record<string, { data?: any[] }> | undefined;
    const originalTimeStream = rawStreams?.time?.data as number[] | undefined;

    // Use original timestamps, or synthesize 1-second intervals
    const timeStream = originalTimeStream && originalTimeStream.length > 0
      ? [...originalTimeStream]
      : Array.from({ length: Math.ceil(totalSimulatedDurationSec) + 1 }, (_, i) => i);

    const speedStream: number[] = [];
    const distanceStream: number[] = [];
    let cumDist = 0;

    // Cumulative boundaries for sections
    const boundaries: { endTime: number; speedMps: number; section: CalibratedRunSection }[] = [];
    let currentEnd = 0;
    computedRunSections.forEach((s) => {
      currentEnd += s.effectiveDurationSec;
      boundaries.push({
        endTime: currentEnd,
        speedMps: (s.speedKph || 0) / 3.6,
        section: s,
      });
    });

    for (let i = 0; i < timeStream.length; i++) {
      const t = timeStream[i];
      let activeSpeedMps = boundaries.length > 0 ? boundaries[0].speedMps : 0;
      for (const b of boundaries) {
        if (t <= b.endTime) {
          activeSpeedMps = b.speedMps;
          break;
        }
        activeSpeedMps = b.speedMps;
      }

      if (i > 0) {
        const dt = Math.max(0, timeStream[i] - timeStream[i - 1]);
        cumDist += activeSpeedMps * dt;
      }

      // Strava velocity_smooth is in m/s (e.g. 4.47 for 16.1 km/h)
      speedStream.push(Number(activeSpeedMps.toFixed(3)));
      distanceStream.push(Number(cumDist.toFixed(1)));
    }

    // Overwrite laps matching the calibrated sections
    let lapStartSec = 0;
    const newLaps = computedRunSections.map((s, idx) => {
      const lapEndSec = lapStartSec + s.effectiveDurationSec;
      const startIdx = timeStream.findIndex((t) => t >= lapStartSec);
      let endIdx = timeStream.findIndex((t) => t >= lapEndSec);
      if (endIdx === -1) endIdx = timeStream.length - 1;

      const lapObj = {
        id: Number(activity.id) * 100 + (idx + 1),
        resource_state: 2,
        name: s.name || `Lap ${idx + 1}`,
        activity: { id: activity.id },
        athlete: (activity as any).athlete || { id: 0 },
        elapsed_time: Math.round(s.effectiveDurationSec),
        moving_time: Math.round(s.effectiveDurationSec),
        start_date: activity.start_date,
        start_date_local: activity.start_date_local,
        distance: Math.round(s.distanceM * 10) / 10,
        start_index: Math.max(0, startIdx),
        end_index: Math.max(startIdx, endIdx),
        total_elevation_gain: 0,
        average_speed: Number(((s.speedKph || 0) / 3.6).toFixed(2)),
        max_speed: Number(((s.speedKph || 0) / 3.6).toFixed(2)),
        lap_index: idx + 1,
        split: idx + 1,
      };
      lapStartSec = lapEndSec;
      return lapObj;
    });

    return {
      timeStream,
      speedStream,
      distanceStream,
      newLaps,
      totalDistanceM: totalSimulatedDistanceM > 0 ? totalSimulatedDistanceM : cumDist,
    };
  };

  // Download Corrected FIT File
  const handleDownloadFit = () => {
    const sim = buildSimulatedStreamsAndLaps();
    const rawStreams = detailsRecord?.streams as Record<string, { data?: any[] }> | undefined;
    const hrData = rawStreams?.heartrate?.data as number[] | undefined;
    const cadenceData = rawStreams?.cadence?.data as number[] | undefined;

    const startTimestampMs = activity.start_date
      ? new Date(activity.start_date).getTime()
      : Date.now() - Math.round(recordedDurationSec) * 1000;

    const fitBytes = generateRunFitFile({
      activity,
      workoutName: `${activity.name} (Treadmill Calibrated)`,
      startTimestampMs,
      totalDurationSec: Math.round(recordedDurationSec),
      totalDistanceM: Math.round(sim.totalDistanceM),
      timeStream: sim.timeStream,
      speedStream: sim.speedStream,
      distanceStream: sim.distanceStream,
      heartrateStream: hrData,
      cadenceStream: cadenceData,
      sections: computedRunSections,
    });

    const safeFilename = `${activity.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_calibrated.fit`;
    downloadRunFitFile(fitBytes, safeFilename);
  };

  // Upload Corrected Run to Strava
  const handleUploadToStrava = async () => {
    if (!stravaToken) {
      alert('Strava access token is not available. Please connect or refresh your Strava account in Settings.');
      return;
    }

    setIsUploadingToStrava(true);
    setStravaUploadError(null);
    setStravaUploadSuccess(null);
    setUploadStatusMsg('Preparing corrected .FIT workout payload...');

    try {
      const sim = buildSimulatedStreamsAndLaps();
      const rawStreams = detailsRecord?.streams as Record<string, { data?: any[] }> | undefined;
      const hrData = rawStreams?.heartrate?.data as number[] | undefined;
      const cadenceData = rawStreams?.cadence?.data as number[] | undefined;

      const startTimestampMs = activity.start_date
        ? new Date(activity.start_date).getTime()
        : Date.now() - Math.round(recordedDurationSec) * 1000;

      const fitBytes = generateRunFitFile({
        activity,
        workoutName: `${activity.name} (Calibrated Treadmill)`,
        startTimestampMs,
        totalDurationSec: Math.round(recordedDurationSec),
        totalDistanceM: Math.round(sim.totalDistanceM),
        timeStream: sim.timeStream,
        speedStream: sim.speedStream,
        distanceStream: sim.distanceStream,
        heartrateStream: hrData,
        cadenceStream: cadenceData,
        sections: computedRunSections,
      });

      const res = await uploadRunFitToStrava(
        fitBytes,
        `${activity.name} (Calibrated Treadmill)`,
        stravaToken,
        `Calibrated treadmill run with ${computedRunSections.length} structured laps. Speed/distance simulated; HR & cadence preserved.`,
        (status: string) => setUploadStatusMsg(status)
      );

      if (res.success) {
        setStravaUploadSuccess({
          uploadId: res.uploadId ?? 'uploaded',
          activityId: res.activityId,
        });
      } else {
        setStravaUploadError(res.error || 'Failed to upload workout to Strava');
      }
    } catch (err: any) {
      setStravaUploadError(err.message || 'An error occurred while uploading to Strava');
    } finally {
      setIsUploadingToStrava(false);
    }
  };

  // Save Calibration & Rebuild Streams in Local DB
  const handleSave = async () => {
    setIsSaving(true);
    try {
      let finalDistM = parsedDistM;
      let finalMovingSec = parsedMovingSec;

      // If run sections are active, use simulated totals
      if (isRun && runSections.length > 0) {
        finalDistM = totalSimulatedDistanceM;
        finalMovingSec = Math.round(totalSimulatedDurationSec);
      }

      const calibrationPayload: ActivityCalibration = {
        isIgnoredFromTrainingStatus: isIgnored,
        calibratedDistanceM: finalDistM > 0 ? finalDistM : undefined,
        calibratedMovingTimeSec: finalMovingSec > 0 ? finalMovingSec : undefined,
        calibratedMaxHeartRate: maxHrInput ? parseInt(maxHrInput, 10) : undefined,
        calibratedAvgHeartRate: avgHrInput ? parseInt(avgHrInput, 10) : undefined,
        calibratedAvgWatts: isBikeOrTurbo && avgWattsInput ? parseInt(avgWattsInput, 10) : undefined,
        calibratedNormalizedPower: isBikeOrTurbo && npWattsInput ? parseInt(npWattsInput, 10) : undefined,
        calibratedLaps: classification.category === 'Swim' && swimLaps.length > 0 ? swimLaps : undefined,
        calibratedRunSections: isRun && runSections.length > 0 ? runSections : undefined,
        calibrationNotes: notes.trim() || undefined,
      };

      // 1. Save calibration metadata
      let updatedRecord = await saveActivityCalibration(activity.id, calibrationPayload);

      // 2. If run sections are defined, rebuild the local streams & overwrite laps so the UI & charts update instantly
      if (isRun && runSections.length > 0) {
        const sim = buildSimulatedStreamsAndLaps();
        updatedRecord = await updateStravaActivityRecord(activity.id, (record) => {
          const currentStreams = (record.streams || {}) as Record<string, any>;
          const currentActivity = (record.activity || {}) as Record<string, any>;

          return {
            ...record,
            activity: {
              ...currentActivity,
              distance: sim.totalDistanceM,
              moving_time: Math.round(totalSimulatedDurationSec),
              laps: sim.newLaps,
            },
            streams: {
              ...currentStreams,
              time: currentStreams.time || {
                data: sim.timeStream,
                series_type: 'time',
                original_size: sim.timeStream.length,
                resolution: 'high',
              },
              velocity_smooth: {
                data: sim.speedStream,
                series_type: 'distance',
                original_size: sim.speedStream.length,
                resolution: 'high',
              },
              distance: {
                data: sim.distanceStream,
                series_type: 'distance',
                original_size: sim.distanceStream.length,
                resolution: 'high',
              },
            },
          };
        });
      }

      onCalibrationSaved(updatedRecord);
      setSaveSuccessMsg(true);
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err) {
      console.error('[Calibration Save Error]', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToStrava = async () => {
    if (!window.confirm('Reset this activity to original Strava data and remove all custom calibrations?')) {
      return;
    }
    setIsSaving(true);
    try {
      const updated = await clearActivityCalibration(activity.id);
      onCalibrationSaved(updated);
      onClose();
    } catch (err) {
      console.error('[Calibration Reset Error]', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Sliders className="w-5 h-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-black text-white leading-tight">
                Fix & Calibrate Activity Data
              </h3>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                {activity.name} • {classification.subType}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            title="Close calibration"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Ignore Switch Card */}
          <div className={`p-4 rounded-2xl border transition-all ${
            isIgnored
              ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
              : 'bg-slate-950/60 border-slate-800 text-slate-300'
          }`}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isIgnored}
                onChange={(e) => setIsIgnored(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-700 text-rose-600 focus:ring-rose-500 bg-slate-900 cursor-pointer"
              />
              <div className="space-y-0.5">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <EyeOff className="w-3.5 h-3.5 text-rose-400" />
                  <span>Ignore Activity From Training Status / TSS Calculations</span>
                </span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Exclude this activity from your fitness graph, chronic training load (CTL), and fatigue score. Use this if your watch recorded while driving or sitting still.
                </p>
              </div>
            </label>
          </div>

          {/* Distance & Moving Time Overrides */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Distance & Duration Overrides</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Calibrated Distance ({isKm ? 'km' : 'meters'})
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step={isKm ? '0.01' : '1'}
                    value={distanceInput}
                    onChange={(e) => setDistanceInput(e.target.value)}
                    placeholder={isKm ? 'e.g. 5.25' : 'e.g. 1500'}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-sm focus:border-amber-400 focus:outline-none"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-mono">
                    {isKm ? 'km' : 'm'}
                  </span>
                </div>
                {originalDistanceM > 0 && (
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Strava raw: {isKm ? (originalDistanceM / 1000).toFixed(2) + ' km' : originalDistanceM + ' m'}
                  </span>
                )}
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Moving Time (mm:ss or hh:mm:ss)
                </label>
                <input
                  type="text"
                  value={movingTimeInput}
                  onChange={(e) => setMovingTimeInput(e.target.value)}
                  placeholder="e.g. 40:13"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-sm focus:border-amber-400 focus:outline-none"
                />
                {originalMovingSec > 0 && (
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Strava raw: {formatSecondsToMinSec(originalMovingSec)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Heart Rate Calibration */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5 text-rose-400" />
              <span>Heart Rate Spike & Cadence Filter</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Max Heart Rate (bpm)
                </label>
                <input
                  type="number"
                  value={maxHrInput}
                  onChange={(e) => setMaxHrInput(e.target.value)}
                  placeholder="e.g. 175"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-sm focus:border-rose-400 focus:outline-none"
                />
                {originalMaxHr ? (
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Strava raw: {originalMaxHr} bpm
                  </span>
                ) : null}
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Average Heart Rate (bpm)
                </label>
                <input
                  type="number"
                  value={avgHrInput}
                  onChange={(e) => setAvgHrInput(e.target.value)}
                  placeholder="e.g. 148"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-sm focus:border-rose-400 focus:outline-none"
                />
                {originalAvgHr ? (
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Strava raw: {originalAvgHr} bpm
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Cycling Power Calibration */}
          {isBikeOrTurbo && (
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Cycling Power & Energy Calibration</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    Average Power (Watts)
                  </label>
                  <input
                    type="number"
                    value={avgWattsInput}
                    onChange={(e) => setAvgWattsInput(e.target.value)}
                    placeholder="e.g. 210"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-sm focus:border-amber-400 focus:outline-none"
                  />
                  {originalAvgWatts ? (
                    <span className="text-[10px] text-slate-500 block mt-1">
                      Strava raw: {originalAvgWatts} W
                    </span>
                  ) : null}
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    Normalized Power (NP Watts)
                  </label>
                  <input
                    type="number"
                    value={npWattsInput}
                    onChange={(e) => setNpWattsInput(e.target.value)}
                    placeholder="e.g. 235"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-sm focus:border-amber-400 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Overrides 30s rolling 4th-power algorithm
                  </span>
                </div>
              </div>

              {workPreview && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
                  <span className="font-bold">Estimated Mechanical Work: </span>
                  <span className="font-mono">{workPreview.formattedKj}</span>
                  <span className="text-[11px] text-amber-300 block mt-0.5">
                    Formula: {parsedWatts}W × {(parsedMovingSec / 3600).toFixed(1)}h × 3.6 = {workPreview.formattedKj} (~{workPreview.kcal} kcal)
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Swim Lap Calibration */}
          {classification.category === 'Swim' && swimLaps.length > 0 && (
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-sky-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Waves className="w-3.5 h-3.5 text-sky-400" />
                  <span>Swim Lap Accuracy Calibration ({swimLaps.length} Laps)</span>
                </h4>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Watches frequently miss flip turns or register pauses incorrectly. Edit individual lap meters, moving time, or toggle &ldquo;Ignore&rdquo; to remove inaccurate laps from the overall pace.
              </p>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {swimLaps.map((lap, index) => {
                  const isRestLap = Boolean(lap.isRest || lap.distanceM <= 0);
                  return (
                    <div
                      key={lap.lapIndex}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 text-xs transition-colors ${
                        lap.isIgnored || isRestLap
                          ? 'bg-slate-950/40 border-slate-800/40 opacity-55'
                          : 'bg-slate-900/80 border-slate-800'
                      }`}
                    >
                      <span className={`font-mono font-bold w-14 shrink-0 ${isRestLap ? 'text-slate-500' : 'text-slate-400'}`}>
                        {isRestLap ? `Rest ${lap.lapIndex}` : `Lap ${lap.lapIndex}`}
                      </span>

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          step="25"
                          value={lap.distanceM}
                          disabled={lap.isIgnored}
                          onChange={(e) => {
                            const dist = Math.max(0, parseInt(e.target.value, 10) || 0);
                            const isRest = dist <= 0;
                            const updated = swimLaps.map((l, i) => {
                              if (i !== index) return l;
                              const paceSec = dist > 0 && l.movingTimeSec > 0 ? (l.movingTimeSec / dist) * 100 : 0;
                              return {
                                ...l,
                                distanceM: dist,
                                isRest,
                                pacePer100mFormatted: isRest ? '' : formatSecondsToMinSec(paceSec) + '/100m',
                              };
                            });
                            setSwimLaps(updated);
                            recalculateSwimTotals(updated);
                          }}
                          className="w-16 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-center disabled:opacity-40"
                        />
                        <span className="text-slate-500 text-[10px]">m</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={formatSecondsToMinSec(lap.movingTimeSec)}
                          disabled={lap.isIgnored}
                          onChange={(e) => {
                            const timeSec = parseMinSecToSeconds(e.target.value, 60);
                            const updated = swimLaps.map((l, i) => {
                              if (i !== index) return l;
                              const dist = l.distanceM || 0;
                              const isRest = Boolean(l.isRest || dist <= 0);
                              const paceSec = !isRest && dist > 0 ? (timeSec / dist) * 100 : 0;
                              return {
                                ...l,
                                movingTimeSec: timeSec,
                                pacePer100mFormatted: isRest ? '' : formatSecondsToMinSec(paceSec) + '/100m',
                              };
                            });
                            setSwimLaps(updated);
                            recalculateSwimTotals(updated);
                          }}
                          className="w-16 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-center disabled:opacity-40"
                        />
                        <span className="text-slate-500 text-[10px]">time</span>
                      </div>

                      <span className={`font-mono font-bold text-[11px] min-w-16 text-right ${isRestLap ? 'text-slate-500' : 'text-sky-300'}`}>
                        {lap.isIgnored ? 'Ignored' : isRestLap ? 'Rest' : lap.pacePer100mFormatted}
                      </span>

                      <button
                        type="button"
                        onClick={() => {
                          const updated = swimLaps.map((l, i) => {
                            if (i !== index) return l;
                            return { ...l, isIgnored: !l.isIgnored };
                          });
                          setSwimLaps(updated);
                          recalculateSwimTotals(updated);
                        }}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors ${
                          lap.isIgnored
                            ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            : 'bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 border border-rose-500/30'
                        }`}
                      >
                        {lap.isIgnored ? 'Restore' : 'Ignore'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* LAPS SECTION (INDOOR / TREADMILL RUN WORKOUT SIMULATOR)                    */}
          {/* Placed directly above the Calibration Reason section as requested         */}
          {/* ========================================================================= */}
          {isRun && (
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-emerald-500/30 space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30">
                    <Layers className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                      Laps & Simulated Speed/Pace Streams
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Indoor / Treadmill workout profiler. Preserves HR, cadence & timestamps.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleLoad7SectionTemplate}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-400 hover:text-emerald-300 text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1.5"
                    title="Load 7-segment template from workout profile (Warm-up, Recovery, Main effort, Progressions 1-4)"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Load 7-Stage Template</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAddRunSection}
                    className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-[11px] cursor-pointer transition-all flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Add Lap</span>
                  </button>

                  {runSections.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setRunSections([])}
                      className="px-2 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 text-[11px] font-bold cursor-pointer transition-all"
                      title="Clear laps"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Sections Table */}
              {runSections.length === 0 ? (
                <div className="text-center py-5 px-3 rounded-xl bg-slate-900/60 border border-dashed border-slate-800 space-y-2">
                  <Play className="w-6 h-6 text-slate-600 mx-auto" />
                  <p className="text-xs text-slate-400 font-medium">
                    No custom laps defined yet. Click &ldquo;Load 7-Stage Template&rdquo; or &ldquo;Add Lap&rdquo; to build your treadmill intervals.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  <div className="grid grid-cols-12 gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
                    <span className="col-span-3 sm:col-span-3">Segment</span>
                    <span className="col-span-3 sm:col-span-2">Duration</span>
                    <span className="col-span-3 sm:col-span-3">Speed (km/h)</span>
                    <span className="hidden sm:inline sm:col-span-2">Pace</span>
                    <span className="col-span-2 sm:col-span-1 text-right">Dist</span>
                    <span className="col-span-1 text-right"></span>
                  </div>

                  {runSections.map((sec, idx) => {
                    const computed = computedRunSections[idx];
                    const isLast = idx === runSections.length - 1;

                    return (
                      <div
                        key={sec.id || idx}
                        className={`p-2 rounded-xl border text-xs transition-colors flex flex-col sm:grid sm:grid-cols-12 gap-2 items-center ${
                          isLast && timeDiscrepancySec > 0
                            ? 'bg-emerald-950/20 border-emerald-500/40'
                            : 'bg-slate-900/90 border-slate-800'
                        }`}
                      >
                        {/* Segment Name */}
                        <div className="col-span-3 w-full sm:w-auto">
                          <input
                            type="text"
                            value={sec.name}
                            onChange={(e) => handleUpdateRunSection(idx, 'name', e.target.value)}
                            placeholder={`Lap ${idx + 1}`}
                            className="w-full px-2 py-1 bg-slate-950 border border-slate-700/80 rounded-lg text-white font-medium text-xs focus:border-emerald-400 focus:outline-none"
                          />
                        </div>

                        {/* Duration */}
                        <div className="col-span-3 sm:col-span-2 w-full sm:w-auto">
                          <div className="relative">
                            <input
                              type="text"
                              value={formatSecondsToMinSec(sec.durationSec)}
                              onChange={(e) => {
                                const parsedSec = parseDurationInput(e.target.value, sec.durationSec);
                                handleUpdateRunSection(idx, 'durationSec', parsedSec);
                              }}
                              className="w-full px-2 py-1 bg-slate-950 border border-slate-700/80 rounded-lg text-white font-mono text-xs text-center focus:border-emerald-400 focus:outline-none"
                            />
                            {isLast && timeDiscrepancySec > 0 && (
                              <span className="text-[9px] text-emerald-400 block text-center mt-0.5" title="Auto-extended to match exact recording duration">
                                +{timeDiscrepancySec.toFixed(1)}s ext
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Speed (km/h) */}
                        <div className="col-span-3 sm:col-span-3 w-full sm:w-auto flex items-center gap-1">
                          <input
                            type="number"
                            step="0.1"
                            min="1"
                            max="30"
                            value={sec.speedKph || ''}
                            onChange={(e) => {
                              const spd = parseFloat(e.target.value) || 0;
                              handleUpdateRunSection(idx, 'speedKph', spd);
                            }}
                            className="w-full px-2 py-1 bg-slate-950 border border-slate-700/80 rounded-lg text-white font-mono text-xs text-center focus:border-emerald-400 focus:outline-none"
                          />
                          <span className="text-[10px] text-slate-500 shrink-0 font-mono">kph</span>
                        </div>

                        {/* Pace (min/km, bi-directional) */}
                        <div className="hidden sm:inline sm:col-span-2 w-full text-center">
                          <input
                            type="text"
                            value={speedKphToPaceStr(sec.speedKph)}
                            onChange={(e) => {
                              const spd = paceStrToSpeedKph(e.target.value);
                              if (spd > 0) {
                                handleUpdateRunSection(idx, 'speedKph', spd);
                              }
                            }}
                            placeholder="m:ss"
                            className="w-full px-1.5 py-1 bg-slate-950/60 border border-slate-800 rounded-lg text-emerald-300 font-mono text-xs text-center focus:border-emerald-400 focus:outline-none"
                          />
                        </div>

                        {/* Distance for this segment */}
                        <div className="col-span-2 sm:col-span-1 text-right font-mono text-[11px] text-slate-300">
                          {((computed?.distanceM || 0) / 1000).toFixed(2)}km
                        </div>

                        {/* Delete action */}
                        <div className="col-span-1 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveRunSection(idx)}
                            className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer transition-colors"
                            title="Remove lap"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Time Discrepancy & Auto-extension Notice */}
              {runSections.length > 0 && timeDiscrepancySec > 0.05 && (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-200 flex items-start gap-2">
                  <Clock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-bold text-white">
                      Time Discrepancy Auto-Correction
                    </p>
                    <p className="text-[11px] text-emerald-300 leading-relaxed">
                      Specified laps add up to <span className="font-mono font-bold text-white">{formatSecondsToMinSec(sumSectionSec)}</span>, but original activity recording lasted <span className="font-mono font-bold text-white">{formatSecondsToMinSec(Math.round(recordedDurationSec))}</span>. Final lap &ldquo;{runSections[runSections.length - 1]?.name || 'Lap ' + runSections.length}&rdquo; was continued for the additional <span className="font-mono font-bold text-white">+{timeDiscrepancySec.toFixed(1)}s</span> at {runSections[runSections.length - 1]?.speedKph} km/h to match the recorded timestamps exactly.
                    </p>
                  </div>
                </div>
              )}

              {/* Result Summary Card (matching the green summary card from user specification) */}
              {runSections.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Calibrated Profile Result</span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      4.47 m/s speed stream = 16.1 km/h
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-medium">Corrected distance</span>
                      <span className="text-base sm:text-lg font-black font-mono text-emerald-400">
                        {(totalSimulatedDistanceM / 1000).toFixed(3)} km
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-medium">Average pace</span>
                      <span className="text-base sm:text-lg font-black font-mono text-white">
                        {avgRunPaceFormatted}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-medium">Target duration</span>
                      <span className="text-base sm:text-lg font-black font-mono text-white">
                        {formatSecondsToMinSec(Math.round(totalSimulatedDurationSec))}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-medium">Max speed</span>
                      <span className="text-base sm:text-lg font-black font-mono text-amber-400">
                        {maxSimulatedSpeedKph.toFixed(1)} km/h
                      </span>
                    </div>
                  </div>

                  {/* FIT Actions Bar */}
                  <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] text-slate-400">
                      Rebuilt speed stream, accumulated distance stream, and overwritten laps.
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDownloadFit}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer transition-all flex items-center gap-1.5 border border-slate-700 shadow-xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Corrected .FIT</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleUploadToStrava}
                        disabled={isUploadingToStrava}
                        className="px-3.5 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-black text-xs cursor-pointer transition-all flex items-center gap-1.5 shadow-md shadow-orange-600/20 disabled:opacity-50"
                      >
                        {isUploadingToStrava ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Uploading to Strava...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5" />
                            <span>Upload to Strava</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Upload Status / Success / Error feedback */}
                  {uploadStatusMsg && (
                    <div className="p-2 rounded-xl bg-slate-950/90 border border-slate-800 text-[11px] text-slate-300 flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400 shrink-0" />
                      <span>{uploadStatusMsg}</span>
                    </div>
                  )}

                  {stravaUploadSuccess && (
                    <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-200 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>
                          Successfully uploaded to Strava!
                          {stravaUploadSuccess.activityId ? ` (Activity #${stravaUploadSuccess.activityId})` : ''}
                        </span>
                      </div>
                      {stravaUploadSuccess.activityId && (
                        <a
                          href={`https://www.strava.com/activities/${stravaUploadSuccess.activityId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 rounded-lg bg-emerald-500 text-slate-950 font-black text-[10px] flex items-center gap-1 hover:bg-emerald-400 transition-colors"
                        >
                          <span>Open on Strava</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}

                  {stravaUploadError && (
                    <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{stravaUploadError}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* Calibration Reason / Notes (optional)                                     */}
          {/* ========================================================================= */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">
              Calibration Reason / Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Treadmill console showed 9.82 km; watch under-reported distance. Replaced with 7 structured treadmill speed stages."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:border-amber-400 focus:outline-none resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3 shrink-0">
          {existingCalib ? (
            <button
              type="button"
              onClick={handleResetToStrava}
              disabled={isSaving}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Original</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
          >
            {saveSuccessMsg ? (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Saved & Applied!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Calibration & Rebuild Streams</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
