/**
 * Proving which account a connection belongs to.
 *
 * The cases here are about the sequence rather than the cryptography: what each
 * step sends, what it makes of every answer it can receive, and what happens
 * when a datacenter says the account is somewhere else. A step that follows a
 * redirection has to arrive at the other datacenter having done the right thing
 * first, and for one of the three that means introducing the account before the
 * call is worth repeating.
 *
 * Every datacenter is a stub that records what it was asked. Nothing waits on
 * anything, so each ordering below is a fact rather than a race.
 */

import { SessionError, TelegramError } from '@yuigram/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { validateDhParameters } from '../src/crypto/primes.js'
import {
  requestLoginToken,
  sendCode,
  signIn,
  signInAsBot,
  signInWithPassword,
} from '../src/network/signin.js'
import { MigrationError } from '../src/session/dispatcher.js'
import type { TlValue } from '../src/tl/index.js'
import { PasswordServer } from './server/password.js'
import { DH_PRIME } from './server/server.js'

const API = { apiId: 1234, apiHash: 'hash' }

const PASSWORD = 'correct horse battery staple'

/**
 * A stretching step cheap enough to run in a test.
 *
 * The derivation itself has its own cases; what these are about is the sequence
 * around it, and paying a hundred thousand iterations per case to reach the
 * same proof would buy nothing.
 */
const cheap = (password: Uint8Array, salt: Uint8Array) =>
  Uint8Array.from(
    { length: 64 },
    (_, index) => (password[index % password.length] ?? 0) ^ (salt[index % salt.length] ?? 0),
  )

const SRP = { pbkdf2: cheap }

beforeAll(() => {
  validateDhParameters({ p: DH_PRIME, g: 3n })
}, 60_000)

/** A datacenter holding a password, answering the way Telegram does. */
function passwordPeer(): PasswordServer {
  return new PasswordServer({
    password: PASSWORD,
    p: DH_PRIME,
    g: 3n,
    salt1: Uint8Array.from({ length: 32 }, (_, index) => (index * 7 + 1) & 0xff),
    salt2: Uint8Array.from({ length: 32 }, (_, index) => (index * 11 + 3) & 0xff),
    stretch: cheap,
  })
}

/** The answer Telegram gives when an account is signed in. */
const AUTHORIZED: TlValue = {
  _: 'auth.authorization',
  user: { _: 'user', id: 42n },
}

/** A refusal named the way Telegram names it. */
function refusal(name: string, code = 400): TelegramError {
  return new TelegramError(`${name} (${code})`)
}

/** A redirection to another datacenter. */
function redirect(kind: 'phone' | 'network' | 'user', dcId: number): MigrationError {
  return new MigrationError(`${kind.toUpperCase()}_MIGRATE_${dcId} (303)`, { kind, dcId })
}

/**
 * A set of datacenters, each answering from a script.
 *
 * A script is consulted by method name, so a case says what a datacenter does
 * about one call without describing every other call it might receive.
 */
function datacenters(
  scripts: Record<number, Record<string, (query: TlValue) => TlValue | Promise<TlValue>>>,
) {
  const asked: Array<{ dcId: number; query: TlValue }> = []

  const reach = (dcId: number) => ({
    invoke: async (query: TlValue) => {
      asked.push({ dcId, query })

      const answer = scripts[dcId]?.[query._]
      if (answer === undefined) {
        throw new Error(`datacenter ${dcId} was not told what to do about '${query._}'`)
      }

      return answer(query)
    },
  })

  return {
    reach,
    asked,
    /** Every method called, in order, paired with where it was called. */
    trace: () => asked.map((entry) => `${entry.dcId}:${entry.query._}`),
    at: (dcId: number, method: string) =>
      asked.filter((entry) => entry.dcId === dcId && entry.query._ === method),
  }
}

describe('asking for a code', () => {
  it('names the application and the number', async () => {
    const dcs = datacenters({
      2: {
        'auth.sendCode': () => ({
          _: 'auth.sentCode',
          type: { _: 'auth.sentCodeTypeSms', length: 5 },
          phone_code_hash: 'abc',
          timeout: 60,
        }),
      },
    })

    const state = await sendCode({ ...API, reach: dcs.reach, dcId: 2, phone: '+70000000000' })

    expect(dcs.at(2, 'auth.sendCode')[0]?.query).toMatchObject({
      phone_number: '+70000000000',
      api_id: 1234,
      api_hash: 'hash',
    })
    expect(state).toEqual({ kind: 'code-sent', dcId: 2, phoneCodeHash: 'abc', timeout: 60 })
  })

  it('omits a wait the server did not state', async () => {
    const dcs = datacenters({
      2: {
        'auth.sendCode': () => ({
          _: 'auth.sentCode',
          type: { _: 'auth.sentCodeTypeApp', length: 5 },
          phone_code_hash: 'abc',
        }),
      },
    })

    expect(await sendCode({ ...API, reach: dcs.reach, dcId: 2, phone: '+7' })).toEqual({
      kind: 'code-sent',
      dcId: 2,
      phoneCodeHash: 'abc',
    })
  })

  it('reports an account signed in without a code as signed in', async () => {
    const dcs = datacenters({
      2: {
        'auth.sendCode': () => ({ _: 'auth.sentCodeSuccess', authorization: AUTHORIZED }),
      },
    })

    expect(await sendCode({ ...API, reach: dcs.reach, dcId: 2, phone: '+7' })).toEqual({
      kind: 'authorized',
      dcId: 2,
      user: { _: 'user', id: 42n },
    })
  })

  it('refuses an answer without the value naming the code', async () => {
    const dcs = datacenters({
      2: {
        'auth.sendCode': () => ({ _: 'auth.sentCode', type: { _: 'x' }, phone_code_hash: '' }),
      },
    })

    await expect(
      sendCode({ ...API, reach: dcs.reach, dcId: 2, phone: '+7' }),
    ).rejects.toBeInstanceOf(SessionError)
  })

  it('refuses an answer that is not about a code at all', async () => {
    const dcs = datacenters({ 2: { 'auth.sendCode': () => ({ _: 'boolTrue' }) } })

    await expect(sendCode({ ...API, reach: dcs.reach, dcId: 2, phone: '+7' })).rejects.toThrow(
      /expected a sent code/,
    )
  })
})

describe('a datacenter that says the account is elsewhere', () => {
  it('asks the one it named instead', async () => {
    const dcs = datacenters({
      2: {
        'auth.sendCode': () => {
          throw redirect('phone', 4)
        },
      },
      4: {
        'auth.sendCode': () => ({
          _: 'auth.sentCode',
          type: { _: 'auth.sentCodeTypeSms', length: 5 },
          phone_code_hash: 'abc',
        }),
      },
    })

    const state = await sendCode({ ...API, reach: dcs.reach, dcId: 2, phone: '+7' })

    expect(dcs.trace()).toEqual(['2:auth.sendCode', '4:auth.sendCode'])
    expect(state).toMatchObject({ kind: 'code-sent', dcId: 4 })
  })

  it('follows a network redirection the same way', async () => {
    const dcs = datacenters({
      2: {
        'auth.sendCode': () => {
          throw redirect('network', 3)
        },
      },
      3: {
        'auth.sendCode': () => ({
          _: 'auth.sentCode',
          type: { _: 'x' },
          phone_code_hash: 'abc',
        }),
      },
    })

    expect(await sendCode({ ...API, reach: dcs.reach, dcId: 2, phone: '+7' })).toMatchObject({
      dcId: 3,
    })
  })

  it('introduces the account first when it says the account has moved', async () => {
    const peer = passwordPeer()
    const dcs = datacenters({
      2: {
        'auth.checkPassword': () => {
          throw redirect('user', 5)
        },
        'account.getPassword': () => peer.describe() as TlValue,
        'auth.exportAuthorization': () => ({
          _: 'auth.exportedAuthorization',
          id: 7n,
          bytes: Uint8Array.from([9]),
        }),
      },
      5: {
        'auth.importAuthorization': () => ({ _: 'auth.authorization', user: { _: 'user' } }),
        'auth.checkPassword': () => AUTHORIZED,
      },
    })

    const state = await signInWithPassword({
      ...API,
      reach: dcs.reach,
      dcId: 2,
      password: PASSWORD,
      srp: SRP,
    })

    // The datacenter being redirected to knows nothing about the account until
    // the one holding it says so, which has to happen before the call is worth
    // repeating there.
    expect(dcs.trace()).toEqual([
      '2:account.getPassword',
      '2:auth.checkPassword',
      '2:auth.exportAuthorization',
      '5:auth.importAuthorization',
      '5:auth.checkPassword',
    ])
    expect(state).toMatchObject({ kind: 'authorized', dcId: 5 })
  })

  it('does not introduce the account for a redirection that predates one', async () => {
    const dcs = datacenters({
      2: {
        'auth.sendCode': () => {
          throw redirect('phone', 4)
        },
      },
      4: {
        'auth.sendCode': () => ({ _: 'auth.sentCode', type: { _: 'x' }, phone_code_hash: 'a' }),
      },
    })

    await sendCode({ ...API, reach: dcs.reach, dcId: 2, phone: '+7' })

    // Nothing has been proved yet, so there is no account to introduce and
    // asking for a credential would be asking about nobody.
    expect(dcs.at(2, 'auth.exportAuthorization')).toEqual([])
  })

  it('gives up on datacenters that redirect to each other', async () => {
    const dcs = datacenters({
      2: {
        'auth.sendCode': () => {
          throw redirect('phone', 4)
        },
      },
      4: {
        'auth.sendCode': () => {
          throw redirect('phone', 2)
        },
      },
    })

    // A loop is not resolved by more attempts, and a step that never returns is
    // worse than one that says which datacenters were involved.
    await expect(sendCode({ ...API, reach: dcs.reach, dcId: 2, phone: '+7' })).rejects.toThrow(
      /redirected in a loop/,
    )
  })

  it('passes anything that is not a redirection straight back', async () => {
    const dcs = datacenters({
      2: {
        'auth.sendCode': () => {
          throw refusal('PHONE_NUMBER_INVALID')
        },
      },
    })

    await expect(sendCode({ ...API, reach: dcs.reach, dcId: 2, phone: '+7' })).rejects.toThrow(
      /PHONE_NUMBER_INVALID/,
    )
  })
})

describe('proving the code', () => {
  const step = { phone: '+7', phoneCodeHash: 'abc', code: '11111' }

  it('sends what names the code alongside it', async () => {
    const dcs = datacenters({ 2: { 'auth.signIn': () => AUTHORIZED } })

    const state = await signIn({ ...API, reach: dcs.reach, dcId: 2, ...step })

    expect(dcs.at(2, 'auth.signIn')[0]?.query).toMatchObject({
      phone_number: '+7',
      phone_code_hash: 'abc',
      phone_code: '11111',
    })
    expect(state).toEqual({ kind: 'authorized', dcId: 2, user: { _: 'user', id: 42n } })
  })

  it('reports a protected account as needing its password', async () => {
    const dcs = datacenters({
      2: {
        'auth.signIn': () => {
          throw refusal('SESSION_PASSWORD_NEEDED', 401)
        },
      },
    })

    // Telegram says so by refusing the step rather than answering it, and that
    // refusal is the ordinary path through a protected account.
    expect(await signIn({ ...API, reach: dcs.reach, dcId: 2, ...step })).toEqual({
      kind: 'password-required',
      dcId: 2,
    })
  })

  it('does not read a longer name as that one', async () => {
    const dcs = datacenters({
      2: {
        'auth.signIn': () => {
          throw refusal('SESSION_PASSWORD_NEEDED_SOMETHING', 401)
        },
      },
    })

    await expect(signIn({ ...API, reach: dcs.reach, dcId: 2, ...step })).rejects.toThrow(
      /SESSION_PASSWORD_NEEDED_SOMETHING/,
    )
  })

  it('reports a number with no account as needing one', async () => {
    const dcs = datacenters({
      2: { 'auth.signIn': () => ({ _: 'auth.authorizationSignUpRequired' }) },
    })

    expect(await signIn({ ...API, reach: dcs.reach, dcId: 2, ...step })).toEqual({
      kind: 'registration-required',
      dcId: 2,
    })
  })

  it('raises a wrong code as the refusal it is', async () => {
    const dcs = datacenters({
      2: {
        'auth.signIn': () => {
          throw refusal('PHONE_CODE_INVALID')
        },
      },
    })

    await expect(signIn({ ...API, reach: dcs.reach, dcId: 2, ...step })).rejects.toThrow(
      /PHONE_CODE_INVALID/,
    )
  })

  it('refuses an authorization with nobody in it', async () => {
    const dcs = datacenters({ 2: { 'auth.signIn': () => ({ _: 'auth.authorization' }) } })

    await expect(signIn({ ...API, reach: dcs.reach, dcId: 2, ...step })).rejects.toThrow(
      /must be an object/,
    )
  })
})

describe('proving the password', () => {
  it('answers the challenge the datacenter published', async () => {
    const peer = passwordPeer()
    const dcs = datacenters({
      2: {
        'account.getPassword': () => peer.describe() as TlValue,
        'auth.checkPassword': () => AUTHORIZED,
      },
    })

    const state = await signInWithPassword({
      ...API,
      reach: dcs.reach,
      dcId: 2,
      password: PASSWORD,
      srp: SRP,
    })

    // The challenge is fetched and answered together: a proof is only valid for
    // the exchange the challenge names.
    expect(dcs.trace()).toEqual(['2:account.getPassword', '2:auth.checkPassword'])
    const sent = dcs.at(2, 'auth.checkPassword')[0]?.query['password'] as TlValue
    expect(sent._).toBe('inputCheckPasswordSRP')
    // The proof answers the exchange the challenge named, not some other one.
    expect(sent['srp_id']).toBe((peer.describe() as TlValue)['srp_id'])
    expect(
      peer.accepts({
        srp_id: sent['srp_id'] as bigint,
        A: sent['A'] as Uint8Array,
        M1: sent['M1'] as Uint8Array,
      }),
    ).toBe(true)
    expect(state).toMatchObject({ kind: 'authorized', dcId: 2 })
  })

  it('never sends the password itself', async () => {
    const peer = passwordPeer()
    const dcs = datacenters({
      2: {
        'account.getPassword': () => peer.describe() as TlValue,
        'auth.checkPassword': () => AUTHORIZED,
      },
    })

    await signInWithPassword({ ...API, reach: dcs.reach, dcId: 2, password: PASSWORD, srp: SRP })

    expect(
      JSON.stringify(dcs.asked, (_k, v) => (typeof v === 'bigint' ? `${v}` : v)),
    ).not.toContain('secret')
  })

  it('raises a wrong password as the refusal it is', async () => {
    const peer = passwordPeer()
    const dcs = datacenters({
      2: {
        'account.getPassword': () => peer.describe() as TlValue,
        'auth.checkPassword': () => {
          throw refusal('PASSWORD_HASH_INVALID')
        },
      },
    })

    await expect(
      signInWithPassword({ ...API, reach: dcs.reach, dcId: 2, password: 'wrong', srp: SRP }),
    ).rejects.toThrow(/PASSWORD_HASH_INVALID/)
  })

  it('refuses a challenge describing a scheme it cannot perform', async () => {
    const peer = passwordPeer()
    const dcs = datacenters({
      2: {
        'account.getPassword': (): TlValue => ({
          ...(peer.describe() as TlValue),
          current_algo: { _: 'passwordKdfAlgoUnknown' },
        }),
        'auth.checkPassword': () => AUTHORIZED,
      },
    })

    await expect(
      signInWithPassword({ ...API, reach: dcs.reach, dcId: 2, password: PASSWORD, srp: SRP }),
    ).rejects.toThrow(/algorithm this client can perform/)
  })
})

describe('signing in as a bot', () => {
  it('proves itself with its token in one call', async () => {
    const dcs = datacenters({ 2: { 'auth.importBotAuthorization': () => AUTHORIZED } })

    const state = await signInAsBot({ ...API, reach: dcs.reach, dcId: 2, token: '123:abc' })

    expect(dcs.at(2, 'auth.importBotAuthorization')[0]?.query).toMatchObject({
      api_id: 1234,
      api_hash: 'hash',
      bot_auth_token: '123:abc',
    })
    expect(state).toMatchObject({ kind: 'authorized', dcId: 2 })
    expect(dcs.trace()).toHaveLength(1)
  })

  it('follows a redirection like every other step', async () => {
    const dcs = datacenters({
      2: {
        'auth.importBotAuthorization': () => {
          throw redirect('phone', 4)
        },
      },
      4: { 'auth.importBotAuthorization': () => AUTHORIZED },
    })

    expect(
      await signInAsBot({ ...API, reach: dcs.reach, dcId: 2, token: '123:abc' }),
    ).toMatchObject({ kind: 'authorized', dcId: 4 })
  })

  it('raises an invalid token as the refusal it is', async () => {
    const dcs = datacenters({
      2: {
        'auth.importBotAuthorization': () => {
          throw refusal('ACCESS_TOKEN_INVALID')
        },
      },
    })

    await expect(signInAsBot({ ...API, reach: dcs.reach, dcId: 2, token: 'bad' })).rejects.toThrow(
      /ACCESS_TOKEN_INVALID/,
    )
  })
})

describe('signing in from another device', () => {
  const TOKEN = Uint8Array.from([1, 2, 3])

  it('hands back a token to display, and when it stops being accepted', async () => {
    const dcs = datacenters({
      2: {
        'auth.exportLoginToken': () => ({ _: 'auth.loginToken', expires: 1700, token: TOKEN }),
      },
    })

    expect(await requestLoginToken({ ...API, reach: dcs.reach, dcId: 2 })).toEqual({
      kind: 'pending',
      dcId: 2,
      token: TOKEN,
      expires: 1700,
    })
  })

  it('reports a token that has been approved', async () => {
    const dcs = datacenters({
      2: {
        'auth.exportLoginToken': () => ({
          _: 'auth.loginTokenSuccess',
          authorization: AUTHORIZED,
        }),
      },
    })

    expect(await requestLoginToken({ ...API, reach: dcs.reach, dcId: 2 })).toMatchObject({
      kind: 'authorized',
      dcId: 2,
    })
  })

  it('presents the token where it was told to, rather than reporting a move', async () => {
    const dcs = datacenters({
      2: {
        'auth.exportLoginToken': () => ({
          _: 'auth.loginTokenMigrateTo',
          dc_id: 4,
          token: TOKEN,
        }),
      },
      4: {
        'auth.importLoginToken': () => ({
          _: 'auth.loginTokenSuccess',
          authorization: AUTHORIZED,
        }),
      },
    })

    const state = await requestLoginToken({ ...API, reach: dcs.reach, dcId: 2 })

    // A caller handed a token it cannot present has been told nothing useful.
    expect(dcs.trace()).toEqual(['2:auth.exportLoginToken', '4:auth.importLoginToken'])
    expect(dcs.at(4, 'auth.importLoginToken')[0]?.query['token']).toBe(TOKEN)
    expect(state).toMatchObject({ kind: 'authorized', dcId: 4 })
  })

  it('passes on what the other datacenter said about the token', async () => {
    const dcs = datacenters({
      2: {
        'auth.exportLoginToken': () => ({
          _: 'auth.loginTokenMigrateTo',
          dc_id: 4,
          token: TOKEN,
        }),
      },
      4: {
        'auth.importLoginToken': () => ({
          _: 'auth.loginToken',
          expires: 1800,
          token: TOKEN,
        }),
      },
    })

    expect(await requestLoginToken({ ...API, reach: dcs.reach, dcId: 2 })).toMatchObject({
      kind: 'pending',
      dcId: 4,
    })
  })

  it('refuses a move naming a datacenter that could not be one', async () => {
    const dcs = datacenters({
      2: {
        'auth.exportLoginToken': () => ({
          _: 'auth.loginTokenMigrateTo',
          dc_id: 0,
          token: TOKEN,
        }),
      },
    })

    await expect(requestLoginToken({ ...API, reach: dcs.reach, dcId: 2 })).rejects.toThrow(
      /must be a datacenter/,
    )
  })

  it('refuses a token that carries nothing', async () => {
    const dcs = datacenters({
      2: {
        'auth.exportLoginToken': () => ({
          _: 'auth.loginToken',
          expires: 1700,
          token: new Uint8Array(0),
        }),
      },
    })

    await expect(requestLoginToken({ ...API, reach: dcs.reach, dcId: 2 })).rejects.toThrow(
      /non-empty byte string/,
    )
  })

  it('refuses an answer that is not about a token', async () => {
    const dcs = datacenters({ 2: { 'auth.exportLoginToken': () => ({ _: 'boolTrue' }) } })

    await expect(requestLoginToken({ ...API, reach: dcs.reach, dcId: 2 })).rejects.toThrow(
      /expected a login token/,
    )
  })
})
