/**
 * TrendTok Analytics — Standalone Collectors & Stop-Word Filter Test Suite
 * Validates REQ-FR-16: Evergreen Stop-List, Google Trends RSS Breakout Parser,
 * Music Chart Collector, and Decoupled Worker SQLite Persistence.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHashtag,
  isEvergreenStopTag,
  filterBreakoutHashtags,
  EVERGREEN_REMARK_NOTICE
} from "../src/collectors/stopWords.js";
import {
  parseTrafficVolume,
  extractRelatedSubTags,
  parseGoogleTrendsRss,
  collectBreakoutHashtags
} from "../src/collectors/hashtagCollector.js";
import {
  parseMusicChartJson,
  collectTrendingMusic
} from "../src/collectors/musicCollector.js";
import {
  buildCreativeCenterTriad,
  parseCreativeCenterHtml,
  collectCreativeCenterHashtags
} from "../src/collectors/creativeCenterAgent.js";
import { runCollectionCycle } from "../src/collectors/collectorWorker.js";
import { initDatabase, TrendRepository } from "../src/db.js";

test("Collectors Suite: Stop-Words, Creative Center Chrome Agent, Google Trends RSS & Music Charts (REQ-FR-16)", async (t) => {
  await t.test("stopWords: normalizes phrases and filters evergreen platform constants (#fyp, #viral, #trending)", () => {
    assert.equal(normalizeHashtag("Squid Game Season 2!"), "#squidgameseason2");
    assert.equal(normalizeHashtag("##FYP"), "#fyp");
    assert.equal(normalizeHashtag("a"), "");

    assert.equal(isEvergreenStopTag("#fyp"), true);
    assert.equal(isEvergreenStopTag("#ForYouPage"), true);
    assert.equal(isEvergreenStopTag("#viral"), true);
    assert.equal(isEvergreenStopTag("#TRENDING"), true);
    assert.equal(isEvergreenStopTag("#squidgame2"), false);
    assert.equal(isEvergreenStopTag("#gta6trailer"), false);

    const filtered = filterBreakoutHashtags([
      "#fyp",
      "#viral",
      "Squid Game 2",
      "#trending",
      "#squidgame2",
      "#ThanosEdit",
      "#foryou"
    ]);
    assert.deepEqual(filtered, ["#squidgame2", "#thanosedit"]);
    assert.ok(EVERGREEN_REMARK_NOTICE.includes("#fyp"));
  });

  await t.test("creativeCenterAgent: parses TikTok Creative Center SSR JSON and popularityCurve independently from Google Trends", async () => {
    const triad = buildCreativeCenterTriad("floresamarillas", "Food & Beverage");
    assert.equal(triad.length, 3);
    assert.equal(triad[0], "#floresamarillas");
    for (const tag of triad) {
      assert.equal(isEvergreenStopTag(tag), false);
    }

    const mockCreativeCenterHtml = `
      <script id="__MODERN_ROUTER_DATA__" type="application/json">
      {"pages":[{"data":[
        {"hashtagID":"794128","hashtagName":"floresamarillas","industryIDs":["27000000000"],"popularityCurve":[{"timestamp":"1789603200","value":7.2},{"timestamp":"1789689600","value":39.1},{"timestamp":"1789776000","value":100}],"publishCnt":"35646","rankIndex":"1","vv":"152612397"},
        {"hashtagID":"999999","hashtagName":"fyp","industryIDs":[],"popularityCurve":[{"timestamp":"1789603200","value":50},{"timestamp":"1789689600","value":100}],"publishCnt":"999999","rankIndex":"2","vv":"999999999"}
      ]}]}
      </script>
    `;

    const parsed = parseCreativeCenterHtml(mockCreativeCenterHtml, { region: "US" });
    // #fyp is automatically stripped by evergreen stop-list; #floresamarillas is kept
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].title, "#floresamarillas");
    assert.equal(parsed[0].totalVideos, 35646);
    assert.equal(parsed[0].totalViews, 152612397);
    assert.equal(parsed[0].snapshots.length, 3);
    assert.equal(parsed[0].source, "tiktok_creative_center_cdp");

    const liveAgentRes = await collectCreativeCenterHashtags({
      regions: ["US"],
      periods: [7],
      customHtmlFetcher: async () => mockCreativeCenterHtml
    });
    assert.equal(liveAgentRes.provider, "tiktok_creative_center_chrome_cdp");
    assert.ok(liveAgentRes.records.some((r) => r.title === "#floresamarillas"));
    assert.ok(liveAgentRes.records.some((r) => r.title === "#firstdayoffall"));
  });

  await t.test("hashtagCollector: parses traffic strings and extracts Google Trends RSS spikes", () => {
    assert.equal(parseTrafficVolume("500,000+"), 500000);
    assert.equal(parseTrafficVolume("2M+"), 2000000);
    assert.equal(parseTrafficVolume("50K+"), 50000);

    const sampleRss = `
      <rss version="2.0" xmlns:ht="https://trends.google.com/trending/rss">
        <channel>
          <item>
            <title>FYP</title>
            <ht:approx_traffic>1,000,000+</ht:approx_traffic>
          </item>
          <item>
            <title>Squid Game Season 2</title>
            <ht:approx_traffic>500,000+</ht:approx_traffic>
            <ht:news_item_title>Thanos Red Light Green Light Challenge</ht:news_item_title>
          </item>
          <item>
            <title>GTA 6 Trailer</title>
            <ht:approx_traffic>1,000,000+</ht:approx_traffic>
            <ht:news_item_title>Rockstar Vice City Reveal</ht:news_item_title>
          </item>
        </channel>
      </rss>
    `;

    const records = parseGoogleTrendsRss(sampleRss, "US");
    // "FYP" must be filtered out by Evergreen Stop-List!
    assert.equal(records.length, 2);
    assert.equal(records[0].title, "#squidgameseason2");
    assert.equal(records[0].type, "hashtag");
    assert.equal(records[0].snapshots.length, 6);
    assert.ok(records[0].tiktokUrl.includes("/tag/squidgameseason2"));
    assert.equal(records[0].triadTags.length, 3);
    for (const tag of records[0].triadTags) {
      assert.equal(isEvergreenStopTag(tag), false);
    }
  });

  await t.test("hashtagCollector: collectBreakoutHashtags supports custom fetch and offline fallback", async () => {
    const liveMockFetch = async () => ({
      ok: true,
      text: async () => `
        <rss><channel><item>
          <title>Dune Part Three</title>
          <ht:approx_traffic>200,000+</ht:approx_traffic>
          <ht:news_item_title>Denis Villeneuve Messiah Adaptation</ht:news_item_title>
        </item></channel></rss>
      `
    });

    const liveRes = await collectBreakoutHashtags({ geo: "UA", customFetch: liveMockFetch });
    assert.equal(liveRes.provider, "google_trends_live");
    assert.equal(liveRes.records.length, 1);
    assert.equal(liveRes.records[0].title, "#dunepartthree");

    const failFetch = async () => {
      throw new Error("Network unreachable");
    };
    const fallbackRes = await collectBreakoutHashtags({ geo: "US", customFetch: failFetch });
    assert.equal(fallbackRes.provider, "google_trends_fallback");
    assert.ok(fallbackRes.records.length >= 5);
  });

  await t.test("musicCollector: parses Apple Music / Deezer chart JSON and strips evergreen tags", async () => {
    const mockChart = {
      data: [
        { id: 901, title: "Abracadabra", artist: { name: "Lady Gaga" }, album: { title: "Mayhem" } },
        { id: 902, title: "Not Like Us", artist: { name: "Kendrick Lamar" }, album: { title: "GNX" } }
      ]
    };

    const tracks = parseMusicChartJson(mockChart);
    assert.equal(tracks.length, 2);
    assert.equal(tracks[0].type, "sound");
    assert.equal(tracks[0].title, "Abracadabra — Lady Gaga");
    assert.equal(tracks[0].hashtags.length, 3);
    for (const tag of tracks[0].hashtags) {
      assert.equal(isEvergreenStopTag(tag), false);
    }

    const fallbackMusic = await collectTrendingMusic({
      customFetch: async () => { throw new Error("Offline"); }
    });
    assert.equal(fallbackMusic.provider, "music_chart_fallback");
    assert.ok(fallbackMusic.records.length >= 6);
  });

  await t.test("collectorWorker: executes full decoupled collection cycle across all 3 modules and persists to SQLite", async () => {
    const memDb = initDatabase(":memory:");
    const repo = new TrendRepository(memDb);

    const summary = await runCollectionCycle({
      repository: repo,
      geos: ["US"],
      customFetch: async () => { throw new Error("Use deterministic fallback"); }
    });

    assert.ok(summary.musicCount >= 6);
    assert.ok(summary.creativeCenterCount >= 5);
    assert.ok(summary.googleTrendsCount >= 5);
    assert.equal(summary.hashtagCount, summary.creativeCenterCount + summary.googleTrendsCount);

    const stats = repo.getStats();
    assert.equal(stats.trendCount, summary.musicCount + summary.hashtagCount);
    assert.ok(stats.snapshotCount >= stats.trendCount * 2);
  });
});
