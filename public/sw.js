const CACHE_NAME = 'schedule-pwa-v10';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './styles.css',
  './css/base.css',
  './css/schedule.css',
  './css/journal.css',
  './css/journalStats.css',
  './css/attendance.css',
  './css/history.css',
  './css/modals.css',
  './app.js',
  './js/state.js',
  './js/scheduleView.js',
  './js/journalView.js',
  './js/journalStats.js',
  './js/journalAttendance.js',
  './js/topicHelper.js',
  './js/studentsView.js',
  './js/uploadView.js',
  './data/schedule.json',
  './data/schedules.json',
  './data/students.json',
  './data/curriculum.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch((err) => {
      console.warn('Частичная ошибка кэширования при установке:', err);
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

  // Игнорируем API-запросы, отправляем напрямую на сервер без кэширования
  if (event.request.url.includes('/api/')) return;

  if (!event.request.url.startsWith(self.location.origin)) return;

  // Для навигации HTML: Stale-While-Revalidate (мгновенная загрузка из кэша)
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      caches.match('./index.html').then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              const clone = networkRes.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', clone));
            }
            return networkRes;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // Stale-While-Revalidate for other static assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
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
