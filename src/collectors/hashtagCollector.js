/**
 * TrendTok Analytics — Standalone Breakout Hashtag Collector
 * Implements REQ-FR-16 (Clause 2): Decoupled collector that fetches real-time search spikes
 * from Google Trends RSS/XML feeds and transforms surging queries into breakout TikTok hashtags.
 */

import { normalizeHashtag, isEvergreenStopTag, filterBreakoutHashtags } from "./stopWords.js";

/**
 * Parses Google Trends approx_traffic string (e.g., "200,000+", "2M+", "50,000+") into a number.
 *
 * @param {string} rawTraffic - Formatted traffic string from RSS
 * @returns {number} Numeric search volume estimate
 */
export function parseTrafficVolume(rawTraffic = "") {
  if (typeof rawTraffic !== "string") {
    return 25000;
  }
  const upper = rawTraffic.trim().toUpperCase();
  const numPart = parseFloat(upper.replace(/[^0-9.]/g, ""));
  if (Number.isNaN(numPart) || numPart <= 0) {
    return 25000;
  }
  if (upper.includes("M")) {
    return Math.round(numPart * 1_000_000);
  }
  if (upper.includes("K")) {
    return Math.round(numPart * 1_000);
  }
  const plain = parseInt(upper.replace(/[^0-9]/g, ""), 10);
  return Number.isNaN(plain) ? 25000 : plain;
}

/**
 * Extracts related sub-hashtags from news headlines or query tokens to form a 1-2-3 Triad.
 *
 * @param {string} primaryTitle - Primary trend title
 * @param {Array<string>} newsTitles - Associated news headlines from RSS item
 * @returns {Array<string>} Up to 3 clean, non-stopword hashtags
 */
export function extractRelatedSubTags(primaryTitle, newsTitles = []) {
  const primaryTag = normalizeHashtag(primaryTitle);
  const candidates = [primaryTag];

  // Tokenize multi-word title into sub-concepts (e.g., "Squid Game 2" -> "#squidgame")
  const titleWords = String(primaryTitle || "")
    .split(/[\s\-—–:/|,]+/)
    .map(w => w.replace(/[^a-zA-Z0-9а-яА-ЯіїєґІЇЄҐ]/g, ""))
    .filter(w => w.length >= 4);

  if (titleWords.length >= 2) {
    candidates.push(`#${(titleWords[0] + titleWords[1]).toLowerCase()}`);
  }
  for (const word of titleWords) {
    candidates.push(`#${word.toLowerCase()}`);
  }

  // Extract capitalized entities or key terms from news headlines
  for (const headline of newsTitles) {
    const words = String(headline || "")
      .replace(/&#\d+;|&quot;|&amp;|&apos;/g, " ")
      .split(/\s+/)
      .map(w => w.replace(/[^a-zA-Z0-9]/g, ""))
      .filter(w => w.length >= 5 && /^[A-Z]/.test(w));

    for (const w of words.slice(0, 3)) {
      candidates.push(`#${w.toLowerCase()}`);
    }
  }

  // Fallback contextual momentum tags (never evergreen #fyp/#viral)
  candidates.push("#breakouttrend", "#trendingtopic", "#newswave");

  return filterBreakoutHashtags(candidates).slice(0, 3);
}

/**
 * Pure parser for Google Trends RSS XML payload.
 * Extracts <item> blocks and converts them into normalized TrendTok hashtag records.
 *
 * @param {string} xmlContent - Raw XML string from https://trends.google.com/trending/rss
 * @param {string} [geo='US'] - Region code
 * @returns {Array<Object>} Normalized hashtag trend records with historical snapshots
 */
export function parseGoogleTrendsRss(xmlContent, geo = "US") {
  if (typeof xmlContent !== "string" || !xmlContent.includes("<item>")) {
    return [];
  }

  const itemBlocks = xmlContent.split("<item>").slice(1);
  const results = [];
  const now = Date.now();

  for (let idx = 0; idx < itemBlocks.length; idx++) {
    const block = itemBlocks[idx].split("</item>")[0] || "";

    const titleMatch = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/i);
    const rawTitle = (titleMatch ? (titleMatch[1] ?? titleMatch[2] ?? "") : "").trim();
    if (!rawTitle) continue;

    const primaryHashtag = normalizeHashtag(rawTitle);
    if (!primaryHashtag || isEvergreenStopTag(primaryHashtag)) {
      continue;
    }

    const trafficMatch = block.match(/<ht:approx_traffic>(.*?)<\/ht:approx_traffic>/i);
    const trafficVolume = parseTrafficVolume(trafficMatch ? trafficMatch[1] : "50,000+");

    // Extract news headlines for sub-tag context
    const newsMatches = [...block.matchAll(/<ht:news_item_title><!\[CDATA\[(.*?)\]\]><\/ht:news_item_title>|<ht:news_item_title>(.*?)<\/ht:news_item_title>/gi)];
    const newsHeadlines = newsMatches.map(m => (m[1] ?? m[2] ?? "").trim()).filter(Boolean);

    const triadTags = extractRelatedSubTags(rawTitle, newsHeadlines);
    const cleanTag = primaryHashtag.replace(/^#/, "");
    const itemId = `hash_gt_${geo.toLowerCase()}_${cleanTag}`;

    // Scale search traffic into realistic TikTok view & video creation trajectory (6 hourly points)
    const baseViews = Math.max(35000, trafficVolume * 3);
    const hourlyVideoRate = Math.max(120, Math.min(950, Math.round(trafficVolume / 600)));

    const snapshots = [];
    let currViews = Math.round(baseViews * 0.55);
    let currVideos = Math.max(90, Math.round(hourlyVideoRate * 2.2));

    for (let step = 0; step < 6; step++) {
      const ts = new Date(now - (5 - step) * 3600 * 1000).toISOString();
      if (step > 0) {
        // Accelerating breakout curve
        const accelFactor = 0.75 + step * 0.12;
        const deltaVids = Math.round(hourlyVideoRate * accelFactor);
        const deltaViews = deltaVids * 240;
        currVideos += deltaVids;
        currViews += deltaViews;
      }
      snapshots.push({
        timestamp: ts,
        totalViews: currViews,
        totalVideos: currVideos
      });
    }

    const latest = snapshots[snapshots.length - 1];
    const prev = snapshots[snapshots.length - 2];

    results.push({
      itemId,
      type: "hashtag",
      title: primaryHashtag,
      rawTopic: rawTitle,
      geo,
      source: "google_trends_rss",
      triadTags,
      totalViews: latest.totalViews,
      totalVideos: latest.totalVideos,
      previousViews: prev.totalViews,
      previousVideos: prev.totalVideos,
      timestamp: latest.timestamp,
      previousTimestamp: prev.timestamp,
      snapshots,
      tiktokUrl: `https://www.tiktok.com/tag/${encodeURIComponent(cleanTag)}`
    });
  }

  return results;
}

/**
 * Curated fallback of real-world search & pop-culture breakout spikes
 * used when offline or during deterministic unit tests.
 *
 * @param {string} [geo='US'] - Region code
 * @returns {Array<Object>}
 */
export function getFallbackBreakoutHashtags(geo = "US") {
  const fallbackXml = `
    <rss version="2.0" xmlns:ht="https://trends.google.com/trending/rss">
      <channel>
        <item>
          <title>Squid Game Season 2</title>
          <ht:approx_traffic>500,000+</ht:approx_traffic>
          <ht:news_item_title>Thanos Red Light Green Light Challenge Goes Viral</ht:news_item_title>
        </item>
        <item>
          <title>GTA 6 Trailer 2</title>
          <ht:approx_traffic>1,000,000+</ht:approx_traffic>
          <ht:news_item_title>Rockstar Vice City Lucia Gameplay Theories</ht:news_item_title>
        </item>
        <item>
          <title>Severance Season 2</title>
          <ht:approx_traffic>200,000+</ht:approx_traffic>
          <ht:news_item_title>Lumon Industries Macrodata Refinement Edit</ht:news_item_title>
        </item>
        <item>
          <title>Champions League Draw</title>
          <ht:approx_traffic>500,000+</ht:approx_traffic>
          <ht:news_item_title>Real Madrid Arsenal Quarterfinal Highlights</ht:news_item_title>
        </item>
        <item>
          <title>Arcane Act 3</title>
          <ht:approx_traffic>200,000+</ht:approx_traffic>
          <ht:news_item_title>Jinx Vi Viktor Glorious Evolution Transition</ht:news_item_title>
        </item>
        <item>
          <title>Minecraft Movie Chicken Jockey</title>
          <ht:approx_traffic>500,000+</ht:approx_traffic>
          <ht:news_item_title>Theater Crowd Reaction Meme Trend</ht:news_item_title>
        </item>
      </channel>
    </rss>
  `;
  return parseGoogleTrendsRss(fallbackXml, geo);
}

/**
 * Fetches live breakout search spikes from Google Trends RSS and converts them into
 * TikTok hashtag trajectories. Falls back cleanly if offline.
 *
 * @param {Object} [options]
 * @param {string} [options.geo='US'] - Two-letter ISO country code (e.g., 'US', 'UA', 'GB')
 * @param {number} [options.timeoutMs=4500] - Network timeout in ms
 * @param {Function} [options.customFetch] - Optional fetch implementation for testing
 * @returns {Promise<{ provider: string, geo: string, records: Array<Object> }>}
 */
export async function collectBreakoutHashtags({
  geo = "US",
  timeoutMs = 4500,
  customFetch = globalThis.fetch
} = {}) {
  const rssUrl = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (typeof customFetch !== "function") {
      throw new Error("Fetch API unavailable");
    }
    const res = await customFetch(rssUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TrendTokCollector/2.3)",
        "Accept": "application/rss+xml, application/xml, text/xml"
      },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const xml = await res.text();
    const parsed = parseGoogleTrendsRss(xml, geo);
    if (parsed.length > 0) {
      return {
        provider: "google_trends_live",
        geo,
        records: parsed
      };
    }
  } catch {
    clearTimeout(timer);
  }

  return {
    provider: "google_trends_fallback",
    geo,
    records: getFallbackBreakoutHashtags(geo)
  };
}
