import type { AthleteProfile } from '../types/athlete';
import type { TrainingGoal } from '../types/goals';
import type {
  RecommendedWorkout,
  PeriodizedPlan,
  CoachSport,
  CoachRequestPayload,
  WorkoutIntensityLevel,
} from '../types/coach';

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
export function generateSportsScienceChat(
  question: string,
  payload: CoachRequestPayload,
  _history?: any[]
): string {
  const profile = payload.athleteProfile || ({} as AthleteProfile);
  const ftp = Number(profile.bikeFtp) || 315;
  const lthr = Number(profile.thresholdHeartRateRun) || 168;
  const outdoorPace = formatPaceSec(profile.thresholdPaceRunOutdoorSec || 240);
  const treadmillPace = formatPaceSec(profile.thresholdPaceRunTreadmillSec || 230);
  const readiness = payload.latestReadiness?.score ?? 75;
  const tsb = payload.fitnessStats?.tsb ?? 0;
  const ctl = payload.fitnessStats?.ctl ?? 75;

  const q = String(question).toLowerCase();

  let intro = `Here is your individualized coaching recommendation based on your physiological benchmarks (**${ftp}W FTP**, **${lthr} bpm LTHR**, outdoor pace **${outdoorPace}**, treadmill **${treadmillPace}**), current readiness of **${readiness}%**, and Form (TSB: **${tsb > 0 ? `+${tsb}` : tsb}**):\n\n`;

  if (q.includes('interval') || q.includes('workout') || q.includes('today') || q.includes('hard') || q.includes('sweet spot')) {
    return intro +
      `• **Intensity Prescription:** With your readiness at **${readiness}%** and Form at **${tsb}**, you have sufficient recovery for quality stimulus.\n` +
      `• **Cycling Power Targets:** For Sweet Spot intervals (88-93% FTP), target **${Math.round(ftp * 0.88)}-${Math.round(ftp * 0.93)}W**. For Zone 4 Threshold intervals, hold **${Math.round(ftp * 0.95)}-${Math.round(ftp * 1.02)}W**.\n` +
      `• **Running Heart Rate & Pace:** Keep threshold intervals locked at **${Math.round(lthr * 0.95)}-${Math.round(lthr * 0.99)} bpm** (${formatPaceSec(Math.round((profile.thresholdPaceRunOutdoorSec || 240) * 1.05))}). If doing treadmill intervals, you can aim for **${formatPaceSec(Math.round((profile.thresholdPaceRunTreadmillSec || 230) * 1.04))}** due to zero wind resistance.\n` +
      `• **Intra-Workout Fueling:** Ingest 50-60g carbs per hour during sessions longer than 60 minutes to preserve liver and muscle glycogen.`;
  }

  if (q.includes('race') || q.includes('pacing') || q.includes('70.3') || q.includes('ironman') || q.includes('half')) {
    return intro +
      `• **Bike Pacing Strategy:** For a Middle Distance / 70.3 bike leg, aim for **78-82% of FTP** (**${Math.round(ftp * 0.78)}-${Math.round(ftp * 0.82)}W**, Normalized Power). Going above 85% FTP on climbs creates an exponential lactate debt that will penalize your run split.\n` +
      `• **Run Pacing Strategy:** Start the half marathon at 10-15 seconds slower than your open threshold pace (around **${formatPaceSec(Math.round((profile.thresholdPaceRunOutdoorSec || 240) * 1.12))}**) for the first 5km while your legs adjust from the bike, then settle into steady race pace holding HR below **${Math.round(lthr * 0.88)} bpm**.\n` +
      `• **Hydration & Electrolytes:** Target 600-800ml fluid/hr with 500-700mg sodium depending on ambient temperature.`;
  }

  if (q.includes('fatigue') || q.includes('tired') || q.includes('sore') || q.includes('recover') || q.includes('sleep') || q.includes('hrv')) {
    return intro +
      `• **Fatigue Analysis:** Your Form (TSB) is **${tsb}** and Chronic Training Load (CTL) is **${ctl}**. When readiness dips below 65% or HRV drops significantly below baseline, intense workouts create excessive autonomic strain without yielding fitness gains.\n` +
      `• **Recommended Action:** Swap high-intensity intervals for an active recovery spin (sub-**${Math.round(ftp * 0.55)}W**) or an easy swim. Active blood flow speeds metabolite clearance.\n` +
      `• **Sleep & Nutrition:** Aim for 8+ hours of sleep, add 200-300mg magnesium glycinate before bed, and ensure adequate carbohydrate replenishment (4-6g/kg) to restore glycogen stores.`;
  }

  if (q.includes('treadmill') || q.includes('outdoor') || q.includes('pace') || q.includes('zone')) {
    return intro +
      `• **Pace Zone Calibration:** Your outdoor threshold pace is **${outdoorPace}** and your treadmill threshold pace is **${treadmillPace}**.\n` +
      `• **Why Treadmill Paces Differ:** Treadmills have constant belt speed, spring-assisted deck recoil, and zero wind resistance, but cause higher heat retention due to static air. Set treadmill gradient to **1.0%** to match outdoor aerodynamic resistance.\n` +
      `• **HR Zone Anchoring:** Always use your LTHR (**${lthr} bpm**) as the master governor. If heart rate drifts into Zone 5 (>**${Math.round(lthr * 1.02)} bpm**) during a Zone 3/4 workout, back off the speed 5-10 sec/km.`;
  }

  // General coaching advice
  return intro +
    `• **Consistency Over Heroics:** Aerobic adaptations come from the cumulative stimulus of consistent weekly microcycles rather than single exhausting workouts.\n` +
    `• **Keep Hard Days Hard, Easy Days Easy:** On recovery and Zone 2 days, strictly honor your wattage (<**${Math.round(ftp * 0.72)}W**) and heart rate limits (<**${Math.round(lthr * 0.82)} bpm**). This ensures full neuromuscular freshness for your key interval days.\n` +
    `• **Upcoming Milestone:** Keep your eyes locked on your upcoming target event and trust the periodized progression!`;
}
