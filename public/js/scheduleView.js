// ==========================================================================
// SCHEDULE VIEW & BELLS RENDERING
// ==========================================================================
import { DAY_NAMES, state, formatLocalDate } from './state.js';
import { getRecommendedLesson } from './topicHelper.js';
import {
  getLessonOverride,
  setLessonOverride,
  renderBellsPresetSelector,
  initBellsPreset,
} from './bellsPresets.js';

function getDateForDayOfWeek(dayOfWeek) {
  const now = new Date();
  const currentJsDay = now.getDay();
  const currentDay = currentJsDay === 0 ? 7 : currentJsDay;
  const diff = dayOfWeek - currentDay;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  return formatLocalDate(d);
}

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

  initBellsPreset();
  renderBellsPresetSelector('bellsPresetContainer', () => renderSchedule(onOpenJournal));

  if (!state.schedule?.lessons) {
    container.innerHTML = `
      <div class="space-y-3">
        <div class="skeleton-card">
          <div class="skeleton-header">
            <div class="skeleton-pill" style="width: 36px; height: 36px; border-radius: 10px;"></div>
            <div style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
              <div class="skeleton-line" style="width: 45%; height: 12px; border-radius: 6px;"></div>
              <div class="skeleton-line" style="width: 75%; height: 16px; border-radius: 6px;"></div>
            </div>
            <div class="skeleton-pill" style="width: 52px; height: 24px; border-radius: 8px;"></div>
          </div>
          <div class="skeleton-line" style="width: 90%; height: 14px; margin-top: 14px; border-radius: 6px;"></div>
        </div>
      </div>
    `;
    return;
  }

  const activeDay = state.activeDay || 'all';
  let filtered = state.schedule.lessons;
  if (activeDay !== 'all') {
    filtered = filtered.filter((l) => Number(l.dayOfWeek) === Number(activeDay));
  }

  const titleEl = document.getElementById('scheduleDayTitle');
  const countEl = document.getElementById('scheduleTotalLessons');
  if (titleEl) {
    titleEl.textContent = activeDay === 'all' ? 'Вся неделя' : (DAY_NAMES[activeDay] || 'День');
  }
  if (countEl) {
    countEl.textContent = formatLessonsCount(filtered.length);
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏖️</div>
        <div class="empty-title">Занятий нет</div>
        <div class="empty-desc">В этот день у преподавателя нет запланированных пар в расписании</div>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  filtered.forEach((lesson) => {
    const card = document.createElement('div');
    card.className = 'lesson-card';

    const dayPrefix = activeDay === 'all'
      ? `<span class="lesson-day-badge">${DAY_NAMES[lesson.dayOfWeek]?.slice(0, 2) || ''}</span>`
      : '';

    const lessonDate = getDateForDayOfWeek(lesson.dayOfWeek);
    const rec = getRecommendedLesson(lesson.group, lesson.lessonNumber, lessonDate);

    const bellSlot = (state.bells || []).find((b) => Number(b.lessonNumber) === Number(lesson.lessonNumber));
    const startTime = bellSlot ? bellSlot.startTime : lesson.startTime;
    const endTime = bellSlot ? bellSlot.endTime : lesson.endTime;

    const lessonKey = `${lesson.group || ''}_${lesson.lessonNumber}_${lesson.dayOfWeek}_${lesson.subgroup || ''}`;
    const override = getLessonOverride(lessonKey);

    let overrideBanner = '';
    if (override?.type === 'cancelled') {
      overrideBanner = `
        <div class="px-3 py-1.5 mb-2 bg-red-950/80 border border-red-700/60 rounded-xl text-red-200 text-xs flex items-center justify-between">
          <span>🚫 <b>Пара отменена</b>${override.notes ? `: ${override.notes}` : ''}</span>
          <button type="button" class="clear-override-btn text-[11px] underline text-red-300 cursor-pointer" data-key="${lessonKey}">Сбросить</button>
        </div>
      `;
    } else if (override?.type === 'moved') {
      overrideBanner = `
        <div class="px-3 py-1.5 mb-2 bg-amber-950/80 border border-amber-700/60 rounded-xl text-amber-200 text-xs flex items-center justify-between">
          <span>🔄 <b>Перенос</b>: ${override.classroom || ''}${override.notes ? ` (${override.notes})` : ''}</span>
          <button type="button" class="clear-override-btn text-[11px] underline text-amber-300 cursor-pointer" data-key="${lessonKey}">Сбросить</button>
        </div>
      `;
    } else if (override?.type === 'replaced') {
      overrideBanner = `
        <div class="px-3 py-1.5 mb-2 bg-purple-950/80 border border-purple-700/60 rounded-xl text-purple-200 text-xs flex items-center justify-between">
          <span>⚠️ <b>Замена</b>: ${override.teacher || ''}${override.notes ? ` (${override.notes})` : ''}</span>
          <button type="button" class="clear-override-btn text-[11px] underline text-purple-300 cursor-pointer" data-key="${lessonKey}">Сбросить</button>
        </div>
      `;
    }

    const groupText = lesson.group ? `${lesson.group}${lesson.subgroup ? ` (${lesson.subgroup} п/г)` : ''}` : '';
    const classroomText = override?.type === 'moved' ? `${override.classroom} (перенос)` : (lesson.classroom || 'Кабинет не указан');

    const topicPreview = rec?.text ? `
      <div class="lesson-topic-preview">
        <span class="topic-label">${rec.type === 'theory' ? 'Лекция' : 'Практика'} №${rec.number}:</span>
        <span class="topic-text">${rec.text}</span>
      </div>
    ` : '';

    card.innerHTML = `
      ${overrideBanner}
      <div class="lesson-card-header">
        <div class="lesson-main-info">
          <div class="lesson-num-badge">#${lesson.lessonNumber}</div>
          <div class="lesson-title-box">
            <div class="lesson-time-row">
              ${dayPrefix}
              <span class="lesson-time">${startTime} – ${endTime}</span>
            </div>
            <h3 class="lesson-subject">${lesson.subject}</h3>
          </div>
        </div>

        ${groupText ? `<span class="lesson-group-badge">${groupText}</span>` : ''}
      </div>

      ${topicPreview}

      <div class="lesson-card-footer">
        <div class="lesson-classroom flex items-center gap-1.5">
          <span class="classroom-icon">📍</span>
          <span class="classroom-text">${classroomText}</span>
          <button type="button" class="lesson-override-btn text-[10px] text-slate-400 hover:text-amber-300 px-2 py-0.5 rounded-md border border-slate-700/60 transition cursor-pointer" data-key="${lessonKey}" title="Указать замену или отмену пары">⚡ Замена</button>
        </div>
        <button class="open-journal-btn"
          data-group="${lesson.group || ''}"
          data-lesson="${lesson.lessonNumber}"
          data-subgroup="${lesson.subgroup || ''}"
          data-date="${lessonDate}"
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
      const date = btn.getAttribute('data-date');
      const subgroup = btn.getAttribute('data-subgroup');
      if (typeof onOpenJournal === 'function') {
        onOpenJournal(group, lessonNum, date, subgroup);
      }
    });
  });

  document.querySelectorAll('.lesson-override-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = btn.getAttribute('data-key');
      const action = prompt('Управление заменой / отменой пары:\n1 — Отменить пару\n2 — Перенести в другой кабинет\n3 — Замена преподавателя\n0 — Сбросить замену');
      if (action === '1') {
        const reason = prompt('Причина или комментарий (необязательно):', 'по расписанию');
        setLessonOverride(key, { type: 'cancelled', notes: reason });
        renderSchedule(onOpenJournal);
      } else if (action === '2') {
        const room = prompt('Новый кабинет:', 'ауд. 230');
        if (room) {
          setLessonOverride(key, { type: 'moved', classroom: room });
          renderSchedule(onOpenJournal);
        }
      } else if (action === '3') {
        const teacher = prompt('ФИО преподавателя замены:');
        if (teacher) {
          setLessonOverride(key, { type: 'replaced', teacher });
          renderSchedule(onOpenJournal);
        }
      } else if (action === '0') {
        setLessonOverride(key, null);
        renderSchedule(onOpenJournal);
      }
    });
  });

  document.querySelectorAll('.clear-override-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = btn.getAttribute('data-key');
      setLessonOverride(key, null);
      renderSchedule(onOpenJournal);
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
