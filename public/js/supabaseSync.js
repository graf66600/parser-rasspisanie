// ==========================================================================
// SUPABASE SYNC: CLIENT-SIDE DIRECT CLOUD PERSISTENCE & REALTIME
// ==========================================================================
import { state } from './state.js';
import { renderJournalHistory } from './journalHistory.js';
import { renderJournalStats } from './journalStats.js';

const SUPABASE_URL = 'https://pojegdivnkuvyiizmesa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvamVnZGl2bmt1dnlpaXptZXNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MzUxMDEsImV4cCI6MjEwNTIxMTEwMX0.y0U_bhB5hFTNaN4dXsji-K7fp93HpENuB9UHEv_c0qA';

const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

let realtimeChannel = null;

export function getSupabaseClient() {
  if (window.supabase?.createClient) {
    if (!window._sbClient) {
      window._sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return window._sbClient;
  }
  return null;
}

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
    console.warn('⚠️ Supabase fetchRemoteJournal error:', e);
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
      teacher_name: entry.teacher || 'Трипольский',
      lesson_number: Number(entry.lessonNumber),
      subject: entry.subject || 'Информатика',
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
  } catch (err) {
    console.warn('⚠️ Supabase deleteJournalEntryFromCloud error:', err);
  }
}

export function setupRealtimeSubscription() {
  const client = getSupabaseClient();
  if (!client || realtimeChannel) return;

  try {
    realtimeChannel = client
      .channel('pwa-journal-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'journal_entries' },
        (payload) => {
          handleRealtimePayload(payload);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('⚡ Supabase Realtime: подписка на журнал активна');
        }
      });
  } catch (e) {
    console.warn('Realtime subscription init failed:', e);
  }
}

function handleRealtimePayload(payload) {
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
