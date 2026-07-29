/**
 * store.js — Persistenz & Datenverwaltung des Fussball Trackers
 *
 * - Hält fest, ob gerade der mitgelieferte DEFAULT_DATA oder ein
 *   importierter Datensatz aktiv ist (localStorage).
 * - Validiert importiertes JSON minimal, aber robust genug, um kaputte
 *   Dateien abzuweisen statt die App zum Absturz zu bringen.
 * - Baut den kopierbaren KI-Prompt aus den aktuell aktiven Daten.
 * - Verwaltet die Theme-Wahl (dark/light).
 *
 * Läuft als eigenständige, gehostete PWA (nicht als Claude.ai-Artefakt),
 * darum ist localStorage hier das richtige Werkzeug für Persistenz.
 */

const Store = (() => {
  "use strict";

  const LS_DATA_KEY = "fussballtracker.data.v1";
  const LS_THEME_KEY = "fussballtracker.theme";
  const LS_IMPORTED_AT_KEY = "fussballtracker.importedAt";

  // -- Validation ---------------------------------------------------------

  function isPlainObject(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
  }

  function validate(obj) {
    const errors = [];
    if (!isPlainObject(obj)) {
      errors.push("Root ist kein JSON-Objekt.");
      return { ok: false, errors };
    }
    for (const key of ["meta", "player", "club", "broadcaster"]) {
      if (!isPlainObject(obj[key])) errors.push(`"${key}" fehlt oder ist kein Objekt.`);
    }
    if (isPlainObject(obj.player)) {
      if (!isPlainObject(obj.player.profile)) errors.push('"player.profile" fehlt.');
      for (const k of ["stats", "upcomingMatches", "pastMatches", "news"]) {
        if (!Array.isArray(obj.player[k])) errors.push(`"player.${k}" muss ein Array sein.`);
      }
    }
    if (isPlainObject(obj.club)) {
      if (!isPlainObject(obj.club.profile)) errors.push('"club.profile" fehlt.');
      for (const k of ["stats", "upcomingMatches", "pastMatches", "news"]) {
        if (!Array.isArray(obj.club[k])) errors.push(`"club.${k}" muss ein Array sein.`);
      }
    }
    if (isPlainObject(obj.broadcaster)) {
      for (const k of ["rights", "upcomingFreeMatches"]) {
        if (!Array.isArray(obj.broadcaster[k])) errors.push(`"broadcaster.${k}" muss ein Array sein.`);
      }
    }
    return { ok: errors.length === 0, errors };
  }

  // -- Active data ----------------------------------------------------------

  function getActiveData() {
    try {
      const raw = localStorage.getItem(LS_DATA_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (validate(parsed).ok) return parsed;
      }
    } catch (e) {
      /* fall through to default */
    }
    return DEFAULT_DATA;
  }

  function isOverrideActive() {
    try {
      return !!localStorage.getItem(LS_DATA_KEY);
    } catch (e) {
      return false;
    }
  }

  function getImportedAt() {
    try {
      return localStorage.getItem(LS_IMPORTED_AT_KEY);
    } catch (e) {
      return null;
    }
  }

  function importFromString(jsonString) {
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (e) {
      return { ok: false, errors: ["Das ist kein gültiges JSON (Parse-Fehler)."] };
    }
    const result = validate(parsed);
    if (!result.ok) return result;
    try {
      localStorage.setItem(LS_DATA_KEY, JSON.stringify(parsed));
      localStorage.setItem(LS_IMPORTED_AT_KEY, new Date().toISOString());
    } catch (e) {
      return { ok: false, errors: ["Konnte nicht gespeichert werden (Speicher voll?)."] };
    }
    return { ok: true, data: parsed };
  }

  function resetToDefault() {
    try {
      localStorage.removeItem(LS_DATA_KEY);
      localStorage.removeItem(LS_IMPORTED_AT_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  function exportActiveDataString() {
    return JSON.stringify(getActiveData(), null, 2);
  }

  // -- Theme ----------------------------------------------------------------

  function getTheme() {
    try {
      return localStorage.getItem(LS_THEME_KEY) === "light" ? "light" : "dark";
    } catch (e) {
      return "dark";
    }
  }

  function setTheme(name) {
    try {
      localStorage.setItem(LS_THEME_KEY, name === "light" ? "light" : "dark");
    } catch (e) {
      /* ignore */
    }
  }

  // -- AI prompt builder ------------------------------------------------------

  function trimArr(arr, n) {
    return (Array.isArray(arr) ? arr : []).slice(0, n);
  }

  function exampleFromActive(data) {
    return {
      schemaVersion: 1,
      meta: { lastUpdated: "YYYY-MM-DD", lastUpdatedLabel: "z. B. 3. September 2026" },
      player: {
        label: data.player.label,
        profile: data.player.profile,
        statusNote: data.player.statusNote,
        stats: trimArr(data.player.stats, 2),
        upcomingMatches: trimArr(data.player.upcomingMatches, 2),
        pastMatches: trimArr(data.player.pastMatches, 2),
        news: trimArr(data.player.news, 2),
      },
      club: {
        label: data.club.label,
        profile: data.club.profile,
        statusNote: data.club.statusNote,
        stats: trimArr(data.club.stats, 2),
        upcomingMatches: trimArr(data.club.upcomingMatches, 2),
        pastMatches: trimArr(data.club.pastMatches, 2),
        news: trimArr(data.club.news, 2),
      },
      broadcaster: {
        label: data.broadcaster.label,
        name: data.broadcaster.name,
        intro: data.broadcaster.intro,
        rights: trimArr(data.broadcaster.rights, 2),
        upcomingFreeMatches: trimArr(data.broadcaster.upcomingFreeMatches, 2),
        emptyStateNote: data.broadcaster.emptyStateNote,
      },
    };
  }

  function buildAiPrompt(data) {
    const example = exampleFromActive(data);
    return `Du aktualisierst die Datendatei meiner "Fussball Tracker"-PWA (läuft offline, komplett JSON-basiert).

AUFTRAG
Recherchiere per Websuche den aktuellen Stand (heutiges Datum) zu:
- Spieler: ${data.player.profile.name} (${data.player.profile.team})
- Klub: ${data.club.profile.name}
- Broadcaster: ${data.broadcaster.name} — gratis Live-Fussball in der Schweiz

Falls ich zwischenzeitlich einen anderen Spieler, Klub oder Broadcaster tracken möchte, sage ich dir das explizit dazu — ansonsten bitte exakt diese drei aktualisieren.

AUSGABEFORMAT
Antworte NUR mit einem einzigen validen JSON-Objekt — keine Markdown-Codeblöcke (drei Backticks), kein Fliesstext davor oder danach. Exakt dieses Schema (schemaVersion 1), hier mit 1-2 Beispieleinträgen pro Liste zur Illustration:

${JSON.stringify(example, null, 2)}

REGELN
- Datumsformat überall YYYY-MM-DD. "time" ist "HH:MM" oder null, falls noch nicht angesetzt.
- "isFreeBroadcast": true NUR bei bestätigter gratis Live-Übertragung beim oben genannten Broadcaster — im Zweifel false.
- "goalsScored" bei pastMatches: Zahl oder null (null, wenn kein individueller Torbezug sinnvoll ist, z. B. beim Klub allgemein).
- "label"-Felder (player.label, club.label, broadcaster.label) kurz halten — sie stehen in der Navigationsleiste (max. ca. 10 Zeichen).
- stats/upcomingMatches/pastMatches/news/rights: 2-6 aktuelle, relevante Einträge. pastMatches neuste zuerst, upcomingMatches chronologisch.
- Alle Fliesstexte (statusNote, detail, note, news.text, intro, emptyStateNote) auf Deutsch, sachlich, 1-3 Sätze.
- meta.lastUpdated und meta.lastUpdatedLabel = heutiges Datum.
- Struktur/Feldnamen exakt beibehalten, auch wenn ein Feld gerade leer/null ist.

Gib danach ausschliesslich das JSON-Objekt zurück, sonst nichts.`;
  }

  return {
    validate,
    getActiveData,
    isOverrideActive,
    getImportedAt,
    importFromString,
    resetToDefault,
    exportActiveDataString,
    getTheme,
    setTheme,
    buildAiPrompt,
  };
})();
