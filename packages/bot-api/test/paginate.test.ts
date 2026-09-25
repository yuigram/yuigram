/**
 * Reading lists a page at a time, and showing them a screen at a time.
 *
 * The first half drives the two walks with fetchers that record what they
 * were asked for, since how many requests a walk makes and what each asks for
 * is the whole of its behaviour. The second half drives the pager's buttons
 * and presses the way a group chat would: somebody else pressing is the case
 * that matters.
 */

import { CancelledError, createLogger, silentSink, ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { Bot } from '../src/bot.js'
import { CallbackDataTooLong } from '../src/callback-data.js'
import { pager } from '../src/pager.js'
import { cursorPages, offsetPages, type Page } from '../src/paginate.js'
import { mockTransport, ok } from '../src/testing/mock-transport.js'

const TOKEN = '0:TEST_TOKEN_NOT_A_REAL_CREDENTIAL_000000'

/** A list of `size` numbers served by position, recording each request. */
function byPosition(size: number, total: number | undefined = size) {
  const asked: Array<[number, number]> = []
  const fetch = async (offset: number, limit: number): Promise<Page<number>> => {
    asked.push([offset, limit])
    const items = Array.from(
      { length: Math.max(0, Math.min(limit, size - offset)) },
      (_, i) => offset + i,
    )
    return { items, total }
  }
  return { asked, fetch }
}

/** A list served by cursor, in pages of `per`, recording each cursor asked for. */
function byCursor(size: number, per: number) {
  const asked: string[] = []
  const fetch = async (cursor: string, limit: number): Promise<Page<number>> => {
    asked.push(cursor)
    const from = cursor === '' ? 0 : Number(cursor)
    const count = Math.min(per, limit, size - from)
    const items = Array.from({ length: Math.max(0, count) }, (_, i) => from + i)
    const end = from + items.length
    return { items, total: size, next: end < size ? String(end) : '' }
  }
  return { asked, fetch }
}

describe('reading by position', () => {
  it('reads every page in order and stops on the short one', async () => {
    const list = byPosition(250)
    const all = await offsetPages(list.fetch).collect()

    expect([...all]).toEqual(Array.from({ length: 250 }, (_, i) => i))
    expect(all.total).toBe(250)
    expect(list.asked).toEqual([
      [0, 100],
      [100, 100],
      [200, 100],
    ])
  })

  it('stops on a short page when Telegram gives no total', async () => {
    const list = byPosition(250, undefined)
    const all = await offsetPages(list.fetch).collect()

    expect(all).toHaveLength(250)
    expect(all.total).toBeUndefined()
    expect(list.asked.map(([offset]) => offset)).toEqual([0, 100, 200])
  })

  it('stops at the total rather than asking for an empty page', async () => {
    const list = byPosition(200)
    await offsetPages(list.fetch).collect()

    expect(list.asked).toEqual([
      [0, 100],
      [100, 100],
    ])
  })

  it('asks once for an empty list, and not at all for a limit of none', async () => {
    const empty = byPosition(0)
    expect([...(await offsetPages(empty.fetch).collect())]).toEqual([])
    expect(empty.asked).toHaveLength(1)

    const none = byPosition(10)
    expect([...(await offsetPages(none.fetch, { limit: 0 }).collect())]).toEqual([])
    expect(none.asked).toEqual([])
  })

  it('stops after the limit, asking only for what it still needs', async () => {
    const list = byPosition(1_000)
    const some = await offsetPages(list.fetch, { limit: 130, pageSize: 50, offset: 10 }).collect()

    expect(some).toHaveLength(130)
    expect(some[0]).toBe(10)
    expect(list.asked).toEqual([
      [10, 50],
      [60, 50],
      [110, 30],
    ])
  })

  it('fetches nothing further once the loop stops', async () => {
    const list = byPosition(1_000)
    for await (const item of offsetPages(list.fetch, { pageSize: 10 })) {
      if (item === 12) break
    }
    expect(list.asked).toEqual([
      [0, 10],
      [10, 10],
    ])
  })

  it('refuses a page size or offset it cannot ask for', () => {
    const list = byPosition(1)
    expect(() => offsetPages(list.fetch, { pageSize: 101 })).toThrow(ValidationError)
    expect(() => offsetPages(list.fetch, { offset: -1 })).toThrow(ValidationError)
    expect(() => offsetPages(list.fetch, { limit: 1.5 })).toThrow(ValidationError)
  })
})

describe('reading by cursor', () => {
  it('follows each next cursor until there is none', async () => {
    const list = byCursor(25, 10)
    const pages = cursorPages(list.fetch)
    const all = await pages.collect()

    expect([...all]).toEqual(Array.from({ length: 25 }, (_, i) => i))
    expect(pages.total).toBe(25)
    expect(list.asked).toEqual(['', '10', '20'])
  })

  it('starts from a cursor it is given, and stops on an empty page', async () => {
    const list = byCursor(25, 10)
    expect([...(await cursorPages(list.fetch, { cursor: '20' }).collect())]).toEqual([
      20, 21, 22, 23, 24,
    ])

    const stuck = cursorPages(async () => ({ items: [], next: 'more' }))
    expect([...(await stuck.collect())]).toEqual([])
  })

  it('refuses a cursor that comes back unchanged rather than looping forever', async () => {
    const pages = cursorPages(async (cursor) => ({ items: [1], next: cursor === '' ? 'a' : 'a' }))

    await expect(pages.collect()).rejects.toThrow(/cursor it was asked for \('a'\)/)
  })

  it('stops at its limit even when a page holds more', async () => {
    const pages = cursorPages(async () => ({ items: [1, 2, 3, 4, 5], next: 'x' }), { limit: 3 })

    expect([...(await pages.collect())]).toEqual([1, 2, 3])
  })
})

describe('cancelling', () => {
  it('stops between pages when its signal is aborted, and hands the signal to each request', async () => {
    const controller = new AbortController()
    const signals: Array<AbortSignal | undefined> = []
    const pages = offsetPages(
      async (offset, limit, signal) => {
        signals.push(signal)
        if (offset === 10) controller.abort()
        return { items: Array.from({ length: limit }, (_, i) => offset + i) }
      },
      { pageSize: 10, signal: controller.signal },
    )

    await expect(pages.collect()).rejects.toBeInstanceOf(CancelledError)
    expect(signals).toEqual([controller.signal, controller.signal])
  })
})

describe('on a bot', () => {
  function bot() {
    const transport = mockTransport()
    transport.on('getUserProfilePhotos', (request) => {
      const offset = request.params['offset'] as number
      const photos =
        offset >= 3 ? [] : [[{ file_id: `p${offset}`, file_unique_id: 'u', width: 1, height: 1 }]]
      return ok({ total_count: 3, photos })
    })
    transport.on('getUserGifts', (request) => {
      const offset = request.params['offset'] as string
      return ok({
        total_count: 2,
        gifts: [{ type: 'regular', owned_gift_id: offset === '' ? 'g1' : 'g2' }],
        next_offset: offset === '' ? 'next' : '',
      })
    })
    return {
      transport,
      bot: Bot.fromToken(TOKEN, { client: transport, log: createLogger({ sink: silentSink() }) }),
    }
  }

  it('reads profile photos by position and gifts by cursor, with the filters it was given', async () => {
    const { bot: client, transport } = bot()

    const photos = await client.profilePhotos(7, { pageSize: 1 }).collect()
    expect(photos.map((sizes) => sizes[0]?.file_id)).toEqual(['p0', 'p1', 'p2'])
    expect(photos.total).toBe(3)

    const gifts = await client.userGifts(7, { sort_by_price: true }).collect()
    expect(gifts.map((gift) => (gift as { owned_gift_id?: string }).owned_gift_id)).toEqual([
      'g1',
      'g2',
    ])
    expect(transport.callsTo('getUserGifts').map((call) => call.params)).toEqual([
      { sort_by_price: true, user_id: 7, offset: '', limit: 100 },
      { sort_by_price: true, user_id: 7, offset: 'next', limit: 100 },
    ])
  })
})

describe('the pager', () => {
  const catalogue = pager('catalogue', { pageSize: 2 })
  const items = ['a', 'b', 'c', 'd', 'e']

  it('slices a list into pages, clamped to the pages there are', () => {
    expect(catalogue.page(items, 0)).toEqual({ items: ['a', 'b'], page: 0, pages: 3 })
    expect(catalogue.page(items, 2)).toEqual({ items: ['e'], page: 2, pages: 3 })
    expect(catalogue.page(items, 9)).toMatchObject({ page: 2 })
    expect(catalogue.page(items, -1)).toMatchObject({ page: 0 })
    expect(catalogue.page([], 0)).toEqual({ items: [], page: 0, pages: 1 })
  })

  it('offers a way back only after the first page and forward only before the last', () => {
    const labels = (page: number) =>
      catalogue
        .keyboard({ page, pages: 3 }, 7)
        .inline_keyboard.flat()
        .map((button) => button.text)

    expect(labels(0)).toEqual(['1 / 3', '›'])
    expect(labels(1)).toEqual(['‹', '2 / 3', '›'])
    expect(labels(2)).toEqual(['‹', '3 / 3'])
    expect(
      pager('plain', { pageSize: 2, position: undefined, next: 'more' })
        .keyboard({ page: 0, pages: 2 }, 7)
        .inline_keyboard.flat()
        .map((button) => button.text),
    ).toEqual(['more'])
  })

  it('tells the person it was shown to from somebody else pressing the same button', () => {
    const forward = catalogue.keyboard({ page: 0, pages: 3 }, 7).inline_keyboard.flat().at(-1)
    const data = (forward as { callback_data?: string }).callback_data

    expect(catalogue.read({ data, sender: { id: 7 } })).toEqual({ kind: 'page', page: 1, owner: 7 })
    expect(catalogue.read({ data, sender: { id: 8 } })).toEqual({
      kind: 'refused',
      page: 1,
      owner: 7,
    })
    expect(catalogue.read({ data, sender: undefined })).toMatchObject({ kind: 'refused' })
  })

  it('matches its own buttons, the position label included, and reads nothing from others', () => {
    const position = catalogue.keyboard({ page: 1, pages: 3 }, 7).inline_keyboard.flat()[1]
    const label = (position as { callback_data?: string }).callback_data
    const other = pager('orders', { pageSize: 2 })
      .keyboard({ page: 0, pages: 2 }, 7)
      .inline_keyboard.flat()
      .at(-1)
    const foreign = (other as { callback_data?: string }).callback_data

    expect(catalogue.filter({ data: label })).toBe(true)
    expect(catalogue.read({ data: label, sender: { id: 7 } })).toBeUndefined()
    expect(catalogue.filter({ data: foreign })).toBe(false)
    expect(catalogue.read({ data: foreign, sender: { id: 7 } })).toBeUndefined()
  })

  it('refuses a name that leaves no room in a button for the page and the person', () => {
    expect(() => pager('x'.repeat(50), { pageSize: 1 })).toThrow(CallbackDataTooLong)
    expect(() => pager('ok', { pageSize: 0 })).toThrow(ValidationError)
  })
})
