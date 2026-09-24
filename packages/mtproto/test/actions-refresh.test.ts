/**
 * Putting a file reference right after the datacenter has refused it.
 *
 * A reference expires on the datacenter's own schedule and nothing announces
 * it, so the request that carried a stale one is refused for a reason that says
 * nothing about the file. The way back is the message it arrived in, asked for
 * again.
 *
 * These drive that seam directly rather than over the wire, because the answer a
 * refetch produces carries a `message` — a name both TL tables declare, which
 * the scope refuses to resolve by order and therefore cannot write. What the
 * client does with such an answer is what matters here, and reading one is
 * never ambiguous.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import type { DownloadRequest } from '../src/files/download.js'
import type { ManagedLocation } from '../src/files/references.js'
import { type ActionContext, updateActions } from '../src/normalize/actions.js'
import { normalizeUpdate } from '../src/normalize/normalize.js'
import type { TlValue } from '../src/tl/index.js'

const FILE = 0x0d0c_0002n
const FIRST = Uint8Array.of(1, 1, 1)
const SECOND = Uint8Array.of(2, 2, 2)

/** A message carrying a document with the reference given. */
const messageWith = (reference: Uint8Array, id = 77, file = FILE): TlValue => ({
  _: 'message',
  id,
  peer_id: { _: 'peerUser', user_id: 5n },
  from_id: { _: 'peerUser', user_id: 5n },
  message: 'here',
  date: 1_700_000_000,
  media: {
    _: 'messageMediaDocument',
    document: {
      _: 'document',
      id: file,
      access_hash: 5n,
      file_reference: reference,
      date: 1_700_000_000,
      mime_type: 'application/pdf',
      size: 4096n,
      dc_id: 4,
      attributes: [],
    },
  },
})

/** A message carrying a photo whose largest fetchable size is `x`. */
const photoMessage = (reference: Uint8Array, id = 77): TlValue => ({
  _: 'message',
  id,
  peer_id: { _: 'peerUser', user_id: 5n },
  from_id: { _: 'peerUser', user_id: 5n },
  message: 'look',
  date: 1_700_000_000,
  media: {
    _: 'messageMediaPhoto',
    photo: {
      _: 'photo',
      id: FILE,
      access_hash: 5n,
      file_reference: reference,
      date: 1_700_000_000,
      dc_id: 4,
      sizes: [
        { _: 'photoStrippedSize', type: 'i', bytes: Uint8Array.of(1) },
        { _: 'photoSize', type: 'm', w: 320, h: 320, size: 1_000 },
        { _: 'photoSize', type: 'x', w: 800, h: 800, size: 9_000 },
      ],
    },
  },
})

const photoUpdate = (reference: Uint8Array): TlValue => ({
  _: 'updateNewMessage',
  message: photoMessage(reference),
  pts: 1,
  pts_count: 1,
})

const update = (reference: Uint8Array): TlValue => ({
  _: 'updateNewMessage',
  message: messageWith(reference),
  pts: 1,
  pts_count: 1,
})

/** A stand-in account: scripted answers, and the transfer captured rather than run. */
function context(answer: (query: TlValue) => TlValue) {
  const asked: TlValue[] = []
  const captured: { request?: DownloadRequest; references?: ManagedLocation } = {}

  const actions: ActionContext = {
    peers: {
      byId: async () => ({
        kind: 'channel' as const,
        id: 55n,
        accessHash: 13n,
        min: false,
        usernames: [],
      }),
      byUsername: async () => undefined,
      byPhone: async () => undefined,
      save: async () => true,
      forget: async () => {},
    },
    invoke: async (query) => {
      asked.push(query)

      return answer(query)
    },
    random: (length) => new Uint8Array(length),
    fetch: async (request, references) => {
      captured.request = request
      captured.references = references

      return new Uint8Array(0)
    },
    // Nothing here sends or looks a peer up; a case that did would say so.
    sending: {
      api: undefined as never,
      resolve: async () => {
        throw new Error('not used here')
      },
      random: (length) => new Uint8Array(length),
    },
    lookup: async () => {
      throw new Error('not used here')
    },
  }

  return { actions, asked, captured }
}

/** The reference a captured location would send right now. */
const sending = (references: ManagedLocation) => references.current()['file_reference']

describe('a reference the datacenter has refused', () => {
  it('is put right from the message it arrived in', async () => {
    const { actions, asked, captured } = context(() => ({
      _: 'messages.messages',
      messages: [messageWith(SECOND)],
      chats: [],
      users: [],
    }))

    await updateActions(normalizeUpdate(update(FIRST)), actions).download()
    expect(sending(captured.references as ManagedLocation)).toBe(FIRST)

    await (captured.references as ManagedLocation).refresh(FIRST)

    expect(sending(captured.references as ManagedLocation)).toBe(SECOND)
    expect(asked.at(-1)?.['_']).toBe('messages.getMessages')
    expect(asked.at(-1)?.['id']).toEqual([{ _: 'inputMessageID', id: 77 }])
  })

  it('takes the reference of the document it is fetching, not the first one it sees', async () => {
    // An answer can describe more than one message, and each carries its own
    // document. Taking the first would fetch with a reference issued for a
    // different file, which is refused all over again.
    const other = Uint8Array.of(9, 9, 9)
    const { actions, asked, captured } = context(() => ({
      _: 'messages.messages',
      messages: [messageWith(other, 999, 0xbadn), messageWith(SECOND)],
      chats: [],
      users: [],
    }))

    await updateActions(normalizeUpdate(update(FIRST)), actions).download()
    await (captured.references as ManagedLocation).refresh(FIRST)

    expect(asked.at(-1)?.['id']).toEqual([{ _: 'inputMessageID', id: 77 }])
    expect(sending(captured.references as ManagedLocation)).toBe(SECOND)
  })

  it('does not ask again for a caller that lost the race', async () => {
    // Two ranges in flight are refused together. The second is holding the
    // reference the first has already replaced, and making it wait for a
    // refetch it does not need would cost a round trip for nothing.
    const { actions, asked, captured } = context(() => ({
      _: 'messages.messages',
      messages: [messageWith(SECOND)],
      chats: [],
      users: [],
    }))

    await updateActions(normalizeUpdate(update(FIRST)), actions).download()
    await (captured.references as ManagedLocation).refresh(FIRST)
    const after = asked.length

    await (captured.references as ManagedLocation).refresh(FIRST)

    expect(asked).toHaveLength(after)
    await (captured.references as ManagedLocation).refresh(SECOND)
    expect(asked.length).toBeGreaterThan(after)
  })

  it('reports a message that no longer carries the file', async () => {
    const { actions, captured } = context(() => ({
      _: 'messages.messages',
      messages: [],
      chats: [],
      users: [],
    }))

    await updateActions(normalizeUpdate(update(FIRST)), actions).download()

    await expect((captured.references as ManagedLocation).refresh(FIRST)).rejects.toThrow(
      /no longer carries the file/,
    )
  })

  it('asks the channel for a message that arrived in one', async () => {
    // A channel keeps its messages under the channel, so the ordinary method
    // would ask about a message somewhere else entirely.
    const { actions, asked, captured } = context(() => ({
      _: 'messages.channelMessages',
      pts: 1,
      count: 1,
      messages: [messageWith(SECOND)],
      chats: [],
      users: [],
    }))

    const carried = messageWith(FIRST)
    const inChannel: TlValue = {
      _: 'updateNewChannelMessage',
      message: { ...carried, peer_id: { _: 'peerChannel', channel_id: 55n } },
      pts: 1,
      pts_count: 1,
    }

    await updateActions(normalizeUpdate(inChannel), actions).download()
    await (captured.references as ManagedLocation).refresh(FIRST)

    expect(asked.at(-1)?.['_']).toBe('channels.getMessages')
    expect(asked.at(-1)?.['channel']).toEqual({
      _: 'inputChannel',
      channel_id: 55n,
      access_hash: 13n,
    })
  })

  it('hands the transfer the document it was asked for', async () => {
    const { actions, captured } = context(() => ({
      _: 'messages.messages',
      messages: [],
      chats: [],
      users: [],
    }))

    await updateActions(normalizeUpdate(update(FIRST)), actions).download()

    expect(captured.request).toEqual({
      dcId: 4,
      size: 4096,
      location: {
        _: 'inputDocumentFileLocation',
        id: FILE,
        access_hash: 5n,
        file_reference: FIRST,
        thumb_size: '',
      },
    })
  })

  it('fetches a photo at its largest size, and refreshes it the same way', async () => {
    // The same seam serves both: what differs is which location is built, and
    // the reference is refreshed from the same message either way.
    const { actions, asked, captured } = context(() => ({
      _: 'messages.messages',
      messages: [photoMessage(SECOND)],
      chats: [],
      users: [],
    }))

    await updateActions(normalizeUpdate(photoUpdate(FIRST)), actions).download()

    expect(captured.request?.location['_']).toBe('inputPhotoFileLocation')
    expect(captured.request?.location['thumb_size']).toBe('x')

    await (captured.references as ManagedLocation).refresh(FIRST)

    expect(sending(captured.references as ManagedLocation)).toBe(SECOND)
    expect(asked.at(-1)?.['_']).toBe('messages.getMessages')
  })

  it('does not take a photo reference for the document it is fetching', async () => {
    // Documents and photos are numbered separately, so one of each can carry
    // the same identifier. Matching on the number alone would hand the
    // transfer a reference issued for the other, and the refusal that follows
    // says nothing about which of the two was confused.
    const { actions, captured } = context(() => ({
      _: 'messages.messages',
      messages: [photoMessage(SECOND)],
      chats: [],
      users: [],
    }))

    await updateActions(normalizeUpdate(update(FIRST)), actions).download()

    await expect((captured.references as ManagedLocation).refresh(FIRST)).rejects.toThrow(
      /no longer carries the file/,
    )
  })

  it('does not take a document reference for the photo it is fetching', async () => {
    const { actions, captured } = context(() => ({
      _: 'messages.messages',
      messages: [messageWith(SECOND)],
      chats: [],
      users: [],
    }))

    await updateActions(normalizeUpdate(photoUpdate(FIRST)), actions).download()

    await expect((captured.references as ManagedLocation).refresh(FIRST)).rejects.toThrow(
      /no longer carries the file/,
    )
  })

  it('keeps sending the reference it has when a refetch fails', async () => {
    // A failed refresh leaves the location as it was rather than half-updated,
    // so the transfer that gave up reports the refusal it was given instead of
    // a second one about a reference nothing issued.
    const { actions, captured } = context(() => ({
      _: 'messages.messages',
      messages: [],
      chats: [],
      users: [],
    }))

    await updateActions(normalizeUpdate(update(FIRST)), actions).download()
    await expect((captured.references as ManagedLocation).refresh(FIRST)).rejects.toThrow(
      ValidationError,
    )

    expect(sending(captured.references as ManagedLocation)).toBe(FIRST)
  })

  it('asks once per refusal, however many times the transfer is refused', async () => {
    // The transfer refreshes at most once per range, and this side refuses to
    // ask again for a reference it has already replaced. Between them there is
    // no arrangement of refusals that turns into a loop.
    const { actions, asked, captured } = context(() => ({
      _: 'messages.messages',
      messages: [messageWith(SECOND)],
      chats: [],
      users: [],
    }))

    await updateActions(normalizeUpdate(update(FIRST)), actions).download()
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await (captured.references as ManagedLocation).refresh(FIRST)
    }

    expect(asked.filter((query) => query._ === 'messages.getMessages')).toHaveLength(1)
  })

  it('refuses media that carries no file at all', async () => {
    const { actions } = context(() => ({ _: 'boolTrue' }))
    const poll: TlValue = {
      _: 'updateNewMessage',
      message: {
        _: 'message',
        id: 1,
        peer_id: { _: 'peerUser', user_id: 5n },
        message: '',
        date: 1_700_000_000,
        media: { _: 'messageMediaContact', phone_number: '1', user_id: 1n },
      },
      pts: 1,
      pts_count: 1,
    }

    await expect(updateActions(normalizeUpdate(poll), actions).download()).rejects.toThrow(
      ValidationError,
    )
  })
})
