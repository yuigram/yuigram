/**
 * Carrying an account's authorization from one datacenter to another.
 *
 * A datacenter that redirects a request is saying the account lives elsewhere,
 * and reaching that other datacenter is not enough on its own: each datacenter
 * knows the account only if the account has been introduced to it. The
 * introduction is a short exchange — the datacenter holding the account issues
 * a credential naming the one to hand it to, and that datacenter accepts it.
 *
 * ```
 *   holding datacenter ──> credential ──> target datacenter
 * ```
 *
 * **No key moves.** The credential is about the account, not about the keys
 * protecting the connections carrying it. Each datacenter keeps its own
 * authorization key, obtained and stored the way every other one is, and this
 * changes nothing about who owns them: the credential travels over connections
 * that are already authorized, and what it establishes is that the account on
 * one is the account on the other.
 *
 * The credential is short-lived and single-use by design, so it is produced and
 * spent in one operation rather than stored. Nothing here decides *when* to do
 * that — a redirection is answered by whatever knows why the call was being
 * made, and this is the mechanism it uses.
 */

import { SessionError } from '@yuigram/core'
import type { TlValue } from '../tl/index.js'

/**
 * Something a call can be made on.
 *
 * Structural rather than named, because the two ends of a transfer are not the
 * same kind of thing: one is whatever connection observed the redirection, the
 * other is a connection to the datacenter it named. Both answer calls, and that
 * is all this needs of either.
 */
export interface Callable {
  invoke(query: TlValue): Promise<TlValue>
}

/** A credential naming an account, issued for one datacenter to accept. */
export interface ExportedAuthorization {
  /** The account the credential is about. */
  readonly id: bigint
  /** The proof the accepting datacenter checks. */
  readonly bytes: Uint8Array
}

/**
 * Read a credential, refusing one that is not fully formed.
 *
 * Checked before it is used rather than after it fails: a credential missing
 * either half is refused by the accepting datacenter with an error about the
 * request instead of about the credential, which would name the wrong problem.
 */
export function readExportedAuthorization(value: TlValue): ExportedAuthorization {
  if (value._ !== 'auth.exportedAuthorization') {
    throw new SessionError(`expected an exported authorization, received '${value._}'`)
  }

  const id = value['id']
  if (typeof id !== 'bigint') {
    throw new SessionError("'auth.exportedAuthorization.id' must be a 64-bit integer")
  }

  const bytes = value['bytes']
  if (!(bytes instanceof Uint8Array)) {
    throw new SessionError("'auth.exportedAuthorization.bytes' must be a byte string")
  }
  if (bytes.length === 0) {
    throw new SessionError("'auth.exportedAuthorization.bytes' is empty")
  }

  return { id, bytes }
}

/** Ask the datacenter holding the account for a credential naming another. */
export async function exportAuthorization(
  holder: Callable,
  dcId: number,
): Promise<ExportedAuthorization> {
  if (!Number.isInteger(dcId) || dcId <= 0) {
    throw new SessionError(`a datacenter identifier must be a positive integer, received ${dcId}`)
  }

  return readExportedAuthorization(
    await holder.invoke({ _: 'auth.exportAuthorization', dc_id: dcId }),
  )
}

/** Present a credential to the datacenter it was issued for. */
export async function importAuthorization(
  target: Callable,
  credential: ExportedAuthorization,
): Promise<void> {
  await target.invoke({
    _: 'auth.importAuthorization',
    id: credential.id,
    bytes: credential.bytes,
  })
}

/** Both ends of a transfer, and which datacenter the credential is for. */
export interface TransferOptions {
  /** The connection to the datacenter that holds the account. */
  readonly from: Callable
  /** The connection to the datacenter that should learn about it. */
  readonly to: Callable
  /** The datacenter the credential is issued for. */
  readonly dcId: number
}

/**
 * Introduce an account to another datacenter.
 *
 * The credential is issued and spent without being kept: it is valid briefly
 * and only once, so storing it would leave something that is worthless by the
 * time anything read it back and dangerous in the moment it was not.
 *
 * A failure at either end leaves nothing behind. The issuing datacenter does
 * not record what it handed out, and the accepting one either learns the
 * account or does not — so a transfer that failed is repeated by asking for
 * another credential rather than by presenting the same one again.
 */
export async function transferAuthorization(options: TransferOptions): Promise<void> {
  await importAuthorization(options.to, await exportAuthorization(options.from, options.dcId))
}
