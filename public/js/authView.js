// ==========================================================================
// AUTH VIEW: SUPABASE ACCOUNT AUTH & GUEST (STUDENT) MODE (П. 21)
// ==========================================================================
import { state } from './state.js';
import { signInWithSupabase, signOutFromSupabase, restoreSupabaseSession } from './supabaseSync.js';

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
  if (!state.isGuestMode && state.currentUser) return true;
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
  state.currentUser = null;
  state.currentProfile = null;
  updateAuthModeUI();
}

export function promptTeacherAuth(targetTeacher, onAuthorized) {
  const modal = document.getElementById('pinCodeModal');
  if (!modal) {
    if (typeof onAuthorized === 'function') onAuthorized();
    return;
  }

  const titleEl = document.getElementById('pinModalTeacherName');
  const emailEl = document.getElementById('authModalEmail');
  const passEl = document.getElementById('pinModalInput');
  const errorEl = document.getElementById('pinModalError');

  if (titleEl) {
    titleEl.textContent = targetTeacher || state.currentTeacher || 'Преподаватель';
  }
  if (emailEl) {
    if (!emailEl.value && targetTeacher) {
      emailEl.placeholder = `teacher@college.ru или логин`;
    }
  }
  if (passEl) {
    passEl.value = '';
    passEl.focus();
  }
  if (errorEl) errorEl.classList.add('hidden');

  modal.classList.remove('hidden');

  modal._onSuccess = () => {
    modal.classList.add('hidden');
    setTeacherAuthorized(targetTeacher || state.currentTeacher);
    if (typeof onAuthorized === 'function') onAuthorized();
  };

  modal._targetTeacher = targetTeacher || state.currentTeacher;
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
    const roleName = state.currentProfile?.role === 'admin'
      ? 'Админ'
      : state.currentProfile?.role === 'dispatcher'
      ? 'Диспетчер'
      : 'Преподаватель';

    if (isGuest) {
      authStatusBtn.innerHTML = '<span>👀 Гость</span>';
      authStatusBtn.title = 'Режим гостя (только чтение). Нажмите для входа в аккаунт';
    } else {
      const name = state.currentProfile?.full_name || state.currentUser?.email || state.currentTeacher || 'Вход выполнен';
      authStatusBtn.innerHTML = `<span>👤 ${roleName}</span>`;
      authStatusBtn.title = `Авторизован: ${name} (${roleName}). Нажмите для выхода`;
    }
  }
}

export function setupAuthListeners(onTeacherChangeConfirmed) {
  const modal = document.getElementById('pinCodeModal');
  const confirmBtn = document.getElementById('pinModalConfirmBtn');
  const guestBtn = document.getElementById('pinModalGuestBtn');
  const cancelBtn = document.getElementById('pinModalCancelBtn');
  const emailEl = document.getElementById('authModalEmail');
  const passEl = document.getElementById('pinModalInput');
  const errorEl = document.getElementById('pinModalError');
  const authStatusBtn = document.getElementById('headerAuthStatusBtn');

  // Автоматическое восстановление сессии Supabase при запуске
  restoreSupabaseSession().then((session) => {
    if (session) {
      updateAuthModeUI();
      if (typeof onTeacherChangeConfirmed === 'function') onTeacherChangeConfirmed();
    }
  });

  authStatusBtn?.addEventListener('click', async () => {
    if (!state.isGuestMode && state.currentUser) {
      const confirmed = confirm(`Вы вошли как: ${state.currentProfile?.full_name || state.currentUser?.email}\nВыйти из учётной записи?`);
      if (confirmed) {
        await signOutFromSupabase();
        setGuestMode();
        if (typeof onTeacherChangeConfirmed === 'function') onTeacherChangeConfirmed();
      }
    } else {
      promptTeacherAuth(state.currentTeacher, onTeacherChangeConfirmed);
    }
  });

  async function verify() {
    const teacher = modal._targetTeacher || state.currentTeacher;
    const email = (emailEl?.value || '').trim();
    const pass = (passEl?.value || '').trim();

    // 1. Попытка входа через Supabase Auth
    if (email && pass) {
      try {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Проверка...';
        await signInWithSupabase(email, pass);
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Войти в аккаунт';
        if (modal._onSuccess) modal._onSuccess();
        return;
      } catch (sbErr) {
        console.warn('Supabase Auth error:', sbErr);
        // Если пароль подошёл как резервный локальный PIN
        const expectedPin = getTeacherPin(teacher);
        if (pass === expectedPin) {
          setTeacherAuthorized(teacher);
          if (modal._onSuccess) modal._onSuccess();
          return;
        }
        if (errorEl) {
          errorEl.textContent = sbErr.message || 'Ошибка авторизации. Проверьте логин и пароль.';
          errorEl.classList.remove('hidden');
        }
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Войти в аккаунт';
        return;
      }
    }

    // 2. Резервный вход по локальному PIN-коду (для работы без сети)
    const expectedPin = getTeacherPin(teacher);
    if (pass === expectedPin || pass === '0000') {
      setTeacherAuthorized(teacher);
      if (modal._onSuccess) modal._onSuccess();
    } else {
      if (errorEl) {
        errorEl.textContent = 'Введите email и пароль учётной записи или локальный PIN (0000)';
        errorEl.classList.remove('hidden');
      }
    }
  }

  confirmBtn?.addEventListener('click', verify);
  passEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') verify();
  });
  emailEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') passEl?.focus();
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
}
