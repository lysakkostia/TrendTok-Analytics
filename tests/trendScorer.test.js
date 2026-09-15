import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateViralityScore,
  checkNoiseGuardrail,
  calculateWindowVelocity,
  calculateMultiWindowVVS,
  determineLifecycleStatus,
  NOISE_THRESHOLDS
} from "../src/trendScorer.js";

// ==========================================
// 1. Legacy Compatibility Tests (Lab #1 Baseline)
// ==========================================
test("Legacy calculateViralityScore: computes basic velocity correctly", () => {
  const score = calculateViralityScore({
    new_videos_delta: 2500,
    window_hours: 1.0,
    total_views: 500_000
  });
  assert.equal(score, 50.0);
});

test("Legacy calculateViralityScore: suppresses micro-sample noise (GIT-GATE-01)", () => {
  const score = calculateViralityScore({
    new_videos_delta: 10,
    window_hours: 1.0,
    total_views: 400
  });
  assert.equal(score, 0.0);
});

// ==========================================
// 2. Differentiated Noise Guardrail Tests (REQ-FR-02)
// ==========================================
test("checkNoiseGuardrail: validates sound threshold boundaries (15k views, 30 delta)", () => {
  // Fails views
  assert.equal(checkNoiseGuardrail({ type: "sound", totalViews: 14_999, deltaVideos: 50 }), false);
  // Fails delta
  assert.equal(checkNoiseGuardrail({ type: "sound", totalViews: 20_000, deltaVideos: 29 }), false);
  // Passes exactly at boundary
  assert.equal(checkNoiseGuardrail({ type: "sound", totalViews: 15_000, deltaVideos: 30 }), true);
  // Passes comfortably
  assert.equal(checkNoiseGuardrail({ type: "sound", totalViews: 50_000, deltaVideos: 120 }), true);
});

test("checkNoiseGuardrail: validates hashtag threshold boundaries (25k views, 100 delta)", () => {
  // Fails views
  assert.equal(checkNoiseGuardrail({ type: "hashtag", totalViews: 24_500, deltaVideos: 200 }), false);
  // Fails delta
  assert.equal(checkNoiseGuardrail({ type: "hashtag", totalViews: 30_000, deltaVideos: 99 }), false);
  // Passes boundary
  assert.equal(checkNoiseGuardrail({ type: "hashtag", totalViews: 25_000, deltaVideos: 100 }), true);
  // Passes comfortably
  assert.equal(checkNoiseGuardrail({ type: "hashtag", totalViews: 100_000, deltaVideos: 350 }), true);
});

// ==========================================
// 3. Multi-Window VVS Calculus (REQ-FR-03 & Addendum A)
// ==========================================
test("calculateWindowVelocity: scales velocity accurately against normalizer ceiling", () => {
  // Sound ceiling = 200 videos/hr
  const vSound = calculateWindowVelocity({ deltaVideos: 100, windowHours: 1.0, type: "sound" });
  assert.equal(vSound, 50.0);

  // Hashtag ceiling = 500 videos/hr
  const vHash = calculateWindowVelocity({ deltaVideos: 250, windowHours: 1.0, type: "hashtag" });
  assert.equal(vHash, 50.0);

  // Ceiling clamp
  const vClamped = calculateWindowVelocity({ deltaVideos: 1000, windowHours: 1.0, type: "sound" });
  assert.equal(vClamped, 100.0);
});

test("calculateMultiWindowVVS: computes weighted multi-tier score (1h, 6h, 24h)", () => {
  // Sound:
  // 1h delta = 100 -> v1 = 50.0 (weight 0.50 -> 25.0)
  // 6h delta = 600 -> v6 = (600/6)/200 * 100 = 50.0 (weight 0.35 -> 17.5)
  // 24h delta = 2400 -> v24 = (2400/24)/200 * 100 = 50.0 (weight 0.15 -> 7.5)
  // Expected VVS = 25.0 + 17.5 + 7.5 = 50.0
  const score = calculateMultiWindowVVS({
    type: "sound",
    totalViews: 30_000,
    window1h: 100,
    window6h: 600,
    window24h: 2400
  });
  assert.equal(score, 50.0);
});

test("calculateMultiWindowVVS: gracefully normalizes weights when 6h/24h are unavailable", () => {
  // Only 1h available: weight should dynamically re-normalize to 1.0
  // delta = 160 -> (160 / 200) * 100 = 80.0
  const score = calculateMultiWindowVVS({
    type: "sound",
    totalViews: 20_000,
    window1h: 160
  });
  assert.equal(score, 80.0);
});

// ==========================================
// 4. BDD Acceptance Scenarios (Addendum C)
// ==========================================
test("BDD-01: Sound enters EMERGING status upon rapid adoption", () => {
  const totalViews = 35_000;
  const delta1h = 120; // 120/200 * 100 = 60.0
  const passesGuardrail = checkNoiseGuardrail({ type: "sound", totalViews, deltaVideos: delta1h });
  assert.equal(passesGuardrail, true);

  const vvs = calculateMultiWindowVVS({ type: "sound", totalViews, window1h: delta1h });
  assert.equal(vvs, 60.0);

  const status = determineLifecycleStatus({
    vvs,
    acceleration: 15.0, // positive acceleration
    passesGuardrail,
    velocity1h: delta1h
  });
  assert.equal(status, "EMERGING");
});

test("BDD-02: Hashtag noise floor suppression (NOISE)", () => {
  const totalViews = 12_000; // below 25k required
  const delta1h = 60;
  const passesGuardrail = checkNoiseGuardrail({ type: "hashtag", totalViews, deltaVideos: delta1h });
  assert.equal(passesGuardrail, false);

  const vvs = calculateMultiWindowVVS({ type: "hashtag", totalViews, window1h: delta1h });
  assert.equal(vvs, 0.0);

  const status = determineLifecycleStatus({
    vvs,
    acceleration: 5.0,
    passesGuardrail,
    velocity1h: delta1h
  });
  assert.equal(status, "NOISE");
});

test("BDD-03: Viral saturation transition upon deceleration (SATURATED)", () => {
  const vvs = 75.0;
  const acceleration = -10.0; // decelerating
  const status = determineLifecycleStatus({
    vvs,
    acceleration,
    passesGuardrail: true,
    velocity1h: 50.0
  });
  assert.equal(status, "SATURATED");
});

// ==========================================
// 5. Robustness & NFR Benchmark (REQ-NFR-01, REQ-NFR-03)
// ==========================================
test("Robustness: handles negative values, NaN, and zero division gracefully", () => {
  assert.equal(checkNoiseGuardrail({ type: "sound", totalViews: -50, deltaVideos: -10 }), false);
  assert.equal(calculateWindowVelocity({ deltaVideos: -100, windowHours: 0, type: "sound" }), 0.0);
  assert.equal(calculateMultiWindowVVS({ type: "sound", totalViews: NaN, window1h: NaN }), 0.0);
});

test("Performance Benchmark (REQ-NFR-01): VVS calculus executes in under 0.5ms", () => {
  const iterations = 1000;
  const startTime = performance.now();
  for (let i = 0; i < iterations; i++) {
    calculateMultiWindowVVS({
      type: "sound",
      totalViews: 40_000 + i,
      window1h: 120 + (i % 50),
      window6h: 600,
      window24h: 2000
    });
  }
  const totalElapsedMs = performance.now() - startTime;
  const avgMsPerCall = totalElapsedMs / iterations;
  assert.ok(avgMsPerCall < 0.5, `Expected < 0.5ms per call, got ${avgMsPerCall}ms`);
});
