// SPDX-License-Identifier: MIT

/**
 * CRC32, and the canonical form a TL combinator's identifier is computed from.
 *
 * A constructor id is not arbitrary: it is the CRC32 of the combinator's
 * signature in a specific normalized form. Computing it and comparing against
 * the id the schema declares turns every line of the schema into a checksum
 * over the parser's own reading of it — if the parser misplaces a field or
 * misreads a type, the two disagree and generation stops.
 *
 * The normalization was established against the published schemas: it verifies
 * 2,291 of 2,303 API combinators and 45 of 46 service combinators. The
 * remainder use constructs the rule does not describe, and are handled by
 * {@link canonicalizable} rather than by exception lists.
 */

/** Table for the standard CRC-32 polynomial, built once. */
const TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

/** CRC32 of a byte string, as an unsigned 32-bit value. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc = (crc >>> 8) ^ (TABLE[(crc ^ byte) & 0xff] ?? 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** CRC32 of a string's UTF-8 encoding. */
export function crc32String(text: string): number {
  return crc32(new TextEncoder().encode(text))
}

/**
 * Constructs the rule does not describe.
 *
 * Generic parameters (`{X:Type}`), the bare marker (`%`), builtin bodies (`?`)
 * and repetitions (`4*[ int ]`) all appear in signatures whose published id the
 * canonical form does not reproduce. Rather than listing the twenty combinators
 * by name — which would silently stop covering a twenty-first — they are
 * recognised structurally, and for those the schema's declared id is
 * authoritative.
 */
const EXOTIC = /\{\w+:Type\}|%|\?\s*=|\d+\s*\*\s*\[/

/** Whether a combinator's id can be derived from its signature. */
export function canonicalizable(definition: string): boolean {
  return !EXOTIC.test(definition)
}

/**
 * The signature a combinator's id is the CRC32 of.
 *
 * Three transformations, each of which the published ids require:
 *
 * - **The declared id is removed.** It is the output, not an input.
 * - **`flags.N?true` parameters are dropped.** They occupy no bytes on the
 *   wire — the flag bit is the whole value — so they are not part of the
 *   structure the id identifies.
 * - **`bytes` becomes `string` in a parameter's own type**, because they are
 *   the same wire type and the signature uses the wire name. Not inside a type
 *   argument: `Vector<bytes>` keeps `bytes`, which the published ids confirm.
 *
 * Angle brackets, commas and parentheses then become spaces, and runs of
 * whitespace collapse.
 */
export function canonicalSignature(definition: string): string {
  const withoutId = definition.replace(/^([\w.]+)#[0-9a-fA-F]+/, '$1')

  let signature = withoutId.replace(/;\s*$/, '').trim()
  signature = signature.replace(/\S+:\w+\.\d+\?true(?=\s|$)/g, '')
  signature = signature.replace(/(?<=[:?])bytes(?![\w.])/g, 'string')

  for (const character of ['<', '>', ',', '(', ')']) {
    signature = signature.split(character).join(' ')
  }

  return signature.replace(/\s+/g, ' ').trim()
}

/** The identifier a combinator's signature computes to. */
export function computeId(definition: string): number {
  return crc32String(canonicalSignature(definition))
}
