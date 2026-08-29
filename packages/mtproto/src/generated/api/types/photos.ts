// GENERATED FILE — do not edit.
// TL types for photos
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type * as root_p$ from './root/p.js'
import type * as root_u$ from './root/u.js'
import type { TlObject } from '../../../tl/object.js'

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
