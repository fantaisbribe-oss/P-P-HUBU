import { initializeApp, deleteApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  doc,
  getDocFromServer
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import firebaseConfig from '../firebase-applet-config.json';

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIREBASE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;
export const FIREBASE_CONSOLE_AUTH_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`;
export const FIREBASE_CONSOLE_STORAGE_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/storage`;

export const app = initializeApp(firebaseConfig);

// CRITICAL: Bind Firestore explicitly to the provisioned firestoreDatabaseId.
// Force HTTP long-polling so buffering proxies, iframes, and mobile networks do not hang
// for 10s on WebChannel streaming handshakes and drop into offline mode.
function initFirestoreClient() {
  try {
    return initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
        experimentalLongPollingOptions: { timeoutSeconds: 20 }
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = initFirestoreClient();
export const auth = getAuth(app);
export const storage = getStorage(app);
// Prevent Firebase Storage from hanging 10 minutes on unavailable buckets or CORS errors
storage.maxUploadRetryTime = 12000;
storage.maxOperationRetryTime = 8000;

// Optional Firebase App Check (wired automatically when VITE_RECAPTCHA_ENTERPRISE_KEY is set)
const recaptchaKey = (import.meta.env.VITE_RECAPTCHA_ENTERPRISE_KEY as string | undefined) || firebaseConfig.recaptchaSiteKey;
if (typeof window !== 'undefined' && recaptchaKey) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(recaptchaKey),
      isTokenAutoRefreshEnabled: true
    });
  } catch (err) {
    console.warn('App Check initialization skipped:', err);
  }
}

/**
 * Creates a short-lived secondary Firebase App instance so a Branch Manager can
 * provision an Operator Auth account without signing out their own session.
 */
export async function withSecondaryAuth<T>(fn: (secondaryAuth: Auth) => Promise<T>): Promise<T> {
  const name = `secondary-auth-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const existing = getApps().find((a) => a.name === name);
  const secondaryApp: FirebaseApp = existing || initializeApp(firebaseConfig, name);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    return await fn(secondaryAuth);
  } finally {
    try {
      await secondaryAuth.signOut();
    } catch {
      // ignore sign-out cleanup errors
    }
    try {
      await deleteApp(secondaryApp);
    } catch {
      // ignore delete cleanup errors
    }
  }
}

function isOfflineOrUnavailableError(error: unknown): boolean {
  const code = (error as { code?: string })?.code || '';
  const msg = error instanceof Error ? error.message : String(error);
  return (
    code === 'unavailable' ||
    msg.includes('the client is offline') ||
    msg.includes('client is offline')
  );
}

/**
 * Startup connectivity check required by Firebase integration best practices.
 */
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (isOfflineOrUnavailableError(error)) {
      // Retry once briefly in case transport handshake is still warming up on mobile/proxied networks
      await new Promise((resolve) => setTimeout(resolve, 1500));
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        return true;
      } catch (retryError) {
        if (isOfflineOrUnavailableError(retryError)) {
          console.error('Please check your Firebase configuration — Firestore client appears offline.');
          return false;
        }
        return true;
      }
    }
    // Permission denied on /test/connection is expected when rules default-deny, proving server reachability.
    return true;
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
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
    tenantId?: string | null;
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
          email: provider.email
        })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface FriendlyError {
  message: string;
  code?: string;
  needsAuthConsoleEnable?: boolean;
  needsStorageConsoleEnable?: boolean;
}

export function getFriendlyError(error: unknown): FriendlyError {
  const raw = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string })?.code || '';

  if (code === 'auth/operation-not-allowed' || raw.includes('auth/operation-not-allowed')) {
    return {
      code: 'auth/operation-not-allowed',
      needsAuthConsoleEnable: true,
      message:
        'Email/Password sign-in is not yet enabled in your Firebase project. Enable it in Firebase Console → Authentication → Sign-in method → Email/Password.'
    };
  }
  if (code === 'auth/too-many-requests' || raw.includes('auth/too-many-requests')) {
    return {
      code: 'auth/too-many-requests',
      message: 'Too many failed sign-in attempts. Please wait a few minutes before trying again.'
    };
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found' ||
    raw.includes('auth/invalid-credential')
  ) {
    return {
      code: 'auth/invalid-credential',
      message: 'Invalid credentials. Please double-check your Branch Code, username/Sender ID, and password/PIN.'
    };
  }
  if (code === 'auth/email-already-in-use' || raw.includes('auth/email-already-in-use')) {
    return {
      code: 'auth/email-already-in-use',
      message: 'That username or account already exists for this branch. Please pick a different username.'
    };
  }
  if (code === 'auth/weak-password' || raw.includes('auth/weak-password')) {
    return {
      code: 'auth/weak-password',
      message: 'Password is too weak. Staff passwords must be at least 6 characters.'
    };
  }
  if (code === 'auth/requires-recent-login' || raw.includes('auth/requires-recent-login')) {
    return {
      code: 'auth/requires-recent-login',
      message: 'For security, please enter your current password to verify your identity before updating.'
    };
  }
  if (
    code === 'auth/network-request-failed' ||
    code === 'unavailable' ||
    raw.includes('network-request-failed') ||
    raw.includes('client is offline')
  ) {
    return {
      code: 'network-offline',
      message: 'You appear to be offline or unable to reach Firebase. Please check your internet connection and try again.'
    };
  }
  if (
    code === 'storage/unauthorized' ||
    code === 'storage/retry-limit-exceeded' ||
    code === 'storage/unknown' ||
    raw.includes('storage/unauthorized') ||
    raw.includes('storage/bucket-not-found')
  ) {
    return {
      code,
      needsStorageConsoleEnable: true,
      message:
        'Cloud Storage upload failed. Make sure Cloud Storage is enabled on your Firebase project (Blaze plan) and storage.rules is deployed.'
    };
  }
  if (code === 'permission-denied' || raw.includes('permission-denied') || raw.includes('Missing or insufficient permissions')) {
    return {
      code: 'permission-denied',
      message: 'Permission denied. Your account does not have access to perform this action.'
    };
  }
  if (raw.includes('Quota exceeded')) {
    return {
      code: 'quota-exceeded',
      message: 'Firebase daily free quota exceeded. Quota resets tomorrow or can be upgraded in Firebase Console.'
    };
  }

  return {
    code,
    message: raw.length > 220 ? 'An unexpected error occurred. Please try again.' : raw
  };
}
