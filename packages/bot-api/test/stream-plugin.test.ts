// SPDX-License-Identifier: MPL-2.0

/**
 * The stream plugin and the formatted-params hook, on a bot.
 *
 * Most cases run on the in-process harness, which records every call's
 * parameters. One case runs the real fetch client against a local HTTP server
 * playing Telegram, so what is asserted there is the request as it is actually
 * encoded and sent.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createLogger, silentSink } from '@yuigram/core'
import { afterEach, describe, expect, it } from 'vitest'
import { Bot } from '../src/bot.js'
import { bold, format, formattedParams, italic, link, markup } from '../src/markup/index.js'
import { stream } from '../src/stream/index.js'
import { floodWait, mockBot, ok } from '../src/testing/index.js'

const settle = (ms = 20): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function until(condition: () => boolean, what: string, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await settle(5)
  }
}

/** A source released a piece at a time by the case. */
function gate() {
  const queue: string[] = []
  let done = false
  let wake: (() => void) | undefined
  let returned = false

  return {
    returned: () => returned,
    push(text: string) {
      queue.push(text)
      wake?.()
    },
    end() {
      done = true
      wake?.()
    },
    source: {
      [Symbol.asyncIterator]: () => ({
        next: async (): Promise<IteratorResult<string>> => {
          for (;;) {
            const next = queue.shift()
            if (next !== undefined) return { value: next, done: false }
            if (done) return { value: undefined, done: true }
            await new Promise<void>((resolve) => {
              wake = resolve
            })
          }
        },
        return: async (): Promise<IteratorResult<string>> => {
          returned = true
          wake?.()

          return { value: undefined, done: true }
        },
      }),
    },
  }
}

const opened: { dispose(): Promise<void> | void }[] = []
afterEach(async () => {
  for (const one of opened.splice(0)) await one.dispose()
})

function harness() {
  const mock = mockBot()
  opened.push(mock)
  mock.on('sendMessageDraft', ok(true))
  mock.on('sendRichMessageDraft', ok(true))
  mock.on('sendRichMessage', (request) =>
    ok({ message_id: 7000, date: 0, chat: { id: request.params['chat_id'], type: 'private' } }),
  )

  return mock
}

describe('streaming from a message', () => {
  it('streams into the private chat it came from, drafts and then a message', async () => {
    const { bot, send, calls } = harness()
    const streaming = stream({ editInterval: 1 })
    bot.extend(streaming)
    bot.onMessage(async (message) => {
      await (message as unknown as { stream(source: unknown): Promise<unknown> }).stream([
        'Hello, ',
        'world',
      ])
    })

    await send.message('go')

    const drafts = calls.callsTo('sendMessageDraft')
    expect(drafts[0]?.params).toMatchObject({ text: '' })
    expect(typeof drafts[0]?.params['draft_id']).toBe('number')
    expect(calls.callsTo('sendMessage').at(-1)?.params).toMatchObject({ text: 'Hello, world' })
  })

  it('refuses a chat that is not private, before anything is sent', async () => {
    const { bot, send, calls } = harness()
    bot.extend(stream())
    const failures: unknown[] = []
    bot.onMessage(async (message) => {
      await (message as unknown as { stream(source: unknown): Promise<unknown> })
        .stream(['x'])
        .catch((error: unknown) => failures.push(error))
    })

    await send.message('go', { chat: { id: -100, type: 'supergroup', title: 'group' } as never })

    expect(String(failures[0])).toMatch(/private chats/)
    expect(calls.callsTo('sendMessageDraft')).toHaveLength(0)
  })

  it('puts the keyboard on the last message only', async () => {
    const { bot, calls } = harness()
    const streaming = stream({ editInterval: 1, maxLength: 10 })
    bot.extend(streaming)
    await bot.identify()
    await bot.handleUpdate({
      update_id: 1,
      message: { message_id: 1, date: 0, chat: { id: 5, type: 'private' }, text: 'x' },
    } as never)

    const reply_markup = { inline_keyboard: [[{ text: 'again', callback_data: 'again' }]] }
    await streaming.controls.send({ chatId: 5, source: ['aaaa bbbb cccc dddd eeee'], reply_markup })

    const sends = calls.callsTo('sendMessage')
    expect(sends.length).toBeGreaterThan(1)
    expect(sends.slice(0, -1).every((call) => call.params['reply_markup'] === undefined)).toBe(true)
    expect(sends.at(-1)?.params['reply_markup']).toEqual(reply_markup)
  })

  it('uses the rich methods for a rich stream', async () => {
    const { bot, calls } = harness()
    const streaming = stream({ editInterval: 1, rich: true })
    bot.extend(streaming)
    await bot.identify()
    await bot.handleUpdate({
      update_id: 1,
      message: { message_id: 1, date: 0, chat: { id: 5, type: 'private' }, text: 'x' },
    } as never)

    await streaming.controls.send({ chatId: 5, source: ['# Title\n\n', 'Some **bold** text'] })

    expect(calls.callsTo('sendRichMessageDraft')[0]?.params['rich_message']).toEqual({
      blocks: [{ type: 'thinking', text: '…' }],
    })
    expect(calls.callsTo('sendRichMessage').at(-1)?.params['rich_message']).toEqual({
      markdown: '# Title\n\nSome **bold** text',
    })
    await expect(
      streaming.controls.send({ chatId: 5, source: ['x'], parseMode: 'HTML' }),
    ).rejects.toThrow(/rich or parseMode/)
  })

  it('holds drafts back for a flood wait Telegram sends', async () => {
    const { bot, calls, on } = harness()
    const streaming = stream({ editInterval: 1, thinkingPlaceholder: false })
    bot.extend(streaming)
    await bot.identify()
    await bot.handleUpdate({
      update_id: 1,
      message: { message_id: 1, date: 0, chat: { id: 5, type: 'private' }, text: 'x' },
    } as never)

    let first = true
    on('sendMessageDraft', () => {
      if (first) {
        first = false

        return floodWait(1)
      }

      return ok(true)
    })
    const errors: unknown[] = []
    const feed = gate()
    const running = streaming.controls.send({
      chatId: 5,
      source: feed.source,
      onError: (error) => void errors.push(error),
    })
    feed.push('a')
    await until(() => calls.callsTo('sendMessageDraft').length === 1, 'the first draft')
    const floodedAt = Date.now()
    feed.push('b')
    await until(() => calls.callsTo('sendMessageDraft').length === 2, 'the draft after the wait')
    feed.end()
    await running

    expect(Date.now() - floodedAt).toBeGreaterThanOrEqual(900)
    expect((errors[0] as { name: string }).name).toBe('FloodError')
  })
})

describe('who may stop a stream', () => {
  async function running(canStop = true) {
    const mock = harness()
    const streaming = stream({ editInterval: 1, canStop })
    mock.bot.extend(streaming)
    await mock.bot.identify()
    await mock.bot.handleUpdate({
      update_id: 1,
      message: { message_id: 1, date: 0, chat: { id: 5, type: 'private' }, text: 'x' },
    } as never)

    const feed = gate()
    const result = streaming.controls.send({ chatId: 5, source: feed.source })
    feed.push('partial')
    await until(() => mock.calls.callsTo('sendMessageDraft').length >= 2, 'a draft')
    const draftId = mock.calls.callsTo('sendMessageDraft').at(-1)?.params['draft_id'] as number

    const stopUpdate = (chat: number, draft: number, id: number) =>
      mock.send.update({
        update_id: id,
        stopped_message_generation: { chat: { id: chat, type: 'private' }, draft_id: draft },
      } as never)

    return { ...mock, streaming, feed, result, draftId, stopUpdate }
  }

  it('stops for the draft it showed, in its own chat', async () => {
    const { streaming, feed, result, draftId, stopUpdate, calls } = await running()

    await stopUpdate(5, draftId, 10)
    const outcome = await result

    expect(outcome.stopped).toBe(true)
    expect(feed.returned()).toBe(true)
    expect(
      calls.callsTo('sendMessage').filter((call) => call.params['chat_id'] === 5),
    ).toHaveLength(0)
    expect(streaming.controls.active).toEqual([])
  })

  it('ignores a stop from another chat, for another draft, or for a stream that never offered one', async () => {
    const other = await running()
    await other.stopUpdate(6, other.draftId, 10)
    await other.stopUpdate(5, other.draftId + 1, 11)
    await settle(30)
    expect(other.streaming.controls.active[0]?.stopped).toBe(false)
    other.feed.end()
    expect((await other.result).stopped).toBe(false)

    const unoffered = await running(false)
    await unoffered.stopUpdate(5, unoffered.draftId, 10)
    await settle(30)
    expect(unoffered.streaming.controls.active[0]?.stopped).toBe(false)
    unoffered.feed.end()
    await unoffered.result
  })

  it('ignores a late stop for a stream that has ended', async () => {
    const first = await running()
    first.feed.end()
    await first.result

    const feed = gate()
    const next = first.streaming.controls.send({ chatId: 5, source: feed.source })
    feed.push('second')
    await until(() => first.streaming.controls.active.length === 1, 'the second stream')
    await first.stopUpdate(5, first.draftId, 20)
    await settle(30)

    expect(first.streaming.controls.active[0]?.stopped).toBe(false)
    feed.end()
    expect((await next).stopped).toBe(false)
  })

  it('subscribes to the stop update when subscriptions follow the handlers', async () => {
    const { bot, calls, on } = harness()
    on('getUpdates', ok([]))
    bot.extend(stream())
    bot.onMessage(() => {})

    const polling = bot.poll({ allowedUpdates: 'auto', timeout: 0 } as never)
    await until(() => calls.callsTo('getUpdates').length > 0, 'the first poll')
    await bot.stop({ timeout: 100 })
    await polling.catch(() => undefined)

    const allowed = calls.callsTo('getUpdates')[0]?.params['allowed_updates'] as string[]
    expect(allowed).toContain('stopped_message_generation')
    expect(allowed).toContain('message')
  })
})

describe('formatted parameters', () => {
  it('turn a formatted value in any slot into its two fields, leaving the caller’s objects alone', async () => {
    const { bot, calls, on } = harness()
    on('sendPoll', ok({ message_id: 1, date: 0, chat: { id: 1, type: 'private' } }))
    bot.extend(markup())
    await bot.identify()
    await bot.handleUpdate({
      update_id: 1,
      message: { message_id: 1, date: 0, chat: { id: 5, type: 'private' }, text: 'x' },
    } as never)

    const options = [{ text: bold('Yes') }, { text: 'No' }]
    await bot.api.sendPoll({
      chat_id: 5,
      question: format`Lunch at ${italic('noon')}?` as never,
      options: options as never,
    })

    const params = calls.callsTo('sendPoll')[0]?.params
    expect(params).toMatchObject({
      question: 'Lunch at noon?',
      question_entities: [{ type: 'italic', offset: 9, length: 4 }],
      options: [
        { text: 'Yes', text_entities: [{ type: 'bold', offset: 0, length: 3 }] },
        { text: 'No' },
      ],
    })
    expect(options[0]?.text).toBeInstanceOf(Object)
  })

  it('refuses a formatted value alongside a parse mode or its own ranges', async () => {
    const { bot } = harness()
    bot.hook(formattedParams())
    await bot.identify()

    await expect(
      bot.api.sendMessage({ chat_id: 5, text: bold('x') as never, parse_mode: 'HTML' }),
    ).rejects.toThrow(/nothing to parse/)
    await expect(
      bot.api.sendMessage({ chat_id: 5, text: bold('x') as never, entities: [] }),
    ).rejects.toThrow(/also given/)
  })

  it('give both fields typed, with no hook at all', () => {
    const line = link('https://example.com')('here')

    expect(line.as('caption')).toEqual({
      caption: 'here',
      caption_entities: [{ type: 'text_link', offset: 0, length: 4, url: 'https://example.com' }],
    })
    expect(line.as('text')).toHaveProperty('entities')
  })
})

describe('the requests as sent over HTTP', () => {
  let server: Server | undefined
  afterEach(async () => {
    await new Promise<void>((resolve) =>
      server === undefined ? resolve() : server.close(() => resolve()),
    )
    server = undefined
  })

  it('encodes drafts and messages as Telegram receives them', async () => {
    const received: { method: string; contentType: string; body: Record<string, unknown> }[] = []
    server = createServer((request, response) => {
      let body = ''
      request.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf8')
      })
      request.on('end', () => {
        const method = (request.url ?? '').split('/').at(-1) as string
        received.push({
          method,
          contentType: request.headers['content-type'] ?? '',
          body: body === '' ? {} : JSON.parse(body),
        })
        const result =
          method === 'getMe'
            ? { id: 1, is_bot: true, first_name: 'b', username: 'b' }
            : method === 'sendMessage'
              ? {
                  message_id: received.length,
                  date: 0,
                  chat: { id: 5, type: 'private' },
                  text: 'x',
                }
              : true
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ ok: true, result }))
      })
    })
    await new Promise<void>((resolve) => (server as Server).listen(0, '127.0.0.1', () => resolve()))
    const port = ((server as Server).address() as AddressInfo).port

    const bot = new Bot('0:TEST_TOKEN_NOT_A_REAL_CREDENTIAL_000000', {
      baseUrl: `http://127.0.0.1:${port}`,
      log: createLogger({ sink: silentSink() }),
    })
    const streaming = stream({ editInterval: 1, parseMode: 'MarkdownV2', maxLength: 16 })
    bot.extend(streaming)
    await bot.identify()
    await bot.handleUpdate({
      update_id: 1,
      message: { message_id: 1, date: 0, chat: { id: 5, type: 'private' }, text: 'x' },
    } as never)

    const result = await streaming.controls.send({
      chatId: 5,
      source: ['😀 *bold ', 'words across* a cut'],
    })

    const drafts = received.filter((request) => request.method === 'sendMessageDraft')
    const sends = received.filter((request) => request.method === 'sendMessage')
    expect(drafts.length).toBeGreaterThan(0)
    expect(drafts.every((request) => request.contentType.startsWith('application/json'))).toBe(true)
    expect(
      drafts.every(
        (request) => typeof request.body['draft_id'] === 'number' && request.body['chat_id'] === 5,
      ),
    ).toBe(true)
    expect(sends.map((request) => request.body['text']).join('')).toBe('😀 bold words across a cut')
    expect(sends[0]?.body['entities']).toEqual([{ type: 'bold', offset: 3, length: 11 }])
    expect(sends[1]?.body['entities']).toEqual([{ type: 'bold', offset: 0, length: 6 }])
    expect(sends.every((request) => request.body['parse_mode'] === undefined)).toBe(true)
    expect(result.messages).toHaveLength(sends.length)
  })
})
