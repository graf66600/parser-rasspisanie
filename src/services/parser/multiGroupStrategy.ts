import { Lesson, LessonTime } from '../../types/schedule.js';
import { DAYS_OF_WEEK } from '../../config/config.js';
import {
  extractDayFromText,
  parseTimeRange,
  extractLessonNumber,
  getLessonTimes,
} from './parserUtils.js';

interface GroupColumns {
  name: string;
  lessonNumCol?: number;
  subjectCol?: number;
  teacherCol?: number;
  buildingCol?: number;
  roomCol?: number;
}

export function parseAsMultiGroupSchedule(
  matrix: any[][],
  teacherFilter: string,
  subjectFilter: string,
  bells: LessonTime[],
  sheetName: string
): Lesson[] {
  if (matrix.length < 3) return [];

  let subHeaderRowIdx = -1;
  let groupHeaderRowIdx = -1;

  for (let r = 0; r < Math.min(matrix.length, 5); r++) {
    const row = matrix[r].map((cell) => String(cell || '').toLowerCase().trim());
    const subjectCount = row.filter((c) => c.includes('предмет') || c.includes('дисциплин')).length;
    const teacherCount = row.filter((c) => c.includes('преподавател') || c.includes('учител') || c.includes('фио')).length;

    if (subjectCount >= 2 || teacherCount >= 2) {
      subHeaderRowIdx = r;
      groupHeaderRowIdx = r > 0 ? r - 1 : 0;
      break;
    }
  }

  if (subHeaderRowIdx === -1) {
    return [];
  }

  const groupRow = matrix[groupHeaderRowIdx] || [];
  const subHeaderRow = matrix[subHeaderRowIdx] || [];

  let startGroupCol = -1;
  for (let c = 0; c < Math.max(groupRow.length, subHeaderRow.length); c++) {
    const sub = String(subHeaderRow[c] || '').toLowerCase().trim();
    if (sub.includes('предмет') || sub.includes('преподавател') || sub.includes('№пары')) {
      startGroupCol = c;
      break;
    }
  }

  if (startGroupCol === -1) return [];

  const groups: GroupColumns[] = [];
  let currentGroup: GroupColumns | null = null;

  for (let c = startGroupCol; c < Math.max(groupRow.length, subHeaderRow.length); c++) {
    const gName = groupRow[c] !== undefined && groupRow[c] !== null ? String(groupRow[c]).trim() : '';
    if (gName) {
      if (currentGroup) groups.push(currentGroup);
      currentGroup = { name: gName };
    }
    if (!currentGroup) continue;

    const sub = String(subHeaderRow[c] || '').toLowerCase().trim();
    if (sub.includes('№пары') || sub.includes('пара') || sub.includes('урок')) {
      currentGroup.lessonNumCol = c;
    } else if (sub.includes('предмет') || sub.includes('дисциплин')) {
      if (currentGroup.subjectCol === undefined) currentGroup.subjectCol = c;
    } else if (sub.includes('преподавател') || sub.includes('учител') || sub.includes('фио')) {
      currentGroup.teacherCol = c;
    } else if (sub.includes('корпус')) {
      currentGroup.buildingCol = c;
    } else if (sub.includes('аудитор') || sub.includes('каб')) {
      currentGroup.roomCol = c;
    }
  }
  if (currentGroup) groups.push(currentGroup);

  if (groups.length === 0) return [];

  let dayCol = -1;
  let commonLessonNumCol = -1;
  let commonTimeCol = -1;

  for (let c = 0; c < startGroupCol; c++) {
    for (let r = subHeaderRowIdx + 1; r < Math.min(matrix.length, subHeaderRowIdx + 15); r++) {
      const val = String(matrix[r]?.[c] || '').trim();
      if (!val) continue;
      if (extractDayFromText(val) !== null && dayCol === -1) {
        dayCol = c;
      }
      if (parseTimeRange(val) !== null && commonTimeCol === -1) {
        commonTimeCol = c;
      }
      const num = extractLessonNumber(val);
      if (num !== null && num >= 1 && num <= 10 && commonLessonNumCol === -1 && dayCol !== c && commonTimeCol !== c) {
        commonLessonNumCol = c;
      }
    }
  }

  if (dayCol === -1 && startGroupCol > 1) dayCol = 1;
  if (commonLessonNumCol === -1 && startGroupCol > 2) commonLessonNumCol = 2;
  if (commonTimeCol === -1 && startGroupCol > 3) commonTimeCol = 3;

  let currentDayNumber = extractDayFromText(sheetName) || 1;
  let currentDayName = DAYS_OF_WEEK[currentDayNumber] || 'Понедельник';

  const lessons: Lesson[] = [];

  for (let r = subHeaderRowIdx + 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || row.length === 0) continue;

    if (dayCol !== -1 && row[dayCol]) {
      const foundDay = extractDayFromText(String(row[dayCol]));
      if (foundDay) {
        currentDayNumber = foundDay;
        currentDayName = DAYS_OF_WEEK[foundDay] || 'Понедельник';
      }
    }

    let commonLessonNum = 1;
    if (commonLessonNumCol !== -1 && row[commonLessonNumCol]) {
      const num = extractLessonNumber(String(row[commonLessonNumCol]));
      if (num) commonLessonNum = num;
    }

    const commonTimeStr = commonTimeCol !== -1 ? String(row[commonTimeCol] || '').trim() : '';

    for (const g of groups) {
      const teacherVal = g.teacherCol !== undefined ? String(row[g.teacherCol] || '').trim() : '';
      const subjectVal = g.subjectCol !== undefined ? String(row[g.subjectCol] || '').trim() : '';

      if (!teacherVal && !subjectVal) continue;

      const teacherLower = teacherVal.toLowerCase();
      const subjectLower = subjectVal.toLowerCase();

      const matchesTeacher = teacherFilter ? teacherLower.includes(teacherFilter) : true;
      const matchesSubjectOnly = !matchesTeacher && subjectFilter && subjectLower.includes(subjectFilter);

      if (matchesSubjectOnly && teacherVal) {
        if (!teacherLower.includes(teacherFilter)) {
          continue;
        }
      }

      if (!matchesTeacher && !matchesSubjectOnly) {
        continue;
      }

      let lessonNum = commonLessonNum;
      if (g.lessonNumCol !== undefined && row[g.lessonNumCol]) {
        const num = extractLessonNumber(String(row[g.lessonNumCol]));
        if (num) lessonNum = num;
      }

      let times: { startTime: string; endTime: string };
      const parsedTime = parseTimeRange(commonTimeStr);
      if (parsedTime) {
        times = parsedTime;
      } else {
        times = getLessonTimes(lessonNum, bells);
      }

      const building = g.buildingCol !== undefined ? String(row[g.buildingCol] || '').trim() : '';
      const room = g.roomCol !== undefined ? String(row[g.roomCol] || '').trim() : '';

      let classroom = '';
      if (building && room) {
        classroom = `${building}, ауд. ${room}`;
      } else if (room) {
        classroom = `ауд. ${room}`;
      } else if (building) {
        classroom = `корп. ${building}`;
      }

      const subjectName = subjectVal || 'Информатика';
      const teacherName = teacherVal || teacherFilter || 'Трипольский';

      lessons.push({
        id: `${currentDayNumber}_${lessonNum}_${g.name}_${subjectName}`,
        dayOfWeek: currentDayNumber,
        dayName: currentDayName,
        lessonNumber: lessonNum,
        startTime: times.startTime,
        endTime: times.endTime,
        subject: subjectName,
        group: g.name,
        classroom,
        teacher: teacherName,
        weekType: 'all',
      });
    }
  }

  return lessons;
}
