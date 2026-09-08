import * as xlsx from 'xlsx';
import { Lesson, LessonTime } from '../types/schedule.js';
import { DEFAULT_BELLS } from '../config/config.js';
import { parseAsMultiGroupSchedule } from './parser/multiGroupStrategy.js';
import { parseAsListTable } from './parser/listTableStrategy.js';
import { parseAsGridMatrix } from './parser/gridMatrixStrategy.js';
import { deduplicateLessons } from './parser/parserUtils.js';

export interface ParseResult {
  lessons: Lesson[];
  sheetsParsed: string[];
  totalFound: number;
}

export class ExcelParser {
  /**
   * Парсинг расписания из буфера Excel файла
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

      // Конвертируем лист в двумерный массив строк/значений
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

    // Удаляем дубликаты уроков
    const uniqueLessons = deduplicateLessons(lessons);

    // Сортируем: по дню недели (1..7), затем по номеру пары (1..10)
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
}
