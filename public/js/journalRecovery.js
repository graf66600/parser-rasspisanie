// Phone storage is not the repository. Snapshot it before any reconciliation.
const RECOVERY_KEY = 'pwa_journal_recovery_v1';
const CONFLICT_KEY = 'pwa_journal_conflicts';
const BASE_KEY = 'pwa_journal_cloud_baseline';

function read(key, fallback) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : fallback;
}

export function readLocalJournal() {
  const entries = read('pwa_journal', []);
  if (!Array.isArray(entries) || entries.some(entry => !entry || typeof entry !== 'object' || !entry.id)) {
    throw new Error('Журнал на устройстве имеет неизвестный формат. Сначала выгрузите резервную копию.');
  }
  return entries;
}

export function ensureJournalRecovery() {
  if (localStorage.getItem(RECOVERY_KEY)) return;
  const keys = ['pwa_journal', 'pwa_sync_queue', 'pwa_custom_students', 'pwa_student_subgroups', 'pwa_journal_tombstones'];
  const values = Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)]));
  localStorage.setItem(RECOVERY_KEY, JSON.stringify({ createdAt: new Date().toISOString(), values }));
}

export function getJournalConflicts() {
  const value = read(CONFLICT_KEY, []);
  if (!Array.isArray(value)) throw new Error('Неизвестный формат сохранённых конфликтов');
  return value;
}

export function archiveJournalConflicts(conflicts) {
  if (!conflicts.length) return;
  const previous = getJournalConflicts();
  for (const conflict of conflicts) {
    const signature = JSON.stringify([conflict.id, conflict.local, conflict.remote]);
    if (!previous.some(item => item.signature === signature)) {
      previous.push({ ...conflict, signature, capturedAt: new Date().toISOString() });
    }
  }
  localStorage.setItem(CONFLICT_KEY, JSON.stringify(previous));
}

export function resolveJournalConflict(signature) {
  const conflicts = getJournalConflicts().map(item => item.signature === signature
    ? { ...item, resolvedAt: new Date().toISOString() } : item);
  // Resolved versions remain in the recovery export; resolving never deletes history.
  localStorage.setItem(CONFLICT_KEY, JSON.stringify(conflicts));
}

export function getJournalBaseline() { return read(BASE_KEY, {}); }

export function rememberJournalBaseline(entries) {
  const baseline = getJournalBaseline();
  for (const entry of entries) if (entry?.id) baseline[entry.id] = entry;
  localStorage.setItem(BASE_KEY, JSON.stringify(baseline));
}

export function makeJournalBackup() {
  const keys = ['pwa_journal', 'pwa_sync_queue', 'pwa_custom_students', 'pwa_student_subgroups',
    'pwa_journal_tombstones', RECOVERY_KEY, CONFLICT_KEY, BASE_KEY];
  return { format: 'college-journal-backup', version: 1, exportedAt: new Date().toISOString(),
    values: Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])) };
}
