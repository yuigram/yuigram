// SPDX-License-Identifier: MIT

/**
 * Signing a test account in, and signing it out again.
 *
 * Kept apart from the checks because neither is a check: signing in creates an
 * authorization — a new long-lived key on Telegram's side and a new entry among
 * the account's active sessions — and signing out ends one. Each has a variable
 * of its own that must be set to 1, and neither runs as part of anything else.
 *
 * The code and the password are asked for at the terminal, never read from the
 * environment or an argument, where a shell's history or a process listing
 * would keep them. The session that signing in produces is written to a file
 * that must not already exist, readable by its owner only, and is never printed.
 */

import { existsSync } from 'node:fs'
import { type ServerRsaKey, type SessionFormat, serverKeysFromPem } from 'yuigram'
import { EnvironmentError } from './environment.js'

/** The variables signing in and out read, and what each is for. */
export const LOGIN_VARIABLES = {
  YUIGRAM_LIVE_ALLOW_LOGIN:
    'Set to 1 to sign in. Signing in creates an authorization: a new key and a new active session on the account.',
  YUIGRAM_LIVE_ALLOW_LOGOUT:
    'Set to 1 to sign out. Signing out ends the authorization the session string holds.',
  YUIGRAM_LIVE_PHONE: 'The test account’s phone number, in international form.',
  YUIGRAM_LIVE_SESSION_OUT:
    'A path for the session string signing in produces. It must not exist; it is created readable by its owner only.',
} as const

/** Where a terminal is asked and told. */
export interface LoginIo {
  /** Ask a question. A hidden answer is not echoed. */
  ask(question: string, options?: { readonly hidden?: boolean }): Promise<string>
  /** Tell the operator something. Never given a secret. */
  say(line: string): void
}

/** As much of an account as signing in and out uses. */
export interface LoginAccount {
  connect(): Promise<unknown>
  stop(options?: { readonly timeout?: number }): Promise<unknown>
  sendCode(phone: string): Promise<SignInStep>
  signInWithCode(request: {
    readonly phone: string
    readonly phoneCodeHash: string
    readonly code: string
  }): Promise<SignInStep>
  signInWithPassword(password: string): Promise<SignInStep>
  exportSession(options?: { readonly format?: SessionFormat }): Promise<string>
  logOut(): Promise<void>
}

/** A step of signing in, as the account reports it. */
export type SignInStep =
  | { readonly kind: 'code-sent'; readonly phoneCodeHash: string }
  | { readonly kind: 'password-required' }
  | { readonly kind: 'registration-required' }
  | { readonly kind: 'authorized' }

/** What signing in is given. */
export interface LoginSettings {
  readonly apiId: number
  readonly apiHash: string
  readonly keys: readonly ServerRsaKey[]
  readonly testMode: boolean
  readonly dc: { readonly id: number; readonly host: string; readonly port: number }
  readonly phone: string
  readonly out: string
  readonly format: SessionFormat
  /** Every secret it holds, so output can be scrubbed of each. */
  readonly secrets: readonly string[]
}

type Source = Readonly<Record<string, string | undefined>>

const value = (env: Source, name: string): string | undefined => {
  const found = env[name]?.trim()
  return found === undefined || found === '' ? undefined : found
}

/**
 * Read what signing in needs, refusing before anything connects.
 *
 * Refused without `YUIGRAM_LIVE_ALLOW_LOGIN=1`, with anything missing, and
 * with an output path that already exists — a session written over another
 * would lose the other one's authorization without ending it.
 */
export function readLoginEnvironment(
  env: Source,
  readKeys: (path: string) => string,
  exists: (path: string) => boolean = existsSync,
): LoginSettings {
  if (value(env, 'YUIGRAM_LIVE_ALLOW_LOGIN') !== '1') {
    throw new EnvironmentError(
      'signing in creates an authorization, and YUIGRAM_LIVE_ALLOW_LOGIN is not 1; nothing was run',
    )
  }
  const needed = {
    YUIGRAM_LIVE_API_ID: value(env, 'YUIGRAM_LIVE_API_ID'),
    YUIGRAM_LIVE_API_HASH: value(env, 'YUIGRAM_LIVE_API_HASH'),
    YUIGRAM_LIVE_SERVER_KEYS: value(env, 'YUIGRAM_LIVE_SERVER_KEYS'),
    YUIGRAM_LIVE_DC: value(env, 'YUIGRAM_LIVE_DC'),
    YUIGRAM_LIVE_PHONE: value(env, 'YUIGRAM_LIVE_PHONE'),
    YUIGRAM_LIVE_SESSION_OUT: value(env, 'YUIGRAM_LIVE_SESSION_OUT'),
  }
  const missing = Object.entries(needed).filter(([, found]) => found === undefined)
  if (missing.length > 0) {
    throw new EnvironmentError(`signing in needs ${missing.map(([name]) => name).join(', ')}`)
  }

  const apiId = Number(needed.YUIGRAM_LIVE_API_ID)
  if (!Number.isInteger(apiId) || apiId <= 0) {
    throw new EnvironmentError('YUIGRAM_LIVE_API_ID is not a number')
  }
  const dc = /^(\d{1,3})@([^:@\s]+):(\d{1,5})$/.exec(needed.YUIGRAM_LIVE_DC as string)
  if (dc === null) throw new EnvironmentError('YUIGRAM_LIVE_DC is not id@host:port')
  const out = needed.YUIGRAM_LIVE_SESSION_OUT as string
  if (exists(out)) {
    throw new EnvironmentError(
      'YUIGRAM_LIVE_SESSION_OUT names a file that exists; a session is never written over another',
    )
  }
  const format = value(env, 'YUIGRAM_LIVE_SESSION_FORMAT') ?? 'portable'
  if (format !== 'portable' && format !== 'tl-v3') {
    throw new EnvironmentError("YUIGRAM_LIVE_SESSION_FORMAT is 'portable' or 'tl-v3'")
  }
  let keys: ServerRsaKey[]
  try {
    keys = serverKeysFromPem(readKeys(needed.YUIGRAM_LIVE_SERVER_KEYS as string))
  } catch (error) {
    throw new EnvironmentError(
      `YUIGRAM_LIVE_SERVER_KEYS could not be read as PEM keys: ${(error as Error).message}`,
    )
  }

  const [, id, host, port] = dc as unknown as [string, string, string, string]
  const apiHash = needed.YUIGRAM_LIVE_API_HASH as string
  const phone = needed.YUIGRAM_LIVE_PHONE as string
  return {
    apiId,
    apiHash,
    keys,
    testMode: value(env, 'YUIGRAM_LIVE_TEST_NETWORK') === '1',
    dc: { id: Number(id), host, port: Number(port) },
    phone,
    out,
    format,
    secrets: [apiHash, phone],
  }
}

/**
 * Sign an account in, asking for the code and, where the account has one, the
 * password. Answers the session string; the caller writes it down.
 *
 * Refuses a number with no account: registering one is a decision about a
 * person's number, not a verification step.
 */
export async function signIn(
  account: LoginAccount,
  phone: string,
  format: SessionFormat,
  io: LoginIo,
): Promise<string> {
  await account.connect()
  try {
    const sent = await account.sendCode(phone)
    if (sent.kind !== 'code-sent') {
      throw new Error(`asking for a code answered '${sent.kind}'`)
    }
    io.say('a code was sent to the account')

    let step = await account.signInWithCode({
      phone,
      phoneCodeHash: sent.phoneCodeHash,
      code: (await io.ask('code: ')).trim(),
    })
    if (step.kind === 'password-required') {
      step = await account.signInWithPassword(await io.ask('password: ', { hidden: true }))
    }
    if (step.kind === 'registration-required') {
      throw new Error('there is no account on this number, and this harness does not register one')
    }
    if (step.kind !== 'authorized') throw new Error(`signing in ended at '${step.kind}'`)

    return await account.exportSession({ format })
  } finally {
    await account.stop({ timeout: 2000 })
  }
}

/** Refuse signing out unless it was asked for by name. */
export function checkLogoutAllowed(env: Source): void {
  if (value(env, 'YUIGRAM_LIVE_ALLOW_LOGOUT') !== '1') {
    throw new EnvironmentError(
      'signing out ends the authorization the session holds, and YUIGRAM_LIVE_ALLOW_LOGOUT is not 1; nothing was run',
    )
  }
}

/** End the authorization a connected account holds. */
export async function signOut(account: LoginAccount): Promise<void> {
  await account.connect()
  await account.logOut()
}
