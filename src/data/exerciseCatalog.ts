import type { ExerciseCatalogItem } from '../types/workout';
import csv from './exercises.csv?raw';
import fitDefinitionsJson from './fitExerciseDefinitions.json?raw';
import defaultFavoriteIdsJson from './defaultFavoriteExerciseIds.json?raw';
import legacyExerciseIdsJson from './legacyExerciseIds.json?raw';

export interface FitExerciseDefinition {
  category: number;
  subtype: number;
}

function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const character = line[i];
    if (character === '"') {
      if (quoted && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
}

function parseExerciseCatalog(source: string): ExerciseCatalogItem[] {
  const lines = source.trim().split(/\r?\n/);
  const headers = parseCsvRow(lines[0]);
  const indexOf = (header: string) => {
    const index = headers.indexOf(header);
    if (index < 0) throw new Error(`Exercise catalog is missing column "${header}"`);
    return index;
  };
  const idIndex = indexOf('Exercise ID');
  const nameIndex = indexOf('Human readable Strava name');
  const fitTypeIndex = indexOf('Garmin Enum Name');
  const categoryIndex = indexOf('Category');
  const muscleMapIndex = indexOf('Strava Muscle Map');
  const ids = new Set<number>();

  return lines.slice(1).map((line) => {
    const fields = parseCsvRow(line);
    const id = Number(fields[idIndex]);
    const name = fields[nameIndex]?.trim();
    const fitExerciseType = fields[fitTypeIndex]?.trim();
    if (!Number.isSafeInteger(id) || id < 1 || !name || !fitExerciseType || ids.has(id)) {
      throw new Error(`Invalid or duplicate exercise catalog row: ${line}`);
    }
    ids.add(id);

    return {
      id,
      name,
      fitExerciseType,
      categories: fields[categoryIndex]
        .split(',')
        .map((category) => category.trim())
        .filter(Boolean),
      stravaMuscleMap: fields[muscleMapIndex]
        .split(',')
        .map((muscle) => muscle.trim())
        .filter(Boolean),
    };
  });
}

export const INITIAL_EXERCISES = parseExerciseCatalog(csv);
export const FIT_EXERCISE_DEFINITIONS = JSON.parse(
  fitDefinitionsJson
) as Record<string, FitExerciseDefinition>;
export const DEFAULT_FAVORITE_EXERCISE_IDS = JSON.parse(defaultFavoriteIdsJson) as number[];
export const LEGACY_EXERCISE_IDS = JSON.parse(legacyExerciseIdsJson) as Record<string, number>;

const exerciseById = new Map(INITIAL_EXERCISES.map((exercise) => [exercise.id, exercise]));

export function getExerciseById(id: number): ExerciseCatalogItem | undefined {
  return exerciseById.get(id);
}

export function getFitExerciseDefinition(exerciseType: string): FitExerciseDefinition {
  const definition = FIT_EXERCISE_DEFINITIONS[exerciseType];
  if (!definition) {
    throw new Error(`Unsupported Garmin FIT exercise type: ${exerciseType}`);
  }
  return definition;
}

export function resolveExerciseId(id: number | string): number | undefined {
  if (typeof id === 'number') return exerciseById.has(id) ? id : undefined;
  return LEGACY_EXERCISE_IDS[id];
}
