/*
 * icons.js - the line icons of the tree and the file table.
 *
 *   icon(name)   <svg class="icon icon-<name>">, 16 x 16, drawn in currentColor
 *                name: "site" | "folder" | "image" | "video" | "audio" | "doc" | "file"
 *
 * Emoji looked different on every platform and clashed with the palette.
 * Shapes are built as DOM nodes: the CSP forbids inline markup and styles.
 */

const SVG = "http://www.w3.org/2000/svg";

const PAGE = ["path", { d: "M4 1.75h5l3 3v9.5H4z" }];
const SHAPES = {
  // A ceiling dome camera: each shortcut is a client site.
  site: [
    ["rect", { x: 2, y: 3, width: 12, height: 2.5, rx: 0.75 }],
    ["path", { d: "M3.75 5.5a4.25 4.25 0 0 0 8.5 0" }],
    ["circle", { cx: 8, cy: 8.1, r: 1.3 }],
  ],
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
};

export function icon(name) {
  const shape = Object.hasOwn(SHAPES, name) ? name : "file";
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", `icon icon-${shape}`);
  svg.setAttribute("aria-hidden", "true");
  for (const [tag, attributes] of SHAPES[shape]) {
    const node = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    svg.append(node);
  }
  return svg;
}
