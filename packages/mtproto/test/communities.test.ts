// SPDX-License-Identifier: MIT

/**
 * Communities, and the peer plumbing they depend on.
 *
 * A community is a `Chat` constructor addressed the way a channel is, which is
 * the whole of what the two have in common. What is checked here is that the
 * distinction survives: that a community read from an answer keeps the hash
 * that makes it addressable, that it is not mistaken for a supergroup, and that
 * each operation sends the flags Telegram reads — three of its methods serve
 * two intentions each, and the flag is the only thing telling them apart.
 */

import { PeerError, ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import type { MtprotoApi } from '../src/api.js'
import {
  banCommunityParticipant,
  type Communing,
  CommunityLinkRequestView,
  CommunityPeerView,
  createCommunity,
  getCommunityLinkRequests,
  getCommunityParticipantChats,
  getJoinedCommunities,
  hideAllCommunityLinkRequests,
  hideCommunityLinkRequest,
  linkCommunityPeer,
  toggleCommunityCollapsed,
  unbanCommunityParticipant,
  unlinkCommunityPeer,
} from '../src/communities/communities.js'
import { ChatView } from '../src/entities/peer.js'
import type { TypeChat, TypeInputPeer } from '../src/generated/api/types/index.js'
import { readPeers } from '../src/network/peers.js'
import type { PeerRef } from '../src/normalize/normalize.js'
import type { TlValue } from '../src/tl/index.js'

interface Call {
  readonly method: string
  readonly params: Record<string, unknown>
}

const COMMUNITY: TypeChat = {
  _: 'community',
  id: 500n,
  access_hash: 501n,
  title: 'Builders',
  photo: { _: 'chatPhotoEmpty' },
  date: 1_700,
}

/** A client recording calls and answering from a script. */
function scripted(script: Readonly<Record<string, unknown>> = {}) {
  const calls: Call[] = []
  const fed: TlValue[] = []

  const answer = (method: string, params: Record<string, unknown>) => {
    calls.push({ method, params })

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

  const client: Communing & { readonly calls: Call[]; readonly fed: TlValue[] } = {
    api: { communities: handler('communities') } as unknown as MtprotoApi,
    calls,
    fed,
    resolve(peer: string | PeerRef) {
      const name = typeof peer === 'string' ? peer.replace(/^@/, '') : `${peer.kind}${peer.id}`
      const resolved: TypeInputPeer = name.startsWith('group')
        ? { _: 'inputPeerChat', chat_id: 44n }
        : name.startsWith('user')
          ? { _: 'inputPeerUser', user_id: 9n, access_hash: 10n }
          : { _: 'inputPeerChannel', channel_id: 500n, access_hash: 501n }

      return Promise.resolve(resolved)
    },
    feed(value: TlValue) {
      fed.push(value)

      return Promise.resolve()
    },
  }

  return client
}

const sent = (client: { readonly calls: Call[] }, method: string) =>
  client.calls.find((call) => call.method === method)?.params

describe('a community as a peer', () => {
  it('keeps the hash that makes it addressable when it is read from an answer', () => {
    // Without this a community described in an answer teaches the account
    // nothing, and the next call naming it has no hash to address it with.
    const found = readPeers({ _: 'messages.chats', chats: [COMMUNITY], users: [] } as never)

    expect(found).toEqual([
      { kind: 'channel', id: 500n, accessHash: 501n, min: false, usernames: [] },
    ])
  })

  it('reads a forbidden community too, which carries a hash and a title', () => {
    const found = readPeers({
      _: 'messages.chats',
      chats: [{ _: 'communityForbidden', id: 7n, access_hash: 8n, title: 'Gone' }],
      users: [],
    } as never)

    expect(found[0]).toMatchObject({ kind: 'channel', id: 7n, accessHash: 8n })
  })

  it('is addressed as a channel without being one', () => {
    const view = new ChatView(COMMUNITY)

    expect(view.form).toBe('community')
    expect(view.isCommunity).toBe(true)
    expect(view.isAddressedAsChannel).toBe(true)
    // The distinction that stops a caller treating it as a conversation.
    expect(view.isChannel).toBe(false)
    expect(view.isBroadcast).toBe(false)
    expect(view.isSupergroup).toBe(false)
    expect(view.ref).toEqual({ kind: 'channel', id: 500n })
    expect(view.accessHash).toBe(501n)
  })

  it('reads the fields a community carries, and none it does not', () => {
    const view = new ChatView({ ...COMMUNITY, creator: true, collapsed_in_dialogs: true })

    expect(view.title).toBe('Builders')
    expect(view.date).toBe(1_700)
    expect(view.isCreator).toBe(true)
    expect(view.isCollapsedInDialogs).toBe(true)
    expect(view.photo).toEqual({ _: 'chatPhotoEmpty' })
    // A community has no handle and no participant count.
    expect(view.username).toBeUndefined()
  })

  it('says nothing about collapsing for anything that is not a community', () => {
    // Absent rather than false, so "not applicable" cannot read as "expanded".
    const channel = new ChatView({
      _: 'channel',
      id: 1n,
      title: 'News',
      photo: { _: 'chatPhotoEmpty' },
      date: 0,
      broadcast: true,
    })

    expect(channel.isCollapsedInDialogs).toBeUndefined()
    expect(channel.isCommunity).toBe(false)
    expect(channel.isChannel).toBe(true)
  })

  it('counts a forbidden community as forbidden', () => {
    const view = new ChatView({ _: 'communityForbidden', id: 7n, title: 'Gone' })

    expect(view.isForbidden).toBe(true)
    expect(view.isCommunity).toBe(true)
    expect(view.form).toBe('forbidden')
  })
})

describe('reading communities', () => {
  it('answers only the communities, and refuses a peer that cannot be one', async () => {
    const client = scripted({
      'communities.getJoinedCommunities': {
        _: 'messages.chats',
        chats: [COMMUNITY, { _: 'chat', id: 3n, title: 'A group' }],
      },
    })

    const joined = await getJoinedCommunities(client)

    expect(joined.map((one) => one.id)).toEqual([500n])
    await expect(linkCommunityPeer(scripted(), '@group_one', '@someone')).rejects.toThrow(PeerError)
  })

  it('pages the link requests by the offset Telegram hands back', async () => {
    const request = {
      _: 'communityPeerRequest',
      visible: true,
      peer: { _: 'peerChannel', channel_id: 9n },
      requested_by: 4n,
      date: 1_700,
    }
    const client = scripted({
      'communities.getPeerLinkRequests': {
        _: 'communities.peerLinkRequests',
        total_count: 12,
        requests: [request],
        next_offset: 'cursor-2',
        chats: [],
        users: [],
      },
    })

    const page = await getCommunityLinkRequests(client, '@builders', { from: 'cursor-1', limit: 5 })

    expect(sent(client, 'communities.getPeerLinkRequests')).toEqual({
      community: { _: 'inputChannel', channel_id: 500n, access_hash: 501n },
      offset: 'cursor-1',
      limit: 5,
    })
    expect(page).toMatchObject({ total: 12, next: 'cursor-2' })
    expect(page.requests[0]?.peer).toEqual({ kind: 'channel', id: 9n })
    expect(page.requests[0]?.requestedBy).toEqual({ kind: 'user', id: 4n })
    expect(page.requests[0]?.isVisible).toBe(true)
    expect(page.requests[0]?.date).toBe(1_700)
  })

  it('offers no continuation where Telegram named none, and refuses a page of none', async () => {
    const client = scripted({
      'communities.getPeerLinkRequests': {
        _: 'communities.peerLinkRequests',
        total_count: 1,
        requests: [],
        chats: [],
        users: [],
      },
    })

    expect(await getCommunityLinkRequests(client, '@builders')).not.toHaveProperty('next')
    expect(sent(client, 'communities.getPeerLinkRequests')).toMatchObject({
      offset: '',
      limit: 100,
    })
    await expect(getCommunityLinkRequests(scripted(), '@builders', { limit: 0 })).rejects.toThrow(
      ValidationError,
    )
  })

  it('puts a participant’s chats back together from the two lists and the descriptions', async () => {
    const chat = (id: bigint, title: string): TypeChat => ({ _: 'chat', id, title }) as TypeChat
    const client = scripted({
      'communities.getParticipantJoinedChats': {
        _: 'communities.participantJoinedChats',
        creator_chat_ids: [1n],
        joined_chat_ids: [2n, 99n],
        chats: [chat(1n, 'Theirs'), chat(2n, 'Joined')],
        users: [],
      },
    })

    const chats = await getCommunityParticipantChats(client, '@builders', { kind: 'user', id: 9n })

    expect(chats.created.map((one) => one.title)).toEqual(['Theirs'])
    // An identifier the answer did not describe is left out rather than
    // becoming a chat with no title.
    expect(chats.joined.map((one) => one.title)).toEqual(['Joined'])
    expect(sent(client, 'communities.getParticipantJoinedChats')).toMatchObject({
      participant: { _: 'inputPeerUser' },
    })
  })

  it('reads a linked peer, whose visibility may be unstated', () => {
    const linked = new CommunityPeerView({
      _: 'communityPeer',
      peer: { _: 'peerChannel', channel_id: 9n },
      can_view_history: true,
    })

    expect(linked.peer).toEqual({ kind: 'channel', id: 9n })
    expect(linked.canViewHistory).toBe(true)
    // Unstated is not the same as hidden.
    expect(linked.isVisible).toBeUndefined()

    const shown = new CommunityPeerView({
      _: 'communityPeer',
      peer: { _: 'peerChannel', channel_id: 9n },
      visible: false,
    })
    expect(shown.isVisible).toBe(false)
    expect(shown.canViewHistory).toBe(false)
  })

  it('reads a request that asked to stay hidden', () => {
    const request = new CommunityLinkRequestView({
      _: 'communityPeerRequest',
      peer: { _: 'peerChat', chat_id: 3n },
      requested_by: 4n,
      date: 5,
    })

    expect(request.isVisible).toBe(false)
    expect(request.peer).toEqual({ kind: 'chat', id: 3n })
  })
})

describe('making and arranging a community', () => {
  const made = {
    _: 'updates',
    updates: [],
    chats: [COMMUNITY],
    users: [],
    date: 0,
    seq: 0,
  }

  it('makes one around a chat and hands back what Telegram described', async () => {
    const client = scripted({ 'communities.create': made })

    const community = await createCommunity(client, {
      title: 'Builders',
      chat: '@group_one',
      about: 'We build',
      hidden: true,
    })

    expect(sent(client, 'communities.create')).toEqual({
      title: 'Builders',
      peer: { _: 'inputPeerChat', chat_id: 44n },
      about: 'We build',
      hidden: true,
    })
    expect(community.id).toBe(500n)
    // Fed to the account, so the community it just made is one it knows.
    expect(client.fed).toHaveLength(1)
  })

  it('refuses a community with no title, and says so when Telegram describes none', async () => {
    await expect(createCommunity(scripted(), { title: '  ', chat: '@group_one' })).rejects.toThrow(
      /needs a title/,
    )
    const silent = scripted({
      'communities.create': { _: 'updates', updates: [], chats: [], users: [] },
    })
    await expect(createCommunity(silent, { title: 'X', chat: '@group_one' })).rejects.toThrow(
      /did not describe/,
    )
  })

  it('collapses and expands, sending the flag only when collapsing', async () => {
    const client = scripted({ 'communities.toggleCommunityCollapsedInDialogs': made })

    await toggleCommunityCollapsed(client, '@builders', true)
    await toggleCommunityCollapsed(client, '@builders', false)

    const [collapse, expand] = client.calls.map((call) => call.params)
    expect(collapse).toEqual({
      community: { _: 'inputChannel', channel_id: 500n, access_hash: 501n },
      collapsed: true,
    })
    expect(expand).not.toHaveProperty('collapsed')
    expect(client.fed).toHaveLength(2)
  })
})

describe('the chats and people a community holds', () => {
  it('always states the visibility when linking, so the result does not depend on what was', async () => {
    const shown = scripted()
    await linkCommunityPeer(shown, '@builders', '@channel_news')
    expect(sent(shown, 'communities.togglePeerLink')).toEqual({
      community: { _: 'inputChannel', channel_id: 500n, access_hash: 501n },
      peer: { _: 'inputPeerChannel', channel_id: 500n, access_hash: 501n },
      visible: true,
    })

    const hidden = scripted()
    await linkCommunityPeer(hidden, '@builders', '@channel_news', { hidden: true })
    expect(sent(hidden, 'communities.togglePeerLink')).toMatchObject({ hidden: true })
    expect(sent(hidden, 'communities.togglePeerLink')).not.toHaveProperty('visible')
  })

  it('unlinks with the deletion flag rather than by hiding', async () => {
    const client = scripted()
    await unlinkCommunityPeer(client, '@builders', '@channel_news')

    const params = sent(client, 'communities.togglePeerLink')
    expect(params).toMatchObject({ deleted: true })
    expect(params).not.toHaveProperty('visible')
    expect(params).not.toHaveProperty('hidden')
  })

  it.each([
    ['approve', undefined],
    ['decline', true],
  ] as const)('answers one request by %s', async (action, reject) => {
    const client = scripted()
    await hideCommunityLinkRequest(client, '@builders', '@channel_news', action)

    const params = sent(client, 'communities.togglePeerLinkRequestApproval')
    expect(params?.['reject']).toBe(reject)
    expect(params).toMatchObject({ peer: { _: 'inputPeerChannel' } })
  })

  it('answers every pending request the same way, naming no peer', async () => {
    const client = scripted()
    await hideAllCommunityLinkRequests(client, '@builders', 'decline')

    expect(sent(client, 'communities.toggleAllPeerLinkRequestApproval')).toEqual({
      community: { _: 'inputChannel', channel_id: 500n, access_hash: 501n },
      reject: true,
    })
  })

  it('bans and unbans through one method, told apart by the flag', async () => {
    const client = scripted()

    await banCommunityParticipant(client, '@builders', { kind: 'user', id: 9n })
    await unbanCommunityParticipant(client, '@builders', { kind: 'user', id: 9n })

    const [banned, unbanned] = client.calls.map((call) => call.params)
    expect(banned).not.toHaveProperty('unban')
    expect(unbanned).toMatchObject({ unban: true })
    expect(banned).toMatchObject({ participant: { _: 'inputPeerUser', user_id: 9n } })
  })
})
