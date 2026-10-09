// SPDX-License-Identifier: MPL-2.0

/**
 * Plugin ordering and installation.
 *
 * The failure cases carry most of the value. Installing in the wrong order and
 * failing later surfaces as a defect in whichever plugin happened to run
 * first, so each failure mode has to be detected up front and named precisely.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  PluginConflictError,
  PluginCycleError,
  PluginDependencyError,
  PluginInstallError,
} from '../src/errors/errors.js'
import { definePlugin, PluginRegistry, resolveInstallOrder } from '../src/plugin/plugin.js'

interface Target {
  installed: string[]
}

function target(): Target {
  return { installed: [] }
}

/** A plugin that records its own installation. */
function recorder(name: string, dependsOn?: readonly string[]) {
  return definePlugin<string, string, Target>({
    name,
    ...(dependsOn === undefined ? {} : { dependsOn }),
    install(t) {
      t.installed.push(name)
      return `${name}-value`
    },
  })
}

describe('resolveInstallOrder', () => {
  it('keeps independent plugins in declaration order', () => {
    const order = resolveInstallOrder([recorder('a'), recorder('b'), recorder('c')])
    expect(order.map((p) => p.name)).toEqual(['a', 'b', 'c'])
  })

  it('places a dependency before its dependent', () => {
    const order = resolveInstallOrder([recorder('scenes', ['session']), recorder('session')])
    expect(order.map((p) => p.name)).toEqual(['session', 'scenes'])
  })

  it('resolves a transitive chain', () => {
    const order = resolveInstallOrder([recorder('c', ['b']), recorder('b', ['a']), recorder('a')])
    expect(order.map((p) => p.name)).toEqual(['a', 'b', 'c'])
  })

  it('resolves a diamond once', () => {
    const order = resolveInstallOrder([
      recorder('d', ['b', 'c']),
      recorder('b', ['a']),
      recorder('c', ['a']),
      recorder('a'),
    ])

    const names = order.map((p) => p.name)
    expect(names.filter((n) => n === 'a')).toHaveLength(1)
    expect(names.indexOf('a')).toBeLessThan(names.indexOf('b'))
    expect(names.indexOf('b')).toBeLessThan(names.indexOf('d'))
    expect(names.indexOf('c')).toBeLessThan(names.indexOf('d'))
  })

  it('rejects a duplicate name', () => {
    expect(() => resolveInstallOrder([recorder('session'), recorder('session')])).toThrow(
      PluginConflictError,
    )
  })

  it('rejects a missing dependency, naming both plugins', () => {
    expect(() => resolveInstallOrder([recorder('scenes', ['session'])])).toThrow(
      PluginDependencyError,
    )
    expect(() => resolveInstallOrder([recorder('scenes', ['session'])])).toThrow(/scenes/)
    expect(() => resolveInstallOrder([recorder('scenes', ['session'])])).toThrow(/session/)
  })

  it('rejects a cycle and reports the path', () => {
    // Reporting the path is the difference between a fixable error and a
    // stack overflow.
    expect(() => resolveInstallOrder([recorder('a', ['b']), recorder('b', ['a'])])).toThrow(
      PluginCycleError,
    )
    expect(() => resolveInstallOrder([recorder('a', ['b']), recorder('b', ['a'])])).toThrow(/->/)
  })

  it('rejects a self-dependency', () => {
    expect(() => resolveInstallOrder([recorder('a', ['a'])])).toThrow(PluginCycleError)
  })

  it('handles an empty list', () => {
    expect(resolveInstallOrder([])).toEqual([])
  })
})

describe('PluginRegistry', () => {
  it('installs queued plugins in dependency order', async () => {
    const registry = new PluginRegistry<Target>()
    const t = target()

    registry.add(recorder('scenes', ['session']))
    registry.add(recorder('session'))
    await registry.install(t)

    expect(t.installed).toEqual(['session', 'scenes'])
  })

  it('defers installation until install is called', async () => {
    // Installing eagerly would make ordering depend on registration order,
    // which is the problem topological resolution exists to remove.
    const install = vi.fn(() => 'value')
    const registry = new PluginRegistry<Target>()

    registry.add(definePlugin<string, string, Target>({ name: 'p', install }))
    expect(install).not.toHaveBeenCalled()

    await registry.install(target())
    expect(install).toHaveBeenCalledOnce()
  })

  it('records each contribution under its plugin name', async () => {
    const registry = new PluginRegistry<Target>()
    registry.add(recorder('a'))
    registry.add(recorder('b'))

    const results = await registry.install(target())

    expect(results).toEqual([
      { name: 'a', value: 'a-value' },
      { name: 'b', value: 'b-value' },
    ])
    expect(registry.get('a')).toBe('a-value')
  })

  it('awaits an asynchronous install', async () => {
    const registry = new PluginRegistry<Target>()
    registry.add(
      definePlugin<string, string, Target>({
        name: 'async',
        async install() {
          await new Promise((resolve) => setTimeout(resolve, 1))
          return 'resolved'
        },
      }),
    )

    await registry.install(target())

    expect(registry.get('async')).toBe('resolved')
  })

  it('rejects a duplicate at registration', () => {
    const registry = new PluginRegistry<Target>()
    registry.add(recorder('session'))

    expect(() => registry.add(recorder('session'))).toThrow(PluginConflictError)
  })

  it('rejects re-adding an already-installed plugin', async () => {
    const registry = new PluginRegistry<Target>()
    registry.add(recorder('session'))
    await registry.install(target())

    expect(() => registry.add(recorder('session'))).toThrow(PluginConflictError)
  })

  it('reports queued and installed plugins alike', async () => {
    const registry = new PluginRegistry<Target>()
    registry.add(recorder('a'))

    expect(registry.has('a')).toBe(true)
    expect(registry.has('missing')).toBe(false)

    await registry.install(target())
    expect(registry.has('a')).toBe(true)
  })

  it('lets a later plugin depend on an already-installed one', async () => {
    // Installing in several rounds must behave like installing in one.
    const registry = new PluginRegistry<Target>()
    const t = target()

    registry.add(recorder('session'))
    await registry.install(t)

    registry.add(recorder('scenes', ['session']))
    await registry.install(t)

    expect(t.installed).toEqual(['session', 'scenes'])
  })

  it('does not reinstall a plugin on a later round', async () => {
    const registry = new PluginRegistry<Target>()
    const t = target()

    registry.add(recorder('session'))
    await registry.install(t)
    registry.add(recorder('other'))
    await registry.install(t)

    expect(t.installed).toEqual(['session', 'other'])
  })

  it('reports installed names in installation order', async () => {
    const registry = new PluginRegistry<Target>()
    registry.add(recorder('b', ['a']))
    registry.add(recorder('a'))

    await registry.install(target())

    expect(registry.names).toEqual(['a', 'b'])
  })

  it('installs nothing when nothing is queued', async () => {
    expect(await new PluginRegistry<Target>().install(target())).toEqual([])
  })

  it('reports an install failure as the plugin’s, with its own error as the cause', async () => {
    const registry = new PluginRegistry<Target>()
    const cause = new Error('install failed')
    registry.add(
      definePlugin<string, never, Target>({
        name: 'broken',
        install() {
          throw cause
        },
      }),
    )

    const failure = await registry.install(target()).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(PluginInstallError)
    expect(failure).toMatchObject({ plugin: 'broken', cause, cleanup: [] })
    expect((failure as Error).message).toBe("plugin 'broken' failed to install")
  })
})

describe('a round that fails part-way', () => {
  /** A plugin whose install and dispose are recorded, and whose install may throw. */
  function tracked(
    name: string,
    trail: string[],
    options: { dependsOn?: readonly string[]; fails?: boolean; disposeFails?: boolean } = {},
  ) {
    return definePlugin<string, string, Target>({
      name,
      ...(options.dependsOn === undefined ? {} : { dependsOn: options.dependsOn }),
      install(t) {
        if (options.fails === true) throw new Error(`${name} cannot start`)
        t.installed.push(name)
        trail.push(`install ${name}`)
        return `${name}-connection`
      },
      dispose(value) {
        trail.push(`dispose ${value}`)
        if (options.disposeFails === true) throw new Error(`${name} would not close`)
      },
    })
  }

  it('disposes what the round installed, newest first, and records none of it', async () => {
    const trail: string[] = []
    const registry = new PluginRegistry<Target>()
    registry
      .add(tracked('db', trail))
      .add(tracked('cache', trail, { dependsOn: ['db'] }))
      .add(tracked('broken', trail, { dependsOn: ['cache'], fails: true }))

    await expect(registry.install(target())).rejects.toBeInstanceOf(PluginInstallError)

    expect(trail).toEqual([
      'install db',
      'install cache',
      'dispose cache-connection',
      'dispose db-connection',
    ])
    expect(registry.names).toEqual([])
    expect(registry.get('db')).toBeUndefined()
  })

  it('tries every disposal and keeps what they threw beside the failure', async () => {
    const trail: string[] = []
    const registry = new PluginRegistry<Target>()
    registry
      .add(tracked('a', trail, { disposeFails: true }))
      .add(tracked('b', trail))
      .add(tracked('c', trail, { fails: true }))

    const failure = (await registry
      .install(target())
      .catch((error: unknown) => error)) as InstanceType<typeof PluginInstallError>

    expect(trail).toEqual([
      'install a',
      'install b',
      'dispose b-connection',
      'dispose a-connection',
    ])
    expect(failure.plugin).toBe('c')
    expect((failure.cause as Error).message).toBe('c cannot start')
    expect(failure.cleanup.map((error) => (error as Error).message)).toEqual(['a would not close'])
    expect(failure.message).toMatch(/1 plugin\(s\) installed before it failed to clean up/)
  })

  it('stays failed: it neither installs again nor takes more plugins', async () => {
    const trail: string[] = []
    const registry = new PluginRegistry<Target>()
    registry.add(tracked('a', trail)).add(tracked('b', trail, { fails: true }))

    const first = await registry.install(target()).catch((error: unknown) => error)
    const second = await registry.install(target()).catch((error: unknown) => error)

    expect(second).toBe(first)
    expect(registry.failure).toBe(first)
    expect(trail.filter((entry) => entry.startsWith('install'))).toEqual(['install a'])
    expect(() => registry.add(tracked('c', trail))).toThrow(first as Error)
  })

  it('leaves plugins from an earlier round installed and undisposed', async () => {
    const trail: string[] = []
    const registry = new PluginRegistry<Target>()
    registry.add(tracked('early', trail))
    await registry.install(target())

    registry.add(tracked('late', trail, { dependsOn: ['early'], fails: true }))
    await expect(registry.install(target())).rejects.toBeInstanceOf(PluginInstallError)

    expect(trail).toEqual(['install early'])
    expect(registry.names).toEqual(['early'])
  })

  it('runs no install at all when the set cannot be ordered', async () => {
    const trail: string[] = []
    const registry = new PluginRegistry<Target>()
    registry.add(tracked('a', trail)).add(tracked('b', trail, { dependsOn: ['missing'] }))

    await expect(registry.install(target())).rejects.toBeInstanceOf(PluginDependencyError)
    expect(trail).toEqual([])
    expect(registry.failure).toBeUndefined()
  })
})
