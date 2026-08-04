const COMPACT_FOOD_ENTRY_FORMAT = "ft2";

export function createSharedFoodPayload(entry) {
  // A positional format keeps complete nutrition entries comfortably within
  // the capacity of a QR code, even when every optional value is present.
  return JSON.stringify([
    COMPACT_FOOD_ENTRY_FORMAT,
    entry?.name ?? "",
    entry?.meal ?? "",
    entry?.quantity ?? 1,
    entry?.unit ?? "Portion",
    entry?.calories_kcal ?? 0,
    entry?.protein_g ?? 0,
    entry?.carbs_g ?? 0,
    entry?.fat_g ?? 0,
    entry?.fiber_g ?? null,
    entry?.sugar_g ?? null,
    entry?.salt_g ?? null,
    entry?.notes ?? "",
  ]);
}

export function parseSharedFoodPayload(rawText) {
  // qrcodejs adds an UTF-8 byte-order mark when a payload contains umlauts
  // or other non-ASCII characters. Some camera decoders preserve that mark,
  // while JSON.parse rejects it. Preset names frequently contain umlauts, so
  // remove the marker before parsing the shared entry.
  const text = String(rawText ?? "").replace(/^\uFEFF/, "");
  const payload = JSON.parse(text);

  if (Array.isArray(payload)) {
    if (payload[0] !== COMPACT_FOOD_ENTRY_FORMAT) {
      throw new Error("Kein FitTrack-Eintrag.");
    }

    const [,
      name,
      meal,
      quantity,
      unit,
      calories_kcal,
      protein_g,
      carbs_g,
      fat_g,
      fiber_g,
      sugar_g,
      salt_g,
      notes,
    ] = payload;

    return {
      name,
      meal,
      quantity,
      unit,
      calories_kcal,
      protein_g,
      carbs_g,
      fat_g,
      fiber_g,
      sugar_g,
      salt_g,
      notes,
    };
  }

  // Keep previously generated QR codes importable.
  if (payload?.type === "fittrack_food_entry") return payload;

  throw new Error("Kein FitTrack-Eintrag.");
}
