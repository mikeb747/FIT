import type { DailyRecoveryLog, RecoverySource, SubjectiveFeel } from '../types/recovery';

const RECOVERY_STORAGE_KEY = 'fit_track_recovery_logs_v1';
const LEGACY_STORAGE_KEY = 'ironfit_recovery_logs_v1';

/**
 * Generates realistic historical sample data for the past 28 days
 * calibrated for an athlete with 41 bpm baseline RHR and high aerobic conditioning.
 */
export function generateDefaultRecoveryLogs(): DailyRecoveryLog[] {
  const logs: DailyRecoveryLog[] = [];
  const now = new Date();

  // Pattern: simulated 28-day cycle with training peaks, rest days, and recovery variations
  // Day offsets, RHR around 41 bpm, HRV around 75 ms
  const templates = [
    // Today
    { offset: 0, rhr: 41, hrv: 79, sleepMin: 485, score: 88, deep: 85, rem: 105, feel: 4 as SubjectiveFeel, notes: 'Felt well-rested, early bed time', tags: ['optimal sleep'] },
    // Yesterday
    { offset: 1, rhr: 42, hrv: 74, sleepMin: 460, score: 82, deep: 78, rem: 95, feel: 4 as SubjectiveFeel, notes: 'Steady sleep after bike tempo workout', tags: ['post workout'] },
    { offset: 2, rhr: 44, hrv: 66, sleepMin: 420, score: 71, deep: 60, rem: 80, feel: 3 as SubjectiveFeel, notes: 'Late dinner, minor dehydration after hard run intervals', tags: ['intervals', 'late meal'] },
    { offset: 3, rhr: 41, hrv: 82, sleepMin: 510, score: 91, deep: 95, rem: 110, feel: 5 as SubjectiveFeel, notes: 'Deep recovery day, morning mobility', tags: ['fresh'] },
    { offset: 4, rhr: 40, hrv: 84, sleepMin: 495, score: 89, deep: 90, rem: 105, feel: 5 as SubjectiveFeel, notes: 'Excellent sleep quality and lowest resting HR', tags: ['peak recovery'] },
    { offset: 5, rhr: 41, hrv: 77, sleepMin: 465, score: 84, deep: 75, rem: 100, feel: 4 as SubjectiveFeel, notes: 'Solid aerobic ride completed earlier', tags: ['steady'] },
    { offset: 6, rhr: 43, hrv: 70, sleepMin: 440, score: 76, deep: 68, rem: 85, feel: 3 as SubjectiveFeel, notes: 'Moderate fatigue from weekly threshold sessions', tags: ['fatigue'] },
    { offset: 7, rhr: 41, hrv: 78, sleepMin: 480, score: 87, deep: 82, rem: 102, feel: 4 as SubjectiveFeel, notes: 'Sunday rest and recovery', tags: ['rest day'] },
    { offset: 8, rhr: 42, hrv: 75, sleepMin: 470, score: 83, deep: 76, rem: 98, feel: 4 as SubjectiveFeel, notes: 'Post swim technique session', tags: ['swim'] },
    { offset: 9, rhr: 41, hrv: 80, sleepMin: 490, score: 89, deep: 88, rem: 104, feel: 5 as SubjectiveFeel, notes: 'Great breathing and deep stage duration', tags: ['optimal sleep'] },
    { offset: 10, rhr: 45, hrv: 62, sleepMin: 405, score: 68, deep: 52, rem: 75, feel: 2 as SubjectiveFeel, notes: 'High training stress day, legs heavy', tags: ['high load'] },
    { offset: 11, rhr: 43, hrv: 69, sleepMin: 450, score: 78, deep: 70, rem: 90, feel: 3 as SubjectiveFeel, notes: 'Rebounding from hard block', tags: ['rebounding'] },
    { offset: 12, rhr: 41, hrv: 76, sleepMin: 475, score: 85, deep: 80, rem: 98, feel: 4 as SubjectiveFeel, notes: 'Stable baseline returned', tags: ['balanced'] },
    { offset: 13, rhr: 40, hrv: 83, sleepMin: 505, score: 92, deep: 92, rem: 112, feel: 5 as SubjectiveFeel, notes: 'Deep restorative sleep cycle', tags: ['peak recovery'] },
    { offset: 14, rhr: 41, hrv: 78, sleepMin: 480, score: 86, deep: 84, rem: 100, feel: 4 as SubjectiveFeel, notes: 'Consistent wake time', tags: ['routine'] },
    { offset: 15, rhr: 42, hrv: 73, sleepMin: 455, score: 80, deep: 72, rem: 92, feel: 3 as SubjectiveFeel, notes: 'Midweek training load', tags: ['training'] },
    { offset: 16, rhr: 41, hrv: 77, sleepMin: 470, score: 84, deep: 79, rem: 97, feel: 4 as SubjectiveFeel, notes: 'Calm morning heart rate', tags: ['balanced'] },
    { offset: 17, rhr: 44, hrv: 65, sleepMin: 415, score: 70, deep: 55, rem: 78, feel: 2 as SubjectiveFeel, notes: 'Elevated stress and shorter sleep', tags: ['short sleep'] },
    { offset: 18, rhr: 42, hrv: 72, sleepMin: 460, score: 81, deep: 74, rem: 94, feel: 3 as SubjectiveFeel, notes: 'Recovering slowly', tags: ['recovery'] },
    { offset: 19, rhr: 41, hrv: 81, sleepMin: 495, score: 88, deep: 86, rem: 108, feel: 4 as SubjectiveFeel, notes: 'Solid parasympathetic tone', tags: ['balanced'] },
    { offset: 20, rhr: 40, hrv: 85, sleepMin: 515, score: 93, deep: 96, rem: 115, feel: 5 as SubjectiveFeel, notes: 'Weekend deep sleep surplus', tags: ['optimal sleep'] },
  ];

  templates.forEach((t) => {
    const d = new Date(now);
    d.setDate(d.getDate() - t.offset);
    const dateStr = d.toISOString().split('T')[0];

    const awake = Math.max(20, Math.round(t.sleepMin * 0.07));
    const light = Math.max(120, t.sleepMin - t.deep - t.rem);

    logs.push({
      id: `rec_${dateStr}`,
      date: dateStr,
      restingHr: t.rhr,
      hrvRmssd: t.hrv,
      sleepDurationMinutes: t.sleepMin,
      sleepScore: t.score,
      deepSleepMinutes: t.deep,
      remSleepMinutes: t.rem,
      lightSleepMinutes: light,
      awakeMinutes: awake,
      subjectiveFeel: t.feel,
      notes: t.notes,
      source: t.offset % 3 === 0 ? 'garmin' : 'trainingpeaks',
      tags: t.tags,
    });
  });

  return logs.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Loads saved recovery logs from LocalStorage; seeds with realistic 41 bpm baseline history if empty
 */
export function loadRecoveryLogs(): DailyRecoveryLog[] {
  try {
    const raw =
      localStorage.getItem(RECOVERY_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_STORAGE_KEY);

    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.sort((a, b) => a.date.localeCompare(b.date));
      }
    }
  } catch (err) {
    console.warn('Failed to parse saved recovery logs, seeding defaults:', err);
  }

  // Seed default dataset
  const defaults = generateDefaultRecoveryLogs();
  saveRecoveryLogs(defaults);
  return defaults;
}

/**
 * Persists recovery logs to LocalStorage
 */
export function saveRecoveryLogs(logs: DailyRecoveryLog[]): void {
  try {
    const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
    localStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(sorted));
  } catch (err) {
    console.error('Failed to save recovery logs:', err);
  }
}

/**
 * Upserts a single daily log (keyed by date)
 */
export function upsertRecoveryLog(log: DailyRecoveryLog): DailyRecoveryLog[] {
  const current = loadRecoveryLogs();
  const index = current.findIndex((l) => l.date === log.date);

  let updated: DailyRecoveryLog[];
  if (index >= 0) {
    updated = [...current];
    updated[index] = { ...log, id: current[index].id || log.id };
  } else {
    updated = [...current, log];
  }

  saveRecoveryLogs(updated);
  return updated;
}

/**
 * Deletes a recovery log by ID
 */
export function deleteRecoveryLog(id: string): DailyRecoveryLog[] {
  const current = loadRecoveryLogs();
  const updated = current.filter((l) => l.id !== id);
  saveRecoveryLogs(updated);
  return updated;
}

/**
 * Resets recovery logs back to the default historical dataset
 */
export function resetRecoveryLogsToDefaults(): DailyRecoveryLog[] {
  const defaults = generateDefaultRecoveryLogs();
  saveRecoveryLogs(defaults);
  return defaults;
}

/**
 * Parses CSV export from Garmin Connect or TrainingPeaks
 * Supports columns: Date, Resting_HR / RHR, HRV / rMSSD, Sleep_Hours / Sleep_Minutes, Sleep_Score, Deep, REM
 */
export function parseGarminOrTpCsv(csvText: string): { imported: DailyRecoveryLog[]; error?: string } {
  try {
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      return { imported: [], error: 'CSV file is empty or missing data rows.' };
    }

    const header = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));

    const dateCol = header.findIndex((h) => h.includes('date') || h.includes('timestamp'));
    const rhrCol = header.findIndex((h) => h.includes('rhr') || h.includes('resting') || h.includes('heart'));
    const hrvCol = header.findIndex((h) => h.includes('hrv') || h.includes('rmssd') || h.includes('variability'));
    const sleepCol = header.findIndex((h) => h.includes('sleep') && (h.includes('min') || h.includes('hour') || h.includes('duration') || h.includes('total')));
    const scoreCol = header.findIndex((h) => h.includes('score') || h.includes('quality'));
    const deepCol = header.findIndex((h) => h.includes('deep'));
    const remCol = header.findIndex((h) => h.includes('rem'));

    if (dateCol === -1) {
      return { imported: [], error: 'Could not find a "Date" column in the uploaded CSV header.' };
    }

    const imported: DailyRecoveryLog[] = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
      const rawDate = parts[dateCol];
      if (!rawDate) continue;

      // Normalize date to YYYY-MM-DD
      let dateObj = new Date(rawDate);
      if (isNaN(dateObj.getTime())) {
        // Try DD/MM/YYYY or MM/DD/YYYY
        const splitDate = rawDate.split(/[-/]/);
        if (splitDate.length === 3) {
          if (splitDate[0].length === 4) {
            dateObj = new Date(`${splitDate[0]}-${splitDate[1]}-${splitDate[2]}`);
          } else {
            // Assume DD-MM-YYYY or MM-DD-YYYY
            dateObj = new Date(`${splitDate[2]}-${splitDate[1]}-${splitDate[0]}`);
          }
        }
      }

      if (isNaN(dateObj.getTime())) continue;
      const dateStr = dateObj.toISOString().split('T')[0];

      // Parse Resting HR (default 41)
      let rhr = rhrCol >= 0 ? parseFloat(parts[rhrCol]) : 41;
      if (isNaN(rhr) || rhr <= 20 || rhr > 140) rhr = 41;

      // Parse HRV rMSSD
      let hrv = hrvCol >= 0 ? parseFloat(parts[hrvCol]) : 75;
      if (isNaN(hrv) || hrv <= 0) hrv = 75;

      // Parse Sleep duration in minutes
      let sleepMinutes = 480;
      if (sleepCol >= 0) {
        const val = parseFloat(parts[sleepCol]);
        if (!isNaN(val)) {
          // If value is small (< 24), treat as hours
          sleepMinutes = val <= 24 ? Math.round(val * 60) : Math.round(val);
        }
      }

      // Parse sleep score
      let score = scoreCol >= 0 ? parseInt(parts[scoreCol], 10) : 80;
      if (isNaN(score) || score <= 0) score = 80;

      // Parse deep & rem
      let deep = deepCol >= 0 ? parseFloat(parts[deepCol]) : Math.round(sleepMinutes * 0.18);
      if (deep <= 10 && deep > 0) deep = Math.round(deep * 60); // was in hours
      if (isNaN(deep)) deep = Math.round(sleepMinutes * 0.18);

      let rem = remCol >= 0 ? parseFloat(parts[remCol]) : Math.round(sleepMinutes * 0.22);
      if (rem <= 10 && rem > 0) rem = Math.round(rem * 60);
      if (isNaN(rem)) rem = Math.round(sleepMinutes * 0.22);

      const awake = Math.max(15, Math.round(sleepMinutes * 0.06));
      const light = Math.max(60, sleepMinutes - deep - rem);

      imported.push({
        id: `import_${dateStr}`,
        date: dateStr,
        restingHr: Math.round(rhr),
        hrvRmssd: Math.round(hrv),
        sleepDurationMinutes: sleepMinutes,
        sleepScore: Math.min(100, Math.max(1, score)),
        deepSleepMinutes: Math.round(deep),
        remSleepMinutes: Math.round(rem),
        lightSleepMinutes: Math.round(light),
        awakeMinutes: awake,
        source: 'csv',
        notes: 'Imported from CSV',
      });
    }

    if (imported.length === 0) {
      return { imported: [], error: 'No valid recovery date rows could be extracted from the file.' };
    }

    return { imported };
  } catch (err: any) {
    return { imported: [], error: `Failed to parse CSV file: ${err.message || 'Unknown error'}` };
  }
}

/**
 * Generates CSV string for export
 */
export function exportRecoveryLogsToCsv(logs: DailyRecoveryLog[]): string {
  const header = [
    'Date',
    'Resting_HR_bpm',
    'HRV_rMSSD_ms',
    'Sleep_Duration_Minutes',
    'Sleep_Hours_Formatted',
    'Sleep_Score',
    'Deep_Sleep_Minutes',
    'REM_Sleep_Minutes',
    'Light_Sleep_Minutes',
    'Awake_Minutes',
    'Subjective_Feel',
    'Source',
    'Notes',
  ].join(',');

  const rows = logs.map((l) => {
    const hours = (l.sleepDurationMinutes / 60).toFixed(2);
    const cleanNotes = (l.notes || '').replace(/"/g, '""');
    return [
      l.date,
      l.restingHr,
      l.hrvRmssd,
      l.sleepDurationMinutes,
      hours,
      l.sleepScore,
      l.deepSleepMinutes,
      l.remSleepMinutes,
      l.lightSleepMinutes,
      l.awakeMinutes,
      l.subjectiveFeel || '',
      l.source,
      `"${cleanNotes}"`,
    ].join(',');
  });

  return [header, ...rows].join('\n');
}
