/*
 * search.test.js - the folder walk behind the search box (public/js/search.js),
 * against a fake listing: every depth, links not followed, bounded reads,
 * failures counted, cancellation, and at most a few folders at a time.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { scan } from "../public/js/search.js";

const site = { id: "main-nvr", label: "main-nvr Office" };
const dir = (name, extra = {}) => ({ name, isDir: true, isLink: false, size: 0, date: "", ...extra });
const file = (name) => ({ name, isDir: false, isLink: false, size: 1, date: "" });

const TREE = {
  "/": [dir("Images"), dir("latest", { isDir: false, isLink: true }), file("report.pdf")],
  "/Images": [dir("2026"), file("front door.png")],
  "/Images/2026": [file("entrance 08h00.png")],
};

// A listing that answers from TREE, a moment later, and records its calls.
function fakeListing(tree = TREE, { fail = [] } = {}) {
  const calls = [];
  let active = 0, peak = 0;
  const listing = async (sc, path) => {
    calls.push(path);
    peak = Math.max(peak, ++active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    if (fail.includes(path) || !(path in tree)) throw new Error("550 No such directory");
    return tree[path];
  };
  return { listing, calls, peak: () => peak };
}

function finished(roots, listing, limits) {
  return new Promise((resolve) => {
    const progress = scan(roots, listing, (p) => p.done && resolve(p), limits);
    if (progress.done) resolve(progress);
  });
}

test("finds files and folders at every depth, with their parent folder", async () => {
  const { listing } = fakeListing();
  const progress = await finished([{ sc: site, path: "/" }], listing);
  assert.deepEqual(progress.items.map((i) => i.path).sort(),
    ["/Images", "/Images/2026", "/Images/2026/entrance 08h00.png", "/Images/front door.png", "/latest", "/report.pdf"]);
  const deep = progress.items.find((i) => i.entry.name === "entrance 08h00.png");
  assert.equal(deep.parent, "/Images/2026");
  assert.equal(deep.sc, site);
  assert.equal(deep.folded.text, "entrance 08h00.png");
  assert.equal(progress.listed, 3);
  assert.equal(progress.failed, 0);
  assert.equal(progress.truncated, false);
});

test("starts from the open folder, and doesn't follow links", async () => {
  const { listing, calls } = fakeListing();
  const progress = await finished([{ sc: site, path: "/Images" }], listing);
  assert.deepEqual(calls, ["/Images", "/Images/2026"]);
  assert.ok(!progress.items.some((i) => i.path.startsWith("/latest/")));
});

test("several sites at once: one root each", async () => {
  const other = { id: "back-office", label: "back-office" };
  const { listing } = fakeListing({ ...TREE });
  const progress = await finished([{ sc: site, path: "/" }, { sc: other, path: "/" }], listing);
  assert.equal(progress.items.filter((i) => i.sc === other).length, progress.items.filter((i) => i.sc === site).length);
});

test("bounded: at most N folders, at most a few at a time, and not too deep", async () => {
  const wide = { "/": Array.from({ length: 20 }, (_, i) => dir(`d${i}`)) };
  for (let i = 0; i < 20; i++) wide[`/d${i}`] = [file("clip.avi")];
  const fake = fakeListing(wide);
  const progress = await finished([{ sc: site, path: "/" }], fake.listing, { folders: 5, depth: 10, concurrency: 2 });
  assert.equal(fake.calls.length, 5);
  assert.equal(progress.truncated, true);
  assert.ok(fake.peak() <= 2, `at most 2 listings at once, saw ${fake.peak()}`);

  const shallow = fakeListing();
  await finished([{ sc: site, path: "/" }], shallow.listing, { folders: 100, depth: 1, concurrency: 4 });
  assert.deepEqual(shallow.calls.sort(), ["/", "/Images"]);
});

test("an unreadable folder is counted, and the rest is still searched", async () => {
  const { listing } = fakeListing(TREE, { fail: ["/Images"] });
  const progress = await finished([{ sc: site, path: "/" }], listing);
  assert.equal(progress.failed, 1);
  assert.ok(progress.items.some((i) => i.path === "/report.pdf"));
});

test("cancel stops the walk", async () => {
  const { listing, calls } = fakeListing();
  const progress = scan([{ sc: site, path: "/" }], listing, () => assert.fail("no update after cancel"));
  progress.cancel();
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(calls, ["/"]);
  assert.equal(progress.items.length, 0);
});

test("nothing to search is done at once", () => {
  const progress = scan([], async () => [], () => {});
  assert.equal(progress.done, true);
});
