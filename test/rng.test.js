import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/rng.js';
import { makeNoise, fbm, ridged } from '../src/noise.js';

test('same seed, same stream', () => {
  const a = new Rng('vessarn');
  const b = new Rng('vessarn');
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});

test('different seeds diverge', () => {
  const a = new Rng('vessarn');
  const b = new Rng('vessarm');
  let same = 0;
  for (let i = 0; i < 100; i++) if (a.next() === b.next()) same++;
  assert.equal(same, 0);
});

test('float is uniform on [0, 1)', () => {
  const rng = new Rng('uniform');
  const buckets = new Array(10).fill(0);
  const n = 20000;
  for (let i = 0; i < n; i++) {
    const f = rng.float();
    assert.ok(f >= 0 && f < 1);
    buckets[Math.floor(f * 10)]++;
  }
  for (const count of buckets) assert.ok(Math.abs(count - n / 10) < n / 100);
});

test('int covers both ends of its range', () => {
  const rng = new Rng('ints');
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(rng.int(3, 6));
  assert.deepEqual([...seen].sort(), [3, 4, 5, 6]);
});

test('fork ignores how much of the parent was consumed', () => {
  const a = new Rng('root');
  const b = new Rng('root');
  for (let i = 0; i < 37; i++) b.next();
  assert.equal(a.fork('names').next(), b.fork('names').next());
  assert.notEqual(a.fork('names').next(), a.fork('terrain').next());
});

test('weighted respects weights', () => {
  const rng = new Rng('weights');
  let heavy = 0;
  for (let i = 0; i < 2000; i++) {
    if (rng.weighted([['heavy', 9], ['light', 1]]) === 'heavy') heavy++;
  }
  assert.ok(heavy > 1700 && heavy < 1900);
});

test('noise is deterministic, bounded and centred', () => {
  const n1 = makeNoise(new Rng('noise'));
  const n2 = makeNoise(new Rng('noise'));
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  for (let y = 0; y < 120; y++) {
    for (let x = 0; x < 120; x++) {
      const v = n1(x * 0.173, y * 0.173);
      assert.equal(v, n2(x * 0.173, y * 0.173));
      min = Math.min(min, v);
      max = Math.max(max, v);
      sum += v;
      count++;
    }
  }
  assert.ok(min >= -1.01 && max <= 1.01, `range ${min}..${max}`);
  assert.ok(max - min > 1.5, 'noise should use most of its range');
  assert.ok(Math.abs(sum / count) < 0.05);
});

test('noise is continuous', () => {
  const noise = makeNoise(new Rng('smooth'));
  for (let i = 0; i < 500; i++) {
    const x = i * 0.37;
    const y = i * 0.11;
    assert.ok(Math.abs(noise(x, y) - noise(x + 1e-4, y + 1e-4)) < 1e-2);
  }
});

test('fbm and ridged stay in range', () => {
  const noise = makeNoise(new Rng('fractal'));
  for (let i = 0; i < 2000; i++) {
    const x = (i % 50) * 0.21;
    const y = Math.floor(i / 50) * 0.21;
    const f = fbm(noise, x, y, 6);
    const r = ridged(noise, x, y, 4);
    assert.ok(f >= -1.01 && f <= 1.01);
    assert.ok(r >= 0 && r <= 1.01);
  }
});
