// Run: node --experimental-vm-modules --test tests/client-syntax.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { SourceTextModule, Script } = require('node:vm');

const modules = ['app.js', ...readdirSync('js').filter(f => f.endsWith('.js')).map(f => `js/${f}`)];
for (const file of [...modules, 'sw.js']) {
  test(`${file}: valid syntax and identical public copy`, () => {
    const source = readFileSync(file, 'utf8');
    assert.equal(source, readFileSync(`public/${file}`, 'utf8'));
    if (file === 'sw.js') new Script(source, { filename: file });
    else new SourceTextModule(source, { identifier: file });
  });
}
