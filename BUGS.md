
## Missing Features & Roadmap Backlog
**Quick fixes (Completed)**
- [x] 1. Activities with the Ignored badge do not show New or UNPUBLISHED badge, and the UNPUBLISHED badge has been removed.
- [x] 2. Removed the delete button from the list of activities (deletion is accessed when clicking into an activity).
- [x] 3. Removed spacing between activity type tabs and placed a 2px vertical dividing line between tabs so All, Swim, Bike, Run, Gym with counts take up minimal space.
- [x] 4. Altered spacing and position of icons/badges flush to outer box corners:
  - a. Category icon moved flush to top-left corner (no spacing above or left).
  - b. "New" badge moved flush to top-right corner (no top or right spacing, omitted if Ignored).
  - c. Kudos / Deleted badge moved flush to bottom-right corner (no bottom or right spacing).
  - d. TSS added flush to bottom-left corner (no bottom or left spacing).
  5. Swimming activties 50m/100m/400m/1.9k/3.8k, 5k/10k?

**Larger fixes**
Removed the unpublished badge for now until we have the data we need to perform complex analysis.



0.4  **When:** I select an activity from "Time In Training Zones (Per Activity)" in the Fitness Tab, it doesn't match when I click on the same activity in the Activities tab, which is correct. 
The "Time in Training Zones, "Heart Rate Zones" and "Pace Zones" do not match, Not generated, "Session average"
0.7. **Lap Display & Stream Overlay Markers:** Lap markers and split flags overlaid directly on the stream graph, with rolling averages for Power (NP), Pace, and Heart Rate resetting cleanly at lap demarcation points.
0.8. **Editable Laps with True Data Overwrite:** In-depth lap editor with direct stream recalculation and permanent data overwrite for watch sensor corruptions.


5. **Training Periodization Features:** Expanded periodization engine beyond the 0/3wk/4wk cycle models (macrocycle / mesocycle phase planning, base, build, peak, taper, race week).
66. **Training Goals & Event Calendar:** Target 'A' race and 'B' race dates, event distance/type (e.g. Sprint, Olympic, 70.3, Ironman, Marathon, Gran Fondo), countdown timeline, and peak taper guidance.
7. **Current Injuries & Physical Limitations:** Dedicated section to track active injuries, affected muscle groups/joints, rehab exercises, and sport modification rules (e.g. pull buoy swimming during calf strain).
8. **Training Availability & Work Schedule:** Weekly availability matrix: preferred days for specific activity types (e.g. Long Ride on Saturday, Track Run on Tuesday), workday designations, and work shift start/finish times to fit morning vs evening sessions.
9. **Sleep & Resting Heart Rate Tracking:** Tracking overnight sleep duration, sleep quality/REM/deep sleep, and morning resting HR trends to cross-correlate with HRV and recovery capacity.
10. **Simple Training Zone Calculator:** Interactive calculator for Heart Rate, Run Pace, Power & Swim pace zones based on Max HR, Resting HR (Karvonen), or values from a 30-minute all-out time trial effort. Bike power as FTP, and Swim zones based on 100m and 400m CSS time trials.
11.  **Lap Display & Stream Overlay Markers:** Lap markers and split flags overlaid directly on the stream graph, with rolling averages for Power (NP), Pace, and Heart Rate resetting cleanly at lap demarcation points.
12. **Editable Laps with True Data Overwrite:** In-depth lap editor with direct stream recalculation and permanent data overwrite for watch sensor corruptions.

13. **Time/Distance Mode Graph Investigation:** Investigate visual similarity between Time and Distance modes on steady-paced workouts and ensure distinct tick intervals and axes.
14. . **Ignore Lap Support for All Sports:** Extend the lap-ignoring and dynamic recalculation feature from swimming to running, cycling, and other activity types.
15. **Cycling Minimum Cadence & Torque Detection:** Remove the minimum cadence filter for cycling; instead, introduce torque/pedaling force detection.
16. **Goals** Bike details, Course elevation gain 100m, Bike TT / Triathlon, Characteristics Fast, aerodynamic, Course elevation gain 1,500m, Bike Road bike, Characteristics, "Hilly, variable gradients",
17. Events change, but details remain, Ironman to Run leaves distance at 112 miles or whatever

How do we quantify readyness for a Sprint Tri vs Readyness for a Ironman.
Same with running, 
Also add selectors for Running and cycling, and rename the top header in the Fitness from Triathlon to Whatever, perhapse depending on what is slected
