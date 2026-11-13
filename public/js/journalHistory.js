// ==========================================================================
// JOURNAL HISTORY: DETAILED LESSON CARDS & RECORD EDITING
// ==========================================================================
import { state, PWA_VERSION, isStaticHost } from './state.js';
import { renderJournalStats } from './journalStats.js';
import { autoFillTopicForGroup, loadEntryToForm } from './journalView.js';
import { matchesJournalTeacher } from './lessonProgress.js';
import { refreshOpenJournalSummary } from './journalSummaryView.js';
import { createHistoryCardElement } from './journalCard.js';
import { fetchRemoteJournal } from './supabaseSync.js';
import { enqueueJournalDeletion, flushSyncQueue } from './syncQueue.js';
import { getJournalTombstones, hasPendingJournalMutation, markJournalTombstone } from './syncStorage.js';
import { mergeJournalLists } from './journalMerge.js';
import { readLocalJournal, ensureJournalRecovery, getJournalBaseline, rememberJournalBaseline, archiveJournalConflicts } from './journalRecovery.js';

export function deleteJournalEntry(id) {
  if (!confirm('Удалить эту запись занятия из журнала?')) return;

  try {
    ensureJournalRecovery();
    enqueueJournalDeletion(id);
    markJournalTombstone(id);
    const entries = readLocalJournal().filter(entry => entry.id !== id);
    localStorage.setItem('pwa_journal', JSON.stringify(entries));
    state.journalEntries = entries;
  } catch (error) {
    alert('Не удалось сохранить удаление. Выгрузите резервную копию и освободите место.');
    return;
  }
  void flushSyncQueue();

  renderJournalHistory();
  const g = document.getElementById('journalGroupSelect')?.value;
  const l = document.getElementById('journalLessonNumSelect')?.value;
  renderJournalStats(g);
  autoFillTopicForGroup(g, l);
}

function entriesDiffer(left, right) {
  return JSON.stringify(left) !== JSON.stringify(right);
}

export async function loadJournalHistory() {
  let local;
  try { ensureJournalRecovery(); local = readLocalJournal(); } catch (error) {
    console.warn('Обновление журнала остановлено для сохранности данных:', error);
    return;
  }
  const baselineAtStart = getJournalBaseline();
  const pendingAtStart = new Set(local.filter(entry => hasPendingJournalMutation(entry.id)).map(entry => entry.id));
  const currentTeacher = state.currentTeacher || '';
  state.journalEntries = local;
  renderJournalHistory();
  const g = document.getElementById('journalGroupSelect')?.value;
  renderJournalStats(g);

  try {
    const api = async () => {
      if (isStaticHost) return null;
      try {
        const res = await fetch(`./api/journal?teacher=${encodeURIComponent(currentTeacher)}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.success && Array.isArray(data.entries) ? data.entries : null;
      } catch { return null; }
    };
    const [apiEntries, cloudEntries] = await Promise.all([
      api(), fetchRemoteJournal(currentTeacher).catch(() => null),
    ]);
    const freshEntries = [...(apiEntries || []), ...(cloudEntries || [])];

    if (freshEntries) {
      const latest = readLocalJournal();
      const initialById = new Map(local.map(entry => [entry.id, entry]));
      const latestById = new Map(latest.map(entry => [entry.id, entry]));
      const changedLocalIds = new Set();
      latestById.forEach((entry, id) => {
        if (!initialById.has(id) || entriesDiffer(initialById.get(id), entry) || hasPendingJournalMutation(id)) {
          changedLocalIds.add(id);
        }
      });
      const removedIds = new Set(local.filter(entry => !latestById.has(entry.id)).map(entry => entry.id));
      Object.keys(getJournalTombstones()).forEach(id => removedIds.add(id));

      const pending = new Set([...pendingAtStart, ...latest.filter(entry => hasPendingJournalMutation(entry.id)).map(entry => entry.id)]);
      const { entries: merged, conflicts } = mergeJournalLists(latest, freshEntries, {
        baseline: baselineAtStart, pending, removed: removedIds, changed: changedLocalIds,
      });
      archiveJournalConflicts(conflicts);
      // Only cloud reads are a cloud baseline. Never mark a conflicting version as accepted.
      const blocked = new Set(conflicts.map(item => item.id));
      rememberJournalBaseline((cloudEntries || []).filter(entry => !blocked.has(entry.id) && !pending.has(entry.id)));
      localStorage.setItem('pwa_journal', JSON.stringify(merged));
      state.journalEntries = merged;
      renderJournalHistory();
      renderJournalStats(document.getElementById('journalGroupSelect')?.value);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('pwa_journal_updated'));
    }
  } catch (err) {
    console.warn('Ошибка загрузки журнала:', err);
  }
}

export function renderJournalHistory() {
  refreshOpenJournalSummary();
  const container = document.getElementById('journalHistoryList');
  if (!container) return;

  const currentTeacher = state.currentTeacher || '';
  const teacherEntries = (state.journalEntries || []).filter(entry => matchesJournalTeacher(entry, currentTeacher));

  if (teacherEntries.length === 0) {
    container.innerHTML = `
      <div class="history-empty-box">
        Проведенных занятий (${currentTeacher}) пока не сохранено
      </div>`;
    return;
  }

  const sortedAll = [...teacherEntries].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return Number(a.lessonNumber) - Number(b.lessonNumber);
  });

  const entriesWithCourseNum = sortedAll.map((entry) => {
    let courseNum = entry.courseLessonNumber;
    if (!courseNum && entry.topic) {
      const match = entry.topic.match(/№\s*(\d+)/i);
      if (match) courseNum = parseInt(match[1], 10);
    }
    return { ...entry, calculatedCourseNum: courseNum };
  });

  container.innerHTML = '';
  if (entriesWithCourseNum.length > 15) {
    const label = document.createElement('p');
    label.className = 'journal-history-limit';
    label.textContent = `Здесь последние 15 из ${entriesWithCourseNum.length} записей. Все отметки доступны в сводной ведомости.`;
    container.appendChild(label);
  }
  entriesWithCourseNum.slice(-15).reverse().forEach((entry) => {
    const card = createHistoryCardElement(entry, { onDelete: deleteJournalEntry, onEdit: loadEntryToForm });
    container.appendChild(card);
  });
}
