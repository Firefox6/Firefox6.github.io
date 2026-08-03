import { SUPABASE_CONFIG } from "./config.js";

/** Weight is deliberately an internal dependency: no UI may create, edit, or list it. */
export function mapWeightRecord(record, userId) {
  return {
    user_id: userId,
    measured_at: record.measuredAt,
    weight_kg: record.weightKg,
    source: "health_connect",
    external_id: record.externalId,
    source_package: record.sourcePackage,
    source_modified_at: record.sourceModifiedAt ?? null
  };
}

export async function upsertHealthConnectWeights(records, session) {
  if (!records.length || !SUPABASE_CONFIG.url) return { inserted: 0, skipped: records.length };
  const response = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/weight_measurements?on_conflict=user_id,source,external_id`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_CONFIG.publishableKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(records)
  });
  if (!response.ok) throw new Error("WEIGHT_SYNC_FAILED");
  return { inserted: records.length, skipped: 0 };
}

export function resolveDailyWeight(records, date) {
  const priority = ["manual_nutrition", "health_connect", "manual_fitness", "legacy_import"];
  const selected = [...records]
    .filter((record) => new Date(record.measured_at) <= new Date(`${date}T23:59:59Z`))
    .sort((a, b) => priority.indexOf(a.source) - priority.indexOf(b.source) || +new Date(b.measured_at) - +new Date(a.measured_at))[0];
  if (!selected) return null;
  const ageDays = Math.max(0, Math.floor((Date.now() - +new Date(selected.measured_at)) / 86400000));
  return { weightKg: Number(selected.weight_kg), measuredAt: selected.measured_at, ageDays, source: selected.source, confidence: ageDays > 30 ? "stale" : "current" };
}
