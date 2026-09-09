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

export { updateJournalStudents, loadJournalHistory, renderJournalHistory, deleteJournalEntry };

export function autoFillTopicForGroup(group, lessonNum) {
  if (!group) {
    const gSel = document.getElementById('journalGroupSelect');
    if (gSel) group = gSel.value;
  }
  if (!group) return;

  const dateInput = document.getElementById('journalDateInput');
  const date = dateInput?.value || new Date().toISOString().split('T')[0];
  const topicInput = document.getElementById('journalTopicInput');
  const notesInput = document.getElementById('journalNotesInput');
  const courseBadge = document.getElementById('coursePairBadge');

  const rec = getRecommendedLesson(group, lessonNum, date);
  if (topicInput && rec?.text) {
    topicInput.value = rec.text;
  }
  if (notesInput && rec?.homework) {
    notesInput.value = rec.homework;
  }
  if (courseBadge && rec?.number) {
    const typeLabel = rec.type === 'theory' ? 'Лекция' : 'Практика';
    courseBadge.textContent = `Пара №${rec.number} по счёту [${typeLabel}]`;
  }

  updateTopicDatalist(group);
  renderTopicSuggestions(group, (chosenTopic, chosenHw, chosenNum, chosenType) => {
    if (topicInput) topicInput.value = chosenTopic;
    if (notesInput && chosenHw) notesInput.value = chosenHw;
    if (courseBadge && chosenNum) {
      const typeLbl = chosenType === 'theory' ? 'Лекция' : 'Практика';
      courseBadge.textContent = `Пара №${chosenNum} по счёту [${typeLbl}]`;
    }
  });

  renderJournalStats(group);
}

// Загрузка сохраненной записи обратно в форму для просмотра или редактирования
export function loadEntryToForm(entry) {
  if (!entry) return;

  const groupSel = document.getElementById('journalGroupSelect');
  const lessonSel = document.getElementById('journalLessonNumSelect');
  const dateInput = document.getElementById('journalDateInput');
  const topicInput = document.getElementById('journalTopicInput');
  const notesInput = document.getElementById('journalNotesInput');
  const courseBadge = document.getElementById('coursePairBadge');

  if (groupSel) groupSel.value = entry.group;
  if (lessonSel) lessonSel.value = String(entry.lessonNumber);
  if (dateInput) dateInput.value = entry.date;
  if (topicInput) topicInput.value = entry.topic || '';
  if (notesInput) notesInput.value = entry.notes || '';

  if (courseBadge && entry.courseLessonNumber) {
    const typeLbl = entry.type === 'theory' ? 'Лекция' : 'Практика';
    courseBadge.textContent = `Пара №${entry.courseLessonNumber} по счёту [${typeLbl}]`;
  }

  // Обновляем список студентов для этой группы
  updateJournalStudents();

  // Проставляем сохраненные статусы и оценки
  const att = entry.attendance || {};
  document.querySelectorAll('#journalStudentsList .student-row').forEach((row) => {
    const student = row.getAttribute('data-student');
    const studentAtt = att[student];
    if (studentAtt) {
      const btns = row.querySelectorAll('.status-btn');
      btns.forEach((b) => {
        if (b.getAttribute('data-val') === studentAtt.status) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });

      const badge = row.querySelector('[data-badge]');
      if (badge) {
        if (studentAtt.status === 'present') {
          badge.className = 'student-badge badge-present';
          badge.textContent = 'Был';
        } else if (studentAtt.status === 'absent') {
          badge.className = 'student-badge badge-absent';
          badge.textContent = '✕ Не был';
        } else if (studentAtt.status === 'excused') {
          badge.className = 'student-badge badge-excused';
          badge.textContent = '📋 Уважит.';
        }
      }

      const gradeSel = row.querySelector('.grade-select');
      if (gradeSel) {
        gradeSel.value = studentAtt.grade || '';
      }
    }
  });

  // Показываем плашку режима редактирования
  showEditModeNotice(entry);

  // Плавный скролл к началу формы
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showEditModeNotice(entry) {
  let notice = document.getElementById('journalEditNotice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'journalEditNotice';
    notice.className = 'p-3 bg-amber-500/20 border border-amber-500/40 rounded-xl text-xs text-amber-300 flex items-center justify-between gap-2 mb-3';
    const formContainer = document.querySelector('#tabJournal .journal-card-header');
    formContainer?.parentNode?.insertBefore(notice, formContainer.nextSibling);
  }

  notice.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="text-base">✏️</span>
      <div>
        <div class="font-bold text-white">Редактирование занятия</div>
        <div class="text-[11px] text-amber-200/80">${entry.dateFormatted || entry.date} • Гр. ${entry.group} • ${entry.lessonNumber} пара</div>
      </div>
    </div>
    <button type="button" id="cancelEditNoticeBtn" class="px-2.5 py-1 bg-amber-500/30 hover:bg-amber-500/50 text-white rounded-lg text-[11px] font-semibold transition">Отмена</button>
  `;
  notice.classList.remove('hidden');

  document.getElementById('cancelEditNoticeBtn')?.addEventListener('click', () => {
    notice.classList.add('hidden');
    const g = document.getElementById('journalGroupSelect')?.value;
    const l = document.getElementById('journalLessonNumSelect')?.value;
    autoFillTopicForGroup(g, l);
  });
}

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

    const rec = getRecommendedLesson(group, lessonNumber, date);
    const courseLessonNumber = rec?.number || 1;
    const entryType = rec?.type || (topic.toLowerCase().includes('лекци') || topic.toLowerCase().includes('теори') ? 'theory' : 'practice');

    const attendance = {};
    document.querySelectorAll('#journalStudentsList .student-row').forEach((row) => {
      const student = row.getAttribute('data-student');
      const activeBtn = row.querySelector('.status-btn.active');
      const status = activeBtn ? activeBtn.getAttribute('data-val') : 'present';
      const grade = row.querySelector('.grade-select')?.value;
      attendance[student] = { status, grade: grade || undefined };
    });

    const entry = {
      id: `${group}_${date}_${lessonNumber}`,
      date,
      dateFormatted: date,
      group,
      subject: 'Информатика',
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

    fetch('./api/journal/mark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    }).catch(() => {});

    // Скрываем плашку редактирования после сохранения
    document.getElementById('journalEditNotice')?.classList.add('hidden');

    alert('✅ Занятие успешно сохранено в электронный журнал!');
    renderJournalHistory();
    renderJournalStats(group);
    autoFillTopicForGroup(group, lessonNumber);
  });
}
