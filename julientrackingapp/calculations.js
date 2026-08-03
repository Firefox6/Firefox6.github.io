export function calculateAge(birthDate) {
  if (!birthDate) return null;
  const birth = parseDateKey(birthDate);
  if (!birth) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  const dayDelta = today.getDate() - birth.getDate();

  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

export function calculateBMI(weightKg, heightCm) {
  const weight = toNumber(weightKg);
  const height = toNumber(heightCm);
  if (!weight || !height || weight <= 0 || height <= 0) return null;
  const heightM = height / 100;
  return weight / (heightM * heightM);
}

export function getBMICategory(bmi) {
  const value = toNumber(bmi);
  if (!value) return "nicht berechenbar";
  if (value < 18.5) return "Untergewicht";
  if (value < 25) return "Normalgewicht";
  if (value < 30) return "Übergewicht";
  return "Adipositas";
}

export function calculateDailyNutrition(foodEntries, date) {
  const rows = (foodEntries || []).filter((entry) => entry.date === date);
  const totals = {
    calories_kcal: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    sugar_g: 0,
    salt_g: 0,
    hasOptional: false,
    count: rows.length,
  };

  for (const entry of rows) {
    totals.calories_kcal += toNumber(entry.calories_kcal) || 0;
    totals.protein_g += toNumber(entry.protein_g) || 0;
    totals.carbs_g += toNumber(entry.carbs_g) || 0;
    totals.fat_g += toNumber(entry.fat_g) || 0;

    for (const key of ["fiber_g", "sugar_g", "salt_g"]) {
      if (entry[key] !== null && entry[key] !== undefined && entry[key] !== "") {
        totals[key] += toNumber(entry[key]) || 0;
        totals.hasOptional = true;
      }
    }
  }

  return totals;
}

export function calculateWeeklyAverageWeight(weightEntries) {
  const weeks = new Map();

  for (const entry of weightEntries || []) {
    const weight = toNumber(entry.weight_kg);
    if (!entry.date || !weight) continue;
    const week = getIsoWeekKey(entry.date);
    if (!weeks.has(week.key)) {
      weeks.set(week.key, {
        key: week.key,
        label: `KW ${week.week}`,
        year: week.year,
        week: week.week,
        startDate: week.startDate,
        values: [],
      });
    }
    weeks.get(week.key).values.push(weight);
  }

  return [...weeks.values()]
    .map((week) => ({
      ...week,
      average: average(week.values),
      count: week.values.length,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function calculateMovingAverage(weightEntries, days = 7, endDateKey = null) {
  const datedEntries = (weightEntries || [])
    .filter((entry) => entry.date && toNumber(entry.weight_kg))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!datedEntries.length) return null;

  const endKey = endDateKey || datedEntries[datedEntries.length - 1].date;
  const startKey = formatDateKey(addDays(parseDateKey(endKey), -days + 1));
  const values = datedEntries
    .filter((entry) => entry.date >= startKey && entry.date <= endKey)
    .map((entry) => toNumber(entry.weight_kg));

  return average(values);
}

export function calculateWeightChartSeries(weightEntries) {
  const entries = (weightEntries || [])
    .filter((entry) => entry.date && toNumber(entry.weight_kg) !== null)
    .map((entry) => ({ date: entry.date, weight: toNumber(entry.weight_kg) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!entries.length) return { points: [], firstDate: null, lastDate: null };

  const firstDate = entries[0].date;
  const lastDate = entries[entries.length - 1].date;
  const byDate = new Map(entries.map((entry) => [entry.date, entry.weight]));

  const points = [];
  let windowStart = 0;
  let windowEnd = 0;
  let windowSum = 0;
  let windowCount = 0;

  let cursor = parseDateKey(firstDate);
  const end = parseDateKey(lastDate);

  while (cursor <= end) {
    const dateKey = formatDateKey(cursor);
    const windowStartKey = formatDateKey(addDays(cursor, -6));

    while (windowEnd < entries.length && entries[windowEnd].date <= dateKey) {
      windowSum += entries[windowEnd].weight;
      windowCount += 1;
      windowEnd += 1;
    }
    while (windowStart < windowEnd && entries[windowStart].date < windowStartKey) {
      windowSum -= entries[windowStart].weight;
      windowCount -= 1;
      windowStart += 1;
    }

    points.push({
      date: dateKey,
      raw: byDate.has(dateKey) ? byDate.get(dateKey) : null,
      avg: windowCount ? windowSum / windowCount : null,
    });

    cursor = addDays(cursor, 1);
  }

  return { points, firstDate, lastDate };
}

export function calculateMaintenanceDelta(calories, minMaintenance, maxMaintenance) {
  const kcal = toNumber(calories);
  const min = toNumber(minMaintenance);
  const max = toNumber(maxMaintenance);

  if (kcal === null || min === null || max === null || min <= 0 || max <= 0) return null;

  return {
    min_delta: kcal - min,
    max_delta: kcal - max,
    below_min: min - kcal,
    below_max: max - kcal,
  };
}

export function calculateWeeklyCaloriePool(foodEntries, calorieGoal, referenceDateKey) {
  const goal = toNumber(calorieGoal);
  const referenceDate = parseDateKey(referenceDateKey);
  if (!goal || goal <= 0 || !referenceDate) return { pool: 0, weekStartDate: null };

  const isoDay = referenceDate.getDay() === 0 ? 7 : referenceDate.getDay();
  const monday = addDays(referenceDate, -(isoDay - 1));
  const weekStartDate = formatDateKey(monday);
  const lastCompletedDate = addDays(referenceDate, -1);

  let pool = 0;
  let cursor = monday;
  while (cursor <= lastCompletedDate) {
    const dateKey = formatDateKey(cursor);
    const consumed = calculateDailyNutrition(foodEntries, dateKey).calories_kcal;
    const delta = goal - consumed;
    pool = delta >= 0 ? pool + Math.min(delta, 250) : Math.max(pool + delta, 0);
    cursor = addDays(cursor, 1);
  }

  return { pool, weekStartDate };
}

export function calculateAutoTdee(weightEntries, foodEntries, referenceDateKey) {
  const referenceDate = parseDateKey(referenceDateKey);
  if (!referenceDate) return { available: false, tdee: null, reason: "insufficient-data" };

  const windowDays = 21;
  const windowStartDate = addDays(referenceDate, -(windowDays - 1));
  const windowStartKey = formatDateKey(windowStartDate);

  const datedWeights = (weightEntries || [])
    .filter((entry) => entry.date && toNumber(entry.weight_kg) !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  const proximityDays = 3;
  const startWeight = datedWeights.find((entry) => {
    const diff = Math.abs(parseDateKey(entry.date) - windowStartDate) / 86400000;
    return diff <= proximityDays;
  });
  const endWeight = [...datedWeights].reverse().find((entry) => {
    const diff = Math.abs(parseDateKey(entry.date) - referenceDate) / 86400000;
    return diff <= proximityDays;
  });

  if (!startWeight || !endWeight) {
    return { available: false, tdee: null, reason: "insufficient-data" };
  }

  const loggedDayIntakes = [];
  let cursor = windowStartDate;
  while (cursor <= referenceDate) {
    const dateKey = formatDateKey(cursor);
    const nutrition = calculateDailyNutrition(foodEntries, dateKey);
    if (nutrition.count > 0) loggedDayIntakes.push(nutrition.calories_kcal);
    cursor = addDays(cursor, 1);
  }

  if (loggedDayIntakes.length < 14) {
    return { available: false, tdee: null, reason: "insufficient-data" };
  }

  const avgDailyIntake = average(loggedDayIntakes);
  const weightChangeKg = toNumber(endWeight.weight_kg) - toNumber(startWeight.weight_kg);
  const tdee = avgDailyIntake - (weightChangeKg * 7700) / windowDays;

  return { available: true, tdee, reason: null };
}

export function parseDateKey(dateKey) {
  if (!dateKey || typeof dateKey !== "string") return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function formatDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function getIsoWeekKey(dateKey) {
  const localDate = parseDateKey(dateKey);
  if (!localDate) return { key: "unknown", year: 0, week: 0, startDate: "" };

  const date = new Date(Date.UTC(localDate.getFullYear(), localDate.getMonth(), localDate.getDate()));
  const dayNumber = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  const year = date.getUTCFullYear();

  const monday = new Date(Date.UTC(localDate.getFullYear(), localDate.getMonth(), localDate.getDate()));
  const mondayDay = monday.getUTCDay() || 7;
  monday.setUTCDate(monday.getUTCDate() - mondayDay + 1);

  return {
    key: `${year}-W${String(week).padStart(2, "0")}`,
    year,
    week,
    startDate: monday.toISOString().slice(0, 10),
  };
}

export function average(values) {
  const valid = (values || []).map(toNumber).filter((value) => value !== null && Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

export function toNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
