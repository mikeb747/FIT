import { StravaActivity } from './stravaActivities';
import { AthleteProfile, getAthleteHeartRateZones, getAthletePaceZones, getAthletePowerZones, formatSecondsToMinSec } from '../types/athlete';
import { classifyActivity } from './stravaActivities';

export interface CalculatedZoneBucket {
  zone: number;
  name: string;
  rangeFormatted: string;
  durationSec: number;
  durationFormatted: string;
  pct: number;
  color: string;
  description: string;
  isPrimary?: boolean;
}

export interface ActivityZoneAnalysis {
  activityId: string;
  activityName: string;
  category: 'Run' | 'Bike' | 'Swim' | 'Gym' | 'Other';
  movingTimeSec: number;
  hasStreams: boolean;
  hrZones: CalculatedZoneBucket[] | null;
  paceZones: CalculatedZoneBucket[] | null;
  powerZones: CalculatedZoneBucket[] | null;
  // Polarized distribution summary
  intensityDistribution: {
    lowIntensityPct: number; // Z1 + Z2
    tempoPct: number; // Z3
    highIntensityPct: number; // Z4 + Z5 + Z6
    trainingStyle: 'Polarized (80/20)' | 'Pyramidal' | 'Threshold Heavy' | 'High Intensity' | 'Recovery';
  };
}

/**
 * Calculates time spent in each training zone (HR, Pace, Power) for an individual activity.
 * Uses second-by-second sensor streams when available, or falls back to activity averages.
 */
export function calculateActivityZonesTime(
  activity: StravaActivity,
  streams: Record<string, any> | undefined,
  athleteProfile: AthleteProfile
): ActivityZoneAnalysis {
  const classification = classifyActivity(activity);
  const isBike = classification.category === 'Bike';
  const isRun = classification.category === 'Run';
  const movingTime = Math.max(1, activity.moving_time || activity.elapsed_time || 0);

  // -------------------------------------------------------------
  // 1. Heart Rate Zones
  // -------------------------------------------------------------
  let hrBuckets: CalculatedZoneBucket[] | null = null;
  const hrZonesConfig = getAthleteHeartRateZones(athleteProfile, isBike ? 'bike' : 'run');
  const hrStream: number[] = streams?.heartrate?.data || [];

  if (hrStream.length >= 10) {
    const counts = [0, 0, 0, 0, 0];
    let validCount = 0;
    for (const hr of hrStream) {
      if (typeof hr !== 'number' || hr < 40) continue;
      validCount++;
      if (hr <= hrZonesConfig[0].maxHr) counts[0]++;
      else if (hr <= hrZonesConfig[1].maxHr) counts[1]++;
      else if (hr <= hrZonesConfig[2].maxHr) counts[2]++;
      else if (hr <= hrZonesConfig[3].maxHr) counts[3]++;
      else counts[4]++;
    }

    if (validCount > 0) {
      hrBuckets = hrZonesConfig.map((z, idx) => {
        const pct = Math.round((counts[idx] / validCount) * 100);
        const durationSec = Math.round((counts[idx] / validCount) * movingTime);
        return {
          zone: z.zone,
          name: z.name,
          rangeFormatted: `${z.minHr} - ${z.maxHr} bpm`,
          durationSec,
          durationFormatted: formatZoneDuration(durationSec),
          pct,
          color: z.color,
          description: z.description,
        };
      });
    }
  } else if (activity.average_heartrate && activity.average_heartrate > 40) {
    // Fallback: estimate based on average heart rate
    const avgHr = Math.round(activity.average_heartrate);
    let primaryZoneIdx = 0;
    for (let i = 0; i < hrZonesConfig.length; i++) {
      if (avgHr <= hrZonesConfig[i].maxHr) {
        primaryZoneIdx = i;
        break;
      }
      if (i === hrZonesConfig.length - 1) primaryZoneIdx = i;
    }

    hrBuckets = hrZonesConfig.map((z, idx) => {
      const isPrimary = idx === primaryZoneIdx;
      const pct = isPrimary ? 80 : idx === primaryZoneIdx - 1 || idx === primaryZoneIdx + 1 ? 10 : 0;
      const durationSec = Math.round((pct / 100) * movingTime);
      return {
        zone: z.zone,
        name: z.name,
        rangeFormatted: `${z.minHr} - ${z.maxHr} bpm`,
        durationSec,
        durationFormatted: formatZoneDuration(durationSec),
        pct,
        color: z.color,
        description: z.description,
        isPrimary,
      };
    });
  }

  // -------------------------------------------------------------
  // 2. Pace Zones (Running only)
  // -------------------------------------------------------------
  let paceBuckets: CalculatedZoneBucket[] | null = null;
  if (isRun) {
    const paceZonesConfig = getAthletePaceZones(
      athleteProfile,
      classification.subType === 'Treadmill Run'
    );
    const vStream: number[] = streams?.velocity_smooth?.data || [];

    if (vStream.length >= 10) {
      const counts = [0, 0, 0, 0, 0];
      let validCount = 0;
      for (const v of vStream) {
        if (typeof v !== 'number' || v < 0.5) continue; // ignore stopped/walking < 1.8 kph
        validCount++;
        const secPerKm = 1000 / v;
        if (secPerKm >= paceZonesConfig[0].minPaceSec) counts[0]++;
        else if (secPerKm >= paceZonesConfig[1].minPaceSec) counts[1]++;
        else if (secPerKm >= paceZonesConfig[2].minPaceSec) counts[2]++;
        else if (secPerKm >= paceZonesConfig[3].minPaceSec) counts[3]++;
        else counts[4]++;
      }

      if (validCount > 0) {
        paceBuckets = paceZonesConfig.map((z, idx) => {
          const pct = Math.round((counts[idx] / validCount) * 100);
          const durationSec = Math.round((counts[idx] / validCount) * movingTime);
          return {
            zone: z.zone,
            name: z.name,
            rangeFormatted: z.rangeFormatted,
            durationSec,
            durationFormatted: formatZoneDuration(durationSec),
            pct,
            color: z.color,
            description: z.description,
          };
        });
      }
    } else if (activity.average_speed && activity.average_speed > 0.5) {
      // Pace fallback from average speed
      const secPerKm = 1000 / activity.average_speed;
      let primaryZoneIdx = 0;
      if (secPerKm >= paceZonesConfig[0].minPaceSec) primaryZoneIdx = 0;
      else if (secPerKm >= paceZonesConfig[1].minPaceSec) primaryZoneIdx = 1;
      else if (secPerKm >= paceZonesConfig[2].minPaceSec) primaryZoneIdx = 2;
      else if (secPerKm >= paceZonesConfig[3].minPaceSec) primaryZoneIdx = 3;
      else primaryZoneIdx = 4;

      paceBuckets = paceZonesConfig.map((z, idx) => {
        const isPrimary = idx === primaryZoneIdx;
        const pct = isPrimary ? 80 : idx === primaryZoneIdx - 1 || idx === primaryZoneIdx + 1 ? 10 : 0;
        const durationSec = Math.round((pct / 100) * movingTime);
        return {
          zone: z.zone,
          name: z.name,
          rangeFormatted: z.rangeFormatted,
          durationSec,
          durationFormatted: formatZoneDuration(durationSec),
          pct,
          color: z.color,
          description: z.description,
          isPrimary,
        };
      });
    }
  }

  // -------------------------------------------------------------
  // 3. Power Zones (Cycling only)
  // -------------------------------------------------------------
  let powerBuckets: CalculatedZoneBucket[] | null = null;
  if (isBike) {
    const powerZonesConfig = getAthletePowerZones(athleteProfile);
    const wStream: number[] = streams?.watts?.data || [];

    if (wStream.length >= 10) {
      const counts = new Array(powerZonesConfig.length).fill(0);
      let validCount = 0;
      for (const w of wStream) {
        if (typeof w !== 'number' || w < 0) continue;
        validCount++;
        let placed = false;
        for (let i = 0; i < powerZonesConfig.length; i++) {
          if (w <= powerZonesConfig[i].maxWatts) {
            counts[i]++;
            placed = true;
            break;
          }
        }
        if (!placed) {
          counts[powerZonesConfig.length - 1]++;
        }
      }

      if (validCount > 0) {
        powerBuckets = powerZonesConfig.map((z, idx) => {
          const pct = Math.round((counts[idx] / validCount) * 100);
          const durationSec = Math.round((counts[idx] / validCount) * movingTime);
          return {
            zone: z.zone,
            name: z.name,
            rangeFormatted: z.rangeFormatted,
            durationSec,
            durationFormatted: formatZoneDuration(durationSec),
            pct,
            color: z.color,
            description: z.description,
          };
        });
      }
    } else if (activity.average_watts && activity.average_watts > 20) {
      const avgWatts = Math.round(activity.average_watts);
      let primaryZoneIdx = 0;
      for (let i = 0; i < powerZonesConfig.length; i++) {
        if (avgWatts <= powerZonesConfig[i].maxWatts) {
          primaryZoneIdx = i;
          break;
        }
        if (i === powerZonesConfig.length - 1) primaryZoneIdx = i;
      }

      powerBuckets = powerZonesConfig.map((z, idx) => {
        const isPrimary = idx === primaryZoneIdx;
        const pct = isPrimary ? 80 : idx === primaryZoneIdx - 1 || idx === primaryZoneIdx + 1 ? 10 : 0;
        const durationSec = Math.round((pct / 100) * movingTime);
        return {
          zone: z.zone,
          name: z.name,
          rangeFormatted: z.rangeFormatted,
          durationSec,
          durationFormatted: formatZoneDuration(durationSec),
          pct,
          color: z.color,
          description: z.description,
          isPrimary,
        };
      });
    }
  }

  // -------------------------------------------------------------
  // 4. Polarized Distribution Summary (Z1-2 vs Z3 vs Z4+)
  // -------------------------------------------------------------
  const primaryBuckets = hrBuckets || powerBuckets || paceBuckets || [];
  let lowIntensityPct = 0;
  let tempoPct = 0;
  let highIntensityPct = 0;

  if (primaryBuckets.length >= 5) {
    lowIntensityPct = (primaryBuckets[0]?.pct || 0) + (primaryBuckets[1]?.pct || 0);
    tempoPct = primaryBuckets[2]?.pct || 0;
    highIntensityPct = primaryBuckets.slice(3).reduce((sum, b) => sum + b.pct, 0);
  }

  let trainingStyle: 'Polarized (80/20)' | 'Pyramidal' | 'Threshold Heavy' | 'High Intensity' | 'Recovery' = 'Pyramidal';
  if (lowIntensityPct >= 75 && highIntensityPct >= 10 && tempoPct <= 15) {
    trainingStyle = 'Polarized (80/20)';
  } else if (lowIntensityPct >= 85) {
    trainingStyle = 'Recovery';
  } else if (tempoPct >= 35) {
    trainingStyle = 'Threshold Heavy';
  } else if (highIntensityPct >= 30) {
    trainingStyle = 'High Intensity';
  }

  return {
    activityId: String(activity.id),
    activityName: activity.name || 'Activity',
    category: classification.category,
    movingTimeSec: movingTime,
    hasStreams: (streams?.heartrate?.data?.length || 0) > 10 || (streams?.watts?.data?.length || 0) > 10 || (streams?.velocity_smooth?.data?.length || 0) > 10,
    hrZones: hrBuckets,
    paceZones: paceBuckets,
    powerZones: powerBuckets,
    intensityDistribution: {
      lowIntensityPct,
      tempoPct,
      highIntensityPct,
      trainingStyle,
    },
  };
}

/** Formats seconds into human-readable e.g. "34m 12s" or "1h 05m" */
export function formatZoneDuration(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return '0s';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  if (hrs > 0) {
    return `${hrs}h ${mins.toString().padStart(2, '0')}m`;
  }
  if (mins > 0) {
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  }
  return `${secs}s`;
}
