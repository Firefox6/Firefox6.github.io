export const SCORE_ALGORITHM_VERSION = 1;

export const recoveryConfiguration = {
  version: SCORE_ALGORITHM_VERSION,
  factors: {
    hrvBalance: 0.35,
    restingHeartRate: 0.2,
    sleepRestoration: 0.25,
    recentLoad: 0.2
  },
  baselineDays: 28,
  minimumDays: 3
};

export const sleepConfiguration = {
  version: SCORE_ALGORITHM_VERSION,
  factors: { durationToNeed: 0.45, continuity: 0.2, regularity: 0.2, stages: 0.15 }
};
