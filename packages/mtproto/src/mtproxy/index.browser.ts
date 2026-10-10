// SPDX-License-Identifier: MIT

/**
 * MTProxy, in a browser.
 *
 * Substituted for `index.ts` by the `browser` field. A proxy is reached over
 * TCP, which a page cannot open; connecting to one over the WebSocket a page
 * does have would reach nothing, so this refuses where the proxy is made rather
 * than letting every connection fail later.
 */

import { ConfigError } from '@yuigram/core'

export {
  MAX_DOMAIN_LENGTH,
  type MtProxyMode,
  type MtProxySecret,
  readProxySecret,
} from './secret.js'
export { FakeTlsError } from './tls.js'

import type { MtProxy, MtProxyLink, MtProxyOptions } from './mtproxy.js'

export type { MtProxy, MtProxyLink, MtProxyOptions }

export function mtproxy(_options: MtProxyOptions | MtProxyLink): MtProxy {
  throw new ConfigError(
    'an MTProxy is reached over TCP, and a browser cannot open a TCP connection',
  )
}
