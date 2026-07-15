# Weekly Planner — setup (real-app edition)

The planner is now a Vite + React + TypeScript app backed by a **normalized Supabase
schema** (one row per block/habit/log — no more last-write-wins blob). Do the one-time
setup below; every other device just opens the URL and signs in.

> The old single-file mockup lives in `legacy/index.html` and still works against the
> old `planners` table if you ever need it.

## Step 1 — Create a Supabase project (free)

1. Go to **https://supabase.com** → sign up → **New project** (pick the region closest
   to you, e.g. Southeast Asia — Singapore).
2. In **Authentication → Providers → Email**, turn **Confirm email OFF** (the app uses
   email + password sign-in).

## Step 2 — Create the schema

Open the **SQL Editor** → New query → paste the whole contents of
`supabase/migrations/0001_normalized_schema.sql` → **Run**.

This creates `days`, `blocks`, `block_logs`, `habits`, `habit_logs`, `buckets`,
`bucket_tasks`, `design_items`, and `profiles`, each locked to your user with
row-level security.

## Step 3 — Configure the app

```bash
cp .env.example .env
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from
**Project Settings → API**. (The anon key is public by design — RLS is the security
layer.) The keys are baked in at build time; there is no paste-your-keys screen anymore.

## Step 4 — Run / build

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests (planner logic)
npm run test:e2e   # Playwright smoke test
npm run build      # production build in dist/
```

First sign-in on a fresh account seeds the default week automatically.

## Step 5 — Bring over your existing data (one time)

If you used the legacy app, your planner is a jsonb blob in the `planners` table.
Add `LEGACY_IMPORT_EMAIL` and `LEGACY_IMPORT_PASSWORD` (your planner login) to `.env`,
then:

```bash
npm run import-legacy
```

It copies days, blocks, habits, buckets, the designed day, notes, **and your full
completion/streak history** into the new tables, and leaves the old blob in place as a
backup.

## Step 6 — Deploy (free)

Any static host works. Recommended: **Cloudflare Pages** or **Netlify** —

- Build command: `npm run build` · Output directory: `dist`
- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as build-time environment
  variables in the host's dashboard.

Then in Supabase → **Authentication → URL Configuration**, set **Site URL** to your
deployed URL.

GitHub Pages also works with the caveats in `PLAN.md` (public repo on the free plan,
`base` path in `vite.config.ts` or a custom domain).

### Keeping the free project awake

Supabase pauses free projects after ~7 idle days. `.github/workflows/keepalive.yml`
pings it twice a week — add `SUPABASE_URL` and `SUPABASE_ANON_KEY` as **repo secrets**
to enable it.

## Every other device

Open the deployed URL → sign in with your email + password. That's it — no keys to
paste. Changes sync per-row, and the app refetches when you return to the tab
(add the optional Realtime publication in the migration file for live updates).

On a phone/iPad: open in Safari → Share → **Add to Home Screen** — it installs as a
PWA with offline caching.
