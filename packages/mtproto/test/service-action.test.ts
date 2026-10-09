// SPDX-License-Identifier: MIT

/**
 * Reading what a service message says happened.
 *
 * Two kinds of evidence. Every action constructor in the pinned schema is read
 * from a value built from its own description, with a different value in every
 * field, and the reading must carry each of those values somewhere outside
 * `raw` — a field the reader forgot would be a value nobody sees. Then the
 * readings a caller depends on are pinned by hand: which kind, which peer kind,
 * which derived answer. Last, the reading reaches a handler through dispatch,
 * narrowed by `f.action`, from an update an account actually received.
 */

import { createLogger } from '@yuigram/core'
import { describe, expect, it, vi } from 'vitest'
import { readAction, type ServiceAction } from '../src/entities/action.js'
import { MessageView } from '../src/entities/message.js'
import { f } from '../src/filters/index.js'
import { ENTRIES as API_ENTRIES } from '../src/generated/api/tables/index.js'
import type { TypeMessageAction } from '../src/generated/api/types/index.js'
import { mtprotoContext } from '../src/normalize/context.js'
import type { TlEntry, TlTypeSpec } from '../src/tl/schema.js'

const log = createLogger({ level: 'silent' })

/**
 * A value for one constructor with a different value in every field.
 *
 * Numbers, identifiers and strings are counted up, so each can be looked for
 * in the reading by itself. Flags are all set, so every conditional field is
 * present. The tables say only `obj` for a boxed field, so one is given what
 * its name says it holds — a peer, formatted text, a reason — and anything
 * else an object marked with a number of its own, which the reading must pass
 * on as it is.
 */
function sampler() {
  let next = 1000
  const peer = () => ({ _: 'peerUser', user_id: BigInt(next++) })
  const boxed = (action: string, field: string): unknown => {
    if (['from_id', 'to_id', 'peer', 'boost_peer'].includes(field)) return peer()
    if (field === 'message') return { _: 'textWithEntities', text: `t${next++}`, entities: [] }
    if (field === 'reason') return { _: 'phoneCallDiscardReasonMissed' }
    if (field === 'birthday') return { _: 'birthday', day: next++, month: next++, year: next++ }
    if (field === 'peers' && action === 'messageActionRequestedPeerSentMe') {
      return {
        _: 'requestedPeerUser',
        user_id: BigInt(next++),
        first_name: `f${next++}`,
        last_name: `l${next++}`,
        username: `u${next++}`,
      }
    }
    if (field === 'peers' || field === 'other_participants') return peer()
    return { _: 'sample', marker: next++ }
  }
  const value = (action: string, field: string, spec: TlTypeSpec): unknown => {
    if (typeof spec === 'object') {
      return 'v' in spec ? [value(action, field, spec.v)] : boxed(action, field)
    }
    switch (spec) {
      case 'int':
      case 'nat':
        return next++
      case 'long':
        return BigInt(next++)
      case 'double':
        return next++ + 0.5
      case 'string':
        return `s${next++}`
      case 'bytes':
        return Uint8Array.of(next++ % 256)
      case 'bool':
        return true
      case 'obj':
        return boxed(action, field)
      default:
        return undefined
    }
  }
  return (entry: TlEntry): Record<string, unknown> => {
    const built: Record<string, unknown> = { _: entry.n }
    for (const field of entry.f) {
      if (field.b === 1 || field.t === undefined) continue
      built[field.n] = field.t === 'true' ? true : value(entry.n, field.n, field.t)
    }
    return built
  }
}

/** Every number, identifier and string anywhere inside a value, constructor names aside. */
function leaves(value: unknown, into = new Set<unknown>()): Set<unknown> {
  if (typeof value === 'bigint' || typeof value === 'number') into.add(value)
  else if (typeof value === 'string') into.add(value)
  else if (value instanceof Uint8Array) into.add(value)
  else if (Array.isArray(value)) for (const item of value) leaves(item, into)
  else if (value !== null && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) if (key !== '_') leaves(inner, into)
  }
  return into
}

/** How many flags a value sets, at its top level. */
const flagsSet = (entry: TlEntry, value: Record<string, unknown>) =>
  entry.f.filter((field) => field.t === 'true' && value[field.n] === true).length

const ACTIONS = API_ENTRIES.filter(
  (entry) => entry.n.startsWith('messageAction') && entry.n !== 'messageActionEmpty',
)

describe('every action in the schema', () => {
  it('has a reading of its own', () => {
    // Layer 229: sixty-eight actions besides the empty one.
    expect(ACTIONS).toHaveLength(68)
    const unread = ACTIONS.filter(
      (entry) =>
        readAction(sampler()(entry) as unknown as TypeMessageAction)?.kind === 'unsupported',
    ).map((entry) => entry.n)

    expect(unread).toEqual([])
  })

  it('carries every value the constructor held into the reading, outside `raw`', () => {
    const lost: string[] = []
    const kinds = new Set<string>()

    for (const entry of ACTIONS) {
      const value = sampler()(entry)
      const read = readAction(value as unknown as TypeMessageAction) as ServiceAction
      const { raw, ...reading } = read as ServiceAction & Record<string, unknown>
      kinds.add(read.kind)

      expect(raw).toBe(value)
      const found = leaves(reading)
      for (const leaf of leaves(value)) {
        if (!found.has(leaf)) lost.push(`${entry.n}: ${String(leaf)}`)
      }
      const flags = flagsSet(entry, value)
      const trues = Object.values(reading).filter((one) => one === true).length
      if (trues < flags) lost.push(`${entry.n}: ${flags - trues} flag(s)`)
    }

    expect(lost).toEqual([])
    // One name per constructor: no two actions read as the same thing.
    expect(kinds.size).toBe(ACTIONS.length)
  })
})

describe('what a reading says', () => {
  it('names each peer as the kind of peer it is', () => {
    expect(readAction({ _: 'messageActionChatDeleteUser', user_id: 5n })).toMatchObject({
      kind: 'member-removed',
      user: { kind: 'user', id: 5n },
    })
    expect(readAction({ _: 'messageActionChatMigrateTo', channel_id: 7n })).toMatchObject({
      kind: 'migrated-to',
      channel: { kind: 'channel', id: 7n },
    })
    expect(
      readAction({ _: 'messageActionChannelMigrateFrom', title: 'old', chat_id: 3n }),
    ).toMatchObject({ kind: 'migrated-from', chat: { kind: 'chat', id: 3n } })
    expect(
      readAction({
        _: 'messageActionGeoProximityReached',
        from_id: { _: 'peerUser', user_id: 1n },
        to_id: { _: 'peerChannel', channel_id: 2n },
        distance: 50,
      }),
    ).toMatchObject({
      from: { kind: 'user', id: 1n },
      to: { kind: 'channel', id: 2n },
      distance: 50,
    })
    expect(readAction({ _: 'messageActionChatAddUser', users: [1n, 2n] })).toMatchObject({
      kind: 'members-added',
      users: [
        { kind: 'user', id: 1n },
        { kind: 'user', id: 2n },
      ],
    })
  })

  it('says why a call ended, and whether it was missed', () => {
    const call = (reason?: Extract<TypeMessageAction, { _: 'messageActionPhoneCall' }>['reason']) =>
      readAction({
        _: 'messageActionPhoneCall',
        call_id: 1n,
        ...(reason === undefined ? {} : { reason }),
      })

    expect(call({ _: 'phoneCallDiscardReasonMissed' })).toMatchObject({
      reason: 'missed',
      missed: true,
      video: false,
    })
    expect(call({ _: 'phoneCallDiscardReasonHangup' })).toMatchObject({
      reason: 'hung-up',
      missed: false,
    })
    expect(call({ _: 'phoneCallDiscardReasonBusy' })).toMatchObject({ reason: 'busy' })
    expect(call({ _: 'phoneCallDiscardReasonDisconnect' })).toMatchObject({
      reason: 'disconnected',
    })
    expect(call()).toMatchObject({ reason: undefined, missed: false })
  })

  it('tells a group call starting from one ending', () => {
    const call = { _: 'inputGroupCall', id: 1n, access_hash: 2n } as const
    expect(readAction({ _: 'messageActionGroupCall', call })).toMatchObject({ ended: false })
    expect(readAction({ _: 'messageActionGroupCall', call, duration: 60 })).toMatchObject({
      ended: true,
      duration: 60,
    })
  })

  it('gives a gift’s note as formatted text, and its sender and recipient as peers', () => {
    const read = readAction({
      _: 'messageActionStarGift',
      gift: { _: 'starGift', id: 1n } as never,
      message: {
        _: 'textWithEntities',
        text: 'for you',
        entities: [{ _: 'messageEntityBold', offset: 0, length: 3 }],
      },
      from_id: { _: 'peerUser', user_id: 9n },
      name_hidden: true,
    })

    expect(read).toMatchObject({
      kind: 'gift-received',
      message: { text: 'for you', entities: [{ _: 'messageEntityBold', offset: 0, length: 3 }] },
      from: { kind: 'user', id: 9n },
      to: undefined,
      nameHidden: true,
      saved: false,
    })
  })

  it('reads a peer shared with a bot with what the person chose to share', () => {
    const read = readAction({
      _: 'messageActionRequestedPeerSentMe',
      button_id: 4,
      peers: [
        { _: 'requestedPeerUser', user_id: 1n, first_name: 'Ada', username: 'ada' },
        { _: 'requestedPeerChannel', channel_id: 2n, title: 'News' },
      ],
    })

    expect(read).toMatchObject({
      kind: 'peers-shared-with-bot',
      buttonId: 4,
      peers: [
        { peer: { kind: 'user', id: 1n }, firstName: 'Ada', username: 'ada', title: undefined },
        { peer: { kind: 'channel', id: 2n }, title: 'News', firstName: undefined },
      ],
    })
  })

  it('reads an action it has no name for as unsupported, keeping it', () => {
    const unknown = {
      _: 'messageActionFromTheFuture',
      something: 1,
    } as unknown as TypeMessageAction
    expect(readAction(unknown)).toEqual({ kind: 'unsupported', raw: unknown })

    // A peer constructor it cannot place makes the whole action unsupported
    // rather than a guess.
    const unplaced = {
      _: 'messageActionGeoProximityReached',
      from_id: { _: 'peerFromTheFuture', id: 1n },
      to_id: { _: 'peerUser', user_id: 2n },
      distance: 1,
    } as unknown as TypeMessageAction
    expect(readAction(unplaced)).toEqual({ kind: 'unsupported', raw: unplaced })
    expect(readAction(undefined)).toBeUndefined()
  })

  it('is on a message view for a service message and nothing else', () => {
    const service = new MessageView({
      _: 'messageService',
      id: 1,
      peer_id: { _: 'peerChat', chat_id: 3n },
      date: 1,
      action: { _: 'messageActionChatEditTitle', title: 'new' },
    })
    const ordinary = new MessageView({
      _: 'message',
      id: 2,
      peer_id: { _: 'peerChat', chat_id: 3n },
      date: 1,
      message: 'hi',
    })

    expect(service.serviceAction).toMatchObject({ kind: 'title-changed', title: 'new' })
    expect(ordinary.serviceAction).toBeUndefined()
  })
})

describe('reaching a handler', () => {
  const joined = {
    _: 'updateNewMessage',
    pts: 2,
    pts_count: 1,
    message: {
      _: 'messageService',
      id: 10,
      peer_id: { _: 'peerChat', chat_id: 5n },
      from_id: { _: 'peerUser', user_id: 8n },
      date: 1,
      action: { _: 'messageActionChatJoinedByLink', inviter_id: 4n },
    },
  }

  it('is on the context of a message event, and matched and narrowed by f.action', async () => {
    const context = mtprotoContext(joined, { client: { name: 'me' }, log })
    expect(context.action).toMatchObject({
      kind: 'joined-by-link',
      inviter: { kind: 'user', id: 4n },
    })

    expect(f.action()(context)).toBe(true)
    expect(f.action('joined-by-link', 'members-added')(context)).toBe(true)
    expect(f.action('members-added')(context)).toBe(false)

    const text = mtprotoContext(
      {
        ...joined,
        message: { _: 'message', id: 11, peer_id: joined.message.peer_id, date: 1, message: 'hi' },
      },
      { client: { name: 'me' }, log },
    )
    expect(text.action).toBeUndefined()
    expect(f.action()(text)).toBe(false)
  })

  it('is handed to a handler an account dispatched it to', async () => {
    const { mockAccount } = await import('./support/mock-account.js')
    const { createServerKey } = await import('./server/keys.js')
    const instance = mockAccount({ key: createServerKey() })
    const seen: ServiceAction[] = []
    instance.account.on('message', f.action('joined-by-link'), (event) => {
      seen.push(event.action)
    })

    await instance.account.connect()
    await instance.account.feed({
      _: 'updates',
      updates: [joined],
      users: [],
      chats: [],
      date: 1,
      seq: 0,
    })
    await vi.waitFor(() => expect(seen).toHaveLength(1))
    expect(seen[0]).toMatchObject({ kind: 'joined-by-link', inviter: { kind: 'user', id: 4n } })
    await instance.dispose()
  }, 60_000)
})
