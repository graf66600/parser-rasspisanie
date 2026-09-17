import * as xlsx from 'xlsx';
import { Lesson, LessonTime } from '../types/schedule.js';
import { DEFAULT_BELLS } from '../config/config.js';
import { parseAsMultiGroupSchedule } from './parser/multiGroupStrategy.js';
import { parseAsListTable } from './parser/listTableStrategy.js';
import { parseAsGridMatrix } from './parser/gridMatrixStrategy.js';
import { deduplicateLessons } from './parser/parserUtils.js';
import { extractTeachersFromMatrix, isLikelyTeacherName } from './parser/teacherExtractor.js';

export interface ParseResult {
  lessons: Lesson[];
  sheetsParsed: string[];
  totalFound: number;
}

export interface MultiTeacherParseResult {
  teachers: string[];
  lessonsByTeacher: Record<string, Lesson[]>;
  allLessons: Lesson[];
  sheetsParsed: string[];
}

export class ExcelParser {
  /**
   * Парсинг расписания из буфера Excel файла для конкретного преподавателя
   */
  public static parseBuffer(
    buffer: Buffer,
    bells: LessonTime[] = DEFAULT_BELLS,
    teacherFilter: string = 'Трипольский',
    subjectFilter: string = 'Информатика'
  ): ParseResult {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const lessons: Lesson[] = [];
    const sheetsParsed: string[] = [];

    const teacherLower = teacherFilter.toLowerCase().trim();
    const subjectLower = subjectFilter.toLowerCase().trim();

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      sheetsParsed.push(sheetName);

      const matrix: any[][] = xlsx.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        blankrows: false,
      });

      if (!matrix || matrix.length === 0) continue;

      // Способ 0: Многоколоночное расписание учебных групп колледжа
      const collegeLessons = parseAsMultiGroupSchedule(
        matrix,
        teacherLower,
        subjectLower,
        bells,
        sheetName
      );
      if (collegeLessons.length > 0) {
        lessons.push(...collegeLessons);
        continue;
      }

      // Способ 1: Прямой поиск в табличном виде
      const listLessons = parseAsListTable(matrix, teacherLower, bells, sheetName);
      if (listLessons.length > 0) {
        lessons.push(...listLessons);
        continue;
      }

      // Способ 2: Классическая сетка
      const matrixLessons = parseAsGridMatrix(
        matrix,
        teacherLower,
        subjectLower,
        bells,
        sheetName
      );
      lessons.push(...matrixLessons);
    }

    const uniqueLessons = deduplicateLessons(lessons);

    uniqueLessons.sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) {
        return a.dayOfWeek - b.dayOfWeek;
      }
      return a.lessonNumber - b.lessonNumber;
    });

    return {
      lessons: uniqueLessons,
      sheetsParsed,
      totalFound: uniqueLessons.length,
    };
  }

  /**
   * Парсинг расписания для любого указанного преподавателя
   */
  public static parseForTeacher(
    buffer: Buffer,
    teacherName: string,
    bells: LessonTime[] = DEFAULT_BELLS
  ): ParseResult {
    const isTripolsky = teacherName.toLowerCase().includes('трипольский');
    return this.parseBuffer(
      buffer,
      bells,
      teacherName,
      isTripolsky ? 'Информатика' : ''
    );
  }

  /**
   * Мульти-парсинг: извлечение всех преподавателей и их занятий из Excel
   */
  public static parseAllTeachers(
    buffer: Buffer,
    bells: LessonTime[] = DEFAULT_BELLS
  ): MultiTeacherParseResult {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const allRawLessons: Lesson[] = [];
    const sheetsParsed: string[] = [];
    const teacherSet = new Set<string>();

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      sheetsParsed.push(sheetName);

      const matrix: any[][] = xlsx.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        blankrows: false,
      });
      if (!matrix || matrix.length === 0) continue;

      // Извлекаем имена преподавателей с листа
      const sheetTeachers = extractTeachersFromMatrix(matrix);
      sheetTeachers.forEach((t) => teacherSet.add(t));

      // Парсим все занятия без фильтра преподавателя
      const sheetLessons = parseAsMultiGroupSchedule(matrix, '', '', bells, sheetName);
      allRawLessons.push(...sheetLessons);
    }

    const uniqueAllLessons = deduplicateLessons(allRawLessons);

    // Группируем уроки по преподавателям
    const lessonsByTeacher: Record<string, Lesson[]> = {};

    for (const lesson of uniqueAllLessons) {
      const teacher = (lesson.teacher || '').trim();
      if (!teacher || !isLikelyTeacherName(teacher)) continue;

      teacherSet.add(teacher);
      if (!lessonsByTeacher[teacher]) {
        lessonsByTeacher[teacher] = [];
      }
      lessonsByTeacher[teacher].push(lesson);
    }

    // Добавляем специальный парсинг для Трипольского с его подгруппами 51ф, если он есть
    const tripolskyResult = this.parseBuffer(buffer, bells, 'Трипольский', 'Информатика');
    if (tripolskyResult.lessons.length > 0) {
      teacherSet.add('Трипольский');
      lessonsByTeacher['Трипольский'] = tripolskyResult.lessons;
    }

    // Сортируем пары каждого преподавателя по дням и номерам
    for (const t of Object.keys(lessonsByTeacher)) {
      lessonsByTeacher[t].sort((a, b) => {
        if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
        return a.lessonNumber - b.lessonNumber;
      });
    }

    const sortedTeachers = Array.from(teacherSet).sort((a, b) => {
      if (a === 'Трипольский') return -1;
      if (b === 'Трипольский') return 1;
      return a.localeCompare(b, 'ru');
    });

    return {
      teachers: sortedTeachers,
      lessonsByTeacher,
      allLessons: uniqueAllLessons,
      sheetsParsed,
    };
  }
}
