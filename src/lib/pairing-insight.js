import { personalWines } from './palate.js';
import { textMatchesAnyGrape } from './grapes.js';

// A taste observation belongs beneath a pairing only when it is relevant to
// the recommendation. "You love Pinot Noir" under a Malbec steak answer is
// true-but-misleading, so it is omitted rather than used as decoration.
export function relevantBuyAgainGrape(wines, result){
  const buys = personalWines(wines).filter(w=>w.verdict==='buy' && w.grape);
  const tally = {};
  buys.forEach(w=>{ tally[w.grape]=(tally[w.grape]||0)+1; });
  const top = Object.entries(tally).sort((a,b)=>b[1]-a[1])[0];
  if (!top || top[1] < 2 || !result?.primary) return null;
  const targets = result.primary.matchGrapes || [result.primary.grape];
  return textMatchesAnyGrape(top[0], targets) ? top[0] : null;
}
