// ==========================================================================
// JOURNAL VIEW & ATTENDANCE LOGIC
// ==========================================================================
import { state } from './state.js';

export function updateJournalStudents() {
  const groupSel = document.getElementById('journalGroupSelect');
  if (!groupSel) return;
  const group = groupSel.value;
  const listEl = document.getElementById('journalStudentsList');
  const countEl = document.getElementById('studentsCountLabel');
  if (!listEl) return;

  const students = state.studentsByGroup[group] || [];
  if (countEl) countEl.textContent = students.length;

  if (students.length === 0) {
    listEl.innerHTML = `
      <div style="text-align: center; color: #64748b; padding: 16px 12px; font-size: 12px; background: rgba(15,23,42,0.4); border-radius: 12px; border: 1px dashed #334155;">
        В группе ${group} пока нет студентов.<br>
        <span style="color: #94a3b8; font-size: 11px;">Перейдите во вкладку «Студенты», чтобы добавить.</span>
      </div>`;
    return;
  }

  listEl.innerHTML = '';
  students.forEach((student, idx) => {
    const row = document.createElement('div');
    row.className = 'student-row';
    row.setAttribute('data-student', student);

    row.innerHTML = `
      <div class="student-header">
        <div class="student-info">
          <span class="student-num">${idx + 1}</span>
          <span class="student-name">${student}</span>
        </div>
        <span class="student-badge badge-present" data-badge>Был</span>
      </div>

      <div class="student-controls">
        <div class="attendance-toggle" role="group">
          <button type="button" data-val="present" class="status-btn active status-present" title="Присутствовал">
            <span class="status-icon">✓</span> <span>Был</span>
          </button>
          <button type="button" data-val="absent" class="status-btn status-absent" title="Отсутствовал">
            <span class="status-icon">✕</span> <span>Н</span>
          </button>
          <button type="button" data-val="excused" class="status-btn status-excused" title="Уважительная причина">
            <span class="status-icon">☕</span> <span>У</span>
          </button>
        </div>

        <div class="grade-wrapper">
          <label class="grade-label">Оценка:</label>
          <select class="grade-select" title="Оценка за занятие">
            <option value="">—</option>
            <option value="5">5</option>
            <option value="4">4</option>
            <option value="3">3</option>
            <option value="2">2</option>
          </select>
        </div>
      </div>
    `;

    const badge = row.querySelector('[data-badge]');
    const btns = row.querySelectorAll('.status-btn');
    btns.forEach((b) => {
      b.addEventListener('click', () => {
        btns.forEach((other) => other.classList.remove('active'));
        b.classList.add('active');
        const val = b.getAttribute('data-val');
        if (badge) {
          if (val === 'present') {
            badge.className = 'student-badge badge-present';
            badge.textContent = 'Был';
          } else if (val === 'absent') {
            badge.className = 'student-badge badge-absent';
            badge.textContent = '✕ Не был';
          } else if (val === 'excused') {
            badge.className = 'student-badge badge-excused';
            badge.textContent = '☕ Уважит.';
          }
        }
      });
    });

    listEl.appendChild(row);
  });
}

export function autoFillTopicForGroup(group, lessonNum) {
  if (!group) {
    const gSel = document.getElementById('journalGroupSelect');
    if (gSel) group = gSel.value;
  }
  if (!group) return;

  const clean = group.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '');
  let found = null;
  for (const prog of state.curriculumPrograms) {
    for (const g of prog.groups || []) {
      const gClean = g.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '');
      if (gClean === clean || clean.includes(gClean) || gClean.includes(clean)) {
        found = prog;
        break;
      }
    }
    if (found) break;
  }

  if (found && found.lessons && found.lessons.length > 0) {
    const input = document.getElementById('journalTopicInput');
    if (!input) return;

    let targetTopic = found.lessons[0].text;
    if (lessonNum !== undefined && lessonNum !== null) {
      const num = Number(lessonNum);
      const matchLesson = found.lessons.find((l) => l.number === num);
      if (matchLesson) targetTopic = matchLesson.text;
      else if (found.lessons[num - 1]) targetTopic = found.lessons[num - 1].text;
    }

    input.value = targetTopic;
  }
}

export function loadJournalHistory() {
  const local = JSON.parse(localStorage.getItem('pwa_journal') || '[]');
  state.journalEntries = local;
  renderJournalHistory();

  fetch('./api/journal')
    .then((r) => r.json())
    .then((d) => {
      if (d.success && d.entries) {
        state.journalEntries = d.entries;
        renderJournalHistory();
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

  container.innerHTML = '';
  state.journalEntries.slice(-10).reverse().forEach((entry) => {
    const card = document.createElement('div');
    card.className = 'history-card';

    const attendKeys = Object.keys(entry.attendance || {});
    const absents = attendKeys.filter((k) => entry.attendance[k].status === 'absent').length;
    const excused = attendKeys.filter((k) => entry.attendance[k].status === 'excused').length;

    card.innerHTML = `
      <div class="history-card-top">
        <div class="history-card-date">
          <span class="history-badge-num">#${entry.lessonNumber} пара</span>
          <span class="history-date-text">${entry.dateFormatted || entry.date}</span>
        </div>
        <span class="history-group-badge">Гр. ${entry.group}</span>
      </div>
      <div class="history-topic">${entry.topic || 'Без темы'}</div>
      ${entry.notes ? `<div class="history-notes">📝 ${entry.notes}</div>` : ''}
      <div class="history-card-footer">
        <span class="history-stat-all">👥 Всего: <b>${attendKeys.length}</b></span>
        <div class="flex items-center gap-2">
          ${excused > 0 ? `<span class="history-stat-excused">☕ Уваж: <b>${excused}</b></span>` : ''}
          <span class="history-stat-absent ${absents > 0 ? 'text-red' : 'text-green'}">
            ${absents > 0 ? `✕ Не было: <b>${absents}</b>` : `✓ Все были`}
          </span>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

export function setupJournalListeners() {
  const groupSel = document.getElementById('journalGroupSelect');
  const lessonSel = document.getElementById('journalLessonNumSelect');
  const topicInput = document.getElementById('journalTopicInput');

  groupSel?.addEventListener('change', () => {
    updateJournalStudents();
    autoFillTopicForGroup(groupSel.value, lessonSel?.value);
  });

  lessonSel?.addEventListener('change', () => {
    autoFillTopicForGroup(groupSel?.value, lessonSel.value);
  });

  // Автозаполнение темы при клике или фокусе, если поле пустое
  topicInput?.addEventListener('focus', () => {
    if (!topicInput.value || topicInput.value.trim() === '') {
      autoFillTopicForGroup(groupSel?.value, lessonSel?.value);
    }
  });

  topicInput?.addEventListener('click', () => {
    if (!topicInput.value || topicInput.value.trim() === '') {
      autoFillTopicForGroup(groupSel?.value, lessonSel?.value);
    }
  });

  document.getElementById('todayDateBtn')?.addEventListener('click', () => {
    const dateInput = document.getElementById('journalDateInput');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
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
  });

  document.getElementById('saveJournalBtn')?.addEventListener('click', async () => {
    const group = groupSel?.value;
    const lessonNumber = Number(lessonSel?.value || 1);
    const date = document.getElementById('journalDateInput')?.value || new Date().toISOString().split('T')[0];
    const topic = topicInput?.value || 'Практическое занятие';
    const notes = document.getElementById('journalNotesInput')?.value || '';

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
  });
}
