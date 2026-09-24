/**
 * The bot surface and sticker sets.
 *
 * Driven by a scripted client, so what is checked is the request each call
 * makes: which scope constructor a scope becomes, which of two methods a
 * group's and a channel's default rights go to, what a pressed button carries,
 * how a sticker's file becomes a document before it joins a set, and how an
 * open mini app is kept open and let go. Nothing reaches Telegram.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import type { MtprotoApi } from '../src/api.js'
import {
  answerBotGuestChatQuery,
  type Configuring,
  deleteMyCommands,
  getBotInfo,
  getBotMenuButton,
  getCallbackAnswer,
  getMyCommands,
  openWebview,
  prepareInlineMessage,
  setBotInfo,
  setBotMenuButton,
  setMyCommands,
  setMyDefaultRights,
  toggleEmojiStatusPermission,
} from '../src/bots/config.js'
import { readStickerSet, StickerSetView } from '../src/entities/sticker-set.js'
import type { TypeInputPeer } from '../src/generated/api/types/index.js'
import type { PeerRef } from '../src/normalize/normalize.js'
import {
  addStickerToSet,
  createStickerSet,
  deleteStickerFromSet,
  getCustomEmojis,
  getCustomEmojisFromMessages,
  getInstalledStickers,
  getMyStickerSets,
  getStickerSet,
  moveStickerInSet,
  replaceStickerInSet,
  setChatStickerSet,
  setStickerSetThumb,
} from '../src/stickers/stickers.js'
import type { TlValue } from '../src/tl/index.js'

interface Call {
  readonly method: string
  readonly params: Record<string, unknown>
}

type Answer = unknown | ((params: Record<string, unknown>, call: number) => unknown)

/** A client recording calls, answering from a script, and holding its timers for the case to run. */
function scripted(script: Readonly<Record<string, Answer>> = {}) {
  const calls: Call[] = []
  const timers: { run: () => void; delay: number; cancelled: boolean }[] = []
  const held = new Set<() => void>()
  const warnings: string[] = []

  const answer = (method: string, params: Record<string, unknown>) => {
    calls.push({ method, params })
    const scriptedAnswer = script[method]
    const made = calls.filter((one) => one.method === method).length

    try {
      const value =
        typeof scriptedAnswer === 'function'
          ? (scriptedAnswer as (p: Record<string, unknown>, n: number) => unknown)(params, made)
          : scriptedAnswer

      return Promise.resolve(value ?? true)
    } catch (error) {
      return Promise.reject(error)
    }
  }

  const handler = (namespace: string) =>
    new Proxy(
      {},
      {
        get: (_target, name: string) => (params: Record<string, unknown>) =>
          answer(`${namespace}.${name}`, params),
      },
    )

  const client: Configuring & {
    readonly calls: Call[]
    readonly timers: typeof timers
    readonly held: Set<() => void>
    readonly warnings: string[]
  } = {
    api: {
      messages: handler('messages'),
      channels: handler('channels'),
      bots: handler('bots'),
      stickers: handler('stickers'),
      account: handler('account'),
      call: (query: TlValue) => {
        const { _: method, ...params } = query

        return answer(method, params)
      },
    } as unknown as MtprotoApi,
    calls,
    timers,
    held,
    warnings,
    resolve(peer: string | PeerRef) {
      const name = typeof peer === 'string' ? peer.replace(/^@/, '') : `${peer.kind}${peer.id}`
      const answerPeer: TypeInputPeer = name.startsWith('channel')
        ? { _: 'inputPeerChannel', channel_id: 77n, access_hash: 770n }
        : name.startsWith('group')
          ? { _: 'inputPeerChat', chat_id: 44n }
          : { _: 'inputPeerUser', user_id: BigInt(name.length), access_hash: 10n }

      return Promise.resolve(answerPeer)
    },
    random: (length) => new Uint8Array(length).fill(9),
    schedule(run, delay) {
      const timer = { run, delay, cancelled: false }
      timers.push(timer)

      return () => {
        timer.cancelled = true
      }
    },
    hold(close) {
      held.add(close)

      return () => {
        held.delete(close)
      }
    },
    warn(message) {
      warnings.push(message)
    },
  }

  return client
}

const sent = (client: { readonly calls: Call[] }, method: string) =>
  client.calls.find((call) => call.method === method)?.params
const methods = (client: { readonly calls: Call[] }) => client.calls.map((call) => call.method)

/** Let the promise chains a timer started finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('commands', () => {
  it.each([
    [undefined, { _: 'botCommandScopeDefault' }],
    ['users', { _: 'botCommandScopeUsers' }],
    ['chats', { _: 'botCommandScopeChats' }],
    ['chatAdmins', { _: 'botCommandScopeChatAdmins' }],
    [{ chat: '@group_one' }, { _: 'botCommandScopePeer', peer: { _: 'inputPeerChat' } }],
    [{ adminsOf: '@group_one' }, { _: 'botCommandScopePeerAdmins', peer: { _: 'inputPeerChat' } }],
    [
      { chat: '@group_one', member: '@someone' },
      { _: 'botCommandScopePeerUser', peer: { _: 'inputPeerChat' }, user_id: { _: 'inputUser' } },
    ],
  ] as const)('names the scope %o as the protocol does', async (scope, expected) => {
    const client = scripted({ 'bots.getBotCommands': [] })

    await getMyCommands(client, scope === undefined ? undefined : { scope })

    expect(sent(client, 'bots.getBotCommands')).toMatchObject({ scope: expected, lang_code: '' })
  })

  it('reads the commands back, and refuses a language that is not a code', async () => {
    const client = scripted({
      'bots.getBotCommands': [{ _: 'botCommand', command: 'start', description: 'Begin' }],
    })

    expect(await getMyCommands(client, { languageCode: 'de' })).toEqual([
      { command: 'start', description: 'Begin' },
    ])
    expect(sent(client, 'bots.getBotCommands')).toMatchObject({ lang_code: 'de' })

    const refused = scripted()
    await expect(getMyCommands(refused, { languageCode: 'German' })).rejects.toThrow(
      /language code/,
    )
    expect(refused.calls).toEqual([])
  })

  it('publishes a list, checking each command before anything is sent', async () => {
    const client = scripted()
    await setMyCommands(client, [{ command: 'help_me', description: 'Explain' }], {
      scope: 'users',
    })
    expect(sent(client, 'bots.setBotCommands')).toEqual({
      scope: { _: 'botCommandScopeUsers' },
      lang_code: '',
      commands: [{ _: 'botCommand', command: 'help_me', description: 'Explain' }],
    })

    for (const bad of [
      { command: 'Start', description: 'x' },
      { command: 'a'.repeat(33), description: 'x' },
      { command: 'ok', description: '' },
    ]) {
      const refused = scripted()
      await expect(setMyCommands(refused, [bad])).rejects.toThrow(ValidationError)
      expect(refused.calls).toEqual([])
    }
  })

  it('refuses an empty list as a way of deleting, which has its own call', async () => {
    const client = scripted()
    await expect(setMyCommands(client, [])).rejects.toThrow(/deleteMyCommands/)

    await deleteMyCommands(client, { scope: 'chats', languageCode: 'fr' })
    expect(methods(client)).toEqual(['bots.resetBotCommands'])
    expect(sent(client, 'bots.resetBotCommands')).toEqual({
      scope: { _: 'botCommandScopeChats' },
      lang_code: 'fr',
    })
  })
})

describe('a bot’s description', () => {
  it('names the bot only when the account is its owner rather than the bot', async () => {
    const answer = { _: 'bots.botInfo', name: 'Shop', about: 'a', description: 'd' }
    const itself = scripted({ 'bots.getBotInfo': answer })
    expect(await getBotInfo(itself)).toEqual({ name: 'Shop', about: 'a', description: 'd' })
    expect(sent(itself, 'bots.getBotInfo')).toEqual({ lang_code: '' })

    const owner = scripted({ 'bots.getBotInfo': answer })
    await getBotInfo(owner, { bot: '@shop_bot', languageCode: 'en' })
    expect(sent(owner, 'bots.getBotInfo')).toMatchObject({
      bot: { _: 'inputUser' },
      lang_code: 'en',
    })
  })

  it('sends only what changes, where an empty field clears and an absent one leaves it', async () => {
    const client = scripted()

    await setBotInfo(client, { about: '', name: 'Shop' })

    expect(sent(client, 'bots.setBotInfo')).toEqual({ lang_code: '', about: '', name: 'Shop' })
    await expect(setBotInfo(scripted(), { languageCode: 'en' })).rejects.toThrow(
      /say what to change/,
    )
  })
})

describe('the menu button and default rights', () => {
  it('reads and sets the button for one person, or for everybody', async () => {
    const client = scripted({
      'bots.getBotMenuButton': { _: 'botMenuButton', text: 'Shop', url: 'https://example.com' },
    })

    expect(await getBotMenuButton(client)).toEqual({
      kind: 'webApp',
      text: 'Shop',
      url: 'https://example.com',
    })
    expect(sent(client, 'bots.getBotMenuButton')).toEqual({ user_id: { _: 'inputUserEmpty' } })

    await setBotMenuButton(client, { kind: 'commands' }, '@someone')
    expect(sent(client, 'bots.setBotMenuButton')).toMatchObject({
      user_id: { _: 'inputUser' },
      button: { _: 'botMenuButtonCommands' },
    })

    await expect(
      setBotMenuButton(scripted(), { kind: 'webApp', text: 'x', url: 'http://example.com' }),
    ).rejects.toThrow(/https/)
  })

  it('sends a group’s and a channel’s default rights to their own methods', async () => {
    const client = scripted()

    await setMyDefaultRights(client, 'group', { banUsers: true, manageWelcomeMessages: true })
    await setMyDefaultRights(client, 'channel', { postMessages: true })

    expect(sent(client, 'bots.setBotGroupDefaultAdminRights')).toEqual({
      admin_rights: { _: 'chatAdminRights', ban_users: true, manage_welcome_messages: true },
    })
    expect(sent(client, 'bots.setBotBroadcastDefaultAdminRights')).toEqual({
      admin_rights: { _: 'chatAdminRights', post_messages: true },
    })
  })
})

describe('pressing a bot’s button', () => {
  const answered = { _: 'messages.botCallbackAnswer', message: 'Done', alert: true, cache_time: 5 }

  it('carries the button’s data as bytes and reads what the bot answered', async () => {
    const client = scripted({ 'messages.getBotCallbackAnswer': answered })

    const answer = await getCallbackAnswer(client, '@shop_bot', 12, { data: 'buy:42' })

    expect(sent(client, 'messages.getBotCallbackAnswer')).toEqual({
      peer: { _: 'inputPeerUser', user_id: 8n, access_hash: 10n },
      msg_id: 12,
      data: new TextEncoder().encode('buy:42'),
    })
    expect(answer).toEqual({ message: 'Done', alert: true, cacheTime: 5 })
  })

  it('proves the password where the button asks for it, and refuses a button with nothing to press', async () => {
    const client = scripted({
      'account.getPassword': {
        _: 'account.password',
        new_algo: {},
        new_secure_algo: {},
        secure_random: new Uint8Array(),
      },
      'messages.getBotCallbackAnswer': answered,
    })

    await getCallbackAnswer(client, '@shop_bot', 12, {
      data: Uint8Array.of(1),
      password: 'hunter2',
    })

    // An account with no password set is proved by saying so, and the password
    // itself is never sent.
    expect(methods(client)).toEqual(['account.getPassword', 'messages.getBotCallbackAnswer'])
    expect(sent(client, 'messages.getBotCallbackAnswer')?.['password']).toEqual({
      _: 'inputCheckPasswordEmpty',
    })
    expect(JSON.stringify(client.calls, (_k, v) => (typeof v === 'bigint' ? '' : v))).not.toContain(
      'hunter2',
    )

    await expect(getCallbackAnswer(scripted(), '@shop_bot', 12, {})).rejects.toThrow(
      /carries its data/,
    )
  })

  it('lets a bot set this account’s emoji status, naming a person and not a chat', async () => {
    const client = scripted()
    await toggleEmojiStatusPermission(client, '@shop_bot', false)
    expect(sent(client, 'bots.toggleUserEmojiStatusPermission')).toEqual({
      bot: { _: 'inputUser', user_id: 8n, access_hash: 10n },
      enabled: false,
    })

    await expect(toggleEmojiStatusPermission(scripted(), '@channel_news', true)).rejects.toThrow(
      /user or a bot/,
    )
  })
})

describe('results a bot hands over', () => {
  const result = { _: 'inputBotInlineResult', id: 'r', type: 'article', send_message: {} } as never

  it('answers a guest chat query and returns the message it became', async () => {
    const id = { _: 'inputBotInlineMessageID', dc_id: 2, id: 1n, access_hash: 2n }
    const client = scripted({ 'messages.setBotGuestChatResult': id })

    expect(await answerBotGuestChatQuery(client, 99n, result)).toBe(id)
    expect(sent(client, 'messages.setBotGuestChatResult')).toEqual({ query_id: 99n, result })
  })

  it('prepares a message for a mini app, for the kinds of conversation named', async () => {
    const client = scripted({
      'messages.savePreparedInlineMessage': {
        _: 'messages.botPreparedInlineMessage',
        id: 'prep',
        expire_date: 1_700,
      },
    })

    const prepared = await prepareInlineMessage(client, '@someone', result, [
      'groups',
      'channels',
      'groups',
    ])

    expect(prepared).toEqual({ id: 'prep', expiresAt: 1_700 })
    expect(sent(client, 'messages.savePreparedInlineMessage')?.['peer_types']).toEqual([
      { _: 'inlineQueryPeerTypeChat' },
      { _: 'inlineQueryPeerTypeBroadcast' },
    ])
    await expect(prepareInlineMessage(scripted(), '@someone', result, [])).rejects.toThrow(
      /at least one/,
    )
  })
})

describe('an open mini app', () => {
  const opened = (queryId?: bigint) => ({
    _: 'webViewResultUrl',
    url: 'https://app.example/#tgWebAppData',
    ...(queryId === undefined ? {} : { query_id: queryId }),
  })

  it('opens the main app without a conversation, and keeps nothing running', async () => {
    const client = scripted({ 'messages.requestMainWebView': opened() })

    const view = await openWebview(client, {
      bot: '@shop_bot',
      source: { kind: 'main', startParam: 'x' },
      platform: 'android',
      theme: { bg_color: '#ffffff' },
    })

    expect(sent(client, 'messages.requestMainWebView')).toEqual({
      peer: { _: 'inputPeerEmpty' },
      bot: { _: 'inputUser', user_id: 8n, access_hash: 10n },
      start_param: 'x',
      theme_params: { _: 'dataJSON', data: '{"bg_color":"#ffffff"}' },
      platform: 'android',
    })
    expect(view.url).toBe('https://app.example/#tgWebAppData')
    expect(client.timers).toEqual([])
    expect(client.held.size).toBe(0)
  })

  it('prolongs a query every minute with what it was opened with, until it is closed', async () => {
    const client = scripted({ 'messages.requestWebView': opened(55n) })

    const view = await openWebview(client, {
      bot: '@shop_bot',
      chat: '@group_one',
      source: { kind: 'chat', url: 'https://app.example', replyTo: 3, silent: true },
      platform: 'tdesktop',
    })

    expect(view.queryId).toBe(55n)
    // Telegram asks for a prolongation every minute while the app is open.
    expect(client.timers.map((timer) => timer.delay)).toEqual([60_000])
    expect(client.held.size).toBe(1)

    client.timers[0]?.run()
    await settle()

    expect(sent(client, 'messages.prolongWebView')).toEqual({
      peer: { _: 'inputPeerChat', chat_id: 44n },
      bot: { _: 'inputUser', user_id: 8n, access_hash: 10n },
      reply_to: { _: 'inputReplyToMessage', reply_to_msg_id: 3 },
      silent: true,
      query_id: 55n,
    })
    // The next minute is arranged only after this one was said.
    expect(client.timers).toHaveLength(2)

    view.close()
    view.close()
    expect(client.timers[1]?.cancelled).toBe(true)
    expect(client.held.size).toBe(0)
    expect(view.open).toBe(false)
  })

  it('closes itself when Telegram says the query is gone', async () => {
    const client = scripted({
      'messages.requestAppWebView': opened(56n),
      'messages.prolongWebView': () => {
        throw new Error('QUERY_ID_INVALID (400)')
      },
    })

    const view = await openWebview(client, {
      bot: '@shop_bot',
      source: { kind: 'app', shortName: 'catalog', allowWrite: true },
      platform: 'ios',
    })
    expect(sent(client, 'messages.requestAppWebView')).toMatchObject({
      app: { _: 'inputBotAppShortName', short_name: 'catalog' },
      write_allowed: true,
    })

    client.timers[0]?.run()
    await settle()

    expect(view.open).toBe(false)
    expect(client.timers).toHaveLength(1)
    expect(client.held.size).toBe(0)
  })

  it('keeps trying after any other refusal, and says so', async () => {
    const client = scripted({
      'messages.requestWebView': opened(57n),
      'messages.prolongWebView': (_params: unknown, call: number) => {
        if (call === 1) throw new Error('FLOOD_WAIT_2 (420)')

        return true
      },
    })

    const view = await openWebview(client, {
      bot: '@shop_bot',
      source: { kind: 'chat' },
      platform: 'android',
    })

    client.timers[0]?.run()
    await settle()

    expect(view.open).toBe(true)
    expect(client.warnings).toEqual(['could not keep the mini app open'])
    expect(client.timers).toHaveLength(2)
  })

  it('refuses a request with no platform, and a bot that is not a person', async () => {
    await expect(
      openWebview(scripted(), { bot: '@shop_bot', source: { kind: 'main' }, platform: '' }),
    ).rejects.toThrow(/platform/)
    await expect(
      openWebview(scripted(), { bot: '@channel_news', source: { kind: 'main' }, platform: 'x' }),
    ).rejects.toThrow(/belongs to a bot/)
  })
})

describe('sticker sets', () => {
  const set = {
    _: 'stickerSet',
    id: 5n,
    access_hash: 6n,
    title: 'Cats',
    short_name: 'cats',
    count: 1,
    hash: 0,
  }
  const contents = {
    _: 'messages.stickerSet',
    set,
    packs: [],
    keywords: [],
    documents: [{ _: 'document', id: 30n }],
  }
  const document = (id: bigint) => ({
    _: 'document',
    id,
    access_hash: id + 1n,
    file_reference: Uint8Array.of(1),
  })
  const upload = (mime = 'image/webp') => ({
    _: 'inputMediaUploadedDocument' as const,
    file: { _: 'inputFile' as const, id: 1n, parts: 1, name: 's', md5_checksum: '' },
    mime_type: mime,
    attributes: [],
  })

  it('names a set by its short name or by its identifier', async () => {
    const byName = scripted({ 'messages.getStickerSet': contents })
    const read = await getStickerSet(byName, 'cats')
    expect(sent(byName, 'messages.getStickerSet')).toEqual({
      stickerset: { _: 'inputStickerSetShortName', short_name: 'cats' },
      hash: 0,
    })
    expect(read.documents).toHaveLength(1)

    const byId = scripted({ 'messages.getStickerSet': contents })
    await getStickerSet(byId, { id: 5n, accessHash: 6n })
    expect(sent(byId, 'messages.getStickerSet')?.['stickerset']).toEqual({
      _: 'inputStickerSetID',
      id: 5n,
      access_hash: 6n,
    })

    const unchanged = scripted({
      'messages.getStickerSet': { _: 'messages.stickerSetNotModified' },
    })
    await expect(getStickerSet(unchanged, 'cats')).rejects.toThrow(/without describing/)
  })

  it('reads the installed sets, and the account’s own a page at a time', async () => {
    const installed = scripted({
      'messages.getAllStickers': { _: 'messages.allStickers', hash: 1n, sets: [set] },
    })
    // Brief views over what the list carried: the set, and no stickers.
    const sets = await getInstalledStickers(installed)
    expect(sets.map((one) => one.raw)).toEqual([set])
    expect(sets.map((one) => [one.title, one.isFull, one.stickers.length])).toEqual([
      ['Cats', false, 0],
    ])

    const covered = (id: bigint) => ({ _: 'stickerSetNoCovered', set: { ...set, id } })
    const full = scripted({
      'messages.getMyStickers': {
        _: 'messages.myStickers',
        count: 5,
        sets: [covered(1n), covered(2n)],
      },
    })
    const page = await getMyStickerSets(full, { limit: 2 })
    expect(page).toMatchObject({ total: 5, next: 2n })
    expect(page.sets.map((one) => one.id)).toEqual([1n, 2n])
    expect(sent(full, 'messages.getMyStickers')).toEqual({ offset_id: 0n, limit: 2 })

    const last = scripted({
      'messages.getMyStickers': { _: 'messages.myStickers', count: 5, sets: [covered(5n)] },
    })
    expect(await getMyStickerSets(last, { from: 2n, limit: 2 })).not.toHaveProperty('next')
  })

  it('hands each sticker’s file over first, then makes the set from documents', async () => {
    const client = scripted({
      'messages.uploadMedia': (_params: unknown, call: number) => ({
        _: 'messageMediaDocument',
        document: document(BigInt(100 + call)),
      }),
      'stickers.createStickerSet': contents,
    })

    await createStickerSet(client, {
      owner: '@someone',
      title: 'Cats',
      shortName: 'cats_by_shop_bot',
      kind: 'masks',
      stickers: [
        { file: upload(), emoji: '🐱', keywords: ['cat', ' kitten '] },
        {
          file: upload('video/webm'),
          emoji: '😺',
          mask: { point: 'mouth', x: 0.5, y: -1, scale: 2 },
        },
      ],
    })

    expect(methods(client)).toEqual([
      'messages.uploadMedia',
      'messages.uploadMedia',
      'stickers.createStickerSet',
    ])
    expect(sent(client, 'messages.uploadMedia')?.['peer']).toEqual({ _: 'inputPeerSelf' })
    const made = sent(client, 'stickers.createStickerSet')
    expect(made).toMatchObject({
      user_id: { _: 'inputUser' },
      masks: true,
      short_name: 'cats_by_shop_bot',
    })
    expect(made?.['stickers']).toEqual([
      {
        _: 'inputStickerSetItem',
        document: {
          _: 'inputDocument',
          id: 101n,
          access_hash: 102n,
          file_reference: Uint8Array.of(1),
        },
        emoji: '🐱',
        keywords: 'cat,kitten',
      },
      {
        _: 'inputStickerSetItem',
        document: {
          _: 'inputDocument',
          id: 102n,
          access_hash: 103n,
          file_reference: Uint8Array.of(1),
        },
        emoji: '😺',
        mask_coords: { _: 'maskCoords', n: 2, x: 0.5, y: -1, zoom: 2 },
      },
    ])
  })

  it('refuses what Telegram would refuse, before anything is uploaded', async () => {
    const base = {
      owner: '@someone',
      title: 'Cats',
      shortName: 'cats',
      stickers: [{ file: upload(), emoji: '🐱' }],
    }

    for (const [change, reason] of [
      [{ shortName: 'cats__two' }, /short name/],
      [{ shortName: '1cats' }, /short name/],
      [{ title: '' }, /title/],
      [{ stickers: [] }, /at least one sticker/],
      [{ adaptive: true }, /custom emoji/],
      [{ stickers: [{ file: upload('image/jpeg'), emoji: '🐱' }] }, /WEBP or PNG/],
      [{ stickers: [{ file: upload(), emoji: ' ' }] }, /at least one emoji/],
      [{ stickers: [{ file: upload(), emoji: '🐱', keywords: ['a,b'] }] }, /comma/],
    ] as const) {
      const client = scripted()
      await expect(createStickerSet(client, { ...base, ...change } as never)).rejects.toThrow(
        reason,
      )
      expect(methods(client)).not.toContain('stickers.createStickerSet')
      expect(methods(client)).not.toContain('messages.uploadMedia')
    }
  })

  it('adds, replaces, removes and moves stickers by the documents they are', async () => {
    const client = scripted({
      'stickers.addStickerToSet': contents,
      'stickers.replaceSticker': contents,
      'stickers.removeStickerFromSet': contents,
      'stickers.changeStickerPosition': contents,
    })
    const held = {
      _: 'inputDocument' as const,
      id: 7n,
      access_hash: 8n,
      file_reference: Uint8Array.of(2),
    }

    await addStickerToSet(client, 'cats', { file: held, emoji: '🐈' })
    await replaceStickerInSet(client, document(30n) as never, { file: held, emoji: '🐈' })
    await deleteStickerFromSet(client, document(30n) as never)
    await moveStickerInSet(client, held, 0)

    // A document Telegram already holds is used as it is: nothing is uploaded.
    expect(methods(client)).not.toContain('messages.uploadMedia')
    expect(sent(client, 'stickers.addStickerToSet')).toEqual({
      stickerset: { _: 'inputStickerSetShortName', short_name: 'cats' },
      sticker: { _: 'inputStickerSetItem', document: held, emoji: '🐈' },
    })
    expect(sent(client, 'stickers.removeStickerFromSet')).toEqual({
      sticker: { _: 'inputDocument', id: 30n, access_hash: 31n, file_reference: Uint8Array.of(1) },
    })
    expect(sent(client, 'stickers.changeStickerPosition')).toEqual({ sticker: held, position: 0 })
    await expect(moveStickerInSet(scripted(), held, -1)).rejects.toThrow(/counted from zero/)
  })

  it('sets a thumbnail from a file or one of the set’s own emoji, or takes it away', async () => {
    const client = scripted({ 'stickers.setStickerSetThumb': contents })

    await setStickerSetThumb(client, 'cats', { emojiId: 9n })
    await setStickerSetThumb(client, 'cats', undefined)

    const [byEmoji, cleared] = client.calls.map((call) => call.params)
    expect(byEmoji).toEqual({
      stickerset: { _: 'inputStickerSetShortName', short_name: 'cats' },
      thumb_document_id: 9n,
    })
    expect(cleared).toEqual({ stickerset: { _: 'inputStickerSetShortName', short_name: 'cats' } })
  })

  it('chooses a supergroup’s set, removes it, and refuses anything but a supergroup', async () => {
    const client = scripted()

    await setChatStickerSet(client, '@channel_group', 'cats')
    await setChatStickerSet(client, '@channel_group', undefined)

    expect(client.calls.map((call) => call.params['stickerset'])).toEqual([
      { _: 'inputStickerSetShortName', short_name: 'cats' },
      { _: 'inputStickerSetEmpty' },
    ])
    await expect(setChatStickerSet(scripted(), '@group_one', 'cats')).rejects.toThrow(/supergroup/)
  })
})

describe('custom emoji', () => {
  const emoji = (id: bigint) => ({
    _: 'document',
    id,
    access_hash: 1n,
    file_reference: Uint8Array.of(1),
  })

  it('answers one document per identifier, with a gap where there is none', async () => {
    const client = scripted({
      'messages.getCustomEmojiDocuments': [emoji(3n), { _: 'documentEmpty', id: 4n }],
    })

    const found = await getCustomEmojis(client, [4n, 3n, 9n])

    expect(found.map((one) => one?.id)).toEqual([undefined, 3n, undefined])
  })

  it('gathers the emoji messages use, once each, in the order they first appear', async () => {
    const client = scripted({
      'messages.getCustomEmojiDocuments': (params: Record<string, unknown>) =>
        (params['document_id'] as bigint[]).map(emoji),
    })
    const withEmoji = (...ids: bigint[]) => ({
      _: 'message',
      id: 1,
      message: 'x',
      entities: ids.map((id) => ({
        _: 'messageEntityCustomEmoji',
        offset: 0,
        length: 1,
        document_id: id,
      })),
    })

    const found = await getCustomEmojisFromMessages(client, [
      withEmoji(7n, 5n),
      { _: 'messageService', id: 2 },
      withEmoji(5n, 8n),
    ] as never)

    expect(sent(client, 'messages.getCustomEmojiDocuments')).toEqual({ document_id: [7n, 5n, 8n] })
    expect(found.map((one) => one.id)).toEqual([7n, 5n, 8n])

    const none = scripted()
    expect(await getCustomEmojisFromMessages(none, [withEmoji()] as never)).toEqual([])
    expect(none.calls).toEqual([])
  })
})

describe('a sticker set, read', () => {
  const brief = {
    _: 'stickerSet' as const,
    emojis: true as const,
    creator: true as const,
    installed_date: 1_700_000_000,
    id: 9n,
    access_hash: -3n,
    title: 'Faces',
    short_name: 'faces',
    count: 3,
    hash: 0,
    thumbs: [
      { _: 'photoStrippedSize' as const, type: 'i', bytes: new Uint8Array([1, 2, 3]) },
      { _: 'photoSize' as const, type: 's', w: 100, h: 100, size: 2048 },
    ],
    thumb_dc_id: 4,
    thumb_version: 7,
  }
  const sticker = (id: bigint, alt: string) => ({
    _: 'document' as const,
    id,
    access_hash: id * 10n,
    file_reference: new Uint8Array(0),
    date: 1,
    mime_type: 'image/webp',
    size: 10n,
    dc_id: 2,
    attributes: [
      {
        _: 'documentAttributeSticker' as const,
        alt,
        stickerset: { _: 'inputStickerSetEmpty' as const },
      },
    ],
  })
  const full = new StickerSetView({
    _: 'messages.stickerSet',
    set: brief,
    documents: [sticker(1n, '😀'), sticker(2n, '😢'), sticker(3n, '')],
    packs: [
      { _: 'stickerPack', emoticon: '😀', documents: [1n, 3n] },
      { _: 'stickerPack', emoticon: '🙂', documents: [1n] },
      { _: 'stickerPack', emoticon: '😢', documents: [2n] },
    ],
    keywords: [{ _: 'stickerKeyword', document_id: 2n, keyword: ['sad', 'tear'] }],
  })

  it('reads the set’s description, and names it by identifier and by link', () => {
    expect([full.id, full.accessHash, full.title, full.shortName, full.count]).toEqual([
      9n,
      -3n,
      'Faces',
      'faces',
      3,
    ])
    expect([full.kind, full.isCreator, full.isArchived, full.isOfficial]).toEqual([
      'emoji',
      true,
      false,
      false,
    ])
    expect(full.installedDate).toBe(1_700_000_000)
    const colored = new StickerSetView({
      ...brief,
      text_color: true,
      channel_emoji_status: true,
      thumb_document_id: 77n,
    })
    expect([colored.isTextColored, colored.isChannelStatus, colored.thumbnailEmojiId]).toEqual([
      true,
      true,
      77n,
    ])
    expect([full.isTextColored, full.isChannelStatus, full.thumbnailEmojiId]).toEqual([
      false,
      false,
      undefined,
    ])
    expect(full.input).toEqual({ _: 'inputStickerSetID', id: 9n, access_hash: -3n })
    expect(full.link).toBe('https://t.me/addemoji/faces')
    const { emojis: _emojis, ...plain } = brief
    expect(new StickerSetView(plain).link).toBe('https://t.me/addstickers/faces')
  })

  it('pairs every sticker with the emoji the set files it under and its keywords, in order', () => {
    expect(full.isFull).toBe(true)
    expect(
      full.stickers.map((item) => [item.document.id, item.alt, item.emojis, item.keywords]),
    ).toEqual([
      [1n, '😀', ['😀', '🙂'], []],
      [2n, '😢', ['😢'], ['sad', 'tear']],
      [3n, '', ['😀'], []],
    ])
    expect(full.byEmoji('😀').map((item) => item.document.id)).toEqual([1n, 3n])
    expect(full.byEmoji('🎉')).toEqual([])
  })

  it('reads a brief form, with its covers, as a set with no stickers listed', () => {
    const covered = new StickerSetView({
      _: 'stickerSetMultiCovered',
      set: brief,
      covers: [sticker(1n, '😀'), sticker(2n, '😢')],
    })

    expect(covered.isFull).toBe(false)
    expect(covered.count).toBe(3)
    expect(covered.stickers).toEqual([])
    expect(covered.covers.map((one) => one._ === 'document' && one.id)).toEqual([1n, 2n])
    expect(readStickerSet(undefined)).toBeUndefined()
  })

  it('offers the set’s own picture for download, and nothing for a size that arrived inline', () => {
    expect(full.thumbnailFile()).toEqual({
      location: {
        _: 'inputStickerSetThumb',
        stickerset: { _: 'inputStickerSetID', id: 9n, access_hash: -3n },
        thumb_version: 7,
      },
      dcId: 4,
      size: 2048,
    })
    expect(full.thumbnailFile('i')).toBeUndefined()
    const { thumb_version: _version, ...unversioned } = brief
    expect(new StickerSetView(unversioned).thumbnailFile()).toBeUndefined()
  })

  it('serialises as the value Telegram sent', () => {
    expect(
      JSON.parse(
        JSON.stringify({ at: full }, (_key, value) =>
          typeof value === 'bigint' ? String(value) : value,
        ),
      ).at._,
    ).toBe('messages.stickerSet')
  })
})
