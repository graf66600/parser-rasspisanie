import http from 'http';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import { StorageService } from '../../services/storageService.js';
import { ExcelParser } from '../../services/excelParser.js';
import { SupabaseService } from '../../services/supabaseService.js';
import { CONFIG, DEFAULT_BELLS } from '../../config/config.js';
import { sendJson, sendError, readBody } from '../httpUtils.js';
import { parseMultipart } from '../multipartParser.js';
import { Lesson } from '../../types/schedule.js';
import { findLatestScheduleFile } from '../../services/scheduleFileHelper.js';

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
      // Fallback: извлекаем из файла расписания на диске
      const latest = findLatestScheduleFile();
      const candidates = latest ? [latest] : [];
      for (const file of candidates) {
        if (fs.existsSync(file)) {
          try {
            const buf = fs.readFileSync(file);
            const parsed = ExcelParser.parseAllTeachers(buf, DEFAULT_BELLS);
            teachers = parsed.teachers;
            // Фоновая синхронизация с Supabase
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

    sendJson(res, {
      success: true,
      teachers,
    });
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
      // Ищем уроки в Supabase
      const cloudLessons = await supabase.getLessons(teacherParam);
      if (cloudLessons && cloudLessons.length > 0) {
        lessons = cloudLessons;
      } else {
        // Fallback: парсинг из локального файла
        const latest = findLatestScheduleFile();
        const candidates = latest ? [latest] : [];
        for (const file of candidates) {
          if (fs.existsSync(file)) {
            try {
              const buf = fs.readFileSync(file);
              const resParsed = ExcelParser.parseForTeacher(buf, teacherParam, DEFAULT_BELLS);
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
      hasCurriculum: isTripolsky, // Только для Трипольского активны темы КТП
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

  // 4. Загрузка файла расписания Excel (мульти-парсинг всех преподавателей)
  if (pathname === '/api/upload-schedule' && req.method === 'POST') {
    const contentType = req.headers['content-type'] || '';
    const bodyBuffer = await readBody(req);
    let fileBuffer: Buffer | null = null;

    if (contentType.includes('multipart/form-data')) {
      const boundary = contentType.split('boundary=')[1];
      if (boundary) {
        const parsed = parseMultipart(bodyBuffer, boundary.trim());
        if (parsed.files.length > 0) {
          fileBuffer = parsed.files[0].data;
        }
      }
    } else {
      fileBuffer = bodyBuffer;
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      sendError(res, 'Файл не передан или пустой');
      return true;
    }

    // Мульти-парсинг всех преподавателей
    const multiResult = ExcelParser.parseAllTeachers(fileBuffer, DEFAULT_BELLS);

    if (multiResult.teachers.length === 0 && multiResult.allLessons.length === 0) {
      sendError(res, 'В файле не найдено учебных занятий');
      return true;
    }

    // Сохраняем расписание Трипольского в локальное хранилище
    const tripolskyLessons = multiResult.lessonsByTeacher['Трипольский'] || [];
    if (tripolskyLessons.length > 0) {
      storage.saveUserSchedule(defaultUserId, defaultUserId, tripolskyLessons);
    }

    // Фоновая отправка всех преподавателей и пар в Supabase
    supabase.saveTeachers(multiResult.teachers).catch(() => {});
    for (const [tName, tLessons] of Object.entries(multiResult.lessonsByTeacher)) {
      supabase.saveLessons(tName, tLessons).catch(() => {});
    }

    try {
      const dest = path.resolve(CONFIG.DATA_DIR, 'latest_schedule.xlsx');
      fs.writeFileSync(dest, fileBuffer);
    } catch (e) {
      console.error('Ошибка сохранения latest_schedule.xlsx:', e);
    }

    sendJson(res, {
      success: true,
      message: `Успешно обработано расписание! Найдено преподавателей: ${multiResult.teachers.length}, пар: ${multiResult.allLessons.length}`,
      totalLessons: multiResult.allLessons.length,
      teachersCount: multiResult.teachers.length,
      teachers: multiResult.teachers,
      sheets: multiResult.sheetsParsed,
      lessons: tripolskyLessons,
    });
    return true;
  }

  return false;
}
