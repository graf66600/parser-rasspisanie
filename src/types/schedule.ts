import { z } from 'zod';

export const LessonTimeSchema = z.object({
  lessonNumber: z.number().int().min(1).max(10),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Формат времени должен быть ЧЧ:ММ'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Формат времени должен быть ЧЧ:ММ'),
});

export type LessonTime = z.infer<typeof LessonTimeSchema>;

export const LessonSchema = z.object({
  id: z.string(),
  dayOfWeek: z.number().int().min(1).max(7), // 1 = Понедельник, 7 = Воскресенье
  dayName: z.string(),
  lessonNumber: z.number().int().min(1).max(10),
  startTime: z.string(),
  endTime: z.string(),
  subject: z.string(),
  group: z.string().default(''),
  classroom: z.string().default(''),
  teacher: z.string().default('Трипольский'),
  weekType: z.enum(['all', 'numerator', 'denominator']).default('all'),
});

export type Lesson = z.infer<typeof LessonSchema>;

export const UserSettingsSchema = z.object({
  remindMinutesBefore: z.number().int().min(1).max(120).default(15),
  morningDigestEnabled: z.boolean().default(true),
  morningDigestTime: z.string().regex(/^\d{2}:\d{2}$/).default('08:00'),
  bellsSchedule: z.array(LessonTimeSchema),
  teacherFilter: z.string().default('Трипольский'),
  subjectFilter: z.string().default('Информатика'),
});

export type UserSettings = z.infer<typeof UserSettingsSchema>;

export const UserScheduleDataSchema = z.object({
  userId: z.number(),
  chatId: z.number(),
  updatedAt: z.string(),
  settings: UserSettingsSchema,
  lessons: z.array(LessonSchema),
});

export type UserScheduleData = z.infer<typeof UserScheduleDataSchema>;
