// The chart: an island drawn as a hand-inked sea chart, in plain SVG.
//
// Drawing order, bottom to top: paper and sea, rhumb lines, shore ripples,
// land, colour washes, rivers, roads, relief and trees, towns, lettering,
// then the furniture (compass, scale, cartouche), the frame and a wash of
// paper grain over everything.

import { Rng, hashString } from './rng.js';
import { contours, smooth } from './contour.js';
import {
  windowAverager, RELIEF_FLAT, RELIEF_HILL, RELIEF_MOUNTAIN, COVER_FOREST, COVER_MARSH,
} from './features.js';

const VIEW = 1000;
const M = 40; // inset of the map proper
const S = VIEW - 2 * M;

export const THEME = {
  paper: '#efe3c3',
  sea: '#d3dccd',
  land: '#f3e9cf',
  ink: '#35281d',
  seaInk: '#5d7b86',
  river: '#4d7183',
  red: '#a23b2a',
  forest: '#8ea163',
  upland: '#a8936a',
  peak: '#f0e4c8',
  marsh: '#7fa392',
  tree: '#dde0b4',
  accents: ['#c98a5a', '#9db07a', '#d0a850', '#bf8088', '#86a3b0'],
};

const FONT = "'IM Fell English', 'Palatino Linotype', Palatino, 'Book Antiqua', P052, 'URW Palladio L', Georgia, serif";

const f = (n) => String(Math.round(n * 10) / 10);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Rough advance width of serif text; good enough to keep labels apart. */
export function textWidth(str, size, spacing = 0) {
  let w = 0;
  for (const ch of str) {
    if (ch === ' ') w += 0.27;
    else if ("iljtfrI.,'-".includes(ch)) w += 0.31;
    else if ('mwMW'.includes(ch)) w += 0.86;
    else if ((ch >= 'A' && ch <= 'Z') || 'ÖÅ'.includes(ch)) w += 0.7;
    else w += 0.5;
  }
  return (w + spacing * str.length) * size;
}

const pathOf = (pts, closed = false) => {
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) d += `L${f(pts[i][0])} ${f(pts[i][1])}`;
  return closed ? `${d}Z` : d;
};

export function renderSVG(island, { theme = THEME } = {}) {
  const { terrain, hydro, features } = island;
  const { N, ocean } = terrain;
  const rng = new Rng(island.seed).fork('chart');
  const uid = `i${hashString(island.seed)().toString(36)}`;
  const K = S / (N - 1);
  const px = (v) => M + v * K;
  const toPx = ([x, y]) => [px(x), px(y)];
  const cellAt = (X, Y) => {
    const x = Math.round((X - M) / K);
    const y = Math.round((Y - M) / K);
    return x < 0 || y < 0 || x >= N || y >= N ? -1 : y * N + x;
  };
  const dryAt = (X, Y) => {
    const c = cellAt(X, Y);
    return c >= 0 && !ocean[c];
  };
  const accent = rng.pick(theme.accents);

  // --- Occupancy: boxes that lettering and symbols must keep clear of -----
  const occupied = [];
  const hits = (b, pad = 0) =>
    occupied.some((o) => b.x0 - pad < o.x1 && b.x1 + pad > o.x0 && b.y0 - pad < o.y1 && b.y1 + pad > o.y0);
  const inFrame = (b) => b.x0 > M + 8 && b.x1 < M + S - 8 && b.y0 > M + 8 && b.y1 < M + S - 8;
  const blocked = (X, Y, r) => hits({ x0: X - r, x1: X + r, y0: Y - r, y1: Y + r });
  /** Fraction of a box that is dry land, sampled on a small grid. */
  const dryness = (b) => {
    let dry = 0;
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 6; i++) {
        if (dryAt(b.x0 + ((i + 0.5) / 6) * (b.x1 - b.x0), b.y0 + ((j + 0.5) / 3) * (b.y1 - b.y0))) dry++;
      }
    }
    return dry / 18;
  };
  /** Clearance of a box from the land, in cells: 0 if it touches any. */
  const seaRoom = (b) => {
    let room = Infinity;
    for (let Y = b.y0; Y <= b.y1; Y += 2 * K) {
      for (let X = b.x0; X <= b.x1; X += 2 * K) {
        const c = cellAt(X, Y);
        if (c >= 0) room = Math.min(room, features.seaDist[c]);
      }
    }
    return room;
  };

  const layers = {
    defs: [], under: [], washes: [], rivers: [], roads: [], relief: [], symbols: [], labels: [], furniture: [],
  };

  // --- Coast ---------------------------------------------------------------
  const coastD = island.coast.map((loop) => pathOf(loop.map(toPx), true)).join('');
  const coastUse = (attrs) => `<use href="#${uid}-coast" ${attrs}/>`;
  layers.defs.push(
    `<path id="${uid}-coast" d="${coastD}"/>`,
    `<clipPath id="${uid}-land">${coastUse('clip-rule="evenodd"')}</clipPath>`,
    `<clipPath id="${uid}-map"><rect x="${M}" y="${M}" width="${S}" height="${S}"/></clipPath>`,
  );
  // Shore ripples: rings at fixed distances from the coast, cut by a mask
  // of nested strokes. The land later hides the half that falls inside.
  const rings = [[5, 1.2, '#fff', '46 5'], [11.5, 1, '#b0b0b0', '30 7'], [19, 0.9, '#707070', '18 9']];
  let mask = `<rect width="${VIEW}" height="${VIEW}" fill="#000"/>`;
  for (const [dist, thick, level, dash] of rings.slice().reverse()) {
    mask += coastUse(`fill="none" stroke="${level}" stroke-width="${f(2 * dist + thick)}" stroke-linejoin="round" stroke-dasharray="${dash}"`);
    mask += coastUse(`fill="none" stroke="#000" stroke-width="${f(2 * dist - thick)}" stroke-linejoin="round"`);
  }
  layers.defs.push(`<mask id="${uid}-ripples" maskUnits="userSpaceOnUse" x="0" y="0" width="${VIEW}" height="${VIEW}">${mask}</mask>`);

  // --- Furniture positions (drawn last, but they claim their space first) --
  const slots = (w, h, inset) => {
    const lo = M + inset;
    const hiX = M + S - inset - w;
    const hiY = M + S - inset - h;
    const midX = M + (S - w) / 2;
    const midY = M + (S - h) / 2;
    return [
      [lo, lo], [hiX, lo], [lo, hiY], [hiX, hiY], [midX, hiY], [midX, lo], [lo, midY], [hiX, midY],
    ].map(([x, y], k) => ({ x0: x, y0: y, x1: x + w, y1: y + h, order: k }));
  };
  const claim = (w, h, inset) => {
    let best = null;
    for (const slot of slots(w, h, inset)) {
      if (hits(slot, 6)) continue;
      const score = Math.min(seaRoom(slot), 14) - slot.order * 0.4;
      if (!best || score > best.score) best = { ...slot, score };
    }
    best ??= slots(w, h, inset)[0];
    occupied.push(best);
    return best;
  };
  const title = cartouche(island, theme);
  const titleBox = claim(title.w, title.h, 16);
  const roseR = 54;
  const roseBox = claim(2 * roseR + 16, 2 * roseR + 34, 14);
  const rose = { x: (roseBox.x0 + roseBox.x1) / 2, y: roseBox.y0 + 26 + roseR };
  const bar = scaleBar(island, theme);
  const barBox = claim(bar.w, bar.h, 18);

  // Rhumb lines radiating from the rose, as on a portolan.
  let rhumbs = '';
  for (let k = 0; k < 32; k++) {
    const a = (k * Math.PI) / 16;
    rhumbs += `<line x1="${f(rose.x)}" y1="${f(rose.y)}" x2="${f(rose.x + 1500 * Math.cos(a))}" y2="${f(rose.y + 1500 * Math.sin(a))}" opacity="${k % 4 === 0 ? 0.3 : k % 2 === 0 ? 0.2 : 0.11}"/>`;
  }
  layers.under.push(`<g clip-path="url(#${uid}-map)" stroke="${theme.ink}" stroke-width="0.7">${rhumbs}</g>`);
  layers.under.push(`<rect x="${M}" y="${M}" width="${S}" height="${S}" fill="${theme.seaInk}" mask="url(#${uid}-ripples)" clip-path="url(#${uid}-map)"/>`);

  // --- Colour washes ------------------------------------------------------
  const wash = (test, radius, colour, opacity) => {
    const mask01 = new Uint8Array(N * N);
    let any = false;
    for (let i = 0; i < N * N; i++) if (test(i)) { mask01[i] = 1; any = true; }
    if (!any) return;
    const average = windowAverager(N, mask01);
    const field = new Float32Array(N * N);
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) field[y * N + x] = average(x, y, radius);
    const d = contours(field, N, 0.45).filter((l) => l.closed && l.length > 8)
      .map((l) => pathOf(smooth(l, 2).map(toPx), true)).join('');
    if (d) layers.washes.push(`<path d="${d}" fill="${colour}" fill-rule="evenodd" opacity="${opacity}" filter="url(#${uid}-soft)"/>`);
  };
  layers.defs.push(`<filter id="${uid}-soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="5"/></filter>`);
  layers.washes.push(coastUse(`fill="none" stroke="${accent}" stroke-width="20" opacity="0.45" filter="url(#${uid}-soft)"`));
  wash((i) => features.relief[i] !== RELIEF_FLAT, 2, theme.upland, 0.15);
  wash((i) => features.relief[i] === RELIEF_MOUNTAIN, 2, theme.upland, 0.24);
  wash((i) => features.cover[i] === COVER_FOREST, 2, theme.forest, 0.34);
  wash((i) => features.cover[i] === COVER_MARSH, 2, theme.marsh, 0.4);

  // --- Rivers: runs of constant width, widening downstream ---------------
  const riverLines = island.rivers.map((r) => smooth(r.points.map(toPx), 2, false));
  island.rivers.forEach((r, index) => {
    const pts = riverLines[index];
    const widthAt = (i) => {
      const k = Math.min(r.flux.length - 1, Math.floor(i / 4));
      return Math.round((0.7 + 0.5 * Math.sqrt(r.flux[k] / hydro.threshold)) * 4) / 4;
    };
    let run = [pts[0]];
    let width = widthAt(0);
    const flush = () => {
      if (run.length > 1) layers.rivers.push(`<path d="${pathOf(run)}" stroke-width="${width}"/>`);
    };
    for (let i = 1; i < pts.length; i++) {
      run.push(pts[i]);
      const w = widthAt(i);
      if (w !== width) {
        flush();
        run = [pts[i]];
        width = w;
      }
    }
    flush();
  });

  // --- Roads ---------------------------------------------------------------
  const onRoad = new Uint8Array(N * N);
  for (const road of island.roads) {
    for (const [x, y] of road.points) onRoad[y * N + x] = 1;
    layers.roads.push(`<path d="${pathOf(smooth(road.points.map(toPx), 3, false))}"/>`);
  }

  // --- Towns and curiosities ----------------------------------------------
  for (const t of island.towns) {
    const X = px(t.x);
    const Y = px(t.y);
    const r = t.rank === 'capital' ? 9 : t.rank === 'town' ? 7 : 5;
    layers.symbols.push(townSymbol(X, Y, t.rank, theme));
    occupied.push({ x0: X - r, x1: X + r, y0: Y - r - 3, y1: Y + r - 2, icon: true });
  }
  for (const s of island.sites) {
    const X = px(s.x);
    const Y = px(s.y);
    layers.symbols.push(siteSymbol(X, Y, s.kind, theme));
    occupied.push({ x0: X - 6, x1: X + 6, y0: Y - 8, y1: Y + 4, icon: true });
  }
  for (const p of island.peaks) {
    occupied.push({ x0: px(p.x) - 4, x1: px(p.x) + 4, y0: px(p.y) - 4, y1: px(p.y) + 4, icon: true });
  }

  // --- Lettering -----------------------------------------------------------
  const label = (X, Y, str, o) => {
    const attrs = [
      `x="${f(X)}" y="${f(Y)}" font-size="${o.size}"`,
      o.anchor && o.anchor !== 'start' ? `text-anchor="${o.anchor}"` : '',
      o.italic ? 'font-style="italic"' : '',
      o.spacing ? `letter-spacing="${f(o.spacing * o.size)}"` : '',
      `fill="${o.fill ?? theme.ink}"`,
      o.opacity ? `opacity="${o.opacity}"` : '',
      o.halo ? `stroke="${o.halo}" stroke-opacity="0.85" stroke-width="${f(o.size * 0.28)}" paint-order="stroke" stroke-linejoin="round"` : '',
    ].filter(Boolean).join(' ');
    return `<text ${attrs}>${esc(str)}</text>`;
  };
  const boxFor = (X, Y, w, size, anchor) => {
    const x0 = anchor === 'middle' ? X - w / 2 : anchor === 'end' ? X - w : X;
    return { x0, x1: x0 + w, y0: Y - size * 0.78, y1: Y + size * 0.24 };
  };
  /** Letter a point feature, trying positions around it for the best fit. */
  const pointLabel = (X, Y, str, style, { r = 5, prefer = null, must = false, water = 0 } = {}) => {
    const size = style.size;
    const w = textWidth(str, size, style.spacing ?? 0);
    const mid = size * 0.3;
    // Eight positions hard by the symbol, then eight more a little way off.
    const options = [];
    for (const [gap, penalty] of [[0, 0], [11, 0.6]]) {
      const q = r + gap;
      options.push(
        [X + q + 3, Y + mid, 'start', penalty],
        [X - q - 3, Y + mid, 'end', penalty + 0.12],
        [X + q, Y - q * 0.6, 'start', penalty + 0.18],
        [X + q, Y + q + size * 0.6, 'start', penalty + 0.22],
        [X - q, Y - q * 0.6, 'end', penalty + 0.28],
        [X - q, Y + q + size * 0.6, 'end', penalty + 0.32],
        [X, Y - q - 4, 'middle', penalty + 0.36],
        [X, Y + q + size * 0.82, 'middle', penalty + 0.4],
      );
    }
    let best = null;
    for (const [lx, ly, anchor, bias] of options) {
      const box = boxFor(lx, ly, w, size, anchor);
      if (!inFrame(box)) continue;
      const dry = dryness(box);
      let cost = bias + 2.5 * Math.min(dry, 1 - dry) + water * dry;
      if (prefer) cost += 0.5 * (1 - ((lx - X) * prefer[0] + (ly - mid - Y) * prefer[1]) / (Math.hypot(lx - X, ly - mid - Y) + 1e-6));
      if (hits(box, 1.5)) cost += 10;
      if (!best || cost < best.cost) best = { lx, ly, anchor, box, cost, dry };
    }
    if (!best || (best.cost >= 10 && !must)) return false;
    occupied.push(best.box);
    layers.labels.push(label(best.lx, best.ly, str, { ...style, anchor: best.anchor, halo: best.dry > 0.5 ? theme.land : theme.sea }));
    return true;
  };

  for (const t of island.towns) {
    const capital = t.rank === 'capital';
    const style = capital ? { size: 15.5, spacing: 0.07 } : t.rank === 'town' ? { size: 14.5 } : { size: 13, italic: true };
    pointLabel(px(t.x), px(t.y) - 2, capital ? t.name.toUpperCase() : t.name, style, { r: capital ? 9 : 7, must: true });
  }
  for (const p of island.peaks) {
    const X = px(p.x);
    const Y = px(p.y);
    const str = p.highest ? `${p.name} ${p.feet}` : p.name;
    if (pointLabel(X, Y, str, { size: 12, italic: true }, { r: 6 }) || p.highest) {
      layers.symbols.push(`<path d="M${f(X - 3.2)} ${f(Y + 2.4)}L${f(X)} ${f(Y - 3.4)}L${f(X + 3.2)} ${f(Y + 2.4)}Z" fill="${theme.land}" stroke="${theme.ink}" stroke-width="1"/><circle cx="${f(X)}" cy="${f(Y + 0.5)}" r="0.8" fill="${theme.ink}"/>`);
    }
  }

  // Rivers are lettered along their own course, on the straightest reach.
  island.rivers.forEach((r, index) => {
    if (!r.name) return;
    const size = 12;
    const str = r.name.name;
    const need = textWidth(str, size, 0.04) + 12;
    // Iron out the wiggles first so the text reads as one gesture.
    const raw = riverLines[index];
    const calm = raw.map((_, i) => {
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (let k = Math.max(0, i - 7); k <= Math.min(raw.length - 1, i + 7); k++) { sx += raw[k][0]; sy += raw[k][1]; n++; }
      return [sx / n, sy / n];
    });
    let best = null;
    for (let start = 2; start < calm.length - 4; start += 3) {
      let len = 0;
      let turn = 0;
      let end = start;
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      while (end < calm.length - 1 && len < need) {
        len += Math.hypot(calm[end + 1][0] - calm[end][0], calm[end + 1][1] - calm[end][1]);
        if (end > start) {
          const a = Math.atan2(calm[end][1] - calm[end - 1][1], calm[end][0] - calm[end - 1][0]);
          const b = Math.atan2(calm[end + 1][1] - calm[end][1], calm[end + 1][0] - calm[end][0]);
          turn += Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
        }
        end++;
      }
      if (len < need) break;
      for (let k = start; k <= end; k++) {
        x0 = Math.min(x0, calm[k][0]); x1 = Math.max(x1, calm[k][0]);
        y0 = Math.min(y0, calm[k][1]); y1 = Math.max(y1, calm[k][1]);
      }
      const box = { x0: x0 - 4, x1: x1 + 4, y0: y0 - size, y1: y1 + 4 };
      const steep = Math.abs(calm[end][1] - calm[start][1]) / (len + 1e-6);
      const cost = turn + 0.6 * steep + (hits(box, 1) ? 10 : 0) + (inFrame(box) ? 0 : 10);
      if (!best || cost < best.cost) best = { start, end, box, cost };
    }
    if (!best || best.cost >= 10 || best.cost > 2.2) {
      // Too short or too crooked to letter along: set the name beside it.
      const midpoint = raw[Math.floor(raw.length * 0.55)];
      pointLabel(midpoint[0], midpoint[1], str, { size, italic: true, fill: theme.river }, { r: 3 });
      return;
    }
    let seg = calm.slice(best.start, best.end + 1);
    if (seg[seg.length - 1][0] < seg[0][0]) seg = seg.reverse();
    occupied.push(best.box);
    const id = `${uid}-r${index}`;
    layers.defs.push(`<path id="${id}" d="${pathOf(seg)}"/>`);
    layers.labels.push(
      `<text font-size="${size}" font-style="italic" letter-spacing="${f(0.04 * size)}" fill="${theme.river}" stroke="${theme.land}" stroke-opacity="0.8" stroke-width="${f(size * 0.24)}" paint-order="stroke" stroke-linejoin="round" dy="-3.5"><textPath href="#${id}" startOffset="50%" text-anchor="middle">${esc(str)}</textPath></text>`,
    );
  });

  for (const s of island.sites) {
    pointLabel(px(s.x), px(s.y) - 2, s.name, { size: 11, italic: true }, { r: 6, water: s.kind === 'wreck' ? -1 : 0 });
  }
  // Capes are lettered out to sea, bays in their own water.
  for (const c of island.capes) {
    const X = px(c.x);
    const Y = px(c.y);
    let ox = 0;
    let oy = 0;
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      const sample = features.landAround(Math.round(c.x + 7 * Math.cos(a)), Math.round(c.y + 7 * Math.sin(a)), 3);
      ox += (1 - sample) * Math.cos(a);
      oy += (1 - sample) * Math.sin(a);
    }
    const len = Math.hypot(ox, oy) || 1;
    pointLabel(X + (ox / len) * 4, Y + (oy / len) * 4, c.name, { size: 12, italic: true, fill: theme.seaInk }, { r: 3, prefer: [ox / len, oy / len], water: 1.5 });
  }
  // Area names sit on the feature if they can, else as near as will fit.
  const spiral = [[0, 0]];
  for (let ring = 1; ring <= 4; ring++) {
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 + ring * 0.4;
      spiral.push([Math.cos(a) * ring * 16, Math.sin(a) * ring * 11]);
    }
  }
  const areaLabel = (place, style, water) => {
    const size = style.size;
    const w = textWidth(place.name, size, style.spacing ?? 0);
    let best = null;
    for (const [dx, dy] of spiral) {
      const X = px(place.x) + dx;
      const Y = px(place.y) + dy + size * 0.3;
      const box = boxFor(X, Y, w, size, 'middle');
      if (!inFrame(box) || hits(box, 2)) continue;
      const dry = dryness(box);
      const wrong = water ? dry : 1 - dry;
      if (wrong > 0.4) continue;
      const cost = 3 * wrong + Math.hypot(dx, dy) / 40;
      if (!best || cost < best.cost) best = { X, Y, box, cost };
    }
    if (!best) return false;
    occupied.push(best.box);
    layers.labels.push(label(best.X, best.Y, place.name, { ...style, anchor: 'middle', halo: water ? theme.sea : theme.land }));
    return true;
  };
  for (const b of island.bays) areaLabel(b, { size: 12, italic: true, fill: theme.seaInk }, true);
  if (island.mere) {
    areaLabel(island.mere, { size: 11, italic: true, fill: theme.seaInk }, true) ||
      pointLabel(px(island.mere.x), px(island.mere.y), island.mere.name, { size: 11, italic: true, fill: theme.seaInk }, { r: 8 });
  }
  if (island.wood) areaLabel(island.wood, { size: 12, italic: true, spacing: 0.12, fill: '#4c5a2c' }, false);
  if (island.marsh) areaLabel(island.marsh, { size: 11.5, italic: true, spacing: 0.1, fill: '#3f6357' }, false);

  // The sea's own name goes in the widest water left.
  {
    const lines = island.sea.name.toUpperCase();
    let placed = false;
    for (const size of [27, 22, 18]) {
      if (placed) break;
      const w = textWidth(lines, size, 0.32);
      const spots = [];
      for (let y = 6; y < N - 6; y += 4) {
        for (let x = 6; x < N - 6; x += 4) {
          const d = features.seaDist[y * N + x];
          if (d > 5) spots.push({ x, y, d: Math.min(d, 30) - 0.02 * Math.abs(y - N / 2) });
        }
      }
      spots.sort((a, b) => b.d - a.d);
      for (const spot of spots) {
        const box = boxFor(px(spot.x), px(spot.y), w, size, 'middle');
        if (!inFrame(box) || hits(box, 10) || seaRoom(box) < 2.5) continue;
        occupied.push(box);
        layers.labels.push(label(px(spot.x) + 0.16 * size, px(spot.y), lines, { size, italic: true, spacing: 0.32, anchor: 'middle', fill: theme.seaInk, opacity: 0.75 }));
        placed = true;
        break;
      }
    }
  }

  // --- Sea ornaments: a ship, a monster, a few waves ----------------------
  const openSea = (room, w, h) => {
    for (let k = 0; k < 400; k++) {
      const X = rng.range(M + 40, M + S - 40);
      const Y = rng.range(M + 40, M + S - 40);
      const box = { x0: X - w / 2, x1: X + w / 2, y0: Y - h / 2, y1: Y + h / 2 };
      if (hits(box, 14) || seaRoom(box) < room) continue;
      occupied.push(box);
      return [X, Y];
    }
    return null;
  };
  const shipAt = openSea(7, 56, 56);
  if (shipAt) layers.furniture.push(ship(shipAt[0], shipAt[1] + 15, rng.chance(0.5), theme));
  const beastAt = rng.chance(0.7) ? openSea(8, 96, 44) : null;
  if (beastAt) layers.furniture.push(serpent(beastAt[0], beastAt[1] + 8, rng.chance(0.5), theme));
  let waves = '';
  for (let Y = M + 30; Y < M + S - 20; Y += 46) {
    for (let X = M + 30; X < M + S - 30; X += 62) {
      const wx = X + rng.range(-20, 20);
      const wy = Y + rng.range(-14, 14);
      const c = cellAt(wx, wy);
      if (c < 0 || features.seaDist[c] < 7 || rng.chance(0.45) || blocked(wx + 7, wy, 12)) continue;
      waves += `M${f(wx)} ${f(wy)}q3.5 -3.5 7 0q3.5 3.5 7 0`;
    }
  }
  layers.under.push(`<path d="${waves}" fill="none" stroke="${theme.seaInk}" stroke-width="0.9" stroke-linecap="round" opacity="0.6"/>`);

  // --- Relief and vegetation ----------------------------------------------
  // Jittered grids, coarse for hills and mountains, fine for trees.
  const glyphs = [];
  const scatter = (spacing, fn) => {
    let row = 0;
    for (let Y = M; Y < M + S; Y += spacing * 0.86, row++) {
      for (let X = M + (row % 2 ? spacing / 2 : 0); X < M + S; X += spacing) {
        const gx = X + rng.range(-0.3, 0.3) * spacing;
        const gy = Y + rng.range(-0.3, 0.3) * spacing;
        const c = cellAt(gx, gy);
        if (c < 0 || !features.land[c]) continue;
        fn(gx, gy, c);
      }
    }
  };
  const palms = island.flavour === 'polyn';
  const conifers = island.flavour === 'norn' || island.flavour === 'karst' ? 0.75 : island.flavour === 'saxon' ? 0.25 : 0.1;
  scatter(15.5, (X, Y, c) => {
    if (features.freshDist[c] < 1.3 || onRoad[c]) return;
    const kind = features.relief[c];
    if (kind === RELIEF_MOUNTAIN) {
      const e = terrain.elev[c];
      const w = 13 + 17 * Math.min(1, (e - 0.25) / 0.6) + rng.range(-1.5, 1.5);
      if (blocked(X, Y - w * 0.3, w * 0.5)) return;
      glyphs.push({ y: Y, svg: mountain(X, Y, w, rng, theme) });
    } else if (kind === RELIEF_HILL) {
      if (rng.chance(features.cover[c] === COVER_FOREST ? 0.6 : 0.3)) return;
      if (features.coastDist[c] < 1.5 || blocked(X, Y - 3, 7)) return;
      glyphs.push({ y: Y, svg: hill(X, Y, 10 + rng.range(0, 5), rng, theme) });
    }
  });
  const trees = new Map();
  const marks = { marsh: '', grass: '' };
  scatter(8.6, (X, Y, c) => {
    if (features.cover[c] !== COVER_FOREST || features.freshDist[c] < 1.1 || onRoad[c]) return;
    if (features.relief[c] === RELIEF_HILL && rng.chance(0.45)) return;
    if (features.coastDist[c] < 1.2 || blocked(X, Y - 3, 5)) return;
    const band = Math.round(Y / 5);
    const upland = terrain.elev[c] > 0.22;
    let d;
    if (palms && !upland && features.coastDist[c] < 9) d = palm(X, Y, rng);
    else if (rng.chance(upland ? Math.min(1, conifers + 0.4) : conifers)) d = conifer(X, Y, rng);
    else d = broadleaf(X, Y, rng);
    trees.set(band, (trees.get(band) ?? '') + d);
  });
  scatter(11.5, (X, Y, c) => {
    if (blocked(X, Y - 2, 5) || onRoad[c] || features.freshDist[c] < 1) return;
    if (features.cover[c] === COVER_MARSH) {
      marks.marsh += `M${f(X - 4)} ${f(Y)}h8M${f(X - 2)} ${f(Y - 0.6)}l-1.2 -3M${f(X)} ${f(Y - 0.6)}v-4M${f(X + 2)} ${f(Y - 0.6)}l1.2 -3`;
    } else if (features.relief[c] === RELIEF_FLAT && features.cover[c] !== COVER_FOREST && features.coastDist[c] > 2 && rng.chance(0.16)) {
      marks.grass += `M${f(X - 1.6)} ${f(Y)}l-0.8 -2.4M${f(X)} ${f(Y)}v-3M${f(X + 1.6)} ${f(Y)}l0.8 -2.4`;
    }
  });
  layers.relief.push(`<path d="${marks.marsh}" fill="none" stroke="${theme.river}" stroke-width="0.8" stroke-linecap="round"/>`);
  layers.relief.push(`<path d="${marks.grass}" fill="none" stroke="${theme.ink}" stroke-width="0.6" stroke-linecap="round" opacity="0.45"/>`);
  for (const band of [...trees.keys()].sort((a, b) => a - b)) {
    layers.relief.push(`<path d="${trees.get(band)}" fill="${theme.tree}" stroke="${theme.ink}" stroke-width="0.7" stroke-linejoin="round"/>`);
  }
  glyphs.sort((a, b) => a.y - b.y);
  for (const g of glyphs) layers.relief.push(g.svg);

  // --- Furniture -----------------------------------------------------------
  layers.furniture.push(compassRose(rose.x, rose.y, roseR, theme));
  layers.furniture.push(`<g transform="translate(${f(barBox.x0)} ${f(barBox.y0)})">${bar.svg}</g>`);
  layers.furniture.push(`<g transform="translate(${f(titleBox.x0)} ${f(titleBox.y0)})">${title.svg}</g>`);

  // --- Assemble --------------------------------------------------------------
  const grainSeed = rng.int(1, 9999);
  layers.defs.push(
    `<filter id="${uid}-stain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.006 0.009" numOctaves="5" seed="${grainSeed}"/><feColorMatrix values="0 0 0 0 0.45 0 0 0 0 0.32 0 0 0 0 0.15 1.4 0 0 0 -0.8"/></filter>`,
    `<filter id="${uid}-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="${grainSeed + 1}"/><feColorMatrix values="0 0 0 0 0.3 0 0 0 0 0.2 0 0 0 0 0.1 0.4 0 0 0 -0.15"/></filter>`,
    `<radialGradient id="${uid}-age" cx="50%" cy="50%" r="72%"><stop offset="0.62" stop-color="#6b4a1e" stop-opacity="0"/><stop offset="1" stop-color="#6b4a1e" stop-opacity="0.3"/></radialGradient>`,
  );

  const subtitle = `${island.name.full}, in ${island.sea.full}. Seed “${island.seed}”.`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" font-family="${FONT}" role="img" aria-labelledby="${uid}-t ${uid}-d">`,
    `<title id="${uid}-t">A chart of ${esc(island.name.full)}</title>`,
    `<desc id="${uid}-d">${esc(subtitle)}</desc>`,
    `<defs>${layers.defs.join('')}</defs>`,
    `<rect width="${VIEW}" height="${VIEW}" fill="${theme.paper}"/>`,
    `<rect x="${M}" y="${M}" width="${S}" height="${S}" fill="${theme.sea}"/>`,
    layers.under.join(''),
    coastUse(`fill="${theme.land}" fill-rule="evenodd"`),
    `<g clip-path="url(#${uid}-land)">${layers.washes.join('')}`,
    `<g fill="none" stroke="${theme.river}" stroke-linecap="round" stroke-linejoin="round">${layers.rivers.join('')}</g></g>`,
    coastUse(`fill="none" stroke="${theme.ink}" stroke-width="1.5" stroke-linejoin="round"`),
    `<g fill="none" stroke="${theme.ink}" stroke-width="1.1" stroke-dasharray="3.2 2.6" opacity="0.75">${layers.roads.join('')}</g>`,
    layers.relief.join(''),
    layers.symbols.join(''),
    layers.labels.join(''),
    layers.furniture.join(''),
    frame(island, theme),
    `<g style="mix-blend-mode:multiply" pointer-events="none"><rect width="${VIEW}" height="${VIEW}" filter="url(#${uid}-stain)"/><rect width="${VIEW}" height="${VIEW}" filter="url(#${uid}-grain)"/><rect width="${VIEW}" height="${VIEW}" fill="url(#${uid}-age)"/></g>`,
    '</svg>',
  ].join('\n');
}

// --- Symbols -----------------------------------------------------------------

function mountain(X, Y, w, rng, theme) {
  const h = w * rng.range(0.78, 1.05);
  const peakX = X + rng.range(-0.1, 0.1) * w;
  const top = Y - h;
  const left = X - w / 2;
  const right = X + w / 2;
  const outline =
    `M${f(left)} ${f(Y)}Q${f(X - w * 0.24)} ${f(Y - h * 0.42)} ${f(peakX)} ${f(top)}` +
    `Q${f(X + w * 0.2)} ${f(Y - h * 0.5)} ${f(right)} ${f(Y)}`;
  // Shade the eastern flank with strokes falling away from the ridge.
  let shade = '';
  const strokes = Math.max(2, Math.round(w / 5.5));
  for (let k = 1; k <= strokes; k++) {
    const t = k / (strokes + 1);
    const sx = peakX + (right - peakX) * t * 0.9;
    const sy = top + h * (t * 0.92 + 0.06);
    const len = h * (0.16 + 0.3 * t) * rng.range(0.8, 1.15);
    shade += `M${f(sx)} ${f(sy)}l${f(-len * 0.42)} ${f(len)}`;
  }
  // A spur running down from the summit gives the peak some body.
  const spur = `M${f(peakX)} ${f(top)}q${f(-w * 0.04)} ${f(h * 0.3)} ${f(w * 0.05)} ${f(h * 0.55)}`;
  return (
    `<path d="${outline}" fill="${theme.peak}" stroke="${theme.ink}" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${shade}${spur}" fill="none" stroke="${theme.ink}" stroke-width="0.65" stroke-linecap="round" opacity="0.8"/>`
  );
}

function hill(X, Y, w, rng, theme) {
  const h = w * rng.range(0.42, 0.56);
  const d = `M${f(X - w / 2)} ${f(Y)}C${f(X - w * 0.3)} ${f(Y - h * 1.25)} ${f(X + w * 0.3)} ${f(Y - h * 1.25)} ${f(X + w / 2)} ${f(Y)}`;
  const tick = `M${f(X + w * 0.16)} ${f(Y - h * 0.62)}l${f(-0.8)} ${f(h * 0.5)}M${f(X + w * 0.3)} ${f(Y - h * 0.36)}l${f(-0.6)} ${f(h * 0.34)}`;
  return (
    `<path d="${d}" fill="${theme.peak}" stroke="${theme.ink}" stroke-width="0.95" stroke-linecap="round"/>` +
    `<path d="${tick}" fill="none" stroke="${theme.ink}" stroke-width="0.6" stroke-linecap="round" opacity="0.75"/>`
  );
}

function broadleaf(X, Y, rng) {
  const r = rng.range(2.5, 3.3);
  return `M${f(X)} ${f(Y)}v${f(-2)}M${f(X - r)} ${f(Y - 2 - r * 0.8)}a${f(r)} ${f(r * 0.95)} 0 1 1 ${f(2 * r)} 0a${f(r)} ${f(r * 0.95)} 0 1 1 ${f(-2 * r)} 0Z`;
}

function conifer(X, Y, rng) {
  const h = rng.range(6.5, 8.5);
  const w = 2.5;
  return `M${f(X)} ${f(Y)}v${f(-1.6)}M${f(X - w)} ${f(Y - 1.6)}L${f(X)} ${f(Y - 1.6 - h)}L${f(X + w)} ${f(Y - 1.6)}Z`;
}

function palm(X, Y, rng) {
  const lean = rng.range(-1.5, 1.5);
  const tx = X + lean;
  const ty = Y - rng.range(5.5, 7);
  const at = `M${f(tx)} ${f(ty)}`;
  return (
    `M${f(X)} ${f(Y)}Q${f(X + lean * 1.4)} ${f(Y - 3)} ${f(tx)} ${f(ty)}` +
    `${at}q-2.4 -2.2 -4.4 0.4${at}q2.4 -2.2 4.4 0.4${at}q-1.4 -3 -3.2 -2.8${at}q1.4 -3 3.2 -2.8`
  );
}

function townSymbol(X, Y, rank, theme) {
  const house = (x, y, w, h, roof) =>
    `<path d="M${f(x - w / 2)} ${f(y)}v${f(-h)}h${f(w)}v${f(h)}Z" fill="${theme.paper}" stroke="${theme.ink}" stroke-width="0.8" stroke-linejoin="round"/>` +
    `<path d="M${f(x - w / 2 - 0.9)} ${f(y - h)}L${f(x)} ${f(y - h - roof)}L${f(x + w / 2 + 0.9)} ${f(y - h)}Z" fill="${theme.red}" stroke="${theme.ink}" stroke-width="0.8" stroke-linejoin="round"/>`;
  const by = Y + 3;
  if (rank === 'capital') {
    return (
      house(X - 6, by, 5, 3.6, 3) + house(X + 6, by, 5, 3.6, 3) +
      house(X, by, 5.4, 7.5, 5.5) +
      `<path d="M${f(X)} ${f(by - 13)}v-3.6M${f(X - 1.5)} ${f(by - 15.2)}h3" stroke="${theme.ink}" stroke-width="0.8" fill="none"/>`
    );
  }
  if (rank === 'town') return house(X - 3, by, 4.6, 3.4, 2.8) + house(X + 2.6, by, 4.6, 5, 3.2);
  return house(X, by, 4.6, 3.2, 2.8);
}

function siteSymbol(X, Y, kind, theme) {
  const ink = `stroke="${theme.ink}" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round"`;
  switch (kind) {
    case 'light':
      return (
        `<path d="M${f(X - 2.2)} ${f(Y + 3)}L${f(X - 1.2)} ${f(Y - 5)}h2.4L${f(X + 2.2)} ${f(Y + 3)}Z" fill="${theme.paper}" ${ink}/>` +
        `<circle cx="${f(X)}" cy="${f(Y - 6.6)}" r="1.5" fill="${theme.red}" ${ink}/>` +
        `<path d="M${f(X - 3.4)} ${f(Y - 7.6)}l-2.6 -1M${f(X + 3.4)} ${f(Y - 7.6)}l2.6 -1M${f(X)} ${f(Y - 9.4)}v-2.4" fill="none" stroke="${theme.red}" stroke-width="0.9" stroke-linecap="round"/>`
      );
    case 'ruin':
      return `<path d="M${f(X - 4)} ${f(Y + 3)}v-7h2.4v3.4M${f(X + 0.6)} ${f(Y + 3)}v-4.6M${f(X + 4)} ${f(Y + 3)}v-8.4l-2 1.6" fill="none" ${ink}/><path d="M${f(X - 5.5)} ${f(Y + 3)}h11" fill="none" ${ink}/>`;
    case 'stones':
      return `<path d="M${f(X - 4.4)} ${f(Y + 3)}v-4.2M${f(X - 1.5)} ${f(Y + 1.6)}v-5M${f(X + 1.6)} ${f(Y + 1.6)}v-5M${f(X + 4.4)} ${f(Y + 3)}v-4.2" fill="none" stroke="${theme.ink}" stroke-width="1.7" stroke-linecap="round"/>`;
    case 'hermitage':
      return `<path d="M${f(X - 4)} ${f(Y + 3)}q4 -5 8 0" fill="${theme.paper}" ${ink}/><path d="M${f(X)} ${f(Y)}v-7.4M${f(X - 2.2)} ${f(Y - 5)}h4.4" fill="none" stroke="${theme.red}" stroke-width="1.1" stroke-linecap="round"/>`;
    case 'tower':
      return `<path d="M${f(X - 2.6)} ${f(Y + 3)}v-8.6h1.3v1.5h1.3v-1.5h1.3v1.5h1.3v-1.5h1.3v8.6Z" fill="${theme.paper}" ${ink}/><path d="M${f(X)} ${f(Y + 3)}v-2.6" fill="none" ${ink}/>`;
    case 'mine':
      return `<path d="M${f(X - 3.4)} ${f(Y + 3)}v-3.4a3.4 3.4 0 0 1 6.8 0v3.4Z" fill="${theme.ink}" ${ink}/><path d="M${f(X - 5.5)} ${f(Y + 3)}h11" fill="none" ${ink}/>`;
    case 'wreck':
      return (
        `<path d="M${f(X - 6)} ${f(Y)}q2.6 4.6 7 3.4l4.4 -4.6" fill="none" ${ink}/>` +
        `<path d="M${f(X - 1.4)} ${f(Y + 3)}l3.2 -9M${f(X - 0.8)} ${f(Y - 3.2)}l4.2 1.4" fill="none" ${ink}/>` +
        `<path d="M${f(X - 9)} ${f(Y + 5.4)}q2 -2 4 0q2 2 4 0q2 -2 4 0q2 2 4 0" fill="none" stroke="${theme.seaInk}" stroke-width="0.8" stroke-linecap="round"/>`
      );
    default:
      return `<circle cx="${f(X)}" cy="${f(Y)}" r="2" fill="${theme.ink}"/>`;
  }
}

function ship(X, Y, flip, theme) {
  const ink = `stroke="${theme.ink}" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round"`;
  return (
    `<g transform="translate(${f(X)} ${f(Y)}) scale(${flip ? -1.25 : 1.25} 1.25)">` +
    `<path d="M-22 9q3 -3 6 0q3 3 6 0M8 10q3 -3 6 0q3 3 6 0M-8 12q3 -3 6 0q3 3 6 0" fill="none" stroke="${theme.seaInk}" stroke-width="0.9" stroke-linecap="round"/>` +
    `<path d="M1 -1V-29M11 -2V-19M-9 -1V-18" fill="none" ${ink}/>` +
    `<path d="M-7 -23Q1 -26 9 -23Q11.5 -14 9 -6Q1 -9 -7 -6Q-4.6 -14 -7 -23Z" fill="${theme.paper}" ${ink}/>` +
    `<path d="M7 -16.5Q11 -18.5 15.5 -16.5Q17 -11 15.5 -6.5Q11 -8.5 7 -6.5Q8.4 -11 7 -16.5Z" fill="${theme.paper}" ${ink}/>` +
    `<path d="M-14.5 -5L-6 -18.5L-7.4 -4Z" fill="${theme.paper}" ${ink}/>` +
    `<path d="M1 -29q4 -2.2 7.5 -0.2q-3.5 0.8 -7.5 2.6Z" fill="${theme.red}" ${ink}/>` +
    `<path d="M-15 -2.5Q-13 6 -6.5 7H8Q14 6 17.5 -5L10.5 -1.2H-9.5Z" fill="${theme.paper}" ${ink}/>` +
    `<path d="M-11.6 1.8H11.8" fill="none" stroke="${theme.ink}" stroke-width="0.6"/>` +
    '</g>'
  );
}

function serpent(X, Y, flip, theme) {
  const ink = `stroke="${theme.ink}" stroke-width="0.95" stroke-linecap="round" stroke-linejoin="round"`;
  return (
    `<g transform="translate(${f(X)} ${f(Y)}) scale(${flip ? -1.25 : 1.25} 1.25)">` +
    `<path d="M-33 1q-1 -8 -7 -10q3.6 4 2.4 10Z" fill="${theme.paper}" ${ink}/>` +
    `<path d="M-27 1q5 -13 10.5 0Z" fill="${theme.paper}" ${ink}/>` +
    `<path d="M-13 1q6.5 -18 13.5 0Z" fill="${theme.paper}" ${ink}/>` +
    `<path d="M5 1Q6 -17 14 -21Q21 -24 26 -19L20.5 -16.4L25 -14.6Q19 -12.6 16 -14Q12.6 -8 13 1Z" fill="${theme.paper}" ${ink}/>` +
    `<circle cx="19.4" cy="-19.2" r="0.9" fill="${theme.ink}"/>` +
    `<path d="M-24.4 -3.4l1.2 -2.6M-9.4 -6l1.6 -3.4M-5.6 -5l1.4 -3M8.6 -8l2.8 -1.4M9.4 -3.6l2.6 -1" fill="none" stroke="${theme.ink}" stroke-width="0.6" stroke-linecap="round"/>` +
    `<path d="M-42 4q3 -3 6 0q3 3 6 0q3 -3 6 0q3 3 6 0q3 -3 6 0q3 3 6 0q3 -3 6 0q3 3 6 0q3 -3 6 0" fill="none" stroke="${theme.seaInk}" stroke-width="0.9" stroke-linecap="round"/>` +
    '</g>'
  );
}

function compassRose(X, Y, R, theme) {
  const at = (angle, radius) => [X + radius * Math.sin(angle), Y - radius * Math.cos(angle)];
  const point = (angle, length, spread, waist) => {
    const tip = at(angle, length);
    const a = at(angle - spread, waist);
    const b = at(angle + spread, waist);
    const tri = (p, fill) =>
      `<path d="M${f(X)} ${f(Y)}L${f(p[0])} ${f(p[1])}L${f(tip[0])} ${f(tip[1])}Z" fill="${fill}" stroke="${theme.ink}" stroke-width="0.7" stroke-linejoin="round"/>`;
    return tri(a, theme.paper) + tri(b, theme.ink);
  };
  let out = `<circle cx="${f(X)}" cy="${f(Y)}" r="${f(R * 0.74)}" fill="${theme.paper}" fill-opacity="0.55" stroke="${theme.ink}" stroke-width="0.8"/>`;
  out += `<circle cx="${f(X)}" cy="${f(Y)}" r="${f(R * 0.66)}" fill="none" stroke="${theme.ink}" stroke-width="0.5"/>`;
  let ticks = '';
  for (let k = 0; k < 32; k++) {
    const a = (k * Math.PI) / 16;
    const [x0, y0] = at(a, R * 0.66);
    const [x1, y1] = at(a, R * 0.74);
    ticks += `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`;
  }
  out += `<path d="${ticks}" stroke="${theme.ink}" stroke-width="0.6" fill="none"/>`;
  for (let k = 0; k < 8; k++) out += point(Math.PI / 8 + (k * Math.PI) / 4, R * 0.5, 0.36, R * 0.15);
  for (let k = 0; k < 4; k++) out += point(Math.PI / 4 + (k * Math.PI) / 2, R * 0.7, 0.5, R * 0.17);
  for (let k = 0; k < 4; k++) out += point((k * Math.PI) / 2, R, 0.62, R * 0.18);
  out += `<circle cx="${f(X)}" cy="${f(Y)}" r="${f(R * 0.07)}" fill="${theme.red}" stroke="${theme.ink}" stroke-width="0.7"/>`;
  out += `<text x="${f(X)}" y="${f(Y - R - 7)}" font-size="17" text-anchor="middle" fill="${theme.ink}">N</text>`;
  return out;
}

function scaleBar(island, theme) {
  const perMile = S / island.widthMiles;
  const nice = [2, 4, 5, 10, 20, 40, 50, 100].filter((m) => m * perMile <= 210);
  const miles = nice[nice.length - 1];
  const length = miles * perMile;
  const parts = 4;
  let svg = '';
  for (let k = 0; k < parts; k++) {
    svg += `<rect x="${f(8 + (k * length) / parts)}" y="14" width="${f(length / parts)}" height="5" fill="${k % 2 ? theme.paper : theme.ink}" stroke="${theme.ink}" stroke-width="0.8"/>`;
  }
  const tick = (value, x) => `<text x="${f(8 + x)}" y="10" font-size="10.5" text-anchor="middle" fill="${theme.ink}">${value}</text>`;
  svg += tick(0, 0) + tick(miles / 2, length / 2) + tick(miles, length);
  svg += `<text x="${f(8 + length / 2)}" y="33" font-size="11.5" font-style="italic" text-anchor="middle" fill="${theme.ink}">English Miles</text>`;
  return { svg, w: length + 16, h: 38 };
}

function cartouche(island, theme) {
  const { name, sea } = island;
  const lead = name.article ? 'A Chart of the' : 'A Chart of';
  const main = name.name.toUpperCase();
  const tail = `lying in ${sea.full}`;
  const w = 300;
  const h = 112;
  const mainSize = Math.min(27, (w - 44) / (textWidth(main, 1, 0.1) || 1));
  const tailSize = Math.min(13.5, (w - 40) / textWidth(tail, 1));
  const corner = (x, y) => `<circle cx="${x}" cy="${y}" r="3.2" fill="${theme.red}" stroke="${theme.ink}" stroke-width="0.8"/>`;
  const svg =
    `<rect width="${w}" height="${h}" fill="${theme.paper}" stroke="${theme.ink}" stroke-width="1.6"/>` +
    `<rect x="5" y="5" width="${w - 10}" height="${h - 10}" fill="none" stroke="${theme.ink}" stroke-width="0.7"/>` +
    corner(5, 5) + corner(w - 5, 5) + corner(5, h - 5) + corner(w - 5, h - 5) +
    `<text x="${w / 2}" y="31" font-size="14.5" font-style="italic" text-anchor="middle" fill="${theme.ink}">${lead}</text>` +
    `<text x="${f(w / 2 + 0.05 * mainSize)}" y="${f(47 + mainSize * 0.62)}" font-size="${f(mainSize)}" letter-spacing="${f(0.1 * mainSize)}" text-anchor="middle" fill="${theme.ink}">${esc(main)}</text>` +
    `<path d="M${w / 2 - 46} 79h36m20 0h36" stroke="${theme.ink}" stroke-width="0.7"/><path d="M${w / 2} 75.4l3.6 3.6l-3.6 3.6l-3.6 -3.6Z" fill="${theme.red}" stroke="${theme.ink}" stroke-width="0.6"/>` +
    `<text x="${w / 2}" y="98" font-size="${f(tailSize)}" font-style="italic" text-anchor="middle" fill="${theme.ink}">${esc(tail)}</text>`;
  return { svg, w, h };
}

function frame(island, theme) {
  const a = 16; // outer rule
  const b0 = 23; // graduated band
  const b1 = 32;
  let band = '';
  const count = 46;
  const step = S / count;
  for (let k = 0; k < count; k += 2) {
    band += `M${f(M + k * step)} ${b0}h${f(step)}v${b1 - b0}h${f(-step)}Z`;
    band += `M${f(M + k * step)} ${VIEW - b1}h${f(step)}v${b1 - b0}h${f(-step)}Z`;
    band += `M${b0} ${f(M + k * step)}v${f(step)}h${b1 - b0}v${f(-step)}Z`;
    band += `M${VIEW - b1} ${f(M + k * step)}v${f(step)}h${b1 - b0}v${f(-step)}Z`;
  }
  const rect = (inset, width) =>
    `<rect x="${inset}" y="${inset}" width="${VIEW - 2 * inset}" height="${VIEW - 2 * inset}" fill="none" stroke="${theme.ink}" stroke-width="${width}"/>`;
  // Keep an essay-length seed from running off the sheet.
  const shown = island.seed.length > 60 ? `${island.seed.slice(0, 57)}…` : island.seed;
  const credit = `Isolario · seed “${shown}”`;
  return (
    rect(a, 1.8) + rect(b0, 0.7) + rect(b1, 0.7) + rect(M, 1.3) +
    `<path d="${band}" fill="${theme.ink}"/>` +
    `<text x="${VIEW / 2}" y="${VIEW - 3.5}" font-size="9.5" font-style="italic" text-anchor="middle" fill="${theme.ink}" opacity="0.75">${esc(credit)}</text>`
  );
}
