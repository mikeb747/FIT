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
interface ExchangeTokenResult {
  success: boolean;
  accessToken?: string;
  error?: string;
  trace?: any;
}

async function exchangeGarminApiKeyForToken(
  apiKey: string
): Promise<ExchangeTokenResult> {
  const startTime = Date.now();
  const url = 'https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token';
  const cleanKey = apiKey.trim();
  const maskedKey = cleanKey.length > 8 ? `${cleanKey.slice(0, 6)}...${cleanKey.slice(-4)}` : '***';

  const trace: any = {
    id: `trace_token_${Date.now()}`,
    timestamp: new Date().toISOString(),
    label: '1. Garmin API Key Exchange (POST /personal-api/personal-api-key/token)',
    request: {
      method: 'POST',
      url,
      headers: {
        'Authorization': `ApiKey ${maskedKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
      },
      body: null,
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `ApiKey ${cleanKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
      },
    });

    const durationMs = Date.now() - startTime;
    const responseBody = await response.text();
    const contentType = response.headers.get('content-type') || 'unknown content type';
    let data: unknown;
    try {
      data = responseBody ? JSON.parse(responseBody) : undefined;
    } catch {
      data = undefined;
    }

    const responseData =
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : undefined;

    trace.response = {
      status: response.status,
      statusText: response.statusText,
      contentType,
      body: responseBody,
      durationMs,
    };

    if (!response.ok) {
      const errMsg =
        (typeof responseData?.message === 'string' && responseData.message) ||
        (typeof responseData?.error === 'string' && responseData.error) ||
        (typeof responseData?.error_description === 'string' && responseData.error_description) ||
        `Garmin token exchange failed (${response.status} ${response.statusText}; ${contentType})`;
      trace.error = errMsg;
      return { success: false, error: errMsg, trace };
    }

    // 1. Try finding token in standard JSON candidates
    let token = [
      responseData?.access_token,
      responseData?.accessToken,
      responseData?.token,
      responseData?.bearer_token,
      responseData?.jwt,
      (responseData?.data as Record<string, unknown> | undefined)?.access_token,
      (responseData?.data as Record<string, unknown> | undefined)?.token,
    ].find(
      (candidate): candidate is string =>
        typeof candidate === 'string' && candidate.trim().length > 0
    );

    // 2. If data parsed as a primitive string
    if (!token && typeof data === 'string' && data.trim().length > 0) {
      token = data.trim();
    }

    // 3. Accept non-JSON returns: URL-encoded query string (e.g. access_token=...&token_type=bearer)
    if (!token && responseBody.trim()) {
      try {
        const params = new URLSearchParams(responseBody.trim());
        const paramToken =
          params.get('access_token') ||
          params.get('accessToken') ||
          params.get('token') ||
          params.get('oauth_token') ||
          params.get('bearer_token');
        if (paramToken && paramToken.trim()) {
          token = paramToken.trim();
        }
      } catch {}
    }

    // 4. Accept non-JSON returns: key-value pattern (e.g. access_token: xyz or access_token = xyz)
    if (!token && responseBody.trim()) {
      const kvMatch = responseBody.match(/(?:access_token|accessToken|bearer_token|oauth_token|token)\s*[:=]\s*["']?([A-Za-z0-9_\-\.~]+)["']?/i);
      if (kvMatch && kvMatch[1]) {
        token = kvMatch[1].trim();
      }
    }

    // 5. Accept non-JSON returns: plain text token (e.g. raw JWT "eyJ...", UUID, or alphanumeric string without HTML)
    if (!token && responseBody.trim()) {
      const isHtml = /<!DOCTYPE|<html|<head|<body|<xml/i.test(responseBody);
      const cleanText = responseBody.trim().replace(/^["']|["']$/g, '');
      if (!isHtml && cleanText.length >= 10 && !/\s/.test(cleanText)) {
        token = cleanText;
      }
    }

    if (!token) {
      const responseShape = Array.isArray(data)
        ? 'JSON array'
        : responseData
          ? `JSON object with fields: ${Object.keys(responseData).join(', ') || '(none)'}`
          : data === null
            ? 'JSON null'
            : data !== undefined
              ? `JSON ${typeof data}`
              : responseBody.trim()
                ? 'non-JSON response'
                : 'empty response';
      const errMsg = `Garmin returned HTTP ${response.status} without a recognized access token (${contentType}; ${responseShape}).`;
      trace.error = errMsg;
      return {
        success: false,
        error: errMsg,
        trace,
      };
    }

    return { success: true, accessToken: token, trace };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    trace.error = err.message || 'Error exchanging Garmin API Key for access token';
    trace.response = {
      status: 0,
      statusText: 'Network Error',
      body: err.message || 'Error exchanging Garmin API Key for access token',
      durationMs,
    };
    return { success: false, error: err.message || 'Error exchanging Garmin API Key for access token', trace };
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
// Garmin Connect Automated Wellness Sync with Full Tracing
// =========================================================
app.post('/api/garmin/sync-multiweek', async (req, res) => {
  const traces: any[] = [];
  try {
    const { email, password, sessionToken, weeks = 4, debugDate, baselineRhr = 41 } = req.body;
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
        traces,
      });
    }

    // Date to check (defaults to 2026-10-28 as requested in GARMIN.md and user instruction)
    const targetDate = (debugDate && typeof debugDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(debugDate))
      ? debugDate
      : '2026-10-28';

    const fetchWithTrace = async (
      label: string,
      url: string,
      reqHeaders: Record<string, string>,
      method: string = 'GET',
      bodyPayload?: string
    ) => {
      const startTime = Date.now();
      const safeHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(reqHeaders)) {
        if (k.toLowerCase() === 'authorization') {
          const parts = String(v).split(' ');
          const scheme = parts[0] || '';
          const secret = parts[1] || '';
          safeHeaders[k] = secret.length > 8 ? `${scheme} ${secret.slice(0, 8)}...***` : `${scheme} ***`;
        } else if (k.toLowerCase() === 'cookie') {
          safeHeaders[k] = 'GARMIN-SSO-GUID=***';
        } else {
          safeHeaders[k] = String(v);
        }
      }

      const trace: any = {
        id: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        label,
        request: {
          method,
          url,
          headers: safeHeaders,
          body: bodyPayload || null,
        },
      };

      try {
        const response = await fetch(url, {
          method,
          headers: reqHeaders,
          body: bodyPayload,
          signal: AbortSignal.timeout(9000),
        });

        const durationMs = Date.now() - startTime;
        const responseText = await response.text();
        const contentType = response.headers.get('content-type') || '';
        let parsedJson: any = null;
        if (responseText) {
          try {
            parsedJson = JSON.parse(responseText);
          } catch {}
        }

        trace.response = {
          status: response.status,
          statusText: response.statusText,
          contentType,
          body: responseText,
          durationMs,
        };

        traces.push(trace);
        return {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          text: responseText,
          payload: parsedJson,
          contentType,
        };
      } catch (err: any) {
        const durationMs = Date.now() - startTime;
        trace.error = err.message || 'Network fetch failed';
        trace.response = {
          status: 0,
          statusText: err.name === 'TimeoutError' ? 'Garmin Timeout (9s)' : 'Network Error',
          contentType: 'text/plain',
          body: err.message || 'Network fetch failed',
          durationMs,
        };
        traces.push(trace);
        return {
          ok: false,
          status: 0,
          statusText: 'Network Error',
          text: '',
          payload: null,
          contentType: '',
        };
      }
    };

    // 1. Session Token or Personal API Key Flow
    if (trimmedToken) {
      const nowMs = Date.now();
      const nowSec = Math.floor(nowMs / 1000);
      const startSec = nowSec - requestedDays * 86400;

      const isPersonalApiKey = trimmedToken.startsWith('GCDC_') || (!trimmedToken.includes('=') && trimmedToken.length > 20);
      let bearerToken = trimmedToken;
      let tokenExchangeError: string | null = null;

      // GARMIN.md Section 0.5: Exchange API Key for Bearer Access Token
      if (isPersonalApiKey) {
        const tokenRes = await exchangeGarminApiKeyForToken(trimmedToken);
        if (tokenRes.trace) {
          traces.push(tokenRes.trace);
        }
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
          traces,
          error: `Garmin API Key Exchange Failed: ${tokenExchangeError}`,
        });
      }

      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
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

      const apiBase = isPersonalApiKey
        ? 'https://personal.connectapi.garmin.com'
        : 'https://connect.garmin.com/modern/proxy';

      // 1. Request Sleep first (GARMIN.md Section 0.6)
      const sleepUrl = `${apiBase}/sleep-service/sleep/dailySleep?date=${encodeURIComponent(targetDate)}`;
      let sleepRes = await fetchWithTrace(
        `2. Sleep Data (GET /sleep-service/sleep/dailySleep?date=${targetDate})`,
        sleepUrl,
        headers
      );

      // If dailySleep returned 404, try alternative path endpoint (/sleep-service/sleep/{date})
      if (!sleepRes.ok && sleepRes.status === 404) {
        const altSleepUrl = `${apiBase}/sleep-service/sleep/${encodeURIComponent(targetDate)}`;
        const altSleepRes = await fetchWithTrace(
          `2b. Sleep Data Alternative (GET /sleep-service/sleep/${targetDate})`,
          altSleepUrl,
          headers
        );
        if (altSleepRes.ok || altSleepRes.payload) {
          sleepRes = altSleepRes;
        }
      }

      // 2. Request Daily Summary second (heart rate, steps, calories)
      const summaryUrl = `${apiBase}/usersummary-service/usersummary/daily?calendarDate=${encodeURIComponent(targetDate)}`;
      let summaryRes = await fetchWithTrace(
        `3. Daily Summary (GET /usersummary-service/usersummary/daily?calendarDate=${targetDate})`,
        summaryUrl,
        headers
      );

      // If daily summary returned 404, try alternative path endpoint (/usersummary-service/usersummary/daily/{date})
      if (!summaryRes.ok && summaryRes.status === 404) {
        const altSummaryUrl = `${apiBase}/usersummary-service/usersummary/daily/${encodeURIComponent(targetDate)}`;
        const altSummaryRes = await fetchWithTrace(
          `3b. Daily Summary Alternative (GET /usersummary-service/usersummary/daily/${targetDate})`,
          altSummaryUrl,
          headers
        );
        if (altSummaryRes.ok || altSummaryRes.payload) {
          summaryRes = altSummaryRes;
        }
      }

      // 3. Request HRV Daily endpoint (GARMIN.md Section 0.6)
      const hrvUrl = `${apiBase}/hrv-service/hrv/${encodeURIComponent(targetDate)}`;
      const hrvRes = await fetchWithTrace(
        `4. HRV Daily (GET /hrv-service/hrv/${targetDate})`,
        hrvUrl,
        headers
      );

      // 4. Request HRV Daily Range endpoint
      const hrvRangeUrl = `${apiBase}/hrv-service/hrv/daily/${encodeURIComponent(targetDate)}/${encodeURIComponent(targetDate)}`;
      const hrvRangeRes = await fetchWithTrace(
        `5. HRV Range (GET /hrv-service/hrv/daily/${targetDate}/${targetDate})`,
        hrvRangeUrl,
        headers
      );

      // Parse sleep response
      const sleepRoot = sleepRes.payload && typeof sleepRes.payload === 'object' ? sleepRes.payload : {};
      const sleepData = sleepRoot.dailySleepDTO || sleepRoot;
      const sleepSeconds = Number(sleepData.sleepTimeSeconds ?? sleepData.durationInSeconds);
      const sleepScore = Number(sleepData.sleepScores?.overall?.value ?? sleepData.sleepScore);
      const hasSleepDuration = Number.isFinite(sleepSeconds) && sleepSeconds > 0;

      // Parse summary response
      const summaryRoot = summaryRes.payload && typeof summaryRes.payload === 'object' ? summaryRes.payload : {};
      const summary = summaryRoot.userDailySummary || summaryRoot.dailySummary || summaryRoot.data || summaryRoot;
      const readNumber = (...keys: string[]): number | undefined => {
        for (const key of keys) {
          const value = summary[key];
          const numberValue = typeof value === 'number' ? value : Number(value);
          if (value !== undefined && value !== null && value !== '' && Number.isFinite(numberValue)) {
            return numberValue;
          }
        }
        return undefined;
      };

      const steps = readNumber('totalSteps', 'steps', 'stepCount');
      const activeCalories = readNumber('activeCalories');
      const totalCalories = readNumber('totalCalories');
      const calories = readNumber('calories') ?? activeCalories ?? totalCalories;
      const restingHeartRate = readNumber('restingHeartRate', 'restingHeartRateInBeatsPerMinute', 'restingHr');
      const heartRate = readNumber('heartRate', 'averageHeartRate') ?? restingHeartRate;

      // Parse HRV response
      const hrvRoot = hrvRes.payload && typeof hrvRes.payload === 'object' ? hrvRes.payload : {};
      const hrvSummary = hrvRoot.hrvSummary || hrvRoot;
      let hrvRmssd = Number(
        hrvSummary.lastNightAvg ??
        hrvSummary.averageHRV ??
        hrvSummary.hrvWeeklyAvg ??
        readNumber('lastNightAvg', 'averageHRV', 'hrvRmssd', 'overnightHrv')
      );
      if (!Number.isFinite(hrvRmssd) || hrvRmssd <= 0) {
        const rangeArr = Array.isArray(hrvRangeRes.payload)
          ? hrvRangeRes.payload
          : hrvRangeRes.payload?.hrvSummaries;
        if (Array.isArray(rangeArr) && rangeArr.length > 0) {
          const item = rangeArr[0];
          const val = Number(item?.lastNightAvg ?? item?.weeklyAvg ?? item?.averageHRV);
          if (Number.isFinite(val) && val > 0) {
            hrvRmssd = val;
          }
        }
      }

      // Check items for UI summary
      const checks = [
        {
          metric: 'Sleep Duration & Score',
          received: sleepRes.ok && hasSleepDuration,
          status: sleepRes.status,
          value: hasSleepDuration
            ? `${Math.round(sleepSeconds / 60)} min${Number.isFinite(sleepScore) && sleepScore > 0 ? `; score ${sleepScore}` : ''}`
            : undefined,
          message: sleepRes.ok
            ? (hasSleepDuration ? 'Sleep duration received' : 'Response OK, but sleep duration was not found in response.')
            : `Garmin HTTP ${sleepRes.status} ${sleepRes.statusText}`,
        },
        {
          metric: 'Heart Rate / RHR',
          received: summaryRes.ok && heartRate !== undefined,
          status: summaryRes.status,
          value: heartRate !== undefined ? `${heartRate} bpm` : undefined,
          message: summaryRes.ok
            ? (heartRate !== undefined ? 'Heart rate received' : 'Response OK, but heart rate was not found in summary.')
            : `Garmin HTTP ${summaryRes.status} ${summaryRes.statusText}`,
        },
        {
          metric: 'HRV (rMSSD)',
          received: (hrvRes.ok || hrvRangeRes.ok) && Number.isFinite(hrvRmssd) && hrvRmssd > 0,
          status: hrvRes.status || hrvRangeRes.status,
          value: Number.isFinite(hrvRmssd) && hrvRmssd > 0 ? `${Math.round(hrvRmssd)} ms` : undefined,
          message: (hrvRes.ok || hrvRangeRes.ok)
            ? (Number.isFinite(hrvRmssd) && hrvRmssd > 0 ? 'HRV received' : 'Response OK, but overnight HRV was not found.')
            : `Garmin HTTP ${hrvRes.status} ${hrvRes.statusText}`,
        },
        {
          metric: 'Steps',
          received: summaryRes.ok && steps !== undefined,
          status: summaryRes.status,
          value: steps !== undefined ? `${steps} steps` : undefined,
          message: summaryRes.ok ? (steps !== undefined ? 'Steps received' : 'Steps not found.') : `Garmin HTTP ${summaryRes.status}`,
        },
        {
          metric: 'Calories',
          received: summaryRes.ok && calories !== undefined,
          status: summaryRes.status,
          value: calories !== undefined ? `${calories} kcal` : undefined,
          message: summaryRes.ok ? (calories !== undefined ? 'Calories received' : 'Calories not found.') : `Garmin HTTP ${summaryRes.status}`,
        },
      ];

      const sleepMinutes = hasSleepDuration ? Math.round(sleepSeconds / 60) : 0;
      const logs = (restingHeartRate && restingHeartRate > 0 && sleepMinutes > 0)
        ? [{
            id: `rec_garmin_${targetDate}`,
            date: targetDate,
            restingHr: restingHeartRate,
            hrvRmssd: Number.isFinite(hrvRmssd) && hrvRmssd > 0 ? Math.round(hrvRmssd) : 60,
            sleepDurationMinutes: sleepMinutes,
            sleepScore: Number.isFinite(sleepScore) && sleepScore > 0 ? sleepScore : 0,
            deepSleepMinutes: Math.round(Number(sleepData.deepSleepSeconds || 0) / 60),
            remSleepMinutes: Math.round(Number(sleepData.remSleepSeconds || 0) / 60),
            lightSleepMinutes: Math.round(Number(sleepData.lightSleepSeconds || 0) / 60),
            awakeMinutes: Math.round(Number(sleepData.awakeSleepSeconds || 0) / 60),
            source: 'garmin' as const,
            notes: `Garmin daily sync for ${targetDate} UTC`,
          }]
        : [];

      const anyMetricReceived = checks.some((c) => c.received);

      return res.status(200).json({
        success: logs.length > 0,
        syncedDays: logs.length,
        weeks: requestedWeeks,
        logs,
        checks,
        traces,
        message: logs.length > 0
          ? `Successfully synchronized Garmin recovery data for ${targetDate} (UTC).`
          : anyMetricReceived
            ? `Garmin responded for ${targetDate} (UTC), but some recovery metrics (RHR or sleep) were missing in the telemetry payload.`
            : `Garmin Connect returned no telemetry for ${targetDate} (UTC). Inspect the requests and responses below for full diagnostic details.`,
        error: logs.length > 0
          ? undefined
          : `Garmin Connect did not return recovery metrics for ${targetDate} (UTC). See request and response logs below.`,
      });
    }

    // 2. Direct Username/Password SSO Flow
    try {
      const ssoRes = await fetchWithTrace(
        'Garmin SSO Check (GET https://sso.garmin.com/sso/signin)',
        'https://sso.garmin.com/sso/signin?service=https%3A%2F%2Fconnect.garmin.com%2Fmodern%2F',
        {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        }
      );

      return res.status(401).json({
        success: false,
        mfaRequired: true,
        traces,
        error:
          'Garmin Connect requires Two-Factor Authentication (2FA) verification. Headless password logins are protected by Garmin Cloudflare security. Please paste your session token or Personal API key in the "Personal API Key / Token" tab to complete the sync.',
      });
    } catch (ssoErr: any) {
      return res.status(502).json({
        success: false,
        traces,
        error: `Could not reach Garmin SSO server: ${ssoErr.message}`,
      });
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      traces,
      error: err.message || 'Internal server error during Garmin sync',
    });
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
