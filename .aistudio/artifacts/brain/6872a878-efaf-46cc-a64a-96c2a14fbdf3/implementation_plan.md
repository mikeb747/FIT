# Swim Pace & Heart Rate Zones Implementation

## Summary of Completed Work

### 1. Critical Swim Speed (CSS) Pace Zones
- Implemented `getAthleteSwimPaceZones` in `src/types/athlete.ts` adhering to the exact requested CSS offsets:
  - **Z1 (Recovery / Easy)**: CSS +15 to +25 seconds
  - **Z2 (Endurance / Ironman)**: CSS +8 to +15 seconds
  - **Z3 (Tempo / Steady aerobic)**: CSS +3 to +8 seconds
  - **Z4 (Threshold / CSS)**: CSS -2 to +2 seconds
  - **Z5 (VO2 Max)**: CSS -2 to -10 seconds
- Added `customPaceZonesSwim`, `customHrZonesSwim`, `thresholdHeartRateSwim`, and `preferredSwimProtocol` to `AthleteProfile`.

### 2. Settings Tab > Swim Configuration
- Located directly below **Swim TSS Model**, added two dedicated configuration sections:
  - **Swim Pace Zones (CSS Model)**: Displays current derived CSS (e.g. `1:30/100m`), full zone breakdown with offset badges, editable fast/slow inputs (`mm:ss/100m`), and a "Reset to CSS" button.
  - **Swim Heart Rate Zones**: Displays Swim LTHR with an aquatic offset helper (Run LTHR minus 12 bpm), 5-zone HR table with editable min/max bpm inputs, a "Reset Model" button, and a "Protocols & Guide" launcher.

### 3. Swim Heart Rate Protocols & Zone Standards Modal
- Created `src/components/SwimHeartRateProtocolsModal.tsx` documenting:
  - **British Triathlon Federation (BTF)**: 5-zone aquatic model anchored on Swim LTHR.
  - **US Masters Swimming (USMS / USA Swimming)**: Aerobic, Threshold, and VO2 Max protocols.
  - **Joe Friel Triathlon Standards**: 5-zone LTHR model with aquatic offset (10–13 bpm lower than running).
- Features an interactive calculator, scientific overview of the mammalian dive reflex & hydrostatic pressure, and an "Apply to Athlete Profile" button.

### 4. Activity Telemetry & Zone Analysis
- Extended `calculateActivityZonesTime` in `src/utils/trainingZones.ts` to compute both Pace Zones and Heart Rate Zones for swim activities from streams, swim laps, or average speed.
- `ActivityZoneChart` automatically renders tabs for both "Heart Rate Zones" and "Pace Zones" for swimming activities.

### 5. Verification
- Both `compile_applet` and `lint_applet` passed cleanly with 0 errors.
- Dev server is running smoothly on port 3000.
