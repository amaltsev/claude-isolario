import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { bundle, buildExplorer, buildExample, EXAMPLE_SEED } from '../scripts/build.js';
import { generateIsland, summarise, renderSVG, gazetteerText } from '../src/index.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the bundle behaves exactly like the modules', () => {
  const code = bundle();
  assert.ok(!/^\s*(import|export)\b/m.test(code));
  const context = vm.createContext({ Math, JSON, console });
  const Isolario = vm.runInContext(`${code}\nIsolario;`, context);
  for (const name of ['generateIsland', 'renderSVG', 'gazetteer', 'entryHTML', 'randomSeed']) {
    assert.equal(typeof Isolario[name], 'function', name);
  }
  const bundled = Isolario.generateIsland('bundle check', { size: 110 });
  const native = generateIsland('bundle check', { size: 110 });
  assert.equal(JSON.stringify(Isolario.summarise(bundled)), JSON.stringify(summarise(native)));
  assert.equal(Isolario.renderSVG(bundled), renderSVG(native));
  assert.equal(Isolario.gazetteerText(bundled), gazetteerText(native));
});

test('the explorer page is self-contained', async () => {
  const html = await buildExplorer();
  assert.ok(!html.includes('/*BUNDLE*/') && !html.includes('/*PAGE_CSS*/'));
  assert.ok(!/<script[^>]+src=|<link[^>]+href=|@import|https?:\/\/(?!www\.w3\.org)/.test(html), 'no outside resources');
  // Two scripts, both closed; nothing in the bundle ends one early.
  assert.equal(html.match(/<script>/g).length, 2);
  assert.equal(html.match(/<\/script>/g).length, 2);
});

test('committed build outputs are up to date (run `npm run build`)', async () => {
  assert.equal(read('../dist/isolario.html'), await buildExplorer());
  assert.equal(read(`../examples/${EXAMPLE_SEED}.svg`), await buildExample());
});
