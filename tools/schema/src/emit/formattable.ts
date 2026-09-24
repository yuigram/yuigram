/**
 * Where each method takes formatted text.
 *
 * A formatted value is text plus ranges, and the Bot API takes the two as a
 * pair of fields: `text` and `entities`, `caption` and `caption_entities`,
 * `question` and `question_entities`. The pairs are also nested — a poll's
 * options, an album's items, an inline result's content — so letting an
 * application pass one formatted value where Telegram wants two fields needs
 * to know every place a pair can appear.
 *
 * That is read off the schema rather than written by hand: a field `x` beside
 * `x_entities`, or `text`/`message_text` beside `entities`, in a method's
 * parameters or in any object reachable from them. A pair Telegram adds is
 * picked up the next time this runs.
 */

import type { BotApiSchema, Field, ObjectType, TypeRef } from '../bot-api/ir.js'
import { header } from './render.js'
import type { EmittedFile } from './types.js'

/** One place a formatted value can go: the path to the object, and its two fields. */
interface Slot {
  readonly path: readonly string[]
  readonly text: string
  readonly entities: string
}

/** The text/entities pairs among one set of fields. */
function pairs(fields: readonly Field[]): { text: string; entities: string }[] {
  const names = new Set(fields.map((field) => field.name))
  const found: { text: string; entities: string }[] = []

  for (const field of fields) {
    if (field.type.kind !== 'string') continue
    if (names.has(`${field.name}_entities`)) {
      found.push({ text: field.name, entities: `${field.name}_entities` })
    } else if ((field.name === 'text' || field.name === 'message_text') && names.has('entities')) {
      found.push({ text: field.name, entities: 'entities' })
    }
  }

  return found
}

/** Every slot reachable through a type, below `path`. */
function slotsIn(
  type: TypeRef,
  path: readonly string[],
  objects: ReadonlyMap<string, ObjectType>,
  seen: ReadonlySet<string>,
  out: Slot[],
): void {
  switch (type.kind) {
    case 'array':
      slotsIn(type.of, [...path, '*'], objects, seen, out)
      return
    case 'union':
      for (const member of type.of) slotsIn(member, path, objects, seen, out)
      return
    case 'reference': {
      const object = objects.get(type.name)
      if (object === undefined || seen.has(object.name)) return

      const inside = new Set([...seen, object.name])
      for (const subtype of object.subtypes ?? []) {
        slotsIn({ kind: 'reference', name: subtype }, path, objects, inside, out)
      }
      for (const pair of pairs(object.fields)) out.push({ path, ...pair })
      for (const field of object.fields) {
        slotsIn(field.type, [...path, field.name], objects, inside, out)
      }
      return
    }
    default:
      return
  }
}

/** Emit the table of formatted-text slots per method. */
export function emitFormattable(schema: BotApiSchema): EmittedFile {
  const objects = new Map(schema.objects.map((object) => [object.name, object]))
  const rows: string[] = []
  let total = 0

  for (const method of [...schema.methods].sort((a, b) => a.name.localeCompare(b.name))) {
    const slots: Slot[] = pairs(method.parameters).map((pair) => ({ path: [], ...pair }))
    for (const parameter of method.parameters) {
      slotsIn(parameter.type, [parameter.name], objects, new Set(), slots)
    }

    const unique = [...new Map(slots.map((slot) => [JSON.stringify(slot), slot])).values()]
    if (unique.length === 0) continue
    total += unique.length

    rows.push(
      `  ${method.name}: [\n${unique
        .map(
          (slot) =>
            `    { path: [${slot.path.map((part) => `'${part}'`).join(', ')}], text: '${slot.text}', entities: '${slot.entities}' },`,
        )
        .join('\n')}\n  ],`,
    )
  }

  return {
    path: 'formattable.ts',
    contents: `${header(schema.version, `Formatted-text slots (${total} across ${rows.length} methods)`)}/**
 * Where each method takes text with its ranges as a pair of fields.
 *
 * \`path\` leads from the parameters to the object holding the pair; \`*\` steps
 * into every element of an array.
 */
export interface FormattableSlot {
  readonly path: readonly string[]
  readonly text: string
  readonly entities: string
}

/** The slots of every method that has any. */
export const FORMATTABLE: Readonly<Record<string, readonly FormattableSlot[]>> = {
${rows.join('\n')}
}
`,
  }
}
