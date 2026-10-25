import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Process safety handlers
process.on('uncaughtException', (err) => {
  console.error('[GymFIT Server] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[GymFIT Server] Unhandled Rejection at:', promise, 'reason:', reason);
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
            <p style="color: #94a3b8; font-size: 14px;">Closing window and returning to GymFIT...</p>
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
    const targetFileName = fileName || `${(name || 'GymFIT_Workout').replace(/\s+/g, '_')}.fit`;

    const formData = new FormData();
    formData.append('file', fitBlob, targetFileName);
    formData.append('name', name || 'Strength & Conditioning');
    formData.append('description', description || 'Logged via GymFIT');
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
    const perPage = req.query.per_page || 30;
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
    console.log(`GymFIT Server listening on http://${HOST}:${PORT}`);
  });

  server.on('error', (err: any) => {
    console.error('[GymFIT Server] Server listen error:', err);
  });
}

startServer().catch((err) => {
  console.error('[GymFIT Server] Failed to initialize server:', err);
});

