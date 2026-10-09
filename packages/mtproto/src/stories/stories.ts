// SPDX-License-Identifier: MPL-2.0

/**
 * Posting, changing and reading stories.
 *
 * A story is a post that expires. It belongs to a peer rather than to a
 * conversation, it is numbered within that peer, and unless it is pinned to the
 * profile it stops existing after its period — which is why almost every call
 * here names *both* a peer and a story number, and why "delete" and "expire"
 * are different things.
 *
 * ```
 *   stories.sendStory ──> a story ──┬─ expires after `period`
 *                                   ├─ pinned    ──> stays on the profile
 *                                   └─ archived  ──> off the profile, kept
 * ```
 *
 * **Who may see it is part of posting it, not a setting afterwards.** Telegram
 * takes privacy rules with the story, and a story sent with none is visible to
 * everyone — so {@link postStory} sends "everyone" explicitly rather than
 * leaving the field out, because leaving it out is a request the server
 * refuses, and because a story whose audience was not decided should not be
 * posted at all.
 *
 * **Reading is three different questions.** Who a peer's current stories are
 * ({@link peerStories}), what particular stories say ({@link fetchStories}) and
 * how a story of this account's own has been received
 * ({@link storyInteractions}) are separate calls with separate limits, and the
 * last one is only answerable for stories this account posted.
 *
 * **Viewing is reported, not inferred.** Telegram counts a view when a client
 * says there was one, so {@link markStoriesSeen} and {@link countStoryViews}
 * exist and are deliberate. Stealth mode ({@link hideMyViews}) is the opposite
 * — a period during which this account's views are not reported at all.
 */

import { ValidationError } from '@yuigram/core'
import { applyUpdates, type Chatting } from '../chats/common.js'
import { PeerStoriesView, StoryView } from '../entities/story.js'
import type { FormattedText } from '../format/text.js'
import type {
  TypeInputMedia,
  TypeInputPrivacyRule,
  TypeMediaArea,
  TypeReaction,
  TypeStoriesStealthMode,
  TypeStoryItem,
  TypeStoryViews,
} from '../generated/api/types/index.js'
import type { PeerRef } from '../normalize/normalize.js'
import { randomId } from '../normalize/sent.js'

/** What a story operation needs: the `chats` context plus a deduplication key. */
export interface Storying extends Chatting {
  /** Bytes for the deduplication key a post carries. */
  random(length: number): Uint8Array
}

/** Everyone, which is what a story with no rules of its own reaches. */
const EVERYONE: readonly TypeInputPrivacyRule[] = [{ _: 'inputPrivacyValueAllowAll' }]

/** A caption: plain text, or text whose formatting has been worked out. */
export type StoryCaption = string | FormattedText

/** Split a caption into the two fields a request carries. */
function captionOf(caption: StoryCaption | undefined) {
  if (caption === undefined) return {}
  if (typeof caption === 'string') return { caption }

  return {
    caption: caption.text,
    ...(caption.entities.length === 0 ? {} : { entities: caption.entities }),
  }
}

/** How a story is posted. */
export interface NewStory {
  /** The photo or video, built by the helpers in `files/`. */
  readonly media: TypeInputMedia
  /** Words under it. */
  readonly caption?: StoryCaption
  /**
   * Who may see it. Everyone, when not said.
   *
   * Sent explicitly either way: the request requires the field, and a story
   * whose audience was never decided is not a story that should be posted.
   */
  readonly audience?: readonly TypeInputPrivacyRule[]
  /** Keep it on the profile after it expires. */
  readonly pinned?: boolean
  /** Refuse forwarding and saving of it. */
  readonly protectContent?: boolean
  /** How long it lasts, in seconds. Telegram's default when not said. */
  readonly period?: number
  /** Clickable regions laid over it — a location, a poll, a link. */
  readonly areas?: readonly TypeMediaArea[]
  /** Profile albums to file it under. */
  readonly albums?: readonly number[]
}

/**
 * Post a story.
 *
 * ```ts
 * const story = await postStory(account, { media, caption: 'hello' })
 * console.log(story.id, story.expiresAt)
 * ```
 *
 * Posted as this account unless `peer` names somewhere else — a channel this
 * account may post stories to. Answered with the story itself, read out of the
 * updates the post produced, so nothing has to be fetched to learn its number
 * or when it expires.
 */
export async function postStory(
  client: Storying,
  story: NewStory,
  peer: string | PeerRef = 'me',
): Promise<StoryView> {
  const answer = await client.api.stories.sendStory({
    peer: await client.resolve(peer),
    media: story.media,
    privacy_rules: story.audience ?? EVERYONE,
    random_id: randomId((length) => client.random(length)),
    ...captionOf(story.caption),
    ...(story.areas === undefined ? {} : { media_areas: story.areas }),
    ...(story.albums === undefined ? {} : { albums: story.albums }),
    ...(story.period === undefined ? {} : { period: story.period }),
    ...(story.pinned === true ? { pinned: true } : {}),
    ...(story.protectContent === true ? { noforwards: true } : {}),
  })

  await applyUpdates(client, answer)

  return storyIn(answer, 'posting a story')
}

/** What about a story is being changed. Anything left out is left alone. */
export interface StoryEdit {
  /** Replace the photo or video. */
  readonly media?: TypeInputMedia
  /** Replace the words under it. */
  readonly caption?: StoryCaption
  /** Replace who may see it. */
  readonly audience?: readonly TypeInputPrivacyRule[]
  /** Replace the clickable regions laid over it. */
  readonly areas?: readonly TypeMediaArea[]
}

/**
 * Change a story that is already posted.
 *
 * ```ts
 * await editStory(account, 7, { caption: 'hello again' })
 * ```
 *
 * Only what is given changes. Unlike posting, the audience is left alone when
 * omitted rather than reset to everyone — an edit that quietly widened who
 * could see a story would be the worst kind of surprise.
 */
export async function editStory(
  client: Storying,
  id: number,
  edit: StoryEdit,
  peer: string | PeerRef = 'me',
): Promise<StoryView> {
  if (Object.values(edit).every((value) => value === undefined)) {
    throw new ValidationError('editing a story needs something to change')
  }

  const answer = await client.api.stories.editStory({
    peer: await client.resolve(peer),
    id,
    ...(edit.media === undefined ? {} : { media: edit.media }),
    ...captionOf(edit.caption),
    ...(edit.audience === undefined ? {} : { privacy_rules: edit.audience }),
    ...(edit.areas === undefined ? {} : { media_areas: edit.areas }),
  })

  await applyUpdates(client, answer)

  return storyIn(answer, 'editing a story')
}

/**
 * Take stories down.
 *
 * ```ts
 * const gone = await deleteStories(account, [7, 8])
 * ```
 *
 * Answers the numbers Telegram actually removed, which is not necessarily what
 * was asked for: a story already expired or already deleted is not in the
 * answer, and that is how a caller finds out.
 */
export async function deleteStories(
  client: Storying,
  ids: readonly number[],
  peer: string | PeerRef = 'me',
): Promise<number[]> {
  if (ids.length === 0) return []

  const answer = await client.api.stories.deleteStories({
    peer: await client.resolve(peer),
    id: [...ids],
  })

  return [...answer]
}

/**
 * Pin stories to a profile, or unpin them.
 *
 * ```ts
 * await setStoriesPinned(account, [7], true)
 * ```
 *
 * A pinned story stays on the profile after its period rather than expiring,
 * which is the difference between a story and a post.
 */
export async function setStoriesPinned(
  client: Storying,
  ids: readonly number[],
  pinned: boolean,
  peer: string | PeerRef = 'me',
): Promise<number[]> {
  if (ids.length === 0) return []

  const answer = await client.api.stories.togglePinned({
    peer: await client.resolve(peer),
    id: [...ids],
    pinned,
  })

  return [...answer]
}

/**
 * Hide a peer's stories from the list at the top, or show them again.
 *
 * ```ts
 * await setPeerStoriesArchived(account, '@noisy', true)
 * ```
 *
 * About this account's view of somebody else, not about their stories: it moves
 * them into the archived row. Nothing is told to the peer.
 */
export async function setPeerStoriesArchived(
  client: Storying,
  peer: string | PeerRef,
  archived: boolean,
): Promise<void> {
  const done = await client.api.stories.togglePeerStoriesHidden({
    peer: await client.resolve(peer),
    hidden: archived,
  })

  if (!done) throw new ValidationError('Telegram declined to change the archived state')
}

/** What kind of reaction is being sent. Undefined takes an existing one back. */
export type StoryReaction = string | bigint | undefined

/** Turn what a caller said into the reaction the call carries. */
function reactionOf(reaction: StoryReaction): TypeReaction {
  if (reaction === undefined) return { _: 'reactionEmpty' }
  if (typeof reaction === 'string') return { _: 'reactionEmoji', emoticon: reaction }

  return { _: 'reactionCustomEmoji', document_id: reaction }
}

/**
 * React to a story, or take a reaction back.
 *
 * ```ts
 * await reactToStory(account, '@someone', 7, '❤️')
 * await reactToStory(account, '@someone', 7, undefined) // takes it back
 * ```
 *
 * `addToRecent` puts the emoji in the account's recently-used list, which is a
 * visible change to the account's own state and so is opt-in.
 */
export async function reactToStory(
  client: Storying,
  peer: string | PeerRef,
  id: number,
  reaction: StoryReaction,
  options?: { readonly addToRecent?: boolean },
): Promise<void> {
  const answer = await client.api.stories.sendReaction({
    peer: await client.resolve(peer),
    story_id: id,
    reaction: reactionOf(reaction),
    ...(options?.addToRecent === true ? { add_to_recent: true } : {}),
  })

  await applyUpdates(client, answer)
}

/**
 * Mark a peer's stories read, up to and including one.
 *
 * ```ts
 * await markStoriesSeen(account, '@someone', 12)
 * ```
 *
 * Answers the numbers that were newly marked. Reading is a horizon rather than
 * a per-story flag — everything up to the number given is read — which is why
 * this takes one number and not a list.
 */
export async function markStoriesSeen(
  client: Storying,
  peer: string | PeerRef,
  upTo: number,
): Promise<number[]> {
  const answer = await client.api.stories.readStories({
    peer: await client.resolve(peer),
    max_id: upTo,
  })

  return [...answer]
}

/**
 * Report that stories were actually looked at.
 *
 * ```ts
 * await countStoryViews(account, '@someone', [11, 12])
 * ```
 *
 * A view is counted when a client says there was one, so this is deliberate
 * rather than a side effect of fetching. Separate from {@link markStoriesSeen}
 * because being read and being viewed are different things to Telegram: one
 * moves the horizon, the other increments a counter the poster sees.
 */
export async function countStoryViews(
  client: Storying,
  peer: string | PeerRef,
  ids: readonly number[],
): Promise<void> {
  if (ids.length === 0) return

  const done = await client.api.stories.incrementStoryViews({
    peer: await client.resolve(peer),
    id: [...ids],
  })

  if (!done) throw new ValidationError('Telegram declined to count the views')
}

/**
 * Stop reporting this account's story views for a while.
 *
 * ```ts
 * const stealth = await hideMyViews(account)
 * console.log(stealth.active_until_date)
 * ```
 *
 * Stealth mode covers a window rather than a story: `past` hides views already
 * made in the last few minutes, `future` hides ones made in the next half hour,
 * and both are on unless said otherwise. Answers the window Telegram settled
 * on, because the durations are the server's and not this client's to assume.
 */
export async function hideMyViews(
  client: Storying,
  options?: { readonly past?: boolean; readonly future?: boolean },
): Promise<TypeStoriesStealthMode> {
  const answer = await client.api.stories.activateStealthMode({
    ...(options?.past === false ? {} : { past: true }),
    ...(options?.future === false ? {} : { future: true }),
  })

  await applyUpdates(client, answer)

  const mode = stealthIn(answer)
  if (mode === undefined) {
    throw new ValidationError('Telegram did not say what stealth window it settled on')
  }

  return mode
}

/** Find the stealth window in the updates the call answered with. */
function stealthIn(answer: unknown): TypeStoriesStealthMode | undefined {
  for (const update of updatesOf(answer)) {
    if (update['_'] !== 'updateStoriesStealthMode') continue

    const mode = update['stealth_mode']
    if (typeof mode === 'object' && mode !== null) return mode as TypeStoriesStealthMode
  }

  return undefined
}

/** The updates an answer carried, whatever shape of container it was. */
function updatesOf(answer: unknown): readonly Record<string, unknown>[] {
  if (typeof answer !== 'object' || answer === null) return []

  const carried = (answer as Record<string, unknown>)['updates']

  return Array.isArray(carried) ? (carried as Record<string, unknown>[]) : []
}

/**
 * Read particular stories by number.
 *
 * ```ts
 * const [first] = await fetchStories(account, '@someone', [7])
 * ```
 *
 * Positional, with a gap where a story has expired, was deleted, or is not
 * visible to this account. Telegram answers those as a placeholder naming the
 * number and nothing else, which is reported as absent rather than as a story
 * with no content.
 */
export async function fetchStories(
  client: Storying,
  peer: string | PeerRef,
  ids: readonly number[],
): Promise<(StoryView | undefined)[]> {
  if (ids.length === 0) return []

  const answer = await client.api.stories.getStoriesByID({
    peer: await client.resolve(peer),
    id: [...ids],
  })

  const found = new Map<number, StoryView>()
  for (const item of answer.stories) {
    if (item._ === 'storyItem') found.set(item.id, new StoryView(item))
  }

  return ids.map((id) => found.get(id))
}

/**
 * Read a peer's current stories.
 *
 * ```ts
 * const theirs = await peerStories(account, '@someone')
 * for (const story of theirs.stories) console.log(story.caption)
 * ```
 *
 * The ones that have not expired, together with how far this account has read.
 * A peer's *profile* stories — the pinned ones, which outlive their period —
 * are a different list and a different walk.
 */
export async function peerStories(
  client: Storying,
  peer: string | PeerRef,
): Promise<PeerStoriesView> {
  const answer = await client.api.stories.getPeerStories({
    peer: await client.resolve(peer),
  })

  return new PeerStoriesView(answer.stories)
}

/**
 * Read how stories of this account's own have been received.
 *
 * ```ts
 * const [views] = await storyInteractions(account, [7])
 * console.log(views?.views_count, views?.reactions_count)
 * ```
 *
 * Only answerable for stories the named peer posted — the counts and the recent
 * viewers are the poster's to see. Positional, with a gap where Telegram
 * returned nothing for a number.
 */
export async function storyInteractions(
  client: Storying,
  ids: readonly number[],
  peer: string | PeerRef = 'me',
): Promise<(TypeStoryViews | undefined)[]> {
  if (ids.length === 0) return []

  const answer = await client.api.stories.getStoriesViews({
    peer: await client.resolve(peer),
    id: [...ids],
  })

  return ids.map((_, at) => answer.views[at])
}

/**
 * A link to a story, for sharing it outside Telegram.
 *
 * ```ts
 * const link = await storyLink(account, '@someone', 7)
 * ```
 *
 * Only exists for a story on a public profile: a private account's stories have
 * no address outside the app, and asking is refused rather than answered with
 * something that will not open.
 */
export async function storyLink(
  client: Storying,
  peer: string | PeerRef,
  id: number,
): Promise<string> {
  const answer = await client.api.stories.exportStoryLink({
    peer: await client.resolve(peer),
    id,
  })

  return answer.link
}

/** Why an account may not post a story somewhere, or how many it may still post. */
export type StoryAllowance =
  | { readonly allowed: true; readonly remaining: number }
  | { readonly allowed: false; readonly because: 'not-an-admin' | 'needs-boosts' }

/**
 * Ask whether a story may be posted somewhere, before building one.
 *
 * ```ts
 * const may = await canPostStory(account, '@channel')
 * if (may.allowed) console.log(`${may.remaining} left today`)
 * ```
 *
 * Two kinds of no, and they mean different things to whoever is asking: not
 * being an administrator is a permission problem, and a channel short of boosts
 * is a subscriber problem that somebody else can solve. Both are answers rather
 * than failures, because "can I" is a question whose answer can be no.
 *
 * Anything else the server raises travels: a flood wait is not a no, it is a
 * "not yet", and swallowing it would turn a delay into a permanent refusal.
 */
export async function canPostStory(
  client: Storying,
  peer: string | PeerRef = 'me',
): Promise<StoryAllowance> {
  try {
    const answer = await client.api.stories.canSendStory({
      peer: await client.resolve(peer),
    })

    return { allowed: true, remaining: answer.count_remains }
  } catch (error) {
    const because = refusalOf(error)
    if (because === undefined) throw error

    return { allowed: false, because }
  }
}

/** Which of the two refusals this is, where it is one of them. */
function refusalOf(error: unknown): 'not-an-admin' | 'needs-boosts' | undefined {
  const message = error instanceof Error ? error.message : ''

  if (message.startsWith('CHAT_ADMIN_REQUIRED')) return 'not-an-admin'
  if (message.startsWith('BOOSTS_REQUIRED')) return 'needs-boosts'

  return undefined
}

/**
 * Find the story in the updates a post or an edit answered with.
 *
 * Refused rather than invented where it is not there. A story assembled from
 * what was sent would be one the server never wrote down — wrong about its
 * number, its expiry and whatever Telegram decided differently.
 */
function storyIn(answer: unknown, what: string): StoryView {
  for (const update of updatesOf(answer)) {
    if (update['_'] !== 'updateStory') continue

    const story = update['story']
    if (typeof story !== 'object' || story === null) continue
    if ((story as Record<string, unknown>)['_'] !== 'storyItem') continue

    return new StoryView(story as TypeStoryItem)
  }

  throw new ValidationError(`${what} was answered without the story itself`)
}

/** Named so a caller can build an audience without reaching for the schema. */
export const STORY_AUDIENCE = {
  /** Anybody who can see the profile. */
  everyone: (): TypeInputPrivacyRule[] => [{ _: 'inputPrivacyValueAllowAll' }],
  /** Only this account's contacts. */
  contacts: (): TypeInputPrivacyRule[] => [{ _: 'inputPrivacyValueAllowContacts' }],
  /** Only the contacts marked as close friends. */
  closeFriends: (): TypeInputPrivacyRule[] => [{ _: 'inputPrivacyValueAllowCloseFriends' }],
} as const
