// ==========================================================================
// JOURNAL EDIT: REHYDRATE LESSON ENTRY INTO EDITING FORM
// ==========================================================================
import { state } from './state.js';
import { updateJournalStudents } from './journalAttendance.js';
import { autoFillTopicForGroup } from './journalView.js';
import { resetJournalDraft, boundJournalEntry } from './journalDraft.js';
import { normalizeGroup, normalizeSubgroup, matchesJournalTeacher } from './lessonProgress.js';

export function findExistingJournalEntry(group, lessonNum, date, subgroup, teacher) {
  if (!state.journalEntries || !Array.isArray(state.journalEntries)) return null;
  const currentTeacher = teacher || state.currentTeacher || '';
  const targetDate = date || new Date().toISOString().split('T')[0];
  const targetLesson = Number(lessonNum);
  const targetSub = subgroup && subgroup !== 'all' ? Number(subgroup) : null;

  const bound = boundJournalEntry(group, targetLesson, targetDate, targetSub, currentTeacher);
  if (bound) return state.journalEntries.find(entry => entry.id === bound.id) || bound;
  const candidates = state.journalEntries.filter(entry => normalizeGroup(entry.group) === normalizeGroup(group)
    && entry.date === targetDate && Number(entry.lessonNumber) === targetLesson
    && matchesJournalTeacher(entry, currentTeacher) && normalizeSubgroup(entry.subgroup) === normalizeSubgroup(targetSub));
  // Ambiguous IDs/subjects need an explicit history-card choice; never update the first one accidentally.
  return candidates.length === 1 ? candidates[0] : null;
}

export function loadEntryToForm(entry) {
  if (!entry) return;

  const groupSel = document.getElementById('journalGroupSelect');
  const lessonSel = document.getElementById('journalLessonNumSelect');
  const dateInput = document.getElementById('journalDateInput');
  const topicInput = document.getElementById('journalTopicInput');
  const notesInput = document.getElementById('journalNotesInput');
  const courseBadge = document.getElementById('coursePairBadge');
  const subgSel = document.getElementById('journalSubgroupSelect');

  if (groupSel) {
    if (![...groupSel.options].some(option => option.value === entry.group)) {
      const option = document.createElement('option'); option.value = entry.group; option.textContent = `Группа ${entry.group}`;
      groupSel.appendChild(option);
    }
    groupSel.value = entry.group;
  }
  if (subgSel) subgSel.value = entry.subgroup ? String(entry.subgroup) : 'all';
  if (lessonSel) lessonSel.value = String(entry.lessonNumber);
  if (dateInput) dateInput.value = entry.date;
  if (topicInput) topicInput.value = entry.topic || '';
  if (notesInput) notesInput.value = entry.notes || '';

  if (courseBadge && entry.courseLessonNumber) {
    const typeLbl = entry.type === 'theory' ? 'Лекция' : 'Практика';
    courseBadge.textContent = `${typeLbl} №${entry.courseLessonNumber} (по программе)`;
  }

  resetJournalDraft(entry);
  updateJournalStudents();

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
        <div class="text-[11px] text-amber-200/80">${entry.dateFormatted || entry.date} • Гр. ${entry.group} • ${entry.lessonNumber} пара${entry.subgroup ? ` (${entry.subgroup} п/г)` : ''}</div>
      </div>
    </div>
    <button type="button" id="cancelEditNoticeBtn" class="px-2.5 py-1 bg-amber-500/30 hover:bg-amber-500/50 text-white rounded-lg text-[11px] font-semibold transition">Отмена</button>
  `;
  notice.classList.remove('hidden');

  document.getElementById('cancelEditNoticeBtn')?.addEventListener('click', () => {
    notice.classList.add('hidden');
    resetJournalDraft();
    const g = document.getElementById('journalGroupSelect')?.value;
    const l = document.getElementById('journalLessonNumSelect')?.value;
    updateJournalStudents();
    autoFillTopicForGroup(g, l);
  });
}
