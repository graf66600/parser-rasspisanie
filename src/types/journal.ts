import { z } from 'zod';

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
  status: z.enum(['completed', 'rescheduled', 'canceled']).default('completed'),
  completedAt: z.string().default(() => new Date().toISOString()),
  notes: z.string().optional(),
});

export type JournalEntry = z.infer<typeof JournalEntrySchema>;
