import { profile as demoProfile, today as demoToday, series as demoSeries, trendCards as demoTrendCards, workouts as demoWorkouts, sleepTimeline as demoSleepTimeline } from "./data/demo-data.js";
import { scoreState } from "./scores/calculate.js";
import { platformAdapter } from "./bridge/shell-adapter.js";
import { healthAdapter } from "./health/health-adapter.js";
import { normalizeHealthImport } from "./health/normalization.js";
import { cacheKey, derivedCache } from "./storage/derived-cache.js";

let profile = { ...demoProfile };
let today = { ...demoToday };
let series = { ...demoSeries };
let trendCards = [...demoTrendCards];
let workouts = [...demoWorkouts];
let sleepTimeline = [...demoSleepTimeline];

const root = document.documentElement;
const app = document.querySelector("#app");
const storedTheme = localStorage.getItem("fittrack:theme") || "system";

const state = {
  tab: "today",
  detail: null,
  range: "28 Tage",
  workout: null,
  modal: null,
  onboardingStep: 0,
  theme: storedTheme,
  sync: "current",
  dataMode: "demo",
  healthStatus: null,
  toast: "",
  workoutFilter: "Alle"
};

const navItems = [
  ["today", "Heute", "home"],
  ["trends", "Trends", "chart"],
  ["workouts", "Workouts", "activity"],
  ["settings", "Einstellungen", "settings"]
];

const icons = {
  home: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5m0 14h16M7 15l4-4 3 2 5-6"/></svg>`,
  activity: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2.1-6 4 12 2-6H21"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56v.08h-3v-.08A1.7 1.7 0 0 0 10.68 18.7a1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 15.04a1.7 1.7 0 0 0-1.56-1.03h-.08v-3h.08A1.7 1.7 0 0 0 7 9.98a1.7 1.7 0 0 0-.34-1.88L6.6 8.04l2.12-2.12.06.06A1.7 1.7 0 0 0 10.66 6.3a1.7 1.7 0 0 0 1.03-1.56v-.08h3v.08A1.7 1.7 0 0 0 15.72 6.3a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06A1.7 1.7 0 0 0 19.38 10a1.7 1.7 0 0 0 1.56 1.03h.08v3h-.08A1.7 1.7 0 0 0 19.4 15Z"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>`,
  sync: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4.2 4.2L19 6.5"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>`,
  info: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8v.01"/></svg>`,
  close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 15.7A8.7 8.7 0 0 1 8.3 3.6 8.8 8.8 0 1 0 20.4 15.7Z"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`
};

function icon(name) { return `<span class="icon icon-${name}">${icons[name]}</span>`; }
function titleCase(value) { return value.charAt(0).toUpperCase() + value.slice(1); }
function toneFor(score, type) { return scoreState(score, type).tone; }
function getTheme() { return state.theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : state.theme; }

function applyTheme() {
  root.dataset.theme = getTheme();
  root.style.colorScheme = getTheme();
  localStorage.setItem("fittrack:theme", state.theme);
}

function scoreRing(value, type = "recovery", size = "large") {
  const stateForScore = scoreState(value, type);
  if (!Number.isFinite(value)) return `<div class="score-ring ${size} neutral" aria-label="Keine ausreichenden Daten"><strong>–</strong></div>`;
  const radius = size === "large" ? 52 : 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);
  return `<div class="score-ring ${size} ${stateForScore.tone}" aria-label="${value} von 100, ${stateForScore.label}">
    <svg viewBox="0 0 128 128" role="img">
      <circle class="ring-track" cx="64" cy="64" r="${radius}" />
      <circle class="ring-progress" cx="64" cy="64" r="${radius}" style="stroke-dasharray:${circumference};stroke-dashoffset:${offset}" />
    </svg>
    <strong>${value}</strong>
  </div>`;
}

function lineChart(values, tone = "great", label = "Verlauf") {
  const chartValues = (values || []).filter(Number.isFinite);
  if (!chartValues.length) return `<div class="chart-empty">Noch nicht genügend Daten für einen Verlauf.</div>`;
  if (chartValues.length === 1) chartValues.push(chartValues[0]);
  const width = 340;
  const height = 112;
  const inset = 8;
  const min = Math.min(...chartValues) - 4;
  const max = Math.max(...chartValues) + 4;
  const points = chartValues.map((value, index) => {
    const x = inset + (index * (width - inset * 2)) / (chartValues.length - 1);
    const y = height - inset - ((value - min) / (max - min || 1)) * (height - inset * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `${inset},${height - inset} ${points.join(" ")} ${width - inset},${height - inset}`;
  return `<div class="line-chart ${tone}" role="img" aria-label="${label}">
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <line x1="8" y1="35" x2="332" y2="35" class="chart-guide" />
      <line x1="8" y1="78" x2="332" y2="78" class="chart-guide" />
      <polygon points="${area}" class="chart-fill" />
      <polyline points="${points.join(" ")}" class="chart-line" />
      ${points.map((point, index) => `<circle cx="${point.split(",")[0]}" cy="${point.split(",")[1]}" r="${index === points.length - 1 ? 4 : 2.5}" class="chart-point"/>`).join("")}
    </svg>
  </div>`;
}

function nav(markupClass = "") {
  return `<nav class="${markupClass}" aria-label="Hauptnavigation">
    ${navItems.map(([key, label, glyph]) => `<button class="nav-item ${state.tab === key && !state.detail ? "is-active" : ""}" data-action="nav" data-tab="${key}" aria-current="${state.tab === key && !state.detail ? "page" : "false"}">${icon(glyph)}<span>${label}</span></button>`).join("")}
  </nav>`;
}

function sectionTitle(eyebrow, heading, action = "") {
  return `<div class="section-heading"><div><p class="eyebrow">${eyebrow}</p><h2>${heading}</h2></div>${action}</div>`;
}

function scoreTile(type, value, label, detailAction) {
  const tone = toneFor(value, type);
  return `<button class="score-tile ${tone}" data-action="detail" data-detail="${detailAction}">
    <span class="score-tile-label">${type === "recovery" ? "Recovery" : titleCase(type)}</span>
    <strong>${Number.isFinite(value) ? value : "–"}</strong>
    <span class="status-line"><i></i>${label}</span>
    <span class="tile-open">Details ${icon("chevron")}</span>
  </button>`;
}

function factorRow(factor, expanded = false) {
  const effect = factor.effect === "positive" ? "positiv" : factor.effect === "negative" ? "leicht belastend" : "normal";
  return `<article class="factor-row ${factor.effect}">
    <div class="factor-effect" aria-label="${effect}"><span>${factor.arrow}</span></div>
    <div class="factor-main"><strong>${factor.name}</strong><span>${effect}</span>${expanded ? `<p>${factor.detail}</p>` : ""}</div>
    <div class="factor-value"><strong>${factor.value}</strong><span>${factor.delta}</span>${expanded ? `<small>Baseline: ${factor.baseline}</small>` : ""}</div>
  </article>`;
}

function browserNote() {
  return `<button class="browser-note" data-action="show-browser-info">${icon("info")}<span><strong>Browsermodus</strong> Health Connect ist in der Android-App verfügbar.</span>${icon("chevron")}</button>`;
}

function renderToday() {
  const sleepStatus = scoreState(today.sleep, "sleep").label;
  const loadStatus = scoreState(today.load, "load").label;
  const recoveryValue = Number.isFinite(today.recovery) ? today.recovery : "–";
  const confidence = today.confidence === "high" ? "Hohe" : today.confidence === "medium" ? "Mittlere" : "Aufbauende";
  const latestWorkout = workouts.find((workout) => workout.id === today.latestWorkoutId);
  return `<div class="view view-today enter">
    <section class="recovery-hero">
      <div class="hero-copy">
        <div class="eyebrow-row"><p class="eyebrow">Recovery</p><span class="confidence">${icon("check")} ${confidence} Sicherheit</span></div>
        <div class="hero-score-mobile">${scoreRing(today.recovery)}</div>
        <h1><span>${recoveryValue}</span>${scoreState(today.recovery).label}</h1>
        <p class="hero-explanation">${today.isLive ? "Deine Recovery wird aus den auf diesem Gerät synchronisierten Schlaf-, Herz- und Belastungsdaten berechnet." : "Verbinde Health Connect, um deine persönliche Recovery aus echten Messdaten zu berechnen."}</p>
        <div class="hero-meta"><span>${today.delta === null ? "Baseline wird aufgebaut" : `${today.delta >= 0 ? "↑" : "↓"} ${Math.abs(today.delta)} zu gestern`}</span><span>Aktualisiert ${today.updatedAt}</span></div>
        <button class="text-button" data-action="detail" data-detail="recovery">Recovery ansehen ${icon("chevron")}</button>
      </div>
      <div class="hero-ring">${scoreRing(today.recovery)}</div>
      <div class="hero-orbit"><span>${profile.populatedDays}</span><small>Tage Baseline</small></div>
    </section>

    <section class="score-overview" aria-label="Tageswerte">
      ${scoreTile("sleep", today.sleep, sleepStatus, "sleep")}
      ${scoreTile("load", today.load, loadStatus, "load")}
      <button class="score-tile target-tile" data-action="detail" data-detail="load"><span class="score-tile-label">Zielbereich</span><strong>${today.target}</strong><span class="status-line"><i></i>Für heute</span><span class="tile-open">Load ansehen ${icon("chevron")}</span></button>
    </section>

    <div class="today-columns">
      <section class="recommendation panel-lite">
        <div class="recommendation-mark">${icon("activity")}</div>
        <div><p class="eyebrow">Empfehlung für heute</p><h2>${today.recommendation}</h2><p>${today.recommendationDetail}</p><small>${icon("info")} Keine medizinische Aussage.</small></div>
      </section>
      <section class="influences">
        ${sectionTitle("Recovery", "Was dich heute beeinflusst", `<button class="text-button compact" data-action="detail" data-detail="recovery">Alle Faktoren ${icon("chevron")}</button>`)}
        <div class="factor-list">${today.factors.map((factor) => factorRow(factor)).join("")}</div>
      </section>
    </div>

    <div class="today-columns lower">
      <section class="insights">
        ${sectionTitle("Objektive Daten", "Deine Insights")}
        <ul class="insight-list">${today.insights.map((insight) => `<li>${icon("info")}<span>${insight}</span></li>`).join("")}</ul>
      </section>
      <section class="last-workout">
        ${sectionTitle("Automatisch importiert", "Letztes Training", latestWorkout ? `<button class="text-button compact" data-action="workout" data-workout="${latestWorkout.id}">Workout ansehen ${icon("chevron")}</button>` : "")}
        ${latestWorkout ? `<div class="workout-summary"><div class="workout-symbol">${icon("activity")}</div><div><strong>${latestWorkout.type}</strong><span>${latestWorkout.day} · ${latestWorkout.duration}</span></div><div class="workout-stats"><strong>Load ${latestWorkout.load}</strong><span>${latestWorkout.averageHr ? `Ø ${latestWorkout.averageHr} bpm` : "Puls fehlt"}</span></div></div>` : `<div class="empty-state">Noch kein Workout in den synchronisierten Daten.</div>`}
      </section>
    </div>
    ${!platformAdapter.isNative() ? browserNote() : ""}
  </div>`;
}

function metricBlock(label, value, detail) {
  return `<div class="metric-block"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`;
}

function detailHeader(name, value, type) {
  const status = scoreState(value, type);
  return `<div class="detail-intro enter"><button class="back-button" data-action="back">${icon("arrow")} Heute</button><div class="detail-score"><div><p class="eyebrow">${name}</p><h1>${Number.isFinite(value) ? value : "–"} <span>· ${status.label}</span></h1><p>Heute im Vergleich zu deiner persönlichen 28-Tage-Baseline.</p></div>${scoreRing(value, type)}</div></div>`;
}

function renderRecovery() {
  return `<div class="view detail-view">
    ${detailHeader("Recovery", today.recovery, "recovery")}
    <section class="chart-panel enter delay-1"><div class="chart-panel-head"><div><h2>Recovery-Verlauf</h2><span>Letzte synchronisierte Tage</span></div><span class="positive-change">${today.delta === null ? "Baseline im Aufbau" : `${today.delta >= 0 ? "↑" : "↓"} ${Math.abs(today.delta)} zu gestern`}</span></div>${lineChart(series.recovery, "great", "Recovery der vergangenen sieben Tage")}<div class="chart-axis"><span>Älter</span><span>Heute</span></div><div class="segmented mini"><button class="is-active">7 Tage</button><button>28 Tage</button><button>3 Monate</button><button>6 Monate</button></div></section>
    <section class="detail-grid enter delay-2"><div><div class="section-heading"><div><p class="eyebrow">Nachvollziehbar</p><h2>Faktoren</h2></div><span class="data-quality">${today.completeness}% vollständig</span></div><div class="factor-list expanded">${today.factors.map((factor) => factorRow(factor, true)).join("")}</div></div><aside class="explain-panel"><p class="eyebrow">Deine Berechnung</p><h3>${today.confidence === "high" ? "Hohe Datensicherheit" : "Baseline wird aufgebaut"}</h3><p>Verwendet werden ausschliesslich die lokal synchronisierten Werte, die Health Connect bereitgestellt hat.</p><div class="weight-bars"><span style="--w:35%">HRV <b>35 %</b></span><span style="--w:25%">Schlaf <b>25 %</b></span><span style="--w:20%">Ruhepuls <b>20 %</b></span><span style="--w:20%">Belastung <b>20 %</b></span></div><small>Algorithmus v1 · ${today.updatedAt}</small></aside></section>
  </div>`;
}

function renderSleep() {
  const session = today.sleepSession;
  const sleepStart = session ? new Intl.DateTimeFormat("de-CH", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(session.startTime)) : "–";
  const sleepEnd = session ? new Intl.DateTimeFormat("de-CH", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(session.endTime)) : "–";
  const stageCount = session?.stages?.length || 0;
  return `<div class="view detail-view">
    ${detailHeader("Sleep", today.sleep, "sleep")}
    <section class="sleep-metrics enter delay-1">${metricBlock("Geschlafen", today.sleepMinutes === null ? "–" : `${Math.floor(today.sleepMinutes / 60)} h ${String(Math.round(today.sleepMinutes % 60)).padStart(2, "0")}`, today.sleepMinutes === null ? "keine Sitzung" : `${Math.abs(Math.round(today.sleepMinutes - today.sleepNeedMinutes))} min ${today.sleepMinutes >= today.sleepNeedMinutes ? "über" : "unter"} Bedarf`)}${metricBlock("Schlafbedarf", `${Math.floor(today.sleepNeedMinutes / 60)} h ${String(today.sleepNeedMinutes % 60).padStart(2, "0")}`, "aus Basis & Belastung")}${metricBlock("Schlafphasen", stageCount ? `${stageCount}` : "–", stageCount ? "von Health Connect" : "nicht geliefert")}${metricBlock("Datenqualität", `${today.completeness}%`, "für heutige Scores")}</section>
    <section class="sleep-panel enter delay-2"><div class="section-heading"><div><p class="eyebrow">Letzte Schlafsession</p><h2>Schlafzeitlinie</h2></div><span class="measured">${stageCount ? `${icon("check")} Gemessene Phasen` : "Keine Phasen geliefert"}</span></div><div class="sleep-times"><span>${sleepStart}</span><span>${sleepEnd}</span></div>${stageCount ? `<div class="sleep-track">${sleepTimeline.map(([from, to, kind]) => `<span class="sleep-stage ${kind}" style="left:${from}%;width:${to - from}%" title="${kind}"></span>`).join("")}</div><div class="sleep-legend"><span><i class="awake"></i>Wach</span><span><i class="light"></i>Leicht</span><span><i class="deep"></i>Tief</span><span><i class="rem"></i>REM</span></div>` : `<div class="chart-empty">Health Connect hat für diese Schlafsession keine Phasen geliefert.</div>`}</section>
    <section class="detail-grid sleep-bottom enter delay-3"><div class="chart-panel"><div class="chart-panel-head"><div><h2>Sleep-Verlauf</h2><span>Letzte synchronisierte Tage</span></div></div>${lineChart(series.sleep, "great", "Sleep score Verlauf")}</div><aside class="explain-panel"><p class="eyebrow">Schlafbedarf</p><h3>${Math.floor(today.sleepNeedMinutes / 60)} h ${String(today.sleepNeedMinutes % 60).padStart(2, "0")}</h3><p>Dein Bedarf basiert auf einer lokalen, konfigurierbaren Regel und wird ohne geschätzte Schlafphasen berechnet.</p><small>Schlafphasen werden nur gezeigt, wenn Health Connect sie liefert.</small></aside></section>
  </div>`;
}

function renderLoad() {
  const loadState = scoreState(today.load, "load");
  const marker = Number.isFinite(today.load) ? Math.min(96, Math.max(4, today.load)) : 0;
  return `<div class="view detail-view">
    ${detailHeader("Load", today.load, "load")}
    <section class="load-hero enter delay-1"><div><p class="eyebrow">Heute</p><h2>${loadState.label} belastet</h2><p>Empfohlener Bereich heute: <strong>${today.target}</strong></p></div><div class="load-scale"><span class="target-range"></span>${marker ? `<i style="left:${marker}%"></i>` : ""}<div><small>leicht</small><small>moderat</small><small>hoch</small><small>sehr hoch</small></div></div></section>
    <section class="detail-grid enter delay-2"><div class="chart-panel"><div class="chart-panel-head"><div><h2>Belastungsverlauf</h2><span>Workouts und Alltagsbewegung</span></div><strong>${Number.isFinite(today.load) ? `${today.load} Load` : "–"}</strong></div>${lineChart(series.load, "reduced", "Tagesbelastung")}</div><aside class="load-components"><p class="eyebrow">Bestandteile</p><div><span>Workouts</span><b>${workouts.filter((workout) => workout.day === "Heute").reduce((sum, workout) => sum + workout.load, 0)}</b></div><div><span>Alltagsbewegung</span><b>in Load enthalten</b></div><div><span>Herzfrequenz</span><b>falls verfügbar</b></div><div><span>Restbelastung</span><b>lokal berechnet</b></div></aside></section>
    <section class="week-load enter delay-3"><div><p class="eyebrow">Diese Woche</p><h2>Aktuelle Belastung</h2></div>${metricBlock("Heute", Number.isFinite(today.load) ? `${today.load}` : "–", "Load")}${metricBlock("Letzte Tage", `${Math.round(series.load.reduce((sum, value) => sum + value, 0))}`, "synchronisierte Werte")}</section>
  </div>`;
}

function renderTrends() {
  const weekRecovery = series.recovery.length ? Math.round(series.recovery.reduce((sum, value) => sum + value, 0) / series.recovery.length) : "–";
  const weekSleep = series.sleep.length ? Math.round(series.sleep.reduce((sum, value) => sum + value, 0) / series.sleep.length) : "–";
  const weekLoad = series.load.reduce((sum, value) => sum + value, 0);
  return `<div class="view view-trends enter">
    <div class="page-heading"><div><p class="eyebrow">Deine Entwicklung</p><h1>Trends</h1><p>Wenige klare Signale statt Rohdatenüberladung.</p></div><div class="segmented range-switch" role="group" aria-label="Zeitraum">${["7 Tage", "28 Tage", "3 Monate", "6 Monate", "1 Jahr"].map((range) => `<button data-action="range" data-range="${range}" class="${state.range === range ? "is-active" : ""}">${range}</button>`).join("")}</div></div>
    <section class="trend-grid">${trendCards.map((trend, index) => `<button class="trend-item ${trend.tone} enter delay-${Math.min(index + 1, 3)}" data-action="trend-detail" data-detail="${trend.key}"><div><span>${trend.name}</span><strong>${trend.value}</strong></div>${lineChart(series[trend.key] || series.recovery, trend.tone, `${trend.name} Verlauf`)}<footer><b>${trend.change}</b><small>${trend.unit}</small>${icon("chevron")}</footer></button>`).join("")}</section>
    <section class="weekly-review"><div class="weekly-copy"><p class="eyebrow">Automatischer Rückblick</p><h2>Deine Woche</h2><p>Diese Zusammenfassung verwendet nur die aktuell von Health Connect synchronisierten Messwerte.</p></div><div class="week-numbers"><div><span>Recovery</span><strong>Ø ${weekRecovery}</strong><b>${series.recovery.length} Tage</b></div><div><span>Sleep</span><strong>Ø ${weekSleep}</strong><b>${series.sleep.length} Tage</b></div><div><span>Load</span><strong>${weekLoad || "–"}</strong><b>${series.load.length} Tage</b></div></div></section>
  </div>`;
}

function workoutTypeIcon(type) {
  const initial = type === "Krafttraining" ? "K" : type === "Laufen" ? "L" : type === "Spaziergang" ? "S" : "G";
  return `<span class="workout-type-icon">${initial}</span>`;
}

function renderWorkouts() {
  const filters = ["Alle", "Krafttraining", "Laufen", "Radfahren", "Gehen", "Andere"];
  const visible = workouts.filter((workout) => state.workoutFilter === "Alle" || workout.type === state.workoutFilter || (state.workoutFilter === "Gehen" && ["Gehen", "Spaziergang"].includes(workout.type)));
  const grouped = visible.reduce((groups, workout) => ({ ...groups, [workout.day]: [...(groups[workout.day] || []), workout] }), {});
  return `<div class="view view-workouts enter"><div class="page-heading"><div><p class="eyebrow">Automatisch importiert</p><h1>Workouts</h1><p>Belastung aus Health Connect und Garmin-Daten.</p></div><button class="sync-square" data-action="sync" aria-label="Daten aktualisieren">${icon("sync")}</button></div><div class="filter-row" role="group" aria-label="Workout Filter">${filters.map((filter) => `<button data-action="workout-filter" data-filter="${filter}" class="${state.workoutFilter === filter ? "is-active" : ""}">${filter}</button>`).join("")}</div><section class="workout-list">${Object.entries(grouped).map(([day, dayWorkouts]) => `<div class="workout-day"><p class="eyebrow">${day}</p>${dayWorkouts.map((workout) => `<button class="workout-row" data-action="workout" data-workout="${workout.id}">${workoutTypeIcon(workout.type)}<div><strong>${workout.type}</strong><span>${workout.time} · ${workout.duration}</span></div><div class="workout-load"><b>Load ${workout.load}</b><span>${workout.averageHr} bpm</span></div>${icon("chevron")}</button>`).join("")}</div>`).join("")}${!visible.length ? `<div class="empty-state">Keine Trainings für diesen Filter.</div>` : ""}</section></div>`;
}

function settingRow(label, value, action = "", muted = false) {
  return `<div class="setting-row ${muted ? "muted" : ""}"><span>${label}</span><div><b>${value}</b>${action}</div></div>`;
}

function renderSettings() {
  const running = state.sync === "syncing";
  const isNative = platformAdapter.isNative();
  const connected = state.dataMode === "live";
  const allowed = (group) => state.healthStatus?.grantedGroups?.includes(group);
  return `<div class="view view-settings enter"><div class="page-heading"><div><p class="eyebrow">FitTrack</p><h1>Einstellungen</h1><p>Deine Datenquellen und App-Verbindung.</p></div></div>
    <section class="settings-section"><div class="settings-head"><div><p class="eyebrow">Datenquellen</p><h2>Verbindungen</h2></div><button class="outline-button" data-action="sync" ${running ? "disabled" : ""}>${icon("sync")}${running ? "Wird aktualisiert" : "Jetzt synchronisieren"}</button></div>${settingRow("Health Connect", connected ? "Synchronisiert" : isNative ? "Bereit für Sync" : "Nur in Android-App", `<button data-action="permissions">Verwalten</button>`, !isNative)}${settingRow("Garmin Connect", connected ? "Daten importiert" : "Wird nach Sync erkannt")}${settingRow("FitTrack Konto", "Demo-Modus", `<button data-action="show-login">Anmelden</button>`)}${settingRow("Gemeinsames Gewicht", "Wird intern synchronisiert")}</section>
    <section class="settings-section"><div class="settings-head"><div><p class="eyebrow">Berechtigungen</p><h2>Gesundheitsdaten</h2></div></div><div class="permission-grid">${[["Schlaf", allowed("sleep")], ["Herzfrequenz und HRV", allowed("recovery")], ["Aktivität", allowed("activity")], ["Workouts", allowed("workouts")], ["Gewicht", allowed("weight")], ["Hintergrundzugriff", false]].map(([label, isAllowed]) => { const value = isAllowed ? "Erlaubt" : label === "Hintergrundzugriff" ? "Nicht verwendet" : state.healthStatus ? "Nicht erlaubt" : "Nicht geprüft"; return `<div><span>${label}</span><b class="${value === "Erlaubt" ? "allowed" : "neutral"}">${value === "Erlaubt" ? icon("check") : ""}${value}</b></div>`; }).join("")}</div></section>
    <section class="settings-section"><div class="settings-head"><div><p class="eyebrow">Darstellung</p><h2>Erscheinungsbild</h2></div></div><div class="theme-choice" role="group" aria-label="Farbschema">${[["system", "System"], ["dark", "Dunkel"], ["light", "Hell"]].map(([value, label]) => `<button data-action="theme" data-theme="${value}" class="${state.theme === value ? "is-active" : ""}">${value === "dark" ? icon("moon") : value === "light" ? icon("sun") : icon("settings")} ${label}</button>`).join("")}</div></section>
    <section class="settings-section app-info"><div class="settings-head"><div><p class="eyebrow">App</p><h2>Version & Updates</h2></div></div>${settingRow("Web-App", "1.0.0")}${settingRow("Shell", isNative ? "Android erkannt" : "Browsermodus")}${settingRow("Bridge", isNative ? "Wird geprüft" : "Nicht verfügbar")}${settingRow("Letzte Aktualisierung", `Heute · ${today.updatedAt}`)}<div class="setting-actions"><button class="outline-button" data-action="check-update">Nach Updates suchen</button><button class="quiet-button" data-action="onboarding">Einrichtung ansehen</button></div></section>
    ${!isNative ? browserNote() : ""}
  </div>`;
}

function renderMain() {
  if (state.detail === "recovery") return renderRecovery();
  if (state.detail === "sleep") return renderSleep();
  if (state.detail === "load") return renderLoad();
  if (state.tab === "trends") return renderTrends();
  if (state.tab === "workouts") return renderWorkouts();
  if (state.tab === "settings") return renderSettings();
  return renderToday();
}

function renderSideStatus() {
  return `<aside class="context-rail"><div class="rail-card current"><p class="eyebrow">Heute</p><strong>${scoreState(today.recovery).label}</strong><span>${Number.isFinite(today.recovery) ? `${today.recovery} Recovery` : "Daten werden gelesen"}</span><div class="rail-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div><div class="rail-card"><p class="eyebrow">Deine Baseline</p><strong>${profile.populatedDays >= 28 ? "Vollständig" : "Im Aufbau"}</strong><span>${profile.populatedDays} von 28 Tagen</span><div class="baseline-progress"><i style="width:${Math.min(100, (profile.populatedDays / 28) * 100)}%"></i></div></div><div class="rail-note">${icon("lock")} Deine Gesundheitsdaten bleiben auf deinem Gerät.</div></aside>`;
}

function renderHeader() {
  const syncCopy = state.sync === "syncing" ? "Wird aktualisiert …" : state.sync === "offline" ? "Offline" : `Aktuell · ${today.updatedAt}`;
  return `<header class="topbar"><div><p class="greeting">Guten Morgen, ${profile.firstName}</p><span>${today.date}</span></div><div class="topbar-actions"><button class="sync-state ${state.sync}" data-action="sync" aria-label="Synchronisationsstatus: ${syncCopy}"><i></i>${syncCopy}</button><button class="theme-icon" data-action="toggle-theme" aria-label="Farbschema wechseln">${getTheme() === "dark" ? icon("sun") : icon("moon")}</button></div></header>`;
}

function renderModal() {
  if (state.modal === "workout") {
    const workout = workouts.find((item) => item.id === state.workout) || workouts[1];
    return `<div class="modal-backdrop" data-action="close-modal"><section class="sheet workout-sheet" role="dialog" aria-modal="true" aria-label="Workout Details" onclick="event.stopPropagation()"><button class="close-button" data-action="close-modal">${icon("close")}</button><div class="sheet-hero">${workoutTypeIcon(workout.type)}<p class="eyebrow">${workout.day} · ${workout.time}</p><h2>${workout.type}</h2><p>${workout.duration} · Load ${workout.load}</p></div><div class="workout-kpis">${metricBlock("Aktive Kalorien", workout.calories || "–", workout.calories ? "kcal" : "nicht geliefert")}${metricBlock("Distanz", workout.distance, "gemessen")}${metricBlock("Ø Herzfrequenz", workout.averageHr || "–", workout.averageHr ? "bpm" : "nicht geliefert")}${metricBlock("Maximum", workout.maxHr || "–", workout.maxHr ? "bpm" : "nicht geliefert")}</div><section class="workout-interpretation"><p class="eyebrow">Einordnung</p><h3>${workout.contribution}</h3><p>Dieses Workout trägt ${workout.load} Punkte zu deiner heutigen Load bei. Fehlende Herzfrequenzwerte werden nicht geschätzt.</p></section><section class="zones"><div class="section-heading"><div><p class="eyebrow">Herzfrequenz</p><h3>Zonen</h3></div><span>${workout.duration}</span></div>${workout.zones.length ? `<div class="zone-bars">${workout.zones.map((zone, index) => `<div><span>Zone ${index + 1}</span><i style="--zone:${Math.max(zone, 3)}%"></i><b>${zone} min</b></div>`).join("")}</div>` : `<div class="chart-empty">Für dieses Workout wurden keine Herzfrequenzzonen geliefert.</div>`}</section></section></div>`;
  }
  if (state.modal === "browser") return `<div class="modal-backdrop" data-action="close-modal"><section class="sheet small-sheet" role="dialog" aria-modal="true"><button class="close-button" data-action="close-modal">${icon("close")}</button>${icon("activity")}<p class="eyebrow">Browsermodus</p><h2>Health Connect braucht die Android-App.</h2><p>Im Browser zeigt FitTrack vorhandene Web-Caches sowie Demo- und Entwicklungsdaten. Direkte Health-Connect-Abfragen sind nur in der installierten Android-App möglich.</p><button class="primary-button" data-action="close-modal">Verstanden</button></section></div>`;
  if (state.modal === "login") return `<div class="modal-backdrop" data-action="close-modal"><section class="sheet login-sheet" role="dialog" aria-modal="true"><button class="close-button" data-action="close-modal">${icon("close")}</button><p class="eyebrow">Mit FitTrack anmelden</p><h2>Ein Konto für Nutrition und Fitness.</h2><p>Nutze denselben Account wie in der Nutrition-App.</p><label>E-Mail<input type="email" placeholder="name@beispiel.ch" /></label><label>Passwort<input type="password" placeholder="••••••••" /></label><button class="primary-button" data-action="demo-login">Demo anmelden</button><small>${icon("lock")} Zugangsdaten werden nur über die konfigurierte Supabase-Verbindung verarbeitet.</small></section></div>`;
  if (state.modal === "onboarding") return renderOnboarding();
  return "";
}

function renderOnboarding() {
  const steps = [
    { eyebrow: "Willkommen bei FitTrack", title: "Deine Garmin-Daten. Endlich verständlich.", text: "FitTrack verwandelt Schlaf, HRV, Ruhepuls und Training in tägliche Recovery-, Sleep- und Load-Bewertungen.", action: "FitTrack einrichten", art: "welcome" },
    { eyebrow: "Mit FitTrack anmelden", title: "Dein Konto bleibt dein Konto.", text: "Nutze denselben Account wie in der Nutrition-App. Gewicht wird nur intern mit deinem bestehenden FitTrack-Konto synchronisiert.", action: "Weiter", art: "login" },
    { eyebrow: "Garmin-Daten verbinden", title: "Health Connect ist deine private Datenbrücke.", text: "Schlaf, Herzfrequenz, HRV, Schritte und Workouts werden nicht zu Supabase hochgeladen.", action: "Mit Health Connect verbinden", alternate: "Später", art: "health" },
    { eyebrow: "Persönliche Baseline", title: "Mit älteren Daten schneller verstehen, was normal ist.", text: "FitTrack verwendet historische Daten nur auf deinem Gerät, um deine persönliche Baseline aufzubauen.", action: "Vergangene Daten erlauben", alternate: "Mit aktuellen Daten starten", art: "history" },
    { eyebrow: "FitTrack wird vorbereitet", title: state.dataMode === "live" ? "Deine erste Auswertung ist bereit." : "Deine Daten werden geprüft.", text: state.dataMode === "live" ? `Health Connect synchronisiert · ${profile.populatedDays} Tage für deine persönliche Baseline gefunden.` : "Health Connect ist verbunden. Sobald Daten von deiner Quelle vorliegen, erstellt FitTrack die erste Auswertung.", action: "Zur Heute-Ansicht", art: "ready" }
  ];
  const step = steps[state.onboardingStep];
  return `<div class="modal-backdrop onboarding-backdrop"><section class="onboarding-sheet" role="dialog" aria-modal="true"><button class="close-button onboarding-close" data-action="close-modal">${icon("close")}</button><div class="onboarding-art ${step.art}"><div class="onboarding-orbit orbit-a"></div><div class="onboarding-orbit orbit-b"></div>${scoreRing(state.onboardingStep === 4 ? 78 : [0, 28, 54, 68, 100][state.onboardingStep], "recovery")}</div><div class="onboarding-content"><div class="step-dots">${steps.map((_, index) => `<i class="${index === state.onboardingStep ? "active" : index < state.onboardingStep ? "done" : ""}"></i>`).join("")}</div><p class="eyebrow">${step.eyebrow}</p><h2>${step.title}</h2><p>${step.text}</p>${state.onboardingStep === 1 ? `<label>E-Mail<input type="email" placeholder="name@beispiel.ch" /></label><label>Passwort<input type="password" placeholder="••••••••" /></label>` : ""}<button class="primary-button" data-action="onboarding-next">${step.action}</button>${step.alternate ? `<button class="quiet-button wide" data-action="onboarding-alternate">${step.alternate}</button>` : ""}<small>${state.onboardingStep === 2 ? `${icon("lock")} Die Health-Connect-Abfrage wird erst nach dieser Erklärung geöffnet.` : ""}</small></div></section></div>`;
}

function render() {
  applyTheme();
  app.innerHTML = `<div class="app-shell"><aside class="side-rail"><a class="brand" href="#" data-action="nav" data-tab="today"><span>F</span>FitTrack<small>Fitness</small></a>${nav("side-nav")}<div class="side-footer"><button data-action="onboarding" class="setup-link">${icon("settings")} Einrichtung</button><span>v1.0.0</span></div></aside><div class="workspace">${renderHeader()}<main class="main-content">${renderMain()}</main></div>${renderSideStatus()}${nav("mobile-nav")}</div>${renderModal()}${state.toast ? `<div class="toast">${icon("check")} ${state.toast}</div>` : ""}`;
}

function showToast(message) {
  state.toast = message;
  render();
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => { state.toast = ""; render(); }, 3100);
}

async function applyHealthImport(result) {
  const normalized = normalizeHealthImport(result);
  if (!normalized) return false;
  profile = normalized.profile;
  today = normalized.today;
  series = normalized.series;
  trendCards = normalized.trendCards;
  workouts = normalized.workouts;
  sleepTimeline = normalized.sleepTimeline;
  state.dataMode = "live";
  const key = cacheKey({ userId: "local", date: result.range.endDate, calculationType: "health-import", algorithmVersion: 1, sourceRevision: result.range.endDate });
  await derivedCache.set(key, normalized).catch(() => {});
  return true;
}

async function synchronize({ initial = false, quiet = false } = {}) {
  if (state.sync === "syncing") return;
  state.sync = "syncing";
  render();
  const result = await healthAdapter.synchronize({ days: initial ? 90 : 35 });
  state.sync = "current";
  state.healthStatus = result.status || state.healthStatus;
  const imported = result.updated ? await applyHealthImport(result) : false;
  render();
  if (quiet) return;
  if (result.reason === "browser") showToast("Browsermodus: lokale Demo- und Cache-Daten bleiben verfügbar.");
  else if (!result.updated) showToast(`Health Connect konnte nicht synchronisiert werden: ${result.reason || "unbekannter Fehler"}.`);
  else if (!imported) showToast("Health Connect ist verbunden, hat in diesem Zeitraum aber noch keine FitTrack-Daten geliefert.");
  else showToast(`Daten aktualisiert · ${profile.populatedDays} Tage für deine Baseline gefunden.`);
}

async function progressOnboarding(alternate = false) {
  if (state.onboardingStep === 2 && !alternate) {
    const permission = await healthAdapter.requestPermissions(["recovery", "sleep", "activity", "workouts", "weight"], false);
    if (permission.reason === "browser") showToast("Die Health-Connect-Verbindung wird in der Android-App eingerichtet.");
  }
  if (state.onboardingStep === 3) {
    if (!alternate) await healthAdapter.requestPermissions(["sleep", "recovery", "activity", "workouts", "weight"], true);
    await synchronize({ initial: !alternate });
  }
  if (state.onboardingStep >= 4) { state.modal = null; state.onboardingStep = 0; showToast("Deine erste Auswertung ist bereit."); return; }
  state.onboardingStep += 1;
  render();
}

app.addEventListener("click", async (event) => {
  const control = event.target.closest("[data-action]");
  if (!control) return;
  const { action } = control.dataset;
  if (action === "nav") { state.tab = control.dataset.tab; state.detail = null; state.modal = null; render(); }
  if (action === "detail") { state.detail = control.dataset.detail; state.tab = "today"; render(); }
  if (action === "back") { state.detail = null; render(); }
  if (action === "range") { state.range = control.dataset.range; render(); }
  if (action === "trend-detail") { state.detail = control.dataset.detail === "recovery" ? "recovery" : control.dataset.detail === "sleep" ? "sleep" : control.dataset.detail === "load" ? "load" : "recovery"; state.tab = "today"; render(); }
  if (action === "workout-filter") { state.workoutFilter = control.dataset.filter; render(); }
  if (action === "workout") { state.workout = control.dataset.workout; state.modal = "workout"; render(); }
  if (action === "show-browser-info") { state.modal = "browser"; render(); }
  if (action === "show-login") { state.modal = "login"; render(); }
  if (action === "demo-login") { state.modal = null; showToast("Demo-Anmeldung aktiviert. Für Produktion Supabase-Konfiguration ergänzen."); }
  if (action === "close-modal") { state.modal = null; render(); }
  if (action === "onboarding") { state.modal = "onboarding"; state.onboardingStep = 0; render(); }
  if (action === "onboarding-next") await progressOnboarding(false);
  if (action === "onboarding-alternate") await progressOnboarding(true);
  if (action === "sync") await synchronize();
  if (action === "permissions") { const result = await healthAdapter.openPermissionSettings(); showToast(result.opened ? "Health Connect geöffnet." : "Berechtigungen können in der Android-App verwaltet werden."); }
  if (action === "check-update") showToast(platformAdapter.isNative() ? "Nach Web-App-Updates wird gesucht." : "Updates werden über die installierte App bereitgestellt.");
  if (action === "theme") { state.theme = control.dataset.theme; render(); }
  if (action === "toggle-theme") { state.theme = getTheme() === "dark" ? "light" : "dark"; render(); }
});

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (state.theme === "system") render(); });
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
render();
if (platformAdapter.isNative()) window.setTimeout(() => synchronize({ quiet: true }), 80);
