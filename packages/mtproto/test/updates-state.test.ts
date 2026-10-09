// SPDX-License-Identifier: MIT

/**
 * Deciding what to do with an update that has arrived.
 *
 * Three answers, and getting them wrong is the failure this subsystem exists to
 * avoid: applying something twice reports it twice, stepping over something
 * missing loses it silently, and treating a reorder as a loss spends a
 * round trip on nothing.
 *
 * The server driving these is the package's own, which keeps the sequences a
 * real one keeps — so what a case asserts about a gap is a gap the server
 * actually produced rather than one written into a fixture.
 */

import { describe, expect, it } from 'vitest'
import { UpdateState } from '../src/updates/state.js'
import { UpdateServer } from './server/updates.js'

/** Read the sequence numbers an update carries. */
function at(update: Record<string, unknown>): { pts: number; count: number } {
  return { pts: update['pts'] as number, count: update['pts_count'] as number }
}

describe('following the common sequence', () => {
  it('applies the update that comes next', () => {
    const server = new UpdateServer()
    const state = new UpdateState({ pts: server.pts })
    const update = server.message(1)

    expect(state.judge({ box: 'common', ...at(update) })).toEqual({ kind: 'apply' })
  })

  it('moves on to exactly where the update arrived', () => {
    const server = new UpdateServer()
    const state = new UpdateState({ pts: server.pts })
    const update = server.message(1)

    state.advance({ box: 'common', pts: at(update).pts })

    expect(state.pts).toBe(server.pts)
  })

  it('recognises one it has already applied', () => {
    const server = new UpdateServer()
    const state = new UpdateState({ pts: server.pts })
    const update = server.message(1)
    state.advance({ box: 'common', pts: at(update).pts })

    // The server resending what it already sent must not move anything: the
    // sequence is a count of what happened, not of what arrived.
    expect(state.judge({ box: 'common', ...at(update) })).toEqual({ kind: 'seen' })
  })

  it('notices one that arrived with something missing in front of it', () => {
    const server = new UpdateServer()
    const state = new UpdateState({ pts: server.pts })
    server.message(1)
    const second = server.message(2)

    // Stepping over the first would leave nothing to notice it by, ever.
    expect(state.judge({ box: 'common', ...at(second) })).toEqual({ kind: 'gap' })
  })

  it('does not move when something is missing', () => {
    const server = new UpdateServer()
    const state = new UpdateState({ pts: server.pts })
    const before = state.pts
    server.message(1)
    const second = server.message(2)

    expect(state.judge({ box: 'common', ...at(second) })).toEqual({ kind: 'gap' })
    expect(state.pts).toBe(before)
  })

  it('accounts for an update that consumed more than one step', () => {
    const server = new UpdateServer()
    const state = new UpdateState({ pts: server.pts })
    const update = server.message(1, { count: 3 })

    // A deletion removes several at once and says so. Counting it as one leaves
    // the client two behind and gapping on everything after it.
    expect(state.judge({ box: 'common', ...at(update) })).toEqual({ kind: 'apply' })
  })

  it('gaps when a multi-step update would step over something', () => {
    const server = new UpdateServer()
    const state = new UpdateState({ pts: server.pts })
    server.message(1)
    const second = server.message(2, { count: 2 })

    expect(state.judge({ box: 'common', ...at(second) })).toEqual({ kind: 'gap' })
  })

  it('follows a long run in order without ever gapping', () => {
    const server = new UpdateServer()
    const state = new UpdateState({ pts: server.pts })

    for (let id = 1; id <= 50; id += 1) {
      const update = server.message(id)
      expect(state.judge({ box: 'common', ...at(update) }), `message ${id}`).toEqual({
        kind: 'apply',
      })
      state.advance({ box: 'common', pts: at(update).pts })
    }

    expect(state.pts).toBe(server.pts)
  })
})

describe('following a channel', () => {
  const CHANNEL = 777n

  it('takes the first update as the place to start', () => {
    const server = new UpdateServer()
    const state = new UpdateState()
    const update = server.channelMessage(CHANNEL, 1)

    // There is nothing behind a channel's first update that could have been
    // missed, so it is a beginning rather than a gap.
    expect(state.judge({ box: 'channel', channelId: CHANNEL, ...at(update) })).toEqual({
      kind: 'apply',
    })
  })

  it('keeps a sequence of its own', () => {
    const server = new UpdateServer()
    const state = new UpdateState()

    const first = server.channelMessage(CHANNEL, 1)
    state.advance({ box: 'channel', channelId: CHANNEL, pts: at(first).pts })
    const common = server.message(1)
    state.advance({ box: 'common', pts: at(common).pts })

    // The common box moving does not move a channel, and a client that shares
    // one count between them gaps on whichever moves second.
    expect(state.channelPts(CHANNEL)).toBe(server.channelPts(CHANNEL))
    expect(state.pts).toBe(server.pts)
  })

  it('does not confuse one channel with another', () => {
    const server = new UpdateServer()
    const state = new UpdateState()
    const other = 888n

    const first = server.channelMessage(CHANNEL, 1)
    state.advance({ box: 'channel', channelId: CHANNEL, pts: at(first).pts })
    server.channelMessage(CHANNEL, 2)
    const third = server.channelMessage(CHANNEL, 3)

    // A gap in one channel says nothing about another.
    expect(state.judge({ box: 'channel', channelId: CHANNEL, ...at(third) })).toEqual({
      kind: 'gap',
    })
    const elsewhere = server.channelMessage(other, 1)
    expect(state.judge({ box: 'channel', channelId: other, ...at(elsewhere) })).toEqual({
      kind: 'apply',
    })
  })

  it('starts a fresh sequence once it has been forgotten', () => {
    const server = new UpdateServer()
    const state = new UpdateState()
    const first = server.channelMessage(CHANNEL, 1)
    state.advance({ box: 'channel', channelId: CHANNEL, pts: at(first).pts })
    server.channelMessage(CHANNEL, 2)

    state.forgetChannel(CHANNEL)

    const third = server.channelMessage(CHANNEL, 3)
    expect(state.judge({ box: 'channel', channelId: CHANNEL, ...at(third) })).toEqual({
      kind: 'apply',
    })
  })

  it('needs to be told which channel it is about', () => {
    const state = new UpdateState()

    expect(() => state.judge({ box: 'channel', pts: 2, count: 1 })).toThrow(/must name the channel/)
  })
})

describe('following the secret sequence', () => {
  it('behaves as a box whose updates always consume one step', () => {
    const state = new UpdateState({ qts: 5 })

    expect(state.judge({ box: 'secret', pts: 6, count: 1 })).toEqual({ kind: 'apply' })
    expect(state.judge({ box: 'secret', pts: 5, count: 1 })).toEqual({ kind: 'seen' })
    expect(state.judge({ box: 'secret', pts: 8, count: 1 })).toEqual({ kind: 'gap' })
  })

  it('moves independently of everything else', () => {
    const state = new UpdateState({ pts: 10, qts: 5 })

    state.advance({ box: 'secret', pts: 6 })

    expect(state.qts).toBe(6)
    expect(state.pts).toBe(10)
  })
})

describe('following the containers themselves', () => {
  it('applies one that claims no place in the sequence', () => {
    const state = new UpdateState({ seq: 40 })

    // The protocol uses a start of zero for updates whose order does not
    // matter, and holding those back would stall on something unordered.
    expect(state.judgeContainer({ seqStart: 0, seq: 0 })).toEqual({ kind: 'apply' })
    expect(state.seq).toBe(40)
  })

  it('applies the one that comes next', () => {
    const server = new UpdateServer()
    const state = new UpdateState()
    const container = server.container([server.message(1)]) as Record<string, unknown>

    expect(
      state.judgeContainer({
        seqStart: container['seq'] as number,
        seq: container['seq'] as number,
      }),
    ).toEqual({ kind: 'apply' })
  })

  it('counts containers rather than the updates inside them', () => {
    const server = new UpdateServer()
    const state = new UpdateState()

    const first = server.container([server.message(1), server.message(2)]) as Record<
      string,
      unknown
    >
    state.advanceContainer({ seq: first['seq'] as number })
    const second = server.container([server.message(3)]) as Record<string, unknown>

    // Two updates travelled in the first container; the sequence moved by one.
    // A client counting updates would be a step ahead and gap immediately.
    expect(state.seq).toBe(1)
    expect(
      state.judgeContainer({
        seqStart: second['seq'] as number,
        seq: second['seq'] as number,
      }),
    ).toEqual({ kind: 'apply' })
  })

  it('recognises one it has already applied', () => {
    const state = new UpdateState({ seq: 5 })

    expect(state.judgeContainer({ seqStart: 5, seq: 5 })).toEqual({ kind: 'seen' })
    expect(state.judgeContainer({ seqStart: 3, seq: 3 })).toEqual({ kind: 'seen' })
  })

  it('notices a container that skipped one', () => {
    const state = new UpdateState({ seq: 5 })

    expect(state.judgeContainer({ seqStart: 7, seq: 7 })).toEqual({ kind: 'gap' })
  })

  it('takes a combined container as the span it says it covers', () => {
    const server = new UpdateServer()
    const state = new UpdateState()
    const combined = server.container([server.message(1)], {
      seqStart: 1,
      seq: 3,
    }) as Record<string, unknown>

    expect(combined['_']).toBe('updatesCombined')
    expect(state.judgeContainer({ seqStart: 1, seq: 3 })).toEqual({ kind: 'apply' })

    state.advanceContainer({ seq: 3 })

    // The span ends where it says, not where it started.
    expect(state.seq).toBe(3)
  })

  it('carries the clock forward with the sequence', () => {
    const state = new UpdateState({ date: 100 })

    state.advanceContainer({ seq: 1, date: 200 })

    expect(state.date).toBe(200)
  })

  it('never moves the clock backwards', () => {
    const state = new UpdateState({ date: 200 })

    state.advanceContainer({ seq: 2, date: 100 })

    expect(state.date).toBe(200)
  })
})

describe('taking the server at its word', () => {
  it('sets a box to where a catch-up says it is', () => {
    const state = new UpdateState({ pts: 5 })

    // What a catch-up reports is the truth by definition — the server saying
    // where the box stands, not an update claiming a position in it.
    state.reset({ box: 'common', pts: 2 })

    expect(state.pts).toBe(2)
  })

  it('sets a channel the same way', () => {
    const state = new UpdateState()

    state.reset({ box: 'channel', channelId: 5n, pts: 42 })

    expect(state.channelPts(5n)).toBe(42)
  })

  it('is not how an ordinary update moves a box', () => {
    const state = new UpdateState({ pts: 5 })

    state.advance({ box: 'common', pts: 2 })

    // An update that claims to be behind is stale, and letting it drag the box
    // back would replay everything between.
    expect(state.pts).toBe(5)
  })
})

describe('not handing the same thing out twice', () => {
  it('answers no the first time and yes after', () => {
    const state = new UpdateState()

    expect(state.seen('message:1')).toBe(false)
    expect(state.seen('message:1')).toBe(true)
  })

  it('tells one thing from another', () => {
    const state = new UpdateState()
    state.seen('message:1')

    expect(state.seen('message:2')).toBe(false)
  })

  it('forgets the oldest once it has remembered enough', () => {
    const state = new UpdateState({}, { memory: 3 })

    for (const id of ['a', 'b', 'c', 'd']) state.seen(id)

    // Bounded on purpose: what falls out is old enough that no catch-up will
    // mention it again, and remembering everything is not an option.
    expect(state.remembered).toBe(3)
    expect(state.seen('a')).toBe(false)
    expect(state.seen('d')).toBe(true)
  })
})

describe('resuming where a client left off', () => {
  it('describes every sequence it was following', () => {
    const state = new UpdateState({ pts: 10, qts: 3, seq: 7, date: 500 })
    state.advance({ box: 'channel', channelId: 5n, pts: 20 })

    const snapshot = state.snapshot()

    expect(snapshot).toMatchObject({ pts: 10, qts: 3, seq: 7, date: 500 })
    expect(snapshot.channels.get('5')).toBe(20)
  })

  it('starts again exactly where the snapshot said', () => {
    const original = new UpdateState({ pts: 10, seq: 7 })
    original.advance({ box: 'channel', channelId: 5n, pts: 20 })

    const resumed = new UpdateState(original.snapshot())

    expect(resumed.snapshot()).toEqual(original.snapshot())
    expect(resumed.judge({ box: 'channel', channelId: 5n, pts: 21, count: 1 })).toEqual({
      kind: 'apply',
    })
  })

  it('hands back a snapshot that cannot be changed underneath it', () => {
    const state = new UpdateState({ pts: 1 })
    const snapshot = state.snapshot()

    state.advance({ box: 'channel', channelId: 9n, pts: 4 })

    expect(snapshot.channels.has('9')).toBe(false)
  })
})
