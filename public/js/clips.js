/*
 * clips.js - what a recorder's file name says: which camera, and when. No
 * DOM, so the test suite can run it.
 *
 *   parseClip(name)   { camera, time } or null
 *     camera          the camera's name or channel, as the recorder wrote it
 *     time            when the clip starts, as ISO 8601 text (see modifiedTime
 *                     in server/ftp.js): "2026-10-30T08:30" is the recorder's
 *                     own clock, "2026-10-30T07:30:12Z" an exact moment
 *
 * Recorders name clips "<site or device>_<camera>_<stamp>.<ext>". The stamp
 * is YYYYMMDDhhmm or YYYYMMDDhhmmss in the recorder's local time, or Unix
 * seconds. The camera part may itself hold spaces and underscores:
 *
 *   1234_Porte entree 1_202610300830.avi   camera "Porte entree 1"
 *   12345678_02_1793345412.mp4             camera "02" (a channel)
 *   Garage_202610300830.avi                camera "Garage"
 */

const STAMP = /^(?:\d{12}|\d{14}|\d{10})$/;
const pad = (n) => String(n).padStart(2, "0");

// Unix seconds are believed between 2000 and 2100; dates must exist.
function stampTime(stamp) {
  if (stamp.length === 10) {
    const ms = Number(stamp) * 1000;
    if (ms < Date.UTC(2000, 0, 1) || ms >= Date.UTC(2100, 0, 1)) return null;
    return new Date(ms).toISOString().replace(".000Z", "Z");
  }
  const [y, mo, d, h, mi, s] = [0, 4, 6, 8, 10, 12].map((at, i) => Number(stamp.slice(at, i ? at + 2 : 4)));
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, stamp.length === 14 ? s : 0));
  if (y < 2000 || y >= 2100 || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) {
    return null;
  }
  const time = `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}`;
  return stamp.length === 14 ? `${time}:${pad(s)}` : time;
}

const cache = new Map();

export function parseClip(name) {
  const key = String(name);
  if (cache.has(key)) return cache.get(key);
  const stem = key.replace(/\.[^.]*$/, "");
  const parts = stem.split("_");
  let clip = null;
  if (parts.length >= 2 && STAMP.test(parts.at(-1))) {
    const time = stampTime(parts.at(-1));
    // With three parts or more the first names the site or the device.
    const camera = (parts.length === 2 ? parts[0] : parts.slice(1, -1).join("_")).trim();
    if (time && camera) clip = { camera, time };
  }
  if (cache.size > 50_000) cache.clear();   // names are short, but folders can be many
  cache.set(key, clip);
  return clip;
}
