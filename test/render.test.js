import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateIsland } from '../src/island.js';
import { renderSVG, textWidth } from '../src/render.js';

const SEEDS = ['a', 'b', 'c', 'f', 'vessarn', 'last light', '<&>'];
const charts = new Map();
const chart = (seed) => {
  if (!charts.has(seed)) {
    const island = generateIsland(seed, { size: 140 });
    charts.set(seed, { island, svg: renderSVG(island) });
  }
  return charts.get(seed);
};

/** Minimal well-formedness check: every tag opened is closed, in order. */
function checkBalanced(svg) {
  const stack = [];
  const tag = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|[^>"])*?)(\/?)>/g;
  let m;
  while ((m = tag.exec(svg))) {
    const [, closing, name, , selfClosing] = m;
    if (selfClosing) continue;
    if (closing) assert.equal(stack.pop(), name, `unexpected </${name}>`);
    else stack.push(name);
  }
  assert.deepEqual(stack, []);
}

test('text width grows with the text and the size', () => {
  assert.ok(textWidth('Mmmm', 10) > textWidth('illi', 10));
  assert.equal(textWidth('abc', 20), 2 * textWidth('abc', 10));
  assert.ok(textWidth('abc', 10, 0.2) > textWidth('abc', 10));
});

test('charts are well-formed SVG with no stray numbers', () => {
  for (const seed of SEEDS) {
    const { svg } = chart(seed);
    assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
    assert.ok(svg.endsWith('</svg>'));
    assert.ok(!/NaN|undefined|Infinity|\[object/.test(svg), `seed ${seed} leaked a bad value`);
    checkBalanced(svg);
    assert.ok(svg.length < 450_000, `seed ${seed}: ${svg.length} bytes`);
  }
});

test('charts are deterministic', () => {
  const island = generateIsland('again', { size: 120 });
  assert.equal(renderSVG(island), renderSVG(generateIsland('again', { size: 120 })));
});

test('every town is drawn and lettered', () => {
  for (const seed of SEEDS) {
    const { island, svg } = chart(seed);
    for (const t of island.towns) {
      const shown = t.rank === 'capital' ? t.name.toUpperCase() : t.name;
      assert.ok(svg.includes(`>${shown}</text>`), `seed ${seed}: ${t.name} missing`);
    }
    assert.ok(svg.includes(island.name.name.toUpperCase()));
    assert.ok(svg.includes('English Miles'));
  }
});

test('awkward seeds are escaped', () => {
  const { svg } = chart('<&>');
  assert.ok(svg.includes('seed “&lt;&amp;&gt;”'));
  assert.ok(!svg.includes('“<&>”'));
});

test('ids are namespaced per seed so charts can share a page', () => {
  const ids = (svg) => new Set([...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  const a = ids(chart('a').svg);
  const b = ids(chart('b').svg);
  for (const id of a) assert.ok(!b.has(id), `id ${id} collides`);
});
