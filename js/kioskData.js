// ==========================================================================
// KIOSK DATA SERVICE (расчёт текущих пар, фильтрация по группам и аудиториям)
// ==========================================================================
import { state, DAY_NAMES, PWA_VERSION } from './state.js';

let allLessonsCache = null;
let allGroupsCache = null;
let allTeachersCache = null;

export async function loadAllSchedulesData() {
  if (allLessonsCache) return allLessonsCache;

  let rawData = null;
  try {
    const res = await fetch(`./data/schedules_all.json?v=${PWA_VERSION}`);
    if (res.ok) rawData = await res.json();
  } catch (e) {}

  if (!rawData && state.schedule?.lessons) {
    rawData = { [state.currentTeacher || 'Трипольский']: state.schedule.lessons };
  }

  const lessons = [];
  const groupsSet = new Set();
  const teachersSet = new Set();

  if (rawData && typeof rawData === 'object') {
    Object.entries(rawData).forEach(([teacher, teacherLessons]) => {
      if (Array.isArray(teacherLessons)) {
        teachersSet.add(teacher);
        teacherLessons.forEach((l) => {
          lessons.push({
            ...l,
            teacher: l.teacher || teacher,
          });
          if (l.group && l.group !== '—' && l.group.trim()) {
            groupsSet.add(l.group.trim());
          }
        });
      }
    });
  }

  allLessonsCache = lessons;
  allGroupsCache = Array.from(groupsSet).sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
  allTeachersCache = Array.from(teachersSet).sort((a, b) => a.localeCompare(b, 'ru'));

  return allLessonsCache;
}

export function getAllGroupsList() {
  return allGroupsCache || [];
}

export function getAllTeachersList() {
  return allTeachersCache || [];
}

export function getLessonsForGroup(groupName, dayOfWeek = null) {
  if (!allLessonsCache) return [];
  return allLessonsCache
    .filter((l) => l.group === groupName && (dayOfWeek === null || l.dayOfWeek === Number(dayOfWeek)))
    .sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return a.lessonNumber - b.lessonNumber;
    });
}

export function getLessonsForTeacher(teacherName, dayOfWeek = null) {
  if (!allLessonsCache) return [];
  return allLessonsCache
    .filter((l) => l.teacher === teacherName && (dayOfWeek === null || l.dayOfWeek === Number(dayOfWeek)))
    .sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return a.lessonNumber - b.lessonNumber;
    });
}

export function getBellsSchedule() {
  return state.bells || [
    { lessonNumber: 1, startTime: '08:00', endTime: '09:20' },
    { lessonNumber: 2, startTime: '09:30', endTime: '10:50' },
    { lessonNumber: 3, startTime: '11:00', endTime: '12:20' },
    { lessonNumber: 4, startTime: '13:00', endTime: '14:20' },
    { lessonNumber: 5, startTime: '14:30', endTime: '15:50' },
    { lessonNumber: 6, startTime: '16:00', endTime: '17:20' },
    { lessonNumber: 7, startTime: '17:30', endTime: '18:50' },
  ];
}

function timeToMinutes(str) {
  if (!str) return 0;
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

export function getCurrentBellStatus(now = new Date()) {
  const jsDay = now.getDay();
  const dayOfWeek = jsDay === 0 ? 7 : jsDay;
  if (dayOfWeek === 7) {
    return { status: 'weekend', message: 'Сегодня воскресенье — занятий нет', dayOfWeek };
  }

  const curMinutes = now.getHours() * 60 + now.getMinutes();
  const bells = getBellsSchedule();
  const firstBell = bells[0];
  const lastBell = bells[bells.length - 1];

  if (curMinutes < timeToMinutes(firstBell.startTime)) {
    const diff = timeToMinutes(firstBell.startTime) - curMinutes;
    return {
      status: 'before',
      targetLessonNum: firstBell.lessonNumber,
      minutesLeft: diff,
      message: `Занятия начнутся в ${firstBell.startTime} (через ${diff} мин)`,
      dayOfWeek,
    };
  }

  if (curMinutes >= timeToMinutes(lastBell.endTime)) {
    return {
      status: 'after',
      message: 'Все занятия на сегодня окончены',
      dayOfWeek,
    };
  }

  for (let i = 0; i < bells.length; i++) {
    const b = bells[i];
    const startM = timeToMinutes(b.startTime);
    const endM = timeToMinutes(b.endTime);

    if (curMinutes >= startM && curMinutes < endM) {
      const diff = endM - curMinutes;
      return {
        status: 'lesson',
        currentLessonNum: b.lessonNumber,
        bell: b,
        minutesLeft: diff,
        message: `Идёт ${b.lessonNumber} пара (до ${b.endTime}, осталось ${diff} мин)`,
        dayOfWeek,
      };
    }

    if (i < bells.length - 1) {
      const nextB = bells[i + 1];
      const nextStartM = timeToMinutes(nextB.startTime);
      if (curMinutes >= endM && curMinutes < nextStartM) {
        const diff = nextStartM - curMinutes;
        return {
          status: 'break',
          targetLessonNum: nextB.lessonNumber,
          bell: nextB,
          minutesLeft: diff,
          message: `Перемена (до начала ${nextB.lessonNumber} пары в ${nextB.startTime} осталось ${diff} мин)`,
          dayOfWeek,
        };
      }
    }
  }

  return { status: 'idle', message: 'Расписание на сегодня', dayOfWeek };
}

export function getLiveSchedule(now = new Date()) {
  const bellStatus = getCurrentBellStatus(now);
  if (!allLessonsCache || bellStatus.status === 'weekend') {
    return { bellStatus, lessons: [] };
  }

  const targetNum = bellStatus.status === 'lesson'
    ? bellStatus.currentLessonNum
    : (bellStatus.targetLessonNum || 1);

  const lessons = allLessonsCache
    .filter((l) => l.dayOfWeek === bellStatus.dayOfWeek && l.lessonNumber === targetNum)
    .sort((a, b) => {
      return (a.classroom || '').localeCompare(b.classroom || '', 'ru', { numeric: true });
    });

  return {
    bellStatus,
    targetLessonNum: targetNum,
    lessons,
  };
}
