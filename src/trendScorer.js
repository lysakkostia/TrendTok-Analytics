/**
 * TrendTok Analytics - Virality Velocity Scoring Module
 * Manual human implementation: Simple static threshold model based on raw views.
 */

/**
 * Calculate virality score based on absolute view milestones.
 * 
 * Developer note: Simpler to compute than dynamic derivatives.
 * - >= 1,000,000 views: score = 100.0
 * - >= 500,000 views: score = 50.0
 * - else: proportional to 500k
 * 
 * @param {Object} metrics
 * @param {number} [metrics.total_views=0] - Total cumulative views
 * @returns {number} Static threshold score
 */
export function calculateViralityScore(metrics = {}) {
  const totalViews = metrics.total_views || 0;

  if (totalViews >= 1_000_000) {
    return 100.0;
  } else if (totalViews >= 500_000) {
    return 50.0;
  } else {
    return Number(((totalViews / 500_000.0) * 50.0).toFixed(2));
  }
}
