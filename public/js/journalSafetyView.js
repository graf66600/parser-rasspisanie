import { state } from './state.js';
import { getSyncQueue, enqueueJournalEntry, flushSyncQueue } from './syncQueue.js';
import { ensureJournalRecovery, getJournalConflicts, makeJournalBackup, readLocalJournal,
  rememberJournalBaseline, resolveJournalConflict } from './journalRecovery.js';
import { mergeJournalEntry } from './journalMerge.js';
import { matchesJournalTeacher } from './lessonProgress.js';

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function exportJournalBackup() {
  const blob = new Blob([JSON.stringify(makeJournalBackup(), null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = element('a');
  link.href = url;
  link.download = `journal-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function renderJournalSafety() {
  const container = document.getElementById('journalSafetyBar');
  if (!container) return;
  try {
    const pending = getSyncQueue().length;
    const conflicts = getJournalConflicts().filter(item => !item.resolvedAt && matchesJournalTeacher(item.local || item.remote || {}, state.currentTeacher));
    const label = container.querySelector('[data-safety-status]');
    const detail = container.querySelector('[data-safety-detail]');
    label.textContent = conflicts.length ? 'Нужно сравнить отметки' : pending ? 'Изменения ждут отправки'
      : navigator.onLine ? 'Локальная копия сохранена' : 'Работа без интернета';
    detail.textContent = conflicts.length ? `Различий между версиями: ${conflicts.length}. Обе копии сохранены.`
      : pending ? `В очереди: ${pending}. Не очищайте данные приложения.`
      : 'Ведомость использует те же сохранённые записи, что и журнал.';
    container.dataset.state = conflicts.length ? 'conflict' : pending ? 'pending' : 'saved';
    const compare = container.querySelector('[data-compare]');
    compare.hidden = !conflicts.length;
  } catch {
    container.querySelector('[data-safety-status]').textContent = 'Автообновление остановлено';
    container.querySelector('[data-safety-detail]').textContent = 'Сохраните резервную копию перед исправлением хранилища.';
  }
}

const valueAt = (record, path) => path.reduce((value, key) => value?.[key], record);
function setAt(record, path, value) {
  let target = record;
  for (const key of path.slice(0, -1)) {
    if (!Object.prototype.hasOwnProperty.call(target, key) || !target[key] || typeof target[key] !== 'object') {
      Object.defineProperty(target, key, { value: {}, writable: true, enumerable: true, configurable: true });
    }
    target = target[key];
  }
  Object.defineProperty(target, path.at(-1), { value, writable: true, enumerable: true, configurable: true });
}

function showJournalConflicts() {
  document.getElementById('journalConflictsDialog')?.remove();
  const dialog = element('dialog', 'journal-conflicts-dialog');
  dialog.id = 'journalConflictsDialog';
  const header = element('header', 'journal-conflicts-header');
  const heading = element('h2', '', 'Сравнение сохранённых отметок');
  heading.id = 'journalConflictTitle'; dialog.setAttribute('aria-labelledby', heading.id);
  header.append(heading);
  const close = element('button', 'journal-tool-button', 'Закрыть');
  close.type = 'button'; close.onclick = () => dialog.close(); header.append(close);
  dialog.append(header, element('p', 'journal-conflicts-intro', 'Автоматический выбор отключён. Сравните значения: исходные версии сохранятся в резервной копии даже после выбора.'));
  const conflicts = getJournalConflicts().filter(item => !item.resolvedAt && matchesJournalTeacher(item.local || item.remote || {}, state.currentTeacher));
  for (const conflict of conflicts) {
    const card = element('article', 'journal-conflict-card');
    const record = conflict.local || conflict.remote;
    card.append(element('h3', '', `${record.date || ''} · ${record.group || ''} · пара ${record.lessonNumber || ''}`));
    const snapshot = readLocalJournal().find(entry => entry.id === conflict.id);
    const choices = [];
    for (const [index, path] of (conflict.paths || []).entries()) {
      const field = element('fieldset', 'journal-conflict-field');
      const fieldName = ({ grade: 'Оценка', status: 'Посещаемость', comment: 'Комментарий' })[path.at(-1)] || path.at(-1);
      field.append(element('legend', '', path[0] === 'attendance' ? `${path[1]}: ${fieldName}` : fieldName));
      const name = `conflict-${dialog.querySelectorAll('fieldset').length}-${index}`;
      for (const [source, title] of [['local', 'На устройстве'], ['remote', 'В облаке']]) {
        const label = element('label');
        const input = element('input'); input.type = 'radio'; input.name = name; input.value = source;
        input.checked = source === 'local';
        const value = valueAt(conflict[source], path);
        const display = path.at(-1) === 'status' ? ({ present: 'Был', absent: 'Не был', excused: 'Уважительная причина' })[value] || value : value;
        label.append(input, element('span', '', `${title}: ${String(display ?? 'не указано')}`));
        field.append(label);
      }
      choices.push({ path, field }); card.append(field);
    }
    if (!choices.length) card.append(element('p', '', 'Облачная версия удалена или имеет старый формат. Локальные отметки оставлены. Для удаления используйте кнопку удаления занятия.'));
    const apply = element('button', 'journal-primary-button', choices.length ? 'Сохранить выбранные отметки' : 'Оставить запись с устройства');
    apply.type = 'button'; apply.disabled = state.isGuestMode;
    apply.onclick = () => {
      try {
        const entries = readLocalJournal();
        const index = entries.findIndex(entry => entry.id === conflict.id);
        if (index < 0 || JSON.stringify(entries[index]) !== JSON.stringify(snapshot)) {
          alert('Запись изменилась во время сравнения. Откройте сравнение заново.'); return;
        }
        ensureJournalRecovery();
        const entry = structuredClone(mergeJournalEntry(entries[index], conflict.remote, undefined, true).entry);
        for (const { path, field } of choices) {
          const source = field.querySelector('input:checked')?.value || 'local';
          setAt(entry, path, valueAt(conflict[source], path));
        }
        if (conflict.remote) rememberJournalBaseline([conflict.remote]);
        enqueueJournalEntry(entry);
        entries[index] = entry;
        localStorage.setItem('pwa_journal', JSON.stringify(entries));
        state.journalEntries = entries;
        resolveJournalConflict(conflict.signature);
        dialog.close();
        window.dispatchEvent(new Event('pwa_journal_updated'));
        void flushSyncQueue();
      } catch { alert('Не удалось сохранить выбор. Исходные версии не удалены. Выгрузите резервную копию.'); }
    };
    card.append(apply); dialog.append(card);
  }
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog); dialog.showModal();
}

export function setupJournalSafety() {
  const section = document.getElementById('tabJournal');
  if (!section || document.getElementById('journalSafetyBar')) return;
  const bar = element('aside', 'journal-safety-bar'); bar.id = 'journalSafetyBar'; bar.setAttribute('aria-live', 'polite');
  const copy = element('div', 'journal-safety-copy');
  const title = element('strong'); title.dataset.safetyStatus = '';
  const detail = element('p'); detail.dataset.safetyDetail = '';
  copy.append(title, detail);
  const actions = element('div', 'journal-safety-actions');
  const backup = element('button', 'journal-tool-button', 'Скачать копию'); backup.type = 'button';
  backup.onclick = exportJournalBackup;
  const compare = element('button', 'journal-tool-button', 'Сравнить'); compare.type = 'button'; compare.dataset.compare = '';
  compare.onclick = showJournalConflicts;
  const retry = element('button', 'journal-tool-button', 'Синхронизировать'); retry.type = 'button';
  retry.onclick = () => window.dispatchEvent(new Event('pwa_journal_refresh'));
  actions.append(backup, retry, compare); bar.append(copy, actions); section.prepend(bar);
  window.addEventListener('pwa_journal_updated', renderJournalSafety);
  window.addEventListener('pwa_sync_updated', renderJournalSafety);
  window.addEventListener('online', renderJournalSafety);
  window.addEventListener('offline', renderJournalSafety);
  renderJournalSafety();
}
