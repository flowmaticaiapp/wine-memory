import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

import { citedEvidence, selectEvidenceSources } from '../supabase/functions/_shared/research-evidence.js';

const CONTENT = [
  { type:'server_tool_use', id:'search-1' },
  { type:'text', text:'Research note', citations:[
    { type:'web_search_result_location', title:'James Suckling', url:'https://www.jamessuckling.com/a', cited_text:'The exact 2021 wine received 96 points.' },
    { type:'web_search_result_location', title:'Producer', url:'https://producer.example/wine', cited_text:'The wine is Syrah.' },
  ] },
  { type:'text', text:'More', citations:[
    { type:'web_search_result_location', title:'James Suckling', url:'https://www.jamessuckling.com/a', cited_text:'It was reviewed in 2024.' },
  ] },
];

test('only citations—not arbitrary search or model text—enter the evidence registry', () => {
  const evidence = citedEvidence(CONTENT);
  assert.equal(evidence.length, 2);
  assert.equal(evidence[0].id, 1);
  assert.equal(evidence[0].url, 'https://www.jamessuckling.com/a');
  assert.match(evidence[0].citedText, /96 points/);
  assert.match(evidence[0].citedText, /reviewed in 2024/);
});

test('invalid and non-HTTPS citation URLs are discarded', () => {
  const evidence = citedEvidence([{ type:'text', citations:[
    { title:'Invented', url:'javascript:alert(1)', cited_text:'bad' },
    { title:'Local', url:'http://example.com', cited_text:'not secure' },
    { title:'Broken', url:'https://%', cited_text:'bad URL' },
  ] }]);
  assert.deepEqual(evidence, []);
});

test('the answer can return only source IDs created by the research registry', () => {
  const evidence = citedEvidence(CONTENT);
  const selected = selectEvidenceSources(evidence, [1, 999, 'https://invented.example']);
  assert.deepEqual(selected, [{ title:'James Suckling', url:'https://www.jamessuckling.com/a' }]);
});

test('bad source selections cannot create links', () => {
  const evidence = citedEvidence(CONTENT);
  assert.deepEqual(selectEvidenceSources(evidence, null), []);
  assert.deepEqual(selectEvidenceSources(evidence, ['1', {}, -1]), []);
});

// ── The sommelier's exact bottle: deterministic identity verification ──
// A selected citation existing is NOT enough to label a bottle
// "Source-verified". The model proposes producer, cuvée and vintage as
// structured fields, and the bottle renders only when a cited registry entry
// supports that exact identity — the same boundary Must Try uses.

import { verifiedSommelierBottle } from '../supabase/functions/_shared/musttry-verify.js';

const BOTTLE_EVIDENCE = [
  { id:1, title:'Domaine Nord — Crozes-Hermitage', url:'https://producer.example/crozes',
    citedText:'Domaine Nord Crozes-Hermitage 2021 is a peppery, savoury Syrah.' },
  { id:2, title:'Rhône pairing guide', url:'https://magazine.example/rhone-guide',
    citedText:'Northern Rhône Syrah is a classic steak partner.' },              // valid, unrelated
  { id:3, title:'Domaine Nord — Saint-Joseph', url:'https://producer.example/st-joseph',
    citedText:'Domaine Nord Saint-Joseph 2021 shows dark olive fruit.' },        // same producer, other wine
  { id:4, title:'Domaine Nord — Crozes-Hermitage 2019', url:'https://producer.example/crozes-2019',
    citedText:'Domaine Nord Crozes-Hermitage 2019 was leaner.' },                // other vintage
];
const NORD = { producer:'Domaine Nord', cuvee:'Crozes-Hermitage', vintage:'2021', why:'Cited.' };

test('a sommelier bottle survives only when a citation supports its exact identity', () => {
  const ok = verifiedSommelierBottle(NORD, [1, 2], BOTTLE_EVIDENCE);
  assert.equal(ok.bottle, 'Domaine Nord Crozes-Hermitage 2021');
  assert.equal(ok.bottleWhy, 'Cited.');
});

test('ADVERSARIAL: a valid but unrelated citation does not justify the bottle', () => {
  assert.deepEqual(verifiedSommelierBottle(NORD, [2], BOTTLE_EVIDENCE), { bottle:'', bottleWhy:'' },
    'a general Rhône guide never verifies a specific bottle');
});

test('ADVERSARIAL: another wine from the same producer does not justify the bottle', () => {
  assert.deepEqual(verifiedSommelierBottle(NORD, [3], BOTTLE_EVIDENCE), { bottle:'', bottleWhy:'' });
});

test('ADVERSARIAL: another vintage of the same wine does not justify the bottle', () => {
  assert.deepEqual(verifiedSommelierBottle(NORD, [4], BOTTLE_EVIDENCE), { bottle:'', bottleWhy:'' });
});

test('missing identity fields, invented ids, or no evidence yield no bottle', () => {
  assert.deepEqual(verifiedSommelierBottle({ ...NORD, producer:'' }, [1], BOTTLE_EVIDENCE), { bottle:'', bottleWhy:'' });
  assert.deepEqual(verifiedSommelierBottle({ ...NORD, vintage:'' }, [1], BOTTLE_EVIDENCE), { bottle:'', bottleWhy:'' });
  assert.deepEqual(verifiedSommelierBottle(NORD, [99], BOTTLE_EVIDENCE), { bottle:'', bottleWhy:'' });
  assert.deepEqual(verifiedSommelierBottle(NORD, [1], []), { bottle:'', bottleWhy:'' });
  assert.deepEqual(verifiedSommelierBottle(null, [1], BOTTLE_EVIDENCE), { bottle:'', bottleWhy:'' });
});

test('the sommelier server verifies the structured bottle before composing the display string', () => {
  const src = readFileSync(new URL('../supabase/functions/sommelier/index.ts', import.meta.url), 'utf8');
  assert.match(src, /verifiedSommelierBottle\(/, 'the shared boundary is applied on the sommelier path');
  assert.match(src, /bottleProducer/, 'the schema uses structured identity fields');
  assert.match(src, /bottleVintage/, 'vintage is a structured field, never free text');
  assert.ok(!/bottle: \{ type: "string"/.test(src), 'the old free-text bottle field is gone from the schema');
});
