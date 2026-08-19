/**
 * Yuigram — an independent TypeScript framework for the Telegram Bot API
 * and MTProto.
 *
 * This package is the façade users install. It re-exports the public surface
 * and owns the application container; it contains almost no logic of its own.
 *
 * The public API is not yet available. See `docs/roadmap.md` for the delivery
 * plan and `docs/api-design.md` for the intended surface.
 */

/** Schema versions this build was generated against. */
export const schemaInfo = {
  /** Telegram Bot API version. Populated once the Bot API subsystem lands. */
  botApi: null,
  /** Telegram TL schema layer. Populated once the MTProto subsystem lands. */
  tlLayer: null,
} as const
