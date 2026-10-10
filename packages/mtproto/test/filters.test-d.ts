// SPDX-License-Identifier: MIT

/**
 * What registering behind a filter tells the handler.
 *
 * A filter proves something about the event, and the registration applies the
 * proof to the handler's context: nothing at runtime would notice if it did
 * not, so it is pinned here.
 */

import { describe, expectTypeOf, it } from 'vitest'
import type { Account } from '../src/account.js'
import type { ServiceAction } from '../src/entities/action.js'
import { f } from '../src/filters/index.js'
import type { PeerRef } from '../src/normalize/normalize.js'
import type { AccountRouter } from '../src/router.js'

declare const account: Account
declare const router: AccountRouter

describe('a filter’s proof reaching the handler', () => {
  it('narrows text, command arguments and captures', () => {
    account.on(f.text(), (event) => {
      expectTypeOf(event.text).toEqualTypeOf<string>()
    })
    account.on('message', f.command('start'), (event) => {
      expectTypeOf(event.command).toEqualTypeOf<string>()
      expectTypeOf(event.args).toEqualTypeOf<readonly string[]>()
    })
    router.on(f.regex(/x/), (event) => {
      expectTypeOf(event.match).toEqualTypeOf<RegExpExecArray>()
    })
  })

  it('types what a callback-data schema read', () => {
    const vote = {
      matches: (_data: string) => true,
      unpack: (_data: string): { answer: 'yes' | 'no'; poll: number } | undefined => undefined,
    }
    account.on(f.callbackData(vote, { answer: 'yes' }), (event) => {
      expectTypeOf(event.payload).toEqualTypeOf<{ answer: 'yes' | 'no'; poll: number }>()
      expectTypeOf(event.data).toEqualTypeOf<string>()
    })
    // @ts-expect-error — not a value the field can hold
    f.callbackData(vote, { answer: 'maybe' })
  })

  it('narrows the chat and sender a peer filter requires', () => {
    account.once('message', f.chat('user'), (event) => {
      expectTypeOf(event.chat).toEqualTypeOf<PeerRef>()
    })
    account.on(f.sender(), (event) => {
      expectTypeOf(event.sender).toEqualTypeOf<PeerRef>()
    })
  })

  it('narrows a service action to the kinds asked for', () => {
    account.on('message', f.action('members-added', 'joined-by-link'), (event) => {
      expectTypeOf(event.action.kind).toEqualTypeOf<'members-added' | 'joined-by-link'>()
      if (event.action.kind === 'members-added') {
        expectTypeOf(event.action.users).toEqualTypeOf<readonly PeerRef[]>()
      } else {
        expectTypeOf(event.action.inviter).toEqualTypeOf<PeerRef>()
      }
    })
    account.on(f.action(), (event) => {
      expectTypeOf(event.action).toEqualTypeOf<ServiceAction>()
    })
    account.on('message', (event) => {
      expectTypeOf(event.action).toEqualTypeOf<ServiceAction | undefined>()
    })
    // @ts-expect-error — not something a service message says
    f.action('member-joined')
  })

  it('leaves the context as it is for a kind alone, and refuses one nothing produces', () => {
    account.on('message', (event) => {
      expectTypeOf(event.text).toEqualTypeOf<string | undefined>()
    })
    // @ts-expect-error — not a kind an account produces
    account.on('mesage', () => {})
  })
})
