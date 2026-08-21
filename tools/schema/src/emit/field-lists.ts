/**
 * Which fields a payload leaves optional.
 *
 * A filter that proves a field is present — "this message has a photo" — is the
 * single most common thing a bot asks about an update, and there is one per
 * optional field. Writing them out is a hundred near-identical declarations
 * that go stale the day Telegram adds a field; generating them as *code* is a
 * hundred generated declarations a consumer's TypeScript server re-reads on
 * every keystroke.
 *
 * So neither. What is emitted here is the **list of field names**. The filter
 * types are computed from the context shapes, which are already generated, and
 * the runtime builds one filter per name in a loop. Adding a field to Telegram
 * adds a name to a list, and everything else follows.
 *
 * A reference implementation emits 138 of these as declarations, at roughly a
 * thousand lines. The list below is a few hundred bytes and says the same
 * thing.
 */

import type { BotApiSchema, ObjectType } from '../bot-api/ir.js'
import { collectContextShapes } from './contexts.js'
import { header, renderDoc } from './render.js'
import type { EmittedFile } from './types.js'

/**
 * Payloads worth generating a presence list for.
 *
 * Every event kind has optional fields, but only a few are asked about often
 * enough to earn a filter namespace. A kind outside this set is still reachable
 * through `filter()`, which is one line.
 */
const LISTED: ReadonlyArray<{ readonly payload: string; readonly constant: string }> = [
  { payload: 'Message', constant: 'MESSAGE_FIELDS' },
  { payload: 'CallbackQuery', constant: 'CALLBACK_QUERY_FIELDS' },
  { payload: 'InlineQuery', constant: 'INLINE_QUERY_FIELDS' },
]

/**
 * Fields Telegram spells differently for the same idea.
 *
 * The context shapes normalize these to `sender`, so the list has to as well —
 * a filter named for a field the context does not carry would compile against
 * the payload and never match a context.
 */
const SENDER_FIELDS = new Set(['from', 'user'])

/** Optional field names of an object, as the context shape names them. */
export function optionalFields(object: ObjectType): string[] {
  const names = new Set<string>()

  for (const field of object.fields) {
    if (field.required) continue
    names.add(SENDER_FIELDS.has(field.name) ? 'sender' : field.name)
  }

  return [...names].sort()
}

/** Emit the presence field lists. */
export function emitFieldLists(schema: BotApiSchema): EmittedFile {
  const objects = new Map(schema.objects.map((object) => [object.name, object]))
  const shapes = new Map(collectContextShapes(schema).map((shape) => [shape.payload, shape]))

  const blocks = LISTED.map(({ payload, constant }) => {
    const object = objects.get(payload)
    if (object === undefined) {
      throw new Error(`no ${payload} in the schema, so ${constant} cannot be emitted`)
    }

    const fields = optionalFields(object)
    const kinds = shapes.get(payload)?.kinds ?? []

    const doc = renderDoc(
      `Optional fields of \`${payload}\`, for the presence filters. ${fields.length} of them, ` +
        `covering ${kinds.length === 0 ? 'no event kinds' : `${kinds.length} event kind${kinds.length === 1 ? '' : 's'}`}.`,
    )

    return `${doc}export const ${constant} = [
${fields.map((field) => `  '${field}',`).join('\n')}
] as const`
  })

  const total = LISTED.reduce((sum, { payload }) => {
    const object = objects.get(payload)
    return sum + (object === undefined ? 0 : optionalFields(object).length)
  }, 0)

  return {
    path: 'field-lists.ts',
    contents: `${header(schema.version, `Optional field lists (${total} fields)`)}${blocks.join('\n\n')}\n`,
  }
}
