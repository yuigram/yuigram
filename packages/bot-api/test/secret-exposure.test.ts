/**
 * Secrets must not be reachable from any public object.
 *
 * The bot token is in the request path for every call, which makes it the
 * credential most likely to escape by accident — serialized into a crash
 * report, an error tracker, or a debug log of "the whole context".
 *
 * `security.md` §10 lists this as a pre-release check. These are it.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { createApi } from '../src/api.js'
import { Bot } from '../src/bot.js'
import { getFileUrl, resolveTarget } from '../src/download.js'
import type { HttpClient } from '../src/http/client.js'
import { fetchClient } from '../src/http/fetch-client.js'
import { mockBot } from '../src/testing/mock-bot.js'
import { mockTransport, ok } from '../src/testing/mock-transport.js'

const TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw'
const SECRET = 'AAHdqTcv'

/** Every string reachable by walking an object, to a bounded depth. */
function reachable(value: unknown, depth = 0, seen = new WeakSet<object>()): string[] {
  if (depth > 6) return []
  if (typeof value === 'string') return [value]
  if (typeof value === 'function') return [String(value)]
  if (value === null || typeof value !== 'object') return []
  if (seen.has(value)) return []
  seen.add(value)

  return Object.values(value).flatMap((item) => reachable(item, depth + 1, seen))
}

describe('the bot token', () => {
  it('is not reachable by walking the client', () => {
    const bot = new Bot(TOKEN, { client: mockTransport() })

    expect(reachable(bot).join('\n')).not.toContain(SECRET)
  })

  it('is not reachable by walking the transport', () => {
    const client = fetchClient({ token: TOKEN, fetch: (async () => new Response('{}')) as never })

    expect(reachable(client).join('\n')).not.toContain(SECRET)
  })

  it('does not survive JSON.stringify of the client', () => {
    const bot = new Bot(TOKEN, { client: mockTransport() })

    expect(JSON.stringify(bot)).not.toContain(SECRET)
  })

  it('does not survive JSON.stringify of a context', async () => {
    // The shape most likely to be dumped wholesale into an error tracker.
    const { bot, send } = mockBot()
    let serialized = ''

    bot.on('message', (ctx) => {
      serialized = JSON.stringify(ctx)
    })

    await send.message('hello')

    expect(serialized).not.toContain(SECRET)
    expect(serialized).not.toContain('TESTTEST')
  })

  it('is not reachable by walking a context', async () => {
    const { bot, send } = mockBot()
    let found: string[] = []

    bot.on('message', (ctx) => {
      found = reachable(ctx)
    })

    await send.message('hello')

    expect(found.join('\n')).not.toContain('TESTTEST')
  })
})

describe('a hostile file_path from the API server', () => {
  /** A transport whose getFile returns whatever path the test scripts. */
  function serving(filePath: string): HttpClient {
    const transport = mockTransport()
    transport.on('getFile', ok({ file_id: 'a', file_path: filePath }))

    return {
      call: transport.call.bind(transport),
      fileUrl: (path) => `https://api.telegram.org/file/bot${TOKEN}/${path}`,
    }
  }

  it('refuses a traversing path', async () => {
    // A compromised or third-party Bot API server controls `file_path`. Against
    // a local server the path is handed to createReadStream, so a `..` segment
    // reads an arbitrary local file.
    const client = serving('../../../../etc/passwd')

    await expect(getFileUrl({ api: createApi({ client }), client }, 'a')).rejects.toBeInstanceOf(
      ValidationError,
    )
  })

  it('refuses a traversing path written with backslashes', async () => {
    // A local Bot API server on Windows reports backslash separators.
    const client = serving(String.raw`..\..\windows\system32\config\sam`)

    await expect(getFileUrl({ api: createApi({ client }), client }, 'a')).rejects.toBeInstanceOf(
      ValidationError,
    )
  })

  it('refuses a path carrying a null byte', async () => {
    const client = serving('photos/file_1.jpg' + String.fromCharCode(0) + '.png')

    await expect(getFileUrl({ api: createApi({ client }), client }, 'a')).rejects.toBeInstanceOf(
      ValidationError,
    )
  })

  it('allows the paths Telegram actually sends', async () => {
    const client = serving('photos/file_1.jpg')
    const url = await getFileUrl({ api: createApi({ client }), client }, 'a')

    expect(url).toContain('photos/file_1.jpg')
  })

  it('allows the absolute path a local server returns', async () => {
    // Documented behaviour for a local Bot API server, so it stays allowed.
    const client = serving('/var/lib/telegram-bot-api/photos/file_1.jpg')
    const url = await getFileUrl({ api: createApi({ client }), client }, 'a')

    expect(url).toContain('/var/lib/telegram-bot-api/photos/file_1.jpg')
  })

  it('refuses a path that names another host', async () => {
    // Turning a download into a request at an attacker's host would make the
    // bot an SSRF proxy. Interpolating it produced a harmless URL, but a
    // transport that treated the path as a location would not have.
    const client = serving('https://attacker.example/steal')

    await expect(getFileUrl({ api: createApi({ client }), client }, 'a')).rejects.toBeInstanceOf(
      ValidationError,
    )
  })
})

describe('download target resolution', () => {
  it('does not accept a path where a file id belongs', () => {
    expect(resolveTarget('../../secret').fileId).toBe('../../secret')
  })
})
