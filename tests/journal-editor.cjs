const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { SourceTextModule, SyntheticModule, createContext } = require('node:vm');

async function setup() {
  const values = { journalGroupSelect: '31фм', journalDateInput: '2026-11-12', journalLessonNumSelect: '3' };
  const state = { currentTeacher: 'Трипольский' };
  let rows = [];
  const context = createContext({ structuredClone, document: {
    getElementById: id => ({ value: values[id] }), querySelectorAll: () => rows,
  } });
  const modules = new Map();
  function get(name) {
    if (modules.has(name)) return modules.get(name);
    const module = name === './state.js'
      ? new SyntheticModule(['state'], function () { this.setExport('state', state); }, { context })
      : new SourceTextModule(readFileSync('js/' + name.slice(2), 'utf8'), { context });
    modules.set(name, module); return module;
  }
  const module = get('./journalDraft.js'); await module.link(get); await module.evaluate();
  const api = module.namespace;
  const row = (name, status, grade, key = api.getJournalDraft().key) => ({
    getAttribute: attr => attr === 'data-student' ? name : attr === 'data-draft-key' ? key : null,
    querySelector: selector => selector === '.grade-select' ? { value: grade }
      : { getAttribute: () => status },
  });
  return { api, values, state, row, setRows: value => { rows = value; } };
}
const lesson = attendance => ({ id: 'original', group: '31фм', teacher: 'Трипольский',
  date: '2026-11-12', lessonNumber: 3, attendance });
const plain = value => JSON.parse(JSON.stringify(value));

test('saving visible rows preserves absent hidden students, comments and custom fields', async () => {
  const { api, row, setRows } = await setup();
  const original = lesson({ A: { grade: '3', status: 'absent', comment: 'справка', custom: 7 }, B: { grade: '5', status: 'present' } });
  api.resetJournalDraft(original);
  setRows([row('A', 'absent', '4')]);
  const saved = api.captureJournalMarks();
  assert.deepEqual(plain(saved), { A: { grade: '4', status: 'absent', comment: 'справка', custom: 7 }, B: original.attendance.B });
  assert.equal(original.attendance.A.grade, '3');
});

test('a new date or teacher never inherits previous lesson marks', async () => {
  const app = await setup();
  app.api.resetJournalDraft(lesson({ A: { grade: '5', status: 'absent' } }));
  app.setRows([app.row('A', 'absent', '5')]);
  app.values.journalDateInput = '2026-11-13';
  assert.deepEqual(plain(app.api.captureJournalMarks()), {});
  app.state.currentTeacher = 'Другой преподаватель';
  assert.deepEqual(plain(app.api.captureJournalMarks()), {});
});

test('subgroup redraws retain hidden drafts; loading another entry starts exclusively from its marks', async () => {
  const app = await setup();
  app.api.resetJournalDraft(lesson({ A: { grade: '3' }, B: { grade: '4' } }));
  app.setRows([app.row('B', 'absent', '5')]); app.api.captureJournalMarks();
  app.setRows([app.row('A', 'present', '3')]); app.api.captureJournalMarks();
  assert.equal(app.api.getJournalDraft().attendance.B.grade, '5');
  app.api.resetJournalDraft(lesson({ A: { grade: '2' } }));
  app.setRows([]);
  assert.equal(app.api.getJournalDraft().attendance.B, undefined);
});

test('bound ID survives normalized group names and teacherless legacy records', async () => {
  const app = await setup();
  const entry = { ...lesson({}), id: 'second-id', group: '31 FM', teacher: undefined };
  app.api.resetJournalDraft(entry);
  assert.equal(app.api.boundJournalEntry('31фм', 3, '2026-11-12', 'all').id, 'second-id');
  assert.equal(app.api.boundJournalEntry('31фм', 3, '2026-11-12', '2'), null);
});

test('full-name spacing aliases preserve original mark keys without surname guesses', async () => {
  const app = await setup();
  app.api.resetJournalDraft(lesson({ ' Иванов  Иван ': { status: 'absent', grade: '3', comment: 'note' } }));
  app.setRows([app.row('Иванов Иван', 'absent', '4')]);
  const saved = app.api.captureJournalMarks();
  assert.equal(Object.keys(saved).length, 1);
  assert.equal(saved[' Иванов  Иван '].comment, 'note');
  assert.equal(saved[' Иванов  Иван '].grade, '4');
});
