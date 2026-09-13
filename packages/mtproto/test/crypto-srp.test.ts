/**
 * SRP 6a, checked against a server written here.
 *
 * The strongest verification available without a Telegram account: the test
 * implements the *other* side of the protocol from the published definition —
 * storing a verifier, choosing `b`, computing `S = (A · v^u)^b mod p`, and
 * deriving the `M1` it expects — and asserts the client's proof matches. Two
 * independent derivations arriving at the same 32 bytes is evidence the client
 * follows the protocol, not merely that it is self-consistent.
 *
 * The password KDF is re-derived here too, so the salting chain is covered by
 * the same argument rather than taken from the implementation.
 */

import { createHash, getDiffieHellman, pbkdf2Sync } from 'node:crypto'
import { ValidationError } from '@yuigram/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { modPow } from '../src/crypto/bigint.js'
import { bigIntToBytesBE, bytesToBigIntBE } from '../src/crypto/bytes.js'
import { validateDhParameters, validateDhPublicKey } from '../src/crypto/primes.js'
import { computeSrpProof, passwordHash, type SrpParameters } from '../src/crypto/srp.js'

/** RFC 3526 group 14 — a real 2048-bit safe prime, taken from the platform. */
const P = bytesToBigIntBE(new Uint8Array(getDiffieHellman('modp14').getPrime()))
const G = 2n

const salt1 = Uint8Array.from({ length: 32 }, (_, index) => index + 1)
const salt2 = Uint8Array.from({ length: 16 }, (_, index) => 100 - index)
const password = new TextEncoder().encode('correct horse battery staple')

/** PBKDF2 at a tenth of a percent of the cost, so the suite stays quick. */
const cheapPbkdf2 = (
  secret: Uint8Array,
  salt: Uint8Array,
  _iterations: number,
  length: number,
): Uint8Array => new Uint8Array(pbkdf2Sync(secret, salt, 1, length, 'sha512'))

function h(...parts: Uint8Array[]): Uint8Array {
  const hash = createHash('sha256')
  for (const part of parts) hash.update(part)

  return new Uint8Array(hash.digest())
}

/** Every SRP integer is hashed at 256 bytes. Written out, not imported. */
function pad(value: bigint): Uint8Array {
  return bigIntToBytesBE(value, 256)
}

function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  return Uint8Array.from(a, (value, index) => value ^ (b[index] ?? 0))
}

/** `SH(data, salt)`, from the definition. */
function sh(data: Uint8Array, salt: Uint8Array): Uint8Array {
  return h(salt, data, salt)
}

/** The client's `x`, derived independently of the implementation. */
function verifierExponent(secret: Uint8Array): bigint {
  const first = sh(sh(secret, salt1), salt2)
  const stretched = cheapPbkdf2(first, salt1, 1, 64)

  return bytesToBigIntBE(sh(stretched, salt2))
}

/** What the server does with the proof it receives. */
function serverCheck(secret: Uint8Array, b: bigint, a: Uint8Array, m1: Uint8Array): boolean {
  const v = modPow(G, verifierExponent(secret), P)
  const k = bytesToBigIntBE(h(pad(P), pad(G)))
  const gB = (modPow(G, b, P) + k * v) % P

  const gA = bytesToBigIntBE(a)
  const u = bytesToBigIntBE(h(pad(gA), pad(gB)))
  const s = modPow((gA * modPow(v, u, P)) % P, b, P)

  const expected = h(xor(h(pad(P)), h(pad(G))), h(salt1), h(salt2), pad(gA), pad(gB), h(pad(s)))

  return Buffer.from(expected).equals(Buffer.from(m1))
}

/** The `g_b` the server would publish for a given secret exponent. */
function serverPublic(secret: Uint8Array, b: bigint): bigint {
  const v = modPow(G, verifierExponent(secret), P)
  const k = bytesToBigIntBE(h(pad(P), pad(G)))

  return (modPow(G, b, P) + k * v) % P
}

function parameters(gB: bigint): SrpParameters {
  return { p: P, g: G, salt1, salt2, gB }
}

beforeAll(async () => {
  // Validating a 2048-bit safe prime is the expensive part, and the module
  // remembers the outcome. Paying for it once here keeps each case quick.
  validateDhParameters({ p: P, g: G })
}, 120_000)

describe('computeSrpProof against an independent server', () => {
  it('produces a proof the server accepts', async () => {
    const b = 0x1234_5678_9abc_def0n * 0x0fed_cba9_8765_4321n
    const gB = serverPublic(password, b)

    const proof = await computeSrpProof(password, parameters(gB), { pbkdf2: cheapPbkdf2 })

    expect(serverCheck(password, b, proof.a, proof.m1)).toBe(true)
  })

  it('produces a proof the server rejects when the password is wrong', async () => {
    const b = 0x0abc_def0_1234_5678n * 3n
    const gB = serverPublic(password, b)

    const wrong = new TextEncoder().encode('correct horse battery stapl')
    const proof = await computeSrpProof(wrong, parameters(gB), { pbkdf2: cheapPbkdf2 })

    expect(serverCheck(password, b, proof.a, proof.m1)).toBe(false)
  })

  it('returns a 256-byte public value and a 32-byte proof', async () => {
    const gB = serverPublic(password, 12_345_678_901n)
    const proof = await computeSrpProof(password, parameters(gB), { pbkdf2: cheapPbkdf2 })

    expect(proof.a.length).toBe(256)
    expect(proof.m1.length).toBe(32)
  })

  it('draws a fresh exponent each time', async () => {
    const gB = serverPublic(password, 999_983n)
    const first = await computeSrpProof(password, parameters(gB), { pbkdf2: cheapPbkdf2 })
    const second = await computeSrpProof(password, parameters(gB), { pbkdf2: cheapPbkdf2 })

    expect([...first.a]).not.toEqual([...second.a])
    expect([...first.m1]).not.toEqual([...second.m1])
  })
})

describe('the password KDF', () => {
  it('matches the salting chain the algorithm name describes', async () => {
    const expected = sh(cheapPbkdf2(sh(sh(password, salt1), salt2), salt1, 1, 64), salt2)

    expect([...(await passwordHash(password, salt1, salt2, cheapPbkdf2))]).toEqual([...expected])
  })

  it('uses 100,000 PBKDF2 iterations and a 64-byte output by default', async () => {
    let seen: { iterations: number; length: number } | undefined

    await passwordHash(password, salt1, salt2, (secret, salt, iterations, length) => {
      seen = { iterations, length }
      return cheapPbkdf2(secret, salt, iterations, length)
    })

    expect(seen).toEqual({ iterations: 100_000, length: 64 })
  })

  it('depends on both salts', async () => {
    const base = [...(await passwordHash(password, salt1, salt2, cheapPbkdf2))]

    expect([...(await passwordHash(password, salt2, salt2, cheapPbkdf2))]).not.toEqual(base)
    expect([...(await passwordHash(password, salt1, salt1, cheapPbkdf2))]).not.toEqual(base)
  })
})

describe('the 256-byte padding rule', () => {
  it('pads the generator to the full width before hashing it', async () => {
    // `g` is a single-digit number that occupies 255 leading zero bytes. An
    // implementation that hashed it as one byte would produce a different `k`
    // and an `M1` the server rejects without saying why, so the width is what
    // this pins.
    const padded = pad(G)

    expect(padded.length).toBe(256)
    expect(padded[255]).toBe(2)
    expect([...padded.subarray(0, 255)]).toEqual(Array(255).fill(0))

    // The proof the client builds must agree with a server that pads this way.
    const b = 7_919n
    const gB = serverPublic(password, b)
    const proof = await computeSrpProof(password, parameters(gB), { pbkdf2: cheapPbkdf2 })

    expect(serverCheck(password, b, proof.a, proof.m1)).toBe(true)
  })
})

describe('parameter validation', () => {
  it('refuses a group that is not a validated safe prime', async () => {
    const gB = serverPublic(password, 11n)

    await expect(
      computeSrpProof(password, { p: 23n, g: 2n, salt1, salt2, gB }, { pbkdf2: cheapPbkdf2 }),
    ).rejects.toThrow(/must be 2048 bits/)
  })

  it('refuses an unsupported generator', async () => {
    await expect(
      computeSrpProof(
        password,
        { p: P, g: 9n, salt1, salt2, gB: P >> 1n },
        { pbkdf2: cheapPbkdf2 },
      ),
    ).rejects.toThrow(/must be one of 2, 3, 4, 5, 6, 7/)
  })

  it('refuses a server public value outside the permitted window', async () => {
    for (const gB of [0n, 1n, P - 1n, 1n << 1984n]) {
      await expect(
        computeSrpProof(password, parameters(gB), { pbkdf2: cheapPbkdf2 }),
      ).rejects.toThrow(ValidationError)
    }
  })

  it('keeps the password out of every rejection message', async () => {
    let message = ''
    try {
      await computeSrpProof(password, parameters(0n), { pbkdf2: cheapPbkdf2 })
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toBe('dh public value is outside (1, p - 1)')
    expect(message).not.toContain('horse')
  })
})

describe('a server value that collapses the shared secret', () => {
  /**
   * `t = g_b − k·v mod p` is the base of the final exponentiation. A server
   * that answers with exactly `k·v` drives it to zero, so `s_a = 0` whatever
   * the client's exponent, `k_a = H(0)` is a constant, and the proof stops
   * depending on the password. The value passes the ordinary range checks — it
   * is a large number in the middle of the group — so SRP-6a requires this
   * case to be recognised on its own.
   */
  async function collapsingServerValue(): Promise<bigint> {
    const x = bytesToBigIntBE(await passwordHash(password, salt1, salt2, cheapPbkdf2))
    const v = modPow(G, x, P)
    const k = bytesToBigIntBE(h(pad(P), pad(G)))

    return (k * v) % P
  }

  it('is a value the ordinary range checks accept', async () => {
    const value = await collapsingServerValue()

    expect(() => validateDhPublicKey(value, P)).not.toThrow()
  })

  it('is refused rather than answered', async () => {
    await expect(
      computeSrpProof(password, parameters(await collapsingServerValue()), { pbkdf2: cheapPbkdf2 }),
    ).rejects.toThrow(/collapses the shared secret/)
  })

  it('leaves an honest server value working', async () => {
    const b = 104_729n
    const gB = serverPublic(password, b)
    const proof = await computeSrpProof(password, parameters(gB), { pbkdf2: cheapPbkdf2 })

    expect(serverCheck(password, b, proof.a, proof.m1)).toBe(true)
  })
})
