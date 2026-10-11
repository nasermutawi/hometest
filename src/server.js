import { openDb } from './db.js';
import { createApp } from './app.js';
import { createParser } from './ai/index.js';
import { createInterpreter } from './chat/engine.js';
import { createNotifier, startReminderLoop } from './reminders.js';
import { createWhatsApp, whatsappConfigFromEnv } from './channels/whatsapp.js';

const port = Number(process.env.PORT || 3000);
const db = openDb(process.env.DATABASE_PATH || 'data/household.db');
const parser = createParser();
const interpreter = createInterpreter();
const waConfig = whatsappConfigFromEnv();
const whatsapp = waConfig ? createWhatsApp(db, waConfig) : null;
const notifier = createNotifier(db, { whatsapp });

createApp({ db, parser, notifier, interpreter, whatsapp }).listen(port, () => {
  console.log(`Household app on http://localhost:${port}`);
  console.log(`Task assistant: ${parser.engine === 'claude' ? 'Claude' : 'offline rules (set ANTHROPIC_API_KEY to use Claude)'}`);
  const channels = ['in-app', 'web push', notifier.channels.email && 'email', notifier.channels.whatsapp && 'WhatsApp'].filter(Boolean);
  console.log(`Notifications: ${channels.join(', ')}`);
});
startReminderLoop(db, notifier);
