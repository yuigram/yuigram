/**
 * A datacenter that stores and serves files, and lies about them on request.
 *
 * File transfer is where a client is most easily wrong in ways nothing reports:
 * a part sent under the wrong number, a range that quietly stops short, a
 * reference that expired hours ago, a chunk from a machine Telegram does not
 * operate. None of those announce themselves, so the server that proves a
 * client is right has to be able to produce every one of them on demand.
 *
 * ```
 *   upload   ──> parts ──> assembled file
 *   download ──> ranges <── generated content
 *   redirect ──> encrypted chunks + hashes  (a cache, not Telegram)
 * ```
 *
 * It models state rather than answering with fixtures. Uploaded parts are kept
 * and assembled, so an upload is judged by what arrived rather than by how many
 * calls were made. Downloadable content is a pure function of an identifier and
 * an offset, so a range can be checked byte for byte without the server holding
 * megabytes — and so two runs of the same case produce the same bytes.
 *
 * Nothing here is random and nothing happens on a timer. Every departure from
 * good behaviour is asked for by name.
 */

import { createCipheriv } from 'node:crypto'
import { TelegramError } from '@yuigram/core'
import { sha256 } from '../../src/crypto/hash.js'
import { MigrationError } from '../../src/session/dispatcher.js'
import type { TlValue } from '../../src/tl/index.js'

/** The block a CDN hash covers. */
const HASH_BLOCK = 128 * 1024

/**
 * How much content the server will make up in one answer.
 *
 * A bound on the range rather than on the file: files are large — which is what
 * sixty-four-bit offsets exist for — and the server holds none of one, so what
 * has to stay small is the piece it hands back.
 */
const MAX_RANGE = 4 * 1024 * 1024

/** A file the server is holding, and where it lives. */
export interface StoredFile {
  /** The datacenter that will serve it. */
  readonly dcId: number
  readonly size: number
  /** Where the reference for it came from, so a stale one can be refreshed. */
  readonly origin: FileOrigin
}

/**
 * What issued a file reference.
 *
 * A reference is only refreshed by going back to whatever produced it, so the
 * server records that rather than handing out replacements on request — a
 * client that could ask for a fresh reference directly would never have to get
 * the origin right.
 */
export interface FileOrigin {
  readonly kind: 'message' | 'profile-photo' | 'story'
  /** Which peer the origin belongs to. */
  readonly peerId: bigint
  /** Which message, story or photo it is. */
  readonly id: number
}

/** What the server should do instead of behaving. */
export interface FileFaults {
  /** Serve this file only from a content delivery node. */
  readonly viaCdn?: boolean
  /** Ask for a re-upload the first time each CDN range is fetched. */
  readonly cdnReuploadFirst?: boolean
  /** Hand back chunks that do not match the hashes published for them. */
  readonly corruptCdn?: boolean
  /** Publish no verification data for the file at all. */
  readonly withoutCdnHashes?: boolean
  /** Publish verification data that does not describe the content. */
  readonly wrongCdnHashes?: boolean
  /** Stop a download short of the end, as a server under load may. */
  readonly shortRead?: boolean
}

export class FileServerError extends Error {}

/** Content this server would serve for a file, at any offset. */
export function contentOf(fileId: bigint, offset: number, length: number): Uint8Array {
  if (offset < 0 || length < 0) throw new FileServerError('a range must be positive')
  if (length > MAX_RANGE) {
    throw new FileServerError(`this server will not make up ${length} bytes at once`)
  }

  const seed = Number(BigInt.asUintN(16, fileId))

  const bytes = new Uint8Array(length)
  for (let index = 0; index < length; index += 1) {
    const at = offset + index
    bytes[index] = (seed * 7 + at * 31 + ((at >> 8) & 0xff) * 13 + 5) & 0xff
  }

  return bytes
}

/**
 * The authoritative side of a file transfer.
 *
 * One instance stands for one datacenter. A file belongs to a datacenter, and
 * asking the wrong one is answered the way Telegram answers it — with the
 * number of the one to ask instead.
 */
export class FileServer {
  /** Which datacenter this instance is. */
  readonly dcId: number

  readonly #files = new Map<string, StoredFile>()
  /** Reference bytes currently accepted, by file. */
  readonly #references = new Map<string, string>()
  /** Parts received for an upload, by file then part number. */
  readonly #uploads = new Map<string, Map<number, Uint8Array>>()
  /** What each upload said its total would be, when it said. */
  readonly #declared = new Map<string, number>()
  /** Tokens handed out for content delivery, and what they stand for. */
  readonly #tokens = new Map<string, { fileId: bigint; key: Uint8Array; iv: Uint8Array }>()
  /** How many references have been issued for each file, so each is distinct. */
  readonly #issued = new Map<string, number>()
  /** Ranges already asked for once, for the re-upload fault. */
  readonly #asked = new Set<string>()
  /** Ranges a node has been told to ask for, by the token standing for each. */
  readonly #reuploads = new Map<string, { fileId: bigint; offset: number }>()

  faults: FileFaults = {}

  /** Every request this datacenter was asked to answer. */
  readonly asked: TlValue[] = []

  constructor(dcId = 2) {
    this.dcId = dcId
  }

  /** Put a file where it can be downloaded, and say where its reference came from. */
  add(
    fileId: bigint,
    options: { size: number; dcId?: number; origin?: FileOrigin; reference?: string },
  ): { fileId: bigint; reference: Uint8Array } {
    const key = fileId.toString()
    this.#files.set(key, {
      dcId: options.dcId ?? this.dcId,
      size: options.size,
      origin: options.origin ?? { kind: 'message', peerId: 1n, id: 1 },
    })

    const reference = options.reference ?? `ref-${key}-1`
    this.#references.set(key, reference)

    return { fileId, reference: encode(reference) }
  }

  /** Make the reference this file is currently served with stop working. */
  expire(fileId: bigint): void {
    this.#references.delete(fileId.toString())
  }

  /** Issue a new reference, as refetching the origin would. */
  refresh(fileId: bigint): Uint8Array {
    const key = fileId.toString()
    const existing = this.#files.get(key)
    if (existing === undefined) throw new FileServerError(`nothing is stored for ${fileId}`)

    const issued = (this.#issued.get(key) ?? 1) + 1
    this.#issued.set(key, issued)
    const reference = `ref-${key}-${issued}`
    this.#references.set(key, reference)

    return encode(reference)
  }

  /** What the origin of a file's reference is, for a case to assert on. */
  originOf(fileId: bigint): FileOrigin | undefined {
    return this.#files.get(fileId.toString())?.origin
  }

  /** The parts received for an upload, assembled in order. */
  assembled(fileId: bigint): Uint8Array | undefined {
    const parts = this.#uploads.get(fileId.toString())
    const total = this.#declared.get(fileId.toString())
    if (parts === undefined) return undefined

    const count = total ?? parts.size
    const ordered: Uint8Array[] = []
    for (let index = 0; index < count; index += 1) {
      const part = parts.get(index)
      // A missing part is a hole, and an upload with a hole is not a file.
      if (part === undefined) return undefined
      ordered.push(part)
    }

    return concat(ordered)
  }

  /** How many parts have been received for an upload. */
  received(fileId: bigint): number {
    return this.#uploads.get(fileId.toString())?.size ?? 0
  }

  /** Answer a request the way this datacenter would. */
  invoke(query: TlValue): TlValue {
    this.asked.push(query)

    switch (query._) {
      case 'upload.saveFilePart':
        return this.#savePart(query, undefined)
      case 'upload.saveBigFilePart':
        return this.#savePart(query, readInt(query, 'file_total_parts'))
      case 'upload.getFile':
        return this.#getFile(query)
      case 'upload.getCdnFile':
        return this.#getCdnFile(query)
      case 'upload.getCdnFileHashes':
        return this.#cdnHashes(query)
      case 'upload.reuploadCdnFile':
        return this.#reupload(query)
      default:
        throw new FileServerError(`this datacenter was not asked to answer '${query._}'`)
    }
  }

  #savePart(query: TlValue, total: number | undefined): TlValue {
    const fileId = readLong(query, 'file_id')
    const index = readInt(query, 'file_part')
    const bytes = readBytes(query, 'bytes')
    const key = fileId.toString()

    if (index < 0) throw new TelegramError('FILE_PART_INVALID (400)')

    if (total !== undefined) {
      // A stream says it does not know yet by sending a negative total, and
      // says so for real once it does.
      if (total >= 0) {
        const declared = this.#declared.get(key)
        if (declared !== undefined && declared !== total) {
          throw new TelegramError('FILE_PART_SIZE_CHANGED (400)')
        }
        this.#declared.set(key, total)
      }
      if (total >= 0 && index >= total) {
        throw new TelegramError('FILE_PART_INVALID (400)')
      }
    }

    const parts = this.#uploads.get(key) ?? new Map<number, Uint8Array>()
    parts.set(index, bytes)
    this.#uploads.set(key, parts)

    return { _: 'boolTrue' }
  }

  #getFile(query: TlValue): TlValue {
    const location = query['location']
    if (typeof location !== 'object' || location === null) {
      throw new FileServerError('a download must name a location')
    }

    const fileId = readLong(location as TlValue, 'id')
    const key = fileId.toString()
    const file = this.#files.get(key)
    if (file === undefined) throw new TelegramError('FILE_ID_INVALID (400)')

    // The reference is checked before anything else: an expired one is the
    // ordinary way a stored location stops working.
    const reference = (location as TlValue)['file_reference']
    const expected = this.#references.get(key)
    if (expected === undefined) throw new TelegramError('FILE_REFERENCE_EXPIRED (400)')
    if (!(reference instanceof Uint8Array) || decode(reference) !== expected) {
      throw new TelegramError('FILE_REFERENCE_INVALID (400)')
    }

    if (file.dcId !== this.dcId) {
      throw new MigrationError(`FILE_MIGRATE_${file.dcId} (303)`, {
        kind: 'file',
        dcId: file.dcId,
      })
    }

    const offset = Number(readLong(query, 'offset'))
    const limit = readInt(query, 'limit')
    if (offset < 0 || offset % 1024 !== 0) throw new TelegramError('OFFSET_INVALID (400)')
    if (limit <= 0) throw new TelegramError('LIMIT_INVALID (400)')

    if (this.faults.viaCdn === true && query['cdn_supported'] === true) {
      return this.#redirect(fileId, file)
    }

    return {
      _: 'upload.file',
      type: { _: 'storage.filePartial' },
      mtime: 0,
      bytes: this.#slice(fileId, file, offset, limit),
    }
  }

  /** The bytes of a range, stopping at the end of the file. */
  #slice(fileId: bigint, file: StoredFile, offset: number, limit: number): Uint8Array {
    if (offset >= file.size) return new Uint8Array(0)

    const available = Math.min(limit, file.size - offset)
    const length = this.faults.shortRead === true ? Math.max(available - 1024, 0) : available

    return contentOf(fileId, offset, length)
  }

  #redirect(fileId: bigint, file: StoredFile): TlValue {
    const token = `token-${fileId}`
    const key = new Uint8Array(32).fill(7)
    const iv = new Uint8Array(16).fill(9)
    this.#tokens.set(token, { fileId, key, iv })

    return {
      _: 'upload.fileCdnRedirect',
      dc_id: this.dcId + 100,
      file_token: encode(token),
      encryption_key: key,
      encryption_iv: iv,
      file_hashes: this.faults.withoutCdnHashes === true ? [] : this.#hashes(fileId, file, 0),
    }
  }

  /**
   * Verification data for a file, from a given offset.
   *
   * Computed over the content the client will hold once it has decrypted what
   * the delivery node sent — which is what makes the check worth anything: a
   * hash over the encrypted bytes would prove only that the node repeated what
   * it was given.
   */
  #hashes(fileId: bigint, file: StoredFile, from: number): TlValue[] {
    const hashes: TlValue[] = []

    for (let offset = from; offset < file.size; offset += HASH_BLOCK) {
      const limit = Math.min(HASH_BLOCK, file.size - offset)
      const digest =
        this.faults.wrongCdnHashes === true
          ? new Uint8Array(32).fill(0xff)
          : sha256(contentOf(fileId, offset, limit))

      hashes.push({ _: 'fileHash', offset: BigInt(offset), limit, hash: digest })
    }

    return hashes
  }

  #getCdnFile(query: TlValue): TlValue {
    const token = decode(readBytes(query, 'file_token'))
    const held = this.#tokens.get(token)
    if (held === undefined) throw new TelegramError('FILE_TOKEN_INVALID (400)')

    const offset = Number(readLong(query, 'offset'))
    const limit = readInt(query, 'limit')
    const seen = `${token}:${offset}`

    // A delivery node that has not been given the range yet says so, and the
    // client has to ask the datacenter to send it there before asking again.
    if (this.faults.cdnReuploadFirst === true && !this.#asked.has(seen)) {
      this.#asked.add(seen)
      const request = `reupload-${seen}`
      // The token stands for this range and nothing else, so a client that
      // quotes another one is asking about something the node never mentioned.
      this.#reuploads.set(request, { fileId: held.fileId, offset })

      return { _: 'upload.cdnFileReuploadNeeded', request_token: encode(request) }
    }

    const file = this.#files.get(held.fileId.toString())
    if (file === undefined) throw new FileServerError('a token outlived its file')

    const plain = this.#slice(held.fileId, file, offset, limit)
    const bytes = this.faults.corruptCdn === true ? plain.map((byte) => byte ^ 0xff) : plain

    return { _: 'upload.cdnFile', bytes: encrypt(bytes, held.key, held.iv, offset) }
  }

  /**
   * Send a range to a delivery node that does not have it.
   *
   * Answered with the verification data for what was sent, which is what makes
   * the answer worth keeping: it describes a range the node was holding nothing
   * for a moment ago, and a client that discards it has to ask again for
   * something it was already given.
   */
  #reupload(query: TlValue): TlValue {
    const token = decode(readBytes(query, 'file_token'))
    const held = this.#tokens.get(token)
    if (held === undefined) throw new TelegramError('FILE_TOKEN_INVALID (400)')

    const request = decode(readBytes(query, 'request_token'))
    const wanted = this.#reuploads.get(request)
    // A token this datacenter never issued names no range, and one issued for
    // another file names a range this token cannot speak for.
    if (wanted === undefined || wanted.fileId !== held.fileId) {
      throw new TelegramError('REQUEST_TOKEN_INVALID (400)')
    }

    this.#reuploads.delete(request)

    const file = this.#files.get(held.fileId.toString())
    if (file === undefined) throw new FileServerError('a token outlived its file')

    return { _: 'vector', items: this.#hashes(held.fileId, file, wanted.offset) }
  }

  #cdnHashes(query: TlValue): TlValue {
    const token = decode(readBytes(query, 'file_token'))
    const held = this.#tokens.get(token)
    if (held === undefined) throw new TelegramError('FILE_TOKEN_INVALID (400)')

    const file = this.#files.get(held.fileId.toString())
    if (file === undefined) throw new FileServerError('a token outlived its file')

    return {
      _: 'vector',
      items: this.#hashes(held.fileId, file, Number(readLong(query, 'offset'))),
    }
  }
}

/**
 * Encrypt a range the way a delivery node does.
 *
 * The counter continues from where the range starts rather than restarting, so
 * a client that decrypts a range as though it were the first would produce
 * plausible-looking rubbish. Sixteen bytes to a block.
 */
export function encrypt(
  plain: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
  offset: number,
): Uint8Array {
  const counter = new Uint8Array(iv)
  new DataView(counter.buffer, counter.byteOffset).setUint32(12, offset / 16, false)

  const cipher = createCipheriv('aes-256-ctr', key, counter)

  return new Uint8Array(Buffer.concat([cipher.update(plain), cipher.final()]))
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }

  return out
}

function readLong(value: TlValue, field: string): bigint {
  const raw = value[field]
  if (typeof raw !== 'bigint') {
    throw new FileServerError(`'${value._}.${field}' must be a 64-bit integer`)
  }

  return raw
}

function readInt(value: TlValue, field: string): number {
  const raw = value[field]
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    throw new FileServerError(`'${value._}.${field}' must be a whole number`)
  }

  return raw
}

function readBytes(value: TlValue, field: string): Uint8Array {
  const raw = value[field]
  if (!(raw instanceof Uint8Array)) {
    throw new FileServerError(`'${value._}.${field}' must be a byte string`)
  }

  return raw
}
