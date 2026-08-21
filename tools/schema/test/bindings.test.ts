/**
 * Binding classification.
 *
 * The classification decides what a hundred generated methods do, from nothing
 * but parameter names — so the failure mode is not a compile error but a call
 * that goes to the wrong place and looks reasonable while doing it. These pin
 * the judgements that make the rules correct, and the guard that fails the
 * build when Telegram introduces a shape the rules have not seen.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { BotApiSchema, Method } from '../src/bot-api/ir.js'
import { type Binding, collectBindings, emitBindings } from '../src/emit/bindings.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const schema = JSON.parse(
  readFileSync(join(ROOT, 'schemas', 'bot-api', '10.2.json'), 'utf8'),
) as BotApiSchema

const bindings = collectBindings(schema)
const by = new Map<string, Binding>(bindings.map((binding) => [binding.method, binding]))

/** A schema carrying one synthetic method, for the rules that must fail. */
function schemaWith(method: Partial<Method> & { name: string }): BotApiSchema {
  return {
    ...schema,
    methods: [
      {
        group: 'Test',
        description: '',
        documentationLink: '',
        parameters: [],
        returns: { kind: 'boolean' },
        hasFileParameter: false,
        ...method,
      },
    ],
  }
}

/** A required parameter of the given name. */
function required(name: string) {
  return { name, type: { kind: 'string' } as const, required: true, description: '' }
}

/** An optional parameter of the given name. */
function optional(name: string) {
  return { name, type: { kind: 'string' } as const, required: false, description: '' }
}

describe('what gets bound', () => {
  it('binds a chat-addressed method to the chat', () => {
    expect(by.get('banChatMember')?.group).toBe('chat')
    expect(by.get('banChatMember')?.injects).toEqual(['chat_id'])
  })

  it('binds a message-addressed method to both the chat and the message', () => {
    expect(by.get('setMessageReaction')?.group).toBe('message')
    expect(by.get('setMessageReaction')?.injects).toEqual(['chat_id', 'message_id'])
  })

  it('treats the edit family as message-addressed despite optional identifiers', () => {
    // `editMessageText` leaves `chat_id` optional because an inline message is
    // addressed differently. From a message context both are known.
    expect(by.get('editMessageText')?.group).toBe('message')
    expect(by.get('editMessageText')?.injects).toContain('message_id')
  })

  it('inherits the thread and the connection on a send, and only on a send', () => {
    // A send that loses the topic lands in the general chat; `banChatMember`
    // has no topic to lose, and injecting one would be a parameter Telegram
    // does not accept.
    expect(by.get('sendMessage')?.injects).toEqual([
      'chat_id',
      'message_thread_id',
      'business_connection_id',
    ])
    expect(by.get('banChatMember')?.injects).not.toContain('message_thread_id')
  })

  it('binds each query answer to its own identifier', () => {
    expect(by.get('answerCallbackQuery')).toEqual({
      method: 'answerCallbackQuery',
      group: 'callbackQuery',
      injects: ['callback_query_id'],
    })
    expect(by.get('answerInlineQuery')?.group).toBe('inlineQuery')
    expect(by.get('answerShippingQuery')?.group).toBe('shippingQuery')
    expect(by.get('answerPreCheckoutQuery')?.group).toBe('preCheckoutQuery')
  })
})

describe('what must not be bound', () => {
  it('leaves the destination of a relocation to the caller', () => {
    // The trap: `chat_id` on `forwardMessage` is where the message goes. Bound
    // to the incoming chat it would forward every message to itself.
    expect(by.get('forwardMessage')).toEqual({
      method: 'forwardMessage',
      group: 'source',
      injects: ['from_chat_id', 'message_id'],
    })
    expect(by.get('copyMessage')?.injects).not.toContain('chat_id')
  })

  it('leaves a list of messages to the caller', () => {
    expect(by.get('forwardMessages')?.injects).toEqual(['from_chat_id'])
  })

  it('does not mistake an optional query id for a query answer', () => {
    // Every `sendX` accepts an optional `callback_query_id`, because a bot may
    // answer a callback query with a message. Only the answer methods require
    // one, and matching on declaration classified `sendMessage` as an answer.
    expect(by.get('sendMessage')?.group).toBe('chat')
    expect(by.get('sendPhoto')?.group).toBe('chat')
  })

  it('never guesses a person from the update', () => {
    // A moderation call aimed at whoever happened to send the message is a
    // footgun. Naming the target is one word longer and never ambiguous.
    for (const binding of bindings) {
      expect(binding.injects).not.toContain('user_id')
    }
  })

  it('skips a method that addresses nothing the context holds', () => {
    expect(by.has('getMe')).toBe(false)
    expect(by.has('setWebhook')).toBe(false)
    expect(by.has('repostStory')).toBe(false)
  })
})

describe('the guard', () => {
  it('fails the build on an unclassified source-and-destination method', () => {
    const next = schemaWith({
      name: 'teleportMessage',
      parameters: [required('chat_id'), required('from_chat_id'), required('message_id')],
    })

    expect(() => collectBindings(next)).toThrow(/from_chat_id/)
  })

  it('accepts an ordinary chat method without complaint', () => {
    const next = schemaWith({
      name: 'someNewChatMethod',
      parameters: [required('chat_id'), optional('message_thread_id')],
    })

    expect(collectBindings(next)).toEqual([
      {
        method: 'someNewChatMethod',
        group: 'chat',
        injects: ['chat_id', 'message_thread_id'],
      },
    ])
  })
})

describe('the emitted file', () => {
  const emitted = emitBindings(schema).contents

  it('is a table rather than code', () => {
    // The whole point: breadth without a function per method. A reference
    // implementation spends about nine thousand generated lines on the message
    // surface; this stays in the hundreds.
    expect(emitted.split('\n').length).toBeLessThan(300)
    expect(emitted).not.toContain('function')
  })

  it('names its source and forbids editing', () => {
    expect(emitted).toContain('GENERATED FILE')
    expect(emitted).toContain(`Bot API ${schema.version}`)
  })

  it('declares every table the runtime installs', () => {
    for (const table of [
      'MESSAGE_BOUND',
      'CHAT_BOUND',
      'SOURCE_BOUND',
      'CALLBACK_QUERY_BOUND',
      'INLINE_QUERY_BOUND',
      'SHIPPING_QUERY_BOUND',
      'PRE_CHECKOUT_QUERY_BOUND',
    ]) {
      expect(emitted).toContain(`export const ${table} = {`)
    }
  })

  it('covers a useful share of the API surface', () => {
    // Not a target to optimize — a floor, so a classification that silently
    // stopped matching shows up as a failure rather than as a thinner context.
    expect(bindings.length).toBeGreaterThan(100)
    expect(bindings.length).toBeLessThan(schema.methods.length)
  })
})
