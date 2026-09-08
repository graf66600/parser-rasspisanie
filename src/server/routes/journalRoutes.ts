import http from 'http';
import { URL } from 'url';
import { JournalService } from '../../services/journalService.js';
import { CurriculumService } from '../../services/curriculumService.js';
import { CONFIG } from '../../config/config.js';
import { sendJson, sendError, readBody } from '../httpUtils.js';

export async function handleJournalRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  parsedUrl: URL,
  journal: JournalService,
  curriculum: CurriculumService
): Promise<boolean> {
  // 1. Журнал: получение записей
  if (pathname === '/api/journal' && req.method === 'GET') {
    const group = parsedUrl.searchParams.get('group');
    const date = parsedUrl.searchParams.get('date');

    let entries = journal.getAllEntries();
    if (group) {
      entries = journal.getGroupHistory(group);
    } else if (date) {
      entries = journal.getEntriesByDate(date);
    }

    sendJson(res, { success: true, entries });
    return true;
  }

  // 2. Журнал: отметка о проведении пары
  if (pathname === '/api/journal/mark' && req.method === 'POST') {
    const bodyBuffer = await readBody(req);
    const payload = JSON.parse(bodyBuffer.toString('utf8') || '{}');

    const { group, subject, lessonNumber, startTime, endTime, classroom, topic, topicIndex, courseLessonNumber, type, date, attendance, notes } = payload;

    if (!group || !lessonNumber) {
      sendError(res, 'Не заполнены обязательные поля группы или номера пары');
      return true;
    }

    const entry = journal.recordLesson({
      date,
      group,
      subject: subject || CONFIG.DEFAULT_SUBJECT,
      lessonNumber: Number(lessonNumber),
      startTime: startTime || '08:00',
      endTime: endTime || '09:20',
      classroom,
      topic: topic || 'Практическое занятие',
      topicIndex: topicIndex ? Number(topicIndex) : undefined,
      courseLessonNumber: courseLessonNumber ? Number(courseLessonNumber) : undefined,
      type: type || undefined,
      notes,
      attendance: attendance || {},
    });

    sendJson(res, { success: true, entry, message: 'Запись в журнале успешно сохранена!' });
    return true;
  }

  // 3. КТП / Рабочие программы
  if (pathname === '/api/curriculum' && req.method === 'GET') {
    const group = parsedUrl.searchParams.get('group');
    if (group) {
      const nextTopic = curriculum.getCurrentTopic(group);
      const program = curriculum.findProgramForGroup(group);
      sendJson(res, { success: true, group, nextTopic, program });
    } else {
      const programs = curriculum.getAllPrograms();
      sendJson(res, { success: true, programs });
    }
    return true;
  }

  return false;
}
