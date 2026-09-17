// ==========================================================================
// MAIN APPLICATION ENTRY POINT
// ==========================================================================
import { state, initLocalState, loadSchedule, loadTeachers, loadStudents, loadCurriculum, populateGroupSelects, updateHeaderStatus, formatLocalDate, PWA_VERSION } from './js/state.js';
import { renderSchedule, setupDayFilterButtons, renderBells } from './js/scheduleView.js';
import { updateJournalStudents, autoFillTopicForGroup, loadJournalHistory, setupJournalListeners } from './js/journalView.js';
import { renderManageStudents, setupStudentsListeners } from './js/studentsView.js';
import { setupUploadListeners } from './js/uploadView.js';
import { openJournalSummary, setupSummaryListeners } from './js/journalSummaryView.js';
import { setupNotifications } from './js/notifications.js';

// Инициализация PWA и Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`./sw.js?v=${PWA_VERSION}`).catch(() => {});
  });
}

// Telegram WebApp адаптация
if (window.Telegram?.WebApp) {
  try {
    window.Telegram.WebApp.ready();
    window.Telegram.WebApp.expand();
  } catch (e) {}
}

// Установка PWA
let deferredPrompt;
const installBtn = document.getElementById('installPwaBtn');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) installBtn.classList.remove('hidden');
});

installBtn?.addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      installBtn.classList.add('hidden');
    }
    deferredPrompt = null;
  }
});

// Управление табами
const tabs = {
  tabSchedule: document.getElementById('tabSchedule'),
  tabJournal: document.getElementById('tabJournal'),
  tabStudents: document.getElementById('tabStudents'),
  tabUpload: document.getElementById('tabUpload'),
  tabBells: document.getElementById('tabBells'),
};

const navButtons = document.querySelectorAll('.tab-nav-btn');

export function switchTab(tabId) {
  Object.keys(tabs).forEach((id) => {
    if (tabs[id]) tabs[id].classList.toggle('hidden', id !== tabId);
  });

  navButtons.forEach((btn) => {
    const isTarget = btn.getAttribute('data-tab') === tabId;
    btn.classList.toggle('text-blue-500', isTarget);
    btn.classList.toggle('text-slate-400', !isTarget);
  });

  if (tabId === 'tabJournal') {
    loadJournalHistory();
    updateJournalStudents();
    const g = document.getElementById('journalGroupSelect')?.value;
    const l = document.getElementById('journalLessonNumSelect')?.value;
    const topicInput = document.getElementById('journalTopicInput');
    if (topicInput && (!topicInput.value || topicInput.value.trim() === '')) {
      autoFillTopicForGroup(g, l);
    }
  } else if (tabId === 'tabStudents') {
    renderManageStudents(updateJournalStudents);
  } else if (tabId === 'tabBells') {
    renderBells();
  }
}

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
});

// Переход в журнал из расписания
function onOpenLessonInJournal(group, lessonNum, date) {
  const gSel = document.getElementById('journalGroupSelect');
  const lSel = document.getElementById('journalLessonNumSelect');
  if (gSel && group) gSel.value = group;
  if (lSel && lessonNum) lSel.value = String(lessonNum);

  const dateInput = document.getElementById('journalDateInput');
  if (dateInput) dateInput.value = date || formatLocalDate();

  updateJournalStudents();
  autoFillTopicForGroup(group, lessonNum);
  switchTab('tabJournal');
}

// Запуск приложения
async function initApp() {
  const dateInput = document.getElementById('journalDateInput');
  if (dateInput) dateInput.value = formatLocalDate();

  // 1. Мгновенная инициализация из localStorage (0мс, без блокировки интерфейса)
  initLocalState();
  updateHeaderStatus();
  renderSchedule(onOpenLessonInJournal);
  populateGroupSelects(updateJournalStudents);

  // Сразу загружаем и синхронизируем журнал, чтобы темы и типы были точными
  loadJournalHistory();

  // 2. Инициализация обработчиков UI
  setupDayFilterButtons(() => renderSchedule(onOpenLessonInJournal));
  setupNotifications();
  setupJournalListeners();
  setupSummaryListeners();

  // Слушатель переключения преподавателя (мульти-парсер)
  document.getElementById('teacherSelect')?.addEventListener('change', (e) => {
    const selected = e.target.value;
    loadSchedule(() => renderSchedule(onOpenLessonInJournal), selected);
  });

  document.getElementById('openSummaryModalBtn')?.addEventListener('click', () => {
    const currentGroup = document.getElementById('journalGroupSelect')?.value || '51ф';
    openJournalSummary(currentGroup);
  });
  setupStudentsListeners(updateJournalStudents);
  setupUploadListeners(async () => {
    await loadTeachers();
    await loadSchedule(() => renderSchedule(onOpenLessonInJournal));
    populateGroupSelects(updateJournalStudents);
    setTimeout(() => switchTab('tabSchedule'), 1200);
  });

  // 3. Фоновое параллельное обновление данных по сети
  Promise.allSettled([
    loadTeachers(),
    loadSchedule(() => renderSchedule(onOpenLessonInJournal)),
    loadStudents(() => populateGroupSelects(updateJournalStudents)),
    loadCurriculum(() => {
      renderSchedule(onOpenLessonInJournal);
      const g = document.getElementById('journalGroupSelect')?.value;
      const l = document.getElementById('journalLessonNumSelect')?.value;
      const topicInput = document.getElementById('journalTopicInput');
      if (topicInput && (!topicInput.value || topicInput.value.trim() === '')) {
        autoFillTopicForGroup(g, l);
      }
    }),
  ]).then(() => {
    populateGroupSelects(updateJournalStudents);
    renderSchedule(onOpenLessonInJournal);
  });
}

initApp();
