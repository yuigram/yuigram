/**
 * What the presence watch is configured with, read from the environment.
 *
 * The values come from `examples/20-presence-watch/.env` where that file
 * exists — `.env.example` beside it lists every name — and from the process
 * environment otherwise. Nothing here is printed: a token, an API hash and a
 * session are credentials.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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

  return value
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

/** Read the configuration. `needBot` is false for the sign-in command, which uses no bot. */
export function readConfig(needBot = true): Config {
  const envFile = join(HERE, '.env')
  if (existsSync(envFile)) process.loadEnvFile(envFile)

  const environment = process.env['TELEGRAM_ENV'] ?? 'production'
  if (environment !== 'production' && environment !== 'test') {
    throw new Error('TELEGRAM_ENV must be "production" or "test".')
  }

  const keysFile = required('SERVER_KEYS')
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
    dataDir: process.env['DATA_DIR'] ?? join(HERE, 'state'),
    pollSeconds: whole('POLL_SECONDS', 60),
    limit: whole('WATCH_LIMIT', 10),
    timeZone: process.env['TIME_ZONE'],
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
