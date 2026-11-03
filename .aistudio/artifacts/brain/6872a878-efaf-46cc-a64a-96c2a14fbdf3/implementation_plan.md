# Activity Stream & Modal UI Refinements

## Changes Implemented

1. **Interactive Streams & Plot Pin & Tooltip Styling (`src/components/StravaStreamPlot.tsx`)**
   - Updated the pinned point card and hover tooltip to a clean **white background with a grey border** (`bg-white/95 border-slate-300 text-slate-900 shadow-xl`) as requested, replacing the black background and yellow border.
   - Restyled the pinned notches and point circle to white fill with a grey stroke (`#64748b`).

2. **Distance vs. Time Projection Fix (`src/components/StravaStreamPlot.tsx`)**
   - Corrected SVG coordinate mapping:
     - In **Distance** mode, horizontal position now maps directly to cumulative meters traveled (`p.distMeters / totalDist`). When stopped, distance does not advance horizontally.
     - In **Time** mode, horizontal position maps to elapsed seconds (`p.timeSec / totalTime`), accurately showing elapsed time progressing during stops.
   - Updated `getIdxFromClientX` to perform a closest-x search across data points, ensuring clicking and sliding align accurately in both modes.

3. **Time in Training Zones Badge (`src/components/ActivityZoneChart.tsx`)**
   - Removed the `"Session average"` badge entirely. Only `"1-sec streams"` is shown when detailed second-by-second stream telemetry is present.

4. **Header & Footer Controls (`src/components/StravaActivityModal.tsx`)**
   - **Top Header:** Removed the Fix icon button and the Delete button, leaving only the Close (`X`) button in the top right.
   - **Bottom Div:**
     - Moved the **Delete** button to the bottom action group next to "Close" and "Fix Inaccurate Data".
     - Removed the `"Connect Google to Export"` button from the bottom; the export button now renders only when Google is connected.
