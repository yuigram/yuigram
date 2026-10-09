// SPDX-License-Identifier: MPL-2.0

/**
 * Defaults a client applies to the calls it makes.
 *
 * ```ts
 * Bot.fromToken(token, {
 *   defaults: {
 *     '*': { parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
 *     sendMessage: { protect_content: true },
 *   },
 * })
 * ```
 *
 * Three layers, each overriding the one before:
 *
 * ```
 *   '*'            applied only to methods that take the parameter
 *   <method>       applied to that method, whatever it is
 *   the call       what the caller wrote, always
 * ```
 *
 * What the caller wrote wins even when it is `false`, `null` or an empty
 * string, since each of those is a value somebody chose. `undefined` wins too,
 * and a parameter left `undefined` is not sent — so passing it is how one call
 * opts out of a default. Objects in defaults are copied into each call, so a
 * hook that adjusts `link_preview_options` on one call does not change it for
 * every call after, and two clients never share one.
 *
 * A defaulted `parse_mode` is left off a call that carries its own ranges —
 * `entities`, `caption_entities`, or a formatted value where the text goes —
 * because text that says where its bold is does not also need parsing for it.
 */

import type { ApiMethods } from './generated/api.js'
import { DEFAULTABLE, METHOD_NAMES } from './generated/defaults.js'
import type { LinkPreviewOptions } from './generated/types/index.js'

/** The parameters a method takes. */
export type ParamsOf<M extends keyof ApiMethods> = ApiMethods[M] extends (
  params: infer P,
  ...rest: never[]
) => unknown
  ? NonNullable<P>
  : never

/** Parameters shared across methods and meaningful to set for all of them. */
export interface CommonDefaults {
  readonly parse_mode?: 'HTML' | 'MarkdownV2' | 'Markdown'
  readonly link_preview_options?: LinkPreviewOptions
  readonly disable_notification?: boolean
  readonly protect_content?: boolean
  readonly allow_paid_broadcast?: boolean
  readonly message_effect_id?: string
  readonly business_connection_id?: string
}

/**
 * Defaults for a client: `'*'` for every method that takes a parameter, and a
 * key per method for that method alone.
 */
export type MethodDefaults = { readonly '*'?: CommonDefaults } & {
  readonly [M in keyof ApiMethods]?: Partial<ParamsOf<M>>
}

/** Defaults, read once into the layers they are applied in. */
export interface PreparedDefaults {
  /** Applied where the schema says the method takes the parameter. */
  readonly everywhere: Readonly<Record<string, unknown>>
  /** Applied to the method named. */
  readonly byMethod: ReadonlyMap<string, Readonly<Record<string, unknown>>>
  /**
   * Parameters given at the top level rather than under `'*'` or a method —
   * the form defaults took before per-method ones — applied to every call as
   * they always were.
   */
  readonly flat: Readonly<Record<string, unknown>>
}

const NONE: PreparedDefaults = { everywhere: {}, byMethod: new Map(), flat: {} }

/**
 * A copy of plain data: objects and arrays copied, anything else kept.
 *
 * A class instance — a file to upload — is kept as it is rather than copied
 * into a plain object that has lost what it was.
 */
function copy<T>(value: T): T {
  if (Array.isArray(value)) return value.map(copy) as T
  if (typeof value !== 'object' || value === null) return value
  if (Object.getPrototypeOf(value) !== Object.prototype) return value

  const out: Record<string, unknown> = {}
  for (const [key, inner] of Object.entries(value)) out[key] = copy(inner)
  return out as T
}

/** Read defaults into their layers, copied so later changes to the object do not reach them. */
export function prepareDefaults(
  defaults: MethodDefaults | Readonly<Record<string, unknown>> | undefined,
): PreparedDefaults {
  if (defaults === undefined) return NONE

  const byMethod = new Map<string, Readonly<Record<string, unknown>>>()
  const flat: Record<string, unknown> = {}
  let everywhere: Readonly<Record<string, unknown>> = {}

  for (const [key, value] of Object.entries(defaults)) {
    if (key === '*') {
      everywhere = copy(value as Record<string, unknown>)
    } else if (METHOD_NAMES.has(key) || /[A-Z]/.test(key)) {
      // A method's name, or one newer than the schema: parameter names are
      // lower case throughout, and method names are not.
      byMethod.set(key, copy(value as Record<string, unknown>))
    } else {
      flat[key] = copy(value)
    }
  }

  return { everywhere, byMethod, flat }
}

/** Whether a call carries its own ranges for its text, so parsing it would be wrong. */
function carriesRanges(params: Readonly<Record<string, unknown>>): boolean {
  return (
    params['entities'] !== undefined ||
    params['caption_entities'] !== undefined ||
    (typeof params['text'] === 'object' && params['text'] !== null) ||
    (typeof params['caption'] === 'object' && params['caption'] !== null)
  )
}

/**
 * The parameters one call is sent with: its defaults, then what it was given.
 *
 * A method the schema does not name — reached through `call()` — gets no `'*'`
 * default, since nothing says which parameters it takes, but still gets one
 * named for it.
 */
export function withDefaults(
  defaults: PreparedDefaults,
  method: string,
  params: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  if (defaults === NONE) return { ...params }

  const merged: Record<string, unknown> = copy({ ...defaults.flat })

  for (const [key, value] of Object.entries(defaults.everywhere)) {
    if (DEFAULTABLE[key]?.has(method) === true) merged[key] = copy(value)
  }

  const own = defaults.byMethod.get(method)
  if (own !== undefined) Object.assign(merged, copy(own))

  // Only the defaulted one: a parse_mode the call passed is assigned below.
  if ('parse_mode' in merged && carriesRanges(params)) delete merged['parse_mode']

  return Object.assign(merged, params)
}
