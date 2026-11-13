import { z } from 'zod';
import { JournalEntrySchema } from '../types/journal.js';

export const GroupSchema = z.string().trim().min(1).max(100);
export const StudentNameSchema = z.string().trim().min(1).max(200);
export const StudentListSchema = z.array(StudentNameSchema).max(500);

export const StudentUpdateSchema = z.object({
  group: GroupSchema,
  students: StudentListSchema.optional(),
  student: StudentNameSchema.optional(),
}).refine((value) => Array.isArray(value.students) || value.student !== undefined, {
  message: 'Не переданы данные студентов',
});

const optionalValue = (value: unknown) => value === '' || value === null ? undefined : value;
const numberValue = (value: unknown) => typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
const optionalNumber = (schema: z.ZodTypeAny) => z.preprocess(
  (value) => numberValue(optionalValue(value)), schema.optional()
);
const optionalText = (max: number) => z.preprocess(optionalValue, z.string().max(max).optional());
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Некорректная дата');

export const JournalMarkSchema = JournalEntrySchema.pick({
  classroom: true, attendance: true, notes: true,
}).partial().extend({
  id: optionalText(500),
  group: GroupSchema,
  subject: optionalText(500),
  teacher: optionalText(200),
  lessonNumber: z.preprocess(numberValue, JournalEntrySchema.shape.lessonNumber),
  startTime: z.preprocess(optionalValue, time.optional()),
  endTime: z.preprocess(optionalValue, time.optional()),
  classroom: optionalText(100),
  attendance: z.record(JournalEntrySchema.shape.attendance.removeDefault().valueSchema.partial().passthrough()).optional(),
  topic: optionalText(2000),
  topicIndex: optionalNumber(z.number().int().min(0)),
  courseLessonNumber: optionalNumber(z.number().int().min(1)),
  type: z.preprocess(optionalValue, JournalEntrySchema.shape.type.removeDefault().optional()),
  date: z.preprocess(optionalValue, date.optional()),
  subgroup: z.preprocess(optionalValue, z.union([
    z.literal(1), z.literal(2), z.literal('1').transform(() => 1 as const), z.literal('2').transform(() => 2 as const),
  ]).optional()),
});

export const JournalDeleteSchema = z.object({ id: z.string().trim().min(1).max(500) });

export function validationMessage(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') || 'Некорректные данные запроса';
}
