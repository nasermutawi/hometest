import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { TaskDraftSchema, CATEGORIES } from './schema.js';

const SYSTEM_PROMPT = `You turn a household member's plain-language request into a structured task for a shared household to-do app used by a couple or family.

Extract the task title, any useful notes (contractor names, phone numbers, addresses, item lists), a category, the date/time, and who owns it.

Preparation steps matter most. Think about what has to happen ahead of time for the task to go smoothly, both what the person said explicitly ("I need to move the car out first") and what is clearly implied by the kind of task. Examples:
- A contractor visit: confirm the appointment the day before, clear access to the work area, have the relevant paperwork or warranty handy.
- A car service: find the service book, remove valuables, arrange a lift back.
- A dinner party: plan the menu and shop a couple of days before.
Keep prep steps concrete and few (0-4). Don't invent prep for trivial tasks.

Dates: resolve relative dates ("next Tuesday", "end of the month") against the current local date provided. Use null when no date is stated; do not guess one.
Owner: use the exact name of a listed member. "I"/"me" means the person speaking. If nobody is named, leave owner null.
Reminders: choose sensible offsets (default [1440, 60]; use [60] for same-day errands; add 10080 for big things like contractor visits a week out).
Questions: ask only when something essential is missing (usually the date, or the owner when it's ambiguous). Keep each question short. If the conversation already contains answers, use them and don't ask again.

Categories: ${CATEGORIES.join(', ')}.`;

export function createClaudeParser({ apiKey = process.env.ANTHROPIC_API_KEY, model = process.env.CLAUDE_MODEL || 'claude-opus-5-5' } = {}) {
  const client = new Anthropic({ apiKey });

  return async function parseWithClaude({ text, now, members, speaker, history = [] }) {
    const memberList = members.map((m) => `- ${m.name}${m.name === speaker ? ' (the person speaking)' : ''}`).join('\n');
    const followUps = history.map((h) => `Q: ${h.question}\nA: ${h.answer}`).join('\n');
    const content = [
      `Current local date/time: ${now}`,
      `Household members:\n${memberList}`,
      `Request from ${speaker}:\n${text}`,
      followUps && `Follow-up answers:\n${followUps}`,
    ].filter(Boolean).join('\n\n');

    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      // Opus 5.5 always thinks; medium effort is plenty for extraction.
      output_config: { effort: 'medium', format: betaZodOutputFormat(TaskDraftSchema) },
      // Server-side fallback re-runs the request on another model if it is declined.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    });

    if (response.stop_reason === 'refusal') throw new Error('The assistant declined to parse this request');
    if (!response.parsed_output) throw new Error(`Could not parse a task (stop_reason: ${response.stop_reason})`);
    return response.parsed_output;
  };
}
