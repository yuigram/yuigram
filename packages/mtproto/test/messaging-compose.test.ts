/**
 * Albums, copies, quotes, comments and the schedule.
 *
 * Driven by a scripted client, so what is checked is the request each operation
 * makes: one album request rather than several sends, a copy that sends rather
 * than forwards, a comment addressed to the discussion group rather than the
 * channel, and answers matched by key rather than by position. Nothing reaches
 * Telegram.
 */

import { PeerError, ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import type { MtprotoApi } from '../src/api.js'
import { MessageView } from '../src/entities/message.js'
import type { TypeInputPeer } from '../src/generated/api/types/index.js'
import {
  copyAlbum,
  copyMessage,
  deleteScheduledMessages,
  discussionOf,
  getScheduledMessages,
  scheduledMessages,
  sendAlbum,
  sendScheduledMessages,
  uploadMedia,
} from '../src/messaging/compose.js'
import { quoteOf, type Sending, sameTopic, sendText } from '../src/messaging/send.js'
import type { PeerRef } from '../src/normalize/normalize.js'

interface Call {
  readonly method: string
  readonly params: Record<string, unknown>
}

type Script = Readonly<Record<string, ((params: Record<string, unknown>) => unknown) | undefined>>

const EMPTY_UPDATES = { _: 'updates', updates: [], users: [], chats: [], date: 0, seq: 0 }

/** A client that records each call and answers from a script. */
function scripted(script: Script = {}): Sending & {
  readonly calls: Call[]
  readonly resolved: (string | PeerRef)[]
} {
  const calls: Call[] = []
  const resolved: (string | PeerRef)[] = []
  let seed = 0

  const handler = (namespace: string) =>
    new Proxy(
      {},
      {
        get: (_target, name: string) => (params: Record<string, unknown>) => {
          const method = `${namespace}.${name}`
          calls.push({ method, params })

          try {
            return Promise.resolve(script[method]?.(params) ?? EMPTY_UPDATES)
          } catch (error) {
            return Promise.reject(error)
          }
        },
      },
    )

  return {
    api: { messages: handler('messages'), channels: handler('channels') } as unknown as MtprotoApi,
    calls,
    resolved,
    resolve(peer) {
      resolved.push(peer)

      if (typeof peer !== 'string') {
        return Promise.resolve(
          peer.kind === 'channel'
            ? { _: 'inputPeerChannel', channel_id: peer.id, access_hash: peer.id * 10n }
            : { _: 'inputPeerUser', user_id: peer.id, access_hash: peer.id * 10n },
        )
      }

      const id = BigInt(peer.length * 100 + (peer.codePointAt(1) ?? 0))
      const answer: TypeInputPeer = peer.startsWith('@channel')
        ? { _: 'inputPeerChannel', channel_id: id, access_hash: id }
        : { _: 'inputPeerUser', user_id: id, access_hash: id }

      return Promise.resolve(answer)
    },
    random(length) {
      seed += 1

      return Uint8Array.from({ length }, (_value, at) => (seed * 37 + at) % 251)
    },
  }
}

const methods = (client: { readonly calls: Call[] }) => client.calls.map((call) => call.method)
const called = (client: { readonly calls: Call[] }, method: string) =>
  client.calls.find((call) => call.method === method)?.params

/** An answer naming each key's message, in whatever order `ids` lists them. */
function answering(keys: readonly bigint[], ids: readonly number[]) {
  return {
    ...EMPTY_UPDATES,
    updates: [
      ...keys.map((key, at) => ({ _: 'updateMessageID', id: ids[at], random_id: key })),
      ...ids.map((id) => ({
        _: 'updateNewMessage',
        message: { _: 'message', id },
        pts: 0,
        pts_count: 0,
      })),
    ],
  }
}

const photo = (id: bigint) => ({
  _: 'photo',
  id,
  access_hash: id + 1n,
  file_reference: Uint8Array.of(Number(id % 200n)),
  date: 0,
  sizes: [],
  dc_id: 2,
})

const document = (id: bigint) => ({
  _: 'document',
  id,
  access_hash: id + 1n,
  file_reference: Uint8Array.of(9),
  date: 0,
  mime_type: 'video/mp4',
  size: 10n,
  dc_id: 2,
  attributes: [],
})

/** A stored photo, sent by reference. */
const storedPhoto = (id: bigint) => ({
  _: 'inputMediaPhoto',
  id: { _: 'inputPhoto', id, access_hash: id + 1n, file_reference: Uint8Array.of(1) },
})

const message = (id: number, extra: Record<string, unknown> = {}) => ({
  _: 'message',
  id,
  peer_id: { _: 'peerUser', user_id: 5n },
  date: 0,
  message: '',
  ...extra,
})

const messages = (...list: unknown[]) => ({
  _: 'messages.messages',
  messages: list,
  chats: [],
  users: [],
})

describe('an album', () => {
  it('sends every item in one request, each with its own key and caption', async () => {
    const client = scripted()

    await sendAlbum(client, '@someone', [
      { media: storedPhoto(1n) as never, caption: 'first' },
      {
        media: storedPhoto(2n) as never,
        caption: { text: 'second', entities: [{ _: 'messageEntityBold', offset: 0, length: 6 }] },
      },
    ])

    expect(methods(client)).toEqual(['messages.sendMultiMedia'])
    const items = called(client, 'messages.sendMultiMedia')?.['multi_media'] as Record<
      string,
      unknown
    >[]
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ _: 'inputSingleMedia', message: 'first' })
    expect(items[0]).not.toHaveProperty('entities')
    expect(items[1]).toMatchObject({ message: 'second', entities: [{ _: 'messageEntityBold' }] })
    expect(typeof items[0]?.['random_id']).toBe('bigint')
    expect(items[0]?.['random_id']).not.toBe(items[1]?.['random_id'])
  })

  it('hands uploaded bytes to Telegram first and sends them by reference, keeping what was asked', async () => {
    const answers = [
      { _: 'messageMediaPhoto', photo: photo(11n) },
      { _: 'messageMediaDocument', document: document(12n) },
    ]
    const client = scripted({ 'messages.uploadMedia': () => answers.shift() })
    const file = { _: 'inputFile', id: 1n, parts: 1, name: 'a', md5_checksum: '' }

    await sendAlbum(client, '@someone', [
      { media: { _: 'inputMediaUploadedPhoto', file, spoiler: true, ttl_seconds: 30 } as never },
      {
        media: {
          _: 'inputMediaUploadedDocument',
          file,
          mime_type: 'video/mp4',
          attributes: [],
          video_timestamp: 4,
        } as never,
      },
    ])

    expect(methods(client)).toEqual([
      'messages.uploadMedia',
      'messages.uploadMedia',
      'messages.sendMultiMedia',
    ])
    const items = called(client, 'messages.sendMultiMedia')?.['multi_media'] as Record<
      string,
      unknown
    >[]
    expect(items[0]?.['media']).toEqual({
      _: 'inputMediaPhoto',
      id: { _: 'inputPhoto', id: 11n, access_hash: 12n, file_reference: Uint8Array.of(11) },
      spoiler: true,
      ttl_seconds: 30,
    })
    expect(items[1]?.['media']).toMatchObject({
      _: 'inputMediaDocument',
      id: { _: 'inputDocument', id: 12n },
      video_timestamp: 4,
    })
  })

  it('prepares media for the conversation it is sent to', async () => {
    const client = scripted({
      'messages.uploadMedia': () => ({ _: 'messageMediaPhoto', photo: photo(3n) }),
    })

    await uploadMedia(client, '@someone', {
      _: 'inputMediaPhotoExternal',
      url: 'https://example.com/a.jpg',
    })

    expect(called(client, 'messages.uploadMedia')?.['peer']).toMatchObject({ _: 'inputPeerUser' })
  })

  it('answers each item in the order given, whatever order the answer lists them', async () => {
    const client = scripted({
      'messages.sendMultiMedia': (params) => {
        const keys = (params['multi_media'] as { random_id: bigint }[]).map(
          (item) => item.random_id,
        )

        return answering([...keys].reverse(), [31, 30])
      },
    })

    const sent = await sendAlbum(client, '@someone', [
      { media: storedPhoto(1n) as never },
      { media: storedPhoto(2n) as never },
    ])

    expect(sent.map((one) => one.id)).toEqual([30, 31])
    expect(sent.map((one) => one.message?.id)).toEqual([30, 31])
  })

  it('reports no identifier rather than a wrong one when the answer names none', async () => {
    const client = scripted({ 'messages.sendMultiMedia': () => ({ _: 'updatesTooLong' }) })

    const sent = await sendAlbum(client, '@someone', [
      { media: storedPhoto(1n) as never },
      { media: storedPhoto(2n) as never },
    ])

    expect(sent.map((one) => one.id)).toEqual([undefined, undefined])
  })

  it('carries replies, topics, quotes and the schedule the way a single send does', async () => {
    const client = scripted()

    await sendAlbum(client, '@someone', [{ media: storedPhoto(1n) as never }], {
      replyTo: 42,
      topicId: 7,
      quote: { text: 'abc', offset: 3 },
      silent: true,
      scheduleDate: 'online',
    })

    expect(called(client, 'messages.sendMultiMedia')).toMatchObject({
      reply_to: {
        _: 'inputReplyToMessage',
        reply_to_msg_id: 42,
        top_msg_id: 7,
        quote_text: 'abc',
        quote_offset: 3,
      },
      silent: true,
      schedule_date: 0x7ffffffe,
    })
  })

  it('refuses no items, more than ten, and buttons, before sending anything', async () => {
    const client = scripted()
    const item = { media: storedPhoto(1n) as never }

    await expect(sendAlbum(client, '@someone', [])).rejects.toThrow(/1 to 10/)
    await expect(sendAlbum(client, '@someone', Array(11).fill(item))).rejects.toThrow(/not 11/)
    await expect(
      sendAlbum(client, '@someone', [item], { markup: { _: 'replyKeyboardHide' } } as never),
    ).rejects.toThrow(/buttons/)
    expect(client.calls).toEqual([])
  })

  it('stops between steps when aborted, and sends nothing', async () => {
    const controller = new AbortController()
    const client = scripted({
      'messages.uploadMedia': () => {
        controller.abort()

        return { _: 'messageMediaPhoto', photo: photo(3n) }
      },
    })
    const file = { _: 'inputFile', id: 1n, parts: 1, name: 'a', md5_checksum: '' }

    await expect(
      sendAlbum(
        client,
        '@someone',
        [
          { media: { _: 'inputMediaUploadedPhoto', file } as never },
          { media: { _: 'inputMediaUploadedPhoto', file } as never },
        ],
        { signal: controller.signal },
      ),
    ).rejects.toThrow()
    expect(methods(client)).toEqual(['messages.uploadMedia'])
  })

  it('refuses media Telegram stored as something with no file to send', async () => {
    const client = scripted({ 'messages.uploadMedia': () => ({ _: 'messageMediaEmpty' }) })

    await expect(
      uploadMedia(client, '@someone', { _: 'inputMediaPhotoExternal', url: 'https://example.com' }),
    ).rejects.toThrow(ValidationError)
  })
})

describe('a copy', () => {
  const copying = (source: unknown, extra: Script = {}) =>
    scripted({ 'messages.getMessages': () => messages(source), ...extra })

  it('sends text again with its formatting, as a new message rather than a forward', async () => {
    const entities = [{ _: 'messageEntityBold', offset: 0, length: 2 }]
    const client = copying(message(7, { message: 'hi there', entities }))

    await copyMessage(client, { from: '@source', id: 7, to: '@target' })

    expect(methods(client)).toEqual(['messages.getMessages', 'messages.sendMessage'])
    expect(called(client, 'messages.sendMessage')).toMatchObject({
      message: 'hi there',
      entities,
      // The original showed no preview, or it would have carried one.
      no_webpage: true,
    })
  })

  it('lets a link be previewed again where the original showed a preview', async () => {
    const client = copying(
      message(7, {
        message: 'https://example.com',
        invert_media: true,
        media: { _: 'messageMediaWebPage', webpage: { _: 'webPageEmpty', id: 1n } },
      }),
    )

    await copyMessage(client, { from: '@source', id: 7, to: '@target' })

    const params = called(client, 'messages.sendMessage')
    expect(params).not.toHaveProperty('no_webpage')
    expect(params).toMatchObject({ invert_media: true })
  })

  it('sends media by reference with its spoiler and timer, keeping the caption', async () => {
    const client = copying(
      message(7, {
        message: 'look',
        media: { _: 'messageMediaPhoto', photo: photo(20n), spoiler: true, ttl_seconds: 10 },
      }),
    )

    await copyMessage(client, { from: '@source', id: 7, to: '@target' })

    expect(called(client, 'messages.sendMedia')).toMatchObject({
      message: 'look',
      media: {
        _: 'inputMediaPhoto',
        id: { id: 20n, access_hash: 21n },
        spoiler: true,
        ttl_seconds: 10,
      },
    })
  })

  it('replaces the caption, and removes it when the new one is empty', async () => {
    const source = message(7, {
      message: 'old',
      media: { _: 'messageMediaPhoto', photo: photo(20n) },
    })

    const replaced = copying(source)
    await copyMessage(replaced, { from: '@source', id: 7, to: '@target' }, { caption: 'new' })
    expect(called(replaced, 'messages.sendMedia')).toMatchObject({ message: 'new' })

    const removed = copying(source)
    await copyMessage(removed, { from: '@source', id: 7, to: '@target' }, { caption: '' })
    expect(called(removed, 'messages.sendMedia')).toMatchObject({ message: '' })
  })

  it('refuses a caption for a message that has no media', async () => {
    const client = copying(message(7, { message: 'text' }))

    await expect(
      copyMessage(client, { from: '@source', id: 7, to: '@target' }, { caption: 'x' }),
    ).rejects.toThrow(/no caption/)
    expect(methods(client)).not.toContain('messages.sendMessage')
  })

  it.each([
    [
      'a location',
      {
        _: 'messageMediaGeo',
        geo: { _: 'geoPoint', lat: 1, long: 2, access_hash: 0n, accuracy_radius: 5 },
      },
      {
        _: 'inputMediaGeoPoint',
        geo_point: { _: 'inputGeoPoint', lat: 1, long: 2, accuracy_radius: 5 },
      },
    ],
    [
      'a live location',
      {
        _: 'messageMediaGeoLive',
        geo: { _: 'geoPoint', lat: 1, long: 2, access_hash: 0n },
        period: 60,
        heading: 90,
      },
      {
        _: 'inputMediaGeoLive',
        geo_point: { _: 'inputGeoPoint', lat: 1, long: 2 },
        period: 60,
        heading: 90,
      },
    ],
    [
      'a venue',
      {
        _: 'messageMediaVenue',
        geo: { _: 'geoPoint', lat: 1, long: 2, access_hash: 0n },
        title: 't',
        address: 'a',
        provider: 'p',
        venue_id: 'v',
        venue_type: 'y',
      },
      {
        _: 'inputMediaVenue',
        geo_point: { _: 'inputGeoPoint', lat: 1, long: 2 },
        title: 't',
        address: 'a',
        provider: 'p',
        venue_id: 'v',
        venue_type: 'y',
      },
    ],
    [
      'a contact',
      {
        _: 'messageMediaContact',
        phone_number: '1',
        first_name: 'f',
        last_name: 'l',
        vcard: '',
        user_id: 0n,
      },
      { _: 'inputMediaContact', phone_number: '1', first_name: 'f', last_name: 'l', vcard: '' },
    ],
    [
      'a dice, which rolls again',
      { _: 'messageMediaDice', value: 6, emoticon: '🎲' },
      { _: 'inputMediaDice', emoticon: '🎲' },
    ],
    [
      'a checklist, with nothing ticked',
      {
        _: 'messageMediaToDo',
        todo: {
          _: 'todoList',
          title: { _: 'textWithEntities', text: 'x', entities: [] },
          list: [],
        },
        completions: [],
      },
      { _: 'inputMediaTodo', todo: { _: 'todoList' } },
    ],
    [
      'a game',
      {
        _: 'messageMediaGame',
        game: {
          _: 'game',
          id: 4n,
          access_hash: 5n,
          short_name: 's',
          title: 't',
          description: 'd',
          photo: {},
        },
      },
      { _: 'inputMediaGame', id: { _: 'inputGameID', id: 4n, access_hash: 5n } },
    ],
  ])('rebuilds %s', async (_, media, expected) => {
    const client = copying(message(7, { media }))

    await copyMessage(client, { from: '@source', id: 7, to: '@target' })

    const sent = called(client, 'messages.sendMedia')?.['media'] as Record<string, unknown>
    expect(sent).toMatchObject(expected)
    expect(Object.keys(sent).sort()).toEqual(Object.keys(expected).sort())
  })

  it('copies a poll open and with no votes, without the moment the original closed', async () => {
    const poll = {
      _: 'poll',
      id: 99n,
      closed: true,
      multiple_choice: true,
      question: { _: 'textWithEntities', text: 'q', entities: [] },
      answers: [],
      close_period: 60,
      close_date: 1_000,
    }
    const client = copying(
      message(7, { media: { _: 'messageMediaPoll', poll, results: { _: 'pollResults' } } }),
    )

    await copyMessage(client, { from: '@source', id: 7, to: '@target' })

    const sent = called(client, 'messages.sendMedia')?.['media'] as {
      poll: Record<string, unknown>
    }
    // A new poll: its own identifier and its own hash, neither carried over.
    expect(sent.poll).toMatchObject({ id: 0n, hash: 0n, multiple_choice: true, close_period: 60 })
    expect(sent.poll).not.toHaveProperty('closed')
    expect(sent.poll).not.toHaveProperty('close_date')
    expect(sent).not.toHaveProperty('correct_answers')
  })

  it('copies a quiz only where its right answer is known', async () => {
    const answer = (text: string, option: number) => ({
      _: 'pollAnswer',
      text: { _: 'textWithEntities', text, entities: [] },
      option: Uint8Array.of(option),
    })
    const poll = {
      _: 'poll',
      id: 99n,
      hash: 0n,
      quiz: true,
      question: { _: 'textWithEntities', text: 'q', entities: [] },
      answers: [answer('wrong', 0), answer('right', 1)],
    }
    const known = copying(
      message(7, {
        media: {
          _: 'messageMediaPoll',
          poll,
          results: {
            _: 'pollResults',
            results: [
              { _: 'pollAnswerVoters', option: Uint8Array.of(0), voters: 1 },
              { _: 'pollAnswerVoters', option: Uint8Array.of(1), voters: 2, correct: true },
            ],
            solution: 'because',
          },
        },
      }),
    )

    await copyMessage(known, { from: '@source', id: 7, to: '@target' })
    const sent = called(known, 'messages.sendMedia')?.['media'] as {
      correct_answers: number[]
      poll: { answers: { _: string; option?: Uint8Array }[] }
    }
    // A sent poll names its right answers by position, while the message named
    // them by the bytes each option carried: the two are matched, not assumed.
    expect(sent.correct_answers).toEqual([1])
    expect(sent.poll.answers.map((one) => one._)).toEqual(['inputPollAnswer', 'inputPollAnswer'])
    expect(sent.poll.answers[0]).not.toHaveProperty('option')
    expect(called(known, 'messages.sendMedia')?.['media']).toMatchObject({
      solution: 'because',
      solution_entities: [],
    })

    const unknown = copying(
      message(7, { media: { _: 'messageMediaPoll', poll, results: { _: 'pollResults' } } }),
    )
    await expect(copyMessage(unknown, { from: '@source', id: 7, to: '@target' })).rejects.toThrow(
      /right answer/,
    )
  })

  it("names a story's poster through the account", async () => {
    const client = copying(
      message(7, {
        media: { _: 'messageMediaStory', peer: { _: 'peerChannel', channel_id: 44n }, id: 3 },
      }),
    )

    await copyMessage(client, { from: '@source', id: 7, to: '@target' })

    expect(client.resolved).toContainEqual({ kind: 'channel', id: 44n })
    expect(called(client, 'messages.sendMedia')?.['media']).toMatchObject({
      _: 'inputMediaStory',
      peer: { _: 'inputPeerChannel', channel_id: 44n },
      id: 3,
    })
  })

  it.each([
    ['a message the account cannot see', { _: 'messageEmpty', id: 7 }, /cannot see/],
    [
      'a service message',
      {
        _: 'messageService',
        id: 7,
        peer_id: { _: 'peerUser', user_id: 5n },
        date: 0,
        action: { _: 'messageActionEmpty' },
      },
      /service/,
    ],
    ['protected content', message(7, { message: 'x', noforwards: true }), /protects/],
    [
      'an invoice',
      message(7, {
        media: {
          _: 'messageMediaInvoice',
          title: 't',
          description: 'd',
          currency: 'XTR',
          total_amount: 1n,
          start_param: '',
        },
      }),
      /invoice/,
    ],
    [
      'paid media',
      message(7, { media: { _: 'messageMediaPaidMedia', stars_amount: 1n, extended_media: [] } }),
      /paid media/,
    ],
    [
      'a self-destructed photo',
      message(7, { media: { _: 'messageMediaPhoto', ttl_seconds: 5 } }),
      /no longer available/,
    ],
  ])('refuses %s, and sends nothing', async (_, source, reason) => {
    const client = copying(source)

    await expect(copyMessage(client, { from: '@source', id: 7, to: '@target' })).rejects.toThrow(
      reason,
    )
    expect(methods(client)).toEqual(['messages.getMessages'])
  })

  it('reads the message again once when a file reference expired, then gives up', async () => {
    const source = message(7, { media: { _: 'messageMediaPhoto', photo: photo(20n) } })
    let refusals = 1
    const recovered = copying(source, {
      'messages.sendMedia': () => {
        if (refusals-- > 0) throw new Error('FILE_REFERENCE_EXPIRED')

        return EMPTY_UPDATES
      },
    })

    await copyMessage(recovered, { from: '@source', id: 7, to: '@target' })
    expect(methods(recovered)).toEqual([
      'messages.getMessages',
      'messages.sendMedia',
      'messages.getMessages',
      'messages.sendMedia',
    ])
    // The destination is resolved once; only the source is read again.
    expect(recovered.resolved).toEqual(['@target', '@source', '@source'])

    const stale = copying(source, {
      'messages.sendMedia': () => {
        throw new Error('FILE_REFERENCE_EXPIRED')
      },
    })
    await expect(copyMessage(stale, { from: '@source', id: 7, to: '@target' })).rejects.toThrow(
      /FILE_REFERENCE_EXPIRED/,
    )
    expect(methods(stale).filter((name) => name === 'messages.sendMedia')).toHaveLength(2)
  })

  it('does not read the message again for any other refusal', async () => {
    const client = copying(message(7, { media: { _: 'messageMediaPhoto', photo: photo(20n) } }), {
      'messages.sendMedia': () => {
        throw new Error('CHAT_WRITE_FORBIDDEN')
      },
    })

    await expect(copyMessage(client, { from: '@source', id: 7, to: '@target' })).rejects.toThrow(
      /CHAT_WRITE_FORBIDDEN/,
    )
    expect(methods(client)).toEqual(['messages.getMessages', 'messages.sendMedia'])
  })
})

describe('a copied album', () => {
  const item = (
    id: number,
    caption: string,
    grouped: bigint | undefined,
    media: unknown = { _: 'messageMediaPhoto', photo: photo(BigInt(id)) },
  ) =>
    message(id, {
      message: caption,
      media,
      ...(grouped === undefined ? {} : { grouped_id: grouped }),
    })

  it("sends one album in the album's own order, each item with its caption", async () => {
    const client = scripted({
      'messages.getMessages': () => messages(item(12, 'second', 9n), item(11, 'first', 9n)),
    })

    await copyAlbum(client, { from: '@source', ids: [12, 11], to: '@target' })

    expect(methods(client)).toEqual(['messages.getMessages', 'messages.sendMultiMedia'])
    const items = called(client, 'messages.sendMultiMedia')?.['multi_media'] as Record<
      string,
      unknown
    >[]
    expect(items.map((one) => one['message'])).toEqual(['first', 'second'])
    expect(items.map((one) => (one['media'] as { id: { id: bigint } }).id.id)).toEqual([11n, 12n])
  })

  it('refuses messages that are not one album', async () => {
    for (const list of [
      [item(11, '', 9n), item(12, '', 8n)],
      [item(11, '', undefined), item(12, '', undefined)],
    ]) {
      const client = scripted({ 'messages.getMessages': () => messages(...list) })

      await expect(
        copyAlbum(client, { from: '@source', ids: [11, 12], to: '@target' }),
      ).rejects.toThrow(/not one album/)
      expect(methods(client)).toEqual(['messages.getMessages'])
    }
  })

  it('refuses an item an album cannot hold', async () => {
    const dice = { _: 'messageMediaDice', value: 1, emoticon: '🎲' }
    const client = scripted({
      'messages.getMessages': () => messages(item(11, '', 9n), item(12, '', 9n, dice)),
    })

    await expect(
      copyAlbum(client, { from: '@source', ids: [11, 12], to: '@target' }),
    ).rejects.toThrow(/nothing an album can hold/)
  })
})

describe('a quote', () => {
  const bold = { _: 'messageEntityBold', offset: 0, length: 11 } as const
  const italic = { _: 'messageEntityItalic', offset: 6, length: 11 } as const
  const url = {
    _: 'messageEntityTextUrl',
    offset: 12,
    length: 5,
    url: 'https://example.com',
  } as const

  it('cuts a section out of a message, with the formatting inside it cut to fit', () => {
    const quote = quoteOf({ text: 'hello brave world', entities: [bold, italic, url] }, 6, 11)

    expect(quote).toEqual({
      text: {
        text: 'brave',
        entities: [
          { _: 'messageEntityBold', offset: 0, length: 5 },
          { _: 'messageEntityItalic', offset: 0, length: 5 },
        ],
      },
      offset: 6,
    })
  })

  it('refuses a section outside the text, an empty one, and one that splits a character', () => {
    const text = 'a😀b'

    expect(() => quoteOf({ text }, 0, 5)).toThrow(ValidationError)
    expect(() => quoteOf({ text }, 2, 2)).toThrow(ValidationError)
    expect(() => quoteOf({ text }, -1, 1)).toThrow(ValidationError)
    expect(() => quoteOf({ text }, 0, 2)).toThrow(/middle of a character/)
    expect(quoteOf({ text }, 1, 3).text).toEqual({ text: '😀', entities: [] })
  })

  it('goes out as the reply header, and needs the message it quotes', async () => {
    const client = scripted()
    const quote = quoteOf({ text: 'hello brave world', entities: [bold] }, 0, 5)

    await sendText(client, '@someone', 'yes', { replyTo: 3, quote })
    expect(called(client, 'messages.sendMessage')?.['reply_to']).toEqual({
      _: 'inputReplyToMessage',
      reply_to_msg_id: 3,
      quote_text: 'hello',
      quote_entities: [{ _: 'messageEntityBold', offset: 0, length: 5 }],
      quote_offset: 0,
    })

    const refused = scripted()
    await expect(sendText(refused, '@someone', 'yes', { quote })).rejects.toThrow(/needs replyTo/)
    expect(refused.resolved).toEqual([])
  })

  it('answers a message in another conversation, naming that conversation', async () => {
    const client = scripted()

    await sendText(client, '@someone', 'yes', { replyTo: 3, replyIn: '@elsewhere' })

    expect(client.resolved).toEqual(['@someone', '@elsewhere'])
    expect(called(client, 'messages.sendMessage')?.['reply_to']).toMatchObject({
      reply_to_msg_id: 3,
      reply_to_peer_id: { _: 'inputPeerUser' },
    })
    await expect(
      sendText(scripted(), '@someone', 'yes', { replyIn: '@elsewhere' }),
    ).rejects.toThrow(/needs replyTo/)
  })
})

describe('a comment', () => {
  const group = { _: 'peerChannel', channel_id: 77n }
  const discussion = (list: unknown[]) => ({
    _: 'messages.discussionMessage',
    messages: list,
    unread_count: 2,
    max_id: 120,
    read_inbox_max_id: 110,
    chats: [],
    users: [],
  })
  const thread = () =>
    discussion([
      message(101, { peer_id: group, grouped_id: 1n }),
      message(100, { peer_id: group, grouped_id: 1n }),
    ])

  it("finds the post's thread and sends into the discussion group rather than the channel", async () => {
    const client = scripted({ 'messages.getDiscussionMessage': thread })

    await sendText(client, '@channel_news', 'first!', { commentOn: 5 })

    expect(methods(client)).toEqual(['messages.getDiscussionMessage', 'messages.sendMessage'])
    expect(called(client, 'messages.getDiscussionMessage')).toMatchObject({
      peer: { _: 'inputPeerChannel' },
      msg_id: 5,
    })
    expect(called(client, 'messages.sendMessage')).toMatchObject({
      peer: { _: 'inputPeerChannel', channel_id: 77n },
      // The last message listed is the post's own copy, which names the thread.
      reply_to: { _: 'inputReplyToMessage', reply_to_msg_id: 100 },
    })
  })

  it('answers a comment already in the thread, which files the answer there too', async () => {
    const client = scripted({ 'messages.getDiscussionMessage': thread })

    await sendText(client, '@channel_news', 'agreed', { commentOn: 5, replyTo: 115 })

    expect(called(client, 'messages.sendMessage')?.['reply_to']).toEqual({
      _: 'inputReplyToMessage',
      reply_to_msg_id: 115,
    })
  })

  it('sends an album as a comment, prepared for the discussion group', async () => {
    const client = scripted({
      'messages.getDiscussionMessage': thread,
      'messages.uploadMedia': () => ({ _: 'messageMediaPhoto', photo: photo(3n) }),
    })

    await sendAlbum(
      client,
      '@channel_news',
      [{ media: { _: 'inputMediaPhotoExternal', url: 'https://example.com/a.jpg' } }],
      { commentOn: 5 },
    )

    expect(called(client, 'messages.uploadMedia')?.['peer']).toMatchObject({ channel_id: 77n })
    expect(called(client, 'messages.sendMultiMedia')).toMatchObject({
      peer: { channel_id: 77n },
      reply_to: { reply_to_msg_id: 100 },
    })
  })

  it('reads the comment section itself', async () => {
    const client = scripted({ 'messages.getDiscussionMessage': thread })

    const found = await discussionOf(client, '@channel_news', 5)

    expect(found).toMatchObject({
      chat: { kind: 'channel', id: 77n },
      thread: 100,
      unreadCount: 2,
      maxId: 120,
      readInboxMaxId: 110,
    })
    expect(found).not.toHaveProperty('readOutboxMaxId')
    expect(found.messages.map((view) => view.id)).toEqual([101, 100])
  })

  it('refuses a peer that is not a channel, and a post without a comment section', async () => {
    const person = scripted()
    await expect(sendText(person, '@someone', 'x', { commentOn: 5 })).rejects.toThrow(PeerError)
    expect(methods(person)).toEqual([])

    const silent = scripted({ 'messages.getDiscussionMessage': () => discussion([]) })
    await expect(sendText(silent, '@channel_news', 'x', { commentOn: 5 })).rejects.toThrow(
      /no comment section/,
    )
    expect(methods(silent)).toEqual(['messages.getDiscussionMessage'])
  })

  it('refuses a comment aimed at a topic or another conversation', async () => {
    const client = scripted()

    await expect(
      sendText(client, '@channel_news', 'x', { commentOn: 5, topicId: 3 }),
    ).rejects.toThrow(/own thread/)
    await expect(
      sendText(client, '@channel_news', 'x', { commentOn: 5, replyTo: 1, replyIn: '@other' }),
    ).rejects.toThrow(/own thread/)
    expect(client.calls).toEqual([])
  })
})

describe('the schedule', () => {
  it('reads every scheduled message, leaving out the empty placeholders', async () => {
    const client = scripted({
      'messages.getScheduledHistory': () => messages(message(3), { _: 'messageEmpty', id: 4 }),
    })

    const found = await scheduledMessages(client, '@someone')

    expect(called(client, 'messages.getScheduledHistory')).toMatchObject({ hash: 0n })
    expect(found.map((view) => view.id)).toEqual([3])
  })

  it('reads scheduled messages by number, in the order asked, with a gap for none', async () => {
    const client = scripted({
      'messages.getScheduledMessages': () => messages(message(9), message(3)),
    })

    const found = await getScheduledMessages(client, '@someone', [3, 5, 9])

    expect(called(client, 'messages.getScheduledMessages')).toMatchObject({ id: [3, 5, 9] })
    expect(found.map((view) => view?.id)).toEqual([3, undefined, 9])
  })

  it('takes messages off the schedule', async () => {
    const client = scripted()

    await deleteScheduledMessages(client, '@someone', [3, 4])

    expect(client.calls).toEqual([
      {
        method: 'messages.deleteScheduledMessages',
        params: expect.objectContaining({ id: [3, 4] }),
      },
    ])
  })

  it('says which message each scheduled one became, from the pairing the answer reports', async () => {
    const client = scripted({
      'messages.sendScheduledMessages': () => ({
        ...EMPTY_UPDATES,
        updates: [
          { _: 'updateNewMessage', message: message(50), pts: 0, pts_count: 1 },
          {
            _: 'updateDeleteScheduledMessages',
            peer: { _: 'peerUser', user_id: 5n },
            messages: [5, 6],
            sent_messages: [50, 60],
          },
        ],
      }),
    })

    const sent = await sendScheduledMessages(client, '@someone', [6, 5, 7])

    expect(sent.map(({ scheduled, id }) => [scheduled, id])).toEqual([
      [6, 60],
      [5, 50],
      [7, undefined],
    ])
    expect(sent[1]?.message).toMatchObject({ id: 50 })
    expect(sent[0]?.message).toBeUndefined()
  })

  it('schedules for when a person comes online, and refuses a date that is not a time', async () => {
    const client = scripted()

    await sendText(client, '@someone', 'later', { scheduleDate: 'online' })
    expect(called(client, 'messages.sendMessage')).toMatchObject({ schedule_date: 0x7ffffffe })

    for (const date of [0, 1.5, -3]) {
      await expect(sendText(scripted(), '@someone', 'x', { scheduleDate: date })).rejects.toThrow(
        /schedule date/,
      )
    }
  })
})

describe('the topic a message is in', () => {
  const view = (extra: Record<string, unknown>) => new MessageView(message(40, extra) as never)
  const header = (fields: Record<string, unknown>) => ({ _: 'messageReplyHeader', ...fields })

  it('names the topic of a message inside one', () => {
    expect(
      sameTopic(view({ reply_to: header({ forum_topic: true, reply_to_msg_id: 7 }) })),
    ).toEqual({
      topicId: 7,
    })
    expect(
      sameTopic(
        view({ reply_to: header({ forum_topic: true, reply_to_msg_id: 39, reply_to_top_id: 7 }) }),
      ),
    ).toEqual({ topicId: 7 })
  })

  it('names the topic a topic-opening message opened', () => {
    const opened = new MessageView({
      _: 'messageService',
      id: 12,
      peer_id: { _: 'peerChannel', channel_id: 1n },
      date: 0,
      action: { _: 'messageActionTopicCreate', title: 't', icon_color: 0 },
    } as never)

    expect(sameTopic(opened)).toEqual({ topicId: 12 })
  })

  it('names nothing outside topics, where a message goes anyway', () => {
    expect(sameTopic(view({}))).toEqual({})
    expect(sameTopic(view({ reply_to: header({ reply_to_msg_id: 7 }) }))).toEqual({})
  })
})
