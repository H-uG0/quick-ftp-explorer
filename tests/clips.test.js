/*
 * clips.test.js - the camera and start time read from clip names
 * (public/js/clips.js). Names are invented, shaped like real recorders'.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseClip } from "../public/js/clips.js";

test("site, camera, then the recorder's local time to the minute or the second", () => {
  assert.deepEqual(parseClip("1234_Porte entree 1_202610300830.avi"), { camera: "Porte entree 1", time: "2026-10-30T08:30" });
  assert.deepEqual(parseClip("1234_Cam 2_202610300830.mp4"), { camera: "Cam 2", time: "2026-10-30T08:30" });
  assert.deepEqual(parseClip("main-nvr_Quai_20261030083012.dav"), { camera: "Quai", time: "2026-10-30T08:30:12" });
});

test("Unix seconds are an exact moment", () => {
  assert.deepEqual(parseClip("12345678_02_1793345412.mp4"), { camera: "02", time: "2026-10-30T07:30:12Z" });
  assert.deepEqual(parseClip("Entrepot_Nord_1793345412.avi"), { camera: "Nord", time: "2026-10-30T07:30:12Z" });
});

test("underscores, accents and spaces stay in the camera's name", () => {
  assert.deepEqual(parseClip("1234_Allée_Sud_202610300830.avi"), { camera: "Allée_Sud", time: "2026-10-30T08:30" });
  assert.deepEqual(parseClip("Garage_202610300830.avi"), { camera: "Garage", time: "2026-10-30T08:30" });
  assert.deepEqual(parseClip("1234_Cam 1_202610300830"), { camera: "Cam 1", time: "2026-10-30T08:30" }, "no extension");
});

test("no stamp, or one that isn't a real moment: nothing", () => {
  for (const name of [
    "report.pdf", "snapshot 2026.jpg", "1234_Cam 1.avi", "1234_Cam 1_20261030083.avi", "1234_Cam 1_202613300830.avi",
    "1234_Cam 1_202602300830.avi", "1234_Cam 1_202610302430.avi", "1234_Cam 1_202610300860.avi",
    "1234_Cam 1_189912310830.avi", "1234_Cam 1_0000000001.avi", "1234_ _202610300830.avi", "202610300830.avi",
    "1234_Cam 1_202610300830_old.avi",
  ]) {
    assert.equal(parseClip(name), null, name);
  }
});
