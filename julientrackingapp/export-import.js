import { createDataSnapshot, todayKey, toLocalIso } from "./db.js";
import {
  buildCloudExportData,
  mergeCloudImportData,
  replaceCloudNutritionData,
} from "./cloud-repository.js";

const SCHEMA_VERSION = 4;

export async function buildExportObject() {
  const cloudData = await buildCloudExportData();
  return {
    schema_version: SCHEMA_VERSION,
    exported_at: toLocalIso(),
    app: {
      name: "FitTrack Nutrition",
      version: "4.0.0",
    },
    settings: cleanSettingsForExport(cloudData.settings),
    food_entries: cloudData.food_entries,
    food_presets: cloudData.food_presets,
    weight_measurements: cloudData.weight_measurements,
    review_status: cloudData.review_status,
  };
}

export async function downloadFullExport() {
  const data = await buildExportObject();
  downloadJson(data, `fittrack-backup-${todayKey()}.json`);
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
  return JSON.parse(await file.text());
}

export function validateImportData(data) {
  if (!data || typeof data !== "object") throw new Error("Import-Datei ungültig.");
  const version = Number(data.schema_version);
  if (![1, 2, 3, 4].includes(version) && !looksLikeLegacyImport(data)) {
    throw new Error("Schema-Version nicht unterstützt.");
  }
  return true;
}

export async function replaceAllData(data) {
  const normalized = normalizeImportData(data);
  await createDataSnapshot("before-cloud-import-replace", await buildExportObject());
  return replaceCloudNutritionData(normalized);
}

export async function mergeImportData(data, options = {}) {
  return mergeCloudImportData(normalizeImportData(data), options);
}

// Used only for the explicit first-login transfer. It uses the same normalizer
// as a JSON import, so old local data and old backup files behave identically.
export async function migrateLocalDataToCloud(payload) {
  return mergeCloudImportData(normalizeImportData({
    schema_version: 3,
    settings: payload.settings || {},
    food_entries: payload.food_entries || [],
    food_presets: payload.food_presets || [],
    weight_entries: payload.weight_entries || [],
    review_status: payload.review_status || {},
  }));
}

function normalizeImportData(data) {
  validateImportData(data);
  const version = Number(data.schema_version);
  return {
    schema_version: SCHEMA_VERSION,
    settings: cleanSettingsForExport(data.settings || {}),
    food_entries: asArray(data.food_entries),
    food_presets: asArray(data.food_presets),
    review_status: asObject(data.review_status),
    cloud_weight_measurements: version >= 4 ? extractCloudWeightMeasurements(data) : [],
    legacy_weight_entries: extractLegacyWeightEntries(data, version),
    ignored_workouts_count: version < 3 || looksLikeLegacyImport(data) ? asArray(data.workouts).length : 0,
    ignored_body_measurements_count: countLegacyBodyMeasurements(data),
  };
}

function extractCloudWeightMeasurements(data) {
  return asArray(data.weight_measurements)
    .filter((entry) => entry && typeof entry === "object" && entry.id)
    .map(({ user_id, ...entry }) => entry);
}

function extractLegacyWeightEntries(data, version) {
  const fields = version >= 4
    ? ["weight_entries", "weights", "weightMeasurements"]
    : ["weight_entries", "weight_measurements", "weights", "weightMeasurements"];
  const normalized = [];

  for (const field of fields) {
    for (const [index, entry] of asArray(data[field]).entries()) {
      const row = normalizeLegacyWeightEntry(entry, field, index);
      if (row) normalized.push(row);
    }
  }

  return [...new Map(normalized.map((row) => [row.id, row])).values()];
}

function normalizeLegacyWeightEntry(entry, field, index) {
  if (!entry || typeof entry !== "object") return null;
  const date = dateKeyFromLegacyValue(entry.date || entry.measured_at || entry.measuredAt || entry.timestamp || entry.created_at);
  const weight = Number(entry.weight_kg ?? entry.weightKg ?? entry.weight ?? entry.value_kg);
  if (!date || !Number.isFinite(weight) || weight <= 0) return null;

  const sourceId = entry.id || entry.external_id || `legacy-${field}-${date}-${weight}-${index}`;
  return {
    id: String(sourceId),
    date,
    weight_kg: weight,
    created_at: entry.created_at || entry.createdAt || null,
    updated_at: entry.updated_at || entry.updatedAt || entry.source_modified_at || null,
  };
}

function dateKeyFromLegacyValue(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function countLegacyBodyMeasurements(data) {
  return ["body_measurements", "bodyMeasurements", "body_measurement_entries", "circumference_entries"]
    .reduce((count, field) => count + asArray(data[field]).length, 0);
}

function looksLikeLegacyImport(data) {
  return [
    "settings", "weight_entries", "weight_measurements", "weights", "weightMeasurements", "food_entries", "food_presets",
    "workouts", "body_measurements", "bodyMeasurements", "body_measurement_entries", "circumference_entries",
  ].some((key) => key in data);
}

function cleanSettingsForExport(settings) {
  const source = settings || {};
  const goals = source.goals || {};
  const preferences = source.preferences || {};
  const notifications = source.notifications || {};
  const cleanGoals = {
    ...goals,
    carbs_goal_g: emptyToNull(goals.carbs_goal_g),
    fat_goal_g: emptyToNull(goals.fat_goal_g),
  };
  delete cleanGoals.training_days_goal_per_week;
  delete cleanGoals.strength_goal_per_week;
  delete cleanGoals.cardio_goal_per_week;

  const focus = { ...(notifications.focus || {}) };
  delete focus.training;
  return {
    ...source,
    goals: cleanGoals,
    preferences: {
      ...preferences,
      theme: ["system", "light", "dark"].includes(preferences.theme) ? preferences.theme : "system",
    },
    notifications: { ...notifications, focus },
  };
}

function emptyToNull(value) {
  return value === undefined || value === "" ? null : value;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
