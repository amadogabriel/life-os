# Plan: from mockup to a real app

The current `index.html` mockup already made the two big platform decisions right —
**Supabase** for auth/data and **static hosting**. The "real app" move is not switching
platforms; it's adding engineering structure around them. Everything below is **$0**
at personal-use scale.

## Tech stack

| Layer | Pick | Why |
|---|---|---|
| Language | **TypeScript** | Biggest single upgrade from the current 995-line JS file |
| UI | **React + Vite** | Huge ecosystem, best docs/AI support, instant dev server |
| Styling | **Tailwind CSS** | Current inline styles translate almost 1:1; no CSS architecture to maintain |
| State/data | **TanStack Query + Supabase JS client** | Caching, refetch-on-focus (replaces the `visibilitychange` hack), optimistic updates |
| Backend | **Supabase** (keep it) | Postgres + auth + row-level security + realtime; no server code ever |
| Hosting | **Cloudflare Pages / Netlify / GitHub Pages** | All free; see hosting notes below |
| Tests | **Vitest + Playwright** | Unit-test planner logic; e2e-test critical flows |
| CI | **GitHub Actions** | Typecheck + lint + test on every push, free |

## Architecture changes that actually matter

1. **Normalize the schema.** Today everything is one `jsonb` blob with last-write-wins —
   an edit on the phone can silently clobber an edit from the PC. Split into real tables
   (`weeks`, `blocks`, `tasks`), each row updated independently. This is the #1 fix:
   conflicts nearly disappear and the data becomes queryable.

2. **Generated types end-to-end.** `supabase gen types typescript` gives compile-time
   safety from the database into components.

3. **Layered code instead of one file:**

   ```
   src/
     features/week/     # components + hooks per feature
     features/tasks/
     lib/supabase.ts    # client, generated types
     lib/queries/       # all data access lives here; UI never touches supabase directly
   ```

4. **Env vars, not a paste-your-keys screen.** Supabase URL/anon key go in `.env` and
   are baked in at build time — the config gate in the mockup disappears. (The anon key
   is public by design; RLS is the security layer.)

5. **Supabase Realtime (optional, free).** Subscribe to changes so other devices update
   live instead of on tab-refocus.

6. **PWA plugin for Vite.** Keeps add-to-home-screen behavior and adds offline caching.

## Hosting notes

- **Cloudflare Pages / Netlify** — free, deploy private repos, SPA redirects built in.
  Default choice if the repo stays private.
- **GitHub Pages** — fully usable, with three caveats:
  1. Free plan requires a **public repo** (private needs GitHub Pro).
  2. Site lives at `username.github.io/planner-app/`, so Vite needs
     `base: '/planner-app/'` (or use a custom domain).
  3. No SPA redirect config — use a hash router or the `404.html` copy trick
     (barely matters for a single-page planner).

## What NOT to do

- **No custom backend** (Node/Express/NestJS) — RLS policies are the authorization
  layer; a server adds cost and maintenance for zero benefit at this scale.
- **No Next.js** — no SEO or server-rendering needs; a static Vite SPA is simpler and
  hosts anywhere free.
- **No heavyweight local-first sync engine** (Replicache, ElectricSQL) yet —
  normalized tables + TanStack Query is 95% of the value at 10% of the complexity.

## Cost reality check

Supabase free tier (500 MB DB — a planner uses a fraction of a MB), static hosting free,
GitHub free. One caveat: Supabase **pauses free projects after ~7 days of no API
activity** — daily use prevents that, or a scheduled GitHub Action ping guarantees it.

## Migration path

1. Scaffold Vite + React + TS + Tailwind.
2. Create normalized Supabase schema + RLS policies; generate types.
3. Port features from `index.html` one at a time (week grid → blocks → tasks → auth).
4. One-time import script: read the existing `jsonb` blob → insert into new tables.
5. Add Vitest/Playwright + GitHub Actions CI, then deploy.
