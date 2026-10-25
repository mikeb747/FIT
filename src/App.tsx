import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Exercise,
  WorkoutTemplate,
  WorkoutExercise,
  WorkoutSet,
  CompletedWorkout,
  SetMode,
} from './types/workout';
import { INITIAL_TEMPLATES } from './data/initialExercises';
import {
  DEFAULT_FAVORITE_EXERCISE_IDS,
  getExerciseById,
  INITIAL_EXERCISES,
  resolveExerciseId,
} from './data/exerciseCatalog';
import { WorkoutTimerHud } from './components/WorkoutTimerHud';
import { WorkoutExerciseCard } from './components/WorkoutExerciseCard';
import { WeightScrollPicker } from './components/WeightScrollPicker';
import { ExercisePickerModal } from './components/ExercisePickerModal';
import { WorkoutSummaryModal } from './components/WorkoutSummaryModal';
import { StravaSettingsModal } from './components/StravaSettingsModal';
import { AthleteProfileModal } from './components/AthleteProfileModal';
import type { ProfileTab } from './components/AthleteProfileModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { StravaIcon } from './components/StravaIcon';
import { StravaActivitiesTab } from './components/StravaActivitiesTab';
import type { AthleteProfile } from './types/athlete';
import {
  loadAthleteProfile,
  saveAthleteProfile,
  resetAthleteProfile,
} from './utils/athleteStorage';
import type { TrainingGoal } from './types/goals';
import { loadAthleteGoals, saveAthleteGoals } from './utils/goalsStorage';
import { downloadFitFile } from './utils/fitGenerator';
import {
  checkAndProcessOAuthRedirect,
  refreshStravaAccessToken,
  STRAVA_CONFIG,
} from './utils/stravaOAuth';
import type { StravaTokenResponse } from './utils/stravaOAuth';
import { uploadWorkoutToStrava } from './utils/stravaUpload';
import {
  fetchStravaAthleteActivities,
  fetchStravaActivityDetails,
  syncStravaActivitiesDelta,
  fetchOlderStravaActivities,
  isStravaAuthorizationError,
  getCachedStravaActivities,
  getCachedStravaActivitiesSnapshot,
  getCachedStravaNewActivityIds,
  getCachedStravaActivityRecord,
  ensureStravaActivityRecord,
  saveCachedStravaNewActivityIds,
  saveStravaActivityDetails,
  markStravaActivityPublishedToGoogleSheets,
  StravaActivity,
  StravaActivityDetailsRecord,
} from './utils/stravaActivities';
import {
  initGoogleAuth,
  signInWithGoogle,
  signOutGoogle,
  getGoogleAccessToken,
} from './utils/googleAuth';
import {
  checkGoogleSheetsReachability,
  getCachedSpreadsheetId,
} from './utils/googleSheets';
import { getDefaultActivityName } from './utils/activityName';
import {
  Dumbbell,
  Play,
  Plus,
  Star,
  Download,
  Settings,
  History,
  CheckCircle,
  X,
  Flame,
  Award,
  ChevronRight,
  RotateCcw,
  Sparkles,
  Pencil,
  Trash2,
  UploadCloud,
  ExternalLink,
  HeartPulse,
} from 'lucide-react';

const STORAGE_KEYS = {
  EXERCISES: 'ironfit_exercises_v2',
  FAVORITES: 'ironfit_favorite_exercise_ids_v1',
  LAST_USED_WEIGHTS: 'ironfit_last_used_weights_v1',
  TEMPLATES: 'ironfit_templates_v2',
  COMPLETED: 'ironfit_completed_v1',
  ACTIVE: 'ironfit_active_session_v1',
  STRAVA_TOKEN: 'ironfit_strava_token',
  STRAVA_ATHLETE: 'ironfit_strava_athlete',
  BRAND_TITLE: 'ironfit_brand_title',
  BRAND_SUBTITLE: 'ironfit_brand_subtitle',
  HERO_EYEBROW: 'ironfit_hero_eyebrow',
  HERO_HEADING: 'ironfit_hero_heading',
  HERO_DESCRIPTION: 'ironfit_hero_desc',
  DISPLAY_DENSITY: 'ironfit_display_density',
  THEME: 'ironfit_theme',
};

function migrateWorkoutExercises(
  exercises: Array<Omit<WorkoutExercise, 'exerciseId'> & { exerciseId?: number | string | null }>
): WorkoutExercise[] {
  return exercises.map((exercise) => {
    const exerciseId = exercise.exerciseId != null ? resolveExerciseId(exercise.exerciseId) : undefined;
    const catalogExercise = exerciseId === undefined
      ? INITIAL_EXERCISES.find((candidate) =>
          candidate.name.trim().toLowerCase() === exercise.name.trim().toLowerCase()
        )
      : getExerciseById(exerciseId);
    return {
      exerciseId: catalogExercise?.id ?? null,
      name: catalogExercise?.name ?? exercise.name,
      sets: exercise.sets,
      notes: exercise.notes,
    };
  });
}

export default function App() {
  // -------------------------------------------------------------
  // State Initialization
  // -------------------------------------------------------------
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.THEME);
      if (stored === 'light' || stored === 'dark') return stored;
      return 'dark';
    } catch {
      return 'dark';
    }
  });

  const handleThemeChanged = (newTheme: 'dark' | 'light') => {
    setTheme(newTheme);
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, newTheme);
    } catch {}
  };

  const [displayDensity, setDisplayDensity] = useState<number | 'standard' | 'compact' | 'comfortable'>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.DISPLAY_DENSITY);
      if (stored) {
        const num = Number(stored);
        if (!isNaN(num) && num >= 70 && num <= 130) return num;
        if (stored === 'compact') return 85;
        if (stored === 'comfortable') return 115;
        if (stored === 'standard') return 100;
      }
      return 100;
    } catch {
      return 100;
    }
  });

  const handleDensityChanged = (newDensity: number | 'standard' | 'compact' | 'comfortable') => {
    setDisplayDensity(newDensity);
    try {
      localStorage.setItem(STORAGE_KEYS.DISPLAY_DENSITY, String(newDensity));
    } catch {}
  };

  const [isAthleteProfileOpen, setIsAthleteProfileOpen] = useState(false);
  const [profileModalTab, setProfileModalTab] = useState<ProfileTab>('settings');
  const [athleteProfile, setAthleteProfile] = useState<AthleteProfile>(() => loadAthleteProfile());
  const [athleteGoals, setAthleteGoals] = useState<TrainingGoal[]>(() => loadAthleteGoals());

  const handleSaveAthleteProfile = (updated: AthleteProfile) => {
    setAthleteProfile(updated);
    saveAthleteProfile(updated);
  };

  const handleSaveAthleteGoals = (updated: TrainingGoal[]) => {
    setAthleteGoals(updated);
    saveAthleteGoals(updated);
  };

  const handleResetAthleteProfile = () => {
    const defaults = resetAthleteProfile();
    setAthleteProfile(defaults);
  };

  const [favoriteExerciseIds, setFavoriteExerciseIds] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.FAVORITES);
      if (saved !== null) return JSON.parse(saved);
      const stored = localStorage.getItem(STORAGE_KEYS.EXERCISES);
      if (stored) {
        const parsed: Exercise[] = JSON.parse(stored);
        if (parsed.some((exercise) => Boolean(exercise.isFavorite))) {
          return parsed
            .filter((exercise) => exercise.isFavorite)
            .map((exercise) => resolveExerciseId(exercise.id))
            .filter((id): id is number => id !== undefined);
        }
      }
      return DEFAULT_FAVORITE_EXERCISE_IDS;
    } catch {
      return DEFAULT_FAVORITE_EXERCISE_IDS;
    }
  });

  const [lastUsedWeights, setLastUsedWeights] = useState<Record<number, number>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LAST_USED_WEIGHTS);
      if (saved !== null) return JSON.parse(saved);
      const legacy = localStorage.getItem(STORAGE_KEYS.EXERCISES);
      if (!legacy) return {};
      const previousExercises: Exercise[] = JSON.parse(legacy);
      return previousExercises.reduce<Record<number, number>>((weights, exercise) => {
        const exerciseId = resolveExerciseId(exercise.id);
        const lastUsed = exercise.lastUsed as (Exercise['lastUsed'] & { completedAt?: string }) | undefined;
        if (exerciseId !== undefined && lastUsed && lastUsed.completedAt !== 'Prior session' &&
            Number.isFinite(lastUsed.weightKg)) {
          weights[exerciseId] = lastUsed.weightKg;
        }
        return weights;
      }, {});
    } catch {
      return {};
    }
  });

  const exercises = useMemo(
    () =>
      INITIAL_EXERCISES.map((exercise) => ({
        ...exercise,
        isFavorite: favoriteExerciseIds.includes(exercise.id),
        ...(lastUsedWeights[exercise.id] !== undefined
          ? { lastUsed: { weightKg: lastUsedWeights[exercise.id] } }
          : {}),
      })),
    [favoriteExerciseIds, lastUsedWeights]
  );

  const [templates, setTemplates] = useState<WorkoutTemplate[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.TEMPLATES);
      const migratedV113 = localStorage.getItem('gymfit_v113_default_unfavorited');
      if (stored) {
        const parsed: WorkoutTemplate[] = JSON.parse(stored);
        const existingIds = new Set(parsed.map((t) => t.id));
        const missingInitial = INITIAL_TEMPLATES.filter((initTpl) => !existingIds.has(initTpl.id));
        let combined = [...parsed, ...missingInitial];
        if (!migratedV113) {
          localStorage.setItem('gymfit_v113_default_unfavorited', 'true');
          combined = combined.map((template) => {
            const isInitial = INITIAL_TEMPLATES.some((init) => init.id === template.id);
            return isInitial ? { ...template, isFavorite: false } : template;
          });
        }
        return combined.map((template) => ({
          ...template,
          exerciseIds: template.exerciseIds
            .map((id) => resolveExerciseId(id))
            .filter((id): id is number => id !== undefined),
        }));
      }
      localStorage.setItem('gymfit_v113_default_unfavorited', 'true');
      return INITIAL_TEMPLATES;
    } catch {
      return INITIAL_TEMPLATES;
    }
  });

  const [completedWorkouts, setCompletedWorkouts] = useState<CompletedWorkout[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.COMPLETED);
      return stored
        ? JSON.parse(stored).map((workout: CompletedWorkout) => ({
            ...workout,
            exercises: migrateWorkoutExercises(workout.exercises),
          }))
        : [];
    } catch {
      return [];
    }
  });

  // Active workout session
  const [activeWorkout, setActiveWorkout] = useState<{
    id: string;
    title: string;
    startTime: number;
    durationSeconds?: number;
    exercises: WorkoutExercise[];
    isPaused: boolean;
    isEditingCompletedId?: string;
  } | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.ACTIVE);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      return { ...parsed, exercises: migrateWorkoutExercises(parsed.exercises || []) };
    } catch {
      return null;
    }
  });

  const [editingCompletedId, setEditingCompletedId] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.ACTIVE);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed?.isEditingCompletedId || null;
      }
      return null;
    } catch {
      return null;
    }
  });

  // Strava credentials
  const [stravaToken, setStravaToken] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEYS.STRAVA_TOKEN) || null;
  });
  const [athleteName, setAthleteName] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEYS.STRAVA_ATHLETE) || null;
  });

  // Modals & UI View states
  const [activeTab, setActiveTab] = useState<'workouts' | 'history' | 'strava'>('workouts');
  const [templateFilter, setTemplateFilter] = useState<'favorites' | 'all'>('favorites');
  const [stravaActivities, setStravaActivities] = useState<StravaActivity[]>(() => getCachedStravaActivities());
  const [newStravaActivityIds, setNewStravaActivityIds] = useState<string[]>(() => getCachedStravaNewActivityIds());
  const [stravaActivityDetails, setStravaActivityDetails] = useState<Record<string, StravaActivityDetailsRecord>>({});
  const [stravaActivityDetailStatus, setStravaActivityDetailStatus] = useState<
    Record<string, { loading: boolean; error?: string }>
  >({});
  const activityDetailsInProgress = useRef(new Set<string>());
  const [isLoadingStravaActivities, setIsLoadingStravaActivities] = useState(false);
  const [isLoadingMoreStrava, setIsLoadingMoreStrava] = useState(false);
  const [hasMoreStrava, setHasMoreStrava] = useState(true);
  const [stravaActivitiesError, setStravaActivitiesError] = useState<string | null>(null);

  // Google Sheets integration state
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null);
  const [googleSheetUrl, setGoogleSheetUrl] = useState<string | null>(() => {
    const id = getCachedSpreadsheetId();
    return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null;
  });
  const [isExercisePickerOpen, setIsExercisePickerOpen] = useState(false);
  const [isStravaSettingsOpen, setIsStravaSettingsOpen] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [pendingWorkoutToEdit, setPendingWorkoutToEdit] = useState<CompletedWorkout | null>(null);
  const [justCompletedWorkout, setJustCompletedWorkout] = useState<CompletedWorkout | null>(null);

  // Weight Scroll Picker modal state
  const [weightPickerState, setWeightPickerState] = useState<{
    isOpen: boolean;
    exerciseName: string;
    weight: number;
    exerciseIndex: number;
    setIndex: number;
  }>({
    isOpen: false,
    exerciseName: '',
    weight: 40.0,
    exerciseIndex: 0,
    setIndex: 0,
  });

  // Routine creation / editing modal state
  const [isCreatingRoutine, setIsCreatingRoutine] = useState(false);
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [newRoutineTitle, setNewRoutineTitle] = useState('');
  const [newRoutineDesc, setNewRoutineDesc] = useState('');
  const [newRoutineExerciseIds, setNewRoutineExerciseIds] = useState<number[]>([]);
  const [routineToDelete, setRoutineToDelete] = useState<WorkoutTemplate | null>(null);

  // Completed workout delete and Strava upload states
  const [workoutToDelete, setWorkoutToDelete] = useState<CompletedWorkout | null>(null);
  const [stravaUploadStatus, setStravaUploadStatus] = useState<{
    id: string;
    loading: boolean;
    message?: string;
    success?: boolean;
    activityId?: number | string;
  } | null>(null);

  // Brand Header Customization (600ms Long Press or Settings)
  const [brandTitle, setBrandTitle] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.BRAND_TITLE);
    if (!saved || saved === 'IronFIT') return 'GymFIT';
    return saved;
  });
  const [brandSubtitle, setBrandSubtitle] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.BRAND_SUBTITLE);
    if (!saved || saved === 'Strength & Strava FIT Uploader') return 'Workout Log & Strava Uploader';
    return saved;
  });
  const [isEditingBrandModal, setIsEditingBrandModal] = useState(false);
  const [tempBrandTitle, setTempBrandTitle] = useState(brandTitle);
  const [tempBrandSubtitle, setTempBrandSubtitle] = useState(brandSubtitle);

  // Long press timer ref for 600ms hold
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressTriggeredRef = useRef(false);

  const handleStartBrandLongPress = () => {
    isLongPressTriggeredRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(60);
        } catch {}
      }
      setTempBrandTitle(brandTitle);
      setTempBrandSubtitle(brandSubtitle);
      setIsEditingBrandModal(true);
    }, 600);
  };

  const handleCancelBrandLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleSaveBrand = () => {
    const finalTitle = tempBrandTitle.trim() || 'GymFIT';
    const finalSub = tempBrandSubtitle.trim() || 'Workout Log & Strava Uploader';
    setBrandTitle(finalTitle);
    setBrandSubtitle(finalSub);
    localStorage.setItem(STORAGE_KEYS.BRAND_TITLE, finalTitle);
    localStorage.setItem(STORAGE_KEYS.BRAND_SUBTITLE, finalSub);
    setIsEditingBrandModal(false);
  };

  const handleResetBrand = () => {
    setBrandTitle('GymFIT');
    setBrandSubtitle('Workout Log & Strava Uploader');
    localStorage.removeItem(STORAGE_KEYS.BRAND_TITLE);
    localStorage.removeItem(STORAGE_KEYS.BRAND_SUBTITLE);
    setIsEditingBrandModal(false);
  };

  // Studio Hero Banner Text Customization (600ms Long Press)
  const [heroEyebrow, setHeroEyebrow] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.HERO_EYEBROW);
    if (!saved || saved === 'Strength Training Studio') return 'LOG · PUBLISH · REPEAT';
    return saved;
  });
  const [heroHeading, setHeroHeading] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.HERO_HEADING) || 'Ready to Train?';
  });
  const [heroDescription, setHeroDescription] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.HERO_DESCRIPTION);
    const oldDefault = 'Log sets with digit drum precision, dual continuous & lap timers, and generate authentic Strava .FIT activity files.';
    if (!saved || saved === oldDefault) {
      return 'Log every set as you train, starting from last session’s weights. Publish to Strava with the exercise list and muscle map displayed.';
    }
    return saved;
  });
  const [isEditingHeroModal, setIsEditingHeroModal] = useState(false);
  const [tempHeroEyebrow, setTempHeroEyebrow] = useState(heroEyebrow);
  const [tempHeroHeading, setTempHeroHeading] = useState(heroHeading);
  const [tempHeroDescription, setTempHeroDescription] = useState(heroDescription);

  const heroLongPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHeroLongPressTriggeredRef = useRef(false);

  const handleStartHeroLongPress = () => {
    isHeroLongPressTriggeredRef.current = false;
    if (heroLongPressTimerRef.current) clearTimeout(heroLongPressTimerRef.current);
    heroLongPressTimerRef.current = setTimeout(() => {
      isHeroLongPressTriggeredRef.current = true;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(60);
        } catch {}
      }
      setTempHeroEyebrow(heroEyebrow);
      setTempHeroHeading(heroHeading);
      setTempHeroDescription(heroDescription);
      setIsEditingHeroModal(true);
    }, 600);
  };

  const handleCancelHeroLongPress = () => {
    if (heroLongPressTimerRef.current) {
      clearTimeout(heroLongPressTimerRef.current);
      heroLongPressTimerRef.current = null;
    }
  };

  const handleSaveHeroText = () => {
    const finalEyebrow = tempHeroEyebrow.trim() || 'LOG · PUBLISH · REPEAT';
    const finalHeading = tempHeroHeading.trim() || 'Ready to Train?';
    const finalDesc =
      tempHeroDescription.trim() ||
      'Log every set as you train, starting from last session’s weights. Publish to Strava with the exercise list and muscle map displayed.';
    setHeroEyebrow(finalEyebrow);
    setHeroHeading(finalHeading);
    setHeroDescription(finalDesc);
    localStorage.setItem(STORAGE_KEYS.HERO_EYEBROW, finalEyebrow);
    localStorage.setItem(STORAGE_KEYS.HERO_HEADING, finalHeading);
    localStorage.setItem(STORAGE_KEYS.HERO_DESCRIPTION, finalDesc);
    setIsEditingHeroModal(false);
  };

  const handleResetHeroText = () => {
    const defaultEyebrow = 'LOG · PUBLISH · REPEAT';
    const defaultHeading = 'Ready to Train?';
    const defaultDesc =
      'Log every set as you train, starting from last session’s weights. Publish to Strava with the exercise list and muscle map displayed.';
    setHeroEyebrow(defaultEyebrow);
    setHeroHeading(defaultHeading);
    setHeroDescription(defaultDesc);
    localStorage.removeItem(STORAGE_KEYS.HERO_EYEBROW);
    localStorage.removeItem(STORAGE_KEYS.HERO_HEADING);
    localStorage.removeItem(STORAGE_KEYS.HERO_DESCRIPTION);
    setIsEditingHeroModal(false);
  };

  // Routine Handlers
  const handleStartCreateRoutine = () => {
    setEditingRoutineId(null);
    setNewRoutineTitle('');
    setNewRoutineDesc('');
    setNewRoutineExerciseIds([]);
    setIsCreatingRoutine(true);
  };

  const handleEditRoutine = (tpl: WorkoutTemplate) => {
    setEditingRoutineId(tpl.id);
    setNewRoutineTitle(tpl.title);
    setNewRoutineDesc(tpl.description);
    setNewRoutineExerciseIds(tpl.exerciseIds);
    setIsCreatingRoutine(true);
  };

  const handleConfirmDeleteRoutine = () => {
    if (!routineToDelete) return;
    setTemplates((prev) => prev.filter((t) => t.id !== routineToDelete.id));
    setRoutineToDelete(null);
  };

  // Completed Workouts Handlers
  const handleConfirmDeleteWorkout = () => {
    if (!workoutToDelete) return;
    setCompletedWorkouts((prev) => prev.filter((w) => w.id !== workoutToDelete.id));
    setWorkoutToDelete(null);
  };

  // Open completed workout as an active session so user can edit exercises, reps, sets, and weights
  const startEditingCompletedWorkout = (workout: CompletedWorkout) => {
    const clonedExercises: WorkoutExercise[] = workout.exercises.map((ex) => ({
      ...ex,
      sets: ex.sets.map((s, idx) => ({
        ...s,
        setNumber: s.setNumber || idx + 1,
        completed: s.completed !== undefined ? s.completed : true,
      })),
    }));

    const sessionObj = {
      id: workout.id,
      title: workout.title,
      startTime: workout.startTime,
      durationSeconds: workout.durationSeconds,
      exercises: clonedExercises,
      isPaused: true,
      isEditingCompletedId: workout.id,
    };

    setActiveWorkout(sessionObj);
    setEditingCompletedId(workout.id);
    localStorage.setItem(STORAGE_KEYS.ACTIVE, JSON.stringify(sessionObj));
    setActiveTab('workouts');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleEditCompletedWorkout = (workout: CompletedWorkout) => {
    // If active workout exists with another ID and has logged progress, confirm switch first
    if (activeWorkout && activeWorkout.id !== workout.id && !editingCompletedId) {
      const hasProgress = activeWorkout.exercises.some((e) => e.sets.some((s) => s.completed));
      if (hasProgress) {
        setPendingWorkoutToEdit(workout);
        return;
      }
    }
    startEditingCompletedWorkout(workout);
  };

  const handleSaveCompletedWorkoutEdit = (updated: CompletedWorkout) => {
    setCompletedWorkouts((prev) =>
      prev.map((w) => (w.id === updated.id ? updated : w))
    );
  };

  const handleUploadCompletedToStrava = async (wkt: CompletedWorkout) => {
    if (!stravaToken) {
      setIsStravaSettingsOpen(true);
      return;
    }
    setStravaUploadStatus({ id: wkt.id, loading: true, message: 'Uploading to Strava...' });
    try {
      const res = await uploadWorkoutToStrava(wkt, stravaToken, (msg) => {
        setStravaUploadStatus({ id: wkt.id, loading: true, message: msg });
      });
      if (res.success) {
        setStravaUploadStatus({
          id: wkt.id,
          loading: false,
          success: true,
          activityId: res.activityId,
          message: res.activityId
            ? `Activity ready on Strava! (ID: ${res.activityId})`
            : res.status || 'Workout uploaded to Strava successfully!',
        });
        setTimeout(() => {
          setStravaUploadStatus((prev) => (prev?.id === wkt.id ? null : prev));
        }, 8000);
      } else {
        setStravaUploadStatus({
          id: wkt.id,
          loading: false,
          success: false,
          message: res.error || 'Strava upload failed.',
        });
        setTimeout(() => {
          setStravaUploadStatus((prev) => (prev?.id === wkt.id ? null : prev));
        }, 6000);
      }
    } catch (err: any) {
      setStravaUploadStatus({
        id: wkt.id,
        loading: false,
        success: false,
        message: err.message || 'Error communicating with Strava.',
      });
      setTimeout(() => {
        setStravaUploadStatus((prev) => (prev?.id === wkt.id ? null : prev));
      }, 6000);
    }
  };

  // Sorted exercises with favorites at top for routine builder
  const sortedExercisesForRoutine = useMemo(() => {
    return [...exercises].sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [exercises]);

  // -------------------------------------------------------------
  // Persistence Effects
  // -------------------------------------------------------------
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favoriteExerciseIds));
  }, [favoriteExerciseIds]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.LAST_USED_WEIGHTS, JSON.stringify(lastUsedWeights));
  }, [lastUsedWeights]);

  useEffect(() => {
    localStorage.removeItem(STORAGE_KEYS.EXERCISES);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.COMPLETED, JSON.stringify(completedWorkouts));
  }, [completedWorkouts]);

  useEffect(() => {
    if (activeWorkout) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE, JSON.stringify(activeWorkout));
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE);
    }
  }, [activeWorkout]);

  // Sync theme to document element and meta theme-color
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', theme === 'light' ? '#f8fafc' : '#090a0f');
      }
    }
  }, [theme]);

  // Sync display density attribute and font-size scaling to document element
  useEffect(() => {
    if (typeof document !== 'undefined') {
      let percent = 100;
      if (typeof displayDensity === 'number') {
        percent = displayDensity;
      } else if (displayDensity === 'compact') {
        percent = 85;
      } else if (displayDensity === 'comfortable') {
        percent = 115;
      }
      document.documentElement.setAttribute('data-density', String(displayDensity));
      document.documentElement.style.fontSize = `${(percent / 100) * 16}px`;
    }
  }, [displayDensity]);

  // Handle incoming Strava OAuth redirect code (for GitHub Pages static hosting or mobile PWA)
  useEffect(() => {
    checkAndProcessOAuthRedirect().then((result) => {
      if (result.handled) {
        if (result.success && result.token) {
          setStravaToken(result.token);
          localStorage.setItem(STORAGE_KEYS.STRAVA_TOKEN, result.token);
          if (result.athlete?.firstname) {
            const name = `${result.athlete.firstname} ${result.athlete.lastname || ''}`.trim();
            setAthleteName(name);
            localStorage.setItem(STORAGE_KEYS.STRAVA_ATHLETE, name);
          }
        } else if (result.error) {
          setIsStravaSettingsOpen(true);
        }
      }
    });
  }, []);

  const fetchAndStoreStravaActivityDetails = useCallback(async (
    activityId: string,
    accessToken: string | null = stravaToken
  ) => {
    if (!accessToken || activityDetailsInProgress.current.has(activityId)) return;
    activityDetailsInProgress.current.add(activityId);
    setStravaActivityDetailStatus((current) => ({
      ...current,
      [activityId]: { loading: true },
    }));
    try {
      await ensureStravaActivityRecord(activityId);
      const details = await fetchStravaActivityDetails(accessToken, activityId);
      const record = await saveStravaActivityDetails(activityId, details);
      setStravaActivityDetails((current) => ({ ...current, [activityId]: record }));
      setStravaActivityDetailStatus((current) => {
        const next = { ...current };
        delete next[activityId];
        return next;
      });
    } catch (err) {
      setStravaActivityDetailStatus((current) => ({
        ...current,
        [activityId]: {
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to save detailed Strava activity data',
        },
      }));
    } finally {
      activityDetailsInProgress.current.delete(activityId);
    }
  }, [stravaToken]);

  // Google Auth initialization listener
  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (user, token) => {
        setIsGoogleConnected(true);
        setGoogleUserEmail(user.email || null);
        const sheetId = getCachedSpreadsheetId();
        if (sheetId) {
          setGoogleSheetUrl(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`);
        }
      },
      () => {
        setIsGoogleConnected(false);
        setGoogleUserEmail(null);
      }
    );
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const handleConnectGoogle = async () => {
    try {
      const { user } = await signInWithGoogle();
      setIsGoogleConnected(true);
      setGoogleUserEmail(user.email || null);
      const sheetId = getCachedSpreadsheetId();
      if (sheetId) {
        setGoogleSheetUrl(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`);
      }
    } catch (err: any) {
      console.error('Google Sign-in failed:', err);
    }
  };

  const handleDisconnectGoogle = async () => {
    await signOutGoogle();
    setIsGoogleConnected(false);
    setGoogleUserEmail(null);
  };

  const handleActivityPublished = (activityId: string) => {
    setStravaActivityDetails((prev) => {
      const existing = prev[activityId] || { id: activityId };
      return {
        ...prev,
        [activityId]: {
          ...existing,
          googleDrivePublishedAt: new Date().toISOString(),
        },
      };
    });
    const sheetId = getCachedSpreadsheetId();
    if (sheetId) {
      setGoogleSheetUrl(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`);
    }
  };

  const refreshStravaActivities = async (accessToken: string | null = stravaToken) => {
    if (!accessToken) return;
    setIsLoadingStravaActivities(true);
    setStravaActivitiesError(null);
    try {
      let currentToken = accessToken;
      let tokenWasRefreshed = false;
      const tokenExpiresAt = Number(localStorage.getItem(STRAVA_CONFIG.STORAGE_KEYS.EXPIRES_AT) || 0);
      if (tokenExpiresAt > 0 && tokenExpiresAt <= Math.floor(Date.now() / 1000) + 60) {
        currentToken = await refreshStravaAccessToken();
        tokenWasRefreshed = true;
        setStravaToken(currentToken);
        localStorage.setItem(STORAGE_KEYS.STRAVA_TOKEN, currentToken);
      }

      let data: StravaActivity[];
      try {
        data = await syncStravaActivitiesDelta(currentToken);
      } catch (err) {
        if (tokenWasRefreshed || !isStravaAuthorizationError(err)) throw err;
        currentToken = await refreshStravaAccessToken();
        setStravaToken(currentToken);
        localStorage.setItem(STORAGE_KEYS.STRAVA_TOKEN, currentToken);
        data = await syncStravaActivitiesDelta(currentToken);
      }

      setStravaActivities(data);
      // Pre-load published records from IndexedDB so badges display immediately
      const records = await Promise.all(
        data.map((act) => getCachedStravaActivityRecord(act.id))
      );
      const detailMap: Record<string, StravaActivityDetailsRecord> = {};
      records.forEach((rec) => {
        if (rec) detailMap[rec.id] = rec;
      });
      setStravaActivityDetails((prev) => ({ ...prev, ...detailMap }));
    } catch (err: any) {
      setStravaActivitiesError(err.message || 'Failed to sync activities from Strava');
    } finally {
      setIsLoadingStravaActivities(false);
    }
  };

  const handleLoadMoreStravaActivities = async () => {
    if (!stravaToken || isLoadingMoreStrava || !hasMoreStrava || stravaActivities.length === 0) return;
    setIsLoadingMoreStrava(true);
    try {
      let currentToken = stravaToken;
      let tokenWasRefreshed = false;
      const tokenExpiresAt = Number(localStorage.getItem(STRAVA_CONFIG.STORAGE_KEYS.EXPIRES_AT) || 0);
      if (tokenExpiresAt > 0 && tokenExpiresAt <= Math.floor(Date.now() / 1000) + 90) {
        try {
          currentToken = await refreshStravaAccessToken();
          tokenWasRefreshed = true;
          setStravaToken(currentToken);
          localStorage.setItem(STORAGE_KEYS.STRAVA_TOKEN, currentToken);
        } catch (err) {
          console.warn('Pre-emptive token refresh before loading older activities failed:', err);
        }
      }

      const oldest = stravaActivities[stravaActivities.length - 1];
      const oldestEpoch = Math.floor(new Date(oldest.start_date).getTime() / 1000);

      let result;
      try {
        result = await fetchOlderStravaActivities(currentToken, oldestEpoch, 50);
      } catch (err) {
        if (tokenWasRefreshed || !isStravaAuthorizationError(err)) throw err;
        currentToken = await refreshStravaAccessToken();
        tokenWasRefreshed = true;
        setStravaToken(currentToken);
        localStorage.setItem(STORAGE_KEYS.STRAVA_TOKEN, currentToken);
        result = await fetchOlderStravaActivities(currentToken, oldestEpoch, 50);
      }

      setStravaActivities(result.activities);
      setHasMoreStrava(result.hasMore);

      // Pre-load cached records for newly added activities
      const records = await Promise.all(
        result.activities.map((act) => getCachedStravaActivityRecord(act.id))
      );
      const detailMap: Record<string, StravaActivityDetailsRecord> = {};
      records.forEach((rec) => {
        if (rec) detailMap[rec.id] = rec;
      });
      setStravaActivityDetails((prev) => ({ ...prev, ...detailMap }));
    } catch (err: any) {
      setStravaActivitiesError(err.message || 'Failed to load older activities');
    } finally {
      setIsLoadingMoreStrava(false);
    }
  };

  // Auto-fetch Strava activities when switching to 'strava' tab if connected and empty
  useEffect(() => {
    if (activeTab === 'strava' && stravaToken && stravaActivities.length === 0) {
      refreshStravaActivities();
    }
  }, [activeTab, stravaToken]);

  // Pre-load existing IndexedDB records on initial load
  useEffect(() => {
    if (stravaActivities.length === 0) return;
    let cancelled = false;

    const loadCachedRecords = async () => {
      try {
        const records = await Promise.all(
          stravaActivities.map((activity) => getCachedStravaActivityRecord(activity.id))
        );
        if (cancelled) return;
        const cachedDetails: Record<string, StravaActivityDetailsRecord> = {};
        records.forEach((record) => {
          if (record) cachedDetails[record.id] = record;
        });
        setStravaActivityDetails((current) => ({ ...current, ...cachedDetails }));
      } catch {}
    };

    void loadCachedRecords();
    return () => {
      cancelled = true;
    };
  }, [stravaActivities]);

  // -------------------------------------------------------------
  // Exercise and Workout Handlers
  // -------------------------------------------------------------
  const handleToggleFavoriteExercise = (exerciseId: number) => {
    setFavoriteExerciseIds((prev) =>
      prev.includes(exerciseId)
        ? prev.filter((id) => id !== exerciseId)
        : [...prev, exerciseId]
    );
  };

  const handleToggleFavoriteTemplate = (templateId: string) => {
    setTemplates((prev) =>
      prev.map((tpl) => (tpl.id === templateId ? { ...tpl, isFavorite: !tpl.isFavorite } : tpl))
    );
  };

  // Start workout from a Template (inheriting previous weights/sets/reps!)
  const handleStartTemplateWorkout = (template: WorkoutTemplate) => {
    const workoutExercises: WorkoutExercise[] = template.exerciseIds
      .map((id) => exercises.find((e) => e.id === id))
      .filter((e): e is Exercise => Boolean(e))
      .map((ex) => {
        const prevWeight = ex.lastUsed?.weightKg ?? 20.0;

        const sets: WorkoutSet[] = [];
        for (let i = 1; i <= 1; i++) {
          sets.push({
            id: `set-${Date.now()}-${ex.id}-${i}`,
            setNumber: i,
            type: 'normal',
            mode: 'reps',
            weightKg: prevWeight,
            reps: 10,
            completed: false,
          });
        }

        return {
          exerciseId: ex.id,
          name: ex.name,
          sets,
        };
      });

    setActiveWorkout({
      id: `wkt-${Date.now()}`,
      title: template.title,
      startTime: Date.now(),
      exercises: workoutExercises,
      isPaused: false,
    });
  };

  // Start empty blank workout
  const handleStartBlankWorkout = () => {
    const startTime = Date.now();
    setActiveWorkout({
      id: `wkt-${startTime}`,
      title: getDefaultActivityName(startTime),
      startTime,
      exercises: [],
      isPaused: false,
    });
  };

  // Handle manual total duration adjustment from paused timer
  const handleTotalDurationChanged = (newDurationSec: number) => {
    setActiveWorkout((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        durationSeconds: newDurationSec,
      };
    });
  };

  // Add exercise to currently running workout
  const handleAddExerciseToActiveWorkout = (exercise: Exercise, modeOverride?: SetMode) => {
    if (!activeWorkout) return;

    const defaultMode: SetMode = modeOverride || 'reps';
    const isDuration = defaultMode === 'duration';
    const defaultWeight = exercise.lastUsed?.weightKg ?? (isDuration ? 0.0 : 20.0);
    const defaultReps = isDuration ? 0 : 10;
    const defaultDuration = isDuration ? 60 : undefined;
    const defaultSetsCount = 1;

    const newSets: WorkoutSet[] = [];
    for (let i = 1; i <= defaultSetsCount; i++) {
      newSets.push({
        id: `set-${Date.now()}-${i}`,
        setNumber: i,
        type: 'normal',
        mode: defaultMode,
        weightKg: defaultWeight,
        reps: defaultReps,
        durationSec: defaultDuration,
        completed: false,
      });
    }

    const newWorkoutExercise: WorkoutExercise = {
      exerciseId: exercise.id,
      name: exercise.name,
      sets: newSets,
    };

    setActiveWorkout((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        // Order exercises by most recently added at the top
        exercises: [newWorkoutExercise, ...prev.exercises],
      };
    });
  };

  // Update set inside active workout
  const handleUpdateSet = (exerciseIndex: number, setIndex: number, updated: Partial<WorkoutSet>) => {
    if (!activeWorkout) return;
    setActiveWorkout((prev) => {
      if (!prev) return null;
      const updatedExercises = [...prev.exercises];
      const targetEx = { ...updatedExercises[exerciseIndex] };
      const updatedSets = [...targetEx.sets];
      updatedSets[setIndex] = { ...updatedSets[setIndex], ...updated };
      targetEx.sets = updatedSets;
      updatedExercises[exerciseIndex] = targetEx;
      return { ...prev, exercises: updatedExercises };
    });
  };

  // Add set to exercise in active workout (inherits previous set's weight & reps/duration)
  const handleAddSet = (exerciseIndex: number) => {
    if (!activeWorkout) return;
    setActiveWorkout((prev) => {
      if (!prev) return null;
      const updatedExercises = [...prev.exercises];
      const targetEx = { ...updatedExercises[exerciseIndex] };
      const prevSet = targetEx.sets[targetEx.sets.length - 1];

      const newSet: WorkoutSet = {
        id: `set-${Date.now()}-${targetEx.sets.length + 1}`,
        setNumber: targetEx.sets.length + 1,
        type: prevSet ? prevSet.type : 'normal',
        mode: prevSet?.mode || 'reps',
        durationSec: prevSet?.durationSec,
        weightKg: prevSet ? prevSet.weightKg : 20.0,
        reps: prevSet ? prevSet.reps : 10,
        completed: false,
      };

      targetEx.sets = [...targetEx.sets, newSet];
      updatedExercises[exerciseIndex] = targetEx;
      return { ...prev, exercises: updatedExercises };
    });
  };

  // Remove set
  const handleRemoveSet = (exerciseIndex: number, setIndex: number) => {
    if (!activeWorkout) return;
    setActiveWorkout((prev) => {
      if (!prev) return null;
      const updatedExercises = [...prev.exercises];
      const targetEx = { ...updatedExercises[exerciseIndex] };
      const filteredSets = targetEx.sets
        .filter((_, idx) => idx !== setIndex)
        .map((s, idx) => ({ ...s, setNumber: idx + 1 }));
      targetEx.sets = filteredSets;
      updatedExercises[exerciseIndex] = targetEx;
      return { ...prev, exercises: updatedExercises };
    });
  };

  // Remove exercise from active workout
  const handleRemoveExercise = (exerciseIndex: number) => {
    if (!activeWorkout) return;
    setActiveWorkout((prev) => {
      if (!prev) return null;
      const updatedExercises = prev.exercises.filter((_, idx) => idx !== exerciseIndex);
      return { ...prev, exercises: updatedExercises };
    });
  };

  // Open weight scroll picker modal
  const handleOpenWeightPicker = (
    exerciseName: string,
    currentWeight: number,
    exerciseIndex: number,
    setIndex: number
  ) => {
    setWeightPickerState({
      isOpen: true,
      exerciseName,
      weight: currentWeight,
      exerciseIndex,
      setIndex,
    });
  };

  // Weight picker confirmed
  const handleConfirmWeightFromPicker = (weightKg: number) => {
    handleUpdateSet(weightPickerState.exerciseIndex, weightPickerState.setIndex, { weightKg });
  };

  // Request finish workout (opens "Are you sure?" confirmation)
  const handleRequestFinishWorkout = () => {
    if (!activeWorkout) return;
    setShowFinishConfirm(true);
  };

  // Confirm and save completed workout
  const handleConfirmFinishWorkout = () => {
    if (!activeWorkout) return;
    setShowFinishConfirm(false);

    const endTime = Date.now();
    const durationSeconds =
      activeWorkout.durationSeconds && activeWorkout.durationSeconds > 0
        ? activeWorkout.durationSeconds
        : Math.max(30, Math.floor((endTime - activeWorkout.startTime) / 1000));

    let totalVolumeKg = 0;
    let totalSets = 0;
    let totalReps = 0;

    for (const ex of activeWorkout.exercises) {
      const validSets = ex.sets.filter(
        (s) => s.completed || (s.mode === 'duration' ? (s.durationSec || 0) > 0 : (s.reps > 0 || s.weightKg > 0))
      );
      if (validSets.length > 0) {
        totalSets += validSets.length;
        const lastSet = validSets[validSets.length - 1];
        const repsSum = validSets.reduce((sum, s) => sum + s.reps, 0);
        totalReps += repsSum;
        const volSum = validSets.reduce((sum, s) => sum + s.weightKg * s.reps, 0);
        totalVolumeKg += volSum;

        const exerciseId = ex.exerciseId;
        if (exerciseId !== null) {
          setLastUsedWeights((previous) => ({
            ...previous,
            [exerciseId]: lastSet.weightKg,
          }));
        }
      }
    }

    const finalId = editingCompletedId || `completed-${Date.now()}`;
    const completed: CompletedWorkout = {
      id: finalId,
      title: activeWorkout.title?.trim() || getDefaultActivityName(activeWorkout.startTime),
      startTime: activeWorkout.startTime,
      endTime: activeWorkout.startTime + (durationSeconds * 1000),
      durationSeconds,
      exercises: activeWorkout.exercises.map((ex) => ({
        ...ex,
        sets: ex.sets.map((s) => ({
          ...s,
          completed: s.completed || (s.mode === 'duration' ? (s.durationSec || 0) > 0 : (s.reps > 0 || s.weightKg > 0)),
        })),
      })),
      totalVolumeKg: Number(totalVolumeKg.toFixed(1)),
      totalSets,
      totalReps,
    };

    if (editingCompletedId) {
      setCompletedWorkouts((prev) =>
        prev.map((w) => (w.id === editingCompletedId ? completed : w))
      );
    } else {
      setCompletedWorkouts((prev) => [completed, ...prev]);
    }

    setJustCompletedWorkout(completed);
    // Note: We do NOT set activeWorkout(null) here so that clicking 'X' on WorkoutSummaryModal
    // takes the user straight back to the active workout session to continue editing!
    setIsSummaryOpen(true);
  };

  const handleCancelWorkout = () => {
    setShowDiscardConfirm(true);
  };

  const handleConfirmDiscardWorkout = () => {
    setActiveWorkout(null);
    setEditingCompletedId(null);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE);
    setShowDiscardConfirm(false);
  };

  // Strava token updated
  const handleTokenUpdated = (token: string | null, tokenData?: StravaTokenResponse | null) => {
    setStravaToken(token);
    if (token) {
      localStorage.setItem(STORAGE_KEYS.STRAVA_TOKEN, token);
      if (tokenData?.refresh_token) {
        localStorage.setItem(STRAVA_CONFIG.STORAGE_KEYS.REFRESH_TOKEN, tokenData.refresh_token);
      }
      if (tokenData?.expires_at) {
        localStorage.setItem(STRAVA_CONFIG.STORAGE_KEYS.EXPIRES_AT, String(tokenData.expires_at));
      }
      if (tokenData?.athlete?.firstname) {
        const name = `${tokenData.athlete.firstname} ${tokenData.athlete.lastname || ''}`.trim();
        setAthleteName(name);
        localStorage.setItem(STORAGE_KEYS.STRAVA_ATHLETE, name);
      }
      void refreshStravaActivities(token);
    } else {
      localStorage.removeItem(STORAGE_KEYS.STRAVA_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.STRAVA_ATHLETE);
      localStorage.removeItem(STRAVA_CONFIG.STORAGE_KEYS.REFRESH_TOKEN);
      localStorage.removeItem(STRAVA_CONFIG.STORAGE_KEYS.EXPIRES_AT);
      localStorage.removeItem('gymfit_strava_activities_cache');
      saveCachedStravaNewActivityIds([]);
      setStravaActivities([]);
      setNewStravaActivityIds([]);
      setStravaActivityDetails({});
      setStravaActivityDetailStatus({});
      setAthleteName(null);
    }
  };

  // -------------------------------------------------------------
  // Filtered Templates
  // -------------------------------------------------------------
  const filteredTemplates = templates.filter((tpl) => {
    if (templateFilter === 'favorites') {
      return tpl.isFavorite;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-[#090A0F] text-slate-100 flex flex-col font-sans antialiased pb-20 sm:pb-12">
      {/* ========================================================= */}
      {/* Top Application Bar */}
      {/* ========================================================= */}
      <header className="sticky top-0 z-40 bg-[#090A0F]/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          {/* Brand Wordmark */}
          <div className="flex flex-col min-w-0 select-none text-left p-1 -m-1">
            <span className="text-sm sm:text-base font-extrabold tracking-tight text-white leading-snug">
              {brandTitle}
            </span>
            {brandSubtitle && (
              <span className="text-[11px] sm:text-xs text-slate-400 font-medium leading-tight truncate block max-w-[185px] sm:max-w-xs">
                {brandSubtitle}
              </span>
            )}
          </div>

          {/* Action cluster */}
          <div className="flex items-center gap-2">
            {/* Direct PWA Install Button (auto-hides when already running standalone) */}
            <PWAInstallButton />

            {/* Settings & Athlete Profile Button */}
            <button
              type="button"
              onClick={() => {
                setProfileModalTab('settings');
                setIsAthleteProfileOpen(true);
              }}
              title="Settings & Athlete Profile"
              className="h-8 px-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 shadow-sm"
            >
              <Settings className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Settings</span>
            </button>

            {/* Strava Connect Button */}
            <button
              type="button"
              onClick={() => setIsStravaSettingsOpen(true)}
              title={stravaToken ? 'Strava Connected - click to manage' : 'Connect Strava'}
              className={`h-8 px-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer ${
                stravaToken
                  ? 'bg-transparent text-emerald-400 hover:text-emerald-300 border-0 shadow-none'
                  : theme === 'light'
                  ? 'bg-sky-100 hover:bg-sky-200 text-sky-950 border border-sky-700 shadow-sm'
                  : 'bg-blue-950 hover:bg-blue-900 text-blue-200 border border-blue-700 shadow-sm'
              }`}
            >
              <StravaIcon className="w-[27px] h-[27px] rounded-full shadow-xs shrink-0" />
              <span>{stravaToken ? 'Connected' : 'Connect'}</span>
            </button>

            {/* If workout is running, show indicator */}
            {activeWorkout && (
              <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-xl animate-pulse">
                {editingCompletedId ? 'Editing Activity' : 'Workout Active'}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ========================================================= */}
      {/* ACTIVE WORKOUT MODE VIEW */}
      {/* ========================================================= */}
      {activeWorkout ? (
        <main className="flex-1 max-w-4xl w-full mx-auto pb-24">
          {/* Dual Continuous / Lap Timer HUD */}
          <WorkoutTimerHud
            workoutStartTime={activeWorkout.startTime}
            initialDurationSeconds={activeWorkout.durationSeconds}
            isPaused={activeWorkout.isPaused}
            onTogglePause={() =>
              setActiveWorkout((prev) => (prev ? { ...prev, isPaused: !prev.isPaused } : null))
            }
            onTotalDurationChanged={handleTotalDurationChanged}
          />

          <div className="p-3.5 sm:p-5 space-y-4">
            {/* Banner when editing a completed workout */}
            {editingCompletedId && (
              <div className="bg-amber-950/40 border border-amber-500/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-200 shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/40 shrink-0">
                    <Pencil className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 font-mono">
                        Editing Completed Activity
                      </span>
                      <span className="text-xs text-amber-300 font-mono">
                        Original: {new Date(activeWorkout.startTime).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">
                      Adjust weights, reps, add/remove sets, or add new exercises. Click <strong>Save Changes</strong> below when done.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(true)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 shrink-0 self-start sm:self-auto cursor-pointer"
                >
                  Cancel Edit
                </button>
              </div>
            )}

            {/* Title & Workout Controls Bar */}
            <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800">
              <input
                type="text"
                value={activeWorkout.title}
                onChange={(e) =>
                  setActiveWorkout((prev) => (prev ? { ...prev, title: e.target.value } : null))
                }
                className="w-full bg-transparent text-lg font-bold text-white focus:outline-none focus:underline"
              />
              <span className="text-xs text-slate-400 block mt-0.5">
                Tap exercise weight to open multi-figure scroll wheel (1.1 - 999.9 kg)
              </span>
            </div>

            {/* List of Exercises in Active Session */}
            {activeWorkout.exercises.length === 0 ? (
              <div className="py-8 px-4 text-center bg-slate-900/60 border border-dashed border-slate-800 rounded-3xl flex flex-col items-center justify-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-amber-400">
                  <Dumbbell className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white">No Exercises in Session</h4>
                  <p className="text-xs text-slate-400 mt-0.5 max-w-sm">
                    Tap below to choose movements from your library. Your previous sets, reps, and weights are automatically remembered.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsExercisePickerOpen(true)}
                  className="mt-1 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[3] shrink-0" />
                  <span>Add Exercise</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3.5">
                {/* Top Add Exercise Button */}
                <button
                  type="button"
                  onClick={() => setIsExercisePickerOpen(true)}
                  className="w-full py-3 px-4 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-400 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer shadow-sm"
                >
                  <Plus className="w-4 h-4 stroke-[3] shrink-0" />
                  <span>Add Exercise</span>
                </button>

                {activeWorkout.exercises.map((exercise, idx) => (
                  <WorkoutExerciseCard
                    key={`${exercise.exerciseId}-${idx}`}
                    exercise={exercise}
                    exerciseIndex={idx}
                    onUpdateSet={handleUpdateSet}
                    onAddSet={handleAddSet}
                    onRemoveSet={handleRemoveSet}
                    onRemoveExercise={handleRemoveExercise}
                    onOpenWeightPicker={handleOpenWeightPicker}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Sticky Bottom Action Bar during Workout */}
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-slate-800/90 p-3.5">
            <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleCancelWorkout}
                className="py-3 px-4 rounded-xl bg-slate-900 hover:bg-red-950/40 text-slate-400 hover:text-red-400 border border-slate-800 text-xs font-bold transition-colors cursor-pointer"
              >
                {editingCompletedId ? 'Discard Changes' : 'Discard'}
              </button>

              <div className="flex-1 text-center hidden sm:block">
                <span className="text-xs font-mono text-slate-400">
                  {activeWorkout.exercises.length} exercises ·{' '}
                  {activeWorkout.exercises.reduce((sum, ex) => sum + ex.sets.filter((s) => s.completed).length, 0)} sets completed
                </span>
              </div>

              <button
                type="button"
                onClick={handleRequestFinishWorkout}
                className="py-3 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-black text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/25 transition-all cursor-pointer"
              >
                <CheckCircle className="w-4 h-4 stroke-[3]" />
                <span>{editingCompletedId ? 'Save Changes & Update .FIT' : 'Finish & Export .FIT'}</span>
              </button>
            </div>
          </div>
        </main>
      ) : (
        /* ========================================================= */
        /* DASHBOARD: FAVORITED WORKOUTS SELECTOR & HISTORY */
        /* ========================================================= */
        <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-6">
          {/* Hero Banner with Quick Start */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden group select-none">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs uppercase font-extrabold tracking-wider text-amber-400 block font-mono">
                  {heroEyebrow}
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-1">
                  {heroHeading}
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-md">
                  {heroDescription}
                </p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 pt-2 sm:pt-0">
                <button
                  type="button"
                  onClick={handleStartBlankWorkout}
                  className="px-4 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-sm flex items-center gap-2 shadow-lg shadow-amber-500/25 transition-all cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-slate-950" />
                  <span>Start Empty Workout</span>
                </button>
              </div>
            </div>
          </div>

          {/* Navigation Tabs - Full Width Segmented Control */}
          <div className="w-full grid grid-cols-3 gap-1.5 p-1.5 bg-slate-950 rounded-2xl border border-slate-800 shadow-inner">
            {/* Tab 1: Workout Routines */}
            <button
              type="button"
              onClick={() => setActiveTab('workouts')}
              className={`py-2.5 px-1 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center ${
                activeTab === 'workouts'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
              }`}
            >
              <span className="hidden sm:inline">Workout Routines</span>
              <span className="sm:hidden">Routines</span>
              <span
                className={`text-[10px] sm:text-xs px-1.5 py-0.2 rounded-full font-mono ${
                  activeTab === 'workouts'
                    ? 'bg-slate-950/25 text-slate-950 font-black'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {templates.length}
              </span>
            </button>

            {/* Tab 2: Completed Workouts */}
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`py-2.5 px-1 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center ${
                activeTab === 'history'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
              }`}
            >
              <span className="hidden sm:inline">Completed Workouts</span>
              <span className="sm:hidden">Completed</span>
              <span
                className={`text-[10px] sm:text-xs px-1.5 py-0.2 rounded-full font-mono ${
                  activeTab === 'history'
                    ? 'bg-slate-950/25 text-slate-950 font-black'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {completedWorkouts.length}
              </span>
            </button>

            {/* Tab 3: Strava Activities */}
            <button
              type="button"
              onClick={() => setActiveTab('strava')}
              className={`py-2.5 px-1 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center ${
                activeTab === 'strava'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
              }`}
            >
              <span className="hidden sm:inline">Strava Activities</span>
              <span className="sm:hidden">Activities</span>
              {stravaActivities.length > 0 && (
                <span
                  className={`text-[10px] sm:text-xs px-1.5 py-0.2 rounded-full font-mono ${
                    activeTab === 'strava'
                      ? 'bg-slate-950/25 text-slate-950 font-black'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {stravaActivities.length}
                </span>
              )}
            </button>
          </div>

          {/* ======================================================= */}
          {/* TAB 1: WORKOUT SELECTOR (FAVORITED BY DEFAULT!) */}
          {/* ======================================================= */}
          {activeTab === 'workouts' && (
            <div className="space-y-4">
              {/* Filter: Defaults strictly to Favorited Routines & +New Routine */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center flex-wrap gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setTemplateFilter('favorites')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                      templateFilter === 'favorites'
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${
                        templateFilter === 'favorites' ? 'fill-slate-950' : 'fill-amber-400 text-amber-400'
                      }`}
                    />
                    <span>Favorited Workouts ({templates.filter((t) => t.isFavorite).length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTemplateFilter('all')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      templateFilter === 'all'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>All Routines ({templates.length})</span>
                  </button>
                  <div className="h-4 w-px bg-slate-800 my-auto hidden sm:block" />
                  <button
                    type="button"
                    onClick={handleStartCreateRoutine}
                    className="px-3 py-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 hover:bg-slate-800/60 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                    <span>New Routine</span>
                  </button>
                </div>
              </div>

              {/* Routine Cards Grid */}
              {templateFilter === 'favorites' && templates.filter((t) => t.isFavorite).length === 0 && (
                <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-3 text-xs text-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    <span className="font-bold text-white">Favorited routines start blank.</span> Tap the ★ on any routine below to pin it to your favorites.
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 shrink-0">Showing all templates:</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {(templateFilter === 'favorites' && templates.filter((t) => t.isFavorite).length === 0
                  ? templates
                  : filteredTemplates
                ).map((tpl) => {
                  const routineExercises = tpl.exerciseIds
                    .map((id) => exercises.find((e) => e.id === id))
                    .filter(Boolean) as Exercise[];

                  return (
                    <div
                      key={tpl.id}
                      className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-3xl p-4 sm:p-5 flex flex-col justify-between gap-4 transition-all shadow-md group"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0 pr-1">
                            <h3 className="text-base font-extrabold text-white group-hover:text-amber-400 transition-colors truncate">
                              {tpl.title}
                            </h3>
                            <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                              {tpl.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleToggleFavoriteTemplate(tpl.id)}
                              title={tpl.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                            >
                              <Star
                                className={`w-4 h-4 ${
                                  tpl.isFavorite ? 'fill-amber-400 text-amber-400' : 'text-slate-600'
                                }`}
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEditRoutine(tpl)}
                              title="Edit routine"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRoutineToDelete(tpl)}
                              title="Delete routine"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Exercise Items Preview */}
                        <div className="mt-3.5 pt-3 border-t border-slate-800/80 space-y-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-1">
                            Exercises ({routineExercises.length})
                          </span>
                          <div className="space-y-1 text-xs">
                            {routineExercises.slice(0, 4).map((ex) => (
                              <div key={ex.id} className="flex items-center justify-between text-slate-300">
                                <span className="font-medium truncate">{ex.name}</span>
                                {ex.lastUsed && (
                                  <span className="text-[11px] font-mono text-slate-500 shrink-0 ml-2">
                                    Last {ex.lastUsed.weightKg.toFixed(1)}kg
                                  </span>
                                )}
                              </div>
                            ))}
                            {routineExercises.length > 4 && (
                              <div className="text-[11px] text-amber-400/80 font-medium">
                                + {routineExercises.length - 4} more exercises
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Start Routine Button */}
                      <button
                        type="button"
                        onClick={() => handleStartTemplateWorkout(tpl)}
                        className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-amber-500 text-slate-200 hover:text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 border border-slate-700/80 hover:border-amber-400 transition-all cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Start This Routine</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ======================================================= */}
          {/* TAB 2: COMPLETED WORKOUTS HISTORY */}
          {/* ======================================================= */}
          {activeTab === 'history' && (
            <div className="space-y-3.5">
              {completedWorkouts.length === 0 ? (
                <div className="py-16 text-center text-slate-500 bg-slate-950/50 rounded-2xl border border-slate-800">
                  <History className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm">No workouts completed yet.</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Start a workout above, finish it, and your Strava-compatible .FIT files will be saved here.
                  </p>
                </div>
              ) : (
                completedWorkouts.map((wkt) => (
                  <div
                    key={wkt.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 shadow-md"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-bold text-white">{wkt.title}</h4>
                          <span className="text-xs text-slate-500">
                            {new Date(wkt.startTime).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 font-mono">
                          <span>{Math.floor(wkt.durationSeconds / 60)} mins</span>
                          <span aria-hidden="true" className="text-slate-700">·</span>
                          <span className="text-amber-400 font-bold">{wkt.totalVolumeKg.toLocaleString()} kg</span>
                          <span aria-hidden="true" className="text-slate-700">·</span>
                          <span>{wkt.totalSets} sets</span>
                          <span aria-hidden="true" className="text-slate-700">·</span>
                          <span>{wkt.exercises.length} exercises</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap sm:flex-nowrap">
                        {/* Download .FIT Button with just icon and .FIT text */}
                        <button
                          type="button"
                          onClick={() => downloadFitFile(wkt)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Download .FIT file"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>.FIT</span>
                        </button>

                        {/* Small square orange icon to upload to Strava */}
                        <button
                          type="button"
                          onClick={() => handleUploadCompletedToStrava(wkt)}
                          disabled={stravaUploadStatus?.id === wkt.id && stravaUploadStatus.loading}
                          className="w-8 h-8 rounded-xl bg-[#FC5200] hover:bg-[#e04900] active:scale-95 text-white flex items-center justify-center shadow-md shadow-[#FC5200]/25 transition-all cursor-pointer font-black text-xs shrink-0 disabled:opacity-50"
                          title="Upload directly to Strava"
                        >
                          {stravaUploadStatus?.id === wkt.id && stravaUploadStatus.loading ? (
                            <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <UploadCloud className="w-4 h-4" />
                          )}
                        </button>

                        {/* Icon to edit the existing workout */}
                        <button
                          type="button"
                          onClick={() => handleEditCompletedWorkout(wkt)}
                          className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 flex items-center justify-center transition-colors cursor-pointer"
                          title="Edit workout details"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        {/* Red X button to delete with confirm dialogue */}
                        <button
                          type="button"
                          onClick={() => setWorkoutToDelete(wkt)}
                          className="w-8 h-8 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/60 flex items-center justify-center transition-colors cursor-pointer"
                          title="Delete workout"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Strava upload inline toast/feedback */}
                    {stravaUploadStatus?.id === wkt.id && (
                      <div
                        className={`p-2.5 rounded-xl text-xs flex items-center justify-between gap-2 animate-fade-in ${
                          stravaUploadStatus.loading
                            ? 'bg-amber-950/50 border border-amber-800/80 text-amber-300'
                            : stravaUploadStatus.success
                            ? 'bg-emerald-950/60 border border-emerald-800/80 text-emerald-300'
                            : 'bg-rose-950/60 border border-rose-800/80 text-rose-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {stravaUploadStatus.loading && (
                            <span className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
                          )}
                          <span className="font-medium">{stravaUploadStatus.message}</span>
                        </div>
                        {stravaUploadStatus.activityId && (
                          <a
                            href={`https://www.strava.com/activities/${stravaUploadStatus.activityId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline text-emerald-300 hover:text-white flex items-center gap-1 shrink-0 font-bold ml-2"
                          >
                            <span>View</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* ======================================================= */}
          {/* TAB 3: STRAVA ACTIVITIES */}
          {/* ======================================================= */}
          {activeTab === 'strava' && (
            <StravaActivitiesTab
              stravaToken={stravaToken}
              athleteName={athleteName}
              activities={stravaActivities}
              activityDetails={stravaActivityDetails}
              athleteProfile={athleteProfile}
              loading={isLoadingStravaActivities}
              loadingMore={isLoadingMoreStrava}
              hasMore={hasMoreStrava}
              error={stravaActivitiesError}
              isGoogleConnected={isGoogleConnected}
              googleUserEmail={googleUserEmail}
              googleSheetUrl={googleSheetUrl}
              onRefresh={refreshStravaActivities}
              onLoadMore={handleLoadMoreStravaActivities}
              onConnectGoogle={handleConnectGoogle}
              onDisconnectGoogle={handleDisconnectGoogle}
              onOpenStravaSettings={() => setIsStravaSettingsOpen(true)}
              onActivityPublished={handleActivityPublished}
              onOpenAthleteProfile={() => setIsAthleteProfileOpen(true)}
            />
          )}

        </main>
      )}

      {/* ========================================================= */}
      {/* MODALS */}
      {/* ========================================================= */}


      {/* Athlete Physiology, Zones & Unified Settings Modal */}
      <AthleteProfileModal
        isOpen={isAthleteProfileOpen}
        onClose={() => setIsAthleteProfileOpen(false)}
        profile={athleteProfile}
        onSaveProfile={handleSaveAthleteProfile}
        onResetDefaults={handleResetAthleteProfile}
        goals={athleteGoals}
        onSaveGoals={handleSaveAthleteGoals}
        initialTab={profileModalTab}
        stravaActivities={stravaActivities}
        theme={theme}
        onThemeChanged={handleThemeChanged}
        displayDensity={displayDensity}
        onDensityChanged={handleDensityChanged}
        brandTitle={brandTitle}
        brandSubtitle={brandSubtitle}
        onSaveBrand={(title, subtitle) => {
          setBrandTitle(title);
          setBrandSubtitle(subtitle);
          localStorage.setItem(STORAGE_KEYS.BRAND_TITLE, title);
          localStorage.setItem(STORAGE_KEYS.BRAND_SUBTITLE, subtitle);
        }}
        onResetBrand={() => {
          setBrandTitle('GymFIT');
          setBrandSubtitle('Workout Log & Strava Uploader');
          localStorage.removeItem(STORAGE_KEYS.BRAND_TITLE);
          localStorage.removeItem(STORAGE_KEYS.BRAND_SUBTITLE);
        }}
        heroEyebrow={heroEyebrow}
        heroHeading={heroHeading}
        heroDescription={heroDescription}
        onSaveHeroText={(eyebrow, heading, desc) => {
          setHeroEyebrow(eyebrow);
          setHeroHeading(heading);
          setHeroDescription(desc);
          localStorage.setItem(STORAGE_KEYS.HERO_EYEBROW, eyebrow);
          localStorage.setItem(STORAGE_KEYS.HERO_HEADING, heading);
          localStorage.setItem(STORAGE_KEYS.HERO_DESCRIPTION, desc);
        }}
        onResetHeroText={handleResetHeroText}
      />

      {/* 1. Multi-Figure Digit Drum Weight Scroll Wheel */}
      <WeightScrollPicker
        isOpen={weightPickerState.isOpen}
        initialWeight={weightPickerState.weight}
        exerciseName={weightPickerState.exerciseName}
        onClose={() => setWeightPickerState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmWeightFromPicker}
      />

      {/* 2. Exercise Picker (Defaults Strictly to Favorited Movements) */}
      <ExercisePickerModal
        isOpen={isExercisePickerOpen}
        onClose={() => setIsExercisePickerOpen(false)}
        exercises={exercises}
        onSelectExercise={handleAddExerciseToActiveWorkout}
        onToggleFavorite={handleToggleFavoriteExercise}
      />

      {/* 3. Strava Settings & 1-Click OAuth Modal */}
      <StravaSettingsModal
        isOpen={isStravaSettingsOpen}
        onClose={() => setIsStravaSettingsOpen(false)}
        stravaAccessToken={stravaToken}
        athleteName={athleteName}
        onTokenUpdated={handleTokenUpdated}
      />

      {/* 4. Workout Completed Summary & Strava Export Modal */}
      <WorkoutSummaryModal
        isOpen={isSummaryOpen}
        workout={justCompletedWorkout}
        stravaAccessToken={stravaToken}
        onConnectStrava={() => {
          setIsSummaryOpen(false);
          setIsStravaSettingsOpen(true);
        }}
        onClose={() => setIsSummaryOpen(false)}
        onExitWorkout={() => {
          setIsSummaryOpen(false);
          setActiveWorkout(null);
          setEditingCompletedId(null);
          localStorage.removeItem(STORAGE_KEYS.ACTIVE);
        }}
        onSaveToHistory={(updated) => {
          setCompletedWorkouts((prev) =>
            prev.map((w) => (w.id === updated.id ? updated : w))
          );
        }}
      />

      {/* 5. Are you sure finish workout confirmation modal */}
      {showFinishConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl text-slate-100 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">
                  {editingCompletedId ? 'Save Changes?' : 'Finish Workout?'}
                </h3>
                <p className="text-xs text-slate-400">
                  {editingCompletedId
                    ? 'Save updated reps, weights, and sets to this completed workout history?'
                    : 'Are you sure you want to finish and review the .FIT export?'}
                </p>
              </div>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowFinishConfirm(false)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
              >
                {editingCompletedId ? 'Continue Editing' : 'Continue Workout'}
              </button>
              <button
                type="button"
                onClick={handleConfirmFinishWorkout}
                className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
              >
                {editingCompletedId ? 'Yes, Save Changes' : 'Yes, Finish & Export'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Create / Edit Routine Modal */}
      {isCreatingRoutine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col gap-4 text-slate-100 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">
                {editingRoutineId ? 'Edit Routine' : 'Create New Routine'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsCreatingRoutine(false);
                  setEditingRoutineId(null);
                }}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Routine Title *
                </label>
                <input
                  type="text"
                  required
                  value={newRoutineTitle}
                  onChange={(e) => setNewRoutineTitle(e.target.value)}
                  placeholder="e.g. Upper Body Power, Chest & Arms"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={newRoutineDesc}
                  onChange={(e) => setNewRoutineDesc(e.target.value)}
                  placeholder="e.g. Heavy compounds with hypertrophy arm finishers"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300 uppercase">
                    Select Exercises ({newRoutineExerciseIds.length} selected)
                  </label>
                  <span className="text-[10px] text-amber-400 font-medium">Favorites shown first ★</span>
                </div>
                <div className="max-h-52 overflow-y-auto space-y-1.5 p-1.5 bg-slate-950 rounded-xl border border-slate-800">
                  {sortedExercisesForRoutine.map((ex) => {
                    const isSelected = newRoutineExerciseIds.includes(ex.id);
                    return (
                      <div
                        key={ex.id}
                        onClick={() => {
                          if (isSelected) {
                            setNewRoutineExerciseIds(newRoutineExerciseIds.filter((id) => id !== ex.id));
                          } else {
                            setNewRoutineExerciseIds([...newRoutineExerciseIds, ex.id]);
                          }
                        }}
                        className={`p-2.5 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                            : 'hover:bg-slate-800/80 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {ex.isFavorite ? (
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
                          ) : (
                            <span className="w-3.5 h-3.5 inline-block" />
                          )}
                          <span className="font-medium">{ex.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-500">{ex.categories.join(', ')}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsCreatingRoutine(false);
                  setEditingRoutineId(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!newRoutineTitle.trim()) return;
                  if (editingRoutineId) {
                    setTemplates((prev) =>
                      prev.map((t) =>
                        t.id === editingRoutineId
                          ? {
                              ...t,
                              title: newRoutineTitle.trim(),
                              description: newRoutineDesc.trim(),
                              exerciseIds: newRoutineExerciseIds,
                            }
                          : t
                      )
                    );
                  } else {
                    const newTpl: WorkoutTemplate = {
                      id: `tpl-${Date.now()}`,
                      title: newRoutineTitle.trim(),
                      description: newRoutineDesc.trim(),
                      isFavorite: true,
                      exerciseIds: newRoutineExerciseIds,
                    };
                    setTemplates((prev) => [newTpl, ...prev]);
                  }
                  setIsCreatingRoutine(false);
                  setEditingRoutineId(null);
                  setNewRoutineTitle('');
                  setNewRoutineDesc('');
                  setNewRoutineExerciseIds([]);
                }}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-md shadow-amber-500/20 transition-all cursor-pointer"
              >
                {editingRoutineId ? 'Save Changes' : 'Save Routine'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Delete Completed Workout Confirm Dialog */}
      {workoutToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl text-slate-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-950/60 border border-rose-800/80 text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">Delete Workout?</h4>
                <p className="text-xs text-slate-400">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800 leading-relaxed">
              Are you sure you want to delete <strong className="text-white">&ldquo;{workoutToDelete.title}&rdquo;</strong> recorded on{' '}
              <span className="text-amber-400 font-mono">{new Date(workoutToDelete.startTime).toLocaleDateString()}</span>?
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setWorkoutToDelete(null)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteWorkout}
                className="flex-1 py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-900/30 transition-all cursor-pointer"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Delete Routine Confirm Dialog */}
      {routineToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl text-slate-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-950/60 border border-rose-800/80 text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">Delete Routine?</h4>
                <p className="text-xs text-slate-400">Remove from routine templates.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800 leading-relaxed">
              Are you sure you want to delete the routine <strong className="text-white">&ldquo;{routineToDelete.title}&rdquo;</strong>?
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRoutineToDelete(null)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteRoutine}
                className="flex-1 py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-900/30 transition-all cursor-pointer"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Discard Workout Confirmation Modal */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl text-slate-100 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-950/60 border border-rose-800/80 text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">
                  {editingCompletedId ? 'Discard Changes?' : 'Discard Workout?'}
                </h3>
                <p className="text-xs text-slate-400">
                  {editingCompletedId
                    ? 'Leave without saving changes to this completed workout? Your original activity will remain untouched.'
                    : 'Are you sure you want to discard this workout? All progress and logged sets will be lost.'}
                </p>
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
              >
                {editingCompletedId ? 'Keep Editing' : 'Keep Training'}
              </button>
              <button
                type="button"
                onClick={handleConfirmDiscardWorkout}
                className="flex-1 py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-md shadow-rose-900/30 transition-all cursor-pointer"
              >
                {editingCompletedId ? 'Yes, Discard Changes' : 'Yes, Discard Workout'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10. Switch to Edit Completed Workout Confirmation Modal */}
      {pendingWorkoutToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl text-slate-100 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/40 shrink-0">
                <Pencil className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white">Switch to Edit Activity?</h3>
                <p className="text-xs text-slate-400">
                  You have an active workout in progress. Switching will discard unsaved in-progress sets and open &ldquo;{pendingWorkoutToEdit.title}&rdquo; for editing.
                </p>
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setPendingWorkoutToEdit(null)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel / Keep Workout
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = pendingWorkoutToEdit;
                  setPendingWorkoutToEdit(null);
                  startEditingCompletedWorkout(target);
                }}
                className="flex-1 py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md shadow-amber-500/20 transition-all cursor-pointer"
              >
                Switch & Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 11. Customize Studio Banner Text (600ms Long-Press Modal) */}
      {isEditingHeroModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl text-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                  <Pencil className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-bold text-white">Customize Studio Text</h4>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingHeroModal(false)}
                className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                  Eyebrow Label
                </label>
                <input
                  type="text"
                  value={tempHeroEyebrow}
                  onChange={(e) => setTempHeroEyebrow(e.target.value)}
                  placeholder="e.g. LOG · PUBLISH · REPEAT"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-amber-400 text-xs font-bold uppercase tracking-wider focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                  Main Heading
                </label>
                <input
                  type="text"
                  value={tempHeroHeading}
                  onChange={(e) => setTempHeroHeading(e.target.value)}
                  placeholder="e.g. Ready to Train?"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-base font-extrabold focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                  Description Text
                </label>
                <textarea
                  rows={3}
                  value={tempHeroDescription}
                  onChange={(e) => setTempHeroDescription(e.target.value)}
                  placeholder="e.g. Log every set as you train, starting from last session’s weights..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-amber-400 resize-none leading-relaxed"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleResetHeroText}
                className="px-2.5 py-1.5 text-[11px] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                Reset Default
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingHeroModal(false)}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveHeroText}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
