import React, { useState } from 'react';
import {
  X,
  Heart,
  Moon,
  Activity,
  Sparkles,
  Check,
  Calendar,
  Clock,
  Zap,
  Tag,
  FileText,
} from 'lucide-react';
import type { DailyRecoveryLog, RecoverySource, SubjectiveFeel } from '../types/recovery';

interface RecoveryLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (log: DailyRecoveryLog) => void;
  initialLog?: DailyRecoveryLog | null;
  baselineRhr?: number;
  theme?: 'light' | 'dark';
}

export const RecoveryLogModal: React.FC<RecoveryLogModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialLog,
  baselineRhr = 41,
  theme = 'dark',
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(initialLog?.date || todayStr);
  const [restingHr, setRestingHr] = useState<number>(initialLog?.restingHr ?? baselineRhr);
  const [hrvRmssd, setHrvRmssd] = useState<number>(initialLog?.hrvRmssd ?? 78);
  const [sleepHours, setSleepHours] = useState<number>(
    initialLog ? Math.floor(initialLog.sleepDurationMinutes / 60) : 8
  );
  const [sleepMinutes, setSleepMinutes] = useState<number>(
    initialLog ? initialLog.sleepDurationMinutes % 60 : 5
  );
  const [sleepScore, setSleepScore] = useState<number>(initialLog?.sleepScore ?? 85);
  const [deepSleep, setDeepSleep] = useState<number>(initialLog?.deepSleepMinutes ?? 85);
  const [remSleep, setRemSleep] = useState<number>(initialLog?.remSleepMinutes ?? 100);
  const [awakeTime, setAwakeTime] = useState<number>(initialLog?.awakeMinutes ?? 30);
  const [subjectiveFeel, setSubjectiveFeel] = useState<SubjectiveFeel>(
    initialLog?.subjectiveFeel ?? 4
  );
  const [source, setSource] = useState<RecoverySource>(initialLog?.source ?? 'garmin');
  const [notes, setNotes] = useState<string>(initialLog?.notes ?? '');

  if (!isOpen) return null;

  const totalSleepMinutes = sleepHours * 60 + sleepMinutes;
  const calculatedLightSleep = Math.max(0, totalSleepMinutes - deepSleep - remSleep);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const log: DailyRecoveryLog = {
      id: initialLog?.id || `rec_${date}`,
      date,
      restingHr: Math.round(restingHr),
      hrvRmssd: Math.round(hrvRmssd),
      sleepDurationMinutes: totalSleepMinutes,
      sleepScore: Math.min(100, Math.max(1, sleepScore)),
      deepSleepMinutes: Math.round(deepSleep),
      remSleepMinutes: Math.round(remSleep),
      lightSleepMinutes: Math.round(calculatedLightSleep),
      awakeMinutes: Math.round(awakeTime),
      subjectiveFeel,
      notes: notes.trim(),
      source,
    };
    onSave(log);
    onClose();
  };

  const isLight = theme === 'light';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`border rounded-2xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden transition-colors ${
          isLight
            ? 'bg-white border-slate-200 text-slate-900 shadow-xl'
            : 'bg-[#0f111a] border-slate-800 text-slate-100 shadow-2xl'
        }`}
      >
        {/* Header */}
        <div
          className={`px-5 py-4 border-b flex items-center justify-between ${
            isLight ? 'bg-slate-50/90 border-slate-200' : 'bg-slate-900/60 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {initialLog ? 'Edit Recovery Metrics' : 'Log Morning Metrics'}
              </h2>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Overnight Garmin Sleep, Resting Heart Rate &amp; HRV
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              isLight
                ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Date & Data Source */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${
                  isLight ? 'text-slate-600' : 'text-slate-400'
                }`}
              >
                Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={`w-full rounded-xl px-3 py-2 text-sm outline-none transition-colors border ${
                    isLight
                      ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-500 focus:bg-white'
                      : 'bg-slate-950/80 border-slate-800 text-slate-200 focus:border-emerald-500'
                  }`}
                  required
                />
              </div>
            </div>

            <div>
              <label
                className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${
                  isLight ? 'text-slate-600' : 'text-slate-400'
                }`}
              >
                Source
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as RecoverySource)}
                className={`w-full rounded-xl px-3 py-2 text-sm outline-none transition-colors border ${
                  isLight
                    ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-500 focus:bg-white'
                    : 'bg-slate-950/80 border-slate-800 text-slate-200 focus:border-emerald-500'
                }`}
              >
                <option value="garmin">Garmin Connect</option>
                <option value="trainingpeaks">TrainingPeaks</option>
                <option value="manual">Manual Entry</option>
              </select>
            </div>
          </div>

          {/* Core Physiological Metrics: RHR & HRV */}
          <div
            className={`border rounded-xl p-4 space-y-4 ${
              isLight ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'
            }`}
          >
            <h3
              className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                isLight ? 'text-slate-700' : 'text-slate-300'
              }`}
            >
              <Heart className="w-4 h-4 text-rose-500" />
              Cardiovascular &amp; Autonomic State
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Morning RHR */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    className={`text-xs font-medium ${
                      isLight ? 'text-slate-700' : 'text-slate-300'
                    }`}
                  >
                    Morning Resting HR
                  </label>
                  <span className="text-[11px] text-slate-400">Baseline: {baselineRhr} bpm</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRestingHr((prev) => Math.max(30, prev - 1))}
                    className={`w-9 h-9 rounded-xl font-bold text-base flex items-center justify-center transition-colors cursor-pointer border ${
                      isLight
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                        : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                  >
                    -
                  </button>
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      min={30}
                      max={120}
                      value={restingHr}
                      onChange={(e) => setRestingHr(Number(e.target.value))}
                      className={`w-full rounded-xl px-3 py-2 text-center text-base font-bold outline-none border ${
                        isLight
                          ? 'bg-white border-slate-200 text-emerald-600 focus:border-emerald-500'
                          : 'bg-slate-950 border-slate-800 text-emerald-400 focus:border-emerald-500'
                      }`}
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-400">bpm</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRestingHr((prev) => Math.min(100, prev + 1))}
                    className={`w-9 h-9 rounded-xl font-bold text-base flex items-center justify-center transition-colors cursor-pointer border ${
                      isLight
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                        : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                  >
                    +
                  </button>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span
                    className={
                      restingHr <= baselineRhr
                        ? 'text-emerald-500 font-semibold'
                        : restingHr <= baselineRhr + 2
                        ? 'text-sky-500 font-semibold'
                        : 'text-amber-500 font-semibold'
                    }
                  >
                    {restingHr - baselineRhr === 0
                      ? 'Equal to baseline'
                      : restingHr - baselineRhr > 0
                      ? `+${restingHr - baselineRhr} bpm vs baseline`
                      : `${restingHr - baselineRhr} bpm below baseline`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRestingHr(baselineRhr)}
                    className="text-slate-400 hover:text-slate-600 underline cursor-pointer"
                  >
                    Set to {baselineRhr}
                  </button>
                </div>
              </div>

              {/* Overnight HRV (rMSSD) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    className={`text-xs font-medium ${
                      isLight ? 'text-slate-700' : 'text-slate-300'
                    }`}
                  >
                    Overnight HRV (rMSSD)
                  </label>
                  <span className="text-[11px] text-slate-400">Autonomic Reserve</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setHrvRmssd((prev) => Math.max(15, prev - 2))}
                    className={`w-9 h-9 rounded-xl font-bold text-base flex items-center justify-center transition-colors cursor-pointer border ${
                      isLight
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                        : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                  >
                    -
                  </button>
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      min={15}
                      max={180}
                      value={hrvRmssd}
                      onChange={(e) => setHrvRmssd(Number(e.target.value))}
                      className={`w-full rounded-xl px-3 py-2 text-center text-base font-bold outline-none border ${
                        isLight
                          ? 'bg-white border-slate-200 text-purple-600 focus:border-purple-500'
                          : 'bg-slate-950 border-slate-800 text-purple-400 focus:border-purple-500'
                      }`}
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-400">ms</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHrvRmssd((prev) => Math.min(180, prev + 2))}
                    className={`w-9 h-9 rounded-xl font-bold text-base flex items-center justify-center transition-colors cursor-pointer border ${
                      isLight
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                        : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700'
                    }`}
                  >
                    +
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Higher or balanced relative to 7d baseline indicates parasympathetic recovery.
                </p>
              </div>
            </div>
          </div>

          {/* Sleep Architecture & Duration */}
          <div
            className={`border rounded-xl p-4 space-y-4 ${
              isLight ? 'bg-slate-50/70 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <h3
                className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  isLight ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                <Moon className="w-4 h-4 text-sky-500" />
                Sleep Architecture &amp; Duration
              </h3>
              <span className="text-xs font-bold text-sky-500">
                {sleepHours}h {sleepMinutes}m ({totalSleepMinutes} min)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Duration inputs */}
              <div>
                <label
                  className={`block text-xs font-medium mb-1.5 ${
                    isLight ? 'text-slate-700' : 'text-slate-300'
                  }`}
                >
                  Total Sleep Time
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <input
                      type="number"
                      min={3}
                      max={14}
                      value={sleepHours}
                      onChange={(e) => setSleepHours(Number(e.target.value))}
                      className={`w-full rounded-xl px-3 py-2 text-sm outline-none border ${
                        isLight
                          ? 'bg-white border-slate-200 text-slate-900 focus:border-sky-500'
                          : 'bg-slate-950 border-slate-800 text-slate-200 focus:border-sky-500'
                      }`}
                    />
                    <span className="absolute right-3 top-2 text-xs text-slate-400">hrs</span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={59}
                      step={5}
                      value={sleepMinutes}
                      onChange={(e) => setSleepMinutes(Number(e.target.value))}
                      className={`w-full rounded-xl px-3 py-2 text-sm outline-none border ${
                        isLight
                          ? 'bg-white border-slate-200 text-slate-900 focus:border-sky-500'
                          : 'bg-slate-950 border-slate-800 text-slate-200 focus:border-sky-500'
                      }`}
                    />
                    <span className="absolute right-3 top-2 text-xs text-slate-400">min</span>
                  </div>
                </div>
              </div>

              {/* Garmin Sleep Score */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    className={`text-xs font-medium ${
                      isLight ? 'text-slate-700' : 'text-slate-300'
                    }`}
                  >
                    Garmin Sleep Score
                  </label>
                  <span className="text-xs font-bold text-emerald-500">{sleepScore} / 100</span>
                </div>
                <input
                  type="range"
                  min={40}
                  max={100}
                  value={sleepScore}
                  onChange={(e) => setSleepScore(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-200 dark:bg-slate-800 rounded-lg"
                />
              </div>
            </div>

            {/* Stages: Deep, REM, Awake */}
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              <div
                className={`rounded-xl p-2.5 border text-center ${
                  isLight
                    ? 'bg-indigo-50/80 border-indigo-200 text-indigo-900'
                    : 'bg-slate-900/80 border-indigo-500/20'
                }`}
              >
                <span className="text-[10px] uppercase font-bold text-indigo-500 block mb-1">
                  Deep Sleep
                </span>
                <input
                  type="number"
                  min={10}
                  max={180}
                  value={deepSleep}
                  onChange={(e) => setDeepSleep(Number(e.target.value))}
                  className={`w-full rounded-lg px-1.5 py-1 text-center text-xs font-bold outline-none border ${
                    isLight
                      ? 'bg-white border-indigo-200 text-indigo-900'
                      : 'bg-slate-950 border-slate-800 text-indigo-300'
                  }`}
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {totalSleepMinutes > 0 ? Math.round((deepSleep / totalSleepMinutes) * 100) : 0}%
                  (Tissue)
                </span>
              </div>

              <div
                className={`rounded-xl p-2.5 border text-center ${
                  isLight
                    ? 'bg-cyan-50/80 border-cyan-200 text-cyan-900'
                    : 'bg-slate-900/80 border-cyan-500/20'
                }`}
              >
                <span className="text-[10px] uppercase font-bold text-cyan-500 block mb-1">
                  REM Sleep
                </span>
                <input
                  type="number"
                  min={10}
                  max={200}
                  value={remSleep}
                  onChange={(e) => setRemSleep(Number(e.target.value))}
                  className={`w-full rounded-lg px-1.5 py-1 text-center text-xs font-bold outline-none border ${
                    isLight
                      ? 'bg-white border-cyan-200 text-cyan-900'
                      : 'bg-slate-950 border-slate-800 text-cyan-300'
                  }`}
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {totalSleepMinutes > 0 ? Math.round((remSleep / totalSleepMinutes) * 100) : 0}%
                  (Neural)
                </span>
              </div>

              <div
                className={`rounded-xl p-2.5 border text-center ${
                  isLight
                    ? 'bg-rose-50/80 border-rose-200 text-rose-900'
                    : 'bg-slate-900/80 border-rose-500/20'
                }`}
              >
                <span className="text-[10px] uppercase font-bold text-rose-500 block mb-1">
                  Awake Time
                </span>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={awakeTime}
                  onChange={(e) => setAwakeTime(Number(e.target.value))}
                  className={`w-full rounded-lg px-1.5 py-1 text-center text-xs font-bold outline-none border ${
                    isLight
                      ? 'bg-white border-rose-200 text-rose-900'
                      : 'bg-slate-950 border-slate-800 text-rose-300'
                  }`}
                />
                <span className="text-[10px] text-slate-400 mt-1 block">min restless</span>
              </div>
            </div>
          </div>

          {/* Subjective Feeling (1-5) */}
          <div>
            <label
              className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${
                isLight ? 'text-slate-600' : 'text-slate-400'
              }`}
            >
              Morning Subjective Recovery
            </label>
            <div className="grid grid-cols-5 gap-2">
              {[
                { val: 1 as SubjectiveFeel, label: 'Exhausted', color: 'border-rose-500/50 text-rose-500' },
                { val: 2 as SubjectiveFeel, label: 'Heavy', color: 'border-amber-500/50 text-amber-500' },
                { val: 3 as SubjectiveFeel, label: 'Moderate', color: 'border-slate-400 text-slate-600' },
                { val: 4 as SubjectiveFeel, label: 'Good', color: 'border-sky-500/50 text-sky-500' },
                { val: 5 as SubjectiveFeel, label: 'Peak', color: 'border-emerald-500/50 text-emerald-500' },
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => setSubjectiveFeel(item.val)}
                  className={`py-2 px-1 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                    subjectiveFeel === item.val
                      ? isLight
                        ? 'bg-white ring-2 ring-emerald-500 shadow-xs ' + item.color
                        : 'bg-slate-800 ring-2 ring-emerald-500 ' + item.color
                      : isLight
                      ? 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'
                  }`}
                >
                  <span className="block text-sm mb-0.5">{item.val}</span>
                  <span className="text-[10px] font-normal leading-tight block">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label
              className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${
                isLight ? 'text-slate-600' : 'text-slate-400'
              }`}
            >
              Notes &amp; Context (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Post 90km tempo ride, late meal, great hydration"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={`w-full rounded-xl px-3 py-2 text-sm outline-none border ${
                isLight
                  ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-500 focus:bg-white'
                  : 'bg-slate-950/80 border-slate-800 text-slate-200 focus:border-emerald-500'
              }`}
            />
          </div>

          {/* Action Buttons */}
          <div
            className={`pt-3 flex items-center justify-end gap-3 border-t ${
              isLight ? 'border-slate-200' : 'border-slate-800'
            }`}
          >
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                isLight
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Save Morning Metrics
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
