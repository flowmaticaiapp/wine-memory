# Wine Memory

A personal, AI-powered **wine memory** app — capture a wine you loved, remember where it came from, what it tasted like, what you paired it with, and whether you'd buy it again. Built as a real **Vite + React** app from the "Wine Memory — Visual" design (Claude Design handoff).

Editorial, near-monochrome **parchment** identity (Newsreader serif + Archivo sans, no accent color — the wine labels provide the color). Presented in a 393×852 iPhone frame.

## Screens & flows

- **Home** — "What are we drinking?" + four concierge tiles (Shopping · At Home · Dining Out · Explore) and an "Ask your sommelier" bar.
- **My Cellar** — verdict-filtered, image-led grid (All · To Try · Buy Again · Maybe · No, with live counts) and Grid / Flavor / Region / Pairing browse modes.
- **Wine Detail** — bottle hero, verdict picker, AI flavor-profile bars, pairings, personal notes, provenance, "more like this."
- **My Palate** — taste insights + saved pairings. **Explore** — learn a region (grapes, taste, what you own).
- **Add** flows — Snap a Label · Scan Multiple Bottles · Search a Bottle · Paste an Order (with a real receipt parser).
- **Pairing sommelier** & **Dining Out** — Food → Style → Region → Bottle, using `window.claude.complete` when available with an offline heuristic fallback.

A **Tweaks** panel (bottom-left toggle) exposes grid columns (2/3) and verdict UI style (expressive / subtle / glyph).

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
npm run preview  # preview the build
```

## Structure

```
src/
  main.jsx              # app shell, nav, FAB, overlay routing
  index.css             # parchment tokens, fonts, keyframes
  lib/
    data.js             # theme, seed wines, verdicts, order parser
    constants.js        # shared layout metrics + helpers
  components/
    IOSFrame.jsx        # iPhone device frame
    TweaksPanel.jsx     # tweaks UI
    ui.jsx              # icons, verdict UI, chips
    bottle.jsx          # honest bottle imagery + flavor bars
    visual.jsx          # Cellar grid + shelves + Detail
    home.jsx palate.jsx explore.jsx
    add.jsx snap.jsx scan.jsx pairing.jsx diningout.jsx
```

Sample bottle imagery lives in `public/app/`. No backend — all data is in-memory seed data, badged "Sample" with a one-tap **Clear samples**.

## Notes

This is a faithful port of an HTML/React prototype: components keep the original inline-style design system. The sommelier's live AI path looks for `window.claude.complete`; without it (the default standalone case) it uses a built-in heuristic so pairings and answers still work.
