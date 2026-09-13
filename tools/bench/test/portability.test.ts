/**
 * Whether a bot actually runs somewhere that is not Node.
 *
 * `docs/runtimes.md` claims the Bot API subsystem needs nothing but `fetch`,
 * and `webhook/web.ts` names Bun, Deno, Cloudflare Workers and Vercel Edge in
 * its own documentation. That claim is easy to make and easy to break: one
 * `import { x } from 'node:crypto'` for one helper, or one reach for `Buffer`,
 * and a bundle that used to run on a worker throws on load. Neither shows up in
 * a suite that only ever runs on Node, because on Node both work — which is
 * exactly how the subsystem came to depend on `node:crypto` for a single
 * constant-time comparison.
 *
 * So the bundle is built and then evaluated in a context holding only what the
 * web platform guarantees. No `process`, no `Buffer`, no `require`, no `node:`
 * anything. Whatever the bundle touches at load, and whatever the exercises
 * below touch, has to be there or the test throws — which is what would happen
 * on a worker, a page, or an edge function.
 *
 * What this does not do is run the whole subsystem: only code that executes
 * here is checked, and a Node reach inside a branch nothing takes goes
 * unnoticed. It is a floor rather than a proof, and `bundle.test.ts` covers the
 * static half.
 */

import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { beforeAll, describe, expect, it } from 'vitest'

const DIST = fileURLToPath(new URL('../../../packages/yuigram/dist/', import.meta.url))

/**
 * A program using the Bot API the way an edge function would.
 *
 * Everything such a handler reaches: the client, the Fetch-shaped webhook
 * endpoint, the formatting helpers, and reading what arrived. Each is exercised
 * below rather than merely imported, because an unused import is dropped by the
 * bundler and would prove nothing.
 */
const PROGRAM = `
import { Bot, InlineKeyboard, f, html, memory } from './index.js'
import { fromHtml, readMessage, readPeers, toMarkdown } from './index.js'
import { createWebhookHandler, webWebhook } from './webhook.js'

export const parts = {
  Bot,
  InlineKeyboard,
  f,
  html,
  memory,
  createWebhookHandler,
  webWebhook,
  fromHtml,
  readMessage,
  readPeers,
  toMarkdown,
}
`

/**
 * What the web platform guarantees, and nothing else.
 *
 * Deliberately missing: `process`, `Buffer`, `require`, `module`, `__dirname`,
 * `global`. A bundle that reaches for one of those finds nothing and throws,
 * which is the point of running it here rather than in the test's own context.
 */
function webGlobals(): Record<string, unknown> {
  const globals: Record<string, unknown> = {
    console,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    AbortController,
    AbortSignal,
    Blob,
    FormData,
    Headers,
    Request,
    Response,
    Event,
    EventTarget,
    ReadableStream,
    WritableStream,
    TransformStream,
    queueMicrotask,
    structuredClone,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    crypto: globalThis.crypto,
    // The only way the Bot API reaches Telegram, and present on every runtime
    // in the matrix. Never called: nothing here makes a request.
    fetch: () => {
      throw new Error('the portability check makes no requests')
    },
  }

  globals['globalThis'] = globals

  return globals
}

let bundle = ''

beforeAll(async () => {
  const built = await build({
    stdin: { contents: PROGRAM, resolveDir: DIST, sourcefile: 'worker.js', loader: 'js' },
    bundle: true,
    format: 'iife',
    globalName: 'yuigram',
    platform: 'neutral',
    target: 'es2022',
    treeShaking: true,
    write: false,
    external: ['node:*'],
    logLevel: 'silent',
  })

  const output = built.outputFiles?.[0]
  if (output === undefined) throw new Error('bundling the worker program produced nothing')

  bundle = new TextDecoder().decode(output.contents)
}, 60_000)

/** What the program exports, as much of it as the exercises below use. */
interface Parts {
  readonly Bot: { fromToken(token: string): { api: unknown } }
  readonly memory: () => {
    set(key: string, value: unknown): Promise<void>
    get(key: string): Promise<unknown>
  }
  readonly createWebhookHandler: (options: {
    onUpdate: (update: unknown) => void
    secretToken: string
  }) => unknown
  readonly webWebhook: (handler: unknown) => (request: Request) => Promise<Response>
  readonly fromHtml: (markup: string) => { text: string; entities: unknown[] }
  readonly toMarkdown: (value: unknown) => string
  readonly readMessage: (value: unknown) => { text?: string } | undefined
}

/** Evaluate the bundle with only web globals, and hand back what it exported. */
function loadInWeb(): Parts {
  const context = webGlobals()

  runInNewContext(`${bundle};globalThis.__parts = yuigram.parts`, context, { timeout: 10_000 })

  return context['__parts'] as Parts
}

describe('the Bot API subsystem, off Node', () => {
  it('carries no import of a Node built-in', () => {
    // The static half: what the bundle expects the platform to provide.
    expect(bundle).not.toMatch(/require\(["']node:/)
    expect(bundle).not.toMatch(/from\s*["']node:/)
    expect(bundle).not.toMatch(/\bimport\s*\(\s*["']node:/)
  })

  it('loads in a context with no Node globals at all', () => {
    // Anything reached at module scope has to exist. `Buffer.from` at the top
    // of a module is exactly the mistake this catches, and it is invisible when
    // the suite only ever runs on Node.
    expect(() => loadInWeb()).not.toThrow()
  })

  it('builds a client there', () => {
    const { Bot } = loadInWeb()

    // Shaped like a real token and issued by nobody: the client validates the
    // form before it will build.
    expect(Bot.fromToken('123456789:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa').api).toBeDefined()
  })

  it('answers a Fetch-shaped webhook there, secret comparison included', async () => {
    // The secret check is why this test exists: it was the one place the
    // subsystem reached into `node:crypto`, for one function.
    const { createWebhookHandler, webWebhook } = loadInWeb()
    const seen: unknown[] = []
    const respond = webWebhook(
      createWebhookHandler({ onUpdate: (update) => void seen.push(update), secretToken: 'right' }),
    )

    const post = (secret: string, id: number) =>
      new Request('https://example.com/webhook', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': secret },
        body: JSON.stringify({ update_id: id }),
      })

    const accepted = await respond(post('right', 1))
    const refused = await respond(post('wrong', 2))

    expect(accepted.status).toBe(200)
    expect(refused.status).toBe(401)
    expect(seen).toEqual([{ update_id: 1 }])
  })

  it('formats and reads there', () => {
    const { fromHtml, toMarkdown, readMessage } = loadInWeb()
    const body = fromHtml('<b>bold</b> text')

    expect(body.text).toBe('bold text')
    expect(toMarkdown(body)).toBe('*bold* text')

    const message = readMessage({
      _: 'message',
      id: 1,
      peer_id: { _: 'peerUser', user_id: 2n },
      message: 'hi',
      date: 0,
    })

    expect(message?.text).toBe('hi')
  })

  it('keeps state in memory storage there', async () => {
    const { memory } = loadInWeb()
    const store = memory()

    await store.set('k', { n: 1 })

    expect(await store.get('k')).toEqual({ n: 1 })
  })
})
