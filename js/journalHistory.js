// ==========================================================================
// JOURNAL HISTORY: DETAILED LESSON CARDS & RECORD EDITING
// ==========================================================================
import { state, PWA_VERSION, isStaticHost } from './state.js';
import { renderJournalStats } from './journalStats.js';
import { autoFillTopicForGroup, loadEntryToForm } from './journalView.js';
import { createHistoryCardElement } from './journalCard.js';
import { fetchRemoteJournal, deleteJournalEntryFromCloud } from './supabaseSync.js';

export function deleteJournalEntry(id) {
  if (!confirm('Удалить эту запись занятия из журнала?')) return;

  state.journalEntries = (state.journalEntries || []).filter((e) => e.id !== id);
  localStorage.setItem('pwa_journal', JSON.stringify(state.journalEntries));

  deleteJournalEntryFromCloud(id);
  const isStatic = Boolean(isStaticHost) || (typeof window !== 'undefined' && (window.location.hostname.includes('github.io') || window.location.protocol === 'file:'));
  if (!isStatic) {
    fetch(`./api/journal/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
  }

  renderJournalHistory();
  const g = document.getElementById('journalGroupSelect')?.value;
  const l = document.getElementById('journalLessonNumSelect')?.value;
  renderJournalStats(g);
  autoFillTopicForGroup(g, l);
}

export async function loadJournalHistory() {
  let local = JSON.parse(localStorage.getItem('pwa_journal') || '[]');
  const currentTeacher = state.currentTeacher || '';
  state.journalEntries = local;
  renderJournalHistory();
  const g = document.getElementById('journalGroupSelect')?.value;
  renderJournalStats(g);

  // Фоновая синхронизация с сервером / статическим файлом
  try {
    let freshEntries = null;
    const isStatic = Boolean(isStaticHost) || (typeof window !== 'undefined' && (window.location.hostname.includes('github.io') || window.location.protocol === 'file:'));
    if (!isStatic) {
      try {
        const res = await fetch(`./api/journal?teacher=${encodeURIComponent(currentTeacher)}`);
        if (res.ok) {
          const d = await res.json();
          if (d.success && d.entries) freshEntries = d.entries;
        }
      } catch (e) {}
    }

    if (!freshEntries) {
      try {
        freshEntries = await fetchRemoteJournal(currentTeacher);
      } catch (e) {}
    }

    if (freshEntries) {
      const cleaned = freshEntries;

      const map = new Map();
      cleaned.forEach((e) => map.set(e.id, e));
      local.forEach((e) => map.set(e.id, e));

      const merged = Array.from(map.values());
      state.journalEntries = merged;
      localStorage.setItem('pwa_journal', JSON.stringify(merged));
      renderJournalHistory();
      renderJournalStats(document.getElementById('journalGroupSelect')?.value);
    }
  } catch (err) {
    console.warn('Ошибка загрузки журнала:', err);
  }
}


export function renderJournalHistory() {
  const container = document.getElementById('journalHistoryList');
  if (!container) return;

  const currentTeacher = state.currentTeacher || '';

  const teacherEntries = (state.journalEntries || []).filter((e) => {
    if (!currentTeacher || !e.teacher) return false;
    return e.teacher === currentTeacher;
  });

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
  entriesWithCourseNum.slice(-15).reverse().forEach((entry) => {
    const card = createHistoryCardElement(entry, {
      onDelete: deleteJournalEntry,
      onEdit: loadEntryToForm,
    });
    container.appendChild(card);
  });
}
