// SPDX-License-Identifier: MPL-2.0

/**
 * A user's status, read on its own.
 *
 * `UserView.presence` reads the status a user carries; a status update brings
 * one without the user around it. Both go through `readPresence`, so the two
 * cannot come to disagree about what a status says.
 */

import { describe, expect, expectTypeOf, it } from 'vitest'
import { readPresence, type UserPresence, UserView } from '../src/entities/peer.js'
import type { TypeUserStatus, User } from '../src/generated/api/types/index.js'
import type { MtprotoContext } from '../src/normalize/context.js'
import { mockAccount } from '../src/testing/index.js'

/** Every status constructor of the schema, with the reading each must give. */
const VARIANTS: readonly (readonly [TypeUserStatus, UserPresence])[] = [
  [
    { _: 'userStatusOnline', expires: 1_700_000_300 },
    { state: 'online', onlineUntil: 1_700_000_300, lastSeen: undefined, hiddenByMe: false },
  ],
  [
    { _: 'userStatusOffline', was_online: 1_700_000_000 },
    { state: 'offline', onlineUntil: undefined, lastSeen: 1_700_000_000, hiddenByMe: false },
  ],
  [
    { _: 'userStatusRecently', by_me: true },
    { state: 'recently', onlineUntil: undefined, lastSeen: undefined, hiddenByMe: true },
  ],
  [
    { _: 'userStatusLastWeek' },
    { state: 'last-week', onlineUntil: undefined, lastSeen: undefined, hiddenByMe: false },
  ],
  [
    { _: 'userStatusLastMonth', by_me: true },
    { state: 'last-month', onlineUntil: undefined, lastSeen: undefined, hiddenByMe: true },
  ],
  [
    { _: 'userStatusEmpty' },
    { state: 'long-ago', onlineUntil: undefined, lastSeen: undefined, hiddenByMe: false },
  ],
]

const PERSON: User = { _: 'user', id: 1_000_001n, first_name: 'Ada' }

describe('reading a status on its own', () => {
  it.each(VARIANTS)('reads %o', (status, presence) => {
    expect(readPresence(status)).toEqual(presence)
  })

  it('reads every constructor the schema has for a status', () => {
    // A constructor added to the union without a reading would stop compiling here.
    const read: Record<TypeUserStatus['_'], true> = {
      userStatusOnline: true,
      userStatusOffline: true,
      userStatusRecently: true,
      userStatusLastWeek: true,
      userStatusLastMonth: true,
      userStatusEmpty: true,
    }

    expect(VARIANTS.map(([status]) => status._).sort()).toEqual(Object.keys(read).sort())
  })

  it('gives the times as Telegram sent them, in Unix seconds', () => {
    const online = readPresence({ _: 'userStatusOnline', expires: 1_700_000_300 })
    const offline = readPresence({ _: 'userStatusOffline', was_online: 1_700_000_000 })

    // Seconds, not milliseconds: multiplied by a thousand they are these moments.
    expect(new Date((online?.onlineUntil ?? 0) * 1000).toISOString()).toBe(
      '2023-11-14T22:18:20.000Z',
    )
    expect(new Date((offline?.lastSeen ?? 0) * 1000).toISOString()).toBe('2023-11-14T22:13:20.000Z')
  })

  it('derives no time for a status that states none', () => {
    for (const [status, presence] of VARIANTS.slice(2)) {
      expect(readPresence(status), status._).toEqual(presence)
      expect(presence.onlineUntil ?? presence.lastSeen).toBeUndefined()
    }
  })

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['text', 'userStatusOnline'],
    ['a constructor the schema does not have', { _: 'userStatusHidden' }],
    ['an online status with no time', { _: 'userStatusOnline' }],
    ['an offline status whose time is not a number', { _: 'userStatusOffline', was_online: '9' }],
    ['a time that is not whole seconds', { _: 'userStatusOffline', was_online: 1.5 }],
  ])('reads %s as no status, not as a state', (_, value) => {
    expect(readPresence(value)).toBeUndefined()
  })

  it('never says bot: a status cannot', () => {
    for (const [status] of VARIANTS) expect(readPresence(status)?.state).not.toBe('bot')
  })

  it('is what a user’s presence is read with', () => {
    for (const [status, presence] of VARIANTS) {
      expect(new UserView({ ...PERSON, status }).presence).toEqual(presence)
    }
    // A user with no status is one whose status is empty; a bare absent status is not a status.
    expect(new UserView(PERSON).presence?.state).toBe('long-ago')
    expect(new UserView({ ...PERSON, bot: true }).presence?.state).toBe('bot')
  })

  it('answers with the presence model, or nothing', () => {
    expectTypeOf(readPresence).parameter(0).toEqualTypeOf<unknown>()
    expectTypeOf(readPresence).returns.toEqualTypeOf<UserPresence | undefined>()
    expectTypeOf<MtprotoContext['presence']>().toEqualTypeOf<UserPresence | undefined>()
  })
})

describe('a status update on an account', () => {
  it('names the user as the target and reads the status it brings', async () => {
    const harness = mockAccount()
    const seen: (readonly [string, bigint | undefined, UserPresence | undefined])[] = []
    harness.account.on('mtproto:user_status', (event) => {
      seen.push([event.kind, event.target?.id, event.presence])
    })

    for (const [status] of VARIANTS) {
      await harness.send.update({ _: 'updateUserStatus', user_id: 1_000_001n, status })
    }
    await harness.dispose()

    expect(seen.map(([kind, user]) => [kind, user])).toEqual(
      VARIANTS.map(() => ['mtproto:user_status', 1_000_001n]),
    )
    expect(seen.map(([, , presence]) => presence)).toEqual(VARIANTS.map(([, presence]) => presence))
  })

  it('leaves presence empty on every other kind of update', async () => {
    const harness = mockAccount()
    const seen: (UserPresence | undefined)[] = []
    harness.account.on('message', (event) => {
      seen.push(event.presence)
    })

    await harness.send.message('hello')
    await harness.dispose()

    expect(seen).toEqual([undefined])
  })
})
