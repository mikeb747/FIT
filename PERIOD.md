I'd expand the periodization engine quite substantially. Rather than simply offering more cycle lengths (3-week, 4-week, etc.), I'd introduce a system that understands training strategy, periodisation phases, progression, recovery and race-specific preparation.

The important distinction is that periodisation isn't just deciding how many weeks are in a cycle. It's deciding:

- What qualities are you trying to develop?
- In what order should you develop them?
- How much training load should be applied?
- When should training become more race-specific?
- When should fatigue be reduced?
- How should training adapt if performance or recovery isn't progressing as expected?

For your app, I'd separate the system into several layers.

# 1. Periodisation strategies

These are the fundamental approaches the user can select when creating a training plan.

[Os 7 princípios do treinamento físico e sua importância para os resultados - 12/05/2021 - UOL VivaBem](https://images.openai.com/static-rsc-4/ZAGIzahQ-Jv6loBWNVFV_oTGBdTlFQL8POjBY85JZe4SdHJEgTsaVDtpsdqf3F9-kqVhSrUP6HR3t0RRj8DUY3GiwjbgdfDKTHdpWiVPgX94aQ-MNBK0mJW5cxlnoc_TjtdL8uaOoCjdbqk9zHa8YluCHSKGD_VW5GNY3czWt-Q?purpose=inline)

1\. Traditional / Linear periodisation

Gradually moves from general preparation towards specific, high-intensity training.

- Base → Build → Peak → Taper
- Volume generally starts higher and reduces as intensity increases.
- Good for longer preparation periods and first-time event preparation.

[How To Train for A 5K - La Jolla Half Marathon, 10K, & 5K](https://images.openai.com/static-rsc-4/1J8tJ3oiboEUEDCDG2RJ0yMotJKyO9uDYE9jvmVMQ2du_L2R1sPknBT_Hnh9VfEpAuZuSS4_K7pmUcq7GzQw7uPontlgzVDn3SUxvyetJc8Jt6SwKDySkb5HEuFj5K04GcoZZFA7szDzdnp0JatmsmLFTL_egEDnQQHwzPUJ22I?purpose=inline)

2\. Undulating / Non-linear periodisation

Training emphasis changes frequently rather than following a strictly sequential progression.

- Vary intensity and training focus within a week or fortnight.
- Maintain multiple fitness qualities simultaneously.
- Useful for athletes who train several disciplines or have limited weekly availability.

[RIDEBOX | Kinetic Performance](https://images.openai.com/static-rsc-4/80D6hqbPI9GIT8C7CXyfIgMu-uF_S8K5lNZrURY4bS0SCiprCTRkbOvt93vIb1t5Og79zYo_GOCoznhpWTdEiN6kNsH7WcFRlSQIVm7juvYl9yRDeHVeYXvwchvt0wFh0Sa9hyPxv0dchISoMnkR6YYu5RK7Wq8Q_gOAx4WVBHw?purpose=inline)

3\. Block periodisation

Concentrates training on a smaller number of qualities within defined blocks.

- Accumulation: build general capacity.
- Transmutation: develop more specific performance.
- Realisation: convert fitness into race readiness.
- Useful for experienced athletes and targeted performance improvements.

[UIndy Women's Triathlon Team Kicks Off Season 2 with Strong 4th Place  – TriLaunchpad](https://images.openai.com/static-rsc-4/a2tIpoFWKmz1VtkWab5wq2bjXm6O5zYPnud1njDTPn4nGRqb3Nj27BAZaSj3bH59GQtIcVPL0tAi58YUv8pkjzUpppE9tH8k9rNygzluP5Mu-RIzfk9vY1CQdsvCrTLREQ0w4LfnKTx2snHrnGqry74D-lUFAEi5z95rLiSoblM?purpose=inline)

4\. Concurrent periodisation

Develops several fitness qualities or disciplines at the same time.

- Swim, bike and run develop in parallel.
- Different disciplines can have different training emphases.
- Particularly relevant to triathlon.

[Technology focus: Rubber traction in Adidas sub-100 gram supershoe | European Rubber Journal](https://images.openai.com/static-rsc-4/S2ErOgko0loAwtqnAl3sVHG-FPeyuAzp2fvi1LcxUjKKdccb1k3bFs58Og_peJmYGSiz6MGdMqncGvQN6gOTZl85Mn055D7SvtjFquKNAAWfr19Gpf2EMgxBwL0f3GD4QqepSS8RPK0oT2mmwvFFgH_v210GuboEx7iCWMmcldk?purpose=inline)

5\. Reverse periodisation

Starts with relatively high-intensity, lower-volume work and progressively introduces greater endurance volume.

- Can suit athletes with limited initial training time.
- Often useful for shorter events or certain off-season programmes.
- Requires careful progression before longer endurance events.

[Best Stretches to Do After a Run, According to a Physical Therapist - Men's Journal](https://images.openai.com/static-rsc-4/A01kkruff_cRFdnphV5Jxwv6XKFNNITApblnvubJdibDSuh_sHoSDI1yuzueuWNYwiw9jU5L9oPAbOxyEBmYaRsFvt1nswmD4cDFmVJFBcYnjtvBqKgTSDQ7FWH4DiqXbEWc8jzWUT3lsgcP0ORvFebbHnWHjLGL5EeRoUPXCZQ?purpose=inline)

6\. Autoregulated / Adaptive periodisation

Training changes according to the athlete's actual performance and recovery.

- Adjusts sessions based on fatigue, readiness and recent performance.
- Can extend or shorten training blocks.
- Useful when actual training doesn't follow the original schedule.

These strategies aren't necessarily mutually exclusive. For example, you could use block periodisation within a traditional macrocycle, with concurrent swim/bike/run development and autoregulated recovery.

# 2. Macrocycle and mesocycle phase planning

I'd make this the central feature of the expanded engine.

Instead of assuming every training programme follows the same sequence, introduce configurable training phases.

| Phase                | Primary objective      | Typical emphasis                       |
| -------------------- | ---------------------- | -------------------------------------- |
| General preparation  | Establish fitness      | Aerobic capacity, strength, technique  |
| Base                 | Develop endurance      | Volume, aerobic efficiency             |
| Build                | Improve performance    | Threshold, VO2 max, muscular endurance |
| Specific preparation | Event-specific fitness | Race pace, terrain, duration           |
| Peak                 | Maximise performance   | High-quality specific sessions         |
| Taper                | Reduce fatigue         | Lower volume, maintain intensity       |
| Race week            | Competition readiness  | Recovery, short activation sessions    |
| Transition           | Recover and reset      | Rest, cross-training, low intensity    |

You could also support specialised phases:

- Strength development
- Speed development
- VO2 max development
- Threshold development
- Technical development
- Race simulation
- Recovery / regeneration
- Maintenance

Important design decision: Phases shouldn't have fixed durations.

A base phase might last 12 weeks for one athlete and four weeks for another. A build phase might be split into multiple mesocycles.

The engine should allow:

- Multiple mesocycles within a macrocycle.
- Repeated phases.
- Skipped phases where appropriate.
- Different phase lengths.
- Multiple peaks in a season.

For example, an athlete preparing for three races could have two separate build/peak/taper sequences rather than one annual progression.

# 3. Mesocycle structures and progression models

This is where your existing 0/3-week/4-week cycle models fit.

I'd keep these as reusable cycle templates rather than treating them as the periodisation system itself.

Some additional models:

| Model      | Structure                          | Purpose                 |
| ---------- | ---------------------------------- | ----------------------- |
| 2:1        | 2 loading + 1 recovery             | Shorter progression     |
| 3:1        | 3 loading + 1 recovery             | Traditional progression |
| 4:1        | 4 loading + 1 recovery             | Longer loading blocks   |
| 2:1:1      | 2 loading + 1 recovery + 1 loading | Interrupted progression |
| 3:1:2      | 3 loading + 1 recovery + 2 loading | Extended development    |
| Continuous | No predetermined recovery week     | Adaptive training       |
| Flexible   | Recovery triggered by fatigue      | Autoregulated training  |

You could also introduce different progression models within those structures.

Progressive overload

Gradually increase training stress, such as:

- Weekly duration.
- Distance.
- Interval repetitions.
- Interval duration.
- Training intensity.
- Frequency.

Step loading

Increase load in steps, maintain it for a period, then increase again.

Wave loading

Alternate harder and easier weeks while gradually increasing the overall training stimulus.

Reverse progression

Start with relatively demanding sessions and gradually increase the volume or duration while maintaining intensity.

Maintenance

Maintain a developed fitness quality while focusing on another quality.

For example, maintain threshold performance while developing VO2 max.

# 4. Intensity distribution strategies

I'd make this another independent setting. It determines how the training load is distributed across intensity zones.

Polarised training

Typically approximately 80% low intensity, 20% high intensity.

Lots of easy training, with relatively little moderate-intensity work and a concentrated amount of high-intensity training.

Pyramidal training

Most training easy, progressively less at moderate and high intensity.

A common endurance training distribution, with more threshold work than a strongly polarised approach.

Threshold-focused training

Greater emphasis on sustained moderate-to-hard efforts.

Useful for developing sustained performance, particularly for events where threshold capability is important.

High-intensity focused

A greater proportion of training devoted to harder sessions.

Potentially useful for shorter preparation blocks, but requires careful fatigue management.

These percentages are illustrative templates, not universal prescriptions. The engine should support both heart-rate-zone and power/pace-based calculations, and distinguish session time from time actually spent in each zone.

# 5. Multi-peak and race-driven periodisation

This is particularly important if the app supports multiple A/B/C races.

I'd make races the anchors of the macrocycle rather than simply assigning a fixed training programme.

For example:

Example: 24-week season

Illustrative planning structure

1. Weeks 1–6: Base

   Aerobic development, technique and strength.
2. Weeks 7–12: Build

   Threshold, VO2 max and increasing training specificity.
3. Weeks 13–15: Specific preparation

   Race simulation and event-specific workouts.
4. Week 16: A race taper and race

   First major performance peak.
5. Weeks 17–18: Recovery and transition

   Recover and rebuild training capacity.
6. Weeks 19–21: Second build

   Focus on the next event's requirements.
7. Week 22: Specific preparation

   Race-specific training.
8. Weeks 23–24: Taper and B/A race

   Second performance opportunity.

The app should understand race priority:

- A race: Main performance objective. Full preparation and taper.
- B race: Important event, but training continuity and performance development remain priorities.
- C race: Training event, fitness test or supported workout. Usually minimal disruption to the training plan.

A C race shouldn't automatically trigger a full taper.

I'd also allow races to be classified by discipline and event demands. An Ironman-distance triathlon and a sprint triathlon shouldn't necessarily interrupt the training programme in the same way.

# 6. Discipline-specific periodisation

For a triathlon-focused engine, I would avoid assuming that all three disciplines need to be in the same phase simultaneously.

Instead, each discipline should have its own training emphasis.

For example:

| Discipline | Current phase | Primary objective               |
| ---------- | ------------- | ------------------------------- |
| Swim       | Base          | Technique and aerobic endurance |
| Bike       | Build         | FTP and sustained power         |
| Run        | Build         | Threshold and VO2 max           |
| Strength   | Maintenance   | Preserve strength               |

This is a powerful distinction.

An athlete could be:

- Building bike threshold.
- Maintaining running threshold.
- Developing swim technique.
- Reducing strength training volume.

The macrocycle coordinates the overall training programme, but each discipline can have its own mesocycles.

I'd also allow discipline-specific periodisation templates:

Running

- Aerobic base
- Threshold development
- VO2 max
- Speed/economy
- Race-specific endurance

Cycling

- Aerobic endurance
- Sweet spot
- FTP/threshold
- VO2 max
- Anaerobic power
- Race-specific power/duration

Swimming

- Technique
- Aerobic endurance
- CSS/threshold
- Speed
- Race-specific endurance
- Open-water preparation

This would work particularly well with separate performance profiles and benchmarks for swim, bike and run.

# 7. Adaptive periodisation and feedback

This is where I think the app could become more interesting than a conventional training-plan generator.

Rather than creating a 24-week plan and assuming everything goes to schedule, the engine should continually compare planned and actual training.

I'd introduce several adjustment mechanisms:

| Mechanism                 | What it does                                                |
| ------------------------- | ----------------------------------------------------------- |
| Fatigue adjustment        | Reduces load when accumulated fatigue is excessive          |
| Performance adjustment    | Changes training emphasis when progress stalls              |
| Recovery extension        | Extends recovery periods when necessary                     |
| Phase extension           | Allows more time to develop a fitness quality               |
| Phase advancement         | Moves on when targets are achieved                          |
| Missed-session adjustment | Redistributes training without blindly compressing sessions |
| Race adjustment           | Recalculates preparation following a race or changed event  |
| Maintenance adjustment    | Reduces training emphasis on qualities already developed    |

For example, imagine the athlete is completing a VO2 max development block.

The plan expects:

- Increasing interval duration.
- Increasing total time at VO2 max intensity.
- Improving repeatability.
- Maintaining aerobic volume.

But actual performance shows declining interval pace and increasing perceived exertion.

The engine could identify that the athlete isn't responding as expected and recommend an additional recovery week rather than automatically progressing to the next block.

This would also make use of your existing activity history and performance estimates.

# 8. Suggested architecture for your app

I would avoid building one enormous periodisation algorithm. Instead, create a hierarchy of independent but connected components.

Season / Annual Plan

Overall objectives, races, priorities and performance goals

Macrocycle

Overall training strategy and performance peaks

Mesocycles

Base, build, specific preparation, peak, taper, recovery

Swim

Build

CSS

Bike

Base

Endurance

Run

Build

VO2 max

Microcycles

Your existing 0/3-week/4-week cycle models, loading, recovery and progression

Individual Training Sessions

Workouts, intensity, duration, targets and execution

Feedback and Adaptation Engine

Actual activities, fatigue, recovery, performance changes and revised forecasts feed back into the plan.

## 9. Configuration options I'd expose

I would separate the settings into three groups.

A. Training strategy

- Periodisation model: Linear, Block, Undulating, Concurrent, Reverse, Adaptive.
- Intensity distribution: Polarised, Pyramidal, Threshold-focused, Custom.
- Overall training objective: Endurance, Speed, Strength, Performance, Maintenance.

B. Planning structure

- Macrocycle start and end dates.
- Number of planned performance peaks.
- Phase sequence and duration.
- Mesocycle duration.
- Microcycle template (0/3/4 weeks, 2:1, 3:1, 4:1, etc.).
- Recovery frequency.
- Taper duration.
- Discipline-specific phase overrides.

C. Progression and adaptation

- Volume progression model.
- Intensity progression model.
- Recovery triggers.
- Performance benchmarks.
- Phase advancement criteria.
- Missed-session handling.
- Race-driven adjustments.

# 10. What I'd actually build first

I wouldn't implement every strategy immediately. I'd prioritise the underlying data model so that new strategies can be added without restructuring the app.

My suggested development order:

| Priority | Feature                                   | Importance |
| -------- | ----------------------------------------- | ---------- |
| 1        | Macrocycle and mesocycle hierarchy        | Essential  |
| 2        | Configurable training phases              | Essential  |
| 3        | Multiple peaks and race integration       | Essential  |
| 4        | Independent swim/bike/run phases          | Essential  |
| 5        | Flexible microcycle templates             | High       |
| 6        | Volume and intensity progression models   | High       |
| 7        | Intensity distribution strategies         | High       |
| 8        | Adaptive phase progression                | High       |
| 9        | Automated fatigue/performance adjustments | Later      |
| 10       | Advanced block and reverse periodisation  | Later      |

One particularly important recommendation: Keep training phase, training strategy and cycle structure as separate concepts.

For example:

- Strategy: Block periodisation.
- Macrocycle phase: Build.
- Discipline: Running.
- Training emphasis: VO2 max.
- Mesocycle structure: 3:1.
- Intensity distribution: Polarised.
- Progression: Increase interval duration.

That combination is much more flexible than having a single setting called "4-week VO2 max block".

It also means you can create new combinations without having to develop an entirely new periodisation model every time.

Ultimately, I'd aim for an engine that can answer three questions:

1. Where am I going? What race or performance objective am I preparing for?
2. What should I be developing now? What fitness qualities should receive training priority?
3. Am I progressing as expected? Should the plan continue, adapt, recover or change direction?

That would give you a foundation for a genuinely flexible multi-discipline training planner rather than simply a collection of workout scheduling templates.&#x20;
