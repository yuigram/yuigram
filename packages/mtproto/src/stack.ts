// SPDX-License-Identifier: MPL-2.0

/**
 * What an account loads when it connects.
 *
 * Everything here is reachable only from {@link Account}'s start path, and it is
 * gathered into one module so that path can load it in one step. Nothing else
 * imports this file: reaching a layer through it would put the whole stack back
 * into whatever graph did the reaching, which is the thing this exists to
 * prevent.
 *
 * The reason is startup cost. `docs/performance.md` §2 budgets a cold
 * `import 'yuigram'` at under 100 ms and asks for the TL codec tables to be
 * resolved on first use rather than built eagerly — a 2,300-entry table costs
 * real time to evaluate, and a program that only ever runs a bot never touches
 * it. Loading the tables and the layers that read them at the moment an account
 * connects is that decision applied at module granularity: the cost is paid by
 * the client that has one, when it has one.
 *
 * The set is deliberately the connected surface and nothing more. An account's
 * constructor, its session import and export, and the context it builds for a
 * handler all stay statically reachable, because they work with no connection
 * and a caller can reach them before there is one.
 */

export { REGISTRY as API } from './generated/api/registry.js'
export { REGISTRY as CORE } from './generated/core/registry.js'
export { REGISTRY as MTPROTO } from './generated/mtproto/registry.js'
export { openConnections } from './network/connections.js'
export { openDatacenters } from './network/datacenters.js'
export { openPools } from './network/pools.js'
export { TlScope } from './tl/index.js'
export { openUpdates } from './updates/manager.js'
