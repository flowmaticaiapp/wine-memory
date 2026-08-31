// sommelier — Supabase Edge Function (Deno).
// The real "Ask your sommelier" backend. Replaces the prototype's window.claude
// path (which doesn't exist in the deployed app). The model CLASSIFIES the
// question and returns a discriminated result:
//   { kind:"pairing", dish, primary{...}, others[] }  -> rich pairing UI
//   { kind:"answer", text }                            -> written answer
// Personalized with the user's owned grapes/verdicts. Key stays server-side.

import { gate } from "../_shared/auth.ts";
import { citedEvidence, selectEvidenceSources } from "../_shared/research-evidence.js";
import { verifiedSommelierBottle } from "../_shared/musttry-verify.js";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = Deno.env.get("SOMMELIER_MODEL") ?? "claude-sonnet-4-6";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_WEB_SEARCHES = 3;

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
        bottleProducer: { type: "string", description: "Optional exact bottle, STRUCTURED: the producer exactly as the evidence states it. Empty when no exact bottle is supported." },
        bottleCuvee: { type: "string", description: "The wine/cuvée name exactly as the evidence states it. Empty when bottleProducer is empty." },
        bottleVintage: { type: "string", description: "The exact vintage the evidence supports for this bottle, or 'NV'. Never guessed or transferred from another vintage. Empty when bottleProducer is empty." },
        bottleWhy: { type: "string", description: "One short evidence-grounded reason for the exact bottle. Empty when bottleProducer is empty. NOTE: the server verifies bottle identity only, so this field is currently DISCARDED and never displayed — no bottle-specific score, critic claim, award, tasting note, or drinking window reaches the user until each such claim has its own deterministic verification." },
      },
      required: ["grape", "why", "deeperTitle", "deeper", "lookFor", "matchGrapes", "bottleProducer", "bottleCuvee", "bottleVintage", "bottleWhy"],
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
    sourceIds: {
      type: "array",
      items: { type: "integer" },
      description: "Only IDs from the supplied evidence registry that directly support claims used in the answer. Empty when no evidence was usable.",
    },
  },
  required: ["kind", "sourceIds"],
};

type Evidence = { id: number; title: string; url: string; citedText: string };

function anthropicHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-api-key": ANTHROPIC_API_KEY ?? "",
    "anthropic-version": "2023-06-01",
  };
}

async function researchQuestion(query: string): Promise<{ evidence: Evidence[]; status: "researched" | "no_evidence" | "unavailable" }> {
  const prompt =
    `Research this wine question before it is answered: "${query}"\n\n` +
    `You MUST perform web search. Search narrowly and cite every factual research note. ` +
    `Formulate search terms only from the wine, food, region, vintage, critic, budget, or style concepts needed to answer. Never put a person's name, street address, email, account detail, private note, or cellar contents into a search query. ` +
    `When relevant, your FIRST search must look for the question on JamesSuckling.com, WineAccess.com, and WineForNormalPeople.com because the user values those voices. If that search is not useful, broaden. ` +
    `Then broaden to primary producer pages, appellation or regional bodies, and reputable wine education or merchant pages. ` +
    `Preferred sources are preferences, not proof: use them only when they actually address the question. ` +
    `Never infer an exact critic score from a search snippet or a different vintage. Never treat a retailer's tasting note as independent critical consensus. ` +
    `For bottle claims, verify producer, cuvee, and vintage independently and keep vintage-specific facts attached to that vintage. ` +
    `Return concise research notes, not the final consumer answer. If evidence is thin, say so.`;

  try {
    let messages: unknown[] = [{ role: "user", content: prompt }];
    for (let turn = 0; turn < 3; turn++) {
      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: anthropicHeaders(),
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1400,
          messages,
          tools: [{
            type: "web_search_20250305",
            name: "web_search",
            max_uses: MAX_WEB_SEARCHES,
            blocked_domains: ["vivino.com"],
          }],
          tool_choice: { type: "any" },
        }),
      });
      if (!res.ok) {
        console.error("Research search failed", res.status, await res.text());
        return { evidence: [], status: "unavailable" };
      }
      const data = await res.json();
      if (data.stop_reason === "pause_turn") {
        messages = [...messages, { role: "assistant", content: data.content }];
        continue;
      }
      const evidence = citedEvidence(data.content) as Evidence[];
      return { evidence, status: evidence.length ? "researched" : "no_evidence" };
    }
    return { evidence: [], status: "unavailable" };
  } catch (e) {
    console.error("Research search error", e);
    return { evidence: [], status: "unavailable" };
  }
}

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
    const research = await researchQuestion(query);
    const evidenceText = research.evidence.length
      ? research.evidence.map(e => `[S${e.id}] ${e.title}\nURL: ${e.url}\nEvidence: ${e.citedText || "The cited page supported the research note."}`).join("\n\n")
      : "No usable cited public-web evidence was retrieved.";

    const prompt =
      `You are the sommelier inside someone's personal wine app — warm, expert, and a good teacher. Classify their question and respond.\n\n` +
      `You have a registry of public-web evidence below. Treat it as the ONLY authority for bottle-specific, vintage-specific, critic, score, price, award, availability, and current claims. General pairing principles may use established wine knowledge.\n` +
      `- A source preference is not evidence. Mention James Suckling, Wine Access, Wine for Normal People, or any other source only when its registry entry directly supports the statement.\n` +
      `- Never transfer a score, review, drinking window, or award between vintages. Never fill a missing vintage by guessing.\n` +
      `- A price or availability claim requires a current merchant source and must be phrased as observed, not guaranteed.\n` +
      `- Recommend an exact bottle only when the registry verifies producer, cuvee and the relevant vintage (when a vintage is named). Otherwise stop at grape, style, region or appellation.\n` +
      `- Put only the integer IDs of sources actually used into sourceIds. Never invent an ID, title, URL, quote or source.\n` +
      `- Naming a producer is fine when the user asked you to EXPLAIN one, or as an illustration of a region's style. The rule is about telling someone to buy a particular bottle.\n` +
      `Stay warm and concise while doing this. A style-level answer should feel like useful advice, not like a refusal. Trust comes from being accurate and explaining your reasoning, not from hedging.\n\n` +
      `EVIDENCE REGISTRY (${research.status}):\n${evidenceText}\n\n` +
      `If it is a FOOD PAIRING question (what wine to drink with a specific dish, food, meal, or occasion), set kind="pairing".\n` +
      // A pairing answer is incomplete if it stops at abstract characteristics.
      // "Structured, savoury, high-acid" is not something anyone can buy.
      `A PAIRING ANSWER IS INCOMPLETE IF IT ONLY DESCRIBES ABSTRACT CHARACTERISTICS. Words like "structured", "savoury" or "high-acid" describe a wine; they do not help someone standing in a shop. Every answer must translate them into a recognisable choice.\n` +
      `Go to the MOST SPECIFIC level the evidence supports, and no further:\n` +
      `  pairing principle -> needed characteristics -> grape or blend -> region or appellation -> a verified bottle.\n` +
      `Use an exact bottle only when the evidence registry supports the last step.\n\n` +
      `Fill: dish (short name); primary{ grape (the best choice: a grape, blend or established style, never a producer), ` +
      `why (2 plain-language sentences connecting the wine's characteristics to the DISH — its weight, sauce, acidity, sweetness, salt, fat, spice and umami, whichever actually apply), ` +
      `deeperTitle (the region or appellation level, e.g. "Northern Rhône Syrah — Crozes-Hermitage or Saint-Joseph"), deeper (2 sentences on that region), ` +
      `lookFor (2-3 practical shop clues: label terms, appellation names, body, sweetness, tannin, oak, alcohol level), ` +
      `matchGrapes (the primary grape plus closely related grapes) }; ` +
      `bottleProducer, bottleCuvee and bottleVintage name one exact bottle in STRUCTURED fields only when the evidence threshold above is met, copied exactly as a cited source states them; otherwise all four bottle fields are empty strings. The server independently verifies these fields against the cited evidence, discards any bottle the citations do not support, and never displays bottleWhy — only the verified identity is shown. ` +
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
      return fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: anthropicHeaders(),
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
    const text = [...(data.content ?? [])].reverse().find((b: { type: string }) => b.type === "text")?.text ?? "{}";
    const parsed = JSON.parse(text);
    // Deterministic bottle verification: the structured identity the model
    // proposed must be supported — producer, cuvée AND vintage together — by
    // a cited registry entry among its selected sources. A valid but
    // unrelated source, another wine from the producer, or another vintage
    // strips the bottle; the pairing guidance stands either way.
    if (parsed?.primary && typeof parsed.primary === "object") {
      const { bottle, bottleWhy } = verifiedSommelierBottle(
        { producer: parsed.primary.bottleProducer, cuvee: parsed.primary.bottleCuvee, vintage: parsed.primary.bottleVintage, why: parsed.primary.bottleWhy },
        parsed.sourceIds, research.evidence,
      );
      delete parsed.primary.bottleProducer;
      delete parsed.primary.bottleCuvee;
      delete parsed.primary.bottleVintage;
      parsed.primary.bottle = bottle;
      parsed.primary.bottleWhy = bottleWhy;
    }
    const sources = selectEvidenceSources(research.evidence, parsed.sourceIds);
    delete parsed.sourceIds;
    return json({ ...parsed, sources, researchStatus: sources.length ? "researched" : research.status });
  } catch (e) {
    console.error("sommelier error", e);
    return json({ error: "Sommelier error." }, 500);
  }
});
