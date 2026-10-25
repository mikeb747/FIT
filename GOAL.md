# Goals System — Feature Specification

## Overview

The Goals system supports running and triathlon training by letting athletes
define future races or performance goals, work backwards to establish achievable
distance, pace, and training milestones, and track progress toward each goal.
Current fitness should be compared with the target performance.

## 1. Goals management

Add a **Goals** section to Settings where users can create and manage multiple
goals or upcoming races. Each goal is entered individually, with the option to
add more.

Each goal should include:

- **Priority:** A, B, or C.
- **Event type:** Run, Bike, Swim, or Triathlon.
- **Event distance:** Suggested distances, with an option to enter a custom
  distance.
  - Running: 5 km, 10 km, 10 mile, half marathon, marathon.
  - Triathlon: Sprint, Olympic, 70.3, IRONMAN.
- **Target event time:** Overall target finish time, where applicable.
- **Event date.**
- **Goal status:** Upcoming, Completed, Abandoned, or Missed.
- **Target type:** Finish the event, achieve a specific time, or achieve a
  specific pace.
- **Milestones:** Intermediate performance and training targets.

## 2. Event-specific targets

Each event type should have relevant target fields.

### Running

- Distance.
- Target finish time.
- Target average pace.
- Course type (road, trail, or track).
- Elevation gain.

### Cycling

- Distance.
- Target time.
- Average speed.
- Target power (optional).
- Elevation gain.

### Swimming

- Distance.
- Target time.
- Pool or open water.

### Triathlon

Support individual discipline distances and target times rather than relying on
predefined standard distances. Events can have different proportions of
swimming, cycling, and running.

Required fields:

- Total event distance and overall target time.
- Swim distance and target time.
- T1 target time.
- Bike distance and target time.
- T2 target time.
- Run distance and target time.

Calculate the overall target time from the discipline and transition targets
when they are provided.

## 3. Training milestones and backwards tracking

Let users add milestones to each goal, working backwards from the event date and
target performance. Milestones should support three types.

### Distance targets

- Run 5 km in a target time.
- Run 10 km in a target time.
- Run a half marathon in a target time.

### Pace targets

- 1 km at 3:45 / km.
- 5 km at 3:55 / km.
- 10 km at 4:05 / km.

### Training workout targets

- 6 × 1 km at 3:50 / km.
- 4 × 2 km at 4:00 / km.
- 3 × 10 minutes at threshold pace.

The system should eventually suggest appropriate intermediate milestones based
on the event date, target performance, and current fitness levels. Users should
be able to edit suggestions or add their own.

## 4. Current fitness and progress tracking

Maintain an estimate of current performance across distances and disciplines,
using recent activities, race results, and manually entered benchmarks.

| Distance | Illustrative current ability | Illustrative goal |
|---|---:|---:|
| 5 km | 19:15 | 18:30 |
| 10 km | 40:00 | 38:30 |
| Half marathon | 1:28:00 | 1:25:00 |

Use the gap between current ability and target performance to help determine
whether the athlete is on track. Keep actual results distinguishable from
estimates; see [Current Performance](./CURRENTPERFORMANCE.md).

## 5. Triathlon training allocation

For triathlon goals, consider the demands of each discipline rather than
treating the overall event distance as a single target. For example, an event
with a 400 m swim, 40 km bike, and 20-mile run needs considerably more run
preparation than swim preparation.

Provide separate progress and readiness indicators for swimming, cycling, and
running, taking into account event distances, target times, and current training
volumes. This could include comparing weekly training distances with the event's
discipline distances to help identify where additional training focus may be
needed.

## 6. Initial implementation

Prioritise:

- Multiple goals with A/B/C priorities.
- Event-specific data fields and custom distances.
- Individual triathlon discipline and transition targets.
- Manual milestone creation and management.
- Current fitness benchmarks and comparison against goals.

The data structure should allow automatic milestone suggestions,
activity-based progress tracking, and discipline-specific training analysis to
be introduced later without redesigning the goals system.

## Information to define

- **Goal and priority behavior:** Define what A/B/C priority means, whether
  multiple goals can share a priority, and how Completed, Abandoned, and Missed
  statuses are set (including whether any status changes automatically).
- **Target validation:** Define units and conversion rules, which targets are
  required for each target type, and how to handle conflicting targets such as
  a finish time and an average pace that do not match the distance.
- **Event-distance presets:** Define suggested distances for standalone bike
  and swim events. The current preset list only specifies running and triathlon
  distances.
- **Race details:** Consider capturing course profile/elevation, surface,
  pool/open-water conditions, and event location or time zone. Define whether
  these are required or optional and how they affect performance comparisons.
- **Triathlon totals:** Define whether total event distance is the sum of
  discipline distances only, how missing discipline or transition targets are
  displayed, and whether a supplied overall time must match the component
  targets.
- **Milestone tracking:** Define milestone dates, status, completion evidence
  (manual or activity-linked), and how missed, edited, or rescheduled milestones
  affect progress.
- **Readiness meaning:** Define the readiness calculation and its limits.
  Fitness gaps and weekly distance alone may not reflect consistency,
  long-session preparation, recovery, injury, transitions, or fueling.
- **Race lifecycle:** Define how past events are handled and whether a completed
  goal can store actual finish times and discipline splits for future
  performance benchmarks.
