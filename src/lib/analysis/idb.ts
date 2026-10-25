// The one IndexedDB database behind the saved reviews and the drill progress.
// Every failure (no IndexedDB, blocked storage, quota, an aborted transaction)
// resolves with the caller's fallback, never a throw.

const DB_NAME = 'deeprook';
/** Bump with every new store; onupgradeneeded creates the missing ones. */
const DB_VERSION = 2;
const STORES = { analyses: 'key', drills: 'id' } as const;

export type StoreName = keyof typeof STORES;

/**
 * Runs `work` in one transaction and resolves with what it passed to `set`
 * once the transaction commits. Any failure resolves with `fallback`.
 */
export type Transact = <T>(
  name: StoreName,
  mode: IDBTransactionMode,
  fallback: T,
  work: (store: IDBObjectStore, set: (result: T) => void) => void,
) => Promise<T>;

function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        for (const [name, keyPath] of Object.entries(STORES))
          if (!database.objectStoreNames.contains(name))
            database.createObjectStore(name, { keyPath });
      };
      request.onsuccess = () => {
        // A newer tab is upgrading: step aside rather than block it.
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = request.onblocked = () => resolve(null);
    } catch {
      resolve(null); // e.g. storage blocked by the browser
    }
  });
}

/** null where there is no IndexedDB (jsdom, some privacy modes). Opens on first use. */
export function openIdb(): Transact | null {
  if (typeof indexedDB === 'undefined') return null;
  let opened: Promise<IDBDatabase | null> | undefined;
  return async (name, mode, fallback, work) => {
    const database = await (opened ??= openDatabase());
    if (!database) return fallback;
    return new Promise((resolve) => {
      try {
        const tx = database.transaction(name, mode);
        let result = fallback;
        tx.oncomplete = () => resolve(result);
        tx.onerror = tx.onabort = () => resolve(fallback);
        work(tx.objectStore(name), (value) => (result = value));
      } catch {
        resolve(fallback);
      }
    });
  };
}
