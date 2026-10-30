import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const source = path.resolve('src');
const read = (name) => JSON.parse(fs.readFileSync(path.join(source, name), 'utf8'));
const vietnamese = { ...read('vi.json'), ...read('vi-extra.json'), ...read('vi-studio.json') };
const english = { ...read('en.json'), ...read('en-backend.json') };
const translatableAttributes = new Set(['title', 'placeholder', 'aria-label', 'alt', 'label', 'subtitle']);
const unchanged = new Set([
  'Google', '1s', 'Alpaca · IEX', 'doFiin', '© 2026 doFiin', 'you@example.com',
  'doFiin /', 'doFiin / Studio', 'v', 'Free', 'Plus', 'Pro', 'Let’s Talk',
  '0 pp', 'Sharpe', 'Alpha CAPM / SPY', 'Treynor / SPY', 'Beta', 'Studio',
  'chart', 'MA', '/ MA', '#RRGGBB', 'Beta /',
]);
const missing = [];

for (const name of fs.readdirSync(source).filter((item) => item.endsWith('.tsx') && item !== 'i18n.tsx')) {
  const file = path.join(source, name);
  const text = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const check = (raw, node) => {
    const key = raw.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
    if (!key || unchanged.has(key) || !/[A-Za-zÀ-ỹ]/.test(key)) return;
    const dictionary = /[À-ỹ]/.test(key) ? english : vietnamese;
    if (dictionary[key]) return;
    const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
    missing.push(`${name}:${line} ${key}`);
  };
  const walk = (node) => {
    if (ts.isJsxText(node)) check(node.getText(ast), node);
    if (ts.isJsxAttribute(node) && translatableAttributes.has(node.name.text)
      && node.initializer && ts.isStringLiteral(node.initializer)) {
      check(node.initializer.text, node);
    }
    ts.forEachChild(node, walk);
  };
  walk(ast);
}

if (missing.length) {
  console.error(`Missing ${missing.length} static UI translations:\n${missing.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Static English/Vietnamese UI copy is covered.');
}
