1. Start with a combined CTL
You can calculate training stress independently for each discipline:
Discipline	Training load metric
Swimming	sTSS
Cycling	TSS (power)
Running	rTSS (pace)

Then calculate the daily combined training stress:
\[
TSS_{tri}=sTSS+TSS_{bike}+rTSS
\]

Use that as the input into a conventional CTL calculation.
\[
CTL_t=CTL_{t-1}+\frac{TSS_{tri,t}-CTL_{t-1}}{42}
\]

This gives you a 42-day exponentially weighted average, following the standard TrainingPeaks approach. 

An important point: you don't need to apply race-duration weighting to these daily scores.

TSS already takes workout duration into account. A 5-hour bike ride will naturally contribute more training stress than a 1-hour swim, assuming comparable relative intensity.

In fact, applying an additional swim weighting of 0.12 to the combined TSS would effectively penalise swimming twice.

You can also maintain three separate CTLs:
- Swim CTL
- Bike CTL
- Run CTL
With the same time constant, their sum will equal the combined CTL.

This gives you both an overall picture and the ability to understand where the training load is coming from.\

2. The problem with simply adding TSS
There is one complication: TSS is not perfectly comparable across disciplines.

For example:
- Cycling TSS uses normalised power and FTP.
- Running rTSS uses normalised graded pace and threshold pace.
- Swimming sTSS uses normalised swim speed and threshold speed, with intensity factor cubed rather than squared.
The swim calculation is a practical approximation. It also has limitations around rest periods, swimming technique and different strokes. 

Even running and cycling are not scaled identically in TrainingPeaks: one hour at maximum steady-state intensity is given as 111 running TSS versus 100 cycling TSS. 

Consequently, a combined CTL is useful as a training-load measure, but I wouldn't assume that 100 points of swimming CTL represents exactly the same physiological adaptation as 100 points of cycling CTL.

This is where I think a second model becomes useful.


3. Introduce an event-specific Triathlon Fitness Index
Rather than simply adding the three CTLs, we can normalise them against discipline-specific targets.

For example, consider your Ironman scenario:
Example Ironman race profile
Swim 1:10 11.8%
Bike 5:15 52.9%
Run 3:30 35.3%

Total race time 9:55

These percentages give us an initial weighting for an overall race-specific fitness score.

However, we first need to normalise each discipline.

For example, suppose the athlete has the following CTLs relative to their respective target CTLs:

Discipline	'Current vs target'	'Relative fitness'
Swim	80/100	80%
Bike	100/100	100%
Run	90/100	90%

The targets are important. A CTL of 50 in swimming doesn't necessarily represent the same preparation as 50 in cycling.

We can then calculate a weighted geometric mean:
\[
TFI=100\times
\left(
S^{0.118}\times
B^{0.529}\times
R^{0.353}
\right)
\]

Where S, B and R are the normalised discipline values expressed as ratios rather than percentages.

In this example:
\[
TFI=93.9
\]

Triathlon Fitness Index: 93.9

This means the athlete has achieved approximately 94% of their weighted target preparation.

I favour a geometric mean over a straight weighted average because it makes it harder for excellent performance in one discipline to completely compensate for a weakness in another.

The individual discipline scores should still be displayed alongside it.



4. Make the weighting dependent on race distance
I wouldn't use fixed weights for every triathlon.

The importance of each discipline changes depending on the event.

For example:
Race distance	Swim	Bike	Run
Sprint	Higher	Medium	Medium
Olympic	Medium	Medium	Medium
Middle distance	Lower	Higher	Medium
Ironman	Lower	Highest	Medium

These are qualitative rather than prescribed percentages. Ideally, use the athlete's expected race splits to calculate the actual weights.

The weights could also be adjusted for course characteristics, such as a particularly hilly bike course or a technical swim.

5. What I would implement in your application
I would actually expose two different measurements rather than forcing everything into one number.
Primary training metric
Triathlon CTL

Sum of swim, bike and run TSS, processed through the standard 42-day CTL calculation.

This measures accumulated chronic training load.


Race-specific metric
Triathlon Fitness Index

A weighted combination of normalised swim, bike and run CTL, using the target race profile.

This measures preparation relative to the demands of a particular event.


Supporting metrics
- Swim CTL
- Bike CTL
- Run CTL
- Individual discipline target percentages
- Weakest discipline / limiting factor

One other thing I would include is the ability to calculate both metrics for different event distances without changing the underlying training data.

For example, an athlete might have a Triathlon CTL of 110, but a significantly different Fitness Index for a sprint triathlon compared with an Ironman.

My recommendation: use summed TSS for the actual CTL calculation, and introduce the weighted, normalised Fitness Index as a separate race-specific metric. This keeps the underlying training-load calculation relatively conventional while giving you the flexibility to assess preparation for different triathlon distances.
