#!/usr/bin/env node
// isolario: chart an island that does not exist.

import { writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { parseArgs } from 'node:util';
import { generateIsland, summarise, renderSVG, gazetteerText, gazetteerMarkdown, pageHTML, randomSeed } from '../src/index.js';

const HELP = `isolario: a book of islands that do not exist

Usage
  isolario [seed]                  print the island's gazetteer entry
  isolario [seed] -o chart.svg     write the chart
  isolario [seed] -o island.html   write chart and entry as one page
  isolario [seed] -o entry.md      write the entry as Markdown
  isolario [seed] -f json          print the surveyed facts as JSON

Any text is a seed, and the same seed always gives the same island.
Leave it out and one is drawn for you.

Options
  -o, --out <file>     write to a file; the format follows the extension
                       (.svg, .html, .txt, .md, .json)
  -f, --format <name>  svg, html, text, md or json (default: text)
  -n, --count <n>      survey n islands; with -o, the seed is added to
                       each file name
  -h, --help           show this help
`;

const FORMATS = {
  svg: (island) => renderSVG(island),
  html: (island) => pageHTML(island),
  text: (island) => `${gazetteerText(island)}\n`,
  md: (island) => gazetteerMarkdown(island),
  json: (island) => `${JSON.stringify(summarise(island), null, 2)}\n`,
};
const EXTENSIONS = { '.svg': 'svg', '.html': 'html', '.htm': 'html', '.txt': 'text', '.md': 'md', '.markdown': 'md', '.json': 'json' };

function fail(message) {
  process.stderr.write(`isolario: ${message}\nTry 'isolario --help'.\n`);
  process.exit(2);
}

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      format: { type: 'string', short: 'f' },
      count: { type: 'string', short: 'n' },
      help: { type: 'boolean', short: 'h' },
    },
  });
} catch (error) {
  fail(error.message);
}
const { values, positionals } = args;

if (values.help) {
  process.stdout.write(HELP);
  process.exit(0);
}
if (positionals.length > 1) fail('give one seed (quote it if it has spaces)');

const count = values.count === undefined ? 1 : Number(values.count);
if (!Number.isInteger(count) || count < 1 || count > 500) fail('--count must be a whole number from 1 to 500');

let format = values.format;
if (!format && values.out) {
  format = EXTENSIONS[extname(values.out).toLowerCase()];
  if (!format) fail(`cannot tell the format from '${values.out}'; use --format`);
}
format ??= 'text';
if (format === 'txt') format = 'text';
if (format === 'markdown') format = 'md';
if (!FORMATS[format]) fail(`unknown format '${format}' (expected svg, html, text, md or json)`);

const seeds = [];
for (let k = 0; k < count; k++) {
  if (positionals.length) seeds.push(count === 1 ? positionals[0] : `${positionals[0]}-${k + 1}`);
  else seeds.push(randomSeed());
}

const slug = (seed) => seed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'island';

seeds.forEach((seed, k) => {
  const island = generateIsland(seed);
  const output = FORMATS[format](island);
  if (values.out) {
    let file = values.out;
    if (count > 1) {
      const ext = extname(file);
      file = `${file.slice(0, file.length - ext.length)}-${slug(seed)}${ext}`;
    }
    writeFileSync(file, output);
    process.stderr.write(`${island.name.full} (seed "${seed}") -> ${file}\n`);
  } else {
    if (k > 0 && format === 'text') process.stdout.write(`\n${'~'.repeat(76)}\n\n`);
    if (k > 0 && format === 'md') process.stdout.write('\n');
    process.stdout.write(output);
    if (format === 'svg' || format === 'html') process.stdout.write('\n');
  }
});
