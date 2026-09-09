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

export function loadJournalHistory() {
  const local = JSON.parse(localStorage.getItem('pwa_journal') || '[]');
  const cleaned = local.filter((e) => {
    if (e.notes === 'Тестовая отметка проведения занятия') return false;
    if (e.id === '51ф_2026-09-06_1' || e.id === '51ф_2026-09-07_1') return false;
    return true;
  });
  if (cleaned.length !== local.length) {
    localStorage.setItem('pwa_journal', JSON.stringify(cleaned));
  }
  state.journalEntries = cleaned;
  renderJournalHistory();
  const g = document.getElementById('journalGroupSelect')?.value;
  renderJournalStats(g);

  fetch('./api/journal')
    .then((r) => r.json())
    .then((d) => {
      if (d.success && d.entries) {
        state.journalEntries = d.entries.filter((e) => {
          if (e.notes === 'Тестовая отметка проведения занятия') return false;
          if (e.id === '51ф_2026-09-06_1' || e.id === '51ф_2026-09-07_1') return false;
          return true;
        });
        renderJournalHistory();
        renderJournalStats(document.getElementById('journalGroupSelect')?.value);
      }
    })
    .catch(() => {});
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
