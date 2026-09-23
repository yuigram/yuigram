/**
 * The second factor: reading its state, setting it, changing it, taking it off.
 *
 * Signing in with a password already works — `Account.signInWithPassword`
 * answers a challenge without the password leaving the process. Managing the
 * password did not exist at all, and it is a different problem: proving you
 * know the current one, and separately deriving a verifier for the new one.
 *
 * ```
 *   account.getPassword ──> current_algo + srp_B + srp_id ──> proof of the old
 *                       └─> new_algo                      ──> verifier for the new
 * ```
 *
 * **The password never leaves this process, and never reaches a log.** What
 * goes to Telegram is a proof for the old password and a verifier for the new
 * one; neither can be turned back into what was typed. Nothing here accepts a
 * logger, and nothing here puts a password, a salt or a derived value into an
 * error message — an error that quoted its input would put the secret wherever
 * the error went.
 *
 * The verifier is `v = g^x mod p`, where `x` is the same derivation used to
 * answer a challenge and `p`, `g` and the salts come from the algorithm the
 * server just published. Two details are Telegram's and are easy to get wrong
 * in a way that only shows up later, as a password that cannot be used to sign
 * in: 32 random bytes are appended to the first salt before deriving, and the
 * result is sent big-endian padded to 2048 bits rather than at its natural
 * length.
 */

import { ValidationError } from '@yuigram/core'
import type { MtprotoApi } from '../api.js'
import { type PasswordChallenge, passwordProof } from '../auth/password.js'
import { modPow } from '../crypto/bigint.js'
import { bigIntToBytesBE, bytesToBigIntBE, concatBytes } from '../crypto/bytes.js'
import { validateDhParameters } from '../crypto/primes.js'
import { passwordHash, type SrpOptions } from '../crypto/srp.js'
import type {
  account as accountTypes,
  TypeInputCheckPasswordSRP,
  TypePasswordKdfAlgo,
} from '../generated/api/types/index.js'

/** How wide the verifier is sent, whatever its natural length. */
const VERIFIER_BYTES = 256

/** How many random bytes Telegram requires on the front of the first salt. */
const SALT_PADDING = 32

/** The only key-derivation Telegram currently publishes for passwords. */
const SUPPORTED = 'passwordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow'

/** What these operations need from a client. */
export interface Securing {
  readonly api: MtprotoApi
  /** Bytes for the salt padding. */
  random(length: number): Uint8Array
  /**
   * How the derivation stretches a password.
   *
   * Replaced only to make a test affordable — the real one is a hundred
   * thousand iterations, which is the point of it. `signInWithPassword` offers
   * the same hatch for the same reason.
   */
  readonly srp?: SrpOptions
}

/** What the account's second factor looks like right now. */
export interface PasswordStatus {
  /** Whether a password is set at all. */
  readonly hasPassword: boolean
  /** The reminder shown before the password is asked for. */
  readonly hint: string | undefined
  /** Whether a recovery email is confirmed and usable. */
  readonly hasRecovery: boolean
  /**
   * The recovery address that has been given but not yet confirmed.
   *
   * Partly hidden by Telegram, which is what makes it safe to show. A password
   * set with an unconfirmed address is not yet recoverable.
   */
  readonly unconfirmedEmail: string | undefined
  /** The address this account can sign in with, partly hidden. */
  readonly loginEmail: string | undefined
  /** When a requested reset of the password takes effect, in Unix seconds. */
  readonly pendingResetDate: number | undefined
  /** The answer, untouched. */
  readonly raw: accountTypes.TypePassword
}

/**
 * Read the state of the account's second factor.
 *
 * Safe to call while signed in and while signing in: it is the same call the
 * sign-in flow uses to fetch a challenge, and it says nothing secret.
 */
export async function passwordStatus(client: Securing): Promise<PasswordStatus> {
  const answer = await client.api.account.getPassword()

  return {
    hasPassword: answer.has_password === true,
    hint: answer.hint,
    hasRecovery: answer.has_recovery === true,
    unconfirmedEmail: answer.email_unconfirmed_pattern,
    loginEmail: answer.login_email_pattern,
    pendingResetDate: answer.pending_reset_date,
    raw: answer,
  }
}

/**
 * Derive the verifier for a new password, under the algorithm the server named.
 *
 * The salt padding is drawn here rather than taken from the caller, because it
 * has to be fresh for every password set and a caller that reused one would
 * weaken the result without any sign that it had.
 */
async function verifierFor(
  client: Securing,
  password: string,
  algorithm: TypePasswordKdfAlgo,
): Promise<{ readonly algo: TypePasswordKdfAlgo; readonly hash: Uint8Array }> {
  if (algorithm._ !== SUPPORTED) {
    throw new ValidationError(`'${algorithm._}' is not an algorithm this client can perform`)
  }

  const p = bytesToBigIntBE(algorithm.p)
  const g = BigInt(algorithm.g)

  // The same check the proof path makes, for the same reason: these parameters
  // arrived from the server, and a weak group would make the verifier derived
  // under it worth far less than it looks. Answering a challenge already
  // refuses one; deriving a new password has to as well, or the weaker of the
  // two paths is the one an attacker steers towards.
  validateDhParameters({ p, g })

  const salt1 = concatBytes(algorithm.salt1, client.random(SALT_PADDING))
  const x = bytesToBigIntBE(
    await passwordHash(
      new TextEncoder().encode(password),
      salt1,
      algorithm.salt2,
      client.srp?.pbkdf2,
    ),
  )
  const verifier = modPow(g, x, p)

  return {
    algo: { ...algorithm, salt1 },
    hash: bigIntToBytesBE(verifier, VERIFIER_BYTES),
  }
}

/**
 * Prove the current password, for a call that will not proceed without it.
 *
 * Fetched and answered together: the proof is built for one published
 * challenge, so a challenge fetched earlier is one the server has moved past.
 */
export async function proveCurrent(
  client: Securing,
  password: string | undefined,
): Promise<TypeInputCheckPasswordSRP> {
  const published = await client.api.account.getPassword()

  // No password set yet, and none offered: there is nothing to prove, which is
  // what setting a password for the first time looks like.
  if (published.has_password !== true) return { _: 'inputCheckPasswordEmpty' }

  if (password === undefined) {
    throw new ValidationError('this account has a password, so the current one is required')
  }

  return await passwordProof(password, challengeOf(published), client.srp ?? {})
}

/**
 * Read the challenge out of a published password, from the generated type.
 *
 * `current_algo`, `srp_B` and `srp_id` share the flag that says a password is
 * set, so all three arrive together or not at all — but the type system states
 * them separately, and each is checked rather than assumed from the flag.
 */
function challengeOf(published: accountTypes.TypePassword): PasswordChallenge {
  const algorithm = published.current_algo

  if (algorithm === undefined || published.srp_B === undefined || published.srp_id === undefined) {
    throw new ValidationError('this account published no challenge to answer')
  }

  if (algorithm._ !== SUPPORTED) {
    throw new ValidationError(`'${algorithm._}' is not an algorithm this client can perform`)
  }

  return {
    srpId: published.srp_id,
    gB: bytesToBigIntBE(published.srp_B),
    p: bytesToBigIntBE(algorithm.p),
    g: BigInt(algorithm.g),
    salt1: algorithm.salt1,
    salt2: algorithm.salt2,
  }
}

/** What a new password should be, and what goes with it. */
export interface NewPassword {
  /** The password itself. Never logged, never sent. */
  readonly password: string
  /** A reminder shown before it is asked for. Visible to anyone who sees the prompt. */
  readonly hint?: string
  /**
   * An address to recover through, which Telegram then asks to confirm.
   *
   * Until it is confirmed the password is set but not recoverable — see
   * {@link confirmRecoveryEmail}.
   */
  readonly email?: string
}

/**
 * Set a password on an account that has none, or change the one it has.
 *
 * ```ts
 * await setPassword(account, { password: secret, hint: 'the usual' })
 * await setPassword(account, { password: next }, current)
 * ```
 *
 * `current` is required whenever a password is already set, and refused as a
 * missing argument rather than sent as an empty proof — an empty proof against
 * a set password fails as though the password were wrong, which is a confusing
 * way to learn that an argument was left out.
 */
export async function setPassword(
  client: Securing,
  next: NewPassword,
  current?: string,
): Promise<void> {
  const proof = await proveCurrent(client, current)
  // Fetched again rather than reused: `proveCurrent` answered the challenge in
  // the same answer this comes from, and the algorithm for the new password is
  // published alongside it.
  const published = await client.api.account.getPassword()
  const { algo, hash } = await verifierFor(client, next.password, published.new_algo)

  await client.api.account.updatePasswordSettings({
    password: proof,
    new_settings: {
      _: 'account.passwordInputSettings',
      new_algo: algo,
      new_password_hash: hash,
      hint: next.hint ?? '',
      ...(next.email === undefined ? {} : { email: next.email }),
    },
  })
}

/**
 * Take the password off the account.
 *
 * Sending an empty verifier is how Telegram is told there is no longer a
 * password, which is why this is the same call as setting one rather than a
 * method of its own.
 */
export async function removePassword(client: Securing, current: string): Promise<void> {
  const proof = await proveCurrent(client, current)

  await client.api.account.updatePasswordSettings({
    password: proof,
    new_settings: {
      _: 'account.passwordInputSettings',
      new_algo: { _: 'passwordKdfAlgoUnknown' },
      new_password_hash: new Uint8Array(0),
      hint: '',
    },
  })
}

/**
 * Confirm the recovery address with the code Telegram sent to it.
 *
 * Until this succeeds the address is on the account but not usable to recover
 * through, which {@link PasswordStatus.unconfirmedEmail} is how to notice.
 */
export async function confirmRecoveryEmail(client: Securing, code: string): Promise<void> {
  await client.api.account.confirmPasswordEmail({ code })
}

/** Ask Telegram to send the confirmation code again. */
export async function resendRecoveryEmail(client: Securing): Promise<void> {
  await client.api.account.resendPasswordEmail()
}

/** Give up on confirming a recovery address, leaving the password without one. */
export async function cancelRecoveryEmail(client: Securing): Promise<void> {
  await client.api.account.cancelPasswordEmail()
}

/**
 * Ask for a recovery code, for an account whose password has been forgotten.
 *
 * Answers the address it was sent to, partly hidden. Only usable where a
 * recovery address was confirmed while the password was still known.
 */
export async function requestPasswordRecovery(client: Securing): Promise<string> {
  const answer = await client.api.auth.requestPasswordRecovery()

  return answer.email_pattern
}

/**
 * Check a recovery code without spending it.
 *
 * Lets a caller tell a mistyped code from a wrong one before committing to the
 * reset that follows.
 */
export async function checkRecoveryCode(client: Securing, code: string): Promise<boolean> {
  return await client.api.auth.checkRecoveryPassword({ code })
}
