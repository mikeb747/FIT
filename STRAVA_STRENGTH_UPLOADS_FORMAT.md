# Strava Strength Training Uploads

This guide summarizes Strava's published upload formats and how GymFIT currently
uses them. Strava's upload documentation is the source of truth for accepted
fields and processing behavior; the examples below are not a promise that
Strava will display every exercise or metric in a particular way.

References:

- [Strava: Uploading to Strava](https://developers.strava.com/docs/uploads/)
- [Strava API reference: PowerStream](https://developers.strava.com/docs/reference/#api-models-PowerStream)
- [Strava API Playground](https://developers.strava.com/playground/)

## Supported strength upload formats

Strava documents structured sets for `WeightTraining`,
`HighIntensityIntervalTraining`, `Workout`, and `Crossfit` activities in FIT
files and in its limited strength-training JSON format.

GymFIT currently generates a Garmin FIT Activity file and uploads it through
Strava's uploads endpoint. It does not currently generate the JSON format.

### FIT set messages

Strava supports FIT `set` messages (global message number `225`) for the
strength activity types above. It supports exercises defined by the FIT SDK,
but notes that some exercise mappings may appear as a more general exercise in
Strava.

For FIT files containing sets, Strava's upload documentation says record
messages with timestamps are not required. The file must still include
`activity.timestamp` and `session.total_elapsed_time`; Strava uses these to
determine the activity start and end. Activity type is detected from
`session.sport` and `session.sub_sport`.

Relevant FIT `set` field numbers:

| Field | Name | Meaning |
|---:|---|---|
| 0 | `duration` | Set duration |
| 3 | `repetitions` | Repetitions performed |
| 4 | `weight` | Set weight |
| 5 | `set_type` | Active set or rest interval |
| 6 | `start_time` | Set start time |
| 7 | `category` | FIT exercise category |
| 8 | `category_subtype` | FIT exercise subtype |

GymFIT writes the set duration in FIT milliseconds, encodes weight in
kilograms using the FIT scale of 16, and writes `set_type` as `1` for a working
set and `0` for a rest interval. For its timed-exercise mode, GymFIT writes
zero repetitions and the recorded duration. These are GymFIT implementation
details; consult the FIT SDK for the complete binary profile and units.

### Strava's limited strength JSON format

The documented JSON format is for strength activities only. Its top-level
required fields are `version` (the string `"1.0"`), `start_time` (ISO 8601
with a timezone), `utc_offset` (seconds), `elapsed_time` (seconds), and a
non-empty `sets` array. `active_time`, `total_calories`, `creator`, and
`streams` are optional.

Each set requires `exercise_type`. The documented optional fields are
`repetitions` (integer), `weight` (number, kilograms), `duration` (integer,
seconds), and `start_time` (ISO 8601 with timezone). Strava's supported
`exercise_type` identifiers are the exact enum values listed on its upload
page: use identifiers such as `BARBELL_BENCH_PRESS` or `CORE_GENERIC`, not
invented lowercase labels such as `bench_press` or `plank`.

Example: one barbell bench-press set and one timed core set.

```json
{
  "version": "1.0",
  "start_time": "2026-10-13T09:00:00Z",
  "utc_offset": 0,
  "elapsed_time": 180,
  "active_time": 105,
  "sets": [
    {
      "exercise_type": "BARBELL_BENCH_PRESS",
      "repetitions": 10,
      "weight": 80.0,
      "duration": 45,
      "start_time": "2026-10-13T09:00:00Z"
    },
    {
      "exercise_type": "CORE_GENERIC",
      "duration": 60,
      "start_time": "2026-10-13T09:02:00Z"
    }
  ]
}
```

The upload documentation describes repetitions and duration as optional
fields. It does not require `repetitions: 0` for timed exercises, nor does it
specify a muscle-map result for any exercise. Use an exact supported exercise
identifier, and avoid assuming how Strava will map or display it.

The optional JSON `streams` object is not the same as Strava's activity stream
API. For this upload format, `time` is required when `streams` is present and
all supplied arrays must have the same length. The documented arrays are
`time` (elapsed seconds), `active` (booleans), and `heartrate` (bpm); the
uploads page does not list power as a strength JSON stream.

## Upload and processing behavior

Strava accepts uploads as `multipart/form-data` and processes them
asynchronously. The initial response enqueues the file; poll the upload status
to determine whether processing succeeded and obtain the activity ID. Strava
recommends polling no more frequently than once per second. It identifies
malformed data and duplicate submissions as possible errors, and notes that
activity processing can finish before segment processing.

GymFIT currently checks status every four seconds. A completed upload response
and a fully finished segment-processing response are not necessarily the same
thing.

## Relevance of the other references

- **PowerStream:** This API model is a power data stream, not a strength-set
  upload format. It does not add fields to the documented strength JSON
  schema. The uploads page separately documents `power` for FIT `record`
  messages, but strength files with sets do not require those records.
- **API Playground:** The Playground is an interactive explorer for trying
  Strava API requests and inspecting responses. It can help investigate API
  endpoints, but it does not define a separate upload format or replace the
  uploads specification.
