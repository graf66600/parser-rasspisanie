// ==========================================================================
// AUTH VIEW: PIN CODE VERIFICATION & GUEST (STUDENT) MODE
// ==========================================================================
import { state } from './state.js';

const PIN_STORAGE_KEY = 'pwa_teacher_pins';
const AUTH_TEACHER_KEY = 'pwa_authorized_teacher';

export function getTeacherPin(teacherName) {
  try {
    const pins = JSON.parse(localStorage.getItem(PIN_STORAGE_KEY) || '{}');
    return pins[teacherName] || '0000';
  } catch (e) {
    return '0000';
  }
}

export function setTeacherPin(teacherName, newPin) {
  try {
    const pins = JSON.parse(localStorage.getItem(PIN_STORAGE_KEY) || '{}');
    pins[teacherName] = newPin;
    localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(pins));
    return true;
  } catch (e) {
    return false;
  }
}

export function isTeacherAuthorized(teacherName) {
  const authed = sessionStorage.getItem(AUTH_TEACHER_KEY);
  return authed === teacherName;
}

export function setTeacherAuthorized(teacherName) {
  sessionStorage.setItem(AUTH_TEACHER_KEY, teacherName);
  state.isGuestMode = false;
  updateAuthModeUI();
}

export function setGuestMode() {
  sessionStorage.removeItem(AUTH_TEACHER_KEY);
  state.isGuestMode = true;
  updateAuthModeUI();
}

export function promptTeacherAuth(targetTeacher, onAuthorized) {
  const modal = document.getElementById('pinCodeModal');
  if (!modal) {
    if (typeof onAuthorized === 'function') onAuthorized();
    return;
  }

  const titleEl = document.getElementById('pinModalTeacherName');
  const inputEl = document.getElementById('pinModalInput');
  const errorEl = document.getElementById('pinModalError');

  if (titleEl) titleEl.textContent = targetTeacher;
  if (inputEl) {
    inputEl.value = '';
    inputEl.focus();
  }
  if (errorEl) errorEl.classList.add('hidden');

  modal.classList.remove('hidden');

  modal._onSuccess = () => {
    modal.classList.add('hidden');
    setTeacherAuthorized(targetTeacher);
    if (typeof onAuthorized === 'function') onAuthorized();
  };

  modal._targetTeacher = targetTeacher;
}

export function updateAuthModeUI() {
  const isGuest = state.isGuestMode;
  const banner = document.getElementById('journalGuestNotice');
  const saveBtn = document.getElementById('saveJournalBtn');
  const markAllBtn = document.getElementById('markAllPresentBtn');
  const resetBtn = document.getElementById('resetAttendanceBtn');
  const authStatusBtn = document.getElementById('headerAuthStatusBtn');

  if (banner) {
    if (isGuest) banner.classList.remove('hidden');
    else banner.classList.add('hidden');
  }

  if (saveBtn) saveBtn.style.display = isGuest ? 'none' : 'block';
  if (markAllBtn) markAllBtn.style.display = isGuest ? 'none' : 'inline-block';
  if (resetBtn) resetBtn.style.display = isGuest ? 'none' : 'inline-block';

  // Селекторы оценок в списке студентов
  document.querySelectorAll('.grade-select, .status-btn').forEach((el) => {
    el.disabled = isGuest;
    if (isGuest) el.classList.add('pointer-events-none', 'opacity-80');
    else el.classList.remove('pointer-events-none', 'opacity-80');
  });

  if (authStatusBtn) {
    authStatusBtn.innerHTML = isGuest
      ? '<span>👀 Гость (студент)</span>'
      : `<span>🔐 ${state.currentTeacher}</span>`;
  }
}

export function setupAuthListeners(onTeacherChangeConfirmed) {
  const modal = document.getElementById('pinCodeModal');
  const confirmBtn = document.getElementById('pinModalConfirmBtn');
  const guestBtn = document.getElementById('pinModalGuestBtn');
  const cancelBtn = document.getElementById('pinModalCancelBtn');
  const inputEl = document.getElementById('pinModalInput');
  const errorEl = document.getElementById('pinModalError');
  const changePinBtn = document.getElementById('pinModalChangePinBtn');
  const authStatusBtn = document.getElementById('headerAuthStatusBtn');

  authStatusBtn?.addEventListener('click', () => {
    promptTeacherAuth(state.currentTeacher, onTeacherChangeConfirmed);
  });

  function verify() {
    const teacher = modal._targetTeacher || state.currentTeacher;
    const expectedPin = getTeacherPin(teacher);
    const entered = (inputEl?.value || '').trim();

    if (entered === expectedPin) {
      if (modal._onSuccess) modal._onSuccess();
    } else {
      if (errorEl) {
        errorEl.textContent = 'Неверный PIN-код. По умолчанию: 0000';
        errorEl.classList.remove('hidden');
      }
    }
  }

  confirmBtn?.addEventListener('click', verify);
  inputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') verify();
  });

  guestBtn?.addEventListener('click', () => {
    modal.classList.add('hidden');
    setGuestMode();
    if (typeof onTeacherChangeConfirmed === 'function') onTeacherChangeConfirmed();
  });

  cancelBtn?.addEventListener('click', () => {
    modal.classList.add('hidden');
    const sel = document.getElementById('teacherSelect');
    if (sel) sel.value = state.currentTeacher;
  });

  changePinBtn?.addEventListener('click', () => {
    const teacher = modal._targetTeacher || state.currentTeacher;
    const currentEntered = (inputEl?.value || '').trim();
    const curPin = getTeacherPin(teacher);
    if (currentEntered !== curPin) {
      if (errorEl) {
        errorEl.textContent = 'Сначала введите текущий PIN в поле ввода';
        errorEl.classList.remove('hidden');
      }
      return;
    }
    const newPin = prompt(`Введите новый 4-значный PIN для ${teacher}:`, '');
    if (newPin && newPin.trim().length >= 4) {
      setTeacherPin(teacher, newPin.trim());
      alert('✅ Новый PIN успешно сохранен!');
    }
  });
}
