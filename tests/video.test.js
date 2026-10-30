/*
 * video.test.js - server/video.js: telling a browser-ready MP4 from a clip
 * that needs converting, and the converter around ffmpeg (passthrough,
 * temporary files, cache, shared work, failures, queue). A stand-in replaces
 * ffmpeg here; the last tests run the real one when it is installed.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { createConverter, isBrowserMp4 } from "../server/video.js";
import { HttpError } from "../server/http.js";
import { box, mp4 } from "./helpers/mp4.js";
import { fakeFfmpeg } from "./helpers/fake-ffmpeg.js";

const XVID = Buffer.from("RIFF\0\0\0\0AVI LIST - a clip no browser plays");

// load() for playable(), counting its calls.
function loader(bytes) {
  const load = async () => {
    load.calls++;
    if (bytes instanceof Error) throw bytes;
    return bytes;
  };
  load.calls = 0;
  return load;
}

describe("isBrowserMp4", () => {
  test("H.264 (Baseline, Main, High) in MP4 plays as it is, wherever moov is", () => {
    assert.ok(isBrowserMp4(mp4()));
    assert.ok(isBrowserMp4(mp4({ moovFirst: true })));
    assert.ok(isBrowserMp4(mp4({ audio: null })));
    assert.ok(isBrowserMp4(mp4({ largeMdat: true })));
    assert.ok(isBrowserMp4(mp4({ video: "avc3" })));
    for (const profile of [66, 77, 100]) assert.ok(isBrowserMp4(mp4({ profile })));
  });

  test("anything else needs converting", () => {
    assert.equal(isBrowserMp4(mp4({ video: "mp4v" })), false, "MPEG-4 Part 2 (XviD)");
    assert.equal(isBrowserMp4(mp4({ video: "hvc1" })), false, "H.265");
    assert.equal(isBrowserMp4(mp4({ profile: 110 })), false, "H.264 High 10");
    assert.equal(isBrowserMp4(mp4({ audio: "ulaw" })), false, "G.711 audio");
    assert.equal(isBrowserMp4(XVID), false, "AVI");
    assert.equal(isBrowserMp4(Buffer.alloc(0)), false);
    const whole = mp4();
    assert.equal(isBrowserMp4(whole.subarray(0, whole.length - 10)), false, "moov cut short");
    const audioOnly = Buffer.concat([box("ftyp", "isom"), box("moov")]);
    assert.equal(isBrowserMp4(audioOnly), false, "no video track");
  });
});

describe("converter", () => {
  test("a browser-ready MP4 passes through untouched, without ffmpeg", async () => {
    const ffmpeg = fakeFfmpeg();
    const converter = createConverter(ffmpeg);
    const clip = mp4();
    assert.deepEqual(await converter.playable("a", loader(clip)), clip);
    assert.equal(ffmpeg.calls.length, 0);
  });

  test("anything else is converted from a private temporary file, then cleaned up", async () => {
    const ffmpeg = fakeFfmpeg();
    const converter = createConverter(ffmpeg);
    const out = await converter.playable("a", loader(XVID));
    assert.deepEqual(out, mp4({ moovFirst: true }));
    const [call] = ffmpeg.calls;
    assert.deepEqual(call.input, XVID);
    assert.equal(existsSync(call.dir), false, "temporary folder removed");
    // Untrusted input: local files only, and only real video demuxers.
    assert.equal(call.args[call.args.indexOf("-protocol_whitelist") + 1], "file");
    assert.ok(!call.args[call.args.indexOf("-format_whitelist") + 1].split(",").some((f) => ["hls", "concat"].includes(f)));
    assert.ok(call.args.includes("libx264") && call.args.includes("+faststart"));
  });

  test("results are shared by simultaneous requests and cached", async () => {
    const converter = createConverter(fakeFfmpeg());
    const load = loader(XVID);
    const [a, b] = await Promise.all([converter.playable("k", load), converter.playable("k", load)]);
    assert.deepEqual(a, b);
    await converter.playable("k", load);
    assert.equal(load.calls, 1);
    await converter.playable("other", load);
    assert.equal(load.calls, 2);
  });

  test("the cache keeps the most recently used videos within its byte budget", async () => {
    const ffmpeg = fakeFfmpeg();
    const size = mp4({ moovFirst: true }).length;
    const converter = createConverter({ ...ffmpeg, cacheBytes: size * 2 });
    const loads = { a: loader(XVID), b: loader(XVID), c: loader(XVID) };
    await converter.playable("a", loads.a);
    await converter.playable("b", loads.b);
    await converter.playable("a", loads.a);   // a is now the most recently used
    await converter.playable("c", loads.c);   // over budget: b goes
    await converter.playable("a", loads.a);
    await converter.playable("b", loads.b);
    assert.deepEqual([loads.a.calls, loads.b.calls, loads.c.calls], [1, 2, 1]);
  });

  test("a clip ffmpeg can't convert is a 415, remembered for a while", async () => {
    const converter = createConverter(fakeFfmpeg({ code: 1 }));
    const load = loader(XVID);
    await assert.rejects(converter.playable("k", load), { status: 415 });
    await assert.rejects(converter.playable("k", load), { status: 415 });
    assert.equal(load.calls, 1);
  });

  test("passing failures are not remembered: timeouts, a busy or unreachable FTP server", async () => {
    const slow = createConverter(fakeFfmpeg({ signal: "SIGKILL" }));
    const load = loader(XVID);
    await assert.rejects(slow.playable("k", load), { status: 504 });
    await assert.rejects(slow.playable("k", load), { status: 504 });
    assert.equal(load.calls, 2);

    const converter = createConverter(fakeFfmpeg());
    const busy = loader(new HttpError(503, "busy"));
    await assert.rejects(converter.playable("k", busy), { status: 503 });
    await assert.rejects(converter.playable("k", busy), { status: 503 });
    assert.equal(busy.calls, 2);
  });

  test("without ffmpeg: H.264 MP4s still play, other clips are a 501", async () => {
    const converter = createConverter({ ...fakeFfmpeg(), probe: async () => null });
    assert.equal(await converter.check(), null);
    assert.ok(isBrowserMp4(await converter.playable("a", loader(mp4()))));
    await assert.rejects(converter.playable("b", loader(XVID)), { status: 501, message: /no converter/ });
  });

  test("a missing ffmpeg binary is detected", async () => {
    const converter = createConverter({ ffmpegPath: path.join(os.tmpdir(), "no-such-ffmpeg-qfe") });
    assert.equal(await converter.check(), null);
  });

  test("conversions beyond the queue are refused with 503", async () => {
    let open;
    const gate = new Promise((resolve) => (open = resolve));
    const converter = createConverter({ ...fakeFfmpeg({ gate }), concurrency: 1, maxQueue: 0 });
    const first = converter.playable("a", loader(XVID));
    await new Promise((resolve) => setTimeout(resolve, 50));   // let it take the only slot
    await assert.rejects(converter.playable("b", loader(XVID)), { status: 503 });
    open();
    assert.ok(isBrowserMp4(await first));
  });
});

describe("converter with the real ffmpeg", async () => {
  const run = promisify(execFile);
  const ffmpeg = await createConverter().check();
  const skip = !ffmpeg && "ffmpeg is not installed";

  // A two-second test pattern, encoded the way some cameras record.
  async function clip(codec, format) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "qfe-clip-"));
    try {
      const file = path.join(dir, `clip.${format}`);
      await run("ffmpeg", ["-nostdin", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=176x144:rate=3",
        "-t", "2", "-c:v", codec, "-f", format, file]);
      return await readFile(file);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  for (const [what, codec, format] of [["XviD in AVI", "mpeg4", "avi"], ["XviD in MP4, moov at the end", "mpeg4", "mp4"]]) {
    test(`${what} becomes an H.264 MP4 that starts playing at once`, { skip }, async () => {
      const input = await clip(codec, format);
      assert.equal(isBrowserMp4(input), false);
      const out = await createConverter().playable("k", async () => input);
      assert.ok(isBrowserMp4(out));
      assert.ok(out.indexOf("moov") < out.indexOf("mdat"), "moov first (faststart)");
    });
  }

  test("a damaged file is a 415", { skip }, async () => {
    await assert.rejects(createConverter().playable("k", async () => XVID), { status: 415 });
  });
});
