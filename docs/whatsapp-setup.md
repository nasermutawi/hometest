# Setting up WhatsApp

Once this is set up, each household member gets reminders and updates on WhatsApp and can reply in plain language:

> **Household:** "Clear the gutters" is due in 1 day (Sat 17 Oct, 10:00). Nobody has taken it yet.
> Reply "I'll take it" to claim it.
>
> **Sara:** I'll take it
>
> **Household:** "Clear the gutters" is yours. I've let Naser know.

Meanwhile Naser gets: *Sara is taking care of "Clear the gutters".*

Things people can say:
- `done` / `finished`: marks the task done. For a repeating task, the next one is scheduled.
- `I'll take it` / `mine`: claims the task. `give it to Sara` assigns it.
- `move it to Friday 10am` / `push the dentist to next week`: reschedules. Prep steps move with the task.
- `add: service the car every 6 months starting 1 Dec`: creates a task with prep steps.
- `what's due?`: lists what's coming up.
- Anything else in plain language when Claude is enabled (`ANTHROPIC_API_KEY`), e.g. "the plumber can't come Thursday, make it the week after and add his number 07700 900123".

A short message like "done" refers to the task the app last messaged you about. To be precise, swipe and **reply to** the specific reminder.

The same assistant is available inside the app (speech-bubble icon), so you can try all of this before WhatsApp is set up.

## Why it isn't a group chat

Meta's WhatsApp Business API doesn't let a business number post into an ordinary group that you've created. Instead, the household number messages each of you in your own chat with it. You both get the same reminders, and when one of you acts, the app tells the other. In practice this works like a group: nobody misses anything, and everyone can reply.

## What you need

1. **A phone number for the app** that isn't already registered on WhatsApp (a spare SIM or a virtual number). You can start with Meta's free test number.
2. **A Meta developer account** (free) at <https://developers.facebook.com>.
3. **The app deployed at a public HTTPS address**, so WhatsApp can deliver your replies (see "Hosting" in the README).

## Steps

1. **Create the Meta app.** In the developer dashboard, go to *Create app* → choose *Business* (or "Other → Business") → add the **WhatsApp** product. You'll land on *WhatsApp → API Setup*, which shows a test phone number, its **Phone number ID**, and a temporary access token.
2. **Add your numbers as test recipients** (only needed while using the test number). In *API Setup*, add your and your spouse's WhatsApp numbers to the allowed list.
3. **Set environment variables** on your host:
   - `WHATSAPP_PHONE_NUMBER_ID`: from *API Setup*
   - `WHATSAPP_TOKEN`: the temporary token for a quick test. For permanent use, create a *System User* in Meta Business Settings, give it the `whatsapp_business_messaging` permission, and generate a non-expiring token.
   - `WHATSAPP_APP_SECRET`: *App settings → Basic → App secret*. Used to check that webhook calls really come from Meta.
   - `WHATSAPP_VERIFY_TOKEN`: any random string you choose.
   - `WHATSAPP_DISPLAY_NUMBER`: the app's number, shown to users in Settings, e.g. `+44 7700 900000`.
4. **Connect the webhook.** In *WhatsApp → Configuration*, set the callback URL to `https://YOUR-APP-ADDRESS/webhooks/whatsapp` and the verify token to the same `WHATSAPP_VERIFY_TOKEN`. Click *Verify and save*, then subscribe to the **messages** field.
5. **Create a message template for reminders.** WhatsApp only lets a business send free-form messages within 24 hours of the person's last message. Reminders often arrive outside that window, so they're sent through an approved template. In *WhatsApp Manager → Message templates*, create:
   - Name: `household_update`, Category: **Utility**, Language: English
   - Body: `Household update: {{1}}` (example value: `"Boiler service" is due in 1 day. You're on it.`)

   Once it's approved (usually minutes to hours), set `WHATSAPP_TEMPLATE=household_update` (and `WHATSAPP_TEMPLATE_LANG=en`, or `en_GB`/`en_US` to match the language you picked). Replies to your messages and anything within 24 hours of your last message go out as normal text.
6. **Link each person's number.** In the app: *Settings → WhatsApp*, enter your number with its country code. Each person should then send "hi" to the app's number once.

## Costs

The WhatsApp API charges per template message (reminders sent outside the 24-hour window). The price depends on the country and is typically a fraction of a cent to a few cents per message. Replies within the 24-hour window are generally free. Check Meta's current pricing page for your country.

## Limitations today

- Voice notes aren't transcribed yet. The bot asks for text, and dictating with the keyboard microphone works fine. Transcription can be added with a speech-to-text service.
- Without `ANTHROPIC_API_KEY`, replies are handled by a simple offline interpreter that understands the commands listed above but not free-form sentences.
