/**
 * Per-event context generation.
 *
 * The property this exists to protect: a context carries the schema's own
 * optionality. What Telegram guarantees arrives guaranteed; what it leaves
 * optional stays optional. Getting that wrong in either direction is a lie the
 * compiler then enforces on every handler.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { BotApiSchema, ObjectType } from '../src/bot-api/ir.js'
import { collectContextShapes, emitContexts } from '../src/emit/contexts.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const schema = JSON.parse(
  readFileSync(join(ROOT, 'schemas', 'bot-api', '10.2.json'), 'utf8'),
) as BotApiSchema
const shapes = collectContextShapes(schema)
const emitted = emitContexts(schema).contents

/** The body of one generated interface. */
function body(name: string): string {
  const start = emitted.indexOf(`export interface ${name} {`)
  if (start === -1) throw new Error(`no interface ${name} in the emitted output`)
  return emitted.slice(start, emitted.indexOf('\n}', start))
}

describe('grouping', () => {
  it('gives every update kind a shape', () => {
    const kinds = new Set(shapes.flatMap((s) => [...s.kinds]))

    // 26 update kinds in Bot API 10.2.
    expect(kinds.size).toBe(26)
  })

  it('shares one shape between kinds carrying the same payload', () => {
    const message = shapes.find((s) => s.payload === 'Message')

    // A handler written against the message shape works for edits and channel
    // posts without being rewritten.
    expect(message?.kinds).toContain('message')
    expect(message?.kinds).toContain('message_edited')
    expect(message?.kinds).toContain('channel_post')
    expect(message?.kinds.length).toBe(7)
  })

  it('produces fewer shapes than kinds', () => {
    expect(shapes.length).toBeLessThan(26)
  })
})

describe('the schema decides optionality', () => {
  it('keeps a required field required', () => {
    // Message.chat is required, and the single shared context of 0.1.0 lost
    // that guarantee.
    expect(body('MessageEventFields')).toContain('readonly chat: Chat')
  })

  it('keeps an optional field optional', () => {
    // A photo without a caption is a message with no text, so claiming
    // otherwise would be a lie.
    expect(body('MessageEventFields')).toMatch(/readonly text\?: string \| undefined/)
  })

  it('carries a required field through on a different payload', () => {
    // InlineQuery.query is required; it arrived optional before.
    expect(body('InlineQueryEventFields')).toContain('readonly query: string')
  })

  it('never contradicts the schema for any field of any shape', () => {
    const objects = new Map(schema.objects.map((o) => [o.name, o]))
    let checked = 0

    for (const shape of shapes) {
      const object = objects.get(shape.payload)
      if (object === undefined) continue

      const text = body(shape.name)

      for (const field of object.fields) {
        // The sender field is projected under its normalized name instead.
        if (field.name === 'from' || field.name === 'user') continue

        const required = new RegExp(`readonly ${field.name}: `)
        const optional = new RegExp(`readonly ${field.name}\\?: `)

        if (field.required) {
          expect(text, `${shape.name}.${field.name} should be required`).toMatch(required)
        } else {
          expect(text, `${shape.name}.${field.name} should be optional`).toMatch(optional)
        }
        checked += 1
      }
    }

    // A guard against the loop silently checking nothing.
    expect(checked).toBeGreaterThan(200)
  })
})

describe('normalized accessors', () => {
  it('exposes the sender under one name whatever Telegram calls it', () => {
    // Telegram spells it `from` on Message and `user` on PollAnswer.
    expect(body('MessageEventFields')).toContain('readonly sender: User | undefined')
    expect(body('PollAnswerEventFields')).toContain('readonly sender: User')
  })

  it('carries the sender optionality from the schema', () => {
    // InlineQuery.from is required, Message.from is not.
    expect(body('InlineQueryEventFields')).toContain('readonly sender: User\n')
    expect(body('MessageEventFields')).toContain('readonly sender: User | undefined')
  })

  it('exposes the whole payload under a domain name', () => {
    expect(body('MessageEventFields')).toContain('readonly message: Message')
    expect(body('CallbackQueryEventFields')).toContain('readonly query: CallbackQuery')
  })

  it('does not project the sender field twice', () => {
    const text = body('MessageEventFields')

    expect(text).not.toMatch(/readonly from\?:/)
  })
})

describe('the alias cannot shadow a real field', () => {
  it('rejects an alias that collides, rather than emitting a broken file', () => {
    // ChatBoostUpdated has a field called `boost`; aliasing the payload to
    // `boost` produced a duplicate member that only surfaced at compile time.
    // Telegram adds fields regularly, so the next collision must fail loudly.
    const colliding: BotApiSchema = {
      ...schema,
      objects: schema.objects.map(
        (o): ObjectType =>
          o.name === 'Message'
            ? {
                ...o,
                fields: [
                  ...o.fields,
                  {
                    name: 'message',
                    description: 'collides with the alias',
                    required: true,
                    type: { kind: 'string' },
                  },
                ],
              }
            : o,
      ),
    }

    expect(() => emitContexts(colliding)).toThrow(/collides with its own field/)
  })
})

describe('emitted output', () => {
  it('maps every kind to a shape', () => {
    const mapping = emitted.slice(emitted.indexOf('EventFieldsByKind'))

    expect(mapping).toContain("'message': MessageEventFields")
    expect(mapping).toContain("'callback_query': CallbackQueryEventFields")
    expect(mapping).toContain("'inline_query': InlineQueryEventFields")
  })

  it('imports the types it uses', () => {
    const imports = emitted
      .split('\n')
      .filter((line) => line.startsWith('import type'))
      .join('\n')

    expect(imports).toContain('Message')
    expect(imports).toContain('User')
    expect(imports).toContain('Chat')
    // The alias table is typed against the kind union, so that comes too.
    expect(imports).toContain('UpdateEventKind')
  })

  it('emits the alias table the runtime reads', () => {
    // Both sides come from one table, so the types cannot say `boostUpdate`
    // while the runtime writes `boost`.
    expect(emitted).toContain('export const PAYLOAD_ALIASES')
    expect(emitted).toContain("'message': 'message'")
    expect(emitted).toContain("'chat_boost': 'boostUpdate'")
  })

  it('is deterministic', () => {
    expect(emitContexts(schema).contents).toBe(emitted)
  })
})
