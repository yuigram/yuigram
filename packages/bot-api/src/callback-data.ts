// SPDX-License-Identifier: MIT

/**
 * Callback data with a shape.
 *
 * Telegram gives an inline button 64 bytes of `callback_data` and hands them
 * back verbatim when the button is pressed. Bots therefore invent a format —
 * `buy:42:xl` — and parse it by splitting on a separator, which goes wrong in
 * the usual ways: a field containing the separator, a number that comes back
 * as a string, a button from an older deployment parsed against a newer format.
 *
 * ```
 *   defineCallbackData('buy')       ──> a schema with a name
 *     .number('productId')              and typed fields
 *     .literal('size', ['s','m'])
 *
 *   schema.pack({ productId: 42 })  ──> 'buy:42:m'   (checked, ≤64 bytes)
 *   schema.unpack(fromTelegram)     ──> { productId: 42, size: 'm' } | undefined
 * ```
 *
 * **64 bytes, not 64 characters.** The limit is on the UTF-8 encoding, so an
 * emoji costs four and a Cyrillic letter two. A schema that counted characters
 * would build buttons Telegram rejects, and it would do it only for the
 * applications whose users do not write in ASCII.
 *
 * **Parsing is not authorisation.** `unpack` says the data matches this schema
 * and nothing more. Anybody who can see a button can press it, and anybody who
 * has pressed one can replay its data later; a query carries the person who
 * pressed it, and deciding whether they may is the application's. Nothing here
 * signs anything, because a signature that did not cover the recipient would
 * not answer that question either.
 */

import { ValidationError, YuigramError } from './core.js'
import type { InlineKeyboardButton } from './generated/types/index.js'

/** The most `callback_data` Telegram carries, in bytes of UTF-8. */
export const CALLBACK_DATA_LIMIT = 64

/** The separator between a schema's name and its fields. */
const SEPARATOR = ':'

/** What a field may hold. */
export type CallbackValue = string | number | boolean

/** One declared field. */
export interface FieldSpec {
  readonly key: string
  readonly kind: 'string' | 'number' | 'boolean' | 'literal'
  /** The values a literal field accepts, in the order declared. */
  readonly values?: readonly string[]
}

/** Raised when data does not belong to the schema it was offered to. */
export class CallbackDataInvalid extends YuigramError {
  override readonly name = 'CallbackDataInvalid'
}

/** Raised when packed data would not fit in a button. */
export class CallbackDataTooLong extends YuigramError {
  override readonly name = 'CallbackDataTooLong'
}

/** How many bytes a string costs on the wire. */
function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

/** A name or literal value may not contain the separator or be empty. */
function checkToken(what: string, value: string): void {
  if (value === '') throw new ValidationError(`a callback data ${what} cannot be empty`)
  if (value.includes(SEPARATOR)) {
    throw new ValidationError(
      `a callback data ${what} cannot contain '${SEPARATOR}', which separates fields: ${JSON.stringify(value)}`,
    )
  }
}

/** A schema's state type grows as fields are declared. */
type Add<State, Key extends string, T> = State & { readonly [K in Key]: T }

/** A schema: a name, some typed fields, and the two operations that matter. */
export interface CallbackData<State extends Record<string, CallbackValue>> {
  /** The name every packed payload starts with. */
  readonly name: string
  /** The fields, in declaration order. */
  readonly fields: readonly FieldSpec[]

  /** Declare a text field. It may not contain the separator. */
  string<Key extends string>(key: Key): CallbackData<Add<State, Key, string>>
  /** Declare a whole-number field. */
  number<Key extends string>(key: Key): CallbackData<Add<State, Key, number>>
  /** Declare a yes-or-no field, which costs one byte. */
  boolean<Key extends string>(key: Key): CallbackData<Add<State, Key, boolean>>
  /** Declare a field holding one of a known set of values. */
  literal<Key extends string, const V extends readonly string[]>(
    key: Key,
    values: V,
  ): CallbackData<Add<State, Key, V[number]>>

  /**
   * Build the string a button carries.
   *
   * Refuses anything Telegram would: a value containing the separator, a
   * number that is not whole, a literal outside its set, and a payload over
   * the byte limit.
   */
  pack(state: State): string
  /**
   * Read data back, or `undefined` if it does not belong to this schema.
   *
   * `undefined` rather than raising, because data from an older deployment
   * reaching a newer handler is ordinary rather than exceptional — a bot is
   * long-lived and its buttons outlive its releases.
   */
  unpack(data: string): State | undefined
  /** Whether data belongs to this schema. */
  matches(data: string): boolean
  /** A button carrying this state, with the text to show on it. */
  button(text: string, state: State): InlineKeyboardButton
  /** Read data back, change some fields, and pack it again. */
  repack(data: string, changes: Partial<State>): string
  /** A filter matching queries whose data belongs to this schema. */
  readonly filter: (context: { readonly data?: string | undefined }) => boolean
}

/**
 * Define a schema.
 *
 * The name is what separates one schema's buttons from another's, and it is
 * compared exactly: two schemas with the same name would each accept the
 * other's data and read it as their own fields.
 */
export function defineCallbackData(name: string): CallbackData<Record<never, never>> {
  checkToken('name', name)

  return build(name, [])
}

function build<State extends Record<string, CallbackValue>>(
  name: string,
  fields: readonly FieldSpec[],
): CallbackData<State> {
  const declare = (spec: FieldSpec): CallbackData<never> => {
    checkToken('field name', spec.key)
    if (fields.some((one) => one.key === spec.key)) {
      throw new ValidationError(`the field '${spec.key}' is already declared on '${name}'`)
    }

    return build(name, [...fields, spec]) as CallbackData<never>
  }

  const pack = (state: State): string => {
    const parts: string[] = [name]

    for (const field of fields) {
      parts.push(encode(field, (state as Record<string, CallbackValue | undefined>)[field.key]))
    }

    const packed = parts.join(SEPARATOR)
    const size = byteLength(packed)

    if (size > CALLBACK_DATA_LIMIT) {
      throw new CallbackDataTooLong(
        `callback data is ${size} bytes of UTF-8 and Telegram carries ${CALLBACK_DATA_LIMIT}: ${JSON.stringify(packed)}`,
      )
    }

    return packed
  }

  const unpack = (data: string): State | undefined => {
    const parts = data.split(SEPARATOR)
    if (parts[0] !== name) return undefined
    // An older button with fewer fields, or a newer one with more, is not this
    // schema's: reading it would produce a state with fields missing or extra.
    if (parts.length !== fields.length + 1) return undefined

    const state: Record<string, CallbackValue> = {}
    for (const [index, field] of fields.entries()) {
      const decoded = decode(field, parts[index + 1] as string)
      if (decoded === undefined) return undefined

      state[field.key] = decoded
    }

    return state as State
  }

  return {
    name,
    fields,
    string: (key) => declare({ key, kind: 'string' }) as never,
    number: (key) => declare({ key, kind: 'number' }) as never,
    boolean: (key) => declare({ key, kind: 'boolean' }) as never,
    literal: (key, values) => {
      if (values.length === 0) {
        throw new ValidationError(`the literal field '${key}' has no values to choose from`)
      }
      for (const value of values) checkToken('literal value', value)

      return declare({ key, kind: 'literal', values: [...values] }) as never
    },
    pack,
    unpack,
    matches: (data) => unpack(data) !== undefined,
    button: (text, state) => ({ text, callback_data: pack(state) }),
    repack: (data, changes) => {
      const current = unpack(data)
      if (current === undefined) {
        throw new CallbackDataInvalid(
          `this data does not belong to '${name}': ${JSON.stringify(data)}`,
        )
      }

      return pack({ ...current, ...changes })
    },
    filter: (context) => context.data !== undefined && unpack(context.data) !== undefined,
  }
}

/** Write one field's value. */
function encode(field: FieldSpec, value: CallbackValue | undefined): string {
  if (value === undefined) {
    throw new ValidationError(`the field '${field.key}' has no value`)
  }

  switch (field.kind) {
    case 'string': {
      if (typeof value !== 'string') {
        throw new ValidationError(`the field '${field.key}' holds text, not ${typeof value}`)
      }
      checkToken(`value for '${field.key}'`, value)

      return value
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
        throw new ValidationError(
          `the field '${field.key}' holds a whole number, not ${JSON.stringify(value)}`,
        )
      }

      return String(value)
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        throw new ValidationError(`the field '${field.key}' holds yes or no, not ${typeof value}`)
      }

      return value ? '1' : '0'
    }
    default: {
      const index = field.values?.indexOf(String(value)) ?? -1
      if (index < 0) {
        throw new ValidationError(
          `the field '${field.key}' holds one of ${field.values?.join(', ')}, not ${JSON.stringify(value)}`,
        )
      }

      // Written as its position, so a long value costs the same as a short one.
      return String(index)
    }
  }
}

/** Read one field's value, or `undefined` if the text is not one. */
function decode(field: FieldSpec, text: string): CallbackValue | undefined {
  switch (field.kind) {
    case 'string':
      return text
    case 'number': {
      if (!/^-?\d+$/.test(text)) return undefined
      const value = Number(text)

      return Number.isSafeInteger(value) ? value : undefined
    }
    case 'boolean':
      return text === '1' ? true : text === '0' ? false : undefined
    default: {
      if (!/^\d+$/.test(text)) return undefined

      return field.values?.[Number(text)]
    }
  }
}
