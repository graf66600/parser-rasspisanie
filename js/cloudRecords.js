import { state } from './state.js';
import { SUPABASE_URL, HEADERS } from './supabaseClient.js';
import { checkedFetch } from './syncTransport.js';
import { mergeJournalEntry } from './journalMerge.js';
import { ensureJournalRecovery, archiveJournalConflicts, getJournalBaseline, rememberJournalBaseline } from './journalRecovery.js';

export const journalRowToEntry = r => ({
      id: r.id,
      date: r.date,
      dateFormatted: r.date_formatted,
      group: r.group_name,
      teacher: r.teacher_name,
      lessonNumber: r.lesson_number,
      subject: r.subject,
      startTime: r.start_time,
      endTime: r.end_time,
      classroom: r.classroom || '',
      topic: r.topic || '',
      topicIndex: r.topic_index,
      courseLessonNumber: r.course_lesson_number,
      type: r.type || 'theory',
      subgroup: r.subgroup || null,
      notes: r.notes || '',
      attendance: r.attendance || {},
      status: 'completed',
      completedAt: r.created_at || undefined,
});

export async function fetchRemoteJournal(teacherName) {
  try {
    let url = `${SUPABASE_URL}/rest/v1/journal_entries?order=date.asc,lesson_number.asc`;
    if (teacherName) {
      url += `&teacher_name=eq.${encodeURIComponent(teacherName)}`;
    }
    const res = await checkedFetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows)) return null;

    return rows.map(journalRowToEntry);
  } catch (e) {
    return null;
  }
}

export async function pushJournalEntryToCloud(entry, isCurrent = () => true) {
  const original = JSON.stringify(entry);
  ensureJournalRecovery();
  const response = await checkedFetch(`${SUPABASE_URL}/rest/v1/journal_entries?id=eq.${encodeURIComponent(entry.id)}&select=*`, { headers: HEADERS });
  const existing = await response.json();
  if (!Array.isArray(existing)) throw new Error('Облако вернуло неизвестный формат журнала');
  const remote = existing[0] ? journalRowToEntry(existing[0]) : null;
  const merged = mergeJournalEntry(entry, remote, getJournalBaseline()[entry.id], true);
  if (merged.fields.length) {
    archiveJournalConflicts([{ id: entry.id, local: entry, remote, fields: merged.fields, paths: merged.paths }]);
    const error = new Error('Оценки различаются на устройствах. Сначала сравните сохранённые версии.');
    error.code = 'JOURNAL_CONFLICT';
    throw error;
  }
  if (!isCurrent()) throw new Error('Операция уже заменена более новой записью');
  entry = merged.entry;
  try {
    const row = {
      id: entry.id,
      date: entry.date,
      date_formatted: entry.dateFormatted || entry.date,
      group_name: entry.group,
      teacher_name: entry.teacher || state.currentTeacher || 'Преподаватель',
      lesson_number: Number(entry.lessonNumber),
      subject: entry.subject || 'Учебная дисциплина',
      start_time: entry.startTime || '08:00',
      end_time: entry.endTime || '09:20',
      classroom: entry.classroom || '',
      topic: entry.topic || '',
      topic_index: entry.topicIndex || null,
      course_lesson_number: entry.courseLessonNumber || null,
      type: entry.type || 'theory',
      subgroup: entry.subgroup ? Number(entry.subgroup) : null,
      notes: entry.notes || null,
      attendance: entry.attendance || {},
    };

    await checkedFetch(`${SUPABASE_URL}/rest/v1/journal_entries`, {
      method: 'POST',
      headers: {
        ...HEADERS,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(row),
    });
    if (isCurrent()) {
      const saved = JSON.parse(localStorage.getItem('pwa_journal') || '[]');
      const index = saved.findIndex(item => item.id === entry.id && JSON.stringify(item) === original);
      if (index >= 0) {
        saved[index] = entry;
        localStorage.setItem('pwa_journal', JSON.stringify(saved));
        state.journalEntries = saved;
      }
      rememberJournalBaseline([entry]);
    }
    return entry;
  } catch (err) {
    throw err;
  }
}

export async function deleteJournalEntryFromCloud(entryId) {
  try {
    await checkedFetch(`${SUPABASE_URL}/rest/v1/journal_entries?id=eq.${encodeURIComponent(entryId)}`, {
      method: 'DELETE',
      headers: HEADERS,
    });
  } catch (err) { throw err; }
}

export async function fetchRemoteStudents() {
  try {
    const res = await checkedFetch(`${SUPABASE_URL}/rest/v1/students?select=group_name,full_name&order=group_name.asc,full_name.asc`, { headers: HEADERS });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const map = {};
    rows.forEach((r) => {
      const g = r.group_name;
      if (!map[g]) map[g] = [];
      if (!map[g].includes(r.full_name)) map[g].push(r.full_name);
    });
    return map;
  } catch (e) {
    return null;
  }
}

export async function pushStudentToCloud(group, studentName) {
  try {
    await checkedFetch(`${SUPABASE_URL}/rest/v1/students?on_conflict=group_name,full_name`, {
      method: 'POST',
      headers: { ...HEADERS, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ group_name: group, full_name: studentName }),
    });
  } catch (e) { throw e; }
}

export async function pushBulkStudentsToCloud(group, studentNames) {
  try {
    const rows = studentNames.map((name) => ({ group_name: group, full_name: name }));
    await checkedFetch(`${SUPABASE_URL}/rest/v1/students?on_conflict=group_name,full_name`, {
      method: 'POST',
      headers: { ...HEADERS, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(rows),
    });
  } catch (e) { throw e; }
}

export async function deleteStudentFromCloud(group, studentName) {
  try {
    await checkedFetch(`${SUPABASE_URL}/rest/v1/students?group_name=eq.${encodeURIComponent(group)}&full_name=eq.${encodeURIComponent(studentName)}`, {
      method: 'DELETE',
      headers: HEADERS,
    });
  } catch (e) { throw e; }
}
