/**
 * Test Suite: Native SQLite Persistence & High-Scale Corpus (REQ-FR-12, REQ-FR-13, REQ-FR-14)
 * 
 * Verifies embedded SQLite repository, multi-window deltas, 7-day retention,
 * direct TikTok deep-links, and 1,000+ record generation.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { initDatabase, TrendRepository } from "../src/db.js";
import { generateHighScaleCorpus } from "../src/ingestionClient.js";

test("SQLite Repository Suite: High-Scale Persistence & Multi-Window Granularity", async (t) => {
  let db;
  let repo;

  t.beforeEach(() => {
    db = initDatabase(":memory:");
    repo = new TrendRepository(db);
  });

  t.afterEach(() => {
    db.close();
  });

  await t.test("Initializes database schema with tables and indexes", () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    assert.ok(tables.includes("trends"), "Table 'trends' must exist");
    assert.ok(tables.includes("snapshots"), "Table 'snapshots' must exist");
    assert.ok(tables.includes("correlations"), "Table 'correlations' must exist");
  });

  await t.test("Upserts trend and records chronological snapshots", () => {
    repo.upsertTrend({
      id: "sound_test_01",
      type: "sound",
      title: "Neon Echoes",
      author: "@synth_master",
      external_url: "https://www.tiktok.com/music/-7123456789"
    });

    const now = Date.now();
    repo.insertSnapshot({
      trend_id: "sound_test_01",
      timestamp: new Date(now - 3600000).toISOString(),
      total_views: 50000,
      total_videos: 100
    });

    repo.insertSnapshot({
      trend_id: "sound_test_01",
      timestamp: new Date(now).toISOString(),
      total_views: 75000,
      total_videos: 180
    });

    const snapshots = repo.getSnapshots("sound_test_01");
    assert.equal(snapshots.length, 2);
    assert.equal(snapshots[1].totalVideos, 180);

    const detail = repo.getTrendDetail("sound_test_01");
    assert.ok(detail, "Detail object must exist");
    assert.equal(detail.title, "Neon Echoes");
    assert.equal(detail.hourlyVelocity, 80); // 180 - 100
    assert.equal(detail.tiktokUrl, "https://www.tiktok.com/music/-7123456789");
  });

  await t.test("Atomically ingests 1,000+ records via insertBatch (REQ-FR-13)", () => {
    const corpus = generateHighScaleCorpus(1000);
    assert.equal(corpus.length, 1000);

    const start = performance.now();
    const count = repo.insertBatch(corpus);
    const duration = performance.now() - start;

    assert.equal(count, 1000);
    assert.ok(duration < 2000, `Batch insertion should take < 2000ms (took ${duration.toFixed(1)}ms)`);

    const stats = repo.getStats();
    assert.equal(stats.trendCount, 1000);
    assert.ok(stats.snapshotCount >= 1000);
  });

  await t.test("Generates direct canonical TikTok deep-links (REQ-FR-14)", () => {
    const corpus = generateHighScaleCorpus(50);
    const soundItem = corpus.find(c => c.type === "sound");
    const hashtagItem = corpus.find(c => c.type === "hashtag");

    assert.ok(soundItem.tiktokUrl.startsWith("https://www.tiktok.com/search?q=") || soundItem.tiktokUrl.startsWith("https://www.tiktok.com/music/"));
    assert.ok(hashtagItem.tiktokUrl.startsWith("https://www.tiktok.com/search?q=%23") || hashtagItem.tiktokUrl.startsWith("https://www.tiktok.com/tag/"));
  });

  await t.test("Enforces monotonicity on subsequent snapshots for same trend", () => {
    repo.upsertTrend({ id: "sound_mono_test", type: "sound", title: "Monotonic Test" });
    
    // Initial high snapshot
    repo.insertSnapshot({
      trend_id: "sound_mono_test",
      timestamp: "2026-09-24T10:00:00.000Z",
      total_views: 500000,
      total_videos: 1200
    });

    // Attempted lower snapshot at later time
    repo.insertSnapshot({
      trend_id: "sound_mono_test",
      timestamp: "2026-09-24T11:00:00.000Z",
      total_views: 1500, // lower view count attempted!
      total_videos: 10   // lower video count attempted!
    });

    const sn = repo.getSnapshots("sound_mono_test");
    assert.equal(sn.length, 2);
    assert.ok(sn[1].totalViews >= sn[0].totalViews, "Later snapshot totalViews must be >= previous snapshot");
    assert.ok(sn[1].totalVideos >= sn[0].totalVideos, "Later snapshot totalVideos must be >= previous snapshot");
  });

  await t.test("Resets database cleanly via clearAll()", () => {
    repo.upsertTrend({ id: "sound_reset_test", type: "sound", title: "Reset Sound" });
    repo.insertSnapshot({ trend_id: "sound_reset_test", total_views: 1000, total_videos: 10 });
    assert.equal(repo.getStats().trendCount, 1);

    repo.clearAll();
    const stats = repo.getStats();
    assert.equal(stats.trendCount, 0);
    assert.equal(stats.snapshotCount, 0);
  });

  await t.test("Supports paginated queries and category metric filtering (REQ-FR-15)", () => {
    const corpus = generateHighScaleCorpus(500);
    repo.insertBatch(corpus);

    // Page 1 with limit 25
    const p1 = repo.queryTrendsPaged({ limit: 25, offset: 0 });
    assert.equal(p1.items.length, 25);
    assert.equal(p1.page, 1);
    assert.equal(p1.totalPages, 20); // 500 / 25
    assert.ok(p1.items[0].vvs > 0, "Top item must have non-zero VVS");

    // Page 2 with limit 50
    const p2 = repo.queryTrendsPaged({ limit: 50, offset: 50 });
    assert.equal(p2.items.length, 50);
    assert.equal(p2.page, 2);

    // Filter by Category
    const viral = repo.queryTrendsPaged({ limit: 100, category: "viral24h" });
    assert.ok(viral.items.length > 0, "Must contain viral items");
    for (const item of viral.items) {
      assert.equal(item.status, "VIRAL");
      assert.ok(item.vvs >= 80.0, "Viral items must have VVS >= 80");
    }

    const noise = repo.queryTrendsPaged({ limit: 100, category: "noise" });
    assert.ok(noise.items.length > 0, "Must contain noise items");
    for (const item of noise.items) {
      assert.equal(item.status, "NOISE");
    }

    // Multi-column sorting (REQ-FR-15)
    const byVelDesc = repo.queryTrendsPaged({ limit: 10, sortBy: "velocity", sortOrder: "desc" });
    assert.ok(byVelDesc.items[0].hourlyVelocity >= byVelDesc.items[1].hourlyVelocity);

    const byVelAsc = repo.queryTrendsPaged({ limit: 10, sortBy: "velocity", sortOrder: "asc" });
    assert.ok(byVelAsc.items[0].hourlyVelocity <= byVelAsc.items[1].hourlyVelocity);

    const byTitleAsc = repo.queryTrendsPaged({ limit: 10, sortBy: "title", sortOrder: "asc" });
    assert.ok(byTitleAsc.items[0].title.localeCompare(byTitleAsc.items[1].title) <= 0);
  });

  await t.test("Prunes snapshots older than 7 days (REQ-FR-12)", () => {
    repo.upsertTrend({
      id: "sound_old",
      type: "sound",
      title: "Antique Track"
    });

    // Old snapshot from 10 days ago
    const tenDaysAgo = new Date(Date.now() - 10 * 86400 * 1000).toISOString();
    repo.insertSnapshot({
      trend_id: "sound_old",
      timestamp: tenDaysAgo,
      total_views: 10000,
      total_videos: 20
    });

    // Recent snapshot from 1 hour ago
    const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
    repo.insertSnapshot({
      trend_id: "sound_old",
      timestamp: oneHourAgo,
      total_views: 20000,
      total_videos: 50
    });

    assert.equal(repo.getSnapshots("sound_old").length, 2);

    // Prune retention > 7 days
    repo.pruneSnapshots(7);

    const remaining = repo.getSnapshots("sound_old");
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].timestamp, oneHourAgo);
  });
});
