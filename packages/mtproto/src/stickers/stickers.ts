/**
 * Sticker sets: reading them, making them, and changing what is in them.
 *
 * A sticker in a set is a document Telegram holds, so adding one from a file is
 * two steps: the file becomes a document, then the document joins the set. The
 * first step is the one an album uses for its items — media handed to Telegram
 * and stored against this account — so there is no second transfer path here.
 *
 * Loaded when one of them is called.
 */

import { ValidationError } from '@yuigram/core'
import type {
  TypeDocument,
  TypeInputDocument,
  TypeInputMedia,
  TypeInputStickerSet,
  TypeInputStickerSetItem,
  TypeMessage,
  TypeStickerKeyword,
  TypeStickerPack,
  TypeStickerSet,
} from '../generated/api/types/index.js'
import { storeMedia } from '../messaging/compose.js'
import type { Sending } from '../messaging/send.js'
import { channelFor, userFor } from '../network/peers.js'
import type { PeerRef } from '../normalize/normalize.js'

/* -------------------------------------------------------------------------- */
/* Naming a set and a sticker                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A sticker set, by the short name its link uses, or by the identifier and
 * access hash an answer carried.
 */
export type StickerSetRef =
  | string
  | { readonly id: bigint; readonly accessHash: bigint }
  | TypeInputStickerSet

function setOf(ref: StickerSetRef): TypeInputStickerSet {
  if (typeof ref === 'string') {
    if (ref === '') throw new ValidationError('a sticker set’s short name cannot be empty')

    return { _: 'inputStickerSetShortName', short_name: ref }
  }
  if ('_' in ref) return ref

  return { _: 'inputStickerSetID', id: ref.id, access_hash: ref.accessHash }
}

/** A sticker already in a set: the document itself, or its input form. */
export type StickerRef = TypeDocument | TypeInputDocument

function stickerOf(ref: StickerRef): TypeInputDocument {
  if (ref._ === 'inputDocument' || ref._ === 'inputDocumentEmpty') return ref
  if (ref._ === 'documentEmpty') throw new ValidationError('an empty document names no sticker')

  return {
    _: 'inputDocument',
    id: ref.id,
    access_hash: ref.access_hash,
    file_reference: ref.file_reference,
  }
}

/* -------------------------------------------------------------------------- */
/* Reading sets                                                                */
/* -------------------------------------------------------------------------- */

/** A sticker set and what is in it. */
export interface StickerSetContents {
  readonly set: TypeStickerSet
  /** The stickers, in the set's order. */
  readonly documents: readonly TypeDocument[]
  /** Which stickers each emoji finds. */
  readonly packs: readonly TypeStickerPack[]
  /** The words each sticker is also found by. */
  readonly keywords: readonly TypeStickerKeyword[]
}

function contentsOf(answer: { readonly _: string } & Record<string, unknown>): StickerSetContents {
  if (answer._ !== 'messages.stickerSet') {
    throw new ValidationError('Telegram answered without describing the set')
  }

  return {
    set: answer['set'] as TypeStickerSet,
    documents: answer['documents'] as TypeDocument[],
    packs: answer['packs'] as TypeStickerPack[],
    keywords: answer['keywords'] as TypeStickerKeyword[],
  }
}

/** A sticker set and its stickers. */
export async function getStickerSet(
  client: Sending,
  set: StickerSetRef,
): Promise<StickerSetContents> {
  const answer = await client.api.messages.getStickerSet({ stickerset: setOf(set), hash: 0 })

  return contentsOf(answer as never)
}

/** The sets this account has installed, in the order it shows them. */
export async function getInstalledStickers(client: Sending): Promise<readonly TypeStickerSet[]> {
  const answer = await client.api.messages.getAllStickers({ hash: 0n })

  // Nothing held here to be unchanged against, so the full answer is expected;
  // an unchanged one is read as no sets rather than as an error.
  return answer._ === 'messages.allStickers' ? answer.sets : []
}

/** One page of the sets this account created. */
export interface MySetsPage {
  readonly sets: readonly TypeStickerSet[]
  /** How many there are altogether. */
  readonly total: number
  /** Where the next page begins, absent where this was the last. */
  readonly next?: bigint
}

/**
 * The sets this account created, a page at a time.
 *
 * Continued from the last set's identifier, which is how Telegram pages them.
 */
export async function getMyStickerSets(
  client: Sending,
  options?: { readonly from?: bigint; readonly limit?: number },
): Promise<MySetsPage> {
  const limit = options?.limit ?? 100
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new ValidationError(`a page holds a positive whole number of sets, not ${limit}`)
  }

  const answer = await client.api.messages.getMyStickers({
    offset_id: options?.from ?? 0n,
    limit,
  })
  const sets = answer.sets.map((covered) => covered.set)
  const last = sets.at(-1)
  const seen = sets.length

  return {
    sets,
    total: answer.count,
    // A short page is the last; so is one whose last set is where it began.
    ...(last === undefined || seen < limit || last.id === options?.from ? {} : { next: last.id }),
  }
}

/* -------------------------------------------------------------------------- */
/* Making and changing sets                                                    */
/* -------------------------------------------------------------------------- */

/** Where on a face a mask sits by default. */
export type MaskPoint = 'forehead' | 'eyes' | 'mouth' | 'chin'

/** The protocol's numbering of the face, from Telegram's sticker documentation. */
const MASK_POINTS: Readonly<Record<MaskPoint, number>> = {
  forehead: 0,
  eyes: 1,
  mouth: 2,
  chin: 3,
}

/** One sticker to add to a set. */
export interface NewSticker {
  /**
   * The sticker: a document Telegram holds, or media to hand over first — an
   * upload, or a URL for Telegram to fetch.
   */
  readonly file: TypeInputDocument | TypeInputMedia
  /** The emoji it stands for, one or more. */
  readonly emoji: string
  /** Where a mask sits, for a mask set. */
  readonly mask?: {
    readonly point: MaskPoint
    readonly x: number
    readonly y: number
    readonly scale: number
  }
  /** Words it is also found by. */
  readonly keywords?: readonly string[]
}

/** The file types a sticker may be uploaded as. */
const STICKER_TYPES: ReadonlySet<string> = new Set([
  'image/webp',
  'image/png',
  'application/x-tgsticker',
  'video/webm',
])

/** A sticker's file as a document Telegram holds. */
async function documentOf(
  client: Sending,
  file: TypeInputDocument | TypeInputMedia,
): Promise<TypeInputDocument> {
  if (file._ === 'inputDocument' || file._ === 'inputDocumentEmpty') return file
  if (file._ === 'inputMediaDocument') return file.id

  if (file._ === 'inputMediaUploadedDocument' && !STICKER_TYPES.has(file.mime_type)) {
    throw new ValidationError(
      `a sticker is WEBP or PNG, TGS or WEBM, not ${JSON.stringify(file.mime_type)}`,
    )
  }

  const held = await storeMedia(client, { _: 'inputPeerSelf' }, file)
  if (held._ !== 'inputMediaDocument') {
    throw new ValidationError(`a sticker is a document, and Telegram stored this as '${held._}'`)
  }

  return held.id
}

async function itemOf(client: Sending, sticker: NewSticker): Promise<TypeInputStickerSetItem> {
  if (sticker.emoji.trim() === '')
    throw new ValidationError('a sticker stands for at least one emoji')

  const keywords = sticker.keywords?.map((word) => word.trim()).filter((word) => word !== '')
  if (keywords?.some((word) => word.includes(','))) {
    throw new ValidationError('a keyword cannot contain a comma, which separates them')
  }

  return {
    _: 'inputStickerSetItem',
    document: await documentOf(client, sticker.file),
    emoji: sticker.emoji,
    ...(sticker.mask === undefined
      ? {}
      : {
          mask_coords: {
            _: 'maskCoords',
            n: MASK_POINTS[sticker.mask.point],
            x: sticker.mask.x,
            y: sticker.mask.y,
            zoom: sticker.mask.scale,
          },
        }),
    ...(keywords === undefined || keywords.length === 0 ? {} : { keywords: keywords.join(',') }),
  }
}

/** Which kind of set: ordinary stickers, masks, or custom emoji. */
export type StickerSetKind = 'stickers' | 'masks' | 'emoji'

/** What a new set is. */
export interface NewStickerSet {
  /** Whose set it is. A bot creates sets for people, who then own them. */
  readonly owner: string | PeerRef
  /** 1 to 64 characters. */
  readonly title: string
  /**
   * The name its link uses: letters, digits and single underscores, beginning
   * with a letter. A set a bot creates has to end in `_by_<bot username>`,
   * which Telegram checks.
   */
  readonly shortName: string
  readonly stickers: readonly NewSticker[]
  readonly kind?: StickerSetKind
  /** For custom emoji: draw them in the colour of the text around them. */
  readonly adaptive?: boolean
  readonly thumb?: TypeInputDocument | TypeInputMedia
}

const SHORT_NAME = /^[A-Za-z](?:[A-Za-z0-9]|_(?!_))*$/

/**
 * Make a sticker set.
 *
 * Each sticker's file is handed over first, in order, so the set is made from
 * documents Telegram already holds. A file that cannot become a document stops
 * the set being made, and what was handed over before it is stored and used
 * nowhere.
 */
export async function createStickerSet(
  client: Sending,
  set: NewStickerSet,
): Promise<StickerSetContents> {
  if (set.title.length < 1 || set.title.length > 64) {
    throw new ValidationError('a sticker set’s title is 1 to 64 characters')
  }
  if (set.shortName.length > 64 || !SHORT_NAME.test(set.shortName)) {
    throw new ValidationError(
      `${JSON.stringify(set.shortName)} is not a short name: letters, digits and single underscores, from a letter`,
    )
  }
  if (set.stickers.length === 0)
    throw new ValidationError('a set is made with at least one sticker')
  if (set.adaptive === true && set.kind !== 'emoji') {
    throw new ValidationError('only custom emoji take the colour of the text around them')
  }

  const owner = userFor(await client.resolve(set.owner))
  if (owner === undefined) throw new ValidationError('a sticker set belongs to a person')

  const stickers: TypeInputStickerSetItem[] = []
  for (const sticker of set.stickers) stickers.push(await itemOf(client, sticker))

  const answer = await client.api.stickers.createStickerSet({
    user_id: owner,
    title: set.title,
    short_name: set.shortName,
    stickers,
    ...(set.kind === 'masks' ? { masks: true as const } : {}),
    ...(set.kind === 'emoji' ? { emojis: true as const } : {}),
    ...(set.adaptive === true ? { text_color: true as const } : {}),
    ...(set.thumb === undefined ? {} : { thumb: await documentOf(client, set.thumb) }),
  })

  return contentsOf(answer as never)
}

/** Add a sticker to a set this account manages. */
export async function addStickerToSet(
  client: Sending,
  set: StickerSetRef,
  sticker: NewSticker,
): Promise<StickerSetContents> {
  const answer = await client.api.stickers.addStickerToSet({
    stickerset: setOf(set),
    sticker: await itemOf(client, sticker),
  })

  return contentsOf(answer as never)
}

/** Take a sticker out of its set. The set is named by the sticker. */
export async function deleteStickerFromSet(
  client: Sending,
  sticker: StickerRef,
): Promise<StickerSetContents> {
  const answer = await client.api.stickers.removeStickerFromSet({ sticker: stickerOf(sticker) })

  return contentsOf(answer as never)
}

/** Put a new sticker where an old one was, keeping its place in the set. */
export async function replaceStickerInSet(
  client: Sending,
  sticker: StickerRef,
  replacement: NewSticker,
): Promise<StickerSetContents> {
  const answer = await client.api.stickers.replaceSticker({
    sticker: stickerOf(sticker),
    new_sticker: await itemOf(client, replacement),
  })

  return contentsOf(answer as never)
}

/** Move a sticker to a position in its set, counted from zero. */
export async function moveStickerInSet(
  client: Sending,
  sticker: StickerRef,
  position: number,
): Promise<StickerSetContents> {
  if (!Number.isInteger(position) || position < 0) {
    throw new ValidationError(`a position in a set is counted from zero, not ${position}`)
  }

  const answer = await client.api.stickers.changeStickerPosition({
    sticker: stickerOf(sticker),
    position,
  })

  return contentsOf(answer as never)
}

/**
 * Set a set's thumbnail, or take it away.
 *
 * An ordinary set's thumbnail is a file; a custom emoji set's may instead be
 * one of its own emoji, named by its document. Nothing at all goes back to the
 * first sticker, which is what a set without one shows.
 */
export async function setStickerSetThumb(
  client: Sending,
  set: StickerSetRef,
  thumb:
    | { readonly file: TypeInputDocument | TypeInputMedia }
    | { readonly emojiId: bigint }
    | undefined,
): Promise<StickerSetContents> {
  const answer = await client.api.stickers.setStickerSetThumb({
    stickerset: setOf(set),
    ...(thumb === undefined
      ? {}
      : 'emojiId' in thumb
        ? { thumb_document_id: thumb.emojiId }
        : { thumb: await documentOf(client, thumb.file) }),
  })

  return contentsOf(answer as never)
}

/**
 * Choose the sticker set a supergroup offers its members, or remove it.
 *
 * Only a supergroup has one; a basic group or a person is refused before
 * anything is asked.
 */
export async function setChatStickerSet(
  client: Sending,
  chat: string | PeerRef,
  set: StickerSetRef | undefined,
): Promise<void> {
  const channel = channelFor(await client.resolve(chat))
  if (channel === undefined) throw new ValidationError('only a supergroup offers a sticker set')

  const done = await client.api.channels.setStickers({
    channel,
    stickerset: set === undefined ? { _: 'inputStickerSetEmpty' } : setOf(set),
  })
  if (!done) throw new ValidationError('Telegram declined to set the supergroup’s stickers')
}

/* -------------------------------------------------------------------------- */
/* Custom emoji                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The documents custom emoji are drawn from, one per identifier, in order.
 *
 * A gap where Telegram has no such emoji, so the answer pairs up with what was
 * asked by position.
 */
export async function getCustomEmojis(
  client: Sending,
  ids: readonly bigint[],
): Promise<readonly (TypeDocument | undefined)[]> {
  if (ids.length === 0) return []

  const answer = await client.api.messages.getCustomEmojiDocuments({ document_id: [...ids] })
  const found = new Map<bigint, TypeDocument>()
  for (const document of answer) if (document._ === 'document') found.set(document.id, document)

  return ids.map((id) => found.get(id))
}

/**
 * The custom emoji a set of messages uses, each once, in the order they first
 * appear.
 */
export async function getCustomEmojisFromMessages(
  client: Sending,
  messages: readonly TypeMessage[],
): Promise<readonly TypeDocument[]> {
  const ids: bigint[] = []
  const seen = new Set<bigint>()

  for (const message of messages) {
    if (message._ !== 'message') continue
    for (const entity of message.entities ?? []) {
      if (entity._ === 'messageEntityCustomEmoji' && !seen.has(entity.document_id)) {
        seen.add(entity.document_id)
        ids.push(entity.document_id)
      }
    }
  }

  const found = await getCustomEmojis(client, ids)

  return found.filter((document) => document !== undefined)
}
