import { TrainingGoal } from '../types/goals';

export const GOALS_STORAGE_KEY = 'gymfit_training_goals_v1';

export const DEFAULT_GOALS: TrainingGoal[] = [
  {
    id: 'goal-demo-tri-703',
    name: 'Ironman 70.3 Mallorca',
    priority: 'A',
    eventType: 'triathlon',
    status: 'upcoming',
    targetType: 'time',
    eventDate: '2026-11-08',
    location: 'Alcúdia, Mallorca, Spain',
    distancePreset: '70.3',
    totalDistanceKm: 113.0,
    totalTargetTimeSec: 17700, // 4:55:00
    triathlonSplits: {
      swimDistanceMeters: 1900,
      swimTargetTimeSec: 2040, // 34:00 (1:47/100m)
      t1TargetTimeSec: 180, // 3:00
      bikeDistanceKm: 90.0,
      bikeTargetTimeSec: 9300, // 2:35:00 (34.8 km/h)
      t2TargetTimeSec: 120, // 2:00
      runDistanceKm: 21.1,
      runTargetTimeSec: 6060, // 1:41:00 (4:47/km)
    },
    bikeTargetPowerWatts: 235,
    bikeElevationGainMeters: 850,
    runElevationGainMeters: 45,
    runCourseType: 'road',
    swimWaterType: 'open_water',
    notes: 'Sub-5 hour goal. Pacing discipline on Coll de Femenia climb (keep under 260W), then settle into 4:47/km on the beachside run loop.',
    createdAt: '2026-10-01T00:00:00.000Z',
    milestones: [
      {
        id: 'ms-1',
        title: 'Long Brick: 75km Bike (aerobic) + 8km Run at 4:45/km',
        targetDate: '2026-10-18',
        metricTarget: 'Brick test with race nutrition',
        isCompleted: true,
        notes: 'Held 228W avg on bike and 4:42/km on the run. Felt strong.',
      },
      {
        id: 'ms-2',
        title: 'Continuous 2,000m Open Water Swim simulation',
        targetDate: '2026-10-25',
        metricTarget: 'Target sub-36 min in wetsuit',
        isCompleted: false,
        notes: 'Practice sighting every 6-8 strokes and drafting in pack.',
      },
      {
        id: 'ms-3',
        title: '90km Race-Pace TT simulation + aero position check',
        targetDate: '2026-10-28',
        metricTarget: '235W target normalized power',
        isCompleted: false,
        notes: 'Test aero helmet and bento box gel spacing.',
      },
    ],
  },
  {
    id: 'goal-demo-marathon',
    name: 'Autumn City Marathon',
    priority: 'B',
    eventType: 'run',
    status: 'upcoming',
    targetType: 'time',
    eventDate: '2026-12-06',
    location: 'Valencia, Spain',
    distancePreset: 'Marathon',
    totalDistanceKm: 42.195,
    totalTargetTimeSec: 12540, // 3:29:00
    runCourseType: 'road',
    runElevationGainMeters: 75,
    runTargetPaceSec: 297, // 4:57/km (7:58/mi)
    notes: 'Flat, fast course. Target negative split: first half in 1:45:00, second half in 1:44:00.',
    createdAt: '2026-10-05T00:00:00.000Z',
    milestones: [
      {
        id: 'ms-m1',
        title: '30km Progressive Long Run with final 10km @ marathon pace (4:55/km)',
        targetDate: '2026-11-15',
        metricTarget: '30km endurance benchmark',
        isCompleted: false,
      },
      {
        id: 'ms-m2',
        title: 'Half Marathon Tune-Up Race',
        targetDate: '2026-11-01',
        metricTarget: 'Sub-1:38:00 (4:38/km)',
        isCompleted: false,
      },
    ],
  },
];

export function loadAthleteGoals(): TrainingGoal[] {
  if (typeof window === 'undefined') return DEFAULT_GOALS;
  try {
    const raw = localStorage.getItem(GOALS_STORAGE_KEY);
    if (!raw) return DEFAULT_GOALS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return DEFAULT_GOALS;
  } catch (err) {
    console.warn('[Goals Storage] Failed to load goals, using defaults:', err);
    return DEFAULT_GOALS;
  }
}

export function saveAthleteGoals(goals: TrainingGoal[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(goals));
  } catch (err) {
    console.error('[Goals Storage] Failed to save goals:', err);
  }
}
