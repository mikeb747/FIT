import { CompletedWorkout, WorkoutExercise } from '../types/workout';
import { getExerciseById, getFitExerciseDefinition } from '../data/exerciseCatalog';
import { getDefaultActivityName } from './activityName';

// FIT CRC-16 Lookup Table (CCITT-FIT)
const CRC_TABLE = [
  0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
  0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400,
];

function updateCrc(crc: number, byte: number): number {
  let tmp = CRC_TABLE[crc & 0x0F];
  crc = (crc >> 4) & 0x0FFF;
  crc = crc ^ tmp ^ CRC_TABLE[byte & 0x0F];

  tmp = CRC_TABLE[crc & 0x0F];
  crc = (crc >> 4) & 0x0FFF;
  crc = crc ^ tmp ^ CRC_TABLE[(byte >> 4) & 0x0F];
  return crc;
}

function calculateCrc(bytes: Uint8Array, start = 0, length = bytes.length): number {
  let crc = 0;
  for (let i = start; i < start + length; i++) {
    crc = updateCrc(crc, bytes[i]);
  }
  return crc;
}

// Convert Unix milliseconds to Garmin Epoch seconds (seconds since 1989-12-31 00:00:00 UTC)
const GARMIN_EPOCH_DELTA = 631065600;
export function toGarminTime(unixTimestampMs: number): number {
  const unixSec = Math.floor(unixTimestampMs / 1000);
  return Math.max(0, unixSec - GARMIN_EPOCH_DELTA);
}

function getWorkoutExerciseDefinition(
  exercise: Pick<WorkoutExercise, 'exerciseId'>
) {
  if (exercise.exerciseId === null) {
    throw new Error('This saved exercise is not in the current catalog and cannot be exported as a FIT file.');
  }
  const catalogExercise = getExerciseById(exercise.exerciseId);
  if (!catalogExercise) throw new Error(`Unknown exercise catalog ID: ${exercise.exerciseId}`);
  return getFitExerciseDefinition(catalogExercise.fitExerciseType);
}

class ByteWriter {
  private buffer: number[] = [];

  writeUint8(val: number) {
    this.buffer.push(val & 0xFF);
  }

  writeUint16LE(val: number) {
    this.buffer.push(val & 0xFF);
    this.buffer.push((val >> 8) & 0xFF);
  }

  writeUint32LE(val: number) {
    this.buffer.push(val & 0xFF);
    this.buffer.push((val >> 8) & 0xFF);
    this.buffer.push((val >> 16) & 0xFF);
    this.buffer.push((val >> 24) & 0xFF);
  }

  writeString(str: string, fixedLength: number) {
    for (let i = 0; i < fixedLength; i++) {
      if (i < str.length) {
        this.buffer.push(str.charCodeAt(i) & 0xFF);
      } else {
        this.buffer.push(0);
      }
    }
  }

  writeBytes(bytes: number[] | Uint8Array) {
    for (let i = 0; i < bytes.length; i++) {
      this.buffer.push(bytes[i]);
    }
  }

  get length(): number {
    return this.buffer.length;
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Garmin FIT exercise_category enum:
 * 0: bench_press
 * 1: calf_raise
 * 2: cardio
 * 3: carry
 * 4: chop
 * 5: core
 * 6: crunch
 * 7: curl
 * 8: deadlift
 * 9: flye
 * 10: hip_raise
 * 11: hip_stability
 * 12: hip_swing
 * 13: hyperextension
 * 14: lateral_raise
 * 15: leg_curl
 * 16: leg_raise
 * 17: lunge
 * 18: olympic_lift
 * 19: plank
 * 20: plyo
 * 21: pull_up
 * 22: push_up
 * 23: row
 * 24: shoulder_press
 * 25: shoulder_stability
 * 26: shrug
 * 27: sit_up
 * 28: squat
 * 29: total_body
 * 30: triceps_extension
 * 31: warm_up
 * 32: run
 * 65534: unknown
 */
export function getGarminExerciseCategory(name: string, targetMuscle?: string): { category: number; subtype: number } {
  const n = (name || '').toLowerCase().trim();

  // 1. Bench Press & Chest Presses (only horizontal/incline chest presses, not shoulder presses!)
  if (
    n.includes('bench press') ||
    n.includes('chest press') ||
    n.includes('floor press') ||
    n.includes('board press') ||
    (n.includes('incline press') && !n.includes('shoulder') && !n.includes('overhead') && !n.includes('arnold')) ||
    (n.includes('decline press') && !n.includes('shoulder'))
  ) {
    const subtype = n.includes('close') ? 4 : (n.includes('incline') ? 8 : (n.includes('decline') ? 5 : (n.includes('dumbbell') ? 6 : 1)));
    return { category: 0, subtype };
  }

  // 2. Shoulder Presses & Overhead Press (distinct from chest bench press!)
  if (
    n.includes('shoulder press') ||
    n.includes('overhead press') ||
    n.includes('military press') ||
    n.includes('arnold') ||
    n.includes('push press') ||
    n.includes('strict press') ||
    n.includes('ohp') ||
    (n.includes('press') && (n.includes('shoulder') || n.includes('overhead') || targetMuscle === 'shoulders'))
  ) {
    const subtype = n.includes('arnold') ? 0 : (n.includes('dumbbell') ? 7 : (n.includes('push') ? 11 : 1));
    return { category: 24, subtype };
  }

  // 3. Squats & Leg presses
  if (
    n.includes('squat') ||
    n.includes('leg press') ||
    n.includes('hack squat') ||
    n.includes('goblet') ||
    n.includes('sissy squat') ||
    n.includes('belt squat') ||
    n.includes('wall sit')
  ) {
    const subtype = n.includes('leg press') ? 0 : (n.includes('front') ? 8 : (n.includes('goblet') ? 37 : (n.includes('box') ? 7 : 6)));
    return { category: 28, subtype };
  }

  // 4. Deadlift & RDL & Good Mornings
  if (
    n.includes('deadlift') ||
    n.includes('rdl') ||
    n.includes('stiff leg') ||
    n.includes('romanian') ||
    n.includes('good morning')
  ) {
    const subtype = (n.includes('rdl') || n.includes('romanian') || n.includes('stiff')) ? 2 : (n.includes('sumo') ? 3 : 0);
    return { category: 8, subtype };
  }

  // 5. Bicep Curls (distinct from leg curls!)
  if (n.includes('curl') && !n.includes('leg curl') && !n.includes('hamstring curl')) {
    const subtype = n.includes('hammer') ? 8 : (n.includes('incline') ? 12 : (n.includes('cable') ? 2 : (n.includes('preacher') ? 22 : 0)));
    return { category: 7, subtype };
  }

  // 6. Triceps Extensions, Pushdowns, Dips, Skull Crushers
  if (
    n.includes('tricep') ||
    n.includes('pushdown') ||
    n.includes('dip') ||
    n.includes('skull') ||
    n.includes('kickback') ||
    n.includes('french press')
  ) {
    const subtype = n.includes('dip') ? 4 : (n.includes('pushdown') ? 22 : (n.includes('skull') ? 10 : 0));
    return { category: 30, subtype };
  }

  // 7. Rows & Lat Pulldowns
  if (
    n.includes('row') ||
    n.includes('pulldown') ||
    n.includes('lat pull') ||
    n.includes('pull down')
  ) {
    const subtype = n.includes('pulldown') || n.includes('lat') ? 13 : (n.includes('dumbbell') ? 12 : (n.includes('cable') ? 5 : 0));
    return { category: 23, subtype };
  }

  // 8. Pull-ups & Chin-ups
  if (
    n.includes('pull up') ||
    n.includes('pull-up') ||
    n.includes('chin up') ||
    n.includes('chin-up')
  ) {
    const subtype = n.includes('chin') ? 0 : 1;
    return { category: 21, subtype };
  }

  // 9. Lateral Raises, Front Raises, Face Pulls, Delts
  if (
    n.includes('lateral raise') ||
    n.includes('front raise') ||
    n.includes('rear delt') ||
    n.includes('face pull') ||
    n.includes('upright row')
  ) {
    const subtype = n.includes('front') ? 0 : (n.includes('rear') ? 5 : 1);
    return { category: 14, subtype };
  }

  // 10. Chest Flyes & Cable Crossover
  if (
    n.includes('fly') ||
    n.includes('pec deck') ||
    n.includes('cable crossover')
  ) {
    const subtype = n.includes('incline') ? 2 : (n.includes('cable') ? 0 : 1);
    return { category: 9, subtype };
  }

  // 11. Leg Curls
  if (n.includes('leg curl') || n.includes('hamstring curl')) {
    const subtype = n.includes('seated') ? 2 : 0;
    return { category: 15, subtype };
  }

  // 12. Leg Extensions
  if (n.includes('leg extension') || n.includes('quad extension')) {
    return { category: 28, subtype: 0 };
  }

  // 13. Calves
  if (n.includes('calf') || n.includes('calves')) {
    const subtype = n.includes('seated') ? 2 : 1;
    return { category: 1, subtype };
  }

  // 14. Lunges & Step-ups
  if (n.includes('lunge') || n.includes('step up') || n.includes('split squat')) {
    const subtype = n.includes('reverse') ? 8 : (n.includes('walking') ? 11 : 0);
    return { category: 17, subtype };
  }

  // 15. Hip Thrusts & Glute Bridges & Abductors
  if (
    n.includes('hip thrust') ||
    n.includes('glute bridge') ||
    n.includes('abductor') ||
    n.includes('adductor') ||
    n.includes('pull-through') ||
    n.includes('kickback')
  ) {
    const subtype = n.includes('thrust') ? 0 : 2;
    return { category: 10, subtype };
  }

  // 16. Planks, Isometric Core & Holds
  if (
    n.includes('plank') ||
    n.includes('hollow body') ||
    n.includes('ab roll') ||
    n.includes('dead bug') ||
    n.includes('bird dog')
  ) {
    const subtype = n.includes('side') ? 8 : 0;
    return { category: 19, subtype };
  }

  // 17. Crunches, Sit-ups & Core Rotation
  if (
    n.includes('crunch') ||
    n.includes('sit up') ||
    n.includes('sit-up') ||
    n.includes('leg raise') ||
    n.includes('russian twist') ||
    n.includes('woodchopper') ||
    n.includes('chop') ||
    n.includes('windmill')
  ) {
    if (n.includes('chop') || n.includes('woodchopper')) return { category: 4, subtype: 0 };
    if (n.includes('sit up') || n.includes('sit-up')) return { category: 27, subtype: 0 };
    return { category: 6, subtype: 0 };
  }

  // 18. Push-ups
  if (n.includes('push up') || n.includes('push-up') || n.includes('pushup')) {
    return { category: 22, subtype: 0 };
  }

  // 19. Shrugs
  if (n.includes('shrug')) {
    return { category: 26, subtype: 0 };
  }

  // 20. Hip Swings (Kettlebell Swings)
  if (n.includes('swing')) {
    return { category: 12, subtype: 0 };
  }

  // 21. Carries & Holds
  if (n.includes('carry') || n.includes('farmer') || n.includes('walk') || n.includes('dead hang') || n.includes('hang')) {
    return { category: 3, subtype: 0 };
  }

  // 22. Olympic Lifts & Power Movements
  if (n.includes('clean') || n.includes('snatch') || n.includes('jerk')) {
    return { category: 18, subtype: 0 };
  }

  // 23. Full Body / Thrusters / Get-ups
  if (n.includes('thruster') || n.includes('get-up') || n.includes('getup') || n.includes('halo')) {
    return { category: 29, subtype: 0 };
  }

  // Fallback strictly according to target muscle group
  switch (targetMuscle) {
    case 'biceps':
      return { category: 7, subtype: 0 }; // curl
    case 'triceps':
      return { category: 30, subtype: 0 }; // triceps_extension
    case 'back':
      return { category: 23, subtype: 0 }; // row
    case 'shoulders':
      return { category: 24, subtype: 1 }; // shoulder_press
    case 'chest':
      return { category: 0, subtype: 1 }; // bench_press
    case 'legs':
      return { category: 28, subtype: 6 }; // squat
    case 'core':
      return { category: 19, subtype: 0 }; // plank / core
    case 'full_body':
      return { category: 29, subtype: 0 }; // total_body
    default:
      return { category: 29, subtype: 0 }; // total_body
  }
}

/**
 * Encodes a completed strength workout into a valid Garmin FIT Activity binary file.
 * Strava specifically parses Set Messages (mesg 225) with repetitions, weight, duration, and exercise info.
 */
export function generateFitFile(workout: CompletedWorkout): Uint8Array {
  const records = new ByteWriter();

  const startGarminTime = toGarminTime(workout.startTime);
  const endGarminTime = toGarminTime(workout.endTime);
  const durationMs = Math.max(1000, workout.durationSeconds * 1000);

  // -------------------------------------------------------------
  // 1. File ID Message (Global Mesg 0) -> Local Mesg 0
  // -------------------------------------------------------------
  // Definition
  records.writeUint8(0x40 | 0); // Header (definition message, local 0)
  records.writeUint8(0);        // Reserved
  records.writeUint8(0);        // Architecture: Little Endian
  records.writeUint16LE(0);     // Global Message Number: 0 (file_id)
  records.writeUint8(5);        // Number of fields: 5

  // Field 0: type (enum, 1 byte) = 4 (activity)
  records.writeUint8(0); records.writeUint8(1); records.writeUint8(0x00);
  // Field 1: manufacturer (uint16, 2 bytes) = 1 (garmin)
  records.writeUint8(1); records.writeUint8(2); records.writeUint8(0x84);
  // Field 2: product (uint16, 2 bytes) = 1
  records.writeUint8(2); records.writeUint8(2); records.writeUint8(0x84);
  // Field 3: serial_number (uint32z, 4 bytes)
  records.writeUint8(3); records.writeUint8(4); records.writeUint8(0x8C);
  // Field 4: time_created (uint32, 4 bytes)
  records.writeUint8(4); records.writeUint8(4); records.writeUint8(0x86);

  // Data
  records.writeUint8(0x00 | 0); // Header (data message, local 0)
  records.writeUint8(4);        // type = 4 (activity)
  records.writeUint16LE(1);     // manufacturer = 1 (garmin)
  records.writeUint16LE(1);     // product = 1
  records.writeUint32LE(123456789); // serial_number
  records.writeUint32LE(startGarminTime); // time_created

  // -------------------------------------------------------------
  // 2. Device Info Message (Global Mesg 23) -> Local Mesg 1
  // -------------------------------------------------------------
  records.writeUint8(0x40 | 1); // Definition, local 1
  records.writeUint8(0);
  records.writeUint8(0);
  records.writeUint16LE(23);    // Global Message Number: 23 (device_info)
  records.writeUint8(4);        // 4 fields

  // Field 253: timestamp (uint32, 4 bytes)
  records.writeUint8(253); records.writeUint8(4); records.writeUint8(0x86);
  // Field 0: device_index (uint8, 1 byte)
  records.writeUint8(0); records.writeUint8(1); records.writeUint8(0x02);
  // Field 2: manufacturer (uint16, 2 bytes)
  records.writeUint8(2); records.writeUint8(2); records.writeUint8(0x84);
  // Field 4: software_version (uint16, 2 bytes)
  records.writeUint8(4); records.writeUint8(2); records.writeUint8(0x84);

  // Data
  records.writeUint8(0x00 | 1);
  records.writeUint32LE(startGarminTime);
  records.writeUint8(0);        // creator
  records.writeUint16LE(1);     // garmin
  records.writeUint16LE(100);   // v1.00

  // -------------------------------------------------------------
  // 3. Sport Message (Global Mesg 12) -> Local Mesg 2
  // -------------------------------------------------------------
  records.writeUint8(0x40 | 2); // Definition, local 2
  records.writeUint8(0);
  records.writeUint8(0);
  records.writeUint16LE(12);    // Global Message Number: 12 (sport)
  records.writeUint8(3);        // 3 fields

  // Field 0: sport (enum, 1 byte) = 10 (training)
  records.writeUint8(0); records.writeUint8(1); records.writeUint8(0x00);
  // Field 1: sub_sport (enum, 1 byte) = 20 (strength_training)
  records.writeUint8(1); records.writeUint8(1); records.writeUint8(0x00);
  // Field 3: name (string, 16 bytes)
  records.writeUint8(3); records.writeUint8(16); records.writeUint8(0x07);

  // Data
  records.writeUint8(0x00 | 2);
  records.writeUint8(10);       // Sport.TRAINING = 10
  records.writeUint8(20);       // SubSport.STRENGTH_TRAINING = 20
  records.writeString('Weight Training', 16);


  // -------------------------------------------------------------
  // Prepare Exercises & Sets
  // -------------------------------------------------------------
  const uniqueExercises: WorkoutExercise[] = workout.exercises.length > 0 ? workout.exercises : [
    {
      exerciseId: 1,
      name: getDefaultActivityName(workout.startTime),
      sets: [
        {
          id: 'set-default',
          setNumber: 1,
          type: 'normal',
          mode: 'reps',
          weightKg: 20.0,
          reps: 10,
          completed: true,
        },
      ],
    },
  ];

  // -------------------------------------------------------------
  // 4. Exercise Title Messages (Global Mesg 264) -> Local Mesg 3
  // Maps category/subtype to human-readable exercise title for Strava
  // -------------------------------------------------------------
  records.writeUint8(0x40 | 3); // Definition, local 3
  records.writeUint8(0);
  records.writeUint8(0);
  records.writeUint16LE(264);   // Global Message Number: 264 (exercise_title)
  records.writeUint8(4);        // 4 fields

  records.writeUint8(254); records.writeUint8(2);  records.writeUint8(0x84); // message_index (uint16)
  records.writeUint8(0);   records.writeUint8(2);  records.writeUint8(0x84); // exercise_category (uint16)
  records.writeUint8(1);   records.writeUint8(2);  records.writeUint8(0x84); // exercise_name (uint16 subtype)
  records.writeUint8(2);   records.writeUint8(32); records.writeUint8(0x07); // wkt_step_name (string 32)

  // Write Exercise Title data records
  for (let eIdx = 0; eIdx < uniqueExercises.length; eIdx++) {
    const ex = uniqueExercises[eIdx];
    const { category, subtype } = getWorkoutExerciseDefinition(ex);
    records.writeUint8(0x00 | 3);
    records.writeUint16LE(eIdx);
    records.writeUint16LE(category);
    records.writeUint16LE(subtype);
    records.writeString(ex.name.slice(0, 31), 32);
  }

  // -------------------------------------------------------------
  // 5. Workout Step Messages (Global Mesg 27) -> Local Mesg 4
  // -------------------------------------------------------------
  records.writeUint8(0x40 | 4); // Definition, local 4
  records.writeUint8(0);
  records.writeUint8(0);
  records.writeUint16LE(27);    // Global Message Number: 27 (workout_step)
  records.writeUint8(3);        // 3 fields

  records.writeUint8(254); records.writeUint8(2);  records.writeUint8(0x84); // message_index (uint16)
  records.writeUint8(0);   records.writeUint8(32); records.writeUint8(0x07); // wkt_step_name (string 32)
  records.writeUint8(1);   records.writeUint8(1);  records.writeUint8(0x00); // duration_type (enum, 0 = open)

  for (let eIdx = 0; eIdx < uniqueExercises.length; eIdx++) {
    const ex = uniqueExercises[eIdx];
    records.writeUint8(0x00 | 4);
    records.writeUint16LE(eIdx);
    records.writeString(ex.name.slice(0, 31), 32);
    records.writeUint8(0); // open duration
  }

  // -------------------------------------------------------------
  // 6. Set Messages (Global Mesg 225) -> Local Mesg 5
  // Garmin FIT Set Message with compliant 11-field definition
  // -------------------------------------------------------------
  records.writeUint8(0x40 | 5); // Definition, local 5
  records.writeUint8(0);
  records.writeUint8(0);
  records.writeUint16LE(225);   // Global Message Number: 225 (set)
  records.writeUint8(11);       // 11 fields

  records.writeUint8(254); records.writeUint8(4); records.writeUint8(0x86); // timestamp (uint32)
  records.writeUint8(6);   records.writeUint8(4); records.writeUint8(0x86); // start_time (uint32)
  records.writeUint8(0);   records.writeUint8(4); records.writeUint8(0x86); // duration (uint32 ms)
  records.writeUint8(3);   records.writeUint8(2); records.writeUint8(0x84); // repetitions (uint16)
  records.writeUint8(4);   records.writeUint8(2); records.writeUint8(0x84); // weight (uint16 scale 16)
  records.writeUint8(5);   records.writeUint8(1); records.writeUint8(0x02); // set_type (uint8: 1=active, 0=rest)
  records.writeUint8(7);   records.writeUint8(2); records.writeUint8(0x84); // category (uint16)
  records.writeUint8(8);   records.writeUint8(2); records.writeUint8(0x84); // category_subtype (uint16)
  records.writeUint8(9);   records.writeUint8(2); records.writeUint8(0x84); // weight_display_unit (uint16: 1=kg)
  records.writeUint8(10);  records.writeUint8(2); records.writeUint8(0x84); // message_index (uint16)
  records.writeUint8(11);  records.writeUint8(2); records.writeUint8(0x84); // wkt_step_index (uint16)

  // Write Set Data records
  let currentSetStartTimeMs = workout.startTime;
  const allSets: {
    exerciseIndex: number;
    exerciseName: string;
    category: number;
    categorySubtype: number;
    weightKg: number;
    reps: number;
    durationSec: number;
    restSec: number;
  }[] = [];

  for (let eIdx = 0; eIdx < workout.exercises.length; eIdx++) {
    const ex = workout.exercises[eIdx];
    const { category, subtype } = getWorkoutExerciseDefinition(ex);
    for (const s of ex.sets) {
      const isDuration = s.mode === 'duration';
      // Include any completed set OR set with reps/weight/duration logged by the athlete
      const hasLoggedData = isDuration
        ? (s.durationSec || 0) > 0
        : ((s.reps || 0) > 0 || (s.weightKg || 0) > 0);
      const isValidSet = s.completed === true || hasLoggedData;

      if (isValidSet) {
        allSets.push({
          exerciseIndex: eIdx,
          exerciseName: ex.name,
          category,
          categorySubtype: subtype,
          weightKg: s.weightKg,
          reps: isDuration ? 0 : (s.reps || 10),
          durationSec: s.durationSec || (isDuration ? 60 : 45),
          restSec: s.restSec || 60,
        });
      }
    }
  }

  // If no sets were entered, provide a clean default strength set based on the first exercise
  if (allSets.length === 0) {
    const firstEx = workout.exercises[0] || uniqueExercises[0];
    const { category, subtype } = getWorkoutExerciseDefinition(firstEx);
    allSets.push({
      exerciseIndex: 0,
      exerciseName: firstEx?.name || getDefaultActivityName(workout.startTime),
      category,
      categorySubtype: subtype,
      weightKg: 20.0,
      reps: 10,
      durationSec: 45,
      restSec: 60,
    });
  }

  // Distribute time realistically across the workout window
  const totalSetsDurationSec = allSets.reduce((sum, s) => sum + s.durationSec + s.restSec, 0);
  const timeScale = totalSetsDurationSec > 0 ? (workout.durationSeconds / totalSetsDurationSec) : 1;

  for (let i = 0; i < allSets.length; i++) {
    const s = allSets[i];
    const scaledDurationSec = Math.max(15, Math.round(s.durationSec * timeScale));
    const setEndTimeMs = currentSetStartTimeMs + (scaledDurationSec * 1000);

    const setStartGarmin = toGarminTime(currentSetStartTimeMs);
    const setEndGarmin = toGarminTime(setEndTimeMs);
    const setDurationMs = scaledDurationSec * 1000;
    // Weight scale 16 in Garmin FIT standard (1.1kg -> 18, 100kg -> 1600)
    const weightScaled = Math.min(65535, Math.round(s.weightKg * 16));

    // Active Set Data Message
    records.writeUint8(0x00 | 5);
    records.writeUint32LE(setEndGarmin);           // timestamp
    records.writeUint32LE(setStartGarmin);         // start_time
    records.writeUint32LE(setDurationMs);          // duration
    records.writeUint16LE(s.reps);                 // repetitions
    records.writeUint16LE(weightScaled);           // weight (kg * 16)
    records.writeUint8(1);                         // set_type = 1 (active)
    records.writeUint16LE(s.category);             // category (e.g. 28 for Squat, 8 for Deadlift, etc.)
    records.writeUint16LE(s.categorySubtype);      // category_subtype
    records.writeUint16LE(1);                      // weight_display_unit = 1 (kg)
    records.writeUint16LE(i);                      // message_index
    records.writeUint16LE(s.exerciseIndex);        // wkt_step_index (links to exerciseTitle & workoutStep)

    // Rest interval if recorded and not last set
    const scaledRestSec = Math.max(15, Math.round(s.restSec * timeScale));
    if (i < allSets.length - 1 && scaledRestSec > 0) {
      const restStartMs = setEndTimeMs;
      const restEndMs = restStartMs + (scaledRestSec * 1000);
      records.writeUint8(0x00 | 5);
      records.writeUint32LE(toGarminTime(restEndMs));
      records.writeUint32LE(toGarminTime(restStartMs));
      records.writeUint32LE(scaledRestSec * 1000);
      records.writeUint16LE(0);                    // 0 reps
      records.writeUint16LE(0);                    // 0 weight
      records.writeUint8(0);                       // set_type = 0 (rest)
      records.writeUint16LE(0xFFFF);               // category invalid for rest
      records.writeUint16LE(0xFFFF);               // category_subtype invalid
      records.writeUint16LE(1);                    // weight_display_unit = 1 (kg)
      records.writeUint16LE(i + 1000);             // message_index
      records.writeUint16LE(s.exerciseIndex);      // wkt_step_index

      currentSetStartTimeMs = restEndMs;
    } else {
      currentSetStartTimeMs = setEndTimeMs;
    }
  }

  // -------------------------------------------------------------
  // 7. Lap Message (Global Mesg 19) -> Local Mesg 6
  // -------------------------------------------------------------
  records.writeUint8(0x40 | 6); // Definition, local 6
  records.writeUint8(0);
  records.writeUint8(0);
  records.writeUint16LE(19);    // Global Message Number: 19 (lap)
  records.writeUint8(6);        // 6 fields

  records.writeUint8(254); records.writeUint8(4); records.writeUint8(0x86); // timestamp
  records.writeUint8(2);   records.writeUint8(4); records.writeUint8(0x86); // start_time
  records.writeUint8(7);   records.writeUint8(4); records.writeUint8(0x86); // total_elapsed_time (ms)
  records.writeUint8(8);   records.writeUint8(4); records.writeUint8(0x86); // total_timer_time (ms)
  records.writeUint8(25);  records.writeUint8(1); records.writeUint8(0x00); // sport
  records.writeUint8(26);  records.writeUint8(1); records.writeUint8(0x00); // sub_sport

  // Data
  records.writeUint8(0x00 | 6);
  records.writeUint32LE(endGarminTime);
  records.writeUint32LE(startGarminTime);
  records.writeUint32LE(durationMs);
  records.writeUint32LE(durationMs);
  records.writeUint8(10);       // Sport.TRAINING
  records.writeUint8(20);       // SubSport.STRENGTH_TRAINING

  // -------------------------------------------------------------
  // 8. Session Message (Global Mesg 18) -> Local Mesg 7
  // -------------------------------------------------------------
  records.writeUint8(0x40 | 7); // Definition, local 7
  records.writeUint8(0);
  records.writeUint8(0);
  records.writeUint16LE(18);    // Global Message Number: 18 (session)
  records.writeUint8(11);       // 11 fields

  records.writeUint8(253); records.writeUint8(4); records.writeUint8(0x86); // timestamp (uint32)
  records.writeUint8(254); records.writeUint8(2); records.writeUint8(0x84); // message_index (uint16)
  records.writeUint8(2);   records.writeUint8(4); records.writeUint8(0x86); // start_time
  records.writeUint8(7);   records.writeUint8(4); records.writeUint8(0x86); // total_elapsed_time
  records.writeUint8(8);   records.writeUint8(4); records.writeUint8(0x86); // total_timer_time
  records.writeUint8(9);   records.writeUint8(4); records.writeUint8(0x86); // total_moving_time
  records.writeUint8(5);   records.writeUint8(1); records.writeUint8(0x00); // sport
  records.writeUint8(6);   records.writeUint8(1); records.writeUint8(0x00); // sub_sport
  records.writeUint8(25);  records.writeUint8(2); records.writeUint8(0x84); // num_laps
  records.writeUint8(11);  records.writeUint8(2); records.writeUint8(0x84); // total_calories
  records.writeUint8(110); records.writeUint8(32); records.writeUint8(0x07); // sport_profile_name (string, 32 bytes)

  // Approximate calories: ~5.5 kcal per minute of strength training + total volume load factor
  const estimatedCalories = Math.max(25, Math.round((workout.durationSeconds / 60) * 5.8 + (workout.totalVolumeKg / 400)));
  const workoutName = workout.title?.trim() || getDefaultActivityName(workout.startTime);

  // Data
  records.writeUint8(0x00 | 7);
  records.writeUint32LE(endGarminTime);
  records.writeUint16LE(0);     // message_index = 0
  records.writeUint32LE(startGarminTime);
  records.writeUint32LE(durationMs);
  records.writeUint32LE(durationMs);
  records.writeUint32LE(durationMs);
  records.writeUint8(10);       // Sport.TRAINING = 10
  records.writeUint8(20);       // SubSport.STRENGTH_TRAINING = 20
  records.writeUint16LE(1);     // 1 lap
  records.writeUint16LE(estimatedCalories);
  records.writeString(workoutName, 32);

  // -------------------------------------------------------------
  // 9. Workout Message (Global Mesg 26) -> Local Mesg 8
  // -------------------------------------------------------------
  records.writeUint8(0x40 | 8); // Definition, local 8
  records.writeUint8(0);
  records.writeUint8(0);
  records.writeUint16LE(26);    // Global Message Number: 26 (workout)
  records.writeUint8(4);        // 4 fields

  records.writeUint8(4);   records.writeUint8(1);  records.writeUint8(0x00); // sport
  records.writeUint8(5);   records.writeUint8(1);  records.writeUint8(0x00); // sub_sport
  records.writeUint8(6);   records.writeUint8(2);  records.writeUint8(0x84); // num_valid_steps
  records.writeUint8(8);   records.writeUint8(32); records.writeUint8(0x07); // wkt_name (string, 32 bytes)

  // Data
  records.writeUint8(0x00 | 8);
  records.writeUint8(10);       // Sport.TRAINING = 10
  records.writeUint8(20);       // SubSport.STRENGTH_TRAINING = 20
  records.writeUint16LE(uniqueExercises.length); // valid steps
  records.writeString(workoutName, 32);

  // -------------------------------------------------------------
  // 10. Activity Message (Global Mesg 34) -> Local Mesg 9
  // -------------------------------------------------------------
  records.writeUint8(0x40 | 9); // Definition, local 9
  records.writeUint8(0);
  records.writeUint8(0);
  records.writeUint16LE(34);    // Global Message Number: 34 (activity)
  records.writeUint8(6);        // 6 fields

  records.writeUint8(253); records.writeUint8(4); records.writeUint8(0x86); // timestamp
  records.writeUint8(0);   records.writeUint8(4); records.writeUint8(0x86); // total_timer_time
  records.writeUint8(1);   records.writeUint8(2); records.writeUint8(0x84); // num_sessions
  records.writeUint8(2);   records.writeUint8(1); records.writeUint8(0x00); // type (0 = manual)
  records.writeUint8(3);   records.writeUint8(1); records.writeUint8(0x00); // event (26 = activity)
  records.writeUint8(4);   records.writeUint8(1); records.writeUint8(0x00); // event_type (1 = stop)

  // Data
  records.writeUint8(0x00 | 9);
  records.writeUint32LE(endGarminTime);
  records.writeUint32LE(durationMs);
  records.writeUint16LE(1);     // num_sessions = 1
  records.writeUint8(0);        // activity
  records.writeUint8(26);       // event: activity
  records.writeUint8(1);        // event_type: stop

  // -------------------------------------------------------------
  // FIT File Header (14 bytes)
  // -------------------------------------------------------------
  const recordBytes = records.toUint8Array();
  const headerBytes = new Uint8Array(14);
  const headerView = new DataView(headerBytes.buffer);

  headerView.setUint8(0, 14);     // Header size = 14
  headerView.setUint8(1, 0x20);   // Protocol version 2.0
  headerView.setUint16(2, 2100, true); // Profile version (2100)
  headerView.setUint32(4, recordBytes.length, true); // Data size
  // ASCII ".FIT"
  headerBytes[8] = 0x2E; // '.'
  headerBytes[9] = 0x46; // 'F'
  headerBytes[10] = 0x49; // 'I'
  headerBytes[11] = 0x54; // 'T'

  // Header CRC-16 (over bytes 0..11)
  const headerCrc = calculateCrc(headerBytes, 0, 12);
  headerView.setUint16(12, headerCrc, true);

  // -------------------------------------------------------------
  // Full File Construction (Header + Records + 2-byte File CRC)
  // -------------------------------------------------------------
  const totalLength = 14 + recordBytes.length + 2;
  const fitFile = new Uint8Array(totalLength);

  fitFile.set(headerBytes, 0);
  fitFile.set(recordBytes, 14);

  // File CRC is computed over all bytes of the file except the final 2 CRC bytes
  const fileCrc = calculateCrc(fitFile, 0, 14 + recordBytes.length);
  const finalView = new DataView(fitFile.buffer);
  finalView.setUint16(totalLength - 2, fileCrc, true);

  return fitFile;
}

/**
 * Generate formatted file name: IronFIT-Strength-DDMMYYHHMMSS.fit
 */
export function getFitFileName(workout: CompletedWorkout): string {
  const d = new Date(workout.startTime);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `GymFIT-Strength-${day}${month}${year}${hours}${minutes}${seconds}.fit`;
}

/**
 * Trigger immediate browser download of the generated .FIT file
 */
export function downloadFitFile(workout: CompletedWorkout): void {
  const bytes = generateFitFile(workout);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const fileName = getFitFileName(workout);

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Convert completed workout to Base64 string for direct Strava API upload
 */
export function workoutToFitBase64(workout: CompletedWorkout): string {
  const bytes = generateFitFile(workout);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
