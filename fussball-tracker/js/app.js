/**
 * app.js — Fussball Tracker
 * Kleine handgeschriebene SPA ohne Framework: 4 Tabs, gerendert aus APP_DATA.
 */

(() => {
  "use strict";

  const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  const MONTHS_LONG = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

  const $main = document.getElementById("main-content");
  const $eyebrow = document.getElementById("topbar-eyebrow");
  const $title = document.getElementById("topbar-title");
  const $tabButtons = document.querySelectorAll(".tabbar button");

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

  function fmtLong(dateStr) {
    const dt = parseLocal(dateStr, null);
    return `${dt.getDate()}. ${MONTHS_LONG[dt.getMonth()]} ${dt.getFullYear()}`;
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // ----------------------------------------------------------------------
  // Data helpers
  // ----------------------------------------------------------------------

  function nextMatch(list) {
    const now = new Date();
    for (const m of list) {
      const dt = parseLocal(m.date, m.time);
      if (dt.getTime() >= now.getTime() - 3 * 60 * 60 * 1000) return m; // grace period 3h after kickoff
    }
    return null;
  }

  function lastMatch(list) {
    return list && list.length ? list[0] : null;
  }

  function freeBadge(match) {
    return match.isFreeSRF
      ? `<span class="badge free">Gratis SRF</span>`
      : "";
  }

  function opponentLine(match, entityMatchers) {
    const isHome = entityMatchers.some((n) => match.home.includes(n));
    const opponent = isHome ? match.away : match.home;
    const prefix = isHome ? "vs." : "@";
    return { opponent, prefix, isHome };
  }

  function crestInitials(name) {
    return name
      .replace(/^FC |^1\.\s*FC /, "")
      .split(/[\s-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 3);
  }

  // ----------------------------------------------------------------------
  // Renderers — shared pieces
  // ----------------------------------------------------------------------

  function boardRow(match, entityMatchers) {
    const { opponent, prefix } = opponentLine(match, entityMatchers);
    return `
      <div class="board-row">
        <div class="crest">${escapeHtml(crestInitials(opponent))}</div>
        <div class="info">
          <p class="opponent">${prefix} ${escapeHtml(opponent)}</p>
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
          <span class="fixture">${escapeHtml(match.home)} ${match.score ? escapeHtml(match.score) : "–"} ${escapeHtml(match.away)}</span>
          ${goalChip}
        </div>
        <p class="comp">${escapeHtml(match.competition)} · ${fmtShort(match.date)}</p>
        ${match.note ? `<p class="note">${escapeHtml(match.note)}</p>` : ""}
      </div>
    `;
  }

  function newsList(items) {
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
        // force reflow so animation can restart
        void face.offsetWidth;
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

  function countdownCardHtml(cardId, label, match, entityMatchers) {
    if (!match) {
      return `
        <div class="countdown-card">
          <p class="cc-label">${escapeHtml(label)}</p>
          <p class="cc-opponent">Kein Termin in den Daten</p>
        </div>`;
    }
    const { opponent, prefix } = opponentLine(match, entityMatchers);
    return `
      <div class="countdown-card">
        <p class="cc-label">${escapeHtml(label)}</p>
        <p class="cc-opponent">${prefix} ${escapeHtml(opponent)}${freeBadge(match) ? " " + freeBadge(match) : ""}</p>
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
      const now = Date.now();
      let diff = Math.max(0, target - now);
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
    const m = APP_DATA.mbappe;
    const b = APP_DATA.basel;
    const nextM = nextMatch(m.upcomingMatches);
    const nextB = nextMatch(b.upcomingMatches);
    const lastM = lastMatch(m.pastMatches);
    const lastB = lastMatch(b.pastMatches);

    const freeUpcoming = [...m.upcomingMatches, ...b.upcomingMatches].filter((x) => x.isFreeSRF);

    return `
      <div class="view-enter">
        <p class="section-label">Nächste Spiele</p>
        <div class="countdown-wrap">
          ${countdownCardHtml("cd-mbappe", "Mbappé / Real Madrid", nextM, ["Real Madrid"])}
          ${countdownCardHtml("cd-basel", "FC Basel", nextB, ["Basel", "FC Basel"])}
        </div>

        <p class="section-label">Zuletzt</p>
        <div class="chip-row">
          <div class="result-chip">
            <p class="who">Mbappé</p>
            ${
              lastM
                ? `<p class="fixture">${escapeHtml(lastM.home)} – ${escapeHtml(lastM.away)}</p>
                   <p class="score">${escapeHtml(lastM.score)}</p>`
                : `<p class="fixture">Keine Daten</p>`
            }
          </div>
          <div class="result-chip">
            <p class="who">FC Basel</p>
            ${
              lastB
                ? `<p class="fixture">${escapeHtml(lastB.home)} – ${escapeHtml(lastB.away)}</p>
                   <p class="score">${escapeHtml(lastB.score)}</p>`
                : `<p class="fixture">Keine Daten</p>`
            }
          </div>
        </div>

        <p class="section-label">SRF Sport — gratis live</p>
        <div class="card">
          ${
            freeUpcoming.length
              ? freeUpcoming.map((x) => boardRow(x, ["Real Madrid", "Basel", "FC Basel"])).join("")
              : `<p class="status-note" style="margin-top:0;">${escapeHtml(APP_DATA.srf.note)}</p>`
          }
        </div>

        <p class="section-label">News</p>
        <div class="card">
          ${newsList([m.news[0], b.news[0]])}
        </div>

        <p class="footer-note">Stand: ${APP_DATA.meta.lastUpdatedLabel}</p>
      </div>
    `;
  }

  function viewMbappe() {
    const m = APP_DATA.mbappe;
    const p = m.profile;
    const s = m.stats;
    return `
      <div class="view-enter">
        <div class="card profile-card">
          <div class="num">${p.shirt}</div>
          <div>
            <h2>${escapeHtml(p.name)}</h2>
            <p class="tagline">${escapeHtml(p.club)} · ${escapeHtml(p.nationalTeam)} · ${escapeHtml(p.position)}</p>
          </div>
        </div>
        <div class="card">
          <p class="status-note" style="margin-top:0;">${escapeHtml(m.statusNote)}</p>
          <div class="detail-list">
            <div class="item"><div class="k">Geboren</div><div class="v">${escapeHtml(p.born)} (${p.age})</div></div>
            <div class="item"><div class="k">Grösse</div><div class="v">${escapeHtml(p.height)}</div></div>
            <div class="item"><div class="k">Fuss</div><div class="v">${escapeHtml(p.foot)}</div></div>
            <div class="item"><div class="k">Vertrag bis</div><div class="v">${escapeHtml(p.contractUntil)}</div></div>
          </div>
        </div>

        <p class="section-label">Statistiken</p>
        <div class="stat-grid">
          <div class="stat-tile">
            <p class="label">${escapeHtml(s.laliga2526.label)}</p>
            <p class="value">${s.laliga2526.goals} <span style="font-size:13px;color:var(--cream-faint);">Tore</span></p>
            <p class="sub">${s.laliga2526.matches} Spiele · ${s.laliga2526.assists} Assists — ${escapeHtml(s.laliga2526.note)}</p>
          </div>
          <div class="stat-tile">
            <p class="label">${escapeHtml(s.ucl2526.label)}</p>
            <p class="value">${s.ucl2526.goals} <span style="font-size:13px;color:var(--cream-faint);">Tore</span></p>
            <p class="sub">${escapeHtml(s.ucl2526.note)}</p>
          </div>
          <div class="stat-tile">
            <p class="label">${escapeHtml(s.overall2526.label)}</p>
            <p class="value">${s.overall2526.goals} <span style="font-size:13px;color:var(--cream-faint);">Tore</span></p>
            <p class="sub">${s.overall2526.matches} Spiele · ${s.overall2526.assists} Assists</p>
          </div>
          <div class="stat-tile">
            <p class="label">${escapeHtml(s.worldCup2026.label)}</p>
            <p class="value">${s.worldCup2026.goals} <span style="font-size:13px;color:var(--cream-faint);">Tore</span></p>
            <p class="sub">${escapeHtml(s.worldCup2026.note)}</p>
          </div>
        </div>

        <p class="section-label">Kommende Spiele</p>
        ${m.upcomingMatches.map((x) => boardRow(x, ["Real Madrid"])).join("")}

        <p class="section-label">Letzte Spiele &amp; Tore</p>
        ${m.pastMatches.map((x) => resultRow(x, { goalKey: "goalsScored" })).join("")}

        <p class="section-label">News</p>
        <div class="card">${newsList(m.news)}</div>

        <p class="footer-note">Stand: ${APP_DATA.meta.lastUpdatedLabel}</p>
      </div>
    `;
  }

  function viewBasel() {
    const b = APP_DATA.basel;
    const p = b.profile;
    const s = b.stats;
    return `
      <div class="view-enter">
        <div class="card profile-card">
          <div class="num" style="font-size:15px;">FCB</div>
          <div>
            <h2>${escapeHtml(p.name)}</h2>
            <p class="tagline">${escapeHtml(p.stadium)} · Trainer: ${escapeHtml(p.coach)}</p>
          </div>
        </div>
        <div class="card">
          <p class="status-note" style="margin-top:0;">${escapeHtml(b.statusNote)}</p>
          <div class="detail-list">
            <div class="item"><div class="k">Gegründet</div><div class="v">${p.founded}</div></div>
            <div class="item"><div class="k">Präsident</div><div class="v">${escapeHtml(p.president)}</div></div>
            <div class="item"><div class="k">Vorsaison</div><div class="v">Platz ${s.lastSeason.position}</div></div>
            <div class="item"><div class="k">Cup 25/26</div><div class="v">${escapeHtml(s.lastSeason.cup)}</div></div>
          </div>
        </div>

        <p class="section-label">Statistiken</p>
        <div class="stat-grid">
          <div class="stat-tile">
            <p class="label">Topscorer 25/26 (Liga)</p>
            <p class="value">${s.topScorerLastSeason.leagueGoals} <span style="font-size:13px;color:var(--cream-faint);">Tore</span></p>
            <p class="sub">${escapeHtml(s.topScorerLastSeason.name)} — ${s.topScorerLastSeason.allGoals} Tore in allen Wettbewerben</p>
          </div>
          <div class="stat-tile">
            <p class="label">Neuzugänge 26/27</p>
            <p class="value" style="font-size:17px;">${s.newSignings.length}</p>
            <p class="sub">${escapeHtml(s.newSignings.join(", "))} · Rückkehrer: ${escapeHtml(s.returnee)}</p>
          </div>
        </div>

        <p class="section-label">Kommende Spiele</p>
        ${b.upcomingMatches.map((x) => boardRow(x, ["Basel", "FC Basel"])).join("")}

        <p class="section-label">Letzte Spiele</p>
        ${b.pastMatches.map((x) => resultRow(x)).join("")}

        <p class="section-label">News</p>
        <div class="card">${newsList(b.news)}</div>

        <p class="footer-note">Stand: ${APP_DATA.meta.lastUpdatedLabel}</p>
      </div>
    `;
  }

  function viewSRF() {
    const srf = APP_DATA.srf;
    const freeUpcoming = [
      ...APP_DATA.mbappe.upcomingMatches.filter((x) => x.isFreeSRF),
      ...APP_DATA.basel.upcomingMatches.filter((x) => x.isFreeSRF),
      ...srf.upcomingFreeMatches,
    ];

    return `
      <div class="view-enter">
        <div class="card">
          <p class="status-note" style="margin-top:0;">${escapeHtml(srf.intro)}</p>
        </div>

        <p class="section-label">Gratis Live-Spiele — nächste Tage</p>
        <div class="card">
          ${
            freeUpcoming.length
              ? freeUpcoming.map((x) => boardRow(x, ["Real Madrid", "Basel", "FC Basel"])).join("")
              : `<div class="empty-state">${escapeHtml(srf.note)}</div>`
          }
        </div>

        <p class="section-label">Übertragungsrechte im Überblick</p>
        ${srf.rights
          .map(
            (r) => `
          <div class="rights-card">
            <p class="comp-name">${escapeHtml(r.competition)}</p>
            <div class="row"><span class="tag">Rechte</span><span class="val">${escapeHtml(r.holder)}</span></div>
            <div class="row"><span class="tag">SRF</span><span class="val">${escapeHtml(r.srfPart)}</span></div>
            <p class="until">${escapeHtml(r.until)}</p>
          </div>`
          )
          .join("")}

        <p class="footer-note">Stand: ${APP_DATA.meta.lastUpdatedLabel}</p>
      </div>
    `;
  }

  // ----------------------------------------------------------------------
  // Router
  // ----------------------------------------------------------------------

  const VIEWS = {
    home: { title: "Startseite", eyebrow: "Fussball Tracker", render: viewHome },
    mbappe: { title: "Kylian Mbappé", eyebrow: "Spieler-Tracker", render: viewMbappe },
    basel: { title: "FC Basel 1893", eyebrow: "Klub-Tracker", render: viewBasel },
    srf: { title: "SRF Sport", eyebrow: "Gratis Live-Übersicht", render: viewSRF },
  };

  function clearIntervals() {
    activeIntervals.forEach(clearInterval);
    activeIntervals = [];
  }

  function goTo(tab) {
    const view = VIEWS[tab] || VIEWS.home;
    clearIntervals();
    $eyebrow.textContent = view.eyebrow;
    $title.textContent = view.title;
    $main.innerHTML = view.render();

    $tabButtons.forEach((btn) => {
      const on = btn.dataset.tab === tab;
      btn.classList.toggle("active", on);
      if (on) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });

    if (tab === "home") {
      startCountdownTicker("cd-mbappe", nextMatch(APP_DATA.mbappe.upcomingMatches));
      startCountdownTicker("cd-basel", nextMatch(APP_DATA.basel.upcomingMatches));
    }

    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    try {
      history.replaceState(null, "", "#" + tab);
    } catch (e) {
      /* ignore */
    }
  }

  $tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => goTo(btn.dataset.tab));
  });

  const initialTab = (location.hash || "").replace("#", "");
  goTo(VIEWS[initialTab] ? initialTab : "home");

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
