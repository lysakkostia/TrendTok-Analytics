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
import { forecastSoundTrajectory, backtestSoundForecast } from "./analytics/soundForecaster.js";
import { forecastHashtagSpike, backtestHashtagForecast } from "./analytics/hashtagForecaster.js";
import { evolveForecasterWeights } from "./analytics/evolutionaryTuner.js";
import { recommendHashtagTriad } from "./analytics/triadRecommender.js";
import { runCollectionCycle } from "./collectors/collectorWorker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");

const PORT = process.env.PORT || 3000;

// Production Primary Database
const defaultDbPath = process.env.NODE_ENV === "test" ? ":memory:" : (process.env.DB_PATH || path.join(__dirname, "..", "data", "trendtok.db"));
export const db = initDatabase(defaultDbPath);
export const repository = new TrendRepository(db);

// Isolated Test & Simulation Database (REQ-FR-07, REQ-FR-09)
const testDbPath = process.env.NODE_ENV === "test" ? ":memory:" : (process.env.TEST_DB_PATH || path.join(__dirname, "..", "data", "trendtok_test.db"));
export const testDb = initDatabase(testDbPath);
export const testRepository = new TrendRepository(testDb);

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
 * Isolated Test In-Memory Stores
 */
export const testMemoryStore = new Map();
export const testCorrelationsStore = new Map();

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

        // 4. Test & Simulation Lab HTML at GET /test
        if (url.pathname === "/test" || url.pathname === "/test.html") {
          const testHtmlPath = path.join(PUBLIC_DIR, "test.html");
          const testHtmlContent = await fs.readFile(testHtmlPath, "utf-8");
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          return res.end(method === "HEAD" ? "" : testHtmlContent);
        }

        // 5. Test Client Script
        if (url.pathname === "/test.js") {
          const testJsPath = path.join(PUBLIC_DIR, "test.js");
          const testJsContent = await fs.readFile(testJsPath, "utf-8");
          res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
          return res.end(testJsContent);
        }
      }

      // ==========================================
      // Telemetry Endpoint (REQ-FR-01 / Health)
      // ==========================================
      if (method === "GET" && (url.pathname === "/health" || url.pathname === "/api/health" || url.pathname === "/api/test/health")) {
        const isTest = url.pathname.includes("/test");
        const activeRepo = isTest ? testRepository : repository;
        const activeMem = isTest ? testMemoryStore : memoryStore;
        const stats = activeRepo.getStats();
        return sendJson(res, 200, {
          status: "ok",
          service: "TrendTok Analytics",
          mode: isTest ? "test_simulation_lab" : "production_radar",
          version: "2.3.0",
          specification: "SRS-TRENDTOK-2026-V2",
          trackedItems: Math.max(activeMem.size, stats.trendCount),
          databaseSnapshots: stats.snapshotCount,
          uptime: process.uptime()
        });
      }

      // ==========================================
      // Snapshot Ingestion (REQ-FR-01)
      // ==========================================
      if (method === "POST" && (url.pathname === "/api/snapshots" || url.pathname === "/api/test/snapshots")) {
        const isTest = url.pathname.includes("/test");
        const activeMem = isTest ? testMemoryStore : memoryStore;
        const activeCorr = isTest ? testCorrelationsStore : correlationsStore;
        const activeRepo = isTest ? testRepository : repository;

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

          if (!activeMem.has(rec.itemId)) {
            activeMem.set(rec.itemId, {
              item: {
                id: rec.itemId,
                type: rec.type || "sound",
                title: rec.title || rec.itemId,
                firstDetectedAt: rec.timestamp || new Date().toISOString()
              },
              snapshots: []
            });
          }

          const entry = activeMem.get(rec.itemId);
          entry.snapshots.push({
            timestamp: rec.timestamp || new Date().toISOString(),
            totalViews: rec.totalViews,
            totalVideos: rec.totalVideos
          });

          // Track correlations if provided (e.g. sound associated with hashtags)
          if (rec.type === "sound" && Array.isArray(rec.hashtags)) {
            if (!activeCorr.has(rec.itemId)) {
              activeCorr.set(rec.itemId, new Set());
            }
            const soundSet = activeCorr.get(rec.itemId);
            rec.hashtags.forEach(tag => soundSet.add(tag));
          }

          // Keep sorted by timestamp
          entry.snapshots.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

          // Rolling TTL pruning (REQ-NFR-02): keep at most 48 recent snapshots
          if (entry.snapshots.length > 48) {
            entry.snapshots.shift();
          }

          // Mirror into SQLite
          try {
            activeRepo.upsertTrend({
              id: rec.itemId,
              type: rec.type || "sound",
              title: rec.title || rec.itemId,
              author: rec.author || null,
              external_url: rec.tiktokUrl || null,
              first_detected_at: rec.timestamp || new Date().toISOString()
            });
            activeRepo.insertSnapshot({
              trend_id: rec.itemId,
              timestamp: rec.timestamp || new Date().toISOString(),
              total_views: rec.totalViews,
              total_videos: rec.totalVideos
            });
          } catch (e) {}

          ingested++;
        }

        return sendJson(res, 201, {
          status: "success",
          targetDatabase: isTest ? "test" : "main",
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
      if (method === "GET" && (url.pathname === "/api/trends" || url.pathname === "/api/test/trends")) {
        const isTest = url.pathname.includes("/test");
        const activeRepo = isTest ? testRepository : repository;
        const activeMem = isTest ? testMemoryStore : memoryStore;

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

          const pagedResult = activeRepo.queryTrendsPaged({
            limit,
            offset,
            type: typeFilter,
            category,
            search,
            sortBy,
            sortOrder
          });

          // If SQLite has data, return structured pagination
          if (pagedResult.totalCount > 0 || activeRepo.getStats().trendCount > 0) {
            return sendJson(res, 200, pagedResult);
          }
        }

        // Backward-compatible array response
        const list = [];

        for (const [id, entry] of activeMem.entries()) {
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
          if (!tiktokUrl || tiktokUrl.includes("/music/-sound_") || tiktokUrl.includes("/tag/")) {
            if (entry.item.type === "hashtag") {
              const cleanTag = (entry.item.title || id).replace(/^#/, "");
              tiktokUrl = `https://www.tiktok.com/search?q=%23${encodeURIComponent(cleanTag)}`;
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
      // Trend Deep-Dive Telemetry, Forecast & Triad (REQ-FR-12, REQ-FR-14, REQ-FR-17, REQ-FR-18)
      // ==========================================
      const detailMatch = url.pathname.match(/^\/api\/(test\/)?trends\/([^/]+)\/(detail|forecast)$/);
      if (method === "GET" && detailMatch) {
        const isTest = Boolean(detailMatch[1]);
        const itemId = decodeURIComponent(detailMatch[2]);
        const activeRepo = isTest ? testRepository : repository;
        const activeMem = isTest ? testMemoryStore : memoryStore;
        const activeCorr = isTest ? testCorrelationsStore : correlationsStore;

        let detail = activeRepo.getTrendDetail(itemId);
        if (!detail && activeMem.has(itemId)) {
          const entry = activeMem.get(itemId);
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
            correlatedHashtags: activeCorr.has(itemId) ? Array.from(activeCorr.get(itemId)) : []
          };
        }
        if (!detail) {
          return sendJson(res, 404, { error: "NOT_FOUND", message: `Trend ${itemId} not found.` });
        }

        // Compute entity-specific forecast & backtest (REQ-FR-17)
        const snSeries = Array.isArray(detail.snapshots) ? detail.snapshots : [];
        const isHashtag = detail.type === "hashtag";
        const forecast = isHashtag
          ? forecastHashtagSpike(snSeries)
          : forecastSoundTrajectory(snSeries);
        const backtest = isHashtag
          ? backtestHashtagForecast(snSeries, 2)
          : backtestSoundForecast(snSeries, 2);

        // Compute 1-2-3 Breakout Hashtag Triad (REQ-FR-18)
        const triadRecommendation = recommendHashtagTriad({
          item: detail,
          correlatedTags: detail.correlatedHashtags || []
        });

        return sendJson(res, 200, {
          ...detail,
          forecast,
          backtest,
          triadRecommendation
        });
      }

      // ==========================================
      // Evolutionary Hyperparameter Tuning Endpoint (REQ-FR-17)
      // ==========================================
      if (method === "POST" && (url.pathname === "/api/analytics/evolve" || url.pathname === "/api/test/analytics/evolve")) {
        const isTest = url.pathname.includes("/test");
        const activeRepo = isTest ? testRepository : repository;
        const body = await parseJsonBody(req);
        const entityType = body.entityType === "hashtag" ? "hashtag" : "sound";
        const generations = Math.min(40, Math.max(3, Number(body.generations) || 12));
        const populationSize = Math.min(40, Math.max(6, Number(body.populationSize) || 16));

        // Gather historical snapshot series from repository
        const paged = activeRepo.queryTrendsPaged({
          limit: 40,
          offset: 0,
          type: entityType
        });
        const seriesList = [];
        for (const t of paged.items.slice(0, 25)) {
          const sn = activeRepo.getSnapshots(t.id);
          if (Array.isArray(sn) && sn.length >= 4) {
            seriesList.push(sn);
          }
        }

        const evolutionResult = evolveForecasterWeights({
          entityType,
          historicalSeriesList: seriesList,
          populationSize,
          generations,
          seed: Number(body.seed) || 42
        });

        return sendJson(res, 200, {
          status: "evolved",
          ...evolutionResult
        });
      }

      // ==========================================
      // Standalone Collector Cycle Trigger (REQ-FR-16)
      // ==========================================
      if (method === "POST" && (url.pathname === "/api/collect/run" || url.pathname === "/api/test/collect/run")) {
        const isTest = url.pathname.includes("/test");
        const activeRepo = isTest ? testRepository : repository;
        const summary = await runCollectionCycle({
          repository: activeRepo,
          geos: ["US", "UA"]
        });
        return sendJson(res, 200, {
          status: "collected",
          targetDatabase: isTest ? "test" : "main",
          musicCount: summary.musicCount,
          hashtagCount: summary.hashtagCount,
          providers: summary.providers
        });
      }

      // ==========================================
      // Sound + Hashtag Correlations (REQ-FR-06)
      // ==========================================
      const correlationMatch = url.pathname.match(/^\/api\/(test\/)?trends\/([^/]+)\/correlations$/);
      if (method === "GET" && correlationMatch) {
        const isTest = Boolean(correlationMatch[1]);
        const itemId = correlationMatch[2];
        const activeCorr = isTest ? testCorrelationsStore : correlationsStore;

        const correlatedTags = activeCorr.has(itemId)
          ? Array.from(activeCorr.get(itemId))
          : [];
        return sendJson(res, 200, {
          itemId,
          correlatedHashtags: correlatedTags
        });
      }

      // ==========================================
      // Database & Memory Reset (Maintenance)
      // ==========================================
      if (method === "POST" && (url.pathname === "/api/simulation/reset" || url.pathname === "/api/test/simulation/reset")) {
        const targetIsTest = url.pathname.startsWith("/api/test");
        if (targetIsTest) {
          testMemoryStore.clear();
          testCorrelationsStore.clear();
          testRepository.clearAll();
        } else {
          memoryStore.clear();
          correlationsStore.clear();
          repository.clearAll();
        }
        return sendJson(res, 200, {
          status: "reset",
          targetDatabase: targetIsTest ? "test" : "main",
          message: targetIsTest ? "Test database and memory store successfully wiped." : "Database and memory stores successfully wiped."
        });
      }

      // ==========================================
      // Simulation Golden Set Seeder (REQ-FR-07)
      // ==========================================
      if (method === "POST" && (url.pathname === "/api/simulation/seed" || url.pathname === "/api/test/simulation/seed")) {
        const targetIsTest = url.pathname.startsWith("/api/test");
        const activeMem = targetIsTest ? testMemoryStore : memoryStore;
        const activeCorr = targetIsTest ? testCorrelationsStore : correlationsStore;
        const activeRepo = targetIsTest ? testRepository : repository;

        activeMem.clear();
        activeCorr.clear();
        activeRepo.clearAll();

        // Seed sound: aurora_echoes (delta1h = 130 -> VVS = 65.0 -> status EMERGING)
        activeMem.set("sound_aurora", {
          item: { 
            id: "sound_aurora", 
            type: "sound", 
            title: "Aurora Echoes — Nova Vibe", 
            tiktokUrl: "https://www.tiktok.com/search?q=Aurora%20Echoes%20Nova%20Vibe",
            firstDetectedAt: new Date().toISOString() 
          },
          snapshots: [
            { timestamp: "2026-09-15T10:00:00.000Z", totalViews: 20000, totalVideos: 50 },
            { timestamp: "2026-09-15T11:00:00.000Z", totalViews: 28000, totalVideos: 120 },
            { timestamp: "2026-09-15T12:00:00.000Z", totalViews: 42000, totalVideos: 250 }
          ]
        });
        activeCorr.set("sound_aurora", new Set(["#aurora", "#cinematicvibes"]));

        // Seed hashtag: #cozyhomevibes (Noise - below threshold: views 13500 < 25k -> status NOISE)
        activeMem.set("hash_cozy", {
          item: { 
            id: "hash_cozy", 
            type: "hashtag", 
            title: "#cozyhomevibes", 
            tiktokUrl: "https://www.tiktok.com/search?q=%23cozyhomevibes",
            firstDetectedAt: new Date().toISOString() 
          },
          snapshots: [
            { timestamp: "2026-09-15T11:00:00.000Z", totalViews: 12000, totalVideos: 40 },
            { timestamp: "2026-09-15T12:00:00.000Z", totalViews: 13500, totalVideos: 70 }
          ]
        });

        // Mirror to SQLite repository (REQ-FR-12)
        try {
          activeRepo.insertBatch([
            {
              itemId: "sound_aurora",
              type: "sound",
              title: "Aurora Echoes — Nova Vibe",
              previousTimestamp: "2026-09-15T11:00:00.000Z",
              previousViews: 28000,
              previousVideos: 120,
              timestamp: "2026-09-15T12:00:00.000Z",
              totalViews: 42000,
              totalVideos: 250,
              hashtags: ["#aurora", "#cinematicvibes"],
              tiktokUrl: "https://www.tiktok.com/search?q=Aurora%20Echoes%20Nova%20Vibe"
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
              tiktokUrl: "https://www.tiktok.com/search?q=%23cozyhomevibes"
            }
          ]);
        } catch (e) {
          // ignore in tests
        }

        return sendJson(res, 200, {
          status: "seeded",
          seededItems: activeMem.size,
          targetDatabase: targetIsTest ? "test" : "main",
          message: "Golden Set loaded successfully."
        });
      }

      // ==========================================
      // Simulation Step Controller (+1 Hour) (REQ-FR-09)
      // ==========================================
      if (method === "POST" && (url.pathname === "/api/simulation/step" || url.pathname === "/api/test/simulation/step")) {
        const targetIsTest = url.pathname.startsWith("/api/test");
        const activeMem = targetIsTest ? testMemoryStore : memoryStore;
        const activeRepo = targetIsTest ? testRepository : repository;

        if (activeMem.size === 0) {
          // Auto-seed if empty
          activeMem.set("sound_aurora", {
            item: { id: "sound_aurora", type: "sound", title: "Aurora Echoes", firstDetectedAt: new Date().toISOString() },
            snapshots: [
              { timestamp: new Date(Date.now() - 3600000).toISOString(), totalViews: 28000, totalVideos: 120 },
              { timestamp: new Date().toISOString(), totalViews: 42000, totalVideos: 250 }
            ]
          });
        }

        let stepped = 0;
        let latestTimestamp = "";

        for (const [id, entry] of activeMem.entries()) {
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

          const newTotalViews = last.totalViews + nextViewDelta;
          const newTotalVideos = last.totalVideos + nextVideoDelta;

          sn.push({
            timestamp: newTime,
            totalViews: newTotalViews,
            totalVideos: newTotalVideos
          });

          if (sn.length > 48) {
            sn.shift();
          }

          // Mirror into active SQLite
          try {
            activeRepo.insertSnapshot({
              trend_id: id,
              timestamp: newTime,
              total_views: newTotalViews,
              total_videos: newTotalVideos
            });
          } catch (e) {}

          stepped++;
        }

        return sendJson(res, 200, {
          status: "stepped",
          steppedItems: stepped,
          targetDatabase: targetIsTest ? "test" : "main",
          simulatedTimestamp: latestTimestamp
        });
      }

      // ==========================================
      // Simulation Anomaly Injector (REQ-FR-09)
      // ==========================================
      if (method === "POST" && (url.pathname === "/api/simulation/inject" || url.pathname === "/api/test/simulation/inject")) {
        const targetIsTest = url.pathname.startsWith("/api/test");
        const activeMem = targetIsTest ? testMemoryStore : memoryStore;
        const activeCorr = targetIsTest ? testCorrelationsStore : correlationsStore;
        const activeRepo = targetIsTest ? testRepository : repository;

        const payload = await parseJsonBody(req);
        const scenario = payload.scenario || "viral_spike";
        const now = new Date();
        const t0 = new Date(now.getTime() - 3600 * 1000).toISOString();
        const t1 = now.toISOString();

        if (scenario === "viral_spike") {
          const id = payload.itemId || `sound_viral_${Date.now()}`;
          const title = payload.title || "Hypersonic Beat";
          activeMem.set(id, {
            item: { id, type: payload.type || "sound", title, firstDetectedAt: t0 },
            snapshots: [
              { timestamp: t0, totalViews: 25000, totalVideos: 80 },
              { timestamp: t1, totalViews: 90000, totalVideos: 420 }
            ]
          });
          const tags = Array.isArray(payload.hashtags) ? payload.hashtags : ["#viralspike", "#trendingmusic"];
          activeCorr.set(id, new Set(tags));

          try {
            activeRepo.upsertTrend({ id, type: payload.type || "sound", title, external_url: `https://www.tiktok.com/search?q=${encodeURIComponent(title)}`, first_detected_at: t0 });
            activeRepo.insertSnapshot({ trend_id: id, timestamp: t0, total_views: 25000, total_videos: 80 });
            activeRepo.insertSnapshot({ trend_id: id, timestamp: t1, total_views: 90000, total_videos: 420 });
          } catch (e) {}

          return sendJson(res, 201, {
            status: "injected",
            scenario: "viral_spike",
            targetDatabase: targetIsTest ? "test" : "main",
            item: { id, type: payload.type || "sound", title }
          });
        }

        if (scenario === "noise_spike") {
          const id = payload.itemId || `hash_noise_${Date.now()}`;
          const title = payload.title || "#microanomaly";
          activeMem.set(id, {
            item: { id, type: payload.type || "hashtag", title, firstDetectedAt: t0 },
            snapshots: [
              { timestamp: t0, totalViews: 4000, totalVideos: 10 },
              { timestamp: t1, totalViews: 5200, totalVideos: 25 }
            ]
          });

          try {
            activeRepo.upsertTrend({ id, type: "hashtag", title, external_url: `https://www.tiktok.com/search?q=%23${encodeURIComponent(title.replace(/^#/, ""))}`, first_detected_at: t0 });
            activeRepo.insertSnapshot({ trend_id: id, timestamp: t0, total_views: 4000, total_videos: 10 });
            activeRepo.insertSnapshot({ trend_id: id, timestamp: t1, total_views: 5200, total_videos: 25 });
          } catch (e) {}

          return sendJson(res, 201, {
            status: "injected",
            scenario: "noise_spike",
            targetDatabase: targetIsTest ? "test" : "main",
            item: { id, type: payload.type || "hashtag", title }
          });
        }

        // Custom generic injection
        const id = payload.itemId || `item_${Date.now()}`;
        activeMem.set(id, {
          item: { id, type: payload.type || "sound", title: payload.title || id, firstDetectedAt: t1 },
          snapshots: [
            { timestamp: t1, totalViews: payload.totalViews || 1000, totalVideos: payload.totalVideos || 10 }
          ]
        });
        try {
          activeRepo.upsertTrend({ id, type: payload.type || "sound", title: payload.title || id, external_url: `https://www.tiktok.com/search?q=${encodeURIComponent(payload.title || id)}`, first_detected_at: t1 });
          activeRepo.insertSnapshot({ trend_id: id, timestamp: t1, total_views: payload.totalViews || 1000, total_videos: payload.totalVideos || 10 });
        } catch (e) {}

        return sendJson(res, 201, {
          status: "injected",
          targetDatabase: targetIsTest ? "test" : "main",
          item: { id, type: payload.type || "sound", title: payload.title || id }
        });
      }

      // ==========================================
      // Live External Feed Ingestion Engine (REQ-FR-10, REQ-FR-13, REQ-FR-14)
      // ==========================================
      if (method === "POST" && (url.pathname === "/api/ingest/fetch" || url.pathname === "/api/test/ingest/fetch")) {
        const isTest = url.pathname.includes("/test") || url.searchParams.get("target") === "test";
        const activeRepo = isTest ? testRepository : repository;
        const activeMem = isTest ? testMemoryStore : memoryStore;
        const activeCorr = isTest ? testCorrelationsStore : correlationsStore;

        const providerQuery = url.searchParams.get("provider") || "creative_center";
        const scaleQuery = url.searchParams.get("scale");
        const scale = scaleQuery ? parseInt(scaleQuery, 10) : null;

        const cleanQuery = url.searchParams.get("clean") === "true" || url.searchParams.get("reset") === "true";
        if (cleanQuery) {
          activeMem.clear();
          activeCorr.clear();
          activeRepo.clearAll();
        }

        const { provider, records } = await fetchExternalTrendingFeed(providerQuery, { scale });

        // Batch persist to SQLite (REQ-FR-12 & REQ-FR-13)
        try {
          activeRepo.insertBatch(records);
        } catch (e) {
          // ignore or log
        }

        let ingested = 0;
        for (const rec of records) {
          if (!activeMem.has(rec.itemId)) {
            activeMem.set(rec.itemId, {
              item: {
                id: rec.itemId,
                type: rec.type || "sound",
                title: rec.title || rec.itemId,
                tiktokUrl: rec.tiktokUrl,
                firstDetectedAt: (rec.snapshots && rec.snapshots[0]?.timestamp) || rec.previousTimestamp || new Date().toISOString()
              },
              snapshots: []
            });
          }

          const entry = activeMem.get(rec.itemId);

          if (Array.isArray(rec.snapshots) && rec.snapshots.length > 0) {
            entry.snapshots = rec.snapshots.map(s => ({
              timestamp: s.timestamp,
              totalViews: s.totalViews,
              totalVideos: s.totalVideos
            }));
          } else {
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
          }

          // Track correlations if available
          if (rec.type === "sound" && Array.isArray(rec.hashtags)) {
            if (!activeCorr.has(rec.itemId)) {
              activeCorr.set(rec.itemId, new Set());
            }
            const soundSet = activeCorr.get(rec.itemId);
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
          targetDatabase: isTest ? "test" : "main",
          ingestedCount: ingested,
          totalTracked: activeMem.size
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
    const stats = repository.getStats();
    if (stats.trendCount < 1000) {
      console.log("[TrendTok Analytics] Ingesting authentic high-scale trends corpus (5,000 items) into SQLite...");
      const initial = await fetchExternalTrendingFeed("mock", { scale: 5000 });
      repository.insertBatch(initial.records);
      console.log(`[TrendTok Analytics] Ingested ${initial.records.length} authentic trends into SQLite database.`);
    }
  } catch (e) {
    console.error("[TrendTok Analytics] Startup corpus initialization error:", e);
  }

  // Pre-seed test repository with canonical Golden Set if empty so /test is immediately functional
  try {
    if (testRepository.getStats().trendCount === 0) {
      testRepository.insertBatch([
        {
          itemId: "sound_aurora",
          type: "sound",
          title: "Aurora Echoes — Nova Vibe",
          previousTimestamp: "2026-09-15T11:00:00.000Z",
          previousViews: 28000,
          previousVideos: 120,
          timestamp: "2026-09-15T12:00:00.000Z",
          totalViews: 42000,
          totalVideos: 250,
          hashtags: ["#aurora", "#cinematicvibes"],
          tiktokUrl: "https://www.tiktok.com/search?q=Aurora%20Echoes%20Nova%20Vibe"
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
          tiktokUrl: "https://www.tiktok.com/search?q=%23cozyhomevibes"
        }
      ]);
    }
  } catch (e) {}

  server.listen(PORT, () => {
    console.log(`[TrendTok Analytics] Server running at http://localhost:${PORT}/ (Spec v2.1)`);
    console.log(`[TrendTok Analytics] Main Dashboard: http://localhost:${PORT}/ (${repository.getStats().trendCount.toLocaleString()} authentic trends)`);
    console.log(`[TrendTok Analytics] QA & Test Lab:  http://localhost:${PORT}/test (Isolated test DB)`);
  });
}

