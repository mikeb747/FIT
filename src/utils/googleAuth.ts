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

// In-memory token cache backed by expiration-aware localStorage for seamless session restoration
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export interface GoogleAuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

/**
 * Retrieve cached access token from memory or valid non-expired localStorage session
 */
export const getGoogleAccessToken = (): string | null => {
  if (cachedAccessToken) return cachedAccessToken;

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
  }

  return null;
};

/**
 * Initialize Google Auth state listener with auto-restoration
 */
export const initGoogleAuth = (
  onSuccess?: (user: User, token: string) => void,
  onFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    const validToken = getGoogleAccessToken();
    if (user && validToken) {
      if (onSuccess) onSuccess(user, validToken);
    } else {
      if (!isSigningIn) {
        if (!validToken) {
          cachedAccessToken = null;
        }
        if (onFailure) onFailure();
      }
    }
  });
};

/**
 * Trigger Google Sign In popup and persist token session with TTL
 */
export const signInWithGoogle = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve Google OAuth access token');
    }

    cachedAccessToken = credential.accessToken;

    if (typeof window !== 'undefined') {
      try {
        // Google access tokens typically valid for 3600s (1 hr). Set TTL to 3500s.
        const expiry = Date.now() + 3500 * 1000;
        localStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, cachedAccessToken);
        localStorage.setItem(GOOGLE_TOKEN_EXPIRY_KEY, String(expiry));
      } catch (err) {
        console.warn('[Google Auth] Could not persist token to storage:', err);
      }
    }

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('[Google Auth] Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Sign out from Google Auth and clear persistent token
 */
export const signOutGoogle = async (): Promise<void> => {
  await signOut(auth);
  cachedAccessToken = null;
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
      localStorage.removeItem(GOOGLE_TOKEN_EXPIRY_KEY);
    } catch {}
  }
};

export const getCurrentGoogleUser = (): User | null => {
  return auth.currentUser;
};
