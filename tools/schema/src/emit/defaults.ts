/**
 * What a client-wide default may be applied to.
 *
 * A default for "every method" is only right for the methods that take the
 * parameter: `parse_mode` on `getMe` is noise at best, and a stray
 * `business_connection_id` on a method that does not take one is a field sent
 * for nothing in every multipart upload. So the parameters worth defaulting
 * everywhere are listed here with the methods that accept each, and the
 * runtime applies a `'*'` default only where the list says it lands.
 *
 * The method names are emitted too, so the runtime can tell a per-method
 * default — keyed by a method — from a parameter written in the older flat
 * form, keyed by the parameter itself.
 */

import type { BotApiSchema } from '../bot-api/ir.js'
import { header, renderDoc } from './render.js'
import type { EmittedFile } from './types.js'

/**
 * Parameters shared across many methods and meaningful to set once.
 *
 * Kept to those whose meaning does not change from method to method. A reply
 * target or a keyboard is per call, and defaulting one would attach it to calls
 * that never meant to carry it.
 */
export const COMMON_DEFAULTABLE = [
  'allow_paid_broadcast',
  'business_connection_id',
  'disable_notification',
  'link_preview_options',
  'message_effect_id',
  'parse_mode',
  'protect_content',
] as const

/** Emit the defaults tables. */
export function emitDefaults(schema: BotApiSchema): EmittedFile {
  const names = schema.methods.map((method) => method.name).sort()

  const accepting = COMMON_DEFAULTABLE.map((parameter) => {
    const methods = schema.methods
      .filter((method) => method.parameters.some((field) => field.name === parameter))
      .map((method) => method.name)
      .sort()

    if (methods.length === 0) {
      throw new Error(`no method takes '${parameter}', so it cannot be a common default`)
    }

    return { parameter, methods }
  })

  const table = accepting
    .map(
      ({ parameter, methods }) =>
        `  ${parameter}: new Set([\n${methods.map((name) => `    '${name}',`).join('\n')}\n  ]),`,
    )
    .join('\n')

  const contents = `${header(schema.version, `Defaultable parameters (${COMMON_DEFAULTABLE.length}) and method names (${names.length})`)}${renderDoc(
    `Every method in the schema, ${names.length} of them.`,
  )}export const METHOD_NAMES: ReadonlySet<string> = new Set([
${names.map((name) => `  '${name}',`).join('\n')}
])

${renderDoc('The methods that take each parameter a client-wide default may set.')}export const DEFAULTABLE: Readonly<Record<string, ReadonlySet<string>>> = {
${table}
}
`

  return { path: 'defaults.ts', contents }
}
