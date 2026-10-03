/**
 * A connection that survives the channels it is made of.
 *
 * The cases here are about lifetime rather than protocol: which channel is
 * current, what happens to the one it replaced, and what a caller sees while
 * there is none. The dangerous failures are the quiet ones — a dead channel
 * that still arranges a reconnection, a timer that fires after a shutdown, a
 * call that was written once and goes out twice — so most of what follows
 * drives a channel to its end and then checks what the connection did about it.
 *
 * Channels and datacenters are stubbed, and the clock, the randomness and the
 * timer are supplied, so every wait below is a fact rather than a delay.
 */

import {
  CancelledError,
  ConfigError,
  NetworkError,
  TelegramError,
  ValidationError,
} from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { AuthKey } from '../src/message/auth-key.js'
import { AUTH_KEY_NOT_FOUND, type Channel, TransportError } from '../src/network/channel.js'
import {
  type ConnectionDiagnostic,
  type Connections,
  openConnections,
} from '../src/network/connections.js'
import type { ConnectOptions, Datacenters } from '../src/network/datacenters.js'
import type { DcDirectory } from '../src/network/dc.js'
import { isUpdateSource } from '../src/normalize/events.js'
import type { SessionEvent } from '../src/session/dispatcher.js'
import type { TlValue } from '../src/tl/index.js'

/** Key material a case can recognise. */
function material(seed: number): Uint8Array {
  return Uint8Array.from({ length: 256 }, (_, index) => (seed * 101 + index * 7 + 3) & 0xff)
}

/** A channel that answers nothing until a case decides what happened to it. */
interface Fake extends Channel {
  /** Everything that was called on it. */
  readonly calls: TlValue[]
  readonly closed: boolean
  /** What the channel was opened for, so a case can tell two of them apart. */
  readonly purpose: string
  /** The channel ends on its own, the way a socket that dropped ends one. */
  die(error?: Error): void
  /** Something the connection did not answer itself. */
  emit(event: SessionEvent): void
  /** The datacenter refuses the calls in flight without ending the channel. */
  refuse(error: Error): void
  /**
   * The channel reports an ending it has already reported.
   *
   * A real one will not do this on its own, which is exactly why the connection
   * cannot rely on that: a report arriving after the channel has been replaced
   * must be recognised as one, not acted on.
   */
  reportLate(error?: Error): void
}

function fakeChannel(query: ConnectOptions, key: AuthKey, expiresAt?: number): Fake {
  const calls: TlValue[] = []
  const pending: Array<(error: Error) => void> = []
  let closed = false

  const fail = (error: Error): void => {
    for (const reject of pending.splice(0)) reject(error)
  }

  return {
    dcId: query.id ?? 2,
    purpose: query.purpose ?? 'main',
    authorization: { key, salt: 0x5a17n, ...(expiresAt === undefined ? {} : { expiresAt }) },
    calls,
    get closed() {
      return closed
    },
    get state() {
      return closed ? ('closed' as const) : ('ready' as const)
    },
    invoke(request) {
      if (closed) return Promise.reject(new NetworkError('the channel is closed'))
      calls.push(request)

      // Nothing answers on its own: a case decides whether the call is still in
      // flight when the channel ends.
      return new Promise<TlValue>((_resolve, reject) => pending.push(reject))
    },
    async bind() {},
    close() {
      if (closed) return
      closed = true
      // A channel closed on purpose reports nothing: the caller already knows.
      fail(new CancelledError('the channel was closed'))
    },
    die(error) {
      if (closed) return
      closed = true
      fail(new NetworkError('the connection ended', error === undefined ? {} : { cause: error }))
      query.onClosed?.(error)
    },
    emit(event) {
      query.onEvent?.(event)
    },
    reportLate(error) {
      query.onClosed?.(error)
    },
    refuse(error) {
      fail(error)
    },
  }
}

/** What one attempt should do. */
interface Step {
  /** Reject with this instead of opening anything. */
  readonly fail?: Error
  /** Do not finish until this settles. */
  readonly hold?: Promise<void>
  /** Open a channel even though the attempt was told to stop. */
  readonly ignore?: true
  /** End the channel before it has been handed over. */
  readonly dieOnOpen?: Error
}

/**
 * The layer, with datacenters stubbed.
 *
 * The stub keeps one key per datacenter and hands the same one to every channel
 * opened against it, which is what the real layer does — so a case can tell a
 * reconnection that reused a key from one that obtained another.
 */
function harness(options: Record<string, unknown> = {}) {
  const opened: ConnectOptions[] = []
  const channels: Fake[] = []
  const forgotten: Array<{ id: number; keyId: Uint8Array }> = []
  const failures: Error[] = []
  const events: SessionEvent[] = []
  const timers: Array<{ run: () => void; delay: number; cancelled: boolean }> = []
  const script: Step[] = []
  const keys = new Map<number, AuthKey>()

  let clock = 0
  let exchanges = 0
  let holdForget: Promise<void> | undefined
  let lifetimes = false

  const datacenters = {
    directory: { thisDc: 2 } as unknown as DcDirectory,

    async connect(query: ConnectOptions): Promise<Channel> {
      opened.push(query)

      const step = script.shift() ?? {}
      if (step.hold !== undefined) await step.hold
      if (step.fail !== undefined) throw step.fail
      if (query.signal?.aborted === true && step.ignore !== true) {
        throw new CancelledError('the connection was abandoned')
      }

      const id = query.id ?? 2
      let key = keys.get(id)
      if (key === undefined) {
        exchanges += 1
        key = AuthKey.from(material(exchanges))
        keys.set(id, key)
      }

      const channel = fakeChannel(query, key, lifetimes ? 4_000_000_000 : undefined)
      channels.push(channel)

      // The ending arrives while the channel is still on its way to whoever
      // asked for it — the one window in which there is nothing yet to act on.
      if (step.dieOnOpen !== undefined) channel.die(step.dieOnOpen)

      return channel
    },

    async forget(id: number, keyId: Uint8Array): Promise<'temporary' | 'permanent' | 'none'> {
      forgotten.push({ id, keyId })
      await holdForget

      // The same comparison the real layer makes: a refusal naming a key that
      // has already been replaced removes nothing.
      const held = keys.get(id)
      if (held === undefined || !equal(held.id, keyId)) return 'none'

      keys.delete(id)
      return lifetimes ? 'temporary' : 'permanent'
    },

    refresh: async () => {
      throw new Error('not used here')
    },
    adopt: async () => {},
  } as unknown as Datacenters

  const layer = openConnections({
    datacenters,
    backoff: { base: 1000, cap: 32_000 },
    now: () => clock,
    // The top of the jitter, so a delay reads as the interval it belongs to.
    random: () => Uint8Array.from([0xff, 0xff, 0xff, 0xff]),
    schedule: (run, delay) => {
      const entry = { run, delay, cancelled: false }
      timers.push(entry)

      return () => {
        entry.cancelled = true
      }
    },
    onFailure: (_origin, error) => failures.push(error),
    onEvent: (_origin, event) => events.push(event),
    ...options,
  })

  return {
    layer,
    opened,
    channels,
    forgotten,
    failures,
    events,
    timers,
    script,
    keys,
    exchanges: () => exchanges,
    advance: (ms: number) => {
      clock += ms
    },
    /**
     * Whether the channels opened from now on carry a key with a lifetime.
     *
     * Which of a datacenter's two keys a connection is using is what tells one
     * refusal from another, and it is read off the authorization the channel
     * holds.
     */
    withLifetimes: (on = true) => {
      lifetimes = on
    },
    /** Hold the discarding of a key open, to see what runs while it is. */
    holdForgetting: (held: Promise<void>) => {
      holdForget = held
    },
    /** Fire the timer that is currently armed. */
    fire() {
      const armed = timers.filter((timer) => !timer.cancelled).at(-1)
      if (armed === undefined) throw new Error('no timer is armed')
      armed.run()
    },
  }
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index])
}

/** Let everything already queued run. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('which connection a caller gets', () => {
  it('is built without waiting', () => {
    const { layer } = harness()

    // Two callers arriving in one turn must not be able to end up with two
    // connections to one endpoint, which is what building it synchronously
    // guarantees without any coordination.
    expect(layer.get().state).toBe('idle')
  })

  it('is the same one for the same datacenter and purpose', () => {
    const { layer } = harness()

    expect(layer.get({ id: 2, purpose: 'main' })).toBe(layer.get({ id: 2, purpose: 'main' }))
  })

  it('defaults to the datacenter this client belongs to', () => {
    const { layer } = harness()

    expect(layer.get()).toBe(layer.get({ id: 2 }))
    expect(layer.get().dcId).toBe(2)
    expect(layer.get().purpose).toBe('main')
  })

  it('is a different one for a different purpose', () => {
    const { layer } = harness()

    // Media is a different endpoint with its own session. Sharing a connection
    // between them would assume a session that was never established there.
    expect(layer.get({ purpose: 'media' })).not.toBe(layer.get({ purpose: 'main' }))
  })

  it('is a different one for a different slot', () => {
    // A datacenter will hold more than one connection from a client. Asking for
    // another slot asks for another connection, not another handle on this one.
    const { layer } = harness()

    expect(layer.get({ slot: 1 })).not.toBe(layer.get())
    expect(layer.get({ slot: 1 })).toBe(layer.get({ slot: 1 }))
  })

  it('treats no slot as the first one', () => {
    const { layer } = harness()

    expect(layer.get()).toBe(layer.get({ slot: 0 }))
  })

  it('is a different one for a different datacenter', () => {
    const { layer } = harness()

    expect(layer.get({ id: 4 })).not.toBe(layer.get({ id: 2 }))
  })

  it('is a new one once the old one has been closed', () => {
    const { layer } = harness()
    const first = layer.get()
    first.close()

    const second = layer.get()

    expect(second).not.toBe(first)
    expect(second.state).toBe('idle')
  })

  it('cannot be asked for once the layer is closed', () => {
    const { layer } = harness()
    layer.close()

    expect(() => layer.get()).toThrow(CancelledError)
  })

  it('is closed along with every other when the layer closes', async () => {
    const { layer, channels } = harness()
    const main = layer.get()
    const media = layer.get({ purpose: 'media' })
    await Promise.all([main.ready(), media.ready()])

    layer.close()

    expect(main.state).toBe('closed')
    expect(media.state).toBe('closed')
    expect(channels.every((channel) => channel.closed)).toBe(true)
  })
})

describe('how much a connection has waiting on it', () => {
  it('is nothing before anything is asked of it', () => {
    const { layer } = harness()

    expect(layer.get().inFlight).toBe(0)
  })

  it('counts a call from the moment it is made, not from the write', async () => {
    // A call waiting for a channel to exist is work this connection has taken
    // on. A layer choosing between connections that counted only written calls
    // would send every one of them to the connection that has not opened yet.
    const { layer } = harness()
    const connection = layer.get()

    const call = connection.invoke({ _: 'ping', ping_id: 1n })
    expect(connection.inFlight).toBe(1)

    await connection.ready()
    void call.catch(() => undefined)
    connection.close()
    await call.catch(() => undefined)
  })

  it('stops counting a call once it has failed', async () => {
    const { layer } = harness()
    const connection = layer.get()

    const call = connection.invoke({ _: 'ping', ping_id: 1n })
    await connection.ready()
    connection.close()
    await call.catch(() => undefined)

    expect(connection.inFlight).toBe(0)
  })
})

describe('opening the first channel', () => {
  it('happens the first time something wants one', async () => {
    const { layer, opened } = harness()
    const connection = layer.get()

    expect(opened).toHaveLength(0)
    await connection.ready()

    expect(opened).toHaveLength(1)
    expect(connection.state).toBe('ready')
  })

  it('is one attempt however many callers ask at once', async () => {
    const { layer, opened, channels } = harness()
    const connection = layer.get()

    // The call never answers on its own, so it is started rather than awaited:
    // what is being checked is how many attempts three callers produce.
    void connection.invoke({ _: 'ping', ping_id: 1n }).catch(() => undefined)
    await Promise.all([connection.ready(), connection.ready()])

    expect(opened).toHaveLength(1)
    expect(channels).toHaveLength(1)
    connection.close()
  })

  it('asks for the datacenter and purpose it is for', async () => {
    const { layer, opened } = harness()
    await layer.get({ id: 4, purpose: 'media' }).ready()

    expect(opened[0]).toMatchObject({ id: 4, purpose: 'media' })
  })

  it('leaves obtaining a key where it already happens', async () => {
    const { layer, channels, exchanges } = harness()

    // Main and media are one datacenter and one authorization. Nothing here
    // asks for a key: the layer below shares one acquisition between everything
    // that asks, and a second way to ask would defeat that.
    await Promise.all([layer.get().ready(), layer.get({ purpose: 'media' }).ready()])

    expect(exchanges()).toBe(1)
    expect(channels[0]?.authorization.key.id).toEqual(channels[1]?.authorization.key.id)
  })
})

describe('a channel that ended', () => {
  it('is replaced on the next attempt', async () => {
    const { layer, channels, timers, fire } = harness()
    const connection = layer.get()
    await connection.ready()

    channels[0]?.die(new NetworkError('the socket dropped'))
    expect(connection.state).toBe('waiting')
    expect(timers).toHaveLength(1)

    fire()
    await settle()

    expect(connection.state).toBe('ready')
    expect(channels).toHaveLength(2)
  })

  it('is not revived', async () => {
    const { layer, channels, fire } = harness()
    const connection = layer.get()
    await connection.ready()

    const first = channels[0]
    first?.die()
    fire()
    await settle()

    // The channel that died stays dead: what replaced it is a different one.
    expect(channels[1]).not.toBe(first)
    expect(first?.closed).toBe(true)
  })

  it('keeps the authorization it was using', async () => {
    const { layer, channels, forgotten, fire } = harness()
    const connection = layer.get()
    await connection.ready()

    channels[0]?.die(new NetworkError('the socket dropped'))
    fire()
    await settle()

    // A key outlives every socket it is used over. Losing one would mean
    // authorizing again, which is what a datacenter sees as a new client.
    expect(forgotten).toEqual([])
    expect(channels[1]?.authorization.key.id).toEqual(channels[0]?.authorization.key.id)
  })

  it('is reported once, however many times it says so', async () => {
    const { layer, channels, failures, timers } = harness()
    const connection = layer.get()
    await connection.ready()

    channels[0]?.die(new NetworkError('the socket dropped'))
    channels[0]?.die(new NetworkError('and again'))

    expect(failures).toHaveLength(1)
    expect(timers).toHaveLength(1)
  })

  it('arranges nothing when it reports an ending it has already reported', async () => {
    const { layer, channels, timers, failures, fire } = harness()
    const connection = layer.get()
    await connection.ready()

    channels[0]?.die()
    fire()
    await settle()

    // The channel that was replaced reports again, late. Acting on it would
    // arrange a reconnection for a connection that already has one.
    channels[0]?.reportLate(new NetworkError('long after the fact'))

    expect(connection.state).toBe('ready')
    expect(timers).toHaveLength(1)
    expect(failures).toHaveLength(1)
  })

  it('arranges nothing once it has been replaced', async () => {
    const { layer, channels, timers, failures, fire } = harness()
    const connection = layer.get()
    await connection.ready()

    channels[0]?.die()
    fire()
    await settle()

    // The channel that was replaced reports its ending late. Acting on it would
    // arrange a reconnection for a connection that already has one.
    channels[0]?.die(new NetworkError('long after the fact'))

    expect(connection.state).toBe('ready')
    expect(timers).toHaveLength(1)
    expect(failures).toHaveLength(1)
  })

  it('forwards nothing once it has been replaced', async () => {
    const { layer, channels, events, fire } = harness()
    const connection = layer.get()
    await connection.ready()

    const stale = channels[0]
    stale?.die()
    fire()
    await settle()

    stale?.emit({ kind: 'reset', reason: 'from a channel that is gone' })
    channels[1]?.emit({ kind: 'reset', reason: 'from the one in use' })

    expect(events).toEqual([{ kind: 'reset', reason: 'from the one in use' }])
  })
})

describe('a failure no retry can mend', () => {
  it('refuses everyone waiting at once, arms no retry, and tries once more for the next call', async () => {
    const { layer, script, timers, opened, failures } = harness()
    const wrong = new ConfigError('this account holds no server keys')
    script.push({ fail: wrong }, { fail: wrong })

    const connection = layer.get()
    const first = connection.ready().catch((error: unknown) => error)
    const second = connection.ready().catch((error: unknown) => error)

    expect(await first).toBe(wrong)
    expect(await second).toBe(wrong)
    expect(timers).toEqual([])
    expect(failures).toEqual([wrong])
    expect(connection.state).toBe('idle')

    // The account is still built wrong, so the next call is told the same, from
    // one fresh attempt rather than from a retry loop it was never told about.
    expect(await connection.ready().catch((error: unknown) => error)).toBe(wrong)
    expect(opened).toHaveLength(2)
    expect(timers).toEqual([])
  })
})

describe('waiting between attempts', () => {
  it('lengthens while the failures continue', async () => {
    const { layer, script, timers, fire } = harness()
    for (let attempt = 0; attempt < 4; attempt += 1) {
      script.push({ fail: new NetworkError('refused') })
    }

    const connection = layer.get()
    void connection.ready().catch(() => undefined)
    await settle()

    for (let attempt = 0; attempt < 3; attempt += 1) {
      fire()
      await settle()
    }

    expect(timers.map((timer) => timer.delay)).toEqual([1000, 2000, 4000, 8000])
  })

  it('stops lengthening at the ceiling', async () => {
    const { layer, script, timers, fire } = harness({ backoff: { base: 1000, cap: 4000 } })
    for (let attempt = 0; attempt < 5; attempt += 1) {
      script.push({ fail: new NetworkError('refused') })
    }

    void layer
      .get()
      .ready()
      .catch(() => undefined)
    await settle()
    for (let attempt = 0; attempt < 4; attempt += 1) {
      fire()
      await settle()
    }

    expect(timers.map((timer) => timer.delay)).toEqual([1000, 2000, 4000, 4000, 4000])
  })

  it('is spread out, so connections that failed together do not return together', async () => {
    const { layer, script, timers } = harness({
      random: () => Uint8Array.from([0, 0, 0, 0]),
    })
    script.push({ fail: new NetworkError('refused') })

    void layer
      .get()
      .ready()
      .catch(() => undefined)
    await settle()

    // Half of every interval is fixed and half is drawn, so the shortest a
    // caller can wait is half the interval rather than none of it.
    expect(timers[0]?.delay).toBe(500)
  })

  it('is not cut short by a caller that turns up during it', async () => {
    const { layer, script, opened, timers } = harness()
    script.push({ fail: new NetworkError('refused') })

    const connection = layer.get()
    void connection.ready().catch(() => undefined)
    await settle()

    // Asking again is not a reason to try again. A wait that any caller could
    // shorten is not a wait.
    void connection.ready().catch(() => undefined)
    await settle()

    expect(opened).toHaveLength(1)
    expect(timers).toHaveLength(1)
    expect(connection.state).toBe('waiting')
  })

  it('is the ordinary interval after a key was refused', async () => {
    const { layer, channels, timers } = harness()
    await layer.get().ready()

    // The key is discarded and the next attempt obtains another, which is the
    // one refusal where trying again promptly is the right thing to do.
    channels[0]?.die(new TransportError(AUTH_KEY_NOT_FOUND))

    expect(timers[0]?.delay).toBe(1000)
  })

  it('starts at the ceiling when the answer was not the protocol', async () => {
    const { layer, script, timers } = harness()
    script.push({ fail: new ValidationError('that was not a key exchange') })

    void layer
      .get()
      .ready()
      .catch(() => undefined)
    await settle()

    // A middlebox or a wrong port is not something another attempt a second
    // later will fix.
    expect(timers[0]?.delay).toBe(32_000)
  })

  it('starts at the ceiling when the datacenter refused for its own reasons', async () => {
    const { layer, channels, timers } = harness()
    await layer.get().ready()

    channels[0]?.die(new TransportError(429))

    expect(timers[0]?.delay).toBe(32_000)
  })

  it('starts over once a channel has outlived the wait before it', async () => {
    const { layer, script, channels, timers, advance, fire } = harness()
    script.push({ fail: new NetworkError('refused') })

    const connection = layer.get()
    void connection.ready().catch(() => undefined)
    await settle()
    fire()
    await settle()

    // The channel that followed the wait lasted longer than the wait did, which
    // is the evidence that the trouble has passed.
    advance(5000)
    channels[0]?.die(new NetworkError('much later'))

    expect(timers.map((timer) => timer.delay)).toEqual([1000, 1000])
  })

  it('keeps lengthening when a channel dies faster than the wait before it', async () => {
    const { layer, script, channels, timers, fire } = harness()
    script.push({ fail: new NetworkError('refused') })

    void layer
      .get()
      .ready()
      .catch(() => undefined)
    await settle()
    fire()
    await settle()

    // A datacenter that accepts a connection and drops it immediately is not
    // healthy, and treating it as healthy is how a client ends up hammering.
    channels[0]?.die(new NetworkError('immediately'))

    expect(timers.map((timer) => timer.delay)).toEqual([1000, 2000])
  })
})

describe('closing a connection', () => {
  it('leaves nothing armed', async () => {
    const { layer, channels, timers } = harness()
    const connection = layer.get()
    await connection.ready()
    channels[0]?.die()

    connection.close()

    expect(connection.state).toBe('closed')
    expect(timers.every((timer) => timer.cancelled)).toBe(true)
  })

  it('does not connect again when a timer that was already on its way fires', async () => {
    const { layer, channels, opened, timers } = harness()
    const connection = layer.get()
    await connection.ready()
    channels[0]?.die()

    connection.close()
    // Cancelling a timer cannot recall one that is already running.
    timers[0]?.run()
    await settle()

    expect(opened).toHaveLength(1)
    expect(connection.state).toBe('closed')
  })

  it('closes the channel it was holding', async () => {
    const { layer, channels } = harness()
    const connection = layer.get()
    await connection.ready()

    connection.close()

    expect(channels[0]?.closed).toBe(true)
  })

  it('closes a channel that arrives after it', async () => {
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const { layer, script, channels } = harness()
    // The attempt is not told to stop, so a channel arrives for a connection
    // that no longer wants one. Nothing may hold it, and nothing may adopt it.
    script.push({ hold: held, ignore: true })

    const connection = layer.get()
    void connection.ready().catch(() => undefined)
    await settle()

    connection.close()
    release()
    await settle()

    expect(connection.state).toBe('closed')
    expect(channels[0]?.closed).toBe(true)
  })

  it('arranges nothing when the attempt it left behind fails', async () => {
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const { layer, script, timers } = harness()
    script.push({ hold: held, fail: new NetworkError('refused') })

    const connection = layer.get()
    void connection.ready().catch(() => undefined)
    await settle()

    connection.close()
    release()
    await settle()

    // A failure reported for a connection that was shut down is a failure
    // nobody is waiting on. Arranging another attempt would revive it.
    expect(timers).toEqual([])
    expect(connection.state).toBe('closed')
  })

  it('withdraws everyone who was waiting', async () => {
    const { layer, script } = harness()
    script.push({ hold: new Promise<void>(() => {}) })

    const connection = layer.get()
    const waiting = connection.ready()
    const calling = connection.invoke({ _: 'ping', ping_id: 1n })
    await settle()

    connection.close()

    await expect(waiting).rejects.toBeInstanceOf(CancelledError)
    await expect(calling).rejects.toBeInstanceOf(CancelledError)
  })

  it('refuses to start again', async () => {
    const { layer, opened } = harness()
    const connection = layer.get()
    await connection.ready()
    connection.close()

    await expect(connection.ready()).rejects.toBeInstanceOf(CancelledError)
    expect(opened).toHaveLength(1)
  })

  it('does nothing the second time', async () => {
    const { layer, failures } = harness()
    const connection = layer.get()
    await connection.ready()

    connection.close()
    connection.close()

    expect(connection.state).toBe('closed')
    expect(failures).toEqual([])
  })
})

describe('a caller that stops waiting', () => {
  it('is the only one affected', async () => {
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const { layer, script, opened } = harness()
    script.push({ hold: held })

    const connection = layer.get()
    const abandoning = new AbortController()
    const abandoned = connection.ready({ signal: abandoning.signal })
    const staying = connection.ready()
    await settle()

    abandoning.abort()
    await expect(abandoned).rejects.toBeInstanceOf(CancelledError)

    // The attempt belongs to the connection, not to whoever happened to trigger
    // it. One caller losing interest leaves the rest waiting on it.
    release()
    await expect(staying).resolves.toBeUndefined()
    expect(opened).toHaveLength(1)
    expect(connection.state).toBe('ready')
  })

  it('does not stop the connection', async () => {
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const { layer, script } = harness()
    script.push({ hold: held })

    const connection = layer.get()
    const abandoning = new AbortController()
    void connection.ready({ signal: abandoning.signal }).catch(() => undefined)
    await settle()
    abandoning.abort()
    release()
    await settle()

    expect(connection.state).toBe('ready')
  })

  it('is refused immediately when it had already stopped', async () => {
    const { layer, opened } = harness()
    const abandoning = new AbortController()
    abandoning.abort()

    await expect(layer.get().ready({ signal: abandoning.signal })).rejects.toBeInstanceOf(
      CancelledError,
    )
    expect(opened).toHaveLength(0)
  })

  it('never reaches the attempt itself', async () => {
    const { layer, opened } = harness()
    const abandoning = new AbortController()
    await layer.get().ready({ signal: abandoning.signal })

    // The attempt carries a signal of the connection's own. A caller's signal
    // ends that caller's wait and nothing else.
    expect(opened[0]?.signal).not.toBe(abandoning.signal)
  })
})

describe('what happens to calls', () => {
  it('waits for a channel when there is none yet', async () => {
    const { layer, channels } = harness()
    const answer = layer.get().invoke({ _: 'ping', ping_id: 3n })
    await settle()

    // The call has not been written anywhere else, so sending it on the channel
    // that arrives is not sending it twice.
    expect(channels[0]?.calls).toEqual([{ _: 'ping', ping_id: 3n }])
    void answer.catch(() => undefined)
    layer.close()
  })

  it('goes out on whichever channel becomes ready', async () => {
    const { layer, script, channels, fire } = harness()
    script.push({ fail: new NetworkError('refused') })

    const answer = layer.get().invoke({ _: 'ping', ping_id: 4n })
    await settle()
    fire()
    await settle()

    expect(channels[0]?.calls).toEqual([{ _: 'ping', ping_id: 4n }])
    void answer.catch(() => undefined)
    layer.close()
  })

  it('fails with an unknown outcome when the channel dies under it', async () => {
    const { layer, channels } = harness()
    const connection = layer.get()
    const answer = connection.invoke({ _: 'ping', ping_id: 5n })
    await settle()

    channels[0]?.die(new NetworkError('the socket dropped'))

    await expect(answer).rejects.toBeInstanceOf(NetworkError)
  })

  it('is never written a second time', async () => {
    const { layer, channels, fire } = harness()
    const connection = layer.get()
    const answer = connection.invoke({ _: 'ping', ping_id: 6n })
    await settle()

    channels[0]?.die(new NetworkError('the socket dropped'))
    await expect(answer).rejects.toBeInstanceOf(NetworkError)

    fire()
    await settle()

    // The call crossed the write. Whether the datacenter carried it out is not
    // knowable from here, and repeating it would turn one message into two.
    expect(channels[1]?.calls).toEqual([])
  })

  it('stops waiting when the caller does', async () => {
    const { layer, script } = harness()
    script.push({ hold: new Promise<void>(() => {}) })

    const abandoning = new AbortController()
    const answer = layer.get().invoke({ _: 'ping', ping_id: 7n }, { signal: abandoning.signal })
    await settle()

    abandoning.abort()

    await expect(answer).rejects.toBeInstanceOf(CancelledError)
  })
})

describe('a datacenter that does not know the key', () => {
  const refusal = () => new TransportError(AUTH_KEY_NOT_FOUND)

  it('has that key discarded, named by what was refused', async () => {
    const { layer, channels, forgotten } = harness()
    await layer.get().ready()
    const refused = channels[0]?.authorization.key.id

    channels[0]?.die(refusal())
    await settle()

    expect(forgotten).toEqual([{ id: 2, keyId: refused }])
  })

  it('is followed by an attempt that obtains another', async () => {
    const { layer, channels, exchanges, fire } = harness()
    await layer.get().ready()

    channels[0]?.die(refusal())
    await settle()
    fire()
    await settle()

    expect(exchanges()).toBe(2)
    expect(channels[1]?.authorization.key.id).not.toEqual(channels[0]?.authorization.key.id)
  })

  it('discards before the next attempt runs, never after', async () => {
    let release = () => {}
    const discarding = new Promise<void>((resolve) => {
      release = resolve
    })
    const { layer, channels, opened, fire, holdForgetting } = harness()
    await layer.get().ready()
    holdForgetting(discarding)

    channels[0]?.die(refusal())
    await settle()
    fire()
    await settle()

    // An attempt that ran while the refused key was still stored would present
    // that key and be refused again.
    expect(opened).toHaveLength(1)

    release()
    await settle()

    expect(opened).toHaveLength(2)
    expect(channels[1]?.authorization.key.id).not.toEqual(channels[0]?.authorization.key.id)
  })

  it('discards nothing when the refusal names a channel already replaced', async () => {
    const { layer, channels, forgotten, fire } = harness()
    await layer.get().ready()

    channels[0]?.die(new NetworkError('the socket dropped'))
    fire()
    await settle()

    // The refusal arrives from a channel that is no longer in use. Acting on it
    // would discard the key the current channel is authorized with.
    channels[0]?.die(refusal())
    await settle()

    expect(forgotten).toEqual([])
  })

  it('is acted on even when it arrives before the channel was handed over', async () => {
    const { layer, script, channels, forgotten } = harness()
    script.push({ dieOnOpen: refusal() })

    const connection = layer.get()
    void connection.ready().catch(() => undefined)
    await settle()

    // The reason has to survive that window. A channel that ended before anyone
    // could hold it would otherwise look like one that was simply never usable,
    // and the key that was refused would stay.
    expect(forgotten).toEqual([{ id: 2, keyId: channels[0]?.authorization.key.id }])
    expect(channels[0]?.closed).toBe(true)
    expect(connection.state).toBe('waiting')
  })

  it('stops treating a new key as a recovery once they keep being refused', async () => {
    const { layer, channels, timers, advance, fire } = harness()
    const connection = layer.get()
    await connection.ready()

    // Every channel lives longer than the wait before it, so each one looks
    // like a recovery on its own. What it is, is a datacenter refusing every
    // key this client can obtain, at the cost of a key exchange each time.
    for (let round = 0; round < 5; round += 1) {
      advance(5000)
      channels.at(-1)?.die(refusal())
      await settle()
      fire()
      await settle()
    }

    expect(timers.map((timer) => timer.delay)).toEqual([1000, 2000, 4000, 8000, 16_000])
    expect(connection.state).toBe('ready')
  })

  it('stops lengthening at the ceiling however long the refusals go on', async () => {
    const { layer, channels, timers, advance, fire } = harness({
      backoff: { base: 1000, cap: 4000 },
    })
    await layer.get().ready()

    for (let round = 0; round < 6; round += 1) {
      advance(5000)
      channels.at(-1)?.die(refusal())
      await settle()
      fire()
      await settle()
    }

    expect(timers.map((timer) => timer.delay)).toEqual([1000, 2000, 4000, 4000, 4000, 4000])
  })

  it('obtains a new key every time, and never presents a refused one twice', async () => {
    const { layer, channels, forgotten, advance, fire } = harness()
    await layer.get().ready()

    for (let round = 0; round < 3; round += 1) {
      advance(5000)
      channels.at(-1)?.die(refusal())
      await settle()
      fire()
      await settle()
    }

    const used = channels.map((channel) => channel.authorization.key.id.join(','))
    expect(new Set(used).size).toBe(channels.length)
    // Each discard names the key that was actually refused.
    expect(forgotten.map((entry) => entry.keyId)).toEqual(
      channels.slice(0, 3).map((channel) => channel.authorization.key.id),
    )
  })

  it('counts a run of them for itself and not for its datacenter', async () => {
    const { layer, script, channels, timers, advance, fire } = harness()
    const media = layer.get({ purpose: 'media' })

    // Media starts with an ordinary failure, so it has a wait to start over
    // from and the reset is something a case can see.
    script.push({ fail: new NetworkError('the socket dropped') })
    void media.ready().catch(() => undefined)
    await settle()
    fire()
    await settle()

    const main = layer.get()
    await main.ready()

    const latest = (purpose: string) =>
      channels.filter((channel) => channel.purpose === purpose).at(-1)

    // Main works its way up the ramp on keys that keep being refused.
    for (let round = 0; round < 2; round += 1) {
      advance(5000)
      latest('main')?.die(refusal())
      await settle()
      fire()
      await settle()
    }

    // Media has had no refusal at all, so its first is still a recovery. Two
    // purposes share a datacenter's authorization; they do not share the run.
    advance(5000)
    latest('media')?.die(refusal())
    await settle()

    expect(timers.map((timer) => timer.delay)).toEqual([1000, 1000, 2000, 1000])
  })

  it('starts the run over once something else goes wrong', async () => {
    const { layer, channels, timers, advance, fire } = harness()
    await layer.get().ready()

    for (let round = 0; round < 2; round += 1) {
      advance(5000)
      channels.at(-1)?.die(refusal())
      await settle()
      fire()
      await settle()
    }

    // An ordinary failure after a channel that worked resets the wait exactly
    // as it always did — the run of refusals is over.
    advance(5000)
    channels.at(-1)?.die(new NetworkError('the socket dropped'))
    await settle()

    expect(timers.map((timer) => timer.delay)).toEqual([1000, 2000, 1000])
  })

  it('comes back as promptly as any other recovery the first time', async () => {
    const { layer, script, channels, timers, advance, fire } = harness()
    script.push({ fail: new NetworkError('refused') })

    const connection = layer.get()
    void connection.ready().catch(() => undefined)
    await settle()
    fire()
    await settle()

    advance(5000)
    channels.at(-1)?.die(refusal())
    await settle()

    // The key has been replaced, so there is no reason for this connection to
    // come back any more slowly than one that recovered from anything else.
    expect(timers.map((timer) => timer.delay)).toEqual([1000, 1000])
  })

  it('starts the run over when an attempt fails for another reason', async () => {
    const { layer, script, channels, timers, advance, fire } = harness()
    await layer.get().ready()

    advance(5000)
    channels.at(-1)?.die(refusal())
    await settle()

    // The attempt that should have obtained a new key never got that far, so
    // nothing was refused and the run is over.
    script.push({ fail: new NetworkError('the network went away') })
    fire()
    await settle()
    fire()
    await settle()

    advance(5000)
    channels.at(-1)?.die(refusal())
    await settle()

    expect(timers.map((timer) => timer.delay)).toEqual([1000, 2000, 1000])
  })

  it('counts a run of refused keys the same way whichever key it is', async () => {
    const { layer, channels, timers, advance, fire, withLifetimes } = harness()
    withLifetimes()
    await layer.get().ready()

    // A key with a lifetime is replaceable material — obtaining another costs
    // an exchange and a vouching, and the client stays authorized — but a
    // datacenter refusing every one of them is still a loop worth slowing.
    for (let round = 0; round < 2; round += 1) {
      advance(5000)
      channels.at(-1)?.die(refusal())
      await settle()
      fire()
      await settle()
    }

    expect(timers.map((timer) => timer.delay)).toEqual([1000, 2000])
  })

  it('does not let a run of one kind lengthen the waits of the other', async () => {
    const { layer, channels, timers, advance, fire, withLifetimes } = harness()
    withLifetimes()
    await layer.get().ready()

    // Two refusals of the key in use put that run at two.
    advance(5000)
    channels.at(-1)?.die(refusal())
    await settle()
    fire()
    await settle()

    advance(5000)
    channels.at(-1)?.die(refusal())
    await settle()

    // The long-lived key is a different credential, and a refusal of it starts
    // a run of its own. However long the other had been going says nothing
    // about this one.
    withLifetimes(false)
    fire()
    await settle()

    advance(5000)
    channels.at(-1)?.die(refusal())
    await settle()

    expect(timers.map((timer) => timer.delay)).toEqual([1000, 2000, 1000])
  })

  it('is not what an error about the account means', async () => {
    const { layer, channels, forgotten, timers } = harness()
    const connection = layer.get()
    const call = connection.invoke({ _: 'ping', ping_id: 1n })
    await settle()

    // An answer saying the key is not signed in is about the account, not about
    // the key. The key is fine, the channel is fine, and nothing is discarded.
    channels[0]?.refuse(new TelegramError('AUTH_KEY_UNREGISTERED'))

    await expect(call).rejects.toBeInstanceOf(TelegramError)
    expect(forgotten).toEqual([])
    expect(timers).toEqual([])
    expect(connection.state).toBe('ready')
  })

  it('does not discard a key when the refusal was about something else', async () => {
    const { layer, channels, forgotten } = harness()
    await layer.get().ready()

    channels[0]?.die(new TransportError(444))
    await settle()

    expect(forgotten).toEqual([])
  })

  it('does not discard a key when the attempt failed before there was one', async () => {
    const { layer, script, forgotten } = harness()
    script.push({ fail: refusal() })

    void layer
      .get()
      .ready()
      .catch(() => undefined)
    await settle()

    // Nothing says a key was at fault: the exchange that would have produced one
    // runs on a connection this layer never sees.
    expect(forgotten).toEqual([])
  })
})

/**
 * A connection reporting that its key is nearly finished.
 *
 * The margin is already applied where a stored key is chosen. A connection that
 * has been running for a day holds one chosen long ago, and the same question
 * has to be answerable about it — otherwise the only thing that ends a spent
 * key is a call being refused part-way through, which costs that call on top of
 * the exchange the replacement needed anyway.
 */
describe('what a connection reports when its channel ends', () => {
  /** Every report, in order. */
  const reporting = () => {
    const reports: ConnectionDiagnostic[] = []
    const h = harness({
      onDiagnostic: (_origin: unknown, report: ConnectionDiagnostic) => reports.push(report),
    })

    return { ...h, reports }
  }

  it('names the connection, the channel, the key kind and the recovery for a refused key', async () => {
    const h = reporting()
    h.withLifetimes()
    const connection = h.layer.get()
    await connection.ready()
    const written = connection.invoke({ _: 'help.getConfig' })
    await settle()

    h.channels[0]?.die(new TransportError(AUTH_KEY_NOT_FOUND))
    // The call already written fails; it is not written again.
    await expect(written).rejects.toBeInstanceOf(NetworkError)
    await settle()

    expect(h.reports).toEqual([
      {
        event: 'channel-lost',
        connection: '2:main:0',
        dcId: 2,
        purpose: 'main',
        slot: 0,
        generation: 1,
        keyKind: 'temporary',
        cause: 'TransportError',
        transportCode: 404,
        failedCalls: 1,
        waitingCalls: 0,
        action: 'discard-key-and-reconnect',
        delayMs: 1000,
        failures: 1,
      },
      {
        event: 'key-discarded',
        connection: '2:main:0',
        dcId: 2,
        purpose: 'main',
        slot: 0,
        generation: 1,
        refused: 'temporary',
        removed: 'temporary',
      },
    ])
  })

  it('counts the channels a connection has held, so one incident can be told from the next', async () => {
    const h = reporting()
    const connection = h.layer.get()
    await connection.ready()
    h.channels[0]?.die(new NetworkError('the socket closed'))
    await settle()
    h.fire()
    await settle()
    h.channels[1]?.die(new NetworkError('the socket closed again'))
    await settle()

    const lost = h.reports.filter((report) => report.event === 'channel-lost')
    expect(lost.map((report) => [report.generation, report.action, report.cause])).toEqual([
      [1, 'reconnect', 'NetworkError'],
      [2, 'reconnect', 'NetworkError'],
    ])
    expect(lost.every((report) => !('transportCode' in report))).toBe(true)
  })

  it('says when the refused key was the long-lived one, which is the authorization itself', async () => {
    const h = reporting()
    await h.layer.get().ready()

    h.channels[0]?.die(new TransportError(AUTH_KEY_NOT_FOUND))
    await settle()

    expect(
      h.reports.map((report) =>
        report.event === 'channel-lost' ? report.keyKind : report.removed,
      ),
    ).toEqual(['permanent', 'permanent'])
  })

  it('carries nothing a datacenter could recognise: no key, no key identifier, no session', async () => {
    const h = reporting()
    h.withLifetimes()
    await h.layer.get().ready()
    const key = h.keys.get(2)

    h.channels[0]?.die(new TransportError(AUTH_KEY_NOT_FOUND))
    await settle()

    const allowed = new Set([
      'event',
      'connection',
      'dcId',
      'purpose',
      'slot',
      'generation',
      'keyKind',
      'cause',
      'transportCode',
      'failedCalls',
      'waitingCalls',
      'action',
      'delayMs',
      'failures',
      'refused',
      'removed',
    ])
    for (const report of h.reports) {
      for (const [field, value] of Object.entries(report)) {
        expect(allowed.has(field), field).toBe(true)
        expect(['string', 'number'].includes(typeof value), field).toBe(true)
      }
    }
    const written = JSON.stringify(h.reports)
    const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex')
    expect(key).toBeDefined()
    expect(written).not.toContain(hex(key?.id ?? new Uint8Array(0)))
    expect(written).not.toContain(hex((key?.toBytes() ?? new Uint8Array(0)).subarray(0, 16)))
  })
})

describe('a connection whose key is nearly finished', () => {
  /** The lifetime every channel in this harness is given, in Unix seconds. */
  const EXPIRES_AT = 4_000_000_000

  it('says nothing while it holds no key at all', async () => {
    // Nothing is open, so there is nothing to judge — and the key it opens with
    // will be chosen with the margin already applied.
    const { layer } = harness()

    expect(layer.get().spent).toBe(false)
  })

  it('says nothing of a key that does not expire', async () => {
    // The long-lived key has no lifetime. Treating a missing expiry as an
    // imminent one would throw away the credential that vouches for the rest.
    const { layer, advance } = harness()
    const connection = layer.get()
    await connection.ready()

    advance(EXPIRES_AT * 1000)

    expect(connection.spent).toBe(false)
  })

  it('says nothing while a call still fits in what is left', async () => {
    const { layer, advance, withLifetimes } = harness()
    withLifetimes()
    const connection = layer.get()
    await connection.ready()

    // A second before the margin opens.
    advance((EXPIRES_AT - 61) * 1000)

    expect(connection.spent).toBe(false)
  })

  it('says so once a call no longer does', async () => {
    // A minute, because that is the longest a single call waits for its answer:
    // a key that cannot outlive one call is of no use to whatever holds it.
    const { layer, advance, withLifetimes } = harness()
    withLifetimes()
    const connection = layer.get()
    await connection.ready()

    advance((EXPIRES_AT - 60) * 1000)

    expect(connection.spent).toBe(true)
  })

  it('goes on saying so past the moment the key actually expires', async () => {
    const { layer, advance, withLifetimes } = harness()
    withLifetimes()
    const connection = layer.get()
    await connection.ready()

    advance((EXPIRES_AT + 3600) * 1000)

    expect(connection.spent).toBe(true)
  })
})

/**
 * Which connection may move an account through the update stream.
 *
 * `updates-wire.test.ts` proves the account is wired to this rule, with sealed
 * traffic down a chosen connection. What it cannot reach is a connection
 * identity a pool never builds — a transfer connection at the first slot, or a
 * second main connection to one datacenter — because the pool numbers its slots
 * so that neither occurs.
 *
 * That numbering is another module's, and a rule that held only because of it
 * would stop holding the day it changed. `Connections.get` takes a purpose and a
 * slot from whoever asks, so the identities are built here directly and each
 * condition is violated on its own.
 */
describe('which connection is an account’s update stream', () => {
  /** The connection a target names, from a live layer. */
  const identity = (target: Parameters<Connections['get']>[0]) => harness().layer.get(target)

  it('is the first main connection to the datacenter the account belongs to', () => {
    expect(isUpdateSource(identity({ id: 2, purpose: 'main', slot: 0 }), 2)).toBe(true)
    // And the default target is exactly that one.
    expect(isUpdateSource(identity(undefined), 2)).toBe(true)
  })

  it('is not a connection opened for transfers, even at the first slot', () => {
    // The pool numbers transfer slots away from zero, so this identity does not
    // arise from it. It arises from `get`, which anything may call.
    expect(isUpdateSource(identity({ id: 2, purpose: 'media', slot: 0 }), 2)).toBe(false)
    expect(isUpdateSource(identity({ id: 2, purpose: 'cdn', slot: 0 }), 2)).toBe(false)
  })

  it('is not a second main connection to the same datacenter', () => {
    // A second one carrying updates would be a second opinion about what has
    // happened. The purpose is right and the slot is not.
    expect(isUpdateSource(identity({ id: 2, purpose: 'main', slot: 1 }), 2)).toBe(false)
  })

  it('is not a main connection to a datacenter the account does not live at', () => {
    expect(isUpdateSource(identity({ id: 4, purpose: 'main', slot: 0 }), 2)).toBe(false)
  })

  it('follows the account when it moves', () => {
    // The home datacenter is an argument rather than something captured, so a
    // migration changes which connection is the stream without anything being
    // rebuilt: the one at datacenter 4 becomes it, and the one at 2 stops.
    const home = identity({ id: 2, purpose: 'main', slot: 0 })
    const elsewhere = identity({ id: 4, purpose: 'main', slot: 0 })

    expect(isUpdateSource(home, 2)).toBe(true)
    expect(isUpdateSource(elsewhere, 2)).toBe(false)

    expect(isUpdateSource(home, 4)).toBe(false)
    expect(isUpdateSource(elsewhere, 4)).toBe(true)
  })
})
