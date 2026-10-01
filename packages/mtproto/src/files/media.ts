/**
 * Naming a file, so it can be fetched or sent.
 *
 * A message does not carry a file; it carries what a file is addressed by. The
 * identifier and the hash say which file, and beside them travels a *file
 * reference*: a short-lived token the datacenter issued along with whatever the
 * media arrived in. Assembling those three into the shape a transfer takes is
 * mechanical, and doing it by hand at every call site is how a reference gets
 * left out and the request refused for a reason that has nothing to do with the
 * file.
 *
 * ```
 *   document ──> id · access_hash · file_reference ──> location
 *            └─> dc_id                             ──> where to ask
 *            └─> size                              ──> how much to ask for
 * ```
 *
 * **A photo is several files.** The same picture at several sizes, named by a
 * `type` the location has to carry. Two of the six size constructors hold bytes
 * that can be fetched; the rest either carry the data inline or carry nothing,
 * so the protocol itself says which are candidates. Among those, the largest is
 * taken — the answer this project already gives the same question on the Bot
 * API side, where a photo's size list is accepted and the largest is chosen.
 *
 * The same three fields address a file in the other direction. A message that
 * already carries one can carry it again without the bytes moving, and a file
 * this account has just sent is named by what the upload handed back — so the
 * descriptors that go into a send live here too, beside the locations that come
 * out of a receive.
 */

import { ValidationError } from '../core.js'
import type {
  TypeDocument,
  TypeDocumentAttribute,
  TypeInputMedia,
  TypePhoto,
  TypePhotoSize,
  TypeVideoSize,
} from '../generated/api/types/index.js'
import type { DownloadRequest } from './download.js'
import { inferMimeType } from './types.js'
import type { UploadedFile } from './upload.js'

/**
 * What a transfer needs to fetch a document a message carried.
 *
 * Everything comes from the document itself and nothing is chosen: the location
 * names the file, `dcId` says which datacenter holds it, and the size is what
 * lets the ranges go out together rather than one after another.
 *
 * ```ts
 * const media = event.message?._ === 'message' ? event.message.media : undefined
 * if (media?._ === 'messageMediaDocument' && media.document?._ === 'document') {
 *   const bytes = await account.download(documentFile(media.document))
 * }
 * ```
 *
 * The reference is copied as it arrived. It expires on the datacenter's own
 * schedule, and one that has is refused by name — which is a fact about the
 * message the location came from rather than about the document, so refreshing
 * it belongs to whatever still holds that message.
 */
export function documentFile(document: TypeDocument): DownloadRequest {
  if (document._ !== 'document') {
    throw new ValidationError('an empty document names no file to fetch')
  }

  // A document is one file, so the thumbnail selector names none of them. Its
  // thumbnails are fetched with `thumbnailFile`, which names one.
  return {
    dcId: document.dc_id,
    size: Number(document.size),
    location: {
      _: 'inputDocumentFileLocation',
      id: document.id,
      access_hash: document.access_hash,
      file_reference: document.file_reference,
      thumb_size: '',
    },
  }
}

/**
 * What a transfer needs to fetch a photo a message carried.
 *
 * A photo is the same picture at several sizes, and a location names one of
 * them. Which are candidates is the protocol's own answer rather than a policy:
 * of the six size constructors only two describe bytes that have to be
 * fetched — the rest carry their data inline, as a stripped placeholder, a
 * cached copy or a vector path, or describe nothing at all.
 *
 * Among the candidates the largest is taken, ranked by the bytes it is when
 * that is stated and by its area otherwise. That is the answer this project
 * already gives to the same question on the other transport, where a photo's
 * size list is an accepted download target and the largest of it is chosen.
 *
 * ```ts
 * const media = event.message?._ === 'message' ? event.message.media : undefined
 * if (media?._ === 'messageMediaPhoto' && media.photo?._ === 'photo') {
 *   const bytes = await account.download(photoFile(media.photo))
 * }
 * ```
 */
export function photoFile(photo: TypePhoto): DownloadRequest {
  if (photo._ !== 'photo') {
    throw new ValidationError('an empty photo names no file to fetch')
  }

  const best = largest(photo.sizes)
  if (best === undefined) {
    throw new ValidationError(
      `photo ${photo.id} carries no size that has to be fetched, only ones that arrived with it`,
    )
  }

  return {
    dcId: photo.dc_id,
    size: best.bytes,
    location: {
      _: 'inputPhotoFileLocation',
      id: photo.id,
      access_hash: photo.access_hash,
      file_reference: photo.file_reference,
      thumb_size: best.type,
    },
  }
}

/** One size that has to be fetched, reduced to what choosing between them needs. */
interface Fetchable {
  readonly type: string
  readonly bytes: number
  readonly area: number
}

/**
 * Which sizes describe bytes a client has to ask for.
 *
 * `photoSize` states its length outright. `photoSizeProgressive` states the
 * length at each stage of a progressively encoded image, so the whole of it is
 * the last and largest of them. Everything else — empty, cached, stripped, a
 * vector path — either arrived with the message or describes nothing, and
 * asking a datacenter for one would be asking for a file that is not there.
 */
function fetchable(size: TypePhotoSize): Fetchable | undefined {
  if (size._ === 'photoSize') {
    return { type: size.type, bytes: size.size, area: size.w * size.h }
  }

  if (size._ === 'photoSizeProgressive') {
    const whole = size.sizes.length === 0 ? undefined : Math.max(...size.sizes)
    if (whole === undefined) return undefined

    return { type: size.type, bytes: whole, area: size.w * size.h }
  }

  return undefined
}

/**
 * The largest size worth fetching.
 *
 * Ranked by the bytes it is, falling back to area: the two order the same way
 * for any real photo, and a length is the thing a transfer actually needs.
 */
function largest(sizes: readonly TypePhotoSize[]): Fetchable | undefined {
  let best: Fetchable | undefined

  for (const size of sizes) {
    const candidate = fetchable(size)
    if (candidate === undefined) continue
    if (best === undefined || rank(candidate) > rank(best)) best = candidate
  }

  return best
}

const rank = (size: Fetchable) => (size.bytes > 0 ? size.bytes : size.area)

/**
 * Name a document a message already carries, so it can be sent somewhere else.
 *
 * The bytes do not move. A document is addressed by the same three fields
 * whether it is being fetched or sent, so a message that arrived carrying one
 * carries everything needed to send it again — and re-uploading a file this
 * account can already name would move megabytes to arrive at the identifier it
 * was holding.
 *
 * ```ts
 * await account.api.messages.sendMedia({
 *   peer,
 *   media: documentMedia(media.document),
 *   message: '',
 *   random_id: id,
 * })
 * ```
 *
 * The reference is the one the message carried and expires on the datacenter's
 * own schedule, exactly as it does for a fetch. A send refused for a stale one
 * is put right the same way: by asking for the message again.
 *
 * Nothing optional is set. A spoiler, a self-destruct timer and a video cover
 * are choices about the send rather than about the document, so a caller that
 * wants one spreads this and adds it.
 */
export function documentMedia(document: TypeDocument): TypeInputMedia {
  if (document._ !== 'document') {
    throw new ValidationError('an empty document names no file to send')
  }

  return {
    _: 'inputMediaDocument',
    id: {
      _: 'inputDocument',
      id: document.id,
      access_hash: document.access_hash,
      file_reference: document.file_reference,
    },
  }
}

/**
 * Name a photo a message already carries, so it can be sent somewhere else.
 *
 * Unlike a fetch, this chooses no size. A photo is one object with several
 * renderings of itself, and sending it sends the object — which is why the
 * reference here carries no size type and why nothing has to be picked.
 */
export function photoMedia(photo: TypePhoto): TypeInputMedia {
  if (photo._ !== 'photo') {
    throw new ValidationError('an empty photo names no file to send')
  }

  return {
    _: 'inputMediaPhoto',
    id: {
      _: 'inputPhoto',
      id: photo.id,
      access_hash: photo.access_hash,
      file_reference: photo.file_reference,
    },
  }
}

/**
 * Send bytes this account has just uploaded, as a photo.
 *
 * Everything needed is in the upload result. A photo is the one uploaded form
 * that describes itself: the datacenter decodes the image, produces the sizes
 * and records the dimensions, so there is nothing for a client to state and
 * nothing it could state that would be believed.
 *
 * ```ts
 * const uploaded = await account.upload({ source })
 * await account.api.messages.sendMedia({
 *   peer,
 *   media: uploadedPhoto(uploaded),
 *   message: 'a caption',
 *   random_id: id,
 * })
 * ```
 *
 * What the bytes actually are is the datacenter's judgement. Something it
 * cannot decode as an image is refused there, which is the only place that can
 * tell.
 */
export function uploadedPhoto(file: UploadedFile): TypeInputMedia {
  return { _: 'inputMediaUploadedPhoto', file: file.file }
}

/** What a document says about itself beyond the bytes. */
export interface UploadedDocumentOptions {
  /**
   * What the bytes are.
   *
   * Told from the file where it is not given: from the signature its first
   * bytes carry, which most formats put there so nothing has to guess; then
   * from the name's extension; then as plain text, if the bytes are UTF-8
   * text; and otherwise as `application/octet-stream`. Given, it wins — the
   * caller may know better, and a type stated is never second-guessed.
   */
  readonly mimeType?: string
  /**
   * What to call it, recorded as a filename attribute.
   *
   * A label Telegram stores and shows, not a path. Nothing here touches a
   * filesystem, and a name that arrived from elsewhere is attacker-chosen —
   * `docs/security.md` §7.
   */
  readonly name?: string
  /**
   * What else describes it: duration, dimensions, a waveform, a sticker set.
   *
   * Passed through as given. These are facts about the content, and reading
   * them out of the bytes means decoding the format — so a caller that knows
   * them states them, and one that does not sends a plain file.
   */
  readonly attributes?: readonly TypeDocumentAttribute[]
}

/**
 * Send bytes this account has just uploaded, as a document.
 *
 * A document is the general form: anything Telegram does not interpret for
 * itself. That generality is the cost — a photo needs nothing beyond the file,
 * and a document needs at least to say what it is.
 *
 * ```ts
 * const uploaded = await account.upload({ source, name: 'report.pdf' })
 * await account.api.messages.sendMedia({
 *   peer,
 *   media: uploadedDocument(uploaded, { mimeType: 'application/pdf', name: 'report.pdf' }),
 *   message: '',
 *   random_id: id,
 * })
 * ```
 *
 * The name is stated here as well as at the upload because they are recorded in
 * different places: the upload's name travels with the parts, and the one a
 * recipient sees is a document attribute. Nothing copies one to the other,
 * because a caller sending the same bytes under a different name is doing
 * something reasonable.
 */
export function uploadedDocument(
  file: UploadedFile,
  options: UploadedDocumentOptions = {},
): TypeInputMedia {
  const named: TypeDocumentAttribute[] =
    options.name === undefined ? [] : [{ _: 'documentAttributeFilename', file_name: options.name }]
  // The name given here, or the one the parts travelled under.
  const name = options.name ?? (file.file.name === '' ? undefined : file.file.name)

  return {
    _: 'inputMediaUploadedDocument',
    file: file.file,
    mime_type: inferMimeType({ stated: options.mimeType, head: file.head, name }),
    // The caller's own attributes last, so one naming the file itself wins
    // over the convenience above rather than being silently outranked by it.
    attributes: [...named, ...(options.attributes ?? [])],
  }
}

/**
 * Whether a thumbnail can be had, and how.
 *
 * The schema has nine constructors for a thumbnail between a photo's sizes and
 * a document's, and they fall into four answers:
 *
 * | Availability  | Constructors                                            |
 * | ------------- | ------------------------------------------------------- |
 * | `download`    | `photoSize`, `photoSizeProgressive`, `videoSize`        |
 * | `embedded`    | `photoStrippedSize`, `photoCachedSize`, `photoPathSize` |
 * | `unsupported` | `videoSizeEmojiMarkup`, `videoSizeStickerMarkup`        |
 * | `unavailable` | `photoSizeEmpty`                                        |
 *
 * A `download` size is held on a datacenter and fetched with
 * {@link thumbnailFile}. An `embedded` one arrived inside the message and is
 * read with `embeddedThumbnail` from `@yuigram/mtproto/utils`, with no request.
 * An `unsupported` one is a recipe rather than a file — an emoji or a sticker to
 * animate over a background — which a client draws itself. An `unavailable`
 * one is listed with no content at all.
 */
export type ThumbnailAvailability = 'download' | 'embedded' | 'unsupported' | 'unavailable'

/**
 * One rendering of a photo or a document, reduced to what choosing between them
 * needs.
 *
 * `type` is Telegram's own single-letter name for the size — `s`, `m`, `x`,
 * `y`, `w` for the fetched ones, `i` and `a`–`c` for the ones that arrive with
 * the message, `u` and `v` for the moving ones. It is what a caller names when
 * it wants a particular size rather than the largest, and what the download
 * location carries. The two composition constructors carry no name; theirs is
 * the empty string.
 */
export interface Thumbnail {
  /** Telegram's name for this size. */
  readonly type: string
  /** Pixels across, where the size states them. */
  readonly width: number | undefined
  /** Pixels down, where the size states them. */
  readonly height: number | undefined
  /**
   * How many bytes fetching it costs, where that is known.
   *
   * Absent for a size that arrived with the message: there is nothing to fetch,
   * so there is no cost to state.
   */
  readonly bytes: number | undefined
  /** Whether it is fetched, arrived with the message, or neither. */
  readonly availability: ThumbnailAvailability
  /**
   * Whether this size has to be asked for: `availability` is `download`.
   *
   * False for the ones that came with the message — a stripped preview, a
   * cached blob, a vector outline — and for the ones that name no file at all.
   * {@link thumbnailFile} refuses those rather than building a location a
   * datacenter would reject.
   */
  readonly fetchable: boolean
  /** Whether it is a moving rendering: a video size rather than a picture. */
  readonly video: boolean
  /** The size as the schema describes it, for a field this does not name. */
  readonly raw: TypePhotoSize | TypeVideoSize
}

/** The name this had while only photos were described. */
export type PhotoThumbnail = Thumbnail

/**
 * Every rendering a photo or a document offers, largest first among the ones
 * worth fetching.
 *
 * ```ts
 * const sizes = thumbnails(photo)
 * const small = sizes.find((size) => size.type === 's')
 *
 * const preview = thumbnails(document).find((size) => size.availability === 'download')
 * ```
 *
 * Pictures come before moving renderings, so a photo's first fetchable entry is
 * the one {@link photoFile} would have chosen. The ones that arrived with the
 * message come after everything fetched — a caller scanning for something to
 * download finds it without filtering first.
 *
 * A document's are its thumbnails, never the document itself: that is one file,
 * fetched with {@link documentFile}.
 */
export function thumbnails(media: TypePhoto | TypeDocument): Thumbnail[] {
  if (media._ === 'photo') return ordered(media.sizes, media.video_sizes, undefined)
  if (media._ === 'document') return ordered(media.thumbs, media.video_thumbs, media.attributes)

  return []
}

/**
 * One named size of a photo or a document, or nothing where it offers none.
 *
 * ```ts
 * const preview = thumbnail(photo, 's')
 * ```
 *
 * Telegram decides which sizes a photo has, and the set differs between photos
 * — so this answers nothing rather than throwing, and a caller that needs some
 * size falls back to {@link photoFile}, which takes the largest there is.
 */
export function thumbnail(media: TypePhoto | TypeDocument, type: string): Thumbnail | undefined {
  return thumbnails(media).find((size) => size.type === type)
}

/**
 * Fetch one named size rather than the largest, or a document's thumbnail
 * rather than the document.
 *
 * ```ts
 * const bytes = await account.download(thumbnailFile(photo, 's'))
 * const preview = await account.download(thumbnailFile(document, 'm'))
 * ```
 *
 * The location is the one {@link photoFile} or {@link documentFile} builds, with
 * the size's own name in it — that field is what a datacenter reads to decide
 * which rendering to serve, so naming a size is the whole difference. The
 * identifier, the hash, the reference and the datacenter are the photo's or the
 * document's own: a thumbnail has none of its own.
 *
 * Refuses, by name, a size that is not there, one that arrived with the message,
 * and one that names no file at all. The reference is copied as it arrived, and
 * one that has expired is refused by the datacenter exactly as it is for the
 * whole file; `event.download({ thumbnail })` is the form that asks for the
 * message again when that happens.
 */
export function thumbnailFile(media: TypePhoto | TypeDocument, type: string): DownloadRequest {
  if (media._ === 'photoEmpty') {
    throw new ValidationError('an empty photo names no file to fetch')
  }
  if (media._ === 'documentEmpty') {
    throw new ValidationError('an empty document names no file to fetch')
  }

  const what = `${media._} ${media.id}`
  const size = thumbnail(media, type)
  if (size === undefined) {
    const offered = thumbnails(media)
      .map((one) => (one.type === '' ? `(${one.raw._})` : one.type))
      .join(', ')

    throw new ValidationError(
      `${what} has no size '${type}'; it offers ${offered === '' ? 'none' : offered}`,
    )
  }

  refuseUnfetchable(size, what)

  const named = {
    id: media.id,
    access_hash: media.access_hash,
    file_reference: media.file_reference,
    thumb_size: size.type,
  }

  return {
    dcId: media.dc_id,
    ...(size.bytes === undefined ? {} : { size: size.bytes }),
    location:
      media._ === 'photo'
        ? { _: 'inputPhotoFileLocation', ...named }
        : { _: 'inputDocumentFileLocation', ...named },
  }
}

/** Say why a size that is not fetched cannot be, and what to do instead. */
function refuseUnfetchable(size: Thumbnail, what: string): void {
  switch (size.availability) {
    case 'download':
      return

    case 'embedded':
      throw new ValidationError(
        `the '${size.type}' size of ${what} arrived with the message and names no file to fetch; ` +
          '`embeddedThumbnail` from @yuigram/mtproto/utils reads it',
      )

    case 'unsupported':
      throw new ValidationError(
        `the ${size.raw._} of ${what} is an animation to draw from a sticker, not a file to fetch`,
      )

    default:
      throw new ValidationError(`the '${size.type}' size of ${what} is listed with no content`)
  }
}

/**
 * Describe and order a photo's or a document's renderings.
 *
 * Fetched before everything else, pictures before moving ones, and within each
 * the largest first.
 */
function ordered(
  pictures: readonly TypePhotoSize[] | undefined,
  moving: readonly TypeVideoSize[] | undefined,
  attributes: readonly TypeDocumentAttribute[] | undefined,
): Thumbnail[] {
  const described = [
    ...(pictures ?? []).map((size) => describe(size, attributes)),
    ...(moving ?? []).map((size) => describeVideo(size)),
  ]

  return described.sort((left, right) => {
    if (left.fetchable !== right.fetchable) return left.fetchable ? -1 : 1
    if (left.video !== right.video) return left.video ? 1 : -1

    return weigh(right) - weigh(left)
  })
}

/** Read one picture size into the shape a caller chooses between. */
function describe(
  size: TypePhotoSize,
  attributes: readonly TypeDocumentAttribute[] | undefined,
): Thumbnail {
  const common = { type: size.type, bytes: fetchable(size)?.bytes, video: false, raw: size }

  switch (size._) {
    case 'photoSize':
    case 'photoSizeProgressive':
      return { ...common, width: size.w, height: size.h, ...available('download') }

    case 'photoCachedSize':
      return { ...common, width: size.w, height: size.h, ...available('embedded') }

    case 'photoPathSize': {
      // An outline is drawn on the canvas the sticker itself states, and on the
      // 512 by 512 one Telegram lays outlines out on where it states none.
      const canvas = attributes?.find((one) => one._ === 'documentAttributeImageSize')

      return {
        ...common,
        width: canvas?.w ?? OUTLINE_CANVAS,
        height: canvas?.h ?? OUTLINE_CANVAS,
        ...available('embedded'),
      }
    }

    case 'photoStrippedSize':
      return { ...common, width: undefined, height: undefined, ...available('embedded') }

    default:
      return { ...common, width: undefined, height: undefined, ...available('unavailable') }
  }
}

/** Read one moving rendering into the same shape. */
function describeVideo(size: TypeVideoSize): Thumbnail {
  if (size._ === 'videoSize') {
    return {
      type: size.type,
      width: size.w,
      height: size.h,
      bytes: size.size,
      video: true,
      raw: size,
      ...available('download'),
    }
  }

  return {
    type: '',
    width: undefined,
    height: undefined,
    bytes: undefined,
    video: true,
    raw: size,
    ...available('unsupported'),
  }
}

/** The canvas a path thumbnail is drawn on where nothing says otherwise. */
const OUTLINE_CANVAS = 512

const available = (availability: ThumbnailAvailability) => ({
  availability,
  fetchable: availability === 'download',
})

/** How a size ranks against another of the same kind. */
const weigh = (size: Thumbnail) =>
  size.bytes !== undefined && size.bytes > 0 ? size.bytes : (size.width ?? 0) * (size.height ?? 0)
