/**
 * Filter construction and composition.
 *
 * `kinds` metadata is merged according to what each combinator can promise:
 *
 * - `and` — the intersection. Both must match, so the result can only fire for
 *   kinds both accept. An operand with no hint constrains nothing.
 * - `or`  — the union, but only when *both* operands carry a hint. If either
 *   may match anything, so may the union.
 * - `not` — always undefined. A negation matches every kind the operand rejects,
 *   which is not expressible as a list.
 *
 * Getting this wrong would make the dispatcher skip filters that should have
 * run, which is a silently-dropped update rather than a visible error.
 */

import type { AnyFilter, AsyncFilter, Filter, FilterMeta } from './types.js'

/** Options accepted when defining a filter. */
export interface DefineOptions {
  /** Kinds this filter can match. Omit when it may match anything. */
  readonly kinds?: readonly string[] | undefined
}

/** Intersect two kind hints. `undefined` means "unconstrained". */
function intersectKinds(
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
): readonly string[] | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  const inB = new Set(b)
  return a.filter((kind) => inB.has(kind))
}

/** Union two kind hints. Unconstrained on either side means unconstrained. */
function unionKinds(
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
): readonly string[] | undefined {
  if (a === undefined || b === undefined) return undefined
  return [...new Set([...a, ...b])]
}

/** True when the value is a filter of either flavour. */
export function isFilter(value: unknown): value is AnyFilter {
  return (
    typeof value === 'function' &&
    typeof (value as Partial<FilterMeta>).name === 'string' &&
    typeof (value as Partial<Filter>).and === 'function' &&
    typeof (value as Partial<Filter>).or === 'function' &&
    typeof (value as Partial<Filter>).not === 'function'
  )
}

/** True when the filter's predicate returns a promise. */
export function isAsyncFilter(value: AnyFilter): value is AsyncFilter {
  return ASYNC_FILTERS.has(value)
}

/** Identifies async filters without relying on inspecting the predicate. */
const ASYNC_FILTERS = new WeakSet<AnyFilter>()

/**
 * Build a synchronous filter from a predicate.
 *
 * The predicate may be a plain boolean function or a type guard; a type guard
 * additionally makes a raw `if (filter(x))` narrow `x` to `Base`.
 */
export function defineFilter<Base = unknown, Mod = unknown>(
  name: string,
  predicate: (value: unknown) => boolean,
  options: DefineOptions = {},
): Filter<Base, Mod> {
  const filter = ((value: unknown) => predicate(value)) as Filter<Base, Mod>

  Object.defineProperties(filter, {
    name: { value: name, configurable: true },
    kinds: { value: options.kinds, enumerable: true },
    and: { value: <B2, M2>(other: AnyFilter<B2, M2>) => and(filter, other) },
    or: { value: <B2, M2>(other: AnyFilter<B2, M2>) => or(filter, other) },
    not: { value: () => not(filter) },
  })

  return filter
}

/**
 * Build an asynchronous filter from a predicate returning a promise.
 *
 * Does not narrow at the call site — TypeScript has no async type predicate.
 */
export function defineAsyncFilter<Base = unknown, Mod = unknown>(
  name: string,
  predicate: (value: unknown) => Promise<boolean>,
  options: DefineOptions = {},
): AsyncFilter<Base, Mod> {
  const filter = ((value: unknown) => predicate(value)) as AsyncFilter<Base, Mod>

  Object.defineProperties(filter, {
    name: { value: name, configurable: true },
    kinds: { value: options.kinds, enumerable: true },
    and: { value: <B2, M2>(other: AnyFilter<B2, M2>) => and(filter, other) },
    or: { value: <B2, M2>(other: AnyFilter<B2, M2>) => or(filter, other) },
    not: { value: () => not(filter) },
  })

  ASYNC_FILTERS.add(filter)
  return filter
}

/** Evaluate a filter, awaiting only when it is asynchronous. */
function evaluate(filter: AnyFilter, value: unknown): boolean | Promise<boolean> {
  return (filter as (input: unknown) => boolean | Promise<boolean>)(value)
}

/** True when either operand is asynchronous. */
function eitherIsAsync(a: AnyFilter, b: AnyFilter): boolean {
  return isAsyncFilter(a) || isAsyncFilter(b)
}

/**
 * Match when both filters match.
 *
 * Short-circuits: the second predicate is not evaluated when the first fails.
 */
export function and<B1, M1, B2, M2>(a: Filter<B1, M1>, b: Filter<B2, M2>): Filter<B1 & B2, M1 & M2>
export function and<B1, M1, B2, M2>(
  a: AnyFilter<B1, M1>,
  b: AnyFilter<B2, M2>,
): AsyncFilter<B1 & B2, M1 & M2>
export function and(a: AnyFilter, b: AnyFilter): AnyFilter {
  const name = `${a.name} and ${b.name}`
  const kinds = intersectKinds(a.kinds, b.kinds)

  if (eitherIsAsync(a, b)) {
    return defineAsyncFilter(
      name,
      async (value) => ((await evaluate(a, value)) ? await evaluate(b, value) : false),
      { kinds },
    )
  }

  return defineFilter(
    name,
    (value) => (evaluate(a, value) as boolean) && (evaluate(b, value) as boolean),
    {
      kinds,
    },
  )
}

/**
 * Match when either filter matches.
 *
 * Short-circuits: the second predicate is not evaluated when the first passes.
 */
export function or<B1, M1, B2, M2>(a: Filter<B1, M1>, b: Filter<B2, M2>): Filter<B1 | B2, M1 | M2>
export function or<B1, M1, B2, M2>(
  a: AnyFilter<B1, M1>,
  b: AnyFilter<B2, M2>,
): AsyncFilter<B1 | B2, M1 | M2>
export function or(a: AnyFilter, b: AnyFilter): AnyFilter {
  const name = `${a.name} or ${b.name}`
  const kinds = unionKinds(a.kinds, b.kinds)

  if (eitherIsAsync(a, b)) {
    return defineAsyncFilter(
      name,
      async (value) => ((await evaluate(a, value)) ? true : await evaluate(b, value)),
      { kinds },
    )
  }

  return defineFilter(
    name,
    (value) => (evaluate(a, value) as boolean) || (evaluate(b, value) as boolean),
    {
      kinds,
    },
  )
}

/**
 * Match when the filter does not.
 *
 * Drops both narrowings, and drops the kind hint: a negation matches every
 * kind its operand rejects, which no list can express.
 */
export function not<B, M>(filter: Filter<B, M>): Filter<unknown, unknown>
export function not<B, M>(filter: AnyFilter<B, M>): AsyncFilter<unknown, unknown>
export function not(filter: AnyFilter): AnyFilter {
  const name = `not ${filter.name}`

  if (isAsyncFilter(filter)) {
    return defineAsyncFilter(name, async (value) => !(await evaluate(filter, value)))
  }

  return defineFilter(name, (value) => !(evaluate(filter, value) as boolean))
}

/** Match when every filter matches. Reads better than chained `and` for long lists. */
export function every(...filters: readonly Filter[]): Filter {
  if (filters.length === 0) return defineFilter('every()', () => true)
  return filters.reduce((acc, filter) => and(acc, filter))
}

/** Match when any filter matches. Reads better than chained `or` for long lists. */
export function some(...filters: readonly Filter[]): Filter {
  if (filters.length === 0) return defineFilter('some()', () => false)
  return filters.reduce((acc, filter) => or(acc, filter))
}
