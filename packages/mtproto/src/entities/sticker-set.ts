// SPDX-License-Identifier: MIT

/**
 * Reading a sticker set.
 *
 * Telegram describes a set in two depths. The brief form — a `stickerSet` — is
 * what a list of sets carries: the name, the counts and the flags, sometimes
 * with a cover or two. The full form — `messages.stickerSet` — is what asking
 * for one set answers with: the same brief description, every sticker's
 * document, which emoji find which sticker, and the words each is found by.
 *
 * ```
 *   stickerSet            ──> title, short_name, count, flags, thumbs
 *   stickerSetCovered     ──> the brief form + one cover
 *   stickerSetMultiCovered──> the brief form + several covers
 *   messages.stickerSet   ──> the brief form + documents, packs, keywords
 * ```
 *
 * One view reads all of them, so a caller holding a set from a list and one
 * from a lookup reads both the same way; what the brief form does not carry
 * reads as empty, and {@link StickerSetView.isFull} says which it was.
 *
 * As with every view here: it holds the value, computes on access, and reaches
 * nothing. Changing a set is a call on the account.
 */

import type { DownloadRequest } from '../files/download.js'
import type {
  TypeDocument,
  TypeInputStickerSet,
  TypePhotoSize,
  TypeStickerKeyword,
  TypeStickerPack,
  TypeStickerSet,
  TypeStickerSetCovered,
} from '../generated/api/types/index.js'

/** What a set holds: stickers, masks to put on faces, or custom emoji. */
export type StickerSetKind = 'stickers' | 'masks' | 'emoji'

/** The values a set can be read from. */
export type StickerSetValue =
  | TypeStickerSet
  | TypeStickerSetCovered
  | {
      readonly _: 'messages.stickerSet'
      readonly set: TypeStickerSet
      readonly packs: readonly TypeStickerPack[]
      readonly keywords: readonly TypeStickerKeyword[]
      readonly documents: readonly TypeDocument[]
    }

/** One sticker of a set, with everything the set says about it. */
export interface StickerItem {
  /** The sticker itself: a document, sendable and downloadable as one. */
  readonly document: TypeDocument
  /**
   * The emoji the sticker was filed under, from its own description.
   *
   * Empty for a sticker that names none, which a set of masks may do.
   */
  readonly alt: string
  /** Every emoji the set files it under, in the order the set lists them. */
  readonly emojis: readonly string[]
  /** The words it is also found by. */
  readonly keywords: readonly string[]
}

/** A sticker set, read. */
export class StickerSetView {
  /** The value this reads. Everything else is a function of it. */
  readonly raw: StickerSetValue

  constructor(value: StickerSetValue) {
    this.raw = value
  }

  /** The brief description, whichever form arrived. */
  get set(): TypeStickerSet {
    return this.raw._ === 'stickerSet' ? this.raw : this.raw.set
  }

  /**
   * Whether this is the full form: every sticker, its emoji and its keywords.
   *
   * A set read from a list is brief, and its `stickers` are empty however many
   * it holds; `count` says how many, and asking for the set gives the rest.
   */
  get isFull(): boolean {
    return this.raw._ === 'messages.stickerSet' || this.raw._ === 'stickerSetFullCovered'
  }

  /** The documents, in the set's order. Empty for the brief form. */
  get documents(): readonly TypeDocument[] {
    return this.raw._ === 'messages.stickerSet' || this.raw._ === 'stickerSetFullCovered'
      ? this.raw.documents
      : []
  }

  /** Which stickers each emoji finds. Empty for the brief form. */
  get packs(): readonly TypeStickerPack[] {
    return this.raw._ === 'messages.stickerSet' || this.raw._ === 'stickerSetFullCovered'
      ? this.raw.packs
      : []
  }

  /** The words each sticker is also found by. Empty for the brief form. */
  get keywords(): readonly TypeStickerKeyword[] {
    return this.raw._ === 'messages.stickerSet' || this.raw._ === 'stickerSetFullCovered'
      ? this.raw.keywords
      : []
  }

  /** The stickers a list showed for the set, where it showed any. */
  get covers(): readonly TypeDocument[] {
    switch (this.raw._) {
      case 'stickerSetCovered':
        return [this.raw.cover]
      case 'stickerSetMultiCovered':
        return this.raw.covers
      default:
        return []
    }
  }

  get id(): bigint {
    return this.set.id
  }

  get accessHash(): bigint {
    return this.set.access_hash
  }

  get title(): string {
    return this.set.title
  }

  /** The name its link uses. */
  get shortName(): string {
    return this.set.short_name
  }

  /** How many stickers the set holds, whether or not this form lists them. */
  get count(): number {
    return this.set.count
  }

  /** What the set holds. */
  get kind(): StickerSetKind {
    if (this.set.emojis === true) return 'emoji'
    if (this.set.masks === true) return 'masks'

    return 'stickers'
  }

  /** Whether this account archived it. */
  get isArchived(): boolean {
    return this.set.archived === true
  }

  /** Whether Telegram publishes it. */
  get isOfficial(): boolean {
    return this.set.official === true
  }

  /** Whether this account made it. */
  get isCreator(): boolean {
    return this.set.creator === true
  }

  /** Whether an emoji set's emoji take the colour of the text around them. */
  get isTextColored(): boolean {
    return this.set.text_color === true
  }

  /** Whether a channel can show an emoji from this set as its status. */
  get isChannelStatus(): boolean {
    return this.set.channel_emoji_status === true
  }

  /**
   * The custom emoji standing in as the set's picture, where one does.
   *
   * An emoji set may be pictured by one of its emoji rather than an image of
   * its own; this names it, to be fetched with `getCustomEmojis`.
   */
  get thumbnailEmojiId(): bigint | undefined {
    return this.set.thumb_document_id
  }

  /** When this account installed it, in Unix seconds, or `undefined` where it has not. */
  get installedDate(): number | undefined {
    return this.set.installed_date
  }

  /** The reference a call names the set by. */
  get input(): TypeInputStickerSet {
    return { _: 'inputStickerSetID', id: this.id, access_hash: this.accessHash }
  }

  /** The link that opens the set, by the kind of set it is. */
  get link(): string {
    return `https://t.me/${this.kind === 'emoji' ? 'addemoji' : 'addstickers'}/${this.shortName}`
  }

  /**
   * The stickers, in the set's order, each with its emoji and keywords.
   *
   * Empty for the brief form. A sticker's emoji come from the set's packs,
   * which is where Telegram records them; `alt` is the one the sticker itself
   * names.
   */
  get stickers(): readonly StickerItem[] {
    const emojis = new Map<bigint, string[]>()
    for (const pack of this.packs) {
      for (const id of pack.documents) emojis.set(id, [...(emojis.get(id) ?? []), pack.emoticon])
    }
    const words = new Map<bigint, readonly string[]>()
    for (const keyword of this.keywords) words.set(keyword.document_id, keyword.keyword)

    return this.documents.flatMap((document) =>
      document._ === 'document'
        ? [
            {
              document,
              alt: altOf(document),
              emojis: emojis.get(document.id) ?? [],
              keywords: words.get(document.id) ?? [],
            },
          ]
        : [],
    )
  }

  /**
   * The stickers an emoji finds, in the order the set lists them.
   *
   * Read from the set's packs, which is what Telegram searches by, so a sticker
   * filed under several emoji is found by each of them.
   */
  byEmoji(emoji: string): readonly StickerItem[] {
    const wanted = this.packs.find((pack) => pack.emoticon === emoji)?.documents ?? []
    const items = new Map(this.stickers.map((item) => [item.document.id, item]))

    return wanted.flatMap((id) => {
      const item = items.get(id)
      return item === undefined ? [] : [item]
    })
  }

  /** The sizes the set's own picture comes in, as Telegram describes them. */
  get thumbnails(): readonly TypePhotoSize[] {
    return this.set.thumbs ?? []
  }

  /**
   * Where the set's picture is fetched from, at one of its sizes.
   *
   * `undefined` for a set with no picture of its own — its first sticker stands
   * in for it — or with no size of that name. A size that arrived inline has
   * nothing to fetch and is not offered.
   */
  thumbnailFile(type?: string): DownloadRequest | undefined {
    const set = this.set
    if (set.thumb_dc_id === undefined || set.thumb_version === undefined) return undefined

    const size = this.thumbnails.find(
      (one) =>
        (type === undefined || one.type === type) &&
        (one._ === 'photoSize' || one._ === 'photoSizeProgressive'),
    )
    if (size === undefined) return undefined

    return {
      location: {
        _: 'inputStickerSetThumb',
        stickerset: this.input,
        thumb_version: set.thumb_version,
      },
      dcId: set.thumb_dc_id,
      ...(size._ === 'photoSize' ? { size: size.size } : {}),
    }
  }

  /** The value itself, so a set serialises as what Telegram sent. */
  toJSON(): StickerSetValue {
    return this.raw
  }
}

/** The emoji a sticker names for itself. */
function altOf(document: Extract<TypeDocument, { _: 'document' }>): string {
  for (const attribute of document.attributes) {
    if (attribute._ === 'documentAttributeSticker') return attribute.alt
    if (attribute._ === 'documentAttributeCustomEmoji') return attribute.alt
  }

  return ''
}

/** Read one set. Takes what an answer carries, including nothing. */
export function readStickerSet(value: StickerSetValue | undefined): StickerSetView | undefined {
  return value === undefined ? undefined : new StickerSetView(value)
}
