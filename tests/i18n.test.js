/*
 * i18n.test.js - the interface in English and French (public/js/i18n.js):
 * both languages have every text with the same slots, every key the code
 * uses exists, plurals and numbers follow each language, the language is
 * picked as browsers expect, and the server answers errors in it.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readdirSync, readFileSync } from "node:fs";
import {
  MESSAGES, translate, plural, msg, pickLanguage, formatSize, formatDate, formatDateTime, formatLongDateTime,
  formatDayHeading,
} from "../public/js/i18n.js";
import { startApp, PASSWORD } from "./helpers/app.js";

const ROOT = path.join(import.meta.dirname, "..");
const slots = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const forms = (value) => (typeof value === "object" && !Array.isArray(value) ? Object.values(value) : [value]);

test("English and French have the same texts, with the same slots", () => {
  assert.deepEqual(Object.keys(MESSAGES.fr).sort(), Object.keys(MESSAGES.en).sort());
  for (const [key, en] of Object.entries(MESSAGES.en)) {
    const fr = MESSAGES.fr[key];
    assert.equal(Array.isArray(fr), Array.isArray(en), key);
    assert.equal(typeof fr, typeof en, key);
    if (typeof en === "object" && !Array.isArray(en)) assert.deepEqual(Object.keys(fr).sort(), ["one", "other"], key);
    const enSlots = [...new Set(forms(en).flatMap(slots))].sort();
    for (const form of forms(fr)) {
      assert.ok(slots(form).every((s) => enSlots.includes(s)), `${key}: unknown slot in French`);
    }
  }
});

test("French typography: no-break spaces before : ; ? ! and inside « »", () => {
  for (const [key, value] of Object.entries(MESSAGES.fr)) {
    for (const text of forms(value).flat()) {
      assert.doesNotMatch(String(text), / [:;?!»]/, `${key}: a plain space before punctuation`);
      assert.doesNotMatch(String(text), /« /, `${key}: a plain space after «`);
    }
  }
});

test("every key the code and the pages use exists", () => {
  const namespaces = "api|common|lang|auth|nav|count|tree|files|col|type|search|sc|viewer|size|page|field|err|" +
    "sort|filter|sel|cmd|menu|status|a11y|date|group|kbd|help|share|zip|refresh";
  const keyLiteral = new RegExp(`["'\`]((?:${namespaces})\\.[\\w.]+)["'\`]`, "g");
  const sources = [
    ...readdirSync(path.join(ROOT, "server")).filter((f) => f.endsWith(".js")).map((f) => path.join(ROOT, "server", f)),
    ...readdirSync(path.join(ROOT, "public/js")).filter((f) => f.endsWith(".js") && f !== "i18n.js").map((f) => path.join(ROOT, "public/js", f)),
  ];
  const used = new Set();
  for (const file of sources) for (const m of readFileSync(file, "utf8").matchAll(keyLiteral)) used.add(m[1]);
  for (const page of ["index.html", "login.html"]) {
    const html = readFileSync(path.join(ROOT, "public", page), "utf8");
    for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) used.add(m[1]);
    for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
      for (const pair of m[1].split(";")) used.add(pair.split(":")[1].trim());
    }
  }
  for (const code of ["invalid", "rate", "expired"]) used.add(`auth.error.${code}`);   // built in login.js
  assert.ok(used.size > 60, `found ${used.size} keys in use`);
  for (const key of used) assert.ok(key in MESSAGES.en, `missing key: ${key}`);
});

test("slots, nested messages, numbers and plurals follow the language", () => {
  assert.equal(translate("fr", "err.ftpLogin", { reply: "530 Login incorrect." }), "Échec de la connexion au serveur FTP : 530 Login incorrect.");
  assert.equal(translate("fr", "err.required", { field: msg("field.username") }), "Le champ « Identifiant » est obligatoire");
  assert.equal(translate("en", "err.required", { field: msg("field.username") }), "Username is required");
  assert.equal(plural("en", "count.results", 0), "0 results");
  assert.equal(plural("fr", "count.results", 0), "0 résultat", "0 is singular in French");
  assert.equal(plural("fr", "count.results", 2), "2 résultats");
  assert.equal(plural("en", "count.results", 1), "1 result");
  assert.equal(plural("fr", "count.results", 12345), "12 345 résultats");
  assert.equal(plural("en", "count.results", 12345), "12,345 results");
  assert.equal(translate("de", "nav.shortcuts"), "Sites", "unknown language: English");
  assert.equal(translate("fr", "no.such.key"), "no.such.key");
});

test("the language: the cookie, else the browser's preferences, else English", () => {
  assert.equal(pickLanguage("fr", "en-US,en"), "fr");
  assert.equal(pickLanguage("xx", "fr-FR,fr;q=0.9,en;q=0.8"), "fr");
  assert.equal(pickLanguage(undefined, "en-GB,en;q=0.9,fr;q=0.8"), "en");
  assert.equal(pickLanguage(undefined, "de-DE,de;q=0.9,fr;q=0.5"), "fr");
  assert.equal(pickLanguage(undefined, "en;q=0.4,fr;q=0.6"), "fr");
  assert.equal(pickLanguage(undefined, "de-DE"), "en");
  assert.equal(pickLanguage(undefined, "*"), "en");
  assert.equal(pickLanguage(undefined, undefined), "en");
});

test("sizes and listing dates, the French way too", () => {
  assert.equal(formatSize(0), "0 B");
  assert.equal(formatSize(1023), "1023 B");
  assert.equal(formatSize(1536), "1.5 KB");
  assert.equal(formatSize(5 * 1024 ** 2), "5.0 MB");
  assert.equal(formatSize(3 * 1024 ** 3), "3.00 GB");
  assert.equal(formatSize(undefined), "0 B");
  assert.equal(formatSize(1536, "fr"), "1,5 Ko");
  assert.equal(formatSize(3 * 1024 ** 3, "fr"), "3,00 Go");
  assert.equal(formatSize(12, "fr"), "12 o");

  assert.equal(formatDate("Apr 01 2026", "en"), "1 Apr 2026");
  assert.equal(formatDate("Apr 01 2026", "fr"), "1 avr. 2026");
  assert.equal(formatDate("Oct 30 08:30", "fr"), "30 oct. 08:30");
  assert.equal(formatDate("2026-04-01 08:30", "fr"), "1 avr. 2026 08:30");
  assert.equal(formatDate("04-01-26  08:30AM", "fr"), "04-01-26  08:30AM", "unknown formats are shown as they came");
  assert.equal(formatDate(undefined, "fr"), "");
});

test("times as Windows lists them, and in full for tooltips", () => {
  const ms = new Date(2026, 3, 1, 14, 34, 5).getTime();
  assert.equal(formatDateTime(ms, "minute"), "01/04/2026 14:34");
  assert.equal(formatDateTime(ms, "second"), "01/04/2026 14:34:05");
  assert.equal(formatDateTime(ms, "day"), "01/04/2026");
  assert.equal(formatDateTime(new Date(2026, 0, 2, 0, 5).getTime()), "02/01/2026 00:05", "24-hour, padded");
  assert.equal(formatLongDateTime(ms, "second", "fr"), "mercredi 1 avril 2026 à 14:34:05");
  assert.equal(formatLongDateTime(ms, "minute", "fr"), "mercredi 1 avril 2026 à 14:34");
  assert.equal(formatLongDateTime(ms, "day", "fr"), "mercredi 1 avril 2026");
  assert.match(formatLongDateTime(ms, "minute", "en"), /^Wednesday,? 1 April 2026 at 14:34$/);
  assert.equal(formatDayHeading(new Date(2026, 10, 1).getTime(), "fr"), "dimanche 1 novembre 2026");
  assert.match(formatDayHeading(new Date(2026, 10, 1).getTime(), "en"), /^Sunday,? 1 November 2026$/);
});

describe("the server answers errors in the reader's language", () => {
  let t;
  before(async () => {
    t = await startApp();
    await t.app.users.add("alice", PASSWORD, "admin");
  });
  after(() => t.close());

  test("JSON errors: the cookie, or Accept-Language", async () => {
    const error = async (headers) => (await (await t.request("/api/me", { headers })).json()).error;
    assert.equal(await error({ cookie: "qfe_lang=fr" }), "Connexion requise");
    assert.equal(await error({ "accept-language": "fr-FR,fr;q=0.9,en;q=0.8" }), "Connexion requise");
    assert.equal(await error({ "accept-language": "en-GB" }), "Sign-in required");
    assert.equal(await error({}), "Sign-in required");
  });

  test("validation errors, with translated field names", async () => {
    const { cookie } = await t.login("alice");
    const res = await t.request("/api/shortcuts", {
      method: "POST",
      headers: { cookie: `${cookie}; qfe_lang=fr`, "content-type": "application/json" },
      body: JSON.stringify({ username: "", host: "192.0.2.10" }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "Le champ « Identifiant » est obligatoire");
  });

  test("the error page of a browser tab", async () => {
    const res = await t.request("/api/nope", { headers: { accept: "text/html", cookie: "qfe_lang=fr" } });
    const html = await res.text();
    assert.match(html, /<html lang="fr">/);
    assert.match(html, /<title>Erreur 404 · Quick FTP Explorer<\/title>/);
    assert.match(html, /Introuvable/);
    assert.match(html, /Retour à l&#39;explorateur/);
  });
});
