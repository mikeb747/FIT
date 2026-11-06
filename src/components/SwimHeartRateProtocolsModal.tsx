import React, { useState } from 'react';
import {
  X,
  Waves,
  Heart,
  Award,
  BookOpen,
  Info,
  Check,
  ArrowRight,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import { formatSecondsToMinSec } from '../types/athlete';

export type SwimProtocolId = 'btf' | 'usms' | 'friel';

export interface SwimProtocolDefinition {
  id: SwimProtocolId;
  name: string;
  shortName: string;
  organization: string;
  badge: string;
  description: string;
  referenceMethod: 'lthr' | 'max_hr';
  zones: {
    zone: number;
    name: string;
    alias: string;
    lowerPct: number;
    upperPct: number;
    description: string;
    color: string;
    calcRange: (baseHr: number) => { minHr: number; maxHr: number };
  }[];
}

export const SWIM_PROTOCOLS: SwimProtocolDefinition[] = [
  {
    id: 'btf',
    name: 'British Triathlon Aquatic Standards',
    shortName: 'British Triathlon',
    organization: 'British Triathlon Federation (BTF) / World Triathlon',
    badge: 'Triathlon Benchmark',
    description:
      'Standardized for multi-sport athletes. Anchored on Swim Lactate Threshold HR (Swim LTHR) derived from a 400m/800m time trial or 10–13 bpm below Run LTHR.',
    referenceMethod: 'lthr',
    zones: [
      {
        zone: 1,
        name: 'Zone 1: Easy / Recovery',
        alias: 'Warmup & Aerobic Flushing',
        lowerPct: 60,
        upperPct: 72,
        description: 'Very light aerobic effort. Focus on stroke mechanics, rotation, head position, and recovery between hard blocks.',
        color: '#00e5ff',
        calcRange: (lthr) => ({
          minHr: Math.round(lthr * 0.55),
          maxHr: Math.round(lthr * 0.72),
        }),
      },
      {
        zone: 2,
        name: 'Zone 2: Steady / Base Aerobic',
        alias: 'Ironman / 70.3 Race Pacing',
        lowerPct: 73,
        upperPct: 84,
        description: 'Sustainable continuous swimming for 60+ minutes. High fat oxidation, building mitochondrial density and stroke efficiency.',
        color: '#00b0ff',
        calcRange: (lthr) => ({
          minHr: Math.round(lthr * 0.72) + 1,
          maxHr: Math.round(lthr * 0.84),
        }),
      },
      {
        zone: 3,
        name: 'Zone 3: Tempo / Sub-Threshold',
        alias: 'Olympic Pace / Cruise Intervals',
        lowerPct: 85,
        upperPct: 93,
        description: 'Moderate-hard aerobic power. Cruise intervals on 15–20s rest (e.g. 5x400m or 10x200m). Sustainable for 30–45 minutes.',
        color: '#ffea00',
        calcRange: (lthr) => ({
          minHr: Math.round(lthr * 0.84) + 1,
          maxHr: Math.round(lthr * 0.93),
        }),
      },
      {
        zone: 4,
        name: 'Zone 4: Threshold / CSS Equivalent',
        alias: 'Critical Swim Speed (CSS)',
        lowerPct: 94,
        upperPct: 100,
        description: 'Anaerobic threshold (CSS pace). Blood lactate production balances clearance. Hard repeats on short rest (e.g. 20x100m on 10s rest).',
        color: '#ff9100',
        calcRange: (lthr) => ({
          minHr: Math.round(lthr * 0.93) + 1,
          maxHr: Math.round(lthr * 1.00),
        }),
      },
      {
        zone: 5,
        name: 'Zone 5: Super-Threshold & VO2 Max',
        alias: 'Race Pace & Sprint Speed',
        lowerPct: 101,
        upperPct: 108,
        description: 'High intensity anaerobic capacity. 50m–100m sprints, race starts, and draft surge simulations with longer recovery.',
        color: '#ff1744',
        calcRange: (lthr) => ({
          minHr: Math.round(lthr * 1.00) + 1,
          maxHr: Math.max(Math.round(lthr * 1.00) + 1, Math.round(lthr * 1.08)),
        }),
      },
    ],
  },
  {
    id: 'usms',
    name: 'US Masters Swimming / USA Swimming Standard',
    shortName: 'USMS / USA Swimming',
    organization: 'US Masters Swimming & USA Swimming Sport Science',
    badge: 'Competitive Pool Standard',
    description:
      'Classic 5-tier energy system protocol (EN-1 through SP-3) developed by Maglischo & Sweetenham. Calibrated to Swim Max HR (typically 10–13 bpm lower than land Max HR).',
    referenceMethod: 'max_hr',
    zones: [
      {
        zone: 1,
        name: 'EN-1: Aerobic Recovery',
        alias: 'Technique & Aerobic Flushing',
        lowerPct: 60,
        upperPct: 70,
        description: 'Active recovery, warm-up, and cool-down. Drills, sculling, and breathing mechanics.',
        color: '#00e5ff',
        calcRange: (maxHr) => ({
          minHr: Math.round(maxHr * 0.55),
          maxHr: Math.round(maxHr * 0.70),
        }),
      },
      {
        zone: 2,
        name: 'EN-2: Aerobic Threshold',
        alias: 'Endurance Conditioning',
        lowerPct: 71,
        upperPct: 80,
        description: 'Extensive endurance sets (e.g. 400m to 1500m continuous) at conversational cadence.',
        color: '#00b0ff',
        calcRange: (maxHr) => ({
          minHr: Math.round(maxHr * 0.70) + 1,
          maxHr: Math.round(maxHr * 0.80),
        }),
      },
      {
        zone: 3,
        name: 'EN-3: Anaerobic Threshold (CSS)',
        alias: 'Lactate Clearance & CSS',
        lowerPct: 81,
        upperPct: 88,
        description: 'Maximal lactate steady state. Typical sets: 10x100m or 5x200m on 10s–15s rest.',
        color: '#ffea00',
        calcRange: (maxHr) => ({
          minHr: Math.round(maxHr * 0.80) + 1,
          maxHr: Math.round(maxHr * 0.88),
        }),
      },
      {
        zone: 4,
        name: 'SP-1: Lactate Tolerance',
        alias: 'High Aerobic Power',
        lowerPct: 89,
        upperPct: 95,
        description: 'Race pace repeats with partial recovery (e.g. 8x50m on 30s rest). Stresses buffer capacity.',
        color: '#ff9100',
        calcRange: (maxHr) => ({
          minHr: Math.round(maxHr * 0.88) + 1,
          maxHr: Math.round(maxHr * 0.95),
        }),
      },
      {
        zone: 5,
        name: 'SP-2 / SP-3: Sprint & Peak Power',
        alias: 'Maximal Anaerobic Sprint',
        lowerPct: 96,
        upperPct: 100,
        description: 'All-out anaerobic capacity (15m–50m bursts) with full passive recovery between reps.',
        color: '#ff1744',
        calcRange: (maxHr) => ({
          minHr: Math.round(maxHr * 0.95) + 1,
          maxHr: Math.max(Math.round(maxHr * 0.95) + 1, Math.round(maxHr * 1.05)),
        }),
      },
    ],
  },
  {
    id: 'friel',
    name: 'Joe Friel Triathlon Swimming Model',
    shortName: 'Joe Friel LTHR',
    organization: 'Triathlete’s Training Bible',
    badge: 'Triathlon Pioneer Model',
    description:
      'The classic 5-zone model adapted for water. Anchored directly on your 1,000m Time Trial average heart rate (Swim LTHR).',
    referenceMethod: 'lthr',
    zones: [
      {
        zone: 1,
        name: 'Zone 1: Active Recovery',
        alias: 'Easy Aerobic',
        lowerPct: 65,
        upperPct: 84,
        description: '< 85% Swim LTHR. Warmup, technical stroke drills, and recovery flushing between intervals.',
        color: '#00e5ff',
        calcRange: (lthr) => ({
          minHr: Math.round(lthr * 0.55),
          maxHr: Math.round(lthr * 0.84),
        }),
      },
      {
        zone: 2,
        name: 'Zone 2: Aerobic Base',
        alias: 'Extensive Endurance',
        lowerPct: 85,
        upperPct: 89,
        description: '85–89% Swim LTHR. Base aerobic volume, long continuous swim intervals.',
        color: '#00b0ff',
        calcRange: (lthr) => ({
          minHr: Math.round(lthr * 0.84) + 1,
          maxHr: Math.round(lthr * 0.89),
        }),
      },
      {
        zone: 3,
        name: 'Zone 3: Tempo',
        alias: 'Aerobic Power',
        lowerPct: 90,
        upperPct: 94,
        description: '90–94% Swim LTHR. Half-Ironman / Olympic pacing; cruise sets with 15–20s rest.',
        color: '#ffea00',
        calcRange: (lthr) => ({
          minHr: Math.round(lthr * 0.89) + 1,
          maxHr: Math.round(lthr * 0.94),
        }),
      },
      {
        zone: 4,
        name: 'Zone 4: Sub-Threshold',
        alias: 'Lactate Threshold',
        lowerPct: 95,
        upperPct: 99,
        description: '95–99% Swim LTHR. Critical Swim Speed boundary; sustainable for roughly 30–45 minutes.',
        color: '#ff9100',
        calcRange: (lthr) => ({
          minHr: Math.round(lthr * 0.94) + 1,
          maxHr: Math.round(lthr * 0.99),
        }),
      },
      {
        zone: 5,
        name: 'Zone 5: VO2 Max & Anaerobic',
        alias: 'Super-Threshold Speed',
        lowerPct: 100,
        upperPct: 108,
        description: '100%+ Swim LTHR. Maximum speed intervals, short repeats (25m–100m) with full recovery.',
        color: '#ff1744',
        calcRange: (lthr) => ({
          minHr: Math.round(lthr * 0.99) + 1,
          maxHr: Math.max(Math.round(lthr * 0.99) + 1, Math.round(lthr * 1.08)),
        }),
      },
    ],
  },
];

interface SwimHeartRateProtocolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSwimLthr: number;
  currentMaxHr: number;
  onApplyProtocolZones?: (
    protocol: SwimProtocolId,
    zones: Record<number, { minHr: number; maxHr: number; rangeFormatted?: string }>,
    lthr: number
  ) => void;
  theme?: 'dark' | 'light';
}

export const SwimHeartRateProtocolsModal: React.FC<SwimHeartRateProtocolsModalProps> = ({
  isOpen,
  onClose,
  currentSwimLthr,
  currentMaxHr,
  onApplyProtocolZones,
  theme = 'dark',
}) => {
  const isLight = theme === 'light';
  const [selectedProtocolId, setSelectedProtocolId] = useState<SwimProtocolId>('btf');
  const [swimLthrInput, setSwimLthrInput] = useState<string>(String(currentSwimLthr || 156));
  const [swimMaxHrInput, setSwimMaxHrInput] = useState<string>(String(currentMaxHr ? currentMaxHr - 12 : 173));
  const [activeTab, setActiveTab] = useState<'protocols' | 'science' | 'testing'>('protocols');
  const [appliedSuccess, setAppliedSuccess] = useState(false);

  if (!isOpen) return null;

  const currentProtocol = SWIM_PROTOCOLS.find((p) => p.id === selectedProtocolId) || SWIM_PROTOCOLS[0];

  const effectiveLthr = Number(swimLthrInput) > 50 ? Number(swimLthrInput) : 156;
  const effectiveMaxHr = Number(swimMaxHrInput) > 50 ? Number(swimMaxHrInput) : 173;

  const calculatedZones = currentProtocol.zones.map((z) => {
    const baseValue = currentProtocol.referenceMethod === 'lthr' ? effectiveLthr : effectiveMaxHr;
    const range = z.calcRange(baseValue);
    return {
      ...z,
      minBpm: range.minHr,
      maxBpm: range.maxHr,
    };
  });

  const handleApply = () => {
    if (!onApplyProtocolZones) return;
    const zoneMap: Record<number, { minHr: number; maxHr: number; rangeFormatted?: string }> = {};
    calculatedZones.forEach((z) => {
      zoneMap[z.zone] = {
        minHr: z.minBpm,
        maxHr: z.maxBpm,
        rangeFormatted: `${z.minBpm} - ${z.maxBpm} bpm`,
      };
    });

    onApplyProtocolZones(selectedProtocolId, zoneMap, effectiveLthr);
    setAppliedSuccess(true);
    setTimeout(() => {
      setAppliedSuccess(false);
      onClose();
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div
        className={`relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden ${
          isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
        }`}
      >
        {/* Header */}
        <div className={`p-4 sm:p-5 border-b flex items-center justify-between shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/90 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center shrink-0">
              <Waves className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight text-white">
                  Swim Heart Rate Zone Protocols
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 uppercase tracking-wide">
                  USMS / BTF Guide
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Scientific guidelines and governing body standards for aquatic heart rate calibration
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className={`flex items-center gap-1 px-4 sm:px-5 pt-3 border-b text-xs font-bold ${
          isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900/40'
        }`}>
          {[
            { id: 'protocols', label: 'Protocols & Zone Calculator', icon: Award },
            { id: 'science', label: 'Why Swim HR is Different', icon: Info },
            { id: 'testing', label: 'Field Testing Methods', icon: BookOpen },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 pb-2.5 px-3 border-b-2 font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'border-cyan-400 text-cyan-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* TAB 1: PROTOCOLS & CALCULATOR */}
          {activeTab === 'protocols' && (
            <div className="space-y-4">
              {/* Protocol Selector Chips */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                  Select Standard Protocol
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {SWIM_PROTOCOLS.map((proto) => {
                    const isSelected = selectedProtocolId === proto.id;
                    return (
                      <button
                        key={proto.id}
                        type="button"
                        onClick={() => setSelectedProtocolId(proto.id)}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-cyan-500/15 border-cyan-400 shadow-md shadow-cyan-500/10'
                            : isLight
                            ? 'bg-white border-slate-200 hover:border-slate-300'
                            : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300">
                              {proto.badge}
                            </span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 stroke-[3]" />}
                          </div>
                          <h4 className="text-xs font-extrabold text-white mt-1.5">{proto.shortName}</h4>
                          <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{proto.organization}</p>
                        </div>
                        <span className="text-[9px] font-mono text-cyan-300 mt-2 block font-semibold">
                          Based on {proto.referenceMethod === 'lthr' ? 'Swim LTHR' : 'Swim Max HR'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Protocol Details Banner */}
              <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <span className="font-extrabold text-white text-xs block">{currentProtocol.name}</span>
                  <p className="text-[11px] text-slate-300 leading-relaxed">{currentProtocol.description}</p>
                </div>

                {/* Base HR input depending on reference method */}
                <div className="flex items-center gap-2 shrink-0 bg-slate-950 p-2 rounded-xl border border-slate-800">
                  <label className="text-[11px] font-bold text-slate-400 whitespace-nowrap">
                    {currentProtocol.referenceMethod === 'lthr' ? 'Swim LTHR:' : 'Swim Max HR:'}
                  </label>
                  <input
                    type="number"
                    min="90"
                    max="220"
                    value={currentProtocol.referenceMethod === 'lthr' ? swimLthrInput : swimMaxHrInput}
                    onChange={(e) =>
                      currentProtocol.referenceMethod === 'lthr'
                        ? setSwimLthrInput(e.target.value)
                        : setSwimMaxHrInput(e.target.value)
                    }
                    className="w-16 bg-slate-900 border border-cyan-500/50 rounded-lg px-2 py-1 text-xs font-mono font-bold text-cyan-300 text-center outline-none"
                  />
                  <span className="text-[10px] text-slate-500 font-mono">bpm</span>
                </div>
              </div>

              {/* Calculated Zone Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                    Calculated Swim Zones ({currentProtocol.shortName})
                  </h4>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Base: {currentProtocol.referenceMethod === 'lthr' ? `${effectiveLthr} bpm (LTHR)` : `${effectiveMaxHr} bpm (Max HR)`}
                  </span>
                </div>

                <div className="space-y-2">
                  {calculatedZones.map((z) => (
                    <div
                      key={z.zone}
                      className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors hover:border-slate-700"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div
                          className="w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shrink-0 mt-0.5 text-slate-950 shadow-xs"
                          style={{ backgroundColor: z.color }}
                        >
                          Z{z.zone}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-xs text-white">{z.name}</span>
                            <span className="text-[10px] font-semibold text-slate-400 font-mono">
                              ({z.lowerPct}% – {z.upperPct}%)
                            </span>
                          </div>
                          <span className="text-[10px] font-bold text-cyan-400 block">{z.alias}</span>
                          <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{z.description}</p>
                        </div>
                      </div>

                      <div className="text-right shrink-0 pl-9 sm:pl-0">
                        <span className="text-sm sm:text-base font-black font-mono text-white block">
                          {z.minBpm} – {z.maxBpm}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">bpm</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Apply Button */}
              {onApplyProtocolZones && (
                <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-800">
                  <p className="text-[11px] text-slate-400">
                    Apply these calculated boundaries to your profile&apos;s custom swim heart rate configuration.
                  </p>
                  <button
                    type="button"
                    onClick={handleApply}
                    className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:scale-95 text-slate-950 text-xs font-black flex items-center gap-2 transition-all shadow-md shadow-cyan-500/20 cursor-pointer shrink-0"
                  >
                    {appliedSuccess ? (
                      <>
                        <Check className="w-4 h-4 stroke-[3]" />
                        <span>Applied!</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Apply Protocol to My Profile</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: EXERCISE PHYSIOLOGY */}
          {activeTab === 'science' && (
            <div className="space-y-4 text-xs leading-relaxed text-slate-300">
              <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-start gap-3">
                <Info className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-cyan-300 text-xs">
                    The &ldquo;10 to 13 BPM Aquatic Offset&rdquo; Rule
                  </h4>
                  <p className="text-[11px] text-slate-300 mt-1">
                    In exercise physiology, an athlete&apos;s heart rate during swimming is almost universally lower than during running or cycling at the same relative biological exertion. Using running zones for swimming will lead you to over-train and overestimate intensity.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1.5">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" />
                    1. Horizontal / Prone Position
                  </span>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    When you swim horizontally, gravity is no longer pulling blood down toward your lower extremities. Venous blood returns to the heart much more easily (Frank-Starling law), resulting in a larger stroke volume per beat. Therefore, the heart pumps the same cardiac output with fewer beats per minute.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1.5">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" />
                    2. High Thermal Convection of Water
                  </span>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Water conducts heat roughly 24 times faster than air. In a pool (typically 25–28°C / 78–82°F), your body sheds heat rapidly. This prevents the cardiovascular drift and blood redistribution to the skin that drives heart rates upward during running.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1.5">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" />
                    3. Mammalian Diving Reflex
                  </span>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Submerging the face in water stimulates the ophthalmic branch of the trigeminal nerve. This triggers a parasympathetic vagal response that naturally slows heart rate (bradycardia) and redirects oxygenated blood toward critical organs.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1.5">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" />
                    4. Active Muscle Mass Proportion
                  </span>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Freestyle swimming relies predominantly on upper-body musculature (latissimus dorsi, pectoralis, deltoids). The total volume of active muscle tissue is smaller than the massive quadriceps and glutes recruited in running, requiring lower systemic oxygen throughput.
                  </p>
                </div>
              </div>

              {/* Summary table */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
                <h5 className="font-bold text-white text-xs mb-2">Discipline Heart Rate Threshold Benchmarks</h5>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-2">Sport</th>
                        <th className="p-2">Relative LTHR</th>
                        <th className="p-2">Example (185 Max HR)</th>
                        <th className="p-2">Primary Mechanism</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 font-medium">
                      <tr>
                        <td className="p-2 font-bold text-amber-400">Running</td>
                        <td className="p-2">100% (Baseline)</td>
                        <td className="p-2 font-mono">168 bpm</td>
                        <td className="p-2 text-slate-400">Upright gravity, whole-body impact</td>
                      </tr>
                      <tr>
                        <td className="p-2 font-bold text-orange-400">Cycling</td>
                        <td className="p-2">Run - 4 to 6 bpm</td>
                        <td className="p-2 font-mono">163 bpm</td>
                        <td className="p-2 text-slate-400">Seated, weight supported by saddle</td>
                      </tr>
                      <tr className="bg-cyan-500/10">
                        <td className="p-2 font-bold text-cyan-400">Swimming</td>
                        <td className="p-2 font-bold text-cyan-300">Run - 10 to 14 bpm</td>
                        <td className="p-2 font-mono font-bold text-cyan-300">154–156 bpm</td>
                        <td className="p-2 text-slate-300">Horizontal, cooling water, dive reflex</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TESTING PROTOCOLS */}
          {activeTab === 'testing' && (
            <div className="space-y-4 text-xs text-slate-300">
              <p className="text-[11px] text-slate-400">
                To accurately set your swim heart rate zones, use one of the three validated field testing protocols below. Ensure you wear a swim-capable chest strap (such as Garmin HRM-Pro or Polar Verity Sense) rather than relying solely on wrist optical sensors.
              </p>

              <div className="space-y-3">
                {/* Method 1: 1,000m Time Trial */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-white text-xs flex items-center gap-2">
                      <span className="w-5 h-5 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[11px] font-bold">
                        1
                      </span>
                      1,000m Time Trial Test (Gold Standard)
                    </span>
                    <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20 font-bold">
                      Most Accurate
                    </span>
                  </div>
                  <ul className="text-[11px] space-y-1.5 pl-6 list-disc text-slate-300">
                    <li><strong>Warm-up:</strong> 400m easy swim + 4x50m build to threshold pace + 100m easy.</li>
                    <li><strong>Main Set:</strong> 1,000m continuous swim at the highest sustainable, even pace (do not sprint the first 100m).</li>
                    <li><strong>Calculation:</strong> Your <strong>average heart rate over the final 500m</strong> of the 1,000m swim is your true <strong>Swim Lactate Threshold HR (Swim LTHR)</strong>.</li>
                  </ul>
                </div>

                {/* Method 2: 20-Minute / 30-Minute Continuous Swim */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-white text-xs flex items-center gap-2">
                      <span className="w-5 h-5 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[11px] font-bold">
                        2
                      </span>
                      30-Minute Time Trial Test (Joe Friel Protocol)
                    </span>
                    <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 font-bold">
                      Continuous Test
                    </span>
                  </div>
                  <ul className="text-[11px] space-y-1.5 pl-6 list-disc text-slate-300">
                    <li>Swim continuously for 30 minutes at your maximal sustainable endurance speed.</li>
                    <li>Hit the lap button on your watch at the 10-minute mark.</li>
                    <li>Your <strong>average heart rate during the final 20 minutes</strong> is your Swim LTHR.</li>
                  </ul>
                </div>

                {/* Method 3: 400m + 100m CSS Combined Benchmark */}
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-white text-xs flex items-center gap-2">
                      <span className="w-5 h-5 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[11px] font-bold">
                        3
                      </span>
                      Derived from CSS 400m / 100m Time Trials
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700 font-bold">
                      Zero Extra Testing
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 pl-6">
                    If you already performed the 400m and 100m all-out benchmark tests for your Critical Swim Speed (CSS), your average heart rate over the second half of the 400m test closely mirrors your threshold boundary (typically ~95–98% of your peak swim heart rate).
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`p-3.5 sm:p-4 border-t flex items-center justify-between shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}>
          <span className="text-[11px] text-slate-500 font-medium">
            Standards sourced from US Masters Swimming, British Triathlon, and Joe Friel.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
