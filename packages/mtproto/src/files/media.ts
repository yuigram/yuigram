/**
 * Naming the file a message carried, so it can be fetched.
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
 */

import { ValidationError } from '@yuigram/core'
import type { TypeDocument, TypePhoto, TypePhotoSize } from '../generated/api/types/index.js'
import type { DownloadRequest } from './download.js'

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

  // A document is one file, so the thumbnail selector names none of them. A
  // document's own thumbnails are photo sizes and share the choice photos have.
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
