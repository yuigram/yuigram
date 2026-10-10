// SPDX-License-Identifier: MIT

/**
 * What the documented error names give a caller at compile time.
 *
 * Completion for the names Telegram's error database lists, and narrowing of
 * `text` to the name matched — without ever refusing a name the database does
 * not list, because Telegram sends those too. Everything here is a
 * compile-time assertion.
 */

import { describe, expectTypeOf, it } from 'vitest'
import type { DocumentedErrorPattern, DocumentedErrorText } from '../src/generated/errors.js'
import {
  isRpcError,
  type MigrationError,
  type RpcError,
  type RpcErrorPattern,
  type RpcErrorText,
  type RpcErrorTextOf,
} from '../src/session/errors.js'

declare const error: RpcError

describe('the documented names', () => {
  it('are offered as patterns, with the number where the database writes %d', () => {
    expectTypeOf<'FLOOD_WAIT_%d'>().toExtend<DocumentedErrorPattern>()
    expectTypeOf<'FILE_PART_%d_MISSING'>().toExtend<DocumentedErrorPattern>()
    expectTypeOf<'PREVIOUS_CHAT_IMPORT_ACTIVE_WAIT_%dMIN'>().toExtend<DocumentedErrorPattern>()
    expectTypeOf<'CHAT_WRITE_FORBIDDEN'>().toExtend<DocumentedErrorPattern>()
  })

  it('arrive as text with a number in place of %d', () => {
    expectTypeOf<'FLOOD_WAIT_30'>().toExtend<DocumentedErrorText>()
    expectTypeOf<'FILE_PART_7_MISSING'>().toExtend<DocumentedErrorText>()
    expectTypeOf<'PREVIOUS_CHAT_IMPORT_ACTIVE_WAIT_5MIN'>().toExtend<DocumentedErrorText>()
    expectTypeOf<'FLOOD_WAIT_%d'>().not.toExtend<DocumentedErrorText>()
  })

  it('are not a closed list: any other name is still a name', () => {
    expectTypeOf<'A_NAME_NO_PAGE_LISTS'>().toExtend<RpcErrorPattern>()
    expectTypeOf<'A_NAME_NO_PAGE_LISTS'>().toExtend<RpcErrorText>()
    expectTypeOf<RpcErrorPattern>().not.toBeAny()
    expectTypeOf(error.text).toEqualTypeOf<RpcErrorText>()
  })
})

describe('matching', () => {
  it('turns a pattern into the texts it stands for', () => {
    expectTypeOf<RpcErrorTextOf<'FLOOD_WAIT_%d'>>().toEqualTypeOf<`FLOOD_WAIT_${number}`>()
    expectTypeOf<
      RpcErrorTextOf<'FILE_REFERENCE_%d_EXPIRED'>
    >().toEqualTypeOf<`FILE_REFERENCE_${number}_EXPIRED`>()
    expectTypeOf<RpcErrorTextOf<'CHANNEL_PRIVATE'>>().toEqualTypeOf<'CHANNEL_PRIVATE'>()
  })

  it('narrows text to the name matched', () => {
    // Assignable to the name matched, so it can be used as that name; and no
    // longer to a different one.
    if (error.is('SLOWMODE_WAIT_%d')) {
      expectTypeOf(error.text).toExtend<`SLOWMODE_WAIT_${number}`>()
      expectTypeOf(error.text).not.toExtend<'CHANNEL_PRIVATE'>()
    }
    if (error.is('CHANNEL_PRIVATE')) {
      expectTypeOf(error.text).toExtend<'CHANNEL_PRIVATE'>()
    }
  })

  it('keeps what the error was when it narrows', () => {
    const migration = error as MigrationError
    if (migration.is('FILE_MIGRATE_%d')) {
      expectTypeOf(migration.dcId).toEqualTypeOf<number>()
      expectTypeOf(migration).toExtend<MigrationError>()
    }
  })

  it('accepts the documented and the undocumented alike', () => {
    expectTypeOf(error.argument).parameter(0).toEqualTypeOf<RpcErrorPattern>()
    expectTypeOf(isRpcError).parameter(1).toEqualTypeOf<RpcErrorPattern>()
    expectTypeOf(error.is('SOMETHING_NEW_%d')).toEqualTypeOf<boolean>()
  })
})
