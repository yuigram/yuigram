/**
 * Durable flows, and the in-memory wait handing its turn back.
 *
 * A "restart" here is a new plugin over the same store with the definitions
 * registered again — a fresh runtime with nothing carried over in memory. The
 * store round-trips every value through JSON, as a file store does, so a run
 * that only survived because an in-memory store kept a live object would fail
 * here. A "crash" is a store that throws at a chosen write: whatever the
 * runtime did after that point never happened as far as the store knows, and
 * the runtime is abandoned.
 *
 * Crossing a real process boundary is what `examples/16-durable-flows` does.
 */

import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  type ConversationContext,
  createConversation,
  defineFlow,
  EffectUncertainError,
  type FlowDefinition,
  type FlowOptions,
  type FlowProblem,
  type FlowRecord,
  FlowStepError,
  type KV,
  WaitCancelledError,
  WaitTimeoutError,
} from '../src/index.js'
import { memory } from '../src/storage/memory.js'

/** The context the flows below are written against. */
type Ctx = ConversationContext & {
  readonly text?: string
  readonly updateId: number
  reply(text: string): Promise<void>
  readonly conversation: import('../src/index.js').Conversation
}

/** Everything any runtime said, in order. */
let said: string[] = []
let nextUpdate = 1

beforeEach(() => {
  said = []
  nextUpdate = 1
})

function update(
  text: string,
  fields: {
    chat?: number
    user?: number
    client?: string
    updateId?: number
    topicId?: number
  } = {},
): Ctx {
  return {
    kind: 'message',
    transport: 'test',
    client: { name: fields.client ?? 'bot' },
    log: { debug() {}, info() {}, warn() {}, error() {} } as never,
    raw: {},
    chat: { id: fields.chat ?? 1 },
    sender: { id: fields.user ?? 10 },
    ...(fields.topicId === undefined ? {} : { topicId: fields.topicId }),
    text,
    updateId: fields.updateId ?? nextUpdate++,
    reply: async (answer: string) => {
      said.push(answer)
    },
  } as unknown as Ctx
}

/** A store that keeps what a file store would: JSON, and nothing else. */
function durable(): KV<FlowRecord> & {
  raw: KV<string>
  writes: number
  crashAt: number | undefined
} {
  const raw = memory<string>()
  const store = {
    raw,
    writes: 0,
    crashAt: undefined as number | undefined,
    async get(key: string) {
      const text = await raw.get(key)

      return text === undefined ? undefined : (JSON.parse(text) as FlowRecord)
    },
    async set(key: string, value: FlowRecord, options?: { ttl?: number }) {
      store.writes += 1
      if (store.crashAt !== undefined && store.writes >= store.crashAt) {
        throw new Error('the process died here')
      }
      await raw.set(key, JSON.stringify(value), options)
    },
    async delete(key: string) {
      await raw.delete(key)
    },
    keys: (prefix?: string) => raw.keys?.(prefix) as AsyncIterable<string>,
  }

  return store
}

/** A runtime: the plugin, a handler behind it, and a hand-driven clock and timers. */
function runtime(
  store: KV<FlowRecord>,
  definitions: readonly FlowDefinition<Ctx, never, unknown>[],
  options: {
    handler?: (context: Ctx) => unknown
    clock?: { now: number }
    flows?: Partial<FlowOptions<Ctx>>
  } = {},
) {
  const clock = options.clock ?? { now: 1_000_000 }
  const timers: { run: () => void; at: number; cancelled: boolean }[] = []
  const problems: FlowProblem[] = []
  const reached: string[] = []

  const { middleware, controls } = createConversation<Ctx>({
    storage: memory(),
    schedule: (run, delay) => {
      const timer = { run, at: clock.now + delay, cancelled: false }
      timers.push(timer)

      return () => {
        timer.cancelled = true
      }
    },
    flows: {
      storage: store,
      define: definitions,
      now: () => clock.now,
      onProblem: (problem) => problems.push(problem),
      ...options.flows,
    },
  })

  const deliver = async (context: Ctx): Promise<boolean> => {
    let handled = false
    await middleware(context, async () => {
      handled = true
      reached.push(context.text ?? '')
      await options.handler?.(context)
    })

    return handled
  }

  /** Move the clock on and fire whatever came due. */
  const advance = async (ms: number): Promise<void> => {
    clock.now += ms
    for (const timer of timers.splice(0)) {
      if (timer.cancelled) continue
      if (timer.at <= clock.now) timer.run()
      else timers.push(timer)
    }
    await settle()
  }

  return { deliver, controls, problems, reached, timers, clock, advance }
}

const settle = (ms = 20): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const text = {
  match: (context: Ctx) => typeof context.text === 'string',
  transform: (context: Ctx) => context.text as string,
}

/** Counts what reached the outside world, across runtimes. */
let saved: { name: string; age: number }[] = []

beforeEach(() => {
  saved = []
})

const signup = defineFlow<Ctx, { source: string }, { name: string; age: number }>({
  name: 'signup',
  run: async (flow, input) => {
    const name = await flow.ask('name', (context) => context.reply('What is your name?'), text)
    const age = await flow.ask('age', (context) => context.reply(`How old are you, ${name}?`), {
      match: text.match,
      transform: (context) => Number(context.text),
      validate: (value) => (Number.isInteger(value) && value > 0) || 'a whole number, please',
      onInvalid: (reason, context) => context.reply(reason ?? 'again'),
      timeout: 60_000,
    })
    const id = await flow.effect('save', () => {
      saved.push({ name, age })

      return saved.length
    })
    await flow.effect('thank', async () => {
      await flow.context.reply(`Saved ${name} as #${id}, from ${input.source}.`)

      return null
    })

    return { name, age }
  },
})

const startOn = (definition: FlowDefinition<Ctx, never, unknown>) => async (context: Ctx) => {
  if (context.text === '/signup') await context.conversation.start(definition, { source: 'test' })
}

describe('an in-memory wait inside a handler', () => {
  it('hands the conversation back, so the answer can reach it', async () => {
    let answer: unknown
    const { middleware } = createConversation<Ctx>({ storage: memory() })
    const run = (context: Ctx, handler: (c: Ctx) => Promise<void> = async () => {}) =>
      middleware(context, () => handler(context))

    const asking = run(update('/nickname'), async (context) => {
      answer = await context.conversation.wait({ ...text })
    })
    await settle()
    const answering = run(update('Ada'))

    await Promise.race([
      Promise.all([asking, answering]),
      settle(1_000).then(() => {
        throw new Error('the answer never reached the waiting handler')
      }),
    ])
    expect(answer).toBe('Ada')
  })

  it('takes the turn back before the handler carries on, never alongside a later update', async () => {
    const order: string[] = []
    const { middleware } = createConversation<Ctx>({ storage: memory() })

    const context = update('/ask')
    const waiting = middleware(context, async () => {
      await context.conversation.wait({ ...text })
      order.push('continued')
      await settle(30)
      order.push('continued, done')
    })
    await settle()

    // The answer and the update after it arrive together.
    await Promise.all([
      middleware(update('answer'), async () => {
        order.push('answer reached the handlers')
      }),
      middleware(update('after'), async () => {
        order.push('after')
        await settle(30)
        order.push('after, done')
      }),
    ])
    await waiting

    // The answer was consumed. The update after it was already queued, so it
    // ran first — and the handler's continuation did not overlap it.
    expect(order).toEqual(['after', 'after, done', 'continued', 'continued, done'])
  })

  it('does not hold the conversation for a wait nobody awaited', async () => {
    const { middleware } = createConversation<Ctx>({ storage: memory() })
    const context = update('/ask')
    let pending: Promise<unknown> | undefined
    await middleware(context, async () => {
      pending = context.conversation.wait({ ...text })
    })

    await middleware(update('Ada'), async () => {})
    expect(await pending).toBe('Ada')
    // And the conversation is free afterwards.
    let later = false
    await middleware(update('again'), async () => {
      later = true
    })
    expect(later).toBe(true)
  })
})

describe('a durable flow', () => {
  it('runs to its first question and waits there, as stored data', async () => {
    const store = durable()
    const { deliver } = runtime(store, [signup], { handler: startOn(signup) })

    await deliver(update('/signup'))

    expect(said).toEqual(['What is your name?'])
    const record = (await store.get('bot:c:1:u:10')) as FlowRecord
    expect(record).toMatchObject({
      flow: 'signup',
      version: 1,
      status: 'active',
      waiting: { label: 'name', at: 1, attempts: 0 },
      address: { client: 'bot', chat: 1, user: 10 },
      input: { source: 'test' },
    })
    expect(record.journal).toEqual([
      { kind: 'effect', label: 'name?', state: 'done', attempt: 1, value: null },
    ])
  })

  it('goes from question to question and finishes with its result', async () => {
    const { deliver, controls } = runtime(durable(), [signup], { handler: startOn(signup) })

    await deliver(update('/signup'))
    expect(await deliver(update('Ada'))).toBe(false)
    await deliver(update('36'))

    expect(said).toEqual([
      'What is your name?',
      'How old are you, Ada?',
      'Saved Ada as #1, from test.',
    ])
    expect(saved).toEqual([{ name: 'Ada', age: 36 }])
    expect(await controls.flows?.status('bot:c:1:u:10')).toMatchObject({
      status: 'done',
      result: { name: 'Ada', age: 36 },
    })
    // Finished: what comes next goes to the handlers.
    expect(await deliver(update('hello'))).toBe(true)
  })

  it('carries on in a new runtime, asking nothing twice', async () => {
    const store = durable()
    const first = runtime(store, [signup], { handler: startOn(signup) })
    await first.deliver(update('/signup'))
    await first.deliver(update('Ada'))

    // Everything in memory is gone; the definitions are registered again.
    const second = runtime(store, [signup])
    await second.deliver(update('36'))

    expect(said).toEqual([
      'What is your name?',
      'How old are you, Ada?',
      'Saved Ada as #1, from test.',
    ])
    expect(saved).toHaveLength(1)
  })

  it('keeps asking when an answer is rejected, and counts the attempts', async () => {
    const store = durable()
    const { deliver, controls } = runtime(store, [signup], { handler: startOn(signup) })
    await deliver(update('/signup'))
    await deliver(update('Ada'))

    expect(await deliver(update('old enough'))).toBe(false)
    expect(said.at(-1)).toBe('a whole number, please')
    expect((await controls.flows?.status('bot:c:1:u:10'))?.waitingFor).toMatchObject({
      label: 'age',
      attempts: 1,
    })

    await deliver(update('36'))
    expect(saved).toEqual([{ name: 'Ada', age: 36 }])
  })

  it('belongs to one conversation: other people, chats, clients and topics are untouched', async () => {
    const { deliver } = runtime(durable(), [signup], { handler: startOn(signup) })
    await deliver(update('/signup', { chat: 1, user: 10 }))

    // Somebody else in the same chat, the same person elsewhere, and another
    // client: none of them is answering the question.
    expect(await deliver(update('Bob', { chat: 1, user: 11 }))).toBe(true)
    expect(await deliver(update('Bob', { chat: 2, user: 10 }))).toBe(true)
    expect(await deliver(update('Bob', { client: 'account', chat: 1, user: 10 }))).toBe(true)

    await deliver(update('Ada', { chat: 1, user: 10 }))
    expect(said.at(-1)).toBe('How old are you, Ada?')
  })

  it('keeps topics apart when the scope says so', async () => {
    const store = durable()
    const { middleware } = createConversation<Ctx>({
      storage: memory(),
      scope: 'chat+user+topic',
      flows: { storage: store, define: [signup] },
    })
    const run = (context: Ctx) =>
      middleware(context, async () => {
        if (context.text === '/signup') await context.conversation.start(signup, { source: 't' })
      })

    await run(update('/signup', { topicId: 5 }))
    await run(update('Ada', { topicId: 6 }))
    expect(said).toEqual(['What is your name?'])

    await run(update('Ada', { topicId: 5 }))
    expect(said.at(-1)).toBe('How old are you, Ada?')
  })

  it('lets only one of two answers arriving together advance a wait', async () => {
    const { deliver } = runtime(durable(), [signup], { handler: startOn(signup) })
    await deliver(update('/signup'))

    const [first, second] = await Promise.all([deliver(update('Ada')), deliver(update('Bob'))])

    // 'Ada' answered the name. 'Bob' arrived after and was offered to the age,
    // which rejected it.
    expect([first, second]).toEqual([false, false])
    expect(said).toEqual(['What is your name?', 'How old are you, Ada?', 'a whole number, please'])
  })

  it('recognises an update delivered twice', async () => {
    const store = durable()
    const { deliver } = runtime(store, [signup], { handler: startOn(signup) })
    const start = update('/signup')
    await deliver(start)
    const answer = update('Ada')
    await deliver(answer)

    // Redelivered: the start does not start again, and the answer does not
    // answer the next question.
    expect(await deliver(start)).toBe(false)
    expect(await deliver(answer)).toBe(false)

    expect(said).toEqual(['What is your name?', 'How old are you, Ada?'])
    expect((await store.get('bot:c:1:u:10'))?.waiting?.label).toBe('age')
  })

  it('times out a wait whose deadline passed while nothing was running', async () => {
    const outcomes: string[] = []
    const patient = defineFlow<Ctx>({
      name: 'patient',
      run: async (flow) => {
        try {
          await flow.ask('reply', (context) => context.reply('Still there?'), {
            ...text,
            timeout: 60_000,
          })
          outcomes.push('answered')
        } catch (error) {
          if (!(error instanceof WaitTimeoutError)) throw error
          outcomes.push(`timed out, resumed by ${flow.resumedBy}`)
          await flow.effect('late', async () => {
            await flow.context.reply('Too late.')

            return null
          })
        }
      },
    })
    const store = durable()
    const clock = { now: 1_000_000 }
    const first = runtime(store, [patient], {
      clock,
      handler: async (context) => {
        if (context.text === '/go') await context.conversation.start(patient)
      },
    })
    await first.deliver(update('/go'))

    // Offline for two minutes; the next process has not called resume.
    clock.now += 120_000
    const second = runtime(store, [patient], { clock })
    const reachedHandlers = await second.deliver(update('here'))

    expect(outcomes).toEqual(['timed out, resumed by update'])
    expect(said).toEqual(['Still there?', 'Too late.'])
    // Arriving after the deadline, it was not an answer.
    expect(reachedHandlers).toBe(true)
  })

  it('acts on deadlines found at startup, without waiting for an update', async () => {
    const seen: string[] = []
    const reminder = defineFlow<Ctx>({
      name: 'reminder',
      run: async (flow) => {
        try {
          await flow.wait('confirm', { ...text, timeout: 60_000 })
        } catch (error) {
          if (!(error instanceof WaitTimeoutError)) throw error
          seen.push(`${flow.resumedBy} ${flow.hasContext} ${flow.address.chat}`)
          expect(() => flow.context).toThrow(/a deadline passed/)
        }
      },
    })
    const store = durable()
    const clock = { now: 1_000_000 }
    const first = runtime(store, [reminder], {
      clock,
      handler: async (context) => {
        await context.conversation.start(reminder)
      },
    })
    await first.deliver(update('/go', { chat: 1 }))
    await first.deliver(update('/go', { chat: 2 }))
    await first.controls.flows?.shutdown()

    // One deadline passes while nothing runs; the other has not come yet.
    clock.now += 30_000
    const second = runtime(store, [reminder], { clock })
    const early = await second.controls.flows?.resume()
    expect(early).toEqual({ active: 2, scheduled: 2, expired: 0, problems: 0 })

    clock.now += 40_000
    const third = runtime(store, [reminder], { clock })
    const late = await third.controls.flows?.resume()

    expect(late).toEqual({ active: 2, scheduled: 0, expired: 2, problems: 0 })
    expect(seen.sort()).toEqual(['deadline false 1', 'deadline false 2'])
  })

  it('fires a deadline in the runtime that is waiting on it', async () => {
    const seen: string[] = []
    const quick = defineFlow<Ctx>({
      name: 'quick',
      run: async (flow) => {
        await flow.wait('answer', { ...text, timeout: 5_000 }).catch((error: unknown) => {
          seen.push((error as Error).name)
        })
      },
    })
    const { deliver, advance, controls } = runtime(durable(), [quick], {
      handler: async (context) => {
        await context.conversation.start(quick)
      },
    })
    await deliver(update('/go'))

    await advance(4_000)
    expect(seen).toEqual([])
    await advance(2_000)

    expect(seen).toEqual(['WaitTimeoutError'])
    expect((await controls.flows?.status('bot:c:1:u:10'))?.status).toBe('done')
  })

  it('tells the flow it was cancelled, lets it clean up, and ends it for good', async () => {
    const cleaned: string[] = []
    const cancellable = defineFlow<Ctx>({
      name: 'cancellable',
      run: async (flow) => {
        try {
          // Commands are not answers, so `/cancel` reaches the handlers.
          await flow.wait('answer', {
            ...text,
            match: (context) => !context.text?.startsWith('/'),
          })
        } catch (error) {
          if (error instanceof WaitCancelledError) {
            await flow.effect('undo', () => {
              cleaned.push(error.message)

              return null
            })
          }
          throw error
        }
      },
    })
    const store = durable()
    const { deliver } = runtime(store, [cancellable], {
      handler: async (context) => {
        if (context.text === '/go') await context.conversation.start(cancellable)
        if (context.text === '/cancel') await context.conversation.cancelFlow('asked to stop')
      },
    })
    await deliver(update('/go'))

    // A command the flow does not match reaches the handlers, which cancel.
    await deliver(update('/cancel'))

    expect(cleaned).toEqual(['asked to stop'])
    expect(await store.get('bot:c:1:u:10')).toMatchObject({
      status: 'cancelled',
      reason: 'asked to stop',
    })
    expect(await deliver(update('anything'))).toBe(true)
  })

  it('is cancelled by entering a scene, and replaced by starting another flow', async () => {
    const endings: string[] = []
    const holding = (name: string) =>
      defineFlow<Ctx>({
        name,
        run: async (flow) => {
          // A `.catch` around a wait is the ordinary way to handle how it
          // ends, and must not catch the flow stopping to wait.
          await flow
            .wait('answer', { ...text, match: (context) => !context.text?.startsWith('/') })
            .catch((error: unknown) => {
              endings.push(`${name}: ${(error as Error).message}`)
              throw error
            })
        },
      })
    const one = holding('one')
    const two = holding('two')
    const store = durable()
    const { deliver, controls } = runtime(store, [one, two], {
      handler: async (context) => {
        if (context.text === '/one') await context.conversation.start(one)
        if (context.text === '/two') await context.conversation.start(two)
        if (context.text === '/scene') await context.conversation.enter('form')
      },
    })
    controls.addScene({ name: 'form', steps: [() => {}] })

    await deliver(update('/one'))
    await deliver(update('/two'))
    expect(endings).toEqual(["one: replaced by 'two'"])

    await deliver(update('/scene'))
    expect(endings).toEqual(["one: replaced by 'two'", 'two: the conversation entered a scene'])
    expect((await store.get('bot:c:1:u:10'))?.status).toBe('cancelled')
  })

  it('starts once for one update, however often a handler asks', async () => {
    let runs = 0
    const counted = defineFlow<Ctx>({
      name: 'counted',
      run: async (flow) => {
        runs += 1
        await flow.wait('answer', text)
      },
    })
    const store = durable()
    const { deliver } = runtime(store, [counted], {
      handler: async (context) => {
        const first = await context.conversation.start(counted)
        const second = await context.conversation.start(counted)
        expect(second.run).toBe(first.run)
      },
    })
    await deliver(update('/go'))

    expect(runs).toBe(1)
    expect((await store.get('bot:c:1:u:10'))?.status).toBe('active')
  })

  it('refuses to replace a running flow when told not to', async () => {
    const waiting = defineFlow<Ctx>({
      name: 'waiting',
      run: async (flow) => {
        await flow.wait('answer', { ...text, match: (context) => !context.text?.startsWith('/') })
      },
    })
    const failures: unknown[] = []
    const store = durable()
    const { deliver } = runtime(store, [waiting], {
      handler: async (context) => {
        await context.conversation
          .start(waiting, undefined, { replace: false })
          .catch((error: unknown) => failures.push(error))
      },
    })
    await deliver(update('/go'))
    const first = (await store.get('bot:c:1:u:10'))?.run

    // A second command, not an answer, reaches the handlers and tries again.
    await deliver(update('/go'))

    expect(failures).toHaveLength(1)
    expect(String(failures[0])).toMatch(/'waiting' is already running in this conversation/)
    expect((await store.get('bot:c:1:u:10'))?.run).toBe(first)
  })

  it('stops acting on deadlines when shut down, without cancelling anything', async () => {
    const store = durable()
    const clock = { now: 1_000_000 }
    const first = runtime(store, [signup], { clock, handler: startOn(signup) })
    await first.deliver(update('/signup'))
    await first.deliver(update('Ada'))

    expect(first.timers.filter((timer) => !timer.cancelled)).toHaveLength(1)
    await first.controls.flows?.shutdown()
    expect(first.timers.filter((timer) => !timer.cancelled)).toHaveLength(0)
    expect((await store.get('bot:c:1:u:10'))?.status).toBe('active')

    const second = runtime(store, [signup], { clock })
    expect(await second.controls.flows?.resume()).toMatchObject({ active: 1, scheduled: 1 })
    await second.deliver(update('36'))
    expect(saved).toEqual([{ name: 'Ada', age: 36 }])
  })

  it('fails when its code throws, telling the handler, and lets the conversation go', async () => {
    const broken = defineFlow<Ctx>({
      name: 'broken',
      run: async (flow) => {
        await flow.wait('answer', text)
        throw new Error('the flow broke')
      },
    })
    const store = durable()
    const { deliver } = runtime(store, [broken], {
      handler: async (context) => {
        if (context.text === '/go') await context.conversation.start(broken)
      },
    })
    await deliver(update('/go'))

    await expect(deliver(update('answer'))).rejects.toThrow('the flow broke')
    expect(await store.get('bot:c:1:u:10')).toMatchObject({
      status: 'failed',
      error: { name: 'Error', message: 'the flow broke' },
    })
    expect(await deliver(update('next'))).toBe(true)
  })
})

describe('effects across a stop', () => {
  /** A flow with one effect between two waits, counting how often it ran. */
  const effectFlow = (
    repeat: boolean,
    ran: { count: number; keys: string[]; attempts: number[] },
  ) =>
    defineFlow<Ctx>({
      name: 'charge',
      run: async (flow) => {
        await flow.wait('go', text)
        let outcome: string
        try {
          outcome = await flow.effect(
            'charge',
            (once) => {
              ran.count += 1
              ran.keys.push(`${once.key}/${once.id}`)
              ran.attempts.push(once.attempt)

              return 'charged'
            },
            { repeat },
          )
        } catch (error) {
          if (!(error instanceof EffectUncertainError)) throw error
          outcome = 'uncertain'
        }
        await flow.effect('report', async () => {
          await flow.context.reply(outcome)

          return null
        })
      },
    })

  /**
   * Run up to the first answer, crashing at the given write, then resume in a
   * new runtime.
   *
   * The writes the answer causes, in order: the answer itself (1), the
   * effect's start (2), its result (3), then the report's start and result.
   */
  async function crashAt(write: number, repeat: boolean) {
    const ran = { count: 0, keys: [] as string[], attempts: [] as number[] }
    const definition = effectFlow(repeat, ran)
    const store = durable()
    const first = runtime(store, [definition], {
      handler: async (context) => {
        if (context.text === '/go') await context.conversation.start(definition)
      },
    })
    await first.deliver(update('/go'))

    store.writes = 0
    store.crashAt = write
    await first.deliver(update('now')).catch(() => undefined)
    store.crashAt = undefined

    said = []
    const second = runtime(store, [definition])
    await second.deliver(update('resume'))

    return { ran, said: [...said], record: await store.get('bot:c:1:u:10') }
  }

  it('runs an effect once when the stop came before it began', async () => {
    const { ran, said: told } = await crashAt(1, false)

    // The answer itself was never written: the resuming update answers instead.
    expect(ran.count).toBe(1)
    expect(told).toEqual(['charged'])
  })

  it('reports the outcome as unknown when the stop came after it began', async () => {
    const { ran, said: told, record } = await crashAt(3, false)

    // It ran before the stop; whether its result reached anyone is unknown,
    // so it is not run again, and the flow is told.
    expect(ran.count).toBe(1)
    expect(told).toEqual(['uncertain'])
    expect(record?.status).toBe('done')
  })

  it('treats a stop just after the start was written the same way', async () => {
    // The start was written, the effect never ran: from the store's point of
    // view this cannot be told apart from the case above.
    const ran = { count: 0, keys: [] as string[], attempts: [] as number[] }
    const definition = effectFlow(false, ran)
    const store = durable()
    const first = runtime(store, [definition], {
      handler: async (context) => {
        if (context.text === '/go') await context.conversation.start(definition)
      },
    })
    await first.deliver(update('/go'))
    const record = (await store.get('bot:c:1:u:10')) as FlowRecord
    const { waiting: _waiting, ...rest } = record
    await store.set('bot:c:1:u:10', {
      ...rest,
      journal: [
        { kind: 'answer', label: 'go', value: 'now' },
        { kind: 'effect', label: 'charge', state: 'started', attempt: 1 },
      ],
    })

    said = []
    await runtime(store, [definition]).deliver(update('resume'))

    expect(ran.count).toBe(0)
    expect(said).toEqual(['uncertain'])
  })

  it('runs a repeatable effect again, under the same key', async () => {
    const { ran, said: told } = await crashAt(3, true)

    expect(ran.count).toBe(2)
    expect(new Set(ran.keys).size).toBe(1)
    expect(ran.attempts).toEqual([1, 2])
    expect(told).toEqual(['charged'])
  })

  it('replays an effect whose result was written, without running it', async () => {
    const { ran, said: told } = await crashAt(4, false)

    expect(ran.count).toBe(1)
    expect(told).toEqual(['charged'])
  })

  it('replays a failed effect as the same failure', async () => {
    const failing = defineFlow<Ctx>({
      name: 'failing',
      run: async (flow) => {
        await flow.wait('go', text)
        try {
          await flow.effect('send', () => {
            throw new RangeError('refused')
          })
        } catch (error) {
          await flow.effect('told', async () => {
            await flow.context.reply(
              error instanceof FlowStepError ? `${error.step}: ${error.causeName}` : 'other',
            )

            return null
          })
        }
        await flow.wait('again', text)
      },
    })
    const store = durable()
    const first = runtime(store, [failing], {
      handler: async (context) => {
        if (context.text === '/go') await context.conversation.start(failing)
      },
    })
    await first.deliver(update('/go'))
    await first.deliver(update('now'))
    const second = runtime(store, [failing])
    await second.deliver(update('again'))

    expect(said).toEqual(['send: RangeError'])
    expect((await store.get('bot:c:1:u:10'))?.status).toBe('done')
  })
})

describe('runs that cannot be resumed here', () => {
  async function started(definition: FlowDefinition<Ctx, never, unknown>) {
    const store = durable()
    await runtime(store, [definition], {
      handler: async (context) => {
        await context.conversation.start(definition)
      },
    }).deliver(update('/go'))

    return store
  }

  const v1 = defineFlow<Ctx>({
    name: 'form',
    run: async (flow) => {
      await flow.wait('first', text)
      await flow.wait('second', text)
    },
  })

  it('leaves a run of a version the definition does not accept, and says so', async () => {
    const store = await started(v1)
    const before = await store.raw.get('bot:c:1:u:10')
    const v2 = defineFlow<Ctx>({ ...v1, version: 2 })
    const next = runtime(store, [v2])

    expect(await next.deliver(update('answer'))).toBe(true)
    expect(next.problems.map((problem) => problem.kind)).toEqual(['incompatible'])
    expect(await store.raw.get('bot:c:1:u:10')).toBe(before)
  })

  it('resumes an older version the definition says it accepts', async () => {
    const store = await started(v1)
    const v2 = defineFlow<Ctx>({
      name: 'form',
      version: 2,
      accepts: [1, 2],
      run: async (flow) => {
        await flow.wait('first', text)
        await flow.wait('second', text)
        await flow.wait('third', text)
      },
    })
    const next = runtime(store, [v2])

    expect(await next.deliver(update('answer'))).toBe(false)
    expect((await store.get('bot:c:1:u:10'))?.waiting?.label).toBe('second')
  })

  it('leaves a run whose flow is not defined here, and says so', async () => {
    const store = await started(v1)
    const next = runtime(store, [])

    expect(await next.deliver(update('answer'))).toBe(true)
    expect(next.problems[0]).toMatchObject({ kind: 'missing', flow: 'form' })
    expect((await store.get('bot:c:1:u:10'))?.status).toBe('active')
  })

  it('leaves a stored value that is not a run it can read, and says so', async () => {
    const store = durable()
    await store.raw.set('bot:c:1:u:10', JSON.stringify({ format: 99, status: 'active' }))
    const next = runtime(store, [v1])

    expect(await next.deliver(update('answer'))).toBe(true)
    expect(next.problems[0]?.kind).toBe('invalid')
  })

  it('writes nothing when the steps changed without the version', async () => {
    const store = await started(v1)
    await runtime(store, [v1]).deliver(update('one'))
    const before = await store.raw.get('bot:c:1:u:10')
    const renamed = defineFlow<Ctx>({
      name: 'form',
      run: async (flow) => {
        await flow.wait('renamed', text)
        await flow.wait('second', text)
      },
    })
    const next = runtime(store, [renamed])

    expect(await next.deliver(update('two'))).toBe(true)
    expect(next.problems[0]?.kind).toBe('diverged')
    expect(await store.raw.get('bot:c:1:u:10')).toBe(before)
  })

  it('writes nothing when a definition ends before the step a run was waiting at', async () => {
    const store = await started(v1)
    await runtime(store, [v1]).deliver(update('one'))
    const before = await store.raw.get('bot:c:1:u:10')
    const shorter = defineFlow<Ctx>({
      name: 'form',
      run: async (flow) => {
        await flow.wait('first', text)
      },
    })
    const next = runtime(store, [shorter])

    expect(await next.deliver(update('two'))).toBe(true)
    expect(next.problems[0]?.kind).toBe('diverged')
    expect(await store.raw.get('bot:c:1:u:10')).toBe(before)
  })

  it('writes nothing when an effect now stands where the run was waiting', async () => {
    const store = await started(v1)
    const before = await store.raw.get('bot:c:1:u:10')
    let ran = false
    const inserted = defineFlow<Ctx>({
      name: 'form',
      run: async (flow) => {
        await flow.effect('new', () => {
          ran = true

          return null
        })
        await flow.wait('first', text)
      },
    })
    const next = runtime(store, [inserted])

    expect(await next.deliver(update('one'))).toBe(true)
    expect(ran).toBe(false)
    expect(await store.raw.get('bot:c:1:u:10')).toBe(before)
  })
})

describe('what a flow may keep', () => {
  it('refuses input that is not plain data', async () => {
    const flow = defineFlow<Ctx, unknown>({ name: 'any', run: () => undefined })
    const failures: unknown[] = []
    const { deliver } = runtime(durable(), [flow], {
      handler: async (context) => {
        await context.conversation
          .start(flow, { at: new Date(0) })
          .catch((error: unknown) => failures.push(error))
      },
    })
    await deliver(update('/go'))

    expect(String(failures[0])).toMatch(/is a Date; a flow keeps plain data only/)
  })

  it('refuses an effect result that is not plain data, as a failure of that step', async () => {
    const caught: string[] = []
    const flow = defineFlow<Ctx>({
      name: 'any',
      run: async (flow) => {
        await flow
          .effect('clock', () => new Map() as never)
          .catch((error: unknown) => caught.push((error as FlowStepError).causeName))
      },
    })
    const { deliver } = runtime(durable(), [flow], {
      handler: async (context) => {
        await context.conversation.start(flow)
      },
    })
    await deliver(update('/go'))

    expect(caught).toEqual(['ValidationError'])
  })

  it('refuses a step reached from inside an effect', async () => {
    const caught: string[] = []
    const flow = defineFlow<Ctx>({
      name: 'nested',
      run: async (flow) => {
        await flow
          .effect('outer', async () => {
            await flow.wait('inner', text)

            return null
          })
          .catch((error: unknown) => caught.push((error as FlowStepError).causeName))
      },
    })
    const { deliver } = runtime(durable(), [flow], {
      handler: async (context) => {
        await context.conversation.start(flow)
      },
    })
    await deliver(update('/go'))

    expect(caught).toEqual(['ValidationError'])
  })

  it('keeps what it was handed, not what anybody changed afterwards', async () => {
    const store = durable()
    // An object the effect hands over and its owner goes on changing.
    const shared = { items: [1] }
    const flow = defineFlow<Ctx>({
      name: 'mutating',
      run: async (flow) => {
        const value = await flow.effect('list', () => shared)
        value.items.push(3)
        shared.items.push(2)
        await flow.wait('hold', text)
      },
    })
    await runtime(store, [flow], {
      handler: async (context) => {
        await context.conversation.start(flow)
      },
    }).deliver(update('/go'))

    expect((await store.get('bot:c:1:u:10'))?.journal[0]).toMatchObject({ value: { items: [1] } })
  })

  it('says it needs flows configured before one is started', async () => {
    const failures: unknown[] = []
    const { middleware } = createConversation<Ctx>({ storage: memory() })
    const context = update('/go')
    await middleware(context, async () => {
      await context.conversation.start('anything').catch((error: unknown) => failures.push(error))
    })

    expect(String(failures[0])).toMatch(/no flows are configured/)
  })
})

describe('a pass that stopped at a wait', () => {
  /**
   * A flow that notes, pass by pass, reaching its first wait and getting past
   * it. Every pass runs the function from the top; one that stops at a wait is
   * abandoned there, and must never get past it later.
   */
  function traced() {
    let passes = 0
    const trail: string[] = []
    const effects: string[] = []
    const frames: WeakRef<object>[] = []
    const definition = defineFlow<Ctx>({
      name: 'traced',
      run: async (flow) => {
        passes += 1
        const pass = passes
        // Held by this pass's suspended frame, across the wait, and by nothing else.
        const frame = { pass, padding: new Array<number>(256).fill(pass) }
        frames.push(new WeakRef(frame))
        trail.push(`waiting@${pass}`)
        const first = await flow.wait('first', {
          ...text,
          validate: (value) => value === 'yes' || 'say yes',
          timeout: 60_000,
        })
        trail.push(`past@${frame.pass}`)
        await flow.effect('once', () => {
          effects.push(first)

          return null
        })
        await flow.wait('second', text)

        return null
      },
    })

    return { definition, trail, effects, frames, passes: () => passes }
  }

  const liveTimers = (timers: readonly { cancelled: boolean }[]): number =>
    timers.filter((timer) => !timer.cancelled).length

  it('never gets past the wait later, whatever happens to the run afterwards', async () => {
    const flow = traced()
    const { deliver, controls, timers, advance } = runtime(durable(), [flow.definition], {
      handler: async (context) => {
        if (context.text === '/go') await context.conversation.start(flow.definition)
      },
    })

    await deliver(update('/go'))
    for (let answer = 0; answer < 5; answer += 1) await deliver(update('no'))
    // One deadline at a time, however often the wait was reached again.
    expect(liveTimers(timers)).toBe(1)

    await deliver(update('yes'))
    await controls.flows?.cancel('bot:c:1:u:10', 'done with it')
    await controls.flows?.shutdown()
    await advance(120_000)
    await settle(50)

    const stopped = [1, 2, 3, 4, 5, 6]
    expect(flow.passes()).toBe(8)
    for (const pass of stopped) expect(flow.trail).not.toContain(`past@${pass}`)
    // The answering pass got past it, and so did the cancelling one, replaying.
    expect(flow.trail.filter((entry) => entry.startsWith('past@'))).toEqual(['past@7', 'past@8'])
    expect(flow.effects).toEqual(['yes'])
    expect(liveTimers(timers)).toBe(0)
  })

  it('lets go of every pass it abandoned, however many times the run is resumed', async () => {
    setFlagsFromString('--expose-gc')
    const gc = runInNewContext('gc') as () => void
    const collect = async (): Promise<void> => {
      for (let round = 0; round < 4; round += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0))
        gc()
      }
    }

    const flow = traced()
    const { deliver, timers } = runtime(durable(), [flow.definition], {
      handler: async (context) => {
        if (context.text === '/go') await context.conversation.start(flow.definition)
      },
    })
    // Something held on purpose, so a count of zero means collected rather than
    // a count that cannot see anything.
    const held = { padding: new Array<number>(256).fill(0) }
    const control = new WeakRef(held)

    await deliver(update('/go'))
    for (let answer = 0; answer < 200; answer += 1) await deliver(update('no'))
    await collect()

    const alive = flow.frames.filter((frame) => frame.deref() !== undefined).length
    expect(flow.passes()).toBe(201)
    expect(control.deref()).toBe(held)
    expect(alive).toBeLessThanOrEqual(1)
    expect(liveTimers(timers)).toBe(1)
  })
})
