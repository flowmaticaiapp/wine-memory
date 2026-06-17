// sommelier — Supabase Edge Function (Deno).
// The real "Ask your sommelier" backend. Replaces the prototype's window.claude
// path (which doesn't exist in the deployed app). The model CLASSIFIES the
// question and returns a discriminated result:
//   { kind:"pairing", dish, primary{...}, others[] }  -> rich pairing UI
//   { kind:"answer", text }                            -> written answer
// Personalized with the user's owned grapes/verdicts. Key stays server-side.

import { gate } from "../_shared/auth.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = Deno.env.get("SOMMELIER_MODEL") ?? "claude-sonnet-4-6";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["pairing", "answer"], description: "pairing = a food/wine pairing question; answer = anything else" },
    text: { type: "string", description: "For kind=answer ONLY: 2-4 short sentences, or up to 4 lines each starting with '- '. Empty for pairing." },
    dish: { type: "string", description: "For kind=pairing ONLY: short dish name. Empty for answer." },
    primary: {
      type: "object",
      additionalProperties: false,
      description: "For kind=pairing ONLY.",
      properties: {
        grape: { type: "string", description: "Human-friendly grape/style, never a producer" },
        why: { type: "string", description: "2 sentences, plain language" },
        deeperTitle: { type: "string", description: "Region + grape, e.g. 'Oregon Pinot Noir'" },
        deeper: { type: "string", description: "2 sentences on the region and what to expect" },
        matchGrapes: { type: "array", items: { type: "string" }, description: "Primary grape plus closely related grapes" },
      },
      required: ["grape", "why", "deeperTitle", "deeper", "matchGrapes"],
    },
    others: {
      type: "array",
      description: "For kind=pairing ONLY: exactly two alternative styles.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { grape: { type: "string" }, why: { type: "string" } },
        required: ["grape", "why"],
      },
    },
  },
  required: ["kind"],
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
  if (!ANTHROPIC_API_KEY) return json({ error: "Sommelier is not configured." }, 503);

  const g = await gate(req, "sommelier");
  if (!g.ok) return json({ error: g.error, blocked: true }, g.status);

  try {
    const body = await req.json().catch(() => ({}));
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (query.length < 2) return json({ kind: "answer", text: "" });
    const ownedGrapes = typeof body.ownedGrapes === "string" && body.ownedGrapes ? body.ownedGrapes : "none yet";
    const owned = Array.isArray(body.owned) ? body.owned.slice(0, 80) : [];

    const prompt =
      `You are a warm, expert sommelier and wine teacher inside someone's personal wine app. Classify their question and respond.\n\n` +
      `If it is a FOOD PAIRING question (what wine to drink with a specific dish, food, meal, or occasion), set kind="pairing" and fill: ` +
      `dish (short name); primary{ grape (a human-friendly grape/STYLE, never a producer name), why (2 plain-language sentences), ` +
      `deeperTitle (Region + grape, e.g. "Oregon Pinot Noir"), deeper (2 sentences on the region and what to expect), ` +
      `matchGrapes (the primary grape plus closely related grapes) }; and others (EXACTLY two alternative styles, each with a one-sentence why). ` +
      `STRONGLY PREFER a style the user already owns if it genuinely fits the dish. Leave text empty.\n\n` +
      `For ANY OTHER question — explainers ("Explain Beaujolais"), comparisons ("Barolo vs Barbaresco"), self-reflection ("Why do I like Nebbiolo?"), ` +
      `shopping/what-to-buy, or general wine knowledge — set kind="answer" and write a friendly, concise reply in text: 2-4 short sentences, ` +
      `OR up to 4 short lines each starting with "- " for lists/comparisons. No preamble, no markdown headers. Leave dish/primary/others empty.\n\n` +
      `The user owns these grapes/styles: ${ownedGrapes}. Full collection: ${JSON.stringify(owned)}. ` +
      `Reference their collection when it's genuinely relevant (e.g. why they like a grape, or what to buy that fits their taste).\n` +
      `GROUNDING: for a pairing "why"/"deeper", reference only ingredients, sauces, or flavours present in or reasonably inferred from the question — never introduce a protein or dish the user did not mention.\n\n` +
      `QUESTION: "${query}"`;

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
      return json({ error: "Sommelier failed upstream.", upstreamStatus: res.status, detail: reason }, 502);
    }

    const data = await res.json();
    const text = (data.content ?? []).find((b: { type: string }) => b.type === "text")?.text ?? "{}";
    const parsed = JSON.parse(text);
    return json(parsed);
  } catch (e) {
    console.error("sommelier error", e);
    return json({ error: "Sommelier error." }, 500);
  }
});
