/**
 * TrendTok Analytics - Virality Velocity Scoring & Lifecycle Module
 * 
 * Implements SRS v2.0 (SRS-TRENDTOK-2026-V2) Section 3.1 & Addenda A, B.
 * - Entity-differentiated Noise Guardrails (REQ-FR-02)
 * - Multi-window weighted velocity scoring (REQ-FR-03)
 * - Trend lifecycle state transitions (REQ-FR-04)
 * - High-speed pure functions with zero external dependencies (REQ-NFR-01)
 */

/**
 * Noise guardrail thresholds by entity type (REQ-FR-02).
 */
export const NOISE_THRESHOLDS = Object.freeze({
  sound: { minViews: 15000, minDeltaVideos: 30 },
  hashtag: { minViews: 25000, minDeltaVideos: 100 },
  default: { minViews: 1000, minDeltaVideos: 50 }
});

/**
 * Velocity normalizer ceilings (videos/hour mapping to 100.0) (Addendum A).
 */
export const NORM_CEILINGS = Object.freeze({
  sound: 200.0,
  hashtag: 500.0,
  default: 50.0
});

/**
 * Multi-window decay weights summing to 1.0 (REQ-FR-03).
 */
export const WINDOW_WEIGHTS = Object.freeze({
  w1: 0.50,
  w6: 0.35,
  w24: 0.15
});

/**
 * Validates whether an item meets the minimum volume floor to suppress noise.
 * 
 * @param {Object} params
 * @param {string} [params.type='sound'] - Entity type ('sound' | 'hashtag')
 * @param {number} [params.totalViews=0] - Cumulative view count
 * @param {number} [params.deltaVideos=0] - New videos created in observation period
 * @returns {boolean} True if the item clears the noise guardrail
 */
export function checkNoiseGuardrail({ type = "sound", totalViews = 0, deltaVideos = 0 } = {}) {
  const threshold = NOISE_THRESHOLDS[type] || NOISE_THRESHOLDS.default;
  const views = Number(totalViews) || 0;
  const delta = Number(deltaVideos) || 0;

  if (views < threshold.minViews || delta < threshold.minDeltaVideos) {
    return false;
  }
  return true;
}

/**
 * Computes normalized velocity for a discrete time window.
 * 
 * @param {Object} params
 * @param {number} [params.deltaVideos=0] - Newly uploaded videos
 * @param {number} [params.windowHours=1] - Window duration in hours (must be > 0)
 * @param {string} [params.type='sound'] - Entity type for scaling
 * @returns {number} Normalized window velocity index [0.0..100.0]
 */
export function calculateWindowVelocity({ deltaVideos = 0, windowHours = 1.0, type = "sound" } = {}) {
  const hours = Number(windowHours) > 0 ? Number(windowHours) : 1.0;
  const delta = Math.max(0, Number(deltaVideos) || 0);
  const rawVelocity = delta / hours;

  const ceiling = NORM_CEILINGS[type] || NORM_CEILINGS.default;
  const normalized = Math.min(100.0, (rawVelocity / ceiling) * 100.0);
  return Number(normalized.toFixed(2));
}

/**
 * Computes composite Virality Velocity Score (VVS) across sliding windows (REQ-FR-03).
 * 
 * @param {Object} params
 * @param {string} [params.type='sound'] - Entity type
 * @param {number} [params.totalViews=0] - Total views for guardrail check
 * @param {number} [params.window1h=0] - Video creation delta for 1-hour window
 * @param {number} [params.window6h] - Optional video creation delta for 6-hour window
 * @param {number} [params.window24h] - Optional video creation delta for 24-hour window
 * @returns {number} Composite VVS [0.0..100.0]
 */
export function calculateMultiWindowVVS({
  type = "sound",
  totalViews = 0,
  window1h = 0,
  window6h,
  window24h
} = {}) {
  // Apply entity-differentiated noise guardrail on primary 1h window
  if (!checkNoiseGuardrail({ type, totalViews, deltaVideos: window1h })) {
    return 0.0;
  }

  const v1 = calculateWindowVelocity({ deltaVideos: window1h, windowHours: 1.0, type });

  // Handle dynamic window availability with weight normalization
  let totalWeight = WINDOW_WEIGHTS.w1;
  let weightedSum = v1 * WINDOW_WEIGHTS.w1;

  if (typeof window6h === "number" && !Number.isNaN(window6h)) {
    const v6 = calculateWindowVelocity({ deltaVideos: window6h, windowHours: 6.0, type });
    weightedSum += v6 * WINDOW_WEIGHTS.w6;
    totalWeight += WINDOW_WEIGHTS.w6;
  }

  if (typeof window24h === "number" && !Number.isNaN(window24h)) {
    const v24 = calculateWindowVelocity({ deltaVideos: window24h, windowHours: 24.0, type });
    weightedSum += v24 * WINDOW_WEIGHTS.w24;
    totalWeight += WINDOW_WEIGHTS.w24;
  }

  const compositeVVS = Math.min(100.0, Math.max(0.0, weightedSum / totalWeight));
  return Number(compositeVVS.toFixed(2));
}

/**
 * Determines trend lifecycle state according to state transition matrix (REQ-FR-04).
 * 
 * @param {Object} params
 * @param {number} [params.vvs=0] - Calculated Virality Velocity Score
 * @param {number} [params.acceleration=0] - Second derivative / rate of velocity change
 * @param {boolean} [params.passesGuardrail=true] - Guardrail pass status
 * @param {number} [params.velocity1h=0] - Raw hourly video creations
 * @returns {'NOISE' | 'EMERGING' | 'VIRAL' | 'SATURATED' | 'DECAYING'}
 */
export function determineLifecycleStatus({
  vvs = 0,
  acceleration = 0,
  passesGuardrail = true,
  velocity1h = 0
} = {}) {
  if (!passesGuardrail || vvs <= 0) {
    return "NOISE";
  }

  if (vvs >= 80.0) {
    return "VIRAL";
  }

  if (vvs >= 50.0 && acceleration > 0) {
    return "EMERGING";
  }

  if (acceleration <= 0 && vvs < 80.0 && velocity1h >= 5.0) {
    return "SATURATED";
  }

  if (velocity1h < 5.0) {
    return "DECAYING";
  }

  return "EMERGING";
}

/**
 * Backward-compatible single-window virality score calculation (Lab #1 legacy adapter).
 * 
 * @param {Object} metrics
 * @param {number} [metrics.new_videos_delta=0]
 * @param {number} [metrics.window_hours=1]
 * @param {number} [metrics.total_views=0]
 * @param {string} [metrics.type='default']
 * @returns {number} Score between 0.0 and 100.0
 */
export function calculateViralityScore(metrics = {}) {
  const newVideosDelta = metrics.new_videos_delta || 0;
  const windowHours = metrics.window_hours > 0 ? metrics.window_hours : 1.0;
  const totalViews = metrics.total_views || 0;

  // Legacy baseline volume check
  if (totalViews > 0 && totalViews < 1000 && newVideosDelta < 50) {
    return 0.0;
  }

  const velocity = Number(newVideosDelta) / Number(windowHours);
  const normalizedScore = Math.min(100.0, Math.max(0.0, velocity / 50.0));
  return Number(normalizedScore.toFixed(2));
}
