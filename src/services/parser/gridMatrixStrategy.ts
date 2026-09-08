import { Lesson, LessonTime } from '../../types/schedule.js';
import { DAYS_OF_WEEK } from '../../config/config.js';
import {
  extractDayFromText,
  findLessonNumberNearCell,
  getLessonTimes,
  extractClassroom,
  findClassroomNearCell,
  findGroupNearCell,
  cleanSubjectName,
} from './parserUtils.js';

export function parseAsGridMatrix(
  matrix: any[][],
  teacherFilter: string,
  subjectFilter: string,
  bells: LessonTime[],
  sheetName: string
): Lesson[] {
  const lessons: Lesson[] = [];

  const sheetDay = extractDayFromText(sheetName);

  const colToDay: Record<number, number> = {};
  for (let r = 0; r < Math.min(matrix.length, 5); r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      const text = String(matrix[r][c] || '').toLowerCase().trim();
      const day = extractDayFromText(text);
      if (day) {
        colToDay[c] = day;
      }
    }
  }

  const rowToDay: Record<number, number> = {};
  let lastFoundRowDay = sheetDay || 1;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < Math.min(matrix[r].length, 3); c++) {
      const text = String(matrix[r][c] || '').toLowerCase().trim();
      const day = extractDayFromText(text);
      if (day) {
        lastFoundRowDay = day;
        break;
      }
    }
    rowToDay[r] = lastFoundRowDay;
  }

  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      const cellValue = String(matrix[r][c] || '').trim();
      if (!cellValue) continue;

      const cellLower = cellValue.toLowerCase();

      const matchesTeacher = cellLower.includes(teacherFilter);
      const matchesSubjectOnly = !matchesTeacher && cellLower.includes(subjectFilter);

      if (matchesSubjectOnly) {
        const otherTeacherMatch = cellValue.match(/[А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.\s*[А-ЯЁ]\./);
        if (otherTeacherMatch && !otherTeacherMatch[0].toLowerCase().includes(teacherFilter)) {
          continue;
        }
      }

      if (matchesTeacher || matchesSubjectOnly) {
        const dayOfWeek = colToDay[c] || rowToDay[r] || sheetDay || 1;
        const lessonNumber = findLessonNumberNearCell(matrix, r, c);
        const times = getLessonTimes(lessonNumber, bells);
        const classroom = extractClassroom(cellValue) || findClassroomNearCell(matrix, r, c);
        const group = findGroupNearCell(matrix, r, c) || '';
        const subject = cleanSubjectName(cellValue, teacherFilter) || 'Информатика';

        lessons.push({
          id: `${dayOfWeek}_${lessonNumber}_${group}_${subject}`,
          dayOfWeek,
          dayName: DAYS_OF_WEEK[dayOfWeek] || 'Понедельник',
          lessonNumber,
          startTime: times.startTime,
          endTime: times.endTime,
          subject,
          group,
          classroom,
          teacher: 'Трипольский',
          weekType: 'all',
        });
      }
    }
  }

  return lessons;
}
