/**
 * Sending a file, one part at a time.
 *
 * A file is not sent; its parts are, each under a number, and the file exists
 * only once every number has been accounted for. Nothing about that is
 * transactional — the datacenter accumulates parts under an identifier the
 * client invents and assembles them when it is told how many there were — so
 * what makes an upload correct is that every part arrives exactly once, under
 * the right number, and that nothing claims the file is finished before they
 * have.
 *
 * ```
 *   source ──> parts ──> datacenter
 *                          │
 *                          └──> a file, once every part is accounted for
 * ```
 *
 * **The reference is built last.** A file object handed to a caller says the
 * upload succeeded, so it is constructed only after every part has been
 * acknowledged. An upload that failed part-way produces an error, never an
 * object naming a file the datacenter cannot assemble.
 *
 * **A part may be sent again; the upload may not.** Sending a part under the
 * same number twice leaves the same file, because the datacenter keeps parts by
 * number rather than by arrival — so a part whose outcome is unknown is safe to
 * repeat, and that is the only thing this repeats.
 */

import { CancelledError, ValidationError } from '@yuigram/core'
import { md5 } from '../crypto/hash.js'
import { randomBytes } from '../crypto/random.js'
import type { Callable } from '../network/migration.js'
import { MigrationError } from '../session/dispatcher.js'
import type { TlValue } from '../tl/index.js'
import { partAt, planUpload } from './geometry.js'

/** Attempts made on one part before the upload gives up on it. */
const DEFAULT_ATTEMPTS = 3

/** Parts in flight at once, when a caller does not say. */
const DEFAULT_CONCURRENCY = 4

/** Datacenters an upload will be redirected to before it gives up. */
const MAX_REDIRECTIONS = 3

/** The value that says a total is not known yet. */
const UNKNOWN_TOTAL = -1

/**
 * Where the bytes come from.
 *
 * A read returns what it can, and fewer bytes than asked for means the end. A
 * source that knows its length can be read at any offset, which is what lets
 * parts go out at the same time; one that does not is read in order, because
 * finding the end is what discovering the length consists of.
 */
export interface UploadSource {
  /** The length in bytes, when it is known. */
  readonly size?: number
  /** Read at an offset. Fewer bytes than asked for means the end of the file. */
  read(offset: number, length: number): Promise<Uint8Array>
}

/** How a file is sent. */
export interface UploadOptions {
  readonly source: UploadSource
  /** How to reach a datacenter, including the one to start at. */
  readonly reach: (dcId: number) => Callable
  /** The datacenter to send to. */
  readonly dcId: number
  /** The name the file is given. Nothing depends on it. */
  readonly name?: string
  /** How much each part carries. Defaults to the largest the protocol allows. */
  readonly partSize?: number
  /** Parts in flight at once. Only used when the length is known. */
  readonly concurrency?: number
  /** Attempts made on one part before giving up. */
  readonly attempts?: number
  /** Stop the upload. */
  readonly signal?: AbortSignal
  /** The identifier the parts are accumulated under. Supplied only in a test. */
  readonly fileId?: bigint
  /** Randomness for that identifier. */
  readonly random?: (length: number) => Uint8Array
}

/** A file the datacenter can now be told to use. */
export interface UploadedFile {
  /** The reference a call carries to name the file that was just sent. */
  readonly file: TlValue
  readonly fileId: bigint
  readonly parts: number
  readonly size: number
  /** The datacenter the parts ended up on. */
  readonly dcId: number
}

/**
 * Send a file and hand back what names it.
 *
 * The length decides almost everything: which of the two ways the parts go, how
 * many there are, whether they can go at the same time, and whether a checksum
 * over the whole file can be computed at all.
 */
export async function upload(options: UploadOptions): Promise<UploadedFile> {
  const draw = options.random ?? randomBytes
  const fileId = options.fileId ?? drawFileId(draw)
  const plan = planUpload({
    ...(options.source.size === undefined ? {} : { size: options.source.size }),
    ...(options.partSize === undefined ? {} : { partSize: options.partSize }),
  })

  const transfer = new Transfer(options, fileId, plan.partSize)

  const outcome =
    options.source.size === undefined
      ? await transfer.sendUnknownLength()
      : await transfer.sendKnownLength(options.source.size, plan.parts ?? 0, plan.path === 'big')

  // Built last, and only here: a file object says the upload succeeded, and one
  // built before every part was accounted for would be saying so too early.
  return {
    file: outcome.big
      ? { _: 'inputFileBig', id: fileId, parts: outcome.parts, name: options.name ?? '' }
      : {
          _: 'inputFile',
          id: fileId,
          parts: outcome.parts,
          name: options.name ?? '',
          md5_checksum: outcome.checksum ?? '',
        },
    fileId,
    parts: outcome.parts,
    size: outcome.size,
    dcId: transfer.dcId,
  }
}

/** What an upload came to. */
interface Outcome {
  readonly parts: number
  readonly size: number
  readonly big: boolean
  /** Over the whole file, for the one path whose reference carries it. */
  readonly checksum?: string
}

/**
 * One upload in progress.
 *
 * Holds the state a single transfer needs and nothing else: which datacenter it
 * is talking to, and which part numbers are still owed. It is discarded when
 * the upload finishes, because none of it means anything afterwards — the file
 * exists on the datacenter and is named by the reference, not by this.
 */
class Transfer {
  #dcId: number
  #redirections = 0

  constructor(
    private readonly options: UploadOptions,
    private readonly fileId: bigint,
    private readonly partSize: number,
  ) {
    this.#dcId = options.dcId
  }

  get dcId(): number {
    return this.#dcId
  }

  /**
   * Send a file whose length is known.
   *
   * The parts are known in advance, so they can go at the same time. Each
   * worker takes the next number that has not been claimed, which is what stops
   * two of them sending the same part while leaving none unsent.
   */
  async sendKnownLength(size: number, parts: number, big: boolean): Promise<Outcome> {
    this.#stopIfAbandoned()

    const workers = Math.max(1, Math.min(this.options.concurrency ?? DEFAULT_CONCURRENCY, parts))
    let next = 0
    // Kept only for the checksum, and only on the path whose reference carries
    // one — the other path never holds the file in memory.
    const seen: Uint8Array[] = big ? [] : new Array<Uint8Array>(parts)

    const run = async (): Promise<void> => {
      for (;;) {
        const index = next
        if (index >= parts) return
        next += 1

        const { offset, length } = partAt({ index, partSize: this.partSize, size })
        const bytes = await this.options.source.read(offset, length)
        if (bytes.length !== length) {
          throw new ValidationError(
            `the source gave ${bytes.length} bytes for part ${index}, which needs ${length}`,
          )
        }
        if (!big) seen[index] = bytes

        await this.#sendPart({ index, bytes, total: big ? parts : undefined })
      }
    }

    // Every worker is awaited, so a failure in any of them fails the upload
    // rather than being left for nobody.
    await Promise.all(Array.from({ length: workers }, run))

    return {
      parts,
      size,
      big,
      ...(big ? {} : { checksum: hex(md5(...seen)) }),
    }
  }

  /**
   * Send a file whose length is not known until it ends.
   *
   * Read in order, because finding the end is what discovering the length
   * consists of — a source that cannot say how long it is cannot be asked for
   * an offset it has not reached. The total is stated as unknown until the last
   * part, which is the one thing that tells the datacenter the file is whole.
   */
  async sendUnknownLength(): Promise<Outcome> {
    this.#stopIfAbandoned()

    // One part is held back at all times, because whether a part is the last is
    // only known once the read after it has happened — and only the last part
    // carries the real total.
    let held: { index: number; bytes: Uint8Array } | undefined
    let index = 0
    let size = 0

    for (;;) {
      const bytes = await this.options.source.read(index * this.partSize, this.partSize)
      size += bytes.length
      const more = bytes.length > 0

      if (held !== undefined && more) {
        await this.#sendPart({ ...held, total: UNKNOWN_TOTAL })
        held = undefined
      }

      if (!more) break

      held = { index, bytes }
      index += 1

      // A short read is the end of the file, so there is nothing after it to
      // wait for.
      if (bytes.length < this.partSize) break
    }

    if (held === undefined) {
      // Nothing was read at all. The datacenter is still told about a file, the
      // same way a known-length empty file is one part rather than none.
      await this.#sendPart({ index: 0, bytes: new Uint8Array(0), total: 1 })

      return { parts: 1, size: 0, big: true }
    }

    await this.#sendPart({ ...held, total: index })

    return { parts: index, size, big: true }
  }

  /**
   * Send one part, following a datacenter that says the file belongs elsewhere.
   *
   * A part whose outcome is unknown is repeated rather than abandoned: the
   * datacenter keeps parts by the number they were sent under, so sending one
   * twice leaves exactly the same file. That is what makes retrying safe here
   * and nowhere else.
   */
  async #sendPart(part: {
    index: number
    bytes: Uint8Array
    total: number | undefined
  }): Promise<void> {
    const attempts = this.options.attempts ?? DEFAULT_ATTEMPTS
    let failure: unknown

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      this.#stopIfAbandoned()

      try {
        await this.options.reach(this.#dcId).invoke(
          part.total === undefined
            ? {
                _: 'upload.saveFilePart',
                file_id: this.fileId,
                file_part: part.index,
                bytes: part.bytes,
              }
            : {
                _: 'upload.saveBigFilePart',
                file_id: this.fileId,
                file_part: part.index,
                file_total_parts: part.total,
                bytes: part.bytes,
              },
        )

        return
      } catch (error) {
        if (error instanceof CancelledError) throw error

        if (error instanceof MigrationError) {
          this.#redirect(error)
          // A redirection is not one of the attempts: the part has not failed,
          // it was sent to the wrong place.
          attempt -= 1
          continue
        }

        failure = error
      }
    }

    throw failure
  }

  /**
   * Move the transfer to the datacenter that claims the file.
   *
   * Parts already accepted stayed where they were sent, so relocating means
   * everything after this goes to the new datacenter and whatever went before
   * has to go there too. Bounded, because datacenters that redirect to each
   * other describe a loop no number of attempts resolves.
   */
  #redirect(error: MigrationError): void {
    this.#redirections += 1
    if (this.#redirections > MAX_REDIRECTIONS) {
      throw new ValidationError(
        `the upload was redirected more than ${MAX_REDIRECTIONS} times, most recently to datacenter ${error.dcId}`,
      )
    }

    this.#dcId = error.dcId
  }

  #stopIfAbandoned(): void {
    if (this.options.signal?.aborted === true) {
      throw new CancelledError('the upload was stopped')
    }
  }
}

/**
 * Draw the identifier the parts are accumulated under.
 *
 * Chosen by the client rather than issued, so it only has to be unlikely to
 * collide with another upload this account is making at the same moment.
 */
function drawFileId(random: (length: number) => Uint8Array): bigint {
  const bytes = random(8)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  return view.getBigInt64(0, true)
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
