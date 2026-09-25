/**
 * What a refused request is raised as.
 *
 * Telegram names every failure, and a caller acts on the name: forget a chat it
 * may not write to, wait the seconds a name carries, follow a redirection. So
 * the name, the code and the number a name ends in are fields, the answer as it
 * arrived is the cause, and all of it survives the trip across a worker.
 */

import { FloodError, TelegramError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import {
  isRpcError,
  MigrationError,
  RpcError,
  rpcErrorToException,
} from '../src/session/dispatcher.js'
import { deserializeError, serializeError } from '../src/worker/protocol.js'

const refusal = (code: number, text: string) => ({
  _: 'rpc_error',
  error_code: code,
  error_message: text,
})

describe('a refusal, read', () => {
  it('keeps the name, the code, the method and the answer', () => {
    const answer = refusal(403, 'CHAT_WRITE_FORBIDDEN')
    const error = rpcErrorToException(answer, 'messages.sendMessage')

    expect(error).toBeInstanceOf(RpcError)
    expect(error).toBeInstanceOf(TelegramError)
    expect(error).toMatchObject({
      name: 'RpcError',
      code: 403,
      text: 'CHAT_WRITE_FORBIDDEN',
      parameter: undefined,
      method: 'messages.sendMessage',
    })
    expect(error.cause).toBe(answer)
    expect(error.message).toBe('CHAT_WRITE_FORBIDDEN (403)')
  })

  it('reads the number a name ends in, and matches names with %d for it', () => {
    const error = rpcErrorToException(refusal(400, 'PASSWORD_TOO_FRESH_3600')) as RpcError

    expect(error.parameter).toBe(3600)
    expect(error.is('PASSWORD_TOO_FRESH_%d')).toBe(true)
    expect(error.is('PASSWORD_TOO_FRESH_3600')).toBe(true)
    expect(error.is('PASSWORD_TOO_FRESH')).toBe(false)
    expect(error.is('SESSION_TOO_FRESH_%d')).toBe(false)
  })

  it('reads a pattern as a name, never as a regular expression', () => {
    const error = rpcErrorToException(refusal(400, 'AXB')) as RpcError

    expect(error.is('A.B')).toBe(false)
    expect(isRpcError(error, 'A.*')).toBe(false)

    const numbered = rpcErrorToException(refusal(400, 'AXB_5')) as RpcError
    expect(numbered.is('A.B_%d')).toBe(false)
    expect(numbered.is('AXB_%d')).toBe(true)
  })

  it('raises every wait as the shared flood error, keeping its name on the cause', () => {
    const slow = rpcErrorToException(refusal(420, 'SLOWMODE_WAIT_30'))
    const flood = rpcErrorToException(refusal(420, 'FLOOD_WAIT_7'))

    expect(slow).toBeInstanceOf(FloodError)
    expect((slow as FloodError).retryAfter).toBe(30)
    expect(isRpcError(slow, 'SLOWMODE_WAIT_%d')).toBe(true)
    expect(isRpcError(slow, 'FLOOD_WAIT_%d')).toBe(false)
    expect(isRpcError(flood, 'FLOOD_WAIT_%d')).toBe(true)
  })

  it('raises a redirection as a migration, which is a refusal too', () => {
    const error = rpcErrorToException(refusal(303, 'FILE_MIGRATE_4'), 'upload.getFile')

    expect(error).toBeInstanceOf(MigrationError)
    expect(error).toBeInstanceOf(RpcError)
    expect(error).toMatchObject({
      kind: 'file',
      dcId: 4,
      code: 303,
      text: 'FILE_MIGRATE_4',
      parameter: 4,
    })
    expect(isRpcError(error, 'FILE_MIGRATE_%d')).toBe(true)
  })

  it('says no for anything that is not a refusal', () => {
    expect(isRpcError(new Error('CHAT_WRITE_FORBIDDEN'), 'CHAT_WRITE_FORBIDDEN')).toBe(false)
    expect(isRpcError(new TelegramError('CHAT_WRITE_FORBIDDEN'), 'CHAT_WRITE_FORBIDDEN')).toBe(
      false,
    )
    expect(isRpcError(undefined, 'X')).toBe(false)
  })
})

describe('across a worker', () => {
  it('comes back as the class it was, with every field and the matching', () => {
    const refused = deserializeError(
      serializeError(
        rpcErrorToException(refusal(400, 'PASSWORD_TOO_FRESH_60'), 'account.getPassword'),
      ),
    )
    const moved = deserializeError(
      serializeError(rpcErrorToException(refusal(303, 'USER_MIGRATE_2'))),
    )

    expect(refused).toBeInstanceOf(RpcError)
    expect(refused).toMatchObject({
      code: 400,
      text: 'PASSWORD_TOO_FRESH_60',
      parameter: 60,
      method: 'account.getPassword',
    })
    expect((refused as RpcError).is('PASSWORD_TOO_FRESH_%d')).toBe(true)
    expect(moved).toBeInstanceOf(MigrationError)
    expect(moved).toMatchObject({ kind: 'user', dcId: 2, code: 303 })
  })
})
