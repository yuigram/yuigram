// GENERATED FILE — do not edit.
// TL types for upload
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type * as root_f$ from './root/f.js'
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
