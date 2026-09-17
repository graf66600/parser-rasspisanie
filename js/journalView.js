// ==========================================================================
// JOURNAL VIEW: LESSON ENTRY, TOPIC AUTOFILL & FORM LOGIC
// ==========================================================================
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
import { pushJournalEntryToCloud } from './supabaseSync.js';

export { updateJournalStudents, loadJournalHistory, renderJournalHistory, deleteJournalEntry };

export function autoFillTopicForGroup(group, lessonNum) {
  if (!group) {
    const gSel = document.getElementById('journalGroupSelect');
    if (gSel) group = gSel.value;
  }
  if (!group) return;

  const currentTeacher = state.currentTeacher || 'Трипольский';
  const isTripolsky = currentTeacher.toLowerCase().includes('трипольский');
  const dateInput = document.getElementById('journalDateInput');
  const date = dateInput?.value || new Date().toISOString().split('T')[0];
  const topicInput = document.getElementById('journalTopicInput');
  const notesInput = document.getElementById('journalNotesInput');
  const courseBadge = document.getElementById('coursePairBadge');

  if (isTripolsky) {
    const rec = getRecommendedLesson(group, lessonNum, date);
    if (topicInput && rec?.text) topicInput.value = rec.text;
    if (notesInput && rec?.homework) notesInput.value = rec.homework;
    if (courseBadge && rec?.number) {
      const typeLabel = rec.type === 'theory' ? 'Лекция' : 'Практика';
      courseBadge.textContent = `${typeLabel} №${rec.number} (по программе)`;
    }

    updateTopicDatalist(group);
    renderTopicSuggestions(group, (chosenTopic, chosenHw, chosenNum, chosenType) => {
      if (topicInput) topicInput.value = chosenTopic;
      if (notesInput && chosenHw) notesInput.value = chosenHw;
      if (courseBadge && chosenNum) {
        const typeLbl = chosenType === 'theory' ? 'Лекция' : 'Практика';
        courseBadge.textContent = `${typeLbl} №${chosenNum} (по программе)`;
      }
    });
  } else {
    const foundLesson = state.schedule?.lessons?.find(
      (l) => l.group === group && Number(l.lessonNumber) === Number(lessonNum)
    );
    if (topicInput && (!topicInput.value || topicInput.value === 'Практическое занятие')) {
      topicInput.value = foundLesson?.subject ? `Тема: ${foundLesson.subject}` : 'Тема занятия';
    }
    if (courseBadge) courseBadge.textContent = `Пара №${lessonNum || 1}`;
    const suggestionsBox = document.getElementById('topicSuggestions');
    if (suggestionsBox) suggestionsBox.classList.add('hidden');
  }

  renderJournalStats(group);
}

export { loadEntryToForm } from './journalEdit.js';


export function setupJournalListeners() {
  const groupSel = document.getElementById('journalGroupSelect');
  const lessonSel = document.getElementById('journalLessonNumSelect');
  const topicInput = document.getElementById('journalTopicInput');
  const suggestionsBox = document.getElementById('topicSuggestions');

  groupSel?.addEventListener('change', () => {
    updateJournalStudents();
    autoFillTopicForGroup(groupSel.value, lessonSel?.value);
    renderJournalStats(groupSel.value);
  });

  document.getElementById('journalSubgroupSelect')?.addEventListener('change', () => {
    updateJournalStudents();
  });

  lessonSel?.addEventListener('change', () => {
    autoFillTopicForGroup(groupSel?.value, lessonSel.value);
  });

  document.getElementById('journalDateInput')?.addEventListener('change', () => {
    autoFillTopicForGroup(groupSel?.value, lessonSel?.value);
  });

  topicInput?.addEventListener('click', () => {
    if (suggestionsBox) suggestionsBox.classList.toggle('hidden');
  });

  document.getElementById('todayDateBtn')?.addEventListener('click', () => {
    const dateInput = document.getElementById('journalDateInput');
    if (dateInput) {
      dateInput.value = new Date().toISOString().split('T')[0];
      autoFillTopicForGroup(groupSel?.value, lessonSel?.value);
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
    const lessonNumber = Number(lessonSel?.value || 1);
    const date = document.getElementById('journalDateInput')?.value || new Date().toISOString().split('T')[0];
    const topic = topicInput?.value || 'Практическое занятие';
    const notes = document.getElementById('journalNotesInput')?.value || '';

    const currentTeacher = state.currentTeacher || 'Трипольский';
    const isTripolsky = currentTeacher.toLowerCase().includes('трипольский');

    let currentSubject = isTripolsky ? 'Информатика' : 'Учебная дисциплина';
    const foundLesson = state.schedule?.lessons?.find(
      (l) => l.group === group && Number(l.lessonNumber) === lessonNumber
    );
    if (foundLesson?.subject) currentSubject = foundLesson.subject;

    let courseLessonNumber = 1;
    let entryType = 'theory';

    if (isTripolsky) {
      const rec = getRecommendedLesson(group, lessonNumber, date);
      courseLessonNumber = rec?.number || 1;
      entryType = rec?.type || (topic.toLowerCase().includes('лекци') || topic.toLowerCase().includes('теори') ? 'theory' : 'practice');
    } else {
      const lower = topic.toLowerCase();
      if (lower.includes('практик')) entryType = 'practice';
      else if (lower.includes('зачет') || lower.includes('экзамен')) entryType = 'exam';
      else entryType = 'theory';
      const priorEntries = (state.journalEntries || []).filter(
        (e) => e.group === group && (!e.teacher || e.teacher === currentTeacher)
      );
      courseLessonNumber = priorEntries.length + 1;
    }

    const attendance = {};
    document.querySelectorAll('#journalStudentsList .student-row').forEach((row) => {
      const student = row.getAttribute('data-student');
      const activeBtn = row.querySelector('.status-btn.active');
      const status = activeBtn ? activeBtn.getAttribute('data-val') : 'present';
      const grade = row.querySelector('.grade-select')?.value;
      attendance[student] = { status, grade: grade || undefined };
    });

    const subgroupSel = document.getElementById('journalSubgroupSelect')?.value;
    const subgroupVal = (subgroupSel === '1' || subgroupSel === '2') ? Number(subgroupSel) : null;
    const subg = subgroupVal ? `_sub${subgroupVal}` : '';

    let entryId = `${group}${subg}_${date}_${lessonNumber}_${encodeURIComponent(currentTeacher)}`;
    if (isTripolsky && !subgroupVal) {
      const legacyId = `${group}_${date}_${lessonNumber}`;
      if ((state.journalEntries || []).some((e) => e.id === legacyId)) {
        entryId = legacyId;
      }
    }

    const entry = {
      id: entryId,
      date,
      dateFormatted: date,
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
    localStorage.setItem('pwa_journal', JSON.stringify(saved));
    state.journalEntries = saved;

    pushJournalEntryToCloud(entry);

    fetch('./api/journal/mark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    }).catch(() => {});

    // Скрываем плашку редактирования после сохранения
    document.getElementById('journalEditNotice')?.classList.add('hidden');

    alert(`✅ Занятие (${currentTeacher}) успешно сохранено в журнал!`);
    renderJournalHistory();
    renderJournalStats(group);
    autoFillTopicForGroup(group, lessonNumber);
  });
}
