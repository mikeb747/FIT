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
} from 'lucide-react';
import type {
  StravaActivity,
  StravaActivityDetailsRecord,
  ActivityCalibration,
  CalibratedSwimLap,
} from '../utils/stravaActivities';
import {
  classifyActivity,
  saveActivityCalibration,
  clearActivityCalibration,
} from '../utils/stravaActivities';
import {
  formatSecondsToMinSec,
  parseMinSecToSeconds,
  calculateWorkKj,
} from '../types/athlete';

interface ActivityCalibrationModalProps {
  isOpen: boolean;
  activity: StravaActivity;
  detailsRecord: StravaActivityDetailsRecord | null;
  onClose: () => void;
  onCalibrationSaved: (updatedRecord: StravaActivityDetailsRecord) => void;
}

export const ActivityCalibrationModal: React.FC<ActivityCalibrationModalProps> = ({
  isOpen,
  activity,
  detailsRecord,
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
  const [notes, setNotes] = useState<string>(existingCalib?.calibrationNotes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  if (!isOpen) return null;

  // Real-time computed values
  const parsedDistM = isKm
    ? (parseFloat(distanceInput) || 0) * 1000
    : parseFloat(distanceInput) || 0;
  const parsedMovingSec = parseMinSecToSeconds(movingTimeInput, originalMovingSec);

  // Automatically recalculate moving time and total distance when swim laps are modified or ignored
  const recalculateSwimTotals = (updatedLaps: CalibratedSwimLap[]) => {
    if (classification.category !== 'Swim') return;
    const activeLaps = updatedLaps.filter((l) => !l.isIgnored && !l.isRest && l.distanceM > 0);
    const sumDist = activeLaps.reduce((acc, l) => acc + l.distanceM, 0);
    const sumTime = activeLaps.reduce((acc, l) => acc + l.movingTimeSec, 0);

    setDistanceInput(sumDist > 0 ? sumDist.toString() : '0');
    setMovingTimeInput(formatSecondsToMinSec(sumTime));
  };

  // Calculated Pace/Speed
  let calculatedPaceSpeedLabel = '';
  if (parsedDistM > 0 && parsedMovingSec > 0) {
    if (classification.category === 'Run') {
      const secPerKm = parsedMovingSec / (parsedDistM / 1000);
      calculatedPaceSpeedLabel = `${formatSecondsToMinSec(secPerKm)}/km`;
    } else if (classification.category === 'Bike') {
      const kph = ((parsedDistM / 1000) / (parsedMovingSec / 3600)).toFixed(1);
      calculatedPaceSpeedLabel = `${kph} kph avg`;
    } else if (classification.category === 'Swim') {
      const secPer100m = (parsedMovingSec / parsedDistM) * 100;
      calculatedPaceSpeedLabel = `${formatSecondsToMinSec(secPer100m)}/100m`;
    }
  }

  // Work calculation preview for power
  const parsedWatts = parseFloat(avgWattsInput) || 0;
  const workPreview = isBikeOrTurbo && parsedWatts > 0
    ? calculateWorkKj(parsedWatts, parsedMovingSec)
    : null;

  // Treadmill quick distance presets
  const applyTreadmillPreset = (km: number) => {
    setDistanceInput(km.toFixed(2));
  };

  // Swim Lap Handlers
  const handleLapDistanceChange = (index: number, newDistM: number) => {
    const dist = Math.max(0, newDistM);
    const isRest = dist <= 0;
    const updated = swimLaps.map((lap, i) => {
      if (i !== index) return lap;
      const paceSec = dist > 0 && lap.movingTimeSec > 0 ? (lap.movingTimeSec / dist) * 100 : 0;
      return {
        ...lap,
        distanceM: dist,
        isRest,
        pacePer100mFormatted: isRest ? '' : formatSecondsToMinSec(paceSec) + '/100m',
      };
    });
    setSwimLaps(updated);
    recalculateSwimTotals(updated);
  };

  const handleLapTimeChange = (index: number, newTimeStr: string) => {
    const timeSec = parseMinSecToSeconds(newTimeStr, 60);
    const updated = swimLaps.map((lap, i) => {
      if (i !== index) return lap;
      const dist = lap.distanceM || 0;
      const isRest = Boolean(lap.isRest || dist <= 0);
      const paceSec = !isRest && dist > 0 ? (timeSec / dist) * 100 : 0;
      return {
        ...lap,
        movingTimeSec: timeSec,
        pacePer100mFormatted: isRest ? '' : formatSecondsToMinSec(paceSec) + '/100m',
      };
    });
    setSwimLaps(updated);
    recalculateSwimTotals(updated);
  };

  const toggleIgnoreLap = (index: number) => {
    const updated = swimLaps.map((lap, i) => {
      if (i !== index) return lap;
      return { ...lap, isIgnored: !lap.isIgnored };
    });
    setSwimLaps(updated);
    recalculateSwimTotals(updated);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const calibrationPayload: ActivityCalibration = {
        isIgnoredFromTrainingStatus: isIgnored,
        calibratedDistanceM: parsedDistM > 0 ? parsedDistM : undefined,
        calibratedMovingTimeSec: parsedMovingSec > 0 ? parsedMovingSec : undefined,
        calibratedMaxHeartRate: maxHrInput ? parseInt(maxHrInput, 10) : undefined,
        calibratedAvgHeartRate: avgHrInput ? parseInt(avgHrInput, 10) : undefined,
        calibratedAvgWatts: isBikeOrTurbo && avgWattsInput ? parseInt(avgWattsInput, 10) : undefined,
        calibratedNormalizedPower: isBikeOrTurbo && npWattsInput ? parseInt(npWattsInput, 10) : undefined,
        calibratedLaps: classification.category === 'Swim' && swimLaps.length > 0 ? swimLaps : undefined,
        calibrationNotes: notes.trim() || undefined,
      };

      const updated = await saveActivityCalibration(activity.id, calibrationPayload);
      onCalibrationSaved(updated);
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
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
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
            <label className="flex items-start justify-between gap-4 cursor-pointer">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <EyeOff className={`w-4 h-4 ${isIgnored ? 'text-rose-400' : 'text-slate-400'}`} />
                  <span className="text-sm font-bold text-white">
                    Ignore from Training Status & TSS
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Excludes this activity from TSS, acute/chronic training load, and recovery recommendations (useful for sensor crashes, accidental recordings, or non-training commutes).
                </p>
              </div>

              <input
                type="checkbox"
                checked={isIgnored}
                onChange={(e) => setIsIgnored(e.target.checked)}
                className="w-5 h-5 rounded-lg border-slate-700 text-rose-500 focus:ring-rose-500/30 mt-0.5 cursor-pointer accent-rose-500"
              />
            </label>
          </div>

          {/* Distance & Moving Time Calibration */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  {classification.subType === 'Treadmill Run' ? 'Treadmill Distance & Pace Calibration' : 'Distance & Duration Calibration'}
                </span>
              </h4>
              {calculatedPaceSpeedLabel && (
                <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                  {calculatedPaceSpeedLabel}
                </span>
              )}
            </div>

            {classification.subType === 'Treadmill Run' && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400 font-medium">Quick presets:</span>
                {[3.0, 5.0, 8.0, 10.0].map((km) => (
                  <button
                    key={km}
                    type="button"
                    onClick={() => applyTreadmillPreset(km)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    {km} km
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Total Distance ({isKm ? 'km' : 'meters'})
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step={isKm ? '0.01' : '1'}
                    value={distanceInput}
                    onChange={(e) => setDistanceInput(e.target.value)}
                    placeholder={isKm ? '5.00' : '1500'}
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
                  Moving Time (mm:ss or total seconds)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={movingTimeInput}
                    onChange={(e) => setMovingTimeInput(e.target.value)}
                    placeholder="25:30"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-sm focus:border-amber-400 focus:outline-none"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-mono">
                    time
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 block mt-1">
                  Strava raw: {formatSecondsToMinSec(originalMovingSec)}
                </span>
              </div>
            </div>
          </div>

          {/* Heart Rate Calibration (Spike & Drop Glitch Fix) */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5 text-rose-400" />
              <span>Heart Rate & Sensor Glitch Correction</span>
            </h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              If an optical sensor or chest strap spiked falsely (e.g. 210 bpm) or lost signal, clamp the Max and Avg HR to ensure accurate hrTSS and zone distribution.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Max Heart Rate (bpm)
                </label>
                <input
                  type="number"
                  value={maxHrInput}
                  onChange={(e) => setMaxHrInput(e.target.value)}
                  placeholder="e.g. 178"
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
                  placeholder="e.g. 152"
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

          {/* Cycling Power Calibration (Watts, Normalized Power, Work in kJ) */}
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

          {/* Swim Lap Calibration (Watch Accuracy Glitch Fix) */}
          {classification.category === 'Swim' && swimLaps.length > 0 && (
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-sky-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Waves className="w-3.5 h-3.5 text-sky-400" />
                  <span>Swim Lap Accuracy Calibration ({swimLaps.length} Laps)</span>
                </h4>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Watches frequently miss flip turns or register pauses incorrectly. Edit individual lap meters, moving time, or toggle "Ignore" to remove inaccurate laps from the overall pace.
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
                          onChange={(e) => handleLapDistanceChange(index, parseInt(e.target.value, 10) || 0)}
                          className="w-16 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-center disabled:opacity-40"
                        />
                        <span className="text-slate-500 text-[10px]">m</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={formatSecondsToMinSec(lap.movingTimeSec)}
                          disabled={lap.isIgnored}
                          onChange={(e) => handleLapTimeChange(index, e.target.value)}
                          className="w-16 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-center disabled:opacity-40"
                        />
                        <span className="text-slate-500 text-[10px]">time</span>
                      </div>

                      <span className={`font-mono font-bold text-[11px] min-w-16 text-right ${isRestLap ? 'text-slate-500' : 'text-sky-300'}`}>
                        {lap.isIgnored ? 'Ignored' : isRestLap ? 'Rest' : lap.pacePer100mFormatted}
                      </span>

                      <button
                        type="button"
                        onClick={() => toggleIgnoreLap(index)}
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

          {/* Calibration Notes */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">
              Calibration Reason / Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Treadmill console showed 5.2 km; watch under-reported distance by 400m."
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
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Calibration</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
