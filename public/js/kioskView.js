// ==========================================================================
// KIOSK VIEW CONTROLLER (Управление интерактивным табло 43″)
// ==========================================================================
import { loadAllSchedulesData, getAllGroupsList, getAllTeachersList, getCurrentBellStatus } from './kioskData.js';
import {
  renderKioskLiveCards,
  renderKioskGroupCards,
  renderKioskTeacherCards,
  renderKioskBellsCards,
} from './kioskCards.js';

let isKioskActive = false;
let currentKioskSubtab = 'live'; // 'live' | 'groups' | 'teachers' | 'bells'
let selectedGroup = null;
let selectedTeacher = null;
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

  await loadAllSchedulesData();
  switchKioskSubtab('live');
  startKioskClock();
  resetInactivityTimer();
}

export function exitKioskMode() {
  isKioskActive = false;
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
      if (currentKioskSubtab !== 'live' || selectedGroup || selectedTeacher) {
        selectedGroup = null;
        selectedTeacher = null;
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
    el.parentElement?.classList.toggle('hidden', currentKioskSubtab === 'live' && !selectedGroup && !selectedTeacher);
  }
}

export function switchKioskSubtab(subtab) {
  currentKioskSubtab = subtab;
  resetInactivityTimer();

  const subtabs = ['live', 'groups', 'teachers', 'bells'];
  subtabs.forEach((st) => {
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
  const scheduleView = document.getElementById('kioskGroupScheduleView');
  if (!groupsGrid || !scheduleView) return;

  if (!selectedGroup) {
    groupsGrid.classList.remove('hidden');
    scheduleView.classList.add('hidden');

    groupsGrid.innerHTML = getAllGroupsList().map((g) => `
      <button type="button" class="kiosk-group-tile" data-group="${g}">
        <span class="kiosk-group-tile-sub">Группа</span>
        <span class="kiosk-group-tile-name">${g}</span>
      </button>
    `).join('');

    groupsGrid.querySelectorAll('.kiosk-group-tile').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedGroup = btn.getAttribute('data-group');
        activeDayFilter = 'today';
        renderKioskGroupCards(selectedGroup, activeDayFilter, () => {
          selectedGroup = null;
          renderKioskGroups();
        }, (d) => {
          activeDayFilter = d;
          renderKioskGroups();
        });
      });
    });
  } else {
    renderKioskGroupCards(selectedGroup, activeDayFilter, () => {
      selectedGroup = null;
      renderKioskGroups();
    }, (d) => {
      activeDayFilter = d;
      renderKioskGroups();
    });
  }
}

function renderKioskTeachers() {
  const teachersGrid = document.getElementById('kioskTeachersGrid');
  const scheduleView = document.getElementById('kioskTeacherScheduleView');
  if (!teachersGrid || !scheduleView) return;

  if (!selectedTeacher) {
    teachersGrid.classList.remove('hidden');
    scheduleView.classList.add('hidden');

    teachersGrid.innerHTML = getAllTeachersList().map((t) => `
      <button type="button" class="kiosk-teacher-tile" data-teacher="${t}">
        <span class="kiosk-teacher-icon">👨‍🏫</span>
        <span class="kiosk-teacher-name">${t}</span>
      </button>
    `).join('');

    teachersGrid.querySelectorAll('.kiosk-teacher-tile').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedTeacher = btn.getAttribute('data-teacher');
        activeDayFilter = 'today';
        renderKioskTeacherCards(selectedTeacher, activeDayFilter, () => {
          selectedTeacher = null;
          renderKioskTeachers();
        }, (d) => {
          activeDayFilter = d;
          renderKioskTeachers();
        });
      });
    });
  } else {
    renderKioskTeacherCards(selectedTeacher, activeDayFilter, () => {
      selectedTeacher = null;
      renderKioskTeachers();
    }, (d) => {
      activeDayFilter = d;
      renderKioskTeachers();
    });
  }
}

export function setupKioskEventListeners() {
  ['live', 'groups', 'teachers', 'bells'].forEach((st) => {
    document.getElementById(`kioskNavBtn_${st}`)?.addEventListener('click', () => {
      selectedGroup = null;
      selectedTeacher = null;
      switchKioskSubtab(st);
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
  window.addEventListener('keydown', () => resetInactivityTimer(), { passive: true });

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('kiosk') || urlParams.get('mode') === 'kiosk') {
    enterKioskMode();
  }
}
