/**
 * app.js — Fussball Tracker
 * Kleine handgeschriebene SPA ohne Framework: Router + Renderer, generisch
 * für player/club/broadcaster (statt fest verdrahtet auf Mbappé/Basel/SRF),
 * damit ein importierter Datensatz die App vollständig umkrempeln kann.
 */

(() => {
  "use strict";

  const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const MONTHS_LONG = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

  const $main = document.getElementById("main-content");
  const $eyebrow = document.getElementById("topbar-eyebrow");
  const $title = document.getElementById("topbar-title");
  const $tabbar = document.querySelector(".tabbar");
  const $tabButtons = document.querySelectorAll(".tabbar button");
  const $themeColorMeta = document.querySelector('meta[name="theme-color"]');

  let DATA = Store.getActiveData();
  let activeIntervals = [];

  // ----------------------------------------------------------------------
  // Date helpers
  // ----------------------------------------------------------------------

  function parseLocal(dateStr, timeStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    if (timeStr) {
      const [hh, mm] = timeStr.split(":").map(Number);
      return new Date(y, m - 1, d, hh, mm, 0, 0);
    }
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }

  function fmtShort(dateStr) {
    const dt = parseLocal(dateStr, null);
    return `${WEEKDAYS[dt.getDay()]}, ${String(dt.getDate()).padStart(2, "0")}.${String(dt.getMonth() + 1).padStart(2, "0")}.`;
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // ----------------------------------------------------------------------
  // Entity / match helpers (generic — works for any player/club names)
  // ----------------------------------------------------------------------

  function coreName(name) {
    return String(name || "")
      .replace(/^FC\s+|^1\.\s*FC\s+/i, "")
      .replace(/\s+\d{4}$/, "")
      .trim()
      .toLowerCase();
  }

  function teamMatches(fixtureTeamName, entityName) {
    const a = coreName(fixtureTeamName);
    const b = coreName(entityName);
    if (!a || !b) return false;
    return a.includes(b) || b.includes(a);
  }

  function crestInitials(name) {
    return String(name || "")
      .replace(/^FC\s+|^1\.\s*FC\s+/i, "")
      .split(/[\s-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 3);
  }

  function nextMatch(list) {
    const now = new Date();
    for (const m of list || []) {
      const dt = parseLocal(m.date, m.time);
      if (dt.getTime() >= now.getTime() - 3 * 60 * 60 * 1000) return m; // 3h Kulanz nach Anpfiff
    }
    return null;
  }

  function lastMatch(list) {
    return list && list.length ? list[0] : null;
  }

  function freeBadge(match) {
    return match.isFreeBroadcast ? `<span class="badge free">Gratis live</span>` : "";
  }

  // entityName: string | null. Wenn gesetzt, wird Heim/Auswärts-Perspektive
  // relativ zu dieser Entität berechnet ("vs." / "@"). Ohne entityName wird
  // die Begegnung neutral als "Heim – Auswärts" gezeigt.
  function opponentLine(match, entityName) {
    if (!entityName) {
      return { display: `${match.homeTeam} – ${match.awayTeam}`, isHome: null };
    }
    const isHome = teamMatches(match.homeTeam, entityName);
    const opponent = isHome ? match.awayTeam : match.homeTeam;
    const prefix = isHome ? "vs." : "@";
    return { display: `${prefix} ${opponent}`, opponent, isHome };
  }

  // ----------------------------------------------------------------------
  // Shared row renderers
  // ----------------------------------------------------------------------

  function boardRow(match, entityName) {
    const { display, opponent } = opponentLine(match, entityName);
    const crestSource = opponent || match.homeTeam;
    return `
      <div class="board-row">
        <div class="crest">${escapeHtml(crestInitials(crestSource))}</div>
        <div class="info">
          <p class="opponent">${escapeHtml(display)}</p>
          <p class="meta">${escapeHtml(match.competition)}${match.venue ? " · " + escapeHtml(match.venue) : ""}</p>
        </div>
        <div class="side">
          <span class="time">${match.time ? escapeHtml(match.time) : "–"}</span>
          <span class="date">${fmtShort(match.date)}</span>
          ${freeBadge(match)}
        </div>
      </div>
      ${match.note ? `<p class="status-note" style="margin:-4px 0 12px 4px;">${escapeHtml(match.note)}</p>` : ""}
    `;
  }

  function resultRow(match, opts = {}) {
    const goalChip =
      opts.goalKey && match[opts.goalKey] != null
        ? `<span class="goal-chip">${match[opts.goalKey]} Tor${match[opts.goalKey] === 1 ? "" : "e"}</span>`
        : "";
    return `
      <div class="result-row">
        <div class="top-line">
          <span class="fixture">${escapeHtml(match.homeTeam)} ${match.score ? escapeHtml(match.score) : "–"} ${escapeHtml(match.awayTeam)}</span>
          ${goalChip}
        </div>
        <p class="comp">${escapeHtml(match.competition)} · ${fmtShort(match.date)}</p>
        ${match.note ? `<p class="note">${escapeHtml(match.note)}</p>` : ""}
      </div>
    `;
  }

  function matchList(items, renderFn) {
    if (!items || !items.length) return `<div class="empty-state">Keine Einträge.</div>`;
    return `<div class="match-list">${items.map(renderFn).join("")}</div>`;
  }

  function newsList(items) {
    if (!items || !items.length) return `<div class="empty-state">Keine News.</div>`;
    return items
      .map(
        (n) => `
      <div class="news-item">
        <h3>${escapeHtml(n.title)}</h3>
        <p>${escapeHtml(n.text)}</p>
      </div>`
      )
      .join("");
  }

  function statGrid(stats) {
    if (!stats || !stats.length) return `<div class="empty-state">Keine Statistiken.</div>`;
    return `
      <div class="stat-grid">
        ${stats
          .map(
            (s) => `
          <div class="stat-tile">
            <p class="label">${escapeHtml(s.label)}</p>
            <p class="value">${escapeHtml(s.value)} ${s.unit ? `<span style="font-size:13px;color:var(--cream-faint);">${escapeHtml(s.unit)}</span>` : ""}</p>
            ${s.detail ? `<p class="sub">${escapeHtml(s.detail)}</p>` : ""}
          </div>`
          )
          .join("")}
      </div>`;
  }

  // ----------------------------------------------------------------------
  // Flip-clock countdown (signature element)
  // ----------------------------------------------------------------------

  function flipUnitHtml(id, digitCount, caption) {
    let cells = "";
    for (let i = 0; i < digitCount; i++) {
      cells += `<div class="flip-card"><div class="flip-face" data-idx="${i}">0</div></div>`;
    }
    return `
      <div class="flip-unit" id="${id}">
        <div class="flip-digits">${cells}</div>
        <span class="flip-caption">${caption}</span>
      </div>`;
  }

  function updateFlipUnit(id, valueStr) {
    const unit = document.getElementById(id);
    if (!unit) return;
    const faces = unit.querySelectorAll(".flip-face");
    const padded = valueStr.padStart(faces.length, "0").slice(-faces.length);
    faces.forEach((face, i) => {
      const newDigit = padded[i];
      if (face.textContent !== newDigit) {
        face.classList.remove("flipping");
        void face.offsetWidth; // reflow, damit die Animation neu starten kann
        face.classList.add("flipping");
        setTimeout(() => {
          face.textContent = newDigit;
        }, 250);
        setTimeout(() => {
          face.classList.remove("flipping");
        }, 520);
      }
    });
  }

  function countdownCardHtml(cardId, label, match, entityName) {
    if (!match) {
      return `
        <div class="countdown-card">
          <p class="cc-label">${escapeHtml(label)}</p>
          <p class="cc-opponent">Kein Termin in den Daten</p>
        </div>`;
    }
    const { display } = opponentLine(match, entityName);
    return `
      <div class="countdown-card">
        <p class="cc-label">${escapeHtml(label)}</p>
        <p class="cc-opponent">${escapeHtml(display)}${freeBadge(match) ? " " + freeBadge(match) : ""}</p>
        <div class="flip-group">
          ${flipUnitHtml(cardId + "-d", 2, "Tage")}
          <span class="flip-sep">:</span>
          ${flipUnitHtml(cardId + "-h", 2, "Std")}
          <span class="flip-sep">:</span>
          ${flipUnitHtml(cardId + "-m", 2, "Min")}
        </div>
        <p class="cc-meta">${fmtShort(match.date)}${match.time ? ", " + match.time : ""} · ${escapeHtml(match.competition)}</p>
      </div>`;
  }

  function startCountdownTicker(cardId, match) {
    if (!match) return;
    const target = parseLocal(match.date, match.time).getTime();
    function tick() {
      const diff = Math.max(0, target - Date.now());
      const totalMinutes = Math.floor(diff / 60000);
      const days = Math.floor(totalMinutes / (60 * 24));
      const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
      const mins = totalMinutes % 60;
      updateFlipUnit(cardId + "-d", String(Math.min(days, 99)));
      updateFlipUnit(cardId + "-h", String(hours));
      updateFlipUnit(cardId + "-m", String(mins));
    }
    tick();
    const iv = setInterval(tick, 15000);
    activeIntervals.push(iv);
  }

  // ----------------------------------------------------------------------
  // Views
  // ----------------------------------------------------------------------

  function viewHome() {
    const p = DATA.player;
    const c = DATA.club;
    const b = DATA.broadcaster;
    const nextP = nextMatch(p.upcomingMatches);
    const nextC = nextMatch(c.upcomingMatches);
    const lastP = lastMatch(p.pastMatches);
    const lastC = lastMatch(c.pastMatches);

    const freeUpcoming = [
      ...(p.upcomingMatches || []).filter((x) => x.isFreeBroadcast).map((m) => ({ m, entity: p.profile.team })),
      ...(c.upcomingMatches || []).filter((x) => x.isFreeBroadcast).map((m) => ({ m, entity: c.profile.name })),
    ];

    return `
      <div class="view-enter">
        <p class="section-label">Nächste Spiele</p>
        <div class="countdown-wrap">
          ${countdownCardHtml("cd-player", p.label, nextP, p.profile.team)}
          ${countdownCardHtml("cd-club", c.label, nextC, c.profile.name)}
        </div>

        <p class="section-label">Zuletzt</p>
        <div class="chip-row">
          <div class="result-chip">
            <p class="who">${escapeHtml(p.label)}</p>
            ${
              lastP
                ? `<p class="fixture">${escapeHtml(lastP.homeTeam)} – ${escapeHtml(lastP.awayTeam)}</p>
                   <p class="score">${escapeHtml(lastP.score)}</p>`
                : `<p class="fixture">Keine Daten</p>`
            }
          </div>
          <div class="result-chip">
            <p class="who">${escapeHtml(c.label)}</p>
            ${
              lastC
                ? `<p class="fixture">${escapeHtml(lastC.homeTeam)} – ${escapeHtml(lastC.awayTeam)}</p>
                   <p class="score">${escapeHtml(lastC.score)}</p>`
                : `<p class="fixture">Keine Daten</p>`
            }
          </div>
        </div>

        <p class="section-label">${escapeHtml(b.label)} — gratis live</p>
        <div class="card">
          ${
            freeUpcoming.length
              ? freeUpcoming.map(({ m, entity }) => boardRow(m, entity)).join("")
              : `<p class="status-note" style="margin-top:0;">${escapeHtml(b.emptyStateNote)}</p>`
          }
        </div>

        <p class="section-label">News</p>
        <div class="card">
          ${newsList([p.news && p.news[0], c.news && c.news[0]].filter(Boolean))}
        </div>

        <p class="footer-note">Stand: ${escapeHtml(DATA.meta.lastUpdatedLabel)}</p>
      </div>
    `;
  }

  function viewEntity(entity, kind) {
    // kind: "player" | "club" — steuert Profilfelder & Perspektive
    const isPlayer = kind === "player";
    const entityName = isPlayer ? entity.profile.team : entity.profile.name;
    const tagline = isPlayer
      ? `${escapeHtml(entity.profile.team)} · ${escapeHtml(entity.profile.nationalTeam)} · ${escapeHtml(entity.profile.position)}`
      : `${escapeHtml(entity.profile.stadium)} · Trainer: ${escapeHtml(entity.profile.coach)}`;
    const numBadge = isPlayer
      ? entity.profile.shirtNumber
      : (entity.profile.name || "")
          .replace(/^FC\s+/i, "")
          .split(/\s+/)
          .map((w) => w[0])
          .join("")
          .slice(0, 3)
          .toUpperCase();

    const detailItems = isPlayer
      ? [
          ["Geboren", `${entity.profile.born} (${entity.profile.age})`],
          ["Grösse", entity.profile.height],
          ["Fuss", entity.profile.foot],
          ["Vertrag bis", entity.profile.contractUntil],
        ]
      : [
          ["Gegründet", entity.profile.founded],
          ["Präsident", entity.profile.president],
          ["Stadion", entity.profile.stadium],
          ["Trainer", entity.profile.coach],
        ];

    return `
      <div class="view-enter">
        <div class="card profile-card">
          <div class="num" style="${isPlayer ? "" : "font-size:15px;"}">${escapeHtml(numBadge)}</div>
          <div>
            <h2>${escapeHtml(entity.profile.name)}</h2>
            <p class="tagline">${tagline}</p>
          </div>
        </div>
        <div class="card">
          <p class="status-note" style="margin-top:0;">${escapeHtml(entity.statusNote)}</p>
          <div class="detail-list">
            ${detailItems.map(([k, v]) => `<div class="item"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`).join("")}
          </div>
        </div>

        <p class="section-label">Statistiken</p>
        ${statGrid(entity.stats)}

        <p class="section-label">Kommende Spiele</p>
        ${matchList(entity.upcomingMatches, (x) => boardRow(x, entityName))}

        <p class="section-label">Letzte Spiele${isPlayer ? " &amp; Tore" : ""}</p>
        ${matchList(entity.pastMatches, (x) => resultRow(x, isPlayer ? { goalKey: "goalsScored" } : {}))}

        <p class="section-label">News</p>
        <div class="card">${newsList(entity.news)}</div>

        <p class="footer-note">Stand: ${escapeHtml(DATA.meta.lastUpdatedLabel)}</p>
      </div>
    `;
  }

  function viewBroadcaster() {
    const b = DATA.broadcaster;
    const freeUpcoming = [
      ...(DATA.player.upcomingMatches || [])
        .filter((x) => x.isFreeBroadcast)
        .map((m) => ({ m, entity: DATA.player.profile.team })),
      ...(DATA.club.upcomingMatches || [])
        .filter((x) => x.isFreeBroadcast)
        .map((m) => ({ m, entity: DATA.club.profile.name })),
      ...(b.upcomingFreeMatches || []).map((m) => ({ m, entity: null })),
    ];

    return `
      <div class="view-enter">
        <div class="card">
          <p class="status-note" style="margin-top:0;">${escapeHtml(b.intro)}</p>
        </div>

        <p class="section-label">Gratis Live-Spiele — nächste Tage</p>
        <div class="card">
          ${
            freeUpcoming.length
              ? freeUpcoming.map(({ m, entity }) => boardRow(m, entity)).join("")
              : `<div class="empty-state">${escapeHtml(b.emptyStateNote)}</div>`
          }
        </div>

        <p class="section-label">Übertragungsrechte im Überblick</p>
        ${(b.rights || [])
          .map(
            (r) => `
          <div class="rights-card">
            <p class="comp-name">${escapeHtml(r.competition)}</p>
            <div class="row"><span class="tag">Rechte</span><span class="val">${escapeHtml(r.rightsHolder)}</span></div>
            <div class="row"><span class="tag">${escapeHtml(b.label)}</span><span class="val">${escapeHtml(r.freeCoverage)}</span></div>
            <p class="until">${escapeHtml(r.validity)}</p>
          </div>`
          )
          .join("")}

        <p class="footer-note">Stand: ${escapeHtml(DATA.meta.lastUpdatedLabel)}</p>
      </div>
    `;
  }

  function viewSettings() {
    const theme = Store.getTheme();
    const overrideActive = Store.isOverrideActive();
    const importedAt = Store.getImportedAt();
    const importedAtLabel = importedAt
      ? new Date(importedAt).toLocaleString("de-CH", { dateStyle: "medium", timeStyle: "short" })
      : null;

    return `
      <div class="view-enter">

        <p class="section-label">Darstellung</p>
        <div class="card settings-section">
          <div class="theme-toggle" role="group" aria-label="Farbschema">
            <button type="button" data-theme-choice="dark" aria-pressed="${theme === "dark"}" class="${theme === "dark" ? "active" : ""}">Dunkel</button>
            <button type="button" data-theme-choice="light" aria-pressed="${theme === "light"}" class="${theme === "light" ? "active" : ""}">Hell</button>
          </div>
        </div>

        <p class="section-label">Daten</p>
        <div class="card settings-section">
          <p class="settings-meta" style="margin-bottom:12px;">
            Aktive Quelle: <strong style="color:var(--cream);">${overrideActive ? "importierte Datei" : "mitgelieferter Standard"}</strong><br/>
            Inhalt-Stand laut Datei: ${escapeHtml(DATA.meta.lastUpdatedLabel || "–")}${importedAtLabel ? `<br/>Importiert am: ${escapeHtml(importedAtLabel)} (auf diesem Gerät)` : ""}
          </p>

          <div class="file-row">
            <button type="button" class="btn btn-primary" id="btn-export">JSON exportieren</button>
            <button type="button" class="btn btn-secondary" id="btn-import">JSON importieren</button>
            ${overrideActive ? `<button type="button" class="btn btn-ghost" id="btn-reset">Auf Standard zurücksetzen</button>` : ""}
            <input type="file" id="import-file-input" accept="application/json,.json" style="display:none" />
          </div>
          <div id="import-status"></div>
        </div>

        <p class="section-label">Daten aktualisieren per KI-Prompt</p>
        <div class="card settings-section">
          <p class="status-note" style="margin-top:0;">
            Diesen Prompt in einer neuen Unterhaltung mit Claude einfügen (Websuche aktiviert). Die Antwort als .json speichern und oben importieren — die App ist wieder aktuell.
          </p>
          <div class="prompt-box">
            <button type="button" class="btn btn-secondary copy-btn" id="btn-copy-prompt">Kopieren</button>
            <pre id="ai-prompt-text">${escapeHtml(Store.buildAiPrompt(DATA))}</pre>
          </div>
        </div>

        <p class="section-label">Über</p>
        <div class="card settings-section">
          <p class="settings-meta">
            Fussball Tracker · Schema-Version ${DATA.schemaVersion || 1}<br/>
            Läuft vollständig offline, keine Server-Anbindung. Alle Inhalte kommen aus der aktiven JSON-Datei.
          </p>
        </div>

        <p class="footer-note">Stand: ${escapeHtml(DATA.meta.lastUpdatedLabel)}</p>
      </div>
    `;
  }

  // ----------------------------------------------------------------------
  // Router
  // ----------------------------------------------------------------------

  function getViewsMeta() {
    return {
      home: { title: "Startseite", eyebrow: "Fussball Tracker", render: viewHome },
      player: { title: DATA.player.profile.name, eyebrow: "Spieler-Tracker", render: () => viewEntity(DATA.player, "player") },
      club: { title: DATA.club.profile.name, eyebrow: "Klub-Tracker", render: () => viewEntity(DATA.club, "club") },
      broadcaster: { title: DATA.broadcaster.name, eyebrow: "Gratis Live-Übersicht", render: viewBroadcaster },
      settings: { title: "Einstellungen", eyebrow: "App", render: viewSettings },
    };
  }

  let currentTab = "home";

  function clearIntervals() {
    activeIntervals.forEach(clearInterval);
    activeIntervals = [];
  }

  function syncNavLabels() {
    $tabButtons.forEach((btn) => {
      const labelSpan = btn.querySelector("span:not(.tab-underline)");
      if (!labelSpan) return;
      switch (btn.dataset.tab) {
        case "player":
          labelSpan.textContent = DATA.player.label;
          break;
        case "club":
          labelSpan.textContent = DATA.club.label;
          break;
        case "broadcaster":
          labelSpan.textContent = DATA.broadcaster.label;
          break;
        default:
          break;
      }
    });
  }

  function goTo(tab) {
    const meta = getViewsMeta();
    const view = meta[tab] || meta.home;
    currentTab = meta[tab] ? tab : "home";
    clearIntervals();
    syncNavLabels();

    $eyebrow.textContent = view.eyebrow;
    $title.textContent = view.title;
    $main.innerHTML = view.render();

    $tabButtons.forEach((btn) => {
      const on = btn.dataset.tab === currentTab;
      btn.classList.toggle("active", on);
      if (on) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });

    if (currentTab === "home") {
      startCountdownTicker("cd-player", nextMatch(DATA.player.upcomingMatches));
      startCountdownTicker("cd-club", nextMatch(DATA.club.upcomingMatches));
    } else if (currentTab === "settings") {
      initSettingsView();
    }

    window.scrollTo({ top: 0, behavior: "auto" });
    try {
      history.replaceState(null, "", "#" + currentTab);
    } catch (e) {
      /* ignore */
    }
  }

  $tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => goTo(btn.dataset.tab));
  });

  // ----------------------------------------------------------------------
  // Settings view interactivity
  // ----------------------------------------------------------------------

  function applyTheme(name) {
    document.documentElement.setAttribute("data-theme", name === "light" ? "light" : "dark");
    if ($themeColorMeta) {
      $themeColorMeta.setAttribute("content", name === "light" ? "#eef0f4" : "#0b0e14");
    }
  }

  function showImportStatus(kind, message) {
    const el = document.getElementById("import-status");
    if (!el) return;
    el.innerHTML = `<div class="status-banner ${kind}">${escapeHtml(message)}</div>`;
  }

  function reloadDataAndRerender(tab) {
    DATA = Store.getActiveData();
    goTo(tab || currentTab);
  }

  function initSettingsView() {
    // Theme toggle
    document.querySelectorAll("[data-theme-choice]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const choice = btn.dataset.themeChoice;
        Store.setTheme(choice);
        applyTheme(choice);
        document.querySelectorAll("[data-theme-choice]").forEach((b) => {
          const active = b === btn;
          b.classList.toggle("active", active);
          b.setAttribute("aria-pressed", String(active));
        });
      });
    });

    // Export
    const exportBtn = document.getElementById("btn-export");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        const str = Store.exportActiveDataString();
        const blob = new Blob([str], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const dateForName = (DATA.meta && DATA.meta.lastUpdated) || "export";
        a.href = url;
        a.download = `fussball-tracker-daten-${dateForName}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      });
    }

    // Import
    const importBtn = document.getElementById("btn-import");
    const fileInput = document.getElementById("import-file-input");
    if (importBtn && fileInput) {
      importBtn.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const result = Store.importFromString(String(reader.result));
          if (result.ok) {
            showImportStatus("success", "Import erfolgreich — Daten aktualisiert.");
            reloadDataAndRerender("settings");
          } else {
            showImportStatus("error", "Import fehlgeschlagen: " + result.errors.join(" "));
          }
        };
        reader.onerror = () => showImportStatus("error", "Datei konnte nicht gelesen werden.");
        reader.readAsText(file);
        fileInput.value = "";
      });
    }

    // Reset
    const resetBtn = document.getElementById("btn-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (window.confirm("Wirklich auf die mitgelieferten Standarddaten zurücksetzen?")) {
          Store.resetToDefault();
          reloadDataAndRerender("settings");
          showImportStatus("success", "Zurückgesetzt auf Standarddaten.");
        }
      });
    }

    // Copy AI prompt
    const copyBtn = document.getElementById("btn-copy-prompt");
    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        const text = Store.buildAiPrompt(DATA);
        const original = copyBtn.textContent;
        try {
          await navigator.clipboard.writeText(text);
          copyBtn.textContent = "Kopiert ✓";
        } catch (e) {
          // Fallback für ältere WebViews ohne Clipboard API
          const ta = document.getElementById("ai-prompt-text");
          const range = document.createRange();
          range.selectNodeContents(ta);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          try {
            document.execCommand("copy");
            copyBtn.textContent = "Kopiert ✓";
          } catch (e2) {
            copyBtn.textContent = "Bitte manuell markieren";
          }
          sel.removeAllRanges();
        }
        setTimeout(() => {
          copyBtn.textContent = original;
        }, 1600);
      });
    }
  }

  // ----------------------------------------------------------------------
  // Init
  // ----------------------------------------------------------------------

  applyTheme(Store.getTheme());

  const initialTab = (location.hash || "").replace("#", "");
  goTo(getViewsMeta()[initialTab] ? initialTab : "home");

  // ----------------------------------------------------------------------
  // PWA: service worker + install prompt
  // ----------------------------------------------------------------------

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    });
  }

  let deferredInstallPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const banner = document.createElement("div");
    banner.className = "install-banner show";
    banner.innerHTML = `
      <span class="install-txt">Als App installieren für schnellen Zugriff &amp; Offline-Nutzung.</span>
      <button class="install-btn">Installieren</button>
    `;
    $main.prepend(banner);
    banner.querySelector(".install-btn").addEventListener("click", async () => {
      banner.remove();
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
      }
    });
  });
})();
