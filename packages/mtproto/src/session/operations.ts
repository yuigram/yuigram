/**
 * Operations on the account itself, rather than on anything it can see.
 *
 * Four unrelated things that share one property: each concerns this
 * authorization — the credentials it holds, the calls it makes, the data it may
 * export — rather than a conversation, a person or a message.
 *
 * ```
 *   takeout      ──> a second authorization, scoped to an export, under which
 *                    reads do not mark anything as seen
 *   bound calls  ──> the same account with defaults applied to every call
 *   self         ──> whether a peer is this account
 *   collectible  ──> what a username or number sold for, which is public
 * ```
 *
 * None of them signs out, revokes another device's authorization, or touches
 * another account's stored data. A takeout session is an addition to this
 * authorization and ends when Telegram says so, not by invalidating anything
 * that already exists.
 */

import type { MtprotoApi } from '../api.js'
import { ValidationError } from '../core.js'
import type { TypeInputPeer } from '../generated/api/types/index.js'
import type { PeerRef } from '../normalize/normalize.js'
import type { TlValue } from '../tl/index.js'

/** What these operations need from a client. */
export interface Operating {
  readonly api: MtprotoApi
  resolve(peer: string | PeerRef): Promise<TypeInputPeer>
}

/* -------------------------------------------------------------------------- */
/* Takeout                                                                     */
/* -------------------------------------------------------------------------- */

/** Which of an account's data an export covers. */
export interface TakeoutScope {
  readonly contacts?: boolean
  /** Message history with people. */
  readonly privateChats?: boolean
  /** Message history in basic groups. */
  readonly groups?: boolean
  /** Message history in supergroups. */
  readonly supergroups?: boolean
  readonly channels?: boolean
  /** Include files, up to {@link TakeoutScope.maxFileSize} bytes each. */
  readonly files?: boolean
  /** The largest file to include, in bytes. Only read when `files` is set. */
  readonly maxFileSize?: bigint
}

/**
 * An export in progress.
 *
 * Telegram treats a takeout as a second authorization laid over this one:
 * reads made through it do not mark anything as seen, and the rate limits are
 * an export's rather than a client's. A call is wrapped rather than routed
 * anywhere else, which is why this hands back a `call` rather than a client —
 * everything else about the connection is unchanged.
 */
export interface TakeoutSession {
  /** The identifier Telegram gave this export. */
  readonly id: bigint
  /** Make one call inside the export. */
  call(query: TlValue): Promise<TlValue>
  /**
   * End the export, saying whether it finished.
   *
   * Ending a takeout does not end this account's authorization — it closes the
   * export and nothing else. Saying it succeeded is what stops Telegram
   * offering to resume it.
   */
  finish(succeeded: boolean): Promise<void>
}

/**
 * Begin exporting this account's data.
 *
 * Telegram may refuse with `TAKEOUT_INIT_DELAY`, which is a wait rather than a
 * rejection: the account is asked to confirm on another device and the export
 * may begin once the delay has passed. The refusal is left as it arrives,
 * because the number of seconds it carries is the useful part.
 */
export async function initTakeoutSession(
  client: Operating,
  scope: TakeoutScope = {},
): Promise<TakeoutSession> {
  if (scope.maxFileSize !== undefined && scope.files !== true) {
    throw new ValidationError('a maximum file size only means something when files are included')
  }

  const answer = await client.api.account.initTakeoutSession({
    ...(scope.contacts === true ? { contacts: true } : {}),
    ...(scope.privateChats === true ? { message_users: true } : {}),
    ...(scope.groups === true ? { message_chats: true } : {}),
    ...(scope.supergroups === true ? { message_megagroups: true } : {}),
    ...(scope.channels === true ? { message_channels: true } : {}),
    ...(scope.files === true ? { files: true } : {}),
    ...(scope.maxFileSize === undefined ? {} : { file_max_size: scope.maxFileSize }),
  })

  return takeoutSession(client, answer.id)
}

/** A takeout session over an identifier Telegram already issued. */
function takeoutSession(client: Operating, id: bigint): TakeoutSession {
  let open = true

  return {
    id,
    call: async (query) => {
      if (!open) throw new ValidationError('this export has already been finished')

      // Every call inside an export is the same call wrapped, which is what
      // makes a takeout a scope rather than a different connection.
      return (await client.api.call({
        _: 'invokeWithTakeout',
        takeout_id: id,
        query,
      } as never)) as unknown as TlValue
    },
    finish: async (succeeded) => {
      if (!open) return

      open = false
      await client.api.account.finishTakeoutSession(succeeded ? { success: true } : {})
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Calls with defaults bound in                                                */
/* -------------------------------------------------------------------------- */

/**
 * Defaults applied to every call made through a bound view.
 *
 * Only what the call path actually honours. A view that accepted a retry count
 * or a flood threshold would be describing behaviour nothing here implements,
 * and a caller would have no way to tell the difference until it mattered.
 */
export interface CallDefaults {
  /** How long to wait for an answer, in milliseconds. */
  readonly timeout?: number
  /** Stop waiting for a connection. Has no effect once a call has gone out. */
  readonly signal?: AbortSignal
}

/**
 * The same account with call options applied unless a call overrides them.
 *
 * A view rather than a copy: it holds the account it was made from and forwards
 * to it, so the connection, the session, the peer store and the update stream
 * are the one account's. Nothing here is a second authorization — that is what
 * {@link initTakeoutSession} is — and stopping the account stops calls made
 * through this too.
 */
export interface BoundCalls {
  /** Make one call with the bound defaults. */
  call(query: TlValue, options?: CallDefaults): Promise<TlValue>
  /** The defaults this view applies. */
  readonly defaults: CallDefaults
  /** A further view, with these defaults over this one's. */
  with(defaults: CallDefaults): BoundCalls
}

/** What binding defaults needs: a way to make a call that takes options. */
export interface Calling {
  call(query: TlValue, options?: CallDefaults): Promise<TlValue>
}

/**
 * Bind call defaults to a client.
 *
 * Merged rather than replaced when views are nested, with the inner view's
 * defaults winning — so a view made for one slow operation inherits everything
 * else the outer view was configured with.
 */
export function withParams(client: Calling, defaults: CallDefaults): BoundCalls {
  return {
    defaults,
    call: async (query, options) => await client.call(query, { ...defaults, ...options }),
    with: (further) => withParams(client, { ...defaults, ...further }),
  }
}

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Whether a peer is this account.
 *
 * Answered from what the account already knows where it can be: `inputPeerSelf`
 * says so outright, and a user peer is compared against the identifier the
 * account recorded when it signed in. Only a peer named by something this
 * account has never resolved needs a call, and that call is the one that would
 * have been needed anyway.
 */
export async function isSelfPeer(
  client: Operating & { selfId(): Promise<bigint | undefined> },
  peer: string | PeerRef,
): Promise<boolean> {
  if (peer === 'me' || peer === 'self') return true

  const self = await client.selfId()
  if (self !== undefined && typeof peer === 'object' && peer.kind === 'user') {
    return peer.id === self
  }

  const resolved = await client.resolve(peer)
  if (resolved._ === 'inputPeerSelf') return true
  if (resolved._ !== 'inputPeerUser') return false

  return resolved.user_id === (self ?? (await client.selfId()))
}

/* -------------------------------------------------------------------------- */
/* Collectibles                                                                */
/* -------------------------------------------------------------------------- */

/** What a collectible username or number was bought for. */
export interface CollectibleInfo {
  /** When it was bought, in Unix seconds. */
  readonly purchaseDate: number
  /** The currency of {@link CollectibleInfo.amount}. */
  readonly currency: string
  /** The price, in the currency's smallest unit. */
  readonly amount: bigint
  /** The cryptocurrency it was paid in. */
  readonly cryptoCurrency: string
  /** The amount paid, in that cryptocurrency's smallest unit. */
  readonly cryptoAmount: bigint
  /** Where it can be looked at. */
  readonly url: string
}

/** Which kind of collectible is being asked about. */
export type CollectibleKind = 'username' | 'phone'

/**
 * What a collectible username or phone number sold for.
 *
 * Public information about an auctioned handle, and nothing to do with whoever
 * holds it now.
 */
export async function getCollectibleInfo(
  client: Operating,
  kind: CollectibleKind,
  item: string,
): Promise<CollectibleInfo> {
  const collectible =
    kind === 'username'
      ? { _: 'inputCollectibleUsername' as const, username: item.replace(/^@/, '') }
      : { _: 'inputCollectiblePhone' as const, phone: item }

  const answer = await client.api.fragment.getCollectibleInfo({ collectible })

  return {
    purchaseDate: answer.purchase_date,
    currency: answer.currency,
    amount: answer.amount,
    cryptoCurrency: answer.crypto_currency,
    cryptoAmount: answer.crypto_amount,
    url: answer.url,
  }
}
