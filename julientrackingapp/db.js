export const DB_NAME = "julien_tracking_db";
export const DB_VERSION = 1;

export const STORE_NAMES = [
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
