import {
  STORE_NAMES,
  getAll,
  getItem,
  getSettings,
  putItem,
  replaceStore,
  saveSettings,
  todayKey,
  toLocalIso,
} from "./db.js";

const DATA_STORES = STORE_NAMES.filter((store) => store !== "settings");

export async function buildExportObject() {
  const settings = await getSettings();
  const data = {
    schema_version: 1,
    exported_at: toLocalIso(),
    app: {
      name: "Julien Tracking",
      version: "1.0.0",
    },
    settings,
  };

  for (const storeName of DATA_STORES) {
    data[storeName] = await getAll(storeName);
  }

  return data;
}

export async function downloadFullExport() {
  const data = await buildExportObject();
  const filename = `julien-tracking-backup-${todayKey()}.json`;
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

  if (!data.schema_version) {
    throw new Error("Import-Datei ungültig.");
  }

  if (Number(data.schema_version) !== 1) {
    throw new Error("Schema-Version nicht unterstützt.");
  }

  return true;
}

export async function replaceAllData(data) {
  validateImportData(data);

  await saveSettings(data.settings || {});
  const counts = {};

  for (const storeName of DATA_STORES) {
    const rows = Array.isArray(data[storeName]) ? data[storeName] : [];
    await replaceStore(storeName, rows);
    counts[storeName] = rows.length;
  }

  return counts;
}

export async function mergeImportData(data, options = {}) {
  validateImportData(data);

  const stores = options.presetsOnly
    ? ["food_presets", "exercise_presets"]
    : DATA_STORES;

  const counts = Object.fromEntries(stores.map((store) => [store, 0]));

  if (!options.presetsOnly && data.settings) {
    await saveSettings(data.settings);
  }

  for (const storeName of stores) {
    const rows = Array.isArray(data[storeName]) ? data[storeName] : [];
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

function isNewer(incoming, existing) {
  const incomingDate = incoming.updated_at || incoming.created_at || "";
  const existingDate = existing.updated_at || existing.created_at || "";
  return incomingDate >= existingDate;
}
