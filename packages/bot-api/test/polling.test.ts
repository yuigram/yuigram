/**
 * Polling behaviour.
 *
 * Offset handling and failure recovery carry the risk. Advancing the offset
 * wrongly loses or replays updates, and a loop that exits on error takes a bot
 * down for a transient network blip.
 */

import { describe, expect, it, vi } from 'vitest'
import { createApi } from '../src/api.js'
import type { Update } from '../src/generated/types/index.js'
import type { ApiRequest, ApiResult, HttpClient } from '../src/http/client.js'
import { createPolling } from '../src/polling.js'
import { floodWait, mockTransport, ok } from '../src/testing/mock-transport.js'

/** Build a batch of updates with sequential ids. */
function batch(startId: number, count: number): Update[] {
  return Array.from(
    { length: count },
    (_, index) => ({ update_id: startId + index, message: { message_id: index } }) as Update,
  )
}

/** Yield long enough for the loop to reach its first request. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20))

/** Run a polling loop until it has served every scripted batch, then stop. */
async function pump(
  batches: Update[][],
  extra: Partial<Parameters<typeof createPolling>[0]> = {},
): Promise<{ received: Update[]; offsets: number[]; transport: ReturnType<typeof mockTransport> }> {
  const transport = mockTransport()
  const received: Update[] = []
  const offsets: number[] = []

  let call = 0
  transport.on('getUpdates', (request) => {
    offsets.push(request.params['offset'] as number)
    const next = batches[call++]
    return ok(next ?? [])
  })

  const polling = createPolling({
    api: createApi({ client: transport }),
    timeout: 0,
    idleDelay: 1,
    backoffBase: 1,
    onUpdate: (update) => {
      received.push(update)
    },
    ...extra,
  })

  await polling.start()
  await vi.waitFor(() => expect(call).toBeGreaterThan(batches.length))
  await polling.stop()

  return { received, offsets, transport }
}

describe('the loop', () => {
  it('delivers updates in order', async () => {
    const { received } = await pump([batch(10, 3)])
    expect(received.map((u) => u.update_id)).toEqual([10, 11, 12])
  })

  it('starts from offset 0 and advances past the last update', async () => {
    // Advancing too early loses updates; too late replays them.
    const { offsets } = await pump([batch(10, 3)])

    expect(offsets[0]).toBe(0)
    expect(offsets[1]).toBe(13)
  })

  it('keeps the offset when a batch is empty', async () => {
    const { offsets } = await pump([batch(5, 1), []])

    expect(offsets[1]).toBe(6)
    expect(offsets[2]).toBe(6)
  })

  it('reports itself as running only while started', async () => {
    const transport = mockTransport()
    transport.on('getUpdates', ok([]))

    const polling = createPolling({
      api: createApi({ client: transport }),
      timeout: 0,
      idleDelay: 1,
      onUpdate: () => {},
    })

    expect(polling.running).toBe(false)
    await polling.start()
    expect(polling.running).toBe(true)
    await polling.stop()
    expect(polling.running).toBe(false)
  })

  it('ignores a second start', async () => {
    const transport = mockTransport()
    transport.on('getUpdates', ok([]))

    const polling = createPolling({
      api: createApi({ client: transport }),
      timeout: 0,
      idleDelay: 1,
      onUpdate: () => {},
    })

    await polling.start()
    await polling.start()
    await polling.stop()

    expect(polling.running).toBe(false)
  })

  it('tolerates stop without start', async () => {
    const transport = mockTransport()
    const polling = createPolling({
      api: createApi({ client: transport }),
      onUpdate: () => {},
    })

    await expect(polling.stop()).resolves.toBeUndefined()
  })
})

describe('allowed updates', () => {
  it('passes the subscription set through', async () => {
    // Telegram does not deliver `message_reaction` or `chat_member` at all
    // unless they are requested, so this is a correctness setting rather than
    // a bandwidth one.
    const { transport } = await pump([[]], { allowedUpdates: ['message', 'chat_member'] })

    expect(transport.last('getUpdates')?.params['allowed_updates']).toEqual([
      'message',
      'chat_member',
    ])
  })

  it('omits the parameter when unset, so Telegram applies its default', async () => {
    const { transport } = await pump([[]])
    expect(transport.last('getUpdates')?.params['allowed_updates']).toBeUndefined()
  })
})

describe('failure recovery', () => {
  it('keeps polling after a transport failure', async () => {
    // A loop that exits here takes the bot down for a transient blip.
    const transport = mockTransport()
    const received: Update[] = []

    let call = 0
    transport.on('getUpdates', () => {
      call++
      if (call === 1) throw new Error('socket hang up')
      return ok(call === 2 ? batch(1, 1) : [])
    })

    const polling = createPolling({
      api: createApi({ client: transport }),
      timeout: 0,
      idleDelay: 1,
      backoffBase: 1,
      onUpdate: (update) => {
        received.push(update)
      },
    })

    await polling.start()
    await vi.waitFor(() => expect(received).toHaveLength(1))
    await polling.stop()

    expect(received[0]?.update_id).toBe(1)
  })

  it('reports recovered failures without stopping', async () => {
    const onError = vi.fn()
    const transport = mockTransport()

    let call = 0
    transport.on('getUpdates', () => {
      call++
      if (call <= 2) throw new Error('boom')
      return ok([])
    })

    const polling = createPolling({
      api: createApi({ client: transport }),
      timeout: 0,
      idleDelay: 1,
      backoffBase: 1,
      onUpdate: () => {},
      onError,
    })

    await polling.start()
    await vi.waitFor(() => expect(onError.mock.calls.length).toBeGreaterThanOrEqual(2))
    await polling.stop()

    expect(polling.running).toBe(false)
  })

  it('honours the wait a flood error states', async () => {
    const transport = mockTransport()
    transport.once('getUpdates', floodWait(0))
    transport.on('getUpdates', ok([]))

    const polling = createPolling({
      api: createApi({ client: transport }),
      timeout: 0,
      idleDelay: 1,
      backoffBase: 1,
      onUpdate: () => {},
    })

    await polling.start()
    await vi.waitFor(() => expect(transport.count('getUpdates')).toBeGreaterThan(1))
    await polling.stop()
  })

  it('does not let a handler error stop the loop', async () => {
    // The offset has already advanced, so delivery is at-most-once by design;
    // durability is the application's concern.
    const transport = mockTransport()
    const seen: number[] = []

    let call = 0
    transport.on('getUpdates', () => ok(call++ === 0 ? batch(1, 2) : []))

    const polling = createPolling({
      api: createApi({ client: transport }),
      timeout: 0,
      idleDelay: 1,
      backoffBase: 1,
      onUpdate: (update) => {
        seen.push(update.update_id)
        if (update.update_id === 1) throw new Error('handler failed')
      },
    })

    await polling.start()
    await vi.waitFor(() => expect(seen).toHaveLength(2))
    await polling.stop()

    expect(seen).toEqual([1, 2])
  })

  it('does not resend an update whose handler threw', async () => {
    const transport = mockTransport()
    const offsets: number[] = []

    let call = 0
    transport.on('getUpdates', (request) => {
      offsets.push(request.params['offset'] as number)
      return ok(call++ === 0 ? batch(7, 1) : [])
    })

    const polling = createPolling({
      api: createApi({ client: transport }),
      timeout: 0,
      idleDelay: 1,
      backoffBase: 1,
      onUpdate: () => {
        throw new Error('handler failed')
      },
    })

    await polling.start()
    await vi.waitFor(() => expect(offsets.length).toBeGreaterThan(1))
    await polling.stop()

    expect(offsets[1]).toBe(8)
  })
})

describe('dropPending', () => {
  it('skips updates queued before startup', async () => {
    const transport = mockTransport()
    const received: Update[] = []

    transport.once('getUpdates', ok(batch(100, 1)))
    transport.on('getUpdates', ok([]))

    const polling = createPolling({
      api: createApi({ client: transport }),
      timeout: 0,
      idleDelay: 1,
      dropPending: true,
      onUpdate: (update) => {
        received.push(update)
      },
    })

    await polling.start()
    await vi.waitFor(() => expect(transport.count('getUpdates')).toBeGreaterThan(1))
    await polling.stop()

    // The drain request itself must not be delivered as an update.
    expect(received).toHaveLength(0)
    expect(transport.calls[0]?.params['offset']).toBe(-1)
    expect(transport.calls[1]?.params['offset']).toBe(101)
  })
})

describe('shutdown latency', () => {
  it('cancels the in-flight long poll instead of waiting it out', async () => {
    // The default long poll holds a request open for 30 seconds. A stop that
    // waits for it exceeds the grace period most process managers allow, and
    // the container is killed rather than stopped.
    let aborted = false

    const client: HttpClient = {
      async call<T>(request: ApiRequest): Promise<ApiResult<T>> {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 30_000)
          request.signal?.addEventListener('abort', () => {
            aborted = true
            clearTimeout(timer)
            resolve()
          })
        })
        return { status: 200, body: { ok: true, result: [] as unknown as T } }
      },
    }

    const polling = createPolling({ api: createApi({ client }), onUpdate: () => {} })
    await polling.start()
    await tick()

    const began = Date.now()
    await polling.stop()

    expect(aborted).toBe(true)
    expect(Date.now() - began).toBeLessThan(1000)
  })

  it('does not report the shutdown abort as a polling failure', async () => {
    const errors: unknown[] = []

    const client: HttpClient = {
      async call<T>(request: ApiRequest): Promise<ApiResult<T>> {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 30_000)
          request.signal?.addEventListener('abort', () => {
            clearTimeout(timer)
            resolve()
          })
        })
        return { status: 200, body: { ok: true, result: [] as unknown as T } }
      },
    }

    const polling = createPolling({
      api: createApi({ client }),
      onUpdate: () => {},
      onError: (error) => errors.push(error),
    })
    await polling.start()
    await tick()
    await polling.stop()

    expect(errors).toEqual([])
  })
})

describe('unrecoverable errors', () => {
  const failWith = (code: number, description: string): HttpClient => ({
    async call<T>(): Promise<ApiResult<T>> {
      return { status: code, body: { ok: false, error_code: code, description } }
    },
  })

  it('stops on an invalid token rather than retrying forever', async () => {
    // 401 will not become valid by waiting. Retrying is an infinite loop
    // against an endpoint that has already given its final answer.
    let attempts = 0
    const inner = failWith(401, 'Unauthorized')
    const client: HttpClient = {
      call: async (request) => {
        attempts += 1
        return inner.call(request)
      },
    }

    const fatal: unknown[] = []
    const polling = createPolling({
      api: createApi({ client }),
      onUpdate: () => {},
      onFatal: (error) => fatal.push(error),
      backoffBase: 5,
    })

    await polling.start()
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(attempts).toBe(1)
    expect(polling.running).toBe(false)
    expect(fatal).toHaveLength(1)
  })

  it('stops on a conflicting getUpdates consumer', async () => {
    // Two instances polling one token steal updates from each other. Stopping
    // leaves one working bot; retrying leaves two broken ones.
    const fatal: unknown[] = []
    const polling = createPolling({
      api: createApi({ client: failWith(409, 'Conflict: terminated by other getUpdates request') }),
      onUpdate: () => {},
      onFatal: (error) => fatal.push(error),
      backoffBase: 5,
    })

    await polling.start()
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(polling.running).toBe(false)
    expect(fatal).toHaveLength(1)
  })

  it('keeps retrying a server error', async () => {
    // 5xx is Telegram's problem and usually transient.
    let attempts = 0
    const client: HttpClient = {
      async call<T>(): Promise<ApiResult<T>> {
        attempts += 1
        return { status: 500, body: { ok: false, error_code: 500, description: 'Internal' } }
      },
    }

    const polling = createPolling({
      api: createApi({ client }),
      onUpdate: () => {},
      backoffBase: 5,
    })

    await polling.start()
    await new Promise((resolve) => setTimeout(resolve, 60))
    const seen = attempts
    await polling.stop()

    expect(seen).toBeGreaterThan(1)
  })

  it('widens the delay on a repeated non-retryable failure', async () => {
    // Counting only retryable failures left a permanent 4xx retrying at the
    // base delay forever, which is the one behaviour backoff exists to avoid.
    const at: number[] = []
    const client: HttpClient = {
      async call<T>(): Promise<ApiResult<T>> {
        at.push(Date.now())
        return { status: 400, body: { ok: false, error_code: 400, description: 'Bad Request' } }
      },
    }

    const polling = createPolling({
      api: createApi({ client }),
      onUpdate: () => {},
      backoffBase: 10,
    })

    await polling.start()
    await new Promise((resolve) => setTimeout(resolve, 150))
    await polling.stop()

    expect(at.length).toBeGreaterThanOrEqual(3)
    const first = (at[1] ?? 0) - (at[0] ?? 0)
    const later = (at[at.length - 1] ?? 0) - (at[at.length - 2] ?? 0)
    expect(later).toBeGreaterThan(first)
  })
})

describe('request budget', () => {
  it('gives the request more time than the hold it asks for', async () => {
    // The default hold is 30 seconds and the transport's default request
    // timeout was also 30 seconds, so a healthy empty long poll aborted on its
    // own timeout about as often as it returned - a working bot reporting
    // constant failures.
    let seen: ApiRequest | undefined

    const client: HttpClient = {
      async call<T>(request: ApiRequest): Promise<ApiResult<T>> {
        seen ??= request
        // Stop after the first call so the loop cannot spin during the test.
        return { status: 200, body: { ok: true, result: [] as unknown as T } }
      },
    }

    const polling = createPolling({
      api: createApi({ client }),
      onUpdate: () => {},
      timeout: 30,
      idleDelay: 5,
    })

    await polling.start()
    await tick()
    await polling.stop()

    const held = (seen?.params['timeout'] as number) * 1000
    expect(seen?.timeout ?? 0).toBeGreaterThan(held)
  })
})

describe('pacing an unco-operative server', () => {
  it('does not spin when an empty batch returns immediately despite a long hold', async () => {
    // A local Bot API server or a proxy may ignore `timeout` and answer at
    // once. Pacing keyed on `timeout === 0` missed that case, and the loop
    // spun a CPU core while looking like it was long polling.
    let calls = 0

    const client: HttpClient = {
      async call<T>(): Promise<ApiResult<T>> {
        calls += 1
        return { status: 200, body: { ok: true, result: [] as unknown as T } }
      },
    }

    const polling = createPolling({
      api: createApi({ client }),
      onUpdate: () => {},
      timeout: 30,
      idleDelay: 20,
    })

    await polling.start()
    await new Promise((resolve) => setTimeout(resolve, 100))
    await polling.stop()

    // Unpaced this reaches thousands of iterations.
    expect(calls).toBeLessThan(20)
  })
})
