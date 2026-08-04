import { mergeSettings } from "./db.js";
import { getAuthState, getCurrentUser } from "./auth-service.js";
import { getSupabaseClient } from "./supabase-client.js";
import {
  exportCloudWeights,
  getDailyWeightSeries,
  importBackupWeightMeasurements,
  migrateLegacyWeightEntries,
} from "./weight-repository.js";

const SETTINGS_TABLE = "app_settings";
const FOOD_ENTRIES_TABLE = "food_entries";
const FOOD_PRESETS_TABLE = "food_presets";
const METADATA_TABLE = "app_metadata";
const REVIEW_KEYS = ["last_daily_review_sent_date", "last_weekly_review_sent_week"];

export async function loadCloudSnapshot() {
  const user = await requireUser();
  const client = await getSupabaseClient();
  const [settingsResult, foodResult, presetResult, metadataResult, weightEntries] = await Promise.all([
    client.from(SETTINGS_TABLE).select("settings").eq("user_id", user.id).maybeSingle(),
    client.from(FOOD_ENTRIES_TABLE).select("*").eq("user_id", user.id).order("date", { ascending: true }).order("created_at", { ascending: true }),
    client.from(FOOD_PRESETS_TABLE).select("*").eq("user_id", user.id).order("name", { ascending: true }),
    client.from(METADATA_TABLE).select("key, value").eq("user_id", user.id),
    getDailyWeightSeries(),
  ]);

  throwIfError(settingsResult.error, "Einstellungen konnten nicht geladen werden.");
  throwIfError(foodResult.error, "Kalorieneinträge konnten nicht geladen werden.");
  throwIfError(presetResult.error, "Food-Presets konnten nicht geladen werden.");
  throwIfError(metadataResult.error, "Review-Status konnte nicht geladen werden.");

  return {
    settings: mergeSettings(settingsResult.data?.settings || {}),
    food_entries: (foodResult.data || []).map(stripUserId),
    food_presets: (presetResult.data || []).map(normalizePresetRow).map(stripUserId),
    weight_entries: weightEntries,
    review_status: reviewStatusFromRows(metadataResult.data || []),
  };
}

export async function saveCloudSettings(settings) {
  const user = await requireUser();
  const client = await getSupabaseClient();
  const cleaned = mergeSettings(settings);
  const { data, error } = await client
    .from(SETTINGS_TABLE)
    .upsert({ user_id: user.id, settings: cleaned }, { onConflict: "user_id" })
    .select("settings")
    .single();
  throwIfError(error, "Einstellungen konnten nicht gespeichert werden.");
  return mergeSettings(data?.settings || cleaned);
}

export async function saveCloudFoodEntry(entry) {
  return upsertRecord(FOOD_ENTRIES_TABLE, serializeFoodEntry(entry), "Kalorieneintrag konnte nicht gespeichert werden.");
}

export async function deleteCloudFoodEntry(id) {
  return deleteRecord(FOOD_ENTRIES_TABLE, id, "Kalorieneintrag konnte nicht gelöscht werden.");
}

export async function saveCloudFoodPreset(preset) {
  return upsertRecord(FOOD_PRESETS_TABLE, serializeFoodPreset(preset), "Food-Preset konnte nicht gespeichert werden.");
}

export async function deleteCloudFoodPreset(id) {
  return deleteRecord(FOOD_PRESETS_TABLE, id, "Food-Preset konnte nicht gelöscht werden.");
}

export async function saveCloudMetadata(key, value) {
  const user = await requireUser();
  const client = await getSupabaseClient();
  const { error } = await client
    .from(METADATA_TABLE)
    .upsert({ user_id: user.id, key, value }, { onConflict: "user_id,key" });
  throwIfError(error, "Review-Status konnte nicht gespeichert werden.");
}

export async function buildCloudExportData() {
  const [snapshot, measurements] = await Promise.all([loadCloudSnapshot(), exportCloudWeights()]);
  return {
    settings: snapshot.settings,
    food_entries: snapshot.food_entries,
    food_presets: snapshot.food_presets,
    review_status: snapshot.review_status,
    weight_measurements: (measurements || []).map(stripUserId),
  };
}

export async function mergeCloudImportData(normalized, options = {}) {
  const presetsOnly = options.presetsOnly === true;
  const counts = { food_entries: 0, food_presets: 0, weight_measurements: 0 };
  let skippedWeightCount = 0;

  if (!presetsOnly) {
    if (normalized.settings) await saveCloudSettings(normalized.settings);
    counts.food_entries = await mergeRecords(FOOD_ENTRIES_TABLE, normalized.food_entries || [], serializeFoodEntry);
    await importReviewStatus(normalized.review_status);
  }

  counts.food_presets = await mergeRecords(FOOD_PRESETS_TABLE, normalized.food_presets || [], serializeFoodPreset);

  if (!presetsOnly) {
    const legacy = await migrateLegacyWeightEntries(normalized.legacy_weight_entries || []);
    const cloud = await importBackupWeightMeasurements(normalized.cloud_weight_measurements || []);
    counts.weight_measurements = legacy.migratedCount + cloud.importedCount;
    skippedWeightCount = legacy.skippedCount + cloud.skippedCount;
  }

  return {
    counts,
    legacyWeightEntries: normalized.legacy_weight_entries || [],
    importedWeightCount: counts.weight_measurements,
    skippedWeightCount,
    ignoredWorkoutsCount: normalized.ignored_workouts_count || 0,
    ignoredBodyMeasurementsCount: normalized.ignored_body_measurements_count || 0,
  };
}

export async function replaceCloudNutritionData(normalized) {
  const user = await requireUser();
  const client = await getSupabaseClient();
  const foodEntries = normalized.food_entries || [];
  const foodPresets = normalized.food_presets || [];

  await saveCloudSettings(normalized.settings || {});
  const { error: foodDeleteError } = await client.from(FOOD_ENTRIES_TABLE).delete().eq("user_id", user.id);
  throwIfError(foodDeleteError, "Bestehende Kalorieneinträge konnten nicht ersetzt werden.");
  const { error: presetDeleteError } = await client.from(FOOD_PRESETS_TABLE).delete().eq("user_id", user.id);
  throwIfError(presetDeleteError, "Bestehende Food-Presets konnten nicht ersetzt werden.");

  const foodCount = await upsertRecords(FOOD_ENTRIES_TABLE, foodEntries.map(serializeFoodEntry));
  const presetCount = await upsertRecords(FOOD_PRESETS_TABLE, foodPresets.map(serializeFoodPreset));
  await importReviewStatus(normalized.review_status, { replace: true });

  // Weight is deliberately merge-only: this table is shared with Fitness and Health Connect.
  const legacy = await migrateLegacyWeightEntries(normalized.legacy_weight_entries || []);
  const cloud = await importBackupWeightMeasurements(normalized.cloud_weight_measurements || []);

  return {
    counts: {
      food_entries: foodCount,
      food_presets: presetCount,
      weight_measurements: legacy.migratedCount + cloud.importedCount,
    },
    legacyWeightEntries: normalized.legacy_weight_entries || [],
    importedWeightCount: legacy.migratedCount + cloud.importedCount,
    skippedWeightCount: legacy.skippedCount + cloud.skippedCount,
    ignoredWorkoutsCount: normalized.ignored_workouts_count || 0,
    ignoredBodyMeasurementsCount: normalized.ignored_body_measurements_count || 0,
  };
}

async function mergeRecords(table, rows, serializer) {
  if (!rows.length) return 0;
  const user = await requireUser();
  const client = await getSupabaseClient();
  let changed = 0;

  for (const batch of chunk(rows.filter((row) => row?.id), 100)) {
    const ids = batch.map((row) => row.id);
    const { data: existingRows, error: lookupError } = await client
      .from(table)
      .select("id, updated_at, created_at")
      .eq("user_id", user.id)
      .in("id", ids);
    throwIfError(lookupError, "Bestehende Importdaten konnten nicht geprüft werden.");

    const existingById = new Map((existingRows || []).map((row) => [row.id, row]));
    const changedRows = batch
      .filter((row) => isNewer(row, existingById.get(row.id)))
      .map(serializer);
    changed += await upsertRecords(table, changedRows);
  }

  return changed;
}

async function upsertRecords(table, rows) {
  if (!rows.length) return 0;
  const user = await requireUser();
  const client = await getSupabaseClient();
  let count = 0;

  for (const batch of chunk(rows, 100)) {
    const payload = batch.map((row) => ({ ...row, user_id: user.id }));
    const { error } = await client.from(table).upsert(payload, { onConflict: "user_id,id" });
    throwIfError(error, "Importdaten konnten nicht gespeichert werden.");
    count += batch.length;
  }

  return count;
}

async function upsertRecord(table, row, errorMessage) {
  const user = await requireUser();
  const client = await getSupabaseClient();
  const { data, error } = await client
    .from(table)
    .upsert({ ...row, user_id: user.id }, { onConflict: "user_id,id" })
    .select()
    .single();
  throwIfError(error, errorMessage);
  return stripUserId(table === FOOD_PRESETS_TABLE ? normalizePresetRow(data) : data);
}

async function deleteRecord(table, id, errorMessage) {
  const user = await requireUser();
  const client = await getSupabaseClient();
  const { data, error } = await client
    .from(table)
    .delete()
    .eq("user_id", user.id)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  throwIfError(error, errorMessage);
  if (!data) throw new Error("Eintrag wurde nicht gefunden.");
}

async function importReviewStatus(status, options = {}) {
  if (!status || typeof status !== "object") return;
  const user = await requireUser();
  const client = await getSupabaseClient();
  if (options.replace) {
    const { error } = await client
      .from(METADATA_TABLE)
      .delete()
      .eq("user_id", user.id)
      .in("key", REVIEW_KEYS);
    throwIfError(error, "Bestehender Review-Status konnte nicht ersetzt werden.");
  }

  for (const key of REVIEW_KEYS) {
    if (status[key] !== undefined && status[key] !== null) await saveCloudMetadata(key, status[key]);
  }
}

function serializeFoodEntry(entry) {
  const row = pick(entry, [
    "id", "date", "meal", "name", "quantity", "unit", "calories_kcal", "protein_g", "carbs_g", "fat_g",
    "fiber_g", "sugar_g", "salt_g", "preset_id", "notes", "created_at", "updated_at",
  ]);
  row.meal ??= "";
  row.quantity ??= 1;
  row.unit ??= "Portion";
  row.calories_kcal ??= 0;
  row.protein_g ??= 0;
  row.carbs_g ??= 0;
  row.fat_g ??= 0;
  row.notes ??= "";
  return row;
}

function serializeFoodPreset(preset) {
  const row = pick({ ...preset, tags: Array.isArray(preset?.tags) ? preset.tags : [] }, [
    "id", "type", "name", "base_quantity", "unit", "calories_kcal", "protein_g", "carbs_g", "fat_g",
    "fiber_g", "sugar_g", "salt_g", "tags", "created_at", "updated_at",
  ]);
  row.type ??= "unit_item";
  row.base_quantity ??= 1;
  row.unit ??= "Stück";
  row.calories_kcal ??= 0;
  row.protein_g ??= 0;
  row.carbs_g ??= 0;
  row.fat_g ??= 0;
  row.tags ??= [];
  return row;
}

function normalizePresetRow(row) {
  return { ...row, tags: Array.isArray(row?.tags) ? row.tags : [] };
}

function reviewStatusFromRows(rows) {
  return Object.fromEntries(
    rows
      .filter((row) => REVIEW_KEYS.includes(row.key))
      .map((row) => [row.key, row.value]),
  );
}

function pick(source, keys) {
  const result = {};
  for (const key of keys) {
    // Omit absent legacy fields so Postgres can apply column defaults instead
    // of receiving an explicit NULL for a required timestamp or quantity.
    if (source && source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

function stripUserId(row) {
  const { user_id, ...withoutUser } = row || {};
  return withoutUser;
}

function isNewer(incoming, existing) {
  if (!existing) return true;
  const incomingDate = incoming.updated_at || incoming.created_at || "";
  const existingDate = existing.updated_at || existing.created_at || "";
  return incomingDate >= existingDate;
}

function chunk(rows, size) {
  const result = [];
  for (let index = 0; index < rows.length; index += size) result.push(rows.slice(index, index + size));
  return result;
}

async function requireUser() {
  const user = getAuthState().user || await getCurrentUser();
  if (!user) throw new Error("Bitte zuerst bei Supabase anmelden.");
  return user;
}

function throwIfError(error, fallback) {
  if (error) throw new Error(error.message || fallback);
}
