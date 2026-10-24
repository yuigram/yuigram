// SPDX-License-Identifier: MIT

/**
 * A second page of the same origin, for the one question a single page cannot ask.
 *
 * Storage ownership is about two runs reaching one store, and in a browser the
 * two runs that matter are two browsing contexts — two tabs of a site, or a
 * page and the frame it embeds. They share an origin, so they share
 * `localStorage` and they share the lock manager, and neither can reach into
 * the other's memory. That last part is the whole point: a page cannot drain a
 * write another page is in the middle of, and so it must not take that page's
 * storage area away from it.
 *
 * This file is what the harness embeds to be that other page. It does what it
 * is told over `postMessage` and says what happened, so the harness can hold a
 * write open here and then try to take the area from over there.
 *
 * It deliberately contains no assertions. Everything is judged by the harness;
 * this only has to be a genuinely separate context that genuinely holds an
 * area and genuinely has a write it has not finished.
 */

import type { AreaLease } from '../../../packages/mtproto/src/storage/ownership.js'
import { claimArea } from '../../../packages/mtproto/src/storage/ownership.js'
import { web } from '../../../packages/yuigram/src/index.js'

/** What this page needs from the browser, named rather than pulled in wholesale. */
const frame = globalThis as unknown as {
  readonly parent: { postMessage(message: unknown, target: string): void }
  addEventListener(kind: string, handler: (event: { data: unknown }) => void): void
}

/** Where the two pages meet. The harness writes into the same prefix. */
const PREFIX = 'browser-check:twopage:'

/** What the harness asks this page to do. */
interface Instruction {
  readonly yuigram: 'second-page'
  readonly id: number
  readonly act: 'claim' | 'land' | 'release'
  readonly name?: string
}

/** The lease this page holds, once it has claimed one. */
let lease: AreaLease | undefined

/** Lets the suspended write finish, once the harness says so. */
let land = (): void => {}

/** Settles when the suspended write has actually reached the store. */
let landed: Promise<void> = Promise.resolve()

/**
 * The origin's store, with one write held open on request.
 *
 * A real `localStorage` write is synchronous and over before anything can look
 * at it, which would make the interesting interleaving unobservable. So the
 * adapter is wrapped rather than replaced: the bytes still go to the page's own
 * `localStorage` through the package's own adapter, and the only change is
 * *when*. That is the situation being modelled — an adapter this run has handed
 * a write to and has not been told is finished — and it is exactly the state a
 * slower store (IndexedDB, a remote one) is in for most of every write.
 */
function heldStore() {
  const real = web({ prefix: PREFIX })
  const suspended = new Promise<void>((resolve) => {
    land = resolve
  })

  return {
    ...real,
    async set(key: string, value: unknown): Promise<void> {
      // Only this account's own data is held. Holding the claim record too
      // would suspend `claimArea` itself, and the harness would then be
      // contending with a page that never finished starting — which is a
      // different situation, and an easier one.
      if (!key.endsWith('claim')) await suspended
      await real.set(key, value)
    },
  }
}

/** Say something back to the page that embedded this one. */
function reply(id: number, outcome: Record<string, unknown>): void {
  frame.parent.postMessage({ yuigram: 'second-page', id, ...outcome }, '*')
}

frame.addEventListener('message', (event) => {
  const message = event.data as Partial<Instruction>
  if (message.yuigram !== 'second-page' || typeof message.id !== 'number') return

  const id = message.id

  void (async () => {
    try {
      if (message.act === 'claim') {
        const store = heldStore()
        lease = await claimArea(store, {
          name: message.name ?? 'frank',
          holder: 'second-page',
        })

        // Admitted, and now inside the adapter with no way to finish until this
        // page is told to let it. From here on the harness has what it needs:
        // a live holder of the area with a write it has not completed.
        landed = lease.storage.set('auth:dc2:key', 'from the second page')

        reply(id, { ok: true, scope: lease.scope, held: lease.held })

        return
      }

      if (message.act === 'land') {
        land()
        await landed
        reply(id, { ok: true })

        return
      }

      land()
      await landed.catch(() => undefined)
      await lease?.release()
      reply(id, { ok: true })
    } catch (error) {
      reply(id, { ok: false, error: String(error) })
    }
  })()
})

frame.parent.postMessage({ yuigram: 'second-page', id: 0, ready: true }, '*')
