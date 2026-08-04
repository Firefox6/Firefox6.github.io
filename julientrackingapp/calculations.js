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

export const CALORIE_POOL_DAILY_CAP_KCAL = 250;
export const CALORIE_POOL_VALID_DAYS = 7;

export function getCalorieGoalForDate(calorieGoal, goalHistory, dateKey) {
  const fallbackGoal = toNumber(calorieGoal) || 0;
  if (!dateKey) return fallbackGoal;

  const matchingHistory = (goalHistory || [])
    .map((entry) => ({
      effective_date: entry?.effective_date,
      calorie_goal_kcal: toNumber(entry?.calorie_goal_kcal),
    }))
    .filter((entry) => parseDateKey(entry.effective_date) && entry.calorie_goal_kcal !== null && entry.calorie_goal_kcal >= 0)
    .sort((a, b) => a.effective_date.localeCompare(b.effective_date));

  let goal = fallbackGoal;
  for (const entry of matchingHistory) {
    if (entry.effective_date > dateKey) break;
    goal = entry.calorie_goal_kcal;
  }
  return goal;
}

export function calculateCaloriePoolLedger(foodEntries, calorieGoal, goalHistory, referenceDateKey) {
  const referenceDate = parseDateKey(referenceDateKey);
  const emptyLedger = {
    available_kcal: 0,
    available_at_day_start_kcal: 0,
    used_today_kcal: 0,
    regular_open_kcal: 0,
    total_open_kcal: 0,
    over_target_after_pool_kcal: 0,
    base_goal_kcal: 0,
    total_allowance_kcal: 0,
    buckets: [],
    today_allocations: [],
  };
  if (!referenceDate) return emptyLedger;

  const referenceKey = formatDateKey(referenceDate);
  const dailyCalories = buildDailyCalorieIndex(foodEntries, referenceKey);
  const firstLoggedDateKey = [...dailyCalories.keys()].sort()[0] || referenceKey;
  const startDate = parseDateKey(firstLoggedDateKey) || referenceDate;
  const buckets = [];
  let availableAtDayStart = 0;
  let usedToday = 0;
  let todayAllocations = [];
  const referenceNutrition = dailyCalories.get(referenceKey) || { calories_kcal: 0, count: 0 };
  const referenceGoal = getCalorieGoalForDate(calorieGoal, goalHistory, referenceKey);

  for (let cursor = startDate; cursor <= referenceDate; cursor = addDays(cursor, 1)) {
    const dateKey = formatDateKey(cursor);
    const nutrition = dailyCalories.get(dateKey) || { calories_kcal: 0, count: 0 };
    const goal = dateKey === referenceKey ? referenceGoal : getCalorieGoalForDate(calorieGoal, goalHistory, dateKey);

    // An Anteil darf bis einschliesslich seines siebten Folgetags verwendet werden.
    // Er verschwindet erst zu Beginn des darauffolgenden Tages.
    for (let index = buckets.length - 1; index >= 0; index -= 1) {
      if (buckets[index].last_usable_date < dateKey || buckets[index].remaining_kcal <= 0) {
        buckets.splice(index, 1);
      }
    }

    if (dateKey === referenceKey) {
      availableAtDayStart = sumPoolKcal(buckets);
    }

    const overage = nutrition.count > 0 && goal > 0
      ? Math.max(nutrition.calories_kcal - goal, 0)
      : 0;
    const allocations = consumePoolBuckets(buckets, overage);

    if (dateKey === referenceKey) {
      todayAllocations = allocations;
      usedToday = allocations.reduce((sum, allocation) => sum + allocation.kcal, 0);
    }

    // Der aktuelle Tag ist erst nach Tagesabschluss als neue Poolquelle verfügbar.
    if (dateKey !== referenceKey && nutrition.count > 0 && goal > 0) {
      const credit = Math.min(Math.max(goal - nutrition.calories_kcal, 0), CALORIE_POOL_DAILY_CAP_KCAL);
      if (credit > 0) {
        buckets.push({
          source_date: dateKey,
          initial_kcal: credit,
          remaining_kcal: credit,
          last_usable_date: formatDateKey(addDays(cursor, CALORIE_POOL_VALID_DAYS)),
        });
      }
    }
  }

  const available = sumPoolKcal(buckets);
  const currentCalories = referenceNutrition.calories_kcal;
  const overage = referenceGoal > 0 ? Math.max(currentCalories - referenceGoal, 0) : 0;
  const regularOpen = referenceGoal > 0 ? Math.max(referenceGoal - currentCalories, 0) : 0;
  const activeBuckets = buckets.filter((bucket) => bucket.remaining_kcal > 0);

  return {
    available_kcal: available,
    available_at_day_start_kcal: availableAtDayStart,
    used_today_kcal: usedToday,
    regular_open_kcal: regularOpen,
    total_open_kcal: regularOpen + available,
    over_target_after_pool_kcal: Math.max(overage - usedToday, 0),
    base_goal_kcal: referenceGoal,
    total_allowance_kcal: referenceGoal + availableAtDayStart,
    buckets: activeBuckets.map((bucket) => ({
      ...bucket,
      used_kcal: bucket.initial_kcal - bucket.remaining_kcal,
      days_until_expiry: daysBetween(referenceDate, parseDateKey(bucket.last_usable_date)),
    })),
    today_allocations: todayAllocations,
  };
}

export function caloriePoolProgressText(calories, ledger) {
  const current = toNumber(calories) || 0;
  const baseGoal = toNumber(ledger?.base_goal_kcal) || 0;
  const poolAtStart = toNumber(ledger?.available_at_day_start_kcal) || 0;
  if (!baseGoal) return `${formatPoolNumber(current)} kcal · kein Ziel gesetzt`;
  return `${formatPoolNumber(current)} kcal / ${formatPoolNumber(baseGoal)} kcal${poolAtStart > 0 ? ` + ${formatPoolNumber(poolAtStart)} kcal Pool` : ""}`;
}

export function caloriePoolBalanceText(ledger) {
  const baseGoal = toNumber(ledger?.base_goal_kcal) || 0;
  if (!baseGoal) return "Kein Kalorienziel gesetzt";

  const regularOpen = toNumber(ledger.regular_open_kcal) || 0;
  const poolOpen = toNumber(ledger.available_kcal) || 0;
  const overTarget = toNumber(ledger.over_target_after_pool_kcal) || 0;
  const usedToday = toNumber(ledger.used_today_kcal) || 0;

  if (regularOpen > 0) {
    return poolOpen > 0
      ? `Noch ${formatPoolNumber(regularOpen)} kcal (+${formatPoolNumber(poolOpen)} kcal aus Pool) offen`
      : `Noch ${formatPoolNumber(regularOpen)} kcal offen`;
  }
  if (poolOpen > 0) return `Noch ${formatPoolNumber(poolOpen)} kcal aus Pool offen`;
  if (overTarget > 0) return `${formatPoolNumber(overTarget)} kcal über Ziel und Pool`;
  if (usedToday > 0) return "Tagesziel inkl. Pool erreicht";
  return "Tagesziel erreicht";
}

export function formatPoolExpiry(bucket) {
  const days = toNumber(bucket?.days_until_expiry) || 0;
  if (days === 0) return "Verfällt heute";
  if (days === 1) return "Verfällt morgen";
  return `Verfällt in ${formatPoolNumber(days)} Tagen`;
}

function consumePoolBuckets(buckets, kcalToConsume) {
  let remainingToConsume = kcalToConsume;
  const allocations = [];

  for (const bucket of buckets) {
    if (remainingToConsume <= 0) break;
    const consumed = Math.min(bucket.remaining_kcal, remainingToConsume);
    if (consumed <= 0) continue;
    bucket.remaining_kcal -= consumed;
    remainingToConsume -= consumed;
    allocations.push({ source_date: bucket.source_date, kcal: consumed });
  }

  return allocations;
}

function buildDailyCalorieIndex(foodEntries, referenceDateKey) {
  const index = new Map();
  for (const entry of foodEntries || []) {
    if (!entry?.date || entry.date > referenceDateKey || !parseDateKey(entry.date)) continue;
    const summary = index.get(entry.date) || { calories_kcal: 0, count: 0 };
    summary.calories_kcal += toNumber(entry.calories_kcal) || 0;
    summary.count += 1;
    index.set(entry.date, summary);
  }
  return index;
}

function formatPoolNumber(value) {
  return new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 }).format(toNumber(value) || 0);
}

function sumPoolKcal(buckets) {
  return buckets.reduce((sum, bucket) => sum + bucket.remaining_kcal, 0);
}

function daysBetween(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  return Math.max(0, Math.round((end - start) / 86400000));
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
