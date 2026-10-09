// SPDX-License-Identifier: MIT

/**
 * Binary TL deserialization.
 *
 * Every byte the reader consumes came from the network, so it is treated as
 * hostile input throughout. The reader carries an explicit bound and checks it
 * before every allocation: a hostile length prefix must raise, not reserve two
 * gigabytes. Container nesting is bounded for the same reason.
 *
 * The layout comes from the generated tables rather than from generated code,
 * so the rules below are written once and verified once — against fixed byte
 * vectors, boundary cases and malformed input, rather than only by
 * round-tripping a serializer that might share the same misunderstanding.
 */

import { YuigramError } from '@yuigram/core'
import type { TlRegistry, TlScope } from './registry.js'
import type { TlEntry, TlFieldSpec, TlTypeSpec, TlValue } from './schema.js'

/** Identifier of the boxed vector constructor. */
export const VECTOR_ID = 0x1cb5c415
/** Identifier of `boolTrue`. */
export const BOOL_TRUE_ID = 0x997275b5
/** Identifier of `boolFalse`. */
export const BOOL_FALSE_ID = 0xbc799737

/** Strings of 254 bytes or more carry a three-byte length instead of one. */
const LONG_STRING_MARKER = 0xfe
/** Above this a length is written in the long form. */
const SHORT_STRING_LIMIT = 253
/** Deepest nesting the reader will follow before refusing. */
const MAX_DEPTH = 64

/** A payload the reader refused. */
export class TlReadError extends YuigramError {
  override readonly name = 'TlReadError'
}

/** Reads TL values from a buffer. */
export class TlReader {
  readonly #view: DataView
  readonly #bytes: Uint8Array
  readonly #scope: TlScope
  #offset = 0
  #depth = 0

  constructor(bytes: Uint8Array, scope: TlScope) {
    this.#bytes = bytes
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    this.#scope = scope
  }

  /** Bytes consumed so far. */
  get offset(): number {
    return this.#offset
  }

  /** Bytes not yet consumed. */
  get remaining(): number {
    return this.#bytes.length - this.#offset
  }

  /** Refuse a read that would run past the end of the buffer. */
  #require(count: number, what: string): void {
    if (count < 0) throw new TlReadError(`negative length reading ${what}`)
    if (count > this.remaining) {
      throw new TlReadError(`reading ${what} needs ${count} bytes, ${this.remaining} remain`)
    }
  }

  /** A signed 32-bit integer. */
  int(): number {
    this.#require(4, 'int')
    const value = this.#view.getInt32(this.#offset, true)
    this.#offset += 4
    return value
  }

  /** An unsigned 32-bit integer, used for identifiers and bitfields. */
  uint(): number {
    this.#require(4, 'uint')
    const value = this.#view.getUint32(this.#offset, true)
    this.#offset += 4
    return value
  }

  /** A signed 64-bit integer. */
  long(): bigint {
    this.#require(8, 'long')
    const value = this.#view.getBigInt64(this.#offset, true)
    this.#offset += 8
    return value
  }

  /** An IEEE-754 double. */
  double(): number {
    this.#require(8, 'double')
    const value = this.#view.getFloat64(this.#offset, true)
    this.#offset += 8
    return value
  }

  /** A fixed-width byte string, used by the 128- and 256-bit nonces. */
  raw(length: number): Uint8Array {
    this.#require(length, `${length} raw bytes`)
    const value = this.#bytes.slice(this.#offset, this.#offset + length)
    this.#offset += length
    return value
  }

  /**
   * A length-prefixed byte string.
   *
   * Short form for up to 253 bytes, then a marker and a three-byte length. Both
   * pad the payload to a four-byte boundary.
   */
  bytes(): Uint8Array {
    this.#require(1, 'string length')
    const first = this.#bytes[this.#offset] ?? 0
    this.#offset += 1

    let length: number
    let headerLength: number

    if (first <= SHORT_STRING_LIMIT) {
      length = first
      headerLength = 1
    } else if (first === LONG_STRING_MARKER) {
      this.#require(3, 'long string length')
      length =
        (this.#bytes[this.#offset] ?? 0) |
        ((this.#bytes[this.#offset + 1] ?? 0) << 8) |
        ((this.#bytes[this.#offset + 2] ?? 0) << 16)
      this.#offset += 3
      headerLength = 4
    } else {
      throw new TlReadError(`invalid string length marker 0x${first.toString(16)}`)
    }

    const value = this.raw(length)
    const padding = (4 - ((headerLength + length) % 4)) % 4
    this.#require(padding, 'string padding')
    this.#offset += padding

    return value
  }

  /** A UTF-8 string. */
  string(): string {
    return new TextDecoder('utf-8', { fatal: false }).decode(this.bytes())
  }

  /** A boxed boolean. */
  bool(): boolean {
    const id = this.uint()
    if (id === BOOL_TRUE_ID) return true
    if (id === BOOL_FALSE_ID) return false

    throw new TlReadError(`expected a Bool, found 0x${id.toString(16).padStart(8, '0')}`)
  }

  /**
   * A boxed value.
   *
   * The identifier decides the constructor. An identifier this scope does not
   * carry is refused rather than skipped: on the plaintext handshake channel
   * that is exactly how an API constructor is kept out.
   */
  object(): TlValue {
    const id = this.uint()
    if (id === VECTOR_ID) {
      throw new TlReadError('a bare vector cannot appear where a boxed value is expected')
    }

    const found = this.#scope.find(id)
    if (found === undefined) {
      throw new TlReadError(
        `identifier 0x${id.toString(16).padStart(8, '0')} is not in the ${this.#scope.name} table`,
      )
    }

    return this.entry(found.entry, found.registry)
  }

  /**
   * Read the fields of a known combinator, the identifier already consumed.
   *
   * `owner` is the table the entry came from. Bare references inside it resolve
   * there rather than across the whole scope, because the two schemas share
   * names — `message` is a container element in one and a chat message in the
   * other — and resolving across would decode the wrong shape.
   */
  entry(entry: TlEntry, owner?: TlRegistry): TlValue {
    if (this.#depth >= MAX_DEPTH) {
      throw new TlReadError(`TL nesting deeper than ${MAX_DEPTH} at '${entry.n}'`)
    }

    this.#depth += 1
    try {
      const value: Record<string, unknown> = { _: entry.n }
      const bitfields = new Map<string, number>()

      for (const field of entry.f) {
        this.#field(field, entry, value, bitfields, owner)
      }

      return value as TlValue
    } finally {
      this.#depth -= 1
    }
  }

  /** One field, honouring its conditional bit when it has one. */
  #field(
    field: TlFieldSpec,
    entry: TlEntry,
    value: Record<string, unknown>,
    bitfields: Map<string, number>,
    owner: TlRegistry | undefined,
  ): void {
    if (field.b === 1) {
      bitfields.set(field.n, this.uint())
      return
    }

    if (field.c !== undefined) {
      const flags = bitfields.get(field.c)
      if (flags === undefined) {
        throw new TlReadError(`'${entry.n}' reads '${field.n}' before its bitfield '${field.c}'`)
      }
      if ((flags & (1 << (field.i ?? 0))) === 0) return

      // A `true` field is the bit itself; there is nothing further to read.
      if (field.t === 'true') {
        value[field.n] = true
        return
      }
    }

    if (field.t === undefined) throw new TlReadError(`'${entry.n}' field '${field.n}' has no type`)
    value[field.n] = this.value(field.t, owner)
  }

  /** One value of a described type. */
  value(spec: TlTypeSpec, owner?: TlRegistry): unknown {
    if (typeof spec === 'object') {
      if ('p' in spec) return this.bare(spec.p, owner)
      return this.#vector(spec, owner)
    }

    switch (spec) {
      case 'int':
        return this.int()
      case 'nat':
        return this.uint()
      case 'long':
        return this.long()
      case 'double':
        return this.double()
      case 'string':
        return this.string()
      case 'bytes':
        return this.bytes()
      case 'int128':
        return this.raw(16)
      case 'int256':
        return this.raw(32)
      case 'bool':
        return this.bool()
      case 'true':
        // Only reachable unconditionally, which the schemas never do.
        return true
      case 'obj':
        return this.object()
      case 'opaque':
        throw new TlReadError('an opaque builtin cannot be read from the wire')
    }
  }

  /** A vector, boxed or bare. */
  #vector(
    spec: { readonly v: TlTypeSpec; readonly bare?: 1; readonly len?: number },
    owner: TlRegistry | undefined,
  ): unknown[] {
    if (spec.len !== undefined) {
      return Array.from({ length: spec.len }, () => this.value(spec.v, owner))
    }

    if (spec.bare !== 1) {
      const id = this.uint()
      if (id !== VECTOR_ID) {
        throw new TlReadError(
          `expected a boxed vector, found 0x${id.toString(16).padStart(8, '0')}`,
        )
      }
    }

    const count = this.uint()
    // Every element occupies at least four bytes, so a count beyond that bound
    // is refused before anything is allocated for it.
    if (count > this.remaining / 4) {
      throw new TlReadError(`vector of ${count} cannot fit in ${this.remaining} remaining bytes`)
    }

    const items: unknown[] = []
    for (let index = 0; index < count; index += 1) items.push(this.value(spec.v, owner))
    return items
  }

  /** A bare value: no identifier on the wire, so the table names the shape. */
  bare(name: string, owner?: TlRegistry): TlValue {
    const entry = owner?.byName.get(name) ?? this.#scope.findByName(name)?.entry
    if (entry === undefined) {
      throw new TlReadError(`bare type '${name}' is not in the ${this.#scope.name} table`)
    }

    return this.entry(entry, owner)
  }
}

/**
 * Read one boxed value that accounts for the whole buffer.
 *
 * Trailing bytes are rejected. A payload that decodes and leaves data behind
 * means the sender and this table disagree about the shape, and continuing
 * would hand the caller a value that is right about its prefix and silent about
 * the rest. A caller decoding a stream uses {@link TlReader} directly.
 */
export function readObject(bytes: Uint8Array, scope: TlScope): TlValue {
  const reader = new TlReader(bytes, scope)
  const value = reader.object()

  if (reader.remaining !== 0) {
    throw new TlReadError(`${reader.remaining} bytes remain after the value`)
  }

  return value
}

export type { TlRegistry }
