/**
 * SRP 6a, Telegram's variant.
 *
 * Used to prove knowledge of a two-factor password without sending it. The
 * algorithm identifier the server advertises for this is
 * `passwordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow`, and the
 * name is the specification: two SHA-256 salting rounds around a
 * 100,000-iteration PBKDF2-HMAC-SHA512, then standard SRP over a 2048-bit
 * group.
 *
 * **Every integer is padded to 256 bytes before it is hashed or concatenated**,
 * including the generator, which spends 255 of those bytes as zeros. Omitting
 * the padding produces an `M1` the server rejects with no indication of why,
 * which is the most likely way to get this wrong.
 *
 * The group parameters arrive from the server and are validated with the same
 * checks the handshake applies. Skipping them because "it is only a password
 * check" would be a real vulnerability: an attacker-chosen group defeats the
 * proof.
 */

import { ValidationError } from '@yuigram/core'
import { backend } from './backend.js'
import { mod, modPow } from './bigint.js'
import { bigIntToBytesBE, bytesToBigIntBE, xorBytes } from './bytes.js'
import { sha256 } from './hash.js'
import { isValidDhPublicKey, validateDhParameters, validateDhPublicKey } from './primes.js'
import { randomBytes } from './random.js'

/** Every SRP integer is hashed at this width. */
const OPERAND_SIZE = 256
/** PBKDF2 rounds the algorithm identifier names. */
const PBKDF2_ITERATIONS = 100_000
/** PBKDF2 output width, in bytes. */
const PBKDF2_LENGTH = 64
/** Attempts to draw an `a` whose `g_a` passes validation. */
const MAX_ATTEMPTS = 16

/** The group and salts the server supplies for a password check. */
export interface SrpParameters {
  /** Group prime. */
  readonly p: bigint
  /** Group generator. */
  readonly g: bigint
  /** First salt, from the server's KDF parameters. */
  readonly salt1: Uint8Array
  /** Second salt, from the server's KDF parameters. */
  readonly salt2: Uint8Array
  /** The server's public value, `g_b`. */
  readonly gB: bigint
}

/** What the client sends back: `InputCheckPasswordSRP` without the id. */
export interface SrpProof {
  /** The client's public value, `g_a`, at 256 bytes. */
  readonly a: Uint8Array
  /** The proof of knowledge, 32 bytes. */
  readonly m1: Uint8Array
}

/** Options that let a test control the two sources of cost and entropy. */
export interface SrpOptions {
  /** Randomness for the secret exponent. */
  readonly random?: (length: number) => Uint8Array
  /** The stretching step, so a test can substitute a cheaper one. */
  readonly pbkdf2?: Pbkdf2
}

/**
 * The stretching step, isolated so it can be named in one place.
 *
 * Asynchronous, because it is a hundred thousand iterations and every runtime's
 * own implementation of it is. A caller supplying one may return the bytes
 * directly; the result is awaited either way.
 */
export type Pbkdf2 = (
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  length: number,
) => Promise<Uint8Array> | Uint8Array

const defaultPbkdf2: Pbkdf2 = (password, salt, iterations, length) =>
  backend.pbkdf2(password, salt, iterations, length)

/** Pad an integer to the width every SRP hash expects. */
function operand(value: bigint): Uint8Array {
  return bigIntToBytesBE(value, OPERAND_SIZE)
}

/** `SH(data, salt) = SHA256(salt ‖ data ‖ salt)`. */
function saltedHash(data: Uint8Array, salt: Uint8Array): Uint8Array {
  return sha256(salt, data, salt)
}

/**
 * `PH2(password, salt1, salt2)` — the value SRP calls `x`.
 *
 * The same derivation produces the verifier when a password is set and the
 * proof when one is checked, so it is named rather than inlined.
 */
export async function passwordHash(
  password: Uint8Array,
  salt1: Uint8Array,
  salt2: Uint8Array,
  pbkdf2: Pbkdf2 = defaultPbkdf2,
): Promise<Uint8Array> {
  const first = saltedHash(saltedHash(password, salt1), salt2)

  return saltedHash(await pbkdf2(first, salt1, PBKDF2_ITERATIONS, PBKDF2_LENGTH), salt2)
}

/**
 * Produce the proof for a password check.
 *
 * The secret exponent and the derived session key never leave this function:
 * what comes back is what the protocol puts on the wire, and nothing else.
 */
export async function computeSrpProof(
  password: Uint8Array,
  parameters: SrpParameters,
  options: SrpOptions = {},
): Promise<SrpProof> {
  const { p, g, salt1, salt2, gB } = parameters
  const random = options.random ?? randomBytes
  const pbkdf2 = options.pbkdf2 ?? defaultPbkdf2

  validateDhParameters({ p, g })
  validateDhPublicKey(gB, p)

  const x = bytesToBigIntBE(await passwordHash(password, salt1, salt2, pbkdf2))
  const v = modPow(g, x, p)
  const k = bytesToBigIntBE(sha256(operand(p), operand(g)))
  const t = mod(gB - mod(k * v, p), p)

  // A server that answers with exactly `k·v` drives the base of the final
  // exponentiation to zero, so the shared secret becomes zero whatever the
  // client's exponent and the proof stops depending on the password at all.
  // SRP-6a requires the client to abort here rather than continue.
  if (t === 0n) {
    throw new ValidationError('srp server value collapses the shared secret')
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const a = bytesToBigIntBE(random(OPERAND_SIZE))
    const gA = modPow(g, a, p)
    if (!isValidDhPublicKey(gA, p)) continue

    const u = bytesToBigIntBE(sha256(operand(gA), operand(gB)))
    // `u` is a hash, so zero is unreachable in practice; the protocol still
    // requires the check, and an unchecked zero would remove `g_b` from the
    // exponent entirely.
    if (u === 0n) continue

    const kA = sha256(operand(modPow(t, a + u * x, p)))

    return {
      a: operand(gA),
      m1: sha256(
        xorBytes(sha256(operand(p)), sha256(operand(g))),
        sha256(salt1),
        sha256(salt2),
        operand(gA),
        operand(gB),
        kA,
      ),
    }
  }

  throw new ValidationError('failed to draw a valid srp public value')
}
