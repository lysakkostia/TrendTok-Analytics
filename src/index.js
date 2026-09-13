/**
 * TrendTok Analytics - Web Service Entrypoint
 * Node.js Native HTTP Server Baseline
 */

import http from "node:http";

const PORT = process.env.PORT || 3000;

export const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "TrendTok Analytics", uptime: process.uptime() }));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    message: "TrendTok Analytics Web Service - SDD Baseline",
    endpoints: ["/health", "/api/trends/velocity"]
  }));
});

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, () => {
    console.log(`[TrendTok Analytics] Server running at http://localhost:${PORT}/`);
  });
}
