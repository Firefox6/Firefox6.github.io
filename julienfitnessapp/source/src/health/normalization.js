import { calculateRecovery } from "../scores/calculate.js";

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const finite = (value) => Number.isFinite(value) ? Number(value) : null;
const average = (values) => {
  const numbers = values.map(finite).filter((value) => value !== null);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
};
const median = (values) => {
  const numbers = values.map(finite).filter((value) => value !== null).sort((a, b) => a - b);
  if (!numbers.length) return null;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2;
};
const dateFormatter = (date) => new Intl.DateTimeFormat("de-CH", { weekday: "long", day: "numeric", month: "long" }).format(date);
const timeFormatter = (date) => new Intl.DateTimeFormat("de-CH", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
const dateKey = (iso, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const duration = (minutes) => minutes === null || minutes === undefined ? "–" : `${Math.floor(minutes / 60)} h ${String(Math.round(minutes % 60)).padStart(2, "0")}`;
const percentage = (value) => `${value >= 0 ? "+" : ""}${Math.round(value)} %`;

function dayLabel(date, referenceDate) {
  const difference = Math.round((new Date(`${referenceDate}T12:00:00`).getTime() - new Date(`${date}T12:00:00`).getTime()) / 86400000);
  if (difference === 0) return "Heute";
  if (difference === 1) return "Gestern";
  return dateFormatter(new Date(`${date}T12:00:00`));
}

function workoutLoad(workout) {
  const durationMinutes = finite(workout.durationMinutes) || 0;
  const heartRate = finite(workout.averageHeartRateBpm);
  const intensity = heartRate === null ? 0.72 : clamp(0.55 + (heartRate - 80) / 100, 0.65, 1.55);
  return Math.round(clamp((durationMinutes * intensity) / 1.15));
}

function workoutName(workout) {
  const types = { running: "Laufen", walking: "Gehen", cycling: "Radfahren", strength_training: "Krafttraining", swimming: "Schwimmen", hiking: "Wandern", yoga: "Yoga" };
  return workout.title || types[workout.exerciseType] || "Training";
}

function buildSleepTimeline(session) {
  if (!session?.stages?.length) return [];
  const start = +new Date(session.startTime);
  const end = +new Date(session.endTime);
  const total = Math.max(end - start, 1);
  return session.stages
    .filter((stage) => ["awake", "light", "deep", "rem"].includes(stage.type))
    .map((stage) => [
      clamp(((+new Date(stage.startTime) - start) / total) * 100),
      clamp(((+new Date(stage.endTime) - start) / total) * 100),
      stage.type
    ]);
}

function scoreSleep(minutes, hasStages) {
  if (minutes === null) return null;
  const need = 480;
  const ratio = minutes / need;
  return Math.round(clamp(40 + ratio * 48 + (hasStages ? 4 : 0)));
}

function targetFor(recovery) {
  if (recovery === null) return "–";
  if (recovery < 40) return "10–28";
  if (recovery < 60) return "20–42";
  if (recovery < 80) return "35–58";
  return "45–70";
}

function recommendationFor(recovery) {
  if (recovery === null) return ["Auswertung wird aufgebaut.", "Sobald ausreichend Messwerte vorliegen, zeigt FitTrack eine tagesaktuelle Trainingsempfehlung."];
  if (recovery < 40) return ["Erholung priorisieren.", "Deine heutige Recovery ist deutlich reduziert. Halte die Belastung niedrig."];
  if (recovery < 60) return ["Leichte Aktivität ist sinnvoll.", "Deine Recovery ist reduziert. Bevorzuge eine lockere Einheit oder Bewegung im Alltag."];
  if (recovery < 80) return ["Normales Training ist sinnvoll.", "Deine Recovery und die jüngste Belastung liegen in einem für dich passenden Bereich."];
  return ["Eine intensive Einheit ist möglich.", "Deine Recovery ist hoch und die jüngste Belastung liegt im gewohnten Bereich."];
}

/** Converts the bounded, native Health Connect DTOs into UI data and calculated scores. */
export function normalizeHealthImport(payload) {
  const timeZone = payload.range.timeZone;
  const dailyDays = (payload.daily?.days || []).map((day) => ({ ...day })).sort((a, b) => a.date.localeCompare(b.date));
  const sessionByDate = new Map();
  for (const session of payload.sleep?.sessions || []) {
    const key = dateKey(session.endTime, timeZone);
    const previous = sessionByDate.get(key);
    if (!previous || (session.durationMinutes || 0) > (previous.durationMinutes || 0)) sessionByDate.set(key, session);
  }
  const recoveryByDate = new Map();
  for (const entry of payload.recovery?.hrvRmssd || []) {
    const key = dateKey(entry.time, timeZone);
    const current = recoveryByDate.get(key) || {};
    current.hrv = [...(current.hrv || []), entry.valueMs];
    recoveryByDate.set(key, current);
  }
  for (const entry of payload.recovery?.restingHeartRate || []) {
    const key = dateKey(entry.time, timeZone);
    const current = recoveryByDate.get(key) || {};
    current.rhr = [...(current.rhr || []), entry.beatsPerMinute];
    recoveryByDate.set(key, current);
  }
  const rawWorkouts = payload.workoutData?.workouts || [];
  const workoutsByDate = new Map();
  for (const workout of rawWorkouts) {
    const key = dateKey(workout.startTime, timeZone);
    workoutsByDate.set(key, [...(workoutsByDate.get(key) || []), workout]);
  }

  const allDates = new Set([...dailyDays.map((day) => day.date), ...sessionByDate.keys(), ...recoveryByDate.keys(), ...workoutsByDate.keys()]);
  const dates = [...allDates].sort();
  if (!dates.length) return null;

  const normalized = dates.map((date) => {
    const day = dailyDays.find((item) => item.date === date) || { date };
    const measured = recoveryByDate.get(date) || {};
    const session = sessionByDate.get(date);
    const sleepMinutes = finite(day.sleepDurationMinutes) ?? finite(session?.durationMinutes);
    const hrv = finite(day.hrvRmssdMs) ?? median(measured.hrv || []);
    const restingHeartRate = finite(day.restingHeartRateBpm) ?? median(measured.rhr || []);
    const dayWorkouts = workoutsByDate.get(date) || [];
    const load = Math.round(clamp(
      dayWorkouts.reduce((sum, workout) => sum + workoutLoad(workout), 0) +
      Math.min(18, (finite(day.steps) || 0) / 1100) +
      Math.min(16, (finite(day.activeCaloriesKcal) || 0) / 38)
    ));
    return { date, day, session, sleepMinutes, hrv, restingHeartRate, dayWorkouts, load, sleep: scoreSleep(sleepMinutes, Boolean(session?.stages?.length)) };
  });

  const current = normalized.at(-1);
  const beforeCurrent = normalized.slice(0, -1);
  const hrvBaseline = median(beforeCurrent.map((day) => day.hrv)) ?? median(normalized.map((day) => day.hrv));
  const rhrBaseline = median(beforeCurrent.map((day) => day.restingHeartRate)) ?? median(normalized.map((day) => day.restingHeartRate));
  const recentLoad = average(beforeCurrent.slice(-3).map((day) => day.load));
  const loadBaseline = median(beforeCurrent.map((day) => day.load)) ?? median(normalized.map((day) => day.load));
  const recoveryResults = normalized.map((day, index) => {
    const hrvDifference = day.hrv !== null && hrvBaseline ? ((day.hrv - hrvBaseline) / hrvBaseline) * 100 : null;
    const rhrDifference = day.restingHeartRate !== null && rhrBaseline ? day.restingHeartRate - rhrBaseline : null;
    const previousLoad = average(normalized.slice(Math.max(0, index - 3), index).map((item) => item.load));
    const previousLoadDifference = previousLoad !== null && loadBaseline ? ((previousLoad - loadBaseline) / Math.max(loadBaseline, 1)) * 100 : null;
    return calculateRecovery({
      hrvBalance: hrvDifference === null ? {} : { score: clamp(70 + hrvDifference * 1.5) },
      restingHeartRate: rhrDifference === null ? {} : { score: clamp(78 - rhrDifference * 7) },
      sleepRestoration: day.sleep === null ? {} : { score: day.sleep },
      recentLoad: previousLoadDifference === null ? {} : { score: clamp(76 - previousLoadDifference * 0.65) }
    });
  });
  const hrvDeviation = current.hrv !== null && hrvBaseline ? ((current.hrv - hrvBaseline) / hrvBaseline) * 100 : null;
  const rhrDeviation = current.restingHeartRate !== null && rhrBaseline ? current.restingHeartRate - rhrBaseline : null;
  const loadDeviation = recentLoad !== null && loadBaseline ? ((recentLoad - loadBaseline) / Math.max(loadBaseline, 1)) * 100 : null;
  const recoveryResult = recoveryResults.at(-1);
  const recovery = recoveryResult.value;
  const completedDays = normalized.filter((day) => day.sleepMinutes !== null || day.hrv !== null || day.restingHeartRate !== null || day.dayWorkouts.length).length;
  const [recommendation, recommendationDetail] = recommendationFor(recovery);
  const factors = [
    current.hrv !== null && { name: "HRV", effect: hrvDeviation > 3 ? "positive" : hrvDeviation < -3 ? "negative" : "normal", arrow: hrvDeviation > 3 ? "↑" : hrvDeviation < -3 ? "↓" : "→", value: `${Math.round(current.hrv)} ms`, baseline: hrvBaseline ? `${Math.round(hrvBaseline)} ms` : "Noch im Aufbau", delta: hrvDeviation === null ? "–" : percentage(hrvDeviation), detail: hrvDeviation === null ? "Für HRV liegt noch keine persönliche Baseline vor." : "Deine nächtliche HRV wird mit deiner persönlichen Baseline verglichen." },
    current.sleepMinutes !== null && { name: "Schlafdauer", effect: current.sleep >= 75 ? "positive" : current.sleep < 60 ? "negative" : "normal", arrow: current.sleep >= 75 ? "↑" : current.sleep < 60 ? "↓" : "→", value: duration(current.sleepMinutes), baseline: "8 h 00 min Bedarf", delta: `${Math.round(current.sleepMinutes - 480)} min`, detail: "Die Schlafdauer stammt direkt aus deiner zuletzt aufgezeichneten Schlafsession." },
    current.restingHeartRate !== null && { name: "Ruhepuls", effect: rhrDeviation !== null && rhrDeviation > 1.5 ? "negative" : rhrDeviation !== null && rhrDeviation < -1.5 ? "positive" : "normal", arrow: rhrDeviation !== null && rhrDeviation > 1.5 ? "↓" : rhrDeviation !== null && rhrDeviation < -1.5 ? "↑" : "→", value: `${Math.round(current.restingHeartRate)} bpm`, baseline: rhrBaseline ? `${Math.round(rhrBaseline)} bpm` : "Noch im Aufbau", delta: rhrDeviation === null ? "–" : `${rhrDeviation >= 0 ? "+" : ""}${Math.round(rhrDeviation)} bpm`, detail: "Der Ruhepuls wird mit deinem üblichen Bereich verglichen." },
    { name: "Letzte Belastung", effect: loadDeviation !== null && loadDeviation > 15 ? "negative" : "normal", arrow: loadDeviation !== null && loadDeviation > 15 ? "↓" : "→", value: `${Math.round(recentLoad || 0)} Load`, baseline: loadBaseline === null ? "Noch im Aufbau" : `${Math.round(loadBaseline)} Load`, delta: loadDeviation === null ? "–" : percentage(loadDeviation), detail: "Die Belastung der letzten Tage berücksichtigt Workouts stärker als Alltagsbewegung." }
  ].filter(Boolean);
  const insights = [
    hrvDeviation !== null && `Deine HRV liegt ${Math.abs(Math.round(hrvDeviation))} % ${hrvDeviation >= 0 ? "über" : "unter"} deiner persönlichen Baseline.`,
    current.sleepMinutes !== null && `Du hast ${Math.abs(Math.round(current.sleepMinutes - 480))} Minuten ${current.sleepMinutes >= 480 ? "mehr" : "weniger"} geschlafen als dein aktueller Basisbedarf.`,
    loadDeviation !== null && `Die Belastung der letzten drei Tage liegt ${Math.abs(Math.round(loadDeviation))} % ${loadDeviation >= 0 ? "über" : "unter"} deinem üblichen Niveau.`
  ].filter(Boolean).slice(0, 3);

  const mappedWorkouts = rawWorkouts
    .map((workout) => ({
      id: workout.recordId,
      day: dayLabel(dateKey(workout.startTime, timeZone), current.date),
      type: workoutName(workout),
      time: timeFormatter(new Date(workout.startTime)),
      duration: `${Math.round(workout.durationMinutes || 0)} min`,
      load: workoutLoad(workout),
      calories: Math.round(workout.activeCaloriesKcal || 0),
      distance: workout.distanceMeters ? `${(workout.distanceMeters / 1000).toFixed(1).replace(".", ",")} km` : "–",
      averageHr: Math.round(workout.averageHeartRateBpm || 0),
      maxHr: Math.round(workout.maximumHeartRateBpm || 0),
      zones: [],
      contribution: workoutLoad(workout) >= 55 ? "Hohe Gesamtbelastung" : workoutLoad(workout) >= 25 ? "Moderate Gesamtbelastung" : "Leichte Gesamtbelastung"
    }))
    .sort((a, b) => (a.day === "Heute" ? -1 : 1));

  const series = {
    recovery: recoveryResults.map((result) => result.value).filter(Number.isFinite).slice(-7),
    sleep: normalized.map((day) => day.sleep).filter(Number.isFinite).slice(-7),
    load: normalized.map((day) => day.load).filter(Number.isFinite).slice(-7),
    hrv: normalized.map((day) => day.hrv).filter(Number.isFinite).slice(-7),
    resting: normalized.map((day) => day.restingHeartRate).filter(Number.isFinite).slice(-7),
    duration: normalized.map((day) => day.sleepMinutes === null ? null : day.sleepMinutes / 60).filter(Number.isFinite).slice(-7)
  };
  const sleepSession = current.session;
  const trendCards = [
    { key: "recovery", name: "Recovery", value: recovery === null ? "–" : `Ø ${Math.round(average(series.recovery) || recovery)}`, change: recovery === null ? "–" : `${recovery >= 60 ? "+" : ""}${recovery}`, unit: "aktuelle Auswertung", tone: recovery >= 80 ? "great" : recovery >= 60 ? "good" : "reduced" },
    { key: "sleep", name: "Sleep", value: current.sleep === null ? "–" : `Ø ${Math.round(average(series.sleep) || current.sleep)}`, change: current.sleep === null ? "–" : `${current.sleep}`, unit: "aus Schlafdaten", tone: current.sleep >= 80 ? "great" : current.sleep >= 60 ? "good" : "reduced" },
    { key: "load", name: "Load", value: `${current.load}`, change: `${current.load}`, unit: "heutige Belastung", tone: current.load < 50 ? "good" : "reduced" },
    { key: "hrv", name: "HRV", value: current.hrv === null ? "–" : `${Math.round(current.hrv)} ms`, change: hrvDeviation === null ? "–" : percentage(hrvDeviation), unit: "zu deiner Baseline", tone: hrvDeviation >= 0 ? "great" : "reduced" },
    { key: "resting", name: "Ruhepuls", value: current.restingHeartRate === null ? "–" : `${Math.round(current.restingHeartRate)} bpm`, change: rhrDeviation === null ? "–" : `${Math.round(rhrDeviation)} bpm`, unit: "zu deiner Baseline", tone: rhrDeviation !== null && rhrDeviation <= 0 ? "good" : "reduced" },
    { key: "duration", name: "Schlafdauer", value: duration(current.sleepMinutes), change: current.sleepMinutes === null ? "–" : `${Math.round(current.sleepMinutes - 480)} min`, unit: "zu deinem Basisbedarf", tone: current.sleep >= 75 ? "good" : "reduced" }
  ];

  const missingGroups = [...new Set([payload.daily, payload.sleep, payload.recovery, payload.workoutData, payload.weight].flatMap((result) => result?.missingGroups || []))];
  return {
    profile: { firstName: "Julien", baselineDays: 28, populatedDays: Math.min(completedDays, 28) },
    today: {
      date: dateFormatter(new Date(`${current.date}T12:00:00`)),
      updatedAt: timeFormatter(new Date()),
      recovery,
      sleep: current.sleep,
      load: current.load,
      target: targetFor(recovery),
      delta: recovery === null || series.recovery.length < 2 ? null : recovery - series.recovery.at(-2),
      confidence: recoveryResult.confidence,
      completeness: recoveryResult.completeness,
      recommendation,
      recommendationDetail,
      factors,
      insights,
      latestWorkoutId: mappedWorkouts[0]?.id,
      sleepMinutes: current.sleepMinutes,
      sleepNeedMinutes: 480,
      sleepSession,
      isLive: true,
      missingGroups
    },
    series,
    trendCards,
    workouts: mappedWorkouts,
    sleepTimeline: buildSleepTimeline(sleepSession),
    missingGroups
  };
}
