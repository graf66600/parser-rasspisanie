import { Lesson } from '../types/schedule.js';
import { SUPABASE_URL } from './supabaseService.js';

type PublicationResult = { ok: true } | { ok: false; error: string };

export async function publishScheduleToCloud(
  teachers: string[],
  lessonsByTeacher: Record<string, Lesson[]>,
): Promise<PublicationResult> {
  const key = process.env.SUPABASE_SCHEDULE_PUBLISH_KEY?.trim();
  if (!key) {
    return { ok: false, error: 'Серверный ключ публикации Supabase не настроен' };
  }
  const names = [...new Set([...teachers, ...Object.keys(lessonsByTeacher)])];
  const rows = Object.entries(lessonsByTeacher).flatMap(([teacher, lessons]) => lessons.map((lesson, index) => ({
    id: `${encodeURIComponent(teacher)}_${lesson.dayOfWeek}_${lesson.lessonNumber}_${encodeURIComponent(lesson.group)}_${encodeURIComponent(lesson.subgroup || '0')}_${index}`,
    teacher_name: teacher,
    day_of_week: lesson.dayOfWeek,
    day_name: lesson.dayName,
    lesson_number: lesson.lessonNumber,
    start_time: lesson.startTime,
    end_time: lesson.endTime,
    subject: lesson.subject,
    group_name: lesson.group,
    subgroup: lesson.subgroup == null ? null : String(lesson.subgroup),
    classroom: lesson.classroom || null,
    week_type: lesson.weekType || 'all',
  })));
  if (!rows.length) return { ok: false, error: 'Импорт не содержит занятий' };

  try {
    const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
    if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
    const url = (process.env.SUPABASE_URL || SUPABASE_URL).replace(/\/+$/, '');
    const response = await fetch(`${url}/rest/v1/rpc/publish_imported_schedule`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ teacher_names: names, lesson_rows: rows }),
    });
    if (!response.ok) return { ok: false, error: `Supabase отклонил публикацию (HTTP ${response.status})` };
    if (await response.json() !== rows.length) return { ok: false, error: 'Supabase не подтвердил число занятий' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Не получено подтверждение публикации от Supabase' };
  }
}
