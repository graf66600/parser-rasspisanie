import { state } from './state.js';
import { getSupabaseClient } from './supabaseClient.js';

export async function signUpWithSupabase(email, password, fullName) {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase клиент недоступен');
  }
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName || email,
        role: 'admin',
      },
    },
  });
  if (error) throw error;
  if (data?.user) {
    state.currentUser = data.user;
    state.currentProfile = {
      id: data.user.id,
      full_name: fullName || data.user.email,
      role: 'admin',
    };
    state.isGuestMode = false;
    try {
      localStorage.setItem('pwa_auth_role', 'admin');
      localStorage.removeItem('pwa_is_guest');
    } catch (e) {}
  }
  return data;
}

export async function signInWithSupabase(email, password) {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase клиент недоступен');
  }

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;

  const user = data.user;
  let profile = null;

  try {
    const { data: profData } = await client
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    profile = profData;
  } catch (e) {
    console.warn('Профиль не найден, используется базовая роль:', e);
  }

  state.currentUser = user;
  state.currentProfile = profile || { id: user.id, full_name: user.email, role: 'teacher' };
  state.isGuestMode = false;

  if (profile?.full_name) {
    state.currentTeacher = profile.full_name;
    try {
      localStorage.setItem('pwa_current_teacher', profile.full_name);
    } catch (e) {}
  }

  return { user, profile: state.currentProfile };
}

export async function signOutFromSupabase() {
  const client = getSupabaseClient();
  if (client) {
    try {
      await client.auth.signOut();
    } catch (e) {}
  }
  state.currentUser = null;
  state.currentProfile = null;
  state.isGuestMode = true;
}

export async function restoreSupabaseSession() {
  const isAdmin = typeof localStorage !== 'undefined'
    && localStorage.getItem('pwa_admin_authorized') === 'true'
    && localStorage.getItem('pwa_auth_role') === 'admin';
  const isExplicitGuest = typeof localStorage !== 'undefined' && localStorage.getItem('pwa_is_guest') === 'true';

  const client = getSupabaseClient();
  if (!client) {
    if (isAdmin && !isExplicitGuest) {
      state.isGuestMode = false;
      state.currentProfile = state.currentProfile || { id: 'admin-master', full_name: state.currentTeacher || 'Администратор', role: 'admin' };
      state.currentUser = state.currentUser || { id: 'admin-master', email: 'admin@college.local' };
    }
    return null;
  }

  try {
    const { data: sessionData } = await client.auth.getSession();
    const session = sessionData?.session;
    if (!session?.user) {
      if (isAdmin && !isExplicitGuest) {
        state.isGuestMode = false;
        state.currentProfile = state.currentProfile || { id: 'admin-master', full_name: state.currentTeacher || 'Администратор', role: 'admin' };
        state.currentUser = state.currentUser || { id: 'admin-master', email: 'admin@college.local' };
      } else {
        state.isGuestMode = true;
      }
      return null;
    }

    const user = session.user;
    const { data: profile } = await client
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    state.currentUser = user;
    state.currentProfile = profile || { id: user.id, full_name: user.email, role: 'teacher' };
    state.isGuestMode = false;

    if (profile?.full_name) {
      state.currentTeacher = profile.full_name;
    }

    return { user, profile: state.currentProfile };
  } catch (e) {
    if (isAdmin && !isExplicitGuest) {
      state.isGuestMode = false;
    } else {
      state.isGuestMode = true;
    }
    return null;
  }
}
