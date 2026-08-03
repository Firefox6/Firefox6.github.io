export const profile = { firstName: "Julien", baselineDays: 28, populatedDays: 28 };

export const today = {
  date: "Montag, 3. August",
  updatedAt: "06:43",
  recovery: 78,
  sleep: 84,
  load: 36,
  target: "35–58",
  delta: 6,
  confidence: "hoch",
  completeness: 96,
  recommendation: "Normales Training ist sinnvoll.",
  recommendationDetail: "Deine Recovery ist gut und deine Belastung der letzten 48 Stunden liegt im gewohnten Bereich.",
  factors: [
    { name: "HRV", effect: "positive", arrow: "↑", value: "54 ms", baseline: "49 ms", delta: "+10 %", detail: "Deine nächtliche HRV liegt über deinem üblichen Bereich." },
    { name: "Schlafdauer", effect: "normal", arrow: "→", value: "7 h 43 min", baseline: "8 h 05 min Bedarf", delta: "−22 min", detail: "Deine Schlafmenge liegt nahe an deinem aktuellen Bedarf." },
    { name: "Ruhepuls", effect: "negative", arrow: "↓", value: "52 bpm", baseline: "50 bpm", delta: "+2 bpm", detail: "Der leicht erhöhte Ruhepuls begrenzt deine Recovery etwas." },
    { name: "Letzte Belastung", effect: "normal", arrow: "→", value: "36 Load", baseline: "32–45 Load", delta: "Im Bereich", detail: "Die Belastung der letzten 48 Stunden liegt in deinem üblichen Bereich." }
  ],
  insights: [
    "Deine HRV liegt 9 % über deiner 28-Tage-Baseline.",
    "Du hast 22 Minuten weniger geschlafen als dein aktueller Bedarf.",
    "Die Belastung der letzten drei Tage liegt im gewohnten Bereich."
  ],
  latestWorkoutId: "strength"
};

export const series = {
  recovery: [66, 71, 69, 73, 64, 72, 78],
  sleep: [79, 70, 84, 77, 68, 82, 84],
  load: [28, 51, 66, 39, 22, 46, 36],
  hrv: [46, 49, 47, 51, 45, 50, 54],
  resting: [51, 50, 53, 51, 54, 50, 52],
  duration: [7.2, 7.5, 7.8, 7.1, 6.8, 7.7, 7.72]
};

export const trendCards = [
  { key: "recovery", name: "Recovery", value: "Ø 74", change: "+6", unit: "gegenüber den vorherigen 28 Tagen", tone: "great" },
  { key: "sleep", name: "Sleep", value: "Ø 81", change: "+3", unit: "gegenüber den vorherigen 28 Tagen", tone: "good" },
  { key: "load", name: "Load", value: "214", change: "+18 %", unit: "gegenüber der Vorperiode", tone: "reduced" },
  { key: "hrv", name: "HRV", value: "52 ms", change: "+4 ms", unit: "zu deiner Baseline", tone: "great" },
  { key: "resting", name: "Ruhepuls", value: "51 bpm", change: "−1 bpm", unit: "zu deiner Baseline", tone: "good" },
  { key: "duration", name: "Schlafdauer", value: "7 h 31", change: "+12 min", unit: "zu deiner Baseline", tone: "good" }
];

export const workouts = [
  { id: "walk", day: "Heute", type: "Spaziergang", time: "12:18", duration: "34 min", load: 8, calories: 141, distance: "2,6 km", averageHr: 102, maxHr: 117, zones: [15, 16, 3, 0], contribution: "Leichte Alltagsbelastung" },
  { id: "strength", day: "Gestern", type: "Krafttraining", time: "18:06", duration: "58 min", load: 42, calories: 384, distance: "–", averageHr: 121, maxHr: 157, zones: [8, 25, 19, 6], contribution: "Moderate Gesamtbelastung" },
  { id: "walk-2", day: "Gestern", type: "Gehen", time: "12:44", duration: "21 min", load: 4, calories: 93, distance: "1,4 km", averageHr: 96, maxHr: 110, zones: [18, 3, 0, 0], contribution: "Leichte Alltagsbelastung" },
  { id: "run", day: "Samstag", type: "Laufen", time: "09:34", duration: "42 min", load: 46, calories: 502, distance: "6,8 km", averageHr: 145, maxHr: 169, zones: [4, 12, 17, 9], contribution: "Hohe aerobe Belastung" }
];

export const sleepTimeline = [
  [0, 17, "light"], [17, 29, "deep"], [29, 43, "light"], [43, 56, "rem"], [56, 68, "light"], [68, 82, "deep"], [82, 100, "rem"]
];
