/**
 * TrendTok Analytics - Virality Velocity Scoring Module
 * 
 * Resolved via GIT-GATE Decision (SDD Baseline).
 * Reference: spec/system_concept.md Section 3.2.
 * Computes first derivative of engagement (delta new videos / hours)
 * normalized to [0..100] scale, with baseline volume guardrail.
 */

/**
 * Calculate normalized Virality Velocity Score (VVS) based on growth rate.
 * 
 * SDD Spec Reference: spec/system_concept.md Section 3.2
 * - Primary metric: first derivative over sliding time window (delta videos / delta hours).
 * - Normalized range: 0.0 to 100.0.
 * - Baseline volume guard: Requires minimum volume to prevent noise on micro-samples.
 * 
 * @param {Object} metrics
 * @param {number} [metrics.new_videos_delta=0] - Newly uploaded videos in period
 * @param {number} [metrics.window_hours=1] - Sliding time window duration in hours
 * @param {number} [metrics.total_views=0] - Total cumulative views for baseline validation
 * @returns {number} Normalized virality score between 0.0 and 100.0
 */
export function calculateViralityScore(metrics = {}) {
  const newVideosDelta = metrics.new_videos_delta || 0;
  const windowHours = metrics.window_hours > 0 ? metrics.window_hours : 1.0;
  const totalViews = metrics.total_views || 0;

  // Baseline volume guard (identified during human-agent conflict analysis):
  // Items with negligible presence (< 1000 views and < 50 new videos)
  // should not produce artificially inflated velocity scores.
  if (totalViews > 0 && totalViews < 1000 && newVideosDelta < 50) {
    return 0.0;
  }

  // Velocity calculation (new videos created per hour)
  const velocity = Number(newVideosDelta) / Number(windowHours);

  // Normalize: 5000 new videos/hour maps to 100.0 score
  const normalizedScore = Math.min(100.0, Math.max(0.0, velocity / 50.0));
  return Number(normalizedScore.toFixed(2));
}
