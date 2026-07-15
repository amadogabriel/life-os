# Weekly Planner — cross-device sync setup

This turns your planner into a real app that syncs across your work PC, home PC, phone, and iPads. Data lives in a free **Supabase** database; you sign in with a **magic email link** (no passwords). Do the one-time setup once; then each device just needs a sign-in.

Estimated time: ~15 minutes.

---

## Step 1 — Create a Supabase project (free)

1. Go to **https://supabase.com** → sign up (GitHub or email).
2. Click **New project**. Pick any name, set a database password (you won't need it for this), choose the region closest to you (e.g. Southeast Asia — Singapore).
3. Wait ~2 minutes for it to provision.

## Step 2 — Create the storage table

1. In your project, open the **SQL Editor** (left sidebar) → **New query**.
2. Paste this and click **Run**:

```sql
create table planners (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb,
  updated_at timestamptz default now()
);

alter table planners enable row level security;

create policy "own row" on planners
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

This creates one row per user and locks it so **only you can read/write your own data**.

## Step 3 — Get your two keys

1. Left sidebar → **Project Settings** → **API**.
2. Copy these two values (keep this tab open):
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key — a long string under "Project API keys". *(The `anon` key is safe to use in the browser — the table policy above is what protects your data.)*

## Step 4 — Deploy the app (get a URL)

The `index.html` file in this folder is the whole app. Host it anywhere static. Easiest option:

**Netlify Drop** (no config):
1. Go to **https://app.netlify.com/drop**.
2. Drag this **`planner-app` folder** onto the page.
3. It gives you a URL like `https://something.netlify.app`. That's your app.

*(Alternatives: Vercel, Cloudflare Pages, GitHub Pages — any static host works.)*

## Step 5 — Tell Supabase your app's URL

Magic links only work if Supabase knows your site.

1. Supabase → **Authentication** → **URL Configuration**.
2. Set **Site URL** to your Netlify URL (from Step 4).
3. Under **Redirect URLs**, add the same URL (with `/*` on the end, e.g. `https://something.netlify.app/*`). Save.

## Step 6 — First run

1. Open your app URL in a browser.
2. It asks for your **Project URL** and **anon key** (Step 3) — paste them, Save. *(Stored on that device only.)*
3. Enter your email → **Send magic link** → open the email → tap the link. You're in.
4. Your planner loads. Every change now saves to the cloud automatically (watch the bar at the bottom).

## On every other device (home PC, phone, iPads)

1. Open the same app URL.
2. Paste the same Project URL + anon key once.
3. Sign in with your email magic link.
4. Same data, everywhere. Changes on one device appear on the others when you reopen/return to the tab.

---

## Notes

- **Bringing your existing data over:** if you already built up a plan in the artifact version, open it, hit **Export**, then in the synced app hit **Import** once after signing in — it'll upload to the cloud and sync from then on.
- **Adding the app to a phone/iPad home screen:** open the URL in Safari → Share → *Add to Home Screen*. It behaves like an app.
- **Cost:** Supabase free tier and Netlify free tier are far more than enough for a personal planner.
- **Privacy:** only someone signed into *your* email can read your data. The anon key in the browser cannot bypass the row-level security policy.
- **Sync model:** saves are automatic and near-instant. Pulling another device's changes happens when you reopen or switch back to the tab. It's last-write-wins, so avoid editing the same thing on two devices at the exact same second.
