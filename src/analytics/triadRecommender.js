/**
 * TrendTok Analytics — Breakout Hashtag Triad (1-2-3 Combo) Recommendation Engine
 * Implements REQ-FR-18: Recommends a 3-hashtag combination strictly free of evergreen spam
 * (#fyp, #viral, #trending), pairing:
 *   1. Primary Breakout Spike Tag
 *   2. Niche / Entity Context Tag
 *   3. Format / Audio Momentum Trigger Tag
 */

import {
  normalizeHashtag,
  filterBreakoutHashtags,
  EVERGREEN_REMARK_NOTICE
} from "../collectors/stopWords.js";

const FORMAT_TRIGGER_DEFAULTS = Object.freeze([
  "#transitionedit",
  "#soundcheck",
  "#remixwave",
  "#creatorcut",
  "#audioflip",
  "#breakoutclip"
]);

/**
 * Extracts clean tokens from a track or trend title (splitting "Song (Variant) — Artist").
 *
 * @param {string} title
 * @returns {Array<string>} Candidate hashtags derived from title
 */
function deriveTitleCandidates(title = "") {
  if (typeof title !== "string" || !title.trim()) {
    return [];
  }

  const parts = title.split(/[—–\-()[\]]+/).map(p => p.trim()).filter(Boolean);
  const derived = [];

  for (const part of parts) {
    const tag = normalizeHashtag(part);
    if (tag && tag.length >= 4) {
      derived.push(tag);
    }
  }

  return filterBreakoutHashtags(derived);
}

/**
 * Generates an optimal 1-2-3 Hashtag Triad for a given sound or hashtag trend item.
 * Strictly strips out evergreen platform constants (#fyp, #viral, #trending).
 *
 * @param {Object} params
 * @param {Object} [params.item={}] - Trend item ({ id, type, title, vvs, hourlyVelocity })
 * @param {Array<string>} [params.correlatedTags=[]] - Co-occurring hashtags for this item
 * @param {Array<string>} [params.breakoutTags=[]] - Current surging hashtags from Google Trends / Radar
 * @returns {{
 *   triad: [string, string, string],
 *   slots: { primaryBreakout: string, nicheContext: string, formatTrigger: string },
 *   synergyScore: number,
 *   evergreenExcludedNotice: string
 * }}
 */
export function recommendHashtagTriad({
  item = {},
  correlatedTags = [],
  breakoutTags = []
} = {}) {
  const cleanCorrelated = filterBreakoutHashtags(correlatedTags);
  const cleanBreakouts = filterBreakoutHashtags(breakoutTags);
  const titleDerived = deriveTitleCandidates(item.title || item.id || "");

  // Pool of unique non-evergreen candidates in priority order
  const mergedPool = filterBreakoutHashtags([
    ...cleanCorrelated,
    ...titleDerived,
    ...cleanBreakouts,
    ...FORMAT_TRIGGER_DEFAULTS
  ]);

  const tag1 = mergedPool[0] || "#breakoutspike";
  const tag2 = mergedPool[1] || "#nichecommunity";
  const tag3 = mergedPool[2] || "#transitionedit";

  const triad = [tag1, tag2, tag3];

  // Compute synergy score [0..100] based on item momentum and correlation richness
  const baseVvs = Math.min(100, Math.max(0, Number(item.vvs) || 55));
  const correlationBonus = Math.min(20, cleanCorrelated.length * 7);
  const breakoutBonus = cleanBreakouts.length > 0 ? 10 : 4;
  const synergyScore = Number(Math.min(99.5, baseVvs * 0.7 + correlationBonus + breakoutBonus).toFixed(1));

  return {
    triad,
    slots: {
      primaryBreakout: tag1,
      nicheContext: tag2,
      formatTrigger: tag3
    },
    synergyScore,
    evergreenExcludedNotice: EVERGREEN_REMARK_NOTICE
  };
}
