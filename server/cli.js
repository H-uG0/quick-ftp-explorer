/*
 * cli.js - administration from the server's shell.
 *
 *   node server/cli.js user add <name> [--admin]    create an account
 *   node server/cli.js user passwd <name>           set a new password (ends their sessions)
 *   node server/cli.js user role <name> <admin|user>
 *   node server/cli.js user remove <name>           delete the account (ends their sessions)
 *   node server/cli.js user list
 *   node server/cli.js import <dir> [--replace]     import shortcut files (*.json), e.g.
 *                                                   legacy/config/shortcuts from the HTA
 *   node server/cli.js import - [--replace]         same, from JSON objects piped on stdin
 *
 * In Docker: docker compose exec app node server/cli.js user add alice --admin
 *            cat shortcuts/*.json | docker compose exec -T app node server/cli.js import -
 * Passwords are read without echo from a terminal, or as the first line of
 * stdin when piped. Changes apply to the running server immediately.
 */

import path from "node:path";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { loadConfig } from "./config.js";
import { createUserStore, ROLES } from "./auth.js";
import { createShortcutStore, sanitizeId } from "./store.js";
import { splitJsonObjects } from "./files.js";

const USAGE = `Usage:
  node server/cli.js user add <name> [--admin]
  node server/cli.js user passwd <name>
  node server/cli.js user role <name> <${ROLES.join("|")}>
  node server/cli.js user remove <name>
  node server/cli.js user list
  node server/cli.js import <dir | -> [--replace]`;

/* ---- input ---- */

function promptHidden(question) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    let value = "";
    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      stdout.write("\n");
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") { finish(); resolve(value); return; }
        if (ch === "\u0003") { finish(); reject(new Error("Cancelled")); return; }   // Ctrl+C
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdout.write(question);
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function readStdin() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

async function askNewPassword() {
  if (!process.stdin.isTTY) return (await readStdin()).split(/\r?\n/)[0];
  const first = await promptHidden("New password: ");
  const second = await promptHidden("Repeat it: ");
  if (first !== second) throw new Error("The two passwords differ; nothing was changed");
  return first;
}

/* ---- commands ---- */

async function userCommand(cfg, [command, ...args]) {
  const positional = args.filter((a) => !a.startsWith("--"));
  const name = positional[0];
  if (!command || (command !== "list" && !name)) throw new Error(USAGE);
  const users = createUserStore(path.join(cfg.dataDir, "users.json"));

  switch (command) {
    case "add": {
      const role = args.includes("--admin") ? "admin" : "user";
      const created = await users.add(name, await askNewPassword(), role);
      console.log(`Created ${role} account "${created}".`);
      break;
    }
    case "passwd":
      await users.setPassword(name, await askNewPassword());
      console.log(`Password changed; "${name}" is signed out everywhere.`);
      break;
    case "role":
      await users.setRole(name, positional[1]);
      console.log(`"${name}" is now ${positional[1]}.`);
      break;
    case "remove":
      await users.remove(name);
      console.log(`Removed "${name}"; their sessions have ended.`);
      break;
    case "list": {
      const all = await users.list();
      if (all.length === 0) console.log("No accounts yet.");
      for (const u of all) console.log(`${u.name}\t${u.role}`);
      break;
    }
    default:
      throw new Error(USAGE);
  }
}

async function importCommand(cfg, args) {
  const source = args.find((a) => !a.startsWith("--"));
  if (!source) throw new Error(USAGE);
  const replace = args.includes("--replace");
  const store = createShortcutStore(path.join(cfg.dataDir, "shortcuts"), { allowedHosts: cfg.ftpAllowedHosts });

  const docs = [];   // { origin, text }
  if (source === "-") {
    splitJsonObjects(await readStdin()).forEach((text, i) => docs.push({ origin: `stdin object ${i + 1}`, text }));
  } else {
    const names = (await readdir(source)).filter((n) => n.toLowerCase().endsWith(".json")).sort();
    for (const name of names) docs.push({ origin: name, text: await readFile(path.join(source, name), "utf8") });
  }

  const counts = { imported: 0, replaced: 0, skipped: 0, failed: 0 };
  for (const { origin, text } of docs) {
    try {
      const record = JSON.parse(text.replace(/^﻿/, ""));
      try {
        await store.create(record);
        counts.imported++;
      } catch (err) {
        if (err.status !== 409) throw err;
        if (!replace) {
          counts.skipped++;
          console.log(`${origin}: already exists, skipped (--replace overwrites)`);
          continue;
        }
        await store.update(sanitizeId(String(record.username).trim()), record);
        counts.replaced++;
      }
    } catch (err) {
      counts.failed++;
      console.log(`${origin}: ${err instanceof SyntaxError ? "not valid JSON" : err.message}`);
    }
  }
  const { imported, replaced, skipped, failed } = counts;
  console.log(`Imported ${imported}, replaced ${replaced}, skipped ${skipped}, failed ${failed}.`);
  if (failed) process.exitCode = 1;
}

async function main([group, ...rest]) {
  if (group !== "user" && group !== "import") throw new Error(USAGE);
  const cfg = loadConfig();
  await mkdir(cfg.dataDir, { recursive: true, mode: 0o700 });
  if (group === "user") await userCommand(cfg, rest);
  else await importCommand(cfg, rest);
}

main(process.argv.slice(2)).catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
