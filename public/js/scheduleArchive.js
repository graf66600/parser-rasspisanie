import { normalizeGroup, normalizeSubgroup, normalizeTeacher, solePracticeSubgroup } from './lessonProgress.js';
import { scheduleCoversDate, scheduleWeekday, shiftScheduleDate } from './scheduleDates.js';
import { semesterForDate } from './teachingLoad.js';

const key = 'pwa_dated_schedules';
const memory = {};

function readArchive() {
  try { return JSON.parse(globalThis.localStorage?.getItem(key) || '{}') || {}; }
  catch { return {}; }
}

function validWeek(schedule) {
  return Array.isArray(schedule?.lessons) && /^\d{4}-\d\d-\d\d$/.test(schedule.weekStart)
    && scheduleWeekday(schedule.weekStart) === 1;
}

const lessonKey = lesson => [lesson.dayOfWeek, lesson.lessonNumber, normalizeGroup(lesson.group),
  normalizeSubgroup(lesson.subgroup), String(lesson.subject || '').trim().toLowerCase()].join('|');

export function rememberScheduleWeek(schedule, append = false) {
  if (!validWeek(schedule) || !schedule.teacher) return;
  const id = [normalizeTeacher(schedule.teacher), schedule.weekStart].join('|');
  const archive = { ...readArchive(), ...memory };
  const current = archive[id];
  if (current?.updatedAt && schedule.updatedAt && current.updatedAt > schedule.updatedAt) return;
  const lessons = append && current
    ? [...new Map([...current.lessons, ...schedule.lessons].map(lesson => [lessonKey(lesson), lesson])).values()]
    : schedule.lessons;
  memory[id] = { ...schedule, lessons };
  try { globalThis.localStorage?.setItem(key, JSON.stringify({ ...archive, [id]: memory[id] })); }
  catch { /* The current session can still use the dated schedule. */ }
}

export function scheduledReportEntries(state, group, subgroup, date, recorded) {
  const teacher = normalizeTeacher(state.currentTeacher);
  const groupKey = normalizeGroup(group);
  if (!teacher || !groupKey) return [];
  rememberScheduleWeek(state.schedule);
  const entries = new Map();
  for (const schedule of Object.values({ ...readArchive(), ...memory })) {
    if (!validWeek(schedule) || normalizeTeacher(schedule.teacher) !== teacher) continue;
    for (const lesson of schedule.lessons) {
      const day = Number(lesson.dayOfWeek);
      const number = Number(lesson.lessonNumber);
      if (!Number.isInteger(day) || day < 1 || day > 7 || !Number.isInteger(number) || number < 1
        || normalizeGroup(lesson.group) !== groupKey) continue;
      const lessonDate = shiftScheduleDate(schedule.weekStart, day - 1);
      if (!scheduleCoversDate(schedule, lessonDate) || lessonDate.slice(0, 4) !== date.slice(0, 4)
        || semesterForDate(lessonDate) !== semesterForDate(date)) continue;
      const sub = solePracticeSubgroup(state, group) || normalizeSubgroup(lesson.subgroup);
      if (subgroup && sub && sub !== subgroup) continue;
      if (recorded.some(entry => entry.date === lessonDate && Number(entry.lessonNumber) === number
        && (!sub || !normalizeSubgroup(entry.subgroup) || normalizeSubgroup(entry.subgroup) === sub))) continue;
      const id = [lessonDate, number, sub].join('|');
      entries.set(id, { id, date: lessonDate, lessonNumber: number, group, subgroup: sub,
        type: lesson.type || (sub ? 'practice' : null), attendance: {}, scheduleOnly: true });
    }
  }
  return [...entries.values()];
}
