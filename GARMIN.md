# Garmin Connect Personal API vs. Strava API: Data Capabilities & Integration Architecture

This document provides a comprehensive evaluation of the **Garmin Connect Developer Program - Personal API** (`https://developer.garmin.com/gc-developer-program/personal/swagger-docs/`) in comparison with the **Strava V3 API**. It details what data FIT Track currently retrieves from Strava, what data can be retrieved directly from Garmin Connect, and an architectural blueprint for migrating or dual-sourcing data.

---

## 1. Executive Summary & Overview

Historically, third-party fitness applications have relied on Strava because Garmin's enterprise API required strict B2B partner approval, $5,000 setup fees, and business vetting. 

The **Garmin Connect Personal API** (`https://personal.connectapi.garmin.com`) fundamentally changes this:
- **Direct User Access**: Individual Garmin users can self-generate a Personal API Key or Access Token directly from Garmin Connect Web settings (`connect.garmin.com`).
- **Read-Only / Pull-Only**: Designed for athletes and enthusiasts to pull their own workouts, physiological telemetry, and raw activity files.
- **Biometrics Beyond Strava**: While Strava strictly isolates data to recorded workout sessions, Garmin captures 24/7 continuous autonomic metrics (sleep architecture, overnight HRV rMSSD, continuous heart rate, stress, and respiration).
- **Direct Raw `.FIT` Access**: Garmin provides direct binary `.FIT` file downloads for every activity, avoiding Strava's rate-limited or stripped stream approximations.

---

## 2. Garmin Personal API vs. Strava API: Feature Parity Matrix

| Capability / Metric | Strava API (Current FIT Track Source) | Garmin Connect Personal API (Swagger Endpoint) | FIT Track Advantage / Impact |
| :--- | :--- | :--- | :--- |
| **Activity Summaries** | `/api/v3/athlete/activities`<br>*(name, type, distance, moving time, elapsed time, total elevation, average HR, max HR, average watts)* | `/activitylist-service/activities/search/activities`<br>`/activity-service/activity/{activityId}`<br>*(full metadata, start time, device model, sport type, splits, laps)* | **Equal/Superior**: Garmin provides identical high-level stats plus device hardware metadata (e.g. Forerunner 965, Edge 840). |
| **Raw `.FIT` Workout Binary** | **Restricted / Not Available** via standard Strava API (only streams like time, watts, lat/lng). | `/download-service/files/activity/{activityId}`<br>*(Direct raw `.FIT` file download)* | **Massive Advantage**: Can download exact original `.FIT` files with developer data fields, running dynamics, and power metrics directly. |
| **Workout Data Streams** | `/api/v3/activities/{id}/streams`<br>*(time, watts, cadence, heartrate, latlng, altitude, temp)* | Built into `.FIT` payload or `/activity-service/activity/{activityId}/details` | **Equal**: Native `.FIT` decoding provides sub-second record resolution without Strava sampling downsampling. |
| **Heart Rate Zones** | `/api/v3/athlete/zones` (basic static 5-zone HR) | `/biometric-service/heartRateZones/v2` | **Superior**: Reads dynamic sport-specific zones configured directly on the Garmin device (e.g., separate Cycling vs. Running zones). |
| **Overnight HRV (rMSSD)** | ❌ **Not Available in Strava** | `/hrv-service/hrv/daily`<br>`/hrv-service/hrv/{calendarDate}` | **Game Changer**: Direct 7-day rolling HRV baseline, nightly average rMSSD, 5-minute epoch readings, and autonomic balance status. |
| **Sleep Architecture & Scores** | ❌ **Not Available in Strava** | `/sleep-service/sleep/daily`<br>`/sleep-service/sleep/{calendarDate}` | **Game Changer**: Total sleep time, Deep sleep %, REM sleep %, Light sleep %, Awake duration, and overall 0-100 Sleep Score. |
| **Waking Resting Heart Rate (RHR)** | ❌ **Not Available in Strava** | `/usersummary-service/usersummary/daily` | **Direct Integration**: Actual lowest resting heart rate recorded during sleep or early waking, eliminating manual entry. |
| **All-Day Stress & Body Battery** | ❌ **Not Available in Strava** | `/usersummary-service/usersummary/daily/stress` | **Added Value**: 24/7 autonomic stress score and Body Battery recharge/depletion curves. |
| **Fitness Age & VO2 Max** | ❌ **Not Available in Strava** | `/fitnessage-service/fitnessage/v2/{calendarDate}` | **Added Value**: Garmin estimated biological fitness age and cardiorespiratory fitness scores. |
| **Hydration & Weight** | ❌ **Not Available in Strava** | `/usersummary-service/usersummary/hydration`<br>`/weight-service/weight/range` | **Added Value**: Daily fluid intake tracking and smart scale body composition logs. |

---

## 3. Deep-Dive: Garmin Swagger Service Endpoints

Based on Garmin's OpenAPI specification (`https://personal.connectapi.garmin.com`):

### 1. `activitylist-service` & `activity-service`
- **Search Activities**:
  - `GET /activitylist-service/activities/search/activities?start={index}&limit={count}`
  - Parameters: `startDate`, `endDate`, `activityType`
  - Returns array of activity summary objects: `activityId`, `activityName`, `activityType`, `startTimeLocal`, `distance`, `duration`, `elapsedDuration`, `movingDuration`, `elevationGain`, `averageSpeed`, `maxSpeed`, `averageHR`, `maxHR`, `averageWatts`, `normalizedPower`, `trainingStressScore`, `aerobicTrainingEffect`, `anaerobicTrainingEffect`.
- **Activity Detailed Split / Lap Breakdown**:
  - `GET /activity-service/activity/{activityId}`
  - Returns comprehensive lap intervals, sensor metadata, weather conditions at start, and battery levels of connected accessories (power meters, HRM straps).

### 2. `download-service`
- **Original `.FIT` File Download**:
  - `GET /download-service/files/activity/{activityId}`
  - Returns: `application/octet-stream` (GZIP or raw `.FIT` binary).
  - Use case: Directly decodable with FIT SDK in FIT Track for 100% fidelity analysis, interval detection, and power curve extraction.

### 3. `hrv-service`
- **Daily HRV Summary**:
  - `GET /hrv-service/hrv/daily`
  - Returns:
    ```json
    {
      "calendarDate": "2026-10-25",
      "weeklyAvg": 78,
      "lastNightAvg": 82,
      "lastNight5MinHigh": 104,
      "baseline": {
        "lowUpper": 68,
        "balancedLow": 72,
        "balancedUpper": 88
      },
      "status": "BALANCED"
    }
    ```
  - Directly feeds FIT Track's Daily Readiness Score, rolling 7-day corridor, and sympathetic vs. parasympathetic tone analysis.

### 4. `sleep-service`
- **Daily Sleep Summary & Stages**:
  - `GET /sleep-service/sleep/{calendarDate}`
  - Returns:
    ```json
    {
      "dailySleepDTO": {
        "calendarDate": "2026-10-25",
        "sleepTimeSeconds": 28440,
        "deepSleepSeconds": 5100,
        "lightSleepSeconds": 16200,
        "remSleepSeconds": 5940,
        "awakeSleepSeconds": 1200,
        "sleepScores": {
          "overall": { "value": 88, "qualifierKey": "EXCELLENT" }
        }
      }
    }
    ```

### 5. `usersummary-service`
- **Daily Physiological Summary**:
  - `GET /usersummary-service/usersummary/daily?calendarDate={YYYY-MM-DD}`
  - Returns:
    - `restingHeartRate`: (e.g. `41`)
    - `maxHeartRate`: (e.g. `184`)
    - `totalSteps`, `activeCalories`, `totalCalories`
    - `averageStressLevel`, `maxStressLevel`, `restStressDuration`

---

## 4. Authentication Architecture

The Garmin Connect Personal API utilizes a modern token-based authentication approach:

1. **User Generates Personal API Key**:
   - The athlete navigates to **Garmin Connect Web** (`https://connect.garmin.com/modern/settings/accountInformation` or developer portal).
   - Generates a **Personal API Key / Bearer Token**.
2. **FIT Track Client / Proxy Configuration**:
   - The athlete enters their Personal API Key in FIT Track (**Settings → App tab → Garmin Connect**).
   - The key is securely passed to the FIT Track proxy server via `Authorization: Bearer <API_KEY>` or stored locally on device.
3. **Automated Data Pull**:
   - `/api/garmin/sync-multiweek` queries the Personal API endpoints on `https://personal.connectapi.garmin.com` with zero web-scraping fragility and zero SMS 2FA hurdles.

---

## 5. Migration & Integration Strategy for FIT Track

FIT Track can leverage both platforms simultaneously for optimal athlete experience:

1. **Phase 1 (Current)**:
   - **Strava**: Primary source for community activities, social feed, and gym activity upload.
   - **Garmin Connect**: Primary source for overnight biometric recovery telemetry (Sleep, Resting HR, HRV rMSSD) via direct validated credentials or Personal API Key.
2. **Phase 2 (Dual-Source Workouts)**:
   - Enable importing workouts directly from Garmin Connect via `/activitylist-service/activities/search/activities` and downloading raw `.FIT` binaries via `/download-service/files/activity/{activityId}`.
   - This removes the reliance on Strava API rate limits (100 requests / 15 minutes) for multi-week historical analysis.
3. **Phase 3 (Unified Dashboard)**:
   - Align daily workout stress (TSS / Training Load from Garmin or Strava) directly with overnight recovery scores on the Daily Training Readiness dashboard.
