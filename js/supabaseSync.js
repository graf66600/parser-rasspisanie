// ==========================================================================
// SUPABASE SYNC: UNIFIED BACKEND, REALTIME SCHEDULE & SUPABASE AUTH
// ==========================================================================
import { state, DAY_NAMES } from './state.js';
import { loadJournalHistory } from './journalHistory.js';
import { notifyScheduleChanges } from './notifications.js';
import { canUseRemoteSchedule } from './scheduleFreshness.js';

import { SUPABASE_URL, HEADERS, getSupabaseClient } from './supabaseClient.js';
import { hasPendingJournalMutation } from './syncStorage.js';
import { ensureJournalRecovery, archiveJournalConflicts } from './journalRecovery.js';
export { SUPABASE_URL, SUPABASE_ANON_KEY, getSupabaseClient } from './supabaseClient.js';
export { signUpWithSupabase, signInWithSupabase, signOutFromSupabase, restoreSupabaseSession } from './supabaseAuth.js';
export { fetchRemoteJournal, pushJournalEntryToCloud, deleteJournalEntryFromCloud, fetchRemoteStudents, pushStudentToCloud, pushBulkStudentsToCloud, deleteStudentFromCloud } from './cloudRecords.js';

let realtimeScheduleChannel = null;
let realtimeJournalChannel = null;

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
    if (!await canUseRemoteSchedule(row.updated_at)) return null;
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
          async (payload) => {
            const row = payload.new;
            if (row?.data && await canUseRemoteSchedule(row.updated_at)) {
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
  // Treat realtime as invalidation, never as an authoritative whole-record overwrite.
  if (payload.eventType === 'DELETE' && payload.old?.id && !hasPendingJournalMutation(payload.old.id)) {
    const entry = (state.journalEntries || []).find(item => item.id === payload.old.id);
    if (entry) {
      ensureJournalRecovery();
      archiveJournalConflicts([{ id: entry.id, local: entry, remote: null, fields: ['deletedInCloud'] }]);
    }
  }
  void loadJournalHistory();
}
