/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  components/About.tsx — what the site is, where the looks come from, and
 *  how it uses Pinterest  (#/about)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Written for two readers at once: a visitor who wonders where the pictures
 *  come from, and a Pinterest app reviewer checking how the API is used.
 *
 *    1. How it works       the feed → the stack of cards → the runway
 *    2. Where looks come from  every live source with its status right now,
 *                          the runway catalog and its photo credits
 *    3. Pinterest          exactly what is read, what isn't, and the owner's
 *                          "Connect Pinterest" panel (lib/pinterest.ts)
 *    4. Your data          what's stored, and a button to clear this device
 *    5. Contact · Privacy · Terms
 */

import { useEffect, useMemo, useState } from "react";
import { LOOKS } from "../data/catalog";
import { showOf } from "../data/shows";
import { sitePath } from "../lib/paths";
import { getPinterestStatus, PINTEREST_SCOPES, redirectUri, startPinterestConnect, type PinterestStatus } from "../lib/pinterest";
import { timeAgo } from "../live/feed";
import { REFRESH_MINUTES } from "../live/sources";
import { useLiveFeed } from "../live/useLiveFeed";
import { contactHref, SITE } from "../site";

export function About() {
  const live = useLiveFeed();

  // One credit line per runway photo, grouped by photographer for reading.
  const credits = useMemo(
    () =>
      LOOKS.map((look) => ({ id: look.id, house: showOf(look.show).house, season: showOf(look.show).season, credit: look.credit })).sort(
        (a, b) => a.credit.author.localeCompare(b.credit.author) || a.house.localeCompare(b.house),
      ),
    [],
  );

  return (
    <div className="about">
      <header className="about-head">
        <p className="eyebrow is-accent">About</p>
        <h1 className="about-title display">
          {SITE.name}, <em>explained</em>
        </h1>
        <p className="about-lede">
          A personal fashion site: an endless, slowly drifting wall of runway and street-style looks. Open any look as a stack of
          cards, pick the pieces you like, and build a whole outfit from just one of them.
        </p>
      </header>

      <section className="about-section" aria-labelledby="about-how">
        <h2 id="about-how" className="display">
          How it works
        </h2>
        <ol className="about-steps">
          <li>
            <strong>The feed.</strong> The home page scrolls itself, slowly. It mixes the newest looks online with real runway
            photographs. Any scroll, swipe or mouse movement pauses it, and the Pause button stops it.
          </li>
          <li>
            <strong>The stack.</strong> Hover a post (or click it) and it opens as a stack of cards: the post on top, then one
            card per garment. Hover the stack to fan it out, then click a card to change, refine, keep or delete that piece.
          </li>
          <li>
            <strong>The runway.</strong> Send the finished look down the runway, with links to the shows its pieces came from.
            Save it to your Closet. A small learning model (“Muse”) notices what you choose and tunes what the feed shows next.
          </li>
        </ol>
      </section>

      <section className="about-section" aria-labelledby="about-sources">
        <h2 id="about-sources" className="display">
          Where the looks come from
        </h2>
        <p>
          Nothing is copied. Every picture loads straight from where it’s published, and every post links back to the
          original. Live sources refresh every {REFRESH_MINUTES} minutes
          {live.updatedAt ? ` (last refreshed ${timeAgo(new Date(live.updatedAt).toISOString())})` : ""}.
        </p>
        <ul className="about-sources">
          {live.statuses.length === 0 && <li className="about-source">Connecting to the live sources…</li>}
          {live.statuses
            .filter((s) => s.id !== "relay")
            .map((s) => (
              <li key={s.id} className={`about-source${s.ok ? "" : " is-off"}`}>
                <span className="about-source-name">{s.name}</span>
                <span className="about-source-state">
                  {s.ok ? `${s.count} ${s.count === 1 ? "post" : "posts"}` : /not connected/i.test(s.error ?? "") ? "not connected yet" : `unavailable (${s.error ?? "error"})`}
                </span>
              </li>
            ))}
        </ul>
        <p>
          <strong>The runway catalog</strong> (the garments you build with) is {LOOKS.length} runway, street-style and museum
          photographs from Wikimedia Commons, each published by its photographer under a Creative Commons licence.
          <strong> Linked, never shown:</strong> firstVIEW, Vogue Runway’s galleries, ARCHIVE.pdf and WWD. They have no public
          way to show their photos, so every look links to them instead.
        </p>
        <details className="about-credits">
          <summary>Photo credits ({credits.length})</summary>
          <ul>
            {credits.map((c) => (
              <li key={c.id}>
                {c.house}
                {c.season ? `, ${c.season}` : ""} — photo by{" "}
                <a href={c.credit.source} target="_blank" rel="noreferrer noopener">
                  {c.credit.author}
                </a>
                ,{" "}
                <a href={c.credit.licenseUrl} target="_blank" rel="noreferrer noopener">
                  {c.credit.license}
                </a>
                , cropped
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section className="about-section" aria-labelledby="about-pinterest">
        <h2 id="about-pinterest" className="display">
          How this site uses Pinterest
        </h2>
        <ul className="about-list">
          <li>
            <strong>The site owner’s own boards</strong> are read with Pinterest’s official API (v5). The owner connected their
            own account through Pinterest’s sign-in (OAuth), with read-only access ({PINTEREST_SCOPES.join(", ")}).
          </li>
          <li>
            <strong>Visitors never sign in to Pinterest here.</strong> The site never creates, saves, edits or deletes pins or
            boards, and it can’t act on anyone’s account.
          </li>
          <li>
            Pins are fetched live and shown exactly as they are: never cropped, filtered or covered. Each is labelled as coming
            from Pinterest and links back to the pin.
          </li>
          <li>
            Pinterest data is never stored in a database, sold, shared, used for ads or used to train AI. A copy is held in
            server memory for at most five minutes, to avoid repeating the same request.
          </li>
          <li>Public Pinterest profile feeds of fashion houses and magazines (Dior, Prada, Vogue…) appear too, with links back.</li>
        </ul>
        <PinterestConnect />
      </section>

      <section className="about-section" aria-labelledby="about-data">
        <h2 id="about-data" className="display">
          Your data
        </h2>
        <p>
          No accounts, no tracking, no ads. Your outfits and Muse’s taste notes live in this browser. If cloud sync is on, saved
          looks are also kept under an anonymous ID with no name or email attached. The full details are in the{" "}
          <a href={sitePath("privacy/")}>Privacy Policy</a>.
        </p>
        <ClearDeviceData />
      </section>

      <section className="about-section" aria-labelledby="about-contact">
        <h2 id="about-contact" className="display">
          Contact
        </h2>
        <p>
          {SITE.contactEmail ? (
            <>
              Questions, credits or removal requests: <a href={contactHref()}>{SITE.contactEmail}</a>.
            </>
          ) : (
            <>Questions, credits or removal requests: contact the site owner.</>
          )}{" "}
          <a href={sitePath("privacy/")}>Privacy Policy</a> · <a href={sitePath("terms/")}>Terms of Service</a>
        </p>
      </section>
    </div>
  );
}

/** The site owner's "Connect Pinterest" panel. Anyone can see it; only the owner's account can connect. */
function PinterestConnect() {
  const [status, setStatus] = useState<PinterestStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getPinterestStatus()
      .then((s) => alive && setStatus(s))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="pin-connect" aria-live="polite">
      <p className="eyebrow">For the site owner</p>
      {error && <p>The Pinterest connection service didn’t answer ({error}).</p>}
      {!error && !status && <p>Checking the Pinterest connection…</p>}
      {status && !status.configured && (
        <p>
          <strong>Not set up yet.</strong> Once Pinterest approves the developer app, add its app ID and secret to the server
          (Supabase secrets <code>PINTEREST_APP_ID</code>, <code>PINTEREST_APP_SECRET</code>) and the Pinterest username
          allowed to connect (<code>PINTEREST_OWNER_USERNAME</code>). The steps are in docs/PINTEREST_APPLICATION.md.
        </p>
      )}
      {status?.configured && !status.ownerSet && (
        <p>
          <strong>Almost ready.</strong> Add the secret <code>PINTEREST_OWNER_USERNAME</code> (your Pinterest username), so only
          your account can be connected.
        </p>
      )}
      {status?.connected && (
        <p>
          <strong>Connected as @{status.connected.username}.</strong> Pins from that account’s public boards appear in the feed
          {status.connected.since ? ` (connected ${timeAgo(status.connected.since)})` : ""}.
        </p>
      )}
      {status?.configured && status.ownerSet && status.appId && (
        <button type="button" className="btn btn-primary btn-sm" onClick={() => (window.location.href = startPinterestConnect(status.appId!))}>
          {status.connected ? "Reconnect Pinterest" : "Connect Pinterest"}
        </button>
      )}
      <p className="pin-connect-note">
        Redirect URI to register in the Pinterest app (exactly, with the final “/”): <code>{redirectUri()}</code>
      </p>
    </div>
  );
}

/** "Clear this device's data": everything the site saved in this browser. */
function ClearDeviceData() {
  const [confirming, setConfirming] = useState(false);
  const clear = () => {
    try {
      for (const store of [window.localStorage, window.sessionStorage]) {
        for (const key of Object.keys(store)) if (key.startsWith("wtw.") || key.startsWith("sb-")) store.removeItem(key);
      }
    } catch {
      /* storage blocked — nothing to clear */
    }
    window.location.replace(sitePath());
  };
  return confirming ? (
    <p className="about-clear">
      This removes your saved looks, taste notes and preferences from this browser.{" "}
      <button type="button" className="btn btn-sm" onClick={clear}>
        Yes, clear it
      </button>{" "}
      <button type="button" className="link-btn" onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </p>
  ) : (
    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(true)}>
      Clear this device’s data
    </button>
  );
}
