/**
 * MTProxy, as an entry point of its own.
 *
 * Only a program that connects through a proxy loads it. A browser has no TCP
 * socket to reach one with, and gets `index.browser.ts` instead.
 */

export {
  type MtProxy,
  type MtProxyLink,
  type MtProxyOptions,
  mtproxy,
} from './mtproxy.js'
export {
  MAX_DOMAIN_LENGTH,
  type MtProxyMode,
  type MtProxySecret,
  readProxySecret,
} from './secret.js'
export { FakeTlsError } from './tls.js'
