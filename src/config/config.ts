import dotenv from 'dotenv';
import path from 'path';
import { LessonTime } from '../types/schedule.js';

dotenv.config();

export const DEFAULT_BELLS: LessonTime[] = [
  { lessonNumber: 1, startTime: '08:00', endTime: '09:20' },
  { lessonNumber: 2, startTime: '09:30', endTime: '10:50' },
  { lessonNumber: 3, startTime: '11:00', endTime: '12:20' },
  { lessonNumber: 4, startTime: '13:00', endTime: '14:20' },
  { lessonNumber: 5, startTime: '14:30', endTime: '15:50' },
  { lessonNumber: 6, startTime: '16:00', endTime: '17:20' },
  { lessonNumber: 7, startTime: '17:30', endTime: '18:50' },
];

export const DAYS_OF_WEEK: Record<number, string> = {
  1: 'Понедельник',
  2: 'Вторник',
  3: 'Среда',
  4: 'Четверг',
  5: 'Пятница',
  6: 'Суббота',
  7: 'Воскресенье',
};

export const DAY_NAME_TO_NUMBER: Record<string, number> = {
  'понедельник': 1,
  'пн': 1,
  'mon': 1,
  'monday': 1,
  'вторник': 2,
  'вт': 2,
  'tue': 2,
  'tuesday': 2,
  'среда': 3,
  'ср': 3,
  'wed': 3,
  'wednesday': 3,
  'четверг': 4,
  'чт': 4,
  'thu': 4,
  'thursday': 4,
  'пятница': 5,
  'пт': 5,
  'fri': 5,
  'friday': 5,
  'суббота': 6,
  'сб': 6,
  'sat': 6,
  'saturday': 6,
  'воскресенье': 7,
  'вс': 7,
  'sun': 7,
  'sunday': 7,
};

export const CONFIG = {
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  DATA_DIR: path.resolve(process.cwd(), 'data'),
  SCHEDULES_FILE: path.resolve(process.cwd(), 'data', 'schedules.json'),
  DEFAULT_TEACHER: 'Трипольский',
  DEFAULT_SUBJECT: 'Информатика',
};
