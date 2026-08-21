/**
 * 06 — Routing and filters.
 *
 * Five ways to select updates, in increasing order of precision: by kind, by
 * name, by command, by shorthand, and by composed filter. Registration decides
 * what the handler receives, so selecting more precisely also types more
 * precisely.
 *
 * It also shows what a context can do once it has one: every method the update
 * already addresses, with the identifiers filled in.
 *
 * ```sh
 * BOT_TOKEN=123456:ABC… pnpm tsx examples/06-routing/index.ts
 * ```
 */

import { and, Bot, filter, type MessageContext, not } from 'yuigram'

const token = process.env['BOT_TOKEN']

if (token === undefined) {
  throw new Error('Set BOT_TOKEN to the token BotFather gave you.')
}

const bot = Bot.fromToken(token)

// --- By kind -----------------------------------------------------------------

// A single kind, or several at once. The kind is a type-level input: the
// handler below receives an edited message, with everything Telegram
// guarantees about one.
bot.on('message_edited', (message) => message.reply('I saw that edit.'))

bot.on(['message', 'channel_post'], (event) => {
  event.log.debug('a message arrived', { kind: event.kind })
})

// A service message is promoted to its own kind, so it never reaches the
// handlers above — and it is still a message, so it can reply.
bot.on('chat_member_joined', (event) => event.reply('Welcome to the group!'))

// --- By name -----------------------------------------------------------------

// Every kind also has a named registration, generated from the same taxonomy
// the dispatcher indexes. `on('chat_member_joined', …)` and the line below do
// the same thing; the name is what autocomplete offers, which is how most
// people find out that a member joining has its own kind at all.
bot.onChatMemberJoined((event) => event.reply('Welcome!'))

bot.onMessagePinned((event) => {
  event.log.debug('someone pinned a message', { chat: event.chat.id })
})

// --- By command --------------------------------------------------------------

bot.onCommand('start', (message) => message.reply('Try /echo something, or send a photo.'))

// `message.command` carries the parsed name, the raw remainder and split
// arguments. `message.text` is a plain string here: a command is text.
bot.onCommand('echo', (message) =>
  message.reply(message.command.rest === '' ? 'Give me something to echo.' : message.command.rest),
)

// A pattern matches against the command name, so one handler can serve a family.
bot.onCommand(/^admin_/, (message) => message.reply(`Admin command: ${message.command.name}`))

// --- By shorthand ------------------------------------------------------------

// Exact text, and a pattern over text. Neither fires on callback data: a button
// press carries `data`, and letting a text filter see it would route button
// presses into text handlers.
bot.onText('ping', (message) => message.reply('pong'))
bot.onText(/^\d+$/, (message) => message.reply('That is a number.'))

// A callback query answers the button, and can also reach the chat the button
// lives in.
bot.onCallbackQuery(/^buy:/, async (query) => {
  await query.answer('Ordered')
  await query.edit(`Bought ${query.data?.slice(4)}`)
})

// --- By composed filter ------------------------------------------------------

// `filter` is the Bot API subsystem's version of core's `defineFilter`: the
// predicate receives a context rather than `unknown`. Name the context the
// predicate expects — here a message, because a poll answer has no chat to
// inspect — and list the kinds so the predicate is never run on the rest.

/** Messages sent in a private chat. */
const isPrivate = filter<MessageContext>('isPrivate', (message) => message.chat.type === 'private')

/** Messages carrying at least one entity, such as a link or a mention. */
const hasEntities = filter<MessageContext>(
  'hasEntities',
  (message) => (message.entities?.length ?? 0) > 0,
)

// `and`, `or` and `not` compose filters without losing the narrowing each one
// contributes. Name the composition before registering it: composing in the
// argument itself is rejected, because the compiler cannot infer through the
// nested call and a handler that silently saw every kind would be worse.
const privateWithLink = and(isPrivate, hasEntities)
const groupWithLink = and(not(isPrivate), hasEntities)

bot.on(privateWithLink, (message) => message.reply('A private message with formatting or a link.'))

// `not` drops what the filter it negates proved — not being private says
// nothing about what the update is — so this handler sees any event.
bot.on(groupWithLink, (event) => {
  event.log.debug('a group message with formatting or a link')
})

// --- Acting on what arrived ---------------------------------------------------

// Beyond `reply` and the other curated actions, a context carries every API
// method it can address, under Telegram's own name and with the identifiers
// already filled in. The chat comes from the update, so it is not passed —
// and could not be, because a context never addresses a peer it did not hear
// from. Reaching some other chat is the client's job, through `api`.
bot.onCommand('kick', async (message) => {
  const target = message.reply_to_message?.from

  if (target === undefined) {
    await message.reply('Reply to someone with /kick.')
    return
  }

  // `chat_id` is supplied; only the person has to be named.
  await message.banChatMember({ user_id: target.id })
  await message.reply(`Removed ${target.first_name}.`)
})

// A send inherits the forum topic and the business connection from the message
// that arrived, so a reply inside a topic stays inside it.
bot.onCommand('here', (message) => message.sendChatAction({ action: 'typing' }))

// --- Ordering ----------------------------------------------------------------

// Every matching handler runs, not only the first. Independent concerns —
// logging a photo, reacting to it, archiving it — compose without knowing about
// each other, which is why this is the default.
bot.on('message', (message) => {
  message.log.debug('saw a message', { chat: message.chat.id })
})

bot.onError((error, event) => {
  event.log.error('handler failed', { kind: event.kind, error })
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void bot.stop()
  })
}

await bot.poll()

console.log('Routing example running.')
