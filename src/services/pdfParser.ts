import { Lesson, LessonTime } from '../types/schedule.js';
import { DEFAULT_BELLS } from '../config/config.js';
import { ParseResult, MultiTeacherParseResult } from './excelParser.js';
import {
  extractAllPdfItems,
  detectLessonRows,
  detectColumnGroups,
} from './parser/pdfLayoutDetector.js';
import { extractLessonsFromCell } from './parser/pdfCellExtractor.js';
import { deduplicateLessons } from './parser/parserUtils.js';
import { isLikelyTeacherName } from './parser/teacherExtractor.js';
import { PdfColumnGroup, PdfLessonRow, PdfTextItem } from './parser/pdfTypes.js';

function filterCellItems(
  pageItems: PdfTextItem[],
  col: PdfColumnGroup,
  row: PdfLessonRow,
  lessonRows: PdfLessonRow[]
): PdfTextItem[] {
  return pageItems.filter((i) => {
    if (i.x < col.xMin || i.x > col.xMax) return false;
    if (Math.abs(i.y - row.y) > 3.5) return false;
    const closest = lessonRows.reduce(
      (best, curr) => (Math.abs(curr.y - i.y) < Math.abs(best.y - i.y) ? curr : best),
      lessonRows[0]
    );
    return closest.y === row.y;
  });
}

export class PdfParser {
  /**
   * Парсинг расписания из буфера PDF для конкретного преподавателя
   */
  public static async parseBuffer(
    buffer: Buffer,
    bells: LessonTime[] = DEFAULT_BELLS,
    teacherFilter: string = 'Трипольский',
    subjectFilter: string = 'Информатика'
  ): Promise<ParseResult> {
    const allItems = await extractAllPdfItems(buffer);
    if (allItems.length === 0) {
      return { lessons: [], sheetsParsed: ['PDF'], totalFound: 0 };
    }

    const lessonRows = detectLessonRows(allItems);
    const pages = Array.from(new Set(allItems.map((i) => i.page)));
    const allLessons: Lesson[] = [];

    for (const pageIdx of pages) {
      const pageItems = allItems.filter((i) => i.page === pageIdx);
      const colRanges = detectColumnGroups(allItems, pageIdx);

      for (const row of lessonRows) {
        for (const col of colRanges) {
          const cellItems = filterCellItems(pageItems, col, row, lessonRows);
          if (cellItems.length === 0) continue;

          const cellLessons = extractLessonsFromCell(cellItems, col, row, bells);
          allLessons.push(...cellLessons);
        }
      }
    }

    const teacherLower = teacherFilter.toLowerCase().trim();
    const subjectLower = subjectFilter.toLowerCase().trim();

    const filtered = allLessons.filter((l) => {
      const teacher = (l.teacher || '').toLowerCase();
      const subject = (l.subject || '').toLowerCase();

      if (teacherLower) {
        if (teacher.includes(teacherLower)) return true;
        // Если преподаватель в ячейке не указан, но предмет совпадает
        if (!teacher && subjectLower && subject.includes(subjectLower)) return true;
        return false;
      }

      if (subjectLower) {
        return subject.includes(subjectLower);
      }

      return true;
    });

    const uniqueLessons = deduplicateLessons(filtered);
    uniqueLessons.sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return a.lessonNumber - b.lessonNumber;
    });

    return {
      lessons: uniqueLessons,
      sheetsParsed: pages.map((p) => `Страница ${p + 1}`),
      totalFound: uniqueLessons.length,
    };
  }

  /**
   * Парсинг расписания для любого указанного преподавателя
   */
  public static async parseForTeacher(
    buffer: Buffer,
    teacherName: string,
    bells: LessonTime[] = DEFAULT_BELLS
  ): Promise<ParseResult> {
    const isTripolsky = teacherName.toLowerCase().includes('трипольский');
    return this.parseBuffer(
      buffer,
      bells,
      teacherName,
      isTripolsky ? 'Информатика' : ''
    );
  }

  /**
   * Мульти-парсинг: извлечение всех преподавателей и их занятий из PDF
   */
  public static async parseAllTeachers(
    buffer: Buffer,
    bells: LessonTime[] = DEFAULT_BELLS
  ): Promise<MultiTeacherParseResult> {
    const allItems = await extractAllPdfItems(buffer);
    if (allItems.length === 0) {
      return { teachers: [], lessonsByTeacher: {}, allLessons: [], sheetsParsed: [] };
    }

    const lessonRows = detectLessonRows(allItems);
    const pages = Array.from(new Set(allItems.map((i) => i.page)));
    const allRawLessons: Lesson[] = [];

    for (const pageIdx of pages) {
      const pageItems = allItems.filter((i) => i.page === pageIdx);
      const colRanges = detectColumnGroups(allItems, pageIdx);

      for (const row of lessonRows) {
        for (const col of colRanges) {
          const cellItems = filterCellItems(pageItems, col, row, lessonRows);
          if (cellItems.length === 0) continue;

          const cellLessons = extractLessonsFromCell(cellItems, col, row, bells);
          allRawLessons.push(...cellLessons);
        }
      }
    }

    const uniqueAllLessons = deduplicateLessons(allRawLessons);
    const teacherSet = new Set<string>();
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

    // Сортировка пар каждого преподавателя
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
      sheetsParsed: pages.map((p) => `Страница ${p + 1}`),
    };
  }
}
