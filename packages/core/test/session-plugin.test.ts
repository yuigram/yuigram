/**
 * The session plugin form.
 *
 * `createSession` needs the context type and the value type; naming the value
 * twice is the sort of repetition that produces a mismatch to debug rather than
 * a mistake to catch. The plugin form names it once, and must behave exactly
 * like the middleware it wraps.
 */

import { describe, expect, it } from 'vitest'
import { Dispatcher } from '../src/dispatch/dispatcher.js'
import { createLogger, silentSink } from '../src/log/logger.js'
import { session, userChatKey } from '../src/session/session.js'
import { memory } from '../src/storage/memory.js'

interface Cart {
  count: number
}

/** A dispatcher standing in for a client, with the plugin installed. */
function host() {
  const dispatcher = new Dispatcher<never>()
  const storage = memory<Cart>()

  const plugin = session<Cart>({
    storage,
    key: (context) => (context as { chat?: { id: number } }).chat?.id,
    initial: () => ({ count: 0 }),
  })

  plugin.install(dispatcher as never)

  return { dispatcher, storage }
}

/** A context, near enough for the middleware. */
function context(chatId = 1): never {
  return {
    kind: 'message',
    transport: 'test',
    raw: {},
    log: createLogger({ sink: silentSink() }),
    chat: { id: chatId },
  } as never
}

describe('installing', () => {
  it('names itself so two of them cannot collide silently', () => {
    expect(
      session<Cart>({ storage: memory(), key: userChatKey, initial: () => ({ count: 0 }) }).name,
    ).toBe('session')

    expect(
      session<Cart>({
        storage: memory(),
        key: userChatKey,
        initial: () => ({ count: 0 }),
        property: 'cart',
      }).name,
    ).toBe('session:cart')
  })

  it('loads, exposes and persists like the middleware it wraps', async () => {
    const { dispatcher, storage } = host()

    dispatcher.on('message', (ctx) => {
      const carrier = ctx as unknown as { session: Cart }
      carrier.session.count += 1
    })

    await dispatcher.dispatch(context())
    await dispatcher.dispatch(context())

    expect(await storage.get('1')).toEqual({ count: 2 })
  })

  it('keeps one chat session out of another', async () => {
    const { dispatcher, storage } = host()

    dispatcher.on('message', (ctx) => {
      const carrier = ctx as unknown as { session: Cart }
      carrier.session.count += 1
    })

    await dispatcher.dispatch(context(1))
    await dispatcher.dispatch(context(2))

    expect(await storage.get('1')).toEqual({ count: 1 })
    expect(await storage.get('2')).toEqual({ count: 1 })
  })
})
