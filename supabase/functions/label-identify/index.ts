// label-identify — Supabase Edge Function (Deno).
// Real Claude-vision identification for "Snap a label": given a bottle/label
// photo, returns a structured best-guess wine identification with a confidence
// score. The client lets the user confirm/edit before saving, and falls back to
// Search a Bottle when confidence is low. Key stays server-side.

import { gate } from "../_shared/auth.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = Deno.env.get("LABEL_MODEL") ?? "claude-sonnet-4-6";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    found: { type: "boolean", description: "true if you can identify a real, specific wine from the label" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    producer: { type: "string", description: "Winery / producer as printed" },
    name: { type: "string", description: "Wine / cuvée name (no producer, no vintage)" },
    vintage: { type: "string", description: "Year as a string, or 'NV'" },
    type: { type: "string", enum: ["Red", "White", "Rosé", "Sparkling", "Dessert", "Fortified"] },
    grape: { type: "string", description: "Primary grape(s) if known/printed" },
    region: { type: "string", description: "Wine region, e.g. 'Barolo, Piedmont'" },
    country: { type: "string" },
    blurb: { type: "string", description: "When found, ONE vivid sommelier-style sentence, 20-30 words: what this wine is and why someone would enjoy it. Warm, educational, editorial — never salesy. Empty string if not identified." },
    style: { type: "string", description: "When found, a 2-4 word style descriptor, e.g. 'Crisp coastal white', 'Bold structured red'. Empty string if not identified." },
    tastesLike: { type: "array", items: { type: "string" }, description: "When found, EXACTLY 3 short flavor/aroma descriptors. Empty array if not identified." },
    pairsWith: { type: "array", items: { type: "string" }, description: "When found, EXACTLY 3 concise food pairings. Empty array if not identified." },
    lat: { type: "number", description: "Approx latitude of the region (optional)" },
    lng: { type: "number", description: "Approx longitude of the region (optional)" },
  },
  required: ["found", "confidence", "producer", "name", "vintage", "type", "grape", "region", "country", "blurb", "style", "tastesLike", "pairsWith"],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function parseDataUrl(dataUrl: unknown): { media_type: string; data: string } | null {
  if (typeof dataUrl !== "string") return null;
  const m = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/s.exec(dataUrl);
  return m ? { media_type: m[1], data: m[2] } : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!ANTHROPIC_API_KEY) return json({ error: "Label reading is not configured." }, 503);

  const g = await gate(req, "label-identify");
  if (!g.ok) return json({ error: g.error, blocked: true }, g.status);

  try {
    const { image } = await req.json().catch(() => ({}));
    const img = parseDataUrl(image);
    if (!img) return json({ error: "No readable image provided (expected a JPEG/PNG/WebP data URL)." }, 400);

    const prompt =
      `This is a photo of a wine bottle / label. Read the label text and identify the wine as specifically as you can. ` +
      `Return your best structured identification: producer, wine name (no producer/vintage), vintage (year or "NV"), type, grape(s), region, country. ` +
      `Set "found"=true and "confidence" honestly — high only if you're confident of the exact bottling, medium for a strong read, low for a guess. ` +
      `If you genuinely cannot identify a real wine from the label, set found=false, confidence="low", and fill only what's clearly legible (e.g. type or producer). ` +
      `Do not invent a producer or bottling that isn't visible on the label. Provide approximate region lat/lng when you know them.\n` +
      `When you DO identify the wine, also write, in the editorial voice of a warm sommelier: a "blurb" (ONE sentence, 20-30 words, what it is and why someone would enjoy it — concrete and educational, never marketing-speak), a 2-4 word "style", exactly 3 "tastesLike" flavor descriptors, and exactly 3 "pairsWith" food pairings. If found=false, leave blurb and style empty strings and tastesLike/pairsWith empty arrays.`;

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
    if (res.status === 400 && /effort parameter/i.test(await res.clone().text())) {
      res = await callClaude(false);
    }

    if (!res.ok) {
      const raw = await res.text();
      console.error("Anthropic error", res.status, raw);
      let reason = raw;
      try { reason = JSON.parse(raw)?.error?.message ?? raw; } catch (_) { /* keep raw */ }
      return json({ error: "Label reading failed upstream.", upstreamStatus: res.status, detail: reason }, 502);
    }

    const data = await res.json();
    const text = (data.content ?? []).find((b: { type: string }) => b.type === "text")?.text ?? "{}";
    const parsed = JSON.parse(text);
    return json(parsed);
  } catch (e) {
    console.error("label-identify error", e);
    return json({ error: "Label reading error." }, 500);
  }
});
