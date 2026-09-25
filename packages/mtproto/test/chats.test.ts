/**
 * Operating on a conversation.
 *
 * Driven by a fake client rather than a connection, which is what the
 * structural `Chatting` interface is for. Three things are judged in every
 * case and none of them is only the return value:
 *
 * - **what travelled**, because most of these are one request whose fields a
 *   caller never sees, and the difference between a mute and a ban is which
 *   flags were in it;
 * - **which call was chosen**, because a basic group and a channel take
 *   different requests for the same operation and picking the wrong one is the
 *   easiest mistake in the family;
 * - **what reached the account**, because an answer carrying updates is how
 *   this account learns about a change it made itself.
 */

import { PeerError, ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import type { MtprotoApi } from '../src/api.js'
import type { Chatting } from '../src/chats/common.js'
import {
  archiveChats,
  createFolder,
  editFolder,
  markChatUnread,
  readFolders,
  saveDraft,
} from '../src/chats/folders.js'
import {
  createInviteLink,
  decideAllJoinRequests,
  decideJoinRequest,
  editInviteLink,
  joinByLink,
  previewInvite,
  primaryInviteLink,
  revokeInviteLink,
} from '../src/chats/invites.js'
import {
  createChannel,
  createGroup,
  createSupergroup,
  deleteGroup,
  deleteHistory,
} from '../src/chats/lifecycle.js'
import { fetchFullChat, messageAuthor } from '../src/chats/lookup.js'
import {
  deleteChatPhoto,
  setChatDefaultPermissions,
  setChatTitle,
  setChatTtl,
  setChatUsername,
  toggleContentProtection,
} from '../src/chats/manage.js'
import {
  addMembers,
  banMember,
  kickMember,
  readChatMember,
  restrictMember,
  setAdminRights,
  unbanMember,
} from '../src/chats/members.js'
import type { TypeInputPeer } from '../src/generated/api/types/index.js'
import type { TlValue } from '../src/tl/index.js'

const GROUP: TypeInputPeer = { _: 'inputPeerChat', chat_id: 3n }
const CHANNEL: TypeInputPeer = { _: 'inputPeerChannel', channel_id: 10n, access_hash: 99n }
const USER: TypeInputPeer = { _: 'inputPeerUser', user_id: 7n, access_hash: 77n }

/** The empty answer that stands in for "the change happened". */
const NOTHING_HAPPENED: TlValue = {
  _: 'updates',
  updates: [],
  users: [],
  chats: [],
  date: 0,
  seq: 0,
}

/**
 * A client answering from a script.
 *
 * Records every request with the name of the method it went to, because which
 * of two calls was chosen is half of what these cases are about.
 */
/**
 * The names a case means as people rather than as conversations.
 *
 * Several of these operations take a conversation and a person, and both are
 * resolved through the same door — so a fake that answered one peer for
 * everything would hand a channel to something that asked for a person.
 */
const PEOPLE = new Set(['@a', '@b', '@c', '@ann', '@somebody', '@spammer', '@noisy'])

function fake(answers: readonly unknown[], as: TypeInputPeer = CHANNEL) {
  const asked: { method: string; params: unknown }[] = []
  const fed: TlValue[] = []
  let at = 0

  const named =
    (method: string) =>
    (params: unknown = {}) => {
      asked.push({ method, params })

      const answer = answers[at]
      at += 1

      if (answer === undefined) throw new Error(`no scripted answer for ${method}`)

      return Promise.resolve(answer)
    }

  const api = {
    channels: {
      createChannel: named('channels.createChannel'),
      deleteChannel: named('channels.deleteChannel'),
      editAdmin: named('channels.editAdmin'),
      editBanned: named('channels.editBanned'),
      editPhoto: named('channels.editPhoto'),
      editTitle: named('channels.editTitle'),
      getFullChannel: named('channels.getFullChannel'),
      getMessageAuthor: named('channels.getMessageAuthor'),
      getParticipant: named('channels.getParticipant'),
      inviteToChannel: named('channels.inviteToChannel'),
      updateUsername: named('channels.updateUsername'),
    },
    folders: { editPeerFolders: named('folders.editPeerFolders') },
    messages: {
      addChatUser: named('messages.addChatUser'),
      createChat: named('messages.createChat'),
      deleteChat: named('messages.deleteChat'),
      deleteChatUser: named('messages.deleteChatUser'),
      deleteHistory: named('messages.deleteHistory'),
      editChatDefaultBannedRights: named('messages.editChatDefaultBannedRights'),
      editChatPhoto: named('messages.editChatPhoto'),
      editChatTitle: named('messages.editChatTitle'),
      editExportedChatInvite: named('messages.editExportedChatInvite'),
      exportChatInvite: named('messages.exportChatInvite'),
      getDialogFilters: named('messages.getDialogFilters'),
      getExportedChatInvites: named('messages.getExportedChatInvites'),
      getFullChat: named('messages.getFullChat'),
      checkChatInvite: named('messages.checkChatInvite'),
      hideAllChatJoinRequests: named('messages.hideAllChatJoinRequests'),
      hideChatJoinRequest: named('messages.hideChatJoinRequest'),
      importChatInvite: named('messages.importChatInvite'),
      markDialogUnread: named('messages.markDialogUnread'),
      saveDraft: named('messages.saveDraft'),
      setHistoryTTL: named('messages.setHistoryTTL'),
      toggleNoForwards: named('messages.toggleNoForwards'),
      updateDialogFilter: named('messages.updateDialogFilter'),
    },
  } as unknown as MtprotoApi

  const client: Chatting & {
    readonly asked: { method: string; params: unknown }[]
    readonly fed: TlValue[]
  } = {
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

/** The request one method received. */
const sent = (client: ReturnType<typeof fake>, method: string) =>
  client.asked.find((one) => one.method === method)?.params as Record<string, unknown> | undefined

describe('choosing between a basic group and a channel', () => {
  it('renames a channel through the channel call', async () => {
    const client = fake([NOTHING_HAPPENED], CHANNEL)

    await setChatTitle(client, '@channel', 'Renamed')

    expect(client.asked.map((one) => one.method)).toEqual(['channels.editTitle'])
    expect(sent(client, 'channels.editTitle')).toMatchObject({ title: 'Renamed' })
  })

  it('renames a basic group through the group call, by its bare number', async () => {
    // The two families take different requests for one operation, and a basic
    // group is addressed by a number rather than by an identifier and a hash.
    const client = fake([NOTHING_HAPPENED], GROUP)

    await setChatTitle(client, 'group', 'Renamed')

    expect(client.asked.map((one) => one.method)).toEqual(['messages.editChatTitle'])
    expect(sent(client, 'messages.editChatTitle')).toEqual({ chat_id: 3n, title: 'Renamed' })
  })

  it('clears a photo through whichever family the conversation is', async () => {
    const channel = fake([NOTHING_HAPPENED], CHANNEL)
    await deleteChatPhoto(channel, '@channel')

    const group = fake([NOTHING_HAPPENED], GROUP)
    await deleteChatPhoto(group, 'group')

    // Removing is spelled as setting the empty photo, in both.
    expect(sent(channel, 'channels.editPhoto')).toMatchObject({
      photo: { _: 'inputChatPhotoEmpty' },
    })
    expect(sent(group, 'messages.editChatPhoto')).toMatchObject({
      photo: { _: 'inputChatPhotoEmpty' },
    })
  })

  it('says which kind it needed when an operation exists for only one', async () => {
    // A basic group has no public name. Saying so by name is better than the
    // server answering with something about the request.
    const client = fake([], GROUP)

    await expect(setChatUsername(client, 'group', 'name')).rejects.toThrow(PeerError)
    await expect(setChatUsername(client, 'group', 'name')).rejects.toThrow(
      /only possible in a channel or supergroup/,
    )
    expect(client.asked).toEqual([])
  })
})

describe('membership', () => {
  it('reports who the server would not add, rather than who it did', async () => {
    // The useful half: a caller falling back to an invite link needs the names
    // that did not go in.
    const client = fake([
      {
        _: 'messages.invitedUsers',
        updates: NOTHING_HAPPENED,
        missing_invitees: [
          { _: 'missingInvitee', user_id: 8n },
          { _: 'missingInvitee', user_id: 9n, premium_would_allow: true },
        ],
      },
    ])

    const missed = await addMembers(client, '@channel', ['@a', '@b', '@c'])

    expect(missed).toEqual([
      { userId: 8n, privacy: true, needsPremium: false },
      { userId: 9n, privacy: false, needsPremium: true },
    ])
    // The updates the answer carried reached the account.
    expect(client.fed).toHaveLength(1)
  })

  it('adds to a basic group one at a time', async () => {
    // The call takes a single user, so a list is several requests — and the
    // refusals from each are collected rather than the first one winning.
    const client = fake(
      [
        { _: 'messages.invitedUsers', updates: NOTHING_HAPPENED, missing_invitees: [] },
        {
          _: 'messages.invitedUsers',
          updates: NOTHING_HAPPENED,
          missing_invitees: [{ _: 'missingInvitee', user_id: 8n }],
        },
      ],
      GROUP,
    )

    const missed = await addMembers(client, 'group', ['@a', '@b'], { history: 100 })

    expect(client.asked.map((one) => one.method)).toEqual([
      'messages.addChatUser',
      'messages.addChatUser',
    ])
    expect(sent(client, 'messages.addChatUser')).toMatchObject({ fwd_limit: 100 })
    expect(missed).toHaveLength(1)
  })

  it('asks nothing to add nobody', async () => {
    const client = fake([])

    expect(await addMembers(client, '@channel', [])).toEqual([])
    expect(client.asked).toEqual([])
  })

  it('bans by forbidding everything, including reading', async () => {
    // What separates a ban from a mute: `view_messages`. A record without it
    // would leave the person able to read and look like a ban at the call site.
    const client = fake([NOTHING_HAPPENED])

    await banMember(client, '@channel', '@spammer')

    const rights = (
      sent(client, 'channels.editBanned') as { banned_rights: Record<string, unknown> }
    ).banned_rights
    expect(rights['view_messages']).toBe(true)
    expect(rights['send_messages']).toBe(true)
    expect(rights['until_date']).toBe(0)
  })

  it('makes a ban temporary when given a deadline', async () => {
    const client = fake([NOTHING_HAPPENED])

    await banMember(client, '@channel', '@spammer', { until: 1_700_000_000 })

    expect(
      (sent(client, 'channels.editBanned') as { banned_rights: { until_date: number } })
        .banned_rights['until_date'],
    ).toBe(1_700_000_000)
  })

  it('unbans by forbidding nothing', async () => {
    const client = fake([NOTHING_HAPPENED])

    await unbanMember(client, '@channel', '@somebody')

    expect(
      (sent(client, 'channels.editBanned') as { banned_rights: Record<string, unknown> })
        .banned_rights,
    ).toEqual({ _: 'chatBannedRights', until_date: 0 })
  })

  it('restricts without forbidding reading', async () => {
    // The distinction that matters: a mute leaves them able to see the
    // conversation, so `view_messages` must not appear.
    const client = fake([NOTHING_HAPPENED])

    await restrictMember(client, '@channel', '@noisy', { sendMedia: true, until: 5 })

    const rights = (
      sent(client, 'channels.editBanned') as { banned_rights: Record<string, unknown> }
    ).banned_rights
    expect(rights['send_media']).toBe(true)
    expect(rights['until_date']).toBe(5)
    expect(rights).not.toHaveProperty('view_messages')
    // A right the caller said nothing about is absent rather than false: these
    // fields are true-or-missing in the protocol.
    expect(rights).not.toHaveProperty('send_messages')
  })

  it('writes a right the caller passed as false as an absent field', async () => {
    const client = fake([NOTHING_HAPPENED])

    await restrictMember(client, '@channel', '@somebody', { sendMedia: false })

    expect(
      (sent(client, 'channels.editBanned') as { banned_rights: Record<string, unknown> })
        .banned_rights,
    ).toEqual({ _: 'chatBannedRights', until_date: 0 })
  })

  it('kicks a channel member by restricting and immediately lifting it', async () => {
    // There is no single call. Out but not barred is two.
    const client = fake([NOTHING_HAPPENED, NOTHING_HAPPENED])

    await kickMember(client, '@channel', '@somebody')

    expect(client.asked.map((one) => one.method)).toEqual([
      'channels.editBanned',
      'channels.editBanned',
    ])
    const rightsAt = (index: number) =>
      (client.asked[index]?.params as { banned_rights: Record<string, unknown> } | undefined)
        ?.banned_rights

    // The first forbids everything; the second forbids nothing, which is what
    // leaves them outside and free to come back.
    expect(rightsAt(0)?.['view_messages']).toBe(true)
    expect(rightsAt(1)).toEqual({ _: 'chatBannedRights', until_date: 0 })
  })

  it('kicks a basic group member with the one call that does it', async () => {
    const client = fake([NOTHING_HAPPENED], GROUP)

    await kickMember(client, 'group', '@somebody', { deleteHistory: true })

    expect(client.asked.map((one) => one.method)).toEqual(['messages.deleteChatUser'])
    expect(sent(client, 'messages.deleteChatUser')).toMatchObject({ revoke_history: true })
  })

  it('demotes by granting no rights at all', async () => {
    // The rights are the whole statement, so somebody with none is not an
    // administrator — which is why there is no separate demotion call.
    const client = fake([NOTHING_HAPPENED])

    await setAdminRights(client, '@channel', '@ann', {})

    expect(sent(client, 'channels.editAdmin')).toMatchObject({
      admin_rights: { _: 'chatAdminRights' },
    })
  })

  it('carries a rank alongside the rights when one was given', async () => {
    const client = fake([NOTHING_HAPPENED])

    await setAdminRights(client, '@channel', '@ann', { banUsers: true }, { rank: 'moderator' })

    expect(sent(client, 'channels.editAdmin')).toMatchObject({
      rank: 'moderator',
      admin_rights: { _: 'chatAdminRights', ban_users: true },
    })
  })

  it('reads one member’s standing', async () => {
    const client = fake([
      {
        _: 'channels.channelParticipant',
        participant: { _: 'channelParticipantAdmin', user_id: 7n, date: 1, admin_rights: {} },
        chats: [],
        users: [],
      },
    ])

    const member = await readChatMember(client, '@channel', '@ann')

    expect(member?.standing).toBe('administrator')
  })

  it('says a basic group keeps its members elsewhere', async () => {
    const client = fake([], GROUP)

    await expect(readChatMember(client, 'group', '@ann')).rejects.toThrow(ValidationError)
    expect(client.asked).toEqual([])
  })
})

describe('invite links', () => {
  const link = {
    _: 'chatInviteExported' as const,
    link: 'https://t.me/+abc',
    admin_id: 1n,
    date: 1,
  }

  it('refuses a link that both counts people and queues them', async () => {
    // Telegram refuses this combination; saying so here names the mistake.
    const client = fake([])

    await expect(
      createInviteLink(client, '@channel', { usageLimit: 10, needsApproval: true }),
    ).rejects.toThrow(/cannot both/)
    expect(client.asked).toEqual([])
  })

  it('sends only the limits it was given', async () => {
    const client = fake([link])

    await createInviteLink(client, '@channel', { usageLimit: 5, title: 'for the team' })

    expect(sent(client, 'messages.exportChatInvite')).toMatchObject({
      usage_limit: 5,
      title: 'for the team',
    })
    expect(sent(client, 'messages.exportChatInvite')).not.toHaveProperty('expire_date')
    // Not a replacement of the permanent link, which is a different flag.
    expect(sent(client, 'messages.exportChatInvite')).not.toHaveProperty('legacy_revoke_permanent')
  })

  it('clears a limit with zero rather than by omission', async () => {
    // Omitting means "leave it"; zero means "remove it". A caller cannot say
    // the second any other way.
    const client = fake([{ _: 'messages.exportedChatInvite', invite: link, users: [] }])

    await editInviteLink(client, '@channel', 'https://t.me/+abc', { usageLimit: 0 })

    expect(sent(client, 'messages.editExportedChatInvite')).toMatchObject({ usage_limit: 0 })
    expect(sent(client, 'messages.editExportedChatInvite')).not.toHaveProperty('expire_date')
  })

  it('hands back the replacement when the permanent link was revoked', async () => {
    const client = fake([
      {
        _: 'messages.exportedChatInviteReplaced',
        invite: link,
        new_invite: { ...link, link: 'https://t.me/+xyz' },
        users: [],
      },
    ])

    const { revoked, replacement } = await revokeInviteLink(client, '@channel', link.link)

    expect(revoked.link).toBe('https://t.me/+abc')
    expect(replacement?.link).toBe('https://t.me/+xyz')
    expect(sent(client, 'messages.editExportedChatInvite')).toMatchObject({ revoked: true })
  })

  it('reports no replacement when an ordinary link was revoked', async () => {
    const client = fake([{ _: 'messages.exportedChatInvite', invite: link, users: [] }])

    const { replacement } = await revokeInviteLink(client, '@channel', link.link)

    expect(replacement).toBeUndefined()
  })

  it('reads the permanent link without replacing it', async () => {
    // Exporting one *replaces* it, so reading has to be a different request.
    const client = fake([
      { _: 'messages.exportedChatInvites', count: 1, invites: [link], users: [] },
    ])

    const primary = await primaryInviteLink(client, '@channel')

    expect(primary?.link).toBe('https://t.me/+abc')
    expect(client.asked.map((one) => one.method)).toEqual(['messages.getExportedChatInvites'])
  })

  it('approves and refuses through the same call, distinguished by a flag', async () => {
    const client = fake([NOTHING_HAPPENED, NOTHING_HAPPENED])

    await decideJoinRequest(client, '@channel', '@somebody', true)
    await decideJoinRequest(client, '@channel', '@somebody', false)

    expect(client.asked[0]?.params).toMatchObject({ approved: true })
    expect(client.asked[1]?.params).not.toHaveProperty('approved')
  })

  it('limits a bulk decision to one link when told to', async () => {
    const client = fake([NOTHING_HAPPENED])

    await decideAllJoinRequests(client, '@channel', true, { link: link.link })

    expect(sent(client, 'messages.hideAllChatJoinRequests')).toMatchObject({
      approved: true,
      link: link.link,
    })
  })

  it('previews a link without joining it', async () => {
    const client = fake([
      {
        _: 'chatInvite',
        title: 'A channel',
        photo: { _: 'photoEmpty', id: 0n },
        participants_count: 42,
        request_needed: true,
        color: 0,
      },
    ])

    const preview = await previewInvite(client, 'abc')

    expect(preview).toMatchObject({ title: 'A channel', members: 42, needsApproval: true })
    expect(preview.alreadyIn).toBe(false)
  })

  it('says so when the link opens something this account is already in', async () => {
    const client = fake([
      {
        _: 'chatInviteAlready',
        chat: { _: 'channel', id: 10n, access_hash: 1n, title: 'Already here' },
      },
    ])

    const preview = await previewInvite(client, 'abc')

    expect(preview.alreadyIn).toBe(true)
    expect(preview.chat?.title).toBe('Already here')
  })

  it('joins by hash and gives the updates to the account', async () => {
    const client = fake([NOTHING_HAPPENED])

    await joinByLink(client, 'abc')

    expect(sent(client, 'messages.importChatInvite')).toEqual({ hash: 'abc' })
    expect(client.fed).toHaveLength(1)
  })
})

describe('making and unmaking conversations', () => {
  const madeChat = {
    ...NOTHING_HAPPENED,
    chats: [{ _: 'chat', id: 3n, title: 'Weekend', participants_count: 2 }],
  }

  it('reads the new conversation out of the updates it was answered with', async () => {
    // There is no separate result. A caller with nothing to address cannot do
    // the next thing, so the conversation is dug out of the answer.
    const client = fake([{ _: 'messages.invitedUsers', updates: madeChat, missing_invitees: [] }])

    const group = await createGroup(client, { title: 'Weekend' }, ['@ann'])

    expect(group.title).toBe('Weekend')
    expect(client.fed).toHaveLength(1)
  })

  it('refuses to make a basic group with nobody in it', async () => {
    const client = fake([])

    await expect(createGroup(client, { title: 'Empty' }, [])).rejects.toThrow(ValidationError)
    expect(client.asked).toEqual([])
  })

  it('separates a supergroup from a channel by one flag on one call', async () => {
    const supergroup = fake([
      { ...NOTHING_HAPPENED, chats: [{ _: 'channel', id: 10n, access_hash: 1n, title: 'S' }] },
    ])
    await createSupergroup(supergroup, { title: 'S', forum: true })

    const channel = fake([
      { ...NOTHING_HAPPENED, chats: [{ _: 'channel', id: 11n, access_hash: 1n, title: 'C' }] },
    ])
    await createChannel(channel, { title: 'C', description: 'about' })

    expect(sent(supergroup, 'channels.createChannel')).toMatchObject({
      megagroup: true,
      forum: true,
    })
    expect(sent(supergroup, 'channels.createChannel')).not.toHaveProperty('broadcast')
    expect(sent(channel, 'channels.createChannel')).toMatchObject({
      broadcast: true,
      about: 'about',
    })
  })

  it('says so when a creation answer described no conversation', async () => {
    const client = fake([
      { _: 'messages.invitedUsers', updates: NOTHING_HAPPENED, missing_invitees: [] },
    ])

    await expect(createGroup(client, { title: 'X' }, ['@ann'])).rejects.toThrow(
      /did not describe the conversation/,
    )
  })

  it('refuses to delete a channel as though it were a basic group', async () => {
    const client = fake([], CHANNEL)

    await expect(deleteGroup(client, '@channel')).rejects.toThrow(/not a basic group/)
  })

  it('keeps the conversation when only its history was asked to go', async () => {
    const client = fake([{ _: 'messages.affectedHistory', pts: 1, pts_count: 0, offset: 0 }])

    await deleteHistory(client, '@somebody', { keepChat: true, forEveryone: true })

    expect(sent(client, 'messages.deleteHistory')).toMatchObject({
      just_clear: true,
      revoke: true,
      max_id: 0,
    })
  })
})

describe('reading a conversation', () => {
  it('reads a channel through the channel call and names what it found', async () => {
    const client = fake([
      {
        _: 'messages.chatFull',
        full_chat: {
          _: 'channelFull',
          id: 10n,
          about: 'what this is for',
          participants_count: 500,
          online_count: 12,
          slowmode_seconds: 30,
          linked_chat_id: 11n,
          pinned_msg_id: 7,
        },
        chats: [{ _: 'channel', id: 10n, access_hash: 1n, title: 'A channel' }],
        users: [{ _: 'user', id: 7n, access_hash: 1n }],
      },
    ])

    const full = await fetchFullChat(client, '@channel')

    expect(full.chat.title).toBe('A channel')
    expect(full).toMatchObject({
      description: 'what this is for',
      members: 500,
      online: 12,
      slowMode: 30,
      pinnedMessageId: 7,
    })
    expect(full.linkedChat).toEqual({ kind: 'channel', id: 11n })
    // The people the answer described come back, so a caller need not resolve
    // them a second time.
    expect(full.users).toHaveLength(1)
  })

  it('counts a basic group’s members from the list it keeps instead', async () => {
    // A basic group states members as a list rather than a count.
    const client = fake(
      [
        {
          _: 'messages.chatFull',
          full_chat: {
            _: 'chatFull',
            id: 3n,
            participants: {
              _: 'chatParticipants',
              chat_id: 3n,
              participants: [
                { _: 'chatParticipant', user_id: 7n, inviter_id: 1n, date: 1 },
                { _: 'chatParticipant', user_id: 8n, inviter_id: 1n, date: 1 },
              ],
              version: 1,
            },
            notify_settings: { _: 'peerNotifySettings' },
          },
          chats: [{ _: 'chat', id: 3n, title: 'A group', participants_count: 2 }],
          users: [],
        },
      ],
      GROUP,
    )

    const full = await fetchFullChat(client, 'group')

    expect(client.asked.map((one) => one.method)).toEqual(['messages.getFullChat'])
    expect(full.members).toBe(2)
    expect(full.slowMode).toBeUndefined()
  })

  it('refuses to read a person as a conversation', async () => {
    const client = fake([], USER)

    await expect(fetchFullChat(client, '@someone')).rejects.toThrow(/names a person/)
    expect(client.asked).toEqual([])
  })

  it('answers nothing when a post has no separate author to name', async () => {
    const client = fake([{ _: 'userEmpty', id: 0n }])

    expect(await messageAuthor(client, '@channel', 42)).toBeUndefined()
  })
})

describe('settings that change what others may do', () => {
  it('sets a message lifetime and refuses one that is not whole seconds', async () => {
    const client = fake([NOTHING_HAPPENED])

    await setChatTtl(client, '@channel', 86_400)
    expect(sent(client, 'messages.setHistoryTTL')).toEqual({ peer: CHANNEL, period: 86_400 })

    await expect(setChatTtl(client, '@channel', -1)).rejects.toThrow(ValidationError)
    await expect(setChatTtl(client, '@channel', 1.5)).rejects.toThrow(ValidationError)
  })

  it('applies default permissions in the same shape one member’s take', async () => {
    const client = fake([NOTHING_HAPPENED])

    await setChatDefaultPermissions(client, '@group', { sendPolls: true })

    expect(sent(client, 'messages.editChatDefaultBannedRights')).toMatchObject({
      banned_rights: { _: 'chatBannedRights', send_polls: true, until_date: 0 },
    })
  })

  it('gives the account the updates a setting change caused', async () => {
    const client = fake([NOTHING_HAPPENED])

    await toggleContentProtection(client, '@channel', true)

    expect(client.fed).toHaveLength(1)
    expect(sent(client, 'messages.toggleNoForwards')).toMatchObject({ enabled: true })
  })

  it('clears a public name by sending the empty one', async () => {
    const client = fake([true])

    await setChatUsername(client, '@channel', undefined)

    expect(sent(client, 'channels.updateUsername')).toMatchObject({ username: '' })
  })
})

describe('how an account arranges its list', () => {
  const folders = {
    _: 'messages.dialogFilters',
    filters: [
      { _: 'dialogFilterDefault' },
      {
        _: 'dialogFilter',
        id: 2,
        title: { _: 'textWithEntities', text: 'Work', entities: [] },
        pinned_peers: [],
        include_peers: [CHANNEL],
        exclude_peers: [],
      },
    ],
  }

  it('reads the folders, marking the reserved ones', async () => {
    const client = fake([folders])

    const read = await readFolders(client)

    expect(read.map((one) => one.id)).toEqual([0, 2])
    expect(read[1]).toMatchObject({ title: 'Work', isArchive: false })
    expect(read[1]?.included).toHaveLength(1)
  })

  it('refuses to make a folder on a reserved number', async () => {
    const client = fake([])

    await expect(createFolder(client, { id: 1, title: 'Archive' })).rejects.toThrow(/reserved/)
    await expect(createFolder(client, { id: 0, title: 'Main' })).rejects.toThrow(/reserved/)
    expect(client.asked).toEqual([])
  })

  it('reads a folder before changing it, so nothing unmentioned is dropped', async () => {
    // The call replaces the whole folder. A caller sending only the changed
    // field would clear the rest, so the current one is read first.
    const client = fake([folders, true])

    await editFolder(client, 2, { title: 'Work things' })

    expect(client.asked.map((one) => one.method)).toEqual([
      'messages.getDialogFilters',
      'messages.updateDialogFilter',
    ])
    const filter = (
      sent(client, 'messages.updateDialogFilter') as {
        filter: { title: { text: string }; include_peers: unknown[] }
      }
    ).filter
    expect(filter.title.text).toBe('Work things')
    expect(filter.include_peers).toHaveLength(1)
  })

  it('says so when asked to change a folder this account does not have', async () => {
    const client = fake([folders])

    await expect(editFolder(client, 9, { title: 'Nope' })).rejects.toThrow(/no folder 9/)
  })

  it('archives and unarchives through one call with a different number', async () => {
    const archiving = fake([NOTHING_HAPPENED])
    await archiveChats(archiving, ['@noisy'], true)

    const restoring = fake([NOTHING_HAPPENED])
    await archiveChats(restoring, ['@noisy'], false)

    expect(
      (sent(archiving, 'folders.editPeerFolders') as { folder_peers: { folder_id: number }[] })
        .folder_peers[0]?.folder_id,
    ).toBe(1)
    expect(
      (sent(restoring, 'folders.editPeerFolders') as { folder_peers: { folder_id: number }[] })
        .folder_peers[0]?.folder_id,
    ).toBe(0)
  })

  it('asks nothing to archive nothing', async () => {
    const client = fake([])

    await archiveChats(client, [], true)
    expect(client.asked).toEqual([])
  })

  it('marks unread with a flag, and clears it by its absence', async () => {
    const client = fake([true, true])

    await markChatUnread(client, '@chat', true)
    await markChatUnread(client, '@chat', false)

    expect(client.asked[0]?.params).toMatchObject({ unread: true })
    expect(client.asked[1]?.params).not.toHaveProperty('unread')
  })

  it('clears a draft with empty text, and omits entities it has none of', async () => {
    const client = fake([true, true])

    await saveDraft(client, '@chat', undefined)
    await saveDraft(client, '@chat', 'half a thought', { replyTo: 42 })

    expect(client.asked[0]?.params).toMatchObject({ message: '' })
    expect(client.asked[0]?.params).not.toHaveProperty('entities')
    expect(client.asked[1]?.params).toMatchObject({
      message: 'half a thought',
      reply_to: { _: 'inputReplyToMessage', reply_to_msg_id: 42 },
    })
  })
})
