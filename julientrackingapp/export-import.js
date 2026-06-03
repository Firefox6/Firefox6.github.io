import {
  clearStore,
  getAll,
  getItem,
  getSettings,
  putItem,
  replaceStore,
  saveSettings,
  todayKey,
  toLocalIso,
} from "./db.js";

const SCHEMA_VERSION = 2;
const ACTIVE_DATA_STORES = ["weight_entries", "food_entries", "food_presets", "workouts"];
const PRESET_STORES = ["food_presets"];

export async function buildExportObject() {
  const settings = cleanSettingsForExport(await getSettings());
  const data = {
    schema_version: SCHEMA_VERSION,
    exported_at: toLocalIso(),
    app: {
      name: "FitTrack",
      version: "2.0.0",
    },
    settings,
  };

  data.weight_entries = await getAll("weight_entries");
  data.food_entries = await getAll("food_entries");
  data.food_presets = await getAll("food_presets");
  data.workouts = normalizeWorkouts(await getAll("workouts"));

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
  if (![1, 2].includes(version)) {
    throw new Error("Schema-Version nicht unterstützt.");
  }

  return true;
}

export async function replaceAllData(data) {
  const normalized = normalizeImportData(data);

  await saveSettings(normalized.settings || {});
  const counts = {};

  for (const storeName of ACTIVE_DATA_STORES) {
    const rows = normalized[storeName] || [];
    await replaceStore(storeName, rows);
    counts[storeName] = rows.length;
  }
  await clearStore("exercise_presets");

  return counts;
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

  return counts;
}

function normalizeImportData(data) {
  validateImportData(data);

  return {
    schema_version: SCHEMA_VERSION,
    settings: cleanSettingsForExport(data.settings || {}),
    weight_entries: asArray(data.weight_entries),
    food_entries: asArray(data.food_entries),
    food_presets: asArray(data.food_presets),
    workouts: normalizeWorkouts(asArray(data.workouts)),
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
    strength_goal_per_week: emptyToNull(goals.strength_goal_per_week),
    cardio_goal_per_week: emptyToNull(goals.cardio_goal_per_week),
  };
  delete cleanGoals.training_days_goal_per_week;

  return {
    ...source,
    goals: cleanGoals,
    preferences: {
      ...preferences,
      theme: ["system", "light", "dark"].includes(preferences.theme) ? preferences.theme : "system",
    },
  };
}

function normalizeWorkouts(workouts) {
  const byDayAndType = new Map();

  for (const workout of workouts || []) {
    if (!workout?.date || !["strength", "cardio"].includes(workout.type)) continue;

    const key = `${workout.date}_${workout.type}`;
    const existing = byDayAndType.get(key);
    const createdAt = workout.created_at || workout.updated_at || toLocalIso();
    const updatedAt = workout.updated_at || workout.created_at || createdAt;
    const simpleWorkout = {
      id: `workout_${workout.date}_${workout.type}`,
      date: workout.date,
      type: workout.type,
      name: workout.type === "strength" ? "Krafttraining" : "Cardio",
      completed: true,
      created_at: createdAt,
      updated_at: updatedAt,
    };

    if (!existing || isNewer(simpleWorkout, existing)) {
      byDayAndType.set(key, simpleWorkout);
    }
  }

  return [...byDayAndType.values()].sort((a, b) => `${a.date}${a.type}`.localeCompare(`${b.date}${b.type}`));
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
