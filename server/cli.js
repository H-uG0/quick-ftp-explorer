/*
 * cli.js - account administration, run on the server.
 *
 *   node server/cli.js user add <name> [--admin]    create an account
 *   node server/cli.js user passwd <name>           set a new password (ends their sessions)
 *   node server/cli.js user role <name> <admin|user>
 *   node server/cli.js user remove <name>           delete the account (ends their sessions)
 *   node server/cli.js user list
 *
 * In Docker: docker compose exec app node server/cli.js user add alice --admin
 * Passwords are read without echo from a terminal, or as the first line of
 * stdin when piped. Changes apply to the running server immediately.
 */

import path from "node:path";
import { mkdir } from "node:fs/promises";
import { loadConfig } from "./config.js";
import { createUserStore, ROLES } from "./auth.js";

const USAGE = `Usage:
  node server/cli.js user add <name> [--admin]
  node server/cli.js user passwd <name>
  node server/cli.js user role <name> <${ROLES.join("|")}>
  node server/cli.js user remove <name>
  node server/cli.js user list`;

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

async function readFirstStdinLine() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text.split(/\r?\n/)[0];
}

async function askNewPassword() {
  if (!process.stdin.isTTY) return readFirstStdinLine();
  const first = await promptHidden("New password: ");
  const second = await promptHidden("Repeat it: ");
  if (first !== second) throw new Error("The two passwords differ; nothing was changed");
  return first;
}

async function main([group, command, ...args]) {
  const positional = args.filter((a) => !a.startsWith("--"));
  const name = positional[0];
  if (group !== "user" || !command || (command !== "list" && !name)) throw new Error(USAGE);

  const cfg = loadConfig();
  await mkdir(cfg.dataDir, { recursive: true, mode: 0o700 });
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

main(process.argv.slice(2)).catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
