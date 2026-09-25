/**
 * The version-3 session string other MTProto libraries write.
 *
 * The fixtures are built here byte by byte from the layout — version, flags,
 * length-prefixed addresses, the user, the key — rather than by the code under
 * test, so reading one checks the reader against the layout and not against
 * itself. Every refusal is a string that would otherwise be read as an account
 * it is not.
 */

import { memory, SessionError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { Account } from '../src/account.js'
import type { DcConfiguration } from '../src/network/dc.js'
import { encodeSession, readSession, writeSession } from '../src/session.js'
import { readTlSession, type TlSession, writeTlSession } from '../src/session-tl.js'
import { areaFor } from '../src/storage/ownership.js'

const key = (seed: number): Uint8Array =>
  Uint8Array.from({ length: 256 }, (_, index) => (seed * 101 + index * 7 + 3) & 0xff)

/* ---------------------------------------------------------------- fixtures */

const le32 = (value: number) => [
  value & 255,
  (value >>> 8) & 255,
  (value >>> 16) & 255,
  (value >>> 24) & 255,
]

/** TL bytes: a one-byte length up to 253, else 254 and three bytes; padded to four. */
function tlBytes(value: readonly number[]): number[] {
  const header = value.length <= 253 ? [value.length] : [254, ...le32(value.length).slice(0, 3)]
  const out = [...header, ...value]
  while (out.length % 4 !== 0) out.push(0)
  return out
}

const ascii = (text: string) => [...text].map((character) => character.charCodeAt(0))

/** An address as the layout writes it: version, dc, flags, host, port. */
const addressBytes = (version: number, dc: number, flags: number, host: string, port: number) => [
  version,
  dc,
  flags,
  ...tlBytes(ascii(host)),
  ...le32(port),
]

const BOOL_TRUE = [0xb5, 0x75, 0x72, 0x99]
const BOOL_FALSE = [0x37, 0x97, 0x79, 0xbc]

function build(parts: {
  version?: number
  flags: number
  main: number[]
  media?: number[]
  user?: { id: number; bot: number[] }
  key?: number[]
  extra?: number[]
}): string {
  const bytes = [
    parts.version ?? 3,
    ...le32(parts.flags),
    ...tlBytes(parts.main),
    ...(parts.media === undefined ? [] : tlBytes(parts.media)),
    ...(parts.user === undefined ? [] : [...le32(parts.user.id), 0, 0, 0, 0, ...parts.user.bot]),
    ...tlBytes(parts.key ?? [...key(1)]),
    ...(parts.extra ?? []),
  ]
  return Buffer.from(bytes).toString('base64url')
}

const MAIN = addressBytes(2, 2, 0, '149.154.167.50', 443)
const MEDIA = addressBytes(2, 2, 2, '149.154.167.222', 443)

/* ------------------------------------------------------------------- tests */

describe('reading', () => {
  it('reads the address, the media address, the user and the key', () => {
    const session = readTlSession(
      build({ flags: 0b101, main: MAIN, media: MEDIA, user: { id: 123_456_789, bot: BOOL_FALSE } }),
    )

    expect(session.dcId).toBe(2)
    expect(session.testMode).toBe(false)
    expect(session.addresses).toEqual([
      { id: 2, host: '149.154.167.50', port: 443, ipv6: false, mediaOnly: false },
      { id: 2, host: '149.154.167.222', port: 443, ipv6: false, mediaOnly: true },
    ])
    expect(session.self).toEqual({ id: 123_456_789n, isBot: false })
    expect(session.authKey).toEqual(key(1))
  })

  it('reads a string with one address and no user, on the test network, over IPv6', () => {
    const main = addressBytes(2, 1, 0b101, '2001:67c:4e8:f002::e', 443)
    const session = readTlSession(build({ flags: 0, main }))

    expect(session).toMatchObject({ dcId: 1, testMode: true })
    expect(session.addresses).toEqual([
      { id: 1, host: '2001:67c:4e8:f002::e', port: 443, ipv6: true, mediaOnly: false },
    ])
    expect(session.self).toBeUndefined()
  })

  it('reads the older layouts of the pieces it still meets: version-1 addresses and the old test flag', () => {
    const session = readTlSession(
      build({ flags: 0b010, main: addressBytes(1, 2, 0, '10.0.0.1', 80) }),
    )

    expect(session.testMode).toBe(true)
    expect(session.addresses[0]).toMatchObject({ host: '10.0.0.1', port: 80 })
  })

  it('reads the standard alphabet and padding as well as the URL-safe one', () => {
    const urlSafe = build({ flags: 0b001, main: MAIN, user: { id: 7, bot: BOOL_TRUE } })
    const standard = Buffer.from(urlSafe, 'base64url').toString('base64')

    expect(readTlSession(standard)).toEqual(readTlSession(urlSafe))
    expect(readTlSession(standard).self).toEqual({ id: 7n, isBot: true })
  })
})

describe('writing', () => {
  it('writes exactly the bytes the layout says, URL-safe and unpadded', () => {
    const written = writeTlSession({
      dcId: 2,
      testMode: false,
      authKey: key(1),
      addresses: [
        { id: 2, host: '149.154.167.50', port: 443, ipv6: false, mediaOnly: false },
        { id: 2, host: '149.154.167.222', port: 443, ipv6: false, mediaOnly: true },
      ],
      self: { id: 123_456_789n, isBot: false },
    })

    expect(written).toBe(
      build({ flags: 0b101, main: MAIN, media: MEDIA, user: { id: 123_456_789, bot: BOOL_FALSE } }),
    )
    expect(written).not.toMatch(/[+/=]/)
  })

  it('writes one address when there is no separate media one, and the test network on each', () => {
    const session: TlSession = {
      dcId: 2,
      testMode: true,
      authKey: key(2),
      addresses: [{ id: 2, host: '10.0.0.2', port: 443, ipv6: false, mediaOnly: false }],
    }

    expect(writeTlSession(session)).toBe(
      build({ flags: 0, main: addressBytes(2, 2, 0b100, '10.0.0.2', 443), key: [...key(2)] }),
    )
    expect(readTlSession(writeTlSession(session))).toEqual(session)
  })

  it('refuses what it cannot write: no address for the datacenter, a short key', () => {
    const base = { dcId: 2, testMode: false, authKey: key(1), addresses: [] }

    expect(() => writeTlSession(base)).toThrow(/needs the address of datacenter 2/)
    expect(() =>
      writeTlSession({
        ...base,
        authKey: new Uint8Array(255),
        addresses: [{ id: 2, host: 'h', port: 1, ipv6: false, mediaOnly: false }],
      }),
    ).toThrow(/must be 256 bytes/)
  })
})

describe('refusing what is not a session', () => {
  const refused = (text: string) => expect(() => readTlSession(text)).toThrow(SessionError)

  it('refuses another version, flags it does not know, and a key of the wrong size', () => {
    refused(build({ version: 2, flags: 0, main: MAIN }))
    refused(build({ version: 4, flags: 0, main: MAIN }))
    refused(build({ flags: 0b1000, main: MAIN }))
    refused(build({ flags: 0, main: MAIN, key: [...key(1)].slice(0, 255) }))
  })

  it('refuses a string cut short anywhere, and one with bytes after its key', () => {
    const whole = Buffer.from(
      build({ flags: 0b101, main: MAIN, media: MEDIA, user: { id: 5, bot: BOOL_TRUE } }),
      'base64url',
    )

    for (let length = 1; length < whole.length; length += 1) {
      refused(whole.subarray(0, length).toString('base64url'))
    }
    refused(build({ flags: 0, main: MAIN, extra: [0, 0, 0, 0] }))
  })

  it('refuses an address that cannot be reached, a user that cannot be one, a bot flag that is not a boolean', () => {
    refused(build({ flags: 0, main: addressBytes(2, 0, 0, '1.2.3.4', 443) }))
    refused(build({ flags: 0, main: addressBytes(2, 2, 0, '1.2.3.4', 0) }))
    refused(build({ flags: 0, main: addressBytes(3, 2, 0, '1.2.3.4', 443) }))
    refused(build({ flags: 0, main: addressBytes(2, 2, 0b1000, '1.2.3.4', 443) }))
    refused(build({ flags: 0b001, main: MAIN, user: { id: 0, bot: BOOL_TRUE } }))
    refused(build({ flags: 0b001, main: MAIN, user: { id: 5, bot: [1, 2, 3, 4] } }))
    refused(build({ flags: 0b100, main: MAIN, media: addressBytes(2, 2, 0b110, '1.2.3.4', 443) }))
  })

  it('refuses text that is not base64, and an empty string, without quoting either', () => {
    const failure = (() => {
      try {
        readTlSession('not a session!')
      } catch (error) {
        return error as Error
      }
      return undefined
    })()

    expect(failure).toBeInstanceOf(SessionError)
    expect(failure?.message).not.toContain('not a session')
    refused('')
  })
})

describe('naming the layout', () => {
  const tl = build({ flags: 0, main: MAIN })
  const portable = encodeSession({ dcId: 2, testMode: false, authKey: key(1) })

  it('reads each layout when named, and says which layout a string looks like when it is not', () => {
    expect(readSession(tl, { format: 'tl-v3' }).dcId).toBe(2)
    expect(readSession(portable).dcId).toBe(2)

    expect(() => readSession(tl)).toThrow(
      /looks like a version-3 TL session; read it with format 'tl-v3'/,
    )
    expect(() => readSession(portable, { format: 'tl-v3' })).toThrow(/format 'portable'/)
  })

  it('converts from one layout to the other and back, keeping the key and the datacenter', () => {
    const imported = readSession(tl, { format: 'tl-v3' })
    const back = readSession(writeSession(imported, { format: 'portable' }))

    expect(back).toMatchObject({ dcId: 2, testMode: false })
    expect(back.authKey).toEqual(imported.authKey)
  })
})

describe('on an account', () => {
  const bootstrap = (options: DcConfiguration['options'] = []): DcConfiguration => ({
    thisDc: 2,
    testMode: false,
    options,
  })
  const inArea = (name: string) => `${areaFor('account')}${name}`

  it('imports the key, the address and the user, and exports the same string', async () => {
    const storage = memory()
    const string = build({ flags: 0b001, main: MAIN, user: { id: 42, bot: BOOL_TRUE } })
    const account = Account.fromString(string, {
      apiId: 1,
      apiHash: 'x',
      keys: [],
      bootstrap: bootstrap(),
      storage,
      format: 'tl-v3',
    })

    await account.connect().catch(() => undefined)

    expect(await storage.get(inArea('auth:dc2:key'))).toBe(Buffer.from(key(1)).toString('base64'))
    expect(await storage.get(inArea('self'))).toBe('42')
    expect(await account.exportSession({ format: 'tl-v3' })).toBe(string)
    expect(readSession(await account.exportSession()).authKey).toEqual(key(1))
    await account.stop()
  })

  it('leaves the user out of an export when whether it is a bot is not known', async () => {
    const storage = memory()
    const account = Account.fromString(build({ flags: 0, main: MAIN }), {
      apiId: 1,
      apiHash: 'x',
      keys: [],
      bootstrap: bootstrap(),
      storage,
      format: 'tl-v3',
    })
    await account.connect().catch(() => undefined)
    await storage.set(inArea('self'), '42')

    expect(
      readSession(await account.exportSession({ format: 'tl-v3' }), { format: 'tl-v3' }).self,
    ).toBeUndefined()
    await account.stop()
  })
})
