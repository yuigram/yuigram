// SPDX-License-Identifier: MPL-2.0

/**
 * A voice note's waveform, between the bytes Telegram keeps and the values
 * they stand for.
 *
 * Telegram stores a waveform as values from 0 to 31, five bits each, packed
 * one after another from the lowest bit of the first byte upwards. A message
 * carries the packed bytes in its audio attribute; a client drawing the
 * waveform wants the values, and one sending a voice note it recorded has the
 * values and must pack them.
 */

import { ValidationError } from '@yuigram/core'

/** The largest value one sample can hold. */
const MAX = 31

/** Bits per sample. */
const WIDTH = 5

/**
 * The values packed bytes stand for.
 *
 * As many as whole five-bit samples the bytes hold: bits left over at the end
 * make no sample, since the encoder pads with zeros rather than writing one.
 */
export function decodeWaveform(bytes: Uint8Array): number[] {
  const count = Math.floor((bytes.length * 8) / WIDTH)
  const values: number[] = []

  for (let index = 0; index < count; index += 1) {
    const bit = index * WIDTH
    const byte = bit >> 3
    const shift = bit & 7
    // Two bytes at most: five bits starting at any of eight positions reach
    // at most into the next byte. The next is absent past the end.
    const window = (bytes[byte] as number) | ((bytes[byte + 1] ?? 0) << 8)

    values.push((window >> shift) & MAX)
  }

  return values
}

/**
 * Pack values into the bytes Telegram keeps.
 *
 * Each value must be a whole number from 0 to 31. Refused otherwise rather
 * than masked: a sample of 40 truncated to 8 draws a different voice note, and
 * the caller holding the value is the one who can scale it.
 */
export function encodeWaveform(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(Math.ceil((values.length * WIDTH) / 8))

  values.forEach((value, index) => {
    if (!Number.isInteger(value) || value < 0 || value > MAX) {
      throw new ValidationError(
        `waveform sample ${index} is ${value}; samples are whole numbers from 0 to ${MAX}`,
      )
    }

    const bit = index * WIDTH
    const byte = bit >> 3
    const shift = bit & 7
    const spread = value << shift

    bytes[byte] = (bytes[byte] as number) | (spread & 0xff)
    if (spread > 0xff) bytes[byte + 1] = (bytes[byte + 1] as number) | (spread >> 8)
  })

  return bytes
}
