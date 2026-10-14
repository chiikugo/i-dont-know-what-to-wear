/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  lib/paths.ts — links that work wherever the site is hosted
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  The site can live at the root of a domain (https://example.web.app/) or in
 *  a sub-folder (https://chiikugo.github.io/i-dont-know-what-to-wear/ on GitHub
 *  Pages). Vite knows which — the `base` set when building (see vite.config.ts
 *  and tools/deploy-pages.mjs) — and exposes it as import.meta.env.BASE_URL.
 *  Every link to another page of the site goes through `sitePath` so it points
 *  inside that folder.
 */

/** The site's folder, always ending in "/": "/" or "/i-dont-know-what-to-wear/". */
export const BASE = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;

/** A page of this site: sitePath("privacy/") → "/i-dont-know-what-to-wear/privacy/". */
export function sitePath(path = ""): string {
  return BASE + path.replace(/^\//, "");
}
