// must-try — Supabase Edge Function (Deno). NOT DEPLOYED by this bundle;
// deploying it (test project first) requires explicit approval.
//
// Researches exact-bottle candidates for the Must Try screen. The screen's
// personalized guidance is built CLIENT-SIDE from the user's real palate data
// and never waits on this function; this function only supplies the optional
// "verified bottles" layer, so it may fail, time out, or return nothing and
// the screen stays useful.
//
// Evidence rules (same registry discipline as the sommelier function):
//   * candidates come from the model, but only survive when producer, cuvée
//     and vintage are present AND at least one sourceId maps to a real cited
//     evidence entry (_shared/musttry-verify.js is the boundary);
//   * a price survives only with its own price source and a named merchant —
//     time-sensitive "listed at" data, never a market price;
//   * the model can never mint a URL: citations come from the research pass.
//
// Privacy: search queries are built from grape/region/style concepts only.
// The user's name, notes, and cellar contents never enter a search query.

import { gate } from "../_shared/auth.ts";
import { citedEvidence } from "../_shared/research-evidence.js";
import { verifiedCandidates } from "../_shared/musttry-verify.js";

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
    candidates: {
      type: "array",
      description: "Up to 3 exact bottles the evidence registry verifies. Empty when nothing verifies — an empty list is a correct answer, never a failure.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          producer: { type: "string" },
          cuvee: { type: "string", description: "The wine/cuvée name as the producer states it" },
          vintage: { type: "string", description: "The exact vintage the evidence supports, or 'NV' for a non-vintage bottling. Never a guessed or transferred vintage." },
          grape: { type: "string" },
          region: { type: "string" },
          why: { type: "string", description: "One or two sentences: why this bottle fits the stated taste, grounded in the evidence." },
          sourceIds: { type: "array", items: { type: "integer" }, description: "Registry IDs that verify THIS bottle's identity. Empty disqualifies the candidate." },
          price: { type: "number", description: "A listed price ONLY when a registry entry from a merchant currently lists this exact bottle at this price. Omit otherwise." },
          merchant: { type: "string", description: "The merchant listing that price. Empty when price is absent." },
          priceSourceId: { type: "integer", description: "The registry ID of the merchant listing supporting the price. Absent when price is absent." },
        },
        required: ["producer", "cuvee", "vintage", "grape", "region", "why", "sourceIds"],
      },
    },
  },
  required: ["candidates"],
};

type Evidence = { id: number; title: string; url: string; citedText: string };

function anthropicHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-api-key": ANTHROPIC_API_KEY ?? "",
    "anthropic-version": "2023-06-01",
  };
}

async function researchCandidates(taste: string): Promise<{ evidence: Evidence[]; status: "researched" | "no_evidence" | "unavailable" }> {
  const prompt =
    `Research SPECIFIC, currently purchasable bottles matching this taste profile: ${taste}\n\n` +
    `You MUST perform web search. Search narrowly and cite every factual research note. ` +
    `Formulate search terms only from grape, region, style, vintage, critic, and budget concepts. Never put a person's name, address, email, account detail, private note, or cellar contents into a search query. ` +
    `Favour producer pages, appellation bodies, reputable merchants, and respected wine publications. ` +
    `For each promising bottle, verify producer, cuvée and vintage together on the same source. Keep vintage-specific facts attached to that vintage. ` +
    `Note a price only when a merchant page currently lists that exact bottle and vintage at that price, and name the merchant. ` +
    `Return concise research notes, not a consumer answer. If nothing verifies, say so plainly.`;

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
        console.error("Must Try research failed", res.status, await res.text());
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
    console.error("Must Try research error", e);
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
  if (!ANTHROPIC_API_KEY) return json({ error: "Must Try is not configured." }, 503);

  const g = await gate(req, "must-try");
  if (!g.ok) return json({ error: g.error, blocked: true }, g.status);

  try {
    const body = await req.json().catch(() => ({}));
    // A compact, anonymous taste description built by the client from the
    // user's REAL palate data (samples already excluded there): grapes,
    // regions, traits, budget. Plain text, length-capped, no identity.
    const taste = typeof body.taste === "string" ? body.taste.trim().slice(0, 400) : "";
    if (taste.length < 3) return json({ candidates: [], researchStatus: "no_evidence" });

    const research = await researchCandidates(taste);
    if (!research.evidence.length) {
      // Nothing cited — nothing can verify, so don't ask the model to try.
      return json({ candidates: [], researchStatus: research.status });
    }

    const evidenceText = research.evidence
      .map((e) => `[S${e.id}] ${e.title}\nURL: ${e.url}\nEvidence: ${e.citedText || "The cited page supported the research note."}`)
      .join("\n\n");

    const prompt =
      `You select "Must Try" bottle candidates for a personal wine app.\n\n` +
      `The evidence registry below is the ONLY authority for bottle identity, vintages, prices, and availability. ` +
      `Propose at most 3 bottles, and ONLY bottles whose producer, cuvée and vintage the registry verifies together. ` +
      `Never transfer a fact, score, or price between vintages. Never invent an ID, title, URL, or source. ` +
      `Include price, merchant and priceSourceId ONLY when a registry entry from a merchant currently lists that exact bottle and vintage at that price. ` +
      `An empty candidates list is a correct answer when nothing verifies.\n\n` +
      `EVIDENCE REGISTRY:\n${evidenceText}\n\n` +
      `TASTE PROFILE: ${taste}`;

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
      console.error("Anthropic error", res.status, await res.text());
      return json({ candidates: [], researchStatus: "unavailable" });
    }

    const data = await res.json();
    const text = [...(data.content ?? [])].reverse().find((b: { type: string }) => b.type === "text")?.text ?? "{}";
    const parsed = JSON.parse(text);
    const candidates = verifiedCandidates(parsed.candidates, research.evidence);
    return json({ candidates, researchStatus: candidates.length ? "researched" : "no_evidence" });
  } catch (e) {
    console.error("must-try error", e);
    return json({ candidates: [], researchStatus: "unavailable" });
  }
});
