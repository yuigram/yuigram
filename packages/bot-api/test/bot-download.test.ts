/**
 * Downloading through a bot, and through a message the bot received.
 *
 * The free functions take the transport by hand. What these hold is that a
 * bot's own methods and a message's `download` use the transport the bot was
 * built with — a client it was given, a local server's paths on disk — so an
 * application never rebuilds that configuration to fetch a file.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConfigError, ValidationError } from '@yuigram/core'
import { afterEach, describe, expect, it } from 'vitest'
import { Bot } from '../src/bot.js'
import { attachmentOf } from '../src/events/actions.js'
import type { Message, Update } from '../src/generated/types/index.js'
import type { HttpClient } from '../src/http/client.js'
import { mockTransport, ok } from '../src/testing/mock-transport.js'

const TOKEN = '123456:secret-token-for-tests'

/** A transport that serves files from memory, and records what it was asked for. */
function filesTransport(files: Record<string, Uint8Array>) {
  const transport = mockTransport()
  const fetched: string[] = []
  transport.on('getFile', (request) =>
    ok({ file_id: request.params['file_id'], file_path: `files/${request.params['file_id']}` }),
  )
  const client: HttpClient = {
    call: transport.call.bind(transport),
    fileUrl: (filePath) => `memory:${filePath}`,
    fetchFile: async (url) => {
      fetched.push(url)
      const bytes = files[url.slice('memory:files/'.length)]
      return {
        status: bytes === undefined ? 404 : 200,
        body:
          bytes === undefined
            ? null
            : new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(bytes)
                  controller.close()
                },
              }),
      }
    },
  }
  return { client, transport, fetched }
}

const made: string[] = []
afterEach(async () => {
  for (const directory of made.splice(0)) await rm(directory, { recursive: true, force: true })
})

describe('a bot downloading', () => {
  it('fetches through the transport it was built with', async () => {
    const { client, fetched } = filesTransport({ doc: Uint8Array.of(1, 2, 3) })
    const bot = new Bot(TOKEN, { client })

    expect(await bot.download('doc')).toEqual(Uint8Array.of(1, 2, 3))
    expect(await bot.download({ file_id: 'doc', file_path: 'files/doc' })).toEqual(
      Uint8Array.of(1, 2, 3),
    )
    expect(fetched).toEqual(['memory:files/doc', 'memory:files/doc'])
  })

  it('takes the largest size of a photo', async () => {
    const { client, fetched } = filesTransport({ big: Uint8Array.of(9) })
    const bot = new Bot(TOKEN, { client })

    await bot.download([
      { file_id: 'small', file_unique_id: 's', width: 90, height: 90, file_size: 100 },
      { file_id: 'big', file_unique_id: 'b', width: 800, height: 800, file_size: 9_000 },
    ])

    expect(fetched).toEqual(['memory:files/big'])
  })

  it('writes to a path as the bytes arrive, when given one', async () => {
    const { client } = filesTransport({ doc: Uint8Array.of(4, 5, 6) })
    const bot = new Bot(TOKEN, { client })
    const directory = await mkdtemp(join(tmpdir(), 'yuigram-bot-download-'))
    made.push(directory)
    const path = join(directory, 'out.bin')

    expect(await bot.download('doc', path)).toBeUndefined()
    expect(new Uint8Array(await readFile(path))).toEqual(Uint8Array.of(4, 5, 6))
  })

  it('streams, and names the URL only when asked', async () => {
    const { client } = filesTransport({ doc: Uint8Array.of(7) })
    const bot = new Bot(TOKEN, { client })

    const chunks: Uint8Array[] = []
    for await (const chunk of await bot.downloadStream('doc')) chunks.push(chunk)
    expect(chunks).toEqual([Uint8Array.of(7)])
    expect(await bot.getFileUrl('doc')).toBe('memory:files/doc')
  })

  it('reads a local Bot API server’s path from disk', async () => {
    // A local server answers getFile with an absolute path on its own disk.
    const directory = await mkdtemp(join(tmpdir(), 'yuigram-bot-local-'))
    made.push(directory)
    const onDisk = join(directory, 'served.bin')
    await writeFile(onDisk, Uint8Array.of(8, 8))
    const transport = mockTransport()
    transport.on('getFile', ok({ file_id: 'x', file_path: onDisk }))
    const client: HttpClient = {
      call: transport.call.bind(transport),
      fileUrl: (filePath) => filePath,
    }
    const bot = new Bot(TOKEN, { client, local: true })

    expect(await bot.download('x')).toEqual(Uint8Array.of(8, 8))
  })

  it('builds its transport for the test environment when told to', async () => {
    const shaped = '0:TEST_TOKEN_NOT_A_REAL_CREDENTIAL_000000'
    const bot = new Bot(shaped, { testMode: true })

    // A known path needs no call, so this is the transport the bot built.
    expect(await bot.getFileUrl({ file_id: 'x', file_path: 'docs/a.bin' })).toBe(
      `https://api.telegram.org/file/bot${shaped}/test/docs/a.bin`,
    )
  })

  it('carries the transport’s refusal rather than a URL with the token in it', async () => {
    const { client } = filesTransport({})
    const bot = new Bot(TOKEN, { client: { ...client, fileUrl: (p) => `bot${TOKEN}/${p}` } })

    const failure = await bot.download('missing').catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(Error)
    expect(String((failure as Error).message)).not.toContain(TOKEN)
  })
})

describe('a message downloading what it carries', () => {
  /** Dispatch one message through a bot and give back what the handler did. */
  async function handled(bot: Bot, message: Partial<Message>, act: (ctx: never) => unknown) {
    let outcome: unknown
    bot.on('message', async (ctx) => {
      outcome = await Promise.resolve(act(ctx as never)).catch((error: unknown) => error)
    })
    const update = {
      update_id: 1,
      message: {
        message_id: 10,
        date: 0,
        chat: { id: 5, type: 'private' },
        from: { id: 5, is_bot: false, first_name: 'A' },
        ...message,
      },
    } as unknown as Update
    await bot.handleUpdate(update)
    return outcome
  }

  it('fetches the document through the bot it arrived on', async () => {
    const { client } = filesTransport({ doc: Uint8Array.of(1), anim: Uint8Array.of(2) })
    const bot = new Bot(TOKEN, { client })

    const bytes = await handled(
      bot,
      {
        document: { file_id: 'doc', file_unique_id: 'd' },
        animation: { file_id: 'anim', file_unique_id: 'a', width: 1, height: 1, duration: 1 },
      },
      (ctx: { download(): Promise<Uint8Array> }) => ctx.download(),
    )

    expect(bytes).toEqual(Uint8Array.of(1))
  })

  it('takes a photo at its largest size, and a sticker only when nothing else is there', () => {
    const photo = [
      { file_id: 'p1', file_unique_id: '1', width: 90, height: 90 },
      { file_id: 'p2', file_unique_id: '2', width: 900, height: 900 },
    ]
    const sticker = { file_id: 'st', file_unique_id: 's' }

    expect(attachmentOf({ photo, sticker } as unknown as Message)).toBe(photo)
    expect(attachmentOf({ sticker } as unknown as Message)).toBe(sticker)
    expect(attachmentOf({ photo: [] } as unknown as Message)).toBeUndefined()
    expect(attachmentOf({ text: 'hi' } as unknown as Message)).toBeUndefined()
  })

  it('refuses a message with no file, by name', async () => {
    const { client } = filesTransport({})
    const bot = new Bot(TOKEN, { client })

    const failure = await handled(
      bot,
      { text: 'no file here' },
      (ctx: { download(): Promise<unknown> }) => ctx.download(),
    )

    expect(failure).toBeInstanceOf(ValidationError)
    expect((failure as Error).message).toMatch(/message 10 carries no file/)
  })

  it('streams the file it carries', async () => {
    const { client } = filesTransport({ voice: Uint8Array.of(3, 3) })
    const bot = new Bot(TOKEN, { client })

    const chunks = (await handled(
      bot,
      { voice: { file_id: 'voice', file_unique_id: 'v', duration: 1 } },
      async (ctx: { downloadStream(): Promise<ReadableStream<Uint8Array>> }) => {
        const out: Uint8Array[] = []
        for await (const chunk of await ctx.downloadStream()) out.push(chunk)
        return out
      },
    )) as Uint8Array[]

    expect(chunks).toEqual([Uint8Array.of(3, 3)])
  })

  it('says so when its context was built without a client to download through', async () => {
    const { createEventContext } = await import('../src/events/create.js')
    const { createApi } = await import('../src/api.js')
    const { normalizeUpdate } = await import('../src/normalize.js')
    const context = createEventContext({
      normalized: normalizeUpdate({
        update_id: 1,
        message: {
          message_id: 3,
          date: 0,
          chat: { id: 1, type: 'private' },
          document: { file_id: 'doc', file_unique_id: 'd' },
        },
      } as unknown as Update),
      api: createApi({ client: mockTransport() }),
      client: { name: 'bare' },
      log: { child: () => undefined } as never,
    }) as unknown as { download(): Promise<unknown> }

    await expect(context.download()).rejects.toThrow(ConfigError)
  })
})
