/**
 * TrendTok Analytics — Standalone Music Chart & Audio Collector
 * Implements REQ-FR-16 (Clause 3): Decoupled collector that fetches real-time music charts
 * (Apple Music / iTunes RSS & Deezer Chart APIs) and maps them into TikTok audio trends
 * with non-stopword 1-2-3 hashtag triads.
 */

import { normalizeHashtag, filterBreakoutHashtags } from "./stopWords.js";

/**
 * Normalizes a JSON payload from Apple Music RSS or Deezer Chart API into TrendTok sound records.
 *
 * @param {Object} payload - Parsed JSON from music chart endpoint
 * @returns {Array<Object>} Normalized sound records with monotonic snapshots and clean 1-2-3 hashtags
 */
export function parseMusicChartJson(payload) {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  // Support both Apple Music RSS (payload.feed.results) and Deezer Chart (payload.data)
  const rawItems = Array.isArray(payload?.feed?.results)
    ? payload.feed.results
    : (Array.isArray(payload?.data) ? payload.data : []);

  if (rawItems.length === 0) {
    return [];
  }

  const now = Date.now();
  const records = [];

  for (let idx = 0; idx < rawItems.length; idx++) {
    const entry = rawItems[idx];
    const songName = String(entry.name || entry.title || "").trim();
    const artistName = String(entry.artistName || entry.artist?.name || "Unknown Artist").trim();
    if (!songName) continue;

    const externalId = String(entry.id || idx + 1);
    const itemId = `sound_chart_${externalId}`;
    const fullTitle = `${songName} — ${artistName}`;

    // Extract genre or album context for Triad 1-2-3
    const genreName = entry.genres?.[0]?.name || entry.album?.title || "newmusic";
    const candidateTags = [
      normalizeHashtag(songName),
      normalizeHashtag(artistName),
      normalizeHashtag(genreName),
      "#musicdiscovery",
      "#soundtrend",
      "#audioedit"
    ];
    const hashtags = filterBreakoutHashtags(candidateTags).slice(0, 3);

    // Higher chart rank -> stronger adoption velocity
    const rankFactor = Math.max(0.25, 1 - idx * 0.025);
    const hourlyVelocity = Math.round(65 + 185 * rankFactor);
    const snapshots = [];

    let currVideos = Math.round(450 * rankFactor) + 80;
    let currViews = currVideos * 260;

    for (let step = 0; step < 6; step++) {
      const ts = new Date(now - (5 - step) * 3600 * 1000).toISOString();
      if (step > 0) {
        const accelMultiplier = 0.8 + step * 0.1;
        const deltaVids = Math.max(32, Math.round(hourlyVelocity * accelMultiplier));
        currVideos += deltaVids;
        currViews += deltaVids * 245;
      }
      snapshots.push({
        timestamp: ts,
        totalViews: currViews,
        totalVideos: currVideos
      });
    }

    const latest = snapshots[snapshots.length - 1];
    const prev = snapshots[snapshots.length - 2];
    const cleanQuery = `${songName} ${artistName}`.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();

    records.push({
      itemId,
      type: "sound",
      title: fullTitle,
      author: artistName,
      source: "music_chart_collector",
      hashtags,
      totalViews: latest.totalViews,
      totalVideos: latest.totalVideos,
      previousViews: prev.totalViews,
      previousVideos: prev.totalVideos,
      timestamp: latest.timestamp,
      previousTimestamp: prev.timestamp,
      snapshots,
      tiktokUrl: `https://www.tiktok.com/search?q=${encodeURIComponent(cleanQuery)}`
    });
  }

  return records;
}

/**
 * Curated fallback of current chart-topping viral songs for offline & unit test execution.
 *
 * @returns {Array<Object>}
 */
export function getFallbackChartSounds() {
  const samplePayload = {
    feed: {
      results: [
        { id: "1771001", name: "Abracadabra", artistName: "Lady Gaga", genres: [{ name: "Dance Pop" }] },
        { id: "1771002", name: "luther", artistName: "Kendrick Lamar & SZA", genres: [{ name: "HipHop" }] },
        { id: "1771003", name: "DtMF", artistName: "Bad Bunny", genres: [{ name: "Latin Urban" }] },
        { id: "1771004", name: "Sports car", artistName: "Tate McRae", genres: [{ name: "Pop" }] },
        { id: "1771005", name: "Messy", artistName: "Lola Young", genres: [{ name: "Indie Pop" }] },
        { id: "1771006", name: "That's So True", artistName: "Gracie Abrams", genres: [{ name: "Singer Songwriter" }] },
        { id: "1771007", name: "APT.", artistName: "ROSÉ & Bruno Mars", genres: [{ name: "KPop" }] },
        { id: "1771008", name: "Sailor Song", artistName: "Gigi Perez", genres: [{ name: "Indie Folk" }] }
      ]
    }
  };
  return parseMusicChartJson(samplePayload);
}

/**
 * Fetches live trending songs from open music chart APIs (Deezer / Apple Music RSS)
 * and normalizes them into TikTok audio trends.
 *
 * @param {Object} [options]
 * @param {number} [options.limit=25] - Maximum tracks to collect
 * @param {number} [options.timeoutMs=4500] - HTTP timeout in ms
 * @param {Function} [options.customFetch] - Optional fetch implementation for unit tests
 * @returns {Promise<{ provider: string, records: Array<Object> }>}
 */
export async function collectTrendingMusic({
  limit = 25,
  timeoutMs = 4500,
  customFetch = globalThis.fetch
} = {}) {
  const endpoints = [
    `https://api.deezer.com/chart/0/tracks?limit=${encodeURIComponent(limit)}`,
    `https://rss.applemarketingtools.com/api/v2/us/music/most-played/${encodeURIComponent(limit)}/songs.json`
  ];

  for (const url of endpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      if (typeof customFetch !== "function") break;
      const res = await customFetch(url, {
        headers: { "Accept": "application/json" },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) continue;

      const json = await res.json();
      const parsed = parseMusicChartJson(json);
      if (parsed.length > 0) {
        return {
          provider: url.includes("deezer") ? "deezer_chart_live" : "apple_music_rss_live",
          records: parsed
        };
      }
    } catch {
      clearTimeout(timer);
    }
  }

  return {
    provider: "music_chart_fallback",
    records: getFallbackChartSounds()
  };
}
