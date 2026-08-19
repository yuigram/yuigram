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

  it('propagates an install failure', async () => {
    const registry = new PluginRegistry<Target>()
    registry.add(
      definePlugin<string, never, Target>({
        name: 'broken',
        install() {
          throw new Error('install failed')
        },
      }),
    )

    await expect(registry.install(target())).rejects.toThrow('install failed')
  })
})
