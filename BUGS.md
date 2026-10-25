# Bug log

This log tracks confirmed behavior issues noted during code review. Items remain
open until fixed and verified.

## Open

### High: Strava client secret is exposed in frontend code

- **Location:** `src/utils/stravaOAuth.ts`; the default client secret is bundled
  with the browser app and used during OAuth token exchange.
- **Observed:** Anyone with access to the deployed app can inspect its frontend
  code and retrieve the client secret.
- **Current scope:** A single connection is sufficient during development, and
  use of this code is currently limited to the developer. This exposure is
  acknowledged for that development-only use.
- **Expected before broader use:** Rotate the exposed secret and move OAuth code
  exchange and secret handling to a server-side endpoint. Upgrade the Strava API
  connection before allowing other users or a wider deployment.

### Medium: Expired Strava access tokens are not refreshed

- **Location:** `src/utils/stravaOAuth.ts` (token persistence); upload entry points
  in `src/utils/stravaUpload.ts` and `src/App.tsx`.
- **Observed:** OAuth saves the refresh token and access-token expiry, but uploads
  use the saved access token without checking its expiry or refreshing it. The UI
  can therefore continue to show a connection that can no longer upload.
- **Expected:** Refresh an expired access token through the server, save the
  returned access token, refresh token, and expiry, then retry the upload or
  report a clear reconnection error.

### Low: FIT set timeline can end before the workout end time

- **Location:** `src/utils/fitGenerator.ts`, set timeline construction.
- **Observed:** Time scaling includes each set's rest period, including the last
  set, but a rest FIT record is emitted only between sets. The final rest is
  therefore included in the scale but omitted from the generated timeline.
- **Expected:** Scale against only the durations represented in the FIT timeline,
  or otherwise ensure the generated timeline ends at the workout end time.

## Missing Features & Roadmap Backlog

1. **Training Periodization Features:** Expanded periodization engine beyond the 0/3wk/4wk cycle models (macrocycle / mesocycle phase planning, base, build, peak, taper, race week).
2. **Training Goals & Event Calendar:** Target 'A' race and 'B' race dates, event distance/type (e.g. Sprint, Olympic, 70.3, Ironman, Marathon, Gran Fondo), countdown timeline, and peak taper guidance.
3. **Current Injuries & Physical Limitations:** Dedicated section to track active injuries, affected muscle groups/joints, rehab exercises, and sport modification rules (e.g. pull buoy swimming during calf strain).
4. **Training Availability & Work Schedule:** Weekly availability matrix: preferred days for specific activity types (e.g. Long Ride on Saturday, Track Run on Tuesday), workday designations, and work shift start/finish times to fit morning vs evening sessions.
5. **Sleep & Resting Heart Rate Tracking:** Tracking overnight sleep duration, sleep quality/REM/deep sleep, and morning resting HR trends to cross-correlate with HRV and recovery capacity.
6. **Simple Training Zone Calculator:** Interactive calculator for Heart Rate, Run Pace, Power & Swim pace zones based on Max HR, Resting HR (Karvonen), or values from a 30-minute all-out time trial effort. Bike power as FTP, and Swim zones based on 100m and 400m CSS time trials.
7. **Lap Display & Stream Overlay Markers:** Lap markers and split flags overlaid directly on the stream graph, with rolling averages for Power (NP), Pace, and Heart Rate resetting cleanly at lap demarcation points.
8. **Editable Laps with True Data Overwrite:** In-depth lap editor with direct stream recalculation and permanent data overwrite for watch sensor corruptions.
9. **Overall App Layout & Function Integration:** Unify GymFIT strength workout builder and Strava endurance analysis side into a cohesive single-pane dashboard (connecting gym strength work directly into overall athlete training load and recovery).
10. **Time/Distance Mode Graph Investigation:** Investigate visual similarity between Time and Distance modes on steady-paced workouts and ensure distinct tick intervals and axes.
11. **Time Formatting Uniformity:** Enforce format rule across all displays: anything 1 minute or above displays minutes and seconds (e.g. `1m 00s`, `1m 24s`, `25m 05s`).
12. **Activity-Specific Zones Preview:** Move the "Zones Preview" into each individual activity type tab. Add live previews for different zones: pace, power, and heart rate.
13. **Display Density Fine-Tuning:** Replace static preset density buttons with a continuous slider from 70% to 130% UI scaling.
14. **Direct Studio Text Customization:** Move "Customize Studio Text" directly into Settings right below "App Title & Branding", eliminating the 600ms long press.
15. **Ignore Lap Support for All Sports:** Extend the lap-ignoring and dynamic recalculation feature from swimming to running, cycling, and other activity types.
16. **Cycling Minimum Cadence & Torque Detection:** Remove the minimum cadence filter for cycling; instead, introduce torque/pedaling force detection.
17. **Goals** Bike details, Course elevation gain 100m, Bike TT / Triathlon, Characteristics Fast, aerodynamic, Course elevation gain 1,500m, Bike Road bike, Characteristics, "Hilly, variable gradients", 
