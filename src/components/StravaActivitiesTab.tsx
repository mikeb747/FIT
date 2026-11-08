import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  RotateCw,
  Dumbbell,
  Bike,
  Footprints,
  Waves,
  Activity,
  Clock,
  MapPin,
  Heart,
  ThumbsUp,
  AlertCircle,
  Sparkles,
  Check,
  ChevronRight,
  Loader2,
  Zap,
  FileSpreadsheet,
  Infinity as InfinityIcon,
  Search,
  Filter,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  X,
  Gauge,
  TrendingUp,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { StravaIcon } from './StravaIcon';
import type {
  StravaActivity,
  StravaActivityDetailsRecord,
  ActivityCategory,
  ActivityFilterCategory,
} from '../utils/stravaActivities';
import {
  classifyActivity,
  formatSportMetrics,
  isActivityNew,
  calculateActivityTSS,
  calculateNormalizedPower,
  getLongestLapDistanceM,
} from '../utils/stravaActivities';
import { applyRenameRulesToName } from '../utils/activityRenameRules';
import type { AthleteProfile } from '../types/athlete';
import { StravaActivityModal } from './StravaActivityModal';
import { MuteBadgeIcon } from './MuteBadgeIcon';
import { PWAInstallButton } from './PWAInstallButton';
import { batchBackupActivitiesToGoogleSheet } from '../utils/googleSheets';
import { isDemoModeActive } from '../utils/demoData';

export type ActivitySortMetric =
  | 'date'
  | 'duration'
  | 'distance'
  | 'longest_lap'
  | 'tss'
  | 'pace'
  | 'elevation'
  | 'avg_hr'
  | 'max_hr'
  | 'avg_power'
  | 'normalized_power'
  | 'max_power';

export type ActivitySortDirection = 'asc' | 'desc';

interface SortOptionDef {
  id: ActivitySortMetric;
  label: string;
  icon: (className?: string) => React.ReactNode;
  descHelper: string;
  ascHelper: string;
}

const SORT_OPTIONS: SortOptionDef[] = [
  {
    id: 'duration',
    label: 'Duration',
    icon: (c = 'w-4 h-4 text-sky-400') => <Clock className={c} />,
    descHelper: 'Longest first',
    ascHelper: 'Shortest first',
  },
  {
    id: 'distance',
    label: 'Distance',
    icon: (c = 'w-4 h-4 text-emerald-400') => <MapPin className={c} />,
    descHelper: 'Furthest first',
    ascHelper: 'Shortest distance first',
  },
  {
    id: 'longest_lap',
    label: 'Longest Lap',
    icon: (c = 'w-4 h-4 text-cyan-400') => <Waves className={c} />,
    descHelper: 'Longest single lap first',
    ascHelper: 'Shortest lap first',
  },
  {
    id: 'tss',
    label: 'TSS (Training Stress)',
    icon: (c = 'w-4 h-4 text-amber-400') => <Zap className={c} />,
    descHelper: 'Highest TSS first',
    ascHelper: 'Lowest TSS first',
  },
  {
    id: 'pace',
    label: 'Speed / Pace (Fastest)',
    icon: (c = 'w-4 h-4 text-teal-400') => <Gauge className={c} />,
    descHelper: 'Fastest speed / pace first',
    ascHelper: 'Slowest speed / pace first',
  },
  {
    id: 'elevation',
    label: 'Elevation Gain',
    icon: (c = 'w-4 h-4 text-indigo-400') => <TrendingUp className={c} />,
    descHelper: 'Most elevation first',
    ascHelper: 'Least elevation first',
  },
  {
    id: 'avg_hr',
    label: 'Average HR',
    icon: (c = 'w-4 h-4 text-rose-400') => <Heart className={c} />,
    descHelper: 'Highest HR first',
    ascHelper: 'Lowest HR first',
  },
  {
    id: 'max_hr',
    label: 'Max HR',
    icon: (c = 'w-4 h-4 text-red-500') => <Heart className={c} />,
    descHelper: 'Highest max HR first',
    ascHelper: 'Lowest max HR first',
  },
  {
    id: 'avg_power',
    label: 'Average Power',
    icon: (c = 'w-4 h-4 text-purple-400') => <Zap className={c} />,
    descHelper: 'Highest average watts',
    ascHelper: 'Lowest average watts',
  },
  {
    id: 'normalized_power',
    label: 'Normalized Power (NP)',
    icon: (c = 'w-4 h-4 text-violet-400') => <Zap className={c} />,
    descHelper: 'Highest NP first',
    ascHelper: 'Lowest NP first',
  },
  {
    id: 'max_power',
    label: 'Max Power',
    icon: (c = 'w-4 h-4 text-amber-500') => <Zap className={c} />,
    descHelper: 'Highest max watts',
    ascHelper: 'Lowest max watts',
  },
];

function getActivitySortValue(
  act: StravaActivity,
  details: StravaActivityDetailsRecord | undefined,
  metric: ActivitySortMetric,
  athleteProfile: AthleteProfile
): number {
  switch (metric) {
    case 'duration':
      return details?.calibration?.calibratedMovingTimeSec ?? act.moving_time ?? act.elapsed_time ?? 0;
    case 'distance':
      return details?.calibration?.calibratedDistanceM ?? act.distance ?? 0;
    case 'longest_lap':
      return getLongestLapDistanceM(act, details);
    case 'tss':
      return details?.calibration?.manualTss ?? calculateActivityTSS(act, details, athleteProfile)?.tss ?? 0;
    case 'pace': {
      if (act.average_speed && act.average_speed > 0) return act.average_speed;
      const dur = details?.calibration?.calibratedMovingTimeSec ?? act.moving_time ?? act.elapsed_time ?? 0;
      const dist = details?.calibration?.calibratedDistanceM ?? act.distance ?? 0;
      if (dist > 0 && dur > 0) return dist / dur;
      return 0;
    }
    case 'elevation':
      return act.total_elevation_gain ?? (details?.activity as any)?.total_elevation_gain ?? 0;
    case 'avg_hr':
      return details?.calibration?.calibratedAvgHeartRate ?? act.average_heartrate ?? (details?.activity as any)?.average_heartrate ?? 0;
    case 'max_hr':
      return details?.calibration?.calibratedMaxHeartRate ?? act.max_heartrate ?? (details?.activity as any)?.max_heartrate ?? 0;
    case 'avg_power':
      return details?.calibration?.calibratedAvgWatts ?? act.average_watts ?? (details?.activity as any)?.average_watts ?? 0;
    case 'normalized_power':
      return (
        details?.calibration?.calibratedNormalizedPower ??
        calculateNormalizedPower(act, details) ??
        act.weighted_average_watts ??
        (details?.activity as any)?.weighted_average_watts ??
        (act.average_watts ? Math.round(act.average_watts * 1.05) : 0)
      );
    case 'max_power':
      return act.max_watts ?? (details?.activity as any)?.max_watts ?? 0;
    case 'date':
    default:
      return new Date(act.start_date).getTime();
  }
}

interface StravaActivitiesTabProps {
  stravaToken: string | null;
  athleteName: string | null;
  activities: StravaActivity[];
  activityDetails: Record<string, StravaActivityDetailsRecord>;
  athleteProfile: AthleteProfile;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  isGoogleConnected: boolean;
  googleUserEmail?: string | null;
  googleSheetUrl?: string | null;
  theme?: 'dark' | 'light';
  onRefresh: () => void;
  onLoadMore: () => void;
  onConnectGoogle: () => void;
  onDisconnectGoogle: () => void;
  onOpenStravaSettings: () => void;
  onActivityPublished: (activityId: string) => void;
  onOpenAthleteProfile?: () => void;
  onDeleteActivity?: (activityId: string | number) => void;
  onRenameActivity?: (activityId: string | number, newName: string) => void;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs > 0 ? `${secs}s` : ''}`.trim();
  return `${secs}s`;
}

function formatActivityDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

function getCategoryIcon(category: ActivityCategory, className = 'w-5 h-5', isLight = false) {
  switch (category) {
    case 'Swim':
      return <Waves className={`${className} ${isLight ? 'text-sky-600' : 'text-sky-400'}`} />;
    case 'Bike':
      return <Bike className={`${className} ${isLight ? 'text-amber-600' : 'text-orange-400'}`} />;
    case 'Run':
      return <Footprints className={`${className} ${isLight ? 'text-amber-700' : 'text-amber-400'}`} />;
    case 'Gym':
      return <Dumbbell className={`${className} ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />;
    default:
      return <Activity className={`${className} ${isLight ? 'text-purple-600' : 'text-purple-400'}`} />;
  }
}

export const StravaActivitiesTab: React.FC<StravaActivitiesTabProps> = ({
  stravaToken,
  athleteName,
  activities,
  activityDetails,
  athleteProfile,
  loading,
  loadingMore,
  hasMore,
  error,
  isGoogleConnected,
  googleUserEmail,
  googleSheetUrl,
  theme = 'dark',
  onRefresh,
  onLoadMore,
  onConnectGoogle,
  onDisconnectGoogle,
  onOpenStravaSettings,
  onActivityPublished,
  onOpenAthleteProfile,
  onDeleteActivity,
  onRenameActivity,
}) => {
  const isLight = theme === 'light';
  const [selectedCategory, setSelectedCategory] = useState<ActivityFilterCategory>('All');
  const [activeModalActivity, setActiveModalActivity] = useState<StravaActivity | null>(null);

  // Floating Search & Filter / Sort States
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [sortMetric, setSortMetric] = useState<ActivitySortMetric>('date');
  const [sortDirection, setSortDirection] = useState<ActivitySortDirection>('desc');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterModalTab, setFilterModalTab] = useState<'filter' | 'sort'>('filter');

  // Multi-Metric Filter States
  const [minDistanceKm, setMinDistanceKm] = useState<number | null>(null);
  const [maxDistanceKm, setMaxDistanceKm] = useState<number | null>(null);
  const [minLongestLapM, setMinLongestLapM] = useState<number | null>(null);
  const [minAvgWatts, setMinAvgWatts] = useState<number | null>(null);
  const [minElevationM, setMinElevationM] = useState<number | null>(null);
  const [minDurationMinutes, setMinDurationMinutes] = useState<number | null>(null);
  const [minTss, setMinTss] = useState<number | null>(null);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const filterContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when popover opens
  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

  // Click outside and Escape key handler for floating popovers
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (isSearchOpen && searchContainerRef.current && !searchContainerRef.current.contains(target)) {
        setIsSearchOpen(false);
      }
      if (isFilterOpen && filterContainerRef.current && !filterContainerRef.current.contains(target)) {
        setIsFilterOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSearchOpen, isFilterOpen]);

  const searchQueryTrimmed = searchQuery.trim().toLowerCase();

  // Multi-Metric Filter & Sort
  const filteredAndSortedActivities = useMemo(() => {
    let list = activities.filter((act) => !act.isDeleted);

    // 1. Filter by selected category: All, Swim, Bike, Run, Gym
    if (selectedCategory !== 'All') {
      list = list.filter((act) => classifyActivity(act).category === selectedCategory);
    }

    // 2. Filter by search query (activity name or description)
    if (searchQueryTrimmed) {
      list = list.filter((act) => {
        const details = activityDetails[String(act.id)];
        const rawName = (act.name || '').toLowerCase();
        const renamedName = applyRenameRulesToName(act.name).newName.toLowerCase();
        const desc = (
          act.description ||
          (details?.activity?.description as string) ||
          (details?.activity?.notes as string) ||
          ''
        ).toLowerCase();
        const subType = classifyActivity(act).subType.toLowerCase();

        return (
          rawName.includes(searchQueryTrimmed) ||
          renamedName.includes(searchQueryTrimmed) ||
          desc.includes(searchQueryTrimmed) ||
          subType.includes(searchQueryTrimmed)
        );
      });
    }

    // 3. Filter by minimum distance (km)
    if (minDistanceKm !== null && minDistanceKm > 0) {
      const minMeters = minDistanceKm * 1000;
      list = list.filter((act) => {
        const dist = activityDetails[String(act.id)]?.calibration?.calibratedDistanceM ?? act.distance ?? 0;
        return dist >= minMeters;
      });
    }

    // 4. Filter by maximum distance (km)
    if (maxDistanceKm !== null && maxDistanceKm > 0) {
      const maxMeters = maxDistanceKm * 1000;
      list = list.filter((act) => {
        const dist = activityDetails[String(act.id)]?.calibration?.calibratedDistanceM ?? act.distance ?? 0;
        return dist <= maxMeters;
      });
    }

    // 4b. Filter by minimum longest lap distance (meters)
    if (minLongestLapM !== null && minLongestLapM > 0) {
      list = list.filter((act) => {
        const details = activityDetails[String(act.id)];
        const longestLap = getLongestLapDistanceM(act, details);
        return longestLap >= minLongestLapM;
      });
    }

    // 5. Filter by minimum average power (Watts)
    if (minAvgWatts !== null && minAvgWatts > 0) {
      list = list.filter((act) => {
        const details = activityDetails[String(act.id)];
        const watts = details?.calibration?.calibratedAvgWatts ?? act.average_watts ?? (details?.activity as any)?.average_watts ?? 0;
        return watts >= minAvgWatts;
      });
    }

    // 6. Filter by minimum elevation gain (meters)
    if (minElevationM !== null && minElevationM > 0) {
      list = list.filter((act) => {
        const details = activityDetails[String(act.id)];
        const elev = act.total_elevation_gain ?? (details?.activity as any)?.total_elevation_gain ?? 0;
        return elev >= minElevationM;
      });
    }

    // 7. Filter by minimum duration (minutes)
    if (minDurationMinutes !== null && minDurationMinutes > 0) {
      const minSec = minDurationMinutes * 60;
      list = list.filter((act) => {
        const details = activityDetails[String(act.id)];
        const dur = details?.calibration?.calibratedMovingTimeSec ?? act.moving_time ?? act.elapsed_time ?? 0;
        return dur >= minSec;
      });
    }

    // 8. Filter by minimum TSS
    if (minTss !== null && minTss > 0) {
      list = list.filter((act) => {
        const details = activityDetails[String(act.id)];
        const tss = details?.calibration?.manualTss ?? calculateActivityTSS(act, details, athleteProfile)?.tss ?? 0;
        return tss >= minTss;
      });
    }

    // 9. Sort by requested metric
    if (sortMetric === 'date') {
      if (sortDirection === 'asc') {
        return [...list].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
      }
      return [...list].sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
    }

    return [...list].sort((a, b) => {
      const valA = getActivitySortValue(a, activityDetails[String(a.id)], sortMetric, athleteProfile);
      const valB = getActivitySortValue(b, activityDetails[String(b.id)], sortMetric, athleteProfile);
      const diff = sortDirection === 'desc' ? valB - valA : valA - valB;
      if (diff !== 0) return diff;
      return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
    });
  }, [
    activities,
    selectedCategory,
    searchQueryTrimmed,
    minDistanceKm,
    maxDistanceKm,
    minLongestLapM,
    minAvgWatts,
    minElevationM,
    minDurationMinutes,
    minTss,
    sortMetric,
    sortDirection,
    activityDetails,
    athleteProfile,
  ]);

  // Active filter counters & helpers
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== 'All') count++;
    if (minDistanceKm !== null && minDistanceKm > 0) count++;
    if (maxDistanceKm !== null && maxDistanceKm > 0) count++;
    if (minLongestLapM !== null && minLongestLapM > 0) count++;
    if (minAvgWatts !== null && minAvgWatts > 0) count++;
    if (minElevationM !== null && minElevationM > 0) count++;
    if (minDurationMinutes !== null && minDurationMinutes > 0) count++;
    if (minTss !== null && minTss > 0) count++;
    return count;
  }, [
    selectedCategory,
    minDistanceKm,
    maxDistanceKm,
    minLongestLapM,
    minAvgWatts,
    minElevationM,
    minDurationMinutes,
    minTss,
  ]);

  const hasActiveSort = sortMetric !== 'date' || sortDirection !== 'desc';
  const totalActiveFilterAndSortCount = activeFilterCount + (hasActiveSort ? 1 : 0);

  const resetAllFiltersAndSort = () => {
    setSelectedCategory('All');
    setMinDistanceKm(null);
    setMaxDistanceKm(null);
    setMinLongestLapM(null);
    setMinAvgWatts(null);
    setMinElevationM(null);
    setMinDurationMinutes(null);
    setMinTss(null);
    setSortMetric('date');
    setSortDirection('desc');
  };

  // Category counts strictly for All, Swim, Bike, Run, Gym (excluding deleted activities)
  const categoryCounts = useMemo(() => {
    const activeActivities = activities.filter((act) => !act.isDeleted);
    const counts: Record<ActivityFilterCategory, number> = {
      All: activeActivities.length,
      Swim: 0,
      Bike: 0,
      Run: 0,
      Gym: 0,
    };
    for (const act of activeActivities) {
      const cat = classifyActivity(act).category;
      if (cat === 'Swim' || cat === 'Bike' || cat === 'Run' || cat === 'Gym') {
        counts[cat] = (counts[cat] || 0) + 1;
      }
    }
    return counts;
  }, [activities]);

  if (!stravaToken && !isDemoModeActive() && activities.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center flex flex-col items-center max-w-lg mx-auto shadow-xl my-4">
        <div className="w-16 h-16 rounded-3xl bg-[#FC5200]/15 border border-[#FC5200]/30 flex items-center justify-center mb-4 shadow-inner">
          <StravaIcon className="w-9 h-9" />
        </div>
        <h3 className="text-lg font-black text-white mb-2">Connect Your Strava Account</h3>
        <p className="text-xs sm:text-sm text-slate-400 mb-6 leading-relaxed">
          Authorize FIT Track to view your synced strength workouts, runs, rides, and recent Strava activities directly inside the app.
        </p>
        <button
          type="button"
          onClick={onOpenStravaSettings}
          className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-[#FC5200] hover:bg-[#e04900] text-white font-extrabold text-sm flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-[#FC5200]/25 cursor-pointer active:scale-98"
        >
          <StravaIcon className="w-4 h-4" />
          <span>Authorize with Strava</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in relative pb-24">
      {/* Error state */}
      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="text-amber-400 hover:underline font-bold shrink-0 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* CATEGORY FILTER TABS: All, Swim, Bike, Run, Gym (EXACT ORDER) */}
      {/* ========================================================= */}
      <div className="w-full">
        <div className="w-full flex items-center h-[34px] rounded-[12px] border-[0.8px] border-[#324158] overflow-hidden">
          {(['All', 'Swim', 'Bike', 'Run', 'Gym'] as const).map((cat, idx) => {
            const count = categoryCounts[cat] || 0;
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`split-pill-item flex-1 min-w-[60px] sm:min-w-0 h-full px-1.5 sm:px-3 text-xs font-bold whitespace-nowrap flex items-center justify-center gap-1.5 transition-all cursor-pointer rounded-none outline-none focus:outline-none focus:ring-0 ${
                  idx > 0 ? 'border-l-[0.8px] border-l-[#0f172b]' : ''
                } ${
                  isActive
                    ? 'bg-[#eeeeee] text-slate-900 font-extrabold shadow-[inset_0_2px_4px_rgba(0,0,0,0.18)]'
                    : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900'
                }`}
              >
                {cat === 'All' && (
                  <InfinityIcon className="w-3.5 h-3.5 shrink-0 text-amber-500" strokeWidth={2.5} />
                )}
                {cat === 'Swim' && (
                  <Waves className="w-3.5 h-3.5 shrink-0 text-sky-400" />
                )}
                {cat === 'Bike' && (
                  <Bike className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                )}
                {cat === 'Run' && (
                  <Footprints className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                )}
                {cat === 'Gym' && (
                  <Dumbbell className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
                )}
                <span>{cat}</span>
                <span
                  className="inline-flex items-center justify-center text-[10px] px-1 pt-[1px] h-[18px] min-w-[24px] rounded-[8px] font-mono leading-[12px] border-[0.8px] border-[#8b8c97] bg-slate-100 text-slate-700"
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Search / Sort / Multi-Metric Filter Indicator Banner */}
      {(searchQueryTrimmed || sortMetric !== 'date' || activeFilterCount > 0) && (
        <div
          className={`flex items-center justify-between flex-wrap gap-2 px-3 py-2 rounded-xl text-xs border backdrop-blur-md ${
            isLight
              ? 'bg-amber-50/80 border-amber-200 text-amber-900'
              : 'bg-amber-500/10 border-amber-500/25 text-amber-200'
          }`}
        >
          <div className="flex items-center flex-wrap gap-2">
            {searchQueryTrimmed && (
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-medium ${
                  isLight
                    ? 'bg-amber-100 border-amber-300 text-amber-950'
                    : 'bg-amber-500/20 border-amber-500/35 text-amber-300'
                }`}
              >
                <Search className="w-3 h-3 text-amber-500 shrink-0" />
                <span>
                  Search: <strong>&ldquo;{searchQuery}&rdquo;</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="hover:opacity-75 transition-opacity cursor-pointer ml-0.5"
                  title="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {selectedCategory !== 'All' && (
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-medium ${
                  isLight
                    ? 'bg-amber-100 border-amber-300 text-amber-950'
                    : 'bg-amber-500/20 border-amber-500/35 text-amber-300'
                }`}
              >
                <Filter className="w-3 h-3 text-amber-500 shrink-0" />
                <span>
                  Sport: <strong>{selectedCategory}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedCategory('All')}
                  className="hover:opacity-75 transition-opacity cursor-pointer ml-0.5"
                  title="Reset sport to All"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {minDistanceKm !== null && minDistanceKm > 0 && (
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-medium ${
                  isLight
                    ? 'bg-amber-100 border-amber-300 text-amber-950'
                    : 'bg-amber-500/20 border-amber-500/35 text-amber-300'
                }`}
              >
                <MapPin className="w-3 h-3 text-amber-500 shrink-0" />
                <span>
                  Distance: <strong>&ge; {minDistanceKm} km</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setMinDistanceKm(null)}
                  className="hover:opacity-75 transition-opacity cursor-pointer ml-0.5"
                  title="Clear min distance filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {maxDistanceKm !== null && maxDistanceKm > 0 && (
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-medium ${
                  isLight
                    ? 'bg-amber-100 border-amber-300 text-amber-950'
                    : 'bg-amber-500/20 border-amber-500/35 text-amber-300'
                }`}
              >
                <MapPin className="w-3 h-3 text-amber-500 shrink-0" />
                <span>
                  Distance: <strong>&le; {maxDistanceKm} km</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setMaxDistanceKm(null)}
                  className="hover:opacity-75 transition-opacity cursor-pointer ml-0.5"
                  title="Clear max distance filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {minLongestLapM !== null && minLongestLapM > 0 && (
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-medium ${
                  isLight
                    ? 'bg-cyan-100 border-cyan-300 text-cyan-950'
                    : 'bg-cyan-500/20 border-cyan-500/35 text-cyan-300'
                }`}
              >
                <Waves className="w-3 h-3 text-cyan-500 shrink-0" />
                <span>
                  Longest Lap: <strong>&ge; {minLongestLapM >= 1000 ? `${(minLongestLapM / 1000).toFixed(minLongestLapM % 1000 === 0 ? 0 : 1)}km (${minLongestLapM.toLocaleString()}m)` : `${minLongestLapM.toLocaleString()}m`}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setMinLongestLapM(null)}
                  className="hover:opacity-75 transition-opacity cursor-pointer ml-0.5"
                  title="Clear longest lap filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {minAvgWatts !== null && minAvgWatts > 0 && (
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-medium ${
                  isLight
                    ? 'bg-amber-100 border-amber-300 text-amber-950'
                    : 'bg-amber-500/20 border-amber-500/35 text-amber-300'
                }`}
              >
                <Zap className="w-3 h-3 text-amber-500 shrink-0" />
                <span>
                  Power: <strong>&ge; {minAvgWatts} W</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setMinAvgWatts(null)}
                  className="hover:opacity-75 transition-opacity cursor-pointer ml-0.5"
                  title="Clear min power filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {minElevationM !== null && minElevationM > 0 && (
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-medium ${
                  isLight
                    ? 'bg-amber-100 border-amber-300 text-amber-950'
                    : 'bg-amber-500/20 border-amber-500/35 text-amber-300'
                }`}
              >
                <TrendingUp className="w-3 h-3 text-amber-500 shrink-0" />
                <span>
                  Elevation: <strong>&ge; {minElevationM} m</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setMinElevationM(null)}
                  className="hover:opacity-75 transition-opacity cursor-pointer ml-0.5"
                  title="Clear min elevation filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {minDurationMinutes !== null && minDurationMinutes > 0 && (
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-medium ${
                  isLight
                    ? 'bg-amber-100 border-amber-300 text-amber-950'
                    : 'bg-amber-500/20 border-amber-500/35 text-amber-300'
                }`}
              >
                <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                <span>
                  Duration: <strong>&ge; {minDurationMinutes >= 60 ? `${Math.floor(minDurationMinutes / 60)}h ${minDurationMinutes % 60 > 0 ? `${minDurationMinutes % 60}m` : ''}`.trim() : `${minDurationMinutes}m`}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setMinDurationMinutes(null)}
                  className="hover:opacity-75 transition-opacity cursor-pointer ml-0.5"
                  title="Clear min duration filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {minTss !== null && minTss > 0 && (
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-medium ${
                  isLight
                    ? 'bg-amber-100 border-amber-300 text-amber-950'
                    : 'bg-amber-500/20 border-amber-500/35 text-amber-300'
                }`}
              >
                <Zap className="w-3 h-3 text-amber-500 shrink-0" />
                <span>
                  TSS: <strong>&ge; {minTss}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setMinTss(null)}
                  className="hover:opacity-75 transition-opacity cursor-pointer ml-0.5"
                  title="Clear min TSS filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {sortMetric !== 'date' && (
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-medium ${
                  isLight
                    ? 'bg-amber-100 border-amber-300 text-amber-950'
                    : 'bg-amber-500/20 border-amber-500/35 text-amber-300'
                }`}
              >
                <ArrowUpDown className="w-3 h-3 text-amber-500 shrink-0" />
                <span>
                  Sorted by{' '}
                  <strong>
                    {SORT_OPTIONS.find((o) => o.id === sortMetric)?.label || sortMetric}
                  </strong>{' '}
                  ({sortDirection === 'desc' ? 'High → Low' : 'Low → High'})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSortMetric('date');
                    setSortDirection('desc');
                  }}
                  className="hover:opacity-75 transition-opacity cursor-pointer ml-0.5"
                  title="Reset to default date order"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(activeFilterCount > 0 || sortMetric !== 'date') && (
              <button
                type="button"
                onClick={resetAllFiltersAndSort}
                className="text-[11px] font-bold text-amber-500 hover:underline cursor-pointer"
              >
                Reset All
              </button>
            )}
            <span className="text-[11px] opacity-80 font-mono">
              {filteredAndSortedActivities.length}{' '}
              {filteredAndSortedActivities.length === 1 ? 'activity' : 'activities'}
            </span>
          </div>
        </div>
      )}

      {/* Loading Skeletons */}
      {loading && activities.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={`border rounded-2xl p-4 animate-pulse flex flex-col gap-3 ${
                isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`h-4 rounded w-1/3 ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
                <div className={`h-4 rounded w-1/5 ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
              </div>
              <div className={`h-3 rounded w-1/4 ${isLight ? 'bg-slate-200/60' : 'bg-slate-800/60'}`} />
              <div className="flex gap-2">
                <div className={`h-6 rounded-lg w-20 ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
                <div className={`h-6 rounded-lg w-20 ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredAndSortedActivities.length === 0 && !error && (
        <div
          className={`py-16 text-center rounded-2xl border flex flex-col items-center ${
            isLight
              ? 'bg-white border-slate-200 text-slate-600'
              : 'bg-slate-950/50 border-slate-800 text-slate-500'
          }`}
        >
          {searchQueryTrimmed ? (
            <Search className={`w-8 h-8 mb-2 ${isLight ? 'text-amber-500' : 'text-amber-400'}`} />
          ) : (
            <Activity className={`w-8 h-8 mb-2 ${isLight ? 'text-slate-400' : 'text-slate-600'}`} />
          )}
          <p className={`text-sm font-bold ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>
            {searchQueryTrimmed
              ? `No activities matching "${searchQuery}"`
              : `No ${selectedCategory !== 'All' ? selectedCategory : ''} activities found`}
          </p>
          <p className={`text-xs mt-1 max-w-sm ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            {searchQueryTrimmed
              ? 'Try searching with another keyword or name, or check your category filter.'
              : selectedCategory !== 'All'
              ? `No activities classified as ${selectedCategory} found in current cache.`
              : 'Completed workouts uploaded from FIT Track or Strava will appear here.'}
          </p>
          {searchQueryTrimmed ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className={`mt-4 px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                  : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
              }`}
            >
              Clear Search Filter
            </button>
          ) : (
            <button
              type="button"
              onClick={onRefresh}
              className={`mt-4 px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                  : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
              }`}
            >
              Sync from Strava
            </button>
          )}
        </div>
      )}

      {/* Install App button just above the first activity on the activities list if not installed */}
      <PWAInstallButton />

      {/* Activities Feed */}
      {filteredAndSortedActivities.length > 0 && (
        <div className="grid grid-cols-1 gap-2.5">
          {filteredAndSortedActivities.map((act) => {
            const activityId = String(act.id);
            const classification = classifyActivity(act);
            const details = activityDetails[activityId];
            const metrics = formatSportMetrics(act, details);
            const isIgnored = Boolean(details?.calibration?.isIgnoredFromTrainingStatus);
            const isNew = isActivityNew(act);
            const showNew = isNew && !isIgnored;
            const hasCalibration = Boolean(details?.calibration);
            const duration = details?.calibration?.calibratedMovingTimeSec ?? act.moving_time ?? act.elapsed_time ?? 0;
            const tssResult = calculateActivityTSS(act, details, athleteProfile);
            const tssValue = tssResult ? tssResult.tss : null;
            const longestLapM = getLongestLapDistanceM(act, details);

            return (
              <div
                key={act.id}
                onClick={() => setActiveModalActivity(act)}
                className={`relative overflow-hidden border rounded-2xl transition-all shadow-sm group cursor-pointer active:scale-[0.99] ${
                  isLight
                    ? isIgnored
                      ? 'bg-white border-rose-200/80 opacity-60 hover:opacity-100 hover:border-rose-300'
                      : hasCalibration
                      ? 'bg-white border-amber-300 hover:border-amber-400 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md'
                    : isIgnored
                    ? 'bg-slate-900 border-rose-950/50 opacity-60 hover:opacity-100 hover:border-rose-900/60'
                    : hasCalibration
                    ? 'bg-slate-900 border-amber-500/30 hover:border-amber-500/60'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* 4.a: Category Icon flush in top-left corner */}
                <div
                  className={`absolute top-0 left-0 w-11 h-11 rounded-tl-2xl rounded-br-xl flex items-center justify-center shrink-0 transition-colors z-10 ${
                    isLight
                      ? 'bg-slate-100 border-r border-b border-slate-200 group-hover:border-amber-500/50'
                      : 'bg-slate-800/95 border-r border-b border-slate-700/60 group-hover:border-amber-400/50'
                  }`}
                >
                  {getCategoryIcon(classification.category, 'w-5 h-5', isLight)}
                </div>

                {/* 4.b: "New" badge flush in top-right corner (omitted if Ignored) */}
                {showNew && (
                  <div className="absolute top-0 right-0 px-2.5 py-1 rounded-tr-2xl rounded-bl-xl bg-emerald-500/15 border-l border-b border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 z-10 shadow-xs">
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>New</span>
                  </div>
                )}

                {/* 4.d: TSS flush in bottom-left corner */}
                <div
                  className={`absolute bottom-0 left-0 px-2.5 py-1 rounded-bl-2xl rounded-tr-xl font-mono font-bold text-xs flex items-center gap-1.5 z-10 shadow-xs ${
                    isLight
                      ? 'bg-slate-100 border-r border-t border-slate-200 text-slate-800'
                      : 'bg-slate-950/95 border-r border-t border-slate-800 text-white'
                  }`}
                  title={tssResult?.description || 'Training Stress Score'}
                >
                  <Zap className={`w-3 h-3 ${isLight ? 'text-amber-500' : 'text-amber-400'}`} />
                  <span>{isIgnored ? '0 TSS' : tssValue !== null ? `${tssValue} TSS` : '-- TSS'}</span>
                </div>

                {/* 4.c: Bottom-right badges: Muted & Kudos */}
                {(() => {
                  const isActivityMuted = Boolean(
                    act.hide_from_home ||
                    act.muted ||
                    (details?.activity as any)?.hide_from_home ||
                    (details?.activity as any)?.muted
                  );
                  const hasKudos = typeof act.kudos_count === 'number' && act.kudos_count > 0;

                  if (!isActivityMuted && !hasKudos) return null;

                  return (
                    <div className="absolute bottom-0 right-0 flex items-center z-10 pointer-events-none">
                      {isActivityMuted && (
                        <div
                          className={`px-2 py-1 flex items-center justify-center border-l border-t shadow-xs ${
                            hasKudos ? 'rounded-tl-xl' : 'rounded-br-2xl rounded-tl-xl'
                          } ${
                            isLight
                              ? 'bg-slate-100/95 border-slate-200 text-slate-600'
                              : 'bg-slate-950/95 border-slate-800 text-slate-300'
                          }`}
                          title="Muted on Strava (hidden from home feed)"
                        >
                          <MuteBadgeIcon isLight={isLight} />
                        </div>
                      )}
                      {hasKudos ? (
                        <div
                          className={`px-2.5 py-1 rounded-br-2xl ${
                            isActivityMuted
                              ? 'border-t border-l'
                              : 'rounded-tl-xl border-l border-t'
                          } font-sans font-bold text-[11px] flex items-center gap-1 shadow-xs ${
                            isLight
                              ? 'bg-amber-100/70 border-amber-300/80 text-amber-800'
                              : 'bg-amber-500/15 border-amber-500/25 text-amber-300'
                          }`}
                        >
                          <ThumbsUp className={`w-3 h-3 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
                          <span>{act.kudos_count}</span>
                        </div>
                      ) : null}
                    </div>
                  );
                })()}

                {/* Card Content with padding offset clearing the corner badges */}
                <div className="pt-2.5 pb-8 pl-13 pr-3.5 flex flex-col gap-1.5">
                  {/* Title & Subtype Row */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 pr-12">
                      <h4
                        className={`text-sm sm:text-base font-extrabold transition-colors truncate ${
                          isLight
                            ? 'text-slate-900 group-hover:text-amber-600'
                            : 'text-white group-hover:text-amber-400'
                        }`}
                      >
                        {applyRenameRulesToName(act.name).newName}
                      </h4>
                      <div
                        className={`flex items-center gap-2 text-[11px] mt-0.5 ${
                          isLight ? 'text-slate-500' : 'text-slate-400'
                        }`}
                      >
                        <span>{formatActivityDate(act.start_date_local || act.start_date)}</span>
                        <span>·</span>
                        <span className={`font-medium ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                          {classification.subType}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                      {/* Ignored or Calibrated Badge */}
                      {isIgnored ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-500 text-[10px] font-bold">
                          <span>Ignored</span>
                        </span>
                      ) : hasCalibration ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold ${
                            isLight
                              ? 'bg-amber-50 border-amber-300 text-amber-800'
                              : 'bg-amber-500/10 border-amber-500/25 text-amber-300'
                          }`}
                        >
                          <span>Calibrated</span>
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Primary Metrics Row Tailored to Sport */}
                  <div className="flex items-center flex-wrap gap-2 text-xs font-mono pt-0.5">
                    {/* Primary metric badge */}
                    <span
                      className={`px-2 py-0.5 rounded-lg font-bold border ${
                        isLight
                          ? 'bg-slate-100 border-slate-200 text-slate-800'
                          : 'bg-slate-950/80 border-slate-800 text-white'
                      }`}
                    >
                      {metrics.primaryMetricLabel}
                    </span>

                    {/* Secondary metric badge */}
                    {metrics.secondaryMetricLabel && (
                      <span
                        className={`px-2 py-0.5 rounded-lg font-bold border ${
                          isLight
                            ? 'bg-amber-50 border-amber-200 text-amber-800'
                            : 'bg-slate-950/80 border-slate-800 text-amber-300'
                        }`}
                      >
                        {metrics.secondaryMetricLabel}
                      </span>
                    )}

                    {/* Duration */}
                    {duration > 0 && (
                      <span
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border ${
                          isLight
                            ? 'bg-slate-100 border-slate-200 text-slate-700'
                            : 'bg-slate-950/70 border-slate-800 text-slate-300'
                        }`}
                      >
                        <Clock className={`w-3 h-3 ${isLight ? 'text-slate-500' : 'text-slate-400'}`} />
                        <span>{formatDuration(duration)}</span>
                      </span>
                    )}

                    {/* Longest Lap badge (for swims or when lap filter is active) */}
                    {longestLapM > 0 && (classification.category === 'Swim' || minLongestLapM !== null) && (
                      <span
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border ${
                          minLongestLapM !== null && longestLapM >= minLongestLapM
                            ? isLight
                              ? 'bg-cyan-100 border-cyan-300 text-cyan-900 font-bold'
                              : 'bg-cyan-500/20 border-cyan-500/35 text-cyan-300 font-bold'
                            : isLight
                            ? 'bg-slate-100 border-slate-200 text-slate-700'
                            : 'bg-slate-950/70 border-slate-800 text-slate-300'
                        }`}
                        title={`Longest Lap: ${longestLapM >= 1000 ? `${(longestLapM / 1000).toFixed(longestLapM % 1000 === 0 ? 0 : 2)} km (${longestLapM}m)` : `${longestLapM}m`}`}
                      >
                        <Waves className={`w-3 h-3 ${isLight ? 'text-cyan-600' : 'text-cyan-400'}`} />
                        <span>Lap {longestLapM >= 1000 ? `${(longestLapM / 1000).toFixed(longestLapM % 1000 === 0 ? 0 : 1)}km` : `${longestLapM}m`}</span>
                      </span>
                    )}

                    {/* Elevation for outdoor run/bike */}
                    {metrics.elevationLabel && (
                      <span
                        className={`px-2 py-0.5 rounded-lg border ${
                          isLight
                            ? 'bg-slate-100 border-slate-200 text-slate-600'
                            : 'bg-slate-950/70 border-slate-800 text-slate-400'
                        }`}
                      >
                        {metrics.elevationLabel}
                      </span>
                    )}

                    {/* Average Heart Rate */}
                    {act.average_heartrate && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500">
                        <Heart className="w-3 h-3 text-rose-500" />
                        <span>{Math.round(act.average_heartrate)} bpm</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* ======================================================= */}
          {/* "MORE ACTIVITIES" BUTTON (LOAD HISTORICAL STRAVA FILES) */}
          {/* ======================================================= */}
          <div className="pt-3 pb-6 flex flex-col items-center justify-center">
            {hasMore ? (
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingMore || loading}
                className={`w-full sm:w-auto px-6 py-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 active:scale-98 border ${
                  isLight
                    ? 'bg-white hover:bg-slate-100 text-slate-800 border-slate-200 shadow-xs'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white border-slate-700/80'
                }`}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                    <span>Loading 200 older activities...</span>
                  </>
                ) : (
                  <>
                    <RotateCw className="w-3.5 h-3.5 text-amber-500" />
                    <span>Load 200 More Activities</span>
                  </>
                )}
              </button>
            ) : (
              <div
                className={`text-center py-2 text-xs font-medium ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                ✓ All historical Strava activities loaded ({activities.length} total)
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detailed Activity Pop-up Modal */}
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
        onOpenAthleteProfile={onOpenAthleteProfile}
        onDeleteActivity={(actId) => {
          onDeleteActivity?.(actId);
          setActiveModalActivity(null);
        }}
        onRenameActivity={(actId, newName) => {
          onRenameActivity?.(actId, newName);
          setActiveModalActivity((prev) => (prev && String(prev.id) === String(actId) ? { ...prev, name: newName } : prev));
        }}
      />

      {/* ========================================================= */}
      {/* FLOATING ACTION BAR: SYMMETRICAL FILTER & SEARCH BUTTONS  */}
      {/* Unified flex row guarantees identical vertical distance to bottom and baseline */}
      {/* ========================================================= */}
      <div
        className="fixed bottom-5 left-0 right-0 z-30 pointer-events-none flex items-center justify-between px-4 sm:px-6 md:px-8"
        style={{ bottom: '20px' }}
      >
        {/* Floating Sort & Filter Button (Bottom Left) */}
        <div ref={filterContainerRef} className="pointer-events-auto relative">
          <button
            type="button"
            onClick={() => {
              setIsFilterOpen((prev) => !prev);
              setIsSearchOpen(false);
            }}
            title="Sort & Filter activities (sport, distance, power, elevation, TSS, speed)"
            className={`relative w-12 h-12 rounded-full border shadow-xl flex items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95 ${
              totalActiveFilterAndSortCount > 0 || isFilterOpen
                ? 'bg-amber-500 text-slate-950 border-amber-400 ring-2 ring-amber-400/50 shadow-amber-500/30 font-black'
                : isLight
                ? 'bg-white/95 text-slate-700 border-slate-300 shadow-slate-900/15 hover:bg-slate-50'
                : 'bg-slate-900/95 text-slate-200 border-[#324158] shadow-black/60 hover:bg-slate-800'
            }`}
            aria-label="Filter and Sort Activities"
          >
            <SlidersHorizontal className="w-5 h-5" />
            {totalActiveFilterAndSortCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.5 min-w-[18px] h-[18px] bg-amber-400 text-slate-950 font-black text-[10px] rounded-full border-2 border-slate-900 ring-1 ring-amber-300 flex items-center justify-center">
                {totalActiveFilterAndSortCount}
              </span>
            )}
          </button>

        {/* Floating Sort & Filter Modal / Popover */}
        {isFilterOpen && (
          <div
            className={`fixed bottom-20 left-4 sm:left-6 md:left-8 z-40 w-84 sm:w-[420px] max-w-[calc(100vw-2rem)] max-h-[82vh] flex flex-col p-4 rounded-2xl border shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 ${
              isLight
                ? 'bg-white/95 border-slate-300 text-slate-900 shadow-slate-900/20'
                : 'bg-slate-900/95 border-[#324158] text-white shadow-black/80'
            }`}
          >
            {/* Popover Header */}
            <div
              className={`flex items-center justify-between pb-3 border-b ${
                isLight ? 'border-slate-200' : 'border-slate-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-amber-500" />
                <div>
                  <h3 className="text-sm font-black leading-tight">Sort & Filter</h3>
                  <div className="text-[10px] text-slate-400 font-medium">
                    {filteredAndSortedActivities.length} of {activities.length} matching
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {totalActiveFilterAndSortCount > 0 && (
                  <button
                    type="button"
                    onClick={resetAllFiltersAndSort}
                    className={`text-[11px] font-bold text-amber-500 hover:text-amber-400 px-2 py-0.5 rounded transition-colors cursor-pointer flex items-center gap-1 ${
                      isLight ? 'hover:bg-amber-50' : 'hover:bg-amber-500/10'
                    }`}
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsFilterOpen(false)}
                  className={`p-1 rounded-lg transition-colors cursor-pointer ${
                    isLight ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-slate-800 text-slate-400'
                  }`}
                  aria-label="Close sort and filter panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Filter vs Sort Tab Switcher */}
            <div
              className={`grid grid-cols-2 p-1 rounded-xl border my-2.5 ${
                isLight
                  ? 'bg-slate-100 border-slate-200'
                  : 'bg-slate-800/80 border-slate-700/60'
              }`}
            >
              <button
                type="button"
                onClick={() => setFilterModalTab('filter')}
                className={`py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  filterModalTab === 'filter'
                    ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Filter</span>
                {activeFilterCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-slate-950 text-amber-400">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setFilterModalTab('sort')}
                className={`py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  filterModalTab === 'sort'
                    ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                    : isLight
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span>Sort</span>
                {hasActiveSort && (
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                )}
              </button>
            </div>

            {/* Tab Body */}
            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 py-1 max-h-[50vh] custom-scrollbar">
              {/* ===================== FILTER TAB ===================== */}
              {filterModalTab === 'filter' && (
                <div className="space-y-3.5">
                  {/* 1. Sport Category Filter */}
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider flex items-center justify-between">
                      <span>Sport Category</span>
                      {selectedCategory !== 'All' && (
                        <button
                          type="button"
                          onClick={() => setSelectedCategory('All')}
                          className="text-[10px] text-amber-500 hover:underline cursor-pointer font-bold lowercase"
                        >
                          clear
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {(['All', 'Bike', 'Run', 'Swim', 'Gym'] as const).map((cat) => {
                        const isActive = selectedCategory === cat;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setSelectedCategory(cat)}
                            className={`py-1.5 px-1 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer border ${
                              isActive
                                ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-xs'
                                : isLight
                                ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                                : 'bg-slate-800/70 hover:bg-slate-800 text-slate-300 border-slate-700/60'
                            }`}
                          >
                            {cat === 'All' && <InfinityIcon className="w-3.5 h-3.5" />}
                            {cat === 'Bike' && <Bike className="w-3.5 h-3.5" />}
                            {cat === 'Run' && <Footprints className="w-3.5 h-3.5" />}
                            {cat === 'Swim' && <Waves className="w-3.5 h-3.5" />}
                            {cat === 'Gym' && <Dumbbell className="w-3.5 h-3.5" />}
                            <span className="text-[11px] leading-tight">{cat}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Distance Filter */}
                  <div
                    className={`p-2.5 rounded-xl border ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-800'
                    }`}
                  >
                    <div className="text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-emerald-400" />
                        <span>Distance (km)</span>
                      </div>
                      {(minDistanceKm !== null || maxDistanceKm !== null) && (
                        <button
                          type="button"
                          onClick={() => {
                            setMinDistanceKm(null);
                            setMaxDistanceKm(null);
                          }}
                          className="text-[10px] text-amber-500 hover:underline cursor-pointer font-bold lowercase"
                        >
                          clear
                        </button>
                      )}
                    </div>

                    {/* Distance Quick Presets */}
                    <div className="flex flex-wrap gap-1 mb-2">
                      {[
                        { label: 'Any', min: null },
                        { label: '> 10 km', min: 10 },
                        { label: '> 25 km', min: 25 },
                        { label: '> 50 km', min: 50 },
                        { label: '> 100 km', min: 100 },
                        { label: '> 150 km', min: 150 },
                      ].map((preset) => {
                        const isSelected =
                          preset.min === null
                            ? minDistanceKm === null && maxDistanceKm === null
                            : minDistanceKm === preset.min && maxDistanceKm === null;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              setMinDistanceKm(preset.min);
                              setMaxDistanceKm(null);
                            }}
                            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                                : isLight
                                ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Custom Distance Inputs */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Min Distance (km)</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="e.g. 100"
                          value={minDistanceKm ?? ''}
                          onChange={(e) => {
                            const val = e.target.value === '' ? null : parseFloat(e.target.value);
                            setMinDistanceKm(isNaN(val as number) ? null : val);
                          }}
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono font-bold outline-none transition-all ${
                            isLight
                              ? 'bg-white border-slate-300 text-slate-900 focus:border-amber-500'
                              : 'bg-slate-900 border-slate-700 text-white focus:border-amber-400'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Max Distance (km)</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="Optional"
                          value={maxDistanceKm ?? ''}
                          onChange={(e) => {
                            const val = e.target.value === '' ? null : parseFloat(e.target.value);
                            setMaxDistanceKm(isNaN(val as number) ? null : val);
                          }}
                          className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono font-bold outline-none transition-all ${
                            isLight
                              ? 'bg-white border-slate-300 text-slate-900 focus:border-amber-500'
                              : 'bg-slate-900 border-slate-700 text-white focus:border-amber-400'
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2b. Longest Lap Distance Filter */}
                  <div
                    className={`p-2.5 rounded-xl border ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-800'
                    }`}
                  >
                    <div className="text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Waves className="w-3 h-3 text-cyan-400" />
                        <span>Longest Lap Distance (e.g. Swims &gt; 1,000m)</span>
                      </div>
                      {minLongestLapM !== null && (
                        <button
                          type="button"
                          onClick={() => setMinLongestLapM(null)}
                          className="text-[10px] text-amber-500 hover:underline cursor-pointer font-bold lowercase"
                        >
                          clear
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1 mb-2">
                      {[
                        { label: 'Any', meters: null },
                        { label: '> 100 m', meters: 100 },
                        { label: '> 250 m', meters: 250 },
                        { label: '> 500 m', meters: 500 },
                        { label: '> 1,000 m', meters: 1000 },
                        { label: '> 1,500 m', meters: 1500 },
                        { label: '> 2,000 m', meters: 2000 },
                      ].map((preset) => {
                        const isSelected = minLongestLapM === preset.meters;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => setMinLongestLapM(preset.meters)}
                            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-xs'
                                : isLight
                                ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">Min Longest Lap (meters)</label>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        placeholder="e.g. 1000"
                        value={minLongestLapM ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? null : parseFloat(e.target.value);
                          setMinLongestLapM(isNaN(val as number) ? null : val);
                        }}
                        className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono font-bold outline-none transition-all ${
                          isLight
                            ? 'bg-white border-slate-300 text-slate-900 focus:border-amber-500'
                            : 'bg-slate-900 border-slate-700 text-white focus:border-amber-400'
                        }`}
                      />
                    </div>
                  </div>

                  {/* 3. Average Power Filter */}
                  <div
                    className={`p-2.5 rounded-xl border ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-800'
                    }`}
                  >
                    <div className="text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Zap className="w-3 h-3 text-purple-400" />
                        <span>Average Power (Watts)</span>
                      </div>
                      {minAvgWatts !== null && (
                        <button
                          type="button"
                          onClick={() => setMinAvgWatts(null)}
                          className="text-[10px] text-amber-500 hover:underline cursor-pointer font-bold lowercase"
                        >
                          clear
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1 mb-2">
                      {[
                        { label: 'Any', val: null },
                        { label: '> 150 W', val: 150 },
                        { label: '> 200 W', val: 200 },
                        { label: '> 250 W', val: 250 },
                        { label: '> 300 W', val: 300 },
                      ].map((preset) => {
                        const isSelected = minAvgWatts === preset.val;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => setMinAvgWatts(preset.val)}
                            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                                : isLight
                                ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">Min Average Watts</label>
                      <input
                        type="number"
                        min="0"
                        step="5"
                        placeholder="e.g. 200"
                        value={minAvgWatts ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? null : parseFloat(e.target.value);
                          setMinAvgWatts(isNaN(val as number) ? null : val);
                        }}
                        className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono font-bold outline-none transition-all ${
                          isLight
                            ? 'bg-white border-slate-300 text-slate-900 focus:border-amber-500'
                            : 'bg-slate-900 border-slate-700 text-white focus:border-amber-400'
                        }`}
                      />
                    </div>
                  </div>

                  {/* 4. Elevation Gain Filter */}
                  <div
                    className={`p-2.5 rounded-xl border ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-800'
                    }`}
                  >
                    <div className="text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="w-3 h-3 text-indigo-400" />
                        <span>Elevation Gain (m)</span>
                      </div>
                      {minElevationM !== null && (
                        <button
                          type="button"
                          onClick={() => setMinElevationM(null)}
                          className="text-[10px] text-amber-500 hover:underline cursor-pointer font-bold lowercase"
                        >
                          clear
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1 mb-2">
                      {[
                        { label: 'Any', val: null },
                        { label: '> 250 m', val: 250 },
                        { label: '> 500 m', val: 500 },
                        { label: '> 1,000 m', val: 1000 },
                        { label: '> 1,500 m', val: 1500 },
                      ].map((preset) => {
                        const isSelected = minElevationM === preset.val;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => setMinElevationM(preset.val)}
                            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                                : isLight
                                ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">Min Elevation Gain (m)</label>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        placeholder="e.g. 500"
                        value={minElevationM ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? null : parseFloat(e.target.value);
                          setMinElevationM(isNaN(val as number) ? null : val);
                        }}
                        className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono font-bold outline-none transition-all ${
                          isLight
                            ? 'bg-white border-slate-300 text-slate-900 focus:border-amber-500'
                            : 'bg-slate-900 border-slate-700 text-white focus:border-amber-400'
                        }`}
                      />
                    </div>
                  </div>

                  {/* 5. Moving Duration Filter */}
                  <div
                    className={`p-2.5 rounded-xl border ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-800'
                    }`}
                  >
                    <div className="text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-sky-400" />
                        <span>Moving Time</span>
                      </div>
                      {minDurationMinutes !== null && (
                        <button
                          type="button"
                          onClick={() => setMinDurationMinutes(null)}
                          className="text-[10px] text-amber-500 hover:underline cursor-pointer font-bold lowercase"
                        >
                          clear
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {[
                        { label: 'Any', mins: null },
                        { label: '> 30m', mins: 30 },
                        { label: '> 1h', mins: 60 },
                        { label: '> 2h', mins: 120 },
                        { label: '> 3h', mins: 180 },
                        { label: '> 4h', mins: 240 },
                      ].map((preset) => {
                        const isSelected = minDurationMinutes === preset.mins;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => setMinDurationMinutes(preset.mins)}
                            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                                : isLight
                                ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 6. TSS Filter */}
                  <div
                    className={`p-2.5 rounded-xl border ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-800'
                    }`}
                  >
                    <div className="text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Zap className="w-3 h-3 text-amber-400" />
                        <span>Training Stress Score (TSS)</span>
                      </div>
                      {minTss !== null && (
                        <button
                          type="button"
                          onClick={() => setMinTss(null)}
                          className="text-[10px] text-amber-500 hover:underline cursor-pointer font-bold lowercase"
                        >
                          clear
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {[
                        { label: 'Any', val: null },
                        { label: '> 50 TSS', val: 50 },
                        { label: '> 100 TSS', val: 100 },
                        { label: '> 150 TSS', val: 150 },
                        { label: '> 200 TSS', val: 200 },
                      ].map((preset) => {
                        const isSelected = minTss === preset.val;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => setMinTss(preset.val)}
                            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                                : isLight
                                ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ===================== SORT TAB ===================== */}
              {filterModalTab === 'sort' && (
                <div className="space-y-3">
                  {/* Sort Direction Toggle */}
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
                      Sort Direction
                    </div>
                    <div
                      className={`grid grid-cols-2 gap-1.5 p-1 rounded-xl border ${
                        isLight
                          ? 'bg-slate-100 border-slate-200'
                          : 'bg-slate-800/80 border-slate-700/60'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSortDirection('desc')}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          sortDirection === 'desc'
                            ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                            : isLight
                            ? 'text-slate-600 hover:text-slate-900'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                        <span>High to Low (Desc)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSortDirection('asc')}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          sortDirection === 'asc'
                            ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                            : isLight
                            ? 'text-slate-600 hover:text-slate-900'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                        <span>Low to High (Asc)</span>
                      </button>
                    </div>
                  </div>

                  {/* Sort Metric Options List */}
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
                      Sort By Metric
                    </div>
                    <div className="space-y-1">
                      {/* Default Date option */}
                      <button
                        type="button"
                        onClick={() => setSortMetric('date')}
                        className={`w-full px-3 py-2 rounded-xl text-left text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                          sortMetric === 'date'
                            ? isLight
                              ? 'bg-amber-100 border border-amber-300 text-amber-950'
                              : 'bg-amber-500/15 border border-amber-500/40 text-amber-300'
                            : isLight
                            ? 'hover:bg-slate-100 text-slate-700'
                            : 'hover:bg-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Activity className="w-4 h-4 text-slate-400 shrink-0" />
                          <div>
                            <div className="font-bold">Date (Default)</div>
                            <div className="text-[10px] text-slate-400 font-normal">
                              {sortDirection === 'desc' ? 'Newest first' : 'Oldest first'}
                            </div>
                          </div>
                        </div>
                        {sortMetric === 'date' && <Check className="w-4 h-4 text-amber-500 shrink-0" />}
                      </button>

                      {/* The 10 Metrics */}
                      {SORT_OPTIONS.map((opt) => {
                        const isSelected = sortMetric === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setSortMetric(opt.id)}
                            className={`w-full px-3 py-2 rounded-xl text-left text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                              isSelected
                                ? isLight
                                  ? 'bg-amber-100 border border-amber-300 text-amber-950'
                                  : 'bg-amber-500/15 border border-amber-500/40 text-amber-300'
                                : isLight
                                ? 'hover:bg-slate-100 text-slate-700'
                                : 'hover:bg-slate-800 text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="shrink-0">{opt.icon()}</span>
                              <div>
                                <div className="font-bold">{opt.label}</div>
                                <div className="text-[10px] text-slate-400 font-normal">
                                  {sortDirection === 'desc' ? opt.descHelper : opt.ascHelper}
                                </div>
                              </div>
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-amber-500 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Popover Footer */}
            <div
              className={`pt-3 mt-2 border-t flex items-center justify-between gap-2 ${
                isLight ? 'border-slate-200' : 'border-slate-800'
              }`}
            >
              <div className="text-[11px] font-medium text-slate-400 truncate">
                Showing <strong className="text-amber-500 font-bold">{filteredAndSortedActivities.length}</strong> of {activities.length}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {totalActiveFilterAndSortCount > 0 && (
                  <button
                    type="button"
                    onClick={resetAllFiltersAndSort}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      isLight ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    Reset All
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsFilterOpen(false)}
                  className="px-4 py-1.5 rounded-lg text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer shadow-xs"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Search Button (Bottom Right) */}
      <div ref={searchContainerRef} className="pointer-events-auto relative">
          <button
          type="button"
          onClick={() => {
            setIsSearchOpen((prev) => !prev);
            setIsFilterOpen(false);
          }}
          title="Search activities by name or description"
          className={`relative w-12 h-12 rounded-full border shadow-xl flex items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95 ${
            searchQueryTrimmed || isSearchOpen
              ? 'bg-amber-500 text-slate-950 border-amber-400 ring-2 ring-amber-400/50 shadow-amber-500/30 font-black'
              : isLight
              ? 'bg-white/95 text-slate-700 border-slate-300 shadow-slate-900/15 hover:bg-slate-50'
              : 'bg-slate-900/95 text-slate-200 border-[#324158] shadow-black/60 hover:bg-slate-800'
          }`}
          aria-label="Search Activities"
        >
          <Search className="w-5 h-5" />
          {searchQueryTrimmed && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-400 rounded-full border-2 border-slate-900 ring-1 ring-amber-300" />
          )}
        </button>

        {/* Floating Search Popover */}
        {isSearchOpen && (
          <div
            className={`fixed bottom-20 right-4 sm:right-6 md:right-8 z-40 w-80 sm:w-96 max-w-[calc(100vw-2rem)] p-4 rounded-2xl border shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 ${
              isLight
                ? 'bg-white/95 border-slate-300 text-slate-900 shadow-slate-900/20'
                : 'bg-slate-900/95 border-[#324158] text-white shadow-black/80'
            }`}
          >
            {/* Search Header */}
            <div
              className={`flex items-center justify-between pb-2 mb-2.5 border-b ${
                isLight ? 'border-slate-200' : 'border-slate-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-black">Search Activities</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSearchOpen(false)}
                className={`p-1 rounded-lg transition-colors cursor-pointer ${
                  isLight ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-slate-800 text-slate-400'
                }`}
                aria-label="Close search"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative flex items-center">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or description..."
                className={`w-full pl-9 pr-8 py-2.5 rounded-xl text-xs font-medium border outline-none transition-all ${
                  isLight
                    ? 'bg-slate-100 border-slate-200 text-slate-900 focus:border-amber-500 focus:bg-white'
                    : 'bg-slate-800/90 border-slate-700 text-white focus:border-amber-400 focus:bg-slate-950'
                }`}
              />
              <Search className="absolute left-3 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-2.5 p-0.5 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Clear text"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Search Meta Status */}
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>
                {filteredAndSortedActivities.length}{' '}
                {filteredAndSortedActivities.length === 1 ? 'match' : 'matches'} found
              </span>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-amber-500 hover:underline cursor-pointer font-sans font-bold"
                >
                  Clear search
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
);
};
