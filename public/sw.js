const CACHE_NAME = 'schedule-pwa-v46';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './styles.css',
  './css/base.css',
  './css/schedule.css',
  './css/notifications.css',
  './css/journal.css',
  './css/journalStats.css',
  './css/attendance.css',
  './css/history.css',
  './css/modals.css',
  './css/journalSummary.css',
  './css/kiosk.css',
  './css/kioskCards.css',
  './css/kioskSchedule.css',
  './css/ambientBackground.css',
  './app.js',
  './js/state.js',
  './js/cacheHelper.js',
  './js/kioskView.js',
  './js/kioskCards.js',
  './js/kioskData.js',
  './js/authView.js',
  './js/supabaseSync.js',
  './js/scheduleView.js',
  './js/notifications.js',
  './js/journalView.js',
  './js/journalEdit.js',
  './js/journalCard.js',
  './js/journalHistory.js',
  './js/journalSummaryView.js',
  './js/journalStats.js',
  './js/journalAttendance.js',
  './js/topicHelper.js',
  './js/studentsView.js',
  './js/uploadView.js',
  './data/schedule.json',
  './data/schedules.json',
  './data/curriculum.json',
  './data/teachers.json',
  './data/schedules_all.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        STATIC_ASSETS.map((asset) =>
          cache.add(new Request(asset, { cache: 'reload' })).catch((err) => {
            console.warn('Не удалось предварительно закэшировать:', asset, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Игнорируем API-запросы, отправляем напрямую на сервер
  if (event.request.url.includes('/api/')) return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  // 1. Для навигации HTML: Network с быстрым таймаутом (1.2 сек) и моментальным fallback на кэш
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      (async () => {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 1200);
          const networkRes = await fetch(event.request, { signal: controller.signal });
          clearTimeout(timer);
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', clone));
            return networkRes;
          }
        } catch (e) {}

        const cached = await caches.match('./index.html');
        return cached || fetch(event.request);
      })()
    );
    return;
  }

  // 2. Для всех остальных статических ресурсов (CSS, JS, JSON, SVG, PNG):
  // Stale-While-Revalidate — моментальная отдача из кэша (0мс) + фоновое обновление
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && (event.data.action === 'skipWaiting' || event.data === 'skipWaiting')) {
    self.skipWaiting();
  }
});
