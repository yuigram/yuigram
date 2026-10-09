// SPDX-License-Identifier: MIT

/**
 * Signing a test account in and out, against stand-ins.
 *
 * Nothing here reaches Telegram. What is held is the part a live run cannot
 * be trusted to show safely: that neither command runs without being asked
 * for by name, that the code and password come from the terminal and the
 * password is asked for hidden, that no secret is ever said, and that the
 * account is let go of however signing in ends.
 */

import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { EnvironmentError } from '../src/environment.js'
import {
  checkLogoutAllowed,
  type LoginAccount,
  type LoginIo,
  readLoginEnvironment,
  type SignInStep,
  signIn,
  signOut,
} from '../src/login.js'

/** A key of the shape Telegram publishes, generated rather than committed. */
const PEM = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .publicKey.export({ type: 'pkcs1', format: 'pem' })
  .toString()

const ENV = {
  YUIGRAM_LIVE_ALLOW_LOGIN: '1',
  YUIGRAM_LIVE_API_ID: '12345',
  YUIGRAM_LIVE_API_HASH: 'a-secret-api-hash',
  YUIGRAM_LIVE_SERVER_KEYS: '/keys.pem',
  YUIGRAM_LIVE_DC: '2@149.154.167.40:443',
  YUIGRAM_LIVE_PHONE: '+999662000',
  YUIGRAM_LIVE_SESSION_OUT: '/out/session.txt',
}

const read = (env: Record<string, string>, exists = false) =>
  readLoginEnvironment(
    env,
    () => PEM,
    () => exists,
  )

/** A terminal that answers from a script and records what it was asked and told. */
function terminal(answers: string[]) {
  const asked: { question: string; hidden: boolean }[] = []
  const said: string[] = []
  const io: LoginIo = {
    ask: async (question, options = {}) => {
      asked.push({ question, hidden: options.hidden === true })
      return answers.shift() ?? ''
    },
    say: (line) => void said.push(line),
  }
  return { io, asked, said }
}

/** An account that signs in along the steps it is given. */
function standIn(steps: { afterCode: SignInStep; afterPassword?: SignInStep }) {
  const trail: string[] = []
  const account: LoginAccount = {
    connect: async () => void trail.push('connect'),
    stop: async () => void trail.push('stop'),
    sendCode: async (phone) => {
      trail.push(`sendCode ${phone}`)
      return { kind: 'code-sent', phoneCodeHash: 'hash-1' }
    },
    signInWithCode: async (request) => {
      trail.push(`code ${request.code} ${request.phoneCodeHash}`)
      return steps.afterCode
    },
    signInWithPassword: async (password) => {
      trail.push(`password ${password.length} characters`)
      return steps.afterPassword ?? { kind: 'authorized' }
    },
    exportSession: async () => 'THE-SESSION-STRING',
    logOut: async () => void trail.push('logOut'),
  }
  return { account, trail }
}

describe('what signing in reads', () => {
  it('runs nothing unless signing in was asked for by name', () => {
    const { YUIGRAM_LIVE_ALLOW_LOGIN: _, ...rest } = ENV
    expect(() => read(rest)).toThrow(/YUIGRAM_LIVE_ALLOW_LOGIN is not 1/)
    expect(() => read({ ...ENV, YUIGRAM_LIVE_ALLOW_LOGIN: 'yes' })).toThrow(EnvironmentError)
  })

  it('names what is missing, never a value', () => {
    const { YUIGRAM_LIVE_PHONE: _, YUIGRAM_LIVE_DC: __, ...rest } = ENV
    const failure = (() => {
      try {
        read(rest)
      } catch (error) {
        return error as Error
      }
      return undefined
    })()
    expect(failure?.message).toMatch(/YUIGRAM_LIVE_DC, YUIGRAM_LIVE_PHONE/)
    expect(failure?.message).not.toContain('a-secret-api-hash')
  })

  it('refuses to write a session over a file that exists', () => {
    expect(() => read(ENV, true)).toThrow(/never written over another/)
  })

  it('reads the rest, and lists the hash and the number as secrets', () => {
    const settings = read({ ...ENV, YUIGRAM_LIVE_TEST_NETWORK: '1' })
    expect(settings).toMatchObject({
      apiId: 12345,
      testMode: true,
      dc: { id: 2, host: '149.154.167.40', port: 443 },
      format: 'portable',
      out: '/out/session.txt',
    })
    expect(settings.keys).toHaveLength(1)
    expect(settings.secrets).toEqual(['a-secret-api-hash', '+999662000'])
  })
})

describe('signing in', () => {
  it('asks for the code at the terminal and answers the session', async () => {
    const { account, trail } = standIn({ afterCode: { kind: 'authorized' } })
    const { io, asked, said } = terminal(['22222'])

    expect(await signIn(account, '+999662000', 'portable', io)).toBe('THE-SESSION-STRING')
    expect(trail).toEqual(['connect', 'sendCode +999662000', 'code 22222 hash-1', 'stop'])
    expect(asked).toEqual([{ question: 'code: ', hidden: false }])
    expect(said.join(' ')).not.toContain('THE-SESSION-STRING')
  })

  it('asks for the password hidden where the account has one', async () => {
    const { account, trail } = standIn({ afterCode: { kind: 'password-required' } })
    const { io, asked } = terminal(['22222', 'hunter2'])

    await signIn(account, '+999662000', 'tl-v3', io)

    expect(asked[1]).toEqual({ question: 'password: ', hidden: true })
    expect(trail).toContain('password 7 characters')
    expect(trail.at(-1)).toBe('stop')
  })

  it('refuses a number with no account, and lets the account go', async () => {
    const { account, trail } = standIn({ afterCode: { kind: 'registration-required' } })

    await expect(signIn(account, '+999662000', 'portable', terminal(['1']).io)).rejects.toThrow(
      /does not register one/,
    )
    expect(trail.at(-1)).toBe('stop')
  })
})

describe('signing out', () => {
  it('runs nothing unless signing out was asked for by name, and ends the authorization when it was', async () => {
    expect(() => checkLogoutAllowed({})).toThrow(/YUIGRAM_LIVE_ALLOW_LOGOUT is not 1/)
    expect(() => checkLogoutAllowed({ YUIGRAM_LIVE_ALLOW_LOGOUT: '1' })).not.toThrow()

    const { account, trail } = standIn({ afterCode: { kind: 'authorized' } })
    await signOut(account)
    expect(trail).toEqual(['connect', 'logOut'])
  })
})
