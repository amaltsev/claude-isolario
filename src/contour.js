// Marching squares and polyline utilities. Fields are flat arrays of N×N
// samples on a lattice; contour coordinates are in lattice units.

// Cell edges: 0 top, 1 right, 2 bottom, 3 left. Each case lists edge pairs.
const T = 0;
const R = 1;
const B = 2;
const L = 3;
const CASES = [
  [], [[L, B]], [[B, R]], [[L, R]],
  [[T, R]], null, [[T, B]], [[T, L]],
  [[T, L]], [[T, B]], null, [[T, R]],
  [[L, R]], [[B, R]], [[L, B]], [],
];

/**
 * Trace the iso-lines of `field` at `level`. Returns a list of polylines,
 * each an array of [x, y] with a boolean `closed` property and a `cell`
 * property naming one lattice point just inside the line (value > level)
 * and one just outside, as [insideIndex, outsideIndex].
 */
export function contours(field, N, level = 0) {
  // A crossing lives on a lattice edge. Horizontal edge from (x, y) has id
  // 2 * (y * N + x); the vertical edge from (x, y) has that id plus one.
  const links = new Int32Array(4 * N * N).fill(-1);
  const edgeId = (x, y, side) => {
    switch (side) {
      case T: return 2 * (y * N + x);
      case R: return 2 * (y * N + x + 1) + 1;
      case B: return 2 * ((y + 1) * N + x);
      default: return 2 * (y * N + x) + 1;
    }
  };
  const link = (a, b) => {
    links[2 * a + (links[2 * a] === -1 ? 0 : 1)] = b;
    links[2 * b + (links[2 * b] === -1 ? 0 : 1)] = a;
  };

  for (let y = 0; y < N - 1; y++) {
    for (let x = 0; x < N - 1; x++) {
      const tl = field[y * N + x];
      const tr = field[y * N + x + 1];
      const br = field[(y + 1) * N + x + 1];
      const bl = field[(y + 1) * N + x];
      const index =
        (tl > level ? 8 : 0) | (tr > level ? 4 : 0) | (br > level ? 2 : 0) | (bl > level ? 1 : 0);
      let segments = CASES[index];
      if (segments === null) {
        // Saddle: let the cell centre decide which pair of corners connects.
        const centreInside = (tl + tr + br + bl) / 4 > level;
        const joinsTrBl = index === 5;
        segments =
          centreInside === joinsTrBl ? [[T, L], [B, R]] : [[T, R], [L, B]];
      }
      for (const [a, b] of segments) link(edgeId(x, y, a), edgeId(x, y, b));
    }
  }

  const point = (id) => {
    const cell = id >> 1;
    const x = cell % N;
    const y = (cell - x) / N;
    const other = id & 1 ? cell + N : cell + 1;
    const a = field[cell];
    const b = field[other];
    const t = (level - a) / (b - a);
    return id & 1 ? [x, y + t] : [x + t, y];
  };
  const sides = (id) => {
    const cell = id >> 1;
    const other = id & 1 ? cell + N : cell + 1;
    return field[cell] > level ? [cell, other] : [other, cell];
  };

  const visited = new Uint8Array(2 * N * N);
  const lines = [];
  const walk = (start) => {
    const line = [];
    let prev = -1;
    let cur = start;
    while (cur !== -1 && !visited[cur]) {
      visited[cur] = 1;
      line.push(point(cur));
      const a = links[2 * cur];
      const b = links[2 * cur + 1];
      const next = a !== prev ? a : b;
      prev = cur;
      cur = next;
    }
    line.closed = cur === start;
    line.cell = sides(start);
    return line;
  };
  // Open lines first (they start at a dangling end), then closed loops.
  for (let id = 0; id < 2 * N * N; id++) {
    if (!visited[id] && links[2 * id] !== -1 && links[2 * id + 1] === -1) lines.push(walk(id));
  }
  for (let id = 0; id < 2 * N * N; id++) {
    if (!visited[id] && links[2 * id] !== -1) lines.push(walk(id));
  }
  return lines;
}

/** Chaikin corner cutting. Open lines keep their endpoints. */
export function smooth(line, iterations = 1, closed = line.closed ?? false) {
  let pts = line;
  for (let it = 0; it < iterations; it++) {
    const n = pts.length;
    if (n < 3) break;
    const out = [];
    const last = closed ? n : n - 1;
    if (!closed) out.push(pts[0]);
    for (let i = 0; i < last; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % n];
      out.push([0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by]);
      out.push([0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by]);
    }
    if (!closed) out.push(pts[n - 1]);
    pts = out;
  }
  if (pts !== line) {
    pts.closed = closed;
    if (line.cell) pts.cell = line.cell;
  }
  return pts;
}

/** Length of a polyline, including the closing segment when closed. */
export function lineLength(line, closed = line.closed ?? false) {
  let total = 0;
  const n = line.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = line[i];
    const b = line[(i + 1) % n];
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

/** Signed area of a closed polyline (shoelace). */
export function polygonArea(line) {
  let sum = 0;
  for (let i = 0, n = line.length; i < n; i++) {
    const a = line[i];
    const b = line[(i + 1) % n];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}
