import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createServer } from "../src/index.js";

test("API Suite: Ingestion, Queries, and Golden Set Simulation", async (t) => {
  const testServer = createServer();

  await new Promise((resolve) => {
    testServer.listen(0, "127.0.0.1", resolve);
  });

  const port = testServer.address().port;

  function makeRequest(path, options = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method: options.method || "GET",
          headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
          }
        },
        res => {
          let data = "";
          res.on("data", chunk => { data += chunk; });
          res.on("end", () => {
            let parsed = null;
            try {
              parsed = data ? JSON.parse(data) : null;
            } catch {
              parsed = null;
            }
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: parsed,
              rawBody: data
            });
          });
        }
      );
      req.on("error", reject);
      if (options.body) {
        req.write(JSON.stringify(options.body));
      }
      req.end();
    });
  }

  t.after(() => {
    return new Promise(resolve => testServer.close(resolve));
  });

  await t.test("GET / returns API discovery catalog and metadata", async () => {
    const res = await makeRequest("/");
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.service, "TrendTok Analytics");
    assert.equal(res.body.specification, "SRS-TRENDTOK-2026-V2");
    assert.ok(res.body.endpoints["GET /api/trends"]);
  });

  await t.test("GET /api/health returns valid telemetry and spec version", async () => {
    const res = await makeRequest("/api/health");
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "ok");
    assert.equal(res.body.specification, "SRS-TRENDTOK-2026-V2");
  });

  await t.test("POST /api/simulation/seed loads canonical Golden Set", async () => {
    const res = await makeRequest("/api/simulation/seed", { method: "POST" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "seeded");
    assert.equal(res.body.seededItems, 2);
  });

  await t.test("GET /api/trends/emerging filters out NOISE and returns EMERGING sounds", async () => {
    const res = await makeRequest("/api/trends/emerging");
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body));
    const ids = res.body.map(item => item.id);
    assert.ok(ids.includes("sound_aurora"));
    assert.ok(!ids.includes("hash_cozy"));
  });

  await t.test("GET /api/trends/:id/correlations returns associated hashtags", async () => {
    const res = await makeRequest("/api/trends/sound_aurora/correlations");
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.itemId, "sound_aurora");
    assert.ok(res.body.correlatedHashtags.includes("#aurora"));
  });

  await t.test("POST /api/snapshots validates incoming schema (fail-fast on malformed payload)", async () => {
    const badRes = await makeRequest("/api/snapshots", {
      method: "POST",
      body: { totalViews: 500 }
    });
    assert.equal(badRes.statusCode, 400);
    assert.equal(badRes.body.error, "VALIDATION_ERROR");
  });

  await t.test("POST /api/snapshots successfully ingests valid snapshot", async () => {
    const goodRes = await makeRequest("/api/snapshots", {
      method: "POST",
      body: {
        itemId: "sound_future_rave",
        type: "sound",
        title: "Future Rave 2026",
        totalViews: 65000,
        totalVideos: 450,
        hashtags: ["#futurerave", "#edm"]
      }
    });
    assert.equal(goodRes.statusCode, 201);
    assert.equal(goodRes.body.status, "success");
    assert.equal(goodRes.body.ingestedCount, 1);
  });

  // ==========================================
  // REQ-FR-08: Interactive Web Dashboard (UI)
  // ==========================================
  await t.test("GET / with Accept text/html serves Web Dashboard HTML (REQ-FR-08)", async () => {
    const res = await makeRequest("/", {
      headers: { Accept: "text/html,application/xhtml+xml" }
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.headers["content-type"].includes("text/html"));
    assert.ok(res.rawBody.includes("TrendTok Analytics"));
    assert.ok(res.rawBody.includes("id=\"leaderboard\""));
  });

  await t.test("GET /dashboard.css serves dashboard stylesheets (REQ-FR-08)", async () => {
    const res = await makeRequest("/dashboard.css");
    assert.equal(res.statusCode, 200);
    assert.ok(res.headers["content-type"].includes("text/css"));
    assert.ok(res.rawBody.includes("--bg-primary"));
  });

  await t.test("GET /dashboard.js serves client application script (REQ-FR-08)", async () => {
    const res = await makeRequest("/dashboard.js");
    assert.equal(res.statusCode, 200);
    assert.ok(res.headers["content-type"].includes("javascript"));
    assert.ok(res.rawBody.includes("loadDashboard"));
  });

  // ==========================================
  // REQ-FR-09: Simulation Controller
  // ==========================================
  await t.test("POST /api/simulation/step advances simulation time by 1 hour (REQ-FR-09)", async () => {
    const res = await makeRequest("/api/simulation/step", { method: "POST" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "stepped");
    assert.ok(res.body.steppedItems >= 1);
    assert.ok(res.body.simulatedTimestamp);
  });

  await t.test("POST /api/simulation/inject creates custom anomaly trend (REQ-FR-09)", async () => {
    const res = await makeRequest("/api/simulation/inject", {
      method: "POST",
      body: {
        scenario: "viral_spike",
        itemId: "sound_hypersonic",
        type: "sound",
        title: "Hypersonic Beat"
      }
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.status, "injected");
    assert.equal(res.body.item.id, "sound_hypersonic");
  });

  await t.test("POST /api/simulation/reset wipes database and memory stores", async () => {
    const res = await makeRequest("/api/simulation/reset", { method: "POST" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "reset");
  });

  // ==========================================
  // REQ-FR-10 & REQ-FR-13: Pluggable & High-Scale Ingestion
  // ==========================================
  await t.test("POST /api/ingest/fetch ingests external trending tracks (REQ-FR-10)", async () => {
    const res = await makeRequest("/api/ingest/fetch?provider=mock", { method: "POST" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "success");
    assert.equal(res.body.provider, "mock");
    assert.ok(res.body.ingestedCount >= 3);
  });

  await t.test("POST /api/ingest/fetch?scale=1000 scales corpus to 1,000 items (REQ-FR-13)", async () => {
    const res = await makeRequest("/api/ingest/fetch?provider=mock&scale=1000", { method: "POST" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "success");
    assert.equal(res.body.ingestedCount, 1000);
  });

  // ==========================================
  // REQ-FR-12 & REQ-FR-14: SQLite Trend Detail & TikTok Deep Links
  // ==========================================
  await t.test("GET /api/trends/:id/detail returns full timeseries and TikTok URL (REQ-FR-12, REQ-FR-14)", async () => {
    const res = await makeRequest("/api/trends/sound_espresso/detail");
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.id, "sound_espresso");
    assert.ok(res.body.tiktokUrl.includes("tiktok.com"));
    assert.ok(Array.isArray(res.body.snapshots));
    assert.ok(res.body.snapshots.length >= 1);
  });

  // ==========================================
  // REQ-FR-15: Paginated Trends Query & Categories
  // ==========================================
  await t.test("GET /api/trends?limit=25&page=1 returns structured pagination (REQ-FR-15)", async () => {
    const res = await makeRequest("/api/trends?limit=25&page=1");
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.items, "Should have items array");
    assert.equal(res.body.items.length, 25);
    assert.equal(res.body.page, 1);
    assert.equal(res.body.limit, 25);
    assert.ok(res.body.totalCount >= 1000);
    assert.ok(res.body.totalPages >= 40);
  });

  await t.test("GET /api/trends supports multi-column sorting (REQ-FR-15)", async () => {
    const resVel = await makeRequest("/api/trends?limit=10&page=1&sortBy=velocity&sortOrder=desc");
    assert.equal(resVel.statusCode, 200);
    assert.ok(resVel.body.items[0].hourlyVelocity >= resVel.body.items[1].hourlyVelocity);

    const resTitle = await makeRequest("/api/trends?limit=10&page=1&sortBy=title&sortOrder=asc");
    assert.equal(resTitle.statusCode, 200);
    assert.ok(resTitle.body.items[0].title.localeCompare(resTitle.body.items[1].title) <= 0);
  });
});

