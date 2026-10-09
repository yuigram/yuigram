// SPDX-License-Identifier: MIT

/**
 * The stream engine, against a clock and a transport driven by hand.
 *
 * Nothing here waits in real time. The clock moves only when a case moves it,
 * the source yields only what a case pushes, and every request the engine
 * makes is recorded — and can be held open, failed or answered with a flood
 * wait — so each timing rule is asserted as a sequence of requests at known
 * moments rather than inferred from how long something took.
 */

import { describe, expect, it } from 'vitest'
import { FloodError } from '../src/errors/errors.js'
import { MarkupParseError } from '../src/format/index.js'
import {
  DEFAULT_LIMITS,
  fromBytes,
  fromEventEmitter,
  normalizeSource,
  runStream,
  STREAM_DEFAULTS,
  StopController,
  type StreamClock,
  type StreamPayload,
  StreamSendError,
  StreamSourceError,
  textOf,
} from '../src/stream/index.js'

/** Let every settled promise run its continuations. */
async function flush(rounds = 8): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
}

/** A clock that moves only when told. */
class Clock implements StreamClock {
  time = 0
  private sleepers: { at: number; resolve: () => void }[] = []

  now(): number {
    return this.time
  }

  sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve()
        return
      }
      const sleeper = { at: this.time + ms, resolve }
      this.sleepers.push(sleeper)
      signal.addEventListener(
        'abort',
        () => {
          this.sleepers = this.sleepers.filter((one) => one !== sleeper)
          resolve()
        },
        { once: true },
      )
    })
  }

  /** How many waits are outstanding. */
  get waiting(): number {
    return this.sleepers.length
  }

  async advance(ms: number): Promise<void> {
    const target = this.time + ms
    for (;;) {
      await flush()
      const next = this.sleepers.filter((one) => one.at <= target).sort((a, b) => a.at - b.at)[0]
      if (next === undefined) break
      this.time = Math.max(this.time, next.at)
      this.sleepers = this.sleepers.filter((one) => one !== next)
      next.resolve()
    }
    this.time = target
    await flush()
  }
}

/** A source that yields what a case pushes. */
class Feed implements AsyncIterable<string> {
  private queue: string[] = []
  private ended = false
  private failure: unknown
  private wake: (() => void) | undefined
  pulls = 0
  returned = false

  push(...texts: string[]): void {
    this.queue.push(...texts)
    this.wake?.()
  }

  end(): void {
    this.ended = true
    this.wake?.()
  }

  fail(error: unknown): void {
    this.failure = error
    this.wake?.()
  }

  [Symbol.asyncIterator](): AsyncIterator<string> {
    return {
      next: async () => {
        this.pulls += 1
        for (;;) {
          const next = this.queue.shift()
          if (next !== undefined) return { value: next, done: false }
          if (this.failure !== undefined) throw this.failure
          if (this.ended) return { value: undefined, done: true }
          await new Promise<void>((resolve) => {
            this.wake = resolve
          })
        }
      },
      return: async () => {
        this.returned = true
        this.wake?.()

        return { value: undefined, done: true }
      },
    }
  }
}

interface Call {
  readonly kind: 'draft' | 'send'
  readonly text: string
  readonly entities: string[]
  readonly draftId?: number
  readonly last?: boolean
  readonly at: number
  readonly signal: AbortSignal
}

/** A transport that records requests and answers them as a case says. */
function transport(clock: Clock) {
  const calls: Call[] = []
  const draftFailures: unknown[] = []
  const sendFailures: unknown[] = []
  let holdDraft: Promise<void> | undefined
  let holdSend: Promise<void> | undefined

  const textOfPayload = (payload: StreamPayload | undefined): [string, string[]] => {
    if (payload === undefined) return ['', []]
    if (payload.kind === 'rich') return [payload.source, []]

    return [
      payload.formatted.text,
      payload.formatted.entities.map(
        (entity) => `${entity.type}@${entity.offset}+${entity.length}`,
      ),
    ]
  }

  return {
    calls,
    drafts: () => calls.filter((call) => call.kind === 'draft'),
    sends: () => calls.filter((call) => call.kind === 'send'),
    failDraft: (error: unknown) => draftFailures.push(error),
    failSend: (error: unknown) => sendFailures.push(error),
    holdDrafts: (until: Promise<void> | undefined) => {
      holdDraft = until
    },
    holdSends: (until: Promise<void> | undefined) => {
      holdSend = until
    },
    impl: {
      draft: async (payload: StreamPayload | undefined, draftId: number, signal: AbortSignal) => {
        const [text, entities] = textOfPayload(payload)
        calls.push({ kind: 'draft', text, entities, draftId, at: clock.now(), signal })
        if (holdDraft !== undefined) {
          await Promise.race([
            holdDraft,
            new Promise<void>((_, reject) => {
              signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
            }),
          ])
        }
        const failure = draftFailures.shift()
        if (failure !== undefined) throw failure

        return true
      },
      send: async (payload: StreamPayload, context: { last: boolean }, signal: AbortSignal) => {
        const [text, entities] = textOfPayload(payload)
        calls.push({ kind: 'send', text, entities, last: context.last, at: clock.now(), signal })
        if (holdSend !== undefined) await holdSend
        const failure = sendFailures.shift()
        if (failure !== undefined) throw failure

        return { message_id: calls.filter((call) => call.kind === 'send').length, text }
      },
    },
  }
}

/** Draft ids handed out in order, from 1. */
function ids() {
  let next = 0

  return () => {
    next += 1

    return next
  }
}

function setup(options: Partial<Parameters<typeof runStream>[0]> = {}) {
  const clock = new Clock()
  const feed = new Feed()
  const sink = transport(clock)
  const errors: unknown[] = []
  const running = runStream({
    source: feed,
    transport: sink.impl,
    nextDraftId: ids(),
    clock,
    onError: (error) => {
      errors.push(error)
    },
    ...options,
  } as Parameters<typeof runStream>[0])

  return { clock, feed, sink, errors, running }
}

describe('defaults', () => {
  it('states the limits and timing a stream uses unless told otherwise', () => {
    expect(DEFAULT_LIMITS).toEqual({ text: 4096, rich: 32768, blocks: 500 })
    expect(STREAM_DEFAULTS).toEqual({
      editInterval: 250,
      maxEditBackoff: 4000,
      draftTtl: 30_000,
      draftSafety: 2_000,
      maxFloodWait: 60,
    })
  })

  it('waits the stated interval between drafts when given none', async () => {
    const { clock, feed, sink, running } = setup()
    await flush()
    feed.push('a')
    await clock.advance(STREAM_DEFAULTS.editInterval - 1)
    expect(sink.drafts()).toHaveLength(1)
    await clock.advance(1)
    expect(sink.drafts().map((call) => call.text)).toEqual(['', 'a'])
    feed.end()
    await running
  })
})

describe('drafts', () => {
  it('shows a placeholder, then the text, then sends it once as a message', async () => {
    const { clock, feed, sink, running } = setup()
    await flush()
    feed.push('Hello')
    await clock.advance(250)
    feed.push(', world')
    await clock.advance(250)
    feed.end()
    const result = await running

    expect(sink.drafts().map((call) => call.text)).toEqual(['', 'Hello', 'Hello, world'])
    expect(sink.sends().map((call) => [call.text, call.last])).toEqual([['Hello, world', true]])
    expect(result).toMatchObject({
      drafts: 3,
      pieces: 2,
      bytes: 12,
      skipped: 0,
      aborted: false,
      stopped: false,
    })
  })

  it('never shows two drafts closer together than the interval', async () => {
    const { clock, feed, sink, running } = setup({ editInterval: 500 })
    await flush()
    for (let tick = 0; tick < 20; tick += 1) {
      feed.push(`${tick} `)
      await clock.advance(100)
    }
    feed.end()
    await running

    const times = sink.drafts().map((call) => call.at)
    for (let index = 1; index < times.length; index += 1) {
      expect((times[index] as number) - (times[index - 1] as number)).toBeGreaterThanOrEqual(500)
    }
  })

  it('shows text that arrived during a request in one later draft, not one per piece', async () => {
    const { clock, feed, sink, running } = setup()
    await flush()
    let release: () => void = () => {}
    sink.holdDrafts(
      new Promise<void>((resolve) => {
        release = resolve
      }),
    )
    feed.push('a')
    await clock.advance(250)
    const before = sink.drafts().length

    for (const piece of 'bcdefghij') feed.push(piece)
    await clock.advance(50)
    sink.holdDrafts(undefined)
    release()
    await clock.advance(500)
    feed.end()
    await running

    const after = sink.drafts().slice(before)
    expect(after.map((call) => call.text)).toEqual(['abcdefghij'])
  })

  it('doubles the interval after failed drafts, up to the ceiling, and resets on success', async () => {
    const { clock, feed, sink, errors, running } = setup({
      editInterval: 100,
      maxEditBackoff: 400,
      thinkingPlaceholder: false,
    })
    await flush()
    for (let failure = 0; failure < 4; failure += 1) sink.failDraft(new Error(`draft ${failure}`))

    feed.push('a')
    await clock.advance(1)
    for (let step = 0; step < 20; step += 1) {
      feed.push('x')
      await clock.advance(100)
    }
    feed.end()
    const result = await running

    const times = sink.drafts().map((call) => call.at)
    const gaps = times.slice(1).map((at, index) => at - (times[index] as number))
    expect(gaps.slice(0, 4)).toEqual([200, 400, 400, 400])
    expect(gaps[4]).toBe(100)
    expect(result.skipped).toBe(4)
    expect(errors).toHaveLength(4)
  })

  it('holds drafts back for exactly as long as a flood wait says', async () => {
    const { clock, feed, sink, running } = setup({ thinkingPlaceholder: false })
    await flush()
    sink.failDraft(new FloodError('FLOOD_WAIT_3', { retryAfter: 3 }))
    feed.push('a')
    await clock.advance(1)
    for (let step = 0; step < 40; step += 1) {
      feed.push('b')
      await clock.advance(100)
    }
    feed.end()
    await running

    const [flooded, next] = sink.drafts()
    expect((next?.at as number) - (flooded?.at as number)).toBe(3000)
  })
})

describe('windows', () => {
  it('sends a full window as a message and continues in a new draft', async () => {
    const { clock, feed, sink, running } = setup({ limits: { text: 20 } })
    await flush()
    feed.push('one two three four five six seven eight nine')
    await clock.advance(250)
    feed.end()
    const result = await running

    const texts = sink.sends().map((call) => call.text)
    expect(texts.join('')).toBe('one two three four five six seven eight nine')
    for (const text of texts) expect(text.length).toBeLessThanOrEqual(20)
    expect(texts[0]?.endsWith(' ')).toBe(true)
    expect(sink.sends().map((call) => call.last)).toEqual([false, false, true])

    const draftIds = new Set(sink.drafts().map((call) => call.draftId))
    expect(draftIds.size).toBeGreaterThan(1)
    expect(result.messages).toHaveLength(3)
  })

  it('keeps formatting across the cut, and never sends a piece of markup', async () => {
    const { clock, feed, sink, running } = setup({
      format: { kind: 'markdown' },
      limits: { text: 12 },
    })
    await flush()
    feed.push('*bold words that run')
    await clock.advance(250)
    feed.push(' long* plain')
    await clock.advance(250)
    feed.end()
    await running

    const sends = sink.sends()
    expect(sends.map((call) => call.text).join('')).toBe('bold words that run long plain')
    for (const call of [...sends, ...sink.drafts()]) {
      expect(call.text).not.toContain('*')
    }
    expect(sends[0]?.entities[0]).toMatch(/^bold@0\+/)
    expect(sends[1]?.entities[0]).toMatch(/^bold@0\+/)
  })

  it('cuts rich markdown between blocks, closing and reopening a code block', async () => {
    const { clock, feed, sink, running } = setup({
      format: { kind: 'rich', dialect: 'markdown' },
      limits: { rich: 40 },
    })
    await flush()
    feed.push('Intro line\n\n```ts\nconst a = 1\nconst b = 2\nconst c = 3\n')
    await clock.advance(250)
    feed.push('const d = 4\n```\nOutro')
    await clock.advance(250)
    feed.end()
    await running

    const sends = sink.sends().map((call) => call.text)
    for (const text of sends) {
      expect([...text].length).toBeLessThanOrEqual(40)
      expect((text.match(/```/g) ?? []).length % 2).toBe(0)
    }
    expect(sends.some((text) => text.startsWith('```ts\n'))).toBe(true)
  })

  it('sends what a draft showed before the draft would disappear', async () => {
    const { clock, feed, sink, running } = setup()
    await flush()
    feed.push('first part')
    await clock.advance(250)
    await clock.advance(27_999)
    expect(sink.sends()).toHaveLength(0)
    await clock.advance(1)
    expect(sink.sends().map((call) => call.text)).toEqual(['first part'])

    feed.push('second part')
    await clock.advance(250)
    feed.end()
    await running

    const [first, second] = sink.sends()
    expect(second?.text).toBe('second part')
    const idsBefore = sink
      .drafts()
      .filter((call) => call.at <= (first?.at as number))
      .map((call) => call.draftId)
    const idsAfter = sink
      .drafts()
      .filter((call) => call.at > (first?.at as number))
      .map((call) => call.draftId)
    expect(idsAfter.every((id) => !idsBefore.includes(id))).toBe(true)
  })

  it('sends no draft after the message that replaces it', async () => {
    const { clock, feed, sink, running } = setup({ limits: { text: 10 } })
    await flush()
    feed.push('aaaa bbbb cccc dddd ')
    await clock.advance(250)
    feed.push('eeee')
    feed.end()
    await running

    const last = sink.calls.at(-1)
    expect(last?.kind).toBe('send')
    for (const [index, call] of sink.calls.entries()) {
      if (call.kind !== 'send') continue
      const sentId = sink.calls
        .slice(0, index)
        .filter((earlier) => earlier.kind === 'draft')
        .at(-1)?.draftId
      const laterSameId = sink.calls
        .slice(index + 1)
        .filter(
          (later) => later.kind === 'draft' && later.draftId === sentId && call.text.length > 0,
        )
      expect(laterSameId).toEqual([])
    }
  })
})

describe('text that arrives in pieces', () => {
  it('decodes bytes split inside a character', async () => {
    const bytes = new TextEncoder().encode('héllo 😀 wörld')
    const pieces = [bytes.slice(0, 2), bytes.slice(2, 8), bytes.slice(8, 9), bytes.slice(9)]
    const clock = new Clock()
    const sink = transport(clock)
    await runStream({
      source: fromBytes(pieces),
      transport: sink.impl,
      nextDraftId: ids(),
      clock,
      thinkingPlaceholder: false,
    })

    expect(sink.sends().map((call) => call.text)).toEqual(['héllo 😀 wörld'])
  })

  it('never shows half of a character split between two pieces', async () => {
    const { clock, feed, sink, running } = setup({ thinkingPlaceholder: false })
    await flush()
    const emoji = '😀'
    feed.push(`a${emoji[0]}`)
    await clock.advance(250)
    feed.push(`${emoji[1]}b`)
    await clock.advance(250)
    feed.end()
    await running

    for (const call of sink.calls)
      expect(call.text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
    expect(sink.sends()[0]?.text).toBe('a😀b')
  })

  it('holds back markup that has not finished arriving', async () => {
    const { clock, feed, sink, running } = setup({
      format: { kind: 'html' },
      thinkingPlaceholder: false,
    })
    await flush()
    feed.push('<b>bold</b> and <a href="https://exa')
    await clock.advance(250)
    feed.push('mple.com">link</a>')
    await clock.advance(250)
    feed.end()
    await running

    expect(sink.drafts()[0]?.text).toBe('bold and ')
    expect(sink.sends()[0]).toMatchObject({
      text: 'bold and link',
      entities: ['bold@0+4', 'text_link@9+4'],
    })
  })

  it('keeps well-formed formatting when the finished markup is malformed, and says so', async () => {
    const { feed, sink, errors, running } = setup({
      format: { kind: 'markdown' },
      thinkingPlaceholder: false,
    })
    await flush()
    feed.push('*bold* then 3.5 and _open')
    feed.end()
    await running

    expect(errors.some((error) => error instanceof MarkupParseError)).toBe(true)
    expect(sink.sends()[0]).toMatchObject({
      text: 'bold then 3.5 and open',
      entities: ['bold@0+4', 'italic@18+4'],
    })
  })
})

describe('ending', () => {
  it('stops pulling and discards by default when the reader presses stop', async () => {
    const stop = new StopController()
    const { clock, feed, sink, running } = setup({ stop })
    await flush()
    feed.push('partial answer')
    await clock.advance(250)
    stop.stop()
    const result = await running

    expect(result.stopped).toBe(true)
    expect(sink.sends()).toHaveLength(0)
    expect(result.unsent?.kind === 'text' && result.unsent.formatted.text).toBe('partial answer')
    await flush()
    expect(feed.returned).toBe(true)
  })

  it('sends what was produced when told to keep it on stop', async () => {
    const stop = new StopController()
    const { clock, feed, sink, running } = setup({ stop, onStop: 'send' })
    await flush()
    feed.push('kept')
    await clock.advance(250)
    stop.stop()
    await running

    expect(sink.sends().map((call) => [call.text, call.last])).toEqual([['kept', true]])
  })

  it('cancels a request in flight when aborted, and sends what was produced', async () => {
    const abort = new AbortController()
    const { clock, feed, sink, running } = setup({ signal: abort.signal })
    await flush()
    feed.push('some text')
    sink.holdDrafts(new Promise(() => {}))
    await clock.advance(250)
    const pending = sink.drafts().at(-1)
    abort.abort()
    const result = await running

    expect(pending?.signal.aborted).toBe(true)
    expect(result.aborted).toBe(true)
    expect(sink.sends().map((call) => call.text)).toEqual(['some text'])
    expect(sink.sends()[0]?.signal.aborted).toBe(false)
  })

  it('discards on abort when told to, and reports what it did not send', async () => {
    const abort = new AbortController()
    const { clock, feed, sink, running } = setup({ signal: abort.signal, onAbort: 'discard' })
    await flush()
    feed.push('gone')
    await clock.advance(250)
    abort.abort()
    const result = await running

    expect(sink.sends()).toHaveLength(0)
    expect(result.unsent?.kind === 'text' && result.unsent.formatted.text).toBe('gone')
  })

  it('sends what the source produced before it failed, then says it failed', async () => {
    const { clock, feed, sink, running } = setup()
    await flush()
    feed.push('before the failure')
    await clock.advance(250)
    feed.fail(new Error('model disconnected'))
    const failure = await running.catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(StreamSourceError)
    expect((failure as StreamSourceError).result.messages).toHaveLength(1)
    expect(sink.sends().map((call) => call.text)).toEqual(['before the failure'])
  })

  it('retries a message only after a flood wait, and never after any other failure', async () => {
    const flooded = setup({ thinkingPlaceholder: false })
    await flush()
    flooded.sink.failSend(new FloodError('FLOOD_WAIT_2', { retryAfter: 2 }))
    flooded.feed.push('x')
    flooded.feed.end()
    await flush()
    await flooded.clock.advance(2000)
    const result = await flooded.running
    expect(flooded.sink.sends()).toHaveLength(2)
    expect(result.messages).toHaveLength(1)

    const failing = setup({ thinkingPlaceholder: false })
    await flush()
    failing.sink.failSend(new Error('connection reset'))
    failing.feed.push('y')
    failing.feed.end()
    const failure = await failing.running.catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(StreamSendError)
    expect(failing.sink.sends()).toHaveLength(1)
    expect(
      ((failure as StreamSendError).unsent as { formatted: { text: string } }).formatted.text,
    ).toBe('y')
  })

  it('sends nothing for a stream that produced nothing', async () => {
    const { feed, sink, running } = setup()
    feed.end()
    const result = await running

    expect(sink.sends()).toHaveLength(0)
    expect(result.messages).toEqual([])
  })

  it('leaves no wait or listener behind on any ending', async () => {
    for (const ending of ['end', 'stop', 'abort', 'fail'] as const) {
      const stop = new StopController()
      const abort = new AbortController()
      let listeners = 0
      const add = abort.signal.addEventListener.bind(abort.signal)
      const remove = abort.signal.removeEventListener.bind(abort.signal)
      abort.signal.addEventListener = ((...args: Parameters<typeof add>) => {
        listeners += 1
        add(...args)
      }) as typeof add
      abort.signal.removeEventListener = ((...args: Parameters<typeof remove>) => {
        listeners -= 1
        remove(...args)
      }) as typeof remove

      const { clock, feed, running } = setup({ stop, signal: abort.signal })
      await flush()
      feed.push('text')
      await clock.advance(250)
      if (ending === 'end') feed.end()
      if (ending === 'stop') stop.stop()
      if (ending === 'abort') abort.abort()
      if (ending === 'fail') feed.fail(new Error('x'))
      await running.catch(() => undefined)
      await flush()

      expect(clock.waiting, ending).toBe(0)
      expect(listeners, ending).toBeLessThanOrEqual(0)
      expect(feed.returned || ending === 'end' || ending === 'fail', ending).toBe(true)
    }
  })
})

describe('backpressure', () => {
  it('stops pulling while the text waiting is twice a window', async () => {
    const { clock, feed, sink, running } = setup({
      limits: { text: 10 },
      thinkingPlaceholder: false,
    })
    await flush()
    sink.holdSends(new Promise(() => {}))
    sink.holdDrafts(new Promise(() => {}))
    for (let index = 0; index < 50; index += 1) feed.push('word ')
    await clock.advance(250)
    await flush(20)

    expect(feed.pulls).toBeLessThan(10)
    feed.end()
    void running.catch(() => undefined)
  })
})

describe('sources', () => {
  it('reads the text out of each model SDK shape and skips chunks without any', () => {
    expect(textOf({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'a' } })).toBe(
      'a',
    )
    expect(textOf({ type: 'content_block_start' })).toBeUndefined()
    expect(textOf({ type: 'response.output_text.delta', delta: 'b' })).toBe('b')
    expect(textOf({ choices: [{ delta: { content: 'c' } }] })).toBe('c')
    expect(textOf({ choices: [{ delta: { tool_calls: [] } }] })).toBeUndefined()
    expect(textOf({ message: { content: 'd' } })).toBe('d')
    expect(textOf({ response: 'e' })).toBe('e')
    expect(textOf({ content: [{ type: 'text', text: 'f' }, { type: 'image' }] })).toBe('f')
    expect(textOf({ text: 'g' })).toBe('g')
    expect(textOf(42)).toBeUndefined()
  })

  it('reads a web stream, and cancels it when the consumer stops early', async () => {
    let cancelled = false
    const stream = new ReadableStream<string>({
      pull: (controller) => controller.enqueue('chunk '),
      cancel: () => {
        cancelled = true
      },
    })

    const iterator = normalizeSource(stream)[Symbol.asyncIterator]()
    expect((await iterator.next()).value).toBe('chunk ')
    await iterator.return?.()

    expect(cancelled).toBe(true)
  })

  it('reads an emitter and removes its listeners when done', async () => {
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
    const emitter = {
      on: (event: string, listener: (...args: unknown[]) => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set())
        listeners.get(event)?.add(listener)
      },
      off: (event: string, listener: (...args: unknown[]) => void) => {
        listeners.get(event)?.delete(listener)
      },
      emit: (event: string, ...args: unknown[]) => {
        for (const listener of listeners.get(event) ?? []) listener(...args)
      },
    }

    const reading = (async () => {
      const out: string[] = []
      for await (const text of fromEventEmitter(emitter)) out.push(text)

      return out
    })()
    await flush()
    emitter.emit('text', 'a')
    emitter.emit('text', { type: 'content_block_delta', delta: { text: 'b' } })
    emitter.emit('end')

    expect(await reading).toEqual(['a', 'b'])
    expect([...listeners.values()].every((set) => set.size === 0)).toBe(true)
  })

  it('passes an emitter failure on', async () => {
    const handlers = new Map<string, (...args: unknown[]) => void>()
    const emitter = {
      on: (event: string, listener: (...args: unknown[]) => void) => {
        handlers.set(event, listener)
      },
    }
    const reading = (async () => {
      for await (const _ of fromEventEmitter(emitter)) {
        // nothing arrives
      }
    })()
    await flush()
    handlers.get('error')?.(new Error('broken'))

    await expect(reading).rejects.toThrow('broken')
  })

  it('refuses a bare string and anything else it cannot read', () => {
    expect(() => normalizeSource('text' as never)).toThrow(/wrap it/)
    expect(() => normalizeSource(42 as never)).toThrow(/iterable/)
  })
})
