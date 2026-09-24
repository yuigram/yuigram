/**
 * Streaming from an account, and the mapping between shared ranges and
 * MTProto's constructors.
 *
 * The account here is the part of one a stream uses, recording what it was
 * asked; the engine behind it is the one the Bot API uses, tested on its own.
 */

import { bold, customEmoji, Formatted, link, mentionUser, pre, time } from '@yuigram/core/format'
import { describe, expect, it } from 'vitest'
import { fromTlEntities, toTlEntities } from '../src/format/neutral.js'
import { type StreamingAccount, streamTo } from '../src/stream/index.js'

const settle = (ms = 10): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function until(condition: () => boolean, what: string, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await settle(5)
  }
}

/** An account's streaming surface, recording every call. */
function account(name = 'me') {
  const writes: { key: bigint; text: string; entities: unknown[] }[] = []
  const sends: { text: string; entities: unknown[]; options: unknown }[] = []
  const typing: ((context: never) => unknown)[] = []
  let nextKey = 100n

  const surface: StreamingAccount = {
    name,
    resolve: async () => ({ _: 'inputPeerUser', user_id: 42n, access_hash: 1n }),
    createStreamingDraft: async () => {
      const key = nextKey
      nextKey += 1n

      return {
        key,
        stopped: false,
        text: { _: 'textWithEntities', text: '', entities: [] },
        write: async (body: unknown) => {
          const value = body as { text: string; entities: unknown[] }
          writes.push({ key, text: value.text, entities: value.entities })
        },
        stop: async () => {},
      } as never
    },
    createRichStreamingDraft: async () => {
      throw new Error('not used here')
    },
    sendText: async (_peer, body, options) => {
      const value = body as { text: string; entities: unknown[] }
      sends.push({ text: value.text, entities: value.entities, options })

      return { id: sends.length } as never
    },
    sendRichMessage: async () => ({ id: 0 }) as never,
    on: (_kind, handler) => {
      typing.push(handler)
    },
  }

  const report = (userId: bigint, key: bigint) => {
    for (const handler of typing) {
      handler({
        raw: {
          _: 'updateUserTyping',
          user_id: userId,
          action: { _: 'sendMessageStopDraftAction', random_id: key },
        },
      } as never)
    }
  }

  return { surface, writes, sends, typing, report }
}

function feed() {
  const queue: string[] = []
  let done = false
  let wake: (() => void) | undefined

  return {
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
        return: async (): Promise<IteratorResult<string>> => ({ value: undefined, done: true }),
      }),
    },
  }
}

describe('streaming from an account', () => {
  it('writes drafts and sends the text with MTProto ranges', async () => {
    const { surface, writes, sends } = account()

    const result = await streamTo(surface, '@someone', ['*bold* and ', '_more_'], {
      parseMode: 'MarkdownV2',
      editInterval: 1,
    })

    expect(writes.length).toBeGreaterThan(0)
    expect(sends).toEqual([
      {
        text: 'bold and more',
        entities: [
          { _: 'messageEntityBold', offset: 0, length: 4 },
          { _: 'messageEntityItalic', offset: 9, length: 4 },
        ],
        options: {},
      },
    ])
    expect(result.messages).toHaveLength(1)
  })

  it('opens a new draft for each window, and sends each window in turn', async () => {
    const { surface, writes, sends } = account()
    const text = feed()
    const running = streamTo(surface, '@someone', text.source, { maxLength: 10, editInterval: 1 })

    text.push('one two ')
    await until(() => writes.length > 0, 'the first window drafted')
    text.push('three four ')
    await until(() => sends.length > 0 && writes.length > 1, 'the second window drafted')
    text.push('five six')
    text.end()
    await running

    expect(sends.map((send) => send.text).join('')).toBe('one two three four five six')
    expect(new Set(writes.map((write) => write.key)).size).toBeGreaterThan(1)
  })

  // A source that has everything at once fills windows faster than any draft
  // is due, so they are sent straight away with no draft at all.
  it('sends windows without drafting them when the text is all there at once', async () => {
    const { surface, writes, sends } = account()

    await streamTo(surface, '@someone', ['one two three four five six'], {
      maxLength: 10,
      editInterval: 1,
    })

    expect(sends.map((send) => send.text).join('')).toBe('one two three four five six')
    expect(writes).toHaveLength(0)
  })

  it('stops for its own draft, reported from its own conversation, and for nothing else', async () => {
    const { surface, writes, report, typing } = account()
    const text = feed()
    const running = streamTo(surface, '@someone', text.source, { canStop: true, editInterval: 1 })
    text.push('partial')
    await until(() => writes.length > 0, 'a draft')
    const key = writes[0]?.key as bigint

    report(99n, key)
    report(42n, key + 50n)
    await settle(30)
    report(42n, key)
    const result = await running

    expect(result.stopped).toBe(true)
    expect(typing).toHaveLength(1)
  })

  it('installs one listener per account, however many streams it runs', async () => {
    const { surface, typing } = account()

    await streamTo(surface, '@a', ['x'], { editInterval: 1 })
    await streamTo(surface, '@b', ['y'], { editInterval: 1 })

    expect(typing).toHaveLength(1)
  })

  it('puts the send options on every message and the markup on the last only', async () => {
    const { surface, sends } = account()
    const markup = { _: 'replyInlineMarkup', rows: [] } as never

    await streamTo(surface, '@someone', ['aaaa bbbb cccc dddd'], {
      maxLength: 10,
      editInterval: 1,
      topicId: 3,
      send: { silent: true, markup },
    })

    expect(sends.every((send) => (send.options as { topicId?: number }).topicId === 3)).toBe(true)
    expect(sends.every((send) => (send.options as { silent?: boolean }).silent === true)).toBe(true)
    expect(
      sends
        .slice(0, -1)
        .every((send) => (send.options as { markup?: unknown }).markup === undefined),
    ).toBe(true)
    const last = sends.at(-1) as { options: { markup?: unknown } }
    expect(last.options.markup).toBe(markup)
  })
})

describe('ranges between the two shapes', () => {
  it('maps every kind both ways', () => {
    const value = Formatted.concat(
      bold('b'),
      link('https://a.b')('l'),
      mentionUser('m', 7),
      customEmoji('👍', '5368324170671202286'),
      pre('code', 'ts'),
      time('t', 1647531900, { weekday: true, dateStyle: 'short', timeStyle: 'long' }),
    )
    const tl = toTlEntities(value.entities)

    expect(tl.map((entity) => entity._)).toEqual([
      'messageEntityBold',
      'messageEntityTextUrl',
      'messageEntityMentionName',
      'messageEntityCustomEmoji',
      'messageEntityPre',
      'messageEntityFormattedDate',
    ])
    expect(tl[5]).toMatchObject({
      date: 1647531900,
      day_of_week: true,
      short_date: true,
      long_time: true,
    })

    const back = fromTlEntities(tl)
    expect(back.map((entity) => entity.type)).toEqual(value.entities.map((entity) => entity.type))
    expect(back[5]?.date_time_format).toBe('wdT')
    expect(back[3]?.custom_emoji_id).toBe('5368324170671202286')
  })

  it('maps a collapsed quotation to its flag and back', () => {
    const tl = toTlEntities([
      { type: 'blockquote', offset: 0, length: 1 },
      { type: 'expandable_blockquote', offset: 2, length: 1 },
    ])

    expect(tl).toEqual([
      { _: 'messageEntityBlockquote', offset: 0, length: 1 },
      { _: 'messageEntityBlockquote', offset: 2, length: 1, collapsed: true },
    ])
    expect(fromTlEntities(tl).map((entity) => entity.type)).toEqual([
      'blockquote',
      'expandable_blockquote',
    ])
  })
})
