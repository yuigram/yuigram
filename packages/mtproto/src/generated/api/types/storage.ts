// GENERATED FILE — do not edit.
// TL types for storage
// Source: Telegram TL layer 229, schemas/tl/api.229.tl

import type { TlObject } from '../../../tl/object.js'

/** `storage.fileGif#cae1aadf` */
export interface FileGif {
  readonly _: 'storage.fileGif'
}

/** `storage.fileJpeg#007efe0e` */
export interface FileJpeg {
  readonly _: 'storage.fileJpeg'
}

/** `storage.fileMov#4b09ebbc` */
export interface FileMov {
  readonly _: 'storage.fileMov'
}

/** `storage.fileMp3#528a0677` */
export interface FileMp3 {
  readonly _: 'storage.fileMp3'
}

/** `storage.fileMp4#b3cea0e4` */
export interface FileMp4 {
  readonly _: 'storage.fileMp4'
}

/** `storage.filePartial#40bc6f52` */
export interface FilePartial {
  readonly _: 'storage.filePartial'
}

/** `storage.filePdf#ae1e508d` */
export interface FilePdf {
  readonly _: 'storage.filePdf'
}

/** `storage.filePng#0a4f63c0` */
export interface FilePng {
  readonly _: 'storage.filePng'
}

/** `storage.fileUnknown#aa963b05` */
export interface FileUnknown {
  readonly _: 'storage.fileUnknown'
}

/** `storage.fileWebp#1081464c` */
export interface FileWebp {
  readonly _: 'storage.fileWebp'
}

/** Any `storage.FileType`. */
export type TypeFileType =
  | FileGif
  | FileJpeg
  | FileMov
  | FileMp3
  | FileMp4
  | FilePartial
  | FilePdf
  | FilePng
  | FileUnknown
  | FileWebp
