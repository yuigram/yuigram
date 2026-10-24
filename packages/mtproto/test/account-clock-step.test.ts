// SPDX-License-Identifier: MIT

/**
 * A wall clock stepped while an authorized connection stays open.
 *
 * The connection measured the server's clock when it was opened, and judges
 * every message against it. A clock set back or forward past the window after
 * that leaves the measurement wrong: the server's answers look as though they
 * come from the future or the distant past, and are refused, while the socket
 * stays open and every call waits for an answer that has already been
 * discarded. Nothing about such a connection fails on its own.
 *
 * So the whole lifecycle is driven here — account, connection, channel,
 * session — against stand-in datacenters that keep true time and judge the
 * client's message identifiers as Telegram does. Time is virtual: timers see it
 * move only forward, as a real timer does, while the account's wall clock is
 * stepped under it. What is asserted is what a caller sees: calls that end,
 * with an error or an answer, and calls that are answered again within a bound
 * that does not depend on how far the clock moved.
 */

import { NetworkError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { REGISTRY as API } from '../src/generated/api/registry.js'
import { REGISTRY as CORE } from '../src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../src/generated/mtproto/registry.js'
import { TlScope } from '../src/tl/index.js'
import { MockDatacenter } from './server/datacenter.js'
import { createServerKey } from './server/keys.js'
import { mockAccount, NOW_SECONDS } from './support/mock-account.js'

const SCOPE = new TlScope('account', [CORE, MTPROTO, API])

/** Let everything already queued run: delivery between client and peers is asynchronous. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 30; turn += 1) await new Promise((resolve) => setImmediate(resolve))
}

/** Time as timers count it: it moves forward, and only when a case moves it. */
function virtualTime(start: number) {
  let now = start
  const timers: Array<{ at: number; run: () => void; cancelled: boolean }> = []

  return {
    get now() {
      return now
    },
    schedule(run: () => void, delay: number): () => void {
      const timer = { at: now + Math.max(0, delay), run, cancelled: false }
      timers.push(timer)

      return () => {
        timer.cancelled = true
      }
    },
    async advance(by: number): Promise<void> {
      const until = now + by
      for (;;) {
        await settle()
        const next = timers
          .filter((timer) => !timer.cancelled && timer.at <= until)
          .sort((a, b) => a.at - b.at)[0]
        if (next === undefined) break

        now = Math.max(now, next.at)
        next.cancelled = true
        next.run()
      }
      now = until
      await settle()
    },
  }
}

/** A call's outcome as it stands, and the second of virtual time it settled at. */
interface Outcome {
  state: 'pending' | 'answered' | 'failed'
  at?: number
  error?: unknown
}

/**
 * An account with one authorized, working connection to datacenter 2, and a
 * wall clock the case can step.
 */
async function connectedAccount() {
  const time = virtualTime(NOW_SECONDS * 1000)
  let step = 0
  const key = createServerKey()
  const standIn = (id: number, host: string) =>
    new MockDatacenter({
      id,
      host,
      key,
      scope: SCOPE,
      serverTime: NOW_SECONDS,
      now: () => time.now,
      checksClientTime: true,
    })
  const datacenters = new Map([
    [2, standIn(2, '127.0.0.2')],
    [4, standIn(4, '127.0.0.4')],
  ])
  const instance = mockAccount({
    key,
    datacenters,
    now: () => time.now + step,
    schedule: (run, delay) => time.schedule(run, delay),
  })

  const second = () => Math.round((time.now - NOW_SECONDS * 1000) / 1000)
  const call = (): Outcome => {
    const outcome: Outcome = { state: 'pending' }
    instance.account
      .reach(2)
      .invoke({ _: 'help.getNearestDc' })
      .then(
        () => Object.assign(outcome, { state: 'answered', at: second() }),
        (error: unknown) => Object.assign(outcome, { state: 'failed', at: second(), error }),
      )
    return outcome
  }

  const connecting = instance.account.connect()
  let connected = false
  void connecting.then(() => {
    connected = true
  })
  for (let tries = 0; !connected && tries < 300; tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5))
    await time.advance(100)
  }
  await connecting

  const first = call()
  await time.advance(2000)
  expect(first.state).toBe('answered')

  const sockets = () => datacenters.get(2)?.connections.length ?? 0

  return {
    time,
    call,
    second,
    sockets,
    stepBy(seconds: number) {
      step += seconds * 1000
    },
    dispose: () => instance.dispose(),
  }
}

describe('a wall clock stepped while a connection is open', () => {
  for (const seconds of [60, 86_400]) {
    it(`is answered again within three ping intervals of a step back by ${seconds} s`, async () => {
      // The server's answers now look dated in the future and are refused. No
      // notification comes: from the server's side the client's identifiers are
      // merely old. The pings go unanswered too, and two of them end the
      // channel; the next one opens a session that learns the clock afresh.
      const account = await connectedAccount()
      const opened = account.sockets()
      const steppedAt = account.second()
      account.stepBy(-seconds)

      const during = account.call()
      await account.time.advance(60_000)
      // Ended, and said so — on the deadline the caller was given, not one put
      // off by however far the clock went back.
      expect(during.state).toBe('failed')
      expect(during.error).toBeInstanceOf(NetworkError)
      expect(during.at).toBeLessThanOrEqual(steppedAt + 61)

      await account.time.advance(130_000)
      expect(account.sockets()).toBe(opened + 1)

      const after = account.call()
      await account.time.advance(2000)
      expect(after.state).toBe('answered')
      expect(after.at).toBeLessThanOrEqual(steppedAt + 3 * 60 + 15)

      await account.dispose()
    }, 30_000)
  }

  it('is answered at once after a step forward within the window, on the same connection', async () => {
    // The server refuses the identifiers now dated ahead and states its time.
    // The correction leaves what was issued ahead of it, so the session starts
    // again from the corrected clock and the call goes out once more.
    const account = await connectedAccount()
    const opened = account.sockets()
    account.stepBy(60)

    const during = account.call()
    await account.time.advance(2000)

    expect(during.state).toBe('answered')
    expect(account.sockets()).toBe(opened)
    await account.dispose()
  }, 30_000)

  it('is answered again after a step forward past the window', async () => {
    // Now the server's refusals look too old and are refused in turn. The pings
    // go unanswered, the channel ends, and the new session is refused, corrected
    // and started again from the server's clock.
    const account = await connectedAccount()
    const opened = account.sockets()
    const steppedAt = account.second()
    account.stepBy(400)

    const during = account.call()
    await account.time.advance(60_000)
    expect(during.state).toBe('failed')
    expect(during.error).toBeInstanceOf(NetworkError)

    await account.time.advance(60_000)
    expect(account.sockets()).toBe(opened + 1)

    const after = account.call()
    await account.time.advance(2000)
    expect(after.state).toBe('answered')
    expect(after.at).toBeLessThanOrEqual(steppedAt + 3 * 60)

    await account.dispose()
  }, 30_000)
})
