// SPDX-License-Identifier: MIT

/**
 * IndexedDB storage, as an entry point of its own.
 *
 * Only a browser program that keeps state in IndexedDB loads it, so nothing
 * else pays for it at startup.
 */

export {
  type IndexedDbCursorLike,
  type IndexedDbDatabaseLike,
  type IndexedDbDurability,
  type IndexedDbEventHandler,
  type IndexedDbFactoryLike,
  type IndexedDbObjectStoreLike,
  type IndexedDbOpenRequestLike,
  type IndexedDbOptions,
  type IndexedDbRequestLike,
  type IndexedDbStore,
  type IndexedDbTransactionLike,
  indexedDb,
} from './indexeddb.js'
