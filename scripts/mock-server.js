/**
 * Standalone OpenAPI 3.0.3 Mock API Server for TrendTok Analytics
 * 
 * Implements strict contract-driven simulation WITHOUT server business implementation.
 * Zero database, zero analytical calculus imports.
 * Purely serves and validates request/response contracts from spec/openapi.json.
 * 
 * Standard: OpenAPI v3.0.3 / SDD API-First Methodology (Lab 4)
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OPENAPI_PATH = path.join(__dirname, "..", "spec", "openapi.json");

if (!fs.existsSync(OPENAPI_PATH)) {
  throw new Error(`OpenAPI JSON spec missing. Run scripts/validate-openapi.js first.`);
}

const spec = JSON.parse(fs.readFileSync(OPENAPI_PATH, "utf8"));
const schemas = spec.components?.schemas || {};

/**
 * Builds standard RFC 7807/9457 compliant error response.
 * @param {number} statusCode
 * @param {string} error
 * @param {string} code
 * @param {string} message
 * @param {string} pathUrl
 * @param {Array<Object>} details
 * @returns {Object}
 */
export function buildErrorResponse(statusCode, error, code, message, pathUrl, details = []) {
  return {
    error,
    code,
    message,
    statusCode,
    timestamp: new Date().toISOString(),
    path: pathUrl,
    details
  };
}

/**
 * Parses JSON request body.
 * @param {http.IncomingMessage} req
 * @returns {Promise<Object>}
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; });
    req.on("end", () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/**
 * Sends JSON HTTP response.
 * @param {http.ServerResponse} res
 * @param {number} statusCode
 * @param {Object} data
 */
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "X-Powered-By": "TrendTok-OpenAPI-Mock-Engine",
    "X-API-Contract-Version": spec.info.version
  });
  res.end(JSON.stringify(data, null, 2));
}

/**
 * Creates the Contract-Driven Mock Server.
 * @returns {http.Server}
 */
export function createMockServer() {
  return http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    let pathname = parsedUrl.pathname;
    const method = req.method.toUpperCase();

    // Strip optional /api/v1 or /api prefix for contract matching
    let routePath = pathname;
    if (routePath.startsWith("/api/v1")) {
      routePath = routePath.replace("/api/v1", "");
    } else if (routePath.startsWith("/api")) {
      routePath = routePath.replace("/api", "");
    }

    if (!routePath.startsWith("/")) routePath = "/" + routePath;

    // 1. Health Endpoint (GET /health)
    if (routePath === "/health" || routePath === "") {
      if (method !== "GET") {
        return sendJson(res, 405, buildErrorResponse(405, "METHOD_NOT_ALLOWED", "METHOD_NOT_ALLOWED", `Method ${method} not allowed for /health`, pathname));
      }
      const example = spec.paths["/health"].get.responses["200"].content["application/json"].example;
      return sendJson(res, 200, {
        ...example,
        timestamp: new Date().toISOString()
      });
    }

    // 2. Snapshots Ingestion (POST /snapshots)
    if (routePath === "/snapshots") {
      if (method !== "POST") {
        return sendJson(res, 405, buildErrorResponse(405, "METHOD_NOT_ALLOWED", "METHOD_NOT_ALLOWED", `Method ${method} not allowed for /snapshots`, pathname));
      }

      let body;
      try {
        body = await parseBody(req);
      } catch (parseErr) {
        return sendJson(res, 400, buildErrorResponse(400, "BAD_REQUEST", "MALFORMED_JSON", "Syntax error in incoming JSON body payload", pathname, [
          { field: "body", issue: parseErr.message }
        ]));
      }

      // Schema contract validation
      const items = Array.isArray(body.snapshots) ? body.snapshots : [body];
      const validationDetails = [];

      if (!body || (typeof body !== "object") || Object.keys(body).length === 0) {
        validationDetails.push({ field: "body", issue: "Request payload cannot be empty" });
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const prefix = items.length > 1 ? `snapshots[${i}].` : "";

        if (!item.itemId || typeof item.itemId !== "string" || item.itemId.trim() === "") {
          validationDetails.push({ field: `${prefix}itemId`, issue: "Field 'itemId' is required and must be a non-empty string" });
        }
        if (item.totalViews === undefined || typeof item.totalViews !== "number" || item.totalViews < 0) {
          validationDetails.push({ field: `${prefix}totalViews`, issue: "Field 'totalViews' must be a non-negative integer (>= 0)" });
        }
        if (item.totalVideos === undefined || typeof item.totalVideos !== "number" || item.totalVideos < 0) {
          validationDetails.push({ field: `${prefix}totalVideos`, issue: "Field 'totalVideos' must be a non-negative integer (>= 0)" });
        }
        if (item.timestamp && isNaN(Date.parse(item.timestamp))) {
          validationDetails.push({ field: `${prefix}timestamp`, issue: "Field 'timestamp' must be a valid ISO-8601 date string" });
        }
      }

      if (validationDetails.length > 0) {
        return sendJson(res, 400, buildErrorResponse(
          400,
          "BAD_REQUEST",
          "VALIDATION_FAILED",
          "Snapshot payload does not conform to OpenAPI MetricSnapshot contract schema",
          pathname,
          validationDetails
        ));
      }

      const responseExample = spec.paths["/snapshots"].post.responses["201"].content["application/json"].example;
      return sendJson(res, 201, {
        ...responseExample,
        count: items.length,
        timestamp: new Date().toISOString()
      });
    }

    // 3. Emerging Trends Canonical Query (GET /trends/emerging)
    if (routePath === "/trends/emerging") {
      if (method !== "GET") {
        return sendJson(res, 405, buildErrorResponse(405, "METHOD_NOT_ALLOWED", "METHOD_NOT_ALLOWED", `Method ${method} not allowed for /trends/emerging`, pathname));
      }
      const example = spec.paths["/trends/emerging"].get.responses["200"].content["application/json"].example;
      return sendJson(res, 200, example);
    }

    // 4. Trends List (GET /trends)
    if (routePath === "/trends") {
      if (method !== "GET") {
        return sendJson(res, 405, buildErrorResponse(405, "METHOD_NOT_ALLOWED", "METHOD_NOT_ALLOWED", `Method ${method} not allowed for /trends`, pathname));
      }

      const limitParam = parsedUrl.searchParams.get("limit");
      const pageParam = parsedUrl.searchParams.get("page");
      const statusParam = parsedUrl.searchParams.get("status");

      // Validate query params against contract
      if (limitParam !== null) {
        const limit = Number(limitParam);
        if (isNaN(limit) || limit < 1 || ![10, 25, 50, 100].includes(limit)) {
          return sendJson(res, 400, buildErrorResponse(
            400,
            "BAD_REQUEST",
            "INVALID_QUERY_PARAMETER",
            "Parameter 'limit' must be one of allowed enum values [10, 25, 50, 100]",
            pathname,
            [{ field: "limit", issue: `Invalid limit value: ${limitParam}` }]
          ));
        }
      }

      if (pageParam !== null) {
        const page = Number(pageParam);
        if (isNaN(page) || page < 1) {
          return sendJson(res, 400, buildErrorResponse(
            400,
            "BAD_REQUEST",
            "INVALID_QUERY_PARAMETER",
            "Parameter 'page' must be a positive integer >= 1",
            pathname,
            [{ field: "page", issue: `Invalid page value: ${pageParam}` }]
          ));
        }
      }

      if (statusParam !== null) {
        const validStatuses = ["NOISE", "EMERGING", "VIRAL", "SATURATED", "DECAYING"];
        if (!validStatuses.includes(statusParam)) {
          return sendJson(res, 400, buildErrorResponse(
            400,
            "BAD_REQUEST",
            "INVALID_QUERY_PARAMETER",
            `Parameter 'status' must be one of allowed enum values [${validStatuses.join(", ")}]`,
            pathname,
            [{ field: "status", issue: `Invalid lifecycle status: ${statusParam}` }]
          ));
        }
      }

      const example = spec.paths["/trends"].get.responses["200"].content["application/json"].example;
      return sendJson(res, 200, example);
    }

    // 5. Dynamic Sub-resource matching (/trends/{id}...)
    const trendDetailMatch = routePath.match(/^\/trends\/([a-zA-Z0-9_\-#]+)$/);
    if (trendDetailMatch) {
      if (method !== "GET") {
        return sendJson(res, 405, buildErrorResponse(405, "METHOD_NOT_ALLOWED", "METHOD_NOT_ALLOWED", `Method ${method} not allowed`, pathname));
      }

      const itemId = decodeURIComponent(trendDetailMatch[1]);
      if (itemId === "unknown" || itemId.includes("not_found") || itemId.includes("unknown")) {
        return sendJson(res, 404, buildErrorResponse(
          404,
          "NOT_FOUND",
          "TREND_NOT_FOUND",
          `Trend item with ID '${itemId}' does not exist in repository`,
          pathname
        ));
      }

      const example = spec.paths["/trends/{id}"].get.responses["200"].content["application/json"].example;
      return sendJson(res, 200, {
        ...example,
        id: itemId
      });
    }

    const correlationsMatch = routePath.match(/^\/trends\/([a-zA-Z0-9_\-#]+)\/correlations$/);
    if (correlationsMatch) {
      if (method !== "GET") {
        return sendJson(res, 405, buildErrorResponse(405, "METHOD_NOT_ALLOWED", "METHOD_NOT_ALLOWED", `Method ${method} not allowed`, pathname));
      }
      const itemId = decodeURIComponent(correlationsMatch[1]);
      if (itemId.includes("unknown") || itemId.includes("not_found")) {
        return sendJson(res, 404, buildErrorResponse(404, "NOT_FOUND", "TREND_NOT_FOUND", `Trend item '${itemId}' not found`, pathname));
      }
      const example = spec.paths["/trends/{id}/correlations"].get.responses["200"].content["application/json"].example;
      return sendJson(res, 200, {
        ...example,
        itemId
      });
    }

    const forecastMatch = routePath.match(/^\/trends\/([a-zA-Z0-9_\-#]+)\/forecast$/);
    if (forecastMatch) {
      if (method !== "GET") {
        return sendJson(res, 405, buildErrorResponse(405, "METHOD_NOT_ALLOWED", "METHOD_NOT_ALLOWED", `Method ${method} not allowed`, pathname));
      }
      const itemId = decodeURIComponent(forecastMatch[1]);
      if (itemId.includes("unknown") || itemId.includes("not_found")) {
        return sendJson(res, 404, buildErrorResponse(404, "NOT_FOUND", "TREND_NOT_FOUND", `Trend item '${itemId}' not found`, pathname));
      }
      const example = spec.paths["/trends/{id}/forecast"].get.responses["200"].content["application/json"].example;
      return sendJson(res, 200, {
        ...example,
        trendId: itemId
      });
    }

    // 6. Simulation Endpoints
    if (routePath === "/simulation/seed") {
      if (method !== "POST") {
        return sendJson(res, 405, buildErrorResponse(405, "METHOD_NOT_ALLOWED", "METHOD_NOT_ALLOWED", `Method ${method} not allowed`, pathname));
      }
      const example = spec.paths["/simulation/seed"].post.responses["200"].content["application/json"].example;
      return sendJson(res, 200, example);
    }

    if (routePath === "/simulation/step") {
      if (method !== "POST") {
        return sendJson(res, 405, buildErrorResponse(405, "METHOD_NOT_ALLOWED", "METHOD_NOT_ALLOWED", `Method ${method} not allowed`, pathname));
      }
      const example = spec.paths["/simulation/step"].post.responses["200"].content["application/json"].example;
      return sendJson(res, 200, example);
    }

    if (routePath === "/simulation/reset") {
      if (method !== "POST") {
        return sendJson(res, 405, buildErrorResponse(405, "METHOD_NOT_ALLOWED", "METHOD_NOT_ALLOWED", `Method ${method} not allowed`, pathname));
      }
      const example = spec.paths["/simulation/reset"].post.responses["200"].content["application/json"].example;
      return sendJson(res, 200, example || { status: "reset", message: "Simulation stores cleared" });
    }

    if (routePath === "/ingest/fetch") {
      if (method !== "POST") {
        return sendJson(res, 405, buildErrorResponse(405, "METHOD_NOT_ALLOWED", "METHOD_NOT_ALLOWED", `Method ${method} not allowed`, pathname));
      }
      const provider = parsedUrl.searchParams.get("provider") || "creative_center";
      const scale = Number(parsedUrl.searchParams.get("scale") || "100");

      if (isNaN(scale) || scale < 10 || scale > 5000) {
        return sendJson(res, 400, buildErrorResponse(
          400,
          "BAD_REQUEST",
          "INVALID_QUERY_PARAMETER",
          "Query parameter 'scale' must be an integer between 10 and 5000",
          pathname,
          [{ field: "scale", issue: `Invalid scale value: ${scale}` }]
        ));
      }

      return sendJson(res, 200, {
        status: "success",
        provider,
        ingestedCount: scale,
        durationMs: 45.2
      });
    }

    // Default 404 Handler for Unrecognized Contract Routes
    return sendJson(res, 404, buildErrorResponse(
      404,
      "NOT_FOUND",
      "ROUTE_NOT_FOUND",
      `Resource path '${pathname}' is not defined in TrendTok OpenAPI specification`,
      pathname
    ));
  });
}

// Standalone execution entrypoint
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const PORT = process.env.MOCK_PORT || 4010;
  const server = createMockServer();
  server.listen(PORT, "127.0.0.1", () => {
    console.log("============================================================");
    console.log(`🚀 [MOCK API] TrendTok OpenAPI Mock Server Running`);
    console.log(`📡 URL: http://127.0.0.1:${PORT}/api/v1`);
    console.log(`📄 Specification: spec/openapi.yaml (v${spec.info.version})`);
    console.log(`🛡️ Contract Mode: Pure Mock (Zero Database, Zero Calc Modules)`);
    console.log("============================================================");
  });
}
