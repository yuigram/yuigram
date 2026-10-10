// GENERATED FILE — do not edit.
// TL types for upload
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as root_f$ from './root/f.js'
import type * as root_i$ from './root/i.js'
import type * as storage$ from './storage.js'
import type { TlObject } from '../../../tl/object.js'

/** `upload.cdnFile#a99fca4f` */
export interface CdnFile {
  readonly _: 'upload.cdnFile'
  readonly bytes: Uint8Array
}

/** `upload.cdnFileReuploadNeeded#eea8e46e` */
export interface CdnFileReuploadNeeded {
  readonly _: 'upload.cdnFileReuploadNeeded'
  readonly request_token: Uint8Array
}

/** `upload.file#096a18d5` */
export interface File {
  readonly _: 'upload.file'
  readonly type: storage$.TypeFileType
  readonly mtime: number
  readonly bytes: Uint8Array
}

/** `upload.fileCdnRedirect#f18cda44` */
export interface FileCdnRedirect {
  readonly _: 'upload.fileCdnRedirect'
  readonly dc_id: number
  readonly file_token: Uint8Array
  readonly encryption_key: Uint8Array
  readonly encryption_iv: Uint8Array
  readonly file_hashes: readonly root_f$.TypeFileHash[]
}

/** `upload.getCdnFile#395f69da` */
export interface GetCdnFile {
  readonly _: 'upload.getCdnFile'
  readonly file_token: Uint8Array
  readonly offset: bigint
  readonly limit: number
}

/** `upload.getCdnFileHashes#91dc3f31` */
export interface GetCdnFileHashes {
  readonly _: 'upload.getCdnFileHashes'
  readonly file_token: Uint8Array
  readonly offset: bigint
}

/** `upload.getFile#be5335be` */
export interface GetFile {
  readonly _: 'upload.getFile'
  readonly precise?: true
  readonly cdn_supported?: true
  readonly location: root_i$.TypeInputFileLocation
  readonly offset: bigint
  readonly limit: number
}

/** `upload.getFileHashes#9156982a` */
export interface GetFileHashes {
  readonly _: 'upload.getFileHashes'
  readonly location: root_i$.TypeInputFileLocation
  readonly offset: bigint
}

/** `upload.getWebFile#24e6818d` */
export interface GetWebFile {
  readonly _: 'upload.getWebFile'
  readonly location: root_i$.TypeInputWebFileLocation
  readonly offset: number
  readonly limit: number
}

/** `upload.reuploadCdnFile#9b2754a8` */
export interface ReuploadCdnFile {
  readonly _: 'upload.reuploadCdnFile'
  readonly file_token: Uint8Array
  readonly request_token: Uint8Array
}

/** `upload.saveBigFilePart#de7b673d` */
export interface SaveBigFilePart {
  readonly _: 'upload.saveBigFilePart'
  readonly file_id: bigint
  readonly file_part: number
  readonly file_total_parts: number
  readonly bytes: Uint8Array
}

/** `upload.saveFilePart#b304a621` */
export interface SaveFilePart {
  readonly _: 'upload.saveFilePart'
  readonly file_id: bigint
  readonly file_part: number
  readonly bytes: Uint8Array
}

/** Any `upload.CdnFile`. */
export type TypeCdnFile =
  | CdnFile
  | CdnFileReuploadNeeded

/** Any `upload.File`. */
export type TypeFile =
  | File
  | FileCdnRedirect

/** Any `upload.WebFile`. */
export type TypeWebFile =
  | WebFile

/** `upload.webFile#21e753bc` */
export interface WebFile {
  readonly _: 'upload.webFile'
  readonly size: number
  readonly mime_type: string
  readonly file_type: storage$.TypeFileType
  readonly mtime: number
  readonly bytes: Uint8Array
}
