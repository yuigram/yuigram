// SPDX-License-Identifier: MPL-2.0

/**
 * Prepare the file of Telegram's server public keys, once.
 *
 * ```sh
 * pnpm tsx examples/20-presence-watch/keys.ts production
 * pnpm tsx examples/20-presence-watch/keys.ts test
 * ```
 *
 * Retrieves one source file of TDLib, Telegram's client library, at a fixed
 * revision — see `server-keys.ts` for which, and why that one — checks it is
 * byte for byte the file that was read when the revision was recorded, and
 * writes the keys of the named environment to `telegram-keys.<environment>.pem`
 * beside this file, which is where the configuration looks unless
 * `SERVER_KEYS` says otherwise. A second argument names another file.
 *
 * This is the only command of the example that reaches anything but Telegram,
 * and the only time the keys are retrieved. The environment is always named:
 * there is no default to fall back to. A file already there is never replaced.
 */

import { resolve } from 'node:path'
import { KEY_SOURCE, keyFileFor, prepareServerKeys, sourceUrl } from './server-keys.js'

const [environment, file] = process.argv.slice(2)
if (environment !== 'production' && environment !== 'test') {
  console.error(
    'Usage: pnpm tsx examples/20-presence-watch/keys.ts <production|test> [file]\n' +
      'Name the environment the account will run in: its keys are not the other one’s.',
  )
  process.exit(1)
}

const target = file === undefined ? keyFileFor(environment) : resolve(import.meta.dirname, file)

try {
  const { status, fingerprints } = await prepareServerKeys({ environment, target })
  console.log(
    status === 'written'
      ? `Written: ${target}`
      : `Already there, holding the same keys, and left as it is: ${target}`,
  )
  console.log(`Environment: ${environment}`)
  console.log(`Source: ${sourceUrl()}`)
  console.log(`Source SHA-256: ${KEY_SOURCE.sha256}`)
  console.log(`Key fingerprints: ${fingerprints.join(', ')}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
