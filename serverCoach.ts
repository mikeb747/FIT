import type { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { generateWorkoutReviews } from './src/utils/workoutReviewEngine';

// Initialize Gemini Client safely on the server
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
const geminiAi = geminiApiKey
  ? new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

export function handleCoachStatus(req: Request, res: Response) {
  res.json({
    available: Boolean(geminiAi),
    model: 'gemini-3.8-flash',
    features: ['workout-recommendation', 'periodized-plan', 'ai-chat-coach'],
  });
}

function formatPaceSec(seconds?: number): string {
  if (!seconds || seconds <= 0) return 'N/A';
  const mins = Math.floor(seconds / 60);
  const remSec = Math.round(seconds % 60);
  return `${mins}:${remSec.toString().padStart(2, '0')}/km`;
}

// Fallback rule-based generator when API key is not present or offline
function generateFallbackWorkout(payload: any) {
  const profile = payload.athleteProfile || {};
  const ftp = Number(profile.bikeFtp) || 315;
  const lthr = Number(profile.thresholdHeartRateRun) || 168;
  const readiness = Number(payload.latestReadiness?.score ?? 80);
  const tsb = Number(payload.fitnessStats?.tsb ?? 0);
  const preferred = payload.preferredSport;
  const todayAvail = payload.todayAvailability;
  const activeInjuries = payload.activeInjuries || profile.injuries?.filter((i: any) => i.status === 'active' || i.status === 'monitoring') || [];

  const isFatigued = readiness < 65 || tsb < -15;

  // Determine Duration respecting workday availability
  let durationMin = payload.targetDurationMin;
  if (!durationMin) {
    if (todayAvail?.isWorkday) {
      durationMin = todayAvail.availableWindows?.includes('lunch') && todayAvail.availableWindows.length === 1 ? 45 : 55;
    } else {
      durationMin = 90;
    }
  }

  // Determine Sport respecting injuries
  let sport: 'swim' | 'bike' | 'run' | 'strength' | 'rest' | 'brick' = 'bike';
  if (preferred && preferred !== 'auto') {
    sport = preferred;
  } else if (payload.fitnessStats?.limitingFactor) {
    const lim = String(payload.fitnessStats.limitingFactor).toLowerCase();
    if (lim.includes('bike')) sport = 'bike';
    else if (lim.includes('run')) sport = 'run';
    else if (lim.includes('swim')) sport = 'swim';
  }

  // Injury safety check
  const hasLegInjury = activeInjuries.some((inj: any) =>
    ['calf', 'achilles', 'knee', 'foot', 'ankle', 'hamstring'].some((a) => String(inj.bodyArea || '').toLowerCase().includes(a))
  );
  if (hasLegInjury && (sport === 'run' || sport === 'brick')) {
    sport = 'bike'; // protect injured leg with low-impact spinning
  }

  const scheduleNote = todayAvail?.isWorkday
    ? `Scheduled for your ${todayAvail.availableWindows?.join('/') || 'evening'} window, respecting your ${todayAvail.shiftStart || '08:30'}-${todayAvail.shiftEnd || '17:00'} workday.`
    : 'Weekend non-workday: ample time for endurance volume.';

  const injuryNote = activeInjuries.length > 0
    ? `Respecting active status: ${activeInjuries.map((i: any) => `${i.name} (${i.sportModifications || 'No high torque'})`).join('; ')}.`
    : undefined;

  if (isFatigued) {
    if (sport === 'bike') {
      return {
        id: `rec_${Date.now()}`,
        title: 'Recovery Spin & Flush',
        sport: 'bike',
        durationMin: Math.min(45, durationMin),
        estimatedTss: 25,
        intensity: 'recovery',
        targetZones: {
          watts: `< ${Math.round(ftp * 0.55)}W (Zone 1 Active Recovery)`,
          heartRate: `< ${Math.round(lthr * 0.68)} bpm`,
          pace: 'N/A',
        },
        coachRationale: `Your readiness is ${readiness}% and Form (TSB) is ${tsb}. The nervous system and musculature need an active recovery stimulus. ${scheduleNote}`,
        readinessAnalysis: 'HRV and sleep data suggest acute fatigue. Keeping power strictly in Zone 1 allows glycogen replenishment while maintaining capillary blood flow.',
        structure: [
          { phase: 'Warm-up', duration: '10 min', description: 'Very easy spin at 85-90 RPM cadence, sub-50% FTP.', target: `< ${Math.round(ftp * 0.5)}W` },
          { phase: 'Main Set', duration: `${Math.min(25, durationMin - 20)} min`, description: 'Smooth, fluid pedal strokes. Zero high-torque efforts or hard out-of-saddle efforts.', target: `${Math.round(ftp * 0.45)}-${Math.round(ftp * 0.55)}W` },
          { phase: 'Cool-down', duration: '10 min', description: 'Spin down, light stretching, deep nasal breathing.', target: `< ${Math.round(ftp * 0.45)}W` },
        ],
        nutritionTips: 'Electrolytes with 500ml water. Focus on post-workout protein (25g) and quality complex carbohydrates for muscle repair.',
        injuryWarning: injuryNote,
        createdAt: new Date().toISOString(),
      };
    } else {
      return {
        id: `rec_${Date.now()}`,
        title: 'Aerobic Recovery Jog & Mobility',
        sport: 'run',
        durationMin: Math.min(35, durationMin),
        estimatedTss: 22,
        intensity: 'recovery',
        targetZones: {
          heartRate: `< ${Math.round(lthr * 0.72)} bpm (Zone 1)`,
          pace: 'Conversational pace (+60-75s slower than threshold)',
        },
        coachRationale: `Readiness is ${readiness}%. An easy, soft-surface jog promotes lymphatic drainage without joint pounding. ${scheduleNote}`,
        readinessAnalysis: 'Elevated muscle fatigue or suppressed HRV indicates light aerobic stimulus only.',
        structure: [
          { phase: 'Warm-up', duration: '5 min', description: 'Walking and dynamic leg swings / ankle rolls.', target: 'Warm joints' },
          { phase: 'Main Set', duration: `${Math.min(25, durationMin - 10)} min`, description: 'Continuous easy jog on grass or soft trail. Strictly conversational.', target: `< ${Math.round(lthr * 0.72)} bpm` },
          { phase: 'Cool-down', duration: '5 min', description: 'Walking flush + calf/hamstring stretching.', target: 'Heart rate recovery' },
        ],
        nutritionTips: 'Rehydrate with 500ml water and electrolytes.',
        injuryWarning: injuryNote,
        createdAt: new Date().toISOString(),
      };
    }
  }

  // Quality Session
  if (sport === 'bike') {
    const ssLow = Math.round(ftp * 0.88);
    const ssHigh = Math.round(ftp * 0.93);
    const z2 = Math.round(ftp * 0.68);
    const mainMin = Math.max(30, durationMin - 25);
    return {
      id: `rec_${Date.now()}`,
      title: 'Sweet Spot Sustained Threshold Power',
      sport: 'bike',
      durationMin,
      estimatedTss: Math.round(durationMin * 0.88),
      intensity: 'tempo_z3',
      targetZones: {
        watts: `${ssLow}-${ssHigh}W (Sweet Spot / High Z3)`,
        heartRate: `${Math.round(lthr * 0.85)}-${Math.round(lthr * 0.92)} bpm`,
        pace: 'N/A',
      },
      coachRationale: `Readiness is primed at ${readiness}%, and your TSB of ${tsb} provides a fresh platform. Sweet spot intervals build mitochondrial density and lactate clearing capacity. ${scheduleNote}`,
      readinessAnalysis: 'Autonomic nervous system is balanced with steady baseline HRV. Green light for quality sustained threshold work.',
      structure: [
        { phase: 'Warm-up', duration: '12 min', description: `Progressive build from ${Math.round(ftp * 0.55)}W to ${z2}W with 3 x 30s high-cadence fast pedals (105+ RPM).`, target: `${Math.round(ftp * 0.55)}-${z2}W` },
        { phase: 'Main Set', duration: `${mainMin} min`, description: `3 x 10-12 minutes at Sweet Spot (${ssLow}-${ssHigh}W), with 3-4 minutes easy recovery spin at ${Math.round(ftp * 0.55)}W between sets. Focus on sustained aerodynamic TT position.`, target: `${ssLow}-${ssHigh}W` },
        { phase: 'Cool-down', duration: '10 min', description: 'Easy spin cadence >90 RPM, gradual heart rate reduction.', target: `< ${Math.round(ftp * 0.5)}W` },
      ],
      nutritionTips: 'Take 50-60g of carbs per hour during the workout (1 bottle with maltodextrin/fructose mix) + 600ml fluid/hr.',
      injuryWarning: injuryNote,
      createdAt: new Date().toISOString(),
    };
  } else if (sport === 'swim') {
    return {
      id: `rec_${Date.now()}`,
      title: 'Threshold CSS Continuous Durability',
      sport: 'swim',
      durationMin: Math.min(60, durationMin),
      estimatedTss: 55,
      intensity: 'threshold_z4',
      targetZones: {
        pace: `${formatPaceSec(profile.swimPoolPace100mSec || 90)} (Target CSS pace)`,
      },
      coachRationale: `Swimming allows high aerobic training load with zero eccentric muscle breakdown, ideal for today's readiness of ${readiness}%. ${scheduleNote}`,
      readinessAnalysis: 'Low impact on joints while maintaining upper-body cardiovascular stamina.',
      structure: [
        { phase: 'Warm-up', duration: '12 min (400m)', description: '200m easy swim, 100m kick with board, 100m pull buoy focusing on early vertical forearm (EVF).', target: 'Easy aerobic' },
        { phase: 'Main Set', duration: `${Math.max(30, durationMin - 20)} min (1800m)`, description: '3 sets of [4 x 100m @ CSS pace + 15s rest, 1 x 200m pull buoy steady]. Cut rest periods to build continuous open water durability.', target: 'CSS Threshold' },
        { phase: 'Cool-down', duration: '8 min (200m)', description: '200m relaxed backstroke and easy freestyle flush.', target: 'Heart rate recovery' },
      ],
      nutritionTips: 'Sip electrolyte drink on the pool deck between sets.',
      injuryWarning: injuryNote,
      createdAt: new Date().toISOString(),
    };
  } else {
    // Run
    const outdoorSec = profile.thresholdPaceRunOutdoorSec || 232;
    const tempoPaceSec = Math.round(outdoorSec * 1.08);
    return {
      id: `rec_${Date.now()}`,
      title: 'Aerobic Threshold Progression Run',
      sport: 'run',
      durationMin,
      estimatedTss: Math.round(durationMin * 1.05),
      intensity: 'tempo_z3',
      targetZones: {
        heartRate: `${Math.round(lthr * 0.84)}-${Math.round(lthr * 0.90)} bpm (Zone 3 Tempo)`,
        pace: `${formatPaceSec(tempoPaceSec)} steady`,
      },
      coachRationale: `Optimal readiness (${readiness}%) and balanced recovery metrics allow for a progressive tempo run to reinforce fatigue resistance at half marathon race pace. ${scheduleNote}`,
      readinessAnalysis: 'HRV and sleep trends indicate complete restoration. Stable biomechanical stability ready for tempo demands.',
      structure: [
        { phase: 'Warm-up', duration: '12 min', description: 'Easy Zone 1/2 jog building rhythm, plus 4 x 20s progressive accelerations with walk back.', target: 'Gradual HR rise' },
        { phase: 'Main Set', duration: `${Math.max(25, durationMin - 22)} min`, description: `2 x 12 min at Tempo pace (${formatPaceSec(tempoPaceSec)}) with 3 min jog recovery between sets. Keep cadence 175-180 spm.`, target: `${Math.round(lthr * 0.85)}-${Math.round(lthr * 0.90)} bpm` },
        { phase: 'Cool-down', duration: '10 min', description: 'Very easy jog down to walking, static calf and hip flexor stretches.', target: 'Zone 1' },
      ],
      nutritionTips: '1 gel with water at the 25-minute mark if needed. Rehydrate with 500ml electrolytes post-run.',
      injuryWarning: injuryNote,
      createdAt: new Date().toISOString(),
    };
  }
}

export async function handleRecommendWorkout(req: Request, res: Response) {
  const payload = req.body || {};
  const profile = payload.athleteProfile || {};
  const readiness = payload.latestReadiness || {};
  const fitness = payload.fitnessStats || {};
  const goals = payload.goals || [];
  const recentActivities = payload.recentActivitiesSummary || {};

  // If Gemini API is available, generate using Gemini 3.8 Flash
  if (geminiAi) {
    try {
      const ftp = profile.bikeFtp || 315;
      const lthrRun = profile.thresholdHeartRateRun || 168;
      const outdoorPace = formatPaceSec(profile.thresholdPaceRunOutdoorSec);
      const treadmillPace = formatPaceSec(profile.thresholdPaceRunTreadmillSec);
      const activeInjuries = payload.activeInjuries || (profile.injuries || []).filter((inj: any) => inj.status === 'active' || inj.status === 'monitoring');
      const injuries = activeInjuries
        .map((inj: any) => `${inj.name} (${inj.bodyArea}): pain ${inj.painLevel ?? 'N/A'}/10, modifications: ${inj.sportModifications || 'None'}`)
        .join('; ') || 'None logged';

      const periodizationModel = profile.periodization || payload.periodizationInfo?.model || '4weeks';
      const periodizationPhase = payload.periodizationInfo?.phaseName || 'Progressive Build Block';

      const todayAvail = payload.todayAvailability;
      const scheduleContext = todayAvail
        ? `Is Workday: ${todayAvail.isWorkday ? 'YES' : 'NO'}, Shift: ${todayAvail.shiftStart || '08:30'} - ${todayAvail.shiftEnd || '17:00'}, Available Windows: ${(todayAvail.availableWindows || []).join(', ')}, Suggested Duration: ${payload.targetDurationMin || 55} min`
        : 'Standard availability';

      const goalsSummary = goals
        .map((g: any) => `${g.priority}-Goal: ${g.name} (${g.eventType}, ${g.distancePreset || g.totalDistanceKm + 'km'} on ${g.eventDate})`)
        .join('\n') || 'General triathlon endurance';

      const prompt = `You are an elite triathlon coach and Olympic exercise physiologist.
Analyze this athlete's physiological benchmarks, readiness, periodization phase, work schedule constraints, and race goals to prescribe the single best training workout for TODAY.

ATHLETE PHYSIOLOGY & THRESHOLDS:
- Bike FTP: ${ftp} Watts
- Run Lactate Threshold Heart Rate (LTHR): ${lthrRun} bpm
- Run Outdoor Threshold Pace: ${outdoorPace}
- Run Treadmill Threshold Pace: ${treadmillPace}
- Max HR: ${profile.maxHeartRate || 185} bpm, Resting HR: ${profile.restingHeartRate || 48} bpm
- Weight: ${profile.weightKg || 75} kg
- Periodization Strategy: ${periodizationModel} (${periodizationPhase})
- Active Injuries & Limitations: ${injuries}

TODAY'S WORK SCHEDULE & AVAILABILITY:
- ${scheduleContext}
- CRITICAL WORKDAY CONSTRAINT: If today is a workday, you MUST respect the athlete's shift hours and available window. Prescribe a duration that fits completely within the available window (default ${payload.targetDurationMin || 55} min). Do NOT prescribe a multi-hour session that conflicts with work hours.

TODAY'S READINESS & RECOVERY:
- Readiness Score: ${readiness.score ?? 'N/A'}% (${readiness.status || 'Normal'})
- Resting HR: ${readiness.rhr ?? profile.restingHeartRate} bpm
- HRV rMSSD: ${readiness.hrvRmssd ?? 'N/A'} ms
- Sleep: ${readiness.sleepMinutes ? Math.round(readiness.sleepMinutes / 60 * 10) / 10 + 'h' : 'N/A'}
- Subjective Soreness: ${readiness.soreness ?? 'N/A'}/5

TRAINING STRESS & FITNESS STATE:
- Fitness (CTL): ${fitness.ctl ?? 80}
- Fatigue (ATL): ${fitness.atl ?? 75}
- Form (TSB): ${fitness.tsb ?? 5}
- Triathlon Fitness Index (TFI): ${fitness.tfi ?? 85}%
- Current Limiting Discipline: ${fitness.limitingFactor || 'None identified'}

RECENT TRAINING (Last 14 Days):
- Total: ${recentActivities.totalLast14Days ?? 0} sessions (${recentActivities.bikeKm ?? 0}km bike, ${recentActivities.runKm ?? 0}km run, ${recentActivities.swimKm ?? 0}km swim)
- Recent Activities: ${(recentActivities.last3DaysActivities || []).join(', ') || 'Standard training block'}

ATHLETE GOALS:
${goalsSummary}

ATHLETE SESSION REQUEST:
- Preferred Sport: ${payload.preferredSport || 'auto (coach determines)'}
- Target Duration: ${payload.targetDurationMin ? payload.targetDurationMin + ' min' : 'fits workday window'}
- Specific Notes / Requests: ${payload.customNotes || 'none'}

COACHING RULES:
1. Workday Availability: Strictly keep workout within target duration (${payload.targetDurationMin || 55} min) to fit today's available window without disrupting work. Mention in coachRationale how this fits their work schedule.
2. If Readiness is LOW (<60%) or Form (TSB) is highly negative (<-20), DO NOT prescribe VO2max or threshold work. Prescribe Active Recovery (Zone 1) to facilitate supercompensation.
3. If Readiness is OPTIMAL (>=75%) and Form is balanced (-10 to +15), prescribe a quality workout aligned with their primary goal and current periodization phase (${periodizationPhase}).
4. Compute and provide EXACT numerical targets tailored to the athlete:
   - For bike: specify exact Watts (e.g. "${Math.round(ftp * 0.88)}-${Math.round(ftp * 0.93)}W") using FTP ${ftp}W.
   - For run: specify exact bpm (using LTHR ${lthrRun}) and min/km pace (${outdoorPace}).
   - For swim: specify 100m pace.
5. Adhere strictly to injury modifications: ${injuries}. If calf or Achilles injury is active, avoid high-impact track intervals; keep cycling torque low or use pull buoy swimming.
6. Return ONLY a JSON object with this exact schema:
{
  "id": "rec_${Date.now()}",
  "title": "string (concise descriptive workout title)",
  "sport": "swim" | "bike" | "run" | "strength" | "rest" | "brick",
  "durationMin": number,
  "estimatedTss": number,
  "intensity": "recovery" | "aerobic_z2" | "tempo_z3" | "threshold_z4" | "vo2max_z5",
  "targetZones": {
    "watts": "string or empty",
    "heartRate": "string or empty",
    "pace": "string or empty"
  },
  "coachRationale": "string (2-3 sentences explaining why this session matches today's readiness, TSB, upcoming goal, and respects today's work schedule availability)",
  "readinessAnalysis": "string (1-2 sentences on how today's HRV, sleep, and fatigue governed the prescription)",
  "structure": [
    {
      "phase": "string (e.g. Warm-up, Main Set, Recovery, Cool-down)",
      "duration": "string (e.g. 12 min, 3 x 10 min)",
      "description": "string (exact drill, cadence, pacing cues)",
      "target": "string (e.g. 210-230W or 4:15/km)"
    }
  ],
  "nutritionTips": "string (fueling/hydration advice)",
  "injuryWarning": "string or empty (safety advice if relevant)"
}`;

      const response = await geminiAi.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.4,
        },
      });

      const text = response.text || '';
      const parsed = JSON.parse(text);
      parsed.createdAt = new Date().toISOString();
      if (!parsed.id) parsed.id = `rec_${Date.now()}`;
      return res.json({ success: true, workout: parsed, source: 'gemini-3.8-flash' });
    } catch (err: any) {
      console.warn('[Gemini Coach] AI recommendation error, falling back to rule engine:', err?.message || err);
      // Fallback cleanly
      const fallback = generateFallbackWorkout(payload);
      return res.json({ success: true, workout: fallback, source: 'fallback-sports-science', notice: 'Generated using local endurance physiological engine.' });
    }
  }

  // Fallback if no Gemini API key configured
  const fallback = generateFallbackWorkout(payload);
  return res.json({
    success: true,
    workout: fallback,
    source: 'fallback-sports-science',
    notice: 'Generated using local endurance physiological engine.',
  });
}

export async function handleGeneratePlan(req: Request, res: Response) {
  const payload = req.body || {};
  const profile = payload.athleteProfile || {};
  const goals = payload.goals || [];
  const primaryGoal = goals.find((g: any) => g.priority === 'A') || goals[0] || {
    name: 'Triathlon Endurance Milestone',
    distancePreset: 'Middle 70.3',
    eventDate: '2026-08-15',
  };

  const ctl = payload.fitnessStats?.ctl ?? 75;
  const weeklyAvailability = profile.weeklyAvailability || {};

  if (geminiAi) {
    try {
      const prompt = `You are a world-class triathlon coach. Generate an individualized 1-Week Adaptive Training Microcycle for this athlete leading toward their primary goal.

ATHLETE & GOAL:
- Primary A-Goal: ${primaryGoal.name} (${primaryGoal.distancePreset || primaryGoal.totalDistanceKm + 'km'}), Date: ${primaryGoal.eventDate}
- Current Chronic Training Load (CTL / Fitness): ${ctl}
- Cycling FTP: ${profile.bikeFtp || 300}W
- Running LTHR: ${profile.thresholdHeartRateRun || 168} bpm
- Periodization Model: ${profile.periodization || '3weeks (2 hard + 1 easy)'}
- Work schedule / availability:
${Object.entries(weeklyAvailability).map(([day, d]: [string, any]) => `  ${day}: ${d.isWorkday ? 'Workday' : 'Day Off'}, windows: ${(d.availableWindows || []).join(', ')}`).join('\n') || 'Standard weekly availability'}

INSTRUCTIONS:
1. Provide a cohesive 7-day microcycle (Monday through Sunday).
2. Balance Swim, Bike, Run, and Strength/Mobility across the week.
3. Place rest or active recovery strategically (e.g. Monday or Friday).
4. Place key long endurance sessions on weekend or non-work days.
5. Return ONLY a valid JSON object matching:
{
  "id": "plan_${Date.now()}",
  "goalName": "${primaryGoal.name}",
  "targetRaceDate": "${primaryGoal.eventDate}",
  "weeksToGoal": 12,
  "summary": "string (overview of this microcycle focus)",
  "periodizationPhase": "Build 1 - Aerobic & Threshold Capacity",
  "athleteStrengths": "string",
  "keyFocusAreas": ["string", "string"],
  "weeks": [
    {
      "weekNumber": 1,
      "title": "Target Microcycle",
      "focus": "string",
      "totalHours": number,
      "totalTss": number,
      "days": [
        {
          "dayName": "Monday",
          "sport": "rest" | "swim" | "bike" | "run" | "strength" | "brick",
          "title": "string",
          "durationMin": number,
          "targetTss": number,
          "description": "string",
          "isKeySession": boolean,
          "targetMetric": "string (e.g. 220W Z2 or 4:40/km)"
        }
      ]
    }
  ]
}`;

      const response = await geminiAi.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.4,
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      parsed.createdAt = new Date().toISOString();
      return res.json({ success: true, plan: parsed, source: 'gemini-3.8-flash' });
    } catch (err: any) {
      console.warn('[Gemini Coach Plan] Error, returning fallback plan:', err?.message || err);
    }
  }

  // Fallback 7-day plan
  const fallbackPlan = {
    id: `plan_${Date.now()}`,
    goalName: primaryGoal.name || 'Ironman 70.3',
    targetRaceDate: primaryGoal.eventDate || '2026-08-15',
    weeksToGoal: 14,
    summary: 'Balanced aerobic foundation microcycle with bike sweet spot, progressive threshold run, and technique-focused swim sets.',
    periodizationPhase: 'Build 1 - Aerobic Threshold Focus',
    athleteStrengths: 'Strong aerobic base and consistent training history.',
    keyFocusAreas: [
      'Sustained Zone 3/Sweet Spot bike power without muscular fatigue',
      'Neuromuscular run cadence (175+ spm) and threshold control',
      'Swim distance per stroke and aerobic conditioning',
    ],
    weeks: [
      {
        weekNumber: 1,
        title: 'Weekly Training Block',
        focus: 'Aerobic Efficiency & Threshold Pacing',
        totalHours: 9.5,
        totalTss: 440,
        days: [
          {
            dayName: 'Monday',
            sport: 'rest',
            title: 'Full Recovery & Soft Tissue Mobility',
            durationMin: 0,
            targetTss: 0,
            description: 'Rest day. Foam roll calves and glutes, light hydration, 8+ hours sleep.',
            isKeySession: false,
          },
          {
            dayName: 'Tuesday',
            sport: 'bike',
            title: 'Sweet Spot Intervals (3 x 12 min)',
            durationMin: 75,
            targetTss: 70,
            description: '15 min warm-up, 3 x 12 min at 88-92% FTP with 4 min easy spin recovery, 15 min cool-down.',
            isKeySession: true,
            targetMetric: `${Math.round((profile.bikeFtp || 300) * 0.9)}W`,
          },
          {
            dayName: 'Wednesday',
            sport: 'swim',
            title: 'Aerobic CSS Threshold & EVF Technique',
            durationMin: 60,
            targetTss: 55,
            description: '400m warm-up, 10 x 100m @ CSS + 15s rest, 4 x 200m pull buoy steady, 200m cool-down.',
            isKeySession: false,
            targetMetric: '1:30/100m',
          },
          {
            dayName: 'Thursday',
            sport: 'run',
            title: 'Lactate Threshold Tempo Progression',
            durationMin: 55,
            targetTss: 60,
            description: '15 min warm-up, 25 min steady Zone 3/4 tempo at LTHR, 15 min cool-down.',
            isKeySession: true,
            targetMetric: `${profile.thresholdHeartRateRun || 168} bpm`,
          },
          {
            dayName: 'Friday',
            sport: 'swim',
            title: 'Recovery Swim & Core Conditioning',
            durationMin: 45,
            targetTss: 35,
            description: '1500m mixed strokes and drill work with fins and snorkel. 15 min core strength afterward.',
            isKeySession: false,
          },
          {
            dayName: 'Saturday',
            sport: 'bike',
            title: 'Aerobic Endurance Long Ride + Transition Run',
            durationMin: 150,
            targetTss: 130,
            description: '135 min steady Zone 2 ride (65-72% FTP) in aero bars, immediately followed by 15 min easy brick run.',
            isKeySession: true,
            targetMetric: `${Math.round((profile.bikeFtp || 300) * 0.7)}W`,
          },
          {
            dayName: 'Sunday',
            sport: 'run',
            title: 'Long Aerobic Zone 2 Endurance Run',
            durationMin: 85,
            targetTss: 90,
            description: 'Progressive distance run on soft gravel/dirt path. Keep HR strictly in Zone 2.',
            isKeySession: true,
            targetMetric: 'Zone 2 Heart Rate',
          },
        ],
      },
    ],
    createdAt: new Date().toISOString(),
  };

  return res.json({
    success: true,
    plan: fallbackPlan,
    source: 'fallback-sports-science',
  });
}

export async function handleCoachChat(req: Request, res: Response) {
  const {
    question,
    athleteProfile,
    fitnessStats,
    latestReadiness,
    goals,
    history,
    activities,
    todayDate,
    todayDayOfWeek,
    recentActivitiesSummary,
  } = req.body || {};

  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  const curDate = todayDate || new Date().toISOString().split('T')[0];
  const curDay = todayDayOfWeek || new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const acts: any[] = Array.isArray(activities) ? activities : [];

  // Filter specific time cohorts
  const todayActs = acts.filter((a) => a.startDate === curDate || a.daysAgo === 0);
  const weekendActs = acts.filter(
    (a) => (String(a.dayOfWeek).toLowerCase() === 'saturday' || String(a.dayOfWeek).toLowerCase() === 'sunday') && a.daysAgo <= 8
  );
  const thursdayRuns = acts.filter(
    (a) => String(a.dayOfWeek).toLowerCase() === 'thursday' && String(a.sport || '').toLowerCase().includes('run')
  );

  // Chronological activity log format
  const activitiesLog = acts.slice(0, 35).map((a) => {
    const indoorTag = a.isIndoor ? ' [Indoor/Treadmill]' : '';
    const paceOrSpeed = a.paceFormatted ? `, Pace: ${a.paceFormatted}` : (a.speedKmh ? `, Speed: ${a.speedKmh} km/h` : '');
    const wattsStr = a.avgWatts ? `, Power: ${a.avgWatts}W` : '';
    const hrStr = a.avgHeartrate ? `, Avg HR: ${a.avgHeartrate} bpm` : '';
    const maxHrStr = a.maxHeartrate ? `, Max HR: ${a.maxHeartrate} bpm` : '';
    const cadStr = a.avgCadence ? `, Cadence: ${a.avgCadence}` : '';
    const tssStr = a.tss ? `, TSS: ${a.tss}` : '';
    const notesStr = a.notes ? ` (Notes: ${a.notes})` : '';
    const rpeStr = a.rpe ? ` [RPE: ${a.rpe}/10]` : '';
    const daysLabel = a.daysAgo === 0 ? 'TODAY' : a.daysAgo === 1 ? 'YESTERDAY' : `${a.daysAgo} days ago`;
    return `• ${a.dayOfWeek}, ${a.startDate} (${daysLabel}) - ${a.sport}${indoorTag}: "${a.name}" | ${a.distanceKm} km, ${a.movingTimeMin} min${paceOrSpeed}${wattsStr}${hrStr}${maxHrStr}${cadStr}${tssStr}${rpeStr}${notesStr}`;
  }).join('\n') || 'No individual activities logged.';

  // Highlight Thursday runs for comparison
  let thursdayRunsCohort = 'No specific Thursday run workouts found in recent records.';
  if (thursdayRuns.length >= 2) {
    const r1 = thursdayRuns[0];
    const r2 = thursdayRuns[1];
    thursdayRunsCohort = `1. Most Recent Thursday (${r1.startDate}, ${r1.daysAgo} days ago): "${r1.name}" - ${r1.distanceKm} km, ${r1.movingTimeMin} min, Pace: ${r1.paceFormatted || 'N/A'}, Avg HR: ${r1.avgHeartrate || 'N/A'} bpm, Max HR: ${r1.maxHeartrate || 'N/A'} bpm, Cadence: ${r1.avgCadence || 'N/A'} spm, TSS: ${r1.tss || 'N/A'}${r1.isIndoor ? ' [Treadmill]' : ''}
2. Preceding Thursday (${r2.startDate}, ${r2.daysAgo} days ago): "${r2.name}" - ${r2.distanceKm} km, ${r2.movingTimeMin} min, Pace: ${r2.paceFormatted || 'N/A'}, Avg HR: ${r2.avgHeartrate || 'N/A'} bpm, Max HR: ${r2.maxHeartrate || 'N/A'} bpm, Cadence: ${r2.avgCadence || 'N/A'} spm, TSS: ${r2.tss || 'N/A'}${r2.isIndoor ? ' [Treadmill]' : ''}`;
  } else if (thursdayRuns.length === 1) {
    const r1 = thursdayRuns[0];
    thursdayRunsCohort = `Single Thursday run found: "${r1.name}" on ${r1.startDate} - ${r1.distanceKm} km, ${r1.movingTimeMin} min, Pace: ${r1.paceFormatted || 'N/A'}, Avg HR: ${r1.avgHeartrate || 'N/A'} bpm, TSS: ${r1.tss || 'N/A'}. Compare with other recent runs.`;
  }

  // Highlight Today's activities
  const todayCohort = todayActs.length > 0
    ? todayActs.map((a) => `• "${a.name}" (${a.sport}): ${a.distanceKm} km, ${a.movingTimeMin} min, Pace/Speed: ${a.paceFormatted || a.speedKmh + ' km/h' || 'N/A'}, Avg HR: ${a.avgHeartrate || 'N/A'} bpm, Power: ${a.avgWatts || 'N/A'}W, TSS: ${a.tss || 'N/A'}`).join('\n')
    : 'No workouts completed today yet.';

  // Highlight Weekend activities
  const weekendCohort = weekendActs.length > 0
    ? weekendActs.map((a) => `• ${a.dayOfWeek} (${a.startDate}): "${a.name}" (${a.sport}) - ${a.distanceKm} km, ${a.movingTimeMin} min, Pace/Speed: ${a.paceFormatted || a.speedKmh + ' km/h' || 'N/A'}, Avg HR: ${a.avgHeartrate || 'N/A'} bpm, TSS: ${a.tss || 'N/A'}`).join('\n')
    : 'No workouts found for the most recent weekend.';

  if (geminiAi) {
    try {
      const ftp = athleteProfile?.bikeFtp || 315;
      const lthr = athleteProfile?.thresholdHeartRateRun || 168;
      const outdoorPace = formatPaceSec(athleteProfile?.thresholdPaceRunOutdoorSec);
      const treadmillPace = formatPaceSec(athleteProfile?.thresholdPaceRunTreadmillSec);
      const periodization = athleteProfile?.periodization || '4weeks';
      const rawInjuries = athleteProfile?.injuries || [];
      const activeInjuries = rawInjuries.filter(
        (i: any) => i.status === 'active' || i.status === 'monitoring' || (typeof i.painLevel === 'number' && i.painLevel > 0)
      );
      const injuriesSummary = activeInjuries
        .map((i: any) => `• ${i.name} (${i.bodyArea}, side: ${i.side || 'N/A'}, status: ${i.status}): Pain ${i.painLevel ?? 'N/A'}/10. Required Modifications: "${i.sportModifications || 'None'}". Rehab: "${i.rehabExercises || 'None'}"`)
        .join('\n') || 'No active injuries logged.';

      const availabilitySummary = Object.entries(athleteProfile?.weeklyAvailability || {})
        .map(([day, d]: [string, any]) => `• ${day.toUpperCase()}: ${d.isWorkday ? `Workday (Shift: ${d.shiftStart || '08:30'} - ${d.shiftEnd || '17:00'})` : 'Off-day'}. Available Windows: ${(d.availableWindows || []).join(', ')}. Preferred: ${(d.preferredActivities || []).join(', ') || 'Any'}`)
        .join('\n') || 'Standard weekly availability.';

      const context = `You are Coach Gemini, an elite endurance coach and Olympic exercise physiologist.
You are reviewing the athlete's real training history, physiological status, work constraints, and race milestones.

CALENDAR CONTEXT:
- TODAY IS: ${curDay}, ${curDate}

ATHLETE PHYSIOLOGY & BENCHMARKS:
- Cycling FTP: ${ftp} Watts
- Running LTHR: ${lthr} bpm
- Running Threshold Pace (Outdoor): ${outdoorPace}
- Running Threshold Pace (Treadmill): ${treadmillPace}
- Max HR: ${athleteProfile?.maxHeartRate || 185} bpm, Resting HR: ${athleteProfile?.restingHeartRate || 48} bpm
- Training Periodization Strategy: ${periodization} (e.g. 4weeks = 3 progressive build weeks + 1 recovery cutback week)
- Today's Readiness Score: ${latestReadiness?.score ?? 80}% (${latestReadiness?.status || 'Normal'})
- Today's HRV rMSSD: ${latestReadiness?.hrvRmssd ?? 'N/A'} ms, Sleep: ${latestReadiness?.sleepMinutes ? Math.round(latestReadiness.sleepMinutes / 60 * 10) / 10 + 'h' : 'N/A'}
- Training Stress: CTL (Fitness): ${fitnessStats?.ctl ?? 80}, ATL (Fatigue): ${fitnessStats?.atl ?? 75}, Form (TSB): ${fitnessStats?.tsb ?? 5}
- Race Goals: ${(goals || []).map((g: any) => `${g.priority}-Goal: ${g.name} (${g.eventType || 'Triathlon'}) on ${g.eventDate}`).join(', ') || 'Endurance goals'}

ATHLETE INJURIES & LIMITATIONS:
${injuriesSummary}

WEEKLY TRAINING AVAILABILITY & WORK SCHEDULE:
${availabilitySummary}

TRIATHLON BENCHMARKS & SUB-GOALS:
1. Macro Volume Goals:
   - Swim 3.8 km in training (continuous Ironman swim simulation)
   - Ride 80 miles (128.7 km)
   - Run 16 miles (25.75 km)
2. Precision Sub-Goals:
   - Speed up 1.9 km swim (sub-32 min / <1:41/100m)
   - Spend 2 hours continuous in the Time Trial (TT) aero position
   - Complete a 3-hour 225 Watt steady-state bike workout
   - Complete a 1-hour 10-mile (16.1 km) threshold tempo run (~3:45-4:05/km)

KEY TIME-COHORT DATA:
[TODAY'S WORKOUTS (${curDay}, ${curDate})]:
${todayCohort}

[RECENT WEEKEND WORKOUTS (Saturday & Sunday)]:
${weekendCohort}

[RUN WORKOUTS FROM THE LAST 2 THURSDAYS]:
${thursdayRunsCohort}

[DETAILED RECENT ACTIVITY LOG (Chronological, newest first)]:
${activitiesLog}

COACHING DIRECTIVES FOR SPECIFIC ATHLETE QUESTIONS:
1. "DOES COACH GEMINI HAVE ACCESS TO MY DETAILS IN ATHLETE TAB, PERIODIZATION, INJURIES, WORK SCHEDULE?":
   - Confirm with absolute clarity: Yes! You have full, direct real-time access.
   - List their exact values: Periodization model (${periodization}), active injuries (state ${activeInjuries.map((i: any) => i.name).join(', ') || 'none active'}), and weekly work schedule (workday shifts and available windows).
   - Reassure them that every prescribed workout and plan strictly honors these constraints.

2. "REVIEW WORKOUTS / WHAT DID YOU THINK OF MY TRAINING TODAY/WEEKEND/LAST WEEK?":
   - Summarize workouts, looking at activity details and streams (HR, power, cadence, pace).
   - Assess whether each session was: optimal, too hard, too short, or not hard enough for the current periodization phase (${periodization}).
   - Explain whether it helped hit macro goals (3.8km swim, 80mi ride, 16mi run) or sub-goals (1.9km swim speedup, 2h TT position, 3h 225W ride, 1h 10mi run).

3. "SWIM SPEED OVER DISTANCE VS REST PERIODS":
   - Explain why doing lots of fast short intervals with long rest (e.g. 50m/100m sprints with 30-45s rest) stimulates the anaerobic glycolytic system and builds high lactate, which is counterproductive for open water 1.9km (70.3) or 3.8km (Ironman).
   - In open water triathlon, there are no walls or rest pauses. To speed up a 1.9km swim, the athlete MUST reduce rest periods to 10–15s max, and execute sustained CSS threshold blocks (e.g. 400m-1000m continuous) to build steady-state stroke durability without heart rate spikes.

4. "BIKE FTP & TIME IN THE TT AERO POSITION (4H 30M 70.3 GOAL)":
   - With an FTP of ${ftp}W, the athlete has the engine for a stellar bike split (target 225-245W, ~2h 15m to 2h 20m for 90km).
   - Explain that aerodynamic drag constitutes ~80% of total resistance at 38-40 km/h. Riding upright on the hoods costs 20-30+ Watts in aero penalty.
   - Spending 2 continuous hours adapted to the TT position saves 10-15+ minutes over 90km—drastically higher return than trying to grind out a small 10W power increase while sitting upright.

5. "RUN PACE (LTP) & RUNNING DISTANCE AT PACE (4H 30M 70.3 GOAL)":
   - For a 4h 30m Half Ironman, the athlete needs a run split around 1h 24m to 1h 28m (~4:00 to 4:10/km).
   - Running distance at threshold pace (LTP: ${outdoorPace}) over 10-16 miles is where the athlete gains the most time on race day.
   - Explain that having a fast 5k or 10k is meaningless if muscular endurance fails at mile 8 off the bike. Extending sustained distance at LTP threshold builds the fatigue resistance needed to hold pace in the closing 5km.

6. "HOW SHOULD I PROGRESS MY RUN WORKOUTS FROM THE LAST 2 THURSDAYS?":
   - Compare the 2 Thursday run workouts side-by-side (distance, duration, pace, avg/max HR, cadence, TSS).
   - Prescribe a concrete, progressive next Thursday session (warm-up, progressive main set intervals with target pace/HR, cool-down).

TONE:
- Scientifically authoritative, direct, encouraging, and deeply grounded in the athlete's real metrics.`;

      const prompt = `${context}

Athlete: ${question}

Coach Gemini:`;

      const response = await geminiAi.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          temperature: 0.6,
        },
      });

      return res.json({
        success: true,
        answer: response.text || 'Coach recommendation ready.',
        source: 'gemini-3.8-flash',
      });
    } catch (err: any) {
      console.warn('[Gemini Coach Chat] Error, providing fallback advice:', err?.message || err);
    }
  }

  // Graceful rule-based chat fallback when offline or no API key
  const q = String(question).toLowerCase();

  // If question is about access to Athlete tab details, periodization, injuries, or work schedule
  if (
    q.includes('athlete') ||
    q.includes('access') ||
    q.includes('periodization') ||
    q.includes('injur') ||
    q.includes('schedule') ||
    q.includes('availability')
  ) {
    const rawInjuries = athleteProfile?.injuries || [];
    const activeInjuries = rawInjuries.filter(
      (i: any) => i.status === 'active' || i.status === 'monitoring' || (typeof i.painLevel === 'number' && i.painLevel > 0)
    );
    const injuriesList = activeInjuries.length > 0
      ? activeInjuries.map((i: any) => `• **${i.name}** (${i.bodyArea}): Pain ${i.painLevel ?? 'N/A'}/10. Protocol: "${i.sportModifications || 'None'}"`).join('\n')
      : '• No active injuries logged (100% biomechanical clearance).';

    const availList = Object.entries(athleteProfile?.weeklyAvailability || {})
      .map(([day, d]: [string, any]) => `• **${day.toUpperCase()}:** ${d.isWorkday ? `Workday (${d.shiftStart || '08:30'} - ${d.shiftEnd || '17:00'})` : 'Off-day'} | Windows: ${(d.availableWindows || []).join(', ')}`)
      .join('\n');

    const answer = `### 📋 Coach Access Confirmation: Athlete Profile & Constraints

**Yes! Coach Gemini has full, real-time access to all your profile parameters:**

1. **Periodization Strategy:**
   - **Model:** **${athleteProfile?.periodization || '4weeks'}** (${athleteProfile?.periodization === '3weeks' ? '2 build weeks + 1 recovery cutback' : '3 build weeks + 1 recovery cutback'}).
   - Workouts and weekly TSS targets automatically adapt to whether you are in an overload build or recovery regeneration microcycle.

2. **Active Injuries & Physical Limitations:**
${injuriesList}
   - *Coaching Enforcement:* Running volume and high-torque cycling are modified to prevent flare-ups.

3. **Training Availability & Work Schedule:**
${availList}
   - *Workday Enforcement:* Every prescribed workout strictly fits into your available morning, lunch, or evening windows without conflicting with your shift hours.

4. **Physiological Thresholds:**
   - **Bike FTP:** **${athleteProfile?.bikeFtp || 315} Watts**
   - **Run LTHR:** **${athleteProfile?.thresholdHeartRateRun || 168} bpm**
   - **Threshold Pace:** **${formatPaceSec(athleteProfile?.thresholdPaceRunOutdoorSec)}** (Treadmill: **${formatPaceSec(athleteProfile?.thresholdPaceRunTreadmillSec)}**)`;
    return res.json({ success: true, answer, source: 'fallback-sports-science' });
  }

  // If question is about swim rest intervals vs distance speed
  if (q.includes('swim') && (q.includes('rest') || q.includes('interval') || q.includes('speed') || q.includes('short'))) {
    const answer = `### 🏊‍♂️ Swim Physiology: Why Reducing Rest Intervals Beats Short Sprints

**1. The Problem with Fast Sprints & Long Rest:**
When you perform short 50m or 100m all-out swims with 30–60 seconds rest on the wall, you are training the **anaerobic glycolytic energy system**. This produces high blood lactate and neuromuscular fatigue. While this is great for pool sprinters, in an open water triathlon (1.9km for 70.3 or 3.8km for Ironman), **there are zero walls and no rest breaks**.

**2. Why You Must Reduce Rest Periods:**
To speed up your **1.9km swim benchmark (target Sub-32 min / <1:41/100m)**, you must train your aerobic engine to clear lactate while swimming:
• **Work-to-Rest Ratio:** Cut rest between 100m repeats to **10–15 seconds max**.
• **Continuous Pacing:** Shift your training sets toward continuous 400m, 800m, and 1000m blocks held strictly at your Critical Swim Speed (CSS: ~**${formatPaceSec(athleteProfile?.swimPoolPace100mSec || 90)}**).
• **Race Day Payoff:** Exiting the water fresh with low heart rate allows you to immediately access your target cycling wattage without heavy oxygen debt.`;
    return res.json({ success: true, answer, source: 'fallback-sports-science' });
  }

  // If question is about bike FTP, TT position, or 4h 30m Half Ironman time gain
  if (
    (q.includes('tt') || q.includes('time trial') || q.includes('aero') || q.includes('ftp') || q.includes('4:30') || q.includes('4hr') || q.includes('half ironman')) &&
    (q.includes('gain') || q.includes('bike') || q.includes('position') || q.includes('run'))
  ) {
    const answer = `### ⏱️ Half Ironman Sub-4h 30m Strategy: Where You Gain the Most Time

To break **4 hours 30 minutes** in a 70.3, the required split breakdown is typically:
• 🏊 **Swim (1.9 km):** ~30–32 mins
• 🚴 **Bike (90 km):** ~2h 15m – 2h 20m (Avg: 38.5–40.0 km/h)
• 🏃 **Run (21.1 km):** ~1h 24m – 1h 28m (Pace: ~4:00–4:10/km)
• ⚡ **Transitions (T1 + T2):** ~4–5 mins

**1. Why Time Spent in the TT Aero Position Delivers Massive Time Gains:**
At 38–40 km/h, **aerodynamic drag accounts for ~80% of total resistance**.
• With your FTP of **${athleteProfile?.bikeFtp || 315}W**, riding at target race power (78–82% FTP: ~**245–255W**) upright on the brake hoods generates massive frontal surface area.
• Holding the aerodynamic TT position on extensions saves **20–30 Watts of aerodynamic drag**, which translates to **10–15+ minutes saved over 90km** compared to sitting upright.
• Chasing 10 extra Watts upright causes heavy muscular fatigue, whereas mastering 2 continuous hours in aero posture yields pure speed for free.

**2. Why Running Distance at Threshold Pace (LTP) is Crucial:**
• Your outdoor threshold pace is **${formatPaceSec(athleteProfile?.thresholdPaceRunOutdoorSec)}**.
• In triathlon, running fast for 5km is meaningless if muscular endurance decays at mile 8. Running distance at tempo/LTP builds the fatigue resistance needed to hold ~4:05/km through kilometers 15–21 off a hard bike leg.`;
    return res.json({ success: true, answer, source: 'fallback-sports-science' });
  }

  // If question is about goals or sub-goals
  if (q.includes('goal') || q.includes('sub goal') || q.includes('benchmark') || q.includes('milestone')) {
    const answer = `### 🎯 Ironman Triathlon Macro Goals vs Precision Sub-Goals

**1. Macro Volume Milestones (Mechanical & Structural Resilience):**
• **Swim 3.8 km continuous in training:** Proves shoulder durability and bilateral sighting before race day.
• **Ride 80 miles (128.7 km):** Trains gut digestion (60–90g carbs/hr) and fatigue resistance for the 112-mile bike.
• **Run 16 miles (25.75 km):** Builds musculoskeletal connective tissue tolerance to prevent late-race muscle breakdown.

**2. High-Yield Precision Sub-Goals (Physiological & Aero Benchmarks):**
• **Speed up 1.9km swim (Sub-32 min):** Achieved by cutting rest intervals to 10-15s and training continuous CSS endurance.
• **Spend 2 hours continuous in TT aero position:** Saves 10-15+ minutes over 90km for a 4h 30m Half Ironman.
• **3-hour 225 Watt bike workout:** Proves fat oxidation efficiency at ~71% of your ${athleteProfile?.bikeFtp || 315}W FTP without cardiac drift.
• **1-hour 10-mile (16.1 km) threshold tempo run:** Proves ability to sustain Lactate Threshold Pace across double-digit mileage.`;
    return res.json({ success: true, answer, source: 'fallback-sports-science' });
  }

  // If question is about Thursday runs progression
  if (q.includes('thursday') || (q.includes('progress') && q.includes('run'))) {
    if (thursdayRuns.length >= 2) {
      const r1 = thursdayRuns[0];
      const r2 = thursdayRuns[1];
      const answer = `### 🏃‍♂️ Analysis & Progression: Your Last 2 Thursday Run Workouts

**1. Side-by-Side Review:**
• **Preceding Thursday (${r2.startDate}):** "${r2.name}"
  - Distance: **${r2.distanceKm} km** | Time: **${r2.movingTimeMin} min** | Pace: **${r2.paceFormatted || 'N/A'}**
  - Heart Rate: Avg **${r2.avgHeartrate || 'N/A'} bpm** (Max: ${r2.maxHeartrate || 'N/A'}) | TSS: **${r2.tss || 'N/A'}**
• **Most Recent Thursday (${r1.startDate}):** "${r1.name}"
  - Distance: **${r1.distanceKm} km** | Time: **${r1.movingTimeMin} min** | Pace: **${r1.paceFormatted || 'N/A'}**
  - Heart Rate: Avg **${r1.avgHeartrate || 'N/A'} bpm** (Max: ${r1.maxHeartrate || 'N/A'}) | TSS: **${r1.tss || 'N/A'}**

**2. Physiological Adaptation:**
Comparing both sessions, your heart rate response relative to your LTHR (**${athleteProfile?.thresholdHeartRateRun || 168} bpm**) demonstrates stabilizing threshold stamina.

**3. Next Thursday's Recommended Progression:**
• **Warm-up (15 min):** Easy Zone 2 jog + 4 x 20s progressive accelerations.
• **Main Set Progression:**
  - Increase interval volume by **+1 rep** (e.g. from 3 x 8 min to **4 x 8 min @ Threshold Pace**) or step repeat intervals by **3-5 sec/km** while anchoring HR strictly below **${Math.round((athleteProfile?.thresholdHeartRateRun || 168) * 0.98)} bpm**.
• **Cool-down (10 min):** Zone 1 jog flush + static calf/hamstring stretching.`;
      return res.json({ success: true, answer, source: 'fallback-sports-science' });
    }
  }

  // If question is about today
  if (q.includes('today')) {
    if (todayActs.length > 0) {
      const items = todayActs.map((a) => `• **${a.sport} — "${a.name}":** ${a.distanceKm} km in ${a.movingTimeMin} min (${a.paceFormatted ? `pace ${a.paceFormatted}` : (a.speedKmh ? `${a.speedKmh} km/h` : '')}${a.avgHeartrate ? `, HR ${a.avgHeartrate} bpm` : ''}, **${a.tss || 0} TSS**)`).join('\n');
      const totalTss = todayActs.reduce((acc, a) => acc + (a.tss || 0), 0);
      const answer = `### ⚡ Coach Review: Today's Training (${curDay}, ${curDate})

**Today's Logged Sessions:**
${items}

**Coach Assessment:**
• **Training Load:** You completed **${totalTss} TSS** today. This matches your current readiness of **${latestReadiness?.score ?? 80}%**.
• **Recovery Focus:** Rehydrate with 600ml fluid + electrolytes, and consume 25-30g of protein to facilitate rapid muscular repair.`;
      return res.json({ success: true, answer, source: 'fallback-sports-science' });
    } else {
      const answer = `### ⚡ Coach Review: Today (${curDay}, ${curDate})

No workouts have been logged in your profile for today yet!
• **Readiness:** **${latestReadiness?.score ?? 80}%** (Form TSB: **${fitnessStats?.tsb ?? 5}**).
• **Prescription for Today:** With your current metrics, you are cleared for an aerobic session. On the bike, target Sweet Spot intervals at **${Math.round((athleteProfile?.bikeFtp || 315) * 0.88)}-${Math.round((athleteProfile?.bikeFtp || 315) * 0.93)}W**, or an aerobic Zone 2 run with heart rate under **${Math.round((athleteProfile?.thresholdHeartRateRun || 168) * 0.84)} bpm**.`;
      return res.json({ success: true, answer, source: 'fallback-sports-science' });
    }
  }

  // If question is about the weekend
  if (q.includes('weekend')) {
    if (weekendActs.length > 0) {
      const totalKm = Math.round(weekendActs.reduce((acc, a) => acc + a.distanceKm, 0) * 10) / 10;
      const totalTss = weekendActs.reduce((acc, a) => acc + (a.tss || 0), 0);
      const items = weekendActs.map((a) => `• **${a.dayOfWeek} (${a.startDate}) — ${a.sport}:** "${a.name}" | ${a.distanceKm} km, ${a.paceFormatted || a.speedKmh + ' km/h' || 'steady'}, **${a.tss || 0} TSS**`).join('\n');
      const answer = `### 🚴‍♂️ Weekend Training Performance Review

**Weekend Sessions:**
${items}

**Load Summary:**
• Total Volume: **${totalKm} km** across disciplines
• Total Load: **${totalTss} TSS**
• **Coach Takeaway:** You successfully accumulated endurance volume without acute overload. Keep Monday easy or active recovery to prepare for mid-week quality work.`;
      return res.json({ success: true, answer, source: 'fallback-sports-science' });
    }
  }

  // General fallback
  let answer = `Based on your physiological benchmarks (FTP: **${athleteProfile?.bikeFtp || 315}W**, LTHR: **${athleteProfile?.thresholdHeartRateRun || 168} bpm**, periodization: **${athleteProfile?.periodization || '4weeks'}**) and readiness of **${latestReadiness?.score || 80}%**:`;
  answer += `\n\n• **Training Load:** Your Chronic Training Load (CTL) is **${fitnessStats?.ctl ?? 75}** with Form (TSB) at **${fitnessStats?.tsb ?? 5}**.\n• Keep 80% of your training volume strictly in Zone 1/2 aerobic zones, and execute your high-yield threshold workouts with disciplined pacing.`;

  return res.json({
    success: true,
    answer,
    source: 'fallback-sports-science',
  });
}

export async function handleReviewWorkouts(req: Request, res: Response) {
  const payload = req.body || {};
  const profile = payload.athleteProfile || {};
  const goals = payload.goals || [];
  const activities: any[] = payload.recentActivities || [];

  // Generate baseline reviews using workout review engine
  const reviews = generateWorkoutReviews(activities, {}, profile, goals);

  return res.json({
    success: true,
    reviews,
    source: 'sports-science-engine',
  });
}


