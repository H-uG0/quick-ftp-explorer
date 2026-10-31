/*
 * deploy-script.test.js - deploy/remote-deploy.sh (qfe-deploy on the
 * server), run by bash against a throwaway git "origin" and a fake docker
 * that records its calls: it deploys commits of main, refuses anything
 * else without touching the checkout, and rolls back when the new version
 * doesn't come up. Linux and macOS only (CI runs it); skipped on Windows,
 * where "bash" may be WSL's and flock doesn't exist.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const SCRIPT = path.join(import.meta.dirname, "..", "deploy", "remote-deploy.sh");
const skip = process.platform === "win32" ? "needs a POSIX bash and flock" : false;

describe("qfe-deploy (deploy/remote-deploy.sh)", { skip }, () => {
  let dir, app, origin, bin, calls, log, commits;

  const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  const head = () => git(app, "rev-parse", "HEAD");

  function commit(work, message) {
    writeFileSync(path.join(work, "file.txt"), message);
    git(work, "add", "file.txt");
    git(work, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", message);
    return git(work, "rev-parse", "HEAD");
  }

  // Runs the script as sshd would: the client's request in SSH_ORIGINAL_COMMAND.
  function run(request, extraEnv = {}) {
    writeFileSync(calls, "");
    const result = spawnSync("bash", [SCRIPT], {
      encoding: "utf8",
      env: {
        ...process.env, ...extraEnv,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        QFE_APP_DIR: app, QFE_DEPLOY_LOG: log,
        ...(request === undefined ? {} : { SSH_ORIGINAL_COMMAND: request }),
      },
    });
    return { ...result, docker: readFileSync(calls, "utf8").trim().split("\n").filter(Boolean) };
  }

  before(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "qfe-deploy-"));
    origin = path.join(dir, "origin.git");
    app = path.join(dir, "app");
    bin = path.join(dir, "bin");
    calls = path.join(dir, "docker-calls");
    log = path.join(dir, "deploys.log");
    const work = path.join(dir, "work");

    git(dir, "init", "-q", "--bare", "-b", "main", origin);
    git(dir, "clone", "-q", origin, work);
    git(work, "checkout", "-q", "-b", "main");
    commits = { a: commit(work, "a") };
    commits.b = commit(work, "b");
    git(work, "push", "-q", "origin", "main");
    git(work, "checkout", "-q", "-b", "feature");
    commits.feature = commit(work, "feature");
    git(work, "push", "-q", "origin", "feature");
    git(dir, "clone", "-q", "--branch", "main", origin, app);
    git(app, "-c", "advice.detachedHead=false", "checkout", "-q", "--detach", commits.a);

    // docker: records "<checked-out commit> <args>"; `compose up` fails while
    // FAIL_UP_AT is checked out. flock: always gets the lock.
    execFileSync("mkdir", ["-p", bin]);
    writeFileSync(path.join(bin, "docker"), [
      "#!/usr/bin/env bash",
      `at="$(git -C "$QFE_APP_DIR" rev-parse HEAD)"`,
      `echo "$at $*" >> "${calls}"`,
      `[[ "$*" == "compose up"* && "$at" == "\${FAIL_UP_AT:-none}" ]] && exit 1`,
      "exit 0",
    ].join("\n") + "\n");
    writeFileSync(path.join(bin, "flock"), "#!/bin/sh\nexit 0\n");
    chmodSync(path.join(bin, "docker"), 0o755);
    chmodSync(path.join(bin, "flock"), 0o755);
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test("deploys a commit of main: checkout, pull, build, up", () => {
    const r = run(`deploy ${commits.b}`);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(head(), commits.b);
    assert.deepEqual(r.docker.map((c) => c.split(" ").slice(1, 3).join(" ")),
      ["compose pull", "compose build", "compose up", "image prune"]);
    assert.ok(r.docker.every((c) => c.startsWith(commits.b)), "docker ran on the new checkout");
    assert.match(readFileSync(log, "utf8"), new RegExp(`deployed ${commits.b}`));
  });

  test("refuses anything but \"deploy <commit of main>\" or \"status\", touching nothing", () => {
    const before = head();
    for (const request of [undefined, "", "bash", "rm -rf /", `deploy ${commits.a}; id`, "deploy main",
      `deploy ${commits.a.slice(0, 12)}`, `deploy ${commits.a.toUpperCase()}`, `deploy ${commits.feature}`,
      `deploy ${"0".repeat(40)}`]) {
      const r = run(request);
      assert.equal(r.status, 2, `${JSON.stringify(request)} -> ${r.status} ${r.stderr}`);
      assert.deepEqual(r.docker, [], `${JSON.stringify(request)} ran docker`);
      assert.equal(head(), before);
    }
  });

  test("status prints the deployed commit", () => {
    const r = run("status");
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, new RegExp(`commit ${head()}`));
  });

  test("a version that doesn't come up is rolled back", () => {
    const r = run(`deploy ${commits.a}`, { FAIL_UP_AT: commits.a });
    assert.equal(r.status, 1);
    assert.equal(head(), commits.b, "back on the previous commit");
    assert.ok(r.docker.some((c) => c.startsWith(`${commits.b} compose up`)), "restarted the previous version");
    assert.match(readFileSync(log, "utf8"), /failed; rolling back/);
  });
});
