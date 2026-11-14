import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  writeBatch,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { AthleteProfile } from '../types/athlete';
import type { TrainingGoal } from '../types/goals';
import type { DailyRecoveryLog } from '../types/recovery';
import { loadAthleteProfile, saveAthleteProfile } from './athleteStorage';
import { loadAthleteGoals, saveAthleteGoals } from './goalsStorage';
import { loadRecoveryLogs, saveRecoveryLogs } from './recoveryStorage';
import {
  GARMIN_STORAGE_KEYS,
  getStoredGarminToken,
  getStoredGarminProxyUrl,
  getStoredGarminRequestTypes,
} from './garminConfig';
import { STRAVA_CONFIG } from './stravaOAuth';
import { GOOGLE_SHEETS_CONFIG } from './googleSheets';
import { getActivityRenameRules, saveActivityRenameRules } from './activityRenameRules';
import {
  loadTodayRecommendedWorkout,
  saveTodayRecommendedWorkout,
  loadSavedCoachingPlan,
  saveCoachingPlan,
  loadCoachChatHistory,
  saveCoachChatHistory,
} from './coachStorage';
import { isDemoRecoveryLogId, isLegacyDemoRecoveryLogId } from './demoData';

// Initialize Firebase App, Auth, and Firestore Database
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: boolean | string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on boot as required by guidelines
let hasTestedConnection = false;
async function testConnection() {
  if (hasTestedConnection) return;
  hasTestedConnection = true;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export type VaultDomain = 'profile' | 'integrations' | 'goals' | 'recovery' | 'coach';

const ALL_VAULT_DOMAINS: VaultDomain[] = [
  'profile',
  'integrations',
  'goals',
  'recovery',
  'coach',
];

export interface CloudSyncStatus {
  isAuthenticated: boolean;
  userUid: string | null;
  userEmail: string | null;
  userDisplayName: string | null;
  userPhotoUrl: string | null;
  isSyncing: boolean;
  lastSyncedAt: number | null;
  error: string | null;
}

export interface CloudHydratedSnapshot {
  athleteProfile?: AthleteProfile;
  theme?: 'light' | 'dark';
  displayDensity?: number | 'standard' | 'compact' | 'comfortable';
  brandTitle?: string;
  brandSubtitle?: string;
  globalTriDistance?: 'sprint' | 'olympic' | 'middle_70_3' | 'ironman';
  globalBikeCourseProfile?: 'flat' | 'rolling_800m' | 'hilly';
  athleteGoals?: TrainingGoal[];
  recoveryLogs?: DailyRecoveryLog[];
  stravaToken?: string | null;
  stravaAthlete?: string | null;
  stravaAutoRefreshOnOpen?: boolean;
  garminEmail?: string | null;
  garminConnected?: boolean;
  googleUserEmail?: string | null;
  googleSpreadsheetId?: string | null;
}

type CloudSyncListener = (status: CloudSyncStatus) => void;
type CloudDataHydratedCallback = (snapshot: CloudHydratedSnapshot) => void;

const syncListeners = new Set<CloudSyncListener>();
const hydrationCallbacks = new Set<CloudDataHydratedCallback>();

const LAST_CLOUD_SYNC_KEY = 'fittrack_cloud_vault_last_synced';

let currentStatus: CloudSyncStatus = {
  isAuthenticated: Boolean(auth.currentUser),
  userUid: auth.currentUser?.uid || null,
  userEmail: auth.currentUser?.email || null,
  userDisplayName: auth.currentUser?.displayName || null,
  userPhotoUrl: auth.currentUser?.photoURL || null,
  isSyncing: false,
  lastSyncedAt: (() => {
    try {
      const raw = localStorage.getItem(LAST_CLOUD_SYNC_KEY);
      return raw ? Number(raw) : null;
    } catch {
      return null;
    }
  })(),
  error: null,
};

function updateStatus(partial: Partial<CloudSyncStatus>) {
  currentStatus = { ...currentStatus, ...partial };
  if (partial.lastSyncedAt) {
    try {
      localStorage.setItem(LAST_CLOUD_SYNC_KEY, String(partial.lastSyncedAt));
    } catch {}
  }
  syncListeners.forEach((cb) => {
    try {
      cb(currentStatus);
    } catch {}
  });
}

export function getCloudSyncStatus(): CloudSyncStatus {
  return currentStatus;
}

export function subscribeToCloudSyncStatus(listener: CloudSyncListener): () => void {
  syncListeners.add(listener);
  listener(currentStatus);
  return () => {
    syncListeners.delete(listener);
  };
}

export function onCloudVaultHydrated(callback: CloudDataHydratedCallback): () => void {
  hydrationCallbacks.add(callback);
  return () => {
    hydrationCallbacks.delete(callback);
  };
}

function notifyHydrated(snapshot: CloudHydratedSnapshot) {
  hydrationCallbacks.forEach((cb) => {
    try {
      cb(snapshot);
    } catch (err) {
      console.warn('[CloudVault] Hydration callback error:', err);
    }
  });
}

/**
 * Recursively strips `undefined` and functions from an object/array so Firestore native
 * Maps and Lists never fail on `Unsupported field value: undefined`.
 */
function sanitizeForFirestore<T>(val: T): T {
  if (val === null || val === undefined) {
    return null as unknown as T;
  }
  if (Array.isArray(val)) {
    return val
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined && typeof v !== 'function') {
        out[k] = sanitizeForFirestore(v);
      }
    }
    return out as unknown as T;
  }
  if (typeof val === 'number' && !Number.isFinite(val)) {
    return 0 as unknown as T;
  }
  return val;
}

/**
 * Collects the local payload for a specific VaultDomain from localStorage & storage utilities.
 */
function buildLocalDomainPayload(domain: VaultDomain): Record<string, unknown> {
  if (domain === 'profile') {
    const profile = loadAthleteProfile();
    const theme = localStorage.getItem('ironfit_theme') || 'light';
    const displayDensity = localStorage.getItem('ironfit_display_density') || '100';
    const brandTitle = localStorage.getItem('ironfit_brand_title') || 'Fit Track';
    const brandSubtitle =
      localStorage.getItem('ironfit_brand_subtitle') || 'Strava Activities & Analytics';
    const globalTriDistance =
      localStorage.getItem('fittrack_global_tri_distance') || 'middle_70_3';
    const globalBikeCourseProfile =
      localStorage.getItem('fittrack_global_bike_course_profile') || 'rolling_800m';

    return sanitizeForFirestore({
      athleteProfile: profile,
      theme,
      displayDensity,
      brandTitle,
      brandSubtitle,
      globalTriDistance,
      globalBikeCourseProfile,
      clientUpdatedAtMs: Date.now(),
    });
  }

  if (domain === 'integrations') {
    let bikeGearNames: Record<string, string> = {};
    try {
      const rawGear = localStorage.getItem('fit_track_strava_bike_gear_names_v1');
      if (rawGear) bikeGearNames = JSON.parse(rawGear);
    } catch {}

    let deletedActivityIds: string[] = [];
    try {
      const rawDel = localStorage.getItem('gymfit_strava_deleted_activity_ids');
      if (rawDel) {
        const parsed = JSON.parse(rawDel);
        if (Array.isArray(parsed)) {
          deletedActivityIds = parsed.map(String).slice(-400);
        }
      }
    } catch {}

    return sanitizeForFirestore({
      // Strava settings & tokens
      stravaToken: localStorage.getItem(STRAVA_CONFIG.STORAGE_KEYS.TOKEN) || '',
      stravaRefreshToken: localStorage.getItem(STRAVA_CONFIG.STORAGE_KEYS.REFRESH_TOKEN) || '',
      stravaExpiresAt: localStorage.getItem(STRAVA_CONFIG.STORAGE_KEYS.EXPIRES_AT) || '',
      stravaAthlete: localStorage.getItem(STRAVA_CONFIG.STORAGE_KEYS.ATHLETE) || '',
      stravaClientId: localStorage.getItem(STRAVA_CONFIG.STORAGE_KEYS.CLIENT_ID) || '',
      stravaClientSecret: localStorage.getItem(STRAVA_CONFIG.STORAGE_KEYS.CLIENT_SECRET) || '',
      stravaAutoRefreshOnOpen:
        localStorage.getItem('ironfit_strava_auto_refresh_on_open') === 'true',
      bikeGearNames,
      deletedActivityIds,

      // Garmin Connect settings
      garminEmail: localStorage.getItem(GARMIN_STORAGE_KEYS.EMAIL) || 'mike.brown747@gmail.com',
      garminToken: getStoredGarminToken(),
      garminProxyUrl: getStoredGarminProxyUrl(),
      garminRequestTypes: getStoredGarminRequestTypes(),
      garminConnected: localStorage.getItem(GARMIN_STORAGE_KEYS.CONNECTED) !== 'false',
      garminDisconnected: localStorage.getItem(GARMIN_STORAGE_KEYS.DISCONNECTED) === 'true',

      // Google Sheets & Workspace connection settings
      googleUserEmail: localStorage.getItem('gymfit_google_user_email') || '',
      googleSheetsBridgeUrl: localStorage.getItem('gymfit_google_sheets_bridge_url') || '',
      googleSpreadsheetId:
        localStorage.getItem(GOOGLE_SHEETS_CONFIG.STORAGE_KEYS.SPREADSHEET_ID) || '',
      googleSpreadsheetName:
        localStorage.getItem(GOOGLE_SHEETS_CONFIG.STORAGE_KEYS.SPREADSHEET_NAME) || '',
      googleOAuthClientId: localStorage.getItem('gymfit_google_oauth_client_id') || '',
      googleOAuthClientSecret: localStorage.getItem('gymfit_google_oauth_client_secret') || '',
      googleOAuthRefreshToken: localStorage.getItem('gymfit_google_oauth_refresh_token') || '',
      clientUpdatedAtMs: Date.now(),
    });
  }

  if (domain === 'goals') {
    const goals = loadAthleteGoals().slice(0, 50);
    return sanitizeForFirestore({
      goals,
      clientUpdatedAtMs: Date.now(),
    });
  }

  if (domain === 'recovery') {
    // Store genuine (non-demo) Garmin health & recovery logs (up to most recent 180 days)
    const allLogs = loadRecoveryLogs().filter(
      (l) => !isDemoRecoveryLogId(l.id) && !isLegacyDemoRecoveryLogId(l.id)
    );
    const recentLogs = allLogs.slice(-180);
    return sanitizeForFirestore({
      logs: recentLogs,
      clientUpdatedAtMs: Date.now(),
    });
  }

  // domain === 'coach'
  const renameRules = getActivityRenameRules().slice(0, 50);
  const todayWorkout = loadTodayRecommendedWorkout();
  const savedPlan = loadSavedCoachingPlan();
  const chatHistory = loadCoachChatHistory().slice(-15);

  return sanitizeForFirestore({
    renameRules,
    todayWorkout,
    savedPlan,
    chatHistory,
    clientUpdatedAtMs: Date.now(),
  });
}

/**
 * Applies a cloud domain payload into localStorage and returns a CloudHydratedSnapshot
 * so React state updates immediately without requiring a page reload.
 */
function applyCloudDomainPayloadToLocal(
  domain: VaultDomain,
  payload: Record<string, any>
): CloudHydratedSnapshot {
  const snapshot: CloudHydratedSnapshot = {};
  if (!payload || typeof payload !== 'object') return snapshot;

  try {
    if (domain === 'profile') {
      if (payload.athleteProfile && typeof payload.athleteProfile === 'object') {
        const current = loadAthleteProfile();
        const merged: AthleteProfile = {
          ...current,
          ...payload.athleteProfile,
        };
        saveAthleteProfile(merged);
        snapshot.athleteProfile = merged;
      }
      if (payload.theme === 'light' || payload.theme === 'dark') {
        localStorage.setItem('ironfit_theme', payload.theme);
        snapshot.theme = payload.theme;
      }
      if (payload.displayDensity !== undefined && payload.displayDensity !== null) {
        localStorage.setItem('ironfit_display_density', String(payload.displayDensity));
        const num = Number(payload.displayDensity);
        snapshot.displayDensity = !isNaN(num) && num >= 70 && num <= 130 ? num : 'standard';
      }
      if (typeof payload.brandTitle === 'string' && payload.brandTitle.trim()) {
        localStorage.setItem('ironfit_brand_title', payload.brandTitle);
        snapshot.brandTitle = payload.brandTitle;
      }
      if (typeof payload.brandSubtitle === 'string' && payload.brandSubtitle.trim()) {
        localStorage.setItem('ironfit_brand_subtitle', payload.brandSubtitle);
        snapshot.brandSubtitle = payload.brandSubtitle;
      }
      if (
        payload.globalTriDistance === 'sprint' ||
        payload.globalTriDistance === 'olympic' ||
        payload.globalTriDistance === 'middle_70_3' ||
        payload.globalTriDistance === 'ironman'
      ) {
        localStorage.setItem('fittrack_global_tri_distance', payload.globalTriDistance);
        snapshot.globalTriDistance = payload.globalTriDistance;
      }
      if (
        payload.globalBikeCourseProfile === 'flat' ||
        payload.globalBikeCourseProfile === 'rolling_800m' ||
        payload.globalBikeCourseProfile === 'hilly'
      ) {
        localStorage.setItem(
          'fittrack_global_bike_course_profile',
          payload.globalBikeCourseProfile
        );
        snapshot.globalBikeCourseProfile = payload.globalBikeCourseProfile;
      }
    } else if (domain === 'integrations') {
      // Strava
      if (typeof payload.stravaToken === 'string' && payload.stravaToken.trim()) {
        localStorage.setItem(STRAVA_CONFIG.STORAGE_KEYS.TOKEN, payload.stravaToken.trim());
        snapshot.stravaToken = payload.stravaToken.trim();
      }
      if (typeof payload.stravaRefreshToken === 'string' && payload.stravaRefreshToken.trim()) {
        localStorage.setItem(
          STRAVA_CONFIG.STORAGE_KEYS.REFRESH_TOKEN,
          payload.stravaRefreshToken.trim()
        );
      }
      if (typeof payload.stravaExpiresAt === 'string' && payload.stravaExpiresAt.trim()) {
        localStorage.setItem(STRAVA_CONFIG.STORAGE_KEYS.EXPIRES_AT, payload.stravaExpiresAt.trim());
      }
      if (typeof payload.stravaAthlete === 'string' && payload.stravaAthlete.trim()) {
        localStorage.setItem(STRAVA_CONFIG.STORAGE_KEYS.ATHLETE, payload.stravaAthlete.trim());
        snapshot.stravaAthlete = payload.stravaAthlete.trim();
      }
      if (typeof payload.stravaClientId === 'string' && payload.stravaClientId.trim()) {
        localStorage.setItem(STRAVA_CONFIG.STORAGE_KEYS.CLIENT_ID, payload.stravaClientId.trim());
      }
      if (typeof payload.stravaClientSecret === 'string' && payload.stravaClientSecret.trim()) {
        localStorage.setItem(
          STRAVA_CONFIG.STORAGE_KEYS.CLIENT_SECRET,
          payload.stravaClientSecret.trim()
        );
      }
      if (typeof payload.stravaAutoRefreshOnOpen === 'boolean') {
        localStorage.setItem(
          'ironfit_strava_auto_refresh_on_open',
          String(payload.stravaAutoRefreshOnOpen)
        );
        snapshot.stravaAutoRefreshOnOpen = payload.stravaAutoRefreshOnOpen;
      }
      if (payload.bikeGearNames && typeof payload.bikeGearNames === 'object') {
        localStorage.setItem(
          'fit_track_strava_bike_gear_names_v1',
          JSON.stringify(payload.bikeGearNames)
        );
      }
      if (Array.isArray(payload.deletedActivityIds) && payload.deletedActivityIds.length > 0) {
        localStorage.setItem(
          'gymfit_strava_deleted_activity_ids',
          JSON.stringify(payload.deletedActivityIds)
        );
      }

      // Garmin Connect
      if (typeof payload.garminDisconnected === 'boolean') {
        if (payload.garminDisconnected) {
          localStorage.setItem(GARMIN_STORAGE_KEYS.DISCONNECTED, 'true');
        } else {
          localStorage.removeItem(GARMIN_STORAGE_KEYS.DISCONNECTED);
        }
      }
      if (typeof payload.garminEmail === 'string' && payload.garminEmail.trim()) {
        localStorage.setItem(GARMIN_STORAGE_KEYS.EMAIL, payload.garminEmail.trim());
        snapshot.garminEmail = payload.garminEmail.trim();
      }
      if (typeof payload.garminToken === 'string' && payload.garminToken.trim()) {
        localStorage.setItem(GARMIN_STORAGE_KEYS.TOKEN, payload.garminToken.trim());
      }
      if (typeof payload.garminProxyUrl === 'string' && payload.garminProxyUrl.trim()) {
        localStorage.setItem(GARMIN_STORAGE_KEYS.PROXY_URL, payload.garminProxyUrl.trim());
      }
      if (payload.garminRequestTypes && typeof payload.garminRequestTypes === 'object') {
        localStorage.setItem(
          GARMIN_STORAGE_KEYS.REQUEST_TYPES,
          JSON.stringify(payload.garminRequestTypes)
        );
      }
      if (typeof payload.garminConnected === 'boolean') {
        localStorage.setItem(GARMIN_STORAGE_KEYS.CONNECTED, String(payload.garminConnected));
        snapshot.garminConnected = payload.garminConnected;
      }

      // Google Sheets & Workspace
      if (typeof payload.googleUserEmail === 'string' && payload.googleUserEmail.trim()) {
        localStorage.setItem('gymfit_google_user_email', payload.googleUserEmail.trim());
        snapshot.googleUserEmail = payload.googleUserEmail.trim();
      }
      if (typeof payload.googleSheetsBridgeUrl === 'string' && payload.googleSheetsBridgeUrl.trim()) {
        localStorage.setItem(
          'gymfit_google_sheets_bridge_url',
          payload.googleSheetsBridgeUrl.trim()
        );
      }
      if (typeof payload.googleSpreadsheetId === 'string' && payload.googleSpreadsheetId.trim()) {
        localStorage.setItem(
          GOOGLE_SHEETS_CONFIG.STORAGE_KEYS.SPREADSHEET_ID,
          payload.googleSpreadsheetId.trim()
        );
        snapshot.googleSpreadsheetId = payload.googleSpreadsheetId.trim();
      }
      if (
        typeof payload.googleSpreadsheetName === 'string' &&
        payload.googleSpreadsheetName.trim()
      ) {
        localStorage.setItem(
          GOOGLE_SHEETS_CONFIG.STORAGE_KEYS.SPREADSHEET_NAME,
          payload.googleSpreadsheetName.trim()
        );
      }
      if (typeof payload.googleOAuthClientId === 'string' && payload.googleOAuthClientId.trim()) {
        localStorage.setItem(
          'gymfit_google_oauth_client_id',
          payload.googleOAuthClientId.trim()
        );
      }
      if (
        typeof payload.googleOAuthClientSecret === 'string' &&
        payload.googleOAuthClientSecret.trim()
      ) {
        localStorage.setItem(
          'gymfit_google_oauth_client_secret',
          payload.googleOAuthClientSecret.trim()
        );
      }
      if (
        typeof payload.googleOAuthRefreshToken === 'string' &&
        payload.googleOAuthRefreshToken.trim()
      ) {
        localStorage.setItem(
          'gymfit_google_oauth_refresh_token',
          payload.googleOAuthRefreshToken.trim()
        );
      }
    } else if (domain === 'goals') {
      if (Array.isArray(payload.goals) && payload.goals.length > 0) {
        saveAthleteGoals(payload.goals as TrainingGoal[]);
        snapshot.athleteGoals = payload.goals as TrainingGoal[];
      }
    } else if (domain === 'recovery') {
      if (Array.isArray(payload.logs) && payload.logs.length > 0) {
        const currentLogs = loadRecoveryLogs();
        const byDate = new Map<string, DailyRecoveryLog>();
        for (const log of currentLogs) {
          if (log?.date) byDate.set(log.date, log);
        }
        for (const cloudLog of payload.logs as DailyRecoveryLog[]) {
          if (cloudLog?.date) {
            byDate.set(cloudLog.date, { ...(byDate.get(cloudLog.date) || {}), ...cloudLog });
          }
        }
        const mergedLogs = Array.from(byDate.values()).sort((a, b) =>
          a.date.localeCompare(b.date)
        );
        saveRecoveryLogs(mergedLogs);
        snapshot.recoveryLogs = mergedLogs;
      }
    } else if (domain === 'coach') {
      if (Array.isArray(payload.renameRules) && payload.renameRules.length > 0) {
        saveActivityRenameRules(payload.renameRules);
      }
      if (payload.todayWorkout && typeof payload.todayWorkout === 'object') {
        saveTodayRecommendedWorkout(payload.todayWorkout);
      }
      if (payload.savedPlan && typeof payload.savedPlan === 'object') {
        saveCoachingPlan(payload.savedPlan);
      }
      if (Array.isArray(payload.chatHistory) && payload.chatHistory.length > 0) {
        saveCoachChatHistory(payload.chatHistory);
      }
    }
  } catch (err) {
    console.warn(`[CloudVault] Error applying domain "${domain}" payload:`, err);
  }

  return snapshot;
}

// Track which documents already exist in Firestore for the active user
const knownExistingVaultDocs = new Set<string>();
let knownUserRootExists = false;
let isApplyingRemoteSnapshot = false;

/**
 * Ensures the root `/users/{userId}` document exists in Firestore for the Master Gate rule.
 */
async function ensureParentUserAccount(user: User): Promise<void> {
  if (knownUserRootExists) return;
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      const displayName = (user.displayName || user.email || 'Athlete').slice(0, 120);
      await setDoc(userRef, {
        ownerUid: user.uid,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    knownUserRootExists = true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

/**
 * Writes a single domain document to `/users/{userId}/vault/{domain}`
 */
export async function syncDomainToCloud(domain: VaultDomain): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified || isApplyingRemoteSnapshot) return;

  const vaultPath = `users/${user.uid}/vault/${domain}`;
  const vaultRef = doc(db, 'users', user.uid, 'vault', domain);
  const docKey = `${user.uid}:${domain}`;

  updateStatus({ isSyncing: true, error: null });

  try {
    await ensureParentUserAccount(user);
    const payload = buildLocalDomainPayload(domain);

    let exists = knownExistingVaultDocs.has(docKey);
    if (!exists) {
      const snap = await getDoc(vaultRef);
      exists = snap.exists();
      if (exists) knownExistingVaultDocs.add(docKey);
    }

    if (exists) {
      await updateDoc(vaultRef, {
        payload,
        schemaVersion: 1,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(vaultRef, {
        ownerUid: user.uid,
        domain,
        schemaVersion: 1,
        payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      knownExistingVaultDocs.add(docKey);
    }

    updateStatus({ isSyncing: false, lastSyncedAt: Date.now(), error: null });
  } catch (error) {
    updateStatus({
      isSyncing: false,
      error: error instanceof Error ? error.message : String(error),
    });
    handleFirestoreError(error, OperationType.WRITE, vaultPath);
  }
}

/**
 * Pushes all 5 vault domains to Firestore in a single coordinated operation.
 */
export async function syncAllSettingsToCloud(): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;

  updateStatus({ isSyncing: true, error: null });
  try {
    await ensureParentUserAccount(user);
    for (const domain of ALL_VAULT_DOMAINS) {
      await syncDomainToCloud(domain);
    }
    updateStatus({ isSyncing: false, lastSyncedAt: Date.now(), error: null });
  } catch (error) {
    updateStatus({
      isSyncing: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// Debounced auto-save queue per domain
const pendingDomains = new Set<VaultDomain>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleCloudVaultSync(domains: VaultDomain[] = ALL_VAULT_DOMAINS): void {
  if (!auth.currentUser || isApplyingRemoteSnapshot) return;
  domains.forEach((d) => pendingDomains.add(d));
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const toSync = Array.from(pendingDomains);
    pendingDomains.clear();
    debounceTimer = null;
    for (const domain of toSync) {
      try {
        await syncDomainToCloud(domain);
      } catch (err) {
        console.warn(`[CloudVault] Auto-sync failed for ${domain}:`, err);
      }
    }
  }, 600);
}

/**
 * Pulls all 5 vault documents from Firestore on initial sign-in / app open.
 * If a domain document does not exist in Firestore yet, seeds it immediately from the current local state.
 */
export async function pullOrSeedCloudVault(user: User): Promise<CloudHydratedSnapshot> {
  const combinedSnapshot: CloudHydratedSnapshot = {};
  if (!user || !user.emailVerified) return combinedSnapshot;

  updateStatus({ isSyncing: true, error: null });

  try {
    await ensureParentUserAccount(user);

    for (const domain of ALL_VAULT_DOMAINS) {
      const vaultPath = `users/${user.uid}/vault/${domain}`;
      const vaultRef = doc(db, 'users', user.uid, 'vault', domain);
      const docKey = `${user.uid}:${domain}`;

      try {
        const snap = await getDoc(vaultRef);
        if (snap.exists()) {
          knownExistingVaultDocs.add(docKey);
          const data = snap.data();
          if (data?.payload && typeof data.payload === 'object') {
            isApplyingRemoteSnapshot = true;
            try {
              const part = applyCloudDomainPayloadToLocal(
                domain,
                data.payload as Record<string, any>
              );
              Object.assign(combinedSnapshot, part);
            } finally {
              isApplyingRemoteSnapshot = false;
            }
          }
        } else {
          // Document doesn't exist in cloud yet — seed it from current local settings
          const payload = buildLocalDomainPayload(domain);
          await setDoc(vaultRef, {
            ownerUid: user.uid,
            domain,
            schemaVersion: 1,
            payload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          knownExistingVaultDocs.add(docKey);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, vaultPath);
      }
    }

    updateStatus({ isSyncing: false, lastSyncedAt: Date.now(), error: null });
    if (Object.keys(combinedSnapshot).length > 0) {
      notifyHydrated(combinedSnapshot);
    }
    return combinedSnapshot;
  } catch (err) {
    updateStatus({
      isSyncing: false,
      error: err instanceof Error ? err.message : String(err),
    });
    return combinedSnapshot;
  }
}

let activeSnapshotUnsubscribers: Unsubscribe[] = [];

function clearSnapshotListeners() {
  activeSnapshotUnsubscribers.forEach((unsub) => {
    try {
      unsub();
    } catch {}
  });
  activeSnapshotUnsubscribers = [];
}

function attachRealtimeVaultListeners(user: User) {
  clearSnapshotListeners();
  if (!user || !user.emailVerified) return;

  for (const domain of ALL_VAULT_DOMAINS) {
    const vaultPath = `users/${user.uid}/vault/${domain}`;
    const vaultRef = doc(db, 'users', user.uid, 'vault', domain);
    const docKey = `${user.uid}:${domain}`;

    const unsub = onSnapshot(
      vaultRef,
      (snap) => {
        if (!snap.exists()) return;
        knownExistingVaultDocs.add(docKey);
        // Skip local writes that are still pending server acknowledgment
        if (snap.metadata.hasPendingWrites) return;
        const data = snap.data();
        if (data?.payload && typeof data.payload === 'object') {
          isApplyingRemoteSnapshot = true;
          try {
            const hydrated = applyCloudDomainPayloadToLocal(
              domain,
              data.payload as Record<string, any>
            );
            if (Object.keys(hydrated).length > 0) {
              notifyHydrated(hydrated);
            }
            updateStatus({ lastSyncedAt: Date.now() });
          } finally {
            isApplyingRemoteSnapshot = false;
          }
        }
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, vaultPath);
        } catch {}
      }
    );

    activeSnapshotUnsubscribers.push(unsub);
  }
}

let authObserverInitialized = false;

export function notifyLocalSettingsChanged(domains: VaultDomain[] = ALL_VAULT_DOMAINS): void {
  if (typeof window === 'undefined' || isApplyingRemoteSnapshot) return;
  try {
    window.dispatchEvent(
      new CustomEvent('fittrack_local_storage_updated', {
        detail: { domains },
      })
    );
  } catch {}
}

/**
 * Initializes the Firebase Auth & Firestore Cloud Vault lifecycle.
 * Automatically restores the athlete's settings whenever the app opens.
 */
export function initFirebaseCloudVault(): () => void {
  if (authObserverInitialized) return () => {};
  authObserverInitialized = true;

  const handleLocalChange = (e: Event) => {
    const customEvent = e as CustomEvent<{ domains?: VaultDomain[] }>;
    scheduleCloudVaultSync(customEvent.detail?.domains || ALL_VAULT_DOMAINS);
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('fittrack_local_storage_updated', handleLocalChange);
  }

  const unsubAuth = onAuthStateChanged(auth, async (user) => {
    if (user) {
      knownUserRootExists = false;
      updateStatus({
        isAuthenticated: true,
        userUid: user.uid,
        userEmail: user.email,
        userDisplayName: user.displayName,
        userPhotoUrl: user.photoURL,
        error: null,
      });

      await pullOrSeedCloudVault(user);
      attachRealtimeVaultListeners(user);
    } else {
      clearSnapshotListeners();
      knownExistingVaultDocs.clear();
      knownUserRootExists = false;
      updateStatus({
        isAuthenticated: false,
        userUid: null,
        userEmail: null,
        userDisplayName: null,
        userPhotoUrl: null,
        isSyncing: false,
      });
    }
  });

  return () => {
    unsubAuth();
    clearSnapshotListeners();
    if (typeof window !== 'undefined') {
      window.removeEventListener('fittrack_local_storage_updated', handleLocalChange);
    }
    authObserverInitialized = false;
  };
}

/**
 * Interactive 1-Click Google Login for Cloud Vault & Settings Persistence
 */
export async function signInToCloudVault(): Promise<User | null> {
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/spreadsheets');
  provider.addScope('https://www.googleapis.com/auth/drive.file');

  const savedEmail =
    localStorage.getItem('gymfit_google_user_email') ||
    localStorage.getItem(GARMIN_STORAGE_KEYS.EMAIL) ||
    'mike.brown747@gmail.com';
  if (savedEmail) {
    provider.setCustomParameters({ login_hint: savedEmail });
  }

  updateStatus({ isSyncing: true, error: null });
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      const expiry = Date.now() + 3500 * 1000;
      localStorage.setItem('gymfit_google_access_token', credential.accessToken);
      localStorage.setItem('gymfit_google_token_expiry', String(expiry));
      if (result.user?.email) {
        localStorage.setItem('gymfit_google_user_email', result.user.email);
      }
      window.dispatchEvent(
        new CustomEvent('gymfit_google_auth_updated', {
          detail: { connected: true, email: result.user?.email, mode: 'session' },
        })
      );
    }
    return result.user;
  } catch (error) {
    updateStatus({
      isSyncing: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function signOutFromCloudVault(): Promise<void> {
  clearSnapshotListeners();
  await signOut(auth);
}
