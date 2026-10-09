// SPDX-License-Identifier: MPL-2.0

/**
 * Running an account in a worker.
 *
 * A separate entry point, so that importing the package creates no worker,
 * installs no listener and loads none of this. A program reaches it by asking
 * for it:
 *
 * ```ts
 * // in the worker
 * import { serveAccounts } from '@yuigram/mtproto/worker'
 * serveAccounts({ create: (name) => new Account({ ... }) })
 *
 * // in the page
 * import { attachAccount, sharedWorkerEndpoint } from '@yuigram/mtproto/worker'
 * const account = await attachAccount(sharedWorkerEndpoint(new SharedWorker(url)), { account: 'main' })
 * ```
 *
 * `docs/runtimes.md` §6 says which platforms provide which kind of worker and
 * what each guarantees.
 */

export {
  type AttachedAccount,
  type AttachOptions,
  attachAccount,
  RemoteAccount,
  type RemoteDraft,
  type RemoteEvent,
  type RemoteMethods,
  type RemoteTakeout,
  type RemoteWebView,
} from './client.js'
export {
  acceptSharedConnections,
  dedicatedScopeEndpoint,
  type Endpoint,
  type LockManagerLike,
  portEndpoint,
  sharedWorkerEndpoint,
  workerEndpoint,
} from './endpoints.js'
export {
  type Departure,
  type HostInfo,
  type HostOptions,
  type LastDetached,
  serveAccounts,
  WorkerHost,
} from './host.js'
export { CALLBACKS, CALLS, GETTERS, HANDLES, STREAMS } from './methods.js'
export {
  HostUnavailableError,
  PROTOCOL_VERSION,
  RemoteError,
  type SerializedError,
} from './protocol.js'

import { ConfigError } from '@yuigram/core'
import { sharedWorkerEndpoint as sharedEndpoint } from './endpoints.js'

/**
 * Open a `SharedWorker` and hand back its endpoint, or say plainly that this
 * runtime has none.
 *
 * Deliberately no fallback to a dedicated worker: a dedicated worker per tab is
 * one account connection per tab, which is the thing a shared worker exists to
 * prevent, and quietly substituting one would make two tabs look shared while
 * each connected on its own.
 */
export function openSharedWorker(
  url: string | URL,
  options?: { readonly name?: string; readonly type?: 'classic' | 'module' },
): ReturnType<typeof sharedEndpoint> {
  const Shared = (
    globalThis as { SharedWorker?: new (url: string | URL, options?: object) => unknown }
  ).SharedWorker
  if (Shared === undefined) {
    throw new ConfigError(
      'this runtime has no SharedWorker; attach to a dedicated worker instead, knowing each one connects on its own',
    )
  }

  return sharedEndpoint(new Shared(url, options))
}
