/**
 * TrendTok Analytics - Asynchronous Web Service Entrypoint
 * 
 * Implements SRS v2.0 REST Endpoints & In-Memory TTL Storage
 * Standard: IEEE Std 830 / ISO/IEC/IEEE 29148
 */

import http from "node:http";
import {
  checkNoiseGuardrail,
  calculateMultiWindowVVS,
  determineLifecycleStatus
} from "./trendScorer.js";

const PORT = process.env.PORT || 3000;

/**
 * In-Memory Store (Single Source of Transient State)
 * @type {Map<string, { item: Object, snapshots: Array<Object> }>}
 */
export const memoryStore = new Map();

/**
 * In-memory correlations map: soundId -> Set of hashtag titles/ids
 * @type {Map<string, Set<string>>}
 */
export const correlationsStore = new Map();

/**
 * Helper to parse incoming JSON request body.
 * @param {http.IncomingMessage} req
 * @returns {Promise<Object>}
 */
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/**
 * Helper to send JSON responses.
 */
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

/**
 * Factory to create HTTP Server instance.
 * @returns {http.Server}
 */
export function createServer() {
  return http.createServer(async (req, res) => {
    const host = req.headers.host || `localhost:${PORT}`;
    const url = new URL(req.url, `http://${host}`);
    const method = req.method;

    try {
      // 0. API Discovery & Root Index
      if (method === "GET" && url.pathname === "/") {
        return sendJson(res, 200, {
          service: "TrendTok Analytics",
          version: "2.0.0",
          specification: "SRS-TRENDTOK-2026-V2",
          description: "Real-Time TikTok Viral Content Intelligence Web Service",
          author: "Lysak Kostiantyn (KN-32)",
          endpoints: {
            "GET /": "API index & catalog",
            "GET /api/health": "Health telemetry & uptime",
            "GET /api/trends": "All tracked trends (supports ?type=sound|hashtag)",
            "GET /api/trends/emerging": "Emerging viral trends (VVS >= 50, acceleration > 0)",
            "GET /api/trends/:id/correlations": "Sound + hashtag co-occurrence correlations",
            "POST /api/snapshots": "Ingest metric snapshots",
            "POST /api/simulation/seed": "Seed Golden Set test data"
          }
        });
      }

      // 1. Health Endpoint (REQ-FR-01 / Telemetry)
      if (method === "GET" && (url.pathname === "/health" || url.pathname === "/api/health")) {
        return sendJson(res, 200, {
          status: "ok",
          service: "TrendTok Analytics",
          version: "2.0.0",
          specification: "SRS-TRENDTOK-2026-V2",
          trackedItems: memoryStore.size,
          uptime: process.uptime()
        });
      }

      // 2. Snapshot Ingestion (REQ-FR-01)
      if (method === "POST" && url.pathname === "/api/snapshots") {
        const payload = await parseJsonBody(req);
        const records = Array.isArray(payload) ? payload : [payload];

        let ingested = 0;
        for (const rec of records) {
          if (!rec.itemId || typeof rec.totalViews !== "number" || typeof rec.totalVideos !== "number") {
            return sendJson(res, 400, {
              error: "VALIDATION_ERROR",
              message: "Each snapshot must include itemId, totalViews (number), and totalVideos (number)."
            });
          }

          if (!memoryStore.has(rec.itemId)) {
            memoryStore.set(rec.itemId, {
              item: {
                id: rec.itemId,
                type: rec.type || "sound",
                title: rec.title || rec.itemId,
                firstDetectedAt: rec.timestamp || new Date().toISOString()
              },
              snapshots: []
            });
          }

          const entry = memoryStore.get(rec.itemId);
          entry.snapshots.push({
            timestamp: rec.timestamp || new Date().toISOString(),
            totalViews: rec.totalViews,
            totalVideos: rec.totalVideos
          });

          // Track correlations if provided (e.g. sound associated with hashtags)
          if (rec.type === "sound" && Array.isArray(rec.hashtags)) {
            if (!correlationsStore.has(rec.itemId)) {
              correlationsStore.set(rec.itemId, new Set());
            }
            const soundSet = correlationsStore.get(rec.itemId);
            rec.hashtags.forEach(tag => soundSet.add(tag));
          }

          // Keep sorted by timestamp
          entry.snapshots.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

          // Rolling TTL pruning (REQ-NFR-02): keep at most 48 recent snapshots
          if (entry.snapshots.length > 48) {
            entry.snapshots.shift();
          }

          ingested++;
        }

        return sendJson(res, 201, {
          status: "success",
          ingestedCount: ingested
        });
      }

      // 3. Emerging Trends Query (REQ-FR-05)
      if (method === "GET" && url.pathname === "/api/trends/emerging") {
        const results = [];

        for (const [id, entry] of memoryStore.entries()) {
          const item = entry.item;
          const sn = entry.snapshots;
          if (sn.length < 2) continue;

          const latest = sn[sn.length - 1];
          const prev1h = sn[sn.length - 2];
          const delta1h = Math.max(0, latest.totalVideos - prev1h.totalVideos);

          const passesGuard = checkNoiseGuardrail({
            type: item.type,
            totalViews: latest.totalViews,
            deltaVideos: delta1h
          });

          const vvs = calculateMultiWindowVVS({
            type: item.type,
            totalViews: latest.totalViews,
            window1h: delta1h
          });

          const acceleration = sn.length >= 3
            ? (delta1h - Math.max(0, prev1h.totalVideos - sn[sn.length - 3].totalVideos))
            : 5.0;

          const status = determineLifecycleStatus({
            vvs,
            acceleration,
            passesGuardrail: passesGuard,
            velocity1h: delta1h
          });

          if (status === "EMERGING") {
            results.push({
              id: item.id,
              type: item.type,
              title: item.title,
              vvs,
              status,
              totalViews: latest.totalViews,
              hourlyVelocity: delta1h
            });
          }
        }

        results.sort((a, b) => b.vvs - a.vvs);
        return sendJson(res, 200, results);
      }

      // 4. All Trends List (REQ-FR-05)
      if (method === "GET" && url.pathname === "/api/trends") {
        const typeFilter = url.searchParams.get("type");
        const list = [];

        for (const [id, entry] of memoryStore.entries()) {
          if (typeFilter && entry.item.type !== typeFilter) continue;
          const sn = entry.snapshots;
          const latest = sn[sn.length - 1] || { totalViews: 0, totalVideos: 0 };
          const prev1h = sn.length >= 2 ? sn[sn.length - 2] : latest;
          const delta1h = Math.max(0, latest.totalVideos - prev1h.totalVideos);

          const vvs = calculateMultiWindowVVS({
            type: entry.item.type,
            totalViews: latest.totalViews,
            window1h: delta1h
          });

          list.push({
            id: entry.item.id,
            type: entry.item.type,
            title: entry.item.title,
            vvs,
            totalViews: latest.totalViews,
            snapshotsCount: sn.length
          });
        }

        list.sort((a, b) => b.vvs - a.vvs);
        return sendJson(res, 200, list);
      }

      // 5. Sound + Hashtag Correlations (REQ-FR-06)
      const correlationMatch = url.pathname.match(/^\/api\/trends\/([^/]+)\/correlations$/);
      if (method === "GET" && correlationMatch) {
        const itemId = correlationMatch[1];
        const correlatedTags = correlationsStore.has(itemId)
          ? Array.from(correlationsStore.get(itemId))
          : [];
        return sendJson(res, 200, {
          itemId,
          correlatedHashtags: correlatedTags
        });
      }

      // 6. Simulation Golden Set Seeder (REQ-FR-07)
      if (method === "POST" && url.pathname === "/api/simulation/seed") {
        memoryStore.clear();
        correlationsStore.clear();

        // Seed sound: aurora_echoes (delta1h = 130 -> VVS = 65.0 -> status EMERGING)
        memoryStore.set("sound_aurora", {
          item: { id: "sound_aurora", type: "sound", title: "Aurora Echoes", firstDetectedAt: new Date().toISOString() },
          snapshots: [
            { timestamp: "2026-09-15T10:00:00.000Z", totalViews: 20000, totalVideos: 50 },
            { timestamp: "2026-09-15T11:00:00.000Z", totalViews: 28000, totalVideos: 120 },
            { timestamp: "2026-09-15T12:00:00.000Z", totalViews: 42000, totalVideos: 250 }
          ]
        });
        correlationsStore.set("sound_aurora", new Set(["#aurora", "#cinematicvibes"]));

        // Seed hashtag: #cozyhomevibes (Noise - below threshold: views 13500 < 25k -> status NOISE)
        memoryStore.set("hash_cozy", {
          item: { id: "hash_cozy", type: "hashtag", title: "#cozyhomevibes", firstDetectedAt: new Date().toISOString() },
          snapshots: [
            { timestamp: "2026-09-15T11:00:00.000Z", totalViews: 12000, totalVideos: 40 },
            { timestamp: "2026-09-15T12:00:00.000Z", totalViews: 13500, totalVideos: 70 }
          ]
        });

        return sendJson(res, 200, {
          status: "seeded",
          seededItems: memoryStore.size,
          message: "Golden Set loaded successfully."
        });
      }

      // 404 Handler
      return sendJson(res, 404, { error: "NOT_FOUND", message: `Endpoint ${url.pathname} not found.` });

    } catch (err) {
      return sendJson(res, 500, { error: "INTERNAL_ERROR", message: err.message });
    }
  });
}

export const server = createServer();

// Auto-start only if executed directly via node CLI
if (process.argv[1] && import.meta.filename === process.argv[1]) {
  server.listen(PORT, () => {
    console.log(`[TrendTok Analytics] Server running at http://localhost:${PORT}/ (Spec v2.0)`);
  });
}
