import React, { useState, useMemo, useEffect } from 'react';
import { CompletedWorkout } from '../types/workout';
import { downloadFitFile, getFitFileName } from '../utils/fitGenerator';
import { uploadWorkoutToStrava, StravaUploadResult } from '../utils/stravaUpload';
import { getDefaultActivityName } from '../utils/activityName';
import { Download, UploadCloud, ExternalLink, X, Trophy, Clock, Calendar, AlertTriangle, ArrowLeft, Check, CheckCircle2, RefreshCw } from 'lucide-react';

interface WorkoutSummaryModalProps {
  isOpen: boolean;
  workout: CompletedWorkout | null;
  stravaAccessToken: string | null;
  onConnectStrava: () => void;
  onClose: () => void; // Takes user back to continue editing
  onSaveToHistory?: (updatedWorkout: CompletedWorkout) => void;
  onExitWorkout?: () => void; // Clears active workout and returns to home
}

export const WorkoutSummaryModal: React.FC<WorkoutSummaryModalProps> = ({
  isOpen,
  workout,
  stravaAccessToken,
  onConnectStrava,
  onClose,
  onSaveToHistory,
  onExitWorkout,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressMsg, setUploadProgressMsg] = useState('');
  const [uploadStatus, setUploadStatus] = useState<StravaUploadResult | null>(null);

  const toLocalDateString = (ts: number) => {
    const d = new Date(ts);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const toLocalTimeString = (ts: number) => {
    const d = new Date(ts);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // Editable fields: Title, Date, Time of Day, Duration
  const [title, setTitle] = useState(() => workout?.title || getDefaultActivityName(workout?.startTime));
  const [dateStr, setDateStr] = useState(() => (workout ? toLocalDateString(workout.startTime) : ''));
  const [timeStr, setTimeStr] = useState(() => (workout ? toLocalTimeString(workout.startTime) : ''));
  const [durationMinutes, setDurationMinutes] = useState(() =>
    workout ? Math.floor(workout.durationSeconds / 60) : 30
  );
  const [durationSeconds, setDurationSeconds] = useState(() =>
    workout ? workout.durationSeconds % 60 : 0
  );

  // Synchronize state immediately whenever the modal is opened or the workout changes
  useEffect(() => {
    if (workout && isOpen) {
      setTitle(workout.title || getDefaultActivityName(workout.startTime));
      setDateStr(toLocalDateString(workout.startTime));
      setTimeStr(toLocalTimeString(workout.startTime));
      setDurationMinutes(Math.floor(workout.durationSeconds / 60));
      setDurationSeconds(workout.durationSeconds % 60);
      setUploadStatus(null);
      setUploadProgressMsg('');
    }
  }, [workout, isOpen]);

  // Re-calculate the active workout object with user modifications
  const resolvedWorkout: CompletedWorkout | null = useMemo(() => {
    if (!workout) return null;

    let computedStartTime = workout.startTime;
    try {
      if (dateStr && timeStr) {
        const [year, month, day] = dateStr.split('-').map(Number);
        const [hours, minutes] = timeStr.split(':').map(Number);
        const parsedDate = new Date(year, month - 1, day, hours, minutes, 0);
        if (!isNaN(parsedDate.getTime())) {
          computedStartTime = parsedDate.getTime();
        }
      }
    } catch {
      computedStartTime = workout.startTime;
    }

    const totalDurSec = Math.max(1, (durationMinutes * 60) + durationSeconds);
    const computedEndTime = computedStartTime + (totalDurSec * 1000);

    return {
      ...workout,
      title: title.trim() || getDefaultActivityName(computedStartTime),
      startTime: computedStartTime,
      endTime: computedEndTime,
      durationSeconds: totalDurSec,
    };
  }, [workout, title, dateStr, timeStr, durationMinutes, durationSeconds]);

  if (!isOpen || !resolvedWorkout) return null;

  const handleDownloadFit = () => {
    downloadFitFile(resolvedWorkout);
    if (onSaveToHistory) {
      onSaveToHistory(resolvedWorkout);
    }
  };

  const handleDownloadAndOpenStrava = () => {
    downloadFitFile(resolvedWorkout);
    window.open('https://www.strava.com/upload/select', '_blank');
    if (onSaveToHistory) {
      onSaveToHistory(resolvedWorkout);
    }
  };

  const handleDirectStravaUpload = async () => {
    if (!stravaAccessToken) {
      onConnectStrava();
      return;
    }

    setIsUploading(true);
    setUploadStatus(null);
    setUploadProgressMsg('Sending workout to Strava...');

    try {
      const result = await uploadWorkoutToStrava(
        resolvedWorkout,
        stravaAccessToken,
        (statusText) => {
          setUploadProgressMsg(statusText);
        }
      );
      setUploadStatus(result);
      if (result.success && onSaveToHistory) {
        onSaveToHistory(resolvedWorkout);
      }
    } catch (err: any) {
      setUploadStatus({
        success: false,
        error: err.message || 'Error communicating with Strava API',
      });
    } finally {
      setIsUploading(false);
      setUploadProgressMsg('');
    }
  };

  const fitFileName = getFitFileName(resolvedWorkout);

  const handleClose = () => {
    if (resolvedWorkout && onSaveToHistory) {
      onSaveToHistory(resolvedWorkout);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col gap-4 text-slate-100 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs uppercase font-bold tracking-wider text-amber-500">Workout Completed!</div>
              <h3 className="text-lg font-extrabold text-white truncate max-w-[260px]">
                {resolvedWorkout.title}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            title="Return to workout to continue editing"
            className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Edit Workout Details Section: Name, Date, Time, Duration */}
        <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
          <div className="text-xs uppercase font-bold tracking-wider text-slate-400">
            Workout Details (.FIT & Strava)
          </div>

          {/* Workout Name */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              Workout Title / Name
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={workout ? `e.g. ${getDefaultActivityName(workout.startTime)}` : 'e.g. Friday Strength & Conditioning'}
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-bold text-sm focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* Date & Time of Day */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-amber-400" />
                <span>Date Started</span>
              </label>
              <input
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-400" />
                <span>Time of Day</span>
              </label>
              <input
                type="time"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Duration in Minutes & Seconds */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              Activity Duration
            </label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 flex-1">
                <input
                  type="number"
                  min="0"
                  max="999"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono font-bold text-xs text-center focus:outline-none focus:border-amber-400"
                />
                <span className="text-xs text-slate-400 font-bold">m</span>
              </div>
              <div className="flex items-center gap-1 flex-1">
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={durationSeconds}
                  onChange={(e) => setDurationSeconds(Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono font-bold text-xs text-center focus:outline-none focus:border-amber-400"
                />
                <span className="text-xs text-slate-400 font-bold">s</span>
              </div>
            </div>
          </div>
        </div>

        {/* High-Impact Stat Strip */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-800/80 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Sport Type</span>
            <span className="text-sm font-black text-amber-400">
              Weight Training
            </span>
          </div>
          <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-800/80 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Total Volume</span>
            <span className="text-base font-black font-mono text-white tabular-nums">
              {resolvedWorkout.totalVolumeKg.toLocaleString()} <span className="text-[10px] text-slate-400">kg</span>
            </span>
          </div>
          <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-800/80 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Sets / Reps</span>
            <span className="text-base font-black font-mono text-white tabular-nums">
              {resolvedWorkout.totalSets} <span className="text-xs text-slate-500">/</span> {resolvedWorkout.totalReps}
            </span>
          </div>
        </div>

        {/* File Naming Preview */}
        <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] font-mono flex items-center justify-between text-slate-400">
          <span>FIT File Name:</span>
          <span className="text-amber-400 font-bold">{fitFileName}</span>
        </div>

        {/* Strava Upload In-Flight Progress */}
        {isUploading && (
          <div className="p-3.5 rounded-2xl border border-amber-500/40 bg-amber-950/30 text-xs space-y-2 animate-pulse">
            <div className="flex items-center gap-2 text-amber-400 font-bold">
              <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
              <span>Strava Upload & Processing</span>
            </div>
            <p className="text-[11px] text-amber-200/90 leading-relaxed font-mono">
              {uploadProgressMsg || 'Uploading workout to Strava...'}
            </p>
            <div className="text-[10px] text-slate-400">
              Strava upload registered. Checking status after 4s, rechecking every 4s until ready.
            </div>
          </div>
        )}

        {/* Strava Upload Feedback */}
        {!isUploading && uploadStatus && (
          <div
            className={`p-3.5 rounded-2xl border text-xs space-y-2.5 ${
              uploadStatus.success
                ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {uploadStatus.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span className="font-bold text-white">
                {uploadStatus.success ? 'Activity Ready on Strava!' : 'Upload Error'}
              </span>
            </div>

            <p className="text-[11px] text-slate-200 leading-relaxed">
              {uploadStatus.success
                ? uploadStatus.status || 'Your activity has been processed and is ready.'
                : uploadStatus.error || 'There was an error processing your activity on Strava.'}
            </p>

            {uploadStatus.success && uploadStatus.activityId && (
              <a
                href={`https://www.strava.com/activities/${uploadStatus.activityId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
              >
                <span>View Activity on Strava (ID: {uploadStatus.activityId})</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            {/* Fallback button if failed */}
            {!uploadStatus.success && (
              <button
                type="button"
                onClick={handleDownloadAndOpenStrava}
                className="w-full py-2.5 px-3 rounded-xl bg-[#FC5200] hover:bg-[#e04900] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>1-Tap: Download .FIT & Open Strava Upload</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 pt-1 border-t border-slate-800">
          {/* Strava Cloud Sync */}
          <button
            type="button"
            disabled={isUploading}
            onClick={handleDirectStravaUpload}
            className="w-full py-3 px-4 rounded-2xl bg-[#FC5200] hover:bg-[#e04900] active:scale-[0.99] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#FC5200]/25 transition-all disabled:opacity-50 cursor-pointer"
          >
            {isUploading ? (
              <RefreshCw className="w-4 h-4 animate-spin stroke-[2.5]" />
            ) : (
              <UploadCloud className="w-4 h-4 stroke-[2.5]" />
            )}
            <span>
              {isUploading
                ? uploadProgressMsg || 'Checking Strava Status...'
                : stravaAccessToken
                ? 'Sync Directly to Connected Strava'
                : 'Connect Strava & Upload'}
            </span>
          </button>

          {/* Save and Exit Workout button */}
          {onExitWorkout && (
            <button
              type="button"
              onClick={() => {
                if (resolvedWorkout && onSaveToHistory) {
                  onSaveToHistory(resolvedWorkout);
                }
                onExitWorkout();
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-emerald-950/40 text-emerald-400 font-bold text-xs flex items-center justify-center gap-1.5 border border-emerald-500/30 transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>Save & Complete Session (Done)</span>
            </button>
          )}

          {/* Continue Editing Return Button */}
          <button
            type="button"
            onClick={handleClose}
            className="w-full py-2.5 px-3 rounded-xl bg-transparent hover:bg-slate-800 text-slate-400 hover:text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Workout (Continue Editing)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
