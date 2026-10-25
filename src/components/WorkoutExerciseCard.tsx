import React, { useState } from 'react';
import { WorkoutExercise, WorkoutSet, SetType, SetMode } from '../types/workout';
import { getExerciseById } from '../data/exerciseCatalog';
import { ChevronUp, ChevronDown, Plus, Minus, Trash2, Check, MessageSquare, Timer, HelpCircle } from 'lucide-react';

interface WorkoutExerciseCardProps {
  exercise: WorkoutExercise;
  exerciseIndex: number;
  onUpdateSet: (exerciseIndex: number, setIndex: number, updated: Partial<WorkoutSet>) => void;
  onAddSet: (exerciseIndex: number) => void;
  onRemoveSet: (exerciseIndex: number, setIndex: number) => void;
  onRemoveExercise: (exerciseIndex: number) => void;
  onOpenWeightPicker: (exerciseName: string, currentWeight: number, exerciseIndex: number, setIndex: number) => void;
  onOpenDocModal?: () => void;
  onSetCompleted?: (set: WorkoutSet) => void;
}

export const WorkoutExerciseCard: React.FC<WorkoutExerciseCardProps> = ({
  exercise,
  exerciseIndex,
  onUpdateSet,
  onAddSet,
  onRemoveSet,
  onRemoveExercise,
  onOpenWeightPicker,
  onOpenDocModal,
  onSetCompleted,
}) => {
  const [showNotes, setShowNotes] = useState(false);
  const [exerciseNotes, setExerciseNotes] = useState(exercise.notes || '');

  // Quick weight step for the inline up/down buttons (supports 0.1kg precision)
  const [stepSize, setStepSize] = useState<number>(2.5);

  const isDurationMode = exercise.sets.some((s) => s.mode === 'duration');

  const handleToggleModeForAllSets = (mode: SetMode) => {
    exercise.sets.forEach((_, sIdx) => {
      onUpdateSet(exerciseIndex, sIdx, {
        mode,
        durationSec: mode === 'duration' ? (exercise.sets[sIdx].durationSec || 60) : undefined,
      });
    });
  };

  const handleNudgeWeight = (setIndex: number, currentWeight: number, delta: number) => {
    const nextWeight = Math.min(999.9, Math.max(0, Math.round((currentWeight + delta) * 10) / 10));
    onUpdateSet(exerciseIndex, setIndex, { weightKg: nextWeight });
  };

  const handleToggleComplete = (setIndex: number, currentSet: WorkoutSet) => {
    const willBeCompleted = !currentSet.completed;
    onUpdateSet(exerciseIndex, setIndex, { completed: willBeCompleted });
    if (willBeCompleted && onSetCompleted) {
      onSetCompleted(currentSet);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 sm:p-4 text-slate-100 shadow-md">
      {/* Exercise Card Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3 mb-3">
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-base font-bold text-white tracking-tight truncate">{exercise.name}</h4>
            {isDurationMode && (
              <span className="text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded shrink-0">
                Timed Hold
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5 overflow-hidden">
            <span className="text-amber-400 font-medium truncate">
              {(exercise.exerciseId === null
                ? undefined
                : getExerciseById(exercise.exerciseId)?.categories.join(', ')) || 'Exercise'}
            </span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <button
              type="button"
              onClick={() => setShowNotes(!showNotes)}
              className="text-slate-400 hover:text-white flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
            >
              <MessageSquare className="w-3 h-3 shrink-0" />
              <span>{exerciseNotes ? 'Note' : '+ Note'}</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Quick step selector for up/down buttons */}
          <select
            value={stepSize}
            onChange={(e) => setStepSize(parseFloat(e.target.value))}
            title="Weight increment step for ▲/▼ buttons"
            className="bg-slate-950 border border-slate-800 rounded-lg px-1.5 py-1 text-[11px] font-mono text-slate-300 focus:outline-none cursor-pointer"
          >
            <option value="0.1">±0.1 kg</option>
            <option value="0.5">±0.5 kg</option>
            <option value="1.0">±1.0 kg</option>
            <option value="2.0">±2.0 kg</option>
            <option value="2.5">±2.5 kg</option>
            <option value="5.0">±5.0 kg</option>
            <option value="10.0">±10.0 kg</option>
          </select>

          <button
            type="button"
            onClick={() => onRemoveExercise(exerciseIndex)}
            title="Remove exercise from workout"
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Optional Exercise Note Input */}
      {showNotes && (
        <div className="mb-3">
          <input
            type="text"
            value={exerciseNotes}
            onChange={(e) => {
              setExerciseNotes(e.target.value);
              exercise.notes = e.target.value;
            }}
            placeholder="e.g. Pin 5, seat height 3, focus on slow eccentric"
            className="w-full text-xs px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
          />
        </div>
      )}

      {/* Sets Column Headers with Reps / Duration switch dropdown */}
      <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] uppercase font-bold tracking-wider text-slate-400 px-2 mb-2">
        <div className="w-8 sm:w-9 shrink-0 text-center">Set</div>
        <div className="flex-1 min-w-0 text-center">Weight (kg)</div>
        <div className="flex-1 min-w-0 flex items-center justify-center">
          {/* Reps vs Duration Dropdown per user prompt! */}
          <select
            value={isDurationMode ? 'duration' : 'reps'}
            onChange={(e) => handleToggleModeForAllSets(e.target.value as SetMode)}
            className="bg-slate-950 border border-slate-700/80 rounded-lg px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-amber-400 focus:outline-none cursor-pointer"
            title="Switch between Reps and Duration (e.g. Planks / Isometric holds)"
          >
            <option value="reps">Reps</option>
            <option value="duration">Duration (s)</option>
          </select>
        </div>
        <div className="w-14 sm:w-16 shrink-0 text-right pr-1">Done</div>
      </div>

      {/* Set Rows */}
      <div className="space-y-2">
        {exercise.sets.map((set, sIdx) => {
          const isThisSetDuration = set.mode === 'duration' || (set.mode === undefined && isDurationMode);

          return (
            <div
              key={set.id}
              className={`flex items-center gap-1.5 sm:gap-2 p-2 rounded-xl border transition-all flex-nowrap ${
                set.completed
                  ? 'bg-emerald-950/20 border-emerald-800/40'
                  : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              {/* Set Number */}
              <div className="w-8 sm:w-9 shrink-0 flex items-center justify-center">
                <span className="exercise-set-badge w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-slate-800/90 text-slate-300 border border-slate-700/70 font-mono font-bold text-xs flex items-center justify-center shadow-xs">
                  {set.setNumber || sIdx + 1}
                </span>
              </div>

              {/* Weight (kg) with Clickable Drum Picker Trigger + Two Up/Down Nudge Buttons */}
              <div className="flex-1 min-w-0 flex items-center gap-1 flex-nowrap">
                <button
                  type="button"
                  onClick={() => onOpenWeightPicker(exercise.name, set.weightKg, exerciseIndex, sIdx)}
                  title="Tap to open multi-digit scroll wheel (0.1kg precision)"
                  className="flex-1 min-w-[44px] py-1 px-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-center text-xs sm:text-sm font-mono font-bold text-white hover:text-amber-400 transition-colors truncate"
                >
                  {set.weightKg === 0 ? 'BW' : set.weightKg.toFixed(1)}
                </button>

                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleNudgeWeight(sIdx, set.weightKg, stepSize)}
                    title={`Increase weight by ${stepSize} kg`}
                    className="w-5 h-4 sm:w-6 sm:h-5 rounded bg-slate-800 hover:bg-slate-700 active:bg-amber-500/20 active:text-amber-400 text-slate-300 flex items-center justify-center transition-colors border border-slate-700/60 shrink-0"
                  >
                    <ChevronUp className="w-3 h-3 stroke-[2.5] shrink-0" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNudgeWeight(sIdx, set.weightKg, -stepSize)}
                    title={`Decrease weight by ${stepSize} kg`}
                    className="w-5 h-4 sm:w-6 sm:h-5 rounded bg-slate-800 hover:bg-slate-700 active:bg-amber-500/20 active:text-amber-400 text-slate-300 flex items-center justify-center transition-colors border border-slate-700/60 shrink-0"
                  >
                    <ChevronDown className="w-3 h-3 stroke-[2.5] shrink-0" />
                  </button>
                </div>
              </div>

              {/* Reps OR Duration Selector with Dropdown switch */}
              <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5">
                <div className="flex items-center gap-0.5 sm:gap-1 w-full justify-center flex-nowrap">
                  {isThisSetDuration ? (
                    /* Duration (Seconds) Hold mode (e.g. Planks) */
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSet(exerciseIndex, sIdx, {
                            durationSec: Math.max(5, (set.durationSec || 60) - 5),
                          })
                        }
                        title="Decrease duration by 5s"
                        className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-slate-800 hover:bg-slate-700 active:bg-amber-500/20 active:text-amber-400 text-slate-400 hover:text-white flex items-center justify-center border border-slate-700/60 transition-colors shrink-0 cursor-pointer"
                      >
                        <Minus className="w-2.5 h-2.5 sm:w-3 sm:h-3 stroke-[2.5] shrink-0" />
                      </button>
                      <input
                        type="number"
                        step="5"
                        min="1"
                        max="3600"
                        value={set.durationSec || 60}
                        onChange={(e) =>
                          onUpdateSet(exerciseIndex, sIdx, {
                            durationSec: Math.max(1, parseInt(e.target.value, 10) || 60),
                          })
                        }
                        className="w-10 sm:w-11 py-1 rounded-md bg-slate-900 border border-slate-700 text-center font-mono font-bold text-xs sm:text-sm text-amber-400 focus:outline-none focus:border-amber-400"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSet(exerciseIndex, sIdx, {
                            durationSec: (set.durationSec || 60) + 5,
                          })
                        }
                        title="Increase duration by 5s"
                        className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-slate-800 hover:bg-slate-700 active:bg-amber-500/20 active:text-amber-400 text-slate-400 hover:text-white flex items-center justify-center border border-slate-700/60 transition-colors shrink-0 cursor-pointer"
                      >
                        <Plus className="w-2.5 h-2.5 sm:w-3 sm:h-3 stroke-[2.5] shrink-0" />
                      </button>
                    </>
                  ) : (
                    /* Standard Repetitions mode */
                    <>
                      <button
                        type="button"
                        onClick={() => onUpdateSet(exerciseIndex, sIdx, { reps: Math.max(1, set.reps - 1) })}
                        title="Decrease reps"
                        className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-slate-800 hover:bg-slate-700 active:bg-amber-500/20 active:text-amber-400 text-slate-400 hover:text-white flex items-center justify-center border border-slate-700/60 transition-colors shrink-0 cursor-pointer"
                      >
                        <Minus className="w-2.5 h-2.5 sm:w-3 sm:h-3 stroke-[2.5] shrink-0" />
                      </button>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={set.reps}
                        onChange={(e) =>
                          onUpdateSet(exerciseIndex, sIdx, {
                            reps: Math.max(1, parseInt(e.target.value, 10) || 1),
                          })
                        }
                        className="w-9 sm:w-10 py-1 rounded-md bg-slate-900 border border-slate-700 text-center font-mono font-bold text-xs sm:text-sm text-white focus:outline-none focus:border-amber-400"
                      />
                      <button
                        type="button"
                        onClick={() => onUpdateSet(exerciseIndex, sIdx, { reps: set.reps + 1 })}
                        title="Increase reps"
                        className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-slate-800 hover:bg-slate-700 active:bg-amber-500/20 active:text-amber-400 text-slate-400 hover:text-white flex items-center justify-center border border-slate-700/60 transition-colors shrink-0 cursor-pointer"
                      >
                        <Plus className="w-2.5 h-2.5 sm:w-3 sm:h-3 stroke-[2.5] shrink-0" />
                      </button>
                    </>
                  )}
                </div>

                {/* Per-set mode selector dropdown */}
                <select
                  value={set.mode || (isDurationMode ? 'duration' : 'reps')}
                  onChange={(e) => {
                    const newMode = e.target.value as SetMode;
                    onUpdateSet(exerciseIndex, sIdx, {
                      mode: newMode,
                      durationSec: newMode === 'duration' ? (set.durationSec || 60) : undefined,
                      reps: newMode === 'duration' ? 0 : (set.reps || 10),
                    });
                  }}
                  className="text-[9px] font-mono text-slate-400 bg-slate-950/80 border border-slate-800 rounded px-1 py-0.2 focus:outline-none hover:text-amber-400 cursor-pointer"
                  title="Switch this set between Reps and Hold Duration"
                >
                  <option value="reps">reps</option>
                  <option value="duration">secs</option>
                </select>
              </div>

              {/* Done Checkbox & Delete Set */}
              <div className="w-14 sm:w-16 shrink-0 flex items-center justify-end gap-1 flex-nowrap">
                <button
                  type="button"
                  onClick={() => handleToggleComplete(sIdx, set)}
                  title={set.completed ? 'Mark set incomplete' : 'Mark set complete'}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                    set.completed
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                      : 'bg-slate-800 text-slate-500 hover:text-slate-300 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  <Check className={`w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3] shrink-0 ${set.completed ? 'text-slate-950' : ''}`} />
                </button>

                {exercise.sets.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => onRemoveSet(exerciseIndex, sIdx)}
                    title="Delete this set"
                    className="p-1 text-slate-600 hover:text-red-400 transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  </button>
                ) : (
                  <div className="w-5 shrink-0" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Set Button */}
      <div className="mt-3 pt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onAddSet(exerciseIndex)}
          className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-amber-400 font-semibold text-xs flex items-center gap-1.5 border border-slate-700/60 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Set</span>
        </button>

        <span className="text-[11px] font-mono text-slate-500">
          {isDurationMode ? (
            <>Hold: {exercise.sets.filter((s) => s.completed).reduce((sum, s) => sum + (s.durationSec || 60), 0)}s</>
          ) : (
            <>Vol: {(exercise.sets.filter((s) => s.completed).reduce((sum, s) => sum + s.weightKg * s.reps, 0)).toFixed(0)} kg</>
          )}
        </span>
      </div>
    </div>
  );
};
