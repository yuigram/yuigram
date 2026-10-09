// SPDX-License-Identifier: MPL-2.0

/**
 * MTProto secrets must not be reachable from any public object.
 *
 * An account holds more than a bot does, and worse: `security.md` §1 rates the
 * authorization key and the session string that carries it as critical — full
 * account takeover, no password needed, and possibly invisible to the person it
 * happened to — with the `api_hash`, login codes and the two-factor password
 * beside them. §2 asks for the property rather than the discipline: secrets are
 * held where `JSON.stringify` and console inspection cannot reach them, so a
 * crash reporter serializing "the whole client" finds nothing.
 *
 * These are the same checks the Bot API keeps over its token, against the
 * objects an account hands out.
 */

import { describe, expect, it } from 'vitest'
import { Account } from '../src/account.js'
import type { DcConfiguration } from '../src/network/dc.js'
import { contextFor } from '../src/normalize/context.js'
import { normalizeUpdate } from '../src/normalize/normalize.js'
import type { TlValue } from '../src/tl/index.js'

const API_HASH = 'TEST_API_HASH_NOT_A_REAL_CREDENTIAL'
const SECRET = 'TEST_API_HASH'

const BOOTSTRAP: DcConfiguration = {
  thisDc: 2,
  testMode: true,
  options: [
    {
      id: 2,
      host: '10.0.0.2',
      port: 443,
      ipv6: false,
      mediaOnly: false,
      cdn: false,
      secret: undefined,
      tcpoOnly: false,
      thisPortOnly: false,
      static: false,
    },
  ],
}

/** An account holding a credential, reaching nothing. */
function account(): Account {
  return new Account({
    apiId: 1234,
    apiHash: API_HASH,
    keys: [],
    bootstrap: BOOTSTRAP,
    storage: {
      get: async () => undefined,
      set: async () => {},
      delete: async () => {},
    },
    name: 'me',
  })
}

/** Every string reachable by walking an object, to a bounded depth. */
function reachable(value: unknown, depth = 0, seen = new WeakSet<object>()): string[] {
  if (depth > 6) return []
  if (typeof value === 'string') return [value]
  if (typeof value === 'function') return [String(value)]
  if (value === null || typeof value !== 'object') return []
  if (seen.has(value)) return []
  seen.add(value)

  return Object.values(value).flatMap((item) => reachable(item, depth + 1, seen))
}

/** An update, so a context can be built without a network. */
const update = (): TlValue => ({
  _: 'updateNewMessage',
  message: {
    _: 'message',
    id: 7,
    peer_id: { _: 'peerUser', user_id: 5n },
    from_id: { _: 'peerUser', user_id: 5n },
    date: 1_700_000_000,
    message: 'hello',
  },
  pts: 1,
  pts_count: 1,
})

/** A context built for reading, which is what a handler is handed. */
function context() {
  const log = {
    debug() {},
    info() {},
    warn() {},
    error() {},
    child: () => log,
    isEnabled: () => true,
  }

  return contextFor(normalizeUpdate(update()), { client: { name: 'me' }, log: log as never })
}

describe('the walk these cases are made of', () => {
  it('finds a secret that is genuinely reachable', () => {
    // The control every case below rests on. "Not found" is the same answer a
    // broken search gives, so the search is shown to work against something
    // that is deliberately in reach.
    const planted = { client: { credentials: { apiHash: API_HASH } } }

    expect(reachable(planted).join('\n')).toContain(SECRET)
  })

  it('reads a credential written into a function, and not one merely captured', () => {
    // Worth stating outright, because it bounds what the cases below prove.
    // Functions are stringified, so a credential in the source of one is found.
    // One a closure captured is not: the language does not expose it, and
    // nothing walking an object can. What holds the line there is that the
    // closures an account hands out are given the account rather than its
    // secret, which the serialization checks below are what actually test.
    const written = () => 'TEST_API_HASH_NOT_A_REAL_CREDENTIAL'
    const captured = () => API_HASH

    expect(reachable({ written }).join('\n')).toContain(SECRET)
    expect(reachable({ captured }).join('\n')).not.toContain(SECRET)
  })
})

describe('the application secret an account is built with', () => {
  it('is not reachable by walking the account', () => {
    expect(reachable(account()).join('\n')).not.toContain(SECRET)
  })

  it('does not survive JSON.stringify of the account', () => {
    expect(JSON.stringify(account())).not.toContain(SECRET)
  })

  it('does not survive being inspected as a plain object', () => {
    // What a console, a crash reporter or a structured logger does to something
    // it was handed and told to describe.
    const me = account()

    expect(JSON.stringify(Object.entries(me))).not.toContain(SECRET)
    expect(Object.keys(me)).not.toContain('apiHash')
    expect(String(me)).not.toContain(SECRET)
  })

  it('is not reachable through the surfaces the account hands out', () => {
    // Each of these is a public member a handler is encouraged to use, and each
    // closes over the account. A closure that carried the credential into one
    // of them would put it back within reach.
    const me = account()

    for (const surface of [me.api, me.reach, me.peers]) {
      expect(reachable(surface).join('\n')).not.toContain(SECRET)
    }
  })
})

describe('a context handed to a handler', () => {
  it('carries no application secret', () => {
    expect(reachable(context()).join('\n')).not.toContain(SECRET)
  })

  it('does not survive being serialized whole', () => {
    // The most common accidental leak is logging "the whole event". Here it
    // cannot even be attempted: an update names peers and identifiers with
    // 64-bit integers, which `JSON.stringify` refuses outright. That is not the
    // protection — the protection is that there is nothing to find — but it
    // does mean a crash reporter reaching for the easy path gets an error
    // rather than a payload.
    const event = context()
    const serialized = (() => {
      try {
        return JSON.stringify(event)
      } catch {
        return undefined
      }
    })()

    expect(serialized ?? '').not.toContain(SECRET)
  })

  it('names the client without carrying it', () => {
    // A context says which client it arrived on so a handler installed across
    // several can tell them apart. Carrying the client itself would put the
    // credential one property away from every handler.
    const event = context()

    expect(event.client.name).toBe('me')
    expect(Object.keys(event.client)).toEqual(['name'])
  })
})

describe('a session string', () => {
  it('is not echoed by the error that refuses it', async () => {
    // A malformed session is refused by name and shape. Repeating it in the
    // message would put a live credential into whatever caught the error —
    // `security.md` §2's last point, which is where secrets usually escape.
    const carried = 'BQTEST_SESSION_STRING_THAT_IS_NOT_VALID_00000000'

    const refusal = await Promise.resolve()
      .then(() => Account.fromString(carried, { apiId: 1, apiHash: API_HASH, ...rest() }))
      .catch((error: unknown) => error)

    expect(refusal).toBeInstanceOf(Error)
    expect((refusal as Error).message).not.toContain(carried)
    expect((refusal as Error).message).not.toContain(SECRET)
  })
})

/** The rest of what building an account needs, with nothing sensitive in it. */
function rest() {
  return {
    keys: [],
    bootstrap: BOOTSTRAP,
    storage: {
      get: async () => undefined,
      set: async () => {},
      delete: async () => {},
    },
  }
}
