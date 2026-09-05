/**
 * The MTProto API surface.
 *
 * Two forms over one path: 757 generated signatures, and `call` for everything
 * a build has never heard of. What matters here is that they really are one
 * path — a typed call that reached the network by some other route would be a
 * second transport nobody maintains — and that the proxy spelling a method name
 * cannot be talked into spelling a different one.
 *
 * The cases run against an injected `invoke`, so what a method turns into is
 * observable exactly as the session layer would receive it.
 */

import { describe, expect, it } from 'vitest'
import { rawApi } from '../src/api.js'
import type { TlValue } from '../src/tl/index.js'

/** An API whose calls are recorded rather than sent. */
function recorded(answer: TlValue = { _: 'boolTrue' }) {
  const sent: TlValue[] = []
  const api = rawApi(async (query) => {
    sent.push(query)

    return answer
  })

  return { api, sent }
}

describe('a method the schema carries', () => {
  it('is reached by the name TL gives it', async () => {
    const { api, sent } = recorded()

    await api.messages.sendMessage({ peer: { _: 'inputPeerSelf' }, message: 'hi', random_id: 1n })

    expect(sent).toHaveLength(1)
    expect(sent[0]?._).toBe('messages.sendMessage')
  })

  it('sends the parameters it was given, and nothing else', async () => {
    const { api, sent } = recorded()

    await api.contacts.resolveUsername({ username: 'telegram' })

    expect(sent[0]).toEqual({ _: 'contacts.resolveUsername', username: 'telegram' })
  })

  it('gives back what answered it', async () => {
    const { api } = recorded({ _: 'boolFalse' })

    expect(await api.account.checkUsername({ username: 'taken' })).toEqual({ _: 'boolFalse' })
  })

  it('takes no argument when the method takes no parameters', async () => {
    const { api, sent } = recorded()

    await api.help.getConfig()

    expect(sent[0]).toEqual({ _: 'help.getConfig' })
  })

  it('reaches a method in the root namespace', async () => {
    // TL puts a handful of wrappers outside every namespace. They are spelled
    // without a dot, which is what the surface has to produce for them.
    const { api, sent } = recorded()

    await api.invokeWithoutUpdates({ query: { _: 'help.getConfig' } })

    expect(sent[0]?._).toBe('invokeWithoutUpdates')
  })

  it('cannot be talked into naming a different method', async () => {
    // The types forbid `_` in the parameters; at run time it is overwritten
    // rather than honoured, so a value that reached a caller from somewhere
    // else cannot redirect a typed call to another method.
    const { api, sent } = recorded()

    await api.contacts.resolveUsername({
      username: 'telegram',
      _: 'auth.logOut',
    } as unknown as { username: string })

    expect(sent[0]?._).toBe('contacts.resolveUsername')
  })

  it('fails the way every other call fails', async () => {
    // The surface adds no error handling of its own: whatever the session layer
    // rejects with is what a caller sees.
    const failure = new Error('FLOOD_WAIT_30')
    const api = rawApi(async () => {
      throw failure
    })

    await expect(api.messages.getDialogs({ limit: 1 } as never)).rejects.toBe(failure)
  })
})

describe('a method the schema does not carry', () => {
  it('is still reachable by naming it', async () => {
    // The escape hatch is not deprecated by the typed surface. A method newer
    // than this build has no signature and must still be callable.
    const { api, sent } = recorded()

    await api.call({ _: 'messages.brandNewMethod', whatever: 1 })

    expect(sent[0]).toEqual({ _: 'messages.brandNewMethod', whatever: 1 })
  })

  it('does not shadow the escape hatch with a method of that name', async () => {
    // `call` is a property of the surface rather than a path through it. A
    // proxy that treated it as one would spell `call` as a TL name and lose the
    // only route to an unmodelled method.
    const { api, sent } = recorded()

    await api.call({ _: 'help.getConfig' })

    expect(sent[0]?._).toBe('help.getConfig')
  })

  it('travels the same path a typed call does', async () => {
    // One invoke receives both forms. If the typed surface had a route of its
    // own, only one of these would arrive here.
    const { api, sent } = recorded()

    await api.help.getConfig()
    await api.call({ _: 'help.getNearestDc' })

    expect(sent.map((query) => query._)).toEqual(['help.getConfig', 'help.getNearestDc'])
  })
})

describe('what the surface does when something inspects it', () => {
  it('is not a thenable', async () => {
    // A proxy answering every property with a callable makes itself look like a
    // promise, and awaiting one anywhere would turn into an API call.
    const { api, sent } = recorded()

    expect(await Promise.resolve(api)).toBe(api)
    expect(sent).toEqual([])
  })

  it('survives being serialized', () => {
    const { api, sent } = recorded()

    expect(JSON.stringify(api)).toBe('{}')
    expect(String(api.messages)).toContain('function')
    expect(sent).toEqual([])
  })

  it('answers a symbol from the object rather than as a method', () => {
    const { api } = recorded()

    expect((api as unknown as Record<symbol, unknown>)[Symbol.toStringTag]).toBeUndefined()
  })
})
