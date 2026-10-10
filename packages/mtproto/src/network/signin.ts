// SPDX-License-Identifier: MIT

/**
 * Proving to Telegram which account a connection belongs to.
 *
 * A connection is authorized before any of this: the keys protecting it were
 * established by the handshake and say nothing about who is using it. Signing
 * in is the separate step that binds an account to those keys, and until it has
 * happened the connection can speak the protocol and almost nothing else.
 *
 * ```
 *   sendCode ──> signIn ──> authorized
 *                   │
 *                   └── password ──> authorized
 * ```
 *
 * Three ways in, and they differ only in what is proved. A phone number is
 * proved by a code delivered to it, and then by a password if the account is
 * protected by one. A bot proves itself with its token in one call. A second
 * device proves itself by displaying a token the first device approves.
 *
 * **Every step may be told it is on the wrong datacenter.** An account lives at
 * one, and the one a client happens to reach first is not always it. A step that
 * is redirected is made again where it was sent, which is why each of these
 * takes a way to reach a datacenter rather than a connection to one.
 *
 * Nothing here stores anything. What a successful sign-in changes lives on
 * Telegram's side; the keys it was proved over are already kept by the layer
 * that established them, and are neither replaced nor rewritten by any of this.
 */

import { SessionError, TelegramError, ValidationError } from '@yuigram/core'
import { answerPasswordChallenge, readPasswordChallenge } from '../auth/password.js'
import type { SrpOptions } from '../crypto/srp.js'
import { normalizePhone } from '../phone.js'
import { MigrationError } from '../session/dispatcher.js'
import type { TlValue } from '../tl/index.js'
import { type Callable, transferAuthorization } from './migration.js'

/**
 * How to reach a datacenter.
 *
 * Supplied rather than held, because following a redirection means reaching a
 * datacenter this step had no reason to connect to until it was told to. What
 * decides how connections are made is not this module's business.
 */
export type Reach = (dcId: number) => Callable

/** What every step needs: where it is, and how to get somewhere else. */
export interface SignInOptions {
  /** How to reach a datacenter, including the one being used now. */
  readonly reach: Reach
  /** The datacenter to start at. */
  readonly dcId: number
  /** The application this client is registered as. */
  readonly apiId: number
  /** The secret that goes with it. */
  readonly apiHash: string
}

/**
 * Redirections one step will follow.
 *
 * A datacenter that redirects to one that redirects back is describing a loop
 * no number of attempts resolves. The bound turns that into a failure naming
 * the datacenters involved, rather than a step that never returns.
 */
const MAX_REDIRECTIONS = 5

/** How far a sign-in has got. */
export type SignInState =
  /** A code was sent, and the account has yet to prove it received it. */
  | {
      readonly kind: 'code-sent'
      readonly dcId: number
      /** Names the code that was sent; the next step is refused without it. */
      readonly phoneCodeHash: string
      /** Seconds before another code may be asked for, when the server said. */
      readonly timeout?: number
    }
  /** The code was accepted and the account is protected by a password. */
  | { readonly kind: 'password-required'; readonly dcId: number }
  /** The code was accepted and there is no account yet on this number. */
  | { readonly kind: 'registration-required'; readonly dcId: number }
  /** The account is signed in on this datacenter. */
  | { readonly kind: 'authorized'; readonly dcId: number; readonly user: TlValue }

/** A token a second device shows for another to approve. */
export type LoginTokenState =
  /** Waiting to be approved. Ask again before it expires. */
  | {
      readonly kind: 'pending'
      readonly dcId: number
      readonly token: Uint8Array
      /** The Unix second the token stops being accepted. */
      readonly expires: number
    }
  | { readonly kind: 'authorized'; readonly dcId: number; readonly user: TlValue }

/**
 * Make a call, following a datacenter that says it belongs elsewhere.
 *
 * The three redirections differ in what has to happen before the call is made
 * again. Two of them arrive before an account is bound to anything, so the
 * answer is simply to ask the other datacenter instead. The third says the
 * account has moved, which means the datacenter being redirected to does not
 * know it yet — so it is introduced first, using the connection that does.
 */
async function followingRedirections(
  options: SignInOptions,
  query: (dcId: number) => TlValue,
): Promise<{ readonly value: TlValue; readonly dcId: number }> {
  let dcId = options.dcId
  const seen: number[] = [dcId]

  for (let redirection = 0; redirection <= MAX_REDIRECTIONS; redirection += 1) {
    const here = options.reach(dcId)

    try {
      return { value: await here.invoke(query(dcId)), dcId }
    } catch (error) {
      if (!(error instanceof MigrationError)) throw error

      // An account that has moved leaves the datacenter it moved to knowing
      // nothing about it. Introducing it there is what makes the call worth
      // repeating; the other two redirections have no account to introduce.
      if (error.kind === 'user') {
        await transferAuthorization({
          from: here,
          to: options.reach(error.dcId),
          dcId: error.dcId,
        })
      }

      dcId = error.dcId
      seen.push(dcId)
    }
  }

  throw new SessionError(`the datacenters redirected in a loop: ${seen.join(' → ')}`)
}

/**
 * Whether a refusal is the one Telegram gives it a name for.
 *
 * A refusal carries its meaning in the name Telegram chose, and this compares
 * the whole name rather than looking for it inside the message — a step that
 * matched loosely would treat a longer name that begins the same way as this
 * one.
 */
function refusedAs(error: unknown, name: string): boolean {
  return error instanceof TelegramError && error.message.startsWith(`${name} (`)
}

/** Read the field a step cannot continue without. */
function readText(value: TlValue, field: string): string {
  const raw = value[field]
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new SessionError(`'${value._}.${field}' must be a non-empty string`)
  }

  return raw
}

/** Read an answer that says the account is now signed in. */
function readAuthorization(value: TlValue, dcId: number): SignInState {
  if (value._ === 'auth.authorizationSignUpRequired') {
    return { kind: 'registration-required', dcId }
  }
  if (value._ !== 'auth.authorization') {
    throw new SessionError(`expected an authorization, received '${value._}'`)
  }

  const user = value['user']
  if (typeof user !== 'object' || user === null) {
    throw new SessionError("'auth.authorization.user' must be an object")
  }

  return { kind: 'authorized', dcId, user: user as TlValue }
}

/**
 * Ask Telegram to send a code to a phone number.
 *
 * The answer names the code rather than carrying it: the client proves the
 * number is reachable by repeating a value only something at that number could
 * have received. A number whose account has a recent enough session may be
 * signed in outright, which is reported as what it is rather than as a code
 * that never arrives.
 */
export async function sendCode(
  options: SignInOptions & { readonly phone: string },
): Promise<SignInState> {
  return (await requestCode(options)).state
}

/**
 * {@link sendCode}, keeping how Telegram said the code would arrive.
 *
 * Only {@link startTest} reads the delivery: it is where the length of a test
 * number's code comes from. The ordinary flow has nothing to do with it — the
 * person types what arrived.
 */
async function requestCode(
  options: SignInOptions & { readonly phone: string },
): Promise<{ readonly state: SignInState; readonly delivery?: unknown }> {
  const { value, dcId } = await followingRedirections(options, () => ({
    _: 'auth.sendCode',
    phone_number: normalizePhone(options.phone),
    api_id: options.apiId,
    api_hash: options.apiHash,
    settings: { _: 'codeSettings' },
  }))

  if (value._ === 'auth.sentCodeSuccess') {
    const authorization = value['authorization']
    if (typeof authorization !== 'object' || authorization === null) {
      throw new SessionError("'auth.sentCodeSuccess.authorization' must be an object")
    }

    return { state: readAuthorization(authorization as TlValue, dcId) }
  }

  if (value._ !== 'auth.sentCode') {
    throw new SessionError(`expected a sent code, received '${value._}'`)
  }

  const timeout = value['timeout']

  return {
    state: {
      kind: 'code-sent',
      dcId,
      phoneCodeHash: readText(value, 'phone_code_hash'),
      ...(typeof timeout === 'number' ? { timeout } : {}),
    },
    delivery: value['type'],
  }
}

/**
 * Ask for the code again, by whatever means Telegram offers next.
 *
 * Not the same as sending again. {@link sendCode} starts a fresh attempt and
 * invalidates the hash the caller is holding; this continues the attempt
 * already under way, which is what lets Telegram move from an in-app code to an
 * SMS. The hash from the first answer names the attempt and is required.
 *
 * The answer may name a *new* hash, so a caller holding the old one replaces it
 * with what comes back rather than keeping the one it sent.
 */
export async function resendCode(
  options: SignInOptions & {
    readonly phone: string
    readonly phoneCodeHash: string
    /** Why it is being asked for again, where the caller has a reason to give. */
    readonly reason?: string
  },
): Promise<SignInState> {
  const { value, dcId } = await followingRedirections(options, () => ({
    _: 'auth.resendCode',
    phone_number: normalizePhone(options.phone),
    phone_code_hash: options.phoneCodeHash,
    ...(options.reason === undefined ? {} : { reason: options.reason }),
  }))

  if (value._ === 'auth.sentCodeSuccess') {
    const authorization = value['authorization']
    if (typeof authorization !== 'object' || authorization === null) {
      throw new SessionError("'auth.sentCodeSuccess.authorization' must be an object")
    }

    return readAuthorization(authorization as TlValue, dcId)
  }

  if (value._ !== 'auth.sentCode') {
    throw new SessionError(`expected a sent code, received '${value._}'`)
  }

  const timeout = value['timeout']

  return {
    kind: 'code-sent',
    dcId,
    phoneCodeHash: readText(value, 'phone_code_hash'),
    ...(typeof timeout === 'number' ? { timeout } : {}),
  }
}

/**
 * Prove the code was received.
 *
 * An account protected by a password is not signed in by the code alone, and
 * Telegram says so by refusing this step rather than by answering it. That
 * refusal is the ordinary path through a protected account, so it is reported
 * as the next state rather than raised as a failure.
 */
export async function signIn(
  options: SignInOptions & {
    readonly phone: string
    readonly phoneCodeHash: string
    readonly code: string
  },
): Promise<SignInState> {
  try {
    const { value, dcId } = await followingRedirections(options, () => ({
      _: 'auth.signIn',
      phone_number: normalizePhone(options.phone),
      phone_code_hash: options.phoneCodeHash,
      phone_code: options.code,
    }))

    return readAuthorization(value, dcId)
  } catch (error) {
    if (!refusedAs(error, 'SESSION_PASSWORD_NEEDED')) throw error

    return { kind: 'password-required', dcId: options.dcId }
  }
}

/**
 * Prove the password.
 *
 * The password never leaves this process. Telegram publishes a challenge, the
 * client answers with a proof that it knows the password, and the proof is
 * built for that one challenge — so the challenge is fetched and answered
 * together rather than passed around between them.
 */
export async function signInWithPassword(
  options: SignInOptions & {
    readonly password: string | Uint8Array
    /** How the proof is derived. Replaced only to make a test affordable. */
    readonly srp?: SrpOptions
  },
): Promise<SignInState> {
  const here = options.reach(options.dcId)
  const challenge = readPasswordChallenge(await here.invoke({ _: 'account.getPassword' }))
  const answer = await answerPasswordChallenge(options.password, challenge, options.srp ?? {})

  const { value, dcId } = await followingRedirections(options, () => ({
    _: 'auth.checkPassword',
    password: answer,
  }))

  return readAuthorization(value, dcId)
}

/**
 * Sign in as a bot.
 *
 * One call, because a bot's token is the whole of its proof: there is nothing
 * delivered out of band to repeat back and no password to answer.
 */
export async function signInAsBot(
  options: SignInOptions & { readonly token: string },
): Promise<SignInState> {
  const { value, dcId } = await followingRedirections(options, () => ({
    _: 'auth.importBotAuthorization',
    flags: 0,
    api_id: options.apiId,
    api_hash: options.apiHash,
    bot_auth_token: options.token,
  }))

  return readAuthorization(value, dcId)
}

/**
 * The datacenters Telegram runs for testing, and the numbers reserved for them.
 *
 * A test number is `99966XYYYY`, where X is the datacenter and YYYY is
 * anything; the confirmation code is X repeated, five times by Telegram's
 * documentation (https://core.telegram.org/api/auth#test-accounts). There are
 * three test datacenters, so X is 1, 2 or 3 and nothing else.
 */
const TEST_DCS = [1, 2, 3] as const

/** The length Telegram's documentation gives a test number's code. */
const TEST_CODE_LENGTH = 5

/**
 * The longest code length believed from an answer. Login codes are a handful
 * of digits; a larger figure is a malformed answer, not a code to build.
 */
const MAX_CODE_LENGTH = 16

/** A test number for a datacenter, with the random part drawn by the caller. */
export function testPhone(dcId: number, random: (length: number) => Uint8Array): string {
  if (!TEST_DCS.includes(dcId as (typeof TEST_DCS)[number])) {
    throw new ValidationError(
      `Telegram runs test datacenters ${TEST_DCS.join(', ')}, and ${dcId} is not one`,
    )
  }

  const bytes = random(4)
  let digits = ''
  for (const byte of bytes) digits += String(byte % 10)

  return `99966${dcId}${digits}`
}

/**
 * The confirmation code a test number receives: its datacenter's digit,
 * repeated as many times as the code is long.
 */
export function testCode(dcId: number, length: number = TEST_CODE_LENGTH): string {
  return String(dcId).repeat(length)
}

/**
 * How long a test number's code is, from what Telegram said when it sent it.
 *
 * The length the answer states is the length Telegram will check, so it wins
 * over the documented five. A delivery that states none — a flash call, a word
 * or a phrase — has no digit count to read, and the documented five stands. A
 * stated length that no code could have is refused before a sign-in attempt is
 * spent on it.
 */
function testCodeLength(delivery: unknown): number {
  if (typeof delivery !== 'object' || delivery === null) {
    throw new SessionError("'auth.sentCode.type' must be an object")
  }
  if (!('length' in delivery)) return TEST_CODE_LENGTH

  const { length } = delivery
  if (
    typeof length !== 'number' ||
    !Number.isInteger(length) ||
    length < 1 ||
    length > MAX_CODE_LENGTH
  ) {
    throw new SessionError(
      `Telegram stated a code length of ${String(length)}; a code is 1 to ${MAX_CODE_LENGTH} digits`,
    )
  }

  return length
}

/**
 * Sign in on a test datacenter, with a reserved number.
 *
 * Only useful against a test datacenter, and only reaches one because the
 * number says which: Telegram redirects the sign-in to the datacenter the
 * number names, which the step already follows. Nothing here is a shortcut
 * around the ordinary flow — it is the ordinary flow with a number whose code
 * is known in advance.
 *
 * Test accounts are public by design. Telegram wipes them periodically and
 * anybody can sign in to one, so nothing private belongs in a conversation
 * held with one.
 */
export async function startTest(
  options: SignInOptions & {
    /** The test datacenter to be a user of. One of 1, 2 or 3. */
    readonly dcId?: number
    /** A reserved number to use instead of one drawn here. */
    readonly phone?: string
    /** Where the random part of a drawn number comes from. */
    readonly random?: (length: number) => Uint8Array
  },
): Promise<SignInState> {
  const target = options.dcId ?? TEST_DCS[0]
  const phone =
    options.phone ?? testPhone(target, options.random ?? ((length) => randomDigits(length)))

  const named = /^99966(\d)/.exec(phone)
  if (named === null) {
    throw new ValidationError(`'${phone}' is not a reserved test number`)
  }

  const { state: sent, delivery } = await requestCode({ ...options, phone })
  if (sent.kind !== 'code-sent') return sent

  return await signIn({
    ...options,
    dcId: sent.dcId,
    phone,
    phoneCodeHash: sent.phoneCodeHash,
    code: testCode(Number(named[1]), testCodeLength(delivery)),
  })
}

/** Four digits, where the caller supplied no source of randomness. */
function randomDigits(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)

  return bytes
}

/**
 * Ask for a token another device can approve.
 *
 * The answer is one of three things, and two of them are not failures: a token
 * to display and ask about again, or an account already approved. The third
 * says the account lives elsewhere and hands over a token to present there,
 * which is followed here rather than reported — a caller shown a token it
 * cannot display has been told nothing useful.
 *
 * Approval is observed by asking again rather than announced, so a token that
 * is still pending is followed up by calling this again before it expires.
 */
export async function requestLoginToken(
  options: SignInOptions & { readonly exceptIds?: readonly bigint[] },
): Promise<LoginTokenState> {
  const { value, dcId } = await followingRedirections(options, () => ({
    _: 'auth.exportLoginToken',
    api_id: options.apiId,
    api_hash: options.apiHash,
    except_ids: [...(options.exceptIds ?? [])],
  }))

  return readLoginToken(value, dcId, options)
}

/** Interpret what a token request answered. */
async function readLoginToken(
  value: TlValue,
  dcId: number,
  options: SignInOptions,
): Promise<LoginTokenState> {
  if (value._ === 'auth.loginToken') {
    const token = value['token']
    const expires = value['expires']
    if (!(token instanceof Uint8Array) || token.length === 0) {
      throw new SessionError("'auth.loginToken.token' must be a non-empty byte string")
    }
    if (typeof expires !== 'number' || !Number.isInteger(expires)) {
      throw new SessionError("'auth.loginToken.expires' must be a Unix second")
    }

    return { kind: 'pending', dcId, token, expires }
  }

  if (value._ === 'auth.loginTokenMigrateTo') {
    const token = value['token']
    if (!(token instanceof Uint8Array) || token.length === 0) {
      throw new SessionError("'auth.loginTokenMigrateTo.token' must be a non-empty byte string")
    }

    const target = value['dc_id']
    if (typeof target !== 'number' || !Number.isInteger(target) || target <= 0) {
      throw new SessionError("'auth.loginTokenMigrateTo.dc_id' must be a datacenter")
    }

    const accepted = await options.reach(target).invoke({ _: 'auth.importLoginToken', token })

    return readLoginToken(accepted, target, options)
  }

  if (value._ === 'auth.loginTokenSuccess') {
    const authorization = value['authorization']
    if (typeof authorization !== 'object' || authorization === null) {
      throw new SessionError("'auth.loginTokenSuccess.authorization' must be an object")
    }

    const signedIn = readAuthorization(authorization as TlValue, dcId)
    if (signedIn.kind !== 'authorized') {
      throw new SessionError('a token was approved for an account that does not exist')
    }

    return signedIn
  }

  throw new SessionError(`expected a login token, received '${value._}'`)
}
