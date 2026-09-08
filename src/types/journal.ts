import { z } from 'zod';

export const StudentAttendanceSchema = z.object({
  status: z.enum(['present', 'absent', 'excused']).default('present'),
  grade: z.string().optional(),
  comment: z.string().optional(),
});

export type StudentAttendance = z.infer<typeof StudentAttendanceSchema>;

export const JournalEntrySchema = z.object({
  id: z.string(),
  date: z.string(), // YYYY-MM-DD
  dateFormatted: z.string(), // e.g. "08.09.2026 (Вт)"
  group: z.string(),
  subject: z.string(),
  lessonNumber: z.number().int().min(1).max(10),
  startTime: z.string(),
  endTime: z.string(),
  classroom: z.string().default(''),
  topic: z.string(),
  topicIndex: z.number().int().optional(),
  courseLessonNumber: z.number().int().min(1).optional(),
  type: z.enum(['theory', 'practice', 'exam', 'other']).default('theory'),
  status: z.enum(['completed', 'rescheduled', 'canceled']).default('completed'),
  completedAt: z.string().default(() => new Date().toISOString()),
  notes: z.string().optional(),
  attendance: z.record(StudentAttendanceSchema).default({}),
});

export type JournalEntry = z.infer<typeof JournalEntrySchema>;
