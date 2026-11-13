const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { SourceTextModule, SyntheticModule, createContext } = require('node:vm');

async function load(state, document = { getElementById: () => null }) {
  const context = createContext({ console, document });
  const modules = new Map();
  modules.set('./state.js', new SyntheticModule(['state', 'formatLocalDate'], function () {
    this.setExport('state', state);
    this.setExport('formatLocalDate', () => '2026-11-09');
  }, { context }));
  const get = name => {
    if (!modules.has(name)) modules.set(name, new SourceTextModule(readFileSync(`js/${name.slice(2)}`, 'utf8'), { context }));
    return modules.get(name);
  };
  for (const name of ['./lessonProgress.js', './topicHelper.js', './journalStats.js', './journalSummaryView.js']) {
    const module = get(name);
    if (module.status === 'unlinked') await module.link(get);
    if (module.status === 'linked') await module.evaluate();
  }
  return Object.assign({}, ...[...modules.values()].map(m => m.namespace));
}

function fixture() {
  return { currentTeacher: 'Трипольский',
    curriculumPrograms: JSON.parse(readFileSync('data/curriculum.json', 'utf8')),
    schedule: JSON.parse(readFileSync('data/schedule.json', 'utf8')), journalEntries: [] };
}
const entry = overrides => ({ group: '11фм', teacher: 'Трипольский', subject: 'Информатика',
  subgroup: 2, date: '2026-11-02', lessonNumber: 3, type: 'practice', ...overrides });

test('11фм: confirmed 8, then 9; older wrong numbers, other teachers and subgroups do not inflate it', async () => {
  const state = fixture();
  state.journalEntries = [entry({ courseLessonNumber: 12 }), entry({ teacher: 'Иванова', courseLessonNumber: 30 }),
    entry({ subgroup: 1, courseLessonNumber: 20 }), entry({ type: 'theory', courseLessonNumber: 11 })];
  const api = await load(state);
  assert.equal(api.getRecommendedLesson('11фм', 3, '2026-11-09').number, 8);
  assert.equal(api.getRecommendedLesson('11фм', 4, '2026-11-13').number, 9);
  state.journalEntries.push(entry({ date: '2026-11-09', courseLessonNumber: 8, topic: 'Сохранённая тема' }));
  assert.equal(api.getRecommendedLesson('11фм', 4, '2026-11-13').number, 9);
});

test('checkpoint continues next week, without adding historical entries twice', async () => {
  const state = fixture(); const api = await load(state);
  state.schedule.weekStart = '2026-11-16'; state.schedule.weekEnd = '2026-11-21';
  state.journalEntries = [entry({ date: '2026-11-13', lessonNumber: 4, courseLessonNumber: 9 })];
  assert.equal(api.getRecommendedLesson('11фм', 3, '2026-11-16').number, 10);
});

test('wrong subject, unknown group, outdated timetable and ambiguous type do not invent recommendations', async () => {
  const state = fixture(); const api = await load(state);
  assert.equal(api.findProgramForGroup('1ф'), null);
  assert.equal(api.getRecommendedLesson('11фм', 3, '2026-11-09', { subject: 'Химия' }), null);
  assert.equal(api.getRecommendedLesson('11фм', 3, '2026-10-12'), null);
  state.currentTeacher = 'Иванова';
  assert.equal(api.getRecommendedLesson('11фм', 3, '2026-11-09'), null);
});

test('end of assigned annual plan never wraps to topic 1', async () => {
  const state = fixture(); const api = await load(state);
  state.journalEntries = [entry({ date: '2026-11-10', courseLessonNumber: 52 })];
  const rec = api.getRecommendedLesson('11фм', 4, '2026-11-13');
  assert.equal(rec.number, 53); assert.equal(rec.completed, true); assert.equal(rec.text, '');
});

test('saved topic is preserved only for its own teacher, subgroup and subject', async () => {
  const state = fixture(); const api = await load(state);
  state.journalEntries = [entry({ date: '2026-11-09', teacher: 'Иванова', topic: 'Чужая тема' }),
    entry({ date: '2026-11-09', subject: 'Химия', topic: 'Химия' }),
    entry({ date: '2026-11-09', topic: 'Моя тема', courseLessonNumber: 8 })];
  assert.equal(api.getRecommendedLesson('11фм', 3, '2026-11-09').text, 'Моя тема');
});

test('workload photos reconcile to 852 teacher hours; subgroup multipliers are not student pairs', async () => {
  const state = fixture(); const api = await load(state);
  assert.equal(api.teachingLoads.reduce((sum, row) => sum + row.teacherHours, 0), 852);
  assert.equal(api.teacherLoad('Трипольский', '31фм', 1).practiceHours / 2, 12);
  assert.equal(api.teacherLoad('Трипольский', '51ф', 1).practiceHours / 2, 8);
  assert.equal(api.teacherLoad('Трипольский', '11фм', 1).practiceHours / 2, 27);
  assert.equal(api.teacherLoad('Трипольский', '21ф', 1).teacherHours, 0);
  assert.equal(api.teacherLoad('Иванова', '11фм', 1), null);
});

test('stats separate semesters, teachers, subgroups, subjects, duplicates and lecture types', async () => {
  const state = fixture(); const api = await load(state);
  state.journalEntries = [entry({}), entry({}), entry({ subgroup: 1 }), entry({ teacher: 'Иванова' }),
    entry({ teacher: undefined }), entry({ subject: 'Химия' }), entry({ date: '2027-02-01' }), entry({ type: 'theory', lessonNumber: 4 })];
  const stats = api.calculateGroupStats('11фм', '2', '2026-11-09');
  assert.equal(stats.practiceConducted, 1); assert.equal(stats.theoryConducted, 0);
  assert.equal(stats.practiceTotal, 27); assert.equal(stats.theoryTotal, 0);
});

test('statistics widget renders independent subgroup cards', async () => {
  const state = fixture(); const container = { innerHTML: '' };
  const api = await load(state, { getElementById: id => id === 'journalStatsWidget' ? container
    : id === 'journalDateInput' ? { value: '2026-11-09' } : null });
  api.renderJournalStats('31фм');
  assert.match(container.innerHTML, /1 п\/г/); assert.match(container.innerHTML, /2 п\/г/);
  assert.match(container.innerHTML, /54 акад/);
});

test('cancelled and substituted lessons do not advance a course stream', async () => {
  const state = fixture(); const api = await load(state);
  state.scheduleOverrides = { '31фм_1_1_2': { type: 'cancelled', updatedAt: '2026-11-09T08:00:00Z' } };
  assert.equal(api.scheduleOnDate(state, '2026-11-09').some(l => l.group === '31фм' && l.lessonNumber === 1), false);
  state.scheduleOverrides['31фм_1_1_2'] = { type: 'replaced', teacher: 'Иванова', updatedAt: '2026-11-09T08:00:00Z' };
  assert.equal(api.recommendLesson(state, '31фм', 1, '2026-11-09', { subject: 'Информатика', subgroup: 2 }), null);
});

test('41ф mapping follows the teacher correction, without partial matches to 41фм', async () => {
  const api = await load(fixture());
  assert.equal(api.findProgramForGroup('41ф').id, 4);
  assert.equal(api.findProgramForGroup('41фм'), null);
});

test('31фм source document has 3 lectures and 12 practices, with assessment inside practice 12', async () => {
  const api = await load(fixture());
  const program = api.findProgramForGroup('31фм');
  const theory = program.lessons.filter(l => l.type === 'theory');
  const practice = program.lessons.filter(l => l.type === 'practice');
  assert.equal(theory.length, 3); assert.equal(practice.length, 12);
  assert.equal(theory.reduce((sum, l) => sum + l.hours, 0), 6);
  assert.equal(practice.reduce((sum, l) => sum + l.hours, 0), 24);
  assert.deepEqual(practice.map(l => l.number), Array.from({ length: 12 }, (_, i) => i + 1));
  assert.match(practice[11].text, /Дифференцированный зачет/);
  assert.match(practice[7].text, /ГРЛС/);
  assert.equal(program.topicsVerified, true);
});


test('31 FM: widget and grade sheet count the same 15 records and preserve attendance', async () => {
  const state = fixture();
  state.studentsByGroup = { '31фм': ['Студент'] };
  state.journalEntries = Array.from({ length: 15 }, (_, index) => entry({
    id: String(index), group: index % 2 ? '31 FM' : '31фм',
    type: index < 3 ? 'theory' : 'practice',
    teacher: index < 3 ? undefined : 'Трипольский',
    subgroup: index < 3 ? null : (index % 2) + 1,
    date: '2026-10-' + String(index + 1).padStart(2, '0'),
    attendance: { Студент: { status: 'present', grade: '5' } },
  }));
  state.journalEntries.push(entry({ group: '31ф' }), entry({ group: '31фм', teacher: 'Иванова' }));
  const original = JSON.stringify(state.journalEntries);
  const widget = {};
  const summary = {};
  const api = await load(state, { getElementById: id => ({
    journalStatsWidget: widget, summaryTableContainer: summary, journalDateInput: { value: '2026-11-12' },
  })[id] });
  api.renderJournalStats('31 FM');
  api.renderSummaryTable('31фм');
  assert.match(widget.innerHTML, /Записей: 15 · Лекций: 3 · Практик: 12/);
  assert.match(summary.innerHTML, /Занятий:<\/span> <b>15<\/b>/);
  assert.equal((summary.innerHTML.match(/class="cell-mark cell-grade /g) || []).length, 15);
  assert.equal(JSON.stringify(state.journalEntries), original);
});


test('duplicate ID variants combine attendance without double counting or rewriting raw records', async () => {
  const state = fixture();
  const base = entry({ date: '2026-11-09', lessonNumber: 3 });
  state.journalEntries = [
    { ...base, id: 'old-id', attendance: { A: { grade: '5', status: 'present' } } },
    { ...base, id: 'new-id', attendance: { B: { status: 'absent', comment: 'note' } } },
  ];
  const original = JSON.stringify(state.journalEntries);
  const api = await load(state);
  const grouped = api.uniqueEntries(state.journalEntries);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].attendance.A.grade, '5');
  assert.equal(grouped[0].attendance.B.status, 'absent');
  assert.equal(api.calculateStudentStats('A', grouped).grades.length, 1);
  assert.equal(JSON.stringify(api.uniqueEntries([...state.journalEntries].reverse())), JSON.stringify(grouped));
  assert.equal(JSON.stringify(state.journalEntries), original);
});

test('conflicting duplicate marks are visible and excluded from a misleading average', async () => {
  const state = fixture(); const api = await load(state);
  const base = entry({ date: '2026-11-09', lessonNumber: 3 });
  const grouped = api.uniqueEntries([
    { ...base, id: 'a', attendance: { A: { grade: '5' } } },
    { ...base, id: 'b', attendance: { A: { grade: '3' } } },
  ]);
  assert.deepEqual([...grouped[0].attendance.A._alternatives.grade], ['3', '5']);
  assert.match(api.attendanceText(grouped[0].attendance.A), /3 \/ 5/);
  assert.equal(api.calculateStudentStats('A', grouped).avgGrade, null);
});

test('summary uses the same full-name spacing resolver and shows grade alongside absence', async () => {
  const state = fixture(); const api = await load(state);
  const record = { attendance: { ' Иванов  Иван ': { status: 'absent', grade: '3', comment: 'note' } } };
  const stats = api.calculateStudentStats('Иванов Иван', [record]);
  assert.equal(stats.absentCount, 1);
  assert.equal(stats.grades[0], 3);
  assert.equal(api.attendanceText(api.studentAttendance(record, 'Иванов Иван')), 'Н · 3');
});
