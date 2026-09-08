import http from 'http';
import fs from 'fs';
import path from 'path';
import { StorageService } from '../../services/storageService.js';
import { ExcelParser } from '../../services/excelParser.js';
import { CONFIG, DEFAULT_BELLS } from '../../config/config.js';
import { sendJson, sendError, readBody } from '../httpUtils.js';
import { parseMultipart } from '../multipartParser.js';

export async function handleScheduleRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  storage: StorageService,
  defaultUserId: number
): Promise<boolean> {
  // 1. Расписание
  if (pathname === '/api/schedule' && req.method === 'GET') {
    const schedule = storage.getUserSchedule(defaultUserId);
    const lessons = schedule?.lessons || [];
    const now = new Date();
    const jsDay = now.getDay();
    const currentDay = jsDay === 0 ? 7 : jsDay;

    sendJson(res, {
      success: true,
      teacher: CONFIG.DEFAULT_TEACHER,
      subject: CONFIG.DEFAULT_SUBJECT,
      lessons,
      bells: schedule?.settings?.bellsSchedule || DEFAULT_BELLS,
      updatedAt: schedule?.updatedAt || null,
      currentDay,
      currentDate: now.toISOString().split('T')[0],
    });
    return true;
  }

  // 2. Звонки
  if (pathname === '/api/bells' && req.method === 'GET') {
    const schedule = storage.getUserSchedule(defaultUserId);
    sendJson(res, {
      success: true,
      bells: schedule?.settings?.bellsSchedule || DEFAULT_BELLS,
    });
    return true;
  }

  // 3. Загрузка файла расписания Excel
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

    const parseResult = ExcelParser.parseBuffer(
      fileBuffer,
      DEFAULT_BELLS,
      CONFIG.DEFAULT_TEACHER,
      CONFIG.DEFAULT_SUBJECT
    );

    if (parseResult.lessons.length === 0) {
      sendError(res, `В файле не найдено занятий для преподавателя ${CONFIG.DEFAULT_TEACHER}`);
      return true;
    }

    const saved = storage.saveUserSchedule(defaultUserId, defaultUserId, parseResult.lessons);

    try {
      const dest = path.resolve(CONFIG.DATA_DIR, 'latest_schedule.xlsx');
      fs.writeFileSync(dest, fileBuffer);
    } catch (e) {
      console.error('Ошибка сохранения latest_schedule.xlsx:', e);
    }

    sendJson(res, {
      success: true,
      message: `Успешно загружено ${parseResult.lessons.length} пар!`,
      totalLessons: parseResult.lessons.length,
      sheets: parseResult.sheetsParsed,
      lessons: saved.lessons,
    });
    return true;
  }

  return false;
}
