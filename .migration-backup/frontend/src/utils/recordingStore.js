// Minimal IndexedDB wrapper for the Hifz recording studio. A hand-rolled
// wrapper is appropriate here — one object store, simple CRUD — so this
// avoids pulling in a dependency (e.g. `idb`) for ~60 lines of promise
// wrapping. Audio blobs are too large/binary for localStorage, which is
// why IndexedDB is used instead of the cache in api/cache.js.

const DB_NAME = 'qlc-recordings';
const DB_VERSION = 1;
const STORE = 'recordings';

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this browser'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('chapterId', 'chapterId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const result = fn(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveRecording({ chapterId, fromV, toV, blob, durationMs }) {
  const id = `${chapterId}:${fromV}-${toV}:${Date.now()}`;
  const record = { id, chapterId, fromV, toV, blob, durationMs, createdAt: new Date().toISOString() };
  await withStore('readwrite', (store) => store.put(record));
  return record;
}

export async function listRecordings(chapterId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const index = tx.objectStore(STORE).index('chapterId');
    const req = index.getAll(IDBKeyRange.only(chapterId));
    req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    req.onerror = () => reject(req.error);
  });
}

export async function getRecording(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteRecording(id) {
  await withStore('readwrite', (store) => store.delete(id));
}

export function isIndexedDBSupported() {
  return typeof indexedDB !== 'undefined';
}
