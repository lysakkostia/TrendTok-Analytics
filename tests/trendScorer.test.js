import test from "node:test";
import assert from "node:assert/strict";
import { calculateViralityScore } from "../src/trendScorer.js";

test("calculateViralityScore - human threshold calculation", () => {
  const sampleData = { total_views: 1_000_000 };
  const score = calculateViralityScore(sampleData);
  assert.equal(score, 100.0);
});
