/*
 * fake-ffmpeg.js (test helper) - a stand-in for ffmpeg, for the converter's
 * `probe` and `run` options: records what it was given and writes `output`
 * where ffmpeg would have written its MP4.
 *
 *   const ffmpeg = fakeFfmpeg();                     converts to mp4({ moovFirst: true })
 *   fakeFfmpeg({ code: 1 })                          fails like on a damaged file
 *   fakeFfmpeg({ signal: "SIGKILL" })                killed after the timeout
 *   fakeFfmpeg({ gate })                             waits for the promise `gate`
 *   createConverter(ffmpeg); ffmpeg.calls            [{ file, args, input, dir }]
 */

import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { mp4 } from "./mp4.js";

export function fakeFfmpeg({ output = mp4({ moovFirst: true }), code = 0, signal = null, gate = null } = {}) {
  const calls = [];
  async function run(file, args) {
    const input = args[args.indexOf("-i") + 1];
    calls.push({ file, args, input: await readFile(input), dir: path.dirname(input) });
    await gate;
    if (code === 0 && !signal) await writeFile(args.at(-1), output);
    return { code, signal };
  }
  return { run, probe: async () => "ffmpeg version fake", calls };
}
