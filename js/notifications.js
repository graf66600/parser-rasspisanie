// ==========================================================================
// PWA NOTIFICATIONS: BROWSER PUSH, TIMERS & UPCOMING LESSON ALERTS
// ==========================================================================
import { state } from './state.js';
import { getRecommendedLesson } from './topicHelper.js';

let notificationTimer = null;
const sentNotificationsToday = new Set();

/**
 * Проиграть мягкий звуковой сигнал оповещения через Web Audio API
 */
function playChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {}
}

/**
 * Отправить браузерное уведомление
 */
export async function showNotification(title, body, tag = 'general') {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return false;
  }

  playChime();
  if (navigator.vibrate) {
    try { navigator.vibrate([200, 100, 200]); } catch (e) {}
  }

  const options = {
    body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag,
    renotify: true,
    data: { url: './' },
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg?.showNotification) {
        await reg.showNotification(title, options);
        return true;
      }
    }
    new Notification(title, options);
    return true;
  } catch (err) {
    try {
      new Notification(title, options);
      return true;
    } catch (fallbackErr) {
      console.warn('Не удалось отобразить уведомление:', fallbackErr);
      return false;
    }
  }
}

/**
 * Проверить, включены ли уведомления в настройках пользователя
 */
export function isNotificationsEnabled() {
  const pref = localStorage.getItem('pwa_notifications_enabled');
  if (pref === 'false') return false;
  if (pref === 'true') return true;
  return 'Notification' in window && Notification.permission === 'granted';
}

/**
 * Переключить статус уведомлений (включить / выключить)
 */
export async function toggleNotifications() {
  const isEnabled = isNotificationsEnabled();
  const hasBrowserPerm = 'Notification' in window && Notification.permission === 'granted';

  // Если уведомления уже активны — отключаем
  if (isEnabled && hasBrowserPerm) {
    localStorage.setItem('pwa_notifications_enabled', 'false');
    if (notificationTimer) {
      clearInterval(notificationTimer);
      notificationTimer = null;
    }
    updateNotificationButtonState();
    return false;
  }

  // Если браузер не поддерживает Web Notifications
  if (!('Notification' in window)) {
    alert(
      '📱 Уведомления на мобильных устройствах Apple (iPhone / iPad):\n\n' +
      'Для работы push-уведомлений в iOS добавьте приложение на домашний экран:\n' +
      '1. Нажмите иконку «Поделиться» (⎋) внизу в Safari\n' +
      '2. Выберите «На экран „Домой“»\n' +
      '3. Запустите приложение с экрана «Домой» и включите колокольчик.'
    );
    return false;
  }

  // Если уведомления заблокированы в браузере
  if (Notification.permission === 'denied') {
    alert('Уведомления заблокированы в настройках браузера. Разрешите их в настройках сайта / браузера, чтобы получать напоминания о парах.');
    return false;
  }

  // Запрашиваем разрешение
  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      updateNotificationButtonState();
      return false;
    }
  }

  // Включаем уведомления
  localStorage.setItem('pwa_notifications_enabled', 'true');
  updateNotificationButtonState();
  startNotificationScheduler();

  await showNotification(
    '🔔 Уведомления активированы!',
    'Вы будете получать напоминания за 10 минут до начала каждой пары и при изменении аудиторий.',
    'test_enabled'
  );
  return true;
}

/**
 * Запросить разрешение на отправку уведомлений
 */
export async function requestNotificationPermission() {
  return await toggleNotifications();
}

/**
 * Отправить мгновенное тестовое уведомление для проверки
 */
export async function sendTestNotification() {
  if (!('Notification' in window)) {
    alert('📱 На устройствах iPhone для работы уведомлений сохраните сайт на экран «Домой» (кнопка «Поделиться» ➔ «На экран Домой»).');
    return;
  }

  if (Notification.permission !== 'granted') {
    const granted = await toggleNotifications();
    if (!granted) return;
  }

  await showNotification(
    '🔔 Тест уведомления о паре',
    'Пара №4 (13:00) | Группа 51ф | Ауд. 230 | Тема: Диспансерный прием в МИС',
    'test_check'
  );
}

/**
 * Фоновый таймер проверки предстоящих пар (запуск каждые 30 секунд)
 */
export function startNotificationScheduler() {
  if (notificationTimer) clearInterval(notificationTimer);

  const check = () => {
    if (!isNotificationsEnabled()) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!state.schedule?.lessons?.length) return;

    const now = new Date();
    const jsDay = now.getDay();
    const currentDay = jsDay === 0 ? 7 : jsDay;
    const todayStr = now.toISOString().split('T')[0];

    const curTimeMinutes = now.getHours() * 60 + now.getMinutes();
    const todayLessons = state.schedule.lessons.filter((l) => l.dayOfWeek === currentDay);
    const remindMinutesBefore = 10;

    todayLessons.forEach((lesson) => {
      const [lh, lm] = (lesson.startTime || '00:00').split(':').map(Number);
      const lessonMinutes = lh * 60 + lm;
      const reminderMinutes = lessonMinutes - remindMinutesBefore;

      if (curTimeMinutes >= reminderMinutes && curTimeMinutes <= lessonMinutes) {
        const key = `notif_${todayStr}_${lesson.id || lesson.lessonNumber}_${lesson.startTime}`;
        if (!sentNotificationsToday.has(key)) {
          sentNotificationsToday.add(key);

          const rec = lesson.group ? getRecommendedLesson(lesson.group, lesson.lessonNumber, todayStr) : null;
          const topicStr = rec?.text ? `\nТема: #${rec.number} ${rec.text}` : '';
          const groupStr = lesson.group ? ` | Гр. ${lesson.group}` : '';
          const roomStr = lesson.classroom ? ` | Каб: ${lesson.classroom}` : '';

          showNotification(
            `🔔 Скоро ${lesson.lessonNumber} пара (${lesson.startTime})`,
            `${lesson.subject}${groupStr}${roomStr}${topicStr}`,
            key
          );
        }
      }
    });
  };

  notificationTimer = setInterval(check, 30000);
  check();
}

/**
 * Обновление текста и вида кнопки уведомлений в интерфейсе
 */
export function updateNotificationButtonState() {
  const btn = document.getElementById('toggleNotificationsBtn');
  if (!btn) return;

  btn.classList.remove('hidden');

  const enabled = isNotificationsEnabled();
  const hasPerm = 'Notification' in window && Notification.permission === 'granted';

  if (enabled && hasPerm) {
    btn.innerHTML = '<span>🔔</span><span class="hidden sm:inline">Уведомления вкл.</span>';
    btn.classList.add('btn-notif-active');
    btn.classList.remove('btn-notif-inactive');
    btn.title = 'Уведомления о парах включены (нажмите, чтобы отключить)';
  } else {
    btn.innerHTML = '<span>🔔</span><span class="hidden sm:inline">Уведомления</span>';
    btn.classList.remove('btn-notif-active');
    btn.classList.add('btn-notif-inactive');
    btn.title = 'Уведомления о парах выключены (нажмите, чтобы включить)';
  }

  const notifStatusText = document.getElementById('notifStatusText');
  if (notifStatusText) {
    if (enabled && hasPerm) {
      notifStatusText.textContent = 'Напоминание за 10 мин до начала с темой пары (активно)';
    } else {
      notifStatusText.textContent = 'Нажмите на колокольчик, чтобы включить напоминания';
    }
  }
}

/**
 * Уведомление при оперативном изменении своей пары (кабинет, время, замена, предмет)
 */
export async function notifyScheduleChanges(oldLessons = [], newLessons = [], teacherName = '') {
  if (!isNotificationsEnabled() || !('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }
  if (!Array.isArray(oldLessons) || !Array.isArray(newLessons)) return;
  if (oldLessons.length === 0 || newLessons.length === 0) return;

  const oldMap = new Map();
  oldLessons.forEach((l) => {
    const key = `${l.dayOfWeek}_${l.lessonNumber}_${(l.group || '').trim()}`;
    oldMap.set(key, l);
  });

  const changes = [];

  newLessons.forEach((nl) => {
    const key = `${nl.dayOfWeek}_${nl.lessonNumber}_${(nl.group || '').trim()}`;
    const ol = oldMap.get(key);
    if (!ol) {
      changes.push(`Добавлена пара №${nl.lessonNumber} (${nl.group || ''}): ${nl.subject}, ауд. ${nl.classroom || '—'}`);
    } else {
      if (ol.classroom && nl.classroom && ol.classroom.trim() !== nl.classroom.trim()) {
        changes.push(`Пара №${nl.lessonNumber} (${nl.group || ''}): кабинет изменён с «${ol.classroom}» на «${nl.classroom}»`);
      }
      if (ol.subject && nl.subject && ol.subject.trim() !== nl.subject.trim()) {
        changes.push(`Пара №${nl.lessonNumber} (${nl.group || ''}): предмет изменён на «${nl.subject}»`);
      }
    }
  });

  if (changes.length > 0) {
    const title = `⚡ Изменение в расписании (${teacherName || 'Ваша пара'})`;
    const body = changes.slice(0, 3).join('\n') + (changes.length > 3 ? `\n...и еще ${changes.length - 3}` : '');
    await showNotification(title, body, `sched_change_${Date.now()}`);
  }
}

/**
 * Инициализация обработчиков уведомлений
 */
export function setupNotifications() {
  updateNotificationButtonState();

  document.getElementById('toggleNotificationsBtn')?.addEventListener('click', async () => {
    await toggleNotifications();
  });

  document.getElementById('testNotificationBtn')?.addEventListener('click', async () => {
    await sendTestNotification();
  });

  if (isNotificationsEnabled() && 'Notification' in window && Notification.permission === 'granted') {
    startNotificationScheduler();
  }
}
