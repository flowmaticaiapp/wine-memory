// dining-recommend — Supabase Edge Function (Deno).
// Sommelier recommendation for ordering at a restaurant: given a dish and the
// restaurant's wine list (optional), returns a STYLE/region recommendation and
// the best on-list pick. Replaces the prototype's window.claude.complete path
// (which doesn't exist in the deployed app). Key stays server-side.

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = Deno.env.get("DINING_MODEL") ?? "claude-sonnet-4-6";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    dish: { type: "string" },
    primary: {
      type: "object",
      additionalProperties: false,
      properties: {
        grape: { type: "string", description: "Human-friendly style/grape to order, e.g. 'Chardonnay'" },
        why: { type: "string", description: "Why it works, plain language, 1-2 sentences" },
        deeperTitle: { type: "string", description: "A specific region to look for, e.g. 'Chablis'" },
        deeper: { type: "string", description: "One line on why that region fits" },
        matchGrapes: { type: "array", items: { type: "string" }, description: "Grapes/terms to match against the list" },
      },
      required: ["grape", "why", "deeperTitle", "deeper", "matchGrapes"],
    },
    others: {
      type: "array",
      description: "Exactly two alternative styles that also work.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { grape: { type: "string" }, why: { type: "string" } },
        required: ["grape", "why"],
      },
    },
    listPickName: { type: "string", description: "Best matching wine name ON THE LIST, or empty string if none/no list" },
    listPickWhy: { type: "string" },
  },
  required: ["dish", "primary", "others", "listPickName", "listPickWhy"],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!ANTHROPIC_API_KEY) return json({ error: "Recommendations are not configured." }, 503);

  try {
    const body = await req.json().catch(() => ({}));
    const dish = typeof body.dish === "string" && body.dish.trim() ? body.dish.trim() : "dinner";
    const list = Array.isArray(body.list) ? body.list.slice(0, 60) : [];

    const prompt =
      `You are a sommelier helping someone choose wine to ORDER at a restaurant. Do NOT reference any home collection.\n` +
      `Dish: "${dish}"\n` +
      `Restaurant wine list (may be empty): ${JSON.stringify(list)}\n\n` +
      `Recommend a human-friendly STYLE (grape) for the dish, why it works in plain language, a region to look for, and exactly 2 other styles. ` +
      `If the wine list is non-empty, also pick the single best matching wine ON THE LIST (by its exact name) for listPickName and say why in listPickWhy; if nothing fits or the list is empty, set listPickName to "".\n` +
      `For delicate/creamy/herb dishes prefer light, high-acid styles; avoid heavy reds unless it's rich red meat.`;

    const callClaude = (withEffort: boolean): Promise<Response> => {
      const output_config: Record<string, unknown> = { format: { type: "json_schema", schema: SCHEMA } };
      if (withEffort) output_config.effort = "low";
      return fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          output_config,
          messages: [{ role: "user", content: prompt }],
        }),
      });
    };

    let res = await callClaude(true);
    if (res.status === 400 && /effort parameter/i.test(await res.clone().text())) {
      res = await callClaude(false);
    }

    if (!res.ok) {
      const raw = await res.text();
      console.error("Anthropic error", res.status, raw);
      let reason = raw;
      try { reason = JSON.parse(raw)?.error?.message ?? raw; } catch (_) { /* keep raw */ }
      return json({ error: "Recommendation failed upstream.", upstreamStatus: res.status, detail: reason }, 502);
    }

    const data = await res.json();
    const text = (data.content ?? []).find((b: { type: string }) => b.type === "text")?.text ?? "{}";
    const parsed = JSON.parse(text);
    return json(parsed);
  } catch (e) {
    console.error("dining-recommend error", e);
    return json({ error: "Recommendation error." }, 500);
  }
});
