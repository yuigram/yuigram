// SPDX-License-Identifier: MIT

/**
 * An update typed as a choice of objects.
 *
 * Telegram's staging documentation types `Update.callback_query` as
 * `CallbackQuery | BusinessCallbackQuery | InlineCallbackQuery`: one object
 * per place a button can be pressed, told apart by which fields they carry.
 * The generator used to read such a field as `unknown` and drop the event
 * kind, with its context and its registration, without a word.
 *
 * The schema here is the committed 10.3 with that one change made, so what is
 * checked is the generator's reading of a union rather than any page.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { BotApiSchema, Field, ObjectType } from '../src/bot-api/ir.js'
import { collectContextShapes, emitContexts, payloadObject } from '../src/emit/contexts.js'
import { collectUpdateEvents, emitEvents } from '../src/emit/events.js'
import { emitFieldLists } from '../src/emit/field-lists.js'
import { emitAll } from '../src/emit/index.js'
import { collectRegistrations } from '../src/emit/registrations.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const stable = JSON.parse(
  readFileSync(join(ROOT, 'schemas', 'bot-api', '10.3.json'), 'utf8'),
) as BotApiSchema

const objectNamed = (schema: BotApiSchema, name: string): ObjectType => {
  const object = schema.objects.find((one) => one.name === name)
  if (object === undefined) throw new Error(`no ${name} in the schema`)
  return object
}

const fieldNamed = (object: ObjectType, name: string): Field => {
  const field = object.fields.find((one) => one.name === name)
  if (field === undefined) throw new Error(`no ${object.name}.${name}`)
  return field
}

/** The committed schema with `callback_query` split the way the staging page splits it. */
function withSplitCallbackQuery(schema: BotApiSchema): BotApiSchema {
  const query = objectNamed(schema, 'CallbackQuery')
  const common = query.fields.filter(
    (field) => field.name !== 'message' && field.name !== 'inline_message_id',
  )
  const message = fieldNamed(query, 'message')
  const inline = fieldNamed(query, 'inline_message_id')
  const [id, from, ...rest] = common

  const variant = (name: string, carried: Field): ObjectType => ({
    ...query,
    name,
    fields: [id as Field, from as Field, carried, ...rest],
  })

  const split: ObjectType[] = [
    variant('CallbackQuery', { ...message, required: true }),
    variant('BusinessCallbackQuery', {
      ...message,
      required: true,
      type: { kind: 'reference', name: 'Message' },
    }),
    variant('InlineCallbackQuery', { ...inline, required: true }),
  ]

  return {
    ...schema,
    objects: [
      ...schema.objects
        .filter((object) => object.name !== 'CallbackQuery')
        .map((object) =>
          object.name !== 'Update'
            ? object
            : {
                ...object,
                fields: object.fields.map((field) =>
                  field.name !== 'callback_query'
                    ? field
                    : {
                        ...field,
                        type: {
                          kind: 'union' as const,
                          of: split.map((one) => ({
                            kind: 'reference' as const,
                            name: one.name,
                          })),
                        },
                      },
                ),
              },
        ),
      ...split,
    ],
  }
}

const union = withSplitCallbackQuery(stable)
const PAYLOAD = 'CallbackQuery | BusinessCallbackQuery | InlineCallbackQuery'

/** Property names and whether each is optional, from a generated interface. */
function members(source: string, name: string): string[] {
  const start = source.indexOf(`export interface ${name} {`)
  if (start === -1) throw new Error(`no interface ${name}`)
  const body = source.slice(start, source.indexOf('\n}', start))
  return [...body.matchAll(/^ {2}readonly (\w+)(\??):/gm)].map(
    ([, field, optional]) => `${field}${optional}`,
  )
}

describe('an update typed as a choice of objects', () => {
  it('keeps the event kind, with every member as its payload', () => {
    const event = collectUpdateEvents(union).find((one) => one.kind === 'callback_query')

    expect(event?.members).toEqual([
      'CallbackQuery',
      'BusinessCallbackQuery',
      'InlineCallbackQuery',
    ])
    expect(event?.type).toBe(PAYLOAD)
    expect(emitEvents(union).contents).toContain(`"callback_query": ${PAYLOAD}`)
  })

  it('names and aliases the shape after the first member, as before the split', () => {
    const shape = collectContextShapes(union).find((one) => one.kinds.includes('callback_query'))

    expect(shape).toMatchObject({
      name: 'CallbackQueryEventFields',
      payload: PAYLOAD,
      alias: 'query',
    })
  })

  it('projects a field once, required only where every member requires it', () => {
    const shape = collectContextShapes(union).find((one) => one.kinds.includes('callback_query'))
    if (shape === undefined) throw new Error('no callback_query shape')
    const merged = payloadObject(shape, new Map(union.objects.map((one) => [one.name, one])))
    if (merged === undefined) throw new Error('no merged payload')

    expect(fieldNamed(merged, 'id').required).toBe(true)
    expect(fieldNamed(merged, 'chat_instance').required).toBe(true)
    // Each is carried by some members and not others: a handler narrows on them.
    expect(fieldNamed(merged, 'message').required).toBe(false)
    expect(fieldNamed(merged, 'inline_message_id').required).toBe(false)
    expect(fieldNamed(merged, 'message').type).toEqual({
      kind: 'union',
      of: [
        { kind: 'reference', name: 'MaybeInaccessibleMessage' },
        { kind: 'reference', name: 'Message' },
      ],
    })
  })

  it('gives handlers the context they had before the split, field for field', () => {
    // What changes is the payload under `query`; every projected field keeps
    // its name and its optionality, so handlers written against 10.3 compile;
    // only the order the members list them in moves.
    const before = members(emitContexts(stable).contents, 'CallbackQueryEventFields')
    const after = members(emitContexts(union).contents, 'CallbackQueryEventFields')

    expect([...after].sort()).toEqual([...before].sort())
    expect(emitContexts(union).contents).toContain(`  readonly query: ${PAYLOAD}`)
  })

  it('imports every member the context names', () => {
    const imports = emitContexts(union)
      .contents.split('\n')
      .find((line) => line.includes("from './types/index.js'"))

    expect(imports).toContain('BusinessCallbackQuery')
    expect(imports).toContain('InlineCallbackQuery')
    expect(imports).toContain('CallbackQuery')
  })

  it('keeps the kind in the context map and the presence filters', () => {
    expect(emitContexts(union).contents).toContain("'callback_query': CallbackQueryEventFields")
    expect(emitFieldLists(union).contents).toBe(emitFieldLists(stable).contents)
  })

  it('keeps every registration', () => {
    expect(collectRegistrations(union)).toEqual(collectRegistrations(stable))
  })

  it('emits a complete set of sources', () => {
    expect(() => emitAll(union)).not.toThrow()
  })
})
