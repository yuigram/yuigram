// SPDX-License-Identifier: MPL-2.0

/**
 * Game scores, and the operations that concern the account itself.
 *
 * Two families that share a file because each is small and neither belongs to
 * a conversation. What is worth pinning: an inline game is acted on where its
 * identifier says it lives, a takeout wraps calls rather than replacing the
 * connection, and a bound view merges its defaults instead of replacing them.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import type { MtprotoApi } from '../src/api.js'
import {
  type Gaming,
  getGameHighScores,
  getInlineGameHighScores,
  setGameScore,
  setInlineGameScore,
} from '../src/bots/games.js'
import type { TypeInputPeer } from '../src/generated/api/types/index.js'
import { writeInlineMessageId } from '../src/messaging/interact.js'
import type { PeerRef } from '../src/normalize/normalize.js'
import {
  type CallDefaults,
  getCollectibleInfo,
  initTakeoutSession,
  isSelfPeer,
  type Operating,
  withParams,
} from '../src/session/operations.js'
import type { TlValue } from '../src/tl/index.js'

interface Call {
  readonly method: string
  readonly params: Record<string, unknown>
  readonly dcId?: number
}

const SCORES = {
  _: 'messages.highScores',
  scores: [
    { _: 'highScore', pos: 1, user_id: 9n, score: 500 },
    { _: 'highScore', pos: 2, user_id: 8n, score: 250 },
  ],
  users: [],
}

function scripted(script: Readonly<Record<string, unknown>> = {}) {
  const calls: Call[] = []
  const fed: TlValue[] = []

  const answer = (method: string, params: Record<string, unknown>, dcId?: number) => {
    calls.push({ method, params, ...(dcId === undefined ? {} : { dcId }) })

    return Promise.resolve(script[method] ?? true)
  }

  const handler = (namespace: string) =>
    new Proxy(
      {},
      {
        get: (_t, name: string) => (params: Record<string, unknown>) =>
          answer(`${namespace}.${name}`, params),
      },
    )

  const client: Gaming &
    Operating & {
      readonly calls: Call[]
      readonly fed: TlValue[]
    } = {
    api: {
      messages: handler('messages'),
      account: handler('account'),
      fragment: handler('fragment'),
      call: (query: TlValue) => {
        const { _: method, ...params } = query

        return answer(method, params)
      },
    } as unknown as MtprotoApi,
    calls,
    fed,
    resolve(peer: string | PeerRef) {
      const name = typeof peer === 'string' ? peer.replace(/^@/, '') : `${peer.kind}${peer.id}`
      const id = typeof peer === 'object' ? peer.id : undefined
      const resolved: TypeInputPeer = name.startsWith('channel')
        ? { _: 'inputPeerChannel', channel_id: id ?? 77n, access_hash: 770n }
        : name.startsWith('chat')
          ? { _: 'inputPeerChat', chat_id: id ?? 44n }
          : name === 'me' || name === 'self'
            ? { _: 'inputPeerSelf' }
            : { _: 'inputPeerUser', user_id: id ?? 9n, access_hash: 90n }

      return Promise.resolve(resolved)
    },
    feed(value: TlValue) {
      fed.push(value)

      return Promise.resolve()
    },
    at(dcId: number, query: TlValue) {
      const { _: method, ...params } = query

      return answer(method, params, dcId) as Promise<TlValue>
    },
  }

  return client
}

const sent = (client: { readonly calls: Call[] }, method: string) =>
  client.calls.find((call) => call.method === method)

describe('game scores', () => {
  const edited = {
    _: 'updates',
    updates: [
      {
        _: 'updateEditMessage',
        message: {
          _: 'message',
          id: 12,
          peer_id: { _: 'peerChannel', channel_id: 77n },
          message: '',
        },
      },
    ],
    chats: [],
    users: [],
  }

  it('edits the board by default and hands back the message', async () => {
    const client = scripted({ 'messages.setGameScore': edited })

    const message = await setGameScore(client, '@channel_news', 12, { kind: 'user', id: 9n }, 500)

    expect(sent(client, 'messages.setGameScore')?.params).toMatchObject({
      peer: { _: 'inputPeerChannel', channel_id: 77n },
      id: 12,
      user_id: { _: 'inputUser', user_id: 9n },
      score: 500,
      edit_message: true,
    })
    expect(message?.id).toBe(12)
    expect(client.fed).toHaveLength(1)
  })

  it('leaves the board alone when told to, and lets a score fall when forced', async () => {
    const client = scripted({ 'messages.setGameScore': edited })

    await setGameScore(client, '@channel_news', 12, { kind: 'user', id: 9n }, 1, {
      noEdit: true,
      force: true,
    })

    const params = sent(client, 'messages.setGameScore')?.params
    expect(params).not.toHaveProperty('edit_message')
    expect(params).toMatchObject({ force: true })
  })

  it('refuses a score that is not a whole number of points, before calling', async () => {
    for (const bad of [-1, 1.5, Number.NaN]) {
      const client = scripted()
      await expect(
        setGameScore(client, '@channel_news', 12, { kind: 'user', id: 9n }, bad),
      ).rejects.toThrow(ValidationError)
      expect(client.calls).toEqual([])
    }
  })

  it('refuses a player that is a conversation', async () => {
    await expect(setGameScore(scripted(), '@channel_news', 12, '@channel_news', 1)).rejects.toThrow(
      /played by a person/,
    )
  })

  it('reads a score table, with each player as a reference', async () => {
    const client = scripted({ 'messages.getGameHighScores': SCORES })

    const table = await getGameHighScores(client, '@channel_news', 12, { kind: 'user', id: 9n })

    expect(table).toEqual([
      { position: 1, user: { kind: 'user', id: 9n }, score: 500 },
      { position: 2, user: { kind: 'user', id: 8n }, score: 250 },
    ])
  })
})

describe('a game sent inline', () => {
  const inline = writeInlineMessageId({
    _: 'inputBotInlineMessageID',
    dc_id: 4,
    id: 42n,
    access_hash: 7n,
  })

  it('is acted on where its identifier says it lives', async () => {
    const client = scripted()

    await setInlineGameScore(client, inline, { kind: 'user', id: 9n }, 500)

    const call = sent(client, 'messages.setInlineGameScore')
    expect(call?.dcId).toBe(4)
    expect(call?.params).toMatchObject({ score: 500, edit_message: true })
  })

  it('takes the identifier as an object as readily as a string', async () => {
    const client = scripted({ 'messages.getInlineGameHighScores': SCORES })

    const table = await getInlineGameHighScores(
      client,
      { _: 'inputBotInlineMessageID', dc_id: 2, id: 1n, access_hash: 3n },
      { kind: 'user', id: 9n },
    )

    expect(sent(client, 'messages.getInlineGameHighScores')?.dcId).toBe(2)
    expect(table).toHaveLength(2)
  })
})

describe('exporting an account', () => {
  it('wraps every call in the export rather than opening another connection', async () => {
    const client = scripted({
      'account.initTakeoutSession': { _: 'account.takeout', id: 77n },
    })

    const takeout = await initTakeoutSession(client, {
      contacts: true,
      privateChats: true,
      files: true,
      maxFileSize: 1_000n,
    })

    expect(sent(client, 'account.initTakeoutSession')?.params).toEqual({
      contacts: true,
      message_users: true,
      files: true,
      file_max_size: 1_000n,
    })
    expect(takeout.id).toBe(77n)

    await takeout.call({ _: 'messages.getHistory' })
    expect(sent(client, 'invokeWithTakeout')?.params).toEqual({
      takeout_id: 77n,
      query: { _: 'messages.getHistory' },
    })
  })

  it('refuses a file size when files were not asked for', async () => {
    await expect(initTakeoutSession(scripted(), { maxFileSize: 10n })).rejects.toThrow(
      /only means something when files are included/,
    )
  })

  it('finishes once, and refuses calls afterwards', async () => {
    const client = scripted({ 'account.initTakeoutSession': { _: 'account.takeout', id: 77n } })
    const takeout = await initTakeoutSession(client)

    await takeout.finish(true)
    await takeout.finish(true)

    // Ending an export closes the export; it does not sign the account out.
    const finishes = client.calls.filter((call) => call.method === 'account.finishTakeoutSession')
    expect(finishes).toHaveLength(1)
    expect(finishes[0]?.params).toEqual({ success: true })
    await expect(takeout.call({ _: 'messages.getHistory' })).rejects.toThrow(
      /already been finished/,
    )
  })

  it('says an export did not finish without claiming it did', async () => {
    const client = scripted({ 'account.initTakeoutSession': { _: 'account.takeout', id: 77n } })
    const takeout = await initTakeoutSession(client)

    await takeout.finish(false)

    expect(sent(client, 'account.finishTakeoutSession')?.params).toEqual({})
  })
})

describe('binding call defaults', () => {
  /** A client recording what options each call was made with. */
  function bound() {
    const made: (CallDefaults | undefined)[] = []

    return {
      made,
      view: withParams(
        {
          call: async (_query: TlValue, options?: CallDefaults) => {
            made.push(options)

            return { _: 'boolTrue' } as TlValue
          },
        },
        { timeout: 5_000 },
      ),
    }
  }

  it('applies the defaults, and lets one call override them', async () => {
    const { made, view } = bound()

    await view.call({ _: 'help.getConfig' })
    await view.call({ _: 'help.getConfig' }, { timeout: 100 })

    expect(made[0]).toEqual({ timeout: 5_000 })
    expect(made[1]).toEqual({ timeout: 100 })
    expect(view.defaults).toEqual({ timeout: 5_000 })
  })

  it('merges a nested view over the outer one rather than replacing it', async () => {
    const { made, view } = bound()
    const signal = new AbortController().signal

    await view.with({ signal }).call({ _: 'help.getConfig' })

    expect(made[0]).toEqual({ timeout: 5_000, signal })
  })
})

describe('whether a peer is this account', () => {
  const selfless = (selfId: bigint | undefined) => {
    const client = scripted()

    return { client, view: { ...client, selfId: () => Promise.resolve(selfId) } }
  }

  it('answers the names that say so outright, without asking anything', async () => {
    const { client, view } = selfless(9n)

    expect(await isSelfPeer(view, 'me')).toBe(true)
    expect(await isSelfPeer(view, 'self')).toBe(true)
    expect(client.calls).toEqual([])
  })

  it('compares a user reference against the recorded identifier', async () => {
    const { client, view } = selfless(9n)

    expect(await isSelfPeer(view, { kind: 'user', id: 9n })).toBe(true)
    expect(await isSelfPeer(view, { kind: 'user', id: 8n })).toBe(false)
    // Answered from what the account already knows.
    expect(client.calls).toEqual([])
  })

  it('resolves anything else, and a conversation is never this account', async () => {
    const { view } = selfless(9n)

    expect(await isSelfPeer(view, '@someone')).toBe(true)
    expect(await isSelfPeer(view, '@channel_news')).toBe(false)
  })

  it('does not mistake a conversation that shares this account’s number', async () => {
    // Identifiers are unique within a kind, not across them: a channel numbered
    // 9 is not the account numbered 9.
    const { view } = selfless(9n)

    expect(await isSelfPeer(view, { kind: 'channel', id: 9n })).toBe(false)
    expect(await isSelfPeer(view, { kind: 'chat', id: 9n })).toBe(false)
  })

  it('falls back to asking when the account has not recorded who it is', async () => {
    const { view } = selfless(undefined)

    expect(await isSelfPeer(view, 'me')).toBe(true)
    expect(await isSelfPeer(view, '@channel_news')).toBe(false)
  })
})

describe('collectibles', () => {
  const info = {
    _: 'fragment.collectibleInfo',
    purchase_date: 1_700,
    currency: 'USD',
    amount: 5_000n,
    crypto_currency: 'TON',
    crypto_amount: 12n,
    url: 'https://fragment.example/x',
  }

  it('asks by username, without the leading marker', async () => {
    const client = scripted({ 'fragment.getCollectibleInfo': info })

    const read = await getCollectibleInfo(client, 'username', '@durov')

    expect(sent(client, 'fragment.getCollectibleInfo')?.params).toEqual({
      collectible: { _: 'inputCollectibleUsername', username: 'durov' },
    })
    expect(read).toEqual({
      purchaseDate: 1_700,
      currency: 'USD',
      amount: 5_000n,
      cryptoCurrency: 'TON',
      cryptoAmount: 12n,
      url: 'https://fragment.example/x',
    })
  })

  it('asks by phone number, which keeps its own form', async () => {
    const client = scripted({ 'fragment.getCollectibleInfo': info })

    await getCollectibleInfo(client, 'phone', '+888000000')

    expect(sent(client, 'fragment.getCollectibleInfo')?.params).toEqual({
      collectible: { _: 'inputCollectiblePhone', phone: '+888000000' },
    })
  })
})
