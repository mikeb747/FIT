import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App singleton
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// Provider with Google Workspace Scopes
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');

const GOOGLE_ACCESS_TOKEN_KEY = 'gymfit_google_access_token';
const GOOGLE_TOKEN_EXPIRY_KEY = 'gymfit_google_token_expiry';
const GOOGLE_USER_EMAIL_KEY = 'gymfit_google_user_email';
const GOOGLE_BRIDGE_URL_KEY = 'gymfit_google_sheets_bridge_url';
const GOOGLE_OAUTH_CLIENT_ID_KEY = 'gymfit_google_oauth_client_id';
const GOOGLE_OAUTH_CLIENT_SECRET_KEY = 'gymfit_google_oauth_client_secret';
const GOOGLE_OAUTH_REFRESH_TOKEN_KEY = 'gymfit_google_oauth_refresh_token';
const SPREADSHEET_ID_KEY = 'gymfit_google_sheets_spreadsheet_id';

// In-memory token cache backed by expiration-aware localStorage for seamless session restoration
let cachedAccessToken: string | null = null;
let isSigningIn = false;
let inFlightRefreshPromise: Promise<string | null> | null = null;

export interface GoogleAuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export interface GoogleOAuthCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export type GoogleConnectionMode = 'bridge' | 'refresh_token' | 'session' | 'disconnected';

export const getSavedGoogleUserEmail = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(GOOGLE_USER_EMAIL_KEY) || auth.currentUser?.email || null;
  } catch {
    return null;
  }
};

export const saveGoogleUserEmail = (email: string | null): void => {
  if (typeof window === 'undefined') return;
  try {
    if (email && email.trim()) {
      localStorage.setItem(GOOGLE_USER_EMAIL_KEY, email.trim());
    } else {
      localStorage.removeItem(GOOGLE_USER_EMAIL_KEY);
    }
  } catch {}
};

export const getGoogleSheetsBridgeUrl = (): string => {
  if (typeof window === 'undefined') return '';
  try {
    return (localStorage.getItem(GOOGLE_BRIDGE_URL_KEY) || '').trim();
  } catch {
    return '';
  }
};

export const saveGoogleSheetsBridgeUrl = (url: string): void => {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = url.trim();
    if (trimmed) {
      localStorage.setItem(GOOGLE_BRIDGE_URL_KEY, trimmed);
    } else {
      localStorage.removeItem(GOOGLE_BRIDGE_URL_KEY);
    }
  } catch {}
};

export const getGoogleOAuthCredentials = (): GoogleOAuthCredentials => {
  if (typeof window === 'undefined') {
    return { clientId: '', clientSecret: '', refreshToken: '' };
  }
  try {
    return {
      clientId: (localStorage.getItem(GOOGLE_OAUTH_CLIENT_ID_KEY) || '').trim(),
      clientSecret: (localStorage.getItem(GOOGLE_OAUTH_CLIENT_SECRET_KEY) || '').trim(),
      refreshToken: (localStorage.getItem(GOOGLE_OAUTH_REFRESH_TOKEN_KEY) || '').trim(),
    };
  } catch {
    return { clientId: '', clientSecret: '', refreshToken: '' };
  }
};

export const saveGoogleOAuthCredentials = (creds: Partial<GoogleOAuthCredentials>): void => {
  if (typeof window === 'undefined') return;
  try {
    if (creds.clientId !== undefined) {
      const v = creds.clientId.trim();
      if (v) localStorage.setItem(GOOGLE_OAUTH_CLIENT_ID_KEY, v);
      else localStorage.removeItem(GOOGLE_OAUTH_CLIENT_ID_KEY);
    }
    if (creds.clientSecret !== undefined) {
      const v = creds.clientSecret.trim();
      if (v) localStorage.setItem(GOOGLE_OAUTH_CLIENT_SECRET_KEY, v);
      else localStorage.removeItem(GOOGLE_OAUTH_CLIENT_SECRET_KEY);
    }
    if (creds.refreshToken !== undefined) {
      const v = creds.refreshToken.trim();
      if (v) localStorage.setItem(GOOGLE_OAUTH_REFRESH_TOKEN_KEY, v);
      else localStorage.removeItem(GOOGLE_OAUTH_REFRESH_TOKEN_KEY);
    }
  } catch {}
};

export const hasPersistentGoogleCredentials = (): boolean => {
  const bridgeUrl = getGoogleSheetsBridgeUrl();
  if (bridgeUrl.startsWith('https://script.google.com/')) return true;
  const { clientId, clientSecret, refreshToken } = getGoogleOAuthCredentials();
  return Boolean(clientId && clientSecret && refreshToken);
};

export const getGoogleConnectionMode = (): GoogleConnectionMode => {
  const bridgeUrl = getGoogleSheetsBridgeUrl();
  if (bridgeUrl.startsWith('https://script.google.com/')) return 'bridge';
  const { clientId, clientSecret, refreshToken } = getGoogleOAuthCredentials();
  if (clientId && clientSecret && refreshToken) return 'refresh_token';
  if (getGoogleAccessToken()) return 'session';
  return 'disconnected';
};

const storeAccessTokenWithTtl = (token: string, ttlSeconds = 3400): void => {
  cachedAccessToken = token;
  if (typeof window !== 'undefined') {
    try {
      const expiry = Date.now() + Math.max(300, ttlSeconds) * 1000;
      localStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, token);
      localStorage.setItem(GOOGLE_TOKEN_EXPIRY_KEY, String(expiry));
    } catch {}
  }
};

/**
 * Retrieve cached access token from memory or valid non-expired localStorage session.
 * If expired and persistent credentials (Apps Script Bridge or OAuth Refresh Token) exist,
 * triggers a non-blocking background refresh so subsequent calls have a fresh token.
 */
export const getGoogleAccessToken = (): string | null => {
  if (cachedAccessToken) {
    if (typeof window !== 'undefined') {
      const expiryStr = localStorage.getItem(GOOGLE_TOKEN_EXPIRY_KEY);
      if (expiryStr && Date.now() >= parseInt(expiryStr, 10) - 60 * 1000) {
        cachedAccessToken = null;
      } else {
        return cachedAccessToken;
      }
    } else {
      return cachedAccessToken;
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);
      const expiryStr = localStorage.getItem(GOOGLE_TOKEN_EXPIRY_KEY);
      if (stored && expiryStr) {
        const expiry = parseInt(expiryStr, 10);
        // Valid if at least 60 seconds of validity remain
        if (Date.now() < expiry - 60 * 1000) {
          cachedAccessToken = stored;
          return stored;
        } else {
          // Token expired, clear storage
          localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
          localStorage.removeItem(GOOGLE_TOKEN_EXPIRY_KEY);
        }
      }
    } catch {
      // LocalStorage error fallback
    }

    // Kick off silent background renewal if persistent credentials are configured
    if (hasPersistentGoogleCredentials() && !inFlightRefreshPromise) {
      void refreshGoogleTokenSilently();
    }
  }

  return null;
};

/**
 * Silently refreshes the Google OAuth access token in the background without any popup:
 * 1. Via Google Apps Script Web App Bridge URL (if configured)
 * 2. Or via Google OAuth Refresh Token (Client ID + Client Secret + Refresh Token, just like Strava)
 */
export const refreshGoogleTokenSilently = async (): Promise<string | null> => {
  if (typeof window === 'undefined') return null;
  if (inFlightRefreshPromise) return inFlightRefreshPromise;

  inFlightRefreshPromise = (async () => {
    try {
      // Path 1: Google Apps Script Bridge URL (0 popups, 0 warning screens, 100% free)
      const bridgeUrl = getGoogleSheetsBridgeUrl();
      if (bridgeUrl && bridgeUrl.startsWith('https://script.google.com/')) {
        let data: any = null;
        try {
          const res = await fetch(bridgeUrl, {
            method: 'GET',
            redirect: 'follow',
            headers: { Accept: 'application/json' },
          });
          if (res.ok) {
            data = await res.json();
          }
        } catch {
          // Fallback to server proxy if browser blocks cross-origin redirect
          try {
            const proxyRes = await fetch('/api/google/bridge-token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bridgeUrl }),
            });
            if (proxyRes.ok) {
              data = await proxyRes.json();
            }
          } catch {}
        }

        if (data && typeof data.access_token === 'string' && data.access_token.trim()) {
          const token = data.access_token.trim();
          const ttl = typeof data.expires_in === 'number' ? data.expires_in - 120 : 3300;
          storeAccessTokenWithTtl(token, ttl);
          if (data.spreadsheet_id && typeof data.spreadsheet_id === 'string') {
            try {
              const existingSheetId = localStorage.getItem(SPREADSHEET_ID_KEY);
              if (!existingSheetId) {
                localStorage.setItem(SPREADSHEET_ID_KEY, data.spreadsheet_id.trim());
              }
            } catch {}
          }
          if (data.email && typeof data.email === 'string') {
            saveGoogleUserEmail(data.email);
          }
          window.dispatchEvent(
            new CustomEvent('gymfit_google_auth_updated', {
              detail: { connected: true, email: data.email || getSavedGoogleUserEmail(), mode: 'bridge' },
            })
          );
          return token;
        }
      }

      // Path 2: Persistent Google OAuth Refresh Token (identical to Strava refresh flow)
      const { clientId, clientSecret, refreshToken } = getGoogleOAuthCredentials();
      if (clientId && clientSecret && refreshToken) {
        const params = new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        });

        const res = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });

        if (res.ok) {
          const tokenData = await res.json();
          if (tokenData.access_token) {
            const ttl = typeof tokenData.expires_in === 'number' ? tokenData.expires_in - 120 : 3400;
            storeAccessTokenWithTtl(tokenData.access_token, ttl);
            window.dispatchEvent(
              new CustomEvent('gymfit_google_auth_updated', {
                detail: { connected: true, email: getSavedGoogleUserEmail(), mode: 'refresh_token' },
              })
            );
            return tokenData.access_token as string;
          }
        }
      }

      return null;
    } catch (err) {
      console.warn('[Google Auth] Silent token refresh failed:', err);
      return null;
    } finally {
      inFlightRefreshPromise = null;
    }
  })();

  return inFlightRefreshPromise;
};

/**
 * Ensures a valid Google Sheets OAuth access token is available:
 * 1. Returns cached non-expired token if present
 * 2. Otherwise attempts silent background refresh (Apps Script Bridge or OAuth Refresh Token)
 * 3. Only opens the interactive Google popup if `options?.allowPopup === true`
 */
export const ensureGoogleAccessToken = async (options?: {
  allowPopup?: boolean;
}): Promise<string | null> => {
  const existing = getGoogleAccessToken();
  if (existing) return existing;

  const refreshed = await refreshGoogleTokenSilently();
  if (refreshed) return refreshed;

  if (options?.allowPopup) {
    const res = await signInWithGoogle();
    return res.accessToken;
  }

  return null;
};

/**
 * Initialize Google Auth state listener with auto-restoration and persistent credential support
 */
export const initGoogleAuth = (
  onSuccess?: (user: User | { email: string | null }, token: string) => void,
  onFailure?: () => void
) => {
  // Also listen for custom persistent auth updates (Bridge URL or Refresh Token)
  const handleCustomAuthUpdate = () => {
    const token = getGoogleAccessToken();
    if (token && onSuccess) {
      onSuccess(auth.currentUser || { email: getSavedGoogleUserEmail() || 'Connected via Persistent Token' }, token);
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('gymfit_google_auth_updated', handleCustomAuthUpdate);
  }

  const unsubFirebase = onAuthStateChanged(auth, async (user: User | null) => {
    if (user?.email) {
      saveGoogleUserEmail(user.email);
    }
    let validToken = getGoogleAccessToken();
    if (!validToken && hasPersistentGoogleCredentials()) {
      validToken = await refreshGoogleTokenSilently();
    }

    if (validToken) {
      const effectiveUser = user || { email: getSavedGoogleUserEmail() || 'Connected via Persistent Token' };
      if (onSuccess) onSuccess(effectiveUser, validToken);
    } else {
      if (!isSigningIn) {
        cachedAccessToken = null;
        if (onFailure) onFailure();
      }
    }
  });

  return () => {
    unsubFirebase();
    if (typeof window !== 'undefined') {
      window.removeEventListener('gymfit_google_auth_updated', handleCustomAuthUpdate);
    }
  };
};

/**
 * Trigger Google Sign In (First tries silent refresh if persistent credentials exist;
 * otherwise opens popup with remembered login_hint so user doesn't have to re-type email)
 */
export const signInWithGoogle = async (options?: {
  forcePopup?: boolean;
}): Promise<{ user: User | { email: string | null }; accessToken: string }> => {
  try {
    isSigningIn = true;

    if (!options?.forcePopup) {
      const silentToken = await refreshGoogleTokenSilently();
      if (silentToken) {
        return {
          user: auth.currentUser || { email: getSavedGoogleUserEmail() || 'Connected via Persistent Token' },
          accessToken: silentToken,
        };
      }
    }

    const savedEmail = getSavedGoogleUserEmail();
    if (savedEmail) {
      provider.setCustomParameters({
        login_hint: savedEmail,
      });
    }

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve Google OAuth access token');
    }

    if (result.user?.email) {
      saveGoogleUserEmail(result.user.email);
    }
    storeAccessTokenWithTtl(credential.accessToken, 3500);

    return { user: result.user, accessToken: credential.accessToken };
  } catch (error: any) {
    console.error('[Google Auth] Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Sign out from Google Auth and clear persistent tokens
 */
export const signOutGoogle = async (clearPersistent = false): Promise<void> => {
  await signOut(auth).catch(() => {});
  cachedAccessToken = null;
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
      localStorage.removeItem(GOOGLE_TOKEN_EXPIRY_KEY);
      if (clearPersistent) {
        localStorage.removeItem(GOOGLE_BRIDGE_URL_KEY);
        localStorage.removeItem(GOOGLE_OAUTH_CLIENT_ID_KEY);
        localStorage.removeItem(GOOGLE_OAUTH_CLIENT_SECRET_KEY);
        localStorage.removeItem(GOOGLE_OAUTH_REFRESH_TOKEN_KEY);
      }
    } catch {}
  }
};

export const getCurrentGoogleUser = (): User | null => {
  return auth.currentUser;
};

/**
 * Ready-to-paste Google Apps Script snippet for the user's "GymFIT Training Log" Google Sheet.
 * Deploying this inside Extensions -> Apps Script -> Deploy as Web App gives permanent,
 * zero-popup, zero-warning-screen access to the sheet forever at $0 cost.
 */
export const getGoogleAppsScriptBridgeTemplate = (): string => {
  return `// Fit Track — Permanent Google Sheets Cloud Backup Bridge ($0 / Zero Login Popups)
// 1. In your "GymFIT Training Log" Google Sheet, click Extensions -> Apps Script
// 2. Paste this code into Code.gs and click Save (Ctrl+S)
// 3. Click Deploy -> New deployment -> Select type: "Web app"
//    - Execute as: "Me"
//    - Who has access: "Anyone"
// 4. Click Deploy, copy the Web App URL, and paste it into Fit Track Settings!

function doGet(e) {
  // Touch SpreadsheetApp & DriveApp so Apps Script includes Sheets & Drive scopes automatically
  var sheet = SpreadsheetApp.getActiveSpreadsheet();
  // DriveApp.getStorageUsed();
  var payload = {
    access_token: ScriptApp.getOAuthToken(),
    expires_in: 3500,
    spreadsheet_id: sheet ? sheet.getId() : '',
    spreadsheet_name: sheet ? sheet.getName() : 'GymFIT Training Log',
    email: Session.getEffectiveUser().getEmail()
  };
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}`;
};

