// SPDX-License-Identifier: MIT

/**
 * The lifecycle of a request, as distinct from the messages carrying it.
 *
 * Two things here must survive a change of message identifier: the deadline and
 * the ordering group. A resend allocates a new identifier, so anything keyed to
 * the old one restarts — which for a deadline means a server can hold a request
 * open forever by refusing it, and for a group means the ordering silently
 * stops being enforced.
 *
 * Time is a number the test supplies. Nothing here sleeps.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { isTerminal, RequestRegistry, type RequestState } from '../src/session/requests.js'

/** A registry holding one sent request, for the cases that start there. */
function withSent(deadline = 1000) {
  const registry = new RequestRegistry()
  const id = registry.create({ deadline })
  registry.sent(id, 100n)

  return { registry, id }
}

describe('the state machine', () => {
  it('starts pending, with no message carrying it', () => {
    const registry = new RequestRegistry()
    const id = registry.create({ deadline: 1000 })

    expect(registry.get(id)?.state).toBe('pending')
    expect(registry.get(id)?.msgId).toBeUndefined()
  })

  it('moves to sent when a message carries it', () => {
    const { registry, id } = withSent()

    expect(registry.get(id)?.state).toBe('sent')
    expect(registry.get(id)?.msgId).toBe(100n)
    expect(registry.byMessage(100n)?.id).toBe(id)
  })

  it('separates acknowledgement from completion', () => {
    // The server confirms receipt long before it answers. Collapsing the two
    // would make a request that must not be resent look like one that is done.
    const { registry, id } = withSent()

    registry.acknowledge(100n)
    expect(registry.get(id)?.state).toBe('acknowledged')

    registry.complete(100n)
    expect(registry.get(id)?.state).toBe('completed')
  })

  it('names every terminal state', () => {
    const terminal: RequestState[] = ['completed', 'failed', 'timed-out', 'cancelled']
    const open: RequestState[] = ['pending', 'sent', 'acknowledged', 'blocked']

    for (const state of terminal) expect(isTerminal(state), state).toBe(true)
    for (const state of open) expect(isTerminal(state), state).toBe(false)
  })

  it('refuses to leave a terminal state', () => {
    for (const settle of ['complete', 'fail'] as const) {
      const { registry } = withSent()
      registry[settle](100n)

      expect(registry.acknowledge(100n)).toBeUndefined()
      expect(registry.complete(100n)).toBeUndefined()
      expect(registry.fail(100n)).toBeUndefined()
      expect(registry.block(100n)).toBeUndefined()
    }
  })

  it('refuses to send a request that has settled', () => {
    const { registry, id } = withSent()
    registry.complete(100n)

    expect(() => registry.sent(id, 104n)).toThrow(/cannot send a request that is completed/)
  })

  it('refuses to let two requests share a message', () => {
    const registry = new RequestRegistry()
    const first = registry.create({ deadline: 1000 })
    const second = registry.create({ deadline: 1000 })
    registry.sent(first, 100n)

    expect(() => registry.sent(second, 100n)).toThrow(/already carries a request/)
  })

  it('refuses to forget a request still in flight', () => {
    // An answer arriving afterwards would be indistinguishable from one for a
    // request that never existed.
    const { registry, id } = withSent()

    expect(() => registry.forget(id)).toThrow(/is sent and cannot be forgotten/)
  })

  it('refuses more requests than it can hold', () => {
    const registry = new RequestRegistry({ capacity: 2 })
    registry.create({ deadline: 1000 })
    registry.create({ deadline: 1000 })

    expect(() => registry.create({ deadline: 1000 })).toThrow(/cannot track more than 2/)
  })

  it('refuses a capacity that could hold nothing', () => {
    for (const capacity of [0, -1, 2.5]) {
      expect(() => new RequestRegistry({ capacity })).toThrow(ValidationError)
    }
  })
})

describe('a message identifier changing', () => {
  it('carries the request to the new identifier and drops the old', () => {
    // A resend is a new message. Leaving the old identifier standing for the
    // request would let a late answer to a superseded attempt settle it.
    const { registry, id } = withSent()
    registry.sent(id, 104n)

    expect(registry.byMessage(104n)?.id).toBe(id)
    expect(registry.byMessage(100n)).toBeUndefined()
    expect(registry.get(id)?.msgId).toBe(104n)
  })

  it('keeps the deadline the request was created with', () => {
    // The deadline measures how long the caller will wait. A server able to
    // restart it by refusing a message could hold the request open forever.
    const registry = new RequestRegistry()
    const id = registry.create({ deadline: 1000 })

    registry.sent(id, 100n)
    registry.sent(id, 104n)
    registry.sent(id, 108n)

    expect(registry.get(id)?.deadline).toBe(1000)
    expect(registry.expire(1000).map((request) => request.id)).toEqual([id])
  })

  it('does not let an acknowledgement undo being blocked', () => {
    // Acknowledgement and refusal both arrive from the server and may arrive in
    // either order. Letting the ack win would make a request that still needs
    // sending again look like one that is merely waiting for an answer.
    const { registry, id } = withSent()
    registry.block(100n)
    registry.acknowledge(100n)

    expect(registry.get(id)?.state).toBe('blocked')
  })

  it('lets a blocked request be sent again', () => {
    const { registry, id } = withSent()
    registry.block(100n)

    expect(registry.get(id)?.state).toBe('blocked')
    registry.sent(id, 104n)
    expect(registry.get(id)?.state).toBe('sent')
  })
})

describe('ordering groups', () => {
  it('names nothing for the first request in a group', () => {
    const registry = new RequestRegistry()
    const first = registry.create({ deadline: 1000, chain: 'a' })

    expect(registry.sent(first, 100n)).toBeUndefined()
  })

  it('names the message last sent in the group', () => {
    const registry = new RequestRegistry()
    const first = registry.create({ deadline: 1000, chain: 'a' })
    const second = registry.create({ deadline: 1000, chain: 'a' })

    registry.sent(first, 100n)
    expect(registry.sent(second, 200n)).toBe(100n)
  })

  it('extends across more than two levels', () => {
    const registry = new RequestRegistry()
    const ids = [1, 2, 3].map(() => registry.create({ deadline: 1000, chain: 'a' }))

    expect(registry.sent(ids[0] ?? 0, 100n)).toBeUndefined()
    expect(registry.sent(ids[1] ?? 0, 200n)).toBe(100n)
    expect(registry.sent(ids[2] ?? 0, 300n)).toBe(200n)
  })

  it('keeps groups independent', () => {
    const registry = new RequestRegistry()
    const a = registry.create({ deadline: 1000, chain: 'a' })
    const b = registry.create({ deadline: 1000, chain: 'b' })
    const a2 = registry.create({ deadline: 1000, chain: 'a' })

    registry.sent(a, 100n)
    expect(registry.sent(b, 200n)).toBeUndefined()
    expect(registry.sent(a2, 300n)).toBe(100n)
  })

  it('names no predecessor for a request outside any group', () => {
    const registry = new RequestRegistry()
    const first = registry.create({ deadline: 1000, chain: 'a' })
    const loose = registry.create({ deadline: 1000 })

    registry.sent(first, 100n)
    expect(registry.sent(loose, 200n)).toBeUndefined()
  })

  it('never names an earlier attempt of the same request', () => {
    // The identifier a resend supersedes was superseded because nothing
    // confirmed the server had it. Naming it asks the server to wait for a
    // message it will never report on.
    const registry = new RequestRegistry()
    const id = registry.create({ deadline: 1000, chain: 'a' })

    registry.sent(id, 100n)
    expect(registry.sent(id, 104n)).toBeUndefined()
    expect(registry.get(id)?.after).toBeUndefined()
  })

  it('keeps the head at the front when the head is resent', () => {
    // A resend is a new attempt at a request that already has a place, not a
    // new member. Treating it as one would put the head behind what it was
    // meant to precede, and leave that other request waiting on an identifier
    // the server never saw — neither would ever resolve.
    const registry = new RequestRegistry()
    const a = registry.create({ deadline: 1000, chain: 'c' })
    const b = registry.create({ deadline: 1000, chain: 'c' })

    registry.sent(a, 100n)
    expect(registry.sent(b, 200n)).toBe(100n)

    expect(registry.sent(a, 400n)).toBeUndefined()
    expect(registry.get(a)?.after).toBeUndefined()
  })

  it('names the predecessor attempt current at the moment of sending', () => {
    const registry = new RequestRegistry()
    const a = registry.create({ deadline: 1000, chain: 'c' })
    const b = registry.create({ deadline: 1000, chain: 'c' })

    registry.sent(a, 100n)
    registry.sent(b, 200n)
    registry.sent(a, 400n)

    // Only when b is itself sent again does it pick up a's new attempt: the
    // wrapper already on the wire cannot be rewritten.
    expect(registry.sent(b, 500n)).toBe(400n)
  })

  it('keeps a three-level group ordered through every resend', () => {
    const registry = new RequestRegistry()
    const [a, b, c] = [1, 2, 3].map(() => registry.create({ deadline: 1000, chain: 'c' }))

    expect(registry.sent(a ?? 0, 100n)).toBeUndefined()
    expect(registry.sent(b ?? 0, 200n)).toBe(100n)
    expect(registry.sent(c ?? 0, 300n)).toBe(200n)

    expect(registry.sent(a ?? 0, 400n)).toBeUndefined()
    expect(registry.sent(b ?? 0, 500n)).toBe(400n)
    expect(registry.sent(c ?? 0, 600n)).toBe(500n)
  })

  it('converges after several members are resent in any order', () => {
    const registry = new RequestRegistry()
    const [a, b, c] = [1, 2, 3].map(() => registry.create({ deadline: 1000, chain: 'c' }))
    registry.sent(a ?? 0, 100n)
    registry.sent(b ?? 0, 200n)
    registry.sent(c ?? 0, 300n)

    // Tail first, then head, then interior — the order a caller would produce
    // if refusals arrived out of order.
    registry.sent(c ?? 0, 310n)
    registry.sent(a ?? 0, 110n)
    registry.sent(b ?? 0, 210n)
    expect(registry.sent(c ?? 0, 320n)).toBe(210n)

    expect(registry.get(a ?? 0)?.after).toBeUndefined()
    expect(registry.get(b ?? 0)?.after).toBe(110n)
  })

  it('steps over a predecessor that failed', () => {
    // The server has given up on it, and answers a request naming it by
    // refusing that one too.
    const registry = new RequestRegistry()
    const a = registry.create({ deadline: 1000, chain: 'c' })
    const b = registry.create({ deadline: 1000, chain: 'c' })
    registry.sent(a, 100n)
    registry.sent(b, 200n)

    registry.fail(100n)
    expect(registry.sent(b, 300n)).toBeUndefined()
  })

  it('steps over a predecessor that timed out or was withdrawn', () => {
    for (const settle of ['timeout', 'cancel'] as const) {
      const registry = new RequestRegistry()
      const a = registry.create({ deadline: 1000, chain: 'c' })
      const b = registry.create({ deadline: 5000, chain: 'c' })
      registry.sent(a, 100n)
      registry.sent(b, 200n)

      if (settle === 'timeout') registry.expire(1000)
      else registry.cancel(a)

      expect(registry.sent(b, 300n), settle).toBeUndefined()
    }
  })

  it('names a predecessor that completed, because the server knows it finished', () => {
    const registry = new RequestRegistry()
    const a = registry.create({ deadline: 1000, chain: 'c' })
    const b = registry.create({ deadline: 1000, chain: 'c' })
    registry.sent(a, 100n)
    registry.sent(b, 200n)
    registry.complete(100n)

    expect(registry.sent(b, 300n)).toBe(100n)
  })

  it('steps back past a failed member to one still usable', () => {
    const registry = new RequestRegistry()
    const [a, b, c] = [1, 2, 3].map(() => registry.create({ deadline: 1000, chain: 'c' }))
    registry.sent(a ?? 0, 100n)
    registry.sent(b ?? 0, 200n)
    registry.sent(c ?? 0, 300n)

    registry.fail(200n)
    expect(registry.sent(c ?? 0, 400n)).toBe(100n)
  })

  it('keeps a group while any of its members is still tracked', () => {
    // Positions are indexes into the group. Dropping it while a member still
    // holds a place would let a later request take that place, and the earlier
    // member would then be told to run after one that joined after it.
    const registry = new RequestRegistry()
    const a = registry.create({ deadline: 1000, chain: 'c' })
    const b = registry.create({ deadline: 1000, chain: 'c' })
    registry.sent(a, 100n)
    registry.sent(b, 200n)

    registry.complete(100n)
    registry.forget(a)

    const c = registry.create({ deadline: 1000, chain: 'c' })
    expect(registry.sent(c, 300n)).toBe(200n)

    // b keeps its place ahead of c, so resending it never names c.
    expect(registry.sent(b, 400n)).toBeUndefined()
  })

  it('stays bounded by what is outstanding, not by how long it has been used', () => {
    // A group in continuous use never empties. Retaining members already
    // finished would grow it for as long as the connection lasts and lengthen
    // every predecessor search with it, so the cost here is quadratic in the
    // number of sends if they are kept and linear if they are not — measured at
    // roughly one millisecond against four hundred.
    const registry = new RequestRegistry({ capacity: 60_000 })
    const ids: number[] = []

    for (let index = 1; index <= 20_000; index += 1) {
      const id = registry.create({ deadline: 9999, chain: 'g' })
      registry.sent(id, BigInt(index))
      ids.push(id)
    }

    // Everything but the head finishes and is dropped.
    for (let index = 1; index < ids.length; index += 1) {
      registry.complete(BigInt(index + 1))
      registry.forget(ids[index] ?? 0)
    }

    const started = Date.now()
    for (let index = 0; index < 2_000; index += 1) {
      const id = registry.create({ deadline: 9999, chain: 'g' })
      expect(registry.sent(id, BigInt(1_000_000 + index))).toBe(1n)
      registry.complete(BigInt(1_000_000 + index))
      registry.forget(id)
    }

    expect(Date.now() - started).toBeLessThan(250)
  }, 20_000)

  it('ignores an answer addressed to a superseded attempt', () => {
    // The identifier stopped standing for the request when it was resent.
    const registry = new RequestRegistry()
    const a = registry.create({ deadline: 1000, chain: 'c' })
    registry.sent(a, 100n)
    registry.sent(a, 200n)

    expect(registry.complete(100n)).toBeUndefined()
    expect(registry.get(a)?.state).toBe('sent')
  })
})

describe('deadlines', () => {
  it('does not expire before the deadline', () => {
    const { registry } = withSent(1000)

    expect(registry.expire(999)).toEqual([])
  })

  it('expires exactly at the deadline', () => {
    const { registry, id } = withSent(1000)

    expect(registry.expire(1000).map((request) => request.id)).toEqual([id])
    expect(registry.get(id)?.state).toBe('timed-out')
  })

  it('expires after the deadline', () => {
    const { registry, id } = withSent(1000)

    expect(registry.expire(1001).map((request) => request.id)).toEqual([id])
  })

  it('reports each expiry once', () => {
    // A caller acting on the same expiry twice would fail a request it had
    // already failed.
    const { registry } = withSent(1000)

    expect(registry.expire(2000)).toHaveLength(1)
    expect(registry.expire(2000)).toEqual([])
  })

  it('does not expire a request that was answered first', () => {
    const { registry, id } = withSent(1000)
    registry.complete(100n)

    expect(registry.expire(2000)).toEqual([])
    expect(registry.get(id)?.state).toBe('completed')
  })

  it('does not expire a request the caller withdrew', () => {
    const { registry, id } = withSent(1000)
    registry.cancel(id)

    expect(registry.expire(2000)).toEqual([])
    expect(registry.get(id)?.state).toBe('cancelled')
  })

  it('expires an acknowledged request that was never answered', () => {
    // Acknowledgement means received, not answered. A server able to stop the
    // clock by acknowledging could hold a request open forever.
    const { registry, id } = withSent(1000)
    registry.acknowledge(100n)

    expect(registry.expire(1000).map((request) => request.id)).toEqual([id])
  })

  it('expires a request never sent at all', () => {
    const registry = new RequestRegistry()
    const id = registry.create({ deadline: 1000 })

    expect(registry.expire(1000).map((request) => request.id)).toEqual([id])
  })

  it('reports expiries in a deterministic order', () => {
    const registry = new RequestRegistry()
    const ids = [1, 2, 3].map(() => registry.create({ deadline: 1000 }))

    expect(registry.expire(1000).map((request) => request.id)).toEqual(ids)
  })
})

describe('the earliest deadline', () => {
  it('is none when nothing is being tracked', () => {
    expect(new RequestRegistry().earliestDeadline()).toBeUndefined()
  })

  it('is the soonest of those outstanding, whatever order they arrived in', () => {
    const registry = new RequestRegistry()
    registry.create({ deadline: 700 })
    registry.create({ deadline: 300 })
    registry.create({ deadline: 500 })

    // The first deadline to pass is the only one that can need attention next,
    // which is what lets one wake stand in for a timer per request.
    expect(registry.earliestDeadline()).toBe(300)
  })

  it('moves on as the soonest ones settle', () => {
    const registry = new RequestRegistry()
    const first = registry.create({ deadline: 300 })
    registry.create({ deadline: 700 })

    registry.cancel(first)

    expect(registry.earliestDeadline()).toBe(700)
  })

  it('ignores requests that have already settled', () => {
    const registry = new RequestRegistry()
    const settled = registry.create({ deadline: 100 })
    registry.create({ deadline: 900 })
    registry.sent(settled, 10n)
    registry.complete(10n)

    // A deadline means something only while somebody is still waiting on it.
    expect(registry.earliestDeadline()).toBe(900)
  })
})

describe('withdrawal', () => {
  it('stops a request that has not been sent', () => {
    const registry = new RequestRegistry()
    const id = registry.create({ deadline: 1000 })

    expect(registry.cancel(id)).toBe(true)
    expect(registry.get(id)?.state).toBe('cancelled')
  })

  it('stops a request already sent, which cannot be recalled', () => {
    const { registry, id } = withSent()

    expect(registry.cancel(id)).toBe(true)
    expect(registry.get(id)?.state).toBe('cancelled')
  })

  it('stops a request already acknowledged', () => {
    const { registry, id } = withSent()
    registry.acknowledge(100n)

    expect(registry.cancel(id)).toBe(true)
  })

  it('is idempotent', () => {
    const { registry, id } = withSent()

    expect(registry.cancel(id)).toBe(true)
    expect(registry.cancel(id)).toBe(false)
    expect(registry.get(id)?.state).toBe('cancelled')
  })

  it('does not reverse an answer that already arrived', () => {
    // A request the server has answered is answered, whatever the caller has
    // since decided.
    const { registry, id } = withSent()
    registry.complete(100n)

    expect(registry.cancel(id)).toBe(false)
    expect(registry.get(id)?.state).toBe('completed')
  })

  it('discards an answer arriving after withdrawal', () => {
    const { registry, id } = withSent()
    registry.cancel(id)

    expect(registry.complete(100n)).toBeUndefined()
    expect(registry.get(id)?.state).toBe('cancelled')
  })

  it('loses to a deadline that has already passed', () => {
    const { registry, id } = withSent(1000)
    registry.expire(1000)

    expect(registry.cancel(id)).toBe(false)
    expect(registry.get(id)?.state).toBe('timed-out')
  })

  it('leaves nothing behind once forgotten', () => {
    const { registry, id } = withSent()
    registry.cancel(id)
    registry.forget(id)

    expect(registry.size).toBe(0)
    expect(registry.byMessage(100n)).toBeUndefined()
  })

  it('reports an identifier it does not hold', () => {
    expect(new RequestRegistry().cancel(999)).toBe(false)
  })
})

describe('what the record forgets', () => {
  it('lists what has settled', () => {
    const registry = new RequestRegistry()
    const done = registry.create({ deadline: 1000 })
    const open = registry.create({ deadline: 1000 })
    registry.sent(done, 100n)
    registry.sent(open, 200n)
    registry.complete(100n)

    expect(registry.settled().map((request) => request.id)).toEqual([done])
    expect(registry.get(open)?.state).toBe('sent')
  })

  it('drops everything when the session is replaced', () => {
    const { registry } = withSent()
    registry.clear()

    expect(registry.size).toBe(0)
    expect(registry.byMessage(100n)).toBeUndefined()
  })

  it('ignores an answer for a message it never placed', () => {
    // Nothing inbound can create a request. An identifier the record does not
    // hold is reported, never recorded.
    const registry = new RequestRegistry()

    expect(registry.complete(999n)).toBeUndefined()
    expect(registry.acknowledge(999n)).toBeUndefined()
    expect(registry.block(999n)).toBeUndefined()
    expect(registry.size).toBe(0)
  })
})
