// SPDX-License-Identifier: MPL-2.0

/**
 * The conversation operations that had no case of their own.
 *
 * Each is judged the way the rest of the family is: what travelled, which call
 * was chosen, what came back, and what reached the account. Driven by a fake
 * client that records any call it is given and answers from a script per
 * method, so a case states only the answers it is about.
 */

import { PeerError, SessionError, ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import type { MtprotoApi } from '../src/api.js'
import type { Chatting } from '../src/chats/common.js'
import { createFolder, deleteFolder, setFolderOrder } from '../src/chats/folders.js'
import {
  exportInviteLink,
  joinChatlist,
  previewChatlist,
  readInviteLink,
} from '../src/chats/invites.js'
import { deleteChannel, deleteHistory, deleteMemberHistory } from '../src/chats/lifecycle.js'
import { fetchDialogs, messageAuthor, previewChat } from '../src/chats/lookup.js'
import {
  reorderChatUsernames,
  setChatColor,
  setChatDescription,
  setChatPhoto,
  setSlowMode,
  toggleChatUsername,
  toggleJoinRequests,
  toggleJoinToSend,
} from '../src/chats/manage.js'
import {
  creatorAfterLeave,
  joinChat,
  leaveChat,
  setMemberRank,
  transferOwnership,
} from '../src/chats/members.js'
import { deleteTopicHistory } from '../src/forums/topics.js'
import type { TypeInputPeer } from '../src/generated/api/types/index.js'
import { giftValue } from '../src/gifts/gifts.js'
import type { TlValue } from '../src/tl/index.js'
import { PasswordServer } from './server/password.js'
import { DH_PRIME } from './server/server.js'

const GROUP: TypeInputPeer = { _: 'inputPeerChat', chat_id: 3n }
const CHANNEL: TypeInputPeer = { _: 'inputPeerChannel', channel_id: 10n, access_hash: 99n }
const USER: TypeInputPeer = { _: 'inputPeerUser', user_id: 7n, access_hash: 77n }
const PEOPLE = new Set(['@ann', '@spammer', '@heir'])

const UPDATES: TlValue = { _: 'updates', updates: [], users: [], chats: [], date: 0, seq: 0 }

type Answer = unknown | ((params: Record<string, unknown>) => unknown)

/** A client answering any method from a script, in order per method. */
function fake(script: Record<string, Answer | Answer[]>, as: TypeInputPeer = CHANNEL) {
  const asked: { method: string; params: Record<string, unknown> }[] = []
  const fed: TlValue[] = []
  const queues = new Map(
    Object.entries(script).map(([method, answers]) => [
      method,
      Array.isArray(answers) ? [...answers] : [answers],
    ]),
  )

  const api = new Proxy(
    {},
    {
      get: (_, family: string) =>
        new Proxy(
          {},
          {
            get:
              (__, name: string) =>
              (params: Record<string, unknown> = {}) => {
                const method = `${family}.${name}`
                asked.push({ method, params })
                const queue = queues.get(method)
                if (queue === undefined || queue.length === 0) {
                  return Promise.reject(new Error(`no scripted answer for ${method}`))
                }
                const next = queue.length === 1 ? queue[0] : queue.shift()
                return Promise.resolve(typeof next === 'function' ? next(params) : next)
              },
          },
        ),
    },
  ) as unknown as MtprotoApi

  const client: Chatting & { readonly asked: typeof asked; readonly fed: TlValue[] } = {
    api,
    asked,
    fed,
    resolve: (peer) => Promise.resolve(typeof peer === 'string' && PEOPLE.has(peer) ? USER : as),
    feed: (value) => {
      fed.push(value)
      return Promise.resolve()
    },
  }
  return client
}

const methods = (client: ReturnType<typeof fake>) => client.asked.map((one) => one.method)
const sent = (client: ReturnType<typeof fake>, method: string) =>
  client.asked.find((one) => one.method === method)?.params

describe('removing history', () => {
  it('asks again while Telegram says more is left, applying each stage', async () => {
    const client = fake(
      {
        'messages.deleteHistory': [
          { _: 'messages.affectedHistory', pts: 11, pts_count: 100, offset: 2 },
          { _: 'messages.affectedHistory', pts: 12, pts_count: 100, offset: 1 },
          { _: 'messages.affectedHistory', pts: 13, pts_count: 30, offset: 0 },
        ],
      },
      USER,
    )

    await deleteHistory(client, '@ann', { forEveryone: true, upTo: 50 })

    expect(methods(client)).toEqual([
      'messages.deleteHistory',
      'messages.deleteHistory',
      'messages.deleteHistory',
    ])
    expect(sent(client, 'messages.deleteHistory')).toEqual({ peer: USER, max_id: 50, revoke: true })
    // Each stage is a position in the common sequence, fed as the update that
    // would have carried it.
    expect(client.fed.map((one) => (one['update'] as TlValue)['pts'])).toEqual([11, 12, 13])
    expect((client.fed[0]?.['update'] as TlValue | undefined)?._).toBe('updateDeleteMessages')
  })

  it('refuses a stage that does not progress, rather than asking forever', async () => {
    const client = fake(
      {
        'messages.deleteHistory': [
          { _: 'messages.affectedHistory', pts: 1, pts_count: 1, offset: 5 },
          { _: 'messages.affectedHistory', pts: 2, pts_count: 1, offset: 5 },
        ],
      },
      GROUP,
    )

    await expect(deleteHistory(client, 'group')).rejects.toBeInstanceOf(SessionError)
    expect(client.asked).toHaveLength(2)
  })

  it('removes a channel’s history through the channel call, for everyone when asked', async () => {
    const client = fake({ 'channels.deleteHistory': UPDATES })

    await deleteHistory(client, '@news', { forEveryone: true, keepChat: true })

    expect(methods(client)).toEqual(['channels.deleteHistory'])
    expect(sent(client, 'channels.deleteHistory')).toEqual({
      channel: { _: 'inputChannel', channel_id: 10n, access_hash: 99n },
      max_id: 0,
      for_everyone: true,
    })
    expect(client.fed).toEqual([UPDATES])
  })

  it('removes one member’s messages in stages, in the channel’s own sequence', async () => {
    const client = fake({
      'channels.deleteParticipantHistory': [
        { _: 'messages.affectedHistory', pts: 40, pts_count: 100, offset: 1 },
        { _: 'messages.affectedHistory', pts: 41, pts_count: 7, offset: 0 },
      ],
    })

    await deleteMemberHistory(client, '@group', '@spammer')

    expect(sent(client, 'channels.deleteParticipantHistory')).toEqual({
      channel: { _: 'inputChannel', channel_id: 10n, access_hash: 99n },
      participant: USER,
    })
    expect(client.asked).toHaveLength(2)
    expect(client.fed.map((one) => (one['update'] as TlValue)['_'])).toEqual([
      'updateDeleteChannelMessages',
      'updateDeleteChannelMessages',
    ])
    await expect(deleteMemberHistory(fake({}, GROUP), 'group', '@spammer')).rejects.toBeInstanceOf(
      PeerError,
    )
  })

  it('removes a topic’s history in stages and says how much went', async () => {
    const client = fake({
      'messages.deleteTopicHistory': [
        { _: 'messages.affectedHistory', pts: 5, pts_count: 100, offset: 3 },
        { _: 'messages.affectedHistory', pts: 6, pts_count: 20, offset: 0 },
      ],
    })

    expect(await deleteTopicHistory(client as never, '@forum', 42)).toBe(120)
    expect(sent(client, 'messages.deleteTopicHistory')).toEqual({ peer: CHANNEL, top_msg_id: 42 })
  })
})

describe('settings a conversation keeps', () => {
  it('sends each setting through the channel call, and gives the account what changed', async () => {
    const client = fake({
      'channels.updateColor': UPDATES,
      'channels.toggleSlowMode': UPDATES,
      'channels.toggleJoinRequest': UPDATES,
      'channels.toggleJoinToSend': UPDATES,
      'channels.toggleUsername': { _: 'boolTrue' },
      'channels.reorderUsernames': { _: 'boolTrue' },
    })
    const channel = { _: 'inputChannel', channel_id: 10n, access_hash: 99n }

    await setChatColor(
      client,
      '@news',
      { _: 'peerColor', color: 4, background_emoji_id: 9n },
      {
        forProfile: true,
      },
    )
    await setSlowMode(client, '@news', 30)
    await toggleJoinRequests(client, '@news', true)
    await toggleJoinToSend(client, '@news', false)
    await toggleChatUsername(client, '@news', 'old_name', false)
    await reorderChatUsernames(client, '@news', ['b', 'a'])

    expect(client.asked).toEqual([
      {
        method: 'channels.updateColor',
        params: { channel, color: 4, background_emoji_id: 9n, for_profile: true },
      },
      { method: 'channels.toggleSlowMode', params: { channel, seconds: 30 } },
      { method: 'channels.toggleJoinRequest', params: { channel, enabled: true } },
      { method: 'channels.toggleJoinToSend', params: { channel, enabled: false } },
      {
        method: 'channels.toggleUsername',
        params: { channel, username: 'old_name', active: false },
      },
      { method: 'channels.reorderUsernames', params: { channel, order: ['b', 'a'] } },
    ])
    // The four answered with updates reached the account; the two answered
    // with a bare yes carry nothing to give it.
    expect(client.fed).toHaveLength(4)
  })

  it('clears a colour by sending none of its fields', async () => {
    const client = fake({ 'channels.updateColor': UPDATES })
    await setChatColor(client, '@news', undefined)
    expect(sent(client, 'channels.updateColor')).toEqual({
      channel: { _: 'inputChannel', channel_id: 10n, access_hash: 99n },
    })
  })

  it('refuses the channel-only settings for a basic group, naming what it is', async () => {
    for (const operation of [
      (client: Chatting) => setSlowMode(client, 'g', 10),
      (client: Chatting) => toggleJoinRequests(client, 'g', true),
      (client: Chatting) => toggleJoinToSend(client, 'g', true),
      (client: Chatting) => reorderChatUsernames(client, 'g', []),
    ]) {
      const client = fake({}, GROUP)
      await expect(operation(client)).rejects.toThrow(/only possible in a channel or supergroup/)
      expect(client.asked).toEqual([])
    }
  })

  it('writes a description through the call both kinds share, and clears it with nothing', async () => {
    const client = fake({ 'messages.editChatAbout': { _: 'boolTrue' } }, GROUP)
    await setChatDescription(client, 'g', 'About us')
    await setChatDescription(client, 'g', undefined)
    expect(client.asked.map((one) => one.params)).toEqual([
      { peer: GROUP, about: 'About us' },
      { peer: GROUP, about: '' },
    ])
  })

  it('sets an uploaded photo or video through the call its kind takes', async () => {
    const photo = { file: { _: 'inputFile', id: 1n, parts: 1, name: 'a.jpg', md5_checksum: '' } }
    const video = { file: { _: 'inputFile', id: 2n, parts: 1, name: 'a.mp4', md5_checksum: '' } }

    const channel = fake({ 'channels.editPhoto': UPDATES })
    await setChatPhoto(channel, '@news', { photo } as never)
    expect(sent(channel, 'channels.editPhoto')).toMatchObject({
      photo: { _: 'inputChatUploadedPhoto', file: photo.file },
    })

    const group = fake({ 'messages.editChatPhoto': UPDATES }, GROUP)
    await setChatPhoto(group, 'g', { video, videoStart: 1.5 } as never)
    expect(sent(group, 'messages.editChatPhoto')).toEqual({
      chat_id: 3n,
      photo: { _: 'inputChatUploadedPhoto', video: video.file, video_start_ts: 1.5 },
    })

    await expect(setChatPhoto(fake({}), '@news', {})).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('members and ownership', () => {
  it('gives a member a rank, and clears it with the empty one', async () => {
    const client = fake({ 'messages.editChatParticipantRank': UPDATES })
    await setMemberRank(client, '@group', '@ann', 'Keeper')
    await setMemberRank(client, '@group', '@ann', undefined)
    expect(client.asked.map((one) => one.params)).toEqual([
      { peer: CHANNEL, participant: USER, rank: 'Keeper' },
      { peer: CHANNEL, participant: USER, rank: '' },
    ])
    expect(client.fed).toHaveLength(2)
  })

  it('names who would own a conversation after leaving, or nobody', async () => {
    const heir = fake({
      'messages.getFutureChatCreatorAfterLeave': { _: 'user', id: 55n, first_name: 'Heir' },
    })
    expect(await creatorAfterLeave(heir, '@group')).toBe(55n)
    expect(sent(heir, 'messages.getFutureChatCreatorAfterLeave')).toEqual({ peer: CHANNEL })

    const nobody = fake({ 'messages.getFutureChatCreatorAfterLeave': { _: 'userEmpty', id: 0n } })
    expect(await creatorAfterLeave(nobody, '@group')).toBeUndefined()
  })

  it('joins a public channel, and refuses a basic group it cannot join that way', async () => {
    const client = fake({ 'channels.joinChannel': UPDATES })
    await joinChat(client, '@news')
    expect(sent(client, 'channels.joinChannel')).toEqual({
      channel: { _: 'inputChannel', channel_id: 10n, access_hash: 99n },
    })
    expect(client.fed).toEqual([UPDATES])
    await expect(joinChat(fake({}, GROUP), 'g')).rejects.toBeInstanceOf(PeerError)
  })

  it('refuses a transfer from an account with no password, and proves the one it has', async () => {
    // Telegram requires a password for this, so an account without one is told
    // so before anything is asked to change the owner.
    const none = fake({
      'account.getPassword': {
        _: 'account.password',
        new_algo: {},
        new_secure_algo: {},
        secure_random: new Uint8Array(),
      },
    })
    await expect(transferOwnership(none, '@group', '@heir', 'x')).rejects.toThrow(
      /no password is set/,
    )
    expect(methods(none)).toEqual(['account.getPassword'])

    const peer = new PasswordServer({
      password: 'hunter2',
      p: DH_PRIME,
      g: 3n,
      salt1: Uint8Array.of(1, 2, 3, 4),
      salt2: Uint8Array.of(5, 6, 7, 8),
    })
    const client = fake({
      'account.getPassword': peer.describe(),
      'messages.editChatCreator': UPDATES,
    })

    await transferOwnership(client, '@group', '@heir', 'hunter2')

    const request = sent(client, 'messages.editChatCreator') as Record<string, unknown>
    expect(methods(client)).toEqual(['account.getPassword', 'messages.editChatCreator'])
    expect(request).toMatchObject({
      peer: CHANNEL,
      user_id: { _: 'inputUser', user_id: 7n, access_hash: 77n },
    })
    // The server's side of the exchange accepts the proof, and the password
    // itself never travelled.
    expect(peer.accepts(request['password'] as never)).toBe(true)
    expect(JSON.stringify(client.asked, (_k, v) => (typeof v === 'bigint' ? '' : v))).not.toContain(
      'hunter2',
    )
    expect(client.fed).toEqual([UPDATES])

    // The new owner is a person; a conversation is refused before the change is asked for.
    const refused = fake({
      'account.getPassword': peer.describe(),
      'messages.editChatCreator': UPDATES,
    })
    await expect(transferOwnership(refused, '@group', '@news', 'hunter2')).rejects.toBeInstanceOf(
      PeerError,
    )
    expect(methods(refused)).not.toContain('messages.editChatCreator')
  }, 60_000)
})

describe('folders, invites and lookups', () => {
  it('deletes a folder by sending its number with no contents, and reorders by numbers', async () => {
    const client = fake({
      'messages.updateDialogFilter': { _: 'boolTrue' },
      'messages.updateDialogFiltersOrder': { _: 'boolTrue' },
    })
    await deleteFolder(client, 4)
    await setFolderOrder(client, [4, 2, 3])
    expect(client.asked).toEqual([
      { method: 'messages.updateDialogFilter', params: { id: 4 } },
      { method: 'messages.updateDialogFiltersOrder', params: { order: [4, 2, 3] } },
    ])
  })

  it('replaces the permanent link, withdrawing the old one, and reads a link back', async () => {
    const invite = {
      _: 'chatInviteExported',
      link: 'https://t.me/+abc',
      admin_id: 1n,
      date: 5,
      permanent: true,
    }
    const client = fake({
      'messages.exportChatInvite': invite,
      'messages.getExportedChatInvite': { _: 'messages.exportedChatInvite', invite, users: [] },
    })

    const made = await exportInviteLink(client, '@group')
    const read = await readInviteLink(client, '@group', 'https://t.me/+abc')

    expect(sent(client, 'messages.exportChatInvite')).toEqual({
      peer: CHANNEL,
      legacy_revoke_permanent: true,
    })
    expect(sent(client, 'messages.getExportedChatInvite')).toEqual({
      peer: CHANNEL,
      link: 'https://t.me/+abc',
    })
    expect([made.link, read.link]).toEqual(['https://t.me/+abc', 'https://t.me/+abc'])
  })

  it('previews a folder link, naming what would be added, and joins it with the chosen chats', async () => {
    const news = { _: 'channel', id: 10n, title: 'News', photo: { _: 'chatPhotoEmpty' }, date: 0 }
    const other = { _: 'channel', id: 11n, title: 'Other', photo: { _: 'chatPhotoEmpty' }, date: 0 }
    const client = fake({
      'chatlists.checkChatlistInvite': [
        {
          _: 'chatlists.chatlistInvite',
          title: { _: 'textWithEntities', text: 'Reading', entities: [] },
          peers: [{ _: 'peerChannel', channel_id: 11n }],
          chats: [news, other],
          users: [],
        },
        {
          _: 'chatlists.chatlistInviteAlready',
          filter_id: 2,
          missing_peers: [{ _: 'peerChannel', channel_id: 10n }],
          already_peers: [],
          chats: [news, other],
          users: [],
        },
      ],
      'chatlists.joinChatlistInvite': UPDATES,
    })

    const fresh = await previewChatlist(client, 'slug')
    const already = await previewChatlist(client, 'slug')
    await joinChatlist(client, 'slug', ['@news'])

    expect(fresh).toMatchObject({ title: 'Reading', alreadyHave: false })
    expect(fresh.missing.map((chat) => chat.title)).toEqual(['Other'])
    expect(already.alreadyHave).toBe(true)
    expect(already.missing.map((chat) => chat.title)).toEqual(['News'])
    expect(sent(client, 'chatlists.joinChatlistInvite')).toEqual({ slug: 'slug', peers: [CHANNEL] })
    expect(client.fed).toEqual([UPDATES])
  })

  it('previews the conversation a name belongs to, not whatever came first, and not a person', async () => {
    const linked = {
      _: 'channel',
      id: 20n,
      title: 'Discussion',
      photo: { _: 'chatPhotoEmpty' },
      date: 0,
    }
    const news = { _: 'channel', id: 10n, title: 'News', photo: { _: 'chatPhotoEmpty' }, date: 0 }
    const client = fake({
      'contacts.resolveUsername': [
        {
          _: 'contacts.resolvedPeer',
          peer: { _: 'peerChannel', channel_id: 10n },
          chats: [linked, news],
          users: [],
        },
        {
          _: 'contacts.resolvedPeer',
          peer: { _: 'peerUser', user_id: 7n },
          chats: [linked],
          users: [],
        },
      ],
    })

    expect((await previewChat(client, '@news'))?.title).toBe('News')
    expect(sent(client, 'contacts.resolveUsername')).toEqual({ username: 'news' })
    expect(await previewChat(client, 'ann')).toBeUndefined()
  })

  it('asks what a unique gift is worth by its name', async () => {
    const worth = { _: 'payments.uniqueStarGiftValueInfo', currency: 'USD', value: 100n }
    const client = fake({ 'payments.getUniqueStarGiftValueInfo': worth })
    expect(await giftValue(client as never, 'Gift-1')).toBe(worth)
    expect(sent(client, 'payments.getUniqueStarGiftValueInfo')).toEqual({ slug: 'Gift-1' })
  })
})

describe('leaving, deleting and reading the list', () => {
  it('leaves a basic group by removing itself, and a channel through the channel call', async () => {
    const group = fake({ 'messages.deleteChatUser': UPDATES }, GROUP)
    await leaveChat(group, 'g', { deleteHistory: true })
    expect(group.asked).toEqual([
      {
        method: 'messages.deleteChatUser',
        params: { chat_id: 3n, user_id: { _: 'inputUserSelf' }, revoke_history: true },
      },
    ])
    expect(group.fed).toEqual([UPDATES])

    const channel = fake({ 'channels.leaveChannel': UPDATES })
    await leaveChat(channel, '@news')
    expect(channel.asked).toEqual([
      {
        method: 'channels.leaveChannel',
        params: { channel: { _: 'inputChannel', channel_id: 10n, access_hash: 99n } },
      },
    ])
  })

  it('deletes a channel through the channel call, and refuses a basic group', async () => {
    const client = fake({ 'channels.deleteChannel': UPDATES })
    await deleteChannel(client, '@news')
    expect(sent(client, 'channels.deleteChannel')).toEqual({
      channel: { _: 'inputChannel', channel_id: 10n, access_hash: 99n },
    })
    expect(client.fed).toEqual([UPDATES])
    await expect(deleteChannel(fake({}, GROUP), 'g')).rejects.toBeInstanceOf(PeerError)
  })

  it('reads the dialogs of named conversations in one request, and asks nothing for none', async () => {
    const dialog = {
      _: 'dialog',
      peer: { _: 'peerChannel', channel_id: 10n },
      top_message: 5,
      read_inbox_max_id: 4,
      read_outbox_max_id: 4,
      unread_count: 1,
      unread_mentions_count: 0,
      unread_reactions_count: 0,
      notify_settings: { _: 'peerNotifySettings' },
    }
    const client = fake({
      'messages.getPeerDialogs': {
        _: 'messages.peerDialogs',
        dialogs: [dialog],
        messages: [],
        chats: [],
        users: [],
        state: { _: 'updates.state', pts: 1, qts: 0, date: 0, seq: 0, unread_count: 0 },
      },
    })

    const dialogs = await fetchDialogs(client, ['@news'])

    expect(sent(client, 'messages.getPeerDialogs')).toEqual({
      peers: [{ _: 'inputDialogPeer', peer: CHANNEL }],
    })
    expect(dialogs).toHaveLength(1)
    expect(dialogs[0]?.raw).toBe(dialog)
    const none = fake({})
    expect(await fetchDialogs(none, [])).toEqual([])
    expect(none.asked).toEqual([])
  })

  it('makes a folder from the conversations it names, with its title as text', async () => {
    const client = fake({ 'messages.updateDialogFilter': { _: 'boolTrue' } })
    await createFolder(client, { id: 5, title: 'Work', included: ['@news'], excluded: ['@ann'] })
    expect(sent(client, 'messages.updateDialogFilter')).toEqual({
      id: 5,
      filter: {
        _: 'dialogFilter',
        id: 5,
        title: { _: 'textWithEntities', text: 'Work', entities: [] },
        pinned_peers: [],
        include_peers: [CHANNEL],
        exclude_peers: [USER],
      },
    })
  })

  it('names who wrote a signed post', async () => {
    const client = fake({
      'channels.getMessageAuthor': { _: 'user', id: 55n, first_name: 'Writer' },
    })
    expect((await messageAuthor(client, '@news', 9))?.id).toBe(55n)
    expect(sent(client, 'channels.getMessageAuthor')).toEqual({
      channel: { _: 'inputChannel', channel_id: 10n, access_hash: 99n },
      id: 9,
    })
  })
})
