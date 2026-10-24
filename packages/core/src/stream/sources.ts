// SPDX-License-Identifier: MIT

/**
 * Where streamed text comes from, as one shape.
 *
 * Every model SDK streams its own way — chunk objects, event objects, web
 * streams, emitters — and a stream should accept whatever the application
 * already holds. Each form is recognised by its shape rather than by importing
 * the SDK that produces it, so none of them is a dependency of this package.
 *
 * Every adapter hands back an async iterable of text, and every one lets go of
 * what it holds when the consumer stops early: a reader is cancelled, a
 * listener removed, an iterator returned.
 */

import { ValidationError } from '../errors/errors.js'

/** Anything a stream accepts as its source. */
export type StreamSource =
  | AsyncIterable<unknown>
  | Iterable<unknown>
  | ReadableStream<unknown>
  | { readonly textStream: AsyncIterable<string> }
  | EmitterLike

/** The part of an event emitter a stream uses. */
export interface EmitterLike {
  on(event: string, listener: (...args: unknown[]) => void): unknown
  off?(event: string, listener: (...args: unknown[]) => void): unknown
  removeListener?(event: string, listener: (...args: unknown[]) => void): unknown
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    isObject(value) &&
    typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function'
  )
}

function isIterable(value: unknown): value is Iterable<unknown> {
  return (
    isObject(value) &&
    typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function'
  )
}

function isReadableStream(value: unknown): value is ReadableStream<unknown> {
  return isObject(value) && typeof value['getReader'] === 'function'
}

/**
 * The text in one chunk of a model's stream, or `undefined` for a chunk that
 * carries none — a tool call, a finish reason, a usage report.
 *
 * Recognised, in order: a string; an Anthropic `content_block_delta` with a
 * `text_delta`; an OpenAI Responses `response.output_text.delta`; an OpenAI
 * chat-completions chunk's first choice's `delta.content`; an Ollama chat
 * chunk's `message.content` or generate chunk's `response`; a LangChain
 * message chunk's `content`, as a string or as parts; and a bare `text`.
 */
export function textOf(chunk: unknown): string | undefined {
  if (typeof chunk === 'string') return chunk
  if (!isObject(chunk)) return undefined

  const type = chunk['type']
  if (typeof type === 'string' && type !== 'text') return eventText(type, chunk)

  const choices = chunk['choices']
  if (Array.isArray(choices)) return choiceText(choices[0])

  const message = chunk['message']
  if (isObject(message) && typeof message['content'] === 'string') return message['content']
  if (typeof chunk['response'] === 'string') return chunk['response']

  const content = chunk['content']
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return partsText(content)

  return typeof chunk['text'] === 'string' ? chunk['text'] : undefined
}

/** The text of a typed event; only text deltas carry any. */
function eventText(type: string, chunk: Record<string, unknown>): string | undefined {
  const delta = chunk['delta']
  if (type === 'content_block_delta') {
    return isObject(delta) && typeof delta['text'] === 'string' ? delta['text'] : undefined
  }
  if (type === 'response.output_text.delta') return typeof delta === 'string' ? delta : undefined

  return undefined
}

/** A chat-completions choice's `delta.content`. */
function choiceText(choice: unknown): string | undefined {
  const delta = isObject(choice) ? choice['delta'] : undefined
  const content = isObject(delta) ? delta['content'] : undefined

  return typeof content === 'string' ? content : undefined
}

/** Content given as parts: the strings and text parts, joined. */
function partsText(parts: readonly unknown[]): string {
  let joined = ''
  for (const part of parts) {
    if (typeof part === 'string') joined += part
    else if (isObject(part) && part['type'] === 'text' && typeof part['text'] === 'string') {
      joined += part['text']
    }
  }

  return joined
}

/** Chunks to text, decoding bytes as UTF-8 across chunk boundaries. */
class ChunkDecoder {
  readonly #decoder = new TextDecoder('utf-8')
  #decoding = false

  /** The text in one chunk: empty or `undefined` when it carries none yet. */
  text(chunk: unknown): string | undefined {
    if (!(chunk instanceof Uint8Array)) return textOf(chunk)
    this.#decoding = true

    return this.#decoder.decode(chunk, { stream: true })
  }

  /** Whatever the bytes left incomplete, once the source ends. */
  end(): string {
    return this.#decoding ? this.#decoder.decode() : ''
  }
}

const DONE: IteratorReturnResult<undefined> = { value: undefined, done: true }

/** A result carrying `text`, or `undefined` when there is none to give. */
function yielded(text: string | undefined): IteratorResult<string> | undefined {
  return text !== undefined && text.length > 0 ? { value: text, done: false } : undefined
}

/**
 * An iterable of text read out of another iterable, one chunk at a time.
 *
 * Written as an iterator rather than an async generator on purpose. A
 * generator waiting inside its own `await` cannot run its `return` until that
 * await settles, so a consumer that gives up on a stalled source could not
 * release it — the model's connection would stay open until the model spoke
 * again. Here `return` reaches the source at once, whatever is outstanding.
 */
function textsOf(source: AsyncIterable<unknown> | Iterable<unknown>): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<string> {
      const inner = isAsyncIterable(source)
        ? source[Symbol.asyncIterator]()
        : (source as Iterable<unknown>)[Symbol.iterator]()
      const decoder = new ChunkDecoder()
      let finished = false

      return {
        async next(): Promise<IteratorResult<string>> {
          while (!finished) {
            const step = await inner.next()
            if (step.done === true) {
              finished = true

              return yielded(decoder.end()) ?? DONE
            }

            const result = yielded(decoder.text(await step.value))
            if (result !== undefined) return result
          }

          return DONE
        },
        async return(): Promise<IteratorResult<string>> {
          if (!finished) {
            finished = true
            await inner.return?.()
          }

          return DONE
        },
      }
    },
  }
}

/** The text of an OpenAI chat-completions or Responses stream. */
export function fromOpenAI(source: AsyncIterable<unknown>): AsyncIterable<string> {
  return textsOf(source)
}

/** The text of an Anthropic event stream: its `content_block_delta` text only. */
export function fromAnthropic(source: AsyncIterable<unknown>): AsyncIterable<string> {
  return textsOf(source)
}

/** The text of an Ollama chat or generate stream. */
export function fromOllama(source: AsyncIterable<unknown>): AsyncIterable<string> {
  return textsOf(source)
}

/** The text of a LangChain stream: strings or message chunks. */
export function fromLangChain(source: AsyncIterable<unknown>): AsyncIterable<string> {
  return textsOf(source)
}

/** The text of a Vercel AI SDK `streamText` result. */
export function fromVercelAI(result: {
  readonly textStream: AsyncIterable<string>
}): AsyncIterable<string> {
  return textsOf(result.textStream)
}

/** UTF-8 bytes, decoded across chunk boundaries. */
export function fromBytes(
  source: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
): AsyncIterable<string> {
  return textsOf(source)
}

/**
 * A web `ReadableStream` of text or bytes.
 *
 * Read through a reader. Stopping early cancels the reader, even while a read
 * is outstanding — so whatever feeds the stream is told to stop too.
 */
export function fromTextStream(stream: ReadableStream<unknown>): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<string> {
      const reader = stream.getReader()
      const decoder = new ChunkDecoder()
      let finished = false

      const release = (): void => {
        try {
          reader.releaseLock()
        } catch {
          // A read still outstanding keeps the lock until the cancel settles it.
        }
      }

      return {
        async next(): Promise<IteratorResult<string>> {
          while (!finished) {
            const { done, value } = await reader.read()
            if (done) {
              finished = true
              release()

              return yielded(decoder.end()) ?? DONE
            }

            const result = yielded(decoder.text(value))
            if (result !== undefined) return result
          }

          return DONE
        },
        async return(): Promise<IteratorResult<string>> {
          if (!finished) {
            finished = true
            await reader.cancel().catch(() => undefined)
            release()
          }

          return DONE
        },
      }
    },
  }
}

/**
 * A Node-style event emitter: text on `event` (`'text'` by default), done on
 * `'end'`, failed on `'error'`.
 *
 * An emitter cannot be paused through this interface, so text that arrives
 * faster than it is consumed waits in a queue. Listeners are removed when the
 * stream ends, fails or is abandoned — at once, even while waiting for text.
 */
export function fromEventEmitter(emitter: EmitterLike, event = 'text'): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<string> {
      const queue: string[] = []
      let ended = false
      let failure: { error: unknown } | undefined
      let wake: (() => void) | undefined

      const notify = (): void => {
        wake?.()
        wake = undefined
      }
      const onText = (...args: unknown[]): void => {
        const text = textOf(args[0])
        if (text !== undefined && text.length > 0) {
          queue.push(text)
          notify()
        }
      }
      const onEnd = (): void => {
        ended = true
        notify()
      }
      const onError = (error: unknown): void => {
        failure = { error }
        notify()
      }

      emitter.on(event, onText)
      emitter.on('end', onEnd)
      emitter.on('error', onError)

      let attached = true
      const detach = (): void => {
        if (!attached) return
        attached = false
        for (const [name, listener] of [
          [event, onText],
          ['end', onEnd],
          ['error', onError],
        ] as const) {
          if (typeof emitter.off === 'function') emitter.off(name, listener as never)
          else emitter.removeListener?.(name, listener as never)
        }
      }

      // What `next` can answer without waiting, or `undefined` to wait.
      const settled = (): IteratorResult<string> | undefined => {
        const text = queue.shift()
        if (text !== undefined) return { value: text, done: false }
        if (failure !== undefined) {
          detach()
          throw failure.error
        }
        if (!ended && attached) return undefined
        detach()

        return DONE
      }

      return {
        async next(): Promise<IteratorResult<string>> {
          for (;;) {
            const result = settled()
            if (result !== undefined) return result
            await new Promise<void>((resolve) => {
              wake = resolve
            })
          }
        },
        async return(): Promise<IteratorResult<string>> {
          detach()
          queue.length = 0
          notify()

          return DONE
        },
      }
    },
  }
}

/**
 * Any accepted source, as an async iterable of text.
 *
 * Recognised, in order: a web `ReadableStream`; a Vercel AI SDK result's
 * `textStream`; any async or sync iterable of strings, bytes or model chunks;
 * an event emitter. Anything else is refused.
 */
export function normalizeSource(source: StreamSource): AsyncIterable<string> {
  if (isReadableStream(source)) return fromTextStream(source)
  if (isObject(source) && isAsyncIterable(source['textStream'])) {
    return fromVercelAI(source as { readonly textStream: AsyncIterable<string> })
  }
  if (typeof source === 'string') {
    throw new ValidationError(
      'a stream source is an iterable of text, not a string; wrap it: [text]',
    )
  }
  if (isAsyncIterable(source) || isIterable(source)) return textsOf(source)
  if (isObject(source) && typeof (source as { on?: unknown }).on === 'function') {
    return fromEventEmitter(source as unknown as EmitterLike)
  }

  throw new ValidationError(
    'a stream source is an async or sync iterable, a ReadableStream, a { textStream } result or an event emitter',
  )
}
