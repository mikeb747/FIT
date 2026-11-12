/**
 * Athlete Physiological & Threshold Metrics
 * Used for Training Stress Score (TSS), Recovery Estimation,
 * Heart Rate / Power / Pace Zones, and Performance Analysis.
 */

export interface AthleteProfile {
  // General Physiology
  age: number; // in years (e.g. 35)
  birthDate?: string; // e.g. "1990-05-15"
  heightCm: number; // in cm (e.g. 178)
  weightKg: number; // in kg (e.g. 75)
  maxHeartRate: number; // in bpm (e.g. 185)
  restingHeartRate: number; // in bpm (e.g. 52)

  // Training Periodization Strategy
  // 0: Constant progressions (linear)
  // 3weeks: Easy week every 3 weeks (2 progressive + 1 easy)
  // 4weeks: 3 progressive weeks and 1 easier week
  periodization: '0' | '3weeks' | '4weeks';

  // Running Thresholds
  thresholdHeartRateRun: number; // bpm (Lactate Threshold Heart Rate, e.g. 168)
  thresholdPaceRunOutdoorSec: number; // seconds per km (3:52/km = 232)
  thresholdPaceRunTreadmillSec: number; // seconds per km for treadmill/indoor (3:48/km = 228)

  // Cycling Thresholds & Hardware Calibration
  thresholdHeartRateBike: number; // bpm (Bike LTHR, e.g. 162)
  bikeFtp: number; // in Watts (Functional Threshold Power, e.g. 310)
  bikeCrankLengthMm?: number; // Default crank length in mm (e.g. 172.5) for torque calculations
  bikeCrankLengths?: Record<string, number>; // Specific gear_id -> crank length in mm (e.g. { "b12345": 170.0 })

  // Swimming Thresholds & Time Trial Benchmarks
  swim100mTimeSec: number; // seconds for 100m all-out test (1:24 = 84)
  swim400mTimeSec: number; // seconds for 400m all-out test (5:55 = 355)
  swimPoolPace100mSec: number; // Regular (Pool) CSS in seconds per 100m for pool swim sTSS & pool triathlons (1:36/100m = 96)
  swimOpenWaterPace100mSec: number; // Open Water CSS (OW CSS) in seconds per 100m for open water swim sTSS & OW races (1:45/100m = 105)
  swimTssMode?: 'sTSS' | 'hrTSS' | 'auto'; // Swimming TSS Calculation model (default 'sTSS')
  thresholdHeartRateSwim?: number; // bpm (Swim LTHR, typically 10-14 bpm lower than Run LTHR)
  preferredSwimProtocol?: 'usms' | 'btf' | 'friel' | 'custom'; // Swim zone standard protocol
  customHrZonesSwim?: Record<number, { minHr: number; maxHr: number; rangeFormatted?: string }>;
  customPaceZonesSwim?: Record<number, { minPaceSec: number; maxPaceSec: number; rangeFormatted?: string }>;

  // Running Pace Zones (Customized or Derived from Threshold)
  customPaceZones?: Record<number, { minPaceSec: number; maxPaceSec: number; rangeFormatted?: string }>;
  customPaceZonesTreadmill?: Record<number, { minPaceSec: number; maxPaceSec: number; rangeFormatted?: string }>;
  customHrZonesRun?: Record<number, { minHr: number; maxHr: number; rangeFormatted?: string }>;
  customHrZonesBike?: Record<number, { minHr: number; maxHr: number; rangeFormatted?: string }>;
  customPowerZones?: Record<number, { minWatts: number; maxWatts: number; rangeFormatted?: string }>;

  // Active Injuries & Physical Limitations
  injuries?: AthleteInjury[];

  // Weekly Training Availability & Work Schedule
  weeklyAvailability?: WeeklyAvailabilityMatrix;
}

export type InjuryStatus = 'active' | 'monitoring' | 'recovering' | 'cleared';

export type BodyArea =
  | 'Calf'
  | 'Achilles'
  | 'Knee'
  | 'Hamstring'
  | 'Quadriceps'
  | 'Hip / Glute'
  | 'Lower Back'
  | 'Shoulder'
  | 'Foot / Plantar'
  | 'Ankle'
  | 'Neck / Upper Back'
  | 'Elbow / Wrist'
  | 'Other';

export interface AthleteInjury {
  id: string;
  name: string; // e.g. "Soleus / Calf Strain"
  bodyArea: BodyArea;
  side?: 'left' | 'right' | 'bilateral' | 'center';
  status: InjuryStatus;
  dateDiagnosed?: string; // e.g. "2026-10-12"
  painLevel?: number; // 0-10 scale
  sportModifications: string; // e.g. "Pull buoy swimming only during calf strain; soft-surface running under 30min; low torque on bike"
  rehabExercises?: string; // e.g. "Seated calf raises, eccentric heel drops on step"
  notes?: string;
}

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface DayAvailability {
  day: DayOfWeek;
  label: string; // "Monday", etc.
  shortLabel: string; // "Mon", etc.
  isWorkday: boolean;
  shiftStart?: string; // e.g. "08:30"
  shiftEnd?: string; // e.g. "17:00"
  availableWindows: ('morning' | 'lunch' | 'evening' | 'anytime')[];
  preferredActivities: string[]; // e.g. ["Track Run", "Long Ride"]
  notes?: string;
}

export type WeeklyAvailabilityMatrix = Record<DayOfWeek, DayAvailability>;

export const DEFAULT_WEEKLY_AVAILABILITY: WeeklyAvailabilityMatrix = {
  mon: {
    day: 'mon',
    label: 'Monday',
    shortLabel: 'Mon',
    isWorkday: true,
    shiftStart: '08:30',
    shiftEnd: '17:00',
    availableWindows: ['evening'],
    preferredActivities: ['Gym / Strength', 'Recovery Spin'],
  },
  tue: {
    day: 'tue',
    label: 'Tuesday',
    shortLabel: 'Tue',
    isWorkday: true,
    shiftStart: '08:30',
    shiftEnd: '17:00',
    availableWindows: ['morning', 'evening'],
    preferredActivities: ['Track Run'],
  },
  wed: {
    day: 'wed',
    label: 'Wednesday',
    shortLabel: 'Wed',
    isWorkday: true,
    shiftStart: '08:30',
    shiftEnd: '17:00',
    availableWindows: ['morning', 'evening'],
    preferredActivities: ['Swim Technique', 'Bike Intervals / Turbo'],
  },
  thu: {
    day: 'thu',
    label: 'Thursday',
    shortLabel: 'Thu',
    isWorkday: true,
    shiftStart: '08:30',
    shiftEnd: '17:00',
    availableWindows: ['evening'],
    preferredActivities: ['Tempo Run', 'Gym / Strength'],
  },
  fri: {
    day: 'fri',
    label: 'Friday',
    shortLabel: 'Fri',
    isWorkday: true,
    shiftStart: '08:30',
    shiftEnd: '16:30',
    availableWindows: ['evening'],
    preferredActivities: ['Swim Endurance', 'Recovery Spin'],
  },
  sat: {
    day: 'sat',
    label: 'Saturday',
    shortLabel: 'Sat',
    isWorkday: false,
    availableWindows: ['morning', 'anytime'],
    preferredActivities: ['Long Ride'],
  },
  sun: {
    day: 'sun',
    label: 'Sunday',
    shortLabel: 'Sun',
    isWorkday: false,
    availableWindows: ['morning', 'anytime'],
    preferredActivities: ['Long Run', 'Core / Mobility'],
  },
};

export const DEFAULT_INJURIES: AthleteInjury[] = [
  {
    id: 'inj-default-1',
    name: 'Soleus / Calf Strain',
    bodyArea: 'Calf',
    side: 'left',
    status: 'active',
    dateDiagnosed: '2026-10-12',
    painLevel: 3,
    sportModifications: 'Pull buoy swimming only during calf strain (no wall push-offs or kicking). Low-cadence high-torque cycling restricted. Soft-surface run only under 30min.',
    rehabExercises: 'Bent-knee seated calf raises (3x15 @ 20kg), eccentric heel drops on step, light isometric wall sits.',
    notes: 'Triggered during track session. Keep running volume strictly aerobic.',
  },
];

export const DEFAULT_ATHLETE_PROFILE: AthleteProfile = {
  age: 41,
  birthDate: '1985-10-30',
  heightCm: 188,
  weightKg: 77,
  maxHeartRate: 185,
  restingHeartRate: 41,
  periodization: '4weeks', // 3 progressive weeks and 1 easier week

  thresholdHeartRateRun: 168,
  thresholdPaceRunOutdoorSec: 232, // 3:52 /km
  thresholdPaceRunTreadmillSec: 228, // 3:48 /km

  thresholdHeartRateBike: 162,
  bikeFtp: 315, // 315 Watts
  bikeCrankLengthMm: 172.5,
  bikeCrankLengths: {},

  swim100mTimeSec: 84, // 1:24
  swim400mTimeSec: 372, // 6:12
  swimPoolPace100mSec: 96, // 1:36 / 100m Regular (Pool) CSS (300m / (372s - 84s))
  swimOpenWaterPace100mSec: 105, // 1:45 / 100m Open Water CSS (OW CSS)
  swimTssMode: 'sTSS',
  thresholdHeartRateSwim: 156, // bpm (typically 10-14 bpm lower than Run LTHR)
  preferredSwimProtocol: 'btf',

  injuries: DEFAULT_INJURIES,
  weeklyAvailability: DEFAULT_WEEKLY_AVAILABILITY,
};

/**
 * Helper to retrieve the active crank length in mm for a given bike gear ID,
 * falling back to the athlete's default crank length or 172.5mm.
 */
export function getAthleteBikeCrankLength(
  profile?: AthleteProfile,
  gearId?: string | null
): number {
  if (!profile) return 172.5;
  if (gearId && profile.bikeCrankLengths && profile.bikeCrankLengths[gearId]) {
    return profile.bikeCrankLengths[gearId];
  }
  return profile.bikeCrankLengthMm || 172.5;
}

/**
 * Energy / Work calculation from average power and duration:
 * kJ = Watts * Hours * 3.6 = Watts * Seconds / 1000
 * Roughly 1 kJ of mechanical work equals ~1 kcal metabolic energy consumed at ~21.5-24% gross efficiency.
 */
export function calculateWorkKj(
  avgWatts: number,
  movingTimeSec: number
): {
  kj: number;
  kcal: number;
  formattedKj: string;
  formattedEnergyWithWatts: string;
} {
  if (!avgWatts || avgWatts <= 0 || !movingTimeSec || movingTimeSec <= 0) {
    return { kj: 0, kcal: 0, formattedKj: '0 kJ', formattedEnergyWithWatts: '0 kJ' };
  }
  const kj = Math.round((avgWatts * movingTimeSec) / 1000);
  const kcal = kj;
  const hours = (movingTimeSec / 3600).toFixed(1);
  return {
    kj,
    kcal,
    formattedKj: `${kj.toLocaleString()} kJ`,
    formattedEnergyWithWatts: `${kj.toLocaleString()} kJ (${Math.round(avgWatts)}W × ${hours}h)`,
  };
}

// --------------------------------------------------------------------------
// Pace & Speed Formatting Helpers
// --------------------------------------------------------------------------

/**
 * Automatically calculate age in years from Date of Birth string (YYYY-MM-DD)
 */
export function calculateAgeFromBirthDate(dateStr?: string): number | null {
  if (!dateStr) return null;
  const birth = new Date(dateStr);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    years--;
  }
  return years >= 1 && years <= 120 ? years : null;
}

/**
 * Format duration according to time formatting rule:
 * Anything 1 min or above displays minutes and seconds (e.g. "1m 00s", "1m 24s", "25m 05s", "1h 05m 12s").
 * Sub-minute displays "Xs" (e.g. "45s", "0s").
 */
export function formatDuration(totalSeconds: number): string {
  if (!totalSeconds || isNaN(totalSeconds) || totalSeconds <= 0) return '0s';
  const total = Math.round(totalSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const padSec = secs.toString().padStart(2, '0');

  if (hours > 0) {
    const padMin = minutes.toString().padStart(2, '0');
    return `${hours}h ${padMin}m ${padSec}s`;
  }
  if (total >= 60) {
    return `${minutes}m ${padSec}s`;
  }
  return `${secs}s`;
}

/**
 * Format seconds into mm:ss (e.g. 270 -> "4:30")
 */
export function formatSecondsToMinSec(totalSeconds: number): string {
  if (!totalSeconds || isNaN(totalSeconds) || totalSeconds <= 0) return '0:00';
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * Parse mm:ss or decimal minutes string into total seconds (e.g. "4:30" -> 270)
 */
export function parseMinSecToSeconds(input: string, fallbackSec = 300): number {
  if (!input) return fallbackSec;
  const trimmed = input.trim();
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':');
    const mins = parseInt(parts[0], 10) || 0;
    const secs = parseFloat(parts[1]) || 0;
    return mins * 60 + secs;
  }
  const parsedNum = parseFloat(trimmed);
  if (!isNaN(parsedNum) && parsedNum > 0) {
    // If entered as minutes (e.g. 4.5 -> 270s)
    if (parsedNum < 30) return Math.round(parsedNum * 60);
    return Math.round(parsedNum);
  }
  return fallbackSec;
}

/**
 * Calculate Critical Swim Speed (CSS) in m/s and pace per 100m:
 * CSS = (400 - 100) / (T400 - T100) = 300 / (T400 - T100)
 */
export function calculateCss(
  time100mSec: number,
  time400mSec: number
): {
  cssMps: number;
  cssPace100mSec: number;
  cssPaceFormatted: string;
} {
  const diffSec = time400mSec - time100mSec;
  if (diffSec <= 0) {
    return {
      cssMps: 1.0,
      cssPace100mSec: 100,
      cssPaceFormatted: '1:40/100m',
    };
  }
  const cssMps = 300 / diffSec;
  const cssPace100mSec = 100 / cssMps;
  return {
    cssMps: Number(cssMps.toFixed(3)),
    cssPace100mSec: Math.round(cssPace100mSec),
    cssPaceFormatted: `${formatSecondsToMinSec(cssPace100mSec)}/100m`,
  };
}

// --------------------------------------------------------------------------
// Heart Rate Zones (Based on LTHR and Karvonen HR Reserve)
// --------------------------------------------------------------------------

export interface HeartRateZone {
  zone: number;
  name: string;
  minHr: number;
  maxHr: number;
  color: string;
  description: string;
}

export function getAthleteHeartRateZones(
  profile: AthleteProfile,
  sport: 'run' | 'bike' | 'swim' | 'general' = 'general'
): HeartRateZone[] {
  const maxHr = profile.maxHeartRate || 185;
  const restHr = profile.restingHeartRate || 50;

  let lthr: number;
  if (sport === 'swim') {
    // Swimming LTHR is typically 10-14 bpm lower than running LTHR
    lthr =
      profile.thresholdHeartRateSwim ||
      (profile.thresholdHeartRateRun ? profile.thresholdHeartRateRun - 12 : Math.round(maxHr * 0.84));
  } else if (sport === 'bike') {
    lthr = profile.thresholdHeartRateBike || Math.round(maxHr * 0.88);
  } else {
    lthr = profile.thresholdHeartRateRun || Math.round(maxHr * 0.90);
  }

  // Contiguous cutoffs anchored on Lactate Threshold Heart Rate (no gaps, no overlaps):
  // For cycling, standard Joe Friel / Coggan Cycling Heart Rate Zones:
  // Z1: < 68% LTHR (Active Recovery)
  // Z2: 69% - 83% LTHR (Aerobic / Endurance)
  // Z3: 84% - 94% LTHR (Tempo)
  // Z4: 95% - 105% LTHR (Sub-Threshold / Lactate Threshold)
  // Z5: > 106% LTHR (VO2 Max / Anaerobic)
  let b1: number;
  let b2: number;
  let b3: number;
  let b4: number;
  const b5 = Math.round(maxHr * 1.05);

  if (sport === 'bike') {
    b1 = Math.round(lthr * 0.68);
    b2 = Math.round(lthr * 0.83);
    b3 = Math.round(lthr * 0.94);
    b4 = Math.round(lthr * 1.05);
  } else {
    // Standard Running / General LTHR model
    b1 = Math.round(lthr * 0.81);
    b2 = Math.round(lthr * 0.89);
    b3 = Math.round(lthr * 0.94);
    b4 = Math.round(lthr * 0.99);
  }

  const defaultZones: HeartRateZone[] = [
    {
      zone: 1,
      name: sport === 'bike' ? 'Active Recovery' : 'Recovery',
      minHr: restHr,
      maxHr: b1,
      color: '#00e5ff', // Cyan
      description: sport === 'bike' ? '< 68% LTHR | Active recovery, light spinning' : 'Active recovery, easy aerobic flushing',
    },
    {
      zone: 2,
      name: sport === 'bike' ? 'Aerobic / Endurance' : 'Aerobic / Base',
      minHr: b1 + 1,
      maxHr: b2,
      color: '#00b0ff', // Blue
      description: sport === 'bike' ? '69 - 83% LTHR | Aerobic endurance, all-day pace' : 'Base endurance, fat oxidation, conversational',
    },
    {
      zone: 3,
      name: 'Tempo',
      minHr: b2 + 1,
      maxHr: b3,
      color: '#ffea00', // Yellow
      description: sport === 'bike' ? '84 - 94% LTHR | Intensive aerobic, rhythm cadence' : 'Aerobic power, marathon pace, sustainable effort',
    },
    {
      zone: 4,
      name: 'Sub-Threshold',
      minHr: b3 + 1,
      maxHr: b4,
      color: '#ff9100', // Orange
      description: sport === 'bike' ? '95 - 105% LTHR | Lactate threshold, 1h time trial effort' : 'Lactate threshold, 1-hour race pace effort',
    },
    {
      zone: 5,
      name: sport === 'bike' ? 'VO2 Max / Anaerobic' : 'Threshold & VO2max',
      minHr: b4 + 1,
      maxHr: Math.max(b4 + 1, b5),
      color: '#ff1744', // Red
      description: sport === 'bike' ? '> 106% LTHR | Maximal aerobic capacity & surges' : 'Above threshold, anaerobic capacity and neuromuscular power',
    },
  ];

  if (sport === 'run' && profile.customHrZonesRun) {
    return defaultZones.map((z) => {
      const custom = profile.customHrZonesRun?.[z.zone];
      if (custom) {
        return {
          ...z,
          minHr: custom.minHr,
          maxHr: custom.maxHr,
        };
      }
      return z;
    });
  }

  if (sport === 'bike' && profile.customHrZonesBike) {
    return defaultZones.map((z) => {
      const custom = profile.customHrZonesBike?.[z.zone];
      if (custom) {
        return {
          ...z,
          minHr: custom.minHr,
          maxHr: custom.maxHr,
        };
      }
      return z;
    });
  }

  if (sport === 'swim' && profile.customHrZonesSwim) {
    return defaultZones.map((z) => {
      const custom = profile.customHrZonesSwim?.[z.zone];
      if (custom) {
        return {
          ...z,
          minHr: custom.minHr,
          maxHr: custom.maxHr,
        };
      }
      return z;
    });
  }

  return defaultZones;
}

// --------------------------------------------------------------------------
// Running Pace Zones (Based on Running Threshold Pace)
// --------------------------------------------------------------------------

export interface PaceZone {
  zone: number;
  name: string;
  minPaceSec: number; // Faster bound in seconds/km
  maxPaceSec: number; // Slower bound in seconds/km
  rangeFormatted: string;
  color: string;
  description: string;
}

export function getAthletePaceZones(profile: AthleteProfile, isTreadmill = false): PaceZone[] {
  const thresholdSec = isTreadmill
    ? profile.thresholdPaceRunTreadmillSec || 228
    : profile.thresholdPaceRunOutdoorSec || 228;

  // Pace zones based on percentage of threshold velocity (Daniels / Pfitzinger / Coggan):
  // Slower pace = more seconds per km
  // Z1: Recovery (> 129% threshold pace)
  // Z2: Aerobic / Easy (114% - 129%)
  // Z3: Tempo / Marathon (106% - 113%)
  // Z4: Threshold (98% - 105%)
  // Z5: VO2 Max & Speed (< 98%)

  const z1Slow = Math.max(Math.round(thresholdSec * 1.55), 600);
  const z1Fast = Math.round(thresholdSec * 1.29);
  const z2Fast = Math.round(thresholdSec * 1.14);
  const z3Fast = Math.round(thresholdSec * 1.06);
  const z4Fast = Math.round(thresholdSec * 0.98);
  // Extend Zone 5 max sprinting pace down to 1:45/km (105s) to accommodate all-out sprints
  const z5Fast = Math.min(Math.round(thresholdSec * 0.70), 105);

  const defaultZones: PaceZone[] = [
    {
      zone: 1,
      name: 'Recovery',
      minPaceSec: z1Fast,
      maxPaceSec: z1Slow,
      rangeFormatted: `>${formatSecondsToMinSec(z1Fast)}/km`,
      color: '#00e5ff', // Cyan
      description: 'Active recovery and warm-up jog',
    },
    {
      zone: 2,
      name: 'Aerobic / Easy',
      minPaceSec: z2Fast,
      maxPaceSec: z1Fast,
      rangeFormatted: `${formatSecondsToMinSec(z2Fast)} - ${formatSecondsToMinSec(z1Fast)}/km`,
      color: '#00b0ff', // Blue
      description: 'Base building, long runs, easy mileage',
    },
    {
      zone: 3,
      name: 'Tempo / Marathon',
      minPaceSec: z3Fast,
      maxPaceSec: z2Fast,
      rangeFormatted: `${formatSecondsToMinSec(z3Fast)} - ${formatSecondsToMinSec(z2Fast)}/km`,
      color: '#ffea00', // Yellow
      description: 'Aerobic power, half/full marathon race pace',
    },
    {
      zone: 4,
      name: 'Threshold',
      minPaceSec: z4Fast,
      maxPaceSec: z3Fast,
      rangeFormatted: `${formatSecondsToMinSec(z4Fast)} - ${formatSecondsToMinSec(z3Fast)}/km`,
      color: '#ff9100', // Orange
      description: 'Lactate threshold, 10k-15k pace',
    },
    {
      zone: 5,
      name: 'VO2 Max / Speed',
      minPaceSec: z5Fast,
      maxPaceSec: z4Fast,
      rangeFormatted: `<${formatSecondsToMinSec(z4Fast)}/km`,
      color: '#ff1744', // Red
      description: 'Intervals, 5k and neuromuscular speed work',
    },
  ];

  const customZones = isTreadmill ? profile.customPaceZonesTreadmill : profile.customPaceZones;
  if (customZones) {
    return defaultZones.map((z) => {
      const custom = customZones[z.zone];
      if (custom) {
        return {
          ...z,
          minPaceSec: custom.minPaceSec,
          maxPaceSec: custom.maxPaceSec,
          rangeFormatted:
            z.zone === 5
              ? `<${formatSecondsToMinSec(custom.maxPaceSec || z.maxPaceSec)}/km`
              : z.zone === 1
              ? `>${formatSecondsToMinSec(custom.minPaceSec || z.minPaceSec)}/km`
              : `${formatSecondsToMinSec(custom.minPaceSec)} - ${formatSecondsToMinSec(custom.maxPaceSec)}/km`,
        };
      }
      return z;
    });
  }

  return defaultZones;
}

// --------------------------------------------------------------------------
// Swimming Pace Zones (Based on Critical Swim Speed - CSS Test)
// --------------------------------------------------------------------------

/**
 * Swimming Pace Zones derived from Critical Swim Speed (CSS):
 * Z1 (Recovery/Easy): CSS +15 to +25 seconds
 * Z2 (Endurance/Ironman): CSS +8 to +15 seconds
 * Z3 (Tempo/Steady aerobic): CSS +3 to +8 seconds
 * Z4 (Threshold/CSS): CSS -2 to +2 seconds
 * Z5 (VO2 Max): CSS -2 to -10 seconds
 */
export function getAthleteSwimPaceZones(profile: AthleteProfile): PaceZone[] {
  let cssSec = 90;
  if (
    profile.swim100mTimeSec &&
    profile.swim400mTimeSec &&
    profile.swim400mTimeSec > profile.swim100mTimeSec
  ) {
    const cssResult = calculateCss(profile.swim100mTimeSec, profile.swim400mTimeSec);
    cssSec = cssResult.cssPace100mSec;
  } else if (profile.swimPoolPace100mSec) {
    cssSec = profile.swimPoolPace100mSec;
  }

  // Contiguous pace boundaries anchored on Critical Swim Speed (no gaps, no overlaps):
  // Z5: Sprint / VO2 Max: Fastest (down to 1:00 or 1:10/100m) to CSS - 2s
  // Z4: Threshold / CSS: CSS - 2s to CSS + 2s
  // Z3: Tempo / Steady Aerobic: CSS + 2s to CSS + 8s
  // Z2: Endurance / Ironman: CSS + 8s to CSS + 15s
  // Z1: Recovery / Easy: CSS + 15s to Slower (up to 3:00 or 3:30/100m)
  const z4Fast = Math.max(1, cssSec - 2);
  const z4Slow = Math.max(1, cssSec + 2);
  const z3Slow = Math.max(1, cssSec + 8);
  const z2Slow = Math.max(1, cssSec + 15);

  // Extend sprint limits down to 60s (1:00/100m) to accommodate 1:10/100m or faster sprints
  const z5Fast = Math.min(Math.max(30, cssSec - 15), 60);
  const z5Slow = z4Fast;

  const z3Fast = z4Slow;
  const z2Fast = z3Slow;
  const z1Fast = z2Slow;
  // Extend recovery swimming up to 210s (3:30/100m) to accommodate slow 3:00/100m drills & recovery
  const z1Slow = Math.max(cssSec + 35, 210);

  const defaultZones: PaceZone[] = [
    {
      zone: 1,
      name: 'Recovery / Easy',
      minPaceSec: z1Fast,
      maxPaceSec: z1Slow,
      rangeFormatted: `>${formatSecondsToMinSec(z1Fast)}/100m`,
      color: '#00e5ff', // Cyan
      description: 'CSS +15s & slower | Easy recovery, drills, flushing lactate (up to 3:00+/100m)',
    },
    {
      zone: 2,
      name: 'Endurance / Ironman',
      minPaceSec: z2Fast,
      maxPaceSec: z1Fast,
      rangeFormatted: `${formatSecondsToMinSec(z2Fast)} - ${formatSecondsToMinSec(z1Fast)}/100m`,
      color: '#00b0ff', // Blue
      description: 'CSS +8 to +15s | Aerobic base endurance, long continuous sets, Ironman race pace',
    },
    {
      zone: 3,
      name: 'Tempo / Steady Aerobic',
      minPaceSec: z3Fast,
      maxPaceSec: z2Fast,
      rangeFormatted: `${formatSecondsToMinSec(z3Fast)} - ${formatSecondsToMinSec(z2Fast)}/100m`,
      color: '#00e676', // Green
      description: 'CSS +2 to +8s | Steady aerobic rhythm, half-Ironman pace, sustained endurance',
    },
    {
      zone: 4,
      name: 'Threshold / CSS',
      minPaceSec: z4Fast,
      maxPaceSec: z3Fast,
      rangeFormatted: `${formatSecondsToMinSec(z4Fast)} - ${formatSecondsToMinSec(z3Fast)}/100m`,
      color: '#ffea00', // Yellow
      description: 'CSS -2 to +2s | Critical Swim Speed, anaerobic threshold, Olympic distance pace',
    },
    {
      zone: 5,
      name: 'VO2 Max / Sprint',
      minPaceSec: z5Fast,
      maxPaceSec: z5Slow,
      rangeFormatted: `<${formatSecondsToMinSec(z5Slow)}/100m`,
      color: '#ff1744', // Red
      description: 'Faster than CSS -2s | VO2 max intervals, sprint speed (down to 1:10/100m or faster)',
    },
  ];

  if (profile.customPaceZonesSwim) {
    return defaultZones.map((z) => {
      const custom = profile.customPaceZonesSwim?.[z.zone];
      if (custom) {
        return {
          ...z,
          minPaceSec: custom.minPaceSec,
          maxPaceSec: custom.maxPaceSec,
          rangeFormatted:
            z.zone === 5
              ? `<${formatSecondsToMinSec(custom.maxPaceSec || z.maxPaceSec)}/100m`
              : z.zone === 1
              ? `>${formatSecondsToMinSec(custom.minPaceSec || z.minPaceSec)}/100m`
              : `${formatSecondsToMinSec(custom.minPaceSec)} - ${formatSecondsToMinSec(custom.maxPaceSec)}/100m`,
        };
      }
      return z;
    });
  }

  return defaultZones;
}

// --------------------------------------------------------------------------
// Cycling Power Zones (Based on Bike FTP)
// --------------------------------------------------------------------------

export interface PowerZone {
  zone: number;
  name: string;
  minWatts: number;
  maxWatts: number;
  rangeFormatted: string;
  color: string;
  description: string;
}

export function getAthletePowerZones(profile: AthleteProfile): PowerZone[] {
  const ftp = profile.bikeFtp || 310;

  // Coggan 7-Zone cycling power distribution:
  // Z1: Active Recovery (< 55% FTP)
  // Z2: Endurance (56% - 75% FTP)
  // Z3: Tempo (76% - 90% FTP)
  // Z4: Lactate Threshold (91% - 105% FTP)
  // Z5: VO2 Max (106% - 120% FTP)
  // Z6: Anaerobic Capacity (121% - 150% FTP)
  // Z7: Neuromuscular (> 150% FTP)

  const z1Max = Math.round(ftp * 0.55);
  const z2Max = Math.round(ftp * 0.75);
  const z3Max = Math.round(ftp * 0.90);
  const z4Max = Math.round(ftp * 1.05);
  const z5Max = Math.round(ftp * 1.20);
  const z6Max = Math.round(ftp * 1.50);

  const defaultZones: PowerZone[] = [
    {
      zone: 1,
      name: 'Active Recovery',
      minWatts: 0,
      maxWatts: z1Max,
      rangeFormatted: `<${z1Max}W`,
      color: '#00e5ff', // Cyan
      description: 'Easy spinning, flushing lactate',
    },
    {
      zone: 2,
      name: 'Endurance',
      minWatts: z1Max + 1,
      maxWatts: z2Max,
      rangeFormatted: `${z1Max + 1} - ${z2Max}W`,
      color: '#00b0ff', // Blue
      description: 'All-day aerobic endurance, fat burning',
    },
    {
      zone: 3,
      name: 'Tempo',
      minWatts: z2Max + 1,
      maxWatts: z3Max,
      rangeFormatted: `${z2Max + 1} - ${z3Max}W`,
      color: '#00e676', // Green
      description: 'Rhythmic aerobic effort, sweetspot base',
    },
    {
      zone: 4,
      name: 'Threshold',
      minWatts: z3Max + 1,
      maxWatts: z4Max,
      rangeFormatted: `${z3Max + 1} - ${z4Max}W`,
      color: '#ffea00', // Yellow
      description: 'FTP race pace, sustainable 1-hour power',
    },
    {
      zone: 5,
      name: 'VO2 Max',
      minWatts: z4Max + 1,
      maxWatts: z5Max,
      rangeFormatted: `${z4Max + 1} - ${z5Max}W`,
      color: '#ff9100', // Orange
      description: '3-8 min high-intensity interval efforts',
    },
    {
      zone: 6,
      name: 'Anaerobic',
      minWatts: z5Max + 1,
      maxWatts: z6Max,
      rangeFormatted: `${z5Max + 1} - ${z6Max}W`,
      color: '#ff1744', // Red
      description: '30s - 2min high-power attacks',
    },
    {
      zone: 7,
      name: 'Neuromuscular',
      minWatts: z6Max + 1,
      maxWatts: 2000,
      rangeFormatted: `>${z6Max}W`,
      color: '#d500f9', // Purple
      description: 'Maximal sprint surges < 30s',
    },
  ];

  if (profile.customPowerZones) {
    return defaultZones.map((z) => {
      const custom = profile.customPowerZones?.[z.zone];
      if (custom) {
        return {
          ...z,
          minWatts: custom.minWatts,
          maxWatts: custom.maxWatts,
          rangeFormatted: z.zone === 7 ? `>${custom.minWatts}W` : z.zone === 1 ? `<${custom.maxWatts}W` : `${custom.minWatts} - ${custom.maxWatts}W`,
        };
      }
      return z;
    });
  }

  return defaultZones;
}

// --------------------------------------------------------------------------
// Recovery Calculation Model
// --------------------------------------------------------------------------

export interface RecoveryStatus {
  recoveryHours: number;
  fatigueLevel: 'Very Low' | 'Low' | 'Moderate' | 'High' | 'Exhaustive';
  statusColor: string;
  recommendation: string;
}

export function calculateRecoveryEstimate(tss: number, profile: AthleteProfile): RecoveryStatus {
  // Base recovery hours derived from Training Stress Score
  // Adjusted slightly by age (>45 adds ~10-15% recovery time)
  const ageFactor = profile.age > 45 ? 1 + (profile.age - 45) * 0.008 : 1.0;

  let baseHours = 0;
  let fatigueLevel: RecoveryStatus['fatigueLevel'] = 'Low';
  let statusColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  let recommendation = 'Fully recovered. Ready for quality sessions or high-intensity intervals.';

  if (tss <= 25) {
    baseHours = Math.round(tss * 0.4);
    fatigueLevel = 'Very Low';
    statusColor = 'text-sky-300 bg-sky-500/10 border-sky-500/30';
    recommendation = 'Minimal physiological stress. Recovery complete within a few hours.';
  } else if (tss <= 50) {
    baseHours = Math.round(10 + (tss - 25) * 0.45);
    fatigueLevel = 'Low';
    statusColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    recommendation = 'Light aerobic session. Ready for standard training or workout tomorrow.';
  } else if (tss <= 85) {
    baseHours = Math.round(20 + (tss - 50) * 0.45);
    fatigueLevel = 'Moderate';
    statusColor = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    recommendation = 'Solid training load. Plan an easy recovery or Z1/Z2 aerobic workout next.';
  } else if (tss <= 140) {
    baseHours = Math.round(36 + (tss - 85) * 0.35);
    fatigueLevel = 'High';
    statusColor = 'text-orange-400 bg-orange-500/10 border-orange-500/30';
    recommendation = 'Heavy fatigue accumulated. Prioritize sleep, nutrition, and 24-36h easy recovery.';
  } else {
    baseHours = Math.min(72, Math.round(55 + (tss - 140) * 0.25));
    fatigueLevel = 'Exhaustive';
    statusColor = 'text-rose-400 bg-rose-500/10 border-rose-500/30';
    recommendation = 'Exhaustive race-level effort. Complete rest or gentle mobility recommended for 48h+.';
  }

  const finalHours = Math.max(4, Math.round(baseHours * ageFactor));

  return {
    recoveryHours: finalHours,
    fatigueLevel,
    statusColor,
    recommendation,
  };
}
