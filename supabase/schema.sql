-- ════════════════════════════════════════════════════════════════════════════
--  What to Wear — Supabase schema
-- ════════════════════════════════════════════════════════════════════════════
--
--  HOW TO RUN THIS
--    1. Open your project at https://supabase.com/dashboard
--    2. Left sidebar → "SQL Editor" → "New query"
--    3. Paste this ENTIRE file and press "Run".
--    It is safe to run more than once (everything is "if not exists" /
--    "create or replace" / "drop policy if exists").
--
--  THEN, ONE SETTING IN THE DASHBOARD
--    Authentication → Sign In / Providers → turn ON "Allow anonymous sign-ins".
--    (The app signs every browser in as an anonymous user, so each person gets
--    a private closet without ever seeing a login screen.)
--
--  WHAT THIS CREATES
--    1. closet_outfits   your saved looks                    (the "Closet" tab)
--    2. choice_events    anonymous taste signals              (what Muse learns from)
--    3. trending_features()  an aggregate over choice_events  (the community prior)
--    4. pinterest_connection  the site owner's Pinterest tokens (server-only)
--
--  SECURITY IN ONE PARAGRAPH
--    The "anon" API key is in the web page's source — everybody can see it, and
--    that is fine. What protects your data is ROW LEVEL SECURITY (RLS): every
--    table below has policies that say "a signed-in user may only touch rows
--    whose user_id is their own". Without a matching policy, a request is
--    simply refused. The one cross-user thing — trending_features() — only
--    ever returns *aggregated counts*, and only for features that at least
--    three different people have produced.
-- ════════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────────
--  1. closet_outfits — saved looks
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.closet_outfits (
  -- Generated in the browser (crypto.randomUUID) so the app can save offline
  -- and sync later without ID clashes.
  id          uuid primary key,

  -- Who owns the row. The DEFAULT fills it in from the login token on the
  -- server, so the app never sends it and can never spoof someone else's id.
  user_id     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,

  name        text not null check (char_length(name) between 1 and 80),
  section     text not null check (section in ('menswear', 'womenswear')),

  -- The outfit itself: { top: {id,title,image,credit,…}, bottom: {…}, … }.
  -- A *snapshot*, so the closet still renders if the catalog changes.
  look        jsonb not null,

  -- Searchable words derived from the look: mood, colours, silhouette.
  tags        text[] not null default '{}',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Closet screens always ask for "my outfits, newest first".
create index if not exists closet_outfits_user_created_idx
  on public.closet_outfits (user_id, created_at desc);

-- Keep updated_at honest on every UPDATE, whatever the client sends.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''   -- pinned, so the function can't be tricked by a rogue schema
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists closet_outfits_touch on public.closet_outfits;
create trigger closet_outfits_touch
  before update on public.closet_outfits
  for each row execute function public.touch_updated_at();

-- Turn RLS on. From this moment NO row is visible to anyone until a policy
-- below allows it.
alter table public.closet_outfits enable row level security;

-- `to authenticated` includes anonymous sign-ins (they use the authenticated
-- role). `(select auth.uid())` is written as a sub-select on purpose: Postgres
-- then evaluates it once per query instead of once per row.
drop policy if exists "closet: read own"   on public.closet_outfits;
drop policy if exists "closet: insert own" on public.closet_outfits;
drop policy if exists "closet: update own" on public.closet_outfits;
drop policy if exists "closet: delete own" on public.closet_outfits;

create policy "closet: read own"
  on public.closet_outfits for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "closet: insert own"
  on public.closet_outfits for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "closet: update own"
  on public.closet_outfits for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "closet: delete own"
  on public.closet_outfits for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Table privileges — LEAST PRIVILEGE.
-- RLS decides *which rows*; GRANT decides whether a role may use the table at
-- all. Supabase auto-grants broad rights on new tables to `anon` and
-- `authenticated`; RLS would still protect the rows, but we strip everything
-- and grant back only what the app uses. (This also behaves correctly on
-- newer projects that don't auto-grant.) The signed-out `anon` role gets
-- nothing: it can't even reach the table.
revoke all on public.closet_outfits from anon, authenticated;
grant select, insert, update, delete on public.closet_outfits to authenticated;


-- ────────────────────────────────────────────────────────────────────────────
--  2. choice_events — what people pick (the raw material for "learning")
-- ────────────────────────────────────────────────────────────────────────────
--
--  One row per signal. Example row:
--      section = 'menswear', event_type = 'option',
--      features = {'fit:baggy','fitcat:baggy:pants'}, label = 1, weight = 1
--  Meaning: "someone building menswear picked 'baggy' for pants — a yes".
--  There are no photos, outfits, names or emails in here — only feature labels.

create table if not exists public.choice_events (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  section      text not null check (section in ('menswear', 'womenswear')),
  event_type   text not null check (char_length(event_type) <= 32),
  -- The feature labels this event is about. Bounded so nobody can stuff the table.
  features     text[] not null check (cardinality(features) between 1 and 24),
  label        smallint not null check (label in (0, 1)),   -- 1 = yes, 0 = no
  weight       real not null default 1 check (weight > 0 and weight <= 5),
  occurred_at  timestamptz not null default now()
);

create index if not exists choice_events_user_time_idx
  on public.choice_events (user_id, occurred_at desc);
create index if not exists choice_events_section_time_idx
  on public.choice_events (section, occurred_at desc);

alter table public.choice_events enable row level security;

drop policy if exists "events: read own"   on public.choice_events;
drop policy if exists "events: insert own" on public.choice_events;
drop policy if exists "events: delete own" on public.choice_events;

-- You can read back your own history (lets your taste follow you to a new
-- browser) …
create policy "events: read own"
  on public.choice_events for select to authenticated
  using ((select auth.uid()) = user_id);

-- … add to it …
create policy "events: insert own"
  on public.choice_events for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- … and wipe it ("Reset what Muse has learned"). There is deliberately NO
-- update policy: the log is append-only.
create policy "events: delete own"
  on public.choice_events for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Least privilege again. Note there is NO update here — not just no policy,
-- the privilege itself is absent, so an UPDATE is refused outright.
revoke all on public.choice_events from anon, authenticated;
grant select, insert, delete on public.choice_events to authenticated;

-- The identity column's sequence is needed to insert a row.
revoke all on sequence public.choice_events_id_seq from anon, authenticated;
grant usage on sequence public.choice_events_id_seq to authenticated;


-- ────────────────────────────────────────────────────────────────────────────
--  3. trending_features() — the community prior
-- ────────────────────────────────────────────────────────────────────────────
--
--  Adds up everyone's events per feature, e.g.
--      feature        pos   neg   users
--      fit:baggy      412    96     38
--  The app turns those counts into a gentle "the community likes this"
--  nudge (src/model/crowd.ts).
--
--  SECURITY DEFINER means it runs with the function owner's rights, so it can
--  read all users' rows — which RLS would normally forbid. That's safe here
--  because it can only ever return aggregates, never rows, and because of the
--  privacy floor below.
--
--  PRIVACY FLOOR  (k_floor)
--    A feature is only returned if at least this many DIFFERENT people produced
--    it, whatever the client asks for. While you are developing alone, set it
--    to 1 to see the community rails light up, then put it back to 3+.

create or replace function public.trending_features(
  p_section    text,
  p_days       int default 45,
  p_min_users  int default 3
)
returns table (
  feature  text,
  pos      double precision,
  neg      double precision,
  users    bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  k_floor constant int := 3;                                  -- ← privacy floor
  v_days  int := greatest(1, least(coalesce(p_days, 45), 365));
  v_min   int := greatest(coalesce(p_min_users, k_floor), k_floor);
begin
  return query
  select
    f.feature,
    sum(case when e.label = 1 then e.weight else 0 end)::double precision as pos,
    sum(case when e.label = 0 then e.weight else 0 end)::double precision as neg,
    count(distinct e.user_id)                                             as users
  from public.choice_events e
  cross join lateral unnest(e.features) as f(feature)
  where e.section = p_section
    and e.occurred_at > now() - make_interval(days => v_days)
  group by f.feature
  having count(distinct e.user_id) >= v_min;
end;
$$;

-- Lock the function down. Only SIGNED-IN users may call it — and that includes
-- anonymous sign-ins, which is what the app uses (it signs in before asking).
-- The signed-out `anon` role gets nothing.
--
-- Supabase's security advisor will still show one WARN here ("signed-in users
-- can execute a SECURITY DEFINER function"). That is the intended design: the
-- function is *meant* to be callable, and it returns only aggregates above the
-- privacy floor. It is safe to dismiss.
revoke all on function public.trending_features(text, int, int) from public, anon;
grant execute on function public.trending_features(text, int, int) to authenticated;


-- ────────────────────────────────────────────────────────────────────────────
--  Optional housekeeping (not run automatically)
-- ────────────────────────────────────────────────────────────────────────────
--
--  Delete event rows older than 90 days (run occasionally, or schedule it with
--  Supabase's pg_cron / "Cron" feature):
--
--      delete from public.choice_events where occurred_at < now() - interval '90 days';
--
--  Anonymous users with no data are not removed automatically. See Supabase
--  docs → "Anonymous sign-ins" → "Cleanup" if you ever want to prune them.


-- ────────────────────────────────────────────────────────────────────────────
--  4. pinterest_connection — the site owner's Pinterest tokens (server-only)
-- ────────────────────────────────────────────────────────────────────────────
--  Filled in when the owner clicks "Connect Pinterest" on the About page
--  (supabase/functions/pinterest-auth) and read by the live feed
--  (supabase/functions/live-feed) to show pins from the owner's boards.
--
--  SECURITY: row-level security is ON and there are deliberately NO policies,
--  and the public roles have no privileges on it — so the publishable / anon
--  key in the web page can never read a token. Only the Edge Functions can,
--  with the service key Supabase gives them. (Supabase's linter reports
--  "RLS enabled, no policy" for this table as INFO — that's the point.)

create table if not exists public.pinterest_connection (
  id                 smallint primary key default 1 check (id = 1),  -- one row only
  username           text not null,
  access_token       text not null,
  refresh_token      text,
  scope              text,
  expires_at         timestamptz,
  refresh_expires_at timestamptz,
  connected_at       timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.pinterest_connection is
  'The site owner''s Pinterest OAuth tokens (single row). RLS on with no policies: never readable with the public keys; only server functions using the service key can touch it.';

alter table public.pinterest_connection enable row level security;
revoke all on table public.pinterest_connection from anon, authenticated;
