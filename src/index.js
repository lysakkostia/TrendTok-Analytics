/**
 * TrendTok Analytics - Asynchronous Web Service Entrypoint
 * 
 * Implements SRS v2.0 & v2.1 REST Endpoints, In-Memory TTL Storage & Web Dashboard
 * Standard: IEEE Std 830 / ISO/IEC/IEEE 29148
 */

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkNoiseGuardrail,
  calculateMultiWindowVVS,
  determineLifecycleStatus,
  predictSaturationWindow
} from "./trendScorer.js";
import { fetchExternalTrendingFeed } from "./ingestionClient.js";
import { initDatabase, TrendRepository } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");

const PORT = process.env.PORT || 3000;

const defaultDbPath = process.env.NODE_ENV === "test" ? ":memory:" : (process.env.DB_PATH || path.join(__dirname, "..", "data", "trendtok.db"));
export const db = initDatabase(defaultDbPath);
export const repository = new TrendRepository(db);

/**
 * In-Memory Store (Single Source of Transient State & Fast Mirror)
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
 * @param {http.ServerResponse} res
 * @param {number} statusCode
 * @param {Object} data
 */
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
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
      // ==========================================
      // REQ-FR-08: Web Dashboard Static Routing
      // ==========================================
      if (method === "GET" || method === "HEAD") {
        // 1. Dashboard HTML at GET / when requested by browser or Accept includes text/html
        if (url.pathname === "/") {
          const acceptHeader = req.headers.accept || "";
          if (acceptHeader.includes("text/html")) {
            const htmlPath = path.join(PUBLIC_DIR, "index.html");
            const htmlContent = await fs.readFile(htmlPath, "utf-8");
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            return res.end(method === "HEAD" ? "" : htmlContent);
          }

          // Otherwise return API discovery catalog (backward-compatible)
          return sendJson(res, 200, {
            service: "TrendTok Analytics",
            version: "2.3.0",
            specification: "SRS-TRENDTOK-2026-V2",
            description: "Real-Time TikTok Viral Content Intelligence Web Service",
            author: "Lysak Kostiantyn (KN-32)",
            endpoints: {
              "GET /": "Web Dashboard (browser) or API index (json)",
              "GET /api/health": "Health telemetry & uptime",
              "GET /api/trends": "All tracked trends (supports ?limit=50&page=1&category=...)",
              "GET /api/trends/:id/detail": "Deep-dive trend telemetry, 1h/6h/24h comparisons & snapshots",
              "GET /api/trends/emerging": "Emerging viral trends (VVS >= 50, acceleration > 0)",
              "GET /api/trends/:id/correlations": "Sound + hashtag co-occurrence correlations",
              "POST /api/snapshots": "Ingest metric snapshots",
              "POST /api/simulation/seed": "Seed Golden Set test data",
              "POST /api/simulation/step": "Advance simulation time by 1 hour",
              "POST /api/simulation/inject": "Inject anomaly spike (viral or noise)",
              "POST /api/ingest/fetch": "Live & high-scale feed ingestion (supports ?scale=1000)"
            }
          });
        }

        // 2. Dashboard Stylesheet
        if (url.pathname === "/dashboard.css") {
          const cssPath = path.join(PUBLIC_DIR, "dashboard.css");
          const cssContent = await fs.readFile(cssPath, "utf-8");
          res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
          return res.end(cssContent);
        }

        // 3. Dashboard Client Script
        if (url.pathname === "/dashboard.js") {
          const jsPath = path.join(PUBLIC_DIR, "dashboard.js");
          const jsContent = await fs.readFile(jsPath, "utf-8");
          res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
          return res.end(jsContent);
        }
      }

      // ==========================================
      // Telemetry Endpoint (REQ-FR-01 / Health)
      // ==========================================
      if (method === "GET" && (url.pathname === "/health" || url.pathname === "/api/health")) {
        const stats = repository.getStats();
        return sendJson(res, 200, {
          status: "ok",
          service: "TrendTok Analytics",
          version: "2.3.0",
          specification: "SRS-TRENDTOK-2026-V2",
          trackedItems: Math.max(memoryStore.size, stats.trendCount),
          databaseSnapshots: stats.snapshotCount,
          uptime: process.uptime()
        });
      }

      // ==========================================
      // Snapshot Ingestion (REQ-FR-01)
      // ==========================================
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

      // ==========================================
      // Emerging Trends Query (REQ-FR-05)
      // ==========================================
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
              hourlyVelocity: delta1h,
              acceleration
            });
          }
        }

        results.sort((a, b) => b.vvs - a.vvs);
        return sendJson(res, 200, results);
      }

      // ==========================================
      // All Trends List with Analytics & Deltas (REQ-FR-05, REQ-FR-08, REQ-FR-15)
      // ==========================================
      if (method === "GET" && url.pathname === "/api/trends") {
        const typeFilter = url.searchParams.get("type");
        const isPagedQuery = url.searchParams.has("limit") || url.searchParams.has("page") || url.searchParams.has("category") || url.searchParams.has("search") || url.searchParams.has("paged");

        if (isPagedQuery) {
          const limitParam = url.searchParams.get("limit");
          const pageParam = url.searchParams.get("page");
          const category = url.searchParams.get("category") || "all";
          const search = url.searchParams.get("search");
          const sortBy = url.searchParams.get("sortBy") || "vvs";
          const sortOrder = url.searchParams.get("sortOrder") || "desc";

          const limit = limitParam ? Math.max(1, parseInt(limitParam, 10)) : 50;
          const page = pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1;
          const offset = (page - 1) * limit;

          const pagedResult = repository.queryTrendsPaged({
            limit,
            offset,
            type: typeFilter,
            category,
            search,
            sortBy,
            sortOrder
          });

          // If SQLite has data, return structured pagination
          if (pagedResult.totalCount > 0 || repository.getStats().trendCount > 0) {
            return sendJson(res, 200, pagedResult);
          }
        }

        // Backward-compatible array response
        const list = [];

        for (const [id, entry] of memoryStore.entries()) {
          if (typeFilter && entry.item.type !== typeFilter) continue;
          const sn = entry.snapshots;
          const latest = sn[sn.length - 1] || { totalViews: 0, totalVideos: 0 };
          const prev1h = sn.length >= 2 ? sn[sn.length - 2] : latest;
          const delta1h = Math.max(0, latest.totalVideos - prev1h.totalVideos);

          const passesGuard = checkNoiseGuardrail({
            type: entry.item.type,
            totalViews: latest.totalViews,
            deltaVideos: delta1h
          });

          const vvs = calculateMultiWindowVVS({
            type: entry.item.type,
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

          // Compute recent history deltas for sparkline visualization
          const historyDeltas = [];
          for (let i = 1; i < sn.length; i++) {
            historyDeltas.push(Math.max(0, sn[i].totalVideos - sn[i - 1].totalVideos));
          }

          // Compute saturation horizon and opportunity window (REQ-FR-11)
          const saturationPrediction = predictSaturationWindow({
            velocity1h: delta1h,
            acceleration,
            type: entry.item.type
          });

          // Canonical TikTok URL (REQ-FR-14)
          let tiktokUrl = entry.item.tiktokUrl || entry.item.external_url;
          if (!tiktokUrl || tiktokUrl.includes("/music/-sound_")) {
            if (entry.item.type === "hashtag") {
              const cleanTag = (entry.item.title || id).replace(/^#/, "");
              tiktokUrl = `https://www.tiktok.com/tag/${encodeURIComponent(cleanTag)}`;
            } else {
              const query = (entry.item.title || id).replace(/[—–-]/g, " ").replace(/\s+/g, " ").trim();
              tiktokUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;
            }
          }

          list.push({
            id: entry.item.id,
            type: entry.item.type,
            title: entry.item.title,
            tiktokUrl,
            vvs,
            status,
            hourlyVelocity: delta1h,
            acceleration,
            saturationPrediction,
            totalViews: latest.totalViews,
            snapshotsCount: sn.length,
            historyDeltas: historyDeltas.slice(-12)
          });
        }

        list.sort((a, b) => b.vvs - a.vvs);
        return sendJson(res, 200, list);
      }

      // ==========================================
      // Trend Deep-Dive Telemetry & History (REQ-FR-12 & REQ-FR-14)
      // ==========================================
      const detailMatch = url.pathname.match(/^\/api\/trends\/([^/]+)\/detail$/);
      if (method === "GET" && detailMatch) {
        const itemId = detailMatch[1];
        let detail = repository.getTrendDetail(itemId);
        if (!detail && memoryStore.has(itemId)) {
          const entry = memoryStore.get(itemId);
          const sn = entry.snapshots || [];
          const latest = sn[sn.length - 1] || { totalViews: 0, totalVideos: 0 };
          const prev = sn.length >= 2 ? sn[sn.length - 2] : latest;
          const delta1h = Math.max(0, latest.totalVideos - prev.totalVideos);
          detail = {
            id: entry.item.id,
            type: entry.item.type,
            title: entry.item.title,
            tiktokUrl: entry.item.type === "hashtag"
              ? `https://www.tiktok.com/tag/${encodeURIComponent(entry.item.title.replace(/^#/, ""))}`
              : `https://www.tiktok.com/search?q=${encodeURIComponent((entry.item.title || entry.item.id).replace(/[—–-]/g, " ").trim())}`,
            hourlyVelocity: delta1h,
            totalViews: latest.totalViews,
            totalVideos: latest.totalVideos,
            snapshots: sn,
            correlatedHashtags: correlationsStore.has(itemId) ? Array.from(correlationsStore.get(itemId)) : []
          };
        }
        if (!detail) {
          return sendJson(res, 404, { error: "NOT_FOUND", message: `Trend ${itemId} not found.` });
        }
        return sendJson(res, 200, detail);
      }

      // ==========================================
      // Sound + Hashtag Correlations (REQ-FR-06)
      // ==========================================
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

      // ==========================================
      // Simulation Golden Set Seeder (REQ-FR-07)
      // ==========================================
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

        // Mirror to SQLite repository (REQ-FR-12)
        try {
          repository.insertBatch([
            {
              itemId: "sound_aurora",
              type: "sound",
              title: "Aurora Echoes",
              previousTimestamp: "2026-09-15T11:00:00.000Z",
              previousViews: 28000,
              previousVideos: 120,
              timestamp: "2026-09-15T12:00:00.000Z",
              totalViews: 42000,
              totalVideos: 250,
              hashtags: ["#aurora", "#cinematicvibes"],
              tiktokUrl: "https://www.tiktok.com/search?q=Aurora%20Echoes"
            },
            {
              itemId: "hash_cozy",
              type: "hashtag",
              title: "#cozyhomevibes",
              previousTimestamp: "2026-09-15T11:00:00.000Z",
              previousViews: 12000,
              previousVideos: 40,
              timestamp: "2026-09-15T12:00:00.000Z",
              totalViews: 13500,
              totalVideos: 70,
              tiktokUrl: "https://www.tiktok.com/tag/cozyhomevibes"
            }
          ]);
        } catch (e) {
          // ignore in tests
        }

        return sendJson(res, 200, {
          status: "seeded",
          seededItems: memoryStore.size,
          message: "Golden Set loaded successfully."
        });
      }

      // ==========================================
      // Simulation Step Controller (+1 Hour) (REQ-FR-09)
      // ==========================================
      if (method === "POST" && url.pathname === "/api/simulation/step") {
        if (memoryStore.size === 0) {
          // Auto-seed if empty
          memoryStore.set("sound_aurora", {
            item: { id: "sound_aurora", type: "sound", title: "Aurora Echoes", firstDetectedAt: new Date().toISOString() },
            snapshots: [
              { timestamp: new Date(Date.now() - 3600000).toISOString(), totalViews: 28000, totalVideos: 120 },
              { timestamp: new Date().toISOString(), totalViews: 42000, totalVideos: 250 }
            ]
          });
        }

        let stepped = 0;
        let latestTimestamp = "";

        for (const [id, entry] of memoryStore.entries()) {
          const sn = entry.snapshots;
          if (sn.length === 0) continue;
          const last = sn[sn.length - 1];
          const lastTime = new Date(last.timestamp).getTime();
          const newTime = new Date(lastTime + 3600 * 1000).toISOString();
          latestTimestamp = newTime;

          const prev = sn.length >= 2 ? sn[sn.length - 2] : last;
          const currentDelta = Math.max(0, last.totalVideos - prev.totalVideos);

          let nextVideoDelta = 0;
          let nextViewDelta = 0;

          if (id === "sound_aurora" || id.includes("viral")) {
            nextVideoDelta = Math.floor(currentDelta * 1.3) + 40;
            nextViewDelta = nextVideoDelta * 220;
          } else if (id === "hash_cozy" || id.includes("noise")) {
            nextVideoDelta = Math.max(5, Math.floor(Math.random() * 8) + 2);
            nextViewDelta = nextVideoDelta * 40;
          } else {
            nextVideoDelta = Math.max(20, Math.floor(currentDelta * 1.1) + 15);
            nextViewDelta = nextVideoDelta * 120;
          }

          sn.push({
            timestamp: newTime,
            totalViews: last.totalViews + nextViewDelta,
            totalVideos: last.totalVideos + nextVideoDelta
          });

          if (sn.length > 48) {
            sn.shift();
          }

          stepped++;
        }

        return sendJson(res, 200, {
          status: "stepped",
          steppedItems: stepped,
          simulatedTimestamp: latestTimestamp
        });
      }

      // ==========================================
      // Simulation Anomaly Injector (REQ-FR-09)
      // ==========================================
      if (method === "POST" && url.pathname === "/api/simulation/inject") {
        const payload = await parseJsonBody(req);
        const scenario = payload.scenario || "viral_spike";
        const now = new Date();
        const t0 = new Date(now.getTime() - 3600 * 1000).toISOString();
        const t1 = now.toISOString();

        if (scenario === "viral_spike") {
          const id = payload.itemId || `sound_viral_${Date.now()}`;
          const title = payload.title || "Hypersonic Beat";
          memoryStore.set(id, {
            item: { id, type: payload.type || "sound", title, firstDetectedAt: t0 },
            snapshots: [
              { timestamp: t0, totalViews: 25000, totalVideos: 80 },
              { timestamp: t1, totalViews: 90000, totalVideos: 420 }
            ]
          });
          if (Array.isArray(payload.hashtags)) {
            correlationsStore.set(id, new Set(payload.hashtags));
          } else {
            correlationsStore.set(id, new Set(["#viralspike", "#trendingmusic"]));
          }
          return sendJson(res, 201, {
            status: "injected",
            scenario: "viral_spike",
            item: { id, type: payload.type || "sound", title }
          });
        }

        if (scenario === "noise_spike") {
          const id = payload.itemId || `hash_noise_${Date.now()}`;
          const title = payload.title || "#microanomaly";
          memoryStore.set(id, {
            item: { id, type: payload.type || "hashtag", title, firstDetectedAt: t0 },
            snapshots: [
              { timestamp: t0, totalViews: 4000, totalVideos: 10 },
              { timestamp: t1, totalViews: 5200, totalVideos: 25 }
            ]
          });
          return sendJson(res, 201, {
            status: "injected",
            scenario: "noise_spike",
            item: { id, type: payload.type || "hashtag", title }
          });
        }

        // Custom generic injection
        const id = payload.itemId || `item_${Date.now()}`;
        memoryStore.set(id, {
          item: { id, type: payload.type || "sound", title: payload.title || id, firstDetectedAt: t1 },
          snapshots: [
            { timestamp: t1, totalViews: payload.totalViews || 1000, totalVideos: payload.totalVideos || 10 }
          ]
        });
        return sendJson(res, 201, {
          status: "injected",
          item: { id, type: payload.type || "sound", title: payload.title || id }
        });
      }

      // ==========================================
      // Live External Feed Ingestion Engine (REQ-FR-10, REQ-FR-13, REQ-FR-14)
      // ==========================================
      if (method === "POST" && url.pathname === "/api/ingest/fetch") {
        const providerQuery = url.searchParams.get("provider") || "creative_center";
        const scaleQuery = url.searchParams.get("scale");
        const scale = scaleQuery ? parseInt(scaleQuery, 10) : null;

        const { provider, records } = await fetchExternalTrendingFeed(providerQuery, { scale });

        // Batch persist to SQLite (REQ-FR-12 & REQ-FR-13)
        try {
          repository.insertBatch(records);
        } catch (e) {
          // ignore or log
        }

        let ingested = 0;
        for (const rec of records) {
          if (!memoryStore.has(rec.itemId)) {
            memoryStore.set(rec.itemId, {
              item: {
                id: rec.itemId,
                type: rec.type || "sound",
                title: rec.title || rec.itemId,
                tiktokUrl: rec.tiktokUrl,
                firstDetectedAt: rec.previousTimestamp || new Date().toISOString()
              },
              snapshots: []
            });
          }

          const entry = memoryStore.get(rec.itemId);

          // Seed previous snapshot if provided
          if (rec.previousTimestamp && typeof rec.previousViews === "number") {
            entry.snapshots.push({
              timestamp: rec.previousTimestamp,
              totalViews: rec.previousViews,
              totalVideos: rec.previousVideos
            });
          }

          // Append current observation
          entry.snapshots.push({
            timestamp: rec.timestamp,
            totalViews: rec.totalViews,
            totalVideos: rec.totalVideos
          });

          // Track correlations if available
          if (rec.type === "sound" && Array.isArray(rec.hashtags)) {
            if (!correlationsStore.has(rec.itemId)) {
              correlationsStore.set(rec.itemId, new Set());
            }
            const soundSet = correlationsStore.get(rec.itemId);
            rec.hashtags.forEach(tag => soundSet.add(tag));
          }

          entry.snapshots.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          if (entry.snapshots.length > 48) {
            entry.snapshots.shift();
          }

          ingested++;
        }

        return sendJson(res, 200, {
          status: "success",
          provider,
          ingestedCount: ingested
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
if (process.argv[1] && (import.meta.filename === process.argv[1] || __filename === path.resolve(process.argv[1]))) {
  try {
    if (repository.getStats().trendCount === 0) {
      const initial = await fetchExternalTrendingFeed("mock", { scale: 100 });
      repository.insertBatch(initial.records);
    }
  } catch (e) {
    // Non-fatal init fallback
  }

  server.listen(PORT, () => {
    console.log(`[TrendTok Analytics] Server running at http://localhost:${PORT}/ (Spec v2.1)`);
  });
}

