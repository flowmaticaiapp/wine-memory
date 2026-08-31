// Shared display boundary for bottles the user owns. Multiple database rows
// can represent multiple physical bottles of the same wine; customer-facing
// lists should show one wine with a quantity, not repeat an indistinguishable
// card. Different producers or vintages remain separate.

const norm = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export function cellarBottleKey(wine){
  return [norm(wine?.producer), norm(wine?.name), norm(wine?.vintage || 'NV')].join('|');
}

export function consolidateCellarBottles(wines){
  const groups = new Map();
  for (const wine of (Array.isArray(wines) ? wines : [])){
    if (!wine || typeof wine !== 'object') continue;
    const key = cellarBottleKey(wine);
    const current = groups.get(key);
    if (current){
      current.quantity += 1;
      current.bottleIds.push(wine.id);
      continue;
    }
    groups.set(key, { ...wine, quantity:1, bottleIds:[wine.id] });
  }
  return [...groups.values()];
}
