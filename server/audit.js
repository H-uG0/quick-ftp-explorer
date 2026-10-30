/*
 * audit.js - append-only audit trail, one JSON object per line.
 *
 *   createAudit(file) -> audit(event, fields); audit.flush() -> Promise
 *
 * Records who did what and when: sign-ins, shortcut changes, folder
 * listings, file opens. CCTV footage is personal data, so access has to be
 * accountable. Writes are queued so lines never interleave; a failed write
 * is reported on stderr and never breaks the request that caused it.
 */

import { appendFile } from "node:fs/promises";

export function createAudit(file) {
  let queue = Promise.resolve();

  function audit(event, fields = {}) {
    const line = JSON.stringify({ time: new Date().toISOString(), event, ...fields }) + "\n";
    queue = queue
      .then(() => appendFile(file, line, { mode: 0o600 }))
      .catch((err) => console.error(`audit: could not write ${file}: ${err.message}`));
  }

  audit.flush = () => queue;
  return audit;
}
