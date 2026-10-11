import { openDb } from './db.js';
import { createApp } from './app.js';
import { createParser } from './ai/index.js';
import { createNotifier, startReminderLoop } from './reminders.js';

const port = Number(process.env.PORT || 3000);
const db = openDb(process.env.DATABASE_PATH || 'data/household.db');
const parser = createParser();
const notifier = createNotifier(db);

createApp({ db, parser, notifier }).listen(port, () => {
  console.log(`Household app on http://localhost:${port}`);
  console.log(`Task assistant: ${parser.engine === 'claude' ? 'Claude' : 'offline rules (set ANTHROPIC_API_KEY to use Claude)'}`);
  console.log(`Reminders: in-app + web push${notifier.channels.email ? ' + email' : ' (set SMTP_URL to add email)'}`);
});
startReminderLoop(db, notifier);
