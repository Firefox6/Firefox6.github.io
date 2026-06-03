export const DB_NAME = "julien_tracking_db";
export const DB_VERSION = 2;

export const STORE_NAMES = [
  "meta",
  "backups",
  "settings",
  "weight_entries",
  "food_entries",
  "food_presets",
  "workouts",
  "exercise_presets",
];

export const DEFAULT_SETTINGS = {
  profile: {
    height_cm: 178,
    birth_date: "",
    sex: "male",
  },
  goals: {
    calorie_goal_kcal: 2200,
    protein_goal_g: 150,
    carbs_goal_g: null,
    fat_goal_g: null,
    fiber_goal_g: null,
    sugar_max_g: null,
    salt_max_g: null,
    weight_goal_kg: 80,
    strength_goal_per_week: null,
    cardio_goal_per_week: null,
  },
  maintenance: {
    min_kcal: 2400,
    max_kcal: 2800,
  },
  reminders: {
    height_check_interval_days: 60,
    backup_interval_days: 7,
    last_height_check_at: null,
    last_backup_at: null,
  },
  preferences: {
    units: "metric",
    theme: "system",
    dashboard_range_days: 28,
  },
};

let dbPromise;
const DATA_STORES = ["weight_entries", "food_entries", "food_presets", "workouts", "exercise_presets"];
const LEGACY_LOCAL_STORAGE_KEYS = [
  "fittrack_data",
  "fittrack-backup",
  "fittrack_backup",
  "julien_tracking_data",
  "julienTrackingData",
  DB_NAME,
];

export function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toLocalIso(date = new Date()) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
  const offsetMins = String(absoluteOffset % 60).padStart(2, "0");
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const mins = String(date.getMinutes()).padStart(2, "0");
  const secs = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${mins}:${secs}${sign}${offsetHours}:${offsetMins}`;
}

export function generateId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("backups")) {
        db.createObjectStore("backups", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "id" });
      }

      for (const storeName of STORE_NAMES.filter((name) => name !== "settings")) {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: "id" });
          if (["weight_entries", "food_entries", "workouts"].includes(storeName)) {
            store.createIndex("date", "date", { unique: false });
          }
          if (storeName === "food_entries") {
            store.createIndex("preset_id", "preset_id", { unique: false });
          }
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

export async function getAll(storeName) {
  const db = await openDB();
  const tx = db.transaction(storeName, "readonly");
  const rows = await requestToPromise(tx.objectStore(storeName).getAll());
  await txDone(tx);
  return rows;
}

export async function getItem(storeName, key) {
  const db = await openDB();
  const tx = db.transaction(storeName, "readonly");
  const item = await requestToPromise(tx.objectStore(storeName).get(key));
  await txDone(tx);
  return item || null;
}

export async function putItem(storeName, item) {
  const db = await openDB();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).put(item);
  await txDone(tx);
  return item;
}

export async function deleteItem(storeName, key) {
  const db = await openDB();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).delete(key);
  await txDone(tx);
}

export async function clearStore(storeName) {
  const db = await openDB();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).clear();
  await txDone(tx);
}

export async function replaceStore(storeName, rows) {
  const db = await openDB();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  store.clear();
  for (const row of rows || []) {
    if (row?.id) store.put(row);
  }
  await txDone(tx);
}

export async function getMeta(key) {
  return getItem("meta", key);
}

export async function setMeta(key, value) {
  return putItem("meta", {
    id: key,
    value,
    updated_at: toLocalIso(),
  });
}

export async function createDataSnapshot(reason, payload) {
  const snapshot = {
    id: `backup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    reason,
    created_at: toLocalIso(),
    schema_version: 2,
    payload,
  };
  await putItem("backups", snapshot);
  return snapshot;
}

export async function migrateLegacyLocalStorageData() {
  if (!globalThis.localStorage) return { migrated: false, reason: "localStorage unavailable" };

  const migrationKey = "legacy_local_storage_migration_v1";
  const completed = await getMeta(migrationKey);
  if (completed?.value?.completed) return { migrated: false, reason: "already completed" };

  const legacy = findLegacyLocalStoragePayload();
  if (!legacy) {
    await setMeta(migrationKey, { completed: true, migrated: false, reason: "no legacy payload" });
    return { migrated: false, reason: "no legacy payload" };
  }

  if (await hasExistingUserData()) {
    await createDataSnapshot("legacy-local-storage-detected-after-indexeddb-data", legacy);
    await setMeta(migrationKey, { completed: true, migrated: false, reason: "indexeddb already has data" });
    return { migrated: false, reason: "indexeddb already has data" };
  }

  const normalized = normalizeLegacyPayload(legacy.data);
  await createDataSnapshot("before-legacy-local-storage-migration", legacy);
  await saveSettings(normalized.settings || {});

  for (const storeName of DATA_STORES) {
    await replaceStore(storeName, normalized[storeName] || []);
  }

  await setMeta(migrationKey, {
    completed: true,
    migrated: true,
    source_key: legacy.key,
    migrated_at: toLocalIso(),
  });

  return { migrated: true, sourceKey: legacy.key };
}

export async function getSettings() {
  const stored = await getItem("settings", "settings");
  return mergeSettings(stored?.value || stored || {});
}

export async function saveSettings(settings) {
  const merged = mergeSettings(settings);
  await putItem("settings", {
    id: "settings",
    value: merged,
    updated_at: toLocalIso(),
  });
  return merged;
}

export function mergeSettings(settings) {
  const merged = deepMerge(DEFAULT_SETTINGS, settings || {});
  merged.profile.sex = merged.profile.sex === "female" ? "female" : "male";
  merged.preferences.theme = ["system", "light", "dark"].includes(merged.preferences.theme)
    ? merged.preferences.theme
    : "system";
  delete merged.goals.training_days_goal_per_week;
  return merged;
}

function deepMerge(base, override) {
  if (!isPlainObject(base)) return override ?? base;
  const output = { ...base };

  for (const [key, value] of Object.entries(override || {})) {
    if (key === "id" || key === "updated_at") continue;
    if (isPlainObject(value) && isPlainObject(base[key])) {
      output[key] = deepMerge(base[key], value);
    } else if (value !== undefined) {
      output[key] = value;
    }
  }

  return output;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function hasExistingUserData() {
  for (const storeName of DATA_STORES) {
    const rows = await getAll(storeName);
    if (rows.length > 0) return true;
  }
  return false;
}

function findLegacyLocalStoragePayload() {
  for (const key of LEGACY_LOCAL_STORAGE_KEYS) {
    const raw = safeLocalStorageGet(key);
    const data = parseLegacyJson(raw);
    if (data) return { key, raw, data };
  }

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !/fittrack|julien|tracking/i.test(key)) continue;
      const raw = safeLocalStorageGet(key);
      const data = parseLegacyJson(raw);
      if (data) return { key, raw, data };
    }
  } catch {
    return null;
  }

  return null;
}

function safeLocalStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parseLegacyJson(raw) {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return looksLikeTrackingExport(data) ? data : null;
  } catch {
    return null;
  }
}

function looksLikeTrackingExport(data) {
  if (!data || typeof data !== "object") return false;
  return ["settings", "weight_entries", "food_entries", "food_presets", "workouts", "exercise_presets"].some(
    (key) => key in data,
  );
}

function normalizeLegacyPayload(data) {
  return {
    settings: data.settings || {},
    weight_entries: asRows(data.weight_entries),
    food_entries: asRows(data.food_entries),
    food_presets: asRows(data.food_presets),
    workouts: asRows(data.workouts),
    exercise_presets: asRows(data.exercise_presets),
  };
}

function asRows(value) {
  return Array.isArray(value) ? value.filter((row) => row?.id) : [];
}
