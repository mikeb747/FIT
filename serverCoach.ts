import type { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';

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
  const ftp = Number(profile.bikeFtp) || 300;
  const lthr = Number(profile.thresholdHeartRateRun) || 168;
  const readiness = Number(payload.latestReadiness?.score ?? 80);
  const tsb = Number(payload.fitnessStats?.tsb ?? 0);
  const preferred = payload.preferredSport;

  const isFatigued = readiness < 65 || tsb < -15;

  let sport: 'swim' | 'bike' | 'run' | 'strength' | 'rest' | 'brick' = 'bike';
  if (preferred && preferred !== 'auto') {
    sport = preferred;
  } else if (payload.fitnessStats?.limitingFactor) {
    const lim = String(payload.fitnessStats.limitingFactor).toLowerCase();
    if (lim.includes('bike')) sport = 'bike';
    else if (lim.includes('run')) sport = 'run';
    else if (lim.includes('swim')) sport = 'swim';
  }

  if (isFatigued) {
    if (sport === 'bike') {
      return {
        id: `rec_${Date.now()}`,
        title: 'Recovery Spin & Flush',
        sport: 'bike',
        durationMin: 45,
        estimatedTss: 25,
        intensity: 'recovery',
        targetZones: {
          watts: `< ${Math.round(ftp * 0.55)}W (Zone 1 Active Recovery)`,
          heartRate: `< ${Math.round(lthr * 0.68)} bpm`,
          pace: 'N/A',
        },
        coachRationale: `Your readiness is ${readiness}% and Form (TSB) is ${tsb}. The nervous system and musculature need an active recovery stimulus to accelerate metabolic clearance without accumulating fatigue.`,
        readinessAnalysis: 'HRV and sleep data suggest acute fatigue. Keeping power strictly in Zone 1 allows glycogen replenishment while maintaining aerobic capillary flow.',
        structure: [
          { phase: 'Warm-up', duration: '10 min', description: 'Very easy spin at 85-90 RPM cadence, sub-50% FTP.', target: `< ${Math.round(ftp * 0.5)}W` },
          { phase: 'Main Set', duration: '25 min', description: 'Smooth, fluid pedal strokes. Zero high-torque efforts or hard out-of-saddle efforts.', target: `${Math.round(ftp * 0.45)}-${Math.round(ftp * 0.55)}W` },
          { phase: 'Cool-down', duration: '10 min', description: 'Spin down, light stretching, deep nasal breathing.', target: `< ${Math.round(ftp * 0.45)}W` },
        ],
        nutritionTips: 'Electrolytes with 500ml water. Focus on post-workout protein (25g) and quality complex carbohydrates for muscle repair.',
        createdAt: new Date().toISOString(),
      };
    } else {
      return {
        id: `rec_${Date.now()}`,
        title: 'Aerobic Recovery Jog & Mobility',
        sport: 'run',
        durationMin: 35,
        estimatedTss: 22,
        intensity: 'recovery',
        targetZones: {
          heartRate: `< ${Math.round(lthr * 0.72)} bpm (Zone 1)`,
          pace: 'Conversational pace (+60-75s slower than threshold)',
        },
        coachRationale: `Readiness is ${readiness}%. An easy, soft-surface jog promotes lymphatic drainage without joint pounding.`,
        readinessAnalysis: 'Elevated muscle fatigue or suppressed HRV indicates light aerobic stimulus only.',
        structure: [
          { phase: 'Warm-up', duration: '5 min', description: 'Walking and dynamic leg swings / ankle rolls.', target: 'Warm joints' },
          { phase: 'Main Set', duration: '25 min', description: 'Continuous easy jog on grass or soft trail. Strictly conversational.', target: `< ${Math.round(lthr * 0.72)} bpm` },
          { phase: 'Cool-down', duration: '5 min', description: 'Walking flush + calf/hamstring stretching.', target: 'Heart rate recovery' },
        ],
        nutritionTips: 'Rehydrate with 500ml water and electrolytes.',
        createdAt: new Date().toISOString(),
      };
    }
  }

  // Quality Session
  if (sport === 'bike') {
    const ssLow = Math.round(ftp * 0.88);
    const ssHigh = Math.round(ftp * 0.93);
    const z2 = Math.round(ftp * 0.68);
    return {
      id: `rec_${Date.now()}`,
      title: 'Sweet Spot Sustained Threshold Power',
      sport: 'bike',
      durationMin: 75,
      estimatedTss: 68,
      intensity: 'tempo_z3',
      targetZones: {
        watts: `${ssLow}-${ssHigh}W (Sweet Spot / High Z3)`,
        heartRate: `${Math.round(lthr * 0.85)}-${Math.round(lthr * 0.92)} bpm`,
        pace: 'N/A',
      },
      coachRationale: `Readiness is primed at ${readiness}%, and your TSB of ${tsb} provides a fresh platform. Sweet spot intervals build mitochondrial density and lactate clearing capacity with minimal recovery cost.`,
      readinessAnalysis: 'Autonomic nervous system is balanced with steady baseline HRV. Green light for quality sustained threshold work.',
      structure: [
        { phase: 'Warm-up', duration: '15 min', description: `Progressive build from ${Math.round(ftp * 0.55)}W to ${z2}W with 3 x 30s high-cadence fast pedals (105+ RPM).`, target: `${Math.round(ftp * 0.55)}-${z2}W` },
        { phase: 'Main Set', duration: '45 min', description: `3 x 12 minutes at Sweet Spot (${ssLow}-${ssHigh}W), with 4 minutes easy recovery spin at ${Math.round(ftp * 0.55)}W between sets. Focus on aero position.`, target: `${ssLow}-${ssHigh}W` },
        { phase: 'Cool-down', duration: '15 min', description: 'Easy spin cadence >90 RPM, gradual heart rate reduction.', target: `< ${Math.round(ftp * 0.5)}W` },
      ],
      nutritionTips: 'Take 50-60g of carbs per hour during the workout (1 bottle with maltodextrin/fructose mix) + 600ml fluid/hr.',
      createdAt: new Date().toISOString(),
    };
  } else if (sport === 'swim') {
    return {
      id: `rec_${Date.now()}`,
      title: 'Threshold CSS Pace & Stroke Durability',
      sport: 'swim',
      durationMin: 60,
      estimatedTss: 55,
      intensity: 'threshold_z4',
      targetZones: {
        pace: `${formatPaceSec(profile.swimPoolPace100mSec || 90)} (Target CSS pace)`,
      },
      coachRationale: `Swimming allows high aerobic training load with zero eccentric muscle breakdown, ideal for today's readiness of ${readiness}%.`,
      readinessAnalysis: 'Low impact on joints while maintaining upper-body cardiovascular stamina.',
      structure: [
        { phase: 'Warm-up', duration: '15 min (400m)', description: '200m easy swim, 100m kick with board, 100m pull buoy focusing on early vertical forearm (EVF).', target: 'Easy aerobic' },
        { phase: 'Main Set', duration: '35 min (1800m)', description: '3 sets of [4 x 100m @ CSS pace + 15s rest, 1 x 200m pull buoy steady]. Hold consistent stroke count per length.', target: 'CSS Threshold' },
        { phase: 'Cool-down', duration: '10 min (200m)', description: '200m relaxed backstroke and easy freestyle flush.', target: 'Heart rate recovery' },
      ],
      nutritionTips: 'Sip electrolyte drink on the pool deck between sets.',
      createdAt: new Date().toISOString(),
    };
  } else {
    // Run
    const outdoorSec = profile.thresholdPaceRunOutdoorSec || 240;
    const tempoPaceSec = Math.round(outdoorSec * 1.08);
    return {
      id: `rec_${Date.now()}`,
      title: 'Aerobic Threshold Progression Run',
      sport: 'run',
      durationMin: 55,
      estimatedTss: 58,
      intensity: 'tempo_z3',
      targetZones: {
        heartRate: `${Math.round(lthr * 0.84)}-${Math.round(lthr * 0.90)} bpm (Zone 3 Tempo)`,
        pace: `${formatPaceSec(tempoPaceSec)} steady`,
      },
      coachRationale: `Optimal readiness (${readiness}%) and balanced recovery metrics allow for a progressive tempo run to reinforce fatigue resistance at half/full marathon race pace.`,
      readinessAnalysis: 'HRV and sleep trends indicate complete restoration. Stable biomechanical stability ready for tempo demands.',
      structure: [
        { phase: 'Warm-up', duration: '15 min', description: 'Easy Zone 1/2 jog building rhythm, plus 4 x 20s progressive accelerations with walk back.', target: 'Gradual HR rise' },
        { phase: 'Main Set', duration: '30 min', description: `2 x 12 min at Tempo pace (${formatPaceSec(tempoPaceSec)}) with 3 min jog recovery between sets. Keep cadence 175-180 spm.`, target: `${Math.round(lthr * 0.85)}-${Math.round(lthr * 0.90)} bpm` },
        { phase: 'Cool-down', duration: '10 min', description: 'Very easy jog down to walking, static calf and hip flexor stretches.', target: 'Zone 1' },
      ],
      nutritionTips: '1 gel with water at the 25-minute mark if needed. Rehydrate with 500ml electrolytes post-run.',
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
      const ftp = profile.bikeFtp || 300;
      const lthrRun = profile.thresholdHeartRateRun || 168;
      const outdoorPace = formatPaceSec(profile.thresholdPaceRunOutdoorSec);
      const treadmillPace = formatPaceSec(profile.thresholdPaceRunTreadmillSec);
      const injuries = (profile.injuries || [])
        .filter((inj: any) => inj.status === 'active' || inj.status === 'monitoring')
        .map((inj: any) => `${inj.name} (${inj.bodyArea}): ${inj.sportModifications || 'No modifications logged'}`)
        .join('; ') || 'None';

      const goalsSummary = goals
        .map((g: any) => `${g.priority}-Goal: ${g.name} (${g.eventType}, ${g.distancePreset || g.totalDistanceKm + 'km'} on ${g.eventDate})`)
        .join('\n') || 'General triathlon endurance';

      const prompt = `You are an elite triathlon coach and Olympic exercise physiologist.
Analyze this athlete's physiological benchmarks, readiness, and race goals to prescribe the single best training workout for TODAY.

ATHLETE PHYSIOLOGY & THRESHOLDS:
- Bike FTP: ${ftp} Watts
- Run Lactate Threshold Heart Rate (LTHR): ${lthrRun} bpm
- Run Outdoor Threshold Pace: ${outdoorPace}
- Run Treadmill Threshold Pace: ${treadmillPace}
- Max HR: ${profile.maxHeartRate || 185} bpm, Resting HR: ${profile.restingHeartRate || 48} bpm
- Weight: ${profile.weightKg || 75} kg
- Active Injuries & Limitations: ${injuries}

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
- Target Duration: ${payload.targetDurationMin ? payload.targetDurationMin + ' min' : 'coach determines optimal'}
- Specific Notes / Requests: ${payload.customNotes || 'none'}

COACHING RULES:
1. If Readiness is LOW (<60%) or Form (TSB) is highly negative (<-20), DO NOT prescribe VO2max, high-intensity intervals, or max efforts. Prescribe Active Recovery (Zone 1) or an easy endurance Zone 2 session to promote supercompensation.
2. If Readiness is OPTIMAL (>=75%) and Form is balanced (-10 to +15), prescribe an interval workout, sweet spot, or race-pace stimulus aligned with the athlete's primary A-Goal and limiting factor.
3. Compute and provide EXACT numerical targets tailored to the athlete:
   - For bike: specify exact Watts (e.g. "270-285W") using FTP ${ftp}W.
   - For run: specify exact bpm (using LTHR ${lthrRun}) and min/km pace.
   - For swim: specify 100m pace.
4. Adhere to injury modifications: ${injuries}.
5. Return ONLY a JSON object with this exact schema:
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
  "coachRationale": "string (2-3 sentences explaining why this session matches today's readiness, TSB, and upcoming goal)",
  "readinessAnalysis": "string (1-2 sentences on how today's HRV, sleep, and fatigue governed the prescription)",
  "structure": [
    {
      "phase": "string (e.g. Warm-up, Main Set, Recovery, Cool-down)",
      "duration": "string (e.g. 15 min, 4 x 8 min)",
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
  const { question, athleteProfile, fitnessStats, latestReadiness, goals, history } = req.body || {};

  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  if (geminiAi) {
    try {
      const context = `You are Coach Gemini, a world-class endurance sports scientist and personal triathlon coach.
You are having a direct, professional, motivating conversation with your athlete.

ATHLETE METRICS:
- Bike FTP: ${athleteProfile?.bikeFtp || 300}W
- Run LTHR: ${athleteProfile?.thresholdHeartRateRun || 168} bpm
- Outdoor Threshold Pace: ${formatPaceSec(athleteProfile?.thresholdPaceRunOutdoorSec)}
- Max HR: ${athleteProfile?.maxHeartRate || 185} bpm, Resting HR: ${athleteProfile?.restingHeartRate || 48} bpm
- Current Readiness Score: ${latestReadiness?.score ?? 80}% (${latestReadiness?.status || 'Normal'})
- HRV: ${latestReadiness?.hrvRmssd ?? 'N/A'} ms, Sleep: ${latestReadiness?.sleepMinutes ? Math.round(latestReadiness.sleepMinutes / 60 * 10) / 10 + 'h' : 'N/A'}
- CTL (Fitness): ${fitnessStats?.ctl ?? 80}, ATL (Fatigue): ${fitnessStats?.atl ?? 75}, TSB (Form): ${fitnessStats?.tsb ?? 5}
- Goals: ${(goals || []).map((g: any) => `${g.priority}: ${g.name} on ${g.eventDate}`).join(', ') || 'Endurance goals'}

Guidelines:
1. Ground your answer in their exact numbers (mention their actual FTP, LTHR, readiness, or race date when applicable).
2. Be concise, actionable, and encouraging. Use bullet points for structured recommendations.
3. If they ask about pacing, fatigue, injury, or modifying a workout, apply sound sports physiology.`;

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

  // Graceful rule-based chat fallback
  const q = String(question).toLowerCase();
  let answer = `Based on your current physiological benchmarks (FTP: ${athleteProfile?.bikeFtp || 300}W, LTHR: ${athleteProfile?.thresholdHeartRateRun || 168} bpm) and readiness of ${latestReadiness?.score || 80}%, here is my guidance:`;

  if (q.includes('interval') || q.includes('hard') || q.includes('today')) {
    answer += `\n\n• **Intensity Recommendation:** With your current readiness (${latestReadiness?.score || 80}%), you are in a good physiological window for structured quality work. If doing cycling intervals, target **${Math.round((athleteProfile?.bikeFtp || 300) * 0.88)}-${Math.round((athleteProfile?.bikeFtp || 300) * 0.93)}W** for Sweet Spot sets. For running, hold your threshold heart rate around **${athleteProfile?.thresholdHeartRateRun || 168} bpm** without letting it drift past **${(athleteProfile?.thresholdHeartRateRun || 168) + 4} bpm**.`;
  } else if (q.includes('pace') || q.includes('race') || q.includes('70.3') || q.includes('ironman')) {
    answer += `\n\n• **Race Pacing Strategy:** For a Middle Distance (70.3), target **78-83% of FTP** (${Math.round((athleteProfile?.bikeFtp || 300) * 0.80)}-${Math.round((athleteProfile?.bikeFtp || 300) * 0.83)}W) for the bike leg to ensure you have legs to run. On the half marathon, target 10-15 seconds slower than your open half marathon threshold pace for the first 5km, then build into steady race pace.`;
  } else {
    answer += `\n\n• Maintain aerobic consistency while keeping hard days hard and easy days genuinely easy (Zone 1/2).\n• Ensure your post-workout carb and electrolyte intake stays on schedule to keep your Chronic Training Load (CTL) climbing safely toward your upcoming A-Goal.`;
  }

  return res.json({
    success: true,
    answer,
    source: 'fallback-sports-science',
  });
}
