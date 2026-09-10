import * as fs from 'fs';
import * as path from 'path';
import { CurriculumProgram, CurriculumLesson } from '../types/curriculum.js';
import { CONFIG } from '../config/config.js';

export interface GroupProgressMap {
  [groupKey: string]: {
    currentIndex: number;
    lastUpdated: string;
  };
}

export class CurriculumService {
  private static instance: CurriculumService;
  private programs: CurriculumProgram[] = [];
  private progress: GroupProgressMap = {};
  private readonly curriculumFile: string;
  private readonly progressFile: string;

  private constructor() {
    this.curriculumFile = path.resolve(CONFIG.DATA_DIR, 'curriculum.json');
    this.progressFile = path.resolve(CONFIG.DATA_DIR, 'curriculum_progress.json');
    this.loadPrograms();
    this.loadProgress();
  }

  public static getInstance(): CurriculumService {
    if (!CurriculumService.instance) {
      CurriculumService.instance = new CurriculumService();
    }
    return CurriculumService.instance;
  }

  private loadPrograms(): void {
    try {
      if (fs.existsSync(this.curriculumFile)) {
        const raw = fs.readFileSync(this.curriculumFile, 'utf8');
        this.programs = JSON.parse(raw);
        console.log(`📚 Загружено ${this.programs.length} рабочих программ из ${this.curriculumFile}`);
      } else {
        console.warn(`⚠️ Файл рабочих программ не найден: ${this.curriculumFile}`);
      }
    } catch (err) {
      console.error('Ошибка загрузки рабочих программ:', err);
      this.programs = [];
    }
  }

  private loadProgress(): void {
    try {
      if (fs.existsSync(this.progressFile)) {
        const raw = fs.readFileSync(this.progressFile, 'utf8');
        this.progress = JSON.parse(raw);
      } else {
        this.progress = {};
      }
    } catch (err) {
      console.error('Ошибка загрузки прогресса по темам:', err);
      this.progress = {};
    }
  }

  private saveProgress(): void {
    try {
      if (!fs.existsSync(CONFIG.DATA_DIR)) {
        fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(this.progressFile, JSON.stringify(this.progress, null, 2), 'utf8');
    } catch (err) {
      console.error('Ошибка сохранения прогресса по темам:', err);
    }
  }

  /**
   * Нормализация названия группы для поиска (например "51Ф" -> "51ф", "Группа 31фм" -> "31фм")
   */
  private normalizeGroup(group: string): string {
    return group.toLowerCase().replace(/[^0-9а-яёa-z]/gi, '').trim();
  }

  /**
   * Найти рабочую программу для учебной группы
   */
  public findProgramForGroup(groupName: string): CurriculumProgram | null {
    if (!groupName) return null;
    const cleanGroup = this.normalizeGroup(groupName);

    // 1. Точное совпадение (например, '21фм' должно найти именно '21фм', а не '21ф')
    for (const prog of this.programs) {
      for (const g of prog.groups) {
        if (this.normalizeGroup(g) === cleanGroup) {
          return prog;
        }
      }
    }

    // 2. Нестрогое совпадение (например, 'Группа 31фм' -> '31фм')
    for (const prog of this.programs) {
      for (const g of prog.groups) {
        const normG = this.normalizeGroup(g);
        if (cleanGroup.includes(normG) || normG.includes(cleanGroup)) {
          return prog;
        }
      }
    }
    return null;
  }

  /**
   * Получить текущую тему для группы
   */
  public getCurrentTopic(groupName: string): { topic: string; index: number; total: number; lesson?: CurriculumLesson } | null {
    const program = this.findProgramForGroup(groupName);
    if (!program || program.lessons.length === 0) return null;

    const cleanGroup = this.normalizeGroup(groupName);
    const saved = this.progress[cleanGroup];
    const currentIndex = saved !== undefined ? saved.currentIndex % program.lessons.length : 0;
    const lesson = program.lessons[currentIndex];

    return {
      topic: lesson ? lesson.text : '',
      index: currentIndex + 1,
      total: program.lessons.length,
      lesson,
    };
  }

  /**
   * Получить тему занятия для группы по порядковому номеру или индексу
   */
  public getTopicForLesson(groupName: string, lessonIndex?: number): string | null {
    const program = this.findProgramForGroup(groupName);
    if (!program || program.lessons.length === 0) return null;

    if (lessonIndex !== undefined && lessonIndex >= 0) {
      const idx = lessonIndex % program.lessons.length;
      return program.lessons[idx]?.text || null;
    }

    const current = this.getCurrentTopic(groupName);
    return current ? current.topic : null;
  }

  /**
   * Переключить группу на следующую тему (прогресс вперед)
   */
  public advanceTopic(groupName: string, step: number = 1): number {
    const program = this.findProgramForGroup(groupName);
    if (!program || program.lessons.length === 0) return 0;

    const cleanGroup = this.normalizeGroup(groupName);
    const current = this.progress[cleanGroup]?.currentIndex || 0;
    const next = (current + step) % program.lessons.length;

    this.progress[cleanGroup] = {
      currentIndex: next,
      lastUpdated: new Date().toISOString(),
    };
    this.saveProgress();
    return next;
  }

  /**
   * Установить тему для группы вручную (1-based index)
   */
  public setTopicIndex(groupName: string, oneBasedIndex: number): boolean {
    const program = this.findProgramForGroup(groupName);
    if (!program || program.lessons.length === 0) return false;

    const cleanGroup = this.normalizeGroup(groupName);
    const idx = Math.max(0, Math.min(oneBasedIndex - 1, program.lessons.length - 1));

    this.progress[cleanGroup] = {
      currentIndex: idx,
      lastUpdated: new Date().toISOString(),
    };
    this.saveProgress();
    return true;
  }

  /**
   * Получить статистику программы по количеству лекций и практик
   */
  public getProgramStats(groupName: string): {
    totalLessons: number;
    theoryTotal: number;
    practiceTotal: number;
    title: string;
  } | null {
    const program = this.findProgramForGroup(groupName);
    if (!program) return null;
    const theoryTotal = program.lessons.filter(
      (l) => l.type === 'theory' || l.text.toLowerCase().includes('лекци') || l.text.toLowerCase().includes('теория')
    ).length;
    const practiceTotal = program.lessons.length - theoryTotal;
    return {
      totalLessons: program.lessons.length,
      theoryTotal,
      practiceTotal,
      title: program.title,
    };
  }

  /**
   * Получить список всех программ с темами
   */
  public getAllPrograms(): CurriculumProgram[] {
    return this.programs;
  }
}
