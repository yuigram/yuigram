/**
 * Type-level prototype for the 0.2.0 surface.
 *
 * Nothing here is wired to a client. It exists to answer one question before
 * any implementation begins: **do the event-specific context types come out
 * clean, or does the design only look good in prose?**
 *
 * The field shapes come from `generated/contexts.ts`, so this checks the real
 * generator output rather than a hand-copied approximation of it. Compiled by
 * `pnpm verify`, so a design that stops type-checking fails the build.
 *
 * ---
 *
 * The audit first blamed `ctx.text` being `string | undefined` inside a message
 * handler. Checking the schema corrected that: Telegram itself declares
 * `Message.text` optional, because a photo without a caption is a message with
 * no text. Optional there is *honest*.
 *
 * The real defect is narrower and worse: the single context type also loses the
 * guarantees the schema does make. `Message.chat` is required and
 * `InlineQuery.query` is required, yet both arrived as `| undefined` because one
 * type had to serve twenty-six kinds and degrade every field to its weakest
 * case.
 *
 * So the fix is not "make everything non-optional". It is: **carry the schema's
 * own optionality through, per event** — and let a narrower registration earn
 * the stronger type. `onText` gives `text: string` because it only fires for
 * messages that have text; `onMessage` cannot promise that.
 */

import type { Logger } from '@yuigram/core'
import { describe, expectTypeOf, it } from 'vitest'
import type { RawApi } from '../src/api.js'
import type {
  CallbackQueryEventFields,
  EventFieldsByKind,
  InlineQueryEventFields,
  MessageEventFields,
} from '../src/generated/contexts.js'
import type { UpdateEventKind } from '../src/generated/events.js'
import type { Chat, Message, Update, User } from '../src/generated/types/index.js'

// ---------------------------------------------------------------------------
// The proposed shape
// ---------------------------------------------------------------------------

/** What every context carries, whatever the event. */
interface EventContext<K extends UpdateEventKind = UpdateEventKind> {
  readonly kind: K
  readonly updateId: number
  readonly raw: Update
  readonly api: RawApi
  readonly log: Logger
}

/**
 * A context for any update whose payload is a `Message`.
 *
 * The fields come from the generator; the actions are written by hand, because
 * behaviour is not derivable from a schema.
 */
interface MessageContext<K extends UpdateEventKind = UpdateEventKind>
  extends EventContext<K>,
    MessageEventFields {
  reply(text: string): Promise<Message>
  edit(text: string): Promise<Message>
  delete(): Promise<true>
  forward(to: number | string): Promise<Message>
  react(emoji: string): Promise<true>
  pin(): Promise<true>
}

/**
 * A message already known to carry text.
 *
 * This is what `onText` and `onCommand` hand back, and it is where `text`
 * becomes a plain `string` — earned by a narrower registration rather than
 * asserted for every message.
 */
interface TextMessageContext<K extends UpdateEventKind = UpdateEventKind>
  extends MessageContext<K> {
  readonly text: string
}

/** A parsed command, on top of a text message. */
interface CommandContext<K extends UpdateEventKind = UpdateEventKind>
  extends TextMessageContext<K> {
  readonly command: {
    readonly name: string
    readonly args: readonly string[]
    readonly rest: string
  }
}

interface CallbackQueryContext extends EventContext<'callback_query'>, CallbackQueryEventFields {
  answer(text?: string): Promise<true>
}

interface InlineQueryContext extends EventContext<'inline_query'>, InlineQueryEventFields {}

/** Update kinds whose payload is a `Message`. Generated today as `MESSAGE_KINDS`. */
type MessageKind =
  | 'message'
  | 'message_edited'
  | 'channel_post'
  | 'channel_post_edited'
  | 'business_message'
  | 'business_message_edited'
  | 'guest_message'

/** Selects the context a given event kind produces. */
type ContextFor<K extends UpdateEventKind> = K extends MessageKind
  ? MessageContext<K>
  : K extends 'callback_query'
    ? CallbackQueryContext
    : K extends 'inline_query'
      ? InlineQueryContext
      : EventContext<K>

/** The proposed client surface, reduced to what the types must prove. */
interface BotSurface {
  on<K extends UpdateEventKind>(kind: K, handler: (event: ContextFor<K>) => unknown): this

  onMessage(handler: (message: MessageContext<'message'>) => unknown): this
  onText(handler: (message: TextMessageContext<'message'>) => unknown): this
  onCommand(name: string, handler: (message: CommandContext<'message'>) => unknown): this
  onCallbackQuery(handler: (query: CallbackQueryContext) => unknown): this
  onInlineQuery(handler: (query: InlineQueryContext) => unknown): this
}

declare const bot: BotSurface

// ---------------------------------------------------------------------------
// What the design must prove
// ---------------------------------------------------------------------------

describe('fields the schema guarantees arrive guaranteed', () => {
  it('gives a message handler a message, not a maybe-message', () => {
    bot.onMessage((message) => {
      expectTypeOf(message.message).toEqualTypeOf<Message>()
      expectTypeOf(message.chat).toEqualTypeOf<Chat>()
    })
  })

  it('gives an inline query handler the query text as a string', () => {
    // `InlineQuery.query` is required in the schema. It arrived optional before.
    bot.onInlineQuery((query) => {
      expectTypeOf(query.query).toEqualTypeOf<string>()
      expectTypeOf(query.sender).toEqualTypeOf<User>()
    })
  })
})

describe('fields the schema leaves optional stay optional', () => {
  it('keeps message text optional, because a photo has none', () => {
    bot.onMessage((message) => {
      expectTypeOf(message.text).toEqualTypeOf<string | undefined>()
      expectTypeOf(message.sender).toEqualTypeOf<User | undefined>()
    })
  })

  it('keeps callback data optional, because a game callback has none', () => {
    bot.onCallbackQuery((query) => {
      expectTypeOf(query.data).toEqualTypeOf<string | undefined>()
    })
  })
})

describe('a narrower registration earns a stronger type', () => {
  it('makes text a plain string under onText', () => {
    bot.onText((message) => {
      expectTypeOf(message.text).toEqualTypeOf<string>()
      // Still a message, so the message actions remain available.
      expectTypeOf(message.reply).toBeFunction()
    })
  })

  it('adds the parsed command under onCommand', () => {
    bot.onCommand('start', (message) => {
      expectTypeOf(message.text).toEqualTypeOf<string>()
      expectTypeOf(message.command.name).toEqualTypeOf<string>()
      expectTypeOf(message.command.args).toEqualTypeOf<readonly string[]>()
    })
  })
})

describe('on() narrows by the kind it is given', () => {
  it('selects the message context for a message kind', () => {
    bot.on('message', (event) => {
      expectTypeOf(event).toEqualTypeOf<MessageContext<'message'>>()
      expectTypeOf(event.chat).toEqualTypeOf<Chat>()
    })
  })

  it('selects the callback context for a callback kind', () => {
    bot.on('callback_query', (event) => {
      expectTypeOf(event).toEqualTypeOf<CallbackQueryContext>()
      expectTypeOf(event.answer).toBeFunction()
    })
  })

  it('selects a message context for every message-bearing kind', () => {
    // The seven kinds that carry a Message all reach the same shape, so a
    // handler written once works for edits and channel posts too.
    bot.on('channel_post', (event) => expectTypeOf(event.message).toEqualTypeOf<Message>())
    bot.on('business_message', (event) => expectTypeOf(event.message).toEqualTypeOf<Message>())
    bot.on('message_edited', (event) => expectTypeOf(event.chat).toEqualTypeOf<Chat>())
  })

  it('falls back to the base context for a kind with no special shape', () => {
    bot.on('poll_answer', (event) => {
      expectTypeOf(event.kind).toEqualTypeOf<'poll_answer'>()
      expectTypeOf(event).toMatchTypeOf<EventContext<'poll_answer'>>()
    })
  })
})

describe('actions belong to what the update already addressed', () => {
  it('puts reply, edit and delete on a message', () => {
    bot.onMessage((message) => {
      expectTypeOf(message.reply).parameter(0).toEqualTypeOf<string>()
      expectTypeOf(message.reply).returns.resolves.toEqualTypeOf<Message>()
      expectTypeOf(message.delete).returns.resolves.toEqualTypeOf<true>()
      expectTypeOf(message.react).parameter(0).toEqualTypeOf<string>()
    })
  })

  it('does not put message actions on an inline query', () => {
    // An inline query has no message to reply to, so the action must not exist.
    bot.onInlineQuery((query) => {
      expectTypeOf(query).not.toHaveProperty('reply')
      expectTypeOf(query).not.toHaveProperty('delete')
    })
  })
})

describe('the generated mapping covers the whole event surface', () => {
  it('has an entry for every update kind', () => {
    // If a Telegram release adds a kind and the generator misses it, this stops
    // compiling rather than leaving one event without a context.
    expectTypeOf<keyof EventFieldsByKind>().toEqualTypeOf<UpdateEventKind>()
  })

  it('routes a kind to the fields its payload actually carries', () => {
    expectTypeOf<EventFieldsByKind['message']>().toEqualTypeOf<MessageEventFields>()
    expectTypeOf<EventFieldsByKind['callback_query']>().toEqualTypeOf<CallbackQueryEventFields>()
    // Seven kinds share the message shape, so they resolve to the same type.
    expectTypeOf<EventFieldsByKind['channel_post']>().toEqualTypeOf<MessageEventFields>()
  })
})

describe('the minimal application type-checks as written', () => {
  it('reads without a single optional-chaining escape', () => {
    // This is the README example under the proposed surface. If it needs a
    // `??` or a `?.`, the design has failed and this test says so.
    bot.onCommand('start', (message) => message.reply('Hello.'))
    bot.onText((message) => message.reply(`You said: ${message.text}`))
  })
})
