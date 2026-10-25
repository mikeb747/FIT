import React, { useEffect, useMemo, useState } from 'react';
import type { Exercise, SetMode } from '../types/workout';
import { Dumbbell, Plus, Search, Star, X } from 'lucide-react';

interface ExercisePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  exercises: Exercise[];
  onSelectExercise: (exercise: Exercise, modeOverride?: SetMode) => void;
  onToggleFavorite: (exerciseId: number) => void;
}

export const ExercisePickerModal: React.FC<ExercisePickerModalProps> = ({
  isOpen,
  onClose,
  exercises,
  onSelectExercise,
  onToggleFavorite,
}) => {
  const [filterMode, setFilterMode] = useState<'favorites' | 'all'>('favorites');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [exerciseModes, setExerciseModes] = useState<Record<number, SetMode>>({});

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const categories = useMemo(() => {
    const rawCategories = [...new Set(exercises.flatMap((exercise) => exercise.categories))];
    const priority = ['Legs', 'Shoulders', 'Shoulder'];
    return rawCategories.sort((a, b) => {
      const aIdx = priority.findIndex((p) => p.toLowerCase() === a.toLowerCase());
      const bIdx = priority.findIndex((p) => p.toLowerCase() === b.toLowerCase());
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [exercises]);

  if (!isOpen) return null;

  const filteredExercises = exercises.filter((exercise) => {
    if (filterMode === 'favorites' && !exercise.isFavorite) return false;
    if (selectedCategory !== 'all' && !exercise.categories.includes(selectedCategory)) return false;
    const query = searchQuery.trim().toLowerCase();
    return !query || [
      exercise.name,
      exercise.fitExerciseType,
      ...exercise.categories,
      ...exercise.stravaMuscleMap,
    ].some((value) => value.toLowerCase().includes(query));
  });

  const select = (exercise: Exercise, mode: SetMode) => {
    onSelectExercise(exercise, mode);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col text-slate-100 max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3 shrink-0">
          <div>
            <div className="text-[11px] uppercase tracking-wider font-extrabold text-amber-500">
              Exercise Catalog
            </div>
            <h3 className="text-base font-extrabold text-white">Add Exercise to Workout</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close exercise picker"
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search exercises, categories, FIT names..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
          />
        </div>

        <div className="flex gap-2 mb-3 shrink-0">
          {(['favorites', 'all'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilterMode(mode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${
                filterMode === mode ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 shrink-0">
          {['all', ...categories].map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setSelectedCategory(category)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap ${
                selectedCategory === category
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {category === 'all' ? 'All categories' : category}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-[220px]">
          {filteredExercises.length === 0 ? (
            <div className="py-12 text-center text-slate-500 flex flex-col items-center gap-2">
              <Dumbbell className="w-8 h-8 text-slate-600 stroke-[1.5]" />
              <p className="text-xs">No exercises match your search or filter.</p>
              {filterMode === 'favorites' && exercises.every((exercise) => !exercise.isFavorite) && (
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className="text-xs text-amber-400 hover:underline"
                >
                  Browse all exercises
                </button>
              )}
            </div>
          ) : filteredExercises.map((exercise) => {
            const mode = exerciseModes[exercise.id] || 'reps';
            return (
              <div
                key={exercise.id}
                className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-amber-500/50 flex items-center justify-between gap-2.5 group"
              >
                <button
                  type="button"
                  onClick={() => select(exercise, mode)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block font-bold text-xs sm:text-sm text-white group-hover:text-amber-400">
                    {exercise.name}
                  </span>
                  <span className="block text-[11px] text-slate-400 mt-0.5 truncate">
                    {exercise.categories.join(', ') || 'Uncategorised'}
                    {exercise.lastUsed && ` · Last used ${exercise.lastUsed.weightKg.toFixed(1)} kg`}
                  </span>
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                  <select
                    value={mode}
                    onChange={(event) =>
                      setExerciseModes((previous) => ({
                        ...previous,
                        [exercise.id]: event.target.value as SetMode,
                      }))
                    }
                    aria-label={`Set mode for ${exercise.name}`}
                    className="bg-slate-900 border border-slate-700 text-amber-400 text-[10px] font-bold rounded-lg px-1.5 py-1"
                  >
                    <option value="reps">Reps</option>
                    <option value="duration">Duration</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(exercise.id)}
                    title={exercise.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    aria-label={exercise.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400"
                  >
                    <Star className={`w-4 h-4 ${exercise.isFavorite ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => select(exercise, mode)}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500 text-amber-400 hover:text-slate-950 font-bold text-xs flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
