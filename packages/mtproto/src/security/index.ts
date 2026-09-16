/**
 * Managing a two-factor password, loaded when one is managed.
 *
 * Everything here forwards to `./password.js`, which is where the work is. The
 * indirection exists for one reason: that module reaches SRP, and SRP reaches
 * modular exponentiation, Miller-Rabin and the safe-prime table. A static edge
 * to it is a few hundred kilobytes of number theory parsed by every program
 * that loads the framework, including a bot that has no password to manage —
 * and `startup/import` is a budget on exactly that.
 *
 * The same shape the rest of the package already uses for work that is not on
 * the way up: the codec tables are resolved when an account connects, the
 * sign-in steps when one signs in, a download when one is asked for. Each of
 * these is `async` already, so the import costs a caller nothing it was not
 * already awaiting, and the second call pays nothing at all.
 *
 * The types are re-exported rather than forwarded, because a type is erased and
 * costs nothing to name.
 */

export type { NewPassword, PasswordStatus, Securing } from './password.js'

import type { NewPassword, PasswordStatus, Securing } from './password.js'

/** What this account's password protects, and what it would take to recover it. */
export async function passwordStatus(client: Securing): Promise<PasswordStatus> {
  return await (await import('./password.js')).passwordStatus(client)
}

/** Set a password, or change one this account already has. */
export async function setPassword(
  client: Securing,
  next: NewPassword,
  current?: string,
): Promise<void> {
  await (await import('./password.js')).setPassword(client, next, current)
}

/** Remove the password, proving the current one. */
export async function removePassword(client: Securing, current: string): Promise<void> {
  await (await import('./password.js')).removePassword(client, current)
}

/** Confirm the recovery address with the code sent to it. */
export async function confirmRecoveryEmail(client: Securing, code: string): Promise<void> {
  await (await import('./password.js')).confirmRecoveryEmail(client, code)
}

/** Send the confirmation code again. */
export async function resendRecoveryEmail(client: Securing): Promise<void> {
  await (await import('./password.js')).resendRecoveryEmail(client)
}

/** Give up on confirming the recovery address. */
export async function cancelRecoveryEmail(client: Securing): Promise<void> {
  await (await import('./password.js')).cancelRecoveryEmail(client)
}

/** Ask for a recovery code, and say where it was sent. */
export async function requestPasswordRecovery(client: Securing): Promise<string> {
  return await (await import('./password.js')).requestPasswordRecovery(client)
}

/** Check a recovery code without spending it. */
export async function checkRecoveryCode(client: Securing, code: string): Promise<boolean> {
  return await (await import('./password.js')).checkRecoveryCode(client, code)
}
