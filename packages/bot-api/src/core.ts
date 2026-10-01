/**
 * `@yuigram/core`, resolved once for everything the main entry point loads.
 *
 * Node resolves an import by package name separately for every module that
 * writes one: a walk up the directory tree to a `node_modules`, the package's
 * export map, the real path behind a link. Fifty-odd modules on the main entry
 * points each doing that came to about a tenth of what `import 'yuigram'` costs
 * (`docs/performance.md` §2). A relative import is one file lookup, so the
 * modules loaded with the entry point take the core's values from here.
 *
 * Nothing else is added. This re-exports the core's main entry, which loading
 * the package loads anyway, and the values are the core's own — the same
 * classes, so `instanceof` holds across packages. Modules loaded later, `import
 * type` statements and the core's other entry points still name the package:
 * those cost nothing at startup. The `core-route` invariant keeps it that way.
 */

export * from '@yuigram/core'
