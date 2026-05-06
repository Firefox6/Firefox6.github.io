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

export function calculateNavyBodyFat({ sex, heightCm, waistCm, neckCm, hipCm }) {
  const height = toNumber(heightCm);
  const waist = toNumber(waistCm);
  const neck = toNumber(neckCm);
  const hip = toNumber(hipCm);

  if (!height || !waist || !neck || height <= 0 || waist <= 0 || neck <= 0) {
    return null;
  }

  if (sex === "male") {
    const abdomenMinusNeck = waist - neck;
    if (abdomenMinusNeck <= 0) return null;
    return 495 / (1.0324 - 0.19077 * Math.log10(abdomenMinusNeck) + 0.15456 * Math.log10(height)) - 450;
  }

  if (sex === "female") {
    if (!hip || hip <= 0) return null;
    const waistPlusHipMinusNeck = waist + hip - neck;
    if (waistPlusHipMinusNeck <= 0) return null;
    return 495 / (1.29579 - 0.35004 * Math.log10(waistPlusHipMinusNeck) + 0.221 * Math.log10(height)) - 450;
  }

  return null;
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

export function calculateStrengthWorkoutVolume(workout) {
  if (!workout || workout.type !== "strength") return 0;
  return (workout.exercises || []).reduce((workoutTotal, exercise) => {
    const exerciseTotal = (exercise.sets || []).reduce((setTotal, set) => {
      const weight = toNumber(set.weight_kg) || 0;
      const reps = toNumber(set.reps) || 0;
      return setTotal + weight * reps;
    }, 0);
    return workoutTotal + exerciseTotal;
  }, 0);
}

export function calculateWeeklyTrainingStats(workouts, referenceDateKey = formatDateKey(new Date())) {
  const referenceWeek = getIsoWeekKey(referenceDateKey);
  const byWeekMap = new Map();

  for (const workout of workouts || []) {
    if (!workout.date) continue;
    const week = getIsoWeekKey(workout.date);
    if (!byWeekMap.has(week.key)) {
      byWeekMap.set(week.key, {
        key: week.key,
        label: `KW ${week.week}`,
        year: week.year,
        week: week.week,
        total: 0,
        strength: 0,
        cardio: 0,
        other: 0,
        volume: 0,
      });
    }

    const bucket = byWeekMap.get(week.key);
    bucket.total += 1;
    if (workout.type === "strength") {
      bucket.strength += 1;
      bucket.volume += calculateStrengthWorkoutVolume(workout);
    } else if (workout.type === "cardio") {
      bucket.cardio += 1;
    } else {
      bucket.other += 1;
    }
  }

  const byWeek = [...byWeekMap.values()].sort((a, b) => a.key.localeCompare(b.key));
  const emptyWeek = {
    key: referenceWeek.key,
    label: `KW ${referenceWeek.week}`,
    year: referenceWeek.year,
    week: referenceWeek.week,
    total: 0,
    strength: 0,
    cardio: 0,
    other: 0,
    volume: 0,
  };

  return {
    thisWeek: byWeekMap.get(referenceWeek.key) || emptyWeek,
    byWeek,
  };
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
