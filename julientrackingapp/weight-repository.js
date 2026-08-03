import { getCurrentUser, getAuthState } from "./auth-service.js";
import { getSupabaseClient } from "./supabase-client.js";

const TABLE = "weight_measurements";
const SOURCE_PRIORITY = {
  manual_nutrition: 0,
  manual_fitness: 1,
  health_connect: 2,
};

export async function getWeightMeasurements(options = {}) {
  const client = await getSupabaseClient();
  let query = client
    .from(TABLE)
    .select("id, user_id, measured_at, weight_kg, source, external_id, source_package, source_modified_at, created_at, updated_at")
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
  const client = await getSupabaseClient();
  for (let start = 0; start < rows.length; start += 100) {
    const chunk = rows.slice(start, start + 100);
    const { error } = await client.from(TABLE).upsert(chunk, { onConflict: "user_id,external_id" });
    if (error) {
      const failure = new Error(error.message || "Migration der Gewichtsdaten fehlgeschlagen.");
      failure.migratedCount = migratedCount;
      throw failure;
    }
    migratedCount += chunk.length;
  }

  return { migratedCount, total: rows.length };
}

export async function exportCloudWeights() {
  return getWeightMeasurements();
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

async function requireUser() {
  const current = getAuthState().user || await getCurrentUser();
  if (!current) throw new Error("Bitte zuerst bei Supabase anmelden.");
  return current;
}
