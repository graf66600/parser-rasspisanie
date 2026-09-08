// ==========================================================================
// MAIN APPLICATION ENTRY POINT
// ==========================================================================
import { state, loadSchedule, loadStudents, loadCurriculum, populateGroupSelects } from './js/state.js';
import { renderSchedule, setupDayFilterButtons, renderBells } from './js/scheduleView.js';
import { updateJournalStudents, autoFillTopicForGroup, loadJournalHistory, setupJournalListeners } from './js/journalView.js';
import { renderManageStudents, setupStudentsListeners } from './js/studentsView.js';
import { setupUploadListeners } from './js/uploadView.js';

// Инициализация PWA и Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
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
function onOpenLessonInJournal(group, lessonNum) {
  const gSel = document.getElementById('journalGroupSelect');
  const lSel = document.getElementById('journalLessonNumSelect');
  if (gSel) gSel.value = group;
  if (lSel) lSel.value = lessonNum;

  const dateInput = document.getElementById('journalDateInput');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

  updateJournalStudents();
  autoFillTopicForGroup(group);
  switchTab('tabJournal');
}

// Запуск приложения
async function initApp() {
  const dateInput = document.getElementById('journalDateInput');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

  setupDayFilterButtons(() => renderSchedule(onOpenLessonInJournal));
  setupJournalListeners();
  setupStudentsListeners(updateJournalStudents);
  setupUploadListeners(async () => {
    await loadSchedule(() => renderSchedule(onOpenLessonInJournal));
    populateGroupSelects(updateJournalStudents);
    setTimeout(() => switchTab('tabSchedule'), 1200);
  });

  await loadSchedule(() => renderSchedule(onOpenLessonInJournal));
  await loadStudents(() => populateGroupSelects(updateJournalStudents));
  await loadCurriculum();
  populateGroupSelects(updateJournalStudents);
}

initApp();
