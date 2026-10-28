// GENERATED FILE — do not edit.
// Wire layout for wallet
// Source: Telegram TL layer 232, schemas/tl/api.232.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

import type { TlEntry } from '../../../tl/schema.js'

/** 41 combinators. */
export const ENTRIES: readonly TlEntry[] = [
  { id: 0x8ed043b1, n: 'wallet.card', f: [{ n: 'flags', b: 1 }, { n: 'stickers', t: { v: 'obj' }, c: 'flags', i: 0 }, { n: 'bg_nft_item', t: 'obj', c: 'flags', i: 1 }, { n: 'address', t: 'string' }, { n: 'balance', t: 'long' }] },
  { id: 0xf3010cba, n: 'wallet.cardSticker', f: [{ n: 'coordinates', t: 'obj' }, { n: 'nft', t: 'obj' }] },
  { id: 0x0b0bf0da, n: 'wallet.disableBackup', f: [{ n: 'flags', b: 1 }, { n: 'password', t: 'obj', c: 'flags', i: 0 }, { n: 'new_public_key', t: 'bytes', c: 'flags', i: 1 }, { n: 'proof', t: 'obj', c: 'flags', i: 2 }] },
  { id: 0x4500c525, n: 'wallet.enableBackup', f: [{ n: 'flags', b: 1 }, { n: 'parts', t: { v: 'bytes' } }, { n: 'new_public_key', t: 'bytes', c: 'flags', i: 1 }, { n: 'proof', t: 'obj', c: 'flags', i: 2 }] },
  { id: 0x18e82537, n: 'wallet.encryptedSecretPhrasePart', f: [{ n: 'data', t: 'bytes' }] },
  { id: 0xbde90a8d, n: 'wallet.existingBalance', f: [{ n: 'flags', b: 1 }, { n: 'has_balance', t: 'true', c: 'flags', i: 0 }, { n: 'url', t: 'string' }] },
  { id: 0x9077c9ac, n: 'wallet.exportSecretPhrase', f: [{ n: 'flags', b: 1 }, { n: 'password', t: 'obj', c: 'flags', i: 0 }] },
  { id: 0xf53925cf, n: 'wallet.fetchEncryptedSecretPhrasePart', f: [{ n: 'token', t: 'string' }, { n: 'public_key', t: 'bytes' }] },
  { id: 0xd179d494, n: 'wallet.getBackupHolderDcs', f: [] },
  { id: 0x691f4360, n: 'wallet.getExistingWaltBalance', f: [] },
  { id: 0x742df0a1, n: 'wallet.getGaslessInfo', f: [] },
  { id: 0x8c12f3a4, n: 'wallet.getNfts', f: [{ n: 'offset', t: 'string' }, { n: 'limit', t: 'int' }] },
  { id: 0x2025e697, n: 'wallet.getProofChallenge', f: [] },
  { id: 0xab83b33a, n: 'wallet.getState', f: [] },
  { id: 0xa8830a83, n: 'wallet.getTransactions', f: [{ n: 'flags', b: 1 }, { n: 'inbound', t: 'true', c: 'flags', i: 0 }, { n: 'outbound', t: 'true', c: 'flags', i: 1 }, { n: 'offset', t: 'string' }, { n: 'limit', t: 'int' }] },
  { id: 0x811ceab6, n: 'wallet.getTransactionsByIDs', f: [{ n: 'id', t: { v: 'string' } }] },
  { id: 0xa6bb795d, n: 'wallet.getTransactionsByMsgHash', f: [{ n: 'msg_hash', t: { v: 'string' } }] },
  { id: 0x5275dfdd, n: 'wallet.getUserAddresses', f: [{ n: 'flags', b: 1 }, { n: 'force', t: 'true', c: 'flags', i: 0 }, { n: 'id', t: { v: 'obj' } }, { n: 'addresses', t: { v: 'string' } }] },
  { id: 0xf9d612ef, n: 'wallet.holderDc', f: [{ n: 'dc', t: 'int' }, { n: 'public_key', t: 'bytes' }] },
  { id: 0x4c1ef10e, n: 'wallet.nftAttribute', f: [{ n: 'trait_type', t: 'string' }, { n: 'value', t: 'string' }] },
  { id: 0x173dfaf3, n: 'wallet.nftItem', f: [{ n: 'flags', b: 1 }, { n: 'collection_address', t: 'string', c: 'flags', i: 0 }, { n: 'address', t: 'string' }, { n: 'owner_address', t: 'string' }, { n: 'index', t: 'string' }, { n: 'name', t: 'string', c: 'flags', i: 1 }, { n: 'description', t: 'string', c: 'flags', i: 2 }, { n: 'image', t: 'obj', c: 'flags', i: 3 }, { n: 'image_small', t: 'obj', c: 'flags', i: 4 }, { n: 'content_url', t: 'obj', c: 'flags', i: 5 }, { n: 'lottie', t: 'obj', c: 'flags', i: 6 }, { n: 'attributes', t: { v: 'obj' }, c: 'flags', i: 7 }, { n: 'extra', t: 'obj', c: 'flags', i: 8 }, { n: 'gift', t: 'obj', c: 'flags', i: 9 }] },
  { id: 0x794d486f, n: 'wallet.nftItems', f: [{ n: 'flags', b: 1 }, { n: 'items', t: { v: 'obj' } }, { n: 'next_offset', t: 'string', c: 'flags', i: 0 }] },
  { id: 0x99e41707, n: 'wallet.proofChallenge', f: [{ n: 'payload', t: 'string' }, { n: 'expires', t: 'int' }, { n: 'domain', t: 'string' }] },
  { id: 0xd8c72eec, n: 'wallet.replaceWallet', f: [{ n: 'flags', b: 1 }, { n: 'wallet', t: 'obj' }, { n: 'password', t: 'obj', c: 'flags', i: 0 }] },
  { id: 0xe6d0ef01, n: 'wallet.secretPhraseParts', f: [{ n: 'token', t: 'string' }, { n: 'dcs', t: { v: 'int' } }] },
  { id: 0xd9e5d9e2, n: 'wallet.sendTransfer', f: [{ n: 'flags', b: 1 }, { n: 'data_normal', t: 'bytes' }, { n: 'data_gasless', t: 'bytes', c: 'flags', i: 0 }, { n: 'user_id', t: 'obj' }, { n: 'random_id', t: 'long' }] },
  { id: 0x068509ac, n: 'wallet.setCardStickers', f: [{ n: 'flags', b: 1 }, { n: 'stickers', t: { v: 'obj' } }, { n: 'bg_nft_address', t: 'string', c: 'flags', i: 0 }] },
  { id: 0x4bc89693, n: 'wallet.tonConnectChallenge', f: [{ n: 'challenge', t: 'bytes' }, { n: 'event_id', t: 'long' }] },
  { id: 0x66b57b41, n: 'wallet.tonConnectClaimRequest', f: [{ n: 'flags', b: 1 }, { n: 'declined', t: 'true', c: 'flags', i: 1 }, { n: 'session_id', t: 'long' }, { n: 'msg_id', t: 'int' }, { n: 'app_request_id', t: 'string' }, { n: 'challenge_answer', t: 'bytes', c: 'flags', i: 0 }] },
  { id: 0xd63f61ce, n: 'wallet.tonConnectCloseSession', f: [{ n: 'flags', b: 1 }, { n: 'session_id', t: 'long' }, { n: 'body', t: 'bytes', c: 'flags', i: 0 }] },
  { id: 0xcc931046, n: 'wallet.tonConnectCreateSession', f: [{ n: 'dapp_client_id', t: 'string' }, { n: 'manifest_url', t: 'string' }] },
  { id: 0x11aee065, n: 'wallet.tonConnectGetPending', f: [{ n: 'flags', b: 1 }, { n: 'dapp_client_id', t: 'string', c: 'flags', i: 0 }, { n: 'session_id', t: 'long', c: 'flags', i: 1 }] },
  { id: 0xa7ffb56e, n: 'wallet.tonConnectGetSessions', f: [] },
  { id: 0x775d7244, n: 'wallet.tonConnectNextEventId', f: [{ n: 'session_id', t: 'long' }] },
  { id: 0x85c0f124, n: 'wallet.tonConnectPending', f: [{ n: 'session', t: 'obj' }, { n: 'requests', t: { v: 'obj' } }] },
  { id: 0x338bcf1c, n: 'wallet.tonConnectRegisterKey', f: [{ n: 'session_id', t: 'long' }, { n: 'client_id', t: 'string' }] },
  { id: 0x0e1f6896, n: 'wallet.tonConnectSessions', f: [{ n: 'sessions', t: { v: 'obj' } }] },
  { id: 0xc2c00779, n: 'wallet.tonConnectSubmitConnectResult', f: [{ n: 'flags', b: 1 }, { n: 'error', t: 'true', c: 'flags', i: 0 }, { n: 'session_id', t: 'long' }, { n: 'challenge_answer', t: 'bytes' }, { n: 'body', t: 'bytes' }, { n: 'trace_id', t: 'string', c: 'flags', i: 1 }] },
  { id: 0xfac67d3c, n: 'wallet.tonConnectSubmitResponse', f: [{ n: 'flags', b: 1 }, { n: 'session_id', t: 'long' }, { n: 'msg_id', t: 'int' }, { n: 'body', t: 'bytes' }, { n: 'trace_id', t: 'string', c: 'flags', i: 0 }] },
  { id: 0x4322d5a5, n: 'wallet.transactions', f: [{ n: 'flags', b: 1 }, { n: 'balance', t: 'long' }, { n: 'transactions', t: { v: 'obj' } }, { n: 'next_offset', t: 'string', c: 'flags', i: 0 }, { n: 'chats', t: { v: 'obj' } }, { n: 'users', t: { v: 'obj' } }] },
  { id: 0x928e7b55, n: 'wallet.userAddresses', f: [{ n: 'addresses', t: { v: 'obj' } }, { n: 'users', t: { v: 'obj' } }] },
]
