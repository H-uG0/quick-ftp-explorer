/*
 * search.js - walks folders for the top bar's search. No DOM, so the test
 * suite can run it.
 *
 *   scan(roots, listing, onChange, limits?) -> progress
 *     roots      [{ sc, path }]: the open folder, or the root of every site
 *     listing    (sc, path) -> Promise<entries>: the tree's cached listings
 *     onChange   called as folders are read
 *     progress   { items, listed, failed, truncated, done, cancel() }
 *     items      every file and folder seen: { sc, parent, path, entry, folded }
 *
 * Like File Explorer's search box, it looks in the open folder and all its
 * subfolders. Listings come from the tree's cache, so searching again is
 * instant; links are not followed; and the walk is bounded, so one search
 * never floods the FTP server. Matching the typed words is up to the caller
 * (matchFolded in util.js): typing never needs another listing.
 */

import { joinPath, fold } from "./util.js";

// 6 at a time stays well under the gateway's 10 connections per FTP server
// (FTP_MAX_CONNECTIONS), which every user shares.
export const LIMITS = { folders: 300, depth: 10, concurrency: 6 };

export function scan(roots, listing, onChange, limits = LIMITS) {
  const queue = roots.map((root) => ({ ...root, depth: 0 }));
  const progress = { items: [], listed: 0, failed: 0, truncated: false, done: false, cancel };
  let started = 0, active = 0, cancelled = false;

  function cancel() {
    cancelled = true;
  }

  function read(job) {
    return Promise.resolve()
      .then(() => listing(job.sc, job.path))
      .then((entries) => {
        if (cancelled) return;
        for (const entry of entries) {
          const path = joinPath(job.path, entry.name);
          progress.items.push({ sc: job.sc, parent: job.path, path, entry, folded: fold(entry.name) });
          if (entry.isDir && !entry.isLink && job.depth < limits.depth) {
            queue.push({ sc: job.sc, path, depth: job.depth + 1 });
          }
        }
        progress.listed++;
      }, () => {
        if (!cancelled) progress.failed++;
      });
  }

  function pump() {
    while (!cancelled && active < limits.concurrency && queue.length) {
      if (started >= limits.folders) {
        progress.truncated = true;
        queue.length = 0;
        break;
      }
      const job = queue.shift();
      started++;
      active++;
      read(job).finally(() => {
        active--;
        if (cancelled) return;
        pump();
        onChange(progress);
      });
    }
    if (!active && !queue.length) progress.done = true;
  }

  pump();
  return progress;
}
