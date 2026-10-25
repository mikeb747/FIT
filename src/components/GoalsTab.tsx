import React, { useState } from 'react';
import {
  Trophy,
  Target,
  Plus,
  Check,
  Clock,
  Trash2,
  Copy,
  Edit3,
  Calendar,
  Waves,
  Bike,
  Footprints,
  CheckCircle2,
  Circle,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  MapPin,
  X,
} from 'lucide-react';
import {
  TrainingGoal,
  GoalMilestone,
  GoalPriority,
  GoalEventType,
  GoalStatus,
  GoalTargetType,
  RunCourseType,
  SwimWaterType,
  RUN_DISTANCE_PRESETS,
  TRIATHLON_DISTANCE_PRESETS,
  BIKE_DISTANCE_PRESETS,
  SWIM_DISTANCE_PRESETS,
} from '../types/goals';
import { AthleteProfile } from '../types/athlete';

interface GoalsTabProps {
  goals: TrainingGoal[];
  onChangeGoals: (updated: TrainingGoal[]) => void;
  profile: AthleteProfile;
  theme?: 'dark' | 'light';
}

// ---------------------------------------------------------------------------
// Pacing and Time Formatting Helpers
// ---------------------------------------------------------------------------

function formatDurationHms(totalSec: number): string {
  if (!totalSec || totalSec <= 0) return '0:00:00';
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = Math.floor(totalSec % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function parseDurationInput(input: string): number {
  if (!input) return 0;
  const parts = input.trim().split(':').map((p) => parseInt(p, 10) || 0);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    return parts[0] * 60;
  }
  return 0;
}

function formatPaceMinSec(secondsPerKm: number): string {
  if (!secondsPerKm || secondsPerKm <= 0) return '--:--';
  const min = Math.floor(secondsPerKm / 60);
  const sec = Math.round(secondsPerKm % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function formatSwimPace100m(secondsPer100m: number): string {
  if (!secondsPer100m || secondsPer100m <= 0) return '--:--';
  const min = Math.floor(secondsPer100m / 60);
  const sec = Math.round(secondsPer100m % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function getCountdownInfo(eventDateStr: string, isLight: boolean): {
  days: number;
  weeks: number;
  isPast: boolean;
  label: string;
  phase: { name: string; color: string; desc: string };
} {
  if (!eventDateStr) {
    return {
      days: 0,
      weeks: 0,
      isPast: false,
      label: 'Date TBD',
      phase: {
        name: 'Planning',
        color: isLight ? 'text-slate-600 bg-slate-100 border-slate-300' : 'text-slate-400 bg-slate-800 border-slate-700',
        desc: 'Set race date',
      },
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = new Date(eventDateStr);
  eventDate.setHours(0, 0, 0, 0);

  const diffMs = eventDate.getTime() - today.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const weeks = Math.round(days / 7);
  const isPast = days < 0;

  let phase = {
    name: 'Base Phase',
    color: isLight ? 'text-sky-700 bg-sky-50 border-sky-200' : 'text-sky-400 bg-sky-500/10 border-sky-500/30',
    desc: 'Aerobic foundation & economy',
  };

  if (isPast) {
    phase = {
      name: 'Completed',
      color: isLight ? 'text-slate-600 bg-slate-100 border-slate-300' : 'text-slate-400 bg-slate-800 border-slate-700',
      desc: 'Post-event recovery & review',
    };
  } else if (weeks > 16) {
    phase = {
      name: 'Base Phase',
      color: isLight ? 'text-sky-700 bg-sky-50 border-sky-200' : 'text-sky-400 bg-sky-500/10 border-sky-500/30',
      desc: 'Aerobic foundation & volume building',
    };
  } else if (weeks >= 8) {
    phase = {
      name: 'Build Phase',
      color: isLight ? 'text-amber-800 bg-amber-50 border-amber-200' : 'text-amber-400 bg-amber-500/10 border-amber-500/30',
      desc: 'Threshold power & race-pace endurance',
    };
  } else if (weeks >= 3) {
    phase = {
      name: 'Peak Phase',
      color: isLight ? 'text-rose-700 bg-rose-50 border-rose-200' : 'text-rose-400 bg-rose-500/10 border-rose-500/30',
      desc: 'Race simulations & high-intensity tuning',
    };
  } else {
    phase = {
      name: 'Taper Phase',
      color: isLight ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
      desc: 'Freshness, glycogen storage & recovery',
    };
  }

  let label = '';
  if (isPast) {
    label = `${Math.abs(days)}d ago`;
  } else if (days === 0) {
    label = 'Race Day!';
  } else if (days === 1) {
    label = 'Tomorrow!';
  } else if (days < 14) {
    label = `${days} days to go`;
  } else {
    label = `${weeks}w ${days % 7}d left`;
  }

  return { days, weeks, isPast, label, phase };
}

export const GoalsTab: React.FC<GoalsTabProps> = ({ goals, onChangeGoals, profile, theme = 'dark' }) => {
  const isLight = theme === 'light';
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [editingGoal, setEditingGoal] = useState<TrainingGoal | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(goals[0]?.id || null);

  const handleAddNewGoal = (type: GoalEventType = 'triathlon') => {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + 90);
    const dateStr = futureDate.toISOString().split('T')[0];

    const newGoal: TrainingGoal = {
      id: `goal-${Date.now()}`,
      name: type === 'triathlon' ? 'Target Triathlon' : type === 'run' ? 'Target Race' : type === 'bike' ? 'Cycling Event' : 'Swim Meet',
      priority: 'A',
      eventType: type,
      status: 'upcoming',
      targetType: 'time',
      eventDate: dateStr,
      distancePreset: type === 'triathlon' ? '70.3' : type === 'run' ? 'Marathon' : 'Custom',
      totalDistanceKm: type === 'triathlon' ? 113.0 : type === 'run' ? 42.195 : 40.0,
      totalTargetTimeSec: type === 'triathlon' ? 18000 : type === 'run' ? 12600 : 3600,
      triathlonSplits:
        type === 'triathlon'
          ? {
              swimDistanceMeters: 1900,
              swimTargetTimeSec: 2100,
              t1TargetTimeSec: 180,
              bikeDistanceKm: 90.0,
              bikeTargetTimeSec: 9600,
              t2TargetTimeSec: 120,
              runDistanceKm: 21.1,
              runTargetTimeSec: 6000,
            }
          : undefined,
      runCourseType: 'road',
      runTargetPaceSec: 298,
      swimWaterType: 'open_water',
      milestones: [
        {
          id: `ms-${Date.now()}-1`,
          title: 'Mid-block race pace simulation benchmark',
          targetDate: dateStr,
          metricTarget: 'Target threshold effort',
          isCompleted: false,
        },
      ],
      createdAt: new Date().toISOString(),
    };

    setEditingGoal(newGoal);
    setIsEditorOpen(true);
  };

  const handleEditGoal = (goal: TrainingGoal) => {
    setEditingGoal(JSON.parse(JSON.stringify(goal)));
    setIsEditorOpen(true);
  };

  const handleDeleteGoal = (id: string) => {
    const updated = goals.filter((g) => g.id !== id);
    onChangeGoals(updated);
  };

  const handleDuplicateGoal = (goal: TrainingGoal) => {
    const dup: TrainingGoal = {
      ...JSON.parse(JSON.stringify(goal)),
      id: `goal-${Date.now()}`,
      name: `${goal.name} (Copy)`,
      createdAt: new Date().toISOString(),
    };
    onChangeGoals([...goals, dup]);
    setExpandedGoalId(dup.id);
  };

  const handleSaveEditor = (saved: TrainingGoal) => {
    const exists = goals.some((g) => g.id === saved.id);
    let updated: TrainingGoal[];
    if (exists) {
      updated = goals.map((g) => (g.id === saved.id ? saved : g));
    } else {
      updated = [saved, ...goals];
    }
    onChangeGoals(updated);
    setIsEditorOpen(false);
    setEditingGoal(null);
    setExpandedGoalId(saved.id);
  };

  const handleToggleMilestone = (goalId: string, milestoneId: string) => {
    const updated = goals.map((g) => {
      if (g.id !== goalId) return g;
      return {
        ...g,
        milestones: g.milestones.map((m) =>
          m.id === milestoneId ? { ...m, isCompleted: !m.isCompleted } : m
        ),
      };
    });
    onChangeGoals(updated);
  };

  const filteredGoals = goals.filter((g) => {
    if (filterPriority === 'all') return true;
    if (filterPriority === 'A' || filterPriority === 'B' || filterPriority === 'C') {
      return g.priority === filterPriority;
    }
    if (filterPriority === 'upcoming') return g.status === 'upcoming';
    if (filterPriority === 'completed') return g.status === 'completed';
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Tab Header & Quick Action */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b ${
        isLight ? 'border-slate-200' : 'border-slate-800/80'
      }`}>
        <div>
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            <h3 className={`text-sm sm:text-base font-black tracking-tight ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}>
              Race & Performance Goals
            </h3>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
              {goals.length} {goals.length === 1 ? 'Goal' : 'Goals'}
            </span>
          </div>
          <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Define target events and work backwards to establish training paces, splits, and milestones.
          </p>
        </div>

        {/* Add Goal Button */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => handleAddNewGoal('triathlon')}
            className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1 shadow-sm transition-transform active:scale-95 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>Add Goal</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
        {[
          { id: 'all', label: 'All Goals' },
          { id: 'upcoming', label: 'Upcoming' },
          { id: 'A', label: 'A-Goals (Peak)' },
          { id: 'B', label: 'B-Goals' },
          { id: 'C', label: 'C-Goals' },
          { id: 'completed', label: 'Completed' },
        ].map((f) => {
          const isActive = filterPriority === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilterPriority(f.id)}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? isLight
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'bg-slate-800 text-amber-400 border border-slate-700 shadow-sm'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Goals List */}
      {filteredGoals.length === 0 ? (
        <div className={`p-8 text-center rounded-2xl border space-y-3 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'
        }`}>
          <Target className={`w-8 h-8 mx-auto stroke-[1.5] ${isLight ? 'text-slate-400' : 'text-slate-600'}`} />
          <p className={`text-xs max-w-sm mx-auto ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            No goals match this filter. Set up an upcoming triathlon or running target to generate target paces and milestones.
          </p>
          <button
            type="button"
            onClick={() => handleAddNewGoal('triathlon')}
            className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-black inline-flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
            <span>Create First Goal</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGoals.map((goal) => {
            const isExpanded = expandedGoalId === goal.id;
            const countdown = getCountdownInfo(goal.eventDate, isLight);
            const completedCount = goal.milestones.filter((m) => m.isCompleted).length;
            const milestonePct =
              goal.milestones.length > 0
                ? Math.round((completedCount / goal.milestones.length) * 100)
                : 0;

            const priorityBadge =
              goal.priority === 'A'
                ? 'bg-amber-500 text-slate-950 font-black shadow-sm shadow-amber-500/20'
                : goal.priority === 'B'
                ? isLight
                  ? 'bg-sky-100 text-sky-800 border border-sky-300 font-bold'
                  : 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold'
                : isLight
                ? 'bg-slate-100 text-slate-700 border border-slate-300 font-bold'
                : 'bg-slate-800 text-slate-300 border border-slate-700 font-bold';

            return (
              <div
                key={goal.id}
                className={`border rounded-2xl overflow-hidden transition-all ${
                  isLight
                    ? goal.priority === 'A'
                      ? 'bg-white border-amber-400/80 shadow-md shadow-amber-500/10'
                      : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                    : goal.priority === 'A'
                    ? 'bg-slate-950/60 border-amber-500/30 shadow-md shadow-amber-500/5'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Goal Card Header */}
                <div
                  onClick={() => setExpandedGoalId(isExpanded ? null : goal.id)}
                  className={`p-3.5 sm:p-4 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors ${
                    isLight
                      ? 'bg-slate-50/70 hover:bg-slate-100/90'
                      : 'bg-slate-900/40 hover:bg-slate-900/70'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Priority Indicator */}
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs shrink-0 ${priorityBadge}`}
                      title={`Priority ${goal.priority} Goal`}
                    >
                      {goal.priority}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-bold text-sm sm:text-base truncate ${
                          isLight ? 'text-slate-900 font-extrabold' : 'text-white'
                        }`}>
                          {goal.name}
                        </span>
                        <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${
                          isLight
                            ? 'bg-slate-100 text-slate-700 border-slate-200'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}>
                          {goal.eventType}
                          {goal.distancePreset ? ` • ${goal.distancePreset}` : ''}
                        </span>
                        {goal.status === 'completed' && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                            isLight
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          }`}>
                            Completed
                          </span>
                        )}
                      </div>

                      {/* Sub-meta */}
                      <div className={`flex items-center gap-2.5 text-xs mt-1 flex-wrap ${
                        isLight ? 'text-slate-600' : 'text-slate-400'
                      }`}>
                        <div className="flex items-center gap-1">
                          <Calendar className={`w-3.5 h-3.5 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
                          <span>{goal.eventDate || 'Date TBD'}</span>
                        </div>
                        {goal.location && (
                          <div className="flex items-center gap-1 hidden sm:flex">
                            <MapPin className={`w-3.5 h-3.5 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
                            <span className="truncate max-w-[140px]">{goal.location}</span>
                          </div>
                        )}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${countdown.phase.color}`}
                        >
                          {countdown.label} ({countdown.phase.name})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Target Finish Time & Expand Toggle */}
                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="text-right">
                      <span className={`text-xs font-mono font-black block ${
                        isLight ? 'text-amber-600' : 'text-amber-400'
                      }`}>
                        {formatDurationHms(goal.totalTargetTimeSec)}
                      </span>
                      <span className={`text-[10px] font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        {goal.totalDistanceKm > 0 ? `${goal.totalDistanceKm}km` : 'Goal'}
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label="Toggle details"
                      className={`p-1 ${isLight ? 'text-slate-500 hover:text-slate-900' : 'text-slate-400 hover:text-white'}`}
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Goal Details */}
                {isExpanded && (
                  <div className={`p-4 border-t space-y-4 text-xs ${
                    isLight
                      ? 'border-slate-200 bg-slate-50/50 text-slate-800'
                      : 'border-slate-800/80 bg-slate-900/20 text-slate-100'
                  }`}>
                    {/* Working Backwards: Phase & Pacing Benchmark Analysis */}
                    <div className={`rounded-xl p-3 border space-y-2.5 ${
                      isLight
                        ? 'bg-white border-slate-200 shadow-sm'
                        : 'bg-slate-900/80 border-slate-800'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className={`font-bold flex items-center gap-1.5 text-xs ${
                          isLight ? 'text-slate-900' : 'text-slate-300'
                        }`}>
                          <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
                          Training Phase & Target Analysis
                        </span>
                        <span className={`text-[11px] font-medium ${
                          isLight ? 'text-slate-600' : 'text-slate-400'
                        }`}>
                          {countdown.phase.desc}
                        </span>
                      </div>

                      {/* Triathlon Discipline Breakdown or Single Sport Target */}
                      {goal.eventType === 'triathlon' && goal.triathlonSplits ? (
                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1 text-center">
                          {/* Swim */}
                          <div className={`p-2.5 rounded-xl border ${
                            isLight
                              ? 'bg-slate-50 border-slate-200'
                              : 'bg-slate-950/60 border-slate-800'
                          }`}>
                            <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-sky-600 dark:text-sky-400">
                              <Waves className="w-3 h-3" />
                              <span>Swim</span>
                            </div>
                            <div className={`text-xs font-mono font-black mt-1 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                              {formatDurationHms(goal.triathlonSplits.swimTargetTimeSec)}
                            </div>
                            <div className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                              {goal.triathlonSplits.swimDistanceMeters}m
                            </div>
                            <div className="text-[10px] text-sky-600 dark:text-sky-300 font-mono mt-0.5">
                              {goal.triathlonSplits.swimDistanceMeters > 0
                                ? `${formatSwimPace100m(
                                    (goal.triathlonSplits.swimTargetTimeSec /
                                      goal.triathlonSplits.swimDistanceMeters) *
                                      100
                                  )}/100m`
                                : '--'}
                            </div>
                          </div>

                          {/* T1 */}
                          <div className={`p-2.5 rounded-xl border ${
                            isLight
                              ? 'bg-slate-50 border-slate-200'
                              : 'bg-slate-950/60 border-slate-800'
                          }`}>
                            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">T1</span>
                            <div className={`text-xs font-mono font-black mt-1 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                              {formatDurationHms(goal.triathlonSplits.t1TargetTimeSec)}
                            </div>
                            <div className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Transition 1</div>
                          </div>

                          {/* Bike */}
                          <div className={`p-2.5 rounded-xl border ${
                            isLight
                              ? 'bg-slate-50 border-slate-200'
                              : 'bg-slate-950/60 border-slate-800'
                          }`}>
                            <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-orange-600 dark:text-orange-400">
                              <Bike className="w-3 h-3" />
                              <span>Bike</span>
                            </div>
                            <div className={`text-xs font-mono font-black mt-1 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                              {formatDurationHms(goal.triathlonSplits.bikeTargetTimeSec)}
                            </div>
                            <div className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                              {goal.triathlonSplits.bikeDistanceKm}km
                            </div>
                            <div className="text-[10px] text-orange-600 dark:text-orange-300 font-mono mt-0.5">
                              {goal.triathlonSplits.bikeTargetTimeSec > 0
                                ? `${(
                                    goal.triathlonSplits.bikeDistanceKm /
                                    (goal.triathlonSplits.bikeTargetTimeSec / 3600)
                                  ).toFixed(1)} km/h`
                                : '--'}
                              {goal.bikeTargetPowerWatts ? ` • ${goal.bikeTargetPowerWatts}W` : ''}
                            </div>
                          </div>

                          {/* T2 */}
                          <div className={`p-2.5 rounded-xl border ${
                            isLight
                              ? 'bg-slate-50 border-slate-200'
                              : 'bg-slate-950/60 border-slate-800'
                          }`}>
                            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">T2</span>
                            <div className={`text-xs font-mono font-black mt-1 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                              {formatDurationHms(goal.triathlonSplits.t2TargetTimeSec)}
                            </div>
                            <div className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Transition 2</div>
                          </div>

                          {/* Run */}
                          <div className={`p-2.5 rounded-xl border ${
                            isLight
                              ? 'bg-slate-50 border-slate-200'
                              : 'bg-slate-950/60 border-slate-800'
                          }`}>
                            <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                              <Footprints className="w-3 h-3" />
                              <span>Run</span>
                            </div>
                            <div className={`text-xs font-mono font-black mt-1 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                              {formatDurationHms(goal.triathlonSplits.runTargetTimeSec)}
                            </div>
                            <div className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                              {goal.triathlonSplits.runDistanceKm}km
                            </div>
                            <div className="text-[10px] text-emerald-600 dark:text-emerald-300 font-mono mt-0.5">
                              {goal.triathlonSplits.runDistanceKm > 0
                                ? `${formatPaceMinSec(
                                    goal.triathlonSplits.runTargetTimeSec /
                                      goal.triathlonSplits.runDistanceKm
                                  )}/km`
                                : '--'}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                          <div className={`p-2.5 rounded-xl border ${
                            isLight
                              ? 'bg-slate-50 border-slate-200'
                              : 'bg-slate-950/60 border-slate-800'
                          }`}>
                            <span className={`text-[10px] uppercase font-semibold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                              Target Time
                            </span>
                            <div className={`text-sm font-mono font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                              {formatDurationHms(goal.totalTargetTimeSec)}
                            </div>
                          </div>
                          <div className={`p-2.5 rounded-xl border ${
                            isLight
                              ? 'bg-slate-50 border-slate-200'
                              : 'bg-slate-950/60 border-slate-800'
                          }`}>
                            <span className={`text-[10px] uppercase font-semibold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                              Target Pace / Speed
                            </span>
                            <div className={`text-sm font-mono font-black ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                              {goal.eventType === 'run'
                                ? `${formatPaceMinSec(
                                    goal.runTargetPaceSec ||
                                      (goal.totalDistanceKm > 0
                                        ? goal.totalTargetTimeSec / goal.totalDistanceKm
                                        : 0)
                                  )}/km`
                                : goal.eventType === 'bike'
                                ? `${
                                    goal.bikeAvgSpeedKmh ||
                                    (goal.totalTargetTimeSec > 0
                                      ? (
                                          goal.totalDistanceKm /
                                          (goal.totalTargetTimeSec / 3600)
                                        ).toFixed(1)
                                      : '--')
                                  } km/h`
                                : `${formatSwimPace100m(goal.swimTargetPace100mSec || 0)}/100m`}
                            </div>
                          </div>
                          <div className={`p-2.5 rounded-xl border ${
                            isLight
                              ? 'bg-slate-50 border-slate-200'
                              : 'bg-slate-950/60 border-slate-800'
                          }`}>
                            <span className={`text-[10px] uppercase font-semibold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                              Elevation / Course
                            </span>
                            <div className={`text-xs font-semibold capitalize ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                              {goal.runElevationGainMeters || goal.bikeElevationGainMeters
                                ? `+${goal.runElevationGainMeters || goal.bikeElevationGainMeters}m`
                                : goal.runCourseType || goal.swimWaterType || 'Standard'}
                            </div>
                          </div>
                          <div className={`p-2.5 rounded-xl border ${
                            isLight
                              ? 'bg-slate-50 border-slate-200'
                              : 'bg-slate-950/60 border-slate-800'
                          }`}>
                            <span className={`text-[10px] uppercase font-semibold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                              Athlete Threshold
                            </span>
                            <div className={`text-xs font-medium ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                              {goal.eventType === 'run'
                                ? `${formatPaceMinSec(profile.thresholdPaceRunOutdoorSec)}/km LTHR`
                                : goal.eventType === 'bike'
                                ? `${profile.bikeFtp}W FTP`
                                : `${formatSwimPace100m(profile.swimPoolPace100mSec)}/100m CSS`}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Coach Insight comparing to current threshold */}
                      {goal.eventType === 'run' && goal.runTargetPaceSec && (
                        <div className={`text-[11px] p-2.5 rounded-lg border ${
                          isLight
                            ? 'bg-amber-50/80 border-amber-200 text-slate-700'
                            : 'bg-slate-950/40 border-slate-800/60 text-slate-400'
                        }`}>
                          <span className={`font-bold ${isLight ? 'text-amber-800' : 'text-amber-400'}`}>
                            Pacing Insight:{' '}
                          </span>
                          Target pace is{' '}
                          <span className={`font-mono font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                            {formatPaceMinSec(goal.runTargetPaceSec)}/km
                          </span>
                          . Your current threshold pace is{' '}
                          <span className={`font-mono font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                            {formatPaceMinSec(profile.thresholdPaceRunOutdoorSec)}/km
                          </span>{' '}
                          (
                          {Math.round(
                            (profile.thresholdPaceRunOutdoorSec / goal.runTargetPaceSec) * 100
                          )}
                          % of LTHR pace).
                        </div>
                      )}
                    </div>

                    {/* Milestones Section */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          <span className={`font-bold text-xs ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                            Preparation Milestones ({completedCount}/{goal.milestones.length})
                          </span>
                        </div>
                        <span className={`text-[10px] font-mono font-bold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                          {milestonePct}% Complete
                        </span>
                      </div>

                      {/* Milestone Progress Bar */}
                      <div className={`w-full h-1.5 rounded-full overflow-hidden ${
                        isLight ? 'bg-slate-200' : 'bg-slate-800'
                      }`}>
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                          style={{ width: `${milestonePct}%` }}
                        />
                      </div>

                      {/* Milestone items */}
                      <div className="space-y-1.5 pt-1">
                        {goal.milestones.map((m) => (
                          <div
                            key={m.id}
                            onClick={() => handleToggleMilestone(goal.id, m.id)}
                            className={`p-2.5 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                              m.isCompleted
                                ? isLight
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                                  : 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                                : isLight
                                ? 'bg-white border-slate-200 hover:border-slate-300 text-slate-800 shadow-xs'
                                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-300'
                            }`}
                          >
                            <button
                              type="button"
                              className="mt-0.5 text-emerald-500 shrink-0 cursor-pointer"
                              aria-label="Toggle completed"
                            >
                              {m.isCompleted ? (
                                <CheckCircle2 className="w-4 h-4 fill-emerald-500/20 text-emerald-500" />
                              ) : (
                                <Circle className={`w-4 h-4 ${isLight ? 'text-slate-400 hover:text-slate-600' : 'text-slate-600 hover:text-slate-400'}`} />
                              )}
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className={`text-xs font-semibold ${
                                    m.isCompleted
                                      ? isLight
                                        ? 'line-through text-slate-400'
                                        : 'line-through text-slate-500'
                                      : isLight
                                      ? 'text-slate-900 font-bold'
                                      : 'text-slate-100'
                                  }`}
                                >
                                  {m.title}
                                </span>
                                {m.targetDate && (
                                  <span className={`text-[10px] shrink-0 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                                    {m.targetDate}
                                  </span>
                                )}
                              </div>
                              {m.metricTarget && (
                                <span className={`text-[10px] font-mono block mt-0.5 ${isLight ? 'text-amber-700 font-semibold' : 'text-amber-400/90'}`}>
                                  Target: {m.metricTarget}
                                </span>
                              )}
                              {m.notes && (
                                <span className={`text-[10px] block mt-0.5 italic ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                                  {m.notes}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Goal Strategic Notes */}
                    {goal.notes && (
                      <div className={`p-2.5 rounded-xl border text-[11px] ${
                        isLight
                          ? 'bg-slate-100/80 border-slate-200 text-slate-700'
                          : 'bg-slate-900/40 border-slate-800/80 text-slate-400'
                      }`}>
                        <span className={`font-bold block mb-0.5 ${isLight ? 'text-slate-900' : 'text-slate-300'}`}>
                          Strategy & Execution Notes:
                        </span>
                        {goal.notes}
                      </div>
                    )}

                    {/* Goal Card Actions */}
                    <div className={`flex items-center justify-between pt-2 border-t ${
                      isLight ? 'border-slate-200' : 'border-slate-800/80'
                    }`}>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDuplicateGoal(goal)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                            isLight
                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                          }`}
                        >
                          <Copy className="w-3 h-3" />
                          <span>Duplicate</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteGoal(goal.id)}
                          className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-300 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors border border-rose-500/20"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleEditGoal(goal)}
                        className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition-transform"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit Goal & Targets</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Goal Edit / Creation Modal */}
      {isEditorOpen && editingGoal && (
        <GoalEditorModal
          goal={editingGoal}
          onClose={() => {
            setIsEditorOpen(false);
            setEditingGoal(null);
          }}
          onSave={handleSaveEditor}
          profile={profile}
          theme={theme}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Goal Editor Modal Subcomponent (Theme Aware)
// ---------------------------------------------------------------------------

interface GoalEditorModalProps {
  goal: TrainingGoal;
  onClose: () => void;
  onSave: (goal: TrainingGoal) => void;
  profile: AthleteProfile;
  theme?: 'dark' | 'light';
}

const GoalEditorModal: React.FC<GoalEditorModalProps> = ({ goal, onClose, onSave, profile, theme = 'dark' }) => {
  const isLight = theme === 'light';
  const [draft, setDraft] = useState<TrainingGoal>(() => JSON.parse(JSON.stringify(goal)));
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState('');
  const [newMilestoneMetric, setNewMilestoneMetric] = useState('');

  const updateTriathlonField = (
    field: keyof NonNullable<TrainingGoal['triathlonSplits']>,
    value: number
  ) => {
    setDraft((prev) => {
      const splits = prev.triathlonSplits || {
        swimDistanceMeters: 1900,
        swimTargetTimeSec: 2100,
        t1TargetTimeSec: 180,
        bikeDistanceKm: 90,
        bikeTargetTimeSec: 9600,
        t2TargetTimeSec: 120,
        runDistanceKm: 21.1,
        runTargetTimeSec: 6000,
      };

      const updatedSplits = {
        ...splits,
        [field]: value,
      };

      const totalSec =
        (updatedSplits.swimTargetTimeSec || 0) +
        (updatedSplits.t1TargetTimeSec || 0) +
        (updatedSplits.bikeTargetTimeSec || 0) +
        (updatedSplits.t2TargetTimeSec || 0) +
        (updatedSplits.runTargetTimeSec || 0);

      const totalKm = Number(
        (
          (updatedSplits.swimDistanceMeters || 0) / 1000 +
          (updatedSplits.bikeDistanceKm || 0) +
          (updatedSplits.runDistanceKm || 0)
        ).toFixed(2)
      );

      return {
        ...prev,
        triathlonSplits: updatedSplits,
        totalTargetTimeSec: totalSec,
        totalDistanceKm: totalKm,
      };
    });
  };

  const handleApplyPreset = (presetName: string) => {
    if (draft.eventType === 'triathlon') {
      const found = TRIATHLON_DISTANCE_PRESETS.find((p) => p.label === presetName);
      if (found && found.label !== 'Custom') {
        const splits = draft.triathlonSplits || {
          swimDistanceMeters: 0,
          swimTargetTimeSec: 0,
          t1TargetTimeSec: 180,
          bikeDistanceKm: 0,
          bikeTargetTimeSec: 0,
          t2TargetTimeSec: 120,
          runDistanceKm: 0,
          runTargetTimeSec: 0,
        };
        const updatedSplits = {
          ...splits,
          swimDistanceMeters: found.swimMeters,
          bikeDistanceKm: found.bikeKm,
          runDistanceKm: found.runKm,
        };
        setDraft((prev) => ({
          ...prev,
          distancePreset: found.label,
          totalDistanceKm: found.totalDistanceKm,
          triathlonSplits: updatedSplits,
        }));
      } else {
        setDraft((prev) => ({ ...prev, distancePreset: 'Custom' }));
      }
    } else if (draft.eventType === 'run') {
      const found = RUN_DISTANCE_PRESETS.find((p) => p.label === presetName);
      if (found && found.label !== 'Custom') {
        setDraft((prev) => {
          const pace = prev.runTargetPaceSec || 288;
          const targetTime = Math.round(found.distanceKm * pace);
          return {
            ...prev,
            distancePreset: found.label,
            totalDistanceKm: found.distanceKm,
            totalTargetTimeSec: targetTime,
          };
        });
      } else {
        setDraft((prev) => ({ ...prev, distancePreset: 'Custom' }));
      }
    } else if (draft.eventType === 'bike') {
      const found = BIKE_DISTANCE_PRESETS.find((p) => p.label === presetName);
      if (found && found.label !== 'Custom') {
        setDraft((prev) => ({
          ...prev,
          distancePreset: found.label,
          totalDistanceKm: found.distanceKm,
        }));
      } else {
        setDraft((prev) => ({ ...prev, distancePreset: 'Custom' }));
      }
    } else if (draft.eventType === 'swim') {
      const found = SWIM_DISTANCE_PRESETS.find((p) => p.label === presetName);
      if (found && found.label !== 'Custom') {
        setDraft((prev) => ({
          ...prev,
          distancePreset: found.label,
          swimDistanceMeters: found.distanceMeters,
          totalDistanceKm: Number((found.distanceMeters / 1000).toFixed(2)),
        }));
      } else {
        setDraft((prev) => ({ ...prev, distancePreset: 'Custom' }));
      }
    }
  };

  const handleAddMilestone = () => {
    if (!newMilestoneTitle.trim()) return;
    const newM: GoalMilestone = {
      id: `ms-${Date.now()}`,
      title: newMilestoneTitle.trim(),
      targetDate: newMilestoneDate || draft.eventDate,
      metricTarget: newMilestoneMetric.trim() || undefined,
      isCompleted: false,
    };
    setDraft((prev) => ({
      ...prev,
      milestones: [...prev.milestones, newM],
    }));
    setNewMilestoneTitle('');
    setNewMilestoneMetric('');
  };

  const handleRemoveMilestone = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      milestones: prev.milestones.filter((m) => m.id !== id),
    }));
  };

  const inputClass = isLight
    ? 'w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-medium focus:outline-none focus:bg-white focus:border-amber-500'
    : 'w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-medium focus:outline-none focus:border-amber-500';

  const selectClass = isLight
    ? 'w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:border-amber-500 cursor-pointer'
    : 'w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-semibold focus:outline-none focus:border-amber-500 cursor-pointer';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md"
    >
      <div className={`w-full max-w-2xl border rounded-3xl p-4 sm:p-6 shadow-2xl flex flex-col gap-4 max-h-[92vh] overflow-hidden ${
        isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-700 text-slate-100'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between border-b pb-3 shrink-0 ${
          isLight ? 'border-slate-200' : 'border-slate-800'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-500 border border-amber-500/30 flex items-center justify-center font-bold">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <h3 className={`text-base font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {draft.id.startsWith('goal-demo') || draft.name ? 'Edit Goal' : 'New Goal'}
              </h3>
              <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Configure event targets, discipline splits, and preparation milestones
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer ${
              isLight ? 'bg-slate-100 text-slate-600 hover:text-slate-900' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
          {/* Goal Name, Event Date & Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className={`text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Goal / Event Name</label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Ironman 70.3 Mallorca or Valencia Marathon"
                className={inputClass}
              />
            </div>

            <div className="space-y-1">
              <label className={`text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Priority Tier</label>
              <div className="grid grid-cols-3 gap-1">
                {(['A', 'B', 'C'] as GoalPriority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setDraft({ ...draft, priority: p })}
                    className={`py-2 rounded-xl font-black text-xs cursor-pointer transition-all ${
                      draft.priority === p
                        ? p === 'A'
                          ? 'bg-amber-500 text-slate-950 shadow-sm'
                          : p === 'B'
                          ? 'bg-sky-500 text-slate-950'
                          : 'bg-emerald-500 text-slate-950'
                        : isLight
                        ? 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                        : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Event Type & Target Type & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className={`text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Event Type</label>
              <select
                value={draft.eventType}
                onChange={(e) => {
                  const newType = e.target.value as GoalEventType;
                  setDraft((prev) => {
                    const updated = { ...prev, eventType: newType };
                    if (newType === 'triathlon' && !updated.triathlonSplits) {
                      updated.triathlonSplits = {
                        swimDistanceMeters: 1900,
                        swimTargetTimeSec: 2100,
                        t1TargetTimeSec: 180,
                        bikeDistanceKm: 90,
                        bikeTargetTimeSec: 9600,
                        t2TargetTimeSec: 120,
                        runDistanceKm: 21.1,
                        runTargetTimeSec: 6000,
                      };
                    }
                    return updated;
                  });
                }}
                className={selectClass}
              >
                <option value="triathlon">Triathlon (Multi-discipline)</option>
                <option value="run">Running</option>
                <option value="bike">Cycling</option>
                <option value="swim">Swimming</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className={`text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Target Type</label>
              <select
                value={draft.targetType}
                onChange={(e) =>
                  setDraft({ ...draft, targetType: e.target.value as GoalTargetType })
                }
                className={selectClass}
              >
                <option value="time">Achieve Specific Time</option>
                <option value="pace">Achieve Specific Pace</option>
                <option value="finish">Finish The Event</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className={`text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Goal Status</label>
              <select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as GoalStatus })}
                className={selectClass}
              >
                <option value="upcoming">Upcoming</option>
                <option value="completed">Completed</option>
                <option value="abandoned">Abandoned</option>
                <option value="missed">Missed</option>
              </select>
            </div>
          </div>

          {/* Event Date & Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={`text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Event Date</label>
              <input
                type="date"
                value={draft.eventDate}
                onChange={(e) => setDraft({ ...draft, eventDate: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="space-y-1">
              <label className={`text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Location (City, Country)</label>
              <input
                type="text"
                value={draft.location || ''}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                placeholder="e.g. Valencia, Spain"
                className={inputClass}
              />
            </div>
          </div>

          {/* Distance Presets */}
          <div className={`space-y-1.5 p-3 rounded-2xl border ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'
          }`}>
            <label className="text-[11px] font-bold flex items-center justify-between">
              <span className={isLight ? 'text-slate-800' : 'text-slate-300'}>Event Distance Preset</span>
              <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Select preset or adjust custom below</span>
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {draft.eventType === 'triathlon' &&
                TRIATHLON_DISTANCE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handleApplyPreset(p.label)}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer transition-all ${
                      draft.distancePreset === p.label
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : isLight
                        ? 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                        : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-850'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}

              {draft.eventType === 'run' &&
                RUN_DISTANCE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handleApplyPreset(p.label)}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer transition-all ${
                      draft.distancePreset === p.label
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : isLight
                        ? 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                        : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-850'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}

              {draft.eventType === 'bike' &&
                BIKE_DISTANCE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handleApplyPreset(p.label)}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer transition-all ${
                      draft.distancePreset === p.label
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : isLight
                        ? 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                        : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-850'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}

              {draft.eventType === 'swim' &&
                SWIM_DISTANCE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handleApplyPreset(p.label)}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs cursor-pointer transition-all ${
                      draft.distancePreset === p.label
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : isLight
                        ? 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                        : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-850'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
            </div>
          </div>

          {/* TRIATHLON MULTI-DISCIPLINE */}
          {draft.eventType === 'triathlon' && draft.triathlonSplits && (
            <div className={`p-3.5 rounded-2xl border space-y-3 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
            }`}>
              <div className={`flex items-center justify-between border-b pb-2 ${
                isLight ? 'border-slate-200' : 'border-slate-800/80'
              }`}>
                <span className={`font-bold flex items-center gap-1.5 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  <Trophy className="w-4 h-4 text-amber-500" />
                  Triathlon Disciplines & Transitions (Individual Splits)
                </span>
                <span className={`text-[10px] font-mono ${isLight ? 'text-amber-700 font-bold' : 'text-amber-400'}`}>
                  Calculated Total: {formatDurationHms(draft.totalTargetTimeSec)} (
                  {draft.totalDistanceKm}km)
                </span>
              </div>

              {/* Swim */}
              <div className={`grid grid-cols-1 sm:grid-cols-3 gap-2 items-center p-2.5 rounded-xl border ${
                isLight ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800/80'
              }`}>
                <div className="flex items-center gap-2">
                  <Waves className="w-4 h-4 text-sky-500" />
                  <span className="font-bold text-sky-700 dark:text-sky-300">Swim Discipline</span>
                </div>
                <div>
                  <label className={`text-[10px] block ${isLight ? 'text-slate-600 font-semibold' : 'text-slate-400'}`}>Distance (meters)</label>
                  <input
                    type="number"
                    value={draft.triathlonSplits.swimDistanceMeters}
                    onChange={(e) =>
                      updateTriathlonField('swimDistanceMeters', Number(e.target.value) || 0)
                    }
                    className={`w-full rounded-lg px-2.5 py-1.5 font-mono text-xs border ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  />
                </div>
                <div>
                  <label className={`text-[10px] block ${isLight ? 'text-slate-600 font-semibold' : 'text-slate-400'}`}>
                    Target Time (hh:mm:ss or mm:ss)
                  </label>
                  <input
                    type="text"
                    defaultValue={formatDurationHms(draft.triathlonSplits.swimTargetTimeSec)}
                    onBlur={(e) =>
                      updateTriathlonField('swimTargetTimeSec', parseDurationInput(e.target.value))
                    }
                    className={`w-full rounded-lg px-2.5 py-1.5 font-mono text-xs border ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  />
                </div>
              </div>

              {/* T1 */}
              <div className={`grid grid-cols-1 sm:grid-cols-3 gap-2 items-center p-2.5 rounded-xl border ${
                isLight ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800/60'
              }`}>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span className="font-bold text-amber-700 dark:text-amber-300">Transition 1 (T1)</span>
                </div>
                <div className="sm:col-span-2">
                  <label className={`text-[10px] block ${isLight ? 'text-slate-600 font-semibold' : 'text-slate-400'}`}>
                    T1 Target Time (mm:ss)
                  </label>
                  <input
                    type="text"
                    defaultValue={formatDurationHms(draft.triathlonSplits.t1TargetTimeSec)}
                    onBlur={(e) =>
                      updateTriathlonField('t1TargetTimeSec', parseDurationInput(e.target.value))
                    }
                    className={`w-full rounded-lg px-2.5 py-1.5 font-mono text-xs border ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  />
                </div>
              </div>

              {/* Bike */}
              <div className={`grid grid-cols-1 sm:grid-cols-3 gap-2 items-center p-2.5 rounded-xl border ${
                isLight ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800/80'
              }`}>
                <div className="flex items-center gap-2">
                  <Bike className="w-4 h-4 text-orange-500" />
                  <span className="font-bold text-orange-700 dark:text-orange-300">Bike Discipline</span>
                </div>
                <div>
                  <label className={`text-[10px] block ${isLight ? 'text-slate-600 font-semibold' : 'text-slate-400'}`}>Distance (km)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={draft.triathlonSplits.bikeDistanceKm}
                    onChange={(e) =>
                      updateTriathlonField('bikeDistanceKm', Number(e.target.value) || 0)
                    }
                    className={`w-full rounded-lg px-2.5 py-1.5 font-mono text-xs border ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  />
                </div>
                <div>
                  <label className={`text-[10px] block ${isLight ? 'text-slate-600 font-semibold' : 'text-slate-400'}`}>
                    Target Time (hh:mm:ss)
                  </label>
                  <input
                    type="text"
                    defaultValue={formatDurationHms(draft.triathlonSplits.bikeTargetTimeSec)}
                    onBlur={(e) =>
                      updateTriathlonField('bikeTargetTimeSec', parseDurationInput(e.target.value))
                    }
                    className={`w-full rounded-lg px-2.5 py-1.5 font-mono text-xs border ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  />
                </div>
              </div>

              {/* T2 */}
              <div className={`grid grid-cols-1 sm:grid-cols-3 gap-2 items-center p-2.5 rounded-xl border ${
                isLight ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800/60'
              }`}>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span className="font-bold text-amber-700 dark:text-amber-300">Transition 2 (T2)</span>
                </div>
                <div className="sm:col-span-2">
                  <label className={`text-[10px] block ${isLight ? 'text-slate-600 font-semibold' : 'text-slate-400'}`}>
                    T2 Target Time (mm:ss)
                  </label>
                  <input
                    type="text"
                    defaultValue={formatDurationHms(draft.triathlonSplits.t2TargetTimeSec)}
                    onBlur={(e) =>
                      updateTriathlonField('t2TargetTimeSec', parseDurationInput(e.target.value))
                    }
                    className={`w-full rounded-lg px-2.5 py-1.5 font-mono text-xs border ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  />
                </div>
              </div>

              {/* Run */}
              <div className={`grid grid-cols-1 sm:grid-cols-3 gap-2 items-center p-2.5 rounded-xl border ${
                isLight ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800/80'
              }`}>
                <div className="flex items-center gap-2">
                  <Footprints className="w-4 h-4 text-emerald-500" />
                  <span className="font-bold text-emerald-700 dark:text-emerald-300">Run Discipline</span>
                </div>
                <div>
                  <label className={`text-[10px] block ${isLight ? 'text-slate-600 font-semibold' : 'text-slate-400'}`}>Distance (km)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={draft.triathlonSplits.runDistanceKm}
                    onChange={(e) =>
                      updateTriathlonField('runDistanceKm', Number(e.target.value) || 0)
                    }
                    className={`w-full rounded-lg px-2.5 py-1.5 font-mono text-xs border ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  />
                </div>
                <div>
                  <label className={`text-[10px] block ${isLight ? 'text-slate-600 font-semibold' : 'text-slate-400'}`}>
                    Target Time (hh:mm:ss)
                  </label>
                  <input
                    type="text"
                    defaultValue={formatDurationHms(draft.triathlonSplits.runTargetTimeSec)}
                    onBlur={(e) =>
                      updateTriathlonField('runTargetTimeSec', parseDurationInput(e.target.value))
                    }
                    className={`w-full rounded-lg px-2.5 py-1.5 font-mono text-xs border ${
                      isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                    }`}
                  />
                </div>
              </div>

              {/* Optional Bike Target Power & Elevation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className={`text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    Target Bike Power (Watts - Optional)
                  </label>
                  <input
                    type="number"
                    value={draft.bikeTargetPowerWatts || ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        bikeTargetPowerWatts: Number(e.target.value) || undefined,
                      })
                    }
                    placeholder="e.g. 235"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={`text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    Bike Elevation Gain (Meters)
                  </label>
                  <input
                    type="number"
                    value={draft.bikeElevationGainMeters || ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        bikeElevationGainMeters: Number(e.target.value) || undefined,
                      })
                    }
                    placeholder="e.g. 850"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          )}

          {/* RUNNING TARGETS */}
          {draft.eventType === 'run' && (
            <div className={`p-3.5 rounded-2xl border space-y-3 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
            }`}>
              <span className={`font-bold flex items-center gap-1.5 border-b pb-2 ${
                isLight ? 'border-slate-200 text-slate-900' : 'border-slate-800 text-white'
              }`}>
                <Footprints className="w-4 h-4 text-amber-500" />
                Running Specific Targets
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className={`text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Distance (km)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={draft.totalDistanceKm}
                    onChange={(e) => {
                      const km = Number(e.target.value) || 0;
                      const pace = draft.runTargetPaceSec || 285;
                      setDraft({
                        ...draft,
                        totalDistanceKm: km,
                        totalTargetTimeSec: Math.round(km * pace),
                      });
                    }}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1">
                  <label className={`text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    Target Finish Time (hh:mm:ss)
                  </label>
                  <input
                    type="text"
                    defaultValue={formatDurationHms(draft.totalTargetTimeSec)}
                    onBlur={(e) => {
                      const sec = parseDurationInput(e.target.value);
                      const km = draft.totalDistanceKm || 1;
                      setDraft({
                        ...draft,
                        totalTargetTimeSec: sec,
                        runTargetPaceSec: Math.round(sec / km),
                      });
                    }}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1">
                  <label className={`text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    Target Pace (mm:ss/km)
                  </label>
                  <input
                    type="text"
                    defaultValue={formatPaceMinSec(
                      draft.runTargetPaceSec ||
                        (draft.totalDistanceKm > 0
                          ? draft.totalTargetTimeSec / draft.totalDistanceKm
                          : 285)
                    )}
                    onBlur={(e) => {
                      const paceSec = parseDurationInput(e.target.value);
                      const km = draft.totalDistanceKm || 1;
                      setDraft({
                        ...draft,
                        runTargetPaceSec: paceSec,
                        totalTargetTimeSec: Math.round(km * paceSec),
                      });
                    }}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className={`text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Course Type</label>
                  <select
                    value={draft.runCourseType || 'road'}
                    onChange={(e) =>
                      setDraft({ ...draft, runCourseType: e.target.value as RunCourseType })
                    }
                    className={selectClass}
                  >
                    <option value="road">Road</option>
                    <option value="trail">Trail</option>
                    <option value="track">Track</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className={`text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    Elevation Gain (meters)
                  </label>
                  <input
                    type="number"
                    value={draft.runElevationGainMeters || ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        runElevationGainMeters: Number(e.target.value) || undefined,
                      })
                    }
                    placeholder="e.g. 150"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          )}

          {/* CYCLING TARGETS */}
          {draft.eventType === 'bike' && (
            <div className={`p-3.5 rounded-2xl border space-y-3 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
            }`}>
              <span className={`font-bold flex items-center gap-1.5 border-b pb-2 ${
                isLight ? 'border-slate-200 text-slate-900' : 'border-slate-800 text-white'
              }`}>
                <Bike className="w-4 h-4 text-orange-500" />
                Cycling Specific Targets
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className={`text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Distance (km)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={draft.totalDistanceKm}
                    onChange={(e) =>
                      setDraft({ ...draft, totalDistanceKm: Number(e.target.value) || 0 })
                    }
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1">
                  <label className={`text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    Target Time (hh:mm:ss)
                  </label>
                  <input
                    type="text"
                    defaultValue={formatDurationHms(draft.totalTargetTimeSec)}
                    onBlur={(e) => {
                      const sec = parseDurationInput(e.target.value);
                      const speed =
                        sec > 0 && draft.totalDistanceKm > 0
                          ? Number((draft.totalDistanceKm / (sec / 3600)).toFixed(1))
                          : undefined;
                      setDraft({ ...draft, totalTargetTimeSec: sec, bikeAvgSpeedKmh: speed });
                    }}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1">
                  <label className={`text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    Average Speed (km/h)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={draft.bikeAvgSpeedKmh || ''}
                    onChange={(e) =>
                      setDraft({ ...draft, bikeAvgSpeedKmh: Number(e.target.value) || undefined })
                    }
                    placeholder="e.g. 35.5"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className={`text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    Target Power (Watts - Optional)
                  </label>
                  <input
                    type="number"
                    value={draft.bikeTargetPowerWatts || ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        bikeTargetPowerWatts: Number(e.target.value) || undefined,
                      })
                    }
                    placeholder={`e.g. ${Math.round(profile.bikeFtp * 0.8)}`}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1">
                  <label className={`text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    Elevation Gain (meters)
                  </label>
                  <input
                    type="number"
                    value={draft.bikeElevationGainMeters || ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        bikeElevationGainMeters: Number(e.target.value) || undefined,
                      })
                    }
                    placeholder="e.g. 600"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          )}

          {/* SWIMMING TARGETS */}
          {draft.eventType === 'swim' && (
            <div className={`p-3.5 rounded-2xl border space-y-3 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
            }`}>
              <span className={`font-bold flex items-center gap-1.5 border-b pb-2 ${
                isLight ? 'border-slate-200 text-slate-900' : 'border-slate-800 text-white'
              }`}>
                <Waves className="w-4 h-4 text-sky-500" />
                Swimming Specific Targets
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className={`text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Distance (meters)</label>
                  <input
                    type="number"
                    value={draft.swimDistanceMeters || draft.totalDistanceKm * 1000}
                    onChange={(e) => {
                      const m = Number(e.target.value) || 0;
                      setDraft({
                        ...draft,
                        swimDistanceMeters: m,
                        totalDistanceKm: Number((m / 1000).toFixed(3)),
                      });
                    }}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1">
                  <label className={`text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    Target Time (mm:ss or hh:mm:ss)
                  </label>
                  <input
                    type="text"
                    defaultValue={formatDurationHms(draft.totalTargetTimeSec)}
                    onBlur={(e) => {
                      const sec = parseDurationInput(e.target.value);
                      const m = draft.swimDistanceMeters || draft.totalDistanceKm * 1000;
                      const pace100m = m > 0 ? Math.round((sec / m) * 100) : 0;
                      setDraft({
                        ...draft,
                        totalTargetTimeSec: sec,
                        swimTargetPace100mSec: pace100m,
                      });
                    }}
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1">
                  <label className={`text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Course / Water</label>
                  <select
                    value={draft.swimWaterType || 'open_water'}
                    onChange={(e) =>
                      setDraft({ ...draft, swimWaterType: e.target.value as SwimWaterType })
                    }
                    className={selectClass}
                  >
                    <option value="open_water">Open Water</option>
                    <option value="pool">Pool</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* INTERMEDIATE PERFORMANCE & TRAINING MILESTONES */}
          <div className={`p-3.5 rounded-2xl border space-y-3 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}>
            <span className={`font-bold flex items-center justify-between border-b pb-2 ${
              isLight ? 'border-slate-200 text-slate-900' : 'border-slate-800 text-white'
            }`}>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Intermediate Performance & Training Milestones
              </span>
              <span className={`text-[10px] font-normal ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {draft.milestones.length} defined
              </span>
            </span>

            {/* List Existing Milestones */}
            <div className="space-y-1.5">
              {draft.milestones.map((m) => (
                <div
                  key={m.id}
                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                    isLight ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <span className={`font-semibold block text-xs ${isLight ? 'text-slate-900' : 'text-white'}`}>{m.title}</span>
                    <div className={`flex items-center gap-2 text-[10px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      <span>Date: {m.targetDate || 'TBD'}</span>
                      {m.metricTarget && (
                        <span className={isLight ? 'text-amber-700 font-bold' : 'text-amber-400'}>Target: {m.metricTarget}</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveMilestone(m.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add New Milestone inputs */}
            <div className={`p-2.5 rounded-xl border space-y-2 ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800/80'
            }`}>
              <span className={`text-[11px] font-bold block ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>
                + Add Milestone Target
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newMilestoneTitle}
                  onChange={(e) => setNewMilestoneTitle(e.target.value)}
                  placeholder="Milestone title (e.g. 30km Long Run)"
                  className={`sm:col-span-2 rounded-lg px-2.5 py-1.5 text-xs border ${
                    isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                  }`}
                />
                <input
                  type="date"
                  value={newMilestoneDate}
                  onChange={(e) => setNewMilestoneDate(e.target.value)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs border ${
                    isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                  }`}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newMilestoneMetric}
                  onChange={(e) => setNewMilestoneMetric(e.target.value)}
                  placeholder="Metric target (e.g. Sub-45m 10k or 280W TT)"
                  className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs border ${
                    isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                  }`}
                />
                <button
                  type="button"
                  onClick={handleAddMilestone}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs cursor-pointer shadow-xs"
                >
                  Add Milestone
                </button>
              </div>
            </div>
          </div>

          {/* Strategic Notes */}
          <div className="space-y-1">
            <label className={`text-[11px] font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              Race Strategy & Nutrition Notes
            </label>
            <textarea
              rows={2}
              value={draft.notes || ''}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              placeholder="e.g. Target negative split, 60g carbs/hr on bike, watch pacing on climbs..."
              className={inputClass}
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className={`flex items-center justify-end gap-2 pt-3 border-t shrink-0 ${
          isLight ? 'border-slate-200' : 'border-slate-800'
        }`}>
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
              isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
            }`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            className="px-5 py-2 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer shadow-sm active:scale-95 transition-transform"
          >
            Save Goal
          </button>
        </div>
      </div>
    </div>
  );
};
