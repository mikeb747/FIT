import React, { useState, useMemo } from 'react';
import {
  Clock,
  Zap,
  Heart,
  Footprints,
  Calendar,
  BarChart2,
  ChevronRight,
  TrendingUp,
  Info,
} from 'lucide-react';
import {
  StravaActivity,
  StravaActivityDetailsRecord,
  classifyActivity,
} from '../utils/stravaActivities';
import {
  AthleteProfile,
  getAthletePowerZones,
  getAthletePaceZones,
  getAthleteHeartRateZones,
} from '../types/athlete';
import {
  calculateActivityZonesTime,
  CalculatedZoneBucket,
} from '../utils/trainingZones';

export type ZoneChartMode = 'cycling_power' | 'running_pace' | 'running_hr';

interface FitnessZoneChartsProps {
  mode: ZoneChartMode;
  activities: StravaActivity[];
  activityDetails?: Record<string, StravaActivityDetailsRecord>;
  athleteProfile?: AthleteProfile;
  numWeeks: number; // 4, 8, 12, 24
  theme?: 'dark' | 'light';
  onSelectActivity?: (activityId: string | number) => void;
}

interface ProcessedWorkout {
  id: string;
  name: string;
  dateStr: string;
  dayIndex: number;
  totalDurationSec: number;
  totalHours: number;
  zoneDurationsSec: number[];
  primaryZoneIndex: number;
  rawActivity: StravaActivity;
}

interface DayData {
  dayIndex: number;
  date: Date;
  dateStr: string; // YYYY-MM-DD
  dayLabel: string;
  isToday: boolean;
  workouts: ProcessedWorkout[];
  dayZoneSec: number[];
  cumZoneSec: number[];
  cumTotalSec: number;
}

export function formatHoursMinutes(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return '0:00';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  return `${hrs}:${mins.toString().padStart(2, '0')}`;
}

export const FitnessZoneCharts: React.FC<FitnessZoneChartsProps> = ({
  mode,
  activities,
  activityDetails = {},
  athleteProfile = {
    age: 38,
    weightKg: 78,
    heightCm: 182,
    restingHeartRate: 48,
    maxHeartRate: 188,
    bikeFtp: 310,
    thresholdHeartRateBike: 168,
    thresholdHeartRateRun: 172,
    thresholdPaceRunOutdoorSec: 228,
  } as AthleteProfile,
  numWeeks,
  theme = 'dark',
  onSelectActivity,
}) => {
  const isLight = theme === 'light';
  const [hoveredDayIndex, setHoveredDayIndex] = useState<number | null>(null);
  const [hoveredWorkoutId, setHoveredWorkoutId] = useState<string | null>(null);

  // 1. Zone Definitions based on mode
  const zoneConfigs = useMemo(() => {
    if (mode === 'cycling_power') {
      return getAthletePowerZones(athleteProfile);
    }
    if (mode === 'running_pace') {
      return getAthletePaceZones(athleteProfile);
    }
    return getAthleteHeartRateZones(athleteProfile, 'run');
  }, [mode, athleteProfile]);

  const numZones = zoneConfigs.length;

  // Ordering: High Intensity at Bottom, Low Intensity at Top (Zone 1 at top)
  // zoneIndicesBottomToTop: [N-1, N-2, ..., 0]
  // e.g., for 7 zones: [6, 5, 4, 3, 2, 1, 0]
  const zoneIndicesBottomToTop = useMemo(() => {
    const indices: number[] = [];
    for (let i = numZones - 1; i >= 0; i--) {
      indices.push(i);
    }
    return indices;
  }, [numZones]);

  // 2. Filter matching activities
  const matchingActivities = useMemo(() => {
    return activities.filter((act) => {
      if (act.isDeleted) return false;
      const classification = classifyActivity(act);
      if (mode === 'cycling_power') {
        return classification.category === 'Bike';
      }
      if (mode === 'running_pace') {
        return classification.category === 'Run';
      }
      if (mode === 'running_hr') {
        return classification.category === 'Run';
      }
      return false;
    });
  }, [activities, mode]);

  // 3. Determine Date Window
  const { startDate, endDate, dateRangeFormatted } = useMemo(() => {
    let refEnd = new Date();
    if (matchingActivities.length > 0) {
      const actTimestamps = matchingActivities.map((a) =>
        new Date(a.start_date_local || a.start_date).getTime()
      );
      const maxActTime = Math.max(...actTimestamps);
      // If activities are in future or past, anchor to the latest activity date or today
      if (maxActTime > refEnd.getTime() || Math.abs(refEnd.getTime() - maxActTime) > 60 * 86400000) {
        refEnd = new Date(maxActTime);
      }
    }
    // Set to end of day
    const end = new Date(refEnd);
    end.setHours(23, 59, 59, 999);

    const totalDays = numWeeks * 7;
    const start = new Date(end);
    start.setDate(end.getDate() - totalDays + 1);
    start.setHours(0, 0, 0, 0);

    const formatOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    const startStr = start.toLocaleDateString(undefined, formatOpts);
    const endStr = end.toLocaleDateString(undefined, {
      ...formatOpts,
      year: 'numeric',
    });

    return {
      startDate: start,
      endDate: end,
      dateRangeFormatted: `${startStr} – ${endStr}`,
    };
  }, [matchingActivities, numWeeks]);

  // 4. Build Days and Process Workouts
  const { days, processedWorkouts, maxCumHours, maxWorkoutHours, totalSecAllZones, zoneTotalSeconds } = useMemo(() => {
    const totalDays = numWeeks * 7;
    const dayList: DayData[] = [];
    const workoutsList: ProcessedWorkout[] = [];
    const zTotals = new Array(numZones).fill(0);

    const startTime = startDate.getTime();
    const endTime = endDate.getTime();

    // Map activities into date strings
    const actsByDateStr: Record<string, StravaActivity[]> = {};
    for (const act of matchingActivities) {
      const actDate = new Date(act.start_date_local || act.start_date);
      if (actDate.getTime() >= startTime && actDate.getTime() <= endTime) {
        const dStr = actDate.toISOString().split('T')[0];
        if (!actsByDateStr[dStr]) actsByDateStr[dStr] = [];
        actsByDateStr[dStr].push(act);
      }
    }

    const runningCum = new Array(numZones).fill(0);
    let peakWorkoutHours = 1;

    for (let i = 0; i < totalDays; i++) {
      const currentDay = new Date(startDate);
      currentDay.setDate(startDate.getDate() + i);
      const dateStr = currentDay.toISOString().split('T')[0];
      const actsOnDay = actsByDateStr[dateStr] || [];

      const dayZoneSec = new Array(numZones).fill(0);
      const dayWorkouts: ProcessedWorkout[] = [];

      for (const act of actsOnDay) {
        const streams = activityDetails[act.id]?.streams;
        const analysis = calculateActivityZonesTime(act, streams, athleteProfile);
        let buckets: CalculatedZoneBucket[] | null = null;
        if (mode === 'cycling_power') buckets = analysis.powerZones;
        else if (mode === 'running_pace') buckets = analysis.paceZones;
        else buckets = analysis.hrZones;

        const zoneDurations = new Array(numZones).fill(0);
        let actDurationSec = act.moving_time || act.elapsed_time || 0;

        if (buckets && buckets.length > 0) {
          buckets.forEach((b, idx) => {
            if (idx < numZones) {
              zoneDurations[idx] = b.durationSec;
            }
          });
        } else {
          // Fallback if zone distribution is missing
          // Allocate primary duration to Zone 2 (base endurance)
          if (zoneDurations.length > 1) {
            zoneDurations[1] = Math.round(actDurationSec * 0.7);
            zoneDurations[0] = Math.round(actDurationSec * 0.15);
            zoneDurations[2] = Math.round(actDurationSec * 0.15);
          } else {
            zoneDurations[0] = actDurationSec;
          }
        }

        let maxZSec = -1;
        let primaryZIdx = 0;
        zoneDurations.forEach((sec, zIdx) => {
          dayZoneSec[zIdx] += sec;
          runningCum[zIdx] += sec;
          zTotals[zIdx] += sec;
          if (sec > maxZSec) {
            maxZSec = sec;
            primaryZIdx = zIdx;
          }
        });

        const totalHours = actDurationSec / 3600;
        if (totalHours > peakWorkoutHours) {
          peakWorkoutHours = totalHours;
        }

        const pw: ProcessedWorkout = {
          id: String(act.id),
          name: act.name || 'Workout',
          dateStr,
          dayIndex: i,
          totalDurationSec: actDurationSec,
          totalHours,
          zoneDurationsSec: zoneDurations,
          primaryZoneIndex: primaryZIdx,
          rawActivity: act,
        };

        dayWorkouts.push(pw);
        workoutsList.push(pw);
      }

      const cumSnapshot = [...runningCum];
      const cumTotalSec = cumSnapshot.reduce((a, b) => a + b, 0);

      dayList.push({
        dayIndex: i,
        date: currentDay,
        dateStr,
        dayLabel: currentDay.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
        isToday: new Date().toISOString().split('T')[0] === dateStr,
        workouts: dayWorkouts,
        dayZoneSec,
        cumZoneSec: cumSnapshot,
        cumTotalSec,
      });
    }

    const totalSecAll = zTotals.reduce((a, b) => a + b, 0);
    const maxCumSec = runningCum.reduce((a, b) => a + b, 0);
    const maxCumHrs = Math.max(1, Math.ceil(maxCumSec / 3600));

    return {
      days: dayList,
      processedWorkouts: workoutsList,
      maxCumHours: Math.max(5, Math.ceil(maxCumHrs * 1.1)),
      maxWorkoutHours: Math.max(2, Math.ceil(peakWorkoutHours * 1.15)),
      totalSecAllZones: totalSecAll,
      zoneTotalSeconds: zTotals,
    };
  }, [matchingActivities, startDate, endDate, numWeeks, activityDetails, athleteProfile, mode, numZones]);

  // Chart Dimensions & Grid
  const svgWidth = 800;
  const areaHeight = 180;
  const barHeight = 100;
  const paddingRight = 45; // Space for Y-axis labels
  const paddingLeft = 10;
  const usableWidth = svgWidth - paddingLeft - paddingRight;
  const totalDays = numWeeks * 7;
  const dayStep = usableWidth / Math.max(1, totalDays - 1);

  // SVG Area Paths Generation
  // High Intensity at Bottom, Low Intensity at Top!
  // Layer k stacked from previous layer top.
  const areaPaths = useMemo(() => {
    if (days.length === 0) return [];

    // cumulative baseline per day as we stack from bottom to top
    const currentBaselineHours = new Array(days.length).fill(0);
    const paths: { zoneIndex: number; color: string; d: string }[] = [];

    // Iterate through zones from bottom to top
    for (const zIdx of zoneIndicesBottomToTop) {
      const color = zoneConfigs[zIdx]?.color || '#38bdf8';
      const bottomPoints: { x: number; y: number }[] = [];
      const topPoints: { x: number; y: number }[] = [];

      for (let d = 0; d < days.length; d++) {
        const x = paddingLeft + d * dayStep;
        const baseH = currentBaselineHours[d];
        const zoneH = days[d].cumZoneSec[zIdx] / 3600;
        const topH = baseH + zoneH;

        // Area Y coordinate: 0 at bottom (areaHeight), maxCumHours at top (0)
        const yBottom = areaHeight - (baseH / maxCumHours) * areaHeight;
        const yTop = areaHeight - (topH / maxCumHours) * areaHeight;

        bottomPoints.push({ x, y: yBottom });
        topPoints.push({ x, y: yTop });

        currentBaselineHours[d] = topH;
      }

      // Build smooth / stepped SVG Path
      // Forward along top points
      let dStr = `M ${topPoints[0].x},${topPoints[0].y}`;
      for (let i = 1; i < topPoints.length; i++) {
        const prev = topPoints[i - 1];
        const curr = topPoints[i];
        const cx1 = prev.x + (curr.x - prev.x) * 0.5;
        const cx2 = cx1;
        dStr += ` C ${cx1},${prev.y} ${cx2},${curr.y} ${curr.x},${curr.y}`;
      }

      // Backward along bottom points
      for (let i = bottomPoints.length - 1; i >= 0; i--) {
        const pt = bottomPoints[i];
        if (i === bottomPoints.length - 1) {
          dStr += ` L ${pt.x},${pt.y}`;
        } else {
          const next = bottomPoints[i + 1];
          const cx1 = next.x - (next.x - pt.x) * 0.5;
          const cx2 = cx1;
          dStr += ` C ${cx1},${next.y} ${cx2},${pt.y} ${pt.x},${pt.y}`;
        }
      }

      dStr += ' Z';
      paths.push({ zoneIndex: zIdx, color, d: dStr });
    }

    return paths;
  }, [days, zoneIndicesBottomToTop, zoneConfigs, dayStep, paddingLeft, areaHeight, maxCumHours]);

  // Area Chart Y-axis grid marks
  const areaGridSteps = useMemo(() => {
    const steps = 4;
    const interval = Math.ceil(maxCumHours / steps);
    const marks: number[] = [];
    for (let v = interval; v <= maxCumHours; v += interval) {
      marks.push(v);
    }
    return marks;
  }, [maxCumHours]);

  // Workout Bar Chart Y-axis grid marks
  const workoutGridSteps = useMemo(() => {
    const marks: number[] = [];
    const maxH = Math.max(2, Math.ceil(maxWorkoutHours));
    const step = maxH <= 3 ? 1 : Math.ceil(maxH / 3);
    for (let v = step; v <= maxH; v += step) {
      marks.push(v);
    }
    return marks;
  }, [maxWorkoutHours]);

  // Date Ticks along bottom (e.g. weekly on Mondays)
  const dateTicks = useMemo(() => {
    return days.filter((d) => d.date.getDay() === 1 || d.dayIndex === 0 || d.dayIndex === days.length - 1);
  }, [days]);

  // Mode Display Name
  const modeLabel = useMemo(() => {
    if (mode === 'cycling_power') return 'Cycling Power Zones';
    if (mode === 'running_pace') return 'Running Pace Zones';
    return 'Running Heart Rate Zones';
  }, [mode]);

  return (
    <div className="space-y-6">
      {/* 1. Header with Range and Date */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm sm:text-base font-extrabold font-mono tracking-tight ${
              isLight ? 'text-slate-800' : 'text-slate-200'
            }`}
          >
            {dateRangeFormatted}
          </span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              isLight
                ? 'bg-slate-100 text-slate-700 border-slate-300'
                : 'bg-slate-800/80 text-cyan-400 border-cyan-500/20'
            }`}
          >
            {modeLabel}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
          <span>
            Total Time: <strong className={isLight ? 'text-slate-900' : 'text-white'}>{formatHoursMinutes(totalSecAllZones)}</strong>
          </span>
          <span>•</span>
          <span>
            {processedWorkouts.length} {processedWorkouts.length === 1 ? 'session' : 'sessions'}
          </span>
        </div>
      </div>

      {/* 2. Charts Stage: Cumulative Area Graph + Workout Distribution Bar Chart */}
      <div
        className={`rounded-2xl p-4 sm:p-5 border transition-all ${
          isLight
            ? 'bg-gradient-to-b from-slate-50 to-white border-slate-200 shadow-xs'
            : 'bg-gradient-to-b from-[#091820] to-[#040d12] border-slate-800 shadow-xl'
        }`}
      >
        {processedWorkouts.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Info className="w-8 h-8 mx-auto text-slate-500 opacity-60" />
            <p className="text-sm font-bold text-slate-400">
              No matching activities in this {numWeeks}-week window
            </p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Select a longer time frame (e.g. 12W or 24W) or record a new session to visualize cumulative zones.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* SVG Visual Stage */}
            <div className="relative w-full overflow-hidden select-none">
              <svg
                viewBox={`0 0 ${svgWidth} ${areaHeight + barHeight + 40}`}
                className="w-full h-auto overflow-visible font-sans"
              >
                {/* ---------------- AREA CHART (Cumulative) ---------------- */}
                <g transform="translate(0, 0)">
                  {/* Horizontal Grid Lines & Labels */}
                  {areaGridSteps.map((val) => {
                    const y = areaHeight - (val / maxCumHours) * areaHeight;
                    return (
                      <g key={`area-grid-${val}`}>
                        <line
                          x1={paddingLeft}
                          y1={y}
                          x2={svgWidth - paddingRight}
                          y2={y}
                          stroke={isLight ? '#e2e8f0' : '#1e293b'}
                          strokeDasharray="3 3"
                          strokeWidth="1"
                        />
                        <text
                          x={svgWidth - paddingRight + 8}
                          y={y + 4}
                          fontSize="11"
                          fill={isLight ? '#64748b' : '#64748b'}
                          fontFamily="monospace"
                          fontWeight="600"
                        >
                          {val}
                        </text>
                      </g>
                    );
                  })}

                  {/* Y-axis Unit Label "hr" */}
                  <text
                    x={svgWidth - paddingRight + 8}
                    y={areaHeight - 4}
                    fontSize="11"
                    fill={isLight ? '#64748b' : '#64748b'}
                    fontFamily="monospace"
                    fontWeight="700"
                  >
                    hr
                  </text>

                  {/* Cumulative Area Paths (Stacked: High intensity at bottom, Zone 1 at top) */}
                  {areaPaths.map((ap) => (
                    <path
                      key={`area-path-${ap.zoneIndex}`}
                      d={ap.d}
                      fill={ap.color}
                      opacity={0.92}
                      className="transition-all hover:opacity-100"
                    />
                  ))}

                  {/* Bottom divider line */}
                  <line
                    x1={paddingLeft}
                    y1={areaHeight}
                    x2={svgWidth - paddingRight}
                    y2={areaHeight}
                    stroke={isLight ? '#cbd5e1' : '#334155'}
                    strokeWidth="1"
                  />
                </g>

                {/* ---------------- WORKOUT BAR CHART (Distribution) ---------------- */}
                <g transform={`translate(0, ${areaHeight + 15})`}>
                  {/* Bar Grid Lines */}
                  {workoutGridSteps.map((val) => {
                    const y = barHeight - (val / maxWorkoutHours) * barHeight;
                    return (
                      <g key={`bar-grid-${val}`}>
                        <line
                          x1={paddingLeft}
                          y1={y}
                          x2={svgWidth - paddingRight}
                          y2={y}
                          stroke={isLight ? '#e2e8f0' : '#1e293b'}
                          strokeDasharray="2 3"
                          strokeWidth="0.8"
                        />
                        <text
                          x={svgWidth - paddingRight + 8}
                          y={y + 4}
                          fontSize="10"
                          fill={isLight ? '#64748b' : '#64748b'}
                          fontFamily="monospace"
                        >
                          {val}
                        </text>
                      </g>
                    );
                  })}

                  {/* Workout Y-axis Unit Label "hr" */}
                  <text
                    x={svgWidth - paddingRight + 8}
                    y={barHeight - 2}
                    fontSize="10"
                    fill={isLight ? '#64748b' : '#64748b'}
                    fontFamily="monospace"
                    fontWeight="700"
                  >
                    hr
                  </text>

                  {/* Stacked Bars for each workout */}
                  {days.map((d) => {
                    if (d.workouts.length === 0) return null;
                    const xCenter = paddingLeft + d.dayIndex * dayStep;
                    const barWidth = Math.max(5, Math.min(14, dayStep * 0.7));

                    return d.workouts.map((w, wIdx) => {
                      let segmentBaseline = 0;
                      // Stacking order: bottom to top
                      return (
                        <g
                          key={w.id}
                          className="cursor-pointer transition-transform hover:scale-105"
                          onClick={() => onSelectActivity && onSelectActivity(w.id)}
                          onMouseEnter={() => {
                            setHoveredDayIndex(d.dayIndex);
                            setHoveredWorkoutId(w.id);
                          }}
                          onMouseLeave={() => {
                            setHoveredDayIndex(null);
                            setHoveredWorkoutId(null);
                          }}
                        >
                          {zoneIndicesBottomToTop.map((zIdx) => {
                            const zSec = w.zoneDurationsSec[zIdx];
                            if (!zSec || zSec <= 0) return null;
                            const zHours = zSec / 3600;
                            const segHeight = Math.max(1.5, (zHours / maxWorkoutHours) * barHeight);
                            const yPos = barHeight - ((segmentBaseline + zHours) / maxWorkoutHours) * barHeight;
                            segmentBaseline += zHours;

                            return (
                              <rect
                                key={`w-${w.id}-z-${zIdx}`}
                                x={xCenter - barWidth / 2 + (wIdx > 0 ? (wIdx * 3) : 0)}
                                y={yPos}
                                width={barWidth}
                                height={segHeight}
                                fill={zoneConfigs[zIdx]?.color || '#38bdf8'}
                                rx={1}
                              />
                            );
                          })}
                        </g>
                      );
                    });
                  })}

                  {/* Bottom timeline axis */}
                  <line
                    x1={paddingLeft}
                    y1={barHeight}
                    x2={svgWidth - paddingRight}
                    y2={barHeight}
                    stroke={isLight ? '#cbd5e1' : '#334155'}
                    strokeWidth="1"
                  />

                  {/* Date labels along bottom */}
                  {dateTicks.map((t) => {
                    const x = paddingLeft + t.dayIndex * dayStep;
                    return (
                      <g key={`dtick-${t.dayIndex}`} transform={`translate(${x}, ${barHeight + 16})`}>
                        <line x1="0" y1="-16" x2="0" y2="-12" stroke={isLight ? '#94a3b8' : '#475569'} strokeWidth="1" />
                        <text
                          textAnchor="middle"
                          fontSize="10"
                          fontFamily="monospace"
                          fill={isLight ? '#64748b' : '#94a3b8'}
                          fontWeight="500"
                        >
                          {t.date.getDate()}
                        </text>
                      </g>
                    );
                  })}

                  {/* Month Label */}
                  <text
                    x={paddingLeft + 30}
                    y={barHeight + 30}
                    fontSize="11"
                    fontFamily="monospace"
                    fill={isLight ? '#475569' : '#64748b'}
                    fontWeight="700"
                  >
                    {startDate.toLocaleDateString(undefined, { month: 'short' })}
                  </text>
                </g>

                {/* Interactive Crosshair when hovering */}
                {hoveredDayIndex !== null && days[hoveredDayIndex] && (
                  <g pointerEvents="none">
                    <line
                      x1={paddingLeft + hoveredDayIndex * dayStep}
                      y1="0"
                      x2={paddingLeft + hoveredDayIndex * dayStep}
                      y2={areaHeight + barHeight + 15}
                      stroke="#38bdf8"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                      opacity="0.85"
                    />
                  </g>
                )}
              </svg>
            </div>

            {/* Hover Details Panel */}
            {hoveredDayIndex !== null && days[hoveredDayIndex] && (
              <div
                className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-all ${
                  isLight
                    ? 'bg-sky-50/80 border-sky-200 text-slate-800'
                    : 'bg-slate-900/90 border-cyan-500/30 text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-cyan-400" />
                  <span className="font-bold">
                    {days[hoveredDayIndex].dayLabel}
                  </span>
                  <span className="font-mono text-cyan-400 font-bold ml-1">
                    Cumulative: {formatHoursMinutes(days[hoveredDayIndex].cumTotalSec)}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap font-mono text-[11px]">
                  {days[hoveredDayIndex].workouts.length > 0 ? (
                    days[hoveredDayIndex].workouts.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => onSelectActivity && onSelectActivity(w.id)}
                        className="px-2 py-1 rounded bg-cyan-500/15 border border-cyan-500/30 hover:bg-cyan-500/25 text-cyan-300 flex items-center gap-1 cursor-pointer"
                      >
                        <span className="truncate max-w-[140px]">{w.name}</span>
                        <strong>{formatHoursMinutes(w.totalDurationSec)}</strong>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    ))
                  ) : (
                    <span className="text-slate-400">Rest Day (No workouts logged)</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Overview Breakdown (Horizontal Progress Bars) */}
      <div
        className={`rounded-2xl p-4 sm:p-5 border transition-all ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-950/70 border-slate-800'
        }`}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800/80">
          <h4
            className={`text-xs sm:text-sm font-extrabold uppercase tracking-wider ${
              isLight ? 'text-slate-800' : 'text-slate-300'
            }`}
          >
            {numWeeks}-WEEK OVERVIEW
          </h4>
          <div className="flex items-center gap-6 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <span className="w-12 text-right">Pct.</span>
            <span className="w-16 text-right">Duration</span>
          </div>
        </div>

        {/* Zone Rows: Ordered from highest zone at top to Zone 1 at bottom (matching screenshots) */}
        <div className="mt-3 space-y-2.5">
          {zoneIndicesBottomToTop.map((zIdx) => {
            const zConfig = zoneConfigs[zIdx];
            const durationSec = zoneTotalSeconds[zIdx] || 0;
            const pct = totalSecAllZones > 0 ? Math.round((durationSec / totalSecAllZones) * 100) : 0;
            const formattedDuration = formatHoursMinutes(durationSec);

            return (
              <div
                key={`zone-row-${zIdx}`}
                className="flex items-center gap-3 sm:gap-4 py-1 group transition-colors"
              >
                {/* Zone Pill */}
                <div className="w-7 sm:w-8 shrink-0 flex items-center gap-1.5">
                  <span
                    className="w-5 h-5 rounded-md flex items-center justify-center text-xs font-black text-slate-950 shadow-xs"
                    style={{ backgroundColor: zConfig.color }}
                  >
                    {zConfig.zone}
                  </span>
                </div>

                {/* Zone Progress Bar Track */}
                <div className="flex-1 relative h-6 sm:h-7 rounded-lg overflow-hidden bg-slate-900 border border-slate-800/80">
                  {/* Diagonal Striped Background Pattern */}
                  <div
                    className="absolute inset-0 opacity-20 pointer-events-none"
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.08) 3px, transparent 3px, transparent 8px)',
                    }}
                  />

                  {/* Filled Progress Bar */}
                  <div
                    className="h-full rounded-md transition-all duration-500 relative"
                    style={{
                      width: `${Math.max(pct > 0 ? 1.5 : 0, pct)}%`,
                      backgroundColor: zConfig.color,
                      boxShadow: `0 0 12px ${zConfig.color}40`,
                    }}
                  />
                </div>

                {/* Pct. Column */}
                <div className="w-12 text-right shrink-0">
                  <span
                    className={`font-mono font-bold text-xs sm:text-sm ${
                      pct > 0 ? (isLight ? 'text-slate-900' : 'text-white') : 'text-slate-500'
                    }`}
                  >
                    {pct}%
                  </span>
                </div>

                {/* Duration Column */}
                <div className="w-16 text-right shrink-0">
                  <span
                    className={`font-mono font-semibold text-xs sm:text-sm ${
                      durationSec > 0 ? (isLight ? 'text-slate-800' : 'text-slate-300') : 'text-slate-500'
                    }`}
                  >
                    {formattedDuration}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
