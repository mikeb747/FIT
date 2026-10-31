import React, { useState, useMemo } from 'react';
import {
  Zap,
  TrendingUp,
  Activity,
  Award,
  Waves,
  Bike,
  Footprints,
  Calendar,
  AlertTriangle,
  Info,
  CheckCircle2,
  Sliders,
  ChevronDown,
  ChevronUp,
  Sparkles,
  BarChart2,
  PieChart,
  Filter,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import {
  StravaActivity,
  StravaActivityDetailsRecord,
  classifyActivity,
  getCachedStravaActivityRecord,
  fetchStravaActivityDetails,
} from '../utils/stravaActivities';
import { AthleteProfile, formatSecondsToMinSec } from '../types/athlete';
import { TrainingGoal } from '../types/goals';
import {
  computeFitnessTimeline,
  calculateTriathlonFitnessIndex,
  TriathlonDistanceModel,
  DISTANCE_MODEL_PROFILES,
  DailyFitnessRecord,
  RunningDistanceModel,
  RUNNING_MODEL_PROFILES,
  CyclingDistanceModel,
  CYCLING_MODEL_PROFILES,
  SwimmingDistanceModel,
  SWIMMING_MODEL_PROFILES,
} from '../utils/fitnessEngine';
import { WeeklyMileageChart } from './WeeklyMileageChart';
import { ActivityZoneChart } from './ActivityZoneChart';
import { StravaActivityModal } from './StravaActivityModal';

interface FitnessTabProps {
  activities: StravaActivity[];
  activityDetails: Record<string, StravaActivityDetailsRecord>;
  athleteProfile: AthleteProfile;
  goals: TrainingGoal[];
  theme?: 'dark' | 'light';
  stravaToken?: string | null;
  isGoogleConnected?: boolean;
  onOpenSettings?: () => void;
  onConnectGoogle?: () => void;
  onActivityPublished?: (activityId: string) => void;
  onDeleteActivity?: (activityId: string | number) => void;
}

type SportFilter = 'triathlon' | 'run' | 'bike' | 'swim';

export const FitnessTab: React.FC<FitnessTabProps> = ({
  activities,
  activityDetails,
  athleteProfile,
  goals,
  theme = 'dark',
  stravaToken = null,
  isGoogleConnected = false,
  onOpenSettings,
  onConnectGoogle = () => {},
  onActivityPublished,
  onDeleteActivity,
}) => {
  const isLight = theme === 'light';

  // Sport / Discipline Selector: Triathlon, Running, Cycling, Swimming
  const [selectedSport, setSelectedSport] = useState<SportFilter>('triathlon');

  // Race Distance Model for Triathlon preparation targets
  const [selectedModel, setSelectedModel] = useState<TriathlonDistanceModel>('middle_70_3');
  const [selectedRunningModel, setSelectedRunningModel] = useState<RunningDistanceModel>('ten_miler_10');
  const [selectedCyclingModel, setSelectedCyclingModel] = useState<CyclingDistanceModel>('fifty_m_50');
  const [selectedSwimmingModel, setSelectedSwimmingModel] = useState<SwimmingDistanceModel>('swim_1_9k');
  const [timelineLookback, setTimelineLookback] = useState<number>(60); // 30, 60, 90 days
  const [selectedChartDiscipline, setSelectedChartDiscipline] = useState<'combined' | 'swim' | 'bike' | 'run'>('combined');
  const [hoveredRecord, setHoveredRecord] = useState<DailyFitnessRecord | null>(null);

  // Selected Activity for Per-Activity Zone Analysis
  const [selectedZoneActivityId, setSelectedZoneActivityId] = useState<string | number | null>(null);

  // Modal inspection state
  const [activeModalActivity, setActiveModalActivity] = useState<StravaActivity | null>(null);

  // Compute daily fitness timeline across all historical activities
  const fitnessTimeline = useMemo(() => {
    return computeFitnessTimeline(activities, activityDetails, athleteProfile, timelineLookback);
  }, [activities, activityDetails, athleteProfile, timelineLookback]);

  // Today / latest record
  const latestRecord = useMemo(() => {
    if (fitnessTimeline.length === 0) {
      return {
        date: new Date().toISOString().split('T')[0],
        swimTss: 0,
        bikeTss: 0,
        runTss: 0,
        otherTss: 0,
        totalTriTss: 0,
        totalAllTss: 0,
        swimCtl: 0,
        bikeCtl: 0,
        runCtl: 0,
        triCtl: 0,
        swimAtl: 0,
        bikeAtl: 0,
        runAtl: 0,
        triAtl: 0,
        swimTsb: 0,
        bikeTsb: 0,
        runTsb: 0,
        triTsb: 0,
      } as DailyFitnessRecord;
    }
    return fitnessTimeline[fitnessTimeline.length - 1];
  }, [fitnessTimeline]);

  // Compute Triathlon Fitness Index
  const fitnessIndexResult = useMemo(() => {
    return calculateTriathlonFitnessIndex(
      latestRecord.swimCtl,
      latestRecord.bikeCtl,
      latestRecord.runCtl,
      selectedModel,
      goals
    );
  }, [latestRecord, selectedModel, goals]);

  // Dynamic Discipline-specific metrics
  const disciplineFitness = useMemo(() => {
    if (selectedSport === 'run') {
      const runProfile = RUNNING_MODEL_PROFILES[selectedRunningModel];
      const targetRun = runProfile.targetRunCtl;
      const score = Math.min(100, Math.round((latestRecord.runCtl / targetRun) * 100));
      return {
        title: 'Running Performance Readiness',
        headerTitle: 'Running Readiness & Training Load',
        subtitle: `${runProfile.description}. Running 42d rCTL, 7d rATL, Form (rTSB), and weekly Monday–Sunday mileage.`,
        score,
        target: targetRun,
        ctl: latestRecord.runCtl,
        atl: latestRecord.runAtl,
        tsb: latestRecord.runTsb,
        label: `${latestRecord.runCtl} / ${targetRun} rCTL Target`,
        formula: `rCTL (42d) / Target (${targetRun} rCTL)`,
        badge: runProfile.label,
      };
    }

    if (selectedSport === 'bike') {
      const bikeProfile = CYCLING_MODEL_PROFILES[selectedCyclingModel];
      const targetBike = bikeProfile.targetBikeCtl;
      const score = Math.min(100, Math.round((latestRecord.bikeCtl / targetBike) * 100));
      return {
        title: 'Cycling Performance Readiness',
        headerTitle: 'Cycling Readiness & Training Load',
        subtitle: `${bikeProfile.description}. Cycling 42d bCTL, 7d bATL, Form (bTSB), and Coggan power zones.`,
        score,
        target: targetBike,
        ctl: latestRecord.bikeCtl,
        atl: latestRecord.bikeAtl,
        tsb: latestRecord.bikeTsb,
        label: `${latestRecord.bikeCtl} / ${targetBike} bCTL Target`,
        formula: `bCTL (42d) / Target (${targetBike} bCTL)`,
        badge: bikeProfile.label,
      };
    }

    if (selectedSport === 'swim') {
      const swimProfile = SWIMMING_MODEL_PROFILES[selectedSwimmingModel];
      const targetSwim = swimProfile.targetSwimCtl;
      const score = Math.min(100, Math.round((latestRecord.swimCtl / targetSwim) * 100));
      return {
        title: 'Swimming Performance Readiness',
        headerTitle: 'Swimming Readiness & Training Load',
        subtitle: `${swimProfile.description}. Swimming 42d sCTL, 7d sATL, Form (sTSB), CSS pace, and consistency.`,
        score,
        target: targetSwim,
        ctl: latestRecord.swimCtl,
        atl: latestRecord.swimAtl,
        tsb: latestRecord.swimTsb,
        label: `${latestRecord.swimCtl} / ${targetSwim} sCTL Target`,
        formula: `sCTL (42d) / Target (${targetSwim} sCTL)`,
        badge: swimProfile.label,
      };
    }

    // Default: Triathlon
    return {
      title: 'Triathlon Performance Readiness',
      headerTitle: 'Triathlon Readiness & Training Load',
      subtitle: 'Running 42d CTL, 7d ATL, and Form (TSB) split between Swim, Bike, and Run with race-weighted geometric preparation index.',
      score: Math.round(fitnessIndexResult.tfi),
      target: fitnessIndexResult.weights.targetTriCtl,
      ctl: latestRecord.triCtl,
      atl: latestRecord.triAtl,
      tsb: latestRecord.triTsb,
      label: fitnessIndexResult.weights.label,
      formula: `S^${fitnessIndexResult.weights.swimWeight} · B^${fitnessIndexResult.weights.bikeWeight} · R^${fitnessIndexResult.weights.runWeight}`,
      badge: fitnessIndexResult.weights.label,
    };
  }, [selectedSport, selectedRunningModel, selectedCyclingModel, selectedSwimmingModel, latestRecord, fitnessIndexResult]);

  // Filter activities matching the sport for the Activity Zone Analyzer
  const relevantActivitiesForZones = useMemo(() => {
    return activities.filter((act) => {
      const cls = classifyActivity(act);
      if (selectedSport === 'run') return cls.category === 'Run';
      if (selectedSport === 'bike') return cls.category === 'Bike';
      if (selectedSport === 'swim') return cls.category === 'Swim';
      return true; // all
    });
  }, [activities, selectedSport]);

  // Current activity for zone chart
  const activeZoneActivity = useMemo(() => {
    if (selectedZoneActivityId) {
      const found = activities.find((a) => String(a.id) === String(selectedZoneActivityId));
      if (found) return found;
    }
    // Default to the most recent relevant activity
    return relevantActivitiesForZones.length > 0 ? relevantActivitiesForZones[0] : null;
  }, [selectedZoneActivityId, activities, relevantActivitiesForZones]);

  // Local cache of loaded activity details records (with 1-sec streams) for zone analysis
  const [loadedZoneDetails, setLoadedZoneDetails] = useState<Record<string, StravaActivityDetailsRecord>>({});
  const [isLoadingZoneStreams, setIsLoadingZoneStreams] = useState(false);

  // Auto-load 1-sec telemetry streams for the active zone activity from IndexedDB or Strava API
  React.useEffect(() => {
    if (!activeZoneActivity) return;
    const actId = String(activeZoneActivity.id);

    // If streams are already present in activityDetails prop or in loadedZoneDetails, skip
    if (activityDetails[actId]?.streams || loadedZoneDetails[actId]?.streams) return;

    let isCancelled = false;
    async function loadStreams() {
      setIsLoadingZoneStreams(true);
      try {
        // 1. Try reading from IndexedDB
        const cached = await getCachedStravaActivityRecord(actId);
        if (cached?.streams) {
          if (!isCancelled) {
            setLoadedZoneDetails((prev) => ({ ...prev, [actId]: cached }));
          }
          return;
        }

        // 2. If not cached, fetch via Strava API if token is provided
        if (stravaToken) {
          const fresh = await fetchStravaActivityDetails(actId, stravaToken);
          if (!isCancelled && fresh) {
            const updated = await getCachedStravaActivityRecord(actId);
            if (updated) {
              setLoadedZoneDetails((prev) => ({ ...prev, [actId]: updated }));
            }
          }
        }
      } catch (err) {
        console.warn('Could not load streams for fitness zone chart:', err);
      } finally {
        if (!isCancelled) setIsLoadingZoneStreams(false);
      }
    }

    loadStreams();
    return () => {
      isCancelled = true;
    };
  }, [activeZoneActivity, activityDetails, loadedZoneDetails, stravaToken]);

  const currentZoneStreams =
    activeZoneActivity
      ? (activityDetails[String(activeZoneActivity.id)]?.streams ||
         loadedZoneDetails[String(activeZoneActivity.id)]?.streams)
      : undefined;

  // Active A-Goal Triathlon for custom display
  const activeTriGoal = useMemo(() => {
    return goals.find((g) => g.priority === 'A' && g.eventType === 'triathlon') || goals[0];
  }, [goals]);

  // Sync timeline chart discipline when selected sport changes
  React.useEffect(() => {
    if (selectedSport === 'run') setSelectedChartDiscipline('run');
    else if (selectedSport === 'bike') setSelectedChartDiscipline('bike');
    else if (selectedSport === 'swim') setSelectedChartDiscipline('swim');
    else setSelectedChartDiscipline('combined');
  }, [selectedSport]);

  // Interactive timeline hover state
  const [hoveredTimelineIdx, setHoveredTimelineIdx] = useState<number | null>(null);

  // Dynamic Y-axis scaling for Fitness, Fatigue & Form Timeline
  // Adjusts dynamically to whatever data is actually displayed (CTL, ATL, TSB)
  const chartScaling = useMemo(() => {
    if (fitnessTimeline.length === 0) {
      return { yMin: 0, yMax: 50, range: 50, ticks: [0, 10, 20, 30, 40, 50] };
    }

    const ctlVals: number[] = [];
    const atlVals: number[] = [];
    const tsbVals: number[] = [];

    fitnessTimeline.forEach((r) => {
      const ctl =
        selectedChartDiscipline === 'swim'
          ? r.swimCtl
          : selectedChartDiscipline === 'bike'
          ? r.bikeCtl
          : selectedChartDiscipline === 'run'
          ? r.runCtl
          : r.triCtl;
      const atl =
        selectedChartDiscipline === 'swim'
          ? r.swimAtl
          : selectedChartDiscipline === 'bike'
          ? r.bikeAtl
          : selectedChartDiscipline === 'run'
          ? r.runAtl
          : r.triAtl;
      const tsb =
        selectedChartDiscipline === 'swim'
          ? r.swimTsb
          : selectedChartDiscipline === 'bike'
          ? r.bikeTsb
          : selectedChartDiscipline === 'run'
          ? r.runTsb
          : r.triTsb;
      ctlVals.push(ctl);
      atlVals.push(atl);
      tsbVals.push(tsb);
    });

    const maxVal = Math.max(...ctlVals, ...atlVals, ...tsbVals, 5);
    const minVal = Math.min(...tsbVals, 0);

    // Dynamic upper bound adjusted directly to the displayed maximum
    let yMax: number;
    if (maxVal <= 20) {
      yMax = Math.ceil((maxVal + 2) / 5) * 5;
    } else if (maxVal <= 50) {
      yMax = Math.ceil((maxVal + 4) / 5) * 5;
    } else if (maxVal <= 100) {
      yMax = Math.ceil((maxVal + 6) / 10) * 10;
    } else {
      yMax = Math.ceil((maxVal * 1.08) / 10) * 10;
    }

    // Dynamic lower bound adjusts to negative TSB (Form) when athlete is fatigued
    let yMin: number;
    if (minVal < 0) {
      yMin = Math.floor((minVal - 2) / 5) * 5;
    } else {
      yMin = 0;
    }

    const range = Math.max(10, yMax - yMin);

    // Pick a clean tick step
    const step = range <= 25 ? 5 : range <= 50 ? 10 : range <= 100 ? 15 : 20;
    const ticks: number[] = [];
    let cur = Math.ceil(yMin / step) * step;
    if (cur > yMin) ticks.push(yMin);
    while (cur <= yMax) {
      if (!ticks.includes(cur)) ticks.push(cur);
      cur += step;
    }
    if (!ticks.includes(yMax)) ticks.push(yMax);
    ticks.sort((a, b) => a - b);

    return { yMin, yMax, range, ticks };
  }, [fitnessTimeline, selectedChartDiscipline]);

  // Form label helper
  const getFormLabel = (tsb: number) => {
    if (tsb > 15) return { label: 'Fresh / Taper Peak', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' };
    if (tsb >= 5) return { label: 'Race Ready / Fresh', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' };
    if (tsb >= -10) return { label: 'Neutral / Optimal', color: 'text-sky-400', bg: 'bg-sky-500/15 border-sky-500/30' };
    if (tsb >= -30) return { label: 'Productive Training', color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/30' };
    return { label: 'High Fatigue / Overreaching', color: 'text-rose-400', bg: 'bg-rose-500/15 border-rose-500/30' };
  };

  const formStatus = getFormLabel(disciplineFitness.tsb);

  const handleOpenActivityModal = (actId: string | number) => {
    const act = activities.find((a) => String(a.id) === String(actId));
    if (act) {
      setActiveModalActivity(act);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ========================================================= */}
      {/* 1. TOP HEADER & DISCIPLINE SELECTOR */}
      {/* ========================================================= */}
      <div
        className={`flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl p-4 sm:p-5 border transition-colors ${
          isLight
            ? 'bg-white border-slate-200 shadow-xs'
            : 'bg-slate-900/50 border-slate-800/80'
        }`}
      >
        <div>
          <div className="flex items-center gap-2">
            <h1
              className={`text-xl sm:text-2xl font-extrabold tracking-tight ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}
            >
              {disciplineFitness.headerTitle}
            </h1>
          </div>
          <p className={`text-xs sm:text-sm mt-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            {disciplineFitness.subtitle}
          </p>
        </div>

        {/* Discipline / Sport View Toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/60 border border-slate-800 text-xs font-bold">
            <button
              type="button"
              onClick={() => setSelectedSport('triathlon')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                selectedSport === 'triathlon'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              <span>Triathlon</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSport('run')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                selectedSport === 'run'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Footprints className="w-3.5 h-3.5 text-amber-400" />
              <span>Running</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSport('bike')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                selectedSport === 'bike'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Bike className="w-3.5 h-3.5 text-orange-400" />
              <span>Cycling</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSport('swim')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                selectedSport === 'swim'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Waves className="w-3.5 h-3.5 text-sky-400" />
              <span>Swim</span>
            </button>
          </div>

          {/* Triathlon Performance Readiness Presets */}
          {selectedSport === 'triathlon' && (
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
              {[
                { id: 'sprint' as const, label: 'Sprint' },
                { id: 'olympic' as const, label: 'Olympic' },
                { id: 'middle_70_3' as const, label: '70.3' },
                { id: 'ironman' as const, label: 'Full IRONMAN' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedModel(m.id)}
                  className={`px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer text-xs whitespace-nowrap ${
                    selectedModel === m.id
                      ? 'bg-slate-800 text-amber-400 border border-amber-500/40 shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {/* Running Performance Readiness Presets (26.2M down to 5K) */}
          {selectedSport === 'run' && (
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
              {[
                { id: 'marathon_26_2' as const, label: '26.2M' },
                { id: 'half_13_1' as const, label: '13.1M' },
                { id: 'ten_miler_10' as const, label: '10M' },
                { id: 'ten_k_10' as const, label: '10K' },
                { id: 'five_k_5' as const, label: '5K' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedRunningModel(m.id)}
                  className={`px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer text-xs whitespace-nowrap ${
                    selectedRunningModel === m.id
                      ? 'bg-slate-800 text-amber-400 border border-amber-500/40 shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title={RUNNING_MODEL_PROFILES[m.id].description}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {/* Cycling Performance Readiness Presets (Century down to 10M TT) */}
          {selectedSport === 'bike' && (
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
              {[
                { id: 'century_100' as const, label: 'Century' },
                { id: 'fifty_m_50' as const, label: '50M' },
                { id: 'twenty_five_m_25' as const, label: '25M' },
                { id: 'ten_m_tt_10' as const, label: '10M TT' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedCyclingModel(m.id)}
                  className={`px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer text-xs whitespace-nowrap ${
                    selectedCyclingModel === m.id
                      ? 'bg-slate-800 text-amber-400 border border-amber-500/40 shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title={CYCLING_MODEL_PROFILES[m.id].description}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {/* Swimming Performance Readiness Presets (50m down to 10k) */}
          {selectedSport === 'swim' && (
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
              {[
                { id: 'swim_50m' as const, label: '50m' },
                { id: 'swim_100m' as const, label: '100m' },
                { id: 'swim_400m' as const, label: '400m' },
                { id: 'swim_1_9k' as const, label: '1.9k' },
                { id: 'swim_3_8k' as const, label: '3.8k' },
                { id: 'swim_5k' as const, label: '5k' },
                { id: 'swim_10k' as const, label: '10k' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedSwimmingModel(m.id)}
                  className={`px-2 py-1.5 rounded-lg font-bold transition-all cursor-pointer text-xs whitespace-nowrap ${
                    selectedSwimmingModel === m.id
                      ? 'bg-slate-800 text-amber-400 border border-amber-500/40 shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title={SWIMMING_MODEL_PROFILES[m.id].description}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. HERO METRICS CLUSTER: DYNAMIC FITNESS INDEX + CTL + FORM */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* Main Fitness Index Card (Dynamic Header and Value) */}
        <div
          className={`md:col-span-5 rounded-2xl p-5 border relative overflow-hidden flex flex-col justify-between ${
            isLight
              ? 'bg-gradient-to-br from-amber-50/90 to-emerald-50/70 border-amber-300 shadow-sm text-slate-900'
              : 'bg-gradient-to-br from-[#121624] via-[#0d101a] to-[#07090f] border-amber-500/30 text-white shadow-xl'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-500" />
              {disciplineFitness.title}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
              {disciplineFitness.badge}
            </span>
          </div>

          <div className="my-4 flex items-baseline gap-3">
            <span className="text-5xl sm:text-6xl font-black font-mono text-amber-500 tracking-tight">
              {disciplineFitness.score}
            </span>
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-500 uppercase block">Fitness Index</span>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {disciplineFitness.score}% of preparation target
              </span>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 text-[11px]">
              <span>Formula</span>
              <span className="font-mono font-bold text-amber-500">
                {disciplineFitness.formula}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {selectedSport === 'triathlon'
                ? 'Geometric weighting prevents superior fitness in one discipline from completely masking weakness in another.'
                : `Target anchored on ${disciplineFitness.target} CTL for high performance race capacity.`}
            </p>
          </div>
        </div>

        {/* Current CTL & ATL Card */}
        <div
          className={`md:col-span-4 rounded-2xl p-5 border flex flex-col justify-between ${
            isLight
              ? 'bg-white border-slate-200 shadow-sm text-slate-900'
              : 'bg-slate-900/60 border-slate-800 text-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-sky-400" />
              {selectedSport === 'run' ? 'Running' : selectedSport === 'bike' ? 'Cycling' : selectedSport === 'swim' ? 'Swimming' : 'Total'} CTL (Fitness)
            </span>
            <span className="text-[10px] font-mono text-slate-400">42-Day Rolling</span>
          </div>

          <div className="my-3 flex items-baseline justify-between">
            <div>
              <span className="text-4xl sm:text-5xl font-black font-mono text-sky-400">
                {disciplineFitness.ctl}
              </span>
              <span className="text-xs text-slate-500 font-bold ml-1.5">CTL</span>
            </div>
            <div className="text-right">
              <span className="text-2xl sm:text-3xl font-black font-mono text-purple-400">
                {disciplineFitness.atl}
              </span>
              <span className="text-xs text-slate-500 font-bold ml-1.5">7d ATL</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-xs flex items-center justify-between text-slate-500">
            <span>Target: {disciplineFitness.target} CTL</span>
            <span className="font-mono font-bold text-sky-400">
              {Math.round((disciplineFitness.ctl / disciplineFitness.target) * 100)}% achieved
            </span>
          </div>
        </div>

        {/* Form (TSB = CTL - ATL) Card */}
        <div
          className={`md:col-span-3 rounded-2xl p-5 border flex flex-col justify-between ${
            isLight
              ? 'bg-white border-slate-200 shadow-sm text-slate-900'
              : 'bg-slate-900/60 border-slate-800 text-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-emerald-400" />
              Form (TSB)
            </span>
            <span className="text-[10px] font-mono text-slate-400">CTL – ATL</span>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span
                className={`text-4xl sm:text-5xl font-black font-mono ${
                  disciplineFitness.tsb >= 0 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {disciplineFitness.tsb > 0 ? `+${disciplineFitness.tsb}` : disciplineFitness.tsb}
              </span>
              <span className="text-xs text-slate-500 font-bold">TSB</span>
            </div>
            <span
              className={`inline-block mt-1 text-[11px] font-bold px-2 py-0.5 rounded-md border ${formStatus.bg} ${formStatus.color}`}
            >
              {formStatus.label}
            </span>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
            {disciplineFitness.tsb > 5
              ? 'High freshness for race execution.'
              : disciplineFitness.tsb >= -20
              ? 'Balanced productive training window.'
              : 'High fatigue accumulation; recovery advised.'}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. CHARTS CONTAINER: VOLUME & MULTIDIMENSIONAL ZONES       */}
      {/* ========================================================= */}
      <WeeklyMileageChart
        activities={activities}
        activityDetails={activityDetails}
        athleteProfile={athleteProfile}
        initialTab={selectedSport === 'bike' ? 'cycling_power' : 'mileage'}
        theme={theme}
        onSelectActivity={(actId) => {
          setSelectedZoneActivityId(actId);
          handleOpenActivityModal(actId);
        }}
      />

      {/* ========================================================= */}
      {/* 4. DISCIPLINE CTL BREAKDOWN CARDS (SWIM / BIKE / RUN)     */}
      {/* ========================================================= */}
      {selectedSport === 'triathlon' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className={`text-sm font-bold uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>
              Triathlon Discipline Breakdown
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              Geometric Limiting Factor: <strong className="text-amber-400 uppercase">{fitnessIndexResult.limitingFactor.name}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Swim Card */}
            <div className={`p-4 rounded-2xl border ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'}`}>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400">
                    <Waves className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-sky-400 uppercase">Swim CTL (sTSS)</h4>
                    <span className="text-[10px] text-slate-500">Target: {fitnessIndexResult.weights.targetSwimCtl} CTL</span>
                  </div>
                </div>
                <span className="font-mono font-bold text-xl text-sky-400">{latestRecord.swimCtl}</span>
              </div>
              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Preparedness</span>
                  <span className="font-mono font-bold text-white">{Math.round(fitnessIndexResult.swimRatio * 100)}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-950 overflow-hidden">
                  <div className="h-full bg-sky-400 rounded-full" style={{ width: `${Math.min(100, Math.round(fitnessIndexResult.swimRatio * 100))}%` }} />
                </div>
              </div>
            </div>

            {/* Bike Card */}
            <div className={`p-4 rounded-2xl border ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'}`}>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-orange-500/10 text-orange-400">
                    <Bike className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-orange-400 uppercase">Bike CTL (Power TSS)</h4>
                    <span className="text-[10px] text-slate-500">Target: {fitnessIndexResult.weights.targetBikeCtl} CTL</span>
                  </div>
                </div>
                <span className="font-mono font-bold text-xl text-orange-400">{latestRecord.bikeCtl}</span>
              </div>
              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Preparedness</span>
                  <span className="font-mono font-bold text-white">{Math.round(fitnessIndexResult.bikeRatio * 100)}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-950 overflow-hidden">
                  <div className="h-full bg-orange-400 rounded-full" style={{ width: `${Math.min(100, Math.round(fitnessIndexResult.bikeRatio * 100))}%` }} />
                </div>
              </div>
            </div>

            {/* Run Card */}
            <div className={`p-4 rounded-2xl border ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'}`}>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                    <Footprints className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-amber-400 uppercase">Run CTL (rTSS)</h4>
                    <span className="text-[10px] text-slate-500">Target: {fitnessIndexResult.weights.targetRunCtl} CTL</span>
                  </div>
                </div>
                <span className="font-mono font-bold text-xl text-amber-400">{latestRecord.runCtl}</span>
              </div>
              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Preparedness</span>
                  <span className="font-mono font-bold text-white">{Math.round(fitnessIndexResult.runRatio * 100)}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-950 overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min(100, Math.round(fitnessIndexResult.runRatio * 100))}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. TIME IN TRAINING ZONES PER ACTIVITY (ANALYZER)          */}
      {/* ========================================================= */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-amber-500" />
            <h3 className={`text-sm font-bold uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
              Time in Training Zones (Per Activity)
            </h3>
          </div>

          {/* Activity selector dropdown / chips */}
          {relevantActivitiesForZones.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500">Select Activity:</span>
              <select
                value={activeZoneActivity ? String(activeZoneActivity.id) : ''}
                onChange={(e) => setSelectedZoneActivityId(e.target.value)}
                className={`text-xs font-mono py-1 px-2.5 rounded-lg border cursor-pointer ${
                  isLight
                    ? 'bg-white border-slate-300 text-slate-800'
                    : 'bg-slate-950 border-slate-800 text-slate-200'
                }`}
              >
                {relevantActivitiesForZones.slice(0, 20).map((act) => {
                  const actDate = act.start_date ? act.start_date.split('T')[0] : '';
                  return (
                    <option key={act.id} value={String(act.id)}>
                      {actDate} — {act.name} ({act.type})
                    </option>
                  );
                })}
              </select>

              {activeZoneActivity && (
                <button
                  type="button"
                  onClick={() => handleOpenActivityModal(activeZoneActivity.id)}
                  className={`p-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                  }`}
                  title="Open activity details & stream inspection modal"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Details</span>
                </button>
              )}
            </div>
          )}
        </div>

        {activeZoneActivity ? (
          <div className="relative">
            {isLoadingZoneStreams && !currentZoneStreams && (
              <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-center gap-2 mb-2">
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                <span>Loading 1-sec streams from Strava for exact zone calculations...</span>
              </div>
            )}
            <ActivityZoneChart
              activity={activeZoneActivity}
              streams={currentZoneStreams}
              athleteProfile={athleteProfile}
              theme={theme}
              title={`${activeZoneActivity.name} — Training Zones`}
            />
          </div>
        ) : (
          <div
            className={`p-6 rounded-2xl border text-center text-xs ${
              isLight
                ? 'bg-white border-slate-200 text-slate-500'
                : 'bg-slate-900/60 border-slate-800 text-slate-400'
            }`}
          >
            No activities available in this category to calculate training zone time.
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* 6. TIMELINE CHART: FITNESS, FATIGUE & FORM               */}
      {/* ========================================================= */}
      <div
        className={`rounded-2xl border p-4 sm:p-5 transition-colors ${
          isLight
            ? 'bg-white border-slate-200 shadow-sm'
            : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
          <div>
            <h3 className={`text-sm font-bold uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
              Fitness, Fatigue &amp; Form Timeline
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              42d Chronic Load (Fitness), 7d Acute Load (Fatigue), and Form (TSB)
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            {/* Discipline Selector if in Triathlon mode */}
            {selectedSport === 'triathlon' && (
              <div className="flex items-center p-0.5 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] font-bold">
                {[
                  { id: 'combined' as const, label: 'Combined' },
                  { id: 'swim' as const, label: 'Swim' },
                  { id: 'bike' as const, label: 'Bike' },
                  { id: 'run' as const, label: 'Run' },
                ].map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedChartDiscipline(d.id)}
                    className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                      selectedChartDiscipline === d.id
                        ? 'bg-sky-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}

            {/* Lookback Days (30, 60, 90) */}
            <div className="flex items-center p-0.5 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] font-bold">
              {[30, 60, 90].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setTimelineLookback(days)}
                  className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                    timelineLookback === days
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {days}d
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chart Key / Legend at TOP */}
        <div className="pt-3 pb-1 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 font-bold text-sky-400">
              <span className="w-3 h-0.5 bg-sky-400 rounded-full" />
              <span>CTL (Fitness 42d)</span>
            </span>
            <span className="flex items-center gap-1.5 font-bold text-purple-400">
              <span className="w-3 h-0.5 bg-purple-400 rounded-full" />
              <span>ATL (Fatigue 7d)</span>
            </span>
            <span className="flex items-center gap-1.5 font-bold text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/20 border border-emerald-500/40" />
              <span>Form (TSB)</span>
            </span>
          </div>

          <div className="text-[11px] font-mono text-slate-500">
            Scale: {chartScaling.yMin} – {chartScaling.yMax} TSS/day
          </div>
        </div>

        {/* SVG Timeline Chart with Adaptive Y-Axis & X-Axis Date Markers */}
        <div className="relative pt-4 pb-1">
          <div className="h-44 sm:h-56 w-full relative">
            {fitnessTimeline.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                No historical training activities recorded.
              </div>
            ) : (
              <svg
                className="w-full h-full overflow-visible"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                {/* Horizontal reference grid lines with numerical labels */}
                {chartScaling.ticks.map((tickVal) => {
                  const y = ((chartScaling.yMax - tickVal) / chartScaling.range) * 90 + 5;
                  const isZero = tickVal === 0;
                  return (
                    <g key={tickVal}>
                      <line
                        x1="0"
                        y1={y}
                        x2="100"
                        y2={y}
                        stroke="currentColor"
                        strokeDasharray={isZero ? 'none' : '2,2'}
                        className={isZero ? 'text-slate-500' : isLight ? 'text-slate-200' : 'text-slate-800/80'}
                        strokeWidth={isZero ? '0.75' : '0.4'}
                      />
                      <text
                        x="1"
                        y={Math.max(3.5, y - 1)}
                        fill={isZero ? '#38bdf8' : isLight ? '#94a3b8' : '#64748b'}
                        fontSize="2.6"
                        fontFamily="monospace"
                        fontWeight={isZero ? 'bold' : 'normal'}
                      >
                        {tickVal}
                      </text>
                    </g>
                  );
                })}

                {/* Form (TSB) Visual Pillars / Area */}
                {fitnessTimeline.map((r, i) => {
                  const tsb =
                    selectedChartDiscipline === 'swim'
                      ? r.swimTsb
                      : selectedChartDiscipline === 'bike'
                      ? r.bikeTsb
                      : selectedChartDiscipline === 'run'
                      ? r.runTsb
                      : r.triTsb;
                  const x = (i / (fitnessTimeline.length - 1 || 1)) * 100;
                  const barW = Math.max(0.6, 85 / fitnessTimeline.length);
                  const yTsb = ((chartScaling.yMax - tsb) / chartScaling.range) * 90 + 5;
                  const yZero = ((chartScaling.yMax - 0) / chartScaling.range) * 90 + 5;
                  const top = Math.min(yTsb, yZero);
                  const height = Math.abs(yTsb - yZero);
                  const isPositive = tsb >= 0;

                  return (
                    <rect
                      key={`tsb-bar-${i}`}
                      x={x - barW / 2}
                      y={top}
                      width={barW}
                      height={Math.max(0.3, height)}
                      fill={isPositive ? '#10b981' : '#f43f5e'}
                      opacity={0.35}
                      rx="0.2"
                    />
                  );
                })}

                {/* CTL Path (Fitness - Sky Blue Line) */}
                <polyline
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={fitnessTimeline
                    .map((r, i) => {
                      const x = (i / (fitnessTimeline.length - 1 || 1)) * 100;
                      const ctl =
                        selectedChartDiscipline === 'swim'
                          ? r.swimCtl
                          : selectedChartDiscipline === 'bike'
                          ? r.bikeCtl
                          : selectedChartDiscipline === 'run'
                          ? r.runCtl
                          : r.triCtl;
                      const y = ((chartScaling.yMax - ctl) / chartScaling.range) * 90 + 5;
                      return `${x},${y}`;
                    })
                    .join(' ')}
                />

                {/* ATL Path (Fatigue - Purple Line) */}
                <polyline
                  fill="none"
                  stroke="#c084fc"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={fitnessTimeline
                    .map((r, i) => {
                      const x = (i / (fitnessTimeline.length - 1 || 1)) * 100;
                      const atl =
                        selectedChartDiscipline === 'swim'
                          ? r.swimAtl
                          : selectedChartDiscipline === 'bike'
                          ? r.bikeAtl
                          : selectedChartDiscipline === 'run'
                          ? r.runAtl
                          : r.triAtl;
                      const y = ((chartScaling.yMax - atl) / chartScaling.range) * 90 + 5;
                      return `${x},${y}`;
                    })
                    .join(' ')}
                />

                {/* Transparent Interactive Hover Column Targets */}
                {fitnessTimeline.map((_, i) => {
                  const x = (i / (fitnessTimeline.length - 1 || 1)) * 100;
                  const colW = 100 / Math.max(1, fitnessTimeline.length);
                  return (
                    <rect
                      key={`hover-col-${i}`}
                      x={x - colW / 2}
                      y="0"
                      width={colW}
                      height="100"
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredTimelineIdx(i)}
                      onMouseLeave={() => setHoveredTimelineIdx(null)}
                    />
                  );
                })}

                {/* Hover indicator line & dot */}
                {hoveredTimelineIdx !== null && fitnessTimeline[hoveredTimelineIdx] && (() => {
                  const i = hoveredTimelineIdx;
                  const r = fitnessTimeline[i];
                  const x = (i / (fitnessTimeline.length - 1 || 1)) * 100;
                  const ctl =
                    selectedChartDiscipline === 'swim'
                      ? r.swimCtl
                      : selectedChartDiscipline === 'bike'
                      ? r.bikeCtl
                      : selectedChartDiscipline === 'run'
                      ? r.runCtl
                      : r.triCtl;
                  const atl =
                    selectedChartDiscipline === 'swim'
                      ? r.swimAtl
                      : selectedChartDiscipline === 'bike'
                      ? r.bikeAtl
                      : selectedChartDiscipline === 'run'
                      ? r.runAtl
                      : r.triAtl;
                  const yCtl = ((chartScaling.yMax - ctl) / chartScaling.range) * 90 + 5;
                  const yAtl = ((chartScaling.yMax - atl) / chartScaling.range) * 90 + 5;

                  return (
                    <g>
                      <line
                        x1={x}
                        y1="0"
                        x2={x}
                        y2="100"
                        stroke="#38bdf8"
                        strokeDasharray="1,1"
                        strokeWidth="0.6"
                        opacity="0.8"
                      />
                      <circle cx={x} cy={yCtl} r="1.5" fill="#38bdf8" stroke="#ffffff" strokeWidth="0.4" />
                      <circle cx={x} cy={yAtl} r="1.5" fill="#c084fc" stroke="#ffffff" strokeWidth="0.4" />
                    </g>
                  );
                })()}
              </svg>
            )}

            {/* Hover details badge inside chart */}
            {hoveredTimelineIdx !== null && fitnessTimeline[hoveredTimelineIdx] && (() => {
              const r = fitnessTimeline[hoveredTimelineIdx];
              const ctl =
                selectedChartDiscipline === 'swim'
                  ? r.swimCtl
                  : selectedChartDiscipline === 'bike'
                  ? r.bikeCtl
                  : selectedChartDiscipline === 'run'
                  ? r.runCtl
                  : r.triCtl;
              const atl =
                selectedChartDiscipline === 'swim'
                  ? r.swimAtl
                  : selectedChartDiscipline === 'bike'
                  ? r.bikeAtl
                  : selectedChartDiscipline === 'run'
                  ? r.runAtl
                  : r.triAtl;
              const tsb =
                selectedChartDiscipline === 'swim'
                  ? r.swimTsb
                  : selectedChartDiscipline === 'bike'
                  ? r.bikeTsb
                  : selectedChartDiscipline === 'run'
                  ? r.runTsb
                  : r.triTsb;
              const status = getFormLabel(tsb);

              return (
                <div
                  className={`absolute top-2 right-2 px-3 py-1.5 rounded-xl border text-xs shadow-lg backdrop-blur-md z-10 flex items-center gap-3 ${
                    isLight ? 'bg-white/95 border-slate-200 text-slate-800' : 'bg-slate-950/95 border-slate-700 text-white'
                  }`}
                >
                  <span className="font-mono font-bold text-slate-400">{r.date}</span>
                  <span className="text-sky-400 font-bold">CTL: {ctl.toFixed(1)}</span>
                  <span className="text-purple-400 font-bold">ATL: {atl.toFixed(1)}</span>
                  <span className={`font-bold ${tsb >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    Form: {tsb > 0 ? `+${tsb.toFixed(1)}` : tsb.toFixed(1)}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${status.color} ${status.bg}`}>
                    {status.label}
                  </span>
                </div>
              );
            })()}
          </div>

          {/* Multiple Date Markers along X-Axis */}
          {fitnessTimeline.length > 0 && (
            <div className="flex justify-between pt-2 border-t border-slate-800 text-[10px] font-mono text-slate-500">
              {(() => {
                const stepCount = Math.min(6, fitnessTimeline.length);
                const markers: Array<{ key: string; label: string }> = [];
                for (let s = 0; s < stepCount; s++) {
                  const idx = Math.round((s / (stepCount - 1 || 1)) * (fitnessTimeline.length - 1));
                  const item = fitnessTimeline[idx];
                  if (item) {
                    try {
                      const [y, m, d] = item.date.split('-').map(Number);
                      const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
                      const mon = dt.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
                      markers.push({ key: item.date + s, label: `${d} ${mon}` });
                    } catch {
                      markers.push({ key: item.date + s, label: item.date });
                    }
                  }
                }
                return markers.map((m, i) => (
                  <span
                    key={m.key}
                    className={
                      i === 0
                        ? 'text-left'
                        : i === markers.length - 1
                        ? 'text-right font-bold text-sky-400'
                        : 'text-center'
                    }
                  >
                    {m.label}
                  </span>
                ));
              })()}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* 7. DAILY TRAINING LOG TABLE                               */}
      {/* ========================================================= */}
      <div
        className={`rounded-2xl border overflow-hidden ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <h3 className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
            Daily Training Log (Recent {Math.min(14, fitnessTimeline.length)} Days)
          </h3>
          <span className="text-[11px] text-slate-500 font-mono">
            {fitnessTimeline.length} total days analyzed
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead
              className={`border-b text-[10px] uppercase font-bold tracking-wider ${
                isLight
                  ? 'bg-slate-50 border-slate-200 text-slate-600'
                  : 'bg-slate-950/80 border-slate-800 text-slate-400'
              }`}
            >
              <tr>
                <th className="py-2.5 px-4 font-sans">Date</th>
                <th className="py-2.5 px-3 text-sky-400">Swim TSS</th>
                <th className="py-2.5 px-3 text-orange-400">Bike TSS</th>
                <th className="py-2.5 px-3 text-amber-400">Run TSS</th>
                <th className="py-2.5 px-3 text-white">Daily Tri TSS</th>
                <th className="py-2.5 px-3 text-sky-400">Tri CTL</th>
                <th className="py-2.5 px-3 text-purple-400">Tri ATL</th>
                <th className="py-2.5 px-4 text-emerald-400">Form (TSB)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {fitnessTimeline
                .slice(-14)
                .reverse()
                .map((r) => {
                  let formattedDateWithWeekday = r.date;
                  try {
                    const [y, m, d] = r.date.split('-').map(Number);
                    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
                    const weekday = dt.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
                    const dayNum = String(d).padStart(2, '0');
                    const monName = dt.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
                    formattedDateWithWeekday = `${weekday}, ${dayNum} ${monName} ${y}`;
                  } catch {
                    formattedDateWithWeekday = r.date;
                  }

                  return (
                    <tr key={r.date} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-4 font-sans font-medium text-slate-300 whitespace-nowrap">
                        {formattedDateWithWeekday}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">{r.swimTss > 0 ? r.swimTss : '—'}</td>
                      <td className="py-2.5 px-3 text-slate-300">{r.bikeTss > 0 ? r.bikeTss : '—'}</td>
                      <td className="py-2.5 px-3 text-slate-300">{r.runTss > 0 ? r.runTss : '—'}</td>
                      <td className="py-2.5 px-3 font-bold text-white">{r.totalTriTss > 0 ? r.totalTriTss : '0'}</td>
                      <td className="py-2.5 px-3 font-bold text-sky-400">{r.triCtl}</td>
                      <td className="py-2.5 px-3 font-bold text-purple-400">{r.triAtl}</td>
                      <td className={`py-2.5 px-4 font-bold ${r.triTsb >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {r.triTsb > 0 ? `+${r.triTsb}` : r.triTsb}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Modal when inspecting activity */}
      {activeModalActivity && (
        <StravaActivityModal
          isOpen={Boolean(activeModalActivity)}
          activity={activeModalActivity}
          stravaToken={stravaToken}
          athleteProfile={athleteProfile}
          isGoogleConnected={isGoogleConnected}
          theme={theme}
          onConnectGoogle={onConnectGoogle}
          onClose={() => setActiveModalActivity(null)}
          onActivityPublished={onActivityPublished}
          onDeleteActivity={(id) => {
            onDeleteActivity?.(id);
            setActiveModalActivity(null);
          }}
        />
      )}
    </div>
  );
};
