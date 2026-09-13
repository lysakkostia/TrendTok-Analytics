import test from "node:test";
import assert from "node:assert/strict";
import { calculateViralityScore } from "../src/trendScorer.js";

test("calculateViralityScore - velocity calculation (spec Section 3.2)", () => {
  const sampleData = {
    new_videos_delta: 2500,
    window_hours: 1.0,
  };
  const score = calculateViralityScore(sampleData);
  // 2500 / 50 = 50.0
  assert.equal(score, 50.0);
});
