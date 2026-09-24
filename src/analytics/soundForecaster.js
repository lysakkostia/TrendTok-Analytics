/**
 * TrendTok Analytics — Sound Trajectory Forecaster (Damped Logistic Diffusion)
 * Implements REQ-FR-17 (Clause 1): Specialized forecasting model for music tracks
 * accounting for multi-week creator adoption S-curves and saturation ceilings.
 */

export const DEFAULT_SOUND_PARAMS = Object.freeze({
  w1: 0.50,
  w6: 0.35,
  w24: 0.15,
  logisticRateScale: 0.14,
  capacityMultiplier: 6.5,
  dampingFactor: 0.88
});

/**
 * Forecasts future video creations (+6h and +24h) and saturation parameters for a music track
 * using a Damped Logistic Diffusion (S-curve) model.
 *
 * @param {Array<{ timestamp: string, totalViews: number, totalVideos: number }>} snapshots
 * @param {Object} [params=DEFAULT_SOUND_PARAMS] - Tunable model hyperparameters
 * @returns {Object} Forecast metrics including +6h/+24h projections and breakout probability
 */
export function forecastSoundTrajectory(snapshots = [], params = DEFAULT_SOUND_PARAMS) {
  const cfg = { ...DEFAULT_SOUND_PARAMS, ...(params || {}) };

  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    return {
      modelType: "damped_logistic_sound",
      currentVideos: 0,
      velocity1h: 0,
      acceleration: 0,
      predictedVideos6h: 0,
      predictedVideos24h: 0,
      carryingCapacityK: 0,
      growthRateR: 0,
      breakoutProbability: 0,
      hoursToPeak: 0
    };
  }

  const latest = snapshots[snapshots.length - 1];
  const currentVideos = Math.max(0, Number(latest.totalVideos) || 0);

  if (snapshots.length === 1) {
    return {
      modelType: "damped_logistic_sound",
      currentVideos,
      velocity1h: 0,
      acceleration: 0,
      predictedVideos6h: currentVideos,
      predictedVideos24h: currentVideos,
      carryingCapacityK: Math.round(currentVideos * cfg.capacityMultiplier),
      growthRateR: 0,
      breakoutProbability: 0.05,
      hoursToPeak: 0
    };
  }

  const prev1 = snapshots[snapshots.length - 2];
  const prev2 = snapshots.length >= 3 ? snapshots[snapshots.length - 3] : prev1;

  const v1 = Math.max(0, currentVideos - (Number(prev1.totalVideos) || 0));
  const vPrev = snapshots.length >= 3
    ? Math.max(0, (Number(prev1.totalVideos) || 0) - (Number(prev2.totalVideos) || 0))
    : v1 * 0.85;

  const acceleration = Number((v1 - vPrev).toFixed(2));

  // Multi-window velocity blend
  const firstSnap = snapshots[0];
  const spanSteps = Math.max(1, snapshots.length - 1);
  const vAvg = Math.max(0, (currentVideos - (Number(firstSnap.totalVideos) || 0)) / spanSteps);

  const wSum = Math.max(0.01, cfg.w1 + cfg.w6);
  const blendedVelocity = (v1 * cfg.w1 + vAvg * cfg.w6) / wSum;

  // Estimate Carrying Capacity (K) dynamically from current base + velocity momentum
  const dynamicHeadroom = blendedVelocity * 24 * cfg.capacityMultiplier * (acceleration > 0 ? 1.25 : 0.75);
  const carryingCapacityK = Math.max(
    currentVideos + Math.max(20, Math.round(v1 * 2)),
    Math.round(currentVideos + dynamicHeadroom)
  );

  // Effective intrinsic growth rate r per hour
  const relativeVelocity = blendedVelocity / Math.max(50, currentVideos);
  const growthRateR = Math.min(0.45, Math.max(0.01, relativeVelocity * (1 + cfg.logisticRateScale)));

  // Damped Logistic helper for horizon h (hours)
  function projectAtHorizon(hours) {
    if (v1 <= 0) return currentVideos;
    const dampedHours = Math.pow(hours, cfg.dampingFactor);
    const ratio = (carryingCapacityK - currentVideos) / Math.max(1, currentVideos);
    const logisticVal = carryingCapacityK / (1 + ratio * Math.exp(-growthRateR * dampedHours));
    return Math.max(currentVideos, Math.round(logisticVal));
  }

  const predictedVideos6h = projectAtHorizon(6);
  const predictedVideos24h = projectAtHorizon(24);

  // Breakout probability [0..1]
  const rawProb = Math.min(
    0.98,
    Math.max(0.02, (blendedVelocity / 220) * 0.65 + (acceleration > 0 ? 0.25 : 0.0) + (latest.totalViews >= 15000 ? 0.10 : 0))
  );

  const hoursToPeak = acceleration > 0 && v1 < 200
    ? Number(Math.max(1.0, (200 - v1) / Math.max(1, acceleration)).toFixed(1))
    : 0.0;

  return {
    modelType: "damped_logistic_sound",
    currentVideos,
    velocity1h: v1,
    acceleration,
    predictedVideos6h,
    predictedVideos24h,
    carryingCapacityK,
    growthRateR: Number(growthRateR.toFixed(4)),
    breakoutProbability: Number(rawProb.toFixed(2)),
    hoursToPeak
  };
}

/**
 * Performs historical backtesting on a sound snapshot series by holding out the last
 * `holdoutSteps` observations, predicting them from the early prefix, and computing MAPE.
 *
 * @param {Array<Object>} snapshots - Chronological snapshots (requires >= 4 points)
 * @param {number} [holdoutSteps=2] - Number of trailing snapshots to hide and predict
 * @param {Object} [params=DEFAULT_SOUND_PARAMS] - Model hyperparameters
 * @returns {{ predictedVideos: number, actualVideos: number, mape: number, accuracyPercent: number, holdoutSteps: number }}
 */
export function backtestSoundForecast(snapshots = [], holdoutSteps = 2, params = DEFAULT_SOUND_PARAMS) {
  if (!Array.isArray(snapshots) || snapshots.length < holdoutSteps + 2) {
    return {
      predictedVideos: 0,
      actualVideos: 0,
      mape: 0,
      accuracyPercent: 100,
      holdoutSteps: 0
    };
  }

  const cfg = { ...DEFAULT_SOUND_PARAMS, ...(params || {}) };
  const splitIdx = snapshots.length - holdoutSteps;
  const trainingPrefix = snapshots.slice(0, splitIdx);
  const targetActual = snapshots[snapshots.length - 1].totalVideos;

  // Compute forecast on training prefix and project forward by `holdoutSteps` hours
  const prefixForecast = forecastSoundTrajectory(trainingPrefix, cfg);
  const baseVids = prefixForecast.currentVideos;
  const K = prefixForecast.carryingCapacityK;
  const r = prefixForecast.growthRateR;

  const dampedH = Math.pow(holdoutSteps, cfg.dampingFactor);
  const ratio = (K - baseVids) / Math.max(1, baseVids);
  const predictedVideos = Math.max(
    baseVids,
    Math.round(K / (1 + ratio * Math.exp(-r * dampedH)))
  );

  const errorRatio = Math.abs(predictedVideos - targetActual) / Math.max(1, targetActual);
  const mape = Number((errorRatio * 100).toFixed(2));
  const accuracyPercent = Number(Math.max(0, 100 - mape).toFixed(2));

  return {
    predictedVideos,
    actualVideos: targetActual,
    mape,
    accuracyPercent,
    holdoutSteps
  };
}
