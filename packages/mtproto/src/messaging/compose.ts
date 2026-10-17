// SPDX-License-Identifier: MIT

/**
 * Sends that are several messages, or several steps.
 *
 * Loaded when one of them is called. Everything here ends in the same requests
 * `send.ts` makes and resolves where a message goes the same way — through
 * {@link targetOf} — so a quote, a topic or a comment means one thing whether a
 * message is sent, copied or sent as an album.
 *
 * ```
 *   album    prepare each medium ──> one sendMultiMedia, one key per item
 *   copy     read the message ──> rebuild what it carries ──> an ordinary send
 *   comment  find the post's thread ──> send into the discussion group
 * ```
 *
 * **A copy is not a forward.** A forward keeps the message as the server holds
 * it and can only leave its author or captions off. A copy reads the message
 * and sends what it carries as a new message, which is what lets its caption
 * change and its buttons be chosen — and why a copy of a dice rolls again and a
 * copy of a poll starts with no votes.
 */

import { PeerError, ValidationError } from '@yuigram/core'
import { MessageView } from '../entities/message.js'
import { documentMedia, photoMedia } from '../files/media.js'
import { isStaleReference } from '../files/references.js'
import type {
  TypeGeoPoint,
  TypeInputGeoPoint,
  TypeInputMedia,
  TypeInputPeer,
  TypeInputPhoto,
  TypeMessage,
  TypeMessageMedia,
  TypePollAnswer,
} from '../generated/api/types/index.js'
import { channelFor } from '../network/peers.js'
import { type PeerRef, peerRefOf } from '../normalize/normalize.js'
import { type SentMessage, sentMessage } from '../normalize/sent.js'
import type { TlValue } from '../tl/index.js'
import {
  bodyOf,
  flagsOf,
  getMessages,
  keyFor,
  type MessageBody,
  replyHeader,
  type Sending,
  type SendOptions,
  sendMediaTo,
  sendTextTo,
  type Target,
  targetOf,
} from './send.js'

/** The most items one album holds. */
const MAX_ALBUM = 10

/** Input media that name bytes rather than a file Telegram already holds. */
const NOT_YET_STORED: ReadonlySet<string> = new Set([
  'inputMediaUploadedPhoto',
  'inputMediaUploadedDocument',
  'inputMediaPhotoExternal',
  'inputMediaDocumentExternal',
])

function stopIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError')
  }
}

/* -------------------------------------------------------------------------- */
/* Albums                                                                      */
/* -------------------------------------------------------------------------- */

/** One item of an album: what it shows, and its own caption. */
export interface AlbumItem {
  readonly media: TypeInputMedia
  readonly caption?: MessageBody
}

/** How to send an album. An album carries no buttons and no link preview. */
export interface AlbumOptions extends Omit<SendOptions, 'markup' | 'noWebpagePreview'> {
  /** Stop before the next step: an item prepared, or the album sent. */
  readonly signal?: AbortSignal
}

/**
 * Hand media to Telegram so it can be sent by reference, without sending it.
 *
 * Uploaded bytes and external URLs become the photo or document Telegram stored,
 * with the spoiler, self-destruct timer and video cover the original asked for.
 * Media Telegram already holds is returned as it is. An album needs this for
 * every item, because Telegram does not accept bytes inside one.
 */
export async function uploadMedia(
  client: Sending,
  peer: string | PeerRef,
  media: TypeInputMedia,
): Promise<TypeInputMedia> {
  return await storeMedia(client, await client.resolve(peer), media)
}

/**
 * The stored form of media, handing it to Telegram first where it is bytes.
 *
 * Takes the calling client's api alone, because storing media needs no
 * deduplication key and no peer resolution: the families that set a profile or
 * an intro from a file need exactly this step.
 */
export async function storeMedia(
  client: Pick<Sending, 'api'>,
  peer: TypeInputPeer,
  media: TypeInputMedia,
): Promise<TypeInputMedia> {
  if (!NOT_YET_STORED.has(media._)) return media

  const answer = await client.api.messages.uploadMedia({ peer, media })

  return byReference(answer, media)
}

/** The stored form of media just handed over, keeping what the original asked for. */
function byReference(answer: TypeMessageMedia, original: TypeInputMedia): TypeInputMedia {
  const asked = original as {
    readonly spoiler?: true
    readonly ttl_seconds?: number
    readonly video_cover?: TypeInputPhoto
    readonly video_timestamp?: number
  }
  const common = {
    ...(asked.spoiler === true ? { spoiler: true as const } : {}),
    ...(asked.ttl_seconds === undefined ? {} : { ttl_seconds: asked.ttl_seconds }),
  }

  if (answer._ === 'messageMediaPhoto' && answer.photo?._ === 'photo') {
    return { ...photoMedia(answer.photo), ...common } as TypeInputMedia
  }

  if (answer._ === 'messageMediaDocument' && answer.document?._ === 'document') {
    return {
      ...documentMedia(answer.document),
      ...common,
      ...(asked.video_cover === undefined ? {} : { video_cover: asked.video_cover }),
      ...(asked.video_timestamp === undefined ? {} : { video_timestamp: asked.video_timestamp }),
    } as TypeInputMedia
  }

  throw new ValidationError(
    `Telegram stored the media as '${answer._}', which names no file to send`,
  )
}

/**
 * Send several media as one album.
 *
 * ```ts
 * await account.sendAlbum(chat, [
 *   { media: uploadedPhoto(first), caption: 'before' },
 *   { media: uploadedPhoto(second), caption: 'after' },
 * ])
 * ```
 *
 * One answer per item, in the order given, each matched by its own key. The
 * album is sent whole or not at all; items prepared before a failure or an
 * abort are stored on Telegram and sent nowhere. Which kinds may share an
 * album — photos with videos, documents with documents, audio with audio — is
 * Telegram's rule and is refused there.
 */
export async function sendAlbum(
  client: Sending,
  peer: string | PeerRef,
  items: readonly AlbumItem[],
  options?: AlbumOptions,
): Promise<readonly SentMessage[]> {
  checkAlbum(items.length, options)

  return await sendAlbumTo(client, await targetOf(client, peer, options), items, options)
}

function checkAlbum(count: number, options: AlbumOptions | undefined): void {
  if (count === 0 || count > MAX_ALBUM) {
    throw new ValidationError(`an album holds 1 to ${MAX_ALBUM} items, not ${count}`)
  }
  if ((options as SendOptions | undefined)?.markup !== undefined) {
    throw new ValidationError('an album cannot carry buttons')
  }
}

async function sendAlbumTo(
  client: Sending,
  target: Target,
  items: readonly AlbumItem[],
  options: AlbumOptions | undefined,
): Promise<readonly SentMessage[]> {
  const prepared: TypeInputMedia[] = []
  for (const item of items) {
    stopIfAborted(options?.signal)
    prepared.push(await storeMedia(client, target.peer, item.media))
  }
  stopIfAborted(options?.signal)

  const keys = items.map(() => keyFor(client))
  const answer = await client.api.messages.sendMultiMedia({
    peer: target.peer,
    multi_media: prepared.map((media, index) => {
      const { message, entities } = bodyOf(items[index]?.caption ?? '')

      return {
        _: 'inputSingleMedia' as const,
        media,
        random_id: keys[index] as bigint,
        message,
        ...(entities === undefined ? {} : { entities }),
      }
    }),
    ...(target.reply === undefined ? {} : { reply_to: target.reply }),
    ...flagsOf(options),
  })

  return keys.map((key) => sentMessage(answer, key))
}

/* -------------------------------------------------------------------------- */
/* Copies                                                                      */
/* -------------------------------------------------------------------------- */

/** How to copy a message. */
export interface CopyOptions extends SendOptions {
  /**
   * A caption instead of the original one, for a message with media. An empty
   * caption removes it.
   */
  readonly caption?: MessageBody
}

/** What a message carries, rebuilt as something that can be sent. */
type Rebuilt =
  | { readonly kind: 'text'; readonly body: MessageBody; readonly preview: boolean }
  | { readonly kind: 'media'; readonly media: TypeInputMedia; readonly body: MessageBody }

/** Media no copy can carry, and why. */
const UNCOPYABLE: Readonly<Record<string, string>> = {
  messageMediaInvoice: 'an invoice belongs to the bot that issued it',
  messageMediaGiveaway: 'a giveaway is run by the channel that started it',
  messageMediaGiveawayResults: 'giveaway results belong to the giveaway',
  messageMediaPaidMedia: 'paid media is bought, not copied',
  messageMediaUnsupported: 'this client cannot read what the message carries',
  messageMediaVideoStream: 'a live stream belongs to its conversation',
}

/** The message's text with its formatting, as a body. */
function bodyFrom(view: MessageView): MessageBody {
  const text = view.text ?? ''
  const entities = view.entities ?? []

  return entities.length === 0 ? text : { text, entities }
}

function inputGeo(geo: TypeGeoPoint): TypeInputGeoPoint {
  if (geo._ !== 'geoPoint') throw new ValidationError('the message names no location to copy')

  return {
    _: 'inputGeoPoint',
    lat: geo.lat,
    long: geo.long,
    ...(geo.accuracy_radius === undefined ? {} : { accuracy_radius: geo.accuracy_radius }),
  }
}

/** Read a message into what a copy sends. */
async function rebuild(client: Sending, view: MessageView): Promise<Rebuilt> {
  if (view.isEmpty) {
    throw new ValidationError(`message ${view.id} does not exist or this account cannot see it`)
  }
  if (view.isService) throw new ValidationError('a service message cannot be copied')
  if (view.isContentProtected) {
    throw new ValidationError('the conversation protects its content from being copied')
  }

  const body = bodyFrom(view)
  const media = view.media?.raw

  if (media === undefined || media._ === 'messageMediaEmpty') {
    return { kind: 'text', body, preview: false }
  }
  // The preview is Telegram's reading of a link in the text, and it reads the
  // copy's text the same way.
  if (media._ === 'messageMediaWebPage') return { kind: 'text', body, preview: true }

  const reason = UNCOPYABLE[media._]
  if (reason !== undefined) throw new ValidationError(`the message cannot be copied: ${reason}`)

  return { kind: 'media', media: await inputMediaOf(client, media), body }
}

/** The input media that sends again what a message carries. */
async function inputMediaOf(client: Sending, media: TypeMessageMedia): Promise<TypeInputMedia> {
  switch (media._) {
    case 'messageMediaPhoto':
      if (media.photo?._ !== 'photo') {
        throw new ValidationError(
          'the photo is no longer available, as a self-destructing one is not',
        )
      }

      return {
        ...photoMedia(media.photo),
        ...(media.spoiler === true ? { spoiler: true as const } : {}),
        ...(media.ttl_seconds === undefined ? {} : { ttl_seconds: media.ttl_seconds }),
      } as TypeInputMedia

    case 'messageMediaDocument':
      return documentOf(media)

    case 'messageMediaGeo':
      return { _: 'inputMediaGeoPoint', geo_point: inputGeo(media.geo) }

    case 'messageMediaGeoLive':
      return {
        _: 'inputMediaGeoLive',
        geo_point: inputGeo(media.geo),
        period: media.period,
        ...(media.heading === undefined ? {} : { heading: media.heading }),
        ...(media.proximity_notification_radius === undefined
          ? {}
          : { proximity_notification_radius: media.proximity_notification_radius }),
      }

    case 'messageMediaVenue':
      return {
        _: 'inputMediaVenue',
        geo_point: inputGeo(media.geo),
        title: media.title,
        address: media.address,
        provider: media.provider,
        venue_id: media.venue_id,
        venue_type: media.venue_type,
      }

    case 'messageMediaContact':
      return {
        _: 'inputMediaContact',
        phone_number: media.phone_number,
        first_name: media.first_name,
        last_name: media.last_name,
        vcard: media.vcard,
      }

    case 'messageMediaDice':
      return { _: 'inputMediaDice', emoticon: media.emoticon }

    case 'messageMediaPoll':
      return await pollOf(client, media)

    case 'messageMediaToDo':
      // A copy of a checklist starts with nothing ticked.
      return { _: 'inputMediaTodo', todo: media.todo }

    case 'messageMediaStory': {
      const peer = peerRefOf(media.peer)
      if (peer === undefined) throw new ValidationError('the story names no peer to copy it from')

      return { _: 'inputMediaStory', peer: await client.resolve(peer), id: media.id }
    }

    case 'messageMediaGame':
      if (media.game._ !== 'game') throw new ValidationError('the game is not described')

      return {
        _: 'inputMediaGame',
        id: { _: 'inputGameID', id: media.game.id, access_hash: media.game.access_hash },
      }

    default:
      throw new ValidationError(`a message carrying '${media._}' cannot be copied`)
  }
}

function documentOf(
  media: Extract<TypeMessageMedia, { _: 'messageMediaDocument' }>,
): TypeInputMedia {
  if (media.document?._ !== 'document') {
    throw new ValidationError(
      'the document is no longer available, as a self-destructing one is not',
    )
  }

  const cover = media.video_cover
  return {
    ...documentMedia(media.document),
    ...(media.spoiler === true ? { spoiler: true as const } : {}),
    ...(media.ttl_seconds === undefined ? {} : { ttl_seconds: media.ttl_seconds }),
    ...(media.video_timestamp === undefined ? {} : { video_timestamp: media.video_timestamp }),
    ...(cover?._ === 'photo'
      ? {
          video_cover: {
            _: 'inputPhoto' as const,
            id: cover.id,
            access_hash: cover.access_hash,
            file_reference: cover.file_reference,
          },
        }
      : {}),
  } as TypeInputMedia
}

/**
 * A poll sent again, open and with no votes.
 *
 * Its closing moment is left off, because that moment belonged to the original
 * and may already have passed; how long it stays open is kept. A quiz needs its
 * right answers, which a message shows only to somebody who has answered it or
 * created it — without them it is refused rather than sent as a quiz with none.
 *
 * A poll is read and sent in two different shapes. What a message carries names
 * each answer by the bytes Telegram gave it; what a send carries has no such
 * bytes and is positional, and the right answers are the positions of the
 * options rather than their identifiers. So the two are matched here — by the
 * bytes, through the list the message itself carried — rather than assumed to
 * line up.
 */
async function pollOf(
  client: Sending,
  media: Extract<TypeMessageMedia, { _: 'messageMediaPoll' }>,
): Promise<TypeInputMedia> {
  const { poll, results } = media
  const answers = poll.answers.filter((answer) => answer._ === 'pollAnswer')

  if (answers.length !== poll.answers.length) {
    throw new ValidationError('the poll describes an answer this cannot read')
  }

  const positions = new Map(answers.map((answer, at) => [hex(answer.option), at]))
  const correct = (results.results ?? [])
    .filter((voters) => voters.correct === true)
    .map((voters) => positions.get(hex(voters.option)))
    .filter((at) => at !== undefined)

  if (poll.quiz === true && correct.length === 0) {
    throw new ValidationError(
      'a quiz can be copied only where its right answer is known to this account',
    )
  }

  const sending: TypePollAnswer[] = []
  for (const answer of answers) {
    sending.push({
      _: 'inputPollAnswer',
      text: answer.text,
      // An answer may carry media of its own, which is copied the same way the
      // message's own media is.
      ...(answer.media === undefined ? {} : { media: await inputMediaOf(client, answer.media) }),
    })
  }

  return {
    _: 'inputMediaPoll',
    poll: {
      _: 'poll',
      id: 0n,
      // Zero on the way out: the field exists so a client can tell whether a
      // poll it already holds has changed, and a poll being created is new.
      hash: 0n,
      question: poll.question,
      answers: sending,
      ...(poll.public_voters === true ? { public_voters: true as const } : {}),
      ...(poll.multiple_choice === true ? { multiple_choice: true as const } : {}),
      ...(poll.quiz === true ? { quiz: true as const } : {}),
      ...(poll.close_period === undefined ? {} : { close_period: poll.close_period }),
    },
    ...(poll.quiz === true ? { correct_answers: correct } : {}),
    ...(results.solution === undefined
      ? {}
      : { solution: results.solution, solution_entities: results.solution_entities ?? [] }),
  }
}

/** Option bytes as a value that can be compared and used as a key. */
function hex(option: Uint8Array): string {
  return Array.from(option, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Read the messages a copy is made from. */
async function sources(
  client: Sending,
  from: string | PeerRef,
  ids: readonly number[],
): Promise<readonly MessageView[]> {
  return await getMessages(client, from, ids)
}

/**
 * Run a copy, reading its sources again once if a file reference they carried
 * expired on the way.
 *
 * A reference is issued with the message and expires on the datacenter's own
 * schedule, so the only way to a current one is the message read again — which
 * a copy, unlike a send of media held from earlier, is in a position to do.
 */
async function withFreshSources<T>(
  client: Sending,
  from: string | PeerRef,
  ids: readonly number[],
  run: (views: readonly MessageView[]) => Promise<T>,
): Promise<T> {
  try {
    return await run(await sources(client, from, ids))
  } catch (error) {
    if (!isStaleReference(error)) throw error

    return await run(await sources(client, from, ids))
  }
}

/**
 * Send a message again, as a new message rather than a forward.
 *
 * ```ts
 * await account.copyMessage({ from: source, id: 42, to: '@archive' }, { caption: 'kept' })
 * ```
 *
 * The text keeps its formatting, and media keeps its spoiler and timer. A
 * message with no link preview is copied with none, and one with a preview gets
 * Telegram's preview of the copy. Refused for a service message, a message in a
 * conversation that protects its content, and media no copy can carry.
 */
export async function copyMessage(
  client: Sending,
  request: { readonly from: string | PeerRef; readonly id: number; readonly to: string | PeerRef },
  options?: CopyOptions,
): Promise<SentMessage> {
  const target = await targetOf(client, request.to, options)

  return await withFreshSources(client, request.from, [request.id], async ([view]) => {
    if (view === undefined) throw new ValidationError(`message ${request.id} was not returned`)

    const rebuilt = await rebuild(client, view)
    const invertMedia = options?.invertMedia ?? view.invertMedia
    const sending = { ...options, ...(invertMedia ? { invertMedia: true } : {}) }

    if (rebuilt.kind === 'text') {
      if (options?.caption !== undefined) {
        throw new ValidationError('a message without media has no caption to replace')
      }

      return await sendTextTo(client, target, rebuilt.body, {
        ...sending,
        noWebpagePreview: options?.noWebpagePreview ?? !rebuilt.preview,
      })
    }

    return await sendMediaTo(
      client,
      target,
      rebuilt.media,
      options?.caption ?? rebuilt.body,
      sending,
    )
  })
}

/**
 * Send an album again, as a new album.
 *
 * The messages must be one album, and it is sent in the album's own order,
 * whatever order they were named in — so the answers follow the album. Each item
 * keeps its own caption. The same refusals as {@link copyMessage}, and an album
 * holds only photos and documents.
 */
export async function copyAlbum(
  client: Sending,
  request: {
    readonly from: string | PeerRef
    readonly ids: readonly number[]
    readonly to: string | PeerRef
  },
  options?: AlbumOptions,
): Promise<readonly SentMessage[]> {
  checkAlbum(request.ids.length, options)
  const target = await targetOf(client, request.to, options)

  return await withFreshSources(client, request.from, request.ids, async (views) => {
    const ordered = [...views].sort((a, b) => a.id - b.id)
    const group = ordered[0]?.groupedId

    if (group === undefined || ordered.some((view) => view.groupedId !== group)) {
      throw new ValidationError('the messages are not one album')
    }

    const items: AlbumItem[] = []
    for (const view of ordered) {
      const rebuilt = await rebuild(client, view)
      if (
        rebuilt.kind !== 'media' ||
        (rebuilt.media._ !== 'inputMediaPhoto' && rebuilt.media._ !== 'inputMediaDocument')
      ) {
        throw new ValidationError(`message ${view.id} carries nothing an album can hold`)
      }
      items.push({ media: rebuilt.media, caption: rebuilt.body })
    }

    return await sendAlbumTo(client, target, items, options)
  })
}

/* -------------------------------------------------------------------------- */
/* Comments                                                                    */
/* -------------------------------------------------------------------------- */

/** A channel post's comment section. */
export interface Discussion {
  /** The discussion group the comments are in. */
  readonly chat: PeerRef
  /** The thread comments are filed under: the post's copy in the group. */
  readonly thread: number
  /** The post's copies in the group, newest first — several for an album. */
  readonly messages: readonly MessageView[]
  /** Comments this account has not read. */
  readonly unreadCount: number
  /** The newest comment, where there is one. */
  readonly maxId?: number
  /** The newest comment this account has read. */
  readonly readInboxMaxId?: number
  /** The newest of this account's own comments somebody has read. */
  readonly readOutboxMaxId?: number
}

/**
 * Find where a channel post's comments are.
 *
 * Refused for a peer that is not a channel, where a message has no comment
 * section to find — it is answered with `replyTo` — and for a post without one.
 */
export async function discussionOf(
  client: Sending,
  chat: string | PeerRef,
  post: number,
): Promise<Discussion> {
  const peer = await client.resolve(chat)
  if (channelFor(peer) === undefined) {
    throw new PeerError(
      'only a channel post has a comment section; answer anything else with replyTo',
    )
  }

  const answer = await client.api.messages.getDiscussionMessage({ peer, msg_id: post })
  const messages = answer.messages.map((value: TypeMessage) => new MessageView(value))
  // Newest first, so the last is the post's own copy, which the thread is named after.
  const root = messages.at(-1)
  const group = root?.chat

  if (root === undefined || root.isEmpty || group === undefined) {
    throw new ValidationError(`post ${post} has no comment section`)
  }

  return {
    chat: group,
    thread: root.id,
    messages,
    unreadCount: answer.unread_count,
    ...(answer.max_id === undefined ? {} : { maxId: answer.max_id }),
    ...(answer.read_inbox_max_id === undefined ? {} : { readInboxMaxId: answer.read_inbox_max_id }),
    ...(answer.read_outbox_max_id === undefined
      ? {}
      : { readOutboxMaxId: answer.read_outbox_max_id }),
  }
}

/**
 * Where a comment goes: the discussion group, answering the post's thread — or a
 * comment in it, where `replyTo` names one, which Telegram files in the same
 * thread.
 */
export async function commentTarget(
  client: Sending,
  channel: string | PeerRef,
  post: number,
  options: SendOptions,
): Promise<Target> {
  const discussion = await discussionOf(client, channel, post)
  const peer = await client.resolve(discussion.chat)

  return {
    peer,
    reply: replyHeader({ ...options, replyTo: options.replyTo ?? discussion.thread }),
  }
}

/* -------------------------------------------------------------------------- */
/* Scheduled messages                                                          */
/* -------------------------------------------------------------------------- */

/** The messages of an answer, read, with the empty placeholders left out. */
function viewsOf(answer: TlValue): readonly MessageView[] {
  const list = answer['messages']
  if (!Array.isArray(list)) return []

  return list.map((value) => new MessageView(value as TypeMessage)).filter((view) => !view.isEmpty)
}

/** Every message waiting to be sent in a conversation. */
export async function scheduledMessages(
  client: Sending,
  peer: string | PeerRef,
): Promise<readonly MessageView[]> {
  const target = await client.resolve(peer)
  // Nothing cached to compare against, so the hash asks for everything.
  const answer = await client.api.messages.getScheduledHistory({ peer: target, hash: 0n })

  return viewsOf(answer as unknown as TlValue)
}

/**
 * Scheduled messages by number, in the order asked, with a gap where a number
 * names none — because it was sent, deleted, or never existed.
 */
export async function getScheduledMessages(
  client: Sending,
  peer: string | PeerRef,
  ids: readonly number[],
): Promise<readonly (MessageView | undefined)[]> {
  const target = await client.resolve(peer)
  const answer = await client.api.messages.getScheduledMessages({ peer: target, id: ids })
  const found = new Map(viewsOf(answer as unknown as TlValue).map((view) => [view.id, view]))

  return ids.map((id) => found.get(id))
}

/** Remove messages from the schedule, so they are never sent. */
export async function deleteScheduledMessages(
  client: Sending,
  peer: string | PeerRef,
  ids: readonly number[],
): Promise<void> {
  const target = await client.resolve(peer)

  await client.api.messages.deleteScheduledMessages({ peer: target, id: ids })
}

/** A scheduled message sent now: its number in the schedule, and what it became. */
export interface SentScheduled extends SentMessage {
  /** Its number while it was scheduled. */
  readonly scheduled: number
}

/**
 * Send scheduled messages now instead of when they were due.
 *
 * Telegram reports which message each scheduled one became in the same answer,
 * by position, and that pairing is read rather than assumed. A scheduled
 * message in an album sends the whole album. Where the answer does not say what
 * one became, its identifier is absent rather than guessed.
 */
export async function sendScheduledMessages(
  client: Sending,
  peer: string | PeerRef,
  ids: readonly number[],
): Promise<readonly SentScheduled[]> {
  const target = await client.resolve(peer)
  const answer = (await client.api.messages.sendScheduledMessages({
    peer: target,
    id: ids,
  })) as unknown as TlValue

  const became = new Map<number, number>()
  const sent = new Map<number, TypeMessage>()

  for (const update of updatesOf(answer)) {
    if (update._ === 'updateDeleteScheduledMessages') {
      const from = update['messages']
      const to = update['sent_messages']
      if (Array.isArray(from) && Array.isArray(to)) {
        from.forEach((id, index) => {
          if (typeof id === 'number' && typeof to[index] === 'number') became.set(id, to[index])
        })
      }
    }

    if (update._ === 'updateNewMessage' || update._ === 'updateNewChannelMessage') {
      const message = update['message'] as TlValue | undefined
      if (typeof message?.['id'] === 'number')
        sent.set(message['id'], message as unknown as TypeMessage)
    }
  }

  return ids.map((scheduled) => {
    const id = became.get(scheduled)

    return {
      scheduled,
      id,
      message: id === undefined ? undefined : sent.get(id),
      raw: answer,
    }
  })
}

function updatesOf(answer: TlValue): readonly TlValue[] {
  if (answer._ === 'updateShort') {
    const only = answer['update']

    return typeof only === 'object' && only !== null ? [only as TlValue] : []
  }

  const list = answer['updates']

  return Array.isArray(list) ? (list as TlValue[]) : []
}
