/**
 * Mini App launch data, checked by the built package in a real browser.
 *
 * Unlike the rest of the page, this is bundled from `dist` — the entry point a
 * consumer's bundler resolves `yuigram/web-app` to — with no source mapped in,
 * so what runs here is what is published. The server refuses to serve it if
 * the bundle reaches a Node built-in or a module that is not built output.
 *
 * The fixtures were computed apart from the code they check: the hashes with
 * Python's standard library and OpenSSL, the signature with an independent
 * Ed25519 implementation under a key generated for it. The token is a
 * placeholder in a token's shape and names no bot. What this shows is that the
 * package executes in this browser and applies both published algorithms;
 * that launch data Telegram itself signed verifies under the keys it publishes
 * needs such launch data, and nothing here stands in for it.
 */

import {
  hashInitData,
  InitDataError,
  InitDataKey,
  readInitData,
  TELEGRAM_INIT_DATA_KEYS,
  verifyInitData,
  verifyInitDataSignature,
} from '../../../packages/yuigram/dist/web-app.js'

type Check = (name: string, run: () => Promise<string> | string) => Promise<void>
type Expect = (condition: boolean, message: string) => void

const TOKEN = '123456789:AAExample_token-for_test-vectors_only'
const BOT_ID = 123456789
const TEST_KEY = '7ce9dcbe6dbee74f1f2f56a0779ec34235b2bb9ed903e2bd13d34123bf0a743c'
const SIGNATURE =
  'yGAiHs0YsJG87B7IdKHK4QDBNnbNPcN56q2EaoJXPyqwU7Jub6Y5oZgzW-hMLYTW3eh3WiyltElkukQlzUEdBg'
const HASH = 'dcd76feb30051fa50ef8a3f54781f038e92137d29f22196e5f2da5ea87aef85c'
const SIGNED_AT = 1_759_400_000

/** Launch data carrying both proofs: `hash` under the token, `signature` under the test key. */
const SIGNED = [
  'query_id=AAHdF6IQAAAAAN0XohDhrOrc',
  'user=%7B%22id%22%3A1111111111%2C%22first_name%22%3A%22Ada%22%2C%22last_name%22%3A%22Lovelace%22%2C%22username%22%3A%22ada_example%22%2C%22language_code%22%3A%22en%22%2C%22allows_write_to_pm%22%3Atrue%2C%22photo_url%22%3A%22https%3A%5C%2F%5C%2Ft.me%5C%2Fi%5C%2Fuserpic%5C%2F320%5C%2Fexample.svg%22%7D',
  `auth_date=${String(SIGNED_AT)}`,
  'chat_instance=-8171893463491839393',
  'chat_type=sender',
  'start_param=page_42',
  `signature=${SIGNATURE}`,
  `hash=${HASH}`,
].join('&')

/** Older launch data with no `signature`. */
const UNSIGNED =
  'auth_date=1700000000&query_id=AAH-second_vector&user=%7B%22id%22%3A2222222222%2C%22first_name%22%3A%22Grace%20Brewster%22%2C%22is_premium%22%3Atrue%7D&hash=e58bd23de3144a2f335326d90f673314212b5fd69bef9b771670af746442e042'

const ALTERED = SIGNED.replace('Lovelace', 'Lovelacf')

const bytesOf = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16))

/** The problem a refusal names, or `'accepted'` when there was none. */
async function problemOf(attempt: Promise<unknown>): Promise<string> {
  return attempt.then(
    () => 'accepted',
    (error: unknown) => (error instanceof InitDataError ? error.problem : `threw ${String(error)}`),
  )
}

async function runWebAppChecks(check: Check, expect: Expect): Promise<void> {
  const signedOnly = {
    botId: BOT_ID,
    publicKey: bytesOf(TEST_KEY),
    maxAge: 3600,
    now: SIGNED_AT + 10,
  }

  await check('reads launch data from the built package, claiming nothing about it', () => {
    const genuine = readInitData(SIGNED)
    // Reading is not checking: text that was altered reads just as well.
    const forged = readInitData(ALTERED)

    expect(genuine.user?.id === 1111111111, 'the user was not read')
    expect(genuine.auth_date === SIGNED_AT, 'the time was not read as a number')
    expect(genuine.start_param === 'page_42', 'the start parameter was not read')
    expect(forged.user?.last_name === 'Lovelacf', 'altered text did not read')

    return 'fields read by their own names; altered text reads the same, unchecked'
  })

  await check('checks a hash with a made-up token, as the package ships', async () => {
    const data = await verifyInitData(SIGNED, { token: TOKEN, maxAge: 3600, now: SIGNED_AT + 10 })
    const key = await InitDataKey.fromToken(TOKEN)
    const older = await verifyInitData(UNSIGNED, { key, maxAge: Number.POSITIVE_INFINITY })
    const written = await hashInitData(SIGNED, { key })

    expect(data.user?.username === 'ada_example', 'the checked data lost its user')
    expect(older.user?.is_premium === true, 'a key derived once did not check older data')
    expect(written === HASH, 'the hash written here is not the one computed elsewhere')

    return 'HMAC-SHA-256 through this page’s Web Crypto, by token and by a key derived once'
  })

  await check('checks an Ed25519 signature with only the bot’s id', async () => {
    const data = await verifyInitDataSignature(SIGNED, signedOnly)
    // The signature does not cover the hash, so another hash changes nothing.
    const otherHash = SIGNED.replace(HASH, 'f'.repeat(64))

    expect(data.user?.id === 1111111111, 'the checked data lost its user')
    expect(
      (await problemOf(verifyInitDataSignature(otherHash, signedOnly))) === 'accepted',
      'a different hash changed the signature check',
    )

    return 'a signature made by an independent implementation verified, under the key it was made with'
  })

  await check('refuses altered launch data, by either proof', async () => {
    const byHash = await problemOf(
      verifyInitData(ALTERED, { token: TOKEN, maxAge: Number.POSITIVE_INFINITY }),
    )
    const bySignature = await problemOf(verifyInitDataSignature(ALTERED, signedOnly))
    const byOtherBot = await problemOf(
      verifyInitDataSignature(SIGNED, { ...signedOnly, botId: BOT_ID + 1 }),
    )

    expect(byHash === 'mismatch', `the hash check answered '${byHash}'`)
    expect(bySignature === 'mismatch', `the signature check answered '${bySignature}'`)
    expect(byOtherBot === 'mismatch', `another bot’s id answered '${byOtherBot}'`)

    return 'one changed letter, or another bot’s id, is a mismatch'
  })

  await check('applies the age limit after the proof', async () => {
    const atLimit = await problemOf(
      verifyInitData(SIGNED, { token: TOKEN, maxAge: 300, now: SIGNED_AT + 300 }),
    )
    const old = await problemOf(
      verifyInitData(SIGNED, { token: TOKEN, maxAge: 300, now: SIGNED_AT + 301 }),
    )
    const ahead = await problemOf(
      verifyInitDataSignature(SIGNED, { ...signedOnly, now: SIGNED_AT - 61 }),
    )
    const forgedAndOld = await problemOf(
      verifyInitData(ALTERED, { token: TOKEN, maxAge: 1, now: SIGNED_AT + 10 }),
    )

    expect(atLimit === 'accepted', `data exactly at the limit answered '${atLimit}'`)
    expect(old === 'expired', `data a second past the limit answered '${old}'`)
    expect(ahead === 'future', `data dated ahead of the clock answered '${ahead}'`)
    expect(forgedAndOld === 'mismatch', `altered old data answered '${forgedAndOld}'`)

    return 'accepted at the limit, expired a second later, and dated ahead refused'
  })

  await check('takes Telegram’s published keys, which did not sign the fixture', async () => {
    // What this can show: the two keys are the published ones, this browser
    // accepts each as an Ed25519 key, and neither verifies a signature it did
    // not make. That a launch Telegram signed verifies under them is not shown.
    expect(
      TELEGRAM_INIT_DATA_KEYS.production ===
        'e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d',
      'the production key is not the published one',
    )
    expect(
      TELEGRAM_INIT_DATA_KEYS.test ===
        '40055058a4ee38156a06562e52eece92a771bcd8346a8c4615cb7376eddf72ec',
      'the test-environment key is not the published one',
    )

    const { publicKey: _fixtureKey, ...withBotId } = signedOnly
    const production = await problemOf(verifyInitDataSignature(SIGNED, withBotId))
    const test = await problemOf(
      verifyInitDataSignature(SIGNED, { ...withBotId, publicKey: 'test' }),
    )
    const unsigned = await problemOf(
      verifyInitDataSignature(UNSIGNED, { ...withBotId, now: 1_700_000_000 }),
    )

    expect(production === 'mismatch', `the production key answered '${production}'`)
    expect(test === 'mismatch', `the test-environment key answered '${test}'`)
    expect(unsigned === 'unsigned', `data with no signature answered '${unsigned}'`)

    return 'both keys load as Ed25519 keys here and refuse a signature that is not Telegram’s'
  })
}
// Left where the page's harness finds it: the two are separate bundles, one
// from source and this one from built output, and share nothing but the page.
;(globalThis as { __webAppChecks?: typeof runWebAppChecks }).__webAppChecks = runWebAppChecks
