import { z } from 'zod';

export const OPERATION_TYPES = ['complete', 'reopen', 'reschedule', 'assign', 'unassign', 'rename', 'add_note', 'create', 'list'];

// What the chat interpreter (Claude or the offline rules) returns for one message.
export const ChatPlanSchema = z.object({
  operations: z.array(z.object({
    type: z.enum(OPERATION_TYPES),
    task_id: z.number().nullable().describe('Id of the existing task this applies to; null for create/list or when unknown'),
    due_date: z.string().nullable().describe('reschedule: new local date YYYY-MM-DD, or null to keep the date'),
    due_time: z.string().nullable().describe('reschedule: new local time HH:MM (24h), or null to keep the time'),
    owner: z.string().nullable().describe('assign: exact member name'),
    text: z.string().nullable().describe('create: the full task description in the user\'s words; rename: new title; add_note: note text'),
  })),
  message: z.string().describe('Reply text only for answering a question, asking for clarification, or explaining why nothing was done. Empty string when the operations say it all.'),
});
