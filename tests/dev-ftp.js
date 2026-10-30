/*
 * dev-ftp.js - the fake FTP server for local development (npm run dev:ftp).
 *
 *   node tests/dev-ftp.js [--port 2121] [--root <folder>]
 *
 * Without --root it serves a small demo tree: a real image and PDF to view,
 * text files, and an HTML and an SVG file that must download, not render.
 * With --root it serves that folder read-only instead, e.g. one holding real
 * camera clips to try video playback and seeking. It listens on 127.0.0.1
 * only. Sign in as user "demo", password "demo".
 */

import { deflateSync, crc32 } from "node:zlib";
import { startFakeFtp, fixtureTree, link } from "./helpers/fake-ftp-server.js";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// A small RGB PNG built by hand: zlib-compressed scanlines plus CRC'd chunks.
function png(width, height, pixel) {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), y * stride + 1 + x * 3);
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;   // bits per channel
  header[9] = 2;   // truecolour RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// A one-page PDF with a line of (ASCII) text and a correct xref table.
function pdf(text) {
  const content = `BT /F1 20 Tf 40 90 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 480 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((at) => `${String(at).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const snapshot = png(640, 360, (x, y) => [Math.round((x / 640) * 255), Math.round((y / 360) * 255), 160]);

// The test fixture's names, with real content where a browser will render it.
// Its .mp4 files stay byte patterns: they show the "can't play" fallback.
function demoTree() {
  const { "photo été.jpg": _fakeJpeg, ...fixture } = fixtureTree();
  return {
    ...fixture,
    "photo été.png": snapshot,
    "report with accents éàü.pdf": pdf("Report with accents"),
    "Images": {
      "2026": { "entrance 08h00.png": snapshot },
      "front door.png": png(320, 240, (x, y) => ((x >> 4) + (y >> 4)) % 2 ? [0, 120, 212] : [240, 240, 240]),
    },
    "Dossier avec accents éàü": {
      "rapport été.pdf": pdf("Quick FTP Explorer - demo report"),
      "notes.txt": "Demo notes.\nThe accents in this folder name are on purpose: éàü.\n",
    },
    "Videos": { "README.txt": "No video in the demo tree. Run `node tests/dev-ftp.js --root <folder>` to serve real clips.\n" },
    "latest": link("Images"),
  };
}

const root = arg("--root", null);
const ftp = await startFakeFtp({ port: Number(arg("--port", 2121)), ...(root ? { root } : { tree: demoTree() }) });
console.log(`Fake FTP server on ${ftp.host}:${ftp.port} serving ${root ? root : "the demo tree"}.`);
console.log(`Create a shortcut with host ${ftp.host}, port ${ftp.port}, username "demo" (the password defaults to it).`);
