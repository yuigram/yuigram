/**
 * Turning TL updates into events.
 *
 * This is the seam, so the cases are about what crosses it. An update that is
 * read wrong does not fail — it produces an event with the wrong kind, or the
 * right kind and the wrong chat, and a handler acts on it. So each case names
 * the thing that would be silently wrong: a channel message attributed to the
 * chat rather than the channel, a read horizon that looks like somebody acting,
 * a pinned dialog that cannot be told from an unpinned one, an update kind
 * newer than this build quietly disappearing.
 */

import { createLogger, silentSink } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_KINDS,
  mtprotoContext,
  normalizeUpdate,
  RAW_KIND,
  SHARED_KINDS,
  UPDATE_EVENTS,
} from '../src/normalize/index.js'
import type { TlValue } from '../src/tl/index.js'

/** A logger that records nothing, so a case is about the event rather than the log. */
const log = createLogger({ sink: silentSink() })

/** Stands in for the client an update would have arrived on. */
const client = { name: 'account' }

const peerUser = (id: bigint): TlValue => ({ _: 'peerUser', user_id: id })
const peerChat = (id: bigint): TlValue => ({ _: 'peerChat', chat_id: id })
const peerChannel = (id: bigint): TlValue => ({ _: 'peerChannel', channel_id: id })

/** A message as the protocol carries one. */
function message(fields: Record<string, unknown> = {}): TlValue {
  return {
    _: 'message',
    id: 7,
    peer_id: peerChat(100n),
    from_id: peerUser(42n),
    date: 1_700_000_000,
    message: 'hello',
    ...fields,
  }
}

describe('which event an update becomes', () => {
  it('gives a new message the shared name, wherever it arrived', () => {
    // A channel post and a chat message are different constructors and the same
    // event. A reader that cares has the constructor in `raw`.
    for (const named of ['updateNewMessage', 'updateNewChannelMessage']) {
      const event = normalizeUpdate({ _: named, message: message(), pts: 1, pts_count: 1 })

      expect(event.kind, named).toBe('message')
    }
  })

  it('separates an edit from a new message', () => {
    for (const named of ['updateEditMessage', 'updateEditChannelMessage']) {
      const event = normalizeUpdate({ _: named, message: message(), pts: 1, pts_count: 1 })

      expect(event.kind, named).toBe('message_edited')
    }
  })

  it('names a deletion, in a channel and out of one', () => {
    expect(
      normalizeUpdate({ _: 'updateDeleteMessages', messages: [1, 2], pts: 1, pts_count: 2 }).kind,
    ).toBe('message_deleted')
    expect(
      normalizeUpdate({
        _: 'updateDeleteChannelMessages',
        channel_id: 5n,
        messages: [3],
        pts: 1,
        pts_count: 1,
      }).kind,
    ).toBe('message_deleted')
  })

  it('keeps account-only events behind their prefix', () => {
    // The prefix is what makes it visible in the name that a bot cannot see
    // these, rather than discovered when a handler never fires.
    for (const [named, kind] of Object.entries(UPDATE_EVENTS)) {
      const shared = (SHARED_KINDS as readonly string[]).includes(kind)

      expect(shared || kind.startsWith('mtproto:'), `${named} -> ${kind}`).toBe(true)
    }
  })

  it('tells a pinned dialog from an unpinned one', () => {
    // One constructor says both things. Which it said is the only thing a
    // reader wants, so it is the kind rather than a field to go looking for.
    const base = { _: 'updateDialogPinned', peer: { _: 'dialogPeer', peer: peerUser(9n) } }

    expect(normalizeUpdate({ ...base, pinned: true }).kind).toBe('mtproto:dialog_pinned')
    expect(normalizeUpdate(base).kind).toBe('mtproto:dialog_unpinned')
  })

  it('carries an update it does not know rather than dropping it', () => {
    // Telegram ships kinds before a client is regenerated. Discarding them
    // would lose data the framework was trusted to deliver.
    const update: TlValue = { _: 'updateSomethingInventedLater', payload: 1 }
    const event = normalizeUpdate(update)

    expect(event.kind).toBe(RAW_KIND)
    expect(event.raw).toBe(update)
  })

  it('gives each account-only update the kind the taxonomy names', () => {
    // The table above says every kind is either shared or prefixed, which stays
    // true if an account-only update is wrongly given a shared name. What each
    // one actually becomes has to be said outright.
    const expected: Readonly<Record<string, string>> = {
      updateUserTyping: 'mtproto:typing',
      updateChatUserTyping: 'mtproto:typing',
      updateChannelUserTyping: 'mtproto:typing',
      updateUserStatus: 'mtproto:user_status',
      updateReadHistoryInbox: 'mtproto:read_history',
      updateReadHistoryOutbox: 'mtproto:read_history',
      updateReadChannelInbox: 'mtproto:read_history',
      updateReadChannelOutbox: 'mtproto:read_history',
      updateDraftMessage: 'mtproto:draft',
      updateFolderPeers: 'mtproto:folder',
      updatePhoneCall: 'mtproto:call',
    }

    for (const [named, kind] of Object.entries(expected)) {
      expect(normalizeUpdate({ _: named }).kind, named).toBe(kind)
    }
  })

  it('never invents a kind outside the taxonomy', () => {
    const known = new Set<string>([...SHARED_KINDS, ...ACCOUNT_KINDS])

    for (const named of Object.keys(UPDATE_EVENTS)) {
      expect(known.has(normalizeUpdate({ _: named }).kind), named).toBe(true)
    }
  })
})

describe('which conversation an event concerns', () => {
  it('reads the chat off the message it arrived in', () => {
    const event = normalizeUpdate({
      _: 'updateNewMessage',
      message: message({ peer_id: peerChannel(555n) }),
      pts: 1,
      pts_count: 1,
    })

    expect(event.chat).toEqual({ kind: 'channel', id: 555n })
  })

  it('tells the three sorts of peer apart', () => {
    // A user, a basic group and a channel are three numbering spaces. Reading
    // the number without its sort would address a different conversation.
    const peers = [
      [peerUser(1n), { kind: 'user', id: 1n }],
      [peerChat(1n), { kind: 'chat', id: 1n }],
      [peerChannel(1n), { kind: 'channel', id: 1n }],
    ] as const

    for (const [peer, expected] of peers) {
      const event = normalizeUpdate({
        _: 'updateReadHistoryInbox',
        peer,
        max_id: 3,
        pts: 1,
        pts_count: 1,
      })

      expect(event.chat, peer._).toEqual(expected)
    }
  })

  it('reads a channel named by number rather than as a peer', () => {
    const event = normalizeUpdate({ _: 'updateReadChannelInbox', channel_id: 77n, max_id: 4 })

    expect(event.chat).toEqual({ kind: 'channel', id: 77n })
  })

  it('unwraps the peer a dialog update names', () => {
    const event = normalizeUpdate({
      _: 'updateDialogPinned',
      pinned: true,
      peer: { _: 'dialogPeer', peer: peerChannel(12n) },
    })

    expect(event.chat).toEqual({ kind: 'channel', id: 12n })
  })

  it('names no conversation for a dialog update about a folder', () => {
    // A folder is not a conversation, and saying it were would give a handler a
    // peer number that addresses something else entirely.
    const event = normalizeUpdate({
      _: 'updateDialogPinned',
      pinned: true,
      peer: { _: 'dialogPeerFolder', folder_id: 1 },
    })

    expect(event.chat).toBeUndefined()
  })

  it('names no conversation for a deletion outside a channel', () => {
    // The protocol does not say which chat. Message numbers are unique to the
    // account there, so nothing is missing — but nothing may be invented.
    const event = normalizeUpdate({
      _: 'updateDeleteMessages',
      messages: [1, 2],
      pts: 1,
      pts_count: 2,
    })

    expect(event.chat).toBeUndefined()
    expect(event.messageIds).toEqual([1, 2])
  })

  it('treats the other party as the conversation in a private chat', () => {
    const event = normalizeUpdate({
      _: 'updateUserTyping',
      user_id: 8n,
      action: { _: 'sendMessageTypingAction' },
    })

    expect(event.chat).toEqual({ kind: 'user', id: 8n })
  })
})

describe('who an event says acted', () => {
  it('reads the author off the message', () => {
    const event = normalizeUpdate({
      _: 'updateNewMessage',
      message: message({ from_id: peerUser(42n) }),
      pts: 1,
      pts_count: 1,
    })

    expect(event.sender).toEqual({ kind: 'user', id: 42n })
  })

  it('names nobody for a message the account sent', () => {
    // An outgoing message carries no author: the account is not something an
    // update needs to name, and naming the chat instead would attribute the
    // message to whoever it was sent to.
    const event = normalizeUpdate({
      _: 'updateNewMessage',
      message: message({ from_id: undefined, out: true }),
      pts: 1,
      pts_count: 1,
    })

    expect(event.sender).toBeUndefined()
  })

  it('names the person typing', () => {
    const event = normalizeUpdate({
      _: 'updateChatUserTyping',
      chat_id: 3n,
      from_id: peerUser(9n),
      action: { _: 'sendMessageTypingAction' },
    })

    expect(event.chat).toEqual({ kind: 'chat', id: 3n })
    expect(event.sender).toEqual({ kind: 'user', id: 9n })
  })

  it('names nobody when a read horizon moves', () => {
    // Nobody acted in the chat. Reading the peer as the author would make every
    // read receipt look like a message from whoever the update is about.
    const event = normalizeUpdate({
      _: 'updateReadHistoryInbox',
      peer: peerUser(4n),
      max_id: 10,
      pts: 1,
      pts_count: 1,
    })

    expect(event.chat).toEqual({ kind: 'user', id: 4n })
    expect(event.sender).toBeUndefined()
  })

  it('names the user whose status changed', () => {
    const event = normalizeUpdate({
      _: 'updateUserStatus',
      user_id: 6n,
      status: { _: 'userStatusOnline', expires: 1 },
    })

    expect(event.sender).toEqual({ kind: 'user', id: 6n })
  })
})

describe('a message that arrives without a container', () => {
  it('reads a private one as a message from the other party', () => {
    const event = normalizeUpdate({
      _: 'updateShortMessage',
      id: 3,
      user_id: 11n,
      message: 'hi',
      pts: 1,
      pts_count: 1,
      date: 1_700_000_000,
    })

    expect(event.kind).toBe('message')
    expect(event.chat).toEqual({ kind: 'user', id: 11n })
    expect(event.sender).toEqual({ kind: 'user', id: 11n })
    expect(event.text).toBe('hi')
    expect(event.date).toBe(1_700_000_000)
  })

  it('names nobody as the author when the account sent it', () => {
    // The compact form uses the same field for both parties, so the direction
    // flag is the only thing separating a message received from one sent.
    const event = normalizeUpdate({
      _: 'updateShortMessage',
      out: true,
      id: 3,
      user_id: 11n,
      message: 'hi',
      pts: 1,
      pts_count: 1,
      date: 1_700_000_000,
    })

    expect(event.chat).toEqual({ kind: 'user', id: 11n })
    expect(event.sender).toBeUndefined()
  })

  it('reads a group one as a message from a member', () => {
    const event = normalizeUpdate({
      _: 'updateShortChatMessage',
      id: 4,
      from_id: 22n,
      chat_id: 33n,
      message: 'hey',
      pts: 1,
      pts_count: 1,
      date: 1_700_000_000,
    })

    expect(event.chat).toEqual({ kind: 'chat', id: 33n })
    expect(event.sender).toEqual({ kind: 'user', id: 22n })
    expect(event.text).toBe('hey')
  })
})

describe('what an event carries besides its kind', () => {
  it('hands back the message for the kinds that have one', () => {
    const payload = message()
    const event = normalizeUpdate({ _: 'updateNewMessage', message: payload, pts: 1, pts_count: 1 })

    expect(event.message).toBe(payload)
    expect(event.text).toBe('hello')
  })

  it('hands back no message for the kinds that have none', () => {
    // A read horizon is not a message. Handing one back would make a message
    // filter fire on a receipt.
    const event = normalizeUpdate({
      _: 'updateReadHistoryInbox',
      peer: peerUser(1n),
      max_id: 2,
      pts: 1,
      pts_count: 1,
    })

    expect(event.message).toBeUndefined()
    expect(event.text).toBeUndefined()
  })

  it('reads Telegram seconds as a date', () => {
    const event = normalizeUpdate({
      _: 'updateNewMessage',
      message: message({ date: 1_600_000_000 }),
      pts: 1,
      pts_count: 1,
    })

    expect(event.date).toBe(1_600_000_000)
  })

  it('leaves the date absent rather than inventing one', () => {
    // An update with no timestamp has none. Substituting the moment it was read
    // would put a number in a field a reader is entitled to trust.
    const event = normalizeUpdate({
      _: 'updateUserStatus',
      user_id: 1n,
      status: { _: 'userStatusOffline', was_online: 5 },
    })

    expect(event.date).toBeUndefined()
  })

  it('leaves empty text absent rather than empty', () => {
    // A message with no text and a message with an empty string are the same
    // thing to a reader, and one of them makes a text filter match nothing.
    const event = normalizeUpdate({
      _: 'updateNewMessage',
      message: message({ message: '' }),
      pts: 1,
      pts_count: 1,
    })

    expect(event.text).toBeUndefined()
  })

  it('survives a message that is not there', () => {
    // The stream is untrusted input. A malformed update produces an event that
    // says little rather than an exception several layers from the cause.
    const event = normalizeUpdate({ _: 'updateNewMessage', pts: 1, pts_count: 1 })

    expect(event.kind).toBe('message')
    expect(event.chat).toBeUndefined()
    expect(event.message).toBeUndefined()
  })

  it('lets the constructor decide which sort of peer it is', () => {
    // A hostile or broken server can send a peer carrying every id field at
    // once. Reading whichever field is present first would let it choose which
    // conversation the event appears to be about.
    const event = normalizeUpdate({
      _: 'updateReadHistoryInbox',
      peer: { _: 'peerChannel', user_id: 5n, chat_id: 7n, channel_id: 9n },
      max_id: 1,
      pts: 1,
      pts_count: 1,
    })

    expect(event.chat).toEqual({ kind: 'channel', id: 9n })
  })

  it('says little rather than throwing when a peer is not an object', () => {
    // The stream is untrusted input, and a null where a peer belongs is the
    // shape that turns a read into a crash several layers from the cause.
    for (const peer of [null, 5, 'peerUser']) {
      const event = normalizeUpdate({
        _: 'updateReadHistoryInbox',
        peer,
        max_id: 1,
        pts: 1,
        pts_count: 1,
      })

      expect(event.kind, `${peer}`).toBe('mtproto:read_history')
      expect(event.chat, `${peer}`).toBeUndefined()
    }
  })

  it('says little rather than throwing when a message is not an object', () => {
    for (const message of [null, 5]) {
      const event = normalizeUpdate({ _: 'updateNewMessage', message, pts: 1, pts_count: 1 })

      expect(event.kind, `${message}`).toBe('message')
      expect(event.chat, `${message}`).toBeUndefined()
      expect(event.text, `${message}`).toBeUndefined()
    }
  })

  it('refuses a peer whose sort and number disagree', () => {
    // A peer naming itself a user while carrying a channel number is not a
    // peer. Reading the number anyway would address a different conversation.
    const event = normalizeUpdate({
      _: 'updateReadHistoryInbox',
      peer: { _: 'peerUser', channel_id: 5n },
      max_id: 1,
      pts: 1,
      pts_count: 1,
    })

    expect(event.chat).toBeUndefined()
  })
})

describe('the context an event arrives as', () => {
  it('says which transport produced it', () => {
    const context = mtprotoContext(
      { _: 'updateNewMessage', message: message(), pts: 1, pts_count: 1 },
      { client, log },
    )

    expect(context.transport).toBe('mtproto')
    expect(context.kind).toBe('message')
  })

  it('carries the update untouched', () => {
    const update: TlValue = { _: 'updateNewMessage', message: message(), pts: 1, pts_count: 1 }
    const context = mtprotoContext(update, { client, log })

    expect(context.raw).toBe(update)
  })

  it('carries what the update said and nothing it did not', () => {
    const context = mtprotoContext(
      {
        _: 'updateNewMessage',
        message: message({ peer_id: peerChannel(1n) }),
        pts: 1,
        pts_count: 1,
      },
      { client, log },
    )

    expect(context.chat).toEqual({ kind: 'channel', id: 1n })
    expect(context.sender).toEqual({ kind: 'user', id: 42n })
    expect(context.text).toBe('hello')
    expect(context.messageIds).toBeUndefined()
  })
})

describe('the payload an event carries', () => {
  it('carries the message the schema declares, not an opaque value', () => {
    // `docs/events.md` §5: the payload's own fields, with the payload's own
    // optionality. Reading one should not mean walking an untyped object.
    const event = normalizeUpdate({
      _: 'updateNewMessage',
      message: {
        _: 'message',
        id: 9,
        peer_id: { _: 'peerUser', user_id: 4n },
        from_id: { _: 'peerUser', user_id: 4n },
        date: 1_700_000_000,
        message: 'hello',
      },
      pts: 1,
      pts_count: 1,
    })

    expect(event.message?._).toBe('message')
    if (event.message?._ !== 'message') throw new Error('expected an ordinary message')

    expect(event.message.id).toBe(9)
    expect(event.message.message).toBe('hello')
    expect(event.message.date).toBe(1_700_000_000)
  })

  it('gives a service message no text rather than an empty one', () => {
    // A service message describes something that happened. A handler testing
    // for text must not be told there was some.
    const event = normalizeUpdate({
      _: 'updateNewMessage',
      message: {
        _: 'messageService',
        id: 10,
        peer_id: { _: 'peerChat', chat_id: 3n },
        from_id: { _: 'peerUser', user_id: 4n },
        date: 1_700_000_100,
        action: { _: 'messageActionChatJoinedByLink', inviter_id: 5n },
      },
      pts: 2,
      pts_count: 1,
    })

    expect(event.message?._).toBe('messageService')
    expect(event.text).toBeUndefined()
    expect(event.date).toBe(1_700_000_100)
    expect(event.chat).toEqual({ kind: 'chat', id: 3n })
    expect(event.sender).toEqual({ kind: 'user', id: 4n })
  })

  it('reads an empty message without inventing what it does not carry', () => {
    // `messageEmpty` is a hole where a message the account cannot see used to
    // be. It has an identifier and nothing else worth reporting.
    const event = normalizeUpdate({
      _: 'updateNewMessage',
      message: { _: 'messageEmpty', id: 11 },
      pts: 3,
      pts_count: 1,
    })

    expect(event.message?._).toBe('messageEmpty')
    expect(event.text).toBeUndefined()
    expect(event.date).toBeUndefined()
    expect(event.sender).toBeUndefined()
  })

  it('reports the timestamp in the units Telegram sends', () => {
    // Converting on every update, for every handler, is a cost paid by
    // everyone for the benefit of a few. A handler that wants a `Date` builds
    // one from this.
    const event = normalizeUpdate({
      _: 'updateNewMessage',
      message: {
        _: 'message',
        id: 12,
        peer_id: { _: 'peerUser', user_id: 4n },
        date: 1_700_000_200,
        message: 'x',
      },
      pts: 4,
      pts_count: 1,
    })

    expect(event.date).toBe(1_700_000_200)
    expect(new Date((event.date ?? 0) * 1000).getTime()).toBe(1_700_000_200_000)
  })

  it('takes text from the constructor rather than from a field that is present', () => {
    // Which message this is decides what it carries. A value naming itself a
    // service message does not become one with text because a field of that
    // name is on it, and reading the field instead would say it had some.
    const event = normalizeUpdate({
      _: 'updateNewMessage',
      message: {
        _: 'messageService',
        id: 13,
        peer_id: peerChat(3n),
        from_id: peerUser(4n),
        date: 1_700_000_300,
        action: { _: 'messageActionContactSignUp' },
        message: 'not text',
      },
      pts: 5,
      pts_count: 1,
    })

    expect(event.text).toBeUndefined()
  })

  it('attributes nothing to an empty message, whatever the value carries', () => {
    // `messageEmpty` declares neither an author nor a time. Reading those off
    // the value rather than off the variants that have them would give a hole
    // a sender and a date, and a handler no way to tell it from a message.
    const event = normalizeUpdate({
      _: 'updateNewMessage',
      message: { _: 'messageEmpty', id: 14, from_id: peerUser(4n), date: 1_700_000_400 },
      pts: 6,
      pts_count: 1,
    })

    expect(event.sender).toBeUndefined()
    expect(event.date).toBeUndefined()
  })

  it('reports no timestamp for something that is not a whole number of seconds', () => {
    // Telegram counts seconds and sends them as an `int`. Anything else is not
    // a timestamp, and passing it through would be multiplied into a date by
    // the first handler that wanted one.
    const event = normalizeUpdate({
      _: 'updateShortMessage',
      id: 15,
      user_id: 4n,
      message: 'hello',
      date: 1_700_000_500.5,
      pts: 7,
      pts_count: 1,
    })

    expect(event.text).toBe('hello')
    expect(event.date).toBeUndefined()
  })
})
