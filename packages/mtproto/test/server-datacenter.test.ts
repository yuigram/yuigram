// SPDX-License-Identifier: MIT

/**
 * A datacenter across the connections a client makes to it.
 *
 * The peer models one conversation and must keep doing so — two sockets are two
 * conversations, and sharing a framing or a session between them would model
 * something that cannot happen. What a datacenter remembers between them is an
 * authorization, because a client establishes a key once and then uses it on
 * every connection after.
 *
 * The sequence these cases exist for is the one a real client performs and
 * which a per-connection peer cannot represent:
 *
 * ```
 *   connection 0 ─ exchange ──────────────> long-lived key,   then closed
 *   connection 1 ─ exchange + binding ────> key with a life,  then closed
 *   connection 2 ─ no exchange, encrypted from its first frame
 * ```
 *
 * Everything here goes through the real client: a real channel, a real
 * handshake, real sealing and opening. Only the socket is replaced.
 */

import { describe, expect, it, vi } from 'vitest'
import { REGISTRY as API } from '../src/generated/api/registry.js'
import { REGISTRY as CORE } from '../src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../src/generated/mtproto/registry.js'
import { AuthKey } from '../src/message/auth-key.js'
import { openChannel } from '../src/network/channel.js'
import type { DcAddress } from '../src/network/dc.js'
import { TlScope } from '../src/tl/index.js'
import { MockDatacenter } from './server/datacenter.js'
import { createServerKey } from './server/keys.js'

/**
 * Longer than the default, because these cases run the exchange rather than
 * standing in for it: a 2048-bit Diffie-Hellman agreement costs real time, and
 * several of them travel through a single case.
 */
vi.setConfig({ testTimeout: 30_000 })

const SCOPE = new TlScope('datacenter', [CORE, MTPROTO, API])
const NOW_SECONDS = 1_700_000_000

const CLIENT = {
  apiId: 1,
  deviceModel: 'test',
  systemVersion: 'test',
  appVersion: 'test',
  systemLangCode: 'en',
  langPack: '',
  langCode: 'en',
}

/** The address a datacenter answers on, as the client names it. */
const addressOf = (datacenter: MockDatacenter): DcAddress => ({
  id: datacenter.id,
  host: datacenter.host,
  port: datacenter.port,
  ipv6: false,
  mediaOnly: false,
  cdn: false,
  secret: undefined,
  tcpoOnly: false,
  thisPortOnly: false,
  static: false,
})

/** Why each channel ended, so a case never waits on a failure it cannot see. */
const endings: string[] = []

/** Open a real channel against a datacenter, with everything deterministic. */
async function connect(
  datacenter: MockDatacenter,
  overrides: Record<string, unknown> = {},
): ReturnType<typeof openChannel> {
  return await openChannel({
    address: addressOf(datacenter),
    scope: SCOPE,
    client: CLIENT,
    keys: [serverKeyOf(datacenter)],
    now: () => NOW_SECONDS * 1000,
    onClosed: (error?: Error) => endings.push(error?.message ?? 'closed'),
    open: async (request) => datacenter.connect(request),
    schedule: (run, delay) => {
      const timer = setTimeout(run, delay)

      return () => clearTimeout(timer)
    },
    ...overrides,
  })
}

/** The public half of the key a datacenter offers, as a client holds it. */
function serverKeyOf(datacenter: MockDatacenter) {
  return {
    n: datacenter.key.n,
    e: datacenter.key.e,
    fingerprint: datacenter.key.fingerprint,
  }
}

/**
 * The key pair the datacenters here offer.
 *
 * Generated once. Which key a datacenter holds is not what any of these cases
 * is about, and generating a fresh pair for each of them costs more than the
 * exchanges they exist to run.
 */
const KEY = createServerKey()

/** A datacenter with the key and the clock every case here shares. */
const datacenter = (overrides: Record<string, unknown> = {}) =>
  new MockDatacenter({ key: KEY, scope: SCOPE, serverTime: NOW_SECONDS, ...overrides })

describe('a connection that begins with an authorization', () => {
  it('runs no exchange, because there is nothing left to agree', async () => {
    const dc = datacenter()
    const first = await connect(dc)
    await first.invoke({ _: 'ping', ping_id: 1n })
    first.close()

    const before = dc.connections.length
    const second = await connect(dc, { authorization: first.authorization })
    await second.invoke({ _: 'ping', ping_id: 2n })

    // Nothing was negotiated on the second connection: `result` is what an
    // exchange produces, and there was none. What it is using is the key the
    // first connection settled on.
    expect(dc.connections).toHaveLength(before + 1)
    expect(dc.connections[before]?.peer.result).toBeUndefined()
    expect(dc.connections[before]?.peer.authorization).toBe(dc.permanent)
    second.close()
  })

  it('opens the client’s encrypted traffic with the key it was given', async () => {
    // The whole point: an answer comes back, which is only possible if the peer
    // decrypted a message sealed under a key it never negotiated.
    const dc = datacenter()
    const first = await connect(dc)
    await first.invoke({ _: 'ping', ping_id: 1n })
    first.close()

    const second = await connect(dc, { authorization: first.authorization })
    const answer = await second.invoke({ _: 'ping', ping_id: 99n })

    expect(answer['_']).toBe('pong')
    expect(answer['ping_id']).toBe(99n)
    second.close()
  })

  it('is ready from its first frame rather than exchanging', async () => {
    const dc = datacenter()
    const first = await connect(dc)
    await first.invoke({ _: 'ping', ping_id: 1n })
    first.close()

    const second = await connect(dc, { authorization: first.authorization })
    await second.invoke({ _: 'ping', ping_id: 2n })

    expect(dc.connections.at(-1)?.peer.state).toBe('established')
    second.close()
  })

  it('still refuses a message sealed under a key it was not given', async () => {
    // Nothing about beginning established relaxes what follows. A message under
    // another key is refused exactly as it would be on a negotiated connection.
    const dc = datacenter()
    const first = await connect(dc)
    await first.invoke({ _: 'ping', ping_id: 1n })
    first.close()

    const wrong = {
      ...first.authorization,
      key: AuthKey.from(Uint8Array.from({ length: 256 }, (_, index) => (index * 3 + 1) & 0xff)),
    }

    // Opening succeeds — a channel handed an authorization has nothing to ask.
    // The refusal comes when a message sealed under it arrives, which is where
    // a real datacenter refuses one too.
    const second = await connect(dc, { authorization: wrong })

    await expect(second.invoke({ _: 'ping', ping_id: 1n }, { timeout: 250 })).rejects.toThrow()
    expect(dc.connections.at(-1)?.peer.authorization).toBeUndefined()
    second.close()
  })

  it('leaves an ordinary connection exchanging as it always did', async () => {
    // The capability is additive. A connection given no authorization behaves
    // exactly as before.
    const dc = datacenter()
    const live = await connect(dc)

    expect(dc.connections).toHaveLength(1)
    expect(dc.connections[0]?.peer.result).toBeDefined()
    expect(live.state).toBe('ready')
    live.close()
  })
})

describe('what a datacenter remembers between connections', () => {
  it('keeps the long-lived key after the connection that made it has closed', async () => {
    const dc = datacenter()
    const first = await connect(dc)
    await first.invoke({ _: 'ping', ping_id: 1n })
    const negotiated = first.authorization.key.id
    first.close()

    expect(dc.connections[0]?.open()).toBe(false)
    expect(dc.permanent).toBeDefined()
    expect(AuthKey.from(dc.permanent?.authKey as Uint8Array).id).toEqual(negotiated)
  })

  it('keeps a key with a lifetime apart from the long-lived one', async () => {
    // Two authorizations, two roles. Collapsing them would let a binding be
    // checked against the key it was vouching for.
    const dc = datacenter()
    const permanent = await connect(dc)
    await permanent.invoke({ _: 'ping', ping_id: 1n })
    permanent.close()

    const temporary = await connect(dc, { expiresIn: 3600 })
    await temporary.bind(permanent.authorization.key)
    temporary.close()

    expect(dc.permanent?.expiresIn).toBeUndefined()
    expect(dc.temporary?.expiresIn).toBe(3600)
    expect(dc.permanent?.authKey).not.toEqual(dc.temporary?.authKey)
  })

  it('holds nothing before a client has established anything', () => {
    const dc = datacenter()

    expect(dc.permanent).toBeUndefined()
    expect(dc.temporary).toBeUndefined()
  })

  it('answers only the address it was given', () => {
    const dc = datacenter({ host: '127.0.0.9', port: 443 })

    expect(dc.answers({ host: '127.0.0.9', port: 443 })).toBe(true)
    expect(dc.answers({ host: '127.0.0.8', port: 443 })).toBe(false)
    expect(dc.answers({ host: '127.0.0.9', port: 80 })).toBe(false)
  })
})

describe('the sequence a client actually performs', () => {
  it('carries an authorization from one connection to another two later', async () => {
    // The transition a per-connection peer cannot represent, end to end. Each
    // connection is closed before the next opens, exactly as the client closes
    // the channels it used only to obtain keys.
    const dc = datacenter()

    const permanent = await connect(dc)
    await permanent.invoke({ _: 'ping', ping_id: 1n })
    permanent.close()

    const temporary = await connect(dc, { expiresIn: 3600 })
    await temporary.bind(permanent.authorization.key)
    const held = temporary.authorization
    temporary.close()

    // Nothing negotiated here. The client arrives holding the key with a
    // lifetime and starts using it.
    const caller = await connect(dc, { authorization: held })
    const answer = await caller.invoke({ _: 'ping', ping_id: 7n })

    expect(answer['ping_id']).toBe(7n)
    expect(dc.connections).toHaveLength(3)
    expect(dc.connections[2]?.peer.state).toBe('established')
    caller.close()
  })

  it('checks the binding against the long-lived key from the earlier connection', async () => {
    // The binding is only meaningful against a key established elsewhere, so
    // this proves the datacenter carried it rather than the connection holding
    // both ends of its own proof.
    const dc = datacenter()
    const permanent = await connect(dc)
    await permanent.invoke({ _: 'ping', ping_id: 1n })
    permanent.close()

    const temporary = await connect(dc, { expiresIn: 3600 })
    await temporary.bind(permanent.authorization.key)

    const [binding] = dc.connections[1]?.peer.bindings ?? []

    expect(binding).toBeDefined()
    expect(binding?.expiresAt).toBe(temporary.authorization.expiresAt)
    temporary.close()
  })

  it('refuses a binding vouched for by a key it never saw', async () => {
    // Validation is unchanged. A datacenter that accepted this would let a
    // client vouch for itself with anything.
    const dc = datacenter()
    const permanent = await connect(dc)
    await permanent.invoke({ _: 'ping', ping_id: 1n })
    permanent.close()

    const temporary = await connect(dc, { expiresIn: 3600 })
    const stranger = AuthKey.from(
      Uint8Array.from({ length: 256 }, (_, index) => (index * 7 + 9) & 0xff),
    )

    await expect(temporary.bind(stranger)).rejects.toThrow()
    temporary.close()
  })
})

describe('what stays with the connection', () => {
  it('gives each connection its own peer', async () => {
    const dc = datacenter()
    const first = await connect(dc)
    await first.invoke({ _: 'ping', ping_id: 1n })
    first.close()
    const second = await connect(dc, { authorization: first.authorization })
    await second.invoke({ _: 'ping', ping_id: 2n })

    expect(dc.connections[0]?.peer).not.toBe(dc.connections[1]?.peer)
    second.close()
  })

  it('gives each connection its own session', async () => {
    // Sharing one would make two conversations look like one, and a message
    // identifier from either would be accepted on the other.
    const dc = datacenter()
    const first = await connect(dc)
    await first.invoke({ _: 'ping', ping_id: 1n })
    first.close()
    const second = await connect(dc, { authorization: first.authorization })
    await second.invoke({ _: 'ping', ping_id: 2n })

    const sessions = dc.connections.map((connection) => connection.peer.seen[0])

    expect(sessions[0]).toBeDefined()
    expect(sessions[1]).toBeDefined()
    // Each peer read only what travelled on its own connection.
    expect(dc.connections[0]?.peer.seen).toHaveLength(1)
    expect(dc.connections[1]?.peer.seen).toHaveLength(1)
    second.close()
  })

  it('closes one connection without closing another', async () => {
    const dc = datacenter()
    const first = await connect(dc)
    await first.invoke({ _: 'ping', ping_id: 1n })
    const second = await connect(dc, { authorization: first.authorization })
    await second.invoke({ _: 'ping', ping_id: 2n })

    first.close()

    expect(dc.connections[0]?.open()).toBe(false)
    expect(dc.connections[1]?.open()).toBe(true)
    second.close()
  })
})

describe('two datacenters', () => {
  it('do not share what their clients established', async () => {
    // An authorization belongs to one datacenter. Leaking it would let a client
    // reach a datacenter it never authorized against.
    const first = datacenter({ id: 2, host: '127.0.0.2' })
    const second = datacenter({ id: 4, host: '127.0.0.4' })

    const live = await connect(first)
    await live.invoke({ _: 'ping', ping_id: 1n })
    live.close()

    expect(first.permanent).toBeDefined()
    expect(second.permanent).toBeUndefined()
    expect(second.connections).toHaveLength(0)
  })

  it('can be given different keys, so one cannot answer for the other', async () => {
    const first = new MockDatacenter({ scope: SCOPE, serverTime: NOW_SECONDS, id: 2 })
    const second = new MockDatacenter({ scope: SCOPE, serverTime: NOW_SECONDS, id: 4 })

    expect(first.key.fingerprint).not.toBe(second.key.fingerprint)
  })

  it('each answer only their own address', () => {
    const first = datacenter({ id: 2, host: '127.0.0.2' })
    const second = datacenter({ id: 4, host: '127.0.0.4' })

    expect(first.answers({ host: second.host, port: second.port })).toBe(false)
    expect(second.answers({ host: first.host, port: first.port })).toBe(false)
  })
})
