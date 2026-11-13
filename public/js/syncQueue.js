// Durable outbox for journal saves/deletions and student changes.
import { pushJournalEntryToCloud, deleteJournalEntryFromCloud,
  pushStudentToCloud, deleteStudentFromCloud } from './cloudRecords.js';
import { isStaticHost } from './cacheHelper.js';
import { checkedFetch } from './syncTransport.js';
import { getSyncQueue, enqueueMutation, acknowledgeMutation, sameMutation } from './syncStorage.js';
export { getSyncQueue } from './syncStorage.js';
let isFlushing = false;

export function enqueueJournalEntry(entry) {
  const count = enqueueMutation({ id: entry.id, type: 'journal', action: 'save', entry });
  renderSyncBadge();
  return count;
}

export function enqueueJournalDeletion(id) {
  const count = enqueueMutation({ id, type: 'journal', action: 'delete' });
  renderSyncBadge();
  return count;
}

export function enqueueStudentMutation(group, names, action = 'save') {
  const list = Array.isArray(names) ? names : [names];
  for (const name of list) enqueueMutation({ id: JSON.stringify([group, name]),
    type: 'student', action, group, name });
  renderSyncBadge();
  void flushSyncQueue();
}

async function sendCloud(item) {
  if (item.type === 'journal') {
    return item.action === 'delete' ? deleteJournalEntryFromCloud(item.id) : pushJournalEntryToCloud(item.entry, () => getSyncQueue().some(current => sameMutation(current, item)));
  }
  if (item.type === 'student') return item.action === 'delete'
    ? deleteStudentFromCloud(item.group, item.name) : pushStudentToCloud(item.group, item.name);
  throw new Error('Неизвестный тип операции очереди');
}

async function sendApi(item) {
  if (item.type === 'journal') return item.action === 'delete'
    ? checkedFetch(`./api/journal/${encodeURIComponent(item.id)}`, { method: 'DELETE' })
    : checkedFetch('./api/journal/mark', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.entry) });
  if (item.type === 'student') return item.action === 'delete'
    ? checkedFetch(`./api/students?group=${encodeURIComponent(item.group)}&student=${encodeURIComponent(item.name)}`, { method: 'DELETE' })
    : checkedFetch('./api/students', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group: item.group, student: item.name }) });
}

export async function flushSyncQueue() {
  if (isFlushing || !navigator.onLine) { renderSyncBadge(); return; }
  isFlushing = true;
  renderSyncBadge(true);
  try {
    for (const item of getSyncQueue()) {
      // Check the live queue: this snapshot may already have been replaced/deleted.
      if (!getSyncQueue().some(current => sameMutation(current, item))) continue;
      let apiItem = item;
      if (!item.confirmed?.cloud) {
        try {
          const sentEntry = await sendCloud(item);
          if (sentEntry?.id && item.type === 'journal') apiItem = { ...item, entry: sentEntry };
          acknowledgeMutation(item, isStaticHost ? null : 'cloud');
        } catch (error) {
          console.warn('Облако не подтвердило запись; она остаётся в очереди:', error);
          if (error.code === 'JOURNAL_CONFLICT') continue;
        }
      }
      if (!getSyncQueue().some(current => sameMutation(current, item))) continue;
      if (!isStaticHost && !item.confirmed?.api) {
        try {
          await sendApi(apiItem);
          acknowledgeMutation(item, 'api');
        } catch (error) { console.warn('API не подтвердил запись; она остаётся в очереди:', error); }
      }
    }
  } catch (error) {
    console.warn('Синхронизация остановлена; сохранённые данные не перезаписаны:', error);
  } finally { isFlushing = false; renderSyncBadge(); }
}

export function renderSyncBadge(syncingNow = false) {
  if (typeof document === 'undefined') return;
  window.dispatchEvent(new Event('pwa_sync_updated'));
  let badge = document.getElementById('pwaSyncStatusBadge');

  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'pwaSyncStatusBadge';
    badge.className = 'fixed bottom-20 right-4 z-40 transition-all duration-300';
    document.body.appendChild(badge);
  }

  const isOnline = navigator.onLine;
  let count;
  try { count = getSyncQueue().length; } catch { count = -1; }
  if (count < 0) {
    badge.classList.remove('hidden');
    badge.textContent = 'Хранилище требует проверки. Сначала скачайте копию журнала.';
    return;
  }

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
    try { if (navigator.onLine && getSyncQueue().length > 0) void flushSyncQueue(); }
    catch { renderSyncBadge(); }
  }, 30000);

  renderSyncBadge();
  void flushSyncQueue();
}
