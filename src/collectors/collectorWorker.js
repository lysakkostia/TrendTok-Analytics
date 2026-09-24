/**
 * TrendTok Analytics — Decoupled Data Collection Worker
 * Implements REQ-FR-16: Standalone aggregation worker that executes music and
 * Google Trends hashtag collectors independently of the HTTP web server and writes
 * clean, stop-word-filtered snapshots directly into SQLite.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDatabase, TrendRepository } from "../db.js";
import { collectBreakoutHashtags } from "./hashtagCollector.js";
import { collectTrendingMusic } from "./musicCollector.js";
import { isEvergreenStopTag, filterBreakoutHashtags } from "./stopWords.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Runs a full collection cycle (Music Charts + Google Trends Breakout Hashtags)
 * and persists results to the provided TrendRepository instance.
 *
 * @param {Object} [options]
 * @param {TrendRepository} [options.repository] - Target SQLite repository
 * @param {Array<string>} [options.geos=['US', 'UA']] - Regions to query for Google Trends
 * @param {number} [options.musicLimit=25] - Max songs to collect
 * @param {Function} [options.customFetch] - Optional fetch override for testing
 * @returns {Promise<{ musicCount: number, hashtagCount: number, providers: Array<string>, records: Array<Object> }>}
 */
export async function runCollectionCycle({
  repository,
  geos = ["US", "UA"],
  musicLimit = 25,
  customFetch
} = {}) {
  const allRecords = [];
  const providers = [];

  // 1. Collect trending music
  const musicResult = await collectTrendingMusic({ limit: musicLimit, customFetch });
  providers.push(musicResult.provider);

  for (const rec of musicResult.records) {
    rec.hashtags = filterBreakoutHashtags(rec.hashtags || []);
    allRecords.push(rec);
  }

  // 2. Collect breakout hashtags across requested geos from Google Trends RSS
  let hashtagCount = 0;
  for (const geo of geos) {
    const hashResult = await collectBreakoutHashtags({ geo, customFetch });
    if (!providers.includes(hashResult.provider)) {
      providers.push(hashResult.provider);
    }
    for (const rec of hashResult.records) {
      if (isEvergreenStopTag(rec.title)) continue;
      rec.hashtags = filterBreakoutHashtags(rec.triadTags || []);
      allRecords.push(rec);
      hashtagCount++;
    }
  }

  // 3. Persist batch to SQLite if repository is provided
  if (repository && typeof repository.insertBatch === "function" && allRecords.length > 0) {
    repository.insertBatch(allRecords);
  }

  return {
    musicCount: musicResult.records.length,
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

  console.log("[CollectorWorker] Starting decoupled collection cycle (Google Trends + Music Charts)...");
  const summary = await runCollectionCycle({ repository: repo, geos: ["US", "UA", "GB"] });
  console.log(
    `[CollectorWorker] Cycle complete. Ingested ${summary.musicCount} tracks & ${summary.hashtagCount} breakout hashtags via [${summary.providers.join(", ")}].`
  );
}
