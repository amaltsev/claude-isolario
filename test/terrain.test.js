import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/rng.js';
import { contours, smooth, lineLength, polygonArea } from '../src/contour.js';
import { buildTerrain, components, SHAPES, RELIEFS } from '../src/terrain.js';

function disc(N, cx, cy, r) {
  const field = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) field[y * N + x] = r - Math.hypot(x - cx, y - cy);
  }
  return field;
}

test('contour of a disc is one closed loop of the right size', () => {
  const lines = contours(disc(64, 31.3, 30.7, 20), 64, 0);
  assert.equal(lines.length, 1);
  const [loop] = lines;
  assert.ok(loop.closed);
  assert.ok(Math.abs(Math.abs(polygonArea(loop)) - Math.PI * 400) < 12);
  assert.ok(Math.abs(lineLength(loop) - 2 * Math.PI * 20) < 3);
  for (const [x, y] of loop) {
    assert.ok(Math.abs(Math.hypot(x - 31.3, y - 30.7) - 20) < 0.25);
  }
});

test('contour reports which side is inside', () => {
  const field = disc(32, 16, 16, 8);
  const [loop] = contours(field, 32, 0);
  const [inside, outside] = loop.cell;
  assert.ok(field[inside] > 0);
  assert.ok(field[outside] <= 0);
});

test('contour handles separate regions and saddles', () => {
  const N = 40;
  const a = disc(N, 10, 10, 6);
  const b = disc(N, 28, 28, 7);
  const field = a.map((v, i) => Math.max(v, b[i]));
  const lines = contours(field, N, 0);
  assert.equal(lines.length, 2);
  assert.ok(lines.every((l) => l.closed));

  // A checkerboard is all saddles; every line must still close.
  const checker = new Float32Array(100);
  for (let y = 1; y < 9; y++) for (let x = 1; x < 9; x++) checker[y * 10 + x] = (x + y) % 2 ? 1 : -1;
  for (let i = 0; i < 100; i++) if (checker[i] === 0) checker[i] = -1;
  assert.ok(contours(checker, 10, 0).every((l) => l.closed));
});

test('contour that leaves the field comes back as an open line', () => {
  const N = 16;
  const field = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) field[y * N + x] = x - 7.5;
  const lines = contours(field, N, 0);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].closed, false);
  assert.equal(lines[0].length, N);
});

test('smoothing keeps open endpoints and roughly preserves area', () => {
  const open = [[0, 0], [4, 0], [4, 4]];
  const s = smooth(open, 2, false);
  assert.deepEqual(s[0], [0, 0]);
  assert.deepEqual(s[s.length - 1], [4, 4]);

  const [loop] = contours(disc(64, 32, 32, 20), 64, 0);
  const smoothed = smooth(loop, 2);
  assert.ok(smoothed.closed);
  assert.ok(smoothed.length > loop.length * 3);
  const ratio = polygonArea(smoothed) / polygonArea(loop);
  assert.ok(ratio > 0.98 && ratio <= 1.0001);
});

test('components labels 4-connected regions', () => {
  const N = 5;
  const grid = [
    1, 1, 0, 0, 1,
    1, 0, 0, 0, 1,
    0, 0, 1, 0, 0,
    0, 0, 0, 0, 0,
    1, 0, 0, 0, 0,
  ];
  const { id, sizes } = components(N, (i) => grid[i] === 1);
  assert.deepEqual([...sizes].sort(), [1, 1, 2, 3]);
  assert.equal(id[0], id[5]);
  assert.notEqual(id[0], id[4]);
  assert.equal(id[2], -1);
});

test('terrain is deterministic', () => {
  const a = buildTerrain(new Rng('determinism'));
  const b = buildTerrain(new Rng('determinism'));
  assert.deepEqual(a.h, b.h);
  assert.equal(a.shape, b.shape);
  assert.equal(a.peakFeet, b.peakFeet);
});

test('every island sits clear of the sheet edge, with sane proportions', () => {
  const shapes = new Set();
  const reliefs = new Set();
  for (let s = 0; s < 40; s++) {
    const t = buildTerrain(new Rng(`survey-${s}`), { size: 120 });
    const { N, h, elev, ocean, lake } = t;
    shapes.add(t.shape);
    reliefs.add(t.relief);
    let land = 0;
    let maxElev = 0;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const margin = Math.min(x, y, N - 1 - x, N - 1 - y);
        if (margin < 4) assert.ok(ocean[i], `seed ${s}: land near the edge at ${x},${y}`);
        if (h[i] > 0) {
          land++;
          assert.ok(!ocean[i] && !lake[i]);
          assert.ok(elev[i] > 0 && elev[i] <= 1);
          maxElev = Math.max(maxElev, elev[i]);
        } else {
          assert.ok(ocean[i] || lake[i]);
          assert.equal(elev[i], 0);
        }
      }
    }
    assert.equal(land, t.landCells);
    const fraction = land / (N * N);
    assert.ok(fraction > 0.12 && fraction < 0.36, `seed ${s}: land fraction ${fraction}`);
    assert.equal(maxElev, 1);
    assert.ok(t.peakFeet >= 100 && t.peakFeet <= 9000);
    assert.ok(t.widthMiles >= 16 && t.widthMiles <= 150);
    // No specks: every landmass has at least eight cells.
    const parts = components(N, (i) => h[i] > 0);
    assert.ok(Math.min(...parts.sizes) >= 8);
    // Every coastline closes.
    assert.ok(contours(h, N, 0).every((l) => l.closed));
  }
  assert.equal(shapes.size, SHAPES.length);
  assert.equal(reliefs.size, RELIEFS.length);
});
