/**
 * TrendTok Analytics — Evergreen Stop-List & Hashtag Normalizer
 * Implements REQ-FR-16 (Clause 1): Filters out constant high-frequency platform noise
 * (#fyp, #viral, #trending, etc.) so analytics focus strictly on breakout topic spikes.
 */

/**
 * Frozen set of evergreen platform-wide hashtags that carry zero topical signal.
 * All entries are stored in lowercase with leading '#'.
 */
export const EVERGREEN_STOP_TAGS = Object.freeze(new Set([
  "#fyp",
  "#foryou",
  "#foryoupage",
  "#viral",
  "#trending",
  "#tiktok",
  "#xyzbca",
  "#fy",
  "#fypシ",
  "#fypage",
  "#viralvideo",
  "#tiktokviral",
  "#trend",
  "#explore",
  "#explorepage",
  "#duet",
  "#stitch",
  "#parati",
  "#pourtoi"
]));

/**
 * Human-readable UI notice explaining why evergreen tags are excluded from leaderboards and triads.
 */
export const EVERGREEN_REMARK_NOTICE =
  "System evergreen tags (#fyp, #foryou, #viral, #trending) are platform constants and are automatically excluded to isolate genuine topical breakout spikes.";

/**
 * Normalizes any search phrase, topic title, or raw tag into a canonical TikTok hashtag.
 * Examples:
 *   "Squid Game 2" -> "#squidgame2"
 *   "#FYP"         -> "#fyp"
 *   "Chappell Roan!" -> "#chappellroan"
 *
 * @param {string} raw - Raw input string or phrase
 * @returns {string} Canonical lowercase hashtag starting with '#', or empty string if invalid
 */
export function normalizeHashtag(raw) {
  if (typeof raw !== "string") {
    return "";
  }
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[^a-z0-9а-яіїєґ_]/gi, "");

  if (cleaned.length < 2) {
    return "";
  }
  return `#${cleaned}`;
}

/**
 * Determines whether a hashtag is an evergreen platform constant that should be excluded.
 *
 * @param {string} tag - Raw or normalized hashtag
 * @returns {boolean} True if the tag is in the evergreen stop-list or invalid
 */
export function isEvergreenStopTag(tag) {
  const normalized = normalizeHashtag(tag);
  if (!normalized) {
    return true;
  }
  return EVERGREEN_STOP_TAGS.has(normalized);
}

/**
 * Filters and normalizes an array of candidate hashtags, removing evergreen constants and duplicates.
 *
 * @param {Array<string>} tags - Candidate hashtag strings or phrases
 * @returns {Array<string>} Clean, deduplicated array of topical breakout hashtags
 */
export function filterBreakoutHashtags(tags = []) {
  if (!Array.isArray(tags)) {
    return [];
  }
  const seen = new Set();
  const result = [];

  for (const raw of tags) {
    const norm = normalizeHashtag(raw);
    if (!norm || EVERGREEN_STOP_TAGS.has(norm) || seen.has(norm)) {
      continue;
    }
    seen.add(norm);
    result.push(norm);
  }

  return result;
}
