/**
 * Contract-Driven Positive and Negative Test Suite for TrendTok Mock API
 * 
 * Verifies OpenAPI 3.0.3 compliance against the isolated Mock API server.
 * Ensures zero reliance on server implementation or databases.
 * 
 * Standard: SDD Phase 4 / Lab 4 Acceptance Verification
 */

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createMockServer } from "../scripts/mock-server.js";

test("API Contract Suite: OpenAPI 3.0.3 Mock Verification (Lab 4)", async (t) => {
  const mockServer = createMockServer();

  await new Promise((resolve) => {
    mockServer.listen(0, "127.0.0.1", resolve);
  });

  const port = mockServer.address().port;

  /**
   * Helper to perform HTTP request to Mock API
   */
  function requestMock(path, options = {}) {
    return new Promise((resolve, reject) => {
      const isRawString = typeof options.rawBody === "string";
      const payload = isRawString
        ? options.rawBody
        : (options.body ? JSON.stringify(options.body) : null);

      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method: options.method || "GET",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
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
      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  t.after(() => {
    return new Promise(resolve => mockServer.close(resolve));
  });

  // =========================================================================
  // POSITIVE TEST SCENARIOS
  // =========================================================================

  await t.test("POS-01: GET /api/v1/health returns 200 and matches HealthResponse schema", async () => {
    const res = await requestMock("/api/v1/health");
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "ok");
    assert.equal(res.body.service, "TrendTok Analytics");
    assert.equal(res.body.specification, "SRS-TRENDTOK-2026-V2");
    assert.ok(typeof res.body.uptimeSeconds === "number");
    assert.ok(res.body.timestamp);
    assert.equal(res.headers["x-powered-by"], "TrendTok-OpenAPI-Mock-Engine");
  });

  await t.test("POS-02: POST /api/v1/snapshots ingests single valid snapshot (201 Created)", async () => {
    const payload = {
      itemId: "sound_aurora",
      title: "Aurora Echoes",
      type: "sound",
      totalViews: 45000,
      totalVideos: 480,
      timestamp: "2026-10-10T14:00:00.000Z"
    };
    const res = await requestMock("/api/v1/snapshots", { method: "POST", body: payload });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.status, "ingested");
    assert.equal(res.body.count, 1);
    assert.ok(res.body.timestamp);
  });

  await t.test("POS-03: POST /api/v1/snapshots ingests multi-snapshot batch (201 Created)", async () => {
    const payload = {
      snapshots: [
        {
          itemId: "sound_aurora",
          title: "Aurora Echoes",
          type: "sound",
          totalViews: 45000,
          totalVideos: 480,
          timestamp: "2026-10-10T14:00:00.000Z"
        },
        {
          itemId: "hash_cozy",
          title: "#cozyvibes",
          type: "hashtag",
          totalViews: 12500,
          totalVideos: 65,
          timestamp: "2026-10-10T14:00:00.000Z"
        }
      ]
    };
    const res = await requestMock("/api/v1/snapshots", { method: "POST", body: payload });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.status, "ingested");
    assert.equal(res.body.count, 2);
  });

  await t.test("POS-04: GET /api/v1/trends returns paginated list with valid pagination schema", async () => {
    const res = await requestMock("/api/v1/trends?page=1&limit=25");
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body.items));
    assert.ok(res.body.pagination);
    assert.equal(res.body.pagination.page, 1);
    assert.equal(res.body.pagination.limit, 25);
    const firstItem = res.body.items[0];
    assert.ok(firstItem.id);
    assert.ok(typeof firstItem.viralityScore === "number");
    assert.ok(firstItem.tiktokUrl);
  });

  await t.test("POS-05: GET /api/v1/trends/emerging returns exclusively emerging items (200 OK)", async () => {
    const res = await requestMock("/api/v1/trends/emerging");
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body));
    for (const item of res.body) {
      assert.equal(item.lifecycleStatus, "EMERGING");
      assert.ok(item.viralityScore >= 50.0);
    }
  });

  await t.test("POS-06: GET /api/v1/trends/:id returns detailed entity with history timeseries", async () => {
    const res = await requestMock("/api/v1/trends/sound_aurora");
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.id, "sound_aurora");
    assert.ok(Array.isArray(res.body.history));
    assert.ok(res.body.tiktokUrl.startsWith("https://www.tiktok.com/"));
  });

  await t.test("POS-07: GET /api/v1/trends/:id/correlations returns hashtag association list", async () => {
    const res = await requestMock("/api/v1/trends/sound_aurora/correlations");
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.itemId, "sound_aurora");
    assert.ok(Array.isArray(res.body.correlatedHashtags));
    assert.ok(res.body.confidenceScore >= 0.0);
  });

  await t.test("POS-08: GET /api/v1/trends/:id/forecast returns trajectory calculus & 1-2-3 triad", async () => {
    const res = await requestMock("/api/v1/trends/sound_aurora/forecast");
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.trendId, "sound_aurora");
    assert.ok(res.body.model);
    assert.ok(typeof res.body.hoursToPeak === "number");
    assert.ok(Array.isArray(res.body.recommendedTriad));
    assert.equal(res.body.recommendedTriad.length, 3);
  });

  await t.test("POS-09: POST /api/v1/simulation/seed loads deterministic Golden Set", async () => {
    const res = await requestMock("/api/v1/simulation/seed", { method: "POST" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "seeded");
    assert.equal(res.body.dataset, "Golden Set v2.0");
  });

  await t.test("POS-10: POST /api/v1/simulation/step advances timeline by 1 hour", async () => {
    const res = await requestMock("/api/v1/simulation/step", { method: "POST" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "stepped");
    assert.equal(res.body.stepHours, 1);
  });

  await t.test("POS-11: POST /api/v1/ingest/fetch triggers external feed ingestion", async () => {
    const res = await requestMock("/api/v1/ingest/fetch?scale=500&provider=creative_center", { method: "POST" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "success");
    assert.equal(res.body.ingestedCount, 500);
  });

  // =========================================================================
  // NEGATIVE TEST SCENARIOS (UNIFIED ERROR MODEL VERIFICATION)
  // =========================================================================

  await t.test("NEG-01: POST /api/v1/snapshots with missing itemId returns 400 VALIDATION_FAILED", async () => {
    const badPayload = { totalViews: 100, totalVideos: 5 };
    const res = await requestMock("/api/v1/snapshots", { method: "POST", body: badPayload });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "BAD_REQUEST");
    assert.equal(res.body.code, "VALIDATION_FAILED");
    assert.equal(res.body.statusCode, 400);
    assert.ok(res.body.details.some(d => d.field === "itemId"));
  });

  await t.test("NEG-02: POST /api/v1/snapshots with negative totalViews returns 400 VALIDATION_FAILED", async () => {
    const badPayload = { itemId: "sound_bad", totalViews: -250, totalVideos: 10 };
    const res = await requestMock("/api/v1/snapshots", { method: "POST", body: badPayload });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, "VALIDATION_FAILED");
    assert.ok(res.body.details.some(d => d.field === "totalViews"));
  });

  await t.test("NEG-03: POST /api/v1/snapshots with malformed raw JSON returns 400 MALFORMED_JSON", async () => {
    const res = await requestMock("/api/v1/snapshots", { method: "POST", rawBody: "{ itemId: broken_json... " });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, "MALFORMED_JSON");
  });

  await t.test("NEG-04: GET /api/v1/trends/:id with unknown ID returns 404 TREND_NOT_FOUND", async () => {
    const res = await requestMock("/api/v1/trends/unknown_nonexistent");
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, "NOT_FOUND");
    assert.equal(res.body.code, "TREND_NOT_FOUND");
    assert.equal(res.body.statusCode, 404);
  });

  await t.test("NEG-05: GET /api/v1/trends with negative limit returns 400 INVALID_QUERY_PARAMETER", async () => {
    const res = await requestMock("/api/v1/trends?limit=-5");
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, "INVALID_QUERY_PARAMETER");
    assert.ok(res.body.details.some(d => d.field === "limit"));
  });

  await t.test("NEG-06: GET /api/v1/trends with invalid status enum returns 400 INVALID_QUERY_PARAMETER", async () => {
    const res = await requestMock("/api/v1/trends?status=SUPER_VIRAL");
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, "INVALID_QUERY_PARAMETER");
    assert.ok(res.body.details.some(d => d.field === "status"));
  });

  await t.test("NEG-07: DELETE /api/v1/trends returns 405 METHOD_NOT_ALLOWED", async () => {
    const res = await requestMock("/api/v1/trends", { method: "DELETE" });
    assert.equal(res.statusCode, 405);
    assert.equal(res.body.error, "METHOD_NOT_ALLOWED");
  });

  await t.test("NEG-08: GET /api/v1/unregistered_route returns 404 ROUTE_NOT_FOUND", async () => {
    const res = await requestMock("/api/v1/unregistered_route");
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.code, "ROUTE_NOT_FOUND");
  });
});
