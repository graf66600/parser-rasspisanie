import http from 'http';
import fs from 'fs';
import path from 'path';
import { StorageService } from '../../services/storageService.js';
import { SupabaseService } from '../../services/supabaseService.js';
import { CONFIG, DEFAULT_BELLS } from '../../config/config.js';
import { sendJson, sendError, readBody, HttpError, MAX_UPLOAD_BODY_BYTES, isSupportedUploadSignature, safeUploadFilename } from '../httpUtils.js';
import { parseMultipart, multipartBoundary } from '../multipartParser.js';
import { Lesson } from '../../types/schedule.js';
import { deduplicateLessons } from '../../services/parser/parserUtils.js';
import { parseScheduleBuffer, parseScheduleBufferAllTeachers, isPdfBuffer } from '../../services/scheduleFileHelper.js';

export async function handleScheduleUpload(
  req: http.IncomingMessage, res: http.ServerResponse, pathname: string,
  storage: StorageService, defaultUserId: number
): Promise<boolean> {
  const supabase = SupabaseService.getInstance();
  if (pathname === '/api/upload-schedule' && req.method === 'POST') {
    const contentType = req.headers['content-type'] || '';
    const bodyBuffer = await readBody(req, MAX_UPLOAD_BODY_BYTES);
    const filesToParse: Array<{ filename: string; buffer: Buffer }> = [];
    let mode = 'append';

    if (contentType.toLowerCase().includes('multipart/form-data')) {
      const parsed = parseMultipart(bodyBuffer, multipartBoundary(contentType));
      if (parsed.fields.mode) mode = parsed.fields.mode === 'replace' ? 'replace' : 'append';
      for (const file of parsed.files) {
        const filename = safeUploadFilename(file.filename, 'schedule_upload.xlsx');
        if (!filename) throw new HttpError(400, 'Небезопасное имя файла');
        filesToParse.push({ filename, buffer: file.data });
      }
    } else {
      const content = bodyBuffer.subarray(0, 5).toString('latin1');
      const filename = content === '%PDF-' ? 'schedule_upload.pdf' : 'schedule_upload.xlsx';
      filesToParse.push({ filename, buffer: bodyBuffer });
    }

    if (!filesToParse.length || filesToParse.some((file) => !file.buffer.length)) {
      sendError(res, 'Файлы не переданы или пустые');
      return true;
    }
    for (const file of filesToParse) {
      if (!isSupportedUploadSignature(file.buffer, file.filename, 'schedule')) {
        throw new HttpError(400, `Недопустимый формат или сигнатура файла: ${file.filename}`);
      }
    }

    const allTeachersSet = new Set<string>();
    const lessonsByTeacher: Record<string, Lesson[]> = {};
    let tripolskyLessons: Lesson[] = [];
    const processedFiles: string[] = [];

    if (mode === 'append') {
      try {
        const exAll = path.resolve(CONFIG.DATA_DIR, 'schedules_all.json');
        if (fs.existsSync(exAll)) {
          const raw = JSON.parse(fs.readFileSync(exAll, 'utf8'));
          for (const [teacher, lessons] of Object.entries(raw)) {
            allTeachersSet.add(teacher);
            lessonsByTeacher[teacher] = Array.isArray(lessons) ? [...(lessons as Lesson[])] : [];
          }
        }
        const exTrip = path.resolve(CONFIG.DATA_DIR, 'schedule.json');
        if (fs.existsSync(exTrip)) {
          const rawTrip = JSON.parse(fs.readFileSync(exTrip, 'utf8'));
          if (Array.isArray(rawTrip.lessons)) tripolskyLessons = [...rawTrip.lessons];
        }
      } catch (_) { /* invalid old cache is ignored; new upload replaces it */ }
    }

    for (const fileItem of filesToParse) {
      processedFiles.push(fileItem.filename);
      const multiResult = await parseScheduleBufferAllTeachers(fileItem.buffer, DEFAULT_BELLS);
      multiResult.teachers.forEach((teacher) => allTeachersSet.add(teacher));
      for (const [teacher, lessons] of Object.entries(multiResult.lessonsByTeacher)) {
        if (!lessonsByTeacher[teacher]) lessonsByTeacher[teacher] = [];
        lessonsByTeacher[teacher].push(...lessons);
      }
      const trip = await parseScheduleBuffer(fileItem.buffer, DEFAULT_BELLS, 'Трипольский', 'Информатика');
      if (trip.lessons.length) tripolskyLessons.push(...trip.lessons);
      const storedName = isPdfBuffer(fileItem.buffer) ? `uploaded_${fileItem.filename}` : 'latest_schedule.xlsx';
      const destination = path.resolve(CONFIG.DATA_DIR, storedName);
      if (destination.startsWith(`${path.resolve(CONFIG.DATA_DIR)}${path.sep}`)) {
        fs.writeFileSync(destination, fileItem.buffer);
      }
    }

    tripolskyLessons = deduplicateLessons(tripolskyLessons).sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.lessonNumber - b.lessonNumber);
    for (const teacher of Object.keys(lessonsByTeacher)) {
      lessonsByTeacher[teacher] = deduplicateLessons(lessonsByTeacher[teacher]).sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.lessonNumber - b.lessonNumber);
    }
    const sortedTeachers = Array.from(allTeachersSet).sort((a, b) => a === 'Трипольский' ? -1 : b === 'Трипольский' ? 1 : a.localeCompare(b, 'ru'));
    if (tripolskyLessons.length) storage.saveUserSchedule(defaultUserId, defaultUserId, tripolskyLessons);
    const scheduleData = { success: true, teacher: 'Трипольский', subject: 'Информатика', lessons: tripolskyLessons, bells: DEFAULT_BELLS, updatedAt: new Date().toISOString() };
    try {
      for (const [name, value] of [['schedule.json', scheduleData], ['teachers.json', sortedTeachers], ['schedules_all.json', lessonsByTeacher]] as const) {
        fs.writeFileSync(path.resolve(CONFIG.DATA_DIR, name), JSON.stringify(value, null, 2), 'utf8');
        const publicPath = path.resolve(process.cwd(), 'public', 'data', name);
        if (publicPath.startsWith(`${path.resolve(process.cwd(), 'public', 'data')}${path.sep}`)) fs.writeFileSync(publicPath, JSON.stringify(value, null, 2), 'utf8');
      }
    } catch (error) { console.error('Ошибка записи обновленных данных на диск:', error); }
    supabase.saveTeachers(sortedTeachers).catch(() => {});
    for (const [teacher, lessons] of Object.entries(lessonsByTeacher)) supabase.saveLessons(teacher, lessons).catch(() => {});
    const totalLessons = Object.values(lessonsByTeacher).reduce((sum, lessons) => sum + lessons.length, 0);
    sendJson(res, { success: true, message: `Успешно объединено файлов: ${processedFiles.length} (${processedFiles.join(', ')}). Преподавателей: ${sortedTeachers.length}, пар: ${totalLessons}. Пар Трипольского: ${tripolskyLessons.length}.`, processedFiles, totalLessons, teachersCount: sortedTeachers.length, teachers: sortedTeachers, lessons: tripolskyLessons });
    return true;
  }
  return false;
}
