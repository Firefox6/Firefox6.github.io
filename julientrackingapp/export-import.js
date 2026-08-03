import {
  createDataSnapshot,
  getAll,
  getItem,
  getSettings,
  putItem,
  replaceStore,
  saveSettings,
  todayKey,
  toLocalIso,
} from "./db.js";

const SCHEMA_VERSION = 3;
const ACTIVE_DATA_STORES = ["food_entries", "food_presets"];
const PRESET_STORES = ["food_presets"];

export async function buildExportObject() {
  const settings = cleanSettingsForExport(await getSettings());
  const data = {
    schema_version: SCHEMA_VERSION,
    exported_at: toLocalIso(),
    app: {
      name: "FitTrack Nutrition",
      version: "3.0.0",
    },
    settings,
    remote_resources: {
      weight_measurements: "supabase",
    },
  };

  data.food_entries = await getAll("food_entries");
  data.food_presets = await getAll("food_presets");

  return data;
}

export async function downloadFullExport() {
  const data = await buildExportObject();
  const filename = `fittrack-backup-${todayKey()}.json`;
  downloadJson(data, filename);
  return data;
}

export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function readJsonFile(file) {
  const text = await file.text();
  return JSON.parse(text);
}

export function validateImportData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Import-Datei ungültig.");
  }

  const version = Number(data.schema_version);
  if (![1, 2, 3].includes(version)) {
    throw new Error("Schema-Version nicht unterstützt.");
  }

  return true;
}

export async function replaceAllData(data) {
  const normalized = normalizeImportData(data);
  await createDataSnapshot("before-import-replace", await buildExportObject());

  await saveSettings(normalized.settings || {});
  const counts = {};

  for (const storeName of ACTIVE_DATA_STORES) {
    const rows = normalized[storeName] || [];
    await replaceStore(storeName, rows);
    counts[storeName] = rows.length;
  }
  return importResult(counts, normalized);
}

export async function mergeImportData(data, options = {}) {
  const normalized = normalizeImportData(data);
  const stores = options.presetsOnly ? PRESET_STORES : ACTIVE_DATA_STORES;
  const counts = Object.fromEntries(stores.map((store) => [store, 0]));

  if (!options.presetsOnly && normalized.settings) {
    await saveSettings(normalized.settings);
  }

  for (const storeName of stores) {
    const rows = normalized[storeName] || [];
    for (const row of rows) {
      if (!row?.id) continue;
      const existing = await getItem(storeName, row.id);
      if (!existing || isNewer(row, existing)) {
        await putItem(storeName, row);
        counts[storeName] += 1;
      }
    }
  }

  return importResult(counts, normalized);
}

function normalizeImportData(data) {
  validateImportData(data);

  return {
    schema_version: SCHEMA_VERSION,
    settings: cleanSettingsForExport(data.settings || {}),
    food_entries: asArray(data.food_entries),
    food_presets: asArray(data.food_presets),
    legacy_weight_entries: Number(data.schema_version) < 3 ? asArray(data.weight_entries) : [],
    ignored_workouts_count: Number(data.schema_version) < 3 ? asArray(data.workouts).length : 0,
  };
}

function importResult(counts, normalized) {
  return {
    counts,
    legacyWeightEntries: normalized.legacy_weight_entries,
    ignoredWorkoutsCount: normalized.ignored_workouts_count,
  };
}

function cleanSettingsForExport(settings) {
  const source = settings || {};
  const goals = source.goals || {};
  const preferences = source.preferences || {};
  const cleanGoals = {
    ...goals,
    carbs_goal_g: emptyToNull(goals.carbs_goal_g),
    fat_goal_g: emptyToNull(goals.fat_goal_g),
  };
  delete cleanGoals.training_days_goal_per_week;
  delete cleanGoals.strength_goal_per_week;
  delete cleanGoals.cardio_goal_per_week;

  const notifications = source.notifications || {};
  const focus = { ...(notifications.focus || {}) };
  delete focus.training;

  return {
    ...source,
    goals: cleanGoals,
    preferences: {
      ...preferences,
      theme: ["system", "light", "dark"].includes(preferences.theme) ? preferences.theme : "system",
    },
    notifications: {
      ...notifications,
      focus,
    },
  };
}

function emptyToNull(value) {
  return value === undefined || value === "" ? null : value;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isNewer(incoming, existing) {
  const incomingDate = incoming.updated_at || incoming.created_at || "";
  const existingDate = existing.updated_at || existing.created_at || "";
  return incomingDate >= existingDate;
}
