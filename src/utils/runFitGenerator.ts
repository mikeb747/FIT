import { StravaActivity, CalibratedRunSection } from './stravaActivities';
import { toGarminTime } from './fitGenerator';
import { pollStravaUploadStatus, StravaUploadResult } from './stravaUpload';

// FIT CRC-16 Lookup Table (CCITT-FIT)
const CRC_TABLE = [
  0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
  0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400,
];

function updateCrc(crc: number, byte: number): number {
  let tmp = CRC_TABLE[crc & 0x0F];
  crc = (crc >> 4) & 0x0FFF;
  crc = crc ^ tmp ^ CRC_TABLE[byte & 0x0F];

  tmp = CRC_TABLE[crc & 0x0F];
  crc = (crc >> 4) & 0x0FFF;
  crc = crc ^ tmp ^ CRC_TABLE[(byte >> 4) & 0x0F];
  return crc;
}

function calculateCrc(bytes: Uint8Array, start = 0, length = bytes.length): number {
  let crc = 0;
  for (let i = start; i < start + length; i++) {
    crc = updateCrc(crc, bytes[i]);
  }
  return crc;
}

class ByteWriter {
  private buffer: number[] = [];

  writeUint8(val: number) {
    this.buffer.push(val & 0xFF);
  }

  writeUint16LE(val: number) {
    this.buffer.push(val & 0xFF);
    this.buffer.push((val >> 8) & 0xFF);
  }

  writeUint32LE(val: number) {
    this.buffer.push(val & 0xFF);
    this.buffer.push((val >> 8) & 0xFF);
    this.buffer.push((val >> 16) & 0xFF);
    this.buffer.push((val >> 24) & 0xFF);
  }

  writeString(str: string, fixedLength: number) {
    for (let i = 0; i < fixedLength; i++) {
      if (i < str.length) {
        this.buffer.push(str.charCodeAt(i) & 0xFF);
      } else {
        this.buffer.push(0);
      }
    }
  }

  getBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  length(): number {
    return this.buffer.length;
  }
}

export interface RunFitParams {
  activity: StravaActivity;
  workoutName: string;
  startTimestampMs: number;
  totalDurationSec: number;
  totalDistanceM: number;
  timeStream: number[];
  speedStream: number[]; // m/s
  distanceStream: number[]; // meters
  heartrateStream?: number[];
  cadenceStream?: number[];
  sections: CalibratedRunSection[];
}

/**
 * Builds a standard Garmin / Strava compliant binary .FIT file for a treadmill / indoor run.
 * Preserves timestamps, original heartrate, and cadence, while updating speed, distance, and laps.
 */
export function generateRunFitFile(params: RunFitParams): Uint8Array {
  const {
    workoutName,
    startTimestampMs,
    totalDurationSec,
    totalDistanceM,
    timeStream,
    speedStream,
    distanceStream,
    heartrateStream,
    cadenceStream,
    sections,
  } = params;

  const records = new ByteWriter();
  const startGarminTime = toGarminTime(startTimestampMs);
  const endGarminTime = toGarminTime(startTimestampMs + totalDurationSec * 1000);
  const durationMs = Math.round(totalDurationSec * 1000);

  // -------------------------------------------------------------
  // 1. File ID Message (Global 0, Local 0)
  // -------------------------------------------------------------
  records.writeUint8(0x40 | 0); // Definition message, local 0
  records.writeUint8(0);
  records.writeUint8(0);
  records.writeUint16LE(0);    // Global Message Number: 0 (file_id)
  records.writeUint8(5);        // 5 fields

  records.writeUint8(0); records.writeUint8(1); records.writeUint8(0x00); // type (enum, 4 = activity)
  records.writeUint8(1); records.writeUint8(2); records.writeUint8(0x84); // manufacturer (uint16, 1 = Garmin)
  records.writeUint8(2); records.writeUint8(2); records.writeUint8(0x84); // product (uint16, 3843)
  records.writeUint8(3); records.writeUint8(4); records.writeUint8(0x86); // serial_number (uint32)
  records.writeUint8(4); records.writeUint8(4); records.writeUint8(0x86); // time_created (uint32)

  // Data: File ID
  records.writeUint8(0x00 | 0);
  records.writeUint8(4);        // 4 = activity
  records.writeUint16LE(1);     // Garmin
  records.writeUint16LE(3843);  // Forerunner series
  records.writeUint32LE(123456789);
  records.writeUint32LE(startGarminTime);

  // -------------------------------------------------------------
  // 2. Device Info Message (Global 23, Local 1)
  // -------------------------------------------------------------
  records.writeUint8(0x40 | 1); // Definition, local 1
  records.writeUint8(0);
  records.writeUint8(0);
  records.writeUint16LE(23);   // Global Message Number: 23 (device_info)
  records.writeUint8(5);       // 5 fields

  records.writeUint8(253); records.writeUint8(4); records.writeUint8(0x86); // timestamp
  records.writeUint8(0);   records.writeUint8(1); records.writeUint8(0x02); // device_index
  records.writeUint8(1);   records.writeUint8(1); records.writeUint8(0x02); // device_type
  records.writeUint8(2);   records.writeUint8(2); records.writeUint8(0x84); // manufacturer
  records.writeUint8(4);   records.writeUint8(2); records.writeUint8(0x84); // software_version

  // Data: Device Info
  records.writeUint8(0x00 | 1);
  records.writeUint32LE(startGarminTime);
  records.writeUint8(0);
  records.writeUint8(1);
  records.writeUint16LE(1);    // Garmin
  records.writeUint16LE(1000);

  // -------------------------------------------------------------
  // 3. Record Message (Global 20, Local 2)
  // Fields: timestamp (uint32), distance (uint32 scale 100),
  // speed (uint16 scale 1000), heart_rate (uint8), cadence (uint8)
  // -------------------------------------------------------------
  records.writeUint8(0x40 | 2); // Definition, local 2
  records.writeUint8(0);
  records.writeUint8(0);
  records.writeUint16LE(20);   // Global Message Number: 20 (record)
  records.writeUint8(5);       // 5 fields

  records.writeUint8(253); records.writeUint8(4); records.writeUint8(0x86); // timestamp (uint32)
  records.writeUint8(5);   records.writeUint8(4); records.writeUint8(0x86); // distance (uint32, scale 100 cm)
  records.writeUint8(6);   records.writeUint8(2); records.writeUint8(0x84); // speed (uint16, scale 1000 mm/s)
  records.writeUint8(3);   records.writeUint8(1); records.writeUint8(0x02); // heart_rate (uint8 bpm)
  records.writeUint8(4);   records.writeUint8(1); records.writeUint8(0x02); // cadence (uint8 spm)

  // Write all records
  const numRecords = timeStream.length;
  for (let i = 0; i < numRecords; i++) {
    const elapsedSec = timeStream[i];
    const recGarminTime = startGarminTime + elapsedSec;
    const distCm = Math.min(0xFFFFFFFF, Math.round((distanceStream[i] || 0) * 100));
    const speedMms = Math.min(65535, Math.round((speedStream[i] || 0) * 1000));
    const hr = heartrateStream?.[i] !== undefined && heartrateStream[i] > 30 ? Math.round(heartrateStream[i]) : 0xFF;
    const cad = cadenceStream?.[i] !== undefined && cadenceStream[i] > 0 ? Math.round(cadenceStream[i]) : 0xFF;

    records.writeUint8(0x00 | 2); // Data message, local 2
    records.writeUint32LE(recGarminTime);
    records.writeUint32LE(distCm);
    records.writeUint16LE(speedMms);
    records.writeUint8(hr);
    records.writeUint8(cad);
  }

  // -------------------------------------------------------------
  // 4. Lap Messages (Global 19, Local 3)
  // One for each section / lap
  // -------------------------------------------------------------
  records.writeUint8(0x40 | 3); // Definition, local 3
  records.writeUint8(0);
  records.writeUint8(0);
  records.writeUint16LE(19);   // Global Message Number: 19 (lap)
  records.writeUint8(14);      // 14 fields

  records.writeUint8(254); records.writeUint8(2); records.writeUint8(0x84); // message_index (uint16)
  records.writeUint8(253); records.writeUint8(4); records.writeUint8(0x86); // timestamp (uint32)
  records.writeUint8(2);   records.writeUint8(4); records.writeUint8(0x86); // start_time (uint32)
  records.writeUint8(7);   records.writeUint8(4); records.writeUint8(0x86); // total_elapsed_time (uint32 ms)
  records.writeUint8(8);   records.writeUint8(4); records.writeUint8(0x86); // total_timer_time (uint32 ms)
  records.writeUint8(9);   records.writeUint8(4); records.writeUint8(0x86); // total_distance (uint32 cm)
  records.writeUint8(13);  records.writeUint8(2); records.writeUint8(0x84); // avg_speed (uint16 mm/s)
  records.writeUint8(14);  records.writeUint8(2); records.writeUint8(0x84); // max_speed (uint16 mm/s)
  records.writeUint8(15);  records.writeUint8(1); records.writeUint8(0x02); // avg_heart_rate (uint8)
  records.writeUint8(16);  records.writeUint8(1); records.writeUint8(0x02); // max_heart_rate (uint8)
  records.writeUint8(17);  records.writeUint8(1); records.writeUint8(0x02); // avg_running_cadence (uint8)
  records.writeUint8(18);  records.writeUint8(1); records.writeUint8(0x02); // max_running_cadence (uint8)
  records.writeUint8(25);  records.writeUint8(1); records.writeUint8(0x00); // sport (1 = running)
  records.writeUint8(26);  records.writeUint8(1); records.writeUint8(0x00); // sub_sport (1 = treadmill)

  let cumulativeSec = 0;
  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const sec = sections[sIdx];
    const lapStartSec = cumulativeSec;
    const lapEndSec = cumulativeSec + sec.durationSec;
    cumulativeSec = lapEndSec;

    const lapStartGarmin = startGarminTime + Math.round(lapStartSec);
    const lapEndGarmin = startGarminTime + Math.round(lapEndSec);
    const lapDurationMs = Math.round(sec.durationSec * 1000);
    const lapDistCm = Math.round((sec.distanceM || (sec.speedKph / 3.6) * sec.durationSec) * 100);
    const lapSpeedMms = Math.round((sec.speedKph / 3.6) * 1000);

    // Compute average HR / Cadence for this section if stream exists
    let sumHr = 0, countHr = 0, maxHr = 0;
    let sumCad = 0, countCad = 0, maxCad = 0;
    if (heartrateStream && timeStream) {
      for (let i = 0; i < timeStream.length; i++) {
        const t = timeStream[i];
        if (t >= lapStartSec && t <= lapEndSec) {
          const val = heartrateStream[i];
          if (val > 30) {
            sumHr += val;
            countHr++;
            if (val > maxHr) maxHr = val;
          }
        }
      }
    }
    if (cadenceStream && timeStream) {
      for (let i = 0; i < timeStream.length; i++) {
        const t = timeStream[i];
        if (t >= lapStartSec && t <= lapEndSec) {
          const val = cadenceStream[i];
          if (val > 0) {
            sumCad += val;
            countCad++;
            if (val > maxCad) maxCad = val;
          }
        }
      }
    }

    const avgHr = countHr > 0 ? Math.round(sumHr / countHr) : 0xFF;
    const avgCad = countCad > 0 ? Math.round(sumCad / countCad) : 0xFF;

    records.writeUint8(0x00 | 3); // Data message, local 3
    records.writeUint16LE(sIdx);
    records.writeUint32LE(lapEndGarmin);
    records.writeUint32LE(lapStartGarmin);
    records.writeUint32LE(lapDurationMs);
    records.writeUint32LE(lapDurationMs);
    records.writeUint32LE(lapDistCm);
    records.writeUint16LE(lapSpeedMms);
    records.writeUint16LE(lapSpeedMms);
    records.writeUint8(avgHr);
    records.writeUint8(maxHr || avgHr);
    records.writeUint8(avgCad);
    records.writeUint8(maxCad || avgCad);
    records.writeUint8(1); // Sport: Running
    records.writeUint8(1); // SubSport: Treadmill
  }

  // -------------------------------------------------------------
  // 5. Session Message (Global 18, Local 4)
  // -------------------------------------------------------------
  records.writeUint8(0x40 | 4); // Definition, local 4
  records.writeUint8(0);
  records.writeUint8(0);
  records.writeUint16LE(18);   // Global Message Number: 18 (session)
  records.writeUint8(16);      // 16 fields

  records.writeUint8(254); records.writeUint8(2); records.writeUint8(0x84); // message_index (uint16)
  records.writeUint8(253); records.writeUint8(4); records.writeUint8(0x86); // timestamp (uint32)
  records.writeUint8(2);   records.writeUint8(4); records.writeUint8(0x86); // start_time (uint32)
  records.writeUint8(7);   records.writeUint8(4); records.writeUint8(0x86); // total_elapsed_time (uint32 ms)
  records.writeUint8(8);   records.writeUint8(4); records.writeUint8(0x86); // total_timer_time (uint32 ms)
  records.writeUint8(9);   records.writeUint8(4); records.writeUint8(0x86); // total_distance (uint32 cm)
  records.writeUint8(14);  records.writeUint8(2); records.writeUint8(0x84); // avg_speed (uint16 mm/s)
  records.writeUint8(15);  records.writeUint8(2); records.writeUint8(0x84); // max_speed (uint16 mm/s)
  records.writeUint8(16);  records.writeUint8(1); records.writeUint8(0x02); // avg_heart_rate (uint8)
  records.writeUint8(17);  records.writeUint8(1); records.writeUint8(0x02); // max_heart_rate (uint8)
  records.writeUint8(18);  records.writeUint8(1); records.writeUint8(0x02); // avg_running_cadence (uint8)
  records.writeUint8(19);  records.writeUint8(1); records.writeUint8(0x02); // max_running_cadence (uint8)
  records.writeUint8(5);   records.writeUint8(1); records.writeUint8(0x00); // sport (1 = running)
  records.writeUint8(6);   records.writeUint8(1); records.writeUint8(0x00); // sub_sport (1 = treadmill)
  records.writeUint8(25);  records.writeUint8(2); records.writeUint8(0x84); // num_laps (uint16)
  records.writeUint8(110); records.writeUint8(32); records.writeUint8(0x07); // sport_profile_name (32 bytes string)

  const overallAvgSpeedMms = totalDurationSec > 0 ? Math.round((totalDistanceM / totalDurationSec) * 1000) : 0;
  const overallMaxSpeedMms = Math.max(...sections.map((s) => Math.round((s.speedKph / 3.6) * 1000)), overallAvgSpeedMms);

  // Overall session heart rate & cadence
  let totalHr = 0, countTotalHr = 0, peakHr = 0;
  let totalCad = 0, countTotalCad = 0, peakCad = 0;
  if (heartrateStream) {
    heartrateStream.forEach((h) => {
      if (h > 30) {
        totalHr += h;
        countTotalHr++;
        if (h > peakHr) peakHr = h;
      }
    });
  }
  if (cadenceStream) {
    cadenceStream.forEach((c) => {
      if (c > 0) {
        totalCad += c;
        countTotalCad++;
        if (c > peakCad) peakCad = c;
      }
    });
  }

  const sessionAvgHr = countTotalHr > 0 ? Math.round(totalHr / countTotalHr) : 0xFF;
  const sessionAvgCad = countTotalCad > 0 ? Math.round(totalCad / countTotalCad) : 0xFF;

  records.writeUint8(0x00 | 4); // Data message, local 4
  records.writeUint16LE(0);
  records.writeUint32LE(endGarminTime);
  records.writeUint32LE(startGarminTime);
  records.writeUint32LE(durationMs);
  records.writeUint32LE(durationMs);
  records.writeUint32LE(Math.round(totalDistanceM * 100));
  records.writeUint16LE(overallAvgSpeedMms);
  records.writeUint16LE(overallMaxSpeedMms);
  records.writeUint8(sessionAvgHr);
  records.writeUint8(peakHr || sessionAvgHr);
  records.writeUint8(sessionAvgCad);
  records.writeUint8(peakCad || sessionAvgCad);
  records.writeUint8(1); // Running
  records.writeUint8(1); // Treadmill
  records.writeUint16LE(sections.length);
  records.writeString('Treadmill Run', 32);

  // -------------------------------------------------------------
  // 6. Activity Message (Global 34, Local 5)
  // -------------------------------------------------------------
  records.writeUint8(0x40 | 5); // Definition, local 5
  records.writeUint8(0);
  records.writeUint8(0);
  records.writeUint16LE(34);   // Global Message Number: 34 (activity)
  records.writeUint8(5);       // 5 fields

  records.writeUint8(253); records.writeUint8(4); records.writeUint8(0x86); // timestamp
  records.writeUint8(0);   records.writeUint8(4); records.writeUint8(0x86); // total_timer_time
  records.writeUint8(1);   records.writeUint8(2); records.writeUint8(0x84); // num_sessions
  records.writeUint8(2);   records.writeUint8(1); records.writeUint8(0x00); // type (0 = manual)
  records.writeUint8(3);   records.writeUint8(1); records.writeUint8(0x00); // event (26 = activity)

  records.writeUint8(0x00 | 5); // Data message, local 5
  records.writeUint32LE(endGarminTime);
  records.writeUint32LE(durationMs);
  records.writeUint16LE(1);     // 1 session
  records.writeUint8(0);        // manual
  records.writeUint8(26);       // activity

  // -------------------------------------------------------------
  // 7. Assemble Full FIT File with 14-byte Header & CRC16
  // -------------------------------------------------------------
  const dataBytes = records.getBytes();
  const header = new ByteWriter();
  header.writeUint8(14);        // Header size (14 bytes)
  header.writeUint8(0x20);      // Protocol version 2.0
  header.writeUint16LE(2064);   // Profile version 20.64
  header.writeUint32LE(dataBytes.length); // Data size
  header.writeString('.FIT', 4); // Signature

  const headerBytesPartial = header.getBytes();
  const headerCrc = calculateCrc(headerBytesPartial, 0, 12);
  header.writeUint16LE(headerCrc);

  const fullHeaderBytes = header.getBytes();
  const completeFile = new Uint8Array(fullHeaderBytes.length + dataBytes.length + 2);
  completeFile.set(fullHeaderBytes, 0);
  completeFile.set(dataBytes, fullHeaderBytes.length);

  const fileCrc = calculateCrc(completeFile, 0, fullHeaderBytes.length + dataBytes.length);
  completeFile[completeFile.length - 2] = fileCrc & 0xFF;
  completeFile[completeFile.length - 1] = (fileCrc >> 8) & 0xFF;

  return completeFile;
}

/** Converts binary FIT bytes to base64 string */
export function runFitToBase64(fitBytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < fitBytes.length; i++) {
    binary += String.fromCharCode(fitBytes[i]);
  }
  return btoa(binary);
}

/** Directly downloads the corrected FIT file in the user's browser */
export function downloadRunFitFile(fitBytes: Uint8Array, fileName: string): void {
  const blob = new Blob([fitBytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.fit') ? fileName : `${fileName}.fit`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Uploads the calibrated indoor run to Strava:
 * 1. Sends to server proxy /api/strava/upload (or direct API)
 * 2. Polls upload status every 4 seconds until complete
 */
export async function uploadRunFitToStrava(
  fitBytes: Uint8Array,
  workoutName: string,
  accessToken: string,
  description?: string,
  onStatusUpdate?: (status: string, uploadId?: number | string) => void
): Promise<StravaUploadResult> {
  const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.includes('github.io');
  const safeName = workoutName?.trim() || 'Treadmill Workout';
  const fileName = `${safeName.replace(/\s+/g, '_')}_Calibrated.fit`;
  const desc = description || 'Calibrated treadmill run with reconstructed speed & distance streams via GymFIT.';

  let initialUploadId: string | number | null = null;

  // Step 1: Attempt local server proxy
  if (!isGitHubPages) {
    try {
      const fitBase64 = runFitToBase64(fitBytes);
      onStatusUpdate?.('Sending corrected workout to Strava...');

      const res = await fetch('/api/strava/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fitBase64,
          name: safeName,
          fileName,
          description: desc,
          sport_type: 'Run',
          activity_type: 'run',
          accessToken,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (res.ok && data.success) {
          if (data.activityId) {
            return {
              success: true,
              uploadId: data.uploadId,
              activityId: data.activityId,
              status: data.status,
            };
          }
          initialUploadId = data.uploadId;
        } else if (data.error) {
          return {
            success: false,
            error: data.error,
          };
        }
      }
    } catch {
      // Fall through to direct upload
    }
  }

  // Step 2: Direct browser upload fallback
  if (!initialUploadId) {
    try {
      const fitBlob = new Blob([fitBytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
      const formData = new FormData();
      formData.append('file', fitBlob, fileName);
      formData.append('name', safeName);
      formData.append('description', desc);
      formData.append('data_type', 'fit');
      formData.append('sport_type', 'Run');
      formData.append('activity_type', 'run');

      onStatusUpdate?.('Uploading directly to Strava API...');

      const stravaRes = await fetch('https://www.strava.com/api/v3/uploads', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      const contentType = stravaRes.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await stravaRes.json();
        if (stravaRes.ok) {
          if (data.activity_id) {
            return {
              success: true,
              uploadId: data.id_str || data.id,
              activityId: data.activity_id,
              status: data.status,
            };
          }
          initialUploadId = data.id_str || data.id;
        } else {
          return {
            success: false,
            error: data.message || data.error || `Strava upload error (${stravaRes.status})`,
          };
        }
      } else {
        const text = await stravaRes.text();
        return {
          success: false,
          error: `Strava upload failed (${stravaRes.status}): ${text.slice(0, 120)}`,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Network error communicating with Strava API',
      };
    }
  }

  if (!initialUploadId) {
    return {
      success: false,
      error: 'Did not receive an upload ID from Strava.',
    };
  }

  // Step 3: Poll status every 4 seconds
  return pollStravaUploadStatus(initialUploadId, accessToken, onStatusUpdate);
}
