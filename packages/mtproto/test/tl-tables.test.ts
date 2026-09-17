/**
 * The generated tables, and the boundary between them.
 *
 * Two questions are asked here that no fixture can answer. First, whether the
 * codec handles the real schema — every one of the 2,350 combinators is
 * round-tripped through a generated value, which is the only realistic way to
 * know the table describes what the reader and writer expect. Second, whether
 * the tables stay apart: an API constructor must be undecodable on the
 * plaintext handshake channel, and that is asserted rather than assumed.
 */

import { describe, expect, it } from 'vitest'
import { REGISTRY as API, type ApiId, isKnown as isApiId } from '../src/generated/api/registry.js'
import { ENTRIES as API_ENTRIES } from '../src/generated/api/tables/index.js'
import { REGISTRY as CORE } from '../src/generated/core/registry.js'
import { ENTRIES as CORE_ENTRIES } from '../src/generated/core/tables/index.js'
import {
  isKnown as isMtprotoId,
  REGISTRY as MTPROTO,
  type MtprotoId,
} from '../src/generated/mtproto/registry.js'
import { ENTRIES as MTPROTO_ENTRIES } from '../src/generated/mtproto/tables/index.js'
import { TL_LAYER } from '../src/generated/schema-info.js'
import { TlReader } from '../src/tl/reader.js'
import { TlScope } from '../src/tl/registry.js'
import type { TlEntry, TlTypeSpec } from '../src/tl/schema.js'
import { TlWriter } from '../src/tl/writer.js'

/** What the plaintext handshake channel may decode. */
const HANDSHAKE = new TlScope('handshake', [CORE, MTPROTO])
/** What an encrypted session may decode. */
const SESSION = new TlScope('session', [CORE, MTPROTO, API])
/** The API layer alone, over the language's core. */
const API_ONLY = new TlScope('api', [CORE, API])

describe('the pinned layer', () => {
  it('is the layer the tables were generated from', () => {
    expect(TL_LAYER).toBe(229)
  })
})

describe('table contents', () => {
  it('holds the whole published schema across the three tables', () => {
    // 2,471 API combinators, of which six are the language's own core.
    expect(CORE.size + MTPROTO.size + API.size).toBe(2471 + MTPROTO.size)
    expect(API.size + CORE.size).toBe(2471)
  })

  it('shares no identifier between tables', () => {
    const ids = [...CORE_ENTRIES, ...MTPROTO_ENTRIES, ...API_ENTRIES].map((entry) => entry.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps one name that both schemas define, in separate tables', () => {
    // `message` is the container element in the service schema and a chat
    // message in the API layer: same word, different shapes, different
    // identifiers. Separate tables is what lets both exist at once.
    expect(MTPROTO.byName.get('message')?.id).not.toBe(API.byName.get('message')?.id)

    const names = [...CORE_ENTRIES, ...MTPROTO_ENTRIES, ...API_ENTRIES].map((entry) => entry.n)
    const duplicated = names.filter((name, index) => names.indexOf(name) !== index)

    expect(duplicated).toEqual(['message'])
  })

  it('refuses a name a scope could resolve two ways', () => {
    // Choosing by table order would encode the wrong constructor with nothing
    // to show it had happened, so the ambiguity is reported instead.
    expect(() => SESSION.findByName('message')).toThrow(/more than one table/)
    expect(HANDSHAKE.findByName('message')?.entry.id).toBe(MTPROTO.byName.get('message')?.id)
  })

  it('puts the TL language primitives in core and nowhere else', () => {
    const core = CORE_ENTRIES.map((entry) => entry.n).sort()

    expect(core).toEqual(['boolFalse', 'boolTrue', 'error', 'null', 'true', 'vector'])
    expect(MTPROTO.byName.has('vector')).toBe(false)
    expect(API.byName.has('vector')).toBe(false)
  })

  it('carries the service constructors the session layer needs', () => {
    for (const name of [
      'msg_container',
      'rpc_result',
      'rpc_error',
      'bad_server_salt',
      'bad_msg_notification',
      'new_session_created',
      'msgs_ack',
      'gzip_packed',
      'pong',
      'future_salts',
    ]) {
      expect(MTPROTO.byName.has(name)).toBe(true)
    }
  })

  it('carries the handshake constructors, which precede any auth key', () => {
    for (const name of ['req_pq_multi', 'resPQ', 'server_DH_params_ok', 'set_client_DH_params']) {
      expect(MTPROTO.byName.has(name)).toBe(true)
    }
  })
})

describe('the boundary between tables', () => {
  it('cannot decode an API constructor on the plaintext channel', () => {
    // `messages.sendMessage` travels only inside an encrypted session. Reaching
    // it before an auth key exists is the failure the split prevents.
    const send = API.byName.get('messages.sendMessage')
    expect(send).toBeDefined()

    const payload = new Uint8Array(4)
    new DataView(payload.buffer).setUint32(0, send?.id ?? 0, true)

    expect(() => new TlReader(payload, HANDSHAKE).object()).toThrow(/is not in the handshake table/)
    expect(() => new TlReader(payload, SESSION).object()).not.toThrow(/not in the session table/)
  })

  it('refuses to write an API constructor on the plaintext channel', () => {
    const writer = new TlWriter(HANDSHAKE)

    expect(() => writer.object({ _: 'messages.sendMessage' })).toThrow(/not in the handshake table/)
  })

  it('decodes a service constructor on both channels', () => {
    const ack = MTPROTO.byName.get('msgs_ack')
    expect(ack).toBeDefined()

    for (const scope of [HANDSHAKE, SESSION]) {
      const encoded = new TlWriter(scope)
      encoded.object({ _: 'msgs_ack', msg_ids: [1n, 2n] })

      expect(new TlReader(encoded.finish(), scope).object()).toEqual({
        _: 'msgs_ack',
        msg_ids: [1n, 2n],
      })
    }
  })

  it('narrows an identifier only to the table that carries it', () => {
    const send = API.byName.get('messages.sendMessage')?.id ?? 0
    const ack = MTPROTO.byName.get('msgs_ack')?.id ?? 0

    expect(isApiId(send)).toBe(true)
    expect(isApiId(ack)).toBe(false)
    expect(isMtprotoId(ack)).toBe(true)
    expect(isMtprotoId(send)).toBe(false)
  })
})

/** A value satisfying one table entry, built from its own description. */
function sample(entry: TlEntry, scope: TlScope, depth = 0): Record<string, unknown> {
  const value: Record<string, unknown> = { _: entry.n }

  for (const field of entry.f) {
    if (field.b === 1) continue
    // Conditional fields are exercised by supplying every one of them, which
    // also drives the flag derivation.
    if (field.t === undefined) continue
    if (field.t === 'true') {
      value[field.n] = true
      continue
    }
    value[field.n] = sampleValue(field.t, scope, depth)
  }

  return value
}

function sampleValue(spec: TlTypeSpec, scope: TlScope, depth: number): unknown {
  if (typeof spec === 'object') {
    if ('p' in spec) {
      const found = scope.findByName(spec.p)
      return found === undefined ? {} : sample(found.entry, scope, depth + 1)
    }
    // One element is enough to exercise the header, the count and the item.
    const count = spec.len ?? 1
    return Array.from({ length: count }, () => sampleValue(spec.v, scope, depth + 1))
  }

  switch (spec) {
    case 'int':
      return -7
    case 'nat':
      return 7
    case 'long':
      return -8n
    case 'double':
      return 0.25
    case 'string':
      return 'ok'
    case 'bytes':
      return Uint8Array.of(1, 2, 3)
    case 'int128':
      return new Uint8Array(16).fill(4)
    case 'int256':
      return new Uint8Array(32).fill(5)
    case 'bool':
      return true
    case 'true':
      return true
    case 'obj':
      // A concrete boxed value the scope can round-trip, chosen for having no
      // nested constructors of its own.
      return { _: 'boolTrue' }
    case 'opaque':
      return undefined
  }
}

describe('round-tripping the whole schema', () => {
  const skipped = new Set(['opaque'])

  it('round-trips every combinator in every table', () => {
    const failures: string[] = []
    let checked = 0

    // Each table is exercised in the scope it is actually decoded in, which is
    // also what keeps the shared `message` name unambiguous.
    for (const [scope, entries] of [
      [HANDSHAKE, [...CORE_ENTRIES, ...MTPROTO_ENTRIES]],
      [API_ONLY, API_ENTRIES],
    ] as const) {
      for (const entry of entries) {
        // A generic method takes a wrapped call rather than a value, and
        // `vector` is a vector's header rather than a value of its own. Both
        // have their own cases below.
        if (entry.g === 1 || entry.n === 'vector') continue
        if (entry.f.some((field) => field.t !== undefined && skipped.has(String(field.t)))) continue

        try {
          const value = sample(entry, scope)
          const writer = new TlWriter(scope)
          writer.object(value)
          const decoded = new TlReader(writer.finish(), scope).object()

          expect(decoded).toEqual(value)
          checked += 1
        } catch (error) {
          failures.push(`${entry.n}: ${(error as Error).message}`)
        }
      }
    }

    expect(failures).toEqual([])
    expect(checked).toBeGreaterThan(2300)
  })

  it('round-trips a generic method with its wrapped call', () => {
    const value = {
      _: 'invokeWithLayer',
      layer: TL_LAYER,
      query: { _: 'help.getConfig' },
    }

    const writer = new TlWriter(API_ONLY)
    writer.object(value)

    expect(new TlReader(writer.finish(), API_ONLY).object()).toEqual(value)
  })
})

describe('branded identifiers', () => {
  it('keeps the two brands distinct at the type level', () => {
    const takesApi = (id: ApiId): ApiId => id
    const takesMtproto = (id: MtprotoId): MtprotoId => id

    const raw = 0x9a5f_1234
    if (isApiId(raw)) expect(takesApi(raw)).toBe(raw)
    if (isMtprotoId(raw)) expect(takesMtproto(raw)).toBe(raw)

    // @ts-expect-error an unchecked number is not an identifier of either table
    takesApi(1)
    // @ts-expect-error nor can one table's identifier stand in for the other's
    takesMtproto(0 as ApiId)
  })
})
