/**
 * The façade's public surface.
 *
 * This is the only file in the repository that tests what a user actually
 * receives from `npm install yuigram`. Everything else imports through deep
 * paths, which is how `Bot` — the main class of the Bot API package — went
 * unexported from its own entry point without a single test noticing.
 */

import { describe, expect, it } from 'vitest'
import * as yuigram from '../src/index.js'
import * as testing from '../src/testing.js'
import * as webhook from '../src/webhook.js'

describe('the entry point', () => {
  it('exports the client', () => {
    expect(typeof yuigram.Bot).toBe('function')
  })

  it('exports the storage adapters', () => {
    expect(typeof yuigram.memory).toBe('function')
    expect(typeof yuigram.file).toBe('function')
  })

  it('exports the session helpers', () => {
    expect(typeof yuigram.createSession).toBe('function')
    expect(typeof yuigram.userChatKey).toBe('function')
  })

  it('exports the filter combinators', () => {
    for (const name of ['and', 'or', 'not', 'every', 'some'] as const) {
      expect(typeof yuigram[name]).toBe('function')
    }
  })

  it('exports the error hierarchy', () => {
    expect(Object.getPrototypeOf(yuigram.FloodError)).toBe(yuigram.TelegramError)
    expect(new yuigram.ValidationError('x')).toBeInstanceOf(yuigram.YuigramError)
  })

  it('exports the logger', () => {
    expect(typeof yuigram.createLogger).toBe('function')
  })

  it('exports the convenience layer a bot is written against', () => {
    // Each of these is documented on the front page, and each is the kind of
    // thing that gets built, tested through a deep path, and never wired into
    // the package a user installs.
    expect(typeof yuigram.f).toBe('object')
    expect(typeof yuigram.has).toBe('object')
    expect(typeof yuigram.media).toBe('object')
    expect(typeof yuigram.format).toBe('object')
    expect(typeof yuigram.InlineKeyboard).toBe('function')
    expect(typeof yuigram.Keyboard).toBe('function')
    expect(typeof yuigram.Router).toBe('function')
    expect(typeof yuigram.session).toBe('function')
    expect(typeof yuigram.retryOnFloodWait).toBe('function')
    expect(typeof yuigram.withChatAction).toBe('function')
    expect(typeof yuigram.html).toBe('function')
    expect(typeof yuigram.md).toBe('function')
  })

  it('offers every filter family the documentation names', () => {
    for (const family of [
      'has',
      'hasQuery',
      'text',
      'caption',
      'anyText',
      'command',
      'chat',
      'sender',
      'media',
      'callback',
      'reply',
      'forward',
      'entity',
      'topic',
    ] as const) {
      expect(yuigram.f[family]).toBeDefined()
    }
  })

  it('exports the production layer', () => {
    // Each of these is the answer to a question a bot asks in its first week
    // of real traffic, and each is documented on the front page.
    expect(typeof yuigram.throttle).toBe('function')
    expect(typeof yuigram.retryOnFloodWait).toBe('function')
    expect(typeof yuigram.rateLimit).toBe('function')
    expect(typeof yuigram.createScheduler).toBe('function')
    expect(typeof yuigram.inline).toBe('object')
    expect(typeof yuigram.session).toBe('function')
  })

  it('offers the MTProto helpers that turn what arrived into what a call carries', () => {
    // Each of these reads a protocol shape a caller would otherwise have to
    // assemble by hand at every call site, which is where a field gets left
    // out and the request is refused for a reason that names something else.
    expect(typeof yuigram.documentFile).toBe('function')
    expect(typeof yuigram.photoFile).toBe('function')
    expect(typeof yuigram.documentMedia).toBe('function')
    expect(typeof yuigram.photoMedia).toBe('function')
    expect(typeof yuigram.uploadedDocument).toBe('function')
    expect(typeof yuigram.uploadedPhoto).toBe('function')
    expect(typeof yuigram.sentMessage).toBe('function')
    expect(typeof yuigram.nextDialogs).toBe('function')
    expect(typeof yuigram.inputPeerFromMessage).toBe('function')
    expect(typeof yuigram.inputChannel).toBe('function')
  })

  it('offers the reader that turns a message into questions it can answer', () => {
    // A message arrives as three constructors behind a union, and reading one
    // through a deep path is how this stayed out of the installed package.
    expect(typeof yuigram.MessageView).toBe('function')
    expect(typeof yuigram.readMessage).toBe('function')
    expect(typeof yuigram.sameMessage).toBe('function')

    const message = yuigram.readMessage({
      _: 'message',
      id: 1,
      peer_id: { _: 'peerUser', user_id: 2n },
      message: 'hi',
      date: 0,
    })

    expect(message?.text).toBe('hi')
    expect(message?.chat).toEqual({ kind: 'user', id: 2n })
  })

  it('offers the join between what a message names and who the answer described', () => {
    expect(typeof yuigram.UserView).toBe('function')
    expect(typeof yuigram.ChatView).toBe('function')
    expect(typeof yuigram.PeerIndex).toBe('function')
    expect(typeof yuigram.readUser).toBe('function')
    expect(typeof yuigram.readChat).toBe('function')
    expect(typeof yuigram.readPeers).toBe('function')

    const people = yuigram.readPeers({
      users: [{ _: 'user', id: 2n, first_name: 'Ada' }],
      chats: [
        {
          _: 'chat',
          id: 3n,
          title: 'Group',
          photo: { _: 'chatPhotoEmpty' },
          participants_count: 2,
          date: 0,
          version: 1,
        },
      ],
    })

    expect(people.name({ kind: 'user', id: 2n })).toBe('Ada')
    expect(people.name({ kind: 'chat', id: 3n })).toBe('Group')
  })

  it('offers markup in both directions, which MTProto has no server-side parsing for', () => {
    expect(typeof yuigram.fromHtml).toBe('function')
    expect(typeof yuigram.fromMarkdown).toBe('function')
    expect(typeof yuigram.toHtml).toBe('function')
    expect(typeof yuigram.toMarkdown).toBe('function')

    const body = yuigram.fromHtml('<b>bold</b> text')

    expect(body.text).toBe('bold text')
    expect(body.entities).toEqual([{ _: 'messageEntityBold', offset: 0, length: 4 }])
    expect(yuigram.toMarkdown(body)).toBe('*bold* text')
  })

  it('paces with the published Telegram limits by default', () => {
    expect(yuigram.DEFAULT_GLOBAL_PER_SECOND).toBe(30)
    expect(yuigram.DEFAULT_CHAT_PER_SECOND).toBe(1)
    expect(yuigram.DEFAULT_GROUP_PER_MINUTE).toBe(20)
  })

  it('offers every inline result builder the documentation names', () => {
    for (const builder of [
      'article',
      'photo',
      'gif',
      'video',
      'audio',
      'voice',
      'document',
      'location',
      'venue',
      'contact',
      'sticker',
    ] as const) {
      expect(typeof yuigram.inline[builder]).toBe('function')
    }
  })

  it('offers every media source the documentation names', () => {
    for (const source of [
      'path',
      'url',
      'id',
      'buffer',
      'stream',
      'text',
      'json',
      'blob',
    ] as const) {
      expect(typeof yuigram.media[source]).toBe('function')
    }
  })
})

describe('the schema version', () => {
  it('names the Bot API version the surface was generated from', () => {
    // A user hitting a method newer than this build needs to know which
    // version they are talking to before reaching for `call()`.
    expect(yuigram.schemaInfo.botApi).toMatch(/^\d+\.\d+$/)
  })

  it('names the TL layer the MTProto surface was generated from', () => {
    // Taken from the generated schema rather than written down here, so it
    // cannot drift from the codecs that were emitted alongside it.
    expect(yuigram.schemaInfo.tlLayer).toBeTypeOf('number')
  })
})

describe('the subpaths', () => {
  it('exposes the testing harness', () => {
    expect(typeof testing.mockBot).toBe('function')
  })

  it('exposes the webhook adapters', () => {
    expect(typeof webhook.nodeWebhook).toBe('function')
    expect(typeof webhook.expressWebhook).toBe('function')
    expect(typeof webhook.fastifyWebhook).toBe('function')
    // The Fetch adapter is the one that covers Hono, Elysia, h3, Bun, Deno,
    // Workers and Next route handlers at once.
    expect(typeof webhook.webWebhook).toBe('function')
    expect(typeof webhook.fastifyWebhook).toBe('function')
  })

  it('keeps the adapters out of the main entry point', () => {
    // A bot that polls should not carry the webhook adapters.
    expect('nodeWebhook' in yuigram).toBe(false)
  })
})

describe('independence', () => {
  it('names no third-party Telegram library anywhere in its surface', () => {
    // The invariant checks the built declarations. This checks the runtime
    // surface, which is what a user can actually reach.
    const forbidden = ['mtcute', 'puregram', 'grammy', 'telegraf', 'gramjs']

    for (const name of Object.keys({ ...yuigram, ...testing, ...webhook })) {
      for (const library of forbidden) {
        expect(name.toLowerCase()).not.toContain(library)
      }
    }
  })
})

describe('a bot built through the façade', () => {
  it('handles an update end to end', async () => {
    // Proves the re-exports are wired to working implementations rather than
    // to names that merely resolve.
    const { bot, send, calls } = testing.mockBot()

    bot.onCommand('start', (ctx) => ctx.reply('hello'))
    await send.command('/start')

    expect(calls.last('sendMessage')?.params['text']).toBe('hello')
  })
})
