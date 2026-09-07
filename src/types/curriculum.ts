import { z } from 'zod';

export const CurriculumLessonSchema = z.object({
  number: z.number().int().optional(),
  type: z.enum(['theory', 'practice', 'exam', 'other']).default('other'),
  section: z.string().default(''),
  topic: z.string().default(''),
  text: z.string(),
});

export type CurriculumLesson = z.infer<typeof CurriculumLessonSchema>;

export const CurriculumProgramSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  description: z.string().default(''),
  specialty: z.string().default(''),
  course: z.number().int().optional(),
  groups: z.array(z.string()),
  buttonText: z.string().default(''),
  lessons: z.array(CurriculumLessonSchema),
});

export type CurriculumProgram = z.infer<typeof CurriculumProgramSchema>;

export const GroupProgressSchema = z.object({
  group: z.string(),
  currentLessonIndex: z.number().int().default(0),
  lastUpdated: z.string().default(() => new Date().toISOString()),
});

export type GroupProgress = z.infer<typeof GroupProgressSchema>;
