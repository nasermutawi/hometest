import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { ChatPlanSchema } from './schema.js';

const SYSTEM_PROMPT = `You are the assistant inside a shared household task app. Household members message you (in the app or on WhatsApp) to manage their shared tasks, and you translate each message into operations on those tasks.

Operations:
- complete / reopen: mark a task done or not done.
- reschedule: change a task's date and/or time (give only what changes; resolve relative dates against the current local date).
- assign: set the owner to a member. "I'll do it", "mine", "on it" mean assign to the person speaking.
- unassign: remove the owner.
- rename: change a task's title. add_note: add details (phone numbers, quotes, contractor names).
- create: a new task. Put the person's full description in "text" (date, owner, prep and repetition included); the app parses it.
- list: the person wants to see what's coming up or what's on their plate.

Working out which task they mean: if the message is a reply to something the app sent about a task, or follows on from it, that is the "current task" given below, and short messages like "done" or "move it to Friday" refer to it. Otherwise match by title. If it's genuinely ambiguous, do nothing and ask which task in "message".

One message can need several operations ("done, and move the bins one to Thursday"). Never invent tasks that aren't listed for anything but create. If the message is chit-chat or a question you can answer from the task list, reply in "message" without operations. Keep "message" short and friendly, written for a phone screen.`;

export function createClaudeInterpreter({ apiKey = process.env.ANTHROPIC_API_KEY, model = process.env.CLAUDE_MODEL || 'claude-opus-5-5' } = {}) {
  const client = new Anthropic({ apiKey });

  return async function interpretWithClaude({ text, speaker, members, tasks, contextTaskId, now }) {
    const taskLines = tasks.map((t) => `- id ${t.id}: "${t.title}" | ${t.when} | owner: ${t.owner ?? 'nobody'} | ${t.status}${t.repeat ? ` | repeats ${t.repeat}` : ''}`);
    const content = [
      `Current local date/time: ${now}`,
      `Household members: ${members.map((m) => m.name).join(', ')}`,
      `Tasks:\n${taskLines.join('\n') || '(none)'}`,
      `Current task: ${contextTaskId ? `id ${contextTaskId}` : 'none'}`,
      `Message from ${speaker}:\n${text}`,
    ].join('\n\n');

    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      output_config: { effort: 'medium', format: betaZodOutputFormat(ChatPlanSchema) },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    });

    if (response.stop_reason === 'refusal') throw new Error('The assistant declined this message');
    if (!response.parsed_output) throw new Error(`Could not interpret the message (stop_reason: ${response.stop_reason})`);
    return response.parsed_output;
  };
}
