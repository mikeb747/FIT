STRAVA_STRENGTH_UPLOADS_FORMAT.md deals with Weight_Training uploads to Strava, in the FIT format.

We also want to be able to upload "correct" workout files, starting with Running, 

The goal is to load an activity from Strava, add corrected "laps", use the laps to generate a corrected Distance and Speed, Upload the file back to Strava

Data,	Source,	FIT treatment
Time,	Original activity, Record timestamps
Heart rate,	Original, activity, Preserve
Distance,	Calculated from treadmill speed,	Generate
Speed,	Treadmill workout definition,	Generate
Cadence,	Original activity, Preserve
Temperature,	Original activity, Omit
Gradient,	Workout definition, Omit
Running power, Calculated model, Omit
Altitude,	Not available indoors,	Omit

https://developer.garmin.com/fit/articles/cookbook/datetime.html
https://developer.garmin.com/fit/articles/file-types/activity.html

Retrieve the original activity and its streams.
Generate the corrected FIT file, preserving the original start timestamp.
Upload the corrected FIT file.
  Keep the original timestamp and let Strava's upload response tell you whether it considers the file a duplicate.
  If it rejects the upload, the user can decide whether to delete the original manually before retrying.
  This avoids silently creating duplicate activities or falsifying activity times.
Poll Strava until processing completes.
Save the new Strava activity ID against your original internal activity record.
