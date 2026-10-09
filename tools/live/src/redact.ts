// SPDX-License-Identifier: MPL-2.0

/**
 * Keeping what the harness prints free of what it was given.
 *
 * Every line goes through a scrubber that replaces each secret the environment
 * holds — the bot token, the api hash, the session string — and anything that
 * looks like one: a bot token's shape, a long base64 run. Identifiers of users
 * and chats are shortened to their last three digits, enough to tell two apart
 * in a report and not enough to find anybody.
 */

/** Replaces secrets and token-shaped text in a line. */
export type Scrubber = (text: string) => string

/** A scrubber for the given secrets, and for anything shaped like one. */
export function scrubber(secrets: readonly string[]): Scrubber {
  const known = [...secrets]
    .filter((secret) => secret.length >= 4)
    .sort((a, b) => b.length - a.length)

  return (text) => {
    let out = text
    for (const secret of known) out = out.split(secret).join('[redacted]')
    return (
      out
        // A bot token: digits, a colon, 35 or so characters.
        .replace(/\b\d{5,}:[A-Za-z0-9_-]{30,}\b/g, '[redacted token]')
        // A long run of base64, as a session string or a key would print.
        .replace(/[A-Za-z0-9+/_-]{64,}={0,2}/g, '[redacted data]')
    )
  }
}

/** An identifier, shortened to what tells two apart. */
export function shortId(id: number | bigint | string): string {
  const text = String(id)
  return text.length <= 3 ? text : `…${text.slice(-3)}`
}
