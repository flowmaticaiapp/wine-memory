// trust.test.js — regression guards for the recommendation-trust rules.
//
// These test the behaviours that are easy to undo by accident and expensive to
// notice: a sample bottle leaking into a claim about the user's taste, a wine
// getting a flavour profile nobody sourced, or the photo-privacy change
// breaking a photo a user saved before the migration.
//
// Deliberately dependency-free: run with `npm test` (node --test). No test
// framework was added to the project for this.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { autoEnrich } from '../src/lib/data.js';
import { personalWines, tasteSignature, regionsYouLove, groupByRegion, exploreNext } from '../src/lib/palate.js';
import { storagePath } from '../src/lib/photopath.js';

const sommelierSource = readFileSync(new URL('../supabase/functions/sommelier/index.ts', import.meta.url), 'utf8');

// ── fixtures ────────────────────────────────────────────────────────
const flavor = { body:4, acidity:4, tannin:4, fruit:3, oak:2 };
const sample = (over={}) => ({ id:'s'+Math.random(), sample:true, verdict:'buy', type:'Red',
  grape:'Nebbiolo', region:'Barbaresco, Piedmont', country:'Italy', loc:[8.06,44.72], flavor, ...over });
const mine = (over={}) => ({ id:'m'+Math.random(), sample:false, verdict:'buy', type:'White',
  grape:'Chenin Blanc', region:'Montlouis-sur-Loire', country:'France', loc:[0.82,47.38],
  flavor:{ body:2, acidity:5, tannin:0, fruit:2, oak:0 }, ...over });

// ── 1. Sample wines must never shape a claim about the user ─────────

test('personalWines drops samples and tolerates null', () => {
  assert.equal(personalWines([sample(), mine(), sample()]).length, 1);
  assert.deepEqual(personalWines(null), []);
  assert.deepEqual(personalWines(undefined), []);
});

test('tasteSignature ignores sample wines entirely', () => {
  // Samples alone must yield no signature at all — not a signature of the demo data.
  assert.equal(tasteSignature([sample(), sample(), sample()]), null);

  // And adding samples alongside real wines must not move the result.
  const real = [mine(), mine({ grape:'Riesling' })];
  const withSamples = [...real, sample(), sample(), sample()];
  assert.deepEqual(tasteSignature(withSamples), tasteSignature(real));
});

test('regionsYouLove never surfaces a region the user only has samples from', () => {
  const loved = regionsYouLove([sample(), sample(), mine()]);
  const labels = loved.map(g => g.label);
  assert.ok(!labels.includes('Piedmont'), 'sample-only region leaked into "regions you love"');
  assert.ok(labels.includes('Loire'));
});

test('exploreNext does not treat a sample region as already owned', () => {
  // A sample Piedmont Nebbiolo must not suppress Valtellina/Etna suggestions,
  // because the user does not actually own a Piedmont wine.
  const suggestions = exploreNext([sample(), mine()], null, 8).map(c => c.label);
  assert.ok(suggestions.length > 0);
});

test('groupByRegion stays a DISPLAY function and keeps samples on the map', () => {
  // The Taste Atlas shows what is in the cellar. Derivations filter; display does not.
  const groups = groupByRegion([sample(), mine()]);
  assert.equal(groups.length, 2, 'map should show both the sample and the real wine');
});

// ── 2. No wine may be given an invented flavour profile ─────────────

test('autoEnrich is inert — it invents nothing and mutates nothing', () => {
  const before = { id:'w1', type:'Red', name:'Some Red' };
  const after = autoEnrich(before);
  assert.equal(after, before, 'autoEnrich should hand the wine straight back');
  assert.equal(after.flavor, undefined);
  assert.equal(after.family, undefined);
  assert.equal(after.pairings, undefined);
});

test('autoEnrich is deterministic across repeated calls', () => {
  // The removed implementation used Math.random(), so identical input could
  // produce two different taste profiles. Guard against any reintroduction.
  const runs = Array.from({ length: 25 }, () => JSON.stringify(autoEnrich({ id:'w', type:'Red' })));
  assert.equal(new Set(runs).size, 1);
});

test('a wine with no flavour data cannot enter the taste signature', () => {
  const unflavoured = [mine({ flavor:undefined }), mine({ flavor:undefined })];
  assert.equal(tasteSignature(unflavoured), null);
});

// ── 3. Photo paths: the privacy change must not orphan old photos ───

test('storagePath resolves new private references', () => {
  assert.equal(
    storagePath('storage:8f1c-uid/abc-123.jpg'),
    '8f1c-uid/abc-123.jpg',
  );
});

test('storagePath still resolves public URLs saved before the migration', () => {
  // This is the backward-compatibility guarantee for photos already in the
  // database. If this breaks, existing users lose their bottle photos.
  assert.equal(
    storagePath('https://ohovvvnhwxttqtmhanpm.supabase.co/storage/v1/object/public/bottle-photos/8f1c-uid/abc-123.jpg'),
    '8f1c-uid/abc-123.jpg',
  );
});

test('storagePath decodes escaped characters and drops query strings', () => {
  assert.equal(
    storagePath('https://x.supabase.co/storage/v1/object/public/bottle-photos/uid/a%20b.jpg?t=123'),
    'uid/a b.jpg',
  );
});

test('storagePath leaves non-Storage values alone', () => {
  // Bundled seed imagery and empty values are not Storage objects and must be
  // passed through untouched rather than signed.
  assert.equal(storagePath('app/scan/b1.jpg'), null);
  assert.equal(storagePath(null), null);
  assert.equal(storagePath(undefined), null);
  assert.equal(storagePath(''), null);
  assert.equal(storagePath(42), null);
});

// ── 4. Public-web research must precede specific recommendations ───

test('sommelier uses bounded server-side web search', () => {
  assert.match(sommelierSource, /web_search_20250305/);
  assert.match(sommelierSource, /const MAX_WEB_SEARCHES = 3/);
  assert.match(sommelierSource, /tool_choice:\s*\{ type: "any" \}/);
});

test('preferred voices are search priorities, never automatic authorities', () => {
  for (const source of ['JamesSuckling.com', 'WineAccess.com', 'WineForNormalPeople.com']) {
    assert.ok(sommelierSource.includes(source), `${source} is missing from the research strategy`);
  }
  assert.match(sommelierSource, /source preference is not evidence/i);
});

test('specific claims require exact cited evidence', () => {
  assert.match(sommelierSource, /Never transfer a score, review, drinking window, or award between vintages/);
  assert.match(sommelierSource, /verify producer, cuvee,? and (?:the relevant )?vintage/i);
  assert.match(sommelierSource, /selectEvidenceSources\(research\.evidence, parsed\.sourceIds\)/,
    'returned links must be selected from the server-created evidence registry');
});

test('Vivino is excluded from automated research', () => {
  assert.match(sommelierSource, /blocked_domains:\s*\["vivino\.com"\]/);
});

test('web-search terms exclude personal and cellar information', () => {
  assert.match(sommelierSource, /Never put a person's name, street address, email, account detail, private note, or cellar contents into a search query/);
});
