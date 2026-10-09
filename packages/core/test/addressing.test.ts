// SPDX-License-Identifier: MIT

/**
 * Marked identifiers and links.
 *
 * The identifier cases sit on the edges of Telegram's ranges, because the
 * arithmetic is only ever wrong at an edge: one past the largest basic group is
 * where a naive reading starts naming channels, and the secret chat range is
 * where it starts naming the wrong channel. The link cases use the syntax
 * Telegram publishes for each kind, with the malformed variants its apps pass
 * over, so a reader and a writer that merely agree with each other cannot pass.
 */

import { describe, expect, it } from 'vitest'
import {
  botApiId,
  isMarkedPeerId,
  LinkError,
  markedKind,
  PeerIdError,
  peerIdentity,
  readLink,
  type TelegramLink,
  ValidationError,
  writeLink,
} from '../src/index.js'

const E12 = 1_000_000_000_000
const T31 = 2 ** 31

describe('marked identifiers', () => {
  it.each([
    ['the first user', 1, 'user', 1n],
    ['the last user', 2 ** 40 - 1, 'user', 2n ** 40n - 1n],
    ['the first basic group', -1, 'chat', 1n],
    ['the last basic group', -(E12 - 1), 'chat', BigInt(E12 - 1)],
    ['the first channel', -E12 - 1, 'channel', 1n],
    ['a channel as the Bot API writes one', -1001234567890, 'channel', 1234567890n],
    ['the last ordinary channel', -E12 - (E12 - T31 - 1), 'channel', BigInt(E12 - T31 - 1)],
    ['the first monoforum channel', -E12 - (E12 + T31 + 1), 'channel', BigInt(E12 + T31 + 1)],
    ['the last monoforum channel', -E12 - (3 * E12 - 1), 'channel', BigInt(3 * E12 - 1)],
  ] as const)('reads %s and writes it back', (_, marked, kind, id) => {
    expect(markedKind(marked)).toBe(kind)
    expect(peerIdentity(marked)).toEqual({ kind, id })
    expect(botApiId({ kind, id })).toBe(marked)
  })

  it.each([
    ['zero', 0],
    ['one past the last user', 2 ** 40],
    ['the channel zero', -E12],
    ['the top reserved above ordinary channels', -2 * E12 + T31],
    ['the secret chat zero', -2 * E12],
    ['one past the last monoforum channel', -4 * E12],
  ])('names nothing with %s', (_, marked) => {
    expect(markedKind(marked)).toBeUndefined()
    expect(isMarkedPeerId(marked)).toBe(false)
    expect(() => peerIdentity(marked)).toThrow(PeerIdError)
  })

  it('tells a secret chat from the channels on either side of its range', () => {
    expect(markedKind(-2 * E12 + T31 + 1)).toBe('channel')
    expect(markedKind(-2 * E12 + T31 - 1)).toBe('secret-chat')
    expect(markedKind(-2 * E12 + 1)).toBe('secret-chat')
    expect(markedKind(-2 * E12 - T31)).toBe('secret-chat')
    expect(markedKind(-2 * E12 - T31 - 1)).toBe('channel')

    expect(isMarkedPeerId(-2 * E12 + 1)).toBe(false)
    expect(() => peerIdentity(-2 * E12 + 1)).toThrow(/secret chat/)
  })

  it('refuses a number that has lost precision instead of rounding it', () => {
    const unsafe = -(2 ** 53) - 2

    expect(() => peerIdentity(unsafe)).toThrow(/safe integer/)
    expect(markedKind(unsafe)).toBeUndefined()
    expect(() => peerIdentity(1.5)).toThrow(PeerIdError)
    expect(() => peerIdentity(Number.NaN)).toThrow(PeerIdError)
    expect(() => peerIdentity(Number.POSITIVE_INFINITY)).toThrow(PeerIdError)
  })

  it('accepts a bigint and canonical decimal text, and nothing looser', () => {
    expect(peerIdentity(-1001234567890n)).toEqual({ kind: 'channel', id: 1234567890n })
    expect(peerIdentity('-1001234567890')).toEqual({ kind: 'channel', id: 1234567890n })
    expect(peerIdentity('42')).toEqual({ kind: 'user', id: 42n })

    for (const loose of [' 42', '042', '+42', '4.2e1', '0x2a', '', '-', '42n']) {
      expect(() => peerIdentity(loose), loose).toThrow(PeerIdError)
      expect(markedKind(loose), loose).toBeUndefined()
    }
  })

  it('refuses to write an identifier outside its kind, which would name another peer', () => {
    // A basic group numbered 10^12 would come out as the channel zero.
    expect(() => botApiId({ kind: 'chat', id: BigInt(E12) })).toThrow(/valid chat/)
    expect(() => botApiId({ kind: 'user', id: 2n ** 40n })).toThrow(PeerIdError)
    expect(() => botApiId({ kind: 'channel', id: 0n })).toThrow(PeerIdError)
    expect(() => botApiId({ kind: 'channel', id: BigInt(E12 - T31) })).toThrow(PeerIdError)
    expect(() => botApiId({ kind: 'channel', id: BigInt(E12 + T31) })).toThrow(PeerIdError)
    expect(botApiId({ kind: 'chat', id: '42' })).toBe(-42)
    expect(botApiId({ kind: 'user', id: 7 })).toBe(7)
  })

  it('names a peer without anything that reaches it', () => {
    expect(Object.keys(peerIdentity(-1001234567890))).toEqual(['kind', 'id'])
  })

  it('answers whether an unknown value is an identifier without throwing', () => {
    for (const value of [null, undefined, {}, [], true, Symbol('x'), 'abc']) {
      expect(isMarkedPeerId(value)).toBe(false)
    }
    expect(isMarkedPeerId('-1001234567890')).toBe(true)
  })

  it('reports refusals as validation errors', () => {
    expect(new PeerIdError('x')).toBeInstanceOf(ValidationError)
    expect(new LinkError('x')).toBeInstanceOf(ValidationError)
  })
})

const channel = { kind: 'channel', id: 1234567890n } as const

describe('reading links', () => {
  it.each<[string, string, TelegramLink]>([
    ['a username', 't.me/newsreader', { kind: 'username', username: 'newsreader' }],
    [
      'every web host',
      'https://telegram.dog/newsreader',
      { kind: 'username', username: 'newsreader' },
    ],
    [
      'a username with a draft and the profile',
      'https://telegram.me/newsreader?text=hi%20there&profile',
      {
        kind: 'username',
        username: 'newsreader',
        text: 'hi there',
        profile: true,
      },
    ],
    [
      'a username subdomain',
      'https://newsreader.t.me',
      { kind: 'username', username: 'newsreader' },
    ],
    [
      'a web preview path',
      'https://t.me/s/newsreader',
      { kind: 'username', username: 'newsreader' },
    ],
    [
      'a scheme and host in capitals',
      'HTTPS://WWW.T.ME/newsreader',
      { kind: 'username', username: 'newsreader' },
    ],
    [
      'a phone number',
      't.me/+15551234567?text=hello',
      { kind: 'phone', phone: '15551234567', text: 'hello' },
    ],
    ['an invitation', 't.me/+AbCdEf_-12', { kind: 'invite', hash: 'AbCdEf_-12' }],
    ['an older invitation', 'https://t.me/joinchat/AbCdEf', { kind: 'invite', hash: 'AbCdEf' }],
    ['a chat folder', 't.me/addlist/Xy_z1', { kind: 'chat-folder', slug: 'Xy_z1' }],
    ['a sticker set', 't.me/addstickers/Animals', { kind: 'sticker-set', name: 'Animals' }],
    ['an emoji set', 't.me/addemoji/Hearts', { kind: 'emoji-set', name: 'Hearts' }],
    [
      'a public message',
      't.me/news_channel/42',
      {
        kind: 'message',
        chat: { username: 'news_channel' },
        id: 42,
      },
    ],
    [
      'a message in a topic',
      't.me/forum_group/5/42',
      {
        kind: 'message',
        chat: { username: 'forum_group' },
        id: 42,
        thread: 5,
      },
    ],
    [
      'a message in a thread named by query',
      't.me/forum_group/42?thread=5',
      {
        kind: 'message',
        chat: { username: 'forum_group' },
        id: 42,
        thread: 5,
      },
    ],
    [
      'a private message with every parameter',
      't.me/c/1234567890/42?single&comment=7&t=1h2m3s&task=3&option=MA',
      {
        kind: 'message',
        chat: { channel },
        id: 42,
        comment: 7,
        single: true,
        mediaTimestamp: 3723,
        task: 3,
        option: 'MA',
      },
    ],
    [
      'a share',
      't.me/share/url?url=https%3A%2F%2Fexample.com%2F%3Fa%3D1&text=Look',
      {
        kind: 'share',
        url: 'https://example.com/?a=1',
        text: 'Look',
      },
    ],
    [
      'a share in its short form',
      't.me/share?url=example.com',
      { kind: 'share', url: 'example.com' },
    ],
    ['a share of text alone', 't.me/msg/url?text=hello', { kind: 'share', url: 'hello' }],
    [
      'a video chat',
      't.me/group_chat?videochat',
      { kind: 'video-chat', username: 'group_chat', live: false },
    ],
    [
      'a video chat by its older name',
      't.me/group_chat?voicechat=Ab_1',
      {
        kind: 'video-chat',
        username: 'group_chat',
        live: false,
        hash: 'Ab_1',
      },
    ],
    [
      'a live stream',
      't.me/news_channel?livestream',
      {
        kind: 'video-chat',
        username: 'news_channel',
        live: true,
      },
    ],
    ['a story', 't.me/newsreader/s/5', { kind: 'story', username: 'newsreader', id: 5 }],
    [
      'a public boost',
      't.me/boost/news_channel',
      { kind: 'boost', chat: { username: 'news_channel' } },
    ],
    [
      'a boost by argument',
      't.me/news_channel?boost',
      { kind: 'boost', chat: { username: 'news_channel' } },
    ],
    ['a private boost', 't.me/boost?c=1234567890', { kind: 'boost', chat: { channel } }],
    ['a private boost by path', 't.me/c/1234567890?boost', { kind: 'boost', chat: { channel } }],
    [
      'a bot start',
      't.me/shop_bot?start=ref_42',
      { kind: 'bot-start', bot: 'shop_bot', payload: 'ref_42' },
    ],
    [
      'a bot start without a parameter',
      't.me/shop_bot?start',
      { kind: 'bot-start', bot: 'shop_bot' },
    ],
    [
      'a group bot with rights',
      't.me/shop_bot?startgroup=p1&admin=change_info+delete_messages',
      {
        kind: 'group-bot',
        bot: 'shop_bot',
        payload: 'p1',
        admin: ['change_info', 'delete_messages'],
      },
    ],
    [
      'a group bot without rights',
      't.me/shop_bot?startgroup',
      { kind: 'group-bot', bot: 'shop_bot' },
    ],
    [
      'a channel bot',
      't.me/shop_bot?startchannel&admin=post_messages+manage_tags',
      {
        kind: 'channel-bot',
        bot: 'shop_bot',
        admin: ['post_messages', 'manage_tags'],
      },
    ],
    [
      'a main mini app',
      't.me/shop_bot?startapp=x1&mode=compact',
      {
        kind: 'mini-app',
        bot: 'shop_bot',
        payload: 'x1',
        mode: 'compact',
      },
    ],
    [
      'a main mini app without a parameter',
      't.me/shop_bot?startapp',
      { kind: 'mini-app', bot: 'shop_bot' },
    ],
    [
      'a named mini app',
      't.me/shop_bot/catalog?startapp=x1&mode=fullscreen',
      {
        kind: 'mini-app',
        bot: 'shop_bot',
        app: 'catalog',
        payload: 'x1',
        mode: 'fullscreen',
      },
    ],
    [
      'an attachment menu with targets',
      't.me/shop_bot?startattach=x1&choose=users+groups',
      {
        kind: 'attach',
        bot: 'shop_bot',
        payload: 'x1',
        choose: ['users', 'groups'],
      },
    ],
    [
      'an attachment menu in a named chat',
      't.me/group_chat?attach=shop_bot&startattach=x1',
      {
        kind: 'attach-in-chat',
        chat: { username: 'group_chat' },
        bot: 'shop_bot',
        payload: 'x1',
      },
    ],
    [
      'an attachment menu with a person',
      't.me/+15551234567?attach=shop_bot',
      {
        kind: 'attach-in-chat',
        chat: { phone: '15551234567' },
        bot: 'shop_bot',
      },
    ],
    ['a game', 't.me/games_bot?game=snake', { kind: 'game', bot: 'games_bot', name: 'snake' }],
  ])('reads %s', (_, link, expected) => {
    expect(readLink(link)).toEqual(expected)
  })

  it.each<[string, string, TelegramLink]>([
    [
      'a username',
      'tg://resolve?domain=newsreader&text=hi',
      { kind: 'username', username: 'newsreader', text: 'hi' },
    ],
    ['a phone number', 'tg:resolve?phone=15551234567', { kind: 'phone', phone: '15551234567' }],
    [
      'a public message',
      'tg://resolve?domain=news_channel&post=42&thread=5',
      {
        kind: 'message',
        chat: { username: 'news_channel' },
        id: 42,
        thread: 5,
      },
    ],
    [
      'a private message',
      'tg://privatepost?channel=1234567890&post=42&single',
      {
        kind: 'message',
        chat: { channel },
        id: 42,
        single: true,
      },
    ],
    ['an invitation', 'tg://join?invite=AbCdEf', { kind: 'invite', hash: 'AbCdEf' }],
    ['a chat folder', 'tg://addlist?slug=Xy_z1', { kind: 'chat-folder', slug: 'Xy_z1' }],
    ['a sticker set', 'tg://addstickers?set=Animals', { kind: 'sticker-set', name: 'Animals' }],
    ['an emoji set', 'tg://addemoji?set=Hearts', { kind: 'emoji-set', name: 'Hearts' }],
    [
      'a share',
      'tg://msg_url?url=example.com&text=Look',
      { kind: 'share', url: 'example.com', text: 'Look' },
    ],
    [
      'a story',
      'tg://resolve?domain=newsreader&story=5',
      { kind: 'story', username: 'newsreader', id: 5 },
    ],
    [
      'a public boost',
      'tg://boost?domain=news_channel',
      { kind: 'boost', chat: { username: 'news_channel' } },
    ],
    ['a private boost', 'tg://boost?channel=1234567890', { kind: 'boost', chat: { channel } }],
    [
      'a named mini app',
      'tg://resolve?domain=shop_bot&appname=catalog&startapp=x1',
      {
        kind: 'mini-app',
        bot: 'shop_bot',
        app: 'catalog',
        payload: 'x1',
      },
    ],
    [
      'a bot start',
      'tg://resolve?domain=shop_bot&start=ref_42',
      {
        kind: 'bot-start',
        bot: 'shop_bot',
        payload: 'ref_42',
      },
    ],
  ])('reads %s in its app form', (_, link, expected) => {
    expect(readLink(link)).toEqual(expected)
  })

  it.each([
    ['seconds', '123', 123],
    ['minutes and seconds', '10:23', 623],
    ['units', '1h23m10s', 4990],
    ['units with the seconds left out', '1h30', 3630],
    ['one unit', '2m', 120],
  ])('reads a media timestamp written as %s', (_, text, seconds) => {
    expect(readLink(`t.me/news_channel/42?t=${text}`)).toMatchObject({ mediaTimestamp: seconds })
  })

  it.each(['0', 'soon', '1x', '10000001', '1:234'])(
    'ignores a media timestamp of %s rather than failing the link',
    (text) => {
      const link = readLink(`t.me/news_channel/42?t=${text}`)

      expect(link).toEqual({ kind: 'message', chat: { username: 'news_channel' }, id: 42 })
    },
  )

  it('fails a message link whose identifiers are malformed', () => {
    for (const link of [
      't.me/news_channel/42?comment=abc',
      't.me/news_channel/42?thread=-1',
      't.me/news_channel/42?task=0',
      't.me/news_channel/2147483648',
      // Base64url of one character cannot be decoded at all.
      't.me/news_channel/42?option=A',
      // Channel identifiers stop short of the secret chat range.
      't.me/c/999999999999/42',
      'tg://privatepost?channel=abc&post=1',
    ]) {
      expect(readLink(link), link).toBeUndefined()
    }
  })

  it('leaves out a poll option that decodes to something other than text', () => {
    // `_w` is the single byte 0xFF, which is not UTF-8.
    expect(readLink('t.me/news_channel/42?option=_w')).toEqual({
      kind: 'message',
      chat: { username: 'news_channel' },
      id: 42,
    })
  })

  it('reads the leading digits of a path identifier, as Telegram apps do', () => {
    expect(readLink('t.me/news_channel/42abc')).toMatchObject({ kind: 'message', id: 42 })
    expect(readLink('t.me/c/01234567890/042')).toMatchObject({ chat: { channel }, id: 42 })
  })

  it('takes a phone number where the link has digits after the plus', () => {
    expect(readLink('t.me/+1234')).toEqual({ kind: 'phone', phone: '1234' })
    expect(readLink('t.me/+12a4')).toEqual({ kind: 'invite', hash: '12a4' })
    // Digits alone cannot be an invitation on the older path either.
    expect(readLink('t.me/joinchat/1234')).toBeUndefined()
  })

  it('lets the first argument that forms a link decide', () => {
    expect(readLink('t.me/games_bot?game=snake&start=x')).toMatchObject({ kind: 'game' })
    expect(readLink('t.me/games_bot?start=x&game=snake')).toMatchObject({ kind: 'bot-start' })
    expect(readLink('t.me/games_bot?videochat&startapp')).toMatchObject({ kind: 'video-chat' })
  })

  it('passes over an argument whose value is malformed', () => {
    expect(readLink('t.me/shop_bot?start=bad.value')).toEqual({
      kind: 'username',
      username: 'shop_bot',
    })
    expect(readLink('t.me/shop_bot?start=bad.value&game=snake')).toMatchObject({ kind: 'game' })
    expect(readLink('t.me/shop_bot?startchannel')).toEqual({
      kind: 'username',
      username: 'shop_bot',
    })
    expect(readLink('t.me/shop_bot?game=ab')).toEqual({ kind: 'username', username: 'shop_bot' })
  })

  it('keeps the rights and targets it knows, once each, in the order given', () => {
    expect(
      readLink('t.me/shop_bot?startgroup&admin=pin_messages+flying+pin_messages+anonymous'),
    ).toEqual({
      kind: 'group-bot',
      bot: 'shop_bot',
      admin: ['pin_messages', 'anonymous'],
    })
    // With no target it knows, the attachment menu opens in the current chat.
    expect(readLink('t.me/shop_bot?startattach&choose=planets')).toEqual({
      kind: 'attach',
      bot: 'shop_bot',
    })
  })

  it('treats a start parameter with the referral prefix as a referral, which is not read here', () => {
    expect(readLink('t.me/shop_bot?start=_tgr_abc')).toBeUndefined()
    expect(readLink('t.me/shop_bot?ref=abc')).toBeUndefined()
  })

  it('leaves out a draft that is not text, and refuses a share that is not', () => {
    expect(readLink('t.me/newsreader?text=1%A02')).toEqual({
      kind: 'username',
      username: 'newsreader',
    })
    expect(readLink('t.me/share/url?url=%FF')).toBeUndefined()
    expect(readLink('t.me/share/url?url=example.com&text=%E2%9C')).toBeUndefined()
    expect(readLink('t.me/newsreader?text=%E2%9C%93')).toMatchObject({ text: '✓' })
  })

  it('refuses a share with nothing in it', () => {
    expect(readLink('t.me/share/url?url=%20&text=')).toBeUndefined()
  })

  it('reads nothing into a Telegram link of a kind it does not describe', () => {
    for (const link of [
      't.me/addtheme/Night',
      't.me/setlanguage/en',
      't.me/$invoice',
      't.me/newsreader/s/live',
      't.me/newsreader?direct',
      'tg://settings',
      'tg://resolve?domain=newsreader&story=live',
    ]) {
      expect(readLink(link), link).toBeUndefined()
    }
  })

  it('reads nothing into what is not a Telegram link', () => {
    for (const link of [
      '',
      't.me',
      'https://example.com/newsreader',
      'https://t.me.example.com/newsreader',
      'ftp://t.me/newsreader',
      'https://someone@t.me/newsreader',
      'https://t.me:8443/newsreader',
      't.me/i',
      't.me/_newsreader',
      't.me/news__reader',
      't.me/newsreader_',
      't.me/abcdefghijklmnopqrstuvwxyzabcdefg',
      'https://add.t.me',
    ]) {
      expect(readLink(link), link).toBeUndefined()
    }
  })
})

describe('writing links', () => {
  it.each<[string, TelegramLink, string]>([
    [
      'a username with a draft',
      { kind: 'username', username: 'newsreader', text: 'a+b & c', profile: true },
      'https://t.me/newsreader?text=a%2Bb%20%26%20c&profile',
    ],
    ['a phone number', { kind: 'phone', phone: '15551234567' }, 'https://t.me/+15551234567'],
    ['an invitation', { kind: 'invite', hash: 'AbCdEf_-12' }, 'https://t.me/+AbCdEf_-12'],
    ['a chat folder', { kind: 'chat-folder', slug: 'Xy_z1' }, 'https://t.me/addlist/Xy_z1'],
    [
      'a message',
      {
        kind: 'message',
        chat: { channel },
        id: 42,
        thread: 5,
        single: true,
        comment: 7,
        mediaTimestamp: 90,
        task: 3,
        option: 'MA',
      },
      'https://t.me/c/1234567890/5/42?single&comment=7&t=90&task=3&option=MA',
    ],
    [
      'a share',
      { kind: 'share', url: 'https://example.com/?a=1&b=2', text: 'Look #1' },
      'https://t.me/share/url?url=https%3A%2F%2Fexample.com%2F%3Fa%3D1%26b%3D2&text=Look%20%231',
    ],
    [
      'a live stream',
      { kind: 'video-chat', username: 'news_channel', live: true },
      'https://t.me/news_channel?livestream',
    ],
    [
      'a video chat with a hash',
      { kind: 'video-chat', username: 'group_chat', live: false, hash: 'Ab_1' },
      'https://t.me/group_chat?videochat=Ab_1',
    ],
    ['a sticker set', { kind: 'sticker-set', name: 'Animals' }, 'https://t.me/addstickers/Animals'],
    ['an emoji set', { kind: 'emoji-set', name: 'Hearts' }, 'https://t.me/addemoji/Hearts'],
    ['a story', { kind: 'story', username: 'newsreader', id: 5 }, 'https://t.me/newsreader/s/5'],
    [
      'a public boost',
      { kind: 'boost', chat: { username: 'news_channel' } },
      'https://t.me/boost/news_channel',
    ],
    ['a private boost', { kind: 'boost', chat: { channel } }, 'https://t.me/boost?c=1234567890'],
    [
      'a bot start',
      { kind: 'bot-start', bot: 'shop_bot', payload: 'ref_42' },
      'https://t.me/shop_bot?start=ref_42',
    ],
    [
      'a bot start without a parameter',
      { kind: 'bot-start', bot: 'shop_bot' },
      'https://t.me/shop_bot?start',
    ],
    [
      'a group bot',
      { kind: 'group-bot', bot: 'shop_bot', admin: ['change_info', 'manage_tags'] },
      'https://t.me/shop_bot?startgroup&admin=change_info+manage_tags',
    ],
    [
      'a channel bot',
      { kind: 'channel-bot', bot: 'shop_bot', admin: ['post_messages'] },
      'https://t.me/shop_bot?startchannel&admin=post_messages',
    ],
    [
      'a main mini app',
      { kind: 'mini-app', bot: 'shop_bot', mode: 'compact' },
      'https://t.me/shop_bot?startapp&mode=compact',
    ],
    [
      'a named mini app',
      { kind: 'mini-app', bot: 'shop_bot', app: 'catalog', payload: 'x1' },
      'https://t.me/shop_bot/catalog?startapp=x1',
    ],
    [
      'an attachment menu',
      { kind: 'attach', bot: 'shop_bot', choose: ['users', 'channels'] },
      'https://t.me/shop_bot?startattach&choose=users+channels',
    ],
    [
      'an attachment menu with a person',
      { kind: 'attach-in-chat', chat: { phone: '15551234567' }, bot: 'shop_bot', payload: 'x1' },
      'https://t.me/+15551234567?attach=shop_bot&startattach=x1',
    ],
    [
      'a game',
      { kind: 'game', bot: 'games_bot', name: 'snake' },
      'https://t.me/games_bot?game=snake',
    ],
    [
      'an MTProxy server',
      {
        kind: 'proxy',
        server: '192.0.2.10',
        port: 443,
        secret: 'dd0123456789abcdef0123456789abcdef',
      },
      'https://t.me/proxy?server=192.0.2.10&port=443&secret=dd0123456789abcdef0123456789abcdef',
    ],
    [
      'a SOCKS5 proxy',
      { kind: 'socks', server: 'proxy.example.com', port: 1080 },
      'https://t.me/socks?server=proxy.example.com&port=1080',
    ],
    [
      'a SOCKS5 proxy with a username and password',
      { kind: 'socks', server: 'proxy.example.com', port: 1080, user: 'a b', pass: 'p&q=r' },
      'https://t.me/socks?server=proxy.example.com&port=1080&user=a%20b&pass=p%26q%3Dr',
    ],
    ['a temporary profile', { kind: 'contact', token: 'AbC_d-9' }, 'https://t.me/contact/AbC_d-9'],
  ])('writes %s in its published form, and reads it back', (_, link, written) => {
    expect(writeLink(link)).toBe(written)
    expect(readLink(written)).toEqual(link)
  })

  it.each<[string, string, TelegramLink]>([
    [
      'an MTProxy server',
      'tg://proxy?server=192.0.2.10&port=8443&secret=ee00',
      { kind: 'proxy', server: '192.0.2.10', port: 8443, secret: 'ee00' },
    ],
    [
      'a base64url secret',
      't.me/proxy?server=example.com&port=443&secret=7gAB_-c',
      { kind: 'proxy', server: 'example.com', port: 443, secret: '7gAB_-c' },
    ],
    [
      'a SOCKS5 proxy',
      'tg://socks?server=example.com&port=1080&user=me&pass=pw',
      { kind: 'socks', server: 'example.com', port: 1080, user: 'me', pass: 'pw' },
    ],
    [
      'a SOCKS5 proxy whose credentials are empty',
      't.me/socks?server=example.com&port=1080&user=&pass=',
      { kind: 'socks', server: 'example.com', port: 1080 },
    ],
    ['a temporary profile', 'tg://contact?token=AbC_d-9', { kind: 'contact', token: 'AbC_d-9' }],
  ])('reads %s in the form Telegram publishes', (_, written, link) => {
    expect(readLink(written)).toEqual(link)
  })

  it('reads nothing into a proxy or profile link missing what the syntax requires', () => {
    for (const link of [
      't.me/proxy?server=example.com&port=443',
      't.me/proxy?port=443&secret=00',
      't.me/proxy?server=example.com&secret=00',
      't.me/proxy?server=example.com&port=0&secret=00',
      't.me/proxy?server=example.com&port=65536&secret=00',
      't.me/proxy?server=example.com&port=0443&secret=00',
      't.me/proxy?server=example.com&port=443&secret=0%200',
      't.me/proxy?server=a%20b&port=443&secret=00',
      't.me/proxy/extra?server=example.com&port=443&secret=00',
      'tg://socks?server=example.com',
      'tg://socks?port=1080',
      't.me/contact',
      't.me/contact/a.b',
      'tg://contact',
    ]) {
      expect(readLink(link), link).toBeUndefined()
    }
  })

  it('keeps text that looks like query syntax exactly, through a round trip', () => {
    const text = 'a+b=c&d #e %f ✓'
    const link: TelegramLink = { kind: 'share', url: 'https://example.com/x y', text }

    expect(readLink(writeLink(link))).toEqual(link)
    expect(readLink(writeLink({ kind: 'username', username: 'newsreader', text }))).toMatchObject({
      text,
    })
  })

  it.each<[string, TelegramLink, RegExp]>([
    [
      'a username that is not one',
      { kind: 'username', username: 'news__reader' },
      /not a username/,
    ],
    [
      'a start parameter with other characters',
      { kind: 'bot-start', bot: 'shop_bot', payload: 'a.b' },
      /start parameter/,
    ],
    [
      'a start parameter past 64 characters',
      { kind: 'bot-start', bot: 'shop_bot', payload: 'a'.repeat(65) },
      /1 to 64/,
    ],
    [
      'a start parameter read as a referral',
      { kind: 'bot-start', bot: 'shop_bot', payload: '_tgr_x' },
      /referral/,
    ],
    [
      'a right that does not exist',
      { kind: 'group-bot', bot: 'shop_bot', admin: ['fly' as never] },
      /not a known administrator right/,
    ],
    [
      'a channel bot with no rights',
      { kind: 'channel-bot', bot: 'shop_bot', admin: [] },
      /cannot be empty/,
    ],
    ['an invite hash of digits', { kind: 'invite', hash: '12345' }, /phone number/],
    ['a phone number with a plus', { kind: 'phone', phone: '+15551234567' }, /digits/],
    ['a story numbered zero', { kind: 'story', username: 'newsreader', id: 0 }, /story identifier/],
    [
      'a message past 32 bits',
      { kind: 'message', chat: { username: 'newsreader' }, id: 2 ** 31 },
      /message identifier/,
    ],
    [
      'a poll option that is not text',
      { kind: 'message', chat: { username: 'newsreader' }, id: 1, option: '_w' },
      /poll option/,
    ],
    [
      'a private chat that is not a channel',
      { kind: 'message', chat: { channel: { kind: 'chat', id: 5n } }, id: 1 },
      /channel or supergroup/,
    ],
    [
      'a channel outside the channel ranges',
      { kind: 'boost', chat: { channel: { kind: 'channel', id: 999_999_999_999n } } },
      /channel identifier/,
    ],
    [
      'a share URL with surrounding space',
      { kind: 'share', url: ' example.com' },
      /surrounding space/,
    ],
    [
      'a mini app short name too short',
      { kind: 'mini-app', bot: 'shop_bot', app: 'ab' },
      /short name/,
    ],
    [
      'an attachment target that does not exist',
      { kind: 'attach', bot: 'shop_bot', choose: ['planets' as never] },
      /attachment target/,
    ],
    [
      'a mini app mode that does not exist',
      { kind: 'mini-app', bot: 'shop_bot', mode: 'tiny' as never },
      /compact or fullscreen/,
    ],
    [
      'a proxy server with a space in it',
      { kind: 'proxy', server: 'a b', port: 443, secret: '00' },
      /proxy server/,
    ],
    [
      'a proxy port out of range',
      { kind: 'proxy', server: 'example.com', port: 70_000, secret: '00' },
      /1 to 65535/,
    ],
    [
      'an MTProxy secret in other characters',
      { kind: 'proxy', server: 'example.com', port: 443, secret: '00 11' },
      /hex or base64/,
    ],
    [
      'an empty SOCKS5 password',
      { kind: 'socks', server: 'example.com', port: 1080, pass: '' },
      /empty proxy/,
    ],
    ['a contact token in other characters', { kind: 'contact', token: 'a.b' }, /contact token/],
  ])('refuses %s', (_, link, message) => {
    expect(() => writeLink(link)).toThrow(LinkError)
    expect(() => writeLink(link)).toThrow(message)
  })
})
