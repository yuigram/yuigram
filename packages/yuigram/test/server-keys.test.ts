/**
 * Giving an account the keys it verifies a datacenter with, through the
 * published entry point alone.
 *
 * There was a time when nothing public could build one: a `ServerRsaKey` came
 * only from inside the package, so an application had no supported way to
 * construct an account that could complete a first key exchange. Here the keys
 * come from `yuigram` and nothing else — from Telegram's published PEM form and
 * from a modulus and exponent — and an account built with them completes an
 * exchange against a datacenter holding the private half.
 */

import { createPublicKey } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { REGISTRY as API } from '../../mtproto/src/generated/api/registry.js'
import { REGISTRY as CORE } from '../../mtproto/src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../../mtproto/src/generated/mtproto/registry.js'
import { TlScope } from '../../mtproto/src/tl/registry.js'
import { MockDatacenter } from '../../mtproto/test/server/datacenter.js'
import { createServerKey } from '../../mtproto/test/server/keys.js'
import { Account, ConfigError, memory, serverKeysFromPem, serverRsaKey } from '../src/index.js'

const ORIGIN = 1_700_000_000
const KEY = createServerKey()

const base64url = (value: bigint): string => {
  let hex = value.toString(16)
  if (hex.length % 2 === 1) hex = `0${hex}`
  return Buffer.from(hex, 'hex').toString('base64url')
}

/** The public half as Telegram publishes its own: PKCS#1 PEM. */
const PEM = createPublicKey({
  key: { kty: 'RSA', n: base64url(KEY.n), e: base64url(KEY.e) },
  format: 'jwk',
})
  .export({ type: 'pkcs1', format: 'pem' })
  .toString()

function accountAgainst(
  keys: Parameters<typeof serverRsaKey>[0][] | ReturnType<typeof serverKeysFromPem>,
) {
  const datacenter = new MockDatacenter({
    id: 2,
    host: '127.0.0.2',
    port: 443,
    key: KEY,
    scope: new TlScope('server-keys', [CORE, MTPROTO, API]),
    serverTime: ORIGIN,
  })
  const started = Date.now()
  const account = new Account({
    apiId: 1,
    apiHash: 'test',
    storage: memory(),
    keys: keys as ReturnType<typeof serverKeysFromPem>,
    now: () => ORIGIN * 1000 + (Date.now() - started),
    bootstrap: {
      thisDc: 2,
      testMode: true,
      options: [
        {
          id: 2,
          host: '127.0.0.2',
          port: 443,
          ipv6: false,
          mediaOnly: false,
          cdn: false,
          secret: undefined,
          tcpoOnly: false,
          thisPortOnly: false,
          static: false,
        },
      ],
    },
    open: async (request) => datacenter.connect(request),
  })
  return { account, datacenter }
}

describe('server keys from the published entry point', () => {
  it('reads the PEM form and the modulus-and-exponent form to the same key', () => {
    const [fromPem] = serverKeysFromPem(PEM)
    const fromParts = serverRsaKey({ n: KEY.n, e: KEY.e })

    expect(fromPem).toEqual(fromParts)
    expect(fromPem?.fingerprint).toBe(KEY.fingerprint)
  })

  it('lets an account built with them complete a key exchange and make a call', {
    timeout: 60_000,
  }, async () => {
    const { account } = accountAgainst(serverKeysFromPem(PEM))

    await account.connect()
    const answer = await account.api.call({ _: 'help.getConfig' })
    await account.stop({ timeout: 100 })

    expect(typeof answer._).toBe('string')
  })

  it('refuses a first exchange with no key the datacenter could be verified by', {
    timeout: 60_000,
  }, async () => {
    // No keys at all, and keys that are not the datacenter's: both are how the
    // account was built, so the first call is told at once rather than left
    // waiting on attempts that cannot succeed.
    const other = createServerKey()
    for (const keys of [[], [serverRsaKey({ n: other.n, e: other.e })]]) {
      const { account } = accountAgainst(keys)

      // Connecting is lazy; the first call is what needs a key exchange.
      await account.connect()
      const failure = await account.api
        .call({ _: 'help.getConfig' })
        .catch((error: unknown) => error)
      await account.stop({ timeout: 100 })

      expect(failure).toBeInstanceOf(ConfigError)
      expect((failure as Error).message).toMatch(/serverKeysFromPem/)
    }
  })
})
