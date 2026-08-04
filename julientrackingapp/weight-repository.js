import { getCurrentUser, getAuthState } from "./auth-service.js";
import { getSupabaseClient } from "./supabase-client.js";

const TABLE = "weight_measurements";
const SOURCE_PRIORITY = {
  manual_nutrition: 0,
  manual_fitness: 1,
  health_connect: 2,
};

export async function getWeightMeasurements(options = {}) {
  const user = await requireUser();
  const client = await getSupabaseClient();
  let query = client
    .from(TABLE)
    .select("id, user_id, measured_at, weight_kg, source, external_id, source_package, source_modified_at, created_at, updated_at")
    .eq("user_id", user.id)
    .order("measured_at", { ascending: true });

  if (options.from) query = query.gte("measured_at", options.from);
  if (options.to) query = query.lte("measured_at", options.to);

  const { data, error } = await query;
  if (error) throw new Error(error.message || "Gewichtsdaten konnten nicht geladen werden.");
  return data || [];
}

export async function createManualWeightMeasurement(input) {
  const user = await requireUser();
  const weight = validWeight(input.weight_kg);
  const measuredAt = measuredAtForDate(input.date);
  const client = await getSupabaseClient();
  const { data, error } = await client
    .from(TABLE)
    .insert({
      user_id: user.id,
      measured_at: measuredAt,
      weight_kg: weight,
      source: "manual_nutrition",
    })
    .select()
    .single();
  if (error) throw new Error(error.message || "Gewicht konnte nicht gespeichert werden.");
  return data;
}

export async function updateManualWeightMeasurement(id, input) {
  if (!id) throw new Error("Gewichtseintrag nicht gefunden.");
  const weight = validWeight(input.weight_kg);
  const measuredAt = measuredAtForDate(input.date);
  const client = await getSupabaseClient();
  const { data, error } = await client
    .from(TABLE)
    .update({ weight_kg: weight, measured_at: measuredAt })
    .eq("id", id)
    .eq("source", "manual_nutrition")
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message || "Gewicht konnte nicht aktualisiert werden.");
  if (!data) throw new Error("Nur eigene Nutrition-Gewichte können bearbeitet werden.");
  return data;
}

export async function deleteManualWeightMeasurement(id) {
  if (!id) throw new Error("Gewichtseintrag nicht gefunden.");
  const client = await getSupabaseClient();
  const { data, error } = await client
    .from(TABLE)
    .delete()
    .eq("id", id)
    .eq("source", "manual_nutrition")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message || "Gewicht konnte nicht gelöscht werden.");
  if (!data) throw new Error("Nur eigene Nutrition-Gewichte können gelöscht werden.");
}

export async function getDailyWeightSeries(options = {}) {
  const measurements = await getWeightMeasurements(options);
  return normalizeDailyWeightSeries(measurements);
}

export function normalizeDailyWeightSeries(measurements) {
  const selectedByDay = new Map();

  for (const measurement of measurements || []) {
    const date = localDateKey(measurement.measured_at);
    if (!date || validWeightOrNull(measurement.weight_kg) === null) continue;
    const existing = selectedByDay.get(date);
    if (!existing || compareDailyCandidates(measurement, existing) < 0) {
      selectedByDay.set(date, measurement);
    }
  }

  return [...selectedByDay.entries()]
    .map(([date, measurement]) => ({
      id: `remote-daily-${date}`,
      date,
      weight_kg: Number(measurement.weight_kg),
      source: measurement.source || "other",
      remote_id: measurement.id,
      measured_at: measurement.measured_at,
      can_edit: measurement.source === "manual_nutrition",
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function migrateLegacyWeightEntries(entries) {
  const user = await requireUser();
  const rows = (entries || [])
    .filter((entry) => entry?.date && validWeightOrNull(entry.weight_kg) !== null)
    .map((entry) => ({
      user_id: user.id,
      measured_at: measuredAtForDate(entry.date, true),
      weight_kg: Number(entry.weight_kg),
      source: "legacy_import",
      external_id: `nutrition-local:${entry.id || `${entry.date}:${entry.weight_kg}`}`,
      source_modified_at: entry.updated_at || entry.created_at || null,
    }));

  let migratedCount = 0;
  let skippedCount = 0;
  const client = await getSupabaseClient();
  for (let start = 0; start < rows.length; start += 100) {
    const chunk = rows.slice(start, start + 100);
    const externalIds = chunk.map((row) => row.external_id);
    const { data: existingRows, error: lookupError } = await client
      .from(TABLE)
      .select("external_id")
      .eq("user_id", user.id)
      .in("external_id", externalIds);
    if (lookupError) {
      const failure = new Error(lookupError.message || "Bestehende Gewichtsdaten konnten nicht geprüft werden.");
      failure.migratedCount = migratedCount;
      throw failure;
    }

    const existingIds = new Set((existingRows || []).map((row) => row.external_id));
    const missingRows = chunk.filter((row) => !existingIds.has(row.external_id));
    skippedCount += chunk.length - missingRows.length;
    if (!missingRows.length) continue;

    const { error: insertError } = await client.from(TABLE).insert(missingRows);
    if (insertError) {
      const failure = new Error(insertError.message || "Migration der Gewichtsdaten fehlgeschlagen.");
      failure.migratedCount = migratedCount;
      throw failure;
    }
    migratedCount += missingRows.length;
  }

  return { migratedCount, skippedCount, total: rows.length };
}

export async function exportCloudWeights() {
  return getWeightMeasurements();
}

// Imports weights from a schema-v4 backup without trusting the exporting account's
// user_id. Existing rows from the same account are recognised by their original
// UUID; imported rows from another account receive a stable backup external_id so
// importing the same backup twice never creates duplicates.
export async function importBackupWeightMeasurements(measurements) {
  const user = await requireUser();
  const rows = (measurements || [])
    .map((measurement) => normalizeBackupWeightMeasurement(measurement))
    .filter(Boolean);
  if (!rows.length) return { importedCount: 0, skippedCount: 0, total: 0 };

  const client = await getSupabaseClient();
  let importedCount = 0;
  let skippedCount = 0;

  for (let start = 0; start < rows.length; start += 100) {
    const chunk = rows.slice(start, start + 100);
    const originalIds = chunk.map((row) => row.original_id).filter(Boolean);
    const backupExternalIds = chunk.map((row) => row.external_id);

    const [{ data: matchingIds, error: idError }, { data: matchingBackups, error: backupError }] = await Promise.all([
      originalIds.length
        ? client.from(TABLE).select("id").eq("user_id", user.id).in("id", originalIds)
        : Promise.resolve({ data: [], error: null }),
      client
        .from(TABLE)
        .select("external_id")
        .eq("user_id", user.id)
        .eq("source_package", "fittrack_backup_v4")
        .in("external_id", backupExternalIds),
    ]);
    if (idError) throw new Error(idError.message || "Bestehende Gewichtsdaten konnten nicht geprüft werden.");
    if (backupError) throw new Error(backupError.message || "Bestehende Backup-Gewichte konnten nicht geprüft werden.");

    const existingIds = new Set((matchingIds || []).map((row) => row.id));
    const existingBackupIds = new Set((matchingBackups || []).map((row) => row.external_id));
    const missingRows = chunk
      .filter((row) => !existingIds.has(row.original_id) && !existingBackupIds.has(row.external_id))
      .map(({ original_id, ...row }) => ({ ...row, user_id: user.id }));
    skippedCount += chunk.length - missingRows.length;
    if (!missingRows.length) continue;

    const { error: insertError } = await client.from(TABLE).insert(missingRows);
    if (insertError) throw new Error(insertError.message || "Gewichtsdaten aus dem Backup konnten nicht importiert werden.");
    importedCount += missingRows.length;
  }

  return { importedCount, skippedCount, total: rows.length };
}

function compareDailyCandidates(a, b) {
  const priorityA = SOURCE_PRIORITY[a.source] ?? 3;
  const priorityB = SOURCE_PRIORITY[b.source] ?? 3;
  if (priorityA !== priorityB) return priorityA - priorityB;
  return String(b.measured_at || "").localeCompare(String(a.measured_at || ""));
}

function measuredAtForDate(dateKey, forceNoon = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || "")) throw new Error("Bitte ein gültiges Datum eintragen.");
  const today = localDateKey(new Date().toISOString());
  if (!forceNoon && dateKey === today) return toLocalIso(new Date());
  const localNoon = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(localNoon.getTime())) throw new Error("Bitte ein gültiges Datum eintragen.");
  return toLocalIso(localNoon);
}

function localDateKey(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toLocalIso(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const offset = Math.abs(offsetMinutes);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${String(Math.floor(offset / 60)).padStart(2, "0")}:${String(offset % 60).padStart(2, "0")}`;
}

function validWeight(value) {
  const number = validWeightOrNull(value);
  if (number === null) throw new Error("Bitte ein gültiges Gewicht eintragen.");
  return number;
}

function validWeightOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeBackupWeightMeasurement(measurement) {
  if (!measurement || typeof measurement !== "object") return null;
  const weight = validWeightOrNull(measurement.weight_kg);
  const measuredAt = String(measurement.measured_at || "");
  if (!weight || Number.isNaN(new Date(measuredAt).getTime())) return null;

  const source = ["manual_nutrition", "manual_fitness", "health_connect", "legacy_import"].includes(measurement.source)
    ? measurement.source
    : "legacy_import";
  const originalId = String(measurement.id || "");
  if (!originalId) return null;

  return {
    original_id: originalId,
    measured_at: measuredAt,
    weight_kg: weight,
    source,
    // Do not reuse a Health/Fitness external id in another account. The backup
    // identifier is deliberately scoped by source_package and the original UUID.
    external_id: `fittrack-backup:${originalId}`,
    source_package: "fittrack_backup_v4",
    source_modified_at: measurement.source_modified_at || measurement.updated_at || measurement.created_at || null,
  };
}

async function requireUser() {
  const current = getAuthState().user || await getCurrentUser();
  if (!current) throw new Error("Bitte zuerst bei Supabase anmelden.");
  return current;
}
