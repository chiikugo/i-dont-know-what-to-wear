# Getting Pinterest API access — the application kit

Everything Pinterest asks for when you apply, what's already built into the site, and the exact steps (and copy-paste answers) for the parts only you can do.

> **What the API will let this site do.** Pinterest's API (v5) reads the boards and pins of **the account that signs in** — so the plan is: you pin high-fashion looks to your own public boards, connect your account once, and the home feed shows those pins live (with a link back to each pin). Searching all of Pinterest isn't available to normal apps (it's a partner-only beta).

---

## What Pinterest requires — and where it's covered

| Pinterest's requirement | Where it's covered |
|---|---|
| A **business account** to own the app (personal accounts can't use the developer portal) | You — step 2 below (free) |
| A **live website** for the app | The hosted site (`npm run deploy`, see README → "Hosting") |
| A **privacy policy** that is public, loads fully, describes the app's privacy practices accurately, and is **on the same domain as the website** | [`/privacy/`](../privacy/index.html) on the same host — written from what the code actually does, with a dedicated "How the site uses Pinterest" section |
| Terms of service (good practice; some forms ask) | [`/terms/`](../terms/index.html) |
| A **clear, detailed app description** (vague requests are denied) | Copy-paste text in step 3 below, plus the site's **About** page (`/#/about`) which explains exactly what's read from Pinterest |
| The approved **OAuth flow** — never collecting passwords or cookies | "Connect Pinterest" on the About page → Pinterest's own sign-in → `/pinterest/callback/` → server-side code exchange (`supabase/functions/pinterest-auth`) |
| **Don't store** Pinterest data; call the API when needed | Pins are fetched live, held ≤ 5 minutes in server memory, never written to a database. Only the owner's tokens are stored (server-side, unreadable from the web page) |
| **Link pins back** to Pinterest and make clear they're from Pinterest; **don't alter or cover** pins | Every pin card says "Pinterest", links to the pin, is shown uncropped with its caption *under* the picture, never on it |
| Don't imitate Pinterest's design | The feed is an editorial, drifting wall in the site's own style (staggered columns, serif captions, the card-stack page) |
| Not intended for children under 13 | Stated in the privacy policy |
| For **Standard access**: a video showing the OAuth flow and the live integration | Video script at the end of this page |

Sources: Pinterest's [Connect your app](https://developers.pinterest.com/docs/getting-started/connect-app/), [Access tiers](https://developers.pinterest.com/docs/key-concepts/access-tiers/), [Authentication](https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/), the [developer FAQ](https://community.pinterest.biz/t/frequently-asked-questions-pinterest-api/2083) and the [Developer Guidelines](https://policy.pinterest.com/en/developer-guidelines) (all checked 14 October 2026).

---

## The steps

The site is live on GitHub Pages at **https://chiikugo.github.io/i-dont-know-what-to-wear/** (`npm run deploy` publishes it). If you move it (e.g. to Firebase with `npm run deploy:firebase`), use the new address everywhere below and update `url` in `src/site.ts`.

### 1. The site is online ✓
Already done — these all load:
- https://chiikugo.github.io/i-dont-know-what-to-wear/
- https://chiikugo.github.io/i-dont-know-what-to-wear/privacy/ (contact: chikunwenyi@gmail.com, operator: Chiku Okechukwu)
- https://chiikugo.github.io/i-dont-know-what-to-wear/terms/
- https://chiikugo.github.io/i-dont-know-what-to-wear/#/about

### 2. A Pinterest business account
- Sign in at <https://www.pinterest.com/business/convert/> (converts your account — free, keeps your pins) or create a business account at <https://www.pinterest.com/business/create/>.
- Verify the account's email address.
- Make at least one **public** board and save high-fashion pins into it (from Vogue, the houses' own profiles, anything). These are what the feed will show.
- *(Optional)* Claiming a website on Pinterest needs a domain you control at its root, so it isn't possible on a `github.io/<repo>/` address — skip it (it isn't required for API access), or move the site to its own domain first.

### 3. Register the app
Go to <https://developers.pinterest.com/apps/> → accept the Developer Terms → **Connect app**, and fill in:

| Field | What to enter |
|---|---|
| App name | `What to Wear` |
| Company name | your name (or `What to Wear`) |
| Website / app URL | `https://chiikugo.github.io/i-dont-know-what-to-wear/` |
| Privacy policy URL | `https://chiikugo.github.io/i-dont-know-what-to-wear/privacy/` |
| Terms of service URL (if asked) | `https://chiikugo.github.io/i-dont-know-what-to-wear/terms/` |
| Who will use it | Only me (the site owner's own account) |
| What it does / use case | paste the description below |

**App description (copy-paste):**

> What to Wear (https://chiikugo.github.io/i-dont-know-what-to-wear) is a personal, non-commercial fashion website. Its home page is a continuously refreshing feed of runway and street-style looks; visitors open a look to build an outfit from real runway garments.
>
> We'd like to use the Pinterest API to display pins from my own public Pinterest boards (high-fashion looks I curate) in that feed. Integration: I, the site owner, connect my own Pinterest account once through Pinterest's OAuth sign-in, granting read-only scopes (boards:read, pins:read, user_accounts:read). A server function reads my public boards and their pins when the feed refreshes. Each pin is shown unaltered, clearly labelled as from Pinterest, and links back to the pin on Pinterest.
>
> We never create, save, edit or delete pins or boards; visitors never sign in to Pinterest on our site; Pinterest data is not stored (only held in server memory for up to five minutes), sold, shared, used for advertising or used for AI training. The OAuth tokens are kept server-side only. Privacy policy: https://chiikugo.github.io/i-dont-know-what-to-wear/privacy/. How the site uses Pinterest is also explained at https://chiikugo.github.io/i-dont-know-what-to-wear/#/about.

Submit, and wait for the email — Pinterest reviews requests each business day. You'll get **Trial access**.

### 4. After approval: three secrets and one redirect address
1. In <https://developers.pinterest.com/apps/> → your app → **Manage**:
   - Copy the **App ID** and **App secret**.
   - Open the **Configure** tab → **Redirect URIs** → add exactly (with the final slash):
     `https://chiikugo.github.io/i-dont-know-what-to-wear/pinterest/callback/`
     *(Pinterest requires an exact match — the trailing "/" matters.)*
2. In the Supabase dashboard → project **what-to-wear** → **Edge Functions → Secrets**, add:
   - `PINTEREST_APP_ID` = the App ID
   - `PINTEREST_APP_SECRET` = the App secret
   - `PINTEREST_OWNER_USERNAME` = your Pinterest username (only this account can be connected — so nobody else can put their boards in your feed)

   No redeploy needed — the functions read secrets on every request.

### 5. Connect
Open `https://chiikugo.github.io/i-dont-know-what-to-wear/#/about` → **Connect Pinterest** → approve on Pinterest → you land on "Pinterest connected as @you". Within about five minutes pins from your public boards appear in the home feed (the About page lists "Your Pinterest boards" with a count).

The connection renews itself (30-day access token, 60-day refresh token renewed on each use). If nobody opens the site for two months it lapses — just press Connect again.

### 6. *(Optional)* Standard access
Trial access is enough for reading your own boards. Standard access (higher rate limits) needs a short **screen recording** uploaded via your app's **Upgrade** button. Suggested script (1–2 minutes):
1. Open `https://chiikugo.github.io/i-dont-know-what-to-wear` — show the feed with a Pinterest pin (the "Pinterest" label under it).
2. Go to **About** → scroll to "How this site uses Pinterest" (read-only, nothing stored, link-backs).
3. Press **Connect Pinterest** → show Pinterest's consent screen with the requested scopes → **Allow**.
4. Show the "Pinterest connected" page, then the home feed with your pins.
5. Open one of your pins → the stack page → **Open on Pinterest ↗** lands on the pin.
6. Say (or caption) that tokens are kept server-side only, and no Pinterest data is stored.

---

## If something goes wrong

| You see | Fix |
|---|---|
| Pinterest says the **redirect URI doesn't match** | Add it exactly as above, including `https://` and the final `/` |
| "Only the site owner's Pinterest account (@…) can be connected" | `PINTEREST_OWNER_USERNAME` doesn't match the account you signed in with |
| "The site owner hasn't added the Pinterest app ID and secret" | Step 4.2 — the secrets aren't set yet |
| HTTP 403 `PINNER_DATA_ACCESS_DENIED` | Apps registered after 14 Sept 2026 can't read *non-business* users' data — make sure the account is a business account |
| Your pins don't appear | Boards must be **public**; wait 5 minutes (the server keeps each source for 5 min); check the About page's source list |
| Trial request denied for the privacy policy | Make sure `/privacy/` loads on the **same domain** as the website you entered, and that the contact email is filled in |

## What only you can do
Create or convert the business account, fill in and submit Pinterest's form, copy the App ID/secret into Supabase secrets, press Connect, and (for Standard access) record the video. No passwords, keys or tokens ever need to be typed into this project's code.
