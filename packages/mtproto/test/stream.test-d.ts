// SPDX-License-Identifier: MIT

/**
 * What `streamTo` takes, as the account a caller already has.
 *
 * The stream entry point describes the account it needs structurally rather
 * than importing the class, so nothing at runtime would notice the two drifting
 * apart — a change to how an account registers handlers could quietly stop an
 * account being something a stream accepts.
 */

import { describe, expectTypeOf, it } from 'vitest'
import type { Account } from '../src/account.js'
import type { StreamingAccount } from '../src/stream/index.js'

describe('an account, as a stream takes one', () => {
  it('is a streaming account as it is', () => {
    expectTypeOf<Account>().toMatchTypeOf<StreamingAccount>()
  })
})
