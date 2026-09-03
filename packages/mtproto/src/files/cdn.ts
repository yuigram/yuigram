/**
 * Fetching a file from a machine Telegram does not operate.
 *
 * A datacenter may answer a request for a file by naming a delivery node
 * instead of serving it. The node holds the file encrypted and knows nothing
 * about the account asking for it: the token stands in for the request, and the
 * key never reaches the node. So the bytes it returns are not the file, and two
 * things have to happen before they are:
 *
 * ```
 *   node ──> ciphertext ──> decrypt (counter continues from the offset)
 *                       └─> verify  (SHA-256 over the plaintext, per block)
 *                                └─> bytes
 * ```
 *
 * **Verification is not optional and not an optimization.** The node is not
 * operated by Telegram, and a client that decrypts without checking has
 * accepted whatever the node chose to send. Decryption alone proves nothing —
 * counter mode turns any ciphertext into plaintext of the same length, so
 * corruption arrives as bytes rather than as an error.
 *
 * Hashes are published over fixed blocks of the *plaintext*, which is why a
 * range is fetched by whole blocks and cut down afterwards rather than fetched
 * as asked: a fraction of a block cannot be checked against a hash of all of
 * it, and handing back what cannot be checked is the one thing this must not
 * do.
 */

import { NetworkError, ValidationError } from '@yuigram/core'
import { counterAt, ctrCrypt, equalBytes, sha256 } from '../crypto/index.js'
import type { TlValue } from '../tl/index.js'
import { planDownload } from './geometry.js'

/** The block one published hash covers. */
export const HASH_BLOCK = 128 * 1024

/** Times a node may ask for a range to be sent to it before the fetch fails. */
const MAX_REUPLOADS = 3

/** Verification data for one block of a file. */
export interface FileHash {
  readonly offset: number
  readonly limit: number
  readonly hash: Uint8Array
}

/** Where a file is really served from, and what it is served under. */
export interface CdnRedirection {
  /** The delivery node's datacenter. */
  readonly dcId: number
  /** What the node knows the request by. */
  readonly token: Uint8Array
  readonly key: Uint8Array
  readonly iv: Uint8Array
  /** Whatever verification data came with the redirection. */
  readonly hashes: readonly FileHash[]
}

/** How a delivery node is reached, and what may interrupt it. */
export interface CdnAccess {
  /** How to reach a datacenter, delivery node or otherwise. */
  readonly reach: (dcId: number) => { invoke: (query: TlValue) => Promise<TlValue> }
  /** The datacenter that issued the redirection, which is what reissues ranges. */
  readonly originDcId: number
  /** Throws if the transfer has been withdrawn. */
  readonly stop: () => void
}

/**
 * Read a redirection out of an answer, or say the answer is not one.
 *
 * Returning nothing rather than throwing: being redirected is an ordinary
 * answer to an ordinary request, and the caller has a range in hand either way.
 */
export function readRedirection(answer: TlValue): CdnRedirection | undefined {
  if (answer._ !== 'upload.fileCdnRedirect') return undefined

  return {
    dcId: readInt(answer, 'dc_id'),
    token: readBytes(answer, 'file_token'),
    key: readBytes(answer, 'encryption_key'),
    iv: readBytes(answer, 'encryption_iv'),
    hashes: readHashes(answer['file_hashes']),
  }
}

/**
 * One file, as served by a delivery node.
 *
 * Holds what the redirection said and the verification data gathered since.
 * Ranges are asked for by whole blocks so that what arrives can be checked, and
 * what the caller wanted is cut out of the result afterwards.
 */
export class CdnFile {
  readonly #hashes = new Map<number, FileHash>()

  constructor(
    private readonly redirection: CdnRedirection,
    private readonly access: CdnAccess,
  ) {
    this.#keep(redirection.hashes)
  }

  /** The delivery node this file is being fetched from. */
  get dcId(): number {
    return this.redirection.dcId
  }

  /**
   * The plaintext of a range, decrypted and checked.
   *
   * The range is widened to the blocks that contain it, because a hash covers a
   * block and a piece of one cannot be checked against it. The extra bytes are
   * dropped once they have done their job.
   */
  async fetch(offset: number, limit: number): Promise<Uint8Array> {
    const from = Math.floor(offset / HASH_BLOCK) * HASH_BLOCK
    const to = Math.ceil((offset + limit) / HASH_BLOCK) * HASH_BLOCK

    const plain = await this.#plaintext(from, to)
    await this.#verify(from, plain)

    // A short answer is the file ending, so what is returned may be shorter
    // than what was asked for — the caller reads that the same way it reads a
    // short answer from a datacenter.
    const start = Math.min(offset - from, plain.length)

    return plain.subarray(start, Math.min(start + limit, plain.length))
  }

  /** Fetch and decrypt a whole-block span, in ranges the node will answer. */
  async #plaintext(from: number, to: number): Promise<Uint8Array> {
    const pieces: Uint8Array[] = []
    let total = 0

    // The node answers the same ranges a datacenter does, so how a span is
    // divided is decided where that is already decided.
    for (const range of planDownload({ size: to, offset: from })) {
      const encrypted = await this.#chunk(range.offset, range.limit)
      if (encrypted.length === 0) break

      const plain = ctrCrypt(
        encrypted,
        this.redirection.key,
        counterAt(this.redirection.iv, range.offset),
      )
      pieces.push(plain)
      total += plain.length

      // Less than was asked for is the file ending, exactly as elsewhere.
      if (encrypted.length < range.limit) break
    }

    const whole = new Uint8Array(total)
    let at = 0
    for (const piece of pieces) {
      whole.set(piece, at)
      at += piece.length
    }

    return whole
  }

  /**
   * One encrypted range from the node.
   *
   * A node that has not been given the range yet says so instead of serving it,
   * and the datacenter has to be asked to send it there. That is a step in
   * getting the range rather than a failed attempt at it, so it does not spend
   * the transfer's attempts — but it is bounded, because a node that always
   * says it is not ready describes a loop.
   */
  async #chunk(offset: number, limit: number): Promise<Uint8Array> {
    for (let reuploads = 0; reuploads <= MAX_REUPLOADS; reuploads += 1) {
      this.access.stop()

      const answer = await this.access.reach(this.redirection.dcId).invoke({
        _: 'upload.getCdnFile',
        file_token: this.redirection.token,
        offset: BigInt(offset),
        limit,
      })

      if (answer._ === 'upload.cdnFile') return readBytes(answer, 'bytes')

      if (answer._ !== 'upload.cdnFileReuploadNeeded') {
        throw new NetworkError(
          `expected part of a file from a delivery node, received '${answer._}'`,
        )
      }

      await this.#reupload(readBytes(answer, 'request_token'))
    }

    throw new NetworkError(
      `the delivery node asked for the range at ${offset} to be sent to it more than ${MAX_REUPLOADS} times`,
    )
  }

  /**
   * Ask the datacenter to send a range to the node.
   *
   * Answered with verification data for what it sent, which is kept: it is the
   * only thing published about a range the node did not have a moment ago.
   */
  async #reupload(requestToken: Uint8Array): Promise<void> {
    this.access.stop()

    const answer = await this.access.reach(this.access.originDcId).invoke({
      _: 'upload.reuploadCdnFile',
      file_token: this.redirection.token,
      request_token: requestToken,
    })

    this.#keep(readHashes(answer))
  }

  /**
   * Check plaintext against what was published for it.
   *
   * Every block the span covers must be described by a hash, and a block that
   * nothing describes is a failure rather than a block to let through — the
   * absence of verification data is exactly what a node wanting to substitute
   * content would arrange.
   */
  async #verify(from: number, plain: Uint8Array): Promise<void> {
    for (let at = 0; at < plain.length; at += HASH_BLOCK) {
      const offset = from + at
      const hash = this.#hashes.get(offset) ?? (await this.#askForHashes(offset))
      if (hash === undefined) {
        throw new NetworkError(`nothing was published to check the file at ${offset} against`)
      }

      // Whatever there is of the block. A block cut short by the file ending is
      // checked against a hash published for a short block and agrees; one cut
      // short by a node holding back bytes is checked against a hash for the
      // whole block and does not.
      const block = plain.subarray(at, at + Math.min(hash.limit, plain.length - at))
      if (!equalBytes(sha256(block), hash.hash)) {
        throw new NetworkError(`the file at ${offset} does not match what was published for it`)
      }
    }
  }

  /** Ask the node for verification data covering an offset it has none for. */
  async #askForHashes(offset: number): Promise<FileHash | undefined> {
    this.access.stop()

    const answer = await this.access.reach(this.redirection.dcId).invoke({
      _: 'upload.getCdnFileHashes',
      file_token: this.redirection.token,
      offset: BigInt(offset),
    })

    this.#keep(readHashes(answer))

    return this.#hashes.get(offset)
  }

  #keep(hashes: readonly FileHash[]): void {
    for (const hash of hashes) this.#hashes.set(hash.offset, hash)
  }
}

/** Read published verification data, however the answer wrapped it. */
function readHashes(value: unknown): FileHash[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === 'object' && value !== null && Array.isArray((value as TlValue)['items'])
      ? ((value as TlValue)['items'] as unknown[])
      : []

  return items.filter(isTlValue).map((item) => ({
    offset: Number(readLong(item, 'offset')),
    limit: readInt(item, 'limit'),
    hash: readBytes(item, 'hash'),
  }))
}

function isTlValue(value: unknown): value is TlValue {
  return typeof value === 'object' && value !== null && typeof (value as TlValue)._ === 'string'
}

function readInt(value: TlValue, field: string): number {
  const raw = value[field]
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    throw new ValidationError(`'${value._}.${field}' must be a whole number`)
  }

  return raw
}

function readLong(value: TlValue, field: string): bigint {
  const raw = value[field]
  if (typeof raw === 'bigint') return raw
  if (typeof raw === 'number' && Number.isInteger(raw)) return BigInt(raw)

  throw new ValidationError(`'${value._}.${field}' must be a 64-bit integer`)
}

function readBytes(value: TlValue, field: string): Uint8Array {
  const raw = value[field]
  if (!(raw instanceof Uint8Array)) {
    throw new ValidationError(`'${value._}.${field}' must be a byte string`)
  }

  return raw
}
