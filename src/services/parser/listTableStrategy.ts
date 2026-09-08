import { Lesson, LessonTime } from '../../types/schedule.js';
import { DAYS_OF_WEEK } from '../../config/config.js';
import { extractDayFromText, extractLessonNumber, getLessonTimes } from './parserUtils.js';

export function parseAsListTable(
  matrix: any[][],
  teacherFilter: string,
  bells: LessonTime[],
  sheetName: string
): Lesson[] {
  const lessons: Lesson[] = [];
  let headerRowIdx = -1;
  let colMap: {
    day?: number;
    lesson?: number;
    subject?: number;
    teacher?: number;
    group?: number;
    room?: number;
  } = {};

  for (let r = 0; r < Math.min(matrix.length, 10); r++) {
    const row = matrix[r].map((cell) => String(cell).toLowerCase().trim());
    const dayIdx = row.findIndex((c) => c.includes('день') || c.includes('дата'));
    const lessonIdx = row.findIndex((c) => c.includes('пара') || c.includes('урок') || c.includes('время'));
    const subjIdx = row.findIndex((c) => c.includes('предмет') || c.includes('дисциплина'));
    const teacherIdx = row.findIndex((c) => c.includes('преподаватель') || c.includes('фио') || c.includes('учитель'));

    if ((dayIdx !== -1 || lessonIdx !== -1) && (subjIdx !== -1 || teacherIdx !== -1)) {
      headerRowIdx = r;
      colMap = {
        day: dayIdx !== -1 ? dayIdx : undefined,
        lesson: lessonIdx !== -1 ? lessonIdx : undefined,
        subject: subjIdx !== -1 ? subjIdx : undefined,
        teacher: teacherIdx !== -1 ? teacherIdx : undefined,
        group: row.findIndex((c) => c.includes('группа')),
        room: row.findIndex((c) => c.includes('каб') || c.includes('ауд')),
      };
      break;
    }
  }

  if (headerRowIdx === -1 || colMap.teacher === undefined) {
    return [];
  }

  let currentDayNumber = extractDayFromText(sheetName) || 1;

  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || row.length === 0) continue;

    const teacherVal = colMap.teacher !== undefined ? String(row[colMap.teacher] || '') : '';
    if (!teacherVal.toLowerCase().includes(teacherFilter)) continue;

    if (colMap.day !== undefined && row[colMap.day]) {
      const foundDay = extractDayFromText(String(row[colMap.day]));
      if (foundDay) currentDayNumber = foundDay;
    }

    const extractedLessonNum = colMap.lesson !== undefined ? extractLessonNumber(String(row[colMap.lesson])) : null;
    const lessonNum = extractedLessonNum || 1;
    const times = getLessonTimes(lessonNum, bells);
    const subject = colMap.subject !== undefined ? String(row[colMap.subject] || 'Информатика').trim() : 'Информатика';
    const group = colMap.group !== undefined && colMap.group !== -1 ? String(row[colMap.group] || '').trim() : '';
    const classroom = colMap.room !== undefined && colMap.room !== -1 ? String(row[colMap.room] || '').trim() : '';

    lessons.push({
      id: `${currentDayNumber}_${lessonNum}_${group}_${subject}`,
      dayOfWeek: currentDayNumber,
      dayName: DAYS_OF_WEEK[currentDayNumber] || 'Понедельник',
      lessonNumber: lessonNum,
      startTime: times.startTime,
      endTime: times.endTime,
      subject: subject || 'Информатика',
      group,
      classroom,
      teacher: teacherVal || 'Трипольский',
      weekType: 'all',
    });
  }

  return lessons;
}
