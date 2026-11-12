import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/rng.js';
import { MinHeap, distanceField, drainage } from '../src/hydrology.js';
import { buildTerrain } from '../src/terrain.js';
import { windowAverager, spaced } from '../src/features.js';
import { makeLanguage, FLAVOUR_NAMES } from '../src/names.js';
import { generateIsland, summarise, bearing, roundish } from '../src/island.js';

const SEEDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'vessarn', 'tern', '42', 'last light'];
const islands = new Map();
const island = (seed) => {
  if (!islands.has(seed)) islands.set(seed, generateIsland(seed, { size: 140 }));
  return islands.get(seed);
};

test('heap pops in ascending order', () => {
  const rng = new Rng('heap');
  const heap = new MinHeap();
  const keys = Array.from({ length: 500 }, () => rng.float());
  keys.forEach((k, i) => heap.push(k, i));
  const out = [];
  while (heap.size) out.push(keys[heap.pop()]);
  assert.deepEqual(out, keys.slice().sort((a, b) => a - b));
});

test('distance field is close to true distance', () => {
  const N = 40;
  const source = new Uint8Array(N * N);
  const points = [[5, 7], [30, 12], [18, 33]];
  for (const [x, y] of points) source[y * N + x] = 1;
  const dist = distanceField(N, source);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const truth = Math.min(...points.map(([px, py]) => Math.hypot(px - x, py - y)));
      const d = dist[y * N + x];
      assert.ok(d >= truth - 1e-4 && d <= truth * 1.09 + 1e-4, `${x},${y}: ${d} vs ${truth}`);
    }
  }
});

test('window averager matches a direct count', () => {
  const N = 12;
  const rng = new Rng('window');
  const mask = Uint8Array.from({ length: N * N }, () => (rng.chance(0.4) ? 1 : 0));
  const average = windowAverager(N, mask);
  for (const [x, y, r] of [[0, 0, 2], [6, 6, 3], [11, 4, 5], [5, 11, 1]]) {
    let sum = 0;
    let count = 0;
    for (let yy = Math.max(0, y - r); yy <= Math.min(N - 1, y + r); yy++) {
      for (let xx = Math.max(0, x - r); xx <= Math.min(N - 1, x + r); xx++) {
        sum += mask[yy * N + xx];
        count++;
      }
    }
    assert.ok(Math.abs(average(x, y, r) - sum / count) < 1e-12);
  }
});

test('spaced keeps the best candidates and honours the gap', () => {
  const kept = spaced(
    [{ x: 0, y: 0, score: 1 }, { x: 1, y: 0, score: 0.9 }, { x: 10, y: 0, score: 0.5 }, { x: 20, y: 0, score: 0.4 }],
    5,
    2,
  );
  assert.deepEqual(kept.map((k) => k.x), [0, 10]);
});

test('bearing and roundish', () => {
  assert.equal(bearing(1, 0), 'east');
  assert.equal(bearing(0, -1), 'north');
  assert.equal(bearing(-1, 1), 'south-west');
  assert.equal(bearing(0.1, 5), 'south');
  assert.equal(roundish(4321), 4300);
  assert.equal(roundish(87), 87);
  assert.equal(roundish(155000), 160000);
  assert.equal(roundish(0.2), 1);
});

test('all water drains to the sea', () => {
  const terrain = buildTerrain(new Rng('drain'), { size: 120 });
  const { N, ocean } = terrain;
  const { down, flux, filled } = drainage(terrain);
  let dry = 0;
  let delivered = 0;
  for (let i = 0; i < N * N; i++) {
    if (ocean[i]) continue;
    dry++;
    assert.ok(down[i] >= 0, 'every dry cell drains somewhere');
    assert.ok(filled[down[i]] < filled[i], 'always downhill');
    if (ocean[down[i]]) delivered += flux[i];
  }
  assert.equal(delivered, dry);
});

test('languages coin distinct, pronounceable names', () => {
  for (const flavour of FLAVOUR_NAMES) {
    const lang = makeLanguage(new Rng(`tongue-${flavour}`), flavour);
    const names = new Set();
    for (let k = 0; k < 12; k++) {
      for (const kind of ['port', 'town', 'river', 'peak']) {
        const n = lang.place(kind);
        assert.ok(n.name.length >= 3 && n.name.length <= 22, n.name);
        assert.match(n.name, /^[A-ZÖÅ]/);
        assert.ok(!names.has(n.name), `duplicate ${n.name}`);
        names.add(n.name);
        assert.equal(n.full, n.article ? `the ${n.name}` : n.name);
      }
    }
  }
});

test('a town at a river mouth can take the river’s name', () => {
  const lang = makeLanguage(new Rng('mouth'), 'saxon');
  const river = lang.place('river');
  const town = lang.place('mouth', river.root);
  assert.equal(town.name, `${river.root}mouth`);
});

test('generation is deterministic and seeds differ', () => {
  const a = JSON.stringify(summarise(generateIsland('twice', { size: 100 })));
  const b = JSON.stringify(summarise(generateIsland('twice', { size: 100 })));
  const c = JSON.stringify(summarise(generateIsland('thrice', { size: 100 })));
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('rivers run downhill from source to mouth', () => {
  let named = 0;
  for (const seed of SEEDS) {
    const { rivers, hydro, terrain } = island(seed);
    for (const r of rivers) {
      assert.ok(r.cells.length >= 4);
      assert.equal(r.points.length, r.flux.length);
      for (let k = 1; k < r.cells.length; k++) {
        assert.equal(hydro.down[r.cells[k - 1]], r.cells[k]);
        assert.ok(hydro.flux[r.cells[k]] >= hydro.flux[r.cells[k - 1]]);
      }
      const end = hydro.down[r.cells[r.cells.length - 1]];
      if (r.into === 'sea') assert.ok(terrain.ocean[end]);
      if (r.into === 'lake') assert.ok(terrain.lake[end]);
      if (r.into === 'river') assert.ok(rivers[r.parent].cells.includes(end));
      if (r.name) named++;
    }
  }
  assert.ok(named >= SEEDS.length, 'most islands should have a named river');
});

test('towns stand on dry land, apart, under one capital', () => {
  for (const seed of SEEDS) {
    const { towns, terrain, features } = island(seed);
    const { N } = terrain;
    assert.ok(towns.length >= 2 && towns.length <= 7, `seed ${seed}: ${towns.length} towns`);
    assert.equal(towns.filter((t) => t.rank === 'capital').length, 1);
    assert.equal(towns[0].rank, 'capital');
    for (const t of towns) {
      assert.ok(features.land[t.y * N + t.x]);
      assert.ok(t.population >= 40);
      assert.ok(t.population <= towns[0].population);
      assert.ok(t.name);
    }
    for (let a = 0; a < towns.length; a++) {
      for (let b = a + 1; b < towns.length; b++) {
        assert.ok(Math.hypot(towns[a].x - towns[b].x, towns[a].y - towns[b].y) >= 11);
      }
    }
  }
});

test('roads keep to the land and join up', () => {
  for (const seed of SEEDS) {
    const { roads, terrain, features, towns } = island(seed);
    const { N } = terrain;
    for (const road of roads) {
      assert.ok(road.points.length >= 2);
      for (let k = 0; k < road.points.length; k++) {
        const [x, y] = road.points[k];
        assert.ok(features.land[y * N + x], 'road in the water');
        if (k > 0) {
          const [px, py] = road.points[k - 1];
          assert.ok(Math.max(Math.abs(x - px), Math.abs(y - py)) === 1, 'road has a gap');
        }
      }
    }
    // Every town that shares a landmass with another is on the network.
    const onRoad = new Set(roads.flatMap((r) => r.points.map(([x, y]) => y * N + x)));
    for (const t of towns) {
      if (towns.some((o) => o !== t && o.mass === t.mass)) {
        assert.ok(onRoad.has(t.y * N + t.x), `seed ${seed}: ${t.name} is cut off`);
      }
    }
  }
});

test('every name on an island is unique', () => {
  for (const seed of SEEDS) {
    const is = island(seed);
    const names = [
      is.name, is.sea, ...is.towns, ...is.peaks, ...is.capes, ...is.bays, ...is.sites,
      ...is.rivers.filter((r) => r.name).map((r) => r.name),
      is.wood, is.marsh, is.mere,
    ].filter(Boolean).map((n) => n.name);
    assert.equal(new Set(names).size, names.length, `seed ${seed}: ${names.join(', ')}`);
  }
});

test('facts are measured, not invented', () => {
  for (const seed of SEEDS) {
    const is = island(seed);
    const { facts, terrain } = is;
    assert.ok(facts.areaSqMiles > 5 && facts.areaSqMiles < 8000);
    // A coast is never shorter than the circle enclosing the same area.
    assert.ok(facts.coastMiles >= 2 * Math.sqrt(Math.PI * facts.areaSqMiles) * 0.9);
    assert.ok(facts.lengthMiles <= terrain.widthMiles * Math.SQRT2);
    assert.ok(facts.peakFeet > 0 && facts.peakFeet <= terrain.peakFeet);
    assert.ok(facts.forest >= 0 && facts.forest <= 1);
    const summary = summarise(is);
    assert.doesNotThrow(() => JSON.stringify(summary));
    assert.equal(summary.towns.length, is.towns.length);
  }
});
