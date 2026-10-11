import { createClaudeParser } from './claudeParser.js';
import { parseWithRules } from './rulesParser.js';

// Returns a parser that uses Claude when an API key is configured, falling back to
// the offline rules if Claude is unavailable so task entry never hard-fails.
export function createParser({ apiKey = process.env.ANTHROPIC_API_KEY, logger = console } = {}) {
  const claude = apiKey ? createClaudeParser({ apiKey }) : null;
  const parse = async (input) => {
    if (claude) {
      try {
        return { ...(await claude(input)), engine: 'claude' };
      } catch (err) {
        logger.error('Claude parse failed, using rules fallback:', err.message);
      }
    }
    return { ...parseWithRules(input), engine: 'rules' };
  };
  parse.engine = claude ? 'claude' : 'rules';
  return parse;
}
