// SPDX-License-Identifier: MIT

/**
 * MTProxy, against a peer that shares none of the client's helpers.
 *
 * The peer (`server/mtproxy.ts`) plays the proxy from the protocol, with
 * `node:net` and `node:crypto` and a ClientHello reader of its own, and forwards
 * to a stand-in datacenter. Everything here runs over real local TCP sockets.
 * What this cannot show is that a proxy run by someone else accepts the
 * client: no third-party proxy and no Telegram is reached from here.
 */

import { createHmac } from 'node:crypto'
import { inspect } from 'node:util'
import {
  CancelledError,
  ConfigError,
  memory,
  NetworkError,
  processGuard,
  ValidationError,
} from '@yuigram/core'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Account } from '../src/account.js'
import { serverRsaKey } from '../src/auth/keys.js'
import { validateDhParameters } from '../src/crypto/primes.js'
import { REGISTRY as API } from '../src/generated/api/registry.js'
import { REGISTRY as CORE } from '../src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../src/generated/mtproto/registry.js'
import { mtproxy as browserMtproxy } from '../src/mtproxy/index.browser.js'
import { mtproxy, proxyDcId } from '../src/mtproxy/mtproxy.js'
import { readProxySecret } from '../src/mtproxy/secret.js'
import { clientHello, FakeTlsError, MAX_RECORD_PAYLOAD } from '../src/mtproxy/tls.js'
import { openChannel, type StreamRequest } from '../src/network/channel.js'
import type { DcAddress } from '../src/network/dc.js'
import type { ByteStream } from '../src/network/stream.js'
import { connectTcp } from '../src/network/tcp.js'
import { TlScope } from '../src/tl/index.js'
import { MockDatacenter } from './server/datacenter.js'
import { createServerKey } from './server/keys.js'
import {
  type MtProxyPeer,
  type PeerFault,
  type PeerMode,
  readClientHello,
  startMtProxyPeer,
} from './server/mtproxy.js'
import { DH_PRIME } from './server/server.js'

vi.setConfig({ testTimeout: 60_000 })

const KEY = createServerKey()
const SCOPE = new TlScope('mtproxy', [CORE, MTPROTO, API])
const NOW_SECONDS = 1_700_000_000
const PROXY_KEY = Uint8Array.from({ length: 16 }, (_, index) => 0x40 + index * 7)
const DOMAIN = 'cdn.example.org'

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex')
const SECRETS: Record<PeerMode, string> = {
  obfuscated: hex(PROXY_KEY),
  padded: `dd${hex(PROXY_KEY)}`,
  'fake-tls': Buffer.from([0xee, ...PROXY_KEY, ...new TextEncoder().encode(DOMAIN)]).toString(
    'base64url',
  ),
}

const ADDRESS: DcAddress = {
  id: 2,
  host: '127.0.0.2',
  port: 443,
  ipv6: false,
  mediaOnly: false,
  tcpoOnly: false,
  cdn: false,
  static: false,
  thisPortOnly: false,
  secret: undefined,
}

const CLIENT = {
  apiId: 12345,
  deviceModel: 'Yuigram',
  systemVersion: '1.0',
  appVersion: '0.1.0',
  systemLangCode: 'en',
  langPack: '',
  langCode: 'en',
}

function clock(): () => number {
  const started = Date.now()
  return () => NOW_SECONDS * 1000 + (Date.now() - started)
}

const peers: MtProxyPeer[] = []
afterEach(async () => {
  await Promise.all(peers.splice(0).map((peer) => peer.close()))
})

/** A peer in front of one stand-in datacenter. */
async function proxyFor(mode: PeerMode, faults: PeerFault[] = []) {
  const datacenter = new MockDatacenter({ key: KEY, scope: SCOPE, serverTime: NOW_SECONDS })
  const peer = await startMtProxyPeer({
    mode,
    key: PROXY_KEY,
    domain: DOMAIN,
    backend: () => datacenter,
    faults: new Set(faults),
  })
  peers.push(peer)
  return { peer, datacenter }
}

/** Wait until something is true, or fail saying what was waited for. */
async function until(condition: () => boolean, what: string) {
  const deadline = Date.now() + 5_000
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`waited for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

beforeAll(() => {
  validateDhParameters({ p: DH_PRIME, g: 3n })
}, 60_000)

describe('reading a secret', () => {
  it('reads each kind, in each encoding a link uses', () => {
    expect(readProxySecret(hex(PROXY_KEY))).toEqual({ mode: 'obfuscated', key: PROXY_KEY })
    expect(readProxySecret(`DD${hex(PROXY_KEY).toUpperCase()}`)).toEqual({
      mode: 'padded',
      key: PROXY_KEY,
    })
    expect(readProxySecret(SECRETS['fake-tls'])).toEqual({
      mode: 'fake-tls',
      key: PROXY_KEY,
      domain: DOMAIN,
    })
    const standard = Buffer.from([0xee, ...PROXY_KEY, ...Buffer.from(DOMAIN)]).toString('base64')
    expect(readProxySecret(standard).domain).toBe(DOMAIN)
    expect(readProxySecret(Uint8Array.of(0xdd, ...PROXY_KEY)).mode).toBe('padded')
  })

  it('refuses what is not one of those, without repeating it', () => {
    const refused = [
      hex(PROXY_KEY).slice(2), // fifteen bytes
      `ab${hex(PROXY_KEY)}`, // seventeen, not 0xdd
      `ab${hex(PROXY_KEY)}00`, // eighteen, not 0xee
      Buffer.from([0xee, ...PROXY_KEY, ...Buffer.alloc(183, 0x61)]).toString('hex'),
      Buffer.from([0xee, ...PROXY_KEY, 0x20, 0x61]).toString('hex'), // a host with a space
      Buffer.from([0xee, ...PROXY_KEY, 0xff, 0xfe]).toString('hex'), // not text
      'not a secret!',
      'ab+cd_ef', // two base64 alphabets at once
    ]
    for (const secret of refused) {
      let message = ''
      try {
        readProxySecret(secret)
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        message = (error as Error).message
      }
      expect(message, secret).not.toBe('')
      expect(message).not.toContain(secret)
      expect(message).not.toContain(hex(PROXY_KEY))
    }
  })
})

describe('naming the datacenter to a proxy', () => {
  it('adds ten thousand in the test environment and negates a connection for files', () => {
    expect(proxyDcId({ id: 2, mediaOnly: false, testMode: false })).toBe(2)
    expect(proxyDcId({ id: 4, mediaOnly: true, testMode: false })).toBe(-4)
    expect(proxyDcId({ id: 2, mediaOnly: false, testMode: true })).toBe(10_002)
    expect(proxyDcId({ id: 3, mediaOnly: true, testMode: true })).toBe(-10_003)
  })
})

describe('the greeting, read by the peer', () => {
  it('is a well-formed ClientHello naming the host, with the HMAC and the time in its random', () => {
    const time = 1_800_000_000
    const hello = clientHello({
      key: PROXY_KEY,
      domain: DOMAIN,
      time,
      random: (n) => new Uint8Array(n).map(() => (Math.random() * 256) | 0),
    })
    const read = readClientHello(hello.bytes)

    expect(read.serverName).toBe(DOMAIN)
    expect(read.sessionId).toHaveLength(32)
    expect(read.cipherSuites).toContain(0x1301)
    // supported_versions offers TLS 1.3; key_share carries 32 bytes for X25519.
    expect(read.extensions.get(0x002b)).toBeDefined()
    expect(read.extensions.get(0x0033)?.length).toBeGreaterThan(36)
    expect(hello.bytes.length - 5).toBeGreaterThanOrEqual(512)

    const zeroed = Uint8Array.from(hello.bytes)
    zeroed.fill(0, 11, 43)
    const mac = createHmac('sha256', PROXY_KEY).update(zeroed).digest()
    expect(hex(read.random.subarray(0, 28))).toBe(hex(mac.subarray(0, 28)))
    expect(mac.readInt32LE(28) ^ Buffer.from(read.random).readInt32LE(28)).toBe(time)
  })

  it('offers a key share only for a group it lists, as OpenSSL insists', () => {
    // A share for a GREASE group other than the one supported_groups names is
    // refused by OpenSSL with illegal_parameter; the peer's reader refuses it
    // the same way, for any draw of the GREASE values.
    for (let draw = 0; draw < 50; draw += 1) {
      const hello = clientHello({
        key: PROXY_KEY,
        domain: DOMAIN,
        time: 1_800_000_000,
        random: (n) => new Uint8Array(n).map(() => (Math.random() * 256) | 0),
      })
      expect(() => readClientHello(hello.bytes)).not.toThrow()
    }
  })
})

describe('an account through each kind of proxy', () => {
  for (const mode of ['obfuscated', 'padded', 'fake-tls'] as const) {
    it(`negotiates and calls through a ${mode} proxy, which forwards to the datacenter`, async () => {
      const { peer, datacenter } = await proxyFor(mode)
      const account = new Account({
        apiId: 12345,
        apiHash: 'mtproxy',
        keys: [serverRsaKey(KEY)],
        storage: memory(),
        storageGuard: processGuard(),
        bootstrap: { thisDc: 2, testMode: false, options: [ADDRESS] },
        now: clock(),
        proxy: mtproxy({ host: '127.0.0.1', port: peer.port, secret: SECRETS[mode] }),
      })

      try {
        await account.connect()
        const answer = await account.api.call({ _: 'help.getConfig' })
        expect(answer._).toBe('boolTrue')
      } finally {
        await account.stop()
      }

      expect(datacenter.permanent).toBeDefined()
      // Telegram is told which proxy carried the connection, as initConnection asks.
      const told = datacenter.connections
        .flatMap((connection) => connection.peer.seen)
        .map((message) => message.value as { query?: { _?: string; proxy?: unknown } })
        .filter((value) => value.query?._ === 'initConnection')
        .map((value) => value.query?.proxy)
      expect(told.length).toBeGreaterThan(0)
      for (const proxy of told) {
        expect(proxy).toEqual({ _: 'inputClientProxy', address: '127.0.0.1', port: peer.port })
      }
      expect(peer.connections.length).toBeGreaterThan(0)
      for (const seen of peer.connections) {
        expect(seen.refused).toBeUndefined()
        expect(seen.dcId).toBe(2)
        expect(seen.tag).toBe(mode === 'obfuscated' ? 'eeeeeeee' : 'dddddddd')
      }
      if (mode === 'fake-tls') {
        const records = peer.connections.flatMap((seen) => seen.records)
        expect(peer.connections.every((seen) => seen.serverName === DOMAIN)).toBe(true)
        expect(Math.max(...records)).toBeLessThanOrEqual(MAX_RECORD_PAYLOAD)
        // The opening packet travels with the first frame, not alone.
        expect(peer.connections.every((seen) => (seen.records[0] ?? 0) > 64)).toBe(true)
      }
    })
  }

  it('greets the proxy again when a connection drops, and carries on through it', async () => {
    const { peer, datacenter } = await proxyFor('fake-tls')
    const account = new Account({
      apiId: 12345,
      apiHash: 'mtproxy',
      keys: [serverRsaKey(KEY)],
      storage: memory(),
      storageGuard: processGuard(),
      bootstrap: { thisDc: 2, testMode: false, options: [ADDRESS] },
      now: clock(),
      proxy: mtproxy({ host: '127.0.0.1', port: peer.port, secret: SECRETS['fake-tls'] }),
    })

    let before = 0
    try {
      await account.connect()
      await account.api.call({ _: 'help.getConfig' })
      before = peer.connections.length

      // The datacenter drops every connection, and the proxy hangs up on the
      // client in turn, as a real one does when its upstream goes.
      for (const connection of datacenter.connections) connection.fail(new Error('dropped'))
      await until(
        () => peer.connections.slice(0, before).every((seen) => !seen.open),
        'the proxied connections to close',
      )

      const answer = await account.api.call({ _: 'help.getConfig' })
      expect(answer._).toBe('boolTrue')
    } finally {
      await account.stop()
    }

    // A new connection, with a greeting of its own, through the same proxy.
    expect(peer.connections.length).toBeGreaterThan(before)
    for (const seen of peer.connections) {
      expect(seen.refused).toBeUndefined()
      expect(seen.serverName).toBe(DOMAIN)
      expect(seen.greetingTime).toBeDefined()
      expect(seen.dcId).toBe(2)
    }
  })

  it('names a test-environment datacenter to the proxy as the test one', async () => {
    const { peer } = await proxyFor('padded')
    const account = new Account({
      apiId: 12345,
      apiHash: 'mtproxy',
      keys: [serverRsaKey(KEY)],
      storage: memory(),
      storageGuard: processGuard(),
      bootstrap: { thisDc: 2, testMode: true, options: [ADDRESS] },
      now: clock(),
      proxy: mtproxy({ host: '127.0.0.1', port: peer.port, secret: SECRETS.padded }),
    })

    try {
      // A connection is opened when there is something to send.
      await account.connect()
      await account.api.call({ _: 'help.getConfig' })
    } finally {
      await account.stop()
    }

    expect(peer.connections.map((seen) => seen.dcId)).toContain(10_002)
    expect(peer.connections.every((seen) => seen.dcId === 10_002)).toBe(true)
  })

  it('names a connection for files to the proxy as one', async () => {
    const { peer } = await proxyFor('fake-tls')
    const channel = await openChannel({
      address: { ...ADDRESS, mediaOnly: true },
      scope: SCOPE,
      client: CLIENT,
      keys: [serverRsaKey(KEY)],
      route: mtproxy({ host: '127.0.0.1', port: peer.port, secret: SECRETS['fake-tls'] }),
      now: clock(),
    })
    channel.close()

    expect(peer.connections[0]?.dcId).toBe(-2)
  })
})

describe('what a proxy can do wrong', () => {
  /** Open a fake-TLS stream through the route, directly. */
  const openThrough = (
    port: number,
    extra: { signal?: AbortSignal; greetingTimeout?: number } = {},
    onClose: (error?: Error) => void = () => {},
  ) =>
    mtproxy({
      host: '127.0.0.1',
      port,
      secret: SECRETS['fake-tls'],
      ...(extra.greetingTimeout === undefined ? {} : { greetingTimeout: extra.greetingTimeout }),
    })
      .connection({ id: 2, mediaOnly: false, testMode: false })
      .open(
        {
          host: ADDRESS.host,
          port: ADDRESS.port,
          onData: () => {},
          onClose,
          ...(extra.signal === undefined ? {} : { signal: extra.signal }),
        },
        connectTcp,
      )

  it('refuses a ServerHello not made with the secret, and closes the socket', async () => {
    const { peer } = await proxyFor('fake-tls', ['wrong-hmac'])
    await expect(openThrough(peer.port)).rejects.toThrow(FakeTlsError)
    await until(() => peer.connections[0]?.open === false, 'the socket to close')
  })

  it('refuses an answer that is not a TLS greeting at all', async () => {
    const { peer } = await proxyFor('fake-tls', ['plain-http'])
    await expect(openThrough(peer.port)).rejects.toThrow(/not the greeting a fake-TLS proxy gives/)
  })

  it('fails when the proxy hangs up on the greeting', async () => {
    const { peer } = await proxyFor('fake-tls', ['hang-up'])
    await expect(openThrough(peer.port)).rejects.toThrow(NetworkError)
  })

  it('gives up on a proxy that never answers, and closes the socket', async () => {
    const { peer } = await proxyFor('fake-tls', ['silent'])
    await expect(openThrough(peer.port, { greetingTimeout: 200 })).rejects.toThrow(/did not answer/)
    await until(() => peer.connections[0]?.open === false, 'the socket to close')
  })

  it('stops waiting when the caller abandons the attempt', async () => {
    const { peer } = await proxyFor('fake-tls', ['silent'])
    const abandon = new AbortController()
    const attempt = openThrough(peer.port, { signal: abandon.signal })
    await until(() => peer.connections.length === 1, 'the connection')
    abandon.abort()
    await expect(attempt).rejects.toThrow(CancelledError)
    await until(() => peer.connections[0]?.open === false, 'the socket to close')
  })

  it('ends the connection on a record that is not application data', async () => {
    const { peer } = await proxyFor('fake-tls', ['bad-record'])
    let ended: Error | undefined
    const stream = await openThrough(peer.port, {}, (error) => {
      ended = error
    })
    stream.write(new Uint8Array(64))
    stream.write(new Uint8Array(8))
    await until(() => ended !== undefined, 'the connection to end')
    expect(ended).toBeInstanceOf(FakeTlsError)
    expect(stream.open).toBe(false)
  })

  it('is refused by a proxy holding another secret', async () => {
    const { peer } = await proxyFor('fake-tls')
    const other = Buffer.from([0xee, ...PROXY_KEY.map((byte) => byte ^ 1), ...Buffer.from(DOMAIN)])
    const attempt = mtproxy({ host: '127.0.0.1', port: peer.port, secret: other })
      .connection({ id: 2, mediaOnly: false, testMode: false })
      .open(
        { host: ADDRESS.host, port: ADDRESS.port, onData: () => {}, onClose: () => {} },
        connectTcp,
      )

    await expect(attempt).rejects.toThrow(NetworkError)
    expect(peer.connections[0]?.refused).toMatch(/not made with this secret/)
  })

  it('never reaches for the datacenter itself instead', async () => {
    const asked: string[] = []
    const recording = (request: StreamRequest): Promise<ByteStream> => {
      asked.push(`${request.host}:${request.port}`)
      return connectTcp(request)
    }
    const { peer } = await proxyFor('obfuscated')
    await peer.close()

    const attempt = openChannel({
      address: ADDRESS,
      scope: SCOPE,
      client: CLIENT,
      keys: [serverRsaKey(KEY)],
      route: mtproxy({ host: '127.0.0.1', port: peer.port, secret: SECRETS.obfuscated }),
      open: recording,
      now: clock(),
    })

    // Refused by the operating system, at the proxy's address and nowhere else.
    await expect(attempt).rejects.toThrow()
    expect(asked).toEqual([`127.0.0.1:${peer.port}`])
  })
})

describe('configuration', () => {
  it('refuses a proxy beside an unobfuscated connection, rather than choosing', () => {
    const proxy = mtproxy({ host: '127.0.0.1', port: 443, secret: SECRETS.obfuscated })
    expect(
      () =>
        new Account({
          apiId: 1,
          apiHash: 'x',
          keys: [serverRsaKey(KEY)],
          storage: memory(),
          bootstrap: { thisDc: 2, testMode: false, options: [ADDRESS] },
          proxy,
          obfuscated: false,
        }),
    ).toThrow(/always obfuscated/)
  })

  it('takes a proxy link as readLink describes one', () => {
    const proxy = mtproxy({
      kind: 'proxy',
      server: 'proxy.example',
      port: 8443,
      secret: SECRETS.padded,
    })
    expect([proxy.host, proxy.port, proxy.mode]).toEqual(['proxy.example', 8443, 'padded'])
  })

  it('refuses a host or port that cannot be one', () => {
    expect(() => mtproxy({ host: '', port: 443, secret: SECRETS.padded })).toThrow(ValidationError)
    expect(() => mtproxy({ host: 'a b', port: 443, secret: SECRETS.padded })).toThrow(
      ValidationError,
    )
    expect(() => mtproxy({ host: 'h', port: 0, secret: SECRETS.padded })).toThrow(ValidationError)
    expect(() => mtproxy({ host: 'h', port: 70_000, secret: SECRETS.padded })).toThrow(
      ValidationError,
    )
  })

  it('never shows the secret, however it is printed', () => {
    for (const secret of Object.values(SECRETS)) {
      const proxy = mtproxy({ host: '127.0.0.1', port: 443, secret })
      for (const shown of [
        inspect(proxy),
        JSON.stringify(proxy),
        proxy.description,
        String(proxy),
      ]) {
        expect(shown).not.toContain(hex(PROXY_KEY))
        expect(shown).not.toContain(secret)
        expect(shown).not.toContain(Buffer.from(PROXY_KEY).toString('base64url').slice(0, 12))
      }
    }
  })

  it('refuses in a browser, where the proxy is made', () => {
    expect(() => browserMtproxy({ host: 'h', port: 443, secret: SECRETS.padded })).toThrow(
      ConfigError,
    )
  })
})
