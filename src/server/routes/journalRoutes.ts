import http from 'http';
import { URL } from 'url';
import { JournalService } from '../../services/journalService.js';
import { CurriculumService } from '../../services/curriculumService.js';
import { CONFIG } from '../../config/config.js';
import { sendJson, sendError, readJsonBody, HttpError } from '../httpUtils.js';
import { ZodError } from 'zod';
import { JournalDeleteSchema, JournalMarkSchema, validationMessage } from '../validation.js';

function validationError(error: unknown): string | null {
  return error instanceof ZodError ? validationMessage(error) : null;
}

export async function handleJournalRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  parsedUrl: URL,
  journal: JournalService,
  curriculum: CurriculumService
): Promise<boolean> {
  if (pathname === '/api/journal' && req.method === 'GET') {
    const group = parsedUrl.searchParams.get('group');
    const date = parsedUrl.searchParams.get('date');
    const teacher = parsedUrl.searchParams.get('teacher')?.trim();
    let entries = journal.getAllEntries();
    if (group) entries = journal.getGroupHistory(group, teacher || undefined);
    else if (date) entries = journal.getEntriesByDate(date);
    if (teacher) {
      const isTripolsky = teacher.toLowerCase().includes('трипольский');
      entries = entries.filter((entry) => isTripolsky ? (!entry.teacher || entry.teacher.toLowerCase().includes('трипольский')) : entry.teacher === teacher);
    }
    sendJson(res, { success: true, entries });
    return true;
  }

  if (pathname === '/api/journal/mark' && req.method === 'POST') {
    try {
      const payload = JournalMarkSchema.parse(await readJsonBody(req));
      const existing = payload.id ? journal.getAllEntries().find((entry) => entry.id === payload.id) : undefined;
      if (existing && (existing.group !== payload.group || existing.date !== (payload.date || new Date().toISOString().slice(0, 10)) || existing.lessonNumber !== payload.lessonNumber)) {
        throw new HttpError(400, 'ID записи не соответствует занятию');
      }
      const entry = journal.recordLesson({
        id: payload.id,
        syncCloud: false, // The PWA outbox owns cloud delivery; this endpoint is the local replica.
        date: payload.date,
        group: payload.group,
        teacher: payload.teacher || existing?.teacher || CONFIG.DEFAULT_TEACHER,
        subgroup: payload.subgroup ?? existing?.subgroup,
        subject: payload.subject || existing?.subject || CONFIG.DEFAULT_SUBJECT,
        lessonNumber: payload.lessonNumber,
        startTime: payload.startTime || existing?.startTime || '08:00',
        endTime: payload.endTime || existing?.endTime || '09:20',
        classroom: payload.classroom,
        topic: payload.topic || existing?.topic || 'Практическое занятие',
        topicIndex: payload.topicIndex,
        courseLessonNumber: payload.courseLessonNumber,
        type: payload.type || existing?.type,
        notes: payload.notes,
        attendance: payload.attendance || {},
      });
      sendJson(res, { success: true, entry, message: 'Запись в журнале успешно сохранена!' });
    } catch (error) {
      if (error instanceof HttpError) sendError(res, error.message, error.statusCode);
      else { const message = validationError(error); if (message) sendError(res, message); else throw error; }
    }
    return true;
  }

  if (pathname.startsWith('/api/journal/') && req.method === 'DELETE') {
    const id = decodeURIComponent(pathname.replace('/api/journal/', ''));
    const success = journal.deleteEntry(id);
    sendJson(res, { success, message: success ? 'Запись успешно удалена' : 'Запись не найдена' });
    return true;
  }

  if (pathname === '/api/journal/delete' && req.method === 'POST') {
    try {
      const { id } = JournalDeleteSchema.parse(await readJsonBody(req));
      const success = journal.deleteEntry(id);
      sendJson(res, { success, message: success ? 'Запись успешно удалена' : 'Запись не найдена' });
    } catch (error) {
      if (error instanceof HttpError) sendError(res, error.message, error.statusCode);
      else { const message = validationError(error); if (message) sendError(res, message); else throw error; }
    }
    return true;
  }

  if (pathname === '/api/curriculum' && req.method === 'GET') {
    const group = parsedUrl.searchParams.get('group');
    if (group) sendJson(res, { success: true, group, nextTopic: curriculum.getCurrentTopic(group), program: curriculum.findProgramForGroup(group) });
    else sendJson(res, { success: true, programs: curriculum.getAllPrograms() });
    return true;
  }
  return false;
}
