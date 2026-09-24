/**
 * The worker checks: an account hosted in a real `Worker` and a real
 * `SharedWorker`, reached from this page and from a second one.
 *
 * Everything here goes through the public entry points — `yuigram/worker` for
 * the caller, and the host script, which uses `yuigram/worker` too — imported
 * from their sources as the rest of this tool does. The
 * datacenters are the served ones, a separate one per account, so what a check
 * says crossed really crossed a WebSocket, a worker boundary and a port.
 */

import { CancelledError, LifecycleError } from '../../../packages/yuigram/src/index.js'
import {
  type AttachedAccount,
  attachAccount,
  HostUnavailableError,
  openSharedWorker,
  workerEndpoint,
} from '../../../packages/yuigram/src/worker.js'

type Check = (name: string, run: () => Promise<string> | string) => Promise<void>
type Expect = (condition: boolean, message: string) => void

const page = globalThis as unknown as {
  readonly document: {
    createElement(tag: string): { src: string; style: Record<string, string>; remove(): void }
    readonly body: { append(child: unknown): void }
  }
  addEventListener(kind: string, handler: (event: { data: unknown }) => void): void
  removeEventListener(kind: string, handler: (event: { data: unknown }) => void): void
}

interface WorkerLike {
  terminate(): void
}

const WorkerConstructor = (
  globalThis as unknown as { Worker: new (url: string, options: object) => WorkerLike }
).Worker

const settle = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function until(
  condition: () => boolean | Promise<boolean>,
  what: string,
  ms = 20_000,
): Promise<void> {
  const deadline = Date.now() + ms
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await settle(25)
  }
}

/** Ask the served datacenter for an account to push an update down its session. */
async function push(account: string, user: number): Promise<void> {
  await until(async () => {
    const answer = await fetch(
      `/deliver-worker?account=${encodeURIComponent(account)}&user=${user}`,
      {
        method: 'POST',
      },
    )

    return answer.ok
  }, `a session for '${account}' to carry the update`)
}

/** What the served datacenter for an account saw. */
async function stats(account: string): Promise<{ connections: number; permanentKeys: number }> {
  return (await (await fetch(`/stats-worker?account=${encodeURIComponent(account)}`)).json()) as {
    connections: number
    permanentKeys: number
  }
}

/** A second tab attached to the same shared host, driven from here. */
async function embedTab(
  workerName: string,
  account: string,
  release: 'pagehide' | 'never' = 'pagehide',
  script = '/worker-host.js',
) {
  const frame = page.document.createElement('iframe')
  frame.style['display'] = 'none'
  const updates: string[] = []
  const answers = new Map<number, { ok: boolean; value: unknown }>()
  let ready = false
  let failed: string | undefined

  const listener = (event: { data: unknown }): void => {
    const message = event.data as {
      yuigram?: string
      kind?: string
      id?: number
      ok?: boolean
      value?: unknown
      user?: string
    } | null
    if (message?.yuigram !== 'worker-tab') return
    if (message.kind === 'ready') ready = true
    if (message.kind === 'failed') failed = String(message.value)
    if (message.kind === 'update') updates.push(String(message.user))
    if (message.kind === 'answer' && message.id !== undefined) {
      answers.set(message.id, { ok: message.ok === true, value: message.value })
    }
  }
  page.addEventListener('message', listener)
  frame.src = `/worker-tab?worker=${encodeURIComponent(workerName)}&account=${encodeURIComponent(account)}&release=${release}&script=${encodeURIComponent(script)}`
  page.document.body.append(frame)

  await until(() => ready || failed !== undefined, 'the second tab to attach')
  if (failed !== undefined) throw new Error(`the second tab could not attach: ${failed}`)

  let nextId = 1
  const target = (
    frame as unknown as { contentWindow: { postMessage(m: unknown, o: string): void } }
  ).contentWindow

  return {
    updates,
    async ask(act: string): Promise<unknown> {
      const id = nextId++
      target.postMessage({ yuigram: 'worker-tab-ask', id, act }, '*')
      await until(() => answers.has(id), `the second tab to answer '${act}'`)
      const answer = answers.get(id) as { ok: boolean; value: unknown }
      if (!answer.ok) throw new Error(String(answer.value))

      return answer.value
    },
    close(): void {
      page.removeEventListener('message', listener)
      frame.remove()
    },
  }
}

export async function runWorkerChecks(check: Check, expect: Expect): Promise<void> {
  const run = Date.now().toString(36)
  const dedicatedName = `dedicated-${run}`
  let dedicated: WorkerLike | undefined
  let account: AttachedAccount | undefined
  const seen: string[] = []

  // ---- a dedicated worker ---------------------------------------------------

  await check('hosts an account in a dedicated worker', async () => {
    dedicated = new WorkerConstructor('/worker-host.js', { type: 'module' })
    account = await attachAccount(workerEndpoint(dedicated), { account: dedicatedName })
    account.on('mtproto:typing', (event) => {
      seen.push(String(event.sender?.id))
    })
    await account.connect()
    const answer = (await account.api.help.getNearestDc()) as { _: string }
    const state = await account.read('state')

    expect(state === 'running', `the hosted account is '${state}'`)

    return `connected in the worker; an encrypted call answered '${answer._}'; state '${state}'`
  })

  await check('receives an update pushed down the session the worker holds', async () => {
    expect(account !== undefined, 'no account to receive on')
    await push(dedicatedName, 77)
    await until(() => seen.includes('77'), 'the update to reach this page')

    return 'decrypted in the worker, forwarded across the port, dispatched here'
  })

  await check('cancels a call in the worker from this page', async () => {
    const current = account as AttachedAccount
    const giveUp = new AbortController()
    const call = current.withParams({}).call({ _: 'help.getNearestDc' }, { signal: giveUp.signal })
    giveUp.abort()
    const outcome = await call.catch((error: unknown) => error)
    const info = await current.hostInfo()

    expect(outcome instanceof CancelledError, `the call ended with ${String(outcome)}`)
    expect(info.pendingCalls === 0, `${info.pendingCalls} calls are still pending on the host`)

    return `rejected as cancelled; the host holds ${info.pendingCalls} pending calls`
  })

  await check('brings a refusal across as the class it was', async () => {
    const current = account as AttachedAccount
    const told: string[] = []
    current.onEvent((event) => told.push(event.kind))
    await current.stop()
    await until(() => told.includes('stopped'), 'the stop notice')

    const refusal = await current.api.help.getNearestDc().catch((error: unknown) => error)

    expect(refusal instanceof LifecycleError, `the refusal was ${String(refusal)}`)

    return `stopped and told so; the next call refused as ${(refusal as Error).name}: ${(refusal as Error).message}`
  })

  await check('restores a session in a new worker, with the same key', async () => {
    const current = account as AttachedAccount
    await current.connect()
    await current.api.help.getNearestDc()
    const session = await current.exportSession()
    const before = await stats(dedicatedName)

    await current.detach()
    dedicated?.terminate()

    const next = new WorkerConstructor('/worker-host.js', { type: 'module' })
    dedicated = next
    const restored = await attachAccount(workerEndpoint(next), {
      account: dedicatedName,
      restore: session,
    })
    await restored.connect()
    const answer = (await restored.api.help.getNearestDc()) as { _: string }
    const again = await restored.exportSession()
    const after = await stats(dedicatedName)
    account = restored

    expect(again === session, 'the restored account carries a different key')
    expect(
      after.permanentKeys === before.permanentKeys,
      `a new long-lived key was made: ${before.permanentKeys} → ${after.permanentKeys}`,
    )

    return `same session string after restoring; ${after.permanentKeys} long-lived key at the datacenter; answered '${answer._}'`
  })

  await check('fails every waiting call when its worker is terminated', async () => {
    const doomed = new WorkerConstructor('/worker-host.js', { type: 'module' })
    const caller = await attachAccount(workerEndpoint(doomed), {
      account: `doomed-${run}`,
      pingEvery: 200,
      hostTimeout: 1_000,
    })
    const told: string[] = []
    caller.onEvent((event) => told.push(event.kind))

    // A key exchange takes long enough to still be waiting when the worker goes.
    const waiting = caller.connect()
    doomed.terminate()
    const outcome = await waiting.catch((error: unknown) => error)

    expect(outcome instanceof HostUnavailableError, `the call ended with ${String(outcome)}`)
    expect(told.includes('host-lost'), 'this page was not told the host was lost')

    return `rejected with ${(outcome as Error).name} after the host fell silent`
  })

  await account?.detach()
  dedicated?.terminate()

  // ---- a shared worker, two tabs --------------------------------------------

  const workerName = `yuigram-check-${run}`
  const sharedName = `shared-${run}`
  const otherName = `other-${run}`
  let shared: AttachedAccount | undefined
  let tab: Awaited<ReturnType<typeof embedTab>> | undefined
  const sharedSeen: string[] = []

  await check('shares one account between two tabs, connected once', async () => {
    shared = await attachAccount(
      openSharedWorker('/worker-host.js', { type: 'module', name: workerName }),
      {
        account: sharedName,
      },
    )
    shared.on('mtproto:typing', (event) => {
      sharedSeen.push(String(event.sender?.id))
    })
    tab = await embedTab(workerName, sharedName)

    await Promise.all([shared.connect(), tab.ask('connect')])
    await shared.api.help.getNearestDc()
    await tab.ask('call')

    const info = await shared.hostInfo()
    const entry = info.accounts.find((one) => one.id === sharedName)
    const seenByDatacenter = await stats(sharedName)

    expect(entry?.created === 1, `the host made the account ${entry?.created} times`)
    expect(entry?.callers === 2, `${entry?.callers} callers are attached`)
    expect(
      seenByDatacenter.permanentKeys === 1,
      `the datacenter saw ${seenByDatacenter.permanentKeys} long-lived keys`,
    )

    return `one account made once, two callers attached, one long-lived key at the datacenter (${seenByDatacenter.connections} connections)`
  })

  await check('delivers an update to both tabs', async () => {
    const current = tab as NonNullable<typeof tab>
    await push(sharedName, 91)
    await until(
      () => sharedSeen.includes('91') && current.updates.includes('91'),
      'the update in both tabs',
    )

    return 'one update from the one session, handled in this tab and the other'
  })

  await check('keeps one tab usable when the other closes', async () => {
    const current = shared as AttachedAccount
    tab?.close()
    tab = undefined

    await until(async () => {
      const info = await current.hostInfo()

      return info.accounts.find((one) => one.id === sharedName)?.callers === 1
    }, 'the closed tab to be let go')

    const info = await current.hostInfo()
    const answer = (await current.api.help.getNearestDc()) as { _: string }

    expect(
      info.pendingCalls === 0 &&
        info.streams === 0 &&
        info.handles === 0 &&
        info.pendingCallbacks === 0,
      `the closed tab left ${JSON.stringify(info)}`,
    )

    return `the closed tab was released with nothing left behind; this tab still answered '${answer._}'`
  })

  await check("tells every tab the shared account's connection status", async () => {
    const current = shared as AttachedAccount
    const other = await embedTab(workerName, sharedName)
    const theirs = await other.ask('status')
    other.close()

    expect(current.connectionStatus === 'connected', `this tab sees '${current.connectionStatus}'`)
    expect(theirs === 'connected', `a tab attaching now sees '${String(theirs)}'`)

    return `this tab and a tab attaching now both see '${String(theirs)}'`
  })

  await check('lets a destroyed tab go with nothing said, and keeps the other usable', async () => {
    const current = shared as AttachedAccount
    const silent = await embedTab(workerName, sharedName, 'never')
    await silent.ask('connect')
    await silent.ask('hold')
    const lock = (await silent.ask('lock')) as { held: number; pending: number }
    const before = await current.hostInfo()

    // No release and no pagehide handler: the frame's document is simply destroyed.
    const removed = Date.now()
    silent.close()
    await until(
      async () => {
        const info = await current.hostInfo()

        return info.accounts.find((one) => one.id === sharedName)?.callers === 1
      },
      'the destroyed tab to be let go',
      15_000,
    )
    const took = Date.now() - removed
    await until(async () => (await current.hostInfo()).handles === 0, 'its handle to be released')
    const after = await current.hostInfo()
    const answer = (await current.api.help.getNearestDc()) as { _: string }
    // Which platform signal arrived first. An engine that reports a closed port
    // lets the tab go on that; the lock is what the others have.
    const signal = (['port-closed', 'context-gone', 'expired', 'detached'] as const).find(
      (reason) => after.departures[reason] > before.departures[reason],
    )

    expect(lock.held === 1 && lock.pending === 1, `the platform reports ${JSON.stringify(lock)}`)
    expect(before.handles === 1, `the tab held ${before.handles} handles before it went`)
    expect(took < 15_000, `it took ${took}ms`)
    expect(
      signal === 'port-closed' || signal === 'context-gone',
      `the tab was let go as '${String(signal)}'`,
    )

    return `its lock held and the host waiting on it; let go ${took}ms after removal on '${String(signal)}', inside the 60s silence limit; handle released; this tab still answered '${answer._}'`
  })

  await check(
    'lets a destroyed tab go on its lock alone, where the port says nothing',
    async () => {
      const script = '/worker-host.js?signals=locks'
      const name = `${workerName}-locks`
      const accountName = `locks-${run}`
      const here = await attachAccount(openSharedWorker(script, { type: 'module', name }), {
        account: accountName,
      })
      const silent = await embedTab(name, accountName, 'never', script)
      await silent.ask('connect')
      await silent.ask('hold')
      const before = await here.hostInfo()

      const removed = Date.now()
      silent.close()
      await until(
        async () => {
          const info = await here.hostInfo()

          return info.accounts.find((one) => one.id === accountName)?.callers === 1
        },
        'the destroyed tab to be let go',
        15_000,
      )
      const took = Date.now() - removed
      await until(async () => (await here.hostInfo()).handles === 0, 'its handle to be released')
      const after = await here.hostInfo()
      await here.detach()

      expect(
        after.departures['context-gone'] === before.departures['context-gone'] + 1,
        `departures went from ${JSON.stringify(before.departures)} to ${JSON.stringify(after.departures)}`,
      )
      expect(
        after.departures['port-closed'] === before.departures['port-closed'],
        'a port closing was acted on by a host told to ignore it',
      )

      return `with the port ignored, the lock alone let the tab go ${took}ms after removal ('context-gone'); its handle released`
    },
  )

  await check('keeps independent accounts apart on one shared host', async () => {
    const other = await attachAccount(
      openSharedWorker('/worker-host.js', { type: 'module', name: workerName }),
      {
        account: otherName,
      },
    )
    const otherSeen: string[] = []
    other.on('mtproto:typing', (event) => {
      otherSeen.push(String(event.sender?.id))
    })
    await other.connect()
    await other.api.help.getNearestDc()

    await push(sharedName, 55)
    await until(() => sharedSeen.includes('55'), 'the update for the shared account')
    await settle(300)
    const info = await other.hostInfo()

    expect(otherSeen.length === 0, `the other account received ${otherSeen.join(', ')}`)
    expect(
      info.accounts
        .filter((one) => one.id === sharedName || one.id === otherName)
        .every((one) => one.created === 1),
      `accounts: ${JSON.stringify(info.accounts)}`,
    )
    await other.detach()

    return 'an update for one account reached only its callers; each account was made once'
  })

  await check('stops the shared account for every caller that holds it', async () => {
    const current = shared as AttachedAccount
    const told: string[] = []
    current.onEvent((event) => told.push(event.kind))

    await current.stop()
    await until(() => told.includes('stopped'), 'the stop notice')
    const state = await current.read('state')
    await current.detach()

    expect(state === 'idle', `the account is '${state}'`)

    return `stopped; every attached caller told; state '${state}'`
  })
}
