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
  ChevronLeft,
  ChevronRight,
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
import { WeeklyTrainingVolumeChart } from './WeeklyTrainingVolumeChart';
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

  // Helper for ordinal numbers (1st, 2nd, 3rd, 4th, etc.)
  const getOrdinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  };

  const formatShortDate = (dStr: string) => {
    if (!dStr) return '';
    const parts = dStr.split('-');
    if (parts.length < 3) return dStr;
    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return `${d} ${monthNames[m] || ''}`;
  };

  // Pagination for Daily Training Log:
  // Shows either the last 20 days or the current month to date (whichever is greater),
  // with older training logs neatly organized page-by-page by calendar month.
  interface TrainingLogPage {
    id: string;
    pageNumber: number;
    label: string;
    monthTitle: string;
    isRecentWindow: boolean;
    startDate: string;
    endDate: string;
    records: DailyFitnessRecord[];
  }

  const trainingLogPages = useMemo<TrainingLogPage[]>(() => {
    if (!fitnessTimeline || fitnessTimeline.length === 0) {
      return [
        {
          id: 'page_empty',
          pageNumber: 1,
          label: 'No Records',
          monthTitle: 'No Records',
          isRecentWindow: true,
          startDate: '',
          endDate: '',
          records: [],
        },
      ];
    }

    const latest = fitnessTimeline[fitnessTimeline.length - 1];
    const refDateStr = latest.date;
    const refYear = parseInt(refDateStr.slice(0, 4), 10);
    const refMonth = parseInt(refDateStr.slice(5, 7), 10) - 1;
    const refDay = parseInt(refDateStr.slice(8, 10), 10);

    const startOfMonthStr = `${refDateStr.slice(0, 7)}-01`;
    const refDateObj = new Date(refYear, refMonth, refDay);
    const twentyDaysAgoObj = new Date(refDateObj.getTime() - 19 * 24 * 60 * 60 * 1000);
    const twentyDaysAgoStr = twentyDaysAgoObj.toISOString().slice(0, 10);

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    let page1Cutoff: string;
    let page1Label: string;

    // Rule: days in month so far (refDay) vs 20 days, whichever is greater
    if (refDay >= 20) {
      page1Cutoff = startOfMonthStr;
      page1Label = `${monthNames[refMonth]} ${refYear} (1st–${refDay}${getOrdinal(refDay)})`;
    } else {
      page1Cutoff = twentyDaysAgoStr;
      page1Label = `Last 20 Days (${formatShortDate(twentyDaysAgoStr)} – ${formatShortDate(refDateStr)})`;
    }

    const page1Records = fitnessTimeline
      .filter((r) => r.date >= page1Cutoff && r.date <= refDateStr)
      .slice()
      .reverse();

    const pages: TrainingLogPage[] = [
      {
        id: 'page_1_recent',
        pageNumber: 1,
        label: page1Label,
        monthTitle: `${monthNames[refMonth]} ${refYear}`,
        isRecentWindow: true,
        startDate: page1Cutoff,
        endDate: refDateStr,
        records: page1Records,
      },
    ];

    // Older records before page1Cutoff grouped by calendar month
    const olderRecords = fitnessTimeline.filter((r) => r.date < page1Cutoff);
    if (olderRecords.length > 0) {
      const monthMap = new Map<string, DailyFitnessRecord[]>();
      for (const rec of olderRecords) {
        const ym = rec.date.slice(0, 7);
        if (!monthMap.has(ym)) {
          monthMap.set(ym, []);
        }
        monthMap.get(ym)!.push(rec);
      }

      const sortedMonthKeys = Array.from(monthMap.keys()).sort((a, b) => b.localeCompare(a));
      sortedMonthKeys.forEach((ym, idx) => {
        const y = parseInt(ym.slice(0, 4), 10);
        const m = parseInt(ym.slice(5, 7), 10) - 1;
        const mRecords = monthMap.get(ym)!.sort((a, b) => a.date.localeCompare(b.date)).reverse();
        const mTitle = `${monthNames[m]} ${y}`;
        pages.push({
          id: `page_month_${ym}`,
          pageNumber: idx + 2,
          label: `${mTitle} (${mRecords.length} days)`,
          monthTitle: mTitle,
          isRecentWindow: false,
          startDate: mRecords[mRecords.length - 1].date,
          endDate: mRecords[0].date,
          records: mRecords,
        });
      });
    }

    return pages;
  }, [fitnessTimeline]);

  const [currentTrainingPageIndex, setCurrentTrainingPageIndex] = useState<number>(0);
  const safeTrainingPageIndex = Math.min(
    currentTrainingPageIndex,
    Math.max(0, trainingLogPages.length - 1)
  );
  const activeTrainingPage = trainingLogPages[safeTrainingPageIndex] || trainingLogPages[0];

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
          <div className="flex items-center gap-1.5 p-0.5 text-xs font-bold">
            <button
              type="button"
              onClick={() => setSelectedSport('triathlon')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                selectedSport === 'triathlon'
                  ? 'bg-amber-500 text-slate-950 shadow-sm border-2 border-slate-400'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 border border-transparent'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              <span>Triathlon</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSport('run')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                selectedSport === 'run'
                  ? 'bg-amber-500 text-slate-950 shadow-sm border-2 border-slate-400'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 border border-transparent'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <Footprints className="w-3.5 h-3.5 text-amber-400" />
              <span>Running</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSport('bike')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                selectedSport === 'bike'
                  ? 'bg-amber-500 text-slate-950 shadow-sm border-2 border-slate-400'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 border border-transparent'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <Bike className="w-3.5 h-3.5 text-orange-400" />
              <span>Cycling</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSport('swim')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                selectedSport === 'swim'
                  ? 'bg-amber-500 text-slate-950 shadow-sm border-2 border-slate-400'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 border border-transparent'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <Waves className="w-3.5 h-3.5 text-sky-400" />
              <span>Swim</span>
            </button>
          </div>

          {/* Triathlon Performance Readiness Presets */}
          {selectedSport === 'triathlon' && (
            <div className="flex items-center gap-1 p-0.5 text-xs">
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
                      ? isLight
                        ? 'bg-white text-amber-700 border-2 border-slate-400 shadow-xs'
                        : 'bg-slate-800 text-amber-400 border-2 border-slate-500 shadow-xs'
                      : isLight
                      ? 'text-slate-600 hover:text-slate-900 border border-transparent'
                      : 'text-slate-400 hover:text-white border border-transparent'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {/* Running Performance Readiness Presets (26.2M down to 5K) */}
          {selectedSport === 'run' && (
            <div className="flex items-center gap-1 p-0.5 text-xs">
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
                      ? isLight
                        ? 'bg-white text-amber-700 border-2 border-slate-400 shadow-xs'
                        : 'bg-slate-800 text-amber-400 border-2 border-slate-500 shadow-xs'
                      : isLight
                      ? 'text-slate-600 hover:text-slate-900 border border-transparent'
                      : 'text-slate-400 hover:text-white border border-transparent'
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
            <div className="flex items-center gap-1 p-0.5 text-xs">
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
                      ? isLight
                        ? 'bg-white text-amber-700 border-2 border-slate-400 shadow-xs'
                        : 'bg-slate-800 text-amber-400 border-2 border-slate-500 shadow-xs'
                      : isLight
                      ? 'text-slate-600 hover:text-slate-900 border border-transparent'
                      : 'text-slate-400 hover:text-white border border-transparent'
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
            <div className="flex items-center gap-1 p-0.5 text-xs">
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
                      ? isLight
                        ? 'bg-white text-amber-700 border-2 border-slate-400 shadow-xs'
                        : 'bg-slate-800 text-amber-400 border-2 border-slate-500 shadow-xs'
                      : isLight
                      ? 'text-slate-600 hover:text-slate-900 border border-transparent'
                      : 'text-slate-400 hover:text-white border border-transparent'
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
                  <span className={`font-mono font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {Math.round(fitnessIndexResult.swimRatio <= 2 ? fitnessIndexResult.swimRatio * 100 : fitnessIndexResult.swimRatio)}%
                  </span>
                </div>
                <div className={`h-2 w-full rounded-full ${isLight ? 'bg-slate-100' : 'bg-slate-950'} overflow-hidden`}>
                  <div
                    className="h-full bg-sky-400 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, Math.max(0, Math.round(fitnessIndexResult.swimRatio <= 2 ? fitnessIndexResult.swimRatio * 100 : fitnessIndexResult.swimRatio)))}%`,
                    }}
                  />
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
                  <span className={`font-mono font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {Math.round(fitnessIndexResult.bikeRatio <= 2 ? fitnessIndexResult.bikeRatio * 100 : fitnessIndexResult.bikeRatio)}%
                  </span>
                </div>
                <div className={`h-2 w-full rounded-full ${isLight ? 'bg-slate-100' : 'bg-slate-950'} overflow-hidden`}>
                  <div
                    className="h-full bg-orange-400 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, Math.max(0, Math.round(fitnessIndexResult.bikeRatio <= 2 ? fitnessIndexResult.bikeRatio * 100 : fitnessIndexResult.bikeRatio)))}%`,
                    }}
                  />
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
                  <span className={`font-mono font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {Math.round(fitnessIndexResult.runRatio <= 2 ? fitnessIndexResult.runRatio * 100 : fitnessIndexResult.runRatio)}%
                  </span>
                </div>
                <div className={`h-2 w-full rounded-full ${isLight ? 'bg-slate-100' : 'bg-slate-950'} overflow-hidden`}>
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, Math.max(0, Math.round(fitnessIndexResult.runRatio <= 2 ? fitnessIndexResult.runRatio * 100 : fitnessIndexResult.runRatio)))}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. WEEKLY TRAINING VOLUME (RECHARTS - TOTAL HOURS/KM)     */}
      {/* ========================================================= */}
      <WeeklyTrainingVolumeChart
        activities={activities}
        activityDetails={activityDetails}
        athleteProfile={athleteProfile}
        theme={theme}
      />

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
      {/* 7. DAILY TRAINING LOG TABLE (PAGINATED)                   */}
      {/* ========================================================= */}
      <div
        className={`rounded-2xl border overflow-hidden ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="p-4 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
              Daily Training Log
            </h3>
            <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {activeTrainingPage.label} • Showing {activeTrainingPage.records.length} days
            </p>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            {fitnessTimeline.length} total days analyzed
          </span>
        </div>

        {/* Pagination Toolbar */}
        <div
          className={`px-4 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b ${
            isLight ? 'bg-slate-50/60 border-slate-200' : 'bg-slate-950/40 border-slate-800'
          }`}
        >
          {/* Quick Month Selectors */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            <span
              className={`text-[11px] font-bold uppercase tracking-wider shrink-0 mr-1 ${
                isLight ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              Months:
            </span>
            {trainingLogPages.map((pg, idx) => {
              const isSelected = idx === safeTrainingPageIndex;
              return (
                <button
                  key={pg.id}
                  type="button"
                  onClick={() => setCurrentTrainingPageIndex(idx)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 border ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-xs'
                      : isLight
                      ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                  }`}
                >
                  <span>{pg.monthTitle}</span>
                  <span
                    className={`ml-1 text-[10px] font-mono opacity-80 ${
                      isSelected ? 'text-slate-950' : 'text-slate-400'
                    }`}
                  >
                    ({pg.records.length})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Prev / Next controls */}
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <button
              type="button"
              disabled={safeTrainingPageIndex === 0}
              onClick={() => setCurrentTrainingPageIndex((prev) => Math.max(0, prev - 1))}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                isLight
                  ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-xs'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
              }`}
              title="View Newer Logs"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Newer</span>
            </button>

            <span
              className={`text-xs font-mono font-bold px-2 py-1 rounded-md border ${
                isLight
                  ? 'bg-slate-100 text-slate-700 border-slate-200'
                  : 'bg-slate-950 text-slate-300 border-slate-800'
              }`}
            >
              Page {safeTrainingPageIndex + 1} of {trainingLogPages.length}
            </span>

            <button
              type="button"
              disabled={safeTrainingPageIndex >= trainingLogPages.length - 1}
              onClick={() =>
                setCurrentTrainingPageIndex((prev) => Math.min(trainingLogPages.length - 1, prev + 1))
              }
              className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                isLight
                  ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-xs'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
              }`}
              title="View Older Month"
            >
              <span>Older</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
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
                <th className="py-2.5 px-3 text-sky-400">
                  {selectedChartDiscipline === 'swim'
                    ? 'Swim CTL'
                    : selectedChartDiscipline === 'bike'
                    ? 'Bike CTL'
                    : selectedChartDiscipline === 'run'
                    ? 'Run CTL'
                    : 'Tri CTL'}
                </th>
                <th className="py-2.5 px-3 text-purple-400">
                  {selectedChartDiscipline === 'swim'
                    ? 'Swim ATL'
                    : selectedChartDiscipline === 'bike'
                    ? 'Bike ATL'
                    : selectedChartDiscipline === 'run'
                    ? 'Run ATL'
                    : 'Tri ATL'}
                </th>
                <th className="py-2.5 px-4 text-emerald-400">Form (TSB)</th>
              </tr>
            </thead>
            <tbody className={isLight ? 'divide-y divide-slate-100' : 'divide-y divide-slate-800/40'}>
              {activeTrainingPage.records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <p className={`text-sm font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                      No training logs on this page
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      No training activities or stress score recorded during this window.
                    </p>
                  </td>
                </tr>
              ) : (
                activeTrainingPage.records.map((r) => {
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

                  const curCtl =
                    selectedChartDiscipline === 'swim'
                      ? r.swimCtl
                      : selectedChartDiscipline === 'bike'
                      ? r.bikeCtl
                      : selectedChartDiscipline === 'run'
                      ? r.runCtl
                      : r.triCtl;
                  const curAtl =
                    selectedChartDiscipline === 'swim'
                      ? r.swimAtl
                      : selectedChartDiscipline === 'bike'
                      ? r.bikeAtl
                      : selectedChartDiscipline === 'run'
                      ? r.runAtl
                      : r.triAtl;
                  const curTsb =
                    selectedChartDiscipline === 'swim'
                      ? r.swimTsb
                      : selectedChartDiscipline === 'bike'
                      ? r.bikeTsb
                      : selectedChartDiscipline === 'run'
                      ? r.runTsb
                      : r.triTsb;

                  return (
                    <tr
                      key={r.date}
                      className={`transition-colors ${
                        isLight ? 'hover:bg-slate-50/80' : 'hover:bg-slate-800/30'
                      }`}
                    >
                      <td
                        className={`py-2.5 px-4 font-sans font-medium whitespace-nowrap ${
                          isLight ? 'text-slate-800' : 'text-slate-300'
                        }`}
                      >
                        {formattedDateWithWeekday}
                      </td>
                      <td className={`py-2.5 px-3 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                        {r.swimTss > 0 ? r.swimTss : '—'}
                      </td>
                      <td className={`py-2.5 px-3 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                        {r.bikeTss > 0 ? r.bikeTss : '—'}
                      </td>
                      <td className={`py-2.5 px-3 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                        {r.runTss > 0 ? r.runTss : '—'}
                      </td>
                      <td className={`py-2.5 px-3 font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {r.totalTriTss > 0 ? r.totalTriTss : '0'}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-sky-400">{curCtl}</td>
                      <td className="py-2.5 px-3 font-bold text-purple-400">{curAtl}</td>
                      <td
                        className={`py-2.5 px-4 font-bold ${
                          curTsb >= 0 ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {curTsb > 0 ? `+${curTsb}` : curTsb}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Pagination Info Bar */}
        {trainingLogPages.length > 1 && (
          <div
            className={`p-3 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
              isLight
                ? 'border-slate-200 text-slate-600 bg-slate-50/50'
                : 'border-slate-800 text-slate-400 bg-slate-950/40'
            }`}
          >
            <span>
              Showing {activeTrainingPage.records.length} days from {activeTrainingPage.label}
            </span>
            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              <button
                type="button"
                disabled={safeTrainingPageIndex === 0}
                onClick={() => setCurrentTrainingPageIndex((prev) => Math.max(0, prev - 1))}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                  isLight
                    ? 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                    : 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-200'
                }`}
              >
                ← Newer Month
              </button>
              <button
                type="button"
                disabled={safeTrainingPageIndex >= trainingLogPages.length - 1}
                onClick={() =>
                  setCurrentTrainingPageIndex((prev) =>
                    Math.min(trainingLogPages.length - 1, prev + 1)
                  )
                }
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                  isLight
                    ? 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                    : 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-200'
                }`}
              >
                Older Month →
              </button>
            </div>
          </div>
        )}
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
