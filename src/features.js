// Features: what a surveyor would note down. Ground cover, summits,
// headlands and bays, all measured from the terrain and its rivers.

import { makeNoise, fbm } from './noise.js';
import { distanceField } from './hydrology.js';
import { components } from './terrain.js';

export const RELIEF_FLAT = 0;
export const RELIEF_HILL = 1;
export const RELIEF_MOUNTAIN = 2;
export const COVER_BARE = 0;
export const COVER_FOREST = 1;
export const COVER_MARSH = 2;

/** Summed-area table over a 0/1 mask, for fast window averages. */
export function windowAverager(N, mask) {
  const W = N + 1;
  const sat = new Float64Array(W * W);
  for (let y = 0; y < N; y++) {
    let row = 0;
    for (let x = 0; x < N; x++) {
      row += mask[y * N + x] ? 1 : 0;
      sat[(y + 1) * W + x + 1] = sat[y * W + x + 1] + row;
    }
  }
  /** Fraction of set cells in the square of radius r around (x, y). */
  return (x, y, r) => {
    const x0 = Math.max(0, x - r);
    const y0 = Math.max(0, y - r);
    const x1 = Math.min(N, x + r + 1);
    const y1 = Math.min(N, y + r + 1);
    const sum = sat[y1 * W + x1] - sat[y0 * W + x1] - sat[y1 * W + x0] + sat[y0 * W + x0];
    return sum / ((x1 - x0) * (y1 - y0));
  };
}

/** Greedily keep the best-scoring candidates that are at least `gap` apart. */
export function spaced(candidates, gap, limit) {
  const kept = [];
  for (const c of candidates.slice().sort((a, b) => b.score - a.score)) {
    if (kept.length >= limit) break;
    if (kept.every((k) => Math.hypot(k.x - c.x, k.y - c.y) >= gap)) kept.push(c);
  }
  return kept;
}

export function buildFeatures(terrain, hydro, rng) {
  const { N, h, elev, ocean, lake, peakFeet } = terrain;
  const size = N * N;
  const land = new Uint8Array(size);
  const notOcean = new Uint8Array(size);
  const wet = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    land[i] = h[i] > 0 ? 1 : 0;
    notOcean[i] = ocean[i] ? 0 : 1;
    wet[i] = hydro.isRiver[i] || lake[i] ? 1 : 0;
  }
  const coastDist = distanceField(N, ocean); // land: cells to the sea
  const seaDist = distanceField(N, notOcean); // sea: cells to the shore
  const freshDist = distanceField(N, wet); // cells to a river or lake
  const landmass = components(N, (i) => land[i] === 1);

  // Moisture: a climate bias for the whole island, patchy noise, wetter by
  // fresh water and drier on the heights.
  const noise = makeNoise(rng.fork('moisture'));
  const climate = rng.range(-0.16, 0.16);
  const relief = new Uint8Array(size);
  const cover = new Uint8Array(size);
  const moisture = new Float32Array(size);
  const tally = { forest: 0, marsh: 0, hill: 0, mountain: 0 };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (!land[i]) continue;
      const u = (x / (N - 1)) * 2 - 1;
      const v = (y / (N - 1)) * 2 - 1;
      const m =
        0.5 + climate + 0.5 * fbm(noise, u * 2.6, v * 2.6, 4) +
        0.22 * Math.exp(-freshDist[i] / 4) - 0.25 * elev[i];
      moisture[i] = m;
      const feet = elev[i] * peakFeet;
      if (feet >= 1500 && elev[i] >= 0.3) relief[i] = RELIEF_MOUNTAIN;
      else if ((feet >= 350 && elev[i] >= 0.13) || elev[i] >= 0.42) relief[i] = RELIEF_HILL;
      if (relief[i] === RELIEF_FLAT && elev[i] < 0.045 && m > 0.6 && (coastDist[i] < 7 || freshDist[i] < 3)) {
        cover[i] = COVER_MARSH;
      } else if (relief[i] !== RELIEF_MOUNTAIN && m > 0.57) {
        cover[i] = COVER_FOREST;
      }
      if (relief[i] === RELIEF_MOUNTAIN) tally.mountain++;
      else if (relief[i] === RELIEF_HILL) tally.hill++;
      if (cover[i] === COVER_FOREST) tally.forest++;
      else if (cover[i] === COVER_MARSH) tally.marsh++;
    }
  }
  const fractions = {};
  for (const key of Object.keys(tally)) fractions[key] = tally[key] / terrain.landCells;

  // Summits: local maxima of elevation, the highest first.
  const summitCandidates = [];
  const R = 5;
  for (let y = R; y < N - R; y++) {
    for (let x = R; x < N - R; x++) {
      const i = y * N + x;
      const e = elev[i];
      if (e < 0.3) continue;
      let top = true;
      for (let dy = -R; dy <= R && top; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          if (elev[i + dy * N + dx] > e) { top = false; break; }
        }
      }
      if (top) summitCandidates.push({ x, y, score: e, feet: Math.round((e * peakFeet) / 10) * 10 });
    }
  }
  const summits = spaced(summitCandidates, N * 0.11, 3);

  // Headlands and bays, from how much land lies within sight of the shore.
  const landAround = windowAverager(N, land);
  const capeCandidates = [];
  const bayCandidates = [];
  const mainland = landmass.sizes.indexOf(Math.max(...landmass.sizes));
  for (let y = 2; y < N - 2; y++) {
    for (let x = 2; x < N - 2; x++) {
      const i = y * N + x;
      if (land[i] && coastDist[i] <= 1.5 && landmass.sizes[landmass.id[i]] >= 150) {
        // A cape is narrow nearby and still mostly sea from farther off.
        const score = 1 - 0.5 * landAround(x, y, 5) - 0.5 * landAround(x, y, 11);
        if (score > 0.64) capeCandidates.push({ x, y, score, mainland: landmass.id[i] === mainland });
      } else if (ocean[i] && seaDist[i] >= 3 && seaDist[i] <= 8) {
        // A bay is sea with land on most sides.
        const score = landAround(x, y, 12);
        if (score > 0.5) bayCandidates.push({ x, y, score: score + 0.02 * seaDist[i] });
      }
    }
  }
  const capes = spaced(capeCandidates, N * 0.2, 3);
  const bays = spaced(bayCandidates, N * 0.2, 2);

  // The largest wood, marsh and lake earn names of their own.
  const largest = (mask, minimum) => {
    const parts = components(N, (i) => mask(i));
    let best = -1;
    for (let k = 0; k < parts.sizes.length; k++) {
      if (parts.sizes[k] >= minimum && (best === -1 || parts.sizes[k] > parts.sizes[best])) best = k;
    }
    if (best === -1) return null;
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < size; i++) {
      if (parts.id[i] === best) { sx += i % N; sy += Math.floor(i / N); }
    }
    const cells = parts.sizes[best];
    return { x: sx / cells, y: sy / cells, cells };
  };
  const wood = largest((i) => cover[i] === COVER_FOREST, 260);
  const marsh = largest((i) => cover[i] === COVER_MARSH, 90);
  const mere = largest((i) => lake[i] === 1, 14);

  return {
    land, coastDist, seaDist, freshDist, landmass, moisture, relief, cover,
    fractions, summits, capes, bays, wood, marsh, mere, landAround,
  };
}
