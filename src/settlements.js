// Settlements: where people would actually have built. Harbours in the
// shelter of bays and at river mouths, a few places inland by fresh water,
// the roads that join them, and the odd curiosity for the chart.

import { MinHeap, eachNeighbour } from './hydrology.js';
import { RELIEF_FLAT, RELIEF_MOUNTAIN, RELIEF_HILL, COVER_MARSH, COVER_FOREST, spaced } from './features.js';

export function placeTowns(terrain, hydro, features, rng) {
  const { N, elev, landCells, widthMiles } = terrain;
  const { land, coastDist, freshDist, landmass, relief, cover, landAround } = features;
  const mouths = hydro.rivers
    .map((r, index) => ({ r, index }))
    .filter(({ r }) => r.into === 'sea')
    .map(({ r, index }) => ({ x: r.mouth[0], y: r.mouth[1], flux: r.flux[r.flux.length - 1], index }));

  const candidates = [];
  for (let y = 3; y < N - 3; y++) {
    for (let x = 3; x < N - 3; x++) {
      const i = y * N + x;
      if (!land[i] || cover[i] === COVER_MARSH || relief[i] === RELIEF_MOUNTAIN) continue;
      if (hydro.isRiver[i]) continue;
      const massSize = landmass.sizes[landmass.id[i]];
      if (massSize < 40) continue;
      const coastal = coastDist[i] <= 1.5;
      const inland = coastDist[i] >= 9 && freshDist[i] <= 2 && relief[i] === RELIEF_FLAT;
      if (!coastal && !inland) continue;
      let score = rng.range(0, 0.25);
      let river = -1;
      if (coastal) {
        // Shelter: a harbour wants land on about two sides of three.
        const shelter = landAround(x, y, 7);
        score += 1 - Math.abs(shelter - 0.62) * 2.2;
        for (const m of mouths) {
          const d = Math.hypot(m.x - x, m.y - y);
          if (d < 3.5) {
            score += 0.5 + 0.25 * Math.min(1, m.flux / (4 * hydro.threshold));
            river = m.index;
          }
        }
      } else {
        score += 0.35;
        river = hydro.riverOf[i];
      }
      score -= 2 * elev[i];
      if (massSize < 400) score -= 0.5;
      candidates.push({ x, y, score, coastal, river, mass: landmass.id[i] });
    }
  }

  const count = Math.max(2, Math.min(7, Math.round(1.6 + landCells / 2600 + widthMiles / 55)));
  const gap = Math.max(11, Math.sqrt(landCells) * 0.21);
  const chosen = spaced(candidates, gap, count);

  // Rank: the best site is the capital; the bottom third are villages.
  return chosen.map((c, k) => ({
    ...c,
    rank: k === 0 ? 'capital' : k < Math.max(2, Math.ceil(chosen.length * 0.6)) ? 'town' : 'village',
  }));
}

/**
 * Roads: a minimum spanning tree over the towns of each landmass, each leg
 * routed by A* over the terrain. Later legs prefer ground already trodden,
 * so roads merge. Returns polylines in lattice units.
 */
export function buildRoads(terrain, hydro, features, towns) {
  const { N, elev, peakFeet } = terrain;
  const { land, relief, cover } = features;
  const size = N * N;
  const trodden = new Uint8Array(size);
  const steepness = 6 + peakFeet / 700;

  const stepCost = (from, to, dist) => {
    let cost = 1 + steepness * Math.abs(elev[to] - elev[from]) * 40 + 3 * elev[to];
    if (relief[to] === RELIEF_MOUNTAIN) cost += 4;
    else if (relief[to] === RELIEF_HILL) cost += 0.6;
    if (cover[to] === COVER_MARSH) cost += 3;
    else if (cover[to] === COVER_FOREST) cost += 0.3;
    if (hydro.isRiver[to]) cost += 2.5; // a ford or a bridge
    if (trodden[to]) cost *= 0.35;
    return cost * dist;
  };

  const route = (start, goal) => {
    const gx = goal % N;
    const gy = Math.floor(goal / N);
    const best = new Float32Array(size).fill(Infinity);
    const from = new Int32Array(size).fill(-1);
    const heap = new MinHeap();
    best[start] = 0;
    heap.push(0, start);
    while (heap.size) {
      const c = heap.pop();
      if (c === goal) break;
      const base = best[c];
      eachNeighbour(N, c, (n, d) => {
        if (!land[n]) return;
        const g = base + stepCost(c, n, d % 2 ? Math.SQRT2 : 1);
        if (g < best[n]) {
          best[n] = g;
          from[n] = c;
          heap.push(g + 0.35 * Math.hypot((n % N) - gx, Math.floor(n / N) - gy), n);
        }
      });
    }
    if (from[goal] === -1) return null;
    const path = [];
    for (let c = goal; c !== -1; c = from[c]) path.push(c);
    return path.reverse();
  };

  // Prim's algorithm per landmass, on straight-line distance.
  const roads = [];
  const byMass = new Map();
  towns.forEach((t, index) => {
    if (!byMass.has(t.mass)) byMass.set(t.mass, []);
    byMass.get(t.mass).push(index);
  });
  for (const members of byMass.values()) {
    const joined = [members[0]];
    const waiting = members.slice(1);
    while (waiting.length) {
      let pick = null;
      for (const a of joined) {
        for (const b of waiting) {
          const d = Math.hypot(towns[a].x - towns[b].x, towns[a].y - towns[b].y);
          if (!pick || d < pick.d) pick = { a, b, d };
        }
      }
      waiting.splice(waiting.indexOf(pick.b), 1);
      joined.push(pick.b);
      const path = route(towns[pick.a].y * N + towns[pick.a].x, towns[pick.b].y * N + towns[pick.b].x);
      if (!path) continue;
      // Keep only the newly broken ground, plus the cells where it joins.
      let leg = [];
      const flush = () => {
        if (leg.length > 1) roads.push({ from: pick.a, to: pick.b, points: leg.map((c) => [c % N, Math.floor(c / N)]) });
        leg = [];
      };
      for (let k = 0; k < path.length; k++) {
        const c = path[k];
        if (trodden[c]) {
          if (leg.length) { leg.push(c); flush(); }
        } else {
          if (!leg.length && k > 0) leg.push(path[k - 1]);
          leg.push(c);
        }
      }
      flush();
      for (const c of path) trodden[c] = 1;
    }
  }
  return { roads, trodden };
}

/** Curiosities: a light on a headland, old stones, a wreck offshore. */
export function placeSites(terrain, hydro, features, towns, rng) {
  const { N, ocean } = terrain;
  const { land, coastDist, seaDist, relief, cover, capes, landmass } = features;
  const sites = [];
  const clear = (x, y, gap) =>
    towns.every((t) => Math.hypot(t.x - x, t.y - y) >= gap) &&
    sites.every((s) => Math.hypot(s.x - x, s.y - y) >= gap);

  const scatter = (test, tries = 4000) => {
    for (let k = 0; k < tries; k++) {
      const x = rng.int(4, N - 5);
      const y = rng.int(4, N - 5);
      if (test(y * N + x, x, y) && clear(x, y, 12)) return { x, y };
    }
    return null;
  };

  // A light on the boldest headland, if anyone lives here to tend it.
  const cape = capes.find((c) => clear(c.x, c.y, 8));
  if (cape && rng.chance(0.75)) sites.push({ kind: 'light', x: cape.x, y: cape.y });

  const inlandKinds = rng.shuffle(['ruin', 'stones', 'hermitage', 'tower', 'mine']);
  const wanted = rng.int(1, 3);
  for (const kind of inlandKinds) {
    if (sites.filter((s) => s.kind !== 'light').length >= wanted) break;
    let spot = null;
    if (kind === 'mine') {
      spot = scatter((i) => relief[i] === RELIEF_MOUNTAIN || (relief[i] === RELIEF_HILL && coastDist[i] > 6), 1500);
    } else if (kind === 'hermitage') {
      // Hermits favour islets and lonely shores.
      spot =
        scatter((i) => land[i] && landmass.sizes[landmass.id[i]] < 300 && coastDist[i] >= 1.5, 2500) ??
        scatter((i) => land[i] && coastDist[i] < 4 && coastDist[i] >= 1.5 && cover[i] !== COVER_MARSH, 1500);
    } else if (kind === 'tower') {
      spot = scatter((i) => land[i] && coastDist[i] >= 2 && coastDist[i] < 5 && relief[i] !== RELIEF_MOUNTAIN, 1500);
    } else {
      spot = scatter((i) => land[i] && coastDist[i] > 5 && relief[i] !== RELIEF_MOUNTAIN && cover[i] !== COVER_MARSH && !hydro.isRiver[i], 1500);
    }
    if (spot) sites.push({ kind, ...spot });
  }

  if (rng.chance(0.7)) {
    const spot = scatter((i) => ocean[i] && seaDist[i] >= 3 && seaDist[i] <= 7, 3000);
    if (spot) sites.push({ kind: 'wreck', ...spot });
  }
  return sites;
}
