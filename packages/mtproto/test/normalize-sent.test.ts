/**
 * Finding the message a send produced.
 *
 * MTProto answers a send with the updates it caused, and an answer can describe
 * more than the one thing the caller did. What ties the identifier to this send
 * is the random number the send carried, so these cases are mostly about
 * refusing to read anything else: an identifier reported for another send, a
 * message that arrived at the same moment, an answer that describes nothing.
 */

import { describe, expect, it } from 'vitest'
import { sentMessage } from '../src/normalize/sent.js'
import type { TlValue } from '../src/tl/index.js'

const RANDOM = 0x0102_0304_0506_0708n
const OTHER = 0x1111_2222_3333_4444n

/** A message as an answer describes one. */
const message = (id: number, text = 'sent'): TlValue => ({
  _: 'message',
  id,
  peer_id: { _: 'peerUser', user_id: 5n },
  message: text,
  date: 1_700_000_000,
})

/** The long answer: a list of updates, with whatever else happened alongside. */
const updates = (list: readonly TlValue[]): TlValue => ({
  _: 'updates',
  updates: list,
  users: [],
  chats: [],
  date: 1_700_000_000,
  seq: 0,
})

describe('the answer a send produces', () => {
  it('reads the identifier and the message out of the long answer', () => {
    const answer = updates([
      { _: 'updateMessageID', id: 77, random_id: RANDOM },
      { _: 'updateNewMessage', message: message(77), pts: 1, pts_count: 1 },
    ])

    const sent = sentMessage(answer, RANDOM)

    expect(sent.id).toBe(77)
    expect(sent.message?.id).toBe(77)
    expect(sent.raw).toBe(answer)
  })

  it('reads the identifier out of the short answer, which carries no message', () => {
    // The answer to this call and nothing else, so the identifier needs no tie.
    // There is no message in it, and assembling one would be writing down
    // something the server never did.
    const answer: TlValue = {
      _: 'updateShortSentMessage',
      id: 90,
      pts: 4,
      pts_count: 1,
      date: 1_700_000_000,
    }

    const sent = sentMessage(answer, RANDOM)

    expect(sent.id).toBe(90)
    expect(sent.message).toBeUndefined()
    expect(sent.raw).toBe(answer)
  })

  it('ignores an identifier reported for a different send', () => {
    // Two sends in flight are answered in one batch often enough. Taking the
    // first identifier would report somebody else's message as this one.
    const answer = updates([
      { _: 'updateMessageID', id: 55, random_id: OTHER },
      { _: 'updateNewMessage', message: message(55), pts: 1, pts_count: 1 },
      { _: 'updateMessageID', id: 77, random_id: RANDOM },
      { _: 'updateNewMessage', message: message(77), pts: 2, pts_count: 1 },
    ])

    const sent = sentMessage(answer, RANDOM)

    expect(sent.id).toBe(77)
    expect(sent.message?.id).toBe(77)
  })

  it('does not take a message the answer describes for something else', () => {
    // The identifier is known and no message carries it. A message that arrived
    // in the same batch is a different message.
    const answer = updates([
      { _: 'updateMessageID', id: 77, random_id: RANDOM },
      { _: 'updateNewMessage', message: message(12), pts: 1, pts_count: 1 },
    ])

    const sent = sentMessage(answer, RANDOM)

    expect(sent.id).toBe(77)
    expect(sent.message).toBeUndefined()
  })

  it('reads a message sent to a channel the same way', () => {
    const answer = updates([
      { _: 'updateMessageID', id: 31, random_id: RANDOM },
      { _: 'updateNewChannelMessage', message: message(31), pts: 1, pts_count: 1 },
    ])

    expect(sentMessage(answer, RANDOM).message?.id).toBe(31)
  })

  it('reads a message that was scheduled rather than sent now', () => {
    const answer = updates([
      { _: 'updateMessageID', id: 44, random_id: RANDOM },
      { _: 'updateNewScheduledMessage', message: message(44) },
    ])

    expect(sentMessage(answer, RANDOM).message?.id).toBe(44)
  })

  it('reads a combined answer, which carries the same list', () => {
    const answer: TlValue = {
      _: 'updatesCombined',
      updates: [{ _: 'updateMessageID', id: 77, random_id: RANDOM }],
      users: [],
      chats: [],
      date: 1_700_000_000,
      seq_start: 1,
      seq: 2,
    }

    expect(sentMessage(answer, RANDOM).id).toBe(77)
  })

  it('reads a single update that arrived on its own', () => {
    const answer: TlValue = {
      _: 'updateShort',
      update: { _: 'updateMessageID', id: 21, random_id: RANDOM },
      date: 1_700_000_000,
    }

    expect(sentMessage(answer, RANDOM).id).toBe(21)
  })

  it('reports nothing rather than failing when the answer says nothing', () => {
    // The send has already succeeded by the time there is an answer to read. A
    // server that answers by saying the client is too far behind to be told has
    // still sent the message, and calling that a failure would be worse than
    // saying the identifier is not known.
    const answer: TlValue = { _: 'updatesTooLong' }

    const sent = sentMessage(answer, RANDOM)

    expect(sent.id).toBeUndefined()
    expect(sent.message).toBeUndefined()
    expect(sent.raw).toBe(answer)
  })

  it('reports nothing when the answer describes a message but ties none to this send', () => {
    const answer = updates([{ _: 'updateNewMessage', message: message(77), pts: 1, pts_count: 1 }])

    expect(sentMessage(answer, RANDOM).id).toBeUndefined()
    expect(sentMessage(answer, RANDOM).message).toBeUndefined()
  })

  it('looks for no message at all while no identifier is known', () => {
    // The identifier drives the lookup rather than the other way round. An
    // answer that ties nothing to this send is one nothing can be read out of,
    // whatever identifiers the messages in it happen to carry.
    const answer = updates([
      { _: 'updateNewMessage', message: message(0, 'not this one'), pts: 1, pts_count: 1 },
    ])

    expect(sentMessage(answer, RANDOM).message).toBeUndefined()
  })
})
