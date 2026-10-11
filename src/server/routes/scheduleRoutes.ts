import http from 'http';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import { StorageService } from '../../services/storageService.js';
import { SupabaseService } from '../../services/supabaseService.js';
import { CONFIG, DEFAULT_BELLS } from '../../config/config.js';
import { sendJson, sendError, readBody } from '../httpUtils.js';
import { parseMultipart } from '../multipartParser.js';
import { Lesson } from '../../types/schedule.js';
import { deduplicateLessons } from '../../services/parser/parserUtils.js';
import {
  findLatestScheduleFile,
  parseScheduleBuffer,
  parseScheduleBufferAllTeachers,
  isPdfBuffer,
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

  // 4. Загрузка файла(ов) расписания (Excel или нескольких PDF)
  if (pathname === '/api/upload-schedule' && req.method === 'POST') {
    const contentType = req.headers['content-type'] || '';
    const bodyBuffer = await readBody(req);
    const filesToParse: Array<{ filename: string; buffer: Buffer }> = [];
    let mode = 'append';

    if (contentType.includes('multipart/form-data')) {
      const boundary = contentType.split('boundary=')[1];
      if (boundary) {
        const parsed = parseMultipart(bodyBuffer, boundary.trim());
        if (parsed.fields.mode) mode = parsed.fields.mode;
        if (parsed.files.length > 0) {
          parsed.files.forEach((f) => filesToParse.push({ filename: f.filename, buffer: f.data }));
        }
      }
    } else {
      filesToParse.push({ filename: 'schedule_upload', buffer: bodyBuffer });
    }

    if (filesToParse.length === 0) {
      sendError(res, 'Файлы не переданы или пустые');
      return true;
    }

    // Инициализация структур (при append загружаем текущие данные)
    const allTeachersSet = new Set<string>();
    const lessonsByTeacher: Record<string, Lesson[]> = {};
    let tripolskyLessons: Lesson[] = [];
    const processedFiles: string[] = [];

    if (mode === 'append') {
      try {
        const exAll = path.resolve(CONFIG.DATA_DIR, 'schedules_all.json');
        if (fs.existsSync(exAll)) {
          const raw = JSON.parse(fs.readFileSync(exAll, 'utf8'));
          for (const [t, l] of Object.entries(raw)) {
            allTeachersSet.add(t);
            lessonsByTeacher[t] = Array.isArray(l) ? [...(l as Lesson[])] : [];
          }
        }
        const exTrip = path.resolve(CONFIG.DATA_DIR, 'schedule.json');
        if (fs.existsSync(exTrip)) {
          const rawTrip = JSON.parse(fs.readFileSync(exTrip, 'utf8'));
          if (Array.isArray(rawTrip.lessons)) tripolskyLessons = [...rawTrip.lessons];
        }
      } catch (e) {}
    }

    for (const fileItem of filesToParse) {
      processedFiles.push(fileItem.filename);
      const multiResult = await parseScheduleBufferAllTeachers(fileItem.buffer, DEFAULT_BELLS);
      multiResult.teachers.forEach((t) => allTeachersSet.add(t));

      for (const [tName, tLessons] of Object.entries(multiResult.lessonsByTeacher)) {
        if (!lessonsByTeacher[tName]) lessonsByTeacher[tName] = [];
        lessonsByTeacher[tName].push(...tLessons);
      }

      const trip = await parseScheduleBuffer(fileItem.buffer, DEFAULT_BELLS, 'Трипольский', 'Информатика');
      if (trip.lessons.length > 0) {
        tripolskyLessons.push(...trip.lessons);
      }

      // Сохраняем копию файла на сервере
      try {
        const isPdf = isPdfBuffer(fileItem.buffer);
        const savedName = isPdf ? `uploaded_${fileItem.filename}` : 'latest_schedule.xlsx';
        fs.writeFileSync(path.resolve(CONFIG.DATA_DIR, savedName), fileItem.buffer);
      } catch (e) {}
    }

    // Дедупликация уроков
    tripolskyLessons = deduplicateLessons(tripolskyLessons);
    tripolskyLessons.sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return a.lessonNumber - b.lessonNumber;
    });

    for (const t of Object.keys(lessonsByTeacher)) {
      lessonsByTeacher[t] = deduplicateLessons(lessonsByTeacher[t]);
      lessonsByTeacher[t].sort((a, b) => {
        if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
        return a.lessonNumber - b.lessonNumber;
      });
    }

    const sortedTeachers = Array.from(allTeachersSet).sort((a, b) => {
      if (a === 'Трипольский') return -1;
      if (b === 'Трипольский') return 1;
      return a.localeCompare(b, 'ru');
    });

    // Сохраняем расписание Трипольского в локальное хранилище
    if (tripolskyLessons.length > 0) {
      storage.saveUserSchedule(defaultUserId, defaultUserId, tripolskyLessons);
    }

    // Сохраняем объединенные данные на диск
    const scheduleData = {
      success: true,
      teacher: 'Трипольский',
      subject: 'Информатика',
      lessons: tripolskyLessons,
      bells: DEFAULT_BELLS,
      updatedAt: new Date().toISOString(),
    };

    try {
      const p1 = path.resolve(CONFIG.DATA_DIR, 'schedule.json');
      const p2 = path.resolve(process.cwd(), 'public', 'data', 'schedule.json');
      fs.writeFileSync(p1, JSON.stringify(scheduleData, null, 2), 'utf8');
      fs.writeFileSync(p2, JSON.stringify(scheduleData, null, 2), 'utf8');

      const pt1 = path.resolve(CONFIG.DATA_DIR, 'teachers.json');
      const pt2 = path.resolve(process.cwd(), 'public', 'data', 'teachers.json');
      fs.writeFileSync(pt1, JSON.stringify(sortedTeachers, null, 2), 'utf8');
      fs.writeFileSync(pt2, JSON.stringify(sortedTeachers, null, 2), 'utf8');

      const pa1 = path.resolve(CONFIG.DATA_DIR, 'schedules_all.json');
      const pa2 = path.resolve(process.cwd(), 'public', 'data', 'schedules_all.json');
      fs.writeFileSync(pa1, JSON.stringify(lessonsByTeacher, null, 2), 'utf8');
      fs.writeFileSync(pa2, JSON.stringify(lessonsByTeacher, null, 2), 'utf8');
    } catch (e) {
      console.error('Ошибка записи обновленных данных на диск:', e);
    }

    // Фоновая синхронизация с Supabase
    supabase.saveTeachers(sortedTeachers).catch(() => {});
    for (const [tName, tLessons] of Object.entries(lessonsByTeacher)) {
      supabase.saveLessons(tName, tLessons).catch(() => {});
    }

    const totalLessons = Object.values(lessonsByTeacher).reduce((sum, arr) => sum + arr.length, 0);

    sendJson(res, {
      success: true,
      message: `Успешно объединено файлов: ${processedFiles.length} (${processedFiles.join(', ')}). Преподавателей: ${sortedTeachers.length}, пар: ${totalLessons}. Пар Трипольского: ${tripolskyLessons.length}.`,
      processedFiles,
      totalLessons,
      teachersCount: sortedTeachers.length,
      teachers: sortedTeachers,
      lessons: tripolskyLessons,
    });
    return true;
  }

  return false;
}
