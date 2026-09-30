/**
 * What the live checks are given, read from the environment.
 *
 * Nothing here has a default that reaches Telegram: a bot token, an account
 * session and the checks to run are all named by the operator, and a check
 * that changes anything also needs `YUIGRAM_LIVE_ALLOW_WRITES=1`. Values are
 * read, checked and held; none is ever printed.
 */

import { readFileSync } from 'node:fs'
import { type ServerRsaKey, type SessionFormat, serverKeysFromPem } from 'yuigram'

/** Every variable the harness reads, and what it is for. */
export const VARIABLES = {
  YUIGRAM_LIVE_CHECKS: 'Comma-separated check ids to run. Nothing runs without it.',
  YUIGRAM_LIVE_ALLOW_WRITES: 'Set to 1 to allow checks that send, edit or delete anything.',
  YUIGRAM_LIVE_ALLOW_SESSION:
    "Set to 1 to allow checks that connect as the account. Connecting binds a temporary key and records this client among the account's active sessions: it is not read-only.",
  YUIGRAM_LIVE_BOT_TOKEN: 'A bot token from @BotFather, for the bot checks.',
  YUIGRAM_LIVE_BOT_CHAT:
    'A chat the bot may write to, for the bot write checks: a test group or your own private chat with the bot.',
  YUIGRAM_LIVE_API_ID: 'The application id from my.telegram.org, for the account checks.',
  YUIGRAM_LIVE_API_HASH: 'The application hash from my.telegram.org.',
  YUIGRAM_LIVE_SESSION: 'A session string for a test account. The string is the account.',
  YUIGRAM_LIVE_SESSION_FORMAT: "The session string's layout: 'portable' (default) or 'tl-v3'.",
  YUIGRAM_LIVE_SERVER_KEYS: "A path to Telegram's published server keys, as PEM.",
  YUIGRAM_LIVE_DC: "The account's datacenter as id@host:port, when the session does not carry it.",
  YUIGRAM_LIVE_TEST_NETWORK: 'Set to 1 when the account and the addresses are on the test network.',
  YUIGRAM_LIVE_ACCOUNT_CHAT:
    'A chat the account may write to besides its own Saved Messages, for the mention and update checks: a test group that the bot is also in.',
} as const

/** What a bot check is given. */
export interface BotSettings {
  readonly token: string
  readonly chat: string | undefined
}

/** What an account check is given. */
export interface AccountSettings {
  readonly apiId: number
  readonly apiHash: string
  readonly session: string
  readonly format: SessionFormat
  readonly keys: readonly ServerRsaKey[]
  readonly testMode: boolean
  readonly dc: { readonly id: number; readonly host: string; readonly port: number } | undefined
  readonly chat: string | undefined
}

/** Everything the harness was given. */
export interface LiveEnvironment {
  readonly checks: readonly string[]
  readonly allowWrites: boolean
  /** Whether checks may connect as the account, which changes state on Telegram's side. */
  readonly allowSession: boolean
  readonly bot: BotSettings | undefined
  readonly account: AccountSettings | undefined
  /** Every secret the environment holds, so output can be scrubbed of each. */
  readonly secrets: readonly string[]
}

/** A variable that is set but unusable. Names the variable, never the value. */
export class EnvironmentError extends Error {
  override readonly name = 'EnvironmentError'
}

type Source = Readonly<Record<string, string | undefined>>

function present(env: Source, name: keyof typeof VARIABLES): string | undefined {
  const value = env[name]?.trim()
  return value === undefined || value === '' ? undefined : value
}

function readDc(text: string): { id: number; host: string; port: number } {
  const match = /^(\d{1,3})@([^:@\s]+|\[[0-9a-fA-F:]+\]):(\d{1,5})$/.exec(text)
  if (match === null) throw new EnvironmentError('YUIGRAM_LIVE_DC is not id@host:port')
  const [, id, host, port] = match as unknown as [string, string, string, string]
  return { id: Number(id), host: host.replace(/^\[|\]$/g, ''), port: Number(port) }
}

/**
 * Read the environment.
 *
 * The bot is configured when its token is set; the account when its id, hash,
 * session and keys are all set. Half of an account is an error rather than no
 * account, so a typo is not reported as "nothing to do".
 */
export function readEnvironment(
  env: Source,
  readKeys = (path: string) => readFileSync(path, 'utf8'),
): LiveEnvironment {
  const checks = (present(env, 'YUIGRAM_LIVE_CHECKS') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '')

  const token = present(env, 'YUIGRAM_LIVE_BOT_TOKEN')
  const bot =
    token === undefined ? undefined : { token, chat: present(env, 'YUIGRAM_LIVE_BOT_CHAT') }

  const accountParts = {
    apiId: present(env, 'YUIGRAM_LIVE_API_ID'),
    apiHash: present(env, 'YUIGRAM_LIVE_API_HASH'),
    session: present(env, 'YUIGRAM_LIVE_SESSION'),
    keys: present(env, 'YUIGRAM_LIVE_SERVER_KEYS'),
  }
  const given = Object.entries(accountParts).filter(([, value]) => value !== undefined)
  let account: AccountSettings | undefined

  if (given.length > 0) {
    const missing = Object.entries(accountParts)
      .filter(([, value]) => value === undefined)
      .map(([name]) => name)
    if (missing.length > 0) {
      throw new EnvironmentError(
        `the account checks need all of api id, api hash, session and server keys; missing: ${missing.join(', ')}`,
      )
    }
    const apiId = Number(accountParts.apiId)
    if (!Number.isInteger(apiId) || apiId <= 0)
      throw new EnvironmentError('YUIGRAM_LIVE_API_ID is not a number')
    const format = present(env, 'YUIGRAM_LIVE_SESSION_FORMAT') ?? 'portable'
    if (format !== 'portable' && format !== 'tl-v3') {
      throw new EnvironmentError("YUIGRAM_LIVE_SESSION_FORMAT is 'portable' or 'tl-v3'")
    }
    let keys: ServerRsaKey[]
    try {
      keys = serverKeysFromPem(readKeys(accountParts.keys as string))
    } catch (error) {
      throw new EnvironmentError(
        `YUIGRAM_LIVE_SERVER_KEYS could not be read as PEM keys: ${(error as Error).message}`,
      )
    }
    const dc = present(env, 'YUIGRAM_LIVE_DC')

    account = {
      apiId,
      apiHash: accountParts.apiHash as string,
      session: accountParts.session as string,
      format,
      keys,
      testMode: present(env, 'YUIGRAM_LIVE_TEST_NETWORK') === '1',
      dc: dc === undefined ? undefined : readDc(dc),
      chat: present(env, 'YUIGRAM_LIVE_ACCOUNT_CHAT'),
    }
  }

  const secrets = [token, accountParts.apiHash, accountParts.session].filter(
    (value): value is string => value !== undefined,
  )

  return {
    checks,
    allowWrites: present(env, 'YUIGRAM_LIVE_ALLOW_WRITES') === '1',
    allowSession: present(env, 'YUIGRAM_LIVE_ALLOW_SESSION') === '1',
    bot,
    account,
    secrets,
  }
}
