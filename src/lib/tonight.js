// The guided "What should I open tonight?" decision. Ambiguous tonight
// questions need context before any recommendation; specific food questions
// keep the fast pairing path.

import { consolidateCellarBottles } from './cellar-display.js';

const TONIGHT_DECISION = /\b(?:open|drink|pour|choose|pick)\b[^.?!]{0,45}\btonight\b|\btonight\b[^.?!]{0,45}\b(?:open|drink|pour|choose|pick)\b/i;

const MOOD_COPY = {
  light: 'light and fresh',
  rich: 'rich and cozy',
  bold: 'bold and full-flavored',
  different: 'something different',
  decide: 'the best fit',
};

export function needsTonightGuidance(query, hasSpecificFood){
  const q = String(query ?? '').trim();
  return !!q && TONIGHT_DECISION.test(q) && !hasSpecificFood;
}

export function moodScore(wine, mood){
  const f = wine?.flavor || {};
  const body = Number(f.body) || 0;
  const acidity = Number(f.acidity) || 0;
  const tannin = Number(f.tannin) || 0;
  const oak = Number(f.oak) || 0;
  const type = String(wine?.type || '').toLowerCase();
  if (mood === 'light') return (6-body)*2 + acidity + (/white|ros|sparkling/.test(type) ? 3 : 0);
  if (mood === 'rich') return body*2 + oak + (/red|fortified/.test(type) ? 1 : 0);
  if (mood === 'bold') return body*2 + tannin*1.5 + (/red|fortified/.test(type) ? 2 : 0);
  if (mood === 'different') return wine?.verdict === 'totry' ? 25 : (wine?.verdict === 'maybe' ? 10 : 0);
  return 0;
}

export function rankTonightBottles(wines, mood, limit = 3){
  const verdict = { buy:30, totry:12, maybe:5, no:-30 };
  const ranked = (Array.isArray(wines) ? wines : [])
    .filter(w=>w && !w.sample)
    .slice()
    .sort((a,b)=>
      ((verdict[b.verdict]||0) + moodScore(b, mood))
      - ((verdict[a.verdict]||0) + moodScore(a, mood)));
  return consolidateCellarBottles(ranked).slice(0, limit);
}

export function tonightReason(mealLabel, mood, hasMeal){
  const moodText = MOOD_COPY[mood] || MOOD_COPY.decide;
  if (hasMeal) return `It fits ${mealLabel.toLowerCase()} and gives you ${moodText} tonight.`;
  return `It is the strongest ${moodText} option among the bottles you own.`;
}

export function alternativeDirection(lead, alternative){
  const a = alternative?.flavor || {};
  const l = lead?.flavor || {};
  const aType = String(alternative?.type || '').toLowerCase();
  const lType = String(lead?.type || '').toLowerCase();
  if (/white|ros|sparkling/.test(aType) && /red|fortified/.test(lType)) return 'A lighter, brighter direction';
  if (/red|fortified/.test(aType) && /white|ros|sparkling/.test(lType)) return 'A deeper, richer direction';
  if ((Number(a.body)||0) + 0.75 < (Number(l.body)||0)) return 'Lighter and easier';
  if ((Number(a.body)||0) > (Number(l.body)||0) + 0.75) return 'Richer and fuller';
  if ((Number(a.acidity)||0) > (Number(l.acidity)||0) + 0.75) return 'Brighter and fresher';
  if (alternative?.grape && alternative.grape !== lead?.grape) return `A different expression: ${alternative.grape}`;
  return 'Another bottle that fits';
}
