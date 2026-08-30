// constants.js — shared layout metrics + tiny helpers used across screens.
// (In the prototype these lived as globals at the top of visual.jsx.)
import { FLAVOR_FAMILIES } from './data.js';

export const V_STATUS = 50, V_NAV = 64;
export const DEVICE_W = 393, CONTENT_W = DEVICE_W - 32;
export const vToday = ()=> new Date().toISOString().slice(0,10);
// Returns null when the family is unknown or absent. It must NOT fall back to
// the first family: that quietly labelled every wine without a flavour family
// "Bold & Structured" — an invented fact of exactly the kind this app is
// removing. Callers render a neutral state instead.
export const famOf = (id)=> FLAVOR_FAMILIES.find(f=>f.id===id) || null;
export const FAM_NEUTRAL_HUE = 20;
export const clamp = (n)=>({ display:'-webkit-box', WebkitLineClamp:n, WebkitBoxOrient:'vertical', overflow:'hidden' });
