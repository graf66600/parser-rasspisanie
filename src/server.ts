import http from 'http';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import { ExcelParser } from './services/excelParser.js';
import { StorageService } from './services/storageService.js';
import { CurriculumService } from './services/curriculumService.js';
import { JournalService } from './services/journalService.js';
import { StudentService } from './services/studentService.js';
import { CONFIG, DEFAULT_BELLS } from './config/config.js';
import { serveStaticFile, sendError } from './server/httpUtils.js';
import { handleScheduleRoutes } from './server/routes/scheduleRoutes.js';
import { handleStudentRoutes } from './server/routes/studentRoutes.js';
import { handleJournalRoutes } from './server/routes/journalRoutes.js';

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

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

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
      if (pathname.startsWith('/api/')) {
        const scheduleHandled = await handleScheduleRoutes(req, res, pathname, this.storage, this.defaultUserId);
        if (scheduleHandled) return;

        const studentHandled = await handleStudentRoutes(req, res, pathname, parsedUrl, this.students);
        if (studentHandled) return;

        const journalHandled = await handleJournalRoutes(req, res, pathname, parsedUrl, this.journal, this.curriculum);
        if (journalHandled) return;

        sendError(res, 'API маршрут не найден', 404);
        return;
      }

      serveStaticFile(res, this.publicDir, pathname);
    } catch (err: any) {
      console.error('Ошибка обработки запроса:', err);
      sendError(res, err.message || 'Internal Server Error', 500);
    }
  }
}
