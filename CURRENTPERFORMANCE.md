# Current Performance and Race Readiness

## Purpose

Maintain a current performance profile for running, swimming, and cycling. Use
recent activities, race results, and manually entered benchmarks to estimate
current ability and compare it with an athlete's goals.

Keep each benchmark's date, source, conditions, and confidence level. Older
results should gradually have less influence as newer performance data becomes
available. Distinguish an actual result from an estimate: completing a 1,500 m
swim in 25 minutes is not the same as the app estimating that the athlete could
currently swim it in 25 minutes.

## Swimming

Keep pool and open-water performance separate. Open-water pace is affected by
sighting, currents, waves, and conditions, so it is not directly interchangeable
with pool pace.

### Pool performance

- Critical Swim Speed (CSS), expressed as pace per 100 m.
- Estimated times for common distances: 400 m, 750 m, 1,500 m, and 3,000 m.
- Pool length (25 m or 50 m).

CSS estimates sustainable swimming pace. It can be calculated from 200 m and
400 m time-trial times:

```text
CSS (seconds per 100 m) = (400 m time - 200 m time) / 2
```

### Open-water performance

- Recent race results.
- Manually entered benchmark swims.
- Average pace over known distances.
- Conditions that materially affect the result, when known.

| Metric | Illustrative value |
|---|---:|
| CSS pace | 1:40 / 100 m |
| Estimated 400 m | 6:32 |
| Estimated 750 m | 12:45 |
| Estimated 1,500 m | 26:00 |
| Open-water benchmark | 1:45 / 100 m |

These values are illustrative, not necessarily predictions that should be
derived from CSS alone without accounting for distance and endurance.

## Running

Track race-equivalent times across relevant distances and threshold pace.
Potential reference distances include 5 km, 10 km, half marathon, and marathon.
Use recent race results, structured tests, and suitable activity efforts as
evidence; do not assume every training run is a maximal benchmark.

Record the distance, time, date, and relevant course context for each result.
Road, track, and trail performances may not be directly comparable, and
predictions over longer distances should account for endurance rather than
extrapolating pace alone.

## Cycling

Prioritise power-based measurements over speed when the athlete has a power
meter.

- Functional Threshold Power (FTP).
- Critical Power (CP), if supported.
- Power-duration curve.
- 5-minute, 20-minute, and 60-minute power.
- Average power and normalized power from longer efforts.

FTP is a useful measure of sustainable cycling performance. A power-duration
curve provides a broader view of capabilities across shorter and longer efforts.
Use these benchmarks to estimate performance over different cycling distances.

| Metric | Illustrative current ability |
|---|---:|
| FTP | 280 W |
| 5-minute power | 350 W |
| 20-minute power | 295 W |
| 60-minute power | 265 W |

Do not automatically treat every training activity as an FTP test. Prefer
genuine maximal efforts, structured tests, and race results. Keep indoor trainer
performance separate from outdoor speed-based benchmarks.

## Combining performance data

Use a consistent approach across disciplines:

| Source | Use |
|---|---|
| Recent activities | Identify potential performance benchmarks automatically |
| Race results | Record actual achieved performance |
| Manual benchmarks | Record tests or known ability entered by the athlete |

Each benchmark should store:

- Date achieved.
- Source (activity, race, or manual).
- Performance metric and value.
- Relevant conditions and equipment.
- Confidence level.

Use recency weighting so an old result does not carry the same importance as a
recent performance test. The weighting and confidence rules still need to be
defined.

## Performance profile and goal comparison

| Discipline | Primary performance metrics |
|---|---|
| Run | Race-equivalent times and threshold pace |
| Swim | CSS, pool pace, and open-water pace |
| Bike | FTP, power-duration curve, and benchmark speeds |

Compare each discipline with its own event target; do not compare unlike
metrics directly. For example:

| Discipline | Status | Current | Target |
|---|---|---:|---:|
| Swim | Ahead | 1:40 / 100 m | 1:45 / 100 m |
| Bike | Development needed | 280 W FTP | 300 W FTP |
| Run | Development needed | 40:00 10 km | 38:30 10 km |

These are illustrative values. Combine discipline-specific comparisons to
estimate overall race readiness, while making clear that an estimate is not a
guarantee of race performance.

## Information to define

- **Units and normalization:** Choose supported distance and pace units, and
  define whether bike power is shown as absolute watts, watts per kilogram, or
  both. Keep stored values consistent when users change display units.
- **Estimate method:** Define how activity data becomes a benchmark, which
  efforts qualify, how estimates account for distance and endurance, and how
  recency and confidence affect the result.
- **Readiness inputs:** Performance alone does not establish race readiness.
  Consider whether readiness should also account for recent training volume,
  long-session experience, consistency, recovery or injury status, and (for
  triathlon) transitions and fueling. Define which are required and which are
  informational.
- **Event context:** Decide how course profile, surface, weather, altitude,
  pool length, equipment, and drafting affect comparisons or are recorded as
  context only.
- **Data quality:** Define how to handle missing, conflicting, implausible, or
  stale benchmarks, and how athletes can correct or remove them.
