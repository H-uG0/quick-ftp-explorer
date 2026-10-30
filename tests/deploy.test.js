/*
 * deploy.test.js - guards on the deployment files, so a later edit can't
 * quietly leak data into the image or weaken the container: an allowlist
 * build context, no blanket COPY, a non-root user, an unpublished and
 * hardened app service, and the proxy/app keep-alive ordering.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const read = (file) => readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");

// The lines of one top-level service in docker-compose.yml (2-space indent).
function service(name) {
  const lines = read("docker-compose.yml").split("\n");
  const start = lines.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `service ${name} exists`);
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (/^ {0,2}\S/.test(line)) break;   // next service, or next top-level key
    body.push(line);
  }
  return body.join("\n");
}

test(".dockerignore is an allowlist: only package files, server/ and public/", () => {
  const rules = read(".dockerignore").split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  assert.deepEqual(rules, ["*", "!package.json", "!package-lock.json", "!server/", "!public/"]);
});

test("the Dockerfile copies only what it names and runs as a non-root user", () => {
  const dockerfile = read("Dockerfile");
  assert.match(dockerfile, /^FROM node:\d*[02468]-alpine$/m, "an even-numbered (LTS) Node.js release");
  assert.doesNotMatch(dockerfile, /^\s*(COPY|ADD)\s+\.\s/m, "no blanket COPY . or ADD .");
  assert.doesNotMatch(dockerfile, /^\s*ADD\s/m, "COPY only");
  const copies = [...dockerfile.matchAll(/^COPY (.+) \S+$/gm)].flatMap((m) => m[1].split(/\s+/));
  assert.deepEqual(copies.sort(), ["package-lock.json", "package.json", "public", "server"]);
  assert.match(dockerfile, /^USER node$/m);
  assert.match(dockerfile, /^HEALTHCHECK /m);
  assert.match(dockerfile, /^RUN apk add --no-cache ffmpeg$/m, "ffmpeg, for video conversion");
});

test("the app service is unpublished and hardened", () => {
  const app = service("app");
  assert.doesNotMatch(app, /^\s+ports:/m, "only Caddy may reach the app");
  assert.match(app, /TRUST_PROXY: "1"/);
  assert.match(app, /read_only: true/);
  assert.match(app, /cap_drop:\n\s+- ALL/);
  assert.match(app, /no-new-privileges:true/);
  assert.match(app, /- qfe-data:\/data/);
});

test("Caddy publishes HTTP(S) and needs DOMAIN", () => {
  const caddy = service("caddy");
  for (const port of ['"80:80"', '"443:443"']) assert.ok(caddy.includes(port), port);
  assert.match(caddy, /DOMAIN: \$\{DOMAIN:\?/);
  assert.match(read("deploy/Caddyfile"), /reverse_proxy app:8080/);
});

test("Caddy's upstream keep-alive is shorter than the app's", () => {
  const proxySeconds = Number(/keepalive (\d+)s/.exec(read("deploy/Caddyfile"))[1]);
  const appMs = Number(/keepAliveTimeout = ([\d_]+)/.exec(read("server/index.js"))[1].replace(/_/g, ""));
  assert.ok(proxySeconds * 1000 < appMs, `${proxySeconds}s must stay below ${appMs}ms`);
});
