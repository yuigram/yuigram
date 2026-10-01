/**
 * Writing what the stand-in datacenter sends, against the right tables.
 *
 * One name is declared by both schemas: `message` is a chat message in the API
 * tables and a container element in the service tables. The writer refuses a
 * name it would have to guess at, so an answer carrying a chat message — a
 * refetched message, a pushed update — cannot be written against a scope that
 * holds both. A client never has to: no API method's parameters can carry a
 * `Message` (`tools/tl/test/collisions.test.ts` holds that), and the service
 * element is written by hand. A server answering with chat messages does, and
 * this is how: an API value is written against the core and API tables alone,
 * and an `rpc_result` around one is written as its envelope with the result
 * inside. The bytes are the ones Telegram sends; only the lookup differs.
 */

import { gzipSync } from 'node:zlib'
import { REGISTRY as API } from '../../src/generated/api/registry.js'
import { REGISTRY as CORE } from '../../src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../../src/generated/mtproto/registry.js'
import { TlScope, type TlValue, TlWriter, writeObject } from '../../src/tl/index.js'

const API_ANSWERS = new TlScope('api answer', [CORE, API])

const RPC_RESULT = MTPROTO.byName.get('rpc_result')?.id as number

/** Whether a value is an API constructor that the service tables do not also name. */
function isApiValue(value: unknown): value is TlValue {
  if (typeof value !== 'object' || value === null) return false
  const name = (value as { _?: unknown })._
  return typeof name === 'string' && API.byName.has(name) && !MTPROTO.byName.has(name)
}

/** The bytes of one message the server sends, written against the tables it belongs to. */
export function writeServerValue(value: TlValue, scope: TlScope): Uint8Array {
  if (value._ === 'rpc_result' && isApiValue(value['result'])) {
    const writer = new TlWriter(scope)
    writer.uint(RPC_RESULT)
    writer.long(value['req_msg_id'] as bigint)
    writer.raw(writeObject(value['result'], API_ANSWERS))
    return writer.finish()
  }

  return writeObject(value, isApiValue(value) ? API_ANSWERS : scope)
}

/**
 * An API answer packed the way Telegram packs a large one, in `gzip_packed`.
 *
 * The compressed path, kept as a case of its own: a client has to unwrap it
 * before reading, and Telegram may use it for any result.
 */
export function packedApiAnswer(value: TlValue): TlValue {
  return { _: 'gzip_packed', packed_data: gzipSync(writeObject(value, API_ANSWERS)) }
}
