// ==========================================================================
// JOURNAL VIEW: LESSON ENTRY, TOPIC AUTOFILL & FORM LOGIC
// ==========================================================================
import { scheduleOnDate, findProgram } from './lessonProgress.js';
import { state } from './state.js';
import {
  getRecommendedLesson,
  updateTopicDatalist,
  renderTopicSuggestions,
} from './topicHelper.js';
import { renderJournalStats } from './journalStats.js';
import { updateJournalStudents } from './journalAttendance.js';
import {
  loadJournalHistory,
  renderJournalHistory,
  deleteJournalEntry,
} from './journalHistory.js';
import { loadEntryToForm, findExistingJournalEntry } from './journalEdit.js';
import { enqueueJournalEntry, flushSyncQueue } from './syncQueue.js';
import { clearJournalTombstone } from './syncStorage.js';
import { captureJournalMarks, boundJournalEntry, getJournalDraft } from './journalDraft.js';
import { mergeJournalEntry } from './journalMerge.js';
import { ensureJournalRecovery, archiveJournalConflicts } from './journalRecovery.js';
import { markJournalClean } from './formGuard.js';

export { updateJournalStudents, loadJournalHistory, renderJournalHistory, deleteJournalEntry };
export { loadEntryToForm, findExistingJournalEntry };

export function autoFillTopicForGroup(group, lessonNum) {
  if (!group) {
    const gSel = document.getElementById('journalGroupSelect');
    if (gSel) group = gSel.value;
  }
  if (!group) return;

  const currentTeacher = state.currentTeacher || 'Преподаватель';
  const dateInput = document.getElementById('journalDateInput');
  const date = dateInput?.value || new Date().toISOString().split('T')[0];
  const topicInput = document.getElementById('journalTopicInput');
  const notesInput = document.getElementById('journalNotesInput');
  const courseBadge = document.getElementById('coursePairBadge');

  updateTopicDatalist(group);
  renderTopicSuggestions(group, (chosenTopic, chosenHw, chosenNum, chosenType) => {
    if (topicInput) topicInput.value = chosenTopic;
    if (notesInput && chosenHw) notesInput.value = chosenHw;
    if (courseBadge && chosenNum) {
      const typeLbl = chosenType === 'theory' ? 'Лекция' : 'Практика';
      courseBadge.textContent = `${typeLbl} №${chosenNum} (по программе)`;
    }
  });
  const rec = getRecommendedLesson(group, lessonNum, date, { subgroup: document.getElementById('journalSubgroupSelect')?.value });
  if (rec?.text) {
    if (topicInput && rec?.text) topicInput.value = rec.text;
    if (notesInput) notesInput.value = rec.homework || '';
    if (courseBadge) courseBadge.textContent = rec.number ? '' : 'Номер по программе не указан';
    if (courseBadge && rec?.number) {
      const typeLabel = rec.type === 'theory' ? 'Лекция' : 'Практика';
      courseBadge.textContent = `${typeLabel} №${rec.number} (${rec.estimated ? 'предварительно, по доступным записям' : 'по программе'})`;
    }


  } else {
    const foundLesson = state.schedule?.lessons?.find(
      (l) => l.group === group && Number(l.lessonNumber) === Number(lessonNum)
    );
    if (topicInput) {
      topicInput.value = foundLesson?.subject ? `Тема: ${foundLesson.subject}` : 'Тема занятия';
    }
    if (notesInput) notesInput.value = '';
    if (courseBadge) courseBadge.textContent = rec?.completed ? 'Список тем исчерпан — проверьте программу' : 'Уточните тип и тему занятия';
    const suggestionsBox = document.getElementById('topicSuggestions');
    if (suggestionsBox) suggestionsBox.classList.add('hidden');
  }

  renderJournalStats(group);
}

export function setupJournalListeners() {
  const groupSel = document.getElementById('journalGroupSelect');
  const lessonSel = document.getElementById('journalLessonNumSelect');
  const topicInput = document.getElementById('journalTopicInput');
  const suggestionsBox = document.getElementById('topicSuggestions');
  const subgSel = document.getElementById('journalSubgroupSelect');
  const dateInput = document.getElementById('journalDateInput');

  function handleFormSelectionChange() {
    const group = groupSel?.value;
    const lesson = lessonSel?.value;
    const date = dateInput?.value;
    const sub = subgSel?.value;
    if (!group) return;

    const existing = findExistingJournalEntry(group, lesson, date, sub);
    if (existing) {
      loadEntryToForm(existing);
    } else {
      document.getElementById('journalEditNotice')?.classList.add('hidden');
      updateJournalStudents();
      autoFillTopicForGroup(group, lesson);
    }
    renderJournalStats(group);
  }

  groupSel?.addEventListener('change', handleFormSelectionChange);
  lessonSel?.addEventListener('change', handleFormSelectionChange);
  subgSel?.addEventListener('change', () => {
    // Subgroup is a roster filter while editing; do not rehydrate over an unsaved draft.
    const loaded = getJournalDraft().entry;
    if (!loaded) { handleFormSelectionChange(); return; }
    captureJournalMarks();
    updateJournalStudents();
    renderJournalStats(groupSel?.value);
  });
  dateInput?.addEventListener('change', handleFormSelectionChange);

  topicInput?.addEventListener('click', () => {
    if (suggestionsBox) suggestionsBox.classList.toggle('hidden');
  });

  document.getElementById('todayDateBtn')?.addEventListener('click', () => {
    if (dateInput) {
      dateInput.value = new Date().toISOString().split('T')[0];
      handleFormSelectionChange();
    }
  });

  document.getElementById('markAllPresentBtn')?.addEventListener('click', () => {
    document.querySelectorAll('#journalStudentsList .student-row').forEach((row) => {
      row.querySelectorAll('.status-btn').forEach((b) => {
        if (b.getAttribute('data-val') === 'present') b.classList.add('active');
        else b.classList.remove('active');
      });
      const badge = row.querySelector('[data-badge]');
      if (badge) {
        badge.className = 'student-badge badge-present';
        badge.textContent = 'Был';
      }
    });
  });

  document.getElementById('resetAttendanceBtn')?.addEventListener('click', () => {
    document.querySelectorAll('#journalStudentsList .student-row').forEach((row) => {
      row.querySelectorAll('.status-btn').forEach((b) => {
        if (b.getAttribute('data-val') === 'absent') b.classList.add('active');
        else b.classList.remove('active');
      });
      const badge = row.querySelector('[data-badge]');
      if (badge) {
        badge.className = 'student-badge badge-absent';
        badge.textContent = '✕ Не был';
      }
    });
  });

  document.getElementById('autoFillTopicBtn')?.addEventListener('click', () => {
    autoFillTopicForGroup(groupSel?.value, lessonSel?.value);
    if (suggestionsBox) suggestionsBox.classList.remove('hidden');
  });

  document.getElementById('saveJournalBtn')?.addEventListener('click', async () => {
    const group = groupSel?.value;
    if (!group?.trim()) { alert('Выберите группу перед сохранением.'); return; }
    if (state.isGuestMode) { alert('Для изменения отметок войдите как преподаватель.'); return; }
    const lessonNumber = Number(lessonSel?.value || 1);
    const date = dateInput?.value || new Date().toISOString().split('T')[0];
    const topic = topicInput?.value || 'Практическое занятие';
    const notes = document.getElementById('journalNotesInput')?.value || '';

    const currentTeacher = state.currentTeacher || 'Преподаватель';
    const subgroupSel = subgSel?.value;
    const loaded = getJournalDraft().entry;
    const selectedSubgroup = (subgroupSel === '1' || subgroupSel === '2') ? Number(subgroupSel) : null;
    const subgroupVal = loaded ? Number(loaded.subgroup) || null : selectedSubgroup;
    const foundLesson = scheduleOnDate(state, date).find(l => l.group === group
      && Number(l.lessonNumber) === lessonNumber
      && (Number(l.subgroup) || null) === subgroupVal);
    const existing = loaded || boundJournalEntry(group, lessonNumber, date, subgroupSel) || findExistingJournalEntry(group, lessonNumber, date, subgroupSel);
    const currentSubject = existing?.subject || foundLesson?.subject || state.schedule?.subject || '';
    const rec = getRecommendedLesson(group, lessonNumber, date, { subgroup: subgroupSel, subject: currentSubject });
    const program = findProgram(state.curriculumPrograms, group);
    const selectedLesson = program?.lessons?.find(l => (l.text || l.topic) === topic);
    const entryType = selectedLesson?.type || (rec?.text === topic ? rec.type : null) || existing?.type || 'other';
    const courseLessonNumber = rec?.text === topic ? rec.number : selectedLesson
      ? program.lessons.filter(l => l.type === selectedLesson.type).indexOf(selectedLesson) + 1 : existing?.courseLessonNumber ?? null;

    const latest = (state.journalEntries || []).find(entry => entry.id === existing?.id);
    const reconciled = mergeJournalEntry({ ...existing, attendance: captureJournalMarks() }, latest, existing, true);
    if (reconciled.fields.length) archiveJournalConflicts([{ id: existing.id, local: reconciled.entry,
      remote: latest, fields: reconciled.fields, paths: reconciled.paths }]);
    const attendance = reconciled.entry.attendance;

    const subg = subgroupVal ? `_sub${subgroupVal}` : '';

    let entryId = existing?.id || `${group}${subg}_${date}_${lessonNumber}_${encodeURIComponent(currentTeacher)}`;

    const entry = {
      ...existing,
      id: entryId,
      date,
      dateFormatted: existing?.dateFormatted || date,
      group,
      subgroup: subgroupVal,
      teacher: currentTeacher,
      subject: currentSubject,
      lessonNumber,
      courseLessonNumber,
      type: entryType,
      topic,
      notes,
      attendance,
    };

    const saved = JSON.parse(localStorage.getItem('pwa_journal') || '[]');
    const idx = saved.findIndex((e) => e.id === entry.id);
    if (idx !== -1) saved[idx] = entry;
    else saved.push(entry);
    try {
      // Persist intent before any request so a tab close cannot lose an in-flight edit.
      ensureJournalRecovery();
      enqueueJournalEntry(entry);
      clearJournalTombstone(entry.id);
      localStorage.setItem('pwa_journal', JSON.stringify(saved));
    } catch (error) {
      alert('Не удалось сохранить занятие на устройстве. Освободите место и повторите сохранение.');
      return;
    }
    state.journalEntries = saved;
    markJournalClean();
    void flushSyncQueue();

    // Сохраняем форму в режиме редактирования с обновленными данными
    loadEntryToForm(entry);

    alert(`✅ Занятие (${currentTeacher}) сохранено на устройстве. Статус отправки — в индикаторе синхронизации.`);
    renderJournalHistory();
    renderJournalStats(group);
  });
}
