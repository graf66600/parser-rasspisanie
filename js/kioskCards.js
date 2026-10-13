// ==========================================================================
// KIOSK CARDS & SCHEDULE RENDERERS (Отрисовка карточек табло, пар и групп)
// ==========================================================================
import { DAY_NAMES } from './state.js';
import {
  getLiveSchedule,
  getLessonsForGroup,
  getLessonsForTeacher,
  getBellsSchedule,
  getCurrentBellStatus,
} from './kioskData.js';

export function formatKioskSubject(subject) {
  if (!subject) return 'Занятие';
  const s = String(subject).trim();
  const fixes = {
    'Анатомия и': 'Анатомия и физиология',
    'физиология': 'Анатомия и физиология',
    'Производствен': 'Производственная практика',
    'Клиническая': 'Клиническая фармакология',
    'ие с основами': 'Лекарствоведение с основами фармакогнозии',
    'Лекарствоведение с': 'Лекарствоведение с основами фармакогнозии',
    'фармакогнозии': 'Лекарствоведение с основами фармакогнозии',
    'детских': 'Пропедевтика детских болезней',
    'Сестринский уход в': 'Сестринский уход в педиатрии',
    'Сестринский': 'Сестринский уход',
    'хирургии': 'Сестринский уход в хирургии',
    'во фтизиатрии': 'Сестринский уход во фтизиатрии',
    'терапевтического': 'Сестринский уход в терапии',
    'терапевтического профиля': 'Сестринский уход в терапии',
    'профиля': 'Сестринский уход в терапии',
    'деятельности': 'Организация деятельности',
    'деятельности аптек': 'Организация деятельности аптек',
    'Диагностика и': 'Диагностика и лечение заболеваний',
    'лечение': 'Диагностика и лечение заболеваний',
    'лечение заболеваний': 'Диагностика и лечение заболеваний',
    'заболеваний': 'Диагностика и лечение заболеваний',
    'ДиЛ заболеваний': 'Диагностика и лечение заболеваний',
    'ДиЛ заболеваний  в': 'Диагностика и лечение заболеваний в педиатрии',
    'неорганическая химия': 'Общая и неорганическая химия',
    'Общая и': 'Общая и неорганическая химия',
    'Здоровый человек': 'Здоровый человек и его окружение',
    'Основы бережливого': 'Основы бережливого производства',
    'Латин. I': 'Латинский язык (I)',
    'Латин. II': 'Латинский язык (II)',
    'Иностранный': 'Иностранный язык',
    'История': 'История России',
    'Физра': 'Физическая культура',
  };

  if (fixes[s]) return fixes[s];
  if (s.startsWith('Производствен')) return 'Производственная практика';
  if (s.startsWith('Клиническая') && !s.includes('фармакология')) return 'Клиническая фармакология';
  if (s.startsWith('Анатомия и') && !s.includes('физиология')) return 'Анатомия и физиология';
  if (s.startsWith('Здоровый человек') && !s.includes('окружение')) return 'Здоровый человек и его окружение';
  return s;
}

export function renderKioskLiveCards() {
  const container = document.getElementById('kioskLiveGrid');
  const titleEl = document.getElementById('kioskLiveTitle');
  if (!container) return;

  const { bellStatus, targetLessonNum, lessons } = getLiveSchedule(new Date());

  if (titleEl) {
    if (bellStatus.status === 'lesson') {
      titleEl.textContent = `Пары прямо сейчас (${targetLessonNum}-я пара • ${bellStatus.bell?.startTime} - ${bellStatus.bell?.endTime}):`;
    } else if (bellStatus.status === 'break') {
      titleEl.textContent = `Следующие пары (${targetLessonNum}-я пара • начнётся в ${bellStatus.bell?.startTime}):`;
    } else {
      titleEl.textContent = `Занятия на сегодня (${targetLessonNum}-я пара):`;
    }
  }

  if (lessons.length === 0) {
    container.innerHTML = `
      <div class="kiosk-empty-box">
        <div class="kiosk-empty-icon">☕</div>
        <div class="kiosk-empty-title">Сейчас пары не проводятся</div>
        <p class="kiosk-empty-text">Выберите группу или преподавателя в верхнем меню, чтобы посмотреть расписание на день.</p>
      </div>`;
    return;
  }

  container.innerHTML = lessons.map((l) => {
    const fullSubj = formatKioskSubject(l.subject);
    return `
    <div class="kiosk-live-card">
      <div class="kiosk-live-header">
        <span class="kiosk-group-badge">Группа ${l.group || '—'}</span>
        <span class="kiosk-room-badge">📍 ${l.classroom || 'Кабинет не указан'}</span>
      </div>
      <h3 class="kiosk-live-subject" title="${fullSubj}">${fullSubj}</h3>
      <div class="kiosk-live-teacher">
        <span>👨‍🏫</span>
        <span>${l.teacher}</span>
      </div>
      <div class="kiosk-live-time">
        <span>⏰ ${l.startTime} – ${l.endTime}</span>
        <span class="kiosk-lesson-num">#${l.lessonNumber} пара</span>
      </div>
    </div>`;
  }).join('');
}

export function renderKioskGroupCards(selectedGroup, activeDayFilter, onBack, onDayChange) {
  const scheduleContainer = document.getElementById('kioskGroupScheduleView');
  if (!scheduleContainer) return;

  const now = new Date();
  const jsDay = now.getDay();
  const todayNum = jsDay === 0 ? 7 : jsDay;
  const tomorrowNum = todayNum === 7 ? 1 : todayNum + 1;

  let targetDay = todayNum;
  if (activeDayFilter === 'tomorrow') targetDay = tomorrowNum;
  else if (activeDayFilter === 'all') targetDay = null;

  const lessons = getLessonsForGroup(selectedGroup, targetDay);

  scheduleContainer.innerHTML = `
    <div class="kiosk-sub-header">
      <div class="flex items-center gap-3">
        <button type="button" id="kioskBackToGroupsBtn" class="kiosk-back-btn">← Все группы</button>
        <h2 class="kiosk-sub-title">Группа ${selectedGroup}</h2>
      </div>
      <div class="kiosk-day-filter">
        <button type="button" class="kiosk-day-pill ${activeDayFilter === 'today' ? 'active' : ''}" data-day="today">Сегодня</button>
        <button type="button" class="kiosk-day-pill ${activeDayFilter === 'tomorrow' ? 'active' : ''}" data-day="tomorrow">Завтра</button>
        <button type="button" class="kiosk-day-pill ${activeDayFilter === 'all' ? 'active' : ''}" data-day="all">Вся неделя</button>
      </div>
    </div>
    <div class="kiosk-lessons-grid">
      ${lessons.length === 0 ? `
        <div class="kiosk-empty-box col-span-full">
          <div class="kiosk-empty-icon">☕</div>
          <div class="kiosk-empty-title">Занятий нет</div>
          <p class="kiosk-empty-text">Для группы ${selectedGroup} в выбранный день пар не запланировано.</p>
        </div>
      ` : lessons.map((l) => {
        const fullSubj = formatKioskSubject(l.subject);
        return `
        <div class="kiosk-lesson-card">
          <div class="kiosk-lesson-card-top">
            <span class="kiosk-lesson-badge">#${l.lessonNumber} пара</span>
            <span class="kiosk-lesson-time">${l.startTime} – ${l.endTime}</span>
            <span class="kiosk-room-badge">📍 ${l.classroom || 'Кабинет не указан'}</span>
          </div>
          <h3 class="kiosk-lesson-subject" title="${fullSubj}">${fullSubj}</h3>
          <div class="kiosk-lesson-footer">
            <span class="kiosk-teacher-name">👨‍🏫 ${l.teacher}</span>
            ${activeDayFilter === 'all' ? `<span class="kiosk-day-badge">${DAY_NAMES[l.dayOfWeek]}</span>` : ''}
          </div>
        </div>
      `;
      }).join('')}
    </div>
  `;

  document.getElementById('kioskBackToGroupsBtn')?.addEventListener('click', onBack);
  scheduleContainer.querySelectorAll('.kiosk-day-pill').forEach((btn) => {
    btn.addEventListener('click', () => onDayChange(btn.getAttribute('data-day')));
  });
}

export function renderKioskTeacherCards(selectedTeacher, activeDayFilter, onBack, onDayChange) {
  const scheduleContainer = document.getElementById('kioskTeacherScheduleView');
  if (!scheduleContainer) return;

  const now = new Date();
  const jsDay = now.getDay();
  const todayNum = jsDay === 0 ? 7 : jsDay;
  const tomorrowNum = todayNum === 7 ? 1 : todayNum + 1;

  let targetDay = todayNum;
  if (activeDayFilter === 'tomorrow') targetDay = tomorrowNum;
  else if (activeDayFilter === 'all') targetDay = null;

  const lessons = getLessonsForTeacher(selectedTeacher, targetDay);

  scheduleContainer.innerHTML = `
    <div class="kiosk-sub-header">
      <div class="flex items-center gap-3">
        <button type="button" id="kioskBackToTeachersBtn" class="kiosk-back-btn">← Все преподаватели</button>
        <h2 class="kiosk-sub-title">${selectedTeacher}</h2>
      </div>
      <div class="kiosk-day-filter">
        <button type="button" class="kiosk-day-pill ${activeDayFilter === 'today' ? 'active' : ''}" data-day="today">Сегодня</button>
        <button type="button" class="kiosk-day-pill ${activeDayFilter === 'tomorrow' ? 'active' : ''}" data-day="tomorrow">Завтра</button>
        <button type="button" class="kiosk-day-pill ${activeDayFilter === 'all' ? 'active' : ''}" data-day="all">Вся неделя</button>
      </div>
    </div>
    <div class="kiosk-lessons-grid">
      ${lessons.length === 0 ? `
        <div class="kiosk-empty-box col-span-full">
          <div class="kiosk-empty-icon">☕</div>
          <div class="kiosk-empty-title">Занятий нет</div>
          <p class="kiosk-empty-text">У преподавателя ${selectedTeacher} в выбранный день пар нет.</p>
        </div>
      ` : lessons.map((l) => {
        const fullSubj = formatKioskSubject(l.subject);
        return `
        <div class="kiosk-lesson-card">
          <div class="kiosk-lesson-card-top">
            <span class="kiosk-lesson-badge">#${l.lessonNumber} пара</span>
            <span class="kiosk-lesson-time">${l.startTime} – ${l.endTime}</span>
            <span class="kiosk-room-badge">📍 ${l.classroom || 'Кабинет не указан'}</span>
          </div>
          <h3 class="kiosk-lesson-subject" title="${fullSubj}">${fullSubj}</h3>
          <div class="kiosk-lesson-footer">
            <span class="kiosk-group-badge">Группа ${l.group}</span>
            ${activeDayFilter === 'all' ? `<span class="kiosk-day-badge">${DAY_NAMES[l.dayOfWeek]}</span>` : ''}
          </div>
        </div>
      `;
      }).join('')}
    </div>
  `;

  document.getElementById('kioskBackToTeachersBtn')?.addEventListener('click', onBack);
  scheduleContainer.querySelectorAll('.kiosk-day-pill').forEach((btn) => {
    btn.addEventListener('click', () => onDayChange(btn.getAttribute('data-day')));
  });
}

export function renderKioskBellsCards() {
  const container = document.getElementById('kioskBellsContainer');
  if (!container) return;

  const bells = getBellsSchedule();
  const bellStatus = getCurrentBellStatus(new Date());

  container.innerHTML = `
    <div class="kiosk-bells-list">
      ${bells.map((b) => {
        const isActive = bellStatus.status === 'lesson' && bellStatus.currentLessonNum === b.lessonNumber;
        return `
          <div class="kiosk-bell-card ${isActive ? 'active-bell' : ''}">
            <div class="kiosk-bell-num">
              <span>Пара #${b.lessonNumber}</span>
              ${isActive ? '<span class="kiosk-bell-live-tag">🔴 ИДЁТ СЕЙЧАС</span>' : ''}
            </div>
            <div class="kiosk-bell-time-range">${b.startTime} — ${b.endTime}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}
