// GENERATED FILE — do not edit.
// TL types for wallet
// Source: Telegram TL layer 232, schemas/tl/api.232.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type * as root_c$ from './root/c.js'
import type * as root_d$ from './root/d.js'
import type * as root_i$ from './root/i.js'
import type * as root_m$ from './root/m.js'
import type * as root_s$ from './root/s.js'
import type * as root_t$ from './root/t.js'
import type * as root_u$ from './root/u.js'
import type * as root_w$ from './root/w.js'
import type { TlObject } from '../../../tl/object.js'

/** `wallet.card#8ed043b1` */
export interface Card {
  readonly _: 'wallet.card'
  readonly stickers?: readonly TypeCardSticker[]
  readonly bg_nft_item?: TypeNftItem
  readonly address: string
  readonly balance: bigint
}

/** `wallet.cardSticker#f3010cba` */
export interface CardSticker {
  readonly _: 'wallet.cardSticker'
  readonly coordinates: root_m$.TypeMediaAreaCoordinates
  readonly nft: TypeNftItem
}

/** `wallet.disableBackup#0b0bf0da` */
export interface DisableBackup {
  readonly _: 'wallet.disableBackup'
  readonly password?: root_i$.TypeInputCheckPasswordSRP
  readonly new_public_key?: Uint8Array
  readonly proof?: root_w$.TypeWalletOwnershipProof
}

/** `wallet.enableBackup#4500c525` */
export interface EnableBackup {
  readonly _: 'wallet.enableBackup'
  readonly parts: readonly Uint8Array[]
  readonly new_public_key?: Uint8Array
  readonly proof?: root_w$.TypeWalletOwnershipProof
}

/** `wallet.encryptedSecretPhrasePart#18e82537` */
export interface EncryptedSecretPhrasePart {
  readonly _: 'wallet.encryptedSecretPhrasePart'
  readonly data: Uint8Array
}

/** `wallet.existingBalance#bde90a8d` */
export interface ExistingBalance {
  readonly _: 'wallet.existingBalance'
  readonly has_balance?: true
  readonly url: string
}

/** `wallet.exportSecretPhrase#9077c9ac` */
export interface ExportSecretPhrase {
  readonly _: 'wallet.exportSecretPhrase'
  readonly password?: root_i$.TypeInputCheckPasswordSRP
}

/** `wallet.fetchEncryptedSecretPhrasePart#f53925cf` */
export interface FetchEncryptedSecretPhrasePart {
  readonly _: 'wallet.fetchEncryptedSecretPhrasePart'
  readonly token: string
  readonly public_key: Uint8Array
}

/** `wallet.getBackupHolderDcs#d179d494` */
export interface GetBackupHolderDcs {
  readonly _: 'wallet.getBackupHolderDcs'
}

/** `wallet.getExistingWaltBalance#691f4360` */
export interface GetExistingWaltBalance {
  readonly _: 'wallet.getExistingWaltBalance'
}

/** `wallet.getGaslessInfo#742df0a1` */
export interface GetGaslessInfo {
  readonly _: 'wallet.getGaslessInfo'
}

/** `wallet.getNfts#8c12f3a4` */
export interface GetNfts {
  readonly _: 'wallet.getNfts'
  readonly offset: string
  readonly limit: number
}

/** `wallet.getProofChallenge#2025e697` */
export interface GetProofChallenge {
  readonly _: 'wallet.getProofChallenge'
}

/** `wallet.getState#ab83b33a` */
export interface GetState {
  readonly _: 'wallet.getState'
}

/** `wallet.getTransactions#a8830a83` */
export interface GetTransactions {
  readonly _: 'wallet.getTransactions'
  readonly inbound?: true
  readonly outbound?: true
  readonly offset: string
  readonly limit: number
}

/** `wallet.getTransactionsByIDs#811ceab6` */
export interface GetTransactionsByIDs {
  readonly _: 'wallet.getTransactionsByIDs'
  readonly id: readonly string[]
}

/** `wallet.getTransactionsByMsgHash#a6bb795d` */
export interface GetTransactionsByMsgHash {
  readonly _: 'wallet.getTransactionsByMsgHash'
  readonly msg_hash: readonly string[]
}

/** `wallet.getUserAddresses#5275dfdd` */
export interface GetUserAddresses {
  readonly _: 'wallet.getUserAddresses'
  readonly force?: true
  readonly id: readonly root_i$.TypeInputUser[]
  readonly addresses: readonly string[]
}

/** `wallet.holderDc#f9d612ef` */
export interface HolderDc {
  readonly _: 'wallet.holderDc'
  readonly dc: number
  readonly public_key: Uint8Array
}

/** `wallet.nftAttribute#4c1ef10e` */
export interface NftAttribute {
  readonly _: 'wallet.nftAttribute'
  readonly trait_type: string
  readonly value: string
}

/** `wallet.nftItem#173dfaf3` */
export interface NftItem {
  readonly _: 'wallet.nftItem'
  readonly collection_address?: string
  readonly address: string
  readonly owner_address: string
  readonly index: string
  readonly name?: string
  readonly description?: string
  readonly image?: root_w$.TypeWebDocument
  readonly image_small?: root_w$.TypeWebDocument
  readonly content_url?: root_w$.TypeWebDocument
  readonly lottie?: root_w$.TypeWebDocument
  readonly attributes?: readonly TypeNftAttribute[]
  readonly extra?: root_d$.TypeDataJSON
  readonly gift?: root_s$.TypeStarGift
}

/** `wallet.nftItems#794d486f` */
export interface NftItems {
  readonly _: 'wallet.nftItems'
  readonly items: readonly TypeNftItem[]
  readonly next_offset?: string
}

/** `wallet.proofChallenge#99e41707` */
export interface ProofChallenge {
  readonly _: 'wallet.proofChallenge'
  readonly payload: string
  readonly expires: number
  readonly domain: string
}

/** `wallet.replaceWallet#d8c72eec` */
export interface ReplaceWallet {
  readonly _: 'wallet.replaceWallet'
  readonly wallet: root_i$.TypeInputWalletReplacement
  readonly password?: root_i$.TypeInputCheckPasswordSRP
}

/** `wallet.secretPhraseParts#e6d0ef01` */
export interface SecretPhraseParts {
  readonly _: 'wallet.secretPhraseParts'
  readonly token: string
  readonly dcs: readonly number[]
}

/** `wallet.sendTransfer#d9e5d9e2` */
export interface SendTransfer {
  readonly _: 'wallet.sendTransfer'
  readonly data_normal: Uint8Array
  readonly data_gasless?: Uint8Array
  readonly user_id: root_i$.TypeInputUser
  readonly random_id: bigint
}

/** `wallet.setCardStickers#068509ac` */
export interface SetCardStickers {
  readonly _: 'wallet.setCardStickers'
  readonly stickers: readonly root_i$.TypeInputWalletCardSticker[]
  readonly bg_nft_address?: string
}

/** `wallet.tonConnectChallenge#4bc89693` */
export interface TonConnectChallenge {
  readonly _: 'wallet.tonConnectChallenge'
  readonly challenge: Uint8Array
  readonly event_id: bigint
}

/** `wallet.tonConnectClaimRequest#66b57b41` */
export interface TonConnectClaimRequest {
  readonly _: 'wallet.tonConnectClaimRequest'
  readonly declined?: true
  readonly session_id: bigint
  readonly msg_id: number
  readonly app_request_id: string
  readonly challenge_answer?: Uint8Array
}

/** `wallet.tonConnectCloseSession#d63f61ce` */
export interface TonConnectCloseSession {
  readonly _: 'wallet.tonConnectCloseSession'
  readonly session_id: bigint
  readonly body?: Uint8Array
}

/** `wallet.tonConnectCreateSession#cc931046` */
export interface TonConnectCreateSession {
  readonly _: 'wallet.tonConnectCreateSession'
  readonly dapp_client_id: string
  readonly manifest_url: string
}

/** `wallet.tonConnectGetPending#11aee065` */
export interface TonConnectGetPending {
  readonly _: 'wallet.tonConnectGetPending'
  readonly dapp_client_id?: string
  readonly session_id?: bigint
}

/** `wallet.tonConnectGetSessions#a7ffb56e` */
export interface TonConnectGetSessions {
  readonly _: 'wallet.tonConnectGetSessions'
}

/** `wallet.tonConnectNextEventId#775d7244` */
export interface TonConnectNextEventId {
  readonly _: 'wallet.tonConnectNextEventId'
  readonly session_id: bigint
}

/** `wallet.tonConnectPending#85c0f124` */
export interface TonConnectPending {
  readonly _: 'wallet.tonConnectPending'
  readonly session: root_t$.TypeTonConnectSession
  readonly requests: readonly root_t$.TypeTonConnectRequest[]
}

/** `wallet.tonConnectRegisterKey#338bcf1c` */
export interface TonConnectRegisterKey {
  readonly _: 'wallet.tonConnectRegisterKey'
  readonly session_id: bigint
  readonly client_id: string
}

/** `wallet.tonConnectSessions#0e1f6896` */
export interface TonConnectSessions {
  readonly _: 'wallet.tonConnectSessions'
  readonly sessions: readonly root_t$.TypeTonConnectSession[]
}

/** `wallet.tonConnectSubmitConnectResult#c2c00779` */
export interface TonConnectSubmitConnectResult {
  readonly _: 'wallet.tonConnectSubmitConnectResult'
  readonly error?: true
  readonly session_id: bigint
  readonly challenge_answer: Uint8Array
  readonly body: Uint8Array
  readonly trace_id?: string
}

/** `wallet.tonConnectSubmitResponse#fac67d3c` */
export interface TonConnectSubmitResponse {
  readonly _: 'wallet.tonConnectSubmitResponse'
  readonly session_id: bigint
  readonly msg_id: number
  readonly body: Uint8Array
  readonly trace_id?: string
}

/** `wallet.transactions#4322d5a5` */
export interface Transactions {
  readonly _: 'wallet.transactions'
  readonly balance: bigint
  readonly transactions: readonly root_w$.TypeWalletTransaction[]
  readonly next_offset?: string
  readonly chats: readonly root_c$.TypeChat[]
  readonly users: readonly root_u$.TypeUser[]
}

/** Any `wallet.Card`. */
export type TypeCard =
  | Card

/** Any `wallet.CardSticker`. */
export type TypeCardSticker =
  | CardSticker

/** Any `wallet.EncryptedSecretPhrasePart`. */
export type TypeEncryptedSecretPhrasePart =
  | EncryptedSecretPhrasePart

/** Any `wallet.ExistingBalance`. */
export type TypeExistingBalance =
  | ExistingBalance

/** Any `wallet.HolderDc`. */
export type TypeHolderDc =
  | HolderDc

/** Any `wallet.NftAttribute`. */
export type TypeNftAttribute =
  | NftAttribute

/** Any `wallet.NftItem`. */
export type TypeNftItem =
  | NftItem

/** Any `wallet.NftItems`. */
export type TypeNftItems =
  | NftItems

/** Any `wallet.ProofChallenge`. */
export type TypeProofChallenge =
  | ProofChallenge

/** Any `wallet.SecretPhraseParts`. */
export type TypeSecretPhraseParts =
  | SecretPhraseParts

/** Any `wallet.TonConnectChallenge`. */
export type TypeTonConnectChallenge =
  | TonConnectChallenge

/** Any `wallet.TonConnectPending`. */
export type TypeTonConnectPending =
  | TonConnectPending

/** Any `wallet.TonConnectSessions`. */
export type TypeTonConnectSessions =
  | TonConnectSessions

/** Any `wallet.Transactions`. */
export type TypeTransactions =
  | Transactions

/** Any `wallet.UserAddresses`. */
export type TypeUserAddresses =
  | UserAddresses

/** `wallet.userAddresses#928e7b55` */
export interface UserAddresses {
  readonly _: 'wallet.userAddresses'
  readonly addresses: readonly root_w$.TypeWalletUserAddress[]
  readonly users: readonly root_u$.TypeUser[]
}
