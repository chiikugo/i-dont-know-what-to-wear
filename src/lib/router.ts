/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  lib/router.ts — a 30-line "router" built on the URL hash
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHAT A ROUTER DOES
 *  It decides which "page" to show based on the address bar. We have five:
 *      #/home     the endless home feed (and the Menswear/Womenswear gate)
 *      #/build    the outfit builder: questions, then the stack of cards
 *      #/runway   the finished look
 *      #/closet   saved outfits
 *      #/about    what the site is, its sources, how it uses Pinterest
 *  (The Privacy and Terms pages are separate plain HTML pages: /privacy/, /terms/.)
 *
 *  WHY THE HASH (#/…) AND NOT A LIBRARY?
 *  Everything after the `#` never leaves the browser, so this works on any
 *  static host with no server config, the Back button works, and a refresh
 *  keeps you on the same page. For an app this size a router library would be
 *  more code to learn than the problem needs. If the app grows, swap this file
 *  for react-router — only `useRoute()` and `navigate()` are used elsewhere.
 *
 *  HOW IT WORKS
 *  `useSyncExternalStore` is React's official way to read something that lives
 *  outside React (here: window.location.hash) and re-render when it changes.
 */

import { useSyncExternalStore } from "react";

/** The pages of the app. */
export type Route = "home" | "build" | "runway" | "closet" | "about";

/** Every valid route (used to validate whatever is in the URL). */
export const ROUTES: Route[] = ["home", "build", "runway", "closet", "about"];

/** Read the current route from the URL hash, defaulting to "home". */
function readRoute(): Route {
  const name = window.location.hash.replace(/^#\/?/, "").split("/")[0];
  return (ROUTES as string[]).includes(name) ? (name as Route) : "home";
}

/** Tell React to re-render when the hash changes. */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/** Go to a page. (Changing the hash also fires `hashchange`.) */
export function navigate(route: Route): void {
  if (readRoute() !== route) window.location.hash = `/${route}`;
}

/** React hook: the current route (re-renders when it changes). */
export function useRoute(): Route {
  return useSyncExternalStore(subscribe, readRoute, () => "home" as Route);
}
