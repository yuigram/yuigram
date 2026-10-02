/**
 * What the presence watch is configured with, read from the environment.
 *
 * The values come from `examples/20-presence-watch/.env` where that file
 * exists — `.env.example` beside it lists every name — and from the process
 * environment otherwise. Nothing here is printed: a token, an API hash and a
 * session are credentials.
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

/** Which of Telegram's two environments both clients talk to. */
export type TelegramEnvironment = 'production' | 'test'

export interface Config {
  readonly environment: TelegramEnvironment
  readonly botToken: string
  readonly operatorId: number
  readonly account: Omit<AccountOptions, 'storage'>
  /** The directory everything this example writes goes under. */
  readonly dataDir: string
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
  /** False for the sign-in command, which uses no bot. */
  readonly needBot?: boolean
  /**
   * The file settings are read from before the environment is consulted.
   * `.env` in this directory unless given; `false` reads the environment alone.
   */
  readonly envFile?: string | false
}

/**
 * Read the configuration.
 *
 * `.env` is looked for beside this file, so the commands work from the
 * repository root or from anywhere else, and a variable already set in the
 * environment wins over the file. Relative paths in `SERVER_KEYS` and
 * `DATA_DIR` are taken from this directory for the same reason.
 */
export function readConfig(options: ReadOptions = {}): Config {
  const needBot = options.needBot ?? true
  const envFile = options.envFile ?? join(HERE, '.env')
  if (envFile !== false && existsSync(envFile)) process.loadEnvFile(envFile)

  const environment = process.env['TELEGRAM_ENV'] ?? 'production'
  if (environment !== 'production' && environment !== 'test') {
    throw new Error('TELEGRAM_ENV must be "production" or "test".')
  }

  const keysFile = fromHere(required('SERVER_KEYS'))
  if (!existsSync(keysFile)) throw new Error(`SERVER_KEYS names ${keysFile}, which does not exist.`)

  return {
    environment,
    botToken: needBot ? required('BOT_TOKEN') : '',
    operatorId: needBot ? whole('OPERATOR_ID') : 0,
    account: {
      apiId: whole('API_ID'),
      apiHash: required('API_HASH'),
      // Telegram's published keys for the chosen environment, checked by fingerprint.
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
export function claimEnvironment(config: Config): void {
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
export function configure(options: ReadOptions = {}): Config {
  try {
    const config = readConfig(options)
    claimEnvironment(config)

    return config
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

/** The account, with its authorization in a directory of its own. */
export function openAccount(config: Config): Account {
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
export function openRecords(config: Config): KV<unknown> {
  return file(join(config.dataDir, 'watch'))
}
