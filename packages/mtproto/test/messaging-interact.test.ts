// SPDX-License-Identifier: MIT

/**
 * Acting on messages that exist, and finding messages and what hangs off them.
 *
 * Driven by a scripted client, so what is checked is the request each
 * operation makes and what it does with the answer: which constructor names a
 * message, which sequence a position is applied to, how a vote's positions
 * become option bytes, what a paid reaction's identifier is made of, and that a
 * positional answer stays positional. Nothing reaches Telegram, and nothing
 * here spends Stars.
 */

import { PeerError, ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import type { MtprotoApi } from '../src/api.js'
import { MessageView } from '../src/entities/message.js'
import { deleteTopicHistory } from '../src/forums/topics.js'
import type { TypeInputPeer } from '../src/generated/api/types/index.js'
import {
  getAvailableMessageEffects,
  getCallbackQueryMessage,
  getFactCheck,
  getMessageByLink,
  getMessageGroup,
  getMessageReactions,
  getMessagesOutsideChannels,
  getReactionsOf,
  getReplyTo,
  getWebPagePreview,
} from '../src/messaging/inspect.js'
import {
  appendTodoList,
  closePoll,
  createRichStreamingDraft,
  createStreamingDraft,
  editInlineMessage,
  type Interacting,
  readInlineMessageId,
  readReactions,
  sendPaidReaction,
  sendRichMessage,
  sendVote,
  toggleTodoCompleted,
  translateMessage,
  translateText,
  unpinAllMessages,
  writeInlineMessageId,
} from '../src/messaging/interact.js'
import type { PeerRef } from '../src/normalize/normalize.js'
import type { TlValue } from '../src/tl/index.js'

interface Call {
  readonly method: string
  readonly params: Record<string, unknown>
}

type Answer = unknown | ((params: Record<string, unknown>, call: number) => unknown)

const UPDATES = { _: 'updates', updates: [], users: [], chats: [], date: 0, seq: 0 }

/** A client that records each call and answers from a script. */
function scripted(script: Readonly<Record<string, Answer>> = {}) {
  const calls: Call[] = []
  const elsewhere: { dcId: number; query: TlValue }[] = []
  let seed = 0

  const handler = (namespace: string) =>
    new Proxy(
      {},
      {
        get: (_target, name: string) => (params: Record<string, unknown>) => {
          const method = `${namespace}.${name}`
          calls.push({ method, params })
          const scriptedAnswer = script[method]
          const made = calls.filter((one) => one.method === method).length

          try {
            const answer =
              typeof scriptedAnswer === 'function'
                ? (scriptedAnswer as (p: Record<string, unknown>, n: number) => unknown)(
                    params,
                    made,
                  )
                : scriptedAnswer

            return Promise.resolve(answer ?? UPDATES)
          } catch (error) {
            return Promise.reject(error)
          }
        },
      },
    )

  const client: Interacting & {
    readonly calls: Call[]
    readonly elsewhere: typeof elsewhere
    readonly resolved: (string | PeerRef)[]
  } = {
    api: {
      messages: handler('messages'),
      channels: handler('channels'),
    } as unknown as MtprotoApi,
    calls,
    elsewhere,
    resolved: [],
    resolve(peer) {
      client.resolved.push(peer)
      if (typeof peer !== 'string') {
        return Promise.resolve(
          peer.kind === 'channel'
            ? { _: 'inputPeerChannel', channel_id: peer.id, access_hash: peer.id * 10n }
            : { _: 'inputPeerUser', user_id: peer.id, access_hash: peer.id * 10n },
        )
      }
      const answer: TypeInputPeer = peer.replace(/^@/, '').startsWith('channel')
        ? { _: 'inputPeerChannel', channel_id: 77n, access_hash: 770n }
        : { _: 'inputPeerUser', user_id: 5n, access_hash: 50n }

      return Promise.resolve(answer)
    },
    random(length) {
      seed += 1

      return Uint8Array.from({ length }, (_value, at) => (seed * 17 + at) % 251)
    },
    at(dcId, query) {
      elsewhere.push({ dcId, query })

      return Promise.resolve(true as unknown as TlValue)
    },
    now: () => 1_700_000_000_000,
  }

  return client
}

const methods = (client: { readonly calls: Call[] }) => client.calls.map((call) => call.method)
const sent = (client: { readonly calls: Call[] }, method: string) =>
  client.calls.find((call) => call.method === method)?.params

/** What a call carried, refusing a call that was never made. */
const carried = (client: { readonly calls: Call[] }, method: string): Record<string, unknown> => {
  const params = sent(client, method)
  if (params === undefined) throw new Error(`${method} was not called`)

  return params
}

/** The action a draft update carried. */
const actionOf = (params: Record<string, unknown> | undefined): Record<string, unknown> => {
  if (params === undefined) throw new Error('no such update was sent')

  return params['action'] as Record<string, unknown>
}

const text = (value: string) => ({ _: 'textWithEntities', text: value, entities: [] })

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

const answerFor = (option: number, title: string) => ({
  _: 'pollAnswer',
  text: text(title),
  option: Uint8Array.of(option),
})

const pollMessage = (id: number) =>
  message(id, {
    media: {
      _: 'messageMediaPoll',
      poll: {
        _: 'poll',
        id: 1n,
        hash: 0n,
        question: text('q'),
        answers: [answerFor(10, 'a'), answerFor(20, 'b'), answerFor(30, 'c')],
      },
      results: { _: 'pollResults' },
    },
  })

const pollUpdate = {
  ...UPDATES,
  updates: [
    {
      _: 'updateMessagePoll',
      poll_id: 1n,
      poll: { _: 'poll', id: 1n, hash: 3n, closed: true, question: text('q'), answers: [] },
      results: { _: 'pollResults', total_voters: 4 },
    },
  ],
}

describe('voting and closing a poll', () => {
  it('votes by option bytes without reading the message first', async () => {
    const client = scripted({ 'messages.sendVote': pollUpdate })

    const state = await sendVote(client, '@someone', 9, [Uint8Array.of(20)])

    expect(methods(client)).toEqual(['messages.sendVote'])
    expect(sent(client, 'messages.sendVote')).toMatchObject({
      msg_id: 9,
      options: [Uint8Array.of(20)],
    })
    expect(state.results).toMatchObject({ total_voters: 4 })
  })

  it('turns positions into the bytes the poll gave each option', async () => {
    const client = scripted({
      'messages.getMessages': messages(pollMessage(9)),
      'messages.sendVote': pollUpdate,
    })

    await sendVote(client, '@someone', 9, [2, 0])

    expect(methods(client)).toEqual(['messages.getMessages', 'messages.sendVote'])
    expect(sent(client, 'messages.sendVote')?.['options']).toEqual([
      Uint8Array.of(30),
      Uint8Array.of(10),
    ])
  })

  it('takes a vote back with no options, and refuses a position the poll does not have', async () => {
    const retract = scripted({ 'messages.sendVote': pollUpdate })
    await sendVote(retract, '@someone', 9, [])
    expect(sent(retract, 'messages.sendVote')?.['options']).toEqual([])

    const outside = scripted({ 'messages.getMessages': messages(pollMessage(9)) })
    await expect(sendVote(outside, '@someone', 9, [3])).rejects.toThrow(/no option at position 3/)
    expect(methods(outside)).not.toContain('messages.sendVote')

    const noPoll = scripted({ 'messages.getMessages': messages(message(9)) })
    await expect(sendVote(noPoll, '@someone', 9, [0])).rejects.toThrow(/carries no poll/)
  })

  it('refuses an answer that does not describe the poll', async () => {
    const client = scripted({ 'messages.sendVote': UPDATES })

    await expect(sendVote(client, '@someone', 9, [Uint8Array.of(1)])).rejects.toThrow(
      /without describing the poll/,
    )
  })

  it('closes a poll by sending only the closed mark, and reads the poll back from the answer', async () => {
    const client = scripted({ 'messages.editMessage': pollUpdate })

    const state = await closePoll(client, '@someone', 9)

    // Nothing of the original is read or restated.
    expect(methods(client)).toEqual(['messages.editMessage'])
    expect(sent(client, 'messages.editMessage')).toEqual({
      peer: { _: 'inputPeerUser', user_id: 5n, access_hash: 50n },
      id: 9,
      media: {
        _: 'inputMediaPoll',
        poll: {
          _: 'poll',
          id: 0n,
          closed: true,
          question: { _: 'textWithEntities', text: '', entities: [] },
          answers: [],
          hash: 0n,
        },
      },
    })
    expect(state.poll).toMatchObject({ closed: true })
  })
})

describe('a paid reaction', () => {
  const reactionsUpdate = {
    ...UPDATES,
    updates: [
      {
        _: 'updateMessageReactions',
        peer: { _: 'peerUser', user_id: 5n },
        msg_id: 9,
        reactions: { _: 'messageReactions', results: [] },
      },
    ],
  }

  it('carries the time in the upper half of its identifier and random bits below', async () => {
    const client = scripted({ 'messages.sendPaidReaction': reactionsUpdate })

    const reactions = await sendPaidReaction(client, '@someone', 9, 5)

    const key = sent(client, 'messages.sendPaidReaction')?.['random_id'] as bigint
    expect(BigInt.asUintN(64, key) >> 32n).toBe(1_700_000_000n)
    expect(BigInt.asUintN(32, key)).not.toBe(0n)
    expect(sent(client, 'messages.sendPaidReaction')).toMatchObject({ msg_id: 9, count: 5 })
    expect(sent(client, 'messages.sendPaidReaction')).not.toHaveProperty('private')
    expect(reactions).toMatchObject({ _: 'messageReactions' })
  })

  it.each([
    [{ anonymous: true }, { _: 'paidReactionPrivacyAnonymous' }],
    [{ anonymous: false }, { _: 'paidReactionPrivacyDefault' }],
    [
      { asChat: '@channel_mine' },
      { _: 'paidReactionPrivacyPeer', peer: { _: 'inputPeerChannel' } },
    ],
  ])('says who paid: %o', async (options, privacy) => {
    const client = scripted({ 'messages.sendPaidReaction': reactionsUpdate })

    await sendPaidReaction(client, '@someone', 9, 1, options)

    expect(sent(client, 'messages.sendPaidReaction')?.['private']).toMatchObject(privacy)
  })

  it('refuses a count that is not a whole number of Stars, before any request', async () => {
    for (const count of [0, -1, 1.5]) {
      const client = scripted()
      await expect(sendPaidReaction(client, '@someone', 9, count)).rejects.toThrow(ValidationError)
      expect(client.calls).toEqual([])
    }
  })

  it('tries again with a fresh identifier when one has aged, and gives up after three', async () => {
    const recovered = scripted({
      'messages.sendPaidReaction': (_params: unknown, call: number) => {
        if (call === 1) throw new Error('RANDOM_ID_EXPIRED (400)')

        return reactionsUpdate
      },
    })
    await sendPaidReaction(recovered, '@someone', 9, 1)
    const keys = recovered.calls.map((call) => call.params['random_id'])
    expect(keys).toHaveLength(2)
    expect(keys[0]).not.toBe(keys[1])

    const aged = scripted({
      'messages.sendPaidReaction': () => {
        throw new Error('RANDOM_ID_EXPIRED (400)')
      },
    })
    await expect(sendPaidReaction(aged, '@someone', 9, 1)).rejects.toThrow(/RANDOM_ID_EXPIRED/)
    expect(aged.calls).toHaveLength(3)
  })

  it('does not try again for any other refusal', async () => {
    const client = scripted({
      'messages.sendPaidReaction': () => {
        throw new Error('BALANCE_TOO_LOW (400)')
      },
    })

    await expect(sendPaidReaction(client, '@someone', 9, 1)).rejects.toThrow(/BALANCE_TOO_LOW/)
    expect(client.calls).toHaveLength(1)
  })
})

describe('operations on history answered with a position', () => {
  const affected = { _: 'messages.affectedHistory', pts: 120, pts_count: 3, offset: 0 }

  it('clears reaction badges in the conversation it names', async () => {
    const client = scripted({ 'messages.readReactions': affected })

    await readReactions(client, '@someone')

    expect(sent(client, 'messages.readReactions')).toMatchObject({
      peer: { _: 'inputPeerUser', user_id: 5n },
    })
  })

  it('unpins everything in one topic of a channel', async () => {
    const client = scripted({ 'messages.unpinAllMessages': affected })

    await unpinAllMessages(client, '@channel_news', { topicId: 4 })

    expect(sent(client, 'messages.unpinAllMessages')).toMatchObject({
      peer: { _: 'inputPeerChannel', channel_id: 77n },
      top_msg_id: 4,
    })
  })

  it('deletes a forum topic’s history in the forum it names', async () => {
    const client = scripted({ 'messages.deleteTopicHistory': affected })

    await deleteTopicHistory(client, '@channel_forum', 4)

    expect(sent(client, 'messages.deleteTopicHistory')).toMatchObject({
      peer: { _: 'inputPeerChannel', channel_id: 77n },
      top_msg_id: 4,
    })
  })
})

describe('checklists', () => {
  const todoMessage = message(9, {
    media: {
      _: 'messageMediaToDo',
      todo: {
        _: 'todoList',
        title: text('t'),
        list: [
          { _: 'todoItem', id: 1, title: text('a') },
          { _: 'todoItem', id: 4, title: text('b') },
        ],
      },
    },
  })
  const edited = {
    ...UPDATES,
    updates: [
      { _: 'updateEditMessage', message: message(9, { message: 'edited' }), pts: 1, pts_count: 1 },
    ],
  }

  it('numbers new items on from the highest one, in the order given', async () => {
    const client = scripted({
      'messages.getMessages': messages(todoMessage),
      'messages.appendTodoList': edited,
    })

    const view = await appendTodoList(client, '@someone', 9, [
      'c',
      { text: 'd', entities: [{ _: 'messageEntityBold', offset: 0, length: 1 }] },
    ])

    expect(sent(client, 'messages.appendTodoList')?.['list']).toEqual([
      { _: 'todoItem', id: 5, title: { _: 'textWithEntities', text: 'c', entities: [] } },
      {
        _: 'todoItem',
        id: 6,
        title: {
          _: 'textWithEntities',
          text: 'd',
          entities: [{ _: 'messageEntityBold', offset: 0, length: 1 }],
        },
      },
    ])
    expect(view?.text).toBe('edited')
  })

  it('refuses nothing to add, and a message that carries no checklist', async () => {
    const empty = scripted()
    await expect(appendTodoList(empty, '@someone', 9, [])).rejects.toThrow(/at least one item/)
    expect(empty.calls).toEqual([])

    const plain = scripted({ 'messages.getMessages': messages(message(9)) })
    await expect(appendTodoList(plain, '@someone', 9, ['x'])).rejects.toThrow(/no checklist/)
    expect(methods(plain)).not.toContain('messages.appendTodoList')
  })

  it('ticks and unticks in one change, and refuses a change that changes nothing or contradicts itself', async () => {
    const client = scripted({ 'messages.toggleTodoCompleted': edited })
    await toggleTodoCompleted(client, '@someone', 9, { completed: [1], incompleted: [4] })
    expect(sent(client, 'messages.toggleTodoCompleted')).toMatchObject({
      msg_id: 9,
      completed: [1],
      incompleted: [4],
    })

    const nothing = scripted()
    await expect(toggleTodoCompleted(nothing, '@someone', 9, {})).rejects.toThrow(/changes nothing/)
    await expect(
      toggleTodoCompleted(nothing, '@someone', 9, { completed: [2], incompleted: [2] }),
    ).rejects.toThrow(/at once/)
    expect(nothing.calls).toEqual([])
  })
})

describe('translation', () => {
  const translated = (...values: string[]) => ({
    _: 'messages.translateResult',
    result: values.map((value) => ({ _: 'textWithEntities', text: value, entities: [] })),
  })

  it('translates messages by number, one per message, with the tone asked for', async () => {
    const client = scripted({ 'messages.translateText': translated('uno', 'dos') })

    const result = await translateMessage(client, '@someone', [3, 4], { to: 'es', tone: 'formal' })

    expect(sent(client, 'messages.translateText')).toMatchObject({
      id: [3, 4],
      to_lang: 'es',
      tone: 'formal',
    })
    expect(result.map((one) => one.text)).toEqual(['uno', 'dos'])
  })

  it('refuses an answer that does not pair up with what was asked', async () => {
    const client = scripted({ 'messages.translateText': translated('uno') })

    await expect(translateMessage(client, '@someone', [3, 4], { to: 'es' })).rejects.toThrow(
      /asked for 2 translations/,
    )
  })

  it('translates free text with its formatting, and refuses what is not a language code', async () => {
    const client = scripted({ 'messages.translateText': translated('hola') })

    await translateText(
      client,
      [{ text: 'hi', entities: [{ _: 'messageEntityItalic', offset: 0, length: 2 }] }],
      {
        to: 'es',
      },
    )

    expect(sent(client, 'messages.translateText')).toEqual({
      text: [
        {
          _: 'textWithEntities',
          text: 'hi',
          entities: [{ _: 'messageEntityItalic', offset: 0, length: 2 }],
        },
      ],
      to_lang: 'es',
    })
    await expect(translateText(scripted(), ['hi'], { to: 'Spanish' })).rejects.toThrow(
      /not a language code/,
    )
  })
})

describe('an inline message', () => {
  const classic = {
    _: 'inputBotInlineMessageID' as const,
    dc_id: 4,
    id: 1234567890123n,
    access_hash: -99n,
  }
  const wide = {
    _: 'inputBotInlineMessageID64' as const,
    dc_id: 2,
    owner_id: 5000000000n,
    id: 42,
    access_hash: 77n,
  }

  it('reads and writes the Bot API string form of both identifiers', () => {
    const shortForm = writeInlineMessageId(classic)
    const longForm = writeInlineMessageId(wide)

    // Twenty and twenty-four bytes, unboxed, as base64url without padding.
    expect(atob(shortForm.replace(/-/g, '+').replace(/_/g, '/'))).toHaveLength(20)
    expect(atob(longForm.replace(/-/g, '+').replace(/_/g, '/'))).toHaveLength(24)
    expect(shortForm).not.toMatch(/[=+/]/)
    expect(readInlineMessageId(shortForm)).toEqual(classic)
    expect(readInlineMessageId(longForm)).toEqual(wide)
  })

  it('refuses a string of the wrong length, of the wrong alphabet, or naming no datacenter', () => {
    expect(() => readInlineMessageId('AAAA')).toThrow(/20 or 24 bytes/)
    expect(() => readInlineMessageId('a+b/')).toThrow(/base64url/)
    expect(() => readInlineMessageId(writeInlineMessageId({ ...classic, dc_id: 0 }))).toThrow(
      /datacenter 0/,
    )
    expect(() => readInlineMessageId(writeInlineMessageId({ ...classic, dc_id: 1001 }))).toThrow(
      /datacenter 1001/,
    )
  })

  it('edits it on the datacenter its identifier names, whichever form it came in', async () => {
    const client = scripted()

    await editInlineMessage(client, writeInlineMessageId(wide), {
      text: 'done',
      entities: [{ _: 'messageEntityBold', offset: 0, length: 4 }],
    })
    await editInlineMessage(client, classic, 'again', { noWebpagePreview: true })

    expect(client.elsewhere.map((one) => one.dcId)).toEqual([2, 4])
    expect(client.elsewhere[0]?.query).toEqual({
      _: 'messages.editInlineBotMessage',
      id: wide,
      message: 'done',
      entities: [{ _: 'messageEntityBold', offset: 0, length: 4 }],
    })
    expect(client.elsewhere[1]?.query).toMatchObject({
      id: classic,
      message: 'again',
      no_webpage: true,
    })
    // Not through the default route, which may be another datacenter.
    expect(client.calls).toEqual([])
  })
})

describe('a rich message', () => {
  it('goes out through the ordinary send with the text left empty', async () => {
    const client = scripted()
    const photo = {
      _: 'inputPhoto' as const,
      id: 1n,
      access_hash: 2n,
      file_reference: Uint8Array.of(3),
    }

    await sendRichMessage(
      client,
      '@someone',
      { html: '<h1>Title</h1><img src="cover">', files: [{ id: 'cover', photo }], rtl: true },
      { replyTo: 7, silent: true },
    )

    expect(sent(client, 'messages.sendMessage')).toMatchObject({
      message: '',
      rich_message: {
        _: 'inputRichMessageHTML',
        html: '<h1>Title</h1><img src="cover">',
        rtl: true,
        files: [{ _: 'inputRichFilePhoto', id: 'cover', photo }],
      },
      reply_to: { _: 'inputReplyToMessage', reply_to_msg_id: 7 },
      silent: true,
    })
    expect(typeof sent(client, 'messages.sendMessage')?.['random_id']).toBe('bigint')
  })

  it('passes markdown and assembled blocks through as they are', async () => {
    const markdown = scripted()
    await sendRichMessage(markdown, '@someone', { markdown: '# Title' })
    expect(sent(markdown, 'messages.sendMessage')?.['rich_message']).toEqual({
      _: 'inputRichMessageMarkdown',
      markdown: '# Title',
    })

    const blocks = scripted()
    const payload = { _: 'inputRichMessage' as const, blocks: [] }
    await sendRichMessage(blocks, '@someone', { blocks: payload })
    expect(sent(blocks, 'messages.sendMessage')?.['rich_message']).toBe(payload)
  })
})

describe('a streaming draft', () => {
  const actions = (client: { readonly calls: Call[] }) =>
    client.calls.filter((call) => call.method === 'messages.setTyping').map((call) => call.params)

  it('replaces what is shown on each write, under one key', async () => {
    const client = scripted()
    const draft = await createStreamingDraft(client, '@someone', { topicId: 3, canStop: true })

    await draft.write('Hel')
    await draft.write('Hello')

    const sentActions = actions(client)
    expect(sentActions).toHaveLength(2)
    expect(sentActions[1]).toEqual({
      peer: { _: 'inputPeerUser', user_id: 5n, access_hash: 50n },
      top_msg_id: 3,
      action: {
        _: 'sendMessageTextDraftAction',
        random_id: draft.key,
        text: { _: 'textWithEntities', text: 'Hello', entities: [] },
        can_stop: true,
      },
    })
    expect(actionOf(sentActions[0])['random_id']).toBe(draft.key)
    expect(draft.text.text).toBe('Hello')
  })

  it('appends in append mode, moving formatting by what came before in UTF-16 units', async () => {
    const client = scripted()
    const draft = await createStreamingDraft(client, '@someone', { mode: 'append' })

    await draft.write('😀 ')
    await draft.write({
      text: 'bold',
      entities: [{ _: 'messageEntityBold', offset: 0, length: 4 }],
    })

    // The emoji is two UTF-16 units, so the second piece starts at three.
    expect(draft.text).toEqual({
      _: 'textWithEntities',
      text: '😀 bold',
      entities: [{ _: 'messageEntityBold', offset: 3, length: 4 }],
    })
    expect(actionOf(actions(client)[1])['text']).toEqual(draft.text)
  })

  it('stops once, then refuses to write, and runs nothing in between', async () => {
    const client = scripted()
    const draft = await createStreamingDraft(client, '@someone', { keepOnStop: true })

    await draft.write('partial')
    await draft.stop()
    await draft.stop()

    expect(actions(client).map((one) => (one['action'] as { _: string })._)).toEqual([
      'sendMessageTextDraftAction',
      'sendMessageStopDraftAction',
    ])
    expect(draft.stopped).toBe(true)
    await expect(draft.write('more')).rejects.toThrow(/stopped/)
    expect(actions(client)).toHaveLength(2)
  })

  it('keeps the text it had when a write fails, because the reader never saw it', async () => {
    const client = scripted({
      'messages.setTyping': (_params: unknown, call: number) => {
        if (call === 2) throw new Error('FLOOD_WAIT_3 (420)')

        return true
      },
    })
    const draft = await createStreamingDraft(client, '@someone', { mode: 'append' })

    await draft.write('one ')
    await expect(draft.write('two')).rejects.toThrow(/FLOOD_WAIT/)

    expect(draft.text.text).toBe('one ')
  })

  it('streams a rich draft as the input form, replaced whole on each write', async () => {
    const client = scripted()
    const draft = await createRichStreamingDraft(client, '@channel_news')

    await draft.write({ markdown: '# One' })
    await draft.stop()

    const [first, last] = actions(client)
    expect(first?.['action']).toEqual({
      _: 'inputSendMessageRichMessageDraftAction',
      random_id: draft.key,
      rich_message: { _: 'inputRichMessageMarkdown', markdown: '# One' },
    })
    expect(last?.['action']).toEqual({ _: 'sendMessageStopDraftAction', random_id: draft.key })
  })
})

describe('finding the album, the reply, the link and the button', () => {
  const grouped = (
    id: number,
    group: bigint | undefined,
    peer: Record<string, unknown> = { _: 'peerChannel', channel_id: 77n },
  ) => message(id, { peer_id: peer, ...(group === undefined ? {} : { grouped_id: group }) })

  it('looks nine either side in a channel and returns the album in order', async () => {
    const client = scripted({
      'channels.getMessages': messages(
        grouped(43, 7n),
        grouped(41, 7n),
        grouped(42, 7n),
        grouped(44, 8n),
      ),
    })

    const album = await getMessageGroup(client, '@channel_news', 42)

    const asked = (carried(client, 'channels.getMessages')['id'] as { id: number }[]).map(
      (one) => one.id,
    )
    expect(asked[0]).toBe(33)
    expect(asked.at(-1)).toBe(51)
    expect(album.map((view) => view.id)).toEqual([41, 42, 43])
  })

  it('looks further elsewhere, because other conversations share the numbering', async () => {
    const client = scripted({
      'messages.getMessages': messages(grouped(42, 7n, { _: 'peerUser', user_id: 5n })),
    })

    await getMessageGroup(client, '@someone', 42)

    const asked = (carried(client, 'messages.getMessages')['id'] as { id: number }[]).map(
      (one) => one.id,
    )
    expect(asked).toHaveLength(39)
    expect(asked[0]).toBe(23)
  })

  it('refuses a message that is not in an album', async () => {
    const client = scripted({ 'channels.getMessages': messages(grouped(42, undefined)) })

    await expect(getMessageGroup(client, '@channel_news', 42)).rejects.toThrow(
      /not part of an album/,
    )
  })

  it('asks for what a message replies to, rather than by the number in its header', async () => {
    const client = scripted({ 'channels.getMessages': messages(grouped(10, undefined)) })
    const replying = new MessageView(grouped(50, undefined) as never)
    Object.defineProperty(replying, 'replyToMessageId', { value: 10 })

    const found = await getReplyTo(client, replying)

    expect(sent(client, 'channels.getMessages')?.['id']).toEqual([
      { _: 'inputMessageReplyTo', id: 50 },
    ])
    expect(found?.id).toBe(10)

    const none = scripted()
    expect(await getReplyTo(none, new MessageView(message(3) as never))).toBeUndefined()
    expect(none.calls).toEqual([])
  })

  it('asks for a button’s message through the query that named it', async () => {
    const client = scripted({ 'messages.getMessages': messages(message(8)) })

    const found = await getCallbackQueryMessage(client, {
      peer: '@someone',
      messageId: 8,
      queryId: 99n,
    })

    expect(sent(client, 'messages.getMessages')?.['id']).toEqual([
      { _: 'inputMessageCallbackQuery', id: 8, query_id: 99n },
    ])
    expect(found?.id).toBe(8)
  })

  it('finds the message a public and a private link name', async () => {
    const publicLink = scripted({ 'channels.getMessages': messages(grouped(42, undefined)) })
    await getMessageByLink(publicLink, 'https://t.me/channel_news/42')
    expect(publicLink.resolved).toEqual(['channel_news'])

    const privateLink = scripted({ 'channels.getMessages': messages(grouped(42, undefined)) })
    await getMessageByLink(privateLink, 't.me/c/1234567890/42')
    expect(privateLink.resolved).toEqual([{ kind: 'channel', id: 1234567890n }])
    expect(sent(privateLink, 'channels.getMessages')?.['id']).toEqual([
      { _: 'inputMessageID', id: 42 },
    ])
  })

  it('finds a comment in the post’s discussion group', async () => {
    const client = scripted({
      'messages.getDiscussionMessage': {
        _: 'messages.discussionMessage',
        messages: [message(100, { peer_id: { _: 'peerChannel', channel_id: 88n } })],
        unread_count: 0,
        chats: [],
        users: [],
      },
      'channels.getMessages': messages(
        message(115, { peer_id: { _: 'peerChannel', channel_id: 88n } }),
      ),
    })

    const found = await getMessageByLink(client, 'https://t.me/channel_news/5?comment=115')

    expect(sent(client, 'messages.getDiscussionMessage')).toMatchObject({ msg_id: 5 })
    expect(sent(client, 'channels.getMessages')).toMatchObject({
      channel: { channel_id: 88n },
      id: [{ _: 'inputMessageID', id: 115 }],
    })
    expect(found?.id).toBe(115)
  })

  it('refuses a link that does not name a message, before any request', async () => {
    const client = scripted()

    await expect(getMessageByLink(client, 'https://t.me/channel_news')).rejects.toThrow(
      /not a link to a message/,
    )
    expect(client.calls).toEqual([])
  })

  it('finds messages outside channels by number alone, positionally', async () => {
    const client = scripted({
      'messages.getMessages': messages(message(3), { _: 'messageEmpty', id: 4 }),
    })

    const found = await getMessagesOutsideChannels(client, [4, 3, 9])

    expect(client.resolved).toEqual([])
    expect(found.map((view) => view?.id)).toEqual([undefined, 3, undefined])
  })
})

describe('what hangs off several messages at once', () => {
  const reactionsFor = (...ids: number[]) => ({
    ...UPDATES,
    updates: ids.map((id) => ({
      _: 'updateMessageReactions',
      peer: { _: 'peerUser', user_id: 5n },
      msg_id: id,
      reactions: { _: 'messageReactions', results: [{ _: 'reactionCount', count: id }] },
    })),
  })

  it('answers reactions one per message, with a gap where there are none', async () => {
    const answer = reactionsFor(4)
    const client = scripted({ 'messages.getMessagesReactions': answer })

    const found = await getMessageReactions(client, '@someone', [3, 4])

    expect(found[0]).toBeUndefined()
    expect(found[1]).toMatchObject({ results: [{ count: 4 }] })
  })

  it('asks one conversation at a time and answers in the order given', async () => {
    const client = scripted({
      'messages.getMessagesReactions': (params: Record<string, unknown>) =>
        reactionsFor(...(params['id'] as number[])),
    })
    const inUser = new MessageView(message(3) as never)
    const inChannel = new MessageView(
      message(7, { peer_id: { _: 'peerChannel', channel_id: 77n } }) as never,
    )

    const found = await getReactionsOf(client, [inChannel, inUser])

    expect(client.calls.map((call) => call.params['id'])).toEqual([[7], [3]])
    expect(
      found.map((one) => (one as { results: { count: number }[] } | undefined)?.results[0]?.count),
    ).toEqual([7, 3])
  })

  it('answers fact checks one per message, and refuses an answer that does not pair up', async () => {
    const check = { _: 'factCheck', need_check: true, hash: 1n }
    const client = scripted({ 'messages.getFactCheck': [check, check] })
    expect(await getFactCheck(client, '@someone', [1, 2])).toHaveLength(2)

    const short = scripted({ 'messages.getFactCheck': [check] })
    await expect(getFactCheck(short, '@someone', [1, 2])).rejects.toThrow(/asked about 2/)
  })

  it('answers a preview only where Telegram would show one', async () => {
    const page = {
      _: 'messageMediaWebPage',
      webpage: { _: 'webPage', id: 1n, url: 'u', display_url: 'u', hash: 0 },
    }
    const client = scripted({
      'messages.getWebPagePreview': {
        _: 'messages.webPagePreview',
        media: page,
        chats: [],
        users: [],
      },
    })
    expect(await getWebPagePreview(client, 'see https://example.com')).toBe(page)

    const nothing = scripted({
      'messages.getWebPagePreview': {
        _: 'messages.webPagePreview',
        media: { _: 'messageMediaWebPage', webpage: { _: 'webPageEmpty', id: 1n } },
        chats: [],
        users: [],
      },
    })
    expect(await getWebPagePreview(nothing, 'no link')).toBeUndefined()
  })

  it('answers the effect list, or nothing when the version held is current', async () => {
    const list = scripted({
      'messages.getAvailableEffects': {
        _: 'messages.availableEffects',
        hash: 9,
        effects: [],
        documents: [],
      },
    })
    expect(await getAvailableMessageEffects(list)).toEqual({ effects: [], documents: [], hash: 9 })
    expect(sent(list, 'messages.getAvailableEffects')).toEqual({ hash: 0 })

    const current = scripted({
      'messages.getAvailableEffects': { _: 'messages.availableEffectsNotModified' },
    })
    expect(await getAvailableMessageEffects(current, 9)).toBeUndefined()
    expect(sent(current, 'messages.getAvailableEffects')).toEqual({ hash: 9 })
  })

  it('refuses a reply lookup for a message that names no conversation', async () => {
    const orphan = new MessageView({ _: 'messageEmpty', id: 3 } as never)
    Object.defineProperty(orphan, 'replyToMessageId', { value: 1 })

    await expect(getReplyTo(scripted(), orphan)).rejects.toThrow(PeerError)
  })
})
