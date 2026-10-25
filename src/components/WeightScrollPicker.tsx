import React, { useState, useEffect, useRef } from 'react';
import { X, Check, ChevronUp, ChevronDown, Plus, Minus, KeyRound, RotateCcw } from 'lucide-react';

interface WeightScrollPickerProps {
  initialWeight: number;
  isOpen: boolean;
  exerciseName?: string;
  onClose: () => void;
  onConfirm: (weightKg: number) => void;
}

interface DigitColumnProps {
  value: number;
  label: string;
  onChange: (val: number) => void;
}

const DigitColumn: React.FC<DigitColumnProps> = ({ value, label, onChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const increment = () => {
    onChange((value + 1) % 10);
  };

  const decrement = () => {
    onChange((value - 1 + 10) % 10);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      increment();
    } else if (e.deltaY > 0) {
      decrement();
    }
  };

  return (
    <div className="flex flex-col items-center select-none">
      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1.5">{label}</span>
      <button
        type="button"
        onClick={increment}
        className="w-12 h-10 rounded-t-xl bg-slate-800 hover:bg-slate-700 active:bg-amber-500/20 active:text-amber-400 text-slate-300 flex items-center justify-center transition-colors border border-b-0 border-slate-700"
        aria-label={`Increase ${label}`}
      >
        <ChevronUp className="w-5 h-5" />
      </button>

      <div
        ref={containerRef}
        onWheel={handleWheel}
        className="w-12 h-16 bg-slate-900 border-x border-slate-700 flex items-center justify-center relative overflow-hidden group cursor-ns-resize shadow-inner"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/40 pointer-events-none" />
        <span className="text-3xl font-black font-mono tabular-nums text-white group-hover:text-amber-400 transition-colors">
          {value}
        </span>
      </div>

      <button
        type="button"
        onClick={decrement}
        className="w-12 h-10 rounded-b-xl bg-slate-800 hover:bg-slate-700 active:bg-amber-500/20 active:text-amber-400 text-slate-300 flex items-center justify-center transition-colors border border-t-0 border-slate-700"
        aria-label={`Decrease ${label}`}
      >
        <ChevronDown className="w-5 h-5" />
      </button>
    </div>
  );
};

export const WeightScrollPicker: React.FC<WeightScrollPickerProps> = ({
  initialWeight,
  isOpen,
  exerciseName,
  onClose,
  onConfirm,
}) => {
  const [directInputMode, setDirectInputMode] = useState(false);
  const [directInputValue, setDirectInputValue] = useState('');

  // Allow weight from 0.0 to 999.9 kg with 0.1kg precision
  const clampedInit = Math.min(999.9, Math.max(0, Number(initialWeight.toFixed(1))));

  const [hundreds, setHundreds] = useState(Math.floor(clampedInit / 100));
  const [tens, setTens] = useState(Math.floor((clampedInit % 100) / 10));
  const [ones, setOnes] = useState(Math.floor(clampedInit % 10));
  const [tenths, setTenths] = useState(Math.round((clampedInit * 10) % 10));

  useEffect(() => {
    if (isOpen) {
      const clamped = Math.min(999.9, Math.max(0, Number(initialWeight.toFixed(1))));
      setHundreds(Math.floor(clamped / 100));
      setTens(Math.floor((clamped % 100) / 10));
      setOnes(Math.floor(clamped % 10));
      setTenths(Math.round((clamped * 10) % 10));
      setDirectInputValue(clamped.toFixed(1));
      setDirectInputMode(false);
    }
  }, [isOpen, initialWeight]);

  if (!isOpen) return null;

  // Calculate current composite weight
  const currentWeightRaw = hundreds * 100 + tens * 10 + ones + tenths * 0.1;
  const currentWeight = Number(currentWeightRaw.toFixed(1));

  const applyWeight = (target: number) => {
    const clamped = Math.min(999.9, Math.max(0, Math.round(target * 10) / 10));
    const totalTenths = Math.round(clamped * 10);
    setHundreds(Math.floor(totalTenths / 1000));
    setTens(Math.floor((totalTenths % 1000) / 100));
    setOnes(Math.floor((totalTenths % 100) / 10));
    setTenths(totalTenths % 10);
    setDirectInputValue(clamped.toFixed(1));
  };

  const handleNudge = (delta: number) => {
    applyWeight(Math.round((currentWeight + delta) * 10) / 10);
  };

  const handleConfirm = () => {
    let finalWeight = currentWeight;
    if (directInputMode) {
      const parsed = parseFloat(directInputValue);
      if (!isNaN(parsed)) {
        finalWeight = Math.min(999.9, Math.max(0, Math.round(parsed * 10) / 10));
      }
    }
    onConfirm(finalWeight);
    onClose();
  };

  const handleDirectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDirectInputValue(e.target.value);
    const parsed = parseFloat(e.target.value);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 999.9) {
      const clamped = Math.round(parsed * 10) / 10;
      const totalTenths = Math.round(clamped * 10);
      setHundreds(Math.floor(totalTenths / 1000));
      setTens(Math.floor((totalTenths % 1000) / 100));
      setOnes(Math.floor((totalTenths % 100) / 10));
      setTenths(totalTenths % 10);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full sm:max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl flex flex-col gap-4 text-slate-100 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold text-amber-500">Weight Selector</div>
            <h3 className="text-base font-bold text-white truncate max-w-[240px]">
              {exerciseName || 'Adjust Weight'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Big Weight Display */}
        <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800 flex items-center justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-4xl font-extrabold font-mono tabular-nums tracking-tight text-white">
              {currentWeight.toFixed(1)}
            </span>
            <span className="text-lg font-bold text-amber-400">kg</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setDirectInputMode(!directInputMode)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 ${
                directInputMode
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{directInputMode ? 'Use Wheels' : 'Keypad'}</span>
            </button>
            <button
              type="button"
              onClick={() => applyWeight(initialWeight)}
              title="Reset to previous weight"
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 border border-slate-700 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Input Mode View */}
        {directInputMode ? (
          <div className="py-4">
            <label className="block text-xs font-medium text-slate-400 mb-2">
              Enter exact kilograms (0.0 to 999.9 kg):
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="999.9"
              value={directInputValue}
              onChange={handleDirectChange}
              placeholder="e.g. 82.5 (0 for bodyweight)"
              autoFocus
              className="w-full text-center text-3xl font-mono font-bold py-3 bg-slate-950 border-2 border-amber-500/60 rounded-xl text-white focus:outline-none focus:border-amber-400"
            />
          </div>
        ) : (
          /* Multi-Figure Drum Scroll Wheels */
          <div className="py-2">
            <div className="flex items-center justify-center gap-2 sm:gap-3 bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
              <DigitColumn value={hundreds} label="100s" onChange={setHundreds} />
              <DigitColumn value={tens} label="10s" onChange={setTens} />
              <DigitColumn value={ones} label="1s" onChange={setOnes} />

              <div className="flex flex-col items-center justify-center pt-5">
                <span className="text-3xl font-mono font-black text-amber-400 pb-1">.</span>
              </div>

              <DigitColumn value={tenths} label="0.1s" onChange={setTenths} />
            </div>
            <p className="text-[11px] text-center text-slate-400 mt-2">
              Scroll each wheel or tap arrows to rotate figure independently (0.0 - 999.9 kg)
            </p>
          </div>
        )}

        {/* Rapid Step Nudge Buttons */}
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-2">
            Quick Step Adjustments
          </span>
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => handleNudge(-5.0)}
              className="py-2 px-1 text-xs font-mono font-semibold bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg text-slate-300 border border-slate-700/60 transition-colors"
            >
              -5.0 kg
            </button>
            <button
              type="button"
              onClick={() => handleNudge(-2.5)}
              className="py-2 px-1 text-xs font-mono font-semibold bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg text-slate-300 border border-slate-700/60 transition-colors"
            >
              -2.5 kg
            </button>
            <button
              type="button"
              onClick={() => handleNudge(-1.0)}
              className="py-2 px-1 text-xs font-mono font-semibold bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg text-slate-300 border border-slate-700/60 transition-colors"
            >
              -1.0 kg
            </button>
            <button
              type="button"
              onClick={() => handleNudge(-0.1)}
              className="py-2 px-1 text-xs font-mono font-bold bg-amber-500/10 hover:bg-amber-500/20 active:bg-amber-500/30 rounded-lg text-amber-300 border border-amber-500/40 transition-colors"
            >
              -0.1 kg
            </button>

            <button
              type="button"
              onClick={() => handleNudge(0.1)}
              className="py-2 px-1 text-xs font-mono font-bold bg-amber-500/10 hover:bg-amber-500/20 active:bg-amber-500/30 rounded-lg text-amber-300 border border-amber-500/40 transition-colors"
            >
              +0.1 kg
            </button>
            <button
              type="button"
              onClick={() => handleNudge(1.0)}
              className="py-2 px-1 text-xs font-mono font-semibold bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg text-amber-300 border border-slate-700/60 transition-colors"
            >
              +1.0 kg
            </button>
            <button
              type="button"
              onClick={() => handleNudge(2.5)}
              className="py-2 px-1 text-xs font-mono font-semibold bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg text-amber-300 border border-slate-700/60 transition-colors"
            >
              +2.5 kg
            </button>
            <button
              type="button"
              onClick={() => handleNudge(5.0)}
              className="py-2 px-1 text-xs font-mono font-semibold bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg text-amber-300 border border-slate-700/60 transition-colors"
            >
              +5.0 kg
            </button>
          </div>
        </div>

        {/* Quick Common Barbell / Dumbbell Plate Targets */}
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-2">
            Common Targets
          </span>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono">
            {[20, 40, 60, 80, 100, 120, 140, 160, 180, 200].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => applyWeight(preset)}
                className={`px-3 py-1.5 rounded-lg border font-semibold whitespace-nowrap transition-colors ${
                  currentWeight === preset
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                    : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                {preset}kg
              </button>
            ))}
          </div>
        </div>

        {/* Confirm Footer */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Confirm {currentWeight.toFixed(1)} kg</span>
          </button>
        </div>
      </div>
    </div>
  );
};
