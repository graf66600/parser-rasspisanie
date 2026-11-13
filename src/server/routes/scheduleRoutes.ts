import http from 'http';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import { StorageService } from '../../services/storageService.js';
import { SupabaseService } from '../../services/supabaseService.js';
import { CONFIG, DEFAULT_BELLS } from '../../config/config.js';
import { sendJson } from '../httpUtils.js';
import { handleScheduleUpload } from './scheduleUploadRoute.js';
import { Lesson } from '../../types/schedule.js';
import {
  findLatestScheduleFile,
  parseScheduleBuffer,
  parseScheduleBufferAllTeachers,
} from '../../services/scheduleFileHelper.js';

export async function handleScheduleRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  parsedUrl: URL,
  storage: StorageService,
  defaultUserId: number
): Promise<boolean> {
  const supabase = SupabaseService.getInstance();

  // 1. Список доступных преподавателей
  if (pathname === '/api/teachers' && req.method === 'GET') {
    let teachers = await supabase.getTeachers();

    if (!teachers || teachers.length === 0) {
      const latest = findLatestScheduleFile();
      const candidates = latest ? [latest] : [];
      for (const file of candidates) {
        if (fs.existsSync(file)) {
          try {
            const buf = fs.readFileSync(file);
            const parsed = await parseScheduleBufferAllTeachers(buf, DEFAULT_BELLS);
            teachers = parsed.teachers;
            supabase.saveTeachers(teachers).catch(() => {});
            for (const [tName, tLessons] of Object.entries(parsed.lessonsByTeacher)) {
              supabase.saveLessons(tName, tLessons).catch(() => {});
            }
            break;
          } catch (e) {
            console.error('Ошибка извлечения преподавателей из файла:', e);
          }
        }
      }
    }

    if (!teachers || teachers.length === 0) {
      teachers = [CONFIG.DEFAULT_TEACHER];
    }

    sendJson(res, { success: true, teachers });
    return true;
  }

  // 2. Расписание (для любого преподавателя)
  if (pathname === '/api/schedule' && req.method === 'GET') {
    const teacherParam = parsedUrl.searchParams.get('teacher')?.trim() || CONFIG.DEFAULT_TEACHER;
    const isTripolsky = teacherParam.toLowerCase().includes('трипольский');

    let lessons: Lesson[] = [];

    if (isTripolsky) {
      const schedule = storage.getUserSchedule(defaultUserId);
      lessons = schedule?.lessons || [];
    } else {
      const cloudLessons = await supabase.getLessons(teacherParam);
      if (cloudLessons && cloudLessons.length > 0) {
        lessons = cloudLessons;
      } else {
        const latest = findLatestScheduleFile();
        const candidates = latest ? [latest] : [];
        for (const file of candidates) {
          if (fs.existsSync(file)) {
            try {
              const buf = fs.readFileSync(file);
              const resParsed = await parseScheduleBuffer(
                buf,
                DEFAULT_BELLS,
                teacherParam,
                isTripolsky ? CONFIG.DEFAULT_SUBJECT : ''
              );
              if (resParsed.lessons.length > 0) {
                lessons = resParsed.lessons;
                supabase.saveLessons(teacherParam, lessons).catch(() => {});
                break;
              }
            } catch (e) {
              console.error(`Ошибка чтения расписания для ${teacherParam}:`, e);
            }
          }
        }
      }
    }

    const now = new Date();
    const jsDay = now.getDay();
    const currentDay = jsDay === 0 ? 7 : jsDay;

    sendJson(res, {
      success: true,
      teacher: teacherParam,
      subject: isTripolsky ? CONFIG.DEFAULT_SUBJECT : '',
      lessons,
      bells: DEFAULT_BELLS,
      updatedAt: new Date().toISOString(),
      currentDay,
      currentDate: now.toISOString().split('T')[0],
      hasCurriculum: isTripolsky,
    });
    return true;
  }

  // 3. Звонки
  if (pathname === '/api/bells' && req.method === 'GET') {
    const schedule = storage.getUserSchedule(defaultUserId);
    sendJson(res, {
      success: true,
      bells: schedule?.settings?.bellsSchedule || DEFAULT_BELLS,
    });
    return true;
  }

  if (await handleScheduleUpload(req, res, pathname, storage, defaultUserId)) return true;

  return false;
}
