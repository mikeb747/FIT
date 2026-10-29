import React, { useState, useMemo } from 'react';
import {
  Pencil,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Loader2,
  Sliders,
  UploadCloud,
  ChevronDown,
  ChevronUp,
  Tag,
  Info,
} from 'lucide-react';
import {
  ActivityRenameRule,
  getActivityRenameRules,
  saveActivityRenameRules,
  applyRenameRulesToName,
  applyRenameRulesToActivities,
  processActivitiesWithRenameRules,
  DEFAULT_ACTIVITY_RENAME_RULES,
} from '../utils/activityRenameRules';
import type { StravaActivity } from '../utils/stravaActivities';
import { saveCachedStravaActivities } from '../utils/stravaActivities';

interface ActivityRenameRulesSectionProps {
  activities?: StravaActivity[];
  stravaToken?: string | null;
  theme?: 'dark' | 'light';
  onActivitiesUpdated?: (activities: StravaActivity[]) => void;
}

export const ActivityRenameRulesSection: React.FC<ActivityRenameRulesSectionProps> = ({
  activities = [],
  stravaToken = null,
  theme = 'dark',
  onActivitiesUpdated,
}) => {
  const isLight = theme === 'light';

  const [rules, setRules] = useState<ActivityRenameRule[]>(() => getActivityRenameRules());
  const [testInput, setTestInput] = useState('TrainingPeaks Virtual - Workout 30/30 Anaerobic #3');

  // New Rule Form State
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [newFindPattern, setNewFindPattern] = useState('');
  const [newReplacement, setNewReplacement] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newAutoUpload, setNewAutoUpload] = useState(true);

  // Batch Syncing State
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);
  const [syncResult, setSyncResult] = useState<{ renamed: number; synced: number } | null>(null);
  const [showMatchesList, setShowMatchesList] = useState(false);

  const handleUpdateRules = (updated: ActivityRenameRule[]) => {
    setRules(updated);
    saveActivityRenameRules(updated);

    if (activities && activities.length > 0) {
      const renamed = applyRenameRulesToActivities(activities, updated);
      saveCachedStravaActivities(renamed);
      onActivitiesUpdated?.(renamed);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('fit_track_activities_updated', { detail: { activities: renamed } })
        );
      }
    }
  };

  const handleToggleRule = (id: string) => {
    const next = rules.map((r) => (r.id === id ? { ...r, isEnabled: !r.isEnabled } : r));
    handleUpdateRules(next);
  };

  const handleToggleAutoUpload = (id: string) => {
    const next = rules.map((r) =>
      r.id === id ? { ...r, autoUploadToStrava: !r.autoUploadToStrava } : r
    );
    handleUpdateRules(next);
  };

  const handleDeleteRule = (id: string) => {
    const next = rules.filter((r) => r.id !== id);
    handleUpdateRules(next);
  };

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFindPattern.trim()) return;

    const newRule: ActivityRenameRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      label: newLabel.trim() || `Replace "${newFindPattern}"`,
      findPattern: newFindPattern,
      replacement: newReplacement,
      isEnabled: true,
      autoUploadToStrava: newAutoUpload,
    };

    handleUpdateRules([...rules, newRule]);
    setNewFindPattern('');
    setNewReplacement('');
    setNewLabel('');
    setIsAddingRule(false);
  };

  const handleApplyPreset = (preset: { find: string; replace: string; label: string }) => {
    // Check if rule with this pattern already exists
    const existing = rules.find((r) => r.findPattern === preset.find);
    if (existing) {
      // Toggle it on if disabled, or update replacement
      const next = rules.map((r) =>
        r.id === existing.id ? { ...r, isEnabled: true, replacement: preset.replace } : r
      );
      handleUpdateRules(next);
      return;
    }

    const newRule: ActivityRenameRule = {
      id: `rule_preset_${Date.now()}`,
      label: preset.label,
      findPattern: preset.find,
      replacement: preset.replace,
      isEnabled: true,
      autoUploadToStrava: true,
    };
    handleUpdateRules([...rules, newRule]);
  };

  const handleResetDefaults = () => {
    handleUpdateRules(DEFAULT_ACTIVITY_RENAME_RULES);
  };

  // Compute live test output
  const testOutput = useMemo(() => {
    return applyRenameRulesToName(testInput, rules);
  }, [testInput, rules]);

  // Compute matching activities in currently loaded feed
  const matchingActivities = useMemo(() => {
    if (!activities || activities.length === 0) return [];
    const list: Array<{ activity: StravaActivity; newName: string }> = [];

    for (const act of activities) {
      const res = applyRenameRulesToName(act.name, rules);
      if (res.changed) {
        list.push({ activity: act, newName: res.newName });
      }
    }
    return list;
  }, [activities, rules]);

  // Execute Batch Rename & Strava Sync
  const handleBatchRenameAndSync = async () => {
    if (matchingActivities.length === 0) return;
    setIsSyncing(true);
    setSyncResult(null);
    setSyncProgress({ current: 0, total: matchingActivities.length });

    try {
      const result = await processActivitiesWithRenameRules(activities, stravaToken, {
        syncToStrava: Boolean(stravaToken),
        forceAll: true,
      });

      // Save updated activities in cache and propagate locally
      const freshUpdated = [...result.updatedActivities];
      saveCachedStravaActivities(freshUpdated);
      onActivitiesUpdated?.(freshUpdated);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('fit_track_activities_updated', {
            detail: { activities: freshUpdated },
          })
        );
      }

      setSyncResult({
        renamed: result.renamedCount,
        synced: result.syncedToStravaCount,
      });
      setTimeout(() => {
        setSyncResult(null);
      }, 5000);
    } catch (err) {
      console.error('Batch rename failed:', err);
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  };

  return (
    <div
      className={`p-3.5 sm:p-4 rounded-2xl border space-y-3.5 transition-colors ${
        isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-950 border-slate-800'
      }`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
            <Tag className="w-4 h-4" />
          </div>
          <div>
            <h3
              className={`text-xs uppercase font-extrabold tracking-wider ${
                isLight ? 'text-slate-800' : 'text-slate-200'
              }`}
            >
              Activity Name Auto-Rename Rules
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Automatically clean up titles when loaded from Strava and upload corrected names via API
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setIsAddingRule(!isAddingRule)}
            className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1 transition-all cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Rule</span>
          </button>
        </div>
      </div>

      {/* Preset Quick Actions */}
      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
        <span className="text-[10px] uppercase font-bold text-slate-500 mr-1">Presets:</span>
        <button
          type="button"
          onClick={() =>
            handleApplyPreset({
              find: 'TrainingPeaks Virtual - ',
              replace: '',
              label: 'Remove "TrainingPeaks Virtual - "',
            })
          }
          className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
            isLight
              ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
              : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
          }`}
        >
          Remove "TrainingPeaks Virtual - "
        </button>

        <button
          type="button"
          onClick={() =>
            handleApplyPreset({
              find: 'TrainingPeaks Virtual',
              replace: 'Virtual',
              label: 'Shorten to "Virtual"',
            })
          }
          className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
            isLight
              ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
              : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
          }`}
        >
          Shorten to "Virtual"
        </button>

        <button
          type="button"
          onClick={() =>
            handleApplyPreset({
              find: 'Zwift - ',
              replace: '',
              label: 'Remove "Zwift - "',
            })
          }
          className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
            isLight
              ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
              : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
          }`}
        >
          Remove "Zwift - "
        </button>
      </div>

      {/* Add New Rule Form */}
      {isAddingRule && (
        <form
          onSubmit={handleAddRule}
          className={`p-3 rounded-xl border space-y-2.5 animate-in fade-in duration-150 ${
            isLight ? 'bg-amber-50/50 border-amber-200' : 'bg-slate-900/90 border-amber-500/30'
          }`}
        >
          <div className="flex items-center justify-between pb-1 border-b border-slate-800/60">
            <span className="text-xs font-bold text-amber-400">Create New Rename Rule</span>
            <button
              type="button"
              onClick={() => setIsAddingRule(false)}
              className="text-[11px] text-slate-400 hover:text-white cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                Find String (Match Pattern)
              </label>
              <input
                type="text"
                required
                value={newFindPattern}
                onChange={(e) => setNewFindPattern(e.target.value)}
                placeholder='e.g. "TrainingPeaks Virtual - "'
                className={`w-full px-2.5 py-1.5 rounded-lg border font-mono text-xs focus:outline-none ${
                  isLight
                    ? 'bg-white border-slate-300 text-slate-900'
                    : 'bg-slate-950 border-slate-700 text-white'
                }`}
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                Replace With (Leave empty to remove)
              </label>
              <input
                type="text"
                value={newReplacement}
                onChange={(e) => setNewReplacement(e.target.value)}
                placeholder='e.g. "" or "Virtual "'
                className={`w-full px-2.5 py-1.5 rounded-lg border font-mono text-xs focus:outline-none ${
                  isLight
                    ? 'bg-white border-slate-300 text-slate-900'
                    : 'bg-slate-950 border-slate-700 text-white'
                }`}
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
              <input
                type="checkbox"
                checked={newAutoUpload}
                onChange={(e) => setNewAutoUpload(e.target.checked)}
                className="rounded accent-amber-500"
              />
              <span>Upload corrected name to Strava via API</span>
            </label>

            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer shadow-xs"
            >
              Save Rule
            </button>
          </div>
        </form>
      )}

      {/* Rules List */}
      <div className="space-y-2 pt-1">
        {rules.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
            No rename rules configured. Click "Add Rule" or choose a preset above.
          </div>
        ) : (
          rules.map((rule) => (
            <div
              key={rule.id}
              className={`p-2.5 sm:p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-all ${
                rule.isEnabled
                  ? isLight
                    ? 'bg-slate-50 border-slate-200'
                    : 'bg-slate-900/80 border-slate-800'
                  : 'opacity-50 bg-slate-950/40 border-slate-900'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <input
                  type="checkbox"
                  checked={rule.isEnabled}
                  onChange={() => handleToggleRule(rule.id)}
                  className="rounded accent-amber-500 cursor-pointer w-4 h-4"
                  title="Enable or disable this rule"
                />

                <div className="min-w-0 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 font-bold">
                      "{rule.findPattern}"
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-bold">
                      {rule.replacement ? `"${rule.replacement}"` : '"" (Remove)'}
                    </span>
                  </div>

                  {rule.label && (
                    <span className="text-[11px] text-slate-400 mt-0.5 block truncate">
                      {rule.label}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => handleToggleAutoUpload(rule.id)}
                  className={`text-[10px] font-bold px-2 py-1 rounded-md border flex items-center gap-1 cursor-pointer transition-colors ${
                    rule.autoUploadToStrava
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      : 'bg-slate-800/50 border-slate-700/50 text-slate-500'
                  }`}
                  title="Toggle uploading corrected name to Strava via API"
                >
                  <UploadCloud className="w-3 h-3" />
                  <span>{rule.autoUploadToStrava ? 'Strava API Upload' : 'Local Only'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteRule(rule.id)}
                  className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  title="Delete rule"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Live Interactive Tester */}
      <div
        className={`p-3 rounded-xl border space-y-2 text-xs ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-800/80'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Interactive Rule Tester</span>
          </span>
          <span className="text-[10px] text-slate-500">Live preview</span>
        </div>

        <div className="space-y-1.5">
          <input
            type="text"
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            placeholder="Type sample activity name here..."
            className={`w-full px-2.5 py-1.5 rounded-lg border font-mono text-xs focus:outline-none ${
              isLight
                ? 'bg-white border-slate-300 text-slate-900'
                : 'bg-slate-950 border-slate-700 text-white'
            }`}
          />

          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/70 border border-slate-800/80 font-mono text-xs">
            <span className="text-slate-500 shrink-0">Output:</span>
            {testOutput.changed ? (
              <span className="font-bold text-emerald-400 truncate">
                "{testOutput.newName}"
              </span>
            ) : (
              <span className="text-slate-400 italic">No rules matched (name unchanged)</span>
            )}
            {testOutput.changed && (
              <span className="ml-auto text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded font-sans shrink-0">
                Matched {testOutput.matchedRules.length} rule(s)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Batch Scan & Apply Section */}
      <div
        className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          matchingActivities.length > 0
            ? 'bg-amber-500/10 border-amber-500/30'
            : isLight
            ? 'bg-slate-50 border-slate-200'
            : 'bg-slate-900/30 border-slate-800'
        }`}
      >
        <div className="space-y-0.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-200">
              {matchingActivities.length > 0 ? (
                <span className="text-amber-300 font-extrabold">
                  {matchingActivities.length} existing activity{matchingActivities.length === 1 ? '' : 'ies'} match active rules
                </span>
              ) : (
                <span className="text-slate-400">All loaded activities already conform to rename rules</span>
              )}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            {stravaToken
              ? 'Apply rules to rename activities locally and sync corrected titles directly to Strava via API.'
              : 'Apply rules to rename activities locally (connect Strava to upload to your account).'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {matchingActivities.length > 0 && (
            <button
              type="button"
              onClick={() => setShowMatchesList(!showMatchesList)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>{showMatchesList ? 'Hide' : 'Review'}</span>
              {showMatchesList ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}

          <button
            type="button"
            disabled={matchingActivities.length === 0 || isSyncing}
            onClick={handleBatchRenameAndSync}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md ${
              matchingActivities.length > 0 && !isSyncing
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
            }`}
          >
            {isSyncing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>
                  Syncing {syncProgress ? `${syncProgress.current}/${syncProgress.total}` : '...'}
                </span>
              </>
            ) : (
              <>
                <UploadCloud className="w-3.5 h-3.5" />
                <span>
                  {stravaToken
                    ? `Update on Strava (${matchingActivities.length})`
                    : `Rename Locally (${matchingActivities.length})`}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Sync Success Feedback */}
      {syncResult && (
        <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 font-bold animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
          <span>
            Successfully updated {syncResult.renamed} activities!
            {syncResult.synced > 0 && ` (${syncResult.synced} synced directly to Strava via API)`}
          </span>
        </div>
      )}

      {/* Expandable Review List of Matches */}
      {showMatchesList && matchingActivities.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/80 p-2 space-y-1.5 text-xs font-mono">
          {matchingActivities.map(({ activity, newName }) => (
            <div
              key={activity.id}
              className="p-1.5 rounded bg-slate-900 border border-slate-800/80 flex items-center justify-between gap-2"
            >
              <span className="text-slate-400 truncate max-w-[45%]" title={activity.name}>
                {activity.name}
              </span>
              <ArrowRight className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="text-emerald-400 font-bold truncate max-w-[45%]" title={newName}>
                {newName}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
