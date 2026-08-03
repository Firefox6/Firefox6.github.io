import { recoveryConfiguration, SCORE_ALGORITHM_VERSION } from "./score-config.js";

/**
 * Normalises an incomplete factor set without treating missing records as zeros.
 * The returned completeness is persisted with a score so stale caches can be explained.
 */
export function calculateRecovery(factors) {
  const available = Object.entries(recoveryConfiguration.factors).filter(([name]) => Number.isFinite(factors[name]?.score));
  if (!available.length) return { value: null, confidence: "low", completeness: 0, factors: [], algorithmVersion: SCORE_ALGORITHM_VERSION };
  const totalWeight = available.reduce((sum, [, weight]) => sum + weight, 0);
  const value = available.reduce((sum, [name, weight]) => sum + factors[name].score * (weight / totalWeight), 0);
  const completeness = Math.round((totalWeight / Object.values(recoveryConfiguration.factors).reduce((sum, weight) => sum + weight, 0)) * 100);
  return {
    value: Math.round(Math.max(0, Math.min(100, value))),
    completeness,
    confidence: completeness >= 90 ? "high" : completeness >= 60 ? "medium" : "low",
    algorithmVersion: SCORE_ALGORITHM_VERSION,
    factors: available.map(([name]) => ({ name, ...factors[name] }))
  };
}

export function scoreState(value, type = "recovery") {
  if (!Number.isFinite(value)) return { label: "Daten fehlen", tone: "neutral", level: -1 };
  // Load uses its own training-zone cutoffs: a daily load of 36 is moderate,
  // while Recovery and Sleep retain the shared 0–39/40–59/60–79/80–100 bands.
  const level = type === "load"
    ? (value < 25 ? 0 : value < 50 ? 1 : value < 75 ? 2 : 3)
    : (value < 40 ? 0 : value < 60 ? 1 : value < 80 ? 2 : 3);
  const labels = {
    recovery: ["Niedrige Erholung", "Reduzierte Erholung", "Gute Erholung", "Sehr gute Erholung"],
    sleep: ["Unzureichend", "Ausbaufähig", "Gut", "Sehr gut"],
    load: ["Leicht", "Moderat", "Hoch", "Sehr hoch"]
  };
  const tones = ["low", "reduced", "good", "great"];
  return { label: labels[type][level], tone: tones[level], level };
}
