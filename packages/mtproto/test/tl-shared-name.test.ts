// SPDX-License-Identifier: MPL-2.0

/**
 * The one constructor name both schemas declare.
 *
 * `message` is a chat message in the API tables and a container element in
 * the service tables, with different identifiers and shapes. Writing by name
 * against a scope holding both cannot tell them apart, and the writer refuses
 * rather than guessing — which is the behaviour held here, together with the
 * two ways a value carrying a chat message is written correctly. Reading is
 * by identifier and never ambiguous.
 *
 * A client never writes a chat message: `tools/tl/test/collisions.test.ts`
 * holds that no API method's parameters can carry one.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { REGISTRY as API } from '../src/generated/api/registry.js'
import { REGISTRY as CORE } from '../src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../src/generated/mtproto/registry.js'
import { readObject, TlScope, type TlValue, writeObject } from '../src/tl/index.js'
import { writeServerValue } from './server/answers.js'

const BOTH = new TlScope('account', [CORE, MTPROTO, API])
const API_ONLY = new TlScope('api', [CORE, API])

const chatMessage: TlValue = {
  _: 'message',
  id: 7,
  peer_id: { _: 'peerUser', user_id: 5n },
  date: 1_700_000_000,
  message: 'hello',
}

const answer: TlValue = {
  _: 'messages.messages',
  messages: [chatMessage],
  topics: [],
  chats: [],
  users: [],
}

describe('a name two tables declare', () => {
  it('is the two tables’ different constructors', () => {
    expect(API.byName.get('message')?.id).not.toBe(MTPROTO.byName.get('message')?.id)
  })

  it('is refused by name against a scope holding both, rather than guessed', () => {
    expect(() => writeObject(answer, BOTH)).toThrow(ValidationError)
    expect(() => writeObject(answer, BOTH)).toThrow(
      /'message' names a constructor in more than one table/,
    )
  })

  it('is written against the API tables alone, and read back by identifier in either', () => {
    const bytes = writeObject(answer, API_ONLY)

    expect(readObject(bytes, BOTH)).toMatchObject({
      _: 'messages.messages',
      messages: [{ _: 'message', id: 7, message: 'hello' }],
    })
    expect(new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true)).toBe(
      API.byName.get('messages.messages')?.id,
    )
  })

  it('is written by the stand-in server inside an rpc_result, uncompressed', () => {
    const bytes = writeServerValue({ _: 'rpc_result', req_msg_id: 99n, result: answer }, BOTH)
    const read = readObject(bytes, BOTH)

    expect(read['_']).toBe('rpc_result')
    expect(read['req_msg_id']).toBe(99n)
    expect((read['result'] as TlValue)['_']).toBe('messages.messages')
    // The envelope, then the API answer's own bytes, exactly.
    expect(bytes.subarray(12)).toEqual(writeObject(answer, API_ONLY))
  })

  it('leaves everything else to the scope it was given', () => {
    const pong: TlValue = { _: 'pong', msg_id: 1n, ping_id: 2n }

    expect(writeServerValue(pong, BOTH)).toEqual(writeObject(pong, BOTH))
  })
})
