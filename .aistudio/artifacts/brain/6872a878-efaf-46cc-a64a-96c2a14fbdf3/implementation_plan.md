# Garmin Connect Personal API Integration & Unified Connections Hub

Integrate Garmin Connect Personal API capabilities alongside Strava in the Settings App tab, generate a comprehensive `GARMIN.md` specification detailing Garmin vs. Strava data parity, and enforce authentic credential validation with zero synthetic fallback data.

## User Review & Critical Decisions

> [!IMPORTANT]
> This revised plan incorporates your feedback to evaluate the official **Garmin Connect Personal API** Swagger documentation (`developer.garmin.com/gc-developer-program/personal/swagger-docs`), generate a dedicated `GARMIN.md` reference guide, and house both the **Strava** and **Garmin Connect** integrations within the same unified connection box inside **Settings → App tab**.

- **Confirmed Decision 1**: Unify external fitness integrations: place the Garmin Connect status and action button directly inside the same card/box as the "Strava Connection" in `AthleteProfileModal.tsx` (Settings → App tab).
- **Confirmed Decision 2**: Create `GARMIN.md` providing an exhaustive evaluation and data mapping comparing Strava's API with the Garmin Connect Personal API (activities, raw `.FIT` file downloads via `download-service`, sleep stages, overnight HRV, and resting HR).
- **Confirmed Decision 3**: Enforce strict credential and API key validation. Disable sync triggers when inputs are unpopulated, eliminate all synthetic demo data generation, and provide honest, actionable error messages.
- **Confirmed Decision 4**: Support direct Garmin Connect Personal API key/token and credentials, plus manual CSV export upload as a resilient fallback.

---

## 1. Overview & Core Concept

- **What It Does**: 
  1. Unifies the athlete's cloud service management by placing Garmin Connect directly adjacent to Strava in the **Settings → App tab** connections panel.
  2. Creates a comprehensive `GARMIN.md` guide evaluating how Garmin's new Personal API Swagger endpoints (`https://personal.connectapi.garmin.com`) can supply all workout activities, raw `.FIT` files, and 24/7 background recovery telemetry that Strava cannot provide.
  3. Upgrades the Garmin synchronization flow to validate inputs, disallowing blank syncs and removing artificial mock data fallbacks.
- **Target Audience / Persona**: Multi-sport endurance athletes who train with Garmin devices and want unified control over their Strava workouts and Garmin recovery telemetry.
- **Key Value**: A single settings hub for third-party connections, clear documentation on Garmin's full data capabilities, and 100% trustworthy physiological metrics based on real watch data.

---

## 2. User Experience & Visual Design

### Unified Connections Card in Settings (App Tab)

The top section of the **Settings → App tab** (`AthleteProfileModal.tsx`) will be restructured into a cohesive **Connected Services** container:

```
┌─────────────────────────────────────────────────────────────┐
│  CONNECTED SERVICES & INTEGRATIONS                          │
│                                                             │
│  [ Strava Icon ]  Strava Connection                [Active] │
│                   Connected as Athlete                      │
│                   [ Manage / Reconnect ]  [ Disconnect ]    │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  [ Garmin Icon ]  Garmin Connect                  [Offline] │
│                   Overnight biometrics, HRV & sleep         │
│                   [ Connect Garmin Connect ]                │
└─────────────────────────────────────────────────────────────┘
```

1. **Shared Container Architecture**:
   - Both integrations live inside a single rounded container (`rounded-2xl bg-slate-950 border border-slate-800 p-4` in dark mode; `bg-slate-50 border-slate-200` in light mode).
   - Separated by a subtle hairline divider (`border-t border-slate-800/80` or `border-slate-200`).
2. **Strava Section**:
   - Displays active athlete name, status indicator, and buttons to Manage or Disconnect.
3. **Garmin Connect Section**:
   - Displays current connection status (`Active` with green badge or `Not Connected` / `Offline`).
   - If not connected, displays primary button: `Connect with Garmin` / `Configure Garmin Sync`.
   - If connected, displays `Sync Now`, `Manage Settings`, and `Disconnect`.
   - Clicking opens the upgraded `GarminSyncModal` with pre-filled saved email/token or Personal API key.
4. **Input Validation in Sync Modal**:
   - In `GarminSyncModal`, the `Sync` button is disabled whenever email and password (or session token) are empty.
   - Shows clean error diagnosis if credentials fail or if 2FA is required.

---

## 3. `GARMIN.md` Specification Scope

A dedicated `GARMIN.md` file will be created at the project root covering:

1. **Garmin Connect Personal API Overview**:
   - Base URL: `https://personal.connectapi.garmin.com`
   - Authentication model: Self-generated Personal API Key retrieved directly by athletes from Garmin Connect Web settings, exchanged for Bearer tokens.
2. **Garmin vs. Strava Parity Matrix**:
   - **Workouts & Activities**: How `/activitylist-service/activities/search/activities` and `/activity-service/activity/{activityId}` provide identical or richer data compared to `/api/v3/athlete/activities`.
   - **Raw .FIT File Access**: How `/download-service/files/activity/{activityId}` allows downloading native binary `.FIT` workout files directly from Garmin (a capability Strava restricts or requires manual exports for).
   - **Biometrics & Zones**: Heart rate zones from `/biometric-service/heartRateZones/v2`.
3. **Unique Garmin Data Beyond Strava**:
   - Overnight HRV rMSSD trends (`/hrv-service`).
   - Detailed sleep stages (Deep, REM, Light, Awake) & Sleep Scores (`/sleep-service`).
   - Waking Resting Heart Rate (RHR), Stress, Hydration, and Fitness Age (`/usersummary-service` & `/fitnessage-service`).
4. **Architecture Blueprint**:
   - Step-by-step roadmap for migrating or dual-sourcing activities and recovery data directly from Garmin Personal API.

---

## 4. Key Product Decisions & Trade-Offs

### Decision 1: Unified Connections Card vs. Separate Boxes
- *Chosen Approach*: Group Strava and Garmin Connect inside one unified "Connected Services" box in the Settings App tab.
- *Why*: Provides athletes with a clean, centralized control plane for all external data sources rather than scattering buttons across multiple screens.

### Decision 2: Elimination of Demo Data
- *Chosen Approach*: Fully remove `generateMultiWeekGarminLogs` fallback upon sync and disable buttons when credentials are blank.
- *Why*: The user explicitly stated: "We should require Garmin credentials & validate before syncing, remove all sample demo data".

### Decision 3: Garmin Personal API Key Support
- *Chosen Approach*: Support both direct Garmin Connect account authentication and the new Garmin Connect Personal API Key (`https://personal.connectapi.garmin.com`), plus direct CSV file upload.
- *Why*: Accommodates athletes using 2FA, athletes using Personal API keys, and those preferring file uploads.

---

## 5. Technical Architecture & Component Strategy

### System Layout Diagram

```
┌─────────────────────────────────────────────────────────────┐
│             AthleteProfileModal (Settings → App Tab)         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Connected Services Container                          │  │
│  │  ├── Zone A: Strava Connection (OAuth / Sync Status)  │  │
│  │  └── Zone B: Garmin Connect (Personal API / Sync)     │  │
│  └──────────────────────────┬────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────┘
                              │ Opens Garmin Sync Modal
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   GarminSyncModal Component                 │
│  ├── Credentials Validation: Email + Password Required      │
│  ├── Personal API Key & Session Token Support               │
│  ├── Disabled Button State when fields are blank            │
│  └── Direct CSV Dropzone                                    │
└─────────────────────────────┬───────────────────────────────┘
                              │ Validated Request
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Express Backend (server.ts)                 │
│  ├── POST /api/garmin/sync-multiweek                        │
│  ├── Validates credentials presence (Returns 400 if empty)  │
│  └── Proxies live Garmin Connect API (Returns 401 on error) │
│      * ZERO synthetic demo data generated *                 │
└─────────────────────────────────────────────────────────────┘
```

### Planned File Deliverables

1. `GARMIN.md`: Complete evaluation of Garmin Connect Personal API vs. Strava, endpoint mappings, and .FIT download flows.
2. `src/components/AthleteProfileModal.tsx`: Unified "Connected Services" card in the App tab containing both Strava and Garmin Connect controls.
3. `src/components/GarminSyncModal.tsx`: Disabled sync buttons on empty inputs, removal of instant demo tabs, and validated sync actions.
4. `src/utils/recoveryStorage.ts`: Elimination of silent synthetic data fallbacks upon sync failures.
5. `server.ts`: Strict input validation on `/api/garmin/sync-multiweek` ensuring no mock data is emitted when unauthenticated.
