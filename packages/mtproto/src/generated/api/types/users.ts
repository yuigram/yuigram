// GENERATED FILE — do not edit.
// TL types for users
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type * as root_c$ from './root/c.js'
import type * as root_d$ from './root/d.js'
import type * as root_u$ from './root/u.js'
import type { TlObject } from '../../../tl/object.js'

/** `users.savedMusic#34a2f297` */
export interface SavedMusic {
  readonly _: 'users.savedMusic'
  readonly count: number
  readonly documents: readonly root_d$.TypeDocument[]
}

/** `users.savedMusicNotModified#e3878aa4` */
export interface SavedMusicNotModified {
  readonly _: 'users.savedMusicNotModified'
  readonly count: number
}

/** Any `users.SavedMusic`. */
export type TypeSavedMusic =
  | SavedMusic
  | SavedMusicNotModified

/** Any `users.UserFull`. */
export type TypeUserFull =
  | UserFull

/** Any `users.Users`. */
export type TypeUsers =
  | Users
  | UsersSlice

/** `users.userFull#3b6d152e` */
export interface UserFull {
  readonly _: 'users.userFull'
  readonly full_user: root_u$.TypeUserFull
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `users.users#62d706b8` */
export interface Users {
  readonly _: 'users.users'
  readonly users: readonly root_u$.TypeUser[]
}

/** `users.usersSlice#315a4974` */
export interface UsersSlice {
  readonly _: 'users.usersSlice'
  readonly count: number
  readonly users: readonly root_u$.TypeUser[]
}
