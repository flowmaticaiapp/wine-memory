// Pure verification boundary for Must Try bottle candidates, shared by the
// Edge Function and node tests.
//
// The model proposes candidates; THIS module decides what may reach the user:
//   * a candidate renders only with producer, cuvée and vintage present AND at
//     least one sourceId that maps to a real entry in the evidence registry —
//     the registry the research pass built from actual citations, so the model
//     can never mint a supporting source;
//   * a price survives only when it carries its own price source (a real
//     registry entry) and a named merchant, and it is passed through as
//     "listed at" data (amount + merchant + source), never as "the price";
//   * everything that fails verification is dropped silently — Must Try's
//     guidance layer stands on its own, so a dropped candidate costs nothing.

export function verifiedCandidates(rawCandidates, evidence){
  const registry = new Map((evidence || []).map((e) => [e.id, { title: e.title, url: e.url }]));
  const out = [];
  for (const c of (Array.isArray(rawCandidates) ? rawCandidates : [])){
    if (!c || typeof c !== 'object') continue;
    const producer = typeof c.producer === 'string' ? c.producer.trim() : '';
    const cuvee = typeof c.cuvee === 'string' ? c.cuvee.trim() : '';
    const vintage = typeof c.vintage === 'string' ? c.vintage.trim() : '';
    if (!producer || !cuvee || !vintage) continue;   // exact identity or nothing

    const ids = Array.isArray(c.sourceIds) ? c.sourceIds.filter((n) => Number.isInteger(n) && registry.has(n)) : [];
    if (!ids.length) continue;                       // no real evidence, no candidate
    const sources = [...new Set(ids)].map((id) => registry.get(id));

    let price = null;
    const amount = typeof c.price === 'number' && isFinite(c.price) && c.price > 0 ? c.price : null;
    const merchant = typeof c.merchant === 'string' ? c.merchant.trim() : '';
    const priceSource = Number.isInteger(c.priceSourceId) ? registry.get(c.priceSourceId) : null;
    if (amount != null && merchant && priceSource){
      price = { amount, merchant, source: priceSource };
    }

    out.push({
      producer, name: cuvee, vintage,
      grape: typeof c.grape === 'string' ? c.grape.trim() : '',
      region: typeof c.region === 'string' ? c.region.trim() : '',
      why: typeof c.why === 'string' ? c.why.trim() : '',
      sources, price,
    });
    if (out.length >= 3) break;                      // a shortlist, not a catalogue
  }
  return out;
}
