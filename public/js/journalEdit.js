// ==========================================================================
// JOURNAL EDIT: REHYDRATE LESSON ENTRY INTO EDITING FORM
// ==========================================================================
import { updateJournalStudents } from './journalAttendance.js';
import { autoFillTopicForGroup } from './journalView.js';

export function loadEntryToForm(entry) {
  if (!entry) return;

  const groupSel = document.getElementById('journalGroupSelect');
  const lessonSel = document.getElementById('journalLessonNumSelect');
  const dateInput = document.getElementById('journalDateInput');
  const topicInput = document.getElementById('journalTopicInput');
  const notesInput = document.getElementById('journalNotesInput');
  const courseBadge = document.getElementById('coursePairBadge');
  const subgSel = document.getElementById('journalSubgroupSelect');

  if (groupSel) groupSel.value = entry.group;
  if (subgSel) subgSel.value = entry.subgroup ? String(entry.subgroup) : 'all';
  if (lessonSel) lessonSel.value = String(entry.lessonNumber);
  if (dateInput) dateInput.value = entry.date;
  if (topicInput) topicInput.value = entry.topic || '';
  if (notesInput) notesInput.value = entry.notes || '';

  if (courseBadge && entry.courseLessonNumber) {
    const typeLbl = entry.type === 'theory' ? 'Лекция' : 'Практика';
    courseBadge.textContent = `${typeLbl} №${entry.courseLessonNumber} (по программе)`;
  }

  updateJournalStudents();

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

  showEditModeNotice(entry);
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
