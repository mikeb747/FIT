import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  User,
  Heart,
  Footprints,
  Bike,
  Waves,
  Activity,
  Check,
  RotateCcw,
  Sparkles,
  Info,
  ChevronLeft,
  ChevronRight,
  Settings as SettingsIcon,
  Smartphone,
  Sun,
  Moon,
  Pencil,
  Trophy,
  Wrench,
  AlertTriangle,
  ShieldAlert,
  Plus,
  Trash2,
  Calendar,
  Clock,
  Briefcase,
  Dumbbell,
  ShieldCheck,
} from 'lucide-react';
import type {
  AthleteProfile,
  AthleteInjury,
  WeeklyAvailabilityMatrix,
  DayOfWeek,
  BodyArea,
  InjuryStatus,
} from '../types/athlete';
import {
  formatSecondsToMinSec,
  parseMinSecToSeconds,
  calculateCss,
  getAthleteHeartRateZones,
  calculateAgeFromBirthDate,
  DEFAULT_INJURIES,
  DEFAULT_WEEKLY_AVAILABILITY,
} from '../types/athlete';
import type { TrainingGoal } from '../types/goals';
import { loadAthleteGoals, saveAthleteGoals } from '../utils/goalsStorage';
import { GoalsTab } from './GoalsTab';
import type { StravaActivity } from '../utils/stravaActivities';
import { classifyActivity } from '../utils/stravaActivities';

export type AppTheme = 'dark' | 'light';
export type DisplayDensity = number | 'standard' | 'compact' | 'comfortable';

export type ProfileTab = 'settings' | 'physiology' | 'swimming' | 'cycling' | 'running' | 'zones' | 'goals';

interface AthleteProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: AthleteProfile;
  onSaveProfile: (profile: AthleteProfile) => void;
  onResetDefaults: () => void;
  goals?: TrainingGoal[];
  onSaveGoals?: (goals: TrainingGoal[]) => void;
  initialTab?: ProfileTab;
  stravaActivities?: StravaActivity[];

  // Settings tab props
  theme?: AppTheme;
  onThemeChanged?: (theme: AppTheme) => void;
  displayDensity?: DisplayDensity;
  onDensityChanged?: (density: DisplayDensity) => void;
  brandTitle?: string;
  brandSubtitle?: string;
  onSaveBrand?: (title: string, subtitle: string) => void;
  onResetBrand?: () => void;
  heroEyebrow?: string;
  heroHeading?: string;
  heroDescription?: string;
  onSaveHeroText?: (eyebrow: string, heading: string, description: string) => void;
  onResetHeroText?: () => void;
}

export const AthleteProfileModal: React.FC<AthleteProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  onSaveProfile,
  onResetDefaults,
  goals: propGoals,
  onSaveGoals,
  initialTab,
  stravaActivities,
  theme = 'dark',
  onThemeChanged,
  displayDensity = 'standard',
  onDensityChanged,
  brandTitle = 'GymFIT',
  brandSubtitle = 'Workout Log & Strava Uploader',
  onSaveBrand,
  onResetBrand,
  heroEyebrow = 'LOG · PUBLISH · REPEAT',
  heroHeading = 'Ready to Train?',
  heroDescription = 'Log every set as you train, starting from last session’s weights. Finished sessions automatically compile into valid FIT files with native sets and reps.',
  onSaveHeroText,
  onResetHeroText,
}) => {
  const [activeTab, setActiveTab] = useState<ProfileTab>('settings');
  const [savedFeedback, setSavedFeedback] = useState(false);

  // Goals state
  const [goals, setGoals] = useState<TrainingGoal[]>(() => propGoals || loadAthleteGoals());
  const [initialGoalsSnapshot, setInitialGoalsSnapshot] = useState<string>(() =>
    JSON.stringify(propGoals || loadAthleteGoals())
  );

  // Settings tab local states
  const [tempTitle, setTempTitle] = useState(brandTitle);
  const [tempSubtitle, setTempSubtitle] = useState(brandSubtitle);
  const [isEditingBrand, setIsEditingBrand] = useState(false);
  const [brandSavedFeedback, setBrandSavedFeedback] = useState(false);

  const [tempHeroEyebrow, setTempHeroEyebrow] = useState(heroEyebrow);
  const [tempHeroHeading, setTempHeroHeading] = useState(heroHeading);
  const [tempHeroDescription, setTempHeroDescription] = useState(heroDescription);
  const [isEditingHeroText, setIsEditingHeroText] = useState(false);
  const [heroSavedFeedback, setHeroSavedFeedback] = useState(false);

  // Form states
  const [age, setAge] = useState(profile.age);
  const [birthDate, setBirthDate] = useState(profile.birthDate || '');
  const [heightCm, setHeightCm] = useState(profile.heightCm);
  const [weightKg, setWeightKg] = useState(profile.weightKg);
  const [maxHeartRate, setMaxHeartRate] = useState(profile.maxHeartRate);
  const [restingHeartRate, setRestingHeartRate] = useState(profile.restingHeartRate);
  const [periodization, setPeriodization] = useState<'0' | '3weeks' | '4weeks'>(
    profile.periodization || '4weeks'
  );

  // Running
  const [thresholdHeartRateRun, setThresholdHeartRateRun] = useState(profile.thresholdHeartRateRun);
  const [paceOutdoorStr, setPaceOutdoorStr] = useState(
    formatSecondsToMinSec(profile.thresholdPaceRunOutdoorSec)
  );
  const [paceTreadmillStr, setPaceTreadmillStr] = useState(
    formatSecondsToMinSec(profile.thresholdPaceRunTreadmillSec)
  );

  // Cycling
  const [thresholdHeartRateBike, setThresholdHeartRateBike] = useState(profile.thresholdHeartRateBike);
  const [bikeFtp, setBikeFtp] = useState(profile.bikeFtp);
  const [bikeCrankLengthMm, setBikeCrankLengthMm] = useState<number>(profile.bikeCrankLengthMm || 172.5);
  const [bikeCrankLengths, setBikeCrankLengths] = useState<Record<string, number>>(profile.bikeCrankLengths || {});
  const [newGearIdInput, setNewGearIdInput] = useState('');
  const [newGearLenInput, setNewGearLenInput] = useState('172.5');

  // Swimming
  const [swim100mStr, setSwim100mStr] = useState(
    formatSecondsToMinSec(profile.swim100mTimeSec)
  );
  const [swim400mStr, setSwim400mStr] = useState(
    formatSecondsToMinSec(profile.swim400mTimeSec)
  );
  const [swimPoolPaceStr, setSwimPoolPaceStr] = useState(
    formatSecondsToMinSec(profile.swimPoolPace100mSec)
  );
  const [swimOpenWaterPaceStr, setSwimOpenWaterPaceStr] = useState(
    formatSecondsToMinSec(profile.swimOpenWaterPace100mSec)
  );

  // Active Injuries & Physical Limitations
  const [injuries, setInjuries] = useState<AthleteInjury[]>(
    () => profile.injuries || DEFAULT_INJURIES
  );
  const [isAddingInjury, setIsAddingInjury] = useState(false);
  const [newInjuryName, setNewInjuryName] = useState('');
  const [newInjuryBodyArea, setNewInjuryBodyArea] = useState<BodyArea>('Calf');
  const [newInjurySide, setNewInjurySide] = useState<'left' | 'right' | 'bilateral' | 'center'>('left');
  const [newInjuryStatus, setNewInjuryStatus] = useState<InjuryStatus>('active');
  const [newInjuryPainLevel, setNewInjuryPainLevel] = useState<number>(3);
  const [newInjuryModifications, setNewInjuryModifications] = useState('');
  const [newInjuryRehab, setNewInjuryRehab] = useState('');
  const [newInjuryNotes, setNewInjuryNotes] = useState('');

  // Weekly Training Availability & Work Schedule
  const [weeklyAvailability, setWeeklyAvailability] = useState<WeeklyAvailabilityMatrix>(
    () => profile.weeklyAvailability || DEFAULT_WEEKLY_AVAILABILITY
  );

  const wasOpenRef = useRef(false);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const tabButtonRefs = useRef<Record<ProfileTab, HTMLButtonElement | null>>({
    settings: null,
    physiology: null,
    swimming: null,
    cycling: null,
    running: null,
    zones: null,
    goals: null,
  });

  const checkTabScroll = useCallback(() => {
    const el = tabsContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  const scrollActiveTabIntoView = useCallback((tab: ProfileTab) => {
    const btn = tabButtonRefs.current[tab];
    const container = tabsContainerRef.current;
    if (btn && container) {
      const containerRect = container.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();

      // If button right edge extends past container right edge, slide container right
      if (btnRect.right > containerRect.right - 8) {
        const diff = btnRect.right - containerRect.right + 28;
        container.scrollBy({ left: diff, behavior: 'smooth' });
      } else if (btnRect.left < containerRect.left + 8) {
        const diff = btnRect.left - containerRect.left - 28;
        container.scrollBy({ left: diff, behavior: 'smooth' });
      }
    }
    setTimeout(checkTabScroll, 300);
  }, [checkTabScroll]);

  const handleSelectTab = (tab: ProfileTab) => {
    setActiveTab(tab);
    setTimeout(() => {
      scrollActiveTabIntoView(tab);
    }, 40);
  };

  useEffect(() => {
    checkTabScroll();
    window.addEventListener('resize', checkTabScroll);
    return () => window.removeEventListener('resize', checkTabScroll);
  }, [checkTabScroll, isOpen, activeTab]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        scrollActiveTabIntoView(activeTab);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [activeTab, isOpen, scrollActiveTabIntoView]);

  const scrollTabs = (direction: 'left' | 'right') => {
    const el = tabsContainerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === 'left' ? -150 : 150, behavior: 'smooth' });
    setTimeout(checkTabScroll, 250);
  };

  // Synchronize when opening
  useEffect(() => {
    if (isOpen) {
      if (!wasOpenRef.current && initialTab) {
        setActiveTab(initialTab);
      }
      wasOpenRef.current = true;
      setBirthDate(profile.birthDate || '');
      const computed = calculateAgeFromBirthDate(profile.birthDate);
      setAge(computed !== null ? computed : profile.age);
      setHeightCm(profile.heightCm);
      setWeightKg(profile.weightKg);
      setMaxHeartRate(profile.maxHeartRate);
      setRestingHeartRate(profile.restingHeartRate);
      setPeriodization(profile.periodization || '4weeks');

      setThresholdHeartRateRun(profile.thresholdHeartRateRun);
      setPaceOutdoorStr(formatSecondsToMinSec(profile.thresholdPaceRunOutdoorSec));
      setPaceTreadmillStr(formatSecondsToMinSec(profile.thresholdPaceRunTreadmillSec));

      setThresholdHeartRateBike(profile.thresholdHeartRateBike);
      setBikeFtp(profile.bikeFtp);
      setBikeCrankLengthMm(profile.bikeCrankLengthMm || 172.5);
      setBikeCrankLengths(profile.bikeCrankLengths || {});

      setSwim100mStr(formatSecondsToMinSec(profile.swim100mTimeSec));
      setSwim400mStr(formatSecondsToMinSec(profile.swim400mTimeSec));
      setSwimPoolPaceStr(formatSecondsToMinSec(profile.swimPoolPace100mSec));
      setSwimOpenWaterPaceStr(formatSecondsToMinSec(profile.swimOpenWaterPace100mSec));

      setInjuries(profile.injuries || DEFAULT_INJURIES);
      setWeeklyAvailability(profile.weeklyAvailability || DEFAULT_WEEKLY_AVAILABILITY);

      setTempTitle(brandTitle);
      setTempSubtitle(brandSubtitle);
      setTempHeroEyebrow(heroEyebrow);
      setTempHeroHeading(heroHeading);
      setTempHeroDescription(heroDescription);

      const currentG = propGoals || loadAthleteGoals();
      setGoals(currentG);
      setInitialGoalsSnapshot(JSON.stringify(currentG));

      setSavedFeedback(false);
    } else {
      wasOpenRef.current = false;
    }
  }, [isOpen, profile, propGoals, initialTab, brandTitle, brandSubtitle, heroEyebrow, heroHeading, heroDescription]);

  // Detected bikes from imported Strava activities and saved crank length profiles
  const detectedBikes = useMemo(() => {
    const bikes = new Map<string, { gearId: string; name: string; activityCount: number }>();
    if (stravaActivities) {
      for (const act of stravaActivities) {
        if (act.gear_id) {
          const cat = classifyActivity(act).category;
          if (cat === 'Bike') {
            const existing = bikes.get(act.gear_id) || {
              gearId: act.gear_id,
              name: `Bike (${act.gear_id})`,
              activityCount: 0,
            };
            existing.activityCount += 1;
            bikes.set(act.gear_id, existing);
          }
        }
      }
    }
    for (const gearId of Object.keys(bikeCrankLengths)) {
      if (!bikes.has(gearId)) {
        bikes.set(gearId, { gearId, name: `Bike (${gearId})`, activityCount: 0 });
      }
    }
    return Array.from(bikes.values());
  }, [stravaActivities, bikeCrankLengths]);

  const numericDensity = typeof displayDensity === 'number'
    ? displayDensity
    : displayDensity === 'compact'
    ? 85
    : displayDensity === 'comfortable'
    ? 115
    : 100;

  // Injury Handlers
  const handleAddInjury = () => {
    if (!newInjuryName.trim()) return;
    const item: AthleteInjury = {
      id: `inj-${Date.now()}`,
      name: newInjuryName.trim(),
      bodyArea: newInjuryBodyArea,
      side: newInjurySide,
      status: newInjuryStatus,
      painLevel: newInjuryPainLevel,
      sportModifications: newInjuryModifications.trim() || 'No specific sport modifications noted.',
      rehabExercises: newInjuryRehab.trim() || undefined,
      notes: newInjuryNotes.trim() || undefined,
      dateDiagnosed: new Date().toISOString().split('T')[0],
    };
    setInjuries((prev) => [item, ...prev]);
    setIsAddingInjury(false);
    setNewInjuryName('');
    setNewInjuryModifications('');
    setNewInjuryRehab('');
    setNewInjuryNotes('');
  };

  const handleApplyInjuryPreset = (preset: {
    name: string;
    bodyArea: BodyArea;
    side: 'left' | 'right' | 'bilateral' | 'center';
    modifications: string;
    rehab: string;
  }) => {
    setNewInjuryName(preset.name);
    setNewInjuryBodyArea(preset.bodyArea);
    setNewInjurySide(preset.side);
    setNewInjuryModifications(preset.modifications);
    setNewInjuryRehab(preset.rehab);
    setIsAddingInjury(true);
  };

  const handleDeleteInjury = (id: string) => {
    setInjuries((prev) => prev.filter((i) => i.id !== id));
  };

  const handleUpdateInjuryStatus = (id: string, status: InjuryStatus) => {
    setInjuries((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status } : i))
    );
  };

  // Availability Matrix Handlers
  const handleToggleWorkday = (day: DayOfWeek) => {
    setWeeklyAvailability((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        isWorkday: !prev[day].isWorkday,
      },
    }));
  };

  const handleUpdateShift = (day: DayOfWeek, field: 'shiftStart' | 'shiftEnd', val: string) => {
    setWeeklyAvailability((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: val,
      },
    }));
  };

  const handleToggleAvailableWindow = (day: DayOfWeek, window: 'morning' | 'lunch' | 'evening' | 'anytime') => {
    setWeeklyAvailability((prev) => {
      const current = prev[day].availableWindows || [];
      const next = current.includes(window)
        ? current.filter((w) => w !== window)
        : [...current, window];
      return {
        ...prev,
        [day]: {
          ...prev[day],
          availableWindows: next,
        },
      };
    });
  };

  const handleToggleActivityPreference = (day: DayOfWeek, activity: string) => {
    setWeeklyAvailability((prev) => {
      const current = prev[day].preferredActivities || [];
      const next = current.includes(activity)
        ? current.filter((a) => a !== activity)
        : [...current, activity];
      return {
        ...prev,
        [day]: {
          ...prev[day],
          preferredActivities: next,
        },
      };
    });
  };

  const handleApplySchedulePreset = (preset: 'standard' | 'shift' | 'weekend') => {
    if (preset === 'standard') {
      setWeeklyAvailability(DEFAULT_WEEKLY_AVAILABILITY);
    } else if (preset === 'weekend') {
      setWeeklyAvailability({
        mon: { day: 'mon', label: 'Monday', shortLabel: 'Mon', isWorkday: true, shiftStart: '08:00', shiftEnd: '18:00', availableWindows: ['evening'], preferredActivities: ['Rest Day'] },
        tue: { day: 'tue', label: 'Tuesday', shortLabel: 'Tue', isWorkday: true, shiftStart: '08:00', shiftEnd: '18:00', availableWindows: ['evening'], preferredActivities: ['Track Run'] },
        wed: { day: 'wed', label: 'Wednesday', shortLabel: 'Wed', isWorkday: true, shiftStart: '08:00', shiftEnd: '18:00', availableWindows: ['evening'], preferredActivities: ['Swim Technique'] },
        thu: { day: 'thu', label: 'Thursday', shortLabel: 'Thu', isWorkday: true, shiftStart: '08:00', shiftEnd: '18:00', availableWindows: ['evening'], preferredActivities: ['Bike Intervals / Turbo'] },
        fri: { day: 'fri', label: 'Friday', shortLabel: 'Fri', isWorkday: true, shiftStart: '08:00', shiftEnd: '16:00', availableWindows: ['evening'], preferredActivities: ['Recovery Spin'] },
        sat: { day: 'sat', label: 'Saturday', shortLabel: 'Sat', isWorkday: false, availableWindows: ['morning', 'anytime'], preferredActivities: ['Long Ride', 'Gym / Strength'] },
        sun: { day: 'sun', label: 'Sunday', shortLabel: 'Sun', isWorkday: false, availableWindows: ['morning', 'anytime'], preferredActivities: ['Long Run'] },
      });
    } else {
      setWeeklyAvailability({
        mon: { day: 'mon', label: 'Monday', shortLabel: 'Mon', isWorkday: true, shiftStart: '07:00', shiftEnd: '15:30', availableWindows: ['evening'], preferredActivities: ['Gym / Strength'] },
        tue: { day: 'tue', label: 'Tuesday', shortLabel: 'Tue', isWorkday: true, shiftStart: '07:00', shiftEnd: '15:30', availableWindows: ['evening'], preferredActivities: ['Track Run'] },
        wed: { day: 'wed', label: 'Wednesday', shortLabel: 'Wed', isWorkday: false, availableWindows: ['morning', 'lunch', 'anytime'], preferredActivities: ['Long Ride'] },
        thu: { day: 'thu', label: 'Thursday', shortLabel: 'Thu', isWorkday: true, shiftStart: '12:00', shiftEnd: '20:30', availableWindows: ['morning'], preferredActivities: ['Swim Technique'] },
        fri: { day: 'fri', label: 'Friday', shortLabel: 'Fri', isWorkday: true, shiftStart: '12:00', shiftEnd: '20:30', availableWindows: ['morning'], preferredActivities: ['Tempo Run'] },
        sat: { day: 'sat', label: 'Saturday', shortLabel: 'Sat', isWorkday: false, availableWindows: ['morning', 'anytime'], preferredActivities: ['Long Run'] },
        sun: { day: 'sun', label: 'Sunday', shortLabel: 'Sun', isWorkday: false, availableWindows: ['morning', 'anytime'], preferredActivities: ['Recovery Spin', 'Core / Mobility'] },
      });
    }
  };

  // Compute dirty state (whether any physiology values, crank lengths, injuries, availability, or goals changed)
  const isDirty = useMemo(() => {
    if (!profile) return false;
    const initialOutdoorStr = formatSecondsToMinSec(profile.thresholdPaceRunOutdoorSec);
    const initialTreadmillStr = formatSecondsToMinSec(profile.thresholdPaceRunTreadmillSec);
    const initial100mStr = formatSecondsToMinSec(profile.swim100mTimeSec);
    const initial400mStr = formatSecondsToMinSec(profile.swim400mTimeSec);
    const initialPoolPaceStr = formatSecondsToMinSec(profile.swimPoolPace100mSec);
    const initialOpenWaterPaceStr = formatSecondsToMinSec(profile.swimOpenWaterPace100mSec);

    const arePhysiologyFieldsDirty =
      age !== profile.age ||
      heightCm !== profile.heightCm ||
      weightKg !== profile.weightKg ||
      maxHeartRate !== profile.maxHeartRate ||
      restingHeartRate !== profile.restingHeartRate ||
      periodization !== (profile.periodization || '4weeks') ||
      thresholdHeartRateRun !== profile.thresholdHeartRateRun ||
      paceOutdoorStr !== initialOutdoorStr ||
      paceTreadmillStr !== initialTreadmillStr ||
      thresholdHeartRateBike !== profile.thresholdHeartRateBike ||
      bikeFtp !== profile.bikeFtp ||
      bikeCrankLengthMm !== (profile.bikeCrankLengthMm || 172.5) ||
      JSON.stringify(bikeCrankLengths) !== JSON.stringify(profile.bikeCrankLengths || {}) ||
      swim100mStr !== initial100mStr ||
      swim400mStr !== initial400mStr ||
      swimPoolPaceStr !== initialPoolPaceStr ||
      swimOpenWaterPaceStr !== initialOpenWaterPaceStr;

    const areInjuriesDirty =
      JSON.stringify(injuries) !== JSON.stringify(profile.injuries || DEFAULT_INJURIES);
    const isAvailabilityDirty =
      JSON.stringify(weeklyAvailability) !==
      JSON.stringify(profile.weeklyAvailability || DEFAULT_WEEKLY_AVAILABILITY);

    const areGoalsDirty = JSON.stringify(goals) !== initialGoalsSnapshot;

    return arePhysiologyFieldsDirty || areInjuriesDirty || isAvailabilityDirty || areGoalsDirty;
  }, [
    profile,
    age,
    heightCm,
    weightKg,
    maxHeartRate,
    restingHeartRate,
    periodization,
    thresholdHeartRateRun,
    paceOutdoorStr,
    paceTreadmillStr,
    thresholdHeartRateBike,
    bikeFtp,
    bikeCrankLengthMm,
    bikeCrankLengths,
    swim100mStr,
    swim400mStr,
    swimPoolPaceStr,
    swimOpenWaterPaceStr,
    injuries,
    weeklyAvailability,
    goals,
    initialGoalsSnapshot,
  ]);

  if (!isOpen) return null;

  // Live CSS calculation
  const t100 = parseMinSecToSeconds(swim100mStr, 84);
  const t400 = parseMinSecToSeconds(swim400mStr, 355);
  const liveCss = calculateCss(t100, t400);

  // Live zones preview
  const previewProfile: AthleteProfile = {
    age,
    birthDate,
    heightCm,
    weightKg,
    maxHeartRate,
    restingHeartRate,
    periodization,
    thresholdHeartRateRun,
    thresholdPaceRunOutdoorSec: parseMinSecToSeconds(paceOutdoorStr, 232),
    thresholdPaceRunTreadmillSec: parseMinSecToSeconds(paceTreadmillStr, 228),
    thresholdHeartRateBike,
    bikeFtp,
    bikeCrankLengthMm,
    bikeCrankLengths,
    swim100mTimeSec: t100,
    swim400mTimeSec: t400,
    swimPoolPace100mSec: parseMinSecToSeconds(swimPoolPaceStr, 90),
    swimOpenWaterPace100mSec: parseMinSecToSeconds(swimOpenWaterPaceStr, 98),
    injuries,
    weeklyAvailability,
  };

  const previewRunZones = getAthleteHeartRateZones(previewProfile, 'run');

  const handleSave = () => {
    const updated: AthleteProfile = {
      age: Math.max(12, Math.min(100, Number(age) || 35)),
      birthDate: birthDate.trim() || undefined,
      heightCm: Math.max(100, Math.min(250, Number(heightCm) || 178)),
      weightKg: Math.max(30, Math.min(250, Number(weightKg) || 75)),
      maxHeartRate: Math.max(100, Math.min(230, Number(maxHeartRate) || 185)),
      restingHeartRate: Math.max(30, Math.min(120, Number(restingHeartRate) || 52)),
      periodization,

      thresholdHeartRateRun: Math.max(80, Math.min(220, Number(thresholdHeartRateRun) || 168)),
      thresholdPaceRunOutdoorSec: parseMinSecToSeconds(paceOutdoorStr, 232),
      thresholdPaceRunTreadmillSec: parseMinSecToSeconds(paceTreadmillStr, 228),

      thresholdHeartRateBike: Math.max(80, Math.min(220, Number(thresholdHeartRateBike) || 162)),
      bikeFtp: Math.max(50, Math.min(600, Number(bikeFtp) || 310)),
      bikeCrankLengthMm: Number(bikeCrankLengthMm) || 172.5,
      bikeCrankLengths: bikeCrankLengths || {},

      swim100mTimeSec: t100,
      swim400mTimeSec: t400,
      swimPoolPace100mSec: parseMinSecToSeconds(swimPoolPaceStr, 90),
      swimOpenWaterPace100mSec: parseMinSecToSeconds(swimOpenWaterPaceStr, 98),

      injuries,
      weeklyAvailability,
    };

    onSaveProfile(updated);
    saveAthleteGoals(goals);
    onSaveGoals?.(goals);
    setInitialGoalsSnapshot(JSON.stringify(goals));
    setSavedFeedback(true);
    setTimeout(() => {
      setSavedFeedback(false);
    }, 2000);
  };

  const handleReset = () => {
    setBikeCrankLengthMm(172.5);
    setBikeCrankLengths({});
    setInjuries(DEFAULT_INJURIES);
    setWeeklyAvailability(DEFAULT_WEEKLY_AVAILABILITY);
    onResetDefaults();
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  };

  const handleSaveBrandCustomization = () => {
    const finalTitle = tempTitle.trim() || 'GymFIT';
    const finalSub = tempSubtitle.trim() || 'Workout Log & Strava Uploader';
    onSaveBrand?.(finalTitle, finalSub);
    setIsEditingBrand(false);
    setBrandSavedFeedback(true);
    setTimeout(() => setBrandSavedFeedback(false), 2000);
  };

  const handleResetBrandDefaults = () => {
    onResetBrand?.();
    setTempTitle('GymFIT');
    setTempSubtitle('Workout Log & Strava Uploader');
    setIsEditingBrand(false);
  };

  const handleSaveStudioText = () => {
    const finalEyebrow = tempHeroEyebrow.trim() || 'LOG · PUBLISH · REPEAT';
    const finalHeading = tempHeroHeading.trim() || 'Ready to Train?';
    const finalDesc =
      tempHeroDescription.trim() ||
      'Log every set as you train, starting from last session’s weights. Finished sessions automatically compile into valid FIT files with native sets and reps.';
    onSaveHeroText?.(finalEyebrow, finalHeading, finalDesc);
    setIsEditingHeroText(false);
    setHeroSavedFeedback(true);
    setTimeout(() => setHeroSavedFeedback(false), 2000);
  };

  const handleResetStudioText = () => {
    onResetHeroText?.();
    setTempHeroEyebrow('LOG · PUBLISH · REPEAT');
    setTempHeroHeading('Ready to Train?');
    setTempHeroDescription(
      'Log every set as you train, starting from last session’s weights. Finished sessions automatically compile into valid FIT files with native sets and reps.'
    );
    setIsEditingHeroText(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-5 pt-3 sm:pt-5 bg-black/80 backdrop-blur-md animate-fade-in"
    >
      <div className={`w-full max-w-xl h-[88vh] sm:h-[86vh] border rounded-3xl p-4 sm:p-6 shadow-2xl flex flex-col gap-3.5 sm:gap-4 overflow-hidden ${
        theme === 'light' ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between pb-1.5 sm:pb-2 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 shrink-0">
              <SettingsIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h2 className={`text-base sm:text-lg font-black tracking-tight flex items-center gap-2 ${
                theme === 'light' ? 'text-slate-900' : 'text-white'
              }`}>
                <span>Settings</span>
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
              theme === 'light'
                ? 'bg-slate-100 text-slate-600 hover:text-slate-900'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation with Left/Right Scroll Arrows */}
        <div className={`relative flex items-center border-b shrink-0 pb-1 ${
          theme === 'light' ? 'border-slate-200' : 'border-slate-800/80'
        }`}>
          {/* Left Arrow Button / Indicator */}
          <button
            type="button"
            onClick={() => scrollTabs('left')}
            disabled={!canScrollLeft}
            aria-label="Scroll tabs left"
            className={`p-1.5 rounded-xl transition-all cursor-pointer mr-1 shrink-0 ${
              canScrollLeft
                ? theme === 'light'
                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                  : 'bg-slate-800 text-amber-400 hover:bg-slate-700 shadow-sm border border-slate-700'
                : 'text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-30'
            }`}
            title={canScrollLeft ? 'More tabs to the left' : undefined}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Scrollable Tab Strip */}
          <div
            ref={tabsContainerRef}
            onScroll={checkTabScroll}
            className="flex-1 flex items-center gap-1 overflow-x-auto scrollbar-none scroll-smooth py-0.5"
          >
            {/* Tab 0: Appearance */}
            <button
              ref={(el) => {
                tabButtonRefs.current.settings = el;
              }}
              type="button"
              onClick={() => handleSelectTab('settings')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'settings'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                  : theme === 'light'
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <SettingsIcon className="w-3.5 h-3.5 text-amber-400" />
              <span>Appearance</span>
            </button>

            {/* Tab 1: Athlete */}
            <button
              ref={(el) => {
                tabButtonRefs.current.physiology = el;
              }}
              type="button"
              onClick={() => handleSelectTab('physiology')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'physiology'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                  : theme === 'light'
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Heart className="w-3.5 h-3.5 text-rose-400" />
              <span>Athlete</span>
            </button>

            {/* Tab 2: Swim (Activity Order: Swim, Bike, Run) */}
            <button
              ref={(el) => {
                tabButtonRefs.current.swimming = el;
              }}
              type="button"
              onClick={() => handleSelectTab('swimming')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'swimming'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                  : theme === 'light'
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Waves className="w-3.5 h-3.5 text-sky-400" />
              <span>Swim</span>
            </button>

            {/* Tab 3: Bike (Activity Order: Swim, Bike, Run) */}
            <button
              ref={(el) => {
                tabButtonRefs.current.cycling = el;
              }}
              type="button"
              onClick={() => handleSelectTab('cycling')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'cycling'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                  : theme === 'light'
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Bike className="w-3.5 h-3.5 text-orange-400" />
              <span>Bike</span>
            </button>

            {/* Tab 4: Run (Activity Order: Swim, Bike, Run) */}
            <button
              ref={(el) => {
                tabButtonRefs.current.running = el;
              }}
              type="button"
              onClick={() => handleSelectTab('running')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'running'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                  : theme === 'light'
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Footprints className="w-3.5 h-3.5 text-amber-400" />
              <span>Run</span>
            </button>

            {/* Tab 5: Zones */}
            <button
              ref={(el) => {
                tabButtonRefs.current.zones = el;
              }}
              type="button"
              onClick={() => handleSelectTab('zones')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'zones'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                  : theme === 'light'
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>Zones</span>
            </button>

            {/* Tab 6: Goals */}
            <button
              ref={(el) => {
                tabButtonRefs.current.goals = el;
              }}
              type="button"
              onClick={() => handleSelectTab('goals')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'goals'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                  : theme === 'light'
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>Goals</span>
            </button>
          </div>

          {/* Right Arrow Button / Indicator */}
          <button
            type="button"
            onClick={() => scrollTabs('right')}
            disabled={!canScrollRight}
            aria-label="Scroll tabs right"
            className={`p-1.5 rounded-xl transition-all cursor-pointer ml-1 shrink-0 ${
              canScrollRight
                ? theme === 'light'
                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                  : 'bg-slate-800 text-amber-400 hover:bg-slate-700 shadow-sm border border-slate-700'
                : 'text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-30'
            }`}
            title={canScrollRight ? 'More tabs to the right' : undefined}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* TAB 0: SETTINGS (DARK/LIGHT, DENSITY, TITLE, STUDIO TEXT) */}
          {activeTab === 'settings' && (
            <div className="space-y-3.5">
              {/* 1. Theme Switch */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs uppercase font-extrabold tracking-wider text-slate-300">
                      Theme / Appearance
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Switch between high-contrast dark and light modes
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onThemeChanged?.('dark')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                      theme === 'dark'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-md shadow-amber-500/10'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5 text-amber-400" />
                    <span>Dark Mode</span>
                    {theme === 'dark' && <Check className="w-3.5 h-3.5 text-amber-400 ml-auto" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => onThemeChanged?.('light')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                      theme === 'light'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-md shadow-amber-500/10'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span>Light Mode</span>
                    {theme === 'light' && <Check className="w-3.5 h-3.5 text-amber-400 ml-auto" />}
                  </button>
                </div>
              </div>

              {/* 2. Display Density */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs uppercase font-extrabold tracking-wider text-slate-300">
                      Display Density &amp; UI Scaling
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Adjust UI scaling smoothly in 5% steps from 70% to 130%
                    </p>
                  </div>
                  <Smartphone className="w-4 h-4 text-amber-400 shrink-0" />
                </div>

                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400">Current Scale</span>
                    <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                      {numericDensity}%
                    </span>
                  </div>

                  <input
                    type="range"
                    min="70"
                    max="130"
                    step="5"
                    value={numericDensity}
                    onChange={(e) => onDensityChanged?.(Number(e.target.value))}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />

                  {/* Markers for Dense 85%, Standard 100%, and Spacious 115% */}
                  <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                    <button
                      type="button"
                      onClick={() => onDensityChanged?.(85)}
                      className={`py-1.5 px-2 rounded-xl border text-xs transition-all cursor-pointer ${
                        numericDensity === 85
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500 font-bold shadow-sm'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <span className="font-bold block">Dense</span>
                      <span className="text-[10px] text-slate-500 font-mono">85%</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDensityChanged?.(100)}
                      className={`py-1.5 px-2 rounded-xl border text-xs transition-all cursor-pointer ${
                        numericDensity === 100
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500 font-bold shadow-sm'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <span className="font-bold block">Standard</span>
                      <span className="text-[10px] text-slate-500 font-mono">100%</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDensityChanged?.(115)}
                      className={`py-1.5 px-2 rounded-xl border text-xs transition-all cursor-pointer ${
                        numericDensity === 115
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500 font-bold shadow-sm'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <span className="font-bold block">Spacious</span>
                      <span className="text-[10px] text-slate-500 font-mono">115%</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. App Title & Branding */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs uppercase font-extrabold tracking-wider text-slate-300">
                      App Title & Branding
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Customize the name displayed on the header
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEditingBrand(!isEditingBrand)}
                    className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>{isEditingBrand ? 'Close' : 'Edit'}</span>
                  </button>
                </div>

                {!isEditingBrand ? (
                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-bold text-white block">{brandTitle}</span>
                      <span className="text-xs text-slate-400">{brandSubtitle}</span>
                    </div>
                    {brandSavedFeedback && (
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Saved
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2.5 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                        App Title
                      </label>
                      <input
                        type="text"
                        value={tempTitle}
                        onChange={(e) => setTempTitle(e.target.value)}
                        placeholder="e.g. GymFIT"
                        className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm focus:outline-none focus:border-amber-400 font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                        Subtitle / Tagline
                      </label>
                      <input
                        type="text"
                        value={tempSubtitle}
                        onChange={(e) => setTempSubtitle(e.target.value)}
                        placeholder="e.g. Workout Log & Strava Uploader"
                        className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleResetBrandDefaults}
                        className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset Default</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveBrandCustomization}
                        className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 cursor-pointer"
                      >
                        Save Title
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Customize Studio Text */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs uppercase font-extrabold tracking-wider text-slate-300">
                      Customize Studio Text
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Headline & description on the main dashboard
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEditingHeroText(!isEditingHeroText)}
                    className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>{isEditingHeroText ? 'Close' : 'Edit'}</span>
                  </button>
                </div>

                {!isEditingHeroText ? (
                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400 block font-mono">
                        {heroEyebrow}
                      </span>
                      <span className="text-sm font-bold text-white block">{heroHeading}</span>
                      <span className="text-xs text-slate-400 line-clamp-1 block">{heroDescription}</span>
                    </div>
                    {heroSavedFeedback && (
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1 shrink-0 ml-2">
                        <Check className="w-3.5 h-3.5" /> Saved
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2.5 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                        Eyebrow Label
                      </label>
                      <input
                        type="text"
                        value={tempHeroEyebrow}
                        onChange={(e) => setTempHeroEyebrow(e.target.value)}
                        placeholder="e.g. LOG · PUBLISH · REPEAT"
                        className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-amber-400 text-xs font-bold uppercase tracking-wider focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                        Main Heading
                      </label>
                      <input
                        type="text"
                        value={tempHeroHeading}
                        onChange={(e) => setTempHeroHeading(e.target.value)}
                        placeholder="e.g. Ready to Train?"
                        className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm font-bold focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                        Description Text
                      </label>
                      <textarea
                        rows={2}
                        value={tempHeroDescription}
                        onChange={(e) => setTempHeroDescription(e.target.value)}
                        placeholder="e.g. Log every set as you train..."
                        className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-amber-400 resize-none leading-relaxed"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleResetStudioText}
                        className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset Default</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveStudioText}
                        className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 cursor-pointer"
                      >
                        Save Studio Text
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 1: GENERAL PHYSIOLOGY */}
          {activeTab === 'physiology' && (
            <div className="space-y-3.5">
              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p>
                  Your age, height, weight, and heart rate extremes determine Heart Rate Reserve (Karvonen formula), recovery rates, and caloric expenditure estimates.
                </p>
              </div>

              {/* Row 1: Date of Birth & Age (Always 2 columns side-by-side on mobile without stretching) */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {/* Date of Birth: Editable */}
                <div className="p-2.5 sm:p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">Date of Birth</label>
                    <span className="text-[10px] text-amber-400 font-medium">Editable</span>
                  </div>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBirthDate(val);
                      const computed = calculateAgeFromBirthDate(val);
                      if (computed !== null) setAge(computed);
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-bold font-mono text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                {/* Age: Read-only derived from Date of Birth */}
                <div className="p-2.5 sm:p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex flex-col gap-1.5 opacity-80">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-400">Age</label>
                    <span className="text-[10px] text-slate-500">From DoB</span>
                  </div>
                  <div className="w-full bg-slate-900/60 border border-slate-800 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 text-sm font-bold font-mono text-slate-400 select-none flex items-center justify-between">
                    <span>{age} <span className="text-xs text-slate-500 font-sans font-normal">yrs</span></span>
                    <span className="text-[10px] text-slate-500 font-sans">Read-only</span>
                  </div>
                </div>
              </div>

              {/* Row 2: Height & Weight (Always 2 columns side-by-side on mobile without stretching) */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="p-2.5 sm:p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-300">Height</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="100"
                      max="240"
                      value={heightCm}
                      onChange={(e) => setHeightCm(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 text-sm font-bold font-mono text-white focus:outline-none focus:border-amber-400"
                    />
                    <span className="text-xs text-slate-500 font-mono">cm</span>
                  </div>
                </div>

                <div className="p-2.5 sm:p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-300">Weight</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="35"
                      max="200"
                      step="0.5"
                      value={weightKg}
                      onChange={(e) => setWeightKg(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 text-sm font-bold font-mono text-white focus:outline-none focus:border-amber-400"
                    />
                    <span className="text-xs text-slate-500 font-mono">kg</span>
                  </div>
                </div>
              </div>

              {/* Row 3: Max HR & Resting HR (Always 2 columns side-by-side on mobile without stretching) */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="p-2.5 sm:p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-rose-300">Max HR</label>
                    <span className="text-[10px] text-slate-500">Peak</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="120"
                      max="230"
                      value={maxHeartRate}
                      onChange={(e) => setMaxHeartRate(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 text-sm font-bold font-mono text-white focus:outline-none focus:border-amber-400"
                    />
                    <span className="text-xs text-slate-500 font-mono">bpm</span>
                  </div>
                </div>

                <div className="p-2.5 sm:p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-sky-300">Resting HR</label>
                    <span className="text-[10px] text-slate-500">Wake</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="30"
                      max="110"
                      value={restingHeartRate}
                      onChange={(e) => setRestingHeartRate(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 text-sm font-bold font-mono text-white focus:outline-none focus:border-amber-400"
                    />
                    <span className="text-xs text-slate-500 font-mono">bpm</span>
                  </div>
                </div>
              </div>

              {/* Training Periodization Cycle (Always 3 columns side-by-side on mobile without stretching) */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-amber-300 uppercase tracking-wide">
                    Training Periodization Cycle
                  </label>
                  <span className="text-[10px] text-slate-500">Macrocycle</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => setPeriodization('0')}
                    className={`p-2 sm:p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      periodization === '0'
                        ? 'bg-amber-500/15 border-amber-500 text-white shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-extrabold text-xs text-white">0 Wks</div>
                    <div className="text-[10px] sm:text-[11px] text-amber-300 font-semibold mt-0.5 truncate">Constant</div>
                    <div className="text-[9px] sm:text-[10px] text-slate-400 mt-1 leading-snug line-clamp-2">
                      Continuous overload without de-load.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPeriodization('3weeks')}
                    className={`p-2 sm:p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      periodization === '3weeks'
                        ? 'bg-amber-500/15 border-amber-500 text-white shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-extrabold text-xs text-white">3 Wks</div>
                    <div className="text-[10px] sm:text-[11px] text-amber-300 font-semibold mt-0.5 truncate">2 Build + 1 Easy</div>
                    <div className="text-[9px] sm:text-[10px] text-slate-400 mt-1 leading-snug line-clamp-2">
                      Easy week every 3 weeks.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPeriodization('4weeks')}
                    className={`p-2 sm:p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      periodization === '4weeks'
                        ? 'bg-amber-500/15 border-amber-500 text-white shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-extrabold text-xs text-white">4 Wks</div>
                    <div className="text-[10px] sm:text-[11px] text-amber-300 font-semibold mt-0.5 truncate">3 Build + 1 Easy</div>
                    <div className="text-[9px] sm:text-[10px] text-slate-400 mt-1 leading-snug line-clamp-2">
                      3 progressive + 1 recovery.
                    </div>
                  </button>
                </div>
              </div>

              {/* SECTION: CURRENT INJURIES & PHYSICAL LIMITATIONS */}
              <div className={`p-3.5 sm:p-4 rounded-2xl border space-y-3 ${
                theme === 'light' ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-950 border-slate-800'
              }`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-500" />
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className={`text-xs font-black uppercase tracking-wider ${
                          theme === 'light' ? 'text-rose-600' : 'text-rose-400'
                        }`}>
                          Current Injuries &amp; Physical Limitations
                        </h4>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30">
                          {injuries.filter((i) => i.status === 'active').length} Active
                        </span>
                      </div>
                      <p className={`text-[11px] mt-0.5 ${theme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>
                        Track active musculoskeletal issues, joint limitations, sport modification rules (e.g. pull buoy swimming during calf strain), and rehab exercises.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsAddingInjury(!isAddingInjury)}
                    className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1 transition-all shadow-xs cursor-pointer active:scale-95 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>{isAddingInjury ? 'Close Form' : 'Log Injury / Limitation'}</span>
                  </button>
                </div>

                {/* Quick Preset Buttons */}
                <div className="space-y-1 pt-1">
                  <span className={`text-[10px] font-bold uppercase tracking-wider block ${
                    theme === 'light' ? 'text-slate-500' : 'text-slate-500'
                  }`}>
                    Quick Presets:
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[
                      {
                        name: 'Soleus / Calf Strain',
                        bodyArea: 'Calf' as BodyArea,
                        side: 'left' as const,
                        modifications: 'Pull buoy swimming only during calf strain (no wall push-offs or kicking). Low-cadence high-torque cycling restricted. Soft-surface run only under 30min.',
                        rehab: 'Bent-knee seated calf raises (3x15 @ 20kg), eccentric heel drops on step, light isometric wall sits.',
                      },
                      {
                        name: 'Patellofemoral / Runner’s Knee',
                        bodyArea: 'Knee' as BodyArea,
                        side: 'right' as const,
                        modifications: 'Cadence above 90rpm on bike (no standing out of saddle). Flat road running only; avoid downhill trails. No breaststroke kick.',
                        rehab: 'Terminal knee extensions with band, Spanish squats 4x45s, glute medius side planks.',
                      },
                      {
                        name: 'Achilles Tendinopathy',
                        bodyArea: 'Achilles' as BodyArea,
                        side: 'left' as const,
                        modifications: 'Zero track spikes or speed intervals. Heel lifts in cycling & running shoes. Soft-surface trail jogging.',
                        rehab: 'Heavy slow resistance straight-leg heel raises (4x8 @ 3s tempo), Alfredson eccentric protocol.',
                      },
                      {
                        name: 'Plantar Fasciitis',
                        bodyArea: 'Foot / Plantar' as BodyArea,
                        side: 'right' as const,
                        modifications: 'Supportive running shoes with custom orthotics; strictly no barefoot walking. Cross-train with pool swimming and spin.',
                        rehab: 'Frozen water bottle foot rolling, windlass stretch 3x30s, toe towel scrunches.',
                      },
                      {
                        name: 'Swimmer’s Shoulder (Impingement)',
                        bodyArea: 'Shoulder' as BodyArea,
                        side: 'right' as const,
                        modifications: 'No hand paddles or buoyancy shorts drag. Snorkel drill swimming to maintain neutral neck. Normal bike & run volume.',
                        rehab: 'Scapular push-ups, face pulls with external rotation (3x15), latissimus dorsi foam rolling.',
                      },
                      {
                        name: 'Lower Back / SI Joint Irritation',
                        bodyArea: 'Lower Back' as BodyArea,
                        side: 'center' as const,
                        modifications: 'Upright hood position on road bike; avoid aggressive aero TT bars. Neutral spine strength training; avoid heavy deadlifts.',
                        rehab: 'McGill Big 3 (Bird-dog, side plank, curl-up), cat-camel mobility, hip flexor stretches.',
                      },
                    ].map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => handleApplyInjuryPreset(p)}
                        className={`text-[10px] px-2 py-0.5 rounded-lg border font-semibold transition-colors cursor-pointer ${
                          theme === 'light'
                            ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                            : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                        }`}
                      >
                        + {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Expandable Add Injury Form */}
                {isAddingInjury && (
                  <div className={`p-3 sm:p-4 rounded-xl border space-y-3 ${
                    theme === 'light' ? 'bg-slate-50 border-rose-200' : 'bg-slate-900/90 border-rose-500/30'
                  }`}>
                    <div className="flex items-center justify-between border-b pb-2 border-rose-500/20">
                      <span className="text-xs font-bold text-rose-500 flex items-center gap-1.5">
                        <Plus className="w-3.5 h-3.5" />
                        Log New Injury / Physical Limitation
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsAddingInjury(false)}
                        className={`text-[11px] hover:text-rose-500 cursor-pointer ${
                          theme === 'light' ? 'text-slate-500' : 'text-slate-400'
                        }`}
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="sm:col-span-2 space-y-1">
                        <label className={`text-[11px] font-bold ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>
                          Injury / Limitation Name
                        </label>
                        <input
                          type="text"
                          value={newInjuryName}
                          onChange={(e) => setNewInjuryName(e.target.value)}
                          placeholder="e.g. Left Soleus Strain or Patellofemoral Pain"
                          className={`w-full rounded-xl px-2.5 py-1.5 text-xs font-medium border ${
                            theme === 'light'
                              ? 'bg-white border-slate-300 text-slate-900'
                              : 'bg-slate-950 border-slate-700 text-white'
                          }`}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className={`text-[11px] font-bold ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>
                          Body Area
                        </label>
                        <select
                          value={newInjuryBodyArea}
                          onChange={(e) => setNewInjuryBodyArea(e.target.value as BodyArea)}
                          className={`w-full rounded-xl px-2 py-1.5 text-xs font-medium border cursor-pointer ${
                            theme === 'light'
                              ? 'bg-white border-slate-300 text-slate-900'
                              : 'bg-slate-950 border-slate-700 text-white'
                          }`}
                        >
                          {[
                            'Calf',
                            'Achilles',
                            'Knee',
                            'Hamstring',
                            'Quadriceps',
                            'Hip / Glute',
                            'Lower Back',
                            'Shoulder',
                            'Foot / Plantar',
                            'Ankle',
                            'Neck / Upper Back',
                            'Elbow / Wrist',
                            'Other',
                          ].map((area) => (
                            <option key={area} value={area}>
                              {area}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className={`text-[11px] font-bold ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>
                          Side
                        </label>
                        <select
                          value={newInjurySide}
                          onChange={(e) => setNewInjurySide(e.target.value as any)}
                          className={`w-full rounded-xl px-2 py-1.5 text-xs font-medium border cursor-pointer ${
                            theme === 'light'
                              ? 'bg-white border-slate-300 text-slate-900'
                              : 'bg-slate-950 border-slate-700 text-white'
                          }`}
                        >
                          <option value="left">Left</option>
                          <option value="right">Right</option>
                          <option value="bilateral">Bilateral (Both)</option>
                          <option value="center">Central / Midline</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className={`text-[11px] font-bold ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>
                          Status
                        </label>
                        <select
                          value={newInjuryStatus}
                          onChange={(e) => setNewInjuryStatus(e.target.value as InjuryStatus)}
                          className={`w-full rounded-xl px-2 py-1.5 text-xs font-bold border cursor-pointer ${
                            theme === 'light'
                              ? 'bg-white border-slate-300 text-slate-900'
                              : 'bg-slate-950 border-slate-700 text-white'
                          }`}
                        >
                          <option value="active">Active (Restricted)</option>
                          <option value="monitoring">Monitoring (Cautious)</option>
                          <option value="recovering">Recovering (Progressing)</option>
                          <option value="cleared">Cleared (Resolved)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className={`text-[11px] font-bold ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>
                          Pain Scale (0-10)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="10"
                          value={newInjuryPainLevel}
                          onChange={(e) => setNewInjuryPainLevel(Math.min(10, Math.max(0, Number(e.target.value))))}
                          className={`w-full rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold border ${
                            theme === 'light'
                              ? 'bg-white border-slate-300 text-slate-900'
                              : 'bg-slate-950 border-slate-700 text-white'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className={`text-[11px] font-bold flex items-center justify-between ${
                        theme === 'light' ? 'text-slate-800' : 'text-slate-200'
                      }`}>
                        <span>Sport Modification Rules</span>
                        <span className="text-[10px] font-normal text-slate-500">How training must adapt</span>
                      </label>
                      <textarea
                        rows={2}
                        value={newInjuryModifications}
                        onChange={(e) => setNewInjuryModifications(e.target.value)}
                        placeholder="e.g. Pull buoy swimming only during calf strain (no wall push-offs or kicking). Low-cadence torque bike restricted. Soft-surface run only under 30min."
                        className={`w-full rounded-xl px-2.5 py-1.5 text-xs border leading-relaxed resize-none ${
                          theme === 'light'
                            ? 'bg-white border-slate-300 text-slate-900'
                            : 'bg-slate-950 border-slate-700 text-white'
                        }`}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className={`text-[11px] font-bold flex items-center justify-between ${
                        theme === 'light' ? 'text-slate-800' : 'text-slate-200'
                      }`}>
                        <span>Prescribed Rehab Exercises</span>
                        <span className="text-[10px] font-normal text-slate-500">Physio / strength protocol</span>
                      </label>
                      <textarea
                        rows={2}
                        value={newInjuryRehab}
                        onChange={(e) => setNewInjuryRehab(e.target.value)}
                        placeholder="e.g. Bent-knee seated calf raises (3x15 @ 20kg), eccentric heel drops on step, light isometric wall sits."
                        className={`w-full rounded-xl px-2.5 py-1.5 text-xs border leading-relaxed resize-none ${
                          theme === 'light'
                            ? 'bg-white border-slate-300 text-slate-900'
                            : 'bg-slate-950 border-slate-700 text-white'
                        }`}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className={`text-[11px] font-bold ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>
                        Clinical Notes / Context (Optional)
                      </label>
                      <input
                        type="text"
                        value={newInjuryNotes}
                        onChange={(e) => setNewInjuryNotes(e.target.value)}
                        placeholder="e.g. Flare-up after track session. Ultrasound confirmed minor grade-1 strain."
                        className={`w-full rounded-xl px-2.5 py-1.5 text-xs border ${
                          theme === 'light'
                            ? 'bg-white border-slate-300 text-slate-900'
                            : 'bg-slate-950 border-slate-700 text-white'
                        }`}
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsAddingInjury(false)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                          theme === 'light' ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleAddInjury}
                        disabled={!newInjuryName.trim()}
                        className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-900/30 cursor-pointer disabled:opacity-40"
                      >
                        Save Injury Record
                      </button>
                    </div>
                  </div>
                )}

                {/* List of Injuries */}
                {injuries.length === 0 ? (
                  <div className={`p-4 rounded-xl border text-center space-y-1.5 ${
                    theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-900/40 border-slate-800 text-slate-400'
                  }`}>
                    <ShieldCheck className="w-5 h-5 mx-auto text-emerald-500" />
                    <span className={`text-xs font-bold block ${theme === 'light' ? 'text-slate-800' : 'text-slate-200'}`}>
                      No Active Injuries or Physical Limitations
                    </span>
                    <p className="text-[11px] max-w-sm mx-auto">
                      All disciplines (Swim, Bike, Run) cleared for full training load. Use the button above to log active restrictions if any arise.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {injuries.map((inj) => {
                      const isActive = inj.status === 'active';
                      const isMonitoring = inj.status === 'monitoring';
                      const isRecovering = inj.status === 'recovering';
                      const isCleared = inj.status === 'cleared';

                      const borderBadge = isActive
                        ? theme === 'light'
                          ? 'border-rose-300 bg-rose-50/60'
                          : 'border-rose-500/40 bg-rose-950/20'
                        : isMonitoring
                        ? theme === 'light'
                          ? 'border-amber-300 bg-amber-50/60'
                          : 'border-amber-500/40 bg-amber-950/20'
                        : isRecovering
                        ? theme === 'light'
                          ? 'border-sky-300 bg-sky-50/60'
                          : 'border-sky-500/40 bg-sky-950/20'
                        : theme === 'light'
                        ? 'border-emerald-300 bg-emerald-50/60'
                        : 'border-emerald-500/40 bg-emerald-950/20';

                      return (
                        <div
                          key={inj.id}
                          className={`p-3 rounded-2xl border transition-all space-y-2.5 ${borderBadge}`}
                        >
                          {/* Card Header */}
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-black ${
                                  theme === 'light' ? 'text-slate-900' : 'text-white'
                                }`}>
                                  {inj.name}
                                </span>
                                {inj.side && (
                                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.2 rounded border ${
                                    theme === 'light' ? 'bg-slate-100 text-slate-700 border-slate-300' : 'bg-slate-800 text-slate-300 border-slate-700'
                                  }`}>
                                    {inj.side}
                                  </span>
                                )}
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                                  {inj.bodyArea}
                                </span>
                                {inj.painLevel !== undefined && (
                                  <span className="text-[10px] font-mono text-slate-500">
                                    Pain: <strong className="text-amber-500">{inj.painLevel}</strong>/10
                                  </span>
                                )}
                              </div>
                              {inj.dateDiagnosed && (
                                <span className="text-[10px] text-slate-500 block mt-0.5">
                                  Diagnosed / Logged: {inj.dateDiagnosed}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* Status Quick Pill Switcher */}
                              <select
                                value={inj.status}
                                onChange={(e) => handleUpdateInjuryStatus(inj.id, e.target.value as InjuryStatus)}
                                className={`text-[11px] font-bold rounded-lg px-2 py-1 border cursor-pointer ${
                                  isActive
                                    ? 'bg-rose-500 text-white border-rose-600'
                                    : isMonitoring
                                    ? 'bg-amber-500 text-slate-950 border-amber-600'
                                    : isRecovering
                                    ? 'bg-sky-500 text-white border-sky-600'
                                    : 'bg-emerald-600 text-white border-emerald-700'
                                }`}
                              >
                                <option value="active">Active</option>
                                <option value="monitoring">Monitoring</option>
                                <option value="recovering">Recovering</option>
                                <option value="cleared">Cleared</option>
                              </select>

                              <button
                                type="button"
                                onClick={() => handleDeleteInjury(inj.id)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer transition-colors"
                                title="Delete injury record"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Sport Modification Rules Box */}
                          <div className={`p-2.5 rounded-xl border text-xs leading-relaxed space-y-1 ${
                            isActive
                              ? theme === 'light'
                                ? 'bg-rose-100/70 border-rose-300 text-rose-950'
                                : 'bg-rose-950/40 border-rose-500/30 text-rose-200'
                              : theme === 'light'
                              ? 'bg-amber-50 border-amber-200 text-amber-950'
                              : 'bg-amber-950/30 border-amber-500/30 text-amber-200'
                          }`}>
                            <div className="flex items-center gap-1.5 font-bold text-[11px] uppercase tracking-wide">
                              <ShieldAlert className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                              <span>Sport Modification Rules:</span>
                            </div>
                            <p className="pl-5 text-xs font-medium">
                              {inj.sportModifications}
                            </p>
                          </div>

                          {/* Rehab Exercises Box */}
                          {inj.rehabExercises && (
                            <div className={`p-2.5 rounded-xl border text-xs leading-relaxed space-y-1 ${
                              theme === 'light'
                                ? 'bg-slate-100 border-slate-200 text-slate-800'
                                : 'bg-slate-900/60 border-slate-800 text-slate-300'
                            }`}>
                              <div className="flex items-center gap-1.5 font-bold text-[11px] text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                                <Dumbbell className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                <span>Prescribed Rehab Protocol:</span>
                              </div>
                              <p className="pl-5 text-xs">
                                {inj.rehabExercises}
                              </p>
                            </div>
                          )}

                          {/* Notes */}
                          {inj.notes && (
                            <div className="text-[11px] text-slate-500 italic pl-1">
                              Note: {inj.notes}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* SECTION: TRAINING AVAILABILITY & WORK SCHEDULE MATRIX */}
              <div className={`p-3.5 sm:p-4 rounded-2xl border space-y-3.5 ${
                theme === 'light' ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-950 border-slate-800'
              }`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-amber-500" />
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className={`text-xs font-black uppercase tracking-wider ${
                          theme === 'light' ? 'text-slate-900' : 'text-white'
                        }`}>
                          Training Availability &amp; Work Schedule
                        </h4>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                          Weekly Matrix
                        </span>
                      </div>
                      <p className={`text-[11px] mt-0.5 ${theme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>
                        Weekly availability matrix: preferred days for specific activity types (e.g. Long Ride on Saturday, Track Run on Tuesday), workday designations, and work shift start/finish times to fit morning vs evening sessions.
                      </p>
                    </div>
                  </div>

                  {/* Schedule Presets */}
                  <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Presets:</span>
                    <button
                      type="button"
                      onClick={() => handleApplySchedulePreset('standard')}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                        theme === 'light'
                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                      }`}
                      title="Standard Mon-Fri 9-5 worker schedule"
                    >
                      9-5 Worker
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplySchedulePreset('weekend')}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                        theme === 'light'
                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                      }`}
                      title="Heavy endurance volume on Saturday and Sunday"
                    >
                      Weekend Heavy
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplySchedulePreset('shift')}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                        theme === 'light'
                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                      }`}
                      title="Shift worker with mid-week off day"
                    >
                      Shift Split
                    </button>
                  </div>
                </div>

                {/* 7-Day Availability Matrix Rows */}
                <div className="space-y-2 pt-1">
                  {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as DayOfWeek[]).map((dayKey) => {
                    const dayData = weeklyAvailability[dayKey];
                    if (!dayData) return null;

                    const isWorkday = dayData.isWorkday;
                    const preferred = dayData.preferredActivities || [];
                    const windows = dayData.availableWindows || [];

                    return (
                      <div
                        key={dayKey}
                        className={`p-3 rounded-2xl border transition-all space-y-2 ${
                          theme === 'light'
                            ? isWorkday
                              ? 'bg-slate-50/90 border-slate-200'
                              : 'bg-white border-amber-300 shadow-xs'
                            : isWorkday
                            ? 'bg-slate-900/60 border-slate-800'
                            : 'bg-slate-900/90 border-amber-500/40 shadow-xs'
                        }`}
                      >
                        {/* Day Header Row: Day name, Workday toggle, Shift start/finish */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                              isWorkday
                                ? theme === 'light'
                                  ? 'bg-slate-200 text-slate-800'
                                  : 'bg-slate-800 text-slate-300'
                                : 'bg-amber-500 text-slate-950 shadow-xs'
                            }`}>
                              {dayData.shortLabel}
                            </span>
                            <span className={`font-bold text-xs ${
                              theme === 'light' ? 'text-slate-900' : 'text-white'
                            }`}>
                              {dayData.label}
                            </span>

                            {/* Workday Toggle */}
                            <button
                              type="button"
                              onClick={() => handleToggleWorkday(dayKey)}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 border transition-all cursor-pointer ${
                                isWorkday
                                  ? theme === 'light'
                                    ? 'bg-sky-100 text-sky-800 border-sky-300'
                                    : 'bg-sky-950/60 text-sky-300 border-sky-700/60'
                                  : theme === 'light'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60'
                              }`}
                            >
                              <Briefcase className="w-3 h-3" />
                              <span>{isWorkday ? 'Workday' : 'Day Off / Flexible'}</span>
                            </button>
                          </div>

                          {/* Shift times if workday */}
                          {isWorkday ? (
                            <div className="flex items-center gap-1.5 text-xs">
                              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="text-[11px] text-slate-400 font-medium">Shift:</span>
                              <input
                                type="time"
                                value={dayData.shiftStart || '08:30'}
                                onChange={(e) => handleUpdateShift(dayKey, 'shiftStart', e.target.value)}
                                className={`rounded-lg px-1.5 py-0.5 text-xs font-mono font-bold border ${
                                  theme === 'light'
                                    ? 'bg-white border-slate-300 text-slate-900'
                                    : 'bg-slate-950 border-slate-700 text-white'
                                }`}
                              />
                              <span className="text-slate-400 text-xs">to</span>
                              <input
                                type="time"
                                value={dayData.shiftEnd || '17:00'}
                                onChange={(e) => handleUpdateShift(dayKey, 'shiftEnd', e.target.value)}
                                className={`rounded-lg px-1.5 py-0.5 text-xs font-mono font-bold border ${
                                  theme === 'light'
                                    ? 'bg-white border-slate-300 text-slate-900'
                                    : 'bg-slate-950 border-slate-700 text-white'
                                }`}
                              />
                            </div>
                          ) : (
                            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              Full Day Unrestricted Availability
                            </span>
                          )}
                        </div>

                        {/* Available Training Windows Chips */}
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                            Windows:
                          </span>
                          {[
                            { id: 'morning' as const, label: '🌅 Morning (Pre-work)' },
                            { id: 'lunch' as const, label: '☀️ Lunchtime' },
                            { id: 'evening' as const, label: '🌙 Evening (Post-work)' },
                            { id: 'anytime' as const, label: '⚡ Anytime' },
                          ].map((win) => {
                            const isSelected = windows.includes(win.id);
                            return (
                              <button
                                key={win.id}
                                type="button"
                                onClick={() => handleToggleAvailableWindow(dayKey, win.id)}
                                className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-xs'
                                    : theme === 'light'
                                    ? 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                                }`}
                              >
                                {win.label}
                              </button>
                            );
                          })}
                        </div>

                        {/* Preferred Activity Types Chips */}
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                            Preferred:
                          </span>
                          {[
                            { label: 'Long Ride', category: 'bike' },
                            { label: 'Bike Intervals / Turbo', category: 'bike' },
                            { label: 'Recovery Spin', category: 'bike' },
                            { label: 'Track Run', category: 'run' },
                            { label: 'Tempo Run', category: 'run' },
                            { label: 'Long Run', category: 'run' },
                            { label: 'Recovery Run', category: 'run' },
                            { label: 'Swim Technique', category: 'swim' },
                            { label: 'Swim Endurance', category: 'swim' },
                            { label: 'Gym / Strength', category: 'gym' },
                            { label: 'Core / Mobility', category: 'gym' },
                            { label: 'Rest Day', category: 'rest' },
                          ].map((act) => {
                            const isSelected = preferred.includes(act.label);
                            const categoryColor =
                              act.category === 'bike'
                                ? 'bg-orange-500 text-slate-950 border-orange-400 font-bold'
                                : act.category === 'run'
                                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                                : act.category === 'swim'
                                ? 'bg-sky-500 text-slate-950 border-sky-400 font-bold'
                                : act.category === 'gym'
                                ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold'
                                : 'bg-slate-700 text-white border-slate-600 font-bold';

                            return (
                              <button
                                key={act.label}
                                type="button"
                                onClick={() => handleToggleActivityPreference(dayKey, act.label)}
                                className={`px-2 py-0.5 rounded-lg text-[10px] border transition-all cursor-pointer ${
                                  isSelected
                                    ? categoryColor
                                    : theme === 'light'
                                    ? 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                                }`}
                              >
                                {act.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SWIMMING & CSS (Activity Order: Swim, Bike, Run) */}
          {activeTab === 'swimming' && (
            <div className="space-y-4">
              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 flex items-start gap-2.5">
                <Waves className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <p>
                  Enter your all-out 100m and 400m test times. GymFIT automatically derives your <strong>Critical Swim Speed (CSS)</strong> to calculate Swim TSS (sTSS) for pool swims and open water swims.
                </p>
              </div>

              {/* Time Trial Inputs for CSS */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="p-2.5 sm:p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-sky-300">Swim 100m TT</label>
                    <span className="text-[10px] text-slate-500">mm:ss</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="1:35"
                      value={swim100mStr}
                      onChange={(e) => setSwim100mStr(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 text-sm font-bold font-mono text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <span className="text-[11px] text-slate-500">{t100} seconds</span>
                </div>

                <div className="p-2.5 sm:p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-sky-300">Swim 400m TT</label>
                    <span className="text-[10px] text-slate-500">mm:ss</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="6:55"
                      value={swim400mStr}
                      onChange={(e) => setSwim400mStr(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 text-sm font-bold font-mono text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <span className="text-[11px] text-slate-500">{t400} seconds</span>
                </div>
              </div>

              {/* Live CSS Banner */}
              <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center font-black text-xs">
                    CSS
                  </div>
                  <div>
                    <span className="text-xs font-black text-sky-300 block">Critical Swim Speed (Derived)</span>
                    <span className="text-[11px] text-slate-400">
                      Speed: {liveCss.cssMps} m/s
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-base sm:text-lg font-black font-mono text-sky-300">
                    {liveCss.cssPaceFormatted}
                  </span>
                  <span className="text-[10px] text-slate-500 block font-mono">/100m threshold</span>
                </div>
              </div>

              {/* Individual Sport Paces */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="p-2.5 sm:p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-sky-300">Pool Pace</label>
                    <span className="text-[10px] text-slate-500">Default</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="1:30"
                      value={swimPoolPaceStr}
                      onChange={(e) => setSwimPoolPaceStr(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 text-sm font-bold font-mono text-white focus:outline-none focus:border-amber-400"
                    />
                    <span className="text-xs text-slate-400 font-mono whitespace-nowrap">/100m</span>
                  </div>
                </div>

                <div className="p-2.5 sm:p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-sky-300">Open Water</label>
                    <span className="text-[10px] text-slate-500">Default</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="1:38"
                      value={swimOpenWaterPaceStr}
                      onChange={(e) => setSwimOpenWaterPaceStr(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 text-sm font-bold font-mono text-white focus:outline-none focus:border-amber-400"
                    />
                    <span className="text-xs text-slate-400 font-mono whitespace-nowrap">/100m</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BIKE (FTP, LTHR & CRANK LENGTH) */}
          {activeTab === 'cycling' && (
            <div className="space-y-4">
              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 flex items-start gap-2.5">
                <Bike className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                <p>
                  Power metrics and Power TSS are strictly reserved for <strong>Turbo Trainer</strong> and <strong>Bike</strong> activities.
                  Set your Functional Threshold Power (FTP) in Watts.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="p-2.5 sm:p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-amber-300">Bike FTP</label>
                    <span className="text-[10px] text-slate-500">1h power</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="50"
                      max="600"
                      value={bikeFtp}
                      onChange={(e) => setBikeFtp(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 text-sm font-bold font-mono text-white focus:outline-none focus:border-amber-400"
                    />
                    <span className="text-xs text-slate-500 font-mono">W</span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {(bikeFtp / (weightKg || 75)).toFixed(2)} W/kg
                  </span>
                </div>

                <div className="p-2.5 sm:p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-rose-300">Cycling LTHR</label>
                    <span className="text-[10px] text-slate-500">Threshold</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="100"
                      max="220"
                      value={thresholdHeartRateBike}
                      onChange={(e) => setThresholdHeartRateBike(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 text-sm font-bold font-mono text-white focus:outline-none focus:border-amber-400"
                    />
                    <span className="text-xs text-slate-500 font-mono">bpm</span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    ~5-8 bpm &lt; run LTHR
                  </span>
                </div>
              </div>

              {/* Hardware: Default Crank Length & Per-Bike Crank Lengths */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-orange-400">
                      Bike Hardware &amp; Crank Length
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Store crank lengths for each bike for accurate torque (Nm) calculations
                    </p>
                  </div>
                  <Wrench className="w-4 h-4 text-orange-400 shrink-0" />
                </div>

                {/* Default Crank Length */}
                <div className="p-2.5 sm:p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3">
                  <div>
                    <label className="text-xs font-bold text-white block">Default Crank Length</label>
                    <span className="text-[10px] text-slate-400">Used when activity has no specific bike gear ID (2.5mm steps)</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setBikeCrankLengthMm((prev) => Math.max(140, Math.round(((prev || 172.5) - 2.5) * 10) / 10))}
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 font-bold text-xs cursor-pointer border border-slate-700 transition-colors"
                      title="Decrease by 2.5mm"
                    >
                      -2.5
                    </button>
                    <input
                      type="number"
                      step="2.5"
                      min="140"
                      max="195"
                      value={bikeCrankLengthMm}
                      onChange={(e) => setBikeCrankLengthMm(Number(e.target.value))}
                      className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-bold font-mono text-white text-right focus:outline-none focus:border-orange-400"
                    />
                    <button
                      type="button"
                      onClick={() => setBikeCrankLengthMm((prev) => Math.min(195, Math.round(((prev || 172.5) + 2.5) * 10) / 10))}
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 font-bold text-xs cursor-pointer border border-slate-700 transition-colors"
                      title="Increase by 2.5mm"
                    >
                      +2.5
                    </button>
                    <span className="text-xs text-slate-400 font-mono ml-0.5">mm</span>
                  </div>
                </div>

                {/* Per-Bike (Gear ID) Crank Lengths */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-300 uppercase">
                      Individual Bikes (Gear IDs)
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {detectedBikes.length} {detectedBikes.length === 1 ? 'bike' : 'bikes'} found
                    </span>
                  </div>

                  {detectedBikes.length === 0 ? (
                    <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/80 text-center text-xs text-slate-400">
                      No bike gear IDs found yet. Connect Strava or add your bike gear ID below.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {detectedBikes.map((bike) => {
                        const currentLen = bikeCrankLengths[bike.gearId] ?? bikeCrankLengthMm ?? 172.5;
                        return (
                          <div
                            key={bike.gearId}
                            className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <Bike className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                                <span className="text-xs font-bold text-white truncate">
                                  {bike.name}
                                </span>
                              </div>
                              <span className="text-[10px] font-mono text-slate-500 block ml-5">
                                ID: {bike.gearId}
                                {bike.activityCount > 0 ? ` • ${bike.activityCount} activities` : ''}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  const nextVal = Math.max(140, Math.round((currentLen - 2.5) * 10) / 10);
                                  setBikeCrankLengths((prev) => ({ ...prev, [bike.gearId]: nextVal }));
                                }}
                                className="w-6 h-6 rounded-md bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 font-bold text-xs flex items-center justify-center cursor-pointer border border-slate-700 transition-colors"
                                title="-2.5mm"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                step="2.5"
                                min="140"
                                max="195"
                                value={currentLen}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  setBikeCrankLengths((prev) => ({
                                    ...prev,
                                    [bike.gearId]: val,
                                  }));
                                }}
                                className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-1.5 py-1 text-xs font-bold font-mono text-white text-right focus:outline-none focus:border-orange-400"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const nextVal = Math.min(195, Math.round((currentLen + 2.5) * 10) / 10);
                                  setBikeCrankLengths((prev) => ({ ...prev, [bike.gearId]: nextVal }));
                                }}
                                className="w-6 h-6 rounded-md bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 font-bold text-xs flex items-center justify-center cursor-pointer border border-slate-700 transition-colors"
                                title="+2.5mm"
                              >
                                +
                              </button>
                              <span className="text-[11px] text-slate-400 font-mono">mm</span>

                              {bikeCrankLengths[bike.gearId] !== undefined && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBikeCrankLengths((prev) => {
                                      const next = { ...prev };
                                      delete next[bike.gearId];
                                      return next;
                                    });
                                  }}
                                  className="text-slate-500 hover:text-rose-400 p-1 transition-colors cursor-pointer ml-1"
                                  title="Remove override (reset to default)"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add Custom Bike Gear ID */}
                  <div className="flex items-center gap-2 pt-1.5">
                    <input
                      type="text"
                      placeholder="e.g. b1234567 or Road Bike"
                      value={newGearIdInput}
                      onChange={(e) => setNewGearIdInput(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-400 font-mono"
                    />
                    <input
                      type="number"
                      step="2.5"
                      min="140"
                      max="195"
                      placeholder="172.5"
                      value={newGearLenInput}
                      onChange={(e) => setNewGearLenInput(e.target.value)}
                      className="w-18 bg-slate-900 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white font-mono text-right focus:outline-none focus:border-orange-400"
                    />
                    <span className="text-[11px] text-slate-400 font-mono">mm</span>
                    <button
                      type="button"
                      disabled={!newGearIdInput.trim()}
                      onClick={() => {
                        const trimmed = newGearIdInput.trim();
                        if (!trimmed) return;
                        const len = Number(newGearLenInput) || 172.5;
                        setBikeCrankLengths((prev) => ({
                          ...prev,
                          [trimmed]: len,
                        }));
                        setNewGearIdInput('');
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-slate-950 font-bold text-xs cursor-pointer shrink-0"
                    >
                      Add Bike
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: RUN (OUTDOOR VS TREADMILL) */}
          {activeTab === 'running' && (
            <div className="space-y-4">
              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 flex items-start gap-2.5">
                <Footprints className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p>
                  Set distinct threshold paces (Functional Threshold Pace) for <strong>outdoor running</strong> and <strong>treadmill running</strong>.
                  Treadmill runs with trainer mode use your treadmill pace for accurate Running TSS (rTSS).
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="p-2.5 sm:p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-amber-300">Outdoor Pace</label>
                    <span className="text-[10px] text-slate-500">10k / 1h</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="3:52"
                      value={paceOutdoorStr}
                      onChange={(e) => setPaceOutdoorStr(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 text-sm font-bold font-mono text-white focus:outline-none focus:border-amber-400"
                    />
                    <span className="text-xs text-slate-400 font-mono whitespace-nowrap">/km</span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    ~{(3600 / parseMinSecToSeconds(paceOutdoorStr, 232)).toFixed(1)} km/h
                  </span>
                </div>

                <div className="p-2.5 sm:p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-amber-300">Treadmill Pace</label>
                    <span className="text-[10px] text-slate-500">Indoor</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="4:45"
                      value={paceTreadmillStr}
                      onChange={(e) => setPaceTreadmillStr(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 text-sm font-bold font-mono text-white focus:outline-none focus:border-amber-400"
                    />
                    <span className="text-xs text-slate-400 font-mono whitespace-nowrap">/km</span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    ~{(3600 / parseMinSecToSeconds(paceTreadmillStr, 228)).toFixed(1)} km/h
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-rose-300">Running Lactate Threshold HR (LTHR)</label>
                  <span className="text-[10px] text-slate-500">Zone 4/5 boundary</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="100"
                    max="220"
                    value={thresholdHeartRateRun}
                    onChange={(e) => setThresholdHeartRateRun(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-bold font-mono text-white focus:outline-none focus:border-amber-400"
                  />
                  <span className="text-xs text-slate-500 font-mono">bpm</span>
                </div>
                <span className="text-[11px] text-slate-500">
                  Used when running without speed/GPS or for hrTSS calculations.
                </span>
              </div>
            </div>
          )}

          {/* TAB 5: ZONES PREVIEW */}
          {activeTab === 'zones' && (
            <div className="space-y-4">
              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <p>
                  Heart rate zones dynamically computed using the <strong>Karvonen Formula</strong> (Heart Rate Reserve) based on your Max HR ({maxHeartRate} bpm) and Resting HR ({restingHeartRate} bpm).
                </p>
              </div>

              {/* Running HR Zones */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Footprints className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Running HR Zones (Karvonen)
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">Max {maxHeartRate} bpm</span>
                </div>

                <div className="space-y-1.5">
                  {previewRunZones.map((z) => (
                    <div
                      key={z.zone}
                      className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          style={{ backgroundColor: z.color }}
                          className="w-6 h-6 rounded-lg text-slate-950 font-black text-xs flex items-center justify-center shrink-0"
                        >
                          Z{z.zone}
                        </span>
                        <div>
                          <span className="font-bold text-white mr-1.5">{z.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{z.description}</span>
                        </div>
                      </div>

                      <div className="text-right font-mono font-bold text-slate-200">
                        <span>{z.minHr} - {z.maxHr} bpm</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cycling Power Zones (Coggan 7-Zone) */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bike className="w-4 h-4 text-orange-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Cycling Power Zones (FTP {bikeFtp}W)
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">Coggan Model</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Z1 Active Recovery</span>
                    <span className="font-bold font-mono text-slate-200">&lt; {Math.round(bikeFtp * 0.55)}W</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Z2 Endurance</span>
                    <span className="font-bold font-mono text-slate-200">{Math.round(bikeFtp * 0.55)} - {Math.round(bikeFtp * 0.75)}W</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Z3 Tempo</span>
                    <span className="font-bold font-mono text-slate-200">{Math.round(bikeFtp * 0.76)} - {Math.round(bikeFtp * 0.90)}W</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Z4 Threshold (FTP)</span>
                    <span className="font-bold font-mono text-amber-400">{Math.round(bikeFtp * 0.91)} - {Math.round(bikeFtp * 1.05)}W</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Z5 VO2 Max</span>
                    <span className="font-bold font-mono text-orange-400">{Math.round(bikeFtp * 1.06)} - {Math.round(bikeFtp * 1.20)}W</span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                    <span className="text-[10px] text-slate-500 block">Z6 Anaerobic</span>
                    <span className="font-bold font-mono text-rose-400">&gt; {Math.round(bikeFtp * 1.20)}W</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 6: GOALS */}
          {/* ========================================================= */}
          {activeTab === 'goals' && (
            <GoalsTab
              goals={goals}
              onChangeGoals={(updated) => setGoals(updated)}
              profile={previewProfile}
              theme={theme}
            />
          )}
        </div>

        {/* Footer CTAs */}
        <div className={`pt-3 border-t flex items-center justify-between gap-3 shrink-0 ${
          theme === 'light' ? 'border-slate-200' : 'border-slate-800'
        }`}>
          <button
            type="button"
            onClick={activeTab === 'settings' ? onClose : handleReset}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              theme === 'light'
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            {activeTab === 'settings' ? (
              <span>Close</span>
            ) : (
              <>
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Defaults</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                theme === 'light'
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              {activeTab === 'settings' ? 'Done' : 'Cancel'}
            </button>

            {/* Save Physiology Button: Grey if nothing changed; colors when edited; returns to grey after saving */}
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty && !savedFeedback}
              className={`px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                savedFeedback
                  ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 cursor-default'
                  : isDirty
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-md shadow-amber-500/20 active:scale-95 cursor-pointer'
                  : theme === 'light'
                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-75'
                  : 'bg-slate-800 text-slate-400 border border-slate-700/80 cursor-not-allowed opacity-75'
              }`}
            >
              {savedFeedback ? (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Saved!</span>
                </>
              ) : (
                <span>Save</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
