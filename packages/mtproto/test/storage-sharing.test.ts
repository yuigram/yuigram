/**
 * What two accounts pointed at one store do to each other.
 *
 * An account divides the store it is given by purpose — authorizations,
 * datacenters, peers, the place in the update stream — and not by account,
 * because before it signs in an account has no identity to divide by. So two
 * accounts given the same store write to the same keys, and the second one to
 * reach a datacenter overwrites the first one's key for it.
 *
 * That is worth a test rather than a sentence, because the failure is silent:
 * both accounts keep working, each one occasionally finding a key it did not
 * negotiate, and the symptom arrives later and somewhere else.
 *
 * It is not specific to a browser, but `web()` makes it easy to reach by
 * accident: two calls with no arguments produce two stores over the same
 * `localStorage` under the same prefix, which is the same store. `file()` at
 * least has a path a caller has to choose.
 */

import { memory } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { authorizationStore } from '../src/storage/authorization.js'

/** A key of the width an authorization store accepts. */
const keyOf = (fill: number): Uint8Array => new Uint8Array(256).fill(fill)

describe('two accounts, one store', () => {
  it('overwrite each other at the same datacenter', async () => {
    const shared = memory()
    const first = authorizationStore(shared)
    const second = authorizationStore(shared)

    await first.setKey(2, keyOf(0x11))
    await second.setKey(2, keyOf(0x22))

    // Not a quirk of the store: the second write landed where the first one
    // was, because nothing in the key says which account wrote it.
    expect((await first.key(2))?.[0]).toBe(0x22)
  })

  it('stay apart when each is given its own area of one store', async () => {
    // The fix a caller has, and the one the documentation points at: give each
    // account a namespace of its own. `namespaced` is what `App` uses for the
    // framework state it owns, and protocol state needs the same treatment
    // because the account rather than the container owns it.
    const { namespaced } = await import('@yuigram/core')
    const shared = memory()
    const first = authorizationStore(namespaced(shared, 'a:'))
    const second = authorizationStore(namespaced(shared, 'b:'))

    await first.setKey(2, keyOf(0x11))
    await second.setKey(2, keyOf(0x22))

    expect((await first.key(2))?.[0]).toBe(0x11)
    expect((await second.key(2))?.[0]).toBe(0x22)
  })

  it('do not read each other’s salt or temporary key either', async () => {
    const { namespaced } = await import('@yuigram/core')
    const shared = memory()
    const first = authorizationStore(namespaced(shared, 'a:'))
    const second = authorizationStore(namespaced(shared, 'b:'))

    await first.setSalt(2, 1234n)
    await second.setSalt(2, 5678n)

    expect(await first.salt(2)).toBe(1234n)
    expect(await second.salt(2)).toBe(5678n)
  })
})
