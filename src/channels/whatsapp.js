// WhatsApp channel via Meta's WhatsApp Business Cloud API.
// Outbound: reminders and household updates go to each member's own WhatsApp chat
// with the app's number. Inbound: replies are run through the chat engine, so
// "done" or "move it to Friday" changes the task in the app.
import express from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';

export function normalizePhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '').replace(/^00/, '');
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function whatsappConfigFromEnv(env = process.env) {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return null;
  return {
    token: env.WHATSAPP_TOKEN,
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    verifyToken: env.WHATSAPP_VERIFY_TOKEN,
    appSecret: env.WHATSAPP_APP_SECRET,
    templateName: env.WHATSAPP_TEMPLATE || null,
    templateLang: env.WHATSAPP_TEMPLATE_LANG || 'en',
    apiVersion: env.WHATSAPP_API_VERSION || 'v23.0',
  };
}

const WINDOW_MS = 24 * 3600_000;

export function createWhatsApp(db, config, { fetchImpl = fetch, logger = console } = {}) {
  const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;

  async function post(payload) {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || `WhatsApp API error ${res.status}`);
    return data.messages?.[0]?.id ?? null;
  }

  // WhatsApp only allows free-form messages within 24 hours of the person's last
  // message. Outside that window a pre-approved template must be used.
  async function sendToUser(userId, text, { taskId = null } = {}) {
    const user = db.prepare('SELECT id, phone, last_inbound_at FROM users WHERE id = ?').get(userId);
    if (!user?.phone) return null;
    const inWindow = user.last_inbound_at && Date.now() - new Date(user.last_inbound_at) < WINDOW_MS;
    let externalId;
    if (inWindow || !config.templateName) {
      externalId = await post({ to: user.phone, type: 'text', text: { body: text.slice(0, 4096), preview_url: false } });
    } else {
      externalId = await post({
        to: user.phone,
        type: 'template',
        template: {
          name: config.templateName,
          language: { code: config.templateLang },
          // Template parameters can't contain newlines.
          components: [{ type: 'body', parameters: [{ type: 'text', text: text.replace(/\s*\n\s*/g, ' ').slice(0, 1000) }] }],
        },
      });
    }
    db.prepare('INSERT INTO chat_messages (user_id, channel, direction, external_id, task_id, body) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, 'whatsapp', 'out', externalId, taskId, text);
    return externalId;
  }

  function validSignature(req) {
    if (!config.appSecret) return true;
    const header = req.get('x-hub-signature-256') || '';
    const expected = `sha256=${createHmac('sha256', config.appSecret).update(req.rawBody ?? '').digest('hex')}`;
    return header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  }

  async function handleMessage(engine, msg) {
    const phone = normalizePhone(msg.from);
    const user = db.prepare('SELECT id, name, email, household_id FROM users WHERE phone = ?').get(phone);
    if (!user) {
      logger.log(`WhatsApp message from unknown number ${phone}`);
      await post({ to: phone, type: 'text', text: { body: "This number isn't linked to a household yet. Add it in the app under Settings > WhatsApp." } });
      return;
    }
    db.prepare('UPDATE users SET last_inbound_at = ? WHERE id = ?').run(new Date().toISOString(), user.id);
    if (!user.household_id) return;
    if (msg.type !== 'text') {
      await sendToUser(user.id, 'I can only read text messages for now. Tip: use the microphone on your keyboard to dictate.');
      return;
    }
    const { reply, taskId } = await engine.handle({
      user, text: msg.text.body, channel: 'whatsapp', replyToExternalId: msg.context?.id ?? null, externalId: msg.id,
    });
    await sendToUser(user.id, reply, { taskId });
  }

  function router(engine) {
    const r = express.Router();
    // Meta calls this once to verify the webhook URL.
    r.get('/', (req, res) => {
      if (req.query['hub.mode'] === 'subscribe' && config.verifyToken && req.query['hub.verify_token'] === config.verifyToken) {
        return res.type('text').send(String(req.query['hub.challenge']));
      }
      res.sendStatus(403);
    });
    r.post('/', async (req, res) => {
      if (!validSignature(req)) return res.sendStatus(401);
      // Acknowledge straight away; Meta retries slow webhooks.
      res.sendStatus(200);
      const messages = (req.body.entry ?? []).flatMap((e) => e.changes ?? []).flatMap((c) => c.value?.messages ?? []);
      for (const msg of messages) {
        // Meta can deliver the same message more than once.
        if (db.prepare("SELECT 1 FROM chat_messages WHERE external_id = ? AND direction = 'in'").get(msg.id)) continue;
        try {
          await handleMessage(engine, msg);
        } catch (err) {
          logger.error('WhatsApp message handling failed:', err);
        }
      }
    });
    return r;
  }

  return { sendToUser, router };
}
