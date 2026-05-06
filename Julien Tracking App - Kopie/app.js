import {
  deleteItem,
  generateId,
  getAll,
  getItem,
  getSettings,
  putItem,
  saveSettings,
  todayKey,
  toLocalIso,
} from "./db.js";
import {
  addDays,
  average,
  calculateAge,
  calculateBMI,
  calculateDailyNutrition,
  calculateMaintenanceDelta,
  calculateMovingAverage,
  calculateNavyBodyFat,
  calculateStrengthWorkoutVolume,
  calculateWeeklyAverageWeight,
  calculateWeeklyTrainingStats,
  formatDateKey,
  getBMICategory,
  parseDateKey,
  toNumber,
} from "./calculations.js";
import {
  downloadFullExport,
  mergeImportData,
  readJsonFile,
  replaceAllData,
} from "./export-import.js";

const app = document.querySelector("#app");
const screenTitle = document.querySelector("#screen-title");
const toast = document.querySelector("#toast");

const TAB_TITLES = {
  dashboard: "Dashboard",
  weight: "Gewicht",
  calories: "Kalorien",
  training: "Training",
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

const STORE_LABELS = {
  weight_entries: "Gewicht",
  food_entries: "Kalorien",
  food_presets: "Food-Presets",
  workouts: "Trainings",
  exercise_presets: "Übungen",
};

const state = {
  tab: "dashboard",
  selectedDate: todayKey(),
  caloriePanel: "quick",
  workoutType: "strength",
  weightEditId: null,
  strengthDraft: [],
};

let data = {
  settings: null,
  weight_entries: [],
  food_entries: [],
  food_presets: [],
  workouts: [],
  exercise_presets: [],
};

let toastTimer = null;
let renderToken = 0;

init();

async function init() {
  bindEvents();
  await render();
  registerServiceWorker();
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

  app.addEventListener("click", handleActionClick);
  app.addEventListener("submit", handleSubmit);
  app.addEventListener("change", handleChange);
  app.addEventListener("input", handleInput);
}

async function loadData() {
  const [settings, weights, foods, foodPresets, workouts, exercisePresets] = await Promise.all([
    getSettings(),
    getAll("weight_entries"),
    getAll("food_entries"),
    getAll("food_presets"),
    getAll("workouts"),
    getAll("exercise_presets"),
  ]);

  return {
    settings,
    weight_entries: weights.sort((a, b) => (a.date || "").localeCompare(b.date || "")),
    food_entries: foods.sort((a, b) => `${a.date || ""}${a.created_at || ""}`.localeCompare(`${b.date || ""}${b.created_at || ""}`)),
    food_presets: foodPresets.sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    workouts: workouts.sort((a, b) => (a.date || "").localeCompare(b.date || "")),
    exercise_presets: exercisePresets.sort((a, b) => (a.name || "").localeCompare(b.name || "")),
  };
}

async function refreshData() {
  data = await loadData();
  return data;
}

async function render() {
  const token = ++renderToken;
  const nextData = await loadData();
  if (token !== renderToken) return;

  data = nextData;
  screenTitle.textContent = TAB_TITLES[state.tab] || "Dashboard";
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === state.tab);
  });

  const body = {
    dashboard: renderDashboard,
    weight: renderWeight,
    calories: renderCalories,
    training: renderTraining,
    more: renderMore,
  }[state.tab]();

  app.innerHTML = `<div class="screen-stack">${renderReminderBanner()}${body}</div>`;
  requestAnimationFrame(drawCharts);
}

function renderDashboard() {
  const today = todayKey();
  const settings = data.settings;
  const goals = settings.goals;
  const weightStats = buildWeightStats();
  const nutrition = calculateDailyNutrition(data.food_entries, today);
  const trainingStats = calculateWeeklyTrainingStats(data.workouts, today).thisWeek;
  const avgCalories7 = average(lastNDays(today, 7).map((date) => calculateDailyNutrition(data.food_entries, date).calories_kcal));
  const avgProtein7 = average(lastNDays(today, 7).map((date) => calculateDailyNutrition(data.food_entries, date).protein_g));
  const proteinHits14 = lastNDays(today, 14).filter((date) => calculateDailyNutrition(data.food_entries, date).protein_g >= goals.protein_goal_g).length;
  const calorieDelta14 = average(lastNDays(today, 14).map((date) => calculateDailyNutrition(data.food_entries, date).calories_kcal - goals.calorie_goal_kcal));
  const maintenance = calculateMaintenanceDelta(nutrition.calories_kcal, settings.maintenance.min_kcal, settings.maintenance.max_kcal);

  return `
    <section class="grid dashboard-layout">
      <div class="screen-stack">
        <article class="card">
          <div class="section-head">
            <div>
              <h2>Heute</h2>
              <p class="section-note">${formatDate(today)}</p>
            </div>
            <span class="pill ${nutrition.calories_kcal <= goals.calorie_goal_kcal ? "ok" : "warn"}">${calorieBalanceText(nutrition.calories_kcal, goals.calorie_goal_kcal)}</span>
          </div>
          <div class="grid two">
            ${renderMetric("Kcal", `${fmt(nutrition.calories_kcal, 0)} / ${fmt(goals.calorie_goal_kcal, 0)}`, `${calorieBalanceText(nutrition.calories_kcal, goals.calorie_goal_kcal)}`)}
            ${renderMetric("Protein", `${fmt(nutrition.protein_g, 0)}g / ${fmt(goals.protein_goal_g, 0)}g`, `${fmt(Math.max(goals.protein_goal_g - nutrition.protein_g, 0), 0)}g offen`)}
            ${renderMetric("KH", `${fmt(nutrition.carbs_g, 0)}g / ${fmt(goals.carbs_goal_g, 0)}g`, `${fmt(percent(nutrition.carbs_g, goals.carbs_goal_g), 0)}% vom Ziel`)}
            ${renderMetric("Fett", `${fmt(nutrition.fat_g, 0)}g / ${fmt(goals.fat_goal_g, 0)}g`, `${fmt(percent(nutrition.fat_g, goals.fat_goal_g), 0)}% vom Ziel`)}
          </div>
          <div class="screen-stack" style="margin-top: 14px;">
            ${renderProgressRow("Kalorien", nutrition.calories_kcal, goals.calorie_goal_kcal, "kcal")}
            ${renderProgressRow("Proteinquote", nutrition.protein_g, goals.protein_goal_g, "g")}
          </div>
        </article>

        <article class="card">
          <div class="section-head">
            <div>
              <h2>Verlauf</h2>
              <p class="section-note">Gewicht, Kalorien und Protein der letzten Tage.</p>
            </div>
          </div>
          <div class="grid two">
            <canvas class="chart-canvas" data-chart="dashboard-weight" aria-label="Gewicht und 7-Tage-Schnitt"></canvas>
            <canvas class="chart-canvas" data-chart="calories-14" aria-label="Kalorien der letzten 14 Tage"></canvas>
          </div>
        </article>

        <article class="card">
          <div class="section-head">
            <div>
              <h2>Statistiken</h2>
              <p class="section-note">Sachliche Kontrollwerte, ohne Rauschen.</p>
            </div>
          </div>
          <div class="grid auto">
            ${renderMetric("Ø Kcal 7 Tage", fmt(avgCalories7, 0), "Durchschnitt gegessen")}
            ${renderMetric("Ø Protein 7 Tage", `${fmt(avgProtein7, 0)}g`, "Durchschnitt")}
            ${renderMetric("Protein 14 Tage", `${proteinHits14}/14`, "Tage im Ziel")}
            ${renderMetric("Ø Zielabweichung", `${fmtSigned(calorieDelta14, 0)} kcal`, "letzte 14 Tage")}
          </div>
        </article>
      </div>

      <div class="screen-stack">
        <article class="card">
          <div class="section-head">
            <div>
              <h2>Gewicht</h2>
              <p class="section-note">${weightStats.latest ? formatDate(weightStats.latest.date) : "Noch kein Eintrag"}</p>
            </div>
          </div>
          <div class="big-number">${weightStats.latest ? `${fmt(weightStats.latest.weight_kg, 1)} kg` : "–"}</div>
          <div class="grid two" style="margin-top: 16px;">
            ${renderMetric("7-Tage-Schnitt", weightStats.avg7 ? `${fmt(weightStats.avg7, 1)} kg` : "–", "Trendgewicht")}
            ${renderMetric("Seit Start", weightStats.diffStart !== null ? `${fmtSigned(weightStats.diffStart, 1)} kg` : "–", "vom ersten Eintrag")}
            ${renderMetric("Letzte 7 Tage", weightStats.diff7 !== null ? `${fmtSigned(weightStats.diff7, 1)} kg` : "–", "Tagesvergleich")}
            ${renderMetric("Letzte 30 Tage", weightStats.diff30 !== null ? `${fmtSigned(weightStats.diff30, 1)} kg` : "–", "Tagesvergleich")}
          </div>
          <p class="section-note" style="margin-top: 14px;">${highestWeekText(weightStats)}</p>
        </article>

        <article class="card">
          <h2>BMI und KFA</h2>
          <div class="grid two">
            ${renderMetric("BMI", weightStats.bmi ? fmt(weightStats.bmi, 1) : "–", weightStats.bmi ? getBMICategory(weightStats.bmi) : "Grösse und Gewicht nötig")}
            ${renderMetric("KFA", weightStats.bodyFat ? `${fmt(weightStats.bodyFat, 1)}%` : "–", weightStats.bodyFat ? "Navy-Methode, Schätzung" : `KFA nicht berechenbar - ${bodyFatMissingText()}`)}
          </div>
        </article>

        <article class="card">
          <h2>Diese Woche</h2>
          <div class="grid two">
            ${renderMetric("Kraft", fmt(trainingStats.strength, 0), "Trainings")}
            ${renderMetric("Cardio", fmt(trainingStats.cardio, 0), "Einheiten")}
            ${renderMetric("Gesamt", fmt(trainingStats.total, 0), "Trainingstage")}
            ${renderMetric("Volumen", `${fmt(trainingStats.volume, 0)} kg`, "Krafttraining")}
          </div>
        </article>

        <article class="card">
          <h2>Maintenance</h2>
          <div class="kpi-row">
            <div class="kpi-main">
              <p class="kpi-title">Estimated Maintenance</p>
              <p class="kpi-sub">${fmt(settings.maintenance.min_kcal, 0)}–${fmt(settings.maintenance.max_kcal, 0)} kcal</p>
            </div>
            <div class="kpi-value">${maintenanceText(maintenance)}</div>
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderWeight() {
  const stats = buildWeightStats();
  const editEntry = state.weightEditId ? data.weight_entries.find((entry) => entry.id === state.weightEditId) : null;
  const entry = editEntry || { date: todayKey(), weight_kg: "", waist_cm: "", neck_cm: "", hip_cm: "", notes: "" };

  return `
    <section class="grid auto">
      ${renderMetricCard("Aktuell", stats.latest ? `${fmt(stats.latest.weight_kg, 1)} kg` : "–", stats.latest ? formatDate(stats.latest.date) : "Noch kein Eintrag")}
      ${renderMetricCard("7-Tage-Schnitt", stats.avg7 ? `${fmt(stats.avg7, 1)} kg` : "–", "Trendgewicht")}
      ${renderMetricCard("Startgewicht", stats.start ? `${fmt(stats.start.weight_kg, 1)} kg` : "–", "erster Eintrag")}
      ${renderMetricCard("Höchstes Wochenmittel", stats.highestWeeklyAverage ? `${fmt(stats.highestWeeklyAverage.average, 1)} kg` : "–", stats.highestWeeklyAverage?.label || "–")}
      ${renderMetricCard("Seit Start", stats.diffStart !== null ? `${fmtSigned(stats.diffStart, 1)} kg` : "–", "Veränderung")}
      ${renderMetricCard("Letzter Monat", stats.diff30 !== null ? `${fmtSigned(stats.diff30, 1)} kg` : "–", "30 Tage")}
      ${renderMetricCard("BMI", stats.bmi ? `${fmt(stats.bmi, 1)}` : "–", stats.bmi ? getBMICategory(stats.bmi) : "nicht berechenbar")}
      ${renderMetricCard("KFA", stats.bodyFat ? `${fmt(stats.bodyFat, 1)}%` : "–", stats.bodyFat ? "Navy-Schätzung" : bodyFatMissingText())}
    </section>

    <section class="card">
      <div class="section-head">
        <div>
          <h2>${editEntry ? "Gewicht bearbeiten" : "+ Gewicht eintragen"}</h2>
          <p class="section-note">Ein Datum wird aktualisiert, wenn es schon vorhanden ist.</p>
        </div>
        ${editEntry ? `<button class="btn ghost small" type="button" data-action="cancel-weight-edit">Abbrechen</button>` : ""}
      </div>
      <form id="weight-form">
        <input type="hidden" name="existing_id" value="${attr(editEntry?.id || "")}">
        <div class="form-grid">
          ${field("Datum", `<input type="date" name="date" value="${attr(entry.date)}" required>`)}
          ${field("Gewicht kg", `<input type="number" name="weight_kg" inputmode="decimal" step="0.1" min="1" value="${attr(entry.weight_kg)}" required>`)}
          ${field("Bauchumfang cm", `<input type="number" name="waist_cm" inputmode="decimal" step="0.1" min="1" value="${attr(entry.waist_cm ?? "")}">`)}
          ${field("Halsumfang cm", `<input type="number" name="neck_cm" inputmode="decimal" step="0.1" min="1" value="${attr(entry.neck_cm ?? "")}">`)}
          ${field("Hüftumfang cm", `<input type="number" name="hip_cm" inputmode="decimal" step="0.1" min="1" value="${attr(entry.hip_cm ?? "")}">`)}
          ${field("Notiz", `<textarea name="notes">${safe(entry.notes || "")}</textarea>`, "full")}
        </div>
        <button class="btn primary" type="submit">Speichern</button>
      </form>
    </section>

    <section class="card">
      <div class="section-head">
        <div>
          <h2>Verlauf</h2>
          <p class="section-note">Tagesgewicht und gleitender Schnitt.</p>
        </div>
      </div>
      <canvas class="chart-canvas" data-chart="weight-history" aria-label="Gewichtsverlauf"></canvas>
    </section>

    <section class="card">
      <h2>Historie</h2>
      ${renderWeightHistory()}
    </section>
  `;
}

function renderCalories() {
  const goals = data.settings.goals;
  const nutrition = calculateDailyNutrition(data.food_entries, state.selectedDate);
  const weightStats = buildWeightStats();
  const proteinPerKg = weightStats.trendWeight ? nutrition.protein_g / weightStats.trendWeight : null;
  const maintenance = calculateMaintenanceDelta(nutrition.calories_kcal, data.settings.maintenance.min_kcal, data.settings.maintenance.max_kcal);

  return `
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
        ${renderMetric("Kcal", `${fmt(nutrition.calories_kcal, 0)} / ${fmt(goals.calorie_goal_kcal, 0)}`, calorieBalanceText(nutrition.calories_kcal, goals.calorie_goal_kcal))}
        ${renderMetric("Protein", `${fmt(nutrition.protein_g, 0)}g / ${fmt(goals.protein_goal_g, 0)}g`, proteinPerKg ? `${fmt(proteinPerKg, 2)} g/kg` : "Gewicht fehlt")}
        ${renderMetric("KH", `${fmt(nutrition.carbs_g, 0)}g / ${fmt(goals.carbs_goal_g, 0)}g`, `${fmt(percent(nutrition.carbs_g, goals.carbs_goal_g), 0)}% vom Ziel`)}
        ${renderMetric("Fett", `${fmt(nutrition.fat_g, 0)}g / ${fmt(goals.fat_goal_g, 0)}g`, `${fmt(percent(nutrition.fat_g, goals.fat_goal_g), 0)}% vom Ziel`)}
      </div>
      <div class="screen-stack" style="margin-top: 14px;">
        ${renderProgressRow("Kalorien", nutrition.calories_kcal, goals.calorie_goal_kcal, "kcal")}
        ${renderProgressRow("Protein", nutrition.protein_g, goals.protein_goal_g, "g")}
        ${nutrition.hasOptional ? renderOptionalNutrition(nutrition) : ""}
      </div>
      <p class="section-note" style="margin-top: 12px;">Estimated Maintenance: ${fmt(data.settings.maintenance.min_kcal, 0)}–${fmt(data.settings.maintenance.max_kcal, 0)} kcal. ${maintenanceText(maintenance)}</p>
    </section>

    <section class="card">
      <div class="button-row">
        ${panelButton("quick", "+ Schnelleintrag")}
        ${panelButton("preset", "+ Aus Preset")}
        ${panelButton("new-preset", "+ Neues Preset")}
        <button class="btn ghost" type="button" data-action="copy-yesterday">Gestern kopieren</button>
      </div>
      <div style="margin-top: 16px;">
        ${renderCaloriePanel()}
      </div>
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

function renderTraining() {
  const weekly = calculateWeeklyTrainingStats(data.workouts, todayKey());
  const thisWeek = weekly.thisWeek;

  return `
    <section class="grid auto">
      ${renderMetricCard("Diese Woche", fmt(thisWeek.total, 0), "Trainings")}
      ${renderMetricCard("Kraft", fmt(thisWeek.strength, 0), "Einheiten")}
      ${renderMetricCard("Cardio", fmt(thisWeek.cardio, 0), "Einheiten")}
      ${renderMetricCard("Volumen", `${fmt(thisWeek.volume, 0)} kg`, "Kraft")}
    </section>

    <section class="card">
      <div class="section-head">
        <div>
          <h2>Training erfassen</h2>
          <p class="section-note">Kraft, Cardio oder sonstige Einheit.</p>
        </div>
      </div>
      <div class="segmented" role="group" aria-label="Trainingstyp">
        ${workoutTypeButton("strength", "Kraft")}
        ${workoutTypeButton("cardio", "Cardio")}
        ${workoutTypeButton("other", "Sonstiges")}
      </div>
      <div style="margin-top: 16px;">
        ${state.workoutType === "strength" ? renderStrengthWorkoutForm() : ""}
        ${state.workoutType === "cardio" ? renderCardioWorkoutForm() : ""}
        ${state.workoutType === "other" ? renderOtherWorkoutForm() : ""}
      </div>
    </section>

    <section class="card">
      <div class="section-head">
        <div>
          <h2>Übungs-Presets</h2>
          <p class="section-note">Für schnelle Krafttraining-Eingabe.</p>
        </div>
      </div>
      ${renderExercisePresetForm()}
      <div style="height: 14px;"></div>
      ${renderExercisePresetList()}
    </section>

    <section class="card">
      <div class="section-head">
        <div>
          <h2>Wochenübersicht</h2>
          <p class="section-note">Trainingstage und Kraftvolumen.</p>
        </div>
      </div>
      <canvas class="chart-canvas" data-chart="training-weeks" aria-label="Training pro Woche"></canvas>
    </section>

    <section class="card">
      <h2>Historie</h2>
      ${renderWorkoutList()}
    </section>
  `;
}

function renderMore() {
  const settings = data.settings;
  const age = calculateAge(settings.profile.birth_date);

  return `
    <section class="grid auto">
      ${renderMetricCard("Alter", age !== null ? fmt(age, 0) : "–", "aus Geburtsdatum")}
      ${renderMetricCard("Grösse", settings.profile.height_cm ? `${fmt(settings.profile.height_cm, 0)} cm` : "–", "Profil")}
      ${renderMetricCard("Kalorienziel", `${fmt(settings.goals.calorie_goal_kcal, 0)} kcal`, "manuell")}
      ${renderMetricCard("Daten", `${data.weight_entries.length + data.food_entries.length + data.workouts.length}`, "Einträge")}
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
              ${option("other", "anderes", settings.profile.sex)}
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
          ${field("Trainingstage/Woche", `<input type="number" name="training_days_goal_per_week" min="0" step="1" value="${attr(settings.goals.training_days_goal_per_week ?? "")}">`)}
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
      <div class="section-head">
        <div>
          <h2>Daten</h2>
          <p class="section-note">Vollständiger JSON-Export und Import.</p>
        </div>
      </div>
      <div class="grid auto">
        ${renderMetric("Gewicht", fmt(data.weight_entries.length, 0), "Einträge")}
        ${renderMetric("Kalorien", fmt(data.food_entries.length, 0), "Einträge")}
        ${renderMetric("Food-Presets", fmt(data.food_presets.length, 0), "gespeichert")}
        ${renderMetric("Trainings", fmt(data.workouts.length, 0), "Einträge")}
        ${renderMetric("Übungen", fmt(data.exercise_presets.length, 0), "Presets")}
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
      await confirmDelete("Gewichtseintrag löschen?", async () => deleteItem("weight_entries", button.dataset.id));
    }

    if (action === "set-calorie-panel") {
      if (state.caloriePanel === button.dataset.panel) return;
      state.caloriePanel = button.dataset.panel;
      await render();
    }

    if (action === "copy-yesterday") {
      await copyYesterdayFoods();
    }

    if (action === "delete-food") {
      await confirmDelete("Kalorieneintrag löschen?", async () => deleteItem("food_entries", button.dataset.id));
    }

    if (action === "delete-food-preset") {
      await confirmDelete("Preset löschen?", async () => deleteItem("food_presets", button.dataset.id));
    }

    if (action === "set-workout-type") {
      if (state.workoutType === button.dataset.type) return;
      syncStrengthDraftFromDOM();
      state.workoutType = button.dataset.type;
      await render();
    }

    if (action === "add-draft-exercise") {
      syncStrengthDraftFromDOM();
      addDraftExerciseFromForm();
      await render();
    }

    if (action === "remove-draft-exercise") {
      syncStrengthDraftFromDOM();
      state.strengthDraft.splice(Number(button.dataset.exerciseIndex), 1);
      await render();
    }

    if (action === "add-draft-set") {
      syncStrengthDraftFromDOM();
      const index = Number(button.dataset.exerciseIndex);
      state.strengthDraft[index]?.sets.push({ weight_kg: "", reps: "" });
      await render();
    }

    if (action === "remove-draft-set") {
      syncStrengthDraftFromDOM();
      const exerciseIndex = Number(button.dataset.exerciseIndex);
      const setIndex = Number(button.dataset.setIndex);
      state.strengthDraft[exerciseIndex]?.sets.splice(setIndex, 1);
      await render();
    }

    if (action === "delete-workout") {
      await confirmDelete("Training löschen?", async () => deleteItem("workouts", button.dataset.id));
    }

    if (action === "delete-exercise-preset") {
      await confirmDelete("Übungs-Preset löschen?", async () => deleteItem("exercise_presets", button.dataset.id));
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
  } catch (error) {
    showToast(error.message || "Aktion fehlgeschlagen.");
  }
}

async function handleSubmit(event) {
  const form = event.target;
  event.preventDefault();

  try {
    if (form.id === "weight-form") await saveWeightEntry(form);
    if (form.id === "quick-food-form") await saveQuickFood(form);
    if (form.id === "preset-food-form") await saveFoodFromPreset(form);
    if (form.id === "food-preset-form") await saveFoodPreset(form);
    if (form.id === "strength-workout-form") await saveStrengthWorkout(form);
    if (form.id === "cardio-workout-form") await saveCardioWorkout(form);
    if (form.id === "other-workout-form") await saveOtherWorkout(form);
    if (form.id === "exercise-preset-form") await saveExercisePreset(form);
    if (form.id === "settings-profile-form") await saveProfileSettings(form);
    if (form.id === "settings-goals-form") await saveGoalSettings(form);
    if (form.id === "settings-maintenance-form") await saveMaintenanceSettings(form);
    if (form.id === "settings-reminders-form") await saveReminderSettings(form);
    if (form.id === "import-form") await importData(form);
  } catch (error) {
    showToast(error.message || "Speichern fehlgeschlagen.");
  }
}

function handleChange(event) {
  const target = event.target;

  if (target.id === "calories-date") {
    state.selectedDate = target.value || todayKey();
    render();
  }

  if (target.id === "quick-save-preset") {
    document.querySelector("#quick-preset-fields")?.toggleAttribute("hidden", !target.checked);
  }

  if (target.id === "food-preset-type") {
    applyPresetTypeDefaults(target.value);
  }

  if (["preset-select", "preset-quantity"].includes(target.id)) {
    updatePresetPreview();
  }
}

function handleInput(event) {
  const target = event.target;

  if (["cardio-duration", "cardio-distance", "cardio-speed"].includes(target.id)) {
    autoFillCardio(target.id);
  }

  if (["preset-select", "preset-quantity"].includes(target.id)) {
    updatePresetPreview();
  }
}

async function saveWeightEntry(form) {
  const date = formValue(form, "date");
  const weight = requiredPositiveNumber(form, "weight_kg", "Bitte Gewicht eintragen.");
  if (!date) throw new Error("Bitte Datum eintragen.");

  const id = `weight_${date}`;
  const existing = await getItem("weight_entries", id);
  const now = toLocalIso();

  await putItem("weight_entries", {
    id,
    date,
    weight_kg: weight,
    waist_cm: optionalPositiveNumber(form, "waist_cm", "Bauchumfang muss sinnvoll sein."),
    neck_cm: optionalPositiveNumber(form, "neck_cm", "Halsumfang muss sinnvoll sein."),
    hip_cm: optionalPositiveNumber(form, "hip_cm", "Hüftumfang muss sinnvoll sein."),
    notes: formValue(form, "notes"),
    created_at: existing?.created_at || now,
    updated_at: now,
  });

  state.weightEditId = null;
  showToast("Gewicht gespeichert.");
  await render();
}

async function saveQuickFood(form) {
  const date = state.selectedDate;
  const name = formValue(form, "name");
  if (!name) throw new Error("Bitte Name eintragen.");

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

  await putItem("food_presets", preset);
  showToast("Preset gespeichert.");
  state.caloriePanel = "preset";
  await render();
}

async function saveStrengthWorkout(form) {
  syncStrengthDraftFromDOM();
  const date = formValue(form, "date");
  if (!date) throw new Error("Bitte Datum eintragen.");

  const exercises = state.strengthDraft
    .map((exercise) => ({
      exercise_id: exercise.exercise_id || slugId("exercise", exercise.name),
      name: exercise.name,
      sets: (exercise.sets || [])
        .map((set) => ({
          weight_kg: toNumber(set.weight_kg) || 0,
          reps: toNumber(set.reps) || 0,
        }))
        .filter((set) => set.reps > 0 && set.weight_kg >= 0),
    }))
    .filter((exercise) => exercise.name && exercise.sets.length);

  if (!exercises.length) throw new Error("Bitte mindestens eine Übung mit Set eintragen.");

  const now = toLocalIso();
  await putItem("workouts", {
    id: generateId("workout"),
    date,
    type: "strength",
    name: formValue(form, "name") || "Krafttraining",
    duration_min: optionalNonNegativeNumber(form, "duration_min", "Dauer darf nicht negativ sein."),
    exercises,
    notes: formValue(form, "notes"),
    created_at: now,
    updated_at: now,
  });

  state.strengthDraft = [];
  showToast("Krafttraining gespeichert.");
  await render();
}

async function saveCardioWorkout(form) {
  const date = formValue(form, "date");
  if (!date) throw new Error("Bitte Datum eintragen.");

  const duration = requiredPositiveNumber(form, "duration_min", "Bitte Dauer eintragen.");
  let distance = optionalNonNegativeNumber(form, "distance_km", "Distanz darf nicht negativ sein.");
  let speed = optionalNonNegativeNumber(form, "speed_kmh", "Geschwindigkeit darf nicht negativ sein.");

  if (duration && distance !== null && speed === null) speed = round(distance / (duration / 60), 1);
  if (duration && speed !== null && distance === null) distance = round(speed * (duration / 60), 2);

  const now = toLocalIso();
  await putItem("workouts", {
    id: generateId("cardio"),
    date,
    type: "cardio",
    name: formValue(form, "name") || "Laufband",
    duration_min: duration,
    distance_km: distance,
    speed_kmh: speed,
    notes: formValue(form, "notes"),
    created_at: now,
    updated_at: now,
  });

  showToast("Cardio gespeichert.");
  await render();
}

async function saveOtherWorkout(form) {
  const date = formValue(form, "date");
  if (!date) throw new Error("Bitte Datum eintragen.");

  const now = toLocalIso();
  await putItem("workouts", {
    id: generateId("workout"),
    date,
    type: "other",
    name: formValue(form, "name") || "Training",
    duration_min: optionalNonNegativeNumber(form, "duration_min", "Dauer darf nicht negativ sein."),
    notes: formValue(form, "notes"),
    created_at: now,
    updated_at: now,
  });

  showToast("Training gespeichert.");
  await render();
}

async function saveExercisePreset(form) {
  const name = formValue(form, "name");
  if (!name) throw new Error("Bitte Übungsname eintragen.");

  const now = toLocalIso();
  await putItem("exercise_presets", {
    id: generateId("exercise"),
    name,
    category: formValue(form, "category") || "Kraft",
    muscle_groups: splitTags(formValue(form, "muscle_groups")),
    default_tracking: formValue(form, "default_tracking") || "weight_reps",
    notes: formValue(form, "notes"),
    created_at: now,
    updated_at: now,
  });

  showToast("Übungs-Preset gespeichert.");
  await render();
}

async function saveProfileSettings(form) {
  const settings = structuredClone(data.settings);
  settings.profile.height_cm = optionalPositiveNumber(form, "height_cm", "Körpergrösse muss > 0 sein.");
  settings.profile.birth_date = formValue(form, "birth_date");
  settings.profile.sex = formValue(form, "sex") || "male";
  await saveSettings(settings);
  showToast("Profil gespeichert.");
  await render();
}

async function saveGoalSettings(form) {
  const settings = structuredClone(data.settings);
  for (const key of Object.keys(settings.goals)) {
    settings.goals[key] = optionalNonNegativeNumber(form, key, "Ziele dürfen nicht negativ sein.");
  }
  await saveSettings(settings);
  showToast("Ziele gespeichert.");
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

async function importData(form) {
  const file = form.elements.namedItem("import_file")?.files?.[0];
  const mode = formValue(form, "import_mode");
  if (!file) throw new Error("Bitte Import-Datei wählen.");

  const parsed = await readJsonFile(file);

  if (mode === "replace") {
    const ok = confirm("Alles ersetzen? Vorher wird ein aktueller Export zum Download angeboten.");
    if (!ok) return;
    await downloadFullExport();
    await replaceAllData(parsed);
    showToast("Daten ersetzt.");
  } else if (mode === "presets") {
    await mergeImportData(parsed, { presetsOnly: true });
    showToast("Presets importiert.");
  } else {
    await mergeImportData(parsed);
    showToast("Daten zusammengeführt.");
  }

  await render();
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
  const measurementEntry = [...entries].reverse().find((entry) => entry.waist_cm || entry.neck_cm || entry.hip_cm) || latest;
  const bodyFat = calculateNavyBodyFat({
    sex: data.settings.profile.sex,
    heightCm: data.settings.profile.height_cm,
    waistCm: measurementEntry?.waist_cm,
    neckCm: measurementEntry?.neck_cm,
    hipCm: measurementEntry?.hip_cm,
  });

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
    bodyFat,
    diffStart: latest && start ? latest.weight_kg - start.weight_kg : null,
    diff7: latest ? diffSince(entries, latest.date, 7) : null,
    diff30: latest ? diffSince(entries, latest.date, 30) : null,
    diffHighestWeeklyAverage: highestWeeklyAverage && trendWeight ? trendWeight - highestWeeklyAverage.average : null,
  };
}

function diffSince(entries, endDate, days) {
  const target = formatDateKey(addDays(parseDateKey(endDate), -days));
  const previous = [...entries].reverse().find((entry) => entry.date <= target);
  const latest = entries.find((entry) => entry.date === endDate);
  if (!previous || !latest) return null;
  return latest.weight_kg - previous.weight_kg;
}

function highestWeekText(stats) {
  if (!stats.highestWeeklyAverage || stats.diffHighestWeeklyAverage === null) {
    return "Noch nicht genug Wochenwerte für eine Trendzeile.";
  }

  const diff = stats.diffHighestWeeklyAverage;
  if (diff < 0) {
    return `Du bist aktuell ${fmt(Math.abs(diff), 1)} kg unter deinem höchsten Wochenmittel.`;
  }
  if (diff > 0) {
    return `Du bist aktuell ${fmt(diff, 1)} kg über deinem höchsten Wochenmittel.`;
  }
  return "Du bist aktuell genau auf deinem höchsten Wochenmittel.";
}

function bodyFatMissingText() {
  const sex = data.settings.profile.sex;
  if (sex === "female") return "Bauch, Hals und Hüfte erfassen.";
  if (sex === "other") return "Formel in Version 1 nicht gesetzt.";
  return "Bauch- und Halsumfang erfassen.";
}

function renderWeightHistory() {
  const entries = [...data.weight_entries].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (!entries.length) return `<div class="empty">Noch keine Gewichtseinträge.</div>`;

  return `
    <div class="list">
      ${entries.map((entry) => `
        <div class="list-row">
          <div>
            <p class="list-row-title">${formatDate(entry.date)} · ${fmt(entry.weight_kg, 1)} kg</p>
            <p class="list-row-meta">${measurementSummary(entry)}${entry.notes ? ` · ${safe(entry.notes)}` : ""}</p>
          </div>
          <div class="list-actions">
            <button class="btn small ghost" type="button" data-action="edit-weight" data-id="${attr(entry.id)}">Bearbeiten</button>
            <button class="btn small danger" type="button" data-action="delete-weight" data-id="${attr(entry.id)}">Löschen</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderCaloriePanel() {
  if (state.caloriePanel === "preset") return renderPresetEntryForm();
  if (state.caloriePanel === "new-preset") return renderFoodPresetForm();
  return renderQuickFoodForm();
}

function renderQuickFoodForm() {
  return `
    <form id="quick-food-form">
      <div class="form-grid">
        ${field("Name", `<input name="name" autocomplete="off" required>`)}
        ${field("Mahlzeit", mealSelect("meal"))}
        ${field("kcal", `<input type="number" name="calories_kcal" min="0" step="1" required>`)}
        ${field("Protein g", `<input type="number" name="protein_g" min="0" step="0.1" required>`)}
        ${field("KH g", `<input type="number" name="carbs_g" min="0" step="0.1" required>`)}
        ${field("Fett g", `<input type="number" name="fat_g" min="0" step="0.1" required>`)}
        ${field("Ballaststoffe g", `<input type="number" name="fiber_g" min="0" step="0.1">`)}
        ${field("Zucker g", `<input type="number" name="sugar_g" min="0" step="0.1">`)}
        ${field("Salz g", `<input type="number" name="salt_g" min="0" step="0.1">`)}
        ${field("Notiz", `<textarea name="notes"></textarea>`, "full")}
      </div>
      <label class="check-row">
        <input id="quick-save-preset" type="checkbox" name="quick_save_preset">
        Als Preset speichern
      </label>
      <div id="quick-preset-fields" class="form-grid" hidden>
        ${field("Preset-Typ", presetTypeSelect("preset_type"))}
        ${field("Einheit", `<input name="preset_unit" value="Portion">`)}
        ${field("Basis-Menge", `<input type="number" name="preset_base_quantity" min="0.01" step="0.01" value="1">`)}
      </div>
      <button class="btn primary" type="submit">Schnelleintrag speichern</button>
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
  return `
    <form id="food-preset-form">
      <div class="form-grid">
        ${field("Name", `<input name="name" required>`)}
        ${field("Typ", presetTypeSelect("type", "food-preset-type"))}
        ${field("Einheit", `<input id="food-preset-unit" name="unit" value="g" required>`)}
        ${field("Basis-Menge", `<input id="food-preset-base" type="number" name="base_quantity" min="0.01" step="0.01" value="100" required>`)}
        ${field("kcal", `<input type="number" name="calories_kcal" min="0" step="1" required>`)}
        ${field("Protein g", `<input type="number" name="protein_g" min="0" step="0.1" required>`)}
        ${field("KH g", `<input type="number" name="carbs_g" min="0" step="0.1" required>`)}
        ${field("Fett g", `<input type="number" name="fat_g" min="0" step="0.1" required>`)}
        ${field("Ballaststoffe g", `<input type="number" name="fiber_g" min="0" step="0.1">`)}
        ${field("Zucker g", `<input type="number" name="sugar_g" min="0" step="0.1">`)}
        ${field("Salz g", `<input type="number" name="salt_g" min="0" step="0.1">`)}
        ${field("Tags", `<input name="tags" placeholder="Protein, Fast Food">`, "full")}
      </div>
      <button class="btn primary" type="submit">Preset speichern</button>
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
                    <button class="btn small danger" type="button" data-action="delete-food" data-id="${attr(entry.id)}">Löschen</button>
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
            <button class="btn small danger" type="button" data-action="delete-food-preset" data-id="${attr(preset.id)}">Löschen</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderStrengthWorkoutForm() {
  return `
    <div class="screen-stack">
      <div class="card soft">
        <h3>Übung hinzufügen</h3>
        <div class="form-grid">
          ${field("Aus Preset", `
            <select id="draft-exercise-preset">
              <option value="">Preset wählen</option>
              ${data.exercise_presets.map((exercise) => `<option value="${attr(exercise.id)}">${safe(exercise.name)}</option>`).join("")}
            </select>
          `)}
          ${field("Oder Name", `<input id="draft-exercise-name" placeholder="z.B. Bankdrücken">`)}
        </div>
        <div class="button-row" style="margin-top: 12px;">
          <button class="btn" type="button" data-action="add-draft-exercise">Übung hinzufügen</button>
        </div>
      </div>

      <form id="strength-workout-form">
        <div class="form-grid">
          ${field("Datum", `<input type="date" name="date" value="${attr(todayKey())}" required>`)}
          ${field("Name", `<input name="name" value="Ganzkörper">`)}
          ${field("Dauer Minuten", `<input type="number" name="duration_min" min="0" step="1">`)}
          ${field("Notiz", `<textarea name="notes"></textarea>`, "full")}
        </div>
        ${renderStrengthDraft()}
        <button class="btn primary" type="submit">Krafttraining speichern</button>
      </form>
    </div>
  `;
}

function renderStrengthDraft() {
  if (!state.strengthDraft.length) {
    return `<div class="empty">Noch keine Übung im Training.</div>`;
  }

  return `
    <div class="screen-stack">
      ${state.strengthDraft.map((exercise, exerciseIndex) => `
        <div class="draft-exercise" data-exercise-index="${exerciseIndex}">
          <div class="section-head">
            ${field("Übung", `<input name="exercise_name" value="${attr(exercise.name)}">`)}
            <button class="btn small danger" type="button" data-action="remove-draft-exercise" data-exercise-index="${exerciseIndex}">Entfernen</button>
          </div>
          <input type="hidden" name="exercise_id" value="${attr(exercise.exercise_id || "")}">
          <table class="set-table">
            <thead>
              <tr><th>Set</th><th>Gewicht kg</th><th>Wdh.</th><th></th></tr>
            </thead>
            <tbody>
              ${(exercise.sets || []).map((set, setIndex) => `
                <tr data-set-index="${setIndex}">
                  <td>${setIndex + 1}</td>
                  <td><input name="set_weight" type="number" min="0" step="0.5" value="${attr(set.weight_kg ?? "")}"></td>
                  <td><input name="set_reps" type="number" min="0" step="1" value="${attr(set.reps ?? "")}"></td>
                  <td><button class="btn small danger" type="button" data-action="remove-draft-set" data-exercise-index="${exerciseIndex}" data-set-index="${setIndex}">Löschen</button></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          <button class="btn small ghost" type="button" data-action="add-draft-set" data-exercise-index="${exerciseIndex}">Set hinzufügen</button>
        </div>
      `).join("")}
    </div>
  `;
}

function renderCardioWorkoutForm() {
  return `
    <form id="cardio-workout-form">
      <div class="form-grid">
        ${field("Datum", `<input type="date" name="date" value="${attr(todayKey())}" required>`)}
        ${field("Name", `<input name="name" value="Laufband">`)}
        ${field("Dauer Minuten", `<input id="cardio-duration" type="number" name="duration_min" min="0.1" step="1" required>`)}
        ${field("Distanz km", `<input id="cardio-distance" type="number" name="distance_km" min="0" step="0.01">`)}
        ${field("km/h", `<input id="cardio-speed" type="number" name="speed_kmh" min="0" step="0.1">`)}
        ${field("Notiz", `<textarea name="notes"></textarea>`, "full")}
      </div>
      <button class="btn primary" type="submit">Cardio speichern</button>
    </form>
  `;
}

function renderOtherWorkoutForm() {
  return `
    <form id="other-workout-form">
      <div class="form-grid">
        ${field("Datum", `<input type="date" name="date" value="${attr(todayKey())}" required>`)}
        ${field("Name", `<input name="name" value="Training">`)}
        ${field("Dauer Minuten", `<input type="number" name="duration_min" min="0" step="1">`)}
        ${field("Notiz", `<textarea name="notes"></textarea>`, "full")}
      </div>
      <button class="btn primary" type="submit">Training speichern</button>
    </form>
  `;
}

function renderExercisePresetForm() {
  return `
    <form id="exercise-preset-form">
      <div class="form-grid">
        ${field("Name", `<input name="name" required>`)}
        ${field("Kategorie", `<input name="category" value="Kraft">`)}
        ${field("Muskelgruppen", `<input name="muscle_groups" placeholder="Brust, Trizeps">`)}
        ${field("Tracking", `
          <select name="default_tracking">
            <option value="weight_reps">Gewicht + Wiederholungen</option>
            <option value="reps_only">Nur Wiederholungen</option>
          </select>
        `)}
        ${field("Notiz", `<textarea name="notes"></textarea>`, "full")}
      </div>
      <button class="btn primary" type="submit">Übungs-Preset speichern</button>
    </form>
  `;
}

function renderExercisePresetList() {
  if (!data.exercise_presets.length) return `<div class="empty">Noch keine Übungs-Presets.</div>`;

  return `
    <div class="list">
      ${data.exercise_presets.map((exercise) => `
        <div class="list-row">
          <div>
            <p class="list-row-title">${safe(exercise.name)}</p>
            <p class="list-row-meta">${safe(exercise.category || "Kraft")} · ${(exercise.muscle_groups || []).map(safe).join(", ") || "keine Muskelgruppen"}</p>
          </div>
          <div class="list-actions">
            <button class="btn small danger" type="button" data-action="delete-exercise-preset" data-id="${attr(exercise.id)}">Löschen</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderWorkoutList() {
  const rows = [...data.workouts].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (!rows.length) return `<div class="empty">Noch keine Trainings.</div>`;

  return `
    <div class="list">
      ${rows.map((workout) => `
        <div class="list-row">
          <div>
            <p class="list-row-title">${formatDate(workout.date)} · ${safe(workout.name || workoutTypeLabel(workout.type))}</p>
            <p class="list-row-meta">${workoutSummary(workout)}</p>
          </div>
          <div class="list-actions">
            <button class="btn small danger" type="button" data-action="delete-workout" data-id="${attr(workout.id)}">Löschen</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function syncStrengthDraftFromDOM() {
  const draftNodes = document.querySelectorAll("[data-exercise-index]");
  if (!draftNodes.length) return;

  state.strengthDraft = [...draftNodes].map((node) => {
    const sets = [...node.querySelectorAll("[data-set-index]")].map((setNode) => ({
      weight_kg: setNode.querySelector("[name='set_weight']")?.value || "",
      reps: setNode.querySelector("[name='set_reps']")?.value || "",
    }));

    return {
      exercise_id: node.querySelector("[name='exercise_id']")?.value || "",
      name: node.querySelector("[name='exercise_name']")?.value?.trim() || "",
      sets,
    };
  });
}

function addDraftExerciseFromForm() {
  const presetId = document.querySelector("#draft-exercise-preset")?.value || "";
  const manualName = document.querySelector("#draft-exercise-name")?.value?.trim() || "";
  const preset = data.exercise_presets.find((exercise) => exercise.id === presetId);
  const name = preset?.name || manualName;

  if (!name) {
    showToast("Bitte Übung wählen oder Namen eintragen.");
    return;
  }

  state.strengthDraft.push({
    exercise_id: preset?.id || slugId("exercise", name),
    name,
    sets: [{ weight_kg: "", reps: "" }],
  });
}

function drawCharts() {
  document.querySelectorAll("[data-chart]").forEach((canvas) => {
    const chart = canvas.dataset.chart;
    if (chart === "dashboard-weight" || chart === "weight-history") drawWeightChart(canvas);
    if (chart === "calories-14") drawCaloriesChart(canvas);
    if (chart === "training-weeks") drawTrainingChart(canvas);
  });
  updatePresetPreview();
}

function drawWeightChart(canvas) {
  const entries = data.weight_entries.filter((entry) => toNumber(entry.weight_kg));
  if (!entries.length) return drawEmptyChart(canvas, "Noch keine Gewichtsdaten");

  const points = entries.slice(-42).map((entry) => ({
    label: entry.date.slice(5),
    value: toNumber(entry.weight_kg),
    avg: calculateMovingAverage(entries, 7, entry.date),
  }));

  drawLineChart(canvas, points, {
    valueKey: "value",
    secondKey: "avg",
    color: "#55c7a1",
    secondColor: "#73a7ff",
  });
}

function drawCaloriesChart(canvas) {
  const dates = lastNDays(todayKey(), 14);
  const goal = data.settings.goals.calorie_goal_kcal;
  const points = dates.map((date) => ({
    label: date.slice(5),
    value: calculateDailyNutrition(data.food_entries, date).calories_kcal,
    goal,
  }));

  drawBarChart(canvas, points, { color: "#55c7a1", goalColor: "#f5b85b" });
}

function drawTrainingChart(canvas) {
  const weekly = calculateWeeklyTrainingStats(data.workouts, todayKey()).byWeek.slice(-8);
  if (!weekly.length) return drawEmptyChart(canvas, "Noch keine Trainingsdaten");
  drawBarChart(canvas, weekly.map((week) => ({ label: week.label.replace("KW ", ""), value: week.total, goal: data.settings.goals.training_days_goal_per_week })), {
    color: "#73a7ff",
    goalColor: "#55c7a1",
  });
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

function drawLineChart(canvas, points, options) {
  const { ctx, width, height } = setupCanvas(canvas);
  const padding = { top: 18, right: 12, bottom: 28, left: 34 };
  const values = points.flatMap((point) => [point[options.valueKey], point[options.secondKey]]).filter((value) => value !== null && value !== undefined);
  const min = Math.min(...values) - 0.5;
  const max = Math.max(...values) + 0.5;

  ctx.clearRect(0, 0, width, height);
  drawGrid(ctx, width, height, padding);
  drawSeries(ctx, points, options.valueKey, min, max, padding, width, height, options.color);
  drawSeries(ctx, points, options.secondKey, min, max, padding, width, height, options.secondColor);
  drawAxisLabels(ctx, points, width, height, padding);
}

function drawSeries(ctx, points, key, min, max, padding, width, height, color) {
  ctx.beginPath();
  points.forEach((point, index) => {
    const value = point[key];
    if (value === null || value === undefined) return;
    const x = padding.left + (index / Math.max(points.length - 1, 1)) * (width - padding.left - padding.right);
    const y = height - padding.bottom - ((value - min) / Math.max(max - min, 1)) * (height - padding.top - padding.bottom);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

function drawBarChart(canvas, points, options) {
  const { ctx, width, height } = setupCanvas(canvas);
  const padding = { top: 18, right: 12, bottom: 28, left: 34 };
  const max = Math.max(1, ...points.map((point) => point.value || 0), ...points.map((point) => point.goal || 0));
  const chartWidth = width - padding.left - padding.right;
  const barWidth = chartWidth / points.length;

  ctx.clearRect(0, 0, width, height);
  drawGrid(ctx, width, height, padding);

  points.forEach((point, index) => {
    const x = padding.left + index * barWidth + barWidth * 0.18;
    const barHeight = ((point.value || 0) / max) * (height - padding.top - padding.bottom);
    const y = height - padding.bottom - barHeight;
    ctx.fillStyle = options.color;
    ctx.globalAlpha = 0.88;
    ctx.fillRect(x, y, Math.max(barWidth * 0.64, 4), barHeight);
    ctx.globalAlpha = 1;
    if (point.goal) {
      const goalY = height - padding.bottom - (point.goal / max) * (height - padding.top - padding.bottom);
      ctx.fillStyle = options.goalColor;
      ctx.fillRect(x, goalY, Math.max(barWidth * 0.64, 4), 2);
    }
  });

  drawAxisLabels(ctx, points, width, height, padding);
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

function drawAxisLabels(ctx, points, width, height, padding) {
  ctx.fillStyle = "#9eacbd";
  ctx.font = "700 10px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  const labels = points.length > 8 ? [0, Math.floor(points.length / 2), points.length - 1] : points.map((_, index) => index);
  for (const index of labels) {
    const x = padding.left + (index / Math.max(points.length - 1, 1)) * (width - padding.left - padding.right);
    ctx.fillText(points[index]?.label || "", x, height - 9);
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

function autoFillCardio(changedId) {
  const durationInput = document.querySelector("#cardio-duration");
  const distanceInput = document.querySelector("#cardio-distance");
  const speedInput = document.querySelector("#cardio-speed");
  const duration = toNumber(durationInput?.value);
  const distance = toNumber(distanceInput?.value);
  const speed = toNumber(speedInput?.value);

  if (!duration || duration <= 0) return;

  if (changedId !== "cardio-speed" && distance !== null && speedInput && !speedInput.value) {
    speedInput.value = fmtRaw(distance / (duration / 60), 1);
  }

  if (changedId !== "cardio-distance" && speed !== null && distanceInput && !distanceInput.value) {
    distanceInput.value = fmtRaw(speed * (duration / 60), 2);
  }
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

function renderProgressRow(label, current, goal, unit) {
  const currentValue = toNumber(current) || 0;
  const goalValue = toNumber(goal) || 0;
  const progress = percent(currentValue, goalValue);
  return `
    <div>
      <div class="kpi-row">
        <div class="kpi-main">
          <p class="kpi-title">${safe(label)}</p>
          <p class="kpi-sub">${fmt(currentValue, 0)} ${safe(unit)} / ${fmt(goalValue, 0)} ${safe(unit)}</p>
        </div>
        <div class="kpi-value">${fmt(progress, 0)}%</div>
      </div>
      <div class="progress ${progress > 100 ? "warn" : ""}" style="--value: ${Math.min(progress, 120)}%"><span></span></div>
    </div>
  `;
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

function workoutTypeButton(type, label) {
  return `<button class="btn ${state.workoutType === type ? "is-active" : ""}" type="button" data-action="set-workout-type" data-type="${attr(type)}">${safe(label)}</button>`;
}

function mealSelect(name, selected = "") {
  return `
    <select name="${attr(name)}">
      ${MEALS.map((meal) => option(meal.value, meal.label, selected)).join("")}
    </select>
  `;
}

function presetTypeSelect(name, id = "") {
  return `
    <select ${id ? `id="${attr(id)}"` : ""} name="${attr(name)}">
      <option value="ingredient_100g">Zutat / pro 100g</option>
      <option value="unit_item">Fertigprodukt / Einheit</option>
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

function measurementSummary(entry) {
  const parts = [];
  if (entry.waist_cm) parts.push(`Bauch ${fmt(entry.waist_cm, 1)} cm`);
  if (entry.neck_cm) parts.push(`Hals ${fmt(entry.neck_cm, 1)} cm`);
  if (entry.hip_cm) parts.push(`Hüfte ${fmt(entry.hip_cm, 1)} cm`);
  return parts.join(" · ") || "Keine Umfänge";
}

function workoutSummary(workout) {
  if (workout.type === "strength") {
    const volume = calculateStrengthWorkoutVolume(workout);
    const exerciseCount = workout.exercises?.length || 0;
    return `Kraft · ${exerciseCount} Übungen · ${fmt(volume, 0)} kg Volumen${workout.duration_min ? ` · ${fmt(workout.duration_min, 0)} min` : ""}`;
  }
  if (workout.type === "cardio") {
    return `Cardio · ${fmt(workout.duration_min, 0)} min${workout.distance_km ? ` · ${fmt(workout.distance_km, 2)} km` : ""}${workout.speed_kmh ? ` · ${fmt(workout.speed_kmh, 1)} km/h` : ""}`;
  }
  return `Sonstiges${workout.duration_min ? ` · ${fmt(workout.duration_min, 0)} min` : ""}`;
}

function workoutTypeLabel(type) {
  if (type === "strength") return "Krafttraining";
  if (type === "cardio") return "Cardio";
  return "Training";
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

function fmtRaw(value, digits = 0) {
  const number = toNumber(value);
  if (number === null) return "";
  return number.toFixed(digits);
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

function slugId(prefix, value) {
  return `${prefix}_${String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || Date.now()}`;
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
  navigator.serviceWorker.register("./service-worker.js").catch(() => {
    /* Service Worker ist optional fuer lokale Entwicklung. */
  });
}
