# Supabase setup (one-time)

The `supabase-auth` branch adds magic-link auth and persistent, user-specific data
(wines + pairings + bottle photos). To bring it live:

## 1. Create the project (you)
- supabase.com → **New project** (free tier is fine). Pick a name + region.
- When it's ready: **Project Settings → API** → copy the **Project URL** and the **anon public** key.

## 2. Run the schema
- Supabase dashboard → **SQL Editor → New query**
- Paste all of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
- This creates the `wines` + `pairings` tables, enables **RLS**, and creates the
  public **`bottle-photos`** storage bucket with per-user write policies.

## 3. Configure magic-link email
- **Authentication → Providers → Email**: ensure it's enabled (it is by default).
- **Authentication → URL Configuration → Site URL**: set to your app URL
  (`http://localhost:5173` for local, `https://wine-memory.vercel.app` for prod).
  Add both under **Redirect URLs** so links work in either place.
- The free tier's built-in email sender is fine for testing.

## 4. Env vars
**Local:** copy `.env.example` → `.env` and fill in the two values.

**Vercel:** Project → **Settings → Environment Variables** → add for **Production**
(and Preview, if you want the branch preview to work):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

(The anon key is public-safe; RLS is what protects data.)

## 5. Verify end-to-end
- `npm run dev` → you should see the sign-in screen → enter your email → click the
  emailed link → land in an **empty** cellar.
- Add a wine (Search a bottle), set a verdict, save a pairing — reload; it persists.
- Sign out (Tweaks panel → Account → Sign out), sign in as a second email → that
  account sees its **own** empty cellar (RLS isolation).

## Notes
- **My Palate** is computed in the client from `wines` + `pairings` — no table.
- New users start empty (no seed/sample data).
- Deferred on purpose: profiles, dining-experiences persistence, realtime, live Claude.
