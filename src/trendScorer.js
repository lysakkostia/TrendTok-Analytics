/**
 * TrendTok Analytics - Virality Velocity Scoring Module
 * Implementation aligned with spec/system_concept.md Section 3.2:
 * Computes first derivative of engagement (delta new videos / hours)
 * normalized to [0..100] scale.
 */

/**
 * Calculate normalized Virality Velocity Score (VVS) based on growth rate.
 * 
 * SDD Spec Reference: spec/system_concept.md Section 3.2
 * - Metric: first derivative over sliding time window (delta videos / delta hours).
 * - Normalized range: 0.0 to 100.0.
 * 
 * @param {Object} metrics
 * @param {number} [metrics.new_videos_delta=0] - Newly uploaded videos in period
 * @param {number} [metrics.window_hours=1] - Sliding time window duration in hours
 * @returns {number} Normalized score between 0.0 and 100.0
 */
export function calculateViralityScore(metrics = {}) {
  const newVideosDelta = metrics.new_videos_delta || 0;
  const windowHours = metrics.window_hours > 0 ? metrics.window_hours : 1.0;

  // Velocity: videos created per hour
  const velocity = Number(newVideosDelta) / Number(windowHours);

  // Normalize: 5000 new videos/hour maps to 100.0 score
  const normalizedScore = Math.min(100.0, Math.max(0.0, velocity / 50.0));
  return Number(normalizedScore.toFixed(2));
}
