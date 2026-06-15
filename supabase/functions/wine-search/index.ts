// wine-search — Supabase Edge Function (Deno).
// Identifies/enriches a wine from a typed name via the Anthropic Messages API,
// returning structured candidates (guaranteed JSON via output_config.format).
// Requires a signed-in user (Supabase verifies the JWT by default), so the
// Anthropic key is never exposed and only authenticated callers can use it.

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
// Default to Sonnet 4.6: cheaper and faster than Opus, and plenty accurate for
// wine identification (a recall task), while still supporting the `effort` param
// and structured outputs this function relies on. Override with the WINE_MODEL
// secret to trade accuracy for cost — e.g. claude-opus-4-8 for tougher lookups.
// (Note: claude-haiku-4-5 is cheaper still but does NOT support `effort`, so it
// can't be dropped in here without also removing that param below.)
const MODEL = Deno.env.get("WINE_MODEL") ?? "claude-sonnet-4-6";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Structured-output schema. Note: JSON-schema numeric/string *constraints*
// (min/max/length) aren't supported by structured outputs, so ranges are
// stated in the prompt and field descriptions instead.
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    matches: {
      type: "array",
      description: "Up to 3 real wines that best match the query, best match first.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          producer: { type: "string", description: "Winery / producer" },
          name: { type: "string", description: "Wine / cuvée name (no producer, no vintage)" },
          vintage: { type: "string", description: "Year as a string, or 'NV'" },
          type: { type: "string", enum: ["Red", "White", "Rosé", "Sparkling", "Dessert", "Fortified"] },
          grape: { type: "string", description: "Primary grape(s)" },
          region: { type: "string", description: "Wine region, e.g. 'Barbaresco, Piedmont'" },
          country: { type: "string" },
          family: { type: "string", enum: ["bold", "bright", "juicy", "wild"], description: "bold=full-bodied/structured, bright=high-acid/crisp, juicy=fruit-forward, wild=earthy/savoury" },
          flavor: {
            type: "object",
            additionalProperties: false,
            description: "Flavor profile, each axis an integer 0-5",
            properties: {
              body: { type: "integer" },
              acidity: { type: "integer" },
              tannin: { type: "integer" },
              fruit: { type: "integer" },
              oak: { type: "integer" },
            },
            required: ["body", "acidity", "tannin", "fruit", "oak"],
          },
          pairings: { type: "array", items: { type: "string" }, description: "2-3 food pairings" },
          lat: { type: "number", description: "Approx latitude of the region (optional)" },
          lng: { type: "number", description: "Approx longitude of the region (optional)" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["producer", "name", "vintage", "type", "grape", "region", "country", "family", "flavor", "pairings", "confidence"],
      },
    },
  },
  required: ["matches"],
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
  if (!ANTHROPIC_API_KEY) return json({ error: "Search is not configured." }, 503);

  try {
    const { query } = await req.json().catch(() => ({ query: "" }));
    const q = typeof query === "string" ? query.trim() : "";
    if (q.length < 2) return json({ matches: [] });

    const prompt =
      `You are a wine expert helping someone log a wine they're holding. They typed: "${q}".\n` +
      `Identify the most likely REAL wines that match — handle partial names, misspellings, and "producer + grape" or "producer + region" queries.\n` +
      `Return up to 3 candidates, best match first. For a clear single match, one candidate is fine; add close alternatives only when genuinely plausible.\n` +
      `Ground every field in real-world wine knowledge — do not invent a producer or bottling that doesn't exist. If you can't identify any real wine, return an empty matches array.\n` +
      `Set confidence honestly (high = you're sure of the exact bottling; low = a guess). Flavor axes are integers 0-5. Provide approximate region lat/lng when you know them.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        // Low effort keeps this snappy; wine identification is recall, not deep
        // reasoning. Bump to "medium"/"high" if you want more thoroughness.
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const raw = await res.text();
      console.error("Anthropic error", res.status, raw);
      // Surface a concise, non-secret reason (Anthropic error messages are safe
      // to relay) so failures are diagnosable instead of an opaque 502.
      let reason = raw;
      try {
        const parsedErr = JSON.parse(raw);
        reason = parsedErr?.error?.message ?? raw;
      } catch (_) { /* keep raw text */ }
      return json({ error: "Search failed upstream.", upstreamStatus: res.status, detail: reason }, 502);
    }

    const data = await res.json();
    const text = (data.content ?? []).find((b: { type: string }) => b.type === "text")?.text ?? "{}";
    const parsed = JSON.parse(text);
    return json({ matches: Array.isArray(parsed.matches) ? parsed.matches : [] });
  } catch (e) {
    console.error("wine-search error", e);
    return json({ error: "Search error." }, 500);
  }
});
