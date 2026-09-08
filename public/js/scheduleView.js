// ==========================================================================
// SCHEDULE VIEW & BELLS RENDERING
// ==========================================================================
import { DAY_NAMES, state } from './state.js';

function formatLessonsCount(count) {
  if (count === 0) return '0 пар';
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} пара`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${count} пары`;
  return `${count} пар`;
}

export function renderSchedule(onOpenJournal) {
  const container = document.getElementById('scheduleLessonsList') || document.getElementById('lessonsList');
  if (!container) return;

  if (!state.schedule?.lessons) {
    container.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
        <div style="font-size: 2rem; margin-bottom: 8px;">⏳</div>
        <p style="font-size: 14px; font-weight: 600; color: #f1f5f9;">Загрузка расписания...</p>
      </div>`;
    return;
  }

  const now = new Date();
  const jsDay = now.getDay();
  const todayNum = jsDay === 0 ? 7 : jsDay;
  const tomorrowNum = todayNum === 7 ? 1 : todayNum + 1;

  let targetDay = todayNum;
  if (state.activeDay === 'tomorrow') targetDay = tomorrowNum;
  else if (state.activeDay === 'all') targetDay = 'all';
  else if (state.activeDay !== 'today') targetDay = Number(state.activeDay);

  container.innerHTML = '';

  const titleEl = document.getElementById('scheduleDayTitle') || document.getElementById('currentDayTitle');
  const countEl = document.getElementById('scheduleTotalLessons') || document.getElementById('currentDaySubtitle');

  let filtered = [];
  if (targetDay === 'all') {
    filtered = [...state.schedule.lessons].sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return a.lessonNumber - b.lessonNumber;
    });
    if (titleEl) titleEl.textContent = 'Вся неделя';
    if (countEl) countEl.textContent = formatLessonsCount(filtered.length);
  } else {
    filtered = state.schedule.lessons
      .filter((l) => l.dayOfWeek === targetDay)
      .sort((a, b) => a.lessonNumber - b.lessonNumber);

    if (titleEl) titleEl.textContent = DAY_NAMES[targetDay] || 'Расписание';
    if (countEl) countEl.textContent = formatLessonsCount(filtered.length);
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
        <div style="font-size: 2rem; margin-bottom: 8px;">☕</div>
        <p style="font-size: 14px; font-weight: 600; color: #f1f5f9;">Пар нет</p>
        <p style="font-size: 12px; color: #64748b; margin-top: 4px;">В этот день занятий не запланировано</p>
      </div>
    `;
    return;
  }

  filtered.forEach((lesson) => {
    const card = document.createElement('div');
    card.className = 'bg-slate-900 lesson-card';

    const dayPrefix = targetDay === 'all'
      ? `<span class="lesson-day-prefix">${DAY_NAMES[lesson.dayOfWeek]?.slice(0, 2) || ''}</span>`
      : '';

    const groupText = lesson.group ? `Гр. ${lesson.group}` : '';

    card.innerHTML = `
      <div class="lesson-card-header">
        <div class="lesson-main-info">
          <div class="lesson-num-badge">#${lesson.lessonNumber}</div>
          <div class="lesson-title-box">
            <div class="lesson-time-row">
              ${dayPrefix}
              <span class="lesson-time">${lesson.startTime} – ${lesson.endTime}</span>
            </div>
            <h3 class="lesson-subject">${lesson.subject}</h3>
          </div>
        </div>

        ${groupText ? `<span class="lesson-group-badge">${groupText}</span>` : ''}
      </div>

      <div class="lesson-card-footer">
        <div class="lesson-classroom">
          <span class="classroom-icon">📍</span>
          <span class="classroom-text">${lesson.classroom || 'Кабинет не указан'}</span>
        </div>
        <button class="open-journal-btn"
          data-group="${lesson.group || ''}"
          data-lesson="${lesson.lessonNumber}"
          title="Открыть эту пару в журнале">
          <span>📝 В журнал</span>
        </button>
      </div>
    `;

    container.appendChild(card);
  });

  document.querySelectorAll('.open-journal-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.getAttribute('data-group');
      const lessonNum = btn.getAttribute('data-lesson');
      if (typeof onOpenJournal === 'function') {
        onOpenJournal(group, lessonNum);
      }
    });
  });
}

export function setupDayFilterButtons(onDayChanged) {
  document.querySelectorAll('.day-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.day-btn').forEach((b) => b.classList.remove('bg-blue-600'));
      btn.classList.add('bg-blue-600');
      state.activeDay = btn.getAttribute('data-day');
      if (typeof onDayChanged === 'function') onDayChanged();
    });
  });
}

export function renderBells() {
  const container = document.getElementById('bellsList');
  if (!container || !state.bells) return;
  container.innerHTML = '';
  state.bells.forEach((bell) => {
    const item = document.createElement('div');
    item.className = 'bell-item';
    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span class="bell-badge">${bell.lessonNumber}</span>
        <span style="font-weight: 600; color: #f1f5f9;">${bell.lessonNumber} пара</span>
      </div>
      <span class="bell-time-badge">${bell.startTime} — ${bell.endTime}</span>
    `;
    container.appendChild(item);
  });
}
