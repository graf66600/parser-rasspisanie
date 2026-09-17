// ==========================================================================
// SUPABASE SERVICE: облачное хранение данных расписания и журнала
// ==========================================================================
import { Lesson } from '../types/schedule.js';
import { JournalEntry } from '../types/journal.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pojegdivnkuvyiizmesa.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvamVnZGl2bmt1dnlpaXptZXNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MzUxMDEsImV4cCI6MjEwNTIxMTEwMX0.y0U_bhB5hFTNaN4dXsji-K7fp93HpENuB9UHEv_c0qA';

export class SupabaseService {
  private static instance: SupabaseService;
  private url: string;
  private apiKey: string;

  private constructor() {
    this.url = SUPABASE_URL.replace(/\/+$/, '');
    this.apiKey = SUPABASE_ANON_KEY;
  }

  public static getInstance(): SupabaseService {
    if (!SupabaseService.instance) {
      SupabaseService.instance = new SupabaseService();
    }
    return SupabaseService.instance;
  }

  private get headers(): Record<string, string> {
    return {
      apikey: this.apiKey,
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    };
  }

  /**
   * Сохранить список преподавателей
   */
  public async saveTeachers(teachers: string[]): Promise<boolean> {
    try {
      const rows = teachers.map((name) => ({
        name: name.trim(),
        is_default: name.trim() === 'Трипольский',
      }));

      const res = await fetch(`${this.url}/rest/v1/teachers`, {
        method: 'POST',
        headers: {
          ...this.headers,
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify(rows),
      });

      return res.ok;
    } catch (e) {
      console.warn('⚠️ Supabase: ошибка сохранения преподавателей:', e);
      return false;
    }
  }

  /**
   * Получить список всех преподавателей
   */
  public async getTeachers(): Promise<string[] | null> {
    try {
      const res = await fetch(
        `${this.url}/rest/v1/teachers?select=name,is_default&order=is_default.desc,name.asc`,
        { headers: this.headers }
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data)) return null;
      return data.map((item: any) => item.name);
    } catch (e) {
      console.warn('⚠️ Supabase: ошибка получения преподавателей:', e);
      return null;
    }
  }

  /**
   * Сохранить расписание для преподавателя
   */
  public async saveLessons(teacher: string, lessons: Lesson[]): Promise<boolean> {
    try {
      // 1. Убедимся, что преподаватель есть в таблице teachers
      await this.saveTeachers([teacher]);

      // 2. Удаляем старые пары преподавателя
      await fetch(
        `${this.url}/rest/v1/lessons?teacher_name=eq.${encodeURIComponent(teacher)}`,
        {
          method: 'DELETE',
          headers: this.headers,
        }
      );

      if (lessons.length === 0) return true;

      // 3. Добавляем новые уроки
      const rows = lessons.map((l, index) => ({
        id: `${encodeURIComponent(teacher)}_${l.dayOfWeek}_${l.lessonNumber}_${encodeURIComponent(l.group)}_${encodeURIComponent(l.subgroup || '0')}_${index}`,
        teacher_name: teacher,
        day_of_week: l.dayOfWeek,
        day_name: l.dayName,
        lesson_number: l.lessonNumber,
        start_time: l.startTime,
        end_time: l.endTime,
        subject: l.subject,
        group_name: l.group,
        subgroup: l.subgroup || null,
        classroom: l.classroom || null,
        week_type: l.weekType || 'all',
        updated_at: new Date().toISOString(),
      }));

      const res = await fetch(`${this.url}/rest/v1/lessons`, {
        method: 'POST',
        headers: {
          ...this.headers,
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify(rows),
      });

      return res.ok;
    } catch (e) {
      console.warn(`⚠️ Supabase: ошибка сохранения пар для ${teacher}:`, e);
      return false;
    }
  }

  /**
   * Получить пары конкретного преподавателя
   */
  public async getLessons(teacher: string): Promise<Lesson[] | null> {
    try {
      const res = await fetch(
        `${this.url}/rest/v1/lessons?teacher_name=eq.${encodeURIComponent(teacher)}&order=day_of_week.asc,lesson_number.asc`,
        { headers: this.headers }
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data)) return null;

      return data.map((row: any) => ({
        id: row.id,
        dayOfWeek: row.day_of_week,
        dayName: row.day_name,
        lessonNumber: row.lesson_number,
        startTime: row.start_time,
        endTime: row.end_time,
        subject: row.subject,
        group: row.group_name,
        subgroup: row.subgroup || undefined,
        classroom: row.classroom || '',
        teacher: row.teacher_name,
        weekType: row.week_type,
      }));
    } catch (e) {
      console.warn(`⚠️ Supabase: ошибка получения пар для ${teacher}:`, e);
      return null;
    }
  }

  /**
   * Сохранить список студентов группы
   */
  public async saveStudents(group: string, students: string[]): Promise<boolean> {
    try {
      await fetch(
        `${this.url}/rest/v1/students?group_name=eq.${encodeURIComponent(group)}`,
        {
          method: 'DELETE',
          headers: this.headers,
        }
      );

      if (students.length === 0) return true;

      const rows = students.map((name) => ({
        group_name: group,
        full_name: name.trim(),
      }));

      const res = await fetch(`${this.url}/rest/v1/students`, {
        method: 'POST',
        headers: {
          ...this.headers,
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify(rows),
      });

      return res.ok;
    } catch (e) {
      console.warn(`⚠️ Supabase: ошибка сохранения студентов группы ${group}:`, e);
      return false;
    }
  }

  /**
   * Получить студентов группы
   */
  public async getStudents(group: string): Promise<string[] | null> {
    try {
      const res = await fetch(
        `${this.url}/rest/v1/students?group_name=eq.${encodeURIComponent(group)}&order=full_name.asc`,
        { headers: this.headers }
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data)) return null;
      return data.map((s: any) => s.full_name);
    } catch (e) {
      console.warn(`⚠️ Supabase: ошибка получения студентов группы ${group}:`, e);
      return null;
    }
  }

  /**
   * Сохранить запись занятия в журнал
   */
  public async saveJournalEntry(entry: JournalEntry): Promise<boolean> {
    try {
      const row = {
        id: entry.id,
        date: entry.date,
        date_formatted: entry.dateFormatted,
        group_name: entry.group,
        teacher_name: entry.teacher || 'Трипольский',
        lesson_number: entry.lessonNumber,
        subject: entry.subject,
        start_time: entry.startTime,
        end_time: entry.endTime,
        classroom: entry.classroom || null,
        topic: entry.topic || null,
        topic_index: entry.topicIndex || null,
        course_lesson_number: entry.courseLessonNumber || null,
        type: entry.type || 'theory',
        subgroup: entry.subgroup || null,
        notes: entry.notes || null,
        attendance: entry.attendance || {},
      };

      const res = await fetch(`${this.url}/rest/v1/journal_entries`, {
        method: 'POST',
        headers: {
          ...this.headers,
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify(row),
      });

      return res.ok;
    } catch (e) {
      console.warn('⚠️ Supabase: ошибка записи в журнал:', e);
      return false;
    }
  }

  /**
   * Получить записи журнала из Supabase
   */
  public async getJournalEntries(teacher?: string): Promise<JournalEntry[] | null> {
    try {
      let q = `${this.url}/rest/v1/journal_entries?order=date.asc,lesson_number.asc`;
      if (teacher) {
        q += `&teacher_name=eq.${encodeURIComponent(teacher)}`;
      }
      const res = await fetch(q, { headers: this.headers });
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data)) return null;
      return data.map((r: any) => ({
        id: r.id, date: r.date, dateFormatted: r.date_formatted,
        group: r.group_name, teacher: r.teacher_name, lessonNumber: r.lesson_number,
        subject: r.subject, startTime: r.start_time, endTime: r.end_time,
        classroom: r.classroom || '', topic: r.topic || '', topicIndex: r.topic_index,
        courseLessonNumber: r.course_lesson_number, type: r.type || 'theory',
        subgroup: r.subgroup || null, notes: r.notes || '', attendance: r.attendance || {},
        status: 'completed', completedAt: r.created_at || new Date().toISOString(),
      }));
    } catch (e) {
      console.warn('⚠️ Supabase: ошибка чтения журнала:', e);
      return null;
    }
  }
}
