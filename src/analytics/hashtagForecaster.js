/**
 * TrendTok Analytics — Breakout Hashtag Spike Forecaster (Impulse-Response Holt Model)
 * Implements REQ-FR-17 (Clause 2): Specialized forecasting model for topical hashtag spikes
 * accounting for high initial velocity impulse and rapid 48h-96h decay.
 */

export const DEFAULT_HASHTAG_PARAMS = Object.freeze({
  w1: 0.60,
  w6: 0.30,
  w24: 0.10,
  alpha: 0.72,
  beta: 0.48,
  phiDamping: 0.85
});

/**
 * Computes damped geometric sum: phi + phi^2 + ... + phi^h
 *
 * @param {number} phi - Damping parameter in (0, 1]
 * @param {number} horizon - Steps ahead
 * @returns {number}
 */
function dampedSum(phi, horizon) {
  const p = Math.min(0.99, Math.max(0.1, Number(phi) || 0.85));
  let sum = 0;
  let term = p;
  for (let i = 1; i <= horizon; i++) {
    sum += term;
    term *= p;
  }
  return sum;
}

/**
 * Forecasts future creations (+6h and +24h), spike intensity, and decay half-life
 * for a breakout hashtag using Holt's Damped Trend Exponential Smoothing.
 *
 * @param {Array<{ timestamp: string, totalViews: number, totalVideos: number }>} snapshots
 * @param {Object} [params=DEFAULT_HASHTAG_PARAMS] - Tunable hyperparameters
 * @returns {Object} Forecast metrics for the hashtag spike
 */
export function forecastHashtagSpike(snapshots = [], params = DEFAULT_HASHTAG_PARAMS) {
  const cfg = { ...DEFAULT_HASHTAG_PARAMS, ...(params || {}) };

  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    return {
      modelType: "impulse_holt_hashtag",
      currentVideos: 0,
      velocity1h: 0,
      acceleration: 0,
      predictedVideos6h: 0,
      predictedVideos24h: 0,
      spikeIntensityIndex: 0,
      decayHalfLifeHours: 0,
      breakoutProbability: 0
    };
  }

  const latest = snapshots[snapshots.length - 1];
  const currentVideos = Math.max(0, Number(latest.totalVideos) || 0);

  if (snapshots.length === 1) {
    return {
      modelType: "impulse_holt_hashtag",
      currentVideos,
      velocity1h: 0,
      acceleration: 0,
      predictedVideos6h: currentVideos,
      predictedVideos24h: currentVideos,
      spikeIntensityIndex: 0,
      decayHalfLifeHours: 24,
      breakoutProbability: 0.05
    };
  }

  // Run Holt's Double Exponential Smoothing with damping across snapshot series
  let level = Number(snapshots[0].totalVideos) || 0;
  let trend = Math.max(0, (Number(snapshots[1].totalVideos) || 0) - level);

  for (let i = 1; i < snapshots.length; i++) {
    const y = Math.max(0, Number(snapshots[i].totalVideos) || 0);
    const prevLevel = level;
    level = cfg.alpha * y + (1 - cfg.alpha) * (prevLevel + cfg.phiDamping * trend);
    trend = cfg.beta * (level - prevLevel) + (1 - cfg.beta) * cfg.phiDamping * trend;
  }

  const prev1 = snapshots[snapshots.length - 2];
  const prev2 = snapshots.length >= 3 ? snapshots[snapshots.length - 3] : prev1;
  const v1 = Math.max(0, currentVideos - (Number(prev1.totalVideos) || 0));
  const vPrev = snapshots.length >= 3
    ? Math.max(0, (Number(prev1.totalVideos) || 0) - (Number(prev2.totalVideos) || 0))
    : v1 * 0.8;
  const acceleration = Number((v1 - vPrev).toFixed(2));

  const nonNegTrend = Math.max(0, trend);
  const predictedVideos6h = Math.max(
    currentVideos,
    Math.round(currentVideos + dampedSum(cfg.phiDamping, 6) * nonNegTrend)
  );
  const predictedVideos24h = Math.max(
    predictedVideos6h,
    Math.round(currentVideos + dampedSum(cfg.phiDamping, 24) * nonNegTrend)
  );

  // Spike intensity normalized against hashtag ceiling (500 videos/hr)
  const spikeIntensityIndex = Number(Math.min(100.0, (v1 / 500.0) * 100.0).toFixed(2));

  // Decay half-life: hours until impulse velocity drops by 50% under damping phi
  const safePhi = Math.min(0.98, Math.max(0.5, cfg.phiDamping));
  const decayHalfLifeHours = Number(Math.max(2.0, Math.LN2 / Math.abs(Math.log(safePhi))).toFixed(1));

  const rawProb = Math.min(
    0.98,
    Math.max(0.02, (v1 / 500) * 0.60 + (acceleration > 0 ? 0.25 : 0) + (latest.totalViews >= 25000 ? 0.15 : 0))
  );

  return {
    modelType: "impulse_holt_hashtag",
    currentVideos,
    velocity1h: v1,
    acceleration,
    SmoothedTrend: Number(nonNegTrend.toFixed(2)),
    predictedVideos6h,
    predictedVideos24h,
    spikeIntensityIndex,
    decayHalfLifeHours,
    breakoutProbability: Number(rawProb.toFixed(2))
  };
}

/**
 * Performs historical backtesting on a hashtag snapshot series by holding out the last
 * `holdoutSteps` observations and evaluating Holt Damped Trend prediction error (MAPE).
 *
 * @param {Array<Object>} snapshots - Chronological snapshots (requires >= 4 points)
 * @param {number} [holdoutSteps=2] - Number of trailing snapshots to hold out
 * @param {Object} [params=DEFAULT_HASHTAG_PARAMS] - Hyperparameters
 * @returns {{ predictedVideos: number, actualVideos: number, mape: number, accuracyPercent: number, holdoutSteps: number }}
 */
export function backtestHashtagForecast(snapshots = [], holdoutSteps = 2, params = DEFAULT_HASHTAG_PARAMS) {
  if (!Array.isArray(snapshots) || snapshots.length < holdoutSteps + 2) {
    return {
      predictedVideos: 0,
      actualVideos: 0,
      mape: 0,
      accuracyPercent: 100,
      holdoutSteps: 0
    };
  }

  const cfg = { ...DEFAULT_HASHTAG_PARAMS, ...(params || {}) };
  const splitIdx = snapshots.length - holdoutSteps;
  const prefix = snapshots.slice(0, splitIdx);
  const targetActual = snapshots[snapshots.length - 1].totalVideos;

  // Compute Holt parameters on prefix
  let level = Number(prefix[0].totalVideos) || 0;
  let trend = Math.max(0, (Number(prefix[1].totalVideos) || 0) - level);

  for (let i = 1; i < prefix.length; i++) {
    const y = Math.max(0, Number(prefix[i].totalVideos) || 0);
    const prevLevel = level;
    level = cfg.alpha * y + (1 - cfg.alpha) * (prevLevel + cfg.phiDamping * trend);
    trend = cfg.beta * (level - prevLevel) + (1 - cfg.beta) * cfg.phiDamping * trend;
  }

  const baseVideos = prefix[prefix.length - 1].totalVideos;
  const predictedVideos = Math.max(
    baseVideos,
    Math.round(baseVideos + dampedSum(cfg.phiDamping, holdoutSteps) * Math.max(0, trend))
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
