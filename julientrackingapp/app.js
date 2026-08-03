import {
  deleteItem,
  generateId,
  getAll,
  getItem,
  getLegacyWeightEntries,
  getMeta,
  getSettings,
  getStagedLegacyWeightEntries,
  migrateLegacyLocalStorageData,
  putItem,
  saveSettings,
  setMeta,
  stageLegacyWeightImport,
  clearStagedLegacyWeightEntries,
  deleteLegacyWeightEntries,
  todayKey,
  toLocalIso,
  WEIGHT_SUPABASE_MIGRATION_KEY,
} from "./db.js";
import {
  addDays,
  average,
  calculateAge,
  calculateBMI,
  calculateDailyNutrition,
  calculateMaintenanceDelta,
  calculateAutoTdee,
  calculateMovingAverage,
  calculateWeightChartSeries,
  calculateWeeklyAverageWeight,
  calculateWeeklyCaloriePool,
  formatDateKey,
  getBMICategory,
  getIsoWeekKey,
  parseDateKey,
  toNumber,
} from "./calculations.js";
import {
  downloadJson,
  downloadFullExport,
  mergeImportData,
  readJsonFile,
  replaceAllData,
} from "./export-import.js";
import {
  getAuthState,
  initializeAuth,
  loginWithPassword,
  logout,
  testCloudConnection,
} from "./auth-service.js";
import {
  createManualWeightMeasurement,
  deleteManualWeightMeasurement,
  exportCloudWeights,
  getDailyWeightSeries,
  migrateLegacyWeightEntries,
  updateManualWeightMeasurement,
} from "./weight-repository.js";
import { isSupabaseConfigured } from "./supabase-client.js";

const app = document.querySelector("#app");
const screenTitle = document.querySelector("#screen-title");
const toast = document.querySelector("#toast");
const updateBanner = document.querySelector("#update-banner");
const themeColorMeta = document.querySelector("meta[name='theme-color']");
const LIGHT_THEME_COLOR = "#f5f2ea";
const DARK_THEME_COLOR = "#10110f";

const TAB_TITLES = {
  dashboard: "Dashboard",
  weight: "Gewicht",
  calories: "Kalorien",
  more: "Mehr",
};

const MEALS = [
  { value: "breakfast", label: "Frühstück" },
  { value: "lunch", label: "Mittag" },
  { value: "dinner", label: "Abend" },
  { value: "snack", label: "Snack" },
  { value: "drinks", label: "Getränke" },
  { value: "other", label: "Sonstiges" },
  { value: "", label: "Ohne Mahlzeit" },
];

const state = {
  tab: "dashboard",
  selectedDate: todayKey(),
  caloriePanel: "quick",
  weightEditId: null,
  foodPresetEditId: null,
  foodEntryEditId: null,
  waitingServiceWorker: null,
  authStatus: { status: "checking", user: null, error: null },
  weightLoading: false,
  weightError: null,
  lastWeightSyncAt: null,
  legacyWeightEntries: [],
  discardedLegacyBodyMeasurements: 0,
};

let data = {
  settings: null,
  weight_entries: [],
  food_entries: [],
  food_presets: [],
};

let toastTimer = null;
let renderToken = 0;
let scannedProduct = null;
let importedEntry = null;
let scanMode = "barcode";
let barcodeStream = null;
let barcodeAnimationFrame = null;
let zxingControls = null;

init();

async function init() {
  bindEvents();
  const launchAction = applyLaunchAction();
  const migration = await migrateLegacyLocalStorageData();
  if (migration.migrated) {
    showToast("Alte lokale Daten wurden sicher übernommen.");
  }
  await render();
  await initializeCloud();
  registerServiceWorker();

  if (launchAction === "barcode") {
    await openBarcodeOverlay();
  }

  checkDueReviews();
  setInterval(checkDueReviews, 60000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkDueReviews();
  });
}

function applyLaunchAction() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get("action");
  if (!action) return null;

  if (action === "barcode") {
    state.tab = "calories";
    state.caloriePanel = "barcode";
  } else if (action === "weight") {
    state.tab = "weight";
  } else if (action === "quicklog") {
    state.tab = "calories";
    state.caloriePanel = "quick";
  }

  window.history.replaceState({}, document.title, window.location.pathname);
  return action;
}

function bindEvents() {
  document.querySelector(".bottom-nav").addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (!button) return;
    state.tab = button.dataset.tab;
    render();
  });

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-global-action]");
    if (!button) return;
    if (button.dataset.globalAction === "sync-render") {
      await render();
      showToast("Ansicht aktualisiert.");
    }
  });

  updateBanner?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-update-action='reload']");
    if (!button || !state.waitingServiceWorker) return;
    button.disabled = true;
    button.textContent = "Aktualisiere...";
    state.waitingServiceWorker.postMessage({ type: "SKIP_WAITING" });
  });

  app.addEventListener("click", handleActionClick);
  app.addEventListener("submit", handleSubmit);
  app.addEventListener("change", handleChange);
  app.addEventListener("input", handleInput);

  document.querySelector("#barcode-overlay")?.addEventListener("click", (event) => {
    if (event.target.closest("[data-action='close-barcode-scanner']")) closeBarcodeOverlay();
  });

  document.querySelector("#share-overlay")?.addEventListener("click", (event) => {
    if (event.target.closest("[data-action='close-share-overlay']")) closeShareOverlay();
  });

  const colorScheme = window.matchMedia?.("(prefers-color-scheme: dark)");
  colorScheme?.addEventListener?.("change", () => applyTheme(data.settings));
}

async function loadData() {
  const [settings, foods, foodPresets] = await Promise.all([
    getSettings(),
    getAll("food_entries"),
    getAll("food_presets"),
  ]);

  return {
    settings,
    food_entries: foods.sort((a, b) => `${a.date || ""}${a.created_at || ""}`.localeCompare(`${b.date || ""}${b.created_at || ""}`)),
    food_presets: foodPresets.sort((a, b) => (a.name || "").localeCompare(b.name || "")),
  };
}

async function initializeCloud() {
  state.authStatus = await initializeAuth(async (nextStatus) => {
    state.authStatus = nextStatus;
    if (nextStatus.status === "authenticated") {
      await refreshWeightData({ renderAfter: true });
      await loadLegacyWeightMigrationCandidate();
      showLegacyWeightMigrationDialog();
    } else {
      data.weight_entries = [];
      state.weightError = null;
      state.weightLoading = false;
      state.lastWeightSyncAt = null;
      state.legacyWeightEntries = [];
      state.discardedLegacyBodyMeasurements = 0;
      await render();
    }
  });

  if (state.authStatus.status === "authenticated") {
    await refreshWeightData({ renderAfter: true });
    await loadLegacyWeightMigrationCandidate();
    showLegacyWeightMigrationDialog();
  } else {
    await render();
  }
}

async function refreshWeightData({ renderAfter = false } = {}) {
  if (state.authStatus.status !== "authenticated") {
    data.weight_entries = [];
    state.weightLoading = false;
    if (renderAfter) await render();
    return;
  }

  state.weightLoading = true;
  state.weightError = null;
  if (renderAfter) await render();

  try {
    data.weight_entries = await getDailyWeightSeries();
    state.lastWeightSyncAt = toLocalIso();
  } catch (error) {
    state.weightError = error.message || "Gewichtsdaten konnten nicht mit Supabase verbunden werden.";
  } finally {
    state.weightLoading = false;
  }

  if (renderAfter) await render();
}

async function loadLegacyWeightMigrationCandidate() {
  if (state.authStatus.status !== "authenticated") return;
  const [migration, staged] = await Promise.all([
    getMeta(WEIGHT_SUPABASE_MIGRATION_KEY),
    getStagedLegacyWeightEntries(),
  ]);
  const stored = migration?.value?.status === "completed"
    ? []
    : await getLegacyWeightEntries();
  const byExternalId = new Map();
  for (const entry of [...stored, ...staged]) {
    if (!entry?.date || toNumber(entry.weight_kg) === null) continue;
    const key = entry.id || `${entry.date}:${entry.weight_kg}:${entry.updated_at || entry.created_at || ""}`;
    byExternalId.set(key, entry);
  }
  state.legacyWeightEntries = [...byExternalId.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

async function render() {
  const token = ++renderToken;
  const nextData = await loadData();
  if (token !== renderToken) return;

  data = { ...data, ...nextData };
  applyTheme(data.settings);
  screenTitle.textContent = TAB_TITLES[state.tab] || "Dashboard";
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === state.tab);
  });

  const body = {
    dashboard: renderDashboardV2,
    weight: renderWeight,
    calories: renderCaloriesV2,
    more: renderMoreV2,
  }[state.tab]();

  const reminder = state.tab === "more" ? renderReminderBanner() : "";
  app.innerHTML = `<div class="screen-stack">${reminder}${body}</div>`;
  requestAnimationFrame(drawCharts);
}

function applyTheme(settings) {
  const preference = settings?.preferences?.theme || "system";
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const resolved = preference === "system" ? (systemDark ? "dark" : "light") : preference;

  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = resolved;
  if (themeColorMeta) {
    themeColorMeta.content = resolved === "dark" ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
  }
}

function renderDashboardV2() {
  const today = todayKey();
  const goals = data.settings.goals;
  const nutrition = calculateDailyNutrition(data.food_entries, today);
  const weightStats = buildWeightStats();
  const avgCalories7 = average(lastNDays(today, 7).map((date) => calculateDailyNutrition(data.food_entries, date).calories_kcal));
  const caloriePool = calculateWeeklyCaloriePool(data.food_entries, goals.calorie_goal_kcal, today).pool;
  const effectiveCalorieGoal = (toNumber(goals.calorie_goal_kcal) || 0) + caloriePool;
  const calorieProgress = percent(nutrition.calories_kcal, effectiveCalorieGoal);
  const proteinProgress = percent(nutrition.protein_g, goals.protein_goal_g);
  const proteinOpen = Math.max((toNumber(goals.protein_goal_g) || 0) - (toNumber(nutrition.protein_g) || 0), 0);
  const calorieOpen = effectiveCalorieGoal - (toNumber(nutrition.calories_kcal) || 0);
  const ringProgress = Math.min(Math.max(calorieProgress, 0), 100);
  const proteinRingProgress = Math.min(Math.max(proteinProgress, 0), 100);
  const autoTdee = calculateAutoTdee(data.weight_entries, data.food_entries, today);

  return `
    <section class="dashboard-today">
      <article class="card today-card">
        <div class="today-hero">
          <div>
            <p class="today-kicker">${formatDate(today)}</p>
            <h2 class="today-title">Heute im Blick</h2>
            <p class="today-subline">Kalorien und Protein auf einen Scan, ohne Umwege.</p>
          </div>
          <div class="today-orbit-stack">
            <div class="today-orbit" style="--ring: ${ringProgress}%">
              <div>
                <div class="today-orbit-value">${goals.calorie_goal_kcal ? fmt(calorieProgress, 0) : "0"}%</div>
                <div class="today-orbit-label">Kcal Ziel</div>
              </div>
            </div>
            <div class="today-orbit protein-orbit" style="--ring: ${proteinRingProgress}%">
              <div>
                <div class="today-orbit-value">${goals.protein_goal_g ? fmt(proteinProgress, 0) : "0"}%</div>
                <div class="today-orbit-label">Protein</div>
              </div>
            </div>
          </div>
        </div>

        <div class="today-quick-grid">
          <div class="quick-stat">
            <span>Kalorien</span>
            <strong>${fmt(nutrition.calories_kcal, 0)} / ${fmt(effectiveCalorieGoal, 0)}</strong>
          </div>
          <div class="quick-stat">
            <span>Protein offen</span>
            <strong>${fmt(proteinOpen, 0)} g</strong>
          </div>
        </div>

        <div class="today-actions" style="position: relative; z-index: 1; margin-top: 18px;">
          <span class="pill ${caloriePillClass(nutrition.calories_kcal, effectiveCalorieGoal)}">${calorieBalanceText(nutrition.calories_kcal, effectiveCalorieGoal)}</span>
          <button class="btn small primary" type="button" data-action="copy-chatgpt-daily-context">Heute exportieren</button>
        </div>
      </article>
    </section>

    <section class="dashboard-flow">
      <article class="card">
        <div class="section-head">
          <div>
            <h2>Tagesziele</h2>
            <p class="section-note">${calorieOpen >= 0 ? `${fmt(calorieOpen, 0)} kcal übrig` : `${fmt(Math.abs(calorieOpen), 0)} kcal drüber`}.</p>
          </div>
          <span class="pill ${caloriePool > 0 ? "ok" : ""}">${caloriePool > 0 ? "+" : ""}${fmt(caloriePool, 0)} kcal Pool</span>
        </div>
        <div class="primary-progress-grid">
          ${renderProgressRow("Kalorien", nutrition.calories_kcal, effectiveCalorieGoal, "kcal", { kind: "calories" })}
          ${renderProgressRow("Protein", nutrition.protein_g, goals.protein_goal_g, "g", { kind: "protein" })}
        </div>
        <p class="section-note" style="margin-top: 10px;">${autoTdeeMessage(autoTdee)}</p>
      </article>

      <article class="card">
        <div class="section-head">
          <div>
            <h2>Makros</h2>
            <p class="section-note">Heute nach Zielwerten.</p>
          </div>
        </div>
        <div class="nutrient-list" aria-label="Nährwerte heute">
          ${renderNutrientRow("KH", nutrition.carbs_g, "g", goals.carbs_goal_g)}
          ${renderNutrientRow("Fett", nutrition.fat_g, "g", goals.fat_goal_g)}
          ${renderNutrientRow("Ballaststoffe", nutrition.fiber_g, "g", goals.fiber_goal_g)}
          ${renderNutrientRow("Zucker", nutrition.sugar_g, "g", goals.sugar_max_g, { max: true })}
          ${renderNutrientRow("Salz", nutrition.salt_g, "g", goals.salt_max_g, { max: true, decimals: 1 })}
        </div>
      </article>
    </section>

    <section class="grid auto">
      ${renderMetricCard("7 Tage Kcal", fmt(avgCalories7, 0), "Schnitt")}
      ${renderMetricCard("Wochen-Pool", `${caloriePool >= 0 ? "+" : ""}${fmt(caloriePool, 0)} kcal`, "bis heute")}
      ${renderMetricCard("Aktuell", weightStats.latest ? `${fmt(weightStats.latest.weight_kg, 1)} kg` : "-", weightStats.latest ? formatDate(weightStats.latest.date) : "Noch kein Eintrag")}
      ${renderMetricCard("Seit Start", weightStats.diffStart !== null ? `${fmtSigned(weightStats.diffStart, 1)} kg` : "-", "Gewicht")}
    </section>

    <section class="card">
      <div class="section-head">
        <div>
          <h2>Gewichtsverlauf</h2>
          <p class="section-note">Tagesgewicht (schwach) und 7-Tage-Schnitt (kräftig). Zum Scrollen wischen.</p>
        </div>
      </div>
      ${renderWeightChartOrStatus()}
    </section>
  `;
}

function renderWeightChartOrStatus() {
  if (state.authStatus.status !== "authenticated") {
    return `<div class="empty">Für Gewichtsdaten bei Supabase anmelden.</div>`;
  }
  if (state.weightLoading && !data.weight_entries.length) {
    return `<div class="empty">Gewichtsdaten werden geladen …</div>`;
  }
  if (state.weightError && !data.weight_entries.length) {
    return `<div class="empty">Gewichtsdaten konnten nicht mit Supabase verbunden werden. Dein Kalorientracking funktioniert weiterhin lokal.</div>`;
  }
  return `
    <div class="chart-scroll" data-chart-scroll="dashboard-weight">
      <canvas class="chart-canvas" data-chart="dashboard-weight" aria-label="Gewichtsverlauf mit 7-Tage-Schnitt"></canvas>
    </div>
  `;
}

function autoTdeeMessage(autoTdee) {
  if (state.authStatus.status !== "authenticated") return "Für die Berechnung werden Cloud-Gewichtsdaten benötigt.";
  if (state.weightLoading) return "Cloud-Gewichte werden für Auto-TDEE geladen …";
  if (state.weightError && !data.weight_entries.length) return "Für die Berechnung werden Cloud-Gewichtsdaten benötigt.";
  return autoTdee.available
    ? `Dein berechneter Ø Verbrauch (letzte 21 Tage) liegt bei ca. ${fmt(autoTdee.tdee, 0)} kcal.`
    : "Noch nicht genug Daten für einen berechneten Verbrauch (Gewicht und Kalorien über mehrere Wochen erfassen).";
}

function renderCaloriesV2() {
  const goals = data.settings.goals;
  const nutrition = calculateDailyNutrition(data.food_entries, state.selectedDate);
  const weightStats = buildWeightStats();
  const proteinPerKg = weightStats.trendWeight ? nutrition.protein_g / weightStats.trendWeight : null;
  const maintenance = calculateMaintenanceDelta(nutrition.calories_kcal, data.settings.maintenance.min_kcal, data.settings.maintenance.max_kcal);
  const isToday = state.selectedDate === todayKey();
  const caloriePool = isToday ? calculateWeeklyCaloriePool(data.food_entries, goals.calorie_goal_kcal, todayKey()).pool : 0;
  const effectiveCalorieGoal = (toNumber(goals.calorie_goal_kcal) || 0) + caloriePool;

  return `
    <section class="card">
      <div class="button-row">
        ${panelButton("quick", "+ Schnelleintrag")}
        ${panelButton("preset", "+ Aus Preset")}
        ${panelButton("new-preset", state.foodPresetEditId ? "Preset bearbeiten" : "+ Neues Preset")}
        <button class="btn ${state.caloriePanel === "barcode" ? "primary" : "ghost"}" type="button" data-action="open-barcode-scanner">📷 Barcode Scannen</button>
        <button class="btn ${state.caloriePanel === "import" ? "primary" : "ghost"}" type="button" data-action="open-import-scanner">📷 Eintrag importieren</button>
        <button class="btn ghost" type="button" data-action="copy-yesterday">Gestern kopieren</button>
      </div>
      <div style="margin-top: 16px;">
        ${renderCaloriePanel()}
      </div>
    </section>

    <section class="card">
      <div class="section-head">
        <div>
          <h2>Tagesübersicht</h2>
          <p class="section-note">${formatDate(state.selectedDate)}</p>
        </div>
        <div class="field" style="min-width: 170px;">
          <label for="calories-date">Datum</label>
          <input id="calories-date" type="date" value="${attr(state.selectedDate)}">
        </div>
      </div>
      <div class="grid two">
        ${renderMetric("Kcal", goalValueText(nutrition.calories_kcal, effectiveCalorieGoal, "kcal", 0), calorieBalanceText(nutrition.calories_kcal, effectiveCalorieGoal))}
        ${renderMetric("Protein", goalValueText(nutrition.protein_g, goals.protein_goal_g, "g", 0), proteinPerKg ? `${fmt(proteinPerKg, 2)} g/kg` : "Gewicht nicht verfügbar.")}
        ${renderMetric("KH", goalValueText(nutrition.carbs_g, goals.carbs_goal_g, "g", 0), optionalGoalSub(nutrition.carbs_g, goals.carbs_goal_g))}
        ${renderMetric("Fett", goalValueText(nutrition.fat_g, goals.fat_goal_g, "g", 0), optionalGoalSub(nutrition.fat_g, goals.fat_goal_g))}
      </div>
      <div class="screen-stack" style="margin-top: 14px;">
        ${renderProgressRow("Kalorien", nutrition.calories_kcal, effectiveCalorieGoal, "kcal", { kind: "calories" })}
        ${renderProgressRow("Protein", nutrition.protein_g, goals.protein_goal_g, "g", { kind: "protein" })}
        ${nutrition.hasOptional ? renderOptionalNutrition(nutrition) : ""}
      </div>
      <p class="section-note" style="margin-top: 12px;">Estimated Maintenance: ${fmt(data.settings.maintenance.min_kcal, 0)}–${fmt(data.settings.maintenance.max_kcal, 0)} kcal. ${maintenanceText(maintenance)}</p>
    </section>

    <section class="card">
      <div class="section-head">
        <div>
          <h2>Einträge</h2>
          <p class="section-note">Gruppiert nach Mahlzeit.</p>
        </div>
      </div>
      ${renderFoodEntriesForDate(state.selectedDate)}
    </section>

    <section class="card">
      <div class="section-head">
        <div>
          <h2>Presets</h2>
          <p class="section-note">Zutaten pro 100g und Fertigprodukte pro Einheit.</p>
        </div>
      </div>
      ${renderFoodPresetList()}
    </section>
  `;
}

function renderMoreV2() {
  const settings = data.settings;
  const age = calculateAge(settings.profile.birth_date);

  return `
    <section class="grid auto">
      ${renderMetricCard("Alter", age !== null ? fmt(age, 0) : "–", "aus Geburtsdatum")}
      ${renderMetricCard("Grösse", settings.profile.height_cm ? `${fmt(settings.profile.height_cm, 0)} cm` : "–", "Profil")}
      ${renderMetricCard("Kalorienziel", goalSummary(settings.goals.calorie_goal_kcal, "kcal"), "primär")}
      ${renderMetricCard("Lokale Daten", `${data.food_entries.length + data.food_presets.length}`, "Einträge & Presets")}
    </section>

    ${renderCloudAccount()}

    <section class="card">
      <h2>Darstellung</h2>
      <form id="settings-preferences-form">
        <div class="form-grid">
          ${field("Theme", `
            <select name="theme">
              ${option("system", "System", settings.preferences.theme)}
              ${option("light", "Hell", settings.preferences.theme)}
              ${option("dark", "Dunkel", settings.preferences.theme)}
            </select>
          `)}
        </div>
        <button class="btn primary" type="submit">Darstellung speichern</button>
      </form>
    </section>

    <section class="card">
      <h2>Profil</h2>
      <form id="settings-profile-form">
        <div class="form-grid">
          ${field("Körpergrösse cm", `<input type="number" name="height_cm" min="1" step="1" value="${attr(settings.profile.height_cm ?? "")}">`)}
          ${field("Geburtsdatum", `<input type="date" name="birth_date" value="${attr(settings.profile.birth_date || "")}">`)}
          ${field("Geschlecht", `
            <select name="sex">
              ${option("male", "männlich", settings.profile.sex)}
              ${option("female", "weiblich", settings.profile.sex)}
            </select>
          `)}
        </div>
        <button class="btn primary" type="submit">Profil speichern</button>
      </form>
    </section>

    <section class="card">
      <h2>Ziele</h2>
      <form id="settings-goals-form">
        <div class="form-grid three">
          ${field("Kalorienziel kcal", `<input type="number" name="calorie_goal_kcal" min="0" step="1" value="${attr(settings.goals.calorie_goal_kcal ?? "")}">`)}
          ${field("Proteinziel g", `<input type="number" name="protein_goal_g" min="0" step="1" value="${attr(settings.goals.protein_goal_g ?? "")}">`)}
          ${field("KH-Ziel g", `<input type="number" name="carbs_goal_g" min="0" step="1" value="${attr(settings.goals.carbs_goal_g ?? "")}">`)}
          ${field("Fett-Ziel g", `<input type="number" name="fat_goal_g" min="0" step="1" value="${attr(settings.goals.fat_goal_g ?? "")}">`)}
          ${field("Ballaststoff-Ziel g", `<input type="number" name="fiber_goal_g" min="0" step="1" value="${attr(settings.goals.fiber_goal_g ?? "")}">`)}
          ${field("Zucker-Maximum g", `<input type="number" name="sugar_max_g" min="0" step="1" value="${attr(settings.goals.sugar_max_g ?? "")}">`)}
          ${field("Salz-Maximum g", `<input type="number" name="salt_max_g" min="0" step="0.1" value="${attr(settings.goals.salt_max_g ?? "")}">`)}
          ${field("Zielgewicht kg", `<input type="number" name="weight_goal_kg" min="0" step="0.1" value="${attr(settings.goals.weight_goal_kg ?? "")}">`)}
        </div>
        <button class="btn primary" type="submit">Ziele speichern</button>
      </form>
    </section>

    <section class="card">
      <h2>Maintenance Calories</h2>
      <form id="settings-maintenance-form">
        <div class="form-grid">
          ${field("Minimum kcal", `<input type="number" name="min_kcal" min="0" step="1" value="${attr(settings.maintenance.min_kcal ?? "")}">`)}
          ${field("Maximum kcal", `<input type="number" name="max_kcal" min="0" step="1" value="${attr(settings.maintenance.max_kcal ?? "")}">`)}
        </div>
        <button class="btn primary" type="submit">Maintenance speichern</button>
      </form>
    </section>

    <section class="card">
      <h2>Erinnerungen</h2>
      <form id="settings-reminders-form">
        <div class="form-grid">
          ${field("Grösse prüfen alle X Tage", `<input type="number" name="height_check_interval_days" min="0" step="1" value="${attr(settings.reminders.height_check_interval_days ?? "")}">`)}
          ${field("Backup alle X Tage", `<input type="number" name="backup_interval_days" min="0" step="1" value="${attr(settings.reminders.backup_interval_days ?? "")}">`)}
        </div>
        <div class="button-row">
          <button class="btn primary" type="submit">Erinnerungen speichern</button>
          <button class="btn ghost" type="button" data-action="mark-height">Grösse bestätigt</button>
          <button class="btn ghost" type="button" data-action="mark-backup">Backup erledigt</button>
        </div>
      </form>
    </section>

    <section class="card">
      <h2>Benachrichtigungen &amp; Fokus</h2>
      <p class="section-note">Läuft nur, solange die App offen ist – bei komplett geschlossener App kommt keine Meldung.</p>
      <form id="settings-notifications-form">
        <div class="screen-stack" style="margin-top: 12px;">
          <label class="check-row">
            <input type="checkbox" name="daily_review_enabled" ${settings.notifications.daily_review_enabled ? "checked" : ""}>
            Tägliches Review (20:30 Uhr) aktivieren
          </label>
          <label class="check-row">
            <input type="checkbox" name="weekly_review_enabled" ${settings.notifications.weekly_review_enabled ? "checked" : ""}>
            Wöchentliches Review (Sonntag 18:00 Uhr) aktivieren
          </label>
        </div>
        <p class="section-note" style="margin-top: 14px;">Fokus-Metriken (werden in Benachrichtigung angezeigt)</p>
        <div class="grid two" style="margin-top: 8px;">
          ${notificationFocusCheckbox("calories", "Kcal & Rollover-Status", settings.notifications.focus)}
          ${notificationFocusCheckbox("protein", "Protein", settings.notifications.focus)}
          ${notificationFocusCheckbox("carbs", "Kohlenhydrate", settings.notifications.focus)}
          ${notificationFocusCheckbox("fat", "Fett", settings.notifications.focus)}
          ${notificationFocusCheckbox("fiber", "Ballaststoffe", settings.notifications.focus)}
          ${notificationFocusCheckbox("sugar", "Zucker", settings.notifications.focus)}
          ${notificationFocusCheckbox("salt", "Salz", settings.notifications.focus)}
          ${notificationFocusCheckbox("weight", "Gewichtsstand", settings.notifications.focus)}
          ${notificationFocusCheckbox("auto_tdee", "Auto-TDEE-Verfügbarkeit", settings.notifications.focus)}
        </div>
        <button class="btn primary" type="submit" style="margin-top: 14px;">Benachrichtigungen speichern</button>
      </form>
    </section>

    <section class="card">
      <div class="section-head">
        <div>
          <h2>Daten</h2>
          <p class="section-note">Lokaler Nutrition-Export ohne Gewicht und ohne Trainingsdaten.</p>
        </div>
      </div>
      <div class="grid auto">
        ${renderMetric("Kalorien", fmt(data.food_entries.length, 0), "Einträge")}
        ${renderMetric("Food-Presets", fmt(data.food_presets.length, 0), "gespeichert")}
      </div>
      <div class="button-row" style="margin-top: 14px;">
        <button class="btn primary" type="button" data-action="export-json">JSON exportieren</button>
      </div>
      <form id="import-form" style="margin-top: 16px;">
        <div class="form-grid">
          ${field("Import-Datei", `<input type="file" name="import_file" accept="application/json" required>`)}
          ${field("Modus", `
            <select name="import_mode">
              <option value="merge">Zusammenführen</option>
              <option value="replace">Alles ersetzen</option>
              <option value="presets">Nur Presets importieren</option>
            </select>
          `)}
        </div>
        <button class="btn" type="submit">Import starten</button>
      </form>
    </section>
  `;
}

function renderCloudAccount() {
  const status = state.authStatus;
  const isSignedIn = status.status === "authenticated";
  const isConfigured = isSupabaseConfigured();
  const statusText = isSignedIn
    ? "Verbunden"
    : status.status === "checking"
      ? "Verbindung wird geprüft …"
      : status.status === "unavailable"
        ? "Einrichtung fehlt"
      : "Nicht angemeldet";

  return `
    <section class="card cloud-account-card">
      <div class="section-head">
        <div>
          <h2>Cloud-Konto</h2>
          <p class="section-note">Gewicht wird ausschliesslich in Supabase gespeichert. Kalorien bleiben lokal auf diesem Gerät.</p>
        </div>
        <span class="pill ${isSignedIn ? "ok" : ""}">${safe(statusText)}</span>
      </div>
      ${isSignedIn ? `
        <div class="grid auto">
          ${renderMetric("Konto", status.user?.email || "–", "Supabase")}
          ${renderMetric("Letzte Gewichtsabfrage", state.lastWeightSyncAt ? formatDateTime(state.lastWeightSyncAt) : "–", state.weightLoading ? "wird aktualisiert" : "Cloud")}
        </div>
        ${state.weightError ? `<p class="inline-notice warn">${safe(state.weightError)} Dein Kalorientracking funktioniert weiterhin lokal.</p>` : ""}
        <div class="button-row" style="margin-top: 14px;">
          <button class="btn ghost" type="button" data-action="test-cloud-connection">Verbindung testen</button>
          <button class="btn primary" type="button" data-action="refresh-cloud-weights" ${state.weightLoading ? "disabled" : ""}>${state.weightLoading ? "Aktualisiere …" : "Gewichte aktualisieren"}</button>
          <button class="btn ghost" type="button" data-action="export-cloud-weights">Cloud-Gewichte exportieren</button>
          <button class="btn danger" type="button" data-action="logout-cloud">Abmelden</button>
        </div>
        ${renderLegacyWeightMigration()}
      ` : `
        <p class="inline-notice">Gewicht wird noch nicht geladen. Melde dich an, um deinen gemeinsamen Gewichtsverlauf zu sehen.</p>
        ${status.error ? `<p class="inline-notice warn">${safe(status.error)}</p>` : ""}
        <form id="cloud-login-form">
          <div class="form-grid">
            ${field("E-Mail", `<input type="email" name="email" autocomplete="email" required ${isConfigured ? "" : "disabled"}>`)}
            ${field("Passwort", `<input type="password" name="password" autocomplete="current-password" required ${isConfigured ? "" : "disabled"}>`)}
          </div>
          <button class="btn primary" type="submit" ${isConfigured ? "" : "disabled"}>Anmelden</button>
        </form>
      `}
    </section>
  `;
}

function renderLegacyWeightMigration() {
  const entries = state.legacyWeightEntries;
  if (!entries.length) return "";

  return `
    <div class="migration-callout">
      <strong>${fmt(entries.length, 0)} lokale Gewichtseinträge gefunden.</strong>
      <p>Diese Einträge werden künftig zentral in Supabase gespeichert, damit Nutrition- und Fitness-App dieselben Daten verwenden.</p>
      <div class="button-row">
        <button class="btn primary" type="button" data-action="migrate-legacy-weights">Nach Supabase übertragen</button>
        <button class="btn ghost" type="button" data-action="download-legacy-weights">Vorher als JSON herunterladen</button>
        <button class="btn danger" type="button" data-action="delete-legacy-weights">Lokal löschen</button>
      </div>
    </div>
  `;
}

function showLegacyWeightMigrationDialog() {
  if (state.authStatus.status !== "authenticated" || !state.legacyWeightEntries.length) return;
  if (document.querySelector("#legacy-weight-migration-dialog")) return;

  const dialog = document.createElement("div");
  dialog.id = "legacy-weight-migration-dialog";
  dialog.className = "modal-backdrop";
  dialog.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="legacy-weight-migration-title">
      <h2 id="legacy-weight-migration-title">Lokale Gewichtsdaten gefunden</h2>
      <p>${fmt(state.legacyWeightEntries.length, 0)} lokale Gewichtseinträge können jetzt in dein Supabase-Konto übertragen werden.</p>
      <p class="section-note">Beim Übertragen erhalten alle Einträge die Quelle <code>legacy_import</code>. Alternativ kannst du die lokalen Altgewichte dauerhaft löschen.</p>
      ${state.discardedLegacyBodyMeasurements ? `<p class="section-note">${fmt(state.discardedLegacyBodyMeasurements, 0)} alte Körpermessungen wurden nicht importiert, da sie nicht mehr Teil der Nutrition-App sind.</p>` : ""}
      <div class="button-row">
        <button class="btn primary" type="button" data-legacy-dialog-action="migrate">Nach Supabase übertragen</button>
        <button class="btn danger" type="button" data-legacy-dialog-action="delete">Lokal löschen</button>
        <button class="btn ghost" type="button" data-legacy-dialog-action="close">Später entscheiden</button>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);

  dialog.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-legacy-dialog-action]")?.dataset.legacyDialogAction;
    if (!action) return;
    if (action === "close") {
      dialog.remove();
      return;
    }

    try {
      if (action === "migrate") await migrateCurrentLegacyWeights();
      if (action === "delete") {
        if (!confirm("Lokale Altgewichte dauerhaft löschen? Dieser Schritt kann nicht rückgängig gemacht werden.")) return;
        await deleteCurrentLegacyWeights();
      }
      dialog.remove();
    } catch (error) {
      showToast(error.message || "Migration fehlgeschlagen.");
    }
  });
}

async function migrateCurrentLegacyWeights() {
  const result = await migrateLegacyWeightEntries(state.legacyWeightEntries);
  await setMeta(WEIGHT_SUPABASE_MIGRATION_KEY, {
    status: "completed",
    migrated_count: result.migratedCount,
    completed_at: toLocalIso(),
  });
  await clearStagedLegacyWeightEntries();
  state.legacyWeightEntries = [];
  state.discardedLegacyBodyMeasurements = 0;
  await refreshWeightData();
  showToast(`${fmt(result.migratedCount, 0)} Gewichtseinträge als Legacy-Import übertragen.`);
  await render();
}

async function deleteCurrentLegacyWeights() {
  const deletedCount = state.legacyWeightEntries.length;
  await deleteLegacyWeightEntries();
  await setMeta(WEIGHT_SUPABASE_MIGRATION_KEY, {
    status: "discarded",
    deleted_count: deletedCount,
    discarded_at: toLocalIso(),
  });
  state.legacyWeightEntries = [];
  state.discardedLegacyBodyMeasurements = 0;
  showToast(`${fmt(deletedCount, 0)} lokale Gewichtseinträge gelöscht.`);
  await render();
}

function renderWeight() {
  const stats = buildWeightStats();
  const editEntry = state.weightEditId ? data.weight_entries.find((entry) => entry.id === state.weightEditId) : null;
  const entry = editEntry || { date: todayKey(), weight_kg: "" };

  if (state.authStatus.status !== "authenticated") {
    return `
      <section class="card cloud-empty-state">
        <h2>Gewicht in der Cloud</h2>
        <p class="section-note">Für Gewichtsdaten bei Supabase anmelden. Dein Kalorientracking funktioniert weiterhin vollständig lokal.</p>
        <button class="btn primary" type="button" data-action="open-cloud-account">Cloud-Konto öffnen</button>
      </section>
    `;
  }

  return `
    <section class="grid auto">
      ${renderMetricCard("Aktuell", stats.latest ? `${fmt(stats.latest.weight_kg, 1)} kg` : "–", stats.latest ? formatDate(stats.latest.date) : "Noch kein Eintrag")}
      ${renderMetricCard("7-Tage-Schnitt", stats.avg7 ? `${fmt(stats.avg7, 1)} kg` : "–", "Trendgewicht")}
    </section>

    <section class="card">
      ${renderBmiGauge(stats.bmi)}
      <p class="section-note">${stats.bmi ? `BMI ${fmt(stats.bmi, 1)} · ${getBMICategory(stats.bmi)}` : "BMI nicht berechenbar – Grösse und Gewicht nötig."}</p>
    </section>

    <section class="card">
      <div class="section-head">
        <div>
          <h2>${editEntry ? "Gewicht bearbeiten" : "+ Gewicht eintragen"}</h2>
          <p class="section-note">Heute mit aktueller Uhrzeit, vergangene Tage standardmässig um 12:00 Uhr.</p>
        </div>
        ${editEntry ? `<button class="btn ghost small" type="button" data-action="cancel-weight-edit">Abbrechen</button>` : ""}
      </div>
      <form id="weight-form">
        <input type="hidden" name="remote_id" value="${attr(editEntry?.remote_id || "")}">
        <div class="form-grid">
          ${field("Datum", `<input type="date" name="date" value="${attr(entry.date)}" required>`)}
          ${field("Gewicht kg", `<input type="number" name="weight_kg" inputmode="decimal" step="0.1" min="1" value="${attr(entry.weight_kg)}" required>`)}
        </div>
        <button class="btn primary" type="submit">Speichern</button>
      </form>
    </section>

    <section class="card">
      <h2>Historie</h2>
      ${renderWeightHistory()}
    </section>
  `;
}

async function handleActionClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;

  try {
    if (action === "cancel-weight-edit") {
      state.weightEditId = null;
      await render();
    }

    if (action === "edit-weight") {
      state.weightEditId = button.dataset.id;
      state.tab = "weight";
      await render();
    }

    if (action === "delete-weight") {
      await confirmDelete("Gewichtseintrag löschen?", async () => {
        await deleteManualWeightMeasurement(button.dataset.id);
        state.weightEditId = null;
        await refreshWeightData();
      });
    }

    if (action === "set-calorie-panel") {
      if (state.caloriePanel === button.dataset.panel) return;
      state.caloriePanel = button.dataset.panel;
      if (state.caloriePanel !== "new-preset") state.foodPresetEditId = null;
      if (state.caloriePanel !== "quick") state.foodEntryEditId = null;
      await render();
    }

    if (action === "edit-food") {
      state.foodEntryEditId = button.dataset.id;
      state.caloriePanel = "quick";
      await render();
    }

    if (action === "cancel-food-entry-edit") {
      state.foodEntryEditId = null;
      await render();
    }

    if (action === "share-food") {
      await shareFoodEntry(button.dataset.id);
    }

    if (action === "edit-food-preset") {
      state.foodPresetEditId = button.dataset.id;
      state.caloriePanel = "new-preset";
      state.tab = "calories";
      await render();
    }

    if (action === "cancel-food-preset-edit") {
      state.foodPresetEditId = null;
      state.caloriePanel = "preset";
      await render();
    }

    if (action === "copy-yesterday") {
      await copyYesterdayFoods();
    }

    if (action === "open-barcode-scanner") {
      await openBarcodeOverlay();
    }

    if (action === "close-barcode-scanner") {
      closeBarcodeOverlay();
    }

    if (action === "cancel-barcode-scan") {
      scannedProduct = null;
      await render();
    }

    if (action === "open-import-scanner") {
      await openBarcodeOverlay("import");
    }

    if (action === "cancel-import-scan") {
      importedEntry = null;
      await render();
    }

    if (action === "copy-chatgpt-daily-context") {
      await copyChatGptDailyContextToClipboard();
    }

    if (action === "open-chatgpt") {
      openChatGpt();
    }

    if (action === "delete-food") {
      await confirmDelete("Kalorieneintrag löschen?", async () => {
        await deleteItem("food_entries", button.dataset.id);
        if (state.foodEntryEditId === button.dataset.id) state.foodEntryEditId = null;
      });
    }

    if (action === "delete-food-preset") {
      await confirmDelete("Preset löschen?", async () => {
        await deleteItem("food_presets", button.dataset.id);
        if (state.foodPresetEditId === button.dataset.id) state.foodPresetEditId = null;
      });
    }

    if (action === "export-json") {
      await exportAndMarkBackup();
    }

    if (action === "mark-height") {
      await updateReminderDate("last_height_check_at");
      showToast("Grösse bestätigt.");
    }

    if (action === "mark-backup") {
      await updateReminderDate("last_backup_at");
      showToast("Backup-Erinnerung zurückgesetzt.");
    }

    if (action === "open-cloud-account") {
      state.tab = "more";
      await render();
    }

    if (action === "logout-cloud") {
      await logout();
      state.authStatus = getAuthState();
      data.weight_entries = [];
      state.weightError = null;
      state.lastWeightSyncAt = null;
      state.weightEditId = null;
      showToast("Von Supabase abgemeldet.");
      await render();
    }

    if (action === "test-cloud-connection") {
      await testCloudConnection();
      showToast("Supabase-Verbindung funktioniert.");
    }

    if (action === "refresh-cloud-weights") {
      await refreshWeightData({ renderAfter: true });
      if (state.weightError) throw new Error(state.weightError);
      showToast("Gewichte aktualisiert.");
    }

    if (action === "export-cloud-weights") {
      const weights = await exportCloudWeights();
      downloadJson({
        schema_version: 1,
        type: "fittrack_cloud_weights",
        exported_at: toLocalIso(),
        weight_measurements: weights,
      }, `fittrack-cloud-weights-${todayKey()}.json`);
      showToast("Cloud-Gewichte exportiert.");
    }

    if (action === "download-legacy-weights") {
      downloadJson({
        schema_version: 1,
        type: "fittrack_legacy_weights",
        exported_at: toLocalIso(),
        weight_entries: state.legacyWeightEntries,
      }, `fittrack-legacy-weights-${todayKey()}.json`);
      showToast("Lokale Gewichtseinträge exportiert.");
    }

    if (action === "migrate-legacy-weights") {
      await migrateCurrentLegacyWeights();
    }

    if (action === "delete-legacy-weights") {
      if (!confirm("Lokale Altgewichte dauerhaft löschen? Dieser Schritt kann nicht rückgängig gemacht werden.")) return;
      await deleteCurrentLegacyWeights();
    }
  } catch (error) {
    showToast(error.message || "Aktion fehlgeschlagen.");
  }
}

async function handleSubmit(event) {
  const form = event.target;
  event.preventDefault();

  try {
    if (form.id === "weight-form") await saveWeightEntry(form);
    if (form.id === "cloud-login-form") await submitCloudLogin(form);
    if (form.id === "quick-food-form") await saveQuickFood(form);
    if (form.id === "preset-food-form") await saveFoodFromPreset(form);
    if (form.id === "food-preset-form") await saveFoodPreset(form);
    if (form.id === "settings-profile-form") await saveProfileSettings(form);
    if (form.id === "settings-goals-form") await saveGoalSettings(form);
    if (form.id === "settings-preferences-form") await savePreferenceSettings(form);
    if (form.id === "settings-maintenance-form") await saveMaintenanceSettings(form);
    if (form.id === "settings-reminders-form") await saveReminderSettings(form);
    if (form.id === "settings-notifications-form") await saveNotificationSettings(form);
    if (form.id === "barcode-food-form") await saveBarcodeFood(form);
    if (form.id === "import-food-form") await saveImportedFood(form);
    if (form.id === "import-form") await importData(form);
  } catch (error) {
    showToast(error.message || "Speichern fehlgeschlagen.");
  }
}

async function handleChange(event) {
  const target = event.target;

  try {
    if (target.id === "calories-date") {
      state.selectedDate = target.value || todayKey();
      await render();
    }

    if (target.id === "quick-save-preset") {
      document.querySelector("#quick-preset-fields")?.toggleAttribute("hidden", !target.checked);
    }

    if (target.id === "barcode-save-preset") {
      document.querySelector("#barcode-preset-fields")?.toggleAttribute("hidden", !target.checked);
    }

    if (target.id === "food-preset-type") {
      applyPresetTypeDefaults(target.value);
    }

    if (["preset-select", "preset-quantity"].includes(target.id)) {
      updatePresetPreview();
    }
  } catch (error) {
    showToast(error.message || "Änderung fehlgeschlagen.");
    await render();
  }
}

function handleInput(event) {
  const target = event.target;

  if (target.id === "barcode-quantity") {
    updateBarcodeFormFromQuantity();
  }

  if (["preset-select", "preset-quantity"].includes(target.id)) {
    updatePresetPreview();
  }
}

async function saveWeightEntry(form) {
  const date = formValue(form, "date");
  const weight = requiredPositiveNumber(form, "weight_kg", "Bitte Gewicht eintragen.");
  if (!date) throw new Error("Bitte Datum eintragen.");

  const remoteId = formValue(form, "remote_id");
  if (remoteId) {
    await updateManualWeightMeasurement(remoteId, { date, weight_kg: weight });
  } else {
    await createManualWeightMeasurement({ date, weight_kg: weight });
  }

  state.weightEditId = null;
  await refreshWeightData();
  showToast("Gewicht gespeichert.");
  await render();
}

async function submitCloudLogin(form) {
  await loginWithPassword(formValue(form, "email"), formValue(form, "password"));
  state.authStatus = getAuthState();
  await refreshWeightData();
  await loadLegacyWeightMigrationCandidate();
  // The auth listener normally opens this dialog as well. Calling it here
  // makes the migration prompt reliable even if the listener has already
  // fired before the legacy rows finished loading.
  showLegacyWeightMigrationDialog();
  showToast("Mit Supabase verbunden.");
  await render();
}

async function saveQuickFood(form) {
  const entryId = formValue(form, "entry_id");
  const name = formValue(form, "name");
  if (!name) throw new Error("Bitte Name eintragen.");

  if (entryId) {
    const existing = await getItem("food_entries", entryId);
    if (!existing) throw new Error("Eintrag nicht gefunden.");
    const updated = buildFoodEntryFromForm(form, {
      id: existing.id,
      date: existing.date,
      name,
      meal: formValue(form, "meal"),
      quantity: existing.quantity,
      unit: existing.unit,
      preset_id: existing.preset_id,
    });
    updated.created_at = existing.created_at;
    await putItem("food_entries", updated);
    state.foodEntryEditId = null;
    showToast("Eintrag aktualisiert.");
    await render();
    return;
  }

  const date = state.selectedDate;
  const entry = buildFoodEntryFromForm(form, {
    id: generateId("food"),
    date,
    name,
    meal: formValue(form, "meal"),
    quantity: 1,
    unit: "Portion",
    preset_id: null,
  });

  let presetId = null;
  if (form.elements.namedItem("quick_save_preset")?.checked) {
    const preset = buildPresetFromValues({
      name,
      type: formValue(form, "preset_type") || "unit_item",
      unit: formValue(form, "preset_unit") || "Portion",
      base_quantity: optionalNumber(form, "preset_base_quantity") || 1,
      calories_kcal: entry.calories_kcal,
      protein_g: entry.protein_g,
      carbs_g: entry.carbs_g,
      fat_g: entry.fat_g,
      fiber_g: entry.fiber_g,
      sugar_g: entry.sugar_g,
      salt_g: entry.salt_g,
      tags: [],
    });
    await putItem("food_presets", preset);
    presetId = preset.id;
  }

  entry.preset_id = presetId;
  await putItem("food_entries", entry);
  showToast("Schnelleintrag gespeichert.");
  await render();
}

async function saveFoodFromPreset(form) {
  const presetId = formValue(form, "preset_id");
  const preset = data.food_presets.find((item) => item.id === presetId);
  if (!preset) throw new Error("Bitte Preset wählen.");

  const quantity = requiredPositiveNumber(form, "quantity", "Bitte Menge eintragen.");
  const factor = quantity / (toNumber(preset.base_quantity) || 1);
  const now = toLocalIso();

  await putItem("food_entries", {
    id: generateId("food"),
    date: state.selectedDate,
    meal: formValue(form, "meal"),
    name: preset.name,
    quantity,
    unit: preset.unit,
    calories_kcal: round((toNumber(preset.calories_kcal) || 0) * factor, 1),
    protein_g: round((toNumber(preset.protein_g) || 0) * factor, 1),
    carbs_g: round((toNumber(preset.carbs_g) || 0) * factor, 1),
    fat_g: round((toNumber(preset.fat_g) || 0) * factor, 1),
    fiber_g: scaleOptional(preset.fiber_g, factor),
    sugar_g: scaleOptional(preset.sugar_g, factor),
    salt_g: scaleOptional(preset.salt_g, factor),
    preset_id: preset.id,
    notes: formValue(form, "notes"),
    created_at: now,
    updated_at: now,
  });

  showToast("Preset eingetragen.");
  await render();
}

async function saveFoodPreset(form) {
  const name = formValue(form, "name");
  if (!name) throw new Error("Bitte Name eintragen.");
  const presetId = formValue(form, "preset_id");
  const existing = presetId ? await getItem("food_presets", presetId) : null;

  const preset = buildPresetFromValues({
    name,
    type: formValue(form, "type"),
    unit: formValue(form, "unit"),
    base_quantity: requiredPositiveNumber(form, "base_quantity", "Bitte Basis-Menge eintragen."),
    calories_kcal: nonNegativeNumber(form, "calories_kcal", "Kalorien dürfen nicht negativ sein."),
    protein_g: nonNegativeNumber(form, "protein_g", "Protein darf nicht negativ sein."),
    carbs_g: nonNegativeNumber(form, "carbs_g", "KH dürfen nicht negativ sein."),
    fat_g: nonNegativeNumber(form, "fat_g", "Fett darf nicht negativ sein."),
    fiber_g: optionalNonNegativeNumber(form, "fiber_g", "Ballaststoffe dürfen nicht negativ sein."),
    sugar_g: optionalNonNegativeNumber(form, "sugar_g", "Zucker darf nicht negativ sein."),
    salt_g: optionalNonNegativeNumber(form, "salt_g", "Salz darf nicht negativ sein."),
    tags: splitTags(formValue(form, "tags")),
  });
  if (existing) {
    preset.id = existing.id;
    preset.created_at = existing.created_at || preset.created_at;
  }

  await putItem("food_presets", preset);
  showToast(existing ? "Preset aktualisiert." : "Preset gespeichert.");
  state.foodPresetEditId = null;
  state.caloriePanel = "preset";
  await render();
}

async function saveBarcodeFood(form) {
  const name = formValue(form, "name");
  if (!name) throw new Error("Bitte Name eintragen.");
  const quantity = requiredPositiveNumber(form, "quantity", "Bitte Menge eintragen.");

  const entry = buildFoodEntryFromForm(form, {
    id: generateId("food"),
    date: state.selectedDate,
    name,
    meal: formValue(form, "meal"),
    quantity,
    unit: "g",
    preset_id: null,
  });

  let presetId = null;
  if (form.elements.namedItem("barcode_save_preset")?.checked) {
    const baseQuantity = optionalNumber(form, "preset_base_quantity") || 100;
    const factor = baseQuantity / quantity;
    const preset = buildPresetFromValues({
      name,
      type: formValue(form, "preset_type") || "ingredient_100g",
      unit: formValue(form, "preset_unit") || "g",
      base_quantity: baseQuantity,
      calories_kcal: round(entry.calories_kcal * factor, 1),
      protein_g: round(entry.protein_g * factor, 1),
      carbs_g: round(entry.carbs_g * factor, 1),
      fat_g: round(entry.fat_g * factor, 1),
      fiber_g: scaleOptional(entry.fiber_g, factor),
      sugar_g: scaleOptional(entry.sugar_g, factor),
      salt_g: scaleOptional(entry.salt_g, factor),
      tags: ["Barcode"],
    });
    await putItem("food_presets", preset);
    presetId = preset.id;
  }

  entry.preset_id = presetId;
  await putItem("food_entries", entry);
  scannedProduct = null;
  state.caloriePanel = "quick";
  showToast("Eintrag gespeichert.");
  await render();
}

async function saveProfileSettings(form) {
  const settings = structuredClone(data.settings);
  settings.profile.height_cm = optionalPositiveNumber(form, "height_cm", "Körpergrösse muss > 0 sein.");
  settings.profile.birth_date = formValue(form, "birth_date");
  settings.profile.sex = normalizeSex(formValue(form, "sex"));
  await saveSettings(settings);
  showToast("Profil gespeichert.");
  await render();
}

async function saveGoalSettings(form) {
  const settings = structuredClone(data.settings);
  for (const key of Object.keys(settings.goals)) {
    settings.goals[key] = optionalNonNegativeNumber(form, key, "Ziele dürfen nicht negativ sein.");
  }
  delete settings.goals.training_days_goal_per_week;
  delete settings.goals.strength_goal_per_week;
  delete settings.goals.cardio_goal_per_week;
  await saveSettings(settings);
  showToast("Ziele gespeichert.");
  await render();
}

async function savePreferenceSettings(form) {
  const settings = structuredClone(data.settings);
  const theme = formValue(form, "theme");
  settings.preferences.theme = ["system", "light", "dark"].includes(theme) ? theme : "system";
  await saveSettings(settings);
  showToast("Darstellung gespeichert.");
  await render();
}

async function saveMaintenanceSettings(form) {
  const settings = structuredClone(data.settings);
  settings.maintenance.min_kcal = optionalNonNegativeNumber(form, "min_kcal", "Maintenance darf nicht negativ sein.");
  settings.maintenance.max_kcal = optionalNonNegativeNumber(form, "max_kcal", "Maintenance darf nicht negativ sein.");
  if (settings.maintenance.max_kcal && settings.maintenance.min_kcal && settings.maintenance.max_kcal < settings.maintenance.min_kcal) {
    throw new Error("Maximum muss über Minimum liegen.");
  }
  await saveSettings(settings);
  showToast("Maintenance gespeichert.");
  await render();
}

async function saveReminderSettings(form) {
  const settings = structuredClone(data.settings);
  settings.reminders.height_check_interval_days = optionalNonNegativeNumber(form, "height_check_interval_days", "Intervall darf nicht negativ sein.");
  settings.reminders.backup_interval_days = optionalNonNegativeNumber(form, "backup_interval_days", "Intervall darf nicht negativ sein.");
  await saveSettings(settings);
  showToast("Erinnerungen gespeichert.");
  await render();
}

async function saveNotificationSettings(form) {
  const settings = structuredClone(data.settings);
  const dailyEnabled = form.elements.namedItem("daily_review_enabled")?.checked || false;
  const weeklyEnabled = form.elements.namedItem("weekly_review_enabled")?.checked || false;
  const wasEnabled = settings.notifications.daily_review_enabled || settings.notifications.weekly_review_enabled;

  settings.notifications.daily_review_enabled = dailyEnabled;
  settings.notifications.weekly_review_enabled = weeklyEnabled;
  for (const key of Object.keys(settings.notifications.focus)) {
    settings.notifications.focus[key] = form.elements.namedItem(`focus_${key}`)?.checked || false;
  }
  delete settings.notifications.focus.training;

  if (!wasEnabled && (dailyEnabled || weeklyEnabled) && "Notification" in window) {
    await Notification.requestPermission();
  }

  await saveSettings(settings);
  showToast("Benachrichtigungen gespeichert.");
  await render();
}

async function importData(form) {
  const file = form.elements.namedItem("import_file")?.files?.[0];
  const mode = formValue(form, "import_mode");
  if (!file) throw new Error("Bitte Import-Datei wählen.");

  const parsed = await readJsonFile(file);
  let result;

  if (mode === "replace") {
    const ok = confirm("Alles ersetzen? Vorher wird ein aktueller Export zum Download angeboten.");
    if (!ok) return;
    await downloadFullExport();
    result = await replaceAllData(parsed);
    showToast("Nutrition-Daten ersetzt.");
  } else if (mode === "presets") {
    result = await mergeImportData(parsed, { presetsOnly: true });
    showToast("Presets importiert.");
  } else {
    result = await mergeImportData(parsed);
    showToast("Nutrition-Daten zusammengeführt.");
  }

  state.discardedLegacyBodyMeasurements = result?.legacyWeightEntries?.length
    ? (result.ignoredBodyMeasurementsCount || 0)
    : 0;
  if (result?.legacyWeightEntries?.length) {
    await stageLegacyWeightImport(result.legacyWeightEntries);
    if (state.authStatus.status === "authenticated") {
      await loadLegacyWeightMigrationCandidate();
      showLegacyWeightMigrationDialog();
    } else {
      showImportLegacyDataNotice(
        result.legacyWeightEntries.length,
        result.ignoredWorkoutsCount,
        result.ignoredBodyMeasurementsCount,
      );
    }
  } else {
    const ignored = [];
    if (result?.ignoredWorkoutsCount) ignored.push(`${fmt(result.ignoredWorkoutsCount, 0)} alte Workout-Einträge`);
    if (result?.ignoredBodyMeasurementsCount) ignored.push(`${fmt(result.ignoredBodyMeasurementsCount, 0)} Körpermessungen`);
    if (ignored.length) showToast(`${ignored.join(" und ")} wurden nicht importiert.`);
  }

  await render();
}

function showImportLegacyDataNotice(weightCount, workoutCount, bodyMeasurementCount = 0) {
  document.querySelector("#legacy-import-notice")?.remove();
  const dialog = document.createElement("div");
  dialog.id = "legacy-import-notice";
  dialog.className = "modal-backdrop";
  dialog.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="legacy-import-title">
      <h2 id="legacy-import-title">Alte Backup-Daten erkannt</h2>
      <p>${fmt(weightCount, 0)} Gewichtseinträge können nach Anmeldung zu Supabase übertragen werden.</p>
      ${workoutCount ? `<p class="section-note">${fmt(workoutCount, 0)} alte Workout-Einträge wurden nicht importiert, da Training nicht mehr Bestandteil der Nutrition-App ist.</p>` : ""}
      ${bodyMeasurementCount ? `<p class="section-note">${fmt(bodyMeasurementCount, 0)} alte Körpermessungen wurden gelöscht, da sie nicht mehr Teil der Nutrition-App sind.</p>` : ""}
      <div class="button-row"><button class="btn primary" type="button" data-dialog-close>Verstanden</button></div>
    </div>
  `;
  document.body.appendChild(dialog);
  dialog.addEventListener("click", (event) => {
    if (event.target.closest("[data-dialog-close]")) dialog.remove();
  });
}

async function exportAndMarkBackup() {
  await downloadFullExport();
  await updateReminderDate("last_backup_at", false);
  showToast("Backup exportiert.");
  await render();
}

async function updateReminderDate(key, rerender = true) {
  const settings = structuredClone(data.settings);
  settings.reminders[key] = toLocalIso();
  await saveSettings(settings);
  if (rerender) await render();
}

async function copyYesterdayFoods() {
  const yesterday = formatDateKey(addDays(parseDateKey(state.selectedDate), -1));
  const rows = data.food_entries.filter((entry) => entry.date === yesterday);
  if (!rows.length) throw new Error("Gestern keine Einträge gefunden.");

  const now = toLocalIso();
  for (const row of rows) {
    await putItem("food_entries", {
      ...row,
      id: generateId("food"),
      date: state.selectedDate,
      created_at: now,
      updated_at: now,
    });
  }

  showToast("Gestern kopiert.");
  await render();
}

async function confirmDelete(message, action) {
  if (!confirm(message)) return;
  await action();
  showToast("Gelöscht.");
  await render();
}

function renderReminderBanner() {
  const reminders = dueReminders();
  if (!reminders.length) return "";

  return `
    <section class="card soft">
      <div class="section-head">
        <div>
          <h2>Erinnerung</h2>
          <p class="section-note">${reminders.map(safe).join(" ")}</p>
        </div>
      </div>
      <div class="button-row">
        ${reminders.some((item) => item.includes("Körpergrösse")) ? `<button class="btn small ghost" type="button" data-action="mark-height">Grösse bestätigt</button>` : ""}
        ${reminders.some((item) => item.includes("Backup")) ? `<button class="btn small primary" type="button" data-action="export-json">Backup jetzt</button>` : ""}
      </div>
    </section>
  `;
}

function dueReminders() {
  const reminders = data.settings?.reminders || {};
  const result = [];

  if (isReminderDue(reminders.last_height_check_at, reminders.height_check_interval_days)) {
    result.push("Körpergrösse wieder einmal prüfen oder bestätigen.");
  }

  if (isReminderDue(reminders.last_backup_at, reminders.backup_interval_days)) {
    result.push("Backup ist fällig.");
  }

  return result;
}

function isReminderDue(lastDate, intervalDays) {
  const interval = toNumber(intervalDays);
  if (!interval || interval <= 0) return false;
  if (!lastDate) return true;
  const last = new Date(lastDate);
  if (Number.isNaN(last.getTime())) return true;
  const diffDays = (Date.now() - last.getTime()) / 86400000;
  return diffDays >= interval;
}

async function checkDueReviews() {
  const settings = data.settings;
  if (!settings?.notifications) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const now = new Date();
  const todayDateKey = todayKey(now);

  if (settings.notifications.daily_review_enabled) {
    const due = now.getHours() > 20 || (now.getHours() === 20 && now.getMinutes() >= 30);
    if (due) {
      const lastSent = await getMeta("last_daily_review_sent_date");
      if (lastSent?.value !== todayDateKey) {
        await sendReviewNotification("daily");
        await setMeta("last_daily_review_sent_date", todayDateKey);
      }
    }
  }

  if (settings.notifications.weekly_review_enabled) {
    const due = now.getDay() === 0 && (now.getHours() > 18 || (now.getHours() === 18 && now.getMinutes() >= 0));
    if (due) {
      const weekKey = getIsoWeekKey(todayDateKey).key;
      const lastSent = await getMeta("last_weekly_review_sent_week");
      if (lastSent?.value !== weekKey) {
        await sendReviewNotification("weekly");
        await setMeta("last_weekly_review_sent_week", weekKey);
      }
    }
  }
}

async function sendReviewNotification(type) {
  const title = type === "daily" ? "Tages-Review" : "Wochen-Review";
  const body = type === "daily" ? buildDailyReviewText() : buildWeeklyReviewText();

  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, { body, tag: `fittrack-${type}-review` });
  } else {
    new Notification(title, { body, tag: `fittrack-${type}-review` });
  }
}

function buildDailyReviewText() {
  const focus = data.settings.notifications.focus;
  const goals = data.settings.goals;
  const today = todayKey();
  const nutrition = calculateDailyNutrition(data.food_entries, today);
  const pool = calculateWeeklyCaloriePool(data.food_entries, goals.calorie_goal_kcal, today).pool;
  const weightStats = buildWeightStats();
  const autoTdee = calculateAutoTdee(data.weight_entries, data.food_entries, today);
  const parts = [];

  if (focus.calories) parts.push(`${fmt(nutrition.calories_kcal, 0)} / ${fmt(goals.calorie_goal_kcal, 0)} kcal (Pool ${pool >= 0 ? "+" : ""}${fmt(pool, 0)})`);
  if (focus.protein) parts.push(`${fmt(nutrition.protein_g, 0)}g Protein`);
  if (focus.carbs) parts.push(`${fmt(nutrition.carbs_g, 0)}g KH`);
  if (focus.fat) parts.push(`${fmt(nutrition.fat_g, 0)}g Fett`);
  if (focus.fiber) parts.push(`${fmt(nutrition.fiber_g, 0)}g Ballaststoffe`);
  if (focus.sugar) parts.push(`${fmt(nutrition.sugar_g, 0)}g Zucker`);
  if (focus.salt) parts.push(`${fmt(nutrition.salt_g, 1)}g Salz`);
  if (focus.weight && weightStats.latest) parts.push(`${fmt(weightStats.latest.weight_kg, 1)} kg`);
  if (focus.auto_tdee) parts.push(autoTdee.available ? `Auto-TDEE ${fmt(autoTdee.tdee, 0)} kcal` : "Auto-TDEE: Gewichtsdaten fehlen");

  return parts.join(" | ") || "Review verfügbar.";
}

function buildWeeklyReviewText() {
  const focus = data.settings.notifications.focus;
  const goals = data.settings.goals;
  const today = todayKey();
  const weightStats = buildWeightStats();
  const pool = calculateWeeklyCaloriePool(data.food_entries, goals.calorie_goal_kcal, today).pool;
  const autoTdee = calculateAutoTdee(data.weight_entries, data.food_entries, today);
  const parts = [];

  if (focus.calories) parts.push(`Rest-Pool ${pool >= 0 ? "+" : ""}${fmt(pool, 0)} kcal`);
  if (focus.weight && weightStats.avg7) parts.push(`Ø ${fmt(weightStats.avg7, 1)} kg`);
  if (focus.auto_tdee && autoTdee.available) parts.push(`Auto-TDEE ${fmt(autoTdee.tdee, 0)} kcal`);

  return parts.join(" | ") || "Wochen-Review verfügbar.";
}

function buildWeightStats() {
  const entries = data.weight_entries
    .filter((entry) => entry.date && toNumber(entry.weight_kg))
    .sort((a, b) => a.date.localeCompare(b.date));

  const latest = entries.at(-1) || null;
  const start = entries[0] || null;
  const avg7 = calculateMovingAverage(entries, 7);
  const avg14 = calculateMovingAverage(entries, 14);
  const weekly = calculateWeeklyAverageWeight(entries);
  const highestWeeklyAverage = weekly.reduce((highest, week) => {
    if (!highest || week.average > highest.average) return week;
    return highest;
  }, null);
  const latestWeeklyAverage = weekly.at(-1) || null;
  const trendWeight = avg7 || latest?.weight_kg || null;
  const bmi = calculateBMI(trendWeight, data.settings.profile.height_cm);

  return {
    entries,
    latest,
    start,
    avg7,
    avg14,
    weekly,
    highest: entries.reduce((max, entry) => (!max || entry.weight_kg > max.weight_kg ? entry : max), null),
    lowest: entries.reduce((min, entry) => (!min || entry.weight_kg < min.weight_kg ? entry : min), null),
    highestWeeklyAverage,
    latestWeeklyAverage,
    trendWeight,
    bmi,
    diffStart: latest && start ? latest.weight_kg - start.weight_kg : null,
    diff7: latest ? diffSince(entries, latest.date, 7) : null,
    diff30: latest ? diffSince(entries, latest.date, 30) : null,
    diffHighestWeeklyAverage: highestWeeklyAverage && trendWeight ? trendWeight - highestWeeklyAverage.average : null,
  };
}

function buildChatGptDailyContext() {
  const today = todayKey();
  const settings = data.settings;
  const goals = settings.goals;
  const nutrition = calculateDailyNutrition(data.food_entries, today);
  const weightStats = buildWeightStats();

  return {
    schema_version: 1,
    type: "chatgpt_daily_context",
    generated_at: toLocalIso(),
    date: today,
    profile: {
      birth_date: nullIfEmpty(settings.profile.birth_date),
      age: calculateAge(settings.profile.birth_date),
      sex: nullIfEmpty(settings.profile.sex),
      height_cm: nullIfEmpty(settings.profile.height_cm),
      current_weight_kg: nullIfEmpty(weightStats.latest?.weight_kg),
      trend_weight_kg: nullIfEmpty(weightStats.avg7),
      bmi: nullIfEmpty(weightStats.bmi),
    },
    goals: buildChatGptGoals(goals, settings),
    current_status: {
      calories: progressBlock(nutrition.calories_kcal, goals.calorie_goal_kcal, "kcal"),
      protein: progressBlock(nutrition.protein_g, goals.protein_goal_g, "g"),
      carbs: progressBlockOptionalGoal(nutrition.carbs_g, goals.carbs_goal_g, "g"),
      fat: progressBlockOptionalGoal(nutrition.fat_g, goals.fat_goal_g, "g"),
      fiber: progressBlockOptionalGoal(nutrition.fiber_g, goals.fiber_goal_g, "g"),
      sugar: maxBlockOptional(nutrition.sugar_g, goals.sugar_max_g, "g"),
      salt: maxBlockOptional(nutrition.salt_g, goals.salt_max_g, "g"),
    },
    today_food: data.food_entries
      .filter((entry) => entry.date === today)
      .map(cleanFoodForChatGpt),
    recent_weight: {
      latest: weightStats.latest
        ? {
            date: weightStats.latest.date,
            weight_kg: nullIfEmpty(weightStats.latest.weight_kg),
          }
        : null,
      seven_day_average_kg: nullIfEmpty(weightStats.avg7),
      change_since_start_kg: nullIfEmpty(weightStats.diffStart),
      change_last_30_days_kg: nullIfEmpty(weightStats.diff30),
    },
    instructions: {
      preferred_response_language: "de-CH",
      task: "Hilf mir, den Rest des Tages bezüglich Kalorien und Protein sinnvoll zu planen. Sei direkt und praktisch. Berücksichtige, was heute bereits gegessen wurde. Gib konkrete Vorschläge für Mahlzeiten, Snack-Optionen und Prioritäten.",
    },
  };
}

async function copyChatGptDailyContextToClipboard() {
  // The daily ChatGPT export must not depend on whether the initial background
  // sync has already completed. Refresh the in-memory daily series first so
  // the context contains the current Supabase weights whenever cloud access is
  // available; nutrition export still works if the request fails.
  if (state.authStatus.status === "authenticated") {
    await refreshWeightData();
  }

  const context = buildChatGptDailyContext();
  const json = JSON.stringify(context, null, 2);
  const platform = getPlatformKind();

  try {
    let copiedAs = "text";

    if (platform === "android") {
      copiedAs = await copyJsonBlobToClipboard(json).catch(async () => {
        await writeTextToClipboard(json);
        return "text";
      });
    } else {
      await writeTextToClipboard(json);
    }

    showChatGptCopiedDialog(copiedAs);
  } catch (error) {
    downloadJson(context, `fittrack-chatgpt-context-${context.date}.json`);
    showToast("Zwischenablage nicht verfügbar. JSON wurde heruntergeladen.");
  }
}

async function copyJsonBlobToClipboard(json) {
  if (!navigator.clipboard || !window.ClipboardItem) {
    throw new Error("ClipboardItem nicht unterstützt.");
  }

  const item = new ClipboardItem({
    "application/json": new Blob([json], { type: "application/json" }),
    "text/plain": new Blob([json], { type: "text/plain" }),
  });

  await navigator.clipboard.write([item]);
  return "json";
}

async function writeTextToClipboard(text) {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Zwischenablage nicht verfügbar.");
  }

  await navigator.clipboard.writeText(text);
}

function showChatGptCopiedDialog(copiedAs) {
  document.querySelector("#chatgpt-copy-dialog")?.remove();

  const formatText = copiedAs === "json"
    ? "Der Kontext wurde als JSON in die Zwischenablage kopiert. Falls ChatGPT ihn nicht als Datei erkennt, kannst du ihn als Text einfügen."
    : "Der Kontext wurde als JSON-Text in die Zwischenablage kopiert.";

  const dialog = document.createElement("div");
  dialog.id = "chatgpt-copy-dialog";
  dialog.className = "modal-backdrop";
  dialog.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="chatgpt-copy-title">
      <h2 id="chatgpt-copy-title">Heute in Zwischenablage kopiert</h2>
      <p>${safe(formatText)}</p>
      <p class="section-note">Öffne ChatGPT und füge den Kontext in einen neuen Chat ein. Der Kontext enthält persönliche Trackingdaten.</p>
      <div class="button-row">
        <button class="btn primary" type="button" data-action="open-chatgpt">ChatGPT öffnen</button>
        <button class="btn ghost" type="button" data-dialog-close>Schliessen</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  dialog.addEventListener("click", (event) => {
    if (event.target.closest("[data-action='open-chatgpt']")) {
      openChatGpt();
      return;
    }

    if (event.target === dialog || event.target.closest("[data-dialog-close]")) {
      dialog.remove();
    }
  });
}

function openChatGpt() {
  const fallback = window.setTimeout(() => {
    window.location.href = "https://chatgpt.com/";
  }, 900);

  window.addEventListener(
    "pagehide",
    () => window.clearTimeout(fallback),
    { once: true }
  );

  window.location.href = "chatgpt://";
}

function getPlatformKind() {
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);

  if (isIOS) return "ios";
  if (isAndroid) return "android";
  return "other";
}

function nullIfEmpty(value) {
  return value === undefined || value === null || value === "" ? null : value;
}

function buildChatGptGoals(goals, settings) {
  const output = {
    calories_kcal: nullIfEmpty(goals.calorie_goal_kcal),
    protein_g: nullIfEmpty(goals.protein_goal_g),
    fiber_g: nullIfEmpty(goals.fiber_goal_g),
    sugar_max_g: nullIfEmpty(goals.sugar_max_g),
    salt_max_g: nullIfEmpty(goals.salt_max_g),
    weight_goal_kg: nullIfEmpty(goals.weight_goal_kg),
    estimated_maintenance_kcal_range: {
      min: nullIfEmpty(settings.maintenance.min_kcal),
      max: nullIfEmpty(settings.maintenance.max_kcal),
    },
  };

  if (toNumber(goals.carbs_goal_g) > 0) output.carbs_g = toNumber(goals.carbs_goal_g);
  if (toNumber(goals.fat_goal_g) > 0) output.fat_g = toNumber(goals.fat_goal_g);
  return output;
}

function progressBlock(consumedRaw, goalRaw, unit) {
  const consumed = toNumber(consumedRaw) || 0;
  const goal = toNumber(goalRaw) || 0;

  if (!goal || goal <= 0) {
    return {
      consumed,
      goal: null,
      remaining: null,
      unit,
      progress_percent: null,
    };
  }

  return {
    consumed,
    goal,
    remaining: Math.max(goal - consumed, 0),
    unit,
    progress_percent: round((consumed / goal) * 100, 1),
  };
}

function progressBlockOptionalGoal(consumedRaw, goalRaw, unit) {
  const consumed = consumedRaw === null || consumedRaw === undefined ? null : toNumber(consumedRaw) || 0;
  const goal = goalRaw === null || goalRaw === undefined || goalRaw === "" ? null : toNumber(goalRaw) || 0;

  if (!goal || goal <= 0) {
    return {
      consumed,
      goal: null,
      remaining: null,
      unit,
      progress_percent: null,
    };
  }

  return {
    consumed: consumed || 0,
    goal,
    remaining: Math.max(goal - (consumed || 0), 0),
    unit,
    progress_percent: round(((consumed || 0) / goal) * 100, 1),
  };
}

function maxBlockOptional(consumedRaw, maxRaw, unit) {
  const consumed = consumedRaw === null || consumedRaw === undefined ? null : toNumber(consumedRaw) || 0;
  const max = maxRaw === null || maxRaw === undefined || maxRaw === "" ? null : toNumber(maxRaw) || 0;

  if (!max || max <= 0) {
    return {
      consumed,
      max: null,
      remaining: null,
      unit,
      progress_percent: null,
    };
  }

  return {
    consumed: consumed || 0,
    max,
    remaining: Math.max(max - (consumed || 0), 0),
    unit,
    progress_percent: round(((consumed || 0) / max) * 100, 1),
  };
}

function cleanFoodForChatGpt(entry) {
  return {
    meal: entry.meal || "",
    meal_label: mealLabel(entry.meal),
    name: entry.name || "",
    quantity: nullIfEmpty(entry.quantity),
    unit: entry.unit || null,
    calories_kcal: toNumber(entry.calories_kcal) || 0,
    protein_g: toNumber(entry.protein_g) || 0,
    carbs_g: toNumber(entry.carbs_g) || 0,
    fat_g: toNumber(entry.fat_g) || 0,
    fiber_g: nullIfEmpty(entry.fiber_g),
    sugar_g: nullIfEmpty(entry.sugar_g),
    salt_g: nullIfEmpty(entry.salt_g),
    notes: entry.notes || "",
  };
}

function mealLabel(mealValue) {
  return MEALS.find((meal) => meal.value === mealValue)?.label || "Ohne Mahlzeit";
}

function diffSince(entries, endDate, days) {
  const target = formatDateKey(addDays(parseDateKey(endDate), -days));
  const previous = [...entries].reverse().find((entry) => entry.date <= target);
  const latest = entries.find((entry) => entry.date === endDate);
  if (!previous || !latest) return null;
  return latest.weight_kg - previous.weight_kg;
}

function normalizeSex(sex) {
  return sex === "female" ? "female" : "male";
}

function renderWeightHistory() {
  const entries = [...data.weight_entries].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (!entries.length) {
    if (state.weightLoading) return `<div class="empty">Gewichtsdaten werden geladen …</div>`;
    if (state.weightError) return `<div class="empty">Gewichtsdaten konnten nicht mit Supabase verbunden werden. Dein Kalorientracking funktioniert weiterhin lokal.</div>`;
    return `<div class="empty">Noch keine Cloud-Gewichtseinträge.</div>`;
  }

  return `
    <div class="list">
      ${entries.map((entry) => `
        <div class="list-row">
          <div>
            <p class="list-row-title">${formatDate(entry.date)} · ${fmt(entry.weight_kg, 1)} kg</p>
            <p class="list-row-meta">Quelle: ${safe(weightSourceLabel(entry.source))}</p>
          </div>
          <div class="list-actions">
            ${entry.can_edit ? `
              <button class="btn small ghost" type="button" data-action="edit-weight" data-id="${attr(entry.id)}">Bearbeiten</button>
              <button class="btn small danger" type="button" data-action="delete-weight" data-id="${attr(entry.remote_id)}">Löschen</button>
            ` : `<span class="pill">Nicht hier bearbeitbar</span>`}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function weightSourceLabel(source) {
  if (source === "manual_nutrition") return "manuell in Nutrition";
  if (source === "manual_fitness") return "manuell in Fitness";
  if (source === "health_connect") return "Health Connect";
  if (source === "legacy_import") return "Legacy-Import";
  return "andere Quelle";
}

function renderCaloriePanel() {
  if (state.caloriePanel === "preset") return renderPresetEntryForm();
  if (state.caloriePanel === "new-preset") return renderFoodPresetForm();
  if (state.caloriePanel === "barcode") return renderBarcodeScanForm();
  if (state.caloriePanel === "import") return renderImportEntryForm();
  return renderQuickFoodForm();
}

function renderQuickFoodForm() {
  const entry = state.foodEntryEditId
    ? data.food_entries.find((item) => item.id === state.foodEntryEditId)
    : null;

  return `
    <form id="quick-food-form">
      <input type="hidden" name="entry_id" value="${attr(entry?.id || "")}">
      <div class="form-grid">
        ${field("Name", `<input name="name" autocomplete="off" value="${attr(entry?.name || "")}" required>`)}
        ${field("Mahlzeit", mealSelect("meal", entry?.meal || ""))}
        ${field("kcal", `<input type="number" name="calories_kcal" min="0" step="1" value="${attr(entry?.calories_kcal ?? "")}" required>`)}
        ${field("Protein g", `<input type="number" name="protein_g" min="0" step="0.1" value="${attr(entry?.protein_g ?? "")}" required>`)}
        ${field("KH g", `<input type="number" name="carbs_g" min="0" step="0.1" value="${attr(entry?.carbs_g ?? "")}" required>`)}
        ${field("Fett g", `<input type="number" name="fat_g" min="0" step="0.1" value="${attr(entry?.fat_g ?? "")}" required>`)}
        ${field("Ballaststoffe g", `<input type="number" name="fiber_g" min="0" step="0.1" value="${attr(entry?.fiber_g ?? "")}">`)}
        ${field("Zucker g", `<input type="number" name="sugar_g" min="0" step="0.1" value="${attr(entry?.sugar_g ?? "")}">`)}
        ${field("Salz g", `<input type="number" name="salt_g" min="0" step="0.1" value="${attr(entry?.salt_g ?? "")}">`)}
        ${field("Notiz", `<textarea name="notes">${safe(entry?.notes || "")}</textarea>`, "full")}
      </div>
      ${entry ? "" : `
        <label class="check-row">
          <input id="quick-save-preset" type="checkbox" name="quick_save_preset">
          Als Preset speichern
        </label>
        <div id="quick-preset-fields" class="form-grid" hidden>
          ${field("Preset-Typ", presetTypeSelect("preset_type"))}
          ${field("Einheit", `<input name="preset_unit" value="Portion">`)}
          ${field("Basis-Menge", `<input type="number" name="preset_base_quantity" min="0.01" step="0.01" value="1">`)}
        </div>
      `}
      <div class="button-row">
        <button class="btn primary" type="submit">${entry ? "Eintrag aktualisieren" : "Schnelleintrag speichern"}</button>
        ${entry ? `<button class="btn ghost" type="button" data-action="cancel-food-entry-edit">Abbrechen</button>` : ""}
      </div>
    </form>
  `;
}

function renderBarcodeScanForm() {
  if (!scannedProduct) {
    return `
      <div class="empty">
        Noch kein Produkt gescannt.
        <div class="button-row" style="margin-top: 10px;">
          <button class="btn primary" type="button" data-action="open-barcode-scanner">📷 Barcode Scannen</button>
        </div>
      </div>
    `;
  }

  const factor = scannedProduct.quantity / 100;

  return `
    <form id="barcode-food-form">
      <div class="form-grid">
        ${field("Name", `<input name="name" value="${attr(scannedProduct.name)}" required>`)}
        ${field("Menge g", `<input id="barcode-quantity" type="number" name="quantity" min="1" step="1" value="${attr(scannedProduct.quantity)}" required>`)}
        ${field("Mahlzeit", mealSelect("meal"))}
        ${field("kcal", `<input id="barcode-calories" type="number" name="calories_kcal" min="0" step="0.1" value="${attr(round(scannedProduct.caloriesPer100 * factor, 1))}">`)}
        ${field("Protein g", `<input id="barcode-protein" type="number" name="protein_g" min="0" step="0.1" value="${attr(round(scannedProduct.proteinPer100 * factor, 1))}">`)}
        ${field("KH g", `<input id="barcode-carbs" type="number" name="carbs_g" min="0" step="0.1" value="${attr(round(scannedProduct.carbsPer100 * factor, 1))}">`)}
        ${field("Fett g", `<input id="barcode-fat" type="number" name="fat_g" min="0" step="0.1" value="${attr(round(scannedProduct.fatPer100 * factor, 1))}">`)}
        ${field("Ballaststoffe g", `<input id="barcode-fiber" type="number" name="fiber_g" min="0" step="0.1" value="${attr(round(scannedProduct.fiberPer100 * factor, 1))}">`)}
        ${field("Zucker g", `<input id="barcode-sugar" type="number" name="sugar_g" min="0" step="0.1" value="${attr(round(scannedProduct.sugarPer100 * factor, 1))}">`)}
        ${field("Salz g", `<input id="barcode-salt" type="number" name="salt_g" min="0" step="0.1" value="${attr(round(scannedProduct.saltPer100 * factor, 1))}">`)}
        ${field("Notiz", `<textarea name="notes"></textarea>`, "full")}
      </div>
      <label class="check-row">
        <input id="barcode-save-preset" type="checkbox" name="barcode_save_preset">
        Als Preset speichern
      </label>
      <div id="barcode-preset-fields" class="form-grid" hidden>
        ${field("Preset-Typ", presetTypeSelect("preset_type"))}
        ${field("Einheit", `<input name="preset_unit" value="g">`)}
        ${field("Basis-Menge", `<input type="number" name="preset_base_quantity" min="0.01" step="0.01" value="100">`)}
      </div>
      <div class="button-row" style="margin-top: 10px;">
        <button class="btn primary" type="submit">Eintragen</button>
        <button class="btn ghost" type="button" data-action="cancel-barcode-scan">Neu scannen</button>
      </div>
    </form>
  `;
}

function renderImportEntryForm() {
  if (!importedEntry) {
    return `
      <div class="empty">
        Noch kein Eintrag importiert.
        <div class="button-row" style="margin-top: 10px;">
          <button class="btn primary" type="button" data-action="open-import-scanner">📷 Eintrag importieren</button>
        </div>
      </div>
    `;
  }

  return `
    <form id="import-food-form">
      <div class="form-grid">
        ${field("Name", `<input name="name" value="${attr(importedEntry.name)}" required>`)}
        ${field("Mahlzeit", mealSelect("meal", importedEntry.meal || ""))}
        ${field("kcal", `<input type="number" name="calories_kcal" min="0" step="0.1" value="${attr(importedEntry.calories_kcal)}" required>`)}
        ${field("Protein g", `<input type="number" name="protein_g" min="0" step="0.1" value="${attr(importedEntry.protein_g)}" required>`)}
        ${field("KH g", `<input type="number" name="carbs_g" min="0" step="0.1" value="${attr(importedEntry.carbs_g)}" required>`)}
        ${field("Fett g", `<input type="number" name="fat_g" min="0" step="0.1" value="${attr(importedEntry.fat_g)}" required>`)}
        ${field("Ballaststoffe g", `<input type="number" name="fiber_g" min="0" step="0.1" value="${attr(importedEntry.fiber_g ?? "")}">`)}
        ${field("Zucker g", `<input type="number" name="sugar_g" min="0" step="0.1" value="${attr(importedEntry.sugar_g ?? "")}">`)}
        ${field("Salz g", `<input type="number" name="salt_g" min="0" step="0.1" value="${attr(importedEntry.salt_g ?? "")}">`)}
        ${field("Notiz", `<textarea name="notes">${safe(importedEntry.notes || "")}</textarea>`, "full")}
      </div>
      <div class="button-row" style="margin-top: 10px;">
        <button class="btn primary" type="submit">Eintragen</button>
        <button class="btn ghost" type="button" data-action="cancel-import-scan">Neu scannen</button>
      </div>
    </form>
  `;
}

function renderPresetEntryForm() {
  if (!data.food_presets.length) {
    return `<div class="empty">Noch keine Presets. Lege zuerst ein Preset an.</div>`;
  }

  return `
    <form id="preset-food-form">
      <div class="form-grid">
        ${field("Preset", `
          <select id="preset-select" name="preset_id" required>
            ${data.food_presets.map((preset) => `<option value="${attr(preset.id)}">${safe(preset.name)} · ${presetTypeLabel(preset)}</option>`).join("")}
          </select>
        `)}
        ${field("Menge", `<input id="preset-quantity" type="number" name="quantity" min="0.01" step="0.01" value="1" required>`)}
        ${field("Mahlzeit", mealSelect("meal"))}
        ${field("Notiz", `<textarea name="notes"></textarea>`, "full")}
      </div>
      <div id="preset-preview" class="pill-row"></div>
      <button class="btn primary" type="submit">Aus Preset eintragen</button>
    </form>
  `;
}

function renderFoodPresetForm() {
  const preset = state.foodPresetEditId
    ? data.food_presets.find((item) => item.id === state.foodPresetEditId)
    : null;

  return `
    <form id="food-preset-form">
      <input type="hidden" name="preset_id" value="${attr(preset?.id || "")}">
      <div class="form-grid">
        ${field("Name", `<input name="name" value="${attr(preset?.name || "")}" required>`)}
        ${field("Typ", presetTypeSelect("type", "food-preset-type", preset?.type))}
        ${field("Einheit", `<input id="food-preset-unit" name="unit" value="${attr(preset?.unit || "g")}" required>`)}
        ${field("Basis-Menge", `<input id="food-preset-base" type="number" name="base_quantity" min="0.01" step="0.01" value="${attr(preset?.base_quantity ?? 100)}" required>`)}
        ${field("kcal", `<input type="number" name="calories_kcal" min="0" step="1" value="${attr(preset?.calories_kcal ?? "")}" required>`)}
        ${field("Protein g", `<input type="number" name="protein_g" min="0" step="0.1" value="${attr(preset?.protein_g ?? "")}" required>`)}
        ${field("KH g", `<input type="number" name="carbs_g" min="0" step="0.1" value="${attr(preset?.carbs_g ?? "")}" required>`)}
        ${field("Fett g", `<input type="number" name="fat_g" min="0" step="0.1" value="${attr(preset?.fat_g ?? "")}" required>`)}
        ${field("Ballaststoffe g", `<input type="number" name="fiber_g" min="0" step="0.1" value="${attr(preset?.fiber_g ?? "")}">`)}
        ${field("Zucker g", `<input type="number" name="sugar_g" min="0" step="0.1" value="${attr(preset?.sugar_g ?? "")}">`)}
        ${field("Salz g", `<input type="number" name="salt_g" min="0" step="0.1" value="${attr(preset?.salt_g ?? "")}">`)}
        ${field("Tags", `<input name="tags" placeholder="Protein, Fast Food" value="${attr((preset?.tags || []).join(", "))}">`, "full")}
      </div>
      <div class="button-row">
        <button class="btn primary" type="submit">${preset ? "Preset aktualisieren" : "Preset speichern"}</button>
        ${preset ? `<button class="btn ghost" type="button" data-action="cancel-food-preset-edit">Abbrechen</button>` : ""}
      </div>
    </form>
  `;
}

function renderFoodEntriesForDate(date) {
  const rows = data.food_entries.filter((entry) => entry.date === date);
  if (!rows.length) return `<div class="empty">Noch keine Kalorieneinträge für diesen Tag.</div>`;

  return `
    <div class="screen-stack">
      ${MEALS.map((meal) => {
        const entries = rows.filter((entry) => (entry.meal || "") === meal.value);
        if (!entries.length) return "";
        return `
          <div class="meal-group">
            <div class="meal-title"><span>${safe(meal.label)}</span><span>${fmt(calculateDailyNutrition(entries, date).calories_kcal, 0)} kcal</span></div>
            <div class="list">
              ${entries.map((entry) => `
                <div class="list-row">
                  <div>
                    <p class="list-row-title">${safe(entry.name)} · ${fmt(entry.calories_kcal, 0)} kcal</p>
                    <p class="list-row-meta">${fmt(entry.protein_g, 1)}g Protein · ${fmt(entry.carbs_g, 1)}g KH · ${fmt(entry.fat_g, 1)}g Fett${entry.notes ? ` · ${safe(entry.notes)}` : ""}</p>
                  </div>
                  <div class="list-actions">
                    <button class="btn small ghost" type="button" data-action="edit-food" data-id="${attr(entry.id)}">Bearbeiten</button>
                    <button class="btn small danger" type="button" data-action="delete-food" data-id="${attr(entry.id)}">Löschen</button>
                    <button class="btn small ghost" type="button" data-action="share-food" data-id="${attr(entry.id)}">Eintrag teilen</button>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderFoodPresetList() {
  if (!data.food_presets.length) return `<div class="empty">Noch keine Food-Presets.</div>`;

  return `
    <div class="list">
      ${data.food_presets.map((preset) => `
        <div class="list-row">
          <div>
            <p class="list-row-title">${safe(preset.name)}</p>
            <p class="list-row-meta">${presetTypeLabel(preset)} · ${fmt(preset.calories_kcal, 0)} kcal · ${fmt(preset.protein_g, 1)}g Protein · ${fmt(preset.carbs_g, 1)}g KH · ${fmt(preset.fat_g, 1)}g Fett${preset.tags?.length ? ` · ${preset.tags.map(safe).join(", ")}` : ""}</p>
          </div>
          <div class="list-actions">
            <button class="btn small ghost" type="button" data-action="edit-food-preset" data-id="${attr(preset.id)}">Bearbeiten</button>
            <button class="btn small danger" type="button" data-action="delete-food-preset" data-id="${attr(preset.id)}">Löschen</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function drawCharts() {
  document.querySelectorAll("[data-chart]").forEach((canvas) => {
    const chart = canvas.dataset.chart;
    if (chart === "dashboard-weight") drawDashboardWeightChart(canvas, data.weight_entries);
  });
  updatePresetPreview();

  const scrollParent = document.querySelector("[data-chart-scroll='dashboard-weight']");
  if (scrollParent) scrollParent.scrollLeft = scrollParent.scrollWidth;
}

const WEIGHT_CHART_PX_PER_DAY = 6;

function drawDashboardWeightChart(canvas, weightEntries) {
  const { points } = calculateWeightChartSeries(weightEntries);
  if (!points.length) return drawEmptyChart(canvas, "Noch keine Gewichtsdaten");

  canvas.style.width = `${Math.max(points.length * WEIGHT_CHART_PX_PER_DAY, 220)}px`;

  const { ctx, width, height } = setupCanvas(canvas);
  const padding = { top: 18, right: 16, bottom: 28, left: 16 };
  const values = points.flatMap((point) => [point.raw, point.avg]).filter((value) => value !== null);
  const min = Math.min(...values) - 0.5;
  const max = Math.max(...values) + 0.5;

  const xForIndex = (index) => padding.left + (index / Math.max(points.length - 1, 1)) * (width - padding.left - padding.right);
  const yForValue = (value) => height - padding.bottom - ((value - min) / Math.max(max - min, 1)) * (height - padding.top - padding.bottom);

  ctx.clearRect(0, 0, width, height);
  drawGrid(ctx, width, height, padding);

  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.fillStyle = "#9eacbd";
  ctx.font = "700 10px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  let lastMonth = null;
  points.forEach((point, index) => {
    const month = point.date.slice(0, 7);
    if (month === lastMonth) return;
    lastMonth = month;
    const x = xForIndex(index);
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, height - padding.bottom);
    ctx.stroke();
    ctx.fillText(formatMonthLabel(point.date), x + 3, height - 9);
  });

  ctx.fillStyle = "rgba(115, 167, 255, 0.5)";
  points.forEach((point, index) => {
    if (point.raw === null) return;
    const x = xForIndex(index);
    const y = yForValue(point.raw);
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.strokeStyle = "#55c7a1";
  ctx.lineWidth = 3;
  ctx.beginPath();
  let drawing = false;
  points.forEach((point, index) => {
    if (point.avg === null) {
      drawing = false;
      return;
    }
    const x = xForIndex(index);
    const y = yForValue(point.avg);
    if (!drawing) {
      ctx.moveTo(x, y);
      drawing = true;
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();
}

function formatMonthLabel(dateKey) {
  const date = parseDateKey(dateKey);
  if (!date) return "";
  return new Intl.DateTimeFormat("de-CH", { month: "short", year: "2-digit" }).format(date);
}

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(rect.width, 220);
  const height = Math.max(rect.height, 150);
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width, height };
}

function drawEmptyChart(canvas, text) {
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(255,255,255,0.035)";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#9eacbd";
  ctx.font = "700 14px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, width / 2, height / 2);
}

function drawGrid(ctx, width, height, padding) {
  ctx.fillStyle = "rgba(255,255,255,0.035)";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i += 1) {
    const y = padding.top + (i / 3) * (height - padding.top - padding.bottom);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }
}

function updatePresetPreview() {
  const preview = document.querySelector("#preset-preview");
  if (!preview) return;
  const presetId = document.querySelector("#preset-select")?.value;
  const quantity = toNumber(document.querySelector("#preset-quantity")?.value) || 0;
  const preset = data.food_presets.find((item) => item.id === presetId);
  if (!preset || !quantity) {
    preview.innerHTML = "";
    return;
  }

  const factor = quantity / (toNumber(preset.base_quantity) || 1);
  preview.innerHTML = `
    <span class="pill">${fmt((toNumber(preset.calories_kcal) || 0) * factor, 0)} kcal</span>
    <span class="pill">${fmt((toNumber(preset.protein_g) || 0) * factor, 1)}g Protein</span>
    <span class="pill">${fmt((toNumber(preset.carbs_g) || 0) * factor, 1)}g KH</span>
    <span class="pill">${fmt((toNumber(preset.fat_g) || 0) * factor, 1)}g Fett</span>
  `;
}

function updateBarcodeFormFromQuantity() {
  if (!scannedProduct) return;
  const quantity = toNumber(document.querySelector("#barcode-quantity")?.value) || 0;
  const factor = quantity / 100;
  const fields = {
    "#barcode-calories": scannedProduct.caloriesPer100,
    "#barcode-protein": scannedProduct.proteinPer100,
    "#barcode-carbs": scannedProduct.carbsPer100,
    "#barcode-fat": scannedProduct.fatPer100,
    "#barcode-fiber": scannedProduct.fiberPer100,
    "#barcode-sugar": scannedProduct.sugarPer100,
    "#barcode-salt": scannedProduct.saltPer100,
  };
  for (const [selector, per100] of Object.entries(fields)) {
    const input = document.querySelector(selector);
    if (input) input.value = round(per100 * factor, 1);
  }
}

async function openBarcodeOverlay(mode = "barcode") {
  scanMode = mode;
  const overlay = document.querySelector("#barcode-overlay");
  const video = document.querySelector("#barcode-video");
  const statusEl = document.querySelector("#barcode-status");
  const centerText = scanMode === "import" ? "QR-Code im Bild zentrieren..." : "Barcode im Bild zentrieren...";
  overlay.hidden = false;
  statusEl.textContent = "Kamera wird gestartet...";

  const handleDetected = (value) => (scanMode === "import" ? handleImportQrDetected(value) : handleBarcodeDetected(value));

  try {
    if ("BarcodeDetector" in window) {
      barcodeStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      video.srcObject = barcodeStream;
      await video.play();
      const formats = scanMode === "import" ? ["qr_code"] : ["ean_13", "ean_8", "upc_a", "upc_e"];
      const detector = new BarcodeDetector({ formats });
      statusEl.textContent = centerText;

      const scanLoop = async () => {
        if (overlay.hidden) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length) {
            await handleDetected(codes[0].rawValue);
            return;
          }
        } catch {
          // Erkennung schlug für diesen Frame fehl, einfach weiter scannen.
        }
        barcodeAnimationFrame = requestAnimationFrame(scanLoop);
      };
      scanLoop();
    } else {
      await loadZXingScript();
      statusEl.textContent = centerText;
      const reader = new ZXingBrowser.BrowserMultiFormatReader();
      zxingControls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
        if (result) handleDetected(result.getText());
      });
    }
  } catch (error) {
    statusEl.textContent = `Kamera nicht verfügbar: ${error.message || "unbekannter Fehler"}`;
  }
}

function closeBarcodeOverlay() {
  const overlay = document.querySelector("#barcode-overlay");
  overlay.hidden = true;

  if (barcodeAnimationFrame) cancelAnimationFrame(barcodeAnimationFrame);
  barcodeAnimationFrame = null;

  if (zxingControls) {
    zxingControls.stop();
    zxingControls = null;
  }

  if (barcodeStream) {
    barcodeStream.getTracks().forEach((track) => track.stop());
    barcodeStream = null;
  }

  const video = document.querySelector("#barcode-video");
  if (video) video.srcObject = null;
}

function loadZXingScript() {
  if (window.ZXingBrowser) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Barcode-Library konnte nicht geladen werden."));
    document.head.appendChild(script);
  });
}

async function handleBarcodeDetected(barcode) {
  const statusEl = document.querySelector("#barcode-status");
  statusEl.textContent = "Produkt wird gesucht...";

  try {
    const response = await fetch(`https://ch.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`);
    const payload = await response.json();
    if (payload.status !== 1 || !payload.product) throw new Error("Produkt nicht gefunden.");

    const product = payload.product;
    const nutriments = product.nutriments || {};
    const quantity = toNumber(product.product_quantity) || toNumber(parseFloat(product.serving_size)) || 100;

    scannedProduct = {
      name: product.product_name || "Gescanntes Produkt",
      quantity,
      caloriesPer100: toNumber(nutriments["energy-kcal_100g"]) || 0,
      proteinPer100: toNumber(nutriments.proteins_100g) || 0,
      carbsPer100: toNumber(nutriments.carbohydrates_100g) || 0,
      fatPer100: toNumber(nutriments.fat_100g) || 0,
      fiberPer100: toNumber(nutriments.fiber_100g) || 0,
      sugarPer100: toNumber(nutriments.sugars_100g) || 0,
      saltPer100: toNumber(nutriments.salt_100g) || 0,
    };

    closeBarcodeOverlay();
    state.caloriePanel = "barcode";
    await render();
  } catch (error) {
    statusEl.textContent = error.message || "Produkt nicht gefunden.";
  }
}

async function handleImportQrDetected(rawText) {
  const statusEl = document.querySelector("#barcode-status");
  try {
    const payload = JSON.parse(rawText);
    if (payload.type !== "fittrack_food_entry") throw new Error("Kein FitTrack-Eintrag.");

    importedEntry = {
      name: payload.name || "Importierter Eintrag",
      meal: payload.meal || "",
      quantity: toNumber(payload.quantity) || 1,
      unit: payload.unit || "Portion",
      calories_kcal: toNumber(payload.calories_kcal) || 0,
      protein_g: toNumber(payload.protein_g) || 0,
      carbs_g: toNumber(payload.carbs_g) || 0,
      fat_g: toNumber(payload.fat_g) || 0,
      fiber_g: payload.fiber_g != null ? toNumber(payload.fiber_g) : null,
      sugar_g: payload.sugar_g != null ? toNumber(payload.sugar_g) : null,
      salt_g: payload.salt_g != null ? toNumber(payload.salt_g) : null,
      notes: payload.notes || "",
    };

    closeBarcodeOverlay();
    state.caloriePanel = "import";
    await render();
  } catch {
    statusEl.textContent = "QR-Code ungültig oder kein FitTrack-Eintrag.";
  }
}

async function shareFoodEntry(id) {
  const entry = data.food_entries.find((item) => item.id === id);
  if (!entry) return;

  const payload = JSON.stringify({
    type: "fittrack_food_entry",
    v: 1,
    name: entry.name,
    meal: entry.meal,
    quantity: entry.quantity,
    unit: entry.unit,
    calories_kcal: entry.calories_kcal,
    protein_g: entry.protein_g,
    carbs_g: entry.carbs_g,
    fat_g: entry.fat_g,
    fiber_g: entry.fiber_g,
    sugar_g: entry.sugar_g,
    salt_g: entry.salt_g,
    notes: entry.notes,
  });

  await openShareOverlay(payload, entry.name);
}

async function openShareOverlay(text, title) {
  const overlay = document.querySelector("#share-overlay");
  const titleEl = document.querySelector("#share-title");
  const container = document.querySelector("#share-qr-canvas");
  titleEl.textContent = title || "Eintrag teilen";
  overlay.hidden = false;
  container.innerHTML = "";

  try {
    await loadQrCodeScript();
    new window.QRCode(container, {
      text,
      width: 240,
      height: 240,
      correctLevel: window.QRCode.CorrectLevel.M,
    });
  } catch (error) {
    overlay.hidden = true;
    showToast(error.message || "QR-Code konnte nicht erzeugt werden.");
  }
}

function closeShareOverlay() {
  const overlay = document.querySelector("#share-overlay");
  if (overlay) overlay.hidden = true;
}

function loadQrCodeScript() {
  if (window.QRCode) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("QR-Library konnte nicht geladen werden."));
    document.head.appendChild(script);
  });
}

async function saveImportedFood(form) {
  const name = formValue(form, "name");
  if (!name) throw new Error("Bitte Name eintragen.");

  const entry = buildFoodEntryFromForm(form, {
    id: generateId("food"),
    date: state.selectedDate,
    name,
    meal: formValue(form, "meal"),
    quantity: importedEntry?.quantity ?? 1,
    unit: importedEntry?.unit ?? "Portion",
    preset_id: null,
  });

  await putItem("food_entries", entry);
  importedEntry = null;
  state.caloriePanel = "quick";
  showToast("Eintrag importiert.");
  await render();
}

function applyPresetTypeDefaults(type) {
  const unit = document.querySelector("#food-preset-unit");
  const base = document.querySelector("#food-preset-base");
  if (!unit || !base) return;

  if (type === "ingredient_100g") {
    unit.value = "g";
    base.value = "100";
  } else {
    unit.value = "Stück";
    base.value = "1";
  }
}

function buildFoodEntryFromForm(form, base) {
  const now = toLocalIso();
  return {
    ...base,
    calories_kcal: nonNegativeNumber(form, "calories_kcal", "Kalorien dürfen nicht negativ sein."),
    protein_g: nonNegativeNumber(form, "protein_g", "Protein darf nicht negativ sein."),
    carbs_g: nonNegativeNumber(form, "carbs_g", "KH dürfen nicht negativ sein."),
    fat_g: nonNegativeNumber(form, "fat_g", "Fett darf nicht negativ sein."),
    fiber_g: optionalNonNegativeNumber(form, "fiber_g", "Ballaststoffe dürfen nicht negativ sein."),
    sugar_g: optionalNonNegativeNumber(form, "sugar_g", "Zucker darf nicht negativ sein."),
    salt_g: optionalNonNegativeNumber(form, "salt_g", "Salz darf nicht negativ sein."),
    notes: formValue(form, "notes"),
    created_at: now,
    updated_at: now,
  };
}

function buildPresetFromValues(values) {
  const now = toLocalIso();
  return {
    id: generateId("preset"),
    type: values.type || "unit_item",
    name: values.name,
    base_quantity: values.base_quantity || (values.type === "ingredient_100g" ? 100 : 1),
    unit: values.unit || (values.type === "ingredient_100g" ? "g" : "Stück"),
    calories_kcal: values.calories_kcal,
    protein_g: values.protein_g,
    carbs_g: values.carbs_g,
    fat_g: values.fat_g,
    fiber_g: values.fiber_g,
    sugar_g: values.sugar_g,
    salt_g: values.salt_g,
    tags: values.tags || [],
    created_at: now,
    updated_at: now,
  };
}

function notificationFocusCheckbox(key, label, focus) {
  return `
    <label class="check-row">
      <input type="checkbox" name="focus_${attr(key)}" ${focus?.[key] ? "checked" : ""}>
      ${safe(label)}
    </label>
  `;
}

function field(label, control, className = "") {
  return `
    <label class="field ${className}">
      <span>${safe(label)}</span>
      ${control}
    </label>
  `;
}

function renderMetric(label, value, sub = "") {
  return `
    <div class="metric">
      <div class="metric-label">${safe(label)}</div>
      <div class="metric-value">${safe(value)}</div>
      ${sub ? `<div class="metric-sub">${safe(sub)}</div>` : ""}
    </div>
  `;
}

function renderMetricCard(label, value, sub = "") {
  return `<article class="card">${renderMetric(label, value, sub)}</article>`;
}

function renderBmiGauge(bmi) {
  const scaleMin = 15;
  const scaleMax = 35;
  const zones = [
    { className: "underweight", from: scaleMin, to: 18.5 },
    { className: "normal", from: 18.5, to: 25 },
    { className: "overweight", from: 25, to: 30 },
    { className: "obese", from: 30, to: scaleMax },
  ];
  const value = toNumber(bmi);
  const markerPercent = value !== null
    ? Math.min(100, Math.max(0, ((value - scaleMin) / (scaleMax - scaleMin)) * 100))
    : null;

  return `
    <div class="bmi-gauge">
      ${zones.map((zone) => `<span class="bmi-gauge-zone ${zone.className}" style="width: ${((zone.to - zone.from) / (scaleMax - scaleMin)) * 100}%"></span>`).join("")}
      ${markerPercent !== null ? `<span class="bmi-gauge-marker" style="left: ${markerPercent}%"></span>` : ""}
    </div>
  `;
}

function renderProgressRow(label, current, goal, unit, options = {}) {
  const currentValue = toNumber(current) || 0;
  const goalValue = toNumber(goal) || 0;
  const progress = percent(currentValue, goalValue);
  const progressClass = progress > 100 && options.kind !== "protein" ? "warn" : "ok";
  return `
    <div>
      <div class="kpi-row">
        <div class="kpi-main">
          <p class="kpi-title">${safe(label)}</p>
          <p class="kpi-sub">${goalValue ? `${fmt(currentValue, 0)} ${safe(unit)} / ${fmt(goalValue, 0)} ${safe(unit)}` : `${fmt(currentValue, 0)} ${safe(unit)} · kein Ziel gesetzt`}</p>
        </div>
        <div class="kpi-value">${goalValue ? `${fmt(progress, 0)}%` : "–"}</div>
      </div>
      <div class="progress ${progressClass}" style="--value: ${goalValue ? Math.min(progress, 120) : 0}%"><span></span></div>
    </div>
  `;
}

function renderNutrientRow(label, value, unit, goal, options = {}) {
  const decimals = options.decimals ?? 1;
  const current = toNumber(value) || 0;
  const target = toNumber(goal);
  const targetText = target && target > 0
    ? `${options.max ? "max. " : "Ziel "}${fmt(target, decimals)} ${unit}`
    : "kein Ziel";

  return `
    <div class="nutrient-row">
      <span>${safe(label)}</span>
      <strong>${fmt(current, decimals)} ${safe(unit)}</strong>
      <small>${safe(targetText)}</small>
    </div>
  `;
}

function goalValueText(value, goal, unit, decimals = 0) {
  const current = fmt(toNumber(value) || 0, decimals);
  const target = toNumber(goal);
  return target && target > 0
    ? `${current}${unit === "kcal" ? "" : unit} / ${fmt(target, decimals)}${unit === "kcal" ? "" : unit}`
    : `${current}${unit === "kcal" ? "" : unit}`;
}

function optionalGoalSub(value, goal) {
  const target = toNumber(goal);
  return target && target > 0 ? `${fmt(percent(value, target), 0)}% vom Ziel` : "informativ";
}

function caloriePillClass(calories, goal) {
  const target = toNumber(goal);
  if (!target || target <= 0) return "";
  return (toNumber(calories) || 0) <= target ? "ok" : "warn";
}

function goalSummary(goal, unit) {
  const value = toNumber(goal);
  return value && value > 0 ? `${fmt(value, 0)} ${unit}` : "nicht gesetzt";
}

function renderOptionalNutrition(nutrition) {
  return `
    <div class="pill-row">
      ${nutrition.fiber_g ? `<span class="pill">Ballaststoffe ${fmt(nutrition.fiber_g, 1)}g</span>` : ""}
      ${nutrition.sugar_g ? `<span class="pill">Zucker ${fmt(nutrition.sugar_g, 1)}g</span>` : ""}
      ${nutrition.salt_g ? `<span class="pill">Salz ${fmt(nutrition.salt_g, 1)}g</span>` : ""}
    </div>
  `;
}

function panelButton(panel, label) {
  return `<button class="btn ${state.caloriePanel === panel ? "primary" : "ghost"}" type="button" data-action="set-calorie-panel" data-panel="${attr(panel)}">${safe(label)}</button>`;
}

function mealSelect(name, selected = "") {
  return `
    <select name="${attr(name)}">
      ${MEALS.map((meal) => option(meal.value, meal.label, selected)).join("")}
    </select>
  `;
}

function presetTypeSelect(name, id = "", selected = "ingredient_100g") {
  return `
    <select ${id ? `id="${attr(id)}"` : ""} name="${attr(name)}">
      ${option("ingredient_100g", "Zutat / pro 100g", selected)}
      ${option("unit_item", "Fertigprodukt / Einheit", selected)}
    </select>
  `;
}

function option(value, label, selected) {
  return `<option value="${attr(value)}" ${value === selected ? "selected" : ""}>${safe(label)}</option>`;
}

function presetTypeLabel(preset) {
  if (preset.type === "ingredient_100g") return `pro ${fmt(preset.base_quantity, 0)}${preset.unit || "g"}`;
  return `pro ${fmt(preset.base_quantity, 0)} ${preset.unit || "Stück"}`;
}

function calorieBalanceText(calories, goal) {
  const delta = (toNumber(goal) || 0) - (toNumber(calories) || 0);
  if (delta >= 0) return `Noch ${fmt(delta, 0)} kcal offen`;
  return `${fmt(Math.abs(delta), 0)} kcal über Ziel`;
}

function maintenanceText(maintenance) {
  if (!maintenance) return "nicht gesetzt";
  if (maintenance.below_min > 0) {
    return `unter Maintenance: ${fmt(maintenance.below_min, 0)}–${fmt(maintenance.below_max, 0)} kcal`;
  }
  if (maintenance.max_delta <= 0) {
    return "innerhalb der Range";
  }
  return `${fmt(maintenance.max_delta, 0)} kcal über Range`;
}

function lastNDays(endDateKey, days) {
  const end = parseDateKey(endDateKey);
  return Array.from({ length: days }, (_, index) => formatDateKey(addDays(end, -days + 1 + index)));
}

function formValue(form, name) {
  const element = form.elements.namedItem(name);
  return element?.value?.trim() || "";
}

function requiredPositiveNumber(form, name, message) {
  const value = toNumber(formValue(form, name));
  if (value === null || value <= 0) throw new Error(message);
  return value;
}

function nonNegativeNumber(form, name, message) {
  const value = toNumber(formValue(form, name));
  if (value === null || value < 0) throw new Error(message);
  return value;
}

function optionalNumber(form, name) {
  return toNumber(formValue(form, name));
}

function optionalPositiveNumber(form, name, message) {
  const value = optionalNumber(form, name);
  if (value === null) return null;
  if (value <= 0) throw new Error(message);
  return value;
}

function optionalNonNegativeNumber(form, name, message) {
  const value = optionalNumber(form, name);
  if (value === null) return null;
  if (value < 0) throw new Error(message);
  return value;
}

function splitTags(value) {
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

function scaleOptional(value, factor) {
  if (value === null || value === undefined || value === "") return null;
  return round((toNumber(value) || 0) * factor, 1);
}

function percent(current, goal) {
  const goalValue = toNumber(goal);
  if (!goalValue || goalValue <= 0) return 0;
  return ((toNumber(current) || 0) / goalValue) * 100;
}

function fmt(value, digits = 0) {
  const number = toNumber(value);
  if (number === null) return "–";
  return new Intl.NumberFormat("de-CH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(number);
}

function fmtSigned(value, digits = 0) {
  const number = toNumber(value);
  if (number === null) return "–";
  const sign = number > 0 ? "+" : "";
  return `${sign}${fmt(number, digits)}`;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((toNumber(value) || 0) * factor) / factor;
}

function formatDate(dateKey) {
  const date = parseDateKey(dateKey);
  if (!date) return "–";
  return new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function safe(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function attr(value) {
  return safe(value);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!["http:", "https:"].includes(location.protocol)) return;

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.register("./service-worker.js").then((registration) => {
    if (registration.waiting) {
      showUpdateBanner(registration.waiting);
    }

    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;

      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          showUpdateBanner(worker);
        }
      });
    });
  }).catch(() => {
    /* Service Worker ist optional fuer lokale Entwicklung. */
  });
}

function showUpdateBanner(worker) {
  state.waitingServiceWorker = worker;
  if (!updateBanner) return;
  updateBanner.hidden = false;
  requestAnimationFrame(() => updateBanner.classList.add("is-visible"));
}
