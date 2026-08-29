// GENERATED FILE — do not edit.
// Wire layout for chatlists
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type { TlEntry } from '../../../tl/schema.js'

/** 16 combinators. */
export const ENTRIES: readonly TlEntry[] = [
  { id: 0xf10ece2f, n: 'chatlists.chatlistInvite', f: [{ n: 'flags', b: 1 }, { n: 'title_noanimate', t: 'true', c: 'flags', i: 1 }, { n: 'title', t: 'obj' }, { n: 'emoticon', t: 'string', c: 'flags', i: 0 }, { n: 'peers', t: { v: 'obj' } }, { n: 'chats', t: { v: 'obj' } }, { n: 'users', t: { v: 'obj' } }] },
  { id: 0xfa87f659, n: 'chatlists.chatlistInviteAlready', f: [{ n: 'filter_id', t: 'int' }, { n: 'missing_peers', t: { v: 'obj' } }, { n: 'already_peers', t: { v: 'obj' } }, { n: 'chats', t: { v: 'obj' } }, { n: 'users', t: { v: 'obj' } }] },
  { id: 0x93bd878d, n: 'chatlists.chatlistUpdates', f: [{ n: 'missing_peers', t: { v: 'obj' } }, { n: 'chats', t: { v: 'obj' } }, { n: 'users', t: { v: 'obj' } }] },
  { id: 0x41c10fff, n: 'chatlists.checkChatlistInvite', f: [{ n: 'slug', t: 'string' }] },
  { id: 0x719c5c5e, n: 'chatlists.deleteExportedInvite', f: [{ n: 'chatlist', t: 'obj' }, { n: 'slug', t: 'string' }] },
  { id: 0x653db63d, n: 'chatlists.editExportedInvite', f: [{ n: 'flags', b: 1 }, { n: 'chatlist', t: 'obj' }, { n: 'slug', t: 'string' }, { n: 'title', t: 'string', c: 'flags', i: 1 }, { n: 'peers', t: { v: 'obj' }, c: 'flags', i: 2 }] },
  { id: 0x8472478e, n: 'chatlists.exportChatlistInvite', f: [{ n: 'chatlist', t: 'obj' }, { n: 'title', t: 'string' }, { n: 'peers', t: { v: 'obj' } }] },
  { id: 0x10e6e3a6, n: 'chatlists.exportedChatlistInvite', f: [{ n: 'filter', t: 'obj' }, { n: 'invite', t: 'obj' }] },
  { id: 0x10ab6dc7, n: 'chatlists.exportedInvites', f: [{ n: 'invites', t: { v: 'obj' } }, { n: 'chats', t: { v: 'obj' } }, { n: 'users', t: { v: 'obj' } }] },
  { id: 0x89419521, n: 'chatlists.getChatlistUpdates', f: [{ n: 'chatlist', t: 'obj' }] },
  { id: 0xce03da83, n: 'chatlists.getExportedInvites', f: [{ n: 'chatlist', t: 'obj' }] },
  { id: 0xfdbcd714, n: 'chatlists.getLeaveChatlistSuggestions', f: [{ n: 'chatlist', t: 'obj' }] },
  { id: 0x66e486fb, n: 'chatlists.hideChatlistUpdates', f: [{ n: 'chatlist', t: 'obj' }] },
  { id: 0xa6b1e39a, n: 'chatlists.joinChatlistInvite', f: [{ n: 'slug', t: 'string' }, { n: 'peers', t: { v: 'obj' } }] },
  { id: 0xe089f8f5, n: 'chatlists.joinChatlistUpdates', f: [{ n: 'chatlist', t: 'obj' }, { n: 'peers', t: { v: 'obj' } }] },
  { id: 0x74fae13a, n: 'chatlists.leaveChatlist', f: [{ n: 'chatlist', t: 'obj' }, { n: 'peers', t: { v: 'obj' } }] },
]
