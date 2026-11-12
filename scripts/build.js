#!/usr/bin/env node
// Build dist/isolario.html: the explorer as one self-contained file that
// opens straight from disk. The bundler is deliberately tiny. It understands
// exactly the module syntax this project uses (named imports and exports of
// relative files) and refuses anything else rather than guess.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const bindings = (list) =>
  list.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [from, to] = s.split(/\s+as\s+/);
    return { from, to: to ?? from };
  });

/** Bundle the ES modules reachable from src/<entry> into one script. */
export function bundle(entry = 'index.js', globalName = 'Isolario') {
  const done = new Map();
  const order = [];

  const visit = (file) => {
    if (done.has(file)) return;
    done.set(file, null);
    let code = readFileSync(join(ROOT, 'src', file), 'utf8');
    const exported = [];

    // export { a, b } from './x.js';
    code = code.replace(/^export\s*\{([^}]*)\}\s*from\s*'\.\/([^']+)';?$/gm, (_, names, dep) => {
      visit(dep);
      for (const { from, to } of bindings(names)) exported.push(`${to}: __modules[${JSON.stringify(dep)}].${from}`);
      return '';
    });
    // import { a, b as c } from './x.js';
    code = code.replace(/^import\s*\{([^}]*)\}\s*from\s*'\.\/([^']+)';?$/gm, (_, names, dep) => {
      visit(dep);
      const picks = bindings(names).map(({ from, to }) => (from === to ? from : `${from}: ${to}`));
      return `const { ${picks.join(', ')} } = __modules[${JSON.stringify(dep)}];`;
    });
    // export function f / export const c / export class C
    code = code.replace(/^export\s+(function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm, (_, kind, name) => {
      exported.push(name);
      return `${kind} ${name}`;
    });

    const leftover = code.match(/^\s*(import|export)\b.*$/m);
    if (leftover) throw new Error(`${file}: unsupported module syntax: ${leftover[0].trim()}`);

    done.set(file, `__modules[${JSON.stringify(file)}] = (() => {\n${code}\nreturn { ${exported.join(', ')} };\n})();`);
    order.push(file);
  };
  visit(entry);

  return [
    `const ${globalName} = (() => {`,
    "'use strict';",
    'const __modules = {};',
    ...order.map((file) => done.get(file)),
    `return __modules[${JSON.stringify(entry)}];`,
    '})();',
  ].join('\n');
}

/** The explorer page with the bundle and stylesheet inlined. */
export async function buildExplorer() {
  const { PAGE_CSS } = await import(pathToFileURL(join(ROOT, 'src', 'page.js')).href);
  const template = readFileSync(join(ROOT, 'web', 'index.html'), 'utf8');
  const script = bundle().replace(/<\/script/gi, '<\\/script');
  for (const marker of ['/*PAGE_CSS*/', '/*BUNDLE*/']) {
    if (template.split(marker).length !== 2) throw new Error(`web/index.html must contain ${marker} exactly once`);
  }
  return template.replace('/*PAGE_CSS*/', () => PAGE_CSS).replace('/*BUNDLE*/', () => script);
}

/** The chart shown in the README. */
export const EXAMPLE_SEED = 'old-compass';
export async function buildExample() {
  const { generateIsland, renderSVG } = await import(pathToFileURL(join(ROOT, 'src', 'index.js')).href);
  return `${renderSVG(generateIsland(EXAMPLE_SEED))}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const outputs = [
    [join(ROOT, 'dist', 'isolario.html'), await buildExplorer()],
    [join(ROOT, 'examples', `${EXAMPLE_SEED}.svg`), await buildExample()],
  ];
  for (const [file, content] of outputs) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    console.log(`wrote ${file} (${(content.length / 1024).toFixed(0)} kB)`);
  }
}
