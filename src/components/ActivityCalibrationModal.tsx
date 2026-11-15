import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  mapStravaRunLapsToSections,
  extractOriginalLapStreamSlices,
  stitchLapSeriesForDuration,
  saveActivityCalibration,
  clearActivityCalibration,
  updateStravaActivityRecord,
  replaceRepublishedStravaActivity,
  generateAutoSplitsFromStreamsOrActivity,
  cropStreamsAndScaleDistance,
  applyCalibratedDistanceAndDurationToRecord,
} from '../utils/stravaActivities';
import {
  formatSecondsToMinSec,
  parseMinSecToSeconds,
  calculateWorkKj,
} from '../types/athlete';
import {
  generateRunFitFile,
  generateSwimFitFile,
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
  { id: '1', name: 'Lap 1', durationSec: 8 * 60, speedKph: 11.0 },
  { id: '2', name: 'Lap 2', durationSec: 2 * 60, speedKph: 6.0 },
  { id: '3', name: 'Lap 3', durationSec: 20 * 60, speedKph: 16.1 },
  { id: '4', name: 'Lap 4', durationSec: 2.5 * 60, speedKph: 16.2 },
  { id: '5', name: 'Lap 5', durationSec: 2.5 * 60, speedKph: 16.3 },
  { id: '6', name: 'Lap 6', durationSec: 2.5 * 60, speedKph: 16.4 },
  { id: '7', name: 'Lap 7', durationSec: 2.5 * 60, speedKph: 16.5 },
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

const parseCalibrationDigits = (rawInput: string, maxVal: number, maxLen = 2): string => {
  const digits = rawInput.replace(/[^0-9]/g, '');
  if (digits.length <= maxLen) return digits;
  if (digits.startsWith('0')) {
    const stripped = digits.slice(1, 1 + maxLen);
    return parseInt(stripped, 10) > maxVal ? digits.slice(-1) : stripped;
  }
  const tail = digits.slice(-maxLen);
  return parseInt(tail, 10) > maxVal ? digits.slice(-1) : tail;
};

const MovingTimeBoxInput: React.FC<{
  valueStr: string;
  defaultSec?: number;
  onChange: (newMinSecStr: string) => void;
}> = ({ valueStr, defaultSec = 0, onChange }) => {
  const totalSec = Math.max(0, Math.round(parseMinSecToSeconds(valueStr, defaultSec)));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;

  const [minDraft, setMinDraft] = useState<string | null>(null);
  const [secDraft, setSecDraft] = useState<string | null>(null);
  const justFocusedMinRef = useRef(false);
  const justFocusedSecRef = useRef(false);

  const commitMinSec = (newMin: number, newSec: number) => {
    const clampedMin = Math.max(0, Math.min(999, Math.round(newMin) || 0));
    const clampedSec = Math.max(0, Math.min(59, Math.round(newSec) || 0));
    onChange(`${clampedMin}:${String(clampedSec).padStart(2, '0')}`);
  };

  const boxClass =
    'w-16 h-10 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-base font-bold text-center focus:border-amber-400 focus:outline-none transition-colors';

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-col items-center gap-0.5">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label="Moving Time Minutes"
          value={minDraft !== null ? minDraft : String(mins).padStart(2, '0')}
          onFocus={(e) => {
            justFocusedMinRef.current = true;
            setMinDraft(String(mins).padStart(2, '0'));
            e.currentTarget.select();
          }}
          onMouseUp={(e) => {
            if (justFocusedMinRef.current) {
              e.preventDefault();
              justFocusedMinRef.current = false;
            }
          }}
          onChange={(e) => {
            const raw = parseCalibrationDigits(e.target.value, 999, 3);
            setMinDraft(raw);
            const nextMin = raw === '' ? 0 : parseInt(raw, 10) || 0;
            commitMinSec(nextMin, secs);
          }}
          onBlur={() => {
            if (minDraft !== null) {
              const parsedMin = minDraft === '' ? 0 : parseInt(minDraft, 10) || 0;
              setMinDraft(null);
              if (parsedMin !== mins) {
                commitMinSec(parsedMin, secs);
              }
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              const nextM = Math.min(999, mins + 1);
              setMinDraft(String(nextM).padStart(2, '0'));
              commitMinSec(nextM, secs);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              const nextM = Math.max(0, mins - 1);
              setMinDraft(String(nextM).padStart(2, '0'));
              commitMinSec(nextM, secs);
            } else if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
          className={boxClass}
        />
        <span className="text-[9px] font-medium text-slate-400">Minute</span>
      </div>

      <span className="text-lg font-black text-slate-300 pb-3.5 select-none">:</span>

      <div className="flex flex-col items-center gap-0.5">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label="Moving Time Seconds"
          value={secDraft !== null ? secDraft : String(secs).padStart(2, '0')}
          onFocus={(e) => {
            justFocusedSecRef.current = true;
            setSecDraft(String(secs).padStart(2, '0'));
            e.currentTarget.select();
          }}
          onMouseUp={(e) => {
            if (justFocusedSecRef.current) {
              e.preventDefault();
              justFocusedSecRef.current = false;
            }
          }}
          onChange={(e) => {
            const raw = parseCalibrationDigits(e.target.value, 59, 2);
            setSecDraft(raw);
            const nextSec = raw === '' ? 0 : Math.min(59, parseInt(raw, 10) || 0);
            commitMinSec(mins, nextSec);
          }}
          onBlur={() => {
            if (secDraft !== null) {
              const parsedSec = secDraft === '' ? 0 : Math.min(59, parseInt(secDraft, 10) || 0);
              setSecDraft(null);
              if (parsedSec !== secs) {
                commitMinSec(mins, parsedSec);
              }
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              const nextTotal = Math.min(999 * 60 + 59, totalSec + 1);
              const nextM = Math.floor(nextTotal / 60);
              const nextS = nextTotal % 60;
              setSecDraft(String(nextS).padStart(2, '0'));
              commitMinSec(nextM, nextS);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              const nextTotal = Math.max(0, totalSec - 1);
              const nextM = Math.floor(nextTotal / 60);
              const nextS = nextTotal % 60;
              setSecDraft(String(nextS).padStart(2, '0'));
              commitMinSec(nextM, nextS);
            } else if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
          className={boxClass}
        />
        <span className="text-[9px] font-medium text-slate-400">Second</span>
      </div>
    </div>
  );
};

const LapDurationInput: React.FC<{
  durationSec: number;
  isLastAutoExtended?: boolean;
  timeDiscrepancySec?: number;
  onCommit: (seconds: number) => void;
  isAlternate?: boolean;
  disabled?: boolean;
}> = ({ durationSec, isLastAutoExtended, timeDiscrepancySec, onCommit, isAlternate, disabled }) => {
  const safeSec = Math.max(0, Math.round(durationSec || 0));
  const mins = Math.floor(safeSec / 60);
  const secs = safeSec % 60;

  const [minDraft, setMinDraft] = useState<string | null>(null);
  const [secDraft, setSecDraft] = useState<string | null>(null);
  const justFocusedMinRef = useRef(false);
  const justFocusedSecRef = useRef(false);

  const commitMinSec = (newMin: number, newSec: number) => {
    const clampedMin = Math.max(0, Math.min(999, Math.round(newMin) || 0));
    const clampedSec = Math.max(0, Math.min(59, Math.round(newSec) || 0));
    onCommit(clampedMin * 60 + clampedSec);
  };

  const boxClass = `w-8 sm:w-9 h-7 rounded-lg font-mono text-xs font-bold text-center focus:outline-none transition-colors disabled:opacity-40 ${
    isAlternate
      ? 'bg-white border border-sky-300 text-slate-900 focus:border-sky-500'
      : 'bg-slate-950 border border-slate-700/80 text-white focus:border-emerald-400'
  }`;

  return (
    <div className="relative shrink-0 flex flex-col items-center">
      <div className="inline-flex items-center gap-0.5 font-mono">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          disabled={disabled}
          aria-label="Lap Duration Minutes"
          value={minDraft !== null ? minDraft : String(mins).padStart(2, '0')}
          onFocus={(e) => {
            justFocusedMinRef.current = true;
            setMinDraft(String(mins).padStart(2, '0'));
            e.currentTarget.select();
          }}
          onMouseUp={(e) => {
            if (justFocusedMinRef.current) {
              e.preventDefault();
              justFocusedMinRef.current = false;
            }
          }}
          onChange={(e) => {
            const raw = parseCalibrationDigits(e.target.value, 999, 3);
            setMinDraft(raw);
            const nextMin = raw === '' ? 0 : parseInt(raw, 10) || 0;
            commitMinSec(nextMin, secs);
          }}
          onBlur={() => {
            if (minDraft !== null) {
              const parsedMin = minDraft === '' ? 0 : parseInt(minDraft, 10) || 0;
              setMinDraft(null);
              if (parsedMin !== mins) {
                commitMinSec(parsedMin, secs);
              }
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              const nextM = Math.min(999, mins + 1);
              setMinDraft(String(nextM).padStart(2, '0'));
              commitMinSec(nextM, secs);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              const nextM = Math.max(0, mins - 1);
              setMinDraft(String(nextM).padStart(2, '0'));
              commitMinSec(nextM, secs);
            } else if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
          className={boxClass}
        />
        <span className={`text-xs font-black ${isAlternate ? 'text-slate-700' : 'text-slate-400'}`}>:</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          disabled={disabled}
          aria-label="Lap Duration Seconds"
          value={secDraft !== null ? secDraft : String(secs).padStart(2, '0')}
          onFocus={(e) => {
            justFocusedSecRef.current = true;
            setSecDraft(String(secs).padStart(2, '0'));
            e.currentTarget.select();
          }}
          onMouseUp={(e) => {
            if (justFocusedSecRef.current) {
              e.preventDefault();
              justFocusedSecRef.current = false;
            }
          }}
          onChange={(e) => {
            const raw = parseCalibrationDigits(e.target.value, 59, 2);
            setSecDraft(raw);
            const nextSec = raw === '' ? 0 : Math.min(59, parseInt(raw, 10) || 0);
            commitMinSec(mins, nextSec);
          }}
          onBlur={() => {
            if (secDraft !== null) {
              const parsedSec = secDraft === '' ? 0 : Math.min(59, parseInt(secDraft, 10) || 0);
              setSecDraft(null);
              if (parsedSec !== secs) {
                commitMinSec(mins, parsedSec);
              }
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              const nextTotal = Math.min(999 * 60 + 59, safeSec + 1);
              const nextM = Math.floor(nextTotal / 60);
              const nextS = nextTotal % 60;
              setSecDraft(String(nextS).padStart(2, '0'));
              commitMinSec(nextM, nextS);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              const nextTotal = Math.max(0, safeSec - 1);
              const nextM = Math.floor(nextTotal / 60);
              const nextS = nextTotal % 60;
              setSecDraft(String(nextS).padStart(2, '0'));
              commitMinSec(nextM, nextS);
            } else if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
          className={boxClass}
        />
      </div>
      {isLastAutoExtended && (timeDiscrepancySec || 0) > 0.05 && (
        <span
          className={`text-[9px] block text-center truncate font-mono mt-0.5 ${
            isAlternate ? 'text-sky-700 font-bold' : 'text-emerald-400'
          }`}
          title="Auto-extended to match exact recording duration"
        >
          +{(timeDiscrepancySec || 0).toFixed(0)}s
        </span>
      )}
    </div>
  );
};

const LapPaceInput: React.FC<{
  paceSec: number;
  onCommitPaceSec: (newPaceSec: number) => void;
  isAlternate?: boolean;
  disabled?: boolean;
  unitSuffix?: string;
}> = ({ paceSec, onCommitPaceSec, isAlternate, disabled, unitSuffix }) => {
  const safePaceSec = Math.max(0, Math.round(paceSec || 0));
  const [localPaceSec, setLocalPaceSec] = useState(safePaceSec);
  const [minDraft, setMinDraft] = useState<string | null>(null);
  const [secDraft, setSecDraft] = useState<string | null>(null);
  const justFocusedMinRef = useRef(false);
  const justFocusedSecRef = useRef(false);

  const isEditing = minDraft !== null || secDraft !== null;

  useEffect(() => {
    if (!isEditing) {
      setLocalPaceSec(safePaceSec);
    }
  }, [safePaceSec, isEditing]);

  const activeSec = isEditing ? localPaceSec : safePaceSec;
  const mins = Math.floor(activeSec / 60);
  const secs = activeSec % 60;

  const commitMinSec = (newMin: number, newSec: number) => {
    const clampedMin = Math.max(0, Math.min(99, Math.round(newMin) || 0));
    const clampedSec = Math.max(0, Math.min(59, Math.round(newSec) || 0));
    const nextTotal = clampedMin * 60 + clampedSec;
    setLocalPaceSec(nextTotal);
    if (nextTotal > 0) {
      onCommitPaceSec(nextTotal);
    }
  };

  const boxClass = `w-8 sm:w-9 h-7 rounded-lg font-mono text-xs font-bold text-center focus:outline-none transition-colors disabled:opacity-40 ${
    isAlternate
      ? 'bg-white border border-sky-300 text-sky-950 focus:border-sky-500'
      : 'bg-slate-950 border border-slate-700/80 text-emerald-300 focus:border-emerald-400'
  }`;

  return (
    <div className="inline-flex items-center gap-0.5 font-mono shrink-0">
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        disabled={disabled}
        aria-label="Lap Pace Minutes"
        value={minDraft !== null ? minDraft : String(mins).padStart(2, '0')}
        onFocus={(e) => {
          justFocusedMinRef.current = true;
          setLocalPaceSec(safePaceSec);
          setMinDraft(String(mins).padStart(2, '0'));
          e.currentTarget.select();
        }}
        onMouseUp={(e) => {
          if (justFocusedMinRef.current) {
            e.preventDefault();
            justFocusedMinRef.current = false;
          }
        }}
        onChange={(e) => {
          const raw = parseCalibrationDigits(e.target.value, 99, 2);
          setMinDraft(raw);
          const nextMin = raw === '' ? 0 : parseInt(raw, 10) || 0;
          commitMinSec(nextMin, secs);
        }}
        onBlur={() => {
          if (minDraft !== null) {
            const parsedMin = minDraft === '' ? 0 : parseInt(minDraft, 10) || 0;
            setMinDraft(null);
            commitMinSec(parsedMin, secs);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            const nextM = Math.min(99, mins + 1);
            setMinDraft(String(nextM).padStart(2, '0'));
            commitMinSec(nextM, secs);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextM = Math.max(0, mins - 1);
            setMinDraft(String(nextM).padStart(2, '0'));
            commitMinSec(nextM, secs);
          } else if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
        }}
        className={boxClass}
      />
      <span className={`text-xs font-black ${isAlternate ? 'text-slate-700' : 'text-slate-400'}`}>:</span>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        disabled={disabled}
        aria-label="Lap Pace Seconds"
        value={secDraft !== null ? secDraft : String(secs).padStart(2, '0')}
        onFocus={(e) => {
          justFocusedSecRef.current = true;
          setLocalPaceSec(safePaceSec);
          setSecDraft(String(secs).padStart(2, '0'));
          e.currentTarget.select();
        }}
        onMouseUp={(e) => {
          if (justFocusedSecRef.current) {
            e.preventDefault();
            justFocusedSecRef.current = false;
          }
        }}
        onChange={(e) => {
          const raw = parseCalibrationDigits(e.target.value, 59, 2);
          setSecDraft(raw);
          const nextSec = raw === '' ? 0 : Math.min(59, parseInt(raw, 10) || 0);
          commitMinSec(mins, nextSec);
        }}
        onBlur={() => {
          if (secDraft !== null) {
            const parsedSec = secDraft === '' ? 0 : Math.min(59, parseInt(secDraft, 10) || 0);
            setSecDraft(null);
            commitMinSec(mins, parsedSec);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            const nextTotal = Math.min(99 * 60 + 59, activeSec + 1);
            const nextM = Math.floor(nextTotal / 60);
            const nextS = nextTotal % 60;
            setSecDraft(String(nextS).padStart(2, '0'));
            commitMinSec(nextM, nextS);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextTotal = Math.max(1, activeSec - 1);
            const nextM = Math.floor(nextTotal / 60);
            const nextS = nextTotal % 60;
            setSecDraft(String(nextS).padStart(2, '0'));
            commitMinSec(nextM, nextS);
          } else if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
        }}
        className={boxClass}
      />
      {unitSuffix && (
        <span className={`text-[10px] font-mono pl-0.5 ${isAlternate ? 'text-slate-600' : 'text-slate-500'}`}>
          {unitSuffix}
        </span>
      )}
    </div>
  );
};

const LapSpeedInput: React.FC<{
  speedKph: number;
  onCommit: (speed: number) => void;
  isAlternate?: boolean;
}> = ({ speedKph, onCommit, isAlternate }) => {
  const [localVal, setLocalVal] = useState(() => (speedKph ? String(speedKph) : ''));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalVal(speedKph ? String(speedKph) : '');
    }
  }, [speedKph, isFocused]);

  const commitValue = (val: string) => {
    const trimmed = val.trim();
    const num = parseFloat(trimmed);
    if (!isNaN(num) && num > 0) {
      const rounded = Number(num.toFixed(2));
      onCommit(rounded);
      setLocalVal(String(rounded));
    } else {
      setLocalVal(speedKph ? String(speedKph) : '');
    }
  };

  return (
    <div className="flex items-center gap-1 w-20 sm:w-24 shrink-0">
      <input
        type="text"
        inputMode="decimal"
        value={localVal}
        onFocus={(e) => {
          setIsFocused(true);
          e.target.select();
        }}
        onChange={(e) => setLocalVal(e.target.value)}
        onBlur={() => {
          setIsFocused(false);
          commitValue(localVal);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="11.0"
        className={`w-full px-1.5 py-1 rounded-lg font-mono text-xs text-center focus:outline-none transition-colors ${
          isAlternate
            ? 'bg-white border border-sky-300 text-slate-900 focus:border-sky-500 font-semibold'
            : 'bg-slate-950 border border-slate-700/80 text-white focus:border-emerald-400'
        }`}
      />
      <span className={`text-[10px] shrink-0 font-mono ${isAlternate ? 'text-sky-900 font-bold' : 'text-slate-500'}`}>km/h</span>
    </div>
  );
};

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
  const isSwim = classification.category === 'Swim';

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

  // Swim Laps & Per-Lap Original HR/Stroke Rate Slices
  const detailedSwimLaps = detailsRecord?.activity?.laps;
  const rawLaps = useMemo(() => {
    if (Array.isArray(detailedSwimLaps) && detailedSwimLaps.length > 0) {
      return detailedSwimLaps;
    }
    if (Array.isArray(activity.laps) && activity.laps.length > 0) {
      return activity.laps;
    }
    return [];
  }, [detailedSwimLaps, activity.laps]);

  const origSwimSlices = useMemo(
    () =>
      extractOriginalLapStreamSlices(
        rawLaps,
        detailsRecord?.streams as Record<string, { data?: any[] }> | undefined,
        activity.average_cadence
      ),
    [rawLaps, detailsRecord?.streams, activity.average_cadence]
  );

  const mapRawSwimLaps = (lapsArr: any[]): CalibratedSwimLap[] =>
    lapsArr.map((lap, idx) => {
      const dist = Math.round(lap.distance || 0);
      const time = Math.round(lap.moving_time || lap.elapsed_time || 0);
      const isRest = dist <= 0;
      const paceSec = dist > 0 && time > 0 ? (time / dist) * 100 : 0;
      const slice = origSwimSlices[idx];
      const strokeRateSpm = isRest
        ? 0
        : slice?.avgCadence ??
          (Number(lap.average_cadence) > 0
            ? Math.round(Number(lap.average_cadence))
            : activity.average_cadence
              ? Math.round(activity.average_cadence)
              : undefined);
      const totalStrokes = isRest
        ? 0
        : slice?.totalCycles ??
          (strokeRateSpm && strokeRateSpm > 0 && time > 0
            ? Math.round((strokeRateSpm * time) / 60)
            : undefined);

      return {
        lapIndex: idx + 1,
        originalLapIndex: idx + 1,
        distanceM: dist,
        movingTimeSec: time,
        pacePer100mFormatted: isRest ? '' : formatSecondsToMinSec(paceSec) + '/100m',
        strokeRateSpm,
        totalStrokes,
        avgHr: slice?.avgHr ?? (Number(lap.average_heartrate) > 30 ? Math.round(Number(lap.average_heartrate)) : undefined),
        maxHr: slice?.maxHr ?? (Number(lap.max_heartrate) > 30 ? Math.round(Number(lap.max_heartrate)) : undefined),
        isIgnored: false,
        isRest,
      };
    });

  const enrichCalibratedSwimLap = (lap: CalibratedSwimLap, idx: number): CalibratedSwimLap => {
    const isRest = Boolean(lap.isRest || lap.distanceM <= 0);
    const origIdx = (lap.originalLapIndex ?? idx + 1) - 1;
    const slice = origSwimSlices[origIdx];
    const strokeRateSpm = isRest
      ? 0
      : lap.strokeRateSpm ??
        slice?.avgCadence ??
        (activity.average_cadence ? Math.round(activity.average_cadence) : undefined);
    const totalStrokes = isRest
      ? 0
      : strokeRateSpm && strokeRateSpm > 0 && lap.movingTimeSec > 0
        ? Math.round((strokeRateSpm * lap.movingTimeSec) / 60)
        : lap.totalStrokes;
    return {
      ...lap,
      originalLapIndex: lap.originalLapIndex ?? idx + 1,
      isRest,
      strokeRateSpm,
      totalStrokes,
      avgHr: lap.avgHr ?? slice?.avgHr,
      maxHr: lap.maxHr ?? slice?.maxHr,
    };
  };

  const [swimLaps, setSwimLaps] = useState<CalibratedSwimLap[]>(() => {
    if (existingCalib?.calibratedLaps && existingCalib.calibratedLaps.length > 0) {
      return existingCalib.calibratedLaps.map((lap, idx) => enrichCalibratedSwimLap(lap, idx));
    }
    if (rawLaps.length > 0) {
      return mapRawSwimLaps(rawLaps);
    }
    if (isSwim && originalDistanceM > 0) {
      const dist = Math.round(originalDistanceM);
      const time = Math.round(originalMovingSec || 1200);
      const paceSec = dist > 0 && time > 0 ? (time / dist) * 100 : 0;
      const defaultCad = activity.average_cadence ? Math.round(activity.average_cadence) : 28;
      return [
        {
          lapIndex: 1,
          originalLapIndex: 1,
          distanceM: dist,
          movingTimeSec: time,
          pacePer100mFormatted: formatSecondsToMinSec(paceSec) + '/100m',
          strokeRateSpm: defaultCad,
          totalStrokes: Math.round((defaultCad * time) / 60),
          avgHr: activity.average_heartrate ? Math.round(activity.average_heartrate) : undefined,
          maxHr: activity.max_heartrate ? Math.round(activity.max_heartrate) : undefined,
          isIgnored: false,
          isRest: false,
        },
      ];
    }
    return [];
  });

  const swimLapsInitialized = useRef(
    Boolean(existingCalib?.calibratedLaps?.length || rawLaps.length)
  );

  useEffect(() => {
    if (!isSwim) return;
    if (!swimLapsInitialized.current) {
      if (existingCalib?.calibratedLaps && existingCalib.calibratedLaps.length > 0) {
        setSwimLaps(
          existingCalib.calibratedLaps.map((lap, idx) => enrichCalibratedSwimLap(lap, idx))
        );
        swimLapsInitialized.current = true;
      } else if (rawLaps.length > 0) {
        setSwimLaps(mapRawSwimLaps(rawLaps));
        swimLapsInitialized.current = true;
      }
    } else if (origSwimSlices.length > 0) {
      // Backfill strokeRateSpm or avgHr if streams arrived after initial modal open
      setSwimLaps((prev) =>
        prev.map((lap, idx) => {
          if (lap.strokeRateSpm !== undefined && lap.avgHr !== undefined) return lap;
          return enrichCalibratedSwimLap(lap, idx);
        })
      );
    }
  }, [isSwim, existingCalib?.calibratedLaps, rawLaps, origSwimSlices]);

  // Indoor Run Simulated Laps / Sections
  const isRun = classification.category === 'Run';
  const detailedRunLaps = detailsRecord?.activity?.laps;
  const rawRunLaps =
    Array.isArray(detailedRunLaps) && detailedRunLaps.length > 0
      ? detailedRunLaps
      : activity.laps;
  const origRunSlices = useMemo(
    () =>
      extractOriginalLapStreamSlices(
        rawRunLaps,
        detailsRecord?.streams as Record<string, { data?: any[] }> | undefined,
        activity.average_cadence
      ),
    [rawRunLaps, detailsRecord?.streams, activity.average_cadence]
  );
  const sectionsFromStravaLaps = useMemo(() => mapStravaRunLapsToSections(rawRunLaps), [rawRunLaps]);
  const [runSections, setRunSections] = useState<CalibratedRunSection[]>(() => {
    if (existingCalib?.calibratedRunSections && existingCalib.calibratedRunSections.length > 0) {
      return existingCalib.calibratedRunSections;
    }
    return sectionsFromStravaLaps;
  });
  const runSectionsInitialized = useRef(
    Boolean(existingCalib?.calibratedRunSections?.length || sectionsFromStravaLaps.length)
  );

  useEffect(() => {
    if (runSectionsInitialized.current || runSections.length > 0) return;
    if (existingCalib?.calibratedRunSections?.length) {
      setRunSections(existingCalib.calibratedRunSections);
      runSectionsInitialized.current = true;
    } else if (sectionsFromStravaLaps.length > 0) {
      setRunSections(sectionsFromStravaLaps);
      runSectionsInitialized.current = true;
    }
  }, [existingCalib?.calibratedRunSections, runSections.length, sectionsFromStravaLaps]);

  const [notes, setNotes] = useState<string>(existingCalib?.calibrationNotes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);
  const [topLevelDistOrTimeEdited, setTopLevelDistOrTimeEdited] = useState(false);
  const [customRunLapsEdited, setCustomRunLapsEdited] = useState(
    Boolean(existingCalib?.calibratedRunSections?.length)
  );

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
  const rawStreamDurationSec = streamTimeData && streamTimeData.length > 0
    ? streamTimeData[streamTimeData.length - 1] - streamTimeData[0]
    : originalMovingSec > 0
      ? originalMovingSec
      : 2400;

  // Respect shorter or user-edited Moving Time so the final lap is not auto-extended back to the uncropped duration
  const recordedDurationSec =
    parsedMovingSec > 0 && (parsedMovingSec < rawStreamDurationSec || topLevelDistOrTimeEdited)
      ? parsedMovingSec
      : rawStreamDurationSec;

  // Helper to regenerate 1km Run sections when Calibrated Distance or Moving Time is changed
  const regenerateRunSectionsForDistanceAndTime = (targetDistM: number, targetMovingSec: number) => {
    if (!isRun || targetDistM <= 0 || targetMovingSec <= 0) return;
    const previewStreams = cropStreamsAndScaleDistance(
      detailsRecord?.streams as Record<string, any> | undefined,
      targetMovingSec,
      targetDistM,
      originalMovingSec,
      targetMovingSec < rawStreamDurationSec || targetMovingSec < originalMovingSec
    );
    const tempAct: StravaActivity = {
      ...activity,
      distance: targetDistM,
      moving_time: Math.round(targetMovingSec),
      elapsed_time: Math.round(targetMovingSec),
      splits_metric: undefined,
    };
    const tempRec: StravaActivityDetailsRecord = {
      ...(detailsRecord || { id: String(activity.id) }),
      id: String(activity.id),
      streams: previewStreams,
      calibration: {
        ...(detailsRecord?.calibration || { isIgnoredFromTrainingStatus: false }),
        calibratedDistanceM: targetDistM,
        calibratedMovingTimeSec: Math.round(targetMovingSec),
      },
      activity: {
        ...((detailsRecord?.activity as Record<string, any>) || {}),
        distance: targetDistM,
        moving_time: Math.round(targetMovingSec),
        splits_metric: undefined,
      },
    };
    const chunks = generateAutoSplitsFromStreamsOrActivity(tempAct, tempRec, 1000);
    if (chunks.length > 0) {
      const nextSections: CalibratedRunSection[] = chunks.map((chunk, idx) => ({
        id: `split-1km-${chunk.splitIndex}-${idx}`,
        name: `Lap ${idx + 1}`,
        originalLapIndex: idx + 1,
        durationSec: chunk.movingTimeSec,
        speedKph: Number(((chunk.distanceM / Math.max(1, chunk.movingTimeSec)) * 3.6).toFixed(2)),
      }));
      setRunSections(nextSections);
    }
  };

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

  // Swim Laps Computed Totals & Handlers
  const activeSwimLaps = swimLaps.filter((l) => !l.isIgnored && !l.isRest && l.distanceM > 0);
  const nonIgnoredSwimLaps = swimLaps.filter((l) => !l.isIgnored);
  const totalSwimDistanceM = activeSwimLaps.reduce((acc, l) => acc + l.distanceM, 0);
  const totalSwimMovingSec = activeSwimLaps.reduce((acc, l) => acc + l.movingTimeSec, 0);
  const totalSwimElapsedSec = nonIgnoredSwimLaps.reduce((acc, l) => acc + l.movingTimeSec, 0);
  const avgSwimPaceSecPer100m =
    totalSwimDistanceM > 0 ? (totalSwimMovingSec / totalSwimDistanceM) * 100 : 0;
  const avgSwimPaceFormatted =
    avgSwimPaceSecPer100m > 0 ? formatSecondsToMinSec(avgSwimPaceSecPer100m) + '/100m' : '-';

  const swimLapsWithCad = activeSwimLaps.filter((l) => (l.strokeRateSpm || 0) > 0);
  const avgSwimStrokeRateSpm =
    swimLapsWithCad.length > 0
      ? Math.round(
          swimLapsWithCad.reduce((acc, l) => acc + (l.strokeRateSpm || 0) * l.movingTimeSec, 0) /
            Math.max(1, swimLapsWithCad.reduce((acc, l) => acc + l.movingTimeSec, 0))
        )
      : activity.average_cadence
        ? Math.round(activity.average_cadence)
        : 0;
  const totalSwimStrokes = activeSwimLaps.reduce(
    (acc, l) =>
      acc +
      (l.strokeRateSpm && l.strokeRateSpm > 0
        ? Math.round((l.strokeRateSpm * l.movingTimeSec) / 60)
        : l.totalStrokes || 0),
    0
  );

  const recalculateSwimTotals = (updatedLaps: CalibratedSwimLap[]) => {
    if (classification.category !== 'Swim') return;
    const active = updatedLaps.filter((l) => !l.isIgnored && !l.isRest && l.distanceM > 0);
    const sumDist = active.reduce((acc, l) => acc + l.distanceM, 0);
    const sumTime = active.reduce((acc, l) => acc + l.movingTimeSec, 0);

    setDistanceInput(sumDist > 0 ? sumDist.toString() : '0');
    setMovingTimeInput(formatSecondsToMinSec(sumTime));
  };

  const handleAddSwimLap = (isRestLap = false) => {
    const nextIdx = swimLaps.length + 1;
    const lastActive = [...swimLaps].reverse().find((l) => !l.isRest && l.distanceM > 0);
    const defaultDist = isRestLap ? 0 : lastActive?.distanceM || 100;
    const defaultTime = isRestLap ? 20 : lastActive?.movingTimeSec || 95;
    const defaultCad = isRestLap
      ? 0
      : lastActive?.strokeRateSpm || (activity.average_cadence ? Math.round(activity.average_cadence) : 28);
    const defaultHr = lastActive?.avgHr || (activity.average_heartrate ? Math.round(activity.average_heartrate) : undefined);
    const paceSec = !isRestLap && defaultDist > 0 ? (defaultTime / defaultDist) * 100 : 0;

    const newLap: CalibratedSwimLap = {
      lapIndex: nextIdx,
      originalLapIndex: lastActive?.originalLapIndex,
      distanceM: defaultDist,
      movingTimeSec: defaultTime,
      pacePer100mFormatted: isRestLap ? '' : formatSecondsToMinSec(paceSec) + '/100m',
      strokeRateSpm: defaultCad,
      totalStrokes: isRestLap ? 0 : Math.round((defaultCad * defaultTime) / 60),
      avgHr: defaultHr,
      isIgnored: false,
      isRest: isRestLap,
    };
    const updated = [...swimLaps, newLap];
    setSwimLaps(updated);
    recalculateSwimTotals(updated);
  };

  const handleRemoveSwimLap = (index: number) => {
    const updated = swimLaps
      .filter((_, i) => i !== index)
      .map((l, idx) => ({ ...l, lapIndex: idx + 1 }));
    setSwimLaps(updated);
    recalculateSwimTotals(updated);
  };

  // Work calculation preview for power
  const parsedWatts = parseFloat(avgWattsInput) || 0;
  const workPreview = isBikeOrTurbo && parsedWatts > 0
    ? calculateWorkKj(parsedWatts, parsedMovingSec)
    : null;

  // Run Section Handlers
  const syncTopInputsFromRunSections = (sections: CalibratedRunSection[]) => {
    if (sections.length === 0) return;
    const sumSec = sections.reduce((acc, s) => acc + (s.durationSec || 0), 0);
    const sumDistM = sections.reduce(
      (acc, s) => acc + ((s.speedKph || 0) / 3.6) * (s.durationSec || 0),
      0
    );
    if (sumDistM > 0) {
      setDistanceInput(isKm ? (sumDistM / 1000).toFixed(2) : Math.round(sumDistM).toString());
    }
    if (sumSec > 0) {
      setMovingTimeInput(formatSecondsToMinSec(Math.round(sumSec)));
    }
  };

  const handleLoad7SectionTemplate = () => {
    setTopLevelDistOrTimeEdited(false);
    setCustomRunLapsEdited(true);
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
    setTopLevelDistOrTimeEdited(false);
    setCustomRunLapsEdited(true);
    const nextIdx = runSections.length + 1;
    const lastSec = runSections.length > 0 ? runSections[runSections.length - 1] : undefined;
    const newSection: CalibratedRunSection = {
      id: String(Date.now()),
      name: `Lap ${nextIdx}`,
      originalLapIndex: lastSec?.originalLapIndex,
      durationSec: 180, // 3 min
      speedKph: lastSec?.speedKph || 11.0,
    };
    const updated = [...runSections, newSection];
    setRunSections(updated);
    syncTopInputsFromRunSections(updated);
  };

  const handleRemoveRunSection = (index: number) => {
    setTopLevelDistOrTimeEdited(false);
    setCustomRunLapsEdited(true);
    const updated = runSections.filter((_, i) => i !== index);
    setRunSections(updated);
    syncTopInputsFromRunSections(updated);
  };

  const handleUpdateRunSection = (
    index: number,
    field: keyof CalibratedRunSection,
    value: any
  ) => {
    setTopLevelDistOrTimeEdited(false);
    setCustomRunLapsEdited(true);
    const updated = runSections.map((sec, i) => {
      if (i !== index) return sec;
      return { ...sec, [field]: value };
    });
    setRunSections(updated);
    syncTopInputsFromRunSections(updated);
  };

  // Helper: Build the simulated speed, distance, per-lap stitched HR & cadence streams and new laps array for Run
  const buildSimulatedStreamsAndLaps = () => {
    const rawStreams = detailsRecord?.streams as Record<string, { data?: any[] }> | undefined;
    const originalHrStream = rawStreams?.heartrate?.data as number[] | undefined;
    const originalCadenceStream = rawStreams?.cadence?.data as number[] | undefined;

    const totalDur = Math.max(1, Math.round(totalSimulatedDurationSec));
    const timeStream: number[] = [];
    const speedStream: number[] = [];
    const distanceStream: number[] = [];
    const heartrateStream: number[] = [];
    const cadenceStream: number[] = [];

    let cumDist = 0;
    let currentSec = 0;

    const newLaps = computedRunSections.map((s, idx) => {
      const durSec = Math.max(1, Math.round(s.effectiveDurationSec || 1));
      const spdMps = Number(((s.speedKph || 0) / 3.6).toFixed(3));
      const origIdx = (s.originalLapIndex ?? idx + 1) - 1;
      const origSlice = origRunSlices[origIdx] ?? origRunSlices[Math.min(idx, Math.max(0, origRunSlices.length - 1))];

      // Stitch HR and Cadence for this specific lap:
      // Unchanged laps keep their exact original HR; extended laps repeat HR from the start of the lap
      const lapHr = stitchLapSeriesForDuration(
        origSlice?.hrSeries || [],
        durSec,
        origSlice?.avgHr ?? (activity.average_heartrate ? Math.round(activity.average_heartrate) : undefined)
      );
      const lapCad = stitchLapSeriesForDuration(
        origSlice?.cadenceSeries || [],
        durSec,
        origSlice?.avgCadence ?? (activity.average_cadence ? Math.round(activity.average_cadence) : undefined)
      );

      const startIdx = timeStream.length;
      for (let t = 0; t < durSec; t++) {
        if (timeStream.length > 0) {
          cumDist += spdMps;
        }
        timeStream.push(currentSec);
        speedStream.push(spdMps);
        distanceStream.push(Number(cumDist.toFixed(1)));
        if (lapHr[t] !== undefined && lapHr[t] > 30) {
          heartrateStream.push(lapHr[t]);
        } else if (originalHrStream?.[currentSec] !== undefined) {
          heartrateStream.push(originalHrStream[currentSec]);
        }
        if (lapCad[t] !== undefined && lapCad[t] > 0) {
          cadenceStream.push(lapCad[t]);
        } else if (originalCadenceStream?.[currentSec] !== undefined) {
          cadenceStream.push(originalCadenceStream[currentSec]);
        }
        currentSec++;
      }
      const endIdx = Math.max(startIdx, timeStream.length - 1);

      const lapAvgHr =
        lapHr.length > 0
          ? Math.round(lapHr.reduce((a, b) => a + b, 0) / lapHr.length)
          : origSlice?.avgHr;
      const lapMaxHr =
        lapHr.length > 0 ? Math.max(...lapHr, origSlice?.maxHr || 0) : origSlice?.maxHr;
      const lapAvgCad =
        lapCad.length > 0
          ? Math.round(lapCad.reduce((a, b) => a + b, 0) / lapCad.length)
          : origSlice?.avgCadence;

      return {
        id: Number(activity.id) * 100 + (idx + 1),
        resource_state: 2,
        name: s.name || `Lap ${idx + 1}`,
        activity: { id: activity.id },
        athlete: (activity as any).athlete || { id: 0 },
        elapsed_time: durSec,
        moving_time: durSec,
        start_date: activity.start_date,
        start_date_local: activity.start_date_local,
        distance: Math.round(s.distanceM * 10) / 10,
        start_index: startIdx,
        end_index: endIdx,
        total_elevation_gain: 0,
        average_speed: Number(spdMps.toFixed(2)),
        max_speed: Number(spdMps.toFixed(2)),
        average_heartrate: lapAvgHr,
        max_heartrate: lapMaxHr,
        average_cadence: lapAvgCad,
        lap_index: idx + 1,
        split: idx + 1,
      };
    });

    return {
      timeStream,
      speedStream,
      distanceStream,
      heartrateStream: heartrateStream.length > 0 ? heartrateStream : originalHrStream,
      cadenceStream: cadenceStream.length > 0 ? cadenceStream : originalCadenceStream,
      newLaps,
      totalDistanceM: totalSimulatedDistanceM > 0 ? totalSimulatedDistanceM : cumDist,
      totalDurationSec: totalDur,
    };
  };

  // Helper: Build the simulated speed, distance, per-lap stitched HR & stroke rate streams and new laps array for Pool Swim
  const buildSimulatedSwimStreamsAndLaps = () => {
    const validLaps = swimLaps.filter((l) => !l.isIgnored);
    const totalElapsed = Math.max(
      1,
      validLaps.reduce((acc, l) => acc + Math.max(1, Math.round(l.movingTimeSec || 0)), 0)
    );
    const totalMoving = Math.max(
      1,
      validLaps
        .filter((l) => !l.isRest && l.distanceM > 0)
        .reduce((acc, l) => acc + Math.max(1, Math.round(l.movingTimeSec || 0)), 0)
    );
    const totalDist = validLaps
      .filter((l) => !l.isRest && l.distanceM > 0)
      .reduce((acc, l) => acc + Math.max(0, l.distanceM || 0), 0);

    const timeStream: number[] = [];
    const speedStream: number[] = [];
    const distanceStream: number[] = [];
    const heartrateStream: number[] = [];
    const cadenceStream: number[] = [];

    let cumDist = 0;
    let currentSec = 0;
    let maxSpeedMps = 0;

    const newLaps = validLaps.map((lap, idx) => {
      const durSec = Math.max(1, Math.round(lap.movingTimeSec || 1));
      const isRest = Boolean(lap.isRest || lap.distanceM <= 0);
      const distM = isRest ? 0 : Math.max(0, lap.distanceM || 0);
      const spdMps = !isRest && durSec > 0 ? Number((distM / durSec).toFixed(3)) : 0;
      if (spdMps > maxSpeedMps) maxSpeedMps = spdMps;

      // Locate this lap's original HR & Cadence slice so other laps keep their exact original HR
      // and extended laps repeat HR from the start of the lap
      const origIdx = (lap.originalLapIndex ?? idx + 1) - 1;
      const origSlice =
        origSwimSlices[origIdx] ??
        origSwimSlices.find((s) => s.lapIndex === lap.lapIndex);

      const fallbackHr =
        lap.avgHr ??
        origSlice?.avgHr ??
        (activity.average_heartrate ? Math.round(activity.average_heartrate) : undefined);

      const lapHrSeries = stitchLapSeriesForDuration(
        origSlice?.hrSeries || [],
        durSec,
        fallbackHr
      );

      // For stroke rate (cadence): if user set or Strava provided strokeRateSpm, stitch or fill
      const targetSpm = isRest
        ? 0
        : lap.strokeRateSpm ??
          origSlice?.avgCadence ??
          (activity.average_cadence ? Math.round(activity.average_cadence) : 28);

      const userOverrodeSpm =
        !isRest &&
        lap.strokeRateSpm !== undefined &&
        origSlice?.avgCadence !== undefined &&
        lap.strokeRateSpm !== origSlice.avgCadence;

      const lapCadSeries = isRest
        ? Array(durSec).fill(0)
        : userOverrodeSpm
          ? Array(durSec).fill(Math.round(targetSpm))
          : stitchLapSeriesForDuration(origSlice?.cadenceSeries || [], durSec, targetSpm);

      const startIdx = timeStream.length;
      for (let t = 0; t < durSec; t++) {
        if (timeStream.length > 0) {
          cumDist += spdMps;
        }
        timeStream.push(currentSec);
        speedStream.push(spdMps);
        distanceStream.push(Number(cumDist.toFixed(1)));
        heartrateStream.push(lapHrSeries[t] ?? fallbackHr ?? 0);
        cadenceStream.push(isRest ? 0 : lapCadSeries[t] ?? targetSpm ?? 0);
        currentSec++;
      }
      const endIdx = Math.max(startIdx, timeStream.length - 1);

      const validLapHr = lapHrSeries.filter((h) => h > 30);
      const lapAvgHr =
        validLapHr.length > 0
          ? Math.round(validLapHr.reduce((a, b) => a + b, 0) / validLapHr.length)
          : fallbackHr;
      const lapMaxHr =
        validLapHr.length > 0
          ? Math.max(...validLapHr, lap.maxHr || origSlice?.maxHr || 0)
          : lap.maxHr ?? origSlice?.maxHr ?? lapAvgHr;
      const totalStrokes = isRest ? 0 : Math.round(((targetSpm || 0) * durSec) / 60);

      return {
        id: Number(activity.id) * 100 + (idx + 1),
        resource_state: 2,
        name: isRest ? `Rest ${idx + 1}` : `Lap ${idx + 1}`,
        activity: { id: activity.id },
        athlete: (activity as any).athlete || { id: 0 },
        elapsed_time: durSec,
        moving_time: durSec,
        start_date: activity.start_date,
        start_date_local: activity.start_date_local,
        distance: distM,
        start_index: startIdx,
        end_index: endIdx,
        total_elevation_gain: 0,
        average_speed: spdMps,
        max_speed: spdMps,
        average_heartrate: lapAvgHr,
        max_heartrate: lapMaxHr,
        average_cadence: isRest ? 0 : targetSpm,
        total_cycles: totalStrokes,
        lap_index: idx + 1,
        split: idx + 1,
      };
    });

    const hasValidHr = heartrateStream.some((h) => h > 30);
    const hasValidCad = cadenceStream.some((c) => c > 0);

    return {
      timeStream,
      speedStream,
      distanceStream,
      heartrateStream: hasValidHr ? heartrateStream : undefined,
      cadenceStream: hasValidCad ? cadenceStream : undefined,
      newLaps,
      totalDistanceM: totalDist > 0 ? totalDist : Math.round(cumDist),
      totalMovingSec: totalMoving,
      totalElapsedSec: totalElapsed,
      maxSpeedMps,
    };
  };

  // Download Corrected Swim FIT File
  const handleDownloadSwimFit = () => {
    const sim = buildSimulatedSwimStreamsAndLaps();

    const startTimestampMs = activity.start_date
      ? new Date(activity.start_date).getTime()
      : Date.now() - Math.round(sim.totalElapsedSec) * 1000;

    const fitBytes = generateSwimFitFile({
      activity,
      workoutName: `${activity.name} (Calibrated Pool Swim)`,
      startTimestampMs,
      totalElapsedSec: Math.round(sim.totalElapsedSec),
      totalMovingSec: Math.round(sim.totalMovingSec),
      totalDistanceM: Math.round(sim.totalDistanceM),
      poolLengthM: 25,
      timeStream: sim.timeStream,
      speedStream: sim.speedStream,
      distanceStream: sim.distanceStream,
      heartrateStream: sim.heartrateStream,
      cadenceStream: sim.cadenceStream,
      laps: swimLaps,
    });

    const safeFilename = `${activity.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_calibrated_swim.fit`;
    downloadRunFitFile(fitBytes, safeFilename);
  };

  // Upload Corrected Pool Swim to Strava
  const handleUploadSwimToStrava = async () => {
    if (!stravaToken) {
      setStravaUploadError('Strava access token is not available. Please connect or refresh your Strava account in Settings.');
      return;
    }

    setIsUploadingToStrava(true);
    setStravaUploadError(null);
    setStravaUploadSuccess(null);
    setUploadStatusMsg('Preparing corrected Pool Swim .FIT workout payload...');

    try {
      const sim = buildSimulatedSwimStreamsAndLaps();

      const startTimestampMs = activity.start_date
        ? new Date(activity.start_date).getTime()
        : Date.now() - Math.round(sim.totalElapsedSec) * 1000;

      const fitBytes = generateSwimFitFile({
        activity,
        workoutName: `${activity.name} (Calibrated Pool Swim)`,
        startTimestampMs,
        totalElapsedSec: Math.round(sim.totalElapsedSec),
        totalMovingSec: Math.round(sim.totalMovingSec),
        totalDistanceM: Math.round(sim.totalDistanceM),
        poolLengthM: 25,
        timeStream: sim.timeStream,
        speedStream: sim.speedStream,
        distanceStream: sim.distanceStream,
        heartrateStream: sim.heartrateStream,
        cadenceStream: sim.cadenceStream,
        laps: swimLaps,
      });

      const res = await uploadRunFitToStrava(
        fitBytes,
        `${activity.name} (Calibrated Pool Swim)`,
        stravaToken,
        `Calibrated pool swim with ${activeSwimLaps.length} active laps (${Math.round(sim.totalDistanceM)}m in ${formatSecondsToMinSec(sim.totalMovingSec)}). Per-lap HR & stroke rate preserved.`,
        (status: string) => setUploadStatusMsg(status),
        'Swim'
      );

      if (res.success) {
        if (res.activityId && String(res.activityId) !== String(activity.id)) {
          const calibrationPayload: ActivityCalibration = {
            isIgnoredFromTrainingStatus: false,
            calibratedDistanceM: Math.round(sim.totalDistanceM),
            calibratedMovingTimeSec: Math.round(sim.totalMovingSec),
            calibratedMaxHeartRate: maxHrInput ? parseInt(maxHrInput, 10) : undefined,
            calibratedAvgHeartRate: avgHrInput ? parseInt(avgHrInput, 10) : undefined,
            calibratedLaps: swimLaps,
            calibrationNotes:
              notes.trim() ||
              `Republished calibrated pool swim to Strava (#${res.activityId}); superseded original activity #${activity.id}.`,
          };

          const replaced = await replaceRepublishedStravaActivity({
            oldActivity: activity,
            newActivityId: res.activityId,
            calibratedName: `${activity.name} (Calibrated Pool Swim)`,
            calibratedDistanceM: Math.round(sim.totalDistanceM),
            calibratedMovingTimeSec: Math.round(sim.totalMovingSec),
            maxSpeedMps: sim.maxSpeedMps,
            calibration: calibrationPayload,
            newLaps: sim.newLaps,
            simulatedStreams: {
              timeStream: sim.timeStream,
              speedStream: sim.speedStream,
              distanceStream: sim.distanceStream,
              heartrateStream: sim.heartrateStream,
              cadenceStream: sim.cadenceStream,
            },
            existingDetails: detailsRecord,
          });

          onCalibrationSaved(replaced.newDetailsRecord);
        }

        setStravaUploadSuccess({
          uploadId: res.uploadId ?? 'uploaded',
          activityId: res.activityId,
        });
      } else {
        setStravaUploadError(res.error || 'Failed to upload pool swim workout to Strava');
      }
    } catch (err: any) {
      setStravaUploadError(err.message || 'An error occurred while uploading pool swim to Strava');
    } finally {
      setIsUploadingToStrava(false);
      setUploadStatusMsg('');
    }
  };

  // Download Corrected FIT File
  const handleDownloadFit = () => {
    const sim = buildSimulatedStreamsAndLaps();

    const startTimestampMs = activity.start_date
      ? new Date(activity.start_date).getTime()
      : Date.now() - Math.round(sim.totalDurationSec) * 1000;

    const fitBytes = generateRunFitFile({
      activity,
      workoutName: `${activity.name} (Treadmill Calibrated)`,
      startTimestampMs,
      totalDurationSec: Math.round(sim.totalDurationSec),
      totalDistanceM: Math.round(sim.totalDistanceM),
      timeStream: sim.timeStream,
      speedStream: sim.speedStream,
      distanceStream: sim.distanceStream,
      heartrateStream: sim.heartrateStream,
      cadenceStream: sim.cadenceStream,
      sections: computedRunSections,
    });

    const safeFilename = `${activity.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_calibrated.fit`;
    downloadRunFitFile(fitBytes, safeFilename);
  };

  // Upload Corrected Run to Strava
  const handleUploadToStrava = async () => {
    if (!stravaToken) {
      setStravaUploadError('Strava access token is not available. Please connect or refresh your Strava account in Settings.');
      return;
    }

    setIsUploadingToStrava(true);
    setStravaUploadError(null);
    setStravaUploadSuccess(null);
    setUploadStatusMsg('Preparing corrected .FIT workout payload...');

    try {
      const sim = buildSimulatedStreamsAndLaps();

      const startTimestampMs = activity.start_date
        ? new Date(activity.start_date).getTime()
        : Date.now() - Math.round(sim.totalDurationSec) * 1000;

      const fitBytes = generateRunFitFile({
        activity,
        workoutName: `${activity.name} (Calibrated Treadmill)`,
        startTimestampMs,
        totalDurationSec: Math.round(sim.totalDurationSec),
        totalDistanceM: Math.round(sim.totalDistanceM),
        timeStream: sim.timeStream,
        speedStream: sim.speedStream,
        distanceStream: sim.distanceStream,
        heartrateStream: sim.heartrateStream,
        cadenceStream: sim.cadenceStream,
        sections: computedRunSections,
      });

      const res = await uploadRunFitToStrava(
        fitBytes,
        `${activity.name} (Calibrated Treadmill)`,
        stravaToken,
        `Calibrated treadmill run with ${computedRunSections.length} structured laps. Speed/distance simulated; per-lap HR & cadence preserved.`,
        (status: string) => setUploadStatusMsg(status)
      );

      if (res.success) {
        if (res.activityId && String(res.activityId) !== String(activity.id)) {
          const calibrationPayload: ActivityCalibration = {
            isIgnoredFromTrainingStatus: false,
            calibratedDistanceM: Math.round(sim.totalDistanceM),
            calibratedMovingTimeSec: Math.round(totalSimulatedDurationSec),
            calibratedMaxHeartRate: maxHrInput ? parseInt(maxHrInput, 10) : undefined,
            calibratedAvgHeartRate: avgHrInput ? parseInt(avgHrInput, 10) : undefined,
            calibratedRunSections: computedRunSections,
            calibrationNotes:
              notes.trim() ||
              `Republished calibrated workout to Strava (#${res.activityId}); superseded original activity #${activity.id}.`,
          };

          const replaced = await replaceRepublishedStravaActivity({
            oldActivity: activity,
            newActivityId: res.activityId,
            calibratedName: `${activity.name} (Calibrated Treadmill)`,
            calibratedDistanceM: Math.round(sim.totalDistanceM),
            calibratedMovingTimeSec: Math.round(totalSimulatedDurationSec),
            maxSpeedMps: maxSimulatedSpeedKph / 3.6,
            calibration: calibrationPayload,
            newLaps: sim.newLaps,
            simulatedStreams: {
              timeStream: sim.timeStream,
              speedStream: sim.speedStream,
              distanceStream: sim.distanceStream,
              heartrateStream: sim.heartrateStream,
              cadenceStream: sim.cadenceStream,
            },
            existingDetails: detailsRecord,
          });

          onCalibrationSaved(replaced.newDetailsRecord);
        }

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
      setUploadStatusMsg('');
    }
  };

  // Save Calibration & Rebuild Streams in Local DB
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const targetActivityId = stravaUploadSuccess?.activityId || activity.id;
      let finalDistM = parsedDistM;
      let finalMovingSec = parsedMovingSec;

      // If run sections or swim laps were manually edited without overriding top-level Distance/Time, use simulated totals
      if (!topLevelDistOrTimeEdited) {
        if (isRun && runSections.length > 0 && customRunLapsEdited) {
          finalDistM = totalSimulatedDistanceM;
          finalMovingSec = Math.round(totalSimulatedDurationSec);
        } else if (isSwim && swimLaps.length > 0) {
          finalDistM = totalSwimDistanceM;
          finalMovingSec = Math.round(totalSwimMovingSec);
        }
      }

      finalDistM = Math.round(finalDistM);
      finalMovingSec = Math.round(finalMovingSec);

      const origDistM = Number(activity.distance || (detailsRecord?.activity as any)?.distance || 0);
      const origMovSec = Number(activity.moving_time || (detailsRecord?.activity as any)?.moving_time || 0);
      const origElapSec = Number(activity.elapsed_time || (detailsRecord?.activity as any)?.elapsed_time || origMovSec);
      const isDurationShorter =
        finalMovingSec > 0 &&
        ((origMovSec > 0 && finalMovingSec < origMovSec) ||
          (origElapSec > 0 && finalMovingSec < origElapSec) ||
          (rawStreamDurationSec > 0 && finalMovingSec < rawStreamDurationSec));
      const isDistanceChanged = finalDistM > 0 && Math.abs(finalDistM - origDistM) >= 1;

      const preserveCustomRunLaps = Boolean(isRun && runSections.length > 0 && customRunLapsEdited && !topLevelDistOrTimeEdited);

      const calibrationPayload: ActivityCalibration = {
        isIgnoredFromTrainingStatus: isIgnored,
        calibratedDistanceM: finalDistM > 0 ? finalDistM : undefined,
        calibratedMovingTimeSec: finalMovingSec > 0 ? finalMovingSec : undefined,
        calibratedMaxHeartRate: maxHrInput ? parseInt(maxHrInput, 10) : undefined,
        calibratedAvgHeartRate: avgHrInput ? parseInt(avgHrInput, 10) : undefined,
        calibratedAvgWatts: isBikeOrTurbo && avgWattsInput ? parseInt(avgWattsInput, 10) : undefined,
        calibratedNormalizedPower: isBikeOrTurbo && npWattsInput ? parseInt(npWattsInput, 10) : undefined,
        calibratedLaps: isSwim && swimLaps.length > 0 ? swimLaps : undefined,
        calibratedRunSections:
          isRun && runSections.length > 0
            ? preserveCustomRunLaps
              ? runSections
              : undefined
            : undefined,
        calibrationNotes: notes.trim() || undefined,
        replacesActivityId:
          stravaUploadSuccess?.activityId && String(stravaUploadSuccess.activityId) !== String(activity.id)
            ? String(activity.id)
            : detailsRecord?.calibration?.replacesActivityId,
      };

      // 1. Save calibration metadata
      let updatedRecord = await saveActivityCalibration(targetActivityId, calibrationPayload);

      // 2. If custom run sections or swim laps are defined, rebuild the local streams & overwrite laps so the UI & charts update instantly
      if (preserveCustomRunLaps) {
        const sim = buildSimulatedStreamsAndLaps();
        updatedRecord = await updateStravaActivityRecord(targetActivityId, (record) => {
          const croppedOtherStreams =
            cropStreamsAndScaleDistance(
              record.streams as Record<string, any> | undefined,
              Math.round(totalSimulatedDurationSec),
              sim.totalDistanceM,
              origMovSec,
              isDurationShorter
            ) || {};
          const currentActivity = (record.activity || {}) as Record<string, any>;

          return {
            ...record,
            activity: {
              ...currentActivity,
              distance: sim.totalDistanceM,
              moving_time: Math.round(totalSimulatedDurationSec),
              elapsed_time: isDurationShorter
                ? Math.round(totalSimulatedDurationSec)
                : Math.max(Math.round(totalSimulatedDurationSec), Number(currentActivity.elapsed_time) || 0),
              laps: sim.newLaps,
            },
            streams: {
              ...croppedOtherStreams,
              time: {
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
              ...(sim.heartrateStream && sim.heartrateStream.length > 0
                ? {
                    heartrate: {
                      data: sim.heartrateStream,
                      series_type: 'distance',
                      original_size: sim.heartrateStream.length,
                      resolution: 'high',
                    },
                  }
                : {}),
              ...(sim.cadenceStream && sim.cadenceStream.length > 0
                ? {
                    cadence: {
                      data: sim.cadenceStream,
                      series_type: 'distance',
                      original_size: sim.cadenceStream.length,
                      resolution: 'high',
                    },
                  }
                : {}),
            },
          };
        });
      } else if (isSwim && swimLaps.length > 0) {
        const sim = buildSimulatedSwimStreamsAndLaps();
        updatedRecord = await updateStravaActivityRecord(targetActivityId, (record) => {
          const croppedOtherStreams =
            cropStreamsAndScaleDistance(
              record.streams as Record<string, any> | undefined,
              Math.round(sim.totalElapsedSec),
              sim.totalDistanceM,
              origMovSec,
              isDurationShorter
            ) || {};
          const currentActivity = (record.activity || {}) as Record<string, any>;

          return {
            ...record,
            activity: {
              ...currentActivity,
              distance: sim.totalDistanceM,
              moving_time: Math.round(sim.totalMovingSec),
              elapsed_time: Math.round(sim.totalElapsedSec),
              average_cadence: avgSwimStrokeRateSpm > 0 ? avgSwimStrokeRateSpm : currentActivity.average_cadence,
              laps: sim.newLaps,
            },
            streams: {
              ...croppedOtherStreams,
              time: {
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
              ...(sim.heartrateStream && sim.heartrateStream.length > 0
                ? {
                    heartrate: {
                      data: sim.heartrateStream,
                      series_type: 'distance',
                      original_size: sim.heartrateStream.length,
                      resolution: 'high',
                    },
                  }
                : {}),
              ...(sim.cadenceStream && sim.cadenceStream.length > 0
                ? {
                    cadence: {
                      data: sim.cadenceStream,
                      series_type: 'distance',
                      original_size: sim.cadenceStream.length,
                      resolution: 'high',
                    },
                  }
                : {}),
            },
          };
        });
      }

      // 3. Always apply stream cropping (when duration is shorter), distance scaling, and 1km (Run) / 2km (Bike) split regeneration
      if (finalDistM > 0 && finalMovingSec > 0 && (isDistanceChanged || isDurationShorter || topLevelDistOrTimeEdited)) {
        updatedRecord = await applyCalibratedDistanceAndDurationToRecord({
          activity,
          targetActivityId,
          finalDistM,
          finalMovingSec,
          isDurationShorter,
          isDistanceChanged: isDistanceChanged || topLevelDistOrTimeEdited,
          preserveCustomRunLaps,
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

  const [confirmingReset, setConfirmingReset] = useState(false);

  const handleResetToStrava = async () => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    setIsSaving(true);
    setConfirmingReset(false);
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
                    onChange={(e) => {
                      const val = e.target.value;
                      setDistanceInput(val);
                      setTopLevelDistOrTimeEdited(true);
                      setCustomRunLapsEdited(false);
                      const nextDistM = isKm
                        ? (parseFloat(val) || 0) * 1000
                        : parseFloat(val) || 0;
                      if (isRun && nextDistM > 0 && parsedMovingSec > 0) {
                        regenerateRunSectionsForDistanceAndTime(nextDistM, parsedMovingSec);
                      }
                    }}
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
                  Moving Time (mm:ss)
                </label>
                <MovingTimeBoxInput
                  valueStr={movingTimeInput}
                  defaultSec={originalMovingSec}
                  onChange={(newTimeStr) => {
                    setMovingTimeInput(newTimeStr);
                    setTopLevelDistOrTimeEdited(true);
                    setCustomRunLapsEdited(false);
                    const nextMovingSec = parseMinSecToSeconds(newTimeStr, originalMovingSec);
                    if (isRun && parsedDistM > 0 && nextMovingSec > 0) {
                      regenerateRunSectionsForDistanceAndTime(parsedDistM, nextMovingSec);
                    } else if (isSwim && swimLaps.length > 0 && nextMovingSec > 0 && nextMovingSec < totalSwimMovingSec) {
                      // Crop swim laps when a shorter moving time is entered
                      let accSec = 0;
                      const croppedSwim: CalibratedSwimLap[] = [];
                      for (let i = 0; i < swimLaps.length; i++) {
                        const l = swimLaps[i];
                        if (l.isIgnored) {
                          croppedSwim.push(l);
                          continue;
                        }
                        if (l.isRest || l.distanceM <= 0) {
                          if (accSec < nextMovingSec) croppedSwim.push(l);
                          continue;
                        }
                        if (accSec >= nextMovingSec) break;
                        if (accSec + l.movingTimeSec <= nextMovingSec) {
                          croppedSwim.push(l);
                          accSec += l.movingTimeSec;
                        } else {
                          const remSec = Math.max(1, Math.round(nextMovingSec - accSec));
                          const ratio = l.movingTimeSec > 0 ? remSec / l.movingTimeSec : 1;
                          const remDist = Math.max(25, Math.round((l.distanceM * ratio) / 25) * 25);
                          const paceSec = (remSec / remDist) * 100;
                          croppedSwim.push({
                            ...l,
                            movingTimeSec: remSec,
                            distanceM: remDist,
                            pacePer100mFormatted: formatSecondsToMinSec(paceSec) + '/100m',
                          });
                          accSec += remSec;
                          break;
                        }
                      }
                      if (croppedSwim.length > 0) {
                        setSwimLaps(croppedSwim.map((l, idx) => ({ ...l, lapIndex: idx + 1 })));
                      }
                    }
                  }}
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
          {isSwim && (
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-sky-500/30 space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-sky-500/15 border border-sky-500/30">
                    <Waves className="w-4 h-4 text-sky-400" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-sky-300 uppercase tracking-wider">
                      Pool Swim Lap Calibration ({swimLaps.length} Laps)
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Edit lap distance, time, or stroke rate. Extending a lap keeps original HR for all other laps and repeats HR from the start of the extended lap.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleAddSwimLap(false)}
                    className="px-2.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-[11px] cursor-pointer transition-all flex items-center gap-1 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Add Lap</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddSwimLap(true)}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] cursor-pointer transition-all flex items-center gap-1 border border-slate-700"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Rest</span>
                  </button>
                </div>
              </div>

              {swimLaps.length > 0 && (
                <div className="space-y-2 max-h-[750px] overflow-y-auto pr-1">
                  {swimLaps.map((lap, index) => {
                    const isRestLap = Boolean(lap.isRest || lap.distanceM <= 0);
                    const origIdx = (lap.originalLapIndex ?? index + 1) - 1;
                    const origSlice = origSwimSlices[origIdx];
                    const origDurSec = origSlice?.origDurationSec || 0;
                    const extendedHrSec =
                      origDurSec > 0 && lap.movingTimeSec > origDurSec
                        ? Math.round(lap.movingTimeSec - origDurSec)
                        : 0;
                    const displayHr = lap.avgHr ?? origSlice?.avgHr;

                    return (
                      <div
                        key={`${lap.lapIndex}-${index}`}
                        className={`p-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-xs transition-colors ${
                          lap.isIgnored || isRestLap
                            ? 'bg-slate-950/40 border-slate-800/40 opacity-60'
                            : 'bg-slate-900/80 border-slate-800'
                        }`}
                      >
                        <div className="w-16 shrink-0 flex flex-col">
                          <span className={`font-mono font-bold ${isRestLap ? 'text-slate-500' : 'text-slate-200'}`}>
                            {isRestLap ? `Rest ${lap.lapIndex}` : `Lap ${lap.lapIndex}`}
                          </span>
                          {displayHr && displayHr > 30 ? (
                            <span
                              className="text-[10px] font-mono text-rose-400 flex items-center gap-0.5"
                              title={
                                extendedHrSec > 0
                                  ? `Avg ${displayHr} bpm • Extended by +${extendedHrSec}s (repeats HR from start of Lap ${lap.lapIndex}; other laps untouched)`
                                  : `Original Lap HR: ${displayHr} bpm avg`
                              }
                            >
                              <Heart className="w-2.5 h-2.5 shrink-0" />
                              <span>{displayHr}</span>
                              {extendedHrSec > 0 && (
                                <span className="text-emerald-400 font-bold" title="Extended lap: repeats HR from lap start">
                                  +{extendedHrSec}s
                                </span>
                              )}
                            </span>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-1">
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

                        <div className="flex items-center gap-1">
                          <LapDurationInput
                            durationSec={lap.movingTimeSec}
                            disabled={lap.isIgnored}
                            onCommit={(timeSec) => {
                              const updated = swimLaps.map((l, i) => {
                                if (i !== index) return l;
                                const dist = l.distanceM || 0;
                                const isRest = Boolean(l.isRest || dist <= 0);
                                const paceSec = !isRest && dist > 0 ? (timeSec / dist) * 100 : 0;
                                const spm = l.strokeRateSpm || 0;
                                return {
                                  ...l,
                                  movingTimeSec: timeSec,
                                  totalStrokes: !isRest && spm > 0 ? Math.round((spm * timeSec) / 60) : l.totalStrokes,
                                  pacePer100mFormatted: isRest ? '' : formatSecondsToMinSec(paceSec) + '/100m',
                                };
                              });
                              setSwimLaps(updated);
                              recalculateSwimTotals(updated);
                            }}
                          />
                          <span className="text-slate-500 text-[10px]">time</span>
                        </div>

                        {/* Stroke Rate (spm) from Strava lap / cadence stream */}
                        {!isRestLap ? (
                          <div className="flex items-center gap-1" title="Stroke rate (strokes/min) from Strava">
                            <input
                              type="number"
                              min="0"
                              max="90"
                              step="1"
                              value={lap.strokeRateSpm ?? ''}
                              placeholder="--"
                              disabled={lap.isIgnored}
                              onChange={(e) => {
                                const spm = Math.max(0, parseInt(e.target.value, 10) || 0);
                                const updated = swimLaps.map((l, i) => {
                                  if (i !== index) return l;
                                  return {
                                    ...l,
                                    strokeRateSpm: spm > 0 ? spm : undefined,
                                    totalStrokes: spm > 0 ? Math.round((spm * l.movingTimeSec) / 60) : undefined,
                                  };
                                });
                                setSwimLaps(updated);
                              }}
                              className="w-12 px-1.5 py-1 bg-slate-950 border border-slate-700 rounded-lg text-amber-300 font-mono text-center text-xs disabled:opacity-40"
                            />
                            <span className="text-slate-500 text-[10px]">spm</span>
                          </div>
                        ) : (
                          <div className="w-16 text-center text-[10px] font-mono text-slate-600">
                            0 spm
                          </div>
                        )}

                        {lap.isIgnored || isRestLap ? (
                          <span className="font-mono font-bold text-[11px] min-w-16 text-right text-slate-500">
                            {lap.isIgnored ? 'Ignored' : 'Rest'}
                          </span>
                        ) : (
                          <LapPaceInput
                            paceSec={lap.distanceM > 0 ? Math.round((lap.movingTimeSec / lap.distanceM) * 100) : 0}
                            unitSuffix="/100m"
                            onCommitPaceSec={(newPaceSec) => {
                              const updated = swimLaps.map((l, i) => {
                                if (i !== index) return l;
                                const dist = l.distanceM || 0;
                                const nextTimeSec = dist > 0 ? Math.max(1, Math.round((newPaceSec * dist) / 100)) : l.movingTimeSec;
                                const spm = l.strokeRateSpm || 0;
                                return {
                                  ...l,
                                  movingTimeSec: nextTimeSec,
                                  totalStrokes: spm > 0 ? Math.round((spm * nextTimeSec) / 60) : l.totalStrokes,
                                  pacePer100mFormatted: formatSecondsToMinSec(newPaceSec) + '/100m',
                                };
                              });
                              setSwimLaps(updated);
                              recalculateSwimTotals(updated);
                            }}
                          />
                        )}

                        <div className="flex items-center gap-1 shrink-0">
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

                          {swimLaps.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveSwimLap(index)}
                              className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer transition-colors"
                              title={`Remove Lap ${lap.lapIndex}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Calibrated Pool Swim Result & Strava Re-Upload Card */}
              {swimLaps.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-sky-950/40 via-slate-900 to-slate-950 border border-sky-500/30 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Calibrated Pool Swim Profile Result</span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {activeSwimLaps.length} active {activeSwimLaps.length === 1 ? 'lap' : 'laps'} • 25m lengths
                      {avgSwimStrokeRateSpm > 0 ? ` • ${avgSwimStrokeRateSpm} spm (${totalSwimStrokes} strokes)` : ''}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-medium">Corrected distance</span>
                      <span className="text-base sm:text-lg font-black font-mono text-sky-400">
                        {totalSwimDistanceM} m
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-medium">Average pace</span>
                      <span className="text-base sm:text-lg font-black font-mono text-white">
                        {avgSwimPaceFormatted}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-medium">Moving swim time</span>
                      <span className="text-base sm:text-lg font-black font-mono text-white">
                        {formatSecondsToMinSec(Math.round(totalSwimMovingSec))}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-medium">
                        {avgSwimStrokeRateSpm > 0 ? 'Avg stroke rate' : 'Elapsed (inc. rest)'}
                      </span>
                      <span className="text-base sm:text-lg font-black font-mono text-amber-400">
                        {avgSwimStrokeRateSpm > 0
                          ? `${avgSwimStrokeRateSpm} spm`
                          : formatSecondsToMinSec(Math.round(totalSwimElapsedSec))}
                      </span>
                    </div>
                  </div>

                  {/* FIT Actions Bar for Pool Swim */}
                  <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] text-slate-400">
                      Preserves original HR per lap (repeating lap-start HR on extended laps) &amp; encodes 25m FIT lengths + stroke rate.
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDownloadSwimFit}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs cursor-pointer transition-all flex items-center gap-1.5 border border-slate-700 shadow-xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Corrected .FIT</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleUploadSwimToStrava}
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
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <div className="font-bold text-emerald-300">
                            Successfully republished Pool Swim to Strava!
                            {stravaUploadSuccess.activityId ? ` (New ID #${stravaUploadSuccess.activityId})` : ''}
                          </div>
                          {stravaUploadSuccess.activityId && String(stravaUploadSuccess.activityId) !== String(activity.id) && (
                            <div className="text-[11px] text-emerald-200/80">
                              Updated app activity to new Strava ID #{stravaUploadSuccess.activityId} and flagged original activity #{activity.id} as deleted/hidden.
                            </div>
                          )}
                        </div>
                      </div>
                      {stravaUploadSuccess.activityId && (
                        <a
                          href={`https://www.strava.com/activities/${stravaUploadSuccess.activityId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 rounded-lg bg-emerald-500 text-slate-950 font-black text-[10px] flex items-center gap-1 hover:bg-emerald-400 transition-colors shrink-0"
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
          {/* LAPS SECTION (INDOOR / TREADMILL RUN WORKOUT SIMULATOR)                    */}
          {/* Placed directly above the Calibration Reason section as requested         */}
          {/* ========================================================================= */}
          {isRun && (
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-emerald-500/30 space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-800/80">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 shrink-0">
                    <Layers className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                      Laps & Simulated Speed
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      {sectionsFromStravaLaps.length > 0
                        ? `Loaded ${sectionsFromStravaLaps.length} Strava lap${sectionsFromStravaLaps.length === 1 ? '' : 's'} with recorded duration and pace. Edit as needed; HR, cadence & timestamps are preserved.`
                        : detailsRecord?.lapsError
                          ? `Could not load Strava lap times: ${detailsRecord.lapsError}`
                          : 'No Strava laps found. Click +Add Lap to build workout intervals; HR, cadence & timestamps are preserved.'}
                    </p>
                  </div>
                </div>

                {/* +Add Lap and Clear buttons aligned directly to the right of the header text */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={handleAddRunSection}
                    className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-[11px] cursor-pointer transition-all flex items-center gap-1 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Add Lap</span>
                  </button>

                  {runSections.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setRunSections([])}
                      className="px-2 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 text-[11px] font-bold cursor-pointer transition-all border border-slate-700 shadow-sm"
                      title="Clear laps"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Sections Table - Displays up to 15 laps before scrollbar appears */}
              {runSections.length === 0 ? (
                <div className="text-center py-5 px-3 rounded-xl bg-slate-900/60 border border-dashed border-slate-800 space-y-2">
                  <Play className="w-6 h-6 text-slate-600 mx-auto" />
                  <p className="text-xs text-slate-400 font-medium">
                    No custom laps defined yet. Click &ldquo;+Add Lap&rdquo; to build your treadmill intervals.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5 min-h-[180px] max-h-[750px] overflow-y-auto pr-1">
                  <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 pb-0.5">
                    <span className="w-11 sm:w-13 shrink-0">Lap</span>
                    <span className="w-[70px] sm:w-[78px] shrink-0 text-center">Duration</span>
                    <span className="w-20 sm:w-24 shrink-0 text-center">Speed</span>
                    <span className="w-[70px] sm:w-[78px] shrink-0 text-center">Pace</span>
                    <span className="flex-1 text-right">Dist</span>
                    <span className="w-6 shrink-0"></span>
                  </div>

                  {runSections.map((sec, idx) => {
                    const computed = computedRunSections[idx];
                    const isLast = idx === runSections.length - 1;
                    const isAlternate = idx % 2 === 1;

                    return (
                      <div
                        key={sec.id || idx}
                        style={isAlternate ? { backgroundColor: '#d3f0ff' } : undefined}
                        className={`px-2 py-1.5 rounded-xl border text-xs transition-colors flex items-center gap-1.5 sm:gap-2 shadow-xs ${
                          isAlternate
                            ? 'border-sky-300 text-slate-900'
                            : isLast && timeDiscrepancySec > 0.05
                            ? 'bg-emerald-950/20 border-emerald-500/40 text-white'
                            : 'bg-slate-900/90 border-slate-800 text-white'
                        }`}
                      >
                        {/* Fixed Lap Label */}
                        <div className="w-11 sm:w-13 shrink-0 flex items-center">
                          <span
                            className={`font-bold font-mono text-xs ${
                              isAlternate ? 'text-slate-900' : 'text-white'
                            }`}
                          >
                            Lap {idx + 1}
                          </span>
                        </div>

                        {/* Duration: Dual numeric entry boxes (min : sec) */}
                        <div className="w-[70px] sm:w-[78px] shrink-0 flex justify-center">
                          <LapDurationInput
                            durationSec={sec.durationSec}
                            isLastAutoExtended={isLast}
                            timeDiscrepancySec={timeDiscrepancySec}
                            onCommit={(newSec) => handleUpdateRunSection(idx, 'durationSec', newSec)}
                            isAlternate={isAlternate}
                          />
                        </div>

                        {/* Speed: Clean kph numeric input */}
                        <LapSpeedInput
                          speedKph={sec.speedKph || 0}
                          onCommit={(newSpd) => handleUpdateRunSection(idx, 'speedKph', newSpd)}
                          isAlternate={isAlternate}
                        />

                        {/* Pace: Dual numeric entry boxes (min : sec) synced with Speed */}
                        <div className="w-[70px] sm:w-[78px] shrink-0 flex justify-center">
                          <LapPaceInput
                            paceSec={sec.speedKph && sec.speedKph > 0 ? Math.round(3600 / sec.speedKph) : 0}
                            isAlternate={isAlternate}
                            onCommitPaceSec={(newPaceSec) => {
                              if (newPaceSec > 0) {
                                const newSpd = Number((3600 / newPaceSec).toFixed(2));
                                handleUpdateRunSection(idx, 'speedKph', newSpd);
                              }
                            }}
                          />
                        </div>

                        {/* Distance for this segment */}
                        <div
                          className={`flex-1 text-right font-mono text-[11px] truncate ${
                            isAlternate ? 'text-slate-800 font-bold' : 'text-slate-300'
                          }`}
                        >
                          {((computed?.distanceM || 0) / 1000).toFixed(2)}km
                        </div>

                        {/* Delete action */}
                        <div className="w-6 shrink-0 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveRunSection(idx)}
                            className={`p-1 rounded cursor-pointer transition-colors ${
                              isAlternate
                                ? 'text-slate-600 hover:text-rose-600 hover:bg-rose-500/20'
                                : 'text-slate-500 hover:text-rose-400 hover:bg-rose-500/10'
                            }`}
                            title={`Remove Lap ${idx + 1}`}
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
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <div className="font-bold text-emerald-300">
                            Successfully republished to Strava!
                            {stravaUploadSuccess.activityId ? ` (New ID #${stravaUploadSuccess.activityId})` : ''}
                          </div>
                          {stravaUploadSuccess.activityId && String(stravaUploadSuccess.activityId) !== String(activity.id) && (
                            <div className="text-[11px] text-emerald-200/80">
                              Updated app activity to new Strava ID #{stravaUploadSuccess.activityId} and flagged original activity #{activity.id} as deleted/hidden.
                            </div>
                          )}
                        </div>
                      </div>
                      {stravaUploadSuccess.activityId && (
                        <a
                          href={`https://www.strava.com/activities/${stravaUploadSuccess.activityId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 rounded-lg bg-emerald-500 text-slate-950 font-black text-[10px] flex items-center gap-1 hover:bg-emerald-400 transition-colors shrink-0"
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
        <div className="p-3.5 sm:p-5 border-t border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          {existingCalib ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleResetToStrava}
                disabled={isSaving}
                className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  confirmingReset
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : 'bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>{confirmingReset ? 'Confirm Reset?' : 'Reset'}</span>
              </button>
              {confirmingReset && (
                <button
                  type="button"
                  onClick={() => setConfirmingReset(false)}
                  className="px-2.5 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
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
            className="px-4 sm:px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer active:scale-95 disabled:opacity-50 ml-auto"
          >
            {saveSuccessMsg ? (
              <>
                <Check className="w-4 h-4 stroke-[3] shrink-0" />
                <span>Saved & Applied!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 shrink-0" />
                <span className="sm:hidden">Save Calibration</span>
                <span className="hidden sm:inline">Save Calibration & Rebuild Streams</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
