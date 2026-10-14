# How it works

This is the long explanation. The README tells you *what* to edit; this tells you *why* the code is shaped the way it is, so that when you want to change something you know what else it touches.

Every number below is the real number from the code. File names are links you can follow.

---

## 0. The whole thing on one page

```
      tools/looks/looks.src.txt ──(npm run looks)──► data/looks.generated.ts  (numbers only — the photos stay on Wikimedia)
                                        │
                         ┌──────────────▼────────── data/ ─────────────────────────┐
                         │  catalog.ts   167 runway looks → ~480 pieces (the raw   │
                         │               material; crops.ts says where each sits)  │
                         │  shows.ts     designer · season · Vogue/firstVIEW links │
                         │  wardrobe.ts  categories, questions, wording            │
                         │  types.ts     the shared vocabulary                     │
                         └──────────────┬──────────────────────────────────────────┘
                                        │ read by
              ┌─────────────────────────┼──────────────────────────┐
              ▼                         ▼                          ▼
      engine/resolver.ts        engine/compat.ts            model/features.ts
      "which options exist?"    "do these go together?"     "what is this piece made of?"
              │                         │                          │
              │                 engine/composer.ts                 ▼
              │                 "fill every slot"          model/tasteModel.ts
              │                         ▲                  "how much will YOU like it?"
              │                         │ taste(piece)             │
              ▼                         │                          ▼
        state/draft.ts  ◄───────────────┘                   model/recommend.ts
        the outfit in progress                              "the home-screen rails"
              │                                                    │
              ▼                                                    ▼
   state/AppContext.tsx  ── records what you do ──►  state/TasteContext.tsx ◄──► Supabase
              │                                       (event log → model)       (events,
              ▼                                                                  community)
        components/*  ◄──────────────────────────────  state/ClosetContext.tsx ◄──► Supabase
        (what you see)                                  (saved looks)               (closet)
```

Read it left to right as: **data → pure logic → React state → screens**. Only the bottom two rows know React exists.

The home page's endless feed (`feed/` → `components/feed/`, §4) deals posts from the catalog and from a second, smaller pipeline beside this one — the live sources (`live/`, §4½), which read fashion feeds from the web every few minutes and borrow only Muse's opinions. Opening a post leads to the stack of cards (§4¼).

---

## 0½. The catalog: real runway photos, cut into pieces

**Problem:** the app needs a photo of *every garment* — but what makes a look high-fashion is the whole outfit, as a designer sent it out. Runway sites (firstVIEW, Vogue Runway, WWD, ARCHIVE.pdf) are copyrighted, so their photos can't be used.

**Solution:** use runway, street-style and museum photos that photographers released under Creative Commons licences on Wikimedia Commons, and cut each photo into its garments — *on screen*. No image file is ever copied into the project: the browser loads each photo from Wikimedia's own thumbnail server ("hot-linking") and the app only stores numbers saying where to crop.

```
tools/looks/looks.src.txt                 one line per photo ("runway look"):
  mcq18-09 | Alexander McQueen …jpg | w | mcqueen-fw18 | 50,5,96 | classic,edgy | 5 |
      jackets/blazer.slim.black=Black tuxedo jacket;
      pants/tailored.regular.black=Black tailored trousers;
      shoes/heels.slim.black=Black-and-white pumps
                │
                │  npm run looks   (tools/build-looks.mjs — reads text, downloads no images)
                ▼
  1. look up the photo's size, author, licence and thumbnail address on Wikimedia Commons
     (metadata only; cached in tools/looks/commons.json, so later runs take a second)
  2. work out a 2:3 "frame" with the model head-to-toe in it (5% headroom, 7% below the feet)
     using "50,5,96" = body centre 50% across, head at 5%, feet at 96% of the photo
     → frame = [left, top, width, height] as fractions of the photo: [0.0834, 0, 0.8332, 1]
       (this photo is 3930×4912, so the frame is its middle 83%, full height)
  3. remember where the figure lands in the frame: fig = [head-top, soles, centre-x] in %
  4. write src/data/looks.generated.ts (photo address + size, frame, fig, credit, garments)
     and docs/PHOTO_CREDITS.md
                │
                ▼
src/data/catalog.ts  → one Piece per garment:  "mcq18-09/jackets-blazer", "mcq18-09/pants-tailored", …
src/data/crops.ts    → each piece's crop box (in % of the frame), from its kind + the figure position:
                          jacket  = figure 8% → 60%     trousers = 36% → 101%     shoes = 70% → 103%
lib/imageUrl.ts      → frame + crop box → an <svg viewBox> in the photo's own pixels, and which
                       Wikimedia thumbnail width is sharp enough for the card
components/Photo.tsx → loads that thumbnail from Wikimedia and shows only the crop — the garment fills the card
```

Why this shape:

- **One photo, many pieces.** A single runway look yields the jacket, the trousers and the shoes, and they *know* they walked together (`piece.look`). The outfit engine rewards that (rule 6 below), so starting from a McQueen jacket tends to rebuild McQueen's look — while still free to mix in other shows.
- **Crops are relative to the figure**, so one rule frames every photo, however it was shot. A garment that needs special framing gets `@top-bottom` in `looks.src.txt` (e.g. a bag held low: `@40-62,35` = 40%→62% of the figure, centred 35% across).
- **Nothing is copied, and the browser asks for the right size.** Wikimedia only serves thumbnails at its standard widths — 330, 500, 960, 1280 or 1920 px (anything else is refused) — so `pickThumbWidth` takes the smallest one that's still sharp for the card (twice its on-screen width, for high-density screens), and never one wider than the original. Re-framing a garment is just new numbers; no images to regenerate.
- **Narrow photos still fill the frame.** If a photo is narrower than the 2:3 frame, the frame overhangs it (`left` below 0); `Photo.tsx` fills the overhang with a blurred copy of the same photo instead of hard bands.
- **Licences are data.** Every look carries its author, licence and source link; `Photo.tsx`'s `<Credit>` prints them; `docs/PHOTO_CREDITS.md` lists them all; a test fails if any photo lacks an open licence.
- **The shows carry the links.** `data/shows.ts` maps each show to its Vogue Runway page (checked), firstVIEW designer search, ARCHIVE.pdf page and WWD search. The runway screen lists the original photos with those links ("Seen on the runway").

---

## 1. Questions come from the catalog (faceted narrowing)

**Problem:** "Slim fit or baggy?" must always have a photo for each answer. If we typed the options by hand, a missing photo would give a dead button.

**Solution:** the options are *discovered* from the catalog, the same way a shopping site's filters are.

[`engine/resolver.ts`](../src/engine/resolver.ts):

1. `narrow(section, category, answers)` — keep only the pieces that match **every** answer so far.
2. `facetOptions(section, category, key, answers)` — of those pieces, which values of `key` (fit, tone, …) actually occur? Those are the options. (It narrows by every answer **except** `key`, so changing your mind about an earlier answer still shows all alternatives.)
3. `nextStep(...)` — walk the category's `chain` (e.g. `["fit","tone","vibe"]`) and return the first facet that still has **two or more** options. A facet with one possible answer is skipped silently.
4. `bestFor(...)` — the single piece to show as "the photo": the best-scoring piece among those still matching (taste breaks ties).

Because of step 3 the flow **ends by itself** when there's nothing left to choose between. That is why some shirts finish after two questions and others after three.

> Try it: in `tools/looks/looks.src.txt`, change every womenswear shirt marked `.baggy.` to `.slim.` and run `npm run looks -- --data-only` then `npm test` — the "slim fit or baggy" test fails and tells you which option has no photo.
>
> The last question in most chains is **"Whose runway?"** (the `house` facet). Its options are the designers that still have a matching piece, worded from `data/shows.ts`.

---

## 2. Building an outfit from one piece

[`engine/composer.ts`](../src/engine/composer.ts) is a **greedy** algorithm: it doesn't search every possible outfit (there are millions); it fills one slot at a time, each time asking "which candidate goes best with what's already chosen?".

```
fixed pieces (the anchor, anything locked)
        │
        ▼
 which slots are needed?        body: (top + bottom) OR a one-piece,   then  shoes, layer, accessory
        │
        ▼ for each empty slot, in that order:
 score every unused candidate:
        Σ over pieces already chosen  of   pairScore(candidate, chosen) × pairWeight(slot, chosenSlot)
        + 0.6 × taste(candidate)
        │
        ▼
 seed 0  →  take the highest score
 seed n  →  pick among the top 4, weighted by exp(score / 0.6)     ← this is "Shuffle"
```

### The styling rules

[`engine/compat.ts`](../src/engine/compat.ts). Each rule looks at *two* pieces and returns a score **and** a sentence. The sentences are what appear under a card as *"Volume balanced by a slim line"* — so the explanation is always the truth, never a separate bit of copy.

| Rule | Fires when | Score |
|---|---|---|
| **Dress code** | formality differs by 0 / 1 / 2 / 3+ | +0.5 / +0.3 / −0.5 / −1.3 |
| **Silhouette** (top, bottom, one-piece) | slim + baggy | +0.7 *"Volume balanced by a slim line"* |
| | baggy + baggy | +0.25 if street, else −0.6 *"Volume on volume is hard to carry"* |
| | slim + slim | +0.3 if minimal, else +0.15 |
| | otherwise | +0.2 |
| **Layer fit** | fitted layer over a baggy top | −0.9 |
| | baggy layer over a slim base | +0.5 |
| **Colour** | same colour (not bold) / same bold colour | +0.2 / +0.25 *"One bold colour, head to toe"* |
| | same tone: light / dark / earth | +0.45 / +0.45 / +0.40 |
| | same tone: denim | +0.2 if street/edgy, else −0.4 |
| | two **different** bold colours | −0.9 *"Two statement colours compete"* |
| | light + dark / earth + light / earth + dark | +0.55 / +0.45 / +0.25 |
| | denim + anything | +0.4 |
| | bold + earth / bold + other | +0.05 / +0.35 |
| **Mood** | no shared vibe / shared | −0.1 / +0.9 × overlap |
| **Specials** | hoodie under a blazer or formal coat | −1.0 |
| | sneakers with black-tie · heels with loungewear | −0.5 |
| | beanie with a dressed-up look | −0.8 |
| | a bag with smart-casual or above | +0.2 |
| | sport sandals under tailoring | −0.5 |
| **Prints** | two prints from the same look (a matching set) | +0.3 |
| | two unrelated prints | −0.9 *"Two prints compete"* |
| **Runway** | both pieces cut from the **same runway photo** | +0.9 *"Styled together on the runway"* |
| | both from the **same collection** | +0.3 *"From the same collection"* |

A pair's final contribution is multiplied by how much that **pairing matters**:

| Pair | Weight |
|---|---|
| top ↔ bottom | 1.00 |
| layer ↔ top / one-piece | 0.90 |
| shoes ↔ a body piece | 0.70 |
| layer ↔ bottom | 0.60 |
| shoes ↔ layer | 0.45 |
| anything ↔ accessory | 0.35 |

### Adding a rule (worked example)

*"Don't pair a fine-knit with a cargo pant."* In `compat.ts`:

```ts
const knitCargoRule: Rule = (a, _sa, b) => {
  const knit  = [a, b].find((p) => p.category === "sweaters");
  const cargo = [a, b].find((p) => p.type === "cargo");
  return knit && cargo ? { score: -0.6, text: "Fine knit and utility cargo pull in two directions" } : null;
};
// …and add it to the list:
const RULES: Rule[] = [formalityRule, silhouetteRule, layerFitRule, colourRule, moodRule, specialRule, knitCargoRule];
```

That is all. The composer, the swap button, the explanations under each card and the tests pick it up automatically.

---

## 3. The taste model ("Muse")

### What it is — and isn't
A tiny **online logistic regression**: the same maths as a spam filter. It is deliberately *not* a neural network or an LLM:

- it learns from **a handful of taps** (a big model needs thousands of examples);
- it runs instantly in the browser, no server;
- you can read every weight, so "why did it recommend this?" always has an answer.

### Step 1 — turn a garment into *features*
[`model/features.ts`](../src/model/features.ts):

```
Olive baggy cargo pants, mood "street", formality 1
   →  cat:pants   fit:baggy   tone:earth   color:olive   dress:casual
      vibe:street   type:cargo   fitcat:baggy:pants
```

`fitcat:` is a *cross* feature. It lets the model learn "baggy **pants**, but slim **shirts**", which a plain `fit:baggy` could never say.

Because every piece comes from a real show, two more features say **where** it came from:

```
house:max-mara       ← the designer — so Muse can learn "you keep choosing Max Mara"
kind:street          ← only for street style / couture / archive pieces (plain runway is the default)
```

That's what produces *"Because you like Max Mara"* on the home page and *"Max Mara"* under **You lean towards** in the Muse drawer. Answering *"Whose runway?"* teaches `house:` directly.

### Step 2 — score = sum of weights
The model keeps one number per feature (`weights`, positive = liked). A piece's raw opinion is

```
logit = (sum of its features' weights) ÷ √(number of features)
```

The `÷ √n` stops a piece with many features from automatically outscoring one with few. `likelihood = sigmoid(logit)` squashes it to 0–1.

### Step 3 — learn from what you do
Each action becomes an **event** `(features, label 1/0, weight)` — [`EVENT_DEFAULTS`](../src/model/tasteModel.ts):

| You do… | label | weight | Meaning |
|---|---|---|---|
| pick an answer | 1 | 1.0 | "yes, this" |
| an option you **didn't** pick | 0 | 0.25 | a quiet "no" |
| finish refining a piece | 1 | 1.0 | |
| **swap** a piece away | 0 | 0.8 | "not that one" |
| send a look to the runway | 1 | 0.8 | |
| **save** a look | 1 | 1.5 | the loudest "yes" |
| open a home card | 1 | 0.6 | |
| **dismiss** a home card | 0 | 1.5 | the loudest "no" |
| tap a mood chip | 1 | 1.2 | |

The update is the textbook logistic-regression step:

```
error     = label − predictedLikelihood
w[f]     += lr × eventWeight × error × (1/√n)  −  lr × l2 × w[f]
```

*If we under-predicted something you wanted, push its features up. If we over-predicted something you rejected, push them down. If we were already right, barely move.* `l2` gently pulls old weights back toward zero so one-off taps fade.

### A real worked example
(generated by running the actual code; `lr = 1.1`, `l2 = 0.03`)

Features: baggy pants = `[fit:baggy, fitcat:baggy:pants]`, slim pants = `[fit:slim, fitcat:slim:pants]`.

| After… | p(like baggy) | p(like slim) | w[fit:baggy] | w[fit:slim] |
|---|---|---|---|---|
| start | 0.500 | 0.500 | 0 | 0 |
| you pick baggy pants | **0.634** | 0.500 | 0.389 | 0 |
| slim was shown, not chosen | 0.634 | **0.466** | 0.389 | −0.097 |
| you pick baggy again | **0.718** | 0.466 | 0.661 | −0.097 |
| you save a look with baggy pants | **0.797** | 0.466 | 0.968 | −0.097 |
| you dismiss a slim card | 0.797 | **0.289** | 0.968 | −0.637 |

Notice: the *second* "baggy" moved the weight by 0.27, the first by 0.39. The model is already fairly sure, so there's less to learn — that is the `error` term doing its job.

### Step 4 — ranking: taste + curiosity
[`rankScore`](../src/model/tasteModel.ts) = `taste + 0.5 × exploration × uncertainty`.
`uncertainty` is high for features you've rarely touched. That's what keeps the home screen from collapsing into the same five pieces: the model *wants* to find out whether you'd like something it hasn't seen.

### Step 5 — priors (the cold start)
Before you've taught it anything, two gentle opinions are mixed in, and **both fade** as you add picks (half-way gone after 14):

| Prior | Source | Starting strength |
|---|---|---|
| **Editorial** | `EDITORIAL_PRIOR` — a curated taste (minimal, classic, earthy…) | 0.5 |
| **Community** | Supabase `trending_features()` → [`model/crowd.ts`](../src/model/crowd.ts) | 0.9 |

The community number per feature is `log((pos+2)/(neg+2))` minus the overall average (people say "yes" more than "no"), shrunk when there's little data, then clamped.

### The model is a function of the log
`replay(events)` folds the whole event list into a model. The app **only** persists the event log (last 500 events, in `localStorage` and optionally Supabase) and recomputes the model on load. Consequences:

- no migration problems — change the maths and the model rebuilds itself;
- "Reset Muse" is just *delete the log*;
- your taste follows you to a new browser (events come back from Supabase).

> Honest limit: the model has no idea what a photo *looks like*. It only knows the tags. If a tag is wrong, it learns the wrong thing.

---

## 4. The home screen: an endless, drifting wall

The home page is one wall of posts that never ends and slowly scrolls itself. One job per file:

```
  queues, best first (Muse)            feed/posts.ts            feed/masonry.ts            components/feed/Feed.tsx
  ─────────────────────────            ─────────────            ───────────────            ────────────────────────
  live posts   (rankLive)      ─┐      deal posts by the BEAT   place each post in the     draw only posts near the
  runway looks (rankLooks)      ├──►   live, look, live, piece, shortest column (all  ──►  screen; deal 24 more when
  garments     (rankPieces)     │      …; a new "cycle" when    positions known before     the bottom is in reach;
  "Start with…" tiles          ─┘      everything was shown     any image loads)           hover → open
```

**The rhythm.** `BEAT` = `live, look, live, piece, live, look, prompt, live, piece, live, look, live, piece, live, look, piece` — 7 live posts, 4 runway looks, 4 garments and one "Start a look with…" tile in every 16. A queue that runs dry hands over to the next (`FALLBACK`). Only *future* posts follow your latest taste; what's on screen never reshuffles.

**The asymmetry.** Every post gets a picture shape from its id (`shapeFor`) — runway looks mostly a full 2:3 figure, sometimes a closer 3:4; magazine stories 4:5, 3:4, square, 2:3 or a wide 3:2 that spans two columns; show films 16:9 across two columns. Columns start at staggered heights (`STAGGER = [0, 64, 22, 104, 40, 86]` px). **Pinterest pins and museum photos are never cropped** (Pinterest's rules): they keep their own shape, measured when they load (or known up front when the source says, e.g. Openverse and the Pinterest API).

**Shortest column first.** Each card goes into the column filled least far down (a wide card into the neighbouring pair whose lower edge is highest). Height = width ÷ aspect + the 64 px caption. Because every shape is decided before any image arrives, the layout is computed — not measured — so the page can draw only the ~25 cards near the screen (`DRAW_ABOVE` 900 px, `DRAW_BELOW` 1,500 px) and run for hours without slowing down.

**The drift** (`feed/useAutoScroll.ts`). Every animation frame adds `26 px/s × time` to a *fractional* position and scrolls there (keeping our own fraction is what makes a very slow scroll smooth). If the page is somewhere we didn't put it, the user scrolled: adopt their position and pause. It holds still for 4 s after a scroll, swipe or key, 2.2 s after the mouse moves over the posts, while a post is being hovered, while the tab is hidden, and from the start if the device asks for reduced motion. The Pause button's choice is remembered on the device.

**Hover to open.** Real mouse movement onto a post starts a 1.1 s timer and a bar fills along the card's bottom edge (pure CSS). Moving off cancels; click opens at once. The browser also sends "mouse moved" events when the page scrolls under a still pointer — those have unchanged coordinates and are ignored, so the drift never opens a post by itself.

**Opening.** The card's position is noted (`setHandoff`), then: a runway look → `startFromLook`; a garment → `startFromPiece`; a live post → `startFromLive` (the closest catalog garment, see §4½); a "Start with" tile → the question flow. The stack page flies the picture in from that position.

**Coming back.** Posts, measured shapes and scroll position are kept per view (section × filter × mood) in `feed/memory.ts`, so Back returns you to the same post.

The old rails' logic still lives in [`model/recommend.ts`](../src/model/recommend.ts): `rankLooks` (a look's score is the average taste of its garments; the feed allows more per show), `rankPieces` (every garment, spread so a show never repeats back-to-back and no photo appears twice), and `buildHomeFeed`'s headline (Muse's one-line read on you, shown under the title).

---

## 4¼. The stack of cards (the look board)

Open a post and the outfit appears as a deck ([`CardDeck.tsx`](../src/components/builder/CardDeck.tsx)): the post on top, then one card per garment, head to toe. The geometry is pure functions in [`deckLayout.ts`](../src/components/builder/deckLayout.ts):

- **Stacked**: card *i* sits `(9i, 8i)` px lower-right of the one above, turned by `STACK_TILT[i]` (−1.2°, 3.4°, −4.2°…), scaled down 1.4 % per card.
- **Fanned** (hover the pile, tap it on a phone, or Tab into it): centres spread across the room left (`(width − 1.3 × card) / (n − 1)`, never closer than a quarter card), each turned up to `FAN_MAX_TURN` 9°, along an arc (outer cards lower). The card under the pointer lifts by `LIFT` 34 px, straightens and comes to the front; its neighbours step aside.
- On phones, sliding a finger sideways across the fan lifts the card under it; letting go opens it (vertical swipes still scroll the page — `touch-action: pan-y`).

Clicking a card opens [`CardPanel.tsx`](../src/components/builder/CardPanel.tsx) beside it (a bottom sheet on phones):

| Button | What happens (state/draft.ts) |
|---|---|
| **Change** | `alternativesFor` — the best pieces for that slot given the rest of the look (`rankAlternatives`: styling rules + 0.6 × taste), one per photo, skipping ones you rejected. Picking one → `replaceSlot`: it becomes *your* pick (kept), the old one is remembered as rejected. *Surprise me* = the next best (`swapSlot`). |
| **Refine** | `focusSlot` — the question flow for that garment, then back to the stack. |
| **Keep** | `toggleLock` — Shuffle and re-builds leave it alone. |
| **Delete** | `omitSlot` — any card can go (Undo for a few seconds). Without a body piece and shoes the look isn't complete, so "Add …" buttons appear (`addableSlots` — after deleting a dress you're offered a top, a bottom, or a dress again, never both) and the runway waits. `fillSlot` adds the best-suited piece *without disturbing the other cards*. |

The top card shows where the post came from, a link back to the original (Pinterest/Vogue/YouTube…), the show film for videos, and *Wear it as shown* for catalog looks. The draft remembers it (`draft.origin`, validated on load — only `https:` pictures and known looks survive).

---

## 4½. The live sources (what refreshes itself)

The live posts in the wall don't come from the catalog at all — they're read from the web while you watch. Files: [`live/`](../src/live) for the logic, [`components/live/`](../src/components/live) for the cards, [`supabase/functions/live-feed/`](../supabase/functions/live-feed/index.ts) for the relay.

```
  every 3 min (REFRESH_MINUTES) while the tab is visible — and on coming back, if > 60 s old
        │
        ├─► read by the browser itself (sites that allow it):
        │      Vogue Runway · British Vogue · GQ (RSS)     V&A museum API (2 designers per refresh, taking turns)
        │      + when the wall runs low: another page of Openverse (CC runway photos) and the V&A
        │        (loadMoreArchive — at most one request per 20 s, 40 per visit)
        │
        └─► read by the relay, a Supabase Edge Function (sites that don't allow it + the Pinterest token):
               13 Pinterest profile feeds · 16 YouTube channels · Harper's Bazaar · ELLE · W · Hypebeast · Dazed
               + your own Pinterest boards through the official API, once PINTEREST_ACCESS_TOKEN is set
        │
        ▼
  live/feedCore.ts    parseFeed: RSS / Atom → title, link, date, image address, YouTube video id
                      (the relay runs an identical copy — a test checks they match)
  live/fetchers.ts    → LiveItem { kind, section, title, url, image ADDRESS, … }   never the picture itself
        │
        ▼
  live/feed.ts        mergeItems  new items in; the same picture at another size = the same item; max 160
                      rankLive    the order (below)
        │
        ▼
  feed/posts.ts       the live queue for the endless wall (§4)
```

### The order

    score = freshness  +  0.8 × Muse's opinion  +  kind bonus

- **Freshness** is 1 when brand new and halves every *half-life*, which depends on the kind (`HALF_LIFE_BY_KIND`): show films 240 h, runway and street style 72 h, Pinterest and archive 48 h, magazine stories 36 h. A show film is still near the front a week after fashion month; a magazine story fades within a day or two.
- **Muse's opinion** is `taste()` over the item's features (next section) — the same model that ranks the catalog. `TASTE_WEIGHT` 0.8 lets a strong preference lift yesterday's Chanel above today's story about a house you keep dismissing.
- **Kind bonus** (`KIND_BONUS`): runway and show films +0.3, street style and Pinterest +0.25, archive +0.15, magazine stories −0.1. A designer's picture from yesterday should come before this morning's article.

Worked example (it's a test): a Dior pin from 18 hours ago against a Dazed story from 12 minutes ago, before Muse has an opinion:

| | freshness | + kind bonus | = score |
|---|---|---|---|
| Dior pin, 18 h old | 0.5^(18/48) = 0.771 | +0.25 | **1.02** |
| Dazed story, 12 min old | 0.5^(0.2/36) = 0.996 | −0.10 | **0.90** |

The pin leads. Finally the row is spread out: never more than 2 in a row from one source (`MAX_IN_A_ROW`) and at most 3 per source among the first 24 cards (`PER_SOURCE_CAP`, `ROW_WINDOW`); the overflow follows after.

### How Muse reads a caption

A live item has no tags — just a title and sometimes categories. [`live/tags.ts`](../src/live/tags.ts) turns that text into the same kind of features the catalog uses:

- **Designers** — `housesIn()` in [`data/houses.ts`](../src/data/houses.ts) finds house names as whole words, ignoring case and accents, with aliases (`#LVSS27` → Louis Vuitton, `DiorSummer27` → Dior) and exclusions ("Celine Dion" isn't Celine) → `house:dior`.
- **Moods and colours** from word lists (`floral`, `lace` → `vibe:romantic`; `black` → `color:black` + `tone:dark`), plus the kind (`kind:street`, `kind:archive`).

Opening a live item records a `home-open` event with those features, and "Not for me" records `home-dismiss` (and hides it for good). So the live row teaches the same model that ranks the catalog — and what you build in the catalog changes the order of the live row.

### "Build a look inspired by this"

A live look is a picture, not tagged garments, so the builder can't dress you in it directly. [`live/inspire.ts`](../src/live/inspire.ts) picks the closest catalog *garment* (shoes and accessories don't compete — they're weak starting points):

    +3 same house  ·  +1 if the piece's colour is mentioned (else +0.5 for the same colour family)
    +0.8 per shared mood  ·  + 0.3 × Muse's opinion

The winner becomes the anchor of a new look (`startFromLive` → `startFromPiece` with the post as the stack's top card), and the top card's panel says why ("same house: Alexander McQueen").

### The relay

Browsers only let a page read another site's data if that site allows it (CORS). Condé Nast's feeds and the V&A do; Pinterest, YouTube and Hearst don't — so a small server function reads those for the page. It is also the only safe home for a Pinterest token (anything in the page is public).

On each request it:

1. answers only callers carrying this project's publishable key in the `apikey` header (otherwise 401) — it's deployed with `--no-verify-jwt` because the platform's own check only understands the older JWT keys;
2. returns its in-memory copy if it's under 5 minutes old (`CACHE_MS`);
3. otherwise reads every source at once (8 s timeout each, up to 10 items per source) and filters: magazines keep looks only and drop shopping; YouTube keeps show films only ("show", "runway", "catwalk", "défilé", or "collection" + a season — not product adverts, not Shorts);
4. returns `{ generatedAt, items, sources }` — `sources` is the per-source report the row's status line shows.

It stores nothing; the cache disappears whenever the function goes to sleep.

**The Pinterest API path.** Once the owner has connected (§4¾), the relay asks `getUsableToken()` (`pinterestStore.ts`) for a token, lists the owner's public boards (`GET /v5/boards`, or just `PINTEREST_BOARD_IDS`), reads up to 8 of them (`GET /v5/boards/{id}/pins`) and turns each pin into a live item (600 px image for the card, 1200 px for the big view, with its real size so it's never cropped). The status calls this source **Your Pinterest boards**. A hand-pasted `PINTEREST_ACCESS_TOKEN` secret overrides it (handy for testing). Tokens are only ever sent to `api.pinterest.com`.

---

## 4¾. "Connect Pinterest" (OAuth)

```
 About page ── Connect Pinterest ──►  pinterest.com/oauth/?client_id=…&redirect_uri=…/pinterest/callback/
                (lib/pinterest.ts)     &scope=boards:read,pins:read,user_accounts:read&state=<random, kept in sessionStorage>
                                                │  you approve
                                                ▼
 /pinterest/callback/?code=…&state=…   (main.tsx shows PinterestCallback.tsx)
        │  1. state must match the one we stored  (stops forged sign-ins)
        │  2. POST { code, redirectUri } → supabase/functions/pinterest-auth
        ▼
 pinterest-auth:  code + APP SECRET → POST /v5/oauth/token → access (30 d) + refresh (60 d, renewed on use)
                  GET /v5/user_account → username must equal PINTEREST_OWNER_USERNAME (else nothing is kept)
                  → upsert the one row of public.pinterest_connection (RLS on, no policies: the web page's
                    key gets "permission denied"; only functions with the service key can read it)
        ▼
 live-feed:       getUsableToken() — renews when < 7 days are left (which also renews the refresh token)
```

The browser never sees a token or the app secret; the one-time code is wiped from the address bar straight away.

---

## 4⅞. Privacy, Terms and hosting

`privacy/index.html` and `terms/index.html` are plain HTML (they work with JavaScript off — what reviewers and search engines see), built as extra pages by Vite. Their `%SITE_NAME%`, `%SITE_URL%`, `%SITE_CONTACT%`… placeholders are filled from [`src/site.ts`](../src/site.ts) by the `siteFacts` plugin in `vite.config.ts`, so the name/URL/contact live in one place. The site is published on **GitHub Pages** in a sub-folder (`/i-dont-know-what-to-wear/`): `tools/deploy-pages.mjs` builds with `BASE_PATH` set to that folder (every in-app link goes through `lib/paths.ts → sitePath`, and the Privacy/Terms links through `%SITE_BASE%`), then pushes only `dist/` to the `gh-pages` branch. Because GitHub Pages has no URL rewriting, `pinterest/callback/index.html` exists as a real page that loads the app. And because it can't send headers, the build embeds the Content-Security-Policy in every page (`<meta http-equiv>`, added by the `siteFacts` plugin to built pages only — the dev server needs inline scripts): scripts only from the site itself, pictures from any `https:` host (the publishers), data from `https:` APIs, frames only from YouTube's privacy-enhanced player. `firebase.json` is an alternative host that sends the same policy as a real header.

---

## 5. The outfit in progress

[`state/draft.ts`](../src/state/draft.ts) is a **state machine written as pure functions** (`draft in → new draft out`). That is why it needs no mocks to test and why the React side ([`AppContext.tsx`](../src/state/AppContext.tsx)) is thin.

```
 no draft ──startFromCategory──►  FOCUSED on a slot ──answer/skip/back──┐
     │                              (question flow)                      │
     │                                   │ commit()                      │
     └──startFromPiece──────────────────►▼◄──────────────────────────────┘
                                  BOARD (focus = null)
                                  refine ─► FOCUSED again
                                  swap · lock · omit · restore · shuffle
```

Each slot is either **user-decided** (`locked: true`) or **engine-picked**. `recompose()` re-runs the composer with the locked pieces fixed — that's how changing the anchor re-builds everything around it, and why a locked shoe survives *Shuffle*.

The draft is saved to `localStorage` on every change and **validated on load** (`validateDraft`): unknown pieces are dropped, junk is ignored, nothing crashes.

---

## 6. Persistence: local first, then sync

```
 you save a look
      │
      ├─► React state + localStorage      instant, always works      (synced: false)
      └─► Supabase upsert (background)    on success                 (synced: true)
                │ on failure → status badge turns red, outfit stays "not synced yet"
                ▼
 next app start:  pull remote  +  any local outfit that never reached the server  →  merged
```

- The id is a UUID made in the browser, so saving offline and uploading later can't clash.
- `upsert … on_conflict=id` makes retries safe.
- `user_id` is **never sent**; the database fills it from the login token (and RLS refuses anything else), so it can't be spoofed from the client.
- Taste events are batched (every 4 s or 12 events, and when the tab is hidden) and never block the UI.

Files: [`lib/supabase.ts`](../src/lib/supabase.ts) (client, anonymous sign-in, status), [`lib/closetStore.ts`](../src/lib/closetStore.ts), [`lib/eventStore.ts`](../src/lib/eventStore.ts), [`state/ClosetContext.tsx`](../src/state/ClosetContext.tsx), [`state/TasteContext.tsx`](../src/state/TasteContext.tsx).

---

## 7. Animation — what's used where

All via the [`motion`](https://motion.dev) library (`motion/react`). It honours the operating system's *Reduce motion* setting (`<MotionConfig reducedMotion="user">` in `App.tsx`), and `base.css` does the same for CSS animation.

| Pattern | What it does | Where |
|---|---|---|
| **Spring `animate`** | Animate a value toward a target with physics, not a fixed duration | gate halves growing (`flexGrow`), every card entrance |
| **`AnimatePresence`** | Animate something *leaving* the page | page transitions, hero photo cross-fade, toasts, drawer |
| **`mode="wait"` / `"popLayout"`** | Wait for the old one to leave / let it leave without shifting layout | `App.tsx` pages; hero photo + slot photos |
| **`layoutId`** | Two elements share an id; when the "active" one moves, motion glides it | nav pill, Men/Women switch pill |
| **`layout`** | Animate position changes when siblings are added/removed | answer chips, board grid, closet grid |
| **`whileInView` + `delay`** | Reveal on scroll, staggered | home rails, category cards |
| **`key` change** | Re-mounts an element, replaying its entrance | runway "walk-in" on shuffle; look-name swap; counter pop |
| **`whileHover` / `whileTap`** | Instant tactile feedback | option & start cards |

To retune a spring: **higher `stiffness` = snappier, higher `damping` = less bounce**. Most are in the 200–300 / 24–30 range.

---

## 8. Tests — what protects you

`npm test` (≈1 s). They double as documentation: each `it("…")` is a sentence about behaviour.

| File | Guards |
|---|---|
| `engine/resolver.test.ts` | catalog integrity (unique ids, known colours, every photo hot-linked from Wikimedia with a sane 2:3 frame, an open licence with author + source, a known show, sensible crops, no duplicate photos); every option offered has a photo; "Whose runway?" offers real houses; the flow terminates |
| `lib/imageUrl.test.ts` | only Wikimedia's standard thumbnail widths are requested — the smallest sharp-enough one, never wider than the original; the crop maths (whole frame, one garment, a frame overhanging a narrow photo) |
| `live/feedCore.test.ts` | the feed reader on the shape of every real feed it reads (Condé Nast, Hearst, Pinterest's escaped HTML, YouTube's Atom, Hypebeast, Dazed); asking each publisher's image server for a sensible size; never throws on junk; the files that exist twice (feedCore.ts, pinterestStore.ts) are identical |
| `feed/feed.test.ts` | the endless feed: more columns on wider screens, shortest-column placement with the stagger, no two cards ever overlap, wide cards only where there's room, only nearby cards drawn; posts follow the beat, never repeat within a cycle, continue where they left off, refill from other queues, start a new cycle (endless) or end (filtered views); shapes stable per item, varied, never cropping pins/museum photos |
| `components/builder/deckLayout.test.ts` | the stack: top card in front with the others peeking out, hand-stacked angles; the fan spreads symmetrically on an arc, lifts and fronts the picked card, nudges neighbours, overlaps more on phones; 3:4 card sizes |
| `live/feed.test.ts` | recognising designers (and not "LV" inside "silver" or Celine Dion as Celine); the looks-only filter; merging refreshes without duplicates; the order (a designer's look beats a fresher article, taste lifts a favourite house, dismissed and other-section items hidden, no source floods the row); freshness per kind; "Build a look inspired by this" |
| `engine/composer.test.ts` | one piece → a whole look; no duplicates; dresses suppress top/bottom; omitted slots respected; deterministic per seed; Shuffle really varies; formality coherent; taste can tip the balance; "styled together on the runway"; print sets vs clashing prints |
| `model/tasteModel.test.ts` | learning raises/lowers scores; model = pure function of the log; community prior fades; the home page actually adapts; dismissed cards never return; Muse learns a favourite designer; the "Off the runway" row; rails never repeat a photo |
| `state/draft.test.ts` | the whole journey: questions, back, reopen, commit, swap-never-repeats, lock survives shuffle; delete ANY card (incomplete until added back), add back without disturbing the rest, dress ↔ separates, "Change" alternatives become a kept pick, wrong-slot refused; the stack's origin saved and validated (unknown looks / non-https pictures dropped) |

The most useful habit: **after editing `looks.src.txt` (then `npm run looks`) or `wardrobe.ts`, run `npm test`.**
