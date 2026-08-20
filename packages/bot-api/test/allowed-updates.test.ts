/**
 * Automatic `allowed_updates` derivation.
 *
 * The failure mode here is silence. Telegram accepts its own update type names
 * and ignores the rest, so naming a kind it does not recognise means the update
 * simply never arrives and the handler never runs - with nothing in any log to
 * say why. Three ways that happened:
 *
 * - Yuigram kinds were sent verbatim, and they differ from Telegram's names
 *   wherever one reads better renamed (`message_edited` for `edited_message`).
 * - Promoted service kinds were sent, and those are not update types at all.
 * - An un-narrowable set omitted the parameter, which is not "everything":
 *   Telegram reuses whatever a previous run configured, and its own default
 *   excludes chat member and reaction updates.
 */

import { defineFilter } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { Bot } from '../src/bot.js'
import { UPDATE_EVENTS } from '../src/generated/events.js'
import { mockTransport, ok } from '../src/testing/mock-transport.js'

const TOKEN = '111111111:TESTTESTTESTTESTTESTTESTTESTTESTTES'

/** Telegram's own update type names, which is what allowed_updates accepts. */
const TELEGRAM_TYPES = new Set(Object.keys(UPDATE_EVENTS))

/** Start a bot with auto subscription and report what it asked Telegram for. */
async function subscription(register: (bot: Bot) => void): Promise<readonly string[] | undefined> {
  const transport = mockTransport()
  transport.on('getMe', ok({ id: 1, is_bot: true, first_name: 'T', username: 't' }))
  transport.on('getUpdates', ok([]))

  const bot = new Bot(TOKEN, { client: transport, allowedUpdates: 'auto' })
  register(bot)

  await bot.start()
  await new Promise((resolve) => setTimeout(resolve, 20))
  await bot.stop({ timeout: 100 })

  return transport.last('getUpdates')?.params['allowed_updates'] as readonly string[] | undefined
}

describe('what auto subscription asks Telegram for', () => {
  it('sends names Telegram recognises', async () => {
    // `edited_message` is Telegram's name; `message_edited` is ours.
    const asked = await subscription((bot) => {
      bot.on('message_edited', () => {})
    })

    for (const name of asked ?? []) {
      expect(TELEGRAM_TYPES.has(name), `${name} is not a Telegram update type`).toBe(true)
    }
  })

  it('does not send a promoted service kind as an update type', async () => {
    // A service kind is not something Telegram can subscribe to; it is a
    // message carrying a marker.
    const asked = await subscription((bot) => {
      bot.on('chat_member_joined', () => {})
    })

    for (const name of asked ?? []) {
      expect(TELEGRAM_TYPES.has(name), `${name} is not a Telegram update type`).toBe(true)
    }
  })

  it('explicitly requests the types the default excludes', async () => {
    // Telegram: omitting allowed_updates reuses "the previous setting", and
    // the default excludes chat_member, message_reaction and
    // message_reaction_count. A handler for those would never fire.
    const asked = await subscription((bot) => {
      bot.on('message_reaction', () => {})
    })

    expect(asked).toContain('message_reaction')
  })

  it('subscribes to everything explicitly when a handler could match anything', async () => {
    // Omitting the parameter inherits whatever a previous run configured on
    // Telegram's side, so "everything" has to be stated.
    const asked = await subscription((bot) => {
      bot.use(async (_ctx, next) => next())
      bot.on('message', () => {})
      // An opaque registration: a filter with no kind metadata could match
      // anything, so the set cannot be treated as exhaustive.
      bot.on(
        defineFilter('anything', () => true),
        () => {},
      )
    })

    expect(asked).toBeDefined()
    expect(asked).toContain('message_reaction')
    expect(asked).toContain('chat_member')
  })
})
