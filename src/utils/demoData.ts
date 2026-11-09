import type { StravaActivity, StravaActivityDetailsRecord } from './stravaActivities';
import { saveStravaActivityDetails } from './stravaActivities';
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
      average_cadence: 32,
      calories: 520,
      suffer_score: 65,
      laps: Array.from({ length: 20 }, (_, i) => ({
        id: 3000 + i,
        lap_index: i + 1,
        name: `Lap ${i + 1}`,
        distance: 100,
        moving_time: 96,
        elapsed_time: 100,
        average_speed: 1.04,
        average_heartrate: 136 + Math.round((i / 20) * 12),
        average_cadence: 30 + (i % 4),
      })),
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
      average_cadence: 32,
      calories: 430,
      suffer_score: 48,
      laps: [
        { id: 8001, lap_index: 1, name: 'Main Outward Lap', distance: 1200, moving_time: 1180, elapsed_time: 1200, average_cadence: 31, average_heartrate: 134 },
        { id: 8002, lap_index: 2, name: 'Return Lap', distance: 1000, moving_time: 980, elapsed_time: 1000, average_cadence: 33, average_heartrate: 138 },
      ],
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

/**
 * Checks if a given activity ID belongs to the AI Studio demo dataset.
 */
export function isDemoActivityId(id: string | number): boolean {
  return String(id).startsWith('demo-act-');
}

export interface DemoStreamMetric {
  data: number[];
  series_type: string;
  original_size: number;
  resolution: string;
}

export type DemoStreamsMap = Record<string, DemoStreamMetric>;

/**
 * Generates realistic, high-fidelity Strava streams for any demo activity.
 */
export function generateDemoStreamsForActivity(activity: StravaActivity): DemoStreamsMap {
  const numPoints = 300;
  const totalTimeSec = activity.moving_time || 2400;
  const totalDistanceM = activity.distance || 10000;
  const avgHr = activity.average_heartrate || 145;
  const maxHr = activity.max_heartrate || 172;
  const avgSpeed = activity.average_speed || (totalDistanceM > 0 && totalTimeSec > 0 ? totalDistanceM / totalTimeSec : 3.5);
  const avgWatts = activity.average_watts || 220;
  const avgCadence = activity.average_cadence || (activity.type === 'Run' ? 88 : 90);
  const elevGain = activity.total_elevation_gain || 0;

  const timeData: number[] = new Array(numPoints);
  const distData: number[] = new Array(numPoints);
  const hrData: number[] = new Array(numPoints);
  const velocityData: number[] = new Array(numPoints);
  const cadenceData: number[] = new Array(numPoints);
  const altData: number[] = new Array(numPoints);
  const wattsData: number[] | null = activity.type === 'Ride' || activity.sport_type === 'Ride' ? new Array(numPoints) : null;

  const isRide = activity.type === 'Ride' || activity.sport_type === 'Ride';
  const isRun = activity.type === 'Run' || activity.sport_type === 'Run';
  const isSwim = activity.type === 'Swim' || activity.sport_type === 'Swim';

  // Base elevation profile parameters
  const baseAlt = 45;

  for (let i = 0; i < numPoints; i++) {
    const fraction = i / (numPoints - 1);
    timeData[i] = Math.round(fraction * totalTimeSec);
    distData[i] = Math.round(fraction * totalDistanceM);

    // Natural undulating elevation profile matching total elevation gain
    const elevCurve =
      Math.sin(fraction * Math.PI * 2) * 0.35 +
      Math.sin(fraction * Math.PI * 6) * 0.15 +
      Math.cos(fraction * Math.PI * 3.5) * 0.1;
    const currentAlt = Math.max(10, Math.round(baseAlt + (elevGain > 0 ? elevGain * (elevCurve + 0.4) : 0)));
    altData[i] = currentAlt;

    if (activity.id === 'demo-act-1') {
      // 5x1km interval run: Warmup (0-20%), 5 interval bouts, Cooldown (90-100%)
      if (fraction < 0.20) {
        // Warmup: 4:45/km -> 4:35/km (speed ~3.55 - 3.65 m/s)
        const ramp = fraction / 0.20;
        velocityData[i] = Number((3.50 + ramp * 0.18 + Math.sin(i * 0.3) * 0.05).toFixed(2));
        hrData[i] = Math.round(132 + ramp * 16 + Math.sin(i * 0.4) * 2);
        cadenceData[i] = Math.round(85 + ramp * 2);
      } else if (fraction >= 0.90) {
        // Cooldown: 4:55/km
        const cool = (fraction - 0.90) / 0.10;
        velocityData[i] = Number((3.45 - cool * 0.20 + Math.sin(i * 0.3) * 0.04).toFixed(2));
        hrData[i] = Math.round(152 - cool * 16 + Math.sin(i * 0.4) * 2);
        cadenceData[i] = Math.round(85 - cool * 2);
      } else {
        // 5 intervals and 4 recoveries across 0.20 to 0.90
        const intervalCycle = ((fraction - 0.20) / 0.70) * 5; // 0 to 5
        const cycleFraction = intervalCycle - Math.floor(intervalCycle);
        const isBout = cycleFraction < 0.60; // 60% interval, 40% recovery
        const boutNum = Math.floor(intervalCycle);

        if (isBout) {
          // Hard 1km bout @ 3:45/km (speed 4.44 m/s)
          const boutProgress = cycleFraction / 0.60;
          velocityData[i] = Number((4.42 + Math.sin(i * 0.5) * 0.08).toFixed(2));
          hrData[i] = Math.round(164 + boutNum * 1.5 + boutProgress * 7 + Math.sin(i * 0.3) * 1.5);
          cadenceData[i] = Math.round(90 + Math.sin(i * 0.2) * 1.5);
        } else {
          // Recovery jog @ 5:15/km (speed 3.15 m/s)
          const recProgress = (cycleFraction - 0.60) / 0.40;
          velocityData[i] = Number((3.15 + Math.sin(i * 0.4) * 0.06).toFixed(2));
          hrData[i] = Math.round(168 - recProgress * 18 + Math.sin(i * 0.3) * 2);
          cadenceData[i] = Math.round(84 + Math.sin(i * 0.2));
        }
      }
    } else if (activity.id === 'demo-act-2' && wattsData) {
      // 3 x 15min Sweet Spot intervals on bike
      if (fraction < 0.16) {
        // Warmup: 160W -> 210W
        const ramp = fraction / 0.16;
        wattsData[i] = Math.round(165 + ramp * 50 + Math.sin(i * 0.4) * 8);
        hrData[i] = Math.round(120 + ramp * 18 + Math.sin(i * 0.3) * 2);
        cadenceData[i] = Math.round(86 + ramp * 4);
        velocityData[i] = Number((7.8 + ramp * 1.2 + Math.sin(i * 0.3) * 0.2).toFixed(2));
      } else if (fraction >= 0.84) {
        // Cooldown: 160W
        const cool = (fraction - 0.84) / 0.16;
        wattsData[i] = Math.round(180 - cool * 35 + Math.sin(i * 0.4) * 6);
        hrData[i] = Math.round(140 - cool * 20 + Math.sin(i * 0.3) * 2);
        cadenceData[i] = Math.round(88 - cool * 4);
        velocityData[i] = Number((8.0 - cool * 1.0).toFixed(2));
      } else {
        // 3 sweet spot blocks with 2 recovery valleys
        const block = ((fraction - 0.16) / 0.68) * 3; // 0 to 3
        const blockFraction = block - Math.floor(block);
        const isSweetSpot = blockFraction < 0.72; // 72% sweet spot, 28% rest

        if (isSweetSpot) {
          // Sweet spot @ 282-290W (88-92% FTP)
          wattsData[i] = Math.round(282 + Math.sin(i * 0.25) * 12 + Math.cos(i * 0.6) * 6);
          hrData[i] = Math.round(158 + Math.floor(block) * 2 + Math.sin(i * 0.2) * 3);
          cadenceData[i] = Math.round(92 + Math.sin(i * 0.3) * 2);
          velocityData[i] = Number((9.8 + Math.sin(i * 0.3) * 0.4).toFixed(2));
        } else {
          // Recovery @ 145W
          wattsData[i] = Math.round(145 + Math.sin(i * 0.3) * 8);
          hrData[i] = Math.round(136 + Math.sin(i * 0.2) * 3);
          cadenceData[i] = Math.round(84 + Math.sin(i * 0.3) * 2);
          velocityData[i] = Number((7.2 + Math.sin(i * 0.3) * 0.3).toFixed(2));
        }
      }
    } else if (activity.id === 'demo-act-6') {
      // Sunday Long Progression Run (Negative splits progression from 4:45/km to 3:55/km)
      const progress = fraction; // 0 to 1
      const targetSpeed = 3.50 + progress * 0.75 + Math.sin(i * 0.3) * 0.05; // 3.50 m/s (4:45/km) -> 4.25 m/s (3:55/km)
      velocityData[i] = Number(targetSpeed.toFixed(2));
      hrData[i] = Math.round(138 + progress * 29 + Math.sin(i * 0.35) * 2);
      cadenceData[i] = Math.round(86 + progress * 6 + Math.sin(i * 0.2) * 1);
    } else if (isSwim) {
      // Realistic swimming stroke cadence: 30-35 spm
      const noise = Math.sin(i * 0.4) * 2;
      hrData[i] = Math.round(140 + Math.sin(i * 0.2) * 5);
      velocityData[i] = Number(Math.max(0.6, avgSpeed + Math.sin(i * 0.3) * 0.06).toFixed(2));
      cadenceData[i] = Math.round(32 + noise);
    } else {
      // Standard realistic generator for other activities
      const noise = Math.sin(i * 0.25) * 0.5 + Math.cos(i * 0.6) * 0.3;
      const warmupRatio = Math.min(1, fraction * 6);
      const fatigueDrift = fraction * (maxHr - avgHr) * 0.45;

      hrData[i] = Math.min(maxHr, Math.max(105, Math.round((avgHr - 12) + warmupRatio * 12 + fatigueDrift + noise * 4)));
      velocityData[i] = Number(Math.max(0.5, avgSpeed + noise * 0.2).toFixed(2));
      cadenceData[i] = Math.round(avgCadence + noise * 2);

      if (wattsData) {
        wattsData[i] = Math.max(80, Math.round(avgWatts + noise * 24 + Math.sin(fraction * Math.PI * 4) * 20));
      }
    }
  }

  const streamMetric = (data: number[]): DemoStreamMetric => ({
    data,
    series_type: 'distance',
    original_size: data.length,
    resolution: 'high',
  });

  const streams: DemoStreamsMap = {
    time: streamMetric(timeData),
    distance: streamMetric(distData),
    heartrate: streamMetric(hrData),
    velocity_smooth: streamMetric(velocityData),
    cadence: streamMetric(cadenceData),
  };

  // Swim activities strictly have no altitude streams
  if (!isSwim) {
    streams.altitude = streamMetric(altData);
  }

  if (wattsData) {
    streams.watts = streamMetric(wattsData);
  }

  return streams;
}

/**
 * Builds realistic full Strava activity details (splits_metric, laps, and telemetry streams)
 * for any demo activity so the full analysis, zone charts, and splits bar charts render completely.
 */
export function generateDemoActivityDetails(activity: StravaActivity): StravaActivityDetailsRecord {
  const streams = generateDemoStreamsForActivity(activity);
  const isRun = activity.type === 'Run' || activity.sport_type === 'Run';
  const isBike = activity.type === 'Ride' || activity.sport_type === 'Ride';
  const isSwim = activity.type === 'Swim' || activity.sport_type === 'Swim';

  // Generate splits_metric for Run activities
  let splits_metric: any[] = [];
  if (isRun) {
    const totalKm = (activity.distance || 10000) / 1000;
    const fullKm = Math.floor(totalKm);
    const remainder = totalKm - fullKm;

    if (activity.id === 'demo-act-1') {
      // 5x1km interval splits
      splits_metric = [
        { split: 1, distance: 1000, moving_time: 288, elapsed_time: 288, average_speed: 3.47, average_heartrate: 142, elevation_difference: 8 },
        { split: 2, distance: 1000, moving_time: 282, elapsed_time: 282, average_speed: 3.55, average_heartrate: 146, elevation_difference: 5 },
        { split: 3, distance: 1000, moving_time: 224, elapsed_time: 224, average_speed: 4.46, average_heartrate: 168, elevation_difference: -2 },
        { split: 4, distance: 1000, moving_time: 270, elapsed_time: 270, average_speed: 3.70, average_heartrate: 151, elevation_difference: 2 },
        { split: 5, distance: 1000, moving_time: 225, elapsed_time: 225, average_speed: 4.44, average_heartrate: 171, elevation_difference: 4 },
        { split: 6, distance: 1000, moving_time: 265, elapsed_time: 265, average_speed: 3.77, average_heartrate: 153, elevation_difference: -3 },
        { split: 7, distance: 1000, moving_time: 226, elapsed_time: 226, average_speed: 4.42, average_heartrate: 172, elevation_difference: 12 },
        { split: 8, distance: 1000, moving_time: 258, elapsed_time: 258, average_speed: 3.88, average_heartrate: 155, elevation_difference: 4 },
        { split: 9, distance: 1000, moving_time: 223, elapsed_time: 223, average_speed: 4.48, average_heartrate: 173, elevation_difference: -6 },
        { split: 10, distance: 1000, moving_time: 225, elapsed_time: 225, average_speed: 4.44, average_heartrate: 174, elevation_difference: 3 },
        { split: 11, distance: 450, moving_time: 132, elapsed_time: 132, average_speed: 3.41, average_heartrate: 148, elevation_difference: 2 },
      ];
    } else if (activity.id === 'demo-act-6') {
      // Progression run splits: 4:45 down to 3:55
      const paces = [285, 283, 280, 276, 272, 269, 266, 262, 259, 255, 252, 248, 244, 241, 238, 235, 234, 235];
      for (let k = 0; k < fullKm; k++) {
        const sec = paces[k] || 260;
        splits_metric.push({
          split: k + 1,
          distance: 1000,
          moving_time: sec,
          elapsed_time: sec,
          average_speed: Number((1000 / sec).toFixed(2)),
          average_heartrate: Math.round(138 + k * 1.8),
          elevation_difference: Math.round(Math.sin(k * 0.8) * 8),
        });
      }
      if (remainder >= 0.05) {
        const sec = Math.round(remainder * 235);
        splits_metric.push({
          split: fullKm + 1,
          distance: Math.round(remainder * 1000),
          moving_time: sec,
          elapsed_time: sec,
          average_speed: Number(((remainder * 1000) / sec).toFixed(2)),
          average_heartrate: 169,
          elevation_difference: 2,
        });
      }
    } else {
      const avgSplitSec = Math.round((activity.moving_time || 2400) / Math.max(1, totalKm));
      for (let k = 1; k <= fullKm; k++) {
        const sec = Math.round(avgSplitSec + Math.sin(k * 0.7) * 8);
        splits_metric.push({
          split: k,
          distance: 1000,
          moving_time: sec,
          elapsed_time: sec,
          average_speed: Number((1000 / sec).toFixed(2)),
          average_heartrate: Math.round((activity.average_heartrate || 145) + Math.sin(k * 0.6) * 4),
          elevation_difference: Math.round(Math.sin(k * 0.9) * 6),
        });
      }
      if (remainder >= 0.05) {
        const sec = Math.round(remainder * avgSplitSec);
        splits_metric.push({
          split: fullKm + 1,
          distance: Math.round(remainder * 1000),
          moving_time: sec,
          elapsed_time: sec,
          average_speed: Number(((remainder * 1000) / sec).toFixed(2)),
          average_heartrate: activity.average_heartrate || 145,
          elevation_difference: 2,
        });
      }
    }
  }

  // Generate laps for Bike or Swim activities if not present
  let laps: any[] = (activity as any).laps || [];
  if (isBike && laps.length === 0) {
    if (activity.id === 'demo-act-2') {
      laps = [
        { id: 201, lap_index: 1, name: 'Warmup', distance: 8000, moving_time: 1000, elapsed_time: 1000, average_speed: 8.0, average_watts: 185, average_heartrate: 132, average_cadence: 88, elevation_gain: 35 },
        { id: 202, lap_index: 2, name: 'Sweet Spot 1', distance: 8900, moving_time: 900, elapsed_time: 900, average_speed: 9.88, average_watts: 282, average_heartrate: 161, average_cadence: 93, elevation_gain: 55 },
        { id: 203, lap_index: 3, name: 'Recovery 1', distance: 2100, moving_time: 300, elapsed_time: 300, average_speed: 7.0, average_watts: 145, average_heartrate: 136, average_cadence: 84, elevation_gain: 15 },
        { id: 204, lap_index: 4, name: 'Sweet Spot 2', distance: 9000, moving_time: 900, elapsed_time: 900, average_speed: 10.0, average_watts: 286, average_heartrate: 163, average_cadence: 94, elevation_gain: 60 },
        { id: 205, lap_index: 5, name: 'Recovery 2', distance: 2100, moving_time: 300, elapsed_time: 300, average_speed: 7.0, average_watts: 142, average_heartrate: 137, average_cadence: 84, elevation_gain: 15 },
        { id: 206, lap_index: 6, name: 'Sweet Spot 3', distance: 9100, moving_time: 900, elapsed_time: 900, average_speed: 10.1, average_watts: 288, average_heartrate: 165, average_cadence: 94, elevation_gain: 70 },
        { id: 207, lap_index: 7, name: 'Cooldown', distance: 9300, moving_time: 1100, elapsed_time: 1100, average_speed: 8.45, average_watts: 172, average_heartrate: 128, average_cadence: 87, elevation_gain: 40 },
      ];
    } else if (activity.id === 'demo-act-5') {
      laps = [
        { id: 501, lap_index: 1, name: 'Outward Flat Rolling', distance: 22000, moving_time: 2500, elapsed_time: 2500, average_speed: 8.8, average_watts: 212, average_heartrate: 136, average_cadence: 89, elevation_gain: 120 },
        { id: 502, lap_index: 2, name: 'First Mountain Pass', distance: 16000, moving_time: 2400, elapsed_time: 2400, average_speed: 6.67, average_watts: 278, average_heartrate: 162, average_cadence: 86, elevation_gain: 340 },
        { id: 503, lap_index: 3, name: 'Valley Traverse', distance: 24000, moving_time: 2700, elapsed_time: 2700, average_speed: 8.89, average_watts: 218, average_heartrate: 138, average_cadence: 88, elevation_gain: 110 },
        { id: 504, lap_index: 4, name: 'Second Ridge & Descent', distance: 20400, moving_time: 2300, elapsed_time: 2300, average_speed: 8.87, average_watts: 245, average_heartrate: 152, average_cadence: 90, elevation_gain: 210 },
      ];
    }
  }

  const enhancedActivity: Record<string, unknown> = {
    ...activity,
    splits_metric: splits_metric.length > 0 ? splits_metric : (activity as any).splits_metric,
    laps: laps.length > 0 ? laps : (activity as any).laps,
  };

  return {
    id: String(activity.id),
    activity: enhancedActivity,
    streams: streams as unknown as Record<string, unknown>,
    fetchedAt: new Date().toISOString(),
    lapsFetchedAt: new Date().toISOString(),
    noStreamsAvailable: false,
  };
}

/**
 * Seeds all demo activity detail records into IndexedDB and returns them in a key-value record map.
 */
export async function seedDemoActivityDetails(): Promise<Record<string, StravaActivityDetailsRecord>> {
  const activities = generateDemoActivities();
  const detailMap: Record<string, StravaActivityDetailsRecord> = {};

  for (const act of activities) {
    try {
      const details = generateDemoActivityDetails(act);
      const saved = await saveStravaActivityDetails(act.id, {
        activity: details.activity || (act as any),
        streams: details.streams,
      });
      detailMap[saved.id] = saved;
    } catch (err) {
      console.warn(`[Demo Seed] Failed to seed details for demo activity ${act.id}:`, err);
    }
  }

  return detailMap;
}
