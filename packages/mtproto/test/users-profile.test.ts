// SPDX-License-Identifier: MPL-2.0

/**
 * Reading and changing who an account is, and who it knows.
 *
 * Driven by a fake client rather than a connection, which is what the
 * structural `Profiling` interface is for. Two things are worth judging in
 * every case and neither is the return value alone: **what travelled**, because
 * most of these are one request whose fields a caller cannot see, and **what
 * was resolved**, because naming a person is the step these share and the step
 * a caller gets wrong.
 *
 * Nothing here uses a real credential or a real phone number. `+70000000000` is
 * the reserved test range.
 */

import { PeerError, TelegramError, ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import type { MtprotoApi } from '../src/api.js'
import type { TypeInputPeer } from '../src/generated/api/types/index.js'
import type { PeerRef } from '../src/normalize/normalize.js'
import type { PeerRecord, PeerStore } from '../src/storage/peers.js'
import {
  addContact,
  block,
  commonChats,
  deleteContacts,
  deleteProfilePhotos,
  editProfile,
  findByPhone,
  importContacts,
  knows,
  messageTtl,
  myUsername,
  type Profiling,
  peerSettings,
  profilePhoto,
  readBlocked,
  readContacts,
  readProfile,
  readUsers,
  resolveMany,
  savedMusic,
  saveMusic,
  setBirthday,
  setCloseFriends,
  setContactNote,
  setEmojiStatus,
  setMessageTtl,
  setOnline,
  setProfilePhoto,
  setUsername,
  unblock,
  whoAmI,
} from '../src/users/profile.js'

const ANN: TypeInputPeer = { _: 'inputPeerUser', user_id: 7n, access_hash: 77n }
const CHANNEL: TypeInputPeer = { _: 'inputPeerChannel', channel_id: 10n, access_hash: 99n }

/** One user, as the schema describes one. */
const user = (id: bigint, extra: Record<string, unknown> = {}) => ({
  _: 'user' as const,
  id,
  access_hash: id * 11n,
  first_name: `user${String(id)}`,
  ...extra,
})

/** A client answering from a script, recording what it was asked and resolved. */
function fake(
  answers: readonly unknown[],
  as: TypeInputPeer = ANN,
): Profiling & { readonly asked: unknown[]; readonly resolved: unknown[] } {
  const asked: unknown[] = []
  const resolved: unknown[] = []
  let at = 0

  const next = (params: unknown = {}) => {
    asked.push(params)

    const answer = answers[at]
    at += 1

    if (answer === undefined) throw new Error('asked for more answers than the script has')

    return Promise.resolve(answer)
  }

  const api = {
    account: {
      updateProfile: next,
      updateUsername: next,
      updateStatus: next,
      updateEmojiStatus: next,
      updateBirthday: next,
      saveMusic: next,
    },
    contacts: {
      resolvePhone: next,
      getContacts: next,
      addContact: next,
      importContacts: next,
      deleteContacts: next,
      block: next,
      unblock: next,
      editCloseFriends: next,
      getBlocked: next,
      updateContactNote: next,
    },
    messages: {
      getCommonChats: next,
      getDefaultHistoryTTL: next,
      getPeerSettings: next,
      setDefaultHistoryTTL: next,
    },
    photos: { deletePhotos: next, getUserPhotos: next, uploadProfilePhoto: next },
    users: { getUsers: next, getFullUser: next, getSavedMusic: next },
  } as unknown as MtprotoApi

  return {
    api,
    asked,
    resolved,
    resolve(peer) {
      resolved.push(peer)

      // A reference already carries the identifier, so it resolves to itself
      // rather than to the fixture's stand-in; a name still needs looking up.
      if (typeof peer === 'object' && peer.kind === 'user') {
        return Promise.resolve({
          _: 'inputPeerUser',
          user_id: peer.id,
          access_hash: 0n,
        } as TypeInputPeer)
      }

      return Promise.resolve(as)
    },
  }
}

describe('reading who somebody is', () => {
  it('names this account without resolving anything', async () => {
    // The cheapest form, and the one that has to work before this account has
    // met anybody: `inputUserSelf` needs no access hash and no lookup.
    const client = fake([[user(1n, { self: true, username: 'me' })]])

    const me = await whoAmI(client)

    expect(me.id).toBe(1n)
    expect(client.resolved).toEqual([])
    expect(client.asked[0]).toEqual({ id: [{ _: 'inputUserSelf' }] })
  })

  it('reads several users in one request', async () => {
    const client = fake([[user(7n), user(8n)]])

    const found = await readUsers(client, ['@one', '@two'])

    expect(found.map((one) => one.id)).toEqual([7n, 8n])
    // Two resolutions, one read: the batch is the point.
    expect(client.resolved).toEqual(['@one', '@two'])
    expect(client.asked).toHaveLength(1)
  })

  it('leaves out a user the server would not describe', async () => {
    // The empty form is a hole where somebody this account may not see used to
    // be. Handing it over as a user would give a caller an id of nothing.
    const client = fake([[user(7n), { _: 'userEmpty', id: 9n }]])

    expect(await readUsers(client, ['@one', '@two'])).toHaveLength(1)
  })

  it('asks nothing at all for an empty list', async () => {
    const client = fake([])

    expect(await readUsers(client, [])).toEqual([])
    expect(client.asked).toEqual([])
  })

  it('refuses to read a conversation as a person', async () => {
    // Several of these take an `inputUser`, and passing a channel would be
    // reported by the server as something about the request rather than about
    // the mistake.
    const client = fake([], CHANNEL)

    await expect(readUsers(client, ['@channel'])).rejects.toThrow(PeerError)
    await expect(readUsers(client, ['@channel'])).rejects.toThrow(/names a person/)
    expect(client.asked).toEqual([])
  })

  it('reads the fields only a full profile carries', async () => {
    const client = fake([
      {
        _: 'users.userFull',
        full_user: {
          _: 'userFull',
          id: 7n,
          about: 'building things',
          common_chats_count: 3,
          blocked: true,
          pinned_msg_id: 42,
          settings: { _: 'peerSettings' },
          notify_settings: { _: 'peerNotifySettings' },
        },
        chats: [],
        users: [user(7n)],
      },
    ])

    const full = await readProfile(client, '@someone')

    expect(full.user.id).toBe(7n)
    expect(full.bio).toBe('building things')
    expect(full.commonChats).toBe(3)
    expect(full.blocked).toBe(true)
    expect(full.pinnedMessageId).toBe(42)
    // Absent rather than invented where the profile says nothing.
    expect(full.messageTtl).toBeUndefined()
    expect(full.birthday).toBeUndefined()
  })

  it('finds somebody by the number they signed up with', async () => {
    const client = fake([{ _: 'contacts.resolvedPeer', peer: {}, chats: [], users: [user(7n)] }])

    expect((await findByPhone(client, '+70000000000')).id).toBe(7n)
    expect(client.asked[0]).toEqual({ phone: '+70000000000' })
  })

  it('says so when an answer described nobody', async () => {
    // Better than handing back an empty view: a caller reading `id` off one
    // would get a number that means nothing.
    const client = fake([{ _: 'contacts.resolvedPeer', peer: {}, chats: [], users: [] }])

    await expect(findByPhone(client, '+70000000000')).rejects.toThrow(ValidationError)
  })

  it('reads the conversations two accounts share', async () => {
    const client = fake([
      {
        _: 'messages.chats',
        chats: [{ _: 'chat', id: 3n, title: 'shared', participants_count: 2 }],
      },
    ])

    const shared = await commonChats(client, '@someone')

    expect(shared.map((chat) => chat.title)).toEqual(['shared'])
    expect(client.asked[0]).toMatchObject({ user_id: { _: 'inputUser' }, max_id: 0n, limit: 100 })
  })
})

describe('changing what this account says about itself', () => {
  it('sends only the fields it was given', async () => {
    // The method treats an absent field as "leave it" and an empty string as
    // "clear it", so sending everything would wipe what a caller did not
    // mention.
    const client = fake([user(1n, { first_name: 'Yui' })])

    await editProfile(client, { firstName: 'Yui' })

    expect(client.asked[0]).toEqual({ first_name: 'Yui' })
  })

  it('sends an empty string only when one was meant', async () => {
    const client = fake([user(1n)])

    await editProfile(client, { bio: '' })

    expect(client.asked[0]).toEqual({ about: '' })
  })

  it('refuses an edit with nothing in it', async () => {
    const client = fake([])

    await expect(editProfile(client, {})).rejects.toThrow(ValidationError)
    expect(client.asked).toEqual([])
  })

  it('clears the username by sending the empty one', async () => {
    const client = fake([user(1n), user(1n)])

    await setUsername(client, 'yui')
    await setUsername(client, undefined)

    expect(client.asked[0]).toEqual({ username: 'yui' })
    expect(client.asked[1]).toEqual({ username: '' })
  })

  it('says whether this account is at the keyboard, in the protocol’s polarity', async () => {
    // The call says `offline`, and a method called `setOnline` that sent
    // `offline: true` for `true` would be the easiest possible bug to ship.
    const client = fake([true, true])

    await setOnline(client, true)
    await setOnline(client, false)

    expect(client.asked[0]).toEqual({ offline: false })
    expect(client.asked[1]).toEqual({ offline: true })
  })

  it('clears an emoji status with the empty one rather than by omission', async () => {
    const client = fake([true])

    await setEmojiStatus(client, undefined)

    expect(client.asked[0]).toEqual({ emoji_status: { _: 'emojiStatusEmpty' } })
  })

  it('publishes a birthday with or without a year, and takes it down', async () => {
    const client = fake([true, true, true])

    await setBirthday(client, { day: 1, month: 4, year: 1990 })
    await setBirthday(client, { day: 1, month: 4 })
    await setBirthday(client, undefined)

    expect(client.asked[0]).toEqual({ birthday: { _: 'birthday', day: 1, month: 4, year: 1990 } })
    expect(client.asked[1]).toEqual({ birthday: { _: 'birthday', day: 1, month: 4 } })
    expect(client.asked[2]).toEqual({})
  })

  it('names profile photos by the hash that reaches them', async () => {
    const client = fake([[1n, 2n]])
    const photo = {
      _: 'photo',
      id: 42n,
      access_hash: 5n,
      file_reference: Uint8Array.of(9),
    }

    expect(await deleteProfilePhotos(client, [photo])).toBe(2)
    expect(client.asked[0]).toEqual({
      id: [{ _: 'inputPhoto', id: 42n, access_hash: 5n, file_reference: Uint8Array.of(9) }],
    })
  })

  it('asks nothing to remove no photos', async () => {
    const client = fake([])

    expect(await deleteProfilePhotos(client, [])).toBe(0)
    expect(client.asked).toEqual([])
  })

  it('reads and sets how long messages live by default', async () => {
    const client = fake([{ _: 'defaultHistoryTTL', period: 86_400 }, true])

    expect(await messageTtl(client)).toBe(86_400)
    await setMessageTtl(client, 0)

    expect(client.asked[1]).toEqual({ period: 0 })
  })

  it('refuses a lifetime that is not a whole number of seconds', async () => {
    const client = fake([])

    await expect(setMessageTtl(client, -1)).rejects.toThrow(ValidationError)
    await expect(setMessageTtl(client, 1.5)).rejects.toThrow(ValidationError)
    expect(client.asked).toEqual([])
  })
})

describe('who this account knows', () => {
  it('reads the contact list', async () => {
    const client = fake([
      { _: 'contacts.contacts', contacts: [], saved_count: 2, users: [user(7n), user(8n)] },
    ])

    expect((await readContacts(client)).map((one) => one.id)).toEqual([7n, 8n])
  })

  it('treats an unchanged answer as nothing to read', async () => {
    // The hash is not sent, so this form means the list is empty rather than
    // unchanged — and either way there is nobody to hand back.
    const client = fake([{ _: 'contacts.contactsNotModified' }])

    expect(await readContacts(client)).toEqual([])
  })

  it('adds a contact, defaulting the parts Telegram insists on', async () => {
    // The last name and the phone are required by the call and optional in
    // life, so they default to the empty string the protocol expects.
    const client = fake([{ _: 'updates', updates: [], users: [], chats: [], date: 0, seq: 0 }])

    await addContact(client, { peer: '@someone', firstName: 'Ann' })

    expect(client.asked[0]).toMatchObject({ first_name: 'Ann', last_name: '', phone: '' })
    expect(client.asked[0]).not.toHaveProperty('add_phone_privacy_exception')
  })

  it('shares this account’s number only when asked to', async () => {
    const client = fake([{ _: 'updates', updates: [], users: [], chats: [], date: 0, seq: 0 }])

    await addContact(client, { peer: '@someone', firstName: 'Ann', sharePhone: true })

    expect(client.asked[0]).toMatchObject({ add_phone_privacy_exception: true })
  })

  it('numbers imported contacts so the server can say which was which', async () => {
    const client = fake([
      {
        _: 'contacts.importedContacts',
        imported: [{ _: 'importedContact', user_id: 7n, client_id: 0n }],
        popular_invites: [],
        retry_contacts: [5n],
        users: [user(7n)],
      },
    ])

    const outcome = await importContacts(client, [
      { phone: '+70000000000', firstName: 'Ann' },
      { phone: '+70000000001', firstName: 'Bo', lastName: 'Lee' },
    ])

    expect(outcome.added.map((one) => one.id)).toEqual([7n])
    // A number the server wants tried again is reported rather than retried:
    // when to retry is a decision about timing, and the caller's.
    expect(outcome.retry).toEqual([5n])

    const sent = (client.asked[0] as { contacts: { client_id: bigint; last_name: string }[] })
      .contacts
    expect(sent.map((one) => one.client_id)).toEqual([0n, 1n])
    expect(sent[1]?.last_name).toBe('Lee')
  })

  it('imports nothing without asking', async () => {
    const client = fake([])

    expect(await importContacts(client, [])).toEqual({ added: [], retry: [] })
    expect(client.asked).toEqual([])
  })

  it('removes contacts by the user each name resolved to', async () => {
    const client = fake([{ _: 'updates', updates: [], users: [], chats: [], date: 0, seq: 0 }])

    await deleteContacts(client, ['@one', '@two'])

    expect(client.resolved).toEqual(['@one', '@two'])
    expect((client.asked[0] as { id: unknown[] }).id).toHaveLength(2)
  })

  it('blocks a peer rather than only a person', async () => {
    // A channel can be blocked as well as somebody, so this takes the peer and
    // does not insist on a user.
    const client = fake([true], CHANNEL)

    expect(await block(client, '@channel')).toBe(true)
    expect(client.asked[0]).toEqual({ id: CHANNEL })
  })

  it('keeps the stories list separate from the messages one', async () => {
    const client = fake([true, true])

    await block(client, '@someone', { storiesOnly: true })
    await unblock(client, '@someone')

    expect(client.asked[0]).toMatchObject({ my_stories_from: true })
    expect(client.asked[1]).not.toHaveProperty('my_stories_from')
  })

  it('replaces the close-friends list rather than adding to it', async () => {
    const client = fake([true])

    await setCloseFriends(client, ['@one', '@two'])

    expect(client.asked[0]).toEqual({ id: [7n, 7n] })
  })

  it('takes bare identifiers as readily as names, which is the whole of the raw form', async () => {
    // Telegram's call takes numbers, and a user reference carries one, so
    // naming people by identifier needs no separate method.
    const client = fake([true])

    await setCloseFriends(client, [
      { kind: 'user', id: 11n },
      { kind: 'user', id: 12n },
    ])

    expect(client.asked[0]).toEqual({ id: [11n, 12n] })
  })
})

describe('the rest of the people surface', () => {
  it('asks the server what it suggests about a peer', async () => {
    const client = fake([
      {
        _: 'messages.peerSettings',
        settings: { _: 'peerSettings', report_spam: true },
        chats: [],
        users: [],
      },
    ])

    const settings = await peerSettings(client, '@someone')

    expect(settings.report_spam).toBe(true)
    expect(client.asked[0]).toEqual({ peer: ANN })
  })

  it('reads the blocked list as references the account can resolve', async () => {
    const client = fake([
      {
        _: 'contacts.blockedSlice',
        count: 1,
        blocked: [
          { _: 'peerBlocked', peer_id: { _: 'peerUser', user_id: 7n }, date: 1_700_000_000 },
        ],
        chats: [],
        users: [user(7n)],
      },
    ])

    const blocked = await readBlocked(client)

    expect(blocked).toEqual([{ peer: { kind: 'user', id: 7n }, date: 1_700_000_000 }])
    expect(client.asked[0]).toEqual({ offset: 0, limit: 100 })
  })

  it('reads the stories block list separately when asked', async () => {
    const client = fake([{ _: 'contacts.blocked', blocked: [], chats: [], users: [] }])

    await readBlocked(client, { storiesOnly: true })

    expect(client.asked[0]).toMatchObject({ my_stories_from: true })
  })

  it('takes an uploaded file for a profile photo rather than doing the upload', async () => {
    // The upload is the caller's, for the reason every other send's is: what to
    // upload and from where carries options this has no business growing.
    const client = fake([{ _: 'photos.photo', photo: { _: 'photo', id: 5n }, users: [] }])
    const uploaded = {
      file: { _: 'inputFile', id: 1n, parts: 1, name: 'me.jpg', md5_checksum: '' },
    }

    const photo = await setProfilePhoto(client, { photo: uploaded as never })

    expect(photo.id).toBe(5n)
    expect(client.asked[0]).toMatchObject({ file: uploaded.file })
    expect(client.asked[0]).not.toHaveProperty('fallback')
  })

  it('refuses to set a profile photo made of nothing', async () => {
    const client = fake([])

    await expect(setProfilePhoto(client, {})).rejects.toThrow(ValidationError)
    expect(client.asked).toEqual([])
  })

  it('says so when the server accepted a photo and described none', async () => {
    const client = fake([{ _: 'photos.photo', photo: { _: 'photoEmpty', id: 0n }, users: [] }])
    const uploaded = { file: { _: 'inputFile', id: 1n, parts: 1, name: 'x', md5_checksum: '' } }

    await expect(setProfilePhoto(client, { photo: uploaded as never })).rejects.toThrow(
      ValidationError,
    )
  })

  it('reads the music on a profile, and treats an unchanged answer as nothing', async () => {
    const client = fake([
      { _: 'users.savedMusic', count: 1, documents: [{ _: 'document', id: 3n }] },
      { _: 'users.savedMusicNotModified' },
    ])

    expect(await savedMusic(client, '@someone')).toHaveLength(1)
    expect(await savedMusic(client, '@someone')).toEqual([])
  })

  it('puts a track on the profile and takes one off', async () => {
    const client = fake([true, true])
    const track = {
      _: 'inputDocument' as const,
      id: 3n,
      access_hash: 4n,
      file_reference: Uint8Array.of(1),
    }

    await saveMusic(client, track)
    await saveMusic(client, track, { remove: true })

    expect(client.asked[0]).toEqual({ id: track })
    expect(client.asked[1]).toMatchObject({ unsave: true })
  })
})

describe('the capabilities a one-line composition did not preserve', () => {
  it('fetches one named photo rather than whichever is newest', async () => {
    // Taking the first of the photo walk gives the current photo. This names
    // one, which is what a stored identifier refers to — and the request is
    // the protocol's own way of asking for exactly that: start one before the
    // list, take a single entry at or below the identifier.
    const client = fake([{ _: 'photos.photos', photos: [aPhoto(42n)], users: [] }])

    const photo = await profilePhoto(client, '@someone', 42n)

    expect(photo?.id).toBe(42n)
    expect(client.asked[0]).toMatchObject({ offset: -1, limit: 1, max_id: 42n })
  })

  it('answers nothing for a photo this account cannot see', async () => {
    const client = fake([{ _: 'photos.photos', photos: [], users: [] }])

    expect(await profilePhoto(client, '@someone', 42n)).toBeUndefined()
  })

  it('sets and clears a contact note through the method that carries one', async () => {
    // The client-facing name and the protocol's differ, which is why an earlier
    // search for it came up empty: the call is `contacts.updateContactNote`.
    const client = fake([true, true])

    await setContactNote(client, '@someone', 'met at the conference')
    await setContactNote(client, '@someone', undefined)

    expect(client.asked[0]).toMatchObject({
      note: { _: 'textWithEntities', text: 'met at the conference', entities: [] },
    })
    // Clearing is empty text rather than an absent field: the protocol has no
    // way to say "leave it", so "no note" and "an empty note" are one state.
    expect(client.asked[1]).toMatchObject({ note: { _: 'textWithEntities', text: '' } })
  })
})

describe('asking what this account already knows', () => {
  /** A store holding whatever a case puts in it. */
  function knownPeers(records: readonly PeerRecord[] = []): PeerStore {
    const byId = new Map(records.map((record) => [`${record.kind}:${record.id}`, record]))

    return {
      byId: (kind, id) => Promise.resolve(byId.get(`${kind}:${id}`)),
      byUsername: (name) =>
        Promise.resolve(records.find((record) => record.usernames.includes(name.toLowerCase()))),
      byPhone: (phone) => Promise.resolve(records.find((record) => record.phone === phone)),
      save: () => Promise.resolve(true),
      forget: () => Promise.resolve(),
    }
  }

  const ann: PeerRecord = {
    kind: 'user',
    id: 7n,
    accessHash: 77n,
    usernames: ['ann'],
    phone: '70000000000',
    // A complete record: one harvested from a reduced mention would be
    // marked, and a reduced hash is not one this account can address with.
    min: false,
  }

  it('reaches no network, which is what separates it from resolving', async () => {
    // `resolve` goes and asks when it has to. A caller deciding whether an
    // operation is free cannot learn that by catching a failure from it.
    const peers = knownPeers([ann])

    expect(await knows(peers, '@ann')).toBe(true)
    expect(await knows(peers, { kind: 'user', id: 7n })).toBe(true)
    expect(await knows(peers, '@nobody')).toBe(false)
    expect(await knows(peers, { kind: 'channel', id: 7n })).toBe(false)
  })

  it('reads a name the way a user would write it', async () => {
    const peers = knownPeers([ann])

    expect(await knows(peers, 'ann')).toBe(true)
    expect(await knows(peers, '@ann')).toBe(true)
    expect(await knows(peers, '+70000000000')).toBe(true)
    expect(await knows(peers, '70000000000')).toBe(true)
    expect(await knows(peers, '')).toBe(false)
  })

  it('always knows itself', async () => {
    // An account can name itself before it has met anybody, because naming
    // itself needs no access hash.
    const peers = knownPeers()

    expect(await knows(peers, 'me')).toBe(true)
    expect(await knows(peers, 'self')).toBe(true)
  })

  it('reads the username from what was written down, not from a call', async () => {
    const peers = knownPeers([{ ...ann, usernames: ['ann', 'annie'] }])

    // The first is the primary; the rest are additional names.
    expect(await myUsername(peers, 7n)).toBe('ann')
    // Nothing until this account has read itself, which is the honest answer
    // for a question about local state.
    expect(await myUsername(peers, undefined)).toBeUndefined()
    expect(await myUsername(peers, 9n)).toBeUndefined()
  })
})

describe('resolving several peers at once', () => {
  it('answers positionally, with a gap where one could not be named', async () => {
    // A shorter list would shift every later entry onto the wrong name, which
    // is worse than saying nothing about one position.
    const client = resolving({ '@ann': ANN })

    const found = await resolveMany(client, ['@ann', '@nobody', '@ann'])

    expect(found).toEqual([ANN, undefined, ANN])
  })

  it('resolves each distinct peer once', async () => {
    // A caller assembling a list from messages has duplicates by construction.
    const client = resolving({ '@ann': ANN, '@bo': CHANNEL })

    await resolveMany(client, ['@ann', '@bo', '@ann', '@bo', '@ann'])

    expect(client.resolved).toEqual(['@ann', '@bo'])
  })

  it('tells a reference from a name when deciding what is the same peer', async () => {
    const client = resolving({ '@ann': ANN })

    await resolveMany(client, [
      { kind: 'user', id: 7n },
      { kind: 'user', id: 7n },
      { kind: 'channel', id: 7n },
    ])

    expect(client.resolved).toHaveLength(2)
  })

  it('never has more than eight in flight', async () => {
    // Resolving a name this account has not seen is a request. Thirty at once
    // would be thirty requests against an account Telegram is willing to limit,
    // so the peak is what this measures rather than the total.
    const client = resolving({}, { slow: true })

    const found = await resolveMany(
      client,
      Array.from({ length: 30 }, (_, index) => `@user${String(index)}`),
    )

    expect(found).toHaveLength(30)
    expect(client.peak).toBe(8)
  })

  it('lets anything that is not "cannot name it" out', async () => {
    // Swallowing a flood wait would turn a failure into an absence, and a
    // retry into a gap in whatever the caller was assembling.
    const client: Profiling = {
      api: {} as unknown as MtprotoApi,
      resolve: () => Promise.reject(new TelegramError('FLOOD_WAIT_30 (420)')),
    }

    await expect(resolveMany(client, ['@ann'])).rejects.toThrow(TelegramError)
  })

  it('asks nothing for an empty list', async () => {
    const client = resolving({})

    expect(await resolveMany(client, [])).toEqual([])
    expect(client.resolved).toEqual([])
  })
})

/** A client that resolves only the names it was given, recording each. */
function resolving(
  known: Record<string, TypeInputPeer>,
  options: { readonly slow?: boolean } = {},
) {
  const resolved: (string | PeerRef)[] = []
  let inFlight = 0
  let peak = 0

  return {
    api: {} as unknown as MtprotoApi,
    resolved,
    get peak() {
      return peak
    },
    async resolve(peer: string | PeerRef) {
      resolved.push(peer)
      inFlight += 1
      peak = Math.max(peak, inFlight)

      try {
        // Long enough that every worker that can start has started, so the
        // peak is the ceiling rather than a race.
        if (options.slow === true) {
          await new Promise((resume) => setTimeout(resume, 5))
        }

        const found = typeof peer === 'string' ? known[peer] : undefined
        if (found === undefined) throw new PeerError(`this account has not seen ${String(peer)}`)

        return found
      } finally {
        inFlight -= 1
      }
    },
  }
}

/** A photo with one size worth fetching. */
const aPhoto = (id: bigint) => ({
  _: 'photo' as const,
  id,
  access_hash: 1n,
  file_reference: Uint8Array.of(1),
  date: 1_700_000_000,
  sizes: [{ _: 'photoSize' as const, type: 'x', w: 800, h: 600, size: 51_200 }],
  dc_id: 2,
})
