// The printed page: a chart beside its gazetteer entry, as HTML. Used for
// standalone pages from the command line and by the explorer in the browser.

import { renderSVG } from './render.js';
import { gazetteer } from './gazetteer.js';

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const PAGE_CSS = `
:root {
  color-scheme: light dark;
  --desk: #e4dbc6;
  --page: #f7f0de;
  --ink: #2f241a;
  --muted: #6d604d;
  --rule: #cfc2a3;
  --accent: #a23b2a;
  --shadow: rgba(60, 40, 10, 0.28);
}
@media (prefers-color-scheme: dark) {
  :root {
    --desk: #1b1713;
    --page: #29231c;
    --ink: #eae0ca;
    --muted: #a99b82;
    --rule: #4b4135;
    --accent: #df7b66;
    --shadow: rgba(0, 0, 0, 0.6);
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--desk);
  color: var(--ink);
  font: 17px/1.58 'IM Fell English', 'Palatino Linotype', Palatino, 'Book Antiqua', P052, 'URW Palladio L', Georgia, serif;
}
.entry {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: 2rem;
  max-width: 1560px;
  margin: 0 auto;
  padding: 1.5rem;
  align-items: start;
}
.chart {
  margin: 0;
  position: sticky;
  top: 1.5rem;
  box-shadow: 0 1px 2px var(--shadow), 0 14px 36px var(--shadow);
}
.chart svg { display: block; width: 100%; height: auto; }
.gazetteer {
  background: var(--page);
  border: 1px solid var(--rule);
  padding: 2rem 2.3rem 2.4rem;
}
.gazetteer h1 {
  margin: 0;
  font-size: 1.65rem;
  font-weight: normal;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  line-height: 1.25;
  text-wrap: balance;
}
.gazetteer .subtitle { margin: 0.25rem 0 1.2rem; font-style: italic; color: var(--muted); }
.facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.15rem 1.2rem;
  margin: 0 0 1.3rem;
  padding: 0.8rem 0;
  border-block: 1px solid var(--rule);
  font-size: 0.95rem;
}
.facts dt { font-variant: small-caps; letter-spacing: 0.06em; color: var(--muted); }
.facts dd { margin: 0; font-variant-numeric: oldstyle-nums; overflow-wrap: anywhere; }
.gazetteer h2 {
  margin: 1.25rem 0 0.15rem;
  font-size: 0.82rem;
  font-weight: normal;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--accent);
}
.gazetteer p { margin: 0; hyphens: auto; text-wrap: pretty; }
@media (max-width: 920px) {
  .entry { grid-template-columns: 1fr; padding: 1rem; gap: 1.2rem; }
  .chart { position: static; }
  .gazetteer { padding: 1.4rem 1.2rem 1.6rem; }
}
@media print {
  body { background: none; }
  .chart { box-shadow: none; position: static; }
  .gazetteer { border: none; }
}
`;

/** The chart and its entry as an HTML fragment. All text is escaped. */
export function entryHTML(island, svg = renderSVG(island)) {
  const g = gazetteer(island);
  const facts = g.table.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  const sections = g.sections
    .map((s) => `<section><h2>${esc(s.heading)}</h2><p>${esc(s.text)}</p></section>`)
    .join('\n');
  return (
    `<figure class="chart">${svg}</figure>\n` +
    `<article class="gazetteer"><h1>${esc(g.title)}</h1><p class="subtitle">${esc(g.subtitle)}</p>` +
    `<dl class="facts">${facts}</dl>\n${sections}</article>`
  );
}

/** A complete, self-contained HTML page for one island. */
export function pageHTML(island) {
  const g = gazetteer(island);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(g.title)} · Isolario</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<main class="entry">
${entryHTML(island)}
</main>
</body>
</html>
`;
}
