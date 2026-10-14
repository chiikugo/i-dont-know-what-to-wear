/**
 * Vite is the tool that serves the site while you work on it (`npm run dev`)
 * and bundles it for production (`npm run build`).
 *
 * `defineConfig` comes from "vitest/config" (instead of "vite") only so that the
 * `test` block below is type-checked. It is otherwise identical.
 *
 * FOUR PAGES
 *   index.html                     the app itself (every app "page" lives behind #/…)
 *   privacy/index.html             the Privacy Policy   → /privacy/
 *   terms/index.html               the Terms of Service → /terms/
 *   pinterest/callback/index.html  where Pinterest's sign-in returns (loads the app)
 * Privacy and Terms are plain HTML (they work with JavaScript off — that's what
 * Pinterest's reviewers and search engines see). The `siteFacts` plugin below
 * fills in their `%SITE_…%` placeholders from src/site.ts.
 *
 * WHERE THE SITE LIVES
 * BASE_PATH sets the folder the site is served from: "/" (default — the dev
 * server, Firebase) or "/i-dont-know-what-to-wear/" for GitHub Pages
 * (tools/deploy-pages.mjs sets it). Links inside the app use it via
 * import.meta.env.BASE_URL (src/lib/paths.ts).
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { SITE } from "./src/site";

const root = fileURLToPath(new URL(".", import.meta.url));

/** The folder the site is served from (always starts and ends with "/"). */
const base = `/${(process.env.BASE_PATH ?? "/").replace(/^\/+|\/+$/g, "")}/`.replace(/\/+/g, "/");

/**
 * The Content-Security-Policy baked into every built page: scripts only from
 * the site itself; pictures from any https host (the publishers — nothing is
 * copied); data from https APIs (Supabase, Vogue's feeds, the V&A, Openverse);
 * frames only from YouTube's privacy-enhanced player. (Hosts that can send
 * headers — firebase.json — send the same policy as a header.)
 */
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com data:; img-src 'self' https: data: blob:; connect-src 'self' https:; " +
  "frame-src https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests";

/** Make a value safe to put inside HTML. */
function html(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Replace %SITE_NAME%, %SITE_URL%, %SITE_CONTACT%… in every HTML page with the facts in src/site.ts. */
function siteFacts(): Plugin {
  const contact = SITE.contactEmail
    ? `<a href="mailto:${html(SITE.contactEmail)}">${html(SITE.contactEmail)}</a>`
    : `the contact details on <a href="${base}#/about">the About page</a>`;
  const values: Record<string, string> = {
    NAME: html(SITE.name),
    URL: html(SITE.url),
    OWNER: html(SITE.owner),
    DATE: html(SITE.policyDate),
    REGION: html(SITE.dataRegion),
    CONTACT: contact,
    BASE: base,
  };
  return {
    name: "site-facts",
    transformIndexHtml(page, ctx) {
      let out = page.replace(/%SITE_([A-Z]+)%/g, (match, key: string) => values[key] ?? match);
      // The security policy goes into BUILT pages only (the dev server needs
      // inline scripts for instant reloading).
      if (!ctx.server) out = out.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
      return out;
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), siteFacts()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        privacy: resolve(root, "privacy/index.html"),
        terms: resolve(root, "terms/index.html"),
        pinterestCallback: resolve(root, "pinterest/callback/index.html"),
      },
    },
  },
  // `npm test` — unit tests for the pure logic (engine, model, catalog).
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
