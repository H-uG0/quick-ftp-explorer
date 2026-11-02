/*
 * icons.js - the app's line icons.
 *
 *   icon(name)   <svg class="icon icon-<name>">, 16 x 16, drawn in currentColor
 *
 * Files and places: site (a dome camera: each site is a client's), home,
 * folder, image, video, audio, doc, file. Commands: open, download, search,
 * close, more, chevron, prev, next, back, forward, up, refresh, sort-up,
 * sort-down, filter, link, help, check.
 *
 * Emoji looked different on every platform and clashed with the palette.
 * Shapes are built as DOM nodes, since the CSP forbids inline markup and
 * styles; each icon is built once and cloned, as a long list needs thousands.
 */

const SVG = "http://www.w3.org/2000/svg";

const PAGE = ["path", { d: "M4 1.75h5l3 3v9.5H4z" }];
const SHAPES = {
  site: [
    ["rect", { x: 2, y: 3, width: 12, height: 2.5, rx: 0.75 }],
    ["path", { d: "M3.75 5.5a4.25 4.25 0 0 0 8.5 0" }],
    ["circle", { cx: 8, cy: 8.1, r: 1.3 }],
  ],
  home: [["path", { d: "M2.25 7.5 8 2.5l5.75 5M3.75 6.25v7.25h3V10h2.5v3.5h3V6.25" }]],
  folder: [
    ["path", { d: "M1.75 4.5c0-.69.56-1.25 1.25-1.25h3.3l1.5 1.5h5.2c.69 0 1.25.56 1.25 1.25v6.25c0 .69-.56 1.25-1.25 1.25H3c-.69 0-1.25-.56-1.25-1.25z" }],
  ],
  image: [
    ["rect", { x: 1.75, y: 2.75, width: 12.5, height: 10.5, rx: 1.25 }],
    ["circle", { cx: 5.5, cy: 6.25, r: 1.25 }],
    ["path", { d: "M2 11.75l3.5-3.25 2.5 2.25 2.25-2 3.75 3.5" }],
  ],
  video: [
    ["rect", { x: 1.75, y: 3.25, width: 12.5, height: 9.5, rx: 1.25 }],
    ["path", { d: "M6.75 5.9v4.2L10.3 8z", fill: "currentColor" }],
  ],
  audio: [
    ["path", { d: "M6 11.5V3.75l6.25-1.25v7.25" }],
    ["circle", { cx: 4.5, cy: 11.5, r: 1.5 }],
    ["circle", { cx: 10.75, cy: 9.75, r: 1.5 }],
  ],
  doc: [PAGE, ["path", { d: "M9 1.75v3h3M6 8.25h4M6 10.75h4" }]],
  file: [PAGE, ["path", { d: "M9 1.75v3h3" }]],

  open: [["path", { d: "M5.5 3.75 10.25 8 5.5 12.25z", fill: "currentColor" }]],
  download: [["path", { d: "M8 2.25v8M4.75 7.25 8 10.5l3.25-3.25M2.75 13.25h10.5" }]],
  search: [["circle", { cx: 7, cy: 7, r: 4.25 }], ["path", { d: "m10.25 10.25 3.5 3.5" }]],
  close: [["path", { d: "m4 4 8 8M12 4l-8 8" }]],
  more: [
    ["circle", { cx: 3.5, cy: 8, r: 1.1, fill: "currentColor" }],
    ["circle", { cx: 8, cy: 8, r: 1.1, fill: "currentColor" }],
    ["circle", { cx: 12.5, cy: 8, r: 1.1, fill: "currentColor" }],
  ],
  chevron: [["path", { d: "m6 3.75 4.25 4.25L6 12.25" }]],
  prev: [["path", { d: "M10 3.75 5.75 8 10 12.25" }]],
  next: [["path", { d: "m6 3.75 4.25 4.25L6 12.25" }]],
  back: [["path", { d: "M13.25 8H3m4-4.25L2.75 8 7 12.25" }]],
  forward: [["path", { d: "M2.75 8H13M9 3.75 13.25 8 9 12.25" }]],
  up: [["path", { d: "M8 13.25V3m-4.25 4L8 2.75 12.25 7" }]],
  refresh: [["path", { d: "M13.25 8a5.25 5.25 0 1 1-1.54-3.71" }], ["path", { d: "M13.25 2.5v3h-3" }]],
  "sort-up": [["path", { d: "M4.25 10 8 6.25 11.75 10" }]],
  "sort-down": [["path", { d: "M4.25 6.25 8 10l3.75-3.75" }]],
  filter: [["path", { d: "M2.25 3.25h11.5L9.25 8.5v4.25l-2.5 1v-5.25z" }]],
  link: [["path", { d: "M6.75 9.25a2.5 2.5 0 0 0 3.54 0l2.47-2.47a2.5 2.5 0 0 0-3.54-3.54l-.9.9M9.25 6.75a2.5 2.5 0 0 0-3.54 0L3.24 9.22a2.5 2.5 0 0 0 3.54 3.54l.9-.9" }]],
  help: [["circle", { cx: 8, cy: 8, r: 6.25 }], ["path", { d: "M6.25 6.25a1.75 1.75 0 1 1 2.5 1.6c-.5.25-.75.6-.75 1.15v.5" }], ["circle", { cx: 8, cy: 11.4, r: 0.6, fill: "currentColor" }]],
  check: [["path", { d: "m3.5 8.25 3 3 6-6.5" }]],
};

const built = new Map();

function build(shape) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", `icon icon-${shape}`);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const [tag, attributes] of SHAPES[shape]) {
    const node = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    svg.append(node);
  }
  return svg;
}

export function icon(name) {
  const shape = Object.hasOwn(SHAPES, name) ? name : "file";
  if (!built.has(shape)) built.set(shape, build(shape));
  return built.get(shape).cloneNode(true);
}
