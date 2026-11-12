import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateIsland } from '../src/island.js';
import { gazetteer, gazetteerText, gazetteerMarkdown } from '../src/gazetteer.js';
import { entryHTML, pageHTML } from '../src/page.js';
import { randomSeed } from '../src/seeds.js';

const CLI = fileURLToPath(new URL('../bin/isolario.js', import.meta.url));
const SEEDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'vessarn', 'tern', '42', 'last light'];
const islands = new Map();
const island = (seed) => {
  if (!islands.has(seed)) islands.set(seed, generateIsland(seed, { size: 140 }));
  return islands.get(seed);
};

test('entries are complete, clean prose', () => {
  for (const seed of SEEDS) {
    const g = gazetteer(island(seed));
    const headings = g.sections.map((s) => s.heading);
    for (const wanted of ['Situation', 'The land', 'Waters', 'Towns', 'Livelihood', 'For the mariner']) {
      assert.ok(headings.includes(wanted), `seed ${seed}: no ${wanted}`);
    }
    for (const s of g.sections) {
      assert.ok(!/undefined|NaN|null|\[object/.test(s.text), `seed ${seed}: ${s.text}`);
      assert.ok(!/ {2}| [,.;]|\.\./.test(s.text), `seed ${seed}: untidy: ${s.text}`);
      assert.match(s.text, /^[A-ZÖÅ]/);
      assert.match(s.text, /\.$/);
    }
  }
});

test('entries state what the survey found', () => {
  for (const seed of SEEDS) {
    const is = island(seed);
    const g = gazetteer(is);
    const section = (h) => g.sections.find((s) => s.heading === h).text;
    for (const t of is.towns) assert.ok(section('Towns').includes(t.name), `seed ${seed}: ${t.name}`);
    assert.ok(section('Towns').startsWith(is.towns[0].name));
    for (const r of is.rivers.filter((x) => x.name)) assert.ok(section('Waters').includes(r.name.name));
    if (is.peaks[0]) {
      assert.ok(section('The land').includes(is.peaks[0].name));
      assert.ok(section('The land').includes(is.peaks[0].feet.toLocaleString('en-GB')));
    }
    assert.ok(section('Situation').includes(is.sea.full));
    const table = Object.fromEntries(g.table);
    assert.equal(table.Seed, seed);
    assert.equal(table['Chief town'], is.towns[0].name);
    // A town named for a river mouth really does sit at that river's mouth.
    for (const t of is.towns) {
      if (t.river >= 0 && is.rivers[t.river].name && t.name.toLowerCase().includes(is.rivers[t.river].name.root.toLowerCase())) {
        const r = is.rivers[t.river];
        assert.ok(Math.hypot(r.mouth[0] - t.x, r.mouth[1] - t.y) < 4);
      }
    }
  }
});

test('plain text wraps to the requested width', () => {
  const text = gazetteerText(island('vessarn'), 60);
  for (const line of text.split('\n')) assert.ok(line.length <= 60, line);
  assert.equal(text, gazetteerText(island('vessarn'), 60));
});

test('markdown carries the whole entry, one paragraph per line', () => {
  for (const seed of SEEDS) {
    const is = island(seed);
    const g = gazetteer(is);
    const text = gazetteerMarkdown(is);
    const lines = text.split('\n');
    assert.equal(lines[0], `# ${g.title}`);
    assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'));
    for (const [k, v] of g.table) assert.ok(lines.includes(`- **${k}:** ${v}`), `seed ${seed}: ${k}`);
    for (const s of g.sections) {
      const at = lines.indexOf(`## ${s.heading}`);
      assert.ok(at > 0, `seed ${seed}: ${s.heading}`);
      assert.deepEqual(lines.slice(at - 1, at + 4), ['', `## ${s.heading}`, '', s.text, '']);
    }
  }
  assert.equal(gazetteerMarkdown(island('tern')), gazetteerMarkdown(island('tern')));
});

test('markdown links back to the island only when told where it lives', () => {
  const is = island('tern');
  const closing = (text) => text.trimEnd().split('\n').at(-1);
  assert.equal(closing(gazetteerMarkdown(is)), '*An entry from the Isolario, a book of islands that do not exist.*');
  assert.ok(!gazetteerMarkdown(is).includes(']('));
  assert.equal(
    closing(gazetteerMarkdown(is, { link: 'https://example.org/isolario.html#tern' })),
    '*An entry from the Isolario, a book of islands that do not exist. [Open this entry with its chart](https://example.org/isolario.html#tern).*',
  );
  const awkward = gazetteerMarkdown(is, { link: 'https://example.org/a (b)<c>#x' });
  assert.ok(awkward.includes('](https://example.org/a%20%28b%29%3Cc%3E#x).*'));
});

test('markdown escapes seeds that look like markup', () => {
  const text = gazetteerMarkdown(generateIsland('*bold* | `tick` <b>\n# heading', { size: 100 }));
  assert.ok(text.includes('- **Seed:** \\*bold\\* \\| \\`tick\\` \\<b\\> \\# heading'));
  assert.equal(text.split('\n').filter((line) => /^#+ /.test(line)).length, 1 + gazetteer(island('a')).sections.length);
});

test('pages escape hostile seeds', () => {
  const hostile = generateIsland('<img src=x onerror=alert(1)>"', { size: 100 });
  const html = pageHTML(hostile);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.startsWith('<!doctype html>'));
  const fragment = entryHTML(hostile);
  assert.ok(fragment.includes('<figure class="chart"><svg'));
  assert.ok(fragment.includes('<dl class="facts">'));
});

test('random seeds are two plain words', () => {
  let k = 0;
  const fake = () => [0, 0.999][k++ % 2];
  assert.equal(randomSeed(fake), 'amber-wreck');
  for (let i = 0; i < 50; i++) assert.match(randomSeed(), /^[a-z]+-[a-z]+$/);
});

test('command line: text, json and files', () => {
  const run = (...args) => execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const text = run('vessarn');
  assert.ok(text.includes('SITUATION'));
  assert.equal(text, run('vessarn'));
  const data = JSON.parse(run('vessarn', '-f', 'json'));
  assert.equal(data.seed, 'vessarn');
  assert.ok(data.towns.length >= 2);
  assert.ok(run('vessarn', '--format', 'svg').startsWith('<svg'));
  assert.equal(run('vessarn', '-f', 'md'), gazetteerMarkdown(generateIsland('vessarn')));
  assert.ok(run('--help').includes('Usage'));

  const dir = mkdtempSync(join(tmpdir(), 'isolario-'));
  run('vessarn', '-o', join(dir, 'one.svg'));
  assert.ok(readFileSync(join(dir, 'one.svg'), 'utf8').startsWith('<svg'));
  run('vessarn', '-o', join(dir, 'one.md'));
  assert.ok(readFileSync(join(dir, 'one.md'), 'utf8').startsWith('# '));
  run('fleet', '-n', '3', '-o', join(dir, 'many.html'));
  assert.deepEqual(readdirSync(dir).sort(), ['many-fleet-1.html', 'many-fleet-2.html', 'many-fleet-3.html', 'one.md', 'one.svg']);
  rmSync(dir, { recursive: true });
});

test('command line: bad input exits 2 with a hint', () => {
  for (const args of [['a', 'b'], ['-f', 'pdf'], ['-o', 'chart.xyz'], ['-n', '0'], ['--bogus']]) {
    const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2, args.join(' '));
    assert.ok(result.stderr.includes("Try 'isolario --help'"));
    assert.equal(result.stdout, '');
  }
});
