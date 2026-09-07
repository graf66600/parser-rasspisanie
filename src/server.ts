import http from 'http';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import { ExcelParser } from './services/excelParser.js';
import { StorageService } from './services/storageService.js';
import { CurriculumService } from './services/curriculumService.js';
import { JournalService } from './services/journalService.js';
import { StudentService } from './services/studentService.js';
import { CONFIG, DEFAULT_BELLS, DAYS_OF_WEEK } from './config/config.js';
import { Lesson } from './types/schedule.js';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

export class WebAppServer {
  private server: http.Server;
  private storage: StorageService;
  private curriculum: CurriculumService;
  private journal: JournalService;
  private students: StudentService;
  private publicDir: string;
  private defaultUserId = 1;

  constructor() {
    this.storage = StorageService.getInstance();
    this.curriculum = CurriculumService.getInstance();
    this.journal = JournalService.getInstance();
    this.students = StudentService.getInstance();
    this.publicDir = path.resolve(process.cwd(), 'public');

    this.ensureInitialSchedule();
    this.server = http.createServer(this.handleRequest.bind(this));
  }

  /**
   * Инициализация расписания при первом старте, если еще нет в базе
   */
  private ensureInitialSchedule(): void {
    const existing = this.storage.getUserSchedule(this.defaultUserId);
    if (!existing || existing.lessons.length === 0) {
      const candidates = [
        path.resolve(CONFIG.DATA_DIR, 'latest_schedule.xlsx'),
        path.resolve(process.cwd(), 'на стенд2_1нед — копия.xlsx'),
      ];
      for (const file of candidates) {
        if (fs.existsSync(file)) {
          try {
            console.log(`📄 Загрузка начального расписания из ${file}...`);
            const buffer = fs.readFileSync(file);
            const res = ExcelParser.parseBuffer(buffer, DEFAULT_BELLS, CONFIG.DEFAULT_TEACHER, CONFIG.DEFAULT_SUBJECT);
            if (res.lessons.length > 0) {
              this.storage.saveUserSchedule(this.defaultUserId, this.defaultUserId, res.lessons);
              console.log(`✅ Найдено и загружено ${res.lessons.length} пар для преподавателя ${CONFIG.DEFAULT_TEACHER}`);
              break;
            }
          } catch (e) {
            console.error(`Ошибка чтения ${file}:`, e);
          }
        }
      }
    }
  }

  public start(port = 3000): Promise<number> {
    return new Promise((resolve) => {
      this.server.listen(port, '0.0.0.0', () => {
        console.log(`🌐 Веб-приложение (PWA) запущено: http://localhost:${port}`);
        resolve(port);
      });
    });
  }

  public stop(): void {
    this.server.close();
  }

  private sendJson(res: http.ServerResponse, data: any, statusCode = 200): void {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end(JSON.stringify(data));
  }

  private sendError(res: http.ServerResponse, message: string, statusCode = 400): void {
    this.sendJson(res, { success: false, error: message }, statusCode);
  }

  private readBody(req: http.IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  /**
   * Парсинг Multipart Form Data (для файлов)
   */
  private parseMultipart(body: Buffer, boundary: string): { fields: Record<string, string>; files: Array<{ filename: string; data: Buffer }> } {
    const fields: Record<string, string> = {};
    const files: Array<{ filename: string; data: Buffer }> = [];
    const boundaryBuffer = Buffer.from(`--${boundary}`);

    let start = 0;
    while (start < body.length) {
      const boundaryIndex = body.indexOf(boundaryBuffer, start);
      if (boundaryIndex === -1) break;

      const nextBoundaryIndex = body.indexOf(boundaryBuffer, boundaryIndex + boundaryBuffer.length);
      if (nextBoundaryIndex === -1) break;

      const partBuffer = body.subarray(boundaryIndex + boundaryBuffer.length, nextBoundaryIndex);
      const headerEndIndex = partBuffer.indexOf(Buffer.from('\r\n\r\n'));
      if (headerEndIndex !== -1) {
        const headerStr = partBuffer.subarray(0, headerEndIndex).toString('utf8');
        let data = partBuffer.subarray(headerEndIndex + 4);
        if (data.subarray(data.length - 2).toString() === '\r\n') {
          data = data.subarray(0, data.length - 2);
        }

        const nameMatch = headerStr.match(/name="([^"]+)"/);
        const filenameMatch = headerStr.match(/filename="([^"]+)"/);

        if (filenameMatch && filenameMatch[1]) {
          files.push({ filename: filenameMatch[1], data });
        } else if (nameMatch && nameMatch[1]) {
          fields[nameMatch[1]] = data.toString('utf8');
        }
      }
      start = nextBoundaryIndex;
    }
    return { fields, files };
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      res.end();
      return;
    }

    try {
      // --- REST API МАРШРУТЫ ---
      if (pathname.startsWith('/api/')) {
        await this.handleApi(req, res, pathname, parsedUrl);
        return;
      }

      // --- СТАТИКА PWA ---
      this.handleStatic(req, res, pathname);
    } catch (err: any) {
      console.error('Ошибка обработки запроса:', err);
      this.sendError(res, err.message || 'Internal Server Error', 500);
    }
  }

  private async handleApi(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string,
    parsedUrl: URL
  ): Promise<void> {
    // 1. Расписание
    if (pathname === '/api/schedule' && req.method === 'GET') {
      const schedule = this.storage.getUserSchedule(this.defaultUserId);
      const lessons = schedule?.lessons || [];
      const now = new Date();
      const jsDay = now.getDay();
      const currentDay = jsDay === 0 ? 7 : jsDay;

      this.sendJson(res, {
        success: true,
        teacher: CONFIG.DEFAULT_TEACHER,
        subject: CONFIG.DEFAULT_SUBJECT,
        lessons,
        bells: schedule?.settings?.bellsSchedule || DEFAULT_BELLS,
        updatedAt: schedule?.updatedAt || null,
        currentDay,
        currentDate: now.toISOString().split('T')[0],
      });
      return;
    }

    // 2. Расписание звонков
    if (pathname === '/api/bells' && req.method === 'GET') {
      const schedule = this.storage.getUserSchedule(this.defaultUserId);
      this.sendJson(res, {
        success: true,
        bells: schedule?.settings?.bellsSchedule || DEFAULT_BELLS,
      });
      return;
    }

    // 3. Загрузка файла расписания Excel (drag & drop / кнопка)
    if (pathname === '/api/upload-schedule' && req.method === 'POST') {
      const contentType = req.headers['content-type'] || '';
      const bodyBuffer = await this.readBody(req);
      let fileBuffer: Buffer | null = null;

      if (contentType.includes('multipart/form-data')) {
        const boundary = contentType.split('boundary=')[1];
        if (boundary) {
          const parsed = this.parseMultipart(bodyBuffer, boundary.trim());
          if (parsed.files.length > 0) {
            fileBuffer = parsed.files[0].data;
          }
        }
      } else {
        fileBuffer = bodyBuffer;
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        this.sendError(res, 'Файл не передан или пустой');
        return;
      }

      const parseResult = ExcelParser.parseBuffer(
        fileBuffer,
        DEFAULT_BELLS,
        CONFIG.DEFAULT_TEACHER,
        CONFIG.DEFAULT_SUBJECT
      );

      if (parseResult.lessons.length === 0) {
        this.sendError(res, `В файле не найдено занятий для преподавателя ${CONFIG.DEFAULT_TEACHER}`);
        return;
      }

      // Сохраняем расписание
      const saved = this.storage.saveUserSchedule(this.defaultUserId, this.defaultUserId, parseResult.lessons);

      // Сохраняем копию файла на диск
      try {
        const dest = path.resolve(CONFIG.DATA_DIR, 'latest_schedule.xlsx');
        fs.writeFileSync(dest, fileBuffer);
      } catch (e) {
        console.error('Ошибка сохранения latest_schedule.xlsx:', e);
      }

      this.sendJson(res, {
        success: true,
        message: `Успешно загружено ${parseResult.lessons.length} пар!`,
        totalLessons: parseResult.lessons.length,
        sheets: parseResult.sheetsParsed,
        lessons: saved.lessons,
      });
      return;
    }

    // 4. Студенты: получение списков
    if (pathname === '/api/students' && req.method === 'GET') {
      const groupParam = parsedUrl.searchParams.get('group');
      if (groupParam) {
        const students = this.students.getStudents(groupParam);
        this.sendJson(res, { success: true, group: groupParam, students });
      } else {
        const groups = this.students.getGroups();
        const all: Record<string, string[]> = {};
        for (const g of groups) {
          all[g] = this.students.getStudents(g);
        }
        this.sendJson(res, { success: true, groups, studentsByGroup: all });
      }
      return;
    }

    // 5. Студенты: сохранение / добавление вручную
    if (pathname === '/api/students' && req.method === 'POST') {
      const bodyBuffer = await this.readBody(req);
      const payload = JSON.parse(bodyBuffer.toString('utf8') || '{}');
      const { group, students, student } = payload;

      if (!group) {
        this.sendError(res, 'Не указана группа');
        return;
      }

      if (Array.isArray(students)) {
        this.students.setStudents(group, students);
      } else if (student && typeof student === 'string') {
        this.students.addStudent(group, student);
      } else {
        this.sendError(res, 'Не переданы данные студентов');
        return;
      }

      const updated = this.students.getStudents(group);
      this.sendJson(res, { success: true, group, students: updated });
      return;
    }

    // 6. Студенты: удаление
    if (pathname === '/api/students' && req.method === 'DELETE') {
      const group = parsedUrl.searchParams.get('group') || '';
      const student = parsedUrl.searchParams.get('student') || '';
      if (!group || !student) {
        this.sendError(res, 'Необходимо указать group и student');
        return;
      }
      const ok = this.students.removeStudent(group, student);
      this.sendJson(res, { success: ok, students: this.students.getStudents(group) });
      return;
    }

    // 7. Студенты: загрузка через файл (Excel, CSV, TXT)
    if (pathname === '/api/students/upload' && req.method === 'POST') {
      const contentType = req.headers['content-type'] || '';
      const bodyBuffer = await this.readBody(req);
      let fileBuffer: Buffer | null = null;
      let filename = 'students.txt';
      let groupName = parsedUrl.searchParams.get('group') || '';

      if (contentType.includes('multipart/form-data')) {
        const boundary = contentType.split('boundary=')[1];
        if (boundary) {
          const parsed = this.parseMultipart(bodyBuffer, boundary.trim());
          if (parsed.files.length > 0) {
            fileBuffer = parsed.files[0].data;
            filename = parsed.files[0].filename;
          }
          if (parsed.fields.group) {
            groupName = parsed.fields.group;
          }
        }
      } else {
        fileBuffer = bodyBuffer;
      }

      if (!fileBuffer) {
        this.sendError(res, 'Файл не найден');
        return;
      }

      if (!groupName) {
        this.sendError(res, 'Укажите группу для привязки студентов');
        return;
      }

      const studentList = this.students.parseStudentFile(fileBuffer, filename);
      if (studentList.length === 0) {
        this.sendError(res, 'В файле не удалось обнаружить имена студентов');
        return;
      }

      this.students.setStudents(groupName, studentList);
      this.sendJson(res, {
        success: true,
        message: `Загружено ${studentList.length} студентов для группы ${groupName}`,
        group: groupName,
        students: this.students.getStudents(groupName),
      });
      return;
    }

    // 8. Журнал: получение всех записей или по группе/дате
    if (pathname === '/api/journal' && req.method === 'GET') {
      const group = parsedUrl.searchParams.get('group');
      const date = parsedUrl.searchParams.get('date');

      let entries = this.journal.getAllEntries();
      if (group) {
        entries = this.journal.getGroupHistory(group);
      } else if (date) {
        entries = this.journal.getEntriesByDate(date);
      }

      this.sendJson(res, { success: true, entries });
      return;
    }

    // 9. Журнал: отметка о проведении пары (посещаемость, оценки, тема)
    if (pathname === '/api/journal/mark' && req.method === 'POST') {
      const bodyBuffer = await this.readBody(req);
      const payload = JSON.parse(bodyBuffer.toString('utf8') || '{}');

      const { group, subject, lessonNumber, startTime, endTime, classroom, topic, topicIndex, date, attendance, notes } = payload;

      if (!group || !lessonNumber) {
        this.sendError(res, 'Не заполнены обязательные поля группы или номера пары');
        return;
      }

      const entry = this.journal.recordLesson({
        date,
        group,
        subject: subject || CONFIG.DEFAULT_SUBJECT,
        lessonNumber: Number(lessonNumber),
        startTime: startTime || '08:00',
        endTime: endTime || '09:20',
        classroom,
        topic: topic || 'Практическое занятие',
        topicIndex: topicIndex ? Number(topicIndex) : undefined,
        notes,
        attendance: attendance || {},
      });

      this.sendJson(res, { success: true, entry, message: 'Запись в журнале успешно сохранена!' });
      return;
    }

    // 10. КТП / Рабочие программы: текущая тема по группе
    if (pathname === '/api/curriculum' && req.method === 'GET') {
      const group = parsedUrl.searchParams.get('group');
      if (group) {
        const nextTopic = this.curriculum.getCurrentTopic(group);
        const program = this.curriculum.findProgramForGroup(group);
        this.sendJson(res, { success: true, group, nextTopic, program });
      } else {
        const programs = this.curriculum.getAllPrograms();
        this.sendJson(res, { success: true, programs });
      }
      return;
    }

    this.sendError(res, 'API маршрут не найден', 404);
  }

  private handleStatic(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): void {
    let filePath = path.join(this.publicDir, pathname === '/' ? 'index.html' : pathname);

    if (!filePath.startsWith(this.publicDir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Access Denied');
      return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
      filePath = path.join(this.publicDir, 'index.html');
    }

    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const content = fs.readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
      });
      res.end(content);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
    }
  }
}
