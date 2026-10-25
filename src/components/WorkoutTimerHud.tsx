import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Flag, Timer as TimerIcon, ChevronDown, ChevronUp, Check, Edit2 } from 'lucide-react';

interface WorkoutTimerHudProps {
  workoutStartTime: number;
  initialDurationSeconds?: number;
  isPaused: boolean;
  onTogglePause: () => void;
  onLapTriggered?: (lapDurationSec: number) => void;
  onTotalDurationChanged?: (newDurationSec: number) => void;
}

export const WorkoutTimerHud: React.FC<WorkoutTimerHudProps> = ({
  workoutStartTime,
  initialDurationSeconds,
  isPaused,
  onTogglePause,
  onLapTriggered,
  onTotalDurationChanged,
}) => {
  const [totalSeconds, setTotalSeconds] = useState(() => {
    if (typeof initialDurationSeconds === 'number' && initialDurationSeconds > 0) {
      return initialDurationSeconds;
    }
    return Math.max(0, Math.floor((Date.now() - workoutStartTime) / 1000));
  });
  const [lapSeconds, setLapSeconds] = useState(0);
  const [lapHistory, setLapHistory] = useState<{ id: number; lapTime: number; totalTime: number }[]>([]);
  const [showLapDrawer, setShowLapDrawer] = useState(false);

  // Editing state for paused total time
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [editMinutes, setEditMinutes] = useState('0');
  const [editSeconds, setEditSeconds] = useState('0');

  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setTotalSeconds((prev) => prev + 1);
      setLapSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isPaused]);

  const handleLap = () => {
    const currentLap = lapSeconds;
    const newRecord = {
      id: lapHistory.length + 1,
      lapTime: currentLap,
      totalTime: totalSeconds,
    };
    setLapHistory((prev) => [newRecord, ...prev]);
    setLapSeconds(0);
    if (onLapTriggered) {
      onLapTriggered(currentLap);
    }
  };

  const handleResetLapOnly = () => {
    setLapSeconds(0);
  };

  const formatHMS = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleStartEditTime = () => {
    if (!isPaused) return;
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    setEditMinutes(String(m));
    setEditSeconds(String(s).padStart(2, '0'));
    setIsEditingTime(true);
  };

  const handleSaveEditTime = () => {
    const m = Math.max(0, parseInt(editMinutes, 10) || 0);
    const s = Math.min(59, Math.max(0, parseInt(editSeconds, 10) || 0));
    const newTotal = (m * 60) + s;
    setTotalSeconds(newTotal);
    if (onTotalDurationChanged) {
      onTotalDurationChanged(newTotal);
    }
    setIsEditingTime(false);
  };

  return (
    <div className="timer-hud-container w-full bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-slate-100 px-2 sm:px-4 py-2 sm:py-2.5 shadow-lg sticky top-0 z-30">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-1 sm:gap-3 flex-nowrap">
        {/* Continuous Running Total Time (Left Symmetrical Pane) */}
        <div className="timer-lap-badge flex items-center gap-1.5 sm:gap-2 bg-slate-950/80 py-1 px-1.5 sm:px-2 rounded-xl border border-slate-800 shrink-0">
          <div className="timer-subtle-btn w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-800 flex items-center justify-center text-amber-400 border border-slate-700/80 shrink-0">
            <TimerIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          </div>

          <div className="flex flex-col min-w-0">
            <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-slate-400 leading-none truncate">
              Total {isPaused ? <span className="text-amber-400 font-semibold">(Paused)</span> : ''}
            </span>

            {/* Clickable Time or Inline Time Editor */}
            {isEditingTime ? (
              <div className="flex items-center gap-1 mt-0.5 animate-fade-in">
                <input
                  type="number"
                  min="0"
                  max="999"
                  value={editMinutes}
                  onChange={(e) => setEditMinutes(e.target.value)}
                  className="w-10 sm:w-12 px-1 py-0.5 rounded bg-slate-950 border border-amber-400/80 text-white font-mono font-bold text-xs sm:text-sm text-center focus:outline-none"
                  placeholder="Min"
                />
                <span className="text-slate-400 font-bold">:</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={editSeconds}
                  onChange={(e) => setEditSeconds(e.target.value)}
                  className="w-8 sm:w-10 px-1 py-0.5 rounded bg-slate-950 border border-amber-400/80 text-white font-mono font-bold text-xs sm:text-sm text-center focus:outline-none"
                  placeholder="Sec"
                />
                <button
                  type="button"
                  onClick={handleSaveEditTime}
                  className="p-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold ml-0.5 transition-colors cursor-pointer"
                  title="Save duration"
                >
                  <Check className="w-3 h-3 stroke-[3] shrink-0" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleStartEditTime}
                disabled={!isPaused}
                title={isPaused ? 'Click to edit workout duration' : 'Pause workout to edit duration'}
                className={`text-left flex items-center gap-1 ${
                  isPaused ? 'cursor-pointer group' : 'cursor-default'
                }`}
              >
                <span className="text-base sm:text-xl md:text-2xl font-black font-mono tabular-nums text-white tracking-tight group-hover:text-amber-300 transition-colors">
                  {formatHMS(totalSeconds)}
                </span>
                {isPaused && (
                  <span className="text-[9px] text-amber-400 bg-amber-400/10 px-1 py-0.2 rounded border border-amber-400/20 font-sans flex items-center gap-0.5">
                    <Edit2 className="w-2 h-2 shrink-0" />
                    <span className="hidden sm:inline">Edit</span>
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Pause / Resume Button: Sleek icon-only toggle */}
          <button
            type="button"
            onClick={onTogglePause}
            title={isPaused ? 'Resume workout timer' : 'Pause workout timer'}
            aria-label={isPaused ? 'Resume workout timer' : 'Pause workout timer'}
            className={`h-[30px] w-[30px] sm:h-[34px] sm:w-[34px] rounded-lg font-bold flex items-center justify-center active:scale-95 transition-all cursor-pointer shrink-0 ${
              isPaused
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'timer-subtle-btn bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80'
            }`}
          >
            {isPaused ? (
              <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-slate-950 shrink-0" />
            ) : (
              <Pause className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            )}
          </button>
        </div>

        {/* Lap / Interval Time and Lap History (Right Symmetrical Pane) */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <div className="timer-lap-badge flex items-center gap-1 sm:gap-1.5 bg-slate-950/80 py-1 px-1.5 sm:px-2 rounded-xl border border-slate-800 shrink-0">
            <div className="flex flex-col text-right">
              <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-amber-400 leading-none">
                Lap
              </span>
              <span className="text-base sm:text-xl md:text-2xl font-black font-mono tabular-nums text-amber-400 tracking-tight">
                {formatHMS(lapSeconds)}
              </span>
            </div>

            {/* Tactile Lap Button */}
            <button
              type="button"
              onClick={handleLap}
              title="Record lap split and restart interval timer"
              className="h-[30px] sm:h-[34px] px-2.5 sm:px-3 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-1 shadow-md shadow-amber-500/20 transition-all cursor-pointer shrink-0"
            >
              <Flag className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-slate-950 shrink-0" />
              <span>Lap</span>
            </button>

            {/* Reset Lap Timer Button */}
            <button
              type="button"
              onClick={handleResetLapOnly}
              title="Reset lap timer to 0:00"
              className="timer-subtle-btn h-[30px] w-[30px] sm:h-[34px] sm:w-[34px] rounded-lg bg-slate-700/90 hover:bg-slate-600 active:bg-slate-500 text-slate-100 border border-slate-600/80 shadow-sm flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            </button>

            {/* Lap Drawer Toggle Button - same size as Reset button and inside the same pane */}
            {lapHistory.length > 0 && (
              <button
                type="button"
                onClick={() => setShowLapDrawer(!showLapDrawer)}
                title={`Lap history (${lapHistory.length} splits)`}
                aria-label="Toggle lap splits"
                className="timer-subtle-btn h-[30px] w-[30px] sm:h-[34px] sm:w-[34px] rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/80 shadow-sm flex items-center justify-center transition-colors shrink-0 cursor-pointer"
              >
                {showLapDrawer ? (
                  <ChevronUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expandable Lap Splits Drawer */}
      {showLapDrawer && lapHistory.length > 0 && (
        <div className="max-w-4xl mx-auto mt-2 pt-2 border-t border-slate-800/80 animate-fade-in">
          <div className="text-[11px] font-semibold text-slate-400 mb-1 flex justify-between">
            <span>Recorded Laps & Rest Intervals</span>
            <span>Total at split</span>
          </div>
          <div className="max-h-28 overflow-y-auto space-y-1 pr-1 text-xs font-mono">
            {lapHistory.map((lap) => (
              <div
                key={lap.id}
                className="flex items-center justify-between py-0.5 px-2 rounded bg-slate-800/50 text-slate-300"
              >
                <span>Lap #{lap.id}: <strong className="text-amber-400">{formatHMS(lap.lapTime)}</strong></span>
                <span className="text-slate-400">{formatHMS(lap.totalTime)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
