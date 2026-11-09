// ==========================================================================
// OFFLINE SYNC QUEUE: QUEUE & BACKGROUND SYNC FOR JOURNAL ENTRIES
// ==========================================================================
import { pushJournalEntryToCloud } from './supabaseSync.js';
import { isStaticHost } from './state.js';

const QUEUE_STORAGE_KEY = 'pwa_sync_queue';
let isFlushing = false;

export function getSyncQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveSyncQueue(queue) {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {}
  renderSyncBadge();
}

export function enqueueJournalEntry(entry) {
  const queue = getSyncQueue();
  const idx = queue.findIndex((item) => item.id === entry.id);
  const queueItem = {
    id: entry.id,
    type: 'journal',
    entry,
    queuedAt: new Date().toISOString(),
  };

  if (idx !== -1) queue[idx] = queueItem;
  else queue.push(queueItem);

  saveSyncQueue(queue);
  return queue.length;
}

export function dequeueJournalEntry(entryId) {
  const queue = getSyncQueue().filter((item) => item.id !== entryId);
  saveSyncQueue(queue);
  return queue.length;
}

export async function flushSyncQueue() {
  if (isFlushing || !navigator.onLine) {
    renderSyncBadge();
    return;
  }

  const queue = getSyncQueue();
  if (queue.length === 0) {
    renderSyncBadge();
    return;
  }

  isFlushing = true;
  renderSyncBadge(true);

  const remaining = [];
  for (const item of queue) {
    if (item.type === 'journal' && item.entry) {
      try {
        await pushJournalEntryToCloud(item.entry);
        if (!isStaticHost) {
          await fetch('./api/journal/mark', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.entry),
          }).catch(() => {});
        }
      } catch (err) {
        remaining.push(item);
      }
    }
  }

  isFlushing = false;
  saveSyncQueue(remaining);
}

export function renderSyncBadge(syncingNow = false) {
  if (typeof document === 'undefined') return;
  let badge = document.getElementById('pwaSyncStatusBadge');

  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'pwaSyncStatusBadge';
    badge.className = 'fixed bottom-20 right-4 z-40 transition-all duration-300';
    document.body.appendChild(badge);
  }

  const isOnline = navigator.onLine;
  const count = getSyncQueue().length;

  if (isOnline && count === 0 && !syncingNow) {
    badge.innerHTML = '';
    badge.classList.add('hidden');
    return;
  }

  badge.classList.remove('hidden');

  if (!isOnline) {
    badge.innerHTML = `
      <div class="flex items-center gap-2 px-3 py-1.5 bg-amber-950/90 border border-amber-600/70 text-amber-200 text-xs rounded-xl shadow-lg backdrop-blur">
        <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
        <span>Оффлайн режим (${count > 0 ? `${count} в очереди` : 'локально'})</span>
      </div>
    `;
    return;
  }

  if (syncingNow) {
    badge.innerHTML = `
      <div class="flex items-center gap-2 px-3 py-1.5 bg-blue-950/90 border border-blue-600/70 text-blue-200 text-xs rounded-xl shadow-lg backdrop-blur">
        <span class="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></span>
        <span>Синхронизация с облаком...</span>
      </div>
    `;
    return;
  }

  if (count > 0) {
    badge.innerHTML = `
      <button type="button" id="manualFlushQueueBtn" class="flex items-center gap-2 px-3 py-1.5 bg-indigo-950/90 hover:bg-indigo-900 border border-indigo-500/70 text-indigo-200 text-xs rounded-xl shadow-lg backdrop-blur cursor-pointer transition">
        <span>🔄</span>
        <span>В очереди: <b>${count}</b> (нажмите для отправки)</span>
      </button>
    `;

    badge.querySelector('#manualFlushQueueBtn')?.addEventListener('click', () => {
      flushSyncQueue();
    });
  }
}

export function setupSyncQueueAutoFlush() {
  if (typeof window === 'undefined') return;

  window.addEventListener('online', () => {
    flushSyncQueue();
  });

  window.addEventListener('offline', () => {
    renderSyncBadge();
  });

  // Периодическая проверка раз в 30 секунд
  setInterval(() => {
    if (navigator.onLine && getSyncQueue().length > 0) {
      flushSyncQueue();
    }
  }, 30000);

  renderSyncBadge();
}
