/**
 * Who this account is, who it knows, and what it says about itself.
 *
 * Everything here is an operation on a *person* rather than on a conversation:
 * reading a profile, changing this account's own, keeping a contact list, and
 * deciding who may reach it. They live together because they share one
 * dependency — turning something a caller named into a user the server will
 * accept — and because that step is the part a caller gets wrong.
 *
 * ```
 *   '@someone' ──> account.resolve ──> inputPeer ──> userFor ──> inputUser
 *                        │                                          │
 *                  peer store, network                       the call takes this
 * ```
 *
 * **Naming a user is not naming a peer.** Telegram issues an access hash per
 * account, and several of these methods take an `inputUser` rather than an
 * `inputPeer` — so a caller passing a channel to something that wants a person
 * has made an error the server would report as something else entirely. That is
 * caught here, by name, before anything travels.
 *
 * **The answers are harvested.** These go out through the account, so every
 * user and chat an answer describes is written down on the way back and can be
 * addressed afterwards without another lookup. That is why a contact list read
 * here makes `account.resolve({ kind: 'user', id })` work for everybody in it.
 *
 * Structural rather than the `Account` class, for the reason the walks are: it
 * makes every one of these testable without a connection.
 */

import { PeerError, ValidationError } from '@yuigram/core'
import type { MtprotoApi } from '../api.js'
import { ChatView, UserView } from '../entities/peer.js'
import type { UploadedFile } from '../files/upload.js'
import type {
  Photo,
  TypeBirthday,
  TypeDocument,
  TypeEmojiStatus,
  TypeInputDocument,
  TypeInputPeer,
  TypeInputUser,
  TypePeerSettings,
  TypePhoto,
  TypeUser,
} from '../generated/api/types/index.js'
import { userFor } from '../network/peers.js'
import type { PeerRef } from '../normalize/normalize.js'
import { peerRefOf } from '../normalize/normalize.js'
import type { PeerStore } from '../storage/peers.js'

/** What these operations need from a client. */
export interface Profiling {
  readonly api: MtprotoApi
  resolve(peer: string | PeerRef): Promise<TypeInputPeer>
}

/** Resolve something a caller named, and insist it is a person. */
async function asUser(client: Profiling, peer: string | PeerRef): Promise<TypeInputUser> {
  const resolved = await client.resolve(peer)
  const user = userFor(resolved)

  if (user === undefined) {
    throw new PeerError(
      `this operation names a person, and '${typeof peer === 'string' ? peer : peer.kind}' is not one`,
    )
  }

  return user
}

/** Read the first user out of an answer that carries a list of them. */
function firstUser(users: readonly TypeUser[], what: string): UserView {
  const found = users.find((user) => user._ === 'user')
  if (found === undefined) throw new ValidationError(`${what} described no user`)

  return new UserView(found)
}

// ---------------------------------------------------------------------------
// Who somebody is
// ---------------------------------------------------------------------------

/**
 * Read this account's own user.
 *
 * ```ts
 * const me = await whoAmI(account)
 * console.log(me.id, me.username)
 * ```
 *
 * The cheapest form: one call naming `inputUserSelf`, which needs nothing
 * resolved and works before this account has met anybody. What it answers is
 * the same `UserView` every other user arrives as.
 */
export async function whoAmI(client: Profiling): Promise<UserView> {
  const answer = await client.api.users.getUsers({ id: [{ _: 'inputUserSelf' }] })

  return firstUser(answer, 'users.getUsers')
}

/**
 * Read several users at once.
 *
 * ```ts
 * const [a, b] = await readUsers(account, ['@one', '@two'])
 * ```
 *
 * Each name is resolved first, which may reach the network for one this account
 * has never seen, and the read itself is a single call. Users the server
 * declined to describe are left out rather than yielded as empty ones: an empty
 * user is a hole where somebody this account may not see used to be, and a
 * caller reading `id` off it would get nothing useful.
 */
export async function readUsers(
  client: Profiling,
  peers: readonly (string | PeerRef)[],
): Promise<UserView[]> {
  if (peers.length === 0) return []

  const id: TypeInputUser[] = []
  for (const peer of peers) id.push(await asUser(client, peer))

  const answer = await client.api.users.getUsers({ id })

  return answer.filter((user) => user._ === 'user').map((user) => new UserView(user))
}

/** Everything a full profile says beyond what the user record carries. */
export interface FullProfile {
  /** The user itself. */
  readonly user: UserView
  /** What they wrote about themselves. */
  readonly bio: string | undefined
  /** How many conversations this account shares with them. */
  readonly commonChats: number
  /** Whether this account has blocked them. */
  readonly blocked: boolean
  /** Their pinned message, where they have one. */
  readonly pinnedMessageId: number | undefined
  /** How long messages in this conversation live, in seconds, where a limit is set. */
  readonly messageTtl: number | undefined
  /** The birthday they published, where they published one. */
  readonly birthday: TypeBirthday | undefined
  /** The whole answer, for a field this does not name. */
  readonly raw: unknown
}

/**
 * Read everything Telegram will say about one user.
 *
 * ```ts
 * const full = await readProfile(account, '@someone')
 * console.log(full.bio, full.commonChats)
 * ```
 *
 * A second call beyond {@link readUsers}, and worth it only when the extra
 * fields are wanted: the full form is rate-limited more tightly than the plain
 * one, and a program reading it in a loop over a member list will be told so.
 */
export async function readProfile(client: Profiling, peer: string | PeerRef): Promise<FullProfile> {
  const answer = await client.api.users.getFullUser({ id: await asUser(client, peer) })
  const full = answer.full_user

  return {
    user: firstUser(answer.users, 'users.getFullUser'),
    bio: full.about,
    commonChats: full.common_chats_count,
    blocked: full.blocked === true,
    pinnedMessageId: full.pinned_msg_id,
    messageTtl: full.ttl_period,
    birthday: full.birthday,
    raw: answer,
  }
}

/**
 * Find a user by the phone number they signed up with.
 *
 * ```ts
 * const someone = await findByPhone(account, '+70000000000')
 * ```
 *
 * Only works for a number already in this account's contacts, or one whose
 * owner has not hidden it — the server decides, and refuses otherwise. The
 * number is sent as given; Telegram accepts it with or without the leading `+`.
 */
export async function findByPhone(client: Profiling, phone: string): Promise<UserView> {
  const answer = await client.api.contacts.resolvePhone({ phone })

  return firstUser(answer.users, 'contacts.resolvePhone')
}

/**
 * The conversations this account and one other person are both in.
 *
 * ```ts
 * for (const chat of await commonChats(account, '@someone')) console.log(chat.title)
 * ```
 *
 * Paged by the identifier of the last chat seen, which is a policy of its own
 * and not worth a walk: the list is what two accounts share, which is short
 * enough to read at once in every case this is asked for.
 */
export async function commonChats(
  client: Profiling,
  peer: string | PeerRef,
  options: { readonly limit?: number; readonly after?: bigint } = {},
): Promise<ChatView[]> {
  const answer = await client.api.messages.getCommonChats({
    user_id: await asUser(client, peer),
    max_id: options.after ?? 0n,
    limit: options.limit ?? 100,
  })

  if (answer._ === 'messages.chatsSlice') return answer.chats.map((chat) => new ChatView(chat))

  return answer.chats.map((chat) => new ChatView(chat))
}

// ---------------------------------------------------------------------------
// What this account says about itself
// ---------------------------------------------------------------------------

/** What to change about this account's profile. Anything omitted is left alone. */
export interface ProfileEdit {
  readonly firstName?: string
  readonly lastName?: string
  /** What appears under the name. Telegram calls this the bio. */
  readonly bio?: string
}

/**
 * Change this account's own name or bio.
 *
 * ```ts
 * await editProfile(account, { firstName: 'Yui', bio: 'building things' })
 * ```
 *
 * Fields are sent only when given, because the method treats an absent field as
 * "leave it" and an empty string as "clear it" — so passing `''` for everything
 * a caller did not mention would wipe the profile.
 */
export async function editProfile(client: Profiling, edit: ProfileEdit): Promise<UserView> {
  if (edit.firstName === undefined && edit.lastName === undefined && edit.bio === undefined) {
    throw new ValidationError('editing a profile with nothing to change does nothing')
  }

  const answer = await client.api.account.updateProfile({
    ...(edit.firstName === undefined ? {} : { first_name: edit.firstName }),
    ...(edit.lastName === undefined ? {} : { last_name: edit.lastName }),
    ...(edit.bio === undefined ? {} : { about: edit.bio }),
  })

  return new UserView(answer)
}

/**
 * Take a username for this account, or give up the one it has.
 *
 * ```ts
 * await setUsername(account, 'yui')
 * await setUsername(account, undefined)
 * ```
 *
 * Passing nothing clears it, which is the same request with an empty string —
 * spelled as an absent value here because "no username" is a state rather than
 * a name that happens to be empty.
 */
export async function setUsername(
  client: Profiling,
  username: string | undefined,
): Promise<UserView> {
  const answer = await client.api.account.updateUsername({ username: username ?? '' })

  return new UserView(answer)
}

/**
 * Say whether this account is at the keyboard.
 *
 * ```ts
 * await setOnline(account, true)
 * ```
 *
 * Telegram treats an account that never says as offline after a few minutes, so
 * a program that wants to appear online says so periodically. How often is the
 * caller's: it is one call, and a client that sent it on a timer nobody asked
 * for would be spending an account's allowance on presence.
 */
export async function setOnline(client: Profiling, online: boolean): Promise<void> {
  await client.api.account.updateStatus({ offline: !online })
}

/**
 * Set or clear the emoji shown beside this account's name.
 *
 * Premium accounts only, which the server decides rather than this. Passing
 * nothing clears it.
 */
export async function setEmojiStatus(
  client: Profiling,
  status: TypeEmojiStatus | undefined,
): Promise<void> {
  await client.api.account.updateEmojiStatus({
    emoji_status: status ?? { _: 'emojiStatusEmpty' },
  })
}

/**
 * Publish a birthday on this account's profile, or take it down.
 *
 * The year is optional in the protocol and in life: an account may publish the
 * day without the year, which is what omitting it means.
 */
export async function setBirthday(
  client: Profiling,
  birthday: { readonly day: number; readonly month: number; readonly year?: number } | undefined,
): Promise<void> {
  await client.api.account.updateBirthday(
    birthday === undefined
      ? {}
      : {
          birthday: {
            _: 'birthday',
            day: birthday.day,
            month: birthday.month,
            ...(birthday.year === undefined ? {} : { year: birthday.year }),
          },
        },
  )
}

/**
 * Remove photos from this account's own profile.
 *
 * ```ts
 * for await (const photo of account.profilePhotos('me')) {
 *   if (tooOld(photo)) await deleteProfilePhotos(account, [photo])
 * }
 * ```
 *
 * Takes the photos themselves rather than identifiers, because that is what a
 * walk hands over and because naming one needs its access hash as well as its
 * number. Answers with how many the server actually removed, which can be fewer
 * than were asked for when one had already gone.
 */
export async function deleteProfilePhotos(
  client: Profiling,
  photos: readonly {
    readonly _: string
    readonly id: bigint
    readonly access_hash: bigint
    readonly file_reference: Uint8Array
  }[],
): Promise<number> {
  if (photos.length === 0) return 0

  const removed = await client.api.photos.deletePhotos({
    id: photos.map((photo) => ({
      _: 'inputPhoto' as const,
      id: photo.id,
      access_hash: photo.access_hash,
      file_reference: photo.file_reference,
    })),
  })

  return removed.length
}

/**
 * How long messages live by default in new conversations, in seconds.
 *
 * Zero means they do not expire, which is the ordinary state.
 */
export async function messageTtl(client: Profiling): Promise<number> {
  return await client.api.messages.getDefaultHistoryTTL().then((answer) => answer.period)
}

/** Set how long messages live by default in new conversations. Zero turns it off. */
export async function setMessageTtl(client: Profiling, seconds: number): Promise<void> {
  if (!Number.isInteger(seconds) || seconds < 0) {
    throw new ValidationError('a message lifetime is a whole number of seconds, or zero')
  }

  await client.api.messages.setDefaultHistoryTTL({ period: seconds })
}

// ---------------------------------------------------------------------------
// Who this account knows, and who it will hear from
// ---------------------------------------------------------------------------

/**
 * Read this account's contact list.
 *
 * ```ts
 * for (const contact of await readContacts(account)) console.log(contact.id)
 * ```
 *
 * Every user in the answer is written down on the way back, so somebody in the
 * list can be addressed afterwards without a lookup. The hash Telegram uses to
 * answer "nothing has changed" is not sent: this reads the list rather than
 * polling it, and a caller polling should hold the hash itself.
 */
export async function readContacts(client: Profiling): Promise<UserView[]> {
  const answer = await client.api.contacts.getContacts({ hash: 0n })

  if (answer._ === 'contacts.contactsNotModified') return []

  return answer.users.filter((user) => user._ === 'user').map((user) => new UserView(user))
}

/** Somebody to add to the contact list. */
export interface NewContact {
  /** Who. Resolved the way every other peer is. */
  readonly peer: string | PeerRef
  readonly firstName: string
  readonly lastName?: string
  /**
   * Their number, where this account knows it.
   *
   * Optional because adding somebody already reachable does not need one, and
   * an empty string is what the protocol expects in that case.
   */
  readonly phone?: string
  /** Let them see this account's own number. */
  readonly sharePhone?: boolean
}

/**
 * Add somebody to this account's contacts.
 *
 * ```ts
 * await addContact(account, { peer: '@someone', firstName: 'Ann' })
 * ```
 *
 * The name is this account's own label for them and does not change theirs.
 * Answers with the updates the change caused, which is how Telegram reports
 * what a contact change did.
 */
export async function addContact(client: Profiling, contact: NewContact): Promise<void> {
  await client.api.contacts.addContact({
    id: await asUser(client, contact.peer),
    first_name: contact.firstName,
    last_name: contact.lastName ?? '',
    phone: contact.phone ?? '',
    ...(contact.sharePhone === true ? { add_phone_privacy_exception: true } : {}),
  })
}

/** Somebody being added by number rather than by name. */
export interface PhoneContact {
  readonly phone: string
  readonly firstName: string
  readonly lastName?: string
}

/** What came of importing a list of numbers. */
export interface ImportOutcome {
  /** The users that were found and added. */
  readonly added: UserView[]
  /** Numbers the server asked to be tried again later. */
  readonly retry: bigint[]
}

/**
 * Add contacts by phone number.
 *
 * ```ts
 * const { added, retry } = await importContacts(account, [
 *   { phone: '+70000000000', firstName: 'Ann' },
 * ])
 * ```
 *
 * A number that belongs to nobody, or to somebody who has hidden it, is simply
 * absent from the result rather than an error — importing a list is a bulk
 * operation and one unusable entry is not a failure of the rest. Numbers the
 * server wants tried again come back separately, because retrying them is the
 * caller's decision about timing.
 *
 * Each entry needs a client-chosen identifier that the server echoes back so an
 * added user can be matched to the number that produced it. They are assigned
 * here, by position, because a caller has no reason to care.
 */
export async function importContacts(
  client: Profiling,
  contacts: readonly PhoneContact[],
): Promise<ImportOutcome> {
  if (contacts.length === 0) return { added: [], retry: [] }

  const answer = await client.api.contacts.importContacts({
    contacts: contacts.map((contact, index) => ({
      _: 'inputPhoneContact' as const,
      client_id: BigInt(index),
      phone: contact.phone,
      first_name: contact.firstName,
      last_name: contact.lastName ?? '',
    })),
  })

  return {
    added: answer.users.filter((user) => user._ === 'user').map((user) => new UserView(user)),
    retry: [...answer.retry_contacts],
  }
}

/**
 * Remove people from this account's contacts.
 *
 * Removing somebody is not blocking them: they can still reach this account,
 * and this account can still reach them. {@link block} is the other thing.
 */
export async function deleteContacts(
  client: Profiling,
  peers: readonly (string | PeerRef)[],
): Promise<void> {
  if (peers.length === 0) return

  const id: TypeInputUser[] = []
  for (const peer of peers) id.push(await asUser(client, peer))

  await client.api.contacts.deleteContacts({ id })
}

/**
 * Stop hearing from somebody.
 *
 * ```ts
 * await block(account, '@someone')
 * ```
 *
 * Takes a peer rather than a user, because a channel can be blocked as well as
 * a person. `storiesOnly` blocks their stories and leaves their messages alone,
 * which is a separate list Telegram keeps.
 */
export async function block(
  client: Profiling,
  peer: string | PeerRef,
  options: { readonly storiesOnly?: boolean } = {},
): Promise<boolean> {
  return await client.api.contacts.block({
    id: await client.resolve(peer),
    ...(options.storiesOnly === true ? { my_stories_from: true } : {}),
  })
}

/** Undo {@link block}. The same two lists, and the same choice between them. */
export async function unblock(
  client: Profiling,
  peer: string | PeerRef,
  options: { readonly storiesOnly?: boolean } = {},
): Promise<boolean> {
  return await client.api.contacts.unblock({
    id: await client.resolve(peer),
    ...(options.storiesOnly === true ? { my_stories_from: true } : {}),
  })
}

/**
 * Replace the set of people who see this account's close-friends stories.
 *
 * Replaces rather than adds: the call takes the whole list, so reading the
 * current one and sending it back with an addition is the caller's job. Said
 * plainly because sending one identifier here removes everybody else.
 */
export async function setCloseFriends(
  client: Profiling,
  peers: readonly (string | PeerRef)[],
): Promise<void> {
  const id: bigint[] = []

  for (const peer of peers) {
    const user = await asUser(client, peer)
    if (user._ !== 'inputUser') {
      throw new PeerError('a close friend has to be somebody this account can name by id')
    }

    id.push(user.user_id)
  }

  await client.api.contacts.editCloseFriends({ id })
}

/**
 * What Telegram suggests this account can do about a peer.
 *
 * Whether a "block" or "report spam" bar should be shown, whether the peer can
 * be added to contacts, whether this is a business bot — the server's own
 * advice about a conversation, which a client would otherwise have to guess at.
 */
export async function peerSettings(
  client: Profiling,
  peer: string | PeerRef,
): Promise<TypePeerSettings> {
  const answer = await client.api.messages.getPeerSettings({ peer: await client.resolve(peer) })

  return answer.settings
}

/**
 * Everybody this account has blocked.
 *
 * ```ts
 * for (const entry of await readBlocked(account)) console.log(entry.peer)
 * ```
 *
 * Counted into rather than keyed, so somebody blocked or unblocked mid-read
 * shifts every later position. The list is short enough in every case this is
 * asked for that a walk would be more machinery than it is worth.
 *
 * `storiesOnly` reads the separate list Telegram keeps for stories, which is
 * the same distinction {@link block} draws.
 */
export async function readBlocked(
  client: Profiling,
  options: {
    readonly offset?: number
    readonly limit?: number
    readonly storiesOnly?: boolean
  } = {},
): Promise<BlockedPeer[]> {
  const answer = await client.api.contacts.getBlocked({
    offset: options.offset ?? 0,
    limit: options.limit ?? 100,
    ...(options.storiesOnly === true ? { my_stories_from: true } : {}),
  })

  return answer.blocked.map((entry) => ({
    peer: peerRefOf(entry.peer_id),
    date: entry.date,
  }))
}

/** One entry in the blocked list. */
export interface BlockedPeer {
  /** Who, as a reference the account can resolve. */
  readonly peer: PeerRef | undefined
  /** When they were blocked, in Unix seconds. */
  readonly date: number
}

/**
 * Put a photo on this account's own profile.
 *
 * ```ts
 * await setProfilePhoto(account, { photo: await account.upload({ source }) })
 * ```
 *
 * Takes an uploaded file rather than doing the upload, for the reason every
 * other send does: what to upload, from where, and with what progress reporting
 * is the caller's, and an operation that swallowed it would have to grow every
 * option {@link Account.upload} already has.
 *
 * A video makes an animated profile photo, and `videoStart` says which second
 * of it is the still. `fallback` sets the photo shown to people who cannot see
 * the real one rather than replacing it.
 */
export async function setProfilePhoto(
  client: Profiling,
  options: {
    readonly photo?: UploadedFile
    readonly video?: UploadedFile
    readonly videoStart?: number
    readonly fallback?: boolean
  },
): Promise<Photo> {
  if (options.photo === undefined && options.video === undefined) {
    throw new ValidationError('a profile photo needs a photo or a video to be made from')
  }

  const answer = await client.api.photos.uploadProfilePhoto({
    ...(options.photo === undefined ? {} : { file: options.photo.file }),
    ...(options.video === undefined ? {} : { video: options.video.file }),
    ...(options.videoStart === undefined ? {} : { video_start_ts: options.videoStart }),
    ...(options.fallback === true ? { fallback: true } : {}),
  })

  if (answer.photo._ !== 'photo') {
    throw new ValidationError('the server accepted the photo and described none')
  }

  return answer.photo
}

/**
 * The music somebody has put on their profile.
 *
 * Counted into, like the profile photos, and for the same reason: the list is
 * ordered by the owner rather than by anything a cursor could name.
 */
export async function savedMusic(
  client: Profiling,
  peer: string | PeerRef,
  options: { readonly offset?: number; readonly limit?: number } = {},
): Promise<TypeDocument[]> {
  const answer = await client.api.users.getSavedMusic({
    id: await asUser(client, peer),
    offset: options.offset ?? 0,
    limit: options.limit ?? 100,
    hash: 0n,
  })

  if (answer._ === 'users.savedMusicNotModified') return []

  return [...answer.documents]
}

/**
 * Put a track on this account's profile, or take one off.
 *
 * `after` places it below a track already there; without one it goes to the
 * top. Takes the document itself, which is what a message carrying music hands
 * over.
 */
export async function saveMusic(
  client: Profiling,
  document: TypeInputDocument,
  options: { readonly remove?: boolean; readonly after?: TypeInputDocument } = {},
): Promise<void> {
  await client.api.account.saveMusic({
    id: document,
    ...(options.remove === true ? { unsave: true } : {}),
    ...(options.after === undefined ? {} : { after_id: options.after }),
  })
}

/**
 * Fetch one particular profile photo, by the identifier it carries.
 *
 * ```ts
 * const photo = await profilePhoto(account, '@someone', knownId)
 * ```
 *
 * Not the same as taking the first of {@link walkProfilePhotos}, which is
 * whichever is newest. This names one: a photo referred to somewhere else — a
 * stored identifier, a link, an older message — is fetched whether or not it is
 * still the current one.
 *
 * The request is the protocol's own way of asking for exactly one: start one
 * before the list and take a single entry at or below the identifier given.
 * Answers nothing where the account cannot see it, which is the same thing
 * Telegram says by returning an empty list.
 */
export async function profilePhoto(
  client: Profiling,
  peer: string | PeerRef,
  photoId: bigint,
): Promise<Photo | undefined> {
  const answer = await client.api.photos.getUserPhotos({
    user_id: await asUser(client, peer),
    offset: -1,
    limit: 1,
    max_id: photoId,
  })

  const [first] = answer.photos

  return first?._ === 'photo' ? first : undefined
}

/**
 * Whether this account can name a peer without asking Telegram.
 *
 * ```ts
 * if (await knows(account, '@someone')) await account.sendText('@someone', 'hi')
 * ```
 *
 * A question about what is already written down, answered from the account's
 * own peer store and reaching no network. That is the difference from
 * {@link Profiling.resolve}, which will go and ask — so a caller deciding
 * whether an operation is free has to ask this rather than catching a failure
 * from that.
 *
 * `'me'` and `'self'` are always known: an account can always name itself.
 */
export async function knows(peers: PeerStore, peer: string | PeerRef): Promise<boolean> {
  if (typeof peer !== 'string') {
    return (await peers.byId(peer.kind, peer.id)) !== undefined
  }

  const name = peer.trim()
  if (name === 'me' || name === 'self') return true

  const bare = name.replace(/^[@+]/, '')
  if (bare === '') return false

  if (/^\d+$/.test(bare)) return (await peers.byPhone(bare)) !== undefined

  return (await peers.byUsername(bare)) !== undefined
}

/**
 * The username this account answers to, from what is already written down.
 *
 * ```ts
 * const name = await myUsername(account)
 * ```
 *
 * Reaches no network. An account writes itself down the first time it reads
 * itself, so this answers after any call that described this account and
 * answers nothing before one — which is the honest shape for a question about
 * local state, and the reason it is not spelled as a call that would go and
 * find out. {@link whoAmI} is the one that asks.
 */
export async function myUsername(
  peers: PeerStore,
  selfId: bigint | undefined,
): Promise<string | undefined> {
  if (selfId === undefined) return undefined

  const self = await peers.byId('user', selfId)

  // The first is the one Telegram treats as primary; the rest are the
  // additional names a channel or a premium account may also answer to.
  return self?.usernames[0]
}

/**
 * Set or clear the private note this account keeps against a contact.
 *
 * ```ts
 * await setContactNote(account, '@someone', 'met at the conference')
 * ```
 *
 * The note is this account's own and nobody else sees it. Passing nothing
 * clears it, which the protocol spells as empty text rather than as an absent
 * field — so "no note" and "a note that is empty" are the same state, and this
 * does not pretend otherwise.
 */
export async function setContactNote(
  client: Profiling,
  peer: string | PeerRef,
  note: string | undefined,
): Promise<void> {
  await client.api.contacts.updateContactNote({
    id: await asUser(client, peer),
    note: { _: 'textWithEntities', text: note ?? '', entities: [] },
  })
}

/**
 * Resolve several peers at once.
 *
 * ```ts
 * const [ann, bob] = await resolveMany(account, ['@ann', '@bob'])
 * ```
 *
 * **Positional.** The result is as long as the input and in the same order, so
 * a caller can zip the two. A peer this account cannot name answers `undefined`
 * in its place rather than collapsing the list — a shorter array would silently
 * shift every later entry onto the wrong name.
 *
 * **Bounded.** Eight at a time. Resolving a name this account has not seen is a
 * request, and a list of two hundred would otherwise be two hundred at once
 * against an account Telegram is willing to limit.
 *
 * **Each distinct peer is resolved once.** A list naming the same peer twice
 * makes one request and fills both positions, which matters because a caller
 * assembling a list from messages has duplicates by construction.
 *
 * Only "this account cannot name it" becomes `undefined`. Anything else — a
 * flood wait, a connection that ended — is the caller's to see, because
 * swallowing it would turn a failure into an absence and a retry into a gap.
 */
export async function resolveMany(
  client: Profiling,
  peers: readonly (string | PeerRef)[],
): Promise<(TypeInputPeer | undefined)[]> {
  const resolved = new Map<string, Promise<TypeInputPeer | undefined>>()
  const answers: (TypeInputPeer | undefined)[] = Array.from({ length: peers.length })
  const pending: number[] = []

  const keyOf = (peer: string | PeerRef) =>
    typeof peer === 'string' ? `n:${peer}` : `r:${peer.kind}:${peer.id}`

  const once = (peer: string | PeerRef): Promise<TypeInputPeer | undefined> => {
    const key = keyOf(peer)
    let running = resolved.get(key)

    if (running === undefined) {
      running = client.resolve(peer).catch((error: unknown) => {
        if (error instanceof PeerError) return undefined

        throw error
      })
      resolved.set(key, running)
    }

    return running
  }

  for (let index = 0; index < peers.length; index += 1) pending.push(index)

  const workers = Array.from({ length: Math.min(RESOLVE_AT_ONCE, pending.length) }, async () => {
    for (;;) {
      const index = pending.shift()
      if (index === undefined) return

      answers[index] = await once(peers[index] as string | PeerRef)
    }
  })

  await Promise.all(workers)

  return answers
}

/** How many resolutions travel at once. */
const RESOLVE_AT_ONCE = 8
