import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Zap,
  Footprints,
  Waves,
  Timer,
  Award,
  ChevronRight,
  ArrowUpRight,
  Info,
  Calendar,
  Compass,
  Gauge,
  Activity,
  Layers,
  Sparkles,
  BarChart2,
  ShieldCheck,
  AlertCircle,
  Sliders,
  CheckCircle2,
  Flame,
  Heart,
  RefreshCw,
  Crosshair,
  Scale,
  Mountain,
  Wind,
} from 'lucide-react';
import { StravaActivity, StravaActivityDetailsRecord } from '../utils/stravaActivities';
import { AthleteProfile, formatSecondsToMinSec } from '../types/athlete';
import { TrainingGoal } from '../types/goals';
import {
  PEAK_DURATIONS,
  computeCriticalParameters,
  computePeakPerformanceCurve,
  computeSwimRacePredictions,
  computeRunningRacePredictions,
  computeUnifiedDisciplinePercentiles,
  computeRaceWeaknessAnalysis,
  ATHLETE_BENCHMARK_SESSIONS,
  BikeCourseElevationProfile,
  RunCourseWeatherProfile,
  TriathlonEventDistance,
  formatDurationHMS,
  formatPaceKm,
  formatSwimPace,
  formatSwimPaceYards,
  formatPaceMiles,
} from '../utils/performanceEngine';

import type { ProfileTab } from './AthleteProfileModal';
import { StravaActivityModal } from './StravaActivityModal';

interface PerformanceTabProps {
  activities: StravaActivity[];
  activityDetails?: Record<string, StravaActivityDetailsRecord>;
  athleteProfile?: AthleteProfile;
  goals?: TrainingGoal[];
  theme?: 'dark' | 'light';
  stravaToken?: string | null;
  isGoogleConnected?: boolean;
  onConnectGoogle?: () => void;
  onActivityPublished?: (activityId: string) => void;
  onDeleteActivity?: (activityId: string | number) => void;
  onSelectActivity?: (activityId: string | number) => void;
  onOpenSettings?: (tab?: ProfileTab) => void;
  globalTriDistance?: TriathlonEventDistance;
  onChangeGlobalTriDistance?: (dist: TriathlonEventDistance) => void;
  globalBikeCourseProfile?: BikeCourseElevationProfile;
  onChangeGlobalBikeCourseProfile?: (course: BikeCourseElevationProfile) => void;
}

export const PerformanceTab: React.FC<PerformanceTabProps> = ({
  activities,
  activityDetails = {},
  athleteProfile,
  goals = [],
  theme = 'dark',
  stravaToken = null,
  isGoogleConnected = false,
  onConnectGoogle = () => {},
  onActivityPublished,
  onDeleteActivity,
  onSelectActivity,
  onOpenSettings,
  globalTriDistance,
  onChangeGlobalTriDistance,
  globalBikeCourseProfile,
  onChangeGlobalBikeCourseProfile,
}) => {
  const isLight = theme === 'light';

  // Navigation & Category Filters
  const [selectedSport, setSelectedSport] = useState<'all' | 'bike' | 'run' | 'swim'>('all');
  const [localTriDistance, setLocalTriDistance] = useState<TriathlonEventDistance>('middle_70_3');
  const selectedTriDistance = globalTriDistance ?? localTriDistance;
  const setSelectedTriDistance = (dist: TriathlonEventDistance) => {
    setLocalTriDistance(dist);
    onChangeGlobalTriDistance?.(dist);
  };

  const [curveMetric, setCurveMetric] = useState<'bike' | 'run'>('bike');
  const [lookbackDays, setLookbackDays] = useState<number>(90);
  const [hoveredPeakIndex, setHoveredPeakIndex] = useState<number | null>(null);
  const [activeModalActivity, setActiveModalActivity] = useState<StravaActivity | null>(null);

  // Advanced Modeling Parameters
  const [localBikeElevationProfile, setLocalBikeElevationProfile] = useState<BikeCourseElevationProfile>('rolling_800m');
  const bikeElevationProfile = globalBikeCourseProfile ?? localBikeElevationProfile;
  const setBikeElevationProfile = (course: BikeCourseElevationProfile) => {
    setLocalBikeElevationProfile(course);
    onChangeGlobalBikeCourseProfile?.(course);
  };

  const [runCourseProfile, setRunCourseProfile] = useState<RunCourseWeatherProfile>('flat_optimal');
  const [riegelExponent, setRiegelExponent] = useState<number>(1.055);
  const [continuousOnlyFilter, setContinuousOnlyFilter] = useState<boolean>(false);

  // Compute Critical Parameters (FTP, CP, W', LT Pace, CS, D', CSS, 100m, 400m, 1000m, 1500m)
  const criticalParams = useMemo(() => {
    return computeCriticalParameters(athleteProfile, activities);
  }, [athleteProfile, activities]);

  // Compute 10-interval Peak Performance Curves (3m to 120m)
  const { bikePeaks, runPeaks } = useMemo(() => {
    return computePeakPerformanceCurve(
      activities,
      activityDetails,
      criticalParams,
      athleteProfile,
      lookbackDays,
      continuousOnlyFilter
    );
  }, [activities, activityDetails, criticalParams, athleteProfile, lookbackDays, continuousOnlyFilter]);

  // Compute Unified Discipline Ability Percentiles (M40-44 70.3 Finishers Reference Population)
  const unifiedPercentiles = useMemo(() => {
    return computeUnifiedDisciplinePercentiles(criticalParams, athleteProfile);
  }, [criticalParams, athleteProfile]);

  // Compute Swim Race Predictions with Confidence Tiers
  const swimPredictions = useMemo(() => {
    return computeSwimRacePredictions(criticalParams);
  }, [criticalParams]);

  // Compute Running Race Predictions anchored from LT Pace with Discordance checks
  const runPredictions = useMemo(() => {
    return computeRunningRacePredictions(criticalParams, activities, runCourseProfile, riegelExponent);
  }, [criticalParams, activities, runCourseProfile, riegelExponent]);

  // Compute Race-Specific Weakness & Time-Gain Potential vs Age-Grade Benchmarks
  const weaknessAnalysis = useMemo(() => {
    return computeRaceWeaknessAnalysis(
      'triathlon',
      selectedTriDistance,
      criticalParams,
      athleteProfile,
      bikeElevationProfile,
      runCourseProfile,
      riegelExponent,
      activities
    );
  }, [selectedTriDistance, criticalParams, athleteProfile, bikeElevationProfile, runCourseProfile, riegelExponent, activities]);

  // SVG Curve Dimensions (fits mobile natively without forced horizontal scroll)
  const svgWidth = 600;
  const svgHeight = 250;
  const padLeft = 56;
  const padRight = 16;
  const padTop = 22;
  const padBottom = 46;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;

  const activeCurvePeaks = curveMetric === 'bike' ? bikePeaks : runPeaks;

  // Dynamic Y-Axis Scale for Peak Performance Curve
  const curveScale = useMemo(() => {
    const vals = activeCurvePeaks.flatMap((p) =>
      [p.actualValue, p.modeledValue].filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
    );
    if (curveMetric === 'bike') {
      const cp = criticalParams.criticalPowerWatts || 280;
      const rawMin = vals.length > 0 ? Math.min(...vals, cp) : 200;
      const rawMax = vals.length > 0 ? Math.max(...vals, cp + 80) : 450;
      const minVal = Math.max(100, Math.floor((rawMin - 25) / 25) * 25);
      const maxVal = Math.ceil((rawMax + 25) / 25) * 25;
      return { minVal, maxVal: Math.max(minVal + 100, maxVal) };
    } else {
      const cs = criticalParams.criticalSpeedMps > 0 ? Math.round(1000 / criticalParams.criticalSpeedMps) : 235;
      const rawMin = vals.length > 0 ? Math.min(...vals, cs - 20) : 180;
      const rawMax = vals.length > 0 ? Math.max(...vals, cs + 25) : 290;
      const minVal = Math.max(140, Math.floor((rawMin - 10) / 10) * 10);
      const maxVal = Math.ceil((rawMax + 10) / 10) * 10;
      return { minVal, maxVal: Math.max(minVal + 50, maxVal) };
    }
  }, [activeCurvePeaks, curveMetric, criticalParams]);

  // Unified Global Goal Summary (Race, Date, Course)
  const activeGoalSummary = useMemo(() => {
    const todayIso = new Date().toISOString().split('T')[0];
    const upcoming = goals
      .filter((g) => g.status !== 'completed' && g.eventDate >= todayIso)
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    const triGoal = upcoming.find((g) => g.eventType === 'triathlon') || upcoming[0];
    const courseLabel =
      bikeElevationProfile === 'flat'
        ? 'Flat Course'
        : bikeElevationProfile === 'rolling_800m'
        ? '~800m Rolling Course'
        : 'Hilly (1500m+) Course';
    if (!triGoal) {
      return `${weaknessAnalysis.eventName} · 2027 Goal · ${courseLabel}`;
    }
    return `${triGoal.name} (${triGoal.eventDate}) · ${courseLabel}`;
  }, [goals, bikeElevationProfile, weaknessAnalysis.eventName]);

  const handleOpenPeakActivity = (activityId: string | number) => {
    onSelectActivity?.(activityId);
    const found = activities.find((a) => String(a.id) === String(activityId));
    if (found) {
      setActiveModalActivity(found);
    }
  };

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------- */}
      {/* 1. Unified Global Goal Header (Race, Date, Course)             */}
      {/* ------------------------------------------------------------- */}
      <div
        className={`rounded-2xl border p-4 sm:p-5 transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className={`text-lg sm:text-xl font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Performance &amp; Race Modeling Engine
                </h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border border-cyan-500/20">
                  {weaknessAnalysis.ageGroup} · {weaknessAnalysis.athleteWeightKg} kg
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-400 border border-amber-500/20 max-w-full truncate">
                  Global Goal: {activeGoalSummary}
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                FTP ({criticalParams.ftpWatts}W), LT Pace ({criticalParams.lactateThresholdPaceFormatted}), Pool CSS ({criticalParams.cssFormatted}), OW CSS ({criticalParams.owCssFormatted}) · Synchronized with Fitness tab goal race
              </p>
            </div>
          </div>

          {/* Discipline Category Switcher */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/40 border border-slate-800 text-xs font-bold self-start lg:self-auto overflow-x-auto">
            <button
              type="button"
              onClick={() => setSelectedSport('all')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
                selectedSport === 'all'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Triathlon
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedSport('run');
                setCurveMetric('run');
              }}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
                selectedSport === 'run'
                  ? 'bg-rose-500 text-white shadow-xs'
                  : isLight
                  ? 'text-rose-700 hover:text-rose-900'
                  : 'text-rose-400 hover:text-rose-300'
              }`}
            >
              Running (2027 Focus)
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedSport('bike');
                setCurveMetric('bike');
              }}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
                selectedSport === 'bike'
                  ? 'bg-orange-500 text-slate-950 shadow-xs'
                  : isLight
                  ? 'text-orange-700 hover:text-orange-900'
                  : 'text-orange-400 hover:text-orange-300'
              }`}
            >
              Cycling
            </button>
            <button
              type="button"
              onClick={() => setSelectedSport('swim')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
                selectedSport === 'swim'
                  ? 'bg-sky-500 text-slate-950 shadow-xs'
                  : isLight
                  ? 'text-sky-700 hover:text-sky-900'
                  : 'text-sky-400 hover:text-sky-300'
              }`}
            >
              Swimming
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. Race Weakness Analysis & Course Physics (Moved to Top!)     */}
      {/* ------------------------------------------------------------- */}
      {(selectedSport === 'all' || selectedSport === 'bike') && (
        <div
          className={`rounded-2xl border p-4 sm:p-5 transition-colors ${
            isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-amber-400" />
                <h2 className={`text-sm font-extrabold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Race Weakness &amp; Time-Gain Opportunities
                </h2>
              </div>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Comparing projected race splits against competitive Age-Group benchmarks (Top 20% in {weaknessAnalysis.ageGroup})
              </p>
            </div>

            {/* Global Event Distance Selector (Synchronized with Fitness Tab) */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/40 border border-slate-800 text-xs font-bold self-start md:self-auto overflow-x-auto">
              <button
                type="button"
                onClick={() => setSelectedTriDistance('sprint_400m')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0 ${
                  selectedTriDistance === 'sprint_400m' ? 'bg-indigo-600 text-white font-black' : 'text-slate-400 hover:text-white'
                }`}
              >
                Sprint (400m Pool)
              </button>
              <button
                type="button"
                onClick={() => setSelectedTriDistance('sprint')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0 ${
                  selectedTriDistance === 'sprint' ? 'bg-indigo-600 text-white font-black' : 'text-slate-400 hover:text-white'
                }`}
              >
                Sprint (750m O.W.)
              </button>
              <button
                type="button"
                onClick={() => setSelectedTriDistance('olympic')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0 ${
                  selectedTriDistance === 'olympic' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Olympic
              </button>
              <button
                type="button"
                onClick={() => setSelectedTriDistance('middle_70_3')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0 ${
                  selectedTriDistance === 'middle_70_3' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                70.3 (2027 Goal)
              </button>
              <button
                type="button"
                onClick={() => setSelectedTriDistance('ironman')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0 ${
                  selectedTriDistance === 'ironman' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Full IRONMAN
              </button>
            </div>
          </div>

          {/* Course Specifics Selector (Flatter vs 800m elevation) */}
          <div
            className={`p-3 rounded-xl mb-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isLight ? 'bg-amber-50/70 border-amber-200' : 'bg-amber-950/20 border-amber-800/40'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Mountain className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
              <div>
                <span className={`text-xs font-bold ${isLight ? 'text-amber-900' : 'text-amber-300'}`}>
                  Course Elevation Simulation:
                </span>
                <p className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                  Flatter course = higher bike speed for everyone, compressing bike time variance and shifting time-gain potential toward run durability.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto shrink-0">
              <button
                type="button"
                onClick={() => setBikeElevationProfile('flat')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  bikeElevationProfile === 'flat'
                    ? 'bg-amber-500 text-slate-950 shadow-xs font-extrabold'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                Dead Flat
              </button>
              <button
                type="button"
                onClick={() => setBikeElevationProfile('rolling_800m')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  bikeElevationProfile === 'rolling_800m'
                    ? 'bg-amber-500 text-slate-950 shadow-xs font-extrabold'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                ~800m Elev (2027 Goal)
              </button>
              <button
                type="button"
                onClick={() => setBikeElevationProfile('hilly')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  bikeElevationProfile === 'hilly'
                    ? 'bg-amber-500 text-slate-950 shadow-xs font-extrabold'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                Hilly (1500m+)
              </button>
            </div>
          </div>

          {/* Strategic Directive Banner */}
          <div
            className={`p-3.5 rounded-xl mb-4 border flex items-start gap-3 ${
              isLight ? 'bg-cyan-50 border-cyan-200' : 'bg-cyan-950/20 border-cyan-800/40'
            }`}
          >
            <Sparkles className="w-5 h-5 text-cyan-500 dark:text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <span className={`text-xs font-black uppercase tracking-wider ${isLight ? 'text-cyan-800' : 'text-cyan-300'}`}>
                Primary Opportunity: {weaknessAnalysis.primaryLimiterName}
              </span>
              <p className={`text-xs mt-0.5 leading-relaxed ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                {weaknessAnalysis.strategicDirective}
              </p>
            </div>
          </div>

          {/* 3 Discipline Opportunity Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {weaknessAnalysis.disciplines.map((d) => {
              const isPriority1 = d.opportunityRank === 1;
              return (
                <div
                  key={d.discipline}
                  className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
                    isPriority1
                      ? isLight
                        ? 'bg-amber-50/60 border-amber-300 ring-1 ring-amber-300/40'
                        : 'bg-amber-950/20 border-amber-500/40 ring-1 ring-amber-500/20'
                      : isLight
                      ? 'bg-slate-50/80 border-slate-200'
                      : 'bg-slate-950/40 border-slate-800/80'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        {d.discipline === 'bike' && <Zap className="w-4 h-4 text-orange-400" />}
                        {d.discipline === 'run' && <Footprints className="w-4 h-4 text-rose-400" />}
                        {d.discipline === 'swim' && <Waves className="w-4 h-4 text-sky-400" />}
                        <span className={`text-sm font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          {d.name}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                          isPriority1
                            ? 'bg-amber-500 text-slate-950 font-black'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        Priority #{d.opportunityRank}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 mb-3">{d.distanceLabel}</div>

                    <div className="grid grid-cols-2 gap-2 mb-3 p-2.5 rounded-lg bg-slate-900/40 border border-slate-800/50">
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">Projected Split</div>
                        <div className="text-sm font-extrabold text-white">{d.athleteTimeFormatted}</div>
                        <div className="text-[10px] text-slate-400">{d.currentPaceOrPower}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">Top 20% Benchmark</div>
                        <div className="text-sm font-extrabold text-cyan-400">{d.benchmarkTimeFormatted}</div>
                        <div className="text-[10px] text-slate-400">{d.targetPaceOrPower}</div>
                      </div>
                    </div>

                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-400">Potential Time Gain:</span>
                      <span className="text-sm font-black text-emerald-400">{d.timeGainFormatted}</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed pt-2 border-t border-slate-800/50 mt-2">
                    {d.coachingInsight}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. Unified Ability Percentile Meter (Single Reference Pop)    */}
      {/* ------------------------------------------------------------- */}
      <div
        className={`rounded-2xl border p-4 sm:p-5 transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-cyan-400" />
            <h2 className={`text-sm font-extrabold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Discipline Ability on Unified 0–100% Scale
            </h2>
          </div>
          <span className="text-[11px] font-semibold text-cyan-400">
            Reference Population: {unifiedPercentiles[0]?.referenceStandard || 'M40–44 70.3 Finishers'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {unifiedPercentiles.map((p) => {
            const isTop = p.percentile >= 80;
            return (
              <div
                key={p.discipline}
                className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                  isLight ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-400">{p.label}</span>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        isTop ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {p.tierLabel}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className={`text-xl font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      {p.percentile}th
                    </span>
                    <span className="text-xs font-semibold text-slate-400">percentile</span>
                    <span className="text-xs font-bold text-cyan-400 ml-auto">{p.athleteValue}</span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-2 rounded-full bg-slate-800/60 overflow-hidden mb-2">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        p.discipline === 'bike'
                          ? 'bg-gradient-to-r from-orange-500 to-amber-400'
                          : p.discipline === 'run'
                          ? 'bg-gradient-to-r from-rose-500 to-red-400'
                          : 'bg-gradient-to-r from-sky-500 to-cyan-400'
                      }`}
                      style={{ width: `${p.percentile}%` }}
                    />
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-slate-800/50 text-[11px] text-slate-400 leading-relaxed">
                  <div className="flex items-center justify-between font-semibold text-[10px] text-slate-500 mb-1">
                    <span>{p.timeSensitivity}</span>
                    <span>{p.referenceStandard}</span>
                  </div>
                  <p>{p.roiRecommendation}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. Running Race Pace Model Anchored from LT Pace (2027 Goals) */}
      {/* ------------------------------------------------------------- */}
      {(selectedSport === 'all' || selectedSport === 'run') && (
        <div
          className={`rounded-2xl border p-4 sm:p-5 transition-colors ${
            isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Footprints className="w-4 h-4 text-rose-400" />
                <h2 className={`text-sm font-extrabold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Running Race Pace Engine &amp; Confidence Tiers (2027 Targets)
                </h2>
              </div>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Anchored from LT pace ({criticalParams.lactateThresholdPaceFormatted}) · Cross-checked against HR regression &amp; durability
              </p>
            </div>

            {/* Course & Weather Adjustments */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setRunCourseProfile('flat_optimal')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  runCourseProfile === 'flat_optimal'
                    ? 'bg-emerald-500 text-slate-950 shadow-xs font-extrabold'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                Flat / Optimal
              </button>
              <button
                type="button"
                onClick={() => setRunCourseProfile('hilly_uk')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  runCourseProfile === 'hilly_uk'
                    ? 'bg-emerald-500 text-slate-950 shadow-xs font-extrabold'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                Hilly UK (+2.2%)
              </button>
            </div>
          </div>

          {/* Riegel Fatigue Exponent Controls */}
          <div
            className={`p-3 rounded-xl mb-4 border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-slate-800/80'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Flame className="w-4 h-4 text-rose-400 shrink-0" />
              <div>
                <span className="text-xs font-bold text-slate-300">Durability &amp; Riegel Decay Exponent (k):</span>
                <p className="text-[11px] text-slate-400">
                  {riegelExponent === 1.045
                    ? 'High Durability (k=1.045): <5% HR drift on 60–90m steady runs allows holding the upper pace fraction.'
                    : riegelExponent === 1.085
                    ? 'Fatigue Limiter (k=1.085): Calibrated to your marathon decay (shin/calf fatigue limiter).'
                    : 'Standard Trained Triathlete (k=1.055): Standard aerobic durability curve across 10K to Marathon.'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 self-start md:self-auto shrink-0">
              <button
                type="button"
                onClick={() => setRiegelExponent(1.045)}
                className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                  riegelExponent === 1.045 ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                High Durability (1.045)
              </button>
              <button
                type="button"
                onClick={() => setRiegelExponent(1.055)}
                className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                  riegelExponent === 1.055 ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Standard (1.055)
              </button>
              <button
                type="button"
                onClick={() => setRiegelExponent(1.085)}
                className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                  riegelExponent === 1.085 ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                London Decay (1.085)
              </button>
            </div>
          </div>

          {/* Running Predictions Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800/80">
            <table className="w-full text-left text-xs tabular-nums">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2 px-2 sm:py-2.5 sm:px-3">Race Distance</th>
                  <th className="py-2 px-2 sm:py-2.5 sm:px-3">% LT</th>
                  <th className="py-2 px-2 sm:py-2.5 sm:px-3">Target Pace</th>
                  <th className="py-2 px-2 sm:py-2.5 sm:px-3">Projected</th>
                  <th className="py-2 px-2 sm:py-2.5 sm:px-3">Logged Peak</th>
                  <th className="py-2 px-2 sm:py-2.5 sm:px-3">HR Check</th>
                  <th className="py-2 px-2 sm:py-2.5 sm:px-3">Confidence &amp; Upgrade Test</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {runPredictions.map((r) => {
                  const is10Miler = r.distanceId === 'ten_miler';
                  const isHM = r.distanceId === 'half_marathon';
                  const isGoalRace = is10Miler || isHM;
                  return (
                    <tr
                      key={r.distanceId}
                      className={`hover:bg-slate-800/30 transition-colors ${
                        isGoalRace ? (isLight ? 'bg-emerald-50/60 font-semibold' : 'bg-emerald-950/15 font-semibold') : ''
                      }`}
                    >
                      <td className="py-2.5 px-2 sm:py-3 sm:px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{r.name}</span>
                          {isGoalRace && (
                            <span
                              className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                                isLight
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              }`}
                            >
                              2027 Goal
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-cyan-400">
                        {r.ltSpeedPercentageUsed}% LT
                      </td>
                      <td className="py-3 px-3 font-mono text-white font-bold">
                        {r.predictedPaceFormatted}
                      </td>
                      <td className="py-3 px-3 font-mono text-emerald-400 font-extrabold text-sm">
                        {r.predictedTimeFormatted}
                      </td>
                      <td className="py-3 px-3 font-mono">
                        {r.loggedPeakTimeFormatted ? (
                          <div>
                            <span className={r.isDiscordant ? 'text-amber-400 line-through' : 'text-slate-300'}>
                              {r.loggedPeakTimeFormatted}
                            </span>
                            {r.isDiscordant && (
                              <span className="block text-[10px] text-amber-500 font-normal">
                                (Training run)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500">None logged</span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-300">
                        {r.hrRegressionPaceFormatted}
                        <span className="block text-[10px] text-slate-500 font-normal">
                          {r.hrRegressionConcordancePercent}% concordance
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            r.confidenceTier === 'Tested'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                              : r.confidenceTier === 'Extrapolated'
                              ? 'bg-sky-500/15 text-sky-400 border border-sky-500/20'
                              : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                          }`}
                        >
                          {r.confidenceTier === 'Tested' ? (
                            <CheckCircle2 className="w-3 h-3 shrink-0" />
                          ) : (
                            <AlertCircle className="w-3 h-3 shrink-0" />
                          )}
                          {r.confidenceTier}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-1 max-w-xs leading-normal">
                          {r.confidenceTier === 'Tested' ? r.upgradeTest : `Upgrade: ${r.upgradeTest}`}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 5. Structured Sessions & Interval Data Telemetry               */}
      {/* ------------------------------------------------------------- */}
      <div
        className={`rounded-2xl border p-4 sm:p-5 transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h2 className={`text-sm font-extrabold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Structured Benchmark Sessions (VO2 &amp; Threshold Intervals)
            </h2>
          </div>
          <span className="text-[11px] text-slate-400">
            Work interval paces extracted directly without rest-period distortion
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {ATHLETE_BENCHMARK_SESSIONS.map((s) => (
            <div
              key={s.id}
              className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span className="text-xs font-black text-white">{s.durationLabel}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      {s.boundTag}
                    </span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                      {s.sessionType === 'interval_reps' ? 'Interval Reps' : 'Continuous'}
                    </span>
                  </div>
                </div>
                <div className="text-xs font-semibold text-emerald-400 mb-1">{s.sessionDescription}</div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-lg font-black font-mono text-white">{s.repPaceFormatted}</span>
                  <span className="text-xs font-medium text-slate-400">({s.hrDescription})</span>
                </div>
              </div>
              <div className="text-[10px] text-slate-400 leading-relaxed pt-2 border-t border-slate-800/60">
                {s.notes}
              </div>
            </div>
          ))}
        </div>

        {/* Continuous vs Intermittent Filter Note */}
        <div
          className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="text-slate-300">
              <strong>Steady-State Filter:</strong> Excludes intermittent micro-intervals (e.g. 30s on / 30s off at 115% FTP) where high Variability Index (&gt;1.06) skews continuous 20m/30m threshold metrics.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setContinuousOnlyFilter((prev) => !prev)}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer shrink-0 self-start sm:self-auto ${
              continuousOnlyFilter
                ? 'bg-cyan-500 text-slate-950 font-black'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {continuousOnlyFilter ? 'Filtering: Continuous Steady Only' : 'Filter Continuous Steady'}
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 6. Swim Race Modeling & Confidence Breakdown                   */}
      {/* ------------------------------------------------------------- */}
      {(selectedSport === 'all' || selectedSport === 'swim') && (
        <div
          className={`rounded-2xl border p-4 sm:p-5 transition-colors ${
            isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Waves className="w-4 h-4 text-sky-400" />
                <h2 className={`text-sm font-extrabold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Swim Distance Predictions &amp; Confidence Tiers
                </h2>
              </div>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {swimPredictions.swimDataSummary}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-400">Pool CSS:</span>
                <span className="text-xs font-mono font-black text-sky-400 px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20">
                  {swimPredictions.cssBasisPaceFormatted}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-400">OW CSS:</span>
                <span className="text-xs font-mono font-black text-sky-300 px-2 py-0.5 rounded bg-sky-500/15 border border-sky-400/30">
                  {swimPredictions.owCssBasisPaceFormatted}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 mb-4">
            {swimPredictions.races.map((r) => {
              const isTested = r.confidenceTier === 'Tested';
              const isExtrap = r.confidenceTier === 'Extrapolated';
              return (
                <div
                  key={r.distanceId}
                  className={`p-4 rounded-xl border flex flex-col justify-between ${
                    isLight ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-950/40 border-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className="text-xs font-bold text-slate-400">{r.name}</span>
                      <span
                        className={`text-[9px] font-black px-2 py-0.5 rounded-full shrink-0 ${
                          isTested
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                            : isExtrap
                            ? 'bg-sky-500/15 text-sky-400 border border-sky-500/20'
                            : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                        }`}
                      >
                        {r.confidenceTier}
                      </span>
                    </div>

                    <div className="text-xl font-black font-mono text-white mb-1">
                      {r.predictedTimeFormatted}
                    </div>
                    <div className="text-xs font-mono text-sky-500 dark:text-sky-400 font-bold mb-3 tabular-nums">
                      {r.pacePer100mFormatted}
                    </div>

                    <div className="text-[10px] text-slate-400 leading-tight mb-2">
                      <strong className="text-slate-300">Model Basis:</strong> {r.modelingBasis}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/60 mt-2 text-[10px] text-slate-400 space-y-1">
                    <p className="text-sky-400 font-semibold">
                      {isTested ? r.upgradeTest : `Upgrade: ${r.upgradeTest}`}
                    </p>
                    <p className="leading-relaxed">{r.confidenceExplanation}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Swim Test Guidance Note */}
          <div
            className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
              isLight ? 'bg-sky-50 border-sky-200 text-sky-900' : 'bg-sky-950/20 border-sky-800/40 text-sky-300'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Dual CSS Architecture (Pool vs Open Water):</strong> Pool Sprint (400m) and Pool Swim sTSS use your <strong>Regular Pool CSS ({swimPredictions.cssBasisPaceFormatted})</strong> derived from your 400m ({swimPredictions.swim400mFormatted}) &amp; 100m ({swimPredictions.swim100mFormatted}) time trials. All Open Water races (750m, 1,500m, 70.3, and Ironman ~70m) and Outdoor Swim sTSS use your <strong>Open Water CSS ({swimPredictions.owCssBasisPaceFormatted})</strong>.
            </p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 7. Peak Performance Duration Curves (3m to 120m)               */}
      {/* ------------------------------------------------------------- */}
      <div
        className={`rounded-2xl border p-4 sm:p-5 transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-cyan-400" />
              <h2 className={`text-sm font-extrabold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Peak Performance Curves across 10 Durations (3m to 120m)
              </h2>
            </div>
            <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Observed maximums vs hyperbolic Critical Power (CP + W&apos;/t) and Critical Speed (CS + D&apos;/t) models · Stream &amp; HR plausibility checked
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {/* Metric Switcher */}
            <div className="flex items-center p-0.5 rounded-lg bg-slate-950/40 border border-slate-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => setCurveMetric('bike')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  curveMetric === 'bike' ? 'bg-orange-500 text-slate-950' : 'text-orange-400 hover:text-orange-300'
                }`}
              >
                Bike (Watts)
              </button>
              <button
                type="button"
                onClick={() => setCurveMetric('run')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  curveMetric === 'run' ? 'bg-rose-500 text-white' : 'text-rose-400 hover:text-rose-300'
                }`}
              >
                Run (Pace /km)
              </button>
            </div>

            {/* Lookback Selector: Default 90d, 365d as Best of Year */}
            <div className="flex items-center p-0.5 rounded-lg bg-slate-950/40 border border-slate-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => setLookbackDays(90)}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  lookbackDays === 90
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                90d
              </button>
              <button
                type="button"
                onClick={() => setLookbackDays(365)}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  lookbackDays === 365
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                365d (Best of Year)
              </button>
            </div>
          </div>
        </div>

        {/* Selected / Tapped Interval Inspection Strip */}
        {hoveredPeakIndex !== null && activeCurvePeaks[hoveredPeakIndex] && (() => {
          const sel = activeCurvePeaks[hoveredPeakIndex];
          return (
            <div
              className={`mb-3 px-3 py-2 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-950/60 border-slate-800 text-slate-200'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 tabular-nums">
                <span className="font-black">{sel.durationLabel}:</span>
                <span className="font-mono font-black text-cyan-500 dark:text-cyan-400">{sel.formattedValue}</span>
                {sel.secondaryFormatted && (
                  <span className="font-mono text-slate-500">({sel.secondaryFormatted})</span>
                )}
                <span className="text-slate-400">·</span>
                <span className="font-mono text-slate-500">Model {sel.modeledFormatted}</span>
                <span className="text-slate-400">·</span>
                <span className="font-semibold text-emerald-400">{sel.confidenceTier}</span>
              </div>
              {sel.activityId && (
                <button
                  type="button"
                  onClick={() => handleOpenPeakActivity(sel.activityId!)}
                  className="text-[11px] font-bold text-cyan-500 hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  <span className="truncate max-w-[180px]">{sel.activityName || 'Open Activity'}</span>
                  <ArrowUpRight className="w-3 h-3 shrink-0" />
                </button>
              )}
            </div>
          );
        })()}

        {/* SVG Interactive Curve with Labeled X and Y Axes */}
        <div className="relative w-full pb-1">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-auto select-none overflow-visible"
          >
            {/* Y-Axis Title */}
            <text
              x={14}
              y={padTop + plotHeight / 2}
              transform={`rotate(-90, 14, ${padTop + plotHeight / 2})`}
              textAnchor="middle"
              fill={isLight ? '#475569' : '#94a3b8'}
              fontSize="10"
              fontWeight="bold"
            >
              {curveMetric === 'bike' ? 'Power (W)' : 'Pace (min/km)'}
            </text>

            {/* X-Axis Title */}
            <text
              x={padLeft + plotWidth / 2}
              y={svgHeight - 4}
              textAnchor="middle"
              fill={isLight ? '#475569' : '#94a3b8'}
              fontSize="10"
              fontWeight="bold"
            >
              Duration (minutes)
            </text>

            {/* Background Grid */}
            <rect x={padLeft} y={padTop} width={plotWidth} height={plotHeight} fill="transparent" />

            {/* Horizontal Grid Lines & Dynamic Y-Axis Labels */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
              const y = padTop + plotHeight * ratio;
              const labelVal =
                curveMetric === 'bike'
                  ? `${Math.round(curveScale.maxVal - ratio * (curveScale.maxVal - curveScale.minVal))}W`
                  : formatPaceKm(Math.round(curveScale.minVal + ratio * (curveScale.maxVal - curveScale.minVal)));
              return (
                <g key={idx}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={padLeft + plotWidth}
                    y2={y}
                    stroke={isLight ? '#e2e8f0' : '#1e293b'}
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                  <text
                    x={padLeft - 6}
                    y={y + 3.5}
                    textAnchor="end"
                    fill={isLight ? '#64748b' : '#94a3b8'}
                    fontSize="9.5"
                    fontFamily="monospace"
                  >
                    {labelVal}
                  </text>
                </g>
              );
            })}

            {/* Asymptotic Threshold Guideline (CP or CS) */}
            {(() => {
              const cpOrCsVal =
                curveMetric === 'bike'
                  ? criticalParams.criticalPowerWatts
                  : criticalParams.criticalSpeedMps > 0
                  ? Math.round(1000 / criticalParams.criticalSpeedMps)
                  : 235;
              const norm =
                curveMetric === 'bike'
                  ? (cpOrCsVal - curveScale.minVal) / (curveScale.maxVal - curveScale.minVal)
                  : 1 - (cpOrCsVal - curveScale.minVal) / (curveScale.maxVal - curveScale.minVal);
              const thresholdY = padTop + (1 - Math.max(0.05, Math.min(0.95, norm))) * plotHeight;
              return (
                <g>
                  <line
                    x1={padLeft}
                    y1={thresholdY}
                    x2={padLeft + plotWidth}
                    y2={thresholdY}
                    stroke={curveMetric === 'bike' ? '#f97316' : '#10b981'}
                    strokeDasharray="6 3"
                    strokeWidth="1.5"
                    strokeOpacity="0.75"
                  />
                  <text
                    x={padLeft + plotWidth - 4}
                    y={thresholdY - 5}
                    textAnchor="end"
                    fill={curveMetric === 'bike' ? '#ea580c' : '#059669'}
                    fontSize="10"
                    fontWeight="bold"
                  >
                    {curveMetric === 'bike'
                      ? `CP: ${criticalParams.criticalPowerWatts}W`
                      : `CS: ${criticalParams.criticalSpeedPaceFormatted}`}
                  </text>
                </g>
              );
            })()}

            {/* Modeled Hyperbolic Line */}
            {(() => {
              const points = activeCurvePeaks.map((p, idx) => {
                const x = padLeft + (idx / (activeCurvePeaks.length - 1)) * plotWidth;
                const val = p.modeledValue ?? p.actualValue;
                const norm =
                  curveMetric === 'bike'
                    ? (val - curveScale.minVal) / (curveScale.maxVal - curveScale.minVal)
                    : 1 - (val - curveScale.minVal) / (curveScale.maxVal - curveScale.minVal);
                const y = padTop + (1 - Math.max(0, Math.min(1, norm))) * plotHeight;
                return { x, y };
              });

              const pathD = points.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`, '');

              return (
                <path
                  d={pathD}
                  fill="none"
                  stroke={curveMetric === 'bike' ? '#ea580c' : '#059669'}
                  strokeWidth="2.5"
                  strokeOpacity="0.85"
                />
              );
            })()}

            {/* Observed Data Points and Touch/Hover Triggers */}
            {activeCurvePeaks.map((p, idx) => {
              const x = padLeft + (idx / (activeCurvePeaks.length - 1)) * plotWidth;
              const norm =
                curveMetric === 'bike'
                  ? (p.actualValue - curveScale.minVal) / (curveScale.maxVal - curveScale.minVal)
                  : 1 - (p.actualValue - curveScale.minVal) / (curveScale.maxVal - curveScale.minVal);
              const y = padTop + (1 - Math.max(0, Math.min(1, norm))) * plotHeight;
              const isHovered = hoveredPeakIndex === idx;
              const compactLabel = `${p.durationMin}m`;

              return (
                <g
                  key={idx}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredPeakIndex(idx)}
                  onMouseLeave={() => setHoveredPeakIndex(null)}
                  onClick={() => setHoveredPeakIndex((prev) => (prev === idx ? null : idx))}
                >
                  {/* Wide Touch Hit Target Column */}
                  <rect
                    x={x - plotWidth / 20}
                    y={padTop}
                    width={plotWidth / 10}
                    height={plotHeight + 24}
                    fill="transparent"
                  />

                  {/* Vertical Guide */}
                  <line
                    x1={x}
                    y1={padTop}
                    x2={x}
                    y2={padTop + plotHeight}
                    stroke={isHovered ? (curveMetric === 'bike' ? '#f97316' : '#10b981') : isLight ? '#f1f5f9' : '#1e293b'}
                    strokeWidth={isHovered ? '1.5' : '1'}
                    strokeOpacity={isHovered ? '0.6' : '1'}
                  />

                  {/* Circle Dot */}
                  <circle
                    cx={x}
                    cy={y}
                    r={isHovered ? 7 : 5}
                    fill={curveMetric === 'bike' ? '#f97316' : '#10b981'}
                    stroke={isLight ? '#ffffff' : '#0f172a'}
                    strokeWidth="2"
                    className="transition-all"
                  />

                  {/* X-Axis Duration Label */}
                  <text
                    x={x}
                    y={padTop + plotHeight + 17}
                    textAnchor="middle"
                    fill={isHovered ? (isLight ? '#0f172a' : '#ffffff') : '#64748b'}
                    fontSize="10.5"
                    fontFamily="monospace"
                    fontWeight={isHovered ? 'bold' : 'normal'}
                  >
                    {compactLabel}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Duration Breakdown Table (Unclipped column headers, one consistent unit, Tested/Extrapolated/Guess tiers) */}
        <div className="overflow-x-auto rounded-xl border border-slate-800/80 mt-3">
          <table className="w-full text-left text-[11px] sm:text-xs tabular-nums">
            <thead className="bg-slate-950/60 text-slate-400 uppercase text-[9px] sm:text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-2 px-2 sm:py-2.5 sm:px-3 whitespace-nowrap">Interval</th>
                <th className="py-2 px-2 sm:py-2.5 sm:px-3 whitespace-nowrap">
                  {curveMetric === 'bike' ? 'Peak Watts' : 'Peak Pace (/km)'}
                </th>
                <th className="py-2 px-2 sm:py-2.5 sm:px-3 whitespace-nowrap">
                  {curveMetric === 'bike' ? 'W/kg' : 'Speed (km/h)'}
                </th>
                <th className="py-2 px-2 sm:py-2.5 sm:px-3 whitespace-nowrap">Model</th>
                <th className="py-2 px-2 sm:py-2.5 sm:px-3 whitespace-nowrap">Effort Source</th>
                <th className="py-2 px-2 sm:py-2.5 sm:px-3 whitespace-nowrap">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {activeCurvePeaks.map((p, idx) => (
                <tr
                  key={idx}
                  onClick={() => p.activityId && handleOpenPeakActivity(p.activityId)}
                  className={`hover:bg-slate-800/30 transition-colors ${
                    p.activityId ? 'cursor-pointer' : ''
                  } ${hoveredPeakIndex === idx ? 'bg-cyan-500/10' : ''}`}
                  onMouseEnter={() => setHoveredPeakIndex(idx)}
                  onMouseLeave={() => setHoveredPeakIndex(null)}
                >
                  <td className="py-2 px-2 sm:py-2.5 sm:px-3 font-bold text-white whitespace-nowrap">
                    {p.durationLabel}
                  </td>
                  <td className="py-2 px-2 sm:py-2.5 sm:px-3 font-mono font-black text-cyan-500 dark:text-cyan-400 text-xs sm:text-sm whitespace-nowrap">
                    {p.formattedValue}
                  </td>
                  <td className="py-2 px-2 sm:py-2.5 sm:px-3 font-mono text-slate-300 whitespace-nowrap">
                    {p.secondaryFormatted || '--'}
                  </td>
                  <td className="py-2 px-2 sm:py-2.5 sm:px-3 font-mono text-slate-400 whitespace-nowrap">
                    {p.modeledFormatted}
                  </td>
                  <td className="py-2 px-2 sm:py-2.5 sm:px-3">
                    <div className="flex flex-col items-start gap-0.5">
                      <span
                        className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full whitespace-nowrap ${
                          p.effortType === 'continuous_steady'
                            ? isLight
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-emerald-500/15 text-emerald-400'
                            : p.effortType === 'interval_session'
                            ? isLight
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-amber-500/15 text-amber-400'
                            : isLight
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-indigo-500/15 text-indigo-400'
                        }`}
                      >
                        {p.effortType === 'continuous_steady'
                          ? 'Continuous Steady'
                          : p.effortType === 'interval_session'
                          ? 'Interval Rep (Lower bound)'
                          : 'Model Baseline'}
                      </span>
                      {p.activityName && (
                        <span
                          className="text-[10px] text-slate-500 truncate max-w-[160px]"
                          title={`${p.activityName}${p.activityDate ? ` (${p.activityDate})` : ''}`}
                        >
                          {p.activityName}{p.activityDate ? ` · ${p.activityDate}` : ''}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-2 sm:py-2.5 sm:px-3 whitespace-nowrap">
                    <span
                      className={`inline-block text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        p.confidenceTier === 'Tested'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                          : p.confidenceTier === 'Extrapolated'
                          ? 'bg-sky-500/15 text-sky-400 border border-sky-500/20'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                      }`}
                      title={p.upgradeTest}
                    >
                      {p.confidenceTier}
                    </span>
                    <span className="hidden md:block text-[10px] text-slate-500 mt-0.5 truncate max-w-[200px]">
                      {p.upgradeTest}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Modal when inspecting a Peak Performance activity */}
      {activeModalActivity && athleteProfile && (
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
