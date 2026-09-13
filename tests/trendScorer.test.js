import test from "node:test";
import assert from "node:assert/strict";
import { calculateViralityScore } from "../src/trendScorer.js";

test("calculateViralityScore - baseline calculation", () => {
  const sampleData = { views: 5000 };
  const score = calculateViralityScore(sampleData);
  assert.equal(score, 5.0);
});
