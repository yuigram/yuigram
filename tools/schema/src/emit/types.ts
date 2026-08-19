/**
 * Emits the Bot API object types.
 *
 * Output is grouped by documentation section rather than by an invented
 * taxonomy, so the split stays stable as Telegram adds types and a reviewer can
 * predict which file a change lands in.
 *
 * Field names keep Telegram's `snake_case`. These types describe the wire
 * format and back the raw API surface, where mirroring the protocol exactly is
 * the whole point; friendlier shapes are the job of the layer above.
 */

import type { BotApiSchema, ObjectType, TypeRef } from '../bot-api/ir.js'
import { header, pascalCase, renderDoc, renderField, slug } from './render.js'

/** One emitted file. */
export interface EmittedFile {
  readonly path: string
  readonly contents: string
}

/** Render a single object as an interface or a union alias. */
function renderObject(object: ObjectType): string {
  const doc = renderDoc(object.description, object.documentationLink)

  // Abstract types are documented as "It should be one of" and carry no fields.
  if (object.subtypes !== undefined && object.subtypes.length > 0) {
    const members = [...object.subtypes].sort()
    return `${doc}export type ${object.name} =\n${members.map((name) => `  | ${name}`).join('\n')}\n`
  }

  if (object.fields.length === 0) {
    // A genuinely empty marker type. `Record<string, never>` would reject the
    // empty object Telegram actually sends, so an empty interface is correct.
    return `${doc}// biome-ignore lint/suspicious/noEmptyInterface: Telegram documents this type as carrying no fields\nexport interface ${object.name} {}\n`
  }

  const fields = object.fields.map((field) => renderField(field)).join('\n')
  return `${doc}export interface ${object.name} {\n${fields}}\n`
}

/**
 * Types Yuigram hand-writes instead of generating.
 *
 * `InputFile` is documented as an object with no fields — Telegram leaves its
 * shape to the client — so generating an empty interface for it would shadow
 * the real definition.
 */
export const HAND_WRITTEN = new Set(['InputFile'])

/** Group objects by documentation section, preserving declaration order. */
function groupObjects(objects: readonly ObjectType[]): Map<string, ObjectType[]> {
  const groups = new Map<string, ObjectType[]>()

  for (const object of objects) {
    if (HAND_WRITTEN.has(object.name)) continue
    const existing = groups.get(object.group)
    if (existing === undefined) {
      groups.set(object.group, [object])
    } else {
      existing.push(object)
    }
  }

  return groups
}

/** Every type name a set of objects refers to. */
function referencedNames(objects: readonly ObjectType[], known: ReadonlySet<string>): Set<string> {
  const names = new Set<string>()

  const walk = (type: TypeRef): void => {
    switch (type.kind) {
      case 'reference':
        if (known.has(type.name)) names.add(type.name)
        break
      case 'array':
        walk(type.of)
        break
      case 'union':
        for (const member of type.of) walk(member)
        break
      default:
        break
    }
  }

  for (const object of objects) {
    for (const field of object.fields) walk(field.type)
    for (const subtype of object.subtypes ?? []) {
      if (known.has(subtype)) names.add(subtype)
    }
  }

  return names
}

/** Emit every object type, split by section, plus a barrel re-export. */
export function emitTypes(schema: BotApiSchema): EmittedFile[] {
  const files: EmittedFile[] = []
  const groups = groupObjects(schema.objects)
  const moduleNames: string[] = []

  const known = new Set(
    schema.objects.map((object) => object.name).filter((name) => !HAND_WRITTEN.has(name)),
  )
  const groupOf = new Map(schema.objects.map((object) => [object.name, slug(object.group)]))

  for (const [group, objects] of groups) {
    const name = slug(group)
    moduleNames.push(name)

    const body = objects.map(renderObject).join('\n')

    // Types reference each other across sections, so each file imports what it
    // uses from the others. Type-only imports may be circular, which they
    // frequently are — Message and Chat refer to one another.
    const external = new Map<string, string[]>()
    for (const referenced of referencedNames(objects, known)) {
      const owner = groupOf.get(referenced)
      if (owner === undefined || owner === name) continue
      const bucket = external.get(owner)
      if (bucket === undefined) external.set(owner, [referenced])
      else bucket.push(referenced)
    }

    const importLines = [...external.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([owner, names]) => `import type { ${[...names].sort().join(', ')} } from './${owner}.js'`,
      )

    // `InputFile` is hand-written: it is the upload boundary, and its shape is
    // a framework decision rather than something the documentation specifies.
    if (/\bInputFile\b/.test(body)) {
      importLines.push("import type { InputFile } from '../../input-file.js'")
    }

    const imports = importLines.length > 0 ? `${importLines.join('\n')}\n\n` : ''

    files.push({
      path: `types/${name}.ts`,
      contents: `${header(schema.version, `Bot API types: ${group}`)}${imports}${body}`,
    })
  }

  const barrel = moduleNames
    .map((name) => `export type * from './${name}.js'`)
    .sort()
    .join('\n')

  files.push({
    path: 'types/index.ts',
    contents: `${header(schema.version, 'Bot API types')}${barrel}\n`,
  })

  return files
}

/** Emit the union of every object name, for reflection and testing. */
export function emitTypeNames(schema: BotApiSchema): EmittedFile {
  const names = schema.objects.map((object) => object.name).sort()
  const body = names.map((name) => `  | '${name}'`).join('\n')

  return {
    path: 'types/names.ts',
    contents: `${header(schema.version, 'Every Bot API type name')}export type BotApiTypeName =\n${body}\n`,
  }
}

/** Convenience: the PascalCase parameter interface name for a method. */
export function parameterTypeName(methodName: string): string {
  return `${pascalCase(methodName)}Params`
}
