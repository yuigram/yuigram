/**
 * 02 — Keyboards, media and formatting.
 *
 * The three things almost every bot needs after it can reply: buttons, files,
 * and text that survives being interpolated with something a user wrote.
 *
 * ```sh
 * BOT_TOKEN=123456:ABC… pnpm tsx examples/02-keyboards/index.ts
 * ```
 */

import { Bot, f, html, InlineKeyboard, Keyboard, media, retryOnFloodWait } from 'yuigram'

const token = process.env['BOT_TOKEN']

if (token === undefined) {
  throw new Error('Set BOT_TOKEN to the token BotFather gave you.')
}

const bot = Bot.fromToken(token)

// Wait out a rate limit rather than losing the message. Telegram states the
// wait; the correct response is to wait exactly that long.
bot.hook(retryOnFloodWait({ maxWait: 30 }))

// --- Inline keyboards --------------------------------------------------------

// A keyboard *is* the markup, so it goes straight into `reply_markup` with no
// build step to forget. A payload over Telegram's 64-byte limit is refused
// here rather than by the send that follows.
const menu = new InlineKeyboard()
  .text('Buy', 'buy:coffee')
  .text('Skip', 'skip')
  .row()
  .url('Docs', 'https://core.telegram.org/bots/api')

bot.onCommand('menu', (message) => message.reply('What would you like?', { reply_markup: menu }))

// Built from data, laid out afterwards. `columns` decides the shape once
// rather than at every push.
bot.onCommand('pick', (message) => {
  const keyboard = new InlineKeyboard()
    .addFrom([1, 2, 3, 4, 5, 6], (n) => ({ text: `${n}`, callback_data: `pick:${n}` }))
    .columns(3)

  return message.reply('Pick a number', { reply_markup: keyboard })
})

bot.onCallbackQuery(/^pick:/, async (query) => {
  const picked = query.data?.slice('pick:'.length)

  // Answering is what stops the button spinning; do it even with no text.
  await query.answerCallbackQuery({ text: `You picked ${picked}` })
  await query.edit(`Picked ${picked}.`)
})

bot.onCallbackQuery('buy:coffee', async (query) => {
  await query.answerCallbackQuery({ text: 'Ordered', show_alert: false })
})

// --- Reply keyboards ---------------------------------------------------------

bot.onCommand('ask', (message) =>
  message.reply('Share your number?', {
    reply_markup: new Keyboard()
      .requestContact('Share number')
      .row()
      .text('No thanks')
      .resized()
      .oneTime(),
  }),
)

bot.onText('No thanks', (message) =>
  message.reply('No problem.', { reply_markup: Keyboard.remove() }),
)

// --- Media -------------------------------------------------------------------

// Nothing is read from disk until the request is encoded, so a source built
// and not sent costs nothing.
bot.onCommand('file', (message) =>
  message.sendDocument({
    document: media.text(`Generated at ${new Date().toISOString()}`, 'report.txt'),
    caption: 'A file built in memory.',
  }),
)

bot.onCommand('photo', (message) =>
  message.sendPhoto({
    photo: media.url('https://picsum.photos/400'),
    caption: 'Fetched by Telegram, not by us.',
  }),
)

// --- Formatting --------------------------------------------------------------

// The tag escapes what is interpolated and leaves the markup alone. Without it
// a user called `<b>` breaks this reply with "can't parse entities".
bot.onCommand('whoami', (message) =>
  message.reply(html`You are <b>${message.sender?.first_name ?? 'nobody'}</b>.`, {
    parse_mode: 'HTML',
  }),
)

// --- Filters -----------------------------------------------------------------

// `f.has.photo` proves the field is there, so no guard is needed inside.
bot.on(f.has.photo, (message) => message.react('👍').then(() => undefined))

// One filter per optional field is generated from the schema; the families are
// curated for the judgements a schema cannot make.
bot.on(f.entity.anyLink, (message) => message.reply('That looks like a link.'))

bot.onError((error, event) => {
  event.log.error('handler failed', { kind: event.kind, error })
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void bot.stop()
  })
}

await bot.poll()

console.log('Keyboard example running. Try /menu, /pick, /ask, /file, /photo, /whoami.')
