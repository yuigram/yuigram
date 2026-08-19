/**
 * The filter type machinery.
 *
 * A filter is a callable type guard carrying two independent type parameters
 * and a runtime metadata object:
 *
 * - `Base` narrows *which* value this is (`MessageContext`, `CallbackContext`).
 * - `Mod` narrows *the shape of its fields* (`{ text: string }`, where the base
 *   declared `string | undefined`).
 *
 * They compose independently under `and` / `or`, so `kind('message').and(hasText)`
 * yields a handler argument whose `text` is a `string`.
 *
 * Core owns the machinery only. Concrete filters live in the transport
 * packages, which are the layers that know what a message or a chat is.
 */

/**
 * Key-replacement intersection: `Mod`'s keys replace `Base`'s rather than
 * intersecting with them.
 *
 * For plain data properties a naive `Base & Mod` happens to read the same way —
 * `(string | undefined) & string` is `string` — so the difference only shows up
 * on **call signatures**, where intersection builds an overload set instead of
 * replacing the member:
 *
 * ```
 * Base   = { reply(text: string): Promise<void> }
 * Mod    = { reply(text: string, extra: number): Promise<void> }
 *
 * Base & Mod        -> ((text: string) => …) & ((text: string, extra: number) => …)
 * Modify<Base, Mod> -> (text: string, extra: number) => Promise<void>
 * ```
 *
 * That matters because context extension replaces methods, and an accidental
 * overload silently accepts calls the refinement was meant to rule out.
 * `Omit` also produces a cleaner displayed type, which shows up in every hover
 * and error message a user reads.
 *
 * When `Mod` is `unknown`, this collapses back to `Base`, which is what an
 * unrefined filter should produce.
 */
export type Modify<Base, Mod> = [Mod] extends [unknown]
  ? unknown extends Mod
    ? Base
    : Omit<Base, keyof Mod> & Mod
  : Omit<Base, keyof Mod> & Mod

/**
 * Static metadata attached to every filter.
 *
 * `kinds` lets the dispatcher skip a filter entirely for values whose `kind`
 * is not listed, before evaluating any predicate. `undefined` means "may match
 * anything", so the dispatcher must evaluate it.
 */
export interface FilterMeta {
  /** Human-readable name, used by diagnostics. */
  readonly name: string
  /** Kind hint for the dispatch fast path. `undefined` = evaluate always. */
  readonly kinds?: readonly string[] | undefined
}

/**
 * A synchronous filter: a callable type guard plus composition methods.
 *
 * `Base` and `Mod` are independent. A raw `if (filter(x))` narrows only `Base`,
 * because that is all a TypeScript type predicate can express; handler
 * registration applies `Modify<Base, Mod>` to get the full refinement.
 */
export interface Filter<Base = unknown, Mod = unknown> extends FilterMeta {
  (value: unknown): value is Base
  /** Match when both match. Intersects `Base` and `Mod`. */
  readonly and: <B2, M2>(other: Filter<B2, M2>) => Filter<Base & B2, Mod & M2>
  /** Match when either matches. Unions `Base` and `Mod`. */
  readonly or: <B2, M2>(other: Filter<B2, M2>) => Filter<Base | B2, Mod | M2>
  /** Match when this does not. Drops both narrowings — a negation proves nothing. */
  readonly not: () => Filter<unknown, unknown>
}

/**
 * An asynchronous filter.
 *
 * TypeScript has no async type predicate, so this does not narrow at the call
 * site. Composition with a synchronous filter yields an async filter.
 */
export interface AsyncFilter<Base = unknown, Mod = unknown> extends FilterMeta {
  (value: unknown): Promise<boolean>
  readonly and: <B2, M2>(other: AnyFilter<B2, M2>) => AsyncFilter<Base & B2, Mod & M2>
  readonly or: <B2, M2>(other: AnyFilter<B2, M2>) => AsyncFilter<Base | B2, Mod | M2>
  readonly not: () => AsyncFilter<unknown, unknown>
}

/** Either filter flavour. */
export type AnyFilter<Base = unknown, Mod = unknown> = Filter<Base, Mod> | AsyncFilter<Base, Mod>

/** Extract the `Base` narrowing from a filter type. */
export type ExtractBase<F> = F extends AnyFilter<infer B, infer _M> ? B : never

/** Extract the structural `Mod` refinement from a filter type. */
export type ExtractMod<F> = F extends AnyFilter<infer _B, infer M> ? M : never

/**
 * The type a handler sees for a value this filter matched.
 *
 * This is the type that actually matters at a registration site:
 * `on(filter, (ctx) => …)` types `ctx` as `FilterMatch<typeof filter>`.
 */
export type FilterMatch<F> = Modify<ExtractBase<F>, ExtractMod<F>>
