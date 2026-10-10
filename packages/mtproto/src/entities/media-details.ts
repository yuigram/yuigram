// SPDX-License-Identifier: MIT

/**
 * Readings of the media whose content is a structure rather than a file.
 *
 * A poll is a question, answers and a tally kept in a second value; a checklist
 * is a list of tasks and, separately, which of them are done and by whom; a
 * link preview is a dozen optional fields, some of which say how to embed it.
 * The schema hands each over in its own shape — text with entities as one more
 * constructor, voters keyed by an opaque option, completions keyed by task
 * number — and a reader asking "which answer won" should not have to join them.
 *
 * Each function here reads one such value into a plain object: camelCase
 * fields, `{ text, entities }` for formatted text, a {@link PeerRef} for every
 * person, and the parts that are joined in the schema joined here. What has a
 * use of its own — a photo, a document, a nested media value — is passed on as
 * it arrived, so it can still be downloaded or sent.
 *
 * `MediaView` offers each as a getter, `pollDetails` beside the raw `poll`, and
 * so on; these are the functions behind them, for a value held without a view.
 */

import type { FormattedText } from '../format/text.js'
import type {
  TypeDocument,
  TypeDocumentAttribute,
  TypeGame,
  TypeGeoPoint,
  TypeInputStickerSet,
  TypeMessageMedia,
  TypePhoto,
  TypePoll,
  TypePollResults,
  TypeTextWithEntities,
  TypeTodoCompletion,
  TypeTodoList,
  TypeWebPage,
} from '../generated/api/types/index.js'
import type { PeerRef } from '../normalize/normalize.js'
import { peerRefOf } from '../normalize/normalize.js'
import type { MaskPoint } from '../stickers/stickers.js'

function textOf(value: TypeTextWithEntities): FormattedText {
  return { text: value.text, entities: value.entities }
}

function peersOf(values: readonly unknown[] | undefined): readonly PeerRef[] {
  return (values ?? []).flatMap((value) => peerRefOf(value) ?? [])
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index])
}

/** One answer of a poll, with its share of the tally where the tally is known. */
export interface PollAnswerDetails {
  readonly text: FormattedText
  /** What a vote for this answer sends. */
  readonly option: Uint8Array
  /** How many chose it, once the results say. */
  readonly voters: number | undefined
  /** Whether this account chose it. */
  readonly chosen: boolean
  /** Whether it is a quiz's right answer, once that is revealed. */
  readonly correct: boolean
  /** Who added it, for an answer a participant added. */
  readonly addedBy: PeerRef | undefined
  readonly addedAt: number | undefined
  readonly media: TypeMessageMedia | undefined
}

/** A poll and how it stands. */
export interface PollDetails {
  readonly id: bigint
  readonly question: FormattedText
  readonly answers: readonly PollAnswerDetails[]
  readonly isClosed: boolean
  /** Whether voters are shown by name. */
  readonly isPublic: boolean
  readonly isMultipleChoice: boolean
  readonly isQuiz: boolean
  /** Whether participants may add answers. */
  readonly isOpen: boolean
  readonly isRevotingDisabled: boolean
  readonly shuffleAnswers: boolean
  readonly hideResultsUntilClose: boolean
  /** Whether this account made it. */
  readonly isCreator: boolean
  readonly isSubscribersOnly: boolean
  /** How long it stays open, in seconds, where it closes by itself. */
  readonly closePeriod: number | undefined
  /** When it closes, in Unix seconds. */
  readonly closeDate: number | undefined
  /** The countries it is limited to, as two-letter codes. */
  readonly countries: readonly string[] | undefined
  readonly totalVoters: number | undefined
  readonly recentVoters: readonly PeerRef[]
  readonly hasUnreadVotes: boolean
  readonly canViewStats: boolean
  /** A quiz's explanation, shown once answered. */
  readonly solution: FormattedText | undefined
  readonly solutionMedia: TypeMessageMedia | undefined
  /**
   * Whether the tally is only this account's part of it.
   *
   * Telegram sends a short form of the results after a vote, carrying which
   * answers were chosen and no counts; the counts arrive with the next full
   * form. Read `voters` as unknown rather than as zero while this is true.
   */
  readonly partialResults: boolean
  /** Whether this account has voted. */
  readonly voted: boolean
  /** What was sent with the poll, where anything was. */
  readonly attachedMedia: TypeMessageMedia | undefined
}

/** Read a poll and its results into one. */
export function readPoll(
  poll: TypePoll,
  results: TypePollResults,
  attachedMedia?: TypeMessageMedia,
): PollDetails {
  const tally = results.results ?? []
  // A received poll's answers are all the `pollAnswer` form; the other member
  // of the union is what a poll is created with, and carries no option yet.
  const received = poll.answers.filter(
    (answer): answer is Extract<typeof answer, { _: 'pollAnswer' }> => answer._ === 'pollAnswer',
  )
  const answers = received.map((answer): PollAnswerDetails => {
    const counted = tally.find((one) => sameBytes(one.option, answer.option))
    return {
      text: textOf(answer.text),
      option: answer.option,
      voters: counted?.voters,
      chosen: counted?.chosen === true,
      correct: counted?.correct === true,
      addedBy: peerRefOf(answer.added_by),
      addedAt: answer.date,
      media: answer.media,
    }
  })

  return {
    id: poll.id,
    question: textOf(poll.question),
    answers,
    isClosed: poll.closed === true,
    isPublic: poll.public_voters === true,
    isMultipleChoice: poll.multiple_choice === true,
    isQuiz: poll.quiz === true,
    isOpen: poll.open_answers === true,
    isRevotingDisabled: poll.revoting_disabled === true,
    shuffleAnswers: poll.shuffle_answers === true,
    hideResultsUntilClose: poll.hide_results_until_close === true,
    isCreator: poll.creator === true,
    isSubscribersOnly: poll.subscribers_only === true,
    closePeriod: poll.close_period,
    closeDate: poll.close_date,
    countries: poll.countries_iso2,
    totalVoters: results.total_voters,
    recentVoters: peersOf(results.recent_voters),
    hasUnreadVotes: results.has_unread_votes === true,
    canViewStats: results.can_view_stats === true,
    solution:
      results.solution === undefined
        ? undefined
        : { text: results.solution, entities: results.solution_entities ?? [] },
    solutionMedia: results.solution_media,
    partialResults: results.min === true,
    voted: answers.some((answer) => answer.chosen),
    attachedMedia,
  }
}

/** One task of a checklist, with who did it where it is done. */
export interface TodoItemDetails {
  readonly id: number
  readonly title: FormattedText
  readonly completedBy: PeerRef | undefined
  /** When it was done, in Unix seconds. */
  readonly completedAt: number | undefined
}

/** A checklist and how far through it is. */
export interface TodoDetails {
  readonly title: FormattedText
  readonly items: readonly TodoItemDetails[]
  readonly othersCanAppend: boolean
  readonly othersCanComplete: boolean
  /** How many tasks are done. */
  readonly completed: number
}

/** Read a checklist and its completions into one. */
export function readTodo(
  todo: TypeTodoList,
  completions: readonly TypeTodoCompletion[] = [],
): TodoDetails {
  const items = todo.list.map((item): TodoItemDetails => {
    const done = completions.find((one) => one.id === item.id)
    return {
      id: item.id,
      title: textOf(item.title),
      completedBy: done === undefined ? undefined : peerRefOf(done.completed_by),
      completedAt: done?.date,
    }
  })

  return {
    title: textOf(todo.title),
    items,
    othersCanAppend: todo.others_can_append === true,
    othersCanComplete: todo.others_can_complete === true,
    completed: items.filter((item) => item.completedAt !== undefined).length,
  }
}

/** A link preview's content. */
export interface WebPageDetails {
  readonly id: bigint
  readonly url: string
  /** The address as shown, shortened. */
  readonly displayUrl: string
  /** What sort of page: `article`, `video`, `telegram_channel` and so on. */
  readonly type: string | undefined
  readonly siteName: string | undefined
  readonly title: string | undefined
  readonly description: string | undefined
  readonly author: string | undefined
  readonly photo: TypePhoto | undefined
  readonly document: TypeDocument | undefined
  /** In seconds, for audio or video. */
  readonly duration: number | undefined
  /** How the page embeds a player, where it does. */
  readonly embed:
    | {
        readonly url: string
        readonly type: string | undefined
        readonly width: number | undefined
        readonly height: number | undefined
      }
    | undefined
  readonly hasLargeMedia: boolean
  /** Whether it has an Instant View page. */
  readonly hasInstantView: boolean
  /** The story it links to, where it links to one. */
  readonly story: { readonly peer: PeerRef; readonly id: number } | undefined
}

/**
 * Read a link preview.
 *
 * `undefined` for a preview Telegram has not built yet, or has none of: the
 * pending and empty forms carry nothing to read beyond, at most, the address.
 */
export function readWebPage(page: TypeWebPage | undefined): WebPageDetails | undefined {
  if (page?._ !== 'webPage') return undefined

  let story: WebPageDetails['story']
  for (const attribute of page.attributes ?? []) {
    if (attribute._ !== 'webPageAttributeStory') continue
    const peer = peerRefOf(attribute.peer)
    if (peer !== undefined) story = { peer, id: attribute.id }
  }

  return {
    id: page.id,
    url: page.url,
    displayUrl: page.display_url,
    type: page.type,
    siteName: page.site_name,
    title: page.title,
    description: page.description,
    author: page.author,
    photo: page.photo,
    document: page.document,
    duration: page.duration,
    embed:
      page.embed_url === undefined
        ? undefined
        : {
            url: page.embed_url,
            type: page.embed_type,
            width: page.embed_width,
            height: page.embed_height,
          },
    hasLargeMedia: page.has_large_media === true,
    hasInstantView: page.cached_page !== undefined,
    story,
  }
}

/** A game a message carried. */
export interface GameDetails {
  readonly id: bigint
  readonly accessHash: bigint
  /** The name a bot knows it by, and a link to it names. */
  readonly shortName: string
  readonly title: string
  readonly description: string
  readonly photo: TypePhoto
  /** An animation shown in place of the photo, where there is one. */
  readonly animation: TypeDocument | undefined
}

/** Read a game. */
export function readGame(game: TypeGame): GameDetails {
  return {
    id: game.id,
    accessHash: game.access_hash,
    shortName: game.short_name,
    title: game.title,
    description: game.description,
    photo: game.photo,
    animation: game.document,
  }
}

/** A sticker or custom emoji, beyond the file. */
export interface StickerDetails {
  /** The emoji it stands for. */
  readonly emoji: string
  /** Which of the three it is. */
  readonly type: 'regular' | 'mask' | 'custom-emoji'
  /** How it is drawn: an image, a Lottie animation, or a video. */
  readonly format: 'static' | 'animated' | 'video'
  /** The set it belongs to, as a set can be asked for. */
  readonly set: TypeInputStickerSet | undefined
  /** For a custom emoji, the number a message's entity names it by. */
  readonly customEmojiId: bigint | undefined
  /** Whether a custom emoji may be used without Premium. */
  readonly isFree: boolean
  /** Whether a custom emoji takes the colour of the text around it. */
  readonly takesTextColor: boolean
  /** Whether it plays a full-screen effect for Premium users. */
  readonly isPremium: boolean
  readonly mask:
    | {
        readonly point: MaskPoint
        readonly x: number
        readonly y: number
        readonly zoom: number
      }
    | undefined
}

const MASK_POINTS: readonly MaskPoint[] = ['forehead', 'eyes', 'mouth', 'chin']

function attribute<K extends TypeDocumentAttribute['_']>(
  document: Extract<TypeDocument, { _: 'document' }>,
  kind: K,
): Extract<TypeDocumentAttribute, { _: K }> | undefined {
  return document.attributes.find(
    (one): one is Extract<TypeDocumentAttribute, { _: K }> => one._ === kind,
  )
}

/**
 * Read a sticker or a custom emoji.
 *
 * `undefined` for a document that is neither: the attribute that makes a file
 * a sticker is what this reads.
 */
export function readSticker(document: TypeDocument | undefined): StickerDetails | undefined {
  if (document?._ !== 'document') return undefined

  const sticker = attribute(document, 'documentAttributeSticker')
  const emoji = attribute(document, 'documentAttributeCustomEmoji')
  if (sticker === undefined && emoji === undefined) return undefined

  const format =
    document.mime_type === 'application/x-tgsticker'
      ? 'animated'
      : document.mime_type === 'video/webm'
        ? 'video'
        : 'static'
  const coordinates = sticker?.mask_coords

  return {
    emoji: emoji?.alt ?? sticker?.alt ?? '',
    type: emoji !== undefined ? 'custom-emoji' : sticker?.mask === true ? 'mask' : 'regular',
    format,
    set: (emoji ?? sticker)?.stickerset,
    customEmojiId: emoji === undefined ? undefined : document.id,
    isFree: emoji?.free === true,
    takesTextColor: emoji?.text_color === true,
    // The full-screen effect is a video rendering of type `f`.
    isPremium: (document.video_thumbs ?? []).some(
      (thumb) => thumb._ === 'videoSize' && thumb.type === 'f',
    ),
    mask:
      coordinates === undefined
        ? undefined
        : {
            point: MASK_POINTS[coordinates.n] ?? 'forehead',
            x: coordinates.x,
            y: coordinates.y,
            zoom: coordinates.zoom,
          },
  }
}

/** A point on a map. */
export interface LocationDetails {
  readonly latitude: number
  readonly longitude: number
  /** How far off it may be, in metres, where the sender said. */
  readonly accuracyRadius: number | undefined
}

/** Read a point, or `undefined` for the empty one. */
export function readLocation(point: TypeGeoPoint | undefined): LocationDetails | undefined {
  if (point?._ !== 'geoPoint') return undefined
  return { latitude: point.lat, longitude: point.long, accuracyRadius: point.accuracy_radius }
}
