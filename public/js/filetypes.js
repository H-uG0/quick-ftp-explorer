/*
 * filetypes.js - one table for what a file is and how it may be served.
 * Imported by the browser (icons, how to open a file) and by the server
 * (what may be shown inline), so the two can never drift apart.
 *
 *   extension(name)       lower-case extension, or ""
 *   kindFor(name, isDir)  "folder" | "image" | "video" | "audio" | "doc" | "file"
 *   inlineType(name)      Content-Type the browser may render, or null
 *
 * Only images, browser-playable video/audio, PDF and plain text are ever
 * served inline. Everything else is a download - notably HTML, SVG, XML and
 * scripts, which would otherwise run inside the app's own origin.
 */

const TEXT = "text/plain; charset=utf-8";

// extension -> [kind, inline Content-Type or null]
const TYPES = {
  jpg: ["image", "image/jpeg"], jpeg: ["image", "image/jpeg"], png: ["image", "image/png"],
  gif: ["image", "image/gif"], webp: ["image", "image/webp"], bmp: ["image", "image/bmp"],

  mp4: ["video", "video/mp4"], m4v: ["video", "video/mp4"], webm: ["video", "video/webm"],
  mov: ["video", "video/quicktime"],
  // Common recorder/export formats browsers can't play: video icon, download only.
  mkv: ["video", null], avi: ["video", null], dav: ["video", null],
  264: ["video", null], h264: ["video", null], h265: ["video", null],

  mp3: ["audio", "audio/mpeg"], wav: ["audio", "audio/wav"], ogg: ["audio", "audio/ogg"],
  m4a: ["audio", "audio/mp4"], aac: ["audio", "audio/aac"], flac: ["audio", "audio/flac"],

  pdf: ["doc", "application/pdf"], txt: ["doc", TEXT], log: ["doc", TEXT],
  doc: ["doc", null], docx: ["doc", null], xls: ["doc", null], xlsx: ["doc", null],
};

export function extension(name) {
  const s = String(name);
  const i = s.lastIndexOf(".");
  return i <= 0 || i === s.length - 1 ? "" : s.slice(i + 1).toLowerCase();
}

export function kindFor(name, isDir = false) {
  if (isDir) return "folder";
  const ext = extension(name);
  return Object.hasOwn(TYPES, ext) ? TYPES[ext][0] : "file";
}

export function inlineType(name) {
  const ext = extension(name);
  return Object.hasOwn(TYPES, ext) ? TYPES[ext][1] : null;
}
