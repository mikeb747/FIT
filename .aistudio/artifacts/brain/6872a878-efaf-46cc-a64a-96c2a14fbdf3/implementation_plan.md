# Performance Tab Implementation

## Summary of Completed Work

### 1. Dedicated "Performance" Tab
- Added **"Performance"** as a top-level tab in the main header navigation alongside Activities, Readiness, Fitness, and Coach.
- Kept the existing "Fitness" tab completely intact.
- Designed with responsive spacing matching the global 50% border padding requirement (`px-2 sm:px-3 py-3 sm:py-4`).

### 2. Critical Physiological Thresholds & Engine (`src/utils/performanceEngine.ts`)
- Implemented calculations for key physiological thresholds:
  - **Cycling**: FTP (W and W/kg), Critical Power ($CP$), Anaerobic Work Capacity ($W'$ in kJ and Joules), Bike LTHR.
  - **Running**: Lactate Threshold Pace ($\text{min/km}$ and $\text{min/mi}$), Critical Speed ($CS$ in m/s, $\text{min/km}$, $\text{min/mi}$), $D'$ (D-prime in meters), Run LTHR.
  - **Swimming**: Critical Swim Speed (CSS in $\text{min/100m}$ & $\text{min/100yd}$), 400m test pace, 1000m baseline endurance, 1500m threshold pace.

### 3. Peak Performance Duration Modeling (10 Specific Durations)
- Tracks peak performances across the exact durations requested:
  - **3 min, 5 min, 8 min, 12 min, 20 min, 30 min, 45 min, 60 min, 90 min, 120 min**.
- Calculates observed maximum power/pace from Strava activity records and high-resolution streams.
- Fitted with 2-parameter hyperbolic critical models:
  - Power: $P(t) = CP + \frac{W'}{t}$
  - Speed: $S(t) = CS + \frac{D'}{t}$
- Interactive SVG Power-Duration and Pace-Duration curves with asymptotic CP/CS threshold indicators, observed dots, and dynamic hover cards.

### 4. Swim Distance Performance Modeling & Sprint (400m Pool Swim)
- **Sprint Triathlon (400m Pool Swim)**:
  - Tracks very closely with CSS time (`1:36/100m`), slightly slower than an all-out standalone 400m swim (`6:12` / `1:33/100m`) to prevent excessive lactate production prior to mounting the bike (`6:34` / `1:38/100m`, +2.5% tactical reserve).
  - Highest confidence score (95%) anchored directly on 400m & 100m pool test data.
- **Sprint Triathlon (750m Open Water)**: Modeled using athlete's **CSS pace** with open-water sighting factor (`12:00`–`12:30`, 92% confidence).
- **Olympic Distance (1500m)**: Modeled using **1000m and 1500m** continuous endurance performances and open-water sighting/turning dynamics.
- **Middle / 70.3 Distance (1900m)**: Modeled from **1000m and 1500m** pacing degradation and sustained aerobic capacity.
- **Ironman / Full Distance (3800m)**: Modeled from **1500m base endurance** factoring non-wetsuit / wetsuit buoyancy, feeding, and fatigue.
- **Goal Presets**: Added `Sprint (400m Pool)` and `Sprint (750m Open Water)` to `TRIATHLON_DISTANCE_PRESETS` and `SWIM_DISTANCE_PRESETS` in Goals configuration with auto-computed target split times.

### 5. Race-Specific Weakness & Time-Gain Potential vs. Age-Grade Benchmarks
- Benchmark comparison against competitive Age-Group standards (Top 20% finisher benchmarks across M35-44 competitive fields).
- Computes athlete's projected splits vs benchmark for Swim, Bike, and Run.
- Ranks disciplines by **Priority #1, #2, and #3** based on absolute time opportunity (minutes and seconds that can be gained on race day).
- Provides actionable tactical coaching advice for where the athlete has the greatest potential to gain time relative to age-grade standards.

### 6. Verification
- `compile_applet` passed cleanly.
- `lint_applet` verified with zero TypeScript or syntax errors (`tsc --noEmit`).
- Dev server active and serving port 3000.
