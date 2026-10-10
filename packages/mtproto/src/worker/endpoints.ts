// SPDX-License-Identifier: MIT

/**
 * The two ends of a worker boundary, whatever platform provides them.
 *
 * A browser's `Worker`, `SharedWorker` and `MessagePort` and Node's
 * `worker_threads` all move structured-cloned values between two event loops,
 * and they disagree about everything else: whether a message arrives as an
 * event or as the value, whether the other side going away is announced, and
 * what a port has to be told before it delivers anything. An {@link Endpoint}
 * is the part they agree on.
 *
 * Nothing here imports a platform module. The objects are handed in by the
 * application, which created them, and are recognised by what they can do —
 * so a browser bundle never reaches `node:worker_threads`, and neither does a
 * program that never uses a worker, because nothing here is imported until the
 * worker entry point is.
 */

import { ConfigError } from '@yuigram/core'

/** One end of a message channel. */
export interface Endpoint {
  /** Send a value. Buffers in `transfer` are handed over and unusable here afterwards. */
  post(message: unknown, transfer?: readonly ArrayBuffer[]): void
  /** Be told of every value that arrives. Returns the way to stop being told. */
  listen(handler: (data: unknown) => void): () => void
  /**
   * Be told when the other side is known to be gone.
   *
   * Only where the platform says so — a Node worker's `exit`, a browser
   * worker's load failure. A browser port says nothing when the page holding
   * its other end closes, which is why the protocol has liveness of its own.
   */
  onGone(handler: (reason: string) => void): () => void
  /** Stop using this end. */
  close(): void
}

/** What a browser event target and a Node emitter each offer. */
interface Target {
  postMessage(message: unknown, transfer?: readonly ArrayBuffer[]): void
  addEventListener?(type: string, listener: (event: unknown) => void): void
  removeEventListener?(type: string, listener: (event: unknown) => void): void
  on?(type: string, listener: (...args: unknown[]) => void): unknown
  off?(type: string, listener: (...args: unknown[]) => void): unknown
  start?(): void
  close?(): void
  terminate?(): unknown
}

/** Subscribe to one event on either kind of target. */
function subscribe(target: Target, type: string, handler: (payload: unknown) => void): () => void {
  if (typeof target.addEventListener === 'function') {
    // A browser event, or a Node `MessagePort`, which is an EventTarget too:
    // the value is on the event.
    const listener = (event: unknown): void => {
      handler(type === 'message' ? (event as { data?: unknown }).data : event)
    }
    target.addEventListener(type, listener)

    return () => target.removeEventListener?.(type, listener)
  }

  if (typeof target.on === 'function') {
    // A Node `Worker`, which is an emitter and hands over the value itself.
    const listener = (payload: unknown): void => {
      handler(payload)
    }
    target.on(type, listener)

    return () => {
      target.off?.(type, listener)
    }
  }

  throw new ConfigError('this is not a worker, a port or anything that carries messages')
}

/** Adapt anything with `postMessage` and a message event. */
function endpointOf(target: Target, options: { readonly gone?: readonly string[] } = {}): Endpoint {
  let closed = false

  return {
    post(message, transfer) {
      if (closed) return
      if (transfer === undefined || transfer.length === 0) {
        target.postMessage(message)
      } else {
        target.postMessage(message, transfer)
      }
    },
    listen(handler) {
      const stop = subscribe(target, 'message', handler)
      // A port delivers nothing until it is started, and adding a listener
      // with `addEventListener` does not start it the way `onmessage` would.
      target.start?.()

      return stop
    },
    onGone(handler) {
      const stops = (options.gone ?? []).map((type) =>
        subscribe(target, type, (payload) => {
          handler(
            type === 'exit'
              ? `the worker exited with code ${String(payload)}`
              : `the worker reported ${type}`,
          )
        }),
      )

      return () => {
        for (const stop of stops) stop()
      }
    },
    close() {
      closed = true
      target.close?.()
    },
  }
}

/**
 * The caller's end of a dedicated worker — a browser `Worker` or a Node
 * `worker_threads` `Worker`.
 *
 * A Node worker announces its own exit, which ends every call waiting on it at
 * once. A browser worker announces only that its script failed to load; one
 * that is terminated or crashes later is noticed by the protocol's liveness
 * check instead.
 */
export function workerEndpoint(worker: unknown): Endpoint {
  const target = worker as Target
  const isNode = typeof target.addEventListener !== 'function' && typeof target.on === 'function'

  return endpointOf(target, { gone: isNode ? ['exit'] : ['error'] })
}

/** The caller's end of a `SharedWorker`: its port, started. */
export function sharedWorkerEndpoint(shared: unknown): Endpoint {
  const worker = shared as { readonly port?: Target } & Target
  if (worker.port === undefined) {
    throw new ConfigError('this is not a SharedWorker: it has no port')
  }

  const port = endpointOf(worker.port)

  return {
    ...port,
    onGone(handler) {
      return subscribe(worker, 'error', () => {
        handler('the shared worker reported an error')
      })
    },
  }
}

/** Either end of a `MessagePort`, from a browser or from Node. */
export function portEndpoint(port: unknown): Endpoint {
  return endpointOf(port as Target, { gone: ['close'] })
}

/**
 * The host's end inside a dedicated worker: the worker's own scope in a
 * browser, or `parentPort` in a Node worker.
 */
export function dedicatedScopeEndpoint(scope: unknown): Endpoint {
  return endpointOf(scope as Target)
}

/**
 * Accept every page that connects to a `SharedWorker`.
 *
 * Each connecting page gets a port of its own, and each port is an endpoint.
 * Returns the way to stop accepting new ones.
 */
export function acceptSharedConnections(
  scope: unknown,
  accept: (endpoint: Endpoint) => void,
): () => void {
  const target = scope as Target

  return subscribe(target, 'connect', (event) => {
    const ports = (event as { readonly ports?: readonly unknown[] }).ports ?? []
    for (const port of ports) accept(portEndpoint(port))
  })
}

/** Whether this code is running inside a `SharedWorker`. */
export function inSharedWorker(scope: unknown): boolean {
  const shared = (globalThis as { SharedWorkerGlobalScope?: new () => unknown })
    .SharedWorkerGlobalScope

  return shared !== undefined && scope instanceof shared
}

/**
 * The part of the Web Locks API a worker boundary uses.
 *
 * A lock is held by a browsing context or a worker and let go when it asks, or
 * when that context is destroyed — closing a tab lets go of every lock it
 * held, without the tab running another line. Nothing else a page can hold
 * says as plainly that it is gone, and nothing about a live page, however
 * throttled or hidden, lets go of one.
 */
export interface LockManagerLike {
  request(name: string, callback: () => Promise<unknown>): Promise<unknown>
}

/** The locks this runtime provides, if it provides them. */
export function platformLocks(): LockManagerLike | undefined {
  const locks = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator?.locks

  return typeof locks?.request === 'function' ? locks : undefined
}
