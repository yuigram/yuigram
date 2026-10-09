// SPDX-License-Identifier: MIT

/**
 * Durable authorization state.
 *
 * Internal to the package: what an application supplies is a key-value store,
 * not the encoding placed in it.
 */

export {
  type AuthorizationStore,
  authorizationStore,
  StorageError,
} from './authorization.js'
export {
  DatacenterStorageError,
  type DatacenterStore,
  datacenterStore,
} from './datacenters.js'
export {
  type PeerKind,
  type PeerRecord,
  PeerStorageError,
  type PeerStore,
  peerStore,
} from './peers.js'
