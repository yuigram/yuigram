/**
 * Mini App launch data: reading it, and checking that Telegram issued it.
 *
 * A Mini App receives `Telegram.WebApp.initData`, a query string naming the
 * user, the chat and the time it was opened, with Telegram's proof attached.
 * Reading it and believing it are separate steps, and this module keeps them
 * apart: {@link readInitData} only reads, and says nothing about where the text
 * came from; {@link verifyInitData} and {@link verifyInitDataSignature} read it
 * and check the proof, in the two ways Telegram publishes
 * (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
 *
 * - **The bot's own server** holds the bot token, and checks `hash`: the
 *   HMAC-SHA-256 of the data-check-string under a key derived from the token.
 * - **A third party** holds only the bot's id, and checks `signature`: an
 *   Ed25519 signature by Telegram, verified with the public key Telegram
 *   publishes.
 *
 * What a successful check establishes is narrow. Telegram issued this text to
 * this bot's Mini App, for the user it names, at `auth_date`. It does not say
 * the text is being presented by that user, or for the first time: anyone who
 * holds it can send it again until it is too old, which is why the age limit
 * is a required option rather than a default. Nor does it say what the user may
 * do — that is the application's decision.
 *
 * Everything here runs on the Web Crypto API, which Node.js, Bun, Deno, edge
 * runtimes and browsers have; the module imports nothing from Node. A bot token
 * belongs on a server, so {@link verifyInitData} does too; the third-party
 * check needs no secret.
 */

import { ConfigError, ValidationError } from '@yuigram/core'

/** A Mini App's user, or the chat partner, as launch data carries them. */
export interface WebAppUser {
  /** At most 52 significant bits, so a JavaScript number holds it exactly. */
  readonly id: number
  /** Present in `receiver` only. */
  readonly is_bot?: boolean
  readonly first_name: string
  readonly last_name?: string
  readonly username?: string
  /** An IETF language tag; present in `user` only. */
  readonly language_code?: string
  readonly is_premium?: true
  readonly added_to_attachment_menu?: true
  readonly allows_write_to_pm?: true
  readonly photo_url?: string
}

/** The chat a Mini App was opened in from the attachment menu, or a join request was sent to. */
export interface WebAppChat {
  readonly id: number
  readonly type: 'group' | 'supergroup' | 'channel'
  readonly title: string
  readonly username?: string
  readonly photo_url?: string
}

/**
 * Launch data as read: Telegram's `WebAppInitData`, with its own field names.
 *
 * Reading it proves nothing. Only a value returned by {@link verifyInitData} or
 * {@link verifyInitDataSignature} has been checked.
 */
export interface InitData {
  readonly query_id?: string
  readonly chat_join_request_query_id?: string
  readonly user?: WebAppUser
  readonly receiver?: WebAppUser
  readonly chat?: WebAppChat
  /** `'sender'`, `'private'`, `'group'`, `'supergroup'` or `'channel'`, from a direct link. */
  readonly chat_type?: string
  readonly chat_instance?: string
  readonly start_param?: string
  readonly can_send_after?: number
  /** Unix time, in seconds, when the Mini App was opened. */
  readonly auth_date: number
  readonly hash: string
  readonly signature?: string
}

/** Why launch data was not accepted. */
export type InitDataProblem =
  /** The text does not read as launch data in the form Telegram writes it. */
  | 'malformed'
  /** It reads, but the proof does not match: altered, or issued for another bot. */
  | 'mismatch'
  /** A third-party check was asked of data that carries no `signature`. */
  | 'unsigned'
  /** Genuine, but older than the age limit allows. */
  | 'expired'
  /** Its `auth_date` is further ahead of the clock than the allowed skew. */
  | 'future'
  /** The runtime's Web Crypto API cannot perform the check. */
  | 'unsupported'

/**
 * Launch data that was not accepted.
 *
 * The message never repeats the data or the token: launch data names a person,
 * and an error is a thing that gets logged.
 */
export class InitDataError extends ValidationError {
  constructor(
    message: string,
    readonly problem: InitDataProblem,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

/** The age policy every check states. */
export interface InitDataFreshness {
  /**
   * How old the data may be, in seconds since `auth_date`. Required, because
   * a valid proof does not stop the same text being sent again: this is the
   * window in which it can be. `Infinity` accepts any age, deliberately.
   */
  readonly maxAge: number
  /** The current time in Unix seconds. The system clock by default. */
  readonly now?: number
  /** How far `auth_date` may be ahead of `now`, in seconds, since clocks differ. 60 by default. */
  readonly clockSkew?: number
}

/** The bot's token, or a key derived from it once with {@link InitDataKey.fromToken}. */
export type InitDataSecret =
  | { readonly token: string; readonly key?: never }
  | { readonly key: InitDataKey; readonly token?: never }

/** Options for {@link verifyInitData}: the bot's token or key, and the age policy. */
export type VerifyInitDataOptions = InitDataFreshness & InitDataSecret

/** Options for {@link verifyInitDataSignature}. */
export interface VerifyInitDataSignatureOptions extends InitDataFreshness {
  /** The id of the bot the Mini App belongs to: the part of its token before the colon. */
  readonly botId: number
  /**
   * Telegram's key for the environment the bot runs in, `'production'` by
   * default; or the 32 bytes of a key Telegram publishes later.
   */
  readonly publicKey?: 'production' | 'test' | Uint8Array
}

/** The Ed25519 keys Telegram publishes for third-party checks. */
export const TELEGRAM_INIT_DATA_KEYS = {
  production: 'e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d',
  test: '40055058a4ee38156a06562e52eece92a771bcd8346a8c4615cb7376eddf72ec',
} as const

const DEFAULT_CLOCK_SKEW = 60
const BOT_TOKEN = /^\d+:[A-Za-z0-9_-]+$/
/** Field names as Telegram writes them. Anything else could make two texts check alike. */
const FIELD_NAME = /^[A-Za-z0-9_]+$/
const UNIX_TIME = /^(?:0|[1-9]\d*)$/
const HASH = /^[0-9a-f]{64}$/
/** 64 bytes in unpadded base64url: 86 characters, the last carrying four zero bits. */
const SIGNATURE = /^[A-Za-z0-9_-]{85}[AQgw]$/
const CHAT_TYPES: ReadonlySet<string> = new Set(['group', 'supergroup', 'channel'])

const encoder = new TextEncoder()
const keys = new WeakMap<InitDataKey, CryptoKey>()

/**
 * The key {@link verifyInitData} checks with, derived from a bot token.
 *
 * Deriving it is an HMAC of its own, so a server that checks often derives it
 * once and passes `key`. It holds no copy of the token, and cannot be read back
 * or serialised.
 */
export class InitDataKey {
  private constructor(key: CryptoKey) {
    keys.set(this, key)
  }

  /** Derive the key: HMAC-SHA-256 of the token, under the constant key `WebAppData`. */
  static async fromToken(token: string): Promise<InitDataKey> {
    if (typeof token !== 'string' || !BOT_TOKEN.test(token)) {
      throw new ConfigError('a bot token is the bot id, a colon, and the secret Telegram issued')
    }

    const subtle = subtleCrypto()
    const constant = await subtle.importKey('raw', encoder.encode('WebAppData'), HMAC, false, [
      'sign',
    ])
    const secret = new Uint8Array(await subtle.sign('HMAC', constant, encoder.encode(token)))

    try {
      return new InitDataKey(await subtle.importKey('raw', secret, HMAC, false, ['sign', 'verify']))
    } finally {
      secret.fill(0)
    }
  }
}

const HMAC = { name: 'HMAC', hash: 'SHA-256' } as const

/**
 * Read launch data, without checking where it came from.
 *
 * The text is read as a query string — `+` is a space, `%XX` an escaped byte of
 * UTF-8 — and refused when it is not one exactly: an empty pair, a pair with no
 * `=`, a name used twice, an escape that is not UTF-8, or a line feed anywhere,
 * which would let two different texts produce the same data-check-string.
 * `hash` and `auth_date` are required; `user`, `receiver` and `chat` must be
 * JSON objects with a numeric `id`.
 *
 * Empty text is refused with its own explanation: a Mini App opened from a
 * keyboard button or in inline mode receives none.
 *
 * @throws InitDataError with problem `'malformed'`.
 */
export function readInitData(initData: string): InitData {
  return interpret(fieldsOf(initData))
}

/**
 * Read launch data and check its `hash` with the bot's token: the check the
 * bot's own server makes.
 *
 * The data-check-string is every received field except `hash` — `signature`
 * included — as `name=value`, sorted by name and joined by line feeds; it must
 * carry the HMAC-SHA-256 that `hash` states, under the key derived from the
 * token. The comparison is the Web Crypto API's own verification, so it takes
 * the same time wherever the two differ.
 *
 * ```ts
 * import { InitDataKey, verifyInitData } from 'yuigram/web-app'
 *
 * const key = await InitDataKey.fromToken(process.env.BOT_TOKEN ?? '')
 * const data = await verifyInitData(initDataFromTheRequest, { key, maxAge: 3600 })
 * ```
 *
 * @throws InitDataError — `'malformed'`, `'mismatch'`, `'expired'`, `'future'` or `'unsupported'`.
 * @throws ConfigError when the token, or the age policy, is not usable.
 */
export async function verifyInitData(
  initData: string,
  options: VerifyInitDataOptions,
): Promise<InitData> {
  const policy = freshness(options)
  const key = await hmacKey(options)

  const fields = fieldsOf(initData)
  const data = interpret(fields)
  const signed = checkString(fields, ['hash'])

  const valid = await subtleCrypto().verify(
    'HMAC',
    key,
    hexBytes(data.hash),
    encoder.encode(signed),
  )
  if (!valid) throw new InitDataError('the launch data does not carry this bot’s hash', 'mismatch')

  return fresh(data, policy)
}

/**
 * The `hash` launch data carries when it is this bot's: the hexadecimal
 * HMAC-SHA-256 of its data-check-string, under the key derived from the token.
 *
 * For writing launch data — a fixture in an application's own tests, signed
 * with a token made up for them — and for reporting what was expected. Any
 * `hash` already in the text is left out of the computation, so the answer is
 * the same before and after one is appended:
 *
 * ```ts
 * const fields = 'auth_date=1700000000&user=%7B%22id%22%3A1%2C%22first_name%22%3A%22Ada%22%7D'
 * const launch = `${fields}&hash=${await hashInitData(fields, { token })}`
 * ```
 *
 * To decide whether launch data is genuine, use {@link verifyInitData}: it
 * compares in constant time and applies the age policy, and comparing two
 * strings by hand does neither. Telegram's `signature` cannot be written this
 * way — only Telegram holds that key.
 *
 * @throws InitDataError — `'malformed'` when the text does not read as fields, or `'unsupported'`.
 * @throws ConfigError when the token or the key is not usable.
 */
export async function hashInitData(initData: string, secret: InitDataSecret): Promise<string> {
  const key = await hmacKey(secret)
  const signed = checkString(fieldsOf(initData), ['hash'])
  const digest = new Uint8Array(await subtleCrypto().sign('HMAC', key, encoder.encode(signed)))

  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Read launch data and check its `signature` with Telegram's public key: the
 * check a third party makes, knowing only the bot's id.
 *
 * The data-check-string is `<botId>:WebAppData`, a line feed, and every
 * received field except `hash` and `signature`, as `name=value`, sorted by name
 * and joined by line feeds; `signature` must be Telegram's Ed25519 signature of
 * it, in unpadded base64url. Launch data from before Telegram added signatures
 * has no `signature`, and is refused as `'unsigned'` rather than as forged.
 *
 * ```ts
 * import { verifyInitDataSignature } from 'yuigram/web-app'
 *
 * const data = await verifyInitDataSignature(initData, { botId: 123456789, maxAge: 3600 })
 * ```
 *
 * @throws InitDataError — `'malformed'`, `'unsigned'`, `'mismatch'`, `'expired'`, `'future'` or `'unsupported'`.
 * @throws ConfigError when the bot id, the key, or the age policy is not usable.
 */
export async function verifyInitDataSignature(
  initData: string,
  options: VerifyInitDataSignatureOptions,
): Promise<InitData> {
  const policy = freshness(options)
  const { botId } = options
  if (!Number.isSafeInteger(botId) || botId <= 0) {
    throw new ConfigError(
      'a bot id is a positive whole number: the part of its token before the colon',
    )
  }
  const publicKey = publicKeyBytes(options.publicKey ?? 'production')

  const fields = fieldsOf(initData)
  const data = interpret(fields)
  if (data.signature === undefined) {
    throw new InitDataError('the launch data carries no signature to check', 'unsigned')
  }
  if (!SIGNATURE.test(data.signature)) {
    throw new InitDataError('the launch data’s signature is not 64 bytes of base64url', 'malformed')
  }

  const signed = `${botId}:WebAppData\n${checkString(fields, ['hash', 'signature'])}`
  const subtle = subtleCrypto()
  let key: CryptoKey
  try {
    key = await subtle.importKey('raw', publicKey, { name: 'Ed25519' }, false, ['verify'])
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'NotSupportedError') {
      throw new InitDataError(
        'this runtime’s Web Crypto API does not verify Ed25519',
        'unsupported',
        {
          cause,
        },
      )
    }
    throw new ConfigError('the public key is not an Ed25519 key', { cause })
  }
  const valid = await subtle.verify(
    { name: 'Ed25519' },
    key,
    base64UrlBytes(data.signature),
    encoder.encode(signed),
  )
  if (!valid) throw new InitDataError('the launch data’s signature is not Telegram’s', 'mismatch')

  return fresh(data, policy)
}

type Fields = ReadonlyMap<string, string>

async function hmacKey(secret: InitDataSecret): Promise<CryptoKey> {
  const key =
    secret.key !== undefined
      ? keys.get(secret.key)
      : keys.get(await InitDataKey.fromToken(secret.token))
  if (key === undefined) throw new ConfigError('the key was not made by InitDataKey.fromToken')

  return key
}

interface Freshness {
  readonly maxAge: number
  readonly now: number
  readonly clockSkew: number
}

function freshness(options: InitDataFreshness): Freshness {
  const { maxAge, clockSkew = DEFAULT_CLOCK_SKEW } = options
  if (typeof maxAge !== 'number' || Number.isNaN(maxAge) || maxAge <= 0) {
    throw new ConfigError('maxAge is a number of seconds above zero, or Infinity to accept any age')
  }
  if (!Number.isFinite(clockSkew) || clockSkew < 0) {
    throw new ConfigError('clockSkew is a number of seconds, zero or more')
  }
  const now = options.now ?? Math.floor(Date.now() / 1000)
  if (!Number.isFinite(now)) throw new ConfigError('now is a Unix time in seconds')

  return { maxAge, now, clockSkew }
}

function fresh(data: InitData, policy: Freshness): InitData {
  const age = policy.now - data.auth_date
  if (age > policy.maxAge) {
    throw new InitDataError(
      `the launch data is ${age} seconds old, past the limit of ${policy.maxAge}`,
      'expired',
    )
  }
  if (-age > policy.clockSkew) {
    throw new InitDataError(`the launch data is dated ${-age} seconds ahead of the clock`, 'future')
  }

  return data
}

function malformed(why: string): InitDataError {
  return new InitDataError(`not launch data in the form Telegram writes it: ${why}`, 'malformed')
}

/** The pairs of a query string, decoded, refusing every form that could be read two ways. */
function fieldsOf(initData: string): Fields {
  if (typeof initData !== 'string') throw malformed('it is not text')
  if (initData === '') {
    throw new InitDataError(
      'there is no launch data: a Mini App opened from a keyboard button or in inline mode receives none',
      'malformed',
    )
  }

  const fields = new Map<string, string>()
  for (const pair of initData.split('&')) {
    const equals = pair.indexOf('=')
    if (equals === -1) throw malformed('a pair has no "="')

    const name = decoded(pair.slice(0, equals))
    const value = decoded(pair.slice(equals + 1))
    if (!FIELD_NAME.test(name))
      throw malformed('a field name is empty or has characters Telegram does not use')
    if (value.includes('\n')) throw malformed(`${name} contains a line feed`)
    if (fields.has(name)) throw malformed(`${name} appears twice`)
    fields.set(name, value)
  }

  return fields
}

function decoded(text: string): string {
  try {
    return decodeURIComponent(text.replaceAll('+', ' '))
  } catch {
    throw malformed('an escape is not UTF-8')
  }
}

function interpret(fields: Fields): InitData {
  const hash = fields.get('hash')
  if (hash === undefined) throw malformed('it has no hash')
  if (!HASH.test(hash)) throw malformed('hash is not 64 lowercase hexadecimal digits')

  const user = fields.has('user') ? person(fields, 'user') : undefined
  const receiver = fields.has('receiver') ? person(fields, 'receiver') : undefined
  const chat = fields.has('chat') ? chatOf(fields) : undefined
  const canSendAfter = fields.has('can_send_after') ? seconds(fields, 'can_send_after') : undefined

  return {
    ...text(fields, 'query_id'),
    ...text(fields, 'chat_join_request_query_id'),
    ...(user === undefined ? {} : { user }),
    ...(receiver === undefined ? {} : { receiver }),
    ...(chat === undefined ? {} : { chat }),
    ...text(fields, 'chat_type'),
    ...text(fields, 'chat_instance'),
    ...text(fields, 'start_param'),
    ...(canSendAfter === undefined ? {} : { can_send_after: canSendAfter }),
    auth_date: seconds(fields, 'auth_date'),
    hash,
    ...text(fields, 'signature'),
  }
}

function text<N extends string>(fields: Fields, name: N): { readonly [K in N]?: string } {
  const value = fields.get(name)

  return (value === undefined ? {} : { [name]: value }) as { readonly [K in N]?: string }
}

function seconds(fields: Fields, name: string): number {
  const value = fields.get(name)
  if (value === undefined) throw malformed(`it has no ${name}`)
  const number = Number(value)
  if (!UNIX_TIME.test(value) || !Number.isSafeInteger(number)) {
    throw malformed(`${name} is not a whole number of seconds`)
  }

  return number
}

function object(fields: Fields, name: string): Record<string, unknown> {
  let value: unknown
  try {
    value = JSON.parse(fields.get(name) ?? '')
  } catch {
    throw malformed(`${name} is not JSON`)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw malformed(`${name} is not a JSON object`)
  }
  const id = (value as { id?: unknown }).id
  if (typeof id !== 'number' || !Number.isSafeInteger(id)) {
    throw malformed(`${name} has no whole-number id`)
  }

  return value as Record<string, unknown>
}

function person(fields: Fields, name: 'user' | 'receiver'): WebAppUser {
  const value = object(fields, name)
  if (typeof value['first_name'] !== 'string') throw malformed(`${name} has no first_name`)

  return value as unknown as WebAppUser
}

function chatOf(fields: Fields): WebAppChat {
  const value = object(fields, 'chat')
  const type = value['type']
  if (typeof type !== 'string' || !CHAT_TYPES.has(type)) {
    throw malformed('chat is not a group, a supergroup or a channel')
  }
  if (typeof value['title'] !== 'string') throw malformed('chat has no title')

  return value as unknown as WebAppChat
}

/** `name=value` for every field but the excluded ones, sorted by name, joined by line feeds. */
function checkString(fields: Fields, excluded: readonly string[]): string {
  return [...fields.keys()]
    .filter((name) => !excluded.includes(name))
    .sort()
    .map((name) => `${name}=${fields.get(name)}`)
    .join('\n')
}

function subtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle
  if (subtle === undefined) {
    throw new InitDataError(
      'this runtime has no Web Crypto API; a browser offers it only in a secure context',
      'unsupported',
    )
  }

  return subtle
}

function publicKeyBytes(key: 'production' | 'test' | Uint8Array): Uint8Array<ArrayBuffer> {
  if (key === 'production' || key === 'test') return hexBytes(TELEGRAM_INIT_DATA_KEYS[key])
  if (!(key instanceof Uint8Array) || key.length !== 32) {
    throw new ConfigError('an Ed25519 public key is 32 bytes')
  }

  return new Uint8Array(key)
}

function hexBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)

  return bytes
}

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** Unpadded base64url, already checked against {@link SIGNATURE}. */
function base64UrlBytes(text: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(Math.floor((text.length * 6) / 8))
  let buffer = 0
  let bits = 0
  let at = 0
  for (const char of text) {
    // Only the bits not yet written out are kept, so the buffer never outgrows an integer.
    buffer = ((buffer << 6) | BASE64URL.indexOf(char)) & 0x3fff
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes[at++] = (buffer >> bits) & 0xff
    }
  }

  return bytes
}
