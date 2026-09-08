import * as fs from 'fs';
import * as path from 'path';
import { JournalEntry, JournalEntrySchema } from '../types/journal.js';
import { CONFIG, DAYS_OF_WEEK } from '../config/config.js';

export class JournalService {
  private static instance: JournalService;
  private entries: JournalEntry[] = [];
  private readonly journalFile: string;

  private constructor() {
    this.journalFile = path.resolve(CONFIG.DATA_DIR, 'journal.json');
    this.loadJournal();
  }

  public static getInstance(): JournalService {
    if (!JournalService.instance) {
      JournalService.instance = new JournalService();
    }
    return JournalService.instance;
  }

  private loadJournal(): void {
    try {
      if (fs.existsSync(this.journalFile)) {
        const raw = fs.readFileSync(this.journalFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.entries = parsed
            .map((item) => {
              const res = JournalEntrySchema.safeParse(item);
              return res.success ? res.data : null;
            })
            .filter((item): item is JournalEntry => item !== null);
          console.log(`📖 Загружено ${this.entries.length} записей журнала из ${this.journalFile}`);
        }
      } else {
        this.entries = [];
      }
    } catch (err) {
      console.error('Ошибка загрузки журнала занятий:', err);
      this.entries = [];
    }
  }

  private saveJournal(): void {
    try {
      if (!fs.existsSync(CONFIG.DATA_DIR)) {
        fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(this.journalFile, JSON.stringify(this.entries, null, 2), 'utf8');
    } catch (err) {
      console.error('Ошибка сохранения журнала занятий:', err);
    }
  }

  private normalizeGroup(group: string): string {
    return group.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '').trim();
  }

  /**
   * Форматирование даты в читаемый вид (например: "08.09.2026 (Вт)")
   */
  public formatDateReadable(dateStr: string): string {
    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const jsDay = dateObj.getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;
    const shortDayNames: Record<number, string> = {
      1: 'Пн',
      2: 'Вт',
      3: 'Ср',
      4: 'Чт',
      5: 'Пт',
      6: 'Сб',
      7: 'Вс',
    };
    const dayName = shortDayNames[dayOfWeek] || '';
    const dayPad = String(day).padStart(2, '0');
    const monthPad = String(month).padStart(2, '0');
    return `${dayPad}.${monthPad}.${year} (${dayName})`;
  }

  /**
   * Добавить запись о проведенном занятии
   */
  public recordLesson(params: {
    date?: string; // YYYY-MM-DD (если не указано, берется текущая дата)
    group: string;
    subject: string;
    lessonNumber: number;
    startTime: string;
    endTime: string;
    classroom?: string;
    topic: string;
    topicIndex?: number;
    courseLessonNumber?: number;
    type?: 'theory' | 'practice' | 'exam' | 'other';
    notes?: string;
    attendance?: Record<string, import('../types/journal.js').StudentAttendance>;
  }): JournalEntry {
    const cleanGroup = params.group.trim();
    const effectiveDate = params.date || new Date().toISOString().split('T')[0];
    const id = `${cleanGroup}_${effectiveDate}_${params.lessonNumber}`;
    const dateFormatted = this.formatDateReadable(effectiveDate);

    // Определяем тип занятия (теория/практика/зачет), если не передан
    let entryType: 'theory' | 'practice' | 'exam' | 'other' = params.type || 'theory';
    if (!params.type) {
      const lower = (params.topic || '').toLowerCase();
      if (lower.includes('зачет') || lower.includes('дифференцированный')) {
        entryType = 'exam';
      } else if (lower.includes('практик')) {
        entryType = 'practice';
      } else if (lower.includes('лекци') || lower.includes('теория')) {
        entryType = 'theory';
      }
    }

    const newEntry: JournalEntry = {
      id,
      date: effectiveDate,
      dateFormatted,
      group: cleanGroup,
      subject: params.subject,
      lessonNumber: params.lessonNumber,
      startTime: params.startTime,
      endTime: params.endTime,
      classroom: params.classroom || '',
      topic: params.topic,
      topicIndex: params.topicIndex,
      courseLessonNumber: params.courseLessonNumber,
      type: entryType,
      status: 'completed',
      completedAt: new Date().toISOString(),
      notes: params.notes,
      attendance: params.attendance || {},
    };

    // Проверяем, нет ли уже такой записи
    const existingIdx = this.entries.findIndex((e) => e.id === id);
    if (existingIdx !== -1) {
      this.entries[existingIdx] = newEntry;
    } else {
      this.entries.push(newEntry);
    }

    // Пересчитываем сквозные номера пар по курсу для этой группы
    this.refreshCourseLessonNumbers(cleanGroup);

    this.saveJournal();
    return newEntry;
  }

  /**
   * Обновляет сквозные порядковые номера пар (courseLessonNumber = 1, 2, 3...)
   * для указанной группы в хронологическом порядке
   */
  public refreshCourseLessonNumbers(groupName: string): void {
    const clean = this.normalizeGroup(groupName);
    const groupEntries = this.entries
      .filter((e) => this.normalizeGroup(e.group) === clean || clean.includes(this.normalizeGroup(e.group)))
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.lessonNumber - b.lessonNumber;
      });

    groupEntries.forEach((entry, idx) => {
      entry.courseLessonNumber = idx + 1;
    });
  }

  /**
   * Получить историю проведенных занятий для конкретной группы со сквозной нумерацией
   */
  public getGroupHistory(groupName: string): JournalEntry[] {
    this.refreshCourseLessonNumbers(groupName);
    const clean = this.normalizeGroup(groupName);
    return this.entries
      .filter((e) => this.normalizeGroup(e.group) === clean || clean.includes(this.normalizeGroup(e.group)))
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.lessonNumber - b.lessonNumber;
      });
  }

  /**
   * Получить записи за конкретную дату
   */
  public getEntriesByDate(dateStr: string): JournalEntry[] {
    return this.entries
      .filter((e) => e.date === dateStr)
      .sort((a, b) => a.lessonNumber - b.lessonNumber);
  }

  /**
   * Получить все записи
   */
  public getAllEntries(): JournalEntry[] {
    return [...this.entries];
  }

  /**
   * Удалить запись
   */
  public deleteEntry(id: string): boolean {
    const initialLen = this.entries.length;
    this.entries = this.entries.filter((e) => e.id !== id);
    if (this.entries.length !== initialLen) {
      this.saveJournal();
      return true;
    }
    return false;
  }
}
