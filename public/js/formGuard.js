// ==========================================================================
// FORM GUARD: PREVENT ACCIDENTAL LOSS OF UNSAVED JOURNAL EDITS
// ==========================================================================

let isFormDirty = false;

export function isJournalDirty() {
  return isFormDirty;
}

export function markJournalDirty() {
  isFormDirty = true;
}

export function markJournalClean() {
  isFormDirty = false;
}

export function setupFormGuard(onTabSwitchRequest) {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeunload', (e) => {
    if (isFormDirty) {
      e.preventDefault();
      e.returnValue = 'У вас есть несохранённые оценки в журнале!';
      return e.returnValue;
    }
  });

  // Отслеживание изменений во всех полях формы журнала
  const formEl = document.getElementById('tabJournal');
  if (formEl) {
    formEl.addEventListener('input', (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        markJournalDirty();
      }
    });

    formEl.addEventListener('click', (e) => {
      if (e.target?.closest('.status-btn') || e.target?.closest('.grade-select') || e.target?.closest('.subgroup-toggle-badge')) {
        markJournalDirty();
      }
    });
  }
}

export function checkCanSwitchTab(targetTabId, currentTabId) {
  if (currentTabId === 'tabJournal' && targetTabId !== 'tabJournal' && isFormDirty) {
    const ok = confirm('⚠️ В журнале есть несохранённые оценки или изменения.\nВы уверены, что хотите уйти без сохранения?');
    if (!ok) return false;
    markJournalClean();
  }
  return true;
}
