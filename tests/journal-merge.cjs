const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { SourceTextModule, createContext } = require('node:vm');

async function load() {
  const context = createContext({});
  const mod = new SourceTextModule(readFileSync('js/journalMerge.js', 'utf8'), { context });
  await mod.link(() => {}); await mod.evaluate();
  return mod.namespace;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('sparse cloud rows preserve all local grades, absences, comments and unknown fields', async () => {
  const { mergeJournalEntry } = await load();
  const local = { id: 'a', custom: 17, attendance: {
    A: { status: 'absent', grade: '3', comment: 'справка' }, B: { status: 'present', grade: '5' },
  } };
  const { entry } = mergeJournalEntry(local, { id: 'a', topic: 'remote', attendance: { C: { status: 'excused' } } });
  assert.deepEqual(plain(entry.attendance), { ...local.attendance, C: { status: 'excused' } });
  assert.equal(entry.custom, 17);
  assert.equal(entry.topic, 'remote');
});

test('conflicting marks retain both versions, not last-writer-wins', async () => {
  const { mergeJournalEntry } = await load();
  const local = { id: 'a', attendance: { A: { grade: '5', status: 'absent' } } };
  const remote = { id: 'a', attendance: { A: { grade: '3', status: 'present' } } };
  const { entry, fields } = mergeJournalEntry(local, remote);
  assert.deepEqual(plain(entry.attendance), local.attendance);
  assert.deepEqual([...fields].sort(), ['attendance.A.grade', 'attendance.A.status']);
  assert.equal(remote.attendance.A.grade, '3');
});

test('known baseline accepts remote edits to untouched cells and local edits to other cells', async () => {
  const { mergeJournalEntry } = await load();
  const base = { id: 'a', attendance: { A: { grade: '3' }, B: { grade: '3' } } };
  const local = { id: 'a', attendance: { A: { grade: '5' }, B: { grade: '3' } } };
  const remote = { id: 'a', attendance: { A: { grade: '3' }, B: { grade: '4' } } };
  const { entry, fields } = mergeJournalEntry(local, remote, base, true);
  assert.deepEqual(plain(entry.attendance), { A: { grade: '5' }, B: { grade: '4' } });
  assert.equal(fields.length, 0);
});

test('tombstones remain authoritative and journal-only records survive source failures', async () => {
  const { mergeJournalLists } = await load();
  const local = [{ id: 'deleted', attendance: { A: { grade: '5' } } }, { id: 'local-only' }];
  const { entries } = mergeJournalLists(local, [{ id: 'deleted' }, { id: 'cloud-only' }], { removed: new Set(['deleted']) });
  assert.deepEqual(plain(entries).map(x => x.id), ['local-only', 'cloud-only']);
});

test('an explicit grade clearing with a baseline is not mistaken for missing data', async () => {
  const { mergeJournalEntry } = await load();
  const base = { id: 'a', attendance: { A: { grade: '3' } } };
  const { entry, fields } = mergeJournalEntry(base, { id: 'a', attendance: { A: { grade: '' } } }, base);
  assert.equal(entry.attendance.A.grade, '');
  assert.equal(fields.length, 0);
});
