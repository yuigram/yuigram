// SPDX-License-Identifier: MIT

/**
 * Binary TL serialization.
 *
 * The mirror of the reader, driven by the same generated tables. Writing from
 * the same description the reader consumes is what makes the round-trip
 * property meaningful: the two agree because they read one table, not because
 * two generated functions happened to be written consistently.
 *
 * Bitfields are **computed, not trusted**. A caller supplies the optional
 * fields it wants sent; the writer derives the flag word from which of them are
 * present. A caller-supplied bitfield that disagreed with the payload would
 * produce a message the server discards without explanation.
 */

import { YuigramError } from '@yuigram/core'
import { BOOL_FALSE_ID, BOOL_TRUE_ID, VECTOR_ID } from './reader.js'
import type { TlRegistry, TlScope } from './registry.js'
import type { TlEntry, TlTypeSpec, TlValue } from './schema.js'

/** Strings of 254 bytes or more carry a three-byte length instead of one. */
const LONG_STRING_MARKER = 0xfe
/** Above this a length is written in the long form. */
const SHORT_STRING_LIMIT = 253

/** A value the writer refused. */
export class TlWriteError extends YuigramError {
  override readonly name = 'TlWriteError'
}

/** Accumulates TL bytes. */
export class TlWriter {
  #chunks: Uint8Array[] = []
  #length = 0
  readonly #scope: TlScope

  constructor(scope: TlScope) {
    this.#scope = scope
  }

  /** Bytes written so far. */
  get length(): number {
    return this.#length
  }

  /** Everything written, in one buffer. */
  finish(): Uint8Array {
    const out = new Uint8Array(this.#length)
    let offset = 0
    for (const chunk of this.#chunks) {
      out.set(chunk, offset)
      offset += chunk.length
    }
    return out
  }

  #push(chunk: Uint8Array): void {
    this.#chunks.push(chunk)
    this.#length += chunk.length
  }

  /**
   * A signed 32-bit integer.
   *
   * Range-checked rather than truncated. `setInt32` keeps only the low 32 bits
   * of a wider number, so a caller that overflowed would send a value it never
   * asked for and learn nothing about it.
   */
  int(value: number): void {
    if (!Number.isInteger(value)) {
      throw new TlWriteError(`int must be an integer, received ${value}`)
    }
    if (value < -0x8000_0000 || value > 0x7fff_ffff) {
      throw new TlWriteError(`int out of range: ${value}`)
    }

    const buffer = new Uint8Array(4)
    new DataView(buffer.buffer).setInt32(0, value, true)
    this.#push(buffer)
  }

  /** An unsigned 32-bit integer. */
  uint(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw new TlWriteError(`uint out of range: ${value}`)
    }

    const buffer = new Uint8Array(4)
    new DataView(buffer.buffer).setUint32(0, value >>> 0, true)
    this.#push(buffer)
  }

  /**
   * A signed 64-bit integer.
   *
   * Range-checked for the same reason as {@link TlWriter.int}: `asIntN` wraps a
   * wider value rather than refusing it.
   */
  long(value: bigint): void {
    if (value < -(2n ** 63n) || value > 2n ** 63n - 1n) {
      throw new TlWriteError(`long out of range: ${value}`)
    }

    const buffer = new Uint8Array(8)
    new DataView(buffer.buffer).setBigInt64(0, value, true)
    this.#push(buffer)
  }

  /** An IEEE-754 double. */
  double(value: number): void {
    const buffer = new Uint8Array(8)
    new DataView(buffer.buffer).setFloat64(0, value, true)
    this.#push(buffer)
  }

  /** A fixed-width byte string. */
  raw(value: Uint8Array, expected?: number): void {
    if (expected !== undefined && value.length !== expected) {
      throw new TlWriteError(`expected ${expected} bytes, received ${value.length}`)
    }
    this.#push(value)
  }

  /** A length-prefixed, four-byte-aligned byte string. */
  bytes(value: Uint8Array): void {
    if (value.length <= SHORT_STRING_LIMIT) {
      this.#push(Uint8Array.of(value.length))
      this.#push(value)
      this.#pad((1 + value.length) % 4)
      return
    }

    if (value.length > 0xffffff) {
      throw new TlWriteError(`string of ${value.length} bytes exceeds the TL length field`)
    }

    this.#push(
      Uint8Array.of(
        LONG_STRING_MARKER,
        value.length & 0xff,
        (value.length >>> 8) & 0xff,
        (value.length >>> 16) & 0xff,
      ),
    )
    this.#push(value)
    this.#pad((4 + value.length) % 4)
  }

  /** A UTF-8 string. */
  string(value: string): void {
    this.bytes(new TextEncoder().encode(value))
  }

  #pad(used: number): void {
    const padding = (4 - used) % 4
    if (padding > 0) this.#push(new Uint8Array(padding))
  }

  /** A boxed boolean. */
  bool(value: boolean): void {
    this.uint(value ? BOOL_TRUE_ID : BOOL_FALSE_ID)
  }

  /** A boxed value, identified by its own `_`. */
  object(value: unknown): void {
    const found = this.#entryOf(value)
    this.uint(found.entry.id)
    this.entry(found.entry, value as TlValue, found.registry)
  }

  #entryOf(value: unknown): { entry: TlEntry; registry: TlRegistry } {
    if (typeof value !== 'object' || value === null || !('_' in value)) {
      throw new TlWriteError('a boxed value must carry its constructor in "_"')
    }

    const name = (value as { _: unknown })._
    if (typeof name !== 'string') throw new TlWriteError('"_" must be the constructor name')

    const found = this.#scope.findByName(name)
    if (found === undefined) {
      throw new TlWriteError(`'${name}' is not in the ${this.#scope.name} table`)
    }

    return found
  }

  /** Write a combinator's fields, the identifier already written. */
  entry(entry: TlEntry, value: TlValue, owner?: TlRegistry): void {
    const source = value as unknown as Record<string, unknown>

    for (const field of entry.f) {
      if (field.b === 1) {
        this.uint(this.#bitsFor(field.n, entry, source))
        continue
      }

      if (field.c !== undefined && !present(source[field.n], field.t)) continue
      if (field.c !== undefined && field.t === 'true') continue

      if (field.t === undefined) {
        throw new TlWriteError(`'${entry.n}' field '${field.n}' has no type`)
      }

      this.value(field.t, source[field.n], `${entry.n}.${field.n}`, owner)
    }
  }

  /**
   * The flag word for one bitfield, derived from the payload.
   *
   * Every conditional field naming this bitfield contributes its bit when the
   * value carries it. Anything the caller put in the bitfield's own property is
   * ignored, because the payload is the authority on what is being sent.
   */
  #bitsFor(name: string, entry: TlEntry, source: Record<string, unknown>): number {
    let bits = 0
    for (const field of entry.f) {
      if (field.c !== name || field.i === undefined) continue
      if (present(source[field.n], field.t)) bits |= 1 << field.i
    }
    return bits >>> 0
  }

  /** One value of a described type. */
  value(spec: TlTypeSpec, value: unknown, where: string, owner?: TlRegistry): void {
    if (typeof spec === 'object') {
      if ('p' in spec) {
        this.bare(spec.p, value, where, owner)
        return
      }
      this.#vector(spec, value, where, owner)
      return
    }

    switch (spec) {
      case 'int':
        this.int(expect(value, 'number', where))
        return
      case 'nat':
        this.uint(expect(value, 'number', where))
        return
      case 'long':
        this.long(expect(value, 'bigint', where))
        return
      case 'double':
        this.double(expect(value, 'number', where))
        return
      case 'string':
        this.string(expect(value, 'string', where))
        return
      case 'bytes':
        this.bytes(expectBytes(value, where))
        return
      case 'int128':
        this.raw(expectBytes(value, where), 16)
        return
      case 'int256':
        this.raw(expectBytes(value, where), 32)
        return
      case 'bool':
        this.bool(expect(value, 'boolean', where))
        return
      case 'true':
        // The flag bit carries the value; there is nothing to write.
        return
      case 'obj':
        this.object(value)
        return
      case 'opaque':
        throw new TlWriteError(`an opaque builtin cannot be written (${where})`)
    }
  }

  /** A vector, boxed or bare. */
  #vector(
    spec: { readonly v: TlTypeSpec; readonly bare?: 1; readonly len?: number },
    value: unknown,
    where: string,
    owner: TlRegistry | undefined,
  ): void {
    if (!Array.isArray(value)) throw new TlWriteError(`${where} must be an array`)

    if (spec.len !== undefined) {
      if (value.length !== spec.len) {
        throw new TlWriteError(`${where} must hold exactly ${spec.len} items`)
      }
      for (const item of value) this.value(spec.v, item, where, owner)
      return
    }

    if (spec.bare !== 1) this.uint(VECTOR_ID)
    this.uint(value.length)
    for (const item of value) this.value(spec.v, item, where, owner)
  }

  /** A bare value: the identifier is omitted, so the name must be known. */
  bare(name: string, value: unknown, where: string, owner?: TlRegistry): void {
    // Resolved inside the owning table first, for the same reason the reader
    // does: the two schemas share names for different shapes.
    const entry = owner?.byName.get(name) ?? this.#scope.findByName(name)?.entry
    if (entry === undefined) {
      throw new TlWriteError(
        `bare type '${name}' is not in the ${this.#scope.name} table (${where})`,
      )
    }

    if (typeof value !== 'object' || value === null) {
      throw new TlWriteError(`${where} must be an object`)
    }

    this.entry(entry, value as TlValue, owner)
  }
}

/**
 * Whether an optional field was supplied.
 *
 * A conditional `true` is the one type whose flag bit *is* the value, so
 * `false` there means the bit stays clear and nothing is written. For every
 * other type — `Bool` above all, which 34 API constructors use conditionally —
 * `false` is a value the caller asked to send. Dropping it would turn an
 * explicit "off" into "unspecified", with nothing on the wire to show it had
 * happened.
 */
function present(value: unknown, spec: TlTypeSpec | undefined): boolean {
  if (value === undefined || value === null) return false
  if (value === false && spec === 'true') return false

  return true
}

function expect<T>(value: unknown, type: string, where: string): T {
  if (typeof value !== type) {
    throw new TlWriteError(`${where} must be a ${type}, received ${describe(value)}`)
  }
  return value as T
}

function expectBytes(value: unknown, where: string): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new TlWriteError(`${where} must be a Uint8Array, received ${describe(value)}`)
  }
  return value
}

/** Name a value's type without putting the value itself in the message. */
function describe(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  return typeof value
}

/** Serialize one boxed value. */
export function writeObject(value: unknown, scope: TlScope): Uint8Array {
  const writer = new TlWriter(scope)
  writer.object(value)
  return writer.finish()
}
