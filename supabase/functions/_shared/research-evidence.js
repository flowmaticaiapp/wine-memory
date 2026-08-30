// Pure evidence-boundary helpers shared by the Edge Function and node tests.
// URLs leave this module only when Anthropic attached them as citations to its
// research notes. The answer model chooses integer IDs; it can never supply a
// URL of its own.

export function citedEvidence(content){
  if (!Array.isArray(content)) return [];
  const byUrl = new Map();
  for (const block of content){
    if (!block || typeof block !== 'object' || block.type !== 'text' || !Array.isArray(block.citations)) continue;
    for (const citation of block.citations){
      if (!citation || typeof citation !== 'object') continue;
      if (typeof citation.url !== 'string' || !/^https:\/\//i.test(citation.url)) continue;
      let fallbackTitle = citation.url;
      try { fallbackTitle = new URL(citation.url).hostname; } catch { continue; }
      const title = typeof citation.title === 'string' && citation.title.trim() ? citation.title.trim() : fallbackTitle;
      const citedText = typeof citation.cited_text === 'string' ? citation.cited_text.trim() : '';
      if (!byUrl.has(citation.url)) byUrl.set(citation.url, { title, url:citation.url, citedText });
      else if (citedText){
        const prior = byUrl.get(citation.url);
        if (!prior.citedText.includes(citedText)) prior.citedText = `${prior.citedText} ${citedText}`.trim();
      }
    }
  }
  return [...byUrl.values()].slice(0, 8).map((e, i)=>({ id:i+1, ...e }));
}

export function selectEvidenceSources(evidence, requestedIds){
  const requested = new Set(Array.isArray(requestedIds) ? requestedIds.filter(Number.isInteger) : []);
  return (evidence||[])
    .filter(e=>requested.has(e.id))
    .map(({ title, url })=>({ title, url }));
}
