import { test } from 'node:test';
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
