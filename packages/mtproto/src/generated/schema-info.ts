// GENERATED FILE — do not edit.
// Pinned protocol layer
// Source: Telegram TL layer 232, schemas/tl/api.232.tl
// SPDX-License-Identifier: MIT AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

/**
 * The TL layer this build speaks.
 * 
 * Sent once per connection and never configurable: the codecs were
 * emitted from this layer, so announcing another would claim a wire
 * contract the generated types do not implement.
 */
export const TL_LAYER = 232 as const
