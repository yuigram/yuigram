/**
 * What the presence watch is configured with, read from the environment.
 *
 * The values come from `examples/20-presence-watch/.env` where that file
 * exists — `.env.example` beside it lists every name — and from the process
 * environment otherwise. Nothing here is printed: a token, an API hash and a
 * session are credentials.
 *
 * There are two readings, because there are two moments. Signing the account
 * in needs the account's settings and nothing of the bot's — the operator's
 * identifier may not be known yet, and the sign-in is what prints it. Starting
 * the watch needs all of it, and does not start without an operator.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  Account,
  type AccountOptions,
  Bot,
  bootstrapAt,
  file,
  type KV,
  serverKeysFromPem,
} from 'yuigram'
import { keyFileFor } from './server-keys.js'

/** Which of Telegram's two environments both clients talk to. */
export type TelegramEnvironment = 'production' | 'test'

/** What the account needs: all that signing in reads. */
export interface AccountConfig {
  readonly environment: TelegramEnvironment
  readonly account: Omit<AccountOptions, 'storage'>
  /** The directory everything this example writes goes under. */
  readonly dataDir: string
}

/** What starting the watch needs: the account's settings, and the bot's and the operator's. */
export interface Config extends AccountConfig {
  readonly botToken: string
  /** The one user who may command the bot. Always a real identifier: there is no "nobody yet". */
  readonly operatorId: number
  readonly pollSeconds: number
  readonly limit: number
  readonly timeZone: string | undefined
}

/** The first address of datacenter 2 in each environment, as Telegram publishes them. */
const FIRST_ADDRESS: Readonly<Record<TelegramEnvironment, string>> = {
  production: '149.154.167.50',
  test: '149.154.167.40',
}

const HERE = import.meta.dirname

function required(name: string): string {
  const value = process.env[name]
  if (value === undefined || value === '') {
    throw new Error(`${name} is not set. See examples/20-presence-watch/.env.example.`)
  }
  // The placeholders of `.env.example`, copied and not filled in. The value is
  // not echoed: what is there may be a half-typed credential.
  if (value.includes('REPLACE_WITH')) {
    throw new Error(`${name} still holds the placeholder from .env.example.`)
  }

  return value
}

/** A time zone the runtime can format in, or a refusal before anything is started. */
function timeZone(): string | undefined {
  const zone = process.env['TIME_ZONE']
  if (zone === undefined || zone === '') return undefined
  try {
    new Intl.DateTimeFormat('ru-RU', { timeZone: zone })
  } catch {
    throw new Error('TIME_ZONE is not a time zone this system knows, e.g. Europe/Moscow.')
  }

  return zone
}

function whole(name: string, fallback?: number): number {
  const text = process.env[name]
  if (text === undefined || text === '') {
    if (fallback === undefined) {
      throw new Error(`${name} is not set. See examples/20-presence-watch/.env.example.`)
    }

    return fallback
  }

  const value = Number(text)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a whole number above zero.`)
  }

  return value
}

/** A path as the configuration gives it: relative ones are taken from this example's directory. */
const fromHere = (path: string): string => resolve(HERE, path)

export interface ReadOptions {
  /**
   * The file settings are read from before the environment is consulted.
   * `.env` in this directory unless given; `false` reads the environment alone.
   */
  readonly envFile?: string | false
}

/** Take the settings file into the environment, where there is one. What is already set wins. */
function loadFile(options: ReadOptions): void {
  const envFile = options.envFile ?? join(HERE, '.env')
  if (envFile !== false && existsSync(envFile)) process.loadEnvFile(envFile)
}

/**
 * The file of Telegram's server keys for an environment.
 *
 * Unless `SERVER_KEYS` names another, it is the one `keys.ts` writes for that
 * environment — so the keys follow `TELEGRAM_ENV`, and one environment's file
 * is never picked up for the other.
 */
function serverKeysFile(environment: TelegramEnvironment): string {
  const named = process.env['SERVER_KEYS']
  if (named !== undefined && named !== '') {
    const path = fromHere(named)
    if (!existsSync(path)) throw new Error(`SERVER_KEYS names ${path}, which does not exist.`)

    return path
  }

  const path = keyFileFor(environment)
  if (!existsSync(path)) {
    throw new Error(
      `${path} does not exist. Prepare it: pnpm tsx examples/20-presence-watch/keys.ts ${environment}`,
    )
  }

  return path
}

/** The operator's identifier. There is no reading in which the watch runs without one. */
function operator(): number {
  const text = process.env['OPERATOR_ID']
  if (text === undefined || text === '' || text === '0') {
    throw new Error(
      'OPERATOR_ID is not set. It is the Telegram user id of the one person who may command the bot; ' +
        'login.ts prints the id of the account it signs in.',
    )
  }

  return whole('OPERATOR_ID')
}

/**
 * Read what the account needs, and nothing else.
 *
 * This is all that signing in reads: the environment, the application's
 * credentials, the server keys, the first address and where state is kept. The
 * bot's token and the operator are not looked at, so they need not be there
 * yet, and no stand-in for them is made up.
 *
 * `.env` is looked for beside this file, so the commands work from the
 * repository root or from anywhere else, and a variable already set in the
 * environment wins over the file. Relative paths in `SERVER_KEYS` and
 * `DATA_DIR` are taken from this directory for the same reason.
 */
export function readAccountConfig(options: ReadOptions = {}): AccountConfig {
  loadFile(options)

  const environment = process.env['TELEGRAM_ENV'] ?? 'production'
  if (environment !== 'production' && environment !== 'test') {
    throw new Error('TELEGRAM_ENV must be "production" or "test".')
  }

  const apiId = whole('API_ID')
  const apiHash = required('API_HASH')
  const keysFile = serverKeysFile(environment)

  return {
    environment,
    account: {
      apiId,
      apiHash,
      // The keys this account knows Telegram's datacenters by. A datacenter
      // whose key is not among them is refused.
      keys: serverKeysFromPem(readFileSync(keysFile, 'utf8')),
      // One environment for both clients: the account's first address and the
      // bot's test mode are both decided by TELEGRAM_ENV and by nothing else.
      bootstrap: bootstrapAt({
        dc: whole('DC_ID', 2),
        host: process.env['DC_HOST'] ?? FIRST_ADDRESS[environment],
        port: whole('DC_PORT', 443),
        testMode: environment === 'test',
      }),
      name: 'observer',
    },
    dataDir: fromHere(process.env['DATA_DIR'] ?? 'state'),
  }
}

/** Read everything starting the watch needs: the account's settings, the bot's and the operator. */
export function readConfig(options: ReadOptions = {}): Config {
  const account = readAccountConfig(options)

  return {
    ...account,
    botToken: required('BOT_TOKEN'),
    operatorId: operator(),
    pollSeconds: whole('POLL_SECONDS', 60),
    limit: whole('WATCH_LIMIT', 10),
    timeZone: timeZone(),
  }
}

/**
 * Refuse a state directory that was signed in for the other environment.
 *
 * A production bot and a test-environment account share no chats, and an
 * authorization made in one environment means nothing in the other. The
 * directory remembers which it was made for.
 */
export function claimEnvironment(config: AccountConfig): void {
  mkdirSync(config.dataDir, { recursive: true })
  const marker = join(config.dataDir, 'environment')
  if (!existsSync(marker)) {
    writeFileSync(marker, `${config.environment}\n`)

    return
  }

  const made = readFileSync(marker, 'utf8').trim()
  if (made !== config.environment) {
    throw new Error(
      `${config.dataDir} was set up for the ${made} environment and TELEGRAM_ENV is ${config.environment}. ` +
        'Use another DATA_DIR for another environment.',
    )
  }
}

/**
 * The configuration for a command: read, and its state directory claimed.
 *
 * What is wrong with it is said in one line, and the command ends there —
 * before a client exists, so nothing has been connected to.
 */
function orExit<T extends AccountConfig>(read: () => T): T {
  try {
    const config = read()
    claimEnvironment(config)

    return config
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

/** The configuration `index.ts` starts with. */
export const configure = (options: ReadOptions = {}): Config => orExit(() => readConfig(options))

/** The configuration `login.ts` signs in with. */
export const configureAccount = (options: ReadOptions = {}): AccountConfig =>
  orExit(() => readAccountConfig(options))

/** The account, with its authorization in a directory of its own. */
export function openAccount(config: AccountConfig): Account {
  return Account.fromSession(join(config.dataDir, 'account'), config.account)
}

/** The bot, in the same environment as the account. */
export function openBot(config: Config): Bot {
  return Bot.fromToken(config.botToken, {
    name: 'operator',
    testMode: config.environment === 'test',
  })
}

/** Where the watch list and the observations go: beside the account's directory, never in it. */
export function openRecords(config: AccountConfig): KV<unknown> {
  return file(join(config.dataDir, 'watch'))
}
