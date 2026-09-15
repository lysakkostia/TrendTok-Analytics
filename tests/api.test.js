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
            resolve({
              statusCode: res.statusCode,
              body: data ? JSON.parse(data) : null
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
});
