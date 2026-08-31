// Favorites is an explicit user choice, independent of the tasting verdict.
// It uses the existing `tags` column so the first real Favorites screen needs
// no database migration and remains scoped by the wine row's existing RLS.
export const FAVORITE_TAG = 'Favorite';

export function isFavorite(wine){
  return Array.isArray(wine?.tags)
    && wine.tags.some(t => String(t).trim().toLowerCase() === FAVORITE_TAG.toLowerCase());
}

export function favoriteTags(tags, favorite){
  const list = Array.isArray(tags) ? tags.filter(t => String(t).trim().toLowerCase() !== FAVORITE_TAG.toLowerCase()) : [];
  return favorite ? [...list, FAVORITE_TAG] : list;
}

export function favoriteWines(wines){
  return (Array.isArray(wines) ? wines : []).filter(w => !w.sample && isFavorite(w));
}
