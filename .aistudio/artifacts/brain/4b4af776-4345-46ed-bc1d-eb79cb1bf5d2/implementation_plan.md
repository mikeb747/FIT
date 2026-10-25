# Smart Strava Caching, Activity Type Display & Google Sheets Telemetry Export

A unified plan to implement smart Strava delta-synchronization, epoch-based historical pagination ("More Activities"), enriched activity type display logic, and Google Sheets integration for exporting enhanced workout analysis and sensor streams (removing the "New / Unpublished" badge upon sync).

---

### User Review & Critical Decisions

> [!IMPORTANT]
> **Strava API `before` Epoch Confirmation**:
> Yes! The `before` parameter (`integer query`) on the Strava Playground (`https://developers.strava.com/playground/`) and the Strava Reference Docs (`https://developers.strava.com/docs/reference/#api-Activities-getLoggedInAthleteActivities`) represents seconds since Unix epoch. We use `before=${Math.floor(new Date(oldestActivity.start_date).getTime() / 1000)}` to cleanly paginate backward without page drift.

- **Decision 1: Smart Incremental Sync (< 24h)**:
  - When refreshing, if checked in the last 24 hours, the app requests only the latest 5 activities (`per_page=5`).
  - Prepend new activities and update `last_refresh_timestamp`.
  - Cached activities are never deleted or re-fetched. If on Day 1 you have 100 activities and on Day 2 you record 5 new ones, only 5 are fetched, resulting in 105 total activities.
- **Decision 2: "More Activities" Pagination**:
  - An append-only button at the bottom of the feed queries `before=${oldestEpoch}&per_page=30`.
  - Appends older sessions to the bottom of the cumulative cache and IndexedDB.
- **Decision 3: Activity Type Logic**:
  - Group and format activity types with clear visual hierarchy:
    - Primary Strength / Gym: `WeightTraining`, `Workout`, `Crossfit` (highlighted with amber badges/accents).
    - Cardio / Endurance: `Run`, `Ride`, `VirtualRide`, `Rowing`, `Walk`, `Hike`, `Swim`.
  - Provide quick category filter pills or type chips so users can toggle between Gym Workouts and All Activities.
- **Decision 4: Enhanced Data & Google Sheets Export**:
  - Connect to user's Google Account using Google Sheets (`spreadsheets`) and Drive (`drive.file`) scopes.
  - Enhanced data packet includes:
    1. **Core Metadata**: Date, Title, Activity Type, Duration, Distance, Calories/Work (kJ).
    2. **App Strength Analysis**: If logged via GymFIT, include exercises, sets, weights (kg), reps, and muscle groups.
    3. **Strava Stream Telemetry**: Heart rate stats (avg/max/zones), cadence, power/watts, velocity, elevation profile.
  - Once appended to the Google Sheet, mark `googleDrivePublishedAt` timestamp in IndexedDB and remove the "New / Unpublished" badge.

---

### 1. Overview & Core Concept

- **What It Does**:
  1. **Efficient Caching & Pagination**: Keeps your workout history permanently available offline in local storage and IndexedDB, performing lightweight 5-item checks when refreshed within 24 hours, and loading 30 older activities with a single tap of "More Activities".
  2. **Smart Type Display**: Differentiates gym/weight training workouts from cardio/rides/runs with customized visual badges, metric highlights (e.g. Volume & Sets for strength vs. Pace & Elevation for cardio), and type filtering.
  3. **Google Sheets Sync**: One-tap export of enhanced activity data (including second-by-second Strava sensor streams and app-calculated metrics) directly into a Google Spreadsheet in the user's Google Drive, automatically clearing the "New / Unpublished" badge upon publication.

---

### 2. User Experience & Visual Design

- **Activity Feed & Type Display**:
  - Activity cards dynamically adapt their primary metric row based on activity type:
    - **Strength / WeightTraining**: Total sets, estimated volume, target muscle groups, and duration.
    - **Run / Walk / Hike**: Distance, pace (min/km), heart rate, and cadence.
    - **Ride / Cycling**: Distance, average speed, watts/power, and elevation gain.
  - Type badge indicators use clean unboxed typographic labels with domain-native icons (Dumbbell for strength, Bike for ride, Flame/Footprints for runs).
- **"More Activities" Bottom Control**:
  - Pinned naturally at the end of the activity list.
  - Minimum 48px touch target with active spinner: `"Loading older workouts..."`.
  - Seamlessly appends results without page jumps or scroll displacement.
  - Shows quiet end-of-list message when history is fully exhausted.
- **Google Sheets Export & Badge Lifecycle**:
  - **New / Unpublished Badge**: Highlighted on fresh activities until pushed to Google Sheets.
  - **Export Action**: Direct "Export to Google Sheets" action button on activity detail sheets or bulk sync toolbar.
  - Shows clear progress indicator during export, creating/appending to "GymFIT Training Log" spreadsheet.
  - On success, the "New / Unpublished" badge is immediately removed.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Direct Client Google Workspace OAuth Flow**:
  - Uses the official Google Workspace OAuth pattern with Firebase Auth client popup.
  - Access tokens cached in memory; zero server redirects or fragile redirect URIs.
- **Decision 2: Google Sheet Structure**:
  - Creates a dedicated sheet with structured columns:
    - `Timestamp`, `Activity ID`, `Name`, `Type`, `Moving Time`, `Elapsed Time`, `Volume / Distance`, `Avg HR`, `Max HR`, `Avg Watts`, `Avg Cadence`, `Detailed Exercise Breakdown / Stream Summary`.
- **Decision 3: Backward Compatible IndexedDB Storage**:
  - Uses the existing `gymfit_strava_activity_data` IndexedDB database to store the `googleDrivePublishedAt` timestamp so badges stay synchronized across app reloads.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Strava Activities Engine                        │
│                                                                        │
│   [ Sync / Refresh ] ──> Elapsed < 24h?                                │
│                            ├── YES: fetch 5 latest (per_page=5)        │
│                            └── NO:  fetch 30 latest                    │
│                            └── Prepend & Deduplicate in Local Cache    │
│                                                                        │
│   [ "More Activities" ] ─> GET /athlete/activities?before=${oldest}   │
│                            └── Append 30 older to bottom of cache      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       Activity Type Classification                     │
│   ├── Strength: WeightTraining, Workout, Crossfit                      │
│   ├── Cardio:   Run, TrailRun, Walk, Hike, Swim                        │
│   └── Cycling:  Ride, VirtualRide, GravelRide                          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Google Sheets Enhanced Sync                       │
│   1. Gather Activity Summary + Telemetry Streams (HR, Watts, Cadence)  │
│   2. Authenticate Google Workspace (sheets & drive.file scopes)        │
│   3. Append row(s) to "GymFIT Training Log" spreadsheet                │
│   4. Update IndexedDB: record.googleDrivePublishedAt = Date.now()      │
│   5. Clear "New / Unpublished" badge in UI                             │
└────────────────────────────────────────────────────────────────────────┘
```

- **Phased Implementation Order**:
  1. **Phase 1: Strava Delta Sync & "More Activities" Pagination**:
     - `src/utils/stravaActivities.ts`: Add `syncLatestStravaActivities` (< 24h delta sync), `fetchOlderStravaActivities` (`before=${epoch}`), and timestamp management.
     - `src/components/StravaActivitiesTab.tsx`: Add "More Activities" bottom button and loading state.
  2. **Phase 2: Activity Types Display Logic**:
     - Implement activity categorization, type-specific metric highlights (sets/reps vs distance/pace), and category filtering.
  3. **Phase 3: Google Sheets OAuth & Enhanced Data Export**:
     - Trigger Google Workspace OAuth setup for `spreadsheets` and `drive.file`.
     - Implement export workflow to format streams & strength analysis and append to Google Sheets, clearing the unpublished badge upon completion.
