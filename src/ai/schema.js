import { z } from 'zod';

export const CATEGORIES = [
  'maintenance', 'contractor', 'shopping', 'cleaning', 'admin',
  'finance', 'health', 'kids', 'pets', 'vehicle', 'garden', 'other',
];

// The shape every parser (Claude or the offline rules) returns. Dates are the
// household's local calendar date/time; the browser converts them to UTC.
export const TaskDraftSchema = z.object({
  title: z.string().describe('Short imperative title, e.g. "Get boiler serviced"'),
  notes: z.string().describe('Useful details from the request: contractor names, phone numbers, addresses, quantities. Empty string if none.'),
  category: z.enum(CATEGORIES),
  due_date: z.string().nullable().describe('YYYY-MM-DD local date the task happens or is due, or null if not stated'),
  due_time: z.string().nullable().describe('HH:MM 24h local time, or null if no time was given'),
  owner: z.string().nullable().describe('Exact name of the household member who owns the task, or null if unclear'),
  prep_steps: z.array(z.object({
    title: z.string().describe('Preparation that must happen before the task'),
    days_before: z.number().describe('How many days before the due date this prep should be done (0 = same day, earlier)'),
  })),
  reminder_offsets_minutes: z.array(z.number()).describe('Minutes before the due time to remind the owner, e.g. [1440, 60]'),
  questions: z.array(z.string()).describe('Clarifying questions, only for information that is genuinely missing and needed (usually the date or owner). Empty if nothing important is missing.'),
});
