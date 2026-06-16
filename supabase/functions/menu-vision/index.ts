// menu-vision — Supabase Edge Function (Deno).
// Reads a photo of a restaurant MENU or WINE LIST via Claude vision and returns
// structured text (dish names / parsed wines). Mirrors wine-search: raw fetch to
// the Anthropic Messages API, structured outputs, JWT-protected, key server-side.

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
// Vision-capable, cheaper/faster than Opus, supports effort + structured outputs.
const MODEL = Deno.env.get("MENU_MODEL") ?? "claude-sonnet-4-6";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    dishes: {
      type: "array",
      description: "Food dishes read from a menu photo (empty for a wine-list photo).",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { name: { type: "string", description: "Dish name only — no description or price" } },
        required: ["name"],
      },
    },
    wines: {
      type: "array",
      description: "Wines read from a wine-list photo (empty for a menu photo).",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", description: "Producer + cuvée exactly as printed" },
          grape: { type: "string", description: "Grape/varietal if shown, else empty" },
          vintage: { type: "string", description: "Vintage year if shown, else empty" },
          price: { type: "number", description: "By-the-bottle price as a number if shown" },
        },
        required: ["name"],
      },
    },
  },
  required: ["dishes", "wines"],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

// Accepts a data URL ("data:image/jpeg;base64,...") and splits it for the API.
function parseDataUrl(dataUrl: unknown): { media_type: string; data: string } | null {
  if (typeof dataUrl !== "string") return null;
  const m = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/s.exec(dataUrl);
  return m ? { media_type: m[1], data: m[2] } : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!ANTHROPIC_API_KEY) return json({ error: "Photo reading is not configured." }, 503);

  try {
    const { image, kind } = await req.json().catch(() => ({}));
    const img = parseDataUrl(image);
    if (!img) return json({ error: "No readable image provided (expected a JPEG/PNG/WebP data URL)." }, 400);

    const isWine = kind === "winelist";
    const prompt = isWine
      ? `This is a photo of a restaurant WINE LIST. Read every wine you can see and return them in "wines": ` +
        `producer + name exactly as printed (name), the grape/varietal if shown (grape), the vintage year if shown (vintage), ` +
        `and the by-the-bottle price as a plain number if shown (price). Leave "dishes" empty. ` +
        `If the photo is blurry or unreadable, return empty arrays rather than guessing.`
      : `This is a photo of a restaurant FOOD MENU. Read EVERY orderable dish and return them in "dishes". ` +
        `Scan the WHOLE image methodically — every section and every column, top to bottom, left to right. ` +
        `Be exhaustive: do not stop early, sample, or summarize — a typical menu has 15-40 items and you must list them all. ` +
        `Each entry is just the dish name (no price, and drop long descriptions, but keep the full dish name). ` +
        `Skip only section titles like "Antipasti"/"Mains". If part of the photo is genuinely unreadable, include what you can read rather than returning nothing.`;

    // Menus need thorough scanning; "low" effort makes the model bail early on
    // busy/stylized layouts. Use medium for recall (retry drops effort if the
    // model rejects the param entirely).
    const EFFORT = isWine ? "low" : "medium";
    const callClaude = (withEffort: boolean): Promise<Response> => {
      const output_config: Record<string, unknown> = { format: { type: "json_schema", schema: SCHEMA } };
      if (withEffort) output_config.effort = EFFORT;
      return fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4096,
          output_config,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } },
              { type: "text", text: prompt },
            ],
          }],
        }),
      });
    };

    let res = await callClaude(true);
    // Some models reject the `effort` param — transparently retry without it.
    if (res.status === 400 && /effort parameter/i.test(await res.clone().text())) {
      res = await callClaude(false);
    }

    if (!res.ok) {
      const raw = await res.text();
      console.error("Anthropic error", res.status, raw);
      let reason = raw;
      try { reason = JSON.parse(raw)?.error?.message ?? raw; } catch (_) { /* keep raw */ }
      return json({ error: "Photo reading failed upstream.", upstreamStatus: res.status, detail: reason }, 502);
    }

    const data = await res.json();
    const text = (data.content ?? []).find((b: { type: string }) => b.type === "text")?.text ?? "{}";
    const parsed = JSON.parse(text);
    return json({
      dishes: Array.isArray(parsed.dishes) ? parsed.dishes : [],
      wines: Array.isArray(parsed.wines) ? parsed.wines : [],
    });
  } catch (e) {
    console.error("menu-vision error", e);
    return json({ error: "Photo reading error." }, 500);
  }
});
