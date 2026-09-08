import { Lesson, LessonTime } from '../../types/schedule.js';
import { DAY_NAME_TO_NUMBER } from '../../config/config.js';

export function parseTimeRange(text: string): { startTime: string; endTime: string } | null {
  if (!text) return null;
  const match = text.match(/(\d{1,2})[.:](\d{2})\s*[-–—]\s*(\d{1,2})[.:](\d{2})/);
  if (!match) return null;
  const startH = match[1].padStart(2, '0');
  const startM = match[2];
  const endH = match[3].padStart(2, '0');
  const endM = match[4];
  return {
    startTime: `${startH}:${startM}`,
    endTime: `${endH}:${endM}`,
  };
}

export function extractLessonNumber(text: string): number | null {
  if (!text) return null;
  const match = text.match(/([1-9])\s*(?:пара|урок)?/i);
  if (match) {
    const num = parseInt(match[1], 10);
    if (num >= 1 && num <= 10) return num;
  }
  return null;
}

export function extractDayFromText(text: string): number | null {
  if (!text) return null;
  const clean = text.toLowerCase().trim();
  for (const [key, val] of Object.entries(DAY_NAME_TO_NUMBER)) {
    if (clean.includes(key)) {
      return val;
    }
  }
  return null;
}

export function looksLikeGroupName(text: string): boolean {
  if (!text || text.length > 20) return false;
  const lower = text.toLowerCase();
  if (lower.includes('день') || lower.includes('пара') || lower.includes('урок') || lower.includes('время')) {
    return false;
  }
  return /[0-4]\s?[а-яёa-z]{2,5}|[а-яёa-z]{2,4}-\d{2}/i.test(text);
}

export function extractClassroom(text: string): string {
  const match = text.match(/(?:каб\.?|ауд\.?|к\.)\s*([0-9а-яА-ЯёЁ\/-]+)/i);
  if (match) {
    return match[1].trim();
  }
  const roomMatch = text.match(/\b([1-9]\d{2}[а-яА-Я]?)\b/);
  if (roomMatch) {
    return roomMatch[1].trim();
  }
  return '';
}

export function findClassroomNearCell(matrix: any[][], r: number, c: number): string {
  if (c + 1 < (matrix[r]?.length || 0)) {
    const right = extractClassroom(String(matrix[r][c + 1] || ''));
    if (right) return right;
  }
  if (r + 1 < matrix.length) {
    const below = extractClassroom(String(matrix[r + 1][c] || ''));
    if (below) return below;
  }
  return '';
}

export function findLessonNumberNearCell(matrix: any[][], r: number, c: number): number {
  for (let col = Math.min(c, 3); col >= 0; col--) {
    const val = String(matrix[r][col] || '').trim();
    const num = extractLessonNumber(val);
    if (num) return num;
  }

  for (let row = 0; row < Math.min(r, 4); row++) {
    const val = String(matrix[row][c] || '').trim();
    const num = extractLessonNumber(val);
    if (num) return num;
  }

  const cellVal = String(matrix[r][c] || '').trim();
  const cellNum = extractLessonNumber(cellVal);
  if (cellNum) return cellNum;

  return 1;
}

export function findGroupNearCell(matrix: any[][], r: number, c: number): string {
  for (let row = 0; row < Math.min(r, 4); row++) {
    const val = String(matrix[row][c] || '').trim();
    if (looksLikeGroupName(val)) {
      return val;
    }
  }

  const cellVal = String(matrix[r][c] || '').trim();
  const groupInCell = cellVal.match(/\b([1-4]\s?[А-ЯЁA-Z]{2,6}[а-яё]?|[А-ЯЁA-Z]{2,4}-\d{2,3})\b/u);
  if (groupInCell) {
    return groupInCell[1].trim();
  }

  return '';
}

export function getLessonTimes(num: number, bells: LessonTime[]): { startTime: string; endTime: string } {
  const found = bells.find((b) => b.lessonNumber === num);
  if (found) {
    return { startTime: found.startTime, endTime: found.endTime };
  }
  return { startTime: '08:30', endTime: '10:00' };
}

export function cleanSubjectName(cellValue: string, teacherFilter: string): string {
  const cleaned = cellValue
    .replace(new RegExp(`.*${teacherFilter}[^\\n]*`, 'gi'), '')
    .replace(/(?:каб\.?|ауд\.?|к\.)\s*[0-9а-яА-ЯёЁ\/-]+/gi, '')
    .replace(/\b[1-9]\d{2}[а-яА-Я]?\b/g, '')
    .trim();

  const lines = cleaned.split(/[\r\n]+/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length > 0) {
    return lines[0];
  }
  return 'Информатика';
}

export function deduplicateLessons(lessons: Lesson[]): Lesson[] {
  const seen = new Set<string>();
  const result: Lesson[] = [];

  for (const l of lessons) {
    const key = `${l.dayOfWeek}_${l.lessonNumber}_${l.subject.toLowerCase()}_${l.group.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(l);
    }
  }

  return result;
}
