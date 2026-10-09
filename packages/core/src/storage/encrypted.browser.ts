// SPDX-License-Identifier: MPL-2.0

/**
 * What encryption at rest is, where the derivation it uses does not exist.
 *
 * Substituted for `encrypted.ts` by the `browser` field. The envelope is
 * AES-256-GCM under a key derived by scrypt, and `crypto.subtle` offers no
 * scrypt — only PBKDF2. Deriving with something else would produce an envelope
 * a server could not open and a server's envelope this could not read, which is
 * worse than not offering it: two stores that both claim to be encrypted and
 * disagree about what that means.
 *
 * Browsers also isolate storage per origin, which is a different protection
 * from the one this provides and is already in force.
 */

import { ConfigError } from '../errors/errors.js'
import type { DescribedKV, KV } from './types.js'

/** Encryption at rest, which this runtime cannot perform compatibly. */
export function encrypted<V = unknown>(store: KV<string>, secret: string): DescribedKV<V> {
  void store
  void secret

  throw new ConfigError(
    'this runtime cannot derive the key this envelope uses, so a store cannot be encrypted here',
  )
}
