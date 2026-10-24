// SPDX-License-Identifier: MIT

/**
 * Uploading a file once and sending it by identifier after that.
 *
 * Telegram gives every file it receives an identifier, and sending that
 * identifier again costs nothing: no upload, no bandwidth, no wait. A bot that
 * sends the same logo, sticker or voice line over and over only needs to upload
 * it the first time. This keeps the identifiers:
 *
 * ```ts
 * const cache = mediaCache({ storage: sqliteStore(database, { table: 'media' }) })
 * bot.extend(cache)
 *
 * await message.sendPhoto({ photo: media.path('./logo.png') })  // uploaded
 * await message.sendPhoto({ photo: media.path('./logo.png') })  // sent by identifier
 * ```
 *
 * ## What a file is called
 *
 * ```
 *   <bot id> : <media kind> : <source>
 *
 *   source   path:./logo.png        a file on disk, by the path it was given
 *            url:https://…          a URL Telegram fetches
 *            sha256:…               bytes in memory, by their digest
 *            key:<name>             whatever the caller named it
 * ```
 *
 * An identifier belongs to the bot that received it, so the bot is part of the
 * name; it is good in any chat that bot writes to, so the chat is not. The
 * media kind is part of it too: a file sent as a document and the same file
 * sent as a photo come back as two different identifiers, and a photo's cannot
 * be sent as a document.
 *
 * A stream that can be read only once is never digested, since reading it to
 * name it would leave nothing to upload; it is uploaded every time unless the
 * caller names it with `cacheKey`. A file named `cacheKey: false` is never
 * cached. An identifier already in the call is left alone.
 *
 * ## When an identifier goes bad
 *
 * Telegram occasionally stops accepting an identifier. A call that sent a
 * cached one and was refused *for that reason* — a 400 saying the identifier is
 * wrong — sent nothing, so it is safe to make once more with the original file;
 * the stale entry is dropped and the new identifier kept. Any other failure is
 * the caller's, unchanged, and nothing is ever cached from a failed call.
 *
 * ## Two sends at once
 *
 * Two calls uploading the same file at the same moment would upload it twice.
 * The second waits for the first and sends its identifier instead; if the first
 * fails, the second uploads for itself.
 */

import type { ApiCall, ApiHook } from './api.js'
import { ConfigError, type KV, memory, type Plugin } from './core.js'
import { BotApiError } from './errors.js'
import { type MediaOrigin, originOf } from './media.js'

/** The parameter each cacheable method carries its file in. */
export const CACHEABLE_METHODS = {
  sendPhoto: 'photo',
  sendVideo: 'video',
  sendAnimation: 'animation',
  sendVideoNote: 'video_note',
  sendAudio: 'audio',
  sendDocument: 'document',
  sendSticker: 'sticker',
  sendVoice: 'voice',
} as const

/** A kind of media, as the parameter that carries it is named. */
export type MediaKind = (typeof CACHEABLE_METHODS)[keyof typeof CACHEABLE_METHODS]

/** Descriptions of a refusal that means the identifier sent is no longer good. */
const STALE_IDENTIFIER = [
  'wrong file identifier',
  'wrong remote file identifier',
  'wrong file_id',
  'file is temporarily unavailable',
] as const

/** Options for {@link mediaCache}. */
export interface MediaCacheOptions {
  /**
   * Where identifiers are kept. In memory, bounded to 10,000, unless given.
   *
   * A persistent store keeps them across restarts, and one shared by several
   * processes of one bot lets each send what another uploaded.
   */
  readonly storage?: KV<string>
  /**
   * How a file on disk is named: by its `path` as given (the default), or by a
   * digest of its `content`, which costs reading it before each upload but
   * treats two paths to the same bytes as one file and an edited file as a new
   * one.
   */
  readonly keyFilesBy?: 'path' | 'content'
  /** Descriptions, matched without regard to case, that mean an identifier went bad. */
  readonly staleDescriptions?: readonly string[]
}

/** What an installed cache offers, for looking entries up and dropping them. */
export interface MediaCache
  extends Plugin<
    'mediaCache',
    undefined,
    { hook(hook: ApiHook): unknown; identify(): Promise<{ readonly id: number }> }
  > {
  /** Where identifiers are kept. */
  readonly storage: KV<string>
  /** The identifier kept for a file, if there is one. */
  lookup(kind: MediaKind, source: unknown): Promise<string | undefined>
  /** Forget the identifier kept for a file, so its next send uploads it again. */
  invalidate(kind: MediaKind, source: unknown): Promise<void>
}

/** Where a result carries the identifier of the file it was sent with. */
function identifierIn(result: unknown, kind: MediaKind): string | undefined {
  if (typeof result !== 'object' || result === null) return undefined
  const message = result as Record<string, unknown>

  // An animation also arrives as a document; either names the same file.
  const slot = message[kind] ?? (kind === 'animation' ? message['document'] : undefined)
  if (Array.isArray(slot)) {
    // A photo comes back as its sizes, largest last.
    const largest = slot.at(-1) as { readonly file_id?: unknown } | undefined
    return typeof largest?.file_id === 'string' ? largest.file_id : undefined
  }
  if (typeof slot === 'object' && slot !== null) {
    const id = (slot as { readonly file_id?: unknown }).file_id
    return typeof id === 'string' ? id : undefined
  }
  return undefined
}

/** Hex of a SHA-256 digest, by the platform's own implementation. */
async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Every byte of a replayable file, read once for its digest. */
async function bytesOf(data: unknown): Promise<Uint8Array | undefined> {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (typeof Blob !== 'undefined' && data instanceof Blob)
    return new Uint8Array(await data.arrayBuffer())
  if (typeof data === 'object' && data !== null && Symbol.asyncIterator in data) {
    const chunks: Uint8Array[] = []
    for await (const chunk of data as AsyncIterable<Uint8Array>) chunks.push(chunk)
    const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
    let at = 0
    for (const chunk of chunks) {
      out.set(chunk, at)
      at += chunk.length
    }
    return out
  }
  return undefined
}

/**
 * The name a source is cached under, or `undefined` for one that is not cached.
 *
 * Reads a file's bytes only when they can be read again for the upload.
 */
async function sourceKey(
  source: unknown,
  keyFilesBy: 'path' | 'content',
): Promise<string | undefined> {
  if (typeof source === 'string') {
    // A URL is named by itself. Anything else is an identifier, or a reference
    // into a multipart body, and has nothing to cache.
    return /^https?:\/\//i.test(source) ? `url:${source}` : undefined
  }

  const origin: MediaOrigin | undefined = originOf(source)
  if (origin === undefined) return undefined
  if (origin.cacheKey === false) return undefined
  if (typeof origin.cacheKey === 'string') return `key:${origin.cacheKey}`
  if (!origin.replayable) return undefined
  if (origin.path !== undefined && keyFilesBy === 'path') return `path:${origin.path}`

  // A file that exists only as bytes — or a file on disk named by content —
  // is named by a digest. A replayable stream is not read to be named: that
  // would mean producing it twice for every send.
  const data = (source as { readonly data?: unknown }).data
  if (
    origin.path === undefined &&
    typeof data === 'object' &&
    data !== null &&
    Symbol.asyncIterator in data
  ) {
    return undefined
  }
  const bytes = await bytesOf(data)
  return bytes === undefined ? undefined : `sha256:${await sha256(bytes)}`
}

/**
 * A file-identifier cache for one bot.
 *
 * Install it with `bot.extend(...)`; it names the bot it was installed on, so
 * one instance serves one bot, and a second `extend` with it is refused.
 */
export function mediaCache(options: MediaCacheOptions = {}): MediaCache {
  const storage = options.storage ?? memory<string>({ max: 10_000 })
  const keyFilesBy = options.keyFilesBy ?? 'path'
  const stale = (options.staleDescriptions ?? STALE_IDENTIFIER).map((text) => text.toLowerCase())
  // Uploads in flight, by name: what a second send of the same file waits for.
  const uploading = new Map<string, Promise<string | undefined>>()
  let owner: { identify(): Promise<{ readonly id: number }> } | undefined

  const nameOf = async (kind: MediaKind, source: unknown): Promise<string | undefined> => {
    if (owner === undefined) {
      throw new ConfigError('this media cache is not installed on a bot yet')
    }
    const key = await sourceKey(source, keyFilesBy)
    if (key === undefined) return undefined
    const me = await owner.identify()
    return `${me.id}:${kind}:${key}`
  }

  const isStale = (error: unknown): boolean =>
    error instanceof BotApiError &&
    error.code === 400 &&
    stale.some((text) => error.description.toLowerCase().includes(text))

  const hook: ApiHook = async (call: ApiCall, next) => {
    const kind = (CACHEABLE_METHODS as Record<string, MediaKind | undefined>)[call.method]
    if (kind === undefined) return next()

    const original = call.params[kind]
    const name = await nameOf(kind, original)
    if (name === undefined) return next()

    const kept = await storage.get(name)
    if (kept !== undefined) {
      return await sendByIdentifier(call, next, { name, kind, original, identifier: kept })
    }

    // Checked and claimed in one step, with nothing awaited between: two sends
    // that both found nothing kept must not both become the upload.
    const ahead = uploading.get(name)
    if (ahead === undefined) return await upload(name, kind, next)

    const identifier = await ahead
    if (identifier !== undefined) {
      return await sendByIdentifier(call, next, { name, kind, original, identifier })
    }
    // The upload being waited for failed; this send uploads for itself.
    return await upload(name, kind, next)
  }

  /**
   * Send an identifier in place of the file, and fall back to the file once if
   * Telegram says the identifier is no longer good.
   *
   * That refusal comes before anything is sent, so sending the file itself is
   * not a second message. Only this name's entry goes, and only if it is still
   * the identifier that was refused.
   */
  const sendByIdentifier = async (
    call: ApiCall,
    next: () => Promise<unknown>,
    sending: {
      readonly name: string
      readonly kind: MediaKind
      readonly original: unknown
      readonly identifier: string
    },
  ): Promise<unknown> => {
    call.params = { ...call.params, [sending.kind]: sending.identifier }
    try {
      return await next()
    } catch (error) {
      if (!isStale(error)) throw error
      if ((await storage.get(sending.name)) === sending.identifier)
        await storage.delete(sending.name)
      call.params = { ...call.params, [sending.kind]: sending.original }
      return await upload(sending.name, sending.kind, next)
    }
  }

  /** Upload, keep the identifier the answer carries, and let others waiting on it have it. */
  const upload = async (name: string, kind: MediaKind, next: () => Promise<unknown>) => {
    let settle: (identifier: string | undefined) => void = () => undefined
    const shared = new Promise<string | undefined>((resolve) => {
      settle = resolve
    })
    uploading.set(name, shared)

    try {
      const result = await next()
      const identifier = identifierIn(result, kind)
      if (identifier !== undefined) await storage.set(name, identifier)
      settle(identifier)
      return result
    } catch (error) {
      // A failed upload caches nothing; whoever was waiting uploads for itself.
      settle(undefined)
      throw error
    } finally {
      if (uploading.get(name) === shared) uploading.delete(name)
    }
  }

  return {
    name: 'mediaCache',
    storage,
    install(target) {
      if (owner !== undefined && owner !== target) {
        throw new ConfigError(
          'this media cache is already installed on another bot; an identifier belongs to one bot, so make one cache per bot',
        )
      }
      owner = target
      target.hook(hook)
      return undefined
    },
    async lookup(kind, source) {
      const name = await nameOf(kind, source)
      return name === undefined ? undefined : await storage.get(name)
    },
    async invalidate(kind, source) {
      const name = await nameOf(kind, source)
      if (name !== undefined) await storage.delete(name)
    },
  }
}
