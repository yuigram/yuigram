// SPDX-License-Identifier: MIT

/**
 * What the framework does in a real browser.
 *
 * This file is bundled for a browser and loaded by one. Nothing here mocks a
 * browser global: the cryptography comes from whatever the page's `crypto`
 * provides, the store is the page's own `localStorage`, and the connection is
 * a real `WebSocket` to the server that served this file. A Node process with
 * browser globals stubbed in is a useful deterministic test and is not this.
 *
 * Every check reports what it did rather than only whether it passed, because
 * the point of running here is to find out which parts actually work in a
 * browser — a check that silently did nothing would otherwise read as a pass.
 *
 * The results are written into the page and also onto `globalThis.__results`,
 * so they can be read either by a person or by whatever drove the browser.
 */

import { Handshake } from '../../../packages/mtproto/src/auth/handshake.js'
import { serverRsaKey } from '../../../packages/mtproto/src/auth/keys.js'
import { backend } from '../../../packages/mtproto/src/crypto/backend.js'
import { connectWebSocket } from '../../../packages/mtproto/src/network/websocket.js'
import { claimArea } from '../../../packages/mtproto/src/storage/ownership.js'
import {
  FrameBuffer,
  IntermediateFraming,
} from '../../../packages/mtproto/src/transport/framing.js'
import {
  Account,
  areaFor,
  createLogger,
  memory,
  StorageOwnershipError,
  web,
} from '../../../packages/yuigram/src/index.js'
import { runIndexedDbAccountCheck, runIndexedDbChecks } from './indexeddb-checks.js'
import { runWorkerChecks } from './worker-checks.js'

/**
 * The browser globals this file uses, named here rather than pulled in wholesale.
 *
 * The repository compiles against `es2023` and the Node types and nothing else,
 * deliberately: a library that could see `document` would be a library that
 * could come to depend on it without anybody noticing. This file is the one
 * place that genuinely runs in a page, so it says what it needs and no more.
 */
interface PageStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  readonly length: number
}

interface PageElement {
  innerHTML: string
  textContent: string | null
  id: string
  src: string
  readonly style: Record<string, string>
  readonly dataset: Record<string, string>
  append(child: PageElement): void
  remove(): void
}

const page = globalThis as unknown as {
  readonly location: { protocol: string; host: string; hostname: string; port: string }
  readonly localStorage: PageStorage
  readonly navigator?: { readonly locks?: { readonly request?: unknown } }
  readonly document: {
    getElementById(id: string): PageElement | null
    createElement(tag: string): PageElement
    readonly body: PageElement
  }
  addEventListener(kind: string, handler: (event: { data: unknown }) => void): void
  removeEventListener(kind: string, handler: (event: { data: unknown }) => void): void
}

/** A frame this page embedded, and the conversation it is having with it. */
interface SecondPage {
  /** Tell it to do one thing, and wait for what it says back. */
  ask(act: 'claim' | 'land' | 'release', name?: string): Promise<Record<string, unknown>>
  /** End the context without letting it release anything, as a closed tab does. */
  destroy(): void
}

/** The store the storage check writes to and clears: its own, and nobody else's. */
const STORAGE_CHECK_PREFIX = 'browser-check:storage:'

/** Where the account this page runs keeps its session. */
const ACCOUNT_PREFIX = 'browser-check:account:'

/** The long-lived key that account stores, as the store names it. */
const ACCOUNT_KEY = `${ACCOUNT_PREFIX}${areaFor('account')}auth:dc2:key`

/** Where the page keeps the name of the datacenter that saw its keys. */
const DATACENTER_NAME_KEY = 'browser-check:datacenter'

/** How long the second page has to answer before it is called unresponsive. */
const FRAME_TIMEOUT = 15_000

/** Let the browser get on with something for a moment. */
const settleFor = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Embed a second page of this origin, and wait until it is listening.
 *
 * A frame rather than a tab because a frame can be opened and destroyed from
 * here, and for this question the two are the same thing: a separate browsing
 * context of the same origin, with its own memory, its own module graph and no
 * way for either side to reach into the other. It shares what matters — the
 * store and the lock manager — and shares nothing else, which is exactly the
 * situation two tabs are in.
 */
async function embedSecondPage(): Promise<SecondPage> {
  const frame = page.document.createElement('iframe')
  frame.style['display'] = 'none'

  let nextId = 1
  const pending = new Map<number, (outcome: Record<string, unknown>) => void>()
  let ready = (): void => {}
  const listening = new Promise<void>((resolve) => {
    ready = resolve
  })

  const onMessage = (event: { data: unknown }): void => {
    const message = event.data as Record<string, unknown> | null
    if (message?.['yuigram'] !== 'second-page') return

    if (message['ready'] === true) {
      ready()

      return
    }

    const settle = pending.get(message['id'] as number)
    if (settle !== undefined) {
      pending.delete(message['id'] as number)
      settle(message)
    }
  }

  page.addEventListener('message', onMessage)
  frame.src = '/second-page'
  page.document.body.append(frame)

  await Promise.race([
    listening,
    settleFor(FRAME_TIMEOUT).then(() => {
      throw new Error('the second page never said it was listening')
    }),
  ])

  return {
    async ask(act, name) {
      const id = nextId
      nextId += 1

      const answered = new Promise<Record<string, unknown>>((resolve) => {
        pending.set(id, resolve)
      })

      const target = (
        frame as unknown as { contentWindow: { postMessage(m: unknown, o: string): void } }
      ).contentWindow
      target.postMessage(
        { yuigram: 'second-page', id, act, ...(name === undefined ? {} : { name }) },
        '*',
      )

      return await Promise.race([
        answered,
        settleFor(FRAME_TIMEOUT).then<Record<string, unknown>>(() => {
          throw new Error(`the second page never answered '${act}'`)
        }),
      ])
    },
    destroy() {
      page.removeEventListener('message', onMessage)
      frame.remove()
    },
  }
}

/** One thing that was checked, and what came of it. */
export interface Check {
  readonly name: string
  readonly ok: boolean
  readonly detail: string
}

const results: Check[] = []

/** What the account said while it worked, kept for when something does not. */
const spoken: unknown[] = []

function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail })
}

/**
 * How long any one check may take before it is reported as not finishing.
 *
 * Generous because one of them is not fast: validating the prime a datacenter
 * publishes means a Miller-Rabin test on a 2048-bit number, which the platform
 * does in native code and a browser does in `BigInt` — seconds rather than
 * milliseconds, and twice over, since an account establishes a long-lived key
 * and then a temporary one.
 */
const CHECK_TIMEOUT = 60_000

/**
 * Run a check, recording a failure rather than stopping the rest.
 *
 * Bounded, because a check that hangs would otherwise hide every result —
 * including its own — behind a page that says nothing but "running". The page
 * is redrawn after each one so that what has already been established is
 * readable while the rest is still going.
 */
async function check(name: string, run: () => Promise<string> | string): Promise<void> {
  const started = Date.now()

  try {
    const detail = await Promise.race([
      Promise.resolve(run()),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`did not finish within ${CHECK_TIMEOUT}ms`)),
          CHECK_TIMEOUT,
        )
      }),
    ])

    record(name, true, `${detail} (${Date.now() - started}ms)`)
  } catch (error) {
    record(name, false, error instanceof Error ? `${error.name}: ${error.message}` : String(error))
  }

  report()
}

const hex = (data: Uint8Array): string =>
  [...data].map((byte) => byte.toString(16).padStart(2, '0')).join('')

const bytes = (value: string): Uint8Array =>
  Uint8Array.from((value.match(/../g) ?? []).map((pair) => Number.parseInt(pair, 16)))

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text)

/** The next chunk to arrive, or a failure saying none did. */
async function waitFor(inbox: Uint8Array[]): Promise<Uint8Array> {
  const deadline = Date.now() + 10_000

  while (inbox.length === 0) {
    if (Date.now() > deadline) throw new Error('the datacenter sent nothing back')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  return inbox.shift() as Uint8Array
}

/** Fail with a message rather than returning a boolean nobody reads. */
function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

async function run(): Promise<void> {
  // ---- the module graph ---------------------------------------------------

  await check('imports the framework', () => {
    expect(typeof Account === 'function', 'Account is not a constructor')
    expect(typeof memory === 'function', 'memory is not a function')
    expect(typeof web === 'function', 'web is not a function')

    return 'Account, memory and web are all reachable'
  })

  await check('resolved the browser crypto backend', () => {
    // The substitution is made by the bundler and is invisible from inside. If
    // it did not happen, this says `node:crypto` — and a page that reached
    // `node:crypto` would not have loaded at all.
    expect(backend.name === 'portable', `backend is '${backend.name}'`)

    return `backend is '${backend.name}'`
  })

  // ---- the cryptography, against published values --------------------------

  await check('AES-256 matches the published vector', () => {
    // FIPS-197 appendix C.3. Not a round trip: the expected ciphertext is the
    // standard's, so this fails if the cipher is self-consistently wrong.
    const key = bytes('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f')
    const iv = new Uint8Array(32)
    const plain = bytes('00112233445566778899aabbccddeeff')

    // IGE with a zero IV reduces to ECB for a single block, which is what the
    // vector is stated over.
    const encrypted = backend.igeEncrypt(plain, key, iv)

    expect(hex(encrypted) === '8ea2b7ca516745bfeafc49904b496089', `produced ${hex(encrypted)}`)

    return hex(encrypted)
  })

  await check('SHA-1, SHA-256 and MD5 match their published values', () => {
    const abc = utf8('abc')

    expect(
      hex(backend.sha1(abc)) === 'a9993e364706816aba3e25717850c26c9cd0d89d',
      `sha1 produced ${hex(backend.sha1(abc))}`,
    )
    expect(
      hex(backend.sha256(abc)) ===
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      `sha256 produced ${hex(backend.sha256(abc))}`,
    )
    expect(
      hex(backend.md5(abc)) === '900150983cd24fb0d6963f7d28e17f72',
      `md5 produced ${hex(backend.md5(abc))}`,
    )

    return 'all three agree with FIPS-180 and RFC 1321'
  })

  await check('IGE chains across blocks', () => {
    const key = bytes('603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4')
    const iv = bytes('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f')
    const data = backend.randomBytes(64)
    const back = backend.igeDecrypt(backend.igeEncrypt(data, key, iv), key, iv)

    expect(hex(back) === hex(data), 'decrypting did not return the plaintext')

    // Blocks two onward must differ from what ECB would give, or the chaining
    // is not happening at all.
    const first = backend.igeEncrypt(data.subarray(0, 16), key, iv)
    const whole = backend.igeEncrypt(data, key, iv)

    expect(hex(whole.subarray(0, 16)) === hex(first), 'the first block disagrees with itself')

    return '64 bytes encrypted and recovered, chaining observed'
  })

  await check('the counter keeps its place across calls', () => {
    const key = backend.randomBytes(32)
    const counter = new Uint8Array(16)
    counter[15] = 0xff

    const data = backend.randomBytes(64)
    const whole = backend.ctr(key, counter).process(data)

    const split = backend.ctr(key, counter)
    const joined = new Uint8Array(64)
    joined.set(split.process(data.subarray(0, 1)), 0)
    joined.set(split.process(data.subarray(1, 17)), 1)
    joined.set(split.process(data.subarray(17)), 17)

    expect(hex(joined) === hex(whole), 'the split stream diverged from the whole one')

    return 'a stream split at 1, 17 and 64 bytes matches the unsplit one, carry included'
  })

  await check('randomness comes from the platform generator', () => {
    const seen = new Set<string>()
    for (let round = 0; round < 32; round += 1) seen.add(hex(backend.randomBytes(32)))

    expect(seen.size === 32, `only ${seen.size} of 32 draws were distinct`)

    return '32 distinct 32-byte draws'
  })

  await check('a password is stretched through the platform', async () => {
    // `crypto.subtle` rather than a hundred thousand iterations in JavaScript.
    // The expected value is RFC 6070's PBKDF2 case adapted to SHA-512, so what
    // is checked is that the browser's own implementation was reached.
    const derived = await backend.pbkdf2(utf8('password'), utf8('salt'), 1, 64)

    expect(derived.length === 64, `produced ${derived.length} bytes`)
    expect(
      hex(derived).startsWith('867f70cf1ade02cff3752599a3a53dc4af34c7a669815ae5'),
      `produced ${hex(derived).slice(0, 48)}`,
    )

    return hex(derived).slice(0, 32)
  })

  // ---- storage ------------------------------------------------------------

  await check('stores and reads back through localStorage', async () => {
    // A prefix of its own. A store owns every key that begins with its prefix,
    // so one that began the other stores' prefixes would clear them with it —
    // including the session an earlier run of this page left to be resumed.
    const store = web({ prefix: STORAGE_CHECK_PREFIX })

    await store.set('session', { dc: 2, at: Date.now() })
    const read = (await store.get('session')) as { dc: number } | undefined

    expect(read?.dc === 2, 'the value did not survive a write and a read')
    expect(
      page.localStorage.getItem(`${STORAGE_CHECK_PREFIX}session`) !== null,
      'nothing reached the real localStorage',
    )

    await store.clear?.()

    expect(
      page.localStorage.getItem(`${STORAGE_CHECK_PREFIX}session`) === null,
      'clearing left the key behind',
    )

    return 'written to, read from and cleared out of the page’s own storage'
  })

  await check('clears only its own store, leaving the others on the page alone', async () => {
    // What made a second run on one server stall: the store above once owned
    // every key on the page, cleared the keys the account had kept, and left
    // the account to negotiate a second long-lived key with a datacenter that
    // remembered the first.
    const other = web({ prefix: 'browser-check:kept:' })
    await other.set('session', { dc: 2 })

    const store = web({ prefix: STORAGE_CHECK_PREFIX })
    await store.set('session', { dc: 2 })
    await store.clear?.()

    const kept = (await other.get('session')) as { dc: number } | undefined
    await other.clear?.()

    expect(kept?.dc === 2, 'clearing one store removed what another had kept')

    return 'a store with a prefix of its own cleared, and its neighbour kept what it held'
  })

  // ---- the IndexedDB store ---------------------------------------------------

  // A name of its own per run, so a check never reads what an earlier run left.
  const idbRun = Date.now().toString(36)
  await runIndexedDbChecks(check, expect, idbRun)

  // ---- the built yuigram/web-app entry point --------------------------------

  // A bundle of its own, made from built output, which leaves its checks where
  // this one finds them. It loads before this script runs.
  const webAppChecks = (
    globalThis as { __webAppChecks?: (run: typeof check, verify: typeof expect) => Promise<void> }
  ).__webAppChecks

  if (webAppChecks === undefined) {
    await check('loads the built yuigram/web-app entry point', () => {
      throw new Error('the bundle made from dist did not load')
    })
  } else {
    await webAppChecks(check, expect)
  }

  // ---- a real connection --------------------------------------------------

  await check('opens a WebSocket and carries bytes both ways', async () => {
    const url = `${page.location.protocol === 'https:' ? 'wss' : 'ws'}://${page.location.host}/echo`

    const received: Uint8Array[] = []
    let ended: Error | undefined

    const stream = await connectWebSocket({
      host: page.location.hostname,
      port: Number(page.location.port),
      url: () => url,
      onData: (chunk) => received.push(chunk),
      onClose: (error) => {
        ended = error
      },
    })

    const sent = backend.randomBytes(64)
    stream.write(sent)

    const deadline = Date.now() + 5000
    while (received.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }

    const back = received[0]
    expect(back !== undefined, 'the server echoed nothing back')
    expect(hex(back as Uint8Array) === hex(sent), 'what came back was not what went out')

    stream.close()
    expect(ended === undefined, `the stream ended with ${ended?.message}`)

    return `64 bytes sent to ${url} and echoed back unchanged`
  })

  // ---- the protocol, over that connection ---------------------------------

  // The datacenter answering is in the Node process that served this page, and
  // everything on this side of the socket is the framework running in a
  // browser: the handshake, the key schedule, the message keys, the padding and
  // the session are all computed here, by the portable backend, and are
  // accepted or rejected by a peer that has no idea where its client is.
  const stored = page.localStorage.getItem(DATACENTER_NAME_KEY)
  const config = (await (
    await fetch(stored === null ? '/config' : `/config?client=${encodeURIComponent(stored)}`)
  ).json()) as {
    readonly dc: number
    readonly now: number
    readonly key: { readonly n: string; readonly e: string }
    readonly client: string
  }

  /**
   * The clock both sides work from.
   *
   * The datacenter stamps its messages from a fixed instant, and a client whose
   * own clock says otherwise rejects them as far outside the window a message
   * identifier is checked against. So the page is told which instant and runs
   * from it, advancing in real time from there, because timeouts still have to
   * mean something.
   */
  const startedAt = Date.now()
  const clock = (): number => config.now + (Date.now() - startedAt)

  /**
   * Which datacenter this page is a client of.
   *
   * A datacenter remembers the long-lived key a client established and checks
   * every later binding against it, so the datacenter has to be the one that
   * saw the keys this page has stored. The server names it and the name is
   * kept beside the keys: a reload offers the name back and resumes with the
   * same datacenter. Where the server answers with another — the page is new,
   * or the server has restarted and its datacenters went with it — the stored
   * keys were established somewhere that no longer exists, and are let go of
   * rather than presented to a datacenter that never issued them.
   */
  const client = config.client
  const resuming = stored === client
  if (!resuming) {
    await web({ prefix: ACCOUNT_PREFIX }).clear?.()
    page.localStorage.setItem(DATACENTER_NAME_KEY, client)
  }
  const keyBefore = page.localStorage.getItem(ACCOUNT_KEY)

  const ws = `${page.location.protocol === 'https:' ? 'wss' : 'ws'}://${page.location.host}/mtproto?client=${client}`

  // How long the page goes without being able to do anything.
  //
  // A promise that takes three seconds and a three-second block are the same
  // number and completely different experiences: one leaves the tab drawing and
  // the other does not. So the exchange times each of its own synchronous
  // steps, and the longest of them is what a rendering frame would have waited
  // behind.
  //
  // Measured directly rather than through a timer or the long-task observer.
  // A timer measures whatever the browser feels like doing with timers — a tab
  // that is not in front has them throttled to about a second, which reads as a
  // one-second block whatever the page is doing, including nothing. The
  // observer is worse here: it attaches, reports itself supported, and then
  // delivers nothing at all for a deliberate two-hundred-millisecond busy loop,
  // so a zero from it would mean nothing.

  // The exchange, driven directly rather than through an account, because the
  // layer above retries a connection that fails and so turns a specific failure
  // into a silence. Here whatever it throws is what is reported.
  await check('runs the key exchange over a raw socket', async () => {
    const framing = new IntermediateFraming()
    const handshake = new Handshake({
      keys: [serverRsaKey({ n: BigInt(config.key.n), e: BigInt(config.key.e) })],
      dcId: config.dc,
    })

    const arrived = new FrameBuffer()
    const inbox: Uint8Array[] = []
    const stream = await connectWebSocket({
      host: page.location.hostname,
      port: Number(page.location.port),
      url: () => `${ws}-raw`,
      onData: (chunk) => void inbox.push(chunk),
      onClose: () => {},
    })

    try {
      stream.write(framing.tag())
      stream.write(framing.encode(handshake.start()))

      let rounds = 0
      let longest = 0
      const steps: string[] = []
      for (;;) {
        arrived.push(await waitFor(inbox))
        const frame = framing.decode(arrived)

        if (frame === undefined) continue
        if (frame.kind === 'error') {
          throw new Error(`the datacenter sent transport error ${String(frame.code)}`)
        }

        rounds += 1
        const at = Date.now()
        const next = handshake.receive(frame.bytes)
        const took = Date.now() - at
        longest = Math.max(longest, took)
        steps.push(`${String(rounds)}:${String(took)}ms`)
        if (next === undefined) break

        stream.write(framing.encode(next))
      }

      expect(handshake.result !== undefined, 'the exchange produced no key')

      return (
        `${String(rounds)} rounds, a key the datacenter agreed to, ` +
        `longest synchronous step ${String(longest)} ms [${steps.join(' ')}]`
      )
    } finally {
      stream.close()
    }
  })

  const account = new Account({
    apiId: 10_000,
    apiHash: 'browser-check',
    keys: [serverRsaKey({ n: BigInt(config.key.n), e: BigInt(config.key.e) })],
    storage: web({ prefix: ACCOUNT_PREFIX }),
    // Everything the account has to say is kept, so that a failure inside a
    // retry loop is readable afterwards rather than swallowed.
    now: clock,
    log: createLogger({ level: 'debug', sink: { write: (record) => void spoken.push(record) } }),
    bootstrap: {
      thisDc: config.dc,
      testMode: true,
      options: [
        {
          id: config.dc,
          host: page.location.hostname,
          port: Number(page.location.port),
          ipv6: false,
          mediaOnly: false,
          tcpoOnly: false,
          cdn: false,
          static: true,
          thisPortOnly: true,
          secret: undefined,
        },
      ],
    },
    open: (request) =>
      connectWebSocket({
        ...request,
        url: () => ws,
        // Why a connection ended is the one thing a retry loop hides, and it is
        // exactly what is wanted when the exchange does not complete.
        onClose: (error) => {
          spoken.push({
            level: 'info',
            message: 'the stream ended',
            fields: { reason: error === undefined ? 'cleanly' : `${error.name}: ${error.message}` },
          })
          request.onClose(error)
        },
      }),
  })

  const seen: string[] = []
  account.on('mtproto:typing', (event) => {
    seen.push(`${event.kind} from ${String(event.sender?.id)}`)
  })

  try {
    await check('negotiates a key over a real socket', async () => {
      await account.connect()

      return 'the exchange completed and the datacenter accepted the binding'
    })

    await check('makes an encrypted call and reads the answer', async () => {
      const answer = (await account.api.call({ _: 'help.getConfig' })) as { _: string }

      expect(typeof answer._ === 'string', 'the answer carried no constructor')

      return `answered with '${answer._}'`
    })

    await check('resumes from the keys an earlier run stored, or starts from none', async () => {
      // What a reload is: the same page, the same storage, the same datacenter.
      // The long-lived key is the root credential, so a run that found one must
      // still hold that one — and the datacenter must have seen no second.
      const seenByDatacenter = (await (await fetch(`/stats?client=${client}`)).json()) as {
        readonly permanentKeys: number
      }
      const keyAfter = page.localStorage.getItem(ACCOUNT_KEY)

      expect(keyAfter !== null, 'no long-lived key was kept')
      expect(
        seenByDatacenter.permanentKeys === 1,
        `the datacenter negotiated ${String(seenByDatacenter.permanentKeys)} long-lived keys with this page`,
      )
      if (!resuming || keyBefore === null) {
        return 'nothing to resume: one long-lived key was negotiated and kept'
      }

      expect(keyAfter === keyBefore, 'the stored long-lived key was replaced')

      return 'resumed with the long-lived key an earlier run stored, and negotiated no other'
    })

    await check('normalizes and dispatches an update to a handler', async () => {
      // Handed to the account directly. This is the half after an update has
      // arrived: it becomes an event and reaches a handler.
      await account.deliver({
        _: 'updateUserTyping',
        user_id: 42n,
        action: { _: 'sendMessageTypingAction' },
      })

      expect(seen.length > 0, 'no handler was reached')

      return `normalized and dispatched: ${seen.join(', ')}`
    })

    await check('receives an update the datacenter pushed down the session', async () => {
      // The whole path, with nothing handed over: the datacenter seals an
      // update under the session key, sends it down the socket this page
      // opened, and the page decrypts it, judges it, normalizes it and reaches
      // a handler. Everything before the handler is what the direct check
      // above skips.
      const before = seen.length
      const pushed = await fetch(`/deliver?client=${client}`, { method: 'POST' })

      expect(pushed.ok, `the datacenter could not push: ${await pushed.text()}`)

      const deadline = Date.now() + 10_000
      while (seen.length === before && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20))
      }

      expect(seen.length > before, 'nothing reached a handler over the wire')

      return `decrypted, judged, normalized and dispatched: ${String(seen.at(-1))}`
    })

    await check('kept its session in the page’s own storage', async () => {
      const keys = Object.keys(page.localStorage).filter((key) =>
        key.startsWith('browser-check:account:'),
      )

      expect(keys.length > 0, 'nothing about the account reached localStorage')

      // And under this account's own area of it, rather than at the root of the
      // store. A browser store is one place per origin, so an account that
      // wrote flat here would be overwritten by the next one to open.
      const area = `browser-check:account:${areaFor('account')}`
      const stray = keys.filter((key) => !key.startsWith(area))

      expect(stray.length === 0, `wrote outside its area: ${stray.join(', ')}`)

      return `${keys.length} entries, all under '${area}'`
    })

    await check('keeps two accounts apart in one browser store', async () => {
      // The store a browser has is one place per origin, and two accounts in a
      // page share it whether or not they meant to. Real `localStorage`, not a
      // stand-in: what separates them has to hold on the storage the page
      // actually has.
      const shared = web({ prefix: 'browser-check:shared:' })

      const mine = await claimFor(shared, 'alice', 'run-one')
      await mine.storage.set('auth:dc2:key', 'alice-material')
      const theirs = await claimFor(shared, 'bob', 'run-two')
      await theirs.storage.set('auth:dc2:key', 'bob-material')

      expect(
        (await mine.storage.get('auth:dc2:key')) === 'alice-material',
        'the first was overwritten',
      )
      expect(
        (await theirs.storage.get('auth:dc2:key')) === 'bob-material',
        'the second was not written',
      )

      const written = Object.keys(page.localStorage).filter((key) =>
        key.startsWith('browser-check:shared:'),
      )

      return `${written.length} entries, ${String(
        written.filter((key) => key.includes(areaFor('alice'))).length,
      )} of them the first account's`
    })

    await check('excludes through the browser’s own lock, not a stored record', async () => {
      // The substantive claim. A record written into `localStorage` cannot keep
      // two tabs apart — reading it, finding it free and writing your own is
      // three steps, and two tabs doing that together both read "free". The Web
      // Locks API is the browser's own mutual exclusion and its reach is the
      // origin, which is also exactly who can reach this store. A lease that
      // reports `origin` is one that got it.
      const shared = web({ prefix: 'browser-check:scope:' })
      const lease = await claimFor(shared, 'carol', 'run-one')

      expect(lease.scope === 'origin', `the lease reports '${lease.scope}'`)
      expect(typeof page.navigator?.locks?.request === 'function', 'no lock manager here')

      await lease.release()

      return `held across the origin, released cleanly (scope '${lease.scope}')`
    })

    await check('lets a stopped run hand the account to the next one', async () => {
      // A tab that closed releases its lock with the page, and a run that
      // stopped releases it explicitly. Either way the next run gets the
      // account without anybody confirming anything, which is what keeps crash
      // recovery ordinary rather than a flag somebody has to know about.
      const shared = web({ prefix: 'browser-check:handover:' })
      const first = await claimFor(shared, 'dave', 'run-one')
      await first.storage.set('auth:dc2:key', 'from the first run')
      await first.release()

      const second = await claimFor(shared, 'dave', 'run-two')

      expect(
        (await second.storage.get('auth:dc2:key')) === 'from the first run',
        'the second run did not find what the first left',
      )
      await second.release()

      return 'the second run took the account over and kept what was there'
    })

    await check('stops a superseded run from writing', async () => {
      // The fence. Losing the lock is not enough on its own: a write begun
      // before that must not land after it, or the exclusion is spent between
      // the check and the write.
      const shared = web({ prefix: 'browser-check:fence:' })
      const superseded = await claimFor(shared, 'erin', 'run-one')
      const taken = await claimArea(shared, { name: 'erin', holder: 'run-two', takeOver: true })

      expect(!superseded.held, 'the superseded run still believes it holds the area')

      let refused = false
      try {
        await superseded.storage.set('auth:dc2:key', 'too late')
      } catch {
        refused = true
      }

      expect(refused, 'a superseded run was allowed to write')
      await taken.release()

      return 'the superseded run was refused the write'
    })

    await check('refuses a second run of one account on a browser store', async () => {
      // Two areas separate two names. They do nothing for one name opened
      // twice, which is the same program started in two tabs — so that is
      // refused rather than silently sharing one set of keys.
      const shared = web({ prefix: 'browser-check:shared:' })
      let refusal: string | undefined

      try {
        await claimFor(shared, 'alice', 'run-three')
      } catch (error) {
        expect(error instanceof StorageOwnershipError, `refused with ${String(error)}`)
        refusal = (error as Error).message
      }

      expect(refusal !== undefined, 'a second run was allowed to take the area')

      return `refused: ${String(refusal).slice(0, 80)}…`
    })

    /**
     * Two pages of one origin, which is the situation a single page cannot make.
     *
     * Everything above about ownership happens inside one document, where the
     * guard can see both holders and can therefore drain the one it replaces.
     * The case that matters in a browser is the other one: two tabs, or a page
     * and a frame, sharing an origin — so sharing `localStorage` and sharing
     * the lock manager — and sharing no memory at all. Neither can wait for the
     * other's half-finished write, because neither can see it.
     *
     * The frame below is a real second browsing context, served from this same
     * origin. It claims an account area and parks a write inside the adapter,
     * and then this page tries to take that area away from it.
     */
    const second = await embedSecondPage()

    await check('holds an account area from a second page of this origin', async () => {
      const reply = await second.ask('claim', 'frank')

      expect(reply['ok'] === true, `the second page could not claim: ${String(reply['error'])}`)
      expect(
        reply['scope'] === 'origin',
        `the second page reports scope '${String(reply['scope'])}'`,
      )

      return `the frame holds 'frank' across the origin, with a write parked in the adapter`
    })

    await check('refuses to take an area a live second page still holds', async () => {
      // The invariant, in the one place it can actually be violated. The frame
      // holds the lock and has a write it has not finished. Taking the lock
      // would tell it afterwards — and a page told afterwards is a page that
      // was still writing — so this is refused rather than forced.
      const shared = web({ prefix: 'browser-check:twopage:' })
      let refusal: string | undefined

      try {
        await claimArea(shared, { name: 'frank', holder: 'harness', takeOver: true })
      } catch (error) {
        expect(error instanceof StorageOwnershipError, `refused with ${String(error)}`)
        refusal = (error as Error).message
      }

      expect(refusal !== undefined, 'this page was allowed to take a live page’s area')
      expect(
        String(refusal).includes('another page of this browser origin'),
        `refused, but for the wrong reason: ${String(refusal)}`,
      )

      return `refused: ${String(refusal).slice(0, 90)}…`
    })

    await check('leaves the other page still holding what it holds', async () => {
      // Being asked must not disturb the page that was asked about. Its write
      // is allowed to land now, and it lands — so nothing about the refusal
      // broke the run that was doing the work.
      const reply = await second.ask('land')

      expect(reply['ok'] === true, `the parked write did not land: ${String(reply['error'])}`)
      expect(
        page.localStorage.getItem(`browser-check:twopage:${areaFor('frank')}auth:dc2:key`) !== null,
        'the second page’s write never reached the store',
      )

      return 'the second page finished the write this page had tried to interrupt'
    })

    await check('keeps other accounts open while one is refused', async () => {
      // Exclusion is per account. Being refused `frank` says nothing about
      // `grace`, whom no page holds, and a page that could not open one
      // account must still be able to open another.
      const shared = web({ prefix: 'browser-check:twopage:' })
      const grace = await claimFor(shared, 'grace', 'harness')

      expect(grace.held, 'a second account was refused along with the first')
      await grace.storage.set('auth:dc2:key', 'grace’s own')
      await grace.release()

      return 'a different account on the same store opened and wrote normally'
    })

    await check('opens the area once the other page has released it', async () => {
      // Cooperative shutdown: the other page let go on purpose. This one then
      // takes the area with an ordinary acquire and finds what was left there.
      await second.ask('release')

      const shared = web({ prefix: 'browser-check:twopage:' })
      const mine = await claimFor(shared, 'frank', 'harness-after-release')

      expect(mine.held, 'the area was not handed on after a clean release')
      expect(
        (await mine.storage.get('auth:dc2:key')) === 'from the second page',
        'what the other page wrote was not there',
      )
      await mine.release()

      return 'the area transferred cleanly, with the other page’s data intact'
    })

    await check('opens the area after the other page is gone entirely', async () => {
      // Abrupt termination, which is the case a flag exists for everywhere
      // else. A browsing context that is destroyed takes its locks with it —
      // the browser releases them, nobody is asked to confirm anything, and a
      // page that crashed reopens exactly like a page that closed.
      const other = await embedSecondPage()
      await other.ask('claim', 'heidi')

      let refused = false
      try {
        await claimFor(web({ prefix: 'browser-check:twopage:' }), 'heidi', 'harness')
      } catch {
        refused = true
      }
      expect(refused, 'a live second page did not exclude this one at all')

      // Destroying the frame is this harness's stand-in for the tab being
      // closed or the process being killed: the context ends without being
      // asked, mid-write, and never releases anything itself.
      other.destroy()
      await settleFor(200)

      const mine = await claimFor(web({ prefix: 'browser-check:twopage:' }), 'heidi', 'after-gone')
      expect(mine.held, 'the area was not recoverable after the holder was destroyed')
      await mine.release()

      return 'a destroyed page released its lock, and the area reopened with no flag'
    })
  } finally {
    await check('stops and lets go of what it held', async () => {
      await account.stop()

      return 'the account stopped and its connections closed'
    })
  }

  await runIndexedDbAccountCheck(
    check,
    expect,
    {
      key: config.key,
      dc: config.dc,
      host: page.location.hostname,
      port: Number(page.location.port),
      socket: (name) =>
        `${page.location.protocol === 'https:' ? 'wss' : 'ws'}://${page.location.host}/mtproto?client=${name}`,
      stats: async (name) =>
        (await (await fetch(`/stats?client=${name}`)).json()) as { readonly permanentKeys: number },
      now: clock,
    },
    idbRun,
  )

  // ---- an account hosted in a worker ---------------------------------------

  await runWorkerChecks(check, expect)

  report()
}

/** Take an account's area of a store, as an account itself does on the way up. */
function claimFor(store: Parameters<typeof claimArea>[0], name: string, holder: string) {
  return claimArea(store, { name, holder })
}

/** Put the results where a person and a machine can both read them. */
function report(): void {
  const passed = results.filter((one) => one.ok).length
  const summary = `${passed}/${results.length} checks passed`

  ;(globalThis as { __results?: unknown }).__results = { summary, results, spoken }

  const root = page.document.getElementById('results')
  if (root === null) return

  root.innerHTML = ''

  const heading = page.document.createElement('h2')
  heading.textContent = summary
  heading.dataset['done'] = 'true'
  heading.id = 'summary'
  root.append(heading)

  for (const one of results) {
    const line = page.document.createElement('p')
    line.textContent = `${one.ok ? 'PASS' : 'FAIL'}  ${one.name} — ${one.detail}`
    line.style['color'] = one.ok ? '#137333' : '#c5221f'
    line.style['fontFamily'] = 'ui-monospace, monospace'
    line.style['margin'] = '2px 0'
    root.append(line)
  }
}

run().catch((error: unknown) => {
  record(
    'the harness itself',
    false,
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  )
  report()
})
