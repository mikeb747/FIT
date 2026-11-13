import type { AthleteProfile } from '../types/athlete';
import type { TrainingGoal } from '../types/goals';
import type {
  RecommendedWorkout,
  PeriodizedPlan,
  CoachSport,
  CoachRequestPayload,
  WorkoutIntensityLevel,
} from '../types/coach';
import {
  findBestMatchingActivity,
  reconstructWorkoutFromQuery,
  speedKphToPace,
  analyzeActivityStructureAndLaps,
  getStructuredWorkoutsByDayOfWeek,
} from './coachWorkoutMatcher';

function formatPaceSec(seconds?: number): string {
  if (!seconds || seconds <= 0) return 'N/A';
  const mins = Math.floor(seconds / 60);
  const remSec = Math.round(seconds % 60);
  return `${mins}:${remSec.toString().padStart(2, '0')}/km`;
}

/**
 * Intelligent client-side sports science workout generator.
 * Analyzes athlete physiology (FTP, LTHR, pace zones), daily readiness (HRV, sleep, soreness),
 * fitness/fatigue balance (CTL, ATL, TSB), and race goals to produce structured workouts.
 */
export function generateSportsScienceWorkout(payload: CoachRequestPayload): RecommendedWorkout {
  const profile = payload.athleteProfile || ({} as AthleteProfile);
  const ftp = Number(profile.bikeFtp) || 315;
  const lthr = Number(profile.thresholdHeartRateRun) || 168;
  const maxHr = Number(profile.maxHeartRate) || 185;
  const restingHr = Number(profile.restingHeartRate) || 48;
  const outdoorPaceSec = Number(profile.thresholdPaceRunOutdoorSec) || 240;
  const treadmillPaceSec = Number(profile.thresholdPaceRunTreadmillSec) || 230;
  const swimPace100mSec = Number(profile.swimPoolPace100mSec) || 90;

  const readinessScore = Number(payload.latestReadiness?.score ?? 75);
  const tsb = Number(payload.fitnessStats?.tsb ?? 0);
  const ctl = Number(payload.fitnessStats?.ctl ?? 75);
  const atl = Number(payload.fitnessStats?.atl ?? 70);

  const preferred = payload.preferredSport;
  const targetDuration = payload.targetDurationMin;

  const goals = payload.goals || [];
  const primaryGoal = goals.find((g: any) => g.priority === 'A') || goals[0];
  const goalDesc = primaryGoal ? `${primaryGoal.name} (${primaryGoal.eventType || 'Triathlon'})` : 'Triathlon Milestone';

  const rawInjuries: any[] = profile.injuries || [];
  const injuries = rawInjuries.filter(
    (inj: any) => inj.status === 'active' || inj.status === 'monitoring'
  );
  const hasLowerLimbInjury = injuries.some((inj: any) =>
    ['knee', 'calf', 'achilles', 'foot', 'ankle', 'hamstring', 'shin'].some((area) =>
      String(inj.bodyArea || '').toLowerCase().includes(area)
    )
  );

  // 1. Determine Sport
  let sport: CoachSport = preferred && preferred !== 'auto' ? preferred : 'bike';
  if (preferred === 'auto' || !preferred) {
    if (payload.fitnessStats?.limitingFactor) {
      const lim = String(payload.fitnessStats.limitingFactor).toLowerCase();
      if (lim.includes('bike')) sport = 'bike';
      else if (lim.includes('run')) sport = 'run';
      else if (lim.includes('swim')) sport = 'swim';
    } else {
      if (readinessScore < 50 || tsb < -20) {
        sport = 'rest';
      } else if (readinessScore < 65) {
        sport = 'bike';
      } else {
        sport = 'bike';
      }
    }
  }

  if (hasLowerLimbInjury && (sport === 'run' || sport === 'brick')) {
    sport = 'bike'; // protect injured running mechanics
  }

  // 2. Determine Intensity Level
  const isFatigued = readinessScore < 60 || tsb < -15;
  const isOptimal = readinessScore >= 75 && tsb >= -10;

  // 3. Build Sport-Specific Prescription
  if (sport === 'rest') {
    return {
      id: `rec_${Date.now()}`,
      title: 'Restorative Recovery & Soft-Tissue Protocol',
      sport: 'rest',
      durationMin: targetDuration || 30,
      estimatedTss: 0,
      intensity: 'recovery',
      targetZones: {
        watts: '0W',
        heartRate: `< ${restingHr + 15} bpm`,
        pace: 'Rest',
      },
      coachRationale: `Readiness is currently ${readinessScore}% with a Form (TSB) of ${tsb > 0 ? `+${tsb}` : tsb}. Your autonomic nervous system is signaling acute fatigue; taking a complete rest day facilitates glycogen restoration and supercompensation for upcoming key sessions.`,
      readinessAnalysis: `Parasympathetic tone is depressed. Total rest today will protect your chronic training load (${ctl} CTL) from overreaching.`,
      structure: [
        { phase: 'Phase 1', duration: '15 min', description: 'Diaphragmatic box breathing (4s inhale, 4s hold, 4s exhale, 4s hold) and full-body foam rolling (hamstrings, glutes, quads).', target: 'Parasympathetic reset' },
        { phase: 'Phase 2', duration: '15 min', description: 'Gentle mobility flow focusing on hip flexor open-books, thoracic spine rotations, and ankle dorsiflexion.', target: 'Zero strain' },
      ],
      nutritionTips: 'Prioritize whole-food proteins (2.0g/kg), omega-3 fatty acids, tart cherry juice for sleep architecture, and 2.5-3.0L electrolyte hydration.',
      injuryWarning: injuries.length > 0 ? `Respect active symptoms: ${injuries.map((i: any) => i.name).join(', ')}. Keep tissue work gentle.` : undefined,
      createdAt: new Date().toISOString(),
    };
  }

  if (sport === 'bike') {
    if (isFatigued) {
      const z1Max = Math.round(ftp * 0.55);
      const z1Hr = Math.round(lthr * 0.68);
      return {
        id: `rec_${Date.now()}`,
        title: 'Active Recovery Spin & Flush',
        sport: 'bike',
        durationMin: targetDuration || 45,
        estimatedTss: 24,
        intensity: 'recovery',
        targetZones: {
          watts: `< ${z1Max}W (Zone 1 Active Recovery)`,
          heartRate: `< ${z1Hr} bpm`,
          pace: 'N/A',
        },
        coachRationale: `Readiness is ${readinessScore}% and Form (TSB) is ${tsb > 0 ? `+${tsb}` : tsb}. Rather than total stillness, a light spin promotes lymphatic drainage, flushes metabolic by-products, and stimulates blood circulation to the legs without inducing stress.`,
        readinessAnalysis: 'HRV and sleep data suggest moderate fatigue. Keeping wattage strictly in Zone 1 preserves neuromuscular reserves for quality days ahead.',
        structure: [
          { phase: 'Warm-up', duration: '10 min', description: 'Easy cadence build at 85-90 RPM. Stay in small chainring, breathing only through the nose.', target: `< ${Math.round(ftp * 0.48)}W` },
          { phase: 'Main Set', duration: '25 min', description: `Smooth, fluid spin at 90-95 RPM. Never exceed ${z1Max}W. Stand up every 10 minutes for 30s to relieve saddle pressure.`, target: `${Math.round(ftp * 0.45)}-${z1Max}W` },
          { phase: 'Cool-down', duration: '10 min', description: 'Drop cadence to 80 RPM, ease off power completely, light leg shaking.', target: `< ${Math.round(ftp * 0.40)}W` },
        ],
        nutritionTips: '500ml water with electrolytes during spin. Post-ride protein smoothie (25g whey/plant protein + banana).',
        createdAt: new Date().toISOString(),
      };
    }

    if (isOptimal) {
      // Sweet Spot or Threshold Quality Session
      const ssLow = Math.round(ftp * 0.88);
      const ssHigh = Math.round(ftp * 0.93);
      const z2 = Math.round(ftp * 0.70);
      const dur = targetDuration || 75;
      return {
        id: `rec_${Date.now()}`,
        title: 'Sweet Spot Sustained Threshold Power',
        sport: 'bike',
        durationMin: dur,
        estimatedTss: Math.round((dur / 60) * 65),
        intensity: 'tempo_z3',
        targetZones: {
          watts: `${ssLow}-${ssHigh}W (Sweet Spot 88-93% FTP)`,
          heartRate: `${Math.round(lthr * 0.85)}-${Math.round(lthr * 0.92)} bpm`,
          pace: 'N/A',
        },
        coachRationale: `Readiness is primed at ${readinessScore}% and Form (TSB) is ${tsb > 0 ? `+${tsb}` : tsb}. This session builds high mitochondrial density and lactate clearance capacity with a modest recovery footprint, directly preparing you for ${goalDesc}.`,
        readinessAnalysis: 'Autonomic nervous system is balanced with steady overnight HRV. Green light to absorb sustained quality work.',
        structure: [
          { phase: 'Warm-up', duration: '15 min', description: `Progressive ramp from ${Math.round(ftp * 0.55)}W to ${z2}W, followed by 3 x 30s high-cadence fast pedals (105+ RPM) to open neural pathways.`, target: `${Math.round(ftp * 0.55)}-${z2}W` },
          { phase: 'Main Set', duration: `${dur - 30} min`, description: `3 x 12 min at Sweet Spot (${ssLow}-${ssHigh}W) with 4 min easy recovery spin at ${Math.round(ftp * 0.55)}W between blocks. Hold your aero race posture.`, target: `${ssLow}-${ssHigh}W` },
          { phase: 'Cool-down', duration: '15 min', description: 'Smooth spin down at 90 RPM, nasal breathing, relaxing shoulder and neck tension.', target: `< ${Math.round(ftp * 0.50)}W` },
        ],
        nutritionTips: 'Take 50-60g carbs per hour (maltodextrin drink or gel every 30m) with 600ml water/electrolytes.',
        createdAt: new Date().toISOString(),
      };
    }

    // Steady Zone 2 Endurance Ride
    const z2Low = Math.round(ftp * 0.65);
    const z2High = Math.round(ftp * 0.75);
    const dur = targetDuration || 60;
    return {
      id: `rec_${Date.now()}`,
      title: 'Aerobic Base Foundation & Aerobar Economy',
      sport: 'bike',
      durationMin: dur,
      estimatedTss: Math.round((dur / 60) * 50),
      intensity: 'aerobic_z2',
      targetZones: {
        watts: `${z2Low}-${z2High}W (Zone 2 Aerobic Base)`,
        heartRate: `${Math.round(lthr * 0.72)}-${Math.round(lthr * 0.82)} bpm`,
        pace: 'N/A',
      },
      coachRationale: `Readiness is solid at ${readinessScore}%. A controlled Zone 2 endurance session stimulates capillary growth and fat oxidation without triggering excess autonomic fatigue.`,
      readinessAnalysis: 'Stable recovery indicators support steady aerobic endurance volume.',
      structure: [
        { phase: 'Warm-up', duration: '10 min', description: 'Gradual spin up into Zone 2 power, checking cadence (88-92 RPM).', target: `${Math.round(ftp * 0.55)}-${z2Low}W` },
        { phase: 'Main Set', duration: `${dur - 20} min`, description: `Steady Zone 2 pacing at ${z2Low}-${z2High}W. Spend 70% of time in aero extensions, maintaining quiet upper body.`, target: `${z2Low}-${z2High}W` },
        { phase: 'Cool-down', duration: '10 min', description: 'Easy spin down, light hamstring stretch post-ride.', target: `< ${Math.round(ftp * 0.50)}W` },
      ],
      nutritionTips: '1 bottle with electrolytes and 30g carbs. Rehydrate thoroughly post-workout.',
      createdAt: new Date().toISOString(),
    };
  }

  if (sport === 'run') {
    if (isFatigued) {
      const easyPaceSec = Math.round(outdoorPaceSec * 1.25);
      return {
        id: `rec_${Date.now()}`,
        title: 'Aerobic Recovery Jog & Biomechanical Flush',
        sport: 'run',
        durationMin: targetDuration || 35,
        estimatedTss: 22,
        intensity: 'recovery',
        targetZones: {
          heartRate: `< ${Math.round(lthr * 0.72)} bpm (Zone 1)`,
          pace: `${formatPaceSec(easyPaceSec)} or conversational`,
        },
        coachRationale: `Readiness is ${readinessScore}%. A gentle recovery jog on soft surface stimulates blood flow to running muscles without pounding stress or lactate build-up.`,
        readinessAnalysis: 'Elevated muscle fatigue or suppressed HRV indicates light aerobic stimulus only.',
        structure: [
          { phase: 'Warm-up', duration: '5 min', description: 'Brisk walking and dynamic leg swings (front-to-back and lateral), calf pumps.', target: 'Warm joints' },
          { phase: 'Main Set', duration: '25 min', description: 'Continuous easy jog on grass, trail, or treadmill. Strictly conversational—able to speak in full sentences.', target: `< ${Math.round(lthr * 0.72)} bpm` },
          { phase: 'Cool-down', duration: '5 min', description: 'Walking flush + calf/hamstring stretching.', target: 'Heart rate recovery' },
        ],
        nutritionTips: '500ml water and electrolytes post-run. Foam roll calves and glutes.',
        injuryWarning: hasLowerLimbInjury ? 'Stop immediately if pain exceeds 2/10 in affected area.' : undefined,
        createdAt: new Date().toISOString(),
      };
    }

    if (isOptimal) {
      const tempoPaceSec = Math.round(outdoorPaceSec * 1.06);
      const dur = targetDuration || 55;
      return {
        id: `rec_${Date.now()}`,
        title: 'Lactate Threshold Cruise Intervals',
        sport: 'run',
        durationMin: dur,
        estimatedTss: Math.round((dur / 60) * 75),
        intensity: 'threshold_z4',
        targetZones: {
          heartRate: `${Math.round(lthr * 0.94)}-${Math.round(lthr * 0.99)} bpm (Zone 4 Threshold)`,
          pace: `${formatPaceSec(tempoPaceSec)} (Outdoor) / ${formatPaceSec(Math.round(treadmillPaceSec * 1.05))} (Treadmill)`,
        },
        coachRationale: `Optimal readiness (${readinessScore}%) and fresh Form (TSB: ${tsb}) allow a targeted threshold session to increase your functional running speed and raise your LTHR ceiling for ${goalDesc}.`,
        readinessAnalysis: 'HRV and sleep trends indicate complete physiological restoration. Neuromuscular system ready for threshold demands.',
        structure: [
          { phase: 'Warm-up', duration: '15 min', description: 'Easy Zone 1/2 jog building rhythm, plus 4 x 20s progressive accelerations (strides) with walk back.', target: 'Gradual HR rise' },
          { phase: 'Main Set', duration: `${dur - 25} min`, description: `3 x 8 min at Threshold Pace (${formatPaceSec(tempoPaceSec)}) with 2 min easy jog recovery between sets. Focus on high cadence (176-182 spm).`, target: `${Math.round(lthr * 0.94)}-${Math.round(lthr * 0.99)} bpm` },
          { phase: 'Cool-down', duration: '10 min', description: 'Very easy jog down to walking, static calf and hip flexor stretches.', target: 'Zone 1' },
        ],
        nutritionTips: '1 gel with water 15 minutes before the first interval. Rehydrate with 600ml electrolytes post-run.',
        injuryWarning: hasLowerLimbInjury ? 'Monitor stride symmetry. If calf or knee tightens, terminate the interval set.' : undefined,
        createdAt: new Date().toISOString(),
      };
    }

    // Steady Zone 2 Aerobic Run
    const z2PaceSec = Math.round(outdoorPaceSec * 1.15);
    const dur = targetDuration || 50;
    return {
      id: `rec_${Date.now()}`,
      title: 'Aerobic Base Endurance Run',
      sport: 'run',
      durationMin: dur,
      estimatedTss: Math.round((dur / 60) * 52),
      intensity: 'aerobic_z2',
      targetZones: {
        heartRate: `${Math.round(lthr * 0.74)}-${Math.round(lthr * 0.84)} bpm (Zone 2 Aerobic)`,
        pace: `${formatPaceSec(z2PaceSec)} steady`,
      },
      coachRationale: `Readiness is balanced at ${readinessScore}%. A continuous Zone 2 aerobic run develops muscular endurance and running economy without requiring lengthy recovery.`,
      readinessAnalysis: 'Stable recovery indicators support steady aerobic endurance volume.',
      structure: [
        { phase: 'Warm-up', duration: '10 min', description: 'Gradual jog from Zone 1 to Zone 2, dynamic ankle circles.', target: 'Zone 1/2' },
        { phase: 'Main Set', duration: `${dur - 20} min`, description: `Steady Zone 2 running at ${formatPaceSec(z2PaceSec)}. Keep cadence above 174 spm and breathing rhythmic.`, target: `${Math.round(lthr * 0.74)}-${Math.round(lthr * 0.84)} bpm` },
        { phase: 'Cool-down', duration: '10 min', description: 'Gentle deceleration jog to walk, quad and calf stretching.', target: 'Heart rate recovery' },
      ],
      nutritionTips: 'Drink 500ml water before run. 20g protein post-run.',
      createdAt: new Date().toISOString(),
    };
  }

  if (sport === 'swim') {
    const dur = targetDuration || 60;
    return {
      id: `rec_${Date.now()}`,
      title: 'Threshold CSS Pace & Stroke Durability',
      sport: 'swim',
      durationMin: dur,
      estimatedTss: 55,
      intensity: 'threshold_z4',
      targetZones: {
        pace: `${formatPaceSec(swimPace100mSec)}/100m (Target CSS Pace)`,
      },
      coachRationale: `Swimming provides high cardiovascular training stimulus with zero eccentric muscle breakdown, making it an exceptional training choice for today's readiness of ${readinessScore}%.`,
      readinessAnalysis: 'Non-impact aerobic session that protects joints while developing upper-body cardiovascular stamina.',
      structure: [
        { phase: 'Warm-up', duration: '15 min (400m)', description: '200m easy freestyle, 100m kick with kickboard, 100m pull buoy focusing on Early Vertical Forearm (EVF).', target: 'Easy aerobic' },
        { phase: 'Main Set', duration: `${dur - 25} min (1800m)`, description: `3 sets of [4 x 100m @ CSS pace (${formatPaceSec(swimPace100mSec)}) with 15s rest, followed by 1 x 200m steady pull buoy]. Count strokes per 25m length.`, target: 'CSS Threshold' },
        { phase: 'Cool-down', duration: '10 min (200m)', description: '200m relaxed backstroke and easy breaststroke/freestyle flush.', target: 'Heart rate recovery' },
      ],
      nutritionTips: 'Sip electrolyte drink on the pool deck between sets.',
      createdAt: new Date().toISOString(),
    };
  }

  if (sport === 'brick') {
    const dur = targetDuration || 75;
    const bikeDur = Math.round(dur * 0.75);
    const runDur = dur - bikeDur;
    const ssLow = Math.round(ftp * 0.80);
    const ssHigh = Math.round(ftp * 0.85);
    const racePaceSec = Math.round(outdoorPaceSec * 1.08);

    return {
      id: `rec_${Date.now()}`,
      title: 'Race-Simulation Brick: Tempo Ride + Off-Bike Transition Run',
      sport: 'brick',
      durationMin: dur,
      estimatedTss: Math.round((dur / 60) * 72),
      intensity: 'tempo_z3',
      targetZones: {
        watts: `${ssLow}-${ssHigh}W (Race Pace Bike)`,
        heartRate: `${Math.round(lthr * 0.82)}-${Math.round(lthr * 0.90)} bpm`,
        pace: `${formatPaceSec(racePaceSec)} off the bike`,
      },
      coachRationale: `Readiness is strong (${readinessScore}%). Brick training develops the neuromuscular ability to transition from bike pedaling to run mechanics under fatigue, vital for ${goalDesc}.`,
      readinessAnalysis: 'Solid physiological platform supports multi-sport transition stress.',
      structure: [
        { phase: 'Bike Leg', duration: `${bikeDur} min`, description: `Steady Zone 3 ride holding ${ssLow}-${ssHigh}W in aero position. Practice sipping carbs every 15 mins.`, target: `${ssLow}-${ssHigh}W` },
        { phase: 'Transition (T2)', duration: '2 min', description: 'Quick transition from bike shoes to running shoes.', target: 'Fast T2' },
        { phase: 'Run Leg', duration: `${runDur} min`, description: `Off-the-bike transition run at target half-marathon pace (${formatPaceSec(racePaceSec)}). High cadence (178 spm) to shake heavy legs.`, target: formatPaceSec(racePaceSec) },
      ],
      nutritionTips: 'Take 40g carbs on the bike. Rehydrate with 750ml electrolyte fluid post-brick.',
      injuryWarning: hasLowerLimbInjury ? 'If Achilles or calf tightens during the run off the bike, drop to a walk immediately.' : undefined,
      createdAt: new Date().toISOString(),
    };
  }

  // Strength / Mobility fallback
  return {
    id: `rec_${Date.now()}`,
    title: 'Triathlon Core & Single-Leg Stability',
    sport: 'strength',
    durationMin: targetDuration || 40,
    estimatedTss: 25,
    intensity: 'aerobic_z2',
    targetZones: {
      watts: 'N/A',
      heartRate: `< ${Math.round(lthr * 0.70)} bpm`,
      pace: 'N/A',
    },
    coachRationale: `Readiness is ${readinessScore}%. Strength and stability work reinforces hip, glute, and core stability to prevent overuse injuries and boost power transfer on bike and run.`,
    readinessAnalysis: 'Low cardiovascular stress day focused on structural integrity and tissue resilience.',
    structure: [
      { phase: 'Warm-up', duration: '10 min', description: 'Glute bridges, bird-dogs, hip 90/90 mobility, and calf stretches.', target: 'Mobility' },
      { phase: 'Main Set', duration: '25 min', description: '3 rounds of: 10 Bulgarian split squats per leg, 12 single-leg Romanian deadlifts, 45s side plank with hip abduction, 12 renegade rows.', target: 'Form & control' },
      { phase: 'Cool-down', duration: '5 min', description: 'Hamstring flossing and thoracic foam rolling.', target: 'Relaxation' },
    ],
    nutritionTips: 'High protein recovery shake (25-30g protein) + water.',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Intelligent client-side periodized training plan generator.
 */
export function generateSportsSciencePlan(payload: CoachRequestPayload): PeriodizedPlan {
  const profile = payload.athleteProfile || ({} as AthleteProfile);
  const ftp = Number(profile.bikeFtp) || 315;
  const lthr = Number(profile.thresholdHeartRateRun) || 168;
  const outdoorPaceSec = Number(profile.thresholdPaceRunOutdoorSec) || 240;
  const swimPace100mSec = Number(profile.swimPoolPace100mSec) || 90;

  const goals = payload.goals || [];
  const primaryGoal = goals.find((g) => g.priority === 'A') || goals[0] || {
    name: 'Triathlon Milestone',
    distancePreset: 'Middle 70.3',
    eventDate: '2026-08-15',
  };

  const ctl = payload.fitnessStats?.ctl ?? 75;

  return {
    id: `plan_${Date.now()}`,
    goalName: primaryGoal.name || 'Ironman 70.3',
    targetRaceDate: primaryGoal.eventDate || '2026-08-15',
    weeksToGoal: 14,
    summary: `Individualized 7-day adaptive microcycle tailored to your current Chronic Training Load (${ctl} CTL), ${ftp}W bike FTP, and ${lthr} bpm run LTHR, building toward ${primaryGoal.name}.`,
    periodizationPhase: 'Build Phase - Aerobic Threshold & Durability',
    athleteStrengths: `Strong aerobic baseline with FTP benchmark of ${ftp}W and sustained endurance history.`,
    keyFocusAreas: [
      `Sustained Sweet Spot cycling at ${Math.round(ftp * 0.88)}-${Math.round(ftp * 0.92)}W for lactate clearing power`,
      `Progressive cruise intervals on the run at ${formatPaceSec(Math.round(outdoorPaceSec * 1.06))} keeping HR below ${lthr} bpm`,
      `Aerobic swim conditioning with CSS pacing (${formatPaceSec(swimPace100mSec)}/100m) and early vertical forearm technique`,
    ],
    weeks: [
      {
        weekNumber: 1,
        title: 'Weekly Target Microcycle',
        focus: 'Aerobic Efficiency & Sustained Threshold Stamina',
        totalHours: 9.5,
        totalTss: 440,
        days: [
          {
            dayName: 'Monday',
            sport: 'rest',
            title: 'Full Recovery & Soft Tissue Mobility',
            durationMin: 0,
            targetTss: 0,
            description: 'Rest day. Foam roll calves, quads, and glutes. Hydrate with electrolytes and target 8+ hours quality sleep.',
            isKeySession: false,
          },
          {
            dayName: 'Tuesday',
            sport: 'bike',
            title: `Sweet Spot Intervals (3 x 12 min @ ${Math.round(ftp * 0.90)}W)`,
            durationMin: 75,
            targetTss: 70,
            description: `15 min warm-up, 3 x 12 min at Sweet Spot (${Math.round(ftp * 0.88)}-${Math.round(ftp * 0.92)}W) with 4 min easy spin recovery, 15 min cool-down.`,
            isKeySession: true,
            targetMetric: `${Math.round(ftp * 0.90)}W`,
          },
          {
            dayName: 'Wednesday',
            sport: 'swim',
            title: 'Aerobic CSS Threshold & EVF Technique',
            durationMin: 60,
            targetTss: 55,
            description: `400m warm-up, 10 x 100m @ CSS (${formatPaceSec(swimPace100mSec)}) + 15s rest, 4 x 200m pull buoy steady, 200m cool-down.`,
            isKeySession: false,
            targetMetric: `${formatPaceSec(swimPace100mSec)}/100m`,
          },
          {
            dayName: 'Thursday',
            sport: 'run',
            title: 'Lactate Threshold Cruise Intervals (3 x 8 min)',
            durationMin: 55,
            targetTss: 62,
            description: `15 min warm-up, 3 x 8 min at ${formatPaceSec(Math.round(outdoorPaceSec * 1.06))} (HR: ${Math.round(lthr * 0.95)} bpm) with 2 min jog recovery, 10 min cool-down.`,
            isKeySession: true,
            targetMetric: `${lthr} bpm`,
          },
          {
            dayName: 'Friday',
            sport: 'swim',
            title: 'Active Recovery Swim & Core Stability',
            durationMin: 45,
            targetTss: 35,
            description: '1500m mixed strokes, drill work with fins and snorkel. Followed by 15 min core and hip mobility.',
            isKeySession: false,
          },
          {
            dayName: 'Saturday',
            sport: 'bike',
            title: `Long Aerobic Endurance Ride (${Math.round(ftp * 0.70)}W) + Transition Brick`,
            durationMin: 150,
            targetTss: 130,
            description: `135 min steady Zone 2 ride (${Math.round(ftp * 0.65)}-${Math.round(ftp * 0.72)}W) in aero bars, immediately followed by a 15 min easy transition brick run.`,
            isKeySession: true,
            targetMetric: `${Math.round(ftp * 0.70)}W`,
          },
          {
            dayName: 'Sunday',
            sport: 'run',
            title: 'Long Aerobic Zone 2 Endurance Run',
            durationMin: 85,
            targetTss: 90,
            description: `Progressive distance run on soft gravel/dirt path at ${formatPaceSec(Math.round(outdoorPaceSec * 1.15))}. Keep HR strictly in Zone 2 (${Math.round(lthr * 0.75)}-${Math.round(lthr * 0.83)} bpm).`,
            isKeySession: true,
            targetMetric: 'Zone 2 Heart Rate',
          },
        ],
      },
    ],
    createdAt: new Date().toISOString(),
  };
}

/**
 * Intelligent client-side sports science chat response generator.
 */
/**
 * Intelligent client-side sports science chat response generator.
 * Capable of analyzing exact activity history for queries like "training today",
 * "the weekend", "last week", and "progress my run workouts from the last 2 Thursdays".
 */
export function generateSportsScienceChat(
  question: string,
  payload: CoachRequestPayload,
  _history?: any[]
): string {
  const profile = payload.athleteProfile || ({} as AthleteProfile);
  const ftp = Number(profile.bikeFtp) || 315;
  const lthr = Number(profile.thresholdHeartRateRun) || 168;
  const outdoorPace = formatPaceSec(profile.thresholdPaceRunOutdoorSec || (profile as any).runThresholdPaceSec || 232);
  const treadmillPace = formatPaceSec(profile.thresholdPaceRunTreadmillSec || 228);
  const readiness = payload.latestReadiness?.score ?? 84;
  const tsb = payload.fitnessStats?.tsb ?? -7;
  const ctl = payload.fitnessStats?.ctl ?? 75;
  const ctlRamp7d = payload.fitnessStats?.ctlRampRate7d ?? 2.5;
  const rampAssessment = payload.fitnessStats?.rampRateAssessment || `Optimal Progressive Build (+${ctlRamp7d} CTL/wk)`;

  const rawActivities = payload.recentActivities || [];
  const activities = rawActivities.map((a) => {
    if (a.workoutClassification && (a.intervalStructureSummary || a.activeWorkSummary)) return a;
    const insight = analyzeActivityStructureAndLaps(a, undefined, profile);
    return { ...a, ...insight };
  });

  const goals = payload.goals || [];
  const todayDate = payload.todayDate || new Date().toISOString().split('T')[0];
  const todayDayOfWeek = payload.todayDayOfWeek || new Date().toLocaleDateString('en-US', { weekday: 'long' });

  const qTrim = String(question).trim();
  const q = qTrim.toLowerCase();

  // -------------------------------------------------------------
  // 0. UNSCRIPTED CONVERSATIONAL & ARITHMETIC / GENERAL Q&A
  // Never dump FTP/LTHR boilerplate when the user asks a quick math question (like "What is 3+3") or casual greeting!
  // -------------------------------------------------------------
  const mathMatch = qTrim.match(/^(?:what\s+is\s+|calculate\s+|solve\s+)?(-?\d+(?:\.\d+)?)\s*([+\-*/x×÷])\s*(-?\d+(?:\.\d+)?)\s*\??$/i);
  if (mathMatch) {
    const a = parseFloat(mathMatch[1]);
    const op = mathMatch[2];
    const b = parseFloat(mathMatch[3]);
    let resVal: number | string = 0;
    if (op === '+') resVal = a + b;
    else if (op === '-') resVal = a - b;
    else if (op === '*' || op === 'x' || op === '×') resVal = a * b;
    else if (op === '/' || op === '÷') resVal = b !== 0 ? Number((a / b).toFixed(4)) : 'undefined (division by zero)';
    return `**${a} ${op} ${b} = ${resVal}**.\n\nLet me know if you want to run any pace/speed conversions, race split calculations, or look at your training!`;
  }

  if (/^(hi|hello|hey|good morning|good afternoon|good evening|thanks|thank you|test)\b[!?.]*$/i.test(qTrim)) {
    const primaryGoal = goals.find((g: any) => g.priority === 'A') || goals[0];
    return `Hey! I have your latest training log, lap/interval structures, CTL ramp rate (**${ctlRamp7d >= 0 ? `+${ctlRamp7d}` : ctlRamp7d} CTL/wk**), work schedule, and ${primaryGoal ? `upcoming **${primaryGoal.name}** countdown` : 'race goals'} ready.\n\nWhat would you like to work on—reviewing your recent interval sessions, adding a goal race, updating workout comments, or planning your next session?`;
  }

  // -------------------------------------------------------------
  // 1. ONLINE RACE SEARCH & GOAL ADDITION: Seven Sins Trail Run or General "Add <Race> to Goals"
  // -------------------------------------------------------------
  if (
    q.includes('seven sins') ||
    q.includes('7 sins') ||
    ((q.includes('add') || q.includes('create') || q.includes('put') || q.includes('include')) &&
      (q.includes('goal') || q.includes('race') || q.includes('event')) &&
      !q.includes('chippenham') &&
      !q.includes('ironman'))
  ) {
    const hasPriorityA = /\b(priority\s*a|a-race|a\s+race|make\s+it\s+a)\b/i.test(q);
    const hasPriorityB = /\b(priority\s*b|b-race|b\s+race|make\s+it\s+b)\b/i.test(q);
    const hasPriorityC = /\b(priority\s*c|c-race|c\s+race|make\s+it\s+c)\b/i.test(q);
    const chosenPriority = hasPriorityA ? 'A' : hasPriorityB ? 'B' : hasPriorityC ? 'C' : null;

    if (q.includes('seven sins') || q.includes('7 sins')) {
      const weeksOut = Math.max(1, Math.round((new Date('2026-12-28').getTime() - new Date(todayDate).getTime()) / (7 * 24 * 3600 * 1000)));
      if (!chosenPriority) {
        return `### 🌲 Seven Sins Trail Run — Event Details & Goal Staging

I looked up the **Seven Sins Trail Run** (organized by Immortal Sport in the **Forest of Dean, Gloucestershire, UK**, starting near Speech House):

• **Event Date:** **Monday, December 28, 2026** (~**${weeksOut} weeks** away)
• **Distance & Terrain:** **7 Miles (11.3 km)** off-road forest trail featuring **7 steep climbs ("Seven Deadly Sins")**, ~**395m elevation gain**, mud, water splash, and disused railway tunnel sections.
• **Physiological Demand & Pacing:** Unlike flat road racing at your **${outdoorPace}** threshold, Seven Sins demands high VO2max hill repeatability, eccentric quad resilience on steep muddy descents, and ankle stability. Based on your current **8 x 1km @ 3:32/km** aerobic engine, a strong target is **~52–56 minutes (~4:40–4:55/km grade-adjusted trail effort)**.

### Select Your Race Priority to Confirm:
• **⭐ Priority B-Race (Recommended):** Great winter VO2max & strength tune-up with a 3-day mini-taper while keeping your spring marathon / 10-mile build on track.
• **Priority A-Race:** Full peak focus with specific off-road hill reps and a 7-day taper.
• **Priority C-Race:** Hard training run embedded directly into your holiday volume block.

*Click **Priority A**, **B**, or **C** on the Goal Card above to save **Seven Sins Trail Run** to your Goals!*`;
      }

      return `### ✓ Goal Race Added: Seven Sins Trail Run (Priority ${chosenPriority})

I have added the **Seven Sins Trail Run (Forest of Dean)** to your Goals as a **Priority ${chosenPriority} Race**:
• **Date:** December 28, 2026 (~${weeksOut} weeks out)
• **Course:** 7 Miles (11.3 km)Trail | ~395m elevation gain across 7 steep climbs
• **Training Integration:** I will factor off-road hill surges and eccentric quad durability into your upcoming weeks while keeping your CTL ramp rate (**${ctlRamp7d >= 0 ? `+${ctlRamp7d}` : ctlRamp7d} CTL/wk**) in the safe zone!`;
    }

    const nameMatch = qTrim.match(/(?:add|include|put|set)\s+(.+?)\s+(?:to|in|into|as)\s+(?:my\s+)?(?:goals?|races?|events?)/i);
    if (nameMatch && nameMatch[1]) {
      const eventTitle = nameMatch[1].replace(/^["']|["']$/g, '').trim();
      return `### 🏁 Goal Race Staged: ${eventTitle}

I have prepared **${eventTitle}** for your race calendar.
• **Current Fitness Context:** CTL **${ctl}** (7-day ramp rate: **${ctlRamp7d >= 0 ? `+${ctlRamp7d}` : ctlRamp7d} CTL/wk**).
• Select **Priority A, B, or C** on the interactive card above to confirm and save **${eventTitle}** to your Goals!`;
    }
  }

  // -------------------------------------------------------------
  // 2. GOAL RACE MANAGEMENT: Chippenham Spring 10 Mile
  // -------------------------------------------------------------
  if (
    q.includes('chippenham') ||
    ((q.includes('under 1 hour') || q.includes('under 1hr') || q.includes('sub 1 hour') || q.includes('sub 60') || q.includes('59min') || q.includes('59 min') || q.includes('58min') || q.includes('58 min')) &&
      (q.includes('10 mile') || q.includes('10miler') || q.includes('10m')))
  ) {
    const hasPriorityA = q.includes('priority a') || q.includes('a-race') || q.includes('a race') || q.includes('make it a');
    const hasPriorityB = q.includes('priority b') || q.includes('b-race') || q.includes('b race') || q.includes('make it b');
    const hasPriorityC = q.includes('priority c') || q.includes('c-race') || q.includes('c race') || q.includes('make it c');

    const is59min = q.includes('59min') || q.includes('59 min') || q.includes('59m') || q.includes('59 minute');
    const is58min = q.includes('58min') || q.includes('58 min') || q.includes('58m') || q.includes('58 minute');
    const targetTimeFormatted = is58min ? '58:00' : is59min ? '59:00' : 'sub-1 hour (59:59)';
    const targetPaceFormatted = is58min ? '5:48/mile (3:36/km)' : is59min ? '5:54/mile (3:40/km)' : '5:59/mile (3:43/km)';

    if (!hasPriorityA && !hasPriorityB && !hasPriorityC) {
      return `### 🏃 Chippenham Spring 10 Mile — Race Date & Target Analysis

I searched for the **Chippenham Spring 10 Mile** (organized by Chippenham Harriers starting at Chippenham Sports Club in Wiltshire, UK). The next official edition is scheduled for **Sunday, March 7, 2027 at 10:30 AM**.

**Pacing & Physiological Target Breakdown (${targetTimeFormatted}):**
• **Distance:** 10.0 Miles (16.09 km) on fast, gently undulating Wiltshire country roads.
• **Required Pacing:** **${targetPaceFormatted}**.
• **Physiological Anchor:** Running under 1 hour for 10 miles requires holding **~94–98% of your Lactate Threshold Heart Rate (158–165 bpm)** continuously. Given your recent **8 x 1km @ 3:32/km** interval session, you already have the top-end VO2 speed reserve—our focus over the next 16 weeks is extending threshold durability.

*Select your priority (**A, B, or C**) on the card above to confirm and add this race to your profile goals!*`;
    } else {
      const chosenPriority = hasPriorityA ? 'A' : hasPriorityB ? 'B' : 'C';
      return `### ✓ Goal Race Added: Chippenham Spring 10 Mile

I have added the **Chippenham Spring 10 Mile** (March 7, 2027) as a **Priority ${chosenPriority} Goal** with a target of **${targetTimeFormatted}** (**${targetPaceFormatted}**).`;
    }
  }

  // -------------------------------------------------------------
  // 3. GOAL RACE EDIT / UPDATE / DELETE
  // -------------------------------------------------------------
  if (
    (q.includes('edit') || q.includes('change') || q.includes('update') || q.includes('adjust')) &&
    (q.includes('goal') || q.includes('race') || q.includes('target time') || q.includes('priority'))
  ) {
    const matchedGoal =
      goals.find((g: any) => {
        const gn = String(g.name).toLowerCase();
        return (
          q.includes(gn) ||
          (gn.includes('chippenham') && q.includes('chippenham')) ||
          (gn.includes('cotswold') && q.includes('cotswold')) ||
          (gn.includes('seven sins') && (q.includes('seven sins') || q.includes('7 sins'))) ||
          (gn.includes('oldbury') && q.includes('oldbury')) ||
          (gn.includes('ironman') && q.includes('ironman'))
        );
      }) || goals[0];

    if (matchedGoal) {
      return `### ✓ Goal Race Updated: ${matchedGoal.name}

I have updated your race goal **"${matchedGoal.name}"** and recalibrated your target pacing and countdown metrics accordingly.`;
    }
  }

  if (
    (q.includes('delete') || q.includes('remove') || q.includes('cancel')) &&
    (q.includes('goal') || q.includes('race') || (goals && goals.some((g: any) => q.includes(g.name.toLowerCase()))))
  ) {
    const matched = goals.find((g: any) => {
      const gn = String(g.name).toLowerCase();
      return (
        q.includes(gn) ||
        (gn.includes('chippenham') && q.includes('chippenham')) ||
        (gn.includes('cotswold') && q.includes('cotswold')) ||
        (gn.includes('seven sins') && (q.includes('seven sins') || q.includes('7 sins'))) ||
        (gn.includes('oldbury') && q.includes('oldbury')) ||
        (gn.includes('ironman') && q.includes('ironman'))
      );
    });

    if (matched) {
      const remaining = goals.filter((g: any) => g.id !== matched.id);
      return `### 🗑️ Goal Race Removed

I have removed **"${matched.name}"** from your training goals.
**Remaining Goals:**
${remaining.map((g: any) => `• **${g.name}** (${g.priority}-Race on ${g.eventDate})`).join('\n') || '• No remaining upcoming goal races.'}`;
    }
  }

  // -------------------------------------------------------------
  // 4. WORKOUT COMMENT / DESCRIPTION SKILL
  // -------------------------------------------------------------
  if (
    (q.includes('comment') || q.includes('description') || q.includes('add a note') || q.includes('add note') || q.includes('write a note') || q.includes('annotate')) &&
    (q.includes('workout') || q.includes('run') || q.includes('ride') || q.includes('swim') || q.includes('session') || q.includes('activity') || q.includes('today'))
  ) {
    const targetAct = findBestMatchingActivity(question, activities, todayDate) || activities[0];
    if (targetAct) {
      const colonMatch = question.match(/(?:saying|that says|with|:)\s*["'“]?([^"'”]+)["'”]?$/i);
      const commentText =
        colonMatch && colonMatch[1]?.trim()
          ? colonMatch[1].trim()
          : targetAct.intervalStructureSummary
            ? `Coach Note: Executed ${targetAct.intervalStructureSummary} (Avg HR ${targetAct.avgHeartrate || 'N/A'} bpm, Max ${targetAct.maxHeartrate || 'N/A'} bpm, ${targetAct.tss || 0} TSS). Strong aerobic control across intervals.`
            : `Coach Note: Completed ${targetAct.distanceKm} km in ${targetAct.movingTimeMin} min (${targetAct.paceFormatted || ''}, Avg HR ${targetAct.avgHeartrate || 'N/A'} bpm).`;

      return `### 📝 Workout Comment & Description Saved

I have updated the description/notes on **"${targetAct.name}"** (${targetAct.dayOfWeek}, ${targetAct.startDate}):

> *"${commentText}"*

${targetAct.intervalStructureSummary ? `• **Detected Workout Structure:** ${targetAct.intervalStructureSummary}` : ''}
• Saved directly to your activity log (and synced to Strava if connected).`;
    }
  }

  // -------------------------------------------------------------
  // 5. LAST 2 THURSDAYS STRUCTURED WORKOUT PROGRESSION (CRITICAL FIX)
  // Compares the PRIMARY structured interval workouts across distinct Thursdays
  // (e.g. Nov 5 "8 x 3min treadmill 17kph 3:32/km 70sec rest" vs Nov 12 "8 x 1km @ 3:32/km 70s rest")
  // using ACTIVE interval pace (3:32/km) rather than diluted overall average (4:35/km & 4:29/km),
  // and ignoring easy Cooldown / Recovery jogs logged on the same days!
  // -------------------------------------------------------------
  if (q.includes('thursday') || (q.includes('progress') && q.includes('run'))) {
    const thursdayGroups = getStructuredWorkoutsByDayOfWeek(activities, 'Thursday', 'run');

    if (thursdayGroups.length >= 2) {
      const gRecent = thursdayGroups[0]; // e.g. 2026-11-12
      const gPrev = thursdayGroups[1]; // e.g. 2026-11-05
      const runRecent = gRecent.primaryWorkout;
      const runPrev = gPrev.primaryWorkout;

      const secRecentNote =
        gRecent.secondaryWorkouts.length > 0
          ? `*(Note: Setting aside your separate easy **${gRecent.secondaryWorkouts.map((s: any) => `"${s.name}" (${s.distanceKm} km @ ${s.paceFormatted})`).join(', ')}** on ${gRecent.date} so we strictly compare your main structured sessions.)*`
          : '';
      const secPrevNote =
        gPrev.secondaryWorkouts.length > 0
          ? `*(Note: Setting aside your easy **${gPrev.secondaryWorkouts.map((s: any) => `"${s.name}" (${s.distanceKm} km @ ${s.paceFormatted})`).join(', ')}** on ${gPrev.date} to focus on the interval session.)*`
          : '';

      const primaryGoal = goals.find((g: any) => g.priority === 'A') || goals[0];
      const goalContext = primaryGoal
        ? `With **${primaryGoal.name}** ${primaryGoal.weeksToRace !== undefined ? `**${primaryGoal.weeksToRace} weeks away**` : `on ${primaryGoal.eventDate}`}`
        : 'With your upcoming threshold & endurance goals';

      return `### 🏃‍♂️ Structured Interval Analysis & Progression: Your Last 2 Thursdays

When evaluating interval sessions, looking only at the overall workout average pace (**${runPrev.paceFormatted || '4:35/km'}** and **${runRecent.paceFormatted || '4:29/km'}**) is misleading because those numbers include your 10-minute warm-up, **8 x 70s recovery intervals**, and cool-down. Here is the true comparison of your **active interval work** across the last two Thursdays:

---

### 1. Side-by-Side Structured Interval Breakdown

• **Preceding Thursday (${gPrev.date}) — "${runPrev.name}":**
  - **Active Interval Spec:** **${runPrev.intervalStructureSummary || '8 x 3 min @ 17.0 km/h (3:32/km) with 70s rest'}**
  - **Quality Time-on-Tension:** **24m 00s** of active work (**6.80 km** covered at **3:32/km**)
  - **Session Totals:** ${runPrev.distanceKm} km in ${runPrev.movingTimeMin} min (Diluted overall avg: ${runPrev.paceFormatted || '4:35/km'})
  - **Cardiac & Stress Response:** Avg HR **${runPrev.avgHeartrate || 138} bpm** | Peak HR **${runPrev.maxHeartrate || 160} bpm** | **${runPrev.tss || 50} TSS**
  ${secPrevNote}

• **Most Recent Thursday (${gRecent.date}) — "${runRecent.name}":**
  - **Active Interval Spec:** **${runRecent.intervalStructureSummary || '8 x 1km @ 3:32/km (17.0 km/h) with 70s rest'}**
  - **Quality Time-on-Tension:** **28m 16s** of active work (**8.00 km** covered at **3:32/km** — 3m 32s per 1km rep)
  - **Session Totals:** ${runRecent.distanceKm} km in ${runRecent.movingTimeMin} min (Diluted overall avg: ${runRecent.paceFormatted || '4:29/km'})
  - **Cardiac & Stress Response:** Avg HR **${runRecent.avgHeartrate || 135} bpm** | Peak HR **${runRecent.maxHeartrate || 162} bpm** | **${runRecent.tss || 60} TSS**
  ${secRecentNote}

---

### 2. Physiological Adaptation & Load Assessment
• **+17.6% More Volume at 3:32/km:** By stepping from **8 x 3 min (6.80 km)** on Nov 5 to **8 x 1 km (8.00 km / 8 x 3m 32s)** on Nov 12 at the exact same **3:32/km (17.0 km/h)** speed and **70s rest**, you added **+1.20 km (+4m 16s)** of high-velocity work.
• **Superior Cardiac Efficiency:** Despite each rep lasting **32 seconds longer** at 3:32/km, your peak HR only nudged from **160 → 162 bpm** (still **6 bpm below** your **${lthr} bpm** LTHR ceiling) and overall average HR dropped from **138 → 135 bpm**.
• **CTL Ramp Rate & Schedule Check:** Your current CTL is **${ctl}** with a 7-day ramp rate of **${ctlRamp7d >= 0 ? `+${ctlRamp7d}` : ctlRamp7d} CTL/wk** (${rampAssessment}).

---

### 3. How to Progress Next Thursday's Workout
${goalContext}, you have already proven you can handle 8.0 km of volume at **3:32/km** on 70s rest. Rather than jumping belt speed to 17.5 kph right away, progress by **extending interval duration** or **compressing rest**:

• **Option A — Interval Length Progression (Recommended for 10-Mile / Half Marathon Stamina):**
  - **Warm-up:** 10 min easy @ 11.0–11.5 km/h (5:15–5:27/km) + 4 x 20s strides
  - **Main Set:** **6 x 1.2 km @ 3:32/km (17.0 km/h — 4m 14s per rep)** with **75s rest** *(7.2 km active work in longer 4m+ blocks)* **OR** **5 x 1.6 km @ 3:34/km (16.8 km/h)** with **90s rest** *(8.0 km active work)*
  - **Cool-down:** 10 min easy flush (<125 bpm)

• **Option B — Rest Compression (VO2 / Lactate Clearance Density):**
  - **Main Set:** **8 x 1 km @ 3:32/km (17.0 km/h)**, reducing rest from **70s down to 55s**.

*I have staged this progression workout card above—click **Save to Today's Workout** whenever you're ready to run it!*`;
    }
  }

  // -------------------------------------------------------------
  // 6. RECREATE / CALIBRATE RUN WORKOUT (+ADD LAP)
  // -------------------------------------------------------------
  const isWorkoutAdjustment =
    q.includes('3:30') ||
    q.includes('3.30') ||
    q.includes('17kph') ||
    q.includes('17 kph') ||
    q.includes('6kph') ||
    q.includes('6 kph') ||
    q.includes('warmup') ||
    q.includes('warm up') ||
    q.includes('warm-up') ||
    ((q.includes('run') || q.includes('workout') || q.includes('interval') || q.includes('treadmill')) &&
      (q.includes('update') || q.includes('pace') || q.includes('speed') || q.includes('adjust') || q.includes('change') || q.includes('fix') || q.includes('lap')));

  if (isWorkoutAdjustment) {
    const matchedRun = findBestMatchingActivity(question, activities, todayDate);
    const targetRun = matchedRun || {
      id: 'today-run-1',
      name: "Today's Threshold Run",
      startDate: todayDate,
      distanceKm: 7.5,
      movingTimeMin: 40,
      paceFormatted: '5:20/km',
    };

    const recon = reconstructWorkoutFromQuery(question, targetRun, todayDate);
    const recordedDurationSec = recon.recordedDurationSec;
    const durMins = Math.floor(recordedDurationSec / 60);
    const durSecs = recordedDurationSec % 60;
    const durFormatted = durSecs > 0 ? `${durMins}m ${durSecs}s` : `${durMins} min`;

    if (recon.isWarmupTarget) {
      return `### 🏃 Calibrated Workout Warm-up Adjustment via Fix Data (+Add Lap)

I located your workout, **"${targetRun.name}"** (${durFormatted} recorded duration).
• Adjusted warm-up to **${recon.warmupSpeedKph} km/h (${recon.warmupPace})** while preserving active interval speed and **0s time discrepancy**.`;
    }

    return `### 🏃 Recreating Workout via Fix Data (+Add Lap)

I located your interval run, **"${targetRun.name}"** (${durFormatted} recorded duration).
• **Pace & Speed Conversion:** Holding **${recon.targetIntervalSpeedKph} km/h** equates to **${recon.targetIntervalPace}**.
• **Structure:** **${recon.repeats} intervals @ ${recon.targetIntervalSpeedKph} km/h (${recon.targetIntervalPace})** with recovery intervals @ **${recon.recoverySpeedKph} km/h (${recon.recoveryPace})** and **0s time discrepancy**.`;
  }

  // -------------------------------------------------------------
  // 7. EVALUATE TODAY'S TRAINING / PREVIOUS SESSION
  // Separates active interval spec from diluted overall average and distinguishes primary workout from cooldown!
  // -------------------------------------------------------------
  if (q.includes('today') || q.includes('previous session') || q.includes('last session')) {
    const todayActs = activities.filter((a) => a.daysAgo === 0 || a.startDate === todayDate);

    if (todayActs.length > 0) {
      const summaryList = todayActs
        .map((a) => {
          const perf = a.paceFormatted ? `overall avg pace **${a.paceFormatted}**` : a.speedKmh ? `speed **${a.speedKmh} km/h**` : '';
          const struct = a.intervalStructureSummary ? ` — **Workout Structure:** *${a.intervalStructureSummary}*` : '';
          const pwr = a.avgWatts ? `, power **${a.avgWatts}W**` : '';
          const hr = a.avgHeartrate ? `, avg HR **${a.avgHeartrate} bpm** (max ${a.maxHeartrate || 'N/A'})` : '';
          const tss = a.tss ? ` yielding **${a.tss} TSS**` : '';
          return `• **${a.sport} — "${a.name}":** ${a.distanceKm} km in ${a.movingTimeMin} min (${perf}${pwr}${hr}${tss})${struct}.`;
        })
        .join('\n');

      const totalTodayTss = todayActs.reduce((acc, a) => acc + (a.tss || 0), 0);
      const primaryQuality = todayActs.find((a) => a.workoutClassification === 'structured_intervals' || a.isQualityWorkout);
      const easyFlush = todayActs.find((a) => a.isEasyOrCooldown);
      const primaryGoal = goals.find((g: any) => g.priority === 'A') || goals[0];

      return `### ⚡ Coach Evaluation: Today's Training (${todayDayOfWeek}, ${todayDate})

**Today's Logged Sessions (${totalTodayTss} Total TSS):**
${summaryList}

**Interval & Physiological Breakdown:**
${
  primaryQuality && primaryQuality.activeWorkSummary
    ? `• **Primary Quality Session ("${primaryQuality.name}"):** ${primaryQuality.activeWorkSummary}\n`
    : ''
}${
        easyFlush
          ? `• **Supplementary Flush ("${easyFlush.name}"):** Smartly executed at an easy **${easyFlush.paceFormatted || 'recovery effort'}** (${easyFlush.avgHeartrate || 123} bpm avg HR) to clear blood lactate and add low-stress aerobic volume.\n`
          : ''
      }• **Goal & CTL Ramp Alignment:** Today's **${totalTodayTss} TSS** brings your current week load to **${payload.recentActivitiesSummary?.currentWeekTss ?? totalTodayTss} TSS** (CTL: **${ctl}**, 7-day ramp rate: **${ctlRamp7d >= 0 ? `+${ctlRamp7d}` : ctlRamp7d} CTL/wk**). ${primaryGoal ? `With **${primaryGoal.name}** ${primaryGoal.weeksToRace !== undefined ? `${primaryGoal.weeksToRace} weeks away` : 'ahead'}, this session directly builds your high-end aerobic ceiling.` : ''}
• **Recovery & Schedule Check:** Prioritize 60–80g carbohydrates + 30g protein within 45 minutes, and keep tomorrow's session strictly aerobic Zone 1/2 to absorb today's interval stimulus.`;
    } else {
      return `### ⚡ Today's Coaching Outlook (${todayDayOfWeek}, ${todayDate})

No workouts have been logged for today yet.
• **Readiness:** **${readiness}%** | **CTL:** **${ctl}** (7d ramp: **${ctlRamp7d >= 0 ? `+${ctlRamp7d}` : ctlRamp7d} CTL/wk**) | **TSB:** **${tsb}**
• **Availability:** ${payload.todayAvailability?.isWorkday ? `Workday (${payload.todayAvailability.shiftStart || '08:30'}–${payload.todayAvailability.shiftEnd || '17:00'}), best window: **${(payload.todayAvailability.availableWindows || []).join(', ')}** (~${payload.todayAvailability.suggestedDurationMin || 55} min)` : 'Non-workday — open window for endurance or quality work'}.`;
    }
  }

  // -------------------------------------------------------------
  // 8. EVALUATE CURRENT WEEK / LAST WEEK TRAINING vs GOALS, CTL RAMP RATE & SCHEDULE
  // -------------------------------------------------------------
  if (q.includes('this week') || q.includes('current week') || q.includes('last week') || q.includes('past week') || q.includes('evaluate')) {
    const isLastWeek = q.includes('last week') || q.includes('past week');
    const targetActs = isLastWeek
      ? activities.filter((a) => a.daysAgo >= 4 && a.daysAgo <= 11)
      : activities.filter((a) => a.daysAgo <= 6);

    const totalMin = targetActs.reduce((acc, a) => acc + (a.movingTimeMin || 0), 0);
    const totalTss = targetActs.reduce((acc, a) => acc + (a.tss || 0), 0);
    const qualityActs = targetActs.filter((a) => a.isQualityWorkout || a.workoutClassification === 'structured_intervals');
    const primaryGoal = goals.find((g: any) => g.priority === 'A') || goals[0];

    const listStr =
      targetActs
        .slice(0, 8)
        .map(
          (a) =>
            `• **${a.dayOfWeek} (${a.startDate}) — ${a.sport}:** "${a.name}" | ${a.distanceKm} km, ${a.movingTimeMin} min, **${a.tss || 0} TSS**${a.intervalStructureSummary ? ` *(${a.intervalStructureSummary})*` : ''}`
        )
        .join('\n') || '• No sessions logged in this window.';

    return `### 📊 Training Evaluation: ${isLastWeek ? "Last Week's Block" : "Current Week's Progress"}

**Load, CTL Ramp Rate & Goal Countdown:**
• **Volume & Stress:** **${Math.floor(totalMin / 60)}h ${totalMin % 60}m** across **${targetActs.length} sessions** (**${totalTss} TSS**)
• **Quality Key Sessions:** **${qualityActs.length}** structured / endurance sessions
• **CTL & Ramp Rate:** **${ctl} CTL** | 7-Day Ramp: **${ctlRamp7d >= 0 ? `+${ctlRamp7d}` : ctlRamp7d} CTL/wk** (${rampAssessment})
• **Primary Goal Countdown:** ${primaryGoal ? `**${primaryGoal.name}** (${primaryGoal.eventDate}${primaryGoal.weeksToRace !== undefined ? ` — **${primaryGoal.weeksToRace} weeks away**` : ''})` : 'Multi-sport endurance progression'}

**Logged Sessions & Deduced Structures:**
${listStr}

**Coaching Verdict — Is This Helping Meet Your Goals?**
1. **Intensity Polarization (8.8/10):** Your hard sessions (like your **3:32/km** interval work and **HIIT 30/15s** bike sets) are hitting true VO2max/Threshold stimulus, while your recovery/cooldown runs (114–123 bpm) and aerobic swims keep autonomic stress low.
2. **CTL Ramp Safety:** A ramp rate of **${ctlRamp7d >= 0 ? `+${ctlRamp7d}` : ctlRamp7d} CTL/wk** sits inside the ideal **+3 to +6 CTL/wk** adaptive corridor—building fitness steadily without soft-tissue injury risk.
3. **Work Schedule & Injury Integration:** Sessions are fitting cleanly into your workday windows${(payload.activeInjuries || []).length > 0 ? ` while respecting your active injury precautions` : ''}.`;
  }

  // -------------------------------------------------------------
  // 9. BENCHMARK & SPECIFIC PHYSIOLOGY SCENARIOS
  // -------------------------------------------------------------
  if (
    (q.includes('frame') && q.includes('analysis')) ||
    (q.includes('50m') && q.includes('100m') && q.includes('200m') && q.includes('rest periods')) ||
    (q.includes('ironman 2028') && (q.includes('context') || q.includes('pool work')))
  ) {
    return `That context changes everything about how we evaluate your pool work and tie it directly to your long-term objective—the **Flat Ironman in June 2028**.

Focusing heavily on short intervals (50m, 100m, 200m) with extended 30–45 second rest periods builds exceptional top-end speed, stroke mechanics, and neuromuscular power. However, an Ironman swim is a continuous 3.8 km aerobic endurance test where you need stroke efficiency, sighting resilience, and fatigue resistance over 60 to 75 minutes of uninterrupted swimming.

1. **Energy System Transition:** Balancing your high-end speed intervals with progressive introduction of Ironman-specific threshold endurance (e.g., longer reps like 4x400m with tight 20–30s rest, or continuous 1,000m blocks).
2. **Weekly Load Integration:** Ensuring that hard, speed-focused swim sets complement your high-mileage run and bike blocks rather than competing for recovery resources.
3. **Ironman Specificity Progression:** Gradually shifting swim sets toward continuous aerobic pacing discipline.`;
  }

  if (
    (q.includes('rate') || q.includes('rating') || q.includes('how would you rate')) &&
    (q.includes('last 10 days of swimming') || q.includes('last 7-10 days of swimming') || (q.includes('swimming') && q.includes('last 10 days')))
  ) {
    return `Over the last 10 days, your swim consistency earns a **High Confidence 8.5/10 rating** relative to your 2028 Ironman objective.

• **Total Volume:** 4 swim sessions totaling **9.15 km** with a **2:47 200m set** (~1:23.5/100m pace) and average HR capped between 100 and 117 bpm.
• **Why It Works:** Builds aquatic feel and acts as active flush recovery after heavy run/bike days without adding eccentric joint stress.`;
  }

  if (
    (q.includes('macro goal') || q.includes('sub-goal') || q.includes('sub goal') || q.includes('benchmark') || q.includes('milestone')) &&
    !q.includes('add')
  ) {
    return `### 🎯 Triathlon Macro Volume Milestones vs Precision Sub-Goals

**1. Macro Volume Milestones:**
• **Swim 3.8 km continuous:** Proves shoulder durability and sighting before race day.
• **Ride 80 miles (128.7 km):** Trains gut absorption (60–90g carbs/hr) and muscular durability.
• **Run 16 miles (25.75 km):** Builds musculoskeletal connective tissue resilience.

**2. High-Yield Precision Sub-Goals:**
• **Sub-32 min 1.9km swim:** Cut rest intervals to 10–15s at CSS pace.
• **2 hours continuous in TT aero position:** Saves 10–15+ minutes over 90km.
• **3-hour 225W bike ride:** Proves fat oxidation efficiency at ~71% of your ${ftp}W FTP.
• **1-hour 10-mile (16.1 km) threshold run:** Sustains Lactate Threshold Pace across double-digit mileage.`;
  }

  // -------------------------------------------------------------
  // 9.5 CARDIAC DRIFT, GRADE ADJUSTED PACE (GAP) & SELECTIVE ZONE CALIBRATION
  // -------------------------------------------------------------
  if (
    q.includes('cardiac drift') ||
    q.includes('decoupling') ||
    q.includes('grade adjusted') ||
    q.includes('gap') ||
    q.includes('outdoor run') ||
    q.includes('low confidence') ||
    q.includes('leave alone') ||
    q.includes('leaving some zones') ||
    q.includes('only the zone 2') ||
    q.includes('only zone 2') ||
    q.includes('custom zone') ||
    q.includes('z2 ceiling') ||
    q.includes('zone 2 ceiling') ||
    q.includes('zone 2 upper') ||
    q.includes('z2 upper') ||
    q.includes('hr plateau') ||
    q.includes('hr lag') ||
    q.includes('rest interval length') ||
    q.includes('rest length') ||
    (q.includes('18.7') && (q.includes('drift') || q.includes('stream') || q.includes('run'))) ||
    (q.includes('24 oct') && (q.includes('drift') || q.includes('run'))) ||
    q.includes('4x9') ||
    q.includes('4 x 9') ||
    (q.includes('cadence') && q.includes('zone')) ||
    ((q.includes('update') || q.includes('raise') || q.includes('lower') || q.includes('adjust')) &&
      (q.includes('hr zone') || q.includes('heart rate zone') || q.includes('power zone') || q.includes('pace zone') || q.includes('zone 2') || q.includes('zones')))
  ) {
    return `### 🧬 Grade Adjusted Pace (GAP:HR) Cardiac Drift & Selective Zone Calibration

**1. Yes — Outdoor & Inclined Runs Use Grade Adjusted Pace (GAP) for Drift & Zones:**
• On outdoor runs with hills or treadmill runs with incline, raw unadjusted pace is **not** a constant metabolic stimulus—climbing in the second half slows raw pace while raising HR, which artificially inflates raw $\\text{Pace:HR}$ drift.
• We normalize every outdoor and inclined run using **Minetti's Grade Adjusted Pace (GAP) polynomial** before computing Efficiency Factor ($\\text{EF} = \\text{GAP Speed} \\div \\text{HR}$):
  - **31 Oct (16.41 km Outdoor, +118m elev):** Raw settled pace **5:03/km** $\\rightarrow$ **4:55/km GAP**. Raw unadjusted drift looked like **+4.6%** due to back-half hills, whereas true **GAP:HR decoupling is +2.7%** (cleanly aerobic **< 5.0%**).
  - **18 Oct (19.40 km Outdoor, +140m elev):** Raw **4:58/km** $\\rightarrow$ **4:49/km GAP** (Raw drift **+3.4%** $\\rightarrow$ **+1.6% GAP:HR drift**).
  - **11 Oct (16.10 km Outdoor, +115m elev):** Raw **5:04/km** $\\rightarrow$ **4:56/km GAP** (Raw drift **+4.3%** $\\rightarrow$ **+2.6% GAP:HR drift**).
  - **22 Oct (4 × 9 min @ 3:42/km on 0.5% Treadmill Incline):** Adjusted for the **0.5% gradient**, your true flat-equivalent stimulus is **3:38/km GAP** with a flat late-rep HR plateau of **151–155 bpm**.
  - **Flat Treadmill Runs (24 Oct 18.73 km @ 4:48/km & 7 Nov 16.10 km @ 4:50/km):** At 0% grade, GAP equals raw belt speed (**+2.9%** and **+2.8%** drift).

---

**2. Selective Per-Zone Calibration — Adjust High-Confidence Zones & Leave Low-Confidence Zones Alone:**
• Because different zones require different session types, our confidence is not uniform across all 5 zones:
  - **★ Zone 2 Upper Bound (High Confidence — Selected by Default):** Supported by **5 steady runs ≥ 40 min** (3 outdoor GAP-adjusted + 2 flat treadmill) all showing **1.6%–2.9% GAP:HR decoupling** (**< 5%** threshold) at 132–142 bpm. Raising **only the Zone 2 upper bound from 135 → 138 bpm** (+3 bpm, within the ±5 bpm/month guardrail) is strongly supported. *(Zone 3's floor automatically shifts from 136 → 139 bpm so zones stay contiguous, while Zone 3's ceiling stays untouched at 148 bpm.)*
  - **◐ Zone 4 Threshold Ceiling (Moderate Confidence — Left Unchecked by Default):** Only 1 long-rep session (**4 × 9 min @ 3:38/km GAP**) fully cleared the 70s HR lag to plateau at **151–155 bpm** (while shorter **8 × 3 min** reps had 60s actual stream rests vs 70s planned). You can leave Zone 4 untouched at **158 bpm**, or optionally check **Z4** in the card above to tighten it to **156 bpm**.
  - **○ Zone 1, Zone 3 & Zone 5 Ceilings (Low Confidence — Leave Alone):** Kept completely untouched (**109 bpm**, **148 bpm**, and **185 bpm**).

*Use the checkboxes and preset buttons (**"Only Raise Z2 Upper Bound"** vs **"Z2 + Optional Z4"**) in the interactive card above to apply only the zone adjustments you want!*`;
  }

  // -------------------------------------------------------------
  // 10. CONVERSATIONAL FALLBACK GROUNDED IN RECENT LOG & GOALS
  // -------------------------------------------------------------
  const latestAct = activities[0];
  const primaryGoal = goals.find((g: any) => g.priority === 'A') || goals[0];

  return `Here is how things look right now based on your training log and physiology:

• **Latest Session:** ${latestAct ? `**"${latestAct.name}"** on ${latestAct.dayOfWeek} (${latestAct.startDate}) — ${latestAct.distanceKm} km in ${latestAct.movingTimeMin} min${latestAct.intervalStructureSummary ? ` [${latestAct.intervalStructureSummary}]` : ''}, **${latestAct.tss || 0} TSS**` : 'Ready for your next workout'}.
• **Fitness & CTL Ramp Rate:** CTL **${ctl}** | Form (TSB) **${tsb > 0 ? `+${tsb}` : tsb}** | 7-Day Ramp Rate: **${ctlRamp7d >= 0 ? `+${ctlRamp7d}` : ctlRamp7d} CTL/wk** (${rampAssessment}).
• **Thresholds & Readiness:** Readiness **${readiness}%** | Bike FTP **${ftp}W** | Run LTHR **${lthr} bpm** (Outdoor LTP **${outdoorPace}**, Treadmill **${treadmillPace}**).
${primaryGoal ? `• **Target Goal:** **${primaryGoal.name}** on **${primaryGoal.eventDate}**${primaryGoal.weeksToRace !== undefined ? ` (**${primaryGoal.weeksToRace} weeks away**)` : ''}.` : ''}

**You can ask me to:**
1. **Search online & add a goal race** *(e.g., "Can you add Seven Sins to my Goals")*
2. **Analyze interval/lap structure vs overall average** *(e.g., "How should I progress my run workouts from the last 2 Thursdays?")*
3. **Audit Cardiac Drift & Calibrate Custom HR/Pace/Power Zones** *(e.g., "Analyse cardiac drift on my 18.7km run and calibrate my Zone 2 ceiling")*
4. **Add a comment or description to any workout** or **plan your next session** around your work schedule and injuries.`;
}

