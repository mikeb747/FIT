import type { Request, Response } from 'express';
import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import { generateWorkoutReviews } from './src/utils/workoutReviewEngine.ts';
import {
  findBestMatchingActivity,
  reconstructWorkoutFromQuery,
  analyzeActivityStructureAndLaps,
  getStructuredWorkoutsByDayOfWeek,
} from './src/utils/coachWorkoutMatcher.ts';
import {
  buildWorkoutDriftAndZoneAnalysis,
  buildCustomZoneUpdateAction,
} from './src/utils/zoneCalibrationEngine.ts';
import { DEFAULT_ATHLETE_PROFILE } from './src/types/athlete.ts';

// Initialize Gemini Client safely on the server using the current @google/genai SDK
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
const GEMINI_MODEL = 'gemini-4-hydrogen';

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

export function handleCoachStatus(_req: Request, res: Response) {
  res.json({
    available: Boolean(geminiAi),
    model: GEMINI_MODEL,
    features: [
      'workout-recommendation',
      'periodized-plan',
      'ai-chat-coach',
      'online-race-search-skill',
      'lap-interval-analyzer-skill',
      'workout-comment-editor-skill',
      'workout-planner-skill',
      'training-evaluation-skill',
      'profile-injury-schedule-skill',
      'zone-updater-skill',
      'cardiac-drift-kinetics-skill',
    ],
  });
}

function formatPaceSec(seconds?: number): string {
  if (!seconds || seconds <= 0) return 'N/A';
  const mins = Math.floor(seconds / 60);
  const remSec = Math.round(seconds % 60);
  return `${mins}:${remSec.toString().padStart(2, '0')}/km`;
}

// ============================================================================
// GEMINI COACH SKILL FUNCTION DECLARATIONS
// ============================================================================

const manageGoalRaceDecl: FunctionDeclaration = {
  name: 'manage_goal_race',
  description:
    'Search online for race details and add, propose, update, or delete a goal race in the athlete profile. Use when the athlete asks to add a race (e.g. "Add Seven Sins to my Goals", "Add Chippenham 10 mile"), edit a goal target/priority/date, or remove a goal race.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      operation: {
        type: Type.STRING,
        description: 'Action to take: "propose_goal" (if priority A/B/C was not specified by user), "add_goal" (if priority A/B/C was specified), "update_goal", or "delete_goal".',
      },
      raceName: {
        type: Type.STRING,
        description: 'Official or common name of the race (e.g. "Seven Sins Trail Run", "Chippenham Spring 10 Mile").',
      },
      eventType: {
        type: Type.STRING,
        description: 'Sport type: "run", "triathlon", "bike", or "swim".',
      },
      eventDate: {
        type: Type.STRING,
        description: 'Date of the next edition in YYYY-MM-DD format.',
      },
      distanceKm: {
        type: Type.NUMBER,
        description: 'Total race distance in kilometers (e.g. 11.3 for 7 miles, 16.093 for 10 miles, 21.1 for Half Marathon).',
      },
      distancePreset: {
        type: Type.STRING,
        description: 'Human-readable distance preset (e.g. "7 Miles (11.3 km)", "10 Mile", "Half Marathon", "70.3", "140.6").',
      },
      priority: {
        type: Type.STRING,
        description: 'Race priority if specified: "A", "B", or "C". Omit if operation is "propose_goal".',
      },
      targetTimeSec: {
        type: Type.NUMBER,
        description: 'Optional target finish time in seconds (e.g. 3600 for 1 hour).',
      },
      elevationGainM: {
        type: Type.NUMBER,
        description: 'Course elevation gain in meters if known.',
      },
      courseType: {
        type: Type.STRING,
        description: 'Course terrain: "road", "trail", "track", "mixed".',
      },
      location: {
        type: Type.STRING,
        description: 'Race venue / town / region.',
      },
      notes: {
        type: Type.STRING,
        description: 'Course profile, terrain notes, and pacing notes.',
      },
      goalId: {
        type: Type.STRING,
        description: 'Existing goal ID when updating or deleting an existing goal.',
      },
    },
    required: ['operation', 'raceName'],
  },
};

const updateWorkoutCommentDecl: FunctionDeclaration = {
  name: 'update_workout_comment_or_metadata',
  description:
    'Add or update a comment, description, coach analysis note, RPE (1-10), or title on one of the athlete logged workouts/activities.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      activityQueryOrName: {
        type: Type.STRING,
        description: 'Name, date, or keyword of the target workout (e.g. "8 x 1km @ 3:32/km 70s rest", "today run", "2026-11-12").',
      },
      commentOrDescription: {
        type: Type.STRING,
        description: 'The comment, description, or coach analysis note to save on the workout.',
      },
      newTitle: {
        type: Type.STRING,
        description: 'Optional new title for the workout if the athlete asked to rename it.',
      },
      rpe: {
        type: Type.NUMBER,
        description: 'Optional Borg RPE rating (1 to 10) if mentioned.',
      },
      appendToExisting: {
        type: Type.BOOLEAN,
        description: 'Whether to append to existing notes (true) or replace them (false). Default true.',
      },
    },
    required: ['activityQueryOrName', 'commentOrDescription'],
  },
};

const analyzeOrCalibrateWorkoutLapsDecl: FunctionDeclaration = {
  name: 'analyze_or_recalibrate_workout_laps',
  description:
    'Analyze what type of workout was performed from lap/interval structure or recalibrate treadmill/indoor run lap speeds and durations (Fix Data / +Add Lap) with zero time discrepancy.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      activityQueryOrName: {
        type: Type.STRING,
        description: 'Title, date, or description of the run/workout to analyze or recalibrate.',
      },
      adjustmentInstruction: {
        type: Type.STRING,
        description: 'Specific speed/pace adjustment instructions (e.g. "8 x 3min at 17kph with 70s rest", "adjust warmup to 6kph").',
      },
    },
    required: ['activityQueryOrName'],
  },
};

const prescribeUpcomingWorkoutDecl: FunctionDeclaration = {
  name: 'prescribe_upcoming_workout',
  description:
    'Plan and prescribe a structured upcoming workout (with warm-up, main set, cool-down, exact watts/pace/HR targets, and TSS) tailored to meet the athlete goals, CTL ramp rate, race countdown, work schedule, and injuries.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: 'Concise descriptive title of the prescribed workout.',
      },
      sport: {
        type: Type.STRING,
        description: 'Sport: "run", "bike", "swim", "strength", or "brick".',
      },
      scheduledFor: {
        type: Type.STRING,
        description: 'When this workout is planned for (e.g. "Next Thursday", "Tomorrow", "Today", "Saturday Long Session").',
      },
      durationMin: {
        type: Type.NUMBER,
        description: 'Total workout duration in minutes respecting work schedule availability.',
      },
      estimatedTss: {
        type: Type.NUMBER,
        description: 'Estimated Training Stress Score (TSS).',
      },
      intensity: {
        type: Type.STRING,
        description: 'Intensity level: "recovery", "aerobic_z2", "tempo_z3", "threshold_z4", or "vo2max_z5".',
      },
      targetPace: {
        type: Type.STRING,
        description: 'Target pace range (e.g. "3:32/km (17.0 km/h)").',
      },
      targetWatts: {
        type: Type.STRING,
        description: 'Target power range in Watts if cycling.',
      },
      targetHeartRate: {
        type: Type.STRING,
        description: 'Target heart rate range in bpm.',
      },
      progressionContext: {
        type: Type.STRING,
        description: 'Summary of how this progresses previous workouts and fits CTL ramp rate / weeks to race.',
      },
      coachRationale: {
        type: Type.STRING,
        description: '2-3 sentences explaining why this workout builds toward the athlete goals while respecting CTL ramp rate, work schedule, and injuries.',
      },
      warmupStep: {
        type: Type.STRING,
        description: 'Warm-up duration and description.',
      },
      mainSetStep: {
        type: Type.STRING,
        description: 'Main set intervals, reps, recovery rest, and exact target pace/watts.',
      },
      cooldownStep: {
        type: Type.STRING,
        description: 'Cool-down duration and description.',
      },
      nutritionTips: {
        type: Type.STRING,
        description: 'Fueling and hydration protocol.',
      },
    },
    required: ['title', 'sport', 'durationMin', 'estimatedTss', 'mainSetStep', 'coachRationale'],
  },
};

const evaluateTrainingPeriodDecl: FunctionDeclaration = {
  name: 'evaluate_training_period',
  description:
    'Generate a structured coaching evaluation scorecard for a previous session, today, current week, last week, or multi-week progression, judging whether it is helping meet the athlete race goals while accounting for CTL ramp rate and weeks until race.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      periodLabel: {
        type: Type.STRING,
        description: 'Label of the evaluated period (e.g. "Today\'s Training (Thu Nov 12)", "Current Week", "Last Week", "Last 2 Thursdays Progression").',
      },
      ratingScore: {
        type: Type.NUMBER,
        description: 'Rating out of 10 (e.g. 8.8).',
      },
      verdict: {
        type: Type.STRING,
        description: 'One of: "optimal_progression", "on_track", "overreaching", "under_stimulating", "recovery_needed".',
      },
      verdictLabel: {
        type: Type.STRING,
        description: 'Short human-readable verdict badge (e.g. "Optimal Progression Toward Goal", "On Track — Controlled Ramp").',
      },
      totalDurationMin: {
        type: Type.NUMBER,
        description: 'Total training duration in minutes during the evaluated period.',
      },
      totalTss: {
        type: Type.NUMBER,
        description: 'Total TSS accumulated during the evaluated period.',
      },
      goalAlignmentSummary: {
        type: Type.STRING,
        description: 'Assessment of how this training block helps meet upcoming A/B/C race goals given weeks remaining and CTL ramp rate.',
      },
      highlights: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: '2 to 4 key physiological highlights (including active interval pace/power vs diluted average).',
      },
      nextStepRecommendation: {
        type: Type.STRING,
        description: 'Concrete actionable adjustment for the next session or microcycle.',
      },
    },
    required: ['periodLabel', 'ratingScore', 'verdict', 'verdictLabel', 'goalAlignmentSummary', 'nextStepRecommendation'],
  },
};

const updateAthleteProfileDecl: FunctionDeclaration = {
  name: 'update_athlete_profile_or_constraints',
  description:
    'Update the athlete physiological thresholds (bikeFtp, thresholdHeartRateRun, thresholdPaceRunOutdoorSec, thresholdPaceRunTreadmillSec), log/update an injury, or note a work schedule change.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      bikeFtp: {
        type: Type.NUMBER,
        description: 'New cycling FTP in Watts if requested.',
      },
      thresholdHeartRateRun: {
        type: Type.NUMBER,
        description: 'New running LTHR in bpm if requested.',
      },
      thresholdPaceRunOutdoorSec: {
        type: Type.NUMBER,
        description: 'New outdoor run threshold pace in seconds per km.',
      },
      injuryArea: {
        type: Type.STRING,
        description: 'Body area if logging or updating an injury (e.g. "Left Calf", "Right Achilles").',
      },
      injurySeverity: {
        type: Type.STRING,
        description: 'Severity: "mild", "moderate", or "severe".',
      },
      injuryStatus: {
        type: Type.STRING,
        description: 'Status: "active", "recovering", or "resolved".',
      },
      injuryNotes: {
        type: Type.STRING,
        description: 'Sport modifications or notes for the injury.',
      },
      scheduleNote: {
        type: Type.STRING,
        description: 'Description of weekly work schedule update if requested.',
      },
    },
  },
};

const updateTrainingZonesDecl: FunctionDeclaration = {
  name: 'update_training_zones',
  description:
    'Update or propose changes to the athlete Heart Rate zones (Run/Bike/Swim), Pace zones (Outdoor Run/Treadmill Run/Swim), or Cycling Power zones (7-zone Coggan). For example, raising or lowering the Zone 2 upper HR limit based on cardiac drift, adjusting Zone 4 threshold bounds, or updating custom zone cutoffs.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      zoneDomain: {
        type: Type.STRING,
        description:
          'Which zone system to update: "hr_run", "hr_bike", "hr_swim", "pace_run_outdoor", "pace_run_treadmill", "pace_swim", or "power_bike".',
      },
      applyImmediately: {
        type: Type.BOOLEAN,
        description:
          'Set to true if the user explicitly commanded an immediate zone update; set to false (default) to propose the change with evidence and let the user Accept or Reject in the UI.',
      },
      z2MaxHr: {
        type: Type.NUMBER,
        description: 'New Zone 2 upper heart rate limit in bpm (e.g. raising from 135 to 138 bpm when >=3 steady runs show <5% drift).',
      },
      z3MaxHr: {
        type: Type.NUMBER,
        description: 'Optional new Zone 3 upper heart rate limit in bpm.',
      },
      z4MaxHr: {
        type: Type.NUMBER,
        description: 'Optional new Zone 4 (Threshold) upper heart rate limit in bpm.',
      },
      thresholdHeartRateRun: {
        type: Type.NUMBER,
        description: 'Optional updated Running LTHR in bpm.',
      },
      thresholdPaceRunOutdoorSec: {
        type: Type.NUMBER,
        description: 'Optional updated Outdoor Run Threshold Pace in seconds per km (e.g. 220 for 3:40/km).',
      },
      thresholdPaceRunTreadmillSec: {
        type: Type.NUMBER,
        description: 'Optional updated Treadmill Run Threshold Pace in seconds per km (e.g. 220 for 3:40/km).',
      },
      bikeFtp: {
        type: Type.NUMBER,
        description: 'Optional updated Cycling FTP in Watts.',
      },
      swimPoolPace100mSec: {
        type: Type.NUMBER,
        description: 'Optional updated Swim CSS Pace in seconds per 100m.',
      },
      reason: {
        type: Type.STRING,
        description: 'Physiological evidence summary (e.g. "Based on 4 steady runs >=40m with <5% Pa:HR decoupling").',
      },
    },
    required: ['zoneDomain'],
  },
};

const analyzeWorkoutDriftAndZonesDecl: FunctionDeclaration = {
  name: 'analyze_workout_drift_and_zones',
  description:
    'Analyze workout structure, lap length, settled work pace, late-rep HR plateau (last 30-60s), HR slope across reps, HR lag (60-90s), aerobic cardiac drift / decoupling (Speed/HR first half vs second half after dropping first 10 min on >=40 min runs), actual stream rest length vs planned rest, HR recovery (30s/60s), cadence, stride length, and 99th-percentile smoothed max HR to audit or calibrate custom HR/Pace/Power zones.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      targetActivityQuery: {
        type: Type.STRING,
        description: 'Optional specific workout or run to focus on (e.g. "18.7 km long run", "24 Oct", "8 x 1km", "4 x 9min", or "all recent runs").',
      },
      proposedZ2CeilingBpm: {
        type: Type.NUMBER,
        description: 'Optional recommended Zone 2 upper HR limit in bpm based on the >=3 steady runs <5% drift rule (e.g. 138).',
      },
    },
  },
};

const COACH_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  manageGoalRaceDecl,
  updateWorkoutCommentDecl,
  analyzeOrCalibrateWorkoutLapsDecl,
  prescribeUpcomingWorkoutDecl,
  evaluateTrainingPeriodDecl,
  updateAthleteProfileDecl,
  updateTrainingZonesDecl,
  analyzeWorkoutDriftAndZonesDecl,
];

// ============================================================================
// FALLBACK WORKOUT & PLAN GENERATORS
// ============================================================================

function generateFallbackWorkout(payload: any) {
  const profile = payload.athleteProfile || {};
  const ftp = Number(profile.bikeFtp) || 315;
  const lthr = Number(profile.thresholdHeartRateRun) || 168;
  const readiness = Number(payload.latestReadiness?.score ?? 80);
  const tsb = Number(payload.fitnessStats?.tsb ?? 0);
  const ctlRamp = Number(payload.fitnessStats?.ctlRampRate7d ?? 2.5);
  const preferred = payload.preferredSport;
  const todayAvail = payload.todayAvailability;
  const activeInjuries =
    payload.activeInjuries ||
    profile.injuries?.filter((i: any) => i.status === 'active' || i.status === 'recovering') ||
    [];

  const isFatigued = readiness < 65 || tsb < -15 || ctlRamp > 7.5;

  let durationMin = payload.targetDurationMin;
  if (!durationMin) {
    if (todayAvail?.isWorkday) {
      durationMin =
        todayAvail.availableWindows?.includes('lunch') && todayAvail.availableWindows.length === 1 ? 45 : 55;
    } else {
      durationMin = 90;
    }
  }

  let sport: 'swim' | 'bike' | 'run' | 'strength' | 'rest' | 'brick' = 'bike';
  if (preferred && preferred !== 'auto') {
    sport = preferred;
  } else if (payload.fitnessStats?.limitingFactor) {
    const lim = String(payload.fitnessStats.limitingFactor).toLowerCase();
    if (lim.includes('bike')) sport = 'bike';
    else if (lim.includes('run')) sport = 'run';
    else if (lim.includes('swim')) sport = 'swim';
  }

  const hasLegInjury = activeInjuries.some((inj: any) =>
    ['calf', 'achilles', 'knee', 'foot', 'ankle', 'hamstring'].some((a) =>
      String(inj.bodyArea || inj.area || '').toLowerCase().includes(a)
    )
  );
  if (hasLegInjury && (sport === 'run' || sport === 'brick')) {
    sport = 'bike';
  }

  const scheduleNote = todayAvail?.isWorkday
    ? `Scheduled for your ${todayAvail.availableWindows?.join('/') || 'evening'} window, respecting your ${todayAvail.shiftStart || '08:30'}-${todayAvail.shiftEnd || '17:00'} workday.`
    : 'Weekend non-workday: ample time for endurance volume.';

  const injuryNote =
    activeInjuries.length > 0
      ? `Respecting active status: ${activeInjuries.map((i: any) => `${i.name || i.area} (${i.sportModifications || i.notes || 'Low impact'})`).join('; ')}.`
      : undefined;

  if (isFatigued) {
    return {
      id: `rec_${Date.now()}`,
      title: sport === 'bike' ? 'Recovery Spin & Flush' : 'Aerobic Recovery Flush',
      sport: sport === 'run' ? 'run' : 'bike',
      durationMin: Math.min(45, durationMin),
      estimatedTss: 25,
      intensity: 'recovery',
      targetZones: {
        watts: sport === 'bike' ? `< ${Math.round(ftp * 0.55)}W (Zone 1 Active Recovery)` : undefined,
        heartRate: `< ${Math.round(lthr * 0.70)} bpm`,
        pace: sport === 'run' ? 'Easy conversational (+65s/km slower than threshold)' : undefined,
      },
      coachRationale: `Readiness is ${readiness}%, Form (TSB) is ${tsb}, and 7-day CTL ramp rate is ${ctlRamp >= 0 ? `+${ctlRamp}` : ctlRamp} pts/wk. Prioritizing parasympathetic recovery. ${scheduleNote}`,
      readinessAnalysis: 'Keeping intensity strictly in Zone 1 accelerates glycogen restoration and prevents overreaching.',
      structure: [
        { phase: 'Warm-up', duration: '10 min', description: 'Easy progressive warm-up.', target: `< ${Math.round(lthr * 0.65)} bpm` },
        { phase: 'Main Set', duration: `${Math.max(15, Math.min(25, durationMin - 20))} min`, description: 'Smooth Zone 1 flush with zero high-torque surges.', target: `< ${Math.round(lthr * 0.70)} bpm` },
        { phase: 'Cool-down', duration: '10 min', description: 'Easy cool-down & mobility.', target: 'Zone 1' },
      ],
      nutritionTips: '500ml water with electrolytes + 25g protein post-session.',
      injuryWarning: injuryNote,
      createdAt: new Date().toISOString(),
    };
  }

  if (sport === 'bike') {
    const ssLow = Math.round(ftp * 0.88);
    const ssHigh = Math.round(ftp * 0.93);
    const z2 = Math.round(ftp * 0.68);
    const mainMin = Math.max(30, durationMin - 22);
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
      },
      coachRationale: `Readiness is ${readiness}%, TSB is ${tsb}, and CTL ramp rate (${ctlRamp >= 0 ? `+${ctlRamp}` : ctlRamp} pts/wk) is in the safe build window. ${scheduleNote}`,
      readinessAnalysis: 'Balanced autonomic recovery supports sustained sweet spot work in the aero position.',
      structure: [
        { phase: 'Warm-up', duration: '12 min', description: `Build from ${Math.round(ftp * 0.55)}W to ${z2}W with 3 x 30s fast pedals.`, target: `${Math.round(ftp * 0.55)}-${z2}W` },
        { phase: 'Main Set', duration: `${mainMin} min`, description: `3 x 10-12 min @ ${ssLow}-${ssHigh}W in TT aero bars with 3 min spin recovery.`, target: `${ssLow}-${ssHigh}W` },
        { phase: 'Cool-down', duration: '10 min', description: 'Easy spin >90 RPM.', target: `< ${Math.round(ftp * 0.5)}W` },
      ],
      nutritionTips: '60g carbs/hr + 600ml electrolytes.',
      injuryWarning: injuryNote,
      createdAt: new Date().toISOString(),
    };
  }

  const outdoorSec = profile.thresholdPaceRunOutdoorSec || profile.runThresholdPaceSec || 232;
  const tempoPaceSec = Math.round(outdoorSec * 1.05);
  return {
    id: `rec_${Date.now()}`,
    title: 'Threshold Cruise Intervals',
    sport: 'run',
    durationMin,
    estimatedTss: Math.round(durationMin * 1.05),
    intensity: 'threshold_z4',
    targetZones: {
      heartRate: `${Math.round(lthr * 0.92)}-${Math.round(lthr * 0.98)} bpm`,
      pace: `${formatPaceSec(tempoPaceSec)}`,
    },
    coachRationale: `Readiness (${readiness}%) and CTL ramp rate (${ctlRamp >= 0 ? `+${ctlRamp}` : ctlRamp} pts/wk) support quality threshold progression toward your race goals. ${scheduleNote}`,
    readinessAnalysis: 'Biomechanical and autonomic metrics are green for threshold work.',
    structure: [
      { phase: 'Warm-up', duration: '12 min', description: 'Easy Zone 2 jog + 4 x 20s strides.', target: 'Zone 2' },
      { phase: 'Main Set', duration: `${Math.max(25, durationMin - 22)} min`, description: `4 x 6 min @ ${formatPaceSec(tempoPaceSec)} with 90s jog recovery.`, target: `${formatPaceSec(tempoPaceSec)}` },
      { phase: 'Cool-down', duration: '10 min', description: 'Easy jog flush.', target: 'Zone 1' },
    ],
    nutritionTips: '30g carbs pre-run; 25g protein + 60g carbs within 45 min post-run.',
    injuryWarning: injuryNote,
    createdAt: new Date().toISOString(),
  };
}

export async function handleRecommendWorkout(req: Request, res: Response) {
  const payload = req.body || {};
  const profile = payload.athleteProfile || {};
  const readiness = payload.latestReadiness || {};
  const fitness = payload.fitnessStats || {};
  const goals = payload.goals || [];
  const recentActivities = payload.recentActivitiesSummary || {};

  if (geminiAi) {
    try {
      const ftp = profile.bikeFtp || 315;
      const lthrRun = profile.thresholdHeartRateRun || 168;
      const outdoorPace = formatPaceSec(profile.thresholdPaceRunOutdoorSec || profile.runThresholdPaceSec || 232);
      const treadmillPace = formatPaceSec(profile.thresholdPaceRunTreadmillSec || 228);
      const activeInjuries =
        payload.activeInjuries ||
        (profile.injuries || []).filter((inj: any) => inj.status === 'active' || inj.status === 'recovering');
      const injuries =
        activeInjuries
          .map(
            (inj: any) =>
              `${inj.name || inj.area} (${inj.bodyArea || inj.area}): severity ${inj.severity || inj.painLevel || 'mild'}, modifications: ${inj.sportModifications || inj.notes || 'Avoid high impact'}`
          )
          .join('; ') || 'None logged';

      const periodizationPhase = payload.periodizationInfo?.phaseName || 'Progressive Build Block';
      const todayAvail = payload.todayAvailability;
      const scheduleContext = todayAvail
        ? `Is Workday: ${todayAvail.isWorkday ? 'YES' : 'NO'}, Shift: ${todayAvail.shiftStart || '08:30'} - ${todayAvail.shiftEnd || '17:00'}, Available Windows: ${(todayAvail.availableWindows || []).join(', ')}, Suggested Duration: ${payload.targetDurationMin || 55} min`
        : 'Standard availability';

      const goalsSummary =
        goals
          .map(
            (g: any) =>
              `${g.priority}-Goal: ${g.name} (${g.eventType}, ${g.distancePreset || g.totalDistanceKm + 'km'} on ${g.eventDate}${g.weeksToRace !== undefined ? `, ${g.weeksToRace} weeks away` : ''})`
          )
          .join('\n') || 'General triathlon endurance';

      const prompt = `You are an elite triathlon & endurance coach. Prescribe the single best workout for TODAY in JSON format.

ATHLETE THRESHOLDS & CONSTRAINTS:
- Bike FTP: ${ftp}W | Run LTHR: ${lthrRun} bpm | Outdoor Threshold Pace: ${outdoorPace} | Treadmill Threshold Pace: ${treadmillPace}
- Active Injuries: ${injuries}
- Today's Work Schedule: ${scheduleContext}
- Readiness: ${readiness.score ?? 80}% | CTL: ${fitness.ctl ?? 75} | ATL: ${fitness.atl ?? 70} | TSB: ${fitness.tsb ?? 5}
- 7-Day CTL Ramp Rate: ${fitness.ctlRampRate7d ?? 2.5} pts/week (${fitness.rampRateAssessment || 'Optimal'})
- Periodization Phase: ${periodizationPhase}
- Recent 14d Summary: ${recentActivities.totalLast14Days ?? 0} sessions (Current week: ${recentActivities.currentWeekTss ?? 0} TSS, Last week: ${recentActivities.lastWeekTss ?? 0} TSS)
- Goals:
${goalsSummary}
- Request: Preferred Sport=${payload.preferredSport || 'auto'}, Target Duration=${payload.targetDurationMin || 55} min, Notes=${payload.customNotes || 'none'}

Return ONLY valid JSON matching:
{
  "id": "rec_${Date.now()}",
  "title": "string",
  "sport": "swim" | "bike" | "run" | "strength" | "rest" | "brick",
  "durationMin": number,
  "estimatedTss": number,
  "intensity": "recovery" | "aerobic_z2" | "tempo_z3" | "threshold_z4" | "vo2max_z5",
  "targetZones": { "watts": "string", "heartRate": "string", "pace": "string" },
  "coachRationale": "string (mention readiness, CTL ramp rate, goal countdown, and work schedule fit)",
  "readinessAnalysis": "string",
  "structure": [
    { "phase": "Warm-up", "duration": "string", "description": "string", "target": "string" },
    { "phase": "Main Set", "duration": "string", "description": "string", "target": "string" },
    { "phase": "Cool-down", "duration": "string", "description": "string", "target": "string" }
  ],
  "nutritionTips": "string",
  "injuryWarning": "string"
}`;

      const response = await geminiAi.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      parsed.createdAt = new Date().toISOString();
      if (!parsed.id) parsed.id = `rec_${Date.now()}`;
      return res.json({ success: true, workout: parsed, source: GEMINI_MODEL });
    } catch (err: any) {
      console.warn('[Gemini Coach] Recommendation error, using fallback:', err?.message || err);
    }
  }

  const fallback = generateFallbackWorkout(payload);
  return res.json({
    success: true,
    workout: fallback,
    source: 'fallback-sports-science',
  });
}

export async function handleGeneratePlan(req: Request, res: Response) {
  const payload = req.body || {};
  const profile = payload.athleteProfile || {};
  const goals = payload.goals || [];
  const primaryGoal = goals.find((g: any) => g.priority === 'A') ||
    goals[0] || {
      name: 'Triathlon Endurance Milestone',
      distancePreset: 'Middle 70.3',
      eventDate: '2027-06-15',
    };

  const ctl = payload.fitnessStats?.ctl ?? 75;
  const ctlRamp = payload.fitnessStats?.ctlRampRate7d ?? 2.5;
  const weeklyAvailability = profile.weeklyAvailability || {};

  if (geminiAi) {
    try {
      const prompt = `You are a world-class triathlon & endurance coach. Generate a 1-Week Adaptive Training Microcycle leading toward the athlete's goal.
- Primary Goal: ${primaryGoal.name} (${primaryGoal.distancePreset || primaryGoal.totalDistanceKm + 'km'}) on ${primaryGoal.eventDate} (${primaryGoal.weeksToRace ?? 14} weeks away)
- Current CTL: ${ctl} | 7d CTL Ramp Rate: ${ctlRamp} pts/wk | Bike FTP: ${profile.bikeFtp || 315}W | Run LTHR: ${profile.thresholdHeartRateRun || 168} bpm
- Weekly Work Schedule:
${
  Object.entries(weeklyAvailability)
    .map(
      ([day, d]: [string, any]) =>
        `  ${day}: ${d.isWorkday ? `Workday (${d.shiftStart || '08:30'}-${d.shiftEnd || '17:00'})` : 'Day Off'}, windows: ${(d.availableWindows || []).join(', ')}`
    )
    .join('\n') || 'Standard weekly availability'
}
- Active Injuries: ${
        (payload.activeInjuries || [])
          .map((i: any) => `${i.name || i.area} (${i.sportModifications || i.notes || 'Modify impact'})`)
          .join('; ') || 'None'
      }

Return ONLY valid JSON matching:
{
  "id": "plan_${Date.now()}",
  "goalName": "${primaryGoal.name}",
  "targetRaceDate": "${primaryGoal.eventDate}",
  "weeksToGoal": ${primaryGoal.weeksToRace ?? 14},
  "summary": "string",
  "periodizationPhase": "string",
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
          "targetMetric": "string"
        }
      ]
    }
  ]
}`;

      const response = await geminiAi.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      parsed.createdAt = new Date().toISOString();
      return res.json({ success: true, plan: parsed, source: GEMINI_MODEL });
    } catch (err: any) {
      console.warn('[Gemini Coach Plan] Error, returning fallback plan:', err?.message || err);
    }
  }

  return res.json({
    success: true,
    plan: {
      id: `plan_${Date.now()}`,
      goalName: primaryGoal.name || 'Endurance Goal',
      targetRaceDate: primaryGoal.eventDate || '2027-04-18',
      weeksToGoal: primaryGoal.weeksToRace ?? 14,
      summary: 'Adaptive microcycle balancing threshold intervals, aerobic volume, work schedule windows, and CTL ramp rate.',
      periodizationPhase: 'Progressive Build',
      athleteStrengths: 'Consistent multi-sport frequency and high interval pacing discipline.',
      keyFocusAreas: [
        'Extend threshold interval time-on-tension at 3:32–3:40/km',
        'Sustained Zone 2 / Sweet Spot cycling power in aero bars',
        'Controlled weekly CTL ramp rate (+3 to +5 pts/week)',
      ],
      weeks: [],
      createdAt: new Date().toISOString(),
    },
    source: 'fallback-sports-science',
  });
}

// ============================================================================
// CONVERT GEMINI TOOL CALLS INTO EXECUTABLE FRONTEND COACH ACTIONS
// ============================================================================

function convertToolCallToCoachAction(
  fnName: string,
  args: Record<string, any>,
  acts: any[],
  goals: any[],
  curDate: string,
  fitnessStats: any,
  athleteProfile?: any,
  userQuestion = ''
): { action?: any; skillLabel: string } {
  switch (fnName) {
    case 'manage_goal_race': {
      const op = String(args.operation || 'propose_goal');
      const raceName = String(args.raceName || 'Goal Race').trim();
      const priority = args.priority ? (String(args.priority).toUpperCase() as 'A' | 'B' | 'C') : undefined;
      const distKm = Number(args.distanceKm) || 16.09;
      const targetTimeSec = args.targetTimeSec ? Number(args.targetTimeSec) : undefined;
      const eventDate = String(args.eventDate || '2027-03-07');
      const eventType = (args.eventType as any) || 'run';

      if (op === 'delete_goal') {
        const matched =
          (goals || []).find(
            (g: any) =>
              g.id === args.goalId ||
              String(g.name || '').toLowerCase().includes(raceName.toLowerCase()) ||
              raceName.toLowerCase().includes(String(g.name || '').toLowerCase())
          ) || (goals && goals[0]);
        if (matched) {
          return {
            skillLabel: 'Goal Race Manager',
            action: {
              type: 'delete_goal',
              goalId: matched.id,
              goalName: matched.name,
              description: `Removed "${matched.name}" from your race goals.`,
            },
          };
        }
      }

      if (op === 'update_goal') {
        const matched =
          (goals || []).find(
            (g: any) =>
              g.id === args.goalId ||
              String(g.name || '').toLowerCase().includes(raceName.toLowerCase()) ||
              raceName.toLowerCase().includes(String(g.name || '').toLowerCase())
          ) || (goals && goals[0]);
        if (matched) {
          const updates: Record<string, any> = {};
          if (priority) updates.priority = priority;
          if (targetTimeSec) updates.totalTargetTimeSec = targetTimeSec;
          if (args.eventDate) updates.eventDate = args.eventDate;
          if (args.notes) updates.notes = args.notes;
          return {
            skillLabel: 'Goal Race Manager',
            action: {
              type: 'update_goal',
              goalId: matched.id,
              goalName: matched.name,
              updates,
              description: `Updated "${matched.name}" goal settings.`,
            },
          };
        }
      }

      const goalObj: Record<string, any> = {
        id: `goal-${raceName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${eventDate.slice(0, 4)}`,
        name: raceName,
        priority: priority || 'B',
        eventType,
        status: 'upcoming',
        targetType: targetTimeSec ? 'time' : 'finish',
        eventDate,
        distancePreset: args.distancePreset || `${distKm} km`,
        totalDistanceKm: distKm,
        totalTargetTimeSec: targetTimeSec,
        runCourseType: args.courseType || 'road',
        runElevationGainMeters: args.elevationGainM ? Number(args.elevationGainM) : undefined,
        runTargetPaceSec: targetTimeSec && distKm > 0 ? Math.round(targetTimeSec / distKm) : undefined,
        location: args.location || '',
        notes: args.notes || '',
      };

      if (op === 'propose_goal' || !priority) {
        return {
          skillLabel: 'Online Race Search & Goal Manager',
          action: {
            type: 'propose_goal',
            status: 'pending_priority',
            goal: goalObj,
            missingFields: ['priority'],
            suggestedPriorities: ['A', 'B', 'C'],
            searchResult: {
              eventName: raceName,
              foundDate: eventDate,
              sourceTitle: `${raceName} (${eventDate})`,
            },
            description: `Found ${raceName} on ${eventDate} (${distKm} km). Select Priority A, B, or C to save to your Goals.`,
          },
        };
      }

      return {
        skillLabel: 'Online Race Search & Goal Manager',
        action: {
          type: 'add_goal',
          status: 'confirmed',
          goal: goalObj,
          description: `Added "${raceName}" (${eventDate}) as a Priority ${priority} Goal.`,
        },
      };
    }

    case 'update_workout_comment_or_metadata': {
      const queryStr = String(args.activityQueryOrName || '');
      const targetAct = findBestMatchingActivity(queryStr, acts, curDate) || acts[0];
      if (!targetAct) return { skillLabel: 'Workout Comment Editor' };

      return {
        skillLabel: 'Workout Comment & Note Editor',
        action: {
          type: 'update_workout_comment',
          status: 'applied',
          activityId: targetAct.id,
          activityName: targetAct.name,
          activityDate: targetAct.startDate,
          commentOrDescription: String(args.commentOrDescription || '').trim(),
          newTitle: args.newTitle ? String(args.newTitle).trim() : undefined,
          rpe: typeof args.rpe === 'number' ? args.rpe : undefined,
          appendToExisting: args.appendToExisting !== false,
          description: `Saved coach comment/description on "${targetAct.name}" (${targetAct.startDate}).`,
        },
      };
    }

    case 'analyze_or_recalibrate_workout_laps': {
      const queryStr = `${args.activityQueryOrName || ''} ${args.adjustmentInstruction || ''}`.trim();
      const targetAct = findBestMatchingActivity(queryStr, acts, curDate) || acts[0];
      if (!targetAct) return { skillLabel: 'Lap & Stream Analyzer' };

      const recon = reconstructWorkoutFromQuery(queryStr, targetAct, curDate);
      return {
        skillLabel: 'Lap & Stream Calibrator',
        action: {
          type: 'recreate_run_workout',
          status: 'ready_to_apply',
          activityId: targetAct.id,
          activityName: targetAct.name,
          activityDate: targetAct.startDate,
          recordedDurationSec: recon.recordedDurationSec,
          originalDistanceM: targetAct.distanceM || Math.round((targetAct.distanceKm || 7.5) * 1000),
          originalPace: targetAct.paceFormatted || '4:35/km',
          targetIntervalPace: recon.targetIntervalPace,
          targetIntervalSpeedKph: recon.targetIntervalSpeedKph,
          recoveryPace: recon.recoveryPace,
          recoverySpeedKph: recon.recoverySpeedKph,
          timeDiscrepancySec: recon.timeDiscrepancySec,
          sections: recon.sections,
          recalculatedDistanceM: recon.recalculatedDistanceM,
          recalculatedAvgPace: recon.recalculatedAvgPace,
          description: recon.description,
        },
      };
    }

    case 'prescribe_upcoming_workout': {
      const sportRaw = String(args.sport || 'run').toLowerCase();
      const sport = (['swim', 'bike', 'run', 'strength', 'rest', 'brick'].includes(sportRaw) ? sportRaw : 'run') as any;
      const workout = {
        id: `coach_presc_${Date.now()}`,
        title: String(args.title || 'Structured Progression Session'),
        sport,
        durationMin: Number(args.durationMin) || 55,
        estimatedTss: Number(args.estimatedTss) || 65,
        intensity: (args.intensity || 'threshold_z4') as any,
        targetZones: {
          pace: args.targetPace ? String(args.targetPace) : undefined,
          watts: args.targetWatts ? String(args.targetWatts) : undefined,
          heartRate: args.targetHeartRate ? String(args.targetHeartRate) : undefined,
        },
        coachRationale: String(args.coachRationale || 'Structured progression aligned with your race goals and CTL ramp rate.'),
        readinessAnalysis: String(
          args.progressionContext ||
            `Calibrated for CTL ${fitnessStats?.ctl ?? 75} (7d ramp: ${fitnessStats?.ctlRampRate7d ?? '+2.5'} CTL/wk).`
        ),
        structure: [
          {
            phase: 'Warm-up',
            duration: '10–12 min',
            description: String(args.warmupStep || 'Progressive aerobic warm-up + 4 x 20s strides'),
            target: 'Zone 1–2',
          },
          {
            phase: 'Main Set',
            duration: `${Math.max(20, (Number(args.durationMin) || 55) - 20)} min`,
            description: String(args.mainSetStep || 'Structured threshold/VO2 intervals'),
            target: String(args.targetPace || args.targetWatts || args.targetHeartRate || 'Threshold'),
          },
          {
            phase: 'Cool-down',
            duration: '8–10 min',
            description: String(args.cooldownStep || 'Easy Zone 1 recovery flush'),
            target: 'Zone 1 (<128 bpm)',
          },
        ],
        nutritionTips: args.nutritionTips ? String(args.nutritionTips) : 'Hydrate with electrolytes; 25g protein + 60g carbs post-session.',
        createdAt: new Date().toISOString(),
      };

      return {
        skillLabel: 'Upcoming Workout Planner',
        action: {
          type: 'prescribe_workout',
          status: 'proposed',
          workout,
          scheduledFor: args.scheduledFor ? String(args.scheduledFor) : 'Upcoming Key Session',
          progressionContext: args.progressionContext ? String(args.progressionContext) : undefined,
          description: `Prescribed "${workout.title}" (${workout.durationMin} min, ~${workout.estimatedTss} TSS).`,
        },
      };
    }

    case 'evaluate_training_period': {
      const primaryGoal = (goals || []).find((g: any) => g.priority === 'A') || (goals || [])[0];
      return {
        skillLabel: 'Training & Goal Alignment Evaluator',
        action: {
          type: 'evaluate_training',
          periodLabel: String(args.periodLabel || 'Training Evaluation'),
          ratingScore: Number(args.ratingScore) || 8.5,
          verdict: (args.verdict as any) || 'on_track',
          verdictLabel: String(args.verdictLabel || 'On Track Toward Goal'),
          totalDurationMin: Number(args.totalDurationMin) || 0,
          totalTss: Number(args.totalTss) || 0,
          ctlRampRatePtsPerWeek: fitnessStats?.ctlRampRate7d,
          weeksToPrimaryGoal: primaryGoal?.weeksToRace,
          primaryGoalName: primaryGoal?.name,
          goalAlignmentSummary: String(args.goalAlignmentSummary || ''),
          highlights: Array.isArray(args.highlights) ? args.highlights.map(String) : [],
          nextStepRecommendation: String(args.nextStepRecommendation || ''),
          description: `Evaluated ${args.periodLabel || 'training period'}: ${args.ratingScore || 8.5}/10 (${args.verdictLabel || 'On Track'}).`,
        },
      };
    }

    case 'update_athlete_profile_or_constraints': {
      const updates: Record<string, any> = {};
      if (args.bikeFtp) updates.bikeFtp = Number(args.bikeFtp);
      if (args.thresholdHeartRateRun) {
        updates.thresholdHeartRateRun = Number(args.thresholdHeartRateRun);
        updates.runThresholdHr = Number(args.thresholdHeartRateRun);
      }
      if (args.thresholdPaceRunOutdoorSec) {
        updates.thresholdPaceRunOutdoorSec = Number(args.thresholdPaceRunOutdoorSec);
        updates.runThresholdPaceSec = Number(args.thresholdPaceRunOutdoorSec);
      }
      const injuryAddedOrUpdated = args.injuryArea
        ? {
            area: String(args.injuryArea),
            severity: (args.injurySeverity || 'mild') as 'mild' | 'moderate' | 'severe',
            status: (args.injuryStatus || 'active') as 'active' | 'recovering' | 'resolved',
            notes: args.injuryNotes ? String(args.injuryNotes) : undefined,
          }
        : undefined;

      return {
        skillLabel: 'Profile, Injury & Schedule Manager',
        action: {
          type: 'update_athlete_profile',
          status: 'applied',
          updates: Object.keys(updates).length > 0 ? updates : undefined,
          injuryAddedOrUpdated,
          scheduleUpdated: args.scheduleNote ? String(args.scheduleNote) : undefined,
          description: injuryAddedOrUpdated
            ? `Logged/updated injury constraint: ${injuryAddedOrUpdated.area} (${injuryAddedOrUpdated.status}).`
            : `Updated athlete profile parameters.`,
        },
      };
    }

    case 'update_training_zones': {
      const profile = { ...DEFAULT_ATHLETE_PROFILE, ...(athleteProfile || {}) };
      const zoneAction = buildCustomZoneUpdateAction(profile, {
        zoneDomain: (args.zoneDomain as any) || 'hr_run',
        applyImmediately: Boolean(args.applyImmediately),
        z2MaxHr: args.z2MaxHr ? Number(args.z2MaxHr) : undefined,
        z3MaxHr: args.z3MaxHr ? Number(args.z3MaxHr) : undefined,
        z4MaxHr: args.z4MaxHr ? Number(args.z4MaxHr) : undefined,
        thresholdHeartRateRun: args.thresholdHeartRateRun ? Number(args.thresholdHeartRateRun) : undefined,
        thresholdPaceRunOutdoorSec: args.thresholdPaceRunOutdoorSec ? Number(args.thresholdPaceRunOutdoorSec) : undefined,
        thresholdPaceRunTreadmillSec: args.thresholdPaceRunTreadmillSec ? Number(args.thresholdPaceRunTreadmillSec) : undefined,
        bikeFtp: args.bikeFtp ? Number(args.bikeFtp) : undefined,
        swimPoolPace100mSec: args.swimPoolPace100mSec ? Number(args.swimPoolPace100mSec) : undefined,
        reason: args.reason ? String(args.reason) : undefined,
      });
      return {
        skillLabel: 'HR / Pace / Power Zone Calibrator',
        action: zoneAction,
      };
    }

    case 'analyze_workout_drift_and_zones': {
      const profile = { ...DEFAULT_ATHLETE_PROFILE, ...(athleteProfile || {}) };
      const rawActivitiesForEngine = acts.map((a: any) => ({
        id: a.id,
        name: a.name,
        sport_type: a.sport || 'Run',
        start_date: a.startDate,
        start_date_local: a.startDate,
        distance: a.distanceM || Math.round((a.distanceKm || 0) * 1000),
        moving_time: a.movingTimeSec || Math.round((a.movingTimeMin || 0) * 60),
        average_heartrate: a.avgHeartrate,
        max_heartrate: a.maxHeartrate,
        average_cadence: a.avgCadence,
        trainer: a.isIndoor,
      }));
      const driftAction = buildWorkoutDriftAndZoneAnalysis(
        profile,
        rawActivitiesForEngine as any,
        {},
        `${userQuestion} ${args.targetActivityQuery || ''}`
      );
      if (args.proposedZ2CeilingBpm && Number(args.proposedZ2CeilingBpm) >= 115) {
        driftAction.recommendedZ2CeilingBpm = Number(args.proposedZ2CeilingBpm);
      }
      return {
        skillLabel: 'Cardiac Drift & Custom Zone Analyzer',
        action: driftAction,
      };
    }

    default:
      return { skillLabel: fnName };
  }
}

// ============================================================================
// MAIN CHAT HANDLER (GEMINI 4 HYDROGEN + HYBRID SEARCH & FUNCTION SKILLS)
// ============================================================================

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
    todayAvailability,
    activeInjuries,
    periodizationInfo,
    recentActivitiesSummary,
  } = req.body || {};

  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  const curDate = todayDate || new Date().toISOString().split('T')[0];
  const curDay = todayDayOfWeek || new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const rawActs: any[] = Array.isArray(activities) ? activities : [];

  // Ensure every activity has interval/lap structure insights
  const acts = rawActs.map((a) => {
    if (a.workoutClassification && (a.intervalStructureSummary || a.activeWorkSummary)) {
      return a;
    }
    const insight = analyzeActivityStructureAndLaps(a, undefined, athleteProfile);
    return {
      ...a,
      ...insight,
    };
  });

  // Group Thursday run workouts by DISTINCT calendar dates so we pick the primary structured workout on each Thursday
  // and never confuse a same-day Cooldown or Recovery jog with the main interval workout!
  const thursdayRunGroups = getStructuredWorkoutsByDayOfWeek(acts, 'Thursday', 'run');

  let thursdayRunsCohort = 'No specific Thursday run workouts found in recent records.';
  if (thursdayRunGroups.length >= 2) {
    const g1 = thursdayRunGroups[0]; // Most recent Thursday (e.g. 2026-11-12)
    const g2 = thursdayRunGroups[1]; // Preceding Thursday (e.g. 2026-11-05)
    const r1 = g1.primaryWorkout;
    const r2 = g2.primaryWorkout;
    const sec1 =
      g1.secondaryWorkouts.length > 0
        ? ` (Also logged on ${g1.date} as separate easy/secondary session: ${g1.secondaryWorkouts.map((s: any) => `"${s.name}" ${s.distanceKm}km @ ${s.paceFormatted || 'easy'}`).join(', ')} — DO NOT confuse this cooldown/recovery jog with the main structured workout!)`
        : '';
    const sec2 =
      g2.secondaryWorkouts.length > 0
        ? ` (Also logged on ${g2.date} as separate easy/secondary session: ${g2.secondaryWorkouts.map((s: any) => `"${s.name}" ${s.distanceKm}km @ ${s.paceFormatted || 'easy'}`).join(', ')} — DO NOT confuse this recovery run with the main structured workout!)`
        : '';

    thursdayRunsCohort = `1. MOST RECENT THURSDAY (${g1.date}, ${r1.daysAgo} days ago) — PRIMARY STRUCTURED WORKOUT:
   • Title: "${r1.name}" | Total Distance: ${r1.distanceKm} km | Total Moving Time: ${r1.movingTimeMin} min | Diluted Overall Avg Pace: ${r1.paceFormatted || 'N/A'} | Avg HR: ${r1.avgHeartrate || 'N/A'} bpm (Max HR: ${r1.maxHeartrate || 'N/A'} bpm) | TSS: ${r1.tss || 'N/A'}
   • ACTIVE INTERVAL SPEC (CRITICAL): ${r1.intervalStructureSummary || r1.name}
   • ACTIVE WORK vs OVERALL AVERAGE: ${r1.activeWorkSummary || 'Overall average pace includes warm-up, rest intervals, and cool-down.'}${sec1}

2. PRECEDING THURSDAY (${g2.date}, ${r2.daysAgo} days ago) — PRIMARY STRUCTURED WORKOUT:
   • Title: "${r2.name}" | Total Distance: ${r2.distanceKm} km | Total Moving Time: ${r2.movingTimeMin} min | Diluted Overall Avg Pace: ${r2.paceFormatted || 'N/A'} | Avg HR: ${r2.avgHeartrate || 'N/A'} bpm (Max HR: ${r2.maxHeartrate || 'N/A'} bpm) | TSS: ${r2.tss || 'N/A'}
   • ACTIVE INTERVAL SPEC (CRITICAL): ${r2.intervalStructureSummary || r2.name}
   • ACTIVE WORK vs OVERALL AVERAGE: ${r2.activeWorkSummary || 'Overall average pace includes warm-up, rest intervals, and cool-down.'}${sec2}`;
  } else if (thursdayRunGroups.length === 1) {
    const g1 = thursdayRunGroups[0];
    const r1 = g1.primaryWorkout;
    thursdayRunsCohort = `Single Thursday found (${g1.date}): Primary workout "${r1.name}" (${r1.distanceKm} km, ${r1.movingTimeMin} min, Active Spec: ${r1.intervalStructureSummary || r1.paceFormatted}).`;
  }

  // Chronological activity log with explicit interval structure & active work breakdown
  const activitiesLog =
    acts
      .slice(0, 35)
      .map((a) => {
        const indoorTag = a.isIndoor ? ' [Indoor/Treadmill]' : '';
        const typeTag = a.workoutClassification ? ` [${a.workoutClassification.toUpperCase()}]` : '';
        const paceOrSpeed = a.paceFormatted
          ? `, Overall Avg Pace: ${a.paceFormatted}`
          : a.speedKmh
            ? `, Speed: ${a.speedKmh} km/h`
            : '';
        const intervalSpec = a.intervalStructureSummary ? ` | ACTIVE WORKOUT STRUCTURE: ${a.intervalStructureSummary}` : '';
        const activeDetail = a.activeWorkSummary ? ` (${a.activeWorkSummary})` : '';
        const wattsStr = a.avgWatts ? `, Avg Power: ${a.avgWatts}W${a.weightedAvgWatts ? ` (NP: ${a.weightedAvgWatts}W)` : ''}` : '';
        const hrStr = a.avgHeartrate ? `, Avg HR: ${a.avgHeartrate} bpm` : '';
        const maxHrStr = a.maxHeartrate ? `, Max HR: ${a.maxHeartrate} bpm` : '';
        const tssStr = a.tss ? `, TSS: ${a.tss}` : '';
        const descStr = a.description || a.notes ? ` | Saved Note/Description: "${a.description || a.notes}"` : '';
        const daysLabel = a.daysAgo === 0 ? 'TODAY' : a.daysAgo === 1 ? 'YESTERDAY' : `${a.daysAgo}d ago`;
        return `• ID:${a.id} | ${a.dayOfWeek}, ${a.startDate} (${daysLabel}) - ${a.sport}${indoorTag}${typeTag}: "${a.name}" | ${a.distanceKm} km, ${a.movingTimeMin} min${paceOrSpeed}${intervalSpec}${activeDetail}${wattsStr}${hrStr}${maxHrStr}${tssStr}${descStr}`;
      })
      .join('\n') || 'No individual activities logged.';

  const todayActs = acts.filter((a) => a.startDate === curDate || a.daysAgo === 0);
  const todayCohort =
    todayActs.length > 0
      ? todayActs
          .map(
            (a) =>
              `• "${a.name}" (${a.sport}, ${a.workoutClassification || 'session'}): ${a.distanceKm} km in ${a.movingTimeMin} min | Overall Avg: ${a.paceFormatted || (a.speedKmh ? a.speedKmh + ' km/h' : 'N/A')}${a.intervalStructureSummary ? ` | Active Structure: ${a.intervalStructureSummary}` : ''} | Avg HR: ${a.avgHeartrate || 'N/A'} bpm (Max ${a.maxHeartrate || 'N/A'}) | TSS: ${a.tss || 'N/A'}`
          )
          .join('\n')
      : 'No workouts completed on this date yet.';

  if (geminiAi) {
    try {
      const ftp = athleteProfile?.bikeFtp || 315;
      const lthr = athleteProfile?.thresholdHeartRateRun || 168;
      const outdoorPace = formatPaceSec(athleteProfile?.thresholdPaceRunOutdoorSec || athleteProfile?.runThresholdPaceSec || 232);
      const treadmillPace = formatPaceSec(athleteProfile?.thresholdPaceRunTreadmillSec || 228);
      const rawInjuries = activeInjuries || athleteProfile?.injuries || [];
      const injuriesSummary =
        rawInjuries
          .map(
            (i: any) =>
              `• ${i.name || i.area} (${i.bodyArea || i.area}, status: ${i.status || 'active'}, severity: ${i.severity || i.painLevel || 'mild'}): ${i.sportModifications || i.notes || 'Modify high impact'}`
          )
          .join('\n') || 'No active injuries logged.';

      const availabilitySummary =
        Object.entries(athleteProfile?.weeklyAvailability || {})
          .map(
            ([day, d]: [string, any]) =>
              `• ${day.toUpperCase()}: ${d.isWorkday ? `Workday (Shift: ${d.shiftStart || '08:30'}-${d.shiftEnd || '17:00'})` : 'Off-day'} | Windows: ${(d.availableWindows || []).join(', ')} | Preferred: ${(d.preferredActivities || []).join(', ') || 'Any'}`
          )
          .join('\n') || 'Standard weekly availability.';

      const goalsDetailed =
        (goals || [])
          .map((g: any) => {
            const wks =
              g.weeksToRace !== undefined
                ? `${g.weeksToRace} weeks away`
                : g.eventDate
                  ? `${Math.max(0, Math.round((new Date(g.eventDate).getTime() - new Date(curDate).getTime()) / (7 * 24 * 3600 * 1000)))} weeks away`
                  : 'date TBD';
            return `• ID: "${g.id}" | ${g.priority}-Goal: "${g.name}" | Sport: ${g.eventType || 'run'} | Date: ${g.eventDate} (${wks}) | Distance: ${g.distancePreset || g.totalDistanceKm + 'km'} | Target: ${g.totalTargetTimeSec ? Math.floor(g.totalTargetTimeSec / 3600) + 'h ' + Math.floor((g.totalTargetTimeSec % 3600) / 60) + 'm' : g.targetType || 'finish'}`;
          })
          .join('\n') || 'No individual goals currently saved.';

      const systemInstruction = `You are Coach Gemini, an intelligent, unscripted, conversational endurance coach and exercise physiologist.

CRITICAL ANTI-SCRIPTING & CONVERSATIONAL RULES:
1. BE GENUINELY CONVERSATIONAL & UNSCRIPTED:
   - Answer the user's exact question directly and naturally.
   - If the user asks a simple or general question (e.g. "What is 3+3", "Hello", or a quick math/physiology question), answer it directly and concisely (e.g. "3 + 3 is **6**!") without dumping an unsolicited wall of FTP/LTHR/TSB boilerplate!
   - NEVER output canned "Ironman Macro Goals vs Precision Sub-Goals" boilerplate when the user is asking to add a specific race (like "Can you add Seven Sins to my Goals")!

2. INTERVAL PACE / POWER vs DILUTED OVERALL WORKOUT AVERAGE (CRITICAL):
   - In structured interval workouts (like "8 x 1km @ 3:32/km 70s rest" or "8 x 3min treadmill 17kph 3:32/km 70sec rest"), the overall activity average pace (e.g., 4:29/km or 4:35/km) includes the warm-up, recovery rest periods (e.g. 8 x 70s rest), and cool-down.
   - ALWAYS analyze and compare structured workouts based on their ACTIVE INTERVAL PACE/SPEED/POWER (e.g. 8 x 1km @ 3:32/km [17.0 km/h] = 8.0 km / 28m 16s of active interval work vs the previous Thursday's 8 x 3min @ 17.0 km/h [3:32/km] = 6.8 km / 24m 00s of active interval work), and explicitly point out that the 4:29/km or 4:35/km overall average is diluted by warm-up and rest intervals.
   - When the user asks about "the last 2 Thursdays" (or any multi-day comparison), compare the PRIMARY STRUCTURED WORKOUTS from the two distinct Thursdays (e.g. Thursday Nov 12 "8 x 1km @ 3:32/km 70s rest" vs Thursday Nov 5 "8 x 3min treadmill 17kph 3:32/km 70sec rest"). Ignore or briefly set aside easy secondary sessions done on the same day (such as the "Cooldown" 6.05 km run on Nov 12 or the "Recovery" 5.26 km run on Nov 5).

3. USE YOUR COACHING SKILLS (TOOLS) PROACTIVELY:
   - Skill 1 (Search Online & Add Goal Races): When the athlete asks to add a race (e.g., "Can you add Seven Sins to my Goals", "Add Chippenham 10 mile", etc.), use Google Search to find the real race details (e.g., Seven Sins Trail Run in the Forest of Dean, Gloucestershire — 7 miles / 11.3 km with 7 steep hills in late December) AND invoke \`manage_goal_race\`.
   - Skill 2 (Deduce Workout Type & Calibrate Laps): Use the lap/interval breakdown provided in the activity log to identify whether a session was VO2max/Threshold Intervals, Tempo, Long Endurance, or Easy/Cooldown. If the athlete asks to fix/recalibrate treadmill speeds or laps, invoke \`analyze_or_recalibrate_workout_laps\`.
   - Skill 3 (Add Comments or Descriptions to Workouts): When the athlete asks to add a comment, note, description, or RPE to a workout, invoke \`update_workout_comment_or_metadata\`.
   - Skill 4 (Plan / Prescribe Upcoming Workouts): When the athlete asks what workout to do next, how to progress a workout (including progressing their Thursday runs), or to plan an upcoming session, invoke \`prescribe_upcoming_workout\` so an interactive workout prescription card is rendered in chat.
   - Skill 5 (Evaluate Previous Session / Day / Current Week / Last Week): When the athlete asks you to evaluate/review their previous session, today's training, current week, or last week's training to judge if it is helping meet their goals, invoke \`evaluate_training_period\` and factor in weeks until race + CTL ramp rate.
   - Skill 6 (Update Profile, Injuries, or Work Schedule): If the athlete reports a new injury, updates a threshold (FTP/LTHR/Pace), or mentions a work schedule change, invoke \`update_athlete_profile_or_constraints\`.
   - Skill 7 (Update HR, Pace, or Power Zones — Selective Per-Zone Confidence): When the athlete asks to update, raise, lower, or calibrate their Heart Rate zones (Run/Bike/Swim), Pace zones (Outdoor/Treadmill/Swim), or Power zones (Bike), invoke \`update_training_zones\`. When confidence is high in one zone (such as Zone 2 upper bound at 135 -> 138 bpm from 5 steady runs) but lower in others (Z1, Z3, Z4, Z5), default to adjusting ONLY the high-confidence zone (e.g. raising only the Zone 2 upper bound from 135 to 138 bpm and shifting Z3's floor from 136 to 139 bpm to stay contiguous) while leaving all other zone ceilings untouched. Point out that the athlete can toggle checkboxes per zone in the UI card to choose which zones to adjust vs leave alone.
   - Skill 8 (Analyse Workout Structure, Lap Length, GAP Pace, HR, Cadence, Stream Rest & Cardiac Drift): Whenever the athlete asks about cardiac drift, Grade Adjusted Pace (GAP), decoupling, custom zone metrics, Zone 2 ceiling calibration, or selective zone confidence, invoke \`analyze_workout_drift_and_zones\` and apply these exact physiological principles:
     * **Grade Adjusted Pace (GAP) as the True Stimulus on Outdoor & Inclined Runs**: Yes—for outdoor runs (and inclined treadmill sessions like 0.5% on 4x9 min), cardiac drift and threshold calculations MUST use **Grade Adjusted Pace (GAP)** via Minetti's metabolic cost of grade polynomial rather than raw unadjusted pace. On undulating outdoor routes (e.g., 31 Oct 16.41 km +118m elev: 5:03/km raw -> 4:55/km GAP; 18 Oct 19.40 km +140m elev: 4:58/km raw -> 4:49/km GAP; 11 Oct 16.10 km +115m elev: 5:04/km raw -> 4:56/km GAP), raw pace slows on second-half hills and creates false apparent drift (4.6% raw vs **2.7% true GAP:HR drift** on Oct 31). On flat 0% treadmill runs, GAP equals raw belt speed.
     * **Pace (GAP) is the Stimulus; HR is the Response**: Extract settled work-only pace (and GAP) per rep, excluding the first 20–30s while speed settles. Drop whole-session average pace and single-point max HR per rep—both are noisy and mislead.
     * **Late-Rep HR Plateau (Last 30–60s) & HR Slope Across Reps**: HR lags 60–90 seconds, so 3-min reps (like 8x3 min at 147 bpm avg) underread effort. Use end-of-rep HR (last 30–60s) on >=4–9 min reps (like 4x9 min @ 3:42/km at 0.5% incline = **3:38/km GAP**, where HR plateaued flat at 151–155 bpm).
     * **Actual Stream Rest Length vs Planned Rest & Rep-Start HR**: Measure actual rest from the stream (e.g. "70s" planned rests on 8x3m / 8x1km were closer to 60–61s in the stream). A rep starting at a higher HR after a shortened rest shows incomplete recovery, NOT that the pace is too hard.
     * **Aerobic Ceiling (Z2 Upper Limit) from GAP:HR Cardiac Drift & Selective Zone Confidence**: Take steady runs >= 40 min, drop the first 10 minutes, and compute Efficiency Factor (GAP Speed ÷ HR) for the 1st half vs 2nd half (<5% decoupling is aerobic). When confidence is high for Zone 2 (5 steady runs >=40m with 1.6%–3.1% GAP:HR drift) but lower for other zones (only 1 long-rep threshold session for Z4, no dedicated Z1/Z3/Z5 lab ramp), recommend **raising ONLY the Zone 2 upper bound (135 -> 138 bpm)** and leaving Z1, Z3, Z4, and Z5 ceilings untouched—while letting the user toggle individual zones in the interactive card.

4. ALWAYS RESPECT:
   - Weeks until upcoming Goal Races & Race Priority (A/B/C)
   - Chronic Training Load (CTL: ${fitnessStats?.ctl ?? 75}), Form (TSB: ${fitnessStats?.tsb ?? 5}), and 7-day CTL Ramp Rate (${fitnessStats?.ctlRampRate7d ?? 2.5} CTL pts/week — ${fitnessStats?.rampRateAssessment || 'Optimal'})
   - Current Week Load (${recentActivitiesSummary?.currentWeekTss ?? 0} TSS, ${recentActivitiesSummary?.currentWeekHours ?? 0}h) vs Last Week Load (${recentActivitiesSummary?.lastWeekTss ?? 0} TSS, ${recentActivitiesSummary?.lastWeekHours ?? 0}h)
   - Weekly Work Schedule & Shift Windows
   - Active Injuries & Limitations

ATHLETE CONTEXT SNAPSHOT:
- Today's Reference Date: ${curDay}, ${curDate}
- Thresholds: Bike FTP ${ftp}W | Run LTHR ${lthr} bpm | Outdoor Run LTP ${outdoorPace} | Treadmill LTP ${treadmillPace}
- Readiness: ${latestReadiness?.score ?? 80}% (${latestReadiness?.status || 'Normal'})
- Fitness & Ramp Rate: CTL ${fitnessStats?.ctl ?? 75} (Swim CTL: ${fitnessStats?.swimCtl ?? 'N/A'}, Bike CTL: ${fitnessStats?.bikeCtl ?? 'N/A'}, Run CTL: ${fitnessStats?.runCtl ?? 'N/A'}) | ATL ${fitnessStats?.atl ?? 70} | TSB ${fitnessStats?.tsb ?? 5} | 7d CTL Ramp Rate: ${fitnessStats?.ctlRampRate7d ?? 2.5} pts/wk | 28d Avg Ramp: ${fitnessStats?.ctlRampRate28dAvg ?? 2.0} pts/wk
- Periodization: ${periodizationInfo?.phaseName || athleteProfile?.periodization || '4weeks'}

UPCOMING GOAL RACES:
${goalsDetailed}

ACTIVE INJURIES:
${injuriesSummary}

WEEKLY WORK SCHEDULE & AVAILABILITY:
${availabilitySummary}

TODAY'S LOGGED WORKOUTS (${curDay}, ${curDate}):
${todayCohort}

STRUCTURED RUN WORKOUTS FROM THE LAST 2 THURSDAYS (Grouped by distinct Thursday dates, separating primary interval session from secondary easy/cooldown jogs):
${thursdayRunsCohort}

RECENT ACTIVITY LOG (Newest first, with deduced interval structures):
${activitiesLog}`;

      // Build multi-turn conversation history
      const recentHistory = Array.isArray(history) ? history.slice(-8) : [];
      const contents: any[] = [];
      for (const msg of recentHistory) {
        if (!msg || !msg.content) continue;
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: String(msg.content) }],
        });
      }
      contents.push({
        role: 'user',
        parts: [{ text: String(question) }],
      });

      const response = await geminiAi.models.generateContent({
        model: GEMINI_MODEL,
        contents,
        config: {
          systemInstruction,
          tools: [
            { googleSearch: {} },
            { functionDeclarations: COACH_FUNCTION_DECLARATIONS },
          ],
          toolConfig: {
            includeServerSideToolInvocations: true,
          } as any,
        },
      });

      const executedActions: any[] = [];
      const skillsUsed: string[] = [];

      // Check if Gemini invoked any Coaching Skill Function Calls
      const fnCalls = response.functionCalls || [];
      if (fnCalls.length > 0) {
        const fnResponseParts: any[] = [];
        for (const call of fnCalls) {
          const converted = convertToolCallToCoachAction(
            call.name || '',
            (call.args as Record<string, any>) || {},
            acts,
            goals || [],
            curDate,
            fitnessStats,
            athleteProfile,
            String(question)
          );
          if (converted.skillLabel && !skillsUsed.includes(converted.skillLabel)) {
            skillsUsed.push(converted.skillLabel);
          }
          if (converted.action) {
            executedActions.push(converted.action);
          }
          fnResponseParts.push({
            functionResponse: {
              name: call.name || 'skill',
              id: (call as any).id,
              response: {
                status: 'success',
                actionStaged: converted.action || null,
                note: 'Action card has been rendered in the athlete UI. Now provide your clear, insightful coaching explanation.',
              },
            },
          });
        }

        // If Gemini returned function calls without final text, do a quick follow-up turn to get the natural explanation
        let rawAnswer = response.text || '';
        if (!rawAnswer.trim()) {
          const modelContent = response.candidates?.[0]?.content;
          if (modelContent) {
            const followUp = await geminiAi.models.generateContent({
              model: GEMINI_MODEL,
              contents: [
                ...contents,
                modelContent,
                {
                  role: 'user',
                  parts: fnResponseParts,
                },
              ],
              config: {
                systemInstruction,
              },
            });
            rawAnswer = followUp.text || '';
          }
        }

        // Collect grounding citations from first response
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        const groundingSources: { uri: string; title: string }[] = [];
        if (Array.isArray(chunks)) {
          chunks.forEach((chunk: any) => {
            if (chunk.web?.uri) {
              groundingSources.push({
                uri: chunk.web.uri,
                title: chunk.web.title || chunk.web.uri,
              });
            }
          });
        }
        if (groundingSources.length > 0 && !skillsUsed.includes('Google Search Grounding')) {
          skillsUsed.unshift('Google Search Grounding');
        }

        return res.json({
          success: true,
          answer: rawAnswer || executedActions[0]?.description || 'Skill executed.',
          executedAction: executedActions[0],
          additionalActions: executedActions.length > 1 ? executedActions.slice(1) : undefined,
          skillsUsed,
          groundingSources: groundingSources.length > 0 ? groundingSources : undefined,
          source: GEMINI_MODEL,
        });
      }

      // If no function call was emitted directly, check text for embedded ```action blocks and Google Search grounding
      let rawAnswer = response.text || 'Coach response ready.';
      let executedAction: any = undefined;

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const groundingSources: { uri: string; title: string }[] = [];
      if (Array.isArray(chunks)) {
        chunks.forEach((chunk: any) => {
          if (chunk.web?.uri) {
            groundingSources.push({
              uri: chunk.web.uri,
              title: chunk.web.title || chunk.web.uri,
            });
          }
        });
      }
      if (groundingSources.length > 0) {
        skillsUsed.push('Google Search Grounding');
      }

      const actionMatch = rawAnswer.match(/```(?:action|json)\s*([\s\S]*?)\s*```/);
      if (actionMatch) {
        try {
          const parsed = JSON.parse(actionMatch[1]);
          if (parsed && typeof parsed.type === 'string') {
            executedAction = parsed;
            rawAnswer = rawAnswer.replace(/```(?:action|json)\s*[\s\S]*?\s*```/, '').trim();
          }
        } catch {}
      }

      let confidenceRating: string | undefined = undefined;
      if (rawAnswer.includes('High Confidence 8.5/10') || rawAnswer.includes('High Confidence')) {
        confidenceRating = 'High Confidence 8.5/10';
      }

      return res.json({
        success: true,
        answer: rawAnswer,
        executedAction,
        skillsUsed: skillsUsed.length > 0 ? skillsUsed : undefined,
        confidenceRating,
        groundingSources: groundingSources.length > 0 ? groundingSources : undefined,
        source: GEMINI_MODEL,
      });
    } catch (err: any) {
      console.warn('[Gemini Coach Chat] Error, falling back to local physiological engine:', err?.message || err);
    }
  }

  // ============================================================================
  // UNSCRIPTED LOCAL PHYSIOLOGICAL FALLBACK (when offline or no API key)
  // ============================================================================
  const { generateSportsScienceChat } = await import('./src/utils/sportsScienceEngine.ts');
  const fallbackPayload = {
    athleteProfile,
    fitnessStats,
    latestReadiness,
    goals,
    recentActivities: acts,
    todayDate: curDate,
    todayDayOfWeek: curDay,
    todayAvailability,
    activeInjuries,
    periodizationInfo,
    recentActivitiesSummary,
  };
  const answer = generateSportsScienceChat(question, fallbackPayload, history);

  return res.json({
    success: true,
    answer,
    source: 'sports-science-engine',
  });
}

export async function handleReviewWorkouts(req: Request, res: Response) {
  const payload = req.body || {};
  const profile = payload.athleteProfile || {};
  const goals = payload.goals || [];
  const activities: any[] = payload.recentActivities || [];

  const reviews = generateWorkoutReviews(activities, {}, profile, goals);

  return res.json({
    success: true,
    reviews,
    source: 'sports-science-engine',
  });
}
