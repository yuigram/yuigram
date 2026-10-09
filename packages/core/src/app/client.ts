// SPDX-License-Identifier: MPL-2.0

/**
 * What a container needs a client to be.
 *
 * Deliberately the smallest thing that works. A container holds clients so it
 * can start them, stop them, name them and put middleware around what they
 * dispatch — and nothing it does requires knowing what a client talks to. So
 * nothing here mentions a transport, a session, a connection or a credential:
 * those belong to the client, and a contract that named them would drag the
 * shared layer into knowing which subsystems exist.
 *
 * The contract is structural. A client satisfies it by having these members,
 * not by importing anything, which is what lets one container hold clients from
 * subsystems that must never import each other.
 */

import type { Dispatchable } from '../dispatch/dispatcher.js'
import type { StopOptions } from '../lifecycle/lifecycle.js'
import type { Middleware } from '../middleware/compose.js'

/**
 * A client a container can hold.
 *
 * `start` is the one general verb. A client names its own mechanism — polling,
 * a webhook, a connection — because that choice decides how a deployment is
 * shaped, and a reader should see it. What `start` means is therefore the
 * client's own answer: a deployment that never starts anything, such as one
 * handed a webhook handler to mount, simply never asks the container to.
 */
export interface AppClient<C extends Dispatchable = Dispatchable> {
  /** How this client is named in logs and in a lookup. */
  readonly name: string
  /** How far through its lifecycle this client has got. */
  readonly state: string
  /** Bring the client up by whatever mechanism it runs. */
  start(): Promise<void>
  /** Take the client down, draining what is in flight. */
  stop(options?: StopOptions): Promise<boolean>
  /**
   * Put middleware around everything this client dispatches.
   *
   * The whole of it, outside the client's own middleware and outside its
   * priority bands — so a container's middleware surrounds a client's `high`
   * rather than queueing alongside it. Registering middleware at a priority is
   * how a client orders its *own* concerns; it is not a way to reach outside
   * the client, and a container that used it would be sorting itself into a
   * list it does not belong in.
   *
   * Called at most once per container. A client already surrounded by one
   * container being added to another is a client with two owners, which is a
   * mistake rather than a configuration.
   */
  surround(middleware: Middleware<C>): void
}
