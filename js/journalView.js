// ==========================================================================
// JOURNAL VIEW & HISTORY LOGIC
// ==========================================================================
import { state } from './state.js';
import {
  getRecommendedLesson,
  updateTopicDatalist,
  renderTopicSuggestions,
} from './topicHelper.js';
import { renderJournalStats } from './journalStats.js';
import { updateJournalStudents } from './journalAttendance.js';

export { updateJournalStudents };

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

export function renderJournalHistory() {
  const container = document.getElementById('journalHistoryList');
  if (!container) return;

  if (state.journalEntries.length === 0) {
    container.innerHTML = `<div style="font-size: 12px; color: #64748b; padding: 12px; text-align: center; background: rgba(15,23,42,0.4); border-radius: 12px; border: 1px dashed #334155;">Проведенных занятий пока не сохранено</div>`;
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
  entriesWithCourseNum.slice(-10).reverse().forEach((entry) => {
    const card = document.createElement('div');
    card.className = 'history-card';

    const isTheory = entry.type === 'theory' || (entry.topic && (entry.topic.toLowerCase().includes('лекци') || entry.topic.toLowerCase().includes('теори')));
    const typeLabel = isTheory ? 'Лекция' : 'Практика';
    const typeClass = isTheory ? 'badge-theory' : 'badge-practice';

    const attendKeys = Object.keys(entry.attendance || {});
    const absents = attendKeys.filter((k) => entry.attendance[k].status === 'absent').length;
    const excused = attendKeys.filter((k) => entry.attendance[k].status === 'excused').length;

    card.innerHTML = `
      <div class="history-card-top">
        <div class="history-card-date">
          <span class="history-badge-num">Пара №${entry.calculatedCourseNum}</span>
          <span class="history-type-badge ${typeClass}">${typeLabel}</span>
          <span class="history-date-text">${entry.dateFormatted || entry.date} (${entry.lessonNumber} пара звонков)</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="history-group-badge">Гр. ${entry.group}</span>
          <button type="button" class="history-del-btn" data-id="${entry.id}" title="Удалить запись">🗑️</button>
        </div>
      </div>
      <div class="history-topic">${entry.topic || 'Без темы'}</div>
      ${entry.notes ? `<div class="history-notes">📝 ${entry.notes}</div>` : ''}
      <div class="history-card-footer">
        <span class="history-stat-all">👥 Всего: <b>${attendKeys.length}</b></span>
        <div class="flex items-center gap-2">
          ${excused > 0 ? `<span class="history-stat-excused">📋 Уваж: <b>${excused}</b></span>` : ''}
          <span class="history-stat-absent ${absents > 0 ? 'text-red' : 'text-green'}">
            ${absents > 0 ? `✕ Не было: <b>${absents}</b>` : `✓ Все были`}
          </span>
        </div>
      </div>
    `;

    card.querySelector('.history-del-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteJournalEntry(entry.id);
    });

    container.appendChild(card);
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
    if (suggestionsBox) {
      suggestionsBox.classList.toggle('hidden');
    }
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
    if (suggestionsBox) {
      suggestionsBox.classList.remove('hidden');
    }
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

    alert('✅ Занятие успешно сохранено в электронный журнал!');
    renderJournalHistory();
    renderJournalStats(group);
    autoFillTopicForGroup(group, lessonNumber);
  });
}
