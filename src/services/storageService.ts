import fs from 'fs';
import path from 'path';
import { UserScheduleData, UserScheduleDataSchema, UserSettings, Lesson } from '../types/schedule.js';
import { CONFIG, DEFAULT_BELLS } from '../config/config.js';

export class StorageService {
  private static instance: StorageService;
  private cache: Map<number, UserScheduleData> = new Map();
  private filePath: string = CONFIG.SCHEDULES_FILE;

  private constructor() {
    this.ensureDataDir();
    this.loadFromDisk();
  }

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(CONFIG.DATA_DIR)) {
      fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
    }
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const rawData = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(rawData);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const validated = UserScheduleDataSchema.safeParse(item);
            if (validated.success) {
              this.cache.set(validated.data.userId, validated.data);
            } else {
              console.warn('Пропущены некорректные данные расписания:', validated.error.format());
            }
          }
        }
      }
    } catch (err) {
      console.error('Ошибка загрузки расписаний с диска:', err);
    }
  }

  private saveToDisk(): void {
    try {
      this.ensureDataDir();
      const allData = Array.from(this.cache.values());
      fs.writeFileSync(this.filePath, JSON.stringify(allData, null, 2), 'utf-8');
    } catch (err) {
      console.error('Ошибка сохранения расписаний на диск:', err);
    }
  }

  public getUserSchedule(userId: number): UserScheduleData | null {
    return this.cache.get(userId) || null;
  }

  public getAllUsers(): UserScheduleData[] {
    return Array.from(this.cache.values());
  }

  public saveUserSchedule(userId: number, chatId: number, lessons: Lesson[]): UserScheduleData {
    const existing = this.cache.get(userId);
    const settings: UserSettings = existing?.settings || {
      remindMinutesBefore: 15,
      morningDigestEnabled: true,
      morningDigestTime: '08:00',
      bellsSchedule: DEFAULT_BELLS,
      teacherFilter: 'Трипольский',
      subjectFilter: 'Информатика',
    };

    const scheduleData: UserScheduleData = {
      userId,
      chatId,
      updatedAt: new Date().toISOString(),
      settings,
      lessons,
    };

    const validated = UserScheduleDataSchema.parse(scheduleData);
    this.cache.set(userId, validated);
    this.saveToDisk();
    return validated;
  }

  public updateUserSettings(userId: number, newSettings: Partial<UserSettings>): UserScheduleData | null {
    const existing = this.cache.get(userId);
    if (!existing) return null;

    existing.settings = {
      ...existing.settings,
      ...newSettings,
    };
    existing.updatedAt = new Date().toISOString();

    const validated = UserScheduleDataSchema.parse(existing);
    this.cache.set(userId, validated);
    this.saveToDisk();
    return validated;
  }
}
