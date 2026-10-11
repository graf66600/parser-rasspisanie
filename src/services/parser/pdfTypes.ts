import { Lesson, LessonTime } from '../../types/schedule.js';

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  page: number;
}

export interface PdfColumnGroup {
  group: string;
  x: number;
  xMin: number;
  xMax: number;
  page: number;
}

export interface PdfLessonRow {
  dayOfWeek: number;
  dayName: string;
  lessonNumber: number;
  y: number;
  startTime: string;
  endTime: string;
}

export interface PdfParseContext {
  bells: LessonTime[];
  teacherFilter: string;
  subjectFilter: string;
}
