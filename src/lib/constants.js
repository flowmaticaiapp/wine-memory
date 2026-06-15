// constants.js — shared layout metrics + tiny helpers used across screens.
// (In the prototype these lived as globals at the top of visual.jsx.)
import { FLAVOR_FAMILIES } from './data.js';

export const V_STATUS = 50, V_NAV = 64;
export const DEVICE_W = 393, CONTENT_W = DEVICE_W - 32;
export const vToday = ()=> new Date().toISOString().slice(0,10);
export const famOf = (id)=> FLAVOR_FAMILIES.find(f=>f.id===id) || FLAVOR_FAMILIES[0];
export const clamp = (n)=>({ display:'-webkit-box', WebkitLineClamp:n, WebkitBoxOrient:'vertical', overflow:'hidden' });
