/**
 * TrendTok Analytics — Dual Forecasting, Evolutionary Tuner & 1-2-3 Triad Test Suite
 * Validates REQ-FR-17 & REQ-FR-18:
 * - Damped Logistic Diffusion for Music (`soundForecaster.js`)
 * - Impulse-Response Holt Model for Breakout Hashtags (`hashtagForecaster.js`)
 * - Evolutionary Genetic Hyperparameter Optimization (`evolutionaryTuner.js`)
 * - Non-Evergreen 1-2-3 Hashtag Triad Recommender (`triadRecommender.js`)
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  forecastSoundTrajectory,
  backtestSoundForecast
} from "../src/analytics/soundForecaster.js";
import {
  forecastHashtagSpike,
  backtestHashtagForecast
} from "../src/analytics/hashtagForecaster.js";
import {
  evolveForecasterWeights,
  evaluateChromosomeFitness
} from "../src/analytics/evolutionaryTuner.js";
import { recommendHashtagTriad } from "../src/analytics/triadRecommender.js";
import { isEvergreenStopTag } from "../src/collectors/stopWords.js";

const SAMPLE_SOUND_SNAPSHOTS = [
  { timestamp: "2026-09-24T10:00:00.000Z", totalViews: 18000, totalVideos: 100 },
  { timestamp: "2026-09-24T11:00:00.000Z", totalViews: 28000, totalVideos: 155 },
  { timestamp: "2026-09-24T12:00:00.000Z", totalViews: 44000, totalVideos: 230 },
  { timestamp: "2026-09-24T13:00:00.000Z", totalViews: 68000, totalVideos: 330 },
  { timestamp: "2026-09-24T14:00:00.000Z", totalViews: 102000, totalVideos: 455 },
  { timestamp: "2026-09-24T15:00:00.000Z", totalViews: 148000, totalVideos: 605 }
];

const SAMPLE_HASHTAG_SNAPSHOTS = [
  { timestamp: "2026-09-24T10:00:00.000Z", totalViews: 40000, totalVideos: 180 },
  { timestamp: "2026-09-24T11:00:00.000Z", totalViews: 95000, totalVideos: 410 },
  { timestamp: "2026-09-24T12:00:00.000Z", totalViews: 185000, totalVideos: 740 },
  { timestamp: "2026-09-24T13:00:00.000Z", totalViews: 310000, totalVideos: 1150 },
  { timestamp: "2026-09-24T14:00:00.000Z", totalViews: 450000, totalVideos: 1610 },
  { timestamp: "2026-09-24T15:00:00.000Z", totalViews: 590000, totalVideos: 2090 }
];

test("Forecasting, Backtesting & Evolutionary Optimization Suite (REQ-FR-17, REQ-FR-18)", async (t) => {
  await t.test("soundForecaster: computes damped logistic S-curve projections and backtest MAPE", () => {
    const fc = forecastSoundTrajectory(SAMPLE_SOUND_SNAPSHOTS);
    assert.equal(fc.modelType, "damped_logistic_sound");
    assert.equal(fc.currentVideos, 605);
    assert.equal(fc.velocity1h, 150);
    assert.ok(fc.predictedVideos6h > fc.currentVideos);
    assert.ok(fc.predictedVideos24h >= fc.predictedVideos6h);
    assert.ok(fc.carryingCapacityK >= fc.predictedVideos24h);
    assert.ok(fc.breakoutProbability > 0.5);

    const bt = backtestSoundForecast(SAMPLE_SOUND_SNAPSHOTS, 2);
    assert.equal(bt.actualVideos, 605);
    assert.ok(bt.predictedVideos > 330);
    assert.ok(bt.mape >= 0 && bt.mape < 50);
    assert.ok(bt.accuracyPercent > 50);
  });

  await t.test("hashtagForecaster: computes Holt impulse-response projections and decay half-life", () => {
    const fc = forecastHashtagSpike(SAMPLE_HASHTAG_SNAPSHOTS);
    assert.equal(fc.modelType, "impulse_holt_hashtag");
    assert.equal(fc.currentVideos, 2090);
    assert.equal(fc.velocity1h, 480);
    assert.ok(fc.predictedVideos6h > fc.currentVideos);
    assert.ok(fc.predictedVideos24h >= fc.predictedVideos6h);
    assert.ok(fc.spikeIntensityIndex > 80);
    assert.ok(fc.decayHalfLifeHours >= 2.0);

    const bt = backtestHashtagForecast(SAMPLE_HASHTAG_SNAPSHOTS, 2);
    assert.equal(bt.actualVideos, 2090);
    assert.ok(bt.predictedVideos > 1150);
    assert.ok(bt.accuracyPercent > 70);
  });

  await t.test("evolutionaryTuner: evolves optimal chromosomes separately for sound and hashtag models", () => {
    const soundEvo = evolveForecasterWeights({
      entityType: "sound",
      historicalSeriesList: [SAMPLE_SOUND_SNAPSHOTS],
      populationSize: 16,
      generations: 12,
      seed: 101
    });

    assert.equal(soundEvo.entityType, "sound");
    assert.ok(soundEvo.bestFitness >= soundEvo.baselineFitness);
    assert.ok(soundEvo.optimizedMape <= soundEvo.baselineMape);
    assert.equal(soundEvo.generationsRun, 12);
    assert.equal(soundEvo.convergenceHistory.length, 12);

    // Verify normalized window weights sum to ~1.0
    const weightSum = soundEvo.bestChromosome.w1 + soundEvo.bestChromosome.w6 + soundEvo.bestChromosome.w24;
    assert.ok(Math.abs(weightSum - 1.0) < 0.01);

    const hashEvo = evolveForecasterWeights({
      entityType: "hashtag",
      historicalSeriesList: [SAMPLE_HASHTAG_SNAPSHOTS],
      populationSize: 16,
      generations: 12,
      seed: 202
    });

    assert.equal(hashEvo.entityType, "hashtag");
    assert.ok(hashEvo.bestFitness >= hashEvo.baselineFitness);
    assert.ok(hashEvo.optimizedMape <= hashEvo.baselineMape);
  });

  await t.test("triadRecommender: generates 1-2-3 breakout hashtag triad strictly free of evergreen tags", () => {
    const rec = recommendHashtagTriad({
      item: {
        id: "sound_squid_phonk",
        type: "sound",
        title: "Mingle Game Song (Phonk Flip) — Squid Game 2",
        vvs: 84.5
      },
      correlatedTags: ["#fyp", "#viral", "#squidgame2", "#trending", "#thanosedit", "#foryou"],
      breakoutTags: ["#minglegame", "#redlightgreenlight"]
    });

    assert.equal(rec.triad.length, 3);
    // Ensure zero evergreen stop tags in triad
    for (const tag of rec.triad) {
      assert.equal(isEvergreenStopTag(tag), false, `Tag ${tag} must not be an evergreen stop tag`);
    }
    assert.equal(rec.slots.primaryBreakout, "#squidgame2");
    assert.equal(rec.slots.nicheContext, "#thanosedit");
    assert.ok(rec.synergyScore >= 70);
  });
});
