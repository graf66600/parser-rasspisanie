// ==========================================================================
// JOURNAL ATTENDANCE: STUDENT LIST & ATTENDANCE CONTROLS
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
          <button type="button" data-val="excused" class="status-btn status-excused" title="Уважительная причина (справка)">
            <span class="status-icon">📋</span> <span>У</span>
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
            badge.textContent = '📋 Уважит.';
          }
        }
      });
    });

    listEl.appendChild(row);
  });
}
