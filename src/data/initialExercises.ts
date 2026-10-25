import { INITIAL_EXERCISES, LEGACY_EXERCISE_IDS } from './exerciseCatalog';
import type { WorkoutTemplate } from '../types/workout';

function legacyIds(...ids: string[]): number[] {
  return ids.map((id) => {
    const exerciseId = LEGACY_EXERCISE_IDS[id];
    if (!exerciseId) throw new Error(`Missing catalog migration for template exercise ${id}`);
    return exerciseId;
  });
}

function exerciseIdByFitType(fitType: string): number {
  const match = INITIAL_EXERCISES.find((exercise) => exercise.fitExerciseType === fitType);
  if (!match) throw new Error(`Missing catalog exercise for FIT type ${fitType}`);
  return match.id;
}

export const INITIAL_TEMPLATES: WorkoutTemplate[] = [
  {
    id: 'tpl-1',
    title: 'Push Power (Chest, Shoulders, Triceps)',
    description: 'Flat barbell bench press, incline dumbbell press, lateral raises, and cable triceps pushdowns',
    isFavorite: false,
    exerciseIds: legacyIds('ex-chest-1', 'ex-chest-5', 'ex-sh-5', 'ex-arm-15'),
  },
  {
    id: 'tpl-2',
    title: 'Pull & Posterior Chain (Back & Biceps)',
    description: 'Conventional deadlifts, wide grip lat pulldowns, seated cable rows, and dumbbell curls',
    isFavorite: false,
    exerciseIds: legacyIds('ex-back-1', 'ex-back-8', 'ex-back-10', 'ex-arm-4'),
  },
  {
    id: 'tpl-3',
    title: 'Legs & Core Strength',
    description: 'Heavy back squats, 45° leg press, seated hamstring curls, and cable kneeling rope crunches',
    isFavorite: false,
    exerciseIds: legacyIds('ex-leg-1', 'ex-leg-10', 'ex-leg-14', 'ex-core-1'),
  },
  {
    id: 'tpl-4',
    title: 'Full Body Functional & Kettlebell',
    description: 'Explosive kettlebell swings, Turkish get-ups, goblet squats, and dumbbell thrusters',
    isFavorite: false,
    exerciseIds: legacyIds('ex-leg-19', 'ex-fb-4', 'ex-leg-20', 'ex-fb-3'),
  },
  {
    id: 'tpl-5',
    title: 'Total Body & Core Conditioning',
    description: '18-exercise workout with external rotations, face pulls, leg extensions, raises, core, and presses',
    isFavorite: false,
    exerciseIds: [
      'FORTY_FIVE_DEGREE_CABLE_EXTERNAL_ROTATION',
      'FACE_PULL',
      'MACHINE_LEG_EXTENSION',
      'LATERAL_RAISE_GENERIC',
      'MEDICINE_BALL_CRUNCH',
      'SL_COPENHAGEN_PLANK',
      'DUMBBELL_FLOOR_PRESS',
      'HANGING_LEG_RAISE',
      'AB_CRUNCH_MACHINE',
      'MACHINE_LEG_CURL_SEATED',
      'MACHINE_LEG_PRESS',
      'SINGLE_LEG_GLUTE_BRIDGE',
      'SINGLE_LEG_ROMANIAN_DEADLIFTS',
      'LAT_PULLDOWN',
      'SCAPULAR_RETRACTION',
      'STEP_DOWN',
      'GLUTE_BRIDGE',
      'CABLE_OVERHEAD_TRICEPS_EXTENSION',
    ].map(exerciseIdByFitType),
  },
];
