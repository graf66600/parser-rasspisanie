const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createContext, SourceTextModule, SyntheticModule } = require('node:vm');

async function setup({ fetch = async () => ({ ok: true }), staticHost = true, initial = [], remoteRows = [] } = {}) {
  const storage = new Map([['pwa_sync_queue', JSON.stringify(initial)]]);
  const context = createContext({ AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => !options?.method
      ? { ok: true, json: async () => remoteRows } : fetch(url, options),
    console: { warn() {} }, navigator: { onLine: true },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } });
  const modules = new Map();
  function moduleFor(name) {
    if (modules.has(name)) return modules.get(name);
    let module;
    if (name === './state.js' || name === './cacheHelper.js') {
      const values = name === './state.js' ? { state: { currentTeacher: 'Тест' } } : { isStaticHost: staticHost };
      module = new SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      }, { context });
    } else module = new SourceTextModule(readFileSync('js/' + name.slice(2), 'utf8'), { context });
    modules.set(name, module);
    return module;
  }
  const queue = moduleFor('./syncQueue.js');
  await queue.link(moduleFor);
  await queue.evaluate();
  const records = modules.get('./cloudRecords.js').namespace;
  const persistence = modules.get('./syncStorage.js').namespace;
  return { ...queue.namespace, records, persistence, storage, context };
}

for (const status of [400, 401, 500]) {
  test(`HTTP ${status} retains durable journal operation`, async () => {
    const app = await setup({ fetch: async () => ({ ok: false, status }) });
    app.enqueueJournalEntry({ id: 'a', subgroup: 2 });
    await app.flushSyncQueue();
    assert.equal(app.getSyncQueue().length, 1);
    await assert.rejects(app.records.pushJournalEntryToCloud({ id: 'a' }), /HTTP/);
  });
}

test('network rejection is not reported as success', async () => {
  const app = await setup({ fetch: async () => { throw new Error('offline'); } });
  app.enqueueJournalEntry({ id: 'a' });
  await app.flushSyncQueue();
  assert.equal(app.getSyncQueue().length, 1);
});

test('a success acknowledges only the sent version; concurrent additions survive', async () => {
  let finish;
  const app = await setup({ fetch: () => new Promise(resolve => { finish = resolve; }) });
  app.enqueueJournalEntry({ id: 'a', topic: 'old' });
  const pending = app.flushSyncQueue();
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  app.enqueueJournalEntry({ id: 'a', topic: 'new' });
  app.enqueueJournalEntry({ id: 'b' });
  finish({ ok: true });
  await pending;
  const queue = app.getSyncQueue();
  assert.equal(queue.length, 2);
  assert.equal(queue[0].entry.topic, 'new');
});

test('concurrent flush calls do not send duplicate operations', async () => {
  let finish;
  let calls = 0;
  const app = await setup({ fetch: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  app.enqueueJournalEntry({ id: 'a' });
  const pending = app.flushSyncQueue();
  await app.flushSyncQueue();
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  finish({ ok: true });
  await pending;
  assert.equal(app.getSyncQueue().length, 0);
});

test('each destination must acknowledge; retry skips confirmed cloud writes', async () => {
  let apiOk = false;
  let cloudCalls = 0;
  const app = await setup({ staticHost: false, fetch: async url => {
    if (url.startsWith('./api')) return { ok: apiOk, status: 500 };
    cloudCalls++; return { ok: true };
  } });
  app.enqueueJournalEntry({ id: 'a' });
  await app.flushSyncQueue();
  assert.equal(app.getSyncQueue().length, 1);
  assert.equal(app.getSyncQueue()[0].confirmed.cloud, true);
  apiOk = true;
  await app.flushSyncQueue();
  assert.equal(app.getSyncQueue().length, 0);
  assert.equal(cloudCalls, 1);
});

test('legacy queue items still flush and failures retain unknown operations', async () => {
  const app = await setup({ staticHost: false, initial: [
    { id: 'old', type: 'journal', entry: { id: 'old' }, queuedAt: 'yesterday' },
    { id: 'unknown', type: 'future' },
  ] });
  await app.flushSyncQueue();
  assert.equal(app.getSyncQueue().length, 1);
  assert.equal(app.getSyncQueue()[0].id, 'unknown');
});

test('delete supersedes pending save and tombstone survives acknowledgement', async () => {
  const methods = [];
  const app = await setup({ fetch: async (url, options) => { methods.push(options.method); return { ok: true }; } });
  app.enqueueJournalEntry({ id: 'a' });
  app.persistence.markJournalTombstone('a');
  app.enqueueJournalDeletion('a');
  await app.flushSyncQueue();
  assert.deepEqual(methods, ['DELETE']);
  assert.equal(app.getSyncQueue().length, 0);
  assert.ok(app.persistence.getJournalTombstones().a);
});

test('student writes and deletes reject HTTP failures too', async () => {
  const app = await setup({ fetch: async () => ({ ok: false, status: 401 }) });
  await assert.rejects(app.records.pushStudentToCloud('g', 'name'), /401/);
  await assert.rejects(app.records.pushBulkStudentsToCloud('g', ['name']), /401/);
  await assert.rejects(app.records.deleteStudentFromCloud('g', 'name'), /401/);
});

test('offline flush leaves storage untouched', async () => {
  const app = await setup({ fetch: async () => { throw new Error('must not call'); } });
  app.context.navigator.onLine = false;
  app.enqueueJournalEntry({ id: 'a' });
  await app.flushSyncQueue();
  assert.equal(app.getSyncQueue().length, 1);
});


test('a save superseded during cloud upload never sends a stale API payload', async () => {
  let finish;
  let apiCalls = 0;
  const app = await setup({ staticHost: false, fetch: (url) => {
    if (url.startsWith('./api')) { apiCalls++; return Promise.resolve({ ok: true }); }
    return new Promise(resolve => { finish = resolve; });
  } });
  app.enqueueJournalEntry({ id: 'a', topic: 'old' });
  const flushing = app.flushSyncQueue();
  while (!finish) await new Promise(resolve => setImmediate(resolve));
  app.enqueueJournalEntry({ id: 'a', topic: 'new' });
  finish({ ok: true });
  await flushing;
  assert.equal(apiCalls, 0);
  assert.equal(app.getSyncQueue()[0].entry.topic, 'new');
});

test('different cloud marks block upload and retain both versions for recovery', async () => {
  let writes = 0;
  const app = await setup({ remoteRows: [{ id: 'a', attendance: { A: { grade: '3' } } }],
    fetch: async () => { writes++; return { ok: true }; } });
  app.enqueueJournalEntry({ id: 'a', attendance: { A: { grade: '5' } } });
  await app.flushSyncQueue();
  assert.equal(writes, 0);
  assert.equal(app.getSyncQueue().length, 1);
  const conflicts = JSON.parse(app.storage.get('pwa_journal_conflicts'));
  assert.equal(conflicts[0].local.attendance.A.grade, '5');
  assert.equal(conflicts[0].remote.attendance.A.grade, '3');
});
