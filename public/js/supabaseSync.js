// ==========================================================================
// SUPABASE SYNC: UNIFIED BACKEND, REALTIME SCHEDULE & SUPABASE AUTH
// ==========================================================================
import { state, DAY_NAMES } from './state.js';
import { renderJournalHistory } from './journalHistory.js';
import { renderJournalStats } from './journalStats.js';
import { notifyScheduleChanges } from './notifications.js';

export const SUPABASE_URL = (typeof localStorage !== 'undefined' && localStorage.getItem('raspisanie-supabase-url'))
  || 'https://qyfbteaaglcrglgsbbez.supabase.co';

export const SUPABASE_ANON_KEY = (typeof localStorage !== 'undefined' && localStorage.getItem('raspisanie-supabase-key'))
  || 'sb_publishable_ji7M8s3uSowT8suczfZKpg_mzmq8YEC';

const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

let realtimeScheduleChannel = null;
let realtimeJournalChannel = null;

export function getSupabaseClient() {
  if (typeof window !== 'undefined' && window.supabase?.createClient) {
    if (!window._sbClient) {
      window._sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return window._sbClient;
  }
  return null;
}

// ==========================================================================
// АДАПТЕР: ПРЕОБРАЗОВАНИЕ СХЕМЫ ДИСПЕТЧЕРА (AppData) В МОДЕЛЬ ПРОСМОТРА
// ==========================================================================
export function convertAppDataToPwa(appData) {
  if (!appData || typeof appData !== 'object') {
    return { schedulesAll: {}, teachersList: [], bells: state.bells };
  }

  const teachersMap = new Map((appData.teachers || []).map((t) => [t.id, t.name]));
  const groupsMap = new Map((appData.groups || []).map((g) => [g.id, g.name]));
  const subjectsMap = new Map((appData.subjects || []).map((s) => [s.id, s.name]));
  const audiencesMap = new Map((appData.audiences || []).map((a) => [a.id, a.name]));
  const slotsMap = new Map((appData.pairSlots || []).map((p) => [p.id, p]));

  const bells = (appData.pairSlots || []).map((p) => ({
    lessonNumber: p.number,
    startTime: p.startTime,
    endTime: p.endTime,
  })).sort((a, b) => a.lessonNumber - b.lessonNumber);

  const schedulesAll = {};
  const teachersList = (appData.teachers || []).map((t) => t.name).filter(Boolean);

  teachersList.forEach((t) => {
    schedulesAll[t] = [];
  });

  (appData.scheduleEntries || []).forEach((entry) => {
    const teacherName = teachersMap.get(entry.teacherId) || 'Преподаватель';
    const subjectName = subjectsMap.get(entry.subjectId) || 'Занятие';
    const classroomName = audiencesMap.get(entry.audienceId) || '';
    const slot = slotsMap.get(entry.pairSlotId) || { number: 1, startTime: '08:00', endTime: '09:20' };

    const rawGroupIds = Array.isArray(entry.groupIds) && entry.groupIds.length > 0 ? entry.groupIds : [''];
    rawGroupIds.forEach((gid) => {
      const groupName = groupsMap.get(gid) || gid || '—';
      const lesson = {
        id: `${entry.id || 'entry'}_${groupName}`,
        dayOfWeek: Number(entry.dayOfWeek),
        dayName: DAY_NAMES[entry.dayOfWeek] || '',
        lessonNumber: Number(slot.number),
        startTime: slot.startTime,
        endTime: slot.endTime,
        subject: subjectName,
        group: groupName,
        subgroup: null,
        teacher: teacherName,
        classroom: classroomName,
        weekType: 'all',
      };

      if (!schedulesAll[teacherName]) {
        schedulesAll[teacherName] = [];
      }
      schedulesAll[teacherName].push(lesson);
    });
  });

  // Сортировка занятий каждого преподавателя по дням и номерам пар
  Object.keys(schedulesAll).forEach((t) => {
    schedulesAll[t].sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return a.lessonNumber - b.lessonNumber;
    });
  });

  return { schedulesAll, teachersList, bells };
}

// ==========================================================================
// ЗАГРУЗКА РАСПИСАНИЯ ИЗ БАЗЫ ДИСПЕТЧЕРА (public.schedule_data)
// ==========================================================================
export async function fetchRemoteScheduleData() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/schedule_data?id=eq.default&select=data,version,updated_at`, {
      headers: HEADERS,
    });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0 || !rows[0].data) return null;

    const row = rows[0];
    const converted = convertAppDataToPwa(row.data);

    if (converted.teachersList.length > 0) {
      state.teachersList = converted.teachersList;
      try {
        localStorage.setItem('pwa_teachers_list', JSON.stringify(converted.teachersList));
      } catch (e) {}
    }

    if (converted.bells && converted.bells.length > 0) {
      state.bells = converted.bells;
    }

    if (converted.schedulesAll && Object.keys(converted.schedulesAll).length > 0) {
      state.schedulesAll = converted.schedulesAll;
      try {
        localStorage.setItem('pwa_kiosk_schedules_all', JSON.stringify(converted.schedulesAll));
      } catch (e) {}

      // Если выбран преподаватель — обновляем текущее расписание
      if (state.currentTeacher && converted.schedulesAll[state.currentTeacher]) {
        state.schedule = {
          success: true,
          teacher: state.currentTeacher,
          lessons: converted.schedulesAll[state.currentTeacher],
          bells: state.bells,
        };
        try {
          localStorage.setItem('pwa_custom_schedule', JSON.stringify(state.schedule));
        } catch (e) {}
      }
    }

    return converted;
  } catch (e) {
    console.warn('⚠️ Supabase fetchRemoteScheduleData error:', e);
    return null;
  }
}

// ==========================================================================
// REALTIME ПОДПИСКА НА ОБНОВЛЕНИЯ БЕЗ ПЕРЕЗАГРУЗКИ СТРАНИЦЫ (П. 20)
// ==========================================================================
export function setupRealtimeSubscription(onScheduleUpdated) {
  const client = getSupabaseClient();
  if (!client) return;

  // 1. Подписка на расписание диспетчера (schedule_data)
  if (!realtimeScheduleChannel) {
    try {
      realtimeScheduleChannel = client
        .channel('pwa-schedule-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'schedule_data', filter: 'id=eq.default' },
          (payload) => {
            const row = payload.new;
            if (row?.data) {
              handleScheduleRealtimePayload(row.data, onScheduleUpdated);
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('⚡ Supabase Realtime: подписка на расписание диспетчера активна');
          }
        });
    } catch (e) {
      console.warn('Realtime schedule subscription error:', e);
    }
  }

  // 2. Подписка на журнал занятий (journal_entries)
  if (!realtimeJournalChannel) {
    try {
      realtimeJournalChannel = client
        .channel('pwa-journal-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'journal_entries' },
          (payload) => {
            handleJournalRealtimePayload(payload);
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('⚡ Supabase Realtime: подписка на журнал активна');
          }
        });
    } catch (e) {
      console.warn('Realtime journal subscription error:', e);
    }
  }
}

function handleScheduleRealtimePayload(appData, onScheduleUpdated) {
  try {
    const oldLessons = state.schedule?.lessons ? [...state.schedule.lessons] : [];
    const converted = convertAppDataToPwa(appData);

    if (converted.teachersList.length > 0) {
      state.teachersList = converted.teachersList;
    }
    if (converted.bells.length > 0) {
      state.bells = converted.bells;
    }
    state.schedulesAll = converted.schedulesAll;

    try {
      localStorage.setItem('pwa_kiosk_schedules_all', JSON.stringify(converted.schedulesAll));
      localStorage.setItem('pwa_teachers_list', JSON.stringify(converted.teachersList));
    } catch (e) {}

    const curTeacher = state.currentTeacher;
    if (curTeacher && converted.schedulesAll[curTeacher]) {
      const newLessons = converted.schedulesAll[curTeacher];

      // Оповещаем преподавателя, если изменилась его пара (П. 25)
      notifyScheduleChanges(oldLessons, newLessons, curTeacher);

      state.schedule = {
        success: true,
        teacher: curTeacher,
        lessons: newLessons,
        bells: state.bells,
      };
      try {
        localStorage.setItem('pwa_custom_schedule', JSON.stringify(state.schedule));
      } catch (e) {}
    }

    // Мгновенное обновление UI без перезагрузки страницы (П. 20)
    if (typeof onScheduleUpdated === 'function') {
      onScheduleUpdated();
    }
    window.dispatchEvent(new CustomEvent('pwa_schedule_updated'));
  } catch (err) {
    console.error('Ошибка обработки Realtime расписания:', err);
  }
}

function handleJournalRealtimePayload(payload) {
  const current = state.journalEntries || [];
  if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
    const row = payload.new;
    const entry = {
      id: row.id,
      date: row.date,
      dateFormatted: row.date_formatted,
      group: row.group_name,
      teacher: row.teacher_name,
      lessonNumber: row.lesson_number,
      subject: row.subject,
      startTime: row.start_time,
      endTime: row.end_time,
      classroom: row.classroom || '',
      topic: row.topic || '',
      topicIndex: row.topic_index,
      courseLessonNumber: row.course_lesson_number,
      type: row.type || 'theory',
      subgroup: row.subgroup || null,
      notes: row.notes || '',
      attendance: row.attendance || {},
      status: 'completed',
    };

    const idx = current.findIndex((e) => e.id === entry.id);
    if (idx !== -1) current[idx] = entry;
    else current.push(entry);

    state.journalEntries = current;
    localStorage.setItem('pwa_journal', JSON.stringify(current));
    renderJournalHistory();
    const g = document.getElementById('journalGroupSelect')?.value;
    renderJournalStats(g);
  } else if (payload.eventType === 'DELETE') {
    const deletedId = payload.old?.id;
    if (deletedId) {
      state.journalEntries = current.filter((e) => e.id !== deletedId);
      localStorage.setItem('pwa_journal', JSON.stringify(state.journalEntries));
      renderJournalHistory();
      const g = document.getElementById('journalGroupSelect')?.value;
      renderJournalStats(g);
    }
  }
}

// ==========================================================================
// SUPABASE AUTH & РОЛИ ПОЛЬЗОВАТЕЛЕЙ (П. 21)
// ==========================================================================
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
  const isExplicitGuest = typeof localStorage !== 'undefined' && localStorage.getItem('pwa_is_guest') === 'true';
  const client = getSupabaseClient();
  if (!client) {
    if (!isExplicitGuest) {
      state.isGuestMode = false;
      state.currentProfile = state.currentProfile || { id: 'admin-local', full_name: state.currentTeacher || 'Администратор', role: 'admin' };
      state.currentUser = state.currentUser || { id: 'admin-local', email: 'admin@college.local' };
    }
    return null;
  }

  try {
    const { data: sessionData } = await client.auth.getSession();
    const session = sessionData?.session;
    if (!session?.user) {
      if (!isExplicitGuest) {
        state.isGuestMode = false;
        state.currentProfile = state.currentProfile || { id: 'admin-local', full_name: state.currentTeacher || 'Администратор', role: 'admin' };
        state.currentUser = state.currentUser || { id: 'admin-local', email: 'admin@college.local' };
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
    state.currentProfile = profile || { id: user.id, full_name: user.email, role: 'admin' };
    state.isGuestMode = false;

    if (profile?.full_name) {
      state.currentTeacher = profile.full_name;
    }

    return { user, profile: state.currentProfile };
  } catch (e) {
    state.isGuestMode = isExplicitGuest;
    return null;
  }
}

// ==========================================================================
// ЖУРНАЛ И СТУДЕНТЫ: ОБЛАЧНАЯ СИНХРОНИЗАЦИЯ
// ==========================================================================
export async function fetchRemoteJournal(teacherName) {
  try {
    let url = `${SUPABASE_URL}/rest/v1/journal_entries?order=date.asc,lesson_number.asc`;
    if (teacherName) {
      url += `&teacher_name=eq.${encodeURIComponent(teacherName)}`;
    }
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows)) return null;

    return rows.map((r) => ({
      id: r.id,
      date: r.date,
      dateFormatted: r.date_formatted,
      group: r.group_name,
      teacher: r.teacher_name,
      lessonNumber: r.lesson_number,
      subject: r.subject,
      startTime: r.start_time,
      endTime: r.end_time,
      classroom: r.classroom || '',
      topic: r.topic || '',
      topicIndex: r.topic_index,
      courseLessonNumber: r.course_lesson_number,
      type: r.type || 'theory',
      subgroup: r.subgroup || null,
      notes: r.notes || '',
      attendance: r.attendance || {},
      status: 'completed',
      completedAt: r.created_at || new Date().toISOString(),
    }));
  } catch (e) {
    return null;
  }
}

export async function pushJournalEntryToCloud(entry) {
  try {
    const row = {
      id: entry.id,
      date: entry.date,
      date_formatted: entry.dateFormatted || entry.date,
      group_name: entry.group,
      teacher_name: entry.teacher || state.currentTeacher || 'Преподаватель',
      lesson_number: Number(entry.lessonNumber),
      subject: entry.subject || 'Учебная дисциплина',
      start_time: entry.startTime || '08:00',
      end_time: entry.endTime || '09:20',
      classroom: entry.classroom || '',
      topic: entry.topic || '',
      topic_index: entry.topicIndex || null,
      course_lesson_number: entry.courseLessonNumber || null,
      type: entry.type || 'theory',
      subgroup: entry.subgroup ? Number(entry.subgroup) : null,
      notes: entry.notes || null,
      attendance: entry.attendance || {},
    };

    await fetch(`${SUPABASE_URL}/rest/v1/journal_entries`, {
      method: 'POST',
      headers: {
        ...HEADERS,
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(row),
    });
  } catch (err) {
    console.warn('⚠️ Supabase pushJournalEntryToCloud error:', err);
  }
}

export async function deleteJournalEntryFromCloud(entryId) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/journal_entries?id=eq.${encodeURIComponent(entryId)}`, {
      method: 'DELETE',
      headers: HEADERS,
    });
  } catch (err) {}
}

export async function fetchRemoteStudents() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/students?select=group_name,full_name&order=group_name.asc,full_name.asc`, { headers: HEADERS });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const map = {};
    rows.forEach((r) => {
      const g = r.group_name;
      if (!map[g]) map[g] = [];
      if (!map[g].includes(r.full_name)) map[g].push(r.full_name);
    });
    return map;
  } catch (e) {
    return null;
  }
}

export async function pushStudentToCloud(group, studentName) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/students?on_conflict=group_name,full_name`, {
      method: 'POST',
      headers: { ...HEADERS, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ group_name: group, full_name: studentName }),
    });
  } catch (e) {}
}

export async function pushBulkStudentsToCloud(group, studentNames) {
  try {
    const rows = studentNames.map((name) => ({ group_name: group, full_name: name }));
    await fetch(`${SUPABASE_URL}/rest/v1/students?on_conflict=group_name,full_name`, {
      method: 'POST',
      headers: { ...HEADERS, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(rows),
    });
  } catch (e) {}
}

export async function deleteStudentFromCloud(group, studentName) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/students?group_name=eq.${encodeURIComponent(group)}&full_name=eq.${encodeURIComponent(studentName)}`, {
      method: 'DELETE',
      headers: HEADERS,
    });
  } catch (e) {}
}
