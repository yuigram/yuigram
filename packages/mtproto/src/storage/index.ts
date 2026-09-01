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
