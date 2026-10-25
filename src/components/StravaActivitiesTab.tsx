import React, { useState, useMemo } from 'react';
import {
  ExternalLink,
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
  UploadCloud,
  Check,
  FileSpreadsheet,
  LogOut,
  ChevronRight,
  Loader2,
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
  isActivityUnpublished,
  getLastStravaRefreshTime,
} from '../utils/stravaActivities';
import type { AthleteProfile } from '../types/athlete';
import { StravaActivityModal } from './StravaActivityModal';

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
  onRefresh: () => void;
  onLoadMore: () => void;
  onConnectGoogle: () => void;
  onDisconnectGoogle: () => void;
  onOpenStravaSettings: () => void;
  onActivityPublished: (activityId: string) => void;
  onOpenAthleteProfile?: () => void;
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

function getCategoryIcon(category: ActivityCategory, className = 'w-5 h-5') {
  switch (category) {
    case 'Swim':
      return <Waves className={`${className} text-sky-400`} />;
    case 'Bike':
      return <Bike className={`${className} text-orange-400`} />;
    case 'Run':
      return <Footprints className={`${className} text-amber-400`} />;
    case 'Gym':
      return <Dumbbell className={`${className} text-emerald-400`} />;
    default:
      return <Activity className={`${className} text-purple-400`} />;
  }
}

function formatLastRefresh(timestamp: number): string {
  if (!timestamp || timestamp <= 0) return '';
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
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
  onRefresh,
  onLoadMore,
  onConnectGoogle,
  onDisconnectGoogle,
  onOpenStravaSettings,
  onActivityPublished,
  onOpenAthleteProfile,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<ActivityFilterCategory>('All');
  const [activeModalActivity, setActiveModalActivity] = useState<StravaActivity | null>(null);

  const lastRefreshTime = getLastStravaRefreshTime();
  const lastRefreshFormatted = formatLastRefresh(lastRefreshTime);

  // Filter activities by selected category: All, Swim, Bike, Run, Gym
  const filteredActivities = useMemo(() => {
    if (selectedCategory === 'All') return activities;
    return activities.filter((act) => classifyActivity(act).category === selectedCategory);
  }, [activities, selectedCategory]);

  // Category counts strictly for All, Swim, Bike, Run, Gym
  const categoryCounts = useMemo(() => {
    const counts: Record<ActivityFilterCategory, number> = {
      All: activities.length,
      Swim: 0,
      Bike: 0,
      Run: 0,
      Gym: 0,
    };
    for (const act of activities) {
      const cat = classifyActivity(act).category;
      if (cat === 'Swim' || cat === 'Bike' || cat === 'Run' || cat === 'Gym') {
        counts[cat] = (counts[cat] || 0) + 1;
      }
    }
    return counts;
  }, [activities]);

  if (!stravaToken) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center flex flex-col items-center max-w-lg mx-auto shadow-xl my-4">
        <div className="w-16 h-16 rounded-3xl bg-[#FC5200]/15 border border-[#FC5200]/30 flex items-center justify-center mb-4 shadow-inner">
          <StravaIcon className="w-9 h-9" />
        </div>
        <h3 className="text-lg font-black text-white mb-2">Connect Your Strava Account</h3>
        <p className="text-xs sm:text-sm text-slate-400 mb-6 leading-relaxed">
          Authorize GymFIT to view your synced strength workouts, runs, rides, and recent Strava activities directly inside the app.
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
    <div className="space-y-4 animate-fade-in">
      {/* ========================================================= */}
      {/* DUAL CONNECTION STATUS BOX: STRAVA (LEFT) | GOOGLE (RIGHT) */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-sm">
        {/* Left Side: Strava Connection Status */}
        <div className="flex items-center justify-between gap-3 pr-0 md:pr-3 md:border-r md:border-slate-800/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#FC5200]/20 border border-[#FC5200]/30 flex items-center justify-center shrink-0">
              <StravaIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-extrabold text-white truncate">
                  {athleteName || 'Strava Athlete'}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Connected
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                {lastRefreshFormatted ? `Refreshed ${lastRefreshFormatted}` : 'Live Strava feed'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
            title="Refresh activities (smart delta sync)"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            <span className="hidden sm:inline">{loading ? 'Syncing...' : 'Sync'}</span>
          </button>
        </div>

        {/* Right Side: Google Sheets Connection Status */}
        <div className="flex items-center justify-between gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-slate-800/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-extrabold text-white truncate">
                  {isGoogleConnected ? 'Google Sheets' : 'Google Account'}
                </span>
                {isGoogleConnected ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Connected
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full shrink-0">
                    Not Linked
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                {isGoogleConnected ? (
                  googleSheetUrl ? (
                    <a
                      href={googleSheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      <span>GymFIT Training Log</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ) : (
                    googleUserEmail || 'GymFIT Training Log ready'
                  )
                ) : (
                  'Export streams & workouts to Sheets'
                )}
              </p>
            </div>
          </div>

          {isGoogleConnected ? (
            <button
              type="button"
              onClick={onDisconnectGoogle}
              className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              title="Disconnect Google account"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onConnectGoogle}
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm shadow-blue-600/20 shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Connect</span>
            </button>
          )}
        </div>
      </div>

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
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {(['All', 'Swim', 'Bike', 'Run', 'Gym'] as const).map((cat) => {
          const count = categoryCounts[cat] || 0;
          const isActive = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
                isActive
                  ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                  : 'bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {cat === 'Swim' && <Waves className="w-3.5 h-3.5 text-sky-400" />}
              {cat === 'Bike' && <Bike className="w-3.5 h-3.5 text-orange-400" />}
              {cat === 'Run' && <Footprints className="w-3.5 h-3.5 text-amber-400" />}
              {cat === 'Gym' && <Dumbbell className="w-3.5 h-3.5 text-emerald-400" />}
              <span>{cat}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isActive ? 'bg-slate-950/20 text-slate-950 font-black' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Loading Skeletons */}
      {loading && activities.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 animate-pulse flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <div className="h-4 bg-slate-800 rounded w-1/3" />
                <div className="h-4 bg-slate-800 rounded w-1/5" />
              </div>
              <div className="h-3 bg-slate-800/60 rounded w-1/4" />
              <div className="flex gap-2">
                <div className="h-6 bg-slate-800 rounded-lg w-20" />
                <div className="h-6 bg-slate-800 rounded-lg w-20" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredActivities.length === 0 && !error && (
        <div className="py-16 text-center text-slate-500 bg-slate-950/50 rounded-2xl border border-slate-800 flex flex-col items-center">
          <Activity className="w-8 h-8 text-slate-600 mb-2" />
          <p className="text-sm font-bold text-slate-300">No {selectedCategory !== 'All' ? selectedCategory : ''} activities found</p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            {selectedCategory !== 'All'
              ? `No activities classified as ${selectedCategory} found in current cache.`
              : 'Completed workouts uploaded from GymFIT or Strava will appear here.'}
          </p>
          <button
            type="button"
            onClick={onRefresh}
            className="mt-4 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition-colors cursor-pointer"
          >
            Sync from Strava
          </button>
        </div>
      )}

      {/* Activities Feed */}
      {filteredActivities.length > 0 && (
        <div className="grid grid-cols-1 gap-2.5">
          {filteredActivities.map((act) => {
            const activityId = String(act.id);
            const classification = classifyActivity(act);
            const details = activityDetails[activityId];
            const metrics = formatSportMetrics(act, details);
            const isNew = isActivityNew(act);
            const isUnpublished = isActivityUnpublished(details);
            const isIgnored = Boolean(details?.calibration?.isIgnoredFromTrainingStatus);
            const hasCalibration = Boolean(details?.calibration);
            const duration = details?.calibration?.calibratedMovingTimeSec ?? act.moving_time ?? act.elapsed_time ?? 0;

            return (
              <div
                key={act.id}
                onClick={() => setActiveModalActivity(act)}
                className={`bg-slate-900 border rounded-2xl p-4 transition-all shadow-sm flex flex-col gap-3 group cursor-pointer active:scale-[0.99] ${
                  isIgnored
                    ? 'border-rose-950/50 opacity-60 hover:opacity-100 hover:border-rose-900/60'
                    : hasCalibration
                    ? 'border-amber-500/30 hover:border-amber-500/60'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-800/90 border border-slate-700/60 flex items-center justify-center shrink-0 mt-0.5 group-hover:border-amber-400/50 transition-colors">
                      {getCategoryIcon(classification.category)}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm sm:text-base font-extrabold text-white group-hover:text-amber-400 transition-colors truncate">
                        {act.name}
                      </h4>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                        <span>{formatActivityDate(act.start_date_local || act.start_date)}</span>
                        <span>·</span>
                        <span className="font-medium text-slate-300">{classification.subType}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Ignored or Calibrated Badge */}
                    {isIgnored ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[10px] font-bold">
                        <span>Ignored</span>
                      </span>
                    ) : hasCalibration ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[10px] font-bold">
                        <span>Calibrated</span>
                      </span>
                    ) : null}

                    {/* "New" badge stays for 24h even if published */}
                    {isNew && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[10px] font-black uppercase tracking-wide">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>New</span>
                      </span>
                    )}

                    {/* "Unpublished" badge until sent to Google Sheets */}
                    {isUnpublished ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[10px] font-black uppercase tracking-wide">
                        <UploadCloud className="w-2.5 h-2.5" />
                        <span>Unpublished</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[10px] font-bold">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                        <span>Sheets</span>
                      </span>
                    )}

                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition-colors" />
                  </div>
                </div>

                {/* Primary Metrics Row Tailored to Sport */}
                <div className="flex items-center flex-wrap gap-2 text-xs font-mono pt-1">
                  {/* Primary metric badge */}
                  <span className="px-2.5 py-1 rounded-lg bg-slate-950/80 border border-slate-800 text-white font-bold">
                    {metrics.primaryMetricLabel}
                  </span>

                  {/* Secondary metric badge */}
                  {metrics.secondaryMetricLabel && (
                    <span className="px-2.5 py-1 rounded-lg bg-slate-950/80 border border-slate-800 text-amber-300 font-bold">
                      {metrics.secondaryMetricLabel}
                    </span>
                  )}

                  {/* Duration */}
                  {duration > 0 && (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950/70 border border-slate-800 text-slate-300">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{formatDuration(duration)}</span>
                    </span>
                  )}

                  {/* Elevation for outdoor run/bike */}
                  {metrics.elevationLabel && (
                    <span className="px-2.5 py-1 rounded-lg bg-slate-950/70 border border-slate-800 text-slate-400">
                      {metrics.elevationLabel}
                    </span>
                  )}

                  {/* Average Heart Rate */}
                  {act.average_heartrate && (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300">
                      <Heart className="w-3 h-3 text-rose-400" />
                      <span>{Math.round(act.average_heartrate)} bpm</span>
                    </span>
                  )}

                  {/* Kudos */}
                  {act.kudos_count && act.kudos_count > 0 ? (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 ml-auto font-sans font-bold text-[11px]">
                      <ThumbsUp className="w-3 h-3 text-amber-400" />
                      <span>{act.kudos_count}</span>
                    </span>
                  ) : null}
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
                className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 active:scale-98"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                    <span>Loading 50 older activities...</span>
                  </>
                ) : (
                  <>
                    <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Load 50 More Activities</span>
                  </>
                )}
              </button>
            ) : (
              <div className="text-center py-2 text-xs text-slate-500 font-medium">
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
        onConnectGoogle={onConnectGoogle}
        onClose={() => setActiveModalActivity(null)}
        onActivityPublished={onActivityPublished}
        onOpenAthleteProfile={onOpenAthleteProfile}
      />
    </div>
  );
};
