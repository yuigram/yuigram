// GENERATED FILE — do not edit.
// Wire layout for communities
// Source: Telegram TL layer 229, schemas/tl/api.229.tl

import type { TlEntry } from '../../../tl/schema.js'

/** 11 combinators. */
export const ENTRIES: readonly TlEntry[] = [
  { id: 0xa63859ec, n: 'communities.create', f: [{ n: 'flags', b: 1 }, { n: 'hidden', t: 'true', c: 'flags', i: 1 }, { n: 'title', t: 'string' }, { n: 'about', t: 'string', c: 'flags', i: 0 }, { n: 'peer', t: 'obj' }] },
  { id: 0xa663e830, n: 'communities.getJoinedCommunities', f: [] },
  { id: 0xf87eabab, n: 'communities.getParticipantJoinedChats', f: [{ n: 'community', t: 'obj' }, { n: 'participant', t: 'obj' }] },
  { id: 0x93773344, n: 'communities.getPeerLinkRequests', f: [{ n: 'community', t: 'obj' }, { n: 'offset', t: 'string' }, { n: 'limit', t: 'int' }] },
  { id: 0x8d78512a, n: 'communities.participantJoinedChats', f: [{ n: 'creator_chat_ids', t: { v: 'long' } }, { n: 'joined_chat_ids', t: { v: 'long' } }, { n: 'chats', t: { v: 'obj' } }, { n: 'users', t: { v: 'obj' } }] },
  { id: 0x2244afad, n: 'communities.peerLinkRequests', f: [{ n: 'flags', b: 1 }, { n: 'total_count', t: 'int' }, { n: 'requests', t: { v: 'obj' } }, { n: 'next_offset', t: 'string', c: 'flags', i: 0 }, { n: 'chats', t: { v: 'obj' } }, { n: 'users', t: { v: 'obj' } }] },
  { id: 0xbfe3dd3d, n: 'communities.toggleAllPeerLinkRequestApproval', f: [{ n: 'flags', b: 1 }, { n: 'reject', t: 'true', c: 'flags', i: 0 }, { n: 'community', t: 'obj' }] },
  { id: 0xd766e3ea, n: 'communities.toggleCommunityCollapsedInDialogs', f: [{ n: 'flags', b: 1 }, { n: 'collapsed', t: 'true', c: 'flags', i: 0 }, { n: 'community', t: 'obj' }] },
  { id: 0x9967ad0f, n: 'communities.toggleParticipantBanned', f: [{ n: 'flags', b: 1 }, { n: 'unban', t: 'true', c: 'flags', i: 0 }, { n: 'community', t: 'obj' }, { n: 'participant', t: 'obj' }] },
  { id: 0x736dcfea, n: 'communities.togglePeerLink', f: [{ n: 'flags', b: 1 }, { n: 'visible', t: 'true', c: 'flags', i: 0 }, { n: 'hidden', t: 'true', c: 'flags', i: 1 }, { n: 'deleted', t: 'true', c: 'flags', i: 2 }, { n: 'community', t: 'obj' }, { n: 'peer', t: 'obj' }] },
  { id: 0x8c8219a8, n: 'communities.togglePeerLinkRequestApproval', f: [{ n: 'flags', b: 1 }, { n: 'reject', t: 'true', c: 'flags', i: 0 }, { n: 'community', t: 'obj' }, { n: 'peer', t: 'obj' }] },
]
