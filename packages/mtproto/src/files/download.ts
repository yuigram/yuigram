/**
 * Fetching a file, one range at a time.
 *
 * A file is not fetched; ranges of it are, and which ranges may be asked for is
 * not the caller's choice. The datacenter serves a file in megabyte-sized
 * pieces and refuses a range that crosses between two of them, or that sits off
 * the grid it expects — so what a caller wants and what may be asked for are
 * two different things, and the gap between them is this module's subject.
 *
 * ```
 *   wanted   ├────────────────┤
 *   asked  ├─────┼─────┼──────────┤   aligned, never crossing a boundary
 *   given    ├────────────────┤       trimmed back to what was wanted
 * ```
 *
 * **Ranges are delivered in order, however they arrive.** They are fetched
 * several at a time because a file is otherwise as slow as its round trips, but
 * a consumer writing to a file or a stream needs them in the order they belong
 * in. A range that finishes early waits for the ones in front of it, and only
 * those wait — at most as many as are in flight, never the whole file.
 *
 * **A short answer is the end.** The datacenter says a file has finished by
 * giving back less than was asked for, and it says nothing more than that: a
 * file that stops before the length it was said to have and a file whose length
 * was never known both end the same way. So a short answer ends the transfer
 * wherever it arrives, nothing past it is asked for or handed over, and the
 * outcome reports the bytes there turned out to be rather than the ones that
 * were expected. Carrying on would hand a later range over where the missing
 * bytes belong, assembling a file that is wrong rather than one that is short.
 */

import { CancelledError, NetworkError, ValidationError } from '@yuigram/core'
import type { Callable } from '../network/migration.js'
import { MigrationError } from '../session/dispatcher.js'
import type { TlValue } from '../tl/index.js'
import { CdnFile, type CdnRedirection, readRedirection } from './cdn.js'
import { checkRange, type DownloadMode, planDownload } from './geometry.js'
import { isStaleReference, type ManagedLocation } from './references.js'

/** Attempts made on one range before the download gives up on it. */
const DEFAULT_ATTEMPTS = 3

/** Ranges in flight at once, when a caller does not say. */
const DEFAULT_CONCURRENCY = 4

/** Datacenters a download will be redirected to before it gives up. */
const MAX_REDIRECTIONS = 3

/** The largest ordinary range, which is also the piece a file is served in. */
const MEGABYTE = 1024 * 1024

/** Where the bytes go. */
export type DownloadSink = (bytes: Uint8Array, offset: number) => void | Promise<void>

/** How a file is fetched. */
export interface DownloadOptions {
  /** What names the file. Built by whatever holds the reference to it. */
  readonly location: TlValue
  /** How to reach a datacenter, including the one to start at. */
  readonly reach: (dcId: number) => Callable
  /**
   * Let the datacenter hand the transfer to a delivery node.
   *
   * Off unless asked for: a node serves encrypted bytes that have to be checked
   * against what was published for them, so it is a different way of fetching a
   * file rather than a faster one, and a caller that has not said it can do
   * that must not be told to.
   */
  readonly cdn?: boolean
  /**
   * Where a current reference comes from when the datacenter refuses the one
   * the location carries.
   *
   * Without it a refused reference is simply a failure, which is what a caller
   * that never stored the location wants.
   */
  readonly references?: ManagedLocation
  /** The datacenter to ask. */
  readonly dcId: number
  /**
   * The length of the file, when it is known.
   *
   * Knowing it is what allows several ranges to be asked for at once: without
   * it there is no way to say where the file ends except by reaching the end.
   */
  readonly size?: number
  /** Where in the file to start. Defaults to the beginning. */
  readonly offset?: number
  /** How many bytes are wanted. Defaults to the rest of the file. */
  readonly length?: number
  /** Which grid the ranges sit on. Defaults to the ordinary one. */
  readonly mode?: DownloadMode
  /** How much to ask for at a time. */
  readonly limit?: number
  /** Ranges in flight at once. Only used when the length is known. */
  readonly concurrency?: number
  /** Attempts made on one range before giving up. */
  readonly attempts?: number
  /** Stop the download. */
  readonly signal?: AbortSignal
}

/**
 * A download as a client asks for one.
 *
 * The same request, without the two things a caller is in no position to
 * supply: reaching a datacenter belongs to whatever holds the connections, and
 * refreshing a refused reference needs the layer that still holds the message
 * it arrived in. Everything else is the caller's to choose, so it passes
 * straight through — `cdn` included, because whether to fetch from a machine
 * Telegram does not operate is the caller's decision and nobody else's.
 */
export type DownloadRequest = Omit<DownloadOptions, 'reach' | 'references'>

/** What a download came to. */
export interface DownloadOutcome {
  /** How many bytes were handed over. */
  readonly size: number
  /** The datacenter the file was fetched from. */
  readonly dcId: number
}

/**
 * Fetch a file, handing each range to a sink in the order it belongs in.
 *
 * The sink is called with the offset each run of bytes starts at, so a consumer
 * writing to a file needs to keep nothing of its own — and because the calls
 * are in order, one appending to a stream needs nothing either.
 */
export async function downloadTo(
  options: DownloadOptions & { readonly write: DownloadSink },
): Promise<DownloadOutcome> {
  const transfer = new Transfer(options)

  return options.size === undefined
    ? transfer.fetchToEnd(options.write)
    : transfer.fetchKnownLength(options.size, options.write)
}

/**
 * Fetch a file and hand it back whole.
 *
 * For files a caller means to hold anyway. Anything large enough that holding
 * it is a decision should be written somewhere as it arrives instead.
 */
export async function download(options: DownloadOptions): Promise<Uint8Array> {
  const parts: Uint8Array[] = []
  const outcome = await downloadTo({
    ...options,
    write: (bytes) => {
      parts.push(bytes)
    },
  })

  const whole = new Uint8Array(outcome.size)
  let at = 0
  for (const part of parts) {
    whole.set(part, at)
    at += part.length
  }

  return whole
}

/** One range, as it was asked for and as it was wanted. */
interface Piece {
  /** Where the request starts, which sits on the grid. */
  readonly offset: number
  readonly limit: number
  /** Bytes to drop from the front, because the grid started before the caller. */
  readonly skip: number
  /** Bytes to keep after that, or every remaining one. */
  readonly take: number | undefined
}

/**
 * One download in progress.
 *
 * Owns what a single transfer needs: which datacenter it is asking, which
 * ranges are still owed, and which of the finished ones may be handed over yet.
 */
class Transfer {
  #dcId: number
  #redirections = 0
  /** Set once a datacenter has handed the transfer to a delivery node. */
  #cdn: CdnFile | undefined

  constructor(private readonly options: DownloadOptions) {
    this.#dcId = options.dcId
  }

  /**
   * Fetch a file whose length is known.
   *
   * The ranges are known in advance, so several can be asked for at once. Each
   * worker claims the next one that has not been claimed, which is what stops
   * two of them fetching the same range while leaving none unfetched.
   */
  async fetchKnownLength(size: number, write: DownloadSink): Promise<DownloadOutcome> {
    this.#stopIfAbandoned()

    const pieces = this.#plan(size)
    const workers = Math.max(
      1,
      Math.min(this.options.concurrency ?? DEFAULT_CONCURRENCY, pieces.length),
    )

    let next = 0
    let delivered = 0
    let written = 0

    // Where the file turned out to end, which is not always where it was said
    // to. A range that comes back short of what was asked for is the datacenter
    // saying there is no more, and nothing past it is asked for or handed over:
    // a later range written where the missing bytes belong would quietly
    // assemble a file that is wrong rather than one that is short.
    let ending = pieces.length
    const waiting = new Map<number, Uint8Array>()

    // How far ahead of the last range handed over a worker may claim.
    //
    // Without a bound, one slow range at the front is enough to pull the whole
    // file into memory: the workers behind it finish, find it is not their turn
    // yet, put their bytes aside and go on to claim the next range. Bounding
    // the claim is what makes the holding cost the ranges in flight rather than
    // the file.
    const lookahead = workers
    const stalled = new Set<() => void>()
    const makeRoom = (): void => {
      for (const resume of stalled) resume()
      stalled.clear()
    }

    // Only one worker hands ranges over at a time. Two of them draining at once
    // would each take the next range and then await a sink call, interleaving
    // the two writes and delivering out of order — which is the one thing the
    // holding exists to prevent.
    let draining = false
    const drain = async (): Promise<void> => {
      if (draining) return
      draining = true

      try {
        await deliver()
      } finally {
        draining = false
      }
    }

    const deliver = async (): Promise<void> => {
      for (;;) {
        if (delivered >= ending) return

        const ready = waiting.get(delivered)
        if (ready === undefined) return

        waiting.delete(delivered)
        delivered += 1
        makeRoom()
        if (ready.length === 0) continue

        written += ready.length
        await write(ready, written - ready.length + (this.options.offset ?? 0))
      }
    }

    const run = async (): Promise<void> => {
      for (;;) {
        while (next < ending && next - delivered >= lookahead) {
          await new Promise<void>((resume) => stalled.add(resume))
        }

        const index = next
        if (index >= ending) return
        next += 1

        const piece = pieces[index]
        if (piece === undefined) return

        const bytes = this.#trim(piece, await this.#fetch(piece))
        if (piece.take !== undefined && bytes.length < piece.take) {
          ending = Math.min(ending, index + 1)
          makeRoom()
        }

        waiting.set(index, bytes)
        await drain()
      }
    }

    await Promise.all(Array.from({ length: workers }, run))
    await drain()

    return { size: written, dcId: this.#dcId }
  }

  /**
   * Fetch a file whose length is not known until it ends.
   *
   * One range at a time, because there is no way to say where the file ends
   * except by reaching it — and asking past the end in parallel would be
   * guessing about how far past.
   */
  async fetchToEnd(write: DownloadSink): Promise<DownloadOutcome> {
    this.#stopIfAbandoned()

    const mode = this.options.mode ?? 'normal'
    const alignment = mode === 'precise' ? 1024 : 4096
    const start = this.options.offset ?? 0
    if (start % alignment !== 0) {
      throw new ValidationError(`an offset must be a multiple of ${alignment}, received ${start}`)
    }

    const limit = this.#limitFor(mode)
    let offset = start
    let written = 0

    for (;;) {
      // The length to ask for is worked out where every other one is. Cutting
      // the request back to the megabyte boundary by hand leaves that
      // boundary's remainder, which is precisely the length that does not
      // divide a megabyte — a range the datacenter refuses.
      const [next] = planDownload({
        size: offset + limit,
        offset,
        limit,
        ...(this.options.mode === undefined ? {} : { mode: this.options.mode }),
      })
      if (next === undefined) break

      const piece: Piece = {
        offset,
        limit: next.limit,
        skip: 0,
        take: this.options.length === undefined ? undefined : this.options.length - written,
      }
      if (piece.take !== undefined && piece.take <= 0) break

      const bytes = this.#trim(piece, await this.#fetch(piece))
      if (bytes.length > 0) {
        written += bytes.length
        await write(bytes, offset)
      }

      // Less than was asked for is the datacenter saying the file has ended.
      if (bytes.length < piece.limit) break
      offset += piece.limit
    }

    return { size: written, dcId: this.#dcId }
  }

  /** Which ranges cover what the caller asked for. */
  #plan(size: number): Piece[] {
    const mode = this.options.mode ?? 'normal'
    const alignment = mode === 'precise' ? 1024 : 4096
    const start = this.options.offset ?? 0
    if (!Number.isInteger(start) || start < 0) {
      throw new ValidationError(`${start} is not an offset`)
    }

    if (this.options.limit !== undefined) this.#limitFor(mode)

    const wanted = this.options.length ?? Math.max(size - start, 0)
    const end = Math.min(start + wanted, size)
    if (end <= start) return []

    // The grid may start before the caller did, so the first range reaches back
    // and the bytes in front of what was wanted are dropped on arrival.
    const from = Math.floor(start / alignment) * alignment

    const ranges = planDownload({
      size: end,
      offset: from,
      ...(this.options.limit === undefined ? {} : { limit: this.options.limit }),
      ...(this.options.mode === undefined ? {} : { mode: this.options.mode }),
    })

    return ranges.map((range) => {
      const skip = Math.max(start - range.offset, 0)
      const available = range.limit - skip
      const remaining = end - Math.max(range.offset, start)

      return { ...range, skip, take: Math.max(Math.min(available, remaining), 0) }
    })
  }

  /** Cut an answer back to the bytes that were actually wanted. */
  #trim(piece: Piece, bytes: Uint8Array): Uint8Array {
    const from = Math.min(piece.skip, bytes.length)
    const to = piece.take === undefined ? bytes.length : Math.min(from + piece.take, bytes.length)

    return bytes.subarray(from, to)
  }

  /** How much to ask for at a time, checked before anything is sent. */
  #limitFor(mode: DownloadMode): number {
    const limit = this.options.limit ?? MEGABYTE
    checkRange({ offset: 0, limit, ...(this.options.mode === undefined ? {} : { mode }) })

    return limit
  }

  /**
   * Ask for one range, following a datacenter that says the file lives elsewhere.
   *
   * Asking for the same range twice returns the same bytes, so a range whose
   * outcome is unknown is safe to ask for again — and that is the only thing
   * repeated here. A call that was withdrawn is not repeated at all.
   */
  async #fetch(piece: Piece): Promise<Uint8Array> {
    // The last gate before a range leaves for the datacenter. Every range that
    // reaches here was planned, and the planner checks its own work, so this
    // holds rather than fires. It stays because a range arrived at any other
    // way is refused here, where the arithmetic is, rather than coming back as
    // a refusal describing the request.
    checkRange({
      offset: piece.offset,
      limit: piece.limit,
      ...(this.options.mode === undefined ? {} : { mode: this.options.mode }),
    })

    const attempts = this.options.attempts ?? DEFAULT_ATTEMPTS
    let failure: unknown
    // A refused reference is answered once. Refreshing again would ask the same
    // origin the same question and be told the same thing.
    let refreshed = false

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      this.#stopIfAbandoned()
      const location = this.#location()

      try {
        const bytes = await this.#ask(piece, location)
        if (bytes !== undefined) return bytes

        // Handed to a delivery node. The range was answered with an address
        // rather than with bytes, so it has not been tried yet.
        attempt -= 1
      } catch (error) {
        if (error instanceof CancelledError) throw error

        if (error instanceof MigrationError) {
          this.#redirect(error)
          // A redirection is not a failed attempt: the range was asked of the
          // wrong datacenter and has not been tried yet.
          attempt -= 1
          continue
        }

        if (!refreshed && this.options.references !== undefined && isStaleReference(error)) {
          refreshed = true
          await this.options.references.refresh(referenceOf(location))
          // Nor is a refused reference: the file was never looked for.
          attempt -= 1
          continue
        }

        failure = error
      }
    }

    throw failure
  }

  /**
   * Put one range to whatever is serving the file.
   *
   * Answers with the bytes, or with nothing when the datacenter has handed the
   * transfer to a delivery node instead of serving it — which is an answer
   * about where the file is rather than a failure to produce it.
   */
  async #ask(piece: Piece, location: TlValue): Promise<Uint8Array | undefined> {
    if (this.#cdn !== undefined) return await this.#cdn.fetch(piece.offset, piece.limit)

    const answer = await this.options.reach(this.#dcId).invoke({
      _: 'upload.getFile',
      ...(this.options.mode === 'precise' ? { precise: true } : {}),
      ...(this.options.cdn === true ? { cdn_supported: true } : {}),
      location,
      offset: BigInt(piece.offset),
      limit: piece.limit,
    })

    // Only a caller that said it could follow one. A datacenter naming a
    // delivery node to a client that never offered to use one is answering a
    // question it was not asked, and the bytes it did not send are missing
    // whatever is done about it.
    const redirection = this.options.cdn === true ? readRedirection(answer) : undefined
    if (redirection === undefined) return readFile(answer)

    this.#followToCdn(redirection)

    return undefined
  }

  /** The location as it should be sent now, reference and all. */
  #location(): TlValue {
    return this.options.references?.current() ?? this.options.location
  }

  /**
   * Fetch the rest of this file from the delivery node the datacenter named.
   *
   * Once. The token covers the file rather than the range it arrived with, so
   * every range still to come goes to the node from here — which is also what
   * bounds this: a transfer that has been handed over is never asking a
   * datacenter again, so it cannot be handed anywhere else. The ranges already
   * in flight when the first one arrives are told the same thing a moment
   * later, and there is nothing left for them to do about it.
   */
  #followToCdn(redirection: CdnRedirection): void {
    if (this.#cdn !== undefined) return

    this.#cdn = new CdnFile(redirection, {
      reach: this.options.reach,
      // Only the datacenter that issued the redirection can send a range to the
      // node, so which one that was has to survive the transition.
      originDcId: this.#dcId,
      stop: () => {
        this.#stopIfAbandoned()
      },
    })
  }

  /**
   * Move the transfer to the datacenter that claims the file.
   *
   * Bounded, because datacenters that redirect to each other describe a loop no
   * number of attempts resolves. What is counted is the transfer moving, not a
   * range being told to move: every range in flight is told the same thing at
   * the same time, so counting the tellings would spend the whole allowance on
   * one move and make the bound a limit on how many ranges may be in flight.
   */
  #redirect(error: MigrationError): void {
    if (error.dcId === this.#dcId) return

    this.#redirections += 1
    if (this.#redirections > MAX_REDIRECTIONS) {
      throw new ValidationError(
        `the download was redirected more than ${MAX_REDIRECTIONS} times, most recently to datacenter ${error.dcId}`,
      )
    }

    this.#dcId = error.dcId
  }

  #stopIfAbandoned(): void {
    if (this.options.signal?.aborted === true) {
      throw new CancelledError('the download was stopped')
    }
  }
}

/** The reference a location was sent with, if it carried one. */
function referenceOf(location: TlValue): Uint8Array {
  const reference = location['file_reference']

  return reference instanceof Uint8Array ? reference : new Uint8Array(0)
}

/**
 * Read the bytes out of an answer.
 *
 * A redirection to a delivery node is an answer this cannot use, and saying so
 * is better than handing back an empty range that would be read as the end of
 * the file.
 */
function readFile(answer: TlValue): Uint8Array {
  if (answer._ !== 'upload.file') {
    throw new NetworkError(`expected part of a file, received '${answer._}'`)
  }

  const bytes = answer['bytes']
  if (!(bytes instanceof Uint8Array)) {
    throw new NetworkError("'upload.file.bytes' must be a byte string")
  }

  return bytes
}
