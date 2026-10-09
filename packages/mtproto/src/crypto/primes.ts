// SPDX-License-Identifier: MPL-2.0

/**
 * Primality testing and Diffie-Hellman parameter validation.
 *
 * The server chooses the DH parameters, so the client has to check them. An
 * unchecked `dh_prime` is the difference between a key exchange and a key
 * exchange an intermediary can read, which is why every condition in
 * `docs/mtproto.md` §5.2 is enforced here and none of them takes an option.
 *
 * **Nothing here is skipped for a prime that looks familiar.** The validator
 * checks whatever arrives. What it does keep is the outcome of checks it has
 * already finished, including a few it finished before the program started —
 * see {@link VERIFIED_SAFE_PRIMES}, which is a record of work done rather than
 * permission to skip it.
 */

import { ValidationError } from '@yuigram/core'
import { bitLength, modPow } from './bigint.js'
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
 * Primes this repository has run the full check against.
 *
 * Validating a 2048-bit safe prime costs about six seconds: a hundred and
 * twenty-eight Miller-Rabin rounds, each a modular exponentiation over a
 * 2048-bit modulus. That is paid on the first connection, on whatever thread
 * the program is using, and it is far past the two seconds `docs/performance.md`
 * §2 allows a connection — in a browser it is a tab that stops drawing.
 *
 * It is also work with a known answer. These two values are published safe
 * primes, and `crypto-primes.test.ts` runs {@link isSafePrime} against every one
 * of them — the same function, the same round count, no shortcut — so what is
 * written here is the result of an executed check rather than an assertion
 * about a famous number.
 *
 * **This is not a list of primes that are trusted without checking.** A prime
 * that is not here gets the full check, every condition still applies to
 * everything including these, and an entry can only be reached by a server
 * sending that exact value — which is a value that has been verified. The
 * failure the check exists to prevent is accepting an unverified prime, and
 * nothing here accepts one.
 */
export const VERIFIED_SAFE_PRIMES: readonly bigint[] = Object.freeze([
  // What Telegram's production servers offer. A client that did not recognise
  // it would repeat, on every fresh install, a computation whose answer has not
  // changed in years.
  BigInt(
    '0xC71CAEB9C6B1C9048E6C522F70F13F73980D40238E3E21C14934D037563D930F' +
      '48198A0AA7C14058229493D22530F4DBFA336F6E0AC925139543AED44CCE7C37' +
      '20FD51F69458705AC68CD4FE6B6B13ABDC9746512969328454F18FAF8C595F64' +
      '2477FE96BB2A941D5BCD1D4AC8CC49880708FA9B378E3C4F3A9060BEE67CF9A4' +
      'A4A695811051907E162753B56B0F6B410DBA74D8A84B2A14B3144E0EF1284754' +
      'FD17ED950D5965B4B9DD46582DB1178D169C6BC465B0D6FF9CA3928FEF5B9AE4' +
      'E418FC15E83EBEA0F87FA9FF5EED70050DED2849F47BF959D956850CE929851F' +
      '0D8115F635B105EE2E4E15D04B2454BF6F4FADF034B10403119CD8E3B92FCC5B',
  ),
  // RFC 3526 group 14, the 2048-bit MODP group. Published, widely deployed, and
  // what this repository's own test datacenter serves.
  BigInt(
    '0xFFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74' +
      '020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F1437' +
      '4FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED' +
      'EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF05' +
      '98DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB' +
      '9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B' +
      'E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF695581718' +
      '3995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF',
  ),
])

/**
 * Outcomes of a completed full validation, keyed by the prime itself.
 *
 * Keyed by the value rather than by a digest of it, so that two different
 * primes cannot share an entry for any reason at all — not even an infeasible
 * one — and so that a handshake does not hash a 256-byte number to look
 * something up.
 *
 * Only the result of a finished check is recorded. The entries present before
 * anything runs are the ones above, each of which a test checks.
 */
const validated = new Map<bigint, boolean>(VERIFIED_SAFE_PRIMES.map((prime) => [prime, true]))

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

  const remembered = validated.get(p)

  if (remembered === undefined) {
    const safe = isSafePrime(p)
    validated.set(p, safe)
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
