// SPDX-License-Identifier: MPL-2.0

/**
 * Mini App launch data.
 *
 * The vectors were computed outside this repository, with Python's standard
 * library (form decoding, HMAC-SHA-256) and an independent Ed25519
 * implementation, and cross-checked with OpenSSL; nothing below signs with the
 * code it tests. The Ed25519 vector is signed by a test key generated for it,
 * since only Telegram holds the private half of its own keys: that a genuine
 * Telegram signature verifies under the published key needs real launch data.
 */

import { ConfigError } from '@yuigram/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  hashInitData,
  InitDataError,
  InitDataKey,
  readInitData,
  TELEGRAM_INIT_DATA_KEYS,
  verifyInitData,
  verifyInitDataSignature,
} from '../src/web-app/index.js'

/** A placeholder in a bot token's shape; it names no bot. */
const TOKEN = '123456789:AAExample_token-for_test-vectors_only'
const BOT_ID = 123456789

/** The test key's public half, raw. */
const TEST_PUBLIC_KEY = hex('7ce9dcbe6dbee74f1f2f56a0779ec34235b2bb9ed903e2bd13d34123bf0a743c')

const SIGNATURE =
  'yGAiHs0YsJG87B7IdKHK4QDBNnbNPcN56q2EaoJXPyqwU7Jub6Y5oZgzW-hMLYTW3eh3WiyltElkukQlzUEdBg'
const HASH = 'dcd76feb30051fa50ef8a3f54781f038e92137d29f22196e5f2da5ea87aef85c'
const USER =
  '%7B%22id%22%3A1111111111%2C%22first_name%22%3A%22Ada%22%2C%22last_name%22%3A%22Lovelace%22%2C%22username%22%3A%22ada_example%22%2C%22language_code%22%3A%22en%22%2C%22allows_write_to_pm%22%3Atrue%2C%22photo_url%22%3A%22https%3A%5C%2F%5C%2Ft.me%5C%2Fi%5C%2Fuserpic%5C%2F320%5C%2Fexample.svg%22%7D'

/** Launch data with both proofs: `hash` under {@link TOKEN}, `signature` under the test key. */
const SIGNED = [
  'query_id=AAHdF6IQAAAAAN0XohDhrOrc',
  `user=${USER}`,
  'auth_date=1759400000',
  'chat_instance=-8171893463491839393',
  'chat_type=sender',
  'start_param=page_42',
  `signature=${SIGNATURE}`,
  `hash=${HASH}`,
].join('&')
const SIGNED_AT = 1_759_400_000

/** Older launch data with no `signature`, whose user's name has a space. */
const UNSIGNED =
  'auth_date=1700000000&query_id=AAH-second_vector&user=%7B%22id%22%3A2222222222%2C%22first_name%22%3A%22Grace%20Brewster%22%2C%22is_premium%22%3Atrue%7D&hash=e58bd23de3144a2f335326d90f673314212b5fd69bef9b771670af746442e042'
const UNSIGNED_AT = 1_700_000_000

const signedOnly = { botId: BOT_ID, publicKey: TEST_PUBLIC_KEY, maxAge: 3600, now: SIGNED_AT }

function hex(text: string): Uint8Array {
  return Uint8Array.from(text.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16))
}

/** The vector with one field's raw text replaced, or removed when `value` is undefined. */
function withField(initData: string, name: string, value: string | undefined): string {
  return initData
    .split('&')
    .flatMap((pair) =>
      pair.startsWith(`${name}=`) ? (value === undefined ? [] : [`${name}=${value}`]) : [pair],
    )
    .join('&')
}

async function problemOf(check: Promise<unknown>): Promise<string> {
  const error = await check.then(
    () => undefined,
    (thrown: unknown) => thrown,
  )
  expect(error).toBeInstanceOf(InitDataError)

  return (error as InitDataError).problem
}

describe('reading launch data', () => {
  it('reads every field by its own name, JSON objects parsed and times as numbers', () => {
    expect(readInitData(SIGNED)).toEqual({
      query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
      user: {
        id: 1111111111,
        first_name: 'Ada',
        last_name: 'Lovelace',
        username: 'ada_example',
        language_code: 'en',
        allows_write_to_pm: true,
        photo_url: 'https://t.me/i/userpic/320/example.svg',
      },
      chat_instance: '-8171893463491839393',
      chat_type: 'sender',
      start_param: 'page_42',
      auth_date: SIGNED_AT,
      hash: HASH,
      signature: SIGNATURE,
    })
    expect(readInitData(UNSIGNED).user?.first_name).toBe('Grace Brewster')
  })

  it('reads a plus as a space, as a query string does', () => {
    const plus = withField(
      UNSIGNED,
      'user',
      '%7B%22id%22%3A2%2C%22first_name%22%3A%22Grace+Brewster%22%7D',
    )

    expect(readInitData(plus).user?.first_name).toBe('Grace Brewster')
  })

  it('reads a chat, and the attachment-menu fields', () => {
    const chat = encodeURIComponent('{"id":-1001234567890,"type":"supergroup","title":"Readers"}')
    const data = readInitData(`chat=${chat}&can_send_after=30&auth_date=1&hash=${HASH}`)

    expect(data.chat).toEqual({ id: -1001234567890, type: 'supergroup', title: 'Readers' })
    expect(data.can_send_after).toBe(30)
  })

  it('says why there is nothing to read when the text is empty', () => {
    expect(() => readInitData('')).toThrow(/keyboard button or in inline mode/)
  })

  it.each([
    ['a pair with no "="', `${UNSIGNED}&orphan`],
    ['an empty pair', UNSIGNED.replace('&', '&&')],
    ['a field named twice', `${UNSIGNED}&query_id=again`],
    ['a field name Telegram does not write', `${UNSIGNED}&query-id=x`],
    ['an empty field name', `${UNSIGNED}&=x`],
    ['an escape that is not UTF-8', withField(UNSIGNED, 'query_id', '%FF')],
    ['a truncated escape', withField(UNSIGNED, 'query_id', 'a%2')],
    ['no hash', withField(UNSIGNED, 'hash', undefined)],
    ['a hash in capitals', withField(UNSIGNED, 'hash', HASH.toUpperCase())],
    ['a hash one digit short', withField(UNSIGNED, 'hash', HASH.slice(1))],
    ['no auth_date', withField(UNSIGNED, 'auth_date', undefined)],
    ['an auth_date with a leading zero', withField(UNSIGNED, 'auth_date', '01700000000')],
    ['an auth_date with a fraction', withField(UNSIGNED, 'auth_date', '1700000000.5')],
    ['an auth_date past the safe integers', withField(UNSIGNED, 'auth_date', '9007199254740993')],
    ['a user that is not JSON', withField(UNSIGNED, 'user', '%7Bid')],
    ['a user that is a JSON array', withField(UNSIGNED, 'user', '%5B1%5D')],
    [
      'a user with no whole-number id',
      withField(UNSIGNED, 'user', '%7B%22id%22%3A1.5%2C%22first_name%22%3A%22A%22%7D'),
    ],
    ['a user with no first name', withField(UNSIGNED, 'user', '%7B%22id%22%3A1%7D')],
    [
      'a chat of a type launch data never names',
      `${UNSIGNED}&chat=${encodeURIComponent('{"id":1,"type":"private","title":"x"}')}`,
    ],
  ])('refuses %s', (_, initData) => {
    expect(() => readInitData(initData)).toThrow(InitDataError)
  })

  it('refuses a line feed, which would let two texts produce one data-check-string', async () => {
    // Telegram signed `signature=…` and `user=…` as two lines. Folding the user
    // into the signature's value gives the same lines and drops the user.
    const folded = withField(
      withField(SIGNED, 'user', undefined),
      'signature',
      `${SIGNATURE}%0Auser%3D${USER}`,
    )

    expect(() => readInitData(folded)).toThrow(/line feed/)
    expect(await problemOf(verifyInitData(folded, { token: TOKEN, maxAge: Infinity }))).toBe(
      'malformed',
    )
  })
})

describe('checking the hash, with the bot token', () => {
  it('accepts launch data whose hash was computed independently', async () => {
    const data = await verifyInitData(SIGNED, { token: TOKEN, maxAge: 3600, now: SIGNED_AT + 10 })

    expect(data.user?.id).toBe(1111111111)
    expect(data.start_param).toBe('page_42')
    expect(
      (await verifyInitData(UNSIGNED, { token: TOKEN, maxAge: 60, now: UNSIGNED_AT })).user
        ?.is_premium,
    ).toBe(true)
  })

  it('checks with a key derived once', async () => {
    const key = await InitDataKey.fromToken(TOKEN)

    await expect(verifyInitData(SIGNED, { key, maxAge: Infinity })).resolves.toMatchObject({
      auth_date: SIGNED_AT,
    })
    await expect(verifyInitData(UNSIGNED, { key, maxAge: Infinity })).resolves.toMatchObject({
      auth_date: UNSIGNED_AT,
    })
  })

  it('does not depend on the order the fields arrive in', async () => {
    const reversed = SIGNED.split('&').reverse().join('&')

    await expect(
      verifyInitData(reversed, { token: TOKEN, maxAge: Infinity }),
    ).resolves.toBeDefined()
  })

  it.each([
    ['another bot’s token', SIGNED, '123456789:AAAnother_token-of_the_same-shape_x'],
    ['an altered user', SIGNED.replace('Lovelace', 'Lovelacf'), TOKEN],
    ['an altered auth_date', withField(SIGNED, 'auth_date', '1759400001'), TOKEN],
    ['a removed field', withField(SIGNED, 'start_param', undefined), TOKEN],
    ['an added field', `${SIGNED}&extra=1`, TOKEN],
    [
      'the signature removed, since the hash covers it',
      withField(SIGNED, 'signature', undefined),
      TOKEN,
    ],
    ['an altered signature', withField(SIGNED, 'signature', `${SIGNATURE.slice(0, -2)}AA`), TOKEN],
    ['a hash one bit off', withField(SIGNED, 'hash', `${HASH.slice(0, -1)}d`), TOKEN],
  ])('refuses %s', async (_, initData, token) => {
    expect(await problemOf(verifyInitData(initData, { token, maxAge: Infinity }))).toBe('mismatch')
  })

  it('keeps the token and the data out of its messages', async () => {
    const errors = await Promise.all([
      verifyInitData(SIGNED.replace('Lovelace', 'Lovelacf'), {
        token: TOKEN,
        maxAge: Infinity,
      }).catch((e: unknown) => e),
      verifyInitData(SIGNED, { token: TOKEN, maxAge: 1, now: SIGNED_AT + 5 }).catch(
        (e: unknown) => e,
      ),
      verifyInitData(withField(SIGNED, 'user', '%7Bid'), { token: TOKEN, maxAge: Infinity }).catch(
        (e: unknown) => e,
      ),
      InitDataKey.fromToken(`${TOKEN} `).catch((e: unknown) => e),
    ])

    for (const error of errors) {
      const shown = `${String(error)} ${JSON.stringify(error)}`
      expect(shown).not.toContain(TOKEN.split(':')[1])
      expect(shown).not.toContain('Lovelace')
      expect(shown).not.toContain(HASH)
    }
  })

  it('refuses a token or a key that cannot be checked with', async () => {
    await expect(InitDataKey.fromToken('not a token')).rejects.toThrow(ConfigError)
    await expect(
      verifyInitData(SIGNED, { key: {} as InitDataKey, maxAge: Infinity }),
    ).rejects.toThrow(ConfigError)
  })
})

describe('writing the hash', () => {
  const withoutHash = (initData: string) => withField(initData, 'hash', undefined)

  it('computes the hash that was computed independently', async () => {
    expect(await hashInitData(withoutHash(SIGNED), { token: TOKEN })).toBe(HASH)
    expect(
      await hashInitData(withoutHash(UNSIGNED), { key: await InitDataKey.fromToken(TOKEN) }),
    ).toBe('e58bd23de3144a2f335326d90f673314212b5fd69bef9b771670af746442e042')
  })

  it('leaves a hash already in the text out of the computation', async () => {
    expect(await hashInitData(SIGNED, { token: TOKEN })).toBe(HASH)
    expect(await hashInitData(withField(SIGNED, 'hash', 'f'.repeat(64)), { token: TOKEN })).toBe(
      HASH,
    )
  })

  it('writes launch data the check accepts, for a fixture of the application’s own', async () => {
    const fields = 'auth_date=1700000100&user=%7B%22id%22%3A7%2C%22first_name%22%3A%22Test%22%7D'
    const launch = `${fields}&hash=${await hashInitData(fields, { token: TOKEN })}`

    await expect(
      verifyInitData(launch, { token: TOKEN, maxAge: 60, now: 1_700_000_100 }),
    ).resolves.toMatchObject({ user: { id: 7, first_name: 'Test' } })
    expect(
      await problemOf(
        verifyInitData(launch, {
          token: '123456789:AAAnother_token-of_the_same-shape_x',
          maxAge: Infinity,
        }),
      ),
    ).toBe('mismatch')
  })

  it('refuses text that does not read as fields, and a token it cannot use', async () => {
    expect(await problemOf(hashInitData('auth_date=1&auth_date=2', { token: TOKEN }))).toBe(
      'malformed',
    )
    expect(await problemOf(hashInitData('', { token: TOKEN }))).toBe('malformed')
    await expect(hashInitData('auth_date=1', { token: 'not a token' })).rejects.toThrow(ConfigError)
  })
})

describe('checking the signature, as a third party', () => {
  it('accepts launch data signed independently, with only the bot id', async () => {
    const data = await verifyInitDataSignature(SIGNED, signedOnly)

    expect(data.user?.username).toBe('ada_example')
  })

  it('ignores the hash, which the signature does not cover', async () => {
    const otherHash = withField(SIGNED, 'hash', 'f'.repeat(64))

    await expect(verifyInitDataSignature(otherHash, signedOnly)).resolves.toBeDefined()
  })

  it.each([
    ['another bot’s id', SIGNED, { botId: BOT_ID + 1 }],
    ['an altered user', SIGNED.replace('Lovelace', 'Lovelacf'), {}],
    ['a removed field', withField(SIGNED, 'query_id', undefined), {}],
    ['an altered signature', withField(SIGNED, 'signature', `B${SIGNATURE.slice(1)}`), {}],
    [
      'Telegram’s production key, which did not sign the vector',
      SIGNED,
      { publicKey: 'production' as const },
    ],
    ['Telegram’s test key, which did not sign the vector', SIGNED, { publicKey: 'test' as const }],
  ])('refuses %s', async (_, initData, change) => {
    expect(await problemOf(verifyInitDataSignature(initData, { ...signedOnly, ...change }))).toBe(
      'mismatch',
    )
  })

  it('says launch data with no signature is unsigned, not forged', async () => {
    expect(
      await problemOf(verifyInitDataSignature(UNSIGNED, { ...signedOnly, now: UNSIGNED_AT })),
    ).toBe('unsigned')
  })

  it.each([
    ['one character short', SIGNATURE.slice(1)],
    ['with padding', `${SIGNATURE}==`],
    ['with bits set past the 64th byte', `${SIGNATURE.slice(0, -1)}h`],
    ['in standard base64', SIGNATURE.replace('-', '+')],
  ])('refuses a signature %s', async (_, signature) => {
    const initData = withField(SIGNED, 'signature', signature)

    expect(await problemOf(verifyInitDataSignature(initData, signedOnly))).toBe('malformed')
  })

  it('carries the keys Telegram publishes', () => {
    // https://core.telegram.org/bots/webapps#validating-data-for-third-party-use
    expect(TELEGRAM_INIT_DATA_KEYS).toEqual({
      production: 'e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d',
      test: '40055058a4ee38156a06562e52eece92a771bcd8346a8c4615cb7376eddf72ec',
    })
  })

  it('refuses a bot id or a key that cannot be checked with', async () => {
    await expect(verifyInitDataSignature(SIGNED, { ...signedOnly, botId: 0 })).rejects.toThrow(
      ConfigError,
    )
    await expect(verifyInitDataSignature(SIGNED, { ...signedOnly, botId: 1.5 })).rejects.toThrow(
      ConfigError,
    )
    await expect(
      verifyInitDataSignature(SIGNED, { ...signedOnly, publicKey: new Uint8Array(31) }),
    ).rejects.toThrow(ConfigError)
  })
})

describe('the age policy', () => {
  it('accepts data exactly as old as the limit, and refuses it a second later', async () => {
    await expect(
      verifyInitData(SIGNED, { token: TOKEN, maxAge: 300, now: SIGNED_AT + 300 }),
    ).resolves.toBeDefined()
    expect(
      await problemOf(verifyInitData(SIGNED, { token: TOKEN, maxAge: 300, now: SIGNED_AT + 301 })),
    ).toBe('expired')
    expect(
      await problemOf(verifyInitDataSignature(SIGNED, { ...signedOnly, now: SIGNED_AT + 3601 })),
    ).toBe('expired')
  })

  it('allows a minute of clock difference by default, and the skew it is given', async () => {
    await expect(
      verifyInitData(SIGNED, { token: TOKEN, maxAge: 300, now: SIGNED_AT - 60 }),
    ).resolves.toBeDefined()
    expect(
      await problemOf(verifyInitData(SIGNED, { token: TOKEN, maxAge: 300, now: SIGNED_AT - 61 })),
    ).toBe('future')
    expect(
      await problemOf(
        verifyInitData(SIGNED, { token: TOKEN, maxAge: 300, now: SIGNED_AT - 1, clockSkew: 0 }),
      ),
    ).toBe('future')
  })

  it('accepts any age only when told so', async () => {
    await expect(
      verifyInitData(UNSIGNED, { token: TOKEN, maxAge: Infinity }),
    ).resolves.toBeDefined()
    expect(await problemOf(verifyInitData(UNSIGNED, { token: TOKEN, maxAge: 86_400 }))).toBe(
      'expired',
    )
  })

  it('checks the proof before the age, so an expired answer means genuine but old', async () => {
    const forged = SIGNED.replace('Lovelace', 'Lovelacf')

    expect(
      await problemOf(verifyInitData(forged, { token: TOKEN, maxAge: 1, now: SIGNED_AT + 10 })),
    ).toBe('mismatch')
  })

  it.each([
    ['no limit', undefined],
    ['zero', 0],
    ['a negative limit', -1],
    ['not a number', Number.NaN],
  ])('refuses %s as the limit', async (_, maxAge) => {
    await expect(
      verifyInitData(SIGNED, { token: TOKEN, maxAge: maxAge as number }),
    ).rejects.toThrow(ConfigError)
  })
})

describe('which key a signature is checked with', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** The Ed25519 key each check imported, as hexadecimal. */
  async function keysImportedBy(
    ...publicKeys: readonly ('production' | 'test' | Uint8Array | undefined)[]
  ): Promise<readonly string[]> {
    const imported: string[] = []
    const real = globalThis.crypto.subtle.importKey.bind(globalThis.crypto.subtle)
    vi.spyOn(globalThis.crypto.subtle, 'importKey').mockImplementation(((
      ...args: Parameters<SubtleCrypto['importKey']>
    ) => {
      const [, material, algorithm] = args
      if ((algorithm as { name?: string }).name === 'Ed25519') {
        imported.push(Buffer.from(material as Uint8Array).toString('hex'))
      }

      return real(...args)
    }) as SubtleCrypto['importKey'])

    for (const publicKey of publicKeys) {
      const { publicKey: _fixtureKey, ...rest } = signedOnly
      await verifyInitDataSignature(SIGNED, {
        ...rest,
        ...(publicKey === undefined ? {} : { publicKey }),
      }).catch(() => undefined)
    }

    return imported
  }

  it('takes the production key unless told otherwise, and the test key when named', async () => {
    // The fixture is signed by neither, so a mismatch cannot tell the two apart.
    // What can be told is which published key each check handed to the platform.
    expect(await keysImportedBy(undefined, 'production', 'test')).toEqual([
      'e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d',
      'e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d',
      '40055058a4ee38156a06562e52eece92a771bcd8346a8c4615cb7376eddf72ec',
    ])
  })

  it('takes a key it is given as it is', async () => {
    expect(await keysImportedBy(TEST_PUBLIC_KEY)).toEqual([
      '7ce9dcbe6dbee74f1f2f56a0779ec34235b2bb9ed903e2bd13d34123bf0a743c',
    ])
  })
})

describe('a runtime without the Web Crypto API', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('says it cannot check, rather than that the data is forged', async () => {
    vi.stubGlobal('crypto', undefined)

    expect(await problemOf(verifyInitData(SIGNED, { token: TOKEN, maxAge: Infinity }))).toBe(
      'unsupported',
    )
  })

  it('says so when Ed25519 is what it lacks', async () => {
    const real = globalThis.crypto.subtle
    const refusing = Object.create(real) as SubtleCrypto
    refusing.importKey = () => Promise.reject(new DOMException('Ed25519', 'NotSupportedError'))
    vi.stubGlobal('crypto', { subtle: refusing })

    expect(await problemOf(verifyInitDataSignature(SIGNED, signedOnly))).toBe('unsupported')
  })
})
