// One draft per lesson identity. Redrawing a subgroup must not transfer marks to a different lesson.
import { state } from './state.js';
import { normalizeGroup, normalizeTeacher, normalizeSubgroup, matchesJournalTeacher } from './lessonProgress.js';

import { normalizeStudentName, attendanceKey } from './attendanceUtils.js';
export { normalizeStudentName, attendanceKey } from './attendanceUtils.js';

const contextKey = () => [normalizeTeacher(state.currentTeacher),
  normalizeGroup(document.getElementById('journalGroupSelect')?.value),
  document.getElementById('journalDateInput')?.value,
  document.getElementById('journalLessonNumSelect')?.value].join('|');
let revision = 0;
let draft = { context: '', key: '', entry: null, attendance: {}, dirty: false };

export function resetJournalDraft(entry = null) {
  const context = contextKey();
  draft = { context, key: `${context}|${++revision}`, entry: entry ? structuredClone(entry) : null,
    attendance: structuredClone(entry?.attendance || {}), dirty: false };
  return draft;
}

export function getJournalDraft() {
  if (draft.context !== contextKey()) resetJournalDraft();
  return draft;
}

export function captureJournalMarks() {
  const current = getJournalDraft();
  document.querySelectorAll('#journalStudentsList .student-row').forEach(row => {
    // Old DOM rows belong to a different lesson. Never capture them into a new draft.
    if (row.getAttribute('data-draft-key') !== current.key) return;
    const name = row.getAttribute('data-student');
    if (!name) return;
    const key = attendanceKey(current.attendance, name);
    const previous = current.attendance[key] || {};
    const mark = { ...previous, status: row.querySelector('.status-btn.active')?.getAttribute('data-val') || previous.status || 'present',
      grade: row.querySelector('.grade-select')?.value ?? previous.grade ?? '' };
    if (JSON.stringify(previous) !== JSON.stringify(mark)) current.dirty = true;
    current.attendance[key] = mark;
  });
  return current.attendance;
}

export function boundJournalEntry(group, bell, date, subgroup, teacher = state.currentTeacher) {
  const entry = getJournalDraft().entry;
  if (!entry) return null;
  return normalizeGroup(entry.group) === normalizeGroup(group) && entry.date === date
    && Number(entry.lessonNumber) === Number(bell) && matchesJournalTeacher(entry, teacher)
    && normalizeSubgroup(entry.subgroup) === normalizeSubgroup(subgroup) ? entry : null;
}

export function journalStudents(group, roster = []) {
  const names = [...roster];
  const keys = new Set(names.map(normalizeStudentName));
  for (const name of Object.keys(getJournalDraft().attendance)) {
    if (!keys.has(normalizeStudentName(name))) { names.push(name); keys.add(normalizeStudentName(name)); }
  }
  return names;
}
