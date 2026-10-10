// SPDX-License-Identifier: MIT

/**
 * The answers to this account's own calls, and the sequences they move.
 *
 * Driven by the package's update server, which keeps the sequences a real one
 * keeps: a send takes a step of its box, the history records the message and
 * the key the send drew, and a catch-up returns both. So what a case shows is
 * what happens against a server that tells the truth — about the steps an
 * answer took, and about what a catch-up from behind them hands back.
 *
 * The reorder window and the scheduler are supplied, so waiting is a step a
 * case takes rather than a delay it endures.
 */

import { describe, expect, it } from 'vitest'
import { peerStore } from '../src/storage/peers.js'
import type { TlValue } from '../src/tl/index.js'
import {
  answeredPosition,
  carriedUpdates,
  ownEffects,
  positionChannel,
  scopeOf,
  widenedBy,
} from '../src/updates/local.js'
import { openUpdates } from '../src/updates/manager.js'
import { UpdateState, type UpdateStateSnapshot } from '../src/updates/state.js'
import { UpdateServer } from './server/updates.js'

const CHANNEL = 777n
const USER = { _: 'inputPeerUser', user_id: 5n, access_hash: 1n }
const OTHER = { _: 'inputPeerUser', user_id: 6n, access_hash: 2n }
const IN_CHANNEL = { _: 'inputPeerChannel', channel_id: CHANNEL, access_hash: 0x2222n }

/** The call a send makes, to `peer`, with the key it drew. */
const send = (peer: TlValue, randomId: bigint): TlValue => ({
  _: 'messages.sendMessage',
  peer,
  message: 'hello',
  random_id: randomId,
})

/** The manager, its server, and the levers a case pulls. */
function client(
  options: { resume?: UpdateStateSnapshot; memory?: number; server?: UpdateServer } = {},
) {
  const server = options.server ?? new UpdateServer()
  if (options.server === undefined) server.addChannel(CHANNEL)

  const values = new Map<string, unknown>()
  const peers = peerStore({
    get: async (key: string) => values.get(key),
    set: async (key: string, value: unknown) => {
      values.set(key, value)
    },
    delete: async (key: string) => {
      values.delete(key)
    },
  })

  const state = new UpdateState(
    options.resume ?? {
      pts: server.pts,
      date: 0,
      channels: new Map([[CHANNEL.toString(), server.channelPts(CHANNEL)]]),
    },
    options.memory === undefined ? {} : { memory: options.memory },
  )
  const dispatched: TlValue[] = []
  const timers: Array<{ run: () => void; cancelled: boolean; fired: boolean }> = []

  const updates = openUpdates({
    state,
    peers,
    invoke: async (query) => server.invoke(query),
    onUpdate: (update) => dispatched.push(update),
    reorderWindow: 500,
    self: () => 1n,
    schedule: (run) => {
      const entry = { run, cancelled: false, fired: false }
      timers.push(entry)

      return () => {
        entry.cancelled = true
      }
    },
  })

  return {
    server,
    state,
    updates,
    dispatched,
    /** Everything dispatched that carried a message, as its identifier. */
    ids: () =>
      dispatched
        .map((update) => (update['message'] as TlValue | undefined)?.['id'] as number | undefined)
        .filter((id) => id !== undefined),
    /** Every catch-up asked for, by method. */
    asked: () => server.asked.map((query) => query._),
    /** Whether a reorder window is running. */
    waiting: () => timers.some((timer) => !timer.cancelled && !timer.fired),
    /** Let every wait that is running elapse. */
    async elapse() {
      const armed = timers.filter((timer) => !timer.cancelled && !timer.fired)
      if (armed.length === 0) throw new Error('no wait is running')
      for (const timer of armed) {
        timer.fired = true
        timer.run()
      }
      await settle()
    },
  }
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('a send and the update after it', () => {
  it('takes a short answer into the common box, so the next update is not a gap', async () => {
    const c = client()
    const sent = c.server.sent(1, { randomId: 11n })

    expect(await c.updates.absorb(sent.answer, send(USER, 11n))).toBe(true)
    await c.updates.feed(c.server.container([c.server.message(2)]))

    expect(c.asked()).toEqual([])
    expect(c.waiting()).toBe(false)
    expect(c.ids()).toEqual([2])
    expect(c.state.pts).toBe(c.server.pts)
  })

  it('takes a channel send into the channel’s own box and leaves the common box alone', async () => {
    const c = client()
    const commonBefore = c.state.pts
    const sent = c.server.sent(1, { randomId: 12n, channelId: CHANNEL })

    await c.updates.absorb(sent.answer, send(IN_CHANNEL, 12n))
    await c.updates.feed(c.server.short(c.server.channelMessage(CHANNEL, 2)))

    expect(c.asked()).toEqual([])
    expect(c.ids()).toEqual([2])
    expect(c.state.channelPts(CHANNEL)).toBe(c.server.channelPts(CHANNEL))
    expect(c.state.pts).toBe(commonBefore)
  })

  it('does not hand the caller its own message, nor the match that named it', async () => {
    const c = client()
    const sent = c.server.sent(1, { randomId: 13n, channelId: CHANNEL })

    await c.updates.absorb(sent.answer, send(IN_CHANNEL, 13n))

    expect(c.dispatched).toEqual([])
  })
})

describe('answers and the stream, in either order', () => {
  it('hands nothing out when the stream repeats a send already answered', async () => {
    const c = client()
    const sent = c.server.sent(1, { randomId: 21n })

    await c.updates.absorb(sent.answer, send(USER, 21n))
    await c.updates.feed(sent.push())

    expect(c.dispatched).toEqual([])
    expect(c.state.pts).toBe(c.server.pts)
  })

  it('holds a send the stream reports before its answer, and drops it when the answer comes', async () => {
    const c = client()
    const query = send(USER, 22n)
    const expected = c.updates.expect(query)
    const sent = c.server.sent(1, { randomId: 22n })

    await c.updates.feed(sent.push())
    // Counted already: the step is the stream's to report, whoever made it.
    expect(c.state.pts).toBe(c.server.pts)
    expect(c.dispatched).toEqual([])

    await c.updates.absorb(sent.answer, query)
    expected?.settle(true)
    await c.updates.feed(c.server.container([c.server.message(2)]))

    expect(c.ids()).toEqual([2])
    expect(c.asked()).toEqual([])
  })

  it('hands out what the stream reported of a send whose call then failed, once', async () => {
    const c = client()
    const expected = c.updates.expect(send(USER, 23n))
    const sent = c.server.sent(1, { randomId: 23n })

    await c.updates.feed(sent.push())
    expected?.settle(false)
    expected?.settle(false)

    // The stream is the only report there is now, so it is delivered.
    expect(c.dispatched.map((update) => update._)).toEqual(['updateMessageID', 'updateNewMessage'])
  })

  it('applies an update that came before the answer it follows, without asking', async () => {
    const c = client()
    const sent = c.server.sent(1, { randomId: 24n })
    const next = c.server.message(2)

    // The stream is ahead of the answer: step 12 arrives while 11 is missing.
    await c.updates.feed(c.server.short(next))
    expect(c.waiting()).toBe(true)

    await c.updates.absorb(sent.answer, send(USER, 24n))

    // What was missing arrived inside the window, so nothing is asked.
    expect(c.waiting()).toBe(false)
    expect(c.asked()).toEqual([])
    expect(c.ids()).toEqual([2])
    expect(c.state.pts).toBe(c.server.pts)
  })

  it('applies an answer that came before the update it follows, without asking', async () => {
    const c = client()
    const before = c.server.message(1)
    const sent = c.server.sent(2, { randomId: 25n })

    await c.updates.absorb(sent.answer, send(USER, 25n))
    expect(c.waiting()).toBe(true)
    await c.updates.feed(c.server.short(before))

    expect(c.waiting()).toBe(false)
    expect(c.asked()).toEqual([])
    expect(c.ids()).toEqual([1])
    expect(c.state.pts).toBe(c.server.pts)
  })

  it('withholds what an answer reports about what the call acted on, in a sequence or not', async () => {
    // A reaction belongs to no sequence, so it has no identity to remember:
    // only being the call's own keeps it from the handlers.
    const c = client()
    const reactions = {
      _: 'updateMessageReactions',
      peer: { _: 'peerUser', user_id: 5n },
      msg_id: 4,
      reactions: { _: 'messageReactions', results: [] },
    }
    const elsewhere = { ...reactions, msg_id: 5 }

    await c.updates.absorb(
      { _: 'updates', updates: [reactions, elsewhere], users: [], chats: [], date: 1, seq: 0 },
      { _: 'messages.sendReaction', peer: USER, msg_id: 4, reaction: [] },
    )

    expect(c.dispatched).toEqual([elsewhere])
  })

  it('changes nothing when the same answer is taken twice', async () => {
    const c = client()
    const sent = c.server.sent(1, { randomId: 26n })

    await c.updates.absorb(sent.answer, send(USER, 26n))
    await c.updates.absorb(sent.answer, send(USER, 26n))

    expect(c.dispatched).toEqual([])
    expect(c.state.pts).toBe(c.server.pts)
  })

  it('hands out what an answer carries about anything the call did not name', async () => {
    const c = client()
    const sent = c.server.sent(1, { randomId: 27n, channelId: CHANNEL })
    const elsewhere = c.server.message(2)
    const status = { _: 'updateUserStatus', user_id: 6n, status: { _: 'userStatusRecently' } }
    const answer = {
      ...sent.answer,
      updates: [...(sent.answer['updates'] as TlValue[]), elsewhere, status],
    }

    await c.updates.absorb(answer, send(IN_CHANNEL, 27n))

    expect(c.dispatched).toEqual([elsewhere, status])
    expect(c.state.pts).toBe(c.server.pts)
  })
})

describe('a gap that is real', () => {
  it('is caught up on, and only the send around it is withheld', async () => {
    const c = client()
    c.server.message(1)
    const sent = c.server.sent(2, { randomId: 31n })

    await c.updates.absorb(sent.answer, send(USER, 31n))
    expect(c.waiting()).toBe(true)
    await c.elapse()

    expect(c.asked()).toEqual(['updates.getDifference'])
    expect(c.ids()).toEqual([1])
    expect(c.state.pts).toBe(c.server.pts)
  })

  it('withholds the catch-up’s report of a deletion this account made', async () => {
    const c = client()
    c.server.message(1)
    const removal = c.server.removed([7])

    await c.updates.absorb(removal.answer, { _: 'messages.deleteMessages', id: [7], revoke: true })
    await c.elapse()

    expect(c.ids()).toEqual([1])
    expect(c.dispatched.some((update) => update._ === 'updateDeleteMessages')).toBe(false)
    expect(c.state.pts).toBe(c.server.pts)
  })
})

describe('an answer that was lost', () => {
  it('leaves the send to the catch-up, which reports it once', async () => {
    const c = client()
    const expected = c.updates.expect(send(USER, 41n))
    c.server.sent(1, { randomId: 41n })
    // The call failed: whatever it did, its caller was never told.
    expected?.settle(false)

    await c.updates.feed(c.server.short(c.server.message(2)))
    await c.elapse()

    expect(c.asked()).toEqual(['updates.getDifference'])
    expect(c.ids()).toEqual([1, 2])
    expect(c.state.pts).toBe(c.server.pts)
  })

  it('holds what a catch-up reports of a call still awaiting its answer, until it ends', async () => {
    const answered = client()
    const failed = client()

    for (const [c, outcome] of [
      [answered, true],
      [failed, false],
    ] as const) {
      const expected = c.updates.expect(send(USER, 42n))
      c.server.sent(1, { randomId: 42n })
      await c.updates.feed(c.server.short(c.server.message(2)))
      await c.elapse()

      expect(c.ids()).toEqual([2])
      expected?.settle(outcome)
    }

    expect(answered.ids()).toEqual([2])
    expect(failed.ids()).toEqual([2, 1])
  })
})

describe('starting again', () => {
  it('resumes from a position written after an answer without asking', async () => {
    const first = client()
    const sent = first.server.sent(1, { randomId: 51n })
    await first.updates.absorb(sent.answer, send(USER, 51n))

    const second = client({ resume: first.state.snapshot(), server: first.server })
    await second.updates.feed(first.server.short(first.server.message(2)))

    expect(first.server.asked).toEqual([])
    expect(second.ids()).toEqual([2])
  })

  it('remembers nothing across a restart: from a position written before the answer, the send is reported once', async () => {
    // What is withheld is held in memory only. A run that stopped between an
    // answer and writing its position down resumes behind the send, and the
    // catch-up that follows reports it — once, as news: at least once, not
    // exactly once.
    const first = client()
    const written = first.state.snapshot()
    const sent = first.server.sent(1, { randomId: 52n })
    await first.updates.absorb(sent.answer, send(USER, 52n))
    expect(first.dispatched).toEqual([])

    const second = client({ resume: written, server: first.server })
    await second.updates.feed(first.server.short(first.server.message(2)))
    await second.elapse()

    expect(second.ids()).toEqual([1, 2])
    expect(second.ids().filter((id) => id === 1)).toHaveLength(1)
  })
})

describe('channel boxes', () => {
  it('applies a channel deletion’s position to the channel, not to the common box', async () => {
    const c = client()
    const commonBefore = c.state.pts
    const channelBefore = c.state.channelPts(CHANNEL) as number

    await c.updates.absorb(
      { _: 'messages.affectedMessages', pts: channelBefore + 2, pts_count: 2 },
      {
        _: 'channels.deleteMessages',
        channel: { _: 'inputChannel', channel_id: CHANNEL, access_hash: 1n },
        id: [3, 4],
      },
    )

    expect(c.state.channelPts(CHANNEL)).toBe(channelBefore + 2)
    expect(c.state.pts).toBe(commonBefore)
    expect(c.waiting()).toBe(false)
  })

  it('applies a history operation in a channel to the channel, and one in a chat to the common box', async () => {
    const c = client()
    const commonBefore = c.state.pts
    const channelBefore = c.state.channelPts(CHANNEL) as number

    await c.updates.absorb(
      { _: 'messages.affectedHistory', pts: channelBefore + 3, pts_count: 3, offset: 0 },
      { _: 'messages.readReactions', peer: IN_CHANNEL },
    )
    await c.updates.absorb(
      { _: 'messages.affectedHistory', pts: commonBefore + 1, pts_count: 1, offset: 0 },
      { _: 'messages.readReactions', peer: USER },
    )

    expect(c.state.channelPts(CHANNEL)).toBe(channelBefore + 3)
    expect(c.state.pts).toBe(commonBefore + 1)
    expect(c.dispatched).toEqual([])
  })
})

describe('what is remembered, and for how long', () => {
  it('remembers no more than its bound, forgetting the oldest first', async () => {
    const c = client({ memory: 4 })
    const sent = c.server.sent(1, { randomId: 61n })
    await c.updates.absorb(sent.answer, send(USER, 61n))

    for (let id = 2; id <= 5; id += 1) {
      await c.updates.feed(c.server.short(c.server.message(id)))
    }

    expect(c.state.remembered).toBe(4)
    // The send's identities were the oldest, and went first.
    expect(c.state.known('common:new:1')).toBe(false)
    expect(c.state.known('common:new:5')).toBe(true)
  })

  it('keeps a bounded number of calls awaiting answers, handing out what the oldest held', async () => {
    const c = client()
    c.updates.expect(send(USER, 1000n))
    const first = c.server.sent(1, { randomId: 1000n })
    await c.updates.feed(first.push())
    expect(c.dispatched).toEqual([])

    for (let key = 1001n; key <= 1256n; key += 1n) c.updates.expect(send(USER, key))

    expect(c.ids()).toEqual([1])
  })

  it('withholds a repeated match once the call it named is answered', async () => {
    const c = client()
    const query = send(USER, 62n)
    const expected = c.updates.expect(query)
    const sent = c.server.sent(1, { randomId: 62n })
    await c.updates.absorb(sent.answer, query)
    expected?.settle(true)

    await c.updates.feed({
      _: 'updateShort',
      update: { _: 'updateMessageID', id: 1, random_id: 62n },
      date: 0,
    })

    expect(c.dispatched).toEqual([])
  })

  it('forgets the calls awaiting answers when it closes', async () => {
    const c = client()
    const expected = c.updates.expect(send(USER, 63n))
    await c.updates.feed(c.server.sent(1, { randomId: 63n }).push())

    c.updates.close()
    expected?.settle(false)

    expect(c.dispatched).toEqual([])
  })
})

describe('telling one thing from another', () => {
  it('hands out every edit of a message it has handed out', async () => {
    const c = client()

    await c.updates.feed(c.server.short(c.server.message(1)))
    await c.updates.feed(c.server.short(c.server.edited(1)))
    await c.updates.feed(c.server.short(c.server.edited(1, { text: 'again' })))

    expect(c.dispatched.map((update) => update._)).toEqual([
      'updateNewMessage',
      'updateEditMessage',
      'updateEditMessage',
    ])
  })

  it('recognises an edit it handed out when a catch-up returns it', async () => {
    const c = client()
    const edit = c.server.edited(1)
    await c.updates.feed(c.server.short(edit))
    // A position from before the edit, as one written before it would be.
    c.state.reset({ box: 'common', pts: (edit['pts'] as number) - 1 })

    await c.updates.recover()

    expect(c.dispatched).toEqual([edit])
  })

  it('counts an incoming message in the short form, and hands it out once', async () => {
    const c = client()
    const full = c.server.message(1)
    const short = {
      _: 'updateShortMessage',
      id: 1,
      user_id: 9n,
      message: 'short',
      pts: full['pts'],
      pts_count: 1,
      date: 1,
    }

    await c.updates.feed(short)
    await c.updates.feed(c.server.short(c.server.message(2)))
    c.state.reset({ box: 'common', pts: (full['pts'] as number) - 1 })
    await c.updates.recover()

    expect(c.asked()).toEqual(['updates.getDifference'])
    expect(c.dispatched.map((update) => update._)).toEqual([
      'updateShortMessage',
      'updateNewMessage',
    ])
  })

  it('does not take a scheduled message for an ordinary one with the same number', async () => {
    const c = client()
    await c.updates.feed({
      _: 'updateNewScheduledMessage',
      message: {
        _: 'message',
        id: 3,
        peer_id: { _: 'peerUser', user_id: 5n },
        date: 1,
        message: 'later',
      },
    })
    await c.updates.feed(c.server.short(c.server.message(3)))

    expect(c.dispatched.map((update) => update._)).toEqual([
      'updateNewScheduledMessage',
      'updateNewMessage',
    ])
  })

  it('hands out what a read reports when the read names nothing it acted on', async () => {
    // A business connection is read, not changed, by this account: what the
    // answer describes is news, and reaches the handlers.
    const c = client()
    const connect = {
      _: 'updateBotBusinessConnect',
      connection: { _: 'botBusinessConnection' },
      qts: 0,
    }

    await c.updates.absorb(
      { _: 'updates', updates: [connect], users: [], chats: [], date: 1, seq: 0 },
      { _: 'account.getBotBusinessConnection', connection_id: 'abc' },
    )

    expect(c.dispatched).toEqual([connect])
  })

  it('takes nothing from a call made on behalf of a business connection', async () => {
    const c = client()
    const before = c.state.pts
    const sent = c.server.sent(1, { randomId: 71n })

    expect(
      await c.updates.absorb(sent.answer, {
        _: 'invokeWithBusinessConnection',
        connection_id: 'abc',
        query: send(USER, 71n),
      }),
    ).toBe(false)

    expect(c.state.pts).toBe(before)
    expect(c.dispatched).toEqual([])
  })
})

describe('what a call acted on', () => {
  it('reads the call inside its wrappers', () => {
    const scope = scopeOf({
      _: 'invokeWithLayer',
      layer: 229,
      query: { _: 'initConnection', query: send(USER, 5n) },
    })

    expect(scope.method).toBe('messages.sendMessage')
    expect([...scope.conversations]).toEqual(['user:5'])
    expect([...scope.randomIds]).toEqual([5n])
    expect(scope.delegated).toBe(false)
  })

  it('names conversations by every field a call names them with', () => {
    expect([
      ...scopeOf({ _: 'messages.editChatTitle', chat_id: 3n, title: 'x' }).conversations,
    ]).toEqual(['chat:3'])
    expect([
      ...scopeOf({ _: 'messages.sendMessage', peer: { _: 'inputPeerSelf' } }, 1n).conversations,
    ]).toEqual(['user:1'])
    expect([
      ...scopeOf({ _: 'messages.sendMessage', peer: { _: 'inputPeerSelf' } }).conversations,
    ]).toEqual([])
    expect([
      ...scopeOf({
        _: 'folders.editPeerFolders',
        folder_peers: [{ _: 'inputFolderPeer', peer: USER, folder_id: 1 }],
      }).conversations,
    ]).toEqual(['user:5'])
    expect([
      ...scopeOf({ _: 'chatlists.joinChatlistInvite', slug: 's', peers: [IN_CHANNEL, OTHER] })
        .conversations,
    ]).toEqual([`channel:${CHANNEL}`, 'user:6'])
  })

  it('reads the keys of an album, one per item', () => {
    const scope = scopeOf({
      _: 'messages.sendMultiMedia',
      peer: USER,
      multi_media: [
        { _: 'inputSingleMedia', random_id: 1n },
        { _: 'inputSingleMedia', random_id: 2n },
      ],
    })

    expect([...scope.randomIds]).toEqual([1n, 2n])
  })

  it('counts a message as the call’s only when Telegram matched it to the call’s key', () => {
    const mine = {
      _: 'updateNewMessage',
      message: { _: 'message', id: 1, out: true, peer_id: { _: 'peerUser', user_id: 5n } },
    }
    const another = {
      _: 'updateNewMessage',
      message: { _: 'message', id: 2, out: true, peer_id: { _: 'peerUser', user_id: 5n } },
    }
    const match = { _: 'updateMessageID', id: 1, random_id: 9n }

    const own = ownEffects([match, mine, another], scopeOf(send(USER, 9n)))

    expect([...own]).toEqual([match, mine])
  })

  it('counts an edit as the call’s only for the message the call named', () => {
    const edit = (id: number) => ({
      _: 'updateEditMessage',
      message: { _: 'message', id, peer_id: { _: 'peerUser', user_id: 5n } },
      pts: 1,
      pts_count: 1,
    })
    const named = edit(4)
    const other = edit(5)

    const own = ownEffects(
      [named, other],
      scopeOf({ _: 'messages.editMessage', peer: USER, id: 4 }),
    )

    expect([...own]).toEqual([named])
  })

  it('counts a service message in the conversation a keyless call named as the call’s', () => {
    const service = {
      _: 'updateNewChannelMessage',
      message: {
        _: 'messageService',
        id: 9,
        out: true,
        peer_id: { _: 'peerChannel', channel_id: CHANNEL },
      },
    }
    const incoming = {
      _: 'updateNewChannelMessage',
      message: { _: 'message', id: 10, peer_id: { _: 'peerChannel', channel_id: CHANNEL } },
    }
    const call = {
      _: 'channels.editTitle',
      channel: { _: 'inputChannel', channel_id: CHANNEL },
      title: 'x',
    }

    expect([...ownEffects([service, incoming], scopeOf(call))]).toEqual([service])
  })

  it('counts a common deletion as the call’s by the messages it named, never for a channel call', () => {
    const deletion = { _: 'updateDeleteMessages', messages: [3], pts: 1, pts_count: 1 }

    expect(ownEffects([deletion], scopeOf({ _: 'messages.deleteMessages', id: [3] })).size).toBe(1)
    expect(ownEffects([deletion], scopeOf({ _: 'messages.deleteMessages', id: [4] })).size).toBe(0)
    expect(
      ownEffects(
        [deletion],
        scopeOf({
          _: 'channels.deleteMessages',
          channel: { _: 'inputChannel', channel_id: CHANNEL },
          id: [3],
        }),
      ).size,
    ).toBe(0)
  })

  it('counts nothing about a poll’s running count, or about somebody else, as the call’s', () => {
    const poll = { _: 'updateMessagePoll', poll_id: 1n, results: { _: 'pollResults' } }
    const status = { _: 'updateUserStatus', user_id: 5n, status: { _: 'userStatusRecently' } }

    const call = { _: 'messages.sendVote', peer: USER, msg_id: 4, options: [] }

    expect(ownEffects([poll, status], scopeOf(call)).size).toBe(0)
  })

  it('takes the conversation a creating call made from its answer', () => {
    const created = {
      _: 'updates',
      updates: [
        {
          _: 'updateNewChannelMessage',
          message: {
            _: 'messageService',
            id: 1,
            out: true,
            peer_id: { _: 'peerChannel', channel_id: 900n },
          },
        },
      ],
      users: [],
      chats: [{ _: 'channel', id: 900n }],
      date: 1,
      seq: 0,
    }
    const scope = widenedBy(
      scopeOf({ _: 'channels.createChannel', title: 'x', about: '' }),
      created,
    )

    expect([...scope.conversations]).toEqual(['channel:900'])
    expect(ownEffects(created['updates'] as TlValue[], scope).size).toBe(1)
  })

  it('finds the updates an answer carries, wrapped or not', () => {
    const inner = { _: 'updates', updates: [], users: [], chats: [], date: 1, seq: 0 }

    expect(carriedUpdates(inner)).toBe(inner)
    expect(carriedUpdates({ _: 'payments.paymentResult', updates: inner })).toBe(inner)
    expect(
      carriedUpdates({ _: 'messages.invitedUsers', updates: inner, missing_invitees: [] }),
    ).toBe(inner)
    expect(carriedUpdates({ _: 'messages.chatInviteJoinResultOk', updates: inner })).toBe(inner)
    expect(carriedUpdates({ _: 'boolTrue' })).toBeUndefined()
  })

  it('places a position answer in the box of the conversation the call named', () => {
    expect(
      answeredPosition({ _: 'messages.affectedHistory', pts: 5, pts_count: 2, offset: 0 }),
    ).toEqual({
      pts: 5,
      count: 2,
    })
    expect(answeredPosition({ _: 'boolTrue' })).toBeUndefined()
    expect(positionChannel(scopeOf({ _: 'messages.unpinAllMessages', peer: IN_CHANNEL }))).toBe(
      CHANNEL,
    )
    expect(
      positionChannel(scopeOf({ _: 'messages.readHistory', peer: USER, max_id: 0 })),
    ).toBeUndefined()
    // Saved messages are this account's own, whichever conversation they came from.
    expect(
      positionChannel(scopeOf({ _: 'messages.deleteSavedHistory', peer: IN_CHANNEL, max_id: 0 })),
    ).toBeUndefined()
  })
})
