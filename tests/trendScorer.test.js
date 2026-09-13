import test from "node:test";
import assert from "node:assert/strict";
import { calculateViralityScore } from "../src/trendScorer.js";

test("calculateViralityScore - velocity calculation (spec Section 3.2)", () => {
  const sampleData = {
    new_videos_delta: 2500,
    window_hours: 1.0,
    total_views: 500_000,
  };
  const score = calculateViralityScore(sampleData);
  assert.equal(score, 50.0);
});

test("calculateViralityScore - micro-sample noise guardrail (GIT-GATE-01)", () => {
  const microData = {
    new_videos_delta: 10,
    window_hours: 1.0,
    total_views: 400,
  };
  const score = calculateViralityScore(microData);
  assert.equal(score, 0.0);
});
