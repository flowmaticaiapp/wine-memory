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
        deeperTitle: { type: "string", description: "The most specific level you can support: region or appellation plus grape, e.g. 'Northern Rhône Syrah — Crozes-Hermitage or Saint-Joseph'" },
        deeper: { type: "string", description: "2 sentences on that region and what to expect from it" },
        lookFor: { type: "array", items: { type: "string" }, description: "2-3 PRACTICAL clues for finding this in a shop or on a list: label terms, appellation names, body, sweetness, tannin, oak or alcohol level. Concrete and findable, e.g. 'German Riesling marked Kabinett — gently off-dry' or 'Alcohol at or below 11%'. Never a producer or a specific bottle." },
        matchGrapes: { type: "array", items: { type: "string" }, description: "Primary grape plus closely related grapes" },
      },
      required: ["grape", "why", "deeperTitle", "deeper", "lookFor", "matchGrapes"],
    },
    avoidNote: {
      type: "string",
      description: "For kind=pairing ONLY, and ONLY when a MEANINGFUL conflict exists: one sentence on what to avoid and why. Empty string when there is no real conflict — do not manufacture one.",
    },
    others: {
      type: "array",
      description: "For kind=pairing ONLY: one or two alternatives, each offering a genuinely DIFFERENT direction. Two only when the second adds something the first does not.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          direction: { type: "string", description: "2-3 words for how this CHANGES the experience, e.g. 'Bolder and firmer', 'Softer and rounder', 'Fresher, whiter'" },
          grape: { type: "string" },
          why: { type: "string", description: "One sentence: what this swaps in and what it gives up" },
        },
        required: ["direction", "grape", "why"],
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
      `You are the sommelier inside someone's personal wine app — warm, expert, and a good teacher. Classify their question and respond.\n\n` +
      // Phase 1 of the trust standard: uncertainty changes the ANSWER, not just a
      // label under it. This app has no catalogue, price, availability or critic
      // retrieval, so anything bottle-specific could only come from model memory.
      `WHAT YOU MUST NOT DO. This app has no wine catalogue, no price data, no availability data and no critic reviews, so you cannot verify anything about a specific bottle:\n` +
      `- Never recommend a specific purchasable bottle by producer and cuvee (e.g. "Ridge Lytton Springs 2020"). Recommend a GRAPE, REGION or STYLE instead, and say what to look for on a shelf or a wine list.\n` +
      `- Never state or estimate a score, rating, price, availability, award, drinking window or specific vintage as though it were fact.\n` +
      `- Never say that a critic, publication or merchant recommends something.\n` +
      `- Asked something like "best Pinot Noir under $25", answer with the styles and regions that deliver value at that level and how to recognise them, never with invented bottles or prices.\n` +
      `- Naming a producer is fine when the user asked you to EXPLAIN one, or as an illustration of a region's style. The rule is about telling someone to buy a particular bottle.\n` +
      `Stay warm and concise while doing this. A style-level answer should feel like useful advice, not like a refusal. Trust comes from being accurate and explaining your reasoning, not from hedging.\n\n` +
      `If it is a FOOD PAIRING question (what wine to drink with a specific dish, food, meal, or occasion), set kind="pairing".\n` +
      // A pairing answer is incomplete if it stops at abstract characteristics.
      // "Structured, savoury, high-acid" is not something anyone can buy.
      `A PAIRING ANSWER IS INCOMPLETE IF IT ONLY DESCRIBES ABSTRACT CHARACTERISTICS. Words like "structured", "savoury" or "high-acid" describe a wine; they do not help someone standing in a shop. Every answer must translate them into a recognisable choice.\n` +
      `Go to the MOST SPECIFIC level the evidence supports, and no further:\n` +
      `  pairing principle -> needed characteristics -> grape or blend -> region or appellation -> a verified bottle.\n` +
      `You have no research layer, so you stop at region or appellation. Never the last step.\n\n` +
      `Fill: dish (short name); primary{ grape (the best choice: a grape, blend or established style, never a producer), ` +
      `why (2 plain-language sentences connecting the wine's characteristics to the DISH — its weight, sauce, acidity, sweetness, salt, fat, spice and umami, whichever actually apply), ` +
      `deeperTitle (the region or appellation level, e.g. "Northern Rhône Syrah — Crozes-Hermitage or Saint-Joseph"), deeper (2 sentences on that region), ` +
      `lookFor (2-3 practical shop clues: label terms, appellation names, body, sweetness, tannin, oak, alcohol level), ` +
      `matchGrapes (the primary grape plus closely related grapes) }; ` +
      `others (ONE or TWO alternatives, each with a direction saying how it CHANGES the experience, and a one-sentence why — two only when the second is genuinely a different direction); ` +
      `and avoidNote (one sentence, ONLY when a meaningful conflict exists — empty string otherwise, never manufactured).\n` +
      `Rank the strongest option first. Do not list every possible grape or region. Keep it concise.\n` +
      `STRONGLY PREFER a style the user already owns if it genuinely fits the dish — "genuinely" is the operative word. Leave text empty.\n\n` +
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
