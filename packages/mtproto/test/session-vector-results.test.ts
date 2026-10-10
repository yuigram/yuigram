// SPDX-License-Identifier: MIT

/**
 * Results that are lists, over the wire.
 *
 * A method declared to return `Vector<T>` — `users.getUsers` among them, which
 * an account calls to learn who it is — is answered with a boxed vector where
 * a result goes. These cases send such answers through a stand-in datacenter,
 * byte for byte as Telegram writes them, plain and compressed, and read them
 * through the whole path an account uses: the connection, the session and the
 * call that asked.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { NUMBER_VECTOR_RESULTS } from '../src/session/vector-result.js'
import type { TlValue } from '../src/tl/index.js'
import { packedApiAnswer, vectorAnswer } from './server/answers.js'
import { createServerKey } from './server/keys.js'
import { mockAccount } from './support/mock-account.js'

const KEY = createServerKey()

const ADA: TlValue = { _: 'user', id: 7n, access_hash: 11n, first_name: 'Ada' }
const BORIS: TlValue = { _: 'user', id: 8n, access_hash: 12n, first_name: 'Boris' }

/** An account whose datacenter answers one method with what it is given. */
function answering(method: string, answer: TlValue) {
  return mockAccount({
    key: KEY,
    api: (query) => (query._ === method ? answer : undefined),
  })
}

const names = (answer: unknown): unknown[] =>
  (answer as TlValue[]).map((user) => [user._, user['first_name']])

describe('a result that is a list of objects', () => {
  it('is read as the list, on the first call of a connection, which travels wrapped', async () => {
    const instance = answering('users.getUsers', vectorAnswer([ADA, BORIS]))
    await instance.account.connect()

    const answer = await instance.account.api.call({
      _: 'users.getUsers',
      id: [{ _: 'inputUserSelf' }],
    })

    expect(Array.isArray(answer)).toBe(true)
    expect(names(answer)).toEqual([
      ['user', 'Ada'],
      ['user', 'Boris'],
    ])
    await instance.dispose()
  })

  it('is read the same way when Telegram compresses it', async () => {
    const instance = answering('users.getUsers', packedApiAnswer(vectorAnswer([ADA, BORIS])))
    await instance.account.connect()

    const answer = await instance.account.api.call({
      _: 'users.getUsers',
      id: [{ _: 'inputUserSelf' }],
    })

    expect(names(answer)).toEqual([
      ['user', 'Ada'],
      ['user', 'Boris'],
    ])
    await instance.dispose()
  })

  it('lets an account learn who it is, which is a list of one', async () => {
    for (const answer of [vectorAnswer([ADA]), packedApiAnswer(vectorAnswer([ADA]))]) {
      const instance = answering('users.getUsers', answer)
      await instance.account.connect()

      const me = await instance.account.me()

      expect(me.id).toBe(7n)
      expect(me.displayName).toBe('Ada')
      await instance.dispose()
    }
  })

  it('is an empty list when nothing is in it', async () => {
    const instance = answering('users.getUsers', vectorAnswer([]))
    await instance.account.connect()

    await expect(
      instance.account.api.call({ _: 'users.getUsers', id: [{ _: 'inputUserSelf' }] }),
    ).resolves.toEqual([])
    await instance.dispose()
  })
})

describe('a result that is a list of numbers', () => {
  it('is read as the method declares: int for one, long for another', async () => {
    const ints = answering('contacts.getContactIDs', vectorAnswer([3, 5, 8]))
    await ints.account.connect()
    await expect(ints.account.api.call({ _: 'contacts.getContactIDs', hash: 0n })).resolves.toEqual(
      [3, 5, 8],
    )
    await ints.dispose()

    const longs = answering('photos.deletePhotos', packedApiAnswer(vectorAnswer([1n, 2n])))
    await longs.account.connect()
    await expect(
      longs.account.api.call({ _: 'photos.deletePhotos', id: [{ _: 'inputPhotoEmpty' }] }),
    ).resolves.toEqual([1n, 2n])
    await longs.dispose()
  })
})

describe('a list that cannot be read as the call declares', () => {
  it('fails that call, and the connection goes on', async () => {
    // Numbers where objects are declared: the first is no constructor at all.
    const instance = answering('users.getUsers', vectorAnswer([1, 2]))
    await instance.account.connect()

    await expect(
      instance.account.api.call({ _: 'users.getUsers', id: [{ _: 'inputUserSelf' }] }),
    ).rejects.toThrow(/is not in the/)
    const opened = instance.datacenter(2).connections.length

    // Had the bad answer ended the connection, this call would need a new one.
    const after = await instance.account.api.call({ _: 'help.getConfig' })
    expect(after['_']).toBe('boolTrue')
    expect(instance.datacenter(2).connections).toHaveLength(opened)
    await instance.dispose()
  })
})

describe('the methods whose result is a list of numbers', () => {
  it('are exactly the ones the generated signatures declare', () => {
    // Read from the generated surface, which is generated from the schema: a
    // method Telegram adds with such a result fails this until it is listed.
    const methods = readFileSync(
      new URL('../src/generated/api/methods.ts', import.meta.url),
      'utf8',
    )
    const declared: Record<string, 'int' | 'long'> = {}
    for (const match of methods.matchAll(
      /\/\*\* `([\w.]+)#[0-9a-f]+` \*\/\s+\w+\([^\n]*\): Promise<readonly (number|bigint)\[\]>/g,
    )) {
      declared[match[1] as string] = match[2] === 'number' ? 'int' : 'long'
    }

    expect(Object.keys(declared).length).toBeGreaterThan(0)
    expect(declared).toEqual(NUMBER_VECTOR_RESULTS)
  })
})
