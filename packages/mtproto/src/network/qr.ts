/**
 * Signing in by showing a code to a device that is already signed in.
 *
 * The protocol half of this — asking for a token, following a datacenter that
 * says the account lives elsewhere, reading an approval — is
 * {@link requestLoginToken}. What is here is the loop around it, which is the
 * part a caller would otherwise have to write:
 *
 * ```
 *   request token ──> show it ──> wait ──┬──> approved ──> maybe a password
 *                         ▲              │
 *                         └── expired ───┘
 * ```
 *
 * Waiting is the interesting part. A token is good for about a minute, and
 * Telegram sends `updateLoginToken` the moment the other device approves it —
 * so the loop waits for whichever comes first, and asks again either way. The
 * update is an optimisation rather than a requirement: without it the next
 * request still observes the approval, just later.
 *
 * Nothing here is written down. A login token is a credential for the seconds
 * it is alive, so it is never logged, never stored, and never carried out of
 * this module except as the URL the caller displays.
 */

import { CancelledError, SessionError } from '@yuigram/core'
import type { LoginTokenState, SignInState } from './signin.js'

/** How the loop asks for a token and finishes with a password. */
export interface QrSteps {
  /** Ask for a token, or observe that one has been approved. */
  requestToken(options: { readonly exceptIds?: readonly bigint[] }): Promise<LoginTokenState>
  /** Finish a sign-in the token alone could not. */
  signInWithPassword(password: string): Promise<SignInState>
  /** Wait, cancellably. Returns a function that stops waiting. */
  schedule(run: () => void, delayMs: number): () => void
  /**
   * Be told when Telegram says a token was approved.
   *
   * Optional: without it the loop waits out each token instead, which costs
   * time and nothing else. The returned function unsubscribes.
   */
  onApproval?(notify: () => void): () => void
}

/** How a caller drives a QR sign-in. */
export interface QrOptions {
  /**
   * Show this to the user, as a QR code.
   *
   * Called again whenever the token changes, which is every time the previous
   * one expires. A display that is not updated shows a code that has stopped
   * working.
   */
  onToken(url: string, expires: Date): void
  /** Called once the other device has approved, before any password step. */
  onApproved?(): void
  /** The account's password, where it has one. Asked for only if needed. */
  password?: string | (() => string | Promise<string>)
  /** Authorizations to leave alone, by identifier. */
  exceptIds?: readonly bigint[]
  /** Give up. */
  signal?: AbortSignal
}

/**
 * The form a token is shown in.
 *
 * Telegram's own: `tg://login?token=` followed by the token in base64url with
 * the padding removed. A device scanning a QR code expects exactly this.
 */
export function loginUrl(token: Uint8Array): string {
  let binary = ''
  for (const byte of token) binary += String.fromCharCode(byte)

  const base64 = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  return `tg://login?token=${base64}`
}

/** A token is re-requested this long before it expires, to cover the round trip. */
const EXPIRY_MARGIN_MS = 2_000

/** And never waits longer than this, however far off the expiry claims to be. */
const MAX_WAIT_MS = 60_000

/**
 * Run the whole flow, resolving once the account is signed in.
 *
 * Every exit unsubscribes and cancels the pending timer: approval, a password
 * refusal, an abort, or a failure from any step. Nothing is left running behind
 * a promise that has settled.
 */
export async function signInQr(steps: QrSteps, options: QrOptions): Promise<SignInState> {
  const shown = new Set<string>()
  let stopWaiting: (() => void) | undefined
  let unsubscribe: (() => void) | undefined

  const clean = (): void => {
    stopWaiting?.()
    stopWaiting = undefined
    unsubscribe?.()
    unsubscribe = undefined
  }

  try {
    for (;;) {
      if (options.signal?.aborted === true) {
        throw new CancelledError('the QR sign-in was cancelled')
      }

      const state = await steps.requestToken({
        ...(options.exceptIds === undefined ? {} : { exceptIds: options.exceptIds }),
      })

      if (state.kind !== 'pending') {
        options.onApproved?.()

        return await finish(steps, state, options)
      }

      const url = loginUrl(state.token)
      // Telegram re-issues the same token while it is still good, and a caller
      // redrawing an unchanged QR code for no reason is a flicker.
      if (!shown.has(url)) {
        shown.clear()
        shown.add(url)
        options.onToken(url, new Date(state.expires * 1000))
      }

      await waitForApproval(steps, state, options, (cancel) => {
        stopWaiting = cancel.timer
        unsubscribe = cancel.subscription
      })
      clean()
    }
  } finally {
    clean()
  }
}

/** What the wait registered, so the caller can undo both. */
interface Registered {
  readonly timer: () => void
  readonly subscription: (() => void) | undefined
}

/**
 * Wait until the token is approved, expires, or the caller gives up.
 *
 * Resolves rather than reporting which happened: the next request observes the
 * approval either way, and a wait that ended early costs one extra call.
 */
async function waitForApproval(
  steps: QrSteps,
  state: Extract<LoginTokenState, { kind: 'pending' }>,
  options: QrOptions,
  registered: (cancel: Registered) => void,
): Promise<void> {
  const remaining = state.expires * 1000 - Date.now() - EXPIRY_MARGIN_MS
  const delay = Math.max(0, Math.min(remaining, MAX_WAIT_MS))

  await new Promise<void>((resolve, reject) => {
    let settled = false
    const once = (finish: () => void): void => {
      if (settled) return
      settled = true
      finish()
    }

    const timer = steps.schedule(() => {
      once(resolve)
    }, delay)
    const subscription = steps.onApproval?.(() => {
      once(resolve)
    })

    const abort = (): void => {
      once(() => {
        reject(new CancelledError('the QR sign-in was cancelled'))
      })
    }

    if (options.signal?.aborted === true) {
      abort()
    } else {
      options.signal?.addEventListener('abort', abort, { once: true })
    }

    registered({ timer, subscription })
  })
}

/** Finish an approved sign-in, asking for a password where Telegram wants one. */
async function finish(
  steps: QrSteps,
  state: SignInState,
  options: QrOptions,
): Promise<SignInState> {
  if (state.kind !== 'password-required') return state

  if (options.password === undefined) {
    throw new SessionError(
      'this account is protected by a password, and the QR sign-in was given none',
    )
  }

  const password =
    typeof options.password === 'function' ? await options.password() : options.password

  return await steps.signInWithPassword(password)
}
