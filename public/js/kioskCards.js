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

export function renderKioskScheduleModalContent({
  titleBadge,
  titleName,
  entityType,
  lessons,
  activeDayFilter,
  onDayChange,
}) {
  const badgeEl = document.getElementById('kioskModalTypeBadge');
  const titleEl = document.getElementById('kioskModalTitle');
  const bannerContainer = document.getElementById('kioskModalLiveBanner');
  const gridContainer = document.getElementById('kioskModalLessonsGrid');
  const modalWindow = document.getElementById('kioskScheduleModal');
  if (!modalWindow || !gridContainer) return;

  if (badgeEl) badgeEl.textContent = titleBadge;
  if (titleEl) titleEl.textContent = titleName;

  modalWindow.querySelectorAll('.kiosk-day-pill').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-day') === activeDayFilter);
  });

  const now = new Date();
  const bellStatus = getCurrentBellStatus(now);
  const isToday = activeDayFilter === 'today';

  let liveBannerHtml = '';
  if (isToday) {
    if (bellStatus.status === 'lesson') {
      const liveLesson = lessons.find((l) => l.lessonNumber === bellStatus.currentLessonNum);
      if (liveLesson) {
        const fullSubj = formatKioskSubject(liveLesson.subject);
        const otherInfo = entityType === 'group' ? `Преподаватель: ${liveLesson.teacher}` : `Группа: ${liveLesson.group}`;
        liveBannerHtml = `
          <div class="kiosk-live-banner is-active">
            <span class="kiosk-live-banner-pulse">🔴</span>
            <div class="kiosk-live-banner-content">
              <div class="kiosk-live-banner-title">СЕЙЧАС ИДЁТ ${bellStatus.currentLessonNum}-я ПАРА (до ${bellStatus.bell?.endTime}, осталось ${bellStatus.minutesLeft} мин)</div>
              <div class="kiosk-live-banner-sub"><strong>${fullSubj}</strong> • ${otherInfo} • 📍 ${liveLesson.classroom || 'Кабинет не указан'}</div>
            </div>
          </div>`;
      } else {
        liveBannerHtml = `
          <div class="kiosk-live-banner is-idle">
            <span>☕</span>
            <div class="kiosk-live-banner-content">
              <div class="kiosk-live-banner-title">СЕЙЧАС ИДЁТ ${bellStatus.currentLessonNum}-я ПАРА (до ${bellStatus.bell?.endTime})</div>
              <div class="kiosk-live-banner-sub">В текущую пару занятия нет (окно). Ближайшие пары ниже:</div>
            </div>
          </div>`;
      }
    } else if (bellStatus.status === 'break') {
      const nextLesson = lessons.find((l) => l.lessonNumber === bellStatus.targetLessonNum);
      if (nextLesson) {
        const fullSubj = formatKioskSubject(nextLesson.subject);
        const otherInfo = entityType === 'group' ? `Преподаватель: ${nextLesson.teacher}` : `Группа: ${nextLesson.group}`;
        liveBannerHtml = `
          <div class="kiosk-live-banner is-break">
            <span class="kiosk-live-banner-pulse">⏳</span>
            <div class="kiosk-live-banner-content">
              <div class="kiosk-live-banner-title">СЕЙЧАС ПЕРЕМЕНА (до ${bellStatus.bell?.startTime}, осталось ${bellStatus.minutesLeft} мин)</div>
              <div class="kiosk-live-banner-sub">СЛЕДУЮЩАЯ ПАРА #${bellStatus.targetLessonNum} (в ${bellStatus.bell?.startTime}): <strong>${fullSubj}</strong> • ${otherInfo} • 📍 ${nextLesson.classroom || 'Кабинет не указан'}</div>
            </div>
          </div>`;
      } else {
        liveBannerHtml = `
          <div class="kiosk-live-banner is-break">
            <span>⏳</span>
            <div class="kiosk-live-banner-content">
              <div class="kiosk-live-banner-title">СЕЙЧАС ПЕРЕМЕНА (до ${bellStatus.bell?.startTime}, осталось ${bellStatus.minutesLeft} мин)</div>
              <div class="kiosk-live-banner-sub">Следующая пара по расписанию звонков: #${bellStatus.targetLessonNum}.</div>
            </div>
          </div>`;
      }
    } else if (bellStatus.status === 'before') {
      liveBannerHtml = `
        <div class="kiosk-live-banner is-idle">
          <span>⏰</span>
          <div class="kiosk-live-banner-content">
            <div class="kiosk-live-banner-title">ЗАНЯТИЯ ЕЩЁ НЕ НАЧАЛИСЬ</div>
            <div class="kiosk-live-banner-sub">Первая пара начнётся в ${bellStatus.bell?.startTime || '08:00'}. Расписание на сегодня:</div>
          </div>
        </div>`;
    } else if (bellStatus.status === 'after') {
      liveBannerHtml = `
        <div class="kiosk-live-banner is-idle">
          <span>✓</span>
          <div class="kiosk-live-banner-content">
            <div class="kiosk-live-banner-title">ВСЕ ЗАНЯТИЯ НА СЕГОДНЯ ОКОНЧЕНЫ</div>
            <div class="kiosk-live-banner-sub">Вы можете посмотреть расписание на завтра или на всю неделю.</div>
          </div>
        </div>`;
    } else if (bellStatus.status === 'weekend') {
      liveBannerHtml = `
        <div class="kiosk-live-banner is-idle">
          <span>🏖</span>
          <div class="kiosk-live-banner-content">
            <div class="kiosk-live-banner-title">СЕГОДНЯ ВЫХОДНОЙ ДЕНЬ</div>
            <div class="kiosk-live-banner-sub">Занятий нет. Посмотрите расписание на завтра или на всю неделю.</div>
          </div>
        </div>`;
    }
  }

  if (bannerContainer) {
    bannerContainer.innerHTML = liveBannerHtml;
  }

  if (lessons.length === 0) {
    gridContainer.innerHTML = `
      <div class="kiosk-empty-box col-span-full">
        <div class="kiosk-empty-icon">☕</div>
        <div class="kiosk-empty-title">Занятий нет</div>
        <p class="kiosk-empty-text">Для ${titleName} в выбранный период (${activeDayFilter === 'today' ? 'сегодня' : activeDayFilter === 'tomorrow' ? 'завтра' : 'на неделю'}) пар не запланировано.</p>
        <div class="kiosk-empty-actions">
          ${activeDayFilter !== 'tomorrow' ? '<button type="button" class="kiosk-day-pill" data-target-day="tomorrow">📅 На завтра</button>' : ''}
          ${activeDayFilter !== 'all' ? '<button type="button" class="kiosk-day-pill" data-target-day="all">🗓 На всю неделю</button>' : ''}
        </div>
      </div>`;
    gridContainer.querySelectorAll('.kiosk-empty-actions button').forEach((btn) => {
      btn.addEventListener('click', () => onDayChange(btn.getAttribute('data-target-day')));
    });
    return;
  }

  gridContainer.innerHTML = lessons.map((l) => {
    const fullSubj = formatKioskSubject(l.subject);
    const isLive = isToday && bellStatus.status === 'lesson' && l.lessonNumber === bellStatus.currentLessonNum;
    const isNext = isToday && bellStatus.status === 'break' && l.lessonNumber === bellStatus.targetLessonNum;

    const cardClass = isLive ? 'kiosk-lesson-card is-live-now' : isNext ? 'kiosk-lesson-card is-next-soon' : 'kiosk-lesson-card';
    const badgeLive = isLive
      ? `<span class="kiosk-live-tag-active">🔴 ИДЁТ СЕЙЧАС</span>`
      : isNext
      ? `<span class="kiosk-next-tag-active">⏳ СЛЕДУЮЩАЯ ПАРА</span>`
      : '';
    const otherInfo = entityType === 'group'
      ? `<span class="kiosk-teacher-name">👨‍🏫 ${l.teacher}</span>`
      : `<span class="kiosk-group-badge">Группа ${l.group}</span>`;

    return `
      <div class="${cardClass}">
        <div class="kiosk-lesson-card-top">
          <div class="flex items-center gap-2">
            <span class="kiosk-lesson-badge">#${l.lessonNumber} пара</span>
            ${badgeLive}
          </div>
          <span class="kiosk-lesson-time">${l.startTime} – ${l.endTime}</span>
          <span class="kiosk-room-badge">📍 ${l.classroom || 'Кабинет не указан'}</span>
        </div>
        <h3 class="kiosk-lesson-subject" title="${fullSubj}">${fullSubj}</h3>
        <div class="kiosk-lesson-footer">
          ${otherInfo}
          ${activeDayFilter === 'all' ? `<span class="kiosk-day-badge">${DAY_NAMES[l.dayOfWeek]}</span>` : ''}
        </div>
      </div>`;
  }).join('');
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
