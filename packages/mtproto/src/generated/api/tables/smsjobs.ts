// GENERATED FILE — do not edit.
// Wire layout for smsjobs
// Source: Telegram TL layer 223, schemas/tl/api.223.tl

import type { TlEntry } from '../../../tl/schema.js'

/** 9 combinators. */
export const ENTRIES: readonly TlEntry[] = [
  { id: 0xdc8b44cf, n: 'smsjobs.eligibleToJoin', f: [{ n: 'terms_url', t: 'string' }, { n: 'monthly_sent_sms', t: 'int' }] },
  { id: 0x4f1ebf24, n: 'smsjobs.finishJob', f: [{ n: 'flags', b: 1 }, { n: 'job_id', t: 'string' }, { n: 'error', t: 'string', c: 'flags', i: 0 }] },
  { id: 0x778d902f, n: 'smsjobs.getSmsJob', f: [{ n: 'job_id', t: 'string' }] },
  { id: 0x10a698e8, n: 'smsjobs.getStatus', f: [] },
  { id: 0x0edc39d0, n: 'smsjobs.isEligibleToJoin', f: [] },
  { id: 0xa74ece2d, n: 'smsjobs.join', f: [] },
  { id: 0x9898ad73, n: 'smsjobs.leave', f: [] },
  { id: 0x2aee9191, n: 'smsjobs.status', f: [{ n: 'flags', b: 1 }, { n: 'allow_international', t: 'true', c: 'flags', i: 0 }, { n: 'recent_sent', t: 'int' }, { n: 'recent_since', t: 'int' }, { n: 'recent_remains', t: 'int' }, { n: 'total_sent', t: 'int' }, { n: 'total_since', t: 'int' }, { n: 'last_gift_slug', t: 'string', c: 'flags', i: 1 }, { n: 'terms_url', t: 'string' }] },
  { id: 0x093fa0bf, n: 'smsjobs.updateSettings', f: [{ n: 'flags', b: 1 }, { n: 'allow_international', t: 'true', c: 'flags', i: 0 }] },
]
