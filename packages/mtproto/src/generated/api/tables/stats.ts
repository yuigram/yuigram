// GENERATED FILE — do not edit.
// Wire layout for stats
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type { TlEntry } from '../../../tl/schema.js'

/** 12 combinators. */
export const ENTRIES: readonly TlEntry[] = [
  { id: 0x396ca5fc, n: 'stats.broadcastStats', f: [{ n: 'period', t: 'obj' }, { n: 'followers', t: 'obj' }, { n: 'views_per_post', t: 'obj' }, { n: 'shares_per_post', t: 'obj' }, { n: 'reactions_per_post', t: 'obj' }, { n: 'views_per_story', t: 'obj' }, { n: 'shares_per_story', t: 'obj' }, { n: 'reactions_per_story', t: 'obj' }, { n: 'enabled_notifications', t: 'obj' }, { n: 'growth_graph', t: 'obj' }, { n: 'followers_graph', t: 'obj' }, { n: 'mute_graph', t: 'obj' }, { n: 'top_hours_graph', t: 'obj' }, { n: 'interactions_graph', t: 'obj' }, { n: 'iv_interactions_graph', t: 'obj' }, { n: 'views_by_source_graph', t: 'obj' }, { n: 'new_followers_by_source_graph', t: 'obj' }, { n: 'languages_graph', t: 'obj' }, { n: 'reactions_by_emotion_graph', t: 'obj' }, { n: 'story_interactions_graph', t: 'obj' }, { n: 'story_reactions_by_emotion_graph', t: 'obj' }, { n: 'recent_posts_interactions', t: { v: 'obj' } }] },
  { id: 0xab42441a, n: 'stats.getBroadcastStats', f: [{ n: 'flags', b: 1 }, { n: 'dark', t: 'true', c: 'flags', i: 0 }, { n: 'channel', t: 'obj' }] },
  { id: 0xdcdf8607, n: 'stats.getMegagroupStats', f: [{ n: 'flags', b: 1 }, { n: 'dark', t: 'true', c: 'flags', i: 0 }, { n: 'channel', t: 'obj' }] },
  { id: 0x5f150144, n: 'stats.getMessagePublicForwards', f: [{ n: 'channel', t: 'obj' }, { n: 'msg_id', t: 'int' }, { n: 'offset', t: 'string' }, { n: 'limit', t: 'int' }] },
  { id: 0xb6e0a3f5, n: 'stats.getMessageStats', f: [{ n: 'flags', b: 1 }, { n: 'dark', t: 'true', c: 'flags', i: 0 }, { n: 'channel', t: 'obj' }, { n: 'msg_id', t: 'int' }] },
  { id: 0xa6437ef6, n: 'stats.getStoryPublicForwards', f: [{ n: 'peer', t: 'obj' }, { n: 'id', t: 'int' }, { n: 'offset', t: 'string' }, { n: 'limit', t: 'int' }] },
  { id: 0x374fef40, n: 'stats.getStoryStats', f: [{ n: 'flags', b: 1 }, { n: 'dark', t: 'true', c: 'flags', i: 0 }, { n: 'peer', t: 'obj' }, { n: 'id', t: 'int' }] },
  { id: 0x621d5fa0, n: 'stats.loadAsyncGraph', f: [{ n: 'flags', b: 1 }, { n: 'token', t: 'string' }, { n: 'x', t: 'long', c: 'flags', i: 0 }] },
  { id: 0xef7ff916, n: 'stats.megagroupStats', f: [{ n: 'period', t: 'obj' }, { n: 'members', t: 'obj' }, { n: 'messages', t: 'obj' }, { n: 'viewers', t: 'obj' }, { n: 'posters', t: 'obj' }, { n: 'growth_graph', t: 'obj' }, { n: 'members_graph', t: 'obj' }, { n: 'new_members_by_source_graph', t: 'obj' }, { n: 'languages_graph', t: 'obj' }, { n: 'messages_graph', t: 'obj' }, { n: 'actions_graph', t: 'obj' }, { n: 'top_hours_graph', t: 'obj' }, { n: 'weekdays_graph', t: 'obj' }, { n: 'top_posters', t: { v: 'obj' } }, { n: 'top_admins', t: { v: 'obj' } }, { n: 'top_inviters', t: { v: 'obj' } }, { n: 'users', t: { v: 'obj' } }] },
  { id: 0x7fe91c14, n: 'stats.messageStats', f: [{ n: 'views_graph', t: 'obj' }, { n: 'reactions_by_emotion_graph', t: 'obj' }] },
  { id: 0x93037e20, n: 'stats.publicForwards', f: [{ n: 'flags', b: 1 }, { n: 'count', t: 'int' }, { n: 'forwards', t: { v: 'obj' } }, { n: 'next_offset', t: 'string', c: 'flags', i: 0 }, { n: 'chats', t: { v: 'obj' } }, { n: 'users', t: { v: 'obj' } }] },
  { id: 0x50cd067c, n: 'stats.storyStats', f: [{ n: 'views_graph', t: 'obj' }, { n: 'reactions_by_emotion_graph', t: 'obj' }] },
]
