#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  tools/build-looks.mjs — turns tools/looks/looks.src.txt into the app's looks
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  RUN IT WITH
 *      npm run looks              regenerate src/data/looks.generated.ts
 *      npm run looks -- --offline don't contact Wikimedia (use cached metadata only)
 *
 *  NOTHING IS DOWNLOADED
 *  The app shows every runway photo straight from Wikimedia's image servers
 *  ("hot-linking"); no image files are copied into this project. This script
 *  only works out *numbers*: where the person stands in each photo and how to
 *  frame them, so the app can crop the photo in the browser.
 *
 *  WHAT IT DOES, STEP BY STEP
 *   1. Reads tools/looks/looks.src.txt — one line per runway look (see the notes
 *      at the top of that file for the format).
 *   2. Makes sure it knows each photo's size, licence and author. They're cached
 *      in tools/looks/commons.json; anything missing is asked from the Wikimedia
 *      Commons API (slowly — about one request every 7 s, which is what Wikimedia
 *      allows for scripts that don't identify an operator). That is TEXT
 *      (metadata), never the image itself.
 *   3. For each look, works out a 2:3 "frame" with the person standing
 *      head-to-toe in it (5% of the frame above the head, 7% below the feet),
 *      and where the person sits inside that frame (`fig`). The app crops single
 *      garments relative to that (see src/data/crops.ts).
 *   4. Writes src/data/looks.generated.ts, which the app imports. (Never edit
 *      that file by hand: edit looks.src.txt and run this script again.)
 *   5. Writes docs/PHOTO_CREDITS.md: every photo with its photographer, licence
 *      and original — what the Creative Commons licences ask for.
 *
 *  THINGS YOU MIGHT CHANGE
 *   - HEAD_ROOM / FOOT_ROOM: how much space is left above the head and below the
 *     feet in every frame.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_FILE = path.join(ROOT, "tools/looks/looks.src.txt");
const COMMONS_FILE = path.join(ROOT, "tools/looks/commons.json");
const TS_FILE = path.join(ROOT, "src/data/looks.generated.ts");
const CREDITS_FILE = path.join(ROOT, "docs/PHOTO_CREDITS.md");

// ── Frame geometry (TWEAK) ──────────────────────────────────────────────────
const FRAME_ASPECT = 2 / 3; // width ÷ height of every frame (a tall portrait)
const HEAD_ROOM = 0.05; // share of the frame left above the head
const FOOT_ROOM = 0.07; // share of the frame left below the feet

// Wikimedia asks scripts to send a descriptive User-Agent.
const UA = "WhatToWearLooksBuilder/2.0 (personal fashion project; reads photo metadata from Commons)";

const SECTION = { w: "womenswear", m: "menswear", u: "unisex" };
const FITS = new Set(["slim", "regular", "baggy"]);
const OFFLINE = process.argv.includes("--offline");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. Read looks.src.txt ───────────────────────────────────────────────────

/** Parse one garment token: category[/type-or-length].fit.color=Title[@y0-y1[,xc[,widen]] | @full] */
function parseGarment(token, where) {
  let rest = token.trim();
  const out = {};
  const at = rest.lastIndexOf("@");
  if (at !== -1) {
    const crop = rest.slice(at + 1).trim();
    rest = rest.slice(0, at);
    if (crop === "full") out.full = true;
    else {
      const [range, xc, widen] = crop.split(",");
      const m = /^(-?[\d.]+)-(-?[\d.]+)$/.exec(range ?? "");
      if (!m) throw new Error(`${where}: bad crop "@${crop}" (expected @y0-y1[,xc[,widen]] or @full)`);
      out.span = [Number(m[1]), Number(m[2])];
      if (xc) out.xc = Number(xc);
      if (widen) out.widen = Number(widen);
    }
  }
  const eq = rest.indexOf("=");
  if (eq === -1) throw new Error(`${where}: garment "${token}" needs a title after "="`);
  const title = rest.slice(eq + 1).trim();
  const [catPart, fit, color] = rest.slice(0, eq).trim().split(".");
  const [category, sub] = catPart.split("/");
  if (!FITS.has(fit)) throw new Error(`${where}: fit must be slim/regular/baggy in "${token}"`);
  if (!color) throw new Error(`${where}: missing colour in "${token}"`);
  const g = { category, fit, color, title };
  if (sub) {
    if (category === "skirts" || (category === "dresses" && ["mini", "midi", "maxi"].includes(sub))) g.length = sub;
    else g.type = sub;
  }
  return { ...g, ...out };
}

function readSources() {
  const looks = [];
  const seen = new Set();
  const lines = fs.readFileSync(SRC_FILE, "utf8").split("\n");
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const where = `looks.src.txt line ${i + 1}`;
    const f = line.split("|");
    if (f.length !== 8) throw new Error(`${where}: expected 8 fields separated by "|", found ${f.length}`);
    const [id, file, sec, show, geo, vibes, formality, garments] = f.map((s) => s.trim());
    if (seen.has(id)) throw new Error(`${where}: duplicate look id "${id}"`);
    seen.add(id);
    if (!SECTION[sec]) throw new Error(`${where}: section must be w, m or u`);
    const [cx, y0, y1] = geo.split(",").map(Number);
    if (![cx, y0, y1].every(Number.isFinite)) throw new Error(`${where}: position must be "cx,top,bottom"`);
    looks.push({
      id,
      file: file.replace(/^File:/, ""),
      section: SECTION[sec],
      show,
      geo: { cx, y0, y1 },
      vibes: vibes.split(",").map((v) => v.trim()).filter(Boolean),
      formality: Number(formality),
      garments: garments.split(";").filter((t) => t.trim()).map((t) => parseGarment(t, where)),
    });
  });
  return looks;
}

// ── 2. Size, licence & author metadata from Wikimedia Commons ───────────────

const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback);

/** Remove HTML tags/entities from Commons' "Artist" field. */
const plain = (html) =>
  String(html ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

async function commonsApi(params) {
  // One request at a time, ~7 s apart: inside Wikimedia's limit for unidentified scripts.
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(7000);
    const res = await fetch("https://commons.wikimedia.org/w/api.php", {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ format: "json", formatversion: "2", ...params }),
    });
    if (res.ok) return res.json();
    const wait = Number(res.headers.get("retry-after")) || 30;
    console.warn(`  Commons API said ${res.status}; waiting ${wait}s…`);
    await sleep(wait * 1000);
  }
  throw new Error("Commons API kept refusing — try again later.");
}

async function ensureMetadata(looks, meta) {
  const missing = [...new Set(looks.map((l) => l.file))].filter((t) => !meta[t]);
  for (let i = 0; i < missing.length; i += 40) {
    const batch = missing.slice(i, i + 40);
    console.log(`Asking Commons about ${batch.length} new photo(s)…`);
    const data = await commonsApi({
      action: "query",
      prop: "imageinfo",
      iiprop: "url|size|extmetadata",
      iiurlwidth: "500",
      titles: batch.map((t) => `File:${t}`).join("|"),
    });
    for (const page of data.query?.pages ?? []) {
      const info = page.imageinfo?.[0];
      if (!info) {
        console.warn(`  ! not found on Commons: ${page.title}`);
        continue;
      }
      const ext = info.extmetadata ?? {};
      meta[page.title.replace(/^File:/, "")] = {
        thumb: info.thumburl,
        page: info.descriptionurl,
        w: info.width,
        h: info.height,
        license: plain(ext.LicenseShortName?.value) || "see source",
        licenseUrl: plain(ext.LicenseUrl?.value) || info.descriptionurl,
        author: plain(ext.Artist?.value) || "unknown",
      };
    }
  }
}

/**
 * The hot-link address of a photo, with "{w}" where the width goes, e.g.
 *   https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/X.jpg/{w}px-X.jpg
 * The app fills in a standard thumbnail width that suits the screen.
 */
function thumbTemplate(info, file) {
  const url = String(info.thumb ?? "").split("?")[0];
  if (!/\/\d+px-[^/]+$/.test(url)) throw new Error(`no scalable thumbnail for "${file}" (photo too small?)`);
  return url.replace(/\/\d+px-([^/]+)$/, "/{w}px-$1");
}

// ── 3. Framing ──────────────────────────────────────────────────────────────

/**
 * Where to frame one look, from the person's position in the photo.
 *   geo   = { cx, y0, y1 }: body centre-x, head-top, soles — % of the photo
 *   W, H  = the photo's size in pixels
 * Returns
 *   frame = [left, top, width, height] as FRACTIONS of the photo. A frame can
 *           poke out past the photo's sides when the photo is narrower than 2:3
 *           (the app fills that with the page background) — never cutting the person.
 *   fig   = [head-top, soles, centre-x] in % OF THE FRAME.
 */
function frameFor(geo, W, H) {
  const { cx, y0, y1 } = geo;
  const ph = Math.min(H, (((y1 - y0) / 100) * H) / (1 - HEAD_ROOM - FOOT_ROOM));
  const pw = ph * FRAME_ASPECT;
  const cxPx = (cx / 100) * W;
  let left;
  if (pw > W) {
    // Narrow photo: let the frame overhang by the missing width, split so the
    // person stays as central as possible.
    const deficit = pw - W;
    left = -Math.max(0, Math.min(deficit, pw / 2 - cxPx));
  } else {
    left = Math.max(0, Math.min(W - pw, cxPx - pw / 2));
  }
  const top = Math.max(0, Math.min(H - ph, (y0 / 100) * H - HEAD_ROOM * ph));
  const r4 = (n) => Math.round(n * 10000) / 10000;
  const r1 = (n) => Math.round(n * 10) / 10;
  return {
    frame: [r4(left / W), r4(top / H), r4(pw / W), r4(ph / H)],
    fig: [r1((((y0 / 100) * H - top) / ph) * 100), r1((((y1 / 100) * H - top) / ph) * 100), r1(((cxPx - left) / pw) * 100)],
  };
}

// ── 4. The generated TypeScript ─────────────────────────────────────────────

function writeTs(looks, meta) {
  const q = (s) => JSON.stringify(s);
  const garmentTs = (g) => {
    const parts = [`category: ${q(g.category)}`];
    if (g.type) parts.push(`type: ${q(g.type)}`);
    if (g.length) parts.push(`length: ${q(g.length)}`);
    parts.push(`fit: ${q(g.fit)}`, `color: ${q(g.color)}`, `title: ${q(g.title)}`);
    if (g.full) parts.push("full: true");
    if (g.span) parts.push(`span: [${g.span.join(", ")}]`);
    if (g.xc !== undefined) parts.push(`xc: ${g.xc}`);
    if (g.widen !== undefined) parts.push(`widen: ${g.widen}`);
    return `      { ${parts.join(", ")} },`;
  };
  let written = 0;
  const body = looks
    .map((l) => {
      const m = meta[l.file];
      if (!m) {
        console.warn(`  ! skipping ${l.id}: no Commons metadata for "${l.file}"`);
        return null;
      }
      let src;
      try {
        src = thumbTemplate(m, l.file);
      } catch (e) {
        console.warn(`  ! skipping ${l.id}: ${e.message}`);
        return null;
      }
      const { frame, fig } = frameFor(l.geo, m.w, m.h);
      written++;
      return [
        "  {",
        `    id: ${q(l.id)},`,
        `    show: ${q(l.show)},`,
        `    section: ${q(l.section)},`,
        `    vibes: [${l.vibes.map(q).join(", ")}],`,
        `    formality: ${l.formality},`,
        `    photo: { src: ${q(src)}, width: ${m.w}, height: ${m.h} },`,
        `    frame: [${frame.join(", ")}],`,
        `    fig: [${fig.join(", ")}],`,
        `    credit: { author: ${q(m.author)}, title: ${q(l.file)}, license: ${q(m.license)}, licenseUrl: ${q(m.licenseUrl)}, source: ${q(m.page)} },`,
        "    garments: [",
        ...l.garments.map(garmentTs),
        "    ],",
        "  },",
      ].join("\n");
    })
    .filter(Boolean)
    .join("\n");

  const ts = `/**
 * ⚠️  GENERATED FILE — do not edit by hand.
 *
 * Made by tools/build-looks.mjs from tools/looks/looks.src.txt.
 * To change a look (its tags, garment names, crops), edit looks.src.txt and run:
 *     npm run looks
 *
 * Each entry is ONE real photo ("runway look"), shown straight from Wikimedia
 * Commons (\`photo.src\`, nothing is downloaded). data/catalog.ts turns every
 * garment listed here into a piece the app can show, crop and combine.
 * Photos are under the licence named in each \`credit\`.
 */

import type { LookSource } from "./types";

export const LOOK_SOURCES: LookSource[] = [
${body}
];
`;
  fs.writeFileSync(TS_FILE, ts);
  return written;
}

// ── 5. The credits file ─────────────────────────────────────────────────────

function writeCredits(looks, meta) {
  const cell = (s) => String(s).replace(/\|/g, "\\|");
  const rows = looks
    .filter((l) => meta[l.file])
    .map((l) => {
      const m = meta[l.file];
      return `| \`${l.id}\` | [${cell(l.file)}](${m.page}) | ${cell(m.author)} | [${cell(m.license)}](${m.licenseUrl}) |`;
    });
  const md = `# Photo credits

Every runway look in the app is a photo hosted on
[Wikimedia Commons](https://commons.wikimedia.org/) and shown directly from
Wikimedia's servers — the app crops it in the browser, nothing is copied into
this project. Each photo keeps the licence of its original (listed below):
CC BY, CC BY-SA or CC0. The app credits the photographer and licence under
every large image.

This file is generated by \`npm run looks\` (tools/build-looks.mjs) — don't edit it by hand.

| Look | Original | Photographer / source | Licence |
| --- | --- | --- | --- |
${rows.join("\n")}
`;
  fs.writeFileSync(CREDITS_FILE, md);
}

// ── Main ────────────────────────────────────────────────────────────────────

const looks = readSources();
const meta = readJson(COMMONS_FILE, {});
if (!OFFLINE) {
  await ensureMetadata(looks, meta);
  fs.writeFileSync(COMMONS_FILE, JSON.stringify(Object.fromEntries(Object.keys(meta).sort().map((k) => [k, meta[k]])), null, 1) + "\n");
}
const written = writeTs(looks, meta);
writeCredits(looks, meta);
console.log(`Wrote ${path.relative(ROOT, TS_FILE)} with ${written} of ${looks.length} looks, and ${path.relative(ROOT, CREDITS_FILE)}.`);
