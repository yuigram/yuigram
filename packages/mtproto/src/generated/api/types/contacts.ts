// GENERATED FILE — do not edit.
// TL types for contacts
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MPL-2.0 AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as root_c$ from './root/c.js'
import type * as root_i$ from './root/i.js'
import type * as root_p$ from './root/p.js'
import type * as root_s$ from './root/s.js'
import type * as root_t$ from './root/t.js'
import type * as root_u$ from './root/u.js'
import type { TlObject } from '../../../tl/object.js'

/** `contacts.acceptContact#f831a20f` */
export interface AcceptContact {
  readonly _: 'contacts.acceptContact'
  readonly id: root_i$.TypeInputUser
}

/** `contacts.addContact#d9ba2e54` */
export interface AddContact {
  readonly _: 'contacts.addContact'
  readonly add_phone_privacy_exception?: true
  readonly id: root_i$.TypeInputUser
  readonly first_name: string
  readonly last_name: string
  readonly phone: string
  readonly note?: root_t$.TypeTextWithEntities
}

/** `contacts.block#2e2e8734` */
export interface Block {
  readonly _: 'contacts.block'
  readonly my_stories_from?: true
  readonly id: root_i$.TypeInputPeer
}

/** `contacts.blockFromReplies#29a8962c` */
export interface BlockFromReplies {
  readonly _: 'contacts.blockFromReplies'
  readonly delete_message?: true
  readonly delete_history?: true
  readonly report_spam?: true
  readonly msg_id: number
}

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

/** `contacts.deleteByPhones#1013fd9e` */
export interface DeleteByPhones {
  readonly _: 'contacts.deleteByPhones'
  readonly phones: readonly string[]
}

/** `contacts.deleteContacts#096a0e00` */
export interface DeleteContacts {
  readonly _: 'contacts.deleteContacts'
  readonly id: readonly root_i$.TypeInputUser[]
}

/** `contacts.editCloseFriends#ba6705f0` */
export interface EditCloseFriends {
  readonly _: 'contacts.editCloseFriends'
  readonly id: readonly bigint[]
}

/** `contacts.exportContactToken#f8654027` */
export interface ExportContactToken {
  readonly _: 'contacts.exportContactToken'
}

/** `contacts.found#b3134d9d` */
export interface Found {
  readonly _: 'contacts.found'
  readonly my_results: readonly root_p$.TypePeer[]
  readonly results: readonly root_p$.TypePeer[]
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `contacts.getBirthdays#daeda864` */
export interface GetBirthdays {
  readonly _: 'contacts.getBirthdays'
}

/** `contacts.getBlocked#9a868f80` */
export interface GetBlocked {
  readonly _: 'contacts.getBlocked'
  readonly my_stories_from?: true
  readonly offset: number
  readonly limit: number
}

/** `contacts.getContactIDs#7adc669d` */
export interface GetContactIDs {
  readonly _: 'contacts.getContactIDs'
  readonly hash: bigint
}

/** `contacts.getContacts#5dd69e12` */
export interface GetContacts {
  readonly _: 'contacts.getContacts'
  readonly hash: bigint
}

/** `contacts.getLocated#d348bc44` */
export interface GetLocated {
  readonly _: 'contacts.getLocated'
  readonly background?: true
  readonly geo_point: root_i$.TypeInputGeoPoint
  readonly self_expires?: number
}

/** `contacts.getSaved#82f1e39f` */
export interface GetSaved {
  readonly _: 'contacts.getSaved'
}

/** `contacts.getSponsoredPeers#b6c8c393` */
export interface GetSponsoredPeers {
  readonly _: 'contacts.getSponsoredPeers'
  readonly q: string
}

/** `contacts.getStatuses#c4a353ee` */
export interface GetStatuses {
  readonly _: 'contacts.getStatuses'
}

/** `contacts.getTopPeers#973478b6` */
export interface GetTopPeers {
  readonly _: 'contacts.getTopPeers'
  readonly correspondents?: true
  readonly bots_pm?: true
  readonly bots_inline?: true
  readonly phone_calls?: true
  readonly forward_users?: true
  readonly forward_chats?: true
  readonly groups?: true
  readonly channels?: true
  readonly bots_app?: true
  readonly bots_guestchat?: true
  readonly offset: number
  readonly limit: number
  readonly hash: bigint
}

/** `contacts.importContactToken#13005788` */
export interface ImportContactToken {
  readonly _: 'contacts.importContactToken'
  readonly token: string
}

/** `contacts.importContacts#2c800be5` */
export interface ImportContacts {
  readonly _: 'contacts.importContacts'
  readonly contacts: readonly root_i$.TypeInputContact[]
}

/** `contacts.importedContacts#77d01c3b` */
export interface ImportedContacts {
  readonly _: 'contacts.importedContacts'
  readonly imported: readonly root_i$.TypeImportedContact[]
  readonly popular_invites: readonly root_p$.TypePopularContact[]
  readonly retry_contacts: readonly bigint[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `contacts.resetSaved#879537f1` */
export interface ResetSaved {
  readonly _: 'contacts.resetSaved'
}

/** `contacts.resetTopPeerRating#1ae373ac` */
export interface ResetTopPeerRating {
  readonly _: 'contacts.resetTopPeerRating'
  readonly category: root_t$.TypeTopPeerCategory
  readonly peer: root_i$.TypeInputPeer
}

/** `contacts.resolvePhone#8af94344` */
export interface ResolvePhone {
  readonly _: 'contacts.resolvePhone'
  readonly phone: string
}

/** `contacts.resolveUsername#725afbbc` */
export interface ResolveUsername {
  readonly _: 'contacts.resolveUsername'
  readonly username: string
  readonly referer?: string
}

/** `contacts.resolvedPeer#7f077ad9` */
export interface ResolvedPeer {
  readonly _: 'contacts.resolvedPeer'
  readonly peer: root_p$.TypePeer
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** `contacts.search#05f58d0f` */
export interface Search {
  readonly _: 'contacts.search'
  readonly broadcasts?: true
  readonly bots?: true
  readonly q: string
  readonly limit: number
}

/** `contacts.setBlocked#94c65c76` */
export interface SetBlocked {
  readonly _: 'contacts.setBlocked'
  readonly my_stories_from?: true
  readonly id: readonly root_i$.TypeInputPeer[]
  readonly limit: number
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

/** `contacts.toggleTopPeers#8514bdda` */
export interface ToggleTopPeers {
  readonly _: 'contacts.toggleTopPeers'
  readonly enabled: boolean
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

/** `contacts.unblock#b550d328` */
export interface Unblock {
  readonly _: 'contacts.unblock'
  readonly my_stories_from?: true
  readonly id: root_i$.TypeInputPeer
}

/** `contacts.updateContactNote#139f63fb` */
export interface UpdateContactNote {
  readonly _: 'contacts.updateContactNote'
  readonly id: root_i$.TypeInputUser
  readonly note: root_t$.TypeTextWithEntities
}
