// SPDX-License-Identifier: MPL-2.0

/**
 * Per-method defaults.
 *
 * What is asserted is what goes out: the parameters a call reaches the
 * transport with, and — for an upload — the fields of the request body itself.
 * Precedence, which methods a `'*'` default reaches, explicit values, copies,
 * formatted text, hooks and retries each get a case, since each is a way a
 * default can land where nobody put it or vanish where somebody did.
 */

import { createLogger, silentSink } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { createApi } from '../src/api.js'
import { Bot } from '../src/bot.js'
import type { MethodDefaults } from '../src/defaults.js'
import type { ApiRequest, HttpClient } from '../src/http/client.js'
import { fetchClient } from '../src/http/fetch-client.js'
import { media } from '../src/media.js'

const TOKEN = '0:TEST_TOKEN_NOT_A_REAL_CREDENTIAL_000000'

/** A transport that records what each call was sent with. */
function recording() {
  const sent: ApiRequest[] = []
  const client: HttpClient = {
    fileUrl: (path) => path,
    async call<T>(request: ApiRequest) {
      sent.push(request)
      return { status: 200, body: { ok: true, result: true as T } }
    },
  } as HttpClient

  return { sent, client, params: (index = -1) => sent.at(index)?.params ?? {} }
}

describe('which default applies', () => {
  const defaults: MethodDefaults = {
    '*': { parse_mode: 'HTML', disable_notification: true, business_connection_id: 'biz' },
    sendMessage: { disable_notification: false, protect_content: true },
  }

  it('orders them: everywhere, then the method, then the call', async () => {
    const { client, params } = recording()
    const api = createApi({ client, defaults })

    await api.sendMessage({ chat_id: 1, text: 'a' })
    expect(params()).toEqual({
      parse_mode: 'HTML',
      disable_notification: false,
      business_connection_id: 'biz',
      protect_content: true,
      chat_id: 1,
      text: 'a',
    })

    await api.sendMessage({
      chat_id: 1,
      text: 'b',
      protect_content: false,
      parse_mode: 'MarkdownV2',
    })
    expect(params()).toMatchObject({ protect_content: false, parse_mode: 'MarkdownV2' })
  })

  it('sends an everywhere default only to methods that take the parameter', async () => {
    const { client, params } = recording()
    const api = createApi({ client, defaults })

    await api.getMe()
    expect(params()).toEqual({})

    await api.getChat({ chat_id: 1 })
    expect(params()).toEqual({ chat_id: 1 })

    await api.sendPhoto({ chat_id: 1, photo: 'file-id' })
    expect(params()).toMatchObject({ parse_mode: 'HTML', disable_notification: true })
  })

  it('gives a method newer than the schema its own defaults, and none of the everywhere ones', async () => {
    const { client, params } = recording()
    const api = createApi({
      client,
      defaults: {
        '*': { parse_mode: 'HTML' },
        sendFutureThing: { flavour: 'new' },
      } as MethodDefaults,
    })

    await api.call('sendFutureThing', { chat_id: 1 })
    expect(params()).toEqual({ flavour: 'new', chat_id: 1 })
  })

  it('still applies parameters given in the older flat form to every call', async () => {
    const { client, params } = recording()
    const api = createApi({ client, defaults: { parse_mode: 'HTML' } })

    await api.getMe()
    expect(params()).toEqual({ parse_mode: 'HTML' })
  })
})

describe('what the caller wrote', () => {
  it('keeps false, null and an empty string, and lets undefined remove a default', async () => {
    const { client, params } = recording()
    const api = createApi({
      client,
      defaults: {
        sendMessage: { disable_notification: true, message_effect_id: 'e', parse_mode: 'HTML' },
      },
    })

    await api.sendMessage({
      chat_id: 1,
      text: 'x',
      disable_notification: false,
      message_effect_id: '',
      parse_mode: undefined,
      reply_markup: null as never,
    })

    const sent = params()
    expect(sent['disable_notification']).toBe(false)
    expect(sent['message_effect_id']).toBe('')
    expect(sent['reply_markup']).toBeNull()
    expect('parse_mode' in sent && sent['parse_mode'] === undefined).toBe(true)
    // Undefined is not sent at all.
    expect(JSON.parse(JSON.stringify(sent))).not.toHaveProperty('parse_mode')
  })
})

describe('copies', () => {
  it('gives each call its own copy, so a hook changing one does not change the next', async () => {
    const { client, params } = recording()
    const api = createApi({
      client,
      defaults: { '*': { link_preview_options: { is_disabled: true } } },
      hooks: [
        async (call, next) => {
          const options = call.params['link_preview_options'] as { is_disabled: boolean }
          options.is_disabled = false
          return next()
        },
      ],
    })

    await api.sendMessage({ chat_id: 1, text: 'a' })
    await api.sendMessage({ chat_id: 1, text: 'b' })

    expect(params(0)['link_preview_options']).toEqual({ is_disabled: false })
    expect(params(1)['link_preview_options']).toEqual({ is_disabled: false })
    // The second call started from the default, not from what the first hook left.
    expect(params(1)['link_preview_options']).not.toBe(params(0)['link_preview_options'])
  })

  it('reads the defaults once, so changing the object later reaches neither of two bots', async () => {
    const one = recording()
    const two = recording()
    const defaults = { '*': { parse_mode: 'HTML' as const } }
    const log = createLogger({ sink: silentSink() })
    const first = Bot.fromToken(TOKEN, { client: one.client, log, defaults })
    ;(defaults['*'] as { parse_mode: string }).parse_mode = 'MarkdownV2'
    const second = Bot.fromToken(TOKEN, { client: two.client, log, defaults })

    await first.api.sendMessage({ chat_id: 1, text: 'a' })
    await second.api.sendMessage({ chat_id: 1, text: 'a' })

    expect(one.params()['parse_mode']).toBe('HTML')
    expect(two.params()['parse_mode']).toBe('MarkdownV2')
  })
})

describe('text that carries its own ranges', () => {
  const api = () => {
    const recorder = recording()
    return {
      ...recorder,
      api: createApi({ client: recorder.client, defaults: { '*': { parse_mode: 'HTML' } } }),
    }
  }

  it('leaves a defaulted parse_mode off text with entities or a formatted value', async () => {
    const { api: calls, params } = api()

    await calls.sendMessage({ chat_id: 1, text: 'x', entities: [] })
    expect(params()).not.toHaveProperty('parse_mode')

    await calls.sendPhoto({ chat_id: 1, photo: 'id', caption: 'x', caption_entities: [] })
    expect(params()).not.toHaveProperty('parse_mode')

    await calls.sendMessage({ chat_id: 1, text: { text: 'x', entities: [] } as never })
    expect(params()).not.toHaveProperty('parse_mode')
  })

  it('keeps a parse_mode the call itself passed', async () => {
    const { api: calls, params } = api()

    await calls.sendMessage({ chat_id: 1, text: 'x', entities: [], parse_mode: 'HTML' })
    expect(params()['parse_mode']).toBe('HTML')
  })
})

describe('hooks and retries', () => {
  it('hands hooks the parameters with defaults applied, and a retry sends the same', async () => {
    const { client, sent } = recording()
    const seen: unknown[] = []
    const api = createApi({
      client,
      defaults: { sendMessage: { protect_content: true } },
      hooks: [
        async (call, next) => {
          seen.push(call.params['protect_content'])
          await next()
          return next()
        },
      ],
    })

    await api.sendMessage({ chat_id: 1, text: 'x' })

    expect(seen).toEqual([true])
    expect(sent.map((request) => request.params['protect_content'])).toEqual([true, true])
  })
})

describe('an upload', () => {
  it('sends the defaults as fields beside the file', async () => {
    const bodies: FormData[] = []
    const client = fetchClient({
      token: TOKEN,
      fetch: (async (_url: string, init: RequestInit) => {
        bodies.push(init.body as FormData)
        return new Response(JSON.stringify({ ok: true, result: true }), {
          headers: { 'content-type': 'application/json' },
        })
      }) as typeof fetch,
    })
    const api = createApi({
      client,
      defaults: { '*': { protect_content: true }, sendDocument: { caption: 'default caption' } },
    })

    await api.sendDocument({
      chat_id: 1,
      document: media.buffer(new TextEncoder().encode('content'), 'a.txt'),
    })

    const body = bodies[0] as FormData
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('protect_content')).toBe('true')
    expect(body.get('caption')).toBe('default caption')
    expect(await (body.get('document') as Blob).text()).toBe('content')
  })
})
