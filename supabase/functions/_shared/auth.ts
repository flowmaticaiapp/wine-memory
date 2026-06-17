// _shared/auth.ts — auth gate + per-user daily rate limit for the AI functions.
//
// HOW AUTH IS VERIFIED:
// The browser client (supabase-js) attaches the signed-in user's access-token JWT
// as the `Authorization: Bearer <jwt>` header on every functions.invoke() call.
// Here we build a Supabase client carrying that header and call auth.getUser(),
// which validates the JWT against Supabase Auth and returns the real user. The
// PUBLIC anon/publishable key (which ships in the website JS) is NOT a user token,
// so getUser() returns no user for it → we reject. Result: only signed-in users
// can reach the model; anonymous/scripted calls with the public key get 401.
//
// Rate limit: a rolling 24h count of the user's own rows in `ai_usage` (RLS-scoped).
// Logging/limit are best-effort — a missing table never blocks a real user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const DAILY_LIMIT = Number(Deno.env.get("DAILY_AI_LIMIT") ?? "50");

type GateResult =
  | { ok: true; user: { id: string }; supabase: ReturnType<typeof createClient> }
  | { ok: false; status: number; error: string };

export async function gate(req: Request, fn: string, kind?: string): Promise<GateResult> {
  const authHeader = req.headers.get("Authorization") || "";
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    return { ok: false, status: 401, error: "Please sign in to use Wine Memory." };
  }

  // Best-effort daily limit + usage logging (never block on a missing table).
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: cErr } = await supabase
      .from("ai_usage")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since);
    if (!cErr && (count ?? 0) >= DAILY_LIMIT) {
      return {
        ok: false,
        status: 429,
        error: `You've reached today's limit of ${DAILY_LIMIT} AI requests. It resets in a few hours — thanks for exploring Wine Memory.`,
      };
    }
    await supabase.from("ai_usage").insert({ fn, kind: kind ?? null });
  } catch (_) { /* logging/limit are best-effort */ }

  return { ok: true, user: data.user, supabase };
}
