// SPDX-License-Identifier: MPL-2.0

/**
 * Proving a two-factor password to the server.
 *
 * The password itself never leaves the client. The server publishes a group, a
 * pair of salts and its own public value; the client answers with a public
 * value and a proof that it knows the password, and the server can check the
 * proof without being able to derive the password from it.
 *
 * The arithmetic is the SRP primitive. What is here is the part that reads the
 * server's answer: which algorithm it named, whether it supplied everything the
 * proof needs, and turning the result back into the object the method expects.
 *
 * That reading is where a password check is most easily broken, because every
 * failure looks the same from the outside — the server refuses, and refuses
 * again on the next attempt, without saying which half was wrong.
 */

import { ValidationError } from '@yuigram/core'
import { bytesToBigIntBE } from '../crypto/bytes.js'
import { computeSrpProof, type SrpOptions, type SrpParameters } from '../crypto/srp.js'
import type { TypeInputCheckPasswordSRP } from '../generated/api/types/index.js'
import { type TlScope, type TlValue, writeObject } from '../tl/index.js'

/**
 * The one algorithm the protocol defines for a password check.
 *
 * Named in full because the name *is* the specification: two SHA-256 salting
 * rounds around a 100,000-iteration PBKDF2-HMAC-SHA512, then SRP over the group
 * the server supplies. A server naming anything else — including the explicit
 * unknown variant — is describing a scheme this client cannot perform, and
 * guessing at one would produce a proof that fails for reasons nothing reports.
 */
const SUPPORTED_ALGORITHM = 'passwordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow'

/** The parameters a check needs, together with the exchange they belong to. */
export interface PasswordChallenge extends SrpParameters {
  /**
   * The identifier of this exchange.
   *
   * The server keeps its secret exponent against it, so a proof computed for
   * one challenge cannot be replayed against another — and answering with the
   * wrong identifier fails as though the password were wrong.
   */
  readonly srpId: bigint
}

/**
 * Read the challenge out of the server's answer.
 *
 * Refuses rather than falling back. Every branch here is a case where the
 * server did not supply what a proof needs, and the alternative to refusing is
 * sending something that cannot succeed.
 */
export function readPasswordChallenge(value: TlValue): PasswordChallenge {
  if (value._ !== 'account.password') {
    throw new ValidationError(`'${value._}' does not carry password parameters`)
  }

  // `current_algo`, `srp_B` and `srp_id` share the flag that says a password is
  // set, so all three are absent together. Their absence is the server saying
  // there is nothing to prove, which is not a failure to report as one.
  const algorithm = value['current_algo']
  if (algorithm === undefined) {
    throw new ValidationError('no password is set on this account')
  }
  if (typeof algorithm !== 'object' || algorithm === null) {
    throw new ValidationError("'account.password.current_algo' is not a stated algorithm")
  }

  const algo = algorithm as TlValue
  if (algo._ !== SUPPORTED_ALGORITHM) {
    throw new ValidationError(`'${algo._}' is not an algorithm this client can perform`)
  }

  return {
    srpId: readLong(value, 'srp_id'),
    gB: bytesToBigIntBE(readNonEmptyBytes(value, 'srp_B')),
    p: bytesToBigIntBE(readNonEmptyBytes(algo, 'p')),
    g: BigInt(readInt(algo, 'g')),
    salt1: readBytes(algo, 'salt1'),
    salt2: readBytes(algo, 'salt2'),
  }
}

/**
 * Answer a password challenge.
 *
 * The password is taken as bytes rather than text wherever the caller already
 * has them. A string is encoded as UTF-8 and otherwise left exactly as given:
 * the protocol defines no normalization, and trimming or reordering it here
 * would lock out every password that ends in a space or carries a combining
 * mark, with no way for the user to discover why.
 *
 * The group is validated inside the proof, with the same checks the handshake
 * applies. A password check over an attacker-chosen group proves nothing, so
 * there is no path through this function that skips them.
 */
/**
 * The same proof, in the shape a generated method accepts.
 *
 * Two functions rather than one because the two public surfaces describe this
 * value differently to the type system: the untyped hatch takes a `TlValue`,
 * and a generated method takes the interface the schema names. The proof itself
 * is computed once, in {@link computeSrpProof} — only the literal around it
 * differs.
 */
export async function passwordProof(
  password: string | Uint8Array,
  challenge: PasswordChallenge,
  options: SrpOptions = {},
): Promise<TypeInputCheckPasswordSRP> {
  const proof = await computeSrpProof(encode(password), challenge, options)

  return {
    _: 'inputCheckPasswordSRP',
    srp_id: challenge.srpId,
    A: proof.a,
    M1: proof.m1,
  }
}

export async function answerPasswordChallenge(
  password: string | Uint8Array,
  challenge: PasswordChallenge,
  options: SrpOptions = {},
): Promise<TlValue> {
  const proof = await computeSrpProof(encode(password), challenge, options)

  return {
    _: 'inputCheckPasswordSRP',
    srp_id: challenge.srpId,
    A: proof.a,
    M1: proof.m1,
  }
}

/**
 * The `auth.checkPassword` query for a password and a challenge.
 *
 * Encoded here so that the proof and the call that carries it are built
 * together: the proof is only valid for the exchange the challenge names, and
 * pairing them at the call site is one more place to pair them wrongly.
 */
export async function checkPassword(
  password: string | Uint8Array,
  challenge: PasswordChallenge,
  scope: TlScope,
  options: SrpOptions = {},
): Promise<Uint8Array> {
  return writeObject(
    {
      _: 'auth.checkPassword',
      password: await answerPasswordChallenge(password, challenge, options),
    },
    scope,
  )
}

function encode(password: string | Uint8Array): Uint8Array {
  return typeof password === 'string' ? new TextEncoder().encode(password) : password
}

function readLong(value: TlValue, field: string): bigint {
  const raw = value[field]
  if (typeof raw !== 'bigint') {
    throw new ValidationError(`'${value._}.${field}' must be a 64-bit integer`)
  }
  return raw
}

function readInt(value: TlValue, field: string): number {
  const raw = value[field]
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    throw new ValidationError(`'${value._}.${field}' must be a 32-bit integer`)
  }
  return raw
}

function readBytes(value: TlValue, field: string): Uint8Array {
  const raw = value[field]
  if (!(raw instanceof Uint8Array)) {
    throw new ValidationError(`'${value._}.${field}' must be a byte string`)
  }
  return raw
}

/**
 * Read a field that is meaningless when empty.
 *
 * An empty `p` or `srp_B` reads as zero, and zero passes through the group
 * checks in ways that are hard to reason about. Refusing the empty case here
 * keeps those checks working on values that are actually numbers.
 */
function readNonEmptyBytes(value: TlValue, field: string): Uint8Array {
  const raw = readBytes(value, field)
  if (raw.length === 0) {
    throw new ValidationError(`'${value._}.${field}' is empty`)
  }
  return raw
}
