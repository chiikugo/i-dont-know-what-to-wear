#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  tools/deploy-pages.mjs — publish the site on GitHub Pages (free)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  RUN IT WITH
 *      npm run deploy
 *
 *  WHAT IT DOES
 *   1. Works out the GitHub repo from `git remote get-url origin`
 *      (here: chiikugo/i-dont-know-what-to-wear).
 *   2. Builds the site for the folder GitHub Pages serves it from
 *      (BASE_PATH=/<repo>/ — see vite.config.ts), type-check included.
 *   3. Copies the finished site (dist/) into a temporary folder and commits it
 *      as the ONLY content of a branch called `gh-pages`. Your source code and
 *      your other branches are not touched or pushed.
 *   4. Pushes that branch to GitHub (replacing the previous build).
 *  GitHub then serves it at  https://<user>.github.io/<repo>/
 *
 *  FIRST TIME ONLY: GitHub usually switches Pages on by itself when a gh-pages
 *  branch arrives. If the address shows a 404 after a couple of minutes, open
 *  the repo on GitHub → Settings → Pages → "Deploy from a branch" → gh-pages,
 *  folder "/ (root)" → Save.
 *
 *  It uses your normal git login (no tokens are read or stored by this script).
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit", ...opts });
const read = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", ...opts }).trim();

// 1 ── which repo?
const remote = read("git", ["remote", "get-url", "origin"]);
const match = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/);
if (!match) {
  console.error(`The "origin" remote isn't a GitHub repo (${remote}).`);
  process.exit(1);
}
const [, owner, repo] = match;
const base = `/${repo}/`;
const siteUrl = `https://${owner.toLowerCase()}.github.io${base}`;
console.log(`\n▸ Building for ${siteUrl}\n`);

// 2 ── build for that folder
run("npm", ["run", "build"], { env: { ...process.env, BASE_PATH: base } });

// 3 ── the built site, alone, on a fresh gh-pages branch
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wtw-pages-"));
fs.cpSync(path.join(ROOT, "dist"), dir, { recursive: true });
fs.writeFileSync(path.join(dir, ".nojekyll"), ""); // serve files exactly as they are
const inDir = { cwd: dir };
const message = [`Deploy What to Wear — ${new Date().toISOString()}`, process.env.DEPLOY_TRAILER ?? ""].filter(Boolean).join("\n\n");
run("git", ["init", "-q", "-b", "gh-pages"], inDir);
run("git", ["add", "-A"], inDir);
run("git", ["commit", "-q", "-m", message], inDir);

// 4 ── push (never prompt in the terminal: use the git login you already have)
console.log(`\n▸ Pushing the gh-pages branch to ${owner}/${repo}\n`);
run("git", ["push", "--force", remote, "gh-pages:gh-pages"], { ...inDir, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
fs.rmSync(dir, { recursive: true, force: true });

console.log(`\n✓ Published. In a minute or two it's live at:\n  ${siteUrl}\n  ${siteUrl}privacy/   ${siteUrl}terms/   ${siteUrl}#/about\n`);
