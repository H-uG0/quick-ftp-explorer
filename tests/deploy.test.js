/*
 * deploy.test.js - guards on the deployment files, so a later edit can't
 * quietly leak data into the image or weaken the container: an allowlist
 * build context, no blanket COPY, a non-root user, an unpublished and
 * hardened app service, the proxy/app keep-alive ordering, and a pipeline
 * that deploys only main, only when enabled, only to a known host key, with
 * a key that can do nothing else on the server.
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

// The lines of one job in .github/workflows/ci.yml (4-space indent).
function job(name) {
  const lines = read(".github/workflows/ci.yml").split("\n");
  const start = lines.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `job ${name} exists`);
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (/^ {0,2}\S/.test(line)) break;
    body.push(line);
  }
  return body.join("\n");
}

test("the pipeline deploys only main, only when enabled, after the tests and the image", () => {
  const workflow = read(".github/workflows/ci.yml");
  assert.doesNotMatch(workflow, /pull_request_target|workflow_run/, "no trigger that runs with secrets on fork code");
  const deploy = job("deploy");
  assert.match(deploy, /needs: \[test, image\]/);
  assert.match(deploy, /vars\.DEPLOY_ENABLED == 'true'/);
  assert.match(deploy, /github\.ref == 'refs\/heads\/main'/);
  assert.match(deploy, /environment: production/);
  assert.match(deploy, /cancel-in-progress: false/, "a running deployment is never cut short");
  assert.match(deploy, /merge-base --is-ancestor "\$sha" origin\/main/);
});

test("the deploy step trusts only the pinned host key, and logs no secret", () => {
  const deploy = job("deploy");
  assert.match(deploy, /StrictHostKeyChecking=yes/);
  assert.doesNotMatch(read(".github/workflows/ci.yml"), /StrictHostKeyChecking=no|ssh-keyscan/);
  assert.match(deploy, /KNOWN_HOSTS: \$\{\{ secrets\.DEPLOY_KNOWN_HOSTS \}\}/);
  // Server details are secrets (masked in the public logs), never vars.
  for (const name of ["DEPLOY_HOST", "DEPLOY_DOMAIN", "DEPLOY_SSH_KEY"]) {
    assert.match(deploy, new RegExp(`secrets\\.${name}`), name);
    assert.doesNotMatch(deploy, new RegExp(`vars\\.${name}`), name);
  }
  assert.doesNotMatch(deploy, /(echo|cat)\b[^\n]*\$(SSH_KEY|HOST|DOMAIN)\b/, "never printed");
});

test("on the server, the CI's key can only run qfe-deploy", () => {
  const bootstrap = read("deploy/bootstrap.sh");
  assert.match(bootstrap, /command="\/usr\/local\/bin\/qfe-deploy",restrict %s/);
  assert.match(bootstrap, /install -m 0755 -o root -g root "\$APP_DIR\/deploy\/remote-deploy\.sh" \/usr\/local\/bin\/qfe-deploy/);
  const remote = read("deploy/remote-deploy.sh");
  assert.match(remote, /\^deploy\\ \(\[0-9a-f\]\{40\}\)\$/, "only a full commit id is accepted");
  assert.match(remote, /merge-base --is-ancestor "\$target" origin\/main/);
});
