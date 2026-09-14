/**
 * Primality testing and Diffie-Hellman parameter validation.
 *
 * The server chooses the DH parameters, so the client has to check them. An
 * unchecked `dh_prime` is the difference between a key exchange and a key
 * exchange an intermediary can read, which is why every condition in
 * `docs/mtproto.md` §5.2 is enforced here and none of them takes an option.
 *
 * **No prime is built into this file.** The validator checks whatever arrives.
 * Hardcoding the well-known prime would only invite replacing the check with a
 * comparison against it, which is the failure the check exists to prevent.
 */

import { ValidationError } from '@yuigram/core'
import { bitLength, modPow } from './bigint.js'
import { bigIntToBytesBE } from './bytes.js'
import { toHex } from './encoding.js'
import { sha256 } from './hash.js'
import { randomBigIntBelow } from './random.js'

/** Rounds that put a false positive below 4^-64. */
const DEFAULT_ROUNDS = 64

/** Trial division catches most composites before any exponentiation. */
const SMALL_PRIMES: readonly bigint[] = [
  2n,
  3n,
  5n,
  7n,
  11n,
  13n,
  17n,
  19n,
  23n,
  29n,
  31n,
  37n,
  41n,
  43n,
  47n,
  53n,
  59n,
  61n,
  67n,
  71n,
  73n,
  79n,
  83n,
  89n,
  97n,
  101n,
  103n,
  107n,
  109n,
  113n,
  127n,
  131n,
  137n,
  139n,
  149n,
  151n,
  157n,
  163n,
  167n,
  173n,
  179n,
  181n,
  191n,
  193n,
  197n,
  199n,
  211n,
  223n,
  227n,
  229n,
  233n,
  239n,
  241n,
  251n,
]

/** Generators Telegram uses, with the congruence each one requires of `p`. */
const GENERATOR_CONDITIONS: ReadonlyMap<bigint, (p: bigint) => boolean> = new Map([
  [2n, (p: bigint) => p % 8n === 7n],
  [3n, (p: bigint) => p % 3n === 2n],
  [4n, () => true],
  [5n, (p: bigint) => p % 5n === 1n || p % 5n === 4n],
  [6n, (p: bigint) => p % 24n === 19n || p % 24n === 23n],
  [7n, (p: bigint) => p % 7n === 3n || p % 7n === 5n || p % 7n === 6n],
])

/**
 * Lower bound the protocol places on a DH public value, beyond `1 < x < p-1`.
 *
 * Values near either end of the range leak information about the shared secret,
 * so the usable window is narrowed by 2^1984 at both ends.
 */
const DH_MARGIN = 1n << 1984n

/**
 * Miller-Rabin, with trial division first.
 *
 * A general primality routine, so the round count is a parameter. The
 * protocol's own check is {@link isSafePrime}, which fixes it — see there.
 */
export function isProbablePrime(value: bigint, rounds: number = DEFAULT_ROUNDS): boolean {
  if (value < 2n) return false

  for (const small of SMALL_PRIMES) {
    if (value === small) return true
    if (value % small === 0n) return false
  }

  // value - 1 = 2^shift * odd
  let shift = 0n
  let odd = value - 1n
  while ((odd & 1n) === 0n) {
    odd >>= 1n
    shift += 1n
  }

  const upper = value - 3n
  for (let round = 0; round < rounds; round += 1) {
    const base = randomBigIntBelow(upper) + 2n
    let witness = modPow(base, odd, value)
    if (witness === 1n || witness === value - 1n) continue

    let composite = true
    for (let step = 1n; step < shift; step += 1n) {
      witness = (witness * witness) % value
      if (witness === value - 1n) {
        composite = false
        break
      }
    }

    if (composite) return false
  }

  return true
}

/**
 * Whether `p` is prime and `(p - 1) / 2` is prime.
 *
 * The round count is **not** a parameter. This is the check the DH handshake
 * depends on, and its input is chosen by the server, so the adversarial bound
 * is the one that applies. A caller able to lower it could turn a mandatory
 * check into a formality without the call site showing that it had.
 */
export function isSafePrime(p: bigint): boolean {
  if (p < 5n) return false
  if ((p & 1n) === 0n) return false

  return isProbablePrime(p, DEFAULT_ROUNDS) && isProbablePrime((p - 1n) / 2n, DEFAULT_ROUNDS)
}

/**
 * Outcomes of a completed full validation, keyed by the prime's digest.
 *
 * Validating a 2048-bit safe prime costs real time and sits on the connection
 * path, and the same prime arrives on every connection. Only the result of a
 * finished check is recorded — an absent digest means the full check runs. The
 * map is module-private with no way to seed it, so it can shorten a repeated
 * check and cannot stand in for a first one.
 */
const validated = new Map<string, boolean>()

/** DH parameters as the server offers them. */
export interface DhParameters {
  /** The prime modulus. */
  readonly p: bigint
  /** The generator. */
  readonly g: bigint
}

/**
 * Enforce every condition the protocol places on the DH parameters.
 *
 * Throws on the first failure, naming the condition. There is no option that
 * relaxes any of them: a switch that disables a security check is a switch that
 * ends up disabled in production.
 */
export function validateDhParameters({ p, g }: DhParameters): void {
  const bits = bitLength(p)
  if (bits !== 2048) {
    throw new ValidationError(`dh_prime must be 2048 bits, measured ${bits}`)
  }

  const condition = GENERATOR_CONDITIONS.get(g)
  if (condition === undefined) {
    throw new ValidationError(`dh generator must be one of 2, 3, 4, 5, 6, 7, received ${g}`)
  }

  if (!condition(p)) {
    throw new ValidationError(
      `dh_prime does not satisfy the congruence required for generator ${g}`,
    )
  }

  const digest = toHex(sha256(bigIntToBytesBE(p, 256)))
  const remembered = validated.get(digest)

  if (remembered === undefined) {
    const safe = isSafePrime(p)
    validated.set(digest, safe)
    if (!safe) throw new ValidationError('dh_prime is not a safe prime')
    return
  }

  if (!remembered) throw new ValidationError('dh_prime is not a safe prime')
}

/**
 * Enforce the bounds on a DH public value.
 *
 * Both the plain range and the 2^1984 margin, because a value inside the range
 * but close to either end narrows the shared secret enough to matter.
 */
export function validateDhPublicKey(value: bigint, p: bigint): void {
  if (value <= 1n || value >= p - 1n) {
    throw new ValidationError('dh public value is outside (1, p - 1)')
  }

  if (value <= DH_MARGIN || value >= p - DH_MARGIN) {
    throw new ValidationError('dh public value is within 2^1984 of an endpoint')
  }
}

/** Whether a DH public value satisfies the bounds, without throwing. */
export function isValidDhPublicKey(value: bigint, p: bigint): boolean {
  return value > 1n && value < p - 1n && value > DH_MARGIN && value < p - DH_MARGIN
}
