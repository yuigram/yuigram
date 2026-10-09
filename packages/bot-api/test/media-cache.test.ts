// SPDX-License-Identifier: MPL-2.0

/**
 * The media cache.
 *
 * The transport here answers the way Telegram does: an upload comes back with
 * a new identifier, an identifier comes back as itself, and one the test has
 * marked as gone is refused with Telegram's own description. Each case reads
 * what was actually sent — a file or an identifier — since that is the whole
 * of what the cache changes.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConfigError, createLogger, memory, silentSink } from '@yuigram/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Bot } from '../src/bot.js'
import { BotApiError } from '../src/errors.js'
import { media } from '../src/media.js'
import { mediaCache } from '../src/media-cache.js'
import { apiError, mockTransport, ok } from '../src/testing/mock-transport.js'

const TOKEN = '0:TEST_TOKEN_NOT_A_REAL_CREDENTIAL_000000'

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'yuigram-media-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

interface Harness {
  readonly bot: Bot
  readonly sent: (method: string) => unknown[]
  readonly gone: Set<string>
  readonly failNextUpload: (response: ReturnType<typeof apiError>) => void
}

/** A bot whose transport keeps count of what each upload method was sent. */
function harness(botId = 42): Harness {
  const transport = mockTransport()
  const gone = new Set<string>()
  let uploads = 0
  let failure: ReturnType<typeof apiError> | undefined

  transport.on('getMe', ok({ id: botId, is_bot: true, first_name: 'T', username: 't' }))

  const answer = (kind: string) => (request: { params: Record<string, unknown> }) => {
    const value = request.params[kind]
    if (typeof value === 'string' && !value.startsWith('http')) {
      if (gone.has(value))
        return apiError(400, 'Bad Request: wrong file identifier/HTTP URL specified')
      return ok(message(kind, value))
    }
    if (failure !== undefined) {
      const refusal = failure
      failure = undefined
      return refusal
    }
    uploads += 1
    return ok(message(kind, `${kind}-${botId}-${uploads}`))
  }

  for (const [method, kind] of [
    ['sendPhoto', 'photo'],
    ['sendDocument', 'document'],
    ['sendAnimation', 'animation'],
  ] as const) {
    transport.on(method, answer(kind))
  }

  const bot = Bot.fromToken(TOKEN, { client: transport, log: createLogger({ sink: silentSink() }) })

  return {
    bot,
    gone,
    sent: (method) => transport.callsTo(method).map((call) => Object.values(call.params).at(-1)),
    failNextUpload: (response) => {
      failure = response
    },
  }
}

/** A sent message, as Telegram describes the file it carries. */
function message(kind: string, fileId: string): Record<string, unknown> {
  const base = { message_id: 1, date: 1, chat: { id: 1, type: 'private' } }
  if (kind === 'photo') {
    return {
      ...base,
      photo: [
        { file_id: 'thumbnail', file_unique_id: 't' },
        { file_id: fileId, file_unique_id: 'u' },
      ],
    }
  }
  if (kind === 'animation')
    return { ...base, animation: { file_id: fileId }, document: { file_id: fileId } }
  return { ...base, [kind]: { file_id: fileId, file_unique_id: 'u' } }
}

const isUpload = (value: unknown) => typeof value === 'object' && value !== null

/**
 * Install what was extended, as a bot does before its first update.
 *
 * A bot installs its plugins when it starts or dispatches, and these cases
 * call the API directly, so they dispatch one update nobody handles first.
 */
async function extended(bot: Bot, cache: ReturnType<typeof mediaCache>): Promise<void> {
  bot.extend(cache)
  await bot.handleUpdate({ update_id: 0 } as never)
}

describe('the first send and the ones after', () => {
  it('uploads once, then sends the largest size’s identifier to any chat', async () => {
    const { bot, sent } = harness()
    await extended(bot, mediaCache())

    await bot.api.sendPhoto({ chat_id: 1, photo: media.path('./logo.png') })
    await bot.api.sendPhoto({ chat_id: 2, photo: media.path('./logo.png') })
    await bot.api.sendPhoto({ chat_id: 3, photo: media.path('./logo.png') })

    const photos = sent('sendPhoto')
    expect(isUpload(photos[0])).toBe(true)
    expect(photos.slice(1)).toEqual(['photo-42-1', 'photo-42-1'])
  })

  it('keeps one kind of media apart from another, and one bot apart from another', async () => {
    const storage = memory<string>()
    const first = harness(42)
    const second = harness(43)
    await extended(first.bot, mediaCache({ storage }))
    await extended(second.bot, mediaCache({ storage }))

    await first.bot.api.sendPhoto({ chat_id: 1, photo: media.path('./logo.png') })
    await first.bot.api.sendDocument({ chat_id: 1, document: media.path('./logo.png') })
    await second.bot.api.sendPhoto({ chat_id: 1, photo: media.path('./logo.png') })

    expect(isUpload(first.sent('sendDocument')[0])).toBe(true)
    expect(isUpload(second.sent('sendPhoto')[0])).toBe(true)
    const names: string[] = []
    for await (const key of storage.keys?.() ?? []) names.push(key)
    expect(names.sort()).toEqual([
      '42:document:path:./logo.png',
      '42:photo:path:./logo.png',
      '43:photo:path:./logo.png',
    ])
  })

  it('names a URL by itself, bytes by their digest, and leaves an identifier alone', async () => {
    const { bot, sent } = harness()
    await extended(bot, mediaCache())
    const bytes = () => new TextEncoder().encode('the same bytes')

    await bot.api.sendDocument({ chat_id: 1, document: media.url('https://example.com/a.pdf') })
    await bot.api.sendDocument({ chat_id: 1, document: media.url('https://example.com/a.pdf') })
    await bot.api.sendDocument({ chat_id: 1, document: media.buffer(bytes(), 'a.txt') })
    await bot.api.sendDocument({ chat_id: 1, document: media.buffer(bytes(), 'b.txt') })
    await bot.api.sendDocument({ chat_id: 1, document: media.buffer(new Uint8Array([1]), 'c') })
    await bot.api.sendDocument({ chat_id: 1, document: 'an-identifier' })

    const documents = sent('sendDocument')
    expect(documents[0]).toBe('https://example.com/a.pdf')
    expect(documents[1]).toBe('document-42-1')
    expect(isUpload(documents[2])).toBe(true)
    expect(documents[3]).toBe('document-42-2')
    expect(isUpload(documents[4])).toBe(true)
    expect(documents[5]).toBe('an-identifier')
  })

  it('names a file on disk by its content when asked, so two paths to one file are one upload', async () => {
    const one = join(directory, 'one.png')
    const two = join(directory, 'two.png')
    await writeFile(one, 'pixels')
    await writeFile(two, 'pixels')
    const { bot, sent } = harness()
    await extended(bot, mediaCache({ keyFilesBy: 'content' }))

    await bot.api.sendPhoto({ chat_id: 1, photo: media.path(one) })
    await bot.api.sendPhoto({ chat_id: 1, photo: media.path(two) })
    await writeFile(two, 'edited pixels')
    await bot.api.sendPhoto({ chat_id: 1, photo: media.path(two) })

    const photos = sent('sendPhoto')
    expect(photos[1]).toBe('photo-42-1')
    expect(isUpload(photos[2])).toBe(true)
  })

  it('reads an animation’s identifier where Telegram puts it', async () => {
    const { bot, sent } = harness()
    await extended(bot, mediaCache())

    await bot.api.sendAnimation({ chat_id: 1, animation: media.path('./a.gif') })
    await bot.api.sendAnimation({ chat_id: 1, animation: media.path('./a.gif') })

    expect(sent('sendAnimation')[1]).toBe('animation-42-1')
  })
})

describe('streams and explicit names', () => {
  it('uploads a single-use stream every time, never reading it to name it', async () => {
    const { bot, sent } = harness()
    await extended(bot, mediaCache())
    const reads: string[] = []
    const stream = (label: string) =>
      media.stream(
        (async function* () {
          reads.push(label)
          yield new Uint8Array([1])
        })(),
        'a.bin',
      )

    await bot.api.sendDocument({ chat_id: 1, document: stream('first') })
    await bot.api.sendDocument({ chat_id: 1, document: stream('second') })

    expect(sent('sendDocument').every(isUpload)).toBe(true)
    // The mock does not encode, so nothing read them: the cache did not either.
    expect(reads).toEqual([])
  })

  it('caches a stream the caller named, and never one named false', async () => {
    const { bot, sent } = harness()
    await extended(bot, mediaCache())
    const once = async function* () {
      yield new Uint8Array([1])
    }

    await bot.api.sendDocument({
      chat_id: 1,
      document: media.stream(once(), 'a', { cacheKey: 'intro' }),
    })
    await bot.api.sendDocument({
      chat_id: 1,
      document: media.stream(once(), 'a', { cacheKey: 'intro' }),
    })
    await bot.api.sendPhoto({ chat_id: 1, photo: media.path('./fresh.png', { cacheKey: false }) })
    await bot.api.sendPhoto({ chat_id: 1, photo: media.path('./fresh.png', { cacheKey: false }) })

    expect(sent('sendDocument')[1]).toBe('document-42-1')
    expect(sent('sendPhoto').every(isUpload)).toBe(true)
  })
})

describe('when something goes wrong', () => {
  it('uploads again once when Telegram says the kept identifier is no longer good', async () => {
    const { bot, sent, gone } = harness()
    const cache = mediaCache()
    await extended(bot, cache)

    await bot.api.sendPhoto({ chat_id: 1, photo: media.path('./logo.png') })
    gone.add('photo-42-1')
    const answer = await bot.api.sendPhoto({ chat_id: 1, photo: media.path('./logo.png') })

    const photos = sent('sendPhoto')
    expect(photos[1]).toBe('photo-42-1')
    expect(isUpload(photos[2])).toBe(true)
    expect(answer.photo?.at(-1)?.file_id).toBe('photo-42-2')
    expect(await cache.lookup('photo', media.path('./logo.png'))).toBe('photo-42-2')
  })

  it('forgets an identifier that went bad even when the upload after it fails', async () => {
    const { bot, gone, failNextUpload } = harness()
    const cache = mediaCache()
    await extended(bot, cache)

    await bot.api.sendPhoto({ chat_id: 1, photo: media.path('./logo.png') })
    gone.add('photo-42-1')
    failNextUpload(apiError(500, 'Internal Server Error'))

    await expect(
      bot.api.sendPhoto({ chat_id: 1, photo: media.path('./logo.png') }),
    ).rejects.toBeInstanceOf(BotApiError)
    expect(await cache.lookup('photo', media.path('./logo.png'))).toBeUndefined()
  })

  it('caches nothing from an upload that was refused, and does not try it again', async () => {
    const { bot, sent, failNextUpload } = harness()
    const cache = mediaCache()
    await extended(bot, cache)
    // Blocked by the user: sending again would be a second attempt at a
    // message the user refused.
    failNextUpload(apiError(403, 'Forbidden: bot was blocked by the user'))

    const refused = await bot.api
      .sendPhoto({ chat_id: 1, photo: media.path('./logo.png') })
      .catch((error: unknown) => error)

    expect(refused).toBeInstanceOf(BotApiError)
    expect(sent('sendPhoto')).toHaveLength(1)
    expect(await cache.lookup('photo', media.path('./logo.png'))).toBeUndefined()
  })

  it('does not retry a send by identifier that failed for another reason', async () => {
    const { bot, sent } = harness()
    const cache = mediaCache()
    await extended(bot, cache)
    await bot.api.sendPhoto({ chat_id: 1, photo: media.path('./logo.png') })
    bot.hook(async (call, next) => {
      if (call.params['photo'] === 'photo-42-1') {
        throw new BotApiError('sendPhoto', { ok: false, error_code: 403, description: 'Forbidden' })
      }
      return next()
    })

    await expect(
      bot.api.sendPhoto({ chat_id: 2, photo: media.path('./logo.png') }),
    ).rejects.toBeInstanceOf(BotApiError)
    expect(sent('sendPhoto')).toHaveLength(1)
    expect(await cache.lookup('photo', media.path('./logo.png'))).toBe('photo-42-1')
  })
})

describe('two sends at once', () => {
  it('uploads once and sends the identifier for the other', async () => {
    const { bot, sent } = harness()
    await extended(bot, mediaCache())

    await Promise.all([
      bot.api.sendPhoto({ chat_id: 1, photo: media.path('./logo.png') }),
      bot.api.sendPhoto({ chat_id: 2, photo: media.path('./logo.png') }),
    ])

    const photos = sent('sendPhoto')
    expect(photos.filter(isUpload)).toHaveLength(1)
    expect(photos.filter((value) => value === 'photo-42-1')).toHaveLength(1)
  })

  it('lets the second upload for itself when the first fails', async () => {
    const { bot, sent, failNextUpload } = harness()
    await extended(bot, mediaCache())
    failNextUpload(apiError(400, 'Bad Request: file must be non-empty'))

    const [first, second] = await Promise.allSettled([
      bot.api.sendPhoto({ chat_id: 1, photo: media.path('./logo.png') }),
      bot.api.sendPhoto({ chat_id: 2, photo: media.path('./logo.png') }),
    ])

    expect(first.status).toBe('rejected')
    expect(second.status).toBe('fulfilled')
    expect(sent('sendPhoto').filter(isUpload)).toHaveLength(2)
  })
})

describe('the handle', () => {
  it('looks entries up and drops them, and belongs to one bot', async () => {
    const { bot, sent } = harness()
    const cache = mediaCache()

    await expect(cache.lookup('photo', media.path('./logo.png'))).rejects.toBeInstanceOf(
      ConfigError,
    )
    await extended(bot, cache)
    await bot.api.sendPhoto({ chat_id: 1, photo: media.path('./logo.png') })
    expect(await cache.lookup('photo', media.path('./logo.png'))).toBe('photo-42-1')

    await cache.invalidate('photo', media.path('./logo.png'))
    await bot.api.sendPhoto({ chat_id: 1, photo: media.path('./logo.png') })
    expect(sent('sendPhoto').filter(isUpload)).toHaveLength(2)

    const other = harness(43)
    const refused = await extended(other.bot, cache).catch((error: unknown) => error)
    expect(((refused as Error).cause as Error).message).toMatch(/installed on another bot/)
    expect((refused as Error).cause).toBeInstanceOf(ConfigError)
  })
})
