/**
 * Streaming a growing text into a chat: drafts while it grows, messages as it
 * fills them.
 *
 * ```
 *   source ──> pump ──> window ──> draft   draft   draft ──> message
 *                          │                                (window full)
 *                          └──> next window ──> draft ... ──> message (end)
 * ```
 *
 * Two loops share one window. The **pump** pulls text from the source and
 * pauses when too much is waiting, so a model producing faster than Telegram
 * accepts is slowed rather than buffered without end. The **main loop** does
 * everything that reaches the network, one request at a time: it finishes
 * windows that are full, shows the current one as a draft, and waits.
 *
 * One request at a time is what keeps the order right. A draft is never in
 * flight while its window is being sent as a message, so no preview lands after
 * the message that replaces it; and text that arrives while a request is out
 * is shown by the next draft rather than queued as one request per token.
 *
 * **What is sent, and when.**
 *
 * - A draft goes out when there is new text and the interval since the last one
 *   has passed. A draft that fails doubles the interval, up to a ceiling; a
 *   flood wait holds drafts back for exactly as long as Telegram says. A failed
 *   draft is counted in `skipped` and is never retried: the next one carries
 *   newer text anyway.
 * - A window is sent as a message when it is full, when the stream ends, and
 *   when no draft has gone out for nearly the thirty seconds a draft lasts on
 *   the reader's screen — so what the reader saw does not vanish.
 * - A message that fails with a flood wait is retried after the wait: Telegram
 *   answered 429, so it was not accepted. Any other failure is not retried,
 *   because a message may have been delivered without its answer arriving; the
 *   stream stops with a {@link StreamSendError} saying what was sent and what
 *   was not.
 *
 * **Ending early.** Aborting, the reader pressing stop, and the source failing
 * each end the stream; what happens to text already produced is a stated
 * option in each case, never a silent drop.
 */

import { FloodError, YuigramError } from '../errors/errors.js'
import { normalizeSource, type StreamSource } from './sources.js'
import {
  createWindow,
  DEFAULT_LIMITS,
  type Finished,
  type StreamFormat,
  type StreamPayload,
  type Window,
  type WindowLimits,
} from './windows.js'

/** Where a stream's drafts and messages go. */
export interface StreamTransport<Message = unknown> {
  /**
   * Show the current window as a draft. `payload` is `undefined` for the
   * placeholder shown before any text has arrived.
   */
  draft(payload: StreamPayload | undefined, draftId: number, signal: AbortSignal): Promise<unknown>
  /** Send a finished window as a message. `last` for the stream's final one. */
  send(
    payload: StreamPayload,
    context: { readonly last: boolean },
    signal: AbortSignal,
  ): Promise<Message>
}

/** Time, for the stream to read and wait on. Supplied so tests need not wait in real time. */
export interface StreamClock {
  now(): number
  /** Wait `ms`, or until `signal` aborts, whichever is first. Never rejects. */
  sleep(ms: number, signal: AbortSignal): Promise<void>
}

/** The reader's stop button, as the transport reports it. */
export class StopController {
  readonly #controller = new AbortController()

  /** Whether the reader asked to stop. */
  get stopped(): boolean {
    return this.#controller.signal.aborted
  }

  /** Aborts when the reader asks to stop. */
  get signal(): AbortSignal {
    return this.#controller.signal
  }

  /** Stop the stream. Returns false if it was already stopped. */
  stop(): boolean {
    if (this.stopped) return false
    this.#controller.abort()

    return true
  }
}

/** What happens to text already produced when a stream ends early. */
export type EarlyEnd = 'send' | 'discard'

/** Options for {@link runStream}. */
export interface RunStreamOptions<Message = unknown> {
  readonly source: StreamSource
  readonly transport: StreamTransport<Message>
  /** A fresh draft identity for each window. */
  readonly nextDraftId: () => number
  /** How the text is written. Plain text by default. */
  readonly format?: StreamFormat
  readonly limits?: Partial<WindowLimits>
  /** The shortest time between two drafts, in milliseconds. 250 by default. */
  readonly editInterval?: number
  /** The longest the interval grows to after failed drafts, in milliseconds. 4,000 by default. */
  readonly maxEditBackoff?: number
  /** Show a placeholder before the first text arrives. True by default. */
  readonly thinkingPlaceholder?: boolean
  /** How long a draft stays on the reader's screen, in milliseconds. 30,000. */
  readonly draftTtl?: number
  /** How long before that a window is sent as a message. 2,000. */
  readonly draftSafety?: number
  /** The longest flood wait a message is retried after, in seconds. 60 by default. */
  readonly maxFloodWait?: number
  /** Cancels the stream. */
  readonly signal?: AbortSignal
  /** The reader's stop button. */
  readonly stop?: StopController
  /** When aborted: send what was produced, or not. `send` by default. */
  readonly onAbort?: EarlyEnd
  /** When the reader stops it: send what was produced, or not. `discard` by default. */
  readonly onStop?: EarlyEnd
  /** When the source fails: send what was produced, or not. `send` by default. */
  readonly onSourceError?: EarlyEnd
  /** Told of every piece of text as it arrives, with the draft it lands in. */
  readonly onPiece?: (text: string, draftId: number) => void
  /** Told of every message sent. */
  readonly onMessage?: (message: Message) => void
  /** Told of every failure the stream carried on past. */
  readonly onError?: (error: unknown) => void | Promise<void>
  readonly clock?: StreamClock
}

/** What a stream did. */
export interface StreamResult<Message = unknown> {
  /** The messages sent, in order. */
  readonly messages: Message[]
  /** Drafts shown. */
  drafts: number
  /** Pieces of text taken from the source. */
  pieces: number
  /** Their size, in UTF-8 bytes. */
  bytes: number
  /** Drafts that failed and were not retried. */
  skipped: number
  /** Whether the stream was aborted. */
  aborted: boolean
  /** Whether the reader stopped it. */
  stopped: boolean
  /** Text produced and deliberately not sent. */
  unsent?: StreamPayload
}

/** A message could not be sent and was not retried. */
export class StreamSendError<Message = unknown> extends YuigramError {
  override readonly name = 'StreamSendError'

  constructor(
    /** What the stream had done when it stopped. */
    readonly result: StreamResult<Message>,
    /** The window that was not sent. */
    readonly unsent: StreamPayload,
    cause: unknown,
  ) {
    super('a streamed message could not be sent; it may or may not have been delivered', { cause })
  }
}

/** The source failed. What it produced was handled as `onSourceError` says. */
export class StreamSourceError<Message = unknown> extends YuigramError {
  override readonly name = 'StreamSourceError'

  constructor(
    readonly result: StreamResult<Message>,
    cause: unknown,
  ) {
    super('the stream source failed', { cause })
  }
}

const realClock: StreamClock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve) => {
      if (signal.aborted || ms <= 0) {
        resolve()
        return
      }
      const done = (): void => {
        clearTimeout(timer)
        signal.removeEventListener('abort', done)
        resolve()
      }
      const timer = setTimeout(done, ms)
      signal.addEventListener('abort', done, { once: true })
    }),
}

/** UTF-8 length of a string, without allocating its bytes. */
function utf8Length(text: string): number {
  let bytes = 0
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4
      index += 1
    } else bytes += 3
  }

  return bytes
}

/** A promise with its resolve at hand, reset after each use. */
function signalled(): { promise: Promise<void>; fire: () => void } {
  let fire: () => void = () => {}
  const promise = new Promise<void>((resolve) => {
    fire = resolve
  })

  return { promise, fire }
}

/** Whether a payload shows nothing. */
function isBlank(payload: StreamPayload): boolean {
  return payload.kind === 'text'
    ? payload.formatted.text.trim().length === 0
    : payload.source.trim().length === 0
}

/** Run one stream to its end. */
export async function runStream<Message>(
  options: RunStreamOptions<Message>,
): Promise<StreamResult<Message>> {
  return new StreamRun(options).run()
}

/** One stream: the state the pump and the main loop share. */
class StreamRun<Message> {
  readonly #options: RunStreamOptions<Message>
  readonly #clock: StreamClock
  readonly #window: Window
  readonly #iterator: AsyncIterator<string>
  readonly #editInterval: number
  readonly #maxBackoff: number
  readonly #ttl: number
  readonly #maxFloodWait: number
  readonly #highWater: number

  readonly #result: StreamResult<Message> = {
    messages: [],
    drafts: 0,
    pieces: 0,
    bytes: 0,
    skipped: 0,
    aborted: false,
    stopped: false,
  }

  // Every request the stream makes is cancelled when it is aborted or stopped.
  readonly #halt = new AbortController()
  readonly #halted: Promise<undefined>
  #wake = signalled()
  #room = signalled()

  /** Text the pump has taken and the main loop has not yet put in the window. */
  #pending = ''
  #pulling = true
  #sourceFailure: { error: unknown } | undefined

  #draftId: number
  #lastDraftAt: number | undefined
  #nextDraftAt = 0
  #interval: number
  /** Whether the window holds text no draft has shown. */
  #dirty = false

  readonly #onOuter = (): void => {
    this.#halt.abort()
    this.#wake.fire()
    this.#room.fire()
  }

  constructor(options: RunStreamOptions<Message>) {
    this.#options = options
    this.#iterator = normalizeSource(options.source)[Symbol.asyncIterator]()
    this.#clock = options.clock ?? realClock
    const format = options.format ?? { kind: 'plain' }
    const limits = { ...DEFAULT_LIMITS, ...options.limits }
    this.#window = createWindow(format, limits)
    this.#editInterval = options.editInterval ?? 250
    this.#interval = this.#editInterval
    this.#maxBackoff = Math.max(this.#editInterval, options.maxEditBackoff ?? 4000)
    this.#ttl = (options.draftTtl ?? 30_000) - (options.draftSafety ?? 2_000)
    this.#maxFloodWait = options.maxFloodWait ?? 60
    this.#highWater = (format.kind === 'rich' ? limits.rich : limits.text) * 2

    options.signal?.addEventListener('abort', this.#onOuter, { once: true })
    options.stop?.signal.addEventListener('abort', this.#onOuter, { once: true })
    if (options.signal?.aborted === true || options.stop?.stopped === true) this.#halt.abort()

    const halt = this.#halt.signal
    this.#halted = new Promise<undefined>((resolve) => {
      if (halt.aborted) resolve(undefined)
      halt.addEventListener('abort', () => resolve(undefined), { once: true })
    })
    this.#draftId = options.nextDraftId()
  }

  async run(): Promise<StreamResult<Message>> {
    const pump = this.#pump()

    try {
      if (this.#options.thinkingPlaceholder !== false && !this.#halt.signal.aborted) {
        await this.#sendDraft(undefined)
      }
      while (await this.#step()) {
        // Each pass sends at most one request, or waits.
      }

      return await this.#conclude(pump)
    } finally {
      this.#halt.abort()
      this.#options.signal?.removeEventListener('abort', this.#onOuter)
      this.#options.stop?.signal.removeEventListener('abort', this.#onOuter)
      await pump.catch(() => undefined)
    }
  }

  async #report(error: unknown): Promise<void> {
    try {
      await this.#options.onError?.(error)
    } catch {
      // A failing hook must not end the stream it is observing.
    }
  }

  // ---- the pump ------------------------------------------------------------

  async #pump(): Promise<void> {
    const iterator = this.#iterator
    /** A read the pump stopped waiting for, which may still settle later. */
    let outstanding: Promise<unknown> | undefined

    try {
      while (!this.#halt.signal.aborted) {
        if (this.#pending.length + this.#window.held >= this.#highWater) {
          this.#room = signalled()
          await Promise.race([this.#room.promise, this.#halted])
          continue
        }

        const reading = iterator.next()
        outstanding = reading
        const step = await Promise.race([reading, this.#halted])
        if (step === undefined) break
        outstanding = undefined
        if (step.done === true) break
        this.#take(step.value)
      }
    } catch (error) {
      outstanding = undefined
      this.#sourceFailure = { error }
    } finally {
      this.#pulling = false
      this.#wake.fire()
      // The source is released either way. With a read outstanding the release
      // is not waited for — a source may not answer `return` until that read
      // settles — and a late failure of the abandoned read is absorbed.
      const closing = Promise.resolve(iterator.return?.()).catch(() => undefined)
      if (outstanding === undefined) await closing
      else void outstanding.catch(() => undefined)
    }
  }

  #take(text: string): void {
    if (text.length === 0) return
    this.#result.pieces += 1
    this.#result.bytes += utf8Length(text)
    this.#pending += text
    this.#options.onPiece?.(text, this.#draftId)
    this.#wake.fire()
  }

  // ---- requests ------------------------------------------------------------

  async #sendDraft(payload: StreamPayload | undefined): Promise<void> {
    try {
      await this.#options.transport.draft(payload, this.#draftId, this.#halt.signal)
      this.#result.drafts += 1
      this.#lastDraftAt = this.#clock.now()
      this.#interval = this.#editInterval
      this.#nextDraftAt = this.#lastDraftAt + this.#interval
    } catch (error) {
      if (this.#halt.signal.aborted) return
      this.#result.skipped += 1
      await this.#report(error)
      if (error instanceof FloodError) {
        this.#nextDraftAt = this.#clock.now() + error.retryAfter * 1000
      } else {
        this.#interval = Math.min(this.#interval * 2, this.#maxBackoff)
        this.#nextDraftAt = this.#clock.now() + this.#interval
      }
    }
  }

  /** Whether a failed send is a flood wait worth waiting out. */
  #retries(error: unknown, attempt: number, signal: AbortSignal): error is FloodError {
    return (
      error instanceof FloodError &&
      attempt < 3 &&
      error.retryAfter <= this.#maxFloodWait &&
      !signal.aborted
    )
  }

  /** Send a window as a message, retrying only a flood wait. */
  async #sendMessage(finished: Finished, last: boolean, signal: AbortSignal): Promise<void> {
    if (finished.problem !== undefined) await this.#report(finished.problem)
    if (isBlank(finished.payload)) return

    for (let attempt = 1; ; attempt += 1) {
      try {
        const message = await this.#options.transport.send(finished.payload, { last }, signal)
        this.#result.messages.push(message)
        this.#options.onMessage?.(message)

        return
      } catch (error) {
        if (this.#retries(error, attempt, signal)) {
          await this.#report(error)
          await this.#clock.sleep(error.retryAfter * 1000, signal)
          if (!signal.aborted) continue
        }

        throw new StreamSendError(this.#result, finished.payload, error)
      }
    }
  }

  /** A window finished before the end: sent, and the next one gets a new draft. */
  async #rotate(finished: Finished): Promise<void> {
    await this.#sendMessage(finished, false, this.#halt.signal)
    this.#draftId = this.#options.nextDraftId()
    this.#lastDraftAt = undefined
    this.#nextDraftAt = 0
  }

  // ---- the main loop -------------------------------------------------------

  /** One pass: at most one request, or a wait. False once the stream is over. */
  async #step(): Promise<boolean> {
    const window = this.#window
    if (this.#options.signal?.aborted === true) {
      this.#result.aborted = true
      return false
    }
    if (this.#options.stop?.stopped === true) {
      this.#result.stopped = true
      return false
    }

    if (this.#pending.length > 0) {
      window.append(this.#pending)
      this.#pending = ''
      this.#dirty = true
      this.#room.fire()
    }

    for (const finished of window.overflow()) await this.#rotate(finished)

    if (!this.#pulling && this.#pending.length === 0) return false

    const now = this.#clock.now()

    // Nothing has refreshed the draft for nearly as long as it lasts: send
    // what it shows as a message before it disappears.
    if (this.#lastDraftAt !== undefined && now - this.#lastDraftAt >= this.#ttl && window.visible) {
      await this.#rotate(window.finish(false))
      return true
    }

    if (this.#dirty && now >= this.#nextDraftAt && window.visible) {
      this.#dirty = false
      await this.#sendDraft(window.preview())
      return true
    }

    await this.#idle(now)

    return true
  }

  /** Wait for more text, the end, a cancellation, or the next deadline. */
  async #idle(now: number): Promise<void> {
    const visible = this.#window.visible
    const deadlines: number[] = []
    if (this.#dirty && visible) deadlines.push(this.#nextDraftAt)
    if (this.#lastDraftAt !== undefined && visible) deadlines.push(this.#lastDraftAt + this.#ttl)
    this.#wake = signalled()
    if (this.#pending.length > 0 || !this.#pulling || this.#halt.signal.aborted) return

    const sleeper = new AbortController()
    const waits: Promise<unknown>[] = [this.#wake.promise, this.#halted]
    if (deadlines.length > 0) {
      waits.push(this.#clock.sleep(Math.max(0, Math.min(...deadlines) - now), sleeper.signal))
    }
    await Promise.race(waits)
    sleeper.abort()
  }

  // ---- the end -------------------------------------------------------------

  /** What the way the stream ended says to do with text not yet sent. */
  #earlyEnd(): EarlyEnd | undefined {
    const options = this.#options
    if (this.#result.aborted) return options.onAbort ?? 'send'
    if (this.#result.stopped) return options.onStop ?? 'discard'
    if (this.#sourceFailure !== undefined) return options.onSourceError ?? 'send'

    return undefined
  }

  async #conclude(pump: Promise<void>): Promise<StreamResult<Message>> {
    const result = this.#result
    const window = this.#window
    this.#halt.abort()
    await pump

    if (this.#pending.length > 0) {
      window.append(this.#pending)
      this.#pending = ''
    }

    const complete = !result.aborted && !result.stopped
    // Fresh signals: the stream's own was aborted to end it, and these are the
    // requests the ending asked for.
    for (const finished of complete ? window.overflow() : []) {
      await this.#sendMessage(finished, false, new AbortController().signal)
    }

    if (this.#earlyEnd() === 'discard') {
      const tail = window.finish(complete)
      if (!isBlank(tail.payload)) result.unsent = tail.payload
    } else {
      await this.#sendMessage(window.finish(complete), true, new AbortController().signal)
    }

    if (this.#sourceFailure !== undefined && complete) {
      throw new StreamSourceError(result, this.#sourceFailure.error)
    }

    return result
  }
}
