// ==========================================================================
// JOURNAL HISTORY: DETAILED LESSON CARDS & RECORD EDITING
// ==========================================================================
import { state, PWA_VERSION } from './state.js';
import { renderJournalStats } from './journalStats.js';
import { autoFillTopicForGroup, loadEntryToForm } from './journalView.js';
import { createHistoryCardElement } from './journalCard.js';

export function deleteJournalEntry(id) {
  if (!confirm('Удалить эту запись занятия из журнала?')) return;

  state.journalEntries = (state.journalEntries || []).filter((e) => e.id !== id);
  localStorage.setItem('pwa_journal', JSON.stringify(state.journalEntries));

  fetch(`./api/journal/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});

  renderJournalHistory();
  const g = document.getElementById('journalGroupSelect')?.value;
  const l = document.getElementById('journalLessonNumSelect')?.value;
  renderJournalStats(g);
  autoFillTopicForGroup(g, l);
}

export async function loadJournalHistory() {
  let local = JSON.parse(localStorage.getItem('pwa_journal') || '[]');
  const currentTeacher = state.currentTeacher || 'Трипольский';
  const isTripolsky = currentTeacher.toLowerCase().includes('трипольский');

  // Корректируем записи до 14.09.2026 только для Трипольского
  let modified = false;
  if (isTripolsky) {
    local = local.filter((e) => {
      if (e.notes === 'Тестовая отметка проведения занятия') return false;
      if (e.id === '51ф_2026-09-06_1' || e.id === '51ф_2026-09-07_1') return false;
      return true;
    });

    local.forEach((e) => {
      if (e.date && e.date < '2026-09-14' && e.type !== 'theory') {
        e.type = 'theory';
        modified = true;
      }
      const gClean = (e.group || '').toLowerCase().replace(/[^0-9а-яёa-z]/gi, '').replace(/f/g, 'ф');
      if (e.date === '2026-09-14' && gClean === '51ф') {
        if (Number(e.lessonNumber) === 3) {
          e.topic = 'Математический аппарат Calc: относительная/абсолютная адресация (), функции в клинической практике.';
          e.courseLessonNumber = 6;
          e.type = 'theory';
          modified = true;
        } else if (Number(e.lessonNumber) === 4) {
          e.topic = 'Практическое занятие №1: АРМ фельдшера ФАП: первичный прием, идентификация пациента через ТФОМС, оформление прикрепления.';
          e.courseLessonNumber = 1;
          e.type = 'practice';
          modified = true;
        } else if (Number(e.lessonNumber) === 5) {
          e.topic = 'Практическое занятие №2: Проведение диспансерного осмотра в МИС, формирование электронных направлений (форма № 057/у-04) в ЛИС и PACS.';
          e.courseLessonNumber = 2;
          e.type = 'practice';
          modified = true;
        }
      }
    });

    if (modified || local.length !== JSON.parse(localStorage.getItem('pwa_journal') || '[]').length) {
      localStorage.setItem('pwa_journal', JSON.stringify(local));
    }
  }

  state.journalEntries = local;
  renderJournalHistory();
  const g = document.getElementById('journalGroupSelect')?.value;
  renderJournalStats(g);

  // Фоновая синхронизация с сервером / статическим файлом
  try {
    let freshEntries = null;
    try {
      const res = await fetch(`./api/journal?teacher=${encodeURIComponent(currentTeacher)}`);
      if (res.ok) {
        const d = await res.json();
        if (d.success && d.entries) freshEntries = d.entries;
      }
    } catch (e) {}

    if (!freshEntries && isTripolsky) {
      try {
        let res = await fetch(`./data/journal.json?v=${PWA_VERSION}`);
        if (!res.ok) res = await fetch(`./public/data/journal.json?v=${PWA_VERSION}`);
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list)) freshEntries = list;
        }
      } catch (e) {}
    }

    if (freshEntries) {
      const cleaned = freshEntries.filter((e) => {
        if (e.notes === 'Тестовая отметка проведения занятия') return false;
        if (e.id === '51ф_2026-09-06_1' || e.id === '51ф_2026-09-07_1') return false;
        return true;
      });

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

  const currentTeacher = state.currentTeacher || 'Трипольский';
  const isTripolsky = currentTeacher.toLowerCase().includes('трипольский');

  const teacherEntries = (state.journalEntries || []).filter((e) => {
    if (!e.teacher) return isTripolsky;
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

  const groupCounters = {};
  const entriesWithCourseNum = sortedAll.map((entry) => {
    const g = entry.group || 'unknown';
    groupCounters[g] = (groupCounters[g] || 0) + 1;
    let courseNum = entry.courseLessonNumber;
    if (!courseNum && entry.topic) {
      const match = entry.topic.match(/№\s*(\d+)/i);
      if (match) courseNum = parseInt(match[1], 10);
    }
    if (!courseNum) courseNum = groupCounters[g];
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
