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
    icon: './icon.svg',
    badge: './icon.svg',
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
 * Запросить разрешение на отправку уведомлений
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('Ваш браузер не поддерживает Web Notifications.');
    return false;
  }

  const permission = await Notification.requestPermission();
  updateNotificationButtonState();

  if (permission === 'granted') {
    localStorage.setItem('pwa_notifications_enabled', 'true');
    await showNotification(
      '🔔 Уведомления активированы!',
      'Вы будете получать напоминания за 10 минут до начала каждой пары с темой занятия.',
      'test'
    );
    startNotificationScheduler();
    return true;
  } else if (permission === 'denied') {
    alert('Уведомления заблокированы в настройках браузера. Разрешите их в настройках сайта, чтобы получать напоминания о парах.');
    return false;
  }
  return false;
}

/**
 * Отправить мгновенное тестовое уведомление для проверки
 */
export async function sendTestNotification() {
  if (Notification.permission !== 'granted') {
    const granted = await requestNotificationPermission();
    if (!granted) return;
  }

  await showNotification(
    '🔔 Тест уведомления о паре',
    'Пара №4 (13:00) | Группа 51ф | Тема: Диспансерный прием в МИС',
    'test_check'
  );
}

/**
 * Фоновый таймер проверки предстоящих пар (запуск каждые 30 секунд)
 */
export function startNotificationScheduler() {
  if (notificationTimer) clearInterval(notificationTimer);

  const check = () => {
    if (Notification.permission !== 'granted') return;
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

  if (!('Notification' in window)) {
    btn.classList.add('hidden');
    return;
  }

  if (Notification.permission === 'granted') {
    btn.innerHTML = '<span>🔔</span><span>Уведомления вкл.</span>';
    btn.classList.add('btn-notif-active');
    btn.classList.remove('btn-notif-inactive');
  } else {
    btn.innerHTML = '<span>🔕</span><span>Включить уведомления</span>';
    btn.classList.remove('btn-notif-active');
    btn.classList.add('btn-notif-inactive');
  }
}

/**
 * Инициализация обработчиков уведомлений
 */
export function setupNotifications() {
  updateNotificationButtonState();

  document.getElementById('toggleNotificationsBtn')?.addEventListener('click', async () => {
    if (Notification.permission === 'granted') {
      await sendTestNotification();
    } else {
      await requestNotificationPermission();
    }
  });

  document.getElementById('testNotificationBtn')?.addEventListener('click', async () => {
    await sendTestNotification();
  });

  if (Notification.permission === 'granted') {
    startNotificationScheduler();
  }
}
