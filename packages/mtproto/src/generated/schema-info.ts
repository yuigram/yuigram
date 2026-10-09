// GENERATED FILE — do not edit.
// Pinned protocol layer
// Source: Telegram TL layer 229, schemas/tl/api.229.tl
// SPDX-License-Identifier: MPL-2.0 AND BSL-1.0
// Derived from TDLib's schema, under the Boost Software License 1.0: see TDLIB-LICENSE.txt.

/**
 * The TL layer this build speaks.
 * 
 * Sent once per connection and never configurable: the codecs were
 * emitted from this layer, so announcing another would claim a wire
 * contract the generated types do not implement.
 */
export const TL_LAYER = 229 as const
