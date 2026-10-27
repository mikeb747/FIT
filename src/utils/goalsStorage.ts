import { TrainingGoal } from '../types/goals';

export const GOALS_STORAGE_KEY = 'gymfit_training_goals_v2';
export const LEGACY_GOALS_STORAGE_KEY = 'gymfit_training_goals_v1';

export const DEFAULT_GOALS: TrainingGoal[] = [
  {
    id: 'goal-cotswold-classic-v2-2027',
    name: 'Cotswold Classic V2',
    priority: 'A',
    eventType: 'triathlon',
    status: 'upcoming',
    targetType: 'time',
    eventDate: '2027-07-11',
    location: 'Cotswold Country Park & Beach, Cirencester, UK',
    distancePreset: '70.3',
    totalDistanceKm: 113.0,
    totalTargetTimeSec: 17100, // 4:45:00 target
    triathlonSplits: {
      swimDistanceMeters: 1900,
      swimTargetTimeSec: 2100, // 35:00 (1:50/100m)
      t1TargetTimeSec: 180, // 3:00
      bikeDistanceKm: 90.0,
      bikeTargetTimeSec: 9000, // 2:30:00 (36.0 km/h)
      t2TargetTimeSec: 120, // 2:00
      runDistanceKm: 21.1,
      runTargetTimeSec: 5700, // 1:35:00 (4:30/km)
    },
    bikeTargetPowerWatts: 240,
    bikeElevationGainMeters: 385, // ~350 m – 420 m (~1,150 – 1,380 ft) over 89 km
    runElevationGainMeters: 40, // ~30 m – 50 m (100 – 165 ft) total gain. Virtually flat
    runCourseType: 'trail', // Approx. 50% tarmac country lanes / 50% hard-packed gravel lakeside trails
    swimWaterType: 'open_water',
    notes: `Sunday, 11 July 2027 | Mass start at 06:25 (rolling start waves through to 07:30).

• Swim (1.9 km / 1.2 miles): Single anti-clockwise lap in calm, open lake water. Almost always wetsuit-legal.
• Bike (90 km / 56 miles — 2 Laps, Non-Drafting): Open public tarmac roads (traffic management at major junctions, generally smooth to typical UK B-road standard). Elevation: ~350 m – 420 m (~1,150 – 1,380 ft) over 89 km. Since 2023, the Classic uses the "V2.0" loop heading west through Kemble, Malmesbury, and Minety, making it gently rolling rather than pancake-flat, though still an overwhelmingly aero-dominant course.
• Run (21.1 km / 13.1 miles — 3 Laps): Approx. 50% tarmac country lanes / village footpaths and 50% hard-packed gravel lakeside trails around the water park. Carbon road racing shoes handle the dry hard-pack well, though tight 180-degree turnarounds and loose dusty stones require solid footing. Elevation: ~30 m – 50 m (100 – 165 ft) total gain. Virtually flat, passing the finish line and aid stations on every lap.`,
    createdAt: '2026-10-26T00:00:00.000Z',
    milestones: [
      {
        id: 'ms-cotswold-1',
        title: '90km V2.0 Aero TT Simulation (Kemble-Malmesbury-Minety loop)',
        targetDate: '2027-05-30',
        metricTarget: 'Target 235W–245W NP in aero position',
        isCompleted: false,
        notes: 'Test aero hydration setup, bottle placement, and nutritional pacing.',
      },
      {
        id: 'ms-cotswold-2',
        title: '2,000m Open Water Lake Simulation with wetsuit',
        targetDate: '2027-06-13',
        metricTarget: 'Sub-36 min continuous pace (anti-clockwise sighting)',
        isCompleted: false,
        notes: 'Practice calm sighting every 6 strokes and turning buoy lines.',
      },
      {
        id: 'ms-cotswold-3',
        title: 'Brick: 75km Rolling Bike + 10km Mixed Tarmac/Trail Run',
        targetDate: '2027-06-27',
        metricTarget: 'Race pace transitions and cadence check (4:30/km)',
        isCompleted: false,
        notes: 'Test carbon super-shoe grip on loose gravel turnarounds.',
      },
    ],
  },
  {
    id: 'goal-seven-sins-2027',
    name: 'The Seven Sins Run — Saturday Edition (2027)',
    priority: 'A',
    eventType: 'run',
    status: 'upcoming',
    targetType: 'finish',
    eventDate: '2027-01-02',
    location: 'Wenchford Picnic Area, Forest of Dean, UK',
    distancePreset: 'Custom',
    totalDistanceKm: 11.6, // ~7.2 miles
    totalTargetTimeSec: 4200, // 1:10:00
    runCourseType: 'trail',
    runElevationGainMeters: 430, // ~430 m (1,400+ ft)
    notes: `Organised by YPB / Trimax Events — 3-Day New Year Challenge (Fri 1st, Sat 2nd, Sun 3rd Jan 2027).

• Location & Hub: Wenchford Picnic Area on New Road (Blakeney Straits, between Blakeney and Parkend). Sits in a steep-sided valley bottom with a stream running through it, meaning the route climbs immediately out of the start area. Wenchford - Forestry England manages the surrounding woodland tracks and car park (event parking is £2 cash per car, space is tight).
• Date & Start Time: Saturday, 2 January 2027. Registration opens at 09:00. Start Time: 10:10 AM for solo runners. (Crucial Saturday detail: Canicross runners start at 10:00 AM, solo runners set off 10 minutes later at 10:10 AM).
• Distance & Elevation: ~7.2 miles (approx. 11.6 km) with ~430 m (1,400+ ft) elevation gain. Features 7 distinct, steep climbs ("Pride, Greed, Sloth, Lust, Gluttony, Wrath, and Envy").
• Surface & Terrain: 100% Off-Road Winter Woodland Trail: Expect deep, slick January mud, wet tree roots, loose forestry stone tracks, leaf litter, steep gullies, and water/stream crossings. Severe zig-zagging banks where scrambling on hands and knees or power-hiking is common (especially Hill 2 Greed and Hill 5 Gluttony).
• Footwear: Deep-lugged mud/fell shoes (6 mm–8 mm studs) essential for traction on climbs and staying upright on descents.
• Training & Setup: VO2 Max Recovery & Eccentric Quad Conditioning. Series of 7 anaerobic/threshold hill repeats separated by steep, technical descents. Train steep uphill power-hiking/running transitions and build eccentric quad strength to handle steep downhill braking without blowing up legs before Hill 6 (Wrath) and Hill 7 (Envy).`,
    createdAt: '2026-10-26T00:00:00.000Z',
    milestones: [
      {
        id: 'ms-sevensins-1',
        title: '7 x Steep Mud Incline Repeats + Downhill Braking Drills',
        targetDate: '2026-11-28',
        metricTarget: '450m+ cumulative elevation gain in fell shoes',
        isCompleted: false,
        notes: 'Build eccentric quad resistance and trail balance.',
      },
      {
        id: 'ms-sevensins-2',
        title: 'Winter Wet Trail & Stream Crossing Simulation (12km)',
        targetDate: '2026-12-19',
        metricTarget: 'Test 8mm stud fell shoes in cold mud',
        isCompleted: false,
        notes: 'Practice rapid power-hiking cadence on slick banks.',
      },
    ],
  },
  {
    id: 'goal-oldbury-10-miler-2027',
    name: 'Oldbury 10 Miler (2027)',
    priority: 'A',
    eventType: 'run',
    status: 'upcoming',
    targetType: 'time',
    eventDate: '2027-09-19',
    location: 'Oldbury Power Station, Oldbury Naite, BS35 1RQ, UK',
    distancePreset: '10 Mile',
    totalDistanceKm: 16.1, // 10.0 miles
    totalTargetTimeSec: 3900, // 1:05:00 (6:30/mi or 4:02/km)
    runCourseType: 'road',
    runElevationGainMeters: 30, // ~23 m – 38 m (75 – 125 ft)
    runTargetPaceSec: 242, // ~4:02/km (6:30/mi)
    notes: `Organised by Thornbury Running Club — Race 3 of the TRC Series.

• HQ & Start/Finish: Oldbury Power Station (Oldbury Naite, BS35 1RQ) acts as Race HQ, registration base, and start/finish area. Course loops through quiet rural lanes surrounding the station right beside the Severn Estuary.
• Date & Start Time: Expected Sunday, 19 September 2027 (TRC confirmed September 2027). Start Time: 10:30 AM (Registration from 09:00 AM).
• Distance & Elevation: Accurately measured 10.0 miles (16.1 km) in a figure-of-eight/loop configuration on country lanes. Elevation gain: ~23 m – 38 m (75 – 125 ft) across the entire 10 miles. One of the flattest 10-mile road courses in the South West (~7.5 ft per mile).
• Surface & Conditions: 100% Road (Tarmac) on quiet rural country lanes. Environmental Factor: Because lanes sit right on flat Severn floodplains next to estuary, minimal natural shelter from prevailing south-westerly breeze off the water.
• Training & Setup: Pure Lactate Threshold Lock-In. Virtually zero elevation to disrupt stride. Ideal race for carbon super-shoes and strict, metronomic pace strategy. Train long, uninterrupted threshold and 10-mile goal-pace blocks (e.g., 2 x 4 miles or 3 x 3 miles at goal pace) on flat tarmac to build muscular tolerance for repetitive, identical foot-strikes.`,
    createdAt: '2026-10-26T00:00:00.000Z',
    milestones: [
      {
        id: 'ms-oldbury-1',
        title: '2 x 3 Miles @ 10-Mile Goal Threshold Pace on flat road',
        targetDate: '2027-08-15',
        metricTarget: 'Target metronomic threshold pace with 3 min float recovery',
        isCompleted: false,
        notes: 'Lock in cadence and carbon super-shoe efficiency.',
      },
      {
        id: 'ms-oldbury-2',
        title: '2 x 4 Miles @ Goal Pace with estuary wind simulation',
        targetDate: '2027-08-29',
        metricTarget: 'Muscular tolerance for repetitive identical foot-strikes',
        isCompleted: false,
        notes: 'Practice tucking in against headwind stretches.',
      },
      {
        id: 'ms-oldbury-3',
        title: '15km Flat Road Progression (Final 5km @ Race Pace)',
        targetDate: '2027-09-05',
        metricTarget: 'Final race dress rehearsal and taper check',
        isCompleted: false,
      },
    ],
  },
];

export function loadAthleteGoals(): TrainingGoal[] {
  if (typeof window === 'undefined') return DEFAULT_GOALS;
  try {
    const rawV2 = localStorage.getItem(GOALS_STORAGE_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // If it contains the deprecated demo goals (Mallorca / Valencia), upgrade to the new default races
        const hasLegacy = parsed.some((g) => g.id === 'goal-demo-tri-703' || g.id === 'goal-demo-marathon');
        if (!hasLegacy) {
          return parsed;
        }
      }
    }

    // Check v1 legacy storage
    const rawV1 = localStorage.getItem(LEGACY_GOALS_STORAGE_KEY);
    if (rawV1) {
      const parsedV1 = JSON.parse(rawV1);
      if (Array.isArray(parsedV1) && parsedV1.length > 0) {
        const hasLegacy = parsedV1.some((g) => g.id === 'goal-demo-tri-703' || g.id === 'goal-demo-marathon');
        if (!hasLegacy) {
          saveAthleteGoals(parsedV1);
          return parsedV1;
        }
      }
    }

    // Default to the 3 new default races
    saveAthleteGoals(DEFAULT_GOALS);
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

export function resetAthleteGoalsToDefaults(): TrainingGoal[] {
  saveAthleteGoals(DEFAULT_GOALS);
  return DEFAULT_GOALS;
}
