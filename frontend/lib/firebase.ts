import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  persistentSingleTabManager,
  memoryLocalCache,
  waitForPendingWrites,
  setLogLevel,
  Firestore,
} from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import { getStorage, FirebaseStorage } from 'firebase/storage';

// Silenciar logs/avisos internos de leases de multi-pestaña de Firestore
try {
  setLogLevel('silent');
} catch {}

const cleanEnv = (val?: string): string => {
  if (!val) return '';
  return val.replace(/^["']|["']$/g, '').trim();
};

const apiKey = cleanEnv(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
const projectId = cleanEnv(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
const authDomain = cleanEnv(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) || (projectId ? `${projectId}.firebaseapp.com` : '');
const storageBucket = cleanEnv(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) || (projectId ? `${projectId}.firebasestorage.app` : '');
const messagingSenderId = cleanEnv(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID);
const appId = cleanEnv(process.env.NEXT_PUBLIC_FIREBASE_APP_ID);

const firebaseConfig = {
  apiKey,
  authDomain,
  projectId,
  storageBucket,
  messagingSenderId,
  appId,
};

/**
 * Determina si Firebase está configurado mediante variables de entorno del proyecto v2.
 * Nunca utiliza credenciales heredadas hardcodeadas para evitar fugas entre v1 y v2.
 */
export const isFirebaseConfigured = (): boolean => {
  return Boolean(
    apiKey &&
    apiKey !== 'mock-api-key' &&
    projectId &&
    projectId !== 'katalog-app' &&
    authDomain &&
    appId
  );
};

// Helper para detectar navegadores embebidos de redes sociales y WebViews
export const checkIsInAppBrowser = (): boolean => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|Twitter|Snapchat|WhatsApp|Line|LinkedIn|Pinterest|Threads/i.test(ua) ||
    /wv|WebView/i.test(ua) ||
    /Android.*Version\/[0-9.]+\s+Chrome/i.test(ua)
  );
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;
let storage: FirebaseStorage | null = null;

if (isFirebaseConfigured()) {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

  if (typeof window !== 'undefined') {
    try {
      const ua = navigator.userAgent || '';
      const isInApp = checkIsInAppBrowser();
      const isAppleOrWebKit =
        /Macintosh|iPad|iPhone|iPod/i.test(ua) ||
        (/Safari/i.test(ua) && !/Chrome|CriOS|Android/i.test(ua));
      const isSecure = window.isSecureContext !== false;
      const hasLocks = 'locks' in navigator;

      if (isInApp) {
        try {
          db = initializeFirestore(app, {
            localCache: memoryLocalCache(),
          });
        } catch {
          db = getFirestore(app);
        }
      } else {
        const useSingleTab = isAppleOrWebKit || !isSecure || !hasLocks;
        db = initializeFirestore(app, {
          localCache: persistentLocalCache({
            tabManager: useSingleTab
              ? persistentSingleTabManager(undefined)
              : persistentMultipleTabManager(),
          }),
        });
      }
    } catch {
      try {
        db = initializeFirestore(app, {
          localCache: memoryLocalCache(),
        });
      } catch {
        db = getFirestore(app);
      }
    }
  } else {
    db = getFirestore(app);
  }

  auth = getAuth(app);
  storage = getStorage(app);
}

/**
 * Espera a que todas las escrituras locales pendientes se hayan transmitido y
 * confirmado por los servidores de Google Cloud Firestore.
 */
export async function flushPendingFirestoreWrites(timeoutMs = 4500): Promise<boolean> {
  if (!db || typeof window === 'undefined') return true;
  try {
    const syncPromise = waitForPendingWrites(db).then(() => true);
    const timeoutPromise = new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), timeoutMs)
    );
    return await Promise.race([syncPromise, timeoutPromise]);
  } catch (err) {
    console.warn('Advertencia en flushPendingFirestoreWrites:', err);
    return false;
  }
}

export { app, db, auth, storage };
