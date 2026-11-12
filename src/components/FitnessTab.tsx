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
  TriathlonDistanceModel,
  DISTANCE_MODEL_PROFILES,
  DailyFitnessRecord,
  RunningDistanceModel,
  RUNNING_MODEL_PROFILES,
  CyclingDistanceModel,
  CYCLING_MODEL_PROFILES,
  SwimmingDistanceModel,
  SWIMMING_MODEL_PROFILES,
  deriveEventCtlTargetAndFeasibility,
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
  globalTriDistance?: 'sprint' | 'olympic' | 'middle_70_3' | 'ironman';
  onChangeGlobalTriDistance?: (dist: 'sprint' | 'olympic' | 'middle_70_3' | 'ironman') => void;
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
  globalTriDistance,
  onChangeGlobalTriDistance,
  onOpenSettings,
  onConnectGoogle = () => {},
  onActivityPublished,
  onDeleteActivity,
}) => {
  const isLight = theme === 'light';

  // Sport / Discipline Selector: Triathlon, Running, Cycling, Swimming
  const [selectedSport, setSelectedSport] = useState<SportFilter>('triathlon');

  // Race Distance Model for Triathlon preparation targets (synced with global goal state)
  const [localSelectedModel, setLocalSelectedModel] = useState<TriathlonDistanceModel>(
    globalTriDistance || 'middle_70_3'
  );
  const selectedModel: TriathlonDistanceModel = globalTriDistance || localSelectedModel;
  const setSelectedModel = (dist: TriathlonDistanceModel) => {
    setLocalSelectedModel(dist);
    if (dist !== 'custom_goal' && onChangeGlobalTriDistance) {
      onChangeGlobalTriDistance(dist);
    }
  };
  const [selectedRunningModel, setSelectedRunningModel] = useState<RunningDistanceModel>('ten_miler_10');
  const [selectedCyclingModel, setSelectedCyclingModel] = useState<CyclingDistanceModel>('fifty_m_50');
  const [selectedSwimmingModel, setSelectedSwimmingModel] = useState<SwimmingDistanceModel>('swim_1_9k');
  const [timelineLookback, setTimelineLookback] = useState<number>(60); // 30, 60, 90 days
  const [selectedChartDiscipline, setSelectedChartDiscipline] = useState<'combined' | 'swim' | 'bike' | 'run'>('combined');
  const [hoveredRecord, setHoveredRecord] = useState<DailyFitnessRecord | null>(null);

  // Modal inspection state
  const [activeModalActivity, setActiveModalActivity] = useState<StravaActivity | null>(null);

  // Compute full daily fitness timeline across ALL historical activities we have data for
  const fullFitnessTimeline = useMemo(() => {
    return computeFitnessTimeline(activities, activityDetails, athleteProfile, Infinity);
  }, [activities, activityDetails, athleteProfile]);

  // Slice to selected lookback window (30d / 60d / 90d) strictly for the Timeline Chart
  const fitnessTimeline = useMemo(() => {
    if (fullFitnessTimeline.length === 0) return [];
    const count = Math.max(1, timelineLookback + 1);
    return fullFitnessTimeline.slice(-count);
  }, [fullFitnessTimeline, timelineLookback]);

  // Today / latest record
  const latestRecord = useMemo(() => {
    if (fullFitnessTimeline.length === 0) {
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
    return fullFitnessTimeline[fullFitnessTimeline.length - 1];
  }, [fullFitnessTimeline]);

  // Interactive overrides for CTL Target & Feasibility Model
  const [showCtlDerivationPanel, setShowCtlDerivationPanel] = useState<boolean>(true);
  const [customWeeksToRace, setCustomWeeksToRace] = useState<number | undefined>(undefined);
  const [customAvailableHours, setCustomAvailableHours] = useState<number | undefined>(undefined);

  // Next 1–3 upcoming goal races with weeks remaining for Back-Scheduling & Periodization
  const upcomingGoalRaces = useMemo(() => {
    if (!goals || goals.length === 0) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    return goals
      .filter((g) => {
        if (!g.eventDate || g.status === 'abandoned' || g.status === 'completed' || g.status === 'missed') {
          return false;
        }
        const [y, m, d] = g.eventDate.split('-').map(Number);
        if (!y || !m || !d) return false;
        const evDate = new Date(y, m - 1, d);
        evDate.setHours(0, 0, 0, 0);
        return evDate.getTime() >= todayMs;
      })
      .map((g) => {
        const [y, m, d] = g.eventDate.split('-').map(Number);
        const evDate = new Date(y, m - 1, d);
        evDate.setHours(0, 0, 0, 0);
        const diffDays = Math.max(0, Math.round((evDate.getTime() - todayMs) / 86400000));
        const weeksExact = Math.round((diffDays / 7) * 10) / 10;
        const weeksRounded = Math.max(1, Math.round(diffDays / 7));
        const shortDate = evDate.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: '2-digit',
        });
        return {
          id: g.id,
          name: g.name,
          priority: g.priority,
          eventType: g.eventType,
          eventDate: g.eventDate,
          shortDate,
          diffDays,
          weeksExact,
          weeksRounded,
        };
      })
      .sort((a, b) => a.diffDays - b.diffDays)
      .slice(0, 3);
  }, [goals]);

  // First-principles CTL Target, Empirical IF, Ramp Rate & Periodization Derivation
  const ctlDerivation = useMemo(() => {
    return deriveEventCtlTargetAndFeasibility({
      sport: selectedSport,
      triModel: selectedModel,
      runModel: selectedRunningModel,
      bikeModel: selectedCyclingModel,
      swimModel: selectedSwimmingModel,
      activities,
      activityDetails,
      athleteProfile,
      goals,
      fitnessTimeline: fullFitnessTimeline,
      customAvailableWeeklyHours: customAvailableHours,
      customWeeksToRace,
    });
  }, [
    selectedSport,
    selectedModel,
    selectedRunningModel,
    selectedCyclingModel,
    selectedSwimmingModel,
    activities,
    activityDetails,
    athleteProfile,
    goals,
    fullFitnessTimeline,
    customAvailableHours,
    customWeeksToRace,
  ]);

  // Dynamic Discipline-specific metrics anchored to Age-Group First-Principles Derivation
  const disciplineFitness = useMemo(() => {
    const targetPeak = ctlDerivation.targetPeakCtl;
    const [ctlLow, ctlHigh] = ctlDerivation.targetCtlRange;
    const [raceLow, raceHigh] = ctlDerivation.targetRaceDayCtlRange;
    const hrs = ctlDerivation.totalWeeklyHours;

    if (selectedSport === 'run') {
      const runProfile = RUNNING_MODEL_PROFILES[selectedRunningModel];
      const score = Math.min(100, Math.round((latestRecord.runCtl / Math.max(1, targetPeak)) * 100));
      return {
        title: 'Running Performance Readiness',
        headerTitle: 'Running Readiness & Training Load',
        subtitle: `${runProfile.description}. Derived from event long-run demand & your 12-week median IF.`,
        score,
        target: targetPeak,
        targetRange: [ctlLow, ctlHigh] as [number, number],
        raceDayRange: [raceLow, raceHigh] as [number, number],
        weeklyHours: hrs,
        ctl: latestRecord.runCtl,
        atl: latestRecord.runAtl,
        tsb: latestRecord.runTsb,
        label: `${latestRecord.runCtl} / ${targetPeak} Peak rCTL (~${hrs}h/wk)`,
        formula: `rCTL = (1/7) × H_run × IF_run² × 100`,
        badge: runProfile.label,
      };
    }

    if (selectedSport === 'bike') {
      const bikeProfile = CYCLING_MODEL_PROFILES[selectedCyclingModel];
      const score = Math.min(100, Math.round((latestRecord.bikeCtl / Math.max(1, targetPeak)) * 100));
      return {
        title: 'Cycling Performance Readiness',
        headerTitle: 'Cycling Readiness & Training Load',
        subtitle: `${bikeProfile.description}. Derived from long-ride demand & your 12-week median IF.`,
        score,
        target: targetPeak,
        targetRange: [ctlLow, ctlHigh] as [number, number],
        raceDayRange: [raceLow, raceHigh] as [number, number],
        weeklyHours: hrs,
        ctl: latestRecord.bikeCtl,
        atl: latestRecord.bikeAtl,
        tsb: latestRecord.bikeTsb,
        label: `${latestRecord.bikeCtl} / ${targetPeak} Peak bCTL (~${hrs}h/wk)`,
        formula: `bCTL = (1/7) × H_bike × IF_bike² × 100`,
        badge: bikeProfile.label,
      };
    }

    if (selectedSport === 'swim') {
      const swimProfile = SWIMMING_MODEL_PROFILES[selectedSwimmingModel];
      const score = Math.min(100, Math.round((latestRecord.swimCtl / Math.max(1, targetPeak)) * 100));
      return {
        title: 'Swimming Performance Readiness',
        headerTitle: 'Swimming Readiness & Training Load',
        subtitle: `${swimProfile.description}. Derived from long-swim demand & cubic sTSS (IF³).`,
        score,
        target: targetPeak,
        targetRange: [ctlLow, ctlHigh] as [number, number],
        raceDayRange: [raceLow, raceHigh] as [number, number],
        weeklyHours: hrs,
        ctl: latestRecord.swimCtl,
        atl: latestRecord.swimAtl,
        tsb: latestRecord.swimTsb,
        label: `${latestRecord.swimCtl} / ${targetPeak} Peak sCTL (~${hrs}h/wk)`,
        formula: `sCTL = (1/7) × H_swim × IF_swim³ × 100`,
        badge: swimProfile.label,
      };
    }

    // Default: Triathlon
    const triProfile = DISTANCE_MODEL_PROFILES[selectedModel === 'custom_goal' ? 'middle_70_3' : selectedModel];
    return {
      title: 'Triathlon Training Load',
      headerTitle: `Triathlon Readiness & Load (${triProfile.label})`,
      subtitle: `Age-group calibrated Peak Target: ${targetPeak} CTL @ ~${hrs}h/wk across Swim (sTSS), Bike, and Run.`,
      score: Math.round(latestRecord.triCtl),
      target: targetPeak,
      targetRange: [ctlLow, ctlHigh] as [number, number],
      raceDayRange: [raceLow, raceHigh] as [number, number],
      weeklyHours: hrs,
      ctl: latestRecord.triCtl,
      atl: latestRecord.triAtl,
      tsb: latestRecord.triTsb,
      label: `${latestRecord.triCtl} Total CTL`,
      formula: `CTL = (1/7) × Σ [H_d × IF_d^p_d × 100]`,
      badge: triProfile.label,
    };
  }, [selectedSport, selectedModel, selectedRunningModel, selectedCyclingModel, selectedSwimmingModel, latestRecord, ctlDerivation]);

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

  // Interactive timeline hover / touch selection state
  const [hoveredTimelineIdx, setHoveredTimelineIdx] = useState<number | null>(null);
  const [pinnedTimelineIdx, setPinnedTimelineIdx] = useState<number | null>(null);
  const timelinePlotRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setHoveredTimelineIdx(null);
    setPinnedTimelineIdx(null);
  }, [timelineLookback, selectedChartDiscipline]);

  const resolveTimelineIdxFromClientX = (clientX: number): number | null => {
    const el = timelinePlotRef.current;
    if (!el || fitnessTimeline.length === 0) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * (fitnessTimeline.length - 1));
  };

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
    if (!fullFitnessTimeline || fullFitnessTimeline.length === 0) {
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

    const latest = fullFitnessTimeline[fullFitnessTimeline.length - 1];
    const refDateStr = latest.date;
    const refYear = parseInt(refDateStr.slice(0, 4), 10);
    const refMonth = parseInt(refDateStr.slice(5, 7), 10) - 1;
    const refDay = parseInt(refDateStr.slice(8, 10), 10);

    const startOfMonthStr = `${refDateStr.slice(0, 7)}-01`;
    const refDateObj = new Date(Date.UTC(refYear, refMonth, refDay, 12, 0, 0));
    const twentyDaysAgoObj = new Date(refDateObj.getTime() - 19 * 24 * 60 * 60 * 1000);
    const twentyDaysAgoStr = twentyDaysAgoObj.toISOString().slice(0, 10);

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const shortMonthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];

    let page1Cutoff: string;
    let page1Label: string;

    // First tab rule: show either current month-to-date (if >= 20th) or last 20 days
    if (refDay >= 20) {
      page1Cutoff = startOfMonthStr;
      page1Label = `${monthNames[refMonth]} ${refYear} (1st–${refDay}${getOrdinal(refDay)})`;
    } else {
      page1Cutoff = twentyDaysAgoStr;
      page1Label = `Last 20 Days (${formatShortDate(twentyDaysAgoStr)} – ${formatShortDate(refDateStr)})`;
    }

    const page1Records = fullFitnessTimeline
      .filter((r) => r.date >= page1Cutoff && r.date <= refDateStr)
      .slice()
      .reverse();

    const pages: TrainingLogPage[] = [
      {
        id: 'page_1_recent',
        pageNumber: 1,
        label: page1Label,
        monthTitle: `${shortMonthNames[refMonth]} ${refYear}`,
        isRecentWindow: true,
        startDate: page1Cutoff,
        endDate: refDateStr,
        records: page1Records,
      },
    ];

    // Subsequent tabs: group ALL dates prior to the current calendar month (r.date < startOfMonthStr)
    // so selecting the next month tab always displays every single day belonging to that month,
    // extending all the way back to the earliest historical date we have data for.
    const previousMonthsRecords = fullFitnessTimeline.filter((r) => r.date < startOfMonthStr);
    if (previousMonthsRecords.length > 0) {
      const monthMap = new Map<string, DailyFitnessRecord[]>();
      for (const rec of previousMonthsRecords) {
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
        const fullTitle = `${monthNames[m]} ${y}`;
        const tabTitle = `${shortMonthNames[m]} ${y}`;
        pages.push({
          id: `page_month_${ym}`,
          pageNumber: idx + 2,
          label: `${fullTitle} (${mRecords.length} days)`,
          monthTitle: tabTitle,
          isRecentWindow: false,
          startDate: mRecords[mRecords.length - 1].date,
          endDate: mRecords[0].date,
          records: mRecords,
        });
      });
    }

    return pages;
  }, [fullFitnessTimeline]);

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
        <div className="flex items-center gap-2 flex-wrap max-w-full min-w-0">
          <div className="flex items-center gap-1 sm:gap-1.5 p-0.5 text-[11px] sm:text-xs font-bold max-w-full overflow-x-auto scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedSport('triathlon')}
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                selectedSport === 'triathlon'
                  ? 'bg-amber-500 text-slate-950 shadow-sm border-2 border-slate-400'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 border border-transparent'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <Award className="w-3.5 h-3.5 shrink-0" />
              <span>Triathlon</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSport('run')}
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                selectedSport === 'run'
                  ? 'bg-amber-500 text-slate-950 shadow-sm border-2 border-slate-400'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 border border-transparent'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <Footprints className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Running</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSport('bike')}
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                selectedSport === 'bike'
                  ? 'bg-amber-500 text-slate-950 shadow-sm border-2 border-slate-400'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 border border-transparent'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <Bike className="w-3.5 h-3.5 text-orange-400 shrink-0" />
              <span>Cycling</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedSport('swim')}
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                selectedSport === 'swim'
                  ? 'bg-amber-500 text-slate-950 shadow-sm border-2 border-slate-400'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 border border-transparent'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <Waves className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>Swim</span>
            </button>
          </div>

          {/* Triathlon Performance Readiness Presets */}
          {selectedSport === 'triathlon' && (
            <div className="flex items-center gap-1 p-0.5 text-xs max-w-full overflow-x-auto scrollbar-none">
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
                  className={`px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer text-[11px] sm:text-xs whitespace-nowrap shrink-0 ${
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
            <div className="flex items-center gap-1 p-0.5 text-xs max-w-full overflow-x-auto scrollbar-none">
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
                  className={`px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer text-[11px] sm:text-xs whitespace-nowrap shrink-0 ${
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
            <div className="flex items-center gap-1 p-0.5 text-xs max-w-full overflow-x-auto scrollbar-none">
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
                  className={`px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer text-[11px] sm:text-xs whitespace-nowrap shrink-0 ${
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
            <div className="flex items-center gap-1 p-0.5 text-xs max-w-full overflow-x-auto scrollbar-none">
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
                  className={`px-2 py-1.5 rounded-lg font-bold transition-all cursor-pointer text-[11px] sm:text-xs whitespace-nowrap shrink-0 ${
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
      {/* 2. HERO METRICS CLUSTER: CTL + ATL + FORM (TSB)           */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Current CTL & ATL Card */}
        <div
          className={`rounded-2xl p-5 border flex flex-col justify-between ${
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

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-xs space-y-1 text-slate-500">
            <div className="flex items-center justify-between">
              <span>
                Peak Target: <strong className={isLight ? 'text-slate-800' : 'text-slate-200'}>{disciplineFitness.target} CTL</strong>{' '}
                <span className="font-mono text-[11px]">
                  (~{disciplineFitness.weeklyHours} h/wk)
                </span>
              </span>
              <span className="font-mono font-bold text-sky-400">
                {Math.round((disciplineFitness.ctl / Math.max(1, disciplineFitness.target)) * 100)}% of peak
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span>
                Race-Day Tapered Target ({ctlDerivation.taperWeeks}w taper):{' '}
                <strong className="text-emerald-400 font-mono">
                  {Math.round(disciplineFitness.target * 0.88)} CTL
                </strong>
              </span>
              <span className="font-mono text-slate-400">TSB +10 to +25</span>
            </div>
          </div>
        </div>

        {/* Form (TSB = CTL - ATL) Card */}
        <div
          className={`rounded-2xl p-5 border flex flex-col justify-between ${
            isLight
              ? 'bg-white border-slate-200 shadow-sm text-slate-900'
              : 'bg-slate-900/60 border-slate-800 text-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-emerald-400" />
              Form (TSB) &amp; Ramp Guardrail
            </span>
            <span className="text-[10px] font-mono text-slate-400">Start-of-Day (CTL_yest – ATL_yest)</span>
          </div>

          <div className="my-3 flex items-baseline justify-between gap-2">
            <div>
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

            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Max Build Ramp</div>
              <div className="text-lg sm:text-xl font-black font-mono text-amber-400">
                +{ctlDerivation.headlineMaxBuildRamp} <span className="text-[11px] font-normal text-slate-400">CTL/wk</span>
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                Net +{ctlDerivation.effectiveMaxNetRamp}/wk ({athleteProfile.periodization === '3weeks' ? '2:1' : athleteProfile.periodization === '0' ? 'Linear' : '3:1'})
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] flex items-center justify-between text-slate-500">
            <span>
              Next Build Wk Target: <strong className="font-mono text-amber-400">{ctlDerivation.nextBuildWeekTssTarget} TSS</strong>
            </span>
            <span className={ctlDerivation.tsbWarning ? 'text-rose-400 font-bold' : 'text-emerald-400 font-mono'}>
              Proj. TSB: {ctlDerivation.projectedBuildTsb > 0 ? `+${ctlDerivation.projectedBuildTsb}` : ctlDerivation.projectedBuildTsb}
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2B. AGE-GROUP CTL TARGET, RAMP RATE & PERIODIZATION MODEL */}
      {/* ========================================================= */}
      <div
        className={`rounded-2xl border transition-colors ${
          isLight
            ? 'bg-white border-slate-200 shadow-sm text-slate-900'
            : 'bg-slate-900/60 border-slate-800 text-white'
        }`}
      >
        <div
          onClick={() => setShowCtlDerivationPanel((prev) => !prev)}
          className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
        >
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-extrabold tracking-tight">
                  Age-Group CTL Target, Empirical IF &amp; Periodized Ramp Model
                </h3>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30">
                  {ctlDerivation.eventLabel}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                    ctlDerivation.isOverallFeasible
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                  }`}
                >
                  {ctlDerivation.isOverallFeasible ? 'Plan Feasible' : 'Ramp / Hours Adjustment Advised'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                First-principles derivation: <code className="font-mono text-[11px] text-amber-400">CTL = (1/7) × Σ [H_d × IF_d^p_d × 100]</code> anchored on long-session event demands &amp; your 8–12w median IF.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
            <div className="text-right hidden sm:block">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Peak Target &amp; Hours</div>
              <div className="text-sm font-mono font-black text-sky-400">
                {ctlDerivation.targetPeakCtl} CTL{' '}
                <span className="text-xs font-normal text-slate-400">({ctlDerivation.totalWeeklyHours} h/wk)</span>
              </div>
            </div>
            {showCtlDerivationPanel ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </div>
        </div>

        {showCtlDerivationPanel && (
          <div className="px-4 pb-5 sm:px-5 space-y-5 border-t border-slate-200 dark:border-slate-800/80 pt-4">
            {/* Row 1: Summary KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div
                className={`p-3 rounded-xl border ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                }`}
              >
                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  1. Peak Target (2–3w out)
                </div>
                <div className="text-lg sm:text-xl font-black font-mono text-sky-400 mt-1">
                  {ctlDerivation.targetPeakCtl} CTL{' '}
                  <span className="text-xs font-normal text-slate-400">
                    ({ctlDerivation.totalWeeklyHours} h/wk)
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Steady-state at {ctlDerivation.totalWeeklyTssAtPeak} TSS/wk
                </div>
              </div>

              <div
                className={`p-3 rounded-xl border ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                }`}
              >
                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  2. Race-Day CTL (Post-Taper)
                </div>
                <div className="text-lg sm:text-xl font-black font-mono text-emerald-400 mt-1">
                  {Math.round(ctlDerivation.targetPeakCtl * 0.88)} CTL
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {ctlDerivation.taperWeeks}w taper (0.88 × Peak, TSB +15)
                </div>
              </div>

              <div
                className={`p-3 rounded-xl border ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                }`}
              >
                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  3. Peak Weekly Hours (H_total)
                </div>
                <div className="text-lg sm:text-xl font-black font-mono text-amber-400 mt-1">
                  {ctlDerivation.totalWeeklyHours} h/wk
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Available: {ctlDerivation.availableWeeklyHours}h/wk (~{ctlDerivation.ctlSteadyStateAtAvailable} CTL cap){' '}
                  <span className={ctlDerivation.isHoursFeasible ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    ({ctlDerivation.isHoursFeasible ? 'Fits schedule' : 'Exceeds hours'})
                  </span>
                </div>
              </div>

              <div
                className={`p-3 rounded-xl border ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
                }`}
              >
                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  4. Required Build Ramp
                </div>
                <div
                  className={`text-lg sm:text-xl font-black font-mono mt-1 ${
                    ctlDerivation.isRampFeasible ? 'text-purple-400' : 'text-rose-400'
                  }`}
                >
                  +{ctlDerivation.requiredBuildRampPerWeek} CTL/wk
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Net +{ctlDerivation.requiredNetRampPerWeek}/wk vs Max +{ctlDerivation.headlineMaxBuildRamp}/wk
                </div>
              </div>
            </div>

            {/* Row 2: Per-Discipline Hours, Empirical IF & CTL Derivation Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs font-mono">
                <thead
                  className={`border-b text-[10px] uppercase font-bold tracking-wider ${
                    isLight
                      ? 'bg-slate-50 border-slate-200 text-slate-600'
                      : 'bg-slate-950/80 border-slate-800 text-slate-400'
                  }`}
                >
                  <tr>
                    <th className="py-2.5 px-3 font-sans">Discipline</th>
                    <th className="py-2.5 px-3">Race Leg (T_d)</th>
                    <th className="py-2.5 px-3">Long Session (L_d)</th>
                    <th className="py-2.5 px-3">Share (s_d)</th>
                    <th className="py-2.5 px-3 text-amber-400">Peak Hours (H_d)</th>
                    <th className="py-2.5 px-3 text-purple-400">Athlete IF_d (p_d)</th>
                    <th className="py-2.5 px-3">Weekly TSS</th>
                    <th className="py-2.5 px-3 text-sky-400">Peak CTL Target</th>
                    <th className="py-2.5 px-3">Current CTL</th>
                    <th className="py-2.5 px-3 text-emerald-400">Max Ramp Cap</th>
                  </tr>
                </thead>
                <tbody className={isLight ? 'divide-y divide-slate-100' : 'divide-y divide-slate-800/50'}>
                  {ctlDerivation.disciplines.map((d) => {
                    const colorClass =
                      d.discipline === 'swim'
                        ? 'text-sky-400'
                        : d.discipline === 'bike'
                        ? 'text-orange-400'
                        : 'text-amber-400';
                    return (
                      <tr key={d.discipline} className={isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800/30'}>
                        <td className={`py-2.5 px-3 font-sans font-bold ${colorClass}`}>{d.label}</td>
                        <td className="py-2.5 px-3">{d.expectedRaceHours.toFixed(2)}h</td>
                        <td className="py-2.5 px-3">
                          {d.longSessionHours.toFixed(2)}h{' '}
                          <span className="text-[10px] text-slate-500">
                            ({d.longSessionMultiplier}×, cap {d.longSessionCapHours}h)
                          </span>
                        </td>
                        <td className="py-2.5 px-3">{Math.round(d.weeklyShare * 100)}%</td>
                        <td className="py-2.5 px-3 font-bold text-amber-400">
                          {d.weeklyHours} h/wk
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-purple-400">{d.ifStats.medianIf.toFixed(2)}</span>
                          <span className="text-[10px] text-slate-400 ml-1">
                            (p={d.ifStats.exponent} → {d.ifStats.tssPerHour} TSS/h)
                          </span>
                          <span
                            className={`ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-sans font-bold ${
                              d.ifStats.source === 'empirical'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-slate-500/15 text-slate-400'
                            }`}
                          >
                            {d.ifStats.source === 'empirical' ? `12w Med (${d.ifStats.sessionCount})` : 'Prior'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold">{d.weeklyTss} TSS</td>
                        <td className="py-2.5 px-3 font-bold text-sky-400">
                          {d.targetPeakCtl} CTL
                        </td>
                        <td className="py-2.5 px-3">{d.currentCtl} CTL</td>
                        <td className="py-2.5 px-3 text-emerald-400">≤ +{d.maxSafeRampPerWeek} pts/wk</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Row 3: Interactive Back-Scheduling Sliders + Ramp Rate / Periodization / Running vs Triathlon Guidance */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Column 1: Interactive Back-Scheduling & Periodization Controls */}
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-amber-400">
                    Back-Scheduling &amp; Periodization
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">{ctlDerivation.periodizationLabel}</span>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-400">Weeks to Target Event:</span>
                      <span className="font-mono font-bold text-sky-400">
                        {ctlDerivation.weeksToRace} wks ({ctlDerivation.weeksToPeak}w to peak + {ctlDerivation.taperWeeks}w taper)
                      </span>
                    </div>
                    <input
                      type="range"
                      min={4}
                      max={40}
                      value={ctlDerivation.weeksToRace}
                      onChange={(e) => setCustomWeeksToRace(Number(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-400">Available Weekly Hours (H_avail):</span>
                      <span className="font-mono font-bold text-amber-400">{ctlDerivation.availableWeeklyHours} h/wk</span>
                    </div>
                    <input
                      type="range"
                      min={4}
                      max={26}
                      step={0.5}
                      value={ctlDerivation.availableWeeklyHours}
                      onChange={(e) => setCustomAvailableHours(Number(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] space-y-1 text-slate-400">
                  <div className="flex justify-between">
                    <span>Build vs Recovery Weeks:</span>
                    <span className="font-mono text-slate-200">
                      {ctlDerivation.buildWeeksAvailable} build + {ctlDerivation.recoveryWeeksCount} recovery (65% load)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Steady-State Time to Target:</span>
                    <span className="font-mono text-sky-400">
                      {ctlDerivation.steadyStateWeeksToTarget !== null
                        ? `${ctlDerivation.steadyStateWeeksToTarget} wks (6 × ln ratio)`
                        : 'Target reached'}
                    </span>
                  </div>
                </div>

                {/* Next 1–3 Goal Races Countdown Lines */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] space-y-1">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                    Next Goal Races
                  </div>
                  {upcomingGoalRaces.length > 0 ? (
                    upcomingGoalRaces.map((g) => {
                      const isActiveHorizon = ctlDerivation.weeksToRace === g.weeksRounded;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setCustomWeeksToRace(Math.min(52, Math.max(4, g.weeksRounded)))}
                          className={`w-full flex items-center justify-between gap-2 text-left py-0.5 rounded transition-colors cursor-pointer ${
                            isActiveHorizon
                              ? 'text-amber-400 font-bold'
                              : isLight
                              ? 'text-slate-700 hover:text-slate-950'
                              : 'text-slate-300 hover:text-white'
                          }`}
                          title={`Click to set target horizon to ${g.weeksRounded} weeks (${g.name})`}
                        >
                          <span className="truncate">
                            <span className="font-mono font-bold text-amber-400 mr-1">[{g.priority}]</span>
                            {g.name}{' '}
                            <span className="text-[10px] text-slate-500">({g.shortDate})</span>
                          </span>
                          <span className="font-mono shrink-0 text-sky-400 font-bold">
                            {g.weeksExact} wks
                          </span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="text-slate-500 text-[11px]">
                      No upcoming goal races set in Goals tab.
                    </div>
                  )}
                </div>
              </div>

              {/* Column 2: Ramp Rate Rules & Running vs Triathlon Tissue Limits */}
              <div
                className={`p-4 rounded-xl border space-y-2.5 ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-slate-800'
                }`}
              >
                <div className="text-xs font-extrabold uppercase tracking-wider text-purple-400">
                  Ramp Rate &amp; Running vs. Triathlon Limits
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Weekly TSS for ramp <code className="font-mono text-purple-300">r</code>:{' '}
                  <code className="font-mono text-amber-400">7 × (CTL_now + 6 × r)</code>. Ramp tolerance scales down as CTL rises (CTL &lt;50: 4–6/wk; 50–100: 4–7/wk; &gt;100: 3–5/wk).
                </p>
                <ul className="text-[11px] space-y-1 text-slate-300">
                  <li className="flex items-center justify-between">
                    <span className="text-slate-400">• Running Bone/Tendon Cap:</span>
                    <span className="font-mono font-bold text-amber-400">≤ +3.5 pts/wk (+10–15m long run)</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-slate-400">• Cycling Aerobic Cap:</span>
                    <span className="font-mono font-bold text-orange-400">≤ +6.0 pts/wk (5–7 pts/wk)</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-slate-400">• Triathlon Multi-Tissue Cap:</span>
                    <span className="font-mono font-bold text-sky-400">≤ +6.0 pts/wk combined</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-slate-400">• Your Max 4-Wk Historical Ramp:</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {ctlDerivation.historicalMax4WkRamp > 0 ? `+${ctlDerivation.historicalMax4WkRamp} pts/wk` : 'Calibrating'}
                    </span>
                  </li>
                </ul>
              </div>

              {/* Column 3: Feasibility Verdict & Nearest Feasible Alternatives */}
              <div
                className={`p-4 rounded-xl border space-y-2.5 ${
                  ctlDerivation.isOverallFeasible
                    ? isLight
                      ? 'bg-emerald-50/60 border-emerald-200'
                      : 'bg-emerald-950/20 border-emerald-500/30'
                    : isLight
                    ? 'bg-amber-50/60 border-amber-200'
                    : 'bg-amber-950/20 border-amber-500/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-extrabold uppercase tracking-wider ${
                      ctlDerivation.isOverallFeasible ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    Feasibility &amp; Nearest Alternatives
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">TSB Guardrail ≥ -30</span>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {ctlDerivation.isOverallFeasible
                    ? `Your required build ramp (+${ctlDerivation.requiredBuildRampPerWeek} CTL/wk) and peak volume (${ctlDerivation.totalWeeklyHours}h/wk) fit safely within your ${ctlDerivation.periodizationLabel.split(' ')[0]} periodization block.`
                    : `Reaching ${ctlDerivation.targetPeakCtl} Peak CTL in ${ctlDerivation.weeksToPeak} build weeks requires +${ctlDerivation.requiredBuildRampPerWeek} CTL/wk (safe ceiling +${ctlDerivation.headlineMaxBuildRamp}/wk) or ${ctlDerivation.totalWeeklyHours}h/wk.`}
                </p>

                <div className="pt-1 space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">
                      1. Reachable Peak (@ {ctlDerivation.availableWeeklyHours}h/wk):
                    </span>
                    <span className="font-mono font-bold text-sky-400 text-right">
                      {ctlDerivation.alternatives.reachablePeakCtlByRace} Peak CTL ({ctlDerivation.alternatives.reachableRaceDayCtl} Race Day)
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-400 shrink-0">
                      2. Earliest Safe Date for {ctlDerivation.targetPeakCtl} CTL:
                    </span>
                    <span className="font-mono font-bold text-emerald-400 text-right">
                      {ctlDerivation.alternatives.earliestFeasibleWeeksToRace} wks ({ctlDerivation.alternatives.earliestFeasibleDateStr})
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 pt-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400">3. Highest-Leverage Extra Hour:</span>
                      <span className="font-mono font-bold text-amber-400 text-right">
                        +1h {ctlDerivation.alternatives.highestLeverageDiscipline.label} → ~{ctlDerivation.alternatives.highestLeverageDiscipline.minutesSavedPerExtraHour} min/hr (+{ctlDerivation.alternatives.highestLeverageDiscipline.ctlPerExtraHour} CTL)
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 text-right">
                      {ctlDerivation.alternatives.highestLeverageDiscipline.rationale}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
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
        className={`rounded-2xl border px-3 py-4 sm:p-5 transition-colors ${
          isLight
            ? 'bg-white border-slate-200 shadow-sm'
            : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-200/80 dark:border-slate-800/80">
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
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
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

        {/* Chart Key / Legend + Non-Overlapping Selected Point Readout */}
        <div className="pt-3 pb-2 flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <span className="flex items-center gap-1.5 font-bold text-sky-400">
                <span className="w-3 h-0.5 bg-sky-400 rounded-full" />
                <span>CTL (Fitness 42d)</span>
              </span>
              <span className="flex items-center gap-1.5 font-bold text-purple-400">
                <span className="w-3 h-[1.5px] bg-purple-400 rounded-full" />
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

          {/* Dedicated Inspected Day Strip (never covers chart lines, works with tap & drag) */}
          {fitnessTimeline.length > 0 && (() => {
            const activeIdx =
              hoveredTimelineIdx ??
              pinnedTimelineIdx ??
              fitnessTimeline.length - 1;
            const r = fitnessTimeline[activeIdx] || fitnessTimeline[fitnessTimeline.length - 1];
            const isInspecting = hoveredTimelineIdx !== null || pinnedTimelineIdx !== null;
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
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] sm:text-xs font-mono tabular-nums flex flex-wrap items-center justify-between gap-x-3 gap-y-1 ${
                  isLight
                    ? 'bg-slate-50 border-slate-200 text-slate-800'
                    : 'bg-slate-950/60 border-slate-800/80 text-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span className="font-bold text-amber-400">
                    {r.date}
                    {!isInspecting && <span className="text-[10px] font-sans font-normal text-slate-500 ml-1">(Latest · tap/drag chart)</span>}
                  </span>
                  <span className="text-sky-400 font-bold">CTL {ctl.toFixed(1)}</span>
                  <span className="text-purple-400 font-bold">ATL {atl.toFixed(1)}</span>
                  <span className={`font-bold ${tsb >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    TSB {tsb > 0 ? `+${tsb.toFixed(1)}` : tsb.toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-sans text-[10px] font-semibold ${status.color}`}>
                    {status.label}
                  </span>
                  {pinnedTimelineIdx !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        setPinnedTimelineIdx(null);
                        setHoveredTimelineIdx(null);
                      }}
                      className="text-[10px] font-sans text-slate-400 hover:text-white underline cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Taller Distortion-Free Timeline Chart with Smooth Touch/Pointer Scrubbing */}
        <div className="relative pt-2 pb-1">
          <div
            ref={timelinePlotRef}
            onPointerDown={(e) => {
              const idx = resolveTimelineIdxFromClientX(e.clientX);
              if (idx !== null) {
                setPinnedTimelineIdx(idx);
                setHoveredTimelineIdx(idx);
              }
            }}
            onPointerMove={(e) => {
              const idx = resolveTimelineIdxFromClientX(e.clientX);
              if (idx !== null) {
                setHoveredTimelineIdx(idx);
                if (e.buttons > 0) setPinnedTimelineIdx(idx);
              }
            }}
            onPointerLeave={() => {
              setHoveredTimelineIdx(null);
            }}
            onTouchStart={(e) => {
              if (e.touches[0]) {
                const idx = resolveTimelineIdxFromClientX(e.touches[0].clientX);
                if (idx !== null) {
                  setPinnedTimelineIdx(idx);
                  setHoveredTimelineIdx(idx);
                }
              }
            }}
            onTouchMove={(e) => {
              if (e.touches[0]) {
                const idx = resolveTimelineIdxFromClientX(e.touches[0].clientX);
                if (idx !== null) {
                  setPinnedTimelineIdx(idx);
                  setHoveredTimelineIdx(idx);
                }
              }
            }}
            className="h-64 sm:h-80 w-full relative select-none touch-pan-y cursor-crosshair"
          >
            {fitnessTimeline.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                No historical training activities recorded.
              </div>
            ) : (
              <>
                <svg
                  className="w-full h-full overflow-visible block"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  {/* Horizontal reference grid lines (non-scaling stroke) */}
                  {chartScaling.ticks.map((tickVal) => {
                    const y = ((chartScaling.yMax - tickVal) / chartScaling.range) * 90 + 5;
                    const isZero = tickVal === 0;
                    return (
                      <line
                        key={tickVal}
                        x1="0"
                        y1={y}
                        x2="100"
                        y2={y}
                        vectorEffect="non-scaling-stroke"
                        stroke="currentColor"
                        strokeDasharray={isZero ? 'none' : '3,3'}
                        className={isZero ? 'text-slate-500/80' : isLight ? 'text-slate-200' : 'text-slate-800'}
                        strokeWidth={isZero ? '1.25' : '1'}
                      />
                    );
                  })}

                  {/* Form (TSB) Visual Pillars */}
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
                    const barW = Math.max(0.55, 76 / fitnessTimeline.length);
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
                        height={Math.max(0.25, height)}
                        fill={isPositive ? '#10b981' : '#f43f5e'}
                        opacity={0.32}
                      />
                    );
                  })}

                  {/* CTL Path (Fitness - Sky Blue Line, uniform pixel width) */}
                  <polyline
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2.2"
                    vectorEffect="non-scaling-stroke"
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

                  {/* ATL Path (Fatigue - Narrower, consistent Purple Line via non-scaling-stroke) */}
                  <polyline
                    fill="none"
                    stroke="#c084fc"
                    strokeWidth="1.35"
                    vectorEffect="non-scaling-stroke"
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
                </svg>

                {/* Unstretched Y-Axis Tick Labels Overlay */}
                <div className="pointer-events-none absolute inset-0">
                  {chartScaling.ticks.map((tickVal) => {
                    const yPct = ((chartScaling.yMax - tickVal) / chartScaling.range) * 90 + 5;
                    const isZero = tickVal === 0;
                    return (
                      <span
                        key={`ylabel-${tickVal}`}
                        style={{ top: `${yPct}%` }}
                        className={`absolute left-1 -translate-y-full pb-0.5 text-[10px] font-mono tabular-nums leading-none px-1 rounded ${
                          isZero
                            ? 'text-sky-400 font-bold'
                            : isLight
                            ? 'text-slate-500 bg-white/70'
                            : 'text-slate-400 bg-slate-900/60'
                        }`}
                      >
                        {tickVal}
                      </span>
                    );
                  })}
                </div>

                {/* Unstretched Active Crosshair & Circular Dots Overlay */}
                {(() => {
                  const activeIdx = hoveredTimelineIdx ?? pinnedTimelineIdx;
                  if (activeIdx === null || !fitnessTimeline[activeIdx]) return null;
                  const r = fitnessTimeline[activeIdx];
                  const xPct = (activeIdx / (fitnessTimeline.length - 1 || 1)) * 100;
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
                  const yCtlPct = ((chartScaling.yMax - ctl) / chartScaling.range) * 90 + 5;
                  const yAtlPct = ((chartScaling.yMax - atl) / chartScaling.range) * 90 + 5;

                  return (
                    <div className="pointer-events-none absolute inset-0">
                      <div
                        style={{ left: `${xPct}%` }}
                        className="absolute top-0 bottom-0 w-px border-l border-dashed border-sky-400/80 -translate-x-1/2"
                      />
                      <div
                        style={{ left: `${xPct}%`, top: `${yCtlPct}%` }}
                        className="absolute w-3 h-3 rounded-full bg-sky-400 border-2 border-white dark:border-slate-950 -translate-x-1/2 -translate-y-1/2 shadow-sm"
                      />
                      <div
                        style={{ left: `${xPct}%`, top: `${yAtlPct}%` }}
                        className="absolute w-2.5 h-2.5 rounded-full bg-purple-400 border-2 border-white dark:border-slate-950 -translate-x-1/2 -translate-y-1/2 shadow-sm"
                      />
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {/* Multiple Date Markers along X-Axis */}
          {fitnessTimeline.length > 0 && (
            <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-[10px] font-mono text-slate-500">
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
      {/* 7. DAILY TRAINING LOG TABLE (PAGINATED ALL-TIME HISTORY)  */}
      {/* ========================================================= */}
      <div
        className={`rounded-2xl border overflow-hidden ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="px-2.5 py-2.5 sm:px-4 sm:py-3.5 border-b border-slate-200 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
          <div>
            <h3 className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
              Daily Training Log
            </h3>
            <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {activeTrainingPage.label} • Showing {activeTrainingPage.records.length} days
            </p>
          </div>
          <span className="text-[11px] text-slate-500 font-mono tabular-nums">
            {fullFitnessTimeline.length} total days logged
          </span>
        </div>

        {/* Pagination Toolbar */}
        <div
          className={`px-2.5 py-2 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b ${
            isLight ? 'bg-slate-50/60 border-slate-200' : 'bg-slate-950/40 border-slate-800'
          }`}
        >
          {/* Quick Month Selectors (scrollable across all historical months) */}
          <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto scrollbar-thin py-0.5">
            <span
              className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider shrink-0 mr-0.5 ${
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
                  className={`px-2 py-1 rounded-lg text-[11px] sm:text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 border ${
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
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 self-end sm:self-auto">
            <button
              type="button"
              disabled={safeTrainingPageIndex === 0}
              onClick={() => setCurrentTrainingPageIndex((prev) => Math.max(0, prev - 1))}
              className={`px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-bold flex items-center gap-1 border transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
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
              className={`text-[11px] sm:text-xs font-mono tabular-nums font-bold px-2 py-1 rounded-md border ${
                isLight
                  ? 'bg-slate-100 text-slate-700 border-slate-200'
                  : 'bg-slate-950 text-slate-300 border-slate-800'
              }`}
            >
              {safeTrainingPageIndex + 1} / {trainingLogPages.length}
            </span>

            <button
              type="button"
              disabled={safeTrainingPageIndex >= trainingLogPages.length - 1}
              onClick={() =>
                setCurrentTrainingPageIndex((prev) => Math.min(trainingLogPages.length - 1, prev + 1))
              }
              className={`px-2 sm:px-2.5 py-1 rounded-lg text-[11px] sm:text-xs font-bold flex items-center gap-1 border transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
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
          <table className="w-full text-left text-[11px] sm:text-xs font-mono tabular-nums">
            <thead
              className={`border-b text-[9px] sm:text-[10px] uppercase font-bold tracking-tight sm:tracking-wider ${
                isLight
                  ? 'bg-slate-50 border-slate-200 text-slate-600'
                  : 'bg-slate-950/80 border-slate-800 text-slate-400'
              }`}
            >
              <tr>
                <th className="py-2 pl-2.5 pr-1 sm:py-2.5 sm:px-4 font-sans">Date</th>
                <th className="py-2 px-1 sm:py-2.5 sm:px-3 text-right sm:text-left text-sky-400">
                  <span className="sm:hidden">Swm</span>
                  <span className="hidden sm:inline">Swim TSS</span>
                </th>
                <th className="py-2 px-1 sm:py-2.5 sm:px-3 text-right sm:text-left text-orange-400">
                  <span className="sm:hidden">Bik</span>
                  <span className="hidden sm:inline">Bike TSS</span>
                </th>
                <th className="py-2 px-1 sm:py-2.5 sm:px-3 text-right sm:text-left text-amber-400">
                  <span className="sm:hidden">Run</span>
                  <span className="hidden sm:inline">Run TSS</span>
                </th>
                <th className={`py-2 px-1 sm:py-2.5 sm:px-3 text-right sm:text-left ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  <span className="sm:hidden">TSS</span>
                  <span className="hidden sm:inline">Daily Tri TSS</span>
                </th>
                <th className="py-2 px-1 sm:py-2.5 sm:px-3 text-right sm:text-left text-sky-400">
                  <span className="sm:hidden">CTL</span>
                  <span className="hidden sm:inline">
                    {selectedChartDiscipline === 'swim'
                      ? 'Swim CTL'
                      : selectedChartDiscipline === 'bike'
                      ? 'Bike CTL'
                      : selectedChartDiscipline === 'run'
                      ? 'Run CTL'
                      : 'Tri CTL'}
                  </span>
                </th>
                <th className="py-2 px-1 sm:py-2.5 sm:px-3 text-right sm:text-left text-purple-400">
                  <span className="sm:hidden">ATL</span>
                  <span className="hidden sm:inline">
                    {selectedChartDiscipline === 'swim'
                      ? 'Swim ATL'
                      : selectedChartDiscipline === 'bike'
                      ? 'Bike ATL'
                      : selectedChartDiscipline === 'run'
                      ? 'Run ATL'
                      : 'Tri ATL'}
                  </span>
                </th>
                <th className="py-2 pl-1 pr-2.5 sm:py-2.5 sm:px-4 text-right sm:text-left text-emerald-400">
                  <span className="sm:hidden">TSB</span>
                  <span className="hidden sm:inline">Form (TSB)</span>
                </th>
              </tr>
            </thead>
            <tbody className={isLight ? 'divide-y divide-slate-100' : 'divide-y divide-slate-800/40'}>
              {activeTrainingPage.records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400 font-sans">
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
                  let fullDateLabel = r.date;
                  let compactDateLabel = r.date;
                  const currentYear = new Date().getFullYear();
                  try {
                    const [y, m, d] = r.date.split('-').map(Number);
                    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
                    const weekday = dt.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
                    const dayNum = String(d).padStart(2, '0');
                    const monName = dt.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
                    fullDateLabel = `${weekday}, ${dayNum} ${monName} ${y}`;
                    compactDateLabel =
                      y === currentYear
                        ? `${weekday} ${dayNum} ${monName}`
                        : `${dayNum} ${monName} '${String(y).slice(-2)}`;
                  } catch {
                    fullDateLabel = r.date;
                    compactDateLabel = r.date;
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
                        className={`py-1.5 pl-2.5 pr-1 sm:py-2.5 sm:px-4 font-sans font-medium whitespace-nowrap ${
                          isLight ? 'text-slate-800' : 'text-slate-300'
                        }`}
                      >
                        <span className="sm:hidden text-[11px]">{compactDateLabel}</span>
                        <span className="hidden sm:inline">{fullDateLabel}</span>
                      </td>
                      <td className={`py-1.5 px-1 sm:py-2.5 sm:px-3 text-right sm:text-left ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                        {r.swimTss > 0 ? Math.round(r.swimTss) : '—'}
                      </td>
                      <td className={`py-1.5 px-1 sm:py-2.5 sm:px-3 text-right sm:text-left ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                        {r.bikeTss > 0 ? Math.round(r.bikeTss) : '—'}
                      </td>
                      <td className={`py-1.5 px-1 sm:py-2.5 sm:px-3 text-right sm:text-left ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                        {r.runTss > 0 ? Math.round(r.runTss) : '—'}
                      </td>
                      <td className={`py-1.5 px-1 sm:py-2.5 sm:px-3 text-right sm:text-left font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {r.totalTriTss > 0 ? Math.round(r.totalTriTss) : '0'}
                      </td>
                      <td className="py-1.5 px-1 sm:py-2.5 sm:px-3 text-right sm:text-left font-bold text-sky-400">{curCtl}</td>
                      <td className="py-1.5 px-1 sm:py-2.5 sm:px-3 text-right sm:text-left font-bold text-purple-400">{curAtl}</td>
                      <td
                        className={`py-1.5 pl-1 pr-2.5 sm:py-2.5 sm:px-4 text-right sm:text-left font-bold ${
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
            className={`px-2.5 py-2.5 sm:p-3 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] sm:text-xs ${
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
