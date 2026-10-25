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
}

export const RecoveryLogModal: React.FC<RecoveryLogModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialLog,
  baselineRhr = 41,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0f111a] border border-slate-800 rounded-2xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {initialLog ? 'Edit Recovery Metrics' : 'Log Morning Metrics'}
              </h2>
              <p className="text-xs text-slate-400">
                Overnight Garmin Sleep, Resting Heart Rate & HRV
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Date & Data Source */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Source
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as RecoverySource)}
                className="w-full bg-slate-950/80 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none transition-colors"
              >
                <option value="garmin">Garmin Connect</option>
                <option value="trainingpeaks">TrainingPeaks</option>
                <option value="manual">Manual Entry</option>
              </select>
            </div>
          </div>

          {/* Core Physiological Metrics: RHR & HRV */}
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-4">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Heart className="w-4 h-4 text-rose-400" />
              Cardiovascular & Autonomic State
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Morning RHR */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">Morning Resting HR</label>
                  <span className="text-[11px] text-slate-500">Baseline: {baselineRhr} bpm</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRestingHr((prev) => Math.max(30, prev - 1))}
                    className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-bold text-base flex items-center justify-center transition-colors"
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
                      className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-center text-base font-bold text-emerald-400 outline-none"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-500">bpm</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRestingHr((prev) => Math.min(100, prev + 1))}
                    className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-bold text-base flex items-center justify-center transition-colors"
                  >
                    +
                  </button>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span
                    className={
                      restingHr <= baselineRhr
                        ? 'text-emerald-400'
                        : restingHr <= baselineRhr + 2
                        ? 'text-sky-400'
                        : 'text-amber-400'
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
                    className="text-slate-500 hover:text-slate-300 underline"
                  >
                    Set to {baselineRhr}
                  </button>
                </div>
              </div>

              {/* Overnight HRV (rMSSD) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">Overnight HRV (rMSSD)</label>
                  <span className="text-[11px] text-slate-500">Autonomic Reserve</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setHrvRmssd((prev) => Math.max(15, prev - 2))}
                    className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-bold text-base flex items-center justify-center transition-colors"
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
                      className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl px-3 py-2 text-center text-base font-bold text-purple-400 outline-none"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-500">ms</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHrvRmssd((prev) => Math.min(180, prev + 2))}
                    className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-bold text-base flex items-center justify-center transition-colors"
                  >
                    +
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Higher or balanced relative to 7d avg indicates parasympathetic dominance.
                </p>
              </div>
            </div>
          </div>

          {/* Sleep Architecture & Duration */}
          <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Moon className="w-4 h-4 text-sky-400" />
                Sleep Architecture & Duration
              </h3>
              <span className="text-xs font-bold text-sky-400">
                {sleepHours}h {sleepMinutes}m ({totalSleepMinutes} min)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Duration inputs */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Total Sleep Time</label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <input
                      type="number"
                      min={3}
                      max={14}
                      value={sleepHours}
                      onChange={(e) => setSleepHours(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none"
                    />
                    <span className="absolute right-3 top-2 text-xs text-slate-500">hrs</span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={59}
                      step={5}
                      value={sleepMinutes}
                      onChange={(e) => setSleepMinutes(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none"
                    />
                    <span className="absolute right-3 top-2 text-xs text-slate-500">min</span>
                  </div>
                </div>
              </div>

              {/* Garmin Sleep Score */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">Garmin Sleep Score</label>
                  <span className="text-xs font-bold text-emerald-400">{sleepScore} / 100</span>
                </div>
                <input
                  type="range"
                  min={40}
                  max={100}
                  value={sleepScore}
                  onChange={(e) => setSleepScore(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
              </div>
            </div>

            {/* Stages: Deep, REM, Awake */}
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              <div className="bg-slate-900/80 rounded-xl p-2.5 border border-indigo-500/20 text-center">
                <span className="text-[10px] uppercase font-bold text-indigo-400 block mb-1">Deep Sleep</span>
                <input
                  type="number"
                  min={10}
                  max={180}
                  value={deepSleep}
                  onChange={(e) => setDeepSleep(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-1.5 py-1 text-center text-xs font-bold text-indigo-300 outline-none"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  {totalSleepMinutes > 0 ? Math.round((deepSleep / totalSleepMinutes) * 100) : 0}% (Tissue)
                </span>
              </div>

              <div className="bg-slate-900/80 rounded-xl p-2.5 border border-cyan-500/20 text-center">
                <span className="text-[10px] uppercase font-bold text-cyan-400 block mb-1">REM Sleep</span>
                <input
                  type="number"
                  min={10}
                  max={200}
                  value={remSleep}
                  onChange={(e) => setRemSleep(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-1.5 py-1 text-center text-xs font-bold text-cyan-300 outline-none"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  {totalSleepMinutes > 0 ? Math.round((remSleep / totalSleepMinutes) * 100) : 0}% (Neural)
                </span>
              </div>

              <div className="bg-slate-900/80 rounded-xl p-2.5 border border-rose-500/20 text-center">
                <span className="text-[10px] uppercase font-bold text-rose-400 block mb-1">Awake Time</span>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={awakeTime}
                  onChange={(e) => setAwakeTime(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-1.5 py-1 text-center text-xs font-bold text-rose-300 outline-none"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">min restless</span>
              </div>
            </div>
          </div>

          {/* Subjective Feeling (1-5) */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Morning Subjective Recovery
            </label>
            <div className="grid grid-cols-5 gap-2">
              {[
                { val: 1 as SubjectiveFeel, label: 'Exhausted', color: 'border-rose-500/40 text-rose-400' },
                { val: 2 as SubjectiveFeel, label: 'Heavy', color: 'border-amber-500/40 text-amber-400' },
                { val: 3 as SubjectiveFeel, label: 'Moderate', color: 'border-slate-600 text-slate-300' },
                { val: 4 as SubjectiveFeel, label: 'Good', color: 'border-sky-500/40 text-sky-400' },
                { val: 5 as SubjectiveFeel, label: 'Peak', color: 'border-emerald-500/40 text-emerald-400' },
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => setSubjectiveFeel(item.val)}
                  className={`py-2 px-1 rounded-xl text-xs font-bold border transition-all text-center ${
                    subjectiveFeel === item.val
                      ? 'bg-slate-800 ring-2 ring-emerald-500 ' + item.color
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
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Notes & Context (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Post 90km tempo ride, late meal, great hydration"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
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
