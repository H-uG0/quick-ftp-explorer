/*
 * filetypes.test.js - the shared file-type table (public/js/filetypes.js),
 * especially that nothing that could run script is ever served inline.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { extension, kindFor, inlineType } from "../public/js/filetypes.js";

test("extensions are lower-cased; dotfiles and trailing dots have none", () => {
  assert.equal(extension("Clip.MP4"), "mp4");
  assert.equal(extension("archive.tar.gz"), "gz");
  assert.equal(extension(".hidden"), "");
  assert.equal(extension("noext"), "");
  assert.equal(extension("trailing."), "");
});

test("kinds drive icons and how a file opens", () => {
  assert.equal(kindFor("anything", true), "folder");
  assert.equal(kindFor("photo été.JPG"), "image");
  assert.equal(kindFor("clip.mp4"), "video");
  assert.equal(kindFor("recording.dav"), "video");
  assert.equal(kindFor("song.flac"), "audio");
  assert.equal(kindFor("report.pdf"), "doc");
  assert.equal(kindFor("data.bin"), "file");
  assert.equal(kindFor("constructor"), "file");
  assert.equal(kindFor("x.constructor"), "file");
});

test("only images, playable media, PDF and plain text are inline", () => {
  assert.equal(inlineType("a.png"), "image/png");
  assert.equal(inlineType("a.webm"), "video/webm");
  assert.equal(inlineType("a.m4a"), "audio/mp4");
  assert.equal(inlineType("a.pdf"), "application/pdf");
  assert.equal(inlineType("a.log"), "text/plain; charset=utf-8");
  for (const name of ["a.mkv", "a.dav", "a.docx", "a.zip", "a.bin", "noext"]) assert.equal(inlineType(name), null, name);
});

test("nothing that can carry script is ever inline", () => {
  for (const ext of ["html", "htm", "xhtml", "svg", "svgz", "xml", "js", "mjs", "css", "swf", "xsl", "shtml"]) {
    assert.equal(inlineType(`evil.${ext}`), null, ext);
    assert.equal(inlineType(`EVIL.${ext.toUpperCase()}`), null, ext);
  }
});
