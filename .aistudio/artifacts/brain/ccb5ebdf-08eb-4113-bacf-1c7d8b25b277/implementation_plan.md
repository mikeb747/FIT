# IronFIT: Strength Workout Tracker & Strava FIT Generator

A mobile-first strength training application inspired by Hevy that logs sets, reps, and equipment weights with rapid digit-wheel scrolling, features a dual continuous/lap timer HUD, and exports Strava-compatible Garmin `.fit` activity files with direct Strava cloud upload.

> [!IMPORTANT]
> **Confirmed User Decisions & Key Specifications:**
> - **Weight Selection Mechanism**: High-precision digit scroll-wheel selector supporting values from `1.1 kg` up to `999.9 kg` with separate rotating drums for hundreds, tens, ones, and decimal tenths, paired with quick `+`/`-` nudge buttons on the right.
> - **Equipment Modalities**: Categorization for `Cable`, `Freeweight`, `Dumbbell`, `Kettlebell`, and `Machine Weight` per exercise.
> - **Workout Timers**: Real-time HUD displaying continuous total workout running time alongside a dedicated "Lap" timer that tracks current set/rest duration and resets on lap clicks.
> - **Exercise Selection & Defaults**: Favorites-first filtering on home and exercise picker; automatic inheritance of previous sets, reps, and weights from historical sessions.
> - **Strava Integration**: Both direct one-tap Strava API cloud upload (via OAuth2 popup flow) and immediate local `.fit` binary file export conforming to Garmin FIT Activity profile specifications (mesg 225 Set messages).

---

### 1. Overview & Core Concept

IronFIT is designed for weightlifters, bodybuilders, and fitness enthusiasts who want frictionless workout logging on their mobile Android browser or PWA and seamless compatibility with Strava. Existing GPS trackers like Garmin and Apple Watch do not provide effortless in-gym set logging, while generic workout trackers often fail to produce genuine FIT activity files that Strava's strength training algorithms recognize.

- **What It Does**: Enables athletes to select favorited workout routines, quickly record sets with custom weights and reps, manage rest and continuous session times, and generate compliant `.fit` binary files that populate Strava's sets, reps, weight, and muscle metrics.
- **Target Audience**: Strength athletes, gym lifters, and Strava power users seeking a Hevy-quality mobile experience with custom FIT file exports.
- **Key Value**: Zero-friction workout logging in the gym with thumb-friendly controls, instant recall of prior personal records and last-used weights, and instant sync to Strava without manual GPX/TCX conversion hacks.

---

### 2. User Experience & Visual Design

#### Key User Flows

1. **Dashboard & Favorited Workouts**:
   - The user opens the app to their **Favorited Workouts** grid/list (e.g., *Push Day A*, *Pull Hypertrophy*, *Legs & Core*).
   - Quick one-tap "Start Workout" or "Quick Empty Workout".
   - Toggle to browse all saved routines or create a new template.

2. **Active Workout HUD & Exercise Logging**:
   - Top sticky status bar shows **Continuous Elapsed Time** and **Lap / Rest Stopwatch** side-by-side with a prominent tactile **Lap** button.
   - Hitting **Lap** logs the current interval, restarts the lap clock from `00:00`, and gives tactile feedback.
   - The workout list displays current exercises with inherited sets, reps, and weights from the athlete's last completed session.
   - Each set row contains: Set #, Type (Warmup, Normal, Drop, Failure), Previous stats badge, Weight (kg) with rapid `▲`/`▼` nudge buttons on the right, Reps, and a Checkbox completion button.

3. **Digit Scroll-Wheel Weight Selector Modal**:
   - Tapping any weight field opens an ergonomic 4-digit roller drum:
     - `[Hundreds: 0-9]` · `[Tens: 0-9]` · `[Ones: 0-9]` · `.` · `[Tenths: 0-9]`
   - Supports fluid swipe/scroll rotation, direct keypad input, and fast quick-step buttons (`+1.25`, `+2.5`, `+5`, `+10` kg).
   - Validated bounds enforce values between `1.1 kg` and `999.9 kg`.

4. **Exercise Picker & Equipment Tagging**:
   - When tapping "Add Exercise", the dialog defaults exclusively to **Favorited Movements** to eliminate clutter.
   - A segmented filter allows switching to "All Exercises" or searching by muscle group.
   - "New Exercise" modal includes equipment selector pills: `Cable`, `Freeweight`, `Dumbbell`, `Kettlebell`, or `Machine Weight`, plus primary target muscle.

5. **Workout Completion & Strava Export**:
   - Tapping "Finish Workout" shows session summary (total volume, elapsed time, set count, personal records).
   - Primary action: **"Upload to Strava"** (direct OAuth upload to Strava Activity endpoint).
   - Secondary action: **"Download .FIT File"** for local archival or manual upload.

#### Visual Identity & Theme

- **Aesthetic Direction**: High-contrast, dark-mode athletic utility inspired by Hevy and Garmin Connect. Designed for outdoor or high-glare gym lighting with razor-sharp typography.
- **Color Palette**:
  - Dominant Canvas: Deep Onyx (`#090A0F`, `#0F1117`)
  - Structural Surfaces: Card slate (`#181B26`), Hairline borders (`#262B3D`)
  - Accent / Primary CTA: Electric Amber / Strava Orange accent (`#FC5200` and `#F59E0B`)
  - Success State: Vivid Emerald (`#10B981`) for completed sets
- **Typography & Hierarchy**:
  - Display & Headlines: `Plus Jakarta Sans` (punchy, modern athletic weight)
  - Data & Timers: `JetBrains Mono` or tabular sans (`tabular-nums font-mono`) for precision alignment of timers and kilogram values
- **Touch-First Thumb Zone**:
  - All interactive buttons $\ge 48\text{px}$ touch target.
  - Sticky bottom action bar for primary session controls.

---

### 3. Key Product Decisions & Trade-Offs

#### Decision 1: Pure Client-Side FIT Binary Generator vs Server Library
- **Chosen Approach**: Built-in TypeScript binary encoder conforming strictly to the Garmin FIT Activity specification (Header with `.FIT` signature, CRC16-CCITT checksum, File ID message, Device Info message, Workout/Sport `TRAINING`/`STRENGTH_TRAINING` records, and Set Messages #225).
- **Why**: Allows instant, zero-latency `.fit` file generation directly in the browser or PWA even when offline at the gym, with zero external binary dependency compilation errors.
- **Alternatives Considered**: Heavy C/Wasm wrappers or server-side FIT SDKs, which fail offline and introduce significant latency.

#### Decision 2: Digit Drum Scroll Wheel for 1.1kg - 999.9kg
- **Chosen Approach**: Touch-draggable and scrollable 4-digit roller wheel (Hundreds, Tens, Ones, Tenths) with inertial snapping and direct numerical overrides, plus quick +/- 1.25/2.5kg step buttons on the set rows.
- **Why**: Standard numeric mobile inputs often cause keyboards to obstruct the set list; a dedicated digit wheel allows quick 1-handed thumb adjustment with 0.1kg precision.

#### Decision 3: Strava OAuth & Direct Upload Pipeline
- **Chosen Approach**: Full implementation of the AI Studio popup OAuth flow (`/api/strava/auth-url`, `/api/strava/callback` with `window.opener.postMessage`), coupled with server-side token management and multipart upload to `https://www.strava.com/api/v3/uploads`.
- **Why**: Fulfills the user's explicit requirement for "Direct Strava integration" while adhering to iframe security standards. Users can also download the raw `.fit` file at any time.

---

### 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            IronFIT Application                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────┐   ┌───────────────────────┐   ┌────────────────┐ │
│  │   Favorited Workouts  │   │  Active Workout HUD   │   │ Digit Drum     │ │
│  │   & Routine Selector  │──▶│  Dual Timer (Run/Lap) │──▶│ Weight Picker  │ │
│  └───────────────────────┘   └───────────────────────┘   └────────────────┘ │
│              │                            │                       │         │
│              ▼                            ▼                       ▼         │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                   Workout State & Local Storage                        │ │
│  │    • Exercise Catalog & History (Equipment, Last Sets/Reps/Weight)     │ │
│  │    • Active Session (Timestamps, Exercises, Sets, Rest Intervals)       │ │
│  │    • Strava Connection State & User Preferences                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                   │                                         │
│                                   ▼                                         │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                 FIT Binary File Generator (Garmin Spec)                │ │
│  │    • File ID & Sport Definition (Training / Strength Training)         │ │
│  │    • Set Messages (Message #225: Reps, Weight*16, Timestamp, Category) │ │
│  │    • Session & Activity Summary with CRC16 Checksum Calculation        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                     │                                   │                   │
│                     ▼                                   ▼                   │
│         ┌───────────────────────┐           ┌───────────────────────┐       │
│         │ Direct .FIT Download  │           │  Strava OAuth & Sync  │       │
│         │ (For manual import)   │           │  POST /api/strava/up  │       │
│         └───────────────────────┘           └───────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Data Entities

- **Exercise**:
  `id`, `name`, `equipment` (`cable` | `freeweight` | `dumbbell` | `kettlebell` | `machine`), `targetMuscle`, `isFavorite`, `lastUsed` (`sets`, `reps`, `weightKg`), `personalBest`
- **WorkoutSet**:
  `id`, `setNumber`, `type` (`normal` | `warmup` | `drop` | `failure`), `weightKg` (float `1.1` - `999.9`), `reps` (int), `completed` (boolean), `durationSec` (int), `restAfterSec` (int)
- **WorkoutSession**:
  `id`, `title`, `startTime`, `endTime`, `elapsedSeconds`, `exercises: WorkoutExercise[]`, `notes`, `stravaActivityId`
- **FIT Activity Payload**:
  Header (14 bytes) -> File ID (type=4) -> Sport (training/strength) -> Set messages (mesg 225) -> Lap / Session -> Activity -> 2-byte CRC16.
