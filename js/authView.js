// ==========================================================================
// AUTH VIEW: SUPABASE ACCOUNT AUTH & GUEST (STUDENT) MODE (П. 21)
// ==========================================================================
import { state } from './state.js';
import { signInWithSupabase, signUpWithSupabase, signOutFromSupabase, restoreSupabaseSession } from './supabaseSync.js';

const SECRET_ADMIN_KEYS = ['tripolsky2026', 'admin2026', 'master_admin'];

export function checkSecretAdminUrl() {
  if (typeof window === 'undefined') return false;
  try {
    const url = new URL(window.location.href);
    const key = url.searchParams.get('admin') || url.searchParams.get('admin_key') || url.searchParams.get('key');
    if (key && SECRET_ADMIN_KEYS.includes(key.trim())) {
      setAdminAuthorized('Администратор');
      url.searchParams.delete('admin');
      url.searchParams.delete('admin_key');
      url.searchParams.delete('key');
      const cleanUrl = url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '') + url.hash;
      window.history.replaceState({}, document.title, cleanUrl);
      setTimeout(() => {
        alert('👑 Режим Администратора успешно активирован на этом устройстве!\n\nЖурнал и выставление оценок разблокированы.');
      }, 350);
      return true;
    }
  } catch (e) {
    console.warn('Secret admin URL check error:', e);
  }
  return false;
}

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

export function setAdminAuthorized(name) {
  const adminName = name || state.currentTeacher || 'Администратор';
  state.isGuestMode = false;
  state.currentUser = {
    id: 'admin-master',
    email: 'admin@college.local',
  };
  state.currentProfile = {
    id: 'admin-master',
    full_name: adminName,
    role: 'admin',
  };
  sessionStorage.setItem(AUTH_TEACHER_KEY, adminName);
  try {
    localStorage.setItem('pwa_auth_role', 'admin');
    localStorage.setItem('pwa_admin_authorized', 'true');
    localStorage.removeItem('pwa_is_guest');
  } catch (e) {}
  updateAuthModeUI();
  return true;
}

if (typeof window !== 'undefined') {
  window.setAdminAuthorized = setAdminAuthorized;
  window.giveAdminAccess = setAdminAuthorized;
}

export function setTeacherAuthorized(teacherName) {
  sessionStorage.setItem(AUTH_TEACHER_KEY, teacherName);
  try {
    localStorage.removeItem('pwa_is_guest');
    localStorage.setItem('pwa_authorized_teacher', teacherName);
  } catch (e) {}
  state.isGuestMode = false;
  if (!state.currentProfile) {
    state.currentProfile = {
      id: 'teacher-local',
      full_name: teacherName,
      role: 'teacher',
    };
  }
  updateAuthModeUI();
}

export function setGuestMode() {
  sessionStorage.removeItem(AUTH_TEACHER_KEY);
  try {
    localStorage.setItem('pwa_is_guest', 'true');
    localStorage.removeItem('pwa_auth_role');
    localStorage.removeItem('pwa_admin_authorized');
  } catch (e) {}
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
    const isAdmin = state.currentProfile?.role === 'admin';
    const roleName = isAdmin
      ? 'Админ'
      : state.currentProfile?.role === 'dispatcher'
      ? 'Диспетчер'
      : 'Преподаватель';

    if (isGuest) {
      authStatusBtn.innerHTML = '<span>👀 Гость</span>';
      authStatusBtn.title = 'Режим гостя (только чтение). Нажмите для входа в аккаунт';
      authStatusBtn.classList.remove('is-admin');
    } else if (isAdmin) {
      authStatusBtn.innerHTML = '<span>👑 Админ</span>';
      authStatusBtn.title = `Администратор: ${state.currentProfile?.full_name || state.currentTeacher} (полный доступ к журналу). Нажмите для смены роли`;
      authStatusBtn.classList.add('is-admin');
    } else {
      const name = state.currentProfile?.full_name || state.currentUser?.email || state.currentTeacher || 'Вход выполнен';
      authStatusBtn.innerHTML = `<span>👤 ${roleName}</span>`;
      authStatusBtn.title = `Авторизован: ${name} (${roleName}). Нажмите для выхода`;
      authStatusBtn.classList.remove('is-admin');
    }
  }
}

export function setupAuthListeners(onTeacherChangeConfirmed) {
  checkSecretAdminUrl();
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
    if (!state.isGuestMode) {
      const role = state.currentProfile?.role === 'admin' ? 'Администратор' : 'Преподаватель';
      const changeMode = confirm(`Вы авторизованы как: ${state.currentProfile?.full_name || state.currentTeacher} (${role}).\n\nНажмите OK, чтобы переключиться в режим гостя (только чтение).\nНажмите Отмена, чтобы остаться с полным доступом.`);
      if (changeMode) {
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

  const signUpBtn = document.getElementById('pinModalSignUpBtn');
  signUpBtn?.addEventListener('click', async () => {
    const email = (emailEl?.value || '').trim();
    const pass = (passEl?.value || '').trim();
    if (!email || !pass || pass.length < 6) {
      if (errorEl) {
        errorEl.textContent = 'Для регистрации введите email и пароль (минимум 6 знаков)';
        errorEl.classList.remove('hidden');
      }
      return;
    }
    try {
      signUpBtn.disabled = true;
      signUpBtn.textContent = 'Регистрация...';
      await signUpWithSupabase(email, pass, modal._targetTeacher || state.currentTeacher);
      signUpBtn.disabled = false;
      signUpBtn.textContent = 'Регистрация';
      alert('Учётная запись зарегистрирована! Вы вошли с правами администратора.');
      if (modal._onSuccess) modal._onSuccess();
    } catch (err) {
      signUpBtn.disabled = false;
      signUpBtn.textContent = 'Регистрация';
      if (errorEl) {
        errorEl.textContent = err.message || 'Ошибка регистрации в Supabase';
        errorEl.classList.remove('hidden');
      }
    }
  });
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
