const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { SourceTextModule, createContext } = require('node:vm');
async function load(initial = {}) {
  const values = new Map(Object.entries(initial));
  const context = createContext({ localStorage: {
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
  } });
  const mod = new SourceTextModule(readFileSync('js/journalRecovery.js', 'utf8'), { context });
  await mod.link(() => {}); await mod.evaluate(); return { api: mod.namespace, values };
}

test('the first recovery copy is immutable across later edits and exports no login secrets', async () => {
  const original = JSON.stringify([{ id: 'a', attendance: { A: { grade: '5', status: 'absent' } } }]);
  const { api, values } = await load({ pwa_journal: original, pwa_auth_role: 'admin', 'sb-secret-token': 'do-not-export' });
  api.ensureJournalRecovery();
  const first = values.get('pwa_journal_recovery_v1');
  values.set('pwa_journal', JSON.stringify([{ id: 'b' }]));
  api.ensureJournalRecovery();
  assert.equal(values.get('pwa_journal_recovery_v1'), first);
  assert.equal(JSON.parse(first).values.pwa_journal, original);
  const backup = JSON.stringify(api.makeJournalBackup());
  assert.equal(backup.includes('do-not-export'), false);
  assert.equal(backup.includes('pwa_auth_role'), false);
});

test('resolving a conflict does not delete either original version from the archive', async () => {
  const { api } = await load();
  const conflict = { id: 'a', local: { attendance: { A: { grade: '5' } } }, remote: { attendance: { A: { grade: '3' } } }, fields: ['attendance.A.grade'] };
  api.archiveJournalConflicts([conflict, conflict]);
  assert.equal(api.getJournalConflicts().length, 1);
  api.resolveJournalConflict(api.getJournalConflicts()[0].signature);
  const saved = api.getJournalConflicts()[0];
  assert.equal(saved.local.attendance.A.grade, '5');
  assert.equal(saved.remote.attendance.A.grade, '3');
  assert.ok(saved.resolvedAt);
});

for (const invalid of ['{broken', '{}', '[null]', '[{"topic":"no-id"}]']) {
  test('invalid legacy journal is left verbatim for recovery: ' + invalid, async () => {
    const { api, values } = await load({ pwa_journal: invalid });
    api.ensureJournalRecovery();
    assert.throws(() => api.readLocalJournal());
    assert.equal(values.get('pwa_journal'), invalid);
    assert.equal(JSON.parse(values.get('pwa_journal_recovery_v1')).values.pwa_journal, invalid);
  });
}
