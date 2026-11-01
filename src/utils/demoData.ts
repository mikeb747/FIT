import type { StravaActivity } from './stravaActivities';
import type { DailyRecoveryLog } from '../types/recovery';

const DEMO_MODE_STORAGE_KEY = 'fit_track_ai_studio_demo_mode_active';

/**
 * Returns true strictly when running within the Google AI Studio preview sandbox
 * (Cloud Run environment or local dev server).
 *
 * When the app is published (e.g., to GitHub Pages at *.github.io or a custom domain),
 * this returns false, ensuring demo data NEVER appears in the published application.
 */
export function isAIStudioEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname.toLowerCase();
  return (
    hostname.includes('run.app') ||
    hostname.includes('aistudio') ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1'
  );
}

/**
 * Checks whether demo data is currently active in localStorage.
 * Only returns true if also running in an AI Studio / dev environment.
 */
export function isDemoModeActive(): boolean {
  if (!isAIStudioEnvironment()) return false;
  try {
    return localStorage.getItem(DEMO_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Set the demo mode flag in localStorage.
 */
export function setDemoModeActive(active: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (active) {
      localStorage.setItem(DEMO_MODE_STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
    }
  } catch {}
}

/**
 * Generates realistic triathlon demo activities for the past 14 days.
 */
export function generateDemoActivities(): StravaActivity[] {
  const now = new Date();
  const formatIso = (daysAgo: number, hour = 7, min = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, min, 0, 0);
    return d.toISOString();
  };

  return [
    {
      id: 'demo-act-1',
      name: 'Morning Interval Run 🏃🏻‍♂️ 5x1km @ 3:45/km',
      type: 'Run',
      sport_type: 'Run',
      distance: 10450, // 10.45 km
      moving_time: 2780, // 46m 20s
      elapsed_time: 2950,
      total_elevation_gain: 54,
      start_date: formatIso(0, 6, 30),
      start_date_local: formatIso(0, 6, 30),
      average_speed: 3.76, // 4:26/km overall
      max_speed: 4.88,
      average_heartrate: 154,
      max_heartrate: 174,
      average_cadence: 88, // 176 spm
      calories: 680,
      suffer_score: 84,
    },
    {
      id: 'demo-act-2',
      name: 'Sweet Spot Intervals & Aero Position 🚴🏻‍♂️',
      type: 'Ride',
      sport_type: 'Ride',
      distance: 48500, // 48.5 km
      moving_time: 5400, // 1h 30m
      elapsed_time: 5580,
      total_elevation_gain: 340,
      start_date: formatIso(1, 14, 0),
      start_date_local: formatIso(1, 14, 0),
      average_speed: 8.98, // 32.3 km/h
      max_speed: 13.8,
      average_heartrate: 148,
      max_heartrate: 167,
      average_watts: 248,
      average_cadence: 91,
      calories: 1240,
      suffer_score: 98,
    },
    {
      id: 'demo-act-3',
      name: 'Threshold CSS Set 20x100m on 1:40 🏊🏻',
      type: 'Swim',
      sport_type: 'Swim',
      distance: 2800, // 2800m
      moving_time: 2700, // 45m
      elapsed_time: 3100,
      total_elevation_gain: 0,
      start_date: formatIso(2, 6, 45),
      start_date_local: formatIso(2, 6, 45),
      average_speed: 1.04, // 1:36/100m
      max_speed: 1.25,
      average_heartrate: 141,
      max_heartrate: 159,
      calories: 520,
      suffer_score: 65,
    },
    {
      id: 'demo-act-4',
      name: 'Gym 🏋🏻 Full Body Strength & Core',
      type: 'WeightTraining',
      sport_type: 'WeightTraining',
      distance: 0,
      moving_time: 3000, // 50m
      elapsed_time: 3300,
      total_elevation_gain: 0,
      start_date: formatIso(3, 17, 30),
      start_date_local: formatIso(3, 17, 30),
      average_heartrate: 118,
      max_heartrate: 142,
      calories: 340,
      suffer_score: 32,
    },
    {
      id: 'demo-act-5',
      name: 'Endurance Long Ride with Climbs 🚴🏻',
      type: 'Ride',
      sport_type: 'Ride',
      distance: 82400, // 82.4 km
      moving_time: 9900, // 2h 45m
      elapsed_time: 10400,
      total_elevation_gain: 780,
      start_date: formatIso(4, 8, 0),
      start_date_local: formatIso(4, 8, 0),
      average_speed: 8.32, // 30.0 km/h
      max_speed: 16.2,
      average_heartrate: 139,
      max_heartrate: 164,
      average_watts: 215,
      average_cadence: 88,
      calories: 2150,
      suffer_score: 135,
    },
    {
      id: 'demo-act-6',
      name: 'Sunday Long Progression Run 🏃🏻‍♂️',
      type: 'Run',
      sport_type: 'Run',
      distance: 18200, // 18.2 km
      moving_time: 4860, // 1h 21m
      elapsed_time: 4950,
      total_elevation_gain: 92,
      start_date: formatIso(5, 7, 30),
      start_date_local: formatIso(5, 7, 30),
      average_speed: 3.74, // 4:27/km
      max_speed: 4.55,
      average_heartrate: 151,
      max_heartrate: 169,
      average_cadence: 87,
      calories: 1220,
      suffer_score: 120,
    },
    {
      id: 'demo-act-7',
      name: 'Active Recovery Spin & High Cadence 🚴🏻',
      type: 'Ride',
      sport_type: 'Ride',
      distance: 25000,
      moving_time: 3300,
      elapsed_time: 3400,
      total_elevation_gain: 110,
      start_date: formatIso(6, 12, 15),
      start_date_local: formatIso(6, 12, 15),
      average_speed: 7.57, // 27.2 km/h
      max_speed: 10.5,
      average_heartrate: 116,
      max_heartrate: 132,
      average_watts: 165,
      average_cadence: 94,
      calories: 550,
      suffer_score: 28,
    },
    {
      id: 'demo-act-8',
      name: 'Open Water Swim Technique 🏊🏻',
      type: 'Swim',
      sport_type: 'Swim',
      distance: 2200,
      moving_time: 2160,
      elapsed_time: 2400,
      total_elevation_gain: 0,
      start_date: formatIso(7, 7, 0),
      start_date_local: formatIso(7, 7, 0),
      average_speed: 1.02,
      max_speed: 1.2,
      average_heartrate: 136,
      max_heartrate: 152,
      calories: 430,
      suffer_score: 48,
    },
    {
      id: 'demo-act-9',
      name: 'Tempo Run 8km Sustained 🏃🏻‍♂️',
      type: 'Run',
      sport_type: 'Run',
      distance: 12000,
      moving_time: 3120,
      elapsed_time: 3200,
      total_elevation_gain: 60,
      start_date: formatIso(8, 6, 45),
      start_date_local: formatIso(8, 6, 45),
      average_speed: 3.85, // 4:20/km
      max_speed: 4.6,
      average_heartrate: 158,
      max_heartrate: 172,
      average_cadence: 89,
      calories: 810,
      suffer_score: 95,
    },
    {
      id: 'demo-act-10',
      name: 'Gym 🏋🏻 Squats & Core Stability',
      type: 'WeightTraining',
      sport_type: 'WeightTraining',
      distance: 0,
      moving_time: 2700,
      elapsed_time: 3000,
      total_elevation_gain: 0,
      start_date: formatIso(9, 18, 0),
      start_date_local: formatIso(9, 18, 0),
      average_heartrate: 114,
      max_heartrate: 139,
      calories: 310,
      suffer_score: 28,
    },
    {
      id: 'demo-act-11',
      name: 'Weekend Metric Century 🚴🏻 102km',
      type: 'Ride',
      sport_type: 'Ride',
      distance: 102400,
      moving_time: 12200, // 3h 23m
      elapsed_time: 13100,
      total_elevation_gain: 980,
      start_date: formatIso(10, 8, 30),
      start_date_local: formatIso(10, 8, 30),
      average_speed: 8.39, // 30.2 km/h
      max_speed: 17.5,
      average_heartrate: 144,
      max_heartrate: 168,
      average_watts: 228,
      average_cadence: 90,
      calories: 2750,
      suffer_score: 175,
    },
    {
      id: 'demo-act-12',
      name: 'Easy Aerobic Recovery Run 🏃🏻‍♂️',
      type: 'Run',
      sport_type: 'Run',
      distance: 7500,
      moving_time: 2250,
      elapsed_time: 2310,
      total_elevation_gain: 35,
      start_date: formatIso(11, 7, 15),
      start_date_local: formatIso(11, 7, 15),
      average_speed: 3.33, // 5:00/km
      max_speed: 4.0,
      average_heartrate: 132,
      max_heartrate: 145,
      average_cadence: 86,
      calories: 490,
      suffer_score: 42,
    },
  ];
}

/**
 * Generates realistic Garmin physiological recovery logs for the past 28 days.
 */
export function generateDemoRecoveryLogs(): DailyRecoveryLog[] {
  const now = new Date();
  const logs: DailyRecoveryLog[] = [];

  for (let i = 27; i >= 0; i--) {
    const dt = new Date(now);
    dt.setDate(dt.getDate() - i);
    const yStr = dt.getFullYear();
    const mStr = String(dt.getMonth() + 1).padStart(2, '0');
    const dStr = String(dt.getDate()).padStart(2, '0');
    const dateStr = `${yStr}-${mStr}-${dStr}`;

    // Realistic variation based on periodic training load
    const isHardDay = i % 4 === 1;
    const isRestDay = i % 6 === 0;

    let sleepHours = 7.4 + Math.sin(i * 0.8) * 0.7;
    if (isHardDay) sleepHours += 0.4;
    if (isRestDay) sleepHours += 0.8;
    const sleepDurationMinutes = Math.round(sleepHours * 60);

    const deepSleepMinutes = Math.round(sleepDurationMinutes * (0.2 + Math.cos(i) * 0.04));
    const remSleepMinutes = Math.round(sleepDurationMinutes * (0.24 + Math.sin(i) * 0.03));
    const awakeMinutes = Math.round(20 + Math.random() * 15);
    const lightSleepMinutes = Math.max(0, sleepDurationMinutes - deepSleepMinutes - remSleepMinutes - awakeMinutes);

    const restingHr = Math.round(41 + (isHardDay ? 4 : 0) + Math.sin(i * 0.5) * 2);
    const hrvRmssd = Math.round(74 - (isHardDay ? 12 : 0) + (isRestDay ? 8 : 0) + Math.cos(i * 0.7) * 5);

    const sleepScore = Math.min(98, Math.max(65, Math.round(75 + (sleepHours - 7) * 8 + (hrvRmssd > 70 ? 5 : -5))));

    logs.push({
      id: `demo-rec-${dateStr}`,
      date: dateStr,
      sleepDurationMinutes,
      sleepScore,
      deepSleepMinutes,
      remSleepMinutes,
      lightSleepMinutes,
      awakeMinutes,
      restingHr,
      hrvRmssd,
      source: 'garmin',
      bodyBattery: Math.min(100, Math.max(50, Math.round(sleepScore * 0.95))),
      stress: Math.round(25 + Math.random() * 15),
      notes: isHardDay ? 'Tough interval day recovery' : isRestDay ? 'Full rest day' : 'Consistent aerobic block',
    });
  }

  return logs;
}
