// SPDX-License-Identifier: MIT

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
 * surfaces as a defect in whichever plugin happened to run first. All three
 * are found before any plugin's install runs, so a set that cannot be
 * installed never half runs.
 *
 * An install that throws is the one failure that can only be found by
 * running. The plugins installed before it in the same round are disposed, in
 * reverse, so a connection one of them opened is not left open; the failure is
 * a {@link PluginInstallError} naming the plugin, with its error as the cause;
 * and the registry stays failed. It does not try again: what the earlier
 * installs registered on their host cannot be taken back, and installing them
 * a second time would register it twice.
 */

import {
  PluginConflictError,
  PluginCycleError,
  PluginDependencyError,
  PluginInstallError,
} from '../errors/errors.js'

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
  /**
   * Releases what `install` acquired: a connection, a timer, a subscription.
   *
   * Called when a plugin installed after this one fails, with what this
   * one's install returned, so that a set that did not install leaves nothing
   * running. Optional: a plugin that only registers middleware has nothing to
   * release.
   */
  dispose?(value: Ext, target: Target): void | Promise<void>
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
  #failure: PluginInstallError | undefined

  /** The install failure this registry is stuck on, if one happened. */
  get failure(): PluginInstallError | undefined {
    return this.#failure
  }

  /** Queue a plugin for installation. */
  add(plugin: Plugin<string, unknown, Target>): this {
    if (this.#failure !== undefined) throw this.#failure
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
    if (this.#failure !== undefined) throw this.#failure
    if (this.#pending.length === 0) return []

    // Represent already-installed plugins so a new plugin may depend on them.
    const satisfied: Array<Plugin<string, unknown, Target>> = [...this.#installed.keys()].map(
      (name) => ({ name, install: () => undefined }),
    )

    // Everything that can be known without running an install is settled
    // here, before any of them runs.
    const ordered = resolveInstallOrder([...satisfied, ...this.#pending])
    const pendingNames = new Set(this.#pending.map((plugin) => plugin.name))
    const results: Array<InstalledPlugin & { readonly plugin: Plugin<string, unknown, Target> }> =
      []

    for (const plugin of ordered) {
      if (!pendingNames.has(plugin.name)) continue

      let value: unknown
      try {
        value = await plugin.install(target)
      } catch (error) {
        const cleanup = await this.#rollBack(results, target)
        this.#failure = new PluginInstallError(plugin.name, error, cleanup)
        throw this.#failure
      }
      // Recorded at once, so a later install in the same round can read it.
      this.#installed.set(plugin.name, value)
      results.push({ name: plugin.name, value, plugin })
    }

    this.#pending.length = 0
    return results.map(({ name, value }) => ({ name, value }))
  }

  /** Dispose what a failed round installed, newest first, keeping every error. */
  async #rollBack(
    installed: ReadonlyArray<{
      readonly plugin: Plugin<string, unknown, Target>
      readonly value: unknown
    }>,
    target: Target,
  ): Promise<unknown[]> {
    const errors: unknown[] = []
    for (const { plugin, value } of [...installed].reverse()) {
      this.#installed.delete(plugin.name)
      try {
        await plugin.dispose?.(value, target)
      } catch (error) {
        errors.push(error)
      }
    }
    return errors
  }
}
