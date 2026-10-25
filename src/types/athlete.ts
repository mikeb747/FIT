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
  swimPoolPace100mSec: number; // seconds per 100m for pool swimming (1:30/100m = 90)
  swimOpenWaterPace100mSec: number; // seconds per 100m for open water swimming (1:38/100m = 98)

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
  age: 35,
  birthDate: '1990-01-01',
  heightCm: 178,
  weightKg: 75,
  maxHeartRate: 185,
  restingHeartRate: 52,
  periodization: '4weeks', // 3 progressive weeks and 1 easier week

  thresholdHeartRateRun: 168,
  thresholdPaceRunOutdoorSec: 232, // 3:52 /km
  thresholdPaceRunTreadmillSec: 228, // 3:48 /km

  thresholdHeartRateBike: 162,
  bikeFtp: 310, // 310 Watts
  bikeCrankLengthMm: 172.5,
  bikeCrankLengths: {},

  swim100mTimeSec: 84, // 1:24
  swim400mTimeSec: 355, // 5:55
  swimPoolPace100mSec: 90, // 1:30 / 100m
  swimOpenWaterPace100mSec: 98, // 1:38 / 100m

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

export function getAthleteHeartRateZones(profile: AthleteProfile, sport: 'run' | 'bike' | 'general' = 'general'): HeartRateZone[] {
  const maxHr = profile.maxHeartRate || 185;
  const restHr = profile.restingHeartRate || 50;
  const lthr = sport === 'bike'
    ? profile.thresholdHeartRateBike || Math.round(maxHr * 0.88)
    : profile.thresholdHeartRateRun || Math.round(maxHr * 0.90);

  // Friel / Coggan 5-Zone model anchored on Lactate Threshold Heart Rate
  return [
    {
      zone: 1,
      name: 'Recovery',
      minHr: restHr,
      maxHr: Math.round(lthr * 0.81),
      color: '#38bdf8', // sky-400
      description: 'Active recovery, easy aerobic flushing',
    },
    {
      zone: 2,
      name: 'Aerobic / Base',
      minHr: Math.round(lthr * 0.82),
      maxHr: Math.round(lthr * 0.89),
      color: '#34d399', // emerald-400
      description: 'Base endurance, fat oxidation, conversational',
    },
    {
      zone: 3,
      name: 'Tempo',
      minHr: Math.round(lthr * 0.90),
      maxHr: Math.round(lthr * 0.94),
      color: '#fbbf24', // amber-400
      description: 'Aerobic power, marathon pace, sustainable effort',
    },
    {
      zone: 4,
      name: 'Sub-Threshold',
      minHr: Math.round(lthr * 0.95),
      maxHr: Math.round(lthr * 0.99),
      color: '#fb923c', // orange-400
      description: 'Lactate threshold, 1-hour race pace effort',
    },
    {
      zone: 5,
      name: 'Threshold & VO2max',
      minHr: Math.round(lthr * 1.00),
      maxHr: maxHr,
      color: '#f87171', // rose-400
      description: 'Above threshold, anaerobic capacity and neuromuscular power',
    },
  ];
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

  const z1Slow = Math.round(thresholdSec * 1.55);
  const z1Fast = Math.round(thresholdSec * 1.29);
  const z2Fast = Math.round(thresholdSec * 1.14);
  const z3Fast = Math.round(thresholdSec * 1.06);
  const z4Fast = Math.round(thresholdSec * 0.98);
  const z5Fast = Math.round(thresholdSec * 0.85);

  return [
    {
      zone: 1,
      name: 'Recovery',
      minPaceSec: z1Fast,
      maxPaceSec: z1Slow,
      rangeFormatted: `>${formatSecondsToMinSec(z1Fast)}/km`,
      color: '#38bdf8', // sky-400
      description: 'Active recovery and warm-up jog',
    },
    {
      zone: 2,
      name: 'Aerobic / Easy',
      minPaceSec: z2Fast,
      maxPaceSec: z1Fast,
      rangeFormatted: `${formatSecondsToMinSec(z2Fast)} - ${formatSecondsToMinSec(z1Fast)}/km`,
      color: '#34d399', // emerald-400
      description: 'Base building, long runs, easy mileage',
    },
    {
      zone: 3,
      name: 'Tempo / Marathon',
      minPaceSec: z3Fast,
      maxPaceSec: z2Fast,
      rangeFormatted: `${formatSecondsToMinSec(z3Fast)} - ${formatSecondsToMinSec(z2Fast)}/km`,
      color: '#fbbf24', // amber-400
      description: 'Aerobic power, half/full marathon race pace',
    },
    {
      zone: 4,
      name: 'Threshold',
      minPaceSec: z4Fast,
      maxPaceSec: z3Fast,
      rangeFormatted: `${formatSecondsToMinSec(z4Fast)} - ${formatSecondsToMinSec(z3Fast)}/km`,
      color: '#fb923c', // orange-400
      description: 'Lactate threshold, 10k-15k pace',
    },
    {
      zone: 5,
      name: 'VO2 Max / Speed',
      minPaceSec: z5Fast,
      maxPaceSec: z4Fast,
      rangeFormatted: `<${formatSecondsToMinSec(z4Fast)}/km`,
      color: '#f87171', // rose-400
      description: 'Intervals, 5k and neuromuscular speed work',
    },
  ];
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

  // Coggan 6-Zone cycling power distribution:
  // Z1: Active Recovery (< 55% FTP)
  // Z2: Endurance (56% - 75% FTP)
  // Z3: Tempo (76% - 90% FTP)
  // Z4: Lactate Threshold (91% - 105% FTP)
  // Z5: VO2 Max (106% - 120% FTP)
  // Z6: Anaerobic & Neuromuscular (> 120% FTP)

  const z1Max = Math.round(ftp * 0.55);
  const z2Max = Math.round(ftp * 0.75);
  const z3Max = Math.round(ftp * 0.90);
  const z4Max = Math.round(ftp * 1.05);
  const z5Max = Math.round(ftp * 1.20);
  const z6Max = Math.round(ftp * 1.50);

  return [
    {
      zone: 1,
      name: 'Active Recovery',
      minWatts: 0,
      maxWatts: z1Max,
      rangeFormatted: `<${z1Max}W`,
      color: '#38bdf8', // sky-400
      description: 'Easy spinning, flushing lactate',
    },
    {
      zone: 2,
      name: 'Endurance',
      minWatts: z1Max + 1,
      maxWatts: z2Max,
      rangeFormatted: `${z1Max + 1} - ${z2Max}W`,
      color: '#34d399', // emerald-400
      description: 'All-day aerobic endurance, fat burning',
    },
    {
      zone: 3,
      name: 'Tempo',
      minWatts: z2Max + 1,
      maxWatts: z3Max,
      rangeFormatted: `${z2Max + 1} - ${z3Max}W`,
      color: '#fbbf24', // amber-400
      description: 'Rhythmic aerobic effort, sweetspot base',
    },
    {
      zone: 4,
      name: 'Threshold',
      minWatts: z3Max + 1,
      maxWatts: z4Max,
      rangeFormatted: `${z3Max + 1} - ${z4Max}W`,
      color: '#fb923c', // orange-400
      description: 'FTP race pace, sustainable 1-hour power',
    },
    {
      zone: 5,
      name: 'VO2 Max',
      minWatts: z4Max + 1,
      maxWatts: z5Max,
      rangeFormatted: `${z4Max + 1} - ${z5Max}W`,
      color: '#f87171', // rose-400
      description: '3-8 min high-intensity interval efforts',
    },
    {
      zone: 6,
      name: 'Anaerobic',
      minWatts: z5Max + 1,
      maxWatts: z6Max,
      rangeFormatted: `>${z5Max}W`,
      color: '#c084fc', // purple-400
      description: 'Short bursts, sprint surges & attacks',
    },
  ];
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
