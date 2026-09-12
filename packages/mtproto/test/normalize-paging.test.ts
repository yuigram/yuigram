/**
 * Working out where the next page of dialogs begins.
 *
 * The trap is the date. A dialog says which message is its most recent and
 * nothing about when that was, so an offset assembled from the dialog alone is
 * well formed and names a position nobody has — and Telegram answers it with a
 * page that begins somewhere other than where the last one ended, which is a
 * conversation lost rather than an error.
 */

import { describe, expect, it } from 'vitest'
import { nextDialogs } from '../src/normalize/paging.js'
import type { TlValue } from '../src/tl/index.js'

/** One conversation on a page, naming its most recent message. */
const dialog = (peer: TlValue, top: number): TlValue => ({
  _: 'dialog',
  peer,
  top_message: top,
  read_inbox_max_id: top,
  read_outbox_max_id: top,
  unread_count: 0,
  unread_mentions_count: 0,
  unread_reactions_count: 0,
  notify_settings: { _: 'peerNotifySettings' },
})

/** A message the page describes, which is the only thing carrying a date. */
const message = (peer: TlValue, id: number, date: number): TlValue => ({
  _: 'message',
  id,
  peer_id: peer,
  message: '',
  date,
})

const USER = { _: 'peerUser', user_id: 5n }
const CHANNEL = { _: 'peerChannel', channel_id: 77n }

/** A page that says there is more after it. */
const slice = (dialogs: readonly TlValue[], messages: readonly TlValue[]): TlValue => ({
  _: 'messages.dialogsSlice',
  count: 100,
  dialogs,
  messages,
  chats: [],
  users: [],
})

describe('where a page of dialogs is continued from', () => {
  it('takes the last dialog on the page, dated by its own message', () => {
    const answer = slice(
      [dialog(USER, 11), dialog(CHANNEL, 22)],
      [message(USER, 11, 1_700_000_100), message(CHANNEL, 22, 1_700_000_200)],
    )

    expect(nextDialogs(answer)).toEqual({
      date: 1_700_000_200,
      id: 22,
      peer: { kind: 'channel', id: 77n },
    })
  })

  it('dates it by the message in the right conversation', () => {
    // Message identifiers are per conversation for channels, so a page
    // describing two of them can hold two messages numbered the same. Taking
    // either would date the offset by whichever came first in the array.
    const answer = slice(
      [dialog(CHANNEL, 9)],
      [message(USER, 9, 1_600_000_000), message(CHANNEL, 9, 1_700_000_000)],
    )

    expect(nextDialogs(answer)?.date).toBe(1_700_000_000)
  })

  it('tells two conversations of the same sort apart', () => {
    // Which kind of peer it is narrows nothing here: the page that actually
    // holds two messages numbered the same holds two channels.
    const other = { _: 'peerChannel', channel_id: 88n }
    const answer = slice(
      [dialog(CHANNEL, 9)],
      [message(other, 9, 1_600_000_000), message(CHANNEL, 9, 1_700_000_000)],
    )

    expect(nextDialogs(answer)?.date).toBe(1_700_000_000)
  })

  it('says nothing follows a complete list', () => {
    // The complete form is the whole list. Asking again would fetch the first
    // page a second time and never finish.
    const answer: TlValue = {
      _: 'messages.dialogs',
      dialogs: [dialog(USER, 11)],
      messages: [message(USER, 11, 1_700_000_100)],
      chats: [],
      users: [],
    }

    expect(nextDialogs(answer)).toBeUndefined()
  })

  it('says nothing follows an answer that describes no page', () => {
    const answer: TlValue = { _: 'messages.dialogsNotModified', count: 40 }

    expect(nextDialogs(answer)).toBeUndefined()
  })

  it('says nothing follows an empty page', () => {
    expect(nextDialogs(slice([], []))).toBeUndefined()
  })

  it('falls back to the dialog before one it cannot date', () => {
    // Repeating a dialog costs a caller a duplicate it can see. Skipping past
    // one loses a conversation and says nothing.
    const answer = slice(
      [dialog(USER, 11), dialog(CHANNEL, 22)],
      [message(USER, 11, 1_700_000_100)],
    )

    expect(nextDialogs(answer)).toEqual({
      date: 1_700_000_100,
      id: 11,
      peer: { kind: 'user', id: 5n },
    })
  })

  it('says nothing follows a page it can date none of', () => {
    // Stopping is the honest answer: asking again with the offset that produced
    // this page would produce it again.
    expect(nextDialogs(slice([dialog(USER, 11)], []))).toBeUndefined()
  })

  it('continues from a folder row, which is a dialog like any other', () => {
    const folder: TlValue = {
      _: 'dialogFolder',
      folder: { _: 'folder', id: 1, title: 'Archive' },
      peer: CHANNEL,
      top_message: 22,
      unread_muted_peers_count: 0,
      unread_unmuted_peers_count: 0,
      unread_muted_messages_count: 0,
      unread_unmuted_messages_count: 0,
    }

    expect(nextDialogs(slice([folder], [message(CHANNEL, 22, 1_700_000_200)]))?.id).toBe(22)
  })

  it('passes over an entry it cannot make sense of rather than losing the page', () => {
    const nonsense: TlValue = { _: 'dialog', peer: { _: 'peerNobody' }, top_message: 30 }
    const answer = slice(
      [dialog(USER, 11), nonsense],
      [message(USER, 11, 1_700_000_100), message(USER, 30, 1_700_000_300)],
    )

    expect(nextDialogs(answer)?.id).toBe(11)
  })

  it('says nothing follows an answer that is not a page of dialogs at all', () => {
    expect(nextDialogs({ _: 'boolTrue' })).toBeUndefined()
  })
})
