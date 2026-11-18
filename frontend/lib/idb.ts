/**
 * Lightweight native IndexedDB key-value store wrapper for KataloG.
 * Allows storing large datasets (e.g. 100+ product catalogs with Base64/WebP images)
 * without hitting the 5MB browser localStorage quota limit.
 */

const DB_NAME = 'katalog_local_storage_db';
const STORE_NAME = 'kv_store';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getDB(timeoutMs = 1500): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  if (!dbPromise) {
    const openPromise = new Promise<IDBDatabase | null>((resolve) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onerror = (e) => {
          console.warn('[IndexedDB] Failed to open database:', e);
          resolve(null);
        };

        request.onblocked = () => {
          console.warn('[IndexedDB] Database open blocked');
          resolve(null);
        };
      } catch (err) {
        console.warn('[IndexedDB] Initialization exception:', err);
        resolve(null);
      }
    });

    const timeoutPromise = new Promise<IDBDatabase | null>((resolve) =>
      setTimeout(() => {
        console.warn('[IndexedDB] Database open timeout reached, falling back to memory/server');
        resolve(null);
      }, timeoutMs)
    );

    dbPromise = Promise.race([openPromise, timeoutPromise]);
  }

  return dbPromise;
}

export async function getIdb<T = unknown>(key: string, defaultValue: T): Promise<T> {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const db = await getDB();
    if (!db) return defaultValue;

    const readPromise = new Promise<T>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);

        req.onsuccess = () => {
          resolve(req.result !== undefined && req.result !== null ? (req.result as T) : defaultValue);
        };

        req.onerror = () => {
          resolve(defaultValue);
        };
      } catch {
        resolve(defaultValue);
      }
    });

    const timeoutPromise = new Promise<T>((resolve) =>
      setTimeout(() => resolve(defaultValue), 1200)
    );

    return await Promise.race([readPromise, timeoutPromise]);
  } catch (err) {
    console.warn(`[IndexedDB] Error reading key "${key}":`, err);
    return defaultValue;
  }
}

export async function setIdb<T = unknown>(key: string, value: T): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const db = await getDB();
    if (!db) return false;

    const writePromise = new Promise<boolean>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(value, key);

        req.onsuccess = () => resolve(true);
        req.onerror = (e) => {
          console.warn(`[IndexedDB] Error setting key "${key}":`, e);
          resolve(false);
        };
      } catch (err) {
        console.warn(`[IndexedDB] Transaction error on set "${key}":`, err);
        resolve(false);
      }
    });

    const timeoutPromise = new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), 2000)
    );

    return await Promise.race([writePromise, timeoutPromise]);
  } catch (err) {
    console.warn(`[IndexedDB] Error setting key "${key}":`, err);
    return false;
  }
}

export async function deleteIdb(key: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const db = await getDB();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(key);

        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}
