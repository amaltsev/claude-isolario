// Terrain: a height field whose zero level is the sea. An island is a few
// soft blobs, roughened by fractal noise, with a guard band that keeps the
// land away from the edge of the sheet.

import { makeNoise, fbm, ridged } from './noise.js';

export const SHAPES = ['round', 'long', 'crescent', 'twin', 'shattered'];
export const RELIEFS = ['lowland', 'downs', 'highland', 'alpine'];

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function shapeParams(shape, rng) {
  switch (shape) {
    case 'long':
      return {
        blobs: [{ x: 0, y: 0, rx: rng.range(0.74, 0.84), ry: rng.range(0.3, 0.38) }],
        bites: [],
        amp: 0.42,
        freq: 1.7,
        landFraction: rng.range(0.19, 0.25),
      };
    case 'crescent': {
      const a = rng.range(0, 2 * Math.PI);
      const r = rng.range(0.34, 0.44);
      return {
        blobs: [{ x: 0, y: 0, rx: 0.7, ry: rng.range(0.6, 0.7) }],
        bites: [{ x: r * Math.cos(a), y: r * Math.sin(a), rx: 0.4, ry: 0.4, depth: 2.2 }],
        amp: 0.4,
        freq: 1.6,
        landFraction: rng.range(0.19, 0.25),
      };
    }
    case 'twin': {
      const gap = rng.range(0.3, 0.38);
      return {
        blobs: [
          { x: -gap, y: rng.range(-0.08, 0.08), rx: rng.range(0.38, 0.46), ry: rng.range(0.36, 0.44) },
          { x: gap, y: rng.range(-0.08, 0.08), rx: rng.range(0.3, 0.4), ry: rng.range(0.3, 0.38) },
        ],
        bites: [],
        amp: 0.42,
        freq: 1.8,
        landFraction: rng.range(0.2, 0.27),
      };
    }
    case 'shattered':
      return {
        blobs: [{ x: 0, y: 0, rx: 0.74, ry: rng.range(0.58, 0.7) }],
        bites: [],
        amp: 0.95,
        freq: 2.3,
        landFraction: rng.range(0.16, 0.21),
      };
    default:
      return {
        blobs: [{ x: 0, y: 0, rx: 0.64, ry: rng.range(0.52, 0.64) }],
        bites: [],
        amp: 0.5,
        freq: 1.5,
        landFraction: rng.range(0.24, 0.31),
      };
  }
}

const RELIEF_PARAMS = {
  lowland: { ridge: 0.5, feet: [240, 700] },
  downs: { ridge: 1.1, feet: [700, 1800] },
  highland: { ridge: 1.9, feet: [1800, 4200] },
  alpine: { ridge: 2.8, feet: [4200, 8800] },
};

/** Label 4-connected regions where `test(i)` holds. Returns ids and sizes. */
export function components(N, test) {
  const id = new Int32Array(N * N).fill(-1);
  const sizes = [];
  const stack = [];
  for (let start = 0; start < N * N; start++) {
    if (id[start] !== -1 || !test(start)) continue;
    const label = sizes.length;
    let size = 0;
    id[start] = label;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop();
      size++;
      const x = i % N;
      if (x > 0 && id[i - 1] === -1 && test(i - 1)) { id[i - 1] = label; stack.push(i - 1); }
      if (x < N - 1 && id[i + 1] === -1 && test(i + 1)) { id[i + 1] = label; stack.push(i + 1); }
      if (i >= N && id[i - N] === -1 && test(i - N)) { id[i - N] = label; stack.push(i - N); }
      if (i < N * N - N && id[i + N] === -1 && test(i + N)) { id[i + N] = label; stack.push(i + N); }
    }
    sizes.push(size);
  }
  return { id, sizes };
}

export function buildTerrain(rng, { size = 200 } = {}) {
  const N = size;
  const shape = rng.weighted([['round', 3], ['long', 3], ['crescent', 2], ['twin', 2], ['shattered', 2]]);
  const relief = rng.weighted([['lowland', 2], ['downs', 3], ['highland', 3], ['alpine', 2]]);
  const params = shapeParams(shape, rng.fork('shape'));
  const heightNoise = makeNoise(rng.fork('height'));
  const warpNoise = makeNoise(rng.fork('warp'));
  const ridgeNoise = makeNoise(rng.fork('ridge'));
  const theta = rng.range(0, Math.PI);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x / (N - 1)) * 2 - 1;
      const v = (y / (N - 1)) * 2 - 1;
      // Warp the domain a little so the blobs lose their symmetry.
      const wu = u + 0.16 * warpNoise(u * 1.1 + 5.2, v * 1.1 - 1.3);
      const wv = v + 0.16 * warpNoise(u * 1.1 - 8.4, v * 1.1 + 3.9);
      const ru = wu * cos + wv * sin;
      const rv = -wu * sin + wv * cos;
      let base = -Infinity;
      for (const b of params.blobs) {
        const d = Math.hypot((ru - b.x) / b.rx, (rv - b.y) / b.ry);
        base = Math.max(base, 1 - d);
      }
      for (const b of params.bites) {
        const d = Math.hypot((ru - b.x) / b.rx, (rv - b.y) / b.ry);
        base -= b.depth * Math.max(0, 1 - d);
      }
      const rough = fbm(heightNoise, u * params.freq, v * params.freq, 6);
      const edge = Math.max(Math.abs(u), Math.abs(v));
      h[y * N + x] = base + params.amp * rough - 3 * smoothstep(0.74, 0.95, edge);
    }
  }

  // Put the sea level where it leaves the chosen fraction of the sheet dry.
  const sorted = Float32Array.from(h).sort();
  const seaLevel = sorted[Math.floor((1 - params.landFraction) * (N * N - 1))];
  for (let i = 0; i < N * N; i++) h[i] -= seaLevel;

  // Drown specks of land, and fill puddles too small to be worth a name.
  const landParts = components(N, (i) => h[i] > 0);
  for (let i = 0; i < N * N; i++) {
    if (h[i] > 0 && landParts.sizes[landParts.id[i]] < 8) h[i] = -0.02;
  }
  const waterParts = components(N, (i) => h[i] <= 0);
  const oceanId = waterParts.id[0];
  const ocean = new Uint8Array(N * N);
  const lake = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) {
    if (h[i] > 0) continue;
    const part = waterParts.id[i];
    if (part === oceanId) ocean[i] = 1;
    else if (waterParts.sizes[part] < 14) h[i] = 0.01;
    else lake[i] = 1;
  }

  // Elevation: the island swell, with ridged noise raising crests inland.
  const { ridge, feet } = RELIEF_PARAMS[relief];
  const elev = new Float32Array(N * N);
  let elevMax = 0;
  let landCells = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (h[i] <= 0) continue;
      landCells++;
      const u = (x / (N - 1)) * 2 - 1;
      const v = (y / (N - 1)) * 2 - 1;
      const r = ridged(ridgeNoise, u * 2.4, v * 2.4, 4);
      elev[i] = h[i] * (0.5 + ridge * r * r);
      if (elev[i] > elevMax) elevMax = elev[i];
    }
  }
  for (let i = 0; i < N * N; i++) elev[i] /= elevMax;

  // Real-world scale. Small sheets hold small islands: scale the summit so
  // a ten-mile islet does not carry an alp.
  const scaleRng = rng.fork('scale');
  const widthMiles = Math.round(Math.exp(scaleRng.range(Math.log(16), Math.log(150))));
  const sizeFactor = Math.min(1, 0.45 + widthMiles / 110);
  const peakFeet = Math.round((scaleRng.range(feet[0], feet[1]) * sizeFactor) / 10) * 10;

  return {
    N,
    shape,
    relief,
    h,
    elev, // 0..1 on land, 0 on water
    ocean,
    lake,
    landCells,
    peakFeet,
    widthMiles,
    milesPerCell: widthMiles / (N - 1),
  };
}
