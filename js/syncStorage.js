// Durable outbox. Each version is acknowledged separately, never a stale snapshot.
const KEY = 'pwa_sync_queue';
const TOMBSTONE_KEY = 'pwa_journal_tombstones';
let sequence = 0;

export function getSyncQueue() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  const value = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error('Очередь имеет неизвестный формат. Сначала сохраните резервную копию.');
  return value;
}

export function saveSyncQueue(queue) {
  localStorage.setItem(KEY, JSON.stringify(queue));
}

export function enqueueMutation(item) {
  const queue = getSyncQueue();
  const operation = { ...item, operationId: `${Date.now()}-${++sequence}-${Math.random()}`,
    queuedAt: new Date().toISOString() };
  const index = queue.findIndex(value => value.id === operation.id && value.type === operation.type);
  if (index < 0) queue.push(operation);
  else queue[index] = operation;
  saveSyncQueue(queue);
  return queue.length;
}

export function sameMutation(current, sent) {
  if (current.id !== sent.id || current.type !== sent.type) return false;
  if (sent.operationId) return current.operationId === sent.operationId;
  const { confirmed: ignoredCurrent, ...a } = current;
  const { confirmed: ignoredSent, ...b } = sent;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function acknowledgeMutation(sent, target) {
  const queue = getSyncQueue();
  const index = queue.findIndex(item => sameMutation(item, sent));
  if (index < 0) return;
  if (!target) queue.splice(index, 1);
  else {
    queue[index].confirmed = { ...queue[index].confirmed, [target]: true };
    if (queue[index].confirmed.cloud && queue[index].confirmed.api) queue.splice(index, 1);
  }
  saveSyncQueue(queue);
}

export function hasPendingJournalMutation(id) {
  return getSyncQueue().some(item => item.type === 'journal' && item.id === id);
}

export function getJournalTombstones() {
  try {
    const value = JSON.parse(localStorage.getItem(TOMBSTONE_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch { return {}; }
}

export function markJournalTombstone(id) {
  const tombstones = getJournalTombstones();
  tombstones[id] = new Date().toISOString();
  localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(tombstones));
}

export function clearJournalTombstone(id) {
  const tombstones = getJournalTombstones();
  delete tombstones[id];
  localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(tombstones));
}
