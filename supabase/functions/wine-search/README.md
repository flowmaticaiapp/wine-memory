# wine-search Edge Function

AI-backed wine identification for the "Search a bottle" flow. Replaces the old
static 6-wine demo list. Calls the Anthropic Messages API and returns structured
candidates. Requires a signed-in user (Supabase verifies the JWT), so the
Anthropic key is never exposed to the client.

## One-time setup

1. **Anthropic API key** — create one at console.anthropic.com (Billing must be
   set up; calls cost money). Copy the `sk-ant-...` key.

2. **Store it as a Supabase secret** (never commit it):
   ```bash
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   # optional — cheaper/faster model for high volume:
   # npx supabase secrets set WINE_MODEL=claude-haiku-4-5
   ```

3. **Deploy the function:**
   ```bash
   npx supabase login          # one-time, interactive
   npx supabase link --project-ref ohovvvnhwxttqtmhanpm
   npx supabase functions deploy wine-search
   ```

## Notes
- Model defaults to `claude-sonnet-4-6` (cheaper/faster than Opus, supports
  `effort` + structured outputs). Override with the `WINE_MODEL` secret — e.g.
  `claude-opus-4-8` for tougher lookups. Note: `claude-haiku-4-5` does NOT support
  the `effort` param, so it can't be used without also editing `index.ts`.
- `effort: "low"` keeps it snappy; bump to `medium`/`high` in `index.ts` for more
  thoroughness.
- The client calls it via `supabase.functions.invoke('wine-search', { body:{ query } })`
  in `src/components/add.jsx`.
