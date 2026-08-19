/**
 * Shared types for the architecture invariant checks.
 *
 * Each invariant is a pure function over a workspace description, so it can be
 * exercised in tests against synthetic fixtures without touching the real
 * repository. The CLI is the only part that performs I/O.
 */

/** A single rule violation, reported with enough context to act on it. */
export interface Violation {
  /** Repository-relative path the violation was found in. */
  readonly file: string
  /** 1-indexed line, when the violation anchors to one. */
  readonly line?: number
  /** What is wrong, in one sentence. */
  readonly message: string
  /** Why the rule exists, so the fix is not merely mechanical. */
  readonly rationale: string
}

/** The result of running one invariant. */
export interface InvariantResult {
  readonly name: string
  readonly violations: readonly Violation[]
}

/** A package as seen by the invariant checks. */
export interface WorkspacePackage {
  /** Package name from its manifest, e.g. `@yuigram/core`. */
  readonly name: string
  /** Repository-relative directory, e.g. `packages/core`. */
  readonly dir: string
  /** Merged runtime dependency names (`dependencies` + `peerDependencies`). */
  readonly runtimeDependencies: readonly string[]
  /** Development-only dependency names. */
  readonly devDependencies: readonly string[]
  /** Source files belonging to this package. */
  readonly sources: readonly SourceFile[]
}

/** A source file plus the module specifiers it imports. */
export interface SourceFile {
  /** Repository-relative path. */
  readonly path: string
  /** Raw file contents. */
  readonly text: string
  /** Module specifiers this file imports or re-exports from. */
  readonly imports: readonly ImportRef[]
}

/** A single module specifier with its source location. */
export interface ImportRef {
  /** The specifier exactly as written, e.g. `node:crypto` or `@yuigram/core`. */
  readonly specifier: string
  /** 1-indexed line the specifier appears on. */
  readonly line: number
}

/** Everything the invariants need to know about the repository. */
export interface Workspace {
  readonly root: string
  readonly packages: readonly WorkspacePackage[]
}

/** An invariant is a pure function from a workspace to its violations. */
export type Invariant = (workspace: Workspace) => InvariantResult
