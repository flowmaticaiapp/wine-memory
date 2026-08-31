// must-try — Supabase Edge Function (Deno).
//
// Researches exact-bottle candidates for the Must Try screen. Bottles lead the
// page; client-side grape and region guidance remains as an honest fallback.
//
// Evidence rules (same registry discipline as the sommelier function):
//   * candidates survive only when one source verifies exact identity AND a
//     second, independently checked source actually recommends the bottling;
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
const MAX_WEB_SEARCHES = 5;

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
      description: "Up to 6 exact, list-recommended bottles the evidence registry verifies. Empty when nothing verifies — an empty list is a correct answer, never a failure.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          producer: { type: "string" },
          cuvee: { type: "string", description: "The wine/cuvée name as the producer states it" },
          vintage: { type: "string", description: "The exact vintage the evidence supports, or 'NV' for a non-vintage bottling. Use an empty string when the source recommends the bottling across releases; never guess a vintage." },
          grape: { type: "string" },
          region: { type: "string" },
          category: { type: "string", enum: ["palate", "essential", "branch"], description: "palate only with a real taste profile; essential for benchmark bottles; branch for a purposeful departure." },
          sourceIds: { type: "array", items: { type: "integer" }, description: "Registry IDs that verify THIS bottle's identity. Empty disqualifies the candidate." },
          recommendationSourceIds: { type: "array", items: { type: "integer" }, description: "Registry IDs whose cited text names this bottling and explicitly recommends it as a must-try, essential, benchmark, top pick, or bottle worth seeking. Empty disqualifies the candidate." },
          price: { type: "number", description: "A listed price ONLY when a registry entry from a merchant currently lists this exact bottle at this price. Omit otherwise." },
          merchant: { type: "string", description: "The merchant listing that price. Empty when price is absent." },
          priceSourceId: { type: "integer", description: "The registry ID of the merchant listing supporting the price. Absent when price is absent." },
        },
        required: ["producer", "cuvee", "vintage", "grape", "region", "category", "sourceIds", "recommendationSourceIds"],
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
    `Research SPECIFIC bottles that credible sommeliers, wine educators, respected wine publications, or credible wine-lover editorial lists call must-try, essential, benchmark, iconic, a top pick, or worth seeking.\n\n` +
    `Taste profile: ${taste}\n\n` +
    `You MUST perform web search. Search narrowly and cite every factual research note. ` +
    `Formulate search terms only from grape, region, style, vintage, critic, and budget concepts. Never put a person's name, address, email, account detail, private note, or cellar contents into a search query. ` +
    `Prioritize genuine editorial recommendations from sommeliers, educators and respected publications. Publicly accessible recommendations from James Suckling, Wine Access, and Wine for Normal People are useful when directly relevant, but never force or imply their support. ` +
    `For every promising bottle capture (1) a recommendation or list citation naming producer and cuvée, and (2) an identity citation verifying producer and cuvée. Capture an exact vintage only when the citation states it; a release-independent bottling recommendation is valid but must carry no vintage. One source may do both when its cited text truly supports both. ` +
    `Use producer pages and appellation bodies for identity, and reputable merchants only for an optional current price. ` +
    `Note a price only when a merchant page currently lists that exact bottle and vintage at that price, and name the merchant. ` +
    `Return concise research notes, not a consumer answer. If nothing verifies, say so plainly.`;

  try {
    let messages: unknown[] = [{ role: "user", content: prompt }];
    for (let turn = 0; turn < 3; turn++) {
      const request = () => fetch(ANTHROPIC_URL, {
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
      let res = await request();
      if (res.status === 429 || res.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        res = await request();
      }
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
    const profile = taste.length >= 3 ? taste : "No personal taste profile yet; build a balanced introductory list.";

    const research = await researchCandidates(profile);
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
      `Propose at most 6 bottles. Every bottle needs BOTH: sourceIds verifying producer and cuvée, and recommendationSourceIds whose cited text names producer and cuvée and explicitly recommends the bottling. ` +
      `Use an exact vintage only when a sourceId verifies that vintage together with producer and cuvée. Otherwise set vintage to an empty string: the app will honestly label it a bottling recommendation rather than inventing a release. ` +
      `Classify each as palate, essential, or branch. Use palate only when a real taste profile is present and the bottle genuinely aligns with it; essential means a benchmark or widely recommended wine-lover bottle; branch means a purposeful expansion from the profile rather than a random pick. ` +
      `Aim for one or two strong bottles per applicable category; quality of evidence matters more than filling sections. ` +
      `Never transfer a fact, score, or price between vintages. Never invent an ID, title, URL, or source. ` +
      `Include price, merchant and priceSourceId ONLY when a registry entry from a merchant currently lists that exact bottle and vintage at that price. ` +
      `An empty candidates list is a correct answer when nothing verifies.\n\n` +
      `EVIDENCE REGISTRY:\n${evidenceText}\n\n` +
      `TASTE PROFILE: ${profile}`;

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

    let withEffort = true;
    let res = await callClaude(withEffort);
    if (res.status === 400 && /effort parameter/i.test(await res.clone().text())) {
      withEffort = false;
      res = await callClaude(withEffort);
    }
    if (res.status === 429 || res.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      res = await callClaude(withEffort);
    }
    if (!res.ok) {
      console.error("Anthropic error", res.status, await res.text());
      return json({ candidates: [], researchStatus: "unavailable" });
    }

    const data = await res.json();
    const text = [...(data.content ?? [])].reverse().find((b: { type: string }) => b.type === "text")?.text ?? "{}";
    const parsed = JSON.parse(text);
    // With no real palate profile, the model has no authority to call any
    // bottle personalized. Preserve the bottle, but place it with essentials.
    const proposed = Array.isArray(parsed.candidates)
      ? parsed.candidates.map((c: Record<string, unknown>) => (!taste && c?.category === "palate" ? { ...c, category:"essential" } : c))
      : [];
    const candidates = verifiedCandidates(proposed, research.evidence, { requireRecommendation:true, allowBottlingOnly:true, max:6 });
    return json({ candidates, researchStatus: candidates.length ? "researched" : "no_evidence" });
  } catch (e) {
    console.error("must-try error", e);
    return json({ candidates: [], researchStatus: "unavailable" });
  }
});
