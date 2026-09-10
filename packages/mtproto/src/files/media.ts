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
 * **A document is the whole of it.** A photo is not one file but several — the
 * same picture at several sizes, named by a `type` a caller has to pick between
 * — and which one a framework should reach for is not something the protocol
 * decides. That choice is not made here, so photos are absent rather than
 * guessed at; `docs/mtproto.md` §11 records what is missing.
 */

import { ValidationError } from '@yuigram/core'
import type { TypeDocument } from '../generated/api/types/index.js'
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
