// GENERATED FILE — do not edit.
// TL types for photos
// Source: Telegram TL layer 229, schemas/tl/api.229.tl

import type * as root_i$ from './root/i.js'
import type * as root_p$ from './root/p.js'
import type * as root_u$ from './root/u.js'
import type * as root_v$ from './root/v.js'
import type { TlObject } from '../../../tl/object.js'

/** `photos.deletePhotos#87cf7f2f` */
export interface DeletePhotos {
  readonly _: 'photos.deletePhotos'
  readonly id: readonly root_i$.TypeInputPhoto[]
}

/** `photos.getUserPhotos#91cd32a8` */
export interface GetUserPhotos {
  readonly _: 'photos.getUserPhotos'
  readonly user_id: root_i$.TypeInputUser
  readonly offset: number
  readonly max_id: bigint
  readonly limit: number
}

/** `photos.photo#20212ca8` */
export interface Photo {
  readonly _: 'photos.photo'
  readonly photo: root_p$.TypePhoto
  readonly users: readonly root_u$.TypeUser[]
}

/** `photos.photos#8dca6aa5` */
export interface Photos {
  readonly _: 'photos.photos'
  readonly photos: readonly root_p$.TypePhoto[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `photos.photosSlice#15051f54` */
export interface PhotosSlice {
  readonly _: 'photos.photosSlice'
  readonly count: number
  readonly photos: readonly root_p$.TypePhoto[]
  readonly users: readonly root_u$.TypeUser[]
}

/** Any `photos.Photo`. */
export type TypePhoto =
  | Photo

/** Any `photos.Photos`. */
export type TypePhotos =
  | Photos
  | PhotosSlice

/** `photos.updateProfilePhoto#09e82039` */
export interface UpdateProfilePhoto {
  readonly _: 'photos.updateProfilePhoto'
  readonly fallback?: true
  readonly bot?: root_i$.TypeInputUser
  readonly id: root_i$.TypeInputPhoto
}

/** `photos.uploadContactProfilePhoto#e14c4a71` */
export interface UploadContactProfilePhoto {
  readonly _: 'photos.uploadContactProfilePhoto'
  readonly suggest?: true
  readonly save?: true
  readonly user_id: root_i$.TypeInputUser
  readonly file?: root_i$.TypeInputFile
  readonly video?: root_i$.TypeInputFile
  readonly video_start_ts?: number
  readonly video_emoji_markup?: root_v$.TypeVideoSize
}

/** `photos.uploadProfilePhoto#0388a3b5` */
export interface UploadProfilePhoto {
  readonly _: 'photos.uploadProfilePhoto'
  readonly fallback?: true
  readonly bot?: root_i$.TypeInputUser
  readonly file?: root_i$.TypeInputFile
  readonly video?: root_i$.TypeInputFile
  readonly video_start_ts?: number
  readonly video_emoji_markup?: root_v$.TypeVideoSize
}
