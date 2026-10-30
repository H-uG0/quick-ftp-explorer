/*
 * index.js - process entry point: load the config, start the HTTP server,
 * and shut down gracefully on SIGTERM / SIGINT (docker stop, Ctrl+C).
 */

import http from "node:http";
import { loadConfig } from "./config.js";
import { createApp } from "./routes.js";

const cfg = loadConfig();
const app = await createApp(cfg);
const server = http.createServer(app.handler);

// Outlive the reverse proxy's idle keep-alive (Caddy is set to 30 s), so the
// proxy, never Node, closes idle connections. Otherwise a request can race a
// closing socket and fail with a spurious 502.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;

server.listen(cfg.port, cfg.host, async () => {
  const { port } = server.address();
  console.log(`Quick FTP Explorer listening on http://${cfg.host}:${port} (data in ${cfg.dataDir})`);
  if ((await app.users.list()).length === 0) {
    console.log("No accounts yet. Create the first admin with: npm run cli -- user add <name> --admin");
  }
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await app.audit.flush();
    process.exit(0);
  });
  server.closeIdleConnections();
  // Don't let a long download hold the shutdown hostage.
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
