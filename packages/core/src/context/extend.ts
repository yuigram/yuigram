/**
 * Context construction and extension.
 *
 * Two mechanisms, for two different needs:
 *
 * - `defineLazy` attaches a property that computes on first access and caches.
 *   Decoding a field nobody reads is pure waste, and at volume the waste is
 *   most of the per-update cost. A bot handling only `/start` should not pay to
 *   decode the sender, entities and media of every message that passes through.
 *
 * - `ContextExtender` lets plugins contribute members under their own name,
 *   applied when a context is built.
 *
 * Retrofitting laziness later would mean touching every context type and every
 * test, so it is the default from the start.
 */

import { YuigramError } from '../errors/errors.js'

/** Raised when two extensions claim the same context key. */
export class ContextKeyConflictError extends YuigramError {
  override readonly name = 'ContextKeyConflictError'

  constructor(key: string, owner: string) {
    super(`context key '${key}' is already provided by '${owner}'`)
  }
}

/** Options for {@link defineLazy}. */
export interface LazyOptions {
  /**
   * Whether the property appears in enumeration and serialization.
   * Defaults to `true`. Set `false` for anything credential-bearing, so it
   * cannot escape through `JSON.stringify`.
   */
  readonly enumerable?: boolean
}

/**
 * Attach a property computed on first access and cached thereafter.
 *
 * The getter replaces itself with the computed value, so subsequent reads cost
 * a plain property access and the factory runs at most once.
 */
export function defineLazy<T>(
  target: object,
  key: string,
  factory: () => T,
  options: LazyOptions = {},
): void {
  const enumerable = options.enumerable ?? true

  Object.defineProperty(target, key, {
    configurable: true,
    enumerable,
    get(): T {
      const value = factory()
      Object.defineProperty(target, key, { configurable: true, enumerable, value })
      return value
    },
  })
}

/** A contribution a plugin makes to every context. */
export interface ContextContribution {
  /** Name of the plugin providing this, used in conflict reports. */
  readonly owner: string
  /** The context key this provides. */
  readonly key: string
  /** Produces the value. Called lazily, once per context, on first access. */
  readonly value: (context: object) => unknown
  /** Whether the member is enumerable. Defaults to `true`. */
  readonly enumerable?: boolean
}

/**
 * Registry of context contributions.
 *
 * Conflicts are rejected at registration time rather than silently overwriting,
 * because a plugin whose member is shadowed fails in ways that point at the
 * wrong plugin.
 */
export class ContextExtender {
  readonly #contributions = new Map<string, ContextContribution>()

  /** Register a contribution. Throws when the key is already claimed. */
  add(contribution: ContextContribution): this {
    const existing = this.#contributions.get(contribution.key)

    if (existing !== undefined) {
      throw new ContextKeyConflictError(contribution.key, existing.owner)
    }

    this.#contributions.set(contribution.key, contribution)
    return this
  }

  /** Whether a key has been claimed. */
  has(key: string): boolean {
    return this.#contributions.has(key)
  }

  /** Claimed keys, in registration order. */
  get keys(): readonly string[] {
    return [...this.#contributions.keys()]
  }

  /** Apply every contribution to a context, lazily. */
  apply<C extends object>(context: C): C {
    for (const contribution of this.#contributions.values()) {
      defineLazy(context, contribution.key, () => contribution.value(context), {
        enumerable: contribution.enumerable ?? true,
      })
    }
    return context
  }
}
