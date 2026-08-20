/**
 * Emits the Bot API method surface.
 *
 * Two artifacts:
 *
 * - A parameter interface per method, so callers get named, documented options.
 * - One `ApiMethods` interface describing the callable surface.
 *
 * There is no generated *runtime*: dispatch is an eleven-line proxy, and these
 * types describe it. That is what makes a new Bot API method work the moment
 * the schema regenerates, with no per-method code to write.
 */

import type { BotApiSchema, Method } from '../bot-api/ir.js'
import { header, renderDoc, renderParameter, renderType, slug } from './render.js'
import type { EmittedFile } from './types.js'
import { HAND_WRITTEN, parameterTypeName } from './types.js'

/** Render the parameter interface for one method. */
function renderParams(method: Method): string {
  const name = parameterTypeName(method.name)
  const doc = renderDoc(`Parameters for \`${method.name}\`.`, method.documentationLink)

  if (method.parameters.length === 0) {
    return `${doc}// biome-ignore lint/suspicious/noEmptyInterface: this method takes no parameters\nexport interface ${name} {}\n`
  }

  const fields = method.parameters.map((parameter) => renderParameter(parameter)).join('\n')
  return `${doc}export interface ${name} {\n${fields}}\n`
}

/** Group methods by documentation section. */
function groupMethods(methods: readonly Method[]): Map<string, Method[]> {
  const groups = new Map<string, Method[]>()

  for (const method of methods) {
    const existing = groups.get(method.group)
    if (existing === undefined) {
      groups.set(method.group, [method])
    } else {
      existing.push(method)
    }
  }

  return groups
}

/**
 * Collect the type names referenced by a set of rendered types.
 *
 * Scoped to exactly what a file uses: a parameters file needs the parameter
 * types, and the callable surface needs the return types. Collecting both for
 * both leaves unused imports in generated output, which is noise a reader has
 * to disregard on every file.
 */
function referencedTypeNames(rendered: readonly string[], known: ReadonlySet<string>): string[] {
  const names = new Set<string>()

  for (const text of rendered) {
    for (const match of text.matchAll(/\b([A-Z][A-Za-z0-9]*)\b/g)) {
      const name = match[1]
      // Hand-written types come from their own module, not the generated barrel.
      if (name !== undefined && known.has(name) && !HAND_WRITTEN.has(name)) names.add(name)
    }
  }

  return [...names].sort()
}

/** Types appearing in a method's parameters. */
function parameterTypes(methods: readonly Method[]): string[] {
  return methods.flatMap((method) =>
    method.parameters.map((parameter) => renderType(parameter.type)),
  )
}

/** Types appearing in a method's return position. */
function returnTypes(methods: readonly Method[]): string[] {
  return methods.map((method) => renderType(method.returns))
}

/** Emit parameter interfaces, split by section, plus the callable surface. */
export function emitMethods(schema: BotApiSchema): EmittedFile[] {
  const files: EmittedFile[] = []
  const groups = groupMethods(schema.methods)
  const knownTypes = new Set(schema.objects.map((object) => object.name))
  const moduleNames: string[] = []

  for (const [group, methods] of groups) {
    const name = slug(group)
    moduleNames.push(name)

    const body = methods.map(renderParams).join('\n')
    const referenced = referencedTypeNames(parameterTypes(methods), knownTypes)

    const imports: string[] = []
    if (referenced.length > 0) {
      imports.push(`import type { ${referenced.join(', ')} } from '../types/index.js'`)
    }
    if (/\bInputFile\b/.test(body)) {
      imports.push("import type { InputFile } from '../../input-file.js'")
    }

    const importBlock = imports.length > 0 ? `${imports.join('\n')}\n\n` : ''

    files.push({
      path: `methods/${name}.ts`,
      contents: `${header(schema.version, `Bot API method parameters: ${group}`)}${importBlock}${body}`,
    })
  }

  const barrel = moduleNames
    .map((name) => `export type * from './${name}.js'`)
    .sort()
    .join('\n')

  files.push({
    path: 'methods/index.ts',
    contents: `${header(schema.version, 'Bot API method parameters')}${barrel}\n`,
  })

  files.push(emitApiSurface(schema))
  return files
}

/** Emit the interface describing every callable method. */
function emitApiSurface(schema: BotApiSchema): EmittedFile {
  const knownTypes = new Set(schema.objects.map((object) => object.name))
  const referenced = referencedTypeNames(returnTypes(schema.methods), knownTypes)

  const members = schema.methods
    .map((method) => {
      const doc = renderDoc(method.description, method.documentationLink, '  ')
      const params = parameterTypeName(method.name)
      const returns = renderType(method.returns)
      const optional = method.parameters.every((parameter) => !parameter.required) ? '?' : ''

      return `${doc}  ${method.name}(params${optional}: ${params}, options?: CallOptions): Promise<${returns}>\n`
    })
    .join('\n')

  const paramNames = schema.methods.map((method) => parameterTypeName(method.name)).sort()

  const imports = [
    `import type { CallOptions } from '../api-options.js'`,
    `import type { ${referenced.join(', ')} } from './types/index.js'`,
    `import type {\n${paramNames.map((name) => `  ${name},`).join('\n')}\n} from './methods/index.js'`,
  ].join('\n')

  const doc = renderDoc(
    'Every Bot API method, as a callable surface. Implemented by a proxy: there is no per-method runtime code, so a new method works as soon as the schema is regenerated.',
  )

  return {
    path: 'api.ts',
    contents: `${header(schema.version, 'Bot API callable surface')}${imports}\n\n${doc}export interface ApiMethods {\n${members}}\n`,
  }
}
