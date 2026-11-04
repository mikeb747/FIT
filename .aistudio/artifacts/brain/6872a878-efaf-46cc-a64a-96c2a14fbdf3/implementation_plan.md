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

5. **Top Tab Badge Centering & Spacing (`src/App.tsx`)**
   - Matched font size (`text-xs font-extrabold`) of the Readiness (`87%`) and Fitness score badges directly to the main tab text.
   - Unified vertical alignment with `leading-none` and flex centering so the label ("Readiness") and badge numbers ("87%") share the exact same vertical center line.
   - Removed artificial minimum width constraints (`min-w-[34px]`) and uneven vertical padding (`pt-[2px] pb-[4px]`), applying balanced padding (`px-[5px] py-[3px]`) for visually equal spacing around the numbers to the border on all sides.
   - Applied identical alignment and symmetrical spacing to the Fitness tab badge.

6. **Floating Filter & Search Buttons Symmetrical Alignment (`src/components/StravaActivitiesTab.tsx`)**
   - Grouped the floating Sort & Filter button (bottom-left) and Search button (bottom-right) into a unified, shared floating action bar (`fixed bottom-5 left-0 right-0 z-30 pointer-events-none flex items-center justify-between px-4 sm:px-6 md:px-8` with explicit inline `style={{ bottom: '20px' }}`).
   - Aligned both buttons on the identical vertical baseline and bottom distance (`20px`), ensuring pixel-perfect vertical symmetry and identical responsive horizontal edge insets across all viewport widths.
   - Cleaned up badge dimension styling and preserved full outside-click handling for both popovers.
