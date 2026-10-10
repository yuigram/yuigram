// SPDX-License-Identifier: MIT

/**
 * The shape of a generated codec table.
 *
 * The generator emits data in this form and the reader and writer interpret it.
 * Keys are short because the tables hold roughly 2,300 entries and every byte
 * is repeated across all of them; the meaning is here rather than at each use.
 */

/** How one value is laid out on the wire. */
export type TlTypeSpec =
  /** A primitive the codec handles directly. */
  | 'int'
  | 'long'
  | 'double'
  | 'string'
  | 'bytes'
  | 'int128'
  | 'int256'
  | 'bool'
  | 'true'
  | 'nat'
  /**
   * A boxed value.
   *
   * The reader learns the constructor from the identifier on the wire and the
   * writer from the value's own `_`, so the table does not name it.
   */
  | 'obj'
  /** A builtin the language does not describe; never present on the wire. */
  | 'opaque'
  /** A vector. `bare` omits the `0x1cb5c415` header; `len` fixes the count. */
  | { readonly v: TlTypeSpec; readonly bare?: 1; readonly len?: number }
  /** A bare reference: the value carries no identifier, so the table names it. */
  | { readonly p: string }

/** One field of a combinator. */
export interface TlFieldSpec {
  /** Field name, as the schema writes it. */
  readonly n: string
  /** Set on a `flags:#` bitfield declaration. */
  readonly b?: 1
  /** Layout, absent on a bitfield. */
  readonly t?: TlTypeSpec
  /** Name of the bitfield this field is conditional on. */
  readonly c?: string
  /** Bit index within that bitfield. */
  readonly i?: number
}

/** One combinator. */
export interface TlEntry {
  /** The 32-bit identifier. */
  readonly id: number
  /** Full TL name, including any namespace. */
  readonly n: string
  /** Fields in wire order. */
  readonly f: readonly TlFieldSpec[]
  /** Set on a generic method, whose result is whatever it wrapped. */
  readonly g?: 1
}

/** A decoded TL value. Every one carries the constructor that produced it. */
export interface TlValue {
  readonly _: string
  readonly [field: string]: unknown
}
