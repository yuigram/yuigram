/**
 * The plugin system.
 *
 * A plugin is a descriptor with a name, optional dependencies, and an install
 * function returning whatever it contributes. Installation order is resolved
 * topologically, so a plugin declares what it needs rather than documenting
 * where it must be placed.
 *
 * Failures are explicit and named. A missing dependency, a duplicate name and
 * a cycle each produce a distinct error identifying the plugins involved,
 * because the alternative — installing in the wrong order and failing later —
 * surfaces as a defect in whichever plugin happened to run first.
 */

import { PluginConflictError, PluginCycleError, PluginDependencyError } from '../errors/errors.js'

/**
 * A plugin.
 *
 * `Ext` is whatever `install` returns, attached to the target under `name`.
 * Returning nothing is fine for plugins that only register middleware.
 */
export interface Plugin<N extends string = string, Ext = void, Target = unknown> {
  /** Unique name. Also the key its contribution is attached under. */
  readonly name: N
  /** Names of plugins that must be installed first. */
  readonly dependsOn?: readonly string[]
  /** Performs installation and returns the plugin's contribution. */
  install(target: Target): Ext | Promise<Ext>
}

/**
 * Define a plugin.
 *
 * A helper rather than a class, because a function returning a descriptor
 * composes better and is easier to type.
 */
export function definePlugin<N extends string, Ext = void, Target = unknown>(
  spec: Plugin<N, Ext, Target>,
): Plugin<N, Ext, Target> {
  return spec
}

/**
 * Order plugins so every dependency precedes its dependents.
 *
 * Depth-first with an explicit on-stack set, which is what makes a cycle
 * reportable as the actual path rather than a stack overflow.
 */
export function resolveInstallOrder<T extends Plugin<string, unknown, never>>(
  plugins: readonly T[],
): T[] {
  const byName = new Map<string, T>()

  for (const plugin of plugins) {
    if (byName.has(plugin.name)) throw new PluginConflictError(plugin.name)
    byName.set(plugin.name, plugin)
  }

  const ordered: T[] = []
  const settled = new Set<string>()
  const onStack = new Set<string>()

  const visit = (name: string, path: readonly string[]): void => {
    if (settled.has(name)) return
    if (onStack.has(name)) throw new PluginCycleError([...path, name])

    const plugin = byName.get(name)
    if (plugin === undefined) return

    onStack.add(name)

    for (const dependency of plugin.dependsOn ?? []) {
      if (!byName.has(dependency)) throw new PluginDependencyError(name, dependency)
      visit(dependency, [...path, name])
    }

    onStack.delete(name)
    settled.add(name)
    ordered.push(plugin)
  }

  for (const plugin of plugins) visit(plugin.name, [])

  return ordered
}

/** A plugin whose install has run, with whatever it produced. */
export interface InstalledPlugin {
  readonly name: string
  readonly value: unknown
}

/**
 * Installs plugins onto a target and records their contributions.
 *
 * Installation is deferred until `install()` so that dependency resolution
 * sees the complete set. Registering plugins one at a time and installing
 * eagerly would make ordering depend on registration order, which is the
 * problem this exists to remove.
 */
export class PluginRegistry<Target> {
  readonly #pending: Array<Plugin<string, unknown, Target>> = []
  readonly #installed = new Map<string, unknown>()

  /** Queue a plugin for installation. */
  add(plugin: Plugin<string, unknown, Target>): this {
    if (this.#installed.has(plugin.name)) throw new PluginConflictError(plugin.name)
    if (this.#pending.some((queued) => queued.name === plugin.name)) {
      throw new PluginConflictError(plugin.name)
    }

    this.#pending.push(plugin)
    return this
  }

  /** Whether a plugin is queued or installed. */
  has(name: string): boolean {
    return this.#installed.has(name) || this.#pending.some((plugin) => plugin.name === name)
  }

  /** The contribution of an installed plugin. */
  get(name: string): unknown {
    return this.#installed.get(name)
  }

  /** Names of installed plugins, in installation order. */
  get names(): readonly string[] {
    return [...this.#installed.keys()]
  }

  /**
   * How many plugins are queued but not yet installed.
   *
   * Lets a caller skip the install path entirely on the common case — an
   * update arriving at a client whose plugins are already in place — without
   * paying for a promise per update to discover there was nothing to do.
   */
  get pending(): number {
    return this.#pending.length
  }

  /**
   * Install every queued plugin in dependency order.
   *
   * Already-installed plugins count towards dependency satisfaction, so
   * installing in several rounds behaves the same as installing in one.
   */
  async install(target: Target): Promise<readonly InstalledPlugin[]> {
    if (this.#pending.length === 0) return []

    // Represent already-installed plugins so a new plugin may depend on them.
    const satisfied: Array<Plugin<string, unknown, Target>> = [...this.#installed.keys()].map(
      (name) => ({ name, install: () => undefined }),
    )

    const ordered = resolveInstallOrder([...satisfied, ...this.#pending])
    const pendingNames = new Set(this.#pending.map((plugin) => plugin.name))
    const results: InstalledPlugin[] = []

    for (const plugin of ordered) {
      if (!pendingNames.has(plugin.name)) continue

      const value = await plugin.install(target)
      this.#installed.set(plugin.name, value)
      results.push({ name: plugin.name, value })
    }

    this.#pending.length = 0
    return results
  }
}
