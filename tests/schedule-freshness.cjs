const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { SourceTextModule, SyntheticModule, createContext } = require('node:vm');

test('published photo import wins over older cloud data, newer cloud edits still work', async () => {
  const context = createContext({});
  const module = new SourceTextModule(readFileSync('js/scheduleFreshness.js', 'utf8'), { context });
  let requests = 0;
  await module.link(() => new SyntheticModule(['safeFetchJson', 'PWA_VERSION'], function () {
    this.setExport('PWA_VERSION', 'test');
    this.setExport('safeFetchJson', async () => {
      requests++;
      return { updatedAt: '2026-11-01T19:00:00Z' };
    });
  }, { context }));
  await module.evaluate();
  const { isRemoteScheduleCurrent: current, canUseRemoteSchedule: usable } = module.namespace;
  assert.equal(await usable('2026-10-26T12:00:00Z'), false);
  assert.equal(await usable('2026-11-01T19:01:00Z'), true);
  assert.equal(await usable('2026-11-01T19:00:00Z'), true);
  assert.equal(await usable(undefined), false);
  assert.equal(current('2026-11-01T19:00:00Z', undefined), true);
  assert.equal(requests, 1);
});
