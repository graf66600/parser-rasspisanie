// ==========================================================================
// KIOSK VIEW CONTROLLER (Управление интерактивным табло 43″)
// ==========================================================================
import {
  loadAllSchedulesData,
  getAllGroupsList,
  getAllTeachersList,
  getCurrentBellStatus,
  getLessonsForGroup,
  getLessonsForTeacher,
} from './kioskData.js';
import {
  renderKioskLiveCards,
  renderKioskScheduleModalContent,
  renderKioskBellsCards,
} from './kioskCards.js';

let isKioskActive = false;
let currentKioskSubtab = 'live'; // 'live' | 'groups' | 'teachers' | 'bells'
let modalEntity = null; // { type: 'group' | 'teacher', name: string } | null
let activeDayFilter = 'today';
let inactivityTimer = null;
let clockInterval = null;
const INACTIVITY_TIMEOUT_SEC = 60;
let secondsUntilReset = INACTIVITY_TIMEOUT_SEC;

export function isKioskMode() {
  return isKioskActive;
}

export async function enterKioskMode() {
  isKioskActive = true;
  document.body.classList.add('kiosk-mode');

  const kioskContainer = document.getElementById('kioskContainer');
  if (kioskContainer) kioskContainer.classList.remove('hidden');

  try {
    await loadAllSchedulesData();
  } catch (err) {
    console.warn('Не удалось загрузить данные расписания:', err);
  }

  switchKioskSubtab('live');
  startKioskClock();
  resetInactivityTimer();
}

export function exitKioskMode() {
  isKioskActive = false;
  closeKioskScheduleModal();
  document.body.classList.remove('kiosk-mode');

  const kioskContainer = document.getElementById('kioskContainer');
  if (kioskContainer) kioskContainer.classList.add('hidden');

  if (clockInterval) clearInterval(clockInterval);
  if (inactivityTimer) clearInterval(inactivityTimer);

  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}

export function toggleKioskMode() {
  if (isKioskActive) exitKioskMode();
  else enterKioskMode();
}

function startKioskClock() {
  if (clockInterval) clearInterval(clockInterval);

  const update = () => {
    if (!isKioskActive) return;
    const now = new Date();
    const clockEl = document.getElementById('kioskClockTime');
    const dateEl = document.getElementById('kioskClockDate');
    const bellStatusPill = document.getElementById('kioskBellStatusPill');

    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    if (dateEl) {
      const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
      const dateStr = now.toLocaleDateString('ru-RU', options);
      dateEl.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }

    const bellStatus = getCurrentBellStatus(now);
    if (bellStatusPill) {
      bellStatusPill.textContent = bellStatus.message;
      bellStatusPill.className = 'kiosk-bell-pill ' + (
        bellStatus.status === 'lesson' ? 'pill-active-lesson' :
        bellStatus.status === 'break' ? 'pill-break' : 'pill-idle'
      );
    }

    if (currentKioskSubtab === 'live' && now.getSeconds() === 0) {
      renderKioskLiveCards();
    }
  };

  update();
  clockInterval = setInterval(update, 1000);
}

export function resetInactivityTimer() {
  secondsUntilReset = INACTIVITY_TIMEOUT_SEC;
  updateResetIndicator();

  if (inactivityTimer) clearInterval(inactivityTimer);
  inactivityTimer = setInterval(() => {
    if (!isKioskActive) return;
    secondsUntilReset--;
    updateResetIndicator();

    if (secondsUntilReset <= 0) {
      if (currentKioskSubtab !== 'live' || modalEntity) {
        closeKioskScheduleModal();
        switchKioskSubtab('live');
      }
      secondsUntilReset = INACTIVITY_TIMEOUT_SEC;
      updateResetIndicator();
    }
  }, 1000);
}

function updateResetIndicator() {
  const el = document.getElementById('kioskResetTimer');
  if (el) {
    el.textContent = `${secondsUntilReset}с`;
    el.parentElement?.classList.toggle('hidden', currentKioskSubtab === 'live' && !modalEntity);
  }
}

export function switchKioskSubtab(subtab) {
  currentKioskSubtab = subtab;
  closeKioskScheduleModal();
  resetInactivityTimer();

  ['live', 'groups', 'teachers', 'bells'].forEach((st) => {
    const section = document.getElementById(`kioskSection_${st}`);
    const navBtn = document.getElementById(`kioskNavBtn_${st}`);
    if (section) section.classList.toggle('hidden', st !== subtab);
    if (navBtn) navBtn.classList.toggle('active-subtab', st === subtab);
  });

  if (subtab === 'live') renderKioskLiveCards();
  else if (subtab === 'groups') renderKioskGroups();
  else if (subtab === 'teachers') renderKioskTeachers();
  else if (subtab === 'bells') renderKioskBellsCards();
}

function renderKioskGroups() {
  const groupsGrid = document.getElementById('kioskGroupsGrid');
  if (!groupsGrid) return;
  groupsGrid.innerHTML = getAllGroupsList().map((g) => `
    <button type="button" class="kiosk-group-tile" data-group="${g}">
      <span class="kiosk-group-tile-sub">Группа</span>
      <span class="kiosk-group-tile-name">${g}</span>
    </button>
  `).join('');
}

function renderKioskTeachers() {
  const teachersGrid = document.getElementById('kioskTeachersGrid');
  if (!teachersGrid) return;
  teachersGrid.innerHTML = getAllTeachersList().map((t) => `
    <button type="button" class="kiosk-teacher-tile" data-teacher="${t}">
      <span class="kiosk-teacher-icon">👨‍🏫</span>
      <span class="kiosk-teacher-name">${t}</span>
    </button>
  `).join('');
}

export function openKioskScheduleModal(type, name) {
  modalEntity = { type, name };
  activeDayFilter = 'today';
  resetInactivityTimer();

  const modal = document.getElementById('kioskScheduleModal');
  if (modal) modal.classList.remove('hidden');
  updateKioskModalContent();
}

export function closeKioskScheduleModal() {
  modalEntity = null;
  const modal = document.getElementById('kioskScheduleModal');
  if (modal) modal.classList.add('hidden');
  resetInactivityTimer();
}

export function updateKioskModalContent() {
  if (!modalEntity) return;
  const { type, name } = modalEntity;

  const now = new Date();
  const jsDay = now.getDay();
  const todayNum = jsDay === 0 ? 7 : jsDay;
  const tomorrowNum = todayNum === 7 ? 1 : todayNum + 1;
  const targetDay = activeDayFilter === 'tomorrow' ? tomorrowNum : activeDayFilter === 'all' ? null : todayNum;

  const lessons = type === 'group'
    ? getLessonsForGroup(name, targetDay)
    : getLessonsForTeacher(name, targetDay);

  renderKioskScheduleModalContent({
    titleBadge: type === 'group' ? 'ГРУППА' : 'ПРЕПОДАВАТЕЛЬ',
    titleName: type === 'group' ? `Группа ${name}` : `👨‍🏫 ${name}`,
    entityType: type,
    lessons,
    activeDayFilter,
    onDayChange: (newDay) => {
      activeDayFilter = newDay;
      resetInactivityTimer();
      updateKioskModalContent();
    },
  });
}

export function setupKioskEventListeners() {
  ['live', 'groups', 'teachers', 'bells'].forEach((st) => {
    document.getElementById(`kioskNavBtn_${st}`)?.addEventListener('click', () => switchKioskSubtab(st));
  });

  // Делегированные обработчики кликов на плитки групп и преподавателей
  const groupsGrid = document.getElementById('kioskGroupsGrid');
  groupsGrid?.addEventListener('click', (e) => {
    const tile = e.target.closest('.kiosk-group-tile');
    if (!tile) return;
    const group = tile.getAttribute('data-group');
    if (group) openKioskScheduleModal('group', group);
  });

  const teachersGrid = document.getElementById('kioskTeachersGrid');
  teachersGrid?.addEventListener('click', (e) => {
    const tile = e.target.closest('.kiosk-teacher-tile');
    if (!tile) return;
    const teacher = tile.getAttribute('data-teacher');
    if (teacher) openKioskScheduleModal('teacher', teacher);
  });

  // Управление модальным окошком расписания
  document.getElementById('kioskModalCloseBtn')?.addEventListener('click', closeKioskScheduleModal);
  document.getElementById('kioskScheduleModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'kioskScheduleModal') closeKioskScheduleModal();
  });

  document.querySelectorAll('#kioskScheduleModal .kiosk-day-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      const day = btn.getAttribute('data-day');
      if (day) {
        activeDayFilter = day;
        resetInactivityTimer();
        updateKioskModalContent();
      }
    });
  });

  document.getElementById('toggleKioskBtn')?.addEventListener('click', toggleKioskMode);
  document.getElementById('kioskExitBtn')?.addEventListener('click', exitKioskMode);
  document.getElementById('kioskFullscreenBtn')?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  window.addEventListener('pointerdown', () => resetInactivityTimer(), { passive: true });
  window.addEventListener('keydown', (e) => {
    resetInactivityTimer();
    if (e.key === 'Escape') {
      if (modalEntity) closeKioskScheduleModal();
      else if (isKioskActive) exitKioskMode();
    }
  }, { passive: true });

  let lastActivityTime = 0;
  const onUserActivity = () => {
    const now = Date.now();
    if (now - lastActivityTime > 2000) {
      lastActivityTime = now;
      resetInactivityTimer();
    }
  };
  window.addEventListener('mousemove', onUserActivity, { passive: true });
  window.addEventListener('scroll', onUserActivity, { passive: true });

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('kiosk') || urlParams.get('mode') === 'kiosk') {
    enterKioskMode();
  }
}
