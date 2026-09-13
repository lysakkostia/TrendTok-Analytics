---
name: trend-scorer-validation
description: >-
  Use this skill when running tests, benchmarking, or validating virality velocity scoring
  algorithms and trend data pipelines in TrendTok Analytics.
---

# Trend Scorer Validation Skill

This skill guides the agent in running verification tests, checking edge-case resilience, and ensuring accuracy of virality score computations.

---

## 1. Execution Commands

To execute tests for the trend scoring engine:

```bash
# Run all tests using Node.js native test runner
node --test tests/**/*.test.js

# Run specific trend scorer tests
node --test tests/trendScorer.test.js
```

---

## 2. Validation Checklist

When modifying or verifying `src/trendScorer.js`:

1. **Velocity First Derivative**:
   * Verify that velocity is computed as:
     $$\text{velocity} = \frac{\Delta\text{new\_videos}}{\Delta\text{window\_hours}}$$
   * Verify that default `window_hours` is guarded against non-positive values (`window_hours <= 0` defaults to 1.0).

2. **Normalization Boundaries**:
   * The returned score must always lie within $[0.0, 100.0]$.
   * Scores must be rounded to two decimal places.

3. **Micro-Sample Noise Suppression (GIT-GATE-01 Guard)**:
   * Trends with `total_views < 1000` and `new_videos_delta < 50` must return `0.0` to avoid false positives on low-volume data.

4. **Pure Function Contract**:
   * `calculateViralityScore()` must not mutate the input metrics object.
