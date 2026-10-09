// SPDX-License-Identifier: MPL-2.0

/**
 * The decoder against inputs nobody chose.
 *
 * `tl-adversarial.test.ts` names the ways a decoder is known to fail and
 * constrains each one. That is the stronger evidence where it applies, and it
 * only applies to the failures somebody thought of. `docs/security.md` §10 asks
 * for the decoder to be *fuzzed* for bounds and allocation limits, which is a
 * different guarantee: not that the enumerated paths are guarded, but that no
 * input at all reaches a path that is not.
 *
 * The property under test is the one the session layer relies on. Bytes arrive
 * from a datacenter over a channel this client did not choose, and every one of
 * them is decoded before anything about the sender has been established. So:
 *
 * > For any bytes, decoding either produces a value or raises `TlReadError`.
 *
 * Anything else — a `RangeError` from an oversized allocation, a `TypeError`
 * from an undefined field spec, a stack overflow from unbounded recursion — is
 * a decoder that can be driven off its own contract by a hostile server, and
 * the session layer's `catch` would mistake it for a protocol error.
 *
 * Generation is seeded, so a failure is reproducible from the seed printed with
 * it rather than being a run nobody can repeat. The seeds are fixed rather than
 * drawn from the clock: a suite that tests something different on every run
 * fails somewhere other than where the change was made.
 */

import { describe, expect, it } from 'vitest'
import { REGISTRY as API } from '../src/generated/api/registry.js'
import { ENTRIES as API_ENTRIES } from '../src/generated/api/tables/index.js'
import { REGISTRY as CORE } from '../src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../src/generated/mtproto/registry.js'
import { ENTRIES as MTPROTO_ENTRIES } from '../src/generated/mtproto/tables/index.js'
import { readObject, TlReadError, TlReader } from '../src/tl/reader.js'
import { TlScope } from '../src/tl/registry.js'

/** What an encrypted session decodes with. */
const SESSION = new TlScope('api', [CORE, API])
/** What the plaintext handshake channel decodes with, which is far narrower. */
const HANDSHAKE = new TlScope('mtproto', [CORE, MTPROTO])

/**
 * A small deterministic generator.
 *
 * `Math.random` cannot be seeded, and a fuzz case that cannot be replayed is a
 * bug report nobody can act on. xorshift32 is not a source anything
 * cryptographic may use, and nothing here is: these bytes are input to a parser,
 * not key material.
 */
function generator(seed: number): () => number {
  let state = seed | 0 || 1

  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5

    return state >>> 0
  }
}

function randomBytes(next: () => number, length: number): Uint8Array {
  return Uint8Array.from({ length }, () => next() & 0xff)
}

/** Write a constructor identifier at the front, where the decoder looks for one. */
function withIdentifier(id: number, rest: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(4 + rest.length)
  new DataView(bytes.buffer).setUint32(0, id >>> 0, true)
  bytes.set(rest, 4)

  return bytes
}

/**
 * Decode, and report anything that is not the contract.
 *
 * Returns the offending error rather than asserting, so a failure names the
 * input that produced it instead of only the expectation that missed.
 */
function offence(bytes: Uint8Array, scope: TlScope): Error | undefined {
  try {
    readObject(bytes, scope)

    return undefined
  } catch (error) {
    if (error instanceof TlReadError) return undefined

    return error instanceof Error ? error : new Error(String(error))
  }
}

/** Every case reports the seed and the bytes, so a failure is reproducible. */
function describeInput(seed: number, bytes: Uint8Array): string {
  const hex = [...bytes.subarray(0, 64)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

  return `seed ${seed}, ${bytes.length} bytes: ${hex}${bytes.length > 64 ? '…' : ''}`
}

const SEEDS = [1, 2, 3, 0x5eed, 0x1234_5678, 0x7fff_ffff] as const
const PER_SEED = 400

describe('decoding bytes nobody chose', () => {
  it('answers arbitrary input with a value or a read error', () => {
    for (const seed of SEEDS) {
      const next = generator(seed)

      for (let round = 0; round < PER_SEED; round += 1) {
        const bytes = randomBytes(next, next() % 512)
        const failure = offence(bytes, SESSION)

        expect(failure?.message, describeInput(seed, bytes)).toBeUndefined()
      }
    }
  })

  it('answers input that opens with a real constructor the same way', () => {
    // Uniform noise almost never names a constructor, so it stops at the first
    // four bytes and proves little about what lies beyond them. Prefixing a
    // real identifier is what drives the generated field specs — conditionals,
    // vectors, nested bare types — with a body that means nothing.
    for (const seed of SEEDS) {
      const next = generator(seed)

      for (let round = 0; round < PER_SEED; round += 1) {
        const entry = API_ENTRIES[next() % API_ENTRIES.length]
        if (entry === undefined) continue

        const bytes = withIdentifier(entry.id, randomBytes(next, next() % 256))
        const failure = offence(bytes, SESSION)

        expect(failure?.message, `${entry.n}: ${describeInput(seed, bytes)}`).toBeUndefined()
      }
    }
  })

  it('holds on the channel that decodes before a key exists', () => {
    // The plaintext handshake is the one place bytes are decoded with no
    // authentication behind them at all, so its table is the one an attacker
    // reaches first and for free.
    for (const seed of SEEDS) {
      const next = generator(seed)

      for (let round = 0; round < PER_SEED; round += 1) {
        const entry = MTPROTO_ENTRIES[next() % MTPROTO_ENTRIES.length]
        if (entry === undefined) continue

        const bytes = withIdentifier(entry.id, randomBytes(next, next() % 256))
        const failure = offence(bytes, HANDSHAKE)

        expect(failure?.message, `${entry.n}: ${describeInput(seed, bytes)}`).toBeUndefined()
      }
    }
  })

  it('holds when a length field is replaced with a hostile one', () => {
    // The allocation limit specifically. A vector count or a string length is
    // the only thing in a TL body that decides how much memory a few bytes ask
    // for, so every four-byte window is tried as the largest value it can hold.
    const extremes = [0xffff_ffff, 0x7fff_ffff, 0x8000_0000, 0x0fff_ffff]

    for (const seed of SEEDS) {
      const next = generator(seed)

      for (let round = 0; round < 100; round += 1) {
        const entry = API_ENTRIES[next() % API_ENTRIES.length]
        if (entry === undefined) continue

        const body = randomBytes(next, 64)
        const at = (next() % 15) * 4
        const extreme = extremes[next() % extremes.length] ?? 0xffff_ffff
        new DataView(body.buffer).setUint32(at, extreme, true)

        const bytes = withIdentifier(entry.id, body)
        const failure = offence(bytes, SESSION)

        expect(failure?.message, `${entry.n}: ${describeInput(seed, bytes)}`).toBeUndefined()
      }
    }
  })

  it('holds when input is nested as deeply as it can be made to go', () => {
    // Depth is a bound too, and one a generator over random bytes does not
    // reach: chaining sixty-four identifiers by chance does not happen. Built
    // rather than drawn, then — a run of one identifier is what a body of
    // nested bare objects looks like on the wire.
    for (const entry of API_ENTRIES.slice(0, 200)) {
      const repeats = 4096
      const bytes = new Uint8Array(4 * repeats)
      const view = new DataView(bytes.buffer)
      for (let at = 0; at < repeats; at += 1) view.setUint32(at * 4, entry.id >>> 0, true)

      const failure = offence(bytes, SESSION)
      expect(failure?.message, `${entry.n} repeated ${repeats} times`).toBeUndefined()
    }
  })

  it('refuses a read of negative length', () => {
    // No byte string reaches this: every internal bound is a literal or comes
    // from an unsigned read, so a count cannot arrive negative from the wire.
    // The guard is on the public reader, where a caller's arithmetic can, and
    // it is the one part of the bound a generator over bytes cannot hold.
    const reader = new TlReader(Uint8Array.of(1, 2, 3, 4), SESSION)

    expect(() => reader.raw(-1)).toThrow(TlReadError)
    expect(() => reader.raw(-1)).toThrow(/negative length/)
  })

  it('holds when a valid encoding is corrupted one byte at a time', () => {
    // A message that was well formed until something changed it: a flipped bit
    // in flight, a truncating proxy, a server sending a layer this build does
    // not have. Closer to what actually goes wrong than uniform noise.
    const ping = Uint8Array.from([0xec, 0x77, 0xbe, 0x7a, ...new Uint8Array(8)])

    for (const position of ping.keys()) {
      for (const mask of [0x01, 0x80, 0xff]) {
        const corrupted = Uint8Array.from(ping)
        corrupted[position] = (corrupted[position] ?? 0) ^ mask

        const failure = offence(corrupted, HANDSHAKE)
        expect(failure?.message, `byte ${position} ^ ${mask}`).toBeUndefined()
      }
    }

    for (let cut = 0; cut < ping.length; cut += 1) {
      const failure = offence(ping.subarray(0, cut), HANDSHAKE)
      expect(failure?.message, `truncated to ${cut}`).toBeUndefined()
    }
  })
})
