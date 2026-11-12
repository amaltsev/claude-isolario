// Hydrology: where the rain goes. Depressions are filled with a priority
// flood from the sea, every cell drains to its steepest lower neighbour, and
// cells that collect enough flow become rivers.

export class MinHeap {
  constructor() {
    this.keys = [];
    this.ids = [];
  }
  get size() {
    return this.ids.length;
  }
  push(key, id) {
    const { keys, ids } = this;
    let i = ids.length;
    keys.push(key);
    ids.push(id);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      keys[i] = keys[p];
      ids[i] = ids[p];
      i = p;
    }
    keys[i] = key;
    ids[i] = id;
  }
  pop() {
    const { keys, ids } = this;
    const top = ids[0];
    const key = keys.pop();
    const id = ids.pop();
    const n = ids.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= key) break;
        keys[i] = keys[c];
        ids[i] = ids[c];
        i = c;
      }
      keys[i] = key;
      ids[i] = id;
    }
    return top;
  }
}

const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];
const DIST = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2];

/** Call fn(neighbourIndex, direction) for the up-to-eight neighbours of i. */
export function eachNeighbour(N, i, fn) {
  const x = i % N;
  const y = (i - x) / N;
  for (let d = 0; d < 8; d++) {
    const nx = x + DX[d];
    const ny = y + DY[d];
    if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
    fn(ny * N + nx, d);
  }
}

/**
 * Drainage for a terrain. Returns:
 *   filled  surface with every pit raised to its spill level
 *   down    index each cell drains to (-1 for the open sea)
 *   flux    number of cells draining through each cell, itself included
 */
export function drainage(terrain) {
  const { N, elev, ocean } = terrain;
  const size = N * N;
  const EPS = 1e-6;
  const filled = new Float64Array(size);
  const closed = new Uint8Array(size);
  const parent = new Int32Array(size).fill(-1);
  const heap = new MinHeap();

  for (let i = 0; i < size; i++) {
    if (!ocean[i]) continue;
    closed[i] = 1;
    let shore = false;
    eachNeighbour(N, i, (n) => {
      if (!ocean[n]) shore = true;
    });
    if (shore) heap.push(0, i);
  }
  const order = []; // non-ocean cells, lowest spill level first
  while (heap.size) {
    const c = heap.pop();
    eachNeighbour(N, c, (n) => {
      if (closed[n]) return;
      closed[n] = 1;
      filled[n] = Math.max(elev[n], filled[c] + EPS);
      parent[n] = c;
      order.push(n);
      heap.push(filled[n], n);
    });
  }

  const down = new Int32Array(size).fill(-1);
  for (const i of order) {
    let best = parent[i];
    let bestSlope = 0;
    eachNeighbour(N, i, (n, d) => {
      const slope = (filled[i] - filled[n]) / DIST[d];
      if (slope > bestSlope) {
        bestSlope = slope;
        best = n;
      }
    });
    down[i] = best;
  }

  const flux = new Float32Array(size);
  const byHeight = order.slice().sort((a, b) => filled[b] - filled[a]);
  for (const i of byHeight) {
    flux[i] += 1;
    flux[down[i]] += flux[i];
  }
  return { filled, down, flux };
}

/**
 * Trace rivers from their mouths upstream. Each river is
 *   { cells, points, flux, mouth, into, parent }
 * with points running from source to mouth in lattice units. `into` is
 * 'sea', 'lake' or 'river'; `parent` is the index of the river it joins.
 */
export function traceRivers(terrain, { down, flux }, rng) {
  const { N, h, ocean, lake, landCells } = terrain;
  const size = N * N;
  const threshold = Math.min(180, Math.max(30, landCells * 0.013));
  const isRiver = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    if (!ocean[i] && !lake[i] && flux[i] >= threshold) isRiver[i] = 1;
  }
  const upstream = new Map();
  const mouths = [];
  for (let i = 0; i < size; i++) {
    if (!isRiver[i]) continue;
    const d = down[i];
    if (isRiver[d]) {
      if (!upstream.has(d)) upstream.set(d, []);
      upstream.get(d).push(i);
    } else {
      mouths.push(i);
    }
  }
  mouths.sort((a, b) => flux[b] - flux[a]);

  const xy = (i) => [i % N, Math.floor(i / N)];
  // Wander off the lattice a little so rivers do not betray the grid.
  // A cell keeps its wobble, so a tributary meets its parent exactly.
  const wobbled = new Map();
  const wobble = (i) => {
    if (!wobbled.has(i)) {
      const [x, y] = xy(i);
      wobbled.set(i, [x + rng.range(-0.3, 0.3), y + rng.range(-0.3, 0.3)]);
    }
    return wobbled.get(i);
  };

  const rivers = [];
  const riverOf = new Int32Array(size).fill(-1);
  const pending = mouths.map((start) => ({ start, parent: -1 }));
  while (pending.length) {
    const { start, parent } = pending.shift();
    const cells = [start];
    const branches = [];
    let c = start;
    for (;;) {
      const ups = upstream.get(c);
      if (!ups) break;
      ups.sort((a, b) => flux[b] - flux[a]);
      for (let k = 1; k < ups.length; k++) branches.push(ups[k]);
      c = ups[0];
      cells.push(c);
    }
    // Drop twigs, and anything that hangs off a twig we dropped.
    if (cells.length < (parent === -1 ? 5 : 4)) continue;

    const index = rivers.length;
    cells.reverse(); // source first
    const points = cells.map(wobble);
    const fluxes = cells.map((i) => flux[i]);
    const source = cells[0];
    // A river that begins at a lake outlet should be drawn from the lake.
    let fromLake = false;
    eachNeighbour(N, source, (n) => {
      if (!fromLake && lake[n] && down[n] === source) {
        points.unshift(xy(n));
        fluxes.unshift(flux[source]);
        fromLake = true;
      }
    });
    const end = down[start];
    const into = parent !== -1 ? 'river' : lake[end] ? 'lake' : 'sea';
    // Run on to the cell it drains into; the renderer clips at the shore.
    points.push(into === 'river' ? wobble(end) : xy(end));
    fluxes.push(flux[start]);
    // The mouth proper is where the last reach crosses the waterline.
    const [ax, ay] = xy(start);
    const [bx, by] = xy(end);
    const t = into === 'river' ? 1 : h[start] / (h[start] - h[end]);
    const mouth = [ax + t * (bx - ax), ay + t * (by - ay)];
    for (const cell of cells) riverOf[cell] = index;
    rivers.push({ cells, points, flux: fluxes, mouth, into, parent, fromLake });
    for (const b of branches) pending.push({ start: b, parent: index });
  }

  // Keep the mask in step with what was actually kept.
  for (let i = 0; i < size; i++) isRiver[i] = riverOf[i] !== -1 ? 1 : 0;
  return { rivers, isRiver, riverOf, threshold };
}

/**
 * Chamfer distance (in cells) from every cell to the nearest cell where
 * `source[i]` is truthy. Cheap, and accurate to a few percent.
 */
export function distanceField(N, source) {
  const size = N * N;
  const dist = new Float32Array(size).fill(1e9);
  for (let i = 0; i < size; i++) if (source[i]) dist[i] = 0;
  const A = 1;
  const B = Math.SQRT2;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      let d = dist[i];
      if (x > 0) d = Math.min(d, dist[i - 1] + A);
      if (y > 0) {
        d = Math.min(d, dist[i - N] + A);
        if (x > 0) d = Math.min(d, dist[i - N - 1] + B);
        if (x < N - 1) d = Math.min(d, dist[i - N + 1] + B);
      }
      dist[i] = d;
    }
  }
  for (let y = N - 1; y >= 0; y--) {
    for (let x = N - 1; x >= 0; x--) {
      const i = y * N + x;
      let d = dist[i];
      if (x < N - 1) d = Math.min(d, dist[i + 1] + A);
      if (y < N - 1) {
        d = Math.min(d, dist[i + N] + A);
        if (x < N - 1) d = Math.min(d, dist[i + N + 1] + B);
        if (x > 0) d = Math.min(d, dist[i + N - 1] + B);
      }
      dist[i] = d;
    }
  }
  return dist;
}
