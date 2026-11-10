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
  dayTotalSec: number;
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

  // 4. Build Days and Process Workouts (Per-Day, Non-Cumulative)
  const {
    days,
    processedWorkouts,
    maxDayHours,
    totalSecAllZones,
    zoneTotalSeconds,
  } = useMemo(() => {
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

    let peakDaySec = 0;

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
        const actDurationSec = act.moving_time || act.elapsed_time || 0;

        if (buckets && buckets.length > 0) {
          buckets.forEach((b, idx) => {
            if (idx < numZones) {
              zoneDurations[idx] = b.durationSec;
            }
          });
        } else {
          // Fallback if zone distribution is missing: allocate primary duration to Zone 2
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
          zTotals[zIdx] += sec;
          if (sec > maxZSec) {
            maxZSec = sec;
            primaryZIdx = zIdx;
          }
        });

        const totalHours = actDurationSec / 3600;

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

      const dayTotalSec = dayZoneSec.reduce((a, b) => a + b, 0);
      if (dayTotalSec > peakDaySec) {
        peakDaySec = dayTotalSec;
      }

      dayList.push({
        dayIndex: i,
        date: currentDay,
        dateStr,
        dayLabel: currentDay.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
        isToday: new Date().toISOString().split('T')[0] === dateStr,
        workouts: dayWorkouts,
        dayZoneSec,
        dayTotalSec,
      });
    }

    const totalSecAll = zTotals.reduce((a, b) => a + b, 0);
    const peakDayHours = peakDaySec / 3600;
    let maxDailyH = 2;
    if (peakDayHours <= 1.2) {
      maxDailyH = 1.5;
    } else if (peakDayHours <= 2) {
      maxDailyH = 2.5;
    } else if (peakDayHours <= 3) {
      maxDailyH = 3.5;
    } else if (peakDayHours <= 5) {
      maxDailyH = Math.ceil(peakDayHours * 1.15);
    } else {
      maxDailyH = Math.ceil(peakDayHours * 1.1);
    }

    return {
      days: dayList,
      processedWorkouts: workoutsList,
      maxDayHours: maxDailyH,
      totalSecAllZones: totalSecAll,
      zoneTotalSeconds: zTotals,
    };
  }, [matchingActivities, startDate, endDate, numWeeks, activityDetails, athleteProfile, mode, numZones]);

  // Chart Dimensions & Grid
  const svgWidth = 800;
  const chartHeight = 220;
  const paddingRight = 26; // Space for Y-axis labels & vertical HR/Day title
  const paddingLeft = 6;
  const usableWidth = svgWidth - paddingLeft - paddingRight;
  const totalDays = numWeeks * 7;
  const dayStep = usableWidth / Math.max(1, totalDays - 1);
  const barWidth = Math.max(3.5, Math.min(18, dayStep * 0.82));

  // Y-axis grid marks for daily hours
  const gridSteps = useMemo(() => {
    if (maxDayHours <= 1.5) return [0.5, 1.0, 1.5];
    if (maxDayHours <= 2.5) return [0.5, 1.0, 1.5, 2.0, 2.5];
    if (maxDayHours <= 4) return [1, 2, 3, 4].filter((v) => v <= maxDayHours);
    const step = Math.ceil(maxDayHours / 4);
    const marks: number[] = [];
    for (let v = step; v <= maxDayHours; v += step) {
      marks.push(v);
    }
    return marks;
  }, [maxDayHours]);

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
    <div className="space-y-4">
      {/* 1. Header with Range and Date */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
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
            {modeLabel} (Per Day)
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

      {/* 2. Charts Stage: Daily Stacked Zone Graph (Moved outside nested box to expand full width) */}
      <div className="-mx-4 sm:-mx-5 overflow-x-auto scrollbar-thin pb-2 pt-1">
        {processedWorkouts.length === 0 ? (
          <div className="py-16 text-center space-y-2 px-4">
            <Info className="w-8 h-8 mx-auto text-slate-500 opacity-60" />
            <p className="text-sm font-bold text-slate-400">
              No matching activities in this {numWeeks}-week window
            </p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Select a longer time frame (e.g. 12W or 24W) or record a new session to visualize daily training zones.
            </p>
          </div>
        ) : (
          <div className="space-y-4 px-1">
            {/* SVG Visual Stage */}
            <div className="relative w-full overflow-hidden select-none">
              <svg
                viewBox={`0 0 ${svgWidth} ${chartHeight + 45}`}
                className="w-full h-auto overflow-visible font-sans"
              >
                {/* Horizontal Gridlines & Y-axis labels */}
                {gridSteps.map((val) => {
                  const y = chartHeight - (val / maxDayHours) * chartHeight;
                  return (
                    <g key={`daily-grid-${val}`}>
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
                        x={svgWidth - paddingRight + 4}
                        y={y + 3.5}
                        fontSize="10"
                        fill={isLight ? '#64748b' : '#64748b'}
                        fontFamily="monospace"
                        fontWeight="600"
                      >
                        {val}h
                      </text>
                    </g>
                  );
                })}

                {/* Y-axis Unit Label "HR/Day" written vertically to save horizontal space */}
                <text
                  x={svgWidth - 6}
                  y={chartHeight / 2}
                  transform={`rotate(-90 ${svgWidth - 6} ${chartHeight / 2})`}
                  textAnchor="middle"
                  fontSize="9"
                  fill={isLight ? '#64748b' : '#94a3b8'}
                  fontFamily="monospace"
                  fontWeight="700"
                  letterSpacing="0.08em"
                >
                  HR/Day
                </text>

                {/* Hover Highlight Column behind bars */}
                {hoveredDayIndex !== null && days[hoveredDayIndex] && (() => {
                  const xCenter = paddingLeft + hoveredDayIndex * dayStep;
                  return (
                    <rect
                      x={xCenter - Math.max(8, barWidth)}
                      y={0}
                      width={Math.max(16, barWidth * 2)}
                      height={chartHeight}
                      fill="#38bdf8"
                      opacity={0.12}
                      rx={4}
                      pointerEvents="none"
                    />
                  );
                })()}

                {/* Daily Stacked Zone Bars */}
                {days.map((d) => {
                  const xCenter = paddingLeft + d.dayIndex * dayStep;

                  if (d.dayTotalSec === 0) {
                    // Rest day: faint baseline mark
                    return (
                      <line
                        key={`rest-${d.dayIndex}`}
                        x1={xCenter - barWidth / 2}
                        y1={chartHeight - 1}
                        x2={xCenter + barWidth / 2}
                        y2={chartHeight - 1}
                        stroke={isLight ? '#e2e8f0' : '#1e293b'}
                        strokeWidth="2"
                        opacity="0.4"
                      />
                    );
                  }

                  let currentStackSec = 0;

                  return (
                    <g
                      key={`day-bar-${d.dayIndex}`}
                      className="cursor-pointer transition-opacity hover:opacity-90"
                      onClick={() => {
                        if (d.workouts.length > 0 && onSelectActivity) {
                          onSelectActivity(d.workouts[0].id);
                        }
                      }}
                      onMouseEnter={() => {
                        setHoveredDayIndex(d.dayIndex);
                        if (d.workouts.length > 0) {
                          setHoveredWorkoutId(d.workouts[0].id);
                        }
                      }}
                      onMouseLeave={() => {
                        setHoveredDayIndex(null);
                        setHoveredWorkoutId(null);
                      }}
                    >
                      {zoneIndicesBottomToTop.map((zIdx) => {
                        const zSec = d.dayZoneSec[zIdx];
                        if (!zSec || zSec <= 0) return null;
                        const zHours = zSec / 3600;
                        const segHeight = Math.max(1.5, (zHours / maxDayHours) * chartHeight);
                        const yPos = chartHeight - ((currentStackSec + zSec) / 3600 / maxDayHours) * chartHeight;
                        currentStackSec += zSec;

                        return (
                          <rect
                            key={`day-${d.dayIndex}-z-${zIdx}`}
                            x={xCenter - barWidth / 2}
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
                })}

                {/* Bottom timeline baseline */}
                <line
                  x1={paddingLeft}
                  y1={chartHeight}
                  x2={svgWidth - paddingRight}
                  y2={chartHeight}
                  stroke={isLight ? '#cbd5e1' : '#334155'}
                  strokeWidth="1.5"
                />

                {/* Date ticks along bottom */}
                {dateTicks.map((t) => {
                  const x = paddingLeft + t.dayIndex * dayStep;
                  return (
                    <g key={`dtick-${t.dayIndex}`} transform={`translate(${x}, ${chartHeight + 16})`}>
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
                  y={chartHeight + 30}
                  fontSize="11"
                  fontFamily="monospace"
                  fill={isLight ? '#475569' : '#64748b'}
                  fontWeight="700"
                >
                  {startDate.toLocaleDateString(undefined, { month: 'short' })}
                </text>

                {/* Crosshair line when hovering */}
                {hoveredDayIndex !== null && days[hoveredDayIndex] && (
                  <g pointerEvents="none">
                    <line
                      x1={paddingLeft + hoveredDayIndex * dayStep}
                      y1="0"
                      x2={paddingLeft + hoveredDayIndex * dayStep}
                      y2={chartHeight}
                      stroke="#38bdf8"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                      opacity="0.85"
                    />
                  </g>
                )}
              </svg>
            </div>

            {/* Hover Details Panel (Per-Day) */}
            {hoveredDayIndex !== null && days[hoveredDayIndex] && (
              <div
                className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-all ${
                  isLight
                    ? 'bg-sky-50/80 border-sky-200 text-slate-800'
                    : 'bg-slate-900/90 border-cyan-500/30 text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Calendar className="w-4 h-4 text-cyan-400" />
                  <span className="font-bold">
                    {days[hoveredDayIndex].dayLabel}
                  </span>
                  <span className="font-mono text-cyan-400 font-bold ml-1">
                    Daily Total: {formatHoursMinutes(days[hoveredDayIndex].dayTotalSec)}
                  </span>
                </div>

                {/* Day Zone Breakdown */}
                {days[hoveredDayIndex].dayTotalSec > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap font-mono text-[11px]">
                    {zoneIndicesBottomToTop.map((zIdx) => {
                      const sec = days[hoveredDayIndex].dayZoneSec[zIdx];
                      if (!sec || sec <= 0) return null;
                      const zConfig = zoneConfigs[zIdx];
                      return (
                        <span
                          key={`h-zone-${zIdx}`}
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 border"
                          style={{
                            backgroundColor: `${zConfig.color}20`,
                            borderColor: `${zConfig.color}40`,
                            color: zConfig.color,
                          }}
                        >
                          <span>{zConfig.zone}:</span>
                          <span>{formatHoursMinutes(sec)}</span>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Workouts logged on this day */}
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
