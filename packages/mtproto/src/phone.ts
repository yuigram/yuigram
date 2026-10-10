// SPDX-License-Identifier: MIT

/**
 * A phone number as Telegram takes one in a sign-in.
 *
 * Telegram wants the digits of an international number and nothing else. A
 * person types `+1 (555) 010-0000`, so the characters people write between
 * digits — the plus, brackets, spaces and dashes — are taken out.
 *
 * Nothing else is decided here. Whether the digits are a number that exists is
 * Telegram's to answer, and no country code is assumed for a number written
 * without one: a local number sent as it is reaches the wrong country, which
 * is a failure only the person who typed it can see.
 */

import { ValidationError } from './core.js'

/**
 * The digits of a phone number.
 *
 * ```ts
 * normalizePhone(' +44 (20) 7946-0000 ') // '442079460000'
 * ```
 *
 * Refused when anything other than those separators is left, or nothing is.
 */
export function normalizePhone(phone: string): string {
  const digits = phone.trim().replace(/[+()\s-]/g, '')

  if (!/^\d+$/.test(digits)) {
    throw new ValidationError(
      'a phone number is digits, written with an optional +, brackets, spaces and dashes',
    )
  }

  return digits
}
