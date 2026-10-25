export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';
export type SetMode = 'reps' | 'duration';

export interface ExerciseLastUsed {
  weightKg: number;
}

export interface ExerciseCatalogItem {
  id: number;
  name: string;
  fitExerciseType: string;
  categories: string[];
  stravaMuscleMap: string[];
}

export interface Exercise extends ExerciseCatalogItem {
  isFavorite: boolean;
  lastUsed?: ExerciseLastUsed;
}

export interface WorkoutSet {
  id: string;
  setNumber: number;
  type: SetType;
  mode?: SetMode;
  weightKg: number;
  reps: number;
  durationSec?: number;
  completed: boolean;
  restSec?: number;
}

export interface WorkoutExercise {
  exerciseId: number | null;
  name: string;
  sets: WorkoutSet[];
  notes?: string;
}

export interface WorkoutTemplate {
  id: string;
  title: string;
  description: string;
  isFavorite: boolean;
  exerciseIds: number[];
}

export interface CompletedWorkout {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  durationSeconds: number;
  exercises: WorkoutExercise[];
  notes?: string;
  totalVolumeKg: number;
  totalSets: number;
  totalReps: number;
  stravaUploadId?: string | number;
  stravaActivityId?: string | number;
}
