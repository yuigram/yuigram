/**
 * The worker subsystem in a real Node worker thread.
 *
 * Not a simulation: the host runs in a `worker_threads` worker, on its own
 * thread and event loop, and every message crosses a real port. The account in
 * the worker performs a real key exchange and real encrypted calls against the
 * datacenters that run beside it in that thread; this side holds nothing but
 * the port.
 *
 * What only a real worker can show is here — an update crossing from another
 * thread, and a worker that exits failing every call still waiting on it.
 */

import { MessageChannel, Worker } from 'node:worker_threads'
import { CancelledError, FloodError } from '@yuigram/core'
import { afterEach, describe, expect, it } from 'vitest'
import {
  type AttachedAccount,
  attachAccount,
  HostUnavailableError,
  workerEndpoint,
} from '../src/worker/index.js'

const running: { worker: Worker; control: import('node:worker_threads').MessagePort }[] = []

afterEach(async () => {
  for (const one of running.splice(0)) {
    one.control.close()
    await one.worker.terminate()
  }
})

/** Start a host in a new thread. */
function startHost() {
  const { port1: control, port2: remote } = new MessageChannel()
  const worker = new Worker(new URL('./support/worker-host.mjs', import.meta.url), {
    workerData: { control: remote },
    transferList: [remote],
  })
  running.push({ worker, control })

  const ask = <T>(message: object, answer: string): Promise<T> =>
    new Promise((resolve) => {
      const listener = (reply: { type: string }) => {
        if (reply.type !== answer && !(answer === 'pushed' && reply.type === 'not-pushed')) return
        control.off('message', listener)
        resolve(reply as T)
      }
      control.on('message', listener)
      control.postMessage(message)
    })

  return { worker, ask }
}

const settle = (ms = 30): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function until(condition: () => boolean, what: string, ms = 10_000): Promise<void> {
  const deadline = Date.now() + ms
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await settle(20)
  }
}

/** Push until a session exists to carry the update. */
async function pushUpdate(
  ask: ReturnType<typeof startHost>['ask'],
  account: string,
  user: bigint,
): Promise<void> {
  const deadline = Date.now() + 10_000
  for (;;) {
    const reply = await ask<{ type: string }>({ type: 'push', account, user }, 'pushed')
    if (reply.type === 'pushed') return
    if (Date.now() > deadline) throw new Error('no session carried the update')
    await settle(50)
  }
}

describe('a host in a worker thread', () => {
  it('runs calls on the account in the other thread', { timeout: 30_000 }, async () => {
    const { worker } = startHost()
    const account: AttachedAccount = await attachAccount(workerEndpoint(worker), {
      account: 'main',
    })

    await account.connect()
    const answer = (await account.api.help.getNearestDc()) as { country: string }

    expect(answer.country).toBe('NL')
    await expect(account.read('state')).resolves.toBe('running')
    await account.detach()
  })

  it('brings an error back as the class it was', { timeout: 30_000 }, async () => {
    const { worker } = startHost()
    const account = await attachAccount(workerEndpoint(worker), { account: 'main' })
    await account.connect()

    const failure = await account.api.help
      .getAppConfig({ hash: 0 })
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(FloodError)
    expect((failure as FloodError).retryAfter).toBe(7)
    await account.detach()
  })

  it('forwards an update pushed down the session in the other thread', {
    timeout: 30_000,
  }, async () => {
    const { worker, ask } = startHost()
    const account = await attachAccount(workerEndpoint(worker), { account: 'main' })
    const seen: bigint[] = []
    account.on('mtproto:typing', (event) => {
      seen.push(event.sender?.id ?? 0n)
    })
    await account.connect()
    await account.api.help.getNearestDc()

    await pushUpdate(ask, 'main', 42n)
    await until(() => seen.length > 0, 'the update')

    expect(seen).toEqual([42n])
    await account.detach()
  })

  it('streams a file across the thread boundary in order', { timeout: 30_000 }, async () => {
    const { worker } = startHost()
    const account = await attachAccount(workerEndpoint(worker), { account: 'main' })
    await account.connect()

    const location = {
      _: 'inputDocumentFileLocation',
      id: 1n,
      access_hash: 1n,
      file_reference: new Uint8Array(),
      thumb_size: '',
    } as never
    const bytes: number[] = []
    for await (const chunk of account.downloadIterable({
      location,
      dcId: 2,
      size: 4096 * 5,
      limit: 4096,
      concurrency: 1,
    })) {
      bytes.push(...(chunk as Uint8Array))
    }

    expect(bytes).toHaveLength(4096 * 5)
    expect(bytes.every((byte, index) => byte === index % 251)).toBe(true)
    await account.detach()
  })

  it('shares one account between two callers and connects it once', {
    timeout: 30_000,
  }, async () => {
    const { worker, ask } = startHost()
    const first = await attachAccount(workerEndpoint(worker), { account: 'main' })
    const second = await attachAccount(workerEndpoint(worker), { account: 'main' })

    await Promise.all([first.connect(), second.connect()])
    await first.api.help.getNearestDc()
    await second.api.help.getNearestDc()
    const report = await ask<{
      info: { accounts: { id: string; created: number; callers: number }[] }
      connections: [string, number][]
    }>({ type: 'info' }, 'info')

    expect(report.info.accounts).toEqual([
      expect.objectContaining({ id: 'main', created: 1, callers: 2 }),
    ])
    await first.detach()
    await second.detach()
  })

  it('cancels a call from this side', { timeout: 30_000 }, async () => {
    const { worker } = startHost()
    const account = await attachAccount(workerEndpoint(worker), { account: 'main' })
    await account.connect()

    const giveUp = new AbortController()
    const location = {
      _: 'inputDocumentFileLocation',
      id: 1n,
      access_hash: 1n,
      file_reference: new Uint8Array(),
      thumb_size: '',
    } as never
    const download = account.download({ location, dcId: 2, size: 4096 * 5, signal: giveUp.signal })
    giveUp.abort()

    await expect(download).rejects.toThrow(CancelledError)
    await account.detach()
  })

  it('fails every waiting call when the worker exits', { timeout: 30_000 }, async () => {
    const { worker } = startHost()
    const account = await attachAccount(workerEndpoint(worker), { account: 'main' })
    const told: string[] = []
    account.onEvent((event) => told.push(event.kind))

    // A call that cannot finish before the thread is gone.
    const waiting = account.connect().then(() => account.api.help.getNearestDc())
    await worker.terminate()

    await expect(waiting).rejects.toThrow(HostUnavailableError)
    expect(told).toEqual(['host-lost'])
  })
})
