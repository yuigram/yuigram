/**
 * The encrypted store under a runtime that reports success differently.
 *
 * Node calls scrypt's callback with `null` for "no error"; Bun calls it with
 * `undefined`. A check for `null` alone treated every derivation on Bun as a
 * failure and rejected every write with `undefined`. Here scrypt answers the
 * way Bun does, over Node's own implementation, so the store has to take
 * `undefined` for success.
 */

import { vi } from 'vitest'

vi.mock('node:crypto', async (original) => {
  const actual = await original<typeof import('node:crypto')>()
  return {
    ...actual,
    scrypt: (
      secret: string,
      salt: Buffer,
      length: number,
      done: (error: Error | undefined, key: Buffer) => void,
    ) => {
      actual.scrypt(secret, salt, length, (error, key) => done(error ?? undefined, key))
    },
  }
})

const { describe, expect, it } = await import('vitest')
const { encrypted } = await import('../src/storage/encrypted.js')
const { memory } = await import('../src/storage/memory.js')

describe('an encrypted store where success is reported as undefined', () => {
  it('writes, and reads back what it wrote', async () => {
    const backing = memory<string>()
    const store = encrypted(backing, 'a secret long enough to derive a key from')

    await store.set('k', { secret: true })

    expect(await store.get('k')).toEqual({ secret: true })
    expect(await encrypted(backing, 'a secret long enough to derive a key from').get('k')).toEqual({
      secret: true,
    })
  })
})
