/*
 * mp4.js (test helper) - tiny MP4 files built box by box, enough for
 * server/video.js to tell a browser-ready MP4 from one that needs converting.
 * They hold no real frames: nothing here is meant to be decoded.
 *
 *   mp4()                                       H.264 High + AAC, moov after mdat
 *   mp4({ video: "mp4v" })                      MPEG-4 Part 2 (XviD): needs converting
 *   mp4({ profile: 110, audio: "ulaw", moovFirst: true, largeMdat: true, ... })
 *   box(type, ...payloads)                      one box
 */

export function box(type, ...payloads) {
  const body = Buffer.concat(payloads.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p))));
  const header = Buffer.alloc(8);
  header.writeUInt32BE(body.length + 8, 0);
  header.write(type, 4, "latin1");
  return Buffer.concat([header, body]);
}

// A box with a 64-bit "largesize", as recorders write for big mdat boxes.
function largeBox(type, payload) {
  const header = Buffer.alloc(16);
  header.writeUInt32BE(1, 0);
  header.write(type, 4, "latin1");
  header.writeBigUInt64BE(BigInt(payload.length + 16), 8);
  return Buffer.concat([header, payload]);
}

function track(handler, sampleEntry) {
  const hdlr = box("hdlr", Buffer.alloc(8), handler, Buffer.alloc(12));
  const stsd = box("stsd", Buffer.from([0, 0, 0, 0, 0, 0, 0, 1]), sampleEntry);
  return box("trak", box("mdia", hdlr, box("minf", box("stbl", stsd))));
}

export function mp4({ video = "avc1", profile = 100, audio = "mp4a", moovFirst = false, largeMdat = false } = {}) {
  const visual = video === "avc1" || video === "avc3"
    ? box(video, Buffer.alloc(78), box("avcC", Buffer.from([1, profile, 0, 30, 0xff, 0xe1])))
    : box(video, Buffer.alloc(78), box("esds", Buffer.alloc(12)));
  const traks = [track("vide", visual)];
  if (audio) traks.push(track("soun", box(audio, Buffer.alloc(28))));
  const moov = box("moov", ...traks);
  const frames = Buffer.alloc(64, 0x5a);
  const mdat = largeMdat ? largeBox("mdat", frames) : box("mdat", frames);
  const ftyp = box("ftyp", "isom", Buffer.from([0, 0, 2, 0]), "isomavc1");
  return Buffer.concat(moovFirst ? [ftyp, moov, mdat] : [ftyp, box("free"), mdat, moov]);
}
