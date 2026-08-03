const DB_NAME = "fittrack-derived-cache";
const STORE = "calculations";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function cacheKey({ userId, date, calculationType, algorithmVersion, sourceRevision }) {
  return [userId, date, calculationType, algorithmVersion, sourceRevision].join(":");
}

export const derivedCache = {
  async get(key) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result?.value ?? null);
      request.onerror = () => reject(request.error);
    });
  },
  async set(key, value) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).put({ key, value, cachedAt: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  async clearUser(userId) {
    const db = await openDatabase();
    const keys = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).getAllKeys();
      request.onsuccess = () => resolve(request.result.filter((key) => key.startsWith(`${userId}:`)));
      request.onerror = () => reject(request.error);
    });
    await Promise.all(keys.map((key) => new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(key);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    })));
  }
};
