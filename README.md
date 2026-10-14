# What to Wear

> *I don't know what to wear.* Pick **one** piece — I'll ask a few questions about it, build the rest of the outfit, learn your taste as you go, and send the look down a runway.
>
> Every garment in the app is cut from a **real runway, street-style or archive photo** — Alexander McQueen, Max Mara, Michael Kors, 3.1 Phillip Lim, Y-3, Diane von Furstenberg, Iris van Herpen, Oliver Spencer, Astrid Andersen, Raf Simons, Comme des Garçons, Margiela and more — and every look links to its show on **Vogue Runway, firstVIEW, ARCHIVE.pdf and WWD**.
>
> The home page is an **endless, slowly drifting wall** of the newest looks — Vogue Runway, British Vogue, GQ, the houses' own Pinterest and YouTube channels (Dior, Saint Laurent, Prada, Louis Vuitton, Chanel…), Harper's Bazaar, ELLE, W, Hypebeast, Dazed, the V&A museum and Creative Commons runway photography — mixed with the app's own runway looks, refreshing itself every few minutes. **Click a post and it opens as a stack of cards**: fan the stack out, pick a piece, change, refine, keep or delete it — then **add the stack to your pile** in the bottom-left corner and keep browsing.
>
> **Nothing is downloaded.** Every picture is shown straight from where it lives (Wikimedia, Vogue, Pinterest, YouTube…), always linking back to the original.

A React + TypeScript site. No server of your own. Optional free Supabase database.

---

## What it does

| | |
|---|---|
| **Start** | Choose **Menswear** or **Womenswear** on a split-screen gate. |
| **Home** | An **endless, asymmetrical wall** of posts that **scrolls itself slowly downward** (any scroll, swipe or mouse movement pauses it; there's a Pause button). Live looks from the web mix with the app's own runway looks and garments, ordered by a small learning model ("**Muse**"). Chips filter it (Runway · Shows · Street style · Pinterest · Archive · Garments, and moods). |
| **The stack** | **Click a post** (tap on a phone) and it opens on the next page as a **stack of cards** — nothing opens just because the mouse rests on it: the post on top, one card per garment of an outfit built from it. **Hover the stack** to fan it out like a hand of cards and pick a piece; **click a card** for *Change* (choose from the best alternatives) · *Refine* (questions) · *Keep* · *Delete* (with Undo). On a phone: tap to fan, slide a finger across, let go to pick. Then **＋ Add to your stacks** sets it aside and takes you back to the feed. |
| **Your stacks** | The pile in the **bottom-left corner** holds every stack you added (on this device). Click it for the list: re-open a stack, send it **down the runway**, or remove it. |
| **Build** | Or start from a category (say *Shirts*): a garment cropped from a runway photo asks *"Slim fit or baggy?"* → *which tone?* → *what mood?* → *whose runway?* — as many or as few questions as you like. Then the **outfit engine** builds everything else (bottoms, shoes, layer, accessory) from that one piece, preferring pieces that walked together on the runway, and lands on the stack of cards. |
| **Runway** | The finished look is presented like a show: it "walks in", gets a name, silhouette, palette, styling notes; **Seen on the runway** shows the original photos with links to those exact shows on **Vogue Runway, firstVIEW, ARCHIVE.pdf and WWD**; plus editorial and shopping links (Harper's Bazaar/GQ, Elle, Highsnobiety, Dazed, SSENSE, Farfetch, ASOS, Pinterest). |
| **Closet** | Save looks. Stored in this browser — and in **Supabase** once you connect it. |
| **Muse** | The ✦ button shows exactly what the model has learned about you, and lets you reset it. |
| **About · Privacy · Terms** | `#/about` explains the sources (with each one's live status), how the site uses Pinterest, photo credits, and has "Clear this device's data". `/privacy/` and `/terms/` are plain pages for Pinterest's app review. |

## Quick start

```bash
npm install        # once
npm run dev        # http://localhost:5173
```

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Type-check, then make the production site in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the unit tests (engine, model, state machine, catalog integrity, photo licences) |
| `npm run deploy` | Build and publish to GitHub Pages (see "Hosting" below) |
| `npm run looks` | Regenerate the runway catalog after editing `tools/looks/looks.src.txt` (see below) — only reads photo metadata, never downloads images |
| `npm run test:watch` | Re-run tests as you edit |
| `npm run typecheck` | TypeScript check only |

It works **fully offline from the first run** — no accounts, no keys. Supabase is optional (below).

---

## Connect Supabase (your closet in a real database)

The code is ready; you only need to create the database and paste two values. About five minutes, and the free tier is plenty.

> **Status of this repo's own project.** A Supabase project named **`what-to-wear`** (ref `grrgazuzjfmfqgwvarcr`, region `us-east-1`, free plan) has already been created and has the schema applied — steps 1, 2 and 4 below are **done**, and `.env.local` is filled in. The only thing left is **step 3** (the "anonymous sign-ins" switch, which can only be flipped in the dashboard) and a restart of `npm run dev`. The remaining steps stay here for anyone setting up their own copy.

### 1. Create a project
Go to <https://supabase.com> → **New project**. Pick any name and region; save the database password somewhere (you won't need it for this app).

### 2. Create the tables
Dashboard → **SQL Editor** → **New query** → paste the whole of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
That creates:

- `closet_outfits` — your saved looks (the **Closet** tab)
- `choice_events` — anonymous taste signals (what Muse learns from)
- `trending_features()` — the community aggregate

It is safe to run twice. Every table has row-level-security rules so each browser can only ever touch its own rows.

### 3. Allow anonymous sign-ins
Dashboard → **Authentication** → **Sign In / Providers** → enable **Allow anonymous sign-ins**.
(Each browser is signed in as a private anonymous user automatically — there is no login screen.)

### 4. Paste your keys
```bash
cp .env.example .env.local
```
Open `.env.local` and fill in:

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...            # the "anon" / "publishable" key
```
Both are on **Project Settings → API**. Then **restart** `npm run dev`.

### 5. Check it worked
Open the **Closet** tab. The badge at the top right should read **"Synced with Supabase"**. Save a look and you'll see a row appear under **Table Editor → closet_outfits**.

### If something's off

| You see | It means | Fix |
|---|---|---|
| *"Saved on this device · see README to sync"* | The two env vars are empty / not loaded | Fill `.env.local`, **restart** `npm run dev` |
| *"Anonymous sign-ins are off in your Supabase project…"* | Step 3 not done | Enable anonymous sign-ins |
| *"permission denied"* / *"row-level security"* errors | Step 2 didn't fully run | Re-run `schema.sql` |
| *"not synced yet"* on an outfit | You were offline / Supabase errored | Nothing — it uploads on the next start |
| Community rails never appear | `trending_features` needs ≥ 3 different people | Normal when you're the only user — see the `k_floor` comment in `schema.sql` |
| *"Can't reach Supabase right now…"* | Offline, or a **free project that paused** after a week idle | Dashboard → **Restore project**; nothing is lost |

### What gets stored, and what doesn't
- **Closet** rows: the outfit you saved (pieces, names, which runway photo each came from).
- **Taste events**: only labels such as `fit:baggy` with a yes/no and a weight. **Never** photos, outfits, names or e-mails. Switch it off any time in **Muse → Contribute anonymous picks**.
- Your closet is tied to *this browser's* anonymous identity. Clearing site data = a new identity (the old rows stay in the database but are unreachable). To roam across devices you'd add real sign-in — see "Known limits".

---

## The live feed (the endless home page)

The home page pulls the newest high-fashion looks from the web **every 3 minutes** (it pauses while the tab is hidden and catches up when you come back) and deals them into the endless wall between the app's own runway looks and garments. New arrivals carry a **New** tag. When the wall runs low it fetches another page of open-licence looks (Openverse, the V&A), so it never runs dry. Open a post and the stack of cards is built around the closest garment in the runway catalog (same designer if it has one, otherwise colour and mood); show films play on the top card. **Not for me** (✕ on a card) hides it and teaches Muse.

### Where the looks come from

| Source | What it gives | How it's read |
|---|---|---|
| **Vogue Runway** (RSS) | Show coverage, trend reports, street-style galleries | Straight from the browser |
| **British Vogue**, **GQ** (RSS) | Street style, collections, menswear — looks only, no shopping | Straight from the browser |
| **V&A museum** (open API) | Archive pieces: McQueen, Westwood, Balenciaga, Dior, Yohji… (more pages as you scroll) | Straight from the browser |
| **Openverse → Wikimedia Commons** (open API) | Creative Commons runway photos (e.g. Michael Kors, Diane von Furstenberg, Max Azria shows), each credited — a page at a time as you scroll | Straight from the browser |
| **Pinterest** — the houses' own profiles | Dior, Saint Laurent, Prada, Louis Vuitton, Balmain, Burberry, Oscar de la Renta, McQueen, Gucci | Relay (public profile feeds) |
| **Pinterest** — magazines' profiles | Vogue, British Vogue, W, GQ | Relay |
| **Pinterest — your own boards** | Whatever you pin (e.g. a "Runway" board of Vogue Runway pins) | Relay + the official Pinterest API, after you press **Connect Pinterest** (below) |
| **YouTube** — the houses' channels | Full show films: Chanel, Dior, Louis Vuitton, Prada, Gucci, Balenciaga, Loewe, Miu Miu, Valentino… | Relay (public channel feeds), played in YouTube's embed |
| **Harper's Bazaar, ELLE, W, Hypebeast, Dazed** (RSS) | Runway, street style, designers — looks only | Relay |

"Relay" = a tiny Supabase Edge Function, [`supabase/functions/live-feed`](supabase/functions/live-feed/index.ts), already **deployed to this repo's Supabase project**. It exists because those sites don't let a web page read their feeds directly (browsers block it), and because a Pinterest token must never be in the page. It only reads its fixed list of feeds, keeps each for 5 minutes in memory, stores nothing, and only answers requests that carry the project's publishable key.

### What was looked at and ruled out (October 2026)

| Option | Why not |
|---|---|
| Pinterest **search** API | Partner-only beta; the public API can only read boards of the account that authorised the app |
| Google image search API | Closed to new users; switching off for everyone on 1 January 2027 |
| Bing image search API | Retired in 2025 |
| Flickr API | New API keys now require a paid Flickr Pro account (Flickr's CC photos still arrive via Openverse) |
| The Met's Costume Institute API | Open (CC0) images for its 19th-century couture, and a new paginated search since 1 Oct 2026 — but it sits behind bot protection that blocked repeated requests, so it isn't reliable for a live feed |
| Instagram | No public feed — the API only reads your own business account |
| firstVIEW, Vogue Runway galleries, Tagwalk, Launchmetrics | No public API (subscriptions / business licensing only) — so the app links to them instead |

### Connect your own Pinterest boards (optional)

Pinterest's official API (v5) reads **the boards of the account that signs in** — so the way to "source looks through Pinterest" is: you curate public boards, connect your account once, and the feed reads them live. The whole sign-in ("OAuth") is built: **About page → Connect Pinterest** → Pinterest's consent screen → back to `/pinterest/callback/` → the server swaps the code for tokens (`supabase/functions/pinterest-auth`, already deployed), keeps them in a table the web page can't read, and renews them by itself. Only the account named in `PINTEREST_OWNER_USERNAME` can connect.

What you do (details and copy-paste answers in **[docs/PINTEREST_APPLICATION.md](docs/PINTEREST_APPLICATION.md)**):
1. The site is online (below) with your contact details — done.
2. Use a Pinterest **business** account (free) with at least one public board of looks.
3. Register an app at <https://developers.pinterest.com/apps/> with the site URL, `/privacy/` and the prepared description → wait for **Trial access**.
4. Add the redirect URI `https://chiikugo.github.io/i-dont-know-what-to-wear/pinterest/callback/` in the app's Configure tab, and three Supabase secrets: `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET`, `PINTEREST_OWNER_USERNAME`.
5. Press **Connect Pinterest** on the About page.

(Apps registered after 14 September 2026 can only read *business* accounts' boards unless Pinterest authorises more — reading your own business account's boards is exactly what this does.)

### Change the relay's sources

Edit `RSS_SOURCES` / `YOUTUBE_CHANNELS` in `supabase/functions/live-feed/index.ts`, then redeploy with the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase functions deploy live-feed --no-verify-jwt --project-ref grrgazuzjfmfqgwvarcr
```

(`--no-verify-jwt` is correct here: the function checks the publishable key itself, which is Supabase's recommended setup for the new key format.) If you edit `src/live/feedCore.ts`, copy it over `supabase/functions/live-feed/feedCore.ts` too — a test fails if the two drift apart.

---

## Hosting (GitHub Pages — live now)

The site is live at **https://chiikugo.github.io/i-dont-know-what-to-wear/** (Privacy: `/privacy/`, Terms: `/terms/`, About: `/#/about`).

```bash
npm run deploy
```

That runs [`tools/deploy-pages.mjs`](tools/deploy-pages.mjs): it builds the site for the `/i-dont-know-what-to-wear/` folder (type-check included), then pushes **only the built files** to the `gh-pages` branch of your GitHub repo — your source code and other branches aren't touched. GitHub serves that branch within a minute or two. GitHub Pages can't send custom headers, so the security policy (Content-Security-Policy) is embedded in each built page instead.

**Elsewhere?** It's plain static files, so any static host works. Firebase Hosting is set up too (`firebase.json` adds the policy as a real header): run `firebase login --reauth` once, create a project, put its id in `.firebaserc`, then `npm run deploy:firebase`. Whatever the host, update `url` in `src/site.ts` (the privacy policy must be on the same domain you give Pinterest) and register the new `…/pinterest/callback/` address in your Pinterest app.

---

## Project map

```
src/
├─ main.tsx ................ entry point (start reading here; also shows the Pinterest return page)
├─ site.ts ................. ★ the site's public facts: name, URL, contact (used by Privacy/Terms too)
├─ App.tsx ................. the shell + a map of how everything connects
├─ styles.css .............. design tokens + imports of styles/*.css
│
├─ data/ ................... WHAT THE APP KNOWS  (edit these to change content)
│  ├─ types.ts ............. the vocabulary: Section, Slot, Fit, Tone, Vibe, colours…
│  ├─ looks.generated.ts ... 167 runway looks (GENERATED from tools/looks/looks.src.txt)
│  ├─ catalog.ts ........... turns every garment in every look into a piece (~480)
│  ├─ crops.ts ............. where each garment sits in its photo (crop maths)
│  ├─ shows.ts ............. the collections: designer, season, Vogue/firstVIEW/ARCHIVE.pdf/WWD
│  ├─ wardrobe.ts .......... categories, which questions to ask, option wording
│  ├─ runwaySources.ts ..... firstVIEW / Vogue / … link builders + season logic
│  └─ media.ts ............. which looks are used for the gate & runway backdrop
│
├─ engine/ ................. HOW OUTFITS ARE BUILT  (pure logic, unit-tested)
│  ├─ resolver.ts .......... query the catalog; faceted question options
│  ├─ compat.ts ............ the styling RULES (formality, volume, colour, mood…)
│  ├─ composer.ts .......... greedy "fill every slot from one piece" algorithm
│  └─ copy.ts .............. look names, silhouette, palette, styling notes
│
├─ model/ .................. THE LEARNING "MODEL"  (pure maths, unit-tested)
│  ├─ features.ts .......... piece → feature strings ("fit:baggy", "vibe:street"…)
│  ├─ tasteModel.ts ........ online logistic regression + explanations
│  ├─ crowd.ts ............. community counts → prior
│  └─ recommend.ts ......... ranks looks + garments for the home feed, the headline
│
├─ state/ .................. REACT STATE  (glue around the pure logic)
│  ├─ draft.ts ............. the outfit-in-progress as a pure state machine
│  ├─ AppContext.tsx ....... builder actions: pick, finish, swap, shuffle…
│  ├─ TasteContext.tsx ..... event log ↔ model ↔ Supabase
│  ├─ ClosetContext.tsx .... saved outfits, local-first sync
│  ├─ StashContext.tsx ..... "Your stacks": stacks set aside (this device)
│  ├─ SectionContext.tsx ... menswear | womenswear (remembered)
│  └─ ToastContext.tsx ..... pop-up messages
│
├─ lib/ .................... PLUMBING
│  ├─ supabase.ts .......... client, anonymous sign-in, status
│  ├─ closetStore.ts ....... local + remote outfit read/write
│  ├─ eventStore.ts ........ local + remote taste events
│  ├─ storage.ts ........... safe localStorage + every storage key
│  ├─ router.ts ............ tiny #/hash router
│  ├─ imageUrl.ts .......... Wikimedia hot-link sizes + the crop maths (+ old Unsplash links)
│  ├─ pinterest.ts ......... "Connect Pinterest" (the browser half of OAuth)
│  └─ hash.ts .............. deterministic "randomness"
│
├─ feed/ ................... THE ENDLESS HOME FEED  (pure logic, unit-tested)
│  ├─ posts.ts ............. what comes next: queues, the rhythm, the shapes
│  ├─ masonry.ts ........... where each post sits (the asymmetrical wall)
│  ├─ useAutoScroll.ts ..... the slow drift (and getting out of your way)
│  └─ memory.ts ............ remembering your place + the fly-in handoff
│
├─ live/ ................... THE LIVE SOURCES  (always refreshing)
│  ├─ sources.ts ........... which sites, and why (the research is in the header)
│  ├─ feedCore.ts .......... reads RSS/Atom feeds (shared with the server relay)
│  ├─ fetchers.ts .......... goes online: direct feeds, the V&A, Openverse, the relay
│  ├─ tags.ts .............. captions → Muse features (designers, moods, colours)
│  ├─ feed.ts .............. merging + ranking (fresh first, tuned by Muse)
│  ├─ inspire.ts ........... "Build a look inspired by this" → a catalog garment
│  └─ useLiveFeed.ts ....... the auto-refresh loop (every 3 min) + "load more" pages
│
├─ components/ ............. WHAT YOU SEE
│  ├─ SectionGate.tsx ...... Menswear | Womenswear split screen
│  ├─ Home.tsx ............. the home header + the feed
│  ├─ feed/ ................ Feed (the wall, click to open) · FeedCard
│  ├─ StackTray.tsx ........ "Your stacks" — the pile in the bottom-left corner
│  ├─ builder/ ............. Builder → CategoryStart · PieceStep · LookBoard
│  │                         LookBoard → CardDeck (the stack) · CardPanel (Change/Refine/Keep/Delete)
│  ├─ About.tsx ............ sources + status, how Pinterest is used, credits, clear data
│  ├─ PinterestCallback.tsx  where Pinterest's sign-in returns
│  ├─ Runway.tsx ........... the finale
│  ├─ Closet.tsx ........... saved looks
│  ├─ MuseInsights.tsx ..... "what I've learned" drawer
│  ├─ Photo.tsx ............ shows a garment by cropping its runway photo; photo credits
│  ├─ TopBar.tsx · ErrorBoundary.tsx
│
└─ styles/ ................. one CSS file per area (gate, home, builder, runway…)

tools/build-looks.mjs ...... works out each photo's framing → src/data/looks.generated.ts (no downloads)
tools/looks/looks.src.txt .. ★ THE CATALOG: one line per runway look (documented inside)
supabase/schema.sql ........ database tables, security rules, the community function
supabase/functions/live-feed  the live feed's server relay (Pinterest, YouTube, magazines)
supabase/functions/pinterest-auth  "Connect Pinterest": swaps the code for tokens, server-side
privacy/index.html ......... the Privacy Policy  (/privacy/ — plain HTML, %SITE_…% from src/site.ts)
terms/index.html ........... the Terms of Service (/terms/)
tools/deploy-pages.mjs ..... npm run deploy → GitHub Pages (built files only, gh-pages branch)
pinterest/callback/index.html  where Pinterest's sign-in returns (loads the app)
firebase.json · .firebaserc  optional Firebase Hosting: what to serve, security headers
docs/PINTEREST_APPLICATION.md  everything for Pinterest's app review, step by step
docs/PHOTO_CREDITS.md ...... every catalog photo's photographer + licence
docs/HOW_IT_WORKS.md ....... the algorithms explained, with a worked example
```

Rule of thumb: **`data/`, `engine/`, `model/` and `state/draft.ts` contain no React.** They're plain functions you can read top-to-bottom and test with `npm test`. Everything React is in `components/` and the `*Context.tsx` files.

---

## "I want to… → edit this"

| I want to… | Edit |
|---|---|
| **Add a runway look** | Add a line to `tools/looks/looks.src.txt` (the format is explained at the top of that file), then `npm run looks` and `npm test`. |
| **Rename a garment / fix its tags** | Its line in `tools/looks/looks.src.txt`, then `npm run looks` |
| **Re-frame one garment's crop** | Add `@top-bottom` after it in `looks.src.txt` (e.g. `@6-62`), then `npm run looks` |
| **Re-frame every crop of a kind** (all shoes…) | `PRESETS` in `src/data/crops.ts` |
| **Add a show / fix its Vogue / firstVIEW / ARCHIVE.pdf link** | `SHOWS` in `src/data/shows.ts` |
| **Change a question's wording** ("Slim fit" → "Tailored") | `FIT_COPY`, `TYPE_COPY`, `TONE_COPY` in `src/data/wardrobe.ts` |
| **Ask questions in a different order / fewer** | A category's `chain` in `src/data/wardrobe.ts` |
| **Add a whole new category** (e.g. *Swimwear*) | `CategoryId` in `types.ts` → entry in `CATEGORIES` + `CATEGORY_ORDER` in `wardrobe.ts` → tag garments with it in `looks.src.txt` |
| **Add a colour** | `ColorName` + `COLORS` in `src/data/types.ts` |
| **Change what "goes together"** | The rules and numbers in `src/engine/compat.ts` |
| **Make the model learn faster / slower** | `HYPER.lr` in `src/model/tasteModel.ts` |
| **Weigh a "save" more than a "swap"** | `EVENT_DEFAULTS` in `src/model/tasteModel.ts` |
| **Change the starting taste** | `EDITORIAL_PRIOR` in `src/model/tasteModel.ts` |
| **Add a runway / editorial / shop site** | `buildSourceLinks` in `src/data/runwaySources.ts` |
| **Change look names ("Quiet Volume"…)** | `ADJECTIVES`, `TONE_NOUNS` in `src/engine/copy.ts` |
| **Change the green / the fonts** | Tokens at the top of `src/styles.css` |
| **Change the Menswear/Womenswear photos** | `GATE_PHOTOS` in `src/data/media.ts` (any look id) |
| **Stop the engine favouring "styled together"** | `runwayRule` in `src/engine/compat.ts` |
| **Allow more pieces from one show per home row** | `MAX_PER_SHOW` in `src/model/recommend.ts` |
| **Change a page's layout** | The matching file in `src/styles/` (class names start with the area: `.gate-…`, `.builder-…`) |
| **Speed up / slow down an animation** | The `transition={{ … }}` prop on that element (springs: higher `stiffness` = snappier) |
| **Add a database column** | `supabase/schema.sql` (+ `lib/closetStore.ts` `toRow` / `fromRow`) |
| **Refresh the live row more / less often** | `REFRESH_MINUTES` in `src/live/sources.ts` |
| **Add a live source the browser can read** (Condé Nast feeds…) | `DIRECT_SOURCES` in `src/live/sources.ts` |
| **Add a Pinterest profile, YouTube channel or magazine** | `RSS_SOURCES` / `YOUTUBE_CHANNELS` in `supabase/functions/live-feed/index.ts`, then redeploy (below) |
| **Change how the live row is ordered** | `KIND_BONUS`, `HALF_LIFE_BY_KIND`, `TASTE_WEIGHT` in `src/live/feed.ts` |
| **Teach Muse a new designer name** | `HOUSES` in `src/data/houses.ts` |
| **Make the home page drift faster / slower** | `DRIFT_PX_PER_SECOND` in `src/feed/useAutoScroll.ts` |
| **Change how many stacks the corner pile keeps** | `MAX_STACKS` in `src/state/StashContext.tsx` |
| **Move the corner pile** (e.g. to the right) | `.tray` in `src/styles/tray.css` (the Pause button sits bottom-right) |
| **Change the mix of the feed** (more live, fewer garments…) | `BEAT` in `src/feed/posts.ts` |
| **Change the columns / the stagger** | `COLUMN_BREAKPOINTS`, `STAGGER` in `src/feed/masonry.ts` |
| **Change how the cards fan out** | `STACK_TILT`, `FAN_MAX_TURN`, `LIFT` in `src/components/builder/deckLayout.ts` |
| **Add an open-licence search** (e.g. a designer) | `OPENVERSE_QUERIES` in `src/live/sources.ts` |
| **Change the contact email / name / URL on Privacy & Terms** | `src/site.ts`, then `npm run deploy` |
| **Edit the Privacy Policy or Terms wording** | `privacy/index.html`, `terms/index.html` |

---

## Photos, links and licences — the honest version

- **Every catalog photo is a real runway, street-style or museum photo** on [Wikimedia Commons](https://commons.wikimedia.org/), published by its photographer under a Creative Commons licence (**CC BY 2.0, CC BY-SA 4.0, CC BY 3.0 or CC0**). Mostly the work of runway photographers Christopher Macsurak, Masaki-H and Walterlan Papetti, plus the RISD Museum's public-domain archive photos. **They're not copied into this project**: the browser loads each one from Wikimedia's own image servers (at Wikimedia's standard thumbnail sizes) and crops it on screen. The photographer + licence are credited under every large image and listed in [`docs/PHOTO_CREDITS.md`](docs/PHOTO_CREDITS.md).
- **Live looks are shown from the publisher, never copied.** The live row keeps only each story's title, link and image *address*; the picture loads from Vogue's, Pinterest's, YouTube's (etc.) own servers, every card opens the original, and show videos play in YouTube's official embedded player. Nothing is stored except which items you dismissed.
- **firstVIEW, Vogue Runway, WWD and ARCHIVE.pdf are linked, not embedded.** Their photography is copyrighted and mostly paywalled, and none offers a public API — so the app can't show *their* pictures. Instead every look links to *its* show on those sites (the exact Vogue Runway show page where Vogue covers it, the designer on firstVIEW, the house's page on ARCHIVE.pdf where one exists, and WWD's coverage). Every Vogue show URL in `shows.ts` was opened and checked. firstVIEW is a *subscription* archive; the app labels it.
- **ARCHIVE.pdf is <https://www.archivepdf.net/>** (archivepdf.com is an unrelated site).
- **What the collections are:** womenswear — Michael Kors, 3.1 Phillip Lim, Diesel Black Gold, Richard Chai, Y-3 and Jill Stuart (Fall 2010), Alexander McQueen (Fall 2018), Max Mara (Fall 2019), Diane von Furstenberg (Spring 2014), couture from Iris van Herpen, Basil Soda and Gustavo Lins; menswear — Oliver Spencer and Astrid Andersen (Spring 2014); street style from Paris Fashion Week; archive pieces from Raf Simons, Comme des Garçons, Junya Watanabe, Yohji Yamamoto, Maison Margiela, Jean Paul Gaultier, Walter Van Beirendonck and Paul Smith.
- **Old closet outfits** saved before the runway catalog still show (their old Unsplash photos are kept for display), but can't be reopened for editing because those pieces no longer exist.
- **The "season" is computed from today's date** (`currentSeason()` in `runwaySources.ts`): Sept–Dec → next Spring, Jan–Aug → this Fall. From today that's *Spring 2027*.
- **The Zaslia font is "free for personal use"** (see `src/assets/1001fonts-zaslia-eula.txt`). If you ever publish this commercially you need a licence or a different display font — change `--font-display` in `styles.css`.

## Known limits

- **The catalog is hand-curated and small** (167 looks → about 480 pieces). Freely licensed runway photography is rare, so the seasons skew to Fall 2010 / Fall 2018–19 / Spring 2014, and **menswear is thinner** (30 looks — two runway shows, street style and archive pieces — against 137 for womenswear). Some answer combinations have just one photo; the question flow skips a question when there's nothing to choose between.
- **"Your stacks" live on this device only** (localStorage), unlike the Closet, which syncs to Supabase. Clearing site data empties the pile.
- **Live looks are pictures, not tagged garments.** The outfit builder needs garments tagged by fit, colour and slot, so live looks inspire a build (via the closest catalog garment) rather than being worn piece-by-piece. Tagging live photos automatically would need an AI vision step — a possible next step.
- **The live row depends on other sites.** If a publisher changes or drops its feed, that source goes quiet (the status line under the row says which). Feeds are meant for personal reading; before publishing this widely, check each publisher's feed terms.
- **A crop shows the garment *in* the outfit.** Pieces are cut from full-length photos, so a "trousers" card shows the legs of the look (and maybe the hem of a coat). Museum archive pieces are shown whole.
- **"Muse" is a small, transparent model — not an LLM.** Online logistic regression over tag features. It learns from a handful of taps and you can read every weight; it will not "understand" a photo.
- **The anonymous identity lives in the browser.** Clear site data and you start a fresh closet. Real accounts (email magic-link, Google) are the natural next step: Supabase can *upgrade* an anonymous user in place so nothing is lost.
- **Deleting offline.** If you delete an outfit while Supabase is unreachable, the remote copy returns on the next sync.
- **Community learning needs people.** With one user it stays empty by design (privacy floor of 3 in `schema.sql`).
- **What has — and hasn't — been tested against the real Supabase project.** The schema was applied to the live `what-to-wear` project, and its security rules were exercised there as two different users and as a signed-out visitor (12 checks, all rolled back so nothing was left behind). The real `supabase-js` client was confirmed to reach it with both key types and to produce the exact "anonymous sign-ins are disabled" message the app looks for. What could **not** be tested is a full anonymous sign-in → save → sync round trip, because that needs the dashboard switch in step 3. The app-side half of that round trip *was* exercised end-to-end against a protocol-level mock of Supabase (29 checks).

## Before you put this on the public internet

- **Anonymous sign-ins can be scripted.** The anon/publishable key is public, so anyone can create throw-away anonymous users against your project. For a personal project that's harmless (each can only touch their own rows, and the community numbers need ≥ 3 people). If you publish widely, turn on **Authentication → Attack Protection → CAPTCHA** and consider pruning old anonymous users.
- **Free projects pause after about a week of inactivity.** While paused, the app keeps working from this browser's local copy and the closet badge shows an error; open the dashboard and click **Restore project**. Your data is kept.
- **Keep the `service_role` key out of the front end**, always. (The Pinterest tokens live in `pinterest_connection`, a table with no public access; only the server functions can read it.)
- **Legal pages are a good-faith draft, not legal advice.** They describe what the code really does; have them reviewed if you publish widely or commercially.

## How the pieces work

See **[docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md)** for the algorithms in plain English — faceted questions, the outfit engine, the taste model (with a worked numeric example), and the local-first sync.

## Glossary

| Word | Meaning here |
|---|---|
| **Section** | Menswear or Womenswear |
| **Category** | A kind of garment you can start from (Shirts, Pants…) |
| **Slot** | A place on the body (layer, top, bottom, one-piece, shoes, accessory). An outfit = one piece per slot |
| **Runway look** | One real photo (runway, street style or archive) — a line in `looks.src.txt` |
| **Piece** | One garment cropped from a runway look + its tags |
| **Show** | The collection a look walked in (designer + season), with its links |
| **Facet** | A question you can ask about a piece (type, length, fit, tone, vibe, house) |
| **Look** | A whole outfit |
| **Anchor** | The piece you started from — the one the engine never changes |
| **Feature** | A tag the model can learn about (`fit:baggy`) |
| **Event** | One thing you did that the model learns from |
| **Prior** | A starting opinion (editor's, or the community's) that fades as you teach the model |
| **RLS** | Row-level security — the database rules that keep each person's rows private |
