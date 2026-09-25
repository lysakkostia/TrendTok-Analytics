/**
 * TrendTok Analytics — Decoupled Data Collection Worker
 * Implements REQ-FR-16: Standalone aggregation worker that executes three
 * independent collector modules:
 *   1. Music Charts Collector (`musicCollector.js`)
 *   2. TikTok Creative Center Headless Chrome CDP Agent (`creativeCenterAgent.js`)
 *   3. Google Trends Breakout RSS Collector (`hashtagCollector.js`)
 * Writes clean, stop-word-filtered snapshots directly into SQLite.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDatabase, TrendRepository } from "../db.js";
import { collectBreakoutHashtags } from "./hashtagCollector.js";
import { collectCreativeCenterHashtags } from "./creativeCenterAgent.js";
import { collectTrendingMusic } from "./musicCollector.js";
import { isEvergreenStopTag, filterBreakoutHashtags } from "./stopWords.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Runs a full collection cycle across all three independent collector modules
 * (Music Charts + TikTok Creative Center Chrome Agent + Google Trends RSS)
 * and persists results to the provided TrendRepository instance.
 *
 * @param {Object} [options]
 * @param {TrendRepository} [options.repository] - Target SQLite repository
 * @param {Array<string>} [options.geos=['US', 'UA']] - Regions to query for Google Trends
 * @param {Array<string>} [options.creativeCenterRegions=['US', 'GB']] - Regions for TikTok Creative Center
 * @param {number} [options.musicLimit=25] - Max songs to collect
 * @param {Function} [options.customFetch] - Optional fetch override for testing
 * @param {Function} [options.customHtmlFetcher] - Optional Chrome HTML fetcher override for testing
 * @returns {Promise<{ musicCount: number, creativeCenterCount: number, googleTrendsCount: number, hashtagCount: number, providers: Array<string>, records: Array<Object> }>}
 */
export async function runCollectionCycle({
  repository,
  geos = ["US", "UA"],
  creativeCenterRegions = ["US"],
  musicLimit = 25,
  customFetch,
  customHtmlFetcher
} = {}) {
  const allRecords = [];
  const providers = [];
  const seenTitles = new Set();

  // 1. Collect trending music (Music Collector Module)
  const musicResult = await collectTrendingMusic({ limit: musicLimit, customFetch });
  providers.push(musicResult.provider);

  for (const rec of musicResult.records) {
    rec.hashtags = filterBreakoutHashtags(rec.hashtags || []);
    seenTitles.add(rec.title.toLowerCase());
    allRecords.push(rec);
  }

  // 2. Collect TikTok Creative Center hashtags (Standalone Headless Chrome CDP Agent Module)
  // If customFetch is injected for unit tests without customHtmlFetcher, skip spawning real Chrome
  const effectiveHtmlFetcher =
    customHtmlFetcher || (customFetch ? async () => "" : undefined);
  const ccResult = await collectCreativeCenterHashtags({
    regions: creativeCenterRegions,
    periods: [7, 30],
    customHtmlFetcher: effectiveHtmlFetcher
  });
  if (!providers.includes(ccResult.provider)) {
    providers.push(ccResult.provider);
  }

  let creativeCenterCount = 0;
  for (const rec of ccResult.records) {
    if (isEvergreenStopTag(rec.title)) continue;
    const key = rec.title.toLowerCase();
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    rec.hashtags = filterBreakoutHashtags(rec.triadTags || rec.hashtags || []);
    allRecords.push(rec);
    creativeCenterCount++;
  }

  // 3. Collect breakout hashtags across requested geos (Google Trends RSS Collector Module)
  let googleTrendsCount = 0;
  for (const geo of geos) {
    const hashResult = await collectBreakoutHashtags({ geo, customFetch });
    if (!providers.includes(hashResult.provider)) {
      providers.push(hashResult.provider);
    }
    for (const rec of hashResult.records) {
      if (isEvergreenStopTag(rec.title)) continue;
      const key = rec.title.toLowerCase();
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);
      rec.hashtags = filterBreakoutHashtags(rec.triadTags || []);
      allRecords.push(rec);
      googleTrendsCount++;
    }
  }

  const hashtagCount = creativeCenterCount + googleTrendsCount;

  // 4. Persist batch to SQLite if repository is provided
  if (repository && typeof repository.insertBatch === "function" && allRecords.length > 0) {
    repository.insertBatch(allRecords);
  }

  return {
    musicCount: musicResult.records.length,
    creativeCenterCount,
    googleTrendsCount,
    hashtagCount,
    providers,
    records: allRecords
  };
}

// Allow running directly as a standalone background job: `node src/collectors/collectorWorker.js`
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "..", "data", "trendtok.db");
  const db = initDatabase(dbPath);
  const repo = new TrendRepository(db);

  console.log("[CollectorWorker] Starting decoupled collection cycle (TikTok Creative Center CDP + Google Trends + Music Charts)...");
  const summary = await runCollectionCycle({
    repository: repo,
    geos: ["US", "UA"],
    creativeCenterRegions: ["US"]
  });
  console.log(
    `[CollectorWorker] Cycle complete. Ingested ${summary.musicCount} tracks, ${summary.creativeCenterCount} Creative Center hashtags & ${summary.googleTrendsCount} Google Trends hashtags via [${summary.providers.join(", ")}].`
  );
}
