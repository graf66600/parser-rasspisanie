// ==========================================================================
// JOURNAL HISTORY: DETAILED LESSON CARDS & RECORD EDITING
// ==========================================================================
import { state } from './state.js';
import { renderJournalStats } from './journalStats.js';
import { autoFillTopicForGroup, loadEntryToForm } from './journalView.js';

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

  // Корректируем записи до 14.09.2026: все прошедшие занятия были лекциями
  let modified = false;
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
      if (Number(e.lessonNumber) === 3 && (e.topic?.includes('Цифровизация') || e.type !== 'practice')) {
        e.topic = 'Практическое занятие №1: АРМ фельдшера ФАП: первичный прием, идентификация пациента через ТФОМС, оформление прикрепления.';
        e.courseLessonNumber = 6;
        e.type = 'practice';
        modified = true;
      } else if (Number(e.lessonNumber) === 4 && (e.topic?.includes('Электронная') || e.type !== 'practice')) {
        e.topic = 'Практическое занятие №2: Проведение диспансерного осмотра в МИС, формирование электронных направлений (форма № 057/у-04) в ЛИС и PACS.';
        e.courseLessonNumber = 7;
        e.type = 'practice';
        modified = true;
      }
    }
  });

  if (modified || local.length !== JSON.parse(localStorage.getItem('pwa_journal') || '[]').length) {
    localStorage.setItem('pwa_journal', JSON.stringify(local));
  }
  state.journalEntries = local;
  renderJournalHistory();
  const g = document.getElementById('journalGroupSelect')?.value;
  renderJournalStats(g);

  // Фоновая синхронизация с сервером / статическим файлом
  try {
    let freshEntries = null;
    try {
      const res = await fetch('./api/journal');
      if (res.ok) {
        const d = await res.json();
        if (d.success && d.entries) freshEntries = d.entries;
      }
    } catch (e) {}

    if (!freshEntries) {
      try {
        let res = await fetch('./data/journal.json?v=v15');
        if (!res.ok) res = await fetch('./public/data/journal.json?v=v15');
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
      cleaned.forEach((e) => {
        if (e.date && e.date < '2026-09-14') e.type = 'theory';
      });

      // Объединяем с локальными записями пользователя, сохраняя выставленные им оценки
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

// Форматирование ФИО: "Иванов Иван Иванович" -> "Иванов И."
function formatShortName(fullName) {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

export function renderJournalHistory() {
  const container = document.getElementById('journalHistoryList');
  if (!container) return;

  if (!state.journalEntries || state.journalEntries.length === 0) {
    container.innerHTML = `
      <div class="history-empty-box">
        Проведенных занятий пока не сохранено
      </div>`;
    return;
  }

  const sortedAll = [...state.journalEntries].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return Number(a.lessonNumber) - Number(b.lessonNumber);
  });

  const groupCounters = {};
  const entriesWithCourseNum = sortedAll.map((entry) => {
    const g = entry.group || 'unknown';
    groupCounters[g] = (groupCounters[g] || 0) + 1;
    const courseNum = entry.courseLessonNumber || groupCounters[g];
    return { ...entry, calculatedCourseNum: courseNum };
  });

  container.innerHTML = '';
  entriesWithCourseNum.slice(-15).reverse().forEach((entry) => {
    const card = document.createElement('div');
    card.className = 'history-card';

    const isTheory = entry.type === 'theory' || (entry.topic && (entry.topic.toLowerCase().includes('лекци') || entry.topic.toLowerCase().includes('теори')));
    const typeLabel = isTheory ? 'Лекция' : 'Практика';
    const typeClass = isTheory ? 'badge-theory' : 'badge-practice';

    const attendance = entry.attendance || {};
    const attendKeys = Object.keys(attendance);

    // Списки студентов по категориям
    const absentList = [];
    const excusedList = [];
    const gradeList = [];

    attendKeys.forEach((name) => {
      const att = attendance[name];
      if (!att) return;
      if (att.status === 'absent') {
        absentList.push(name);
      } else if (att.status === 'excused') {
        excusedList.push(name);
      }
      if (att.grade && att.grade !== '') {
        gradeList.push({ name, grade: att.grade });
      }
    });

    const totalStudents = attendKeys.length;
    const cardId = `history_entry_${entry.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;

    card.innerHTML = `
      <div class="history-card-top">
        <div class="history-card-date">
          <span class="history-badge-num">Пара №${entry.calculatedCourseNum}</span>
          <span class="history-type-badge ${typeClass}">${typeLabel}</span>
          <span class="history-date-text">${entry.dateFormatted || entry.date} (${entry.lessonNumber} пара)</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="history-group-badge">Гр. ${entry.group}</span>
          <button type="button" class="history-edit-btn" title="Загрузить пару в форму для просмотра или редактирования">✏️ Изменить</button>
          <button type="button" class="history-del-btn" title="Удалить запись">🗑️</button>
        </div>
      </div>

      <div class="history-topic">${entry.topic || 'Без темы'}</div>
      ${entry.notes ? `<div class="history-notes">📝 ${entry.notes}</div>` : ''}

      <!-- Пофамильные сводки по категориям -->
      <div class="history-details-summary">
        ${absentList.length > 0 ? `
          <div class="history-tag-row tag-row-absent">
            <span class="tag-title">✕ Не были (${absentList.length}):</span>
            <span class="tag-names">${absentList.map(formatShortName).join(', ')}</span>
          </div>
        ` : `
          <div class="history-tag-row tag-row-present">
            <span class="tag-title">✓ Все были</span>
          </div>
        `}

        ${excusedList.length > 0 ? `
          <div class="history-tag-row tag-row-excused">
            <span class="tag-title">📋 Уважительные (${excusedList.length}):</span>
            <span class="tag-names">${excusedList.map(formatShortName).join(', ')}</span>
          </div>
        ` : ''}

        ${gradeList.length > 0 ? `
          <div class="history-tag-row tag-row-grades">
            <span class="tag-title">⭐ Оценки (${gradeList.length}):</span>
            <div class="grade-pills-wrap">
              ${gradeList.map((g) => `<span class="history-grade-pill grade-pill-${g.grade}">${formatShortName(g.name)}: <b>${g.grade}</b></span>`).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <div class="history-card-footer">
        <span class="history-stat-all">👥 Всего в записи: <b>${totalStudents}</b></span>
        <button type="button" class="history-expand-btn" data-target="${cardId}">
          <span>Список группы</span>
          <span class="expand-icon">▼</span>
        </button>
      </div>

      <!-- Разворачиваемый полный список студентов занятия -->
      <div id="${cardId}" class="history-full-list hidden">
        <div class="history-table-header">
          <span>Студент</span>
          <span>Статус</span>
          <span>Оценка</span>
        </div>
        ${totalStudents === 0 ? '<div class="text-xs text-slate-500 py-2 text-center">Список студентов не был сохранен для этой пары</div>' : ''}
        ${attendKeys.map((name, idx) => {
          const att = attendance[name] || { status: 'present' };
          let statusText = 'Был';
          let statusClass = 'text-emerald-400';
          if (att.status === 'absent') {
            statusText = '✕ Не был';
            statusClass = 'text-rose-400 font-bold';
          } else if (att.status === 'excused') {
            statusText = '📋 Уважит.';
            statusClass = 'text-amber-400 font-medium';
          }
          return `
            <div class="history-student-item">
              <span class="item-name"><span class="item-idx">${idx + 1}.</span> ${name}</span>
              <span class="item-status ${statusClass}">${statusText}</span>
              <span class="item-grade">${att.grade ? `<b class="grade-badge-${att.grade}">${att.grade}</b>` : '—'}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Кнопка удаления
    card.querySelector('.history-del-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteJournalEntry(entry.id);
    });

    // Кнопка редактирования
    card.querySelector('.history-edit-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      loadEntryToForm(entry);
    });

    // Кнопка сворачивания/разворачивания списка
    const expandBtn = card.querySelector('.history-expand-btn');
    const fullList = card.querySelector(`#${cardId}`);
    expandBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!fullList) return;
      const isHidden = fullList.classList.toggle('hidden');
      const icon = expandBtn.querySelector('.expand-icon');
      if (icon) icon.textContent = isHidden ? '▼' : '▲';
      expandBtn.classList.toggle('active', !isHidden);
    });

    container.appendChild(card);
  });
}
