/**
 * Filters for an account's events, read against the contexts the normalizer
 * builds from real update shapes — the whole-message form and the compact one
 * a private chat usually arrives in.
 */

import { createLogger } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { f } from '../src/filters/index.js'
import { type MtprotoContext, mtprotoContext } from '../src/normalize/context.js'
import type { TlValue } from '../src/tl/index.js'

const log = createLogger({ level: 'silent' })

function event(update: TlValue): MtprotoContext {
  return mtprotoContext(update, { client: { name: 'me' }, log })
}

/** A whole message, in a group, with whatever a case needs on it. */
function whole(fields: Record<string, unknown> = {}): MtprotoContext {
  return event({
    _: 'updateNewMessage',
    message: {
      _: 'message',
      id: 10,
      peer_id: { _: 'peerChat', chat_id: 77n },
      from_id: { _: 'peerUser', user_id: 5n },
      message: 'hello',
      date: 1_700_000_000,
      ...fields,
    },
    pts: 2,
    pts_count: 1,
  })
}

/** The compact form of a private message. */
function compact(text: string, fields: Record<string, unknown> = {}): MtprotoContext {
  return event({
    _: 'updateShortMessage',
    id: 11,
    user_id: 5n,
    message: text,
    pts: 3,
    pts_count: 1,
    date: 1_700_000_000,
    ...fields,
  })
}

describe('text and commands', () => {
  it('matches text exactly, by pattern, and not at all where there is none', () => {
    expect(f.text()(compact('hi'))).toBe(true)
    expect(f.text('hi')(compact('hi there'))).toBe(false)
    expect(f.text(/^hi/)(compact('hi there'))).toBe(true)
    expect(f.text()(event({ _: 'updateUserTyping', user_id: 5n, action: {} }))).toBe(false)
  })

  it('answers the same way twice with a global pattern', () => {
    const pattern = /hi/g
    const filter = f.text(pattern)

    expect(filter(compact('hi'))).toBe(true)
    expect(filter(compact('hi'))).toBe(true)
  })

  it('reads a command, its prefix, its arguments and whom it was addressed to', () => {
    const plain = compact('/start  now please')
    expect(f.command('start')(plain)).toBe(true)
    expect((plain as MtprotoContext & { command: string }).command).toBe('start')
    expect((plain as MtprotoContext & { args: readonly string[] }).args).toEqual(['now', 'please'])

    expect(f.command('ping', { prefixes: '.!' })(compact('!ping'))).toBe(true)
    expect(f.command('ping')(compact('!ping'))).toBe(false)
    expect(f.command('start')(compact('/starting'))).toBe(false)
    expect(f.command(['a', 'b'])(compact('/b'))).toBe(true)
    expect(f.command('Start', { ignoreCase: true })(compact('/START'))).toBe(true)
    // A suffix is honoured only when it names the username this filter was given.
    expect(f.command('start')(compact('/start@somebot'))).toBe(false)
    expect(f.command('start', { username: 'SomeBot' })(compact('/start@somebot'))).toBe(true)
    expect(f.command('start', { username: 'mine' })(compact('/start@somebot'))).toBe(false)
  })

  it('hands what a pattern captured to the handler', () => {
    const context = compact('order 42')
    expect(f.regex(/order (\d+)/)(context)).toBe(true)
    expect((context as MtprotoContext & { match: RegExpExecArray }).match[1]).toBe('42')
  })
})

describe('where an event happened and who caused it', () => {
  it('tells a private chat from a basic group, by sort and by number', () => {
    expect(f.chat('user')(compact('x'))).toBe(true)
    expect(f.chat('chat')(whole())).toBe(true)
    expect(f.chat('user')(whole())).toBe(false)
    expect(f.chat(77n)(whole())).toBe(true)
    expect(f.chat([1n, 77n])(whole())).toBe(true)
    // The number alone does not stand for the sort: group 5 is not user 5.
    expect(f.chat(5n)(whole())).toBe(false)
    expect(f.sender(5n)(whole())).toBe(true)
    expect(f.sender('channel')(whole())).toBe(false)
  })

  it('reads direction from either form of a message', () => {
    expect(f.outgoing(compact('x', { out: true }))).toBe(true)
    expect(f.incoming(compact('x', { out: true }))).toBe(false)
    expect(f.incoming(compact('x'))).toBe(true)
    expect(f.outgoing(whole({ out: true }))).toBe(true)
    expect(f.incoming(whole())).toBe(true)
  })

  it('reads replies, forwards and mentions', () => {
    const replyTo = { _: 'messageReplyHeader', reply_to_msg_id: 3 }
    expect(f.reply(whole({ reply_to: replyTo }))).toBe(true)
    expect(f.reply(compact('x', { reply_to: replyTo }))).toBe(true)
    expect(f.reply(whole())).toBe(false)
    expect(f.forward(whole({ fwd_from: { _: 'messageFwdHeader', date: 1 } }))).toBe(true)
    expect(f.mentioned(compact('x', { mentioned: true }))).toBe(true)
    expect(f.silent(whole())).toBe(false)
  })
})

describe('media', () => {
  const voice = {
    _: 'messageMediaDocument',
    document: {
      _: 'document',
      id: 1n,
      access_hash: 2n,
      file_reference: new Uint8Array(0),
      date: 1,
      mime_type: 'audio/ogg',
      size: 10n,
      dc_id: 2,
      attributes: [{ _: 'documentAttributeAudio', voice: true, duration: 3 }],
    },
  }

  it('matches media by the kind a reader would name', () => {
    expect(f.media()(whole({ media: voice }))).toBe(true)
    expect(f.media('voice')(whole({ media: voice }))).toBe(true)
    expect(f.media('photo', 'video')(whole({ media: voice }))).toBe(false)
    expect(f.media()(whole())).toBe(false)
  })

  it('does not count a link preview as media unless asked for it', () => {
    const preview = { _: 'messageMediaWebPage', webpage: { _: 'webPageEmpty', id: 1n } }

    expect(f.media()(whole({ media: preview }))).toBe(false)
    expect(f.media('webpage')(whole({ media: preview }))).toBe(true)
  })
})

describe('queries', () => {
  const pressed = (data: Uint8Array) =>
    event({
      _: 'updateBotCallbackQuery',
      query_id: 1n,
      user_id: 5n,
      peer: { _: 'peerUser', user_id: 5n },
      msg_id: 3,
      chat_instance: 9n,
      data,
    })

  it('compares callback data as text, and leaves bytes that are not text to the bare form', () => {
    const text = pressed(new TextEncoder().encode('buy:42'))
    const binary = pressed(new Uint8Array([0xff, 0xfe]))

    expect(f.callback(/^buy:/)(text)).toBe(true)
    expect(f.callback('sell')(text)).toBe(false)
    expect(f.callback()(binary)).toBe(true)
    expect(f.callback(/.*/)(binary)).toBe(false)
  })

  it('matches an inline query by its text', () => {
    const query = event({
      _: 'updateBotInlineQuery',
      query_id: 1n,
      user_id: 5n,
      query: 'cats',
      offset: '',
    })

    expect(f.inline('cats')(query)).toBe(true)
    expect(f.inline(/dogs/)(query)).toBe(false)
  })
})

describe('callback data read by a schema', () => {
  /** A schema of the shape a callback-data builder has: `vote:<answer>:<poll>`. */
  const vote = {
    matches: (data: string) => data.startsWith('vote:'),
    unpack: (data: string) => {
      const [, answer, poll] = data.split(':')
      return answer === undefined || poll === undefined ? undefined : { answer, poll: Number(poll) }
    },
  }
  const pressed = (data: string) =>
    event({
      _: 'updateBotCallbackQuery',
      query_id: 1n,
      user_id: 5n,
      peer: { _: 'peerUser', user_id: 5n },
      msg_id: 3,
      chat_instance: 9n,
      data: new TextEncoder().encode(data),
    })

  it('matches the schema’s data, hands over what it read, and holds fields to what was asked', () => {
    const yes = pressed('vote:yes:7')

    expect(f.callbackData(vote)(yes)).toBe(true)
    expect((yes as MtprotoContext & { payload: unknown }).payload).toEqual({
      answer: 'yes',
      poll: 7,
    })
    expect(f.callbackData(vote, { answer: 'no' })(pressed('vote:yes:7'))).toBe(false)
    expect(f.callbackData(vote, { answer: ['yes', 'maybe'], poll: 7 })(pressed('vote:yes:7'))).toBe(
      true,
    )
    expect(f.callbackData(vote, { answer: /^y/ })(pressed('vote:yes:7'))).toBe(true)
    expect(f.callbackData(vote)(pressed('other:1'))).toBe(false)
    expect(f.callbackData(vote)(pressed('vote:'))).toBe(false)
  })
})

describe('composition', () => {
  it('combines, and keeps the kinds a registration can skip on', () => {
    const privateText = f.and(f.chat('user'), f.text())

    expect(privateText(compact('x'))).toBe(true)
    expect(privateText(whole())).toBe(false)
    expect(privateText.kinds).toEqual([
      'message',
      'message_edited',
      'mtproto:ephemeral_message',
      'mtproto:ephemeral_message_edited',
    ])
    expect(f.not(f.outgoing)(compact('x'))).toBe(true)
  })
})
