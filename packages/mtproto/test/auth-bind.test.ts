// SPDX-License-Identifier: MIT

/**
 * Vouching for a temporary key with a permanent one.
 *
 * The construction is the one place this subsystem uses the older key schedule,
 * and it is verified by a peer that checks it the way the far end does rather
 * than by reproducing how it was built: an oracle that mirrored the builder
 * would accept whatever the builder produced, including a wrong binding, and a
 * server's answer to a wrong one is a refusal that names nothing.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { bindTemporaryKey } from '../src/auth/bind.js'
import { REGISTRY as API } from '../src/generated/api/registry.js'
import { REGISTRY as CORE } from '../src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../src/generated/mtproto/registry.js'
import { AuthKey } from '../src/message/auth-key.js'
import { createRegistry, readObject, TlScope, type TlValue } from '../src/tl/index.js'
import { BindingRejected, openBinding } from './server/bind.js'

const SCOPE = new TlScope('bind', [CORE, MTPROTO, API])

const SESSION = 0x0102_0304_0506_0708n
const MSG_ID = 0x6553_f100_0000_0010n
const EXPIRES_AT = 1_700_003_600

/** Key material that differs in every byte from the next seed's. */
function material(seed: number): Uint8Array {
  return Uint8Array.from({ length: 256 }, (_, index) => (seed * 101 + index * 7 + 3) & 0xff)
}

function keys(): { permanent: AuthKey; temporary: AuthKey; permanentBytes: Uint8Array } {
  const permanentBytes = material(1)

  return {
    permanent: AuthKey.from(permanentBytes),
    temporary: AuthKey.from(material(2)),
    permanentBytes,
  }
}

/** Randomness a test can predict, distinct per draw. */
function scripted(seed = 5): (length: number) => Uint8Array {
  let draw = 0
  return (length) => {
    const value = draw
    draw += 1
    return Uint8Array.from(
      { length },
      (_, index) => (seed * 31 + value * 17 + index * 3 + 1) & 0xff,
    )
  }
}

/** Build a request with everything defaulted to something valid. */
function build(overrides: Record<string, unknown> = {}) {
  const { permanent, temporary, permanentBytes } = keys()
  const request = bindTemporaryKey({
    permanent,
    temporary,
    sessionId: SESSION,
    msgId: MSG_ID,
    expiresAt: EXPIRES_AT,
    scope: SCOPE,
    random: scripted(),
    ...overrides,
  })

  return { request, permanent, temporary, permanentBytes }
}

/** The decoded query, and the binding a peer reads out of it. */
function opened(overrides: Record<string, unknown> = {}) {
  const { request, permanent, temporary, permanentBytes } = build(overrides)
  const query = readObject(request.body, SCOPE) as TlValue
  const encrypted = query['encrypted_message'] as Uint8Array

  return {
    request,
    query,
    permanent,
    temporary,
    binding: openBinding(encrypted, permanentBytes),
  }
}

describe('the request', () => {
  it('is an auth.bindTempAuthKey the codec reads back', () => {
    const { query } = opened()

    expect(query._).toBe('auth.bindTempAuthKey')
    expect(query['expires_at']).toBe(EXPIRES_AT)
  })

  it('names the permanent key it is bound to', () => {
    const { query, permanent } = opened()
    const expected = new DataView(permanent.id.buffer, permanent.id.byteOffset, 8).getBigInt64(
      0,
      true,
    )

    expect(query['perm_auth_key_id']).toBe(expected)
  })

  it('repeats the nonce the binding carries', () => {
    const { request, query, binding } = opened()

    // The server compares the two. A mismatch is refused without saying which
    // half was wrong, so they are built from one value rather than two.
    expect(query['nonce']).toBe(request.nonce)
    expect(binding.nonce).toBe(request.nonce)
  })

  it('repeats the expiry the binding carries', () => {
    const { query, binding } = opened()

    expect(query['expires_at']).toBe(binding.expiresAt)
  })
})

describe('the binding a peer reads', () => {
  it('names both keys', () => {
    const { binding, permanent, temporary } = opened()
    const idOf = (key: AuthKey) =>
      new DataView(key.id.buffer, key.id.byteOffset, 8).getBigInt64(0, true)

    expect(binding.permAuthKeyId).toBe(idOf(permanent))
    expect(binding.tempAuthKeyId).toBe(idOf(temporary))
  })

  it('names the session the request will be sent in', () => {
    expect(opened().binding.tempSessionId).toBe(SESSION)
  })

  it('names the identifier the request will be sent under', () => {
    // The protocol requires the two to be the same, which is why the identifier
    // is supplied rather than drawn: it has to exist before either is built.
    expect(opened().binding.msgId).toBe(MSG_ID)
  })

  it('carries a sequence number of zero, being part of no sequence', () => {
    expect(opened().binding.seqNo).toBe(0)
  })

  it('states the expiry the temporary key was given', () => {
    expect(opened().binding.expiresAt).toBe(EXPIRES_AT)
  })

  it('is a whole number of blocks once encrypted', () => {
    const { query } = opened()
    const encrypted = query['encrypted_message'] as Uint8Array

    // Eight bytes of key identifier, sixteen of message key, then blocks.
    expect((encrypted.length - 24) % 16).toBe(0)
    expect(encrypted.length).toBe(24 + 80)
  })
})

describe('a binding a peer would refuse', () => {
  it('is refused when the encrypted message was tampered with', () => {
    const { query, permanentBytes } = { ...opened(), permanentBytes: material(1) }
    const encrypted = Uint8Array.from(query['encrypted_message'] as Uint8Array)
    const at = encrypted.length - 1
    encrypted[at] = (encrypted[at] ?? 0) ^ 0xff

    expect(() => openBinding(encrypted, permanentBytes)).toThrow(BindingRejected)
  })

  it('is refused when opened with a key it was not sealed under', () => {
    const { query } = opened()
    const encrypted = query['encrypted_message'] as Uint8Array

    // The identifier in the clear no longer matches, which is the first thing
    // the far end checks and the reason it can answer at all.
    expect(() => openBinding(encrypted, material(9))).toThrow(/different permanent key/)
  })

  it('is refused when the message key does not cover what arrived', () => {
    const { query, permanentBytes } = { ...opened(), permanentBytes: material(1) }
    const encrypted = Uint8Array.from(query['encrypted_message'] as Uint8Array)
    // Corrupt the message key rather than the body: the identifier still
    // matches, so the refusal has to come from the integrity check.
    encrypted[10] = (encrypted[10] ?? 0) ^ 0x01

    expect(() => openBinding(encrypted, permanentBytes)).toThrow(BindingRejected)
  })

  it('is refused when it is not a whole message', () => {
    expect(() => openBinding(new Uint8Array(30), material(1))).toThrow(/whole message/)
  })
})

describe('what will not be built', () => {
  it('refuses to bind a key to itself', () => {
    const { permanent } = keys()

    // The server would accept it, and the connection would then be encrypting
    // traffic under the permanent key — the one thing forward secrecy exists to
    // prevent, and nothing later would notice.
    expect(() =>
      bindTemporaryKey({
        permanent,
        temporary: permanent,
        sessionId: SESSION,
        msgId: MSG_ID,
        expiresAt: EXPIRES_AT,
        scope: SCOPE,
      }),
    ).toThrow(/cannot be bound to itself/)
  })

  it('refuses with the error the rest of the framework raises', () => {
    // A caller catching a bad argument here catches it the same way it does
    // anywhere else, rather than learning a type specific to this construction.
    expect(() => build({ expiresAt: 0 })).toThrow(ValidationError)
  })

  it('refuses an expiry that is not a Unix second', () => {
    expect(() => build({ expiresAt: 0 })).toThrow(/must be a Unix second/)
    expect(() => build({ expiresAt: -1 })).toThrow(/must be a Unix second/)
    expect(() => build({ expiresAt: 1.5 })).toThrow(/must be a Unix second/)
  })

  it('refuses an expiry the field could not carry', () => {
    expect(() => build({ expiresAt: 2 ** 31 })).toThrow(/does not fit/)
    expect(() => build({ expiresAt: 2 ** 31 - 1 })).not.toThrow()
  })

  it('refuses an identifier this end could not have produced', () => {
    // Client identifiers are divisible by four. One that is not belongs to the
    // far end, and the binding would name a message that cannot be sent.
    expect(() => build({ msgId: MSG_ID + 1n })).toThrow(/not an identifier this end produces/)
    expect(() => build({ msgId: MSG_ID + 3n })).toThrow(/not an identifier this end produces/)
    expect(() => build({ msgId: 0n })).toThrow(/not an identifier this end produces/)
  })

  it('accepts an identifier past the point they turn negative', () => {
    // Identifiers are carried signed and wrap in 2038. Judging them signed
    // would refuse every binding from that day on.
    expect(() => build({ msgId: -16n })).not.toThrow()
  })

  it('refuses a randomness source that supplies the wrong amount', () => {
    expect(() => build({ random: () => new Uint8Array(3) })).toThrow(/random bytes/)
  })

  it('refuses a binding message that is not the size the protocol states', () => {
    // The size is fixed by the schema, so this can only differ if the table
    // this end encodes with has drifted from the one the far end parses with.
    // The length travels in the header, so the far end would not report a
    // wrong binding — it would read the bytes after it as something else.
    const drifted = createRegistry([
      {
        id: 0x75a3_f765,
        n: 'bind_auth_key_inner',
        f: [
          { n: 'nonce', t: 'long' },
          { n: 'temp_auth_key_id', t: 'long' },
          { n: 'perm_auth_key_id', t: 'long' },
          { n: 'temp_session_id', t: 'long' },
          // Widened to eight bytes, as a schema change could widen it, while
          // still accepting the same value so the writer itself has nothing to
          // object to — leaving only the size to catch it.
          { n: 'expires_at', t: 'double' },
        ],
      },
    ])

    expect(() => build({ scope: new TlScope('drifted', [CORE, drifted, API]) })).toThrow(
      /must be 40 bytes, built 44/,
    )
  })
})

describe('the material that goes into it', () => {
  it('draws a fresh nonce and fresh filler for each binding', () => {
    const first = build()
    const second = build({ random: scripted(77) })

    expect(first.request.nonce).not.toBe(second.request.nonce)
    expect(first.request.body).not.toEqual(second.request.body)
  })

  it('produces the same request from the same inputs', () => {
    // Deterministic given its randomness, which is what makes the construction
    // testable at all — nothing else about it is observable.
    expect(build().request.body).toEqual(build().request.body)
  })

  it('does not put the permanent key anywhere in the request', () => {
    const { request, permanentBytes } = build()
    const haystack = Buffer.from(request.body).toString('hex')

    for (let at = 0; at + 16 <= permanentBytes.length; at += 16) {
      expect(haystack).not.toContain(
        Buffer.from(permanentBytes.subarray(at, at + 16)).toString('hex'),
      )
    }
  })
})
