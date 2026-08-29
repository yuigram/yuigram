/**
 * CRC32, for the full framing's integrity check.
 *
 * The standard polynomial, table-driven. Deliberately local to the transport:
 * the schema generator computes constructor identifiers with the same
 * algorithm, but that runs at build time in a tool the published package does
 * not contain, and a shared module would couple the runtime to it for twenty
 * lines of arithmetic.
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
