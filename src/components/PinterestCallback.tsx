/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  components/PinterestCallback.tsx — the page Pinterest sends you back to
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  After "Connect Pinterest" (About page) and approving on pinterest.com,
 *  Pinterest returns the browser to  <site>/pinterest/callback/?code=…&state=…
 *  This page checks the `state`, hands the one-time `code` to the server
 *  (lib/pinterest.ts → finishPinterestConnect) and says how it went.
 *  main.tsx shows this page instead of the app when the address is that path.
 */

import { useEffect, useRef, useState } from "react";
import { sitePath } from "../lib/paths";
import { finishPinterestConnect } from "../lib/pinterest";
import { SITE } from "../site";

export function PinterestCallback() {
  const [state, setState] = useState<{ phase: "working" } | { phase: "done"; username: string } | { phase: "failed"; message: string }>({ phase: "working" });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // React's dev mode runs effects twice; a code works only once
    started.current = true;
    finishPinterestConnect(window.location.search)
      .then(({ username }) => setState({ phase: "done", username }))
      .catch((e: Error) => setState({ phase: "failed", message: e.message }));
    // Don't leave the one-time code sitting in the address bar / history.
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  return (
    <main className="callback">
      <a className="callback-brand" href={sitePath()}>
        {SITE.name}
      </a>
      {state.phase === "working" && (
        <>
          <h1 className="display">Connecting Pinterest…</h1>
          <p>Checking with Pinterest. This takes a second.</p>
        </>
      )}
      {state.phase === "done" && (
        <>
          <h1 className="display">Pinterest connected</h1>
          <p>
            Connected as <strong>@{state.username}</strong>. Pins from that account’s public boards will appear in the feed
            within about five minutes.
          </p>
          <a className="btn btn-primary" href={sitePath("#/about")}>
            Back to the site
          </a>
        </>
      )}
      {state.phase === "failed" && (
        <>
          <h1 className="display">Couldn’t connect</h1>
          <p>{state.message}</p>
          <a className="btn btn-primary" href={sitePath("#/about")}>
            Back to About
          </a>
        </>
      )}
    </main>
  );
}
