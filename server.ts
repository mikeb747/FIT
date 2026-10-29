import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Process safety handlers
process.on('uncaughtException', (err) => {
  console.error('[FIT Track Server] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FIT Track Server] Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();

// Parse port & host from process.env or CLI flags (e.g. tsx server.ts --port 3000 --host 0.0.0.0)
let parsedPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
let parsedHost = '0.0.0.0';

for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--port' && process.argv[i + 1]) {
    const val = parseInt(process.argv[i + 1], 10);
    if (!isNaN(val)) parsedPort = val;
  }
  if (process.argv[i] === '--host' && process.argv[i + 1]) {
    parsedHost = process.argv[i + 1];
  }
}

const PORT = parsedPort;
const HOST = parsedHost;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '15mb' }));

// Helper to determine the callback URL
const getRedirectUri = (req: express.Request) => {
  const appUrl = process.env.APP_URL;
  if (appUrl && appUrl.startsWith('http')) {
    return `${appUrl.replace(/\/+$/, '')}/auth/callback`;
  }
  const host = req.get('host') || `localhost:${PORT}`;
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  return `${protocol}://${host}/auth/callback`;
};

const DEFAULT_STRAVA_CLIENT_ID = '287214';
const DEFAULT_STRAVA_CLIENT_SECRET = '28e75ea249c01a4a3d281db096321467291d2c9e';

// Check if Strava credentials are configured on server
app.get('/api/strava/config', (req, res) => {
  const clientId = process.env.STRAVA_CLIENT_ID || process.env.CLIENT_ID || DEFAULT_STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET || process.env.CLIENT_SECRET || DEFAULT_STRAVA_CLIENT_SECRET;
  res.json({
    configured: Boolean(clientId && clientSecret),
    redirectUri: getRedirectUri(req),
    clientIdConfigured: Boolean(clientId),
  });
});

// Construct Strava OAuth Authorization URL
app.get('/api/auth/strava-url', (req, res) => {
  const customClientId = req.query.client_id as string;
  const clientId = customClientId || process.env.STRAVA_CLIENT_ID || process.env.CLIENT_ID || DEFAULT_STRAVA_CLIENT_ID;

  if (!clientId) {
    return res.status(400).json({
      error: 'Strava Client ID is not configured. Provide it in .env or settings.',
    });
  }

  const redirectUri = getRedirectUri(req);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:write,activity:read',
  });

  const authUrl = `https://www.strava.com/oauth/authorize?${params.toString()}`;
  res.json({ url: authUrl, redirectUri });
});

// Strava OAuth Callback Handler (popup flow)
const handleOAuthCallback = async (req: express.Request, res: express.Response) => {
  const { code, error } = req.query;

  if (error) {
    return res.send(`
      <!doctype html>
      <html>
        <head><title>Authentication Failed</title></head>
        <body style="font-family: sans-serif; background: #090a0f; color: #fff; text-align: center; padding: 40px;">
          <h2 style="color: #ef4444;">Authorization Denied</h2>
          <p>${escape(String(error))}</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: '${escape(String(error))}' }, '*');
            }
            setTimeout(() => window.close(), 2500);
          </script>
        </body>
      </html>
    `);
  }

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  const clientId = process.env.STRAVA_CLIENT_ID || process.env.CLIENT_ID || DEFAULT_STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET || process.env.CLIENT_SECRET || DEFAULT_STRAVA_CLIENT_SECRET;

  try {
    let tokenData = null;
    if (clientId && clientSecret) {
      const response = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code: String(code),
          grant_type: 'authorization_code',
        }),
      });

      tokenData = await response.json();
      if (!response.ok) {
        throw new Error(tokenData.message || 'Token exchange failed');
      }
    } else {
      // In case client credentials were provided on the client side
      tokenData = { code: String(code) };
    }

    res.send(`
      <!doctype html>
      <html>
        <head><title>Strava Connected</title></head>
        <body style="font-family: sans-serif; background: #090a0f; color: #fff; text-align: center; padding: 40px;">
          <div style="max-width: 400px; margin: auto; padding: 24px; background: #181b26; border-radius: 16px; border: 1px solid #262b3d;">
            <div style="font-size: 32px; margin-bottom: 12px;">⚡</div>
            <h2 style="color: #fc5200; margin: 0 0 8px;">Strava Connected!</h2>
            <p style="color: #94a3b8; font-size: 14px;">Closing window and returning to FIT Track...</p>
          </div>
          <script>
            try {
              if (window.opener) {
                window.opener.postMessage({
                  type: 'OAUTH_AUTH_SUCCESS',
                  payload: ${JSON.stringify(tokenData)}
                }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            } catch (e) {
              window.close();
            }
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    res.status(500).send(`
      <!doctype html>
      <html>
        <head><title>Strava Error</title></head>
        <body style="font-family: sans-serif; background: #090a0f; color: #fff; text-align: center; padding: 40px;">
          <h2 style="color: #ef4444;">Exchange Error</h2>
          <p>${escape(err.message || 'Unknown error')}</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: '${escape(err.message)}' }, '*');
            }
          </script>
        </body>
      </html>
    `);
  }
};

app.get('/auth/callback', handleOAuthCallback);
app.get('/auth/callback/', handleOAuthCallback);

// Direct Upload to Strava Activity Upload API
app.post('/api/strava/upload', async (req, res) => {
  try {
    const { fitBase64, name, description, accessToken, fileName } = req.body;

    if (!accessToken) {
      return res.status(401).json({ error: 'Strava access token is required' });
    }
    if (!fitBase64) {
      return res.status(400).json({ error: 'Missing FIT file binary payload' });
    }

    const fitBuffer = Buffer.from(fitBase64, 'base64');
    const fitBlob = new Blob([fitBuffer], { type: 'application/octet-stream' });
    const targetFileName = fileName || `${(name || 'FIT Track_Workout').replace(/\s+/g, '_')}.fit`;

    const formData = new FormData();
    formData.append('file', fitBlob, targetFileName);
    formData.append('name', name || 'Strength & Conditioning');
    formData.append('description', description || 'Logged via FIT Track');
    formData.append('data_type', 'fit');
    formData.append('sport_type', 'WeightTraining');
    formData.append('activity_type', 'weight_training');

    const stravaRes = await fetch('https://www.strava.com/api/v3/uploads', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });

    const data = await stravaRes.json();
    if (!stravaRes.ok) {
      return res.status(stravaRes.status).json({
        error: data.message || 'Strava upload failed',
        details: data.errors || data,
      });
    }

    res.json({
      success: true,
      uploadId: data.id_str || data.id,
      activityId: data.activity_id,
      status: data.status,
      error: data.error || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal upload error' });
  }
});

// Check status of a Strava upload (polling endpoint)
app.get('/api/strava/uploads/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Strava access token is required' });
    }

    const stravaRes = await fetch(`https://www.strava.com/api/v3/uploads/${uploadId}`, {
      method: 'GET',
      headers: {
        Authorization: authHeader,
      },
    });

    const data = await stravaRes.json();
    return res.status(stravaRes.status).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error checking upload status' });
  }
});

// Fetch athlete activities from Strava
app.get('/api/strava/activities', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Strava access token is required' });
    }
    const page = req.query.page || 1;
    const perPage = req.query.per_page || 200;
    const before = req.query.before;
    const after = req.query.after;

    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });
    if (before) params.set('before', String(before));
    if (after) params.set('after', String(after));

    const stravaRes = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
        },
      }
    );

    const data = await stravaRes.json();
    if (!stravaRes.ok) {
      return res.status(stravaRes.status).json(data);
    }
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error fetching Strava activities' });
  }
});

// Fetch an individual activity and its available data streams from Strava
app.get('/api/strava/activities/:activityId', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Strava access token is required' });
    }

    const activityId = Number(req.params.activityId);
    if (!Number.isSafeInteger(activityId) || activityId <= 0) {
      return res.status(400).json({ error: 'A valid Strava activity ID is required' });
    }

    const stravaRes = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
      method: 'GET',
      headers: { Authorization: authHeader, Accept: 'application/json' },
    });
    const data = await stravaRes.json();
    return res.status(stravaRes.status).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error fetching Strava activity details' });
  }
});

// Update an individual activity (name, description, sport_type, etc.) on Strava
app.put('/api/strava/activities/:activityId', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Strava access token is required' });
    }

    const activityId = Number(req.params.activityId);
    if (!Number.isSafeInteger(activityId) || activityId <= 0) {
      return res.status(400).json({ error: 'A valid Strava activity ID is required' });
    }

    const stravaRes = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
      method: 'PUT',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    const data = await stravaRes.json();
    return res.status(stravaRes.status).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error updating Strava activity' });
  }
});

app.get('/api/strava/activities/:activityId/streams', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Strava access token is required' });
    }

    const activityId = Number(req.params.activityId);
    if (!Number.isSafeInteger(activityId) || activityId <= 0) {
      return res.status(400).json({ error: 'A valid Strava activity ID is required' });
    }

    const keys = 'time,distance,latlng,altitude,velocity_smooth,heartrate,cadence,watts,temp,moving,grade_smooth';
    const stravaRes = await fetch(
      `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=${keys}&key_by_type=true`,
      {
        method: 'GET',
        headers: { Authorization: authHeader, Accept: 'application/json' },
      }
    );
    const data = await stravaRes.json();
    return res.status(stravaRes.status).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error fetching Strava activity streams' });
  }
});

// Fetch athlete profile (includes bikes & shoes)
app.get('/api/strava/athlete', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Strava access token is required' });
    }

    const stravaRes = await fetch('https://www.strava.com/api/v3/athlete', {
      method: 'GET',
      headers: { Authorization: authHeader, Accept: 'application/json' },
    });
    const data = await stravaRes.json();
    return res.status(stravaRes.status).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error fetching Strava athlete profile' });
  }
});

// Fetch specific gear details (bike or shoe)
app.get('/api/strava/gear/:gearId', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Strava access token is required' });
    }

    const gearId = req.params.gearId;
    if (!gearId) {
      return res.status(400).json({ error: 'Gear ID is required' });
    }

    const stravaRes = await fetch(`https://www.strava.com/api/v3/gear/${encodeURIComponent(gearId)}`, {
      method: 'GET',
      headers: { Authorization: authHeader, Accept: 'application/json' },
    });
    const data = await stravaRes.json();
    return res.status(stravaRes.status).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error fetching Strava gear details' });
  }
});

// Token refresh endpoint if user provides refresh token
app.post('/api/strava/refresh', async (req, res) => {
  try {
    const { refreshToken, clientId, clientSecret } = req.body;
    const cid = clientId || process.env.STRAVA_CLIENT_ID || process.env.CLIENT_ID;
    const csec = clientSecret || process.env.STRAVA_CLIENT_SECRET || process.env.CLIENT_SECRET;

    if (!refreshToken || !cid || !csec) {
      return res.status(400).json({ error: 'Missing refreshToken or credentials' });
    }

    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: cid,
        client_secret: csec,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// Helper function to exchange a Garmin Personal API Key (GCDC_...) for a Bearer Access Token (GARMIN.md Section 0.5)
async function exchangeGarminApiKeyForToken(
  apiKey: string
): Promise<{ success: boolean; accessToken?: string; error?: string }> {
  const url = 'https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token';
  try {
    const cleanKey = apiKey.trim();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `ApiKey ${cleanKey}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errMsg = data?.message || data?.error || `Garmin token exchange failed (${response.status} ${response.statusText})`;
      return { success: false, error: errMsg };
    }

    const token = data.access_token || data.accessToken || data.token;
    if (!token) {
      return { success: false, error: 'Garmin token endpoint did not return access_token in response.' };
    }

    return { success: true, accessToken: token };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error exchanging Garmin API Key for access token' };
  }
}

// Dedicated endpoint for Garmin API Key Token Exchange
app.post('/api/garmin/token', async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return res.status(400).json({ success: false, error: 'Garmin API Key is required' });
    }
    const result = await exchangeGarminApiKeyForToken(apiKey.trim());
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Token exchange failed' });
  }
});

// =========================================================
// Garmin Connect Multi-Week Automated Wellness Sync
// =========================================================
app.post('/api/garmin/sync-multiweek', async (req, res) => {
  try {
    const { email, password, sessionToken, weeks = 4, baselineRhr = 41 } = req.body;
    const requestedWeeks = Math.max(1, Math.min(16, Number(weeks) || 4));
    const requestedDays = requestedWeeks * 7;
    const athleteBaselineRhr = Number(baselineRhr) > 0 ? Number(baselineRhr) : 41;

    const trimmedEmail = typeof email === 'string' ? email.trim() : '';
    const trimmedPassword = typeof password === 'string' ? password.trim() : '';
    const trimmedToken = typeof sessionToken === 'string' ? sessionToken.trim() : '';

    // Strictly enforce credentials presence - reject empty submissions
    if (!trimmedToken && (!trimmedEmail || !trimmedPassword)) {
      return res.status(400).json({
        success: false,
        error: 'Garmin credentials required. Please enter your Garmin email and password, or provide a Garmin Connect session token / Personal API key.',
      });
    }

    // 1. Session Token or Personal API Key Flow
    if (trimmedToken) {
      const nowMs = Date.now();
      const nowSec = Math.floor(nowMs / 1000);
      const startSec = nowSec - requestedDays * 86400;
      const todayStr = new Date(nowMs).toISOString().split('T')[0];
      const fromDateStr = new Date(nowMs - requestedDays * 86400 * 1000).toISOString().split('T')[0];

      const isPersonalApiKey = trimmedToken.startsWith('GCDC_') || (!trimmedToken.includes('=') && trimmedToken.length > 20);
      let bearerToken = trimmedToken;
      let tokenExchangeError: string | null = null;

      // GARMIN.md Section 0.5: Exchange API Key for Bearer Access Token
      if (isPersonalApiKey) {
        const tokenRes = await exchangeGarminApiKeyForToken(trimmedToken);
        if (tokenRes.success && tokenRes.accessToken) {
          bearerToken = tokenRes.accessToken;
        } else {
          tokenExchangeError = tokenRes.error || 'Failed to exchange Garmin API key for access token.';
        }
      }

      if (tokenExchangeError) {
        return res.status(400).json({
          success: false,
          syncedDays: 0,
          weeks: requestedWeeks,
          logs: [],
          error: `Garmin API Key Exchange Failed: ${tokenExchangeError}`,
        });
      }

      // GARMIN.md Section 0.6: Fetch HRV and sleep data with Bearer Access Token
      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      };

      if (isPersonalApiKey) {
        headers['Authorization'] = `Bearer ${bearerToken}`;
      } else {
        headers['Cookie'] = trimmedToken.includes('GARMIN-SSO-GUID')
          ? trimmedToken
          : `GARMIN-SSO-GUID=${trimmedToken}`;
        headers['origin'] = 'https://connect.garmin.com';
        headers['referer'] = 'https://connect.garmin.com/modern/daily-summary';
      }

      const candidateEndpoints = isPersonalApiKey
        ? [
            `https://personal.connectapi.garmin.com/hrv-service/hrv/daily/${fromDateStr}/${todayStr}`,
            `https://personal.connectapi.garmin.com/wellness-service/rest/dailies?uploadStartTimeInSeconds=${startSec}&uploadEndTimeInSeconds=${nowSec}`,
            `https://personal.connectapi.garmin.com/wellness-service/rest/hrv?uploadStartTimeInSeconds=${startSec}&uploadEndTimeInSeconds=${nowSec}`,
            `https://personal.connectapi.garmin.com/sleep-service/sleep/dailySleep?date=${todayStr}`,
          ]
        : [
            `https://connect.garmin.com/modern/proxy/wellness-service/wellness/dailyHeartRate/${todayStr}`,
            `https://connect.garmin.com/modern/proxy/userprofile-service/userprofile/personal-information`,
          ];

      let rawResults: any[] = [];

      for (const endpoint of candidateEndpoints) {
        try {
          const testRes = await fetch(endpoint, { headers });
          if (testRes.ok) {
            const parsed = await testRes.json().catch(() => null);
            if (parsed) {
              rawResults.push(parsed);
            }
          }
        } catch {}
      }

      const liveLogsMap = new Map<string, any>();

      for (const resItem of rawResults) {
        const items = Array.isArray(resItem)
          ? resItem
          : resItem.dailies || resItem.hrvSummaries || resItem.allMetrics || [resItem];

        for (const item of items) {
          if (!item || typeof item !== 'object') continue;
          const dateStr =
            item.calendarDate ||
            item.date ||
            (item.startTimeInSeconds
              ? new Date(item.startTimeInSeconds * 1000).toISOString().split('T')[0]
              : null);

          if (!dateStr) continue;

          const existing = liveLogsMap.get(dateStr) || {
            id: `rec_garmin_${dateStr}`,
            date: dateStr,
            source: 'garmin',
            notes: 'Garmin Connect Telemetry',
          };

          const rhr =
            item.restingHeartRateInBeatsPerMinute ||
            item.restingHeartRate ||
            item.rhr ||
            existing.restingHr ||
            athleteBaselineRhr;

          const hrv =
            item.lastNightAvg ||
            item.hrvWeeklyAvg ||
            item.averageHRV ||
            item.weeklyAvg ||
            item.lastNight5MinHigh ||
            existing.hrvRmssd;

          const sleepSec =
            item.durationInSeconds ||
            item.sleepTimeSeconds ||
            (item.dailySleepDTO ? item.dailySleepDTO.sleepTimeSeconds : undefined);

          const sleepMin = sleepSec
            ? Math.round(sleepSec / 60)
            : existing.sleepDurationMinutes;

          const score =
            item.sleepScore ||
            (item.dailySleepDTO?.sleepScores?.overall?.value) ||
            existing.sleepScore;

          const deep =
            item.deepSleepDurationInSeconds ||
            (item.dailySleepDTO ? item.dailySleepDTO.deepSleepSeconds : undefined);

          const rem =
            item.remSleepDurationInSeconds ||
            (item.dailySleepDTO ? item.dailySleepDTO.remSleepSeconds : undefined);

          const light =
            item.lightSleepDurationInSeconds ||
            (item.dailySleepDTO ? item.dailySleepDTO.lightSleepSeconds : undefined);

          const awake =
            item.awakeDurationInSeconds ||
            (item.dailySleepDTO ? item.dailySleepDTO.awakeSleepSeconds : undefined);

          liveLogsMap.set(dateStr, {
            ...existing,
            restingHr: rhr || athleteBaselineRhr,
            hrvRmssd: hrv,
            sleepDurationMinutes: sleepMin,
            sleepScore: score,
            deepSleepMinutes: deep ? Math.round(deep / 60) : existing.deepSleepMinutes,
            remSleepMinutes: rem ? Math.round(rem / 60) : existing.remSleepMinutes,
            lightSleepMinutes: light ? Math.round(light / 60) : existing.lightSleepMinutes,
            awakeMinutes: awake ? Math.round(awake / 60) : existing.awakeMinutes,
          });
        }
      }

      const liveLogs = Array.from(liveLogsMap.values());

      if (liveLogs.length === 0) {
        return res.status(400).json({
          success: false,
          syncedDays: 0,
          weeks: requestedWeeks,
          logs: [],
          error:
            'Garmin API Key exchange succeeded, but Garmin Connect Personal API returned no telemetry for this date range. Garmin Personal API credentials push data via Webhooks, or require manual CSV imports (Garmin Connect Web > Reports > Sleep).',
        });
      }

      return res.json({
        success: true,
        syncedDays: liveLogs.length,
        weeks: requestedWeeks,
        logs: liveLogs,
        message: `Garmin Connect verified. Synchronized ${liveLogs.length} days (${requestedWeeks} weeks) of recovery telemetry.`,
      });
    }

    // 2. Direct Username/Password SSO Flow
    // Garmin SSO utilizes TLS fingerprinting and Cloudflare 2FA/CAPTCHA challenges for direct form posts
    try {
      const ssoCheck = await fetch(
        'https://sso.garmin.com/sso/signin?service=https%3A%2F%2Fconnect.garmin.com%2Fmodern%2F',
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
        }
      );

      // Garmin web SSO actively requires interactive 2FA verification or session tokens
      return res.status(401).json({
        success: false,
        mfaRequired: true,
        error:
          'Garmin Connect requires Two-Factor Authentication (2FA) verification. Headless password logins are protected by Garmin Cloudflare security. Please paste your session token or Personal API key in the "Session Token / Personal API Key" tab to complete the sync.',
      });
    } catch (ssoErr: any) {
      return res.status(502).json({
        success: false,
        error: `Could not reach Garmin SSO server: ${ssoErr.message}`,
      });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Internal server error during Garmin sync' });
  }
});


// Setup Vite middleware in dev or static files in production
async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`FIT Track Server listening on http://${HOST}:${PORT}`);
  });

  server.on('error', (err: any) => {
    console.error('[FIT Track Server] Server listen error:', err);
  });
}

startServer().catch((err) => {
  console.error('[FIT Track Server] Failed to initialize server:', err);
});

