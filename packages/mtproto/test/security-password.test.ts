/**
 * Managing the second factor.
 *
 * The derivation is the part worth testing properly, because getting it wrong
 * produces a password that is accepted now and cannot be used to sign in later
 * — a failure that shows up once, on somebody's account, with nothing left to
 * inspect. So the verifier is checked against the definition rather than
 * against a recorded value: `v = g^x mod p`, with `x` derived from the salts the
 * server published plus the padding Telegram requires on the first of them.
 *
 * Nothing here uses a real password or a real account.
 */

import { ValidationError } from '@yuigram/core'
import { beforeAll, describe, expect, it } from 'vitest'
import type { MtprotoApi } from '../src/api.js'
import { modPow } from '../src/crypto/bigint.js'
import { bigIntToBytesBE, bytesToBigIntBE, concatBytes } from '../src/crypto/bytes.js'
import { validateDhParameters } from '../src/crypto/primes.js'
import { passwordHash, type SrpOptions } from '../src/crypto/srp.js'
import type { account as accountTypes } from '../src/generated/api/types/index.js'
import {
  cancelRecoveryEmail,
  checkRecoveryCode,
  confirmRecoveryEmail,
  passwordStatus,
  removePassword,
  requestPasswordRecovery,
  resendRecoveryEmail,
  type Securing,
  setPassword,
} from '../src/security/password.js'
import { DH_PRIME } from './server/server.js'

/**
 * A real group, because the code refuses a weak one.
 *
 * That refusal is the point rather than an obstacle: these parameters arrive
 * from the server, and a verifier derived under a group nobody checked is worth
 * far less than it looks.
 */
const P = bigIntToBytesBE(DH_PRIME, 256)

const ALGO = {
  _: 'passwordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow',
  salt1: new Uint8Array([1, 2, 3, 4]),
  salt2: new Uint8Array([5, 6, 7, 8]),
  g: 3,
  p: P,
} as const

/**
 * A server public value well inside the group.
 *
 * The proof path refuses one near either endpoint, which is correct and which a
 * placeholder of a few bytes trips over.
 */
const SRP_B = bigIntToBytesBE(DH_PRIME / 2n, 256)

/**
 * A cheap stand-in for the real stretching, and a password that derives a short
 * verifier under it.
 *
 * The real derivation is a hundred thousand iterations, which is the point of
 * it and far too slow to search against. Both constants were found once and
 * written down; the case they reach — a verifier with a leading zero — is the
 * one that separates a fixed width from a natural one.
 */
const STRETCH = (password: Uint8Array, salt: Uint8Array): Uint8Array => {
  const out = new Uint8Array(64)

  for (let at = 0; at < out.length; at += 1) {
    out[at] =
      ((password[at % password.length] ?? 0) * 31 + (salt[at % salt.length] ?? 0) + at) & 0xff
  }

  return out
}

const SHORT_VERIFIER_PASSWORD = 'p87'

/** The padding the fake draws, so a test can derive the same verifier. */
const PADDING = Uint8Array.from({ length: 32 }, (_value, at) => (at * 7) % 251)

/**
 * Validating a safe prime is expensive once and cached after, so it is paid
 * here rather than inside whichever case happened to run first.
 */
beforeAll(() => {
  validateDhParameters({ p: DH_PRIME, g: 3n })
}, 60_000)

interface Call {
  readonly method: string
  readonly params: Record<string, unknown> | undefined
}

function published(options?: Partial<accountTypes.Password>): accountTypes.Password {
  return {
    _: 'account.password',
    new_algo: ALGO,
    new_secure_algo: { _: 'securePasswordKdfAlgoUnknown' },
    secure_random: new Uint8Array(0),
    ...options,
  }
}

/** A client answering `account.getPassword` from a script, recording the rest. */
function fake(options?: {
  readonly password?: accountTypes.Password
  readonly answers?: Readonly<Record<string, unknown>>
  readonly srp?: SrpOptions
}): Securing & { readonly calls: Call[] } {
  const calls: Call[] = []

  const record =
    (method: string) =>
    (params?: Record<string, unknown>): Promise<unknown> => {
      calls.push({ method, params })

      return Promise.resolve(options?.answers?.[method] ?? true)
    }

  const api = {
    account: {
      getPassword: () => {
        calls.push({ method: 'account.getPassword', params: undefined })

        return Promise.resolve(options?.password ?? published())
      },
      updatePasswordSettings: record('account.updatePasswordSettings'),
      confirmPasswordEmail: record('account.confirmPasswordEmail'),
      resendPasswordEmail: record('account.resendPasswordEmail'),
      cancelPasswordEmail: record('account.cancelPasswordEmail'),
    },
    auth: {
      requestPasswordRecovery: record('auth.requestPasswordRecovery'),
      checkRecoveryPassword: record('auth.checkRecoveryPassword'),
    },
  } as unknown as MtprotoApi

  return {
    api,
    calls,
    // Honours the length asked for: a padding of the wrong size is invisible to
    // a fake that always hands back the same number of bytes.
    random: (length: number) => PADDING.slice(0, length),
    ...(options?.srp === undefined ? {} : { srp: options.srp }),
  }
}

/** The settings the one update call carried. */
function settingsOf(client: { readonly calls: Call[] }) {
  const call = client.calls.find((one) => one.method === 'account.updatePasswordSettings')

  return call?.params as
    | { password: { _: string }; new_settings: Record<string, unknown> }
    | undefined
}

describe('reading the state of the second factor', () => {
  it('says what is set without saying anything secret', async () => {
    const client = fake({
      password: published({
        has_password: true,
        has_recovery: true,
        hint: 'the usual',
        email_unconfirmed_pattern: 'a**@e**.com',
        login_email_pattern: 'b**@e**.com',
        pending_reset_date: 1_700_000_000,
      }),
    })

    const status = await passwordStatus(client)

    expect(status.hasPassword).toBe(true)
    expect(status.hasRecovery).toBe(true)
    expect(status.hint).toBe('the usual')
    expect(status.unconfirmedEmail).toBe('a**@e**.com')
    expect(status.loginEmail).toBe('b**@e**.com')
    expect(status.pendingResetDate).toBe(1_700_000_000)
  })

  it('reports an account with no password as having none', async () => {
    const status = await passwordStatus(fake())

    expect(status.hasPassword).toBe(false)
    expect(status.hasRecovery).toBe(false)
    expect(status.hint).toBeUndefined()
  })
})

describe('setting a password for the first time', () => {
  it('proves nothing, because there is nothing to prove', async () => {
    const client = fake()

    await setPassword(client, { password: 'secret', hint: 'a hint' })

    expect(settingsOf(client)?.password).toEqual({ _: 'inputCheckPasswordEmpty' })
  })

  it('derives the verifier the definition gives, not one of its own', async () => {
    // `v = g^x mod p`, with `x` from the published salts plus the padding
    // Telegram requires on the first one. Repeated here rather than recorded,
    // so the test fails if the derivation changes rather than if it moves.
    const client = fake()

    await setPassword(client, { password: 'secret' })

    const settings = settingsOf(client)?.new_settings as {
      new_algo: { salt1: Uint8Array }
      new_password_hash: Uint8Array
    }

    const salt1 = concatBytes(ALGO.salt1, PADDING)
    const x = bytesToBigIntBE(passwordHash(new TextEncoder().encode('secret'), salt1, ALGO.salt2))
    const expected = modPow(BigInt(ALGO.g), x, bytesToBigIntBE(P))

    // The bytes rather than the number they stand for. A verifier sent at its
    // natural width is the same value and a different byte string whenever it
    // has a leading zero, and only one of the two is what Telegram accepts.
    expect(settings.new_password_hash).toEqual(bigIntToBytesBE(expected, 256))
  })

  it('sends the padded salt, because the server derives against it too', async () => {
    // The padding is part of the salt from here on. Sending the unpadded one
    // would make every later sign-in derive a different value.
    const client = fake()

    await setPassword(client, { password: 'secret' })

    const settings = settingsOf(client)?.new_settings as { new_algo: { salt1: Uint8Array } }

    expect(settings.new_algo.salt1).toEqual(concatBytes(ALGO.salt1, PADDING))
    expect(settings.new_algo.salt1.length).toBe(ALGO.salt1.length + 32)
  })

  it('sends the verifier at the width the protocol states', async () => {
    const client = fake()

    await setPassword(client, { password: 'secret' })

    const settings = settingsOf(client)?.new_settings as { new_password_hash: Uint8Array }

    expect(settings.new_password_hash.length).toBe(256)
  })

  it('pads a verifier that is naturally shorter, rather than sending it short', async () => {
    // Roughly one password in 256 derives a verifier with a leading zero, which
    // is 255 bytes in its natural form and refused. This is one of them, found
    // once against the stretching below and written down so the case is met
    // every run rather than one time in 256.
    const client = fake({ srp: { pbkdf2: STRETCH } })

    await setPassword(client, { password: SHORT_VERIFIER_PASSWORD })

    const settings = settingsOf(client)?.new_settings as { new_password_hash: Uint8Array }

    expect(settings.new_password_hash.length).toBe(256)
    expect(settings.new_password_hash[0]).toBe(0)
  })

  it('sends an empty hint rather than inventing one', async () => {
    // The hint is shown before the password is asked for, so a hint nobody
    // wrote is a string of somebody else's choosing on their login screen.
    const client = fake()

    await setPassword(client, { password: 'secret' })

    expect(settingsOf(client)?.new_settings).toMatchObject({ hint: '' })
  })

  it('carries the hint and the recovery address it was given', async () => {
    const client = fake()

    await setPassword(client, { password: 'secret', hint: 'a hint', email: 'a@example.com' })

    expect(settingsOf(client)?.new_settings).toMatchObject({
      hint: 'a hint',
      email: 'a@example.com',
    })
  })

  it('leaves the address off entirely when none was given', async () => {
    const client = fake()

    await setPassword(client, { password: 'secret' })

    expect(settingsOf(client)?.new_settings).not.toHaveProperty('email')
  })

  it('refuses an algorithm it cannot perform rather than sending something wrong', async () => {
    const client = fake({ password: published({ new_algo: { _: 'passwordKdfAlgoUnknown' } }) })

    await expect(setPassword(client, { password: 'secret' })).rejects.toThrow(ValidationError)
  })

  it('refuses a weak group, rather than deriving under whatever the server sent', async () => {
    // The proof path already refuses one. Deriving a new password has to as
    // well, or the weaker of the two is the path an attacker steers towards.
    const weak = { ...ALGO, p: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 251]) }
    const client = fake({ password: published({ new_algo: weak }) })

    await expect(setPassword(client, { password: 'secret' })).rejects.toThrow(ValidationError)
    expect(settingsOf(client)).toBeUndefined()
  })
})

describe('changing a password that is already set', () => {
  const withPassword = () =>
    published({ has_password: true, current_algo: ALGO, srp_B: SRP_B, srp_id: 4242n })

  it('proves the current one', async () => {
    const client = fake({ password: withPassword() })

    await setPassword(client, { password: 'next' }, 'current')

    const proof = settingsOf(client)?.password as { _: string; srp_id: bigint }

    expect(proof._).toBe('inputCheckPasswordSRP')
    expect(proof.srp_id).toBe(4242n)
  })

  it('refuses a published password whose challenge is incomplete', async () => {
    // The three fields share a flag and should arrive together. Trusting the
    // flag rather than checking each would answer with a proof built from
    // whatever happened to be there.
    const client = fake({
      password: published({ has_password: true, current_algo: ALGO, srp_id: 1n }),
    })

    await expect(setPassword(client, { password: 'next' }, 'current')).rejects.toThrow(
      ValidationError,
    )
  })

  it('refuses to proceed when the current one was not given', async () => {
    // An empty proof against a set password fails as though the password were
    // wrong, which is a confusing way to learn an argument was left out.
    const client = fake({ password: withPassword() })

    await expect(setPassword(client, { password: 'next' })).rejects.toThrow(ValidationError)
    expect(settingsOf(client)).toBeUndefined()
  })

  it('never puts the password anywhere it could be read back', async () => {
    const client = fake({ password: withPassword() })

    await setPassword(client, { password: 'next-secret' }, 'current-secret')

    const written = JSON.stringify(client.calls, (_key, value) => {
      if (value instanceof Uint8Array) return [...value]

      return typeof value === 'bigint' ? String(value) : value
    })

    expect(written).not.toContain('next-secret')
    expect(written).not.toContain('current-secret')
  })
})

describe('taking the password off', () => {
  it('proves the current one and sends an empty verifier', async () => {
    // The absence of a verifier is how Telegram is told there is no longer a
    // password, which is why this is the same call rather than another one.
    const client = fake({
      password: published({
        has_password: true,
        current_algo: ALGO,
        srp_B: SRP_B,
        srp_id: 1n,
      }),
    })

    await removePassword(client, 'current')

    const settings = settingsOf(client)

    expect(settings).toBeDefined()
    if (settings === undefined) return

    expect((settings.password as { _: string })._).toBe('inputCheckPasswordSRP')
    expect(settings.new_settings).toMatchObject({
      new_algo: { _: 'passwordKdfAlgoUnknown' },
      hint: '',
    })
    expect((settings.new_settings['new_password_hash'] as Uint8Array).length).toBe(0)
  })
})

describe('the recovery address, and recovering through it', () => {
  it('confirms, resends and cancels', async () => {
    const confirm = fake()
    const resend = fake()
    const cancel = fake()

    await confirmRecoveryEmail(confirm, '12345')
    await resendRecoveryEmail(resend)
    await cancelRecoveryEmail(cancel)

    expect(confirm.calls[0]).toEqual({
      method: 'account.confirmPasswordEmail',
      params: { code: '12345' },
    })
    expect(resend.calls[0]?.method).toBe('account.resendPasswordEmail')
    expect(cancel.calls[0]?.method).toBe('account.cancelPasswordEmail')
  })

  it('asks for a recovery code and says where it went', async () => {
    const client = fake({
      answers: {
        'auth.requestPasswordRecovery': {
          _: 'auth.passwordRecovery',
          email_pattern: 'a**@e**.com',
        },
      },
    })

    expect(await requestPasswordRecovery(client)).toBe('a**@e**.com')
  })

  it('checks a recovery code without spending it', async () => {
    const good = fake({ answers: { 'auth.checkRecoveryPassword': true } })
    const bad = fake({ answers: { 'auth.checkRecoveryPassword': false } })

    expect(await checkRecoveryCode(good, '111')).toBe(true)
    expect(await checkRecoveryCode(bad, '222')).toBe(false)
    expect(good.calls[0]).toEqual({
      method: 'auth.checkRecoveryPassword',
      params: { code: '111' },
    })
  })
})
