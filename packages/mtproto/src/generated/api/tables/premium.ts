// GENERATED FILE — do not edit.
// Wire layout for premium
// Source: Telegram TL layer 229, schemas/tl/api.229.tl

import type { TlEntry } from '../../../tl/schema.js'

/** 8 combinators. */
export const ENTRIES: readonly TlEntry[] = [
  { id: 0x6b7da746, n: 'premium.applyBoost', f: [{ n: 'flags', b: 1 }, { n: 'slots', t: { v: 'int' }, c: 'flags', i: 0 }, { n: 'peer', t: 'obj' }] },
  { id: 0x86f8613c, n: 'premium.boostsList', f: [{ n: 'flags', b: 1 }, { n: 'count', t: 'int' }, { n: 'boosts', t: { v: 'obj' } }, { n: 'next_offset', t: 'string', c: 'flags', i: 0 }, { n: 'users', t: { v: 'obj' } }] },
  { id: 0x4959427a, n: 'premium.boostsStatus', f: [{ n: 'flags', b: 1 }, { n: 'my_boost', t: 'true', c: 'flags', i: 2 }, { n: 'level', t: 'int' }, { n: 'current_level_boosts', t: 'int' }, { n: 'boosts', t: 'int' }, { n: 'gift_boosts', t: 'int', c: 'flags', i: 4 }, { n: 'next_level_boosts', t: 'int', c: 'flags', i: 0 }, { n: 'premium_audience', t: 'obj', c: 'flags', i: 1 }, { n: 'boost_url', t: 'string' }, { n: 'prepaid_giveaways', t: { v: 'obj' }, c: 'flags', i: 3 }, { n: 'my_boost_slots', t: { v: 'int' }, c: 'flags', i: 2 }] },
  { id: 0x60f67660, n: 'premium.getBoostsList', f: [{ n: 'flags', b: 1 }, { n: 'gifts', t: 'true', c: 'flags', i: 0 }, { n: 'peer', t: 'obj' }, { n: 'offset', t: 'string' }, { n: 'limit', t: 'int' }] },
  { id: 0x042f1f61, n: 'premium.getBoostsStatus', f: [{ n: 'peer', t: 'obj' }] },
  { id: 0x0be77b4a, n: 'premium.getMyBoosts', f: [] },
  { id: 0x39854d1f, n: 'premium.getUserBoosts', f: [{ n: 'peer', t: 'obj' }, { n: 'user_id', t: 'obj' }] },
  { id: 0x9ae228e2, n: 'premium.myBoosts', f: [{ n: 'my_boosts', t: { v: 'obj' } }, { n: 'chats', t: { v: 'obj' } }, { n: 'users', t: { v: 'obj' } }] },
]
