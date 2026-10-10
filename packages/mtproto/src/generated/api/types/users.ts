// GENERATED FILE — do not edit.
// TL types for users
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as root_b$ from './root/b.js'
import type * as root_c$ from './root/c.js'
import type * as root_d$ from './root/d.js'
import type * as root_i$ from './root/i.js'
import type * as root_s$ from './root/s.js'
import type * as root_u$ from './root/u.js'
import type { TlObject } from '../../../tl/object.js'

/** `users.getFullUser#b60f5918` */
export interface GetFullUser {
  readonly _: 'users.getFullUser'
  readonly id: root_i$.TypeInputUser
}

/** `users.getRequirementsToContact#d89a83a3` */
export interface GetRequirementsToContact {
  readonly _: 'users.getRequirementsToContact'
  readonly id: readonly root_i$.TypeInputUser[]
}

/** `users.getSavedMusic#788d7fe3` */
export interface GetSavedMusic {
  readonly _: 'users.getSavedMusic'
  readonly id: root_i$.TypeInputUser
  readonly offset: number
  readonly limit: number
  readonly hash: bigint
}

/** `users.getSavedMusicByID#7573a4e9` */
export interface GetSavedMusicByID {
  readonly _: 'users.getSavedMusicByID'
  readonly id: root_i$.TypeInputUser
  readonly documents: readonly root_i$.TypeInputDocument[]
}

/** `users.getUsers#0d91a548` */
export interface GetUsers {
  readonly _: 'users.getUsers'
  readonly id: readonly root_i$.TypeInputUser[]
}

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

/** `users.setSecureValueErrors#90c894b5` */
export interface SetSecureValueErrors {
  readonly _: 'users.setSecureValueErrors'
  readonly id: root_i$.TypeInputUser
  readonly errors: readonly root_s$.TypeSecureValueError[]
}

/** `users.suggestBirthday#fc533372` */
export interface SuggestBirthday {
  readonly _: 'users.suggestBirthday'
  readonly id: root_i$.TypeInputUser
  readonly birthday: root_b$.TypeBirthday
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
