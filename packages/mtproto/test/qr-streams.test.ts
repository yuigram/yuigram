// SPDX-License-Identifier: MPL-2.0

/**
 * The QR sign-in loop, and a download wearing a stream's shape.
 *
 * Both are loops around something already implemented, so what is checked is
 * the loop: that a token is re-requested when it expires and not before, that
 * an approval is noticed either way, that every exit lets go of what it
 * registered — and, for the streams, that the transfer actually stops when the
 * consumer does. A stream that constructs is not a stream that works.
 */

import { CancelledError, SessionError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import type { DownloadOptions } from '../src/files/download.js'
import { downloadAsNodeStream, downloadAsStream } from '../src/files/streams.js'
import { loginUrl, type QrSteps, signInQr } from '../src/network/qr.js'
import type { LoginTokenState, SignInState } from '../src/network/signin.js'
import { sendCode, startTest, testCode, testPhone } from '../src/network/signin.js'
import type { TlValue } from '../src/tl/index.js'

/* -------------------------------------------------------------------------- */
/* QR sign-in                                                                  */
/* -------------------------------------------------------------------------- */

const AUTHORIZED: SignInState = {
  kind: 'authorized',
  dcId: 2,
  user: { _: 'user', id: 9n } as TlValue,
}

/** Steps answering from a script, with the timer and the subscription held open. */
function steps(answers: readonly (LoginTokenState | SignInState)[]) {
  const timers: { run: () => void; delay: number; cancelled: boolean }[] = []
  const approvals: (() => void)[] = []
  const passwords: string[] = []
  let asked = 0
  let unsubscribed = 0

  const driver: QrSteps & {
    readonly timers: typeof timers
    readonly approvals: typeof approvals
    readonly passwords: string[]
    asked(): number
    unsubscribed(): number
  } = {
    requestToken: () => {
      const answer = answers[asked] ?? answers.at(-1)
      asked += 1

      return Promise.resolve(answer as never)
    },
    signInWithPassword: (password) => {
      passwords.push(password)

      return Promise.resolve(AUTHORIZED)
    },
    schedule(run, delay) {
      const timer = { run, delay, cancelled: false }
      timers.push(timer)

      return () => {
        timer.cancelled = true
      }
    },
    onApproval(notify) {
      approvals.push(notify)

      return () => {
        unsubscribed += 1
      }
    },
    timers,
    approvals,
    passwords,
    asked: () => asked,
    unsubscribed: () => unsubscribed,
  }

  return driver
}

const pending = (seconds: number, token = Uint8Array.of(1, 2, 3)): LoginTokenState => ({
  kind: 'pending',
  dcId: 2,
  token,
  expires: Math.floor(Date.now() / 1000) + seconds,
})

/** Let the promise chains a timer started settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('the login URL', () => {
  it('is the form a scanning device expects, with no padding', () => {
    expect(loginUrl(Uint8Array.of(1, 2, 3))).toBe('tg://login?token=AQID')
    // A length that would otherwise be padded.
    expect(loginUrl(Uint8Array.of(251, 255))).toBe('tg://login?token=-_8')
    expect(loginUrl(Uint8Array.of(1))).toBe('tg://login?token=AQ')
  })
})

describe('signing in by QR code', () => {
  it('shows the token, waits, and asks again when it expires', async () => {
    const driver = steps([pending(30), AUTHORIZED])
    const shown: string[] = []

    const signing = signInQr(driver, { onToken: (url) => shown.push(url) })
    await settle()

    expect(shown).toEqual(['tg://login?token=AQID'])
    expect(driver.asked()).toBe(1)
    // Waits out the token, less the margin that covers the round trip.
    expect(driver.timers[0]?.delay).toBeGreaterThan(20_000)
    expect(driver.timers[0]?.delay).toBeLessThanOrEqual(30_000)

    driver.timers[0]?.run()

    expect(await signing).toEqual(AUTHORIZED)
    expect(driver.asked()).toBe(2)
  })

  it('notices an approval without waiting out the token', async () => {
    const driver = steps([pending(60), AUTHORIZED])
    const approved: number[] = []

    const signing = signInQr(driver, { onToken: () => {}, onApproved: () => approved.push(1) })
    await settle()

    expect(driver.approvals).toHaveLength(1)
    driver.approvals[0]?.()

    expect(await signing).toEqual(AUTHORIZED)
    expect(approved).toEqual([1])
    // The wait it did not need was cancelled, and the subscription released.
    expect(driver.timers[0]?.cancelled).toBe(true)
    expect(driver.unsubscribed()).toBeGreaterThan(0)
  })

  it('redraws only when the token has actually changed', async () => {
    const same = pending(30)
    const driver = steps([same, same, AUTHORIZED])
    const shown: string[] = []

    const signing = signInQr(driver, { onToken: (url) => shown.push(url) })
    await settle()
    driver.timers[0]?.run()
    await settle()
    driver.timers[1]?.run()

    await signing
    // Telegram re-issues the same token while it is still good; redrawing an
    // unchanged code is a flicker.
    expect(shown).toEqual(['tg://login?token=AQID'])
  })

  it('redraws when the token has changed', async () => {
    const driver = steps([pending(30, Uint8Array.of(1)), pending(30, Uint8Array.of(2)), AUTHORIZED])
    const shown: string[] = []

    const signing = signInQr(driver, { onToken: (url) => shown.push(url) })
    await settle()
    driver.timers[0]?.run()
    await settle()
    driver.timers[1]?.run()

    await signing
    expect(shown).toEqual(['tg://login?token=AQ', 'tg://login?token=Ag'])
  })

  it('finishes with the password where the account has one', async () => {
    const driver = steps([pending(30), { kind: 'password-required', dcId: 2 }])
    const signing = signInQr(driver, { onToken: () => {}, password: () => 'hunter2' })
    await settle()
    driver.timers[0]?.run()

    expect(await signing).toEqual(AUTHORIZED)
    expect(driver.passwords).toEqual(['hunter2'])
  })

  it('refuses rather than hanging when a password is wanted and none was given', async () => {
    const driver = steps([{ kind: 'password-required', dcId: 2 }])

    await expect(signInQr(driver, { onToken: () => {} })).rejects.toThrow(SessionError)
  })

  it('stops when the caller gives up mid-wait, releasing what it held', async () => {
    const driver = steps([pending(60)])
    const giveUp = new AbortController()

    const signing = signInQr(driver, { onToken: () => {}, signal: giveUp.signal })
    await settle()
    giveUp.abort()

    await expect(signing).rejects.toThrow(CancelledError)
    expect(driver.timers.every((timer) => timer.cancelled)).toBe(true)
    expect(driver.unsubscribed()).toBeGreaterThan(0)
  })

  it('stops before asking for anything when it was given up on already', async () => {
    const driver = steps([pending(60)])
    const giveUp = new AbortController()
    giveUp.abort()

    await expect(signInQr(driver, { onToken: () => {}, signal: giveUp.signal })).rejects.toThrow(
      CancelledError,
    )
    expect(driver.asked()).toBe(0)
  })

  it('works without a way to be told of approvals, by waiting each token out', async () => {
    const driver = steps([pending(30), AUTHORIZED])
    const { onApproval: _drop, ...deaf } = driver

    const signing = signInQr(deaf, { onToken: () => {} })
    await settle()
    driver.timers[0]?.run()

    expect(await signing).toEqual(AUTHORIZED)
  })
})

/* -------------------------------------------------------------------------- */
/* Downloads as streams                                                        */
/* -------------------------------------------------------------------------- */

/** The grid the protocol asks ranges to sit on, which the transfer enforces. */
const PART = 4_096

/**
 * A datacenter serving a file of a known size.
 *
 * Records every range asked for, so a test can show that a consumer which
 * stopped reading stopped the fetching too.
 */
function serving(size: number, part = PART) {
  const asked: number[] = []

  const options: DownloadOptions = {
    location: { _: 'inputFileLocation' } as TlValue,
    dcId: 2,
    size,
    limit: part,
    concurrency: 1,
    reach: () => ({
      invoke: (query: TlValue) => {
        const offset = Number(query['offset'])
        const limit = Number(query['limit'])
        asked.push(offset)

        const end = Math.min(offset + limit, size)
        const bytes = new Uint8Array(Math.max(0, end - offset))
        for (let at = 0; at < bytes.length; at += 1) bytes[at] = (offset + at) % 251

        return Promise.resolve({
          _: 'upload.file',
          type: { _: 'storage.filePartial' },
          bytes,
          mtime: 0,
        } as TlValue)
      },
    }),
  }

  return { asked, options }
}

describe('a download as a web stream', () => {
  it('delivers the whole file, in order', async () => {
    const size = PART * 2 + 10
    const { options } = serving(size)
    const stream = downloadAsStream(options)

    const parts: Uint8Array[] = []
    for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) parts.push(chunk)

    const whole = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
    let at = 0
    for (const part of parts) {
      whole.set(part, at)
      at += part.length
    }

    expect(whole).toHaveLength(size)
    expect([...whole.slice(0, 4)]).toEqual([0, 1, 2, 3])
    // Every byte is the one the datacenter served for that position, so a
    // chunk delivered out of order or twice would show up here.
    expect([...whole].every((byte, index) => byte === index % 251)).toBe(true)
  })

  it('stops fetching when the consumer cancels', async () => {
    const { asked, options } = serving(PART * 50)
    const stream = downloadAsStream(options)

    const reader = stream.getReader()
    await reader.read()
    const afterFirst = asked.length
    await reader.cancel()
    // Anything still in flight settles here, and nothing new should start.
    await settle()

    expect(afterFirst).toBeGreaterThan(0)
    expect(asked.length).toBeLessThanOrEqual(afterFirst + 1)
    expect(asked.length).toBeLessThan(50)
  })

  it('does not run ahead of a consumer that stops reading', async () => {
    const { asked, options } = serving(PART * 50)
    const stream = downloadAsStream(options)

    const reader = stream.getReader()
    await reader.read()
    await settle()
    await settle()
    const parked = asked.length

    // Backpressure: with nobody reading, the queue fills and the transfer waits.
    expect(parked).toBeLessThan(10)
    await reader.cancel()
  })

  it('waits for the transfer to stop before cancelling resolves', async () => {
    // The difference between abandoning the download and merely walking away
    // from it: one leaves a transfer running against an account Telegram is
    // willing to limit, and the other does not.
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let served = 0

    const stream = downloadAsStream({
      location: { _: 'inputFileLocation' } as TlValue,
      dcId: 2,
      size: PART * 50,
      limit: PART,
      concurrency: 1,
      reach: () => ({
        invoke: async () => {
          served += 1
          // Every range after the first is held until the case lets it go.
          if (served > 1) await gate

          return {
            _: 'upload.file',
            type: { _: 'storage.filePartial' },
            bytes: new Uint8Array(PART),
            mtime: 0,
          } as TlValue
        },
      }),
    })

    const reader = stream.getReader()
    await reader.read()
    // Let the next range go out, so the transfer is genuinely in flight rather
    // than parked on the sink when the cancel arrives.
    await settle()
    expect(served).toBeGreaterThan(1)

    let settled = false
    const cancelling = reader.cancel().then(() => {
      settled = true
    })
    await settle()

    // Still held: the transfer has a range in flight and has not unwound.
    expect(settled).toBe(false)
    release?.()
    await cancelling
    expect(settled).toBe(true)
  })

  it('surfaces a failure to the consumer rather than ending the stream quietly', async () => {
    const stream = downloadAsStream({
      location: { _: 'inputFileLocation' } as TlValue,
      dcId: 2,
      reach: () => ({
        invoke: () => Promise.reject(new SessionError('the datacenter refused')),
      }),
    })

    await expect(
      (async () => {
        for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) void chunk
      })(),
    ).rejects.toThrow(/refused/)
  })
})

describe('a download as a Node stream', () => {
  it('delivers the whole file through the Node shape', async () => {
    const size = PART * 2 + 10
    const { options } = serving(size)
    const stream = await downloadAsNodeStream(options)

    const parts: Uint8Array[] = []
    for await (const chunk of stream) parts.push(new Uint8Array(chunk))

    expect(parts.reduce((sum, part) => sum + part.length, 0)).toBe(size)
  })

  it('stops fetching when the stream is destroyed', async () => {
    const { asked, options } = serving(PART * 50)
    const stream = await downloadAsNodeStream(options)

    for await (const chunk of stream) {
      void chunk
      break
    }
    await settle()

    expect(asked.length).toBeLessThan(50)
  })

  it('reports a failure through the stream rather than as an unhandled rejection', async () => {
    const stream = await downloadAsNodeStream({
      location: { _: 'inputFileLocation' } as TlValue,
      dcId: 2,
      reach: () => ({
        invoke: () => Promise.reject(new SessionError('the datacenter refused')),
      }),
    })

    await expect(
      (async () => {
        for await (const chunk of stream) void chunk
      })(),
    ).rejects.toThrow(/refused/)
  })
})

/* -------------------------------------------------------------------------- */
/* Signing in on a test datacenter                                             */
/* -------------------------------------------------------------------------- */

describe('a reserved test number', () => {
  it('names the datacenter it belongs to, and refuses one that has none', () => {
    const fixed = (length: number) => new Uint8Array(length).fill(7)

    expect(testPhone(2, fixed)).toBe('9996627777')
    expect(testPhone(1, fixed)).toMatch(/^999661\d{4}$/)
    // Telegram runs three test datacenters and no more.
    for (const bad of [0, 4, -1]) {
      expect(() => testPhone(bad, fixed)).toThrow(/test datacenters/)
    }
  })

  it('has a confirmation code of its datacenter, five times over', () => {
    expect(testCode(2)).toBe('22222')
    expect(testCode(3)).toBe('33333')
    expect(testCode(2, 6)).toBe('222222')
  })

  it('signs in through the ordinary steps, with the code it already knows', async () => {
    const asked: TlValue[] = []
    const reach = () => ({
      invoke: (query: TlValue) => {
        asked.push(query)

        return Promise.resolve(
          query._ === 'auth.sendCode'
            ? ({ _: 'auth.sentCode', phone_code_hash: 'hash', type: {} } as TlValue)
            : ({
                _: 'auth.authorization',
                user: { _: 'user', id: 9n, access_hash: 1n },
              } as TlValue),
        )
      },
    })

    const state = await startTest({
      reach,
      dcId: 2,
      apiId: 1,
      apiHash: 'x',
      random: (length) => new Uint8Array(length).fill(1),
    })

    expect(state.kind).toBe('authorized')
    expect(asked[0]).toMatchObject({ _: 'auth.sendCode', phone_number: '9996621111' })
    // The code is the datacenter's number five times, not something guessed at.
    expect(asked[1]).toMatchObject({
      _: 'auth.signIn',
      phone_code: '22222',
      phone_code_hash: 'hash',
    })
  })

  it('reads the datacenter out of a number the caller supplied', async () => {
    const asked: TlValue[] = []
    const reach = () => ({
      invoke: (query: TlValue) => {
        asked.push(query)

        return Promise.resolve(
          query._ === 'auth.sendCode'
            ? ({ _: 'auth.sentCode', phone_code_hash: 'hash', type: {} } as TlValue)
            : ({ _: 'auth.authorization', user: { _: 'user', id: 9n } } as TlValue),
        )
      },
    })

    await startTest({ reach, dcId: 1, apiId: 1, apiHash: 'x', phone: '9996630000' })

    // The number decides, not the argument beside it.
    expect(asked[1]).toMatchObject({ phone_code: '33333' })
  })

  /** A test datacenter that answers the code request with `answer`, recording every request. */
  function answering(answer: TlValue) {
    const asked: TlValue[] = []
    const reach = () => ({
      invoke: (query: TlValue) => {
        asked.push(query)

        return Promise.resolve(
          query._ === 'auth.sendCode'
            ? answer
            : ({ _: 'auth.authorization', user: { _: 'user', id: 9n } } as TlValue),
        )
      },
    })

    return { asked, reach }
  }

  const sentCode = (type: unknown) =>
    ({ _: 'auth.sentCode', phone_code_hash: 'hash', type }) as TlValue

  it.each([
    ['in the app, six digits', { _: 'auth.sentCodeTypeApp', length: 6 }, '222222'],
    ['by SMS, five digits', { _: 'auth.sentCodeTypeSms', length: 5 }, '22222'],
    ['by a call, four digits', { _: 'auth.sentCodeTypeCall', length: 4 }, '2222'],
    [
      'by a flash call, with no length stated',
      { _: 'auth.sentCodeTypeFlashCall', pattern: '*' },
      '22222',
    ],
    ['as a word, with no length stated', { _: 'auth.sentCodeTypeSmsWord' }, '22222'],
  ])('builds the code to the length Telegram states for a code sent %s', async (_, type, code) => {
    const { asked, reach } = answering(sentCode(type))

    await startTest({ reach, dcId: 2, apiId: 1, apiHash: 'x', phone: '9996621111' })

    // The stated length is the one Telegram checks; the documented five is
    // used only where the answer states none.
    expect(asked[1]).toMatchObject({ _: 'auth.signIn', phone_code: code })
  })

  it.each([
    ['zero', 0],
    ['a negative length', -1],
    ['a fraction', 2.5],
    ['more digits than any code has', 17],
    ['a length large enough to exhaust memory', 2 ** 31],
    ['a length that is not a number', '5'],
    ['no number at all', Number.NaN],
  ])('spends no attempt on %s as the stated length', async (_, length) => {
    const { asked, reach } = answering(sentCode({ _: 'auth.sentCodeTypeApp', length }))

    await expect(
      startTest({ reach, dcId: 2, apiId: 1, apiHash: 'x', phone: '9996621111' }),
    ).rejects.toThrow(SessionError)
    expect(asked.map((query) => query._)).toEqual(['auth.sendCode'])
  })

  it('spends no attempt when the answer does not say how the code was sent', async () => {
    const { asked, reach } = answering({ _: 'auth.sentCode', phone_code_hash: 'hash' } as TlValue)

    await expect(
      startTest({ reach, dcId: 2, apiId: 1, apiHash: 'x', phone: '9996621111' }),
    ).rejects.toThrow(/auth\.sentCode\.type/)
    expect(asked).toHaveLength(1)
  })

  it('spends no attempt when Telegram answers with something other than a sent code', async () => {
    const { asked, reach } = answering({ _: 'auth.sentCodePaymentRequired' } as TlValue)

    await expect(
      startTest({ reach, dcId: 2, apiId: 1, apiHash: 'x', phone: '9996621111' }),
    ).rejects.toThrow(/expected a sent code/)
    expect(asked).toHaveLength(1)
  })

  it('leaves the ordinary flow without a code: a person types what arrived', async () => {
    const { reach } = answering(sentCode({ _: 'auth.sentCodeTypeApp', length: 6 }))

    const state = await sendCode({
      reach,
      dcId: 2,
      apiId: 1,
      apiHash: 'x',
      phone: '+44 7700 900123',
    })

    // Nothing is derived from the delivery outside a test number's sign-in.
    expect(state).toEqual({ kind: 'code-sent', dcId: 2, phoneCodeHash: 'hash' })
  })

  it('refuses a number that is not a reserved one', async () => {
    await expect(
      startTest({
        reach: () => ({ invoke: () => Promise.resolve({} as TlValue) }),
        dcId: 1,
        apiId: 1,
        apiHash: 'x',
        phone: '+70000000000',
      }),
    ).rejects.toThrow(/not a reserved test number/)
  })
})
