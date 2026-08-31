// Pure verification boundary for Must Try bottle candidates, shared by the
// Edge Function and node tests.
//
// The model proposes candidates; THIS module decides what may reach the user.
// A sourceId being valid is NOT evidence: the cited entry must itself support
// the claim, deterministically:
//
//   * BOTTLE IDENTITY — at least one cited registry entry must mention the
//     candidate's producer, cuvée AND vintage together (title + cited text +
//     URL, diacritic-folded token matching). A valid but unrelated source
//     disqualifies nothing by itself — it simply is not support, and a
//     candidate with no supporting source is dropped. Only supporting sources
//     are attached to the candidate.
//   * PRICE — the price source must support the same bottle identity AND
//     contain the price amount AND the merchant context (merchant name in the
//     entry's text or hostname). A model-provided merchant name plus any
//     valid source ID is insufficient. Anything less: the price is omitted,
//     never estimated.
//   * Everything that fails verification is dropped silently — Must Try's
//     guidance layer stands on its own, so a dropped claim costs nothing.

const fold = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase();

const STOPWORDS = new Set(['the','and','les','los','las','der','die','das','del','della','delle','dei','wine','wines','winery','weingut','domaine','chateau','bodega','bodegas','cantina','tenuta','estate','vineyard','vineyards','cellars','maison','vina','vinos']);

// Distinctive tokens of a name: folded, alphanumeric, length ≥ 3, minus
// generic wine words. "Jean Foillard" → [jean, foillard];
// "Morgon Côte du Py" → [morgon, cote] (du/py too short).
export function nameTokens(s){
  return (fold(s).match(/[a-z0-9]+/g) || [])
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}

function haystackOf(entry){
  return fold([entry?.title, entry?.citedText, entry?.url].filter(Boolean).join(' '));
}

function vintageSupported(hay, vintage){
  const v = fold(vintage);
  if (!v) return false;
  if (v === 'nv') return /\bnv\b|non[- ]vintage/.test(hay);
  return hay.includes(v);
}

// Does ONE registry entry support this bottle's identity — producer, cuvée
// and vintage together? Fails closed: a producer or cuvée with no
// distinctive tokens cannot be verified by text and is not supported.
export function sourceSupportsBottle(entry, { producer, cuvee, vintage }){
  const hay = haystackOf(entry);
  if (!hay) return false;
  const p = nameTokens(producer);
  const c = nameTokens(cuvee);
  if (!p.length || !c.length) return false;
  return p.every(t => hay.includes(t))
    && c.every(t => hay.includes(t))
    && vintageSupported(hay, vintage);
}

// Does this entry state the price amount? Accepts 34, 34.00, $34, 34,99 —
// with digit boundaries so "34" never matches inside "2034", and a decimal
// boundary so "$34.99" never supports a claim of exactly 34.
export function sourceStatesPrice(entry, amount){
  if (!(typeof amount === 'number' && isFinite(amount) && amount > 0)) return false;
  const hay = haystackOf(entry);
  const esc = String(amount).replace('.', '[.,]');
  const alt = Number.isInteger(amount) ? `${amount}[.,]00` : null;
  const re = new RegExp(`(?<![\\d.])(?:${esc}${alt ? '|' + alt : ''})(?!\\.?\\d)`);
  return re.test(hay);
}

// Does this entry carry the merchant's context? The merchant's distinctive
// tokens must appear in the entry's text, or squeezed into its hostname
// ("Good Wine Shop" → goodwineshop.com).
export function sourceCarriesMerchant(entry, merchant){
  const tokens = nameTokens(merchant);
  if (!tokens.length) return false;
  const hay = haystackOf(entry);
  if (tokens.every(t => hay.includes(t))) return true;
  try {
    const host = fold(new URL(entry.url).hostname);
    return tokens.every(t => host.includes(t));
  } catch { return false; }
}

// The SAME deterministic boundary, applied to the sommelier's optional exact
// bottle. The model proposes producer, cuvée and vintage as STRUCTURED fields
// plus its answer-level sourceIds; the bottle renders only when a cited
// registry entry supports that exact identity. A valid but unrelated source,
// another wine from the producer, or another vintage yields empty strings —
// and the general pairing guidance stands on its own either way. The
// sommelier never displays a price, so no price may pass through here.
//
// bottleWhy is ALWAYS empty: verifying an identity does not verify the
// model's reason for it, and a supported bottle must never smuggle out an
// unsupported score, critic claim, award, tasting note, or drinking window.
// The ordinary pairing explanation already says why the style fits.
export function verifiedSommelierBottle(fields, sourceIds, evidence){
  const none = { bottle: '', bottleWhy: '' };
  if (!fields || typeof fields !== 'object') return none;
  const ok = verifiedCandidates([{
    producer: fields.producer, cuvee: fields.cuvee, vintage: fields.vintage,
    grape: '', region: '', why: '',
    sourceIds,
  }], evidence);
  if (!ok.length) return none;
  const b = ok[0];
  return { bottle: `${b.producer} ${b.name} ${b.vintage}`.replace(/\s+/g, ' ').trim(), bottleWhy: '' };
}

export function verifiedCandidates(rawCandidates, evidence){
  const registry = new Map((evidence || []).map((e) => [e.id, e]));
  const out = [];
  for (const c of (Array.isArray(rawCandidates) ? rawCandidates : [])){
    if (!c || typeof c !== 'object') continue;
    const producer = typeof c.producer === 'string' ? c.producer.trim() : '';
    const cuvee = typeof c.cuvee === 'string' ? c.cuvee.trim() : '';
    const vintage = typeof c.vintage === 'string' ? c.vintage.trim() : '';
    if (!producer || !cuvee || !vintage) continue;   // exact identity or nothing

    // Cited IDs must exist in the registry AND the cited entries must
    // actually support this bottle. Only supporting sources are attached.
    const cited = Array.isArray(c.sourceIds)
      ? [...new Set(c.sourceIds.filter((n) => Number.isInteger(n) && registry.has(n)))]
      : [];
    const supporting = cited
      .map((id) => registry.get(id))
      .filter((e) => sourceSupportsBottle(e, { producer, cuvee, vintage }));
    if (!supporting.length) continue;                // no real support, no candidate
    const sources = supporting.map(({ title, url }) => ({ title, url }));

    // A price needs its own source that supports the same bottle, states the
    // amount, and carries the merchant context. Otherwise: omitted.
    let price = null;
    const amount = typeof c.price === 'number' && isFinite(c.price) && c.price > 0 ? c.price : null;
    const merchant = typeof c.merchant === 'string' ? c.merchant.trim() : '';
    const priceEntry = Number.isInteger(c.priceSourceId) ? registry.get(c.priceSourceId) : null;
    if (amount != null && merchant && priceEntry
        && sourceSupportsBottle(priceEntry, { producer, cuvee, vintage })
        && sourceStatesPrice(priceEntry, amount)
        && sourceCarriesMerchant(priceEntry, merchant)){
      price = { amount, merchant, source: { title: priceEntry.title, url: priceEntry.url } };
    }

    out.push({
      producer, name: cuvee, vintage,
      grape: typeof c.grape === 'string' ? c.grape.trim() : '',
      region: typeof c.region === 'string' ? c.region.trim() : '',
      // A verified IDENTITY does not verify the model's REASON. The proposed
      // `why` is free prose that can carry a fabricated score, critic claim,
      // award, tasting note, or drinking window past an honestly-supported
      // bottle. Until each such claim gets its own deterministic evidence
      // verification, no bottle-specific reason leaves this boundary.
      why: '',
      sources, price,
    });
    if (out.length >= 3) break;                      // a shortlist, not a catalogue
  }
  return out;
}
