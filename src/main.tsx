/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  main.tsx — where the app starts
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  The browser loads index.html, which contains an empty
 *      <div id="root"></div>
 *  and a <script> pointing at THIS file. React then takes over that div and
 *  draws the whole app inside it.
 *
 *  Reading order for the codebase:  main.tsx → App.tsx → (any component).
 *  App.tsx has a map of how everything connects.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { PinterestCallback } from "./components/PinterestCallback";
import { CALLBACK_PATH } from "./lib/pinterest";
// One import pulls in ALL the styling (see the table of contents in styles.css).
import "./styles.css";

// Coming back from Pinterest's sign-in (<site>/pinterest/callback/?code=…)?
// Then show that small page instead of the app (see lib/pinterest.ts).
const isPinterestCallback = window.location.pathname.startsWith(CALLBACK_PATH.replace(/\/$/, ""));

createRoot(document.getElementById("root")!).render(
  // StrictMode is a development-only helper: it deliberately runs some code
  // twice to expose bugs early. It has no effect in the production build.
  <StrictMode>{isPinterestCallback ? <PinterestCallback /> : <App />}</StrictMode>,
);
