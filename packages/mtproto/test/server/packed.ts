/**
 * An API answer packed the way Telegram packs a large one.
 *
 * Telegram may send any result as `gzip_packed`, and a client has to unwrap it
 * before reading. For a stand-in it is also the one way to send an answer that
 * carries a name both schemas declare — a chat `message` inside
 * `messages.messages` — because the writer refuses to guess which table a
 * shared name means. The packed bytes are written against the API tables alone,
 * where the name is not shared, and the client decodes them by identifier.
 */

import { gzipSync } from 'node:zlib'
import { REGISTRY as API } from '../../src/generated/api/registry.js'
import { REGISTRY as CORE } from '../../src/generated/core/registry.js'
import { TlScope, type TlValue, writeObject } from '../../src/tl/index.js'

const API_ANSWERS = new TlScope('api answer', [CORE, API])

/** `value`, written as an API answer and wrapped in `gzip_packed`. */
export function packedApiAnswer(value: TlValue): TlValue {
  return { _: 'gzip_packed', packed_data: gzipSync(writeObject(value, API_ANSWERS)) }
}
