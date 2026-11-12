#!/usr/bin/env node
// Writes apps/web/src/ui/templates/asf/components/icon-data.ts: the SVG bodies of the Solar icons
// (480 Design, CC BY 4.0) the template maps an icon name to, so the app ships only those icons and
// needs no icon package.
//
//   npm pack @iconify-json/solar@1.2.13 && tar xzf iconify-json-solar-1.2.13.tgz
//   node apps/web/scripts/asf/build-icons.mjs package/icons.json
//
// The version is pinned, so a rerun draws the same icons; a newer set is a change of its own.
//
// Add an icon: add the name to ExtendedIconName in apps/web/src/ui/contract.ts, map it here, rerun.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOLAR = {
  home: "home-angle", dashboard: "widget-5", user: "user-rounded", users: "users-group-rounded",
  settings: "settings", file: "file-text", folder: "folder-with-files", upload: "upload-minimalistic",
  download: "download-minimalistic", add: "add-circle", edit: "pen", delete: "trash-bin-trash",
  search: "magnifer", "sign-out": "logout-2", close: "close", info: "info-circle",
  success: "check-circle", warning: "danger-triangle", error: "danger-circle",
  calendar: "calendar", clock: "clock-circle", "check-in": "login-3", "check-out": "logout-3",
  briefcase: "case-round", building: "buildings-2", education: "square-academic-cap", card: "card",
  document: "document-text", "id-card": "user-id", phone: "phone", mail: "letter", "map-pin": "map-point",
  family: "users-group-two-rounded", child: "smile-circle", money: "wallet-money", chart: "chart-square",
  filter: "filter", bell: "bell", "chevron-down": "alt-arrow-down", "chevron-left": "alt-arrow-left",
  "chevron-right": "alt-arrow-right", "arrow-left": "arrow-left", "arrow-right": "arrow-right",
  menu: "hamburger-menu", sun: "sun-2", moon: "moon", eye: "eye", heart: "heart", "hand-heart": "hand-heart",
  play: "play", more: "menu-dots", external: "square-arrow-right-up", refresh: "refresh", star: "star",
  gift: "gift", globe: "global", leave: "sun-fog", shield: "shield-check", check: "check-read",
  hourglass: "hourglass-line", notebook: "notebook", gallery: "gallery",
  // the app's own icons, for the pages of the CSS ERP (apps/web/src/ui/icon-map.md)
  "project": "folder-kanban",
  "user-block": "user-block-rounded",
  "user-check": "user-check-rounded",
  "user-minus": "user-minus-rounded",
  "user-add": "user-plus-rounded",
  "key": "key",
  "clipboard": "clipboard-list",
  "clipboard-check": "clipboard-check",
  "block": "forbidden-circle",
  "devices": "devices",
  "smartphone": "smartphone",
  "laptop": "laptop",
  "history": "history",
  "video": "clapperboard-play",
  "undo": "undo-left",
  "redo": "undo-right",
  "checklist": "checklist-minimalistic",
  "checkbox": "check-square",
  "hash": "hashtag",
  "file-edit": "pen-new-square",
  "file-download": "file-download",
  "edit-line": "pen-2",
  "arrow-up": "arrow-up",
  "arrow-down": "arrow-down",
  "transfer": "transfer-horizontal",
  "send": "plain",
  "message": "chat-line",
  "lock": "lock-keyhole",
  "unlock": "lock-keyhole-unlocked",
  "link": "link",
  "merge": "branching-paths-down",
  "branch": "branching-paths-up",
  "compare": "documents",
  "copy": "copy",
  "calculator": "calculator",
  "scale": "scale",
  "zoom-in": "magnifer-zoom-in",
  "zoom-out": "magnifer-zoom-out",
  "maximize": "maximize-square",
  "collapse": "minimize-square",
  "sparkles": "stars",
  "save": "diskette",
  "template": "widget-add",
  "layers": "layers",
  "cloud-upload": "cloud-upload",
  "offline": "cloud-cross",
  "rejected": "close-circle",
  "camera": "camera",
  "schedule": "calendar-mark",
  "verified": "verified-check",
  "text": "text-square",
  "text-input": "text-field-focus",
  "table": "table",
  "list": "list",
  "list-add": "list-plus",
  "server": "server",
  "storage": "database",
  "rocket": "rocket",
  "phone-call": "phone-calling",
  "pause": "pause-circle",
  "attachment": "paperclip",
  "package": "box",
  "organogram": "structure",
  "library": "library",
  "book": "book",
  "language": "translation",
  "gallery-add": "gallery-add",
  "handshake": "hand-shake",
  "hand": "hand-stars",
  "folder-edit": "folder-pen",
  "folder-open": "folder-open",
  "water": "waterdrop",
  "radio": "record-circle",
  "activity": "pulse",
  "eye-off": "eye-closed",
  "minus": "minus-circle",
  "sort": "sort",
  "drag": "sort-vertical",
  "dot": "record",
  "more-vertical": "menu-dots-vertical",
};

// Small interface glyphs (arrows, close, menu) read better in Solar's line style; the rest are duotone.
const LINEAR = new Set(["chevron-down", "chevron-left", "chevron-right", "arrow-left", "arrow-right", "close", "menu", "more", "external", "check", "search", "arrow-up", "arrow-down", "drag", "sort", "dot", "more-vertical", "minus"]);

const source = process.argv[2];
if (!source) throw new Error("usage: build-icons.mjs <path to @iconify-json/solar icons.json>");
const set = JSON.parse(readFileSync(source, "utf8"));
const lines = Object.entries(SOLAR).map(([name, solar]) => {
  const style = LINEAR.has(name) ? "linear" : "bold-duotone";
  const key = `${solar}-${style}`;
  // Some names are aliases of another icon (no transforms in the ones mapped here).
  const icon = set.icons[key] ?? set.icons[set.aliases?.[key]?.parent];
  if (!icon) throw new Error(`Solar has no ${solar}-${style}`);
  // The bodies are put into the page as markup, so only plain drawing elements may pass.
  const tags = [...icon.body.matchAll(/<(\w+)/g)].map((match) => match[1]);
  const drawing = new Set(["g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon"]);
  if (!tags.every((tag) => drawing.has(tag)) || /\son\w+=|href=|url\(/i.test(icon.body)) {
    throw new Error(`${key} holds more than a drawing`);
  }
  return `  ${JSON.stringify(name)}: ${JSON.stringify(icon.body)},`;
});
const out = `// Generated by apps/web/scripts/asf/build-icons.mjs; do not edit. Solar icon set by 480 Design, CC BY 4.0
// (https://creativecommons.org/licenses/by/4.0/), bold duotone and line styles, 24 by 24, unchanged;
// from @iconify-json/solar 1.2.13.
import type { ExtendedIconName } from '@/ui/contract';

export const iconBodies: Record<ExtendedIconName, string> = {
${lines.join("\n")}
};
`;
const target = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../src/ui/templates/asf/components/icon-data.ts");
writeFileSync(target, out);
process.stdout.write(`wrote ${Object.keys(SOLAR).length} icons to ${path.relative(process.cwd(), target)}\n`);
