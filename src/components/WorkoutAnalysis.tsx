import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Activity,
  Zap,
  Heart,
  Gauge,
  Waves,
  Bike,
  Footprints,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import type { StravaActivity, StravaActivityDetailsRecord } from '../utils/stravaActivities';
import { classifyActivity } from '../utils/stravaActivities';
import type { AthleteProfile } from '../types/athlete';

export type WorkoutAnalysisMetric = 'pace' | 'swim_pace' | 'power' | 'heartrate' | 'speed';

export interface WorkoutAnalysisLap {
  id: string | number;
  lapIndex: number;
  name: string;
  distanceM: number;
  distanceFormatted: string;
  movingTimeSec: number;
  durationFormatted: string;
  elapsedTimeSec: number;
  // Metrics
  avgSpeedKph: number;
  paceSecPerKm?: number;
  paceFormatted?: string;
  swimPaceSecPer100m?: number;
  swimPaceFormatted?: string;
  avgWatts?: number;
  avgHr?: number;
  maxHr?: number;
  isRest?: boolean;
  isInterval?: boolean;
  zoneLabel: string;
}

interface WorkoutAnalysisProps {
  activity: StravaActivity;
  details?: StravaActivityDetailsRecord | null;
  athleteProfile: AthleteProfile;
  theme?: 'dark' | 'light';
}

function formatLapDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function formatPaceSec(secondsPerKm: number): string {
  if (!secondsPerKm || secondsPerKm <= 0 || !Number.isFinite(secondsPerKm)) return '--:--';
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatSwimPaceSec(secondsPer100m: number): string {
  if (!secondsPer100m || secondsPer100m <= 0 || !Number.isFinite(secondsPer100m)) return '--:--';
  const m = Math.floor(secondsPer100m / 60);
  const s = Math.round(secondsPer100m % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getRunPaceZone(paceSec: number, thresholdSec: number): string {
  if (!paceSec || paceSec <= 0) return 'Rest';
  const ratio = paceSec / thresholdSec;
  if (ratio <= 0.88) return 'Zone 6 · Anaerobic';
  if (ratio <= 0.96) return 'Zone 5 · VO2 Max';
  if (ratio <= 1.03) return 'Zone 4 · Threshold';
  if (ratio <= 1.12) return 'Zone 3 · Tempo';
  if (ratio <= 1.25) return 'Zone 2 · Aerobic';
  return 'Zone 1 · Recovery';
}

function getBikePowerZone(watts: number, ftp: number): string {
  if (!watts || watts <= 0) return 'Rest';
  const ratio = watts / ftp;
  if (ratio > 1.50) return 'Zone 7 · Neuromuscular';
  if (ratio > 1.20) return 'Zone 6 · Anaerobic';
  if (ratio > 1.05) return 'Zone 5 · VO2 Max';
  if (ratio > 0.90) return 'Zone 4 · Threshold';
  if (ratio > 0.75) return 'Zone 3 · Tempo';
  if (ratio > 0.55) return 'Zone 2 · Endurance';
  return 'Zone 1 · Recovery';
}

function getHeartRateZone(hr: number, maxHr: number): string {
  if (!hr || hr <= 0) return 'Rest';
  const pct = (hr / maxHr) * 100;
  if (pct >= 95) return 'Zone 5 · VO2 Max';
  if (pct >= 90) return 'Zone 4 · Threshold';
  if (pct >= 84) return 'Zone 3 · Tempo';
  if (pct >= 69) return 'Zone 2 · Aerobic';
  return 'Zone 1 · Recovery';
}

function getSwimPaceZone(paceSec: number, thresholdSec: number): string {
  if (!paceSec || paceSec <= 0) return 'Rest';
  const ratio = paceSec / thresholdSec;
  if (ratio <= 0.92) return 'Zone 5 · Sprint';
  if (ratio <= 0.98) return 'Zone 4 · Threshold';
  if (ratio <= 1.06) return 'Zone 3 · Tempo';
  if (ratio <= 1.18) return 'Zone 2 · Aerobic Base';
  return 'Zone 1 · Recovery';
}

export const WorkoutAnalysis: React.FC<WorkoutAnalysisProps> = ({
  activity,
  details,
  athleteProfile,
  theme = 'dark',
}) => {
  const isLight = theme === 'light';
  const { category } = classifyActivity(activity);

  const thresholdRunPaceSec =
    athleteProfile?.thresholdPaceRunOutdoorSec ||
    athleteProfile?.thresholdPaceRunTreadmillSec ||
    240; // 4:00/km default
  const thresholdSwimPaceSec = athleteProfile?.swimPoolPace100mSec || 105; // 1:45/100m default
  const ftp = athleteProfile?.bikeFtp || 250;
  const maxHr = athleteProfile?.maxHeartRate || 185;

  // Extract all available laps
  const laps: WorkoutAnalysisLap[] = useMemo(() => {
    const rawLaps = (details?.activity?.laps as any[]) || (activity as any)?.laps;
    const calibratedRun = details?.calibration?.calibratedRunSections;
    const calibratedSwim = details?.calibration?.calibratedLaps;
    const splits = (details?.activity?.splits_metric as any[]) || (activity as any)?.splits_metric;

    // 1. If Calibrated Run Sections exist (indoor treadmill interval recreation):
    if (category === 'Run' && calibratedRun && calibratedRun.length > 0) {
      return calibratedRun.map((sec, idx) => {
        const durSec = sec.durationSec || 60;
        const spdKph = sec.speedKph || 0;
        const distM = Math.round((spdKph / 3.6) * durSec);
        const distKmStr = `${(distM / 1000).toFixed(2)} km`;
        const paceSec = spdKph > 0 ? 3600 / spdKph : 600;
        const isInterval = spdKph >= 13 || paceSec <= thresholdRunPaceSec;

        return {
          id: sec.id || `calib-run-${idx + 1}`,
          lapIndex: idx + 1,
          name: sec.name || `Lap ${idx + 1}`,
          distanceM: distM,
          distanceFormatted: distKmStr,
          movingTimeSec: durSec,
          durationFormatted: formatLapDuration(durSec),
          elapsedTimeSec: durSec,
          avgSpeedKph: Number(spdKph.toFixed(1)),
          paceSecPerKm: paceSec,
          paceFormatted: `${formatPaceSec(paceSec)} /km`,
          avgHr: activity.average_heartrate ? Math.round(activity.average_heartrate) : undefined,
          isInterval,
          zoneLabel: getRunPaceZone(paceSec, thresholdRunPaceSec),
        };
      });
    }

    // 2. If Calibrated Swim Laps exist:
    if (category === 'Swim' && calibratedSwim && calibratedSwim.length > 0) {
      return calibratedSwim.map((lap, idx) => {
        const isRest = Boolean(lap.isRest || lap.distanceM <= 0);
        const distM = lap.distanceM || 0;
        const durSec = lap.movingTimeSec || 0;
        const paceSec = !isRest && distM > 0 && durSec > 0 ? (durSec / distM) * 100 : 0;

        return {
          id: `calib-swim-${idx + 1}`,
          lapIndex: lap.lapIndex || idx + 1,
          name: isRest ? `Rest ${idx + 1}` : `Lap ${lap.lapIndex || idx + 1}`,
          distanceM: distM,
          distanceFormatted: `${distM} m`,
          movingTimeSec: durSec,
          durationFormatted: formatLapDuration(durSec),
          elapsedTimeSec: durSec,
          avgSpeedKph: distM > 0 && durSec > 0 ? Number(((distM / durSec) * 3.6).toFixed(1)) : 0,
          swimPaceSecPer100m: paceSec,
          swimPaceFormatted: isRest ? 'Rest' : `${formatSwimPaceSec(paceSec)} /100m`,
          avgHr: activity.average_heartrate ? Math.round(activity.average_heartrate) : undefined,
          isRest,
          isInterval: !isRest && paceSec > 0 && paceSec <= thresholdSwimPaceSec,
          zoneLabel: isRest ? 'Rest' : getSwimPaceZone(paceSec, thresholdSwimPaceSec),
        };
      });
    }

    // 3. Raw Strava Laps (Run, Bike, or Swim):
    if (Array.isArray(rawLaps) && rawLaps.length > 0) {
      return rawLaps.map((lap: any, idx: number) => {
        const distM = Math.round(lap.distance || 0);
        const durSec = Math.round(lap.moving_time || lap.elapsed_time || 0);
        const elapsedSec = Math.round(lap.elapsed_time || durSec);
        const speedMps = Number(lap.average_speed) || (distM > 0 && durSec > 0 ? distM / durSec : 0);
        const speedKph = Number((speedMps * 3.6).toFixed(1));

        const isRest = category === 'Swim' ? distM <= 0 : distM <= 5 && speedKph < 2;
        const paceSec = distM > 0 && durSec > 0 ? durSec / (distM / 1000) : 600;
        const swimPaceSec = distM > 0 && durSec > 0 ? (durSec / distM) * 100 : 0;
        const watts = lap.average_watts ? Math.round(lap.average_watts) : undefined;
        const hr = lap.average_heartrate ? Math.round(lap.average_heartrate) : undefined;

        let zoneLabel = '';
        let isInterval = false;
        if (category === 'Run') {
          zoneLabel = getRunPaceZone(paceSec, thresholdRunPaceSec);
          isInterval = paceSec <= thresholdRunPaceSec * 1.05;
        } else if (category === 'Bike') {
          zoneLabel = watts ? getBikePowerZone(watts, ftp) : hr ? getHeartRateZone(hr, maxHr) : '';
          isInterval = watts ? watts >= ftp * 0.95 : speedKph >= 25;
        } else if (category === 'Swim') {
          zoneLabel = isRest ? 'Rest' : getSwimPaceZone(swimPaceSec, thresholdSwimPaceSec);
          isInterval = !isRest && swimPaceSec <= thresholdSwimPaceSec * 1.05;
        } else {
          zoneLabel = hr ? getHeartRateZone(hr, maxHr) : '';
        }

        const distFormatted = category === 'Swim' ? `${distM} m` : `${(distM / 1000).toFixed(2)} km`;

        return {
          id: lap.id || `lap-${idx + 1}`,
          lapIndex: lap.lap_index || idx + 1,
          name: lap.name || `Lap ${idx + 1}`,
          distanceM: distM,
          distanceFormatted: distFormatted,
          movingTimeSec: durSec,
          durationFormatted: formatLapDuration(durSec),
          elapsedTimeSec: elapsedSec,
          avgSpeedKph: speedKph,
          paceSecPerKm: paceSec,
          paceFormatted: `${formatPaceSec(paceSec)} /km`,
          swimPaceSecPer100m: swimPaceSec,
          swimPaceFormatted: `${formatSwimPaceSec(swimPaceSec)} /100m`,
          avgWatts: category === 'Run' ? undefined : watts,
          avgHr: hr,
          maxHr: lap.max_heartrate ? Math.round(lap.max_heartrate) : undefined,
          isRest,
          isInterval,
          zoneLabel,
        };
      });
    }

    // 4. Fallback to Kilometer Splits if available:
    if (Array.isArray(splits) && splits.length > 0) {
      return splits.map((s: any, idx: number) => {
        const distM = Math.round(s.distance || 1000);
        const durSec = Math.round(s.moving_time || s.elapsed_time || 0);
        const paceSec = distM > 0 && durSec > 0 ? durSec / (distM / 1000) : 300;
        const speedKph = durSec > 0 ? Number(((distM / durSec) * 3.6).toFixed(1)) : 0;
        const hr = s.average_heartrate ? Math.round(s.average_heartrate) : undefined;
        const watts = s.average_watts ? Math.round(s.average_watts) : undefined;

        return {
          id: `split-${idx + 1}`,
          lapIndex: s.split || idx + 1,
          name: `Km ${idx + 1}`,
          distanceM: distM,
          distanceFormatted: `${(distM / 1000).toFixed(2)} km`,
          movingTimeSec: durSec,
          durationFormatted: formatLapDuration(durSec),
          elapsedTimeSec: durSec,
          avgSpeedKph: speedKph,
          paceSecPerKm: paceSec,
          paceFormatted: `${formatPaceSec(paceSec)} /km`,
          avgWatts: category === 'Run' ? undefined : watts,
          avgHr: hr,
          zoneLabel: category === 'Run' ? getRunPaceZone(paceSec, thresholdRunPaceSec) : hr ? getHeartRateZone(hr, maxHr) : '',
        };
      });
    }

    // 5. If no laps or splits: return empty array
    return [];
  }, [activity, details, category, thresholdRunPaceSec, thresholdSwimPaceSec, ftp, maxHr]);

  // Determine available metrics for switching
  const availableMetrics = useMemo<WorkoutAnalysisMetric[]>(() => {
    const list: WorkoutAnalysisMetric[] = [];
    const hasHr = laps.some((l) => l.avgHr && l.avgHr > 0);
    const hasWatts = laps.some((l) => l.avgWatts && l.avgWatts > 0);

    if (category === 'Run') {
      list.push('pace');
      if (hasHr) list.push('heartrate');
    } else if (category === 'Swim') {
      list.push('swim_pace');
      if (hasHr) list.push('heartrate');
    } else if (category === 'Bike') {
      if (hasWatts) list.push('power');
      if (hasHr) list.push('heartrate');
      list.push('speed');
      if (!hasWatts) list.push('power');
    } else {
      if (hasHr) list.push('heartrate');
      if (hasWatts) list.push('power');
      list.push('pace');
    }
    return list;
  }, [category, laps]);

  // Active selected metric
  const [activeMetric, setActiveMetric] = useState<WorkoutAnalysisMetric>(() => {
    if (category === 'Swim') return 'swim_pace';
    if (category === 'Bike') {
      const hasWatts = (activity.average_watts || 0) > 0;
      return hasWatts ? 'power' : 'speed';
    }
    return 'pace';
  });

  // Keep activeMetric valid if activity changes
  useEffect(() => {
    if (!availableMetrics.includes(activeMetric)) {
      setActiveMetric(availableMetrics[0] || 'pace');
    }
  }, [availableMetrics, activeMetric]);

  // Selected lap: default to the first lap (or lap 3 if available, or first interval)
  const [selectedLapIndex, setSelectedLapIndex] = useState<number>(() => {
    if (laps.length >= 3) return laps[2].lapIndex; // lap 3 default matches Strava screenshot
    return laps[0]?.lapIndex || 1;
  });

  useEffect(() => {
    if (laps.length > 0 && !laps.some((l) => l.lapIndex === selectedLapIndex)) {
      setSelectedLapIndex(laps[0].lapIndex);
    }
  }, [laps, selectedLapIndex]);

  const selectedLap = useMemo(() => {
    return laps.find((l) => l.lapIndex === selectedLapIndex) || laps[0];
  }, [laps, selectedLapIndex]);

  // Table row ref for scroll-into-view
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const selectedRowRef = useRef<HTMLTableRowElement>(null);

  // Scroll table to selected row smoothly when selected from chart
  const handleSelectLap = (lapIndex: number) => {
    setSelectedLapIndex(lapIndex);
  };

  // Calculations for chart axes, heights, and average line
  const chartData = useMemo(() => {
    if (laps.length === 0) return null;

    const totalDuration = laps.reduce((acc, l) => acc + Math.max(10, l.movingTimeSec), 0);

    // Compute metric values per lap
    let values: number[] = [];
    let avgValue = 0;

    if (activeMetric === 'pace') {
      values = laps.map((l) => (l.paceSecPerKm && l.paceSecPerKm > 0 ? l.paceSecPerKm : 600));
      // Overall activity average pace
      const actDistKm = (activity.distance || 1) / 1000;
      avgValue = activity.moving_time && actDistKm > 0 ? activity.moving_time / actDistKm : 300;
    } else if (activeMetric === 'swim_pace') {
      values = laps.map((l) => (l.swimPaceSecPer100m && l.swimPaceSecPer100m > 0 ? l.swimPaceSecPer100m : 180));
      const actDist100m = (activity.distance || 1) / 100;
      avgValue = activity.moving_time && actDist100m > 0 ? activity.moving_time / actDist100m : 105;
    } else if (activeMetric === 'power') {
      values = laps.map((l) => l.avgWatts || 0);
      avgValue = activity.average_watts || (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 200);
    } else if (activeMetric === 'heartrate') {
      values = laps.map((l) => l.avgHr || 0);
      avgValue = activity.average_heartrate || (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 140);
    } else {
      // Speed
      values = laps.map((l) => l.avgSpeedKph || 0);
      avgValue = activity.average_speed ? activity.average_speed * 3.6 : 25;
    }

    // Determine Min & Max for the chart
    const validValues = values.filter((v) => v > 0);
    const minVal = validValues.length > 0 ? Math.min(...validValues) : 0;
    const maxVal = validValues.length > 0 ? Math.max(...validValues) : 100;

    // For pace/swim_pace: faster pace (LOWER seconds) should be TALLER (top of chart)
    // In Strava: 3:30 is at the top, 5:30 is at the bottom
    let yMin: number;
    let yMax: number;
    let yTicks: { val: number; label: string; yRatio: number }[] = [];

    const isPaceMetric = activeMetric === 'pace' || activeMetric === 'swim_pace';

    if (isPaceMetric) {
      // Round to nearest 30s
      const fastestPaceSec = Math.max(60, minVal);
      const slowestPaceSec = Math.min(720, Math.max(maxVal, fastestPaceSec + 90));

      yMin = Math.floor((fastestPaceSec - 15) / 30) * 30; // top of chart (fastest)
      yMax = Math.ceil((slowestPaceSec + 15) / 30) * 30; // bottom of chart (slowest)
      if (yMax <= yMin) yMax = yMin + 120;

      // 4-5 ticks
      const step = yMax - yMin > 180 ? 60 : 30;
      for (let s = yMin; s <= yMax; s += step) {
        const ratio = (s - yMin) / (yMax - yMin); // 0 at fastest (top), 1 at slowest (bottom)
        const label = activeMetric === 'pace' ? formatPaceSec(s) : formatSwimPaceSec(s);
        yTicks.push({ val: s, label, yRatio: ratio });
      }
    } else {
      // Higher is taller (top of chart)
      const step = activeMetric === 'power' ? 50 : activeMetric === 'heartrate' ? 20 : 5;
      yMin = Math.max(0, Math.floor((minVal * 0.85) / step) * step);
      yMax = Math.ceil((maxVal * 1.15) / step) * step;
      if (yMax <= yMin) yMax = yMin + step * 4;

      const numTicks = 4;
      const tickStep = (yMax - yMin) / numTicks;
      for (let i = 0; i <= numTicks; i++) {
        const val = Math.round(yMin + i * tickStep);
        const ratio = 1 - (val - yMin) / (yMax - yMin); // 0 at top, 1 at bottom
        yTicks.push({ val, label: String(val), yRatio: ratio });
      }
    }

    return {
      totalDuration,
      values,
      avgValue,
      yMin,
      yMax,
      yTicks,
      isPaceMetric,
    };
  }, [laps, activeMetric, activity]);

  // Chart dimensions & layout calculations
  const VIEW_WIDTH = 640;
  const VIEW_HEIGHT = 230;
  const MARGIN_LEFT = 52;
  const MARGIN_RIGHT = 18;
  const MARGIN_TOP = 32;
  const MARGIN_BOTTOM = 30;
  const PLOT_WIDTH = VIEW_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
  const PLOT_HEIGHT = VIEW_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;

  // Compute responsive bar widths and positions
  const barLayouts = useMemo(() => {
    if (!chartData || laps.length === 0) return [];
    const { totalDuration, values, yMin, yMax, isPaceMetric } = chartData;

    const n = laps.length;
    const gap = n > 16 ? 2 : n > 10 ? 3 : 4;
    const totalGap = (n - 1) * gap;
    const availableWidth = PLOT_WIDTH - totalGap;

    // Minimum bar width so short 1-minute intervals remain easily clickable
    const minBarWidth = Math.max(8, Math.min(18, availableWidth / (n * 2.5)));
    const remainingWidth = Math.max(0, availableWidth - n * minBarWidth);

    let currentX = MARGIN_LEFT;

    return laps.map((lap, idx) => {
      const dur = Math.max(10, lap.movingTimeSec);
      const width = minBarWidth + (remainingWidth * dur) / totalDuration;
      const x = currentX;
      currentX += width + gap;

      const val = values[idx] || 0;
      let heightRatio = 0; // 0 to 1, where 1 is tallest bar

      if (val > 0) {
        if (isPaceMetric) {
          // Faster pace (lower val) -> taller bar!
          heightRatio = Math.max(0.08, Math.min(1, (yMax - val) / (yMax - yMin)));
        } else {
          // Higher val -> taller bar!
          heightRatio = Math.max(0.08, Math.min(1, (val - yMin) / (yMax - yMin)));
        }
      } else {
        heightRatio = 0.05; // tiny rest bar
      }

      const barHeight = Math.max(6, heightRatio * PLOT_HEIGHT);
      const y = MARGIN_TOP + PLOT_HEIGHT - barHeight;

      // Active fast interval vs recovery jog / slower pace:
      // Strava colors: active fast interval bouts are deep navy blue, recovery/slower are soft pastel blue
      const isSelected = lap.lapIndex === selectedLapIndex;
      const isFastBout = lap.isInterval ?? (heightRatio >= 0.55);

      return {
        lap,
        val,
        x,
        y,
        width,
        height: barHeight,
        isSelected,
        isFastBout,
      };
    });
  }, [chartData, laps, selectedLapIndex, PLOT_WIDTH, PLOT_HEIGHT, MARGIN_LEFT, MARGIN_TOP]);

  // Selected Lap info formatted for the banner
  const activeMetricBannerText = useMemo<{
    lapIndex: number;
    metricValStr: string;
    zoneStr: string;
  } | null>(() => {
    if (!selectedLap) return null;
    let metricValStr = '';
    let zoneStr = selectedLap.zoneLabel || '';

    if (activeMetric === 'pace') {
      metricValStr = selectedLap.paceFormatted || '-- /km';
    } else if (activeMetric === 'swim_pace') {
      metricValStr = selectedLap.swimPaceFormatted || '-- /100m';
    } else if (activeMetric === 'power') {
      metricValStr = selectedLap.avgWatts ? `${selectedLap.avgWatts} W` : '-- W';
      if (selectedLap.avgWatts && ftp > 0) {
        const pctFtp = Math.round((selectedLap.avgWatts / ftp) * 100);
        zoneStr = `${selectedLap.zoneLabel} (${pctFtp}% FTP)`;
      }
    } else if (activeMetric === 'heartrate') {
      metricValStr = selectedLap.avgHr ? `${selectedLap.avgHr} bpm` : '-- bpm';
      if (selectedLap.avgHr && maxHr > 0) {
        const pctHr = Math.round((selectedLap.avgHr / maxHr) * 100);
        zoneStr = `${selectedLap.zoneLabel} (${pctHr}% Max)`;
      }
    } else {
      metricValStr = `${selectedLap.avgSpeedKph} kph`;
    }

    return {
      lapIndex: selectedLap.lapIndex,
      metricValStr,
      zoneStr,
    };
  }, [selectedLap, activeMetric, ftp, maxHr]);

  // Dashed average line Y coordinate
  const avgLineY = useMemo(() => {
    if (!chartData || !chartData.avgValue) return null;
    const { avgValue, yMin, yMax, isPaceMetric } = chartData;

    let ratio = 0;
    if (isPaceMetric) {
      ratio = (avgValue - yMin) / (yMax - yMin);
    } else {
      ratio = 1 - (avgValue - yMin) / (yMax - yMin);
    }
    ratio = Math.max(0, Math.min(1, ratio));
    return MARGIN_TOP + ratio * PLOT_HEIGHT;
  }, [chartData, MARGIN_TOP, PLOT_HEIGHT]);

  const selectedLayout = barLayouts.find((b) => b.isSelected);

  // If there is only 1 lap (or none) for an activity, do not display Workout Analysis
  if (laps.length <= 1) {
    return null;
  }

  return (
    <div
      id="workout-analysis-section"
      className={`rounded-2xl border overflow-hidden shadow-xs transition-colors ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
      }`}
    >
      {/* Header with Title and Metric Switcher Tabs */}
      <div
        className={`px-3.5 sm:px-4 py-3 border-b flex items-center justify-between gap-3 flex-wrap ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
        }`}
      >
        <div className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
              isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-600/20 text-blue-400'
            }`}
          >
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h4
              className={`text-xs sm:text-sm font-extrabold uppercase tracking-wider ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}
            >
              Workout Analysis
            </h4>
            <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {laps.length} {laps.length === 1 ? 'Lap' : 'Laps'} recorded • Tap bar or row to inspect
            </p>
          </div>
        </div>

        {/* Metric Selector Tabs */}
        {availableMetrics.length > 1 && (
          <div
            className={`inline-flex items-center p-0.5 rounded-xl border ${
              isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}
          >
            {availableMetrics.map((m) => {
              const isActive = activeMetric === m;
              let label = 'Pace';
              let icon = <Footprints className="w-3 h-3" />;
              if (m === 'pace') {
                label = 'Run Pace';
                icon = <Footprints className="w-3 h-3" />;
              } else if (m === 'swim_pace') {
                label = 'Swim Pace';
                icon = <Waves className="w-3 h-3" />;
              } else if (m === 'power') {
                label = 'Power (W)';
                icon = <Zap className="w-3 h-3" />;
              } else if (m === 'heartrate') {
                label = 'Heart Rate';
                icon = <Heart className="w-3 h-3" />;
              } else if (m === 'speed') {
                label = 'Speed (kph)';
                icon = <Gauge className="w-3 h-3" />;
              }

              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setActiveMetric(m)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    isActive
                      ? isLight
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'bg-blue-600 text-white shadow-xs'
                      : isLight
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {icon}
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Active Lap Banner (Matching Strava Screenshot Exactly: Lap 3 · 3:32 /km · Zone 6 · Anaerobic) */}
      {activeMetricBannerText && (
        <div
          className={`px-4 py-2.5 border-b text-center flex items-center justify-center gap-2 text-xs sm:text-sm transition-colors ${
            isLight ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'
          }`}
        >
          <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
            Lap {activeMetricBannerText.lapIndex}
          </span>
          <span className="text-slate-400">•</span>
          <span
            className={`font-mono font-extrabold ${
              isLight ? 'text-blue-700' : 'text-blue-400'
            }`}
          >
            {activeMetricBannerText.metricValStr}
          </span>
          {activeMetricBannerText.zoneStr && (
            <>
              <span className="text-slate-400">•</span>
              <span
                className={`font-semibold ${
                  isLight ? 'text-slate-600' : 'text-slate-300'
                }`}
              >
                {activeMetricBannerText.zoneStr}
              </span>
            </>
          )}
        </div>
      )}

      {/* SVG Bar Chart Area */}
      <div className="relative w-full overflow-x-auto select-none pt-2 pb-1">
        <svg
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          className="w-full h-auto min-w-[520px] block"
          style={{ maxHeight: '240px' }}
        >
          {/* Horizontal Gridlines & Y-Axis Labels */}
          {chartData?.yTicks.map((tick, i) => {
            const y = MARGIN_TOP + tick.yRatio * PLOT_HEIGHT;
            return (
              <g key={`ytick-${i}`}>
                <line
                  x1={MARGIN_LEFT}
                  x2={MARGIN_LEFT + PLOT_WIDTH}
                  y1={y}
                  y2={y}
                  stroke={isLight ? '#E2E8F0' : '#1E293B'}
                  strokeWidth="1"
                />
                <text
                  x={MARGIN_LEFT - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fontFamily="monospace"
                  fill={isLight ? '#64748B' : '#94A3B8'}
                >
                  {tick.label}
                </text>
              </g>
            );
          })}

          {/* Unit label at bottom-left */}
          <text
            x={MARGIN_LEFT - 8}
            y={MARGIN_TOP + PLOT_HEIGHT + 2}
            textAnchor="end"
            fontSize="10"
            fontFamily="sans-serif"
            fontWeight="bold"
            fill={isLight ? '#94A3B8' : '#64748B'}
          >
            {activeMetric === 'pace'
              ? '/km'
              : activeMetric === 'swim_pace'
              ? '/100m'
              : activeMetric === 'power'
              ? 'W'
              : activeMetric === 'heartrate'
              ? 'bpm'
              : 'kph'}
          </text>

          {/* Dashed Workout Average Line across chart */}
          {avgLineY !== null && (
            <g>
              <line
                x1={MARGIN_LEFT}
                x2={MARGIN_LEFT + PLOT_WIDTH}
                y1={avgLineY}
                y2={avgLineY}
                stroke={isLight ? '#475569' : '#94A3B8'}
                strokeWidth="1.2"
                strokeDasharray="4,4"
                opacity="0.8"
              />
            </g>
          )}

          {/* Vertical axis line on left of plot */}
          <line
            x1={MARGIN_LEFT}
            x2={MARGIN_LEFT}
            y1={MARGIN_TOP}
            y2={MARGIN_TOP + PLOT_HEIGHT}
            stroke={isLight ? '#CBD5E1' : '#334155'}
            strokeWidth="1"
          />

          {/* Bottom axis line */}
          <line
            x1={MARGIN_LEFT}
            x2={MARGIN_LEFT + PLOT_WIDTH}
            y1={MARGIN_TOP + PLOT_HEIGHT}
            y2={MARGIN_TOP + PLOT_HEIGHT}
            stroke={isLight ? '#CBD5E1' : '#334155'}
            strokeWidth="1"
          />

          {/* Render Lap Bars */}
          {barLayouts.map((b) => {
            // Colors:
            // Fast interval bouts: Strava Navy Blue (#0A3B75 in light, #2563EB in dark)
            // Slower / recovery bouts: Strava Light Blue (#8EBAEC in light, #3B82F6/50 in dark)
            const fillColor = b.isFastBout
              ? isLight
                ? '#0A3B75'
                : '#2563EB'
              : isLight
              ? '#8EBAEC'
              : '#1E3A8A';

            return (
              <g
                key={`bar-${b.lap.lapIndex}`}
                onClick={() => handleSelectLap(b.lap.lapIndex)}
                className="cursor-pointer transition-opacity group"
              >
                {/* Expanded invisible touch hit area for mobile */}
                <rect
                  x={b.x - 2}
                  y={MARGIN_TOP - 10}
                  width={b.width + 4}
                  height={PLOT_HEIGHT + 20}
                  fill="transparent"
                />

                {/* Visible rounded bar */}
                <rect
                  x={b.x}
                  y={b.y}
                  width={b.width}
                  height={b.height}
                  rx={Math.min(5, b.width / 2)}
                  fill={fillColor}
                  className="transition-all"
                  opacity={b.isSelected ? 1 : 0.88}
                />

                {/* Selected border ring */}
                {b.isSelected && (
                  <rect
                    x={b.x}
                    y={b.y}
                    width={b.width}
                    height={b.height}
                    rx={Math.min(5, b.width / 2)}
                    fill="none"
                    stroke={isLight ? '#003366' : '#93C5FD'}
                    strokeWidth="2"
                  />
                )}

                {/* X-axis tick under bar */}
                <line
                  x1={b.x + b.width / 2}
                  x2={b.x + b.width / 2}
                  y1={MARGIN_TOP + PLOT_HEIGHT}
                  y2={MARGIN_TOP + PLOT_HEIGHT + 4}
                  stroke={isLight ? '#94A3B8' : '#475569'}
                  strokeWidth="1"
                />

                {/* X-axis lap index label */}
                <text
                  x={b.x + b.width / 2}
                  y={MARGIN_TOP + PLOT_HEIGHT + 16}
                  textAnchor="middle"
                  fontSize={b.width < 14 ? '9' : '10'}
                  fontFamily="sans-serif"
                  fontWeight={b.isSelected ? 'bold' : 'normal'}
                  fill={
                    b.isSelected
                      ? isLight
                        ? '#0A3B75'
                        : '#60A5FA'
                      : isLight
                      ? '#64748B'
                      : '#94A3B8'
                  }
                >
                  {b.lap.lapIndex}
                </text>
              </g>
            );
          })}

          {/* Selected Lap Pin Indicator (dotted vertical line up to circle pin, matching Strava screenshot) */}
          {selectedLayout && (
            <g pointerEvents="none">
              <line
                x1={selectedLayout.x + selectedLayout.width / 2}
                x2={selectedLayout.x + selectedLayout.width / 2}
                y1={MARGIN_TOP - 14}
                y2={selectedLayout.y}
                stroke={isLight ? '#0A3B75' : '#60A5FA'}
                strokeWidth="1.5"
                strokeDasharray="3,3"
              />
              <circle
                cx={selectedLayout.x + selectedLayout.width / 2}
                cy={selectedLayout.y}
                r="4.5"
                fill={isLight ? '#FFFFFF' : '#0F172A'}
                stroke={isLight ? '#0A3B75' : '#60A5FA'}
                strokeWidth="2.5"
              />
            </g>
          )}
        </svg>
      </div>

      {/* Laps List Table (Matching Strava Screenshot Layout) */}
      <div className="border-t border-slate-800/80">
        <div
          className={`px-4 py-2 border-b flex items-center justify-between text-xs font-bold uppercase tracking-wider ${
            isLight ? 'bg-slate-50 text-slate-700 border-slate-200' : 'bg-slate-950/70 text-slate-400 border-slate-800'
          }`}
        >
          <span>Laps</span>
          <span className="text-[11px] font-normal normal-case opacity-75">
            {chartData?.avgValue ? (
              <span>
                Avg:{' '}
                <strong className="font-mono">
                  {activeMetric === 'pace'
                    ? `${formatPaceSec(chartData.avgValue)}/km`
                    : activeMetric === 'swim_pace'
                    ? `${formatSwimPaceSec(chartData.avgValue)}/100m`
                    : activeMetric === 'power'
                    ? `${Math.round(chartData.avgValue)}W`
                    : activeMetric === 'heartrate'
                    ? `${Math.round(chartData.avgValue)} bpm`
                    : `${chartData.avgValue.toFixed(1)} kph`}
                </strong>
              </span>
            ) : null}
          </span>
        </div>

        {/* Scrollable Laps Table */}
        <div ref={tableContainerRef} className="max-h-72 overflow-y-auto divide-y divide-slate-800/60">
          <table className="w-full text-xs text-left">
            <tbody className="divide-y divide-slate-800/40">
              {laps.map((lap) => {
                const isSelected = lap.lapIndex === selectedLapIndex;

                let metricCellText = lap.paceFormatted || '--';
                if (activeMetric === 'swim_pace') {
                  metricCellText = lap.swimPaceFormatted || '--';
                } else if (activeMetric === 'power') {
                  metricCellText = lap.avgWatts ? `${lap.avgWatts} W` : '--';
                } else if (activeMetric === 'heartrate') {
                  metricCellText = lap.avgHr ? `${lap.avgHr} bpm` : '--';
                } else if (activeMetric === 'speed') {
                  metricCellText = `${lap.avgSpeedKph} kph`;
                }

                return (
                  <tr
                    key={`lap-row-${lap.lapIndex}`}
                    ref={isSelected ? selectedRowRef : null}
                    onClick={() => handleSelectLap(lap.lapIndex)}
                    className={`cursor-pointer transition-colors relative group ${
                      isSelected
                        ? isLight
                          ? 'bg-blue-50/80 text-slate-900 font-bold'
                          : 'bg-blue-950/40 text-white font-bold'
                        : isLight
                        ? 'hover:bg-slate-50 text-slate-700'
                        : 'hover:bg-slate-800/60 text-slate-300'
                    }`}
                  >
                    {/* Left vertical blue selection indicator (matching Strava screenshot row 3) */}
                    <td className="w-1.5 p-0 relative">
                      {isSelected && (
                        <div
                          className={`absolute inset-y-0 left-0 w-1 ${
                            isLight ? 'bg-[#0A3B75]' : 'bg-blue-500'
                          }`}
                        />
                      )}
                    </td>

                    {/* Col 1: Lap Number */}
                    <td className="py-2.5 px-3 w-12 text-slate-400 font-mono">
                      <span className={isSelected ? (isLight ? 'text-slate-900 font-bold' : 'text-white font-bold') : ''}>
                        {lap.lapIndex}
                      </span>
                    </td>

                    {/* Col 2: Distance */}
                    <td className="py-2.5 px-3 font-mono font-medium">
                      {lap.distanceFormatted}
                    </td>

                    {/* Col 3: Duration / Time */}
                    <td className="py-2.5 px-3 text-right font-mono font-medium">
                      {lap.durationFormatted}
                    </td>

                    {/* Col 4: Primary Metric Value (e.g. 3:32 /km, 285 W, 162 bpm) */}
                    <td className="py-2.5 px-4 text-right font-mono font-bold">
                      <span
                        className={
                          isSelected
                            ? isLight
                              ? 'text-[#0A3B75]'
                              : 'text-blue-400'
                            : ''
                        }
                      >
                        {metricCellText}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
