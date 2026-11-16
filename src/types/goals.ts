/**
 * Triathlon & Running Goals System Types
 * Allows athletes to define future race or performance goals
 * and work backwards to establish achievable distance, pace, and training milestones.
 */

export type GoalPriority = 'A' | 'B' | 'C';
export type GoalEventType = 'run' | 'bike' | 'swim' | 'triathlon';
export type GoalStatus = 'upcoming' | 'completed' | 'abandoned' | 'missed';
export type GoalTargetType = 'finish' | 'time' | 'pace';

export type RunCourseType = 'road' | 'trail' | 'track';
export type SwimWaterType = 'pool' | 'open_water';

export interface GoalMilestone {
  id: string;
  title: string;
  targetDate: string; // YYYY-MM-DD
  metricTarget?: string; // e.g. "15km @ 4:45/km" or "FTP > 280W"
  isCompleted: boolean;
  notes?: string;
}

export interface TriathlonSplits {
  swimDistanceMeters: number;
  swimTargetTimeSec: number;
  t1TargetTimeSec: number;
  bikeDistanceKm: number;
  bikeTargetTimeSec: number;
  t2TargetTimeSec: number;
  runDistanceKm: number;
  runTargetTimeSec: number;
}

export interface TrainingGoal {
  id: string;
  name: string; // e.g. "Valencia Marathon" or "Ironman 70.3 Mallorca"
  priority: GoalPriority; // A / B / C
  eventType: GoalEventType; // run / bike / swim / triathlon
  status: GoalStatus; // upcoming / completed / abandoned / missed
  targetType: GoalTargetType; // finish / time / pace
  eventDate: string; // YYYY-MM-DD
  location?: string; // e.g. "Valencia, Spain"

  // Standard preset label or 'custom'
  distancePreset?: string;

  // Overall targets
  totalDistanceKm: number; // e.g. 42.195 or 113.1
  totalTargetTimeSec: number; // overall target finish time in seconds

  // Running-specific targets
  runCourseType?: RunCourseType;
  runElevationGainMeters?: number;
  runTargetPaceSec?: number; // seconds per km

  // Cycling-specific targets
  bikeElevationGainMeters?: number;
  bikeAvgSpeedKmh?: number;
  bikeTargetPowerWatts?: number;

  // Swimming-specific targets
  swimWaterType?: SwimWaterType;
  swimDistanceMeters?: number;
  swimTargetPace100mSec?: number;

  // Triathlon individual disciplines & transition targets
  triathlonSplits?: TriathlonSplits;

  // Milestones
  milestones: GoalMilestone[];

  // Taper duration in days (e.g. 3, 4, 5, 7, 8, 9, 10, 14, 21)
  taperDays?: number;

  // Strategic Notes
  notes?: string;
  createdAt: string;
}

export type TaperDurationDays = 3 | 4 | 5 | 7 | 8 | 9 | 10 | 14 | 21;

export const TAPER_DURATION_OPTIONS: {
  days: TaperDurationDays;
  label: string;
  shortLabel: string;
}[] = [
  { days: 3, label: '3 days', shortLabel: '3d' },
  { days: 4, label: '4 days', shortLabel: '4d' },
  { days: 5, label: '5 days', shortLabel: '5d' },
  { days: 7, label: '1 week', shortLabel: '1w' },
  { days: 8, label: '8 days', shortLabel: '8d' },
  { days: 9, label: '9 days', shortLabel: '9d' },
  { days: 10, label: '10 days', shortLabel: '10d' },
  { days: 14, label: '2 weeks', shortLabel: '2w' },
  { days: 21, label: '3 weeks', shortLabel: '3w' },
];

export function getGoalTaperDays(
  goal: Pick<TrainingGoal, 'taperDays' | 'eventType' | 'distancePreset' | 'totalDistanceKm' | 'priority'>
): number {
  if (typeof goal.taperDays === 'number' && goal.taperDays > 0) {
    return goal.taperDays;
  }
  const distKm = goal.totalDistanceKm || 0;
  const preset = (goal.distancePreset || '').toLowerCase();
  if (goal.eventType === 'triathlon') {
    if ((preset.includes('ironman') && !preset.includes('70.3')) || distKm > 155) return 21;
    if (preset.includes('70.3') || preset.includes('olympic') || distKm > 38) return 14;
    return 7;
  }
  if (goal.eventType === 'run') {
    if (preset.includes('marathon') && !preset.includes('half')) return 21;
    if (distKm >= 35) return 21;
    if (distKm >= 15) return 14;
    return 7;
  }
  return distKm >= 80 ? 14 : 7;
}

export function formatTaperDuration(days: number, short: boolean = false): string {
  const found = TAPER_DURATION_OPTIONS.find((o) => o.days === days);
  if (found) return short ? found.shortLabel : found.label;
  if (days % 7 === 0) {
    const w = days / 7;
    return short ? `${w}w` : `${w} ${w === 1 ? 'week' : 'weeks'}`;
  }
  return short ? `${days}d` : `${days} days`;
}

export const RUN_DISTANCE_PRESETS = [
  { label: '5km', distanceKm: 5.0 },
  { label: '10km', distanceKm: 10.0 },
  { label: '10 Mile', distanceKm: 16.093 },
  { label: 'Half Marathon', distanceKm: 21.0975 },
  { label: 'Marathon', distanceKm: 42.195 },
  { label: 'Custom', distanceKm: 0 },
];

export const TRIATHLON_DISTANCE_PRESETS = [
  {
    label: 'Sprint (400m Pool)',
    swimMeters: 400,
    bikeKm: 20.0,
    runKm: 5.0,
    totalDistanceKm: 25.4,
  },
  {
    label: 'Sprint (750m Open Water)',
    swimMeters: 750,
    bikeKm: 20.0,
    runKm: 5.0,
    totalDistanceKm: 25.75,
  },
  {
    label: 'Olympic',
    swimMeters: 1500,
    bikeKm: 40.0,
    runKm: 10.0,
    totalDistanceKm: 51.5,
  },
  {
    label: '70.3',
    swimMeters: 1900,
    bikeKm: 90.0,
    runKm: 21.1,
    totalDistanceKm: 113.0,
  },
  {
    label: 'IRONMAN',
    swimMeters: 3800,
    bikeKm: 180.0,
    runKm: 42.2,
    totalDistanceKm: 226.0,
  },
  {
    label: 'Custom',
    swimMeters: 0,
    bikeKm: 0,
    runKm: 0,
    totalDistanceKm: 0,
  },
];

export const BIKE_DISTANCE_PRESETS = [
  { label: '20km Time Trial', distanceKm: 20.0 },
  { label: '40km Time Trial', distanceKm: 40.0 },
  { label: '50 Mile', distanceKm: 80.47 },
  { label: '100km Gran Fondo', distanceKm: 100.0 },
  { label: '100 Mile Century', distanceKm: 160.93 },
  { label: '180km Ironman Bike', distanceKm: 180.0 },
  { label: 'Custom', distanceKm: 0 },
];

export const SWIM_DISTANCE_PRESETS = [
  { label: '400m Sprint Pool', distanceMeters: 400 },
  { label: '750m Sprint Open Water', distanceMeters: 750 },
  { label: '1500m Olympic', distanceMeters: 1500 },
  { label: '1.9km 70.3 Half', distanceMeters: 1900 },
  { label: '3.8km Full Ironman', distanceMeters: 3800 },
  { label: 'Custom', distanceMeters: 0 },
];
