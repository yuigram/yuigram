/**
 * Conversations: identity, scenes, waiters and prompts.
 *
 * The properties worth holding are the ones that fail quietly otherwise: state
 * belonging to the wrong conversation, two updates advancing one form twice, a
 * prompt swallowing somebody else's message, and a scene that survives a
 * restart only until you check.
 */

import { describe, expect, it } from 'vitest'
import {
  type ConversationContext,
  ConversationLocks,
  conversation,
  conversationKey,
  createConversation,
  hears,
  type SceneDefinition,
  type ScenePosition,
  WaitCancelledError,
  WaitTimeoutError,
} from '../src/index.js'
import { memory } from '../src/storage/memory.js'

/** A context of the shape the plugin reads, with whatever a case needs on it. */
function update(
  fields: {
    readonly client?: string
    readonly chat?: number
    readonly user?: number
    readonly topicId?: number
    readonly text?: string
  } = {},
): ConversationContext & { readonly text?: string; conversation?: never } {
  return {
    kind: 'message',
    transport: 'test',
    client: { name: fields.client ?? 'bot' },
    log: { debug() {}, info() {}, warn() {}, error() {} } as never,
    raw: {},
    chat: { id: fields.chat ?? 1 },
    sender: { id: fields.user ?? 10 },
    ...(fields.topicId === undefined ? {} : { topicId: fields.topicId }),
    ...(fields.text === undefined ? {} : { text: fields.text }),
  } as never
}

/** Run one update through the middleware, reporting whether it reached the end. */
async function run(
  middleware: (context: never, next: () => Promise<void>) => unknown,
  context: unknown,
): Promise<boolean> {
  let reached = false
  await middleware(context as never, async () => {
    reached = true
  })

  return reached
}

/** The handle the plugin attaches. */
const held = (context: unknown) =>
  (context as { conversation: import('../src/index.js').Conversation }).conversation

describe('which conversation an update belongs to', () => {
  it('names the client first, so two clients never share one', () => {
    const one = conversationKey(update({ client: 'bot', chat: 1, user: 10 }))
    const two = conversationKey(update({ client: 'account', chat: 1, user: 10 }))

    expect(one).not.toBe(two)
    expect(one?.startsWith('bot:')).toBe(true)
  })

  it('separates a person by chat, and a chat by person, under the default', () => {
    const base = conversationKey(update({ chat: 1, user: 10 }))

    expect(conversationKey(update({ chat: 2, user: 10 }))).not.toBe(base)
    expect(conversationKey(update({ chat: 1, user: 11 }))).not.toBe(base)
    expect(conversationKey(update({ chat: 1, user: 10 }))).toBe(base)
  })

  it('follows the scope it is given', () => {
    const a = update({ chat: 1, user: 10 })
    const b = update({ chat: 1, user: 11 })

    // Everybody in the chat shares one conversation.
    expect(conversationKey(a, 'chat')).toBe(conversationKey(b, 'chat'))
    // A person carries theirs between chats.
    expect(conversationKey(a, 'user')).toBe(conversationKey(update({ chat: 2, user: 10 }), 'user'))
    expect(conversationKey(a, 'chat')).not.toBe(conversationKey(a, 'chat+user'))
  })

  it('separates topics only where the scope asked for them', () => {
    const outside = update({ chat: 1, user: 10 })
    const inside = update({ chat: 1, user: 10, topicId: 7 })

    expect(conversationKey(outside, 'chat+user')).toBe(conversationKey(inside, 'chat+user'))
    expect(conversationKey(outside, 'chat+user+topic')).not.toBe(
      conversationKey(inside, 'chat+user+topic'),
    )
  })

  it('has no key for an update with no conversation', () => {
    const inline = { client: { name: 'bot' } }

    expect(conversationKey(inline as never)).toBeUndefined()
    expect(conversationKey({ client: { name: 'bot' }, chat: { id: 1 } } as never)).toBeUndefined()
    // A chat with no sender is a conversation when the scope does not need one.
    expect(conversationKey({ client: { name: 'bot' }, chat: { id: 1 } } as never, 'chat')).toBe(
      'bot:c:1',
    )
    // And an update with no chat is not one under any scope that needs a chat.
    const chatless = { client: { name: 'bot' }, sender: { id: 10 } }
    expect(conversationKey(chatless as never, 'chat')).toBeUndefined()
    expect(conversationKey(chatless as never, 'chat+user')).toBeUndefined()
    expect(conversationKey(chatless as never, 'chat+topic')).toBeUndefined()
    // Only a scope that asks for the person alone can name this one.
    expect(conversationKey(chatless as never, 'user')).toBe('bot:u:10')
  })
})

describe('a conversation over a transport whose ids repeat across sorts of peer', () => {
  /** An MTProto-shaped update: bigint ids, each with the sort of peer it names. */
  const peered = (chat: { kind: string; id: bigint }, sender: { kind: string; id: bigint }) =>
    ({ client: { name: 'me' }, chat, sender }) as never

  it('keeps user 5 and basic group 5 apart, and writes a 64-bit id in full', () => {
    const inPrivate = conversationKey(peered({ kind: 'user', id: 5n }, { kind: 'user', id: 5n }))
    const inGroup = conversationKey(peered({ kind: 'chat', id: 5n }, { kind: 'user', id: 5n }))
    const large = conversationKey(
      peered({ kind: 'channel', id: 9_007_199_254_740_993n }, { kind: 'user', id: 5n }),
    )

    expect(inPrivate).toBe('me:c:user:5:u:user:5')
    expect(inGroup).toBe('me:c:chat:5:u:user:5')
    expect(large).toBe('me:c:channel:9007199254740993:u:user:5')
  })

  it('leaves a key with no sort of peer exactly as it was', () => {
    expect(conversationKey(update({ chat: -100123, user: 10 }))).toBe('bot:c:-100123:u:10')
  })
})

describe('running one conversation at a time', () => {
  it('serialises the same key and lets different ones overlap', async () => {
    const locks = new ConversationLocks()
    const order: string[] = []
    const slow = (name: string) => async () => {
      order.push(`${name}:start`)
      await new Promise((resolve) => setTimeout(resolve, 5))
      order.push(`${name}:end`)
    }

    await Promise.all([
      locks.run('a', slow('a1')),
      locks.run('a', slow('a2')),
      locks.run('b', slow('b1')),
    ])

    // The two for 'a' do not interleave; 'b' is free to.
    expect(order.indexOf('a1:end')).toBeLessThan(order.indexOf('a2:start'))
    expect(order.indexOf('b1:start')).toBeLessThan(order.indexOf('a1:end'))
  })

  it('lets the next update run after one fails, and forgets a drained key', async () => {
    const locks = new ConversationLocks()

    await expect(
      locks.run('a', () => Promise.reject(new Error('this one failed'))),
    ).rejects.toThrow('this one failed')
    expect(await locks.run('a', () => Promise.resolve('fine'))).toBe('fine')
    expect(locks.size).toBe(0)
  })

  it('runs an update queued behind one that fails', async () => {
    // The harder case: the second was already waiting when the first failed,
    // so it cannot be rescued by the queue having been emptied first.
    const locks = new ConversationLocks()
    const ran: string[] = []

    const failing = locks.run('a', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      ran.push('first')
      throw new Error('this one failed')
    })
    const following = locks.run('a', async () => {
      ran.push('second')

      return 'fine'
    })

    await expect(failing).rejects.toThrow('this one failed')
    expect(await following).toBe('fine')
    expect(ran).toEqual(['first', 'second'])
  })
})

describe('scenes', () => {
  /** A two-step form recording what ran. */
  function form(trace: string[]): SceneDefinition<never, { name?: string }> {
    return {
      name: 'signup',
      steps: [
        (context, scene) => {
          if (scene.fresh) {
            trace.push('ask-name')

            return
          }
          scene.state.name = (context as { text?: string }).text ?? ''
          trace.push(`got-name:${scene.state.name}`)
          scene.next()
        },
        (_context, scene) => {
          if (scene.fresh) {
            trace.push('ask-age')

            return
          }
          trace.push(`done:${scene.state.name}`)
          scene.leave()
        },
      ],
      initial: () => ({}),
      onEnter: () => trace.push('enter'),
      onLeave: (_context, scene) => trace.push(`leave:${scene.cancelled}`),
      // Runs before every step, and cancelling here replaces the step body —
      // which is what makes `/cancel` work from anywhere in the form.
      beforeStep: (context, scene) => {
        if ((context as { text?: string }).text === '/cancel') scene.cancel()
      },
    }
  }

  const built = (trace: string[], storage = memory<ScenePosition<{ name?: string }>>()) =>
    createConversation<never, { name?: string }>({
      storage,
      scenes: [form(trace)],
    })

  it('walks a form one step per update, asking before answering', async () => {
    const trace: string[] = []
    const { middleware } = built(trace)

    const first = update({ text: '/start' })
    await run(middleware, first)
    await held(first).enter('signup')

    expect(trace).toEqual(['enter', 'ask-name'])

    await run(middleware, update({ text: 'Ada' }))
    await run(middleware, update({ text: '36' }))

    expect(trace).toEqual([
      'enter',
      'ask-name',
      'got-name:Ada',
      'ask-age',
      'done:Ada',
      'leave:false',
    ])
  })

  it('keeps the ordinary handlers from seeing an update a scene took', async () => {
    const trace: string[] = []
    const { middleware } = built(trace)

    const entering = update({ text: '/start' })
    await run(middleware, entering)
    await held(entering).enter('signup')

    expect(await run(middleware, update({ text: 'Ada' }))).toBe(false)
    // Once the scene has been left, updates reach the handlers again.
    await run(middleware, update({ text: '36' }))
    expect(await run(middleware, update({ text: 'hello' }))).toBe(true)
  })

  it('keeps one person’s place out of another’s, in the same chat', async () => {
    const trace: string[] = []
    const { middleware } = built(trace)

    const ada = update({ user: 10, text: '/start' })
    await run(middleware, ada)
    await held(ada).enter('signup')
    trace.length = 0

    // Somebody else in the same chat is not in the form.
    expect(await run(middleware, update({ user: 11, text: 'hello' }))).toBe(true)
    expect(trace).toEqual([])

    await run(middleware, update({ user: 10, text: 'Ada' }))
    expect(trace).toEqual(['got-name:Ada', 'ask-age'])
  })

  it('does not advance twice when two updates arrive together', async () => {
    const trace: string[] = []
    const { middleware } = built(trace)

    const entering = update({ text: '/start' })
    await run(middleware, entering)
    await held(entering).enter('signup')
    trace.length = 0

    // Both answers arrive at once. Serialisation means the second sees what
    // the first wrote, so the form ends rather than losing a step.
    await Promise.all([
      run(middleware, update({ text: 'Ada' })),
      run(middleware, update({ text: '36' })),
    ])

    expect(trace).toEqual(['got-name:Ada', 'ask-age', 'done:Ada', 'leave:false'])
  })

  it('resumes where it was after a restart, because only the position is kept', async () => {
    const storage = memory<ScenePosition<{ name?: string }>>()
    const before: string[] = []
    const first = built(before, storage)

    const entering = update({ text: '/start' })
    await run(first.middleware, entering)
    await held(entering).enter('signup')
    await run(first.middleware, update({ text: 'Ada' }))

    // A new runtime: new registry, new waiters, nothing in memory but the store.
    const after: string[] = []
    const second = built(after, storage)

    await run(second.middleware, update({ text: '36' }))

    expect(after).toEqual(['done:Ada', 'leave:false'])
  })

  it('tells the exit handler when a step cancelled the form', async () => {
    const trace: string[] = []
    const { middleware } = built(trace)

    const entering = update({ text: '/start' })
    await run(middleware, entering)
    await held(entering).enter('signup')
    trace.length = 0

    // `beforeStep` cancels on /cancel, which is the path a step takes rather
    // than the one an outside caller takes.
    const cancelling = update({ text: 'Ada' })
    await run(middleware, cancelling)
    expect(trace).toEqual(['got-name:Ada', 'ask-age'])

    const { middleware: second } = built(trace)
    const starting = update({ user: 20, text: '/start' })
    await run(second, starting)
    await held(starting).enter('signup')
    trace.length = 0
    await run(second, update({ user: 20, text: '/cancel' }))

    // The step body did not run: `beforeStep` replaced it.
    expect(trace).toEqual(['leave:true'])
  })

  it('tells the exit handler when it was cancelled', async () => {
    const trace: string[] = []
    const { middleware } = built(trace)

    const entering = update({ text: '/start' })
    await run(middleware, entering)
    await held(entering).enter('signup')
    await held(entering).leave({ cancelled: true })

    expect(trace.at(-1)).toBe('leave:true')
    expect(await held(entering).position()).toBeUndefined()
  })

  it('forgets a position without running the exit handler when reset', async () => {
    const trace: string[] = []
    const { middleware } = built(trace)

    const entering = update({ text: '/start' })
    await run(middleware, entering)
    await held(entering).enter('signup')
    trace.length = 0
    await held(entering).reset()

    expect(trace).toEqual([])
    expect(await held(entering).position()).toBeUndefined()
  })

  it('leaves the old scene before entering the new one', async () => {
    const trace: string[] = []
    const { middleware, controls } = built(trace)
    controls.addScene({
      name: 'second',
      steps: [(_c, scene) => trace.push(`second:${scene.fresh}`)],
      onEnter: () => trace.push('second-enter'),
    })

    const entering = update({ text: '/start' })
    await run(middleware, entering)
    await held(entering).enter('signup')
    trace.length = 0

    // Moved while the form is still open: its exit handler runs first, so an
    // exit handler can never run after its successor's entry handler.
    await held(entering).enter('second')

    expect(trace).toEqual(['leave:false', 'second-enter', 'second:true'])
    expect(await held(entering).position()).toMatchObject({ scene: 'second' })
  })

  it('refuses a scene with no steps, a duplicate name and an unknown name', async () => {
    const { controls } = built([])

    expect(() => controls.addScene({ name: 'empty', steps: [] })).toThrow(/no steps/)
    expect(() => controls.addScene({ name: 'signup', steps: [() => {}] })).toThrow(
      /already defined/,
    )

    const entering = update({})
    const { middleware } = built([])
    await run(middleware, entering)
    await expect(held(entering).enter('nowhere')).rejects.toThrow(/no scene named/)
  })

  it('records a failure inside a step without losing the position', async () => {
    const storage = memory<ScenePosition<Record<never, never>>>()
    const { middleware } = createConversation<never, Record<never, never>>({
      storage,
      scenes: [
        {
          name: 'fragile',
          steps: [
            (_c, scene) => {
              if (!scene.fresh) throw new Error('the step failed')
            },
          ],
        },
      ],
    })

    const entering = update({})
    await run(middleware, entering)
    await held(entering).enter('fragile')

    await expect(run(middleware, update({ text: 'x' }))).rejects.toThrow('the step failed')
    // Still in the scene: a failed step is not a reason to lose the form.
    expect(await held(entering).position()).toMatchObject({ scene: 'fragile', step: 0 })
  })
})

describe('what runs around a step', () => {
  const trace: string[] = []
  const built = (definition: Partial<SceneDefinition<never, Record<never, never>>>) => {
    trace.length = 0

    return createConversation<never, Record<never, never>>({
      storage: memory<ScenePosition<Record<never, never>>>(),
      scenes: [
        {
          name: 'around',
          steps: [
            (_c, scene) => {
              trace.push(`step0:${scene.fresh}`)
            },
            () => trace.push('step1'),
          ],
          ...definition,
        } as SceneDefinition<never, Record<never, never>>,
      ],
    })
  }

  it('lets onEnter replace everything after it', async () => {
    const { middleware } = built({
      onEnter: (_c, scene) => {
        trace.push('enter')
        scene.leave()
      },
      beforeStep: () => trace.push('before'),
      onLeave: () => trace.push('leave'),
    })

    const entering = update({})
    await run(middleware, entering)
    await held(entering).enter('around')

    // Navigating in `onEnter` skips `beforeStep` and the step body alike.
    expect(trace).toEqual(['enter', 'leave'])
  })

  it('does not run afterStep when the step navigated', async () => {
    const { middleware } = built({
      steps: [
        (_c, scene) => {
          trace.push('step0')
          scene.next()
        },
        (_c, scene) => {
          if (scene.fresh) trace.push('step1')
        },
      ],
      afterStep: () => trace.push('after'),
    })

    const entering = update({})
    await run(middleware, entering)
    await held(entering).enter('around')

    // `afterStep` is for a step that stayed; one that moved has already said
    // what happens next. So it runs once, for the step that waited, and not
    // for the one that navigated past it.
    expect(trace).toEqual(['step0', 'step1', 'after'])
  })

  it('runs afterStep when the step stayed', async () => {
    const { middleware } = built({ afterStep: () => trace.push('after') })

    const entering = update({})
    await run(middleware, entering)
    await held(entering).enter('around')

    expect(trace).toEqual(['step0:true', 'after'])
  })

  it('leaves the scene when a step moves past the last one', async () => {
    const { middleware } = built({
      steps: [
        (_c, scene) => {
          trace.push('only')
          scene.next()
        },
      ],
      onLeave: (_c, scene) => trace.push(`leave:${scene.cancelled}`),
    })

    const entering = update({})
    await run(middleware, entering)
    await held(entering).enter('around')

    // `next()` on the last step is how a form ends, so it is a leave rather
    // than a failure.
    expect(trace).toEqual(['only', 'leave:false'])
    expect(await held(entering).position()).toBeUndefined()
  })
})

describe('waiting for an answer', () => {
  const plain = () =>
    createConversation<never, Record<never, never>>({
      storage: memory<ScenePosition<Record<never, never>>>(),
    })

  it('resolves on the next matching update in the same conversation', async () => {
    const { middleware } = plain()
    const opening = update({ text: 'ask' })
    await run(middleware, opening)

    const answer = held(opening).wait<string>({
      match: (context) => typeof (context as { text?: string }).text === 'string',
      transform: (context) => (context as unknown as { text: string }).text,
    })

    expect(await run(middleware, update({ text: 'Ada' }))).toBe(false)
    expect(await answer).toBe('Ada')
  })

  it('ignores an update from somebody else, which still reaches the handlers', async () => {
    const { middleware } = plain()
    const opening = update({ user: 10, text: 'ask' })
    await run(middleware, opening)

    const answer = held(opening).wait<string>({
      match: () => true,
      transform: (context) => (context as unknown as { text: string }).text,
    })

    // Another person in the same chat: not this conversation.
    expect(await run(middleware, update({ user: 11, text: 'not mine' }))).toBe(true)
    await run(middleware, update({ user: 10, text: 'mine' }))
    expect(await answer).toBe('mine')
  })

  it('lets an update it does not want through, unless it is exclusive', async () => {
    const { middleware } = plain()
    const opening = update({ text: 'ask' })
    await run(middleware, opening)

    const wanted = held(opening).wait({ match: (c) => hears((c as { text?: string }).text, 'yes') })
    expect(await run(middleware, update({ text: 'no' }))).toBe(true)
    await run(middleware, update({ text: 'yes' }))
    await wanted

    const exclusive = held(opening).wait({
      match: (c) => hears((c as { text?: string }).text, 'yes'),
      exclusive: true,
    })
    expect(await run(middleware, update({ text: 'no' }))).toBe(false)
    held(opening).cancelWait()
    await expect(exclusive).rejects.toThrow(WaitCancelledError)
  })

  it('can let a matching update reach the handlers as well', async () => {
    const { middleware } = plain()
    const opening = update({ text: 'ask' })
    await run(middleware, opening)

    const answer = held(opening).wait({ match: () => true, consume: false })

    expect(await run(middleware, update({ text: 'Ada' }))).toBe(true)
    await answer
  })

  it('keeps waiting when the answer is rejected, and says why', async () => {
    const { middleware } = plain()
    const opening = update({ text: 'ask' })
    await run(middleware, opening)

    const complaints: (string | undefined)[] = []
    const answer = held(opening).wait<string>({
      match: () => true,
      transform: (context) => (context as unknown as { text: string }).text,
      validate: (value) => /^\d+$/.test(value) || 'that is not a number',
      onInvalid: (reason) => complaints.push(reason),
    })

    await run(middleware, update({ text: 'not a number' }))
    expect(complaints).toEqual(['that is not a number'])
    await run(middleware, update({ text: '36' }))

    expect(await answer).toBe('36')
  })

  it('gives up after its timeout, raising or answering nothing as asked', async () => {
    const timers: (() => void)[] = []
    const schedule = (run_: () => void) => {
      timers.push(run_)

      return () => {}
    }
    const { middleware } = createConversation<never, Record<never, never>>({
      storage: memory<ScenePosition<Record<never, never>>>(),
      schedule,
    })

    const opening = update({})
    await run(middleware, opening)

    const raising = held(opening).wait({ match: () => false, timeout: 1_000 })
    timers.pop()?.()
    await expect(raising).rejects.toThrow(WaitTimeoutError)

    const quiet = held(opening).wait({ match: () => false, timeout: 1_000, nullOnTimeout: true })
    timers.pop()?.()
    expect(await quiet).toBeUndefined()
  })

  it('stops when the caller gives up', async () => {
    const { middleware } = plain()
    const opening = update({})
    await run(middleware, opening)

    const giveUp = new AbortController()
    const waiting = held(opening).wait({ match: () => true, signal: giveUp.signal })
    giveUp.abort()

    await expect(waiting).rejects.toThrow(WaitCancelledError)
    expect(held(opening).waiting).toBe(false)
  })

  it('tells the first waiter when a second replaces it', async () => {
    const { middleware } = plain()
    const opening = update({})
    await run(middleware, opening)

    const first = held(opening).wait({ match: () => true })
    const second = held(opening).wait({ match: () => true })

    await expect(first).rejects.toThrow(/replaced/)
    await run(middleware, update({ text: 'x' }))
    await second
  })

  it('cancels an open wait when the conversation enters or leaves a scene', async () => {
    const { middleware, controls } = plain()
    controls.addScene({ name: 'somewhere', steps: [() => {}] })

    const opening = update({})
    await run(middleware, opening)
    const waiting = held(opening).wait({ match: () => true })
    await held(opening).enter('somewhere')

    await expect(waiting).rejects.toThrow(WaitCancelledError)
  })

  it('cancels every open wait when the client stops', async () => {
    const { middleware, controls } = plain()
    const a = update({ user: 10 })
    const b = update({ user: 11 })
    await run(middleware, a)
    await run(middleware, b)

    const waits = [held(a).wait({ match: () => true }), held(b).wait({ match: () => true })]
    expect(controls.waiting).toBe(2)
    controls.cancelAll('the client stopped')

    await expect(Promise.all(waits)).rejects.toThrow(/client stopped/)
    expect(controls.waiting).toBe(0)
  })

  it('offers an update to the waiter before the scene', async () => {
    const trace: string[] = []
    const { middleware, controls } = plain()
    controls.addScene({
      name: 'waiting-scene',
      steps: [
        async (context, scene) => {
          if (!scene.fresh) {
            trace.push('step-ran')

            return
          }
          const held_ = (
            context as unknown as { conversation: { wait: (s: unknown) => Promise<unknown> } }
          ).conversation
          void held_.wait({ match: () => true }).then((value) => {
            trace.push(`wait-got:${(value as { text?: string }).text}`)
          })
        },
      ],
    })

    const entering = update({})
    await run(middleware, entering)
    await held(entering).enter('waiting-scene')
    await run(middleware, update({ text: 'answer' }))
    await new Promise((resolve) => setTimeout(resolve, 0))

    // The waiter took it; the step did not run again.
    expect(trace).toEqual(['wait-got:answer'])
  })
})

describe('an update with no conversation', () => {
  it('passes straight through', async () => {
    const { middleware } = createConversation<never, Record<never, never>>({
      storage: memory<ScenePosition<Record<never, never>>>(),
    })
    const inline = { kind: 'inline_query', transport: 'test', client: { name: 'bot' }, raw: {} }

    expect(await run(middleware, inline)).toBe(true)
    expect((inline as { conversation?: unknown }).conversation).toBeUndefined()
  })
})

describe('matching what somebody said', () => {
  it('matches a string exactly, a pattern loosely, and a predicate however it likes', () => {
    expect(hears('/start', '/start')).toBe(true)
    expect(hears('/start now', '/start')).toBe(false)
    expect(hears('/start now', /^\/start/)).toBe(true)
    expect(hears('anything', (text) => text.length > 3)).toBe(true)
    expect(hears(undefined, /x/)).toBe(false)
  })

  it('matches the same global pattern every time, not every other time', () => {
    // A global regular expression keeps its place between calls.
    const global = /a/g

    expect(hears('a', global)).toBe(true)
    expect(hears('a', global)).toBe(true)
  })
})

describe('the plugin', () => {
  it('installs its middleware on anything that takes some', async () => {
    const installed: unknown[] = []
    const host = {
      use(middleware: unknown) {
        installed.push(middleware)

        return host
      },
    }

    const plugin = conversation<never, Record<never, never>>({
      storage: memory<ScenePosition<Record<never, never>>>(),
    })
    const controls = await plugin.install(host as never)

    expect(installed).toHaveLength(1)
    expect(plugin.name).toBe('conversation')
    expect(controls.waiting).toBe(0)
  })

  it('lets go of open waits when its host begins to stop, and takes new ones after a start', async () => {
    let observer: import('../src/index.js').HostObserver | undefined
    let installed: ((context: never, next: () => Promise<void>) => unknown) | undefined
    const host = {
      use(middleware: (context: never, next: () => Promise<void>) => unknown) {
        installed = middleware
      },
      observe(given: import('../src/index.js').HostObserver) {
        observer = given
      },
    }
    const plugin = conversation<ConversationContext>({ storage: memory() })
    const controls = await plugin.install(host as never)
    const middleware = installed as NonNullable<typeof installed>

    const asking = update({ user: 10 })
    await run(middleware, asking)
    const waiting = held(asking).wait({ match: () => true })
    expect(controls.waiting).toBe(1)

    await observer?.stopping?.()
    await expect(waiting).rejects.toThrow(WaitCancelledError)
    expect(controls.waiting).toBe(0)

    // An update still being handled while the host drains cannot open a wait
    // nothing will answer.
    const late = update({ user: 11 })
    await run(middleware, late)
    await expect(held(late).wait({ match: () => true })).rejects.toThrow(/client is stopping/)

    observer?.started?.()
    const again = update({ user: 12 })
    await run(middleware, again)
    const answered = held(again).wait({ match: () => true })
    await run(middleware, update({ user: 12, text: 'hello' }))
    await expect(answered).resolves.toBeDefined()
  })

  it('names itself by its property, so two are not a conflict', () => {
    const other = conversation<never, Record<never, never>>({
      storage: memory<ScenePosition<Record<never, never>>>(),
      property: 'support',
    })

    expect(other.name).toBe('conversation:support')
  })

  it('refuses a scope that is not one', () => {
    expect(() =>
      createConversation<never, Record<never, never>>({
        storage: memory<ScenePosition<Record<never, never>>>(),
        scope: 'chat+nonsense' as never,
      }),
    ).toThrow(/not a conversation scope/)
  })
})
