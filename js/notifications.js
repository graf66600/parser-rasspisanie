// ==========================================================================
// PWA NOTIFICATIONS: BROWSER PUSH, TIMERS, IN-APP TOASTS & ALERTS
// ==========================================================================
import { state, formatLocalDate } from './state.js';
import { getRecommendedLesson } from './topicHelper.js';
import { playNotificationSound, triggerVibration, unlockAudio } from './notificationAudio.js';
import { showInAppToast } from './notificationToast.js';

let notificationTimer = null;

async function getSafeSWRegistration() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg && reg.active) return reg;
  } catch (e) {}
  try {
    const swReady = navigator.serviceWorker.ready;
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 1200));
    return await Promise.race([swReady, timeout]);
  } catch (e) {
    return null;
  }
}

export async function showNotification(title, body, tag = 'general', customData = {}) {
  playNotificationSound();
  triggerVibration();
  showInAppToast({ title, body, icon: '🔔', duration: 8000 });

  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return true;
  }

  const iconUrl = new URL('./icon-192.png', window.location.href).href;
  const options = {
    body,
    icon: iconUrl,
    badge: iconUrl,
    tag: String(tag),
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: './', ...customData },
  };

  try {
    const reg = await getSafeSWRegistration();
    if (reg?.showNotification) {
      await reg.showNotification(title, options);
      return true;
    }
  } catch (swErr) {
    console.warn('SW notification fallback:', swErr);
  }

  try {
    new Notification(title, options);
    return true;
  } catch (err) {
    return true;
  }
}

export function isNotificationsEnabled() {
  const pref = localStorage.getItem('pwa_notifications_enabled');
  if (pref === 'false') return false;
  if (pref === 'true') return true;
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

async function requestBrowserPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch (e) {
    return new Promise((resolve) => {
      try { Notification.requestPermission((res) => resolve(res)); } catch (err) { resolve('denied'); }
    });
  }
}

export async function toggleNotifications() {
  unlockAudio();
  if (isNotificationsEnabled()) {
    localStorage.setItem('pwa_notifications_enabled', 'false');
    if (notificationTimer) {
      clearInterval(notificationTimer);
      notificationTimer = null;
    }
    updateNotificationUI();
    showInAppToast({
      title: '🔕 Уведомления отключены',
      body: 'Напоминания о парах приостановлены.',
      icon: '🔕',
      duration: 3500,
    });
    return false;
  }

  let perm = 'unsupported';
  if ('Notification' in window) {
    perm = Notification.permission;
    if (perm !== 'granted') perm = await requestBrowserPermission();
  }

  localStorage.setItem('pwa_notifications_enabled', 'true');
  updateNotificationUI();
  startNotificationScheduler();

  const leadMin = getLeadMinutes();
  const leadText = leadMin === 0 ? 'в момент звонка' : `за ${leadMin} мин до начала`;

  await showNotification(
    '🔔 Уведомления активированы!',
    `Напоминания настроены (${leadText}) с темой занятия и аудиторией.`,
    'notif_enabled'
  );

  if (perm === 'denied') {
    alert('⚠️ Системные уведомления заблокированы в браузере. Звуковые и визуальные напоминания будут активны в приложении.');
  }
  return true;
}

export async function sendTestNotification() {
  unlockAudio();
  if ('Notification' in window && Notification.permission !== 'granted') {
    const perm = await requestBrowserPermission();
    if (perm === 'granted') {
      localStorage.setItem('pwa_notifications_enabled', 'true');
      updateNotificationUI();
      startNotificationScheduler();
    }
  }

  await showNotification(
    '🔔 Тест напоминания о паре',
    'Пара №4 (13:00) | Гр. 51ф | Ауд. 230\nТема: Диспансерный прием в МИС',
    `test_${Date.now()}`
  );
}

export function getLeadMinutes() {
  const saved = localStorage.getItem('pwa_notif_lead_min');
  if (saved !== null) {
    const val = Number(saved);
    return isNaN(val) ? 10 : val;
  }
  return 10;
}

export function setLeadMinutes(minutes) {
  const val = Math.max(0, Number(minutes) || 0);
  localStorage.setItem('pwa_notif_lead_min', String(val));
  updateNotificationUI();
}

function getTodaySentKeys(todayStr) {
  try {
    const raw = sessionStorage.getItem(`pwa_sent_notifs_${todayStr}`);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) {
    return new Set();
  }
}

function markKeyAsSentToday(todayStr, key) {
  try {
    const set = getTodaySentKeys(todayStr);
    set.add(key);
    sessionStorage.setItem(`pwa_sent_notifs_${todayStr}`, JSON.stringify([...set]));
  } catch (e) {}
}

export function checkUpcomingLessons() {
  if (!isNotificationsEnabled() || !state.schedule?.lessons?.length) return;

  const now = new Date();
  const jsDay = now.getDay();
  const currentDay = jsDay === 0 ? 7 : jsDay;
  const todayStr = formatLocalDate(now);
  const curMinutes = now.getHours() * 60 + now.getMinutes();

  const todayLessons = state.schedule.lessons.filter((l) => Number(l.dayOfWeek) === currentDay);
  const leadMinutes = getLeadMinutes();
  const sentKeys = getTodaySentKeys(todayStr);

  todayLessons.forEach((lesson) => {
    const [lh, lm] = (lesson.startTime || '00:00').split(':').map(Number);
    const lessonMinutes = lh * 60 + lm;
    const reminderStart = Math.max(0, lessonMinutes - leadMinutes);

    if (curMinutes >= reminderStart && curMinutes <= lessonMinutes) {
      const key = `notif_${todayStr}_${lesson.id || lesson.lessonNumber}_${lesson.startTime}`;
      if (!sentKeys.has(key)) {
        markKeyAsSentToday(todayStr, key);
        const rec = lesson.group ? getRecommendedLesson(lesson.group, lesson.lessonNumber, todayStr) : null;
        const topicStr = rec?.text ? `\nТема: #${rec.number} ${rec.text}` : '';
        const groupStr = lesson.group ? ` | Гр. ${lesson.group}` : '';
        const roomStr = lesson.classroom ? ` | Ауд. ${lesson.classroom}` : '';
        const leadPrefix = leadMinutes > 0 ? `Скоро (${leadMinutes} мин)` : 'Начало';

        showNotification(
          `🔔 ${leadPrefix}: ${lesson.lessonNumber} пара (${lesson.startTime})`,
          `${lesson.subject}${groupStr}${roomStr}${topicStr}`,
          key
        );
      }
    }
  });
}

export function startNotificationScheduler() {
  if (notificationTimer) clearInterval(notificationTimer);
  notificationTimer = setInterval(checkUpcomingLessons, 30000);
  checkUpcomingLessons();
}

export function updateNotificationUI() {
  const enabled = isNotificationsEnabled();
  const leadMin = getLeadMinutes();

  const headerBtn = document.getElementById('toggleNotificationsBtn');
  if (headerBtn) {
    headerBtn.innerHTML = enabled
      ? '<span>🔔</span><span class="hidden sm:inline">Уведомления вкл.</span>'
      : '<span>🔔</span><span class="hidden sm:inline">Уведомления</span>';
    headerBtn.className = `notification-toggle-btn ${enabled ? 'btn-notif-active' : 'btn-notif-inactive'}`;
    headerBtn.title = enabled ? 'Уведомления включены' : 'Уведомления выключены';
  }

  const bannerBtn = document.getElementById('bannerToggleNotifBtn');
  if (bannerBtn) {
    bannerBtn.textContent = enabled ? 'Включены' : 'Включить';
    bannerBtn.className = `notif-toggle-pill ${enabled ? 'notif-toggle-on' : 'notif-toggle-off'}`;
  }

  const leadSelect = document.getElementById('notifLeadTimeSelect');
  if (leadSelect && leadSelect.value !== String(leadMin)) {
    leadSelect.value = String(leadMin);
  }

  const notifStatusText = document.getElementById('notifStatusText');
  if (notifStatusText) {
    const timeDesc = leadMin === 0 ? 'в момент звонка' : `за ${leadMin} мин`;
    notifStatusText.textContent = enabled
      ? `Напоминание ${timeDesc} с темой пары и кабинетом (активно)`
      : 'Нажмите, чтобы включить напоминания о занятиях';
  }
}

export const updateNotificationButtonState = updateNotificationUI;

export async function notifyScheduleChanges(oldLessons = [], newLessons = [], teacherName = '') {
  if (!isNotificationsEnabled() || !Array.isArray(oldLessons) || !Array.isArray(newLessons)) return;
  if (!oldLessons.length || !newLessons.length) return;

  const oldMap = new Map();
  oldLessons.forEach((l) => oldMap.set(`${l.dayOfWeek}_${l.lessonNumber}_${(l.group || '').trim()}`, l));

  const changes = [];
  newLessons.forEach((nl) => {
    const ol = oldMap.get(`${nl.dayOfWeek}_${nl.lessonNumber}_${(nl.group || '').trim()}`);
    if (!ol) {
      changes.push(`Добавлена пара №${nl.lessonNumber} (${nl.group || ''}): ${nl.subject}, ауд. ${nl.classroom || '—'}`);
    } else {
      if (ol.classroom && nl.classroom && ol.classroom.trim() !== nl.classroom.trim()) {
        changes.push(`Пара №${nl.lessonNumber}: кабинет изменён на «${nl.classroom}»`);
      }
      if (ol.subject && nl.subject && ol.subject.trim() !== nl.subject.trim()) {
        changes.push(`Пара №${nl.lessonNumber}: предмет «${nl.subject}»`);
      }
    }
  });

  if (changes.length > 0) {
    const title = `⚡ Изменение в расписании (${teacherName || 'Ваша пара'})`;
    const body = changes.slice(0, 3).join('\n') + (changes.length > 3 ? `\n...и еще ${changes.length - 3}` : '');
    await showNotification(title, body, `sched_change_${Date.now()}`);
  }
}

export function setupNotifications() {
  updateNotificationUI();

  document.getElementById('toggleNotificationsBtn')?.addEventListener('click', () => toggleNotifications());
  document.getElementById('bannerToggleNotifBtn')?.addEventListener('click', () => toggleNotifications());
  document.getElementById('notifLeadTimeSelect')?.addEventListener('change', (e) => setLeadMinutes(e.target.value));
  document.getElementById('testNotificationBtn')?.addEventListener('click', () => sendTestNotification());

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkUpcomingLessons();
  });
  window.addEventListener('pwa_schedule_updated', () => checkUpcomingLessons());

  if (isNotificationsEnabled()) startNotificationScheduler();
}
