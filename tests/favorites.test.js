import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FAVORITE_TAG, isFavorite, favoriteTags, favoriteWines } from '../src/lib/favorites.js';

test('Favorites is an explicit star, independent of the tasting verdict', () => {
  assert.equal(isFavorite({ verdict:'buy', tags:[] }), false, 'Buy Again does not silently mean Favorite');
  assert.equal(isFavorite({ verdict:'no', tags:[FAVORITE_TAG] }), true, 'a star is its own user choice');
});

test('starring preserves note tags and never duplicates the Favorite marker', () => {
  const starred = favoriteTags(['Special occasion', 'favorite'], true);
  assert.deepEqual(starred, ['Special occasion', FAVORITE_TAG]);
  assert.deepEqual(favoriteTags(starred, false), ['Special occasion']);
});

test('the Favorites list includes only real, explicitly starred cellar bottles', () => {
  const wines = [
    { id:'real', tags:[FAVORITE_TAG], sample:false },
    { id:'sample', tags:[FAVORITE_TAG], sample:true },
    { id:'buy', verdict:'buy', tags:[], sample:false },
  ];
  assert.deepEqual(favoriteWines(wines).map(w=>w.id), ['real']);
  assert.deepEqual(favoriteWines(null), []);
});
