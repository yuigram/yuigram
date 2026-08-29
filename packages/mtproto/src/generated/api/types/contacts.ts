// GENERATED FILE — do not edit.
// TL types for contacts
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type * as root_c$ from './root/c.js'
import type * as root_i$ from './root/i.js'
import type * as root_p$ from './root/p.js'
import type * as root_s$ from './root/s.js'
import type * as root_t$ from './root/t.js'
import type * as root_u$ from './root/u.js'
import type { TlObject } from '../../../tl/object.js'

/** `contacts.blocked#0ade1591` */
export interface Blocked {
  readonly _: 'contacts.blocked'
  readonly blocked: readonly root_p$.TypePeerBlocked[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `contacts.blockedSlice#e1664194` */
export interface BlockedSlice {
  readonly _: 'contacts.blockedSlice'
  readonly count: number
  readonly blocked: readonly root_p$.TypePeerBlocked[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `contacts.contactBirthdays#114ff30d` */
export interface ContactBirthdays {
  readonly _: 'contacts.contactBirthdays'
  readonly contacts: readonly root_c$.TypeContactBirthday[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `contacts.contacts#eae87e42` */
export interface Contacts {
  readonly _: 'contacts.contacts'
  readonly contacts: readonly root_c$.TypeContact[]
  readonly saved_count: number
  readonly users: readonly root_u$.TypeUser[]
}

/** `contacts.contactsNotModified#b74ba9d2` */
export interface ContactsNotModified {
  readonly _: 'contacts.contactsNotModified'
}

/** `contacts.found#b3134d9d` */
export interface Found {
  readonly _: 'contacts.found'
  readonly my_results: readonly root_p$.TypePeer[]
  readonly results: readonly root_p$.TypePeer[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `contacts.importedContacts#77d01c3b` */
export interface ImportedContacts {
  readonly _: 'contacts.importedContacts'
  readonly imported: readonly root_i$.TypeImportedContact[]
  readonly popular_invites: readonly root_p$.TypePopularContact[]
  readonly retry_contacts: readonly bigint[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `contacts.resolvedPeer#7f077ad9` */
export interface ResolvedPeer {
  readonly _: 'contacts.resolvedPeer'
  readonly peer: root_p$.TypePeer
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `contacts.sponsoredPeers#eb032884` */
export interface SponsoredPeers {
  readonly _: 'contacts.sponsoredPeers'
  readonly peers: readonly root_s$.TypeSponsoredPeer[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `contacts.sponsoredPeersEmpty#ea32b4b1` */
export interface SponsoredPeersEmpty {
  readonly _: 'contacts.sponsoredPeersEmpty'
}

/** `contacts.topPeers#70b772a8` */
export interface TopPeers {
  readonly _: 'contacts.topPeers'
  readonly categories: readonly root_t$.TypeTopPeerCategoryPeers[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `contacts.topPeersDisabled#b52c939d` */
export interface TopPeersDisabled {
  readonly _: 'contacts.topPeersDisabled'
}

/** `contacts.topPeersNotModified#de266ef5` */
export interface TopPeersNotModified {
  readonly _: 'contacts.topPeersNotModified'
}

/** Any `contacts.Blocked`. */
export type TypeBlocked =
  | Blocked
  | BlockedSlice

/** Any `contacts.ContactBirthdays`. */
export type TypeContactBirthdays =
  | ContactBirthdays

/** Any `contacts.Contacts`. */
export type TypeContacts =
  | Contacts
  | ContactsNotModified

/** Any `contacts.Found`. */
export type TypeFound =
  | Found

/** Any `contacts.ImportedContacts`. */
export type TypeImportedContacts =
  | ImportedContacts

/** Any `contacts.ResolvedPeer`. */
export type TypeResolvedPeer =
  | ResolvedPeer

/** Any `contacts.SponsoredPeers`. */
export type TypeSponsoredPeers =
  | SponsoredPeers
  | SponsoredPeersEmpty

/** Any `contacts.TopPeers`. */
export type TypeTopPeers =
  | TopPeers
  | TopPeersDisabled
  | TopPeersNotModified
