/**
 * The account every live command builds, one way.
 *
 * From the session string the operator supplies, in the layout they named,
 * over memory: nothing is kept between runs, because the string is supplied
 * again each time and a file beside it would be a second copy of the secret.
 */

import { Account, type Logger, memory } from 'yuigram'
import type { AccountSettings } from './environment.js'

/** The address list an account starts from, as its constructor takes it. */
type Bootstrap = ConstructorParameters<typeof Account>[0]['bootstrap']

/** The datacenter an operator named, as the address list an account starts from. */
export function bootstrapFor(
  dc: { readonly id: number; readonly host: string; readonly port: number } | undefined,
  testMode: boolean,
): Bootstrap {
  return {
    thisDc: dc?.id ?? 2,
    testMode,
    options:
      dc === undefined
        ? []
        : [
            {
              id: dc.id,
              host: dc.host,
              port: dc.port,
              ipv6: dc.host.includes(':'),
              mediaOnly: false,
              cdn: false,
              secret: undefined,
              tcpoOnly: false,
              thisPortOnly: false,
              static: false,
            },
          ],
  }
}

/** The account a session string names. */
export function accountFromSession(settings: AccountSettings, log: Logger): Account {
  return Account.fromString(settings.session, {
    apiId: settings.apiId,
    apiHash: settings.apiHash,
    keys: settings.keys,
    bootstrap: bootstrapFor(settings.dc, settings.testMode),
    storage: memory(),
    name: 'live',
    format: settings.format,
    log,
  })
}
